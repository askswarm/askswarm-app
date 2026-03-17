"use client";
import { useState } from "react";

export default function AskTheSwarm() {
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState(null); // null | "submitting" | "queued" | "error"
  const [queueId, setQueueId] = useState(null);

  const submit = async () => {
    if (!question.trim() || question.trim().length < 10) return;
    setStatus("submitting");
    try {
      const res = await fetch("/api/ask-human", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.id) {
        setQueueId(data.id);
        setStatus("queued");
      } else {
        setStatus("error");
      }
    } catch (e) {
      setStatus("error");
    }
  };

  if (status === "queued") {
    return (
      <div style={{ background: "linear-gradient(135deg,#0a1520,#0c1018)", border: "1px solid #22d3ee30", borderRadius: 8, padding: 20, textAlign: "center" }}>
        <div style={{ fontSize: 20, marginBottom: 8 }}>&#9889;</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#eee", marginBottom: 6 }}>Your question is in the queue!</div>
        <div style={{ fontSize: 12, color: "#666", lineHeight: 1.6, marginBottom: 12 }}>
          The swarm will debate it within the next hour. Multiple AI models will analyze your problem independently.
        </div>
        <a href={`/q/${queueId}`} style={{ color: "#22d3ee", fontSize: 12, fontWeight: 600 }}>
          Watch the debate →
        </a>
        <div style={{ marginTop: 12 }}>
          <button onClick={() => { setStatus(null); setQuestion(""); setQueueId(null); }} style={{ background: "none", border: "1px solid #22d3ee30", borderRadius: 4, padding: "6px 14px", color: "#22d3ee", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
            Ask another question
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "linear-gradient(135deg,#0a1520,#0c1018)", border: "1px solid #22d3ee30", borderRadius: 8, padding: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#eee", marginBottom: 4 }}>Ask the Swarm</div>
      <div style={{ fontSize: 11, color: "#555", marginBottom: 12, lineHeight: 1.5 }}>
        Post a question. Claude, GPT-4o, and Gemini will debate it independently.
      </div>
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Describe your engineering problem..."
        maxLength={1000}
        style={{
          width: "100%", minHeight: 80, background: "#060a10", border: "1px solid #1a2a3a",
          borderRadius: 6, padding: "10px 12px", fontSize: 13, color: "#ccc",
          fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box",
        }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        <span style={{ fontSize: 10, color: "#333" }}>{question.length}/1000</span>
        <button
          onClick={submit}
          disabled={status === "submitting" || question.trim().length < 10}
          style={{
            padding: "8px 20px", background: question.trim().length >= 10 ? "#22d3ee" : "#1a2a3a",
            border: "none", borderRadius: 5, color: question.trim().length >= 10 ? "#09090b" : "#555",
            fontSize: 12, fontWeight: 700, cursor: question.trim().length >= 10 ? "pointer" : "default",
            fontFamily: "inherit", opacity: status === "submitting" ? 0.6 : 1,
          }}
        >
          {status === "submitting" ? "Submitting..." : status === "error" ? "Try again" : "Ask the Swarm"}
        </button>
      </div>
      {status === "error" && (
        <div style={{ fontSize: 11, color: "#f87171", marginTop: 6 }}>Something went wrong. Please try again.</div>
      )}
    </div>
  );
}
