// Dark shooter rules, guns and maps. Shared so the browser can predict its own movement and
// shots with the server's code.
import { DT } from './loop.js';
import { border } from './world.js';

export const OPS = {
  radius: 16,
  speed: 230,
  infectedSpeed: 1.3, // speed multiplier for the infected
  cone: 0.62, // flashlight half-angle (radians)
  range: 560, // flashlight reach
  near: 95, // small circle you always see around yourself
  flashReveal: 650, // a shot shows the shooter's spot to players this close
  hp: 100,
  respawn: 3,
  pickupReach: 40,
  itemRespawn: 20,
  dropLife: 15,
  span: 1000, // world units across the longer side of the screen
  stun: 1.0, // infected hit by a bullet are stunned this long
};

// reserve -1 means unlimited. burst: shots per trigger pull. melee: hits within reach in front.
export const GUNS = {
  pistol: { name: 'Pistol', dmg: 26, rate: 0.28, mag: 12, reserve: -1, reload: 1.1, spread: 0.03, pellets: 1, range: 900, auto: false, len: 14, w: 7 },
  smg: { name: 'SMG', dmg: 15, rate: 0.085, mag: 30, reserve: 90, reload: 1.6, spread: 0.09, pellets: 1, range: 700, auto: true, len: 22, w: 8 },
  shotgun: { name: 'Shotgun', dmg: 13, rate: 0.85, mag: 6, reserve: 18, reload: 2.0, spread: 0.2, pellets: 8, range: 420, auto: false, len: 26, w: 9 },
  rifle: { name: 'Sniper', dmg: 85, rate: 1.2, mag: 5, reserve: 15, reload: 2.2, spread: 0, pellets: 1, range: 1600, auto: false, len: 34, w: 6 },
  burst: { name: 'Burst Rifle', dmg: 21, rate: 0.45, mag: 21, reserve: 63, reload: 1.8, spread: 0.035, pellets: 1, range: 1000, auto: false, burst: 3, len: 28, w: 7 },
  assault: { name: 'Assault Rifle', dmg: 19, rate: 0.11, mag: 25, reserve: 75, reload: 1.9, spread: 0.06, pellets: 1, range: 950, auto: true, len: 30, w: 8 },
  revolver: { name: 'Revolver', dmg: 55, rate: 0.6, mag: 6, reserve: 24, reload: 2.0, spread: 0.015, pellets: 1, range: 1100, auto: false, len: 18, w: 8 },
  knife: { name: 'Knife', dmg: 100, rate: 0.45, mag: 1, reserve: -1, reload: 0, spread: 0, pellets: 0, range: 46, auto: false, melee: true, len: 16, w: 5 },
};
export const PICKUPS = ['smg', 'shotgun', 'rifle', 'burst', 'assault', 'revolver'];
export const GUN_IDS = Object.keys(GUNS);

// Gun Game: a kill moves you up the ladder, a death moves you down one. A knife kill wins.
export const LADDER = ['pistol', 'smg', 'shotgun', 'burst', 'assault', 'revolver', 'rifle', 'knife'];

// Power-ups from glowing crates. Timed ones last `time` seconds; the rest act at once.
export const POWERS = {
  flare: { name: 'Flare', color: '#ff8a3d', time: 0, life: 10, radius: 280 }, // lights an area for everyone
  ricochet: { name: 'Ricochet', color: '#4fd1ff', time: 12 }, // bullets bounce once off walls
  overcharge: { name: 'Overcharge', color: '#ffd447', time: 15, cone: 1.5, range: 1.4 }, // bigger flashlight
  cloak: { name: 'Cloak', color: '#b77bff', time: 8, near: 120 }, // unseen unless close or firing
  radar: { name: 'Radar', color: '#59e07a', time: 0, show: 1.6 }, // a ping of every enemy
  decoy: { name: 'Decoy', color: '#ff6fb5', time: 0, life: 6, speed: 200 }, // a hologram of you walks off
};
export const POWER_IDS = Object.keys(POWERS);
export const CRATES = { max: 3, every: 12, reach: 30 };

export function newArmory() {
  return { slot: 0, pm: GUNS.pistol.mag, prim: '', mag: 0, res: 0, reloadT: 0, fireCd: 0, trig: false, bq: 0, bt: 0 };
}

