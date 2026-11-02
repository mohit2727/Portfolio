import './style.css';
import * as THREE from 'three';
import { FOG_HEX, FOG_DENSITY, MOON_DIR, clamp } from './config.js';
import { SECTIONS } from './content.js';
import { createCity } from './world/city.js';
import { createSky } from './world/sky.js';
import { createStreets } from './world/street.js';
import { createHero } from './player/hero.js';
import { createWeb } from './player/web.js';
import { createPlayer } from './player/controller.js';
import { createStory } from './story/story.js';
import { createCameraRig } from './camera.js';
import { createInput } from './input.js';
import { createHUD } from './ui/hud.js';
import { createStoryDom } from './ui/storyDom.js';
import { createAudio } from './audio.js';
import { createPost, TIERS } from './post.js';

const $ = (id) => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isTouch = matchMedia('(pointer: coarse)').matches;
const lowEnd = isTouch || (navigator.hardwareConcurrency || 8) <= 4;
const wideQuery = matchMedia('(min-width: 761px)');
const VISITED_KEY = 'webcity:visited';
const SPAWN_BLOCK = [13, 19];

// The story text is plain HTML, so render it right away; the 3D city fills in behind it.
const dom = createStoryDom(SECTIONS);
const audio = createAudio();
const onScroll = () => document.body.classList.toggle('scrolled', scrollY > innerHeight * 0.6);
addEventListener('scroll', onScroll, { passive: true });
onScroll();
for (const a of [$('begin'), $('to-top')]) {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    dom.goTo(a.id === 'begin' ? 1 : 0);
  });
}

function loadVisited() {
  try {
    return new Set(JSON.parse(localStorage.getItem(VISITED_KEY) || '[]'));
  } catch {
    return new Set();
  }
}
function saveVisited(set) {
  try {
    localStorage.setItem(VISITED_KEY, JSON.stringify([...set]));
  } catch { /* storage is optional */ }
}

// Loader: building steps and the hero download share one progress bar.
const loading = { build: 0, model: 0, compile: 0 };
function setProgress(step) {
  const p = loading.build * 0.55 + loading.model * 0.35 + loading.compile * 0.1;
  $('loader-fill').style.transform = `scaleX(${p.toFixed(3)})`;
  $('loader-pct').textContent = `${Math.round(p * 100)}%`;
  if (step) $('loader-step').textContent = step;
}
// Give the browser a moment to paint the loader between the heavy build steps.
const breathe = () => new Promise((r) => setTimeout(r, 16));

