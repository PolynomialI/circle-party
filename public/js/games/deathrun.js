import { THEME } from '../../shared/theme.js';
import { DT } from '../../shared/loop.js';
import {
  course, frameAt, toWorld, LANE, RAIL, KILLER, BUTTON_U, CONVEYORS, TRAPS, TRAP_STATE, RUN, WIND, moverShape, windAt,
  stepRunner, stepKiller, trapSolids, anvilSpots, dartPlan, boulderAt, laserBeams, flameAngle, TRAP_PARTS,
} from '../../shared/course.js';
import * as draw from '../draw.js';
import { ArenaView, ST, PS, lerp } from './arena.js';

export const name = 'Deathrunner';
export const controls = [
  ['Move', 'W A S D'],
  ['Jump', 'Space'],
  ['Killer: ride the track', 'Walk onto the belts on the far side'],
  ['Killer: fire a trap', 'Stand on its button'],
];

const SLIME = '#7ed957';
const SLIME_DARK = '#3f9a2c';
const ACID = '#9be15d';
const FIRE = ['#ff8a3d', '#ffd447', '#fff3c4'];
const STONE = '#9a9fa8';
const VIEW = 1300; // world units across the screen

// Path helpers: shapes in track space (s along, u across) drawn on the curved course.
function bandPath(C, s0, s1, u0, u1, step = 16) {
  const path = new Path2D();
  const n = Math.max(1, Math.ceil((s1 - s0) / step));
  for (let i = 0; i <= n; i++) {
    const w = toWorld(C, s0 + ((s1 - s0) * i) / n, u0);
    if (i === 0) path.moveTo(w.x, w.y);
    else path.lineTo(w.x, w.y);
  }
  for (let i = n; i >= 0; i--) {
    const w = toWorld(C, s0 + ((s1 - s0) * i) / n, u1);
    path.lineTo(w.x, w.y);
  }
  path.closePath();
  return path;
}

function line(ctx, C, s0, u0, s1, u1) {
  const a = toWorld(C, s0, u0);
  const b = toWorld(C, s1, u1);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
}

export class Game extends ArenaView {
  constructor(stage, init) {
    super(stage, init);
    this.radius = RUN.radius;
    this.cam = null;
    this.dt = 0;
    this.trapStates = [];
    this.cache = null; // per-course drawing data
  }

  get C() {
    return this.view ? course(this.view.x[0]) : null;
  }

  stepMe(s, cmd) {
    const C = course(s.cid);
    if (s.role === 1) stepKiller(s, cmd, C, s.frozen);
    else stepRunner(s, cmd, C, s.rt, s.frozen, trapSolids(C, this.trapStates));
    if (!s.frozen) s.rt += DT;
    const w = toWorld(C, s.s, s.u);
    s.x = w.x;
    s.y = w.y;
  }

  meContext(snap) {
    return { rt: snap.rt, cid: snap.x[0], frozen: snap.st === ST.countdown || snap.st === ST.over || snap.me.done > 0 };
  }

  onSnap(snap) {
    this.trapStates = snap.x[2].map((t) => [t[0], t[1]]);
    super.onSnap(snap);
  }

  unpack(pa, pb, t) {
    return { s: lerp(pa[6], pb[6], t), u: lerp(pa[7], pb[7], t), z: lerp(pa[8], pb[8], t), role: pb[9], done: pb[10], fallT: pb[11] };
  }

  applyMe(me, s) {
    me.z = s.z;
    me.s = s.s;
    me.u = s.u;
    me.role = s.role;
  }

  update(s, dt) {
    this.dt = dt;
    super.update(s, dt);
  }

  // Follow our own runner (or the leader when watching), leaning a little towards the course ahead.
  camera(v) {
    const C = this.C;
    let target = this.mePos;
    if (!target) {
      const lead = v.players.filter((p) => p.role === 0 && p.state === PS.alive).sort((a, b) => b.s - a.s)[0];
      target = lead ? { x: lead.x, y: lead.y } : toWorld(C, 100, 0);
    }
    const me = v.players.find((p) => p.idx === this.me);
    if (me) {
      const ahead = frameAt(C, Math.min(C.length, me.s + 60));
      target = { x: target.x + ahead.tx * 60, y: target.y + ahead.ty * 60 };
    }
    if (!this.cam || Math.hypot(target.x - this.cam.x, target.y - this.cam.y) > 600) this.cam = { ...target };
    const k = 1 - Math.exp(-6 * this.dt);
    this.cam.x += (target.x - this.cam.x) * k;
    this.cam.y += (target.y - this.cam.y) * k;
    this.stage.follow(this.cam.x, this.cam.y, VIEW);
  }

