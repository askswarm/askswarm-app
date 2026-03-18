"use client";
import { useState, useEffect } from "react";

export default function Vote({ count, id, type }) {
  const [v, setV] = useState(0);
  const [error, setError] = useState(null);
  const [animating, setAnimating] = useState(false);

  // Check localStorage for previous votes
  useEffect(() => {
    if (id) {
      const stored = localStorage.getItem("vote_" + id);
      if (stored) setV(parseInt(stored, 10));
    }
  }, [id]);

  const doVote = async (dir) => {
    if (v !== 0) return; // Already voted
    setError(null);
    setAnimating(true);
    setTimeout(() => setAnimating(false), 300);

    // Optimistic update
    setV(dir);
    localStorage.setItem("vote_" + id, dir.toString());

    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answer_id: id,
          direction: dir === 1 ? "up" : "down",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Revert on error
        setV(0);
        localStorage.removeItem("vote_" + id);
        setError(data.error);
        setTimeout(() => setError(null), 3000);
      }
    } catch (e) {
      setV(0);
      localStorage.removeItem("vote_" + id);
      setError("Network error");
      setTimeout(() => setError(null), 3000);
    }
  };

  const displayCount = Math.max(0, count + v);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1, minWidth: 36, position: "relative" }}>
      <button
        onClick={(e) => { e.stopPropagation(); doVote(1); }}
        disabled={v !== 0}
        style={{
          background: "none", border: "none", fontSize: 14, padding: "2px 4px", lineHeight: 1,
          cursor: v !== 0 ? "default" : "pointer",
          color: v === 1 ? "#22d3ee" : "#333",
          borderRadius: 4,
          transform: animating && v === 1 ? "scale(1.4)" : "scale(1)",
          transition: "transform 0.2s, color 0.2s",
        }}
      >&#9650;</button>
      <span style={{
        fontSize: 13, fontWeight: 700, fontFamily: "monospace",
        color: v === 1 ? "#22d3ee" : v === -1 ? "#f87171" : "#888",
        transition: "color 0.2s",
      }}>{displayCount}</span>
      <button
        onClick={(e) => { e.stopPropagation(); doVote(-1); }}
        disabled={v !== 0}
        style={{
          background: "none", border: "none", fontSize: 14, padding: "2px 4px", lineHeight: 1,
          cursor: v !== 0 ? "default" : "pointer",
          color: v === -1 ? "#f87171" : "#333",
          borderRadius: 4,
          transform: animating && v === -1 ? "scale(1.4)" : "scale(1)",
          transition: "transform 0.2s, color 0.2s",
        }}
      >&#9660;</button>
      {error && (
        <div style={{
          position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)",
          background: "#1a1a2e", border: "1px solid #f8717140", borderRadius: 4,
          padding: "4px 8px", fontSize: 10, color: "#f87171", whiteSpace: "nowrap",
          marginTop: 4, zIndex: 10,
        }}>{error}</div>
      )}
    </div>
  );
}
