import { OPS, GUNS, PICKUPS, MAPS, MAP_IDS, newArmory, stepGun, currentGun } from '../../public/shared/ops.js';
import { newWalker, stepWalker } from '../../public/shared/walker.js';
import { rayBlocks, rayCircle, lineClear } from '../../public/shared/world.js';
import { DT } from '../../public/shared/loop.js';
import { ArenaGame, ST, PS, r1, r2 } from './arena.js';

const mapOption = { key: 'map', label: 'Map', options: [['random', 'Random'], ...MAP_IDS.map((id) => [id, MAPS[id].name])], def: 'random' };

export const OPS_INFO = {
  id: 'ops',
  name: 'Dark Ops',
  blurb: 'Flashlight shootout in dark facilities. Find better guns.',
  settings: [
    { key: 'mode', label: 'Mode', options: [['ffa', 'Free for all'], ['tdm', 'Team deathmatch']], def: 'ffa' },
    { key: 'kills', label: 'Kills to win', options: [[10, '10'], [20, '20'], [30, '30']], def: 20 },
    { key: 'time', label: 'Time limit', options: [[180, '3 min'], [300, '5 min'], [480, '8 min']], def: 300 },
    mapOption,
  ],
};

export const INFECTION_INFO = {
  id: 'infection',
  name: 'Infection',
  blurb: 'Survivors with flashlights against fast infected. Anyone tagged turns.',
  settings: [
    { key: 'rounds', label: 'Rounds to win', options: [[1, '1'], [3, '3'], [5, '5']], def: 3 },
    { key: 'time', label: 'Round time', options: [[60, '1 min'], [90, '1.5 min'], [120, '2 min']], def: 90 },
    mapOption,
  ],
};

export const GUN_CODE = ['pistol', 'smg', 'shotgun', 'rifle'];
const angleDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const WALK_OPTS = { speed: OPS.speed, dash: false, radius: OPS.radius };

// Top-down shooter in the dark. Each player sees a flashlight cone and a small circle around
// themselves; the server only sends them enemies inside that, and decides every hit.
// kind 'ops': free-for-all or team deathmatch with respawns. kind 'infection': survivors vs infected.
export class Ops extends ArenaGame {
  constructor(opts, kind) {
    super(opts);
    this.kind = kind;
    this.mode = kind === 'infection' ? 'inf' : opts.settings.mode;
    this.target = kind === 'infection' ? opts.settings.rounds : 1;
    this.timeLimit = opts.settings.time;
    this.killTarget = this.mode === 'tdm' ? opts.settings.kills * 2 : opts.settings.kills;
    this.mapSetting = opts.settings.map;
    this.mapId = null;
    this.startRound(this.firstCountdown);
  }

  newPlayer(p) {
    Object.assign(p, newWalker(0, 0), newArmory(), { r: OPS.radius, hp: OPS.hp, kills: 0, deaths: 0, team: 0, inf: false, deadT: 0, stunT: 0, pev: [] });
  }

  addPlayer(info) {
    const p = super.addPlayer(info);
    if (this.kind === 'ops' && this.state !== undefined) {
      // A deathmatch is one long round: late joiners spawn after the usual respawn wait.
      p.team = this.mode === 'tdm' ? this.smallerTeam() : p.idx;
      p.state = PS.dead;
      p.deadT = OPS.respawn;
    }
    return p;
  }

  smallerTeam() {
    const n = [0, 0];
    for (const q of this.players.values()) if (q.team === 0 || q.team === 1) n[q.team]++;
    return n[0] <= n[1] ? 0 : 1;
  }

  init() {
    return { target: this.target, kind: this.kind, mode: this.mode, killTarget: this.killTarget, time: this.timeLimit };
  }

