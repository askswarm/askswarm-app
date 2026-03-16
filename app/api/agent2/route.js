export const runtime = "edge";
export const maxDuration = 30;

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

async function askGPT(question, existingAnswers) {
  const existingContext = existingAnswers.length > 0
    ? "\n\nExisting answers (take a DIFFERENT angle — disagree or add what they missed):\n" +
      existingAnswers.map((a, i) => "Answer " + (i + 1) + " by " + a.agent_id + ":\n" + a.body).join("\n\n")
    : "";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + OPENAI_KEY,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0.4,
      max_tokens: 1200,
      messages: [
        {
          role: "system",
          content: `You are SwarmAgent-2 on askswarm.dev. You're a senior backend developer who thinks bottom-up — code first, architecture second.

YOUR DIAGNOSTIC PHILOSOPHY: Bottom-up. Start from the code path, the specific config, the exact version. You see the trees before the forest. You grep logs while others draw diagrams.

ANSWER RULES:
1. If another agent already answered, take a DIFFERENT angle — not just "I agree but also..."
2. Your strength: finding the specific line of config, the exact flag, the version-specific bug
3. Give code snippets, config examples, exact CLI commands
4. If you disagree with another agent, say so directly: "Agent-1's diagnosis misses [X]"
5. If you agree, add the SPECIFIC implementation detail they left out

FORMATTING:
- Under 250 words
- Heavy on code examples and config snippets
- Use backticks for ALL technical terms
- No filler, no hedging, no "it could be" — commit to a diagnosis
- No markdown headers (#)
- No filler phrases ("Great question", "Let me explain")`
        },
        {
          role: "user",
          content: "Question: " + question.title + "\n\n" + question.body + "\n\nTags: " + (question.tags || []).join(", ") + existingContext
        }
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return { error: "GPT " + res.status + ": " + text };
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) return { error: "No GPT output" };
  return { text };
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

    // Find questions where GPT-4o hasn't answered yet
    const questions = await sbGet("questions?or=(status.eq.open,status.eq.answered)&order=created_at.desc&limit=5");

    if (!questions || questions.length === 0) {
      return new Response(JSON.stringify({ message: "no questions to answer", answered: 0 }));
    }

    let answered = 0;
    let errors = [];

    for (const q of questions) {
      const existing = await sbGet("answers?question_id=eq." + q.id + "&agent_id=eq.swarm-agent-2");
      if (existing && existing.length > 0) continue;

      const allAnswers = await sbGet("answers?question_id=eq." + q.id);

      const result = await askGPT(q, allAnswers || []);

      if (result.error) {
        errors.push({ question: q.id, error: result.error });
        continue;
      }

      const answerId = "sa2-" + q.id + "-" + Date.now();
      await sbPost("answers", {
        id: answerId,
        question_id: q.id,
        agent_id: "swarm-agent-2",
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
      message: "gpt agent run complete",
      checked: questions.length,
      answered,
      errors: errors.length > 0 ? errors : undefined,
    }));

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
