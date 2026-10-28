import { THEME } from '../../shared/theme.js';
import { WALK, stepWalker } from '../../shared/walker.js';
import { WALK_POWERS, WALK_POWER_IDS, useWalkPower } from '../../shared/walkpowers.js';
import { ARENAS } from '../../shared/arenas.js';
import * as draw from '../draw.js';
import { drawFloor, drawBlocks } from '../world-draw.js';
import { ArenaView, ST, PS, HUD_H } from './arena.js';

const PUNCH = 0.18;

// Browser base for walking games: predicts our movement with the server's walker code and
// draws a whole rectangle map.
export class WalkView extends ArenaView {
  constructor(stage, init, { maps = ARENAS, walk = WALK } = {}) {
    super(stage, init);
    this.maps = maps;
    this.walk = walk;
    this.radius = walk.radius ?? WALK.radius;
    this.punches = [];
  }

  get map() {
    return this.view ? this.maps[this.view.x[0]] : null;
  }

  stepMe(s, cmd) {
    if (this.init.powers) useWalkPower(s, cmd, this.maps[s.map], s.frozen);
    stepWalker(s, cmd, this.maps[s.map], this.walk, s.frozen);
  }

  // With crates on, the world's last entry is [crates, [idx, held, flags]...].
  powerState(v) {
    return this.init.powers ? v.x[v.x.length - 1] : null;
  }

  meContext(snap) {
    return { map: snap.x[0], frozen: snap.st === ST.countdown || snap.st === ST.over };
  }

  camera() {
    const m = this.map;
    this.stage.fitRect(0, 0, m.w, m.h, HUD_H);
  }

  drawWorld(v) {
    drawFloor(this.ctx, this.map);
    this.drawFloorExtras(v);
    drawBlocks(this.ctx, this.map.blocks);
    const ps = this.powerState(v);
    if (ps) for (const [id, x, y, type] of ps[0]) draw.crate(this.ctx, x, y, WALK_POWERS[WALK_POWER_IDS[type]].color, id);
  }

  // Bubbles, boots, held power-ups and glove punches.
  drawOverPlayers(v) {
    const ps = this.powerState(v);
    if (!ps) return;
    const ctx = this.ctx;
    const now = performance.now() / 1000;
    this.punches = this.punches.filter((s) => now - s.t0 < PUNCH);
    for (const [idx, held, f] of ps[1]) {
      const p = this.player(idx);
      if (!p || p.state !== PS.alive) continue;
      const r = this.radius;
      if (f & 1) {
        // Rocket boots: flame puffs behind.
        for (let k = 0; k < 3; k++) {
          const a = p.aim + Math.PI + (k - 1) * 0.5;
          draw.disc(ctx, p.x + Math.cos(a) * (r + 4 + Math.random() * 6), p.y + Math.sin(a) * (r + 4 + Math.random() * 6), 3 + Math.random() * 2, WALK_POWERS.boots.color);
        }
      }
      if (f & 2) {
        ctx.globalAlpha = 0.25;
        draw.disc(ctx, p.x, p.y, r + 8, WALK_POWERS.bubble.color);
        ctx.globalAlpha = 1;
        draw.disc(ctx, p.x, p.y, r + 8, null, WALK_POWERS.bubble.color, 3);
        draw.disc(ctx, p.x - r * 0.45, p.y - r * 0.55, 3, THEME.white);
      }
      const kind = WALK_POWER_IDS[held];
      const swing = this.punches.find((s) => s.p === idx);
      if (kind === 'glove' || swing) {
        const k = swing ? Math.sin(((now - swing.t0) / PUNCH) * Math.PI) : 0;
        const a = swing ? swing.a : p.aim + 0.6;
        const d = r + 4 + k * WALK_POWERS.glove.reach;
        draw.held(ctx, p.x, p.y, a, r - 4, d - r + 4, 6);
        draw.disc(ctx, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 9 + k * 3, WALK_POWERS.glove.color, THEME.ink, 2.5);
      } else if (kind) {
        ctx.fillStyle = WALK_POWERS[kind].color;
        ctx.fillRect(p.x + r, p.y - r - 10, 11, 11);
        ctx.strokeStyle = THEME.ink;
        ctx.lineWidth = 2;
        ctx.strokeRect(p.x + r, p.y - r - 10, 11, 11);
      }
    }
  }

  drawHeld() {
    const s = this.pred.state;
    if (!this.init.powers || !s || !s.held) return;
    const def = WALK_POWERS[s.held];
    draw.heldPower(this.ctx, this.stage.h, def.name, def.color, s.held === 'glove' ? ` ×${s.uses}` : '');
  }

  drawFloorExtras() {}

  drawPlayer(p, isMe) {
    draw.player(this.ctx, p.x, p.y, this.radius, this.color(p.idx), p.aim, isMe, this.bodyFill && this.bodyFill(p));
    if (isMe && this.pred.state && this.walk.dash !== false) {
      draw.bar(this.ctx, p.x, p.y + this.radius + 10, 1 - this.pred.state.dashCd / (this.walk.dashCooldown ?? WALK.dashCooldown));
    }
  }

  gameEvent(ev) {
    const q = ev.p !== undefined && this.player(ev.p);
    if (ev.k === 'dash' && q) this.fx.ring(q.x, q.y, this.color(ev.p).main, this.radius, this.radius + 12, 0.2);
    else if (ev.k === 'punch') {
      this.punches.push({ p: ev.p, a: ev.a, t0: performance.now() / 1000 });
      if (q && ev.hit) this.fx.ring(q.x + Math.cos(ev.a) * 40, q.y + Math.sin(ev.a) * 40, THEME.white, 8, 34, 0.25, 5);
    } else if (ev.k === 'crate') this.fx.ring(ev.x, ev.y, WALK_POWERS[ev.w].color, 14, 44, 0.3, 4);
    else if (ev.k === 'power') {
      const def = WALK_POWERS[ev.w];
      this.fx.ring(ev.x, ev.y, def.color, this.radius, ev.w === 'splash' ? def.r : this.radius + 30, 0.35, 5);
    }
    this.onGameEvent(ev);
  }

  onGameEvent() {}

  // Time left in the round, shown under the scoreboard.
  drawTimer(left) {
    const ctx = this.ctx;
    const t = Math.max(0, Math.ceil(left));
    draw.bigText(ctx, `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, this.stage.w / 2, 84, 24, t <= 5 ? THEME.accent : THEME.white);
  }
}
