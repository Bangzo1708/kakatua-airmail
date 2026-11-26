// All sound is synthesised with WebAudio — no audio files, no network.
// An engine drone follows the throttle, wind rises with speed, and short
// blips mark rings, warnings, landings and crashes.

let audioCtx = null;
let engineOsc = null;
let engineGain = null;
let engineFilter = null;
let windSource = null;
let windGain = null;
let windFilter = null;
let muted = false;

/** Create the audio graph on first user gesture; safe to call any time. */
export function ensureAudio() {
  if (audioCtx) {
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    return true;
  }
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    audioCtx = new Ctx();
    engineOsc = audioCtx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineFilter = audioCtx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 320;
    engineGain = audioCtx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(audioCtx.destination);
    engineOsc.start();

    const length = audioCtx.sampleRate * 2;
    const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    windSource = audioCtx.createBufferSource();
    windSource.buffer = buffer;
    windSource.loop = true;
    windFilter = audioCtx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 500;
    windGain = audioCtx.createGain();
    windGain.gain.value = 0;
    windSource.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(audioCtx.destination);
    windSource.start();
    return true;
  } catch {
    return false;
  }
}

/** Follow the plane: engine pitch with throttle, wind with airspeed. */
export function updateEngineSound(throttle, speedKnots, airborne) {
  if (!audioCtx || muted) return;
  const t = audioCtx.currentTime;
  engineOsc.frequency.setTargetAtTime(52 + throttle * 68, t, 0.1);
  engineFilter.frequency.setTargetAtTime(280 + throttle * 900, t, 0.1);
  engineGain.gain.setTargetAtTime(airborne ? 0.035 + throttle * 0.05 : 0.02 + throttle * 0.03, t, 0.1);
  windGain.gain.setTargetAtTime(Math.min(0.09, Math.max(0, speedKnots - 40) * 0.0009), t, 0.15);
  windFilter.frequency.setTargetAtTime(380 + speedKnots * 4, t, 0.2);
}

/** Silence the engine and wind (game over, pause, mute). */
export function silenceEngine() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  engineGain.gain.setTargetAtTime(0, t, 0.08);
  windGain.gain.setTargetAtTime(0, t, 0.08);
}

function blip(frequency, duration, type, volume, when = 0) {
  if (!audioCtx || muted) return;
  const t = audioCtx.currentTime + when;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(volume, t + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + duration + 0.05);
}

/** Two-note chime when a ring is flown through. */
export function playRingChime(perfect) {
  blip(880, 0.22, 'sine', 0.16);
  blip(1318, 0.34, 'sine', 0.14, 0.09);
  if (perfect) blip(1760, 0.4, 'sine', 0.12, 0.18);
}

/** Low warning buzz for low fuel or a stall. */
export function playWarning() {
  blip(196, 0.3, 'square', 0.07);
  blip(196, 0.3, 'square', 0.07, 0.18);
}

/** A soft thud and a happy arpeggio for a landing. */
export function playLanding(soft) {
  blip(120, 0.25, 'triangle', 0.2);
  blip(523, 0.2, 'sine', 0.12, 0.12);
  blip(659, 0.2, 'sine', 0.12, 0.24);
  blip(784, 0.36, 'sine', 0.13, 0.36);
  if (soft) blip(1046, 0.4, 'sine', 0.1, 0.5);
}

/** Noise burst and a falling tone for a crash. */
export function playCrash() {
  if (!audioCtx || muted) return;
  const t = audioCtx.currentTime;
  const length = audioCtx.sampleRate * 0.5;
  const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  const gain = audioCtx.createGain();
  gain.gain.value = 0.3;
  source.connect(gain);
  gain.connect(audioCtx.destination);
  source.start(t);
  blip(220, 0.6, 'sawtooth', 0.1);
}

/** M toggles mute. */
export function toggleMute() {
  muted = !muted;
  if (muted) silenceEngine();
  return muted;
}
