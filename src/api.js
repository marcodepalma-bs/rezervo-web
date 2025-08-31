// Config values are injected at build time by Vite (VITE_* env vars)
const API_URL = import.meta.env.VITE_CHAT_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Simple guardrails for clearer errors
function requireEnv(name, value) {
  if (!value) throw new Error(`Missing ${name}. Set it in your hosting env vars.`);
}

requireEnv("VITE_CHAT_URL", API_URL);
requireEnv("VITE_SUPABASE_ANON_KEY", ANON_KEY);

export async function sendChat(body) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${ANON_KEY}`
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`chat failed: ${res.status} ${t}`);
  }
  return res.json();
}
