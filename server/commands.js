// Per-player queue of input commands. The client sends one command per tick in small batches;
// the server uses one per tick. If none has arrived it repeats the last one briefly, then idles.

const MAX_BATCH = 8;
const MAX_QUEUE = 8; // beyond this we drop old commands so lag can't pile up
const KEEP = 3;
const REPEAT_TICKS = 15;

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

// Wire format: [seq, mx, my, aim, buttons, viewTick]
// buttons: 1 primary held, 2 dash, 4 reload, 8 swap, 16 use (all but 1 are presses)
export function parseCommand(raw) {
  if (!Array.isArray(raw) || raw.length !== 6) return null;
  const [seq, mx, my, a, b, vt] = raw;
  if (!Number.isInteger(seq) || seq < 1 || !finite(mx) || !finite(my) || !finite(a)) return null;
  let x = Math.max(-1, Math.min(1, mx));
  let y = Math.max(-1, Math.min(1, my));
  const l = Math.hypot(x, y);
  if (l > 1) {
    x /= l;
    y /= l;
  }
  return {
    seq,
    mx: x,
    my: y,
    a: Math.atan2(Math.sin(a), Math.cos(a)),
    b: Number.isInteger(b) ? b & 31 : 0,
    vt: Number.isInteger(vt) ? vt : -1,
  };
}

export class CommandQueue {
  constructor() {
    this.queue = [];
    this.lastSeq = 0;
    this.ack = 0;
    this.last = { mx: 0, my: 0, a: 0, b: 0, vt: -1 };
    this.starved = 0;
  }

  push(msg) {
    if (!msg || !Array.isArray(msg.c)) return;
    for (const raw of msg.c.slice(0, MAX_BATCH)) {
      const cmd = parseCommand(raw);
      if (!cmd || cmd.seq <= this.lastSeq) continue;
      this.lastSeq = cmd.seq;
      this.queue.push(cmd);
    }
    if (this.queue.length > MAX_QUEUE) {
      const dropped = this.queue.splice(0, this.queue.length - KEEP);
      for (const c of dropped) this.queue[0].b |= c.b & 30; // never lose a key press
    }
  }

  next() {
    const cmd = this.queue.shift();
    if (cmd) {
      this.ack = cmd.seq;
      this.last = cmd;
      this.starved = 0;
      return cmd;
    }
    this.starved++;
    const held = this.starved <= REPEAT_TICKS;
    return { mx: held ? this.last.mx : 0, my: held ? this.last.my : 0, a: this.last.a, b: held ? this.last.b & 1 : 0, vt: -1 };
  }
}
