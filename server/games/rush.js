import { DT } from '../../public/shared/loop.js';
import { WALK, newWalker, stepWalker } from '../../public/shared/walker.js';
import { RUSH, RUSH_SIDES_MAP, RUSH_POWERS, RUSH_POWER_IDS, RUSH_CRATES, rushBlocks, useRushPower } from '../../public/shared/minis.js';
import { collideCircles } from '../physics.js';
import { ArenaGame, ST, PS, r1, r2 } from './arena.js';
import { roundsOption } from './walkgame.js';

export const RUSH_INFO = {
  id: 'rush',
  name: 'Wall Rush',
  blurb: 'Walls with gaps sweep down the platform. Slip through, punch rivals into them, or get pushed off.',
  settings: [roundsOption(3), { key: 'powers', label: 'Power-up crates', options: [[1, 'On'], [0, 'Off']], def: 1 }],
};

const FALL = 0.6;
const LO = RUSH.side + 20;
const HI = RUSH.w - RUSH.side - 20;

// Add a gap to a sorted [from, to, from, to...] list, merging any it overlaps.
function addGap(gaps, a, b) {
  const list = [];
  for (let i = 0; i < gaps.length; i += 2) list.push([gaps[i], gaps[i + 1]]);
  list.push([a, b]);
  list.sort((p, q) => p[0] - q[0]);
  const out = [];
  for (const g of list) {
    const last = out[out.length - 1];
    if (last && g[0] <= last[1]) last[1] = Math.max(last[1], g[1]);
    else out.push([...g]);
  }
  return out.flat();
}

export class Rush extends ArenaGame {
  constructor(opts) {
    super(opts);
    this.powersOn = (opts.settings.powers ?? 1) !== 0;
    this.nextId = 1;
    this.startRound(this.firstCountdown);
  }

  newPlayer(p) {
    Object.assign(p, newWalker(0, 0), { fallT: 0, held: '', uses: 0, trig: false, gcd: 0 });
  }

  setupRound(list) {
    this.bars = [];
    this.crates = [];
    this.drills = []; // drills used with no wall coming: they hit the next one
    this.spawnT = 1.5;
    this.crateT = RUSH_CRATES.first;
    this.freezeT = 0;
    this.map = { blocks: rushBlocks([]), zones: [] };
    list.forEach((p, i) => {
      Object.assign(p, newWalker(220 + (i % 4) * 253, 480 + Math.floor(i / 4) * 160, -Math.PI / 2), { fallT: 0, held: '', uses: 0, gcd: 0 });
    });
  }

  // A bar is a row with one or two gaps. Later on some of them slide from side to side.
  newBar() {
    const gw = Math.max(80, 170 - this.rt * 1.3);
    const n = this.rng() < 0.5 ? 1 : 2;
    const gaps = [];
    for (let tries = 0; gaps.length < n && tries < 20; tries++) {
      const a = LO + this.rng() * (HI - gw - LO);
      if (gaps.every(([g]) => Math.abs(g - a) > gw + 80)) gaps.push([a, a + gw]);
    }
    gaps.sort((p, q) => p[0] - q[0]);
    let flat = gaps.flat();
    for (const x of this.drills) flat = addGap(flat, x - RUSH_POWERS.drill.w / 2, x + RUSH_POWERS.drill.w / 2);
    this.drills = [];
    const slide = this.rt > 15 && this.rng() < 0.4 ? { amp: 60 + this.rng() * 90, rate: 1 + this.rng() * 0.8, ph: this.rng() * 6.28 } : null;
    const speed = Math.min(250, 120 + this.rt * 2.5);
    return { id: this.nextId++, y: -RUSH.bar - 20, speed, gaps: flat, slide, off: 0 };
  }

  // Where each bar's gaps are right now, as [y, from, to, ...].
  barRows() {
    return this.bars.map((b) => [b.y, ...b.gaps.map((g) => g + b.off)]);
  }

  playerTick(p, cmd, frozen) {
    if (p.state === PS.fall) {
      p.x += p.vx * DT;
      p.y += p.vy * DT;
      p.fallT += DT;
      if (p.fallT >= FALL) p.state = PS.out;
      return;
    }
    if (p.state !== PS.alive) return;
    const used = useRushPower(p, cmd, frozen);
    if (used) this.usePower(p, used);
    if (stepWalker(p, cmd, p.z > RUSH.air ? RUSH_SIDES_MAP : this.map, WALK, frozen)) this.events.push({ k: 'dash', p: p.idx });
  }

