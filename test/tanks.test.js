import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAMES } from '../server/games/index.js';
import { TANK_WEAPONS } from '../public/shared/minis.js';
import { lineClear } from '../public/shared/world.js';

const PS = { alive: 0, out: 2 };

function make(settings = {}) {
  const players = ['a', 'b'].map((id, i) => ({ id, name: id, color: i }));
  const game = GAMES.tanks.create({ players, settings: { rounds: 3, powers: 0, ...settings }, rng: () => 0.5 });
  const seq = {};
  const send = (id, b = 0, aim = 0, mx = 0, my = 0) => game.input(id, { c: [[(seq[id] = (seq[id] || 0) + 1), mx, my, aim, b, game.tick]] });
  while (game.state !== 1) {
    send('a');
    send('b');
    game.step();
  }
  const [a, b] = [...game.players.values()];
  return { game, send, a, b };
}

// Two cells with a clear line between them.
function facing(game, a, b) {
  for (const [x, y] of game.map.cells) {
    for (const [x2, y2] of game.map.cells) {
      const d = Math.hypot(x2 - x, y2 - y);
      if (d > 200 && d < 500 && lineClear(x, y, x2, y2, game.map.blocks)) {
        Object.assign(a, { x, y });
        Object.assign(b, { x: x2, y: y2 });
        return Math.atan2(y2 - y, x2 - x);
      }
    }
  }
  throw new Error('no clear line');
}

test('the laser hits instantly down a clear line', () => {
  const { game, send, a, b } = make();
  const aim = facing(game, a, b);
  a.weapon = 'laser';
  send('a', 1, aim);
  send('b');
  game.step();
  assert.equal(b.state, PS.out);
  assert.equal(a.weapon, '');
  assert.ok(game.events.some((e) => e.k === 'laser'));
});

test('the gatling sprays its belt while held, then you are back to shells', () => {
  const { game, send, a } = make();
  a.weapon = 'gatling';
  a.ammo = TANK_WEAPONS.gatling.ammo;
  game.events = [];
  for (let i = 0; i < 30; i++) {
    send('a', 1, 0);
    send('b');
    game.step();
  }
  const fired = game.events.filter((e) => e.k === 'fire' && e.p === a.idx).length;
  assert.ok(fired >= 5 && fired <= 9, `${fired} in half a second`);
  assert.equal(a.ammo, TANK_WEAPONS.gatling.ammo - fired);
  a.ammo = 1;
  for (let i = 0; i < 6; i++) {
    send('a', 1, 0);
    send('b');
    game.step();
  }
  assert.equal(a.weapon, '');
});

test('a frag bursts into shards on the second click', () => {
  const { game, send, a } = make();
  a.weapon = 'frag';
  send('a', 1, 0);
  send('b');
  game.step();
  assert.equal(game.bullets.filter((b) => b.kind === 'frag').length, 1);
  // Let it roll clear of us first: shards hit their owner too.
  for (const b of [...Array(25).fill(0), 1]) {
    send('a', b, 0);
    send('b');
    game.step();
  }
  assert.equal(game.bullets.filter((b) => b.kind === 'frag').length, 0);
  assert.equal(game.bullets.filter((b) => b.kind === 'shard').length, TANK_WEAPONS.frag.shards);
});

test('a mine arms, then blows up whoever drives onto it', () => {
  const { game, send, a, b } = make();
  a.weapon = 'mine';
  send('a', 1, 0);
  send('b');
  game.step();
  assert.equal(game.mines.length, 1);
  const m = game.mines[0];
  // b drives over it before it arms: nothing. After: boom.
  Object.assign(a, { x: m.x + 300, y: m.y });
  Object.assign(b, { x: m.x, y: m.y });
  send('a');
  send('b');
  game.step();
  assert.equal(b.state, PS.alive);
  for (let i = 0; i < 80 && b.state === PS.alive; i++) {
    send('a');
    send('b');
    game.step();
  }
  assert.equal(b.state, PS.out);
  assert.equal(game.mines.length, 0);
});

test('weapon crates appear in the maze and you pick one up by driving over it', () => {
  const { game, send, a } = make({ powers: 1 });
  game.crateT = 0;
  send('a');
  send('b');
  game.step();
  assert.equal(game.crates.length, 1);
  const c = game.crates[0];
  Object.assign(a, { x: c.x, y: c.y });
  send('a');
  send('b');
  game.step();
  assert.equal(a.weapon, c.type);
});
