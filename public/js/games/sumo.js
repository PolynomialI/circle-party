import { THEME, COLORS } from '../../shared/theme.js';
import { SUMO, MAPS, spinAngle, shrinkRadius, stepMover } from '../../shared/sumo.js';
import { DT } from '../../shared/loop.js';
import { Predictor } from '../net.js';
import * as draw from '../draw.js';

export const name = 'Sumo';
export const controls = [
  ['Move', 'W A S D'],
  ['Aim', 'Mouse'],
  ['Swing (hold to charge)', 'Left click'],
  ['Dash', 'Space'],
];

const ST = { countdown: 0, playing: 1, roundEnd: 2, over: 3 };
const PS = { alive: 0, fall: 1, out: 2, wait: 3 };
const HUD_H = 64;
const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

export class Game {
  constructor(stage) {
    this.stage = stage;
    this.ctx = stage.ctx;
    this.fx = new draw.Effects();
    this.banner = new draw.Banner();
    this.view = null;
    this.mePos = null;
    this.roster = new Map();
    this.me = -1;
    this.pred = new Predictor((s, cmd) => {
      stepMover(s, cmd, MAPS[s.map], s.rt, s.frozen);
      if (!s.frozen) s.rt += DT;
    });
  }

  setRoster(roster, meIdx) {
    this.roster = new Map(roster.map((r) => [r.idx, r]));
    this.me = meIdx;
  }

  color(idx) {
    const r = this.roster.get(idx);
    return COLORS[r ? r.color : 0];
  }

  onSnap(snap) {
    if (snap.me) this.pred.reconcile({ ...snap.me, rt: snap.rt, map: snap.map, frozen: snap.st === ST.countdown || snap.st === ST.over });
    else this.pred.clear();
  }

  get acting() {
    return this.pred.state !== null;
  }

  predict(cmd) {
    this.pred.local(cmd);
  }

  aimOrigin() {
    return this.mePos ? this.stage.toScreen(this.mePos.x, this.mePos.y) : null;
  }

  update({ a, b, t }, dt) {
    if (a.rd !== b.rd) t = 1; // don't blend across a round change (everyone moved to their spawn)
    const prev = new Map(a.p.map((p) => [p[0], p]));
    const src = t === 1 ? b : a;
    this.view = {
      st: src.st,
      tm: lerp(a.tm, b.st === a.st ? b.tm : a.tm, t),
      rt: lerp(a.rt, b.rt >= a.rt ? b.rt : a.rt, t),
      map: MAPS[src.map],
      rd: src.rd,
      players: b.p.map((pb) => {
        const pa = prev.get(pb[0]) || pb;
        return {
          idx: pb[0], x: lerp(pa[1], pb[1], t), y: lerp(pa[2], pb[2], t), aim: lerpAngle(pa[3], pb[3], t),
          state: pb[4], charge: pb[5], swT: pb[6], fallT: lerp(pa[7], pb[7], t), wins: pb[8],
        };
      }),
    };
    this.mePos = null;
    const me = this.view.players.find((p) => p.idx === this.me);
    if (me && me.state === PS.alive && this.pred.state) {
      const s = this.pred.state;
      Object.assign(me, this.pred.pos(dt), { aim: s.aim, charge: s.chg < 0 ? 0 : Math.max(0.01, s.chg / SUMO.chargeTicks), swT: s.swT });
      this.mePos = { x: me.x, y: me.y };
    }
  }

  onEvent(ev) {
    const v = this.view;
    const p = (idx) => v.players.find((q) => q.idx === idx);
    const name = (idx) => (this.roster.get(idx) || { name: '?' }).name;
    let q;
    switch (ev.k) {
      case 'go':
        this.banner.show('GO!', THEME.accent, 0.8);
        break;
      case 'hit':
        if ((q = p(ev.v))) this.fx.ring(q.x, q.y, THEME.white, SUMO.radius, SUMO.radius + 16 + ev.pw * 24);
        break;
      case 'dash':
        if ((q = p(ev.p))) this.fx.ring(q.x, q.y, this.color(ev.p).main, SUMO.radius, SUMO.radius + 12, 0.2);
        break;
      case 'bump': {
        const bm = v.map.bumpers && v.map.bumpers[ev.i];
        if (bm) this.fx.ring(bm.x, bm.y, THEME.white, bm.r, bm.r + 14, 0.2);
        break;
      }
      case 'bonk':
        this.fx.ring(ev.x, ev.y, THEME.white, 4, 18, 0.2);
        break;
      case 'fall':
        if ((q = p(ev.p))) this.fx.ring(q.x, q.y, this.color(ev.p).main, SUMO.radius, SUMO.radius + 30, 0.4);
        break;
      case 'win':
        this.banner.show(`${name(ev.p).toUpperCase()} WINS`, this.color(ev.p).main, 2.2);
        break;
      case 'draw':
        this.banner.show('DRAW', THEME.white, 2.2);
        break;
    }
  }

