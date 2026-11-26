// A tiny seeded random generator (mulberry32) so the archipelago, the clouds
// and the ring route are the same for the same seed, and screenshots repeat.

/** Make a generator that returns a float in [0, 1) from an integer seed. */
export function createRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** A deterministic 2D value-noise hash: the same (x, z, seed) always gives the same value. */
export function hash2(x, z, seed) {
  let h = (Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(seed | 0, 974634211)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smoothstep interpolation between a and b by t in [0, 1]. */
export function smoothstep(a, b, t) {
  const u = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return u * u * (3 - 2 * u);
}
