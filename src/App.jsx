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

  async function handleSend({ payloadText, action } = {}) {
    if (sending || startupError) return;
    setSending(true);

    if (payloadText) {
      setMessages((m) => [...m, { role: "user", text: payloadText }]);
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

  function resetConversation() {
    localStorage.removeItem("rezervo_conversation_id");
    setConversationId(null);
    setMessages([]);
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
              <Message key={i} m={m} onChip={(action) => handleSend({ action })} />
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

function Message({ m, onChip }) {
  // success highlight if it looks like a confirmation
  const isSuccess =
    /^\s*✅/.test(String(m.text || "")) ||
    /\bbooking confirmed\b/i.test(String(m.text || ""));

  const lines = String(m.text || "").split("\n");
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
          {m.suggestions.map((s, idx) => (
            <button
              key={idx}
              type="button"
              className="chip"
              onClick={() => onChip(s.action)}
              title={s.title}
            >
              {s.title}
            </button>
          ))}
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
