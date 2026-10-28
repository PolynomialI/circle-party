// Maps and movement shared by the smaller games (Hex Drop, Wall Rush, Light Trails,
// Ricochet Tanks), so the browser can predict its own movement.
import { DT } from './loop.js';
import { border, rayBlocksHit } from './world.js';

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
export const RUSH = { w: 1200, h: 800, side: 40, bar: 40, air: 6 }; // air: above this height walls pass under you
export const RUSH_SIDES = [[0, -400, RUSH.side, RUSH.h + 800, 'wall'], [RUSH.w - RUSH.side, -400, RUSH.side, RUSH.h + 800, 'wall']];
export const RUSH_SIDES_MAP = { blocks: RUSH_SIDES, zones: [] };

// Held power-ups, used with a click. Crates appear on the platform and get smashed by walls.
export const RUSH_POWERS = {
  glove: { name: 'Glove', color: '#ff8a3d', uses: 3, reach: 36, arc: 1.1, push: 950, cd: 0.45 }, // punch people into walls
  spring: { name: 'Spring', color: '#59e07a', vz: 380 }, // jump clean over a wall
  drill: { name: 'Drill', color: '#ffd447', w: 130 }, // bore a new gap in the next wall coming
  freeze: { name: 'Freeze', color: '#4fd1ff', time: 3, slow: 0.3 }, // every wall slows right down
};
export const RUSH_POWER_IDS = Object.keys(RUSH_POWERS);
export const RUSH_CRATES = { max: 2, every: 4.5, first: 2.5, reach: 26 };

// Solid pieces of each sweeping bar [y, gapFrom, gapTo, ...].
export function rushBlocks(bars) {
  const out = [...RUSH_SIDES];
  for (const bar of bars) {
    let x = RUSH.side;
    for (let i = 1; i < bar.length; i += 2) {
      if (bar[i] > x) out.push([x, bar[0], bar[i] - x, RUSH.bar, 'machine']);
      x = Math.max(x, bar[i + 1]);
    }
    if (RUSH.w - RUSH.side > x) out.push([x, bar[0], RUSH.w - RUSH.side - x, RUSH.bar, 'machine']);
  }
  return out;
}

// Click to use what you hold. Handles your own side of it (the spring jump, glove charges);
// returns the power-up on the tick it is used so the server can do the rest.
export function useRushPower(p, cmd, frozen) {
  p.gcd = Math.max(0, p.gcd - DT);
  const click = (cmd.b & 1) !== 0 && !p.trig;
  p.trig = (cmd.b & 1) !== 0;
  if (frozen || !click || !p.held) return '';
  const kind = p.held;
  if (kind === 'glove') {
    if (p.gcd > 0) return '';
    p.gcd = RUSH_POWERS.glove.cd;
    if (--p.uses <= 0) p.held = '';
    return kind;
  }
  if (kind === 'spring') {
    if (p.z > 0) return '';
    p.vz = RUSH_POWERS.spring.vz;
    p.z = 0.01;
  }
  p.held = '';
  return kind;
}

// ---- Light Trails: always moving, steer towards the mouse, don't hit any trail ----
export const TRAILS = {
  w: 1500, h: 950, speed: 210, turn: 3.6, boost: 1.8, boostTime: 0.5, boostCd: 3, head: 9,
  gap: 48, // every so often your trail skips this far, leaving a hole
  portalR: 24,
  shrinkAt: 25, // seconds into a round the walls start closing in
  shrinkTime: 40,
};

// Held power-ups, used with a click. Crates appear around the arena.
export const TRAIL_POWERS = {
  hop: { name: 'Hop', color: '#4fd1ff', time: 0.6 }, // jump over everything for a moment
  cutter: { name: 'Cutter', color: '#ff8a3d', reach: 80, r: 75 }, // blast a hole in the trails ahead
  ghost: { name: 'Ghost', color: '#b77bff', time: 3 }, // pass through trails (not walls)
  scramble: { name: 'Scramble', color: '#ff6fb5', time: 2.2 }, // everyone else steers backwards
};
export const TRAIL_POWER_IDS = Object.keys(TRAIL_POWERS);
export const TRAIL_CRATES = { max: 3, every: 5, reach: 26, first: 3 };

