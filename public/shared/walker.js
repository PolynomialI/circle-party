// Top-down walking with momentum, a dash and wall collisions. The server and the browser's
// own-player prediction both run stepWalker, so they move the same way.
import { DT } from './loop.js';
import { collideBlocks, zoneAt } from './world.js';

export const WALK = {
  radius: 16,
  speed: 240,
  control: 12, // how quickly velocity reaches the wanted velocity (per second)
  iceControl: 1.5,
  dashSpeed: 620,
  dashTime: 0.14,
  dashCooldown: 1.6,
};

export const JUMP = { v: 260, gravity: 1000 }; // about half a second in the air

export function newWalker(x, y, aim = 0) {
  return { x, y, vx: 0, vy: 0, aim, dashT: 0, dashCd: 0, knockT: 0, spd: 1, z: 0, vz: 0 };
}

// cmd: { mx, my, a, b }. o: per-game options (speed, dash on/off...). Returns true on the tick a dash starts.
export function stepWalker(p, cmd, map, o = WALK, frozen = false) {
  p.aim = cmd.a;
  p.dashCd = Math.max(0, p.dashCd - DT);
  p.knockT = Math.max(0, p.knockT - DT);
  if (frozen) {
    p.vx = 0;
    p.vy = 0;
    return false;
  }
  let dashed = false;
  const speed = (o.speed ?? WALK.speed) * (p.spd ?? 1);
  // Games with jumping use Space to jump instead of dash.
  if (o.jump && cmd.b & 2 && (p.z || 0) <= 0) {
    p.vz = JUMP.v;
    p.z = 0.01;
  }
  if (p.z > 0) {
    p.z += p.vz * DT;
    p.vz -= JUMP.gravity * DT;
    if (p.z <= 0) {
      p.z = 0;
      p.vz = 0;
    }
  }
  if (!o.jump && o.dash !== false && cmd.b & 2 && p.dashCd <= 0) {
    const ml = Math.hypot(cmd.mx, cmd.my);
    const dx = ml > 0 ? cmd.mx / ml : Math.cos(p.aim);
    const dy = ml > 0 ? cmd.my / ml : Math.sin(p.aim);
    const ds = o.dashSpeed ?? WALK.dashSpeed;
    p.vx = dx * ds;
    p.vy = dy * ds;
    p.dashT = o.dashTime ?? WALK.dashTime;
    p.dashCd = o.dashCooldown ?? WALK.dashCooldown;
    dashed = true;
  } else if (p.dashT > 0) {
    p.dashT = Math.max(0, p.dashT - DT);
  } else {
    const onIce = zoneAt(map, p.x, p.y) === 'ice';
    const air = (p.z || 0) > 0;
    const control = p.knockT > 0 ? 1.5 : air ? 4 : onIce ? WALK.iceControl : o.control ?? WALK.control;
    const k = 1 - Math.exp(-control * DT);
    p.vx += (cmd.mx * speed - p.vx) * k;
    p.vy += (cmd.my * speed - p.vy) * k;
  }
  p.x += p.vx * DT;
  p.y += p.vy * DT;
  collideBlocks(p, o.radius ?? WALK.radius, map.blocks);
  return dashed;
}