  setupRound(list) {
    if (this.mapSetting !== 'random') this.mapId = this.mapSetting;
    else {
      const choices = MAP_IDS.filter((id) => id !== this.mapId);
      this.mapId = choices[Math.floor(this.rng() * choices.length)];
    }
    this.map = MAPS[this.mapId];
    this.items = this.map.items.map(([x, y, g]) => ({ x, y, g, wait: 0 }));
    this.drops = [];
    const infected = Math.max(1, Math.round(list.length / 6));
    list.forEach((p, i) => {
      if (this.mode === 'tdm') p.team = i % 2;
      else if (this.mode === 'ffa') p.team = p.idx;
      else p.team = 0;
      p.inf = this.mode === 'inf' && i < infected && list.length > 1;
    });
    for (const p of list) this.respawn(p);
  }

  enemies(a, b) {
    return a !== b && a.team !== b.team && !(this.mode === 'inf' && a.inf === b.inf);
  }

  // The spawn point farthest from any living enemy.
  respawn(p) {
    let spots = this.map.spawns;
    if (this.mode === 'tdm') spots = spots.filter(([x]) => (x < this.map.w / 2) === (p.team === 0));
    let best = spots[0];
    let bestD = -1;
    for (const s of spots) {
      let d = Infinity;
      for (const q of this.players.values()) {
        if (q.state === PS.alive && this.enemies(p, q)) d = Math.min(d, Math.hypot(q.x - s[0], q.y - s[1]));
      }
      d += this.rng() * 50;
      if (d > bestD) {
        bestD = d;
        best = s;
      }
    }
    Object.assign(p, newWalker(best[0], best[1], this.rng() * Math.PI * 2), newArmory(), { hp: OPS.hp, deadT: 0, stunT: 0, state: PS.alive });
    p.spd = p.inf ? OPS.infectedSpeed : 1;
  }

  playerTick(p, cmd, frozen) {
    if (p.state === PS.dead) {
      p.deadT -= DT;
      if (p.deadT <= 0 && this.kind === 'ops' && this.state === ST.playing) this.respawn(p);
      return;
    }
    if (p.state !== PS.alive) return;
    p.stunT = Math.max(0, p.stunT - DT);
    const move = p.stunT > 0 ? { ...cmd, mx: 0, my: 0 } : cmd;
    stepWalker(p, move, this.map, WALK_OPTS, frozen);
    if (p.inf) return;
    const fired = stepGun(p, cmd, frozen);
    if (fired) this.fire(p, fired, cmd.vt);
    if (cmd.b & 16 && !frozen) this.pickup(p);
  }

  worldTick(frozen) {
    for (const it of this.items) it.wait = Math.max(0, it.wait - DT);
    for (const d of this.drops) d.life -= DT;
    this.drops = this.drops.filter((d) => d.life > 0);
    if (frozen || this.mode !== 'inf') return;
    // Infected tag survivors by touching them.
    const alive = this.alive;
    for (const z of alive) {
      if (!z.inf || z.stunT > 0) continue;
      for (const s of alive) {
        if (s.inf || Math.hypot(s.x - z.x, s.y - z.y) > s.r + z.r + 2) continue;
        s.inf = true;
        s.spd = OPS.infectedSpeed;
        s.reloadT = 0;
        z.kills++;
        this.events.push({ k: 'infect', p: z.idx, v: s.idx });
        this.emitAt(s.x, s.y, { k: 'hit', v: s.idx, x: r1(s.x), y: r1(s.y), a: r2(Math.atan2(s.y - z.y, s.x - z.x)) }, [s, z]);
      }
    }
  }

  roundResult() {
    if (this.mode === 'inf') {
      const survivors = this.alive.filter((p) => !p.inf);
      if (this.starters > 1 && survivors.length <= 1) return survivors[0] || null;
      if (this.starters <= 1 && survivors.length === 0) return null;
      if (this.rt >= this.timeLimit) return null;
      return undefined;
    }
    const list = [...this.players.values()];
    let done = this.rt >= this.timeLimit;
    if (this.mode === 'tdm') {
      const score = this.teamScores();
      if (Math.max(...score) >= this.killTarget) done = true;
      if (done) {
        const t = score[0] === score[1] ? -1 : score[0] > score[1] ? 0 : 1;
        this.finishTeams(t);
      }
    } else {
      if (list.some((p) => p.kills >= this.killTarget)) done = true;
      if (done) this.finish(this.topKiller());
    }
    return undefined;
  }

