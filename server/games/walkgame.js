import { WALK, newWalker, stepWalker } from '../../public/shared/walker.js';
import { ARENAS, ARENA_IDS } from '../../public/shared/arenas.js';
import { collideCircles } from '../physics.js';
import { ArenaGame, PS, r1, r2 } from './arena.js';

export const arenaOption = { key: 'map', label: 'Map', options: [['random', 'Random'], ...ARENA_IDS.map((id) => [id, ARENAS[id].name])], def: 'random' };
export const roundsOption = (def = 3) => ({ key: 'rounds', label: 'Rounds to win', options: [[1, '1'], [3, '3'], [5, '5']], def });

// Base for games where players walk around a map with walls (shared/walker.js) and bump into
// each other. Subclasses add their rules in setup, onMove, update and pack.
export class WalkGame extends ArenaGame {
  constructor(opts, { maps = ARENAS, walk = WALK, shove = 0.6 } = {}) {
    super(opts);
    this.maps = maps;
    this.walk = walk;
    this.shove = shove;
    this.mapSetting = opts.settings.map ?? 'random';
    this.mapId = null;
  }

  newPlayer(p) {
    Object.assign(p, newWalker(0, 0), { r: this.walk ? this.walk.radius ?? WALK.radius : WALK.radius });
  }

  pickMap() {
    const ids = Object.keys(this.maps);
    if (this.mapSetting !== 'random' && this.maps[this.mapSetting]) return this.mapSetting;
    const choices = ids.length > 1 ? ids.filter((id) => id !== this.mapId) : ids;
    return choices[Math.floor(this.rng() * choices.length)];
  }

  setupRound(list) {
    this.mapId = this.pickMap();
    this.map = this.maps[this.mapId];
    list.forEach((p, i) => {
      const [x, y] = this.map.spawns[i % this.map.spawns.length];
      Object.assign(p, newWalker(x, y, Math.atan2(this.map.h / 2 - y, this.map.w / 2 - x)));
    });
    this.setup(list);
  }

  setup() {}

  playerTick(p, cmd, frozen) {
    if (p.state !== PS.alive) return;
    if (stepWalker(p, cmd, this.map, this.walk, frozen)) this.events.push({ k: 'dash', p: p.idx });
    this.onMove(p, cmd, frozen);
  }

  onMove() {}

  worldTick(frozen) {
    if (this.shove) {
      const alive = this.alive;
      for (let i = 0; i < alive.length; i++) {
        for (let j = i + 1; j < alive.length; j++) {
          const a = alive[i];
          const b = alive[j];
          a.m = a.dashT > 0 ? 2.5 : 1;
          b.m = b.dashT > 0 ? 2.5 : 1;
          if (collideCircles(a, b, this.shove) > 300) {
            if (a.m <= b.m) a.knockT = 0.25;
            if (b.m <= a.m) b.knockT = 0.25;
          }
        }
      }
    }
    this.update(frozen);
  }

  update() {}

  packWorld() {
    return [this.mapId, ...this.world()];
  }

  world() {
    return [];
  }

  packMe(p) {
    return { x: r2(p.x), y: r2(p.y), vx: r2(p.vx), vy: r2(p.vy), aim: r2(p.aim), dashT: r2(p.dashT), dashCd: r2(p.dashCd), knockT: r2(p.knockT), spd: p.spd };
  }

  // Distance between two players' edges.
  gap(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
  }

  timeLeft(limit) {
    return r1(Math.max(0, limit - this.rt));
  }
}
