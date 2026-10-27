import { THEME, COLORS } from '../shared/theme.js';
import { connect } from './net.js';
import { Stage } from './stage.js';
import { Input } from './input.js';
import { Play } from './play.js';
import { CLIENT_GAMES } from './games/index.js';

const $ = (id) => document.getElementById(id);

// One theme: the page's CSS variables come from the same values the canvas uses.
const cssVars = {
  bg: THEME.bg, panel: THEME.panel, card: THEME.card, line: THEME.line, text: THEME.text, muted: THEME.muted,
  accent: THEME.accent, 'accent-hover': THEME.accentHover, 'accent-text': THEME.accentText, button: THEME.button,
  'button-hover': THEME.buttonHover, dim: THEME.dim, ready: THEME.ready, white: THEME.white, 'me-name': THEME.meName,
  font: THEME.font, mono: THEME.mono, red: COLORS[0].main, blue: COLORS[1].main,
};
for (const [k, v] of Object.entries(cssVars)) document.documentElement.style.setProperty(`--${k}`, v);

const PROFILE_KEY = 'circleParty.profile';
function loadProfile() {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_KEY)) || {};
    return { name: typeof p.name === 'string' ? p.name : '', color: Number.isInteger(p.color) ? p.color : Math.floor(Math.random() * COLORS.length) };
  } catch {
    return { name: '', color: 0 };
  }
}
function saveProfile() {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // private mode: the profile just isn't remembered
  }
}

const profile = loadProfile();
const socket = connect();
const stage = new Stage($('game'));
const input = new Input($('game'));

const app = {
  myId: null,
  screen: null,
  room: null,
  catalog: [],
  play: null,
  pendingRoom: new URLSearchParams(location.search).get('room'),
};
window.__party = app; // read by the automated browser tests

// ---- screens & overlays -------------------------------------------------------------

function showScreen(name) {
  for (const id of ['wake', 'home', 'lobby']) $(id).classList.toggle('hidden', id !== name);
  $('game').classList.toggle('hidden', name !== 'game');
  app.screen = name;
  refreshInput();
}

function overlayOpen() {
  return ['pause', 'settings'].some((id) => !$(id).classList.contains('hidden'));
}

function setOverlay(id, open) {
  $(id).classList.toggle('hidden', !open);
  refreshInput();
}

function refreshInput() {
  const on = app.screen === 'game' && app.play && !overlayOpen();
  if (!on) input.releaseAll();
  input.enabled = !!on;
}

let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3200);
}

function leaveRoom() {
  socket.emit('leave');
  app.play = null;
  app.room = null;
  setOverlay('pause', false);
  $('result').classList.add('hidden');
  showScreen('home');
}

// Only show the wake-up screen if connecting takes a moment (a sleeping server).
setTimeout(() => {
  if (!socket.connected && !app.screen) showScreen('wake');
}, 400);

// ---- home ----------------------------------------------------------------------------

function sendProfile() {
  socket.emit('hello', { name: profile.name, color: profile.color });
}

$('name').value = profile.name;
$('name').addEventListener('change', () => {
  profile.name = $('name').value.trim();
  saveProfile();
  sendProfile();
});

function renderSwatches() {
  const box = $('colors');
  box.replaceChildren();
  COLORS.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = `swatch${i === profile.color ? ' picked' : ''}`;
    b.style.background = c.main;
    b.style.borderColor = c.dark;
    b.title = c.name;
    b.setAttribute('aria-label', c.name);
    b.addEventListener('click', () => {
      profile.color = i;
      saveProfile();
      sendProfile();
      renderSwatches();
    });
    box.appendChild(b);
  });
}
renderSwatches();

$('create').addEventListener('click', () => socket.emit('create'));
const joinByCode = () => {
  const code = $('join-code').value.trim().toUpperCase();
  if (code.length === 5) socket.emit('join', { code });
  else toast('Room codes are 5 characters.');
};
$('join').addEventListener('click', joinByCode);
$('join-code').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinByCode();
});

// ---- lobby -----------------------------------------------------------------------------

