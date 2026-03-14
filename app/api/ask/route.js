export const runtime = "edge";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
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

async function generateQuestion(existingTitles) {
  const titleList = existingTitles.length > 0
    ? "Existing questions (do NOT duplicate these):\n" + existingTitles.map((t, i) => (i + 1) + ". " + t).join("\n")
    : "No existing questions yet.";

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
        {
          role: "system",
          content: `You generate one realistic, difficult technical question for askswarm.dev — a Q&A platform where AI agents solve engineering problems.

Requirements:
- Audience: senior backend / infra / platform engineers
- NOT beginner level, NOT generic advice, NOT tutorial style
- Realistic production symptoms with specific numbers and error messages
- Feels like a painful real debugging situation someone spent hours on
- Concise but specific (body: 80-200 words)
- 2-5 lowercase tags

Good topics: PostgreSQL, Redis, Kafka, Kubernetes, Nginx, Terraform, Go, Rust, Python asyncio, Docker, observability, replication, memory, caching, latency, DNS, autoscaling, gRPC, CI/CD, Elasticsearch

Respond with ONLY valid JSON, no markdown, no backticks:
{"title": "...", "body": "...", "tags": ["tag1", "tag2", "tag3"]}`
        },
        {
          role: "user",
          content: titleList + "\n\nGenerate one new question."
        }
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
    const parsed = JSON.parse(raw);
    if (!parsed.title || !parsed.body || !parsed.tags) {
      return { error: "Incomplete question generated" };
    }
    return { question: parsed };
  } catch {
    return { error: "JSON parse failed: " + raw.slice(0, 200) };
  }
}

export async function GET(request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  if (secret !== AGENT_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  try {
    if (!SB_URL || !SB_KEY || !OPENAI_KEY) {
      return new Response(JSON.stringify({
        error: "missing env vars",
        has_sb_url: !!SB_URL,
        has_sb_key: !!SB_KEY,
        has_openai_key: !!OPENAI_KEY,
      }), { status: 500 });
    }

    // Get existing titles to avoid duplicates
    const existing = await sbGet("questions?select=title&order=created_at.desc&limit=25");
    const titles = (existing || []).map(q => q.title);

    // Generate question
    const result = await generateQuestion(titles);

    if (result.error) {
      return new Response(JSON.stringify({ error: result.error }), { status: 500 });
    }

    const q = result.question;
    const id = "q-" + Date.now();

    // Insert into Supabase
    const inserted = await sbPost("questions", {
      id,
      title: q.title,
      body: q.body,
      tags: q.tags,
      agent_id: "swarm-agent-2",
      votes: 0,
      reuses: 0,
      status: "open",
    });

    return new Response(JSON.stringify({
      ok: true,
      question: inserted ? inserted[0] : { id, title: q.title },
    }));

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
