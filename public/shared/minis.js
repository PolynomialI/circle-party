// Maps and movement shared by the smaller games (Hex Drop, Wall Rush, Light Trails,
// Ricochet Tanks), so the browser can predict its own movement.
import { DT } from './loop.js';
import { border } from './world.js';

// ---- Hex Drop: tiles fall away shortly after you step on them ----
export const HEX = { size: 46, rings: 6, crack: 0.495, spawnCrack: 0.99, foot: 0.5 }; // foot: support radius as a share of the body
export const HEX_TILES = [];
for (let q = -HEX.rings; q <= HEX.rings; q++) {
  for (let r = Math.max(-HEX.rings, -q - HEX.rings); r <= Math.min(HEX.rings, -q + HEX.rings); r++) HEX_TILES.push([q, r]);
}
const HEX_INDEX = new Map(HEX_TILES.map(([q, r], i) => [`${q},${r}`, i]));
export const HEX_VOID = { blocks: [], zones: [] }; // no walls: the edge is a drop

export function hexCenter(q, r) {
  return { x: HEX.size * Math.sqrt(3) * (q + r / 2), y: HEX.size * 1.5 * r };
}

// Tiles under a player's feet: their centre and six points around it.
export function hexesUnder(x, y, r) {
  const out = new Set();
  const i0 = hexAt(x, y);
  if (i0 >= 0) out.add(i0);
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3;
    const i = hexAt(x + Math.cos(a) * r, y + Math.sin(a) * r);
    if (i >= 0) out.add(i);
  }
  return out;
}

export function hexAt(x, y) {
  const qf = ((Math.sqrt(3) / 3) * x - y / 3) / HEX.size;
  const rf = ((2 / 3) * y) / HEX.size;
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  const i = HEX_INDEX.get(`${q},${r}`);
  return i === undefined ? -1 : i;
}

// ---- Wall Rush: walls with gaps sweep down a platform; get pushed off the bottom and you're out ----
export const RUSH = { w: 1200, h: 800, side: 40, bar: 40 };
export const RUSH_SIDES = [[0, -400, RUSH.side, RUSH.h + 800, 'wall'], [RUSH.w - RUSH.side, -400, RUSH.side, RUSH.h + 800, 'wall']];

// Solid pieces of each sweeping bar [y, gapFrom, gapTo, ...].
export function rushBlocks(bars) {
  const out = [...RUSH_SIDES];
  for (const bar of bars) {
    let x = RUSH.side;
    for (let i = 1; i < bar.length; i += 2) {
      if (bar[i] > x) out.push([x, bar[0], bar[i] - x, RUSH.bar, 'machine']);
      x = bar[i + 1];
    }
    if (RUSH.w - RUSH.side > x) out.push([x, bar[0], RUSH.w - RUSH.side - x, RUSH.bar, 'machine']);
  }
  return out;
}

// ---- Light Trails: always moving, steer towards the mouse, don't hit any trail ----
export const TRAILS = { w: 1500, h: 950, speed: 210, turn: 3.6, boost: 1.8, boostTime: 0.5, boostCd: 3, head: 9 };
export const TRAIL_MAP = {
  name: 'Grid',
  w: TRAILS.w,
  h: TRAILS.h,
  seam: 100,
  zones: [[40, 40, TRAILS.w - 80, TRAILS.h - 80, 'steel']],
  blocks: border(TRAILS.w, TRAILS.h),
  marks: [{ t: 'emblem', x: TRAILS.w / 2, y: TRAILS.h / 2, r: 150, c: '#b3c2d6', c2: '#c3cfdf' }],
};

export function stepTrail(p, cmd, frozen) {
  p.boostCd = Math.max(0, p.boostCd - DT);
  p.boostT = Math.max(0, p.boostT - DT);
  if (frozen) return;
  if (cmd.b & 2 && p.boostCd <= 0) {
    p.boostT = TRAILS.boostTime;
    p.boostCd = TRAILS.boostCd;
  }
  // Keys turn directly; otherwise turn towards the mouse.
  let turn = 0;
  if (cmd.mx) turn = cmd.mx;
  else {
    const d = Math.atan2(Math.sin(cmd.a - p.aim), Math.cos(cmd.a - p.aim));
    turn = Math.max(-1, Math.min(1, d / (TRAILS.turn * DT)));
  }
  p.aim += turn * TRAILS.turn * DT;
  const v = TRAILS.speed * (p.boostT > 0 ? TRAILS.boost : 1);
  p.x += Math.cos(p.aim) * v * DT;
  p.y += Math.sin(p.aim) * v * DT;
}