export function currentGun(p) {
  return p.slot === 1 && p.prim ? p.prim : 'pistol';
}

// Light cone and reach for a player, bigger with Overcharge.
export function lightOf(p) {
  const o = p.pow === 'overcharge' && p.powT > 0;
  return { cone: OPS.cone * (o ? POWERS.overcharge.cone : 1), range: OPS.range * (o ? POWERS.overcharge.range : 1) };
}

// Weapon handling for one tick: swap (b & 8), reload (b & 4), fire (b & 1).
// Returns the gun id on the tick a shot goes off, otherwise null.
export function stepGun(p, cmd, frozen) {
  p.fireCd = Math.max(0, p.fireCd - DT);
  const held = (cmd.b & 1) !== 0;
  if (frozen) {
    p.trig = held;
    p.bq = 0;
    return null;
  }
  if (cmd.b & 8 && p.prim) {
    p.slot = 1 - p.slot;
    p.reloadT = 0;
    p.bq = 0;
  }
  const id = currentGun(p);
  const g = GUNS[id];
  const pistol = id === 'pistol';
  const mag = g.melee ? 1 : pistol ? p.pm : p.mag;
  const take = () => {
    if (g.melee) return;
    if (pistol) p.pm--;
    else p.mag--;
  };
  if (p.reloadT > 0) {
    p.reloadT -= DT;
    if (p.reloadT <= 0) {
      p.reloadT = 0;
      if (pistol) p.pm = g.mag;
      else {
        const add = p.res < 0 ? g.mag - p.mag : Math.min(g.mag - p.mag, p.res);
        p.mag += add;
        if (p.res > 0) p.res -= add;
      }
    }
  }
  // The rest of a burst follows on its own.
  if (p.bq > 0) {
    p.bt -= DT;
    if (p.bt <= 0 && mag > 0 && p.reloadT <= 0) {
      take();
      p.bq--;
      p.bt = 0.07;
      p.trig = held;
      return id;
    }
    if (mag <= 0) p.bq = 0;
  }
  const canReload = !g.melee && mag < g.mag && (pistol || p.res !== 0);
  if (cmd.b & 4 && p.reloadT <= 0 && canReload) p.reloadT = g.reload;
  let fired = null;
  if (held && (g.auto || !p.trig) && p.fireCd <= 0 && p.reloadT <= 0 && p.bq <= 0) {
    if (mag > 0) {
      take();
      p.fireCd = g.rate;
      fired = id;
      if (g.burst) {
        p.bq = g.burst - 1;
        p.bt = 0.07;
      }
    } else if (canReload) {
      p.reloadT = g.reload;
    }
  }
  p.trig = held;
  return fired;
}

// ---- maps -------------------------------------------------------------------------------
// Built from wall lines with doorways, rooms with their own floor colour, cover and markings.

const T = 40;

// A wall along y from x1 to x2, leaving gaps for doors [[from, to], ...].
function hwall(x1, x2, y, doors = [], kind = 'wall') {
  const out = [];
  let x = x1;
  for (const [a, b] of [...doors].sort((p, q) => p[0] - q[0])) {
    if (a > x) out.push([x, y, a - x, T, kind]);
    x = b;
  }
  if (x2 > x) out.push([x, y, x2 - x, T, kind]);
  return out;
}

function vwall(y1, y2, x, doors = [], kind = 'wall') {
  return hwall(y1, y2, x, doors, kind).map(([y, xx, h, w, k]) => [xx, y, w, h, k]);
}

const crate = (x, y, s = 56) => [x, y, s, s, 'crate'];
const doorStripes = (x, y, w, h) => ({ t: 'hazard', x, y, w, h });

