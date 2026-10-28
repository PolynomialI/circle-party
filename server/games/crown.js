import { DT } from '../../public/shared/loop.js';
import { collideBlocks } from '../../public/shared/world.js';
import { PS, r1 } from './arena.js';
import { WalkGame, arenaOption, roundsOption } from './walkgame.js';

export const timeOption = (def = 45) => ({ key: 'time', label: 'Round time', options: [[30, '30 s'], [45, '45 s'], [60, '1 min'], [90, '1.5 min']], def });

export const CROWN_INFO = {
  id: 'crown',
  name: 'Crown Keeper',
  blurb: 'Grab the crown and keep it. Touch whoever has it to steal it.',
  settings: [roundsOption(3), timeOption(45), arenaOption],
};

export class Crown extends WalkGame {
  constructor(opts) {
    super(opts);
    this.time = opts.settings.time;
    this.startRound(this.firstCountdown);
  }

  setup(list) {
    for (const p of list) p.score = 0;
    this.holder = null;
    this.stealCd = 0;
    this.crown = this.clearSpot(this.map.w / 2, this.map.h / 2);
  }

  // The nearest point to (x, y) that isn't inside or touching a block.
  clearSpot(x, y) {
    for (let r = 0; r < 600; r += 20) {
      for (let a = 0; a < Math.PI * 2; a += r ? 20 / r : 7) {
        const p = { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r };
        if (!collideBlocks({ ...p }, 30, this.map.blocks)) return p;
      }
    }
    return { x, y };
  }

  onMove(p) {
    p.spd = p === this.holder ? 0.9 : 1;
  }

  update(frozen) {
    if (frozen) return;
    this.stealCd = Math.max(0, this.stealCd - DT);
    if (this.holder && (this.holder.state !== PS.alive || !this.players.has(this.holder.id))) this.holder = null;
    if (!this.holder) {
      for (const q of this.alive) {
        if (Math.hypot(q.x - this.crown.x, q.y - this.crown.y) <= q.r + 16) {
          this.holder = q;
          this.events.push({ k: 'grab', p: q.idx });
          break;
        }
      }
    } else if (this.stealCd <= 0) {
      for (const q of this.alive) {
        if (q !== this.holder && this.gap(q, this.holder) <= 2) {
          this.events.push({ k: 'steal', p: q.idx, v: this.holder.idx });
          this.holder = q;
          this.stealCd = 1.2; // a fresh holder can't be robbed straight back
          break;
        }
      }
    }
    if (this.holder) {
      this.holder.score += DT;
      this.crown = { x: this.holder.x, y: this.holder.y };
    }
  }

  roundResult() {
    return this.rt >= this.time ? this.topScorer() : undefined;
  }

  packPlayer(p) {
    return [Math.floor(p.score)];
  }

  world() {
    return [this.holder ? this.holder.idx : -1, r1(this.crown.x), r1(this.crown.y), this.timeLeft(this.time), this.stealCd > 0 ? 1 : 0];
  }
}
