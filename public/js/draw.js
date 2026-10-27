import { THEME } from '../shared/theme.js';

// Flat drawing helpers in Circle Soccer's style: solid fills, thin darker outlines, no shadows.

export const font = (weight, size) => `${weight} ${size}px ${THEME.font}`;

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

export function disc(ctx, x, y, r, fill, stroke, width = THEME.outline) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = width;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

// A player: colour circle with a darker outline and their initial; ours gets a white ring.
export function player(ctx, x, y, r, color, name, isMe) {
  disc(ctx, x, y, r, color.main, color.dark);
  if (isMe) {
    ctx.beginPath();
    ctx.arc(x, y, r + 3, 0, Math.PI * 2);
    ctx.lineWidth = THEME.meRing;
    ctx.strokeStyle = THEME.white;
    ctx.stroke();
  }
  ctx.fillStyle = THEME.white;
  ctx.font = font(800, Math.round(r * 1.05));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((Array.from(name)[0] || '?').toUpperCase(), x, y + 1);
}

export function nameTag(ctx, x, y, r, name, isMe) {
  ctx.font = font(600, 11);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = isMe ? THEME.meName : THEME.white;
  ctx.fillText(name, x, y - r - 5);
}

// Charge ring around a player, yellow turning red as it fills.
export function chargeArc(ctx, x, y, r, charge) {
  ctx.beginPath();
  ctx.arc(x, y, r + 4, -Math.PI / 2, -Math.PI / 2 + charge * Math.PI * 2);
  ctx.lineWidth = THEME.chargeWidth;
  ctx.lineCap = 'round';
  ctx.strokeStyle = `hsl(${50 - charge * 50}, 100%, 55%)`;
  ctx.stroke();
  ctx.lineCap = 'butt';
}

// Small cooldown bar under a player (Circle Soccer's stamina bar).
export function bar(ctx, x, y, frac) {
  const w = 30;
  ctx.fillStyle = THEME.barBack;
  ctx.fillRect(x - w / 2, y, w, 3.5);
  ctx.fillStyle = frac >= 1 ? THEME.ready : THEME.notReady;
  ctx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, frac)), 3.5);
}

// Big centred text for countdowns and banners.
export function bigText(ctx, text, x, y, size, color) {
  ctx.font = font(900, Math.round(size));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

// Short flat effects: expanding rings that fade out.
export class Effects {
  constructor() {
    this.rings = [];
  }

  ring(x, y, color, r0, r1, dur = 0.25, width = THEME.lineWidth) {
    this.rings.push({ x, y, color, r0, r1, dur, width, t0: performance.now() / 1000 });
  }

  draw(ctx) {
    const now = performance.now() / 1000;
    for (const f of this.rings) {
      const k = Math.min(1, (now - f.t0) / f.dur);
      ctx.globalAlpha = 1 - k;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r0 + (f.r1 - f.r0) * k, 0, Math.PI * 2);
      ctx.lineWidth = f.width;
      ctx.strokeStyle = f.color;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    this.rings = this.rings.filter((f) => now - f.t0 < f.dur);
  }
}

// A banner across the middle of the screen that pops in and fades out.
export class Banner {
  constructor() {
    this.cur = null;
  }

  show(text, color, dur = 1.8) {
    this.cur = { text, color, dur, t0: performance.now() / 1000 };
  }

  draw(ctx, x, y) {
    const b = this.cur;
    if (!b) return;
    const t = performance.now() / 1000 - b.t0;
    if (t > b.dur) {
      this.cur = null;
      return;
    }
    const pop = Math.min(1, t / 0.15);
    ctx.globalAlpha = Math.min(1, (b.dur - t) / 0.3);
    bigText(ctx, b.text, x, y, 64 * (0.6 + 0.4 * pop), b.color);
    ctx.globalAlpha = 1;
  }
}