const steelMap = (name, extra = {}) => ({
  name,
  w: TRAILS.w,
  h: TRAILS.h,
  seam: 100,
  zones: [[40, 40, TRAILS.w - 80, TRAILS.h - 80, 'steel']],
  blocks: border(TRAILS.w, TRAILS.h),
  pylons: [],
  portals: [],
  ...extra,
});

export const TRAIL_MAPS = {
  grid: steelMap('Grid', { marks: [{ t: 'emblem', x: TRAILS.w / 2, y: TRAILS.h / 2, r: 150, c: '#b3c2d6', c2: '#c3cfdf' }] }),
  pylons: steelMap('Pylons', {
    pylons: [[450, 300, 34], [1050, 300, 34], [450, 650, 34], [1050, 650, 34], [750, 475, 48], [750, 190, 26], [750, 760, 26]],
    marks: [{ t: 'grate', x: 690, y: 415, w: 120, h: 120 }],
  }),
  portals: steelMap('Portals', {
    // Pairs [ax, ay, bx, by]: drive into one side, come out of the other going the same way.
    portals: [[260, 200, 1240, 750], [260, 750, 1240, 200]],
    marks: [{ t: 'emblem', x: TRAILS.w / 2, y: TRAILS.h / 2, r: 110, c: '#b3c2d6', c2: '#c3cfdf' }],
  }),
};
export const TRAIL_MAP_IDS = Object.keys(TRAIL_MAPS);
export const TRAIL_MAP = TRAIL_MAPS.grid;

// The open area this far into the round: the walls close in after a while.
export function trailBounds(rt) {
  const k = Math.max(0, Math.min(1, (rt - TRAILS.shrinkAt) / TRAILS.shrinkTime));
  const ix = 40 + k * 430;
  const iy = 40 + k * 260;
  return { x0: ix, y0: iy, x1: TRAILS.w - ix, y1: TRAILS.h - iy, k };
}

// Distance travelled between one trail gap and the next (different for each player and gap).
function gapSpacing(idx, n) {
  return 360 + (((idx * 7919 + n * 104729) % 97) / 97) * 320;
}

export function newTrailer(x, y, aim, idx) {
  return {
    x, y, aim, boostT: 0, boostCd: 0, hopT: 0, ghostT: 0, revT: 0, tpCd: 0, tp: 0,
    dist: 0, gs: idx, gapAt: gapSpacing(idx, 0), gapN: 0, held: '', trig: false,
  };
}

// Is the pen down (leaving a trail) right now?
export function trailPen(p) {
  return p.hopT <= 0 && p.dist < p.gapAt;
}

// One tick of movement. Returns the held power-up on the tick it is used (cutter and scramble
// act on others, so the server applies those), otherwise ''.
export function stepTrail(p, cmd, frozen, map = TRAIL_MAP) {
  p.boostCd = Math.max(0, p.boostCd - DT);
  p.boostT = Math.max(0, p.boostT - DT);
  p.hopT = Math.max(0, p.hopT - DT);
  p.ghostT = Math.max(0, p.ghostT - DT);
  p.revT = Math.max(0, p.revT - DT);
  p.tpCd = Math.max(0, p.tpCd - DT);
  const click = (cmd.b & 1) !== 0 && !p.trig;
  p.trig = (cmd.b & 1) !== 0;
  if (frozen) return '';
  let used = '';
  if (click && p.held) {
    used = p.held;
    p.held = '';
    if (used === 'hop') p.hopT = TRAIL_POWERS.hop.time;
    if (used === 'ghost') p.ghostT = TRAIL_POWERS.ghost.time;
  }
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
  if (p.revT > 0) turn = -turn;
  p.aim += turn * TRAILS.turn * DT;
  const v = TRAILS.speed * (p.boostT > 0 ? TRAILS.boost : 1);
  p.x += Math.cos(p.aim) * v * DT;
  p.y += Math.sin(p.aim) * v * DT;
  p.dist += v * DT;
  if (p.dist >= p.gapAt + TRAILS.gap) p.gapAt += TRAILS.gap + gapSpacing(p.gs, ++p.gapN);
  if (p.tpCd <= 0) {
    for (const [ax, ay, bx, by] of map.portals) {
      for (const [fx, fy, tx, ty] of [[ax, ay, bx, by], [bx, by, ax, ay]]) {
        if (Math.hypot(p.x - fx, p.y - fy) < TRAILS.portalR) {
          p.x = tx + Math.cos(p.aim) * (TRAILS.portalR + 6);
          p.y = ty + Math.sin(p.aim) * (TRAILS.portalR + 6);
          p.tpCd = 0.5;
          p.tp++;
          return used;
        }
      }
    }
  }
  return used;
}

