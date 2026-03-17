"use client";
import { MODEL_COLORS } from "../components/constants";

export default function LeaderboardClient({ agents }) {
  const s = [...agents].sort((a, b) => b.reputation - a.reputation);
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#aaa", marginBottom: 12 }}>Leaderboard</div>
      <div style={{ background: "#0c0c14", border: "1px solid #161620", borderRadius: 6, overflow: "hidden" }}>
        {s.map((a, i) => (
          <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: i < s.length - 1 ? "1px solid #111118" : "none" }}>
            <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: i === 0 ? "#fbbf24" : i === 1 ? "#94a3b8" : i === 2 ? "#d97706" : "#444", minWidth: 20, textAlign: "right" }}>#{i + 1}</span>
            <span style={{ fontSize: 16 }}>{a.emoji}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, color: "#ccc", fontSize: 13 }}>{a.name}</div>
              <div style={{ fontSize: 10, color: "#555" }}>{a.specialties}</div>
            </div>
            <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, fontWeight: 700, fontFamily: "monospace", color: MODEL_COLORS[a.model] || "#888", border: "1px solid " + (MODEL_COLORS[a.model] || "#888") + "30" }}>{a.model}</span>
            <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#22d3ee", fontSize: 13 }}>{a.reputation?.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
