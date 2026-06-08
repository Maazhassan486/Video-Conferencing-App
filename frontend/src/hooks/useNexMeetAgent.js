import { useCallback, useEffect, useRef, useState } from "react";
import { useDataChannel, useRoomContext } from "@livekit/components-react";

const BACKEND = import.meta.env.VITE_BACKEND_URL || "/api";

/**
 * Wake phrases the agent listens for. Matched case-insensitively anywhere
 * in a finalized speech result; everything after the phrase is treated as
 * the question for NexMeet. Saying e.g. "hey hassan ..." matches none of
 * these, so the agent stays silent.
 *
 * We use "agent" as the primary wake word because the Web Speech API
 * transcribes it far more reliably than the brand name "NexMeet". The
 * nexmeet variants (and common misrecognitions like "next meet") are
 * kept as fallbacks for users who prefer to address the assistant by
 * name. Phrases are listed longest-first so multi-word matches win.
 */
const WAKE_PHRASES = [
  // Primary — "agent" is transcribed reliably by the Web Speech API.
  "hey agent",
  "hi agent",
  "ok agent",
  "okay agent",
  "yo agent",
  // Fallbacks — the brand name and its common misrecognitions.
  "hey nexmeet",
  "hi nexmeet",
  "ok nexmeet",
  "okay nexmeet",
  "hey next meet",
  "hey next-meet",
  "hey nex meet",
  // We deliberately exclude the bare words "agent" / "nexmeet" — they
  // are too easy to trigger accidentally ("the real estate agent…").
  // Always require an explicit prefix ("hey/hi/ok/okay/yo").
];
const DATA_TOPIC = "nexmeet";

const isBrowserSpeechSupported = () =>
  typeof window !== "undefined" &&
  Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

/**
 * useNexMeetAgent
 *
 * Powers the in-meeting NexMeet AI assistant.
 *
 *  • Listens to the local participant's microphone via the browser's
 *    Web Speech API when `listening` is true, and only ever triggers
 *    when a wake phrase is heard — addressing the assistant by name.
 *  • Sends the post-wake-phrase question to the backend `/ask`
 *    endpoint, which proxies to Groq.
 *  • Broadcasts the (question, answer) pair to every other participant
 *    over a LiveKit data-channel topic so the AI conversation stays
 *    in sync across the entire room.
 *  • Speaks the answer aloud locally via SpeechSynthesis so the asker
 *    naturally hears it; LiveKit then carries that audio to peers.
 */
