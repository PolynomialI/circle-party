import { DT } from '../../public/shared/loop.js';
import { WALK, newWalker, stepWalker } from '../../public/shared/walker.js';
import { HEX, HEX_TILES, HEX_VOID, hexAt, hexCenter } from '../../public/shared/minis.js';
import { collideCircles } from '../physics.js';
import { ArenaGame, ST, PS, r2 } from './arena.js';
import { roundsOption } from './walkgame.js';

export const HEXDROP_INFO = {
  id: 'hexdrop',
  name: 'Hex Drop',
  blurb: 'Tiles fall away just after you step on them. Last one standing wins.',
  settings: [roundsOption(3)],
};

const FALL = 0.6;

export class HexDrop extends ArenaGame {
  constructor(opts) {
    super(opts);
    this.startRound(this.firstCountdown);
  }

  newPlayer(p) {
    Object.assign(p, newWalker(0, 0), { fallT: 0 });
  }

  setupRound(list) {
    this.tiles = new Float32Array(HEX_TILES.length); // 0 solid, > 0 cracking for that long, -1 gone
    list.forEach((p, i) => {
      const a = (i / list.length) * Math.PI * 2;
      const t = HEX_TILES[hexAt(Math.cos(a) * 240, Math.sin(a) * 240)];
      const c = hexCenter(t[0], t[1]);
      Object.assign(p, newWalker(c.x, c.y, a + Math.PI), { fallT: 0 });
    });
  }

  playerTick(p, cmd, frozen) {
    if (p.state === PS.fall) {
      p.x += p.vx * DT;
      p.y += p.vy * DT;
      p.fallT += DT;
      if (p.fallT >= FALL) p.state = PS.out;
    } else if (p.state === PS.alive && stepWalker(p, cmd, HEX_VOID, WALK, frozen)) {
      this.events.push({ k: 'dash', p: p.idx });
    }
  }

  worldTick(frozen) {
    const alive = this.alive;
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        alive[i].m = alive[i].dashT > 0 ? 2.5 : 1;
        alive[j].m = alive[j].dashT > 0 ? 2.5 : 1;
        collideCircles(alive[i], alive[j], 0.7);
      }
    }
    if (frozen) return;
    for (let i = 0; i < this.tiles.length; i++) {
      if (this.tiles[i] > 0) {
        this.tiles[i] += DT;
        if (this.tiles[i] >= HEX.crack) this.tiles[i] = -1;
      }
    }
    for (const p of alive) {
      const i = hexAt(p.x, p.y);
      if (i < 0 || this.tiles[i] < 0) {
        p.state = PS.fall;
        this.events.push({ k: 'fall', p: p.idx });
      } else if (this.tiles[i] === 0 && this.state === ST.playing) {
        this.tiles[i] = 1e-4;
      }
    }
  }

  roundResult() {
    return this.lastStanding();
  }

  packPlayer(p) {
    return [r2(p.fallT)];
  }

  packWorld() {
    return Array.from(this.tiles, (t) => (t === 0 ? '0' : t > 0 ? '1' : '2')).join('');
  }

  packMe(p) {
    return { x: r2(p.x), y: r2(p.y), vx: r2(p.vx), vy: r2(p.vy), aim: r2(p.aim), dashT: r2(p.dashT), dashCd: r2(p.dashCd), knockT: r2(p.knockT), spd: 1 };
  }
}
