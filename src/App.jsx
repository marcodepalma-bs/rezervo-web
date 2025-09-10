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
    document.documentElement.setAttribute(
      "data-theme",
      theme === "light" ? "light" : ""
    );
    localStorage.setItem("rezervo_theme", theme);
  }, [theme]);

  // ---- Chat state ----
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

  // first load → get greeting
  useEffect(() => {
    if (!startupError && !conversationId) {
      handleSend({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startupError]);

  function showToast(next) {
    setToast(next);
    if (next) {
      setTimeout(() => setToast(null), 3500);
    }
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
  async function handleSend({ payloadText, action } = {}) {
    if (sending || startupError) return;
    setSending(true);

    // Echo user bubble for typed text
    if (payloadText) {
      addUserBubble(payloadText);
      clearChipsOnLastAssistant();
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

      // If the last message looks like a booking confirmation, show a toast too
      const last = msgs[msgs.length - 1];
      if (last && /booking confirmed/i.test(String(last.text))) {
        showToast({
          type: "success",
          message: "Booking confirmed 🎉 Email on the way.",
        });
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

  /** ---------- Chip click path ----------
   *  - Toggle chips: handled locally (no POST)
   *  - Submit chips: send selected list once (single POST)
   *  - Other chips: echo + POST normally
   */
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
      addUserBubble(
        list.length ? `Cuisines: ${list.join(", ")}` : "No cuisine preference"
      );
      clearChipsOnLastAssistant();
      await handleSend({
        action: { type: "refine_set_cuisines", data: list },
      });
      clearSelections("cuisine");
      return;
    }

    // 3) Submit areas
    if (a.type === "submit_refine_areas") {
      const list = Array.from(pendingSelections.area || []);
      addUserBubble(
        list.length ? `Areas: ${list.join(", ")}` : "No area preference"
      );
      clearChipsOnLastAssistant();
      await handleSend({
        action: { type: "refine_set_areas", data: list },
      });
      clearSelections("area");
      return;
    }

    // 4) All other chips → echo and POST as before
    addUserBubble(suggestion.title);
    clearChipsOnLastAssistant();
    await handleSend({ action: a });
  }

  function resetConversation() {
    localStorage.removeItem("rezervo_conversation_id");
    setConversationId(null);
    setMessages([]);
    setPendingSelections({});
    if (!startupError) handleSend({});
  }

  const logoSrc = theme === "light" ? "/logo-dark.png" : "/logo-light.png";

  return (
    <div className="wrap">
      {/* Toast */}
      {toast && <Toast type={toast.type} message={toast.message} />}

      <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <img src={logoSrc} alt="Rezervo" height={22} style={{ display: "block" }} />
        <div className="muted" style={{ flex: 1 }}>Book restaurants in Madrid</div>
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

      {startupError ? (
        <div className="chat" style={{ padding: 20 }}>
          <div className="msg assistant">
            <strong>Configuration needed</strong>
            <div style={{ marginTop: 8 }}>{startupError}</div>
            <div style={{ marginTop: 8 }}>
              Required:
              <ul>
                <li><code>VITE_CHAT_URL</code> = your Supabase chat Invoke URL</li>
                <li><code>VITE_SUPABASE_ANON_KEY</code> = your anon key</li>
              </ul>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Starter chips appear only when there are no messages yet */}
          {messages.length === 0 && !sending && (
            <Starter onPick={(example) => handleSend({ payloadText: example })} />
          )}

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
              // echo + POST
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
  // success highlight if it looks like a confirmation
  const isSuccess =
    /^\s*✅/.test(String(m.text || "")) ||
    /\bbooking confirmed\b/i.test(String(m.text || ""));

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
                onClick={() => onChip(s)} // pass the WHOLE suggestion (title + action)
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

function Starter({ onPick }) {
  const examples = [
    "2025-09-05 dinner 2 Salamanca Italian €€",
    "2025-09-06 lunch 4 Chueca Spanish €€",
    "2025-09-07 dinner 2 La Latina Japanese €€€",
  ];
  return (
    <div className="starter">
      <div className="muted" style={{ marginBottom: 8 }}>Try one:</div>
      <div className="chips">
        {examples.map((ex, i) => (
          <button key={i} className="chip primary" type="button" onClick={() => onPick(ex)}>
            {ex}
          </button>
        ))}
      </div>
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
