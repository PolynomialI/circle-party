import { THEME } from '../shared/theme.js';

// Drawing helpers for the cartoon facility look: solid fills with dark navy outlines,
// flat offset shadows, chunky outlined text.

export const font = (weight, size) => `${weight} ${size}px ${THEME.font}`;

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

export function disc(ctx, x, y, r, fill, stroke, width = THEME.outline) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.lineWidth = width;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

// A player: colour circle with a navy outline and two eyes looking where they aim.
// Ours gets a yellow ring.
export function player(ctx, x, y, r, color, aim, isMe, body = color.main) {
  if (isMe) disc(ctx, x, y, r + 6, null, THEME.accent, 3);
  disc(ctx, x, y, r, body, THEME.ink);
  const fx = Math.cos(aim);
  const fy = Math.sin(aim);
  for (const side of [-1, 1]) {
    const ex = x + fx * r * 0.38 - fy * side * r * 0.36;
    const ey = y + fy * r * 0.38 + fx * side * r * 0.36;
    disc(ctx, ex, ey, r * 0.27, THEME.white, THEME.ink, 2);
    disc(ctx, ex + fx * r * 0.1, ey + fy * r * 0.1, r * 0.12, THEME.ink);
  }
}

// Name above a player: white with a navy outline, readable on light floors and in the dark.
export function nameTag(ctx, x, y, r, name) {
  ctx.font = font(600, 13);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = THEME.ink;
  ctx.strokeText(name, x, y - r - 8);
  ctx.fillStyle = THEME.white;
  ctx.fillText(name, x, y - r - 8);
}

// Aiming ring drawn at the mouse.
export function crosshair(ctx, x, y) {
  for (const [w, c] of [[5, THEME.ink], [2.5, THEME.white]]) {
    ctx.lineWidth = w;
    ctx.strokeStyle = c;
    ctx.beginPath();
    ctx.arc(x, y, 11, 0, Math.PI * 2);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      ctx.moveTo(x + dx * 5, y + dy * 5);
      ctx.lineTo(x + dx * 15, y + dy * 15);
    }
    ctx.stroke();
  }
}

// A held item (stick, gun...) as an outlined rectangle pointing along angle, starting at the body's edge.
export function held(ctx, x, y, angle, from, len, w, fill = THEME.gun) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = fill;
  ctx.fillRect(from, -w / 2, len, w);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = THEME.ink;
  ctx.strokeRect(from, -w / 2, len, w);
  ctx.restore();
}

// Charge ring around a player, yellow turning red as it fills.
export function chargeArc(ctx, x, y, r, charge) {
  ctx.beginPath();
  ctx.arc(x, y, r + 5, -Math.PI / 2, -Math.PI / 2 + charge * Math.PI * 2);
  ctx.lineWidth = THEME.chargeWidth;
  ctx.lineCap = 'round';
  ctx.strokeStyle = `hsl(${45 - charge * 45}, 90%, 55%)`;
  ctx.stroke();
  ctx.lineCap = 'butt';
}

// Small bar under a player (cooldowns, health).
export function bar(ctx, x, y, frac, fill) {
  const w = 32;
  ctx.fillStyle = THEME.ink;
  ctx.fillRect(x - w / 2 - 1.5, y - 1.5, w + 3, 7);
  ctx.fillStyle = THEME.inkSoft;
  ctx.fillRect(x - w / 2, y, w, 4);
  ctx.fillStyle = fill || (frac >= 1 ? THEME.good : THEME.accent);
  ctx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, frac)), 4);
}

// Chunky outlined text for countdowns and banners.
export function bigText(ctx, text, x, y, size, color) {
  ctx.font = font(700, Math.round(size));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(4, size * 0.14);
  ctx.strokeStyle = THEME.ink;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

// Yellow and navy diagonal stripes filling a rectangle.
export function hazard(ctx, x, y, w, h) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = THEME.accent;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = THEME.ink;
  const step = 16;
  for (let s = -h; s < w + h; s += step) {
    ctx.beginPath();
    ctx.moveTo(x + s, y + h);
    ctx.lineTo(x + s + h, y);
    ctx.lineTo(x + s + h + step / 2, y);
    ctx.lineTo(x + s + step / 2, y + h);
    ctx.fill();
  }
  ctx.restore();
}

