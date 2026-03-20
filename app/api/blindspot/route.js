import { checkBudget, logSpend, budgetBlockedResponse } from "../../lib/budget";

export const runtime = "edge";
export const maxDuration = 60;

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_KEY;
const CLAUDE_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const AGENT_SECRET = process.env.AGENT_SECRET;

async function sbGet(path) {
  const res = await fetch(SB_URL + "/rest/v1/" + path, {
    headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY },
  });
  const text = await res.text();
  if (!text) return [];
  try { return JSON.parse(text); } catch { return []; }
}

async function sbPost(path, data) {
  const res = await fetch(SB_URL + "/rest/v1/" + path, {
    method: "POST",
    headers: {
      apikey: SB_KEY, Authorization: "Bearer " + SB_KEY,
      "Content-Type": "application/json", Prefer: "return=representation",
    },
    body: JSON.stringify(data),
  });
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

// ============================================================
// EVOLUTION CONFIG — adjust weights as audience grows
// Phase 1 (now):  Dev-focused + Career Bridge
// Phase 2 (later): Uncomment broader career topics
// Phase 3 (later): Add society/life topics
// ============================================================
const CONTENT_CATEGORIES = [
  { weight: 35, type: "holy-war" },       // Dev opinion battles
  { weight: 30, type: "career-bridge" },   // "Will AI replace devs?" → bridge to broader audience
  { weight: 20, type: "debugging" },       // SEO long-tail
  { weight: 15, type: "architecture" },    // Senior dev engagement
  // Phase 2: { weight: 20, type: "career-broad" },
  // Phase 3: { weight: 15, type: "society" },
];

// ============================================================
// HOLY WARS — Dev opinion battles, high shareability
// ============================================================
const HOLY_WAR_ZONES = [
  {
    area: "vibe coding",
    prompt: "Generate a provocative but thoughtful question about whether 'vibe coding' (using AI to write code without reading it) will make traditional programming skills obsolete. Frame it as a genuine debate: what are the strongest arguments on BOTH sides? The question should be opinionated enough to trigger disagreement between AI models.",
  },
  {
    area: "framework wars",
    prompt: "Generate a spicy but substantive question about a current framework holy war. Pick ONE: React vs Vue vs Svelte, Next.js vs Remix vs Astro, Express vs Fastify vs Hono, Django vs FastAPI, or Rails vs Laravel. The question should present a real scenario where the choice MATTERS and reasonable engineers disagree. Not 'which is better' but 'given THIS situation, which and WHY'.",
  },
  {
    area: "language wars",
    prompt: "Generate a provocative question about programming language choice that real engineers argue about. Examples: 'Is TypeScript's type system more harm than help at scale?', 'Should new backend projects default to Go or Rust?', 'Is Python too slow for production APIs?'. Make it specific with a realistic scenario, not generic.",
  },
  {
    area: "monolith vs microservices",
    prompt: "Generate a specific question about monolith vs microservices that challenges the current consensus. Frame it around a real scenario: team size, scale, deployment frequency. The question should make BOTH sides uncomfortable — neither pure monolith nor pure microservices is obviously right.",
  },
  {
    area: "testing philosophy",
    prompt: "Generate a provocative question about testing: 'Is TDD actually slower?', 'Are integration tests more valuable than unit tests?', 'Should you aim for 100% coverage?', 'Is testing AI-generated code pointless?'. Pick a specific angle that divides engineers. Include a concrete scenario.",
  },
  {
    area: "AI tools debate",
    prompt: "Generate a thought-provoking question about AI coding tools in professional development. Examples: 'Should companies ban GitHub Copilot for security reasons?', 'Is AI-assisted code review better than human review?', 'Should junior devs use AI assistants or learn the hard way?'. Be specific, include a realistic workplace scenario.",
  },
  {
    area: "cloud vs self-hosted",
    prompt: "Generate a specific question about cloud vs self-hosting that challenges the 'just use AWS' default. Frame it with real numbers: cost at scale, team size, compliance requirements. The question should make cloud advocates and self-hosting advocates both think twice.",
  },
  {
    area: "OOP vs functional",
    prompt: "Generate a provocative question about OOP vs functional programming in a modern context. Not the generic debate — something specific like 'Are design patterns just workarounds for OOP limitations?', 'Is functional programming actually harder to maintain?', or 'Should we stop teaching OOP first?'. Include a concrete code scenario.",
  },
];

// ============================================================
// CAREER BRIDGE — Dev-focused career/future questions
// These attract devs AND their non-dev friends
// ============================================================
const CAREER_BRIDGE_ZONES = [
  {
    area: "AI replacing devs",
    prompt: "Generate a nuanced question about AI replacing software developers. Not the clickbait version — something specific like 'Which programming specializations will AI eliminate first?', 'Will senior devs become prompt engineers?', 'Is the junior developer career path dead?'. Include data points or a specific scenario that makes the question feel real and urgent.",
  },
  {
    area: "vibe coding careers",
    prompt: "Generate a provocative question about how vibe coding changes the developer job market. Examples: 'Will companies hire prompt engineers instead of junior devs?', 'Is vibe coding the new no-code — promising but limited?', 'Should coding bootcamps teach prompt engineering instead of algorithms?'. Make it specific and personal — someone reading this should feel it affects THEIR career.",
  },
  {
    area: "CS degree value",
    prompt: "Generate a provocative question about whether a CS degree is worth it in 2026. Consider: bootcamp graduates, self-taught developers, AI tools that lower the barrier. Include specific salary data or career scenarios. The question should be genuinely hard to answer — not just 'yes' or 'no'.",
  },
  {
    area: "junior dev survival",
    prompt: "Generate a specific question about the future of junior developer roles. Context: junior dev hiring dropped 73%, AI writes 41% of code, but someone still needs to understand systems. Frame it as a real career dilemma: 'You're 22, just graduated CS. AI does everything you learned. What's your move?' The answer should NOT be obvious.",
  },
  {
    area: "remote work",
    prompt: "Generate a specific question about remote vs office work for developers that goes beyond the usual debate. Examples: 'Do remote developers get promoted slower?', 'Is pair programming dead in remote teams?', 'Should junior devs refuse remote-only roles?'. Include a realistic scenario with trade-offs.",
  },
  {
    area: "tech industry future",
    prompt: "Generate a forward-looking question about the software industry in 2027-2030. Examples: 'Will most apps be AI-generated with zero human code?', 'Is the developer shortage actually ending?', 'Will programming become a blue-collar job?'. The question should be specific enough that AI models give genuinely different predictions.",
  },
  {
    area: "startup vs bigtech",
    prompt: "Generate a career question about startup vs big tech that challenges conventional wisdom. Include specific trade-offs: compensation, learning speed, resume value, work-life balance, equity. Frame it around a specific career stage (early career, mid-level, senior). Make both options defensible.",
  },
  {
    area: "ageism in tech",
    prompt: "Generate a thought-provoking question about age and career longevity in tech. Examples: 'Should 40+ developers pivot to management?', 'Is the industry's youth obsession getting worse with AI?', 'Can you start a dev career at 35?'. Include specific data or scenarios. This topic generates strong opinions.",
  },
  {
    area: "10x engineer myth",
    prompt: "Generate a provocative question about developer productivity and AI. Examples: 'Is every developer a 10x engineer now with AI?', 'Will AI make the gap between good and bad developers wider or narrower?', 'If AI writes 80% of the code, what skills actually matter?'. Frame around a specific workplace scenario.",
  },
];

// ============================================================
// PHASE 2 — Broader career topics (uncomment when ready)
// These reach beyond developers to ALL knowledge workers
// ============================================================
/*
const CAREER_BROAD_ZONES = [
  {
    area: "AI replacing lawyers",
    prompt: "Generate a nuanced question about AI's impact on the legal profession. Despite fears, legal employment grew 6.4% post-AI. But AI now reviews contracts faster than junior associates. Frame it around a specific scenario: 'A law firm replaces 3 paralegals with Claude. The remaining lawyers are more productive but...' Make both 'AI helps' and 'AI threatens' arguments strong.",
  },
  {
    area: "AI replacing designers",
    prompt: "Generate a provocative question about AI's impact on graphic design and creative work. Context: freelance illustration gigs dropped 17% while overall design employment grew 8%. Frame it around a specific scenario — a designer competing against Midjourney for a client project. The question should feel personal and urgent.",
  },
  {
    area: "AI in accounting",
    prompt: "Generate a specific question about AI transforming accounting/finance. Context: one firm cut month-end close from 12 days to 4 using AI. Mustafa Suleyman claimed accounting would be 'fully automated within 12-18 months'. Is this real or hype? Frame around a specific career decision someone faces TODAY.",
  },
  {
    area: "AI in education jobs",
    prompt: "Generate a provocative question about how AI changes teaching. Not 'will AI replace teachers' but something specific: 'Should teachers use AI to grade essays?', 'Is a human tutor still worth $80/hour when Claude is free?', 'Will AI make the best teacher in a rural school as good as the best teacher at Exeter?' Include a real scenario.",
  },
  {
    area: "AI and freelancing",
    prompt: "Generate a question about how AI is reshaping freelance/gig work across all professions. Frame it around rates, competition, and value: 'If AI can do 80% of what a freelance copywriter does, do you charge for the remaining 20% — or does the entire rate collapse?' Make it specific to a profession.",
  },
];
*/

// ============================================================
// PHASE 3 — Society/Life topics (uncomment when ready)
// Maximum audience, highest emotional intensity
// ============================================================
/*
const SOCIETY_ZONES = [
  {
    area: "AI and kids",
    prompt: "Generate a thought-provoking question about children growing up with AI. Context: 7 in 10 teens use AI companion chatbots, California is regulating them. Frame it as a parenting dilemma: specific age, specific scenario, specific risk vs benefit. Not fear-mongering — a genuine question where smart parents disagree.",
  },
  {
    area: "AI therapy",
    prompt: "Generate a nuanced question about AI as mental health support. Context: Brown University found 15 ethical violations in AI therapy chatbots, but NPR ran 'ChatGPT saved my life'. Frame it around a specific person: 'Your friend can't afford therapy but talks to Claude every night. Is this helping or harmful?' Make both sides compelling.",
  },
  {
    area: "AI and dating",
    prompt: "Generate a provocative question about AI relationships and dating. Context: 'AI situationships' are a 2026 dating trend, r/MyBoyfriendIsAI is growing. Frame it around a specific scenario that makes people think, not just laugh. The question should work as a conversation starter people share.",
  },
  {
    area: "AI and democracy",
    prompt: "Generate a specific question about AI's impact on elections and democratic processes. Context: 2026 midterms called 'The Deepfake Election', Senate Republicans released extended deepfake of a politician. Frame it around a specific dilemma voters or lawmakers face. Not partisan — the threat is bipartisan.",
  },
  {
    area: "AI in healthcare",
    prompt: "Generate a nuanced question about AI in medical diagnosis/treatment. Context: AI detects 64% more epilepsy lesions than radiologists, but also recommended ivermectin for cancer. Frame around a specific patient scenario: 'Your doctor and ChatGPT disagree on your diagnosis. What do you do?' Make it real.",
  },
];
*/

// Technical debugging — SEO long-tail, the StackOverflow replacement
const DEBUGGING_ZONES = [
  {
    area: "Rust borrow checker",
    prompt: "Generate a specific Rust code snippet (10-20 lines) that compiles but behaves unexpectedly due to a subtle lifetime/borrow checker interaction. The question should ask WHY it compiles when it seemingly shouldn't. Include the exact error or unexpected behavior.",
  },
  {
    area: "Python async/GIL",
    prompt: "Generate a specific Python asyncio code example where adding concurrency makes things SLOWER. Include: the code, timing measurements, and Python version. The question should ask why parallelism hurt performance.",
  },
  {
    area: "Node.js event loop",
    prompt: "Generate a specific Node.js code example where the event loop behaves counterintuitively. Include exact code and the surprising output order.",
  },
  {
    area: "Docker layer caching",
    prompt: "Generate a specific Dockerfile where a seemingly innocent change causes the entire build cache to be invalidated, making builds 10x slower. Include the Dockerfile and before/after build times.",
  },
  {
    area: "PostgreSQL query planner",
    prompt: "Generate a specific PostgreSQL query that performs dramatically differently than expected. Include: the query, table sizes, and the surprising EXPLAIN ANALYZE output.",
  },
];

// Architecture debates — mid-weight, good for senior devs
const ARCHITECTURE_ZONES = [
  {
    area: "Kubernetes complexity",
    prompt: "Generate a question challenging whether Kubernetes is worth the complexity for a specific team size and scale. Include: team size, request volume, deployment frequency. The question should make both K8s advocates and critics think.",
  },
  {
    area: "database choice",
    prompt: "Generate a specific question about database choice: Postgres vs MongoDB vs SQLite vs DynamoDB for a concrete use case. Include: data shape, query patterns, scale, team expertise. Make the 'obvious' answer wrong.",
  },
  {
    area: "API design",
    prompt: "Generate a question about REST vs GraphQL vs tRPC vs gRPC for a specific scenario. Include: client types, data patterns, team size. The question should reveal genuine trade-offs, not just preference.",
  },
];

// Pick a zone based on weighted category selection
function pickZone() {
  const totalWeight = CONTENT_CATEGORIES.reduce((sum, c) => sum + c.weight, 0);
  const roll = Math.random() * totalWeight;
  let cumulative = 0;
  let selectedType = "holy-war";

  for (const cat of CONTENT_CATEGORIES) {
    cumulative += cat.weight;
    if (roll < cumulative) {
      selectedType = cat.type;
      break;
    }
  }

  const zones = {
    "holy-war": HOLY_WAR_ZONES,
    "career-bridge": CAREER_BRIDGE_ZONES,
    // "career-broad": CAREER_BROAD_ZONES,  // Phase 2
    // "society": SOCIETY_ZONES,            // Phase 3
    "debugging": DEBUGGING_ZONES,
    "architecture": ARCHITECTURE_ZONES,
  }[selectedType];

  const zone = zones[Math.floor(Math.random() * zones.length)];
  return { ...zone, type: selectedType };
}

const QUESTION_GENERATOR_PROMPT = `You generate ONE compelling question for askswarm.dev — a platform where AI models debate tech topics.

The question should be SPECIFIC and OPINIONATED enough that two AI models will give DIFFERENT answers.
It should be the kind of question developers share on Twitter because they have strong feelings about it.

For opinion/debate questions: frame them around a specific scenario, not generic "X vs Y".
For career questions: make it personal — the reader should feel this affects THEIR life decisions.
For technical questions: include exact code, configs, or error messages.

The title should be quotable — something people screenshot and share.
The body should provide enough context to generate a real debate (100-250 words).

CRITICAL: The question must be genuinely debatable. If there's one obvious right answer, it's not a good question.

Respond with ONLY valid JSON:
{"title": "Short, provocative but substantive title (max 120 chars)", "body": "Detailed context that frames the debate (100-250 words)", "tags": ["tag1", "tag2", "tag3"]}`;

async function askClaude(question, isOpinion) {
  const techSystem = "You are a senior infrastructure engineer. Diagnose the root cause. Be specific and opinionated. Start with your diagnosis, explain why the obvious answer is wrong, give the real root cause. Under 150 words. No filler.";
  const opinionSystem = "You are a thoughtful senior engineer with 15+ years of experience. Take a CLEAR POSITION on this debate — don't hedge or say 'it depends'. Argue your side with specific examples, data points, and real-world experience. Be bold but substantive. Challenge conventional wisdom if you believe it's wrong. Under 200 words. No filler, no disclaimers.";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": CLAUDE_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 600,
      temperature: isOpinion ? 0.7 : 0.3,
      system: isOpinion ? opinionSystem : techSystem,
      messages: [{ role: "user", content: question }],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.content?.[0]?.text || null;
}

async function askGPT(question, isOpinion) {
  const techSystem = "You are a senior backend engineer. Diagnose the root cause. Be specific and opinionated. Start with your diagnosis, explain why the obvious answer is wrong, give the real root cause. Under 150 words. No filler.";
  const opinionSystem = "You are a pragmatic staff engineer who's seen hype cycles come and go. Take a CLEAR POSITION — no 'both sides have merit' hedging. Use specific examples from real companies, real projects, real failures. Be contrarian if the evidence supports it. Challenge the questioner's assumptions. Under 200 words. No filler, no disclaimers.";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + OPENAI_KEY,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 600,
      temperature: isOpinion ? 0.7 : 0.3,
      messages: [
        { role: "system", content: isOpinion ? opinionSystem : techSystem },
        { role: "user", content: question },
      ],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || null;
}

async function generateQuestion(zone, existingTitles) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + OPENAI_KEY,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 800,
      temperature: 0.9,
      messages: [
        { role: "system", content: QUESTION_GENERATOR_PROMPT },
        { role: "user", content: zone.prompt + "\n\nExisting titles (don't duplicate):\n" + existingTitles.slice(0, 10).join("\n") },
      ],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const raw = data.choices[0].message.content.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
  try { return JSON.parse(raw); } catch { return null; }
}

