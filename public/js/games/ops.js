import { THEME, COLORS } from '../../shared/theme.js';
import { OPS, GUNS, GUN_IDS, LADDER, POWERS, POWER_IDS, MAPS, stepGun, currentGun, lightOf } from '../../shared/ops.js';
import { stepWalker } from '../../shared/walker.js';
import { rayBlocks, rayBlocksHit } from '../../shared/world.js';
import { DT } from '../../shared/loop.js';
import * as draw from '../draw.js';
import { drawFloor, drawBlocks } from '../world-draw.js';
import { ArenaView, ST, HUD_H, lerp, lerpAngle } from './arena.js';

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
const GUN_CODE = GUN_IDS;
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
    this.blips = [];
    this.slashes = [];
    this.decoys = [];
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
    me.fl = (s.inf ? 1 : 0) | (s.stunT > 0 ? 2 : 0) | (s.pow === 'cloak' ? 4 : 0);
  }

  update(s, dt) {
    this.dt = dt;
    super.update(s, dt);
    // Decoys slide between snapshots like players.
    const prev = new Map((s.a.d || []).map((d) => [d[0], d]));
    this.decoys = (s.b.d || []).map((d) => {
      const a = prev.get(d[0]) || d;
      return { owner: d[1], x: lerp(a[2], d[2], s.t), y: lerp(a[3], d[3], s.t), aim: lerpAngle(a[4], d[4], s.t), gun: d[5] };
    });
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
    const light = new Path2D();
    const s = this.pred.state;
    if (this.mePos && s) {
      const { x, y } = this.mePos;
      const { cone, range } = lightOf(s);
      light.moveTo(x, y);
      for (const [px, py] of lightPoints(x, y, s.aim - cone, s.aim + cone, range, map.blocks, 48)) light.lineTo(px, py);
      light.closePath();
      this.addCircleLight(light, x, y, OPS.near, map);
    }
    // Flares light their area for everyone.
    for (const [fx, fy] of v.x[4]) this.addCircleLight(light, fx, fy, POWERS.flare.radius, map);
    this.drawDarkness(light);
  }

  addCircleLight(path, x, y, r, map) {
    lightPoints(x, y, 0, TAU, r, map.blocks, 56).forEach(([px, py], i) => (i ? path.lineTo(px, py) : path.moveTo(px, py)));
    path.closePath();
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
      g.fillStyle = '#000';
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
    const ids = v.x[5];
    if (ids.length) {
      map.items.forEach(([x, y], i) => {
        draw.disc(ctx, x, y, 24, THEME.seam, THEME.ink, 2.5);
        draw.disc(ctx, x, y, 15, null, THEME.decal, 4);
        if (v.x[1] & (1 << i)) gunIcon(x, y, ids[i]);
      });
    }
    for (const [x, y, c] of v.x[2]) gunIcon(x, y, GUN_CODE[c]);
  }

  drawPlayer(p, isMe) {
    const ctx = this.ctx;
    const inf = p.fl & 1;
    const cloaked = isMe ? this.pred.state && this.pred.state.pow === 'cloak' : p.fl & 4;
    if (cloaked) ctx.globalAlpha = 0.45;
    if (!inf && p.gun >= 0) {
      const g = GUNS[GUN_CODE[p.gun]];
      draw.held(ctx, p.x, p.y, p.aim, OPS.radius - 6, g.len + 6, g.w);
    }
    const color = this.bodyColor(p.idx);
    draw.player(ctx, p.x, p.y, OPS.radius, color, p.aim, isMe, inf ? INFECTED : color.main);
    if (p.fl & 2) draw.disc(ctx, p.x, p.y, OPS.radius + 5, null, THEME.white, 2);
    if (!isMe && !inf && p.hp < OPS.hp) draw.bar(ctx, p.x, p.y + OPS.radius + 9, p.hp / OPS.hp, THEME.danger);
    ctx.globalAlpha = 1;
  }

  // segs: [[x0, y0, x1, y1], ...] from the shooter outwards (a ricochet adds a second one).
  addShot(segs, id) {
    const now = performance.now() / 1000;
    const len = OPS.radius + GUNS[id].len;
    let flash = null;
    const [ox, oy] = segs[0] || [0, 0];
    for (const [x0, y0, x1, y1] of segs) {
      const a = Math.atan2(y1 - y0, x1 - x0);
      // Every pellet starts at the shooter; a ricochet's second stretch starts at the wall.
      const fromGun = Math.abs(x0 - ox) < 1 && Math.abs(y0 - oy) < 1;
      const sx = fromGun ? x0 + Math.cos(a) * len : x0;
      const sy = fromGun ? y0 + Math.sin(a) * len : y0;
      this.tracers.push({ x: sx, y: sy, x2: x1, y2: y1, t0: now });
      if (!flash) flash = { x: sx, y: sy, a, t0: now };
    }
    if (flash) this.flashes.push(flash);
  }

  // Our own shots show at once; the server still decides what they hit.
  localShot(s, id, map) {
    const g = GUNS[id];
    if (g.melee) {
      this.slashes.push({ x: s.x, y: s.y, a: s.aim, t0: performance.now() / 1000, idx: this.me });
      return;
    }
    const segs = [];
    const bounces = s.pow === 'ricochet' && s.powT > 0 ? 1 : 0;
    const pos = this.mePos || s;
    for (let i = 0; i < g.pellets; i++) {
      let a = s.aim + (g.pellets > 1 ? (i / (g.pellets - 1) - 0.5) * 2 * g.spread : 0);
      let x = pos.x;
      let y = pos.y;
      let left = g.range;
      for (let b = 0; b <= bounces && left > 0; b++) {
        const dx = Math.cos(a);
        const dy = Math.sin(a);
        const w = rayBlocksHit(x, y, dx, dy, left, map.blocks);
        segs.push([x, y, x + dx * w.t, y + dy * w.t]);
        if (w.t >= left) break;
        x += dx * (w.t - 0.5);
        y += dy * (w.t - 0.5);
        left -= w.t;
        const dot = dx * w.nx + dy * w.ny;
        a = Math.atan2(dy - 2 * dot * w.ny, dx - 2 * dot * w.nx);
      }
    }
    this.addShot(segs, id);
  }

  gameEvent(ev) {
    const now = performance.now() / 1000;
    if (ev.k === 'shot' && ev.p !== this.me) this.addShot(ev.s, GUN_CODE[ev.g]);
    else if (ev.k === 'slash' && ev.p !== this.me) this.slashes.push({ x: ev.x, y: ev.y, a: ev.a, t0: now, idx: ev.p });
    else if (ev.k === 'radar') for (const [x, y] of ev.pts) this.blips.push({ x, y, t0: now });
    else if (ev.k === 'power') this.banner.show(POWERS[ev.type].name.toUpperCase(), POWERS[ev.type].color, 1.2);
    else if (ev.k === 'pop') {
      this.fx.ring(ev.x, ev.y, POWERS.decoy.color, 8, 40, 0.35, 4);
      this.fx.splat(ev.x, ev.y, POWERS.decoy.color, 8, Math.random() * 6, 3);
    } else if (ev.k === 'flare') this.fx.ring(ev.x, ev.y, POWERS.flare.color, 10, POWERS.flare.radius, 0.6, 5);
    else if (ev.k === 'level' && ev.p === this.me) this.banner.show(GUNS[LADDER[Math.min(ev.l, LADDER.length - 1)]].name.toUpperCase(), THEME.accent, 1.2);
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

  // Power-up crates glow through the dark so people can find (and fight over) them.
  drawCrates(v) {
    const ctx = this.ctx;
    const now = performance.now() / 1000;
    for (const [id, x, y, type] of v.x[3]) {
      const def = POWERS[POWER_IDS[type]];
      const pulse = 0.5 + 0.5 * Math.sin(now * 4 + id);
      ctx.globalAlpha = 0.18 + 0.12 * pulse;
      draw.disc(ctx, x, y, 34 + pulse * 8, def.color);
      ctx.globalAlpha = 0.3;
      draw.disc(ctx, x, y, 22, def.color);
      ctx.globalAlpha = 1;
      const s = 13;
      ctx.fillStyle = def.color;
      ctx.fillRect(x - s, y - s, s * 2, s * 2);
      ctx.strokeStyle = THEME.ink;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x - s, y - s, s * 2, s * 2);
      ctx.fillStyle = THEME.white;
      ctx.fillRect(x - s + 5, y - 2, s * 2 - 10, 4);
      ctx.fillRect(x - 2, y - s + 5, 4, s * 2 - 10);
    }
    // Lit flares: a red stick with a white spark.
    for (const [x, y] of v.x[4]) {
      draw.held(ctx, x, y, -0.6, -9, 18, 6, POWERS.flare.color);
      draw.disc(ctx, x + 6, y - 6, 4 + Math.random() * 2, THEME.white);
    }
  }

  drawAbove(v) {
    const ctx = this.ctx;
    const now = performance.now() / 1000;
    this.drawCrates(v);
    // Decoys look just like their owner.
    for (const d of this.decoys) {
      const r = this.roster.get(d.owner);
      if (!r) continue;
      const mine = d.owner === this.me;
      if (mine) ctx.globalAlpha = 0.5;
      if (d.gun >= 0) draw.held(ctx, d.x, d.y, d.aim, OPS.radius - 6, GUNS[GUN_CODE[d.gun]].len + 6, GUNS[GUN_CODE[d.gun]].w);
      draw.player(ctx, d.x, d.y, OPS.radius, this.bodyColor(d.owner), d.aim, false);
      draw.nameTag(ctx, d.x, d.y, OPS.radius, r.name);
      ctx.globalAlpha = 1;
    }
    // Knife swipes.
    for (const sl of this.slashes) {
      const k = (now - sl.t0) / 0.15;
      if (k > 1) continue;
      ctx.globalAlpha = 1 - k;
      ctx.lineWidth = 6;
      ctx.strokeStyle = THEME.white;
      ctx.beginPath();
      ctx.arc(sl.x, sl.y, OPS.radius + 26, sl.a - 1 + k * 0.3, sl.a + 1 - (1 - k) * 0.3);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    this.slashes = this.slashes.filter((sl) => now - sl.t0 < 0.15);
    // Radar blips, shown through the dark for a moment.
    for (const b of this.blips) {
      const k = (now - b.t0) / POWERS.radar.show;
      ctx.globalAlpha = 1 - k;
      draw.disc(ctx, b.x, b.y, 10, POWERS.radar.color, THEME.ink, 2);
      draw.disc(ctx, b.x, b.y, 14 + k * 30, null, POWERS.radar.color, 3);
    }
    ctx.globalAlpha = 1;
    this.blips = this.blips.filter((b) => now - b.t0 < POWERS.radar.show);
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
    } else if (this.init.mode === 'gungame') {
      this.scoreCard(['GUN GAME', `${LADDER.length} GUNS`], rows.map((r) => ({ color: this.color(r[0]).main, value: r[7] + 1 })));
    } else {
      this.scoreCard(['FIRST TO', String(this.init.killTarget)], rows.map((r) => ({ color: this.color(r[0]).main, value: r[1] })));
    }
    const left = Math.max(0, Math.ceil(this.init.time - v.rt));
    draw.bigText(this.ctx, `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, this.stage.w / 2, 88, 22, left <= 10 ? THEME.accent : THEME.white);
  }

  // Gun Game: the ladder of guns along the bottom, with ours highlighted.
  drawLadder(W, H) {
    const ctx = this.ctx;
    const row = this.board.find((k) => k[0] === this.me);
    const level = row ? row[7] : 0;
    const w = LADDER.length * 46 + 12;
    const x0 = W / 2 - w / 2;
    const y = H - 52;
    ctx.fillStyle = THEME.card;
    draw.roundRect(ctx, x0, y, w, 38, 12);
    ctx.fill();
    ctx.lineWidth = THEME.outline;
    ctx.strokeStyle = THEME.ink;
    ctx.stroke();
    LADDER.forEach((id, i) => {
      const cx = x0 + 6 + i * 46 + 23;
      if (i === level) {
        ctx.fillStyle = THEME.accent;
        draw.roundRect(ctx, cx - 21, y + 4, 42, 30, 8);
        ctx.fill();
      }
      ctx.globalAlpha = i < level ? 0.35 : 1;
      const g = GUNS[id];
      draw.held(ctx, cx - g.len / 2 - 3, y + 19, 0, 0, Math.max(10, g.len * 0.9), Math.max(4, g.w - 2));
      ctx.globalAlpha = 1;
    });
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
      // Active power-up and how long it has left.
      if (s.pow && s.powT > 0) {
        const def = POWERS[s.pow];
        panel(16, H - 98, 220, 32);
        ctx.fillStyle = def.color;
        ctx.fillRect(28, H - 87, 196 * (s.powT / def.time), 10);
        ctx.strokeStyle = THEME.ink;
        ctx.lineWidth = 2;
        ctx.strokeRect(28, H - 87, 196, 10);
        ctx.fillStyle = THEME.ink;
        ctx.font = draw.font(700, 12);
        ctx.textAlign = 'left';
        ctx.fillText(def.name.toUpperCase(), 30, H - 104);
      }
    }
    if (this.init.mode === 'gungame') this.drawLadder(W, H);
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
