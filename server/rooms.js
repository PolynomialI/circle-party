import { DT, SNAP_EVERY } from '../public/shared/loop.js';
import { COLORS } from '../public/shared/theme.js';
import { GAMES, CATALOG } from './games/index.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const MAX_MEMBERS = 8;
const RATE = { burst: 60, perSec: 60 }; // messages per socket

function cleanName(name) {
  const s = typeof name === 'string' ? name.replace(/[^\p{L}\p{N} _.\-!?]/gu, '').trim().slice(0, 16) : '';
  return s || `Player${Math.floor(Math.random() * 900 + 100)}`;
}

function cleanColor(c) {
  return Number.isInteger(c) && c >= 0 && c < COLORS.length ? c : 0;
}

// Rooms, the lobby between games, and the fixed-rate loop that drives every game.
export class Rooms {
  constructor(io, { resultsTime = 6000 } = {}) {
    this.io = io;
    this.resultsTime = resultsTime;
    this.rooms = new Map(); // code -> room
    io.on('connection', (socket) => this.onConnection(socket));
  }

  start() {
    let last = performance.now();
    let acc = 0;
    this.timer = setInterval(() => {
      const now = performance.now();
      acc += (now - last) / 1000;
      last = now;
      if (acc > 0.25) acc = 0.25; // don't spiral after a stall
      while (acc >= DT) {
        acc -= DT;
        this.tick();
      }
    }, 4);
  }

  stop() {
    clearInterval(this.timer);
    for (const room of this.rooms.values()) clearTimeout(room.resultsTimer);
  }

  tick() {
    for (const room of this.rooms.values()) {
      const game = room.game;
      if (!game || room.phase !== 'playing') continue;
      game.step();
      const ended = !!game.result;
      if (game.tick % SNAP_EVERY === 0 || ended) {
        for (const [id, m] of room.members) {
          const sock = ended ? m.client.socket : m.client.socket.volatile;
          sock.emit('snap', game.snapshotFor(id));
        }
      }
      if (ended) this.endGame(room);
    }
  }

  onConnection(socket) {
    const client = { socket, name: cleanName(), color: 0, room: null, tokens: RATE.burst, last: performance.now() };
    const on = (ev, fn) => socket.on(ev, (data) => {
      if (this.allow(client)) fn(data);
    });
    socket.emit('welcome', { id: socket.id, name: client.name, games: CATALOG });

    on('hello', (d) => {
      client.name = cleanName(d && d.name);
      client.color = cleanColor(d && d.color);
    });
    on('create', () => this.create(client));
    on('join', (d) => this.join(client, d && d.code));
    on('leave', () => this.leave(client));
    on('ready', (d) => this.setReady(client, !!(d && d.ready === true)));
    on('pick', (d) => this.pick(client, d && d.game));
    on('set', (d) => this.set(client, d && d.key, d && d.value));
    on('start', () => this.startGame(client));
    on('in', (msg) => {
      const room = client.room;
      if (room && room.game && room.phase === 'playing') room.game.input(socket.id, msg);
    });
    socket.on('disconnect', () => this.leave(client));
  }

  // Token bucket: anything over the limit is dropped.
  allow(client) {
    const now = performance.now();
    client.tokens = Math.min(RATE.burst, client.tokens + ((now - client.last) / 1000) * RATE.perSec);
    client.last = now;
    if (client.tokens < 1) return false;
    client.tokens -= 1;
    return true;
  }

  notice(client, msg) {
    client.socket.emit('notice', { msg });
  }

