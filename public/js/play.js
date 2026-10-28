import { DT, SEND_EVERY } from '../shared/loop.js';
import { Snapshots } from './net.js';

const r3 = (v) => Math.round(v * 1000) / 1000;

// Glue shared by every game: snapshot buffer, fixed-rate input commands, prediction hook.
// The game object does the game-specific parts (interpolation, prediction step, drawing).
export class Play {
  constructor({ Game, start, myId, socket, stage, input }) {
    this.socket = socket;
    this.input = input;
    this.myId = myId;
    this.game = new Game(stage, start.init);
    this.game.input = input;
    this.snaps = new Snapshots();
    this.seq = 0;
    this.acc = 0;
    this.outbox = [];
    this.setRoster(start.roster);
  }

  setRoster(roster) {
    const me = roster.find((r) => r.id === this.myId);
    this.game.setRoster(roster, me ? me.idx : -1);
  }

  onSnap(snap) {
    if (this.snaps.push(snap)) this.game.onSnap(snap);
  }

  frame(dt) {
    const s = this.snaps.sample(dt);
    if (!s) return;
    this.game.update(s, dt);
    for (const ev of s.events) this.game.onEvent(ev);

    this.acc = Math.min(this.acc + dt, DT * 4);
    while (this.acc >= DT) {
      this.acc -= DT;
      if (!this.game.acting) {
        this.outbox = [];
        continue;
      }
      const cmd = { seq: ++this.seq, ...this.input.command(this.game.aimOrigin()), vt: this.snaps.viewTick };
      this.game.predict(cmd);
      this.outbox.push(cmd);
      if (this.outbox.length >= SEND_EVERY) {
        this.socket.emit('in', { c: this.outbox.map((c) => [c.seq, r3(c.mx), r3(c.my), r3(c.a), c.b, c.vt]) });
        this.outbox = [];
      }
    }
    this.game.draw(dt);
  }
}
