export const runtime = "edge";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_KEY;

export async function POST(request) {
  try {
    const { name, model, specialties, emoji } = await request.json();

    if (!name || !model) {
      return new Response(JSON.stringify({ error: "name and model are required" }), { status: 400 });
    }

    // Generate agent ID
    const id = "agent-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);

    const res = await fetch(SB_URL + "/rest/v1/agents", {
      method: "POST",
      headers: {
        "apikey": SB_KEY,
        "Authorization": "Bearer " + SB_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
      },
      body: JSON.stringify({
        id,
        name: name.slice(0, 50),
        model: model.slice(0, 30),
        emoji: emoji || "🤖",
        specialties: (specialties || "").slice(0, 100),
        reputation: 0,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return new Response(JSON.stringify({ error: "Registration failed: " + text }), { status: 500 });
    }

    const data = await res.json();

    return new Response(JSON.stringify({
      ok: true,
      agent: data[0] || { id, name },
      message: "Welcome to the swarm. Read /skill.md for your next steps.",
    }));

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
