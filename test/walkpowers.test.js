import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAMES } from '../server/games/index.js';
import { WALK_POWERS } from '../public/shared/walkpowers.js';

function make(id, settings = {}) {
  const players = ['a', 'b', 'c'].map((p, i) => ({ id: p, name: p, color: i }));
  const info = GAMES[id].info;
  const defaults = Object.fromEntries(info.settings.map((s) => [s.key, s.def]));
  const game = GAMES[id].create({ players, settings: { ...defaults, map: 'bay', ...settings }, rng: () => 0.5 });
  const seq = {};
  const send = (pid, b = 0, aim = 0, mx = 0, my = 0) => game.input(pid, { c: [[(seq[pid] = (seq[pid] || 0) + 1), mx, my, aim, b, game.tick]] });
  const step = (cmds = {}) => {
    for (const pid of game.players.keys()) send(pid, ...(cmds[pid] || []));
    game.step();
  };
  while (game.state !== 1) step();
  const [a, b, c] = [...game.players.values()];
  return { game, step, a, b, c };
}

// Somewhere open on the map for a little scene.
function open(game) {
  return game.map.spawns[0];
}

test('crates appear on the map and boots speed you up on contact', () => {
  const { game, step, a } = make('bombtag');
  game.crateT = 0;
  for (let i = 0; i < 300 && !game.crates.length; i++) step();
  assert.ok(game.crates.length >= 1);
  const c = game.crates[0];
  c.type = 'boots';
  Object.assign(a, { x: c.x, y: c.y });
  step();
  assert.ok(a.bootsT > 0);
  step();
  assert.ok(a.spd >= WALK_POWERS.boots.speed);
});

test('a bubble stops the bomb being passed to you', () => {
  const { game, step, a, b, c } = make('bombtag');
  const [x, y] = open(game);
  game.holder = a;
  game.passCd = 0;
  Object.assign(a, { x, y, vx: 0, vy: 0 });
  Object.assign(b, { x: x + a.r + b.r + 1, y, vx: 0, vy: 0, bubbleT: 3 });
  Object.assign(c, { x: x + 400, y: y + 400 });
  step();
  assert.equal(game.holder, a);
  b.bubbleT = 0;
  Object.assign(b, { x: x + a.r + b.r + 1, y });
  step();
  assert.equal(game.holder, b);
});

test('the glove punches the player in front of you', () => {
  const { game, step, a, b } = make('crown');
  const [x, y] = open(game);
  Object.assign(a, { x, y, aim: 0, held: 'glove', uses: 3 });
  Object.assign(b, { x: x + 40, y, vx: 0, vy: 0 });
  step({ a: [1, 0] });
  assert.ok(b.vx > 400, `pushed at ${b.vx}`);
  assert.equal(a.uses, 2);
});

test('a bubble keeps the crown on your head', () => {
  const { game, step, a, b } = make('crown');
  const [x, y] = open(game);
  game.holder = a;
  game.stealCd = 0;
  Object.assign(a, { x, y, bubbleT: 3 });
  Object.assign(b, { x: x + a.r + b.r + 1, y });
  step();
  assert.equal(game.holder, a);
});

test('blink hops you where you aim, stopping short of walls', () => {
  const { game, step, a } = make('crown');
  const [x, y] = open(game);
  Object.assign(a, { x, y, held: 'blink' });
  const aim = Math.atan2(game.map.h / 2 - y, game.map.w / 2 - x);
  step({ a: [1, aim] });
  const moved = Math.hypot(a.x - x, a.y - y);
  assert.ok(moved > 20 && moved <= WALK_POWERS.blink.dist + 10, `moved ${moved}`);
  assert.equal(a.held, '');
});

test('a paint bomb paints a big circle', () => {
  const { game, step, a } = make('paint');
  const [x, y] = open(game);
  Object.assign(a, { x, y, held: 'splash' });
  const before = a.score;
  step({ a: [1, 0] });
  assert.ok(a.score - before > 20, `painted ${a.score - before}`);
});
