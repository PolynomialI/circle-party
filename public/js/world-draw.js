import { THEME } from '../shared/theme.js';
import * as draw from './draw.js';

// Draws rectangle maps (shared/world.js) in the facility style: floors with seams and painted
// markings, then solid props, each with a flat offset shadow and a navy outline.

const ZONE = {
  floor: THEME.floor, alt: THEME.floorAlt, warm: THEME.floorWarm, mint: THEME.floorMint, ice: THEME.ice,
  decal: THEME.decal, metal: THEME.metal, dark: THEME.wallSide, steel: '#c3cfdf', sand: '#ece3cf', lab: '#dff0f5',
};
const LIGHT_POOL = '#e8f1ff';
const SCREEN = '#7fe3d0';
const SCREEN_DARK = '#2c6e6a';
const LEAF = '#5fbf72';
const LEAF_DARK = '#2f8a4a';
const RUST = '#c9704a';

const overlaps = (x, y, w, h, v) => !v || (x < v.x1 && x + w > v.x0 && y < v.y1 && y + h > v.y0);
const now = () => performance.now() / 1000;

// A small deterministic hash so decorations vary per prop without changing every frame.
function hash(a, b) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function drawFloor(ctx, map, view) {
  ctx.fillStyle = THEME.floor;
  ctx.fillRect(0, 0, map.w, map.h);
  for (const [x, y, w, h, kind] of map.zones || []) {
    if (!overlaps(x, y, w, h, view)) continue;
    if (kind === 'tile') {
      // Checkered tiles.
      const s = 40;
      ctx.fillStyle = THEME.floor;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = THEME.floorAlt;
      for (let ty = 0; ty < h; ty += s) for (let tx = (ty / s) % 2 ? s : 0; tx < w; tx += s * 2) ctx.fillRect(x + tx, y + ty, Math.min(s, w - tx), Math.min(s, h - ty));
    } else if (kind === 'grid') {
      // Metal grid flooring.
      ctx.fillStyle = ZONE.steel;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = THEME.metal;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let gx = x + 20; gx < x + w; gx += 20) {
        ctx.moveTo(gx, y);
        ctx.lineTo(gx, y + h);
      }
      for (let gy = y + 20; gy < y + h; gy += 20) {
        ctx.moveTo(x, gy);
        ctx.lineTo(x + w, gy);
      }
      ctx.stroke();
    } else {
      ctx.fillStyle = ZONE[kind] || kind;
      ctx.fillRect(x, y, w, h);
    }
  }
  // Floor plate seams with a bolt at each corner.
  const step = map.seam || 160;
  ctx.strokeStyle = THEME.seam;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = step; x < map.w; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, map.h);
  }
  for (let y = step; y < map.h; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(map.w, y);
  }
  ctx.stroke();
  ctx.fillStyle = THEME.seam;
  for (let x = step; x < map.w; x += step) {
    for (let y = step; y < map.h; y += step) {
      if (!view || (x > view.x0 - 10 && x < view.x1 + 10 && y > view.y0 - 10 && y < view.y1 + 10)) ctx.fillRect(x - 4, y - 4, 8, 8);
    }
  }
  for (const m of map.marks || []) drawMark(ctx, m);
}

