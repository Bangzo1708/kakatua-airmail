// The Coral Archipelago: a seeded heightfield of islands in a turquoise sea,
// plus the clouds that drift above it. Everything here is a pure function of
// (x, z, seed), so the same seed always builds the same islands.

import { SEA_LEVEL, WORLD } from './config.js';
import { hash2, smoothstep } from './random.js';

/** Islands the route flies over: centre, radius and peak height, in metres. */
export const ISLANDS = [
  { x: -620, z: 900, radius: 520, peak: 150, name: 'Pulau Karang' },
  { x: 540, z: 1500, radius: 430, peak: 120, name: 'Pulau Nusa' },
  { x: -380, z: 2300, radius: 610, peak: 260, name: 'Pulau Api' },
  { x: 700, z: 3100, radius: 480, peak: 140, name: 'Pulau Lumba' },
  { x: -720, z: 3900, radius: 560, peak: 190, name: 'Pulau Penyu' },
  { x: 420, z: 4600, radius: 500, peak: 130, name: 'Pulau Cendrawasih' },
  { x: 0, z: 5900, radius: 700, peak: 24, name: 'Pulau Landasan', flat: true },
];

/** The volcano cone on Pulau Api, the tallest landmark on the route. */
export const VOLCANO = { x: -380, z: 2300, radius: 210, peak: 340 };

function islandHeight(x, z, island) {
  const dx = x - island.x;
  const dz = z - island.z;
  const d = Math.sqrt(dx * dx + dz * dz) / island.radius;
  if (d >= 1) return 0;
  const dome = Math.cos(d * Math.PI * 0.5);
  return island.peak * dome * dome;
}

/** Fine bumps so the ground is never a smooth dome: two octaves of value noise. */
function bumpHeight(x, z, seed) {
  const n1 = hash2(Math.floor(x / 180), Math.floor(z / 180), seed);
  const n2 = hash2(Math.floor(x / 55), Math.floor(z / 55), seed + 7);
  return (n1 - 0.5) * 26 + (n2 - 0.5) * 9;
}

/** Ground height in metres at (x, z). The airstrip island is flattened for landing. */
export function heightAt(x, z, seed) {
  let height = 0;
  for (const island of ISLANDS) {
    const h = islandHeight(x, z, island);
    if (h > height) height = h;
  }
  const volcanoD = Math.hypot(x - VOLCANO.x, z - VOLCANO.z) / VOLCANO.radius;
  if (volcanoD < 1) {
    const cone = VOLCANO.peak * Math.pow(1 - volcanoD, 1.4);
    if (cone > height) height = cone;
  }
  // Flatten the strip island and the runway itself so a landing is possible.
  const stripD = Math.hypot(x - 0, z - 5900);
  if (stripD < 720) {
    const flat = smoothstep(720, 380, stripD);
    height = height * (1 - flat) + 6 * flat;
  }
  if (height > 4) height += bumpHeight(x, z, seed) * Math.min(1, height / 60);
  return Math.max(height, SEA_LEVEL - 26);
}

/** True when the point is over open water (below sea level). */
export function isWater(x, z, seed) {
  return heightAt(x, z, seed) <= SEA_LEVEL + 0.5;
}

/** Colour of the ground at a height, for the terrain painter. */
export function groundColour(height, seed, x, z) {
  if (height <= SEA_LEVEL + 0.5) {
    const shallow = smoothstep(-26, -2, height);
    return shallow > 0.55 ? '#2fb3c9' : '#0a5e8a';
  }
  if (height < 4) return '#f2dd9e';
  if (height < 60) {
    const patch = hash2(Math.floor(x / 90), Math.floor(z / 90), seed + 21);
    return patch > 0.62 ? '#2f7a33' : '#5da244';
  }
  if (height < 150) return '#5da244';
  if (height < 240) return '#8a7f74';
  if (height < 300) return '#5d4037';
  return '#f4f7f7';
}

/** Puffy clouds, placed by seed: position, size and height above the sea. */
export function makeClouds(seed) {
  const clouds = [];
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < 46; i += 1) {
    clouds.push({
      x: (next() - 0.5) * WORLD.halfWidth * 2.4,
      y: 380 + next() * 240,
      z: next() * WORLD.length,
      radius: 26 + next() * 44,
      puffs: 3 + Math.floor(next() * 4),
    });
  }
  return clouds;
}
