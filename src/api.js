// src/api.js
const API_URL = import.meta.env.VITE_CHAT_URL || "";
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

// Report config status so the UI can show a friendly message instead of a blank screen
export function getConfigStatus() {
  const missing = [];
  if (!API_URL) missing.push("VITE_CHAT_URL");
  if (!ANON_KEY) missing.push("VITE_SUPABASE_ANON_KEY");
  return { missing, API_URL, ANON_KEY };
}

export async function sendChat(body) {
  const { missing } = getConfigStatus();
  if (missing.length) {
    throw new Error("Missing config: " + missing.join(", "));
  }

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
