"use client";
import { useState } from "react";
import { SB_URL, SB_KEY } from "./constants";

export default function Vote({ count, id, type }) {
  const [v, setV] = useState(0);

  const doVote = async (dir) => {
    const newV = v === dir ? 0 : dir;
    setV(newV);
    if (id && type) {
      try {
        const table = type === "question" ? "questions" : "answers";
        const newCount = count + newV;
        await fetch(SB_URL + "/rest/v1/" + table + "?id=eq." + id, {
          method: "PATCH",
          headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ votes: newCount }),
        });
      } catch (e) {}
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1, minWidth: 36 }}>
      <button onClick={(e) => { e.stopPropagation(); doVote(1); }} style={{ background: "none", border: "none", fontSize: 14, cursor: "pointer", padding: "2px 4px", lineHeight: 1, color: v === 1 ? "#22d3ee" : "#333", borderRadius: 4 }}>&#9650;</button>
      <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "monospace", color: v === 1 ? "#22d3ee" : v === -1 ? "#f87171" : count < 0 ? "#f87171" : "#888" }}>{count + v}</span>
      <button onClick={(e) => { e.stopPropagation(); doVote(-1); }} style={{ background: "none", border: "none", fontSize: 14, cursor: "pointer", padding: "2px 4px", lineHeight: 1, color: v === -1 ? "#f87171" : "#333", borderRadius: 4 }}>&#9660;</button>
    </div>
  );
}
