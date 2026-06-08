import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const {
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET,
  LIVEKIT_URL,
  PORT = 3001,
} = process.env;

if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
  console.error(
    "❌ Missing required env vars: LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL"
  );
  process.exit(1);
}

// Room service for listing/managing rooms
const roomService = new RoomServiceClient(
  LIVEKIT_URL.replace("wss://", "https://").replace("ws://", "http://"),
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET
);

// ─── GET /token ───────────────────────────────────────────────────────────────
// Generate a JWT token for a participant to join a room
app.get("/token", async (req, res) => {
  const { room, username } = req.query;

  if (!room || !username) {
    return res
      .status(400)
      .json({ error: "room and username query params are required" });
  }

  try {
    const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: username,
      name: username,
      ttl: "6h",
    });

    token.addGrant({
      roomJoin: true,
      room,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const jwt = await token.toJwt();
    return res.json({ token: jwt, serverUrl: LIVEKIT_URL });
  } catch (err) {
    console.error("Token generation error:", err);
    return res.status(500).json({ error: "Failed to generate token" });
  }
});

// ─── GET /rooms ───────────────────────────────────────────────────────────────
// List active rooms
app.get("/rooms", async (_req, res) => {
  try {
    const rooms = await roomService.listRooms();
    return res.json({ rooms });
  } catch (err) {
    console.error("List rooms error:", err);
    return res.status(500).json({ error: "Failed to list rooms" });
  }
});

// ─── DELETE /rooms/:roomName ──────────────────────────────────────────────────
// End / delete a room
app.delete("/rooms/:roomName", async (req, res) => {
  try {
    await roomService.deleteRoom(req.params.roomName);
    return res.json({ success: true });
  } catch (err) {
    console.error("Delete room error:", err);
    return res.status(500).json({ error: "Failed to delete room" });
  }
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => {
  console.log(`✅ LiveKit token server running at http://localhost:${PORT}`);
});
