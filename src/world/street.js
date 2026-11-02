import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { N, PITCH, BLOCK, HALF, rnd, blockCenter } from '../config.js';
import { isPark, SIDEWALK_H } from './city.js';

// Cars and people move entirely in their vertex shaders from a shared clock, so the CPU does no
// per-frame work for them. Instances further than a few hundred metres collapse to a point:
// they'd be under a pixel anyway, and tiny triangles are the most expensive kind to rasterise.
const CAR_FAR = 650;
const LIGHT_FAR = 1100; // head and tail lights read as streams of light from much further away
const BEAM_FAR = 320;
const PEOPLE_FAR = 230;

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
  const wheel = (x, z) => paint(new THREE.CylinderGeometry(0.36, 0.36, 0.28, 8).rotateZ(Math.PI / 2).translate(x, 0.36, z), [0.05, 0.05, 0.06]);
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
// aShirtMask marks the vertices that take the per-person shirt colour.
function personGeometry() {
  return mergeGeometries([
    paint(new THREE.BoxGeometry(0.44, 0.62, 0.24).translate(0, 1.18, 0), [1, 1, 1], { aLimb: 0, aShirtMask: 1 }),
    paint(new THREE.SphereGeometry(0.125, 6, 4).translate(0, 1.64, 0), [0.62, 0.45, 0.35], { aLimb: 0, aShirtMask: 0 }),
    paint(new THREE.BoxGeometry(0.17, 0.86, 0.2).translate(0.11, 0.43, 0), [0.12, 0.13, 0.18], { aLimb: 1, aShirtMask: 0 }),
    paint(new THREE.BoxGeometry(0.17, 0.86, 0.2).translate(-0.11, 0.43, 0), [0.12, 0.13, 0.18], { aLimb: -1, aShirtMask: 0 }),
    paint(new THREE.BoxGeometry(0.11, 0.6, 0.13).translate(0.29, 1.12, 0), [1, 1, 1], { aLimb: -2, aShirtMask: 1 }),
    paint(new THREE.BoxGeometry(0.11, 0.6, 0.13).translate(-0.29, 1.12, 0), [1, 1, 1], { aLimb: 2, aShirtMask: 1 }),
  ]);
}

// aCar: axis (0 drives along x), lane coordinate, start position, signed speed.
const CAR_GLSL = /* glsl */ `
  uniform float uTime;
  attribute vec4 aCar;
  vec3 carPos() {
    float t = mod(aCar.z + aCar.w * uTime + ${HALF.toFixed(1)}, ${(HALF * 2).toFixed(1)}) - ${HALF.toFixed(1)};
    return aCar.x < 0.5 ? vec3(t, 0.0, aCar.y) : vec3(aCar.y, 0.0, t);
  }
  // Turn a model-space vector so the car's +Z points down its lane.
  vec3 carTurn(vec3 v) {
    vec2 f = aCar.x < 0.5 ? vec2(sign(aCar.w), 0.0) : vec2(0.0, sign(aCar.w));
    return vec3(v.x * f.y + v.z * f.x, v.y, v.z * f.y - v.x * f.x);
  }`;

function trafficMaterial(mat, time, far) {
  mat.customProgramCacheKey = () => `traffic-${far}`;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        ${CAR_GLSL}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        objectNormal = carTurn(objectNormal);`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec3 cp = carPos();
          transformed = distance(cp, cameraPosition) > ${far.toFixed(1)} ? cp : carTurn(transformed) + cp;
        }`);
  };
  return mat;
}

// aWalk: block centre x, z, half-width of the path round the block, start fraction.
// aMove: signed walking speed, scale, step phase, stride (0 for people standing still).
// Legs swing from the hip and arms from the shoulder.
function personMaterial(time) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.customProgramCacheKey = () => 'crowd';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        attribute float aLimb;
        attribute float aShirtMask;
        attribute vec3 aShirt;
        attribute vec4 aWalk;
        attribute vec4 aMove;
        // Where on the lap round the block this person is, and which way they face.
        vec3 walker(out float yaw) {
          float a = aWalk.z, side = a * 2.0;
          float u = fract(aWalk.w + aMove.x * uTime / (side * 4.0)) * 4.0;
          float seg = floor(u), f = (u - seg) * side - a;
          vec2 xz;
          if (seg < 0.5) { xz = vec2(f, -a); yaw = PI * 0.5; }
          else if (seg < 1.5) { xz = vec2(a, f); yaw = 0.0; }
          else if (seg < 2.5) { xz = vec2(-f, a); yaw = -PI * 0.5; }
          else { xz = vec2(-a, -f); yaw = PI; }
          if (aMove.x < 0.0) yaw += PI;
          return vec3(aWalk.x + xz.x, ${SIDEWALK_H.toFixed(2)}, aWalk.y + xz.y);
        }
        vec3 turnY(vec3 v, float yaw) {
          float c = cos(yaw), s = sin(yaw);
          return vec3(c * v.x + s * v.z, v.y, c * v.z - s * v.x);
        }`)
      .replace('#include <color_vertex>', `#include <color_vertex>
        vColor = mix(color.rgb, aShirt, aShirtMask);`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        {
          float yaw;
          walker(yaw);
          objectNormal = turnY(objectNormal, yaw);
        }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float yaw;
          vec3 wp = walker(yaw);
          if (aLimb != 0.0) {
            float pivot = abs(aLimb) > 1.5 ? 1.42 : 0.86;
            float sw = sin(uTime * 7.5 + aMove.z) * 0.45 * aMove.w * sign(aLimb);
            float dy = transformed.y - pivot;
            transformed.y = pivot + dy * cos(sw);
            transformed.z += dy * sin(sw);
          }
          transformed = distance(wp, cameraPosition) > ${PEOPLE_FAR.toFixed(1)} ? wp : turnY(transformed * aMove.y, yaw) + wp;
        }`);
  };
  return mat;
}

