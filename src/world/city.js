import * as THREE from 'three';
import {
  N, PITCH, BLOCK, HALF, FOG_HEX, FOG_DENSITY, MOON_DIR,
  rnd, blockCenter, cellOf, hexVec, hexRgb,
} from '../config.js';
import { SECTIONS } from '../content.js';

export const PARK = { i0: 18, i1: 21, j0: 11, j1: 14 };
// Every landmark tower has a balcony ring at this height; the story perches the hero there.
export const BALCONY_Y = 100;
export const isPark = (i, j) => i >= PARK.i0 && i <= PARK.i1 && j >= PARK.j0 && j <= PARK.j1;

const TINTS = [
  [0.15, 0.17, 0.25], [0.2, 0.19, 0.25], [0.12, 0.14, 0.21],
  [0.23, 0.2, 0.21], [0.17, 0.21, 0.25], [0.1, 0.12, 0.17],
];

// Height falloff: a downtown core around the Origin tower plus two smaller clusters.
function skyline(x, z) {
  const g = (cx, cz, s) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (2 * s * s));
  return 18 + 170 * g(0, 0, 380) + 130 * g(600, 500, 260) + 100 * g(-560, -600, 240);
}

const buildingVert = /* glsl */ `
  attribute float aSeed;
  attribute vec3 aTint;
  attribute float aTop;
  varying vec3 vW;
  varying vec3 vN;
  varying float vSeed;
  varying vec3 vTint;
  varying float vTop;
  void main() {
    vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    vSeed = aSeed;
    vTint = aTint;
    vTop = aTop;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

// Windows are procedural, from world position, so buildings of any size get an even grid.
const buildingFrag = /* glsl */ `
  uniform vec3 uFog;
  uniform float uFogDensity;
  uniform vec3 uMoon;
  uniform float uTime;
  varying vec3 vW;
  varying vec3 vN;
  varying float vSeed;
  varying vec3 vTint;
  varying float vTop;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec3 n = normalize(vN);
    float d = distance(vW, cameraPosition);
    float moon = 0.6 + 0.4 * max(dot(n, uMoon), 0.0);
    vec3 col;
    if (vSeed < 0.0) {
      // Antenna with a blinking aircraft-warning light on top.
      col = vTint * moon * 0.6;
      float blink = step(0.5, fract(uTime * 0.8 + vTop * 0.13));
      col += vec3(1.0, 0.15, 0.15) * 2.0 * blink * smoothstep(vTop - 2.0, vTop - 0.5, vW.y);
    } else if (abs(n.y) > 0.5) {
      col = vTint * 0.55;
    } else {
      vec2 uv = abs(n.x) > 0.5 ? vec2(vW.z, vW.y) : vec2(vW.x, vW.y);
      vec2 c = uv / vec2(3.2, 4.2);
      vec2 id = floor(c);
      vec2 f = fract(c);
      float win = step(0.18, f.x) * step(f.x, 0.82) * step(0.22, f.y) * step(f.y, 0.78);
      float r = hash(id + vSeed * 17.0);
      float floorLit = step(0.94, hash(vec2(id.y, vSeed * 31.0)));
      float lit = clamp(step(0.68, r) + floorLit * step(0.25, r), 0.0, 1.0);
      vec3 wc = mix(vec3(1.0, 0.76, 0.45), vec3(0.62, 0.8, 1.0), step(0.82, fract(r * 9.7)));
      vec3 wall = vTint * moon * (0.75 + 0.25 * smoothstep(0.0, vTop, vW.y));
      vec3 near = mix(wall, wall * 0.55 + vec3(0.02, 0.025, 0.04), win) + win * lit * wc;
      // Far away the window grid aliases, so fade to its average glow.
      vec3 far = wall * 0.8 + vec3(1.0, 0.8, 0.55) * 0.13;
      col = mix(near, far, smoothstep(450.0, 1200.0, d));
      col += vec3(1.0, 0.45, 0.25) * 0.22 * (1.0 - smoothstep(0.0, 9.0, vW.y));
      col += vec3(0.95, 0.2, 0.25) * 0.35 * smoothstep(vTop - 1.0, vTop, vW.y);
    }
    float fog = 1.0 - exp(-uFogDensity * uFogDensity * d * d);
    gl_FragColor = vec4(mix(col, uFog, fog), 1.0);
  }`;

function groundTexture(renderer) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const s = 512 / PITCH; // px per metre
  const b0 = ((PITCH - BLOCK) / 2) * s;
  const bw = BLOCK * s;
  g.fillStyle = '#151722';
  g.fillRect(0, 0, 512, 512);
  g.fillStyle = '#2d3040';
  g.fillRect(b0 - 3 * s, b0 - 3 * s, bw + 6 * s, bw + 6 * s);
  g.fillStyle = '#1d1f2a';
  g.fillRect(b0, b0, bw, bw);
  // Road centre lines sit on the tile edges, so each tile draws half of one.
  g.fillStyle = '#9a7f36';
  for (let p = 0; p < 512; p += 28) {
    g.fillRect(p, 0, 14, 3);
    g.fillRect(p, 509, 14, 3);
    g.fillRect(0, p, 3, 14);
    g.fillRect(509, p, 3, 14);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(N, N);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

function billboardTexture(sec, renderer) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#06070d';
  g.fillRect(0, 0, 1024, 512);
  // Halftone dots growing toward the corners.
  g.fillStyle = sec.color;
  for (let y = 11; y < 512; y += 22) {
    for (let x = 11; x < 1024; x += 22) {
      const d = Math.hypot((x - 512) / 512, (y - 256) / 256);
      const r = Math.max(0, (d - 0.55) * 9);
      if (r > 0.3) {
        g.beginPath();
        g.arc(x, y, Math.min(r, 9), 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  g.fillRect(0, 0, 1024, 22);
  g.fillRect(0, 490, 1024, 22);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '250px Bangers, Impact, sans-serif';
  g.lineJoin = 'round';
  g.lineWidth = 22;
  g.strokeStyle = '#06070d';
  g.strokeText(sec.name.toUpperCase(), 512, 230);
  g.fillStyle = '#f3ead2';
  g.fillText(sec.name.toUpperCase(), 512, 230);
  g.font = '700 52px "Space Mono", monospace';
  g.fillStyle = sec.color;
  g.fillText(sec.label.toUpperCase(), 512, 410);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

export function createCity(scene, renderer) {
  const boxes = [];
  const grid = Array.from({ length: N * N }, () => []);
  // Per-block tallest height for the minimap: -1 park, -2 landmark.
  const blockInfo = new Float32Array(N * N);
  const landmarks = [];

  // Non-colliding boxes are antennas: seed -1 tells the shader to skip windows.
  function addBox(x, z, w, d, y0, h, tint, collide = true) {
    boxes.push({ x, z, w, d, y: y0 + h / 2, h, tint, seed: collide ? rnd() : -1, top: y0 + h });
    if (!collide) return;
    const b = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, y0, y1: y0 + h };
    const i0 = Math.max(0, cellOf(b.minX)), i1 = Math.min(N - 1, cellOf(b.maxX));
    const j0 = Math.max(0, cellOf(b.minZ)), j1 = Math.min(N - 1, cellOf(b.maxZ));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) grid[i + j * N].push(b);
  }

  const sectionAt = new Map(SECTIONS.map((s) => [s.block.join(','), s]));

  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const cx = blockCenter(i), cz = blockCenter(j);
      const sec = sectionAt.get(`${i},${j}`);
      if (sec) {
        buildLandmark(sec, cx, cz);
        blockInfo[i + j * N] = -2;
        continue;
      }
      if (isPark(i, j)) {
        blockInfo[i + j * N] = -1;
        continue;
      }
      const base = skyline(cx, cz);
      const r = rnd();
      const full = BLOCK - 6, half = (BLOCK - 8) / 2;
      let lots;
      if (r < 0.22) lots = [[cx, cz, full, full]];
      else if (r < 0.6) {
        lots = rnd() < 0.5
          ? [[cx - half / 2 - 1, cz, half, full], [cx + half / 2 + 1, cz, half, full]]
          : [[cx, cz - half / 2 - 1, full, half], [cx, cz + half / 2 + 1, full, half]];
      } else {
        lots = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => [cx + a * (half / 2 + 1), cz + b * (half / 2 + 1), half, half]);
      }
      let tallest = 0;
      for (const [lx, lz, lw, ld] of lots) {
        const w = lw * (0.82 + rnd() * 0.18), d = ld * (0.82 + rnd() * 0.18);
        let h = base * (0.45 + rnd() * 0.95) + 8 + rnd() * 14;
        if (rnd() < 0.035) h *= 1.7;
        const tint = TINTS[Math.floor(rnd() * TINTS.length)];
        let top = h;
        if (h > 85 && rnd() < 0.55) {
          // Setback tower: a wide base with a narrower shaft on top.
          const h1 = h * (0.45 + rnd() * 0.2);
          addBox(lx, lz, w, d, 0, h1, tint);
          addBox(lx, lz, w * 0.66, d * 0.66, h1, h - h1, tint);
          if (h > 160 && rnd() < 0.6) {
            addBox(lx, lz, w * 0.38, d * 0.38, h, h * 0.12, tint);
            top = h * 1.12;
          }
        } else {
          addBox(lx, lz, w, d, 0, h, tint);
        }
        if (h > 140 && rnd() < 0.45) addBox(lx, lz, 1.2, 1.2, top, 18 + rnd() * 30, [0.3, 0.3, 0.35], false);
        tallest = Math.max(tallest, top);
      }
      blockInfo[i + j * N] = tallest;
    }
  }

  function buildLandmark(sec, cx, cz) {
    const [r, g, b] = hexRgb(sec.color);
    const tint = [r * 0.22 + 0.05, g * 0.22 + 0.05, b * 0.22 + 0.06];
    const h = sec.height;
    addBox(cx, cz, 54, 54, 0, 30, [0.14, 0.15, 0.2]);
    addBox(cx, cz, 40, 40, 30, h - 30, tint);
    addBox(cx, cz, 16, 16, h, 12, tint);
    addBox(cx, cz, 50, 50, BALCONY_Y - 3, 3, [0.18, 0.19, 0.25]);

    const fx = new THREE.Group();
    const tex = billboardTexture(sec, renderer);
    const boardMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
    const boardGeo = new THREE.PlaneGeometry(46, 23);
    for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const m = new THREE.Mesh(boardGeo, boardMat);
      m.position.set(cx + nx * 20.8, h - 16, cz + nz * 20.8);
      m.rotation.y = Math.atan2(nx, nz);
      fx.add(m);
    }
    const color = new THREE.Color(sec.color);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(6, 6, 1800, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending,
        depthWrite: false, fog: false, side: THREE.DoubleSide,
      }),
    );
    beam.position.set(cx, h + 12 + 900, cz);
    fx.add(beam);
    const marker = new THREE.Mesh(new THREE.OctahedronGeometry(5), new THREE.MeshBasicMaterial({ color, fog: false }));
    marker.position.set(cx, h + 40, cz);
    fx.add(marker);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(19, 0.3, 6, 64), new THREE.MeshBasicMaterial({ color, transparent: true }));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(cx, h + 0.6, cz);
    fx.add(ring);
    scene.add(fx);
    landmarks.push({ id: sec.id, section: sec, x: cx, z: cz, top: h, marker, ring, beam, dist: Infinity, inside: false });
  }

  // Buildings: every box in one instanced draw call.
  const bGeo = new THREE.BoxGeometry(1, 1, 1);
  const count = boxes.length;
  const seeds = new Float32Array(count), tints = new Float32Array(count * 3), tops = new Float32Array(count);
  const bMat = new THREE.ShaderMaterial({
    vertexShader: buildingVert,
    fragmentShader: buildingFrag,
    uniforms: {
      uFog: { value: hexVec(FOG_HEX) },
      uFogDensity: { value: FOG_DENSITY },
      uMoon: { value: MOON_DIR },
      uTime: { value: 0 },
    },
  });
  const bMesh = new THREE.InstancedMesh(bGeo, bMat, count);
  const m4 = new THREE.Matrix4();
  boxes.forEach((b, k) => {
    m4.makeScale(b.w, b.h, b.d).setPosition(b.x, b.y, b.z);
    bMesh.setMatrixAt(k, m4);
    seeds[k] = b.seed;
    tints.set(b.tint, k * 3);
    tops[k] = b.top;
  });
  bGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  bGeo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tints, 3));
  bGeo.setAttribute('aTop', new THREE.InstancedBufferAttribute(tops, 1));
  bMesh.frustumCulled = false;
  scene.add(bMesh);

  // Streets, embankment and the bay.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF * 2, HALF * 2),
    new THREE.MeshBasicMaterial({ map: groundTexture(renderer) }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const edge = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 70, HALF * 2 + 70), new THREE.MeshBasicMaterial({ color: 0x1b1d28 }));
  edge.rotation.x = -Math.PI / 2;
  edge.position.y = -0.08;
  scene.add(edge);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(24000, 24000),
    new THREE.MeshStandardMaterial({ color: 0x0b1634, roughness: 0.3, metalness: 0.7 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -1.5;
  scene.add(water);

  // Park lawns and trees.
  const lawnMat = new THREE.MeshBasicMaterial({ color: 0x15291f });
  const lawnGeo = new THREE.PlaneGeometry(BLOCK, BLOCK);
  const treePos = [];
  for (let i = PARK.i0; i <= PARK.i1; i++) {
    for (let j = PARK.j0; j <= PARK.j1; j++) {
      const lawn = new THREE.Mesh(lawnGeo, lawnMat);
      lawn.rotation.x = -Math.PI / 2;
      lawn.position.set(blockCenter(i), 0.05, blockCenter(j));
      scene.add(lawn);
      for (let k = 0; k < 14; k++) treePos.push([blockCenter(i) + (rnd() - 0.5) * (BLOCK - 8), blockCenter(j) + (rnd() - 0.5) * (BLOCK - 8), 0.7 + rnd() * 0.6]);
    }
  }
  const trees = new THREE.InstancedMesh(new THREE.ConeGeometry(2.6, 8, 7), new THREE.MeshLambertMaterial({ color: 0x1f4630 }), treePos.length);
  treePos.forEach(([x, z, s], k) => {
    m4.makeScale(s, s, s).setPosition(x, 4 * s, z);
    trees.setMatrixAt(k, m4);
  });
  trees.frustumCulled = false;
  scene.add(trees);

  // Streetlights at every corner of every intersection.
  const lamps = [];
  for (let a = 0; a <= N; a++) {
    for (let b = 0; b <= N; b++) {
      const x = -HALF + a * PITCH, z = -HALF + b * PITCH;
      for (const [ox, oz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) lamps.push([x + ox * 9.5, z + oz * 9.5]);
    }
  }
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.6, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffcf8a }), lamps.length);
  const poles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 7.5, 0.3), new THREE.MeshBasicMaterial({ color: 0x23263a }), lamps.length);
  lamps.forEach(([x, z], k) => {
    m4.makeTranslation(x, 7.6, z);
    bulbs.setMatrixAt(k, m4);
    m4.makeTranslation(x, 3.75, z);
    poles.setMatrixAt(k, m4);
  });
  bulbs.frustumCulled = poles.frustumCulled = false;
  scene.add(bulbs, poles);

  // Traffic: glowing car bodies sliding along the streets.
  const CARS = 460;
  const cars = [];
  const carMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.9, 1.2, 4.2), new THREE.MeshBasicMaterial({ color: 0xffffff }), CARS);
  const head = new THREE.Color(0xfff1cc), tail = new THREE.Color(0xff3344);
  for (let k = 0; k < CARS; k++) {
    const dir = rnd() < 0.5 ? 1 : -1;
    cars.push({
      axis: rnd() < 0.5 ? 0 : 1,
      line: -HALF + PITCH * (1 + Math.floor(rnd() * (N - 1))),
      off: dir * 4.5,
      t: -HALF + rnd() * HALF * 2,
      v: dir * (14 + rnd() * 18),
    });
    carMesh.setColorAt(k, dir > 0 ? head : tail);
  }
  carMesh.frustumCulled = false;
  scene.add(carMesh);
  const dummy = new THREE.Object3D();

  function update(dt, time) {
    bMat.uniforms.uTime.value = time;
    for (let k = 0; k < CARS; k++) {
      const c = cars[k];
      c.t += c.v * dt;
      if (c.t > HALF) c.t -= HALF * 2;
      else if (c.t < -HALF) c.t += HALF * 2;
      if (c.axis === 0) {
        dummy.position.set(c.t, 0.7, c.line + c.off);
        dummy.rotation.y = Math.PI / 2;
      } else {
        dummy.position.set(c.line + c.off, 0.7, c.t);
        dummy.rotation.y = 0;
      }
      dummy.updateMatrix();
      carMesh.setMatrixAt(k, dummy.matrix);
    }
    carMesh.instanceMatrix.needsUpdate = true;
    for (const lm of landmarks) {
      lm.marker.rotation.y = time * 1.2;
      lm.marker.position.y = lm.top + 40 + Math.sin(time * 1.6) * 3;
      const phase = (time * 0.5) % 1;
      const p = 1 + phase * 0.6;
      lm.ring.scale.set(p, p, 1);
      lm.ring.material.opacity = 1 - phase;
    }
  }

  // Reused result array: callers must finish iterating before calling again.
  const near = [];
  function nearBoxes(x, z) {
    near.length = 0;
    const ci = cellOf(x), cj = cellOf(z);
    for (let i = ci - 1; i <= ci + 1; i++) {
      if (i < 0 || i >= N) continue;
      for (let j = cj - 1; j <= cj + 1; j++) {
        if (j < 0 || j >= N) continue;
        const arr = grid[i + j * N];
        for (let k = 0; k < arr.length; k++) near.push(arr[k]);
      }
    }
    return near;
  }

  // A roof that's good to start from: within [lo, hi] metres, wide, nearest to block (i, j).
  function spawnRoof(i, j, lo = 50, hi = 110) {
    let best = null, bestD = Infinity;
    for (let a = i - 3; a <= i + 3; a++) {
      for (let b = j - 3; b <= j + 3; b++) {
        if (a < 0 || b < 0 || a >= N || b >= N) continue;
        for (const box of grid[a + b * N]) {
          const top = Math.max(...grid[a + b * N].filter((o) => o.minX < box.maxX && o.maxX > box.minX && o.minZ < box.maxZ && o.maxZ > box.minZ).map((o) => o.y1));
          if (box.y1 < lo || box.y1 > hi || top > box.y1 || box.maxX - box.minX < 16) continue;
          const d = (a - i) ** 2 + (b - j) ** 2;
          if (d < bestD) { bestD = d; best = box; }
        }
      }
    }
    return best;
  }

  return { landmarks, blockInfo, nearBoxes, spawnRoof, update, material: bMat, buildingCount: count };
}
