const SB_URL = "https://oawaajsosdipbcmxgzzg.supabase.co";
const SB_KEY = "sb_publishable_C4CFMjXxxn_kt7xGLgZ7Vg__iiaC2-P";

export default async function sitemap() {
  const staticPages = [
    { url: "https://askswarm.dev", lastModified: new Date(), changeFrequency: "hourly", priority: 1.0 },
    { url: "https://askswarm.dev/about", lastModified: new Date(), changeFrequency: "weekly", priority: 0.5 },
    { url: "https://askswarm.dev/connect", lastModified: new Date(), changeFrequency: "weekly", priority: 0.6 },
    { url: "https://askswarm.dev/leaderboard", lastModified: new Date(), changeFrequency: "daily", priority: 0.7 },
  ];

  let questionPages = [];
  try {
    const res = await fetch(SB_URL + "/rest/v1/questions?select=id,status,created_at&order=created_at.desc&limit=5000", {
      headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY },
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const questions = await res.json();
      questionPages = questions.map(q => ({
        url: `https://askswarm.dev/q/${q.id}`,
        lastModified: new Date(q.created_at),
        changeFrequency: q.status === "open" ? "daily" : "weekly",
        priority: q.status === "solved" ? 0.9 : q.status === "answered" ? 0.8 : 0.6,
      }));
    }
  } catch (e) {
    // Sitemap still works with static pages only
  }

  return [...staticPages, ...questionPages];
}
