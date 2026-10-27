// Sumo rules, maps and the movement step. The server and the client's own-player
// prediction both run stepMover, so they move the same way.
import { DT } from './loop.js';

export const SUMO = {
  radius: 16,
  maxSpeed: 230,
  control: 10, // how quickly velocity reaches the wanted velocity (per second)
  iceControl: 1.2,
  knockControl: 1.5, // control while sliding after a hit
  knockTime: 0.35,
  chargeSpeedMul: 0.6,
  dashSpeed: 640,
  dashTime: 0.14,
  dashCooldown: 1.6,
  dashMassMul: 2.5,
  stickLength: 34,
  stickWidth: 6,
  reach: 32, // hit distance beyond the swinger's edge
  arc: 1.3, // half-angle of the swing, radians
  chargeTicks: 48, // 0.8 s to full charge
  minPush: 420,
  maxPush: 1050,
  swingTime: 0.14,
  swingCooldown: 0.4,
  playerBounce: 0.9,
  bumperPush: 560,
  fallTime: 0.6,
  firstCountdown: 3,
  countdown: 2,
  roundEnd: 2.5,
  gameEnd: 6,
};

const TAU = Math.PI * 2;
const ring8 = (r, offset = 0) => Array.from({ length: 8 }, (_, i) => ({ r, a: offset + (i * TAU) / 8 }));

// Shapes are centred on the origin. A point is on the platform if any solid contains it.
export const MAPS = {
  classic: {
    name: 'Classic',
    view: 400,
    solids: [{ t: 'circle', r: 360 }],
    spawns: ring8(250),
  },
  shrink: {
    name: 'Shrinking',
    view: 450,
    solids: [{ t: 'circle', r: 420 }],
    shrink: { from: 420, to: 110, start: 4, time: 45 },
    spawns: ring8(270),
  },
  ring: {
    name: 'Broken Ring',
    view: 440,
    solids: [{ t: 'ring', r0: 170, r1: 400, gaps: [1, 3, 4, 6].map((k) => (k * Math.PI) / 4), gap: 0.17 }],
    spawns: ring8(285, Math.PI / 8), // halfway between the gaps
  },
  spin: {
    name: 'Turntable',
    view: 420,
    spin: 0.22, // radians per second
    solids: [
      { t: 'rect', w: 760, h: 200, a: 0 },
      { t: 'rect', w: 760, h: 200, a: Math.PI / 2 },
      { t: 'circle', r: 160 },
    ],
    spawns: [0, 1, 2, 3, 0, 1, 2, 3].map((k, i) => ({ r: i < 4 ? 300 : 140, a: (k * Math.PI) / 2 + (i < 4 ? 0 : Math.PI / 4) })),
  },
  ice: {
    name: 'Ice Rink',
    view: 420,
    solids: [{ t: 'circle', r: 380 }],
    ice: [
      { x: 0, y: 0, r: 120 },
      { x: 225, y: 130, r: 80 },
      { x: -225, y: 130, r: 80 },
      { x: 0, y: -260, r: 80 },
    ],
    spawns: ring8(270, TAU / 16),
  },
  bumpers: {
    name: 'Pinball',
    view: 420,
    solids: [{ t: 'circle', r: 380 }],
    bumpers: [
      { x: 0, y: 0, r: 40 },
      ...[1, 3, 5, 7].map((k) => ({ x: Math.cos((k * Math.PI) / 4) * 200, y: Math.sin((k * Math.PI) / 4) * 200, r: 30 })),
    ],
    spawns: ring8(290),
  },
};
export const MAP_IDS = Object.keys(MAPS);

export function spinAngle(map, rt) {
  return map.spin ? map.spin * rt : 0;
}

export function shrinkRadius(map, rt) {
  const s = map.shrink;
  const k = Math.min(1, Math.max(0, (rt - s.start) / s.time));
  return s.from + (s.to - s.from) * k;
}

function angleDiff(a, b) {
  const d = (((a - b) % TAU) + TAU) % TAU;
  return d > Math.PI ? TAU - d : d;
}

export function inSolid(map, s, x, y, rt) {
  if (s.t === 'circle') {
    const r = map.shrink ? shrinkRadius(map, rt) : s.r;
    return x * x + y * y <= r * r;
  }
  if (s.t === 'ring') {
    const d = Math.hypot(x, y);
    if (d < s.r0 || d > s.r1) return false;
    const a = Math.atan2(y, x);
    return s.gaps.every((g) => angleDiff(a, g) > s.gap);
  }
  // rect, turned by its own angle plus the platform spin
  const a = -(s.a + spinAngle(map, rt));
  const lx = x * Math.cos(a) - y * Math.sin(a);
  const ly = x * Math.sin(a) + y * Math.cos(a);
  return Math.abs(lx) <= s.w / 2 && Math.abs(ly) <= s.h / 2;
}

