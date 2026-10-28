import { SUMO } from '../../public/shared/sumo.js';
import { PS, r2 } from './arena.js';

const angleDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

// A Sumo stick swing from p: knocks back everyone in front within reach. Targets are checked
// where the swinger saw them (lag compensation, up to MAX_REWIND ticks ago).
export function swingHits(game, p, charge, vt) {
  const past = game.rewound(vt);
  const push = SUMO.minPush + (SUMO.maxPush - SUMO.minPush) * charge;
  for (const q of game.players.values()) {
    if (q === p || q.state !== PS.alive) continue;
    const pos = (past && past.get(q.id)) || q;
    const dx = pos.x - p.x;
    const dy = pos.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d > p.r + q.r + SUMO.reach) continue;
    if (d > 1e-6 && angleDiff(Math.atan2(dy, dx), p.aim) > SUMO.arc) continue;
    const nx = d > 1e-6 ? dx / d : Math.cos(p.aim);
    const ny = d > 1e-6 ? dy / d : Math.sin(p.aim);
    q.vx = nx * push + q.vx * 0.2;
    q.vy = ny * push + q.vy * 0.2;
    q.knockT = SUMO.knockTime;
    q.dashT = 0;
    game.events.push({ k: 'hit', p: p.idx, v: q.idx, pw: r2(charge) });
  }
}
