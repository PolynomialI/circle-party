# Circle Party

Small real-time multiplayer party games for friends, drawn as a cartoon sci-fi facility seen from
above. One player creates a room and shares the code or link, everyone joins (up to 8), and the
host picks one or more games to play in turn. The room stays together between games and keeps a points table for the session.

## Games

| Game | What you do |
| --- | --- |
| Dark Ops | Flashlight shootout in dark facilities: free-for-all, teams, or Gun Game (a better gun per kill, a worse one per death). Glowing crates hold power-ups. |
| Deathrunner | One killer rides a conveyor beside the course and fires traps; everyone else runs, jumps and climbs to the finish. |
| Sky Run | Race the same kind of obstacle course with no killer. |
| Infection | Survivors with flashlights against fast infected. Anyone tagged turns; the infected score per tag. |
| Sumo | Knock everyone off the platform with your stick. Your dash is a leap over gaps. |
| Ricochet Tanks | A new maze each round. Bullets bounce; one hit and you're out. Crates hold lasers, gatlings, frags and mines. |
| Bomb Tag | Touch someone to pass the bomb before it blows. |
| Hex Drop | Tiles fall soon after you step on them. |
| Paint Grab | Paint the most floor in your colour. |
| King of the Hill | Hold the moving zone alone; stick fights to clear it. |
| Crown Keeper | Keep the crown the longest; touch the holder to steal it. |
| Spin Cycle | Jump the low bar and duck the high one as the platform shrinks. |
| Floor is Lava | Get onto a stone before the floor turns to lava. Fewer stones each wave. |
| Wall Rush | Find the gaps in the walls sweeping down the platform. Crates hold a punching glove, a spring, a drill and a freeze. |
| Light Trails | Always moving, leaving a wall (with gaps) behind you. A point for everyone you outlast. Hop, cut, ghost and scramble power-ups; pylon and portal maps; the walls close in. |

Bomb Tag, Paint Grab and Crown Keeper also have power-up crates (rocket boots, bubble shield, punching glove, blink; a paint bomb in Paint Grab). Controls for every game are listed in Settings.

## Run locally

Requires Node 20+.

```bash
npm install
npm start          # http://localhost:3000
npm test           # game and room tests
npm run e2e        # 4+ browsers play a full game with 140 ms of simulated lag (screenshots in .e2e/)
node e2e/play.mjs 140 tour   # 4 bots play every game in turn
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
- `server/games/`: one module per game (setup, input, step, per-player snapshot). `arena.js` is the
  shared base (rounds, first-to-N, snapshots); `walkgame.js` adds walking around a map with walls.
- `server/commands.js`: validates player input commands and queues one per tick.
- `public/shared/`: code the server and browser both use: the theme (all colours and sizes),
  timing, maps, and each game's rules and movement (so the browser predicts your own movement
  with the server's code).
- `public/js/`: the browser client: hub screens (`main.js`), snapshot buffering, interpolation
  and prediction (`net.js`, `play.js`), canvas and camera (`stage.js`), flat drawing helpers
  (`draw.js`, `world-draw.js`) and one renderer per game in `games/`.
- Hits are checked on the server against where the attacker saw the target (lag compensation,
  up to 200 ms back). In Dark Ops and Infection the server only sends each player the enemies
  inside their own light.
