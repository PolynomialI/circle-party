import { THEME } from '../../shared/theme.js';
import { stepWalker } from '../../shared/walker.js';
import { TANK, mazeMap } from '../../shared/minis.js';
import * as draw from '../draw.js';
import { WalkView } from './walkview.js';
import { lerp } from './arena.js';

export const name = 'Ricochet Tanks';
export const controls = [['Move', 'W A S D'], ['Aim', 'Mouse'], ['Fire', 'Left click']];

const TANK_WALK = { speed: TANK.speed, dash: false, radius: TANK.radius };

export class Game extends WalkView {
  constructor(stage, init) {
    super(stage, init, { walk: TANK_WALK });
  }

  get map() {
    return this.view ? mazeMap(this.view.x[0]) : null;
  }

  stepMe(s, cmd) {
    stepWalker(s, cmd, mazeMap(s.map), TANK_WALK, s.frozen);
  }

  drawAbove(v) {
    const prev = new Map((v.xa[1] || []).map((b) => [b[0], b]));
    for (const [id, x, y] of v.x[1]) {
      const a = prev.get(id);
      draw.disc(this.ctx, a ? lerp(a[1], x, v.t) : x, a ? lerp(a[2], y, v.t) : y, TANK.bulletR, THEME.white, THEME.ink, 2.5);
    }
  }

  drawPlayer(p, isMe) {
    const ctx = this.ctx;
    const c = this.color(p.idx);
    // Treads, barrel, then the body.
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.aim);
    ctx.fillStyle = THEME.wallSide;
    ctx.strokeStyle = THEME.ink;
    ctx.lineWidth = 2.5;
    for (const side of [-1, 1]) {
      ctx.fillRect(-14, side * 13 - 4, 28, 8);
      ctx.strokeRect(-14, side * 13 - 4, 28, 8);
    }
    ctx.restore();
    draw.held(ctx, p.x, p.y, p.aim, TANK.radius - 4, 18, 9, c.dark);
    draw.player(ctx, p.x, p.y, TANK.radius, c, p.aim, isMe);
  }

  onGameEvent(ev) {
    if (ev.k === 'boom') {
      this.fx.ring(ev.x, ev.y, THEME.accent, 10, 60, 0.35, 5);
      this.fx.splat(ev.x, ev.y, this.color(ev.p).main, 16, Math.random() * 6, 8);
    }
  }
}