// A small glowing power-up crate (pulsing halo, coloured box, white cross).
export function crate(ctx, x, y, color, phase = 0) {
  const pulse = 0.5 + 0.5 * Math.sin((performance.now() / 1000) * 4 + phase);
  ctx.globalAlpha = 0.18 + 0.12 * pulse;
  disc(ctx, x, y, 34 + pulse * 8, color);
  ctx.globalAlpha = 0.3;
  disc(ctx, x, y, 22, color);
  ctx.globalAlpha = 1;
  const s = 13;
  ctx.fillStyle = color;
  ctx.fillRect(x - s, y - s, s * 2, s * 2);
  ctx.strokeStyle = THEME.ink;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(x - s, y - s, s * 2, s * 2);
  ctx.fillStyle = THEME.white;
  ctx.fillRect(x - s + 5, y - 2, s * 2 - 10, 4);
  ctx.fillRect(x - 2, y - s + 5, 4, s * 2 - 10);
}

// A card-coloured HUD panel.
export function panel(ctx, x, y, w, h) {
  ctx.fillStyle = THEME.card;
  roundRect(ctx, x, y, w, h, 12);
  ctx.fill();
  ctx.lineWidth = THEME.outline;
  ctx.strokeStyle = THEME.ink;
  ctx.stroke();
}

// The power-up you're holding, bottom left: a crate swatch and its name (and charges, if any).
export function heldPower(ctx, H, name, color, extra = '') {
  panel(ctx, 16, H - 58, 200, 42);
  ctx.fillStyle = color;
  ctx.fillRect(30, H - 47, 20, 20);
  ctx.strokeStyle = THEME.ink;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(30, H - 47, 20, 20);
  ctx.fillStyle = THEME.ink;
  ctx.font = font(700, 16);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(name.toUpperCase() + extra, 62, H - 36);
}

// Short effects: expanding rings and paint splats that fade out.
export class Effects {
  constructor() {
    this.rings = [];
    this.splats = [];
  }

  ring(x, y, color, r0, r1, dur = 0.25, width = THEME.lineWidth) {
    this.rings.push({ x, y, color, r0, r1, dur, width, t0: performance.now() / 1000 });
  }

  // A blob of paint with a few droplets, mostly thrown along angle.
  splat(x, y, color, size = 14, angle = Math.random() * Math.PI * 2, life = 6) {
    const blobs = [{ x: 0, y: 0, r: size }];
    for (let i = 0; i < 7; i++) {
      const a = angle + (Math.random() - 0.5) * 1.6;
      const d = size * (0.6 + Math.random() * 1.4);
      blobs.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: size * (0.18 + Math.random() * 0.35) });
    }
    this.splats.push({ x, y, color, blobs, life, t0: performance.now() / 1000 });
    if (this.splats.length > 60) this.splats.shift();
  }

  drawSplats(ctx) {
    const now = performance.now() / 1000;
    for (const s of this.splats) {
      ctx.globalAlpha = Math.min(1, (s.life - (now - s.t0)) / 1.5) * 0.9;
      ctx.fillStyle = s.color;
      for (const b of s.blobs) {
        ctx.beginPath();
        ctx.arc(s.x + b.x, s.y + b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    this.splats = this.splats.filter((s) => now - s.t0 < s.life);
  }

  drawRings(ctx) {
    const now = performance.now() / 1000;
    for (const f of this.rings) {
      const k = Math.min(1, (now - f.t0) / f.dur);
      ctx.globalAlpha = 1 - k;
      disc(ctx, f.x, f.y, f.r0 + (f.r1 - f.r0) * k, null, f.color, f.width);
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
    bigText(ctx, b.text, x, y, 60 * (0.6 + 0.4 * pop), b.color);
    ctx.globalAlpha = 1;
  }
}
