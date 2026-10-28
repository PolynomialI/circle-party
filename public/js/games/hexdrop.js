import { THEME } from '../../shared/theme.js';
import { WALK, stepWalker } from '../../shared/walker.js';
import { HEX, HEX_TILES, HEX_VOID, hexCenter } from '../../shared/minis.js';
import * as draw from '../draw.js';
import { ArenaView, ST, PS, HUD_H, lerp } from './arena.js';

export const name = 'Hex Drop';
export const controls = [['Move', 'W A S D'], ['Dash', 'Space']];

const FALL = 0.6;

function hexPath(ctx, x, y, s) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    ctx.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
  }
  ctx.closePath();
}

export class Game extends ArenaView {
  stepMe(s, cmd) {
    stepWalker(s, cmd, HEX_VOID, WALK, s.frozen);
  }

  meContext(snap) {
    return { frozen: snap.st === ST.countdown || snap.st === ST.over };
  }

  unpack(pa, pb, t) {
    return { fallT: lerp(pa[6], pb[6], t) };
  }

  camera() {
    this.stage.fit(HEX.size * (HEX.rings + 1) * 1.8, HUD_H);
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
    const tiles = v.x;
    const s = HEX.size - 2;
    const now = performance.now();
    HEX_TILES.forEach(([q, r], i) => {
      if (tiles[i] === '2') return;
      const c = hexCenter(q, r);
      hexPath(ctx, c.x, c.y + 12, s);
      ctx.fillStyle = THEME.wallSide;
      ctx.fill();
      ctx.lineWidth = THEME.outline;
      ctx.strokeStyle = THEME.ink;
      ctx.stroke();
      const t = tiles[i];
      const shake = t === '1' ? Math.sin(now / 25 + i) * 1.5 : t === '3' ? Math.sin(now / 18 + i) * 3.5 : 0;
      hexPath(ctx, c.x + shake, c.y, s);
      ctx.fillStyle = t === '1' ? THEME.accent : t === '3' ? THEME.danger : (q - r) % 3 === 0 ? THEME.floorAlt : THEME.floor;
      ctx.fill();
      ctx.stroke();
      // A bevel and a bolt on each tile.
      hexPath(ctx, c.x + shake, c.y, s - 9);
      ctx.lineWidth = 2;
      ctx.strokeStyle = t === '0' ? THEME.seam : THEME.ink;
      ctx.stroke();
      ctx.lineWidth = THEME.outline;
      ctx.strokeStyle = THEME.ink;
      ctx.fillStyle = THEME.seam;
      ctx.fillRect(c.x + shake - 3, c.y - 3, 6, 6);
    });
  }

  gameEvent(ev) {
    const q = this.player(ev.p);
    if (ev.k === 'dash' && q) this.fx.ring(q.x, q.y, this.color(ev.p).main, this.radius, this.radius + 12, 0.2);
    if (ev.k === 'fall' && q) this.fx.ring(q.x, q.y, this.color(ev.p).main, this.radius, this.radius + 30, 0.4);
  }

  drawPlayer(p, isMe) {
    super.drawPlayer(p, isMe, this.roster.get(p.idx));
    if (isMe && this.pred.state) draw.bar(this.ctx, p.x, p.y + this.radius + 10, 1 - this.pred.state.dashCd / WALK.dashCooldown);
  }
}
