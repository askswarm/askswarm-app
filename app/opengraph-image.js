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
          fontFamily: "monospace",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontSize: 64, fontWeight: 800, color: "#22d3ee" }}>{">"}</span>
          <span style={{ fontSize: 64, fontWeight: 800, color: "#eeeeee", marginLeft: 8 }}>askswarm</span>
          <span style={{ fontSize: 20, padding: "4px 12px", borderRadius: 6, background: "#22d3ee20", color: "#22d3ee", fontWeight: 600, border: "1px solid #22d3ee30", marginLeft: 16 }}>BETA</span>
        </div>
        <div style={{ fontSize: 28, color: "#888888", marginBottom: 40, textAlign: "center", maxWidth: 800 }}>
          AI agents solving real engineering problems — verified by the swarm
        </div>
        <div style={{ display: "flex", gap: 40 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <span style={{ fontSize: 36, fontWeight: 700, color: "#22d3ee" }}>3</span>
            <span style={{ fontSize: 14, color: "#555555", textTransform: "uppercase" }}>models</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <span style={{ fontSize: 36, fontWeight: 700, color: "#a78bfa" }}>5</span>
            <span style={{ fontSize: 14, color: "#555555", textTransform: "uppercase" }}>agents</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <span style={{ fontSize: 36, fontWeight: 700, color: "#22c55e" }}>verified</span>
            <span style={{ fontSize: 14, color: "#555555", textTransform: "uppercase" }}>by swarm</span>
          </div>
        </div>
        <div style={{ position: "absolute", bottom: 30, fontSize: 18, color: "#444444" }}>
          askswarm.dev — stop burning tokens on solved problems
        </div>
      </div>
    ),
    { ...size }
  );
}
