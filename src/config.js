import * as THREE from 'three';

// City grid. One unit = one metre.
export const N = 32; // blocks per side
export const PITCH = 80; // block + street
export const BLOCK = 58; // buildable block width (street = PITCH - BLOCK)
export const HALF = (N * PITCH) / 2;

export const FOG_HEX = 0x2a1a3a;
export const FOG_DENSITY = 0.00095;
export const MOON_DIR = new THREE.Vector3(-0.5, 0.6, -0.62).normalize();

export const blockCenter = (i) => -HALF + PITCH * (i + 0.5);
export const cellOf = (v) => Math.floor((v + HALF) / PITCH);
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// Seeded RNG so the city is the same on every visit.
let seed = 20261101;
export function rnd() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

// Shader uniforms take display (sRGB) colours as plain vectors, skipping three's colour management.
export function hexVec(hex) {
  return new THREE.Vector3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
}

export function hexRgb(css) {
  const h = parseInt(css.slice(1), 16);
  return [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
}
