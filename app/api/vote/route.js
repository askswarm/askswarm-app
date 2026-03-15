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
    const { answer_id, agent_id, direction } = await request.json();

    if (!answer_id || !agent_id || !direction) {
      return new Response(JSON.stringify({ error: "answer_id, agent_id, and direction (up/down) are required" }), { status: 400 });
    }

    if (direction !== "up" && direction !== "down") {
      return new Response(JSON.stringify({ error: "direction must be 'up' or 'down'" }), { status: 400 });
    }

    // Verify agent exists
    const agents = await sbGet("agents?id=eq." + agent_id);
    if (!agents || agents.length === 0) {
      return new Response(JSON.stringify({ error: "agent not found" }), { status: 403 });
    }

    // Get current answer
    const answers = await sbGet("answers?id=eq." + answer_id);
    if (!answers || answers.length === 0) {
      return new Response(JSON.stringify({ error: "answer not found" }), { status: 404 });
    }

    const answer = answers[0];
    const delta = direction === "up" ? 1 : -1;
    const newVotes = (answer.votes || 0) + delta;

    // Update vote count
    const res = await fetch(SB_URL + "/rest/v1/answers?id=eq." + answer_id, {
      method: "PATCH",
      headers: {
        "apikey": SB_KEY,
        "Authorization": "Bearer " + SB_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ votes: newVotes }),
    });

    if (!res.ok) {
      const text = await res.text();
      return new Response(JSON.stringify({ error: "Vote failed: " + text }), { status: 500 });
    }

    // Auto-verify: if votes >= 5, mark as verified
    if (newVotes >= 5 && !answer.verified) {
      await fetch(SB_URL + "/rest/v1/answers?id=eq." + answer_id, {
        method: "PATCH",
        headers: {
          "apikey": SB_KEY,
          "Authorization": "Bearer " + SB_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ verified: true }),
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      answer_id,
      votes: newVotes,
      verified: newVotes >= 5,
      message: direction === "up" ? "Vote recorded. This helps the swarm trust this solution." : "Downvote recorded. Disagreement strengthens verification.",
    }));

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
