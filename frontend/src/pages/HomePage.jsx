import { useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./HomePage.module.css";
import {
  HexagonIcon,
  ArrowRightIcon,
  ShieldIcon,
  CamIcon,
  MonitorIcon,
  ChatIcon,
  CopyIcon,
  CheckIcon,
} from "../components/Icons.jsx";

function generateRoomId() {
  const words = [
    "alpha", "bravo", "delta", "echo", "foxtrot",
    "gamma", "kilo", "lima", "nexus", "orbit",
    "pixel", "sigma", "tango", "ultra", "vector",
  ];
  const pick = () => words[Math.floor(Math.random() * words.length)];
  return `${pick()}-${pick()}-${pick()}`;
}

export default function HomePage() {
  const navigate = useNavigate();
  const [tab, setTab]           = useState("new"); // "new" | "join"
  const [username, setUsername] = useState("");
  const [roomInput, setRoomInput] = useState("");
  const [generatedRoom] = useState(generateRoomId);
  const [error, setError]       = useState("");
  const [copied, setCopied]     = useState(false);

  function copyRoom() {
    navigator.clipboard.writeText(generatedRoom);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleNew(e) {
    e.preventDefault();
    if (!username.trim()) return setError("Please enter your name.");
    setError("");
    navigate(`/room/${generatedRoom}?user=${encodeURIComponent(username.trim())}`);
  }

  function handleJoin(e) {
    e.preventDefault();
    if (!username.trim()) return setError("Please enter your name.");
    if (!roomInput.trim()) return setError("Please enter a room code.");
    setError("");
    navigate(`/room/${roomInput.trim()}?user=${encodeURIComponent(username.trim())}`);
  }

  return (
    <div className={styles.page}>
      {/* Background mesh */}
      <div className={styles.mesh} aria-hidden />

      {/* Header */}
      <header className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}><HexagonIcon size={24} /></span>
          <span className={styles.logoText}>NexMeet</span>
        </div>
      </header>

      {/* Hero */}
      <main className={styles.main}>
        <div className={styles.hero}>
          <div className={styles.badge}>Powered by LiveKit WebRTC</div>
          <h1 className={styles.headline}>
            Video calls that<br />
            <em>actually work.</em>
          </h1>
          <p className={styles.sub}>
            Crystal-clear video conferencing — no downloads, no installs, no nonsense.
          </p>
        </div>

        {/* Card */}
        <div className={styles.card}>
          {/* Tabs */}
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${tab === "new" ? styles.active : ""}`}
              onClick={() => { setTab("new"); setError(""); }}
            >
              New meeting
            </button>
            <button
              className={`${styles.tab} ${tab === "join" ? styles.active : ""}`}
              onClick={() => { setTab("join"); setError(""); }}
            >
              Join meeting
            </button>
          </div>

          {/* Form */}
          <form
            className={styles.form}
            onSubmit={tab === "new" ? handleNew : handleJoin}
          >
            <div className={styles.field}>
              <label className={styles.label}>Your name</label>
              <input
                className={styles.input}
                placeholder="e.g. Alex Johnson"
                value={username}
                onChange={e => setUsername(e.target.value)}
                maxLength={40}
                autoFocus
              />
            </div>

            {tab === "new" ? (
              <div className={styles.field}>
                <label className={styles.label}>Room ID (auto-generated)</label>
                <div className={styles.roomDisplay}>
                  <span className={styles.roomCode}>{generatedRoom}</span>
                  <button
                    type="button"
                    className={`${styles.copyBtn} ${copied ? styles.copyBtnOk : ""}`}
                    onClick={copyRoom}
                    title="Copy room ID"
                  >
                    {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
                    <span>{copied ? "Copied" : "Copy"}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.field}>
                <label className={styles.label}>Room code</label>
                <input
                  className={styles.input}
                  placeholder="e.g. alpha-bravo-delta"
                  value={roomInput}
                  onChange={e => setRoomInput(e.target.value)}
                />
              </div>
            )}

            {error && <p className={styles.error}>{error}</p>}

            <button type="submit" className={styles.btn}>
              <span>{tab === "new" ? "Start meeting" : "Join now"}</span>
              <ArrowRightIcon size={18} />
            </button>
          </form>
        </div>

        {/* Features row */}
        <div className={styles.features}>
          {[
            { icon: <ShieldIcon size={16} />,  label: "Secure WebRTC" },
            { icon: <CamIcon size={16} />,     label: "HD video & audio" },
            { icon: <MonitorIcon size={16} />, label: "Screen sharing" },
            { icon: <ChatIcon size={16} />,    label: "In-meeting chat" },
          ].map(f => (
            <div className={styles.feat} key={f.label}>
              <span className={styles.featIcon}>{f.icon}</span>
              <span className={styles.featLabel}>{f.label}</span>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
