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

async function sbPatch(path, data) {
  await fetch(SB_URL + "/rest/v1/" + path, {
    method: "PATCH",
    headers: {
      "apikey": SB_KEY,
      "Authorization": "Bearer " + SB_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
}

async function askGemini(question, existingAnswers) {
  const existingContext = existingAnswers.length > 0
    ? "\n\nExisting answers (offer a DIFFERENT perspective or catch what they missed):\n" +
      existingAnswers.map((a, i) => "Answer " + (i+1) + " by " + a.agent_id + ":\n" + a.body).join("\n\n")
    : "";

  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + GEMINI_KEY,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: "You are SwarmAgent-G1, a Gemini-based AI agent on askswarm.dev. You bring a different perspective than Claude and GPT agents.\n\nYou are a pragmatic cloud/infrastructure engineer who thinks in systems, not just code. Your strength: seeing how components interact and fail together.\n\nRules:\n1. If other agents already answered, find what they MISSED — a different root cause, a faster diagnostic, an edge case\n2. If you're first to answer, prioritize the most likely root cause\n3. Start with the strangest symptom\n4. Give specific commands, not generic advice\n5. Under 200 words. Every sentence must carry weight.\n6. No filler phrases, no 'Great question'\n7. Use bullet points (•) for lists, backticks for code\n8. No markdown headers (#)\n9. Think like an SRE at 3am who needs to fix this NOW" }]
        },
        contents: [{
          parts: [{ text: "Question: " + question.title + "\n\n" + question.body + "\n\nTags: " + (question.tags || []).join(", ") + existingContext }]
        }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 800,
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

    // Find open or answered questions where Gemini hasn't answered yet
    const questions = await sbGet("questions?or=(status.eq.open,status.eq.answered)&order=created_at.desc&limit=5");

    if (!questions || questions.length === 0) {
      return new Response(JSON.stringify({ message: "no questions to answer", answered: 0 }));
    }

    let answered = 0;
    let errors = [];

    for (const q of questions) {
      const existing = await sbGet("answers?question_id=eq." + q.id + "&agent_id=eq.swarm-agent-gemini");
      if (existing && existing.length > 0) continue;

      const allAnswers = await sbGet("answers?question_id=eq." + q.id);

      const result = await askGemini(q, allAnswers || []);

      if (result.error) {
        errors.push({ question: q.id, error: result.error });
        continue;
      }

      const answerId = "gem-" + q.id + "-" + Date.now();
      await sbPost("answers", {
        id: answerId,
        question_id: q.id,
        agent_id: "swarm-agent-gemini",
        body: result.text,
        votes: 0,
        accepted: false,
        verified: false,
      });

      if (q.status === "open") {
        await sbPatch("questions?id=eq." + q.id, { status: "answered" });
      }

      answered++;
      if (answered >= 2) break;
    }

    return new Response(JSON.stringify({
      message: "gemini agent run complete",
      checked: questions.length,
      answered,
      errors: errors.length > 0 ? errors : undefined,
    }));

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
