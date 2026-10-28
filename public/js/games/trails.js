import { THEME } from '../../shared/theme.js';
import { TRAILS, TRAIL_MAPS, TRAIL_MAP_IDS, TRAIL_POWERS, TRAIL_POWER_IDS, trailBounds, trailPen, stepTrail } from '../../shared/minis.js';
import * as draw from '../draw.js';
import { drawFloor, drawBlocks } from '../world-draw.js';
import { ArenaView, ST, PS, HUD_H } from './arena.js';

export const name = 'Light Trails';
export const controls = [['Steer', 'Mouse (or A / D)'], ['Boost', 'Space'], ['Use power-up', 'Click']];

const PORTAL_COLORS = ['#4fd1ff', '#ffb347'];
const CUT_HOLD = 0.4; // seconds a cut keeps erasing points that are still arriving

export class Game extends ArenaView {
  constructor(stage, init) {
    super(stage, init);
    this.radius = 11;
    this.trails = new Map();
    this.tps = new Map();
    this.cuts = [];
    this.round = -1;
    this.shrinkSeen = false;
  }

  get map() {
    return TRAIL_MAPS[TRAIL_MAP_IDS[this.mapIdx]] || TRAIL_MAPS.grid;
  }

  onSnap(snap) {
    this.mapIdx = snap.x[0];
    super.onSnap(snap);
  }

  stepMe(s, cmd) {
    stepTrail(s, cmd, s.frozen, this.map);
  }

  meContext(snap) {
    return { frozen: snap.st === ST.countdown || snap.st === ST.over };
  }

  unpack(pa, pb) {
    const f = pb[6];
    const o = { boost: f & 1, pen: (f & 2) !== 0, ghost: (f & 4) !== 0, scr: (f & 8) !== 0, hopT: pb[7], tp: pb[8], held: TRAIL_POWER_IDS[pb[9]] || '' };
    if (pa[8] !== pb[8]) Object.assign(o, { x: pb[1], y: pb[2] }); // went through a portal: don't slide across the map
    return o;
  }

  applyMe(me, s) {
    Object.assign(me, { pen: trailPen(s), tp: s.tp, hopT: s.hopT, ghost: s.ghostT > 0, scr: s.revT > 0, held: s.held });
  }

