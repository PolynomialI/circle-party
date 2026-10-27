// Small 2D physics helpers (from Circle Soccer). Bodies are plain objects with x, y, vx, vy, r and m.

// Resolves overlap and applies a restitution impulse between two circles.
// Returns the impulse magnitude (0 when the circles do not touch).
export function collideCircles(a, b, restitution) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const rsum = a.r + b.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rsum * rsum) return 0;

  const d = Math.sqrt(d2);
  const nx = d > 1e-9 ? dx / d : 1;
  const ny = d > 1e-9 ? dy / d : 0;
  const invA = 1 / a.m;
  const invB = 1 / b.m;
  const invSum = invA + invB;
  if (invSum === 0) return 0;

  const overlap = rsum - d;
  a.x -= nx * overlap * (invA / invSum);
  a.y -= ny * overlap * (invA / invSum);
  b.x += nx * overlap * (invB / invSum);
  b.y += ny * overlap * (invB / invSum);

  const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rel >= 0) return 1e-6; // touching but already separating
  const j = (-(1 + restitution) * rel) / invSum;
  a.vx -= j * nx * invA;
  a.vy -= j * ny * invA;
  b.vx += j * nx * invB;
  b.vy += j * ny * invB;
  return j;
}
