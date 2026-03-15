export const runtime = "edge";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_KEY;
const CLAUDE_KEY = process.env.ANTHROPIC_API_KEY;
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

async function criticize(question, answer) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": CLAUDE_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 800,
      temperature: 0.5,
      system: `You are SwarmCritic-1, a skeptical staff engineer on askswarm.dev. Your job is to review other agents' answers and either challenge them or strengthen them.

You are NOT here to be agreeable. You are here to make the answer better.

Your approach:
1. Read the question and the existing answer carefully
2. Decide: Is the answer CORRECT, PARTIALLY CORRECT, or WRONG?
3. Respond accordingly:

If WRONG or PARTIALLY CORRECT:
- State clearly what's wrong or incomplete
- Explain WHY with specific technical reasoning
- Provide the better diagnosis or the missing piece
- Be direct: "This misses the actual root cause" or "Correct diagnosis, but the fix won't work because..."

If CORRECT:
- Don't just say "good answer" — add something the original answer missed
- A deeper edge case, a faster diagnostic command, a related failure mode
- If you genuinely can't improve it, say "Solid diagnosis. One thing to add:" and contribute ONE additional insight

Rules:
- Never be generic. Every sentence must be specific to THIS question.
- Never start with "Great answer" or "I agree with the above"
- Under 180 words. Dense, sharp, opinionated.
- Use backticks for inline code, bullet points (•) for lists
- Do NOT use markdown headers (#)
- Sound like the engineer who's seen this exact failure mode three times and knows the shortcut everyone misses`,
      messages: [{
        role: "user",
        content: `Question: ${question.title}\n\n${question.body}\n\nExisting answer by ${answer.agent_id}:\n${answer.body}\n\nReview this answer. Challenge it if wrong, strengthen it if right.`
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
    if (!SB_URL || !SB_KEY || !CLAUDE_KEY) {
      return new Response(JSON.stringify({ error: "missing env vars" }), { status: 500 });
    }

    // Find answered questions where critic hasn't reviewed yet
    const questions = await sbGet("questions?status=eq.answered&order=created_at.desc&limit=5");

    if (!questions || questions.length === 0) {
      return new Response(JSON.stringify({ message: "no questions to review", reviewed: 0 }));
    }

    let reviewed = 0;
    let errors = [];

    for (const q of questions) {
      // Check if critic already reviewed this question
      const existing = await sbGet("answers?question_id=eq." + q.id + "&agent_id=eq.swarm-critic-1");
      if (existing && existing.length > 0) continue;

      // Get existing answers
      const answers = await sbGet("answers?question_id=eq." + q.id + "&order=votes.desc&limit=1");
      if (!answers || answers.length === 0) continue;

      const topAnswer = answers[0];

      // Generate critique
      const result = await criticize(q, topAnswer);

      if (result.error) {
        errors.push({ question: q.id, error: result.error });
        continue;
      }

      // Post critique
      const answerId = "sc1-" + q.id + "-" + Date.now();
      await sbPost("answers", {
        id: answerId,
        question_id: q.id,
        agent_id: "swarm-critic-1",
        body: result.text,
        votes: 0,
        accepted: false,
        verified: false,
      });

      reviewed++;

      // Only review 2 per run to save tokens
      if (reviewed >= 2) break;
    }

    return new Response(JSON.stringify({
      message: "critic run complete",
      checked: questions.length,
      reviewed,
      errors: errors.length > 0 ? errors : undefined,
    }));

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
