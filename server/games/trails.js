import { DT } from '../../public/shared/loop.js';
import { TRAILS, TRAIL_MAPS, TRAIL_MAP_IDS, TRAIL_POWERS, TRAIL_POWER_IDS, TRAIL_CRATES, trailBounds, newTrailer, trailPen, stepTrail } from '../../public/shared/minis.js';
import { ArenaGame, PS, r1, r2 } from './arena.js';

export const TRAILS_INFO = {
  id: 'trails',
  name: 'Light Trails',
  blurb: 'You never stop and leave a wall behind you. Outlast everyone: a point for each player who crashes before you.',
  settings: [
    { key: 'rounds', label: 'Rounds', options: [[3, '3'], [5, '5'], [8, '8']], def: 5 },
    { key: 'map', label: 'Map', options: [['random', 'Random'], ...TRAIL_MAP_IDS.map((id) => [id, TRAIL_MAPS[id].name])], def: 'random' },
    { key: 'powers', label: 'Power-up crates', options: [[1, 'On'], [0, 'Off']], def: 1 },
  ],
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
    this.scoring = 'points';
    this.drawEvent = 'roundover';
    this.mapSetting = opts.settings.map ?? 'random';
    this.powersOn = (opts.settings.powers ?? 1) !== 0;
    this.mapId = null;
    this.nextId = 1;
    this.startRound(this.firstCountdown);
  }

  newPlayer(p) {
    Object.assign(p, newTrailer(0, 0, 0, p.idx), { trail: [], since: 0, r: TRAILS.head });
  }

  setupRound(list) {
    const ids = this.mapSetting !== 'random' && TRAIL_MAPS[this.mapSetting] ? [this.mapSetting] : TRAIL_MAP_IDS.filter((id) => id !== this.mapId);
    this.mapId = ids[Math.floor(this.rng() * ids.length)];
    this.map = TRAIL_MAPS[this.mapId];
    this.crates = [];
    this.crateT = TRAIL_CRATES.first;
    list.forEach((p, i) => {
      const a = (i / list.length) * Math.PI * 2;
      const x = TRAILS.w / 2 + Math.cos(a) * 340;
      const y = TRAILS.h / 2 + Math.sin(a) * 290;
      Object.assign(p, newTrailer(x, y, a + Math.PI / 2, p.idx), { trail: [[x, y]], since: 0 });
    });
  }

  playerTick(p, cmd, frozen) {
    if (p.state !== PS.alive) return;
    const tp = p.tp;
    const wasDown = trailPen(p);
    const used = stepTrail(p, cmd, frozen, this.map);
    if (frozen) return;
    if (used) this.usePower(p, used);
    const down = trailPen(p);
    const t = p.trail;
    if (p.tp !== tp) {
      // Through a portal: the trail breaks and starts again on the far side.
      if (t[t.length - 1]) t.push(null);
      if (down) t.push([p.x, p.y]);
      p.since = 0;
    } else if (down && !wasDown) {
      t.push([p.x, p.y]);
      p.since = 0;
    } else if (!down && wasDown) {
      t.push([p.x, p.y], null);
    } else if (down && ++p.since >= 3) {
      t.push([p.x, p.y]);
      p.since = 0;
    }
  }

  usePower(p, kind) {
    this.events.push({ k: 'power', p: p.idx, w: kind });
    if (kind === 'cutter') {
      const c = TRAIL_POWERS.cutter;
      const x = p.x + Math.cos(p.aim) * c.reach;
      const y = p.y + Math.sin(p.aim) * c.reach;
      for (const q of this.players.values()) {
        q.trail = q.trail.map((pt) => (pt && Math.hypot(pt[0] - x, pt[1] - y) < c.r ? null : pt));
      }
      this.events.push({ k: 'cut', x: r1(x), y: r1(y), r: c.r });
    } else if (kind === 'scramble') {
      for (const q of this.alive) if (q !== p) q.revT = TRAIL_POWERS.scramble.time;
    }
  }

  spawnCrates() {
    this.crateT -= DT;
    if (this.crateT > 0 || this.crates.length >= TRAIL_CRATES.max) return;
    this.crateT = TRAIL_CRATES.every;
    const b = trailBounds(this.rt + 6); // somewhere that will still be open for a while
    for (let tries = 0; tries < 20; tries++) {
      const x = b.x0 + 60 + this.rng() * (b.x1 - b.x0 - 120);
      const y = b.y0 + 60 + this.rng() * (b.y1 - b.y0 - 120);
      if (this.map.pylons.some(([px, py, pr]) => Math.hypot(px - x, py - y) < pr + 40)) continue;
      if (this.map.portals.some(([ax, ay, bx, by]) => Math.hypot(ax - x, ay - y) < 70 || Math.hypot(bx - x, by - y) < 70)) continue;
      if (this.alive.some((p) => Math.hypot(p.x - x, p.y - y) < 120)) continue;
      const type = TRAIL_POWER_IDS[Math.floor(this.rng() * TRAIL_POWER_IDS.length)];
      this.crates.push({ id: this.nextId++, x, y, type });
      return;
    }
  }

  worldTick(frozen) {
    if (frozen) return;
    if (this.powersOn) this.spawnCrates();
    const b = trailBounds(this.rt);
    this.crates = this.crates.filter((c) => c.x > b.x0 + 20 && c.x < b.x1 - 20 && c.y > b.y0 + 20 && c.y < b.y1 - 20);
    const alive = this.alive;
    const crashed = new Set();
    for (const p of alive) {
      const r = p.r;
      if (p.x < b.x0 + r || p.y < b.y0 + r || p.x > b.x1 - r || p.y > b.y1 - r) crashed.add(p);
      if (p.hopT > 0) continue; // in the air: over pylons and trails
      if (this.map.pylons.some(([px, py, pr]) => Math.hypot(px - p.x, py - p.y) < pr + r)) crashed.add(p);
      if (p.ghostT > 0 || crashed.has(p)) continue;
      for (const q of this.players.values()) {
        const pts = q.trail;
        const end = q === p ? pts.length - KEEP_OWN : pts.length;
        for (let i = 1; i < end && !crashed.has(p); i++) {
          const a = pts[i - 1];
          const c = pts[i];
          if (a && c && segDist(p.x, p.y, a[0], a[1], c[0], c[1]) < r + 3) crashed.add(p);
        }
        // The stretch from their newest point to their head.
        const last = pts[pts.length - 1];
        if (q !== p && q.state === PS.alive && last && trailPen(q) && segDist(p.x, p.y, last[0], last[1], q.x, q.y) < r + 3) crashed.add(p);
      }
    }
    for (const p of alive) {
      if (crashed.has(p) || p.held) continue;
      const i = this.crates.findIndex((c) => Math.hypot(c.x - p.x, c.y - p.y) <= TRAIL_CRATES.reach + p.r);
      if (i < 0) continue;
      const [c] = this.crates.splice(i, 1);
      p.held = c.type;
      this.events.push({ k: 'grab', p: p.idx, w: c.type, x: r1(c.x), y: r1(c.y) });
    }
    if (!crashed.size) return;
    // A point for everyone who outlasts each crash.
    for (const q of alive) if (!crashed.has(q)) q.points += crashed.size;
    for (const p of crashed) {
      p.state = PS.out;
      this.events.push({ k: 'crash', p: p.idx, x: r1(p.x), y: r1(p.y) });
    }
  }

  roundResult() {
    return this.lastStanding();
  }

  // flags: 1 boost, 2 pen down, 4 ghost, 8 scrambled
  packPlayer(p) {
    const f = (p.boostT > 0 ? 1 : 0) | (trailPen(p) ? 2 : 0) | (p.ghostT > 0 ? 4 : 0) | (p.revT > 0 ? 8 : 0);
    return [f, r2(p.hopT), p.tp, TRAIL_POWER_IDS.indexOf(p.held)];
  }

  packWorld() {
    return [TRAIL_MAP_IDS.indexOf(this.mapId), this.crates.map((c) => [c.id, r1(c.x), r1(c.y), TRAIL_POWER_IDS.indexOf(c.type)])];
  }

  packMe(p) {
    return {
      x: r2(p.x), y: r2(p.y), aim: r2(p.aim), boostT: r2(p.boostT), boostCd: r2(p.boostCd), hopT: r2(p.hopT), ghostT: r2(p.ghostT),
      revT: r2(p.revT), tpCd: r2(p.tpCd), tp: p.tp, dist: r2(p.dist), gs: p.gs, gapAt: r2(p.gapAt), gapN: p.gapN, held: p.held, trig: p.trig,
    };
  }
}
