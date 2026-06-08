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
  const [mediaPrefs, setMediaPrefs] = useState({ camOn: true, micOn: true });

  // If name came from URL, auto-fetch token so lobby can show preview
  useEffect(() => {
    if (nameFromUrl) setUsername(nameFromUrl);
  }, [nameFromUrl]);

  // Drop the `user` query param from the address bar so anyone who copies
  // the URL directly doesn't inherit the inviter's name (which previously
  // caused the "joiner kicks the host" identity collision).
  useEffect(() => {
    if (searchParams.has("user")) {
      const params = new URLSearchParams(searchParams);
      params.delete("user");
      const qs = params.toString();
      const newUrl = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
      window.history.replaceState({}, "", newUrl);
    }
  }, [searchParams]);

  async function handleJoin(name, prefs = { camOn: true, micOn: true }) {
    setConnecting(true);
    try {
      await fetchToken(roomName, name);
      setUsername(name);
      setMediaPrefs(prefs);
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
        video={mediaPrefs.camOn}
        audio={mediaPrefs.micOn}
        onDisconnected={handleDisconnect}
        style={{ height: "100vh" }}
      >
        <VideoConferenceUI roomName={roomName} username={username} onLeave={handleDisconnect} />
      </LiveKitRoom>
    </div>
  );
}
