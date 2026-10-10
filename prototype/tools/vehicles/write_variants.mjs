// Writes the catalogue of looks beside the models, for anyone working on the assets outside the game.
//
//   node tools/vehicles/write_variants.mjs
//
// The catalogue itself lives in src/sim/vehicle-looks.js; these files are a copy.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VEHICLE_MODELS, KEKE_TRIMS, KEKE_PAINTS, KEKE_CANOPIES, KEKE_SEATS, KEKE_FLOORS, KEKE_SLOGANS, KEKE_EXTRAS, BUS_LIVERIES, BUS_CABINS, BUS_OPERATORS, BUS_ROUTES, BUS_EXTRAS, variantSheet, resolveLook } from '../../src/sim/vehicle-looks.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../assets/vehicles');
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const colours = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? hex(v) : colours(v)]));
const sheet = (model) => variantSheet(model).map((v) => { const r = resolveLook(v.look); return { name: v.name, model: `canonical ${model}`, trim: r.trim, colours: colours(r.colours), wear: r.wear, dirt: r.dirt, markings: r.texts, extras: r.extras }; });

mkdirSync(resolve(root, 'keke/variants'), { recursive: true });
mkdirSync(resolve(root, 'bus/variants'), { recursive: true });
writeFileSync(resolve(root, 'keke/variants/variants.json'), `${JSON.stringify({
  model: 'canonical_keke.glb', size: VEHICLE_MODELS.keke,
  fronts: Object.fromEntries(Object.entries(KEKE_TRIMS).map(([id, name]) => [id, { name, file: id === 'modern' ? 'canonical_keke.glb' : `canonical_keke_${id}.glb` }])),
  paint: KEKE_PAINTS.map((p) => ({ id: p.id, name: p.name, colour: hex(p.paint) })), canopy: colours(KEKE_CANOPIES), seat: colours(KEKE_SEATS), floor: colours(KEKE_FLOORS),
  slogans: KEKE_SLOGANS, extras: KEKE_EXTRAS, sheet: sheet('keke'),
}, null, 1)}\n`);
writeFileSync(resolve(root, 'bus/variants/variants.json'), `${JSON.stringify({
  model: 'canonical_ivm_bus.glb', size: VEHICLE_MODELS.bus,
  liveries: BUS_LIVERIES.map((l) => ({ id: l.id, name: l.name, lower: hex(l.paint), upper: hex(l.paint2), lettering: hex(l.accent) })), cabins: colours(BUS_CABINS),
  operators: BUS_OPERATORS, routes: BUS_ROUTES, extras: BUS_EXTRAS, sheet: sheet('bus'),
}, null, 1)}\n`);
console.log('wrote keke/variants/variants.json and bus/variants/variants.json');
