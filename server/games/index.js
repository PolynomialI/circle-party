import { Sumo, SUMO_INFO } from './sumo.js';
import { Ops, OPS_INFO, INFECTION_INFO } from './ops.js';
import { BombTag, BOMBTAG_INFO } from './bombtag.js';
import { Crown, CROWN_INFO } from './crown.js';
import { Koth, KOTH_INFO } from './koth.js';
import { Paint, PAINT_INFO } from './paint.js';
import { CourseGame, DEATHRUN_INFO, SKYRUN_INFO } from './deathrun.js';
import { HexDrop, HEXDROP_INFO } from './hexdrop.js';
import { Rush, RUSH_INFO } from './rush.js';
import { Trails, TRAILS_INFO } from './trails.js';
import { Tanks, TANKS_INFO } from './tanks.js';
import { Spin, SPIN_INFO } from './spin.js';
import { Lava, LAVA_INFO } from './lava.js';

// Every game module has the same parts: create (setup), input, step (tick), snapshotFor, roster.
export const GAMES = {
  ops: { info: OPS_INFO, create: (opts) => new Ops(opts, 'ops') },
  deathrun: { info: DEATHRUN_INFO, create: (opts) => new CourseGame(opts, 'deathrun') },
  skyrun: { info: SKYRUN_INFO, create: (opts) => new CourseGame(opts, 'skyrun') },
  infection: { info: INFECTION_INFO, create: (opts) => new Ops(opts, 'infection') },
  sumo: { info: SUMO_INFO, create: (opts) => new Sumo(opts) },
  tanks: { info: TANKS_INFO, create: (opts) => new Tanks(opts) },
  bombtag: { info: BOMBTAG_INFO, create: (opts) => new BombTag(opts) },
  hexdrop: { info: HEXDROP_INFO, create: (opts) => new HexDrop(opts) },
  paint: { info: PAINT_INFO, create: (opts) => new Paint(opts) },
  koth: { info: KOTH_INFO, create: (opts) => new Koth(opts) },
  crown: { info: CROWN_INFO, create: (opts) => new Crown(opts) },
  spin: { info: SPIN_INFO, create: (opts) => new Spin(opts) },
  lava: { info: LAVA_INFO, create: (opts) => new Lava(opts) },
  rush: { info: RUSH_INFO, create: (opts) => new Rush(opts) },
  trails: { info: TRAILS_INFO, create: (opts) => new Trails(opts) },
};

export const CATALOG = Object.values(GAMES).map((g) => g.info);
