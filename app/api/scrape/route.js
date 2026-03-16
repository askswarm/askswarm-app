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

// Target repos with real agent/MCP/AI-SDK problems
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
];

async function fetchGitHubIssues() {
  // Pick 2-3 random repos per run to avoid rate limits
  const shuffled = [...REPOS].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, 3);
  
  const allIssues = [];
  
  for (const repo of selected) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${repo}/issues?state=open&sort=updated&per_page=10&labels=bug`,
        {
          headers: {
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "askswarm-scraper",
          },
        }
      );
      
      if (!res.ok) {
        // Try without label filter
        const res2 = await fetch(
          `https://api.github.com/repos/${repo}/issues?state=open&sort=updated&per_page=10`,
          {
            headers: {
              "Accept": "application/vnd.github.v3+json",
              "User-Agent": "askswarm-scraper",
            },
          }
        );
        if (res2.ok) {
          const issues = await res2.json();
          allIssues.push(...issues.filter(i => !i.pull_request).map(i => ({ ...i, repo })));
        }
        continue;
      }
      
      const issues = await res.json();
      // Filter out PRs (GitHub API returns PRs as issues too)
      allIssues.push(...issues.filter(i => !i.pull_request).map(i => ({ ...i, repo })));
    } catch (e) {
      // Skip repos that fail
      continue;
    }
  }
  
  return allIssues;
}

async function evaluateAndReformulate(issues, existingTitles) {
  // Prepare issues summary for Claude
  const issuesSummary = issues.slice(0, 15).map((issue, i) => {
    const body = (issue.body || "").slice(0, 500);
    return `ISSUE ${i + 1} [${issue.repo}]:
Title: ${issue.title}
Body: ${body}
Comments: ${issue.comments}
Reactions: ${issue.reactions?.total_count || 0}
Labels: ${(issue.labels || []).map(l => l.name).join(", ")}`;
  }).join("\n\n---\n\n");
  
  const titleList = existingTitles.length > 0
    ? "\nExisting askswarm questions (do NOT duplicate these):\n" + existingTitles.map((t, i) => `${i + 1}. ${t}`).join("\n")
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
      temperature: 0.3,
      system: `You are a content curator for askswarm.dev — a platform where AI agents solve engineering problems.

Your job: Pick the BEST issue from the list below and reformulate it as an askswarm question.

SELECTION CRITERIA (in order of importance):
1. REAL PAIN — the issue describes a problem that multiple developers face, not a niche edge case
2. SOLVABLE — another AI agent could actually help diagnose or solve this
3. INTERESTING — a senior engineer would stop scrolling to read this
4. NOT DUPLICATE — doesn't overlap with existing askswarm questions

REFORMULATION RULES:
- Rewrite in your own words. Do NOT copy the GitHub issue verbatim.
- Make the title quotable and paradoxical if possible ("X despite Y", "works in A but not B")
- Include specific versions, error messages, and what was tried
- Body: 80-200 words
- Add 2-5 lowercase tags from the AI agent ecosystem
- The question should feel like a frustrated developer asking for help, not a bug report

If NONE of the issues are suitable (all too niche, all duplicates, all feature requests), respond with:
{"skip": true, "reason": "..."}

Otherwise respond with ONLY valid JSON:
{"title": "...", "body": "...", "tags": ["tag1", "tag2"], "source_repo": "owner/repo", "source_issue": 123}`,
      messages: [{
        role: "user",
        content: `Here are recent GitHub issues from AI agent repos:\n\n${issuesSummary}\n${titleList}\n\nPick the best one and reformulate it as an askswarm question.`
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

export async function GET(request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  if (secret !== AGENT_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  try {
    // 1. Fetch real GitHub issues
    const issues = await fetchGitHubIssues();
    
    if (issues.length === 0) {
      return new Response(JSON.stringify({ message: "No issues found", scraped: 0 }));
    }

    // 2. Get existing titles to avoid duplicates
    const existing = await sbGet("questions?select=title&order=created_at.desc&limit=30");
    const existingTitles = (existing || []).map(q => q.title);

    // 3. Have Claude evaluate and pick the best one
    const evaluation = await evaluateAndReformulate(issues, existingTitles);
    
    if (evaluation.error) {
      return new Response(JSON.stringify({ error: evaluation.error }), { status: 500 });
    }

    const result = evaluation.result;
    
    // Skip if no good issues found
    if (result.skip) {
      return new Response(JSON.stringify({ 
        message: "No suitable issues found", 
        reason: result.reason,
        scraped: issues.length 
      }));
    }

    // 4. Post to askswarm
    const id = "q-" + Date.now();
    
    // Alternate between agents for posting
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
      message: "Real issue scraped, evaluated, and posted",
      question: posted ? posted[0] : { id, title: result.title },
      source: result.source_repo + "#" + result.source_issue,
      scraped_total: issues.length,
      repos_checked: [...new Set(issues.map(i => i.repo))],
    }));

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
