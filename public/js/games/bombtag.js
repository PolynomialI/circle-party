import { THEME } from '../../shared/theme.js';
import * as draw from '../draw.js';
import { WalkView } from './walkview.js';

export const name = 'Bomb Tag';
export const controls = [['Move', 'W A S D'], ['Dash', 'Space'], ['Use power-up', 'Click']];

export class Game extends WalkView {
  drawAbove(v) {
    const h = this.player(v.x[1]);
    if (!h) return;
    // The bomb rides on the holder's head and blinks faster as the fuse runs down.
    const ctx = this.ctx;
    const fuse = v.x[2];
    const blink = Math.floor(performance.now() / (fuse < 3 ? 90 : fuse < 6 ? 200 : 400)) % 2 === 0;
    const x = h.x;
    const y = h.y - this.radius - 34; // above the name tag
    draw.disc(ctx, x, y, 13, blink ? THEME.danger : THEME.wallSide, THEME.ink);
    ctx.fillStyle = THEME.metal;
    ctx.fillRect(x - 4, y - 19, 8, 7);
    ctx.strokeStyle = THEME.ink;
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 4, y - 19, 8, 7);
    draw.disc(ctx, x + 4, y - 23, 4, THEME.accent, THEME.ink, 1.5);
  }

  onGameEvent(ev) {
    if (ev.k === 'boom') {
      this.fx.ring(ev.x, ev.y, THEME.accent, 10, 160, 0.4, 6);
      this.fx.ring(ev.x, ev.y, THEME.danger, 10, 110, 0.3, 5);
      this.fx.splat(ev.x, ev.y, this.color(ev.p).main, 26, Math.random() * 6, 8);
      this.fx.splat(ev.x, ev.y, THEME.ink, 14, Math.random() * 6, 8);
    } else if (ev.k === 'pass') {
      const q = this.player(ev.v);
      if (q) this.fx.ring(q.x, q.y, THEME.danger, this.radius, this.radius + 18, 0.25);
    }
  }
}
