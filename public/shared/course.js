// Obstacle courses for Deathrunner and Sky Run, shared by the server and the browser.
//
// A course is a path (straight runs and arcs) with sections laid along it. Everything runs in
// track space: s is the distance along the path, u the offset across it (positive towards the
// inside of the first turn). The runners' lane is |u| <= LANE; on Deathrunner courses the
// killer's raised track sits beside it, beyond a rail.
import { DT } from './loop.js';

export const LANE = 120; // runners' lane half-width
export const RAIL = [LANE, LANE + 20]; // the wall between runners and the killer
export const KILLER = [LANE + 20, LANE + 190]; // the killer's track
export const BUTTON_U = LANE + 50; // where trap buttons sit on the killer's track
export const CONVEYORS = [[LANE + 110, LANE + 150, 1], [LANE + 150, LANE + 190, -1]]; // [u0, u1, direction]
export const RUN = {
  radius: 15, speed: 250, killerSpeed: 260, conveyor: 650, control: 12, airControl: 5,
  jumpV: 250, gravity: 1000, jumpCd: 0.12, slow: 0.55, bounceV: 560, bounceBoost: 260, // a jump: 0.5 s, about 120 units
};
const STEP = 8;

// ---- sections ------------------------------------------------------------------------------
// Each section type builds its pieces in local coordinates (a, b along the section).

const full = (a, b) => [a, b, -LANE, LANE];

export const SECTIONS = {
  start: (len) => ({ len, pits: [], floors: [], solids: [], circles: [], zones: [], movers: [] }),
  finish: (len) => ({ len, pits: [], floors: [], solids: [], circles: [], zones: [], movers: [] }),
  rest: (len) => ({ len, pits: [], floors: [], solids: [], circles: [], zones: [], movers: [] }),
  // Parkour: hop between pads over a drop.
  gaps: () => ({
    len: 460, pits: [[20, 440, -LANE, LANE]],
    floors: [[20, 110, -LANE + 10, 10], [160, 260, -20, LANE - 10], [310, 400, -LANE + 10, 20]],
    solids: [], circles: [], zones: [], movers: [],
  }),
  // Wipeout-style slime pushers slide out from the rail and shove runners towards the drop.
  pushers: () => ({
    len: 440, pits: [], floors: [], solids: [], circles: [], zones: [],
    movers: [60, 160, 260, 360].map((s, i) => ({ t: 'pusher', s, w: 70, depth: 180, phase: i * 1.7, speed: 2.2 })),
  }),
  // A low spinning bar: jump over it or get knocked flying.
  sweeper: () => ({
    len: 380, pits: [], floors: [], solids: [], circles: [[190, 0, 22]], zones: [],
    movers: [{ t: 'sweeper', s: 190, u: 0, len: 130, speed: 1.9, phase: 0 }, { t: 'sweeper', s: 190, u: 0, len: 130, speed: 1.9, phase: Math.PI }],
  }),
  // Platforms slide back and forth over a drop.
  movers: () => ({
    len: 480, pits: [[30, 450, -LANE, LANE]], floors: [[30, 55, -LANE, LANE]], solids: [], circles: [], zones: [],
    movers: [[110, 0], [250, 2.1], [390, 4.2]].map(([s, phase]) => ({ t: 'platform', s, half: 55, range: 65, phase, speed: 1.4 })),
  }),
  // A slow climb with barrels rolling down at you.
  climb: () => ({
    len: 380, pits: [], floors: [], solids: [[0, 380, -LANE, -LANE + 14], [0, 380, LANE - 14, LANE]], circles: [],
    zones: [{ t: 'slow', a: 10, b: 370, u0: -LANE, u1: LANE }],
    movers: [[-70, 0], [0, 0.45], [70, 0.9]].map(([u, offset]) => ({ t: 'barrel', a: 10, b: 370, u, period: 1.4, offset, v: 260 })),
  }),
  // A narrow zigzag beam with gusts of wind.
  beam: () => ({
    len: 440, pits: [[20, 420, -LANE, LANE]],
    floors: [[20, 140, -32, 32], [110, 250, -104, -16], [220, 340, -32, 32], [310, 430, 16, 104]],
    solids: [], circles: [], zones: [{ t: 'wind', a: 20, b: 420, u0: -LANE, u1: LANE, period: 3.2 }], movers: [],
  }),
  // Belts run backwards; bumpers bounce you about.
  conveyor: () => ({
    len: 380, pits: [], floors: [], solids: [], zones: [{ t: 'conv', a: 20, b: 360, u0: -LANE, u1: LANE, v: -150 }],
    circles: [[90, -50, 24], [150, 60, 24], [220, -20, 24], [290, 70, 24], [300, -75, 24]], movers: [],
  }),
  // Bounce pads launch you across a big drop.
  bounce: () => ({
    len: 440, pits: [[20, 420, -LANE, LANE]], floors: [[20, 110, -LANE, LANE], [330, 420, -LANE, LANE]], solids: [], circles: [],
    zones: [{ t: 'bounce', a: 70, b: 105, u0: -80, u1: 80 }], movers: [],
  }),
};

