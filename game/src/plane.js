// The Kakatua-9 mail plane: an arcade flight model with throttle, pitch,
// bank and turn, stall, fuel burn and a soft-landing window. Positions are
// metres, speeds are knots, angles are radians, headings are degrees.

import { FUEL, PLANE, RUNWAY, SCORE, STEP } from './config.js';
import { heightAt } from './terrain.js';

const KNOTS_TO_MS = 0.514444;
const DEG = Math.PI / 180;

/** A fresh plane already in the air over the southern sea, mail run under way. */
export function createPlane() {
  return {
    x: 0,
    y: PLANE.startAltitude,
    z: 250,
    heading: 0,
    pitch: 0,
    roll: 0,
    speedKnots: 100,
    throttle: 0.7,
    verticalSpeed: 0,
    /** Vertical speed at the last ground contact, for the crash judge. */
    impactSpeed: 0,
    onGround: false,
    airborne: true,
    stalled: false,
    gearDown: true,
  };
}

/**
 * Advance the plane one fixed step. `control` carries roll (-1..1), pitch
 * (-1..1, positive pulls the nose up) and throttleDelta (-1..1). Returns
 * nothing; the plane's fields are the state.
 */
export function stepPlane(plane, control, dt, seed) {
  plane.throttle = Math.max(0, Math.min(1, plane.throttle + control.throttleDelta * dt * 0.9));

  // Roll toward the stick, then turn into the bank; the nose follows the bank.
  // A right bank (positive roll) turns the nose right, toward a higher heading.
  const targetRoll = control.roll * 0.9;
  plane.roll += (targetRoll - plane.roll) * Math.min(1, PLANE.rollRate * dt * 2.2);
  const turn = Math.sin(plane.roll) * PLANE.turnRate * (plane.speedKnots / PLANE.cruiseKnots);
  plane.heading = (plane.heading + turn * dt * 57.2958 + 360) % 360;

  // Pitch follows the stick, eased by speed: a slow plane answers sluggishly.
  const authority = Math.min(1, plane.speedKnots / 70 + 0.25);
  const targetPitch = control.pitch * 0.42 * authority;
  plane.pitch += (targetPitch - plane.pitch) * Math.min(1, PLANE.pitchRate * dt * 3);

  // Speed chases the throttle setting; drag grows with the square of speed.
  const targetSpeed = plane.throttle * PLANE.maxKnots;
  const drag = 0.22 + 0.0009 * plane.speedKnots;
  plane.speedKnots += (targetSpeed - plane.speedKnots) * Math.min(1, drag * dt * 2.4);
  if (plane.speedKnots < 0) plane.speedKnots = 0;
  // Rolling resistance: wheels on the ground bleed speed fast, so a landing
  // rollout ends on the strip instead of running off its far end.
  if (plane.onGround) plane.speedKnots = Math.max(0, plane.speedKnots - 16 * dt);

  const speedMs = plane.speedKnots * KNOTS_TO_MS;
  plane.stalled = !plane.onGround && plane.speedKnots < PLANE.stallKnots;

  // Vertical speed: pitch lifts, gravity pulls, a stall drops the nose.
  let climb = Math.sin(plane.pitch) * speedMs;
  if (plane.stalled) climb -= PLANE.sinkRate * 1.8;
  if (plane.onGround && plane.speedKnots < PLANE.stallKnots * 0.9) climb = 0;
  plane.verticalSpeed += (climb - plane.verticalSpeed) * Math.min(1, dt * 2.5);
  plane.y += plane.verticalSpeed * dt;

  // Move forward along the heading.
  const headingRad = plane.heading * DEG;
  plane.z += Math.cos(headingRad) * speedMs * dt;
  plane.x += Math.sin(headingRad) * speedMs * dt;

  // The ground is solid: touch down, roll, or bounce off a hill.
  const ground = heightAt(plane.x, plane.z, seed);
  if (plane.y <= ground + 0.4) {
    plane.y = ground + 0.4;
    if (plane.onGround === false) plane.impactSpeed = plane.verticalSpeed;
    if (plane.verticalSpeed < -0.5) plane.verticalSpeed = 0;
    plane.onGround = true;
    plane.airborne = false;
  } else if (plane.y > ground + 2) {
    plane.onGround = false;
    plane.airborne = true;
    plane.impactSpeed = 0;
  }
}

/** Fuel burned this step, in percent, at the current throttle. */
export function burnFuel(plane, dt) {
  const rate = FUEL.burnIdle + (FUEL.burnFull - FUEL.burnIdle) * plane.throttle;
  return rate * dt;
}

/** Cruise points earned this step: smooth, fast, level flight pays. */
export function cruisePoints(plane, dt) {
  if (!plane.airborne || plane.stalled) return 0;
  if (plane.speedKnots < 100) return 0;
  return SCORE.cruisePerSecond * dt;
}

/** True when the plane is sitting on the runway strip, aligned with it. */
export function onRunway(plane) {
  const along = plane.z - RUNWAY.z;
  const across = Math.abs(plane.x - RUNWAY.x);
  const headingOff = Math.min(Math.abs(plane.heading - RUNWAY.heading), 360 - Math.abs(plane.heading - RUNWAY.heading));
  return Math.abs(along) <= RUNWAY.length / 2 && across <= RUNWAY.width / 2 && headingOff < 18;
}

/** Judge a touchdown: 'landed', 'hard', 'too-fast', 'too-hard' or 'off-strip'. */
export function judgeTouchdown(plane) {
  if (!onRunway(plane)) return 'off-strip';
  if (plane.speedKnots > PLANE.landMaxKnots) return 'too-fast';
  if (plane.impactSpeed < -7) return 'too-hard';
  if (plane.impactSpeed < -4.5) return 'hard';
  return 'landed';
}
