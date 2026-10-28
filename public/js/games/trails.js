import { THEME } from '../../shared/theme.js';
import { TRAILS, TRAIL_MAP, stepTrail } from '../../shared/minis.js';
import * as draw from '../draw.js';
import { drawFloor, drawBlocks } from '../world-draw.js';
import { ArenaView, ST, PS, HUD_H } from './arena.js';

export const name = 'Light Trails';
export const controls = [['Steer', 'Mouse (or A / D)'], ['Boost', 'Space']];

export class Game extends ArenaView {
  constructor(stage, init) {
    super(stage, init);
    this.radius = 11;
    this.trails = new Map();
    this.round = -1;
  }

  stepMe(s, cmd) {
    stepTrail(s, cmd, s.frozen);
  }

  meContext(snap) {
    return { frozen: snap.st === ST.countdown || snap.st === ST.over };
  }

  unpack(pa, pb) {
    return { boost: pb[6] };
  }

  // Trails are rebuilt from where each player has been drawn.
  update(s, dt) {
    super.update(s, dt);
    const v = this.view;
    if (v.rd !== this.round) {
      this.round = v.rd;
      this.trails = new Map();
    }
    if (v.st === ST.countdown) return;
    for (const p of v.players) {
      if (p.state !== PS.alive) continue;
      const t = this.trails.get(p.idx) || [];
      const last = t[t.length - 1];
      if (!last || Math.hypot(last[0] - p.x, last[1] - p.y) > 6) t.push([p.x, p.y]);
      this.trails.set(p.idx, t);
    }
  }

  camera() {
    this.stage.fitRect(0, 0, TRAIL_MAP.w, TRAIL_MAP.h, HUD_H);
  }

  drawWorld() {
    const ctx = this.ctx;
    drawFloor(ctx, TRAIL_MAP);
    drawBlocks(ctx, TRAIL_MAP.blocks);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [w, pick] of [[12, () => THEME.ink], [6, (idx) => this.color(idx).main]]) {
      for (const [idx, t] of this.trails) {
        if (t.length < 2) continue;
        ctx.lineWidth = w;
        ctx.strokeStyle = pick(idx);
        ctx.beginPath();
        t.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      }
    }
    ctx.lineCap = 'butt';
  }

  drawPlayer(p, isMe) {
    if (p.boost) draw.disc(this.ctx, p.x, p.y, this.radius + 6, null, THEME.accent, 3);
    draw.player(this.ctx, p.x, p.y, this.radius, this.color(p.idx), p.aim, isMe);
    if (isMe && this.pred.state) draw.bar(this.ctx, p.x, p.y + this.radius + 10, 1 - this.pred.state.boostCd / TRAILS.boostCd);
  }

  gameEvent(ev) {
    if (ev.k === 'crash') {
      this.fx.ring(ev.x, ev.y, THEME.white, 10, 40, 0.35, 5);
      this.fx.splat(ev.x, ev.y, this.color(ev.p).main, 14, Math.random() * 6, 8);
    }
  }
}