// ---- traps ---------------------------------------------------------------------------------
// Each trap covers a stretch of a section. warn: the telegraph; active: how long it kills for;
// cool: how long before the killer can fire it again.

export const TRAPS = {
  cell: { name: 'Cell Block', len: 190, warn: 0.5, active: 2.0, cool: 14 },
  press: { name: 'Hydraulic Press', len: 70, warn: 0.7, active: 0.9, cool: 9 },
  darts: { name: 'Dart Wall', len: 260, warn: 0.3, active: 1.8, cool: 11 },
  flame: { name: 'Flamethrower', len: 240, warn: 0.5, active: 2.2, cool: 12 },
  trapdoor: { name: 'Trapdoors', len: 220, warn: 0.6, active: 1.8, cool: 12 },
  launcher: { name: 'Launch Plate', len: 90, warn: 0.35, active: 0.3, cool: 8 },
  boulder: { name: 'Boulder', len: 0, warn: 0.6, active: 0, cool: 15 }, // runs the whole section
  laser: { name: 'Laser Grid', len: 220, warn: 0.5, active: 3.0, cool: 12 },
  anvils: { name: 'Anvil Drop', len: 260, warn: 0.9, active: 0.25, cool: 10 },
  acid: { name: 'Acid Flood', len: 200, warn: 0.7, active: 2.2, cool: 13 },
};
export const TRAP_IDS = Object.keys(TRAPS);
export const TRAP_STATE = { ready: 0, warn: 1, active: 2, cool: 3 };
const BOULDER = { r: 100, speed: 420 };
const DART = { speed: 700, count: 9, spread: 1.4, r: 6 };
const FLAME = { len: 270, half: 0.42, sweep: 0.7 };
const ANVIL = { count: 8, r: 36 };

// Deterministic per-activation randomness, so the browser draws what the server decided.
export function seeded(seed) {
  let x = seed | 0 || 1;
  return () => {
    x = (x * 16807) % 2147483647;
    return (x - 1) / 2147483646;
  };
}

export function anvilSpots(trap, seed) {
  const r = seeded(seed);
  return Array.from({ length: ANVIL.count }, () => [trap.a + 30 + r() * (trap.b - trap.a - 60), -LANE + 30 + r() * (2 * LANE - 60)]);
}

export function dartPlan(trap, seed) {
  const r = seeded(seed);
  return Array.from({ length: DART.count }, (_, i) => [trap.a + 20 + (i / (DART.count - 1)) * (trap.b - trap.a - 40), r() * DART.spread]);
}

// Where a moving trap part is, t seconds into its active phase.
export function boulderAt(trap, t) {
  return trap.sec0 + BOULDER.r * 0.5 + t * BOULDER.speed;
}

export function laserBeams(trap, t) {
  // Two beams sweep along the stretch: a low one (jump it) and a high one (stay on the ground).
  const span = trap.b - trap.a;
  const k = (Math.sin(t * 2.4) + 1) / 2;
  return [{ s: trap.a + k * span, high: false }, { s: trap.b - k * span, high: true }];
}

export function flameAngle(trap, t) {
  return -Math.PI / 2 + Math.sin(t * 2.2) * FLAME.sweep;
}

export const TRAP_PARTS = { BOULDER, DART, FLAME, ANVIL };

