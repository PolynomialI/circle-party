import { THEME, COLORS } from '../../shared/theme.js';
import { OPS, GUNS, MAPS, stepGun, currentGun } from '../../shared/ops.js';
import { stepWalker } from '../../shared/walker.js';
import { rayBlocks } from '../../shared/world.js';
import { DT } from '../../shared/loop.js';
import * as draw from '../draw.js';
import { drawFloor, drawBlocks } from '../world-draw.js';
import { ArenaView, ST, HUD_H } from './arena.js';

export const name = 'Dark Ops';
export const controls = [
  ['Move', 'W A S D'],
  ['Aim', 'Mouse'],
  ['Shoot', 'Left click'],
  ['Reload', 'R'],
  ['Switch gun', 'Q'],
  ['Pick up gun', 'E'],
];

const TAU = Math.PI * 2;
const GUN_CODE = ['pistol', 'smg', 'shotgun', 'rifle'];
const WALK_OPTS = { speed: OPS.speed, dash: false, radius: OPS.radius };
const INFECTED = '#86b85f';

// Points where rays from (x, y) between angles a0 and a1 stop, a little way into walls so
// lit wall faces show. Rays aim at every nearby wall corner so shadows have sharp edges.
function lightPoints(x, y, a0, a1, range, blocks, steps) {
  const near = blocks.filter(([bx, by, bw, bh]) => bx < x + range && bx + bw > x - range && by < y + range && by + bh > y - range);
  const span = a1 - a0;
  const angles = [];
  for (let i = 0; i <= steps; i++) angles.push(a0 + (span * i) / steps);
  for (const [bx, by, bw, bh] of near) {
    for (const [cx, cy] of [[bx, by], [bx + bw, by], [bx, by + bh], [bx + bw, by + bh]]) {
      const a = Math.atan2(cy - y, cx - x);
      for (const e of [-0.002, 0.002]) {
        const rel = ((((a + e - a0) % TAU) + TAU) % TAU);
        if (rel < span) angles.push(a0 + rel);
      }
    }
  }
  angles.sort((p, q) => p - q);
  return angles.map((a) => {
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let d = rayBlocks(x, y, dx, dy, range, near);
    if (d < range) d = Math.min(range, d + 16);
    return [x + dx * d, y + dy * d];
  });
}

export class Game extends ArenaView {
  constructor(stage, init) {
    super(stage, init);
    this.radius = OPS.radius;
    this.ownSplats = true;
    this.darkCanvas = document.createElement('canvas');
    this.cam = null;
    this.lastPos = null;
    this.feed = [];
    this.tracers = [];
    this.flashes = [];
    this.board = [];
    this.deadT = 0;
    this.dt = 0;
  }

  get map() {
    return this.view ? MAPS[this.view.x[0]] : null;
  }

  stepMe(s, cmd, replay) {
    const map = MAPS[s.map];
    s.stunT = Math.max(0, s.stunT - DT);
    stepWalker(s, s.stunT > 0 ? { ...cmd, mx: 0, my: 0 } : cmd, map, WALK_OPTS, s.frozen);
    if (s.inf) return;
    const fired = stepGun(s, cmd, s.frozen);
    if (fired && !replay) this.localShot(s, fired, map);
  }

  meContext(snap) {
    return { map: snap.x[0], frozen: snap.st === ST.countdown || snap.st === ST.over };
  }

  onSnap(snap) {
    super.onSnap(snap);
    this.board = snap.k;
    this.deadT = snap.dead || 0;
  }

  unpack(pa, pb) {
    return { hp: pb[6], gun: pb[7], fl: pb[8] };
  }

  applyMe(me, s) {
    me.hp = s.hp;
    me.gun = s.inf ? -1 : GUN_CODE.indexOf(currentGun(s));
    me.fl = (s.inf ? 1 : 0) | (s.stunT > 0 ? 2 : 0);
  }

  update(s, dt) {
    this.dt = dt;
    super.update(s, dt);
  }

  team(idx) {
    const row = this.board.find((k) => k[0] === idx);
    return row ? row[3] : 0;
  }

