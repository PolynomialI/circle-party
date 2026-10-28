import { DT } from '../../public/shared/loop.js';
import { newWalker, stepWalker } from '../../public/shared/walker.js';
import { collideBlocks, rayBlocks, rayCircle } from '../../public/shared/world.js';
import { TANK, TANK_WEAPONS, TANK_WEAPON_IDS, TANK_CRATES, BULLET_KINDS, mazeMap, laserPath } from '../../public/shared/minis.js';
import { ArenaGame, PS, r1, r2 } from './arena.js';
import { roundsOption } from './walkgame.js';

export const TANKS_INFO = {
  id: 'tanks',
  name: 'Ricochet Tanks',
  blurb: 'Bullets bounce off the maze walls. One hit and you are out, including your own. Crates hold lasers, gatlings, frags and mines.',
  settings: [roundsOption(3), { key: 'powers', label: 'Weapon crates', options: [[1, 'On'], [0, 'Off']], def: 1 }],
};

export const TANK_WALK = { speed: TANK.speed, dash: false, radius: TANK.radius };

export class Tanks extends ArenaGame {
  constructor(opts) {
    super(opts);
    this.nextId = 1;
    this.powersOn = (opts.settings.powers ?? 1) !== 0;
    this.startRound(this.firstCountdown);
  }

  newPlayer(p) {
    Object.assign(p, newWalker(0, 0), { r: TANK.radius, fireCd: 0, trig: false, weapon: '', ammo: 0, gunT: 0 });
  }

  setupRound(list) {
    this.seed = Math.floor(this.rng() * 1e9);
    this.map = mazeMap(this.seed);
    this.bullets = [];
    this.crates = [];
    this.mines = [];
    this.crateT = TANK_CRATES.first;
    const cells = this.shuffled(this.map.cells);
    list.forEach((p, i) => {
      const [x, y] = cells[i % cells.length];
      Object.assign(p, newWalker(x, y, this.rng() * Math.PI * 2), { fireCd: 0, trig: false, weapon: '', ammo: 0, gunT: 0 });
    });
  }

  playerTick(p, cmd, frozen) {
    if (p.state !== PS.alive) return;
    stepWalker(p, cmd, this.map, TANK_WALK, frozen);
    p.fireCd = Math.max(0, p.fireCd - DT);
    p.gunT = Math.max(0, p.gunT - DT);
    const held = (cmd.b & 1) !== 0;
    const click = held && !p.trig;
    p.trig = held;
    if (frozen) return;
    const frag = this.bullets.find((b) => b.owner === p && b.kind === 'frag' && b.age <= b.life);
    if (click && frag) this.burst(frag);
    else if (p.weapon === 'gatling') {
      if (held && p.gunT <= 0) this.gatling(p);
    } else if (click && p.weapon) this.useWeapon(p);
    else if (click && p.fireCd <= 0 && this.bullets.filter((b) => b.owner === p && b.kind === 'shell').length < TANK.max) this.fire(p);
  }

  // A projectile leaving the barrel (or just short of a wall the barrel pokes into).
  shoot(p, a, kind, speed, r, life) {
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const d = Math.min(p.r + 6, rayBlocks(p.x, p.y, dx, dy, p.r + 6, this.map.blocks) - r - 1);
    const b = { id: this.nextId++, x: p.x + dx * Math.max(0, d), y: p.y + dy * Math.max(0, d), vx: dx * speed, vy: dy * speed, owner: p, age: 0, kind, r, life };
    this.bullets.push(b);
    return b;
  }

  fire(p) {
    this.shoot(p, p.aim, 'shell', TANK.bullet, TANK.bulletR, TANK.life);
    p.fireCd = TANK.cooldown;
    this.events.push({ k: 'fire', p: p.idx });
  }

  gatling(p) {
    const g = TANK_WEAPONS.gatling;
    this.shoot(p, p.aim + (this.rng() * 2 - 1) * g.spread, 'gatling', g.speed, g.r, g.life);
    p.gunT = g.every;
    if (--p.ammo <= 0) p.weapon = '';
    this.events.push({ k: 'fire', p: p.idx });
  }

  useWeapon(p) {
    const kind = p.weapon;
    p.weapon = '';
    p.ammo = 0;
    if (kind === 'frag') {
      const f = TANK_WEAPONS.frag;
      this.shoot(p, p.aim, 'frag', f.speed, f.r, f.fuse);
      this.events.push({ k: 'fire', p: p.idx });
    } else if (kind === 'mine') {
      this.mines.push({ id: this.nextId++, x: p.x, y: p.y, owner: p, armT: TANK_WEAPONS.mine.arm });
      this.events.push({ k: 'mine', p: p.idx });
    } else if (kind === 'laser') {
      this.laser(p);
    }
  }

