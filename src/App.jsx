// src/App.jsx
import { useEffect, useRef, useState } from "react";
import { sendChat, getConfigStatus } from "./api.js";

export default function App() {
  // ---- Theme handling (light/dark) ----
  const [theme, setTheme] = useState(() => {
    const stored = localStorage.getItem("rezervo_theme");
    if (stored === "light" || stored === "dark") return stored;
    const prefersLight =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: light)").matches;
    return prefersLight ? "light" : "dark";
  });
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme === "light" ? "light" : "");
    localStorage.setItem("rezervo_theme", theme);
  }, [theme]);

  // ---- App/Chat state ----
  const [started, setStarted] = useState(() => localStorage.getItem("rezervo_started") === "1");
  useEffect(() => {
    document.body.classList.toggle("started", started);
    localStorage.setItem("rezervo_started", started ? "1" : "0");
  }, [started]);

  const [conversationId, setConversationId] = useState(
    localStorage.getItem("rezervo_conversation_id") || null
  );
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [startupError, setStartupError] = useState("");
  const [toast, setToast] = useState(null); // {type:'error'|'info'|'success', message:string}
  const chatRef = useRef(null);

  // Local multi-select state for client-only toggle chips
  // shape: { cuisine: Set<string>, area: Set<string> }
  const [pendingSelections, setPendingSelections] = useState({});

  const toggleSelection = (group, value) => {
    setPendingSelections((prev) => {
      const next = { ...prev };
      const set = new Set(next[group] ? Array.from(next[group]) : []);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      next[group] = set;
      return next;
    });
  };
  const clearSelections = (group) => {
    setPendingSelections((prev) => ({ ...prev, [group]: new Set() }));
  };

  // Show missing config clearly on screen
  useEffect(() => {
    const { missing } = getConfigStatus();
    if (missing.length) {
      setStartupError(
        `Missing environment variable(s): ${missing.join(
          ", "
        )}. Set them in Vercel → Project → Settings → Environment Variables and redeploy.`
      );
    }
  }, []);

  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  function showToast(next) {
    setToast(next);
    if (next) setTimeout(() => setToast(null), 3500);
  }

  /** ---------- UI helpers: echo bubbles + chip cleanup ---------- */
  const addUserBubble = (title) =>
    setMessages((prev) => [...prev, { role: "user", text: title }]);

  const clearChipsOnLastAssistant = () =>
    setMessages((prev) => {
      if (!prev.length) return prev;
      const last = prev[prev.length - 1];
      if (last.role !== "assistant" || !last.suggestions) return prev;
      const updated = [...prev];
      updated[updated.length - 1] = { ...last, suggestions: undefined };
      return updated;
    });

  /** ---------- Centralized POST to /chat ---------- */
  const lastRequestRef = useRef({ key: "", ts: 0 });

  async function handleSend({ payloadText, action } = {}) {
    // Drop exact duplicates fired within 1.2s (fast double click/enter)
    const key = JSON.stringify({ t: payloadText || null, a: action || null });
    const now = Date.now();
    if (key === lastRequestRef.current.key && now - lastRequestRef.current.ts < 1200) return;
    lastRequestRef.current = { key, ts: now };

    if (sending || startupError) return;
    setSending(true);

    // Echo user text once (and only once)
    if (payloadText) {
      setMessages((m) => {
        const last = m[m.length - 1];
        if (last?.role === "user" && last.text === payloadText) return m;
        return [...m, { role: "user", text: payloadText }];
      });
    }

    try {
      const body = {
        conversationId: conversationId || undefined,
        channel: "web",
        locale: "en-GB",
        ...(payloadText ? { text: payloadText } : {}),
        ...(action ? { action } : {}),
      };

      const data = await sendChat(body);

      if (data?.conversationId && data.conversationId !== conversationId) {
        setConversationId(data.conversationId);
        localStorage.setItem("rezervo_conversation_id", data.conversationId);
      }
      const msgs = Array.isArray(data?.messages) ? data.messages : [];
      setMessages((m) => [...m, ...msgs]);

      const last = msgs[msgs.length - 1];
      if (last && /booking confirmed/i.test(String(last.text))) {
        showToast({ type: "success", message: "Booking confirmed 🎉 Email on the way." });
      }
    } catch (e) {
      const msg = String(e?.message || e || "Something went wrong");
      setMessages((m) => [...m, { role: "assistant", text: msg }]);
      showToast({ type: "error", message: "Network error. Please try again." });
    } finally {
      setSending(false);
      setText("");
    }
  }

  /** ---------- Chip click path ---------- */
  async function handleChipClick(suggestion) {
    if (!suggestion) return;
    if (sending || startupError) return;

    const a = suggestion.action || {};

    // 1) Client-only toggles (multi-select)
    if (a.clientOnly && a.type === "toggle" && a.group && a.value) {
      toggleSelection(a.group, String(a.value));
      return; // no echo, no POST yet
    }

    // 2) Submit cuisines
    if (a.type === "submit_refine_cuisines") {
      const list = Array.from(pendingSelections.cuisine || []);
      addUserBubble(list.length ? `Cuisines: ${list.join(", ")}` : "No cuisine preference");
      clearChipsOnLastAssistant();
      await handleSend({ action: { type: "refine_set_cuisines", data: list } });
      clearSelections("cuisine");
      setStarted(true);
      return;
    }

    // 3) Submit areas
    if (a.type === "submit_refine_areas") {
      const list = Array.from(pendingSelections.area || []);
      addUserBubble(list.length ? `Areas: ${list.join(", ")}` : "No area preference");
      clearChipsOnLastAssistant();
      await handleSend({ action: { type: "refine_set_areas", data: list } });
      clearSelections("area");
      setStarted(true);
      return;
    }

    // 4) All other chips → echo and POST as before
    addUserBubble(suggestion.title);
    clearChipsOnLastAssistant();
    setStarted(true);
    await handleSend({ action: a });
  }

  /** ---------- Landing → start ---------- */
  const [heroText, setHeroText] = useState("");
  async function startWithText() {
    const t = heroText.trim() || "hello";
    addUserBubble(t);
    clearChipsOnLastAssistant();
    setStarted(true);
    await handleSend({ payloadText: t });
    setHeroText("");
  }

  function resetConversation() {
    localStorage.removeItem("rezervo_conversation_id");
    localStorage.removeItem("rezervo_started");
    setConversationId(null);
    setMessages([]);
    setPendingSelections({});
    setStarted(false);
  }

  const logoSrc = theme === "light" ? "/logo-dark.png" : "/logo-light.png";

  return (
    <div className={`wrap ${started ? "app-started" : "app-landing"}`}>
      {/* Toast */}
      {toast && <Toast type={toast.type} message={toast.message} />}

      {/* Header only after start */}
      {started && !startupError && (
        <header className="app-header">
          <div className="brand">
            <img src={logoSrc} alt="Rezervo" height={22} />
          </div>
          <div className="muted" style={{ flex: 1 }}>
            Your personal concierge for restaurant bookings in Madrid
          </div>
          <button
            type="button"
            className="chip"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            title="Toggle theme"
            aria-label="Toggle light/dark theme"
          >
            {theme === "light" ? "Dark mode" : "Light mode"}
          </button>
        </header>
      )}

      {startupError ? (
        <div className="chat" style={{ padding: 20 }}>
          <div className="msg assistant">
            <strong>Configuration needed</strong>
            <div style={{ marginTop: 8 }}>{startupError}</div>
            <div style={{ marginTop: 8 }}>
              Required:
              <ul>
                <li>
                  <code>VITE_CHAT_URL</code> = your Supabase chat Invoke URL
                </li>
                <li>
                  <code>VITE_SUPABASE_ANON_KEY</code> = your anon key
                </li>
              </ul>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Landing hero BEFORE start */}
          {!started && (
            <div className="hero">
              <div className="hero-inner">
                <img className="hero-logo" src={logoSrc} alt="Rezervo" />
                <div className="hero-tagline">
                  Your personal concierge for restaurant bookings in Madrid
                </div>
                <form
                  className="hero-slit"
                  onSubmit={(e) => {
                    e.preventDefault();
                    startWithText();
                  }}
                >
                  <input
                    type="text"
                    placeholder="Say hello to begin…"
                    value={heroText}
                    onChange={(e) => setHeroText(e.target.value)}
                    aria-label="Start conversation"
                    autoFocus
                  />
                  <button type="submit" className="btn">
                    Start
                  </button>
                </form>

                <button
                  className="theme-toggle chip"
                  type="button"
                  onClick={() => setTheme(theme === "light" ? "dark" : "light")}
                  aria-label="Toggle theme"
                  title="Toggle theme"
                >
                  {theme === "light" ? "Dark" : "Light"}
                </button>
              </div>
            </div>
          )}

          {/* Chat AFTER start */}
          {started && (
            <>
              <div id="chat" ref={chatRef} className="chat" aria-live="polite">
                {messages.map((m, i) => (
                  <Message
                    key={i}
                    m={m}
                    onChip={(s) => handleChipClick(s)}
                    disabled={sending}
                    pendingSelections={pendingSelections}
                  />
                ))}

                {/* typing indicator while sending */}
                {sending && (
                  <div className="msg assistant" aria-live="polite">
                    <div>Typing…</div>
                  </div>
                )}
              </div>

              <form
                className="composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!text.trim()) return;
                  addUserBubble(text.trim());
                  clearChipsOnLastAssistant();
                  handleSend({ payloadText: text.trim() });
                  setText("");
                }}
              >
                <input
                  type="text"
                  placeholder="Type here… e.g. 2025-09-05 dinner 4 Salamanca Italian €€"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  disabled={sending}
                  aria-label="Message"
                  autoComplete="off"
                />
                <button type="submit" disabled={sending} className="btn">
                  {sending ? "Sending…" : "Send"}
                </button>
              </form>
            </>
          )}
        </>
      )}

      <footer>
        <div className="muted">MVP demo • Emails go to your Resend sandbox</div>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            resetConversation();
          }}
        >
          Reset conversation
        </a>
      </footer>
    </div>
  );
}

