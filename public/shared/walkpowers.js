// Power-up crates for the walking games (Bomb Tag, Crown Keeper, Paint Grab). Boots and Bubble
// work as soon as you grab them; the rest you hold and use with a click.
import { DT } from './loop.js';
import { rayBlocks } from './world.js';

export const WALK_POWERS = {
  boots: { name: 'Rocket Boots', color: '#ff8a3d', time: 5, speed: 1.35 },
  bubble: { name: 'Bubble', color: '#4fd1ff', time: 4 }, // can't be tagged, robbed or punched
  glove: { name: 'Glove', color: '#ff6fb5', uses: 3, reach: 36, arc: 1.1, push: 900, cd: 0.45 },
  blink: { name: 'Blink', color: '#b77bff', dist: 170 }, // hop a short way where you aim
  splash: { name: 'Paint Bomb', color: '#59e07a', r: 130 }, // Paint Grab only: paint everything round you
};
export const WALK_POWER_IDS = Object.keys(WALK_POWERS);
export const INSTANT = new Set(['boots', 'bubble']);
export const WALK_CRATES = { max: 2, every: 6, first: 4, reach: 22 };

export function newPowerState() {
  return { held: '', uses: 0, trig: false, gcd: 0, bootsT: 0, bubbleT: 0 };
}

// One tick of timers and the click. Blink moves you here (so the browser predicts it too);
// returns the power-up on the tick it is used, otherwise ''.
export function useWalkPower(p, cmd, map, frozen) {
  p.gcd = Math.max(0, p.gcd - DT);
  p.bootsT = Math.max(0, p.bootsT - DT);
  p.bubbleT = Math.max(0, p.bubbleT - DT);
  const click = (cmd.b & 1) !== 0 && !p.trig;
  p.trig = (cmd.b & 1) !== 0;
  if (frozen || !click || !p.held) return '';
  const kind = p.held;
  if (kind === 'glove') {
    if (p.gcd > 0) return '';
    p.gcd = WALK_POWERS.glove.cd;
    if (--p.uses <= 0) p.held = '';
    return kind;
  }
  if (kind === 'blink') {
    const dx = Math.cos(cmd.a);
    const dy = Math.sin(cmd.a);
    const d = Math.max(0, rayBlocks(p.x, p.y, dx, dy, WALK_POWERS.blink.dist + 20, map.blocks) - 20);
    p.x += dx * Math.min(d, WALK_POWERS.blink.dist);
    p.y += dy * Math.min(d, WALK_POWERS.blink.dist);
  }
  p.held = '';
  return kind;
}
