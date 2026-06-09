import { useCallback, useEffect, useRef } from "react";
import { useDataChannel } from "@livekit/components-react";

const DATA_TOPIC = "nexmeet";

/**
 * useSpeechBroadcast
 *
 * Runs the browser's Web Speech API on the local participant's microphone
 * and broadcasts every *finalized* transcript over the LiveKit `nexmeet`
 * data-channel topic with shape `{ kind: "transcript", by, text, ts }`.
 *
 * It does NOT itself fire the NexMeet agent; it just streams what the
 * local user is saying out to peers so the agent's host client can merge
 * everyone's transcripts and feed the full multi-party conversation
 * back to the LLM.
 *
 * The hook also calls back on every finalized local transcript via
 * `onFinalTranscript` (used by the agent hook to wake / continue the
 * conversation), and on partials via `onInterim` (used purely for UI).
 *
 * All capture is gated by `enabled`. When false, the recognizer is
 * fully torn down — no mic access, no background processing.
 */
export function useSpeechBroadcast({
  enabled,
  localName,
  onFinalTranscript,
  onInterim,
}) {
  const { send } = useDataChannel(DATA_TOPIC);
  const recognitionRef   = useRef(null);
  const wantListeningRef = useRef(false);
  const onFinalRef       = useRef(onFinalTranscript);
  const onInterimRef     = useRef(onInterim);

  // Keep latest callbacks without re-creating the recognizer on every render
  useEffect(() => { onFinalRef.current = onFinalTranscript; }, [onFinalTranscript]);
  useEffect(() => { onInterimRef.current = onInterim; }, [onInterim]);

  const broadcast = useCallback(
    (text) => {
      if (!send || !text) return;
      const payload = new TextEncoder().encode(
        JSON.stringify({
          kind: "transcript",
          by: localName || "Someone",
          text,
          ts: Date.now(),
        })
      );
      try { send(payload, { reliable: true, topic: DATA_TOPIC }); }
      catch (e) { /* peers might not be reachable yet; ignore */ }
    },
    [send, localName]
  );

  useEffect(() => {
    if (!enabled) {
      wantListeningRef.current = false;
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* noop */ }
        recognitionRef.current = null;
      }
      return;
    }

    const SR =
      typeof window !== "undefined" &&
      (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SR) return; // unsupported browser — UI handles the messaging

    const recognition = new SR();
    recognition.continuous     = true;
    recognition.interimResults = true;
    recognition.lang           = "en-US";

    wantListeningRef.current = true;

    recognition.onresult = (event) => {
      let interim = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += t + " ";
        else interim += t;
      }
      if (interim) onInterimRef.current?.(interim);
      const trimmed = finalText.trim();
      if (trimmed) {
        // Visible in DevTools so you can see exactly what the recognizer
        // heard. If the agent "didn't respond", check here first — it
        // usually means the wake phrase wasn't matched, not that the
        // mic missed you.
        console.log(`[SpeechBroadcast] heard: "${trimmed}"`);
        broadcast(trimmed);
        onFinalRef.current?.(trimmed);
      }
    };

    recognition.onerror = (e) => {
      if (e?.error && e.error !== "no-speech" && e.error !== "aborted") {
        console.warn("[SpeechBroadcast] error:", e.error);
      }
    };

    // Chrome ends the session after a pause; auto-restart while wanted.
    recognition.onend = () => {
      if (wantListeningRef.current && recognitionRef.current === recognition) {
        try { recognition.start(); } catch { /* already restarting */ }
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch (e) {
      console.warn("SpeechBroadcast: failed to start", e);
    }

    return () => {
      wantListeningRef.current = false;
      try { recognition.stop(); } catch { /* noop */ }
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }
    };
  }, [enabled, broadcast]);
}
