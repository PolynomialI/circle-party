import { THEME } from '../../shared/theme.js';
import { SUMO, stepMover } from '../../shared/sumo.js';
import { collideBlocks } from '../../shared/world.js';
import * as draw from '../draw.js';
import { WalkView } from './walkview.js';

export const name = 'King of the Hill';
export const controls = [['Move', 'W A S D'], ['Aim', 'Mouse'], ['Swing (hold to charge)', 'Left click'], ['Dash', 'Space']];

const ZONE_R = 100;
const OPEN = { solids: [] };

export class Game extends WalkView {
  constructor(stage, init) {
    super(stage, init);
    this.radius = SUMO.radius;
  }

  stepMe(s, cmd) {
    stepMover(s, cmd, OPEN, 0, s.frozen);
    collideBlocks(s, SUMO.radius, this.maps[s.map].blocks);
  }

  meContext(snap) {
    return { ...super.meContext(snap), map: snap.x[0] };
  }

  unpack(pa, pb) {
    return { score: pb[6], charge: pb[7], swT: pb[8] };
  }

  applyMe(me, s) {
    me.charge = s.chg < 0 ? 0 : Math.max(0.01, s.chg / SUMO.chargeTicks);
    me.swT = s.swT;
  }

  chipValue(p) {
    return p.score;
  }

  drawFloorExtras(v) {
    const ctx = this.ctx;
    const [, x, y, owner] = v.x;
    const fill = owner >= 0 ? this.color(owner).main : owner === -2 ? THEME.danger : THEME.decal;
    ctx.globalAlpha = 0.45;
    draw.disc(ctx, x, y, ZONE_R, fill);
    ctx.globalAlpha = 1;
    draw.disc(ctx, x, y, ZONE_R, null, THEME.ink, 4);
    ctx.setLineDash([14, 10]);
    draw.disc(ctx, x, y, ZONE_R - 12, null, THEME.white, 4);
    ctx.setLineDash([]);
    if (v.x[5] < 3) draw.bigText(ctx, String(Math.ceil(v.x[5])), x, y, 40, THEME.white);
  }

  drawPlayer(p, isMe) {
    const ctx = this.ctx;
    let angle = p.aim + 1.0 + 0.6 * p.charge;
    if (p.swT > 0) angle = p.aim + 1.2 - 2.6 * (1 - p.swT / SUMO.swingTime);
    draw.held(ctx, p.x, p.y, angle, SUMO.radius - 6, SUMO.stickLength + 6, SUMO.stickWidth + 1, THEME.metal);
    super.drawPlayer(p, isMe);
    if (p.charge > 0) draw.chargeArc(ctx, p.x, p.y, SUMO.radius + 2, p.charge);
  }

  drawHud(v) {
    this.drawTimer(v.x[4]);
  }

  onGameEvent(ev) {
    const q = this.player(ev.v);
    if (ev.k === 'hit' && q) this.fx.ring(q.x, q.y, THEME.white, SUMO.radius, SUMO.radius + 16 + ev.pw * 24);
  }
}
