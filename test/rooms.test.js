import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as ioClient } from 'socket.io-client';
import { createGameServer } from '../server/index.js';

let server;
let url;

before(async () => {
  server = createGameServer({ resultsTime: 100 });
  await new Promise((r) => server.httpServer.listen(0, r));
  url = `http://localhost:${server.httpServer.address().port}`;
});

after(() => {
  server.rooms.stop();
  server.io.close();
});

function client(name, color = 0) {
  const s = ioClient(url, { transports: ['websocket'], forceNew: true });
  s.last = {};
  for (const ev of ['welcome', 'room', 'gameStart', 'gameEnd', 'notice', 'snap', 'roster']) s.on(ev, (d) => (s.last[ev] = d));
  s.onceEvent = (ev, pred = () => true) => new Promise((resolve) => {
    const h = (d) => {
      if (pred(d)) {
        s.off(ev, h);
        resolve(d);
      }
    };
    s.on(ev, h);
  });
  return s.onceEvent('welcome').then(() => {
    s.emit('hello', { name, color });
    return s;
  });
}

test('create, join, start any time, finish, back to the lobby with points', async () => {
  const a = await client('Ann', 2);
  const b = await client('Bob', 2);
  const created = a.onceEvent('room');
  a.emit('create');
  const room = await created;
  assert.equal(room.code.length, 5);
  // Swap the default game for Sumo: pick Sumo, then unpick the default.
  const first = room.playlist[0];
  let picked = a.onceEvent('room', (r) => r.playlist.includes('sumo'));
  a.emit('pick', { game: 'sumo' });
  await picked;
  picked = a.onceEvent('room', (r) => r.playlist.length === 1 && r.playlist[0] === 'sumo');
  a.emit('pick', { game: first });
  await picked;

  const joined = b.onceEvent('room', (r) => r.members.length === 2);
  b.emit('join', { code: room.code.toLowerCase() });
  const r2 = await joined;
  assert.notEqual(r2.members[0].color, r2.members[1].color, 'colours are unique in a room');

  // Only the host changes settings, and only to listed values.
  b.emit('set', { game: 'sumo', key: 'rounds', value: 5 });
  a.emit('set', { game: 'sumo', key: 'rounds', value: 99 });
  const set = a.onceEvent('room', (r) => r.settings.sumo.rounds === 7);
  a.emit('set', { game: 'sumo', key: 'rounds', value: 7 });
  await set;

  // A guest can't start; the host can, without anyone readying up.
  b.emit('start');
  const started = b.onceEvent('gameStart');
  a.emit('start');
  const start = await started;
  assert.equal(start.game, 'sumo');
  assert.equal(start.roster.length, 2);
  await b.onceEvent('snap');

  // A third player joining mid-game gets the game to watch.
  const c = await client('Cat', 2);
  const cStart = c.onceEvent('gameStart');
  c.emit('join', { code: room.code });
  assert.equal((await cStart).roster.length, 3);

  const roomObj = server.rooms.rooms.get(room.code);
  const winnerId = [...roomObj.members.keys()][1];
  roomObj.game.finish(roomObj.game.players.get(winnerId));
  const end = await a.onceEvent('gameEnd');
  assert.equal(end.result.winnerId, winnerId);
  const back = await a.onceEvent('room', (r) => r.phase === 'lobby');
  assert.equal(back.members.find((m) => m.id === winnerId).points, 1);

  // The host leaving hands the room to someone else.
  const handed = b.onceEvent('room', (r) => r.members.length === 2);
  a.emit('leave');
  assert.notEqual((await handed).hostId, a.id);
  for (const s of [a, b, c]) s.close();
});

test('a playlist plays games in order; the host can skip and end', async () => {
  const a = await client('Host');
  const created = a.onceEvent('room');
  a.emit('create');
  const room = await created;
  for (const g of ['sumo', 'bombtag']) {
    const picked = a.onceEvent('room', (r) => r.playlist.includes(g));
    a.emit('pick', { game: g });
    await picked;
  }
  const order = [room.playlist[0], 'sumo', 'bombtag'];
  let started = a.onceEvent('gameStart');
  a.emit('start');
  assert.equal((await started).game, order[0]);

  // Skip goes straight to the next game.
  started = a.onceEvent('gameStart');
  a.emit('skip');
  assert.equal((await started).game, order[1]);

  // A finished game shows results, then the next one starts by itself.
  const roomObj = server.rooms.rooms.get(room.code);
  started = a.onceEvent('gameStart');
  roomObj.game.forceEnd();
  const end = await a.onceEvent('gameEnd');
  assert.equal(end.next, 'Bomb Tag');
  assert.equal((await started).game, order[2]);

  // End stops the playlist and returns to the lobby after the results.
  const back = a.onceEvent('room', (r) => r.phase === 'lobby');
  a.emit('end');
  await a.onceEvent('gameEnd');
  await back;
  a.close();
});

test('rooms hold at most 8 people and unknown codes are refused', async () => {
  const host = await client('Host');
  const created = host.onceEvent('room');
  host.emit('create');
  const { code } = await created;
  const others = [];
  for (let i = 0; i < 7; i++) {
    const s = await client(`P${i}`, i);
    const r = s.onceEvent('room');
    s.emit('join', { code });
    await r;
    others.push(s);
  }
  const late = await client('Late');
  const full = late.onceEvent('notice');
  late.emit('join', { code });
  assert.match((await full).msg, /full/);
  const missing = late.onceEvent('notice');
  late.emit('join', { code: 'ZZZZZ' });
  assert.match((await missing).msg, /not found/);
  for (const s of [host, late, ...others]) s.close();
});

test('message floods are rate limited', async () => {
  const a = await client('Spam');
  const created = a.onceEvent('room');
  a.emit('create');
  await created;
  let rooms = 0;
  a.on('room', () => rooms++);
  for (let i = 0; i < 300; i++) a.emit('pick', { game: i % 2 ? 'sumo' : 'bombtag' });
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(rooms < 100, `${rooms} of 300 got through`);
  a.close();
});
