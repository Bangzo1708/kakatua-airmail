// Kakatua Airmail — Coral Ring Run: the hand-in program (Node 22, standard
// library only). The game is this directory's game/ folder: plain static
// files a desktop browser loads offline (game/index.html and its ES modules,
// no library, no network request), plus 3 or 4 screenshots of the game
// itself in screenshots/. This program copies both folders beside this file
// into the output directory and writes /output/dossier.json, the summary the
// judge reads, with the vendored make.fun library.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The two runs the grader performs must write the same bytes, so nothing
// here depends on the clock, the environment or the order the filesystem
// happens to list files: the copy is a plain recursive copy of fixed files,
// and buildDossier sorts what it reads before it writes.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's own caps (see the kit's gate): only text_max_bytes shapes the
// bytes buildDossier writes; the rest refuse an entry the scorer would refuse
// (more than 4 screenshots or one over 256 KiB; more than 993 files in game/
// or 48 MiB of game files in all; a path under game/ over 1000 bytes). The
// game counts beside /output's own 1000-entry cap, its screenshots/ and
// dossier.json, so the caps below leave that room.
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

/** Fail fast with a plain message when the hand-in is incomplete. */
function checkHandIn() {
  const gameDir = join(here, 'game');
  const index = join(gameDir, 'index.html');
  if (!existsSync(index) || !statSync(index).isFile()) {
    throw new Error('game/index.html is missing: the game cannot be handed in without it');
  }
  // The gate caps index.html itself at 1 MiB; the game keeps its code in
  // modules, so this should never trip, but fail here rather than at the gate.
  if (statSync(index).size > 1024 * 1024) {
    throw new Error('game/index.html is over 1 MiB: the gate refuses it');
  }
  const shotsDir = join(here, 'screenshots');
  if (!existsSync(shotsDir)) {
    throw new Error('screenshots/ is missing: 3 or 4 screenshots of the game are required');
  }
  const shots = readdirSync(shotsDir)
    .filter((name) => !name.startsWith('.'))
    .sort();
  if (shots.length < 3 || shots.length > 4) {
    throw new Error(`screenshots/ holds ${shots.length} images: the gate wants 3 or 4`);
  }
  for (const name of shots) {
    const size = statSync(join(shotsDir, name)).size;
    if (size > DOSSIER_CAPS.screenshots.max_bytes) {
      throw new Error(`screenshots/${name} is ${size} bytes: the gate caps each screenshot at 256 KiB`);
    }
  }
  return shots;
}

function handIn() {
  const shots = checkHandIn();
  mkdirSync(out, { recursive: true });
  cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
  mkdirSync(join(out, 'screenshots'), { recursive: true });
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
  const dossier = buildDossier(out, DOSSIER_CAPS);
  writeFileSync(join(out, 'dossier.json'), dossier);
  return { shots, dossierBytes: Buffer.byteLength(dossier, 'utf8') };
}

const result = handIn();
console.log(`Kakatua Airmail handed in: ${result.shots.length} screenshots, dossier.json ${result.dossierBytes} bytes.`);
