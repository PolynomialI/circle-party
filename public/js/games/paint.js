import { WalkView } from './walkview.js';
import { ST } from './arena.js';

export const name = 'Paint Grab';
export const controls = [['Move', 'W A S D'], ['Dash (wider stripe)', 'Space'], ['Use power-up', 'Click']];

const CELL = 40;

export class Game extends WalkView {
  constructor(stage, init) {
    super(stage, init);
    this.grid = null;
    this.round = -1;
  }

  // Paint arrives as changes plus a periodic full grid; apply it as snapshots come in.
  onSnap(snap) {
    super.onSnap(snap);
    const [, , cols, full, changes] = snap.x;
    if (snap.rd !== this.round || !this.grid) {
      this.round = snap.rd;
      this.grid = null;
      this.cols = cols;
    }
    if (full) this.grid = Int16Array.from(full, (ch) => ch.charCodeAt(0) - 49);
    if (!this.grid) return;
    for (let i = 0; i < changes.length; i += 2) this.grid[changes[i]] = changes[i + 1];
  }

  unpack(pa, pb) {
    return { score: pb[6] };
  }

  roundScore(p) {
    return p.score;
  }

  drawFloorExtras(v) {
    if (!this.grid || v.st === ST.countdown) return;
    const ctx = this.ctx;
    const byOwner = new Map();
    this.grid.forEach((owner, i) => {
      if (owner > 0) {
        if (!byOwner.has(owner)) byOwner.set(owner, []);
        byOwner.get(owner).push(i);
      }
    });
    for (const [owner, cells] of byOwner) {
      ctx.fillStyle = this.color(owner - 1).main;
      for (const i of cells) ctx.fillRect((i % this.cols) * CELL, Math.floor(i / this.cols) * CELL, CELL + 0.5, CELL + 0.5);
    }
  }

  drawHud(v) {
    this.drawTimer(v.x[1]);
  }
}
