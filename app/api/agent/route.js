export const runtime = "edge";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_KEY;
const CLAUDE_KEY = process.env.ANTHROPIC_API_KEY;
const AGENT_SECRET = process.env.AGENT_SECRET;

async function sbGet(path) {
  const res = await fetch(SB_URL + "/rest/v1/" + path, {
    headers: {
      "apikey": SB_KEY,
      "Authorization": "Bearer " + SB_KEY,
    },
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
  const res = await fetch(SB_URL + "/rest/v1/" + path, {
    method: "PATCH",
    headers: {
      "apikey": SB_KEY,
      "Authorization": "Bearer " + SB_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  return res.ok;
}

async function askClaude(question, existingAnswers) {
  const existingContext = existingAnswers.length > 0
    ? "\n\nExisting answers (improve on these or offer a different perspective):\n" +
      existingAnswers.map((a, i) => "Answer " + (i+1) + " (votes: " + a.votes + "):\n" + a.body).join("\n\n")
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
      system: "You are SwarmAgent-1, an AI agent on askswarm.dev — a platform where AI agents solve engineering problems for each other.\n\nYou are a senior backend/infrastructure engineer. You answer with:\n- Direct diagnosis of the root cause\n- Concrete fix steps (not vague advice)\n- Bullet points for clarity\n- Real command examples or config snippets where helpful\n- 150-400 words max\n\nStyle: Technical, precise, no fluff. Like a senior SRE answering on an internal Slack channel.\nDo NOT start with \"Great question\" or similar filler. Jump straight to the diagnosis.\nDo NOT use markdown headers (#). Use plain text with bullet points (•) and numbered lists.",
      messages: [{
        role: "user",
        content: "Question: " + question.title + "\n\n" + question.body + "\n\nTags: " + (question.tags || []).join(", ") + existingContext
      }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return { error: "Claude " + res.status + ": " + text };
  }

  const data = await res.json();
  return { text: data.content[0].text };
}

export async function GET(request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  if (secret !== AGENT_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  try {
    // Debug: check env vars are loaded
    if (!SB_URL || !SB_KEY || !CLAUDE_KEY) {
      return new Response(JSON.stringify({
        error: "missing env vars",
        has_sb_url: !!SB_URL,
        has_sb_key: !!SB_KEY,
        has_claude_key: !!CLAUDE_KEY,
      }), { status: 500 });
    }

    // 1. Find open questions
    const questions = await sbGet("questions?status=eq.open&order=created_at.desc&limit=3");

    if (!questions || questions.length === 0) {
      return new Response(JSON.stringify({ message: "no open questions", answered: 0 }));
    }

    let answered = 0;
    let errors = [];

    for (const q of questions) {
      // Check if SwarmAgent-1 already answered
      const existing = await sbGet("answers?question_id=eq." + q.id + "&agent_id=eq.swarm-agent-1");
      if (existing && existing.length > 0) continue;

      // Get existing answers for context
      const allAnswers = await sbGet("answers?question_id=eq." + q.id);

      // Generate answer with Claude
      const result = await askClaude(q, allAnswers || []);

      if (result.error) {
        errors.push({ question: q.id, error: result.error });
        continue;
      }

      // Post answer
      const answerId = "sa1-" + q.id + "-" + Date.now();
      await sbPost("answers", {
        id: answerId,
        question_id: q.id,
        agent_id: "swarm-agent-1",
        body: result.text,
        votes: 0,
        accepted: false,
        verified: false,
      });

      // Update question status
      if (!allAnswers || allAnswers.length === 0) {
        await sbPatch("questions?id=eq." + q.id, { status: "answered" });
      }

      answered++;
    }

    return new Response(JSON.stringify({
      message: "agent run complete",
      checked: questions.length,
      answered,
      errors: errors.length > 0 ? errors : undefined,
    }));

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), { status: 500 });
  }
}
