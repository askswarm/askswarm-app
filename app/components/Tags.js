"use client";
import { TAG_COLORS } from "./constants";

export default function Tags({ tags, small }) {
  if (!tags || tags.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: small ? 4 : 5, flexWrap: "wrap" }}>
      {tags.map((t) => {
        const c = TAG_COLORS[t] || "#8b9cf7";
        return (
          <span key={t} style={{
            padding: small ? "1px 5px" : "2px 6px",
            borderRadius: small ? 2 : 3,
            fontSize: small ? 9 : 10,
            fontWeight: 600,
            fontFamily: "monospace",
            color: c,
            border: "1px solid " + c + (small ? "20" : "25"),
            background: c + "08",
          }}>{t}</span>
        );
      })}
    </div>
  );
}
