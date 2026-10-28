import { DT } from '../../public/shared/loop.js';
import {
  COURSES, DEATHRUN_IDS, SKYRUN_IDS, TRAPS, TRAP_STATE, BUTTON_U, course, newRunner, stepRunner, stepKiller,
  onFloor, toWorld, trapKills, trapSolids,
} from '../../public/shared/course.js';
import { ArenaGame, PS, r1, r2 } from './arena.js';

const mapOf = (ids) => ({ key: 'map', label: 'Course', options: [['random', 'Random'], ...ids.map((id) => [id, COURSES[id].name])], def: 'random' });

export const DEATHRUN_INFO = {
  id: 'deathrun',
  name: 'Deathrunner',
  blurb: 'One killer rides the raised track firing traps; everyone else runs the obstacle course. Kills and finishes score points.',
  settings: [
    { key: 'rounds', label: 'Rounds', options: [[0, 'Everyone is killer once'], [2, '2'], [3, '3'], [4, '4'], [6, '6']], def: 0 },
    { key: 'time', label: 'Round time', options: [[90, '1.5 min'], [120, '2 min'], [180, '3 min']], def: 120 },
    mapOf(DEATHRUN_IDS),
  ],
};

export const SKYRUN_INFO = {
  id: 'skyrun',
  name: 'Sky Run',
  blurb: 'Race across a floating obstacle course. Jump the gaps; first to the finish wins the round.',
  settings: [
    { key: 'rounds', label: 'Rounds to win', options: [[1, '1'], [2, '2'], [3, '3']], def: 2 },
    mapOf(SKYRUN_IDS),
  ],
};

const FALL = 0.6;
const RESPAWN = 1.2;
const FINISH_POINTS = [3, 2];

// Deathrunner (kind 'deathrun') and Sky Run (kind 'skyrun') on the shared obstacle courses.
export class CourseGame extends ArenaGame {
  constructor(opts, kind) {
    super(opts);
    this.kind = kind;
    this.race = kind === 'skyrun';
    this.ids = this.race ? SKYRUN_IDS : DEATHRUN_IDS;
    if (!this.race) {
      this.scoring = 'points';
      this.drawEvent = 'roundover';
      if (!this.target) this.target = Math.max(1, opts.players.length); // everyone takes a turn as killer
    }
    this.time = opts.settings.time || 150;
    this.mapSetting = opts.settings.map;
    this.courseId = null;
    this.startRound(this.firstCountdown);
  }

  init() {
    return { ...super.init(), kind: this.kind, time: this.time };
  }

  newPlayer(p) {
    Object.assign(p, newRunner(0, 0), { role: 0, cp: 0, half: false, done: 0, deadT: 0, fallT: 0, launched: -1 });
  }

  setupRound(list) {
    if (this.mapSetting !== 'random') this.courseId = this.mapSetting;
    else {
      const choices = this.ids.filter((id) => id !== this.courseId);
      this.courseId = choices[Math.floor(this.rng() * choices.length)];
    }
    this.course = course(this.courseId);
    this.traps = this.course.traps.map(() => ({ st: TRAP_STATE.ready, t: 0, seed: 1 }));
    this.finishers = 0;
    // Everyone takes a turn as the killer, in join order.
    const order = [...this.players.values()].sort((a, b) => a.idx - b.idx);
    this.killer = !this.race && list.length > 1 ? order[(this.round - 1) % order.length] : null;
    let i = 0;
    for (const p of list) {
      const killer = p === this.killer;
      const s = killer ? 60 : 50 + Math.floor(i / 5) * 40;
      const u = killer ? BUTTON_U : ((i % 5) - 2) * 42;
      if (!killer) i++;
      Object.assign(p, newRunner(s, u), { role: killer ? 1 : 0, cp: this.course.rests[0].s, half: false, done: 0, deadT: 0, fallT: 0, launched: -1 });
      this.place(p);
    }
  }

  place(p) {
    const w = toWorld(this.course, p.s, p.u);
    p.x = w.x;
    p.y = w.y;
  }

  get runners() {
    return [...this.players.values()].filter((p) => p.role === 0 && p.state !== PS.wait);
  }

  states() {
    return this.traps.map((t) => [t.st, t.t]);
  }

  playerTick(p, cmd, frozen) {
    if (p.state === PS.dead) {
      // Killed by a trap: back to the big checkpoint once you've reached it, otherwise the start.
      p.deadT -= DT;
      if (p.deadT <= 0) this.respawn(p, p.half ? this.course.half : this.course.rests[0].s);
      return;
    }
    if (p.state === PS.fall) {
      p.fallT += DT;
      p.s += p.vs * DT * 0.5;
      p.u += p.vu * DT * 0.5;
      this.place(p);
      if (p.fallT >= FALL) this.respawn(p, p.cp);
      return;
    }
    if (p.state !== PS.alive || p.done) return;
    if (p.role === 1) {
      stepKiller(p, cmd, this.course, frozen);
      if (!frozen) this.pressButtons(p);
    } else if (stepRunner(p, cmd, this.course, this.rt, frozen, trapSolids(this.course, this.states())) === 'bounce') {
      this.events.push({ k: 'bounce', p: p.idx });
    }
    this.place(p);
  }

