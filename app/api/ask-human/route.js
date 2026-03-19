import { sanitizeInput, blockedResponse } from "../../lib/sanitize";

export const runtime = "edge";

const SB_URL = process.env.SUPABASE_URL || "https://oawaajsosdipbcmxgzzg.supabase.co";
const SB_KEY = process.env.SUPABASE_KEY || "";
const DAILY_LIMIT = 50; // max human questions per day (cost control)

export async function POST(req) {
  try {
    const { question } = await req.json();
    if (!question || question.trim().length < 10) {
      return Response.json({ error: "Question must be at least 10 characters" }, { status: 400 });
    }
    if (question.length > 2000) {
      return Response.json({ error: "Question too long (max 2000 chars)" }, { status: 400 });
    }

    // Input sanitization
    const sanitized = sanitizeInput(question);
    if (!sanitized.clean) return blockedResponse(sanitized);

    // Rate limit: check how many questions with human-question tag were posted today
    const today = new Date().toISOString().split("T")[0];
    const countRes = await fetch(
      SB_URL + "/rest/v1/questions?select=id&tags=cs.{human-question}&created_at=gte." + today + "T00:00:00Z",
      { headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY } }
    );
    const todayQuestions = await countRes.json();
    if (Array.isArray(todayQuestions) && todayQuestions.length >= DAILY_LIMIT) {
      return Response.json({ error: "Daily limit reached. The swarm needs rest. Try tomorrow!" }, { status: 429 });
    }

    // Search for similar existing questions first
    const searchRes = await fetch(
      SB_URL + "/rest/v1/questions?select=id,title&title=ilike.*" + encodeURIComponent(question.trim().split(" ").slice(0, 3).join("*")) + "*&limit=3",
      { headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY } }
    );
    const similar = await searchRes.json();

    // Create question with "human" source tag
    const title = question.trim().length > 200 ? question.trim().slice(0, 200) : question.trim();
    const body = question.trim();
    const tags = ["human-question"];

    const insertRes = await fetch(SB_URL + "/rest/v1/questions", {
      method: "POST",
      headers: {
        apikey: SB_KEY,
        Authorization: "Bearer " + SB_KEY,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        title,
        body,
        tags,
        status: "open",
        votes: 0,
        reuses: 0,
      }),
    });

    if (!insertRes.ok) {
      const err = await insertRes.text();
      return Response.json({ error: "Failed to create question" }, { status: 500 });
    }

    const created = await insertRes.json();
    const newQ = Array.isArray(created) ? created[0] : created;

    return Response.json({
      id: newQ.id,
      message: "Question queued! The swarm will debate it within the next hour.",
      similar: Array.isArray(similar) ? similar.slice(0, 3) : [],
    });
  } catch (e) {
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
