// Maps built from rectangles, shared by the server and the browser.
//   zones:  [x, y, w, h, floorKind]   coloured floor areas (rooms, ice, paint...)
//   blocks: [x, y, w, h, kind]        solid: 'wall' | 'crate' | 'machine' | 'pillar'
//   marks:  painted floor markings, only drawn (arrows, letters, rings, hazard stripes)
// Coordinates start at the top-left corner; maps are w by h.

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// Walls around the edge of a w x h map, t thick.
export function border(w, h, t = 40) {
  return [[0, 0, w, t, 'wall'], [0, h - t, w, t, 'wall'], [0, t, t, h - 2 * t, 'wall'], [w - t, t, t, h - 2 * t, 'wall']];
}

// Mirror a list of blocks left-right (for symmetric team maps).
export function mirrorX(blocks, w) {
  return blocks.map(([x, y, bw, bh, k]) => [w - x - bw, y, bw, bh, k]);
}

// Pushes a circle out of every block it overlaps. bounce > 0 reflects velocity (ricochets).
// Returns true if it touched anything.
export function collideBlocks(p, r, blocks, bounce = 0) {
  let hit = false;
  for (const [bx, by, bw, bh] of blocks) {
    const cx = clamp(p.x, bx, bx + bw);
    const cy = clamp(p.y, by, by + bh);
    let nx = p.x - cx;
    let ny = p.y - cy;
    const d2 = nx * nx + ny * ny;
    if (d2 >= r * r) continue;
    let push;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      nx /= d;
      ny /= d;
      push = r - d;
    } else {
      // Centre inside the block: leave by the nearest side.
      const left = p.x - bx;
      const right = bx + bw - p.x;
      const top = p.y - by;
      const bottom = by + bh - p.y;
      const m = Math.min(left, right, top, bottom);
      nx = m === left ? -1 : m === right ? 1 : 0;
      ny = m === top ? -1 : m === bottom ? 1 : 0;
      push = m + r;
    }
    p.x += nx * push;
    p.y += ny * push;
    const vn = (p.vx || 0) * nx + (p.vy || 0) * ny;
    if (vn < 0 && p.vx !== undefined) {
      p.vx -= (1 + bounce) * vn * nx;
      p.vy -= (1 + bounce) * vn * ny;
    }
    hit = true;
  }
  return hit;
}

// Distance along a ray (unit direction dx, dy) to the first block, or max if none.
export function rayBlocks(x, y, dx, dy, max, blocks) {
  let best = max;
  const ix = dx !== 0 ? 1 / dx : Infinity;
  const iy = dy !== 0 ? 1 / dy : Infinity;
  for (const [bx, by, bw, bh] of blocks) {
    let t1 = (bx - x) * ix;
    let t2 = (bx + bw - x) * ix;
    let tmin = Math.min(t1, t2);
    let tmax = Math.max(t1, t2);
    t1 = (by - y) * iy;
    t2 = (by + bh - y) * iy;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
    if (tmax >= Math.max(tmin, 0) && tmin < best) best = Math.max(0, tmin);
  }
  return best;
}

export function lineClear(ax, ay, bx, by, blocks) {
  const d = Math.hypot(bx - ax, by - ay);
  if (d < 1e-6) return true;
  return rayBlocks(ax, ay, (bx - ax) / d, (by - ay) / d, d, blocks) >= d - 1e-6;
}

// Distance along a ray to a circle, or Infinity if it misses.
export function rayCircle(x, y, dx, dy, cx, cy, r) {
  const fx = x - cx;
  const fy = y - cy;
  const b = fx * dx + fy * dy;
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - c;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : c <= 0 ? 0 : Infinity;
}

export function zoneAt(map, x, y) {
  if (!map.zones) return null;
  for (let i = map.zones.length - 1; i >= 0; i--) {
    const [zx, zy, zw, zh, kind] = map.zones[i];
    if (x >= zx && x <= zx + zw && y >= zy && y <= zy + zh) return kind;
  }
  return null;
}
