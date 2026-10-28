import { SUMO, MAPS, MAP_IDS, onPlatform, spawnPoint, newMover, stepMover } from '../../public/shared/sumo.js';
import { DT } from '../../public/shared/loop.js';
import { collideCircles } from '../physics.js';
import { ArenaGame, PS, r1, r2 } from './arena.js';
import { swingHits } from './stick.js';

export const SUMO_INFO = {
  id: 'sumo',
  name: 'Sumo',
  blurb: 'Knock everyone off the platform with your stick.',
  settings: [
    { key: 'rounds', label: 'Rounds to win', options: [[3, '3'], [5, '5'], [7, '7']], def: 3 },
    { key: 'map', label: 'Map', options: [['random', 'Random'], ...MAP_IDS.map((id) => [id, MAPS[id].name])], def: 'random' },
  ],
};

// Knockback sticks on a platform over a pit. Last player standing wins the round.
export class Sumo extends ArenaGame {
  constructor(opts) {
    super(opts);
    this.mapSetting = opts.settings.map;
    this.mapId = null;
    this.startRound(this.firstCountdown);
  }

  newPlayer(p) {
    Object.assign(p, newMover(0, 0), { fallT: 0, r: SUMO.radius });
  }

  setupRound(list) {
    if (this.mapSetting !== 'random') this.mapId = this.mapSetting;
    else {
      const choices = MAP_IDS.filter((id) => id !== this.mapId);
      this.mapId = choices[Math.floor(this.rng() * choices.length)];
    }
    this.map = MAPS[this.mapId];
    list.forEach((p, i) => {
      const s = spawnPoint(this.map, i);
      Object.assign(p, newMover(s.x, s.y), { fallT: 0 });
    });
  }

  playerTick(p, cmd, frozen) {
    if (p.state === PS.alive) {
      const swing = stepMover(p, cmd, this.map, this.rt, frozen);
      if (swing) swingHits(this, p, swing.charge, cmd.vt);
      if (p.bump >= 0) this.events.push({ k: 'bump', i: p.bump });
      if (p.dashT === SUMO.dashTime) this.events.push({ k: 'dash', p: p.idx });
    } else if (p.state === PS.fall) {
      p.x += p.vx * DT;
      p.y += p.vy * DT;
      p.fallT += DT;
      if (p.fallT >= SUMO.fallTime) p.state = PS.out;
    }
  }

  worldTick(frozen) {
    const alive = this.alive;
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i];
        const b = alive[j];
        a.m = a.dashT > 0 ? SUMO.dashMassMul : 1;
        b.m = b.dashT > 0 ? SUMO.dashMassMul : 1;
        const imp = collideCircles(a, b, SUMO.playerBounce);
        if (imp > 300) {
          // A hard shove (usually a dash) sends the lighter one sliding.
          if (a.m <= b.m) a.knockT = Math.max(a.knockT, SUMO.knockTime * 0.7);
          if (b.m <= a.m) b.knockT = Math.max(b.knockT, SUMO.knockTime * 0.7);
          this.events.push({ k: 'bonk', x: r1((a.x + b.x) / 2), y: r1((a.y + b.y) / 2) });
        }
      }
    }
    if (frozen) return;
    for (const p of alive) {
      if (p.dashT <= 0 && !onPlatform(this.map, p.x, p.y, this.rt)) { // mid-leap you can cross gaps
        p.state = PS.fall;
        p.chg = -1;
        this.events.push({ k: 'fall', p: p.idx });
      }
    }
  }

  roundResult() {
    return this.lastStanding();
  }

  packPlayer(p) {
    return [p.chg < 0 ? 0 : r2(Math.max(0.01, p.chg / SUMO.chargeTicks)), r2(p.swT), r2(p.fallT), r1(p.z)];
  }

  packWorld() {
    return this.mapId;
  }

  packMe(p) {
    return {
      x: r2(p.x), y: r2(p.y), vx: r2(p.vx), vy: r2(p.vy), aim: r2(p.aim), dashT: r2(p.dashT), dashCd: r2(p.dashCd),
      knockT: r2(p.knockT), chg: p.chg, swT: r2(p.swT), swCd: r2(p.swCd), bump: -1, z: r1(p.z),
    };
  }
}
