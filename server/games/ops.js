import { OPS, GUNS, GUN_IDS, LADDER, POWERS, POWER_IDS, CRATES, MAPS, MAP_IDS, newArmory, stepGun, currentGun, lightOf } from '../../public/shared/ops.js';
import { newWalker, stepWalker } from '../../public/shared/walker.js';
import { rayBlocks, rayBlocksHit, rayCircle, lineClear, collideBlocks } from '../../public/shared/world.js';
import { DT } from '../../public/shared/loop.js';
import { ArenaGame, ST, PS, r1, r2 } from './arena.js';

const mapOption = { key: 'map', label: 'Map', options: [['random', 'Random'], ...MAP_IDS.map((id) => [id, MAPS[id].name])], def: 'random' };
const powersOption = { key: 'powers', label: 'Power-up crates', options: [[1, 'On'], [0, 'Off']], def: 1 };

export const OPS_INFO = {
  id: 'ops',
  name: 'Dark Ops',
  blurb: 'Flashlight shootout in dark facilities. Find better guns, or climb the Gun Game ladder.',
  settings: [
    { key: 'mode', label: 'Mode', options: [['ffa', 'Free for all'], ['tdm', 'Team deathmatch'], ['gungame', 'Gun Game']], def: 'ffa' },
    { key: 'kills', label: 'Kills to win', options: [[10, '10'], [20, '20'], [30, '30']], def: 20 },
    { key: 'time', label: 'Time limit', options: [[180, '3 min'], [300, '5 min'], [480, '8 min']], def: 300 },
    powersOption,
    mapOption,
  ],
};

export const INFECTION_INFO = {
  id: 'infection',
  name: 'Infection',
  blurb: 'Survivors with flashlights against fast infected. Tag someone for a point; survive the round for two.',
  settings: [
    { key: 'rounds', label: 'Rounds', options: [[2, '2'], [3, '3'], [5, '5']], def: 3 },
    { key: 'time', label: 'Round time', options: [[60, '1 min'], [90, '1.5 min'], [120, '2 min']], def: 90 },
    powersOption,
    mapOption,
  ],
};

export const GUN_CODE = GUN_IDS;
const angleDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const WALK_OPTS = { speed: OPS.speed, dash: false, radius: OPS.radius };
const INFECTED_HOLD = 5; // seconds the infected wait at the start of a round
const REVEAL = 1; // seconds a cloaked shooter stays visible after firing

// Top-down shooter in the dark. Each player sees a flashlight cone and a small circle around
// themselves; the server only sends them enemies inside that, and decides every hit.
// kind 'ops': free-for-all, team deathmatch or Gun Game with respawns.
// kind 'infection': survivors vs infected over a set number of rounds.
export class Ops extends ArenaGame {
  constructor(opts, kind) {
    super(opts);
    const s = opts.settings;
    this.kind = kind;
    this.mode = kind === 'infection' ? 'inf' : s.mode;
    this.target = kind === 'infection' ? s.rounds : 1;
    if (kind === 'infection') {
      this.scoring = 'points';
      this.drawEvent = 'roundover'; // rounds have no single winner
    }
    this.timeLimit = s.time;
    this.killTarget = this.mode === 'tdm' ? s.kills * 2 : this.mode === 'gungame' ? LADDER.length : s.kills;
    this.powersOn = s.powers !== 0;
    this.mapSetting = s.map;
    this.mapId = null;
    this.nextId = 1;
    this.startRound(this.firstCountdown);
  }

  newPlayer(p) {
    Object.assign(p, newWalker(0, 0), newArmory(), {
      r: OPS.radius, hp: OPS.hp, kills: 0, deaths: 0, team: 0, inf: false, deadT: 0, stunT: 0, holdT: 0, level: 0,
      pow: '', powT: 0, revealT: 0, pev: [],
    });
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
    return { ...super.init(), kind: this.kind, mode: this.mode, killTarget: this.killTarget, time: this.timeLimit };
  }

