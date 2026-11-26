// Every tuning number and colour of Kakatua Airmail in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to
// the window, so no rule below depends on the screen size.
export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Sea level sits at y = 0; heights above it are metres. */
export const SEA_LEVEL = 0;

/** The mail route: eight golden rings, then the coral airstrip at the end. */
export const RING_COUNT = 8;
export const RING_RADIUS = 26;
export const RING_POINTS = 250;
export const RING_FUEL_BONUS = 14;

export const PLANE = {
  /** Knots at full throttle, level flight. */
  cruiseKnots: 132,
  maxKnots: 168,
  /** Below this the wings stop flying and the nose drops. */
  stallKnots: 58,
  /** Fastest safe touchdown speed, knots. */
  landMaxKnots: 92,
  /** Slowest safe touchdown speed, knots. */
  landMinKnots: 52,
  climbRate: 9.5,
  sinkRate: 6.0,
  turnRate: 0.62,
  rollRate: 2.4,
  pitchRate: 0.55,
  /** Metres of altitude the plane starts with, already in the air. */
  startAltitude: 130,
};

export const FUEL = {
  start: 100,
  /** Percent burned per second at full throttle. */
  burnFull: 1.15,
  burnIdle: 0.32,
  /** Warning light comes on below this. */
  lowAt: 25,
};

export const SCORE = {
  ring: RING_POINTS,
  /** Points per second of smooth flight above 100 knots. */
  cruisePerSecond: 2,
  landing: 500,
  /** Bonus for a gentle touchdown (vertical speed under 2 m/s). */
  softLanding: 300,
  perfectRing: 100,
};

export const WORLD = {
  /** The corridor the route runs through, in metres. */
  halfWidth: 1500,
  length: 6200,
  /** Terrain grid cell size, metres. */
  cell: 120,
  /** How far ahead terrain is drawn, metres. */
  viewDistance: 2600,
};

/** The coral airstrip: a flat island at the end of the route. */
export const RUNWAY = {
  x: 0,
  z: 5900,
  /** Runway heading, degrees (north = 0, the route flies north). */
  heading: 0,
  length: 620,
  width: 46,
};

export const COLOURS = {
  skyTop: '#1d5fa8',
  skyMid: '#7ec3e8',
  skyHorizon: '#cfeef7',
  sun: '#fff3c4',
  seaDeep: '#0a5e8a',
  seaShallow: '#2fb3c9',
  sand: '#f2dd9e',
  grass: '#5da244',
  forest: '#2f7a33',
  rock: '#8a7f74',
  snow: '#f4f7f7',
  volcano: '#5d4037',
  ringGold: '#ffc93c',
  ringGlow: '#ffdf7a',
  runway: '#3a3f46',
  runwayMark: '#f5f5f0',
  planeRed: '#d8443a',
  planeCream: '#fdf3d8',
  planeDark: '#2c2f36',
  hudAmber: '#ffb347',
  hudGreen: '#7dff9b',
  hudRed: '#ff5a4e',
  panel: '#10151d',
};

export const BEST_KEY = 'kakatua-airmail-best';
export const STORAGE_MISSIONS_KEY = 'kakatua-airmail-missions';