  draw() {
    const v = this.view;
    const st = this.stage;
    const ctx = this.ctx;
    st.clear();
    if (!v) return;
    st.fit(v.map.view, HUD_H);
    st.world();
    this.drawPlatform(v.map, v.rt);
    if (v.map.bumpers) {
      for (const bm of v.map.bumpers) {
        draw.disc(ctx, bm.x, bm.y, bm.r, THEME.post, THEME.postLine);
        draw.disc(ctx, bm.x, bm.y, bm.r * 0.55, THEME.hud);
      }
    }

    const order = [...v.players].sort((a, b) => (a.state === PS.fall ? -1 : 0) - (b.state === PS.fall ? -1 : 0));
    for (const p of order) {
      if (p.state !== PS.alive && p.state !== PS.fall) continue;
      const r = this.roster.get(p.idx);
      if (!r) continue;
      const color = COLORS[r.color];
      const isMe = p.idx === this.me;
      if (p.state === PS.fall) {
        const k = Math.min(1, p.fallT / SUMO.fallTime);
        ctx.globalAlpha = 1 - k;
        draw.player(ctx, p.x, p.y, SUMO.radius * (1 - 0.6 * k), color, r.name, false);
        ctx.globalAlpha = 1;
        continue;
      }
      this.drawStick(p);
      draw.player(ctx, p.x, p.y, SUMO.radius, color, r.name, isMe);
      if (p.charge > 0) draw.chargeArc(ctx, p.x, p.y, SUMO.radius, p.charge);
      draw.nameTag(ctx, p.x, p.y, SUMO.radius, r.name, isMe);
      if (isMe && this.pred.state) draw.bar(ctx, p.x, p.y + SUMO.radius + 7, 1 - this.pred.state.dashCd / SUMO.dashCooldown);
    }
    this.fx.draw(ctx);

    st.screen();
    this.drawHud(v);
  }

  // The platform's shape, shrunk inwards by inset. Each piece is shrunk on its own, so where
  // pieces overlap there's no line.
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

  // Platform in Circle Soccer pitch colours: a darker rim, a chalk line, then striped grass.
  drawPlatform(map, rt) {
    const ctx = this.ctx;
    ctx.fillStyle = THEME.rim;
    ctx.fill(this.platformPath(map, rt, 0));
    ctx.fillStyle = THEME.chalk;
    ctx.fill(this.platformPath(map, rt, 12));

    ctx.save();
    ctx.clip(this.platformPath(map, rt, 15));
    ctx.save();
    ctx.rotate(spinAngle(map, rt));
    const V = map.view;
    const bands = 16;
    const bw = (2 * V) / bands;
    for (let i = 0; i < bands; i++) {
      ctx.fillStyle = THEME.grass[i % 2];
      ctx.fillRect(-V + bw * i, -V, bw + 0.5, 2 * V);
    }
    ctx.restore();
    if (map.ice) for (const z of map.ice) draw.disc(ctx, z.x, z.y, z.r, THEME.ice);
    ctx.strokeStyle = THEME.chalk;
    ctx.lineWidth = THEME.lineWidth;
    ctx.beginPath();
    const ring = map.solids.find((s) => s.t === 'ring');
    ctx.arc(0, 0, ring ? (ring.r0 + ring.r1) / 2 : 70, 0, TAU);
    ctx.stroke();
    if (!ring) draw.disc(ctx, 0, 0, 4, THEME.chalk);
    ctx.restore();
  }

  drawStick(p) {
    const ctx = this.ctx;
    let angle = p.aim + 1.0 + 0.6 * p.charge;
    if (p.swT > 0) angle = p.aim + 1.2 - 2.6 * (1 - p.swT / SUMO.swingTime);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(angle);
    const x0 = SUMO.radius - 6;
    const len = SUMO.stickLength + 6;
    const w = SUMO.stickWidth;
    ctx.fillStyle = THEME.post;
    ctx.fillRect(x0, -w / 2, len, w);
    ctx.lineWidth = THEME.outline;
    ctx.strokeStyle = THEME.postLine;
    ctx.strokeRect(x0, -w / 2, len, w);
    ctx.restore();
  }

  // Scoreboard: one chip per player with their round wins; players who are out are dimmed.
  drawHud(v) {
    const ctx = this.ctx;
    const list = [...v.players].sort((a, b) => a.idx - b.idx);
    const chipW = 52;
    const h = 44;
    const w = list.length * chipW + 12;
    const x0 = this.stage.w / 2 - w / 2;
    const y = 10;
    ctx.fillStyle = THEME.hud;
    draw.roundRect(ctx, x0, y, w, h, 10);
    ctx.fill();
    list.forEach((p, i) => {
      const c = this.color(p.idx);
      const cx = x0 + 6 + i * chipW + 16;
      ctx.globalAlpha = p.state === PS.alive || v.st === ST.countdown ? 1 : 0.35;
      draw.disc(ctx, cx, y + h / 2, 9, c.main, c.dark);
      ctx.fillStyle = THEME.white;
      ctx.font = draw.font(800, 20);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(p.wins), cx + 14, y + h / 2 + 1);
      ctx.globalAlpha = 1;
    });

    const cx = this.stage.w / 2;
    const cy = this.stage.cam.sy;
    if (v.st === ST.countdown) {
      const n = Math.max(1, Math.ceil(v.tm));
      const frac = v.tm - Math.floor(v.tm);
      ctx.font = draw.font(700, 22);
      ctx.fillStyle = THEME.white;
      ctx.textAlign = 'center';
      ctx.fillText(`ROUND ${v.rd}`, cx, cy - 80);
      draw.bigText(ctx, String(n), cx, cy, 90 + frac * 30, THEME.white);
    }
    this.banner.draw(ctx, cx, cy - 20);
  }
}