  setupRound(list) {
    if (this.mapSetting !== 'random') this.mapId = this.mapSetting;
    else {
      const choices = MAP_IDS.filter((id) => id !== this.mapId);
      this.mapId = choices[Math.floor(this.rng() * choices.length)];
    }
    this.map = MAPS[this.mapId];
    // Gun Game hands out guns itself, so there are no gun pickups.
    this.items = this.mode === 'gungame' ? [] : this.map.items.map(([x, y, g]) => ({ x, y, g, wait: 0 }));
    this.drops = [];
    this.crates = [];
    this.crateT = 4;
    this.flares = [];
    this.decoys = [];
    list.forEach((p, i) => {
      if (this.mode === 'tdm') p.team = i % 2;
      else if (this.mode === 'inf') p.team = 0;
      else p.team = p.idx;
      p.inf = false;
    });
    if (this.mode === 'inf') {
      // Everyone takes a turn starting as the infected (in join order), one per six players.
      const order = [...this.players.values()].sort((a, b) => a.idx - b.idx);
      const n = Math.max(1, Math.round(list.length / 6));
      for (let k = 0; k < n && list.length > 1; k++) order[(this.round - 1 + k) % order.length].inf = true;
      // The infected start together at one spawn point and are held there a few seconds.
      const den = Math.floor(this.rng() * this.map.spawns.length);
      list.filter((p) => p.inf).forEach((p, k) => {
        this.respawn(p, this.map.spawns[(den + k) % this.map.spawns.length]);
        p.holdT = INFECTED_HOLD;
      });
      for (const p of list) if (!p.inf) this.respawn(p);
      return;
    }
    for (const p of list) this.respawn(p);
  }

  enemies(a, b) {
    if (a === b) return false;
    return this.mode === 'inf' ? a.inf !== b.inf : a.team !== b.team;
  }

  // At the given spot, or the spawn point farthest from any living enemy.
  respawn(p, at = null) {
    let spots = this.map.spawns;
    if (this.mode === 'tdm') spots = spots.filter(([x]) => (x < this.map.w / 2) === (p.team === 0));
    let best = at || spots[0];
    let bestD = -1;
    for (const s of at ? [] : spots) {
      let d = Infinity;
      for (const q of this.players.values()) {
        if (q !== p && q.state === PS.alive && (this.enemies(p, q) || q.inf !== p.inf)) d = Math.min(d, Math.hypot(q.x - s[0], q.y - s[1]));
      }
      d += this.rng() * 50;
      if (d > bestD) {
        bestD = d;
        best = s;
      }
    }
    Object.assign(p, newWalker(best[0], best[1], this.rng() * Math.PI * 2), newArmory(), {
      hp: OPS.hp, deadT: 0, stunT: 0, holdT: 0, state: PS.alive, pow: '', powT: 0, revealT: 0,
    });
    p.spd = p.inf ? OPS.infectedSpeed : 1;
    if (this.mode === 'gungame') this.equipLevel(p);
  }

  // Gun Game: hold the gun for your rung of the ladder, with endless spare ammo.
  equipLevel(p) {
    const id = LADDER[Math.min(p.level, LADDER.length - 1)];
    if (id === 'pistol') {
      Object.assign(p, { prim: '', slot: 0, pm: GUNS.pistol.mag });
    } else {
      Object.assign(p, { prim: id, slot: 1, mag: GUNS[id].mag, res: -1 });
    }
    p.reloadT = 0;
    p.bq = 0;
  }

  playerTick(p, cmd, frozen) {
    if (p.state === PS.dead) {
      p.deadT -= DT;
      if (p.deadT <= 0 && this.kind === 'ops' && this.state === ST.playing) this.respawn(p);
      return;
    }
    if (p.state !== PS.alive) return;
    p.stunT = Math.max(0, p.stunT - DT);
    p.revealT = Math.max(0, p.revealT - DT);
    if (p.powT > 0) {
      p.powT -= DT;
      if (p.powT <= 0) p.pow = '';
    }
    if (!frozen) p.holdT = Math.max(0, p.holdT - DT);
    const move = p.stunT > 0 || p.holdT > 0 ? { ...cmd, mx: 0, my: 0 } : cmd;
    stepWalker(p, move, this.map, WALK_OPTS, frozen);
    if (!frozen) this.grabCrate(p);
    if (p.inf) return;
    if (this.mode === 'gungame' && cmd.b & 8) cmd = { ...cmd, b: cmd.b & ~8 }; // one gun at a time
    const fired = stepGun(p, cmd, frozen);
    if (fired) this.fire(p, fired, cmd.vt);
    if (cmd.b & 16 && !frozen) this.pickup(p);
  }