  // An instant beam: the first tank along it is out (you too, once it has bounced).
  laser(p) {
    const segs = laserPath(p.x, p.y, p.aim, this.map.blocks);
    const out = [];
    for (let i = 0; i < segs.length; i++) {
      const [x0, y0, x1, y1] = segs[i];
      const len = Math.hypot(x1 - x0, y1 - y0);
      const dx = (x1 - x0) / (len || 1);
      const dy = (y1 - y0) / (len || 1);
      let hit = null;
      let best = len;
      for (const q of this.alive) {
        if (q === p && i === 0) continue;
        const t = rayCircle(x0, y0, dx, dy, q.x, q.y, q.r);
        if (t < best) {
          best = t;
          hit = q;
        }
      }
      out.push([r1(x0), r1(y0), r1(x0 + dx * best), r1(y0 + dy * best)]);
      if (hit) {
        this.kill(hit, p);
        break;
      }
    }
    this.events.push({ k: 'laser', p: p.idx, s: out });
  }

  // A frag shell bursts into shards flying every way.
  burst(b) {
    const f = TANK_WEAPONS.frag;
    if (b.age === Infinity) return;
    b.age = Infinity;
    for (let i = 0; i < f.shards; i++) {
      const a = (i / f.shards) * Math.PI * 2 + this.rng() * 0.2;
      this.bullets.push({ id: this.nextId++, x: b.x, y: b.y, vx: Math.cos(a) * f.shardSpeed, vy: Math.sin(a) * f.shardSpeed, owner: b.owner, age: 0.15, kind: 'shard', r: 3, life: f.shardLife });
    }
    this.events.push({ k: 'burst', x: r1(b.x), y: r1(b.y) });
  }

  kill(p, by) {
    if (p.state !== PS.alive) return;
    p.state = PS.out;
    this.events.push({ k: 'boom', p: p.idx, x: r1(p.x), y: r1(p.y), by: by.idx });
  }

  spawnCrate() {
    this.crateT -= DT;
    if (this.crateT > 0 || this.crates.length >= TANK_CRATES.max) return;
    const free = this.map.cells.filter(([x, y]) => !this.alive.some((p) => Math.hypot(p.x - x, p.y - y) < 120) && !this.crates.some((c) => c.x === x && c.y === y));
    if (!free.length) return;
    const [x, y] = free[Math.floor(this.rng() * free.length)];
    this.crates.push({ id: this.nextId++, x, y, type: TANK_WEAPON_IDS[Math.floor(this.rng() * TANK_WEAPON_IDS.length)] });
    this.crateT = TANK_CRATES.every;
  }

  worldTick(frozen) {
    if (!frozen && this.powersOn) this.spawnCrate();
    for (const b of this.bullets) {
      for (let s = 0; s < 2; s++) {
        b.x += (b.vx * DT) / 2;
        b.y += (b.vy * DT) / 2;
        if (collideBlocks(b, b.r, this.map.blocks, 1)) b.bounced = true;
      }
      b.age += DT;
      if (b.kind === 'frag' && b.age > b.life) this.burst(b);
    }
    for (const p of this.alive) {
      for (const b of this.bullets) {
        if (b.age > b.life || (b.owner === p && b.age < 0.15)) continue;
        if (Math.hypot(b.x - p.x, b.y - p.y) > p.r + b.r) continue;
        b.age = Infinity;
        this.kill(p, b.owner);
        break;
      }
    }
    this.bullets = this.bullets.filter((b) => b.age <= b.life);
    // Mines arm, then go off under anyone (their owner too).
    const mine = TANK_WEAPONS.mine;
    for (const m of this.mines) {
      m.armT -= DT;
      if (m.armT > 0 || !this.alive.some((p) => Math.hypot(p.x - m.x, p.y - m.y) < mine.r + p.r)) continue;
      m.gone = true;
      for (const p of this.alive) if (Math.hypot(p.x - m.x, p.y - m.y) < mine.blast + p.r) this.kill(p, m.owner);
      this.events.push({ k: 'blast', x: r1(m.x), y: r1(m.y) });
    }
    this.mines = this.mines.filter((m) => !m.gone);
    for (const p of this.alive) {
      if (p.weapon) continue;
      const i = this.crates.findIndex((c) => Math.hypot(c.x - p.x, c.y - p.y) <= TANK_CRATES.reach + p.r);
      if (i < 0) continue;
      const [c] = this.crates.splice(i, 1);
      p.weapon = c.type;
      p.ammo = c.type === 'gatling' ? TANK_WEAPONS.gatling.ammo : 1;
      this.events.push({ k: 'grab', p: p.idx, w: c.type, x: r1(c.x), y: r1(c.y) });
    }
  }

  roundResult() {
    return this.lastStanding();
  }

  packPlayer(p) {
    return [TANK_WEAPON_IDS.indexOf(p.weapon)];
  }

  packWorld() {
    return [
      this.seed,
      this.bullets.map((b) => [b.id, r1(b.x), r1(b.y), BULLET_KINDS.indexOf(b.kind)]),
      this.crates.map((c) => [c.id, c.x, c.y, TANK_WEAPON_IDS.indexOf(c.type)]),
      this.mines.map((m) => [m.id, r1(m.x), r1(m.y), m.armT <= 0 ? 1 : 0, m.owner.idx]),
    ];
  }

  packMe(p) {
    return { x: r2(p.x), y: r2(p.y), vx: r2(p.vx), vy: r2(p.vy), aim: r2(p.aim), dashT: 0, dashCd: 0, knockT: r2(p.knockT), spd: 1, weapon: p.weapon, ammo: p.ammo };
  }
}
