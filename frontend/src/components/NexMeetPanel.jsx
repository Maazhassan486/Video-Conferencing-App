import { useEffect, useRef, useState } from "react";
import styles from "./NexMeetPanel.module.css";
import {
  SparkIcon,
  XIcon,
  MicIcon,
  MicOffIcon,
  ArrowRightIcon,
} from "./Icons.jsx";

/**
 * Side-panel UI for the in-meeting NexMeet AI assistant.
 *
 * Stays mounted at all times so the conversation survives toggling the
 * panel open/closed; visibility is animated purely via CSS classes.
 */
export default function NexMeetPanel({
  open,
  onClose,
  conversation,
  thinking,
  listening,
  setListening,
  partial,
  supportsSpeech,
  onAsk,
  error,
  inSession,
  secondsRemaining,
  onEndSession,
}) {
  const [input, setInput] = useState("");
  const scrollRef = useRef(null);

  // Auto-scroll to the latest message
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [conversation.length, thinking]);

  function submit(e) {
    e.preventDefault();
    const q = input.trim();
    if (!q) return;
    onAsk(q);
    setInput("");
  }

  return (
    <aside
      className={`${styles.panel} ${open ? styles.open : styles.closed}`}
      aria-hidden={!open}
    >
      <header className={styles.header}>
        <div className={styles.title}>
          <span className={styles.titleIcon}>
            <SparkIcon size={16} />
          </span>
          <div className={styles.titleText}>
            <span className={styles.titleMain}>NexMeet AI</span>
            <span className={styles.titleSub}>
              {thinking
                ? "Thinking\u2026"
                : inSession
                ? `In conversation \u00B7 ${secondsRemaining}s`
                : listening
                ? "Listening for \u201CHey Agent\u201D"
                : "Idle"}
            </span>
          </div>
        </div>
        <div className={styles.headerActions}>
          {inSession && (
            <button
              type="button"
              className={styles.endBtn}
              onClick={onEndSession}
              title="End the conversation"
              tabIndex={open ? 0 : -1}
            >
              End
            </button>
          )}
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close NexMeet panel"
            tabIndex={open ? 0 : -1}
          >
            <XIcon size={16} />
          </button>
        </div>
      </header>

      {inSession && (
        <div className={styles.sessionBar}>
          <span className={styles.sessionDot} aria-hidden />
          <span>
            Conversation is open — speak freely without saying
            &ldquo;hey agent&rdquo;. Say <strong>&ldquo;thanks agent&rdquo;</strong>{" "}
            to end.
          </span>
        </div>
      )}

      <div className={styles.controls}>
        <button
          type="button"
          className={`${styles.listenBtn} ${listening ? styles.listenBtnOn : ""}`}
          onClick={() => setListening((v) => !v)}
          disabled={!supportsSpeech}
          title={
            !supportsSpeech
              ? "Speech recognition isn't supported in this browser"
              : listening
              ? "Stop wake-word listening"
              : "Start wake-word listening"
          }
          tabIndex={open ? 0 : -1}
        >
          {listening ? <MicIcon size={14} /> : <MicOffIcon size={14} />}
          <span>{listening ? "Voice on" : "Voice off"}</span>
          {listening && <span className={styles.pulse} aria-hidden />}
        </button>
        <span className={styles.hint}>
          Say <strong>&ldquo;Hey Agent&rdquo;</strong> to start a conversation.
          The agent stays open for follow-ups.
        </span>
      </div>

      <div className={styles.messages} ref={scrollRef}>
        {conversation.length === 0 && !thinking && (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>
              <SparkIcon size={28} />
            </div>
            <h4>I&rsquo;m here when you need me.</h4>
            <p>
              Say{" "}
              <em>&ldquo;Hey Agent, what&rsquo;s on the agenda?&rdquo;</em>{" "}
              to ask out loud, or type a question below. Everyone in the
              room sees the same conversation.
            </p>
          </div>
        )}

        {conversation.map((m) => (
          <div
            key={m.id}
            className={`${styles.row} ${m.type === "a" ? styles.rowAi : styles.rowUser}`}
          >
            <div className={styles.meta}>
              {m.type === "a" ? (
                <>
                  <span className={styles.aiDot}>
                    <SparkIcon size={11} />
                  </span>
                  <span>NexMeet</span>
                </>
              ) : (
                <span className={styles.userName}>{m.by}</span>
              )}
              <span className={styles.metaTime}>
                {new Date(m.ts).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <div className={styles.bubble}>{m.text}</div>
          </div>
        ))}

        {thinking && (
          <div className={`${styles.row} ${styles.rowAi}`}>
            <div className={styles.meta}>
              <span className={styles.aiDot}>
                <SparkIcon size={11} />
              </span>
              <span>NexMeet</span>
            </div>
            <div className={`${styles.bubble} ${styles.bubbleTyping}`}>
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
            </div>
          </div>
        )}

        {listening && partial && (
          <div className={`${styles.row} ${styles.rowUser} ${styles.rowPartial}`}>
            <div className={styles.meta}>
              <span className={styles.userName}>You (speaking…)</span>
            </div>
            <div className={`${styles.bubble} ${styles.bubblePartial}`}>{partial}</div>
          </div>
        )}
      </div>

      {error && <div className={styles.errorRow}>{error}</div>}

      <form className={styles.form} onSubmit={submit}>
        <input
          className={styles.input}
          placeholder="Ask NexMeet a question…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={500}
          tabIndex={open ? 0 : -1}
        />
        <button
          type="submit"
          className={styles.send}
          disabled={!input.trim() || thinking}
          aria-label="Send"
          tabIndex={open ? 0 : -1}
        >
          <ArrowRightIcon size={16} />
        </button>
      </form>
    </aside>
  );
}
