import { useEffect, useState } from "react";
import {
  GridLayout,
  ParticipantTile,
  RoomAudioRenderer,
  useTracks,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
  ControlBar,
  Chat,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import styles from "./VideoConferenceUI.module.css";
import {
  HexagonIcon,
  InfoIcon,
  ChatIcon,
  UsersIcon,
  PhoneOffIcon,
  XIcon,
  CopyIcon,
  CheckIcon,
  SparkIcon,
} from "./Icons.jsx";
import NexMeetPanel from "./NexMeetPanel.jsx";
import { useNexMeetAgent } from "../hooks/useNexMeetAgent.js";

export default function VideoConferenceUI({ roomName, username, onLeave }) {
  const [chatOpen, setChatOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [aiOpen, setAiOpen]     = useState(false);
  const [copied, setCopied]     = useState(false);
  const [clock, setClock]       = useState(() => formatTime(new Date()));

  const participants         = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const room                 = useRoomContext();

  // NexMeet AI agent — handles wake-word listening, Groq calls, and
  // syncing the AI conversation across every participant in the room.
  const agent = useNexMeetAgent({ username, enabled: true });

  useEffect(() => {
    const id = setInterval(() => setClock(formatTime(new Date())), 30_000);
    return () => clearInterval(id);
  }, []);

  const tracks = useTracks(
    [
      { source: Track.Source.Camera,      withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  function handleLeave() {
    room.disconnect();
    onLeave();
  }

  function copyInviteLink() {
    const url = new URL(window.location.href);
    url.searchParams.delete("user");
    navigator.clipboard.writeText(url.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className={styles.wrapper}>
      <RoomAudioRenderer />

      {/* ── Top Bar ─────────────────────────────────────── */}
      <div className={styles.topBar}>
        <div className={styles.topLeft}>
          <span className={styles.logoIcon}><HexagonIcon size={20} /></span>
          <span className={styles.logoText}>NexMeet</span>
          <span className={styles.divider} aria-hidden />
          <span className={styles.clock}>{clock}</span>
        </div>

        <div className={styles.topCenter}>
          <span className={styles.roomChip} title={roomName}>{roomName}</span>
        </div>

        <div className={styles.topRight}>
          <span className={styles.participantCount} title="Participants">
            <UsersIcon size={14} />
            <span>{participants.length}</span>
          </span>
          <button
            type="button"
            className={`${styles.iconBtn} ${styles.iconBtnAi} ${aiOpen ? styles.iconBtnActive : ""} ${agent.inSession ? styles.iconBtnAiSession : ""}`}
            onClick={() => { setAiOpen(v => !v); setChatOpen(false); setInfoOpen(false); }}
            title={agent.inSession ? "NexMeet — in conversation" : "NexMeet AI assistant"}
            aria-label="NexMeet AI assistant"
          >
            <SparkIcon size={18} />
            {(agent.listening || agent.inSession) && (
              <span
                className={`${styles.aiDot} ${agent.inSession ? styles.aiDotSession : ""}`}
                aria-hidden
              />
            )}
          </button>
          <button
            type="button"
            className={`${styles.iconBtn} ${infoOpen ? styles.iconBtnActive : ""}`}
            onClick={() => { setInfoOpen(v => !v); setChatOpen(false); setAiOpen(false); }}
            title="Meeting info"
            aria-label="Meeting info"
          >
            <InfoIcon size={18} />
          </button>
          <button
            type="button"
            className={`${styles.iconBtn} ${chatOpen ? styles.iconBtnActive : ""}`}
            onClick={() => { setChatOpen(v => !v); setInfoOpen(false); setAiOpen(false); }}
            title="Toggle chat"
            aria-label="Toggle chat"
          >
            <ChatIcon size={18} />
          </button>
        </div>
      </div>

      {/* ── Info Drawer ─────────────────────────────────── */}
      {infoOpen && (
        <div className={styles.infoDrawer}>
          <div className={styles.infoHeader}>
            <h3 className={styles.infoTitle}>Meeting details</h3>
            <button
              type="button"
              className={styles.closeInfo}
              onClick={() => setInfoOpen(false)}
              aria-label="Close"
            >
              <XIcon size={16} />
            </button>
          </div>

          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Room</span>
            <span className={styles.infoValueMono}>{roomName}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Your name</span>
            <span className={styles.infoValue}>{username}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Participants</span>
            <span className={styles.infoValue}>{participants.length}</span>
          </div>

          <button
            type="button"
            className={`${styles.copyInvite} ${copied ? styles.copyInviteOk : ""}`}
            onClick={copyInviteLink}
          >
            {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
            <span>{copied ? "Link copied" : "Copy invite link"}</span>
          </button>
        </div>
      )}

      {/* ── Body ────────────────────────────────────────── */}
      <div className={styles.body}>
        <div className={styles.gridArea}>
          {tracks.length > 0 ? (
            <GridLayout tracks={tracks} className={styles.grid}>
              <ParticipantTile className={styles.tile} />
            </GridLayout>
          ) : (
            <div className={styles.emptyRoom}>
              <div className={styles.emptyIconWrap}>
                <UsersIcon size={32} />
              </div>
              <h3>Waiting for others to join…</h3>
              <p>Share the meeting code or invite link to add people.</p>
              <button
                type="button"
                className={`${styles.emptyCopyBtn} ${copied ? styles.emptyCopyBtnOk : ""}`}
                onClick={copyInviteLink}
              >
                {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
                <span>{copied ? "Link copied" : "Copy invite link"}</span>
              </button>
              <code className={styles.emptyCode}>{roomName}</code>
            </div>
          )}
        </div>

        {/*
         * NexMeet AI panel — always mounted so the conversation
         * (and listening state) persists across open/close.
         */}
        <NexMeetPanel
          open={aiOpen}
          onClose={() => setAiOpen(false)}
          conversation={agent.conversation}
          thinking={agent.thinking}
          listening={agent.listening}
          setListening={agent.setListening}
          partial={agent.partial}
          supportsSpeech={agent.supportsSpeech}
          onAsk={agent.ask}
          error={agent.error}
          inSession={agent.inSession}
          secondsRemaining={agent.secondsRemaining}
          onEndSession={agent.endSession}
        />

        {/*
         * Keep <Chat /> mounted at all times — LiveKit's Chat stores
         * message history in local React state, so unmounting it
         * (e.g. via {chatOpen && ...}) would wipe the conversation
         * every time the user closes the panel.
         */}
        <div
          className={`${styles.chatSidebar} ${chatOpen ? styles.chatSidebarOpen : styles.chatSidebarClosed}`}
          aria-hidden={!chatOpen}
        >
          <div className={styles.chatHeader}>
            <span>In-call messages</span>
            <button
              type="button"
              className={styles.closeChat}
              onClick={() => setChatOpen(false)}
              aria-label="Close chat"
              tabIndex={chatOpen ? 0 : -1}
            >
              <XIcon size={16} />
            </button>
          </div>
          <Chat className={styles.chat} />
        </div>
      </div>

      {/* ── Bottom Control Pill ─────────────────────────── */}
      <div className={styles.bottomBar}>
        <div className={styles.controlsPill}>
          <ControlBar
            controls={{
              microphone: true,
              camera: true,
              screenShare: true,
              chat: false,
              leave: false,
            }}
            variation="minimal"
            className={styles.controls}
          />
          <span className={styles.controlsDivider} aria-hidden />
          <button
            type="button"
            className={styles.leaveBtn}
            onClick={handleLeave}
            title="Leave call"
          >
            <PhoneOffIcon size={18} />
            <span>Leave</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function formatTime(d) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