export const MAPS = {
  lab: {
    name: 'Lab',
    w: 2000,
    h: 1400,
    zones: [
      [40, 40, 620, 560, 'alt'], [700, 40, 600, 560, 'warm'], [1340, 40, 620, 560, 'mint'],
      [40, 800, 620, 560, 'mint'], [700, 800, 600, 560, 'alt'], [1340, 800, 620, 560, 'warm'],
    ],
    blocks: [
      ...border(2000, 1400),
      ...hwall(40, 1960, 600, [[260, 380], [940, 1060], [1620, 1740]]),
      ...hwall(40, 1960, 760, [[180, 300], [940, 1060], [1700, 1820]]),
      ...vwall(40, 600, 660, [[260, 360]]),
      ...vwall(40, 600, 1300, [[380, 480]]),
      ...vwall(800, 1360, 660, [[1000, 1100]]),
      ...vwall(800, 1360, 1300, [[900, 1000]]),
      [110, 110, 230, 90, 'machine'], crate(440, 380), crate(496, 380), crate(440, 436),
      [880, 220, 240, 110, 'machine'], [760, 470, 50, 50, 'pillar'], [1190, 470, 50, 50, 'pillar'],
      crate(1420, 140), crate(1476, 140), [1640, 330, 220, 90, 'machine'], crate(1840, 140),
      crate(480, 660), crate(1460, 670),
      [120, 1180, 240, 90, 'machine'], crate(480, 900), crate(536, 900),
      [900, 1060, 200, 100, 'machine'], crate(760, 860), crate(1180, 1260),
      crate(1420, 1220), crate(1476, 1220), [1640, 880, 220, 90, 'machine'],
    ],
    marks: [
      { t: 'text', text: 'A', x: 250, y: 470, s: 120 }, { t: 'text', text: 'B', x: 1000, y: 470, s: 120 },
      { t: 'text', text: 'C', x: 1650, y: 520, s: 120 }, { t: 'text', text: 'D', x: 300, y: 1000, s: 120 },
      { t: 'text', text: 'E', x: 1000, y: 920, s: 120 }, { t: 'text', text: 'F', x: 1700, y: 1220, s: 120 },
      { t: 'arrow', x: 760, y: 700, a: 0, s: 60 }, { t: 'arrow', x: 1240, y: 700, a: Math.PI, s: 60 },
      doorStripes(260, 600, 120, 10), doorStripes(940, 600, 120, 10), doorStripes(1620, 600, 120, 10),
      doorStripes(180, 790, 120, 10), doorStripes(940, 790, 120, 10), doorStripes(1700, 790, 120, 10),
      { t: 'vent', x: 600, y: 100, r: 20 }, { t: 'vent', x: 1900, y: 1300, r: 20 }, { t: 'vent', x: 1000, y: 700, r: 22 },
    ],
    spawns: [[120, 300], [560, 120], [900, 120], [1230, 400], [1420, 520], [1890, 230], [120, 900], [560, 1290], [780, 1290], [1230, 1100], [1420, 1060], [1890, 1050]],
    items: [[350, 300, 'smg'], [1000, 130, 'rifle'], [1650, 200, 'shotgun'], [300, 1100, 'shotgun'], [1000, 1270, 'smg'], [1650, 1100, 'rifle']],
  },
  depot: {
    name: 'Depot',
    w: 2200,
    h: 1400,
    zones: [[40, 40, 520, 400, 'warm'], [1640, 960, 520, 400, 'warm'], [1700, 40, 460, 300, 'mint'], [40, 1060, 460, 300, 'mint']],
    blocks: [
      ...border(2200, 1400),
      ...hwall(40, 600, 440, [[230, 340]]),
      ...vwall(40, 480, 560, [[160, 260]]),
      ...hwall(1600, 2160, 920, [[1860, 1970]]),
      ...vwall(920, 1360, 1600, [[1140, 1240]]),
      [700, 560, 380, 60, 'machine'], [1260, 560, 380, 60, 'machine'],
      [560, 820, 380, 60, 'machine'], [1120, 820, 380, 60, 'machine'],
      crate(1000, 250), crate(1056, 250), crate(1000, 306), crate(1300, 330),
      crate(300, 680), crate(356, 680), crate(1850, 560), crate(1850, 616), crate(1906, 616),
      crate(1100, 1060), crate(1156, 1116), crate(760, 1180), crate(1500, 1180),
      [140, 150, 180, 80, 'machine'], [1860, 1180, 180, 80, 'machine'], [700, 120, 50, 50, 'pillar'], [1450, 1230, 50, 50, 'pillar'],
    ],
    marks: [
      doorStripes(1700, 40, 460, 14), doorStripes(40, 1346, 460, 14),
      { t: 'text', text: '01', x: 1930, y: 200, s: 110 }, { t: 'text', text: '02', x: 270, y: 1220, s: 110 },
      { t: 'arrow', x: 1930, y: 420, a: -Math.PI / 2, s: 70 }, { t: 'arrow', x: 270, y: 980, a: Math.PI / 2, s: 70 },
      { t: 'rect', x: 640, y: 700, w: 1000, h: 14 }, { t: 'rect', x: 640, y: 980, w: 1000, h: 14 },
      { t: 'vent', x: 480, y: 100 }, { t: 'vent', x: 2100, y: 900 }, { t: 'vent', x: 1100, y: 720 },
    ],
    spawns: [[120, 360], [480, 120], [1300, 120], [2080, 400], [1900, 820], [120, 900], [700, 1300], [1300, 1300], [2080, 1300], [1700, 1300], [900, 400], [1300, 1000]],
    items: [[300, 300, 'rifle'], [1900, 1050, 'rifle'], [1100, 700, 'smg'], [1930, 260, 'shotgun'], [270, 1180, 'shotgun'], [700, 1050, 'smg']],
  },
  reactor: {
    name: 'Reactor',
    w: 2000,
    h: 1400,
    zones: [[700, 450, 600, 500, 'mint'], [40, 40, 460, 340, 'alt'], [1500, 40, 460, 340, 'warm'], [40, 1020, 460, 340, 'warm'], [1500, 1020, 460, 340, 'alt']],
    blocks: [
      ...border(2000, 1400),
      ...hwall(660, 1340, 410, [[950, 1050]]),
      ...hwall(660, 1340, 950, [[950, 1050]]),
      ...vwall(450, 950, 660, [[650, 750]]),
      ...vwall(450, 950, 1300, [[650, 750]]),
      [900, 600, 200, 200, 'machine'],
      ...hwall(40, 540, 380, [[300, 400]]), ...vwall(40, 380, 500, [[160, 260]]),
      ...hwall(1460, 1960, 380, [[1600, 1700]]), ...vwall(40, 380, 1460, [[160, 260]]),
      ...hwall(40, 540, 1020, [[300, 400]]), ...vwall(1060, 1360, 500, [[1140, 1240]]),
      ...hwall(1460, 1960, 1020, [[1600, 1700]]), ...vwall(1060, 1360, 1460, [[1140, 1240]]),
      crate(300, 600), crate(300, 656), crate(1640, 690), crate(1640, 746),
      crate(880, 200), crate(1060, 1150), [920, 1240, 160, 60, 'machine'], [920, 100, 160, 60, 'machine'],
      [140, 120, 150, 70, 'machine'], [1710, 1230, 150, 70, 'machine'],
    ],
    marks: [
      { t: 'ring', x: 1000, y: 700, r: 160, w: 14 }, doorStripes(950, 410, 100, 10), doorStripes(950, 980, 100, 10),
      doorStripes(660, 650, 10, 100), doorStripes(1330, 650, 10, 100),
      { t: 'text', text: 'N', x: 1000, y: 260, s: 100 }, { t: 'text', text: 'S', x: 1000, y: 1130, s: 100 },
      { t: 'arrow', x: 440, y: 700, a: 0, s: 70 }, { t: 'arrow', x: 1560, y: 700, a: Math.PI, s: 70 },
      { t: 'vent', x: 760, y: 520 }, { t: 'vent', x: 1240, y: 880 }, { t: 'vent', x: 1240, y: 520 }, { t: 'vent', x: 760, y: 880 },
    ],
    spawns: [[150, 300], [400, 100], [1850, 300], [1600, 100], [150, 1100], [400, 1300], [1850, 1100], [1600, 1300], [800, 700], [1200, 700], [600, 200], [1400, 1200]],
    items: [[1000, 520, 'rifle'], [1000, 880, 'shotgun'], [250, 260, 'smg'], [1750, 1150, 'smg'], [1750, 260, 'shotgun'], [250, 1150, 'rifle']],
  },
};
export const MAP_IDS = Object.keys(MAPS);