  // Sections whose stretch of course is on screen.
  visibleSections(C) {
    if (!this.cache || this.cache.id !== this.view.x[0]) {
      const boxes = C.sections.map((sec) => {
        let x0 = Infinity;
        let y0 = Infinity;
        let x1 = -Infinity;
        let y1 = -Infinity;
        for (let s = sec.s0; s <= sec.s1; s += 40) {
          for (const u of [-LANE - 30, KILLER[1] + 30]) {
            const w = toWorld(C, s, u);
            x0 = Math.min(x0, w.x);
            y0 = Math.min(y0, w.y);
            x1 = Math.max(x1, w.x);
            y1 = Math.max(y1, w.y);
          }
        }
        return { x0, y0, x1, y1 };
      });
      this.cache = { id: this.view.x[0], boxes };
    }
    const vr = this.stage.viewRect();
    return C.sections.filter((_, i) => {
      const b = this.cache.boxes[i];
      return b.x0 < vr.x1 + 40 && b.x1 > vr.x0 - 40 && b.y0 < vr.y1 + 60 && b.y1 > vr.y0 - 40;
    });
  }

  drawWorld(v) {
    const ctx = this.ctx;
    const C = this.C;
    const t = v.rt;
    const secs = this.visibleSections(C);
    if (!secs.length) return;
    const s0 = secs[0].s0;
    const s1 = secs[secs.length - 1].s1;
    const killer = C.killer;

    // Under everything: the course's side faces, so it reads as floating over the drop.
    ctx.save();
    ctx.translate(0, 16);
    ctx.fillStyle = THEME.wallSide;
    ctx.fill(bandPath(C, s0, s1, -LANE, killer ? KILLER[1] : LANE));
    ctx.restore();
    if (killer) {
      // The killer's raised track and the rail.
      ctx.save();
      ctx.translate(0, 34);
      ctx.fillStyle = THEME.ink;
      ctx.fill(bandPath(C, s0, s1, RAIL[0], KILLER[1]));
      ctx.restore();
    }

    // Runners' lane.
    for (const sec of secs) {
      const fill = sec.kind === 'rest' ? THEME.floorMint : sec.kind === 'start' || sec.kind === 'finish' ? THEME.floorWarm : THEME.floor;
      ctx.fillStyle = fill;
      ctx.fill(bandPath(C, sec.s0, sec.s1, -LANE, LANE));
    }
    // Plate seams across the lane.
    ctx.strokeStyle = THEME.seam;
    ctx.lineWidth = 2;
    for (let s = Math.ceil(s0 / 80) * 80; s < s1; s += 80) {
      line(ctx, C, s, -LANE, s, LANE);
      ctx.stroke();
    }
    this.drawZones(C, s0, s1, t);
    this.drawPits(C, s0, s1, t);
    this.drawFloorTraps(C, s0, s1, v);
    this.drawObstacles(C, s0, s1, t);
    this.drawMarkers(C, secs);
    // The drop-side edge of the lane.
    ctx.fillStyle = THEME.accent;
    ctx.fill(bandPath(C, s0, s1, -LANE, -LANE + 7));
    ctx.lineWidth = THEME.outline;
    ctx.strokeStyle = THEME.ink;
    ctx.stroke(bandPath(C, s0, s1, -LANE, LANE));
    if (killer) this.drawKillerTrack(C, s0, s1, v);
    // Players who fell shrink away below the course.
    for (const p of v.players) {
      if (p.state !== PS.fall) continue;
      const k = Math.min(1, p.fallT / 0.6);
      ctx.globalAlpha = 1 - k;
      draw.player(ctx, p.x, p.y + k * 20, this.radius * (1 - 0.6 * k), this.color(p.idx), p.aim, false);
      ctx.globalAlpha = 1;
    }
  }