export function drawMark(ctx, m) {
  const c = m.c || THEME.decal;
  switch (m.t) {
    case 'arrow': {
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
      break;
    }
    case 'text':
      ctx.font = draw.font(700, m.s || 90);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = c;
      ctx.fillText(m.text, m.x, m.y);
      break;
    case 'ring':
      draw.disc(ctx, m.x, m.y, m.r, null, c, m.w || 10);
      break;
    case 'hazard':
      draw.hazard(ctx, m.x, m.y, m.w, m.h);
      break;
    case 'rect':
      ctx.fillStyle = c;
      ctx.fillRect(m.x, m.y, m.w, m.h);
      break;
    case 'vent':
      drawVent(ctx, m.x, m.y, m.r || 18);
      break;
    case 'light': {
      // A pool of light from a ceiling lamp: a pale disc with a lighter middle.
      ctx.globalAlpha = 0.45;
      draw.disc(ctx, m.x, m.y, m.r || 110, LIGHT_POOL);
      draw.disc(ctx, m.x, m.y, (m.r || 110) * 0.55, LIGHT_POOL);
      ctx.globalAlpha = 1;
      break;
    }
    case 'grate': {
      ctx.fillStyle = THEME.metalDark;
      ctx.fillRect(m.x, m.y, m.w, m.h);
      ctx.fillStyle = THEME.wallSide;
      const along = m.w >= m.h;
      for (let k = 6; k < (along ? m.w : m.h) - 4; k += 12) {
        if (along) ctx.fillRect(m.x + k, m.y + 5, 5, m.h - 10);
        else ctx.fillRect(m.x + 5, m.y + k, m.w - 10, 5);
      }
      ctx.strokeStyle = THEME.ink;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(m.x, m.y, m.w, m.h);
      break;
    }
    case 'cable': {
      // A cable lying on the floor, with a coloured stripe.
      const [x0, y0, cx, cy, x1, y1] = m.pts;
      for (const [w, col] of [[9, THEME.ink], [5, m.c || THEME.wallSide], [1.5, m.c2 || THEME.accent]]) {
        ctx.lineWidth = w;
        ctx.strokeStyle = col;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(cx, cy, x1, y1);
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
      break;
    }
    case 'puddle': {
      ctx.fillStyle = m.c || '#b9d4f3';
      const r = m.r || 30;
      ctx.beginPath();
      ctx.ellipse(m.x, m.y, r, r * 0.6, m.a || 0, 0, Math.PI * 2);
      ctx.ellipse(m.x + r * 0.7, m.y + r * 0.25, r * 0.55, r * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'hatch': {
      const r = m.r || 34;
      draw.disc(ctx, m.x, m.y, r, THEME.metal, THEME.ink, 2.5);
      draw.disc(ctx, m.x, m.y, r * 0.7, null, THEME.metalDark, 3);
      ctx.fillStyle = THEME.metalDark;
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        ctx.fillRect(m.x + Math.cos(a) * r * 0.85 - 2, m.y + Math.sin(a) * r * 0.85 - 2, 4, 4);
      }
      ctx.fillRect(m.x - r * 0.4, m.y - 3, r * 0.8, 6);
      break;
    }
    case 'emblem': {
      // A big painted logo: ring, triangle and dot.
      const r = m.r || 90;
      draw.disc(ctx, m.x, m.y, r, null, c, r * 0.12);
      ctx.fillStyle = c;
      ctx.beginPath();
      for (let k = 0; k < 3; k++) {
        const a = -Math.PI / 2 + (k * Math.PI * 2) / 3;
        ctx.lineTo(m.x + Math.cos(a) * r * 0.6, m.y + Math.sin(a) * r * 0.6);
      }
      ctx.closePath();
      ctx.fill();
      draw.disc(ctx, m.x, m.y, r * 0.18, m.c2 || THEME.floor);
      break;
    }
    case 'fan': {
      // A floor fan in a round housing, blades turning.
      const r = m.r || 40;
      draw.disc(ctx, m.x, m.y, r, THEME.metalDark, THEME.ink, 3);
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(now() * 4);
      ctx.fillStyle = THEME.metal;
      for (let k = 0; k < 4; k++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath();
        ctx.ellipse(r * 0.45, 0, r * 0.42, r * 0.16, 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      draw.disc(ctx, m.x, m.y, r * 0.18, THEME.wallSide, THEME.ink, 2);
      ctx.strokeStyle = THEME.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(m.x - r, m.y);
      ctx.lineTo(m.x + r, m.y);
      ctx.moveTo(m.x, m.y - r);
      ctx.lineTo(m.x, m.y + r);
      ctx.stroke();
      break;
    }
    case 'lane':
      // Dashed painted line.
      ctx.strokeStyle = c;
      ctx.lineWidth = m.w || 6;
      ctx.setLineDash([24, 18]);
      ctx.beginPath();
      ctx.moveTo(m.x0, m.y0);
      ctx.lineTo(m.x1, m.y1);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
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

// Round props cast round shadows; everything else casts its rectangle.
const ROUND = new Set(['tank', 'barrel', 'plant']);

export function drawBlocks(ctx, blocks, view) {
  const so = THEME.shadowOffset;
  ctx.fillStyle = THEME.shadow;
  for (const [x, y, w, h, kind] of blocks) {
    if (!overlaps(x, y, w + so, h + so, view)) continue;
    if (ROUND.has(kind)) draw.disc(ctx, x + w / 2 + so, y + h / 2 + so, Math.min(w, h) / 2, THEME.shadow);
    else {
      draw.roundRect(ctx, x + so, y + so, w, h, 6);
      ctx.fill();
    }
  }
  for (const b of blocks) if (overlaps(b[0], b[1], b[2], b[3], view)) drawBlock(ctx, b);
}

function outline(ctx, x, y, w, h, r = 3) {
  ctx.lineWidth = THEME.outline;
  ctx.strokeStyle = THEME.ink;
  draw.roundRect(ctx, x, y, w, h, r);
  ctx.stroke();
}

function blink(seed, rate = 1.5) {
  return Math.sin(now() * rate * 3 + seed * 20) > 0.2;
}

export function drawBlock(ctx, [x, y, w, h, kind]) {
  const side = Math.min(THEME.wallSideH, h * 0.3);
  const seed = hash(x, y);
  switch (kind) {
    case 'crate': {
      ctx.fillStyle = THEME.crate;
      ctx.fillRect(x, y, w, h);
      // Planks, a darker frame and metal corners.
      ctx.strokeStyle = THEME.crateDark;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let k = 1; k < 3; k++) {
        ctx.moveTo(x + 6, y + (h * k) / 3);
        ctx.lineTo(x + w - 6, y + (h * k) / 3);
      }
      ctx.stroke();
      ctx.lineWidth = 4;
      ctx.strokeRect(x + 5, y + 5, w - 10, h - 10);
      ctx.beginPath();
      ctx.moveTo(x + 7, y + 7);
      ctx.lineTo(x + w - 7, y + h - 7);
      ctx.stroke();
      ctx.fillStyle = THEME.metal;
      for (const [cx, cy] of [[x, y], [x + w - 9, y], [x, y + h - 9], [x + w - 9, y + h - 9]]) ctx.fillRect(cx, cy, 9, 9);
      outline(ctx, x, y, w, h);
      return;
    }
    case 'machine': {
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
      // Status lights on the top edge.
      for (let i = 0; i < 3; i++) draw.disc(ctx, x + 12 + i * 10, y + 4, 2.5, blink(seed + i) ? (i === 2 ? THEME.danger : THEME.good) : THEME.wallSide);
      outline(ctx, x, y, w, h);
      return;
    }
    case 'pillar': {
      ctx.fillStyle = THEME.wallTop;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = THEME.wallRim;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 5, y + 5, w - 10, h - 10);
      draw.disc(ctx, x + w / 2, y + h / 2, Math.min(w, h) * 0.26, THEME.wallRim, THEME.ink, 2);
      ctx.fillStyle = THEME.ink;
      for (const [cx, cy] of [[x + 9, y + 9], [x + w - 9, y + 9], [x + 9, y + h - 9], [x + w - 9, y + h - 9]]) ctx.fillRect(cx - 2, cy - 2, 4, 4);
      outline(ctx, x, y, w, h);
      return;
    }
    case 'tank': {
      // A round pressure tank seen from above, with bands and a gauge.
      const cx = x + w / 2;
      const cy = y + h / 2;
      const r = Math.min(w, h) / 2;
      draw.disc(ctx, cx, cy, r, THEME.metal, THEME.ink);
      draw.disc(ctx, cx, cy, r * 0.78, null, THEME.metalDark, 3);
      draw.disc(ctx, cx, cy, r * 0.45, '#d9e2ee', THEME.ink, 2.5);
      draw.disc(ctx, cx + r * 0.55, cy - r * 0.55, r * 0.18, THEME.white, THEME.ink, 2);
      ctx.strokeStyle = THEME.danger;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.55, cy - r * 0.55);
      ctx.lineTo(cx + r * 0.55 + Math.cos(seed * 6) * r * 0.13, cy - r * 0.55 + Math.sin(seed * 6) * r * 0.13);
      ctx.stroke();
      return;
    }
    case 'barrel': {
      const cx = x + w / 2;
      const cy = y + h / 2;
      const r = Math.min(w, h) / 2;
      const col = seed > 0.5 ? RUST : THEME.teal;
      draw.disc(ctx, cx, cy, r, col, THEME.ink);
      draw.disc(ctx, cx, cy, r * 0.7, null, THEME.ink, 2);
      draw.disc(ctx, cx - r * 0.3, cy - r * 0.3, r * 0.15, THEME.ink);
      return;
    }
    case 'plant': {
      const cx = x + w / 2;
      const cy = y + h / 2;
      const r = Math.min(w, h) / 2;
      draw.disc(ctx, cx, cy, r, THEME.crateDark, THEME.ink);
      for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI) / 3 + seed * 3;
        ctx.fillStyle = k % 2 ? LEAF : LEAF_DARK;
        ctx.beginPath();
        ctx.ellipse(cx + Math.cos(a) * r * 0.45, cy + Math.sin(a) * r * 0.45, r * 0.55, r * 0.25, a, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = THEME.ink;
        ctx.stroke();
      }
      return;
    }
    case 'locker': {
      ctx.fillStyle = '#7d9bb8';
      ctx.fillRect(x, y, w, h);
      const along = w >= h;
      const n = Math.max(1, Math.round((along ? w : h) / 32));
      ctx.strokeStyle = THEME.ink;
      ctx.lineWidth = 2;
      for (let i = 0; i < n; i++) {
        const lx = along ? x + (w * i) / n : x;
        const ly = along ? y : y + (h * i) / n;
        const lw = along ? w / n : w;
        const lh = along ? h : h / n;
        ctx.strokeRect(lx + 2, ly + 2, lw - 4, lh - 4);
        ctx.fillStyle = THEME.wallSide;
        for (let k = 0; k < 3; k++) ctx.fillRect(lx + lw / 2 - 6, ly + 8 + k * 5, 12, 2);
      }
      outline(ctx, x, y, w, h);
      return;
    }
    case 'console': {
      ctx.fillStyle = THEME.wallInner;
      ctx.fillRect(x, y, w, h);
      // A screen with scrolling lines and a row of buttons.
      const sw = w - 16;
      const sh = Math.max(10, h * 0.5);
      ctx.fillStyle = SCREEN_DARK;
      ctx.fillRect(x + 8, y + 6, sw, sh);
      ctx.fillStyle = SCREEN;
      const off = (now() * 20 + seed * 50) % 8;
      for (let ly = y + 9 + off; ly < y + 6 + sh - 3; ly += 8) ctx.fillRect(x + 12, ly, sw * (0.3 + 0.6 * hash(ly | 0, x)), 2);
      ctx.strokeStyle = THEME.ink;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 8, y + 6, sw, sh);
      for (let i = 0; i < 4; i++) draw.disc(ctx, x + 14 + i * 12, y + h - 9, 3.5, [THEME.danger, THEME.accent, THEME.good, '#4fd1ff'][i], THEME.ink, 1.5);
      outline(ctx, x, y, w, h);
      return;
    }
    case 'server': {
      // A rack of servers with blinking lights.
      ctx.fillStyle = THEME.wallSide;
      ctx.fillRect(x, y, w, h);
      const along = w >= h;
      const n = Math.max(2, Math.round((along ? w : h) / 22));
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const ux = along ? x + w * t + 3 : x + 4;
        const uy = along ? y + 4 : y + h * t + 3;
        const uw = along ? w / n - 6 : w - 8;
        const uh = along ? h - 8 : h / n - 6;
        ctx.fillStyle = '#3a4252';
        ctx.fillRect(ux, uy, uw, uh);
        draw.disc(ctx, ux + 5, uy + 5, 2, blink(seed + i, 2.5) ? THEME.good : '#2a6b47');
        draw.disc(ctx, ux + 11, uy + 5, 2, blink(seed + i * 3, 1.2) ? '#4fd1ff' : '#24566b');
      }
      outline(ctx, x, y, w, h);
      return;
    }
    case 'shelf': {
      ctx.fillStyle = THEME.metalDark;
      ctx.fillRect(x, y, w, h);
      // Boxes of different sizes on the shelf.
      const along = w >= h;
      let k = 4;
      let i = 0;
      while (k < (along ? w : h) - 10) {
        const size = 14 + hash(x + i, y) * 16;
        const col = [THEME.crate, '#e8d29a', THEME.floorAlt, '#d98a6a'][i % 4];
        ctx.fillStyle = col;
        if (along) ctx.fillRect(x + k, y + 5, size, h - 10);
        else ctx.fillRect(x + 5, y + k, w - 10, size);
        ctx.strokeStyle = THEME.ink;
        ctx.lineWidth = 1.5;
        if (along) ctx.strokeRect(x + k, y + 5, size, h - 10);
        else ctx.strokeRect(x + 5, y + k, w - 10, size);
        k += size + 4;
        i++;
      }
      outline(ctx, x, y, w, h);
      return;
    }
    case 'pipe': {
      // A pipe run with joints and a red valve wheel.
      const along = w >= h;
      ctx.fillStyle = THEME.metal;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#d9e2ee';
      if (along) ctx.fillRect(x, y + h * 0.25, w, h * 0.2);
      else ctx.fillRect(x + w * 0.25, y, w * 0.2, h);
      ctx.fillStyle = THEME.metalDark;
      const len = along ? w : h;
      for (let k = 30; k < len; k += 60) {
        if (along) ctx.fillRect(x + k, y - 2, 8, h + 4);
        else ctx.fillRect(x - 2, y + k, w + 4, 8);
      }
      outline(ctx, x, y, w, h, 6);
      const vx = along ? x + w * (0.3 + seed * 0.4) : x + w / 2;
      const vy = along ? y + h / 2 : y + h * (0.3 + seed * 0.4);
      draw.disc(ctx, vx, vy, Math.min(w, h) * 0.75, null, THEME.danger, 4);
      draw.disc(ctx, vx, vy, 3, THEME.ink);
      return;
    }
    default: {
      // Walls: slate top with panel lines, rivets, a lighter rim and a darker front face.
      ctx.fillStyle = THEME.wallTop;
      ctx.fillRect(x, y, w, h);
      const front = h > side * 2;
      if (front) {
        ctx.fillStyle = THEME.wallSide;
        ctx.fillRect(x, y + h - side, w, side);
        // A strip of small lights along long front faces.
        if (w > 160) {
          for (let lx = x + 30; lx < x + w - 20; lx += 70) {
            ctx.fillStyle = blink(seed + lx, 0.4) ? '#9fe8ff' : '#5b8fa8';
            ctx.fillRect(lx, y + h - side + 4, 16, 4);
          }
        }
      }
      const top = h - (front ? side : 0);
      if (w > 16 && top > 16) {
        ctx.strokeStyle = THEME.wallRim;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 5, y + 5, w - 10, top - 10);
        // Panel lines every so often along the wall.
        ctx.beginPath();
        if (w >= h) for (let px = x + 80; px < x + w - 20; px += 80) {
          ctx.moveTo(px, y + 5);
          ctx.lineTo(px, y + top - 5);
        } else for (let py = y + 80; py < y + h - 20; py += 80) {
          ctx.moveTo(x + 5, py);
          ctx.lineTo(x + w - 5, py);
        }
        ctx.stroke();
        ctx.fillStyle = THEME.wallInner;
        if (w >= h) for (let px = x + 12; px < x + w - 8; px += 40) ctx.fillRect(px - 1.5, y + top / 2 - 1.5, 3, 3);
        else for (let py = y + 12; py < y + top - 8; py += 40) ctx.fillRect(x + w / 2 - 1.5, py - 1.5, 3, 3);
      }
      outline(ctx, x, y, w, h);
    }
  }
}
