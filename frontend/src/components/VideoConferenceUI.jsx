import { useState } from "react";
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

export default function VideoConferenceUI({ roomName, username, onLeave }) {
  const [chatOpen, setChatOpen]       = useState(false);
  const [infoOpen, setInfoOpen]       = useState(false);
  const participants                  = useParticipants();
  const { localParticipant }          = useLocalParticipant();
  const room                          = useRoomContext();

  // All camera + screen share tracks
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

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className={styles.wrapper}>
      {/* Audio renderer (invisible) */}
      <RoomAudioRenderer />

      {/* Top bar */}
      <div className={styles.topBar}>
        <div className={styles.topLeft}>
          <span className={styles.logoIcon}>⬡</span>
          <span className={styles.logoText}>NexMeet</span>
        </div>

        <div className={styles.topCenter}>
          <span className={styles.roomChip}>{roomName}</span>
        </div>

        <div className={styles.topRight}>
          <span className={styles.clock}>{timeStr}</span>
          <span className={styles.participantCount}>
            👥 {participants.length}
          </span>
          <button
            className={`${styles.iconBtn} ${infoOpen ? styles.iconBtnActive : ""}`}
            onClick={() => setInfoOpen(v => !v)}
            title="Meeting info"
          >
            ℹ️
          </button>
          <button
            className={`${styles.iconBtn} ${chatOpen ? styles.iconBtnActive : ""}`}
            onClick={() => setChatOpen(v => !v)}
            title="Toggle chat"
          >
            💬
          </button>
        </div>
      </div>

      {/* Info drawer */}
      {infoOpen && (
        <div className={styles.infoDrawer}>
          <h3 className={styles.infoTitle}>Meeting details</h3>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Room</span>
            <span className={styles.infoValue}>{roomName}</span>
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
            className={styles.copyInvite}
            onClick={() => navigator.clipboard.writeText(window.location.href)}
          >
            📋 Copy invite link
          </button>
        </div>
      )}

      {/* Main area */}
      <div className={styles.body}>
        {/* Video grid */}
        <div className={styles.gridArea}>
          {tracks.length > 0 ? (
            <GridLayout tracks={tracks} className={styles.grid}>
              <ParticipantTile className={styles.tile} />
            </GridLayout>
          ) : (
            <div className={styles.emptyRoom}>
              <div className={styles.emptyIcon}>📹</div>
              <h3>Waiting for others to join…</h3>
              <p>Share the room code to invite participants.</p>
              <code className={styles.emptyCode}>{roomName}</code>
            </div>
          )}
        </div>

        {/* Chat sidebar */}
        {chatOpen && (
          <div className={styles.chatSidebar}>
            <div className={styles.chatHeader}>
              <span>In-call messages</span>
              <button className={styles.closeChat} onClick={() => setChatOpen(false)}>✕</button>
            </div>
            <Chat className={styles.chat} />
          </div>
        )}
      </div>

      {/* Bottom control bar */}
      <div className={styles.bottomBar}>
        <ControlBar
          controls={{
            microphone: true,
            camera: true,
            screenShare: true,
            chat: false,   // We handle chat ourselves
            leave: false,  // We handle leave ourselves
          }}
          className={styles.controls}
        />
        <button className={styles.leaveBtn} onClick={handleLeave}>
          Leave call
        </button>
      </div>
    </div>
  );
}
