import { WalkGame, arenaOption, roundsOption, powersOption } from './walkgame.js';
import { WALK_POWERS } from '../../public/shared/walkpowers.js';
import { timeOption } from './crown.js';

export const PAINT_INFO = {
  id: 'paint',
  name: 'Paint Grab',
  blurb: 'Paint the floor your colour by walking on it. Dash to cut through.',
  settings: [roundsOption(3), timeOption(45), arenaOption, powersOption],
};

export const CELL = 40;

// Grid of floor cells: -1 under a block, 0 bare, idx + 1 painted by that player.
export class Paint extends WalkGame {
  constructor(opts) {
    super(opts, { powers: ['boots', 'glove', 'blink', 'splash'] });
    this.time = opts.settings.time;
    this.startRound(this.firstCountdown);
  }

  setup(list) {
    for (const p of list) p.score = 0;
    const m = this.map;
    this.cols = Math.ceil(m.w / CELL);
    this.rows = Math.ceil(m.h / CELL);
    this.grid = new Int16Array(this.cols * this.rows);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = (c + 0.5) * CELL;
        const y = (r + 0.5) * CELL;
        if (m.blocks.some(([bx, by, bw, bh]) => x > bx && x < bx + bw && y > by && y < by + bh)) this.grid[r * this.cols + c] = -1;
      }
    }
    this.changes = [];
    this.fullIn = 0;
  }

  onMove(p, cmd, frozen) {
    if (frozen) return;
    const c0 = Math.floor(p.x / CELL);
    const r0 = Math.floor(p.y / CELL);
    const rad = p.dashT > 0 ? 1 : 0; // a dash paints a wider stripe
    for (let r = r0 - rad; r <= r0 + rad; r++) {
      for (let c = c0 - rad; c <= c0 + rad; c++) {
        if (c >= 0 && r >= 0 && c < this.cols && r < this.rows) this.paint(r * this.cols + c, p);
      }
    }
  }

  // Paint Bomb: every cell round you turns your colour.
  onPower(p, kind) {
    if (kind !== 'splash') return;
    const r = WALK_POWERS.splash.r;
    for (let row = Math.floor((p.y - r) / CELL); row <= Math.floor((p.y + r) / CELL); row++) {
      for (let c = Math.floor((p.x - r) / CELL); c <= Math.floor((p.x + r) / CELL); c++) {
        if (c < 0 || row < 0 || c >= this.cols || row >= this.rows) continue;
        if (Math.hypot((c + 0.5) * CELL - p.x, (row + 0.5) * CELL - p.y) <= r) this.paint(row * this.cols + c, p);
      }
    }
  }

  paint(cell, p) {
    const prev = this.grid[cell];
    if (prev === -1 || prev === p.idx + 1) return;
    if (prev > 0) {
      for (const q of this.players.values()) if (q.idx === prev - 1) q.score--;
    }
    this.grid[cell] = p.idx + 1;
    p.score++;
    this.changes.push(cell, p.idx + 1);
  }

  roundResult() {
    return this.rt >= this.time ? this.topScorer() : undefined;
  }

  packPlayer(p) {
    return [p.score];
  }

  // Changed cells every snapshot, and the whole grid every half second so dropped snapshots heal.
  world() {
    let full = 0;
    if (--this.fullIn <= 0) {
      full = Array.from(this.grid, (v) => String.fromCharCode(49 + v)).join('');
      this.fullIn = 15;
    }
    const changes = this.changes;
    this.changes = [];
    return [this.timeLeft(this.time), this.cols, full, changes];
  }
}
