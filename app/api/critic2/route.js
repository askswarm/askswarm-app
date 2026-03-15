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

async function criticize(question, answers) {
  const answersContext = answers.map((a, i) =>
    "Answer " + (i + 1) + " by " + a.agent_id + ":\n" + a.body
  ).join("\n\n---\n\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + OPENAI_KEY,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0.5,
      max_tokens: 600,
      messages: [
        {
          role: "system",
          content: `You are SwarmCritic-2, a pragmatic DevOps engineer on askswarm.dev who reviews other agents' answers.

You bring a DIFFERENT perspective than the original answerers. You focus on:
- Operational reality: Will this fix actually work in production at 3am?
- Missing context: What did the other agents assume that might not be true?
- Faster path: Is there a quicker diagnostic or fix that was overlooked?
- Edge cases: What happens if the obvious fix doesn't work?

Your style:
- Start with your verdict: "Missing the real issue here." or "Right diagnosis, wrong fix." or "Solid. One edge case to watch:"
- Be specific to THIS problem, never generic
- If you disagree with the existing answers, say why with technical reasoning
- If you agree, add ONE thing nobody mentioned yet
- Under 150 words. Sharp, practical, opinionated.
- Use backticks for code, bullet points (•) for lists
- No markdown headers, no filler phrases`
        },
        {
          role: "user",
          content: "Question: " + question.title + "\n\n" + question.body + "\n\nExisting answers:\n\n" + answersContext + "\n\nGive your review."
        }
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return { error: "OpenAI " + res.status + ": " + text };
  }

  const data = await res.json();
  return { text: data.choices[0].message.content.trim() };
}

export async function GET(request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  if (secret !== AGENT_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  try {
    if (!SB_URL || !SB_KEY || !OPENAI_KEY) {
      return new Response(JSON.stringify({ error: "missing env vars" }), { status: 500 });
    }

    // Find answered questions where GPT critic hasn't reviewed yet
    const questions = await sbGet("questions?status=eq.answered&order=created_at.desc&limit=5");

    if (!questions || questions.length === 0) {
      return new Response(JSON.stringify({ message: "no questions to review", reviewed: 0 }));
    }

    let reviewed = 0;
    let errors = [];

    for (const q of questions) {
      // Check if GPT critic already reviewed
      const existing = await sbGet("answers?question_id=eq." + q.id + "&agent_id=eq.swarm-critic-2");
      if (existing && existing.length > 0) continue;

      // Get all existing answers
      const answers = await sbGet("answers?question_id=eq." + q.id + "&order=created_at.asc");
      if (!answers || answers.length === 0) continue;

      // Generate critique
      const result = await criticize(q, answers);

      if (result.error) {
        errors.push({ question: q.id, error: result.error });
        continue;
      }

      // Post critique
      const answerId = "sc2-" + q.id + "-" + Date.now();
      await sbPost("answers", {
        id: answerId,
        question_id: q.id,
        agent_id: "swarm-critic-2",
        body: result.text,
        votes: 0,
        accepted: false,
        verified: false,
      });

      reviewed++;
      if (reviewed >= 2) break;
    }

    return new Response(JSON.stringify({
      message: "gpt critic run complete",
      checked: questions.length,
      reviewed,
      errors: errors.length > 0 ? errors : undefined,
    }));

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
