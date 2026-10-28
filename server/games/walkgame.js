import { DT } from '../../public/shared/loop.js';
import { WALK, newWalker, stepWalker } from '../../public/shared/walker.js';
import { WALK_POWERS, WALK_POWER_IDS, INSTANT, WALK_CRATES, newPowerState, useWalkPower } from '../../public/shared/walkpowers.js';
import { collideBlocks } from '../../public/shared/world.js';
import { ARENAS, ARENA_IDS } from '../../public/shared/arenas.js';
import { collideCircles } from '../physics.js';
import { ArenaGame, PS, r1, r2 } from './arena.js';

export const arenaOption = { key: 'map', label: 'Map', options: [['random', 'Random'], ...ARENA_IDS.map((id) => [id, ARENAS[id].name])], def: 'random' };
export const powersOption = { key: 'powers', label: 'Power-up crates', options: [[1, 'On'], [0, 'Off']], def: 1 };
export const roundsOption = (def = 3) => ({ key: 'rounds', label: 'Rounds to win', options: [[1, '1'], [3, '3'], [5, '5']], def });

// Base for games where players walk around a map with walls (shared/walker.js) and bump into
// each other. Subclasses add their rules in setup, onMove, update and pack.
export class WalkGame extends ArenaGame {
  // powers: which crate power-ups this game hands out (none if left out).
  constructor(opts, { maps = ARENAS, walk = WALK, shove = 0.6, powers = null } = {}) {
    super(opts);
    this.powerIds = powers && (opts.settings.powers ?? 1) !== 0 ? powers : null;
    this.crates = [];
    this.maps = maps;
    this.walk = walk;
    this.shove = shove;
    this.mapSetting = opts.settings.map ?? 'random';
    this.mapId = null;
  }

  newPlayer(p) {
    Object.assign(p, newWalker(0, 0), newPowerState(), { r: this.walk ? this.walk.radius ?? WALK.radius : WALK.radius });
  }

  init() {
    return { ...super.init(), powers: !!this.powerIds };
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
      Object.assign(p, newWalker(x, y, Math.atan2(this.map.h / 2 - y, this.map.w / 2 - x)), newPowerState());
    });
    this.crates = [];
    this.crateT = WALK_CRATES.first;
    this.setup(list);
  }

  setup() {}

  playerTick(p, cmd, frozen) {
    if (p.state !== PS.alive) return;
    if (this.powerIds) {
      const used = useWalkPower(p, cmd, this.map, frozen);
      if (used) this.usePower(p, used);
    }
    p.spd = this.speedOf(p) * (p.bootsT > 0 ? WALK_POWERS.boots.speed : 1);
    if (stepWalker(p, cmd, this.map, this.walk, frozen)) this.events.push({ k: 'dash', p: p.idx });
    this.onMove(p, cmd, frozen);
  }

  speedOf() {
    return 1;
  }

  onMove() {}

  // ---- power-up crates ----
  usePower(p, kind) {
    if (kind === 'glove') {
      const g = WALK_POWERS.glove;
      let hits = 0;
      for (const q of this.alive) {
        if (q === p || q.bubbleT > 0) continue;
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        const a = Math.atan2(dy, dx) - p.aim;
        if (d > p.r + g.reach + q.r || Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) > g.arc) continue;
        q.vx = (dx / d) * g.push;
        q.vy = (dy / d) * g.push;
        q.knockT = 0.35;
        q.dashT = 0;
        hits++;
      }
      this.events.push({ k: 'punch', p: p.idx, a: r2(p.aim), hit: hits });
    } else this.events.push({ k: 'power', p: p.idx, w: kind, x: r1(p.x), y: r1(p.y) });
    this.onPower(p, kind);
  }

  onPower() {}

  spawnCrate() {
    this.crateT -= DT;
    if (this.crateT > 0 || this.crates.length >= WALK_CRATES.max) return;
    const m = this.map;
    const x = 80 + this.rng() * (m.w - 160);
    const y = 80 + this.rng() * (m.h - 160);
    if (collideBlocks({ x, y }, 30, m.blocks)) return; // try again next tick
    if (this.alive.some((p) => Math.hypot(p.x - x, p.y - y) < 150) || this.crates.some((c) => Math.hypot(c.x - x, c.y - y) < 200)) return;
    this.crates.push({ id: this.nextCrate = (this.nextCrate || 0) + 1, x, y, type: this.powerIds[Math.floor(this.rng() * this.powerIds.length)] });
    this.crateT = WALK_CRATES.every;
  }

  grabCrates() {
    for (const p of this.alive) {
      const i = this.crates.findIndex((c) => Math.hypot(c.x - p.x, c.y - p.y) <= WALK_CRATES.reach + p.r);
      if (i < 0) continue;
      const type = this.crates[i].type;
      if (!INSTANT.has(type) && p.held) continue; // hands full
      const [c] = this.crates.splice(i, 1);
      if (type === 'boots') p.bootsT = WALK_POWERS.boots.time;
      else if (type === 'bubble') p.bubbleT = WALK_POWERS.bubble.time;
      else {
        p.held = type;
        p.uses = type === 'glove' ? WALK_POWERS.glove.uses : 1;
      }
      this.events.push({ k: 'crate', p: p.idx, w: type, x: r1(c.x), y: r1(c.y) });
    }
  }

  worldTick(frozen) {
    if (this.shove) {
      const alive = this.alive;
      for (let i = 0; i < alive.length; i++) {
        for (let j = i + 1; j < alive.length; j++) {
          const a = alive[i];
          const b = alive[j];
          a.m = a.bubbleT > 0 ? 4 : a.dashT > 0 ? 2.5 : 1;
          b.m = b.bubbleT > 0 ? 4 : b.dashT > 0 ? 2.5 : 1;
          if (collideCircles(a, b, this.shove) > 300) {
            if (a.m <= b.m) a.knockT = 0.25;
            if (b.m <= a.m) b.knockT = 0.25;
          }
        }
      }
    }
    if (this.powerIds && !frozen) {
      this.spawnCrate();
      this.grabCrates();
    }
    this.update(frozen);
  }

  update() {}

  // With crates on, the last entry is [crates, players' power-ups].
  packWorld() {
    const w = [this.mapId, ...this.world()];
    if (this.powerIds) {
      const pw = [];
      for (const p of this.players.values()) {
        const f = (p.bootsT > 0 ? 1 : 0) | (p.bubbleT > 0 ? 2 : 0);
        if (p.held || f) pw.push([p.idx, WALK_POWER_IDS.indexOf(p.held), f]);
      }
      w.push([this.crates.map((c) => [c.id, r1(c.x), r1(c.y), WALK_POWER_IDS.indexOf(c.type)]), pw]);
    }
    return w;
  }

  world() {
    return [];
  }

  packMe(p) {
    const me = { x: r2(p.x), y: r2(p.y), vx: r2(p.vx), vy: r2(p.vy), aim: r2(p.aim), dashT: r2(p.dashT), dashCd: r2(p.dashCd), knockT: r2(p.knockT), spd: p.spd };
    if (this.powerIds) Object.assign(me, { held: p.held, uses: p.uses, trig: p.trig, gcd: r2(p.gcd), bootsT: r2(p.bootsT), bubbleT: r2(p.bubbleT) });
    return me;
  }

  // Distance between two players' edges.
  gap(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
  }

  timeLeft(limit) {
    return r1(Math.max(0, limit - this.rt));
  }
}