  worldTick(frozen) {
    for (const it of this.items) it.wait = Math.max(0, it.wait - DT);
    for (const d of this.drops) d.life -= DT;
    this.drops = this.drops.filter((d) => d.life > 0);
    for (const f of this.flares) f.life -= DT;
    this.flares = this.flares.filter((f) => f.life > 0);
    this.moveDecoys();
    if (frozen) return;
    if (this.powersOn) this.spawnCrates();
    if (this.mode !== 'inf') return;
    // Infected tag survivors by touching them.
    const alive = this.alive;
    for (const z of alive) {
      if (!z.inf || z.stunT > 0 || z.holdT > 0) continue;
      for (const s of alive) {
        if (s.inf || Math.hypot(s.x - z.x, s.y - z.y) > s.r + z.r + 2) continue;
        s.inf = true;
        s.spd = OPS.infectedSpeed;
        s.reloadT = 0;
        s.pow = '';
        z.kills++;
        z.points++;
        this.events.push({ k: 'infect', p: z.idx, v: s.idx });
        this.emitAt(s.x, s.y, { k: 'hit', v: s.idx, x: r1(s.x), y: r1(s.y), a: r2(Math.atan2(s.y - z.y, s.x - z.x)) }, [s, z]);
      }
    }
  }

  // ---- power-up crates ----------------------------------------------------------------

  spawnCrates() {
    this.crateT -= DT;
    if (this.crateT > 0 || this.crates.length >= CRATES.max) return;
    this.crateT = CRATES.every;
    const spots = [...this.map.spawns, ...this.map.items.map(([x, y]) => [x, y])];
    for (let tries = 0; tries < 12; tries++) {
      const [x, y] = spots[Math.floor(this.rng() * spots.length)];
      const busy = this.crates.some((c) => Math.hypot(c.x - x, c.y - y) < 200) || this.alive.some((p) => Math.hypot(p.x - x, p.y - y) < 150);
      if (busy) continue;
      const type = POWER_IDS[Math.floor(this.rng() * POWER_IDS.length)];
      this.crates.push({ id: this.nextId++, x: x + 30, y, type });
      return;
    }
  }

  grabCrate(p) {
    const i = this.crates.findIndex((c) => Math.hypot(c.x - p.x, c.y - p.y) <= CRATES.reach + p.r);
    if (i < 0) return;
    const [c] = this.crates.splice(i, 1);
    const def = POWERS[c.type];
    p.pev.push({ k: 'power', type: c.type });
    if (c.type === 'flare') {
      this.flares.push({ x: p.x, y: p.y, life: def.life });
      this.events.push({ k: 'flare', x: r1(p.x), y: r1(p.y) });
    } else if (c.type === 'radar') {
      const pts = [...this.players.values()].filter((q) => q.state === PS.alive && this.enemies(p, q)).map((q) => [r1(q.x), r1(q.y)]);
      p.pev.push({ k: 'radar', pts });
    } else if (c.type === 'decoy') {
      this.decoys.push({ id: this.nextId++, owner: p, x: p.x, y: p.y, vx: Math.cos(p.aim) * def.speed, vy: Math.sin(p.aim) * def.speed, aim: p.aim, life: def.life, r: p.r });
    } else {
      p.pow = c.type;
      p.powT = def.time;
    }
  }

  moveDecoys() {
    for (const d of this.decoys) {
      d.x += d.vx * DT;
      d.y += d.vy * DT;
      if (collideBlocks(d, d.r, this.map.blocks)) {
        // Walk along walls like a confused player, turning a little.
        d.aim += 1.2;
        d.vx = Math.cos(d.aim) * POWERS.decoy.speed;
        d.vy = Math.sin(d.aim) * POWERS.decoy.speed;
      }
      d.life -= DT;
    }
    this.decoys = this.decoys.filter((d) => d.life > 0 && d.owner.state === PS.alive);
  }

