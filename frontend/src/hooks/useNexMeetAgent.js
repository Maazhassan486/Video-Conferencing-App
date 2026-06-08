import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDataChannel, useRoomContext } from "@livekit/components-react";
import { useSpeechBroadcast } from "./useSpeechBroadcast.js";

const BACKEND = import.meta.env.VITE_BACKEND_URL || "/api";
const DATA_TOPIC = "nexmeet";

// Wake phrases — only used to OPEN a conversation. Once a session is
// open, the local user can continue speaking without repeating the
// wake word. Matched case-insensitively; longest/multi-word variants
// first so they take precedence.
const WAKE_PHRASES = [
  "hey agent", "hi agent", "ok agent", "okay agent", "yo agent",
  "hey nexmeet", "hi nexmeet", "ok nexmeet", "okay nexmeet",
  "hey next meet", "hey next-meet", "hey nex meet",
];

// Phrases that explicitly END the conversation. The agent will not
// answer these; the session simply closes.
const EXIT_PHRASES = [
  "thanks agent", "thank you agent", "bye agent", "goodbye agent",
  "that's all agent", "thats all agent", "stop agent", "dismiss agent",
];

// How long after the last interaction we stay "in conversation" before
// auto-closing. Reset on every new utterance the agent processes.
const CONVERSATION_TIMEOUT_MS = 60_000;

// Maximum number of conversation turns we keep in the rolling history
// sent to Groq. Keeps the prompt small and fast.
const HISTORY_LIMIT = 14;

// How long before "now" we look for peer transcripts to enrich the
// conversation context. Peer transcripts received within this window
// before the user's current question are treated as recent context.
const PEER_CONTEXT_LOOKBACK_MS = 25_000;

const isBrowserSpeechSupported = () =>
  typeof window !== "undefined" &&
  Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

function findWakePhrase(text) {
  const lower = text.toLowerCase();
  for (const phrase of WAKE_PHRASES) {
    const idx = lower.indexOf(phrase);
    if (idx !== -1) {
      const tail = text
        .slice(idx + phrase.length)
        .replace(/^[\s,.!?:;—-]+/, "")
        .trim();
      return { phrase, tail };
    }
  }
  return null;
}

function isExitPhrase(text) {
  const lower = text.toLowerCase().trim();
  return EXIT_PHRASES.some((p) => lower.includes(p));
}

/**
 * useNexMeetAgent (v2)
 *
 * The in-meeting AI agent, redesigned to feel like a real participant:
 *
 *  1. Wake-word opens a CONVERSATION SESSION lasting up to 60 s.
 *  2. While the session is open, the local user keeps speaking and each
 *     finalized utterance is treated as the next turn — no wake word
 *     needed. The session auto-extends on every turn.
 *  3. Saying "thanks agent" / "bye agent" / "stop agent" closes the
 *     session immediately. So does an explicit click of "End".
 *  4. Each call to Groq includes the rolling conversation history PLUS
 *     recent transcripts from OTHER participants (received over the
 *     LiveKit data channel via `useSpeechBroadcast`). This gives the
 *     agent multi-party awareness so it can summarize, refer to who
 *     said what, and engage with the whole room.
 *  5. The system prompt asks the model to emit the literal token
 *     "<silent>" when the latest user turn isn't addressed to it — that
 *     way the agent stays quiet during normal conversation that isn't
 *     directed at it.
 */
