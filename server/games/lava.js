import { DT } from '../../public/shared/loop.js';
import { WALK } from '../../public/shared/walker.js';
import { LAVA, LAVA_MAP } from '../../public/shared/minis.js';
import { ST, PS, r1 } from './arena.js';
import { WalkGame, roundsOption } from './walkgame.js';

export const LAVA_INFO = {
  id: 'lava',
  name: 'Floor is Lava',
  blurb: 'The floor floods with lava in waves. Be on a stone or in the air when it does; stones sink as it goes on.',
  settings: [roundsOption(3)],
};

export const LAVA_WALK = { ...WALK, jump: true };
const PHASE = { safe: 0, warn: 1, lava: 2 };

export class Lava extends WalkGame {
  constructor(opts) {
    super(opts, { maps: { foundry: LAVA_MAP }, walk: LAVA_WALK, shove: 0.9 });
    this.startRound(this.firstCountdown);
  }

  setup() {
    this.stones = LAVA_MAP.stones.map(() => 1); // 1 up, 0 sunk
    this.phase = PHASE.safe;
    this.phaseT = LAVA.safe + 1;
    this.waves = 0;
  }

  update() {
    if (this.state !== ST.playing) return;
    this.phaseT -= DT;
    if (this.phaseT <= 0) {
      if (this.phase === PHASE.safe) {
        this.phase = PHASE.warn;
        this.phaseT = LAVA.warn;
        // Sink a couple of stones each wave, but always leave a few.
        const up = this.stones.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
        const keep = Math.max(3, Math.ceil(this.alive.length / 2) + 1);
        for (let k = 0; k < LAVA.sinkEach && up.length > keep; k++) this.stones[up.splice(Math.floor(this.rng() * up.length), 1)[0]] = 0;
      } else if (this.phase === PHASE.warn) {
        this.phase = PHASE.lava;
        this.phaseT = LAVA.lava + this.waves * 0.3;
        this.waves++;
      } else {
        this.phase = PHASE.safe;
        this.phaseT = Math.max(2.2, LAVA.safe - this.waves * 0.25);
      }
    }
    if (this.phase !== PHASE.lava) return;
    for (const p of this.alive) {
      if (p.z > 0) continue;
      const safe = LAVA_MAP.stones.some(([x, y], i) => this.stones[i] && Math.hypot(p.x - x, p.y - y) <= LAVA.stoneR);
      if (safe) continue;
      p.state = PS.out;
      this.events.push({ k: 'burn', p: p.idx, x: r1(p.x), y: r1(p.y) });
    }
  }

  roundResult() {
    return this.lastStanding();
  }

  packPlayer(p) {
    return [r1(p.z || 0)];
  }

  world() {
    return [this.phase, r1(Math.max(0, this.phaseT)), this.stones.join('')];
  }

  packMe(p) {
    return { ...super.packMe(p), z: r1(p.z || 0), vz: r1(p.vz || 0) };
  }
}
