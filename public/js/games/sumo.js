import { THEME } from '../../shared/theme.js';
import { SUMO, MAPS, spinAngle, shrinkRadius, stepMover } from '../../shared/sumo.js';
import { DT } from '../../shared/loop.js';
import * as draw from '../draw.js';
import { ArenaView, ST, PS, HUD_H, lerp } from './arena.js';

export const name = 'Sumo';
export const controls = [
  ['Move', 'W A S D'],
  ['Aim', 'Mouse'],
  ['Swing (hold to charge)', 'Left click'],
  ['Dash', 'Space'],
];

const TAU = Math.PI * 2;
let hazardPattern = null;

// Yellow and navy stripes as a repeating fill, for platform edges.
export function hazardFill(ctx) {
  if (!hazardPattern) {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
    draw.hazard(g, 0, 0, 32, 32);
    hazardPattern = ctx.createPattern(c, 'repeat');
  }
  return hazardPattern;
}

export class Game extends ArenaView {
  constructor(stage, init) {
    super(stage, init);
    this.radius = SUMO.radius;
  }

  stepMe(s, cmd) {
    stepMover(s, cmd, MAPS[s.map], s.rt, s.frozen);
    if (!s.frozen) s.rt += DT;
  }

  meContext(snap) {
    return { rt: snap.rt, map: snap.x, frozen: snap.st === ST.countdown || snap.st === ST.over };
  }

  unpack(pa, pb, t) {
    return { charge: pb[6], swT: pb[7], fallT: lerp(pa[8], pb[8], t) };
  }

  applyMe(me, s) {
    me.charge = s.chg < 0 ? 0 : Math.max(0.01, s.chg / SUMO.chargeTicks);
    me.swT = s.swT;
  }

  camera(v) {
    this.stage.fit(MAPS[v.x].view, HUD_H);
  }

  gameEvent(ev, v) {
    const map = MAPS[v.x];
    let q;
    if (ev.k === 'hit' && (q = this.player(ev.v))) {
      this.fx.ring(q.x, q.y, THEME.white, SUMO.radius, SUMO.radius + 16 + ev.pw * 24);
      this.fx.splat(q.x, q.y, this.color(ev.v).main, 6 + ev.pw * 6, Math.atan2(q.y - (this.player(ev.p) || q).y, q.x - (this.player(ev.p) || q).x), 3);
    } else if (ev.k === 'dash' && (q = this.player(ev.p))) {
      this.fx.ring(q.x, q.y, this.color(ev.p).main, SUMO.radius, SUMO.radius + 12, 0.2);
    } else if (ev.k === 'bump' && map.bumpers && map.bumpers[ev.i]) {
      const bm = map.bumpers[ev.i];
      this.fx.ring(bm.x, bm.y, THEME.accent, bm.r, bm.r + 16, 0.25, 4);
    } else if (ev.k === 'bonk') {
      this.fx.ring(ev.x, ev.y, THEME.white, 4, 18, 0.2);
    } else if (ev.k === 'fall' && (q = this.player(ev.p))) {
      this.fx.ring(q.x, q.y, this.color(ev.p).main, SUMO.radius, SUMO.radius + 30, 0.4);
    }
  }

  drawWorld(v) {
    const ctx = this.ctx;
    const map = MAPS[v.x];
    // Players who fell are drawn under the platform's edge.
    for (const p of v.players) {
      if (p.state !== PS.fall) continue;
      const r = this.roster.get(p.idx);
      if (!r) continue;
      const k = Math.min(1, p.fallT / SUMO.fallTime);
      ctx.globalAlpha = 1 - k;
      draw.player(ctx, p.x, p.y, SUMO.radius * (1 - 0.6 * k), this.color(p.idx), p.aim, false);
      ctx.globalAlpha = 1;
    }
    this.drawPlatform(map, v.rt);
    if (map.bumpers) {
      for (const bm of map.bumpers) {
        draw.disc(ctx, bm.x + 5, bm.y + 5, bm.r, THEME.shadow);
        draw.disc(ctx, bm.x, bm.y, bm.r, THEME.metal, THEME.ink);
        draw.disc(ctx, bm.x, bm.y, bm.r * 0.62, THEME.accent, THEME.ink, 2.5);
        draw.disc(ctx, bm.x, bm.y, bm.r * 0.22, THEME.ink);
      }
    }
  }

