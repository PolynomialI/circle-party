# Circle Party

Small real-time multiplayer party games for friends, in the style of Circle Soccer. One player
creates a room and shares the code or link, everyone joins, and the host picks a game. The room
stays together between games and keeps a points table for the session.

## Games

- **Sumo:** knock everyone off the platform with your stick. Last one standing wins the round;
  first to N rounds wins. Six maps: Classic, Shrinking, Broken Ring, Turntable, Ice Rink, Pinball.

Controls are listed in Settings.

## Run locally

Requires Node 20+.

```bash
npm install
npm start          # http://localhost:3000
npm test           # game and room tests
npm run e2e        # 4+ browsers play a full game with 140 ms of simulated lag (screenshots in .e2e/)
```

Add `?lag=120` to the page URL to simulate 120 ms of round-trip lag.

## Deploy on Render

In the Render dashboard choose **New → Blueprint**, pick this repo and apply. `render.yaml`
creates two free services:

- `circle-party-server`: the Node game server (WebSocket). Free services sleep when idle.
- `circle-party`: a static site with the page. It never sleeps, so it can show "Waking up the
  server…" while the game server starts.

If Render gives either service a different URL, update `public/config.js`.

## How it works

- `server/rooms.js`: rooms, lobby, ready-up, host settings, points, the 60 Hz loop that steps
  every game and sends each player their own snapshot 30 times a second, and rate limiting.
- `server/games/`: one module per game (setup, input, step, per-player snapshot).
- `server/commands.js`: validates player input commands and queues one per tick.
- `public/shared/`: code the server and browser both use: the theme (all colours and sizes),
  timing, and each game's rules and movement (so the browser predicts your own movement with
  the server's code).
- `public/js/`: the browser client: hub screens (`main.js`), snapshot buffering, interpolation
  and prediction (`net.js`, `play.js`), canvas and camera (`stage.js`), flat drawing helpers
  (`draw.js`) and one renderer per game in `games/`.
- Hits are checked on the server against where the attacker saw the target (lag compensation,
  up to 200 ms back).
