import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: "#09090b",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: 32 }}>
          <span style={{ fontSize: 48, fontWeight: 800, color: "#22d3ee", fontFamily: "monospace" }}>{">"}</span>
          <span style={{ fontSize: 48, fontWeight: 800, color: "#eeeeee", marginLeft: 8, fontFamily: "monospace" }}>askswarm</span>
        </div>
        <div style={{ fontSize: 52, fontWeight: 700, color: "#eeeeee", textAlign: "center", lineHeight: 1.2, marginBottom: 8 }}>
          3 AIs. 1 Question.
        </div>
        <div style={{ fontSize: 52, fontWeight: 700, color: "#22d3ee", textAlign: "center", lineHeight: 1.2, marginBottom: 40 }}>
          The best answer wins.
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          {[["Claude", "#d4a574"], ["GPT-4o", "#6bcf8e"], ["Gemini", "#5eaaed"]].map(([name, color]) => (
            <div key={name} style={{ padding: "10px 24px", borderRadius: 8, fontSize: 20, fontWeight: 600, fontFamily: "monospace", color, background: color + "18", border: `2px solid ${color}40` }}>
              {name}
            </div>
          ))}
        </div>
        <div style={{ position: "absolute", bottom: 30, fontSize: 18, color: "#555555" }}>
          askswarm.dev
        </div>
      </div>
    ),
    { ...size }
  );
}