  teamScores() {
    const s = [0, 0];
    for (const p of this.players.values()) if (p.team === 0 || p.team === 1) s[p.team] += p.kills;
    return s;
  }

  topKiller() {
    const list = [...this.players.values()].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    if (!list.length || (list[1] && list[1].kills === list[0].kills && list[1].deaths === list[0].deaths)) return null;
    return list[0];
  }

  finish(winner) {
    super.finish(winner);
    if (this.kind === 'ops') {
      this.result.standings = [...this.players.values()]
        .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
        .map((p) => ({ id: p.id, name: p.name, color: p.color, score: p.kills }));
    }
  }

  finishTeams(team) {
    this.finish(null);
    if (team < 0) return;
    this.result.winnerIds = [...this.players.values()].filter((p) => p.team === team).map((p) => p.id);
    this.result.title = team === 0 ? 'Red team wins!' : 'Blue team wins!';
    this.result.team = team;
  }

  fire(p, gid, vt) {
    const g = GUNS[gid];
    const past = this.rewound(vt);
    const shots = [];
    for (let i = 0; i < g.pellets; i++) {
      const a = p.aim + (this.rng() * 2 - 1) * g.spread;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      let best = rayBlocks(p.x, p.y, dx, dy, g.range, this.map.blocks);
      let hit = null;
      for (const q of this.players.values()) {
        if (q.state !== PS.alive || !this.enemies(p, q)) continue;
        const pos = (past && past.get(q.id)) || q;
        const t = rayCircle(p.x, p.y, dx, dy, pos.x, pos.y, q.r);
        if (t < best) {
          best = t;
          hit = q;
        }
      }
      shots.push([r2(a), r1(best)]);
      if (hit) this.damage(hit, p, g.dmg, a);
    }
    // Tracers go to whoever can see the shooter; the muzzle flash shows the spot to anyone nearby.
    const shot = { k: 'shot', p: p.idx, x: r1(p.x), y: r1(p.y), g: GUN_CODE.indexOf(gid), s: shots };
    for (const v of this.players.values()) {
      if (v === p) continue;
      const near = Math.hypot(v.x - p.x, v.y - p.y) <= OPS.flashReveal;
      if (near || !this.enemies(v, p) || this.canSee(v, p.x, p.y, p.r)) v.pev.push(shot);
    }
  }

  damage(q, p, dmg, a) {
    const ev = { k: 'hit', v: q.idx, x: r1(q.x), y: r1(q.y), a: r2(a) };
    this.emitAt(q.x, q.y, ev, [q, p]);
    if (q.inf) {
      q.stunT = OPS.stun;
      q.vx = Math.cos(a) * 300;
      q.vy = Math.sin(a) * 300;
      return;
    }
    q.hp -= dmg;
    if (q.hp > 0) return;
    q.state = PS.dead;
    q.deadT = OPS.respawn;
    q.deaths++;
    p.kills++;
    p.score = p.kills;
    if (q.prim) this.drops.push({ x: q.x, y: q.y, g: q.prim, mag: q.mag, res: q.res, life: OPS.dropLife });
    this.events.push({ k: 'kill', p: p.idx, v: q.idx, g: GUN_CODE.indexOf(currentGun(p)) });
  }

  pickup(p) {
    let best = null;
    let bestD = OPS.pickupReach;
    const consider = (it) => {
      const d = Math.hypot(it.x - p.x, it.y - p.y);
      if (d <= bestD) {
        best = it;
        bestD = d;
      }
    };
    for (const it of this.items) if (it.wait <= 0) consider(it);
    for (const d of this.drops) consider(d);
    if (!best) return;
    if (p.prim) this.drops.push({ x: p.x, y: p.y, g: p.prim, mag: p.mag, res: p.res, life: OPS.dropLife });
    const g = GUNS[best.g];
    p.prim = best.g;
    p.mag = best.mag ?? g.mag;
    p.res = best.res ?? g.reserve;
    p.slot = 1;
    p.reloadT = 0;
    if (this.drops.includes(best)) this.drops.splice(this.drops.indexOf(best), 1);
    else best.wait = OPS.itemRespawn;
  }

