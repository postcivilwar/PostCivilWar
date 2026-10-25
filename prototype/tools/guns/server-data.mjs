// Writes what the website's server needs to know of the guns and of the town, from the game itself, beside the server:
//   api/_lib/guns-data.json   the guns (src/sim/guns.js): what each is and does, and the owner's one setting, the damage
//                             a round does; read by api/_lib/guns.js, so that the server and the game cannot differ
//   api/_lib/walls.json       what in the town is solid all the way up (zone.js, ZONE_COLLIDERS, less the low barriers
//                             that a round goes over): each a box on the ground, to the centimetre, for the server to
//                             find a wall between a shooter and the one they say they hit
// build.mjs runs this with each build (and test/server-data.test.mjs checks that the two files are as it would write
// them).
//
//   node tools/guns/server-data.mjs [--check]

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { GUN, GUNS, STARTER_GUN } from '../../src/sim/guns.js';
import { ZONE_COLLIDERS } from '../../src/sim/zone.js';

const API = new URL('../../../api/_lib/', import.meta.url);
const c = (v) => Math.round(v * 100) / 100;

export function gunsData() {
  return { note: 'Written by prototype/tools/guns/server-data.mjs from prototype/src/sim/guns.js. Do not edit by hand.', gun: GUN, guns: GUNS, starter: STARTER_GUN };
}
export function wallsData() {
  const boxes = ZONE_COLLIDERS.filter((b) => !b.barrier).map((b) => [c(b.x0), c(b.z0), c(b.x1), c(b.z1)]);
  return { note: 'Written by prototype/tools/guns/server-data.mjs from the town (prototype/src/sim/zone.js, ZONE_COLLIDERS without the low barriers). Do not edit by hand.', boxes };
}
export const files = () => [['guns-data.json', `${JSON.stringify(gunsData(), null, 1)}\n`], ['walls.json', `${JSON.stringify(wallsData())}\n`]];

if (import.meta.url === `file://${process.argv[1]}`) {
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const [name, text] of files()) {
    const at = new URL(name, API);
    const was = existsSync(at) ? readFileSync(at, 'utf8') : null;
    if (was === text) continue;
    stale += 1;
    if (check) console.log(`api/_lib/${name} is out of date`);
    else { writeFileSync(at, text); console.log(`written: api/_lib/${name} (${text.length} bytes)`); }
  }
  if (check && stale) process.exit(1);
}