// Does trap (in state st, t seconds in, with seed) kill a runner at (s, u, z)?
export function trapKills(trap, st, t, seed, s, u, z, r) {
  const air = z > 6;
  const inside = s > trap.a && s < trap.b;
  switch (trap.kind) {
    case 'cell':
      return st === TRAP_STATE.active && t > 0.9 && !air && s > trap.a + 12 && s < trap.b - 12;
    case 'press':
      return st === TRAP_STATE.active && t < 0.3 && inside;
    case 'darts':
      if (st !== TRAP_STATE.active) return false;
      return dartPlan(trap, seed).some(([ds, delay]) => {
        const du = LANE - (t - delay) * DART.speed;
        return t >= delay && du > -LANE - 20 && Math.abs(ds - s) < r + DART.r && Math.abs(du - u) < r + DART.r;
      });
    case 'flame': {
      if (st !== TRAP_STATE.active) return false;
      const ns = (trap.a + trap.b) / 2;
      const a = flameAngle(trap, t);
      const ds = s - ns;
      const du = u - LANE;
      const d = Math.hypot(ds, du);
      const diff = Math.abs(Math.atan2(Math.sin(Math.atan2(du, ds) - a), Math.cos(Math.atan2(du, ds) - a)));
      return d < FLAME.len && diff < FLAME.half;
    }
    case 'trapdoor':
      return st === TRAP_STATE.active && !air && inside && Math.abs(u) > 14;
    case 'launcher':
      return false; // it throws runners off the edge rather than killing them outright
    case 'boulder': {
      if (st !== TRAP_STATE.active) return false;
      const bs = boulderAt(trap, t);
      return Math.hypot(bs - s, u) < BOULDER.r + r;
    }
    case 'laser':
      if (st !== TRAP_STATE.active) return false;
      return laserBeams(trap, t).some((b) => Math.abs(b.s - s) < r && (b.high ? air : !air));
    case 'anvils':
      return st === TRAP_STATE.active && anvilSpots(trap, seed).some(([as, au]) => Math.hypot(as - s, au - u) < ANVIL.r + r * 0.5);
    case 'acid':
      return st === TRAP_STATE.active && t > 0.3 && !air && inside;
    default:
      return false;
  }
}

// ---- building a course ---------------------------------------------------------------------

// def: { name, kind: 'loop' | 'snake', killer: bool, plan: [[section, trap?], ...] }
export function buildCourse(def) {
  const sections = [];
  let s = 0;
  const course = { name: def.name, killer: def.killer, sections: [], pits: [], floors: [], solids: [], circles: [], zones: [], movers: [], traps: [], rests: [] };
  def.plan.forEach(([kind, trapKind, len], i) => {
    const sec = SECTIONS[kind](len || (kind === 'rest' ? 170 : 220));
    const s0 = s;
    const s1 = s + sec.len;
    const shift = (r) => [r[0] + s0, r[1] + s0, r[2], r[3]];
    course.pits.push(...sec.pits.map(shift));
    course.floors.push(...sec.floors.map(shift));
    course.solids.push(...sec.solids.map(shift));
    course.circles.push(...sec.circles.map(([cs, u, r]) => [cs + s0, u, r]));
    course.zones.push(...sec.zones.map((z) => ({ ...z, a: z.a + s0, b: z.b + s0 })));
    course.movers.push(...sec.movers.map((m) => ({ ...m, s: m.s !== undefined ? m.s + s0 : undefined, a: m.a !== undefined ? m.a + s0 : undefined, b: m.b !== undefined ? m.b + s0 : undefined })));
    if (kind === 'rest' || kind === 'start') course.rests.push({ s: s0 + 40, half: false });
    if (trapKind && def.killer) {
      const T = TRAPS[trapKind];
      const tlen = T.len || sec.len;
      const a = s0 + (sec.len - tlen) / 2;
      course.traps.push({ id: course.traps.length, kind: trapKind, a, b: a + tlen, sec0: s0, sec1: s1, button: s0 + sec.len / 2 - 40 });
    }
    sections.push({ kind, trap: trapKind || null, s0, s1, i });
    s = s1;
  });
  course.sections = sections;
  course.length = s;
  course.finish = sections[sections.length - 1].s0;
  // The big checkpoint is the rest stop nearest the middle.
  const restSecs = sections.filter((x) => x.kind === 'rest');
  const mid = restSecs.reduce((best, x) => (Math.abs(x.s0 - s / 2) < Math.abs(best.s0 - s / 2) ? x : best), restSecs[0]);
  course.half = mid ? mid.s0 + 40 : 40;
  for (const r of course.rests) if (r.s === course.half) r.half = true;
  layPath(course, def);
  return course;
}

