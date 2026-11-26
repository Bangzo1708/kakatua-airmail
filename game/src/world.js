// The sortie: rings to fly through, fuel to watch, a strip to land on.
// The world owns the mission state; the plane owns the flying.

import { FUEL, PLANE, RING_COUNT, RING_RADIUS, RUNWAY, SCORE, STEP } from './config.js';
import { createPlane, burnFuel, cruisePoints, judgeTouchdown, onRunway, stepPlane } from './plane.js';
import { heightAt, isWater, makeClouds } from './terrain.js';
import { createRandom } from './random.js';

export const PHASE_TITLE = 'title';
export const PHASE_PLAY = 'play';
export const PHASE_PAUSED = 'paused';
export const PHASE_WON = 'won';
export const PHASE_CRASHED = 'crashed';

export const EVENT_NONE = 0;
export const EVENT_RING = 1;
export const EVENT_FUEL_LOW = 2;
export const EVENT_STALL = 4;
export const EVENT_LANDED = 8;
export const EVENT_CRASHED = 16;

/** Ring positions along the route: a gentle slalom over the islands. */
export function makeRings(random) {
  const rings = [];
  const centres = [
    { x: -260, z: 950, y: 170 },
    { x: 320, z: 1600, y: 210 },
    { x: -180, z: 2350, y: 300 },
    { x: 420, z: 3150, y: 240 },
    { x: -420, z: 3950, y: 260 },
    { x: 240, z: 4650, y: 220 },
    { x: -120, z: 5250, y: 190 },
    { x: 0, z: 5560, y: 130 },
  ];
  for (let i = 0; i < RING_COUNT; i += 1) {
    const c = centres[i];
    rings.push({
      index: i,
      x: c.x + (random() - 0.5) * 30,
      y: c.y,
      z: c.z,
      radius: RING_RADIUS,
      passed: false,
      perfect: false,
    });
  }
  return rings;
}

/** A fresh world for a seed: plane on the strip, rings ahead, full tank. */
export function createWorld(random) {
  return {
    seed: Math.floor(random() * 4294967296),
    plane: createPlane(),
    rings: makeRings(random),
    clouds: null,
    phase: PHASE_TITLE,
    score: 0,
    fuel: FUEL.start,
    ringsPassed: 0,
    timeSeconds: 0,
    message: '',
    messageTimer: 0,
    crashReason: '',
    landingSoft: false,
    /** The sortie starts in the air, so a touchdown always counts as a landing. */
    hasFlown: true,
    best: 0,
    fuelWarned: false,
    stallWarned: false,
    titleTime: 0,
  };
}

export function resetWorld(world, random) {
  const fresh = createWorld(random);
  fresh.seed = world.seed;
  fresh.clouds = world.clouds;
  fresh.best = world.best;
  Object.assign(world, fresh);
  world.phase = PHASE_PLAY;
}

/** The next ring still to fly through, or null when all are passed. */
export function nextRing(world) {
  for (const ring of world.rings) {
    if (!ring.passed) return ring;
  }
  return null;
}