  create(client) {
    this.leave(client);
    let code;
    do {
      code = Array.from({ length: 5 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
    } while (this.rooms.has(code));
    const settings = Object.fromEntries(CATALOG.map((g) => [g.id, Object.fromEntries(g.settings.map((s) => [s.key, s.def]))]));
    const room = { code, channel: `room:${code}`, hostId: client.socket.id, members: new Map(), gameId: CATALOG[0].id, settings, phase: 'lobby', game: null, resultsTimer: null };
    this.rooms.set(code, room);
    this.addMember(room, client);
    this.broadcast(room);
  }

  join(client, code) {
    const room = typeof code === 'string' ? this.rooms.get(code.trim().toUpperCase()) : null;
    if (!room) return this.notice(client, 'Room not found.');
    if (client.room === room) return;
    if (room.members.size >= MAX_MEMBERS) return this.notice(client, 'That room is full.');
    this.leave(client);
    const member = this.addMember(room, client);
    if (room.phase === 'playing') {
      // Mid-game joiners watch until the next round.
      room.game.addPlayer({ id: client.socket.id, name: client.name, color: member.color });
      client.socket.emit('gameStart', { game: room.gameId, init: room.game.init(), roster: room.game.roster() });
      this.io.to(room.channel).emit('roster', room.game.roster());
    }
    this.broadcast(room);
  }

  addMember(room, client) {
    const taken = new Set([...room.members.values()].map((m) => m.color));
    let color = client.color;
    if (taken.has(color)) color = COLORS.findIndex((_, i) => !taken.has(i));
    const member = { client, color, ready: false, points: 0 };
    room.members.set(client.socket.id, member);
    client.room = room;
    client.socket.join(room.channel);
    return member;
  }

  leave(client) {
    const room = client.room;
    if (!room) return;
    const id = client.socket.id;
    room.members.delete(id);
    client.room = null;
    client.socket.leave(room.channel);
    if (room.members.size === 0) {
      clearTimeout(room.resultsTimer);
      this.rooms.delete(room.code);
      return;
    }
    if (room.game && room.phase === 'playing') {
      room.game.removePlayer(id);
      this.io.to(room.channel).emit('roster', room.game.roster());
    }
    if (room.hostId === id) room.hostId = room.members.keys().next().value;
    this.broadcast(room);
  }

  setReady(client, ready) {
    const room = client.room;
    if (!room || room.phase !== 'lobby') return;
    room.members.get(client.socket.id).ready = ready;
    this.broadcast(room);
  }

  isHostInLobby(client) {
    const room = client.room;
    return room && room.phase === 'lobby' && room.hostId === client.socket.id ? room : null;
  }

  pick(client, gameId) {
    const room = this.isHostInLobby(client);
    if (!room || !Object.hasOwn(GAMES, gameId)) return;
    room.gameId = gameId;
    this.broadcast(room);
  }

  set(client, key, value) {
    const room = this.isHostInLobby(client);
    if (!room) return;
    const spec = GAMES[room.gameId].info.settings.find((s) => s.key === key);
    if (!spec || !spec.options.some((o) => o[0] === value)) return;
    room.settings[room.gameId][key] = value;
    this.broadcast(room);
  }

  startGame(client) {
    const room = this.isHostInLobby(client);
    if (!room) return;
    for (const [id, m] of room.members) {
      if (id !== room.hostId && !m.ready) return this.notice(client, 'Not everyone is ready.');
    }
    const players = [...room.members].map(([id, m]) => ({ id, name: m.client.name, color: m.color }));
    room.game = GAMES[room.gameId].create({ players, settings: { ...room.settings[room.gameId] } });
    room.phase = 'playing';
    const start = { game: room.gameId, init: room.game.init(), roster: room.game.roster() };
    this.io.to(room.channel).emit('gameStart', start);
    this.broadcast(room);
  }

  endGame(room) {
    const result = room.game.result;
    const winner = result.winnerId && room.members.get(result.winnerId);
    if (winner) winner.points++;
    room.phase = 'results';
    this.io.to(room.channel).emit('gameEnd', { result });
    this.broadcast(room);
    room.resultsTimer = setTimeout(() => {
      room.phase = 'lobby';
      room.game = null;
      for (const m of room.members.values()) m.ready = false;
      this.broadcast(room);
    }, this.resultsTime);
  }

  broadcast(room) {
    this.io.to(room.channel).emit('room', {
      code: room.code,
      hostId: room.hostId,
      phase: room.phase,
      game: room.gameId,
      settings: room.settings[room.gameId],
      members: [...room.members].map(([id, m]) => ({ id, name: m.client.name, color: m.color, ready: m.ready, points: m.points })),
    });
  }
}