export function useNexMeetAgent({ username, enabled }) {
  const room = useRoomContext();
  const [conversation, setConversation] = useState([]);
  const [thinking, setThinking]         = useState(false);
  const [partial, setPartial]           = useState("");
  const [listening, setListening]       = useState(false);
  const [error, setError]               = useState(null);
  const recognitionRef                  = useRef(null);
  const wantListeningRef                = useRef(false);
  const seenIdsRef                      = useRef(new Set());

  const supportsSpeech = isBrowserSpeechSupported();

  // Sync any incoming AI messages from peers
  const { message: incoming, send } = useDataChannel(DATA_TOPIC);

  useEffect(() => {
    if (!incoming) return;
    try {
      const text = new TextDecoder().decode(incoming.payload);
      const entry = JSON.parse(text);
      if (!entry || !entry.id || seenIdsRef.current.has(entry.id)) return;
      seenIdsRef.current.add(entry.id);
      setConversation((prev) => [...prev, entry]);
    } catch (e) {
      console.warn("NexMeet: failed to parse incoming agent message", e);
    }
  }, [incoming]);

  /**
   * Append locally + broadcast over the data channel.
   */
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

  /**
   * Stop any in-progress utterance — used when the user disables voice
   * or leaves, so the assistant doesn't keep talking over the call.
   */
  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  /**
   * Ask the agent a question. Returns nothing — the answer is delivered
   * via the shared `conversation` state and the data channel.
   */
  const ask = useCallback(
    async (rawQuestion) => {
      const question = (rawQuestion || "").trim();
      if (!question) return;

      const baseId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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
      try {
        const res = await fetch(`${BACKEND}/ask`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            askedBy: username,
            room: room?.name,
          }),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data?.error || `Request failed (${res.status})`);
        }

        const answer = (data.answer || "I'm not sure how to respond.").trim();
        const aEntry = {
          id: `a-${baseId}`,
          type: "a",
          text: answer,
          by: "NexMeet",
          ts: Date.now(),
        };
        broadcast(aEntry);

        // Speak the answer for the asker. Other participants will hear
        // it through the asker's published audio track, and everyone
        // also sees the text via the synced data channel.
        if (typeof window !== "undefined" && window.speechSynthesis) {
          try {
            const utter = new SpeechSynthesisUtterance(answer);
            utter.rate = 1.05;
            utter.pitch = 1;
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(utter);
          } catch {
            /* ignore TTS failures */
          }
        }
      } catch (e) {
        const aEntry = {
          id: `a-${baseId}`,
          type: "a",
          text: `Sorry — I couldn't respond. (${e.message || "unknown error"})`,
          by: "NexMeet",
          ts: Date.now(),
        };
        broadcast(aEntry);
        setError(e.message);
      } finally {
        setThinking(false);
      }
    },
    [broadcast, room?.name, username]
  );

  /**
   * Parse a finalized speech transcript and, if it contains a wake
   * phrase followed by something, fire `ask` with the trailing text.
   */
  const handleFinalTranscript = useCallback(
    (finalText) => {
      if (!finalText) return;
      const lower = finalText.toLowerCase();
      for (const phrase of WAKE_PHRASES) {
        const idx = lower.indexOf(phrase);
        if (idx === -1) continue;
        const tail = finalText
          .slice(idx + phrase.length)
          .replace(/^[\s,.!?:;—-]+/, "")
          .trim();
        if (tail.length >= 2) {
          ask(tail);
        }
        return;
      }
    },
    [ask]
  );

  /**
   * Manage the SpeechRecognition lifecycle based on `enabled` (component
   * mounted) and `listening` (user toggled it on).
   */
  useEffect(() => {
    if (!enabled || !listening) {
      wantListeningRef.current = false;
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* noop */ }
        recognitionRef.current = null;
      }
      setPartial("");
      return;
    }

    if (!supportsSpeech) {
      setError("Speech recognition isn't supported in this browser.");
      setListening(false);
      return;
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.continuous     = true;
    recognition.interimResults = true;
    recognition.lang           = "en-US";

    wantListeningRef.current = true;

    recognition.onresult = (event) => {
      let interim = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += transcript + " ";
        else interim += transcript;
      }
      setPartial(interim);
      if (finalText.trim()) handleFinalTranscript(finalText.trim());
    };

    recognition.onerror = (e) => {
      // "no-speech" and "aborted" are routine; surface only real issues.
      if (e?.error && e.error !== "no-speech" && e.error !== "aborted") {
        setError(`Voice recognition error: ${e.error}`);
      }
    };

    recognition.onend = () => {
      // Auto-restart while the user still wants to listen — Chrome will
      // end the session after a short pause otherwise.
      if (wantListeningRef.current && recognitionRef.current === recognition) {
        try { recognition.start(); } catch { /* already starting */ }
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch (e) {
      console.warn("NexMeet: failed to start speech recognition", e);
      setError("Couldn't start voice listening.");
      setListening(false);
    }

    return () => {
      wantListeningRef.current = false;
      try { recognition.stop(); } catch { /* noop */ }
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }
    };
  }, [enabled, listening, supportsSpeech, handleFinalTranscript]);

  // Cleanup speech synthesis on unmount
  useEffect(() => stopSpeaking, [stopSpeaking]);

  return {
    conversation,
    thinking,
    partial,
    listening,
    setListening,
    ask,
    error,
    supportsSpeech,
    stopSpeaking,
  };
}
