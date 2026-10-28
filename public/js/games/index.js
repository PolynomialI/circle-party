import * as sumo from './sumo.js';
import * as ops from './ops.js';
import * as bombtag from './bombtag.js';
import * as crown from './crown.js';
import * as koth from './koth.js';
import * as paint from './paint.js';
import * as stopgo from './stopgo.js';
import * as hexdrop from './hexdrop.js';
import * as rush from './rush.js';
import * as trails from './trails.js';
import * as tanks from './tanks.js';

// Browser halves of the game modules, keyed like the server's GAMES.
export const CLIENT_GAMES = {
  ops,
  infection: { ...ops, name: 'Infection' },
  sumo,
  tanks,
  bombtag,
  hexdrop,
  paint,
  koth,
  crown,
  stopgo,
  rush,
  trails,
};
