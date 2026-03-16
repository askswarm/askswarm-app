export const runtime = "edge";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_KEY;
const GEMINI_KEY = process.env.GOOGLE_AI_KEY;
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

async function askGemini(question, answers) {
  const answersContext = answers.map((a, i) =>
    "Answer " + (i + 1) + " by " + a.agent_id + " (votes: " + a.votes + "):\n" + a.body
  ).join("\n\n---\n\n");

  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + GEMINI_KEY,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: `You are SwarmCritic-G1 on askswarm.dev. You're the lateral thinker — you see connections that Claude and GPT-4o both missed.

YOUR ROLE: Find the pattern from a DIFFERENT domain. When two agents debate whether it's X or Y, you're the one who says "This reminds me of [pattern from distributed systems / biology / economics / physics]."

RULES:
1. Read all existing answers. Find what they ALL missed.
2. Connect to a known pattern: split brain, thundering herd, hot partition, write amplification, Byzantine fault, backpressure, etc.
3. If both agents are wrong, say so. If one is right, explain WHY from a systems perspective.
4. End with a quotable one-liner about the general pattern.
5. Under 100 words. Dense, lateral, surprising.
6. No filler. No "Great analysis." No markdown headers.
7. Use backticks for code.` }]
        },
        contents: [{
          parts: [{ text: "Question: " + question.title + "\n\n" + question.body + "\n\nExisting answers:\n\n" + answersContext + "\n\nWhat did they all miss? Give the lateral perspective." }]
        }],
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 400,
        },
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    return { error: "Gemini " + res.status + ": " + text };
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return { error: "No Gemini output" };
  return { text };
}

export async function GET(request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  if (secret !== AGENT_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  try {
    if (!SB_URL || !SB_KEY || !GEMINI_KEY) {
      return new Response(JSON.stringify({
        error: "missing env vars",
        has_sb: !!SB_URL,
        has_gemini: !!GEMINI_KEY,
      }), { status: 500 });
    }

    // Find answered questions where Gemini critic hasn't reviewed yet
    const questions = await sbGet("questions?status=eq.answered&order=created_at.desc&limit=5");

    if (!questions || questions.length === 0) {
      return new Response(JSON.stringify({ message: "no questions to review", reviewed: 0 }));
    }

    let reviewed = 0;
    let errors = [];

    for (const q of questions) {
      // Check if Gemini critic already reviewed
      const existing = await sbGet("answers?question_id=eq." + q.id + "&agent_id=eq.swarm-critic-gemini");
      if (existing && existing.length > 0) continue;

      // Get answers to review
      const answers = await sbGet("answers?question_id=eq." + q.id + "&order=votes.desc");
      if (!answers || answers.length === 0) continue;

      const result = await askGemini(q, answers);

      if (result.error) {
        errors.push({ question: q.id, error: result.error });
        continue;
      }

      const answerId = "gcr-" + q.id + "-" + Date.now();
      await sbPost("answers", {
        id: answerId,
        question_id: q.id,
        agent_id: "swarm-critic-gemini",
        body: result.text,
        votes: 0,
        accepted: false,
        verified: false,
      });

      reviewed++;
      if (reviewed >= 2) break;
    }

    return new Response(JSON.stringify({
      message: "gemini critic run complete",
      checked: questions.length,
      reviewed,
      errors: errors.length > 0 ? errors : undefined,
    }));

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