const PAINT = [0xf2c14e, 0xf2c14e, 0xe8e8ea, 0xb8bcc4, 0x1c1d22, 0x23356e, 0x8c1c22, 0x4a4f58, 0x2e5a46];
const SHIRTS = [0xd94b4b, 0x3b6fd9, 0xe8e2d0, 0x2c2c34, 0x3fa36b, 0xe0a03a, 0x8a5cc7, 0x6b7280, 0xc75a8a];

export function createStreets(scene, { cars: CARS = 1000, people: PEOPLE = 2600 } = {}) {
  const time = { value: 0 };
  const color = new THREE.Color();

  // ---- Traffic: right-hand lanes on every inner street.
  const carData = new Float32Array(CARS * 4);
  const carGeo = carGeometry();
  const headGeo = lampPair(2.21, 0.42, 0.2, 0.04);
  const tailGeo = lampPair(-2.21, 0.4, 0.16, 0.04);
  const beamGeo = new THREE.PlaneGeometry(3.2, 9).rotateX(-Math.PI / 2).translate(0, 0.06, 6.8);
  const carMesh = new THREE.InstancedMesh(carGeo, trafficMaterial(new THREE.MeshLambertMaterial({ vertexColors: true }), time, CAR_FAR), CARS);
  // Lamp colours above 1.0 are what the bloom picks up.
  const heads = new THREE.InstancedMesh(headGeo, trafficMaterial(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff2cf).multiplyScalar(2.2) }), time, LIGHT_FAR), CARS);
  const tails = new THREE.InstancedMesh(tailGeo, trafficMaterial(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2030).multiplyScalar(2.6) }), time, LIGHT_FAR), CARS);
  const beams = new THREE.InstancedMesh(
    beamGeo,
    trafficMaterial(new THREE.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }), time, BEAM_FAR),
    CARS,
  );
  for (let k = 0; k < CARS; k++) {
    const dir = rnd() < 0.5 ? 1 : -1;
    const axis = rnd() < 0.5 ? 0 : 1;
    let line;
    do line = -HALF + PITCH * (1 + Math.floor(rnd() * (N - 1))); while (rnd() > busy(line, 0));
    // Drive on the right: lane offset depends on direction of travel.
    const off = (axis === 0 ? 1 : -1) * dir * 4.2;
    carData.set([axis, line + off, -HALF + rnd() * HALF * 2, dir * (11 + rnd() * 9)], k * 4);
    carMesh.setColorAt(k, color.set(PAINT[Math.floor(rnd() * PAINT.length)]));
  }
  const carAttr = new THREE.InstancedBufferAttribute(carData, 4);
  for (const g of [carGeo, headGeo, tailGeo, beamGeo]) g.setAttribute('aCar', carAttr);
  for (const m of [carMesh, heads, tails, beams]) m.frustumCulled = false;
  scene.add(carMesh, heads, tails, beams);

  // ---- Pedestrians: walking laps of the sidewalk around their block.
  const geo = personGeometry();
  const walk = new Float32Array(PEOPLE * 4), move = new Float32Array(PEOPLE * 4), shirt = new Float32Array(PEOPLE * 3);
  let made = 0;
  while (made < PEOPLE) {
    const i = Math.floor(rnd() * N), j = Math.floor(rnd() * N);
    if (isPark(i, j) || rnd() > busy(blockCenter(i), blockCenter(j))) continue;
    const walking = rnd() > 0.12;
    walk.set([blockCenter(i), blockCenter(j), BLOCK / 2 + 1.2 + rnd() * 1.4, rnd()], made * 4);
    const v = walking ? (rnd() < 0.5 ? 1 : -1) * (1.1 + rnd() * 0.6) : 0;
    move.set([v, 0.92 + rnd() * 0.16, rnd() * Math.PI * 2, walking ? 1 : 0], made * 4);
    color.set(SHIRTS[Math.floor(rnd() * SHIRTS.length)]);
    shirt.set([color.r, color.g, color.b], made * 3);
    made++;
  }
  geo.setAttribute('aWalk', new THREE.InstancedBufferAttribute(walk, 4));
  geo.setAttribute('aMove', new THREE.InstancedBufferAttribute(move, 4));
  geo.setAttribute('aShirt', new THREE.InstancedBufferAttribute(shirt, 3));
  const crowd = new THREE.InstancedMesh(geo, personMaterial(time), PEOPLE);
  crowd.frustumCulled = false;
  scene.add(crowd);

  return {
    update(dt, t) {
      time.value = t;
    },
  };
}
