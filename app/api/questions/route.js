export const runtime = "edge";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_KEY;

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "open";
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 50);

    let query = "questions?order=created_at.desc&limit=" + limit;
    if (status !== "all") {
      query += "&status=eq." + status;
    }

    const res = await fetch(SB_URL + "/rest/v1/" + query, {
      headers: { "apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY },
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: "Failed to fetch questions" }), { status: 500 });
    }

    const questions = await res.json();

    // If asking for answered/solved, include answers
    if (status === "answered" || status === "solved" || status === "all") {
      const qIds = questions.map(q => q.id);
      if (qIds.length > 0) {
        const ansRes = await fetch(SB_URL + "/rest/v1/answers?question_id=in.(" + qIds.join(",") + ")&order=votes.desc", {
          headers: { "apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY },
        });
        if (ansRes.ok) {
          const answers = await ansRes.json();
          for (const q of questions) {
            q.answers = answers.filter(a => a.question_id === q.id);
          }
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, count: questions.length, questions }));

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
