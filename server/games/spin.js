import { DT } from '../../public/shared/loop.js';
import { WALK, newWalker, stepWalker } from '../../public/shared/walker.js';
import { SPIN, SPIN_VOID, spinBars, spinRadius } from '../../public/shared/minis.js';
import { collideCircles } from '../physics.js';
import { ArenaGame, PS, r1, r2 } from './arena.js';
import { roundsOption } from './walkgame.js';

export const SPIN_INFO = {
  id: 'spin',
  name: 'Spin Cycle',
  blurb: 'Two bars sweep the platform. Jump the red one; stay on the ground when the blue one passes.',
  settings: [roundsOption(3)],
};

export const SPIN_WALK = { ...WALK, jump: true };
const FALL = 0.6;

function segDist(px, py, ax, ay, bx, by) {
  const ex = bx - ax;
  const ey = by - ay;
  const l2 = ex * ex + ey * ey;
  const t = Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / l2));
  return Math.hypot(px - ax - ex * t, py - ay - ey * t);
}

export class Spin extends ArenaGame {
  constructor(opts) {
    super(opts);
    this.startRound(this.firstCountdown);
  }

  newPlayer(p) {
    Object.assign(p, newWalker(0, 0), { fallT: 0, hitCd: 0 });
  }

  setupRound(list) {
    list.forEach((p, i) => {
      const a = (i / list.length) * Math.PI * 2 + 0.3;
      Object.assign(p, newWalker(Math.cos(a) * 240, Math.sin(a) * 240, a + Math.PI), { fallT: 0, hitCd: 0 });
    });
  }

  playerTick(p, cmd, frozen) {
    if (p.state === PS.fall) {
      p.x += p.vx * DT;
      p.y += p.vy * DT;
      p.fallT += DT;
      if (p.fallT >= FALL) p.state = PS.out;
      return;
    }
    if (p.state !== PS.alive) return;
    p.hitCd = Math.max(0, p.hitCd - DT);
    stepWalker(p, cmd, SPIN_VOID, SPIN_WALK, frozen);
    // The hub in the middle is solid.
    const d = Math.hypot(p.x, p.y);
    if (d < SPIN.hub + p.r && d > 1e-6) {
      p.x *= (SPIN.hub + p.r) / d;
      p.y *= (SPIN.hub + p.r) / d;
    }
  }

  worldTick(frozen) {
    const alive = this.alive;
    for (let i = 0; i < alive.length; i++) for (let j = i + 1; j < alive.length; j++) collideCircles(alive[i], alive[j], 0.7);
    if (frozen) return;
    const bars = spinBars(this.rt);
    const R = spinRadius(this.rt);
    for (const p of alive) {
      // Low bar hits you on the ground, the high bar in the air. Both sweep the full width.
      for (const [a, high, dir] of [[bars.low, false, Math.sign(SPIN.low[0])], [bars.high, true, Math.sign(SPIN.high[0])]]) {
        if (p.hitCd > 0 || (p.z > SPIN.highZ) !== high) continue;
        const c = Math.cos(a) * SPIN.len;
        const s = Math.sin(a) * SPIN.len;
        if (segDist(p.x, p.y, -c, -s, c, s) > p.r + 8) continue;
        // Knocked along the bar's sweep (whichever side of the hub you're on) and a little outwards.
        const side = Math.sign(p.x * -s + p.y * c) || 1;
        const tx = -Math.sin(a) * dir * side;
        const ty = Math.cos(a) * dir * side;
        const d = Math.hypot(p.x, p.y) || 1;
        p.vx = tx * SPIN.knock + (p.x / d) * 180;
        p.vy = ty * SPIN.knock + (p.y / d) * 180;
        p.knockT = 0.5;
        p.hitCd = 0.4;
        this.events.push({ k: 'hit', v: p.idx, high });
      }
      if (p.z <= 0 && Math.hypot(p.x, p.y) > R) {
        p.state = PS.fall;
        this.events.push({ k: 'fall', p: p.idx });
      }
    }
  }

  roundResult() {
    return this.lastStanding();
  }

  packPlayer(p) {
    return [r1(p.z), r2(p.fallT)];
  }

  packMe(p) {
    return { x: r2(p.x), y: r2(p.y), vx: r2(p.vx), vy: r2(p.vy), aim: r2(p.aim), dashT: 0, dashCd: 0, knockT: r2(p.knockT), spd: 1, z: r2(p.z), vz: r2(p.vz) };
  }
}

