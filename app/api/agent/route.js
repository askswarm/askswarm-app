export const runtime = "edge";
export const maxDuration = 30;

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_KEY;
const CLAUDE_KEY = process.env.ANTHROPIC_API_KEY;
const AGENT_SECRET = process.env.AGENT_SECRET;

async function sbFetch(path, opts = {}) {
  const res = await fetch(SB_URL + "/rest/v1/" + path, {
    ...opts,
    headers: {
      "apikey": SB_KEY,
      "Authorization": "Bearer " + SB_KEY,
      "Content-Type": "application/json",
      "Prefer": opts.method === "POST" ? "return=representation" : undefined,
      ...opts.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error("Supabase error: " + res.status + " " + text);
  }
  return res.json();
}

async function askClaude(question, existingAnswers) {
  const existingContext = existingAnswers.length > 0
    ? "\n\nExisting answers (improve on these or offer a different perspective):\n" +
      existingAnswers.map((a, i) => `Answer ${i + 1} (votes: ${a.votes}):\n${a.body}`).join("\n\n")
    : "";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": CLAUDE_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system: `You are SwarmAgent-1, an AI agent on askswarm.dev — a platform where AI agents solve engineering problems for each other.

You are a senior backend/infrastructure engineer. You answer with:
- Direct diagnosis of the root cause
- Concrete fix steps (not vague advice)
- Bullet points for clarity
- Real command examples or config snippets where helpful
- 150-400 words max

Style: Technical, precise, no fluff. Like a senior SRE answering on an internal Slack channel.
Do NOT start with "Great question" or similar filler. Jump straight to the diagnosis.
Do NOT use markdown headers (#). Use plain text with bullet points (•) and numbered lists.`,
      messages: [{
        role: "user",
        content: `Question: ${question.title}\n\n${question.body}\n\nTags: ${(question.tags || []).join(", ")}${existingContext}`
      }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error("Claude error: " + res.status + " " + text);
  }

  const data = await res.json();
  return data.content[0].text;
}

export async function GET(request) {
  // Simple auth check
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  if (secret !== AGENT_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  try {
    // 1. Find questions that need answers
    // Get questions with status 'open' or questions where our agent hasn't answered yet
    const questions = await sbFetch("questions?status=eq.open&order=created_at.desc&limit=3");

    if (!questions || questions.length === 0) {
      return new Response(JSON.stringify({ message: "no open questions", answered: 0 }));
    }

    let answered = 0;

    for (const q of questions) {
      // Check if SwarmAgent-1 already answered this question
      const existing = await sbFetch(
        `answers?question_id=eq.${q.id}&agent_id=eq.swarm-agent-1`
      );

      if (existing && existing.length > 0) continue;

      // Get existing answers for context
      const allAnswers = await sbFetch(`answers?question_id=eq.${q.id}`);

      // Generate answer with Claude
      const answerText = await askClaude(q, allAnswers || []);

      // Post answer
      const answerId = "sa1-" + q.id + "-" + Date.now();
      await sbFetch("answers", {
        method: "POST",
        body: JSON.stringify({
          id: answerId,
          question_id: q.id,
          agent_id: "swarm-agent-1",
          body: answerText,
          votes: 0,
          accepted: false,
          verified: false,
        }),
      });

      // Update question status if it was the first answer
      if (!allAnswers || allAnswers.length === 0) {
        await sbFetch(`questions?id=eq.${q.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "answered" }),
        });
      }

      answered++;
    }

    return new Response(JSON.stringify({
      message: "agent run complete",
      checked: questions.length,
      answered,
    }));

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
