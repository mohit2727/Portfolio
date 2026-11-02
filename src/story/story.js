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
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * The scripted story route. Stop 0 is the intro rooftop, stops 1..n are the balconies of the
 * section towers. Each leg between stops runs along the streets (out of the block, down one street,
 * round the corner, down the next) as a chain of web swings anchored to real buildings.
 * `update(dt, t)` takes a progress value t in [0, n] from the page scroll.
 */
export function createStory({ city, hero, web, camera, rig, sections, spawn, onWeb, onLand, reduced = false }) {
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
  let shown = 0, snapped = false, lastAnchor = null, speed = 0, roll = 0;
  const lastPos = new THREE.Vector3();
  const info = { travelling: false, to: null, remaining: 0 };

  function frameStop(stop, wide) {
    const o = stop.out;
    side.set(-o.z, 0, o.x);
    if (stop.intro) {
      // Behind the hero on the roof edge, looking out toward the Origin tower.
      // Low camera tilted up, so both the hero and the tower top fit in frame.
      stopCam.copy(stop.pos).addScaledVector(o, -11).addScaledVector(side, wide ? -3.5 : 0).add(up.set(0, 2.5, 0));
      stopLook.copy(stop.pos).addScaledVector(o, 60).addScaledVector(side, wide ? -10 : 0).add(up.set(0, 15, 0));
    } else {
      // In front of the crouching hero, tower wall and windows behind.
      stopCam.copy(stop.pos).addScaledVector(o, 9.5).addScaledVector(side, 3.5).add(up.set(0, 1.6, 0));
      stopLook.copy(stop.pos).add(up.set(0, 0.6, 0));
    }
    right.subVectors(stopLook, stopCam).cross(UP).normalize();
    if (wide && !stop.intro) stopLook.addScaledVector(right, 2.6);
    if (!wide && !stop.intro) stopLook.y -= 2.6; // phones: card covers the bottom, keep the hero high
  }

  // Opening shot: high above and behind the intro rooftop, looking toward the Origin tower.
  const introCam = new THREE.Vector3(), introLook = new THREE.Vector3();
  {
    const s0 = stops[0];
    introCam.copy(s0.pos).addScaledVector(s0.out, -480).add(up.set(0, 340, 0));
    introLook.copy(s0.pos).addScaledVector(s0.out, 420).add(up.set(0, 60, 0));
  }
  // Closing shot: a slow orbit high over all the towers.
  const center = new THREE.Vector3();
  for (const st of stops) if (st.tower) center.add(new THREE.Vector3(st.tower.x, 0, st.tower.z));
  center.multiplyScalar(1 / sections.length);
  const aerialCam = new THREE.Vector3(), aerialLook = new THREE.Vector3();
  function aerial(time) {
    const a = 0.6 + time * 0.03;
    aerialCam.set(center.x + Math.cos(a) * 760, 520, center.z + Math.sin(a) * 760);
    aerialLook.set(center.x, 90, center.z);
  }

  const INTRO_SECONDS = 3.6;
  let intro = 1, prevStop = 0, shake = 0;
  const camSmooth = new THREE.Vector3();

  function update(dt, target, wide, time = 0) {
    shown += (target - shown) * (snapped ? 1 - Math.exp(-5 * dt) : 1);
    const last = stops.length - 1;
    const fin = clamp(shown - last, 0, 1); // 0..1 through the closing crane-up
    const t = clamp(shown, 0, last);
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
      hero.animate(dt, { mode: 'perch', speed: 0 });
      web.hide();
    } else {
      anchor = sampleLeg(legs[k], f);
      if (anchor) up.subVectors(anchor, pos).normalize();
      else up.set(tan.x * 0.6, 1, tan.z * 0.6).normalize();
      hero.orient(up, tan, dt, 10);
      hero.animate(dt, { mode: anchor ? 'swing' : 'air', speed: 30 });
    }
    // A fresh anchor means a new web shot.
    if (anchor && anchor !== lastAnchor && snapped) onWeb?.();
    lastAnchor = anchor;
    // Touching down on a balcony after a swing: a little impact.
    if (atStop !== prevStop) {
      if (snapped && prevStop < 0 && atStop > 0) {
        shake = 1;
        onLand?.(stops[atStop]);
      }
      prevStop = atStop;
    }
    if (snapped && dt > 0) speed += (pos.distanceTo(lastPos) / dt - speed) * (1 - Math.exp(-6 * dt));
    lastPos.copy(pos);
    info.travelling = atStop < 0 && f > 0.06 && f < 0.94;
    if (atStop < 0) {
      info.to = stops[k + 1].tower?.section;
      info.remaining = (1 - easeInOut(f)) * legs[k].total;
    }
    // Light up the beacon of the tower we're on or heading to; all of them for the finale.
    const focus = fin > 0 ? null : atStop >= 0 ? stops[Math.max(atStop, 1)] : stops[k + 1];
    city.setFocus(focus?.tower?.id ?? null);

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
    if (fin > 0) {
      aerial(time);
      const e = easeInOut(fin);
      camPos.lerp(aerialCam, e);
      look.lerp(aerialLook, e);
    }

    let fov = wide ? 55 : 68;
    const flying = intro < 1;
    if (flying) {
      // Opening fly-in. Scrolling during it hurries it along.
      intro = Math.min(1, intro + dt / (target > 0.02 ? 0.9 : INTRO_SECONDS));
      const ey = easeInOutCubic(intro), ex = easeInOutCubic(Math.min(1, intro * 1.15));
      camPos.set(
        introCam.x + (camPos.x - introCam.x) * ex,
        introCam.y + (camPos.y - introCam.y) * ey,
        introCam.z + (camPos.z - introCam.z) * ex,
      );
      look.lerpVectors(introLook, look, ey);
      fov += (1 - ey) * 12;
    }
    rig.avoid(pos, camPos);

    if (!snapped || flying) {
      camSmooth.copy(camPos);
      lookSmooth.copy(look);
      snapped = true;
    } else {
      camSmooth.lerp(camPos, 1 - Math.exp(-6 * dt));
      lookSmooth.lerp(look, 1 - Math.exp(-8 * dt));
    }
    camera.position.copy(camSmooth);
    if (shake > 0.002 && !reduced) {
      const a = shake * shake * 0.22;
      camera.position.x += Math.sin(time * 61) * a;
      camera.position.y += Math.sin(time * 47 + 1.3) * a;
      camera.position.z += Math.sin(time * 53 + 2.1) * a;
    }
    shake *= Math.exp(-4.5 * dt);
    camera.lookAt(lookSmooth);
    // Bank a little toward the side the web is on.
    let rollT = 0;
    if (anchor) rollT = clamp((anchor.x - pos.x) * tH.z - (anchor.z - pos.z) * tH.x, -1, 1) * -0.07 * (1 - w);
    roll += (rollT - roll) * (1 - Math.exp(-3 * dt));
    camera.rotateZ(roll);
    if (flying) camera.fov = fov;
    else camera.fov += (fov - camera.fov) * (1 - Math.exp(-3 * dt));
    camera.updateProjectionMatrix();
  }

  return {
    stops,
    update,
    reset() { snapped = false; intro = 1; },
    // Start the opening fly-in (skipped for reduced motion).
    playIntro() { intro = reduced ? 1 : 0; },
    heroPos: () => pos,
    heading: () => tH,
    speed: () => speed,
    info,
  };
}