// Lays the course along its path and samples a frame (point, tangent, curvature) every STEP units.
function layPath(course, def) {
  const L = course.length + 60;
  const pieces = [];
  if (def.kind === 'loop') {
    const sweep = Math.PI * 2 * 0.9;
    pieces.push(['arc', L / sweep, sweep]);
  } else {
    // A snake: runs across, U-turns down, runs back, and so on.
    const run = def.run || 1100;
    const R = 440;
    let left = L;
    let dir = 1;
    while (left > 0) {
      pieces.push(['line', Math.min(run, left)]);
      left -= run;
      if (left <= 0) break;
      pieces.push(['arc', R, Math.PI * dir]);
      left -= Math.PI * R;
      dir = -dir;
    }
  }
  const n = Math.ceil(L / STEP) + 2;
  const px = new Float64Array(n);
  const py = new Float64Array(n);
  const tx = new Float64Array(n);
  const ty = new Float64Array(n);
  const kk = new Float64Array(n);
  let x = 0;
  let y = 0;
  let a = def.kind === 'loop' ? 0 : 0;
  let i = 0;
  let pieceIdx = 0;
  let along = 0;
  for (; i < n; i++) {
    px[i] = x;
    py[i] = y;
    tx[i] = Math.cos(a);
    ty[i] = Math.sin(a);
    let p = pieces[Math.min(pieceIdx, pieces.length - 1)];
    const curv = p[0] === 'arc' ? Math.sign(p[2]) / p[1] : 0;
    kk[i] = curv;
    // advance STEP
    x += Math.cos(a) * STEP;
    y += Math.sin(a) * STEP;
    a += curv * STEP;
    along += STEP;
    const plen = p[0] === 'arc' ? p[1] * Math.abs(p[2]) : p[1];
    if (along >= plen && pieceIdx < pieces.length - 1) {
      along -= plen;
      pieceIdx++;
    }
  }
  course.path = { px, py, tx, ty, k: kk, n };
  // Bounds of everything, for the camera.
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let j = 0; j < n; j++) {
    for (const u of [-LANE - 40, KILLER[1] + 40]) {
      const wx = px[j] - ty[j] * u;
      const wy = py[j] + tx[j] * u;
      x0 = Math.min(x0, wx);
      y0 = Math.min(y0, wy);
      x1 = Math.max(x1, wx);
      y1 = Math.max(y1, wy);
    }
  }
  course.bounds = { x0, y0, x1, y1 };
}

// Track frame at s: position on the centre line, unit tangent, curvature.
export function frameAt(course, s) {
  const p = course.path;
  const f = Math.max(0, Math.min(p.n - 2, s / STEP));
  const i = Math.floor(f);
  const t = f - i;
  const x = p.px[i] + (p.px[i + 1] - p.px[i]) * t;
  const y = p.py[i] + (p.py[i + 1] - p.py[i]) * t;
  let tx = p.tx[i] + (p.tx[i + 1] - p.tx[i]) * t;
  let ty = p.ty[i] + (p.ty[i + 1] - p.ty[i]) * t;
  const l = Math.hypot(tx, ty) || 1;
  tx /= l;
  ty /= l;
  return { x, y, tx, ty, nx: -ty, ny: tx, k: p.k[i] };
}

export function toWorld(course, s, u) {
  const f = frameAt(course, s);
  return { x: f.x + f.nx * u, y: f.y + f.ny * u };
}

// ---- moving parts --------------------------------------------------------------------------

export function moverShape(m, t) {
  switch (m.t) {
    case 'pusher': {
      const ext = m.depth * (0.5 + 0.5 * Math.sin(t * m.speed + m.phase));
      const dext = m.depth * 0.5 * m.speed * Math.cos(t * m.speed + m.phase);
      return { rect: [m.s - m.w / 2, m.s + m.w / 2, LANE - ext, LANE + 4], vu: -dext };
    }
    case 'platform': {
      const uc = m.range * Math.sin(t * m.speed + m.phase);
      const vu = m.range * m.speed * Math.cos(t * m.speed + m.phase);
      return { floor: [m.s - m.half, m.s + m.half, uc - m.half, uc + m.half], vu };
    }
    case 'sweeper': {
      const a = t * m.speed + m.phase;
      return { seg: [m.s, m.u, m.s + Math.cos(a) * m.len, m.u + Math.sin(a) * m.len], a, speed: m.speed };
    }
    case 'barrel': {
      const span = m.b - m.a;
      const cyc = span / m.v;
      const k = (((t + m.offset * cyc) % cyc) + cyc) % cyc;
      return { circle: [m.b - k * m.v, m.u, 18] };
    }
    default:
      return {};
  }
}

