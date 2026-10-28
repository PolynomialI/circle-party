import { THEME } from '../../shared/theme.js';
import { TRACK } from '../../shared/minis.js';
import * as draw from '../draw.js';
import { WalkView } from './walkview.js';

export const name = 'Stop & Go';
export const controls = [['Move', 'W A S D'], ['Dash', 'Space']];

const LAMP = [THEME.good, THEME.accent, THEME.danger];

export class Game extends WalkView {
  constructor(stage, init) {
    super(stage, init, { maps: TRACK });
  }

  drawAbove(v) {
    // The light on the machine at the finish end.
    const ctx = this.ctx;
    const light = v.x[1];
    [2, 1, 0].forEach((code, i) => draw.disc(ctx, 1730, 375 + i * 75, 26, code === light ? LAMP[code] : THEME.wallSide, THEME.ink));
  }

  drawHud(v) {
    // A coloured frame round the screen so the light can't be missed.
    const ctx = this.ctx;
    ctx.lineWidth = 12;
    ctx.strokeStyle = LAMP[v.x[1]];
    ctx.strokeRect(6, 6, this.stage.w - 12, this.stage.h - 12);
  }

  onGameEvent(ev) {
    if (ev.k === 'zap') {
      this.fx.ring(ev.x, ev.y, THEME.danger, this.radius, this.radius + 34, 0.35, 5);
      this.fx.splat(ev.x, ev.y, this.color(ev.p).main, 16, Math.random() * 6, 6);
    }
  }
}
