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
// Conversation endpoint for the in-meeting NexMeet AI agent.
//
// Body shape (preferred):
//   {
//     messages: [
//       { role: "user" | "assistant", content: string, name?: string }, ...
//     ],
//     room?: string,
//     askedBy?: string,
//   }
//
// Legacy shape (still supported for backward compatibility with older
// clients):  { question, askedBy, room }
//
// We prepend a system message that primes NexMeet to behave like a
// meeting attendee — concise spoken-style answers, aware that multiple
// people are in the conversation, only responding when addressed/invited.
app.post("/ask", async (req, res) => {
  const body = req.body || {};
  const room = body.room;
  const askedBy = body.askedBy;

  let messages = Array.isArray(body.messages) ? body.messages : null;

  // Legacy single-question fallback
  if (!messages && body.question && typeof body.question === "string") {
    messages = [{ role: "user", name: askedBy, content: body.question.trim() }];
  }

  if (!messages || messages.length === 0) {
    return res.status(400).json({ error: "messages (or question) is required" });
  }
  if (!groq) {
    return res
      .status(503)
      .json({ error: "AI assistant is not configured (missing GROQ_API_KEY)" });
  }

  // Normalize incoming messages: keep only known roles, trim, drop blanks,
  // and prefix user content with the speaker's name so NexMeet knows who
  // said what across multiple participants.
  const cleaned = messages
    .filter((m) => m && typeof m.content === "string" && m.content.trim())
    .map((m) => {
      const role = m.role === "assistant" ? "assistant" : "user";
      let content = m.content.trim();
      if (role === "user" && m.name && !content.startsWith(`${m.name}:`)) {
        content = `${m.name}: ${content}`;
      }
      return { role, content };
    })
    // Hard cap to keep the prompt reasonable in size
    .slice(-24);

  const systemPrompt =
    "You are NexMeet, an AI assistant who participates in a live video meeting alongside the human attendees. " +
    `The meeting room is "${room || "(unknown)"}".\n\n` +
    "BEHAVIOR\n" +
    "• You are in 'conversation mode' — recent turns from multiple participants are provided as context. " +
    "Each user message is prefixed with the speaker's display name and a colon (e.g. 'Alice: ...'). " +
    "Use those names to follow who said what; refer to people by first name when natural.\n" +
    "• You only speak when explicitly addressed (e.g. someone says 'agent', 'NexMeet', or directly invites your opinion). " +
    "If the latest user turn isn't addressed to you, output exactly the single token: <silent>\n" +
    "• Otherwise reply directly. Keep responses concise — 1 to 3 sentences, ~60 words max — because your answer will be read aloud.\n" +
    "• Plain conversational text only. No markdown, no bullet lists, no headings, no code fences.\n" +
    "• Be warm and natural, like a sharp colleague on the call. Don't preface with 'Sure!' or 'Great question!'.\n" +
    "• If asked to summarize or recap, use the prior turns in this conversation.\n" +
    "• If you don't know something or it requires real-time data, say so briefly.\n" +
    `${askedBy ? `\nThe most recent person who explicitly addressed you is ${askedBy}.\n` : ""}`;

  const lastTurn = cleaned[cleaned.length - 1];
  const t0 = Date.now();
  console.log(
    `[ask] room=${room || "-"} by=${askedBy || "-"} turns=${cleaned.length} ` +
      `last="${(lastTurn?.content || "").slice(0, 80)}"`
  );

  try {
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      temperature: 0.6,
      max_tokens: 220,
      messages: [{ role: "system", content: systemPrompt }, ...cleaned],
    });
    const ms = Date.now() - t0;

    const raw =
      completion.choices?.[0]?.message?.content?.trim() ||
      "Sorry, I couldn't come up with a response.";

    const usage = completion.usage || {};
    if (raw === "<silent>" || /^<silent>\.?$/.test(raw)) {
      console.log(
        `[ask] ✓ ${ms}ms model=${GROQ_MODEL} tokens=${usage.total_tokens || "?"} (silent)`
      );
      return res.json({ answer: null, silent: true });
    }

    console.log(
      `[ask] ✓ ${ms}ms model=${GROQ_MODEL} tokens=${usage.total_tokens || "?"} ` +
        `answer="${raw.slice(0, 80)}${raw.length > 80 ? "…" : ""}"`
    );
    return res.json({ answer: raw });
  } catch (err) {
    const ms = Date.now() - t0;
    // Surface the real Groq error code/status — typical culprits are 429
    // (rate limit), 401 (bad key), 503 (Groq outage), or timeouts.
    const status = err?.status || err?.response?.status;
    const code   = err?.code || err?.error?.code;
    const detail = err?.error?.message || err?.message || String(err);
    console.error(
      `[ask] ✗ ${ms}ms model=${GROQ_MODEL} status=${status || "-"} code=${code || "-"} :: ${detail}`
    );
    return res.status(502).json({
      error: `Groq error${status ? ` (${status})` : ""}: ${detail}`,
      status: status || null,
      code: code || null,
    });
  }
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => {
  console.log(`✅ LiveKit token server running at http://localhost:${PORT}`);
});
