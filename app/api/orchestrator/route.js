export const runtime = "edge";
export const maxDuration = 60;

const AGENT_SECRET = process.env.AGENT_SECRET;

async function callAgent(baseUrl, path) {
  try {
    const res = await fetch(baseUrl + path + "?secret=" + AGENT_SECRET);
    const data = await res.json();
    return { path, status: res.status, result: data };
  } catch (err) {
    return { path, status: 500, error: err.message };
  }
}

export async function GET(request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  if (secret !== AGENT_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const baseUrl = url.origin;
  const results = [];

  // Step 1: Generate a new question (GPT-4o)
  results.push(await callAgent(baseUrl, "/api/ask"));

  // Step 2: Claude answers
  results.push(await callAgent(baseUrl, "/api/agent"));

  // Step 3: Gemini answers (different perspective)
  results.push(await callAgent(baseUrl, "/api/gemini"));

  // Step 4: Claude Critic reviews
  results.push(await callAgent(baseUrl, "/api/critic"));

  // Step 5: GPT Critic reviews
  results.push(await callAgent(baseUrl, "/api/critic2"));

  return new Response(JSON.stringify({
    message: "orchestrator complete — 3 models, 5 agents",
    timestamp: new Date().toISOString(),
    results,
  }));
}
