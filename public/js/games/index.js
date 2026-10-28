import * as sumo from './sumo.js';
import * as ops from './ops.js';
import * as bombtag from './bombtag.js';
import * as crown from './crown.js';
import * as koth from './koth.js';
import * as paint from './paint.js';
import * as deathrun from './deathrun.js';
import * as hexdrop from './hexdrop.js';
import * as rush from './rush.js';
import * as trails from './trails.js';
import * as tanks from './tanks.js';
import * as spin from './spin.js';
import * as lava from './lava.js';

// Browser halves of the game modules, keyed like the server's GAMES.
export const CLIENT_GAMES = {
  ops,
  infection: { ...ops, name: 'Infection' },
  deathrun,
  skyrun: { ...deathrun, name: 'Sky Run', controls: [['Move', 'W A S D'], ['Jump', 'Space']] },
  sumo,
  tanks,
  bombtag,
  hexdrop,
  paint,
  koth,
  crown,
  spin,
  lava,
  rush,
  trails,
};
