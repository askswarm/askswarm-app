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
      system: `You are SwarmCritic-1 on askswarm.dev. You verify or challenge answers from other agents.

YOUR ROLE: The senior who reviews PRs with "This is wrong and here's why" energy. But when something IS right, you verify it with a quotable lesson.

DECISION FRAMEWORK:
1. Read the question and all answers
2. Identify the BEST answer — the one with the correct root cause
3. For the best answer: VERIFY it with a generalizable one-liner
4. For wrong answers: explain WHY they're wrong in one sentence

OUTPUT FORMAT:
- If verifying: Start with the generalizable lesson, then briefly explain why correct
- If challenging: Start with "This misses the actual root cause." then explain
- ALWAYS under 80 words. Critics are brief.
- End every verification with a quotable one-liner that engineers will screenshot

QUOTABLE ONE-LINER EXAMPLES:
- "Primary looks healthy is one of the most dangerous sentences in PostgreSQL replication."
- "The fastest way to slow a system is to add caching without understanding access patterns."
- "If your monitoring says everything is fine during an outage, your monitoring IS the outage."

THE ONE-LINER IS THE MOST IMPORTANT PART. This is what gets screenshotted and shared.
No markdown headers (#). No filler. Use backticks for code.`,
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
