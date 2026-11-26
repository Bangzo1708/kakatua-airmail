// Keyboard and mouse input: arrows or WASD fly the plane, Shift/Ctrl work
// the throttle, Space or a click starts and pauses. The mouse steers too:
// moving it left or right banks, up or down pitches, while it is held down.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;

const KEY_ROLL_LEFT = ['ArrowLeft', 'a', 'A'];
const KEY_ROLL_RIGHT = ['ArrowRight', 'd', 'D'];
const KEY_PITCH_UP = ['ArrowDown', 's', 'S'];
const KEY_PITCH_DOWN = ['ArrowUp', 'w', 'W'];
const KEY_THROTTLE_UP = ['Shift'];
const KEY_THROTTLE_DOWN = ['Control'];
const KEY_CONFIRM = [' ', 'Enter'];
const KEY_PAUSE = ['p', 'P', 'Escape'];
const KEY_RESTART = ['r', 'R'];

/** Read the held keys and mouse into a control frame the world can step. */
export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseDown = false;
  let mouseX = 0;
  let mouseY = 0;

  function onKeyDown(event) {
    if (KEY_CONFIRM.includes(event.key)) actions |= ACTION_CONFIRM;
    if (KEY_PAUSE.includes(event.key)) actions |= ACTION_PAUSE;
    if (KEY_RESTART.includes(event.key)) actions |= ACTION_RESTART;
    keys.add(event.key);
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(event.key)) event.preventDefault();
  }
  function onKeyUp(event) {
    keys.delete(event.key);
  }
  function onMouseDown(event) {
    mouseDown = true;
    mouseX = event.clientX;
    mouseY = event.clientY;
    actions |= ACTION_CONFIRM;
  }
  function onMouseMove(event) {
    mouseX = event.clientX;
    mouseY = event.clientY;
  }
  function onMouseUp() {
    mouseDown = false;
  }
  function onBlur() {
    keys.clear();
    mouseDown = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);

  function held(list) {
    return list.some((key) => keys.has(key));
  }

  return {
    /** One-shot actions since the last call (start, pause, restart). */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** Steering for this frame: roll, pitch and throttle change, each -1..1. */
    control() {
      let roll = 0;
      let pitch = 0;
      if (held(KEY_ROLL_LEFT)) roll -= 1;
      if (held(KEY_ROLL_RIGHT)) roll += 1;
      if (held(KEY_PITCH_UP)) pitch += 1;
      if (held(KEY_PITCH_DOWN)) pitch -= 1;
      if (mouseDown) {
        const rect = canvas.getBoundingClientRect();
        const nx = (mouseX - rect.left) / rect.width - 0.5;
        const ny = (mouseY - rect.top) / rect.height - 0.5;
        roll += Math.max(-1, Math.min(1, nx * 2.4));
        pitch += Math.max(-1, Math.min(1, -ny * 2.4));
      }
      let throttleDelta = 0;
      if (held(KEY_THROTTLE_UP)) throttleDelta += 1;
      if (held(KEY_THROTTLE_DOWN)) throttleDelta -= 1;
      if (mouseDown) throttleDelta += 0.35;
      return {
        roll: Math.max(-1, Math.min(1, roll)),
        pitch: Math.max(-1, Math.min(1, pitch)),
        throttleDelta,
      };
    },
  };
}
