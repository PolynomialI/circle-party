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

  clear(color = THEME.void) {
    this.screen();
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.w, this.h);
  }

  // Camera that shows the whole world rectangle, below a HUD strip of height top.
  fitRect(x0, y0, x1, y1, top = 0, pad = 20) {
    const c = this.cam;
    c.zoom = Math.min((this.w - pad * 2) / (x1 - x0), (this.h - top - pad * 2) / (y1 - y0));
    c.x = (x0 + x1) / 2;
    c.y = (y0 + y1) / 2;
    c.sx = this.w / 2;
    c.sy = top + (this.h - top) / 2;
  }

  fit(radius, top) {
    this.fitRect(-radius, -radius, radius, radius, top, 0);
  }

  // Camera centred on a point, showing about span world units across the longer screen side.
  follow(x, y, span) {
    const c = this.cam;
    c.zoom = Math.max(this.w, this.h) / span;
    c.x = x;
    c.y = y;
    c.sx = this.w / 2;
    c.sy = this.h / 2;
  }

  // The world rectangle currently on screen.
  viewRect() {
    const { zoom, sx, sy, x, y } = this.cam;
    return { x0: x - sx / zoom, y0: y - sy / zoom, x1: x + (this.w - sx) / zoom, y1: y + (this.h - sy) / zoom };
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
