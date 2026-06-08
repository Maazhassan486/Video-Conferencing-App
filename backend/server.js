import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import Groq from "groq-sdk";

dotenv.config();

const app = express();
app.use(
  cors({
    // Allow the production Vercel domain plus local dev origins. Extend
    // ALLOWED_ORIGINS in your env (comma-separated) to whitelist more.
    origin: [
      "https://video-conferencing-app-two-nu.vercel.app",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      ...((process.env.ALLOWED_ORIGINS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)),
    ],
  })
);
app.use(express.json());

const {
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET,
  LIVEKIT_URL,
  GROQ_API_KEY,
  GROQ_MODEL = "llama-3.1-8b-instant",
  PORT = 3001,
} = process.env;

if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
  console.error(
    "❌ Missing required env vars: LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL"
  );
  process.exit(1);
}

if (!GROQ_API_KEY) {
  // Don't kill the server — the AI agent endpoint will just return a
  // helpful error. The rest of the meeting app still works.
  console.warn(
    "⚠️  GROQ_API_KEY is not set — the NexMeet AI agent will be unavailable until it's configured."
  );
}

// Room service for listing/managing rooms
const roomService = new RoomServiceClient(
  LIVEKIT_URL.replace("wss://", "https://").replace("ws://", "http://"),
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET
);

// Groq client for the in-meeting AI assistant. Created lazily so the
// server still boots when GROQ_API_KEY is missing.
const groq = GROQ_API_KEY ? new Groq({ apiKey: GROQ_API_KEY }) : null;

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
    // LiveKit requires `identity` to be unique per participant in a room.
    // If two clients connect with the same identity, the newer connection
    // forcibly disconnects the older one. We therefore derive a unique
    // identity (username + short random suffix) while keeping `name` as
    // the human-readable display name shown in the UI.
    const suffix = Math.random().toString(36).slice(2, 10);
    const identity = `${username}__${suffix}`;

    const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity,
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

// ─── POST /ask ─────────────────────────────────────────────────────────────
// In-meeting AI agent ("NexMeet"). Frontend calls this when a participant
// explicitly addresses the assistant (e.g. by saying "Hey NexMeet, …" or
// typing into the AI panel). We forward the question to Groq and return
// a short, meeting-appropriate answer that the frontend can both display
// in the AI side-panel and speak aloud via the browser's SpeechSynthesis.
app.post("/ask", async (req, res) => {
  const { question, askedBy, room } = req.body || {};

  if (!question || typeof question !== "string" || !question.trim()) {
    return res.status(400).json({ error: "question is required" });
  }
  if (!groq) {
    return res
      .status(503)
      .json({ error: "AI assistant is not configured (missing GROQ_API_KEY)" });
  }

  try {
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      temperature: 0.6,
      max_tokens: 220,
      messages: [
        {
          role: "system",
          content:
            "You are NexMeet, a friendly AI assistant present inside a live video meeting. " +
            "Participants summon you by saying 'Hey Agent' (or 'Hey NexMeet') before their question. " +
            "Your answers are spoken aloud and shown in a small in-call side panel, so:\n" +
            "• Keep responses concise — 1 to 3 sentences, never more than ~60 words.\n" +
            "• Plain text only. No markdown, no lists, no headings, no code fences.\n" +
            "• Be direct, warm, and natural — like a helpful colleague on the call.\n" +
            "• If you don't know something or it requires real-time data you don't have, say so briefly.",
        },
        {
          role: "user",
          content: `${askedBy ? `[${askedBy} in room ${room || "unknown"} asks] ` : ""}${question.trim()}`,
        },
      ],
    });

    const answer =
      completion.choices?.[0]?.message?.content?.trim() ||
      "Sorry, I couldn't come up with a response.";

    return res.json({ answer });
  } catch (err) {
    console.error("Groq /ask error:", err);
    return res
      .status(500)
      .json({ error: "Failed to reach the NexMeet AI service" });
  }
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => {
  console.log(`✅ LiveKit token server running at http://localhost:${PORT}`);
});
