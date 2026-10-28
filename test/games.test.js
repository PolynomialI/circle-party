import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAMES } from '../server/games/index.js';
import { DT } from '../public/shared/loop.js';

function seeded(seed = 1) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

const defaults = (info) => Object.fromEntries(info.settings.map((s) => [s.key, s.def]));

// Every game survives 90 s of random input from 4 players, a late joiner and a leaver,
// with snapshots that serialise and stay small.
const extra = { 'ops (gun game)': ['ops', { mode: 'gungame' }] };
const runs = [...Object.keys(GAMES).map((id) => [id, id, {}]), ...Object.entries(extra).map(([name, [id, s]]) => [name, id, s])];

for (const [name, id, overrides] of runs) {
  const g = GAMES[id];
  test(`${name}: 90 seconds of random play`, () => {
    const rng = seeded(id.length * 7919);
    const players = ['a', 'b', 'c', 'd'].map((p, i) => ({ id: p, name: p.toUpperCase(), color: i }));
    const game = g.create({ players, settings: { ...defaults(g.info), ...overrides }, rng });
    const seq = { a: 0, b: 0, c: 0, d: 0, e: 0 };
    let maxBytes = 0;
    let rounds = 0;
    for (let t = 0; t < 90 / DT && !game.result; t++) {
      if (t === 600) {
        game.addPlayer({ id: 'e', name: 'E', color: 4 });
        seq.e = 0;
      }
      if (t === 1500) game.removePlayer('b');
      for (const p of game.players.keys()) {
        const r = () => rng() * 2 - 1;
        game.input(p, { c: [[++seq[p], r(), r(), r() * 3, Math.floor(rng() * 32), game.tick - 5]] });
      }
      game.step();
      if (t % 2 === 0) {
        for (const p of game.players.keys()) {
          const bytes = JSON.stringify(game.snapshotFor(p)).length;
          maxBytes = Math.max(maxBytes, bytes);
        }
      }
      rounds = Math.max(rounds, game.round);
    }
    assert.ok(maxBytes < 8000, `snapshots up to ${maxBytes} bytes`);
    assert.ok(rounds >= 1);
  });
}

test('crown: the crown starts somewhere reachable on every map', async () => {
  const { ARENAS } = await import('../public/shared/arenas.js');
  const { collideBlocks } = await import('../public/shared/world.js');
  for (const map of Object.keys(ARENAS)) {
    const game = GAMES.crown.create({ players: [{ id: 'a', name: 'A', color: 0 }], settings: { rounds: 3, time: 45, map } });
    assert.ok(!collideBlocks({ ...game.crown }, 20, game.map.blocks), map);
  }
});
