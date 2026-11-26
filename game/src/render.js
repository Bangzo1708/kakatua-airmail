// The painter: sky, sea and islands in pseudo-3D, the Kakatua-9 drawn in
// chase view, the rings and the strip ahead, and a lit instrument panel.
// Everything is drawn on one 2D canvas in a fixed 1280x720 logical space.

import { COLOURS, FIELD, PLANE, RUNWAY, WORLD } from './config.js';
import { groundColour, heightAt } from './terrain.js';
import { distanceTo, nextRing } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_WON = 'won';
export const SCREEN_CRASHED = 'crashed';

const DEG = Math.PI / 180;
const FOCAL = 760;
const CAMERA_BACK = 17;
const CAMERA_UP = 6.5;

/** Build the renderer for a canvas; draw(state) paints one frame. */
export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let width = FIELD.width;
  let height = FIELD.height;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    width = Math.max(320, rect.width);
    height = Math.max(240, rect.height);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(canvas.width / FIELD.width, 0, 0, canvas.height / FIELD.height, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  /** Camera basis from the plane: position behind it, looking ahead. */
  function cameraBasis(plane) {
    const headingRad = plane.heading * DEG;
    const forward = {
      x: Math.sin(headingRad) * Math.cos(plane.pitch),
      y: Math.sin(plane.pitch),
      z: Math.cos(headingRad) * Math.cos(plane.pitch),
    };
    const right = { x: Math.cos(headingRad), y: 0, z: -Math.sin(headingRad) };
    const up = {
      x: -Math.sin(headingRad) * Math.sin(plane.pitch),
      y: Math.cos(plane.pitch),
      z: -Math.cos(headingRad) * Math.sin(plane.pitch),
    };
    // Roll the camera with the plane, gently, so the horizon banks.
    const roll = plane.roll * 0.55;
    const cosR = Math.cos(roll);
    const sinR = Math.sin(roll);
    const rolledRight = {
      x: right.x * cosR + up.x * sinR,
      y: right.y * cosR + up.y * sinR,
      z: right.z * cosR + up.z * sinR,
    };
    const rolledUp = {
      x: up.x * cosR - right.x * sinR,
      y: up.y * cosR - right.y * sinR,
      z: up.z * cosR - right.z * sinR,
    };
    const pos = {
      x: plane.x - forward.x * CAMERA_BACK,
      y: plane.y + CAMERA_UP - forward.y * CAMERA_BACK,
      z: plane.z - forward.z * CAMERA_BACK,
    };
    return { pos, forward, right: rolledRight, up: rolledUp };
  }

  /** Project a world point to screen space; null when behind the camera. */
  function project(camera, x, y, z) {
    const rx = x - camera.pos.x;
    const ry = y - camera.pos.y;
    const rz = z - camera.pos.z;
    const cz = rx * camera.forward.x + ry * camera.forward.y + rz * camera.forward.z;
    if (cz < 2) return null;
    const cx = rx * camera.right.x + ry * camera.right.y + rz * camera.right.z;
    const cy = rx * camera.up.x + ry * camera.up.y + rz * camera.up.z;
    return {
      x: FIELD.width / 2 + (cx / cz) * FOCAL,
      y: FIELD.height * 0.46 - (cy / cz) * FOCAL,
      depth: cz,
      scale: FOCAL / cz,
    };
  }

  function drawSky(camera, world, time) {
    const horizon = project(camera, camera.pos.x, 0, camera.pos.z + 4000);
    const horizonY = horizon ? horizon.y : FIELD.height * 0.46;
    const sky = ctx.createLinearGradient(0, 0, 0, horizonY);
    sky.addColorStop(0, COLOURS.skyTop);
    sky.addColorStop(0.62, COLOURS.skyMid);
    sky.addColorStop(1, COLOURS.skyHorizon);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, FIELD.width, Math.max(0, horizonY));
    // Sun, fixed in the west so the light never moves.
    const sun = project(camera, camera.pos.x - 2600, 700, camera.pos.z + 3800);
    if (sun) {
      ctx.fillStyle = COLOURS.sun;
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 243, 196, 0.35)';
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, 52, 0, Math.PI * 2);
      ctx.fill();
    }
    // Sea below the horizon.
    const sea = ctx.createLinearGradient(0, horizonY, 0, FIELD.height);
    sea.addColorStop(0, COLOURS.seaShallow);
    sea.addColorStop(1, COLOURS.seaDeep);
    ctx.fillStyle = sea;
    ctx.fillRect(0, horizonY, FIELD.width, FIELD.height - horizonY);
    drawClouds(camera, world, time);
    return horizonY;
  }

  function drawClouds(camera, world, time) {
    const clouds = world.clouds || [];
    for (const cloud of clouds) {
      const drift = ((time * 2 + cloud.x) % 3000 + 3000) % 3000 - 1500;
      const p = project(camera, cloud.x + drift * 0.2, cloud.y, cloud.z);
      if (!p || p.depth > 3200 || p.depth < 800) continue;
      const r = Math.min(64, Math.max(4, cloud.radius * p.scale * 0.9));
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      for (let i = 0; i < cloud.puffs; i += 1) {
        const ox = (i - cloud.puffs / 2) * r * 0.7;
        ctx.beginPath();
        ctx.arc(p.x + ox, p.y - Math.abs(ox) * 0.12, r * (0.55 + (i % 2) * 0.2), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawTerrain(camera, world) {
    const seed = world.seed;
    const camZ = camera.pos.z;
    const camX = camera.pos.x;
    const cell = WORLD.cell;
    const startRow = Math.floor((camZ + WORLD.viewDistance) / cell);
    const endRow = Math.floor((camZ - 60) / cell);
    for (let row = startRow; row >= endRow; row -= 1) {
      const z0 = row * cell;
      const z1 = z0 + cell;
      const halfSpan = Math.ceil((WORLD.halfWidth + 400) / cell);
      const centreCol = Math.round(camX / cell);
      for (let col = centreCol - halfSpan; col <= centreCol + halfSpan; col += 1) {
        const x0 = col * cell;
        const x1 = x0 + cell;
        const h00 = heightAt(x0, z0, seed);
        const h10 = heightAt(x1, z0, seed);
        const h11 = heightAt(x1, z1, seed);
        const h01 = heightAt(x0, z1, seed);
        if (h00 <= 0.5 && h10 <= 0.5 && h11 <= 0.5 && h01 <= 0.5) continue;
        const p00 = project(camera, x0, Math.max(h00, 0.4), z0);
        const p10 = project(camera, x1, Math.max(h10, 0.4), z0);
        const p11 = project(camera, x1, Math.max(h11, 0.4), z1);
        const p01 = project(camera, x0, Math.max(h01, 0.4), z1);
        if (!p00 || !p10 || !p11 || !p01) continue;
        const avg = (h00 + h10 + h11 + h01) / 4;
        ctx.fillStyle = groundColour(avg, seed, (x0 + x1) / 2, (z0 + z1) / 2);
        ctx.beginPath();
        ctx.moveTo(p00.x, p00.y);
        ctx.lineTo(p10.x, p10.y);
        ctx.lineTo(p11.x, p11.y);
        ctx.lineTo(p01.x, p01.y);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawRunway(camera, world) {
    const halfL = RUNWAY.length / 2;
    const halfW = RUNWAY.width / 2;
    const corners = [
      project(camera, RUNWAY.x - halfW, 6.6, RUNWAY.z - halfL),
      project(camera, RUNWAY.x + halfW, 6.6, RUNWAY.z - halfL),
      project(camera, RUNWAY.x + halfW, 6.6, RUNWAY.z + halfL),
      project(camera, RUNWAY.x - halfW, 6.6, RUNWAY.z + halfL),
    ];
    if (corners.some((p) => !p)) return;
    ctx.fillStyle = COLOURS.runway;
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 4; i += 1) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
    ctx.fill();
    // Centreline dashes and threshold bars.
    ctx.fillStyle = COLOURS.runwayMark;
    for (let d = -halfL + 40; d < halfL - 20; d += 80) {
      const a = project(camera, RUNWAY.x - 2, 6.8, RUNWAY.z + d);
      const b = project(camera, RUNWAY.x + 2, 6.8, RUNWAY.z + d + 34);
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(a.x, b.y);
      ctx.closePath();
      ctx.fill();
    }
    // Edge lights, glowing amber.
    for (let d = -halfL + 20; d <= halfL - 20; d += 120) {
      for (const side of [-1, 1]) {
        const p = project(camera, RUNWAY.x + side * (halfW + 3), 8, RUNWAY.z + d);
        if (!p) continue;
        ctx.fillStyle = COLOURS.hudAmber;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1.5, 3.2 * p.scale * 8), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawRings(camera, world, time) {
    for (const ring of world.rings) {
      if (ring.passed) continue;
      const p = project(camera, ring.x, ring.y, ring.z);
      if (!p || p.depth > 2400) continue;
      const r = Math.max(4, ring.radius * p.scale);
      const pulse = 1 + Math.sin(time * 3 + ring.index) * 0.06;
      ctx.save();
      ctx.shadowColor = COLOURS.ringGlow;
      ctx.shadowBlur = 18;
      ctx.strokeStyle = COLOURS.ringGold;
      ctx.lineWidth = Math.max(2, r * 0.09);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = Math.max(1, r * 0.025);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * pulse * 0.82, 0, Math.PI * 2);
      ctx.stroke();
      // Distance tag above the next ring, outlined so it reads against sky or cloud.
      if (ring === nextRing(world)) {
        const dist = Math.round(distanceTo(world.plane, ring.x, ring.y, ring.z));
        const label = `RING ${ring.index + 1} — ${dist} m`;
        ctx.font = 'bold 15px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'rgba(10, 16, 24, 0.85)';
        ctx.lineWidth = 4;
        ctx.strokeText(label, p.x, p.y - r - 12);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, p.x, p.y - r - 12);
      }
    }
  }

  /** The Kakatua-9 herself, drawn from behind and slightly above, banking with the roll. */
  function drawPlane(plane, time) {
    const cx = FIELD.width / 2;
    const cy = FIELD.height * 0.66;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(plane.roll * 0.85);
    const scale = 1 + Math.sin(plane.pitch) * 0.06;
    ctx.scale(scale, scale);
    // Propeller blur disc.
    const propSpeed = 0.25 + plane.throttle * 0.75;
    ctx.fillStyle = `rgba(220, 230, 240, ${0.16 + propSpeed * 0.2})`;
    ctx.beginPath();
    ctx.ellipse(0, -58, 26, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    // Wings: red tops, cream undersides.
    ctx.fillStyle = COLOURS.planeRed;
    ctx.beginPath();
    ctx.moveTo(-14, -8);
    ctx.lineTo(-168, 26);
    ctx.lineTo(-168, 40);
    ctx.lineTo(-12, 16);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(14, -8);
    ctx.lineTo(168, 26);
    ctx.lineTo(168, 40);
    ctx.lineTo(12, 16);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = COLOURS.planeCream;
    ctx.beginPath();
    ctx.moveTo(-168, 32);
    ctx.lineTo(-168, 40);
    ctx.lineTo(-12, 16);
    ctx.lineTo(-14, 10);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(168, 32);
    ctx.lineTo(168, 40);
    ctx.lineTo(12, 16);
    ctx.lineTo(14, 10);
    ctx.closePath();
    ctx.fill();
    // Tailplane and fin.
    ctx.fillStyle = COLOURS.planeRed;
    ctx.beginPath();
    ctx.moveTo(-8, 52);
    ctx.lineTo(-64, 78);
    ctx.lineTo(-64, 88);
    ctx.lineTo(-6, 66);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(8, 52);
    ctx.lineTo(64, 78);
    ctx.lineTo(64, 88);
    ctx.lineTo(6, 66);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-4, 48);
    ctx.lineTo(-10, 6);
    ctx.lineTo(10, 6);
    ctx.lineTo(4, 48);
    ctx.closePath();
    ctx.fill();
    // Fuselage, tapering to the tail.
    ctx.fillStyle = COLOURS.planeCream;
    ctx.beginPath();
    ctx.moveTo(-20, -62);
    ctx.quadraticCurveTo(-26, -10, -14, 62);
    ctx.lineTo(14, 62);
    ctx.quadraticCurveTo(26, -10, 20, -62);
    ctx.quadraticCurveTo(0, -74, -20, -62);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = COLOURS.planeRed;
    ctx.beginPath();
    ctx.moveTo(-20, -62);
    ctx.quadraticCurveTo(-24, -34, -20, -8);
    ctx.lineTo(20, -8);
    ctx.quadraticCurveTo(24, -34, 20, -62);
    ctx.quadraticCurveTo(0, -74, -20, -62);
    ctx.closePath();
    ctx.fill();
    // Cockpit windows, lit amber.
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.moveTo(-13, -56);
    ctx.lineTo(-9, -30);
    ctx.lineTo(9, -30);
    ctx.lineTo(13, -56);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1c2733';
    ctx.beginPath();
    ctx.moveTo(-13, -56);
    ctx.lineTo(-9, -30);
    ctx.lineTo(0, -30);
    ctx.lineTo(0, -56);
    ctx.closePath();
    ctx.fill();
    // Registration and mail stripe.
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PK-KT9', 0, 34);
    // Navigation lights, blinking.
    const blink = Math.sin(time * 6) > 0;
    if (blink) {
      ctx.fillStyle = '#ff3b30';
      ctx.beginPath();
      ctx.arc(-168, 33, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#34e07a';
      ctx.beginPath();
      ctx.arc(168, 33, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawCompassStrip(plane) {
    const cx = FIELD.width / 2;
    const y = 30;
    ctx.fillStyle = 'rgba(10, 16, 24, 0.72)';
    ctx.fillRect(cx - 190, 8, 380, 40);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.strokeRect(cx - 190, 8, 380, 40);
    const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (let off = -60; off <= 60; off += 5) {
      let hdg = Math.round((plane.heading + off + 360) % 360);
      const x = cx + off * 3.0;
      if (off % 15 === 0) {
        const label = hdg % 45 === 0 ? points[Math.round(hdg / 45) % 8] : String(hdg).padStart(3, '0');
        ctx.fillStyle = off === 0 ? COLOURS.hudAmber : '#e8f2f8';
        ctx.fillText(label, x, y + 8);
        ctx.fillRect(x - 1, y - 14, 2, 8);
      } else {
        ctx.fillStyle = 'rgba(232,242,248,0.55)';
        ctx.fillRect(x - 0.5, y - 12, 1, 5);
      }
    }
    ctx.fillStyle = COLOURS.hudAmber;
    ctx.beginPath();
    ctx.moveTo(cx, 48);
    ctx.lineTo(cx - 6, 40);
    ctx.lineTo(cx + 6, 40);
    ctx.closePath();
    ctx.fill();
  }

  function drawHudBox(x, y, label, value, unit, accent) {
    ctx.fillStyle = 'rgba(10, 16, 24, 0.72)';
    ctx.fillRect(x, y, 148, 56);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.strokeRect(x, y, 148, 56);
    ctx.fillStyle = '#9fb8c8';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 10, y + 16);
    ctx.fillStyle = accent || '#ffffff';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillText(`${value}`, x + 10, y + 44);
    ctx.fillStyle = '#9fb8c8';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(unit, x + 96, y + 44);
  }

  function drawFuelGauge(world, x, y) {
    ctx.fillStyle = 'rgba(10, 16, 24, 0.72)';
    ctx.fillRect(x, y, 190, 56);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.strokeRect(x, y, 190, 56);
    ctx.fillStyle = '#9fb8c8';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('FUEL', x + 10, y + 16);
    const low = world.fuel <= 25;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(x + 10, y + 26, 170, 12);
    ctx.fillStyle = low ? COLOURS.hudRed : COLOURS.hudGreen;
    ctx.fillRect(x + 10, y + 26, 170 * (world.fuel / 100), 12);
    ctx.fillStyle = low ? COLOURS.hudRed : '#ffffff';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(`${Math.round(world.fuel)}%`, x + 10, y + 50);
  }

  /** The lit instrument cluster along the bottom: attitude, altimeter, airspeed, throttle. */
  function drawInstruments(world, time) {
    const plane = world.plane;
    const panelY = FIELD.height - 118;
    ctx.fillStyle = 'rgba(13, 18, 26, 0.88)';
    ctx.fillRect(0, panelY, FIELD.width, 118);
    ctx.fillStyle = 'rgba(255, 179, 71, 0.35)';
    ctx.fillRect(0, panelY, FIELD.width, 2);
    const cy = panelY + 59;
    drawAttitudeIndicator(plane, 150, cy, 46);
    drawDial(200 + 60, cy, 46, plane.y, 0, 500, 'ALT', 'ft', (v) => `${Math.round(v)}`);
    drawDial(360 + 60, cy, 46, plane.speedKnots, 0, 180, 'SPD', 'kt', (v) => `${Math.round(v)}`);
    drawThrottleBar(plane, 560, panelY + 18, 150, 80);
    drawRingCounter(world, 760, panelY + 18);
    drawScoreBlock(world, FIELD.width - 320, panelY + 18);
    if (plane.stalled && world.phase === 'play') {
      const blink = Math.sin(time * 10) > 0;
      ctx.fillStyle = blink ? COLOURS.hudRed : 'rgba(255,90,78,0.4)';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('STALL — NOSE DOWN, POWER UP', FIELD.width / 2, panelY - 14);
    }
    if (world.fuel <= 25 && world.phase === 'play') {
      const blink = Math.sin(time * 6) > 0;
      ctx.fillStyle = blink ? COLOURS.hudRed : 'rgba(255,90,78,0.4)';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('LOW FUEL', FIELD.width - 220, panelY - 14);
    }
  }

  function drawAttitudeIndicator(plane, cx, cy, r) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-plane.roll);
    const pitchPx = Math.max(-r, Math.min(r, plane.pitch * r * 1.6));
    ctx.fillStyle = '#2f7fd0';
    ctx.fillRect(-r - 4, -r - 4 - pitchPx, r * 2 + 8, r + 4 + pitchPx);
    ctx.fillStyle = '#7a5a34';
    ctx.fillRect(-r - 4, pitchPx, r * 2 + 8, r + 4 - pitchPx + 4);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-r, pitchPx);
    ctx.lineTo(r, pitchPx);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#e8f2f8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    // Fixed wings marker.
    ctx.strokeStyle = COLOURS.hudAmber;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 18, cy);
    ctx.lineTo(cx - 5, cy);
    ctx.moveTo(cx + 5, cy);
    ctx.lineTo(cx + 18, cy);
    ctx.stroke();
    ctx.fillStyle = '#9fb8c8';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ATTITUDE', cx, cy + r + 13);
  }

  function drawDial(cx, cy, r, value, min, max, label, unit, format) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#0d121a';
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#e8f2f8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    // Tick marks, lit amber.
    for (let i = 0; i <= 10; i += 1) {
      const a = (-225 + i * 27) * DEG;
      const inner = i % 5 === 0 ? r - 10 : r - 6;
      ctx.strokeStyle = '#ffb347';
      ctx.lineWidth = i % 5 === 0 ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.stroke();
    }
    const frac = Math.max(0, Math.min(1, (value - min) / (max - min)));
    const angle = (-225 + frac * 270) * DEG;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * (r - 8), cy + Math.sin(angle) * (r - 8));
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(format(value), cx, cy + 5);
    ctx.fillStyle = '#9fb8c8';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText(`${label} ${unit}`, cx, cy + r + 13);
  }

  function drawThrottleBar(plane, x, y, w, h) {
    ctx.fillStyle = '#9fb8c8';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('THROTTLE', x, y + 10);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(x, y + 16, w, 14);
    ctx.fillStyle = COLOURS.hudAmber;
    ctx.fillRect(x, y + 16, w * plane.throttle, 14);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(`${Math.round(plane.throttle * 100)}%`, x, y + 48);
    ctx.fillStyle = '#9fb8c8';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText('SHIFT up / CTRL down', x, y + 66);
  }

  function drawRingCounter(world, x, y) {
    ctx.fillStyle = '#9fb8c8';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('MAIL RINGS', x, y + 10);
    for (let i = 0; i < world.rings.length; i += 1) {
      const rx = x + i * 20;
      ctx.strokeStyle = world.rings[i].passed ? COLOURS.ringGold : 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(rx + 8, y + 24, 7, 0, Math.PI * 2);
      ctx.stroke();
      if (world.rings[i].passed) {
        ctx.fillStyle = COLOURS.ringGold;
        ctx.beginPath();
        ctx.arc(rx + 8, y + 24, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(`${world.ringsPassed} / ${world.rings.length} rings`, x, y + 48);
    const next = nextRing(world);
    if (next) {
      ctx.fillStyle = '#9fb8c8';
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText('Next: ring ' + (next.index + 1), x, y + 66);
    } else {
      ctx.fillStyle = COLOURS.hudGreen;
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.fillText('All rings! Land on the strip', x, y + 66);
    }
  }

  function drawScoreBlock(world, x, y) {
    ctx.fillStyle = '#9fb8c8';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('SCORE', x, y + 10);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText(String(Math.floor(world.score)), x, y + 40);
    ctx.fillStyle = '#9fb8c8';
    ctx.font = '11px system-ui, sans-serif';
    const minutes = Math.floor(world.timeSeconds / 60);
    const seconds = Math.floor(world.timeSeconds % 60);
    ctx.fillText(`TIME ${minutes}:${String(seconds).padStart(2, '0')}   BEST ${Math.floor(world.best)}`, x, y + 62);
  }

  function drawHud(world, time) {
    const plane = world.plane;
    drawHudBox(16, 12, 'ALTITUDE', Math.round(plane.y * 3.28084), 'ft', '#ffffff');
    drawHudBox(176, 12, 'AIRSPEED', Math.round(plane.speedKnots), 'kt', plane.stalled ? COLOURS.hudRed : '#ffffff');
    drawHudBox(336, 12, 'HEADING', String(Math.round(plane.heading)).padStart(3, '0'), 'deg', '#ffffff');
    drawCompassStrip(plane);
    drawFuelGauge(world, FIELD.width - 206, 12);
    drawInstruments(world, time);
    if (world.messageTimer > 0 && world.message) {
      ctx.fillStyle = 'rgba(10, 16, 24, 0.78)';
      const w = ctx.measureText(world.message).width + 36;
      ctx.fillRect(FIELD.width / 2 - w / 2, 96, w, 36);
      ctx.strokeStyle = COLOURS.ringGold;
      ctx.strokeRect(FIELD.width / 2 - w / 2, 96, w, 36);
      ctx.fillStyle = COLOURS.ringGlow;
      ctx.font = 'bold 17px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(world.message, FIELD.width / 2, 120);
    }
  }

  function drawOverlayPanel(title, lines, accent) {
    ctx.fillStyle = 'rgba(8, 12, 18, 0.72)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    const w = 640;
    const h = 120 + lines.length * 30;
    const x = (FIELD.width - w) / 2;
    const y = (FIELD.height - h) / 2;
    ctx.fillStyle = '#10151d';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = accent || COLOURS.hudAmber;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = accent || COLOURS.hudAmber;
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, FIELD.width / 2, y + 56);
    ctx.fillStyle = '#e8f2f8';
    ctx.font = '17px system-ui, sans-serif';
    lines.forEach((line, i) => {
      ctx.fillText(line, FIELD.width / 2, y + 96 + i * 30);
    });
  }

  function drawTitle(world) {
    ctx.fillStyle = 'rgba(8, 12, 18, 0.45)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 58px system-ui, sans-serif';
    ctx.fillText('KAKATUA AIRMAIL', FIELD.width / 2, 150);
    ctx.fillStyle = COLOURS.ringGlow;
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillText('Coral Ring Run — fly the mail over the archipelago', FIELD.width / 2, 192);
    ctx.fillStyle = '#e8f2f8';
    ctx.font = '18px system-ui, sans-serif';
    ctx.fillText('Fly through all 8 golden mail rings, then land on the coral strip.', FIELD.width / 2, 250);
    ctx.fillText('Rings refill your tank. Mind the hills, the sea — and your fuel.', FIELD.width / 2, 278);
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.fillText('← → bank & turn    ↑ ↓ pitch    SHIFT throttle up    CTRL throttle down', FIELD.width / 2, 330);
    ctx.fillText('Mouse: hold and steer    P pause    R restart    M mute', FIELD.width / 2, 358);
    const blink = Math.sin(world.titleTime * 4) > -0.2;
    if (blink) {
      ctx.fillStyle = COLOURS.hudAmber;
      ctx.font = 'bold 24px system-ui, sans-serif';
      ctx.fillText('PRESS SPACE OR CLICK TO FLY THE ROUTE', FIELD.width / 2, 430);
    }
    if (world.best > 0) {
      ctx.fillStyle = '#9fb8c8';
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillText(`Best score: ${Math.floor(world.best)}`, FIELD.width / 2, 470);
    }
  }

  /** Paint one frame: world state plus the screen (title/play/paused/won/crashed). */
  function draw(world, screen, time) {
    const camera = cameraBasis(world.plane);
    drawSky(camera, world, time);
    drawTerrain(camera, world);
    drawRunway(camera, world);
    drawRings(camera, world, time);
    if (screen !== SCREEN_TITLE) drawPlane(world.plane, time);
    if (screen === SCREEN_TITLE) {
      drawTitle(world);
      return;
    }
    drawHud(world, time);
    if (screen === SCREEN_PAUSED) {
      drawOverlayPanel('PAUSED', ['Press P or Space to keep flying.', 'R restarts the sortie.'], COLOURS.hudAmber);
    } else if (screen === SCREEN_WON) {
      const lines = [
        `Score ${Math.floor(world.score)}${world.landingSoft ? ' — soft landing bonus!' : ''}`,
        `Rings ${world.ringsPassed}/${world.rings.length}   Fuel ${Math.round(world.fuel)}%`,
        'The mail is delivered. Press R to fly again.',
      ];
      drawOverlayPanel('DELIVERED!', lines, COLOURS.hudGreen);
    } else if (screen === SCREEN_CRASHED) {
      const lines = [
        world.crashReason,
        `Score ${Math.floor(world.score)}   Rings ${world.ringsPassed}/${world.rings.length}`,
        'Press R to try the route again.',
      ];
      drawOverlayPanel('CRASHED', lines, COLOURS.hudRed);
    }
  }

  return { draw };
}
