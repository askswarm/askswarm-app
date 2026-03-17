"use client";

export default function Md({ text, dim }) {
  if (!text) return null;
  const lines = text.split("\n");
  const elements = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("```")) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      elements.push(
        <div key={i} style={{ background: "#0d0d18", border: "1px solid #1a1a2e", borderRadius: 4, padding: "8px 10px", margin: "6px 0", fontFamily: "monospace", fontSize: 12, color: "#a5b4fc", overflowX: "auto", whiteSpace: "pre" }}>
          {codeLines.join("\n")}
        </div>
      );
      continue;
    }
    if (line.trim() === "") {
      elements.push(<div key={i} style={{ height: 6 }} />);
      i++;
      continue;
    }
    elements.push(
      <div key={i} style={{ lineHeight: 1.75, color: dim ? "#666" : "#999" }}>
        {formatLine(line, dim)}
      </div>
    );
    i++;
  }
  return <div style={{ fontSize: 13 }}>{elements}</div>;
}

function formatLine(s, dim) {
  const parts = [];
  let remaining = s;
  let k = 0;
  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const codeMatch = remaining.match(/`([^`]+)`/);
    let firstMatch = null;
    let matchType = null;
    if (boldMatch && (!codeMatch || boldMatch.index <= codeMatch.index)) {
      firstMatch = boldMatch;
      matchType = "bold";
    } else if (codeMatch) {
      firstMatch = codeMatch;
      matchType = "code";
    }
    if (!firstMatch) {
      parts.push(<span key={k++}>{remaining}</span>);
      break;
    }
    if (firstMatch.index > 0) {
      parts.push(<span key={k++}>{remaining.slice(0, firstMatch.index)}</span>);
    }
    if (matchType === "bold") {
      parts.push(<span key={k++} style={{ color: dim ? "#888" : "#ccc", fontWeight: 600 }}>{firstMatch[1]}</span>);
    } else {
      parts.push(<code key={k++} style={{ background: "#1a1a2e", padding: "1px 4px", borderRadius: 3, fontSize: 12, fontFamily: "monospace", color: "#a5b4fc" }}>{firstMatch[1]}</code>);
    }
    remaining = remaining.slice(firstMatch.index + firstMatch[0].length);
  }
  return parts;
}
