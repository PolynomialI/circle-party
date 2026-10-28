import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COURSES, TRAP_IDS, TRAP_STATE, BUTTON_U, course, newRunner, stepRunner, onFloor, frameAt } from '../public/shared/course.js';
import { GAMES } from '../server/games/index.js';

// A look-ahead runner: steers towards floor ahead and jumps where the floor runs out.
function botCmd(c, p, t) {
  const f = frameAt(c, p.s);
  let bestU = p.u;
  let bestScore = -Infinity;
  for (let u = -100; u <= 100; u += 10) {
    let score = -Math.abs(u - p.u) / 300;
    for (const ds of [10, 40, 70, 100, 130]) for (const du of [-22, 0, 22]) if (onFloor(c, p.s + ds, u + du, t + ds / 250)) score += du === 0 ? 1 : 0.5;
    if (score > bestScore) {
      bestScore = score;
      bestU = u;
    }
  }
  const b = (!onFloor(c, p.s + 14, p.u, t + 0.06) && onFloor(c, p.s, p.u, t)) || p.knockT > 0 ? 2 : 0;
  const lat = Math.max(-1, Math.min(1, (bestU - p.u) / 40));
  const mx = f.tx + f.nx * lat;
  const my = f.ty + f.ny * lat;
  const l = Math.hypot(mx, my);
  return { mx: mx / l, my: my / l, a: 0, b };
}

for (const id of Object.keys(COURSES)) {
  test(`course ${id} can be finished`, () => {
    const c = course(id);
    const p = newRunner(60, 0);
    const secAt = (s) => c.sections.find((x) => s >= x.s0 && s < x.s1) || c.sections[c.sections.length - 1];
    for (let i = 0; i < 60 * 240 && p.s < c.finish; i++) {
      const t = i / 60;
      stepRunner(p, botCmd(c, p, t), c, t, false);
      if (p.z <= 0 && !onFloor(c, p.s, p.u, t)) Object.assign(p, newRunner(secAt(p.s).s0 - 40, 0));
    }
    assert.ok(p.s >= c.finish, `reached ${Math.round(p.s)} of ${Math.round(c.finish)}`);
  });
}

function game(n = 3, settings = {}) {
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, color: i }));
  const g = GAMES.deathrun.create({ players, settings: { rounds: 0, time: 120, map: 'doom', ...settings }, rng: () => 0.42 });
  while (g.state === 0) g.step();
  return g;
}

test('every trap kills a runner standing in it once fired', () => {
  const g = game();
  const runner = g.runners[0];
  const kinds = new Set();
  for (const tr of g.course.traps) {
    if (tr.kind === 'launcher') continue; // it throws you off instead; tested below
    let killed = false;
    for (const u of [-90, -40, 0, 40, 90]) {
      for (const s of [tr.a + 20, (tr.a + tr.b) / 2, tr.b - 20]) {
        g.traps = g.course.traps.map(() => ({ st: TRAP_STATE.ready, t: 0, seed: 7 }));
        Object.assign(runner, newRunner(s, u), { state: 0, done: 0 });
        const st = g.traps[tr.id];
        st.st = TRAP_STATE.warn;
        for (let i = 0; i < 60 * 4 && runner.state === 0; i++) {
          // Stand still where the trap is.
          Object.assign(runner, { s, u, vs: 0, vu: 0, z: 0, vz: 0 });
          g.worldTick(false);
          if (runner.state !== 0) killed = true;
        }
        if (killed) break;
      }
      if (killed) break;
    }
    assert.ok(killed, `${tr.kind} kills`);
    kinds.add(tr.kind);
    runner.state = 0;
  }
  assert.equal(kinds.size, TRAP_IDS.length - 1);
});

test('the launch plate throws runners off the course for a kill', () => {
  const g = game();
  const tr = g.course.traps.find((t) => t.kind === 'launcher');
  const runner = g.runners[0];
  Object.assign(runner, newRunner((tr.a + tr.b) / 2, -20), { state: 0 });
  g.traps[tr.id].st = TRAP_STATE.warn;
  const before = g.killer.points;
  for (let i = 0; i < 120 && runner.state === 0; i++) {
    runner.cmds.push({ c: [[i + 1, 0, 0, 0, 0, -1]] });
    g.step();
  }
  assert.notEqual(runner.state, 0);
  assert.equal(g.killer.points, before + 1);
});

test('the killer fires a trap by standing on its button, then it reloads', () => {
  const g = game();
  const k = g.killer;
  const tr = g.course.traps[0];
  Object.assign(k, { s: tr.button, u: BUTTON_U });
  g.pressButtons(k);
  assert.equal(g.traps[tr.id].st, TRAP_STATE.warn);
  for (let i = 0; i < 60 * 3; i++) g.worldTick(false);
  assert.equal(g.traps[tr.id].st, TRAP_STATE.cool);
  g.pressButtons(k);
  assert.equal(g.traps[tr.id].st, TRAP_STATE.cool, 'no refiring while it reloads');
});

test('floor traps sit on solid floor', () => {
  for (const id of Object.keys(COURSES)) {
    const c = course(id);
    for (const tr of c.traps.filter((t) => ['trapdoor', 'launcher', 'cell', 'acid'].includes(t.kind))) {
      assert.ok(onFloor(c, (tr.a + tr.b) / 2, -40, 0), `${id}: ${tr.kind}`);
    }
  }
});

test('everyone takes a turn as killer, finishing scores points, and the game ends', () => {
  const g = game(3);
  assert.equal(g.target, 3);
  const killers = new Set();
  let finished = false;
  for (let r = 0; r < 4 && !g.result; r++) {
    killers.add(g.killer.id);
    const round = g.round;
    const first = g.runners[0];
    first.s = g.course.finish + 1;
    g.worldTick(false);
    if (!finished) {
      assert.equal(first.points, 3);
      finished = true;
    }
    for (const p of g.runners) p.done = p.done || 9; // everyone else home too: the round ends
    while (g.round === round && !g.result) g.step();
    while (g.state === 0 && !g.result) g.step();
  }
  assert.equal(killers.size, 3);
  assert.ok(g.result, 'game over after everyone has been killer');
});
