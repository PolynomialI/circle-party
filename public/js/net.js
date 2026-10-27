import { io } from '../vendor/socket.io.esm.min.js';
import { SERVER_URL } from '../config.js';
import { TICK_RATE } from '../shared/loop.js';

// ?lag=120 delays every message by half that each way, to test with ~120 ms ping.
const LAG = Math.max(0, Number(new URLSearchParams(location.search).get('lag')) || 0);
const INTERP_DELAY = 0.08; // seconds we render other players behind the newest snapshot

export function connect() {
  const socket = io(SERVER_URL || undefined, { transports: ['websocket', 'polling'] });
  if (LAG) {
    const emit = socket.emit.bind(socket);
    const on = socket.on.bind(socket);
    socket.emit = (...args) => {
      setTimeout(() => emit(...args), LAG / 2);
      return socket;
    };
    socket.on = (ev, fn) => on(ev, (...args) => (ev === 'connect' || ev === 'disconnect' ? fn(...args) : setTimeout(() => fn(...args), LAG / 2)));
  }
  return socket;
}

// Buffers snapshots and runs a render clock a little behind the newest one (from Circle Soccer).
export class Snapshots {
  constructor() {
    this.list = [];
    this.renderTime = null;
    this.lastTick = -1;
  }

  push(snap) {
    const list = this.list;
    if (list.length && snap.t <= list[list.length - 1].t) return false;
    list.push(snap);
    if (list.length > 90) list.shift(); // rendering pauses in background tabs
    return true;
  }

  // Returns the two snapshots around the render time, the blend between them and any events now due.
  sample(dt) {
    const list = this.list;
    if (!list.length) return null;
    const target = list[list.length - 1].t / TICK_RATE - INTERP_DELAY;
    if (this.renderTime === null || Math.abs(target - this.renderTime) > 0.5) {
      // First frame or resync (e.g. the tab was in the background): skip stale events.
      this.renderTime = target;
      for (const s of list) if (s.t / TICK_RATE <= target) this.lastTick = Math.max(this.lastTick, s.t);
    } else {
      this.renderTime += dt + (target - this.renderTime) * 0.08;
    }

    let i = list.length - 1;
    while (i > 0 && list[i].t / TICK_RATE > this.renderTime) i--;
    const a = list[i];
    const b = list[i + 1] || a;
    const ta = a.t / TICK_RATE;
    const tb = b.t / TICK_RATE;
    const t = tb > ta ? Math.min(1, Math.max(0, (this.renderTime - ta) / (tb - ta))) : 0;

    const events = [];
    for (const s of list) {
      if (s.t / TICK_RATE <= this.renderTime && s.t > this.lastTick) {
        this.lastTick = s.t;
        events.push(...s.ev);
      }
    }
    while (list.length > 2 && list[1].t / TICK_RATE < this.renderTime - 1) list.shift();
    return { a, b, t, events };
  }

  get viewTick() {
    return Math.round(this.renderTime * TICK_RATE);
  }
}

// Own-player prediction: apply our commands at once, then on each snapshot restart from the
// server's state and replay the commands it hasn't processed yet. Corrections are smoothed out.
export class Predictor {
  constructor(step) {
    this.step = step;
    this.state = null;
    this.pending = [];
    this.ox = 0;
    this.oy = 0;
  }

  clear() {
    this.state = null;
    this.pending = [];
    this.ox = 0;
    this.oy = 0;
  }

  local(cmd) {
    if (!this.state) return;
    this.pending.push(cmd);
    if (this.pending.length > 120) this.pending.shift();
    this.step(this.state, cmd);
  }

  reconcile(server) {
    const before = this.state;
    this.pending = this.pending.filter((c) => c.seq > server.ack);
    this.state = { ...server };
    for (const c of this.pending) this.step(this.state, c);
    if (before) {
      this.ox += before.x - this.state.x;
      this.oy += before.y - this.state.y;
      if (Math.hypot(this.ox, this.oy) > 150) this.ox = this.oy = 0;
    }
  }

  // Predicted position with the correction offset easing away.
  pos(dt) {
    const k = Math.exp(-12 * dt);
    this.ox *= k;
    this.oy *= k;
    return { x: this.state.x + this.ox, y: this.state.y + this.oy };
  }
}
