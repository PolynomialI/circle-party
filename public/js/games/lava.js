import { THEME } from '../../shared/theme.js';
import { WALK } from '../../shared/walker.js';
import { LAVA, LAVA_MAP } from '../../shared/minis.js';
import * as draw from '../draw.js';
import { WalkView } from './walkview.js';
import { lerp } from './arena.js';

export const name = 'Floor is Lava';
export const controls = [['Move', 'W A S D'], ['Jump', 'Space']];

const LAVA_COL = '#ff6a2b';
const LAVA_HOT = '#ffb347';
const WARN = '#ffd9b8';

export class Game extends WalkView {
  constructor(stage, init) {
    super(stage, init, { maps: { foundry: LAVA_MAP }, walk: { ...WALK, jump: true } });
  }

  unpack(pa, pb, t) {
    return { z: lerp(pa[6], pb[6], t) };
  }

  applyMe(me, s) {
    me.z = s.z;
  }

  drawFloorExtras(v) {
    const ctx = this.ctx;
    const [, phase, , stones] = v.x;
    const now = performance.now() / 1000;
    if (phase === 1) {
      // Warning: the floor glows.
      ctx.globalAlpha = 0.45 + 0.25 * Math.sin(now * 12);
      ctx.fillStyle = WARN;
      ctx.fillRect(40, 40, LAVA_MAP.w - 80, LAVA_MAP.h - 80);
      ctx.globalAlpha = 1;
    } else if (phase === 2) {
      ctx.fillStyle = LAVA_COL;
      ctx.fillRect(40, 40, LAVA_MAP.w - 80, LAVA_MAP.h - 80);
      ctx.fillStyle = LAVA_HOT;
      for (let i = 0; i < 40; i++) {
        const x = 60 + ((i * 311 + now * 20) % (LAVA_MAP.w - 120));
        const y = 60 + ((i * 197) % (LAVA_MAP.h - 120));
        draw.disc(ctx, x, y, 6 + (i % 4) * 3 + Math.sin(now * 3 + i) * 2, LAVA_HOT);
      }
    }
    // Stepping stones: raised round pads; sunk ones are just a ring in the floor.
    LAVA_MAP.stones.forEach(([x, y], i) => {
      if (stones[i] === '0') {
        draw.disc(ctx, x, y, LAVA.stoneR, null, phase === 2 ? '#a83a10' : THEME.seam, 4);
        return;
      }
      draw.disc(ctx, x, y + 12, LAVA.stoneR, THEME.wallSide, THEME.ink);
      draw.disc(ctx, x, y, LAVA.stoneR, '#b6c0cd', THEME.ink);
      draw.disc(ctx, x, y, LAVA.stoneR * 0.62, null, THEME.metal, 4);
    });
  }

  drawPlayer(p, isMe) {
    const ctx = this.ctx;
    const z = p.z || 0;
    if (z > 0.5) draw.disc(ctx, p.x + 3, p.y + 5, this.radius * (1 - z / 120), THEME.shadow);
    draw.player(ctx, p.x, p.y - z * 0.8, this.radius * (1 + z / 160), this.color(p.idx), p.aim, isMe);
  }

  drawHud(v) {
    const [, phase, left] = v.x;
    if (phase === 1) draw.bigText(this.ctx, `LAVA IN ${Math.ceil(left)}`, this.stage.w / 2, 96, 26, LAVA_COL);
    else if (phase === 2) draw.bigText(this.ctx, 'LAVA!', this.stage.w / 2, 96, 26, LAVA_COL);
  }

  onGameEvent(ev) {
    if (ev.k === 'burn') {
      this.fx.ring(ev.x, ev.y, LAVA_HOT, this.radius, this.radius + 30, 0.4, 5);
      this.fx.splat(ev.x, ev.y, this.color(ev.p).main, 12, Math.random() * 6, 4);
    }
  }
}
