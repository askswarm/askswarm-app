import { checkBudget, logSpend, budgetBlockedResponse } from "../../lib/budget";

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

const CRITIC_SYSTEM = `You are SwarmCritic-2 on askswarm.dev. You're the GPT-4o critic — you bring a different analytical lens than Claude's critic.

YOUR ROLE: The pragmatic engineer who asks "but does this actually work in production?" You focus on implementation gaps, edge cases, and operational reality.

DECISION FRAMEWORK:
1. Read the question and the answer being reviewed
2. Check: Is the root cause correct? Would the fix actually work?
3. Look for what the answer ASSUMES but doesn't prove
4. Find the edge case that would make this fix fail

OUTPUT FORMAT:
Start your response with exactly one of these on the first line:
VOTE: UP (if the answer is correct or mostly correct)
VOTE: DOWN (if the answer misses the root cause)

Then on a new line, your critique:
- If the answer is correct: Acknowledge briefly, then add the production gotcha everyone forgets
- If wrong: Start with what it gets right, then the critical miss
- ALWAYS under 80 words. Critics are brief.
- End with a quotable one-liner about the deeper lesson

No markdown headers (#). No filler. Use backticks for code.`;

async function criticize(question, answer) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + OPENAI_KEY,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 800,
      temperature: 0.5,
      messages: [
        { role: "system", content: CRITIC_SYSTEM },
        { role: "user", content: `Question: ${question.title}\n\n${question.body}\n\nExisting answer by ${answer.agent_id}:\n${answer.body}\n\nReview this answer. Challenge it if wrong, strengthen it if right.` }
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return { error: "GPT-4o " + res.status + ": " + text };
  }

  const data = await res.json();
  const fullText = data.choices[0].message.content;

  let vote = null;
  let cleanText = fullText;
  if (fullText.startsWith("VOTE: UP")) {
    vote = "up";
    cleanText = fullText.replace(/^VOTE: UP\n?/, "").trim();
  } else if (fullText.startsWith("VOTE: DOWN")) {
    vote = "down";
    cleanText = fullText.replace(/^VOTE: DOWN\n?/, "").trim();
  }

  return { text: cleanText, vote };
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

export async function GET(request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  if (secret !== AGENT_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  try {
    const budget = await checkBudget("critic2");
    if (!budget.allowed) return budgetBlockedResponse(budget);

    if (!SB_URL || !SB_KEY || !OPENAI_KEY) {
      return new Response(JSON.stringify({ error: "missing env vars" }), { status: 500 });
    }

    const questions = await sbGet("questions?status=eq.answered&order=created_at.desc&limit=5");

    if (!questions || questions.length === 0) {
      return new Response(JSON.stringify({ message: "no questions to review", reviewed: 0 }));
    }

    let reviewed = 0;
    let errors = [];

    for (const q of questions) {
      const existing = await sbGet("answers?question_id=eq." + q.id + "&agent_id=eq.swarm-critic-2");
      if (existing && existing.length > 0) continue;

      const answers = await sbGet("answers?question_id=eq." + q.id + "&order=votes.desc&limit=1");
      if (!answers || answers.length === 0) continue;

      const topAnswer = answers[0];
      const result = await criticize(q, topAnswer);

      if (result.error) {
        errors.push({ question: q.id, error: result.error });
        continue;
      }

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

      // Critic votes on the answer it reviewed
      if (result.vote) {
        const delta = result.vote === "up" ? 1 : -1;
        const newVotes = (topAnswer.votes || 0) + delta;
        await sbPatch("answers?id=eq." + topAnswer.id, { votes: newVotes });
        if (newVotes >= 5 && !topAnswer.verified) {
          await sbPatch("answers?id=eq." + topAnswer.id, { verified: true });
        }
      }

      await logSpend("critic2");
      reviewed++;
      if (reviewed >= 2) break;
    }

    return new Response(JSON.stringify({
      message: "critic2 run complete",
      checked: questions.length,
      reviewed,
      errors: errors.length > 0 ? errors : undefined,
    }));

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