// Gusts blow for a second every period, alternating sides; the browser shows the next one coming.
export const WIND = { gust: 1.0, force: 150 };
export function windAt(z, t) {
  const ph = t % z.period;
  if (ph > WIND.gust) return 0;
  return (Math.floor(t / z.period) % 2 ? 1 : -1) * WIND.force;
}

function inRect(r, s, u) {
  return s >= r[0] && s <= r[1] && u >= r[2] && u <= r[3];
}

// Is there floor under a runner at (s, u) at time t (ignoring traps)?
export function onFloor(course, s, u, t) {
  if (Math.abs(u) > LANE || s < 0 || s > course.length) return false;
  if (!course.pits.some((r) => inRect(r, s, u))) return true;
  if (course.floors.some((r) => inRect(r, s, u))) return true;
  for (const m of course.movers) {
    if (m.t !== 'platform') continue;
    const sh = moverShape(m, t);
    if (inRect(sh.floor, s, u)) return true;
  }
  return false;
}

// Pushes a circle (s, u, r) out of a track-space rectangle. Returns the push direction or null.
function pushRect(p, r, rect) {
  const cs = Math.max(rect[0], Math.min(p.s, rect[1]));
  const cu = Math.max(rect[2], Math.min(p.u, rect[3]));
  let ds = p.s - cs;
  let du = p.u - cu;
  const d2 = ds * ds + du * du;
  if (d2 >= r * r) return null;
  let push;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    ds /= d;
    du /= d;
    push = r - d;
  } else {
    const opts = [[p.s - rect[0], -1, 0], [rect[1] - p.s, 1, 0], [p.u - rect[2], 0, -1], [rect[3] - p.u, 0, 1]].sort((a, b) => a[0] - b[0]);
    [, ds, du] = opts[0];
    push = opts[0][0] + r;
  }
  p.s += ds * push;
  p.u += du * push;
  const vn = p.vs * ds + p.vu * du;
  if (vn < 0) {
    p.vs -= vn * ds;
    p.vu -= vn * du;
  }
  return [ds, du];
}

function pushCircle(p, r, cs, cu, cr, bounce = 0) {
  const ds = p.s - cs;
  const du = p.u - cu;
  const d = Math.hypot(ds, du);
  if (d >= r + cr) return false;
  const ns = d > 1e-6 ? ds / d : 1;
  const nu = d > 1e-6 ? du / d : 0;
  p.s = cs + ns * (r + cr);
  p.u = cu + nu * (r + cr);
  const vn = p.vs * ns + p.vu * nu;
  if (vn < 0) {
    p.vs -= (1 + bounce) * vn * ns;
    p.vu -= (1 + bounce) * vn * nu;
  }
  return true;
}

export function newRunner(s, u) {
  return { s, u, vs: 0, vu: 0, z: 0, vz: 0, aim: 0, knockT: 0, jumpCd: 0 };
}

// Solid rectangles that traps add while running (Cell Block's bars), for movement.
export function trapSolids(course, states) {
  const out = [];
  for (const tr of course.traps) {
    const st = states && states[tr.id];
    if (tr.kind === 'cell' && st && (st[0] === TRAP_STATE.active || (st[0] === TRAP_STATE.warn && st[1] > 0.35))) {
      out.push([tr.a, tr.a + 12, -LANE, LANE], [tr.b - 12, tr.b, -LANE, LANE]);
    }
  }
  return out;
}

