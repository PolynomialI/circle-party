import { THEME } from '../../shared/theme.js';
import { WALK, stepWalker } from '../../shared/walker.js';
import { RUSH, RUSH_SIDES, RUSH_SIDES_MAP, RUSH_POWERS, RUSH_POWER_IDS, rushBlocks, useRushPower } from '../../shared/minis.js';
import * as draw from '../draw.js';
import { drawBlocks, drawMark } from '../world-draw.js';
import { ArenaView, ST, PS, HUD_H, lerp } from './arena.js';

export const name = 'Wall Rush';
export const controls = [['Move', 'W A S D'], ['Dash', 'Space'], ['Use power-up', 'Click']];

const FALL = 0.6;
const PUNCH = 0.18;

export class Game extends ArenaView {
  constructor(stage, init) {
    super(stage, init);
    this.bars = [];
    this.punches = [];
  }

  onSnap(snap) {
    this.bars = snap.x[0].map((b) => b.slice(1));
    super.onSnap(snap);
  }

  stepMe(s, cmd) {
    useRushPower(s, cmd, s.frozen);
    stepWalker(s, cmd, s.z > RUSH.air ? RUSH_SIDES_MAP : { blocks: rushBlocks(this.bars), zones: [] }, WALK, s.frozen);
  }

  meContext(snap) {
    return { frozen: snap.st === ST.countdown || snap.st === ST.over };
  }

  unpack(pa, pb, t) {
    return { fallT: lerp(pa[6], pb[6], t), z: lerp(pa[7], pb[7], t), held: RUSH_POWER_IDS[pb[8]] || '' };
  }

  applyMe(me, s) {
    Object.assign(me, { z: s.z, held: s.held });
  }

  camera() {
    this.stage.fitRect(0, -80, RUSH.w, RUSH.h + 30, HUD_H, 10);
  }

