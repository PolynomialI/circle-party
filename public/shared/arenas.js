// Single-room arenas for the walking party games, in the facility style.
import { border } from './world.js';

const crate = (x, y, s = 56) => [x, y, s, s, 'crate'];
const ring8 = (cx, cy, rx, ry) => Array.from({ length: 8 }, (_, i) => [Math.round(cx + Math.cos((i * Math.PI) / 4) * rx), Math.round(cy + Math.sin((i * Math.PI) / 4) * ry)]);
const COPPER = '#c9704a';

export const ARENAS = {
  bay: {
    name: 'Loading Bay',
    w: 1400,
    h: 900,
    zones: [[40, 40, 1320, 120, 'grid'], [40, 740, 1320, 120, 'grid']],
    blocks: [
      ...border(1400, 900),
      crate(300, 260), crate(356, 260), crate(300, 316),
      crate(1044, 584), crate(1044, 528), crate(988, 584),
      [640, 200, 120, 60, 'machine'], [640, 640, 120, 60, 'machine'],
      [200, 600, 50, 50, 'barrel'], [1150, 250, 50, 50, 'barrel'],
      [44, 60, 300, 26, 'pipe'], [1056, 814, 300, 26, 'pipe'],
    ],
    marks: [
      { t: 'light', x: 700, y: 450, r: 230 }, { t: 'light', x: 330, y: 450, r: 120 }, { t: 'light', x: 1070, y: 450, r: 120 },
      { t: 'hazard', x: 40, y: 160, w: 1320, h: 12 }, { t: 'hazard', x: 40, y: 728, w: 1320, h: 12 },
      { t: 'text', text: 'BAY 3', x: 700, y: 450, s: 110 },
      { t: 'arrow', x: 180, y: 450, a: 0, s: 60 }, { t: 'arrow', x: 1220, y: 450, a: Math.PI, s: 60 },
      { t: 'cable', pts: [760, 230, 900, 120, 1060, 130], c: COPPER }, { t: 'cable', pts: [640, 670, 480, 760, 360, 800] },
      { t: 'fan', x: 100, y: 100, r: 34 }, { t: 'fan', x: 1300, y: 800, r: 34 },
      { t: 'puddle', x: 520, y: 600, r: 30 }, { t: 'lane', x0: 240, y0: 360, x1: 1160, y1: 360 }, { t: 'lane', x0: 240, y0: 540, x1: 1160, y1: 540 },
    ],
    spawns: [[180, 300], [1220, 600], [500, 450], [900, 450], [300, 650], [1100, 250], [700, 330], [700, 570]],
  },
  servers: {
    name: 'Server Room',
    w: 1400,
    h: 900,
    zones: [[40, 40, 1320, 820, 'tile'], [480, 330, 440, 240, 'mint']],
    blocks: [
      ...border(1400, 900),
      [220, 180, 60, 200, 'server'], [220, 520, 60, 200, 'server'],
      [1120, 180, 60, 200, 'server'], [1120, 520, 60, 200, 'server'],
      [560, 160, 280, 50, 'console'], [560, 690, 280, 50, 'console'],
      [672, 422, 56, 56, 'tank'],
      [44, 44, 30, 140, 'locker'], [1326, 716, 30, 140, 'locker'],
    ],
    marks: [
      { t: 'light', x: 700, y: 450, r: 200 },
      { t: 'ring', x: 700, y: 450, r: 150, w: 12 },
      { t: 'rect', x: 380, y: 110, w: 640, h: 14 }, { t: 'rect', x: 380, y: 776, w: 640, h: 14 },
      { t: 'cable', pts: [280, 280, 420, 420, 560, 185], c: COPPER }, { t: 'cable', pts: [1120, 620, 980, 500, 840, 715] },
      { t: 'cable', pts: [250, 380, 260, 450, 250, 520], c: '#4fd1ff' }, { t: 'cable', pts: [1150, 380, 1140, 450, 1150, 520], c: '#4fd1ff' },
      { t: 'vent', x: 400, y: 450 }, { t: 'vent', x: 1000, y: 450 }, { t: 'grate', x: 640, y: 60, w: 120, h: 40 }, { t: 'grate', x: 640, y: 800, w: 120, h: 40 },
    ],
    spawns: ring8(700, 450, 360, 200),
  },
  yard: {
    name: 'Courtyard',
    w: 1400,
    h: 900,
    zones: [[560, 310, 280, 280, 'mint'], [40, 40, 300, 240, 'sand'], [1060, 620, 300, 240, 'sand']],
    blocks: [
      ...border(1400, 900),
      [640, 390, 120, 120, 'pillar'],
      [200, 200, 200, 40, 'wall'], [200, 240, 40, 120, 'wall'],
      [1000, 660, 200, 40, 'wall'], [1160, 540, 40, 120, 'wall'],
      [1000, 200, 200, 40, 'wall'], [1160, 240, 40, 120, 'wall'],
      [200, 660, 200, 40, 'wall'], [200, 540, 40, 120, 'wall'],
      [60, 60, 44, 44, 'plant'], [1296, 796, 44, 44, 'plant'], [1296, 60, 44, 44, 'plant'], [60, 796, 44, 44, 'plant'],
    ],
    marks: [
      { t: 'emblem', x: 700, y: 450, r: 230, c: '#bcd6f7' },
      { t: 'arrow', x: 700, y: 150, a: Math.PI / 2, s: 50 }, { t: 'arrow', x: 700, y: 750, a: -Math.PI / 2, s: 50 },
      { t: 'puddle', x: 420, y: 450, r: 36 }, { t: 'puddle', x: 980, y: 450, r: 36, a: 1 },
      { t: 'hatch', x: 120, y: 450 }, { t: 'hatch', x: 1280, y: 450 },
    ],
    spawns: ring8(700, 450, 380, 300),
  },
  greenhouse: {
    name: 'Greenhouse',
    w: 1400,
    h: 900,
    zones: [[40, 40, 1320, 820, 'lab'], [160, 140, 300, 200, 'mint'], [940, 560, 300, 200, 'mint'], [560, 360, 280, 180, 'tile']],
    blocks: [
      ...border(1400, 900),
      [180, 160, 50, 50, 'plant'], [270, 160, 50, 50, 'plant'], [360, 160, 50, 50, 'plant'],
      [990, 690, 50, 50, 'plant'], [1080, 690, 50, 50, 'plant'], [1170, 690, 50, 50, 'plant'],
      [600, 120, 200, 40, 'shelf'], [600, 740, 200, 40, 'shelf'],
      [1100, 160, 60, 60, 'tank'], [240, 680, 60, 60, 'tank'],
      [44, 400, 26, 200, 'pipe'], [1330, 300, 26, 200, 'pipe'],
    ],
    marks: [
      { t: 'light', x: 700, y: 450, r: 220 },
      { t: 'puddle', x: 450, y: 470, r: 44 }, { t: 'puddle', x: 950, y: 420, r: 40, a: 2 }, { t: 'puddle', x: 760, y: 640, r: 30 },
      { t: 'cable', pts: [70, 500, 180, 560, 240, 680], c: '#5fbf72' }, { t: 'cable', pts: [1330, 400, 1220, 350, 1160, 220], c: '#5fbf72' },
      { t: 'grate', x: 660, y: 420, w: 80, h: 60 }, { t: 'fan', x: 1280, y: 820, r: 32 }, { t: 'fan', x: 120, y: 80, r: 32 },
    ],
    spawns: ring8(700, 450, 400, 260),
  },
};
export const ARENA_IDS = Object.keys(ARENAS);
