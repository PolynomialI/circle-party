import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAMES } from '../server/games/index.js';
import { RUSH, RUSH_POWERS, rushBlocks } from '../public/shared/minis.js';

const ST = { playing: 1 };
const PS = { alive: 0, fall: 1 };

function make(n = 2, settings = {}) {
  const players = Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'P' + i, color: i }));
  const game = GAMES.rush.create({ players, settings: { rounds: 3, powers: 0, ...settings }, rng: () => 0.5 });
  const seq = {};
  const send = (id, b = 0, mx = 0, my = 0, aim = 0) => game.input(id, { c: [[(seq[id] = (seq[id] || 0) + 1), mx, my, aim, b, game.tick]] });
  while (game.state !== ST.playing) {
    for (const id of game.players.keys()) send(id);
    game.step();
  }
  return { game, send, list: [...game.players.values()] };
}

// A wall right above a player, with its gap far away.
function wallAt(game, y) {
  game.bars = [{ id: 99, y, speed: 200, gaps: [1000, 1120], slide: null, off: 0 }];
  game.spawnT = 99;
}

test('the glove punches people in front of you hard, three times', () => {
  const { game, send, list: [a, b] } = make();
  Object.assign(a, { x: 400, y: 400, held: 'glove', uses: 3 });
  Object.assign(b, { x: 440, y: 400 });
  send(a.id, 1, 0, 0, 0);
  send(b.id);
  game.step();
  assert.ok(b.vx > 500, `pushed at ${b.vx}`);
  assert.equal(a.uses, 2);
  assert.equal(a.held, 'glove');
  assert.ok(game.events.some((e) => e.k === 'punch' && e.hit === 1));
});

test('a spring jumps you clean over a wall; without it the wall carries you off', () => {
  for (const spring of [true, false]) {
    const { game, send, list: [a, b] } = make();
    Object.assign(a, { x: 400, y: 400, held: spring ? 'spring' : '' });
    Object.assign(b, { x: 900, y: 700 });
    wallAt(game, 340);
    for (let i = 0; i < 90 && a.state === PS.alive; i++) {
      send(a.id, i === 0 ? 1 : 0);
      send(b.id);
      game.step();
      game.spawnT = 99;
    }
    if (spring) {
      assert.equal(a.state, PS.alive);
      assert.ok(a.y < game.bars[0].y, 'ended up above the wall');
    } else assert.ok(a.y > 400 + 50, 'pushed down by the wall');
  }
});

test('a drill bores a gap in the wall above you', () => {
  const { game, send, list: [a, b] } = make();
  Object.assign(a, { x: 400, y: 500, held: 'drill' });
  wallAt(game, 200);
  send(a.id, 1);
  send(b.id);
  game.step();
  const row = game.barRows()[0];
  const solid = rushBlocks([row]).slice(2);
  assert.ok(!solid.some(([x, , w]) => x < 400 && x + w > 400), 'open above the player');
  assert.ok(RUSH_POWERS.drill.w > 2 * a.r + 40);
});

test('freeze slows every wall', () => {
  const { game, send, list: [a, b] } = make();
  a.held = 'freeze';
  wallAt(game, 100);
  send(a.id, 1);
  send(b.id);
  game.step();
  const y0 = game.bars[0].y;
  send(a.id);
  send(b.id);
  game.step();
  assert.ok(game.bars[0].y - y0 < 200 / 60 * 0.5);
});

test('crates appear, walls smash them, and you pick them up', () => {
  const { game, send, list: [a, b] } = make(2, { powers: 1 });
  game.crateT = 0;
  game.bars = [];
  game.spawnT = 99;
  send(a.id);
  send(b.id);
  game.step();
  assert.equal(game.crates.length, 1);
  const c = game.crates[0];
  Object.assign(a, { x: c.x, y: c.y + 10 });
  send(a.id);
  send(b.id);
  game.step();
  assert.equal(a.held, c.type);
  game.crateT = 0;
  send(a.id);
  send(b.id);
  game.step();
  const d = game.crates[0];
  wallAt(game, d.y - RUSH.bar / 2);
  send(a.id);
  send(b.id);
  game.step();
  assert.equal(game.crates.length, 0);
  assert.ok(game.events.some((e) => e.k === 'smash'));
});
