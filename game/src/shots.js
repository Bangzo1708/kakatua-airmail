// The screenshot scenes behind ?shot=start|play|ring|end. Each one flies the
// real rules forward from a fresh world, steered by a simple autopilot that
// aims at the next ring (or the strip, once the rings are done), so every
// frame is what a real sortie looks like and the same seed always gives the
// same frame.

import { RUNWAY, STEP } from './config.js';
import { nextRing, stepWorld } from './world.js';
import { SCREEN_CRASHED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WON } from './render.js';

const START_SECONDS = 6;
const PLAY_SECONDS = 34;
const RING_SECONDS = 22;
const END_LIMIT_SECONDS = 900;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function headingDiff(target, current) {
  let diff = (target - current + 540) % 360 - 180;
  return diff;
}

/**
 * Steer the plane: bank toward the heading to the target, pitch toward its
 * altitude, and hold a cruise speed — slower on final approach.
 */
export function autopilot(world) {
  const plane = world.plane;
  const ring = nextRing(world);
  let targetX;
  let targetY;
  let targetZ;
  let targetSpeed = 112;
  if (ring) {
    targetX = ring.x;
    targetY = ring.y;
    targetZ = ring.z;
  } else {
    // Final approach: aim at the FAR end of the strip, not the threshold,
    // so the plane flies down the runway and touches down on it instead of
    // orbiting the threshold point. Descend on a gentle slope to the strip.
    targetX = RUNWAY.x;
    targetZ = RUNWAY.z + RUNWAY.length / 2;
    const distToFarEnd = Math.hypot(plane.x - targetX, plane.z - targetZ);
    // Glide down to the strip itself (6 m), not to 8 m above it: the wheels
    // have to reach the ground, and the slope still clears the threshold.
    targetY = 6.2 + Math.max(0, targetZ - plane.z) * 0.035;
    targetSpeed = distToFarEnd < 500 ? 72 : 95;
  }
  const desiredHeading = (Math.atan2(targetX - plane.x, targetZ - plane.z) * 180) / Math.PI;
  const diff = headingDiff(desiredHeading, plane.heading);
  const roll = clamp(diff / 38, -1, 1);
  const altitudeError = targetY - plane.y;
  let pitch = clamp(altitudeError * 0.02, -0.7, 0.7);
  // Over the strip itself, stop following the glide slope and fly the
  // touchdown: sink firmly until low, then flare to a gentle kiss. A
  // proportional controller alone rides metres above the strip forever.
  if (!ring && plane.z > RUNWAY.z - RUNWAY.length / 2) {
    pitch = plane.y > 12 ? -0.55 : -0.12;
  }
  // On the ground, hold the nose level until there is flying speed.
  if (plane.onGround && plane.speedKnots < 72) pitch = 0.12;
  if (plane.onGround && plane.speedKnots >= 72) pitch = 0.55;
  const throttleDelta = plane.speedKnots < targetSpeed ? 1 : -1;
  return { roll, pitch, throttleDelta };
}

/** Run the world forward for `seconds` under the autopilot, or until it ends. */
function flyFor(world, seconds) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    stepWorld(world, autopilot(world), STEP);
    if (world.phase === 'won' || world.phase === 'crashed') break;
  }
}

/** Put the plane in the air near a ring, already flying, for a mid-flight frame. */
function placeMidFlight(world, ringIndex, metresBefore) {
  const ring = world.rings[ringIndex];
  const prev = ringIndex > 0 ? world.rings[ringIndex - 1] : { x: 0, y: 120, z: 500 };
  const dx = ring.x - prev.x;
  const dz = ring.z - prev.z;
  const len = Math.hypot(dx, dz);
  const ux = dx / len;
  const uz = dz / len;
  const plane = world.plane;
  plane.x = ring.x - ux * metresBefore;
  plane.z = ring.z - uz * metresBefore;
  plane.y = ring.y + 4;
  plane.heading = (Math.atan2(ux, uz) * 180) / Math.PI;
  plane.pitch = 0;
  plane.roll = 0;
  plane.speedKnots = 112;
  plane.throttle = 0.72;
  plane.onGround = false;
  plane.airborne = true;
  // The rings before this one are already in the mailbag: the autopilot
  // aims at the ring ahead, not back at the start of the route.
  for (let i = 0; i < ringIndex; i += 1) {
    world.rings[i].passed = true;
  }
  world.ringsPassed = ringIndex;
  world.phase = 'play';
  world.hasFlown = true;
  world.timeSeconds = 41;
}

/**
 * Set `world` to the named scene (start, play, ring or end; any other name is
 * start) and return the screen to draw over it.
 */
export function stageShot(name, world) {
  if (name === 'play') {
    placeMidFlight(world, 3, 620);
    flyFor(world, 3);
    return { screen: SCREEN_PLAY };
  }
  if (name === 'ring') {
    placeMidFlight(world, 5, 150);
    flyFor(world, 1.2);
    return { screen: SCREEN_PLAY };
  }
  if (name === 'end') {
    world.phase = 'play';
    flyFor(world, END_LIMIT_SECONDS);
    if (world.phase === 'won') return { screen: SCREEN_WON };
    if (world.phase === 'crashed') return { screen: SCREEN_CRASHED };
    return { screen: SCREEN_PLAY };
  }
  // Start: the plane waits on the strip, camera behind it, title up.
  for (let i = 0; i < START_SECONDS / STEP; i += 1) {
    world.titleTime += STEP;
  }
  return { screen: SCREEN_TITLE };
}
