import { TRAILS, stepTrail } from '../../public/shared/minis.js';
import { ArenaGame, PS, r1, r2 } from './arena.js';
import { roundsOption } from './walkgame.js';

export const TRAILS_INFO = {
  id: 'trails',
  name: 'Light Trails',
  blurb: 'You never stop and leave a wall behind you. Make everyone else crash.',
  settings: [roundsOption(3)],
};

const KEEP_OWN = 6; // our own newest trail points don't count (they're under our head)

function segDist(px, py, ax, ay, bx, by) {
  const ex = bx - ax;
  const ey = by - ay;
  const l2 = ex * ex + ey * ey;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / l2)) : 0;
  return Math.hypot(px - ax - ex * t, py - ay - ey * t);
}

export class Trails extends ArenaGame {
  constructor(opts) {
    super(opts);
    this.startRound(this.firstCountdown);
  }

  newPlayer(p) {
    Object.assign(p, { aim: 0, boostT: 0, boostCd: 0, trail: [], since: 0, r: TRAILS.head });
  }

  setupRound(list) {
    list.forEach((p, i) => {
      const a = (i / list.length) * Math.PI * 2;
      const x = TRAILS.w / 2 + Math.cos(a) * 320;
      const y = TRAILS.h / 2 + Math.sin(a) * 280;
      Object.assign(p, { x, y, aim: a + Math.PI / 2, boostT: 0, boostCd: 0, trail: [[x, y]], since: 0 });
    });
  }

  playerTick(p, cmd, frozen) {
    if (p.state !== PS.alive) return;
    stepTrail(p, cmd, frozen);
    if (frozen) return;
    if (++p.since >= 3) {
      p.trail.push([p.x, p.y]);
      p.since = 0;
    }
  }

  worldTick(frozen) {
    if (frozen) return;
    const alive = this.alive;
    const crashed = new Set();
    for (const p of alive) {
      const r = p.r;
      if (p.x < 40 + r || p.y < 40 + r || p.x > TRAILS.w - 40 - r || p.y > TRAILS.h - 40 - r) crashed.add(p);
      for (const q of this.players.values()) {
        const pts = q.trail;
        const end = q === p ? pts.length - KEEP_OWN : pts.length;
        for (let i = 1; i < end && !crashed.has(p); i++) {
          if (segDist(p.x, p.y, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]) < r + 3) crashed.add(p);
        }
        // The stretch from their newest point to their head.
        if (q !== p && q.state === PS.alive && pts.length && segDist(p.x, p.y, pts[pts.length - 1][0], pts[pts.length - 1][1], q.x, q.y) < r + 3) crashed.add(p);
      }
    }
    for (const p of crashed) {
      p.state = PS.out;
      this.events.push({ k: 'crash', p: p.idx, x: r1(p.x), y: r1(p.y) });
    }
  }

  roundResult() {
    return this.lastStanding();
  }

  packPlayer(p) {
    return [p.boostT > 0 ? 1 : 0];
  }

  packWorld() {
    return 0;
  }

  packMe(p) {
    return { x: r2(p.x), y: r2(p.y), aim: r2(p.aim), boostT: r2(p.boostT), boostCd: r2(p.boostCd) };
  }
}

