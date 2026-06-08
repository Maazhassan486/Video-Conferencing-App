# NexMeet — LiveKit Video Conferencing App

A full-featured Google Meet clone built with **React**, **LiveKit**, and **Express**.

---

## Project Structure

```
meet-app/
├── backend/          ← Node.js/Express token server
│   ├── server.js
│   ├── .env.example
│   └── package.json
└── frontend/         ← React + Vite app
    ├── src/
    │   ├── pages/
    │   │   ├── HomePage.jsx        ← Landing / create or join room
    │   │   └── MeetingPage.jsx     ← Loads LiveKit room
    │   ├── components/
    │   │   ├── Lobby.jsx           ← Pre-join camera/mic check
    │   │   └── VideoConferenceUI.jsx ← In-call UI (grid, chat, controls)
    │   ├── hooks/
    │   │   └── useToken.js         ← Fetches JWT from backend
    │   ├── App.jsx
    │   ├── main.jsx
    │   └── index.css
    ├── index.html
    ├── vite.config.js
    └── package.json
```

---

## Step 1 — Get LiveKit credentials

1. Go to **https://livekit.io** → Sign up for a free account
2. Create a new project
3. Go to **Settings → Keys**
4. Copy your:
   - `API Key`  (looks like `APIxxxxxxxxx`)
   - `API Secret` (looks like `xxxxxxxxxxxxxxxxxxxxxxxxxxxx`)
   - `WebSocket URL` (looks like `wss://your-project.livekit.cloud`)

---

## Step 2 — Configure the backend

```bash
cd meet-app/backend

# Copy env template
cp .env.example .env
```

Edit `.env` and fill in your credentials:

```env
LIVEKIT_API_KEY=APIxxxxxxxxxxxxxxxxx
LIVEKIT_API_SECRET=your_secret_here
LIVEKIT_URL=wss://your-project.livekit.cloud
PORT=3001
```

---

## Step 3 — Install & run the backend

```bash
cd meet-app/backend
npm install
npm run dev     # starts on http://localhost:3001
```

Test it works:
```
http://localhost:3001/health  → { "status": "ok" }
```

---

## Step 4 — Install & run the frontend

Open a **new terminal**:

```bash
cd meet-app/frontend
npm install
npm run dev     # starts on http://localhost:5173
```

The Vite dev server proxies `/api/*` → `http://localhost:3001` automatically.

---

## Step 5 — Use the app

1. Open **http://localhost:5173**
2. Click **"New meeting"** → enter your name → click **"Start meeting"**
3. You'll see a camera preview lobby — click **"Join meeting"**
4. Share the room code with others — they paste it into **"Join meeting"** tab

---

## Features

| Feature | Status |
|---|---|
| HD video & audio | ✅ |
| Multiple participants grid | ✅ |
| Mute / unmute mic | ✅ |
| Camera on/off | ✅ |
| Screen sharing | ✅ |
| In-call chat | ✅ |
| Pre-join lobby with camera preview | ✅ |
| Copy invite link | ✅ |
| Leave call button | ✅ |
| Auto-generated room IDs | ✅ |

---

## Backend API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/token?room=X&username=Y` | GET | Get JWT token to join room |
| `/rooms` | GET | List active rooms |
| `/rooms/:name` | DELETE | End a room |
| `/health` | GET | Health check |

---

## Deployment

### Backend (e.g. Railway, Render, Fly.io)
1. Push `backend/` folder
2. Set the 3 env vars (`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL`)
3. Set start command: `node server.js`

### Frontend (e.g. Vercel, Netlify)
1. Push `frontend/` folder
2. Set build command: `npm run build`
3. Set output directory: `dist`
4. Add env variable: `VITE_BACKEND_URL=https://your-backend-url.com`
5. Remove the proxy in `vite.config.js` for production (it's only for dev)

---

## Troubleshooting

**"Missing required env vars"** — Make sure `.env` exists in `/backend` with all 3 variables filled in.

**Camera not showing in lobby** — Browser needs camera permission. Click "Allow" when prompted.

**Can't connect to room** — Check your LiveKit URL format starts with `wss://` not `https://`.

**CORS errors** — Backend has CORS enabled for all origins in dev. In production, restrict it:
```js
app.use(cors({ origin: "https://your-frontend.com" }));
```
