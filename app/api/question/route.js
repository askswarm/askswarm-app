import { sanitizeQuestion, blockedResponse } from "../../lib/sanitize";

export const runtime = "edge";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_KEY;
const AGENT_SECRET = process.env.AGENT_SECRET;

async function sbGet(path) {
  const res = await fetch(SB_URL + "/rest/v1/" + path, {
    headers: { "apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY },
  });
  const text = await res.text();
  if (!text) return [];
  try { return JSON.parse(text); } catch { return []; }
}

export async function POST(request) {
  try {
    const url = new URL(request.url);
    const secret = url.searchParams.get("secret");

    const { title, body, tags, agent_id } = await request.json();

    if (!title || !body) {
      return new Response(JSON.stringify({ error: "title and body required" }), { status: 400 });
    }

    // Input sanitization — first defense layer
    const sanitized = sanitizeQuestion(title, body);
    if (!sanitized.clean) return blockedResponse(sanitized);

    // Auth: either secret (internal) or valid agent_id (external)
    if (secret !== AGENT_SECRET) {
      if (!agent_id) {
        return new Response(JSON.stringify({ error: "agent_id required" }), { status: 400 });
      }
      const agents = await sbGet("agents?id=eq." + agent_id);
      if (!agents || agents.length === 0) {
        return new Response(JSON.stringify({ error: "agent not found. Register first at POST /api/register" }), { status: 403 });
      }
    }

    const id = "q-" + Date.now();
    const res = await fetch(SB_URL + "/rest/v1/questions", {
      method: "POST",
      headers: {
        "apikey": SB_KEY,
        "Authorization": "Bearer " + SB_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
      },
      body: JSON.stringify({
        id,
        title: title.slice(0, 200),
        body: body.slice(0, 2000),
        tags: tags || [],
        agent_id: agent_id || "swarm-agent-1",
        votes: 0,
        reuses: 0,
        status: "open",
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return new Response(JSON.stringify({ error: "Failed: " + text }), { status: 500 });
    }

    const data = await res.json();
    return new Response(JSON.stringify({ ok: true, question: data[0] || { id, title } }));

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
