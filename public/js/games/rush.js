import { THEME } from '../../shared/theme.js';
import { WALK, stepWalker } from '../../shared/walker.js';
import { RUSH, RUSH_SIDES, rushBlocks } from '../../shared/minis.js';
import * as draw from '../draw.js';
import { drawBlocks, drawMark } from '../world-draw.js';
import { ArenaView, ST, PS, HUD_H, lerp } from './arena.js';

export const name = 'Wall Rush';
export const controls = [['Move', 'W A S D'], ['Dash', 'Space']];

const FALL = 0.6;

export class Game extends ArenaView {
  constructor(stage, init) {
    super(stage, init);
    this.bars = [];
  }

  onSnap(snap) {
    this.bars = snap.x.map((b) => b.slice(0, -1));
    super.onSnap(snap);
  }

  stepMe(s, cmd) {
    stepWalker(s, cmd, { blocks: rushBlocks(this.bars), zones: [] }, WALK, s.frozen);
  }

  meContext(snap) {
    return { frozen: snap.st === ST.countdown || snap.st === ST.over };
  }

  unpack(pa, pb, t) {
    return { fallT: lerp(pa[6], pb[6], t) };
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
    // Bars slide smoothly between snapshots (matched by their gaps).
    const prev = v.xa || [];
    const bars = v.x.map((b) => {
      const a = prev.find((pb) => pb[1] === b[1]);
      return [a ? lerp(a[0], b[0], v.t) : b[0], ...b.slice(1, -1)];
    });
    drawBlocks(ctx, [...RUSH_SIDES, ...rushBlocks(bars).slice(RUSH_SIDES.length)]);
  }

  drawPlayer(p, isMe) {
    super.drawPlayer(p, isMe, this.roster.get(p.idx));
    if (isMe && this.pred.state) draw.bar(this.ctx, p.x, p.y + this.radius + 10, 1 - this.pred.state.dashCd / WALK.dashCooldown);
  }

  gameEvent(ev) {
    const q = this.player(ev.p);
    if (ev.k === 'dash' && q) this.fx.ring(q.x, q.y, this.color(ev.p).main, this.radius, this.radius + 12, 0.2);
    if (ev.k === 'fall' && q) this.fx.ring(q.x, q.y, this.color(ev.p).main, this.radius, this.radius + 30, 0.4);
  }
}
