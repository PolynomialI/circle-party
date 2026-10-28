// Single-room arenas for the walking party games, in the facility style.
import { border } from './world.js';

const crate = (x, y, s = 56) => [x, y, s, s, 'crate'];
const ring8 = (cx, cy, rx, ry) => Array.from({ length: 8 }, (_, i) => [Math.round(cx + Math.cos((i * Math.PI) / 4) * rx), Math.round(cy + Math.sin((i * Math.PI) / 4) * ry)]);

export const ARENAS = {
  bay: {
    name: 'Loading Bay',
    w: 1400,
    h: 900,
    zones: [[40, 40, 1320, 120, 'alt'], [40, 740, 1320, 120, 'alt']],
    blocks: [
      ...border(1400, 900),
      crate(300, 260), crate(356, 260), crate(300, 316),
      crate(1044, 584), crate(1044, 528), crate(988, 584),
      [640, 200, 120, 60, 'machine'], [640, 640, 120, 60, 'machine'],
      [200, 600, 50, 50, 'pillar'], [1150, 250, 50, 50, 'pillar'],
    ],
    marks: [
      { t: 'hazard', x: 40, y: 160, w: 1320, h: 12 }, { t: 'hazard', x: 40, y: 728, w: 1320, h: 12 },
      { t: 'text', text: 'BAY 3', x: 700, y: 450, s: 110 },
      { t: 'arrow', x: 180, y: 450, a: 0, s: 60 }, { t: 'arrow', x: 1220, y: 450, a: Math.PI, s: 60 },
      { t: 'vent', x: 100, y: 100 }, { t: 'vent', x: 1300, y: 800 },
    ],
    spawns: [[180, 300], [1220, 600], [500, 450], [900, 450], [300, 650], [1100, 250], [700, 330], [700, 570]],
  },
  servers: {
    name: 'Server Room',
    w: 1400,
    h: 900,
    zones: [[40, 40, 1320, 820, 'warm'], [480, 330, 440, 240, 'mint']],
    blocks: [
      ...border(1400, 900),
      [220, 180, 60, 200, 'machine'], [220, 520, 60, 200, 'machine'],
      [1120, 180, 60, 200, 'machine'], [1120, 520, 60, 200, 'machine'],
      [560, 160, 280, 50, 'machine'], [560, 690, 280, 50, 'machine'],
      [672, 422, 56, 56, 'pillar'],
    ],
    marks: [
      { t: 'ring', x: 700, y: 450, r: 150, w: 12 },
      { t: 'rect', x: 380, y: 110, w: 640, h: 14 }, { t: 'rect', x: 380, y: 776, w: 640, h: 14 },
      { t: 'vent', x: 400, y: 450 }, { t: 'vent', x: 1000, y: 450 },
    ],
    spawns: ring8(700, 450, 360, 200),
  },
  yard: {
    name: 'Courtyard',
    w: 1400,
    h: 900,
    zones: [[560, 310, 280, 280, 'mint'], [40, 40, 300, 240, 'alt'], [1060, 620, 300, 240, 'alt']],
    blocks: [
      ...border(1400, 900),
      [640, 390, 120, 120, 'pillar'],
      [200, 200, 200, 40, 'wall'], [200, 240, 40, 120, 'wall'],
      [1000, 660, 200, 40, 'wall'], [1160, 540, 40, 120, 'wall'],
      [1000, 200, 200, 40, 'wall'], [1160, 240, 40, 120, 'wall'],
      [200, 660, 200, 40, 'wall'], [200, 540, 40, 120, 'wall'],
    ],
    marks: [
      { t: 'ring', x: 700, y: 450, r: 230, w: 12 },
      { t: 'arrow', x: 700, y: 150, a: Math.PI / 2, s: 50 }, { t: 'arrow', x: 700, y: 750, a: -Math.PI / 2, s: 50 },
      { t: 'vent', x: 120, y: 450 }, { t: 'vent', x: 1280, y: 450 },
    ],
    spawns: ring8(700, 450, 380, 300),
  },
};
export const ARENA_IDS = Object.keys(ARENAS);