// One tick of runner movement in track space. cmd: { mx, my, a, b } (b & 2 = jump).
// Returns 'bounce' on the tick a bounce pad fires, otherwise null.
export function stepRunner(p, cmd, course, t, frozen, extraSolids = []) {
  p.aim = cmd.a;
  p.knockT = Math.max(0, p.knockT - DT);
  p.jumpCd = Math.max(0, p.jumpCd - DT);
  if (frozen) {
    p.vs = 0;
    p.vu = 0;
    return null;
  }
  const f = frameAt(course, p.s);
  const grounded = p.z <= 0 && p.vz <= 0;
  let speed = RUN.speed;
  let extraS = 0;
  let extraU = 0;
  let event = null;
  if (grounded) {
    for (const z of course.zones) {
      if (p.s < z.a || p.s > z.b || p.u < z.u0 || p.u > z.u1) continue;
      if (z.t === 'slow') speed *= RUN.slow;
      else if (z.t === 'conv') extraS += z.v;
      else if (z.t === 'wind') extraU += windAt(z, t);
      else if (z.t === 'bounce') {
        p.vz = RUN.bounceV;
        p.z = 0.01;
        p.vs = Math.max(p.vs, RUN.bounceBoost);
        event = 'bounce';
      }
    }
  }
  const ws = (cmd.mx * f.tx + cmd.my * f.ty) * speed;
  const wu = (cmd.mx * f.nx + cmd.my * f.ny) * speed;
  const control = !grounded ? RUN.airControl : p.knockT > 0 ? 2 : RUN.control;
  const k = 1 - Math.exp(-control * DT);
  p.vs += (ws - p.vs) * k;
  p.vu += (wu - p.vu) * k;
  if (cmd.b & 2 && grounded && p.jumpCd <= 0 && event !== 'bounce') {
    p.vz = RUN.jumpV;
    p.z = 0.01;
    p.jumpCd = RUN.jumpCd;
  }
  if (p.z > 0 || p.vz > 0) {
    p.z += p.vz * DT;
    p.vz -= RUN.gravity * DT;
    if (p.z <= 0) {
      p.z = 0;
      p.vz = 0;
    }
  }
  // Standing on a moving platform carries you with it.
  if (grounded) {
    for (const m of course.movers) {
      if (m.t !== 'platform') continue;
      const sh = moverShape(m, t);
      if (inRect(sh.floor, p.s, p.u)) extraU += sh.vu;
    }
  }
  const stretch = 1 - p.u * f.k;
  p.s += ((p.vs + extraS) * DT) / (Math.abs(stretch) > 0.2 ? stretch : 0.2);
  p.u += (p.vu + extraU) * DT;
  const r = RUN.radius;
  for (const rect of course.solids) pushRect(p, r, rect);
  for (const rect of extraSolids) pushRect(p, r, rect);
  for (const [cs, cu, cr] of course.circles) pushCircle(p, r, cs, cu, cr, 0.8);
  for (const m of course.movers) {
    const sh = moverShape(m, t);
    if (sh.rect) {
      const dir = pushRect(p, r, sh.rect);
      if (dir && sh.vu < 0) p.vu = Math.min(p.vu, sh.vu * 1.2);
    } else if (sh.circle && p.z < 20) {
      if (pushCircle(p, r, sh.circle[0], sh.circle[1], sh.circle[2])) {
        p.vs = -380;
        p.knockT = 0.35;
      }
    } else if (sh.seg && p.z < 14) {
      // The sweeper only hits you on the ground.
      const [s0, u0, s1, u1] = sh.seg;
      const es = s1 - s0;
      const eu = u1 - u0;
      const l2 = es * es + eu * eu;
      const q = Math.max(0, Math.min(1, ((p.s - s0) * es + (p.u - u0) * eu) / l2));
      const d = Math.hypot(p.s - s0 - es * q, p.u - u0 - eu * q);
      if (d < r + 8 && q > 0.15) {
        const tan = sh.a + Math.PI / 2;
        p.vs = Math.cos(tan) * 600;
        p.vu = Math.sin(tan) * 600;
        p.knockT = 0.45;
      }
    }
  }
  // The rail (on Deathrunner courses) and the start wall.
  if (course.killer && p.u > RAIL[0] - r) {
    p.u = RAIL[0] - r;
    p.vu = Math.min(0, p.vu);
  }
  if (p.s < r) p.s = r;
  return event;
}

// The killer walks their raised track; the two belts on the far side whisk them along it.
export function stepKiller(p, cmd, course, frozen) {
  p.aim = cmd.a;
  if (frozen) return;
  const f = frameAt(course, p.s);
  const ws = (cmd.mx * f.tx + cmd.my * f.ty) * RUN.killerSpeed;
  const wu = (cmd.mx * f.nx + cmd.my * f.ny) * RUN.killerSpeed;
  const k = 1 - Math.exp(-RUN.control * DT);
  p.vs += (ws - p.vs) * k;
  p.vu += (wu - p.vu) * k;
  let belt = 0;
  for (const [u0, u1, dir] of CONVEYORS) if (p.u >= u0 && p.u < u1) belt = dir * RUN.conveyor;
  const stretch = 1 - p.u * f.k;
  p.s += ((p.vs + belt) * DT) / (Math.abs(stretch) > 0.2 ? stretch : 0.2);
  p.u += p.vu * DT;
  const r = RUN.radius;
  p.u = Math.max(KILLER[0] + r, Math.min(KILLER[1] - r, p.u));
  p.s = Math.max(r, Math.min(course.length - r, p.s));
}

