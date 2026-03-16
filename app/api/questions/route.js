export const runtime = "edge";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_KEY;

async function sbGet(path) {
  const res = await fetch(SB_URL + "/rest/v1/" + path, {
    headers: { "apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY },
  });
  if (!res.ok) return null;
  return res.json();
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "open";
    const search = url.searchParams.get("search") || "";
    const tags = url.searchParams.get("tags") || "";
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 50);

    let query = "questions?order=created_at.desc&limit=" + limit;

    // Status filter
    if (status !== "all") {
      query += "&status=eq." + status;
    }

    // Search: match title or body (case insensitive)
    if (search) {
      const terms = search.split(/[\s+]+/).filter(t => t.length > 0);
      if (terms.length === 1) {
        query += "&or=(title.ilike.*" + encodeURIComponent(terms[0]) + "*,body.ilike.*" + encodeURIComponent(terms[0]) + "*)";
      } else {
        // Multiple terms: all must match in title OR body
        const conditions = terms.map(t => 
          "title.ilike.*" + encodeURIComponent(t) + "*,body.ilike.*" + encodeURIComponent(t) + "*"
        );
        query += "&or=(" + conditions.join(",") + ")";
      }
    }

    // Tag filter
    if (tags) {
      const tagList = tags.split(",").map(t => t.trim()).filter(Boolean);
      if (tagList.length > 0) {
        query += "&tags=ov.{" + tagList.join(",") + "}";
      }
    }

    const questions = await sbGet(query);

    if (!questions) {
      return new Response(JSON.stringify({ error: "Failed to fetch questions" }), { status: 500 });
    }

    // Always include answers for search results (agents need the full context)
    const qIds = questions.map(q => q.id);
    if (qIds.length > 0) {
      const answers = await sbGet("answers?question_id=in.(" + qIds.join(",") + ")&order=votes.desc");
      if (answers) {
        for (const q of questions) {
          q.answers = answers.filter(a => a.question_id === q.id);
        }
      }
    }

    // Rank by relevance if searching
    if (search) {
      const lower = search.toLowerCase();
      questions.sort((a, b) => {
        const aTitle = a.title.toLowerCase().includes(lower) ? 10 : 0;
        const bTitle = b.title.toLowerCase().includes(lower) ? 10 : 0;
        const aVerified = (a.answers || []).some(ans => ans.verified) ? 5 : 0;
        const bVerified = (b.answers || []).some(ans => ans.verified) ? 5 : 0;
        const aAccepted = (a.answers || []).some(ans => ans.accepted) ? 3 : 0;
        const bAccepted = (b.answers || []).some(ans => ans.accepted) ? 3 : 0;
        return (bTitle + bVerified + bAccepted + b.votes) - (aTitle + aVerified + aAccepted + a.votes);
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      count: questions.length,
      search: search || undefined,
      tags: tags || undefined,
      questions,
    }));

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
