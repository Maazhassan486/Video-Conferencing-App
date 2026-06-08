import { useState, useEffect, useRef } from "react";
import styles from "./Lobby.module.css";

export default function Lobby({ roomName, initialName, onJoin, loading }) {
  const [name, setName]           = useState(initialName || "");
  const [camOn, setCamOn]         = useState(true);
  const [micOn, setMicOn]         = useState(true);
  const [error, setError]         = useState("");
  const [stream, setStream]       = useState(null);
  const videoRef = useRef(null);

  // Get camera preview
  useEffect(() => {
    let localStream;
    if (camOn) {
      navigator.mediaDevices
        .getUserMedia({ video: true, audio: false })
        .then(s => {
          localStream = s;
          setStream(s);
          if (videoRef.current) videoRef.current.srcObject = s;
        })
        .catch(() => setCamOn(false));
    } else {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
        setStream(null);
      }
      if (videoRef.current) videoRef.current.srcObject = null;
    }
    return () => {
      if (localStream) localStream.getTracks().forEach(t => t.stop());
    };
  }, [camOn]);

  function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return setError("Please enter your name.");
    setError("");
    onJoin(name.trim());
  }

  return (
    <div className={styles.page}>
      <div className={styles.mesh} aria-hidden />

      {/* Logo */}
      <header className={styles.header}>
        <a href="/" className={styles.logo}>
          <span className={styles.logoIcon}>⬡</span>
          <span className={styles.logoText}>NexMeet</span>
        </a>
      </header>

      <main className={styles.main}>
        {/* Preview */}
        <div className={styles.previewCol}>
          <div className={styles.videoBox}>
            {camOn ? (
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className={styles.video}
              />
            ) : (
              <div className={styles.videoOff}>
                <span className={styles.avatarBig}>{name ? name[0].toUpperCase() : "?"}</span>
                <p>Camera is off</p>
              </div>
            )}

            {/* Toggle buttons */}
            <div className={styles.mediaControls}>
              <button
                className={`${styles.mediaBtn} ${!micOn ? styles.mediaBtnOff : ""}`}
                onClick={() => setMicOn(v => !v)}
                title={micOn ? "Mute mic" : "Unmute mic"}
              >
                {micOn ? "🎙️" : "🔇"}
              </button>
              <button
                className={`${styles.mediaBtn} ${!camOn ? styles.mediaBtnOff : ""}`}
                onClick={() => setCamOn(v => !v)}
                title={camOn ? "Turn off camera" : "Turn on camera"}
              >
                {camOn ? "📷" : "📵"}
              </button>
            </div>
          </div>

          <div className={styles.roomInfo}>
            <span className={styles.roomLabel}>Room</span>
            <span className={styles.roomName}>{roomName}</span>
            <button
              className={styles.copyLink}
              onClick={() => navigator.clipboard.writeText(window.location.href)}
            >
              Copy invite link
            </button>
          </div>
        </div>

        {/* Join form */}
        <div className={styles.formCol}>
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Ready to join?</h2>
            <p className={styles.cardSub}>
              Check your camera and microphone, then enter your name.
            </p>

            <form className={styles.form} onSubmit={handleSubmit}>
              <div className={styles.field}>
                <label className={styles.label}>Your display name</label>
                <input
                  className={styles.input}
                  placeholder="e.g. Alex Johnson"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  maxLength={40}
                  autoFocus={!initialName}
                />
              </div>

              <div className={styles.prefsRow}>
                <div className={`${styles.pref} ${!micOn ? styles.prefOff : ""}`}>
                  <span>{micOn ? "🎙️" : "🔇"}</span>
                  <span>{micOn ? "Mic on" : "Mic off"}</span>
                </div>
                <div className={`${styles.pref} ${!camOn ? styles.prefOff : ""}`}>
                  <span>{camOn ? "📷" : "📵"}</span>
                  <span>{camOn ? "Camera on" : "Camera off"}</span>
                </div>
              </div>

              {error && <p className={styles.error}>{error}</p>}

              <button type="submit" className={styles.joinBtn} disabled={loading}>
                {loading ? (
                  <span className={styles.spinner} />
                ) : (
                  "Join meeting →"
                )}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
