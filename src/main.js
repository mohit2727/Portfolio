import './style.css';
import * as THREE from 'three';
import { FOG_HEX, FOG_DENSITY, MOON_DIR } from './config.js';
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

const $ = (id) => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isTouch = matchMedia('(pointer: coarse)').matches;
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

async function boot() {
  // Billboards are drawn on canvases, so the comic fonts must be ready first.
  await Promise.race([
    Promise.all([document.fonts.load('100px Bangers'), document.fonts.load('700 40px "Space Mono"')]),
    new Promise((r) => setTimeout(r, 3000)),
  ]);

  const canvas = $('world');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
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
  const streets = createStreets(scene);
  const hero = createHero();
  scene.add(hero.root);
  const web = createWeb(scene);
  const rig = createCameraRig(camera, city);

  // Intro rooftop: tall enough to see over downtown toward the Origin tower.
  const roof = city.spawnRoof(...SPAWN_BLOCK, 150, 240) || city.spawnRoof(...SPAWN_BLOCK);
  const origin = city.landmarks.find((l) => l.id === 'origin');
  const spawnPos = new THREE.Vector3((roof.minX + roof.maxX) / 2, roof.y1 + 1.05, (roof.minZ + roof.maxZ) / 2);
  const face = new THREE.Vector3(origin.x - spawnPos.x, 0, origin.z - spawnPos.z).normalize();
  spawnPos.addScaledVector(face, Math.min(roof.maxX - roof.minX, roof.maxZ - roof.minZ) * 0.35);
  const story = createStory({ city, hero, web, camera, rig, sections: SECTIONS, spawn: { pos: spawnPos, face }, onWeb: audio.thwip });

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
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  // Caption box while swinging between towers: "Swinging to MISSIONS · 640 m".
  const travelTag = $('travel-tag');
  let tagFor = null, tagAcc = 0;
  function updateTravelTag(dt) {
    const { travelling, to, remaining } = story.info;
    travelTag.hidden = !travelling || !to;
    if (travelTag.hidden) return;
    tagAcc += dt;
    if (to !== tagFor || tagAcc > 0.1) {
      tagAcc = 0;
      tagFor = to;
      travelTag.style.setProperty('--accent', to.color);
      travelTag.innerHTML = `Swinging to <b>${to.name}</b><span class="dist">${Math.round(remaining)} m</span>`;
    }
  }
  const speedlines = $('speedlines');

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    time += dt;
    if (mode === 'story') {
      const t = dom.progress();
      dom.setActive(t);
      story.update(dt, t, wideQuery.matches);
      updateTravelTag(dt);
      audio.setWind(story.speed());
      speedlines.style.opacity = reduced ? 0 : Math.max(0, Math.min(0.7, (story.speed() - 60) / 120)).toFixed(2);
    } else {
      player.update(dt, time, rig.yaw);
      rig.follow(dt, player, input, reduced);
      checkLandmarks();
      hud.update(player, rig.yaw, dt, reduced);
      audio.setWind(player.vel.length());
    }
    city.update(dt, time);
    streets.update(dt, time);
    sky.update(camera.position);
    renderer.render(scene, camera);
  });

  // Reveal the city once the hero is in (or after 6 s regardless).
  Promise.race([hero.ready, new Promise((r) => setTimeout(r, 6000))]).then(() => {
    document.body.classList.remove('loading');
  });

  // Handy while tuning in the browser console.
  if (import.meta.env.DEV) window.__city = { player, rig, city, input, story, dom, travel, enterRoam, exitRoam, renderer, scene, camera };
}

boot().catch((err) => {
  console.error(err);
  document.body.classList.remove('loading');
  $('loader').hidden = true;
  for (const b of document.querySelectorAll('[data-roam]')) b.textContent = '3D needs WebGL';
});
