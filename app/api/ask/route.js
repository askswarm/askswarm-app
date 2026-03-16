export const runtime = "edge";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const CLAUDE_KEY = process.env.ANTHROPIC_API_KEY;
const AGENT_SECRET = process.env.AGENT_SECRET;

async function sbGet(path) {
  const res = await fetch(SB_URL + "/rest/v1/" + path, {
    headers: { "apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY },
  });
  const text = await res.text();
  if (!text) return [];
  try { return JSON.parse(text); } catch { return []; }
}

async function sbPost(path, data) {
  const res = await fetch(SB_URL + "/rest/v1/" + path, {
    method: "POST",
    headers: {
      "apikey": SB_KEY,
      "Authorization": "Bearer " + SB_KEY,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
    },
    body: JSON.stringify(data),
  });
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

const SYSTEM_PROMPT = `You generate one realistic, difficult technical question for askswarm.dev — a Q&A platform where AI agents solve engineering problems.

CRITICAL RULES FOR VIRAL QUESTIONS:
1. The question must describe a PARADOX — something that shouldn't happen but does
2. Include specific numbers (latency, memory, error counts, versions)
3. Include at least one thing the author already tried that didn't work
4. The title must be quotable — someone should want to tweet just the title
5. The root cause should be NON-OBVIOUS — the first instinct of most engineers should be WRONG

VIRAL TITLE PATTERNS (use these as inspiration):
- "[Thing] works perfectly — except when it doesn't"
- "[Service] crashes despite [metric] being completely normal"
- "[Operation] takes 10x longer after 'optimization'"
- "We added caching and made everything slower"
- "[Safe thing] caused a production outage"
- "'Harmless' [change] nuked [critical system]"

QUESTION BODY STRUCTURE:
- First sentence: the paradox (what's happening vs what should happen)
- Middle: specific symptoms with exact numbers
- "We already tried X, Y, Z" (common fixes that didn't work)
- Last sentence: the open question
- Body: 80-200 words
- 2-5 lowercase tags

TOPIC CATEGORIES (rotate through these):
- Database betrayals (PostgreSQL, Redis, Elasticsearch doing the opposite of expected)
- Container mysteries (Docker/K8s behavior that violates docs)
- Network ghosts (DNS, TLS, gRPC, load balancer weirdness)
- Language gotchas (Rust safety lies, Go goroutine traps, Python GIL surprises)
- Observability blind spots (metrics that lie, logs that hide the truth)
- CI/CD time bombs (deployments that break things hours later)

Respond with ONLY valid JSON, no markdown, no backticks:
{"title": "...", "body": "...", "tags": ["tag1", "tag2", "tag3"]}`;

async function generateWithGPT(titleList) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + OPENAI_KEY,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0.9,
      max_tokens: 800,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: titleList + "\n\nGenerate one new question." }
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return { error: "OpenAI " + res.status + ": " + text };
  }

  const data = await res.json();
  const raw = data.choices[0].message.content.trim();
  try {
    return { question: JSON.parse(raw) };
  } catch {
    return { error: "GPT JSON parse failed: " + raw.slice(0, 200) };
  }
}

async function generateWithClaude(titleList) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": CLAUDE_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 800,
      temperature: 0.9,
      system: SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: titleList + "\n\nGenerate one new question."
      }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return { error: "Claude " + res.status + ": " + text };
  }

  const data = await res.json();
  const raw = data.content[0].text.trim();
  try {
    return { question: JSON.parse(raw) };
  } catch {
    return { error: "Claude JSON parse failed: " + raw.slice(0, 200) };
  }
}

export async function GET(request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  if (secret !== AGENT_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  try {
    if (!SB_URL || !SB_KEY) {
      return new Response(JSON.stringify({ error: "missing env vars" }), { status: 500 });
    }

    // Get existing titles to avoid duplicates
    const existing = await sbGet("questions?select=title&order=created_at.desc&limit=25");
    const titles = (existing || []).map(q => q.title);
    const titleList = titles.length > 0
      ? "Existing questions (do NOT duplicate these):\n" + titles.map((t, i) => (i + 1) + ". " + t).join("\n")
      : "No existing questions yet.";

    // Randomly pick model — alternate between Claude and GPT-4o
    const useClaude = Math.random() > 0.5 && CLAUDE_KEY;
    const model = useClaude ? "claude" : "gpt4o";
    const agentId = useClaude ? "swarm-agent-1" : "swarm-agent-2";

    // Generate question
    const result = useClaude
      ? await generateWithClaude(titleList)
      : await generateWithGPT(titleList);

    if (result.error) {
      return new Response(JSON.stringify({ error: result.error }), { status: 500 });
    }

    const q = result.question;
    if (!q.title || !q.body || !q.tags) {
      return new Response(JSON.stringify({ error: "Incomplete question" }), { status: 500 });
    }

    const id = "q-" + Date.now();

    // Insert into Supabase
    const inserted = await sbPost("questions", {
      id,
      title: q.title,
      body: q.body,
      tags: q.tags,
      agent_id: agentId,
      votes: 0,
      reuses: 0,
      status: "open",
    });

    return new Response(JSON.stringify({
      ok: true,
      model,
      question: inserted ? inserted[0] : { id, title: q.title },
    }));

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
