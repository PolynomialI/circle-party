import { SUMO, MAPS, MAP_IDS, onPlatform, spawnPoint, newMover, stepMover } from '../../public/shared/sumo.js';
import { DT, MAX_REWIND } from '../../public/shared/loop.js';
import { collideCircles } from '../physics.js';
import { History } from '../history.js';
import { CommandQueue } from '../commands.js';

export const SUMO_INFO = {
  id: 'sumo',
  name: 'Sumo',
  settings: [
    { key: 'rounds', label: 'Rounds to win', options: [[3, '3'], [5, '5'], [7, '7']], def: 3 },
    { key: 'map', label: 'Map', options: [['random', 'Random'], ...MAP_IDS.map((id) => [id, MAPS[id].name])], def: 'random' },
  ],
};

const ST = { countdown: 0, playing: 1, roundEnd: 2, over: 3 };
const PS = { alive: 0, fall: 1, out: 2, wait: 3 }; // wait: joined mid-round, plays from the next one

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

function angleDiff(a, b) {
  const d = Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  return d;
}

// Knockback sticks on a platform over the void. Last player standing wins the round.
export class Sumo {
  constructor({ players, settings, rng = Math.random }) {
    this.rng = rng;
    this.target = settings.rounds;
    this.mapSetting = settings.map;
    this.players = new Map();
    this.nextIdx = 0;
    this.tick = 0;
    this.events = [];
    this.history = new History(MAX_REWIND + 2);
    this.round = 0;
    this.mapId = null;
    this.result = null;
    this.cache = null;
    for (const p of players) this.addPlayer(p);
    this.startRound(SUMO.firstCountdown);
  }

  addPlayer({ id, name, color }) {
    const p = { id, name, color, idx: this.nextIdx++, wins: 0, state: PS.wait, fallT: 0, r: SUMO.radius, m: 1, cmds: new CommandQueue(), ...newMover(0, 0) };
    this.players.set(id, p);
  }

  removePlayer(id) {
    this.players.delete(id);
  }

  roster() {
    return [...this.players.values()].map((p) => ({ idx: p.idx, id: p.id, name: p.name, color: p.color }));
  }

  init() {
    return { target: this.target };
  }

  input(id, msg) {
    const p = this.players.get(id);
    if (p) p.cmds.push(msg);
  }

  pickMap() {
    if (this.mapSetting !== 'random') return this.mapSetting;
    const choices = MAP_IDS.filter((id) => id !== this.mapId);
    return choices[Math.floor(this.rng() * choices.length)];
  }

  startRound(countdown) {
    this.round++;
    this.mapId = this.pickMap();
    this.map = MAPS[this.mapId];
    this.state = ST.countdown;
    this.timer = countdown;
    this.rt = 0;
    const list = [...this.players.values()];
    const order = list.map((_, i) => i).sort(() => this.rng() - 0.5);
    list.forEach((p, i) => {
      const s = spawnPoint(this.map, order[i]);
      Object.assign(p, newMover(s.x, s.y));
      p.state = PS.alive;
      p.fallT = 0;
    });
    this.starters = list.length;
    this.events.push({ k: 'round', n: this.round });
  }

  step() {
    this.tick++;
    if (this.state === ST.over) return;
    if (this.state === ST.playing) this.rt += DT;
    const frozen = this.state === ST.countdown;

    for (const p of this.players.values()) {
      const cmd = p.cmds.next();
      if (p.state === PS.alive) {
        const swing = stepMover(p, cmd, this.map, this.rt, frozen);
        if (swing) this.swing(p, swing.charge, cmd.vt);
        if (p.bump >= 0) this.events.push({ k: 'bump', i: p.bump });
        if (p.dashT === SUMO.dashTime) this.events.push({ k: 'dash', p: p.idx });
      } else if (p.state === PS.fall) {
        p.x += p.vx * DT;
        p.y += p.vy * DT;
        p.fallT += DT;
        if (p.fallT >= SUMO.fallTime) p.state = PS.out;
      }
    }

    const alive = [...this.players.values()].filter((p) => p.state === PS.alive);
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

    if (!frozen) {
      for (const p of alive) {
        if (!onPlatform(this.map, p.x, p.y, this.rt)) {
          p.state = PS.fall;
          p.chg = -1;
          this.events.push({ k: 'fall', p: p.idx });
        }
      }
    }
    this.history.record(this.tick, alive);
    this.advance();
  }

  advance() {
    this.timer -= DT;
    if (this.state === ST.countdown && this.timer <= 0) {
      this.state = ST.playing;
      this.events.push({ k: 'go' });
    } else if (this.state === ST.playing) {
      if (this.players.size === 0) return this.finish(null);
      const alive = [...this.players.values()].filter((p) => p.state === PS.alive);
      if (alive.length > (this.starters > 1 ? 1 : 0)) return;
      const winner = alive[0] || null;
      if (winner) winner.wins++;
      this.events.push(winner ? { k: 'win', p: winner.idx } : { k: 'draw' });
      this.roundWinner = winner;
      this.state = ST.roundEnd;
      this.timer = SUMO.roundEnd;
    } else if (this.state === ST.roundEnd && this.timer <= 0) {
      if (this.players.size === 0) return this.finish(null);
      const w = this.roundWinner && this.players.get(this.roundWinner.id);
      if (w && w.wins >= this.target) this.finish(w);
      else this.startRound(SUMO.countdown);
    }
  }

  finish(winner) {
    this.state = ST.over;
    this.events.push({ k: 'over', p: winner ? winner.idx : -1 });
    const standings = [...this.players.values()]
      .sort((a, b) => b.wins - a.wins)
      .map((p) => ({ id: p.id, name: p.name, color: p.color, score: p.wins }));
    this.result = { winnerId: winner ? winner.id : null, standings };
  }

  // Lag compensation: targets are checked where the swinger saw them (up to MAX_REWIND ticks ago).
  swing(p, charge, vt) {
    const rewind = vt >= 0 ? Math.max(0, Math.min(MAX_REWIND, this.tick - vt)) : 0;
    const past = rewind > 0 ? this.history.at(this.tick - rewind) : null;
    const push = SUMO.minPush + (SUMO.maxPush - SUMO.minPush) * charge;
    for (const q of this.players.values()) {
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
      this.events.push({ k: 'hit', p: p.idx, v: q.idx, pw: r2(charge) });
    }
  }

  common() {
    if (this.cache && this.cache.t === this.tick) return this.cache;
    this.cache = {
      t: this.tick,
      st: this.state,
      tm: r2(Math.max(0, this.timer)),
      rt: r2(this.rt),
      map: this.mapId,
      rd: this.round,
      p: [...this.players.values()].map((p) => [
        p.idx, r1(p.x), r1(p.y), r2(p.aim), p.state, p.chg < 0 ? 0 : r2(Math.max(0.01, p.chg / SUMO.chargeTicks)),
        r2(p.swT), r2(p.fallT), p.wins, p.dashT > 0 ? 1 : 0,
      ]),
      ev: this.events,
    };
    this.events = [];
    return this.cache;
  }

  snapshotFor(id) {
    const c = this.common();
    const p = this.players.get(id);
    if (!p || p.state !== PS.alive) return c;
    return {
      ...c,
      me: {
        ack: p.cmds.ack, x: r2(p.x), y: r2(p.y), vx: r2(p.vx), vy: r2(p.vy), aim: r2(p.aim),
        dashT: r2(p.dashT), dashCd: r2(p.dashCd), knockT: r2(p.knockT), chg: p.chg, swT: r2(p.swT), swCd: r2(p.swCd), bump: -1,
      },
    };
  }
}