  // ---- scoring ------------------------------------------------------------------------

  roundResult() {
    if (this.mode === 'inf') {
      // The round ends when everyone is infected or time runs out; survivors still standing score 2.
      const survivors = this.alive.filter((p) => !p.inf);
      if (survivors.length && this.rt < this.timeLimit) return undefined;
      for (const p of survivors) p.points += 2;
      this.events.push({ k: 'survived', n: survivors.length });
      return null;
    }
    const list = [...this.players.values()];
    let done = this.rt >= this.timeLimit;
    if (this.mode === 'tdm') {
      const score = this.teamScores();
      if (Math.max(...score) >= this.killTarget) done = true;
      if (done) this.finishTeams(score[0] === score[1] ? -1 : score[0] > score[1] ? 0 : 1);
    } else if (this.mode === 'gungame') {
      const champ = list.find((p) => p.level >= LADDER.length);
      if (champ) this.finish(champ);
      else if (done) this.finish(this.topKiller());
    } else {
      if (list.some((p) => p.kills >= this.killTarget)) done = true;
      if (done) this.finish(this.topKiller());
    }
    return undefined;
  }

  forceEnd() {
    if (this.mode === 'inf') return super.forceEnd();
    if (this.mode === 'tdm') {
      const score = this.teamScores();
      return this.finishTeams(score[0] === score[1] ? -1 : score[0] > score[1] ? 0 : 1);
    }
    this.finish(this.topKiller());
  }

  teamScores() {
    const s = [0, 0];
    for (const p of this.players.values()) if (p.team === 0 || p.team === 1) s[p.team] += p.kills;
    return s;
  }

  // Most kills (or highest Gun Game rung), fewest deaths breaking ties.
  rank(p) {
    return this.mode === 'gungame' ? p.level : p.kills;
  }

  topKiller() {
    const list = [...this.players.values()].sort((a, b) => this.rank(b) - this.rank(a) || a.deaths - b.deaths);
    if (!list.length || (list[1] && this.rank(list[1]) === this.rank(list[0]) && list[1].deaths === list[0].deaths)) return null;
    return list[0];
  }

  finish(winner) {
    super.finish(winner);
    if (this.kind === 'ops') {
      this.result.standings = [...this.players.values()]
        .sort((a, b) => this.rank(b) - this.rank(a) || a.deaths - b.deaths)
        .map((p) => ({ id: p.id, name: p.name, color: p.color, score: this.rank(p) }));
    }
  }

  finishTeams(team) {
    this.finish(null);
    if (team < 0) return;
    this.result.winnerIds = [...this.players.values()].filter((p) => p.team === team).map((p) => p.id);
    this.result.title = team === 0 ? 'Red team wins!' : 'Blue team wins!';
    this.result.team = team;
  }

  // ---- shooting -----------------------------------------------------------------------

