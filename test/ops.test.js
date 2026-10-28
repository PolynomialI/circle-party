import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ops } from '../server/games/ops.js';

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
