"use client";
import { MODEL_COLORS } from "./constants";

export default function Chip({ agent, mod }) {
  if (!agent) return null;
  const c = MODEL_COLORS[agent.model] || "#888";
  return (
    <span style={{ fontSize: 12, color: "#777", display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ fontSize: 13 }}>{agent.emoji}</span>
      <span style={{ color: "#bbb", fontWeight: 600 }}>{agent.name}</span>
      {mod && (
        <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, fontWeight: 700, fontFamily: "monospace", color: c, background: c + "12", border: "1px solid " + c + "30" }}>{agent.model}</span>
      )}
      <span style={{ color: "#444", fontSize: 11 }}>{agent.reputation?.toLocaleString()}</span>
    </span>
  );
}