// ---- Ricochet Tanks: a new random maze every round ----
export const MAZE = { cols: 9, rows: 6, cell: 150, wall: 12 };
export const TANK = { radius: 15, speed: 170, bullet: 380, bulletR: 5, life: 7, max: 5, cooldown: 0.3 };

function mulberry(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mazeCache = new Map();

// Depth-first maze with some extra openings, so there are loops to dodge around.
export function mazeMap(seed) {
  if (mazeCache.has(seed)) return mazeCache.get(seed);
  const { cols, rows, cell, wall } = MAZE;
  const rng = mulberry(seed);
  const right = Array.from({ length: rows }, () => Array(cols).fill(true));
  const down = Array.from({ length: rows }, () => Array(cols).fill(true));
  const seen = Array.from({ length: rows }, () => Array(cols).fill(false));
  const stack = [[0, 0]];
  seen[0][0] = true;
  while (stack.length) {
    const [r, c] = stack[stack.length - 1];
    const next = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([nr, nc]) => nr >= 0 && nc >= 0 && nr < rows && nc < cols && !seen[nr][nc]);
    if (!next.length) {
      stack.pop();
      continue;
    }
    const [nr, nc] = next[Math.floor(rng() * next.length)];
    if (nr > r) down[r][c] = false;
    else if (nr < r) down[nr][c] = false;
    else if (nc > c) right[r][c] = false;
    else right[r][nc] = false;
    seen[nr][nc] = true;
    stack.push([nr, nc]);
  }
  for (let i = 0; i < cols * rows * 0.18; i++) {
    const r = Math.floor(rng() * rows);
    const c = Math.floor(rng() * cols);
    if (rng() < 0.5 && c < cols - 1) right[r][c] = false;
    else if (r < rows - 1) down[r][c] = false;
  }
  const w = cols * cell;
  const h = rows * cell;
  const blocks = border(w, h, wall);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (right[r][c] && c < cols - 1) blocks.push([(c + 1) * cell - wall / 2, r * cell - wall / 2, wall, cell + wall, 'wall']);
      if (down[r][c] && r < rows - 1) blocks.push([c * cell - wall / 2, (r + 1) * cell - wall / 2, cell + wall, wall, 'wall']);
    }
  }
  const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push([(c + 0.5) * cell, (r + 0.5) * cell]);
  const map = { name: 'Maze', w, h, seam: cell, blocks, zones: [], marks: [], cells };
  mazeCache.set(seed, map);
  if (mazeCache.size > 20) mazeCache.delete(mazeCache.keys().next().value);
  return map;
}

// ---- Spin Cycle: jump the low bar, stay down for the high one ----
export const SPIN = {
  r: 380, minR: 200, shrinkStart: 20, shrinkTime: 40, hub: 34,
  len: 400, low: [1.1, 2.6], high: [-0.8, -1.7], ramp: 60, // bar speeds (rad/s) from start to after ramp seconds
  knock: 540, highZ: 12, view: 450,
};
export const SPIN_VOID = { blocks: [], zones: [] };

function barAngle([v0, v1], t) {
  const R = SPIN.ramp;
  if (t <= R) return v0 * t + ((v1 - v0) / (2 * R)) * t * t;
  return v0 * R + ((v1 - v0) / 2) * R + v1 * (t - R);
}
export function spinBars(t) {
  return { low: barAngle(SPIN.low, t), high: barAngle(SPIN.high, t) + Math.PI / 2 };
}
export function spinRadius(t) {
  const k = Math.min(1, Math.max(0, (t - SPIN.shrinkStart) / SPIN.shrinkTime));
  return SPIN.r + (SPIN.minR - SPIN.r) * k;
}

// ---- Floor is Lava: the floor floods in waves; stand on a stone or be in the air ----
export const LAVA = { safe: 4, warn: 1.6, lava: 3, stoneR: 52, sinkEach: 2 };
export const LAVA_MAP = {
  name: 'Foundry',
  w: 1400,
  h: 900,
  seam: 120,
  zones: [[40, 40, 1320, 820, 'steel']],
  blocks: [...border(1400, 900), [44, 44, 60, 60, 'tank'], [1296, 796, 60, 60, 'tank'], [1296, 44, 60, 60, 'tank'], [44, 796, 60, 60, 'tank']],
  marks: [{ t: 'grate', x: 640, y: 60, w: 120, h: 40 }, { t: 'grate', x: 640, y: 800, w: 120, h: 40 }],
  stones: [
    [230, 220], [480, 170], [740, 230], [1000, 170], [1200, 260],
    [300, 460], [560, 420], [840, 470], [1100, 440],
    [200, 690], [450, 700], [700, 650], [960, 700], [1210, 650],
  ],
  spawns: [[230, 220], [480, 170], [740, 230], [1000, 170], [300, 460], [560, 420], [840, 470], [1100, 440]],
};