  fire(p, gid, vt) {
    const g = GUNS[gid];
    const past = this.rewound(vt);
    if (g.melee) return this.stab(p, g, past);
    const segs = [];
    const bounces = p.pow === 'ricochet' && p.powT > 0 ? 1 : 0;
    for (let i = 0; i < g.pellets; i++) {
      let a = p.aim + (this.rng() * 2 - 1) * g.spread;
      let x = p.x;
      let y = p.y;
      let left = g.range;
      for (let b = 0; b <= bounces && left > 0; b++) {
        const dx = Math.cos(a);
        const dy = Math.sin(a);
        const wall = rayBlocksHit(x, y, dx, dy, left, this.map.blocks);
        let best = wall.t;
        let hit = null;
        for (const q of this.players.values()) {
          if (q.state !== PS.alive || !this.enemies(p, q)) continue;
          const pos = (past && past.get(q.id)) || q;
          const t = rayCircle(x, y, dx, dy, pos.x, pos.y, q.r);
          if (t < best) {
            best = t;
            hit = q;
          }
        }
        let decoy = null;
        for (const d of this.decoys) {
          if (d.owner === p) continue;
          const t = rayCircle(x, y, dx, dy, d.x, d.y, d.r);
          if (t < best) {
            best = t;
            decoy = d;
            hit = null;
          }
        }
        segs.push([r1(x), r1(y), r1(x + dx * best), r1(y + dy * best)]);
        if (hit) this.damage(hit, p, g.dmg, a);
        if (decoy) this.popDecoy(decoy);
        if (hit || decoy || wall.t >= left) break;
        // Bounce off the wall face (Ricochet).
        x += dx * (best - 0.5);
        y += dy * (best - 0.5);
        left -= best;
        const dot = dx * wall.nx + dy * wall.ny;
        a = Math.atan2(dy - 2 * dot * wall.ny, dx - 2 * dot * wall.nx);
      }
    }
    if (p.pow === 'cloak') p.revealT = REVEAL;
    // Tracers go to whoever can see the shooter; the muzzle flash shows the spot to anyone nearby.
    this.broadcastShot(p, { k: 'shot', p: p.idx, g: GUN_CODE.indexOf(gid), s: segs });
  }

  // Knife: hits the nearest enemy just in front.
  stab(p, g, past) {
    let target = null;
    let bestD = Infinity;
    for (const q of this.players.values()) {
      if (q.state !== PS.alive || !this.enemies(p, q)) continue;
      const pos = (past && past.get(q.id)) || q;
      const d = Math.hypot(pos.x - p.x, pos.y - p.y);
      if (d > p.r + q.r + g.range || d >= bestD) continue;
      if (d > 1e-6 && angleDiff(Math.atan2(pos.y - p.y, pos.x - p.x), p.aim) > 1.0) continue;
      target = q;
      bestD = d;
    }
    for (const d of this.decoys) if (d.owner !== p && Math.hypot(d.x - p.x, d.y - p.y) < p.r + d.r + g.range) this.popDecoy(d);
    if (target) this.damage(target, p, g.dmg, p.aim);
    this.broadcastShot(p, { k: 'slash', p: p.idx, x: r1(p.x), y: r1(p.y), a: r2(p.aim) });
  }

  broadcastShot(p, ev) {
    for (const v of this.players.values()) {
      if (v === p) continue;
      const near = Math.hypot(v.x - p.x, v.y - p.y) <= OPS.flashReveal;
      if (near || !this.enemies(v, p) || this.canSee(v, p.x, p.y, p.r)) v.pev.push(ev);
    }
  }

  popDecoy(d) {
    d.life = 0;
    this.events.push({ k: 'pop', x: r1(d.x), y: r1(d.y), p: d.owner.idx });
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
    const gun = currentGun(p);
    if (this.mode === 'gungame') {
      p.level++;
      q.level = Math.max(0, q.level - 1);
      if (p.level < LADDER.length) this.equipLevel(p);
      this.events.push({ k: 'level', p: p.idx, l: p.level, v: q.idx, vl: q.level });
    } else if (q.prim) {
      this.drops.push({ x: q.x, y: q.y, g: q.prim, mag: q.mag, res: q.res, life: OPS.dropLife });
    }
    this.events.push({ k: 'kill', p: p.idx, v: q.idx, g: GUN_CODE.indexOf(gun) });
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
    p.bq = 0;
    if (this.drops.includes(best)) this.drops.splice(this.drops.indexOf(best), 1);
    else best.wait = OPS.itemRespawn;
  }

  // ---- what each player can see -------------------------------------------------------

