import { useEffect, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { LiveKitRoom } from "@livekit/components-react";
import "@livekit/components-styles";
import { useToken } from "../hooks/useToken.js";
import VideoConferenceUI from "../components/VideoConferenceUI.jsx";
import Lobby from "../components/Lobby.jsx";
import styles from "./MeetingPage.module.css";

export default function MeetingPage() {
  const { roomName }       = useParams();
  const [searchParams]     = useSearchParams();
  const navigate           = useNavigate();
  const nameFromUrl        = searchParams.get("user") || "";

  const { token, serverUrl, loading, error, fetchToken } = useToken();
  const [username, setUsername] = useState(nameFromUrl);
  const [joined, setJoined]     = useState(false);
  const [connecting, setConnecting] = useState(false);

  // If name came from URL, auto-fetch token so lobby can show preview
  useEffect(() => {
    if (nameFromUrl) setUsername(nameFromUrl);
  }, [nameFromUrl]);

  async function handleJoin(name) {
    setConnecting(true);
    try {
      await fetchToken(roomName, name);
      setUsername(name);
      setJoined(true);
    } catch {
      setConnecting(false);
    }
  }

  function handleDisconnect() {
    navigate("/");
  }

  if (error) {
    return (
      <div className={styles.errorPage}>
        <div className={styles.errorCard}>
          <span className={styles.errorIcon}>⚠️</span>
          <h2>Connection Failed</h2>
          <p>{error}</p>
          <button className={styles.backBtn} onClick={() => navigate("/")}>
            ← Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (!joined || !token || !serverUrl) {
    return (
      <Lobby
        roomName={roomName}
        initialName={username}
        onJoin={handleJoin}
        loading={loading || connecting}
      />
    );
  }

  return (
    <div className={styles.roomWrapper} data-lk-theme="default">
      <LiveKitRoom
        serverUrl={serverUrl}
        token={token}
        connect={true}
        video={true}
        audio={true}
        onDisconnected={handleDisconnect}
        style={{ height: "100vh" }}
      >
        <VideoConferenceUI roomName={roomName} username={username} onLeave={handleDisconnect} />
      </LiveKitRoom>
    </div>
  );
}
