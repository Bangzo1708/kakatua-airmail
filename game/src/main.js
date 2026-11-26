// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between five screens:
// title, play, paused, delivered and crashed.
//
// ?seed=N fixes the archipelago and the ring route. ?shot=start|play|ring|end
// (with &seed=N) stages that scene instead of running the loop, paints it
// twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, resetWorld, stepTitle, stepWorld, ensureClouds } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createRenderer, SCREEN_CRASHED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WON } from './render.js';
import { stageShot } from './shots.js';
import {
  ensureAudio,
  playCrash,
  playLanding,
  playRingChime,
  playWarning,
  silenceEngine,
  toggleMute,
  updateEngineSound,
} from './audio.js';
import { EVENT_CRASHED, EVENT_FUEL_LOW, EVENT_LANDED, EVENT_RING, EVENT_STALL } from './world.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const random = createRandom(seed);
const world = createWorld(random);
world.seed = seed;
ensureClouds(world);
const renderer = createRenderer(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  world.best = readBest();
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world, scene.screen, world.titleTime + 2.2);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  world.best = best;
  let accumulator = 0;
  let last = performance.now();
  let time = 0;

  // Screen readers (and anyone watching the page's text) hear the screen changes and each ring.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    ensureAudio();
    resetWorld(world, createRandom(seed));
    world.best = best;
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Flying. Eight rings, then land on the coral strip.');
  }

  function endGame(won) {
    if (won) {
      screen = SCREEN_WON;
      playLanding(world.landingSoft);
    } else {
      screen = SCREEN_CRASHED;
      playCrash();
    }
    silenceEngine();
    if (Math.floor(world.score) > best) {
      best = Math.floor(world.score);
      world.best = best;
      saveBest(best);
    }
    announce(won ? `Delivered! Score ${Math.floor(world.score)}.` : `Crashed. ${world.crashReason} Score ${Math.floor(world.score)}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_RESTART && screen !== SCREEN_TITLE) {
      startGame();
      return;
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_WON || screen === SCREEN_CRASHED)) {
      startGame();
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      silenceEngine();
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Flying.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      stepTitle(world, STEP);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const events = stepWorld(world, input.control(), STEP);
    if (events & EVENT_RING) {
      const ring = world.rings[world.ringsPassed - 1];
      playRingChime(ring && ring.perfect);
      announce(world.message);
    }
    if (events & EVENT_FUEL_LOW) playWarning();
    if (events & EVENT_STALL) playWarning();
    if (events & EVENT_LANDED) endGame(true);
    else if (events & EVENT_CRASHED) endGame(false);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    time += Math.min((now - last) / 1000, MAX_FRAME);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    if (screen === SCREEN_PLAY) {
      updateEngineSound(world.plane.throttle, world.plane.speedKnots, world.plane.airborne);
    }
    renderer.draw(world, screen, time);
  }

  // Leaving the tab pauses a running game rather than letting the plane fly unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      silenceEngine();
      announce('Paused.');
    }
  });

  // M mutes the synth; it is read here, not in input, so it never steers.
  window.addEventListener('keydown', (event) => {
    if (event.key === 'm' || event.key === 'M') {
      const isMuted = toggleMute();
      announce(isMuted ? 'Sound off.' : 'Sound on.');
    }
  });

  announce('Kakatua Airmail. Press Space or click to fly the route.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