$('copy-link').addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}?room=${app.room.code}`;
  try {
    await navigator.clipboard.writeText(url);
    toast('Invite link copied.');
  } catch {
    window.prompt('Copy this invite link:', url);
  }
});
$('ready').addEventListener('click', () => {
  const me = app.room && app.room.members.find((m) => m.id === app.myId);
  if (me) socket.emit('ready', { ready: !me.ready });
});
$('start').addEventListener('click', () => socket.emit('start'));
$('leave').addEventListener('click', leaveRoom);
$('game-pick').addEventListener('change', () => socket.emit('pick', { game: $('game-pick').value }));

function dot(colorIdx) {
  const d = document.createElement('span');
  d.className = 'dot';
  d.style.background = COLORS[colorIdx].main;
  d.style.borderColor = COLORS[colorIdx].dark;
  return d;
}

function cell(content, cls) {
  const td = document.createElement('td');
  if (cls) td.className = cls;
  if (content instanceof Node) td.appendChild(content);
  else td.textContent = content;
  return td;
}

function renderLobby(room) {
  const isHost = room.hostId === app.myId;
  const inLobby = room.phase === 'lobby';
  $('room-code').textContent = room.code;

  const table = $('players');
  table.replaceChildren();
  const head = document.createElement('tr');
  head.append(document.createElement('th'), document.createElement('th'), document.createElement('th'), Object.assign(document.createElement('th'), { textContent: 'Points' }));
  table.appendChild(head);
  for (const m of room.members) {
    const tr = document.createElement('tr');
    if (m.id === app.myId) tr.className = 'me';
    const host = m.id === room.hostId;
    tr.append(cell(dot(m.color)), cell(`${host ? '★ ' : ''}${m.name}`, 'name'), cell(m.ready || host ? '✓' : '', 'tick'), cell(String(m.points), 'num'));
    table.appendChild(tr);
  }

  const pick = $('game-pick');
  pick.replaceChildren(...app.catalog.map((g) => new Option(g.name, g.id)));
  pick.value = room.game;
  pick.disabled = !isHost || !inLobby;

  const box = $('game-settings');
  box.replaceChildren();
  const info = app.catalog.find((g) => g.id === room.game);
  for (const s of info ? info.settings : []) {
    const sel = document.createElement('select');
    sel.append(...s.options.map(([value, label]) => new Option(label, String(value))));
    sel.value = String(room.settings[s.key]);
    sel.disabled = !isHost || !inLobby;
    sel.addEventListener('change', () => {
      const opt = s.options.find(([value]) => String(value) === sel.value);
      if (opt) socket.emit('set', { key: s.key, value: opt[0] });
    });
    const label = document.createElement('label');
    label.className = 'setting';
    label.append(s.label, sel);
    box.appendChild(label);
  }

  const me = room.members.find((m) => m.id === app.myId);
  $('ready').classList.toggle('hidden', isHost);
  $('ready').classList.toggle('on', !!(me && me.ready));
  $('ready').disabled = !inLobby;
  $('start').classList.toggle('hidden', !isHost);
  $('start').disabled = !inLobby || room.members.some((m) => m.id !== room.hostId && !m.ready);
}

// ---- game --------------------------------------------------------------------------------

function startGame(start) {
  const mod = CLIENT_GAMES[start.game];
  if (!mod) return;
  app.play = new Play({ Game: mod.Game, start, myId: app.myId, socket, stage, input });
  $('result').classList.add('hidden');
  setOverlay('pause', false);
  showScreen('game');
}

function showResult({ result }) {
  const winner = result.standings.find((s) => s.id === result.winnerId);
  const title = $('result-title');
  title.replaceChildren();
  if (winner) title.append(dot(winner.color), ` ${winner.name} wins!`);
  else title.textContent = 'No winner';
  const table = $('result-table');
  table.replaceChildren();
  for (const s of result.standings) {
    const tr = document.createElement('tr');
    if (s.id === app.myId) tr.className = 'me';
    tr.append(cell(dot(s.color)), cell(s.name, 'name'), cell(String(s.score), 'num'));
    table.appendChild(tr);
  }
  setOverlay('pause', false);
  $('result').classList.remove('hidden');
}

// ---- socket ------------------------------------------------------------------------------

socket.on('welcome', (data) => {
  app.myId = data.id;
  app.catalog = data.games;
  if (!profile.name) {
    profile.name = data.name;
    $('name').value = data.name;
  }
  sendProfile();
  if (app.pendingRoom) {
    socket.emit('join', { code: app.pendingRoom });
    app.pendingRoom = null;
    history.replaceState(null, '', location.pathname);
  }
  showScreen('home');
});

socket.on('disconnect', () => {
  app.play = null;
  app.room = null;
  $('result').classList.add('hidden');
  setOverlay('pause', false);
  showScreen('wake');
});

socket.on('notice', ({ msg }) => toast(msg));

socket.on('room', (room) => {
  app.room = room;
  renderLobby(room);
  if (room.phase === 'lobby' && app.screen !== 'lobby') {
    // We just made or joined the room, or the game finished: back to the lobby.
    app.play = null;
    $('result').classList.add('hidden');
    setOverlay('pause', false);
    showScreen('lobby');
  } else if (room.phase !== 'lobby' && !app.play && app.screen !== 'lobby') {
    showScreen('lobby'); // joined while a game's results are showing
  }
});

socket.on('gameStart', startGame);
socket.on('roster', (roster) => app.play && app.play.setRoster(roster));
socket.on('snap', (snap) => app.play && app.play.onSnap(snap));
socket.on('gameEnd', showResult);

// ---- menu & settings ---------------------------------------------------------------------

function renderControls() {
  const box = $('controls');
  box.replaceChildren();
  const section = (title, rows) => {
    const h = document.createElement('h3');
    h.textContent = title;
    const table = document.createElement('table');
    table.className = 'list';
    for (const [action, key] of rows) {
      const tr = document.createElement('tr');
      tr.append(cell(action), cell(key, 'key'));
      table.appendChild(tr);
    }
    box.append(h, table);
  };
  section('General', [['Menu', 'Esc']]);
  for (const mod of Object.values(CLIENT_GAMES)) section(mod.name, mod.controls);
}
renderControls();

$('open-settings').addEventListener('click', () => setOverlay('settings', true));
$('pause-settings').addEventListener('click', () => setOverlay('settings', true));
$('close-settings').addEventListener('click', () => setOverlay('settings', false));
$('resume').addEventListener('click', () => setOverlay('pause', false));
$('leave-game').addEventListener('click', leaveRoom);

window.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape') return;
  if (!$('settings').classList.contains('hidden')) setOverlay('settings', false);
  else if (app.screen === 'game' && $('result').classList.contains('hidden')) {
    setOverlay('pause', $('pause').classList.contains('hidden'));
  }
});

// ---- render loop -------------------------------------------------------------------------

let lastFrame = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (app.screen === 'game' && app.play) app.play.frame(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
