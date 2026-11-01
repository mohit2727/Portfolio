import * as THREE from 'three';
import { HALF, PITCH, clamp } from '../config.js';
import { BALCONY_Y } from '../world/city.js';

const UP = new THREE.Vector3(0, 1, 0);
const CRUISE_Y = 78; // swing height along the street canyons
const ARC_LEN = 95; // metres per web swing

// Street line next to coordinate v, on the side given by sign.
const streetBeside = (v, sign) => -HALF + PITCH * (sign > 0 ? Math.ceil((v + HALF) / PITCH) : Math.floor((v + HALF) / PITCH));
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * The scripted story route. Stop 0 is the intro rooftop, stops 1..n are the balconies of the
 * section towers. Each leg between stops runs along the streets (out of the block, down one street,
 * round the corner, down the next) as a chain of web swings anchored to real buildings.
 * `update(dt, t)` takes a progress value t in [0, n] from the page scroll.
 */
export function createStory({ city, hero, web, camera, rig, sections, spawn }) {
  const stops = [{ pos: spawn.pos.clone(), out: spawn.face.clone(), intro: true }];
  for (const sec of sections) {
    const lm = city.landmarks.find((l) => l.id === sec.id);
    const prev = stops[stops.length - 1].pos;
    const side = Math.sign(prev.x - lm.x) || 1;
    stops.push({ pos: new THREE.Vector3(lm.x + side * 22.5, BALCONY_Y + 1.05, lm.z), out: new THREE.Vector3(side, 0, 0), tower: lm });
  }

  function findAnchor(mid, lowY) {
    let best = null, bestD = Infinity;
    for (const b of city.nearBoxes(mid.x, mid.z)) {
      if (b.y1 < lowY + 25) continue;
      const qx = clamp(mid.x, b.minX, b.maxX), qz = clamp(mid.z, b.minZ, b.maxZ);
      const d = Math.hypot(qx - mid.x, qz - mid.z);
      if (d < bestD && d < 45) { bestD = d; best = new THREE.Vector3(qx, Math.min(b.y1, lowY + 80), qz); }
    }
    return best || new THREE.Vector3(mid.x, lowY + 70, mid.z);
  }

  const legs = [];
  for (let k = 1; k < stops.length; k++) {
    const S = stops[k - 1].pos, E = stops[k].pos;
    const sz = streetBeside(S.z, Math.sign(E.z - S.z) || 1);
    const ex = streetBeside(E.x, stops[k].out.x);
    const pts = [S, new THREE.Vector3(S.x, CRUISE_Y, sz), new THREE.Vector3(ex, CRUISE_Y, sz), new THREE.Vector3(ex, CRUISE_Y, E.z), E];
    const arcs = [];
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const L = a.distanceTo(b);
      if (L < 1) continue;
      const n = Math.max(1, Math.round(L / ARC_LEN));
      for (let j = 0; j < n; j++) {
        const s = a.clone().lerp(b, j / n), e = a.clone().lerp(b, (j + 1) / n);
        const len = s.distanceTo(e);
        const low = s.clone().add(e).multiplyScalar(0.5);
        low.y = Math.max(12, low.y - Math.min(30, len * 0.3));
        // Quadratic control point chosen so the curve passes through `low` at its middle.
        const q = low.clone().multiplyScalar(2).sub(s.clone().add(e).multiplyScalar(0.5));
        arcs.push({ s, e, q, a: findAnchor(low, low.y), len, start: total });
        total += len;
      }
    }
    legs.push({ arcs, total });
  }

  const pos = new THREE.Vector3(), tan = new THREE.Vector3(), up = new THREE.Vector3(), hand = new THREE.Vector3();
  function sampleLeg(leg, f) {
    const d = easeInOut(f) * leg.total;
    let arc = leg.arcs[leg.arcs.length - 1];
    for (const a of leg.arcs) if (d <= a.start + a.len) { arc = a; break; }
    const u = clamp((d - arc.start) / arc.len, 0, 1), iu = 1 - u;
    pos.set(0, 0, 0).addScaledVector(arc.s, iu * iu).addScaledVector(arc.q, 2 * iu * u).addScaledVector(arc.e, u * u);
    tan.subVectors(arc.q, arc.s).multiplyScalar(2 * iu).addScaledVector(tan.clone().subVectors(arc.e, arc.q), 2 * u);
    if (tan.lengthSq() < 1e-6) tan.subVectors(arc.e, arc.s);
    tan.normalize();
    return u < 0.72 ? arc.a : null; // hold the web for most of the arc, then fly free
  }

  // Camera framing. On wide screens the chapter card sits on the right, so the hero is pushed left.
  const camPos = new THREE.Vector3(), look = new THREE.Vector3();
  const travelCam = new THREE.Vector3(), travelLook = new THREE.Vector3();
  const stopCam = new THREE.Vector3(), stopLook = new THREE.Vector3();
  const side = new THREE.Vector3(), right = new THREE.Vector3(), tH = new THREE.Vector3();
  const lookSmooth = new THREE.Vector3();
  let shown = 0, snapped = false;

  function frameStop(stop, wide) {
    const o = stop.out;
    side.set(-o.z, 0, o.x);
    if (stop.intro) {
      // Behind the hero on the roof edge, looking out toward the Origin tower.
      // Low camera tilted up, so both the hero and the tower top fit in frame.
      stopCam.copy(stop.pos).addScaledVector(o, -11).addScaledVector(side, wide ? -3.5 : 0).add(up.set(0, 2.5, 0));
      stopLook.copy(stop.pos).addScaledVector(o, 60).addScaledVector(side, wide ? -10 : 0).add(up.set(0, 15, 0));
    } else {
      // In front of the hero, tower wall and windows behind.
      stopCam.copy(stop.pos).addScaledVector(o, 13).addScaledVector(side, 5).add(up.set(0, 2.5, 0));
      stopLook.copy(stop.pos).add(up.set(0, 2.2, 0));
    }
    right.subVectors(stopLook, stopCam).cross(UP).normalize();
    if (wide && !stop.intro) stopLook.addScaledVector(right, 3.4);
    if (!wide && !stop.intro) stopLook.y -= 2.6; // phones: card covers the bottom, keep the hero high
  }

  function update(dt, target, wide) {
    shown += (target - shown) * (snapped ? 1 - Math.exp(-5 * dt) : 1);
    const t = clamp(shown, 0, stops.length - 1);
    const k = Math.min(Math.floor(t), legs.length - 1);
    const f = t - k;
    const atStop = f < 0.0005 ? k : f > 0.9995 ? k + 1 : -1;
    const stopIdx = atStop >= 0 ? atStop : f < 0.5 ? k : k + 1;

    let anchor = null;
    if (atStop >= 0) {
      const st = stops[atStop];
      pos.copy(st.pos);
      // Heading along the balcony, so free roam entered here gets a camera clear of the wall.
      if (st.intro) tan.copy(st.out);
      else tan.set(-st.out.z, 0, st.out.x);
      hero.orient(UP, st.out, dt, 6);
      hero.animate(dt, { mode: 'ground', speed: 0 });
      web.hide();
    } else {
      anchor = sampleLeg(legs[k], f);
      if (anchor) up.subVectors(anchor, pos).normalize();
      else up.set(tan.x * 0.6, 1, tan.z * 0.6).normalize();
      hero.orient(up, tan, dt, 10);
      hero.animate(dt, { mode: anchor ? 'swing' : 'air', speed: 30 });
    }
    hero.root.position.set(pos.x, pos.y + 0.16, pos.z);
    if (anchor) web.show(hand.copy(up).multiplyScalar(1.5).add(hero.root.position), anchor);
    else web.hide();

    // Blend chase camera (mid-leg) into the framed shot (at a stop).
    tH.set(tan.x, 0, tan.z);
    if (tH.lengthSq() < 1e-4) tH.copy(stops[stopIdx].out);
    tH.normalize();
    travelCam.copy(pos).addScaledVector(tH, -15).add(up.set(0, 5, 0));
    travelLook.copy(pos).addScaledVector(tH, 12).add(up.set(0, 1, 0));
    frameStop(stops[stopIdx], wide);
    const w = atStop >= 0 ? 1 : 1 - smooth(0, 0.1, Math.min(f, 1 - f));
    camPos.lerpVectors(travelCam, stopCam, w);
    look.lerpVectors(travelLook, stopLook, w);
    rig.avoid(pos, camPos);

    if (!snapped) {
      camera.position.copy(camPos);
      lookSmooth.copy(look);
      snapped = true;
    } else {
      camera.position.lerp(camPos, 1 - Math.exp(-6 * dt));
      lookSmooth.lerp(look, 1 - Math.exp(-8 * dt));
    }
    camera.lookAt(lookSmooth);
    const fov = wide ? 55 : 68;
    camera.fov += (fov - camera.fov) * (1 - Math.exp(-3 * dt));
    camera.updateProjectionMatrix();
  }

  return {
    stops,
    update,
    reset() { snapped = false; },
    heroPos: () => pos,
    heading: () => tH,
  };
}
