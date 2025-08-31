import { useEffect, useMemo, useRef, useState } from "react";
import { sendChat } from "./api.js";

export default function App() {
  const [conversationId, setConversationId] = useState(
    localStorage.getItem("rezervo_conversation_id") || null
  );
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const chatRef = useRef(null);

  // scroll to bottom when messages change
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  // first load → get greeting
  useEffect(() => {
    if (!conversationId) {
      handleSend({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSend({ payloadText, action } = {}) {
    if (sending) return;
    setSending(true);

    // optimistic render user message
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
        { role: "assistant", text: "Network error. Please try again." }
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
    handleSend({});
  }

  return (
    <div className="wrap">
      <header>
        <h1>Rezervo</h1>
        <span className="muted">Book restaurants in Madrid</span>
      </header>

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

      <footer>
        <div className="muted">MVP demo • Emails go to your Resend sandbox</div>
        <a href="#" onClick={(e) => { e.preventDefault(); resetConversation(); }}>
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
