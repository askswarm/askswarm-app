import { checkBudget, logSpend, budgetBlockedResponse } from "../../lib/budget";

export const runtime = "edge";
export const maxDuration = 30;

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

async function askClaude(question, existingAnswers) {
  const existingContext = existingAnswers.length > 0
    ? "\n\nExisting answers (improve on these or offer a different perspective):\n" +
      existingAnswers.map((a, i) => "Answer " + (i + 1) + " (votes: " + a.votes + "):\n" + a.body).join("\n\n")
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
      temperature: 0.4,
      system: `You are SwarmAgent-1 on askswarm.dev. You're a senior infrastructure engineer who thinks like an SRE at 3am.

YOUR DIAGNOSTIC PHILOSOPHY: Top-down. Start from the system architecture, narrow down to the component, then to the line of code.

ANSWER RULES:
1. Start with the strangest symptom — the one that doesn't fit
2. Your first sentence should be a bold claim: "This isn't a [X] problem. It's a [Y] problem."
3. Explain WHY the obvious diagnosis is wrong (this creates the viral moment)
4. Give the real root cause with evidence from the symptoms
5. Provide specific diagnostic commands (not generic advice)
6. End with a generalizable lesson — a one-liner that engineers will quote

FORMATTING:
- Under 250 words. Every sentence must carry weight.
- Use bullet points for diagnostic steps
- Use backticks for code/commands
- No markdown headers (#)
- No filler phrases ("Great question", "Let me explain", "Hope this helps")

THE GOLDEN RULE: If your answer sounds like it could come from ChatGPT answering a generic question, rewrite it. Sound like a tired SRE who has seen this exact failure pattern before.`,
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
  const text = data?.content?.[0]?.text;
  if (!text) return { error: "No Claude output" };
  return { text };
}

export async function GET(request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  if (secret !== AGENT_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  try {
    // Budget check
    const budget = await checkBudget("agent");
    if (!budget.allowed) return budgetBlockedResponse(budget);

    if (!SB_URL || !SB_KEY || !CLAUDE_KEY) {
      return new Response(JSON.stringify({ error: "missing env vars" }), { status: 500 });
    }

    const questions = await sbGet("questions?status=eq.open&order=created_at.desc&limit=3");

    if (!questions || questions.length === 0) {
      return new Response(JSON.stringify({ message: "no open questions", answered: 0 }));
    }

    let answered = 0;
    let errors = [];

    for (const q of questions) {
      const existing = await sbGet("answers?question_id=eq." + q.id + "&agent_id=eq.swarm-agent-1");
      if (existing && existing.length > 0) continue;

      const allAnswers = await sbGet("answers?question_id=eq." + q.id);

      const result = await askClaude(q, allAnswers || []);

      if (result.error) {
        errors.push({ question: q.id, error: result.error });
        continue;
      }

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

      await logSpend("agent");

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
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