// ---- Ricochet Tanks: a new random maze every round ----
export const MAZE = { cols: 9, rows: 6, cell: 150, wall: 12 };
export const TANK = { radius: 15, speed: 170, bullet: 380, bulletR: 5, life: 7, max: 5, cooldown: 0.3 };

// Weapon crates in the maze: grab one and your next shot (or burst) is something else.
export const TANK_WEAPONS = {
  gatling: { name: 'Gatling', color: '#ff8a3d', ammo: 16, every: 0.07, spread: 0.14, speed: 430, life: 2.2, r: 3 }, // hold to spray
  laser: { name: 'Laser', color: '#ff4f6d', len: 1500, bounces: 3 }, // an instant beam that bounces
  frag: { name: 'Frag', color: '#59e07a', speed: 240, r: 9, fuse: 2.5, shards: 14, shardSpeed: 420, shardLife: 0.8 }, // click again to burst
  mine: { name: 'Mine', color: '#b77bff', arm: 1.2, r: 10, blast: 55 }, // drop it; it arms, then anyone who drives over goes up
};
export const TANK_WEAPON_IDS = Object.keys(TANK_WEAPONS);
export const TANK_CRATES = { max: 2, every: 6, first: 4, reach: 20 };
export const BULLET_KINDS = ['shell', 'gatling', 'frag', 'shard'];

// A laser's path from (x, y) at angle a, bouncing off walls: [[x0, y0, x1, y1], ...].
export function laserPath(x, y, a, blocks, len = TANK_WEAPONS.laser.len, bounces = TANK_WEAPONS.laser.bounces) {
  const segs = [];
  let left = len;
  for (let b = 0; b <= bounces && left > 0; b++) {
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const w = rayBlocksHit(x, y, dx, dy, left, blocks);
    segs.push([x, y, x + dx * w.t, y + dy * w.t]);
    if (w.t >= left) break;
    x += dx * (w.t - 0.5);
    y += dy * (w.t - 0.5);
    left -= w.t;
    const dot = dx * w.nx + dy * w.ny;
    a = Math.atan2(dy - 2 * dot * w.ny, dx - 2 * dot * w.nx);
  }
  return segs;
}

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
  start: { slow: 3, ease: 2, mul: 0.25 }, // bars crawl at mul speed for slow seconds, then ease up to full
};
export const SPIN_VOID = { blocks: [], zones: [] };

function barAngle([v0, v1], t) {
  const R = SPIN.ramp;
  const a = (v1 - v0) / R;
  const full = t <= R ? v0 * t + (a / 2) * t * t : v0 * R + ((v1 - v0) / 2) * R + v1 * (t - R);
  // Take off the turning the slow start skipped.
  const { slow: S, ease: E, mul } = SPIN.start;
  const k = 1 - mul;
  const t1 = Math.min(t, S);
  let lost = k * (v0 * t1 + (a / 2) * t1 * t1);
  if (t > S) {
    const u = Math.min(t, S + E) - S;
    const c = v0 + a * S;
    lost += k * (c * u + (a / 2) * u * u - (c / (2 * E)) * u * u - (a / (3 * E)) * u ** 3);
  }
  return full - lost;
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
