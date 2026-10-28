import { DT, MAX_REWIND } from '../../public/shared/loop.js';
import { History } from '../history.js';
import { CommandQueue } from '../commands.js';

// Shared base for round-based games: players, input, rounds, first-to-N, snapshots.
// A game subclass fills in: newPlayer, setupRound, playerTick, worldTick, roundResult,
// packPlayer, packWorld, packMe.

export const ST = { countdown: 0, playing: 1, roundEnd: 2, over: 3 };
export const PS = { alive: 0, fall: 1, out: 2, wait: 3, dead: 4 }; // wait: joined mid-round

export const r1 = (v) => Math.round(v * 10) / 10;
export const r2 = (v) => Math.round(v * 100) / 100;

export class ArenaGame {
  constructor({ players, settings, rng = Math.random }) {
    this.rng = rng;
    this.settings = settings;
    this.target = settings.rounds ?? 1;
    this.players = new Map();
    this.nextIdx = 0;
    this.tick = 0;
    this.events = [];
    this.history = new History(MAX_REWIND + 2);
    this.round = 0;
    this.rt = 0;
    this.result = null;
    this.cache = null;
    this.firstCountdown = 3;
    this.countdown = 2;
    this.roundEndTime = 2.5;
    for (const p of players) this.addPlayer(p);
  }

  addPlayer({ id, name, color }) {
    const p = { id, name, color, idx: this.nextIdx++, wins: 0, score: 0, state: PS.wait, cmds: new CommandQueue(), x: 0, y: 0, aim: 0, r: 16, m: 1 };
    this.newPlayer(p);
    this.players.set(id, p);
    return p;
  }

  newPlayer() {}

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

  shuffled(list) {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  startRound(countdown) {
    this.round++;
    this.state = ST.countdown;
    this.timer = countdown;
    this.rt = 0;
    const list = [...this.players.values()];
    for (const p of list) p.state = PS.alive;
    this.starters = list.length;
    this.setupRound(this.shuffled(list));
    this.events.push({ k: 'round', n: this.round });
  }

  get alive() {
    return [...this.players.values()].filter((p) => p.state === PS.alive);
  }

  step() {
    this.tick++;
    if (this.state === ST.over) return;
    if (this.state === ST.playing) this.rt += DT;
    const frozen = this.state === ST.countdown;
    for (const p of this.players.values()) this.playerTick(p, p.cmds.next(), frozen);
    this.worldTick(frozen);
    this.history.record(this.tick, this.alive);
    this.advance();
  }

  advance() {
    this.timer -= DT;
    if (this.state === ST.countdown && this.timer <= 0) {
      this.state = ST.playing;
      this.events.push({ k: 'go' });
    } else if (this.state === ST.playing) {
      if (this.players.size === 0) return this.finish(null);
      const winner = this.roundResult();
      if (winner === undefined) return;
      if (winner) winner.wins++;
      this.events.push(winner ? { k: 'win', p: winner.idx } : { k: 'draw' });
      this.roundWinner = winner;
      this.state = ST.roundEnd;
      this.timer = this.roundEndTime;
    } else if (this.state === ST.roundEnd && this.timer <= 0) {
      if (this.players.size === 0) return this.finish(null);
      const w = this.roundWinner && this.players.get(this.roundWinner.id);
      if (w && w.wins >= this.target) this.finish(w);
      else this.startRound(this.countdown);
    }
  }

  // Round over when at most one player is left (none, when practising alone).
  lastStanding() {
    const alive = this.alive;
    if (alive.length > (this.starters > 1 ? 1 : 0)) return undefined;
    return alive[0] || null;
  }

  // The player with the highest score, or null if tied.
  topScorer() {
    const list = [...this.players.values()].sort((a, b) => b.score - a.score);
    if (!list.length || (list[1] && list[1].score === list[0].score)) return null;
    return list[0];
  }

  finish(winner) {
    this.state = ST.over;
    this.events.push({ k: 'over', p: winner ? winner.idx : -1 });
    const standings = [...this.players.values()]
      .sort((a, b) => b.wins - a.wins || b.score - a.score)
      .map((p) => ({ id: p.id, name: p.name, color: p.color, score: p.wins }));
    this.result = { winnerId: winner ? winner.id : null, standings };
  }

  // Positions as the client with view tick vt saw them (lag compensation), or null for "now".
  rewound(vt) {
    const rewind = vt >= 0 ? Math.max(0, Math.min(MAX_REWIND, this.tick - vt)) : 0;
    return rewind > 0 ? this.history.at(this.tick - rewind) : null;
  }

  packPlayer() {
    return [];
  }

  packWorld() {
    return 0;
  }

  common() {
    if (this.cache && this.cache.t === this.tick) return this.cache;
    this.cache = {
      t: this.tick,
      st: this.state,
      tm: r2(Math.max(0, this.timer)),
      rt: r2(this.rt),
      rd: this.round,
      p: [...this.players.values()].map((p) => [p.idx, r1(p.x), r1(p.y), r2(p.aim), p.state, p.wins, ...this.packPlayer(p)]),
      x: this.packWorld(),
      ev: this.events,
    };
    this.events = [];
    return this.cache;
  }

  snapshotFor(id) {
    const c = this.common();
    const p = this.players.get(id);
    if (!p || p.state !== PS.alive) return c;
    return { ...c, me: { ack: p.cmds.ack, ...this.packMe(p) } };
  }
}
