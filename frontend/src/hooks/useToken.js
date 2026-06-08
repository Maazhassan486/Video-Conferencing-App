import { useState, useCallback } from "react";

const BACKEND = import.meta.env.VITE_BACKEND_URL || "/api";

export function useToken() {
  const [token, setToken]       = useState(null);
  const [serverUrl, setServerUrl] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);

  const fetchToken = useCallback(async (room, username) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${BACKEND}/token?room=${encodeURIComponent(room)}&username=${encodeURIComponent(username)}`
      );
      if (!res.ok) throw new Error("Failed to fetch token");
      const data = await res.json();
      setToken(data.token);
      setServerUrl(data.serverUrl);
      return data;
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { token, serverUrl, loading, error, fetchToken };
}