function Message({ m, onChip, disabled, pendingSelections }) {
  const isSuccess =
    /^\s*✅/.test(String(m.text || "")) || /\bbooking confirmed\b/i.test(String(m.text || ""));

  const lines = String(m.text || "").split("\n");

  const isSelected = (s) => {
    const a = s?.action || {};
    if (!(a.clientOnly && a.type === "toggle" && a.group && a.value)) return false;
    const set = pendingSelections?.[a.group];
    return !!set && set.has(String(a.value));
  };

  return (
    <div className={`msg ${m.role || "assistant"} ${isSuccess ? "success" : ""}`}>
      <div>
        {lines.map((ln, idx) => (
          <span key={idx}>
            {ln}
            {idx < lines.length - 1 ? <br /> : null}
          </span>
        ))}
      </div>

      {Array.isArray(m.suggestions) && m.suggestions.length > 0 && (
        <div className="chips">
          {m.suggestions.map((s, idx) => {
            const selected = isSelected(s);
            return (
              <button
                key={idx}
                type="button"
                className={`chip ${selected ? "selected" : ""}`}
                onClick={() => onChip(s)}
                title={s.title}
                disabled={disabled}
                aria-pressed={selected}
              >
                {s.title}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Toast({ type = "info", message }) {
  return (
    <div className={`toast ${type}`} role="status" aria-live="polite">
      {message}
    </div>
  );
}
