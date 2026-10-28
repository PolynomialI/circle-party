import { DT } from '../../public/shared/loop.js';
import { newWalker, stepWalker } from '../../public/shared/walker.js';
import { collideBlocks, rayBlocks } from '../../public/shared/world.js';
import { TANK, mazeMap } from '../../public/shared/minis.js';
import { ArenaGame, PS, r1, r2 } from './arena.js';
import { roundsOption } from './walkgame.js';

export const TANKS_INFO = {
  id: 'tanks',
  name: 'Ricochet Tanks',
  blurb: 'Bullets bounce off the maze walls. One hit and you are out, including your own.',
  settings: [roundsOption(3)],
};

export const TANK_WALK = { speed: TANK.speed, dash: false, radius: TANK.radius };

export class Tanks extends ArenaGame {
  constructor(opts) {
    super(opts);
    this.nextId = 1;
    this.startRound(this.firstCountdown);
  }

  newPlayer(p) {
    Object.assign(p, newWalker(0, 0), { r: TANK.radius, fireCd: 0, trig: false });
  }

  setupRound(list) {
    this.seed = Math.floor(this.rng() * 1e9);
    this.map = mazeMap(this.seed);
    this.bullets = [];
    const cells = this.shuffled(this.map.cells);
    list.forEach((p, i) => {
      const [x, y] = cells[i % cells.length];
      Object.assign(p, newWalker(x, y, this.rng() * Math.PI * 2), { fireCd: 0, trig: false });
    });
  }

  playerTick(p, cmd, frozen) {
    if (p.state !== PS.alive) return;
    stepWalker(p, cmd, this.map, TANK_WALK, frozen);
    p.fireCd = Math.max(0, p.fireCd - DT);
    const held = (cmd.b & 1) !== 0;
    if (!frozen && held && !p.trig && p.fireCd <= 0 && this.bullets.filter((b) => b.owner === p).length < TANK.max) this.fire(p);
    p.trig = held;
  }

  fire(p) {
    const dx = Math.cos(p.aim);
    const dy = Math.sin(p.aim);
    // Start at the barrel's end, or just short of a wall the barrel is poking into.
    const d = Math.min(p.r + 6, rayBlocks(p.x, p.y, dx, dy, p.r + 6, this.map.blocks) - TANK.bulletR - 1);
    const b = { id: this.nextId++, x: p.x + dx * Math.max(0, d), y: p.y + dy * Math.max(0, d), vx: dx * TANK.bullet, vy: dy * TANK.bullet, owner: p, age: 0 };
    this.bullets.push(b);
    p.fireCd = TANK.cooldown;
    this.events.push({ k: 'fire', p: p.idx });
  }

  worldTick() {
    for (const b of this.bullets) {
      for (let s = 0; s < 2; s++) {
        b.x += (b.vx * DT) / 2;
        b.y += (b.vy * DT) / 2;
        if (collideBlocks(b, TANK.bulletR, this.map.blocks, 1)) b.bounced = true;
      }
      b.age += DT;
    }
    for (const p of this.alive) {
      for (const b of this.bullets) {
        if (b.age > TANK.life || (b.owner === p && b.age < 0.15)) continue;
        if (Math.hypot(b.x - p.x, b.y - p.y) > p.r + TANK.bulletR) continue;
        p.state = PS.out;
        b.age = Infinity;
        this.events.push({ k: 'boom', p: p.idx, x: r1(p.x), y: r1(p.y), by: b.owner.idx });
        break;
      }
    }
    this.bullets = this.bullets.filter((b) => b.age <= TANK.life);
  }

  roundResult() {
    return this.lastStanding();
  }

  packWorld() {
    return [this.seed, this.bullets.map((b) => [b.id, r1(b.x), r1(b.y)])];
  }

  packMe(p) {
    return { x: r2(p.x), y: r2(p.y), vx: r2(p.vx), vy: r2(p.vy), aim: r2(p.aim), dashT: 0, dashCd: 0, knockT: r2(p.knockT), spd: 1 };
  }
}

