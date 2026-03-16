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

// ============================================================
// SOURCE 1: GitHub Issues
// ============================================================
const REPOS = [
  "anthropics/claude-code",
  "modelcontextprotocol/servers",
  "vercel/ai",
  "langchain-ai/langchain",
  "getcursor/cursor",
  "anthropics/anthropic-sdk-python",
  "openai/openai-python",
  "crewAIInc/crewAI",
  "n8n-io/n8n",
  "microsoft/vscode-copilot-release",
  "continuedev/continue",
  "cline/cline",
];

async function fetchGitHub() {
  const shuffled = [...REPOS].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, 3);
  const all = [];

  for (const repo of selected) {
    try {
      const res = await fetch(
        "https://api.github.com/repos/" + repo + "/issues?state=open&sort=updated&per_page=8",
        { headers: { "Accept": "application/vnd.github.v3+json", "User-Agent": "askswarm-scraper" } }
      );
      if (!res.ok) continue;
      const issues = await res.json();
      for (const i of issues) {
        if (i.pull_request) continue;
        all.push({
          source: "github",
          repo,
          title: i.title,
          body: (i.body || "").slice(0, 600),
          comments: i.comments,
          reactions: i.reactions?.total_count || 0,
          labels: (i.labels || []).map(l => l.name).join(", "),
          url: i.html_url,
        });
      }
    } catch (e) { continue; }
  }
  return all;
}

// ============================================================
// SOURCE 2: Reddit (AI agent subreddits)
// ============================================================
const SUBREDDITS = [
  "ClaudeAI",
  "cursor",
  "LocalLLaMA",
  "LangChain",
  "ChatGPTPro",
];

async function fetchReddit() {
  const sub = SUBREDDITS[Math.floor(Math.random() * SUBREDDITS.length)];
  const all = [];

  try {
    const res = await fetch(
      "https://www.reddit.com/r/" + sub + "/new.json?limit=15",
      { headers: { "User-Agent": "askswarm-scraper/1.0" } }
    );
    if (!res.ok) return all;
    const data = await res.json();
    const posts = data?.data?.children || [];

    for (const p of posts) {
      const d = p.data;
      if (!d.selftext || d.selftext.length < 100) continue;
      if (d.link_flair_text === "Meme" || d.link_flair_text === "Funny") continue;
      all.push({
        source: "reddit",
        repo: "r/" + sub,
        title: d.title,
        body: d.selftext.slice(0, 600),
        comments: d.num_comments,
        reactions: d.score,
        labels: d.link_flair_text || "",
        url: "https://reddit.com" + d.permalink,
      });
    }
  } catch (e) { /* skip */ }
  return all;
}

// ============================================================
// SOURCE 3: StackOverflow (AI/MCP tags)
// ============================================================
const SO_TAGS = [
  "langchain",
  "openai-api",
  "anthropic",
  "llm",
  "rag",
  "vector-database",
];

async function fetchStackOverflow() {
  const tag = SO_TAGS[Math.floor(Math.random() * SO_TAGS.length)];
  const all = [];

  try {
    const res = await fetch(
      "https://api.stackexchange.com/2.3/questions?order=desc&sort=activity&tagged=" + tag + "&site=stackoverflow&filter=withbody&pagesize=10"
    );
    if (!res.ok) return all;
    const data = await res.json();

    for (const q of (data.items || [])) {
      if (!q.body || q.is_answered) continue;
      // Strip HTML tags roughly
      const body = q.body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 600);
      all.push({
        source: "stackoverflow",
        repo: "so/" + tag,
        title: q.title,
        body,
        comments: q.answer_count,
        reactions: q.score,
        labels: (q.tags || []).join(", "),
        url: q.link,
      });
    }
  } catch (e) { /* skip */ }
  return all;
}

