import { Sumo, SUMO_INFO } from './sumo.js';

// Every game module has the same parts: create (setup), input, step (tick), snapshotFor, roster.
export const GAMES = {
  sumo: { info: SUMO_INFO, create: (opts) => new Sumo(opts) },
};

export const CATALOG = Object.values(GAMES).map((g) => g.info);
