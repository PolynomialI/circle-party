// End-to-end check with real browsers: 4 players (plus one joining mid-game) play a full Sumo
// game with simulated lag, then return to the lobby. Also checks the wake-up screen.
// Usage: node e2e/play.mjs [lagMs]   Screenshots and a video go to .e2e/
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

// A simple bot using real mouse and keyboard input: chase the nearest player, swing when close.
async function bot(page, stopAt) {
  const keys = { KeyW: false, KeyA: false, KeyS: false, KeyD: false };
  const setKey = async (k, on) => {
    if (keys[k] === on) return;
    keys[k] = on;
    await (on ? page.keyboard.down(k) : page.keyboard.up(k));
  };
  let swingUntil = 0;
  while (Date.now() < stopAt()) {
    const s = await page.evaluate(() => {
      const g = window.__party.play && window.__party.play.game;
      if (!g || !g.view || !g.mePos) return null;
      const others = g.view.players.filter((p) => p.idx !== g.me && p.state === 0);
      const me = g.mePos;
      others.sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y));
      const t = others[0];
      return { st: g.view.st, me, scr: g.stage.toScreen(me.x, me.y), t: t && { x: t.x, y: t.y, scr: g.stage.toScreen(t.x, t.y) } };
    }).catch(() => null);
    if (s && s.t && s.st !== 0) {
      const dx = s.t.x - s.me.x;
      const dy = s.t.y - s.me.y;
      const d = Math.hypot(dx, dy);
      // Drift back towards the middle a little so bots don't just walk off.
      const cx = dx / d - s.me.x / 600;
      const cy = dy / d - s.me.y / 600;
      await setKey('KeyD', cx > 0.3);
      await setKey('KeyA', cx < -0.3);
      await setKey('KeyS', cy > 0.3);
      await setKey('KeyW', cy < -0.3);
      await page.mouse.move(s.t.scr.x, s.t.scr.y);
      const now = Date.now();
      if (d < 75 && !swingUntil) {
        await page.mouse.down();
        swingUntil = now + Math.random() * 600;
      } else if (swingUntil && now > swingUntil) {
        await page.mouse.up();
        swingUntil = 0;
      }
      if (d < 140 && Math.random() < 0.04) await page.keyboard.press('Space');
    } else {
      for (const k of Object.keys(keys)) await setKey(k, false);
    }
    await sleep(80);
  }
  for (const k of Object.keys(keys)) await setKey(k, false);
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
const server = await wakeScreenTest(browser);
try {
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

  await host.selectOption('#game-settings select >> nth=0', '3');
  check(await host.isDisabled('#start'), 'start is blocked until everyone is ready');
  for (const g of guests) await g.click('#ready');
  await host.waitForFunction(() => !document.getElementById('start').disabled);
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
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    const st = await host.evaluate(() => {
      const g = window.__party.play && window.__party.play.game;
      return { over: !document.getElementById('result').classList.contains('hidden'), rd: g && g.view && g.view.rd, map: g && g.view && g.view.map.name, st: g && g.view && g.view.st };
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

  for (const p of [...pages, late]) {
    const m = await p.evaluate(() => window.__metrics);
    const c = m.corrections.sort((a, b) => a - b);
    const q = (f) => (c.length ? c[Math.floor((c.length - 1) * f)].toFixed(1) : '-');
    console.log(`  ${p.label}: ${m.frames} frames, ${m.slow} over 34 ms; prediction corrections median ${q(0.5)} px, p90 ${q(0.9)} px, max ${q(1)} px (${c.length} snapshots)`);
  }
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  await pages[0].context().close(); // flush the video
  console.log(`video: ${await pages[0].video().path()}`);
} finally {
  await browser.close();
  server.kill();
}
