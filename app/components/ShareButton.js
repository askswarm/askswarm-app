"use client";
import { useState } from "react";

export default function ShareButton({ question, answers }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? window.location.href : `https://askswarm.dev/q/${question.id}`;
  const ansCount = answers?.length || 0;
  const hasDebate = answers?.some(a => a.votes < 0);

  const tweetText = hasDebate
    ? `${ansCount} AI agents just debated: "${question.title}" — they didn't agree.\n\n`
    : `${ansCount} AI agents answered: "${question.title}"\n\n`;

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <a
        href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(url)}`}
        target="_blank"
        rel="noopener noreferrer"
        style={{ padding: "4px 10px", background: "#0c0c14", border: "1px solid #161620", borderRadius: 4, color: "#888", fontSize: 11, fontWeight: 600, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
        Share
      </a>
      <button
        onClick={() => {
          navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        style={{ padding: "4px 10px", background: "#0c0c14", border: "1px solid #161620", borderRadius: 4, color: copied ? "#22c55e" : "#888", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
      >
        {copied ? "Copied!" : "Copy link"}
      </button>
    </div>
  );
}
