import * as THREE from 'three';
import { clamp } from './config.js';

// Third-person chase camera with mouse look, auto-follow while swinging, and building avoidance.
export function createCameraRig(camera, city) {
  const rig = { yaw: 0, pitch: 0.28 };
  const target = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const probe = new THREE.Vector3();

  function insideBuilding(p) {
    for (const b of city.nearBoxes(p.x, p.z)) {
      if (p.x > b.minX - 0.6 && p.x < b.maxX + 0.6 && p.z > b.minZ - 0.6 && p.z < b.maxZ + 0.6 && p.y > b.y0 - 0.6 && p.y < b.y1 + 0.6) return true;
    }
    return false;
  }

  function place(player, dist) {
    const cp = Math.cos(rig.pitch);
    desired.set(
      target.x + Math.sin(rig.yaw) * cp * dist,
      target.y + Math.sin(rig.pitch) * dist + 1.2,
      target.z + Math.cos(rig.yaw) * cp * dist,
    );
    if (insideBuilding(desired)) {
      for (let t = 0.9; t >= 0.15; t -= 0.075) {
        probe.lerpVectors(target, desired, t);
        if (!insideBuilding(probe)) { desired.copy(probe); break; }
      }
    }
    desired.y = Math.max(desired.y, 1.6);
  }

  rig.follow = (dt, player, input, reduced) => {
    const [dx, dy] = input.consumeLook();
    rig.yaw -= dx * 0.0024;
    rig.pitch = clamp(rig.pitch + dy * 0.002, -0.25, 1.25);

    const v = player.vel;
    const speed = v.length();
    const idle = performance.now() / 1000 - input.lastLookTime > 1.6;
    if (idle && speed > 18 && !player.grounded) {
      const ty = Math.atan2(-v.x, -v.z);
      const d = Math.atan2(Math.sin(ty - rig.yaw), Math.cos(ty - rig.yaw));
      rig.yaw += d * (1 - Math.exp(-1.2 * dt));
    }

    probe.set(player.pos.x, player.pos.y + 2.2, player.pos.z);
    target.lerp(probe, 1 - Math.exp(-14 * dt));
    place(player, 9 + Math.min(speed, 120) * 0.07 + (player.swinging ? 2 : 0));
    camera.position.lerp(desired, 1 - Math.exp(-10 * dt));
    camera.lookAt(target);

    const fov = reduced ? 66 : 64 + Math.min(speed, 110) * 0.17;
    camera.fov += (fov - camera.fov) * (1 - Math.exp(-3 * dt));
    camera.updateProjectionMatrix();
  };

  rig.snap = (player) => {
    target.set(player.pos.x, player.pos.y + 2.2, player.pos.z);
    place(player, 9);
    camera.position.copy(desired);
    camera.lookAt(target);
  };

  // Pull `cam` toward `from` until it is out of any building.
  rig.avoid = (from, cam) => {
    if (!insideBuilding(cam)) return;
    for (let t = 0.9; t >= 0.15; t -= 0.075) {
      probe.lerpVectors(from, cam, t);
      if (!insideBuilding(probe)) { cam.copy(probe); return; }
    }
  };

  return rig;
}
