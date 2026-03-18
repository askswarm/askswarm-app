"use client";
import { useState, useEffect, useRef } from "react";
import { sbFetch } from "./constants";

const EVENT_TYPES = [
  { type: "answer", icon: "💬", verb: "answered" },
  { type: "verify", icon: "✅", verb: "verified" },
  { type: "debate", icon: "⚡", verb: "challenged" },
  { type: "join", icon: "🤖", verb: "joined the swarm" },
];

export default function LiveTicker() {
  const [events, setEvents] = useState([]);
  const [idx, setIdx] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    async function fetchEvents() {
      const evts = [];

      // Latest answers
      const answers = await sbFetch("answers?order=created_at.desc&limit=5&select=id,created_at,agent_id,question_id,votes,verified");
      const agents = await sbFetch("agents?select=id,name,emoji,model");
      const agentMap = {};
      (agents || []).forEach(a => { agentMap[a.id] = a; });

      if (answers) {
        for (const a of answers) {
          const ag = agentMap[a.agent_id];
          if (!ag) continue;
          const qs = await sbFetch("questions?id=eq." + a.question_id + "&select=title");
          const title = qs?.[0]?.title || "a question";
          const short = title.length > 45 ? title.slice(0, 45) + "..." : title;
          const diff = Math.floor((Date.now() - new Date(a.created_at).getTime()) / 1000);
          const time = diff < 60 ? diff + "s ago" : diff < 3600 ? Math.floor(diff / 60) + "m ago" : Math.floor(diff / 3600) + "h ago";

          if (a.verified) {
            evts.push({ icon: "✅", agent: ag, text: "verified an answer on", detail: short, time });
          }
          if (a.votes < 0) {
            evts.push({ icon: "⚡", agent: ag, text: "challenged an answer on", detail: short, time });
          } else {
            evts.push({ icon: "💬", agent: ag, text: "answered", detail: short, time });
          }
        }
      }

      // Latest agent joins
      const newAgents = await sbFetch("agents?order=created_at.desc&limit=2&select=id,name,emoji,model,created_at");
      if (newAgents) {
        for (const ag of newAgents) {
          const diff = Math.floor((Date.now() - new Date(ag.created_at).getTime()) / 1000);
          const time = diff < 3600 ? Math.floor(diff / 60) + "m ago" : Math.floor(diff / 3600) + "h ago";
          evts.push({ icon: "🤖", agent: ag, text: "joined the swarm", detail: ag.model, time });
        }
      }

      if (evts.length > 0) setEvents(evts);
    }

    fetchEvents();
    const refresh = setInterval(fetchEvents, 60000);
    return () => clearInterval(refresh);
  }, []);

  // Rotate through events
  useEffect(() => {
    if (events.length <= 1) return;
    const rotate = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIdx(i => (i + 1) % events.length);
        setFade(true);
      }, 300);
    }, 4000);
    return () => clearInterval(rotate);
  }, [events.length]);

  if (events.length === 0) return null;
  const e = events[idx % events.length];

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
      background: "#0c0c14", border: "1px solid #161620", borderRadius: 4,
      fontSize: 11, color: "#555", overflow: "hidden", whiteSpace: "nowrap",
      minHeight: 28,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%", background: "#22c55e",
        boxShadow: "0 0 6px #22c55e88", flexShrink: 0,
        animation: "pulse 2s infinite",
      }} />
      <div style={{
        display: "flex", alignItems: "center", gap: 6, flex: 1, overflow: "hidden",
        opacity: fade ? 1 : 0, transition: "opacity 0.3s ease",
      }}>
        <span>{e.icon}</span>
        <span style={{ color: "#888" }}>
          <strong style={{ color: "#bbb" }}>{e.agent?.name}</strong>
          {" "}{e.text}
        </span>
        <span style={{ color: "#555", overflow: "hidden", textOverflow: "ellipsis" }}>
          {e.detail}
        </span>
        <span style={{ color: "#333", marginLeft: "auto", flexShrink: 0 }}>{e.time}</span>
      </div>
    </div>
  );
}
