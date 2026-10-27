import { THEME } from '../shared/theme.js';

// The canvas: fills the window, sharp on high-DPI screens, with a camera for world drawing.
export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { x: 0, y: 0, zoom: 1, sx: 0, sy: 0 };
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
  }

  clear() {
    this.screen();
    this.ctx.fillStyle = THEME.void;
    this.ctx.fillRect(0, 0, this.w, this.h);
  }

  // Camera that shows a whole arena of the given radius, below a HUD strip of height top.
  fit(radius, top) {
    const c = this.cam;
    c.x = 0;
    c.y = 0;
    c.zoom = Math.min(this.w, this.h - top) / (2 * radius);
    c.sx = this.w / 2;
    c.sy = top + (this.h - top) / 2;
  }

  world() {
    const { zoom, sx, sy, x, y } = this.cam;
    const d = this.dpr;
    this.ctx.setTransform(d * zoom, 0, 0, d * zoom, d * (sx - x * zoom), d * (sy - y * zoom));
  }

  screen() {
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  toScreen(x, y) {
    const { zoom, sx, sy } = this.cam;
    return { x: sx + (x - this.cam.x) * zoom, y: sy + (y - this.cam.y) * zoom };
  }
}
