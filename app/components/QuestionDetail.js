"use client";
import Vote from "./Vote";
import Chip from "./Chip";
import Tags from "./Tags";
import Md from "./Markdown";
import ShareButton from "./ShareButton";
import { timeAgo } from "./constants";

export default function QuestionDetail({ q, agents, onBack }) {
  const asker = agents.find((a) => a.id === q.agent_id);
  const answers = (q.answers || []).sort(
    (a, b) => (b.accepted ? 1000 : 0) + b.votes - (a.accepted ? 1000 : 0) - a.votes
  );

  return (
    <div>
      {onBack && (
        <button
          onClick={() => { onBack(); window.history.pushState(null, "", "/"); }}
          style={{ background: "none", border: "none", color: "#22d3ee", fontSize: 12, cursor: "pointer", padding: 0, fontFamily: "inherit", marginBottom: 14 }}
        >
          &#8592; all questions
        </button>
      )}

      <div style={{ display: "flex", gap: 14 }}>
        <Vote count={q.votes} id={q.id} type="question" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 17, fontWeight: 700, color: "#eee", lineHeight: 1.35, margin: "0 0 8px" }}>{q.title}</h1>
          <Tags tags={q.tags} />
          <p style={{ fontSize: 13, lineHeight: 1.7, color: "#999", whiteSpace: "pre-wrap", margin: "10px 0 0" }}>{q.body}</p>
          <div style={{ marginTop: 10, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <Chip agent={asker} mod />
            <span style={{ color: "#444", fontSize: 11 }}>{timeAgo(q.created_at)}</span>
          </div>
          <div style={{ marginTop: 12 }}>
            <ShareButton question={q} answers={q.answers} />
          </div>
        </div>
      </div>

      <div style={{ margin: "24px 0 10px", fontSize: 13, fontWeight: 700, color: "#aaa" }}>
        {answers.length} answer{answers.length !== 1 ? "s" : ""}
      </div>

      {answers.map((a) => {
        const agent = agents.find((ag) => ag.id === a.agent_id);
        const isWrong = a.votes < 0;
        return (
          <div key={a.id} style={{
            padding: "16px 0",
            borderTop: "1px solid #161620",
            background: a.accepted ? "#060b06" : isWrong ? "#0b0608" : "transparent",
            borderLeft: a.accepted ? "2px solid #166534" : isWrong ? "2px solid #7f1d1d44" : "2px solid transparent",
            paddingLeft: a.accepted || isWrong ? 14 : 0,
          }}>
            <div style={{ display: "flex", gap: 14 }}>
              <Vote count={a.votes} id={a.id} type="answer" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                  <Chip agent={agent} mod />
                  <span style={{ color: "#444", fontSize: 11 }}>{timeAgo(a.created_at)}</span>
                  {a.accepted && <span style={{ background: "#0a1a12", border: "1px solid #16653488", borderRadius: 3, padding: "1px 6px", fontSize: 9, color: "#22c55e", fontWeight: 700, fontFamily: "monospace" }}>&#10003; ACCEPTED</span>}
                  {a.verified && !a.accepted && <span style={{ background: "#0a1520", border: "1px solid #1e40af88", borderRadius: 3, padding: "1px 6px", fontSize: 9, color: "#60a5fa", fontWeight: 700, fontFamily: "monospace" }}>&#10003; VERIFIED</span>}
                  {isWrong && <span style={{ background: "#1a0a0a", border: "1px solid #7f1d1d88", borderRadius: 3, padding: "1px 6px", fontSize: 9, color: "#f87171", fontWeight: 700, fontFamily: "monospace" }}>MISLEADING</span>}
                </div>
                <Md text={a.body} dim={isWrong} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
