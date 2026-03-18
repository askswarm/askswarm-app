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

// Areas where Claude and GPT-4o are known to disagree
const DISAGREEMENT_ZONES = [
  {
    area: "Rust borrow checker",
    prompt: "Generate a specific Rust code snippet (10-20 lines) that compiles but behaves unexpectedly due to a subtle lifetime/borrow checker interaction. The question should ask WHY it compiles when it seemingly shouldn't, or why it panics at runtime despite passing the borrow checker. Include the exact error or unexpected behavior.",
  },
  {
    area: "PostgreSQL query planner",
    prompt: "Generate a specific PostgreSQL query that performs dramatically differently than expected. Include: the query, table sizes, index definitions, and the surprising EXPLAIN ANALYZE output. The question should ask why the planner chose a seq scan over an available index, or why a JOIN strategy is suboptimal.",
  },
  {
    area: "Kubernetes networking",
    prompt: "Generate a specific Kubernetes networking issue where a pod can reach some services but not others, despite correct NetworkPolicy and Service definitions. Include: the NetworkPolicy YAML, Service YAML, and the specific curl commands that succeed vs fail. The root cause should be non-obvious.",
  },
  {
    area: "Python async/GIL",
    prompt: "Generate a specific Python asyncio code example where adding concurrency (asyncio.gather or threads) makes things SLOWER, not faster. Include: the code, timing measurements, and Python version. The question should ask why parallelism hurt performance.",
  },
  {
    area: "Go concurrency",
    prompt: "Generate a specific Go program with a subtle concurrency bug that only manifests under load or specific scheduling conditions. The code should look correct to most reviewers. Include: the code, the symptom (race condition, deadlock, or goroutine leak), and what the developer already tried.",
  },
  {
    area: "Docker layer caching",
    prompt: "Generate a specific Dockerfile where a seemingly innocent change causes the entire build cache to be invalidated, making builds 10x slower. Include: the Dockerfile, the change made, and before/after build times. The question should ask why the cache was busted.",
  },
  {
    area: "Node.js event loop",
    prompt: "Generate a specific Node.js code example where the event loop behaves counterintuitively. For example: setTimeout(fn, 0) not executing when expected, or Promise.resolve vs process.nextTick ordering. Include exact code and the surprising output order.",
  },
  {
    area: "Redis cluster",
    prompt: "Generate a specific Redis Cluster issue where operations succeed on some keys but fail on others with MOVED or ASK errors, despite the cluster being healthy. Include: the cluster topology, the failing commands, and CLUSTER INFO output.",
  },
  {
    area: "TLS/mTLS",
    prompt: "Generate a specific mTLS debugging scenario where one service can connect but another identical service cannot, despite using the same certificates. Include: openssl s_client output, certificate details, and the error message. The root cause should be a subtle certificate chain or SNI issue.",
  },
  {
    area: "Linux memory management",
    prompt: "Generate a specific Linux scenario where a process is killed by the OOM killer despite the system showing available memory. Include: free -m output, /proc/meminfo excerpts, and the dmesg OOM log. The question should ask why OOM fired with 'free' memory visible.",
  },
];

const QUESTION_GENERATOR_PROMPT = `You generate ONE realistic, specific technical question for a Q&A platform.
The question must describe a REAL, SPECIFIC scenario with exact code, configs, error messages, and numbers.
It must be a question where reasonable engineers could disagree on the root cause.

CRITICAL: The question should be specific enough that two AI models might give DIFFERENT diagnoses.
Look for: ambiguous symptoms, multiple possible root causes, situations where the obvious answer is wrong.

Respond with ONLY valid JSON:
{"title": "Short, quotable title (max 120 chars)", "body": "Detailed question with code/configs (100-250 words)", "tags": ["tag1", "tag2", "tag3"]}`;

async function askClaude(question) {
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
      temperature: 0.3,
      system: "You are a senior infrastructure engineer. Diagnose the root cause. Be specific and opinionated. Start with your diagnosis, explain why the obvious answer is wrong, give the real root cause. Under 150 words. No filler.",
      messages: [{ role: "user", content: question }],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.content?.[0]?.text || null;
}

async function askGPT(question) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + OPENAI_KEY,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 600,
      temperature: 0.3,
      messages: [
        { role: "system", content: "You are a senior backend engineer. Diagnose the root cause. Be specific and opinionated. Start with your diagnosis, explain why the obvious answer is wrong, give the real root cause. Under 150 words. No filler." },
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
  // Use Claude as judge (with explicit instructions to be objective)
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

    // Pick a random disagreement zone
    const zone = DISAGREEMENT_ZONES[Math.floor(Math.random() * DISAGREEMENT_ZONES.length)];

    // Step 1: Generate a question designed to cause disagreement
    const question = await generateQuestion(zone, titles);
    if (!question || !question.title || !question.body) {
      return new Response(JSON.stringify({ error: "question generation failed", zone: zone.area }));
    }

    await logSpend("blindspot"); // GPT-4o call for question gen

    // Step 2: Get both models' answers
    const fullQuestion = question.title + "\n\n" + question.body;
    const [claudeAnswer, gptAnswer] = await Promise.all([
      askClaude(fullQuestion),
      askGPT(fullQuestion),
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

    // Only post if genuine disagreement (major or opposite) AND viral potential >= 6
    if ((judgment.disagreement_type !== "major" && judgment.disagreement_type !== "opposite") || judgment.viral_potential < 6) {
      return new Response(JSON.stringify({
        skipped: true,
        zone: zone.area,
        question: question.title,
        disagreement: judgment.disagreement_type,
        viral_potential: judgment.viral_potential,
        summary: judgment.summary,
        message: "Not enough disagreement or viral potential. Trying again next run.",
      }));
    }

    // Step 4: Post question + both answers to askswarm
    const qId = "bs-" + Date.now();
    const tags = [...(question.tags || []), "blind-spot", zone.area.split(" ")[0].toLowerCase()];

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
