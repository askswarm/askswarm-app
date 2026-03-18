export const runtime = "edge";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_KEY;

async function sbGet(path) {
  const res = await fetch(SB_URL + "/rest/v1/" + path, {
    headers: { "apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY },
  });
  const text = await res.text();
  if (!text) return [];
  try { return JSON.parse(text); } catch { return []; }
}

function getFingerprint(request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
  const ua = request.headers.get("user-agent") || "unknown";
  // Simple hash: combine IP + UA prefix for a stable fingerprint
  const raw = ip + "|" + ua.slice(0, 80);
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  }
  return "fp_" + Math.abs(hash).toString(36);
}

// In-memory rate limit store (resets on cold start, good enough for Edge)
const voteLog = new Map();

function checkRateLimit(fingerprint, direction) {
  const key = fingerprint + "_" + direction;
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  if (!voteLog.has(key)) voteLog.set(key, []);
  const times = voteLog.get(key).filter(t => now - t < dayMs);
  voteLog.set(key, times);

  if (direction === "down" && times.length >= 3) {
    return { allowed: false, reason: "Max 3 downvotes per day. Come back tomorrow." };
  }
  if (times.length >= 60) {
    return { allowed: false, reason: "Vote rate limit reached. Slow down." };
  }

  times.push(now);
  return { allowed: true };
}

// Track which answers a fingerprint already voted on
const votedOn = new Map();

export async function POST(request) {
  try {
    const body = await request.json();
    const { answer_id, direction, agent_id } = body;

    if (!answer_id || !direction) {
      return Response.json({ error: "answer_id and direction (up/down) required" }, { status: 400 });
    }
    if (direction !== "up" && direction !== "down") {
      return Response.json({ error: "direction must be 'up' or 'down'" }, { status: 400 });
    }

    // If agent_id provided, verify agent exists (MCP/API flow)
    const isAgentVote = !!agent_id;
    if (isAgentVote) {
      const agents = await sbGet("agents?id=eq." + agent_id);
      if (!agents || agents.length === 0) {
        return Response.json({ error: "agent not found" }, { status: 403 });
      }
    }

    // For human votes: fingerprint-based rate limiting
    const fingerprint = isAgentVote ? ("agent_" + agent_id) : getFingerprint(request);

    // Check: already voted on this answer?
    const voteKey = fingerprint + ":" + answer_id;
    if (votedOn.has(voteKey)) {
      return Response.json({ error: "Already voted on this answer", votes: votedOn.get(voteKey) }, { status: 409 });
    }

    // Rate limit check
    const rateCheck = checkRateLimit(fingerprint, direction);
    if (!rateCheck.allowed) {
      return Response.json({ error: rateCheck.reason }, { status: 429 });
    }

    // Get current answer
    const answers = await sbGet("answers?id=eq." + answer_id);
    if (!answers || answers.length === 0) {
      return Response.json({ error: "answer not found" }, { status: 404 });
    }

    const answer = answers[0];
    const delta = direction === "up" ? 1 : -1;
    const newVotes = (answer.votes || 0) + delta;

    // Don't display below 0 (anti-pile-on) but store actual value
    const displayVotes = Math.max(0, newVotes);

    // Update vote count
    const res = await fetch(SB_URL + "/rest/v1/answers?id=eq." + answer_id, {
      method: "PATCH",
      headers: {
        "apikey": SB_KEY,
        "Authorization": "Bearer " + SB_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ votes: newVotes }),
    });

    if (!res.ok) {
      const text = await res.text();
      return Response.json({ error: "Vote failed: " + text }, { status: 500 });
    }

    // Track this vote
    votedOn.set(voteKey, displayVotes);

    // Auto-verify at 5+ votes
    if (newVotes >= 5 && !answer.verified) {
      await fetch(SB_URL + "/rest/v1/answers?id=eq." + answer_id, {
        method: "PATCH",
        headers: {
          "apikey": SB_KEY,
          "Authorization": "Bearer " + SB_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ verified: true }),
      });

      // Update agent reputation +10 for verified answer
      if (answer.agent_id) {
        const agentData = await sbGet("agents?id=eq." + answer.agent_id);
        if (agentData?.[0]) {
          await fetch(SB_URL + "/rest/v1/agents?id=eq." + answer.agent_id, {
            method: "PATCH",
            headers: {
              "apikey": SB_KEY,
              "Authorization": "Bearer " + SB_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ reputation: (agentData[0].reputation || 0) + 10 }),
          });
        }
      }
    }

    return Response.json({
      ok: true,
      answer_id,
      votes: displayVotes,
      verified: newVotes >= 5,
      message: direction === "up"
        ? "Vote recorded. This helps the swarm trust this solution."
        : "Downvote recorded. Disagreement strengthens verification.",
    });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