export function onPlatform(map, x, y, rt) {
  return map.solids.some((s) => inSolid(map, s, x, y, rt));
}

function onIce(map, x, y) {
  return !!map.ice && map.ice.some((z) => (x - z.x) ** 2 + (y - z.y) ** 2 <= z.r * z.r);
}

export function spawnPoint(map, i) {
  const s = map.spawns[i % map.spawns.length];
  return { x: Math.cos(s.a) * s.r, y: Math.sin(s.a) * s.r };
}

export function newMover(x, y) {
  return { x, y, vx: 0, vy: 0, aim: Math.atan2(-y, -x), dashT: 0, dashCd: 0, knockT: 0, chg: -1, swT: 0, swCd: 0, bump: -1 };
}

// One tick for one player. cmd: { mx, my, a, b } (b bit 1 = swing held, bit 2 = dash).
// Returns { charge } on the tick a swing is released, otherwise null.
export function stepMover(p, cmd, map, rt, frozen) {
  p.aim = cmd.a;
  p.dashCd = Math.max(0, p.dashCd - DT);
  p.swCd = Math.max(0, p.swCd - DT);
  p.swT = Math.max(0, p.swT - DT);
  p.knockT = Math.max(0, p.knockT - DT);
  p.bump = -1;
  if (frozen) {
    p.vx = 0;
    p.vy = 0;
    p.chg = -1;
    return null;
  }

  let swing = null;
  const held = (cmd.b & 1) !== 0;
  if (p.chg < 0) {
    if (held && p.swCd <= 0) p.chg = 0;
  } else if (held) {
    p.chg = Math.min(p.chg + 1, SUMO.chargeTicks);
  } else {
    swing = { charge: p.chg / SUMO.chargeTicks };
    p.chg = -1;
    p.swT = SUMO.swingTime;
    p.swCd = SUMO.swingCooldown;
  }

  if (cmd.b & 2 && p.dashCd <= 0) {
    const ml = Math.hypot(cmd.mx, cmd.my);
    const dx = ml > 0 ? cmd.mx / ml : Math.cos(p.aim);
    const dy = ml > 0 ? cmd.my / ml : Math.sin(p.aim);
    p.vx = dx * SUMO.dashSpeed;
    p.vy = dy * SUMO.dashSpeed;
    p.dashT = SUMO.dashTime;
    p.dashCd = SUMO.dashCooldown;
  } else if (p.dashT > 0) {
    p.dashT = Math.max(0, p.dashT - DT);
  } else {
    const speed = SUMO.maxSpeed * (p.chg >= 0 ? SUMO.chargeSpeedMul : 1);
    const control = p.knockT > 0 ? SUMO.knockControl : onIce(map, p.x, p.y) ? SUMO.iceControl : SUMO.control;
    const k = 1 - Math.exp(-control * DT);
    p.vx += (cmd.mx * speed - p.vx) * k;
    p.vy += (cmd.my * speed - p.vy) * k;
  }

  p.x += p.vx * DT;
  p.y += p.vy * DT;

  // A spinning platform carries whoever stands on it.
  if (map.spin && onPlatform(map, p.x, p.y, rt)) {
    const a = map.spin * DT;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const x = p.x;
    p.x = x * c - p.y * s;
    p.y = x * s + p.y * c;
  }

  if (map.bumpers) {
    map.bumpers.forEach((bm, i) => {
      const dx = p.x - bm.x;
      const dy = p.y - bm.y;
      const d = Math.hypot(dx, dy);
      const min = bm.r + SUMO.radius;
      if (d >= min) return;
      const nx = d > 1e-6 ? dx / d : 1;
      const ny = d > 1e-6 ? dy / d : 0;
      p.x = bm.x + nx * min;
      p.y = bm.y + ny * min;
      const along = p.vx * nx + p.vy * ny;
      const out = Math.max(SUMO.bumperPush, Math.abs(along));
      p.vx += (out - along) * nx;
      p.vy += (out - along) * ny;
      p.knockT = SUMO.knockTime * 0.7;
      p.dashT = 0;
      p.bump = i;
    });
  }
  return swing;
}