/** Distance in metres from the plane to a point, for the HUD. */
export function distanceTo(plane, x, y, z) {
  const dx = x - plane.x;
  const dy = y - plane.y;
  const dz = z - plane.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Advance the world one fixed step while flying. `control` is the pilot's
 * input for the step. Returns an event mask (see EVENT_* above).
 */
export function stepWorld(world, control, dt) {
  if (world.phase !== PHASE_PLAY) return EVENT_NONE;
  const plane = world.plane;
  let events = EVENT_NONE;
  world.timeSeconds += dt;

  stepPlane(plane, control, dt, world.seed);
  world.fuel = Math.max(0, world.fuel - burnFuel(plane, dt));
  world.score += cruisePoints(plane, dt);

  if (world.messageTimer > 0) world.messageTimer -= dt;

  // Rings: flying through the hoop scores, refuels a little, and cheers.
  const ring = nextRing(world);
  if (ring) {
    const d = distanceTo(plane, ring.x, ring.y, ring.z);
    if (d < ring.radius) {
      ring.passed = true;
      world.ringsPassed += 1;
      const centre = Math.hypot(plane.x - ring.x, plane.y - ring.y) < ring.radius * 0.45;
      ring.perfect = centre;
      world.score += SCORE.ring + (centre ? SCORE.perfectRing : 0);
      world.fuel = Math.min(100, world.fuel + 14);
      world.message = centre ? `RING ${ring.index + 1} — PERFECT CENTRE! +${SCORE.ring + SCORE.perfectRing}` : `RING ${ring.index + 1} — +${SCORE.ring}  FUEL +14`;
      world.messageTimer = 2.4;
      events |= EVENT_RING;
    }
  }

  if (world.fuel <= FUEL.lowAt && !world.fuelWarned) {
    world.fuelWarned = true;
    world.message = 'LOW FUEL — head for the strip!';
    world.messageTimer = 3;
    events |= EVENT_FUEL_LOW;
  }
  if (plane.stalled && !world.stallWarned) {
    world.stallWarned = true;
    events |= EVENT_STALL;
  }
  if (!plane.stalled) world.stallWarned = false;

  // Out of fuel: the engine quits and the plane glides down.
  if (world.fuel <= 0) {
    plane.throttle = 0;
  }

  // Crash: terrain, sea, or a hillside at speed while airborne. A touchdown
  // on the strip itself is judged below, never as a crash.
  const ground = heightAt(plane.x, plane.z, world.seed);
  const touching = plane.y <= ground + 1.2;
  const onStrip = onRunway(plane);
  const gentleStripTouch = onStrip && plane.impactSpeed > -4.5 && plane.speedKnots <= PLANE.landMaxKnots + 18;
  const hitWater = plane.airborne && plane.y <= 1.2 && isWater(plane.x, plane.z, world.seed);
  const hitHard = plane.airborne && touching && !gentleStripTouch && (Math.abs(plane.impactSpeed) > 3.5 || plane.speedKnots > 40);
  if (hitWater || hitHard) {
    world.phase = PHASE_CRASHED;
    world.crashReason = hitWater
      ? 'Ditched in the sea — the mail got wet.'
      : 'Flew into the terrain. Watch the ground!';
    return events | EVENT_CRASHED;
  }

  // Landing: only after the plane has actually flown, so the take-off roll
  // on the strip is never mistaken for a touchdown.
  if (plane.airborne) world.hasFlown = true;
  if (world.hasFlown && plane.onGround && touching && world.timeSeconds > 2) {
    if (onStrip) {
      const verdict = judgeTouchdown(plane);
      if (verdict === 'landed' || verdict === 'hard') {
        world.phase = PHASE_WON;
        world.landingSoft = verdict === 'landed' && plane.impactSpeed > -2;
        world.score += SCORE.landing + (world.landingSoft ? SCORE.softLanding : 0);
        if (verdict === 'hard') world.message = 'Hard landing — but the mail is delivered!';
        if (world.ringsPassed < RING_COUNT) {
          world.message = `Landed early — ${world.ringsPassed}/${RING_COUNT} rings.`;
        }
        return events | EVENT_LANDED;
      }
      if (verdict === 'too-hard') {
        world.phase = PHASE_CRASHED;
        world.crashReason = 'Slammed into the strip — too hard to walk away from.';
        return events | EVENT_CRASHED;
      }
      if (verdict === 'too-fast' && plane.speedKnots > PLANE.landMaxKnots + 18) {
        world.phase = PHASE_CRASHED;
        world.crashReason = 'Ran off the end of the strip — too fast to stop.';
        return events | EVENT_CRASHED;
      }
    }
  }

  // Rolling off the strip island into the sea is a ditching, not a landing.
  if (plane.onGround && plane.y < 1 && isWater(plane.x, plane.z, world.seed)) {
    world.phase = PHASE_CRASHED;
    world.crashReason = 'Rolled off the strip into the sea — the mail got wet.';
    return events | EVENT_CRASHED;
  }

  // Flying far past the strip without landing is a missed approach, not a crash.
  if (plane.z > RUNWAY.z + 900 || Math.abs(plane.x) > 1600 || plane.z < -400) {
    world.phase = PHASE_CRASHED;
    world.crashReason = 'Flew off the chart — the mail never arrived.';
    return events | EVENT_CRASHED;
  }
  return events;
}

/** Title-screen drift: the plane sits on the strip while the camera looks around. */
export function stepTitle(world, dt) {
  world.titleTime += dt;
}

/** Build the clouds once per world, lazily, from the world's seed. */
export function ensureClouds(world) {
  if (!world.clouds) world.clouds = makeClouds(world.seed);
  return world.clouds;
}

/** A one-line summary of the sortie for the end screens. */
export function sortieSummary(world) {
  const minutes = Math.floor(world.timeSeconds / 60);
  const seconds = Math.floor(world.timeSeconds % 60);
  const time = `${minutes}:${String(seconds).padStart(2, '0')}`;
  return `Rings ${world.ringsPassed}/${RING_COUNT}   Fuel ${Math.round(world.fuel)}%   Time ${time}`;
}
