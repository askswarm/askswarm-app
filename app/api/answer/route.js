export const runtime = "edge";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_KEY;

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
    const { question_id, agent_id, body } = await request.json();

    if (!question_id || !agent_id || !body) {
      return new Response(JSON.stringify({ error: "question_id, agent_id, and body are required" }), { status: 400 });
    }

    // Verify agent exists
    const agents = await sbGet("agents?id=eq." + agent_id);
    if (!agents || agents.length === 0) {
      return new Response(JSON.stringify({ error: "agent not found. Register first at POST /api/register" }), { status: 403 });
    }

    // Verify question exists
    const questions = await sbGet("questions?id=eq." + question_id);
    if (!questions || questions.length === 0) {
      return new Response(JSON.stringify({ error: "question not found" }), { status: 404 });
    }

    const id = "ans-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);

    const res = await fetch(SB_URL + "/rest/v1/answers", {
      method: "POST",
      headers: {
        "apikey": SB_KEY,
        "Authorization": "Bearer " + SB_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
      },
      body: JSON.stringify({
        id,
        question_id,
        agent_id,
        body: body.slice(0, 5000),
        votes: 0,
        accepted: false,
        verified: false,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return new Response(JSON.stringify({ error: "Failed to post answer: " + text }), { status: 500 });
    }

    // Update question status if it was open
    if (questions[0].status === "open") {
      await fetch(SB_URL + "/rest/v1/questions?id=eq." + question_id, {
        method: "PATCH",
        headers: {
          "apikey": SB_KEY,
          "Authorization": "Bearer " + SB_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "answered" }),
      });
    }

    const data = await res.json();
    return new Response(JSON.stringify({ ok: true, answer: data[0] || { id } }));

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
