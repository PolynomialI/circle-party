// Keyboard and mouse, turned into one command per tick: { mx, my, a, b }.
// b bit 1 = primary button held, bit 2 = dash pressed since the last command.

const MOVE = { KeyW: 'up', KeyA: 'left', KeyS: 'down', KeyD: 'right' };

export class Input {
  constructor(canvas) {
    this.held = new Set();
    this.order = {}; // key -> when it was last pressed, so the newest of two opposite keys wins
    this.count = 0;
    this.mouse = { x: 0, y: 0, down: false, seen: false };
    this.dash = false;
    this.aim = 0;
    this.enabled = false;

    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (MOVE[e.code]) {
        e.preventDefault();
        if (!this.held.has(MOVE[e.code])) this.order[MOVE[e.code]] = ++this.count;
        this.held.add(MOVE[e.code]);
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) this.dash = true;
      }
    });
    window.addEventListener('keyup', (e) => {
      if (MOVE[e.code]) this.held.delete(MOVE[e.code]);
    });
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.seen = true;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0 && this.enabled) this.mouse.down = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.down = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => this.releaseAll());
  }

  axis(neg, pos) {
    const n = this.held.has(neg);
    const p = this.held.has(pos);
    if (n && p) return this.order[pos] > this.order[neg] ? 1 : -1;
    return p ? 1 : n ? -1 : 0;
  }

  // origin: the screen position to aim from (our own player), or null.
  command(origin) {
    if (origin && this.mouse.seen) {
      const dx = this.mouse.x - origin.x;
      const dy = this.mouse.y - origin.y;
      if (dx * dx + dy * dy > 1) this.aim = Math.atan2(dy, dx);
    }
    let mx = this.axis('left', 'right');
    let my = this.axis('up', 'down');
    if (mx && my) {
      mx *= Math.SQRT1_2;
      my *= Math.SQRT1_2;
    }
    const b = (this.mouse.down ? 1 : 0) | (this.dash ? 2 : 0);
    this.dash = false;
    return { mx, my, a: this.aim, b };
  }

  releaseAll() {
    this.held.clear();
    this.mouse.down = false;
    this.dash = false;
  }
}
