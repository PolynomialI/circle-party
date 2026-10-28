import { THEME } from '../../shared/theme.js';
import { stepWalker } from '../../shared/walker.js';
import { TANK, TANK_WEAPONS, TANK_WEAPON_IDS, BULLET_KINDS, mazeMap, laserPath } from '../../shared/minis.js';
import * as draw from '../draw.js';
import { WalkView } from './walkview.js';
import { lerp } from './arena.js';

export const name = 'Ricochet Tanks';
export const controls = [['Move', 'W A S D'], ['Aim', 'Mouse'], ['Fire', 'Left click']];

const TANK_WALK = { speed: TANK.speed, dash: false, radius: TANK.radius };
const BULLET_LOOK = {
  shell: [TANK.bulletR, THEME.white],
  gatling: [TANK_WEAPONS.gatling.r + 0.5, TANK_WEAPONS.gatling.color],
  frag: [TANK_WEAPONS.frag.r, TANK_WEAPONS.frag.color],
  shard: [3, TANK_WEAPONS.frag.color],
};

export class Game extends WalkView {
  constructor(stage, init) {
    super(stage, init, { walk: TANK_WALK });
    this.beams = [];
  }

  get map() {
    return this.view ? mazeMap(this.view.x[0]) : null;
  }

  stepMe(s, cmd) {
    stepWalker(s, cmd, mazeMap(s.map), TANK_WALK, s.frozen);
  }

  unpack(pa, pb) {
    return { weapon: TANK_WEAPON_IDS[pb[6]] || '' };
  }

  drawAbove(v) {
    const ctx = this.ctx;
    const now = performance.now() / 1000;
    for (const [id, x, y, type] of v.x[2]) draw.crate(ctx, x, y, TANK_WEAPONS[TANK_WEAPON_IDS[type]].color, id);
    // Mines: plain to their owner, hard to spot for everyone else once armed.
    for (const [id, x, y, armed, owner] of v.x[3]) {
      ctx.globalAlpha = owner === this.me || !armed ? 1 : 0.3;
      draw.disc(ctx, x, y, TANK_WEAPONS.mine.r, TANK_WEAPONS.mine.color, THEME.ink, 2.5);
      draw.disc(ctx, x, y, 3.5, armed && Math.sin(now * 8 + id) > 0 ? THEME.danger : THEME.ink);
      ctx.globalAlpha = 1;
    }
    const prev = new Map((v.xa[1] || []).map((b) => [b[0], b]));
    for (const [id, x, y, k] of v.x[1]) {
      const a = prev.get(id);
      const [r, fill] = BULLET_LOOK[BULLET_KINDS[k]] || BULLET_LOOK.shell;
      const bx = a ? lerp(a[1], x, v.t) : x;
      const by = a ? lerp(a[2], y, v.t) : y;
      draw.disc(ctx, bx, by, r, fill, THEME.ink, 2.5);
      if (BULLET_KINDS[k] === 'frag') draw.disc(ctx, bx, by, 3, Math.sin(now * 14) > 0 ? THEME.white : THEME.danger);
    }
    // Holding a laser: a faint sight line showing where it will bounce.
    const s = this.pred.state;
    if (s && s.weapon === 'laser' && this.mePos) {
      ctx.setLineDash([8, 8]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = TANK_WEAPONS.laser.color;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      for (const [x0, y0, x1, y1] of laserPath(this.mePos.x, this.mePos.y, s.aim, this.map.blocks, 600, 1)) {
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    this.beams = this.beams.filter((b) => now - b.t0 < 0.3);
    for (const b of this.beams) {
      ctx.globalAlpha = 1 - (now - b.t0) / 0.3;
      ctx.lineCap = 'round';
      for (const [w, c] of [[9, THEME.ink], [6, TANK_WEAPONS.laser.color], [2, THEME.white]]) {
        ctx.lineWidth = w;
        ctx.strokeStyle = c;
        ctx.beginPath();
        for (const [x0, y0, x1, y1] of b.s) {
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
        }
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
    }
    ctx.globalAlpha = 1;
  }

  drawPlayer(p, isMe) {
    const ctx = this.ctx;
    const c = this.color(p.idx);
    // Treads, barrel, then the body. The barrel shows any special weapon.
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.aim);
    ctx.fillStyle = THEME.wallSide;
    ctx.strokeStyle = THEME.ink;
    ctx.lineWidth = 2.5;
    for (const side of [-1, 1]) {
      ctx.fillRect(-14, side * 13 - 4, 28, 8);
      ctx.strokeRect(-14, side * 13 - 4, 28, 8);
    }
    ctx.restore();
    const w = p.weapon && TANK_WEAPONS[p.weapon];
    if (p.weapon === 'gatling') for (const o of [-3.5, 3.5]) draw.held(ctx, p.x - Math.sin(p.aim) * o, p.y + Math.cos(p.aim) * o, p.aim, TANK.radius - 4, 18, 5, w.color);
    else if (p.weapon === 'laser') draw.held(ctx, p.x, p.y, p.aim, TANK.radius - 4, 24, 6, w.color);
    else if (p.weapon === 'frag') draw.held(ctx, p.x, p.y, p.aim, TANK.radius - 4, 14, 14, w.color);
    else draw.held(ctx, p.x, p.y, p.aim, TANK.radius - 4, 18, 9, c.dark);
    draw.player(ctx, p.x, p.y, TANK.radius, c, p.aim, isMe);
    if (p.weapon === 'mine') draw.disc(ctx, p.x, p.y, 6, w.color, THEME.ink, 2);
  }

  drawHud() {
    const s = this.pred.state;
    if (s && s.weapon) {
      const w = TANK_WEAPONS[s.weapon];
      draw.heldPower(this.ctx, this.stage.h, w.name, w.color, s.weapon === 'gatling' ? ` ×${s.ammo}` : '');
    }
  }

  onGameEvent(ev) {
    if (ev.k === 'boom') {
      this.fx.ring(ev.x, ev.y, THEME.accent, 10, 60, 0.35, 5);
      this.fx.splat(ev.x, ev.y, this.color(ev.p).main, 16, Math.random() * 6, 8);
    } else if (ev.k === 'laser') this.beams.push({ s: ev.s, t0: performance.now() / 1000 });
    else if (ev.k === 'burst') this.fx.ring(ev.x, ev.y, TANK_WEAPONS.frag.color, 8, 50, 0.3, 5);
    else if (ev.k === 'blast') {
      this.fx.ring(ev.x, ev.y, TANK_WEAPONS.mine.color, 10, TANK_WEAPONS.mine.blast + 20, 0.4, 7);
      this.fx.ring(ev.x, ev.y, THEME.accent, 6, TANK_WEAPONS.mine.blast, 0.3, 4);
    } else if (ev.k === 'grab') this.fx.ring(ev.x, ev.y, TANK_WEAPONS[ev.w].color, 14, 44, 0.3, 4);
  }
}