  // Trails are rebuilt from where each player has been drawn; null breaks a line.
  update(s, dt) {
    super.update(s, dt);
    const v = this.view;
    if (v.rd !== this.round) {
      this.round = v.rd;
      this.trails = new Map();
      this.tps = new Map();
      this.cuts = [];
      this.shrinkSeen = false;
    }
    if (v.st === ST.countdown) return;
    if (!this.shrinkSeen && v.st === ST.playing && v.rt >= TRAILS.shrinkAt) {
      this.shrinkSeen = true;
      this.banner.show('WALLS CLOSING IN', THEME.accent, 1.6);
    }
    const now = performance.now() / 1000;
    this.cuts = this.cuts.filter((c) => now - c.t0 < CUT_HOLD);
    for (const p of v.players) {
      if (p.state !== PS.alive) continue;
      const t = this.trails.get(p.idx) || [];
      this.trails.set(p.idx, t);
      if (this.tps.has(p.idx) && this.tps.get(p.idx) !== p.tp && t[t.length - 1]) t.push(null);
      this.tps.set(p.idx, p.tp);
      const last = t[t.length - 1];
      const cut = this.cuts.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < c.r);
      if (!p.pen || cut) {
        if (last && !cut) t.push([p.x, p.y]);
        if (t[t.length - 1]) t.push(null);
      } else if (!last || Math.hypot(last[0] - p.x, last[1] - p.y) > 6) t.push([p.x, p.y]);
    }
  }

  camera() {
    this.stage.fitRect(0, 0, TRAILS.w, TRAILS.h, HUD_H);
  }

  drawWorld(v) {
    const ctx = this.ctx;
    const map = this.map;
    const now = performance.now() / 1000;
    drawFloor(ctx, map);
    // Portals: a dark well with a turning ring, one colour per pair.
    map.portals.forEach(([ax, ay, bx, by], i) => {
      for (const [x, y] of [[ax, ay], [bx, by]]) {
        const c = PORTAL_COLORS[i % PORTAL_COLORS.length];
        ctx.globalAlpha = 0.25;
        draw.disc(ctx, x, y, TRAILS.portalR + 16 + Math.sin(now * 3) * 3, c);
        ctx.globalAlpha = 1;
        draw.disc(ctx, x, y, TRAILS.portalR + 4, THEME.void, THEME.ink);
        ctx.lineWidth = 4;
        ctx.strokeStyle = c;
        for (let k = 0; k < 3; k++) {
          const a = now * 2.5 + (k * Math.PI * 2) / 3;
          ctx.beginPath();
          ctx.arc(x, y, TRAILS.portalR - 4, a, a + 1.3);
          ctx.stroke();
        }
        draw.disc(ctx, x, y, 6, c);
      }
    });
    this.drawTrails();
    drawBlocks(ctx, [...map.blocks, ...map.pylons.map(([x, y, r]) => [x - r, y - r, r * 2, r * 2, 'tank'])]);
    for (const [id, x, y, type] of v.x[1]) draw.crate(ctx, x, y, TRAIL_POWERS[TRAIL_POWER_IDS[type]].color, id);
    this.drawClosingWalls(trailBounds(v.rt));
  }

  // Neon trails: navy outline, the player's colour, a pale core.
  drawTrails() {
    const ctx = this.ctx;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [w, pick, alpha] of [[12, () => THEME.ink, 1], [6, (idx) => this.color(idx).main, 1], [2, () => THEME.white, 0.55]]) {
      ctx.lineWidth = w;
      ctx.globalAlpha = alpha;
      for (const [idx, t] of this.trails) {
        ctx.strokeStyle = pick(idx);
        ctx.beginPath();
        let open = false;
        for (const pt of t) {
          if (!pt) open = false;
          else if (open) ctx.lineTo(pt[0], pt[1]);
          else {
            ctx.moveTo(pt[0], pt[1]);
            open = true;
          }
        }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.lineCap = 'butt';
  }

  // Outside the open area is solid wall; a hazard strip marks the moving edge.
  drawClosingWalls(b) {
    if (b.k <= 0) return;
    const ctx = this.ctx;
    const W = TRAILS.w;
    const H = TRAILS.h;
    ctx.fillStyle = THEME.wallTop;
    ctx.fillRect(0, 0, W, b.y0);
    ctx.fillRect(0, b.y1, W, H - b.y1);
    ctx.fillRect(0, b.y0, b.x0, b.y1 - b.y0);
    ctx.fillRect(b.x1, b.y0, W - b.x1, b.y1 - b.y0);
    const s = 12;
    draw.hazard(ctx, b.x0 - s, b.y0 - s, b.x1 - b.x0 + s * 2, s);
    draw.hazard(ctx, b.x0 - s, b.y1, b.x1 - b.x0 + s * 2, s);
    draw.hazard(ctx, b.x0 - s, b.y0, s, b.y1 - b.y0);
    draw.hazard(ctx, b.x1, b.y0, s, b.y1 - b.y0);
    ctx.lineWidth = THEME.outline;
    ctx.strokeStyle = THEME.ink;
    ctx.strokeRect(b.x0 - s, b.y0 - s, b.x1 - b.x0 + s * 2, b.y1 - b.y0 + s * 2);
    ctx.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
  }

  drawPlayer(p, isMe) {
    const ctx = this.ctx;
    const lift = p.hopT > 0 ? Math.sin((p.hopT / TRAIL_POWERS.hop.time) * Math.PI) : 0;
    if (lift > 0) {
      ctx.globalAlpha = 0.3;
      draw.disc(ctx, p.x + 4, p.y + 6, this.radius, THEME.ink);
      ctx.globalAlpha = 1;
    }
    const y = p.y - lift * 14;
    const r = this.radius * (1 + lift * 0.35);
    if (p.ghost) ctx.globalAlpha = 0.45;
    if (p.boost) draw.disc(ctx, p.x, y, r + 6, null, THEME.accent, 3);
    draw.player(ctx, p.x, y, r, this.color(p.idx), p.aim, isMe);
    ctx.globalAlpha = 1;
    // Scrambled: a pink swirl round the head.
    if (p.scr) {
      const a = performance.now() / 150;
      ctx.lineWidth = 3;
      ctx.strokeStyle = TRAIL_POWERS.scramble.color;
      ctx.beginPath();
      ctx.arc(p.x, y, r + 7, a, a + 1.8);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, y, r + 7, a + Math.PI, a + Math.PI + 1.8);
      ctx.stroke();
    }
    // Holding a power-up: a little crate floating beside you.
    if (p.held) {
      const c = TRAIL_POWERS[p.held].color;
      ctx.fillStyle = c;
      ctx.fillRect(p.x + r + 2, y - r - 10, 10, 10);
      ctx.strokeStyle = THEME.ink;
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x + r + 2, y - r - 10, 10, 10);
    }
    if (isMe && this.pred.state) draw.bar(ctx, p.x, p.y + this.radius + 10, 1 - this.pred.state.boostCd / TRAILS.boostCd);
  }

  drawHud() {
    const s = this.pred.state;
    if (s && s.held) draw.heldPower(this.ctx, this.stage.h, TRAIL_POWERS[s.held].name, TRAIL_POWERS[s.held].color);
  }

  gameEvent(ev) {
    if (ev.k === 'crash') {
      this.fx.ring(ev.x, ev.y, THEME.white, 10, 40, 0.35, 5);
      this.fx.splat(ev.x, ev.y, this.color(ev.p).main, 14, Math.random() * 6, 8);
    } else if (ev.k === 'cut') {
      this.cuts.push({ x: ev.x, y: ev.y, r: ev.r, t0: performance.now() / 1000 });
      for (const t of this.trails.values()) {
        for (let i = 0; i < t.length; i++) if (t[i] && Math.hypot(t[i][0] - ev.x, t[i][1] - ev.y) < ev.r) t[i] = null;
      }
      this.fx.ring(ev.x, ev.y, TRAIL_POWERS.cutter.color, 10, ev.r, 0.35, 6);
    } else if (ev.k === 'grab') {
      this.fx.ring(ev.x, ev.y, TRAIL_POWERS[ev.w].color, 14, 44, 0.3, 4);
    } else if (ev.k === 'power') {
      const q = this.player(ev.p);
      if (q && ev.w !== 'cutter') this.fx.ring(q.x, q.y, TRAIL_POWERS[ev.w].color, this.radius, ev.w === 'scramble' ? 200 : 40, 0.35, 4);
    }
  }
}
