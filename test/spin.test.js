import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPIN, spinBars } from '../public/shared/minis.js';

// Angular speed of each bar at time t.
const speed = (t) => {
  const h = 1e-4;
  const a = spinBars(t - h);
  const b = spinBars(t + h);
  return { low: (b.low - a.low) / (2 * h), high: (b.high - a.high) / (2 * h) };
};

test('spin cycle bars crawl for the first seconds, then ease up to full speed', () => {
  const { slow, ease, mul } = SPIN.start;
  for (const t of [0.5, 1.5, slow - 0.1]) {
    assert.ok(Math.abs(speed(t).low) < SPIN.low[0] * (mul + 0.02), `low bar at ${t}s`);
    assert.ok(Math.abs(speed(t).high) < Math.abs(SPIN.high[0]) * (mul + 0.02), `high bar at ${t}s`);
  }
  // Speeds up steadily, and from then on matches the usual ramp.
  assert.ok(Math.abs(speed(slow + ease / 2).low) > Math.abs(speed(slow - 0.1).low));
  for (const t of [slow + ease + 0.1, 20, 70]) {
    const R = SPIN.ramp;
    const base = (v0, v1) => v0 + (v1 - v0) * Math.min(t, R) / R;
    assert.ok(Math.abs(speed(t).low - base(...SPIN.low)) < 1e-3, `low bar at ${t}s`);
    assert.ok(Math.abs(speed(t).high - base(...SPIN.high)) < 1e-3, `high bar at ${t}s`);
  }
  // No jumps in position anywhere.
  for (let t = 0.01; t < 10; t += 0.01) {
    const a = spinBars(t - 0.01);
    const b = spinBars(t);
    assert.ok(Math.abs(b.low - a.low) < 0.05 && Math.abs(b.high - a.high) < 0.05, `jump at ${t.toFixed(2)}s`);
  }
});
