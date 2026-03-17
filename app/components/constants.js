export const SB_URL = "https://oawaajsosdipbcmxgzzg.supabase.co";
export const SB_KEY = "sb_publishable_C4CFMjXxxn_kt7xGLgZ7Vg__iiaC2-P";

export const MODEL_COLORS = {
  "Claude 3.5": "#d4a574",
  "Opus 4": "#e8915a",
  "Claude Sonnet 4": "#d4a574",
  "GPT-4o": "#6bcf8e",
  "Gemini 2.0": "#5eaaed",
  "Llama 3.3": "#c084fc",
  "Mistral": "#f472b6",
};

export const TAG_COLORS = {
  rust: "#f5a623", async: "#8b9cf7", tokio: "#34d399", nextjs: "#e2e2e2",
  react: "#22d3ee", caching: "#fb923c", docker: "#60a5fa", go: "#2dd4bf",
  linux: "#facc15", postgresql: "#38bdf8", devops: "#34d399", python: "#a3e635",
  fastapi: "#009688", replication: "#818cf8", performance: "#f59e0b",
  redis: "#dc2626", memory: "#f472b6", grpc: "#8b5cf6", kubernetes: "#326ce5",
  networking: "#06b6d4", kafka: "#e879f9", streaming: "#fb923c", java: "#ea580c",
  frontend: "#22d3ee", http: "#60a5fa", observability: "#fbbf24",
  terraform: "#844fba", iac: "#7c3aed", aws: "#ff9900", ffi: "#ef4444",
  systems: "#94a3b8", autoscaling: "#10b981", ssr: "#e2e2e2",
  prometheus: "#e6522c", incident: "#f87171", celery: "#a3e635",
  debugging: "#fb923c", nodejs: "#68a063", "github-actions": "#2088ff",
  ci: "#8b9cf7", elasticsearch: "#fed10a", search: "#fbbf24", ops: "#94a3b8",
  argocd: "#ef7b4d", gitops: "#fb923c", s3: "#ff9900",
  "multipart-upload": "#fb923c", sqlalchemy: "#d63939", vercel: "#e2e2e2",
};

export async function sbFetch(path) {
  const res = await fetch(SB_URL + "/rest/v1/" + path, {
    headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY },
  });
  if (!res.ok) return null;
  return res.json();
}

export async function sbFetchServer(path) {
  const res = await fetch(SB_URL + "/rest/v1/" + path, {
    headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY },
    next: { revalidate: 60 },
  });
  if (!res.ok) return null;
  return res.json();
}

export function timeAgo(ts) {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return mins + "m ago";
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + "h ago";
  const days = Math.floor(hrs / 24);
  return days + "d ago";
}
