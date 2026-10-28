import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sumo } from '../server/games/sumo.js';
import { SUMO, MAPS, MAP_IDS, onPlatform, spawnPoint } from '../public/shared/sumo.js';
import { parseCommand } from '../server/commands.js';

function seeded(seed = 1) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

const ids = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, color: i }));

function newGame(n = 2, settings = { rounds: 3, map: 'classic' }) {
  const g = new Sumo({ players: ids(n), settings, rng: seeded(3) });
  while (g.state === 0) g.step(); // skip the countdown
  return g;
}

let seq = 0;
function send(g, id, cmd, ticks = 1) {
  for (let i = 0; i < ticks; i++) {
    g.input(id, { c: [[++seq, cmd.mx || 0, cmd.my || 0, cmd.a || 0, cmd.b || 0, cmd.vt ?? -1]] });
    g.step();
  }
}

function park(g, id, x, y) {
  return Object.assign(g.players.get(id), { x, y, vx: 0, vy: 0 });
}

test('every spawn on every map is on the platform', () => {
  for (const id of MAP_IDS) {
    for (let i = 0; i < 8; i++) {
      const s = spawnPoint(MAPS[id], i);
      assert.ok(onPlatform(MAPS[id], s.x, s.y, 0), `${id} spawn ${i}`);
    }
  }
});

test('a swing knocks the target back, a charged one much further', () => {
  const dist = (hold) => {
    const g = newGame();
    park(g, 'p0', 0, 0);
    park(g, 'p1', 40, 0);
    send(g, 'p0', { b: 1 }, hold);
    send(g, 'p0', { b: 0 });
    const b = g.players.get('p1');
    assert.ok(b.vx > SUMO.minPush * 0.9, `pushed at ${b.vx}`);
    send(g, 'p0', {}, 20);
    return b.x;
  };
  const tap = dist(1);
  const full = dist(SUMO.chargeTicks + 5);
  assert.ok(full > tap * 1.8, `tap ${tap} vs full ${full}`);
});

test('swings only hit in front of the swinger', () => {
  const g = newGame();
  park(g, 'p0', 0, 0);
  park(g, 'p1', -40, 0);
  send(g, 'p0', { b: 1, a: 0 }, 2);
  send(g, 'p0', { b: 0, a: 0 });
  assert.equal(g.players.get('p1').vx, 0);
});

test('lag compensation hits where the swinger saw the target, capped at 200 ms', () => {
  const g = newGame();
  park(g, 'p0', 0, 0);
  park(g, 'p1', 40, 0);
  send(g, 'p0', {}, 2);
  const seen = g.tick;
  park(g, 'p1', 40, 150); // the target has since moved out of reach
  send(g, 'p0', {}, 3);
  send(g, 'p0', { b: 1 }, 1);
  send(g, 'p0', { b: 0, vt: seen });
  assert.ok(Math.hypot(g.players.get('p1').vx, g.players.get('p1').vy) > SUMO.minPush * 0.9, 'rewound hit lands');

  const g2 = newGame();
  park(g2, 'p0', 0, 0);
  park(g2, 'p1', 40, 0);
  send(g2, 'p0', {}, 2);
  const old = g2.tick;
  park(g2, 'p1', 40, 150);
  send(g2, 'p0', {}, 30);
  send(g2, 'p0', { b: 1 }, 1);
  send(g2, 'p0', { b: 0, vt: old });
  assert.equal(g2.players.get('p1').vx, 0, 'too old to rewind');
});

test('walking off the edge knocks you out and the last one standing wins the round', () => {
  const g = newGame();
  park(g, 'p0', 300, 0);
  park(g, 'p1', -100, 0);
  send(g, 'p0', { mx: 1 }, 60);
  assert.notEqual(g.players.get('p0').state, 0);
  assert.equal(g.players.get('p1').wins, 1);
});

test('first to N rounds wins the game', () => {
  const g = newGame(2, { rounds: 3, map: 'classic' });
  for (let round = 0; round < 3; round++) {
    while (g.state !== 1) g.step();
    park(g, 'p0', 340, 0);
    send(g, 'p0', { mx: 1 }, 40);
    while (g.state === 2) g.step();
  }
  assert.ok(g.result);
  assert.equal(g.result.winnerId, 'p1');
  assert.deepEqual(g.result.standings.map((s) => s.score), [3, 0]);
});

test('mid-game joiners wait for the next round', () => {
  const g = newGame(2);
  g.addPlayer({ id: 'late', name: 'Late', color: 5 });
  assert.equal(g.players.get('late').state, 3);
  park(g, 'p0', 340, 0);
  send(g, 'p0', { mx: 1 }, 40);
  while (g.state === 2) g.step();
  assert.equal(g.players.get('late').state, 0);
});

test('commands are validated', () => {
  assert.equal(parseCommand('x'), null);
  assert.equal(parseCommand([1, NaN, 0, 0, 0, 0]), null);
  assert.equal(parseCommand([0, 0, 0, 0, 0, 0]), null);
  const c = parseCommand([5, 9, 9, 100, 255, 'x']);
  assert.ok(Math.abs(Math.hypot(c.mx, c.my) - 1) < 1e-9, 'movement clamped to unit length');
  assert.equal(c.b, 31);
  assert.equal(c.vt, -1);

  const g = newGame();
  const p = park(g, 'p0', 0, 0);
  g.input('p0', { c: [[999, 1, 0, 0, 0, 0]] });
  g.input('p0', { c: [[5, -1, 0, 0, 0, 0]] }); // older sequence numbers are ignored
  g.step();
  assert.ok(p.vx > 0);
});
