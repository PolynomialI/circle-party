// End-to-end checks with real browsers and simulated lag. Screenshots and a video go to .e2e/
//   node e2e/play.mjs [lagMs]               4 players (plus one joining mid-game) play a full game of
//                                           Bomb Tag, then return to the lobby; also checks the wake-up screen
//   node e2e/play.mjs [lagMs] tour [ids..]  4 bots play each game (or the listed ones) for a while
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import express from 'express';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '.e2e');
const LAG = Number(process.argv[2] ?? 140);
const TOUR = process.argv[3] === 'tour';
const TOUR_GAMES = process.argv.slice(4);
const PORT = 3200 + Math.floor(Math.random() * 500);
const BASE = `http://localhost:${PORT}`;
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
function check(ok, msg) {
  if (!ok) throw new Error(`FAILED: ${msg}`);
  console.log(`ok - ${msg}`);
}

function startServer() {
  const proc = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } });
  return new Promise((resolve) => proc.stdout.on('data', (d) => d.toString().includes('listening') && resolve(proc)));
}

async function newPlayer(browser, label, video = false) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 }, ...(video ? { recordVideo: { dir: OUT, size: { width: 1000, height: 640 } } } : {}) });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  // The wake-up test expects failed connection attempts, so its console isn't checked.
  if (label !== 'wake') page.on('console', (m) => m.type() === 'error' && errors.push(`${label}: ${m.text()}`));
  page.label = label;
  return page;
}

async function setProfile(page, name, color) {
  await page.goto(`${BASE}/?lag=${LAG}`);
  await page.waitForSelector('#home:not(.hidden)');
  await page.fill('#name', name);
  await page.press('#name', 'Tab');
  await page.click(`.swatch >> nth=${color}`);
}

// Records frame times and the size of every prediction correction.
async function instrument(page) {
  await page.evaluate(() => {
    const m = (window.__metrics = { frames: 0, slow: 0, corrections: [] });
    let last = performance.now();
    const tick = (now) => {
      m.frames++;
      if (now - last > 34) m.slow++;
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    setInterval(() => {
      const g = window.__party.play && window.__party.play.game;
      if (g && !g.pred.__wrapped) {
        const orig = g.pred.reconcile.bind(g.pred);
        g.pred.reconcile = (s) => {
          const before = g.pred.state && { x: g.pred.state.x, y: g.pred.state.y };
          orig(s);
          if (before) m.corrections.push(Math.hypot(before.x - g.pred.state.x, before.y - g.pred.state.y));
        };
        g.pred.__wrapped = true;
      }
    }, 50);
  });
}

// A simple bot using real mouse and keyboard input: chase the nearest player it can see and
// click when close (swing, shoot or fire); wander when nobody is in sight.
async function bot(page, stopAt) {
  try {
    await botLoop(page, stopAt);
  } catch {
    // the page closed under us (a check failed and the test is ending)
  }
}

async function botLoop(page, stopAt) {
  const keys = { KeyW: false, KeyA: false, KeyS: false, KeyD: false };
  const setKey = async (k, on) => {
    if (keys[k] === on) return;
    keys[k] = on;
    await (on ? page.keyboard.down(k) : page.keyboard.up(k));
  };
  let swingUntil = 0;
  let wander = Math.random() * 6.28;
  while (Date.now() < stopAt()) {
    const s = await page.evaluate(() => {
      const g = window.__party.play && window.__party.play.game;
      if (!g || !g.view || !g.mePos) return null;
      const others = g.view.players.filter((p) => p.idx !== g.me && p.state === 0);
      const me = g.mePos;
      others.sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y));
      const t = others[0];
      const map = g.map || null;
      return {
        st: g.view.st, me, scr: g.stage.toScreen(me.x, me.y), w: g.stage.w, h: g.stage.h,
        mid: map ? { x: map.w / 2, y: map.h / 2 } : { x: 0, y: 0 },
        t: t && { x: t.x, y: t.y, scr: g.stage.toScreen(t.x, t.y) },
      };
    }).catch(() => null);
    if (s && s.st !== 0) {
      let dx;
      let dy;
      let d = Infinity;
      if (s.t) {
        dx = s.t.x - s.me.x;
        dy = s.t.y - s.me.y;
        d = Math.hypot(dx, dy) || 1;
        dx /= d;
        dy /= d;
        await page.mouse.move(s.t.scr.x, s.t.scr.y);
      } else {
        if (Math.random() < 0.05) wander += (Math.random() - 0.5) * 2;
        dx = Math.cos(wander);
        dy = Math.sin(wander);
        await page.mouse.move(s.scr.x + dx * 200, s.scr.y + dy * 200);
      }
      // Drift back towards the middle a little so bots don't just walk off.
      const cx = dx - (s.me.x - s.mid.x) / 700;
      const cy = dy - (s.me.y - s.mid.y) / 700;
      await setKey('KeyD', cx > 0.3);
      await setKey('KeyA', cx < -0.3);
      await setKey('KeyS', cy > 0.3);
      await setKey('KeyW', cy < -0.3);
      const now = Date.now();
      if (d < 420 && !swingUntil) {
        await page.mouse.down();
        swingUntil = now + Math.random() * 500;
      } else if (swingUntil && now > swingUntil) {
        await page.mouse.up();
        swingUntil = 0;
      }
      if (Math.random() < 0.03) await page.keyboard.press(['Space', 'KeyR', 'KeyQ', 'KeyE'][Math.floor(Math.random() * 4)]);
    } else {
      for (const k of Object.keys(keys)) await setKey(k, false);
    }
    await sleep(80);
  }
  for (const k of Object.keys(keys)) await setKey(k, false);
  await page.mouse.up();
}

