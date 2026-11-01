// Oganiru City's plan (31 October 2026): the game's map data written out for plan.py and draw.py (the maps of the
// city sent to the owner with the plan he said yes to). Grid metres, as zone.js has them.
//   node tools/city/dump.mjs <zone.json>
import * as Z from '../../src/sim/zone.js';
import { writeFileSync } from 'node:fs';
const out = {};
for (const k of Object.keys(Z).filter((name) => /^[A-Z_]+$/.test(name))) {
  try { const s = JSON.stringify(Z[k]); if (s && s.length < 3_000_000) out[k] = Z[k]; } catch (e) { /* (a function, or what will not be written) */ }
}
writeFileSync(process.argv[2] || 'zone.json', JSON.stringify(out));
console.log(Object.keys(out).length, 'names written');