  drawPits(C, s0, s1, t) {
    const ctx = this.ctx;
    for (const r of C.pits) {
      if (r[1] < s0 || r[0] > s1) continue;
      ctx.fillStyle = THEME.void;
      ctx.fill(bandPath(C, r[0], r[1], r[2], r[3]));
    }
    // Pads and moving platforms over the drop: a side face and a top.
    const pads = C.floors.filter((r) => r[1] >= s0 && r[0] <= s1);
    for (const m of C.movers) if (m.t === 'platform' && m.s > s0 - 100 && m.s < s1 + 100) pads.push(moverShape(m, t).floor);
    for (const r of pads) {
      const top = bandPath(C, r[0], r[1], r[2], r[3]);
      ctx.save();
      ctx.translate(0, 12);
      ctx.fillStyle = THEME.wallSide;
      ctx.fill(top);
      ctx.restore();
      ctx.fillStyle = THEME.floorAlt;
      ctx.fill(top);
      ctx.lineWidth = THEME.outline;
      ctx.strokeStyle = THEME.ink;
      ctx.stroke(top);
    }
  }

  drawZones(C, s0, s1, t) {
    const ctx = this.ctx;
    for (const z of C.zones) {
      if (z.b < s0 || z.a > s1) continue;
      if (z.t === 'conv') {
        // A belt with chevrons running backwards.
        ctx.fillStyle = THEME.wallSide;
        ctx.fill(bandPath(C, z.a, z.b, z.u0 + 6, z.u1 - 6));
        ctx.strokeStyle = THEME.metal;
        ctx.lineWidth = 6;
        const off = ((t * -z.v) % 50) - 50;
        for (let s = z.a + 50 - off; s < z.b; s += 50) {
          for (const u of [-70, 0, 70]) {
            const p = toWorld(C, s - 12, u - 18);
            const q = toWorld(C, s, u);
            const r = toWorld(C, s - 12, u + 18);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.lineTo(r.x, r.y);
            ctx.stroke();
          }
        }
      } else if (z.t === 'slow') {
        // A climbing ramp: rungs across the lane.
        ctx.fillStyle = THEME.floorAlt;
        ctx.fill(bandPath(C, z.a, z.b, z.u0, z.u1));
        ctx.strokeStyle = THEME.metalDark;
        ctx.lineWidth = 6;
        for (let s = z.a + 20; s < z.b; s += 34) {
          line(ctx, C, s, z.u0 + 18, s, z.u1 - 18);
          ctx.stroke();
        }
      } else if (z.t === 'wind') {
        // Arrows show which way the next gust blows, flashing while it blows.
        const gust = windAt(z, t);
        const next = gust || (Math.floor(t / z.period + 1) % 2 ? 1 : -1) * WIND.force;
        const soon = gust !== 0 || t % z.period > z.period - 1;
        if (!soon) continue;
        ctx.globalAlpha = gust ? 0.9 : 0.4;
        for (let s = z.a + 40; s < z.b; s += 90) {
          const w = toWorld(C, s, 0);
          const f = frameAt(C, s);
          const a = Math.atan2(f.ny * Math.sign(next), f.nx * Math.sign(next));
          ctx.save();
          ctx.translate(w.x, w.y);
          ctx.rotate(a);
          ctx.fillStyle = '#e8f6ff';
          ctx.strokeStyle = THEME.ink;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(30, 0);
          ctx.lineTo(0, -16);
          ctx.lineTo(0, -6);
          ctx.lineTo(-30, -6);
          ctx.lineTo(-30, 6);
          ctx.lineTo(0, 6);
          ctx.lineTo(0, 16);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
        ctx.globalAlpha = 1;
      } else if (z.t === 'bounce') {
        const pad = bandPath(C, z.a, z.b, z.u0, z.u1);
        ctx.fillStyle = THEME.accent;
        ctx.fill(pad);
        ctx.lineWidth = THEME.outline;
        ctx.strokeStyle = THEME.ink;
        ctx.stroke(pad);
        for (const u of [-50, 0, 50]) {
          const w = toWorld(C, (z.a + z.b) / 2, u);
          draw.disc(ctx, w.x, w.y, 10, THEME.danger, THEME.ink, 2.5);
        }
      }
    }
  }

  drawObstacles(C, s0, s1, t) {
    const ctx = this.ctx;
    for (const r of C.solids) {
      if (r[1] < s0 || r[0] > s1) continue;
      const p = bandPath(C, r[0], r[1], r[2], r[3]);
      ctx.fillStyle = THEME.wallTop;
      ctx.fill(p);
      ctx.lineWidth = THEME.outline;
      ctx.strokeStyle = THEME.ink;
      ctx.stroke(p);
    }
    for (const [cs, cu, cr] of C.circles) {
      if (cs < s0 - 40 || cs > s1 + 40) continue;
      const w = toWorld(C, cs, cu);
      draw.disc(ctx, w.x + 4, w.y + 5, cr, THEME.shadow);
      draw.disc(ctx, w.x, w.y, cr, THEME.metal, THEME.ink);
      draw.disc(ctx, w.x, w.y, cr * 0.6, THEME.accent, THEME.ink, 2.5);
    }
    for (const m of C.movers) {
      const ref = m.s !== undefined ? m.s : m.a;
      if (ref < s0 - 200 || ref > s1 + 200) continue;
      const sh = moverShape(m, t);
      if (sh.rect) {
        // Slime pusher: a fat green blob on a piston from the rail.
        const [a, b, u0, u1] = sh.rect;
        const body = bandPath(C, a, b, u0, u1);
        ctx.fillStyle = SLIME;
        ctx.fill(body);
        ctx.lineWidth = THEME.outline;
        ctx.strokeStyle = THEME.ink;
        ctx.stroke(body);
        ctx.fillStyle = SLIME_DARK;
        ctx.fill(bandPath(C, a + 8, b - 8, u0 + 6, u0 + 18));
        const hl = toWorld(C, a + 18, u0 + 14);
        draw.disc(ctx, hl.x, hl.y, 6, '#d8ffc4');
      } else if (sh.seg) {
        const [sa, ua, sb, ub] = sh.seg;
        const p = toWorld(C, sa, ua);
        const q = toWorld(C, sb, ub);
        for (const [w, c] of [[16, THEME.ink], [10, THEME.danger]]) {
          ctx.lineWidth = w;
          ctx.strokeStyle = c;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.stroke();
        }
        ctx.lineCap = 'butt';
      } else if (sh.circle) {
        const w = toWorld(C, sh.circle[0], sh.circle[1]);
        draw.disc(ctx, w.x, w.y, sh.circle[2], THEME.crateDark, THEME.ink);
        ctx.save();
        ctx.translate(w.x, w.y);
        ctx.rotate(-t * 8);
        ctx.strokeStyle = THEME.crate;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(-12, 0);
        ctx.lineTo(12, 0);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // Checkpoint arches at rest stops, a flag at the big one, start and finish lines.
  drawMarkers(C, secs) {
    const ctx = this.ctx;
    for (const r of C.rests) {
      if (!secs.some((x) => r.s >= x.s0 && r.s <= x.s1)) continue;
      ctx.lineWidth = 6;
      ctx.strokeStyle = r.half ? THEME.accent : THEME.good;
      line(ctx, C, r.s - 40, -LANE + 6, r.s - 40, LANE - 6);
      ctx.stroke();
      for (const u of [-LANE + 8, LANE - 8]) {
        const w = toWorld(C, r.s - 40, u);
        draw.disc(ctx, w.x, w.y, 9, r.half ? THEME.accent : THEME.good, THEME.ink, 2.5);
      }
      if (r.half) {
        const w = toWorld(C, r.s, 0);
        draw.bigText(ctx, 'HALFWAY', w.x, w.y, 30, THEME.accent);
      }
    }
    const fin = secs.find((x) => x.kind === 'finish');
    if (fin) {
      // Checkered finish line.
      for (let i = 0; i < 12; i++) {
        for (let j = 0; j < 2; j++) {
          ctx.fillStyle = (i + j) % 2 ? THEME.ink : THEME.white;
          ctx.fill(bandPath(C, fin.s0 + j * 14, fin.s0 + (j + 1) * 14, -LANE + (i * 2 * LANE) / 12, -LANE + ((i + 1) * 2 * LANE) / 12, 14));
        }
      }
      const w = toWorld(C, fin.s0 + 110, 0);
      draw.bigText(ctx, 'FINISH', w.x, w.y, 44, THEME.white);
    }
    const st = secs.find((x) => x.kind === 'start');
    if (st) {
      const w = toWorld(C, st.s0 + 150, 0);
      draw.bigText(ctx, 'RUN!', w.x, w.y, 44, THEME.white);
    }
  }

  drawKillerTrack(C, s0, s1, v) {
    const ctx = this.ctx;
    const t = v.rt;
    const deck = bandPath(C, s0, s1, KILLER[0], KILLER[1]);
    ctx.fillStyle = '#c3cfdf';
    ctx.fill(deck);
    // Belts: forward and back, chevrons moving.
    for (const [u0, u1, dir] of CONVEYORS) {
      ctx.fillStyle = THEME.wallSide;
      ctx.fill(bandPath(C, s0, s1, u0 + 3, u1 - 3));
      ctx.strokeStyle = dir > 0 ? '#9fe8ff' : '#f7c0c0';
      ctx.lineWidth = 4;
      const off = (t * RUN.conveyor * dir) % 60;
      for (let s = Math.ceil(s0 / 60) * 60 + off; s < s1; s += 60) {
        const m = (u0 + u1) / 2;
        const a = toWorld(C, s - dir * 10, m - 12);
        const b = toWorld(C, s, m);
        const c = toWorld(C, s - dir * 10, m + 12);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(c.x, c.y);
        ctx.stroke();
      }
    }
    ctx.lineWidth = THEME.outline;
    ctx.strokeStyle = THEME.ink;
    ctx.stroke(deck);
    // The rail between the tracks.
    const rail = bandPath(C, s0, s1, RAIL[0], RAIL[1]);
    ctx.fillStyle = THEME.wallTop;
    ctx.fill(rail);
    ctx.stroke(rail);
    // A button by each trap; green when ready, amber when firing, red while it reloads.
    for (const tr of C.traps) {
      if (tr.button < s0 - 40 || tr.button > s1 + 40) continue;
      const st = v.x[2][tr.id];
      const w = toWorld(C, tr.button, BUTTON_U);
      const col = st[0] === TRAP_STATE.ready ? THEME.good : st[0] === TRAP_STATE.cool ? THEME.danger : THEME.accent;
      draw.disc(ctx, w.x, w.y + 4, 24, THEME.wallSide, THEME.ink);
      draw.disc(ctx, w.x, w.y, 20, col, THEME.ink);
      draw.disc(ctx, w.x - 6, w.y - 6, 5, THEME.white);
      if (st[0] === TRAP_STATE.cool) {
        ctx.lineWidth = 4;
        ctx.strokeStyle = THEME.white;
        ctx.beginPath();
        ctx.arc(w.x, w.y, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (st[1] / TRAPS[tr.kind].cool));
        ctx.stroke();
      }
      ctx.font = draw.font(700, 12);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lw = toWorld(C, tr.button, BUTTON_U + 42);
      ctx.fillStyle = THEME.ink;
      ctx.fillText(TRAPS[tr.kind].name, lw.x, lw.y);
    }
  }

  // Trap parts at floor level (drawn under players).
  drawFloorTraps(C, s0, s1, v) {
    const ctx = this.ctx;
    for (const tr of C.traps) {
      if (tr.b < s0 - 60 || tr.a > s1 + 60) continue;
      const [st, t, seed] = v.x[2][tr.id];
      const warn = st === TRAP_STATE.warn;
      const active = st === TRAP_STATE.active;
      const area = bandPath(C, tr.a, tr.b, -LANE, LANE);
      switch (tr.kind) {
        case 'cell': {
          // Prison floor: dark grating; it drops away once the cell is sealed.
          ctx.fillStyle = active && t > 0.9 ? THEME.void : '#b6c0cd';
          ctx.fill(bandPath(C, tr.a + 12, tr.b - 12, -LANE, LANE));
          if (!(active && t > 0.9)) {
            ctx.strokeStyle = THEME.metalDark;
            ctx.lineWidth = 3;
            for (let s = tr.a + 24; s < tr.b - 12; s += 18) {
              line(ctx, C, s, -LANE, s, LANE);
              ctx.stroke();
            }
          }
          break;
        }
        case 'press': {
          ctx.fillStyle = THEME.floorAlt;
          ctx.fill(area);
          ctx.fillStyle = THEME.accent;
          ctx.fill(bandPath(C, tr.a, tr.a + 8, -LANE, LANE));
          ctx.fill(bandPath(C, tr.b - 8, tr.b, -LANE, LANE));
          if (warn) {
            ctx.globalAlpha = 0.25 + 0.5 * (t / TRAPS.press.warn);
            ctx.fillStyle = THEME.ink;
            ctx.fill(area);
            ctx.globalAlpha = 1;
          }
          break;
        }
        case 'darts': {
          // A wall of dart holes along the rail side.
          ctx.fillStyle = '#8a6a4f';
          ctx.fill(bandPath(C, tr.a, tr.b, LANE - 14, LANE));
          ctx.fillStyle = THEME.ink;
          for (let s = tr.a + 20; s < tr.b - 10; s += 30) {
            const w = toWorld(C, s, LANE - 7);
            draw.disc(ctx, w.x, w.y, 4, THEME.ink);
          }
          if (warn) {
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = THEME.danger;
            ctx.fill(bandPath(C, tr.a, tr.b, LANE - 14, LANE));
            ctx.globalAlpha = 1;
          }
          break;
        }
        case 'flame': {
          const w = toWorld(C, (tr.a + tr.b) / 2, LANE - 6);
          draw.disc(ctx, w.x, w.y, 18, THEME.wallSide, THEME.ink);
          draw.disc(ctx, w.x, w.y, 9, warn || active ? FIRE[0] : THEME.ink);
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = '#d9b9a0';
          ctx.fill(area);
          ctx.globalAlpha = 1;
          break;
        }
        case 'trapdoor': {
          // Two rows of doors either side of a thin safe seam.
          for (const [u0, u1] of [[-LANE, -14], [14, LANE]]) {
            const n = 4;
            for (let i = 0; i < n; i++) {
              const a = tr.a + ((tr.b - tr.a) * i) / n;
              const b = tr.a + ((tr.b - tr.a) * (i + 1)) / n;
              const door = bandPath(C, a + 2, b - 2, u0 + 2, u1 - 2);
              ctx.fillStyle = active ? THEME.void : warn && Math.floor(t * 12) % 2 ? THEME.danger : THEME.crate;
              ctx.fill(door);
              ctx.lineWidth = 2.5;
              ctx.strokeStyle = THEME.ink;
              ctx.stroke(door);
            }
          }
          break;
        }
        case 'launcher': {
          const plate = bandPath(C, tr.a, tr.b, -LANE, 40);
          ctx.fillStyle = active ? THEME.danger : '#ffb347';
          ctx.fill(plate);
          ctx.lineWidth = THEME.outline;
          ctx.strokeStyle = THEME.ink;
          ctx.stroke(plate);
          for (const u of [-80, -30, 20]) {
            const w = toWorld(C, (tr.a + tr.b) / 2, u);
            draw.disc(ctx, w.x, w.y, 8, warn ? THEME.white : THEME.wallSide, THEME.ink, 2);
          }
          break;
        }
        case 'laser': {
          for (const s of [tr.a, tr.b]) {
            for (const u of [-LANE + 6, LANE - 6]) {
              const w = toWorld(C, s, u);
              draw.disc(ctx, w.x, w.y, 9, THEME.wallSide, THEME.ink, 2.5);
            }
          }
          break;
        }
        case 'anvils':
          if (warn) {
            for (const [as, au] of anvilSpots(tr, seed)) {
              const w = toWorld(C, as, au);
              ctx.globalAlpha = 0.25 + 0.5 * (t / TRAPS.anvils.warn);
              draw.disc(ctx, w.x, w.y, TRAP_PARTS.ANVIL.r * (0.4 + 0.6 * (t / TRAPS.anvils.warn)), THEME.ink);
              ctx.globalAlpha = 1;
            }
          }
          break;
        case 'acid': {
          ctx.fillStyle = active ? ACID : warn ? '#cdeeb2' : '#dfe9d2';
          ctx.fill(area);
          if (warn || active) {
            for (let i = 0; i < 10; i++) {
              const w = toWorld(C, tr.a + ((i * 37 + t * 60) % (tr.b - tr.a)), -LANE + ((i * 53) % (2 * LANE)));
              draw.disc(ctx, w.x, w.y, 5 + (i % 3) * 2, '#e9ffd6', THEME.ink, 1.5);
            }
          }
          break;
        }
        default:
          break;
      }
    }
  }

  drawPlayer(p, isMe) {
    const ctx = this.ctx;
    const z = p.z || 0;
    if (z > 0.5) draw.disc(ctx, p.x + 3, p.y + 6, this.radius * (1 - z / 140), THEME.shadow);
    const y = p.y - z * 0.8;
    const r = this.radius * (1 + z / 160);
    if (p.role === 1) {
      // The killer: a spiky red halo.
      ctx.fillStyle = THEME.danger;
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const rr = i % 2 ? r + 4 : r + 11;
        ctx.lineTo(p.x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = THEME.ink;
      ctx.stroke();
    }
    draw.player(ctx, p.x, y, r, this.color(p.idx), p.aim, isMe);
  }

  // Trap parts that loom over the runners.
  drawAbove(v) {
    const ctx = this.ctx;
    const C = this.C;
    const secs = this.visibleSections(C);
    if (!secs.length) return;
    const s0 = secs[0].s0 - 60;
    const s1 = secs[secs.length - 1].s1 + 60;
    for (const tr of C.traps) {
      if (tr.b < s0 || tr.a > s1) continue;
      const [st, t, seed] = v.x[2][tr.id];
      const warn = st === TRAP_STATE.warn;
      const active = st === TRAP_STATE.active;
      if (!warn && !active) continue;
      switch (tr.kind) {
        case 'cell': {
          // Bars slam down at both ends.
          const k = active ? 1 : Math.min(1, t / TRAPS.cell.warn);
          ctx.globalAlpha = k;
          for (const [a, b] of [[tr.a, tr.a + 12], [tr.b - 12, tr.b]]) {
            ctx.fillStyle = THEME.ink;
            ctx.fill(bandPath(C, a, b, -LANE, LANE));
            ctx.strokeStyle = THEME.metal;
            ctx.lineWidth = 4;
            for (let u = -LANE + 12; u < LANE; u += 20) {
              line(ctx, C, a + 6, u - 6, b - 6, u + 6);
              ctx.stroke();
            }
          }
          ctx.globalAlpha = 1;
          break;
        }
        case 'press':
          if (active) {
            const slab = bandPath(C, tr.a - 6, tr.b + 6, -LANE - 10, LANE + 10);
            ctx.globalAlpha = t < 0.3 ? 1 : Math.max(0, 1 - (t - 0.3) / 0.6);
            ctx.fillStyle = THEME.metal;
            ctx.fill(slab);
            ctx.fillStyle = THEME.accent;
            ctx.fill(bandPath(C, tr.a, tr.b, -LANE, -LANE + 14));
            ctx.fill(bandPath(C, tr.a, tr.b, LANE - 14, LANE));
            ctx.lineWidth = THEME.outline;
            ctx.strokeStyle = THEME.ink;
            ctx.stroke(slab);
            ctx.globalAlpha = 1;
          }
          break;
        case 'darts':
          if (active) {
            for (const [ds, delay] of dartPlan(tr, seed)) {
              if (t < delay) continue;
              const du = LANE - (t - delay) * TRAP_PARTS.DART.speed;
              if (du < -LANE - 20) continue;
              const a = toWorld(C, ds, du);
              const b = toWorld(C, ds, du + 22);
              for (const [w, c] of [[6, THEME.ink], [3, '#e8d29a']]) {
                ctx.lineWidth = w;
                ctx.strokeStyle = c;
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.stroke();
              }
              draw.disc(ctx, a.x, a.y, 3, THEME.danger);
            }
          }
          break;
        case 'flame':
          if (active) {
            const ns = (tr.a + tr.b) / 2;
            const ang = flameAngle(tr, t);
            const { len, half } = TRAP_PARTS.FLAME;
            FIRE.forEach((col, i) => {
              const L = len * (1 - i * 0.25);
              const H = half * (1 - i * 0.25);
              ctx.fillStyle = col;
              ctx.beginPath();
              const o = toWorld(C, ns, LANE - 6);
              ctx.moveTo(o.x, o.y);
              for (let k = -6; k <= 6; k++) {
                const a = ang + (k / 6) * H;
                const w = toWorld(C, ns + Math.cos(a) * L * (0.85 + 0.15 * Math.sin(k + t * 30)), LANE - 6 + Math.sin(a) * L);
                ctx.lineTo(w.x, w.y);
              }
              ctx.closePath();
              ctx.fill();
            });
          }
          break;
        case 'boulder':
          if (active) {
            const bs = boulderAt(tr, t);
            const w = toWorld(C, bs, 0);
            const r = TRAP_PARTS.BOULDER.r;
            draw.disc(ctx, w.x + 6, w.y + 10, r, THEME.shadow);
            draw.disc(ctx, w.x, w.y, r, STONE, THEME.ink, 4);
            ctx.save();
            ctx.translate(w.x, w.y);
            ctx.rotate(t * 6);
            ctx.strokeStyle = '#6c717b';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.moveTo(-r * 0.6, -r * 0.2);
            ctx.lineTo(-r * 0.1, r * 0.1);
            ctx.lineTo(r * 0.4, -r * 0.4);
            ctx.moveTo(-r * 0.2, r * 0.5);
            ctx.lineTo(r * 0.3, r * 0.3);
            ctx.stroke();
            ctx.restore();
          } else if (warn) {
            const w = toWorld(C, tr.sec0 + 40, 0);
            draw.bigText(ctx, '!', w.x, w.y, 60, THEME.danger);
          }
          break;
        case 'laser':
          if (active) {
            for (const b of laserBeams(tr, t)) {
              line(ctx, C, b.s, -LANE + 6, b.s, LANE - 6);
              ctx.lineWidth = b.high ? 10 : 6;
              ctx.strokeStyle = THEME.ink;
              ctx.stroke();
              ctx.lineWidth = b.high ? 6 : 3;
              ctx.strokeStyle = b.high ? '#4fd1ff' : THEME.danger;
              ctx.stroke();
            }
          }
          break;
        case 'anvils':
          if (active) {
            for (const [as, au] of anvilSpots(tr, seed)) {
              const w = toWorld(C, as, au);
              ctx.fillStyle = '#3a3f4b';
              ctx.beginPath();
              ctx.moveTo(w.x - 30, w.y + 14);
              ctx.lineTo(w.x + 30, w.y + 14);
              ctx.lineTo(w.x + 20, w.y - 4);
              ctx.lineTo(w.x + 34, w.y - 14);
              ctx.lineTo(w.x - 34, w.y - 14);
              ctx.lineTo(w.x - 20, w.y - 4);
              ctx.closePath();
              ctx.fill();
              ctx.lineWidth = 2.5;
              ctx.strokeStyle = THEME.ink;
              ctx.stroke();
            }
          }
          break;
        default:
          break;
      }
    }
  }

  gameEvent(ev) {
    const q = ev.p !== undefined ? this.player(ev.p) : null;
    if (ev.k === 'kill') {
      this.fx.splat(ev.x, ev.y, this.color(ev.v).main, 18, Math.random() * 6, 8);
      this.fx.ring(ev.x, ev.y, THEME.danger, 10, 50, 0.35, 5);
      if (ev.v === this.me) this.banner.show(TRAPS[ev.trap] ? TRAPS[ev.trap].name.toUpperCase() : 'SPLAT', THEME.danger, 1.4);
    } else if (ev.k === 'finish' && q) {
      this.fx.ring(q.x, q.y, THEME.accent, 10, 60, 0.5, 5);
      if (ev.p === this.me) this.banner.show(ev.n === 1 ? '1ST!' : ev.n === 2 ? '2ND!' : ev.n === 3 ? '3RD!' : 'FINISHED', THEME.accent, 1.6);
    } else if (ev.k === 'half' && ev.p === this.me) {
      this.banner.show('HALFWAY!', THEME.accent, 1.2);
    } else if (ev.k === 'round') {
      // Tell everyone their role for this round.
      setTimeout(() => {
        const me = this.player(this.me);
        if (!me || !this.C || !this.C.killer) return;
        this.banner.show(me.role === 1 ? "YOU'RE THE KILLER" : 'RUN!', me.role === 1 ? THEME.danger : THEME.good, 1.8);
      }, 300);
    } else if (ev.k === 'bounce' && q) {
      this.fx.ring(q.x, q.y, THEME.accent, 10, 40, 0.3, 4);
    }
  }

  // Under the scoreboard: where everyone is along the course, plus the time left.
  drawHud(v) {
    const ctx = this.ctx;
    const C = this.C;
    const W = this.stage.w;
    const w = Math.min(560, W - 120);
    const x0 = W / 2 - w / 2;
    const y = 92;
    ctx.fillStyle = THEME.card;
    draw.roundRect(ctx, x0 - 10, y - 12, w + 20, 24, 12);
    ctx.fill();
    ctx.lineWidth = THEME.outline;
    ctx.strokeStyle = THEME.ink;
    ctx.stroke();
    ctx.fillStyle = THEME.seam;
    ctx.fillRect(x0, y - 2, w, 4);
    const half = x0 + (C.half / C.finish) * w;
    draw.disc(ctx, half, y, 5, THEME.accent, THEME.ink, 2);
    for (const p of v.players) {
      if (p.role === 1) continue;
      const x = x0 + Math.min(1, p.s / C.finish) * w;
      draw.disc(ctx, x, y, p.idx === this.me ? 8 : 6, this.color(p.idx).main, THEME.ink, 2);
    }
    const left = Math.max(0, Math.ceil(v.x[3]));
    draw.bigText(ctx, `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, W / 2, y + 30, 20, left <= 10 ? THEME.accent : THEME.white);
  }
}
