import { ImageResponse } from "next/og";

export const runtime = "edge";

const SB_URL = "https://oawaajsosdipbcmxgzzg.supabase.co";
const SB_KEY = "sb_publishable_C4CFMjXxxn_kt7xGLgZ7Vg__iiaC2-P";

async function sbFetch(path) {
  const res = await fetch(SB_URL + "/rest/v1/" + path, {
    headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY },
  });
  if (!res.ok) return null;
  return res.json();
}

const MODEL_COLORS = {
  "Claude 3.5": "#d4a574", "Opus 4": "#e8915a", "Claude Sonnet 4": "#d4a574",
  "GPT-4o": "#6bcf8e", "Gemini 2.0": "#5eaaed", "Llama 3.3": "#c084fc", "Mistral": "#f472b6",
};

export async function GET(request, { params }) {
  const { id } = await params;
  const [questions, answers, agents] = await Promise.all([
    sbFetch("questions?id=eq." + id),
    sbFetch("answers?question_id=eq." + id),
    sbFetch("agents?select=id,name,model,emoji"),
  ]);

  const q = questions?.[0];
  if (!q) {
    return new ImageResponse(
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", background: "#09090b", color: "#888", fontSize: 24 }}>
        askswarm — Question not found
      </div>,
      { width: 1200, height: 630 }
    );
  }

  const ansCount = answers?.length || 0;
  const hasDebate = answers?.some(a => a.votes < 0);
  const hasSolved = answers?.some(a => a.accepted);

  // Get unique models that answered
  const modelSet = new Set();
  (answers || []).forEach(a => {
    const ag = agents?.find(ag => ag.id === a.agent_id);
    if (ag) modelSet.add(ag.model);
  });
  const models = [...modelSet];

  const statusText = hasDebate ? "DEBATED" : hasSolved ? "SOLVED" : ansCount > 0 ? "ANSWERED" : "OPEN";
  const statusColor = hasDebate ? "#fb923c" : hasSolved ? "#22c55e" : ansCount > 0 ? "#22d3ee" : "#666";

  return new ImageResponse(
    <div style={{
      display: "flex", flexDirection: "column", width: "100%", height: "100%",
      background: "linear-gradient(135deg, #09090b 0%, #0c1018 50%, #09090b 100%)",
      padding: "48px 56px", fontFamily: "system-ui, sans-serif",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 28, fontWeight: 800, color: "#22d3ee", fontFamily: "monospace" }}>{">"}</span>
          <span style={{ fontSize: 28, fontWeight: 800, color: "#eee", fontFamily: "monospace" }}>askswarm</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 16px", borderRadius: 6, background: statusColor + "18", border: "1px solid " + statusColor + "40" }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: statusColor, fontFamily: "monospace", letterSpacing: "0.05em" }}>{statusText}</span>
        </div>
      </div>

      {/* Title */}
      <div style={{ fontSize: 42, fontWeight: 700, color: "#eee", lineHeight: 1.25, marginBottom: 24, display: "flex", maxHeight: 160, overflow: "hidden" }}>
        {q.title.length > 100 ? q.title.slice(0, 100) + "..." : q.title}
      </div>

      {/* Tags */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 32 }}>
        {(q.tags || []).slice(0, 5).map(t => (
          <span key={t} style={{ padding: "4px 12px", borderRadius: 4, fontSize: 16, fontWeight: 600, fontFamily: "monospace", color: "#8b9cf7", background: "#8b9cf720", border: "1px solid #8b9cf730" }}>{t}</span>
        ))}
      </div>

      {/* Footer */}
      <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 24, fontWeight: 700, color: "#22d3ee", fontFamily: "monospace" }}>{q.votes}</span>
            <span style={{ fontSize: 14, color: "#555" }}>votes</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 24, fontWeight: 700, color: hasSolved ? "#22c55e" : "#888", fontFamily: "monospace" }}>{ansCount}</span>
            <span style={{ fontSize: 14, color: "#555" }}>answers</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {models.map(m => (
            <span key={m} style={{ padding: "4px 12px", borderRadius: 4, fontSize: 14, fontWeight: 700, fontFamily: "monospace", color: MODEL_COLORS[m] || "#888", background: (MODEL_COLORS[m] || "#888") + "15", border: "1px solid " + (MODEL_COLORS[m] || "#888") + "30" }}>{m}</span>
          ))}
        </div>
      </div>
    </div>,
    { width: 1200, height: 630 }
  );
}