  drawWorld(v) {
    const ctx = this.ctx;
    for (const p of v.players) {
      if (p.state !== PS.fall) continue;
      const k = Math.min(1, p.fallT / FALL);
      ctx.globalAlpha = 1 - k;
      draw.player(ctx, p.x, p.y, this.radius * (1 - 0.6 * k), this.color(p.idx), p.aim, false);
      ctx.globalAlpha = 1;
    }
    // Platform with a side face, plate seams and hazard edges top and bottom.
    ctx.fillStyle = THEME.wallSide;
    ctx.fillRect(0, RUSH.h, RUSH.w, 18);
    ctx.fillStyle = THEME.floor;
    ctx.fillRect(0, 0, RUSH.w, RUSH.h);
    ctx.strokeStyle = THEME.seam;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 160; x < RUSH.w; x += 160) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, RUSH.h);
    }
    for (let y = 160; y < RUSH.h; y += 160) {
      ctx.moveTo(0, y);
      ctx.lineTo(RUSH.w, y);
    }
    ctx.stroke();
    for (const x of [300, 600, 900]) for (const y of [220, 520]) drawMark(ctx, { t: 'arrow', x, y, a: Math.PI / 2, s: 46 });
    drawMark(ctx, { t: 'grate', x: 80, y: 360, w: 40, h: 120 });
    drawMark(ctx, { t: 'grate', x: RUSH.w - 120, y: 360, w: 40, h: 120 });
    for (const m of [[0, 0], [0, RUSH.h - 14]]) draw.hazard(ctx, m[0], m[1], RUSH.w, 14);
    ctx.lineWidth = THEME.outline;
    ctx.strokeStyle = THEME.ink;
    ctx.strokeRect(0, 0, RUSH.w, RUSH.h + 18);
    for (const [id, x, y, type] of v.x[1]) draw.crate(ctx, x, y, RUSH_POWERS[RUSH_POWER_IDS[type]].color, id);
    // Jump shadows go under the walls.
    for (const p of v.players) {
      if (p.state !== PS.alive || !(p.z > 0)) continue;
      ctx.globalAlpha = 0.3;
      draw.disc(ctx, p.x + 4, p.y + 6, this.radius * 0.9, THEME.ink);
      ctx.globalAlpha = 1;
    }
    // Bars slide smoothly between snapshots (matched by id).
    const prev = new Map(((v.xa && v.xa[0]) || []).map((b) => [b[0], b]));
    const bars = v.x[0].map((b) => {
      const a = prev.get(b[0]);
      if (!a || a.length !== b.length) return b.slice(1);
      return b.slice(1).map((val, i) => lerp(a[i + 1], val, v.t));
    });
    drawBlocks(ctx, [...RUSH_SIDES, ...rushBlocks(bars).slice(RUSH_SIDES.length)]);
    // Frozen walls get a frosty coat.
    if (v.x[2] > 0) {
      ctx.globalAlpha = Math.min(1, v.x[2]) * 0.55;
      ctx.fillStyle = '#e4f8ff';
      for (const [x, y, w, h] of rushBlocks(bars).slice(RUSH_SIDES.length)) ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
    }
  }

  drawPlayer(p, isMe, r) {
    const ctx = this.ctx;
    const lift = Math.min(1, (p.z || 0) / 40);
    if (lift > 0) {
      ctx.save();
      ctx.translate(p.x, p.y - (p.z || 0) * 0.5);
      ctx.scale(1 + lift * 0.3, 1 + lift * 0.3);
      ctx.translate(-p.x, -p.y);
    }
    // Glove swing: a fist shoots out where you aim.
    const now = performance.now() / 1000;
    const swing = this.punches.find((s) => s.p === p.idx && now - s.t0 < PUNCH);
    if (swing || p.held === 'glove') {
      const k = swing ? Math.sin(((now - swing.t0) / PUNCH) * Math.PI) : 0;
      const a = swing ? swing.a : p.aim + 0.6;
      const d = this.radius + 4 + k * RUSH_POWERS.glove.reach;
      draw.held(ctx, p.x, p.y, a, this.radius - 4, d - this.radius + 4, 6);
      draw.disc(ctx, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 9 + k * 3, RUSH_POWERS.glove.color, THEME.ink, 2.5);
    }
    super.drawPlayer(p, isMe, r);
    if (p.held && p.held !== 'glove') {
      const c = RUSH_POWERS[p.held].color;
      ctx.fillStyle = c;
      ctx.fillRect(p.x + this.radius, p.y - this.radius - 10, 11, 11);
      ctx.strokeStyle = THEME.ink;
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x + this.radius, p.y - this.radius - 10, 11, 11);
    }
    if (lift > 0) ctx.restore();
    if (isMe && this.pred.state) draw.bar(ctx, p.x, p.y + this.radius + 10, 1 - this.pred.state.dashCd / WALK.dashCooldown);
  }

  drawHud() {
    const s = this.pred.state;
    if (s && s.held) {
      const def = RUSH_POWERS[s.held];
      draw.heldPower(this.ctx, this.stage.h, def.name, def.color, s.held === 'glove' ? ` ×${s.uses}` : '');
    }
  }

  gameEvent(ev) {
    const q = this.player(ev.p);
    const now = performance.now() / 1000;
    this.punches = this.punches.filter((s) => now - s.t0 < PUNCH);
    if (ev.k === 'dash' && q) this.fx.ring(q.x, q.y, this.color(ev.p).main, this.radius, this.radius + 12, 0.2);
    else if (ev.k === 'fall' && q) this.fx.ring(q.x, q.y, this.color(ev.p).main, this.radius, this.radius + 30, 0.4);
    else if (ev.k === 'punch') {
      this.punches.push({ p: ev.p, a: ev.a, t0: now });
      if (q && ev.hit) this.fx.ring(q.x + Math.cos(ev.a) * 40, q.y + Math.sin(ev.a) * 40, THEME.white, 8, 34, 0.25, 5);
    } else if (ev.k === 'grab') this.fx.ring(ev.x, ev.y, RUSH_POWERS[ev.w].color, 14, 44, 0.3, 4);
    else if (ev.k === 'smash') this.fx.splat(ev.x, ev.y, RUSH_POWERS[ev.w].color, 12, Math.random() * 6, 6);
    else if (ev.k === 'drill') this.fx.ring(ev.x, Math.max(10, ev.y + RUSH.bar / 2), RUSH_POWERS.drill.color, 20, 80, 0.4, 6);
    else if (ev.k === 'freeze') this.banner.show('FREEZE!', RUSH_POWERS.freeze.color, 1);
    else if (ev.k === 'spring' && q) this.fx.ring(q.x, q.y, RUSH_POWERS.spring.color, this.radius, this.radius + 26, 0.3, 4);
  }
}
