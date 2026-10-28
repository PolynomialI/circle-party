import { DT } from '../../public/shared/loop.js';
import { WALK, newWalker, stepWalker } from '../../public/shared/walker.js';
import { RUSH, rushBlocks } from '../../public/shared/minis.js';
import { collideCircles } from '../physics.js';
import { ArenaGame, ST, PS, r1, r2 } from './arena.js';
import { roundsOption } from './walkgame.js';

export const RUSH_INFO = {
  id: 'rush',
  name: 'Wall Rush',
  blurb: 'Walls with gaps sweep down the platform. Slip through or get pushed off.',
  settings: [roundsOption(3)],
};

const FALL = 0.6;

export class Rush extends ArenaGame {
  constructor(opts) {
    super(opts);
    this.startRound(this.firstCountdown);
  }

  newPlayer(p) {
    Object.assign(p, newWalker(0, 0), { fallT: 0 });
  }

  setupRound(list) {
    this.bars = [];
    this.spawnT = 1.5;
    this.map = { blocks: rushBlocks([]), zones: [] };
    list.forEach((p, i) => {
      Object.assign(p, newWalker(220 + (i % 4) * 253, 480 + Math.floor(i / 4) * 160, -Math.PI / 2), { fallT: 0 });
    });
  }

  // A bar is [y, gapFrom, gapTo, ...] with one or two gaps.
  newBar() {
    const gw = Math.max(105, 170 - this.rt * 1.2);
    const n = this.rng() < 0.5 ? 1 : 2;
    const lo = RUSH.side + 20;
    const hi = RUSH.w - RUSH.side - 20 - gw;
    const gaps = [];
    for (let tries = 0; gaps.length < n && tries < 20; tries++) {
      const a = lo + this.rng() * (hi - lo);
      if (gaps.every(([g]) => Math.abs(g - a) > gw + 80)) gaps.push([a, a + gw]);
    }
    gaps.sort((p, q) => p[0] - q[0]);
    const speed = Math.min(250, 120 + this.rt * 2.5);
    return { y: -RUSH.bar - 20, speed, gaps: gaps.flat() };
  }

  playerTick(p, cmd, frozen) {
    if (p.state === PS.fall) {
      p.x += p.vx * DT;
      p.y += p.vy * DT;
      p.fallT += DT;
      if (p.fallT >= FALL) p.state = PS.out;
    } else if (p.state === PS.alive && stepWalker(p, cmd, this.map, WALK, frozen)) {
      this.events.push({ k: 'dash', p: p.idx });
    }
  }

  worldTick(frozen) {
    if (!frozen && this.state === ST.playing) {
      this.spawnT -= DT;
      if (this.spawnT <= 0) {
        this.bars.push(this.newBar());
        this.spawnT = Math.max(1.3, 3 - this.rt * 0.03);
      }
    }
    for (const b of this.bars) b.y += b.speed * DT;
    this.bars = this.bars.filter((b) => b.y < RUSH.h + 200);
    this.map = { blocks: rushBlocks(this.bars.map((b) => [b.y, ...b.gaps])), zones: [] };
    const alive = this.alive;
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) collideCircles(alive[i], alive[j], 0.5);
    }
    if (frozen) return;
    for (const p of alive) {
      if (p.y > RUSH.h || p.y < 0) {
        p.state = PS.fall;
        this.events.push({ k: 'fall', p: p.idx });
      }
    }
  }

  roundResult() {
    return this.lastStanding();
  }

  packPlayer(p) {
    return [r2(p.fallT)];
  }

  packWorld() {
    return this.bars.map((b) => [r1(b.y), ...b.gaps.map(r1), r1(b.speed)]);
  }

  packMe(p) {
    return { x: r2(p.x), y: r2(p.y), vx: r2(p.vx), vy: r2(p.vy), aim: r2(p.aim), dashT: r2(p.dashT), dashCd: r2(p.dashCd), knockT: r2(p.knockT), spd: 1 };
  }
}
