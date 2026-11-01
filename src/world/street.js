import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { N, PITCH, BLOCK, HALF, rnd, blockCenter } from '../config.js';
import { isPark, SIDEWALK_H } from './city.js';

const CARS = 1000;
const PEOPLE = 2600;

// Busier downtown: chance of keeping a random spot, by distance from the city centre.
const busy = (x, z) => 0.2 + 0.8 * Math.exp(-(x * x + z * z) / (2 * 650 * 650));

// Bake a flat colour into a geometry and drop uv/index so parts can be merged.
function paint(geo, rgb, extra = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set(rgb, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  for (const [name, value] of Object.entries(extra)) g.setAttribute(name, new THREE.BufferAttribute(new Float32Array(n).fill(value), 1));
  return g;
}

// Car pointing down +Z. White body parts take the per-car paint colour; glass and tyres stay dark.
function carGeometry() {
  const wheel = (x, z) => paint(new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10).rotateZ(Math.PI / 2).translate(x, 0.36, z), [0.05, 0.05, 0.06]);
  return mergeGeometries([
    paint(new THREE.BoxGeometry(1.9, 0.62, 4.4).translate(0, 0.62, 0), [1, 1, 1]),
    paint(new THREE.BoxGeometry(1.72, 0.58, 2.3).translate(0, 1.2, -0.25), [1, 1, 1]),
    paint(new THREE.BoxGeometry(1.74, 0.42, 2.1).translate(0, 1.22, -0.25), [0.08, 0.1, 0.14]),
    wheel(0.92, 1.4), wheel(-0.92, 1.4), wheel(0.92, -1.4), wheel(-0.92, -1.4),
  ]);
}

function lampPair(z, w, h, d) {
  return mergeGeometries([
    new THREE.BoxGeometry(w, h, d).translate(0.68, 0.72, z),
    new THREE.BoxGeometry(w, h, d).translate(-0.68, 0.72, z),
  ]);
}

// Pedestrian about 1.75 m tall. aLimb: legs ±1, arms ±2 (arms swing against the same-side leg).
// aShirt marks the vertices that take the per-person shirt colour.
function personGeometry() {
  return mergeGeometries([
    paint(new THREE.BoxGeometry(0.44, 0.62, 0.24).translate(0, 1.18, 0), [1, 1, 1], { aLimb: 0, aShirtMask: 1 }),
    paint(new THREE.SphereGeometry(0.125, 8, 6).translate(0, 1.64, 0), [0.62, 0.45, 0.35], { aLimb: 0, aShirtMask: 0 }),
    paint(new THREE.BoxGeometry(0.17, 0.86, 0.2).translate(0.11, 0.43, 0), [0.12, 0.13, 0.18], { aLimb: 1, aShirtMask: 0 }),
    paint(new THREE.BoxGeometry(0.17, 0.86, 0.2).translate(-0.11, 0.43, 0), [0.12, 0.13, 0.18], { aLimb: -1, aShirtMask: 0 }),
    paint(new THREE.BoxGeometry(0.11, 0.6, 0.13).translate(0.29, 1.12, 0), [1, 1, 1], { aLimb: -2, aShirtMask: 1 }),
    paint(new THREE.BoxGeometry(0.11, 0.6, 0.13).translate(-0.29, 1.12, 0), [1, 1, 1], { aLimb: 2, aShirtMask: 1 }),
  ]);
}

// Walk cycle in the vertex shader: legs swing from the hip, arms from the shoulder.
function personMaterial(time) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        attribute float aLimb;
        attribute float aShirtMask;
        attribute float aPhase;
        attribute float aStride;
        attribute vec3 aShirt;`)
      .replace('#include <color_vertex>', `#include <color_vertex>
        vColor = mix(color.rgb, aShirt, aShirtMask);`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        if (aLimb != 0.0) {
          float pivot = abs(aLimb) > 1.5 ? 1.42 : 0.86;
          float a = sin(uTime * 7.5 + aPhase) * 0.45 * aStride * sign(aLimb);
          float dy = transformed.y - pivot;
          transformed.y = pivot + dy * cos(a);
          transformed.z += dy * sin(a);
        }`);
  };
  return mat;
}

const PAINT = [0xf2c14e, 0xf2c14e, 0xe8e8ea, 0xb8bcc4, 0x1c1d22, 0x23356e, 0x8c1c22, 0x4a4f58, 0x2e5a46];
const SHIRTS = [0xd94b4b, 0x3b6fd9, 0xe8e2d0, 0x2c2c34, 0x3fa36b, 0xe0a03a, 0x8a5cc7, 0x6b7280, 0xc75a8a];

