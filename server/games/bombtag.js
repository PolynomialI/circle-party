import { DT } from '../../public/shared/loop.js';
import { PS, r1 } from './arena.js';
import { WalkGame, arenaOption, roundsOption } from './walkgame.js';

export const BOMBTAG_INFO = {
  id: 'bombtag',
  name: 'Bomb Tag',
  blurb: 'Touch someone to pass the bomb. Whoever holds it when it blows is out.',
  settings: [roundsOption(3), arenaOption],
};

const BLAST = { radius: 160, push: 520 };

export class BombTag extends WalkGame {
  constructor(opts) {
    super(opts);
    this.startRound(this.firstCountdown);
  }

  setup(list) {
    this.holder = list[0] || null;
    this.passCd = 0;
    this.fuse = this.newFuse();
  }

  newFuse() {
    return 6 + this.rng() * 5;
  }

  onMove(p) {
    p.spd = p === this.holder ? 1.12 : 1;
  }

  update(frozen) {
    if (frozen || !this.holder) return;
    this.passCd = Math.max(0, this.passCd - DT);
    const h = this.holder;
    if (h.state !== PS.alive || !this.players.has(h.id)) return this.newHolder();
    if (this.passCd <= 0) {
      for (const q of this.alive) {
        if (q !== h && this.gap(h, q) <= 2) {
          this.holder = q;
          this.passCd = 0.6;
          this.events.push({ k: 'pass', p: h.idx, v: q.idx });
          break;
        }
      }
    }
    this.fuse -= DT;
    if (this.fuse > 0) return;
    const b = this.holder;
    b.state = PS.out;
    this.events.push({ k: 'boom', p: b.idx, x: r1(b.x), y: r1(b.y) });
    for (const q of this.alive) {
      const dx = q.x - b.x;
      const dy = q.y - b.y;
      const d = Math.hypot(dx, dy);
      if (d > BLAST.radius || d < 1e-6) continue;
      q.vx = (dx / d) * BLAST.push;
      q.vy = (dy / d) * BLAST.push;
      q.knockT = 0.35;
    }
    this.newHolder();
  }

  newHolder() {
    const alive = this.alive;
    this.holder = alive.length > 1 ? alive[Math.floor(this.rng() * alive.length)] : null;
    this.fuse = this.newFuse();
    this.passCd = 1;
  }

  roundResult() {
    return this.lastStanding();
  }

  world() {
    return [this.holder ? this.holder.idx : -1, r1(Math.max(0, this.fuse))];
  }
}