  bodyColor(idx) {
    return this.init.mode === 'tdm' ? COLORS[this.team(idx)] : this.color(idx);
  }

  camera(v) {
    const map = this.map;
    if (this.me === -1) {
      this.stage.fitRect(0, 0, map.w, map.h, HUD_H);
      return;
    }
    if (this.mePos) this.lastPos = this.mePos;
    const at = this.lastPos || { x: map.w / 2, y: map.h / 2 };
    let tx = at.x;
    let ty = at.y;
    const zoom = Math.max(this.stage.w, this.stage.h) / OPS.span;
    if (this.mePos && this.input && this.input.mouse.seen) {
      // Lean a little towards where we aim.
      const lx = ((this.input.mouse.x - this.stage.w / 2) / zoom) * 0.25;
      const ly = ((this.input.mouse.y - this.stage.h / 2) / zoom) * 0.25;
      const k = Math.min(1, 160 / (Math.hypot(lx, ly) || 1));
      tx += lx * k;
      ty += ly * k;
    }
    if (!this.cam || Math.hypot(tx - this.cam.x, ty - this.cam.y) > 500) this.cam = { x: tx, y: ty };
    const k = 1 - Math.exp(-8 * this.dt);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
    this.stage.follow(this.cam.x, this.cam.y, OPS.span);
  }

  drawWorld(v) {
    const ctx = this.ctx;
    const map = this.map;
    const view = this.stage.viewRect();
    drawFloor(ctx, map, view);
    this.fx.drawSplats(ctx);
    this.drawItems(v, map);
    drawBlocks(ctx, map.blocks, view);
    if (this.me === -1) return;
    let light = null;
    const s = this.pred.state;
    if (this.mePos && s) {
      const { x, y } = this.mePos;
      light = new Path2D();
      light.moveTo(x, y);
      for (const [px, py] of lightPoints(x, y, s.aim - OPS.cone, s.aim + OPS.cone, OPS.range, map.blocks, 40)) light.lineTo(px, py);
      light.closePath();
      lightPoints(x, y, 0, TAU, OPS.near, map.blocks, 48).forEach(([px, py], i) => (i ? light.lineTo(px, py) : light.moveTo(px, py)));
      light.closePath();
    }
    this.drawDarkness(light);
  }