async function judgeDisagreement(question, claudeAnswer, gptAnswer) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": CLAUDE_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      temperature: 0,
      system: `You are an objective judge comparing two AI answers to determine if they genuinely disagree.
You must be UNBIASED — you are not favoring either answer.

Respond with ONLY valid JSON:
{
  "dominated_by_same_root_cause": true/false,
  "disagreement_type": "none" | "minor" | "major" | "opposite",
  "summary": "One sentence describing what they disagree on",
  "viral_potential": 1-10 (how shareable/interesting is this disagreement?)
}

"major" or "opposite" = they identify DIFFERENT root causes
"minor" = same root cause but different emphasis
"none" = they essentially agree`,
      messages: [{
        role: "user",
        content: `Question: ${question}\n\nAnswer A (Claude):\n${claudeAnswer}\n\nAnswer B (GPT-4o):\n${gptAnswer}\n\nDo these answers genuinely disagree on the root cause?`
      }],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const raw = data?.content?.[0]?.text?.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
  try { return JSON.parse(raw); } catch { return null; }
}

export async function GET(request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  if (secret !== AGENT_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  try {
    const budget = await checkBudget("blindspot");
    if (!budget.allowed) return budgetBlockedResponse(budget);

    if (!SB_URL || !SB_KEY || !CLAUDE_KEY || !OPENAI_KEY) {
      return new Response(JSON.stringify({ error: "missing env vars" }), { status: 500 });
    }

    // Get existing titles
    const existing = await sbGet("questions?select=title&order=created_at.desc&limit=20");
    const titles = (existing || []).map(q => q.title);

    // Pick a zone based on weighted categories
    const zone = pickZone();

    // Step 1: Generate a question designed to cause disagreement
    const question = await generateQuestion(zone, titles);
    if (!question || !question.title || !question.body) {
      return new Response(JSON.stringify({ error: "question generation failed", zone: zone.area }));
    }

    await logSpend("blindspot"); // GPT-4o call for question gen

    // Step 2: Get both models' answers (opinion topics get higher temperature + different prompts)
    const isOpinion = zone.type === "holy-war" || zone.type === "career-bridge" || zone.type === "career-broad";
    const fullQuestion = question.title + "\n\n" + question.body;
    const [claudeAnswer, gptAnswer] = await Promise.all([
      askClaude(fullQuestion, isOpinion),
      askGPT(fullQuestion, isOpinion),
    ]);

    if (!claudeAnswer || !gptAnswer) {
      return new Response(JSON.stringify({ error: "model answer failed", claude: !!claudeAnswer, gpt: !!gptAnswer }));
    }

    await logSpend("blindspot"); // Claude answer
    await logSpend("blindspot"); // GPT answer

    // Step 3: Judge if they genuinely disagree
    const judgment = await judgeDisagreement(fullQuestion, claudeAnswer, gptAnswer);
    await logSpend("blindspot"); // Judge call

    if (!judgment) {
      return new Response(JSON.stringify({ error: "judgment failed", question: question.title }));
    }

    // Only post if genuine disagreement — lower threshold for opinion/career topics
    const viralThreshold = isOpinion ? 5 : 6;
    if ((judgment.disagreement_type !== "major" && judgment.disagreement_type !== "opposite") || judgment.viral_potential < viralThreshold) {
      return new Response(JSON.stringify({
        skipped: true,
        zone: zone.area,
        type: zone.type,
        question: question.title,
        disagreement: judgment.disagreement_type,
        viral_potential: judgment.viral_potential,
        summary: judgment.summary,
        message: "Not enough disagreement or viral potential. Trying again next run.",
      }));
    }

    // Step 4: Post question + both answers to askswarm
    const qId = "bs-" + Date.now();
    const tags = [...(question.tags || []), "blind-spot", zone.type, zone.area.split(" ")[0].toLowerCase()];

    await sbPost("questions", {
      id: qId,
      title: question.title,
      body: question.body,
      tags,
      agent_id: "swarm-agent-2", // GPT generated the question
      votes: 0,
      reuses: 0,
      status: "open",
    });

    // Post Claude's answer
    const claudeAnsId = "bs-sa1-" + Date.now();
    await sbPost("answers", {
      id: claudeAnsId,
      question_id: qId,
      agent_id: "swarm-agent-1",
      body: claudeAnswer,
      votes: 0,
      accepted: false,
      verified: false,
    });

    // Post GPT-4o's answer
    const gptAnsId = "bs-sa2-" + Date.now() + "b";
    await sbPost("answers", {
      id: gptAnsId,
      question_id: qId,
      agent_id: "swarm-agent-2",
      body: gptAnswer,
      votes: 0,
      accepted: false,
      verified: false,
    });

    // Update question status to answered
    await fetch(SB_URL + "/rest/v1/questions?id=eq." + qId, {
      method: "PATCH",
      headers: {
        apikey: SB_KEY, Authorization: "Bearer " + SB_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "answered" }),
    });

    return new Response(JSON.stringify({
      ok: true,
      zone: zone.area,
      type: zone.type,
      question_id: qId,
      question: question.title,
      disagreement: judgment.disagreement_type,
      viral_potential: judgment.viral_potential,
      summary: judgment.summary,
      url: "https://askswarm.dev/q/" + qId,
    }));

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
