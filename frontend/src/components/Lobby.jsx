import { useState, useEffect, useRef } from "react";
import styles from "./Lobby.module.css";
import {
  MicIcon,
  MicOffIcon,
  CamIcon,
  CamOffIcon,
  HexagonIcon,
  ArrowRightIcon,
  LinkIcon,
  CheckIcon,
} from "./Icons.jsx";

export default function Lobby({ roomName, initialName, onJoin, loading }) {
  const [name, setName]     = useState(initialName || "");
  const [camOn, setCamOn]   = useState(true);
  const [micOn, setMicOn]   = useState(true);
  const [error, setError]   = useState("");
  const [stream, setStream] = useState(null);
  const [copied, setCopied] = useState(false);
  const videoRef = useRef(null);

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
    onJoin(name.trim(), { camOn, micOn });
  }

  function copyInviteLink() {
    // Strip the `user` query param so invitees don't inherit the inviter's name
    // (which would otherwise cause an identity-collision style kick).
    const url = new URL(window.location.href);
    url.searchParams.delete("user");
    navigator.clipboard.writeText(url.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className={styles.page}>
      <div className={styles.mesh} aria-hidden />

      <header className={styles.header}>
        <a href="/" className={styles.logo}>
          <span className={styles.logoIcon}><HexagonIcon size={22} /></span>
          <span className={styles.logoText}>NexMeet</span>
        </a>
      </header>

      <main className={styles.main}>
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
                <div className={styles.avatarBig}>
                  {name ? name[0].toUpperCase() : "?"}
                </div>
                <p>Camera is off</p>
              </div>
            )}

            {!micOn && (
              <div className={styles.mutePill}>
                <MicOffIcon size={14} />
                <span>Muted</span>
              </div>
            )}

            <div className={styles.mediaControls}>
              <button
                type="button"
                className={`${styles.mediaBtn} ${!micOn ? styles.mediaBtnOff : ""}`}
                onClick={() => setMicOn(v => !v)}
                title={micOn ? "Turn off microphone" : "Turn on microphone"}
                aria-label={micOn ? "Turn off microphone" : "Turn on microphone"}
              >
                {micOn ? <MicIcon size={20} /> : <MicOffIcon size={20} />}
              </button>
              <button
                type="button"
                className={`${styles.mediaBtn} ${!camOn ? styles.mediaBtnOff : ""}`}
                onClick={() => setCamOn(v => !v)}
                title={camOn ? "Turn off camera" : "Turn on camera"}
                aria-label={camOn ? "Turn off camera" : "Turn on camera"}
              >
                {camOn ? <CamIcon size={20} /> : <CamOffIcon size={20} />}
              </button>
            </div>
          </div>

          <div className={styles.roomInfo}>
            <div className={styles.roomInfoText}>
              <span className={styles.roomLabel}>Meeting code</span>
              <span className={styles.roomName}>{roomName}</span>
            </div>
            <button
              type="button"
              className={`${styles.copyLink} ${copied ? styles.copyLinkOk : ""}`}
              onClick={copyInviteLink}
            >
              {copied ? <CheckIcon size={14} /> : <LinkIcon size={14} />}
              <span>{copied ? "Copied!" : "Copy link"}</span>
            </button>
          </div>
        </div>

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
                  <span className={styles.prefIcon}>
                    {micOn ? <MicIcon size={16} /> : <MicOffIcon size={16} />}
                  </span>
                  <span>{micOn ? "Mic on" : "Mic off"}</span>
                </div>
                <div className={`${styles.pref} ${!camOn ? styles.prefOff : ""}`}>
                  <span className={styles.prefIcon}>
                    {camOn ? <CamIcon size={16} /> : <CamOffIcon size={16} />}
                  </span>
                  <span>{camOn ? "Camera on" : "Camera off"}</span>
                </div>
              </div>

              {error && <p className={styles.error}>{error}</p>}

              <button type="submit" className={styles.joinBtn} disabled={loading}>
                {loading ? (
                  <span className={styles.spinner} />
                ) : (
                  <>
                    <span>Join meeting</span>
                    <ArrowRightIcon size={18} />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