export function createStreets(scene) {
  const time = { value: 0 };
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  // ---- Traffic: right-hand lanes on every inner street.
  const cars = [];
  const carMesh = new THREE.InstancedMesh(carGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }), CARS);
  const heads = new THREE.InstancedMesh(lampPair(2.21, 0.42, 0.2, 0.04), new THREE.MeshBasicMaterial({ color: 0xfff2cf }), CARS);
  const tails = new THREE.InstancedMesh(lampPair(-2.21, 0.4, 0.16, 0.04), new THREE.MeshBasicMaterial({ color: 0xff2030 }), CARS);
  const beams = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(3.2, 9).rotateX(-Math.PI / 2).translate(0, 0.06, 6.8),
    new THREE.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }),
    CARS,
  );
  for (let k = 0; k < CARS; k++) {
    const dir = rnd() < 0.5 ? 1 : -1;
    const axis = rnd() < 0.5 ? 0 : 1;
    let line;
    do line = -HALF + PITCH * (1 + Math.floor(rnd() * (N - 1))); while (rnd() > busy(line, 0));
    cars.push({
      axis,
      line,
      // Drive on the right: lane offset depends on direction of travel.
      off: (axis === 0 ? 1 : -1) * dir * 4.2,
      t: -HALF + rnd() * HALF * 2,
      v: dir * (11 + rnd() * 9),
    });
    carMesh.setColorAt(k, color.set(PAINT[Math.floor(rnd() * PAINT.length)]));
  }
  for (const m of [carMesh, heads, tails, beams]) m.frustumCulled = false;
  scene.add(carMesh, heads, tails, beams);

  // ---- Pedestrians: walking laps of the sidewalk around their block.
  const geo = personGeometry();
  const people = [];
  const phase = new Float32Array(PEOPLE), stride = new Float32Array(PEOPLE), shirt = new Float32Array(PEOPLE * 3);
  let made = 0;
  while (made < PEOPLE) {
    const i = Math.floor(rnd() * N), j = Math.floor(rnd() * N);
    if (isPark(i, j) || rnd() > busy(blockCenter(i), blockCenter(j))) continue;
    const walking = rnd() > 0.12;
    people.push({
      cx: blockCenter(i), cz: blockCenter(j),
      a: BLOCK / 2 + 1.2 + rnd() * 1.4, // distance from block centre to their path
      s: rnd(),
      v: walking ? (rnd() < 0.5 ? 1 : -1) * (1.1 + rnd() * 0.6) : 0,
      scale: 0.92 + rnd() * 0.16,
    });
    phase[made] = rnd() * Math.PI * 2;
    stride[made] = walking ? 1 : 0;
    color.set(SHIRTS[Math.floor(rnd() * SHIRTS.length)]);
    shirt.set([color.r, color.g, color.b], made * 3);
    made++;
  }
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
  geo.setAttribute('aStride', new THREE.InstancedBufferAttribute(stride, 1));
  geo.setAttribute('aShirt', new THREE.InstancedBufferAttribute(shirt, 3));
  const crowd = new THREE.InstancedMesh(geo, personMaterial(time), PEOPLE);
  crowd.frustumCulled = false;
  scene.add(crowd);

  function update(dt, t) {
    time.value = t;
    for (let k = 0; k < CARS; k++) {
      const c = cars[k];
      c.t += c.v * dt;
      if (c.t > HALF) c.t -= HALF * 2;
      else if (c.t < -HALF) c.t += HALF * 2;
      if (c.axis === 0) {
        dummy.position.set(c.t, 0, c.line + c.off);
        dummy.rotation.y = c.v > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        dummy.position.set(c.line + c.off, 0, c.t);
        dummy.rotation.y = c.v > 0 ? 0 : Math.PI;
      }
      dummy.updateMatrix();
      carMesh.setMatrixAt(k, dummy.matrix);
      heads.setMatrixAt(k, dummy.matrix);
      tails.setMatrixAt(k, dummy.matrix);
      beams.setMatrixAt(k, dummy.matrix);
    }
    for (const m of [carMesh, heads, tails, beams]) m.instanceMatrix.needsUpdate = true;

    for (let k = 0; k < people.length; k++) {
      const p = people[k];
      const side = p.a * 2;
      p.s = (p.s + (p.v * dt) / (side * 4) + 1) % 1;
      // Position on the square path, one side at a time.
      const u = p.s * 4, seg = Math.floor(u), f = (u - seg) * side - p.a;
      let x, z, yaw;
      if (seg === 0) { x = f; z = -p.a; yaw = Math.PI / 2; }
      else if (seg === 1) { x = p.a; z = f; yaw = 0; }
      else if (seg === 2) { x = -f; z = p.a; yaw = -Math.PI / 2; }
      else { x = -p.a; z = -f; yaw = Math.PI; }
      if (p.v < 0) yaw += Math.PI;
      dummy.position.set(p.cx + x, SIDEWALK_H, p.cz + z);
      dummy.rotation.y = yaw;
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      crowd.setMatrixAt(k, dummy.matrix);
    }
    dummy.scale.setScalar(1);
    crowd.instanceMatrix.needsUpdate = true;
  }

  return { update };
}