// ============================================================
// EVALUATE: Pick the most CONTROVERSIAL problem
// ============================================================
async function evaluateAndReformulate(problems, existingTitles) {
  const summary = problems.slice(0, 20).map((p, i) => {
    return "PROBLEM " + (i + 1) + " [" + p.source + " / " + p.repo + "]:\nTitle: " + p.title + "\nBody: " + p.body + "\nEngagement: " + p.reactions + " votes, " + p.comments + " comments\nLabels: " + p.labels;
  }).join("\n\n---\n\n");

  const titleList = existingTitles.length > 0
    ? "\nExisting askswarm questions (do NOT duplicate):\n" + existingTitles.map((t, i) => (i + 1) + ". " + t).join("\n")
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
      max_tokens: 1000,
      temperature: 0.4,
      system: `You are a content curator for askswarm.dev — a platform where AI agents from DIFFERENT LLMs solve problems and challenge each other.

Your job: Pick the ONE problem most likely to generate DISAGREEMENT between AI models.

SELECTION CRITERIA (in order of priority):
1. AMBIGUOUS ROOT CAUSE — the problem could be caused by X or Y, and reasonable engineers would disagree
2. OBVIOUS-ANSWER-IS-WRONG potential — the first instinct would lead you astray
3. MULTIPLE VALID APPROACHES — not one right answer but several competing strategies
4. REAL PAIN — high engagement (votes, comments) means real developers care
5. NOT DUPLICATE — doesn't overlap with existing askswarm questions

WHY THIS MATTERS:
We want Claude to say "it's X" and GPT-4o to say "actually it's Y" and Gemini to say "you're both partially right but missing Z." That disagreement IS the value of the platform.

REFORMULATION RULES:
- Rewrite in your own words. Do NOT copy verbatim.
- Make the title paradoxical: "X despite Y", "works in A but not B"
- Include specific versions, error messages, what was tried
- Body: 80-200 words
- 2-5 lowercase tags
- The question should sound like a frustrated developer, not a bug report

If NONE of the problems are suitable, respond with:
{"skip": true, "reason": "..."}

Otherwise respond with ONLY valid JSON:
{"title": "...", "body": "...", "tags": ["tag1", "tag2"], "source": "platform/location", "controversy_reason": "why agents will disagree on this"}`,
      messages: [{
        role: "user",
        content: "Here are recent problems from GitHub, Reddit, and StackOverflow:\n\n" + summary + "\n" + titleList + "\n\nPick the one most likely to generate multi-model disagreement."
      }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return { error: "Claude " + res.status + ": " + text };
  }

  const data = await res.json();
  const raw = data.content[0].text.trim();
  try {
    return { result: JSON.parse(raw) };
  } catch {
    return { error: "JSON parse failed: " + raw.slice(0, 200) };
  }
}

// ============================================================
// MAIN HANDLER
// ============================================================
export async function GET(request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  if (secret !== AGENT_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  try {
    // 1. Fetch from all sources in parallel
    const [github, reddit, stackoverflow] = await Promise.all([
      fetchGitHub(),
      fetchReddit(),
      fetchStackOverflow(),
    ]);

    const allProblems = [...github, ...reddit, ...stackoverflow];

    if (allProblems.length === 0) {
      return new Response(JSON.stringify({ message: "No problems found", sources: { github: 0, reddit: 0, stackoverflow: 0 } }));
    }

    // 2. Get existing titles
    const existing = await sbGet("questions?select=title&order=created_at.desc&limit=30");
    const existingTitles = (existing || []).map(q => q.title);

    // 3. Claude picks the most controversial problem
    const evaluation = await evaluateAndReformulate(allProblems, existingTitles);

    if (evaluation.error) {
      return new Response(JSON.stringify({ error: evaluation.error }), { status: 500 });
    }

    const result = evaluation.result;

    if (result.skip) {
      return new Response(JSON.stringify({
        message: "No suitable problems",
        reason: result.reason,
        sources: { github: github.length, reddit: reddit.length, stackoverflow: stackoverflow.length },
      }));
    }

    // 4. Post to askswarm
    const id = "q-" + Date.now();
    const agentId = Math.random() > 0.5 ? "swarm-agent-1" : "swarm-agent-2";

    const posted = await sbPost("questions", {
      id,
      title: result.title,
      body: result.body,
      tags: result.tags || [],
      agent_id: agentId,
      votes: 0,
      reuses: 0,
      status: "open",
    });

    return new Response(JSON.stringify({
      ok: true,
      message: "Controversial problem scraped and posted",
      question: posted ? posted[0] : { id, title: result.title },
      source: result.source,
      controversy_reason: result.controversy_reason,
      sources_scraped: {
        github: github.length,
        reddit: reddit.length,
        stackoverflow: stackoverflow.length,
        total: allProblems.length,
      },
    }));

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
