import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAMES } from '../server/games/index.js';
import { DT } from '../public/shared/loop.js';
import { TRAILS, TRAIL_MAPS, TRAIL_POWERS, trailBounds, newTrailer, trailPen, stepTrail } from '../public/shared/minis.js';

const ST = { countdown: 0, playing: 1, roundEnd: 2, over: 3 };
const PS = { alive: 0, out: 2 };

function make(n = 2, settings = {}) {
  const players = Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'P' + i, color: i }));
  const game = GAMES.trails.create({ players, settings: { rounds: 5, map: 'grid', powers: 0, ...settings }, rng: () => 0.5 });
  const seq = {};
  const send = (id, aim, b = 0) => game.input(id, { c: [[(seq[id] = (seq[id] || 0) + 1), 0, 0, aim, b, game.tick]] });
  return { game, send };
}

function toPlaying(game, send) {
  while (game.state !== ST.playing) {
    for (const p of game.players.values()) send(p.id, p.aim);
    game.step();
  }
}

test('trails have gaps you can drive through', () => {
  const p = newTrailer(100, 100, 0, 3);
  let ups = 0;
  let was = true;
  for (let i = 0; i < 6 / DT; i++) {
    stepTrail(p, { mx: 0, a: 0, b: 0 }, false);
    const pen = trailPen(p);
    if (!pen && was) ups++;
    was = pen;
  }
  assert.ok(ups >= 2 && ups <= 5, `gaps in 6 s: ${ups}`);
});

test('each crash scores a point for everyone still alive, and the game ends after N rounds', () => {
  const { game, send } = make(3, { rounds: 3 });
  toPlaying(game, send);
  const [a, b, c] = [...game.players.values()];
  // Steer a into the wall.
  a.x = 20;
  a.y = 400;
  game.step();
  assert.equal(a.state, PS.out);
  assert.equal(b.points, 1);
  assert.equal(c.points, 1);
  assert.equal(a.points, 0);
  for (let t = 0; t < 400 / DT && !game.result; t++) {
    for (const p of game.players.values()) send(p.id, p.aim + 0.3);
    game.step();
  }
  assert.ok(game.result, 'game ended');
  assert.equal(game.round, 3);
});

test('hop clears a trail, ghost passes through it, without either you crash', () => {
  for (const [pow, survive] of [['hop', true], ['ghost', true], ['', false]]) {
    const { game, send } = make(2);
    toPlaying(game, send);
    const [a, b] = [...game.players.values()];
    // A fresh wall of b's trail right in front of a.
    b.trail = [[700, 300], [700, 600]];
    Object.assign(a, { x: 680, y: 450, aim: 0, held: pow });
    send(a.id, 0, pow ? 1 : 0);
    send(b.id, b.aim);
    for (let i = 0; i < 12; i++) {
      game.step();
      send(a.id, 0, 0);
      send(b.id, b.aim);
    }
    assert.equal(a.state === PS.alive, survive, `${pow || 'nothing'}`);
  }
});

test('the cutter blasts a hole in the trails ahead', () => {
  const { game, send } = make(2);
  toPlaying(game, send);
  const [a, b] = [...game.players.values()];
  b.trail = Array.from({ length: 31 }, (_, i) => [760, 300 + i * 10]);
  Object.assign(a, { x: 680, y: 450, aim: 0, held: 'cutter' });
  send(a.id, 0, 1);
  game.step();
  const hole = b.trail.filter((pt) => pt === null).length;
  assert.ok(hole > 5 && hole < 31, `${hole} points erased`);
  assert.ok(!a.held);
  assert.ok(game.events.some((e) => e.k === 'cut'));
});

test('scramble reverses everyone else for a moment', () => {
  const { game, send } = make(3);
  toPlaying(game, send);
  const [a, b, c] = [...game.players.values()];
  a.held = 'scramble';
  send(a.id, a.aim, 1);
  game.step();
  assert.equal(a.revT, 0);
  assert.ok(b.revT > TRAIL_POWERS.scramble.time - 0.05);
  assert.ok(c.revT > TRAIL_POWERS.scramble.time - 0.05);
});

test('portals move you to the other end, still heading the same way', () => {
  const map = TRAIL_MAPS.portals;
  const [ax, ay, bx, by] = map.portals[0];
  const p = newTrailer(ax - 30, ay, 0, 0);
  for (let i = 0; i < 20; i++) stepTrail(p, { mx: 0, a: 0, b: 0 }, false, map);
  assert.equal(p.tp, 1);
  assert.ok(Math.hypot(p.x - bx, p.y - by) < 110, `${p.x},${p.y}`);
  assert.ok(Math.abs(p.aim) < 1e-9);
});

test('the walls close in late in a round', () => {
  assert.equal(trailBounds(0).k, 0);
  const b = trailBounds(TRAILS.shrinkAt + TRAILS.shrinkTime);
  assert.equal(b.k, 1);
  assert.ok(b.x1 - b.x0 > 400 && b.y1 - b.y0 > 300);
});

test('crates appear when power-ups are on and you grab one by driving over it', () => {
  const { game, send } = make(2, { powers: 1 });
  toPlaying(game, send);
  assert.equal(game.crates.length, 0);
  game.crateT = 0;
  for (const p of game.players.values()) send(p.id, p.aim);
  game.step();
  assert.equal(game.crates.length, 1);
  const [a] = [...game.players.values()];
  const c = game.crates[0];
  Object.assign(a, { x: c.x - 5, y: c.y, aim: 0 });
  send(a.id, 0);
  game.step();
  assert.equal(a.held, c.type);
});