  usePower(p, kind) {
    if (kind === 'glove') {
      const g = RUSH_POWERS.glove;
      let hits = 0;
      for (const q of this.alive) {
        if (q === p) continue;
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        const off = Math.abs(Math.atan2(Math.sin(Math.atan2(dy, dx) - p.aim), Math.cos(Math.atan2(dy, dx) - p.aim)));
        if (d > p.r + g.reach + q.r || off > g.arc) continue;
        q.vx = (dx / d) * g.push;
        q.vy = (dy / d) * g.push;
        q.knockT = 0.35;
        q.dashT = 0;
        hits++;
      }
      this.events.push({ k: 'punch', p: p.idx, a: r2(p.aim), hit: hits });
    } else if (kind === 'drill') {
      // The nearest wall coming down above you, else the next one to appear.
      const w = RUSH_POWERS.drill.w;
      const above = this.bars.filter((b) => b.y + RUSH.bar < p.y - p.r).sort((a, b) => b.y - a.y)[0];
      if (above) {
        above.gaps = addGap(above.gaps, p.x - above.off - w / 2, p.x - above.off + w / 2);
        this.events.push({ k: 'drill', p: p.idx, x: r1(p.x), y: r1(above.y) });
      } else {
        this.drills.push(p.x);
        this.events.push({ k: 'drill', p: p.idx, x: r1(p.x), y: -20 });
      }
    } else if (kind === 'freeze') {
      this.freezeT = RUSH_POWERS.freeze.time;
      this.events.push({ k: 'freeze', p: p.idx });
    } else if (kind === 'spring') {
      this.events.push({ k: 'spring', p: p.idx });
    }
  }

  spawnCrate() {
    this.crateT -= DT;
    if (this.crateT > 0 || this.crates.length >= RUSH_CRATES.max) return;
    const x = LO + 40 + this.rng() * (HI - LO - 80);
    const y = 140 + this.rng() * 380;
    if (this.bars.some((b) => Math.abs(b.y + RUSH.bar / 2 - y) < 70)) return; // try again next tick
    this.crateT = RUSH_CRATES.every;
    const type = RUSH_POWER_IDS[Math.floor(this.rng() * RUSH_POWER_IDS.length)];
    this.crates.push({ id: this.nextId++, x, y, type });
  }

  worldTick(frozen) {
    const playing = !frozen && this.state === ST.playing;
    if (playing) {
      this.spawnT -= DT;
      if (this.spawnT <= 0) {
        this.bars.push(this.newBar());
        this.spawnT = Math.max(1.2, 3 - this.rt * 0.03);
      }
      if (this.powersOn) this.spawnCrate();
    }
    this.freezeT = Math.max(0, this.freezeT - DT);
    const slow = this.freezeT > 0 ? RUSH_POWERS.freeze.slow : 1;
    for (const b of this.bars) {
      b.y += b.speed * slow * DT;
      if (b.slide && playing) {
        // Slide, but keep every gap on the platform.
        const lo = Math.min(...b.gaps) - LO;
        const hi = HI - Math.max(...b.gaps);
        b.off = Math.max(-lo, Math.min(hi, Math.sin(this.rt * b.slide.rate + b.slide.ph) * b.slide.amp));
      }
    }
    this.bars = this.bars.filter((b) => b.y < RUSH.h + 200);
    this.map = { blocks: rushBlocks(this.barRows()), zones: [] };
    // Walls smash crates they run over.
    const solid = this.map.blocks.slice(2);
    this.crates = this.crates.filter((c) => {
      const hit = solid.some(([x, y, w, h]) => c.x > x - 14 && c.x < x + w + 14 && c.y > y - 14 && c.y < y + h + 14);
      if (hit) this.events.push({ k: 'smash', x: r1(c.x), y: r1(c.y), w: c.type });
      return !hit;
    });
    const grounded = this.alive.filter((p) => p.z <= RUSH.air);
    for (let i = 0; i < grounded.length; i++) {
      for (let j = i + 1; j < grounded.length; j++) collideCircles(grounded[i], grounded[j], 0.5);
    }
    if (frozen) return;
    for (const p of this.alive) {
      if (!p.held && p.z <= RUSH.air) {
        const i = this.crates.findIndex((c) => Math.hypot(c.x - p.x, c.y - p.y) <= RUSH_CRATES.reach + p.r);
        if (i >= 0) {
          const [c] = this.crates.splice(i, 1);
          p.held = c.type;
          p.uses = c.type === 'glove' ? RUSH_POWERS.glove.uses : 1;
          this.events.push({ k: 'grab', p: p.idx, w: c.type, x: r1(c.x), y: r1(c.y) });
        }
      }
      if (p.z <= RUSH.air && (p.y > RUSH.h || p.y < 0)) {
        p.state = PS.fall;
        this.events.push({ k: 'fall', p: p.idx });
      }
    }
  }

  roundResult() {
    return this.lastStanding();
  }

  packPlayer(p) {
    return [r2(p.fallT), r1(p.z), RUSH_POWER_IDS.indexOf(p.held)];
  }

  packWorld() {
    return [
      this.bars.map((b) => [b.id, r1(b.y), ...b.gaps.map((g) => r1(g + b.off))]),
      this.crates.map((c) => [c.id, r1(c.x), r1(c.y), RUSH_POWER_IDS.indexOf(c.type)]),
      r2(this.freezeT),
    ];
  }

  packMe(p) {
    return {
      x: r2(p.x), y: r2(p.y), vx: r2(p.vx), vy: r2(p.vy), aim: r2(p.aim), dashT: r2(p.dashT), dashCd: r2(p.dashCd), knockT: r2(p.knockT), spd: 1,
      z: r2(p.z), vz: r2(p.vz), held: p.held, uses: p.uses, trig: p.trig, gcd: r2(p.gcd),
    };
  }
}