// ---- the courses ---------------------------------------------------------------------------

// Floor traps (Trapdoors, Launch Plate, Cell Block, Acid Flood) sit on sections with solid floor;
// the rest work anywhere.
export const COURSES = {
  doom: { name: 'Ring of Doom', kind: 'loop', killer: true, plan: [
    ['start', null, 260],
    ['gaps', 'press'], ['rest'],
    ['pushers', 'launcher'], ['rest'],
    ['sweeper', 'trapdoor'], ['rest'],
    ['conveyor', 'acid'], ['rest', null, 220],
    ['movers', 'darts'], ['rest'],
    ['climb', 'boulder'], ['rest'],
    ['beam', 'laser'], ['rest'],
    ['bounce', 'anvils'], ['rest'],
    ['sweeper', 'cell'], ['rest'],
    ['gaps', 'flame'],
    ['finish', null, 260],
  ] },
  serpent: { name: 'Serpent', kind: 'snake', killer: true, run: 1150, plan: [
    ['start', null, 260],
    ['pushers', 'cell'], ['rest'],
    ['gaps', 'darts'], ['rest'],
    ['climb', 'acid'], ['rest'],
    ['movers', 'press'], ['rest'],
    ['conveyor', 'launcher'], ['rest', null, 220],
    ['bounce', 'anvils'], ['rest'],
    ['beam', 'flame'], ['rest'],
    ['sweeper', 'trapdoor'], ['rest'],
    ['gaps', 'laser'], ['rest'],
    ['pushers', 'boulder'],
    ['finish', null, 260],
  ] },
  orbit: { name: 'Orbit', kind: 'loop', killer: true, plan: [
    ['start', null, 260],
    ['conveyor', 'launcher'], ['rest'],
    ['sweeper', 'cell'], ['rest'],
    ['gaps', 'anvils'], ['rest'],
    ['beam', 'darts'], ['rest', null, 220],
    ['pushers', 'boulder'], ['rest'],
    ['bounce', 'press'], ['rest'],
    ['movers', 'laser'], ['rest'],
    ['climb', 'trapdoor'], ['rest'],
    ['gaps', 'flame'], ['rest'],
    ['conveyor', 'acid'],
    ['finish', null, 260],
  ] },
  switchback: { name: 'Switchback', kind: 'snake', killer: true, run: 900, plan: [
    ['start', null, 260],
    ['sweeper', 'trapdoor'], ['rest'],
    ['movers', 'darts'], ['rest'],
    ['pushers', 'cell'], ['rest'],
    ['gaps', 'flame'], ['rest', null, 220],
    ['climb', 'acid'], ['rest'],
    ['conveyor', 'launcher'], ['rest'],
    ['bounce', 'boulder'], ['rest'],
    ['beam', 'anvils'], ['rest'],
    ['pushers', 'laser'], ['rest'],
    ['gaps', 'press'],
    ['finish', null, 260],
  ] },
  // Sky Run: races with no killer.
  skyway: { name: 'Skyway', kind: 'snake', killer: false, run: 1000, plan: [
    ['start', null, 260], ['gaps'], ['rest'], ['movers'], ['sweeper'], ['rest'], ['bounce'], ['pushers'], ['rest', null, 200],
    ['beam'], ['conveyor'], ['rest'], ['climb'], ['gaps'], ['rest'], ['movers'], ['bounce'], ['finish', null, 260],
  ] },
  halo: { name: 'Halo', kind: 'loop', killer: false, plan: [
    ['start', null, 260], ['sweeper'], ['gaps'], ['rest'], ['pushers'], ['bounce'], ['rest'], ['beam'], ['movers'], ['rest', null, 200],
    ['conveyor'], ['sweeper'], ['rest'], ['gaps'], ['climb'], ['rest'], ['pushers'], ['beam'], ['finish', null, 260],
  ] },
};

const built = new Map();
export function course(id) {
  if (!built.has(id)) built.set(id, buildCourse(COURSES[id]));
  return built.get(id);
}
export const DEATHRUN_IDS = ['doom', 'serpent', 'orbit', 'switchback'];
export const SKYRUN_IDS = ['skyway', 'halo'];
