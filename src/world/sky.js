import * as THREE from 'three';
import { FOG_HEX, MOON_DIR, hexVec } from '../config.js';

function moonTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const glow = g.createRadialGradient(128, 128, 30, 128, 128, 128);
  glow.addColorStop(0, 'rgba(255,236,220,0.55)');
  glow.addColorStop(1, 'rgba(255,236,220,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#fff3e4';
  g.beginPath();
  g.arc(128, 128, 44, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(190,175,170,0.45)';
  for (const [x, y, r] of [[112, 116, 10], [142, 140, 7], [134, 108, 5], [114, 146, 6]]) {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createSky(scene) {
  const group = new THREE.Group();

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(6000, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: hexVec(0x04061a) },
        uMid: { value: hexVec(0x15163d) },
        uHorizon: { value: hexVec(FOG_HEX) },
        uGlow: { value: hexVec(0xb3263f) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop, uMid, uHorizon, uGlow;
        varying vec3 vDir;
        void main() {
          float h = normalize(vDir).y;
          vec3 c = mix(uHorizon, uMid, smoothstep(0.0, 0.22, h));
          c = mix(c, uTop, smoothstep(0.22, 0.75, h));
          // Red city glow hugging the skyline.
          c += uGlow * smoothstep(0.0, 0.04, h) * exp(-h * 9.0) * 0.45;
          if (h < 0.0) c = uHorizon;
          gl_FragColor = sRGBTransferEOTF(vec4(c, 1.0)); // display colours -> linear scene
        }`,
    }),
  );
  dome.renderOrder = -2;
  group.add(dome);

  const starPos = [];
  for (let k = 0; k < 1800; k++) {
    const u = Math.random() * Math.PI * 2;
    const y = 0.08 + Math.random() * 0.92;
    const r = Math.sqrt(1 - y * y);
    starPos.push(Math.cos(u) * r * 5000, y * 5000, Math.sin(u) * r * 5000);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: 0xd4dcff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85, depthWrite: false }),
  );
  stars.renderOrder = -1;
  group.add(stars);

  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTexture(), fog: false, depthWrite: false, transparent: true }));
  moon.position.copy(MOON_DIR).multiplyScalar(4500);
  moon.scale.setScalar(700);
  moon.renderOrder = -1;
  group.add(moon);

  scene.add(group);
  return {
    update(camPos) {
      group.position.copy(camPos);
    },
  };
}
