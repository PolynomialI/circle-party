import { THEME } from '../shared/theme.js';
import * as draw from './draw.js';

// Draws rectangle maps (shared/world.js) in the facility style.

const ZONE = {
  floor: THEME.floor, alt: THEME.floorAlt, warm: THEME.floorWarm, mint: THEME.floorMint,
  ice: THEME.ice, decal: THEME.decal, metal: THEME.metal, dark: THEME.wallSide,
};

const overlaps = (x, y, w, h, v) => !v || (x < v.x1 && x + w > v.x0 && y < v.y1 && y + h > v.y0);

export function drawFloor(ctx, map, view) {
  ctx.fillStyle = THEME.floor;
  ctx.fillRect(0, 0, map.w, map.h);
  for (const [x, y, w, h, kind] of map.zones || []) {
    if (!overlaps(x, y, w, h, view)) continue;
    ctx.fillStyle = ZONE[kind] || kind;
    ctx.fillRect(x, y, w, h);
  }
  // Floor plate seams.
  ctx.strokeStyle = THEME.seam;
  ctx.lineWidth = 2;
  ctx.beginPath();
  const step = map.seam || 160;
  for (let x = step; x < map.w; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, map.h);
  }
  for (let y = step; y < map.h; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(map.w, y);
  }
  ctx.stroke();
  for (const m of map.marks || []) drawMark(ctx, m);
}

export function drawMark(ctx, m) {
  const c = m.c || THEME.decal;
  if (m.t === 'arrow') {
    // A painted arrow: shaft and head, pointing along angle a.
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(m.a || 0);
    const s = m.s || 60;
    ctx.fillStyle = c;
    ctx.fillRect(-s, -s * 0.18, s * 1.2, s * 0.36);
    ctx.beginPath();
    ctx.moveTo(s * 0.9, 0);
    ctx.lineTo(s * 0.1, -s * 0.55);
    ctx.lineTo(s * 0.1, s * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  } else if (m.t === 'text') {
    ctx.font = draw.font(700, m.s || 90);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = c;
    ctx.fillText(m.text, m.x, m.y);
  } else if (m.t === 'ring') {
    draw.disc(ctx, m.x, m.y, m.r, null, c, m.w || 10);
  } else if (m.t === 'hazard') {
    draw.hazard(ctx, m.x, m.y, m.w, m.h);
  } else if (m.t === 'rect') {
    ctx.fillStyle = c;
    ctx.fillRect(m.x, m.y, m.w, m.h);
  } else if (m.t === 'vent') {
    drawVent(ctx, m.x, m.y, m.r || 18);
  }
}

function drawVent(ctx, x, y, r) {
  draw.disc(ctx, x, y, r, THEME.metalDark, THEME.ink, 2.5);
  ctx.fillStyle = THEME.ink;
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      if (i * i + j * j > 1.5) continue;
      ctx.beginPath();
      ctx.arc(x + i * r * 0.45, y + j * r * 0.45, r * 0.13, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function drawBlocks(ctx, blocks, view) {
  const so = THEME.shadowOffset;
  ctx.fillStyle = THEME.shadow;
  for (const [x, y, w, h] of blocks) {
    if (!overlaps(x, y, w + so, h + so, view)) continue;
    draw.roundRect(ctx, x + so, y + so, w, h, 6);
    ctx.fill();
  }
  for (const b of blocks) if (overlaps(b[0], b[1], b[2], b[3], view)) drawBlock(ctx, b);
}

export function drawBlock(ctx, [x, y, w, h, kind]) {
  const side = Math.min(THEME.wallSideH, h * 0.3);
  if (kind === 'crate') {
    ctx.fillStyle = THEME.crate;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = THEME.crateDark;
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 6, y + 6, w - 12, h - 12);
    ctx.beginPath();
    ctx.moveTo(x + 6, y + 6);
    ctx.lineTo(x + w - 6, y + h - 6);
    ctx.moveTo(x + w - 6, y + 6);
    ctx.lineTo(x + 6, y + h - 6);
    ctx.stroke();
  } else if (kind === 'machine') {
    ctx.fillStyle = THEME.metal;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = THEME.teal;
    ctx.fillRect(x + 8, y + 8, w - 16, h - 16 - side);
    draw.hazard(ctx, x, y + h - side, w, side);
    const along = w >= h;
    const n = Math.max(1, Math.floor((along ? w : h) / 70));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      drawVent(ctx, along ? x + w * t : x + w / 2, along ? y + (h - side) / 2 : y + (h - side) * t, Math.min(16, Math.min(w, h) * 0.22));
    }
  } else if (kind === 'pillar') {
    ctx.fillStyle = THEME.wallTop;
    ctx.fillRect(x, y, w, h);
    draw.disc(ctx, x + w / 2, y + h / 2, Math.min(w, h) * 0.3, THEME.wallRim, THEME.ink, 2);
  } else {
    ctx.fillStyle = THEME.wallTop;
    ctx.fillRect(x, y, w, h);
    if (h > side * 2) {
      ctx.fillStyle = THEME.wallSide;
      ctx.fillRect(x, y + h - side, w, side);
    }
    if (w > 16 && h > 16 + side) {
      ctx.strokeStyle = THEME.wallRim;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 5, y + 5, w - 10, h - 10 - (h > side * 2 ? side : 0));
    }
  }
  ctx.lineWidth = THEME.outline;
  ctx.strokeStyle = THEME.ink;
  draw.roundRect(ctx, x, y, w, h, 3);
  ctx.stroke();
}
