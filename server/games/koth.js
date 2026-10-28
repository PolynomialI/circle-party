import { DT } from '../../public/shared/loop.js';
import { SUMO, newMover, stepMover } from '../../public/shared/sumo.js';
import { collideBlocks } from '../../public/shared/world.js';
import { PS, r1, r2 } from './arena.js';
import { WalkGame, arenaOption, roundsOption } from './walkgame.js';
import { timeOption } from './crown.js';
import { swingHits } from './stick.js';

export const KOTH_INFO = {
  id: 'koth',
  name: 'King of the Hill',
  blurb: 'Stand in the zone alone to score. Knock rivals out with your stick.',
  settings: [roundsOption(3), timeOption(60), arenaOption],
};

export const ZONE = { r: 100, every: 10 };
export const OPEN = { solids: [] }; // Sumo movement without a platform

export class Koth extends WalkGame {
  constructor(opts) {
    super(opts);
    this.time = opts.settings.time;
    this.startRound(this.firstCountdown);
  }

  setup(list) {
    for (const p of list) Object.assign(p, newMover(p.x, p.y), { score: 0, r: SUMO.radius });
    this.zone = { x: this.map.w / 2, y: this.map.h / 2 };
    this.zoneT = ZONE.every;
    this.owner = -1;
  }

  playerTick(p, cmd, frozen) {
    if (p.state !== PS.alive) return;
    const swing = stepMover(p, cmd, OPEN, this.rt, frozen);
    collideBlocks(p, p.r, this.map.blocks);
    if (swing) swingHits(this, p, swing.charge, cmd.vt);
    if (p.dashT === SUMO.dashTime) this.events.push({ k: 'dash', p: p.idx });
  }

  // A new spot inside the map, clear of blocks and away from the old one.
  moveZone() {
    for (let i = 0; i < 40; i++) {
      const x = 120 + this.rng() * (this.map.w - 240);
      const y = 120 + this.rng() * (this.map.h - 240);
      if (Math.hypot(x - this.zone.x, y - this.zone.y) < 300) continue;
      const probe = { x, y };
      if (collideBlocks(probe, ZONE.r * 0.6, this.map.blocks)) continue;
      this.zone = { x, y };
      return;
    }
  }

  update(frozen) {
    if (frozen) return;
    this.zoneT -= DT;
    if (this.zoneT <= 0) {
      this.moveZone();
      this.zoneT = ZONE.every;
      this.events.push({ k: 'zone' });
    }
    const inside = this.alive.filter((p) => Math.hypot(p.x - this.zone.x, p.y - this.zone.y) <= ZONE.r);
    this.owner = inside.length === 1 ? inside[0].idx : inside.length ? -2 : -1;
    if (inside.length === 1) inside[0].score += DT;
  }

  roundResult() {
    return this.rt >= this.time ? this.topScorer() : undefined;
  }

  packPlayer(p) {
    return [Math.floor(p.score), p.chg < 0 ? 0 : r2(Math.max(0.01, p.chg / SUMO.chargeTicks)), r2(p.swT)];
  }

  world() {
    return [r1(this.zone.x), r1(this.zone.y), this.owner, this.timeLeft(this.time), r1(this.zoneT)];
  }

  packMe(p) {
    return { ...super.packMe(p), chg: p.chg, swT: r2(p.swT), swCd: r2(p.swCd), bump: -1 };
  }
}
