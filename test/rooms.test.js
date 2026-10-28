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

test('create, join, ready, start, finish, back to the lobby with points', async () => {
  const a = await client('Ann', 2);
  const b = await client('Bob', 2);
  const created = a.onceEvent('room');
  a.emit('create');
  const room = await created;
  assert.equal(room.code.length, 5);
  const picked = a.onceEvent('room', (r) => r.game === 'sumo');
  a.emit('pick', { game: 'sumo' });
  await picked;

  const joined = b.onceEvent('room', (r) => r.members.length === 2);
  b.emit('join', { code: room.code.toLowerCase() });
  const r2 = await joined;
  assert.notEqual(r2.members[0].color, r2.members[1].color, 'colours are unique in a room');

  // Only the host changes settings, and only to listed values.
  b.emit('set', { key: 'rounds', value: 5 });
  a.emit('set', { key: 'rounds', value: 99 });
  const set = a.onceEvent('room', (r) => r.settings.rounds === 7);
  a.emit('set', { key: 'rounds', value: 7 });
  await set;

  a.emit('start');
  const notice = await a.onceEvent('notice');
  assert.match(notice.msg, /ready/);

  const ready = a.onceEvent('room', (r) => r.members.every((m) => m.id === r.hostId || m.ready));
  b.emit('ready', { ready: true });
  await ready;
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
  assert.ok(back.members.every((m) => !m.ready));

  // The host leaving hands the room to someone else.
  const handed = b.onceEvent('room', (r) => r.members.length === 2);
  a.emit('leave');
  assert.notEqual((await handed).hostId, a.id);
  for (const s of [a, b, c]) s.close();
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
  for (let i = 0; i < 300; i++) a.emit('ready', { ready: i % 2 === 0 });
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(rooms < 100, `${rooms} of 300 got through`);
  a.close();
});
