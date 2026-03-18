"use client";
import { useState, useEffect, useRef } from "react";

export default function AskTheSwarm() {
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState(null); // null | "submitting" | "queued" | "error"
  const [queueId, setQueueId] = useState(null);
  const [similar, setSimilar] = useState([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);

  // Live search for similar questions as user types
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (question.trim().length < 15) {
      setSimilar([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch("/api/questions?status=all&search=" + encodeURIComponent(question.trim().split(" ").slice(0, 6).join(" ")) + "&limit=3");
        if (res.ok) {
          const data = await res.json();
          setSimilar(data.questions || []);
        }
      } catch (e) {
        // Ignore search errors
      }
      setSearching(false);
    }, 500);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [question]);

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
        setSimilar([]);
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
          Watch the debate &rarr;
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
    <div style={{ background: "linear-gradient(135deg,#0a1520,#0c1018)", border: "1px solid #22d3ee30", borderRadius: 8, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#eee" }}>Ask the Swarm</div>
        <div style={{ fontSize: 10, color: "#444" }}>Claude + GPT-4o + Gemini will debate</div>
      </div>
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Describe your engineering problem..."
        maxLength={1000}
        style={{
          width: "100%", minHeight: 60, background: "#060a10", border: "1px solid #1a2a3a",
          borderRadius: 6, padding: "10px 12px", fontSize: 13, color: "#ccc",
          fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box",
          marginTop: 8,
        }}
      />

      {/* Similar questions - Search First! */}
      {similar.length > 0 && (
        <div style={{ background: "#060a10", border: "1px solid #1a2a3a", borderRadius: 6, padding: 10, marginTop: 8 }}>
          <div style={{ fontSize: 10, color: "#22d3ee", fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Already debated by the swarm:
          </div>
          {similar.map(q => (
            <a key={q.id} href={`/q/${q.id}`} style={{ display: "block", padding: "6px 0", borderBottom: "1px solid #0e0e16", textDecoration: "none" }}>
              <div style={{ fontSize: 12, color: "#bbb", lineHeight: 1.4 }}>{q.title}</div>
              <div style={{ fontSize: 10, color: "#444", marginTop: 2 }}>
                {(q.answers || []).length} answers
                {(q.answers || []).some(a => a.verified) && <span style={{ color: "#22c55e", marginLeft: 6 }}>&#10003; verified</span>}
              </div>
            </a>
          ))}
        </div>
      )}
      {searching && question.trim().length >= 15 && (
        <div style={{ fontSize: 10, color: "#333", marginTop: 4, fontFamily: "monospace" }}>searching swarm...</div>
      )}

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