  respawn(p, s) {
    Object.assign(p, newRunner(s, (this.rng() - 0.5) * 120), { state: PS.alive, deadT: 0, fallT: 0, launched: -1 });
    this.place(p);
  }

  pressButtons(k) {
    this.course.traps.forEach((tr, i) => {
      const st = this.traps[i];
      if (st.st !== TRAP_STATE.ready) return;
      if (Math.abs(k.s - tr.button) > 28 || Math.abs(k.u - BUTTON_U) > 28) return;
      st.st = TRAP_STATE.warn;
      st.t = 0;
      st.seed = 1 + Math.floor(this.rng() * 1e6);
      this.events.push({ k: 'trap', id: tr.id });
    });
  }

  worldTick(frozen) {
    if (frozen) return;
    this.course.traps.forEach((tr, i) => {
      const st = this.traps[i];
      if (st.st === TRAP_STATE.ready) return;
      st.t += DT;
      const T = TRAPS[tr.kind];
      const active = tr.kind === 'boulder' ? (tr.sec1 - tr.sec0) / 420 : T.active;
      if (st.st === TRAP_STATE.warn && st.t >= T.warn) {
        st.st = TRAP_STATE.active;
        st.t = 0;
        if (tr.kind === 'launcher') this.launch(tr);
      } else if (st.st === TRAP_STATE.active && st.t >= active) {
        st.st = TRAP_STATE.cool;
        st.t = 0;
      } else if (st.st === TRAP_STATE.cool && st.t >= T.cool) {
        st.st = TRAP_STATE.ready;
        st.t = 0;
      }
    });
    for (const p of this.runners) {
      if (p.state !== PS.alive || p.done) continue;
      // Checkpoints.
      for (const r of this.course.rests) {
        if (p.s >= r.s && r.s > p.cp) {
          p.cp = r.s;
          if (r.half && !p.half) {
            p.half = true;
            this.events.push({ k: 'half', p: p.idx });
          }
        }
      }
      if (p.s >= this.course.finish) {
        this.finishers++;
        p.done = this.finishers;
        if (!this.race) p.points += FINISH_POINTS[this.finishers - 1] || 1;
        this.events.push({ k: 'finish', p: p.idx, n: this.finishers });
        continue;
      }
      // Traps.
      for (const tr of this.course.traps) {
        const st = this.traps[tr.id];
        if (st.st === TRAP_STATE.active && trapKills(tr, st.st, st.t, st.seed, p.s, p.u, p.z, 15)) {
          this.kill(p, tr);
          break;
        }
      }
      if (p.state !== PS.alive) continue;
      // Falling off: only a death if a launch plate threw you.
      if (p.z <= 0 && !onFloor(this.course, p.s, p.u, this.rt)) {
        if (p.launched >= 0 && this.rt - p.launched < 2.5) this.kill(p, this.course.traps.find((t) => t.kind === 'launcher'));
        else {
          p.state = PS.fall;
          p.fallT = 0;
          this.events.push({ k: 'fall', p: p.idx });
        }
      }
    }
  }

  // Launch Plate: throws anyone standing on it off the edge.
  launch(tr) {
    for (const p of this.runners) {
      if (p.state !== PS.alive || p.z > 0 || p.s < tr.a || p.s > tr.b || p.u > 40) continue;
      p.vu = -950;
      p.vs *= 0.3;
      p.vz = 420;
      p.z = 0.01;
      p.knockT = 1.2;
      p.launched = this.rt;
    }
  }

  kill(p, tr) {
    p.state = PS.dead;
    p.deadT = RESPAWN;
    if (this.killer && this.players.has(this.killer.id)) this.killer.points++;
    this.events.push({ k: 'kill', v: p.idx, trap: tr ? tr.kind : '', x: r1(p.x), y: r1(p.y) });
  }

  roundResult() {
    const runners = this.runners;
    if (this.race) {
      const first = runners.find((p) => p.done === 1);
      if (first) return first;
      return this.rt >= this.time ? null : undefined;
    }
    if (runners.length && runners.some((p) => !p.done) && this.rt < this.time) return undefined;
    return null;
  }

  packPlayer(p) {
    return [r1(p.s), r1(p.u), r1(p.z), p.role, p.done, r2(p.fallT)];
  }

  packWorld() {
    return [this.courseId, this.killer ? this.killer.idx : -1, this.traps.map((t) => [t.st, r2(t.t), t.seed]), r1(Math.max(0, this.time - this.rt))];
  }

  packMe(p) {
    return {
      s: r2(p.s), u: r2(p.u), vs: r2(p.vs), vu: r2(p.vu), z: r2(p.z), vz: r2(p.vz), aim: r2(p.aim), knockT: r2(p.knockT), jumpCd: r2(p.jumpCd),
      role: p.role, done: p.done, x: r1(p.x), y: r1(p.y),
    };
  }
}