  // Whether viewer v can see a circle at (x, y) of radius rad: in their flashlight, in their near
  // circle, or inside a flare's light. Walls block all three.
  canSee(v, x, y, rad) {
    if (v.state !== PS.alive) return false;
    for (const f of this.flares) {
      if (Math.hypot(x - f.x, y - f.y) <= POWERS.flare.radius + rad && lineClear(f.x, f.y, x, y, this.map.blocks)) return true;
    }
    const { cone, range } = lightOf(v);
    const dx = x - v.x;
    const dy = y - v.y;
    const d = Math.hypot(dx, dy);
    if (d > OPS.near + rad) {
      if (d > range + rad) return false;
      if (angleDiff(Math.atan2(dy, dx), v.aim) > cone + Math.asin(Math.min(1, rad / d))) return false;
    }
    const px = d > 1e-6 ? -dy / d : 0;
    const py = d > 1e-6 ? dx / d : 0;
    for (const k of [0, 0.8, -0.8]) {
      if (lineClear(v.x, v.y, x + px * rad * k, y + py * rad * k, this.map.blocks)) return true;
    }
    return false;
  }

  // Whether viewer v sees player q (Cloak hides q unless v is close or q just fired).
  seesPlayer(v, q) {
    if (q.pow === 'cloak' && q.powT > 0 && q.revealT <= 0 && Math.hypot(q.x - v.x, q.y - v.y) > POWERS.cloak.near) return false;
    return this.canSee(v, q.x, q.y, q.r);
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
      x: [
        this.mapId, active, this.drops.map((d) => [r1(d.x), r1(d.y), GUN_CODE.indexOf(d.g)]),
        this.crates.map((c) => [c.id, r1(c.x), r1(c.y), POWER_IDS.indexOf(c.type)]),
        this.flares.map((f) => [r1(f.x), r1(f.y), r1(f.life)]),
        this.items.map((it) => it.g),
      ],
      k: [...this.players.values()].map((p) => [p.idx, p.kills, p.deaths, p.team, this.tally(p), p.state === PS.alive ? 1 : 0, p.inf ? 1 : 0, p.level]),
      ev: this.events,
    };
    this.events = [];
    return this.cache;
  }

  row(q) {
    const gun = q.inf ? -1 : GUN_CODE.indexOf(currentGun(q));
    const cloaked = q.pow === 'cloak' && q.powT > 0;
    return [q.idx, r1(q.x), r1(q.y), r2(q.aim), q.state, this.tally(q), Math.max(0, Math.round(q.hp)), gun, (q.inf ? 1 : 0) | (q.stunT > 0 ? 2 : 0) | (cloaked ? 4 : 0)];
  }

  snapshotFor(id) {
    const c = this.common();
    const v = this.players.get(id);
    const rows = [];
    for (const q of this.players.values()) {
      if (q.state !== PS.alive) continue;
      // Spectators (not in the game) see everyone; players see themselves, teammates and what's in their light.
      if (!v || q === v || !this.enemies(v, q) || this.seesPlayer(v, q)) rows.push(this.row(q));
    }
    // Decoys look exactly like their owner to anyone who can see them.
    const decoys = [];
    for (const d of this.decoys) {
      if (!v || d.owner === v || !this.enemies(v, d.owner) || this.canSee(v, d.x, d.y, d.r)) {
        decoys.push([d.id, d.owner.idx, r1(d.x), r1(d.y), r2(d.aim), GUN_CODE.indexOf(currentGun(d.owner))]);
      }
    }
    const snap = { ...c, p: rows, d: decoys, ev: v && v.pev.length ? [...c.ev, ...v.pev] : c.ev };
    if (v) {
      v.pev = [];
      if (v.state === PS.alive) {
        snap.me = {
          ack: v.cmds.ack, x: r2(v.x), y: r2(v.y), vx: r2(v.vx), vy: r2(v.vy), aim: r2(v.aim), dashT: 0, dashCd: 0, knockT: 0,
          spd: v.spd, inf: v.inf, stunT: r2(v.stunT), holdT: r2(v.holdT), hp: Math.round(v.hp), slot: v.slot, pm: v.pm, prim: v.prim, mag: v.mag,
          res: v.res, reloadT: r2(v.reloadT), fireCd: r2(v.fireCd), trig: v.trig, bq: v.bq, bt: r2(v.bt), pow: v.pow, powT: r2(v.powT), level: v.level,
          gg: this.mode === 'gungame',
        };
      } else {
        snap.dead = r1(Math.max(0, v.deadT));
      }
    }
    return snap;
  }
}