// Make the room's playlist exactly these games.
async function setPlaylist(host, ids) {
  await host.evaluate((want) => {
    for (const id of want) if (!window.__party.room.playlist.includes(id)) window.__party.socket.emit('pick', { game: id });
  }, ids);
  await host.waitForFunction((want) => want.every((id) => window.__party.room.playlist.includes(id)), ids);
  await host.evaluate((want) => {
    for (const id of window.__party.room.playlist) if (!want.includes(id)) window.__party.socket.emit('pick', { game: id });
  }, ids);
  await host.waitForFunction((want) => window.__party.room.playlist.join() === want.join(), ids);
}

async function report(pages) {
  for (const p of pages) {
    const m = await p.evaluate(() => window.__metrics);
    const c = m.corrections.sort((a, b) => a - b);
    const q = (f) => (c.length ? c[Math.floor((c.length - 1) * f)].toFixed(1) : '-');
    console.log(`  ${p.label}: ${m.frames} frames, ${m.slow} over 34 ms; corrections median ${q(0.5)} px, p90 ${q(0.9)} px (${c.length} snapshots)`);
  }
}

// Each game in turn: a fresh room, 4 bots, screenshots part way through.
async function tour(browser) {
  const ids = TOUR_GAMES.length ? TOUR_GAMES : null;
  const pages = [];
  for (let i = 0; i < 4; i++) pages.push(await newPlayer(browser, ['Ann', 'Bob', 'Cat', 'Dan'][i]));
  for (let i = 0; i < 4; i++) await setProfile(pages[i], pages[i].label, i);
  const [host, ...guests] = pages;
  const catalog = await host.evaluate(() => window.__party.catalog.map((g) => g.id));
  for (const id of ids || catalog) {
    await host.goto(`${BASE}/?lag=${LAG}`);
    await host.waitForSelector('#home:not(.hidden)');
    await host.click('#create');
    await host.waitForSelector('#lobby:not(.hidden)');
    const code = (await host.textContent('#room-code')).trim();
    for (const g of guests) {
      await g.goto(`${BASE}/?room=${code}&lag=${LAG}`);
      await g.waitForSelector('#lobby:not(.hidden)');
    }
    await setPlaylist(host, [id]);
    await host.waitForFunction(() => !document.getElementById('start').disabled);
    for (const p of pages) await instrument(p);
    await host.click('#start');
    for (const p of pages) await p.waitForSelector('#game:not(.hidden)');
    let done = false;
    const bots = pages.map((p) => bot(p, () => (done ? 0 : Infinity)));
    await sleep(9000);
    await host.screenshot({ path: path.join(OUT, `tour-${id}-1.png`) });
    await guests[0].screenshot({ path: path.join(OUT, `tour-${id}-2.png`) });
    await sleep(14000);
    await host.screenshot({ path: path.join(OUT, `tour-${id}-3.png`) });
    done = true;
    await Promise.all(bots);
    console.log(`ok - ${id} played`);
    await report(pages);
    for (const p of pages) await p.evaluate(() => window.__party.socket.emit('leave'));
  }
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 5).join(' | ')}` : ''}`);
}

async function wakeScreenTest(browser) {
  // Serve the page from a separate static server, the way the static site does, pointed at a
  // game server that isn't up yet.
  const site = express();
  site.get('/config.js', (req, res) => res.type('text/javascript').send(`export const SERVER_URL = '${BASE}';`));
  site.use(express.static(path.join(ROOT, 'public')));
  const siteServer = site.listen(PORT + 1);
  const page = await newPlayer(browser, 'wake');
  await page.goto(`http://localhost:${PORT + 1}/`);
  await page.waitForSelector('#wake:not(.hidden)');
  await page.screenshot({ path: path.join(OUT, 'wake.png') });
  check(true, 'wake-up screen shows while the server is down');
  const server = await startServer();
  await page.waitForSelector('#home:not(.hidden)', { timeout: 20000 });
  check(true, 'home screen appears once the server is up');
  await page.context().close();
  siteServer.close();
  return server;
}

