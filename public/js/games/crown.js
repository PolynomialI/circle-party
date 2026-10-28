import { THEME } from '../../shared/theme.js';
import * as draw from '../draw.js';
import { WalkView } from './walkview.js';

export const name = 'Crown Keeper';
export const controls = [['Move', 'W A S D'], ['Dash', 'Space']];

export function drawCrown(ctx, x, y, s = 1) {
  ctx.beginPath();
  const pts = [[-14, 6], [-16, -10], [-7, -2], [0, -14], [7, -2], [16, -10], [14, 6]];
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(x + px * s, y + py * s) : ctx.moveTo(x + px * s, y + py * s)));
  ctx.closePath();
  ctx.fillStyle = THEME.accent;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = THEME.ink;
  ctx.stroke();
  draw.disc(ctx, x, y - 1 * s, 3 * s, THEME.danger, THEME.ink, 1.5);
}

export class Game extends WalkView {
  unpack(pa, pb) {
    return { score: pb[6] };
  }

  roundScore(p) {
    return p.score;
  }

  drawAbove(v) {
    const h = this.player(v.x[1]);
    if (h && v.x[5]) draw.disc(this.ctx, h.x, h.y, this.radius + 9, null, THEME.white, 3);
    if (h) drawCrown(this.ctx, h.x, h.y - this.radius - 30);
    else if (v.x[1] < 0) drawCrown(this.ctx, v.x[2], v.x[3], 1.3);
  }

  drawHud(v) {
    this.drawTimer(v.x[4]);
  }

  onGameEvent(ev) {
    const q = this.player(ev.p);
    if ((ev.k === 'grab' || ev.k === 'steal') && q) this.fx.ring(q.x, q.y, THEME.accent, this.radius, this.radius + 22, 0.3, 4);
  }
}
