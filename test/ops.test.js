import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ops } from '../server/games/ops.js';
import { rayBlocksHit } from '../public/shared/world.js';

function newGame(mode = 'ffa') {
  const players = [{ id: 'a', name: 'A', color: 0 }, { id: 'b', name: 'B', color: 1 }];
  const g = new Ops({ players, settings: { mode, kills: 10, time: 300, map: 'lab' }, rng: () => 0.5 }, 'ops');
  while (g.state === 0) g.step();
  return g;
}

function place(g, id, x, y, aim = 0) {
  return Object.assign(g.players.get(id), { x, y, vx: 0, vy: 0, aim });
}

const sees = (g, viewer, idx) => g.snapshotFor(viewer).p.some((row) => row[0] === idx);

test('enemies are only sent when inside your light', () => {
  const g = newGame();
  place(g, 'a', 300, 300, 0);
  const b = place(g, 'b', 450, 300);
  assert.ok(sees(g, 'a', b.idx), 'in the cone');
  place(g, 'b', 200, 480);
  assert.ok(!sees(g, 'a', b.idx), 'behind and outside the near circle');
  place(g, 'b', 330, 300 + 60);
  assert.ok(sees(g, 'a', b.idx), 'inside the near circle');
  place(g, 'b', 720, 170);
  assert.ok(!sees(g, 'a', b.idx), 'in the cone but behind a wall');
});

test('teammates are always sent', () => {
  const g = newGame('tdm');
  const a = g.players.get('a');
  const b = g.players.get('b');
  b.team = a.team;
  place(g, 'a', 300, 300, 0);
  place(g, 'b', 200, 480);
  assert.ok(sees(g, 'a', b.idx));
});

test('a shot reveals the shooter to nearby players without sending their position', () => {
  const g = newGame();
  place(g, 'a', 300, 300, 0);
  const b = place(g, 'b', 200, 480, 1);
  g.snapshotFor('a');
  g.input('b', { c: [[1, 0, 0, 1, 1, -1]] });
  g.step();
  const snap = g.snapshotFor('a');
  assert.ok(!snap.p.some((row) => row[0] === b.idx));
  assert.ok(snap.ev.some((e) => e.k === 'shot' && e.p === b.idx));
});

test('hits are decided on the server against where the shooter saw the target', () => {
  const g = newGame();
  place(g, 'a', 300, 300, 0);
  place(g, 'b', 450, 300);
  g.step();
  const seen = g.tick;
  place(g, 'b', 450, 420); // moved off the line of fire since
  g.step();
  g.input('a', { c: [[1, 0, 0, 0, 1, seen]] });
  g.step();
  assert.ok(g.players.get('b').hp < 100);
});

function infection(n = 2, rounds = 2) {
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, color: i }));
  const g = new Ops({ players, settings: { rounds, time: 60, map: 'lab' }, rng: () => 0.3 }, 'infection');
  while (g.state === 0) g.step();
  return g;
}

test('infection: no spawn tag, enemies hidden in the dark, a point per tag, fixed rounds', () => {
  const g = infection(2, 2);
  const [a, b] = [...g.players.values()];
  const z = a.inf ? a : b;
  const s = a.inf ? b : a;
  assert.ok(Math.hypot(z.x - s.x, z.y - s.y) > 300, 'infected spawn away from survivors');
  assert.ok(z.holdT > 0, 'infected are held at the start');

  // Out of each other's light: neither is sent to the other.
  place(g, z.id, 300, 300, Math.PI);
  place(g, s.id, 520, 300, 0);
  assert.ok(!sees(g, z.id, s.idx));
  assert.ok(!sees(g, s.id, z.idx));

  // While held, touching doesn't infect; afterwards it does and scores a point.
  place(g, s.id, 320, 300, 0);
  g.step();
  assert.equal(s.inf, false);
  z.holdT = 0;
  g.step();
  assert.equal(s.inf, true);
  assert.equal(z.points, 1);

  // Everyone infected ends the round; after the set rounds the game ends.
  for (let i = 0; i < 60 * 60 && !g.result; i++) {
    for (const p of g.players.values()) if (p.state === 0 && !p.inf) p.inf = true;
    g.step();
  }
  assert.ok(g.result, 'game ended');
  assert.equal(g.round, 2);
});

function gungame() {
  const players = [{ id: 'a', name: 'A', color: 0 }, { id: 'b', name: 'B', color: 1 }];
  const g = new Ops({ players, settings: { mode: 'gungame', kills: 10, time: 300, powers: 0, map: 'lab' }, rng: () => 0.5 }, 'ops');
  while (g.state === 0) g.step();
  return g;
}

test('gun game: a kill moves you up the ladder, a death moves you down, a knife kill wins', () => {
  const g = gungame();
  const a = g.players.get('a');
  const b = g.players.get('b');
  b.level = 2;
  g.damage(b, a, 999, 0);
  assert.equal(a.level, 1);
  assert.equal(a.prim, 'smg');
  assert.equal(b.level, 1);
  // Last rung: knife. A stab finishes the game.
  a.level = 7;
  g.equipLevel(a);
  g.respawn(b);
  place(g, 'a', 300, 300, 0);
  place(g, 'b', 335, 300);
  g.input('a', { c: [[1, 0, 0, 0, 1, -1]] });
  g.step();
  g.step();
  assert.ok(g.result, 'game over');
  assert.equal(g.result.winnerId, 'a');
});

test('power-ups: cloak hides you, a flare reveals people in its light, ricochet bounces', () => {
  const g = newGame();
  const a = place(g, 'a', 300, 300, 0);
  const b = place(g, 'b', 450, 300);
  assert.ok(sees(g, 'a', b.idx));
  Object.assign(b, { pow: 'cloak', powT: 8 });
  assert.ok(!sees(g, 'a', b.idx), 'cloaked out of reach');
  place(g, 'b', 380, 300);
  assert.ok(sees(g, 'a', b.idx), 'cloaked but close');
  Object.assign(b, { pow: '', powT: 0 });

  place(g, 'b', 200, 480); // behind a, outside the light
  assert.ok(!sees(g, 'a', b.idx));
  g.flares.push({ x: 220, y: 460, life: 5 });
  assert.ok(sees(g, 'a', b.idx), 'lit by the flare');
  g.flares = [];

  // Ricochet: fire at a wall at an angle and hit someone standing on the bounce path.
  const aim = -Math.PI * 0.75;
  place(g, 'a', 200, 300, aim);
  Object.assign(a, { pow: 'ricochet', powT: 10 });
  const w = rayBlocksHit(200, 300, Math.cos(aim), Math.sin(aim), 2000, g.map.blocks);
  const hx = 200 + Math.cos(aim) * w.t;
  const hy = 300 + Math.sin(aim) * w.t;
  const dot = Math.cos(aim) * w.nx + Math.sin(aim) * w.ny;
  const ra = Math.atan2(Math.sin(aim) - 2 * dot * w.ny, Math.cos(aim) - 2 * dot * w.nx);
  place(g, 'b', hx + Math.cos(ra) * 60, hy + Math.sin(ra) * 60);
  const before = b.hp;
  g.fire(a, 'rifle', -1);
  assert.ok(b.hp < before, 'bounced shot hit');
  Object.assign(a, { pow: '', powT: 0 });
  b.hp = 100;
  g.fire(a, 'rifle', -1);
  assert.equal(b.hp, 100, 'no bounce without the power-up');
});
