import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Built by tools/blender/make_hero.py. Clips: idle, run, swing, air, climb, perch.
const MODEL_URL = `${import.meta.env.BASE_URL}models/hero.glb`;
const MODEL_HEIGHT = 1.86; // metres, as modelled in Blender
const WORLD_HEIGHT = 2.6; // how tall the hero stands in the city

// The hero: a box-figure placeholder that is swapped for the Blender model once it loads.
// Both answer to the same root/animate()/orient() calls, so the controllers don't care which is showing.
export function createHero() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = -1.45; // root sits at the torso, so swinging rotates around the body
  root.add(body);

  const red = new THREE.MeshStandardMaterial({ color: 0xc81e28, roughness: 0.45 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x1f3ea6, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0d0f16, roughness: 0.6 });
  const lens = new THREE.MeshBasicMaterial({ color: 0xf4f6ff });

  const add = (geo, mat, x, y, z, parent = body) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };

  add(new THREE.BoxGeometry(1.0, 1.25, 0.55), red, 0, 1.85, 0);
  add(new THREE.BoxGeometry(0.14, 1.1, 0.5), blue, -0.52, 1.85, 0);
  add(new THREE.BoxGeometry(0.14, 1.1, 0.5), blue, 0.52, 1.85, 0);
  add(new THREE.BoxGeometry(0.92, 0.42, 0.5), blue, 0, 1.08, 0);
  const emblem = add(new THREE.BoxGeometry(0.26, 0.26, 0.04), dark, 0, 1.98, 0.29);
  emblem.rotation.z = Math.PI / 4;
  const head = add(new THREE.SphereGeometry(0.42, 18, 14), red, 0, 2.86, 0);
  head.scale.y = 1.1;
  for (const s of [-1, 1]) {
    const eye = add(new THREE.SphereGeometry(0.5, 12, 8), lens, s * 0.17, 2.92, 0.36);
    eye.scale.set(0.17, 0.12, 0.05);
    eye.rotation.z = s * 0.35;
  }

  const limb = (x, y, len, thick, mat, footMat) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    body.add(pivot);
    add(new THREE.BoxGeometry(thick, len, thick), mat, 0, -len / 2, 0, pivot);
    if (footMat) add(new THREE.BoxGeometry(thick + 0.04, 0.32, thick + 0.18), footMat, 0, -len + 0.1, 0.08, pivot);
    return pivot;
  };
  const armL = limb(-0.66, 2.38, 1.0, 0.27, red);
  const armR = limb(0.66, 2.38, 1.0, 0.27, red);
  const legL = limb(-0.26, 0.92, 0.95, 0.34, blue, red);
  const legR = limb(0.26, 0.92, 0.95, 0.34, blue, red);

  root.scale.setScalar(0.8);

  let phase = 0;
  const lerp = (o, key, target, k) => { o.rotation[key] += (target - o.rotation[key]) * k; };

  // Blender model, loaded in the background.
  let mixer = null, current = null, markReady;
  const actions = {};
  const ready = new Promise((r) => { markReady = r; }); // settles whether or not the model loads
  new GLTFLoader().load(MODEL_URL, (gltf) => {
    const model = gltf.scene;
    model.scale.setScalar(WORLD_HEIGHT / MODEL_HEIGHT / root.scale.x);
    model.position.y = body.position.y; // feet on the same line as the placeholder's
    model.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    root.add(model);
    body.visible = false;
    mixer = new THREE.AnimationMixer(model);
    for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip);
    play('idle', 0);
    markReady();
  }, undefined, (err) => {
    console.warn('Hero model did not load; keeping the placeholder.', err);
    markReady();
  });

  function play(name, fade = 0.25) {
    const next = actions[name];
    if (!next || next === current) return;
    next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    current?.fadeOut(fade);
    current = next;
  }

  // state.mode: 'ground' | 'swing' | 'air' | 'climb' | 'perch'
  function animate(dt, state) {
    if (mixer) {
      const name = state.mode === 'ground' ? (state.speed > 1.5 ? 'run' : 'idle') : state.mode;
      play(name);
      current.timeScale = name === 'run' ? THREE.MathUtils.clamp(state.speed / 11, 0.8, 2.2) : 1;
      mixer.update(dt);
      return;
    }
    const k = 1 - Math.exp(-12 * dt);
    let t;
    if (state.mode === 'ground' || state.mode === 'perch') {
      phase += dt * state.speed * 0.45;
      const amp = Math.min(state.speed / 12, 1) * 0.95;
      const s = Math.sin(phase) * amp;
      t = [-s * 0.8, s * 0.8, -0.08, 0.08, s, -s];
    } else if (state.mode === 'swing') {
      phase += dt * 3;
      t = [-2.6, -3.0, -0.25, 0.1, 0.55 + Math.sin(phase) * 0.15, -0.25 + Math.sin(phase) * 0.15];
    } else if (state.mode === 'climb') {
      phase += dt * 9;
      const s = Math.sin(phase);
      t = [-2.4 + s * 0.6, -2.4 - s * 0.6, -0.3, 0.3, -0.6 - s * 0.5, -0.6 + s * 0.5];
    } else {
      t = [-0.4, -0.4, -1.25, 1.25, 0.35, -0.5];
    }
    lerp(armL, 'x', t[0], k);
    lerp(armR, 'x', t[1], k);
    lerp(armL, 'z', t[2], k);
    lerp(armR, 'z', t[3], k);
    lerp(legL, 'x', t[4], k);
    lerp(legR, 'x', t[5], k);
  }

  // Turn the hero so its up axis follows `up` and it faces `fwd` (projected off `up`).
  const bx = new THREE.Vector3(), by = new THREE.Vector3(), bz = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  function orient(up, fwd, dt, rate = 12) {
    by.copy(up).normalize();
    bz.copy(fwd).addScaledVector(by, -fwd.dot(by));
    if (bz.lengthSq() < 1e-6) return;
    bz.normalize();
    bx.crossVectors(by, bz).normalize();
    bz.crossVectors(bx, by);
    basis.makeBasis(bx, by, bz);
    q.setFromRotationMatrix(basis);
    root.quaternion.slerp(q, 1 - Math.exp(-rate * dt));
  }

  return { root, animate, orient, ready };
}