const browser = await chromium.launch();
const server = TOUR ? await startServer() : await wakeScreenTest(browser);
try {
  if (TOUR) {
    await tour(browser);
    process.exitCode = 0;
  } else {
  const names = ['Ann', 'Bob', 'Cat', 'Dan'];
  const pages = [];
  for (let i = 0; i < 4; i++) pages.push(await newPlayer(browser, names[i], i === 0));
  const [host, ...guests] = pages;
  await setProfile(host, 'Ann', 0);
  await host.screenshot({ path: path.join(OUT, 'home.png') });
  await host.click('#create');
  await host.waitForSelector('#lobby:not(.hidden)');
  const code = (await host.textContent('#room-code')).trim();
  check(code.length === 5, `room created (${code})`);

  // Bob joins by invite link, the others by code.
  await guests[0].goto(`${BASE}/?room=${code}&lag=${LAG}`);
  await guests[0].waitForSelector('#lobby:not(.hidden)');
  for (let i = 1; i < 3; i++) {
    await setProfile(guests[i], names[i + 1], i + 1);
    await guests[i].fill('#join-code', code);
    await guests[i].click('#join');
    await guests[i].waitForSelector('#lobby:not(.hidden)');
  }
  await host.waitForFunction(() => window.__party.room.members.length === 4);
  check(true, 'four players in the lobby (link and code joins)');

  await host.click('#game-pick button:has-text("Bomb Tag")');
  await host.waitForFunction(() => window.__party.room.playlist.includes('bombtag'));
  await setPlaylist(host, ['bombtag']);
  await host.selectOption('#game-settings select >> nth=0', '3');
  check(!(await host.isDisabled('#start')) && !(await guests[0].isVisible('#start')), 'only the host can start, and can start straight away');
  await host.screenshot({ path: path.join(OUT, 'lobby.png') });
  for (const p of pages) await instrument(p);
  await host.click('#start');
  for (const p of pages) await p.waitForSelector('#game:not(.hidden)');
  check(true, 'game started on all four');

  let done = false;
  const stopAt = () => (done ? 0 : Infinity);
  const bots = pages.map((p) => bot(p, stopAt));

  // Fifth player joins mid-game and should play from the next round.
  await sleep(4000);
  const late = await newPlayer(browser, 'Eve');
  await setProfile(late, 'Eve', 5);
  await late.fill('#join-code', code);
  await late.click('#join');
  await late.waitForSelector('#game:not(.hidden)');
  await instrument(late);
  const lateRound = await host.evaluate(() => window.__party.play.game.view.rd);
  check(await late.evaluate(() => !window.__party.play.game.acting), 'mid-game joiner spectates');
  bots.push(bot(late, stopAt));

  // Screenshot each new round's map, and watch for the late player getting a turn.
  const seenMaps = new Set();
  let lateAlive = false;
  const deadline = Date.now() + 8 * 60 * 1000;
  while (Date.now() < deadline) {
    const st = await host.evaluate(() => {
      const g = window.__party.play && window.__party.play.game;
      return { over: !document.getElementById('result').classList.contains('hidden'), rd: g && g.view && g.view.rd, map: g && g.map && g.map.name, st: g && g.view && g.view.st };
    });
    if (st.over) break;
    if (st.map && st.st === 1 && !seenMaps.has(`${st.rd}`)) {
      seenMaps.add(`${st.rd}`);
      await sleep(1200);
      await host.screenshot({ path: path.join(OUT, `round${st.rd}-${st.map.replace(/\s/g, '')}.png`) });
    }
    if (!lateAlive && (await late.evaluate(() => window.__party.play && window.__party.play.game.acting))) lateAlive = true;
    await sleep(250);
  }
  check(Date.now() < deadline, `game finished after ${seenMaps.size} rounds`);
  check(lateAlive, `mid-game joiner (joined in round ${lateRound}) played a later round`);
  await host.screenshot({ path: path.join(OUT, 'results.png') });
  for (const p of [...pages, late]) await p.waitForSelector('#result:not(.hidden)');
  check(true, 'results screen on every client');
  done = true;
  await Promise.all(bots);

  const winner = await host.evaluate(() => document.getElementById('result-title').textContent.trim());
  for (const p of [...pages, late]) await p.waitForSelector('#lobby:not(.hidden)', { timeout: 15000 });
  const points = await host.evaluate(() => window.__party.room.members.map((m) => `${m.name}:${m.points}`).join(' '));
  check(/:1/.test(points), `back in the lobby, points ${points} (${winner})`);
  await host.screenshot({ path: path.join(OUT, 'lobby-after.png') });

  await report([...pages, late]);
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  await pages[0].context().close(); // flush the video
  console.log(`video: ${await pages[0].video().path()}`);
  }
} finally {
  await browser.close();
  server.kill();
}