async function boot() {
  setProgress('Inking the panels');
  // Start the hero download first so it runs while the city is being built.
  const hero = createHero({ onProgress: (p) => { loading.model = p; setProgress(); } });

  // Billboards are drawn on canvases, so the comic fonts must be ready first.
  await Promise.race([
    Promise.all([document.fonts.load('100px Bangers'), document.fonts.load('700 40px "Space Mono"')]),
    new Promise((r) => setTimeout(r, 3000)),
  ]);
  loading.build = 0.15;
  setProgress('Raising the towers');
  await breathe();

  const canvas = $('world');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.setSize(innerWidth, innerHeight);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(FOG_HEX, FOG_DENSITY);
  scene.background = new THREE.Color(FOG_HEX);
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.5, 9000);

  scene.add(new THREE.HemisphereLight(0x8a98ff, 0x2a1020, 1.4));
  const moonLight = new THREE.DirectionalLight(0xc9d6ff, 2.2);
  moonLight.position.copy(MOON_DIR).multiplyScalar(100);
  scene.add(moonLight);

  const sky = createSky(scene);
  const city = createCity(scene, renderer);
  loading.build = 0.7;
  setProgress('Filling the streets');
  await breathe();
  const streets = createStreets(scene, lowEnd ? { cars: 600, people: 1400 } : undefined);
  scene.add(hero.root);
  const web = createWeb(scene);
  const rig = createCameraRig(camera, city);
  const post = createPost(renderer, scene, camera, lowEnd ? 1 : 0);
  loading.build = 0.9;
  setProgress('Suiting up the hero');
  await breathe();

  // Intro rooftop: tall enough to see over downtown toward the Origin tower.
  const roof = city.spawnRoof(...SPAWN_BLOCK, 150, 240) || city.spawnRoof(...SPAWN_BLOCK);
  const origin = city.landmarks.find((l) => l.id === 'origin');
  const spawnPos = new THREE.Vector3((roof.minX + roof.maxX) / 2, roof.y1 + 1.05, (roof.minZ + roof.maxZ) / 2);
  const face = new THREE.Vector3(origin.x - spawnPos.x, 0, origin.z - spawnPos.z).normalize();
  spawnPos.addScaledVector(face, Math.min(roof.maxX - roof.minX, roof.maxZ - roof.minZ) * 0.35);
  const story = createStory({
    city, hero, web, camera, rig, reduced,
    sections: SECTIONS,
    spawn: { pos: spawnPos, face },
    onWeb: audio.thwip,
    onLand: audio.land,
  });
  loading.build = 1;
  setProgress();

  let mode = 'story';
  const input = createInput(canvas, {
    isActive: () => mode === 'roam',
    joyEl: $('joy'),
    knobEl: $('joy-knob'),
    webBtn: $('btn-web'),
    jumpBtn: $('btn-jump'),
  });
  const visited = loadVisited();
  const hud = createHUD({ sections: SECTIONS, landmarks: city.landmarks, blockInfo: city.blockInfo, onTravel: travel });
  hud.setVisited(visited);

  let lastSfx = -10, time = 0, celebrated = visited.size === SECTIONS.length;
  const player = createPlayer({
    city, input, hero, web,
    events: {
      onAttach(n) {
        audio.thwip();
        if (n === 2) hud.hint('Steer with WASD while swinging. Let go at the bottom of the arc to fling forward.', 7000);
        if (n === 7) hud.hint('Shift reels the web in. Climb any wall by running into it.', 6000);
        if (n === 1 || (time - lastSfx > 5 && Math.random() < 0.3)) {
          hud.sfx('THWIP!');
          lastSfx = time;
        }
      },
      onNoAnchor() {
        if (player.pos.y > 150) hud.hint('Nothing tall enough to web onto up here. Drop lower or head downtown.', 3000);
      },
    },
  });

  function openSection(id) {
    hud.openPanel(SECTIONS.find((s) => s.id === id));
    if (visited.has(id)) return;
    visited.add(id);
    saveVisited(visited);
    hud.setVisited(visited);
    if (visited.size === SECTIONS.length && !celebrated) {
      celebrated = true;
      setTimeout(() => hud.toast('City secured! You found every section.'), 900);
    }
  }

  function travel(id) {
    const lm = city.landmarks.find((l) => l.id === id);
    hud.flash();
    rig.yaw = Math.PI;
    rig.pitch = 0.32;
    player.teleport(lm.x, lm.top + 1.05, lm.z + 18.5, rig.yaw);
    rig.snap(player);
    lm.inside = true;
    openSection(id);
  }

  function checkLandmarks() {
    for (const lm of city.landmarks) {
      lm.dist = Math.hypot(player.pos.x - lm.x, player.pos.z - lm.z);
      if (lm.dist < 75) {
        if (!lm.inside) {
          lm.inside = true;
          if (hud.currentId() !== lm.id) openSection(lm.id);
        }
      } else if (lm.dist > 130 && lm.inside) {
        lm.inside = false;
        if (hud.currentId() === lm.id) hud.closePanel();
      }
    }
  }

  // Free roam starts wherever the story hero is right now.
  let storyScroll = 0;
  function enterRoam() {
    if (mode === 'roam') return;
    storyScroll = scrollY;
    mode = 'roam';
    dom.setMode(true);
    city.setFocus(null);
    const p = story.heroPos(), h = story.heading();
    rig.yaw = Math.atan2(-h.x, -h.z);
    rig.pitch = 0.25;
    player.teleport(p.x, p.y, p.z, rig.yaw);
    for (const lm of city.landmarks) lm.inside = Math.hypot(p.x - lm.x, p.z - lm.z) < 75;
    rig.snap(player);
    hud.setVisible(true);
    travelTag.hidden = true;
    if (isTouch) $('touch').hidden = false;
    hud.hint(isTouch
      ? 'Hold WEB to swing. Drag the left side to move and the right side to look.'
      : 'Hold Space or click to shoot a web. Follow the light beams to each tower.', 9000);
    canvas.focus();
  }
  function exitRoam() {
    if (mode === 'story') return;
    mode = 'story';
    if (document.pointerLockElement) document.exitPointerLock();
    hud.setVisible(false);
    $('touch').hidden = true;
    web.hide();
    dom.setMode(false);
    scrollTo(0, storyScroll);
    dom.layout();
    story.reset();
  }

  for (const b of document.querySelectorAll('[data-roam]')) {
    b.disabled = false;
    b.addEventListener('click', enterRoam);
  }
  $('story-btn').addEventListener('click', exitRoam);
  addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && mode === 'roam' && hud.currentId()) hud.closePanel();
  });
  // Checked every frame rather than on 'resize', so a page that booted in a hidden or
  // zero-sized window still picks up its real size.
  let sizeW = 0, sizeH = 0;
  function syncSize() {
    if (innerWidth === sizeW && innerHeight === sizeH) return;
    if (!innerWidth || !innerHeight) return;
    sizeW = innerWidth;
    sizeH = innerHeight;
    camera.aspect = sizeW / sizeH;
    camera.updateProjectionMatrix();
    post.resize();
  }

  // Caption box while swinging between towers: "Swinging to MISSIONS · 640 m".
  const travelTag = $('travel-tag');
  let tagFor = null, tagDist = -1;
  function updateTravelTag() {
    const { travelling, to, remaining } = story.info;
    travelTag.hidden = !travelling || !to;
    if (travelTag.hidden) return;
    const d = Math.round(remaining / 5) * 5;
    if (to === tagFor && d === tagDist) return;
    tagFor = to;
    tagDist = d;
    travelTag.style.setProperty('--accent', to.color);
    travelTag.innerHTML = `Swinging to <b>${to.name}</b><span class="dist">${d} m</span>`;
  }

  // Adaptive quality: after a warm-up, step down a tier whenever frames run slow for a while.
  const perf = { warm: 0, acc: 0, frames: 0 };
  function watchFrameRate(raw) {
    if (raw > 0.25 || document.hidden) return; // tab switches and stalls say nothing about the GPU
    perf.warm += raw;
    if (perf.warm < 3 || post.tier() >= TIERS.length - 1) return;
    perf.acc += raw;
    perf.frames++;
    if (perf.acc < 2) return;
    const avg = perf.acc / perf.frames;
    perf.acc = perf.frames = 0;
    if (avg > 1 / 40) {
      post.setTier(post.tier() + 1);
      perf.warm = 1; // give the new tier a second to settle before judging it
    }
  }

  let fx = 0, revealedAt = -1;
  const clock = new THREE.Clock();
  function frame() {
    const raw = clock.getDelta();
    const dt = Math.min(raw, 0.05);
    time += dt;
    syncSize();
    let speed;
    if (mode === 'story') {
      const t = dom.progress();
      dom.setActive(t);
      story.update(dt, t, wideQuery.matches, time);
      updateTravelTag();
      speed = story.speed();
      fx += (clamp((speed - 50) / 140, 0, 0.85) - fx) * (1 - Math.exp(-4 * dt));
    } else {
      player.update(dt, time, rig.yaw);
      rig.follow(dt, player, input, reduced);
      checkLandmarks();
      hud.update(player, rig.yaw, dt);
      speed = player.vel.length();
      fx += (clamp((speed - 35) / 80, 0, 1) - fx) * (1 - Math.exp(-4 * dt));
    }
    audio.setWind(speed);
    city.update(dt, time);
    streets.update(dt, time);
    sky.update(camera.position);
    const fade = revealedAt < 0 ? 0 : clamp((time - revealedAt) / 1.1, 0, 1);
    post.render(time, reduced ? 0 : fx, fade * fade);
    if (revealedAt >= 0) watchFrameRate(raw);
  }

  // Wait for the hero (or give up after 8 s), then compile every shader before the first frame.
  await Promise.race([hero.ready, new Promise((r) => setTimeout(r, 8000))]);
  loading.model = 1;
  setProgress('Lighting the city');
  await breathe();
  syncSize();
  story.update(0, dom.progress(), wideQuery.matches, 0);
  try {
    await renderer.compileAsync(scene, camera);
  } catch { /* compiles on first render instead */ }
  loading.compile = 1;
  setProgress('Ready');

  // Opening fly-in, unless the page was reloaded part-way down the story.
  if (scrollY < innerHeight * 0.3) story.playIntro();
  renderer.setAnimationLoop(frame);
  await new Promise((r) => setTimeout(r, 120)); // let the first frames land before the loader opens
  revealedAt = time;
  document.body.classList.remove('loading');
  document.body.classList.add('ready');

  // Handy while tuning in the browser console.
  if (import.meta.env.DEV) window.__city = { player, rig, city, input, story, dom, travel, enterRoam, exitRoam, renderer, scene, camera, post };
}

boot().catch((err) => {
  console.error(err);
  document.body.classList.remove('loading');
  document.body.classList.add('ready');
  for (const b of document.querySelectorAll('[data-roam]')) b.textContent = '3D needs WebGL';
});