  // Everything outside our light is one flat dark colour.
  drawDarkness(light) {
    const ctx = this.ctx;
    const c = this.darkCanvas;
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = THEME.dark;
    g.fillRect(0, 0, W, H);
    if (light) {
      g.setTransform(ctx.getTransform());
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = '#000';
      g.fill(light);
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(c, 0, 0);
    ctx.restore();
  }

  drawItems(v, map) {
    const ctx = this.ctx;
    const me = this.mePos;
    const gunIcon = (x, y, id) => {
      const g = GUNS[id];
      draw.held(ctx, x, y, -0.5, -g.len / 2 - 4, g.len + 8, g.w + 2);
      if (me && Math.hypot(me.x - x, me.y - y) <= OPS.pickupReach) draw.disc(ctx, x, y, 28, null, THEME.accent, 4);
    };
    map.items.forEach(([x, y, id], i) => {
      draw.disc(ctx, x, y, 24, THEME.seam, THEME.ink, 2.5);
      draw.disc(ctx, x, y, 15, null, THEME.decal, 4);
      if (v.x[1] & (1 << i)) gunIcon(x, y, id);
    });
    for (const [x, y, c] of v.x[2]) gunIcon(x, y, GUN_CODE[c]);
  }

  drawPlayer(p, isMe) {
    const ctx = this.ctx;
    const inf = p.fl & 1;
    if (!inf && p.gun >= 0) {
      const g = GUNS[GUN_CODE[p.gun]];
      draw.held(ctx, p.x, p.y, p.aim, OPS.radius - 6, g.len + 6, g.w);
    }
    const color = this.bodyColor(p.idx);
    draw.player(ctx, p.x, p.y, OPS.radius, color, p.aim, isMe, inf ? INFECTED : color.main);
    if (p.fl & 2) draw.disc(ctx, p.x, p.y, OPS.radius + 5, null, THEME.white, 2);
    if (!isMe && !inf && p.hp < OPS.hp) draw.bar(ctx, p.x, p.y + OPS.radius + 9, p.hp / OPS.hp, THEME.danger);
  }

  addShot(x, y, shots, id) {
    const now = performance.now() / 1000;
    const len = OPS.radius + GUNS[id].len;
    for (const [a, d] of shots) {
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      this.tracers.push({ x: x + dx * len, y: y + dy * len, x2: x + dx * d, y2: y + dy * d, t0: now });
    }
    const a = shots[0][0];
    this.flashes.push({ x: x + Math.cos(a) * len, y: y + Math.sin(a) * len, a, t0: now });
  }

  // Our own shots show at once; the server still decides what they hit.
  localShot(s, id, map) {
    const g = GUNS[id];
    const shots = [];
    for (let i = 0; i < g.pellets; i++) {
      const a = s.aim + (g.pellets > 1 ? (i / (g.pellets - 1) - 0.5) * 2 * g.spread : 0);
      shots.push([a, rayBlocks(s.x, s.y, Math.cos(a), Math.sin(a), g.range, map.blocks)]);
    }
    const pos = this.mePos || s;
    this.addShot(pos.x, pos.y, shots, id);
  }

  gameEvent(ev) {
    const now = performance.now() / 1000;
    if (ev.k === 'shot' && ev.p !== this.me) this.addShot(ev.x, ev.y, ev.s, GUN_CODE[ev.g]);
    else if (ev.k === 'hit') {
      this.fx.splat(ev.x, ev.y, this.bodyColor(ev.v).main, 9, ev.a, 8);
      this.fx.ring(ev.x, ev.y, THEME.white, OPS.radius, OPS.radius + 14, 0.2);
    } else if (ev.k === 'kill' || ev.k === 'infect') {
      this.feed.push({ ...ev, t0: now });
      if (this.feed.length > 5) this.feed.shift();
      if (ev.k === 'infect' && ev.v === this.me) this.banner.show('INFECTED!', INFECTED, 1.6);
    } else if (ev.k === 'survived') {
      this.banner.show(ev.n ? `${ev.n} SURVIVED` : 'ALL INFECTED', ev.n ? THEME.white : INFECTED, 2.2);
    }
  }

  drawAbove() {
    const ctx = this.ctx;
    const now = performance.now() / 1000;
    for (const t of this.tracers) {
      ctx.globalAlpha = Math.max(0, 1 - (now - t.t0) / 0.09);
      for (const [w, c] of [[5, THEME.ink], [2.5, THEME.accent]]) {
        ctx.lineWidth = w;
        ctx.strokeStyle = c;
        ctx.beginPath();
        ctx.moveTo(t.x, t.y);
        ctx.lineTo(t.x2, t.y2);
        ctx.stroke();
      }
    }
    this.tracers = this.tracers.filter((t) => now - t.t0 < 0.09);
    ctx.globalAlpha = 1;
    for (const f of this.flashes) {
      const s = 16 * (1 - (now - f.t0) / 0.07);
      if (s <= 0) continue;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = f.a + (i / 10) * TAU;
        const r = i % 2 ? s * 0.45 : s;
        ctx.lineTo(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fillStyle = THEME.accent;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = THEME.ink;
      ctx.stroke();
      draw.disc(ctx, f.x, f.y, s * 0.35, THEME.white);
    }
    ctx.globalAlpha = 1;
    this.flashes = this.flashes.filter((f) => now - f.t0 < 0.07);
  }

  // Scores for everyone come from the scoreboard, since we only see some players.
  drawChips(v) {
    const rows = [...this.board].sort((a, b) => a[0] - b[0]);
    if (this.init.kind === 'infection') {
      this.scoreCard(['ROUND', `${Math.min(v.rd, this.init.target)}/${this.init.target}`], rows.map((r) => ({
        color: r[6] ? INFECTED : this.color(r[0]).main, value: r[4], dim: !r[5] && v.st !== ST.countdown,
      })));
    } else if (this.init.mode === 'tdm') {
      const score = [0, 0];
      for (const r of rows) if (r[3] === 0 || r[3] === 1) score[r[3]] += r[1];
      this.scoreCard(['FIRST TO', String(this.init.killTarget)], [0, 1].map((t) => ({ color: COLORS[t].main, value: score[t] })));
    } else {
      this.scoreCard(['FIRST TO', String(this.init.killTarget)], rows.map((r) => ({ color: this.color(r[0]).main, value: r[1] })));
    }
    const left = Math.max(0, Math.ceil(this.init.time - v.rt));
    draw.bigText(this.ctx, `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, this.stage.w / 2, 88, 22, left <= 10 ? THEME.accent : THEME.white);
  }

  drawHud(v) {
    const ctx = this.ctx;
    const W = this.stage.w;
    const H = this.stage.h;
    const s = this.pred.state;
    const panel = (x, y, w, h) => {
      ctx.fillStyle = THEME.card;
      draw.roundRect(ctx, x, y, w, h, 12);
      ctx.fill();
      ctx.lineWidth = THEME.outline;
      ctx.strokeStyle = THEME.ink;
      ctx.stroke();
    };
    if (s) {
      // Health, bottom left.
      panel(16, H - 58, 220, 42);
      ctx.fillStyle = THEME.inkSoft;
      ctx.fillRect(28, H - 45, 196, 16);
      ctx.fillStyle = s.inf ? INFECTED : s.hp > 35 ? THEME.good : THEME.danger;
      ctx.fillRect(28, H - 45, 196 * (s.inf ? 1 : Math.max(0, s.hp) / OPS.hp), 16);
      ctx.strokeStyle = THEME.ink;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(28, H - 45, 196, 16);
      if (!s.inf) {
        // Gun and ammo, bottom right.
        const id = currentGun(s);
        const g = GUNS[id];
        const mag = id === 'pistol' ? s.pm : s.mag;
        const res = id === 'pistol' ? '∞' : String(s.res);
        panel(W - 196, H - 58, 180, 42);
        ctx.fillStyle = THEME.ink;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.font = draw.font(600, 15);
        ctx.fillText(g.name, W - 182, H - 37);
        ctx.textAlign = 'right';
        ctx.font = draw.font(700, 22);
        ctx.fillText(`${mag} / ${res}`, W - 30, H - 36);
        if (s.reloadT > 0) {
          ctx.fillStyle = THEME.accent;
          ctx.fillRect(W - 190, H - 22, 168 * (1 - s.reloadT / g.reload), 4);
        }
      }
    }
    if (s && s.inf && s.holdT > 0) draw.bigText(ctx, `RELEASED IN ${Math.ceil(s.holdT)}`, W / 2, H / 2 - 80, 34, INFECTED);
    if (this.me !== -1 && !s && this.deadT > 0 && this.init.kind === 'ops') {
      draw.bigText(ctx, String(Math.ceil(this.deadT)), W / 2, H / 2, 80, THEME.white);
    }
    // Kill feed, top right.
    const now = performance.now() / 1000;
    this.feed = this.feed.filter((f) => now - f.t0 < 5);
    ctx.font = draw.font(600, 14);
    ctx.textBaseline = 'middle';
    this.feed.forEach((f, i) => {
      const y = 20 + i * 30;
      const a = this.name(f.p);
      const b = this.name(f.v);
      const mid = f.k === 'infect' ? ' tagged ' : ' > ';
      const text = `${a}${mid}${b}`;
      const w = ctx.measureText(text).width + 20;
      panel(W - 16 - w, y - 12, w, 24);
      ctx.textAlign = 'left';
      let x = W - 6 - w;
      for (const [part, color] of [[a, this.bodyColor(f.p).dark], [mid, THEME.inkSoft], [b, this.bodyColor(f.v).dark]]) {
        ctx.fillStyle = color;
        ctx.fillText(part, x, y + 1);
        x += ctx.measureText(part).width;
      }
    });
  }
}
