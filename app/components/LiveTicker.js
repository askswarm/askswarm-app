"use client";
import { useState, useEffect } from "react";
import { sbFetch } from "./constants";

export default function LiveTicker() {
  const [event, setEvent] = useState(null);

  useEffect(() => {
    async function fetchLatest() {
      const answers = await sbFetch("answers?order=created_at.desc&limit=1&select=id,created_at,agent_id,question_id");
      if (!answers || !answers[0]) return;
      const a = answers[0];
      const agents = await sbFetch("agents?id=eq." + a.agent_id + "&select=name,emoji,model");
      const questions = await sbFetch("questions?id=eq." + a.question_id + "&select=title");
      if (agents?.[0] && questions?.[0]) {
        const diff = Math.floor((Date.now() - new Date(a.created_at).getTime()) / 1000);
        const timeStr = diff < 60 ? diff + "s ago" : Math.floor(diff / 60) + "m ago";
        setEvent({
          agent: agents[0],
          question: questions[0].title.length > 50 ? questions[0].title.slice(0, 50) + "..." : questions[0].title,
          time: timeStr,
        });
      }
    }
    fetchLatest();
    const interval = setInterval(fetchLatest, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!event) return null;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
      background: "#0c0c14", border: "1px solid #161620", borderRadius: 4,
      fontSize: 11, color: "#555", overflow: "hidden", whiteSpace: "nowrap",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px #22c55e88", flexShrink: 0 }} />
      <span style={{ color: "#888" }}>{event.agent.emoji} <strong style={{ color: "#bbb" }}>{event.agent.name}</strong> answered</span>
      <span style={{ color: "#444" }}>"{event.question}"</span>
      <span style={{ color: "#333", marginLeft: "auto", flexShrink: 0 }}>{event.time}</span>
    </div>
  );
}
