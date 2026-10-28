import { THEME, COLORS } from '../../shared/theme.js';
import { Predictor } from '../net.js';
import * as draw from '../draw.js';

// Shared base for the browser side of round-based games: interpolation, own-player prediction,
// players, HUD chips, countdown and banners. Snapshot player rows are [idx, x, y, aim, state, wins, ...extra].

export const ST = { countdown: 0, playing: 1, roundEnd: 2, over: 3 };
export const PS = { alive: 0, fall: 1, out: 2, wait: 3, dead: 4 };
export const HUD_H = 72;
export const lerp = (a, b, t) => a + (b - a) * t;
export const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

export class ArenaView {
  constructor(stage, init = {}) {
    this.stage = stage;
    this.ctx = stage.ctx;
    this.init = init;
    this.fx = new draw.Effects();
    this.banner = new draw.Banner();
    this.view = null;
    this.mePos = null;
    this.roster = new Map();
    this.me = -1;
    this.radius = 16;
    this.pred = new Predictor((s, cmd, replay) => this.stepMe(s, cmd, replay));
  }

  // ---- hooks for each game ----
  stepMe() {}
  meContext() {
    return {};
  }
  unpack() {
    return {};
  }
  applyMe() {}
  camera() {
    this.stage.fit(500, HUD_H);
  }
  drawWorld() {}
  drawPlayer(p, isMe, r) {
    draw.player(this.ctx, p.x, p.y, this.radius, COLORS[r.color], p.aim, isMe);
  }
  drawAbove() {}
  gameEvent() {}
  drawHud() {}
  chipValue(p) {
    return p.wins;
  }

  // ---- shared ----
  setRoster(roster, meIdx) {
    this.roster = new Map(roster.map((r) => [r.idx, r]));
    this.me = meIdx;
  }

  color(idx) {
    const r = this.roster.get(idx);
    return COLORS[r ? r.color : 0];
  }

  name(idx) {
    return (this.roster.get(idx) || { name: '?' }).name;
  }

  player(idx) {
    return this.view && this.view.players.find((q) => q.idx === idx);
  }

  onSnap(snap) {
    if (snap.me) this.pred.reconcile({ ...snap.me, ...this.meContext(snap) });
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
      rd: src.rd,
      x: b.x,
      xa: a.x, // previous world state and blend, for games that interpolate their own things
      t,
      players: b.p.map((pb) => {
        const pa = prev.get(pb[0]) || pb;
        return {
          idx: pb[0], x: lerp(pa[1], pb[1], t), y: lerp(pa[2], pb[2], t), aim: lerpAngle(pa[3], pb[3], t),
          state: pb[4], wins: pb[5], ...this.unpack(pa, pb, t),
        };
      }),
    };
    this.mePos = null;
    const me = this.player(this.me);
    if (me && me.state === PS.alive && this.pred.state) {
      const s = this.pred.state;
      Object.assign(me, this.pred.pos(dt), { aim: s.aim });
      this.applyMe(me, s);
      this.mePos = { x: me.x, y: me.y };
    }
  }

  onEvent(ev) {
    const v = this.view;
    if (ev.k === 'go') this.banner.show('GO!', THEME.accent, 0.8);
    else if (ev.k === 'win') this.banner.show(`${this.name(ev.p).toUpperCase()} WINS`, this.color(ev.p).main, 2.2);
    else if (ev.k === 'draw') this.banner.show('DRAW', THEME.white, 2.2);
    else this.gameEvent(ev, v);
  }

  draw() {
    const v = this.view;
    const ctx = this.ctx;
    this.stage.clear();
    if (!v) return;
    this.camera(v);
    this.stage.world();
    this.drawWorld(v);
    if (!this.ownSplats) this.fx.drawSplats(ctx);
    for (const p of v.players) {
      if (p.state !== PS.alive) continue;
      const r = this.roster.get(p.idx);
      if (r) this.drawPlayer(p, p.idx === this.me, r);
    }
    for (const p of v.players) {
      const r = this.roster.get(p.idx);
      if (p.state === PS.alive && r) draw.nameTag(ctx, p.x, p.y, this.radius, r.name);
    }
    this.drawAbove(v);
    this.fx.drawRings(ctx);
    this.stage.screen();
    this.drawChips(v);
    this.drawHud(v);
    const cx = this.stage.w / 2;
    const cy = this.stage.h / 2 + HUD_H / 2;
    if (v.st === ST.countdown) {
      const n = Math.max(1, Math.ceil(v.tm));
      const frac = v.tm - Math.floor(v.tm);
      draw.bigText(ctx, `ROUND ${v.rd}`, cx, cy - 90, 28, THEME.white);
      draw.bigText(ctx, String(n), cx, cy, 90 + frac * 30, THEME.white);
    }
    this.banner.draw(ctx, cx, cy - 20);
    if (this.acting && this.input && this.input.mouse.seen) draw.crosshair(ctx, this.input.mouse.x, this.input.mouse.y);
  }

  // Scoreboard: what it takes to win, then one chip per player with their wins (or points),
  // and this round's score underneath for games that have one. Players who are out are dimmed.
  drawChips(v) {
    const list = [...v.players].sort((a, b) => a.idx - b.idx);
    const label = this.init.scoring === 'points' ? ['ROUND', `${Math.min(v.rd, this.init.target)}/${this.init.target}`] : ['FIRST TO', String(this.init.target)];
    this.scoreCard(label, list.map((p) => ({
      color: this.color(p.idx).main,
      value: this.chipValue(p),
      sub: this.roundScore ? this.roundScore(p) : null,
      dim: !(p.state === PS.alive || v.st === ST.countdown),
    })));
  }

  scoreCard(label, chips) {
    const ctx = this.ctx;
    const chipW = 56;
    const labelW = 84;
    const subs = chips.some((c) => c.sub !== null && c.sub !== undefined);
    const h = subs ? 60 : 48;
    const w = labelW + chips.length * chipW + 10;
    const x0 = this.stage.w / 2 - w / 2;
    const y = 10;
    ctx.fillStyle = THEME.card;
    draw.roundRect(ctx, x0, y, w, h, 14);
    ctx.fill();
    ctx.lineWidth = THEME.outline;
    ctx.strokeStyle = THEME.ink;
    ctx.stroke();
    ctx.fillStyle = THEME.button;
    draw.roundRect(ctx, x0, y, labelW, h, [14, 0, 0, 14]);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = THEME.accent;
    ctx.font = draw.font(600, 11);
    ctx.fillText(label[0], x0 + labelW / 2, y + h / 2 - 10);
    ctx.font = draw.font(700, 20);
    ctx.fillText(label[1], x0 + labelW / 2, y + h / 2 + 9);
    chips.forEach((c, i) => {
      const cx = x0 + labelW + 8 + i * chipW + 16;
      const cy = y + (subs ? 22 : h / 2);
      ctx.globalAlpha = c.dim ? 0.35 : 1;
      draw.disc(ctx, cx, cy, 10, c.color, THEME.ink, 2.5);
      ctx.fillStyle = THEME.ink;
      ctx.font = draw.font(700, 20);
      ctx.textAlign = 'left';
      ctx.fillText(String(c.value), cx + 15, cy + 1);
      if (subs && c.sub !== null && c.sub !== undefined) {
        ctx.font = draw.font(600, 12);
        ctx.fillStyle = THEME.inkSoft;
        ctx.textAlign = 'center';
        ctx.fillText(String(c.sub), cx + 10, y + h - 12);
      }
      ctx.globalAlpha = 1;
    });
  }
}