  // Whether viewer v's flashlight or near circle reaches a circle at (x, y) of radius rad.
  canSee(v, x, y, rad) {
    if (v.state !== PS.alive) return false;
    const dx = x - v.x;
    const dy = y - v.y;
    const d = Math.hypot(dx, dy);
    if (d > OPS.near + rad) {
      if (d > OPS.range + rad) return false;
      if (angleDiff(Math.atan2(dy, dx), v.aim) > OPS.cone + Math.asin(Math.min(1, rad / d))) return false;
    }
    const px = d > 1e-6 ? -dy / d : 0;
    const py = d > 1e-6 ? dx / d : 0;
    for (const k of [0, 0.8, -0.8]) {
      if (lineClear(v.x, v.y, x + px * rad * k, y + py * rad * k, this.map.blocks)) return true;
    }
    return false;
  }

  // A positional event for the players involved and anyone who can see the spot.
  emitAt(x, y, ev, involved) {
    for (const v of this.players.values()) {
      if (involved.includes(v) || this.canSee(v, x, y, 4)) v.pev.push(ev);
    }
  }

  common() {
    if (this.cache && this.cache.t === this.tick) return this.cache;
    let active = 0;
    this.items.forEach((it, i) => {
      if (it.wait <= 0) active |= 1 << i;
    });
    this.cache = {
      t: this.tick,
      st: this.state,
      tm: r2(Math.max(0, this.timer)),
      rt: r2(this.rt),
      rd: this.round,
      x: [this.mapId, active, this.drops.map((d) => [r1(d.x), r1(d.y), GUN_CODE.indexOf(d.g)])],
      k: [...this.players.values()].map((p) => [p.idx, p.kills, p.deaths, p.team, p.wins, p.state === PS.alive ? 1 : 0, p.inf ? 1 : 0]),
      ev: this.events,
    };
    this.events = [];
    return this.cache;
  }

  row(q) {
    const gun = q.inf ? -1 : GUN_CODE.indexOf(currentGun(q));
    return [q.idx, r1(q.x), r1(q.y), r2(q.aim), q.state, q.wins, Math.max(0, Math.round(q.hp)), gun, (q.inf ? 1 : 0) | (q.stunT > 0 ? 2 : 0)];
  }

  snapshotFor(id) {
    const c = this.common();
    const v = this.players.get(id);
    const rows = [];
    for (const q of this.players.values()) {
      if (q.state !== PS.alive) continue;
      // Spectators (not in the game) see everyone; players see themselves, teammates and what's in their light.
      if (!v || q === v || !this.enemies(v, q) || this.canSee(v, q.x, q.y, q.r)) rows.push(this.row(q));
    }
    const snap = { ...c, p: rows, ev: v && v.pev.length ? [...c.ev, ...v.pev] : c.ev };
    if (v) {
      v.pev = [];
      if (v.state === PS.alive) {
        snap.me = {
          ack: v.cmds.ack, x: r2(v.x), y: r2(v.y), vx: r2(v.vx), vy: r2(v.vy), aim: r2(v.aim), dashT: 0, dashCd: 0, knockT: 0,
          spd: v.spd, inf: v.inf, stunT: r2(v.stunT), hp: Math.round(v.hp), slot: v.slot, pm: v.pm, prim: v.prim, mag: v.mag,
          res: v.res, reloadT: r2(v.reloadT), fireCd: r2(v.fireCd), trig: v.trig,
        };
      } else {
        snap.dead = r1(Math.max(0, v.deadT));
      }
    }
    return snap;
  }
}
