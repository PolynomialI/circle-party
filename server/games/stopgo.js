import { DT } from '../../public/shared/loop.js';
import { TRACK } from '../../public/shared/minis.js';
import { ST, PS, r1 } from './arena.js';
import { WalkGame, roundsOption } from './walkgame.js';

export const STOPGO_INFO = {
  id: 'stopgo',
  name: 'Stop & Go',
  blurb: 'Race to the far end. Anyone still moving when the light turns red is out.',
  settings: [roundsOption(3)],
};

const LIGHT = { green: 0, yellow: 1, red: 2 };
const MOVING = 40; // speed that counts as moving on red

export class StopGo extends WalkGame {
  constructor(opts) {
    super(opts, { maps: TRACK });
    this.startRound(this.firstCountdown);
  }

  setup() {
    this.light = LIGHT.green;
    this.lightT = 2 + this.rng() * 3;
    this.grace = 0;
    this.finisher = null;
  }

  update() {
    if (this.state !== ST.playing) return;
    this.lightT -= DT;
    if (this.light === LIGHT.green && this.lightT <= 0) {
      this.light = LIGHT.yellow;
      this.lightT = 0.9;
    } else if (this.light === LIGHT.yellow && this.lightT <= 0) {
      this.light = LIGHT.red;
      this.lightT = 2 + this.rng() * 2.5;
      this.grace = 0.3;
    } else if (this.light === LIGHT.red) {
      this.grace -= DT;
      if (this.lightT <= 0) {
        this.light = LIGHT.green;
        this.lightT = 1.5 + this.rng() * 3.5;
      } else if (this.grace <= 0) {
        for (const p of this.alive) {
          if (Math.hypot(p.vx, p.vy) <= MOVING) continue;
          p.state = PS.out;
          this.events.push({ k: 'zap', p: p.idx, x: r1(p.x), y: r1(p.y) });
        }
      }
    }
    for (const p of this.alive) if (!this.finisher && p.x >= this.map.finish) this.finisher = p;
  }

  roundResult() {
    if (this.finisher) return this.finisher;
    return this.alive.length === 0 ? null : undefined;
  }

  world() {
    return [this.light];
  }
}
