import * as THREE from 'three';
import { HALF, clamp } from '../config.js';

const R = 1; // collision radius; pos is the sphere centre, feet are at pos.y - R
const G = -75;
const JUMP = 30;
const CLIMB = 24;
const MAX_SPEED = 160;
const UP = new THREE.Vector3(0, 1, 0);

// Candidate web targets relative to the player: [forward, up, side]. The side flips each shot
// so swings alternate left and right like a real web-slinger.
const ANCHOR_CANDIDATES = [[55, 48, 16], [45, 40, -14], [70, 55, 24], [35, 32, 0], [90, 60, -20], [30, 45, 30]];

export function createPlayer({ city, input, hero, web, events = {} }) {
  const pos = new THREE.Vector3();
  const vel = new THREE.Vector3();
  const anchor = new THREE.Vector3();
  const p = { pos, vel, anchor, grounded: false, swinging: false, climbing: false, swings: 0 };

  const dir = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const wallN = new THREE.Vector3();
  const heading = new THREE.Vector3(0, 0, -1);
  const by = new THREE.Vector3(), bz = new THREE.Vector3(), hand = new THREE.Vector3();
  let ropeLen = 0, jumpTime = -10, attachCooldown = 0, sideSign = 1, time = 0;

  function readInput(yaw) {
    const k = input.keys;
    let f = input.joy.y, r = input.joy.x;
    if (k.KeyW || k.ArrowUp) f += 1;
    if (k.KeyS || k.ArrowDown) f -= 1;
    if (k.KeyD || k.ArrowRight) r += 1;
    if (k.KeyA || k.ArrowLeft) r -= 1;
    // Camera forward is (-sin yaw, -cos yaw); camera right is (cos yaw, -sin yaw).
    dir.set(-Math.sin(yaw) * f + Math.cos(yaw) * r, 0, -Math.cos(yaw) * f - Math.sin(yaw) * r);
    if (dir.lengthSq() > 1) dir.normalize();
  }

  function tryAttach(yaw) {
    // Aim between where you're moving and where the camera looks.
    let hx = vel.x, hz = vel.z, hl = Math.hypot(hx, hz);
    const cfx = -Math.sin(yaw), cfz = -Math.cos(yaw);
    if (hl < 8) { hx = cfx; hz = cfz; hl = 1; }
    let fx = (hx / hl) * 0.5 + cfx * 0.5, fz = (hz / hl) * 0.5 + cfz * 0.5;
    const fl = Math.hypot(fx, fz) || 1;
    fx /= fl;
    fz /= fl;
    const sx = -fz, sz = fx;
    sideSign *= -1;

    let best = null, bestScore = Infinity;
    for (const [f, u, s0] of ANCHOR_CANDIDATES) {
      const s = s0 * sideSign;
      const px = pos.x + fx * f + sx * s, py = pos.y + u, pz = pos.z + fz * f + sz * s;
      for (const b of city.nearBoxes(px, pz)) {
        const qx = clamp(px, b.minX, b.maxX), qy = clamp(py, b.y0, b.y1), qz = clamp(pz, b.minZ, b.maxZ);
        if (qy < pos.y + 6) continue;
        const reach = Math.hypot(qx - pos.x, qy - pos.y, qz - pos.z);
        if (reach > 150 || reach < 12) continue;
        const score = (px - qx) ** 2 + (py - qy) ** 2 + (pz - qz) ** 2;
        if (score < bestScore) {
          bestScore = score;
          best = [qx, qy, qz];
        }
      }
    }
    if (!best || bestScore > 60 * 60) {
      attachCooldown = time + 0.15;
      events.onNoAnchor?.();
      return;
    }
    anchor.set(best[0], best[1], best[2]);
    p.swinging = true;
    p.climbing = false;
    p.grounded = false;
    ropeLen = anchor.distanceTo(pos) * 0.92;
    tmp.subVectors(anchor, pos).normalize();
    vel.addScaledVector(tmp, 8);
    p.swings++;
    events.onAttach?.(p.swings);
  }

  function release(boost = true) {
    p.swinging = false;
    web.hide();
    if (!boost) return;
    const hl = Math.hypot(vel.x, vel.z);
    if (hl > 1) {
      vel.x += (vel.x / hl) * 6;
      vel.z += (vel.z / hl) * 6;
    }
    vel.y += 9;
  }

  // Sphere vs building boxes. Lands on roofs, slides along walls, returns the last wall touched.
  function collide(prevY) {
    let wall = null;
    for (const b of city.nearBoxes(pos.x, pos.z)) {
      if (pos.y + R < b.y0 || pos.y - R > b.y1) continue;
      const cx = clamp(pos.x, b.minX, b.maxX), cz = clamp(pos.z, b.minZ, b.maxZ);
      const dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 > R * R) continue;
      if (prevY - R >= b.y1 - 0.6 && vel.y <= 0) {
        pos.y = b.y1 + R;
        vel.y = 0;
        p.grounded = true;
        continue;
      }
      if (prevY + R <= b.y0 + 0.3 && vel.y > 0) {
        pos.y = b.y0 - R;
        vel.y = 0;
        continue;
      }
      let nx, nz;
      if (d2 === 0) {
        // Centre is inside the footprint: push out through the nearest face.
        const faces = [[pos.x - b.minX, -1, 0], [b.maxX - pos.x, 1, 0], [pos.z - b.minZ, 0, -1], [b.maxZ - pos.z, 0, 1]];
        faces.sort((a, c) => a[0] - c[0]);
        [, nx, nz] = faces[0];
        if (nx) pos.x = nx < 0 ? b.minX - R : b.maxX + R;
        else pos.z = nz < 0 ? b.minZ - R : b.maxZ + R;
      } else {
        const l = Math.sqrt(d2);
        nx = dx / l;
        nz = dz / l;
        pos.x = cx + nx * R;
        pos.z = cz + nz * R;
      }
      const vn = vel.x * nx + vel.z * nz;
      if (vn < 0) {
        vel.x -= nx * vn;
        vel.z -= nz * vn;
      }
      wall = { nx, nz };
    }
    return wall;
  }

  function integrate(dt, sprint) {
    const prevY = pos.y;
    if (p.grounded && !p.swinging) {
      const target = sprint ? 42 : 22;
      const k = 1 - Math.exp(-(dir.lengthSq() > 0 ? 8 : 12) * dt);
      vel.x += (dir.x * target - vel.x) * k;
      vel.z += (dir.z * target - vel.z) * k;
    } else {
      const ctrl = p.swinging ? 34 : 16;
      vel.x += dir.x * ctrl * dt;
      vel.z += dir.z * ctrl * dt;
      const drag = p.swinging ? 0.04 : 0.12;
      vel.x *= 1 - drag * dt;
      vel.z *= 1 - drag * dt;
    }
    vel.y += G * dt;
    if (p.climbing) vel.y = CLIMB;
    pos.addScaledVector(vel, dt);

    if (p.swinging) {
      // Reel in a little while swinging; sprint reels faster.
      ropeLen = Math.max(10, ropeLen - (sprint ? 14 : 5) * dt);
      tmp.subVectors(pos, anchor);
      const l = tmp.length();
      if (l > ropeLen) {
        tmp.multiplyScalar(1 / l);
        pos.copy(anchor).addScaledVector(tmp, ropeLen);
        const vr = vel.dot(tmp);
        if (vr > 0) vel.addScaledVector(tmp, -vr);
      }
    }

    p.grounded = false;
    if (pos.y < R) {
      pos.y = R;
      if (vel.y < 0) vel.y = 0;
      p.grounded = true;
    }
    const wall = collide(prevY);

    if (wall && !p.swinging) {
      const into = -(dir.x * wall.nx + dir.z * wall.nz);
      if (into > 0.35) {
        p.climbing = true;
        p.grounded = false;
        wallN.set(wall.nx, 0, wall.nz);
      } else p.climbing = false;
    } else if (p.climbing) {
      // Ran out of wall: mantle over the roof edge.
      p.climbing = false;
      if (vel.y > 0) {
        vel.x -= wallN.x * 14;
        vel.z -= wallN.z * 14;
        vel.y = 14;
      }
    }

    const lim = HALF + 15;
    pos.x = clamp(pos.x, -lim, lim);
    pos.z = clamp(pos.z, -lim, lim);
    const sp = vel.length();
    if (sp > MAX_SPEED) vel.multiplyScalar(MAX_SPEED / sp);
  }

  function orient(dt) {
    const hv = Math.hypot(vel.x, vel.z);
    if (hv > 1.5) heading.set(vel.x / hv, 0, vel.z / hv);
    let mode;
    if (p.swinging) {
      mode = 'swing';
      by.subVectors(anchor, pos).normalize();
      if (vel.lengthSq() > 1) bz.copy(vel); else bz.copy(heading);
    } else if (p.climbing) {
      mode = 'climb';
      by.copy(UP);
      bz.copy(wallN).negate();
    } else if (!p.grounded) {
      mode = 'air';
      const lean = Math.min(hv / 70, 1) * 0.8;
      by.set(heading.x * lean, 1, heading.z * lean).normalize();
      bz.copy(heading);
    } else {
      mode = 'ground';
      by.copy(UP);
      bz.copy(heading);
    }
    hero.orient(by, bz, dt, p.swinging ? 8 : 12);
    hero.root.position.set(pos.x, pos.y + 0.16, pos.z);
    hero.animate(dt, { mode, speed: hv });
    if (p.swinging) web.show(hand.copy(by).multiplyScalar(1.5).add(hero.root.position), anchor);
  }

  p.update = (dt, t, yaw) => {
    time = t;
    readInput(yaw);
    if (input.jumpQueued) {
      input.jumpQueued = false;
      if (p.grounded && !p.swinging) {
        vel.y = JUMP;
        p.grounded = false;
        jumpTime = time;
      } else if (p.climbing) {
        vel.addScaledVector(wallN, 22);
        vel.y = 26;
        p.climbing = false;
        jumpTime = time;
      }
    }
    const wantWeb = input.lmb || input.webBtn || (input.keys.Space && !p.grounded && time - jumpTime > 0.22);
    if (wantWeb && !p.swinging && time > attachCooldown) tryAttach(yaw);
    if (!wantWeb && p.swinging) release();

    const sprint = input.keys.ShiftLeft || input.keys.ShiftRight;
    const steps = Math.min(6, Math.max(1, Math.ceil((vel.length() * dt) / 0.8)));
    for (let s = 0; s < steps; s++) integrate(dt / steps, sprint);
    orient(dt);
  };

  p.teleport = (x, y, z, yaw = 0) => {
    if (p.swinging) release(false);
    pos.set(x, y, z);
    vel.set(0, 0, 0);
    p.climbing = false;
    p.grounded = false;
    heading.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    hero.root.position.set(x, y + 0.16, z);
    hero.root.quaternion.setFromAxisAngle(UP, Math.atan2(heading.x, heading.z));
  };

  return p;
}
