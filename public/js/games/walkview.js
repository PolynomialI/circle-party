import { THEME } from '../../shared/theme.js';
import { WALK, stepWalker } from '../../shared/walker.js';
import { ARENAS } from '../../shared/arenas.js';
import * as draw from '../draw.js';
import { drawFloor, drawBlocks } from '../world-draw.js';
import { ArenaView, ST, HUD_H } from './arena.js';

// Browser base for walking games: predicts our movement with the server's walker code and
// draws a whole rectangle map.
export class WalkView extends ArenaView {
  constructor(stage, init, { maps = ARENAS, walk = WALK } = {}) {
    super(stage, init);
    this.maps = maps;
    this.walk = walk;
    this.radius = walk.radius ?? WALK.radius;
  }

  get map() {
    return this.view ? this.maps[this.view.x[0]] : null;
  }

  stepMe(s, cmd) {
    stepWalker(s, cmd, this.maps[s.map], this.walk, s.frozen);
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
