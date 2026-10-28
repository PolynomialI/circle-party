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

// Rooms, the lobby between games, the playlist, and the fixed-rate loop that drives every game.
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
    on('pick', (d) => this.pick(client, d && d.game));
    on('set', (d) => this.set(client, d && d.game, d && d.key, d && d.value));
    on('start', () => this.startPlaylist(client));
    on('end', () => this.hostEnd(client));
    on('skip', () => this.hostSkip(client));
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
    const room = {
      code, channel: `room:${code}`, hostId: client.socket.id, members: new Map(), settings,
      playlist: [CATALOG[0].id], queue: [], gameId: null, phase: 'lobby', game: null, resultsTimer: null,
    };
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
    const member = { client, color, points: 0 };
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

  hostRoom(client, phases) {
    const room = client.room;
    return room && room.hostId === client.socket.id && phases.includes(room.phase) ? room : null;
  }

  // The host toggles games in and out of the playlist; they play in the order picked.
  pick(client, gameId) {
    const room = this.hostRoom(client, ['lobby']);
    if (!room || !Object.hasOwn(GAMES, gameId)) return;
    const i = room.playlist.indexOf(gameId);
    if (i >= 0) {
      if (room.playlist.length > 1) room.playlist.splice(i, 1);
    } else {
      room.playlist.push(gameId);
    }
    this.broadcast(room);
  }

  set(client, gameId, key, value) {
    const room = this.hostRoom(client, ['lobby']);
    if (!room || !Object.hasOwn(GAMES, gameId)) return;
    const spec = GAMES[gameId].info.settings.find((s) => s.key === key);
    if (!spec || !spec.options.some((o) => o[0] === value)) return;
    room.settings[gameId][key] = value;
    this.broadcast(room);
  }

  startPlaylist(client) {
    const room = this.hostRoom(client, ['lobby']);
    if (!room) return;
    room.queue = [...room.playlist];
    this.startNext(room);
  }

  startNext(room) {
    clearTimeout(room.resultsTimer);
    room.gameId = room.queue.shift();
    const players = [...room.members].map(([id, m]) => ({ id, name: m.client.name, color: m.color }));
    room.game = GAMES[room.gameId].create({ players, settings: { ...room.settings[room.gameId] } });
    room.phase = 'playing';
    this.io.to(room.channel).emit('gameStart', { game: room.gameId, init: room.game.init(), roster: room.game.roster() });
    this.broadcast(room);
  }

  // Host: finish the current game now (the leader wins) and stop the playlist.
  hostEnd(client) {
    const room = this.hostRoom(client, ['playing', 'results']);
    if (!room) return;
    room.queue = [];
    if (room.phase === 'playing') room.game.forceEnd();
    else this.toLobby(room);
  }

  // Host: drop the current game without points and go straight to the next one.
  hostSkip(client) {
    const room = this.hostRoom(client, ['playing', 'results']);
    if (!room) return;
    if (room.queue.length) this.startNext(room);
    else this.toLobby(room);
  }

  endGame(room) {
    const result = room.game.result;
    for (const id of result.winnerIds || (result.winnerId ? [result.winnerId] : [])) {
      const m = room.members.get(id);
      if (m) m.points++;
    }
    room.phase = 'results';
    const next = room.queue[0] ? GAMES[room.queue[0]].info.name : null;
    this.io.to(room.channel).emit('gameEnd', { result, next });
    this.broadcast(room);
    room.resultsTimer = setTimeout(() => {
      if (room.queue.length) this.startNext(room);
      else this.toLobby(room);
    }, this.resultsTime);
  }

  toLobby(room) {
    clearTimeout(room.resultsTimer);
    room.phase = 'lobby';
    room.game = null;
    room.gameId = null;
    room.queue = [];
    this.broadcast(room);
  }

  broadcast(room) {
    this.io.to(room.channel).emit('room', {
      code: room.code,
      hostId: room.hostId,
      phase: room.phase,
      game: room.gameId,
      playlist: room.playlist,
      queue: room.queue,
      settings: room.settings,
      members: [...room.members].map(([id, m]) => ({ id, name: m.client.name, color: m.color, points: m.points })),
    });
  }
}
