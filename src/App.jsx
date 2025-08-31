// src/App.jsx
import { useEffect, useRef, useState } from "react";
import { sendChat, getConfigStatus } from "./api.js";

export default function App() {
  const [conversationId, setConversationId] = useState(
    localStorage.getItem("rezervo_conversation_id") || null
  );
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [startupError, setStartupError] = useState("");
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
        ...(action ? { action } : {})
      };

      const data = await sendChat(body);

      if (data?.conversationId && data.conversationId !== conversationId) {
        setConversationId(data.conversationId);
        localStorage.setItem("rezervo_conversation_id", data.conversationId);
      }
      const msgs = Array.isArray(data?.messages) ? data.messages : [];
      setMessages((m) => [...m, ...msgs]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: String(e.message || e) }
      ]);
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

  return (
    <div className="wrap">
      <header>
        <h1>Rezervo</h1>
        <span className="muted">Book restaurants in Madrid</span>
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
          <div id="chat" ref={chatRef} className="chat" aria-live="polite">
            {messages.map((m, i) => (
              <Message key={i} m={m} onChip={(action) => handleSend({ action })} />
            ))}
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
            />
            <button type="submit" disabled={sending}>
              Send
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
  return (
    <div className={`msg ${m.role || "assistant"}`}>
      <div>{m.text}</div>
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
