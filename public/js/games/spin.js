import { THEME } from '../../shared/theme.js';
import { WALK, stepWalker } from '../../shared/walker.js';
import { SPIN, SPIN_VOID, spinBars, spinRadius } from '../../shared/minis.js';
import * as draw from '../draw.js';
import { drawMark } from '../world-draw.js';
import { hazardFill } from './sumo.js';
import { ArenaView, ST, PS, HUD_H, lerp } from './arena.js';

export const name = 'Spin Cycle';
export const controls = [['Move', 'W A S D'], ['Jump', 'Space']];

const WALK_JUMP = { ...WALK, jump: true };
const LOW = THEME.danger;
const HIGH = '#4fd1ff';

export class Game extends ArenaView {
  stepMe(s, cmd) {
    stepWalker(s, cmd, SPIN_VOID, WALK_JUMP, s.frozen);
    const d = Math.hypot(s.x, s.y);
    if (d < SPIN.hub + 16 && d > 1e-6) {
      s.x *= (SPIN.hub + 16) / d;
      s.y *= (SPIN.hub + 16) / d;
    }
  }

  meContext(snap) {
    return { frozen: snap.st === ST.countdown || snap.st === ST.over };
  }

  unpack(pa, pb, t) {
    return { z: lerp(pa[6], pb[6], t), fallT: lerp(pa[7], pb[7], t) };
  }

  applyMe(me, s) {
    me.z = s.z;
  }

  camera() {
    this.stage.fit(SPIN.view, HUD_H);
  }

  bar(a, len, width, color, lift) {
    const ctx = this.ctx;
    const c = Math.cos(a) * len;
    const s = Math.sin(a) * len;
    for (const [w, col] of [[width + 6, THEME.ink], [width, color]]) {
      ctx.lineWidth = w;
      ctx.strokeStyle = col;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-c, -s - lift);
      ctx.lineTo(c, s - lift);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  drawWorld(v) {
    const ctx = this.ctx;
    const R = spinRadius(v.rt);
    for (const p of v.players) {
      if (p.state !== PS.fall) continue;
      const k = Math.min(1, p.fallT / 0.6);
      ctx.globalAlpha = 1 - k;
      draw.player(ctx, p.x, p.y, this.radius * (1 - 0.6 * k), this.color(p.idx), p.aim, false);
      ctx.globalAlpha = 1;
    }
    // Platform: side face, hazard rim, floor, emblem.
    draw.disc(ctx, 0, 16, R + 3, THEME.ink);
    draw.disc(ctx, 0, 16, R, THEME.wallSide);
    draw.disc(ctx, 0, 0, R + 3, THEME.ink);
    ctx.fillStyle = hazardFill(ctx);
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();
    draw.disc(ctx, 0, 0, R - 14, THEME.ink);
    draw.disc(ctx, 0, 0, R - 17, THEME.floor);
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, R - 17, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = THEME.seam;
    ctx.lineWidth = 3;
    for (let r = 80; r < SPIN.r; r += 80) draw.disc(ctx, 0, 0, r, null, THEME.seam, 3);
    drawMark(ctx, { t: 'emblem', x: 0, y: 0, r: 150, c: THEME.decal, c2: THEME.floor });
    ctx.restore();
    // The low bar sweeps along the floor; the hub sits on top of it.
    const bars = spinBars(v.rt);
    this.bar(bars.low, SPIN.len, 12, LOW, 0);
    // The high bar's shadow, so you can see where it is.
    ctx.globalAlpha = 0.35;
    this.bar(bars.high, SPIN.len, 10, THEME.ink, 0);
    ctx.globalAlpha = 1;
    draw.disc(ctx, 0, 0, SPIN.hub, THEME.metal, THEME.ink);
    draw.disc(ctx, 0, 0, SPIN.hub * 0.5, THEME.accent, THEME.ink, 2.5);
  }

  drawPlayer(p, isMe) {
    const ctx = this.ctx;
    const z = p.z || 0;
    if (z > 0.5) draw.disc(ctx, p.x + 3, p.y + 5, this.radius * (1 - z / 120), THEME.shadow);
    draw.player(ctx, p.x, p.y - z * 0.8, this.radius * (1 + z / 160), this.color(p.idx), p.aim, isMe);
  }

  drawAbove(v) {
    // The high bar, raised above everyone.
    this.bar(spinBars(v.rt).high, SPIN.len, 10, HIGH, 30);
    draw.disc(this.ctx, 0, -30, 14, HIGH, THEME.ink, 2.5);
  }

  gameEvent(ev) {
    const q = this.player(ev.v ?? ev.p);
    if (!q) return;
    if (ev.k === 'hit') this.fx.ring(q.x, q.y, ev.high ? HIGH : LOW, this.radius, this.radius + 22, 0.25, 4);
    if (ev.k === 'fall') this.fx.ring(q.x, q.y, this.color(ev.p).main, this.radius, this.radius + 30, 0.4);
  }
}