  drawPlayer(p, isMe, r) {
    const ctx = this.ctx;
    let angle = p.aim + 1.0 + 0.6 * p.charge;
    if (p.swT > 0) angle = p.aim + 1.2 - 2.6 * (1 - p.swT / SUMO.swingTime);
    draw.held(ctx, p.x, p.y, angle, SUMO.radius - 6, SUMO.stickLength + 6, SUMO.stickWidth + 1, THEME.metal);
    draw.player(ctx, p.x, p.y, SUMO.radius, this.color(p.idx), p.aim, isMe);
    if (p.charge > 0) draw.chargeArc(ctx, p.x, p.y, SUMO.radius + 2, p.charge);
    if (isMe && this.pred.state) draw.bar(ctx, p.x, p.y + SUMO.radius + 10, 1 - this.pred.state.dashCd / SUMO.dashCooldown);
  }

  // The platform's shape grown (inset < 0) or shrunk (inset > 0). Each piece is changed on its own,
  // so where pieces overlap there's no line.
  platformPath(map, rt, inset) {
    const spin = spinAngle(map, rt);
    const path = new Path2D();
    for (const s of map.solids) {
      if (s.t === 'circle') {
        const r = (map.shrink ? shrinkRadius(map, rt) : s.r) - inset;
        path.moveTo(r, 0);
        path.arc(0, 0, r, 0, TAU);
      } else if (s.t === 'ring') {
        const r0 = s.r0 + inset;
        const r1 = s.r1 - inset;
        const gaps = [...s.gaps].sort((x, y) => x - y);
        gaps.forEach((g, i) => {
          const a0 = g + s.gap;
          const a1 = (i + 1 < gaps.length ? gaps[i + 1] : gaps[0] + TAU) - s.gap;
          path.moveTo(Math.cos(a0 + inset / r1) * r1, Math.sin(a0 + inset / r1) * r1);
          path.arc(0, 0, r1, a0 + inset / r1, a1 - inset / r1);
          path.arc(0, 0, r0, a1 - inset / r0, a0 + inset / r0, true);
          path.closePath();
        });
      } else {
        const a = s.a + spin;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([kx, ky], i) => {
          const x = kx * (s.w / 2 - inset);
          const y = ky * (s.h / 2 - inset);
          if (i === 0) path.moveTo(x * c - y * sn, x * sn + y * c);
          else path.lineTo(x * c - y * sn, x * sn + y * c);
        });
        path.closePath();
      }
    }
    return path;
  }

  // A metal floor over the pit: a darker side face for depth, a hazard-striped edge, plate seams.
  drawPlatform(map, rt) {
    const ctx = this.ctx;
    const outer = this.platformPath(map, rt, -THEME.outline);
    const edge = this.platformPath(map, rt, 0);
    ctx.save();
    ctx.translate(0, 16);
    ctx.fillStyle = THEME.ink;
    ctx.fill(outer);
    ctx.fillStyle = THEME.wallSide;
    ctx.fill(edge);
    ctx.restore();
    ctx.fillStyle = THEME.ink;
    ctx.fill(outer);
    ctx.fillStyle = hazardFill(ctx);
    ctx.fill(edge);
    ctx.fillStyle = THEME.ink;
    ctx.fill(this.platformPath(map, rt, 14));
    const top = this.platformPath(map, rt, 17);
    ctx.fillStyle = THEME.floor;
    ctx.fill(top);

    ctx.save();
    ctx.clip(top);
    ctx.save();
    ctx.rotate(spinAngle(map, rt));
    const V = map.view;
    ctx.strokeStyle = THEME.seam;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = -V; x <= V; x += 120) {
      ctx.moveTo(x, -V);
      ctx.lineTo(x, V);
      ctx.moveTo(-V, x);
      ctx.lineTo(V, x);
    }
    ctx.stroke();
    ctx.restore();
    if (map.ice) {
      for (const z of map.ice) {
        draw.disc(ctx, z.x, z.y, z.r, THEME.ice, THEME.decal, 4);
        ctx.strokeStyle = THEME.white;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(z.x - z.r * 0.45, z.y - z.r * 0.1);
        ctx.lineTo(z.x - z.r * 0.1, z.y - z.r * 0.45);
        ctx.moveTo(z.x - z.r * 0.3, z.y + z.r * 0.2);
        ctx.lineTo(z.x + z.r * 0.2, z.y - z.r * 0.3);
        ctx.stroke();
      }
    }
    const ring = map.solids.find((s) => s.t === 'ring');
    draw.disc(ctx, 0, 0, ring ? (ring.r0 + ring.r1) / 2 : 80, null, THEME.decal, 10);
    if (!ring) draw.disc(ctx, 0, 0, 14, THEME.decal);
    ctx.restore();
  }
}
