import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Quality tiers, best first. The page starts at the device's tier and steps down if frames run slow.
export const TIERS = [
  { name: 'high', pixelRatio: 1.5, bloom: true },
  { name: 'medium', pixelRatio: 1.0, bloom: true },
  { name: 'low', pixelRatio: 0.75, bloom: false },
];

// Last pass: speed blur, chromatic fringe and comic speed lines while swinging, then vignette,
// grain and the linear -> sRGB conversion (so no separate OutputPass is needed).
const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uSpeed: { value: 0 },
    uAspect: { value: 1 },
    uFade: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uSpeed;
    uniform float uAspect;
    uniform float uFade;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

    void main() {
      vec2 c = vUv - 0.5;
      float r = length(c * vec2(uAspect, 1.0));
      float fringe = (0.0012 + 0.006 * uSpeed) * r;
      vec3 col;
      if (uSpeed > 0.01) {
        // Zoom blur toward the centre, stronger at the edges of the frame.
        float blur = uSpeed * 0.06 * smoothstep(0.1, 0.75, r);
        col = vec3(0.0);
        for (int i = 0; i < 6; i++) {
          float s = 1.0 - blur * float(i) / 5.0;
          col.r += texture2D(tDiffuse, 0.5 + c * (s + fringe)).r;
          col.g += texture2D(tDiffuse, 0.5 + c * s).g;
          col.b += texture2D(tDiffuse, 0.5 + c * (s - fringe)).b;
        }
        col /= 6.0;
        // Comic speed lines radiating from the centre.
        float a = atan(c.y, c.x * uAspect) * 0.15915 + 0.5;
        float lane = floor(a * 240.0);
        float on = step(0.88, hash(vec2(lane, floor(uTime * 14.0))));
        float lines = on * smoothstep(0.45, 0.9, r) * smoothstep(0.55, 1.0, uSpeed + 0.3);
        col = mix(col, vec3(0.96, 0.93, 0.85), lines * 0.28 * uSpeed);
      } else {
        col = vec3(
          texture2D(tDiffuse, 0.5 + c * (1.0 + fringe)).r,
          texture2D(tDiffuse, vUv).g,
          texture2D(tDiffuse, 0.5 + c * (1.0 - fringe)).b
        );
      }
      col *= 1.0 - 0.5 * smoothstep(0.45, 1.15, r);
      col *= uFade;
      vec4 outCol = sRGBTransferOETF(vec4(max(col, 0.0), 1.0));
      outCol.rgb += (hash(vUv * 917.0 + fract(uTime) * 61.0) - 0.5) * 0.035;
      gl_FragColor = outCol;
    }`,
};

export function createPost(renderer, scene, camera, tierIndex) {
  const size = renderer.getSize(new THREE.Vector2());
  // Scene renders into a half-float target so lights brighter than 1.0 survive for the bloom.
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.85, 0.55, 0.88);
  // Bloom is soft anyway, so run it at half the usual resolution.
  const bloomSetSize = bloom.setSize.bind(bloom);
  bloom.setSize = (w, h) => bloomSetSize(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));
  composer.addPass(bloom);

  const final = new ShaderPass(FinalShader);
  composer.addPass(final);

  let tier = tierIndex;
  function resize() {
    const t = TIERS[tier];
    const pr = Math.min(devicePixelRatio, t.pixelRatio);
    renderer.setPixelRatio(pr);
    renderer.setSize(innerWidth, innerHeight);
    composer.setPixelRatio(pr);
    composer.setSize(innerWidth, innerHeight);
    bloom.enabled = t.bloom;
    final.uniforms.uAspect.value = innerWidth / innerHeight;
  }
  resize();

  return {
    resize,
    render(time, speed, fade) {
      final.uniforms.uTime.value = time;
      final.uniforms.uSpeed.value = speed;
      final.uniforms.uFade.value = fade;
      composer.render();
    },
    tier: () => tier,
    setTier(i) {
      tier = Math.min(Math.max(i, 0), TIERS.length - 1);
      resize();
    },
  };
}
