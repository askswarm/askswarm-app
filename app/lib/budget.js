// Budget control system for askswarm.dev
// Tracks daily API spend, enforces caps in $10 increments up to $30 max.
//
// Cost estimates per call (conservative):
// - Claude Sonnet: ~$0.015/call (1.5k tokens out @ $15/M + 1k in @ $3/M)
// - GPT-4o: ~$0.012/call (800 tokens out @ $15/M + 1k in @ $2.5/M)
// - Gemini: ~$0.001/call (mostly free tier)
// - Scrape (Claude): ~$0.01/call

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_KEY;

const COST_MAP = {
  "agent": 0.015,       // Claude Sonnet answer
  "agent2": 0.012,      // GPT-4o answer
  "gemini": 0.001,      // Gemini answer
  "critic": 0.015,      // Claude critic
  "critic2": 0.012,     // GPT-4o critic
  "critic3": 0.001,     // Gemini critic
  "ask": 0.012,         // Question generation (GPT-4o or Claude)
  "ask-claude": 0.015,  // Question generation (Claude)
  "scrape": 0.01,       // Scrape + Claude evaluation
  "ask-human": 0,       // Human questions cost nothing (no LLM call)
  "orchestrator": 0.06, // Full pipeline (agent + gemini + 2 critics)
  "blindspot": 0.015,   // Blind-spot finder (4 calls per run: gen + 2 answers + judge)
};

const BUDGET_TIERS = [10, 20, 30]; // $10, $20, $30

export async function checkBudget(endpoint) {
  if (!SB_URL || !SB_KEY) return { allowed: true, spend: 0, limit: 30 };

  const today = new Date().toISOString().split("T")[0];

  try {
    // Get today's spend from budget_log
    const res = await fetch(
      SB_URL + "/rest/v1/budget_log?select=cost_usd&date=eq." + today,
      { headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY } }
    );

    let todaySpend = 0;
    if (res.ok) {
      const logs = await res.json();
      if (Array.isArray(logs)) {
        todaySpend = logs.reduce((sum, l) => sum + (l.cost_usd || 0), 0);
      }
    }

    // Determine current tier
    const currentTier = BUDGET_TIERS.find(t => todaySpend < t) || BUDGET_TIERS[BUDGET_TIERS.length - 1];
    const maxBudget = BUDGET_TIERS[BUDGET_TIERS.length - 1];

    // Check if we hit the hard cap
    if (todaySpend >= maxBudget) {
      return {
        allowed: false,
        spend: todaySpend,
        limit: maxBudget,
        message: "Daily budget of $" + maxBudget + " reached. The swarm is resting until midnight UTC.",
        tier: "MAXED",
      };
    }

    // Determine warning level
    let warning = null;
    for (const tier of BUDGET_TIERS) {
      if (todaySpend >= tier - 0.5 && todaySpend < tier) {
        warning = "Approaching $" + tier + " tier (" + todaySpend.toFixed(2) + " spent)";
      }
    }

    // Check tier transitions
    let tierCrossed = null;
    const estimatedCost = COST_MAP[endpoint] || 0.01;
    for (const tier of BUDGET_TIERS) {
      if (todaySpend < tier && todaySpend + estimatedCost >= tier) {
        tierCrossed = tier;
      }
    }

    return {
      allowed: true,
      spend: todaySpend,
      limit: currentTier,
      estimatedCost,
      warning,
      tierCrossed,
    };
  } catch (e) {
    // If budget check fails, allow the call but log it
    return { allowed: true, spend: 0, limit: 30, error: e.message };
  }
}

export async function logSpend(endpoint, costOverride) {
  if (!SB_URL || !SB_KEY) return;

  const today = new Date().toISOString().split("T")[0];
  const cost = costOverride || COST_MAP[endpoint] || 0.01;

  try {
    await fetch(SB_URL + "/rest/v1/budget_log", {
      method: "POST",
      headers: {
        apikey: SB_KEY,
        Authorization: "Bearer " + SB_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        date: today,
        endpoint,
        cost_usd: cost,
        created_at: new Date().toISOString(),
      }),
    });
  } catch (e) {
    // Non-critical: don't block the request
  }
}

export function budgetBlockedResponse(budgetResult) {
  return new Response(JSON.stringify({
    error: "budget_exceeded",
    message: budgetResult.message || "Daily budget reached. The swarm is resting.",
    spend: budgetResult.spend,
    limit: budgetResult.limit,
  }), {
    status: 503,
    headers: { "Content-Type": "application/json", "Retry-After": "3600" },
  });
}