export function useNexMeetAgent({ username, enabled }) {
  const room = useRoomContext();

  // Conversation state — shared across all participants via the
  // `nexmeet` data-channel topic.
  const [conversation, setConversation] = useState([]);
  const [thinking, setThinking]         = useState(false);
  const [partial, setPartial]           = useState("");
  const [listening, setListening]       = useState(false);
  const [inSession, setInSession]       = useState(false);
  const [sessionUntil, setSessionUntil] = useState(0); // ts (ms) when session auto-closes
  const [error, setError]               = useState(null);

  const seenIdsRef         = useRef(new Set());
  const spokenIdsRef       = useRef(new Set());
  const peerTranscriptsRef = useRef([]); // [{ by, text, ts }]
  const sessionTimerRef    = useRef(null);

  const supportsSpeech = isBrowserSpeechSupported();

  /**
   * Speak an AI answer aloud via the browser's SpeechSynthesis API.
   * This runs on EVERY client (asker AND peers) — triggered locally
   * when we generate an answer, and via the data channel when a peer
   * generates one. That way everyone hears NexMeet from their own
   * speakers (TTS cannot reliably travel through LiveKit because of
   * the browser's mic echo cancellation).
   */
  const speakAnswer = useCallback((entry) => {
    if (!entry || entry.type !== "a" || !entry.text) return;
    if (spokenIdsRef.current.has(entry.id)) return;
    spokenIdsRef.current.add(entry.id);

    if (typeof window === "undefined" || !window.speechSynthesis) return;
    try {
      const utter = new SpeechSynthesisUtterance(entry.text);
      utter.rate = 1.05;
      utter.pitch = 1;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
    } catch (e) {
      console.warn("NexMeet: speechSynthesis failed", e);
    }
  }, []);

  const cancelSpeech = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  // Subscribe to AI conversation messages from peers
  const { message: incoming, send } = useDataChannel(DATA_TOPIC);

  useEffect(() => {
    if (!incoming) return;
    try {
      const text = new TextDecoder().decode(incoming.payload);
      const data = JSON.parse(text);
      if (!data) return;

      // Two kinds of payloads share this topic:
      //   - { kind: "transcript", by, text, ts }   — what someone said
      //   - everything else: conversation entries (question / answer)
      if (data.kind === "transcript") {
        peerTranscriptsRef.current = [
          ...peerTranscriptsRef.current,
          { by: data.by, text: data.text, ts: data.ts || Date.now() },
        ].slice(-50);
        return;
      }

      if (data.id && !seenIdsRef.current.has(data.id)) {
        seenIdsRef.current.add(data.id);
        setConversation((prev) => [...prev, data]);

        // Speak any AI answer received from a peer so everyone in the
        // room hears NexMeet — not just the person who asked.
        if (data.type === "a") speakAnswer(data);
      }
    } catch (e) {
      console.warn("NexMeet: failed to parse incoming message", e);
    }
  }, [incoming, speakAnswer]);

  // Broadcast an AI conversation entry to every participant
  const broadcast = useCallback(
    (entry) => {
      if (seenIdsRef.current.has(entry.id)) return;
      seenIdsRef.current.add(entry.id);
      setConversation((prev) => [...prev, entry]);
      try {
        const payload = new TextEncoder().encode(JSON.stringify(entry));
        send?.(payload, { reliable: true, topic: DATA_TOPIC });
      } catch (e) {
        console.warn("NexMeet: failed to broadcast", e);
      }
    },
    [send]
  );

  // Open / extend the conversation session
  const extendSession = useCallback(() => {
    const until = Date.now() + CONVERSATION_TIMEOUT_MS;
    setInSession(true);
    setSessionUntil(until);

    if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current);
    sessionTimerRef.current = setTimeout(() => {
      setInSession(false);
      setSessionUntil(0);
    }, CONVERSATION_TIMEOUT_MS);
  }, []);

  const endSession = useCallback(() => {
    if (sessionTimerRef.current) {
      clearTimeout(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }
    setInSession(false);
    setSessionUntil(0);
    cancelSpeech();
  }, [cancelSpeech]);

  /**
   * Send a user turn to NexMeet. Builds the message history from:
   *   • prior NexMeet Q/A entries (chronological)
   *   • recent peer transcripts within PEER_CONTEXT_LOOKBACK_MS
   *   • the current question
   */
  const ask = useCallback(
    async (rawQuestion, { fromVoice = false } = {}) => {
      const question = (rawQuestion || "").trim();
      if (!question) return;

      // Build message history for the model:
      //   1) prior Q / A pairs from the synced AI conversation
      //   2) recent peer transcripts (as user turns)
      //   3) the current question (as user turn, attributed)
      const now = Date.now();

      const aiTurns = conversation.map((m) => ({
        role: m.type === "a" ? "assistant" : "user",
        name: m.by,
        content: m.text,
        ts: m.ts || 0,
      }));

      const recentPeerTurns = peerTranscriptsRef.current
        .filter((t) => now - t.ts < PEER_CONTEXT_LOOKBACK_MS && t.by !== username)
        .map((t) => ({
          role: "user",
          name: t.by,
          content: t.text,
          ts: t.ts,
        }));

      const merged = [...aiTurns, ...recentPeerTurns]
        .sort((a, b) => (a.ts || 0) - (b.ts || 0))
        .slice(-HISTORY_LIMIT)
        .map(({ ts, ...m }) => m);

      const messagesForModel = [
        ...merged,
        { role: "user", name: username || "Someone", content: question },
      ];

      const baseId = `${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const qEntry = {
        id: `q-${baseId}`,
        type: "q",
        text: question,
        by: username || "Someone",
        ts: Date.now(),
      };
      broadcast(qEntry);

      setThinking(true);
      setError(null);

      // Abort the request if it stalls — Groq usually answers in <2 s,
      // but a hung TCP connection or rate-limit pause can otherwise
      // freeze the UI indefinitely.
      const controller = new AbortController();
      const timeoutMs = 20_000;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const t0 = performance.now();

      // Optional unused suppression for fromVoice — kept on the API in
      // case we want voice-only behaviours later.
      void fromVoice;

      console.log(
        `[NexMeet] → POST ${BACKEND}/ask  (history: ${messagesForModel.length} turns)`,
        { question, room: room?.name }
      );

      try {
        const res = await fetch(`${BACKEND}/ask`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: messagesForModel,
            askedBy: username,
            room: room?.name,
          }),
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        const ms = Math.round(performance.now() - t0);

        if (!res.ok) {
          console.error(
            `[NexMeet] ← ${res.status} in ${ms} ms`,
            data
          );
          throw new Error(
            data?.error || `Request failed (${res.status} ${res.statusText})`
          );
        }

        console.log(
          `[NexMeet] ← ${res.status} in ${ms} ms`,
          data?.silent ? "(silent)" : data?.answer?.slice(0, 80)
        );

        // Agent decided to stay quiet — keep the user's question visible
        // (it was already broadcast above) but don't render an empty AI
        // bubble.
        if (data.silent || data.answer == null) {
          if (inSession) extendSession();
          return;
        }

        const answer = String(data.answer).trim();
        const aEntry = {
          id: `a-${baseId}`,
          type: "a",
          text: answer,
          by: "NexMeet",
          ts: Date.now(),
        };
        // Broadcast over the data channel AND speak locally. Peers will
        // also hear it locally when they receive aEntry (see the
        // `incoming` handler above) — that's how we ensure everyone in
        // the room hears NexMeet, not just the asker.
        broadcast(aEntry);
        speakAnswer(aEntry);

        extendSession();
      } catch (e) {
        const ms = Math.round(performance.now() - t0);
        const msg =
          e.name === "AbortError"
            ? `Timed out after ${Math.round(timeoutMs / 1000)}s — check backend / Groq status`
            : e.message || "unknown error";
        console.error(`[NexMeet] ✗ failed after ${ms} ms`, e);

        // Errors are LOCAL to the asker — don't broadcast a fake answer
        // to everyone else in the room. Show it inline in the asker's
        // conversation only.
        const errEntry = {
          id: `err-${baseId}`,
          type: "a",
          text: `⚠️ ${msg}`,
          by: "NexMeet",
          ts: Date.now(),
          local: true,
        };
        seenIdsRef.current.add(errEntry.id);
        spokenIdsRef.current.add(errEntry.id); // never speak error bubbles
        setConversation((prev) => [...prev, errEntry]);
        setError(msg);
      } finally {
        clearTimeout(timeoutId);
        setThinking(false);
      }
    },
    [
      broadcast,
      conversation,
      extendSession,
      inSession,
      room?.name,
      speakAnswer,
      username,
    ]
  );

  /**
   * Handle a finalized transcript from the local user's mic.
   * Decides whether to:
   *   • Open a new session (wake phrase)
   *   • Continue the existing session (already in session)
   *   • End the session (exit phrase)
   *   • Ignore (background chatter, no wake phrase)
   */
  const handleLocalFinal = useCallback(
    (finalText) => {
      if (!finalText) return;

      // Exit takes priority over everything else
      if (inSession && isExitPhrase(finalText)) {
        endSession();
        return;
      }

      const wake = findWakePhrase(finalText);
      if (wake) {
        // Wake phrase fires regardless of session state. The trailing
        // text (if any) is the first turn of the (possibly new) session.
        extendSession();
        if (wake.tail.length >= 2) {
          ask(wake.tail, { fromVoice: true });
        }
        return;
      }

      // No wake phrase — only continue if a session is already open.
      if (inSession && finalText.length >= 2) {
        ask(finalText, { fromVoice: true });
      }
    },
    [ask, endSession, extendSession, inSession]
  );

  // Wire up the per-client SpeechRecognition. This both broadcasts
  // transcripts to peers and feeds finalized text back to us for
  // wake / continue / exit handling.
  useSpeechBroadcast({
    enabled: enabled && listening && supportsSpeech,
    localName: username,
    onFinalTranscript: handleLocalFinal,
    onInterim: setPartial,
  });

  // If the user disables listening, also close any active session
  useEffect(() => {
    if (!listening) endSession();
  }, [listening, endSession]);

  // Cleanup speech synthesis on unmount
  useEffect(() => () => cancelSpeech(), [cancelSpeech]);

  // Manual / text-mode asks: always treated as direct address, so they
  // also open or extend a conversation session.
  const askDirect = useCallback(
    (q) => {
      extendSession();
      return ask(q, { fromVoice: false });
    },
    [ask, extendSession]
  );

  const secondsRemaining = useMemo(() => {
    if (!inSession || !sessionUntil) return 0;
    return Math.max(0, Math.ceil((sessionUntil - Date.now()) / 1000));
  }, [inSession, sessionUntil]);

  return {
    conversation,
    thinking,
    partial,
    listening,
    setListening,
    inSession,
    sessionUntil,
    secondsRemaining,
    endSession,
    ask: askDirect,
    error,
    supportsSpeech,
  };
}
