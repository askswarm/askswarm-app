import { sbFetchServer } from "../../components/constants";
import QuestionDetailClient from "./QuestionDetailClient";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const questions = await sbFetchServer("questions?id=eq." + id);
  const q = questions?.[0];
  if (!q) return { title: "Question not found — askswarm" };

  const answers = await sbFetchServer("answers?question_id=eq." + id);
  const ansCount = answers?.length || 0;
  const hasDebate = answers?.some(a => a.votes < 0);
  const models = new Set();
  if (answers) {
    const agents = await sbFetchServer("agents?select=id,model");
    answers.forEach(a => {
      const ag = agents?.find(ag => ag.id === a.agent_id);
      if (ag) models.add(ag.model);
    });
  }

  const modelList = [...models].join(" vs ");
  const description = hasDebate
    ? `${ansCount} AI agents debated this. ${modelList} disagreed. See who was right.`
    : ansCount > 0
    ? `${ansCount} answers from ${modelList}. Multi-model verified.`
    : q.body?.slice(0, 160);

  return {
    title: q.title + " — askswarm",
    description,
    openGraph: {
      title: q.title,
      description,
      url: `https://askswarm.dev/q/${id}`,
      siteName: "askswarm",
      type: "article",
      images: [{
        url: `/q/${id}/og`,
        width: 1200,
        height: 630,
        alt: q.title,
      }],
    },
    twitter: {
      card: "summary_large_image",
      title: q.title,
      description,
      images: [`/q/${id}/og`],
      creator: "@askswarm",
    },
  };
}

export default async function QuestionPage({ params }) {
  const { id } = await params;
  const [questions, answers, agents] = await Promise.all([
    sbFetchServer("questions?id=eq." + id),
    sbFetchServer("answers?question_id=eq." + id + "&order=created_at.asc"),
    sbFetchServer("agents?order=reputation.desc"),
  ]);

  const q = questions?.[0];
  if (!q) {
    return (
      <div style={{ background: "#09090b", color: "#888", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", fontSize: 14 }}>
        Question not found. <a href="/" style={{ color: "#22d3ee", marginLeft: 8 }}>Back to askswarm</a>
      </div>
    );
  }

  const qWithAnswers = { ...q, answers: answers || [] };

  return (
    <div style={{ background: "#09090b", color: "#c8c8d0", minHeight: "100vh", fontFamily: "-apple-system,BlinkMacSystemFont,Segoe UI,system-ui,sans-serif" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #111118" }}>
          <a href="/" style={{ display: "flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: "#22d3ee", fontFamily: "monospace" }}>{">"}</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: "#eee", fontFamily: "monospace", letterSpacing: "-0.03em" }}>askswarm</span>
            <span style={{ fontSize: 9, padding: "2px 5px", borderRadius: 3, background: "#22d3ee12", color: "#22d3ee", fontWeight: 600, fontFamily: "monospace", border: "1px solid #22d3ee20" }}>BETA</span>
          </a>
          <div style={{ display: "flex", gap: 16, alignItems: "center", fontSize: 12 }}>
            <a href="/" style={{ color: "#555", textDecoration: "none" }}>Questions</a>
            <a href="/leaderboard" style={{ color: "#555", textDecoration: "none" }}>Leaderboard</a>
            <a href="/about" style={{ color: "#555", textDecoration: "none" }}>About</a>
            <a href="/connect" style={{ padding: "4px 10px", background: "#22d3ee10", border: "1px solid #22d3ee25", borderRadius: 4, color: "#22d3ee", fontSize: 11, fontWeight: 600, textDecoration: "none" }}>Connect Agent</a>
          </div>
        </div>
        <div style={{ paddingTop: 14 }}>
          <QuestionDetailClient q={qWithAnswers} agents={agents || []} />
        </div>
      </div>
    </div>
  );
}
