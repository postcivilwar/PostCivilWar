// Places the town's advertising billboards: five hundred of them, along the roads, at the airport, by the market
// and at the bridge, each where a real one would stand.
//
//   node tools/billboards/place.mjs        writes src/sim/zones/atani-billboards.js and api/_lib/billboards.json
//
// Run it again only to change the billboards; each keeps the identity it is given here (BB-001 ...), which is what
// an advertising campaign is booked against, so once campaigns exist the placements are not to be redrawn.
//
// What a placement must be (each checked here, and again by test/billboards.test.mjs):
//   - its poles, legs or base on open ground: not on a road, a plot, a path people walk, in a building or a
//     compound, in the river, at the airport's airside, nor where the land rises into hills beyond the town;
//   - its face not over a road, a building, a plot, a tree, nor another billboard;
//   - facing the road it stands by, set back from it, the bigger the further.
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BILLBOARD_TYPES, categoryOf, faceOf, feetOf } from '../../src/sim/billboards.js';
import * as Z from '../../src/sim/zone.js';
import { graphIndex, graphPoint } from '../../src/sim/graph.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TARGET = { tv: 20, xl: 60, large: 120, medium: 150, small: 150 };

// ---- a little geometry ----
let seed = 0x5eed1;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const inBox = (b, x, z, m = 0) => x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m;
const toWorld = (X, Z0, h, lx, lz) => ({ x: X + lx * Math.cos(h) + lz * Math.sin(h), z: Z0 - lx * Math.sin(h) + lz * Math.cos(h) });
const segDist = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l)); return Math.hypot(px - (ax + t * dx), pz - (az + t * dz)); };

// ---- what is there already ----
const roads = [...Z.ZONE_ROADS, ...Z.OUTSKIRT_ROADS];
const colliders = Z.ZONE_COLLIDERS.filter((c) => !c.billboard);
const trees = Z.ZONE_TREES;
const footprints = [
  ...Z.ZONE_BUILDINGS.map((b) => ({ x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 })),
  ...Z.ZONE_HOUSES.map((b) => ({ x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 })),
  ...Z.ZONE_SHEDS.map((b) => ({ x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 })),
  ...Z.ZONE_COMPOUNDS.map((c) => ({ x0: c.x0, x1: c.x1, z0: c.z0, z1: c.z1 })),
  ...Object.values(Z.ZONE_FARMLAND),
  ...Z.ZONE_PARCELS.map((p) => ({ x0: p.x0, x1: p.x1, z0: p.z0, z1: p.z1 })),
  ...Z.ZONE_STALLS.map((s) => ({ x0: s.x - 3, x1: s.x + 3, z0: s.z - 3, z1: s.z + 3 })),
  ...Z.OUTSKIRT_BUILDINGS.map((b) => ({ x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 })),
  Z.AIRPORT.terminal, Z.AIRPORT.admin, Z.AIRPORT.fire,
  { x0: Z.AIRPORT.tower.x - 5, x1: Z.AIRPORT.tower.x + 5, z0: Z.AIRPORT.tower.z - 5, z1: Z.AIRPORT.tower.z + 5 },
  { x0: Z.AIRPORT.fence.x0 - 2, x1: Z.AIRPORT.fence.x1 + 2, z0: Z.AIRPORT.fence.z0 - 2, z1: Z.AIRPORT.fence.z1 + 2 },   // the airside: nothing
  { x0: Z.BRIDGE.x0 - 6, x1: Z.BRIDGE.x1 + 6, z0: Z.BRIDGE.start - 4, z1: 1e4 },                                      // the bridge and beyond
  { x0: -60, x1: -10, z0: 80, z1: 112 },                                                                                 // the motor park's own ground, and where the game begins
];
const edges = Z.ZONE_EDGES.map(([a, b]) => { const p = graphPoint(graphIndex(a)), q = graphPoint(graphIndex(b)); return [p[0], p[1], q[0], q[1]]; }).filter((e) => e.every(Number.isFinite));
const spots = Z.ZONE_SPOTS.filter((s) => !s.inside);
// the land beyond the town is flat within this distance of where people go (render-outskirts.js, buildGround)
const awayFromAreas = (x, z) => { let best = Infinity; for (const a of Z.OUTSKIRT_AREAS) best = Math.min(best, Math.hypot(Math.max(a.x0 - x, 0, x - a.x1), Math.max(a.z0 - z, 0, z - a.z1))); return best; };
const TOWN = Z.ZONE.bounds;

function groundOK(x, z) {
  if (x > -232) {
    // the town: on its land, not in the river, not in a room
    if (x < TOWN.minX + 3 || x > TOWN.maxX - 3 || z < TOWN.minZ + 3 || z > TOWN.maxZ - 3) return false;
    if (z > Z.zoneShoreZ(x) - 4 || Z.zoneSwimmable(x, z)) return false;
    if (Z.zoneRoomAt(x, z)) return false;
    return true;
  }
  // beyond it: on the drawn ground, where it is flat
  if (x < -1325 || z < -655 || z > 110) return false;
  if (Z.zoneGroundY(x, z) !== 0) return false;
  return awayFromAreas(x, z) < 36;
}

// Does a placement fit? `placed` are those already made.
function fits(type, scale, X, Z0, h, placed) {
  const t = BILLBOARD_TYPES[type], face = faceOf(type, scale);
  // the supports
  for (const f of feetOf(type, scale)) {
    const pts = f.r !== undefined ? [[f.x, f.z]] : [[f.x - f.w / 2, f.z - f.d / 2], [f.x + f.w / 2, f.z - f.d / 2], [f.x - f.w / 2, f.z + f.d / 2], [f.x + f.w / 2, f.z + f.d / 2], [f.x, f.z]];
    if (f.w) for (let a = -0.5; a <= 0.5; a += 0.125) for (let b = -0.5; b <= 0.5; b += 0.25) pts.push([f.x + a * f.w, f.z + b * f.d]);
    const pad = (f.r || 0.5) + 1.5;
    for (const [lx, lz] of pts) {
      const p = toWorld(X, Z0, h, lx, lz);
      if (!groundOK(p.x, p.z)) return false;
      if (roads.some((r) => inBox(r, p.x, p.z, pad + 1))) return false;
      if (colliders.some((c) => inBox(c, p.x, p.z, pad))) return false;
      if (footprints.some((c) => inBox(c, p.x, p.z, pad))) return false;
      if (p.x > -232 && edges.some((e) => segDist(p.x, p.z, ...e) < pad + 0.6)) return false;
      if (spots.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < pad + 1.5)) return false;
      if (trees.some((tr) => Math.hypot(tr.x - p.x, tr.z - p.z) < pad + 1)) return false;
    }
  }
  // the face, and the frame round it, from above: not over a road, a building, a tree or another billboard
  const W = face.width + (t.truss ? 2.4 * scale : 0.6) + (t.supports === 'mast' ? 2.5 : 0), D = t.footprint ? t.footprint.d * scale : 2.6 * scale + 0.6;
  const cz = t.footprint ? -t.footprint.d / 2 + 0.6 : -0.8 * scale;
  for (let a = -0.5; a <= 0.5001; a += Math.min(0.5, 1.2 / W)) for (let b = -0.5; b <= 0.5001; b += 0.5) {
    const p = toWorld(X, Z0, h, a * W, cz + b * D);
    if (roads.some((r) => inBox(r, p.x, p.z, 0.4))) return false;
    if (footprints.some((c) => inBox(c, p.x, p.z, 0.6))) return false;
    if (colliders.some((c) => inBox(c, p.x, p.z, 0.3))) return false;
    if (trees.some((tr) => Math.hypot(tr.x - p.x, tr.z - p.z) < 2.6)) return false;
    if (!groundOK(p.x, p.z) && p.x < -232) return false;
    for (const q of placed) if (Math.hypot(q.x - p.x, q.z - p.z) < q.reach + 3) {
      // near another: closer than its own outline and a gap
      const ql = { x: (p.x - q.x) * Math.cos(q.heading) - (p.z - q.z) * Math.sin(q.heading), z: (p.x - q.x) * Math.sin(q.heading) + (p.z - q.z) * Math.cos(q.heading) };
      if (Math.abs(ql.x) < q.W / 2 + 3 && Math.abs(ql.z - q.cz) < q.D / 2 + 3) return false;
    }
  }
  return { W, D, cz, reach: Math.hypot(W, D) / 2 + 1 };
}

// ---- where each kind goes ----
// Roads by kind of place. Weights: how much of each category to look for along each.
const ROAD = (id) => roads.find((r) => r.id === id);
const MAIN_TOWN = ['waterside', 'market', 'registry', 'yard', 'campus', 'college', 'close'];
const LANES = roads.filter((r) => r.id.startsWith('lane') || r.id === 'farm' || r.id === 'farm-n' || r.id === 'link').map((r) => r.id);
const AIRPORT = ['airport-access', 'airport-front', 'airport-park'];
const WHERE = {
  tv: [['onitsha', 5], ['airport-access', 4], ['airport-front', 3], ['market', 2], ['waterside', 3], ['registry', 2]],
  xl: [['onitsha', 10], ['airport-access', 2], ['registry', 1], ['waterside', 1]],
  large: [['onitsha', 8], ['airport-access', 2], ['airport-front', 1], ['registry', 2], ['waterside', 2], ['market', 1], ['campus', 1], ['yard', 1]],
  medium: [['onitsha', 5], ...AIRPORT.map((id) => [id, 1]), ...MAIN_TOWN.map((id) => [id, 1.4])],
  small: [['onitsha', 3], ...AIRPORT.map((id) => [id, 1]), ...MAIN_TOWN.map((id) => [id, 1.2]), ...LANES.map((id) => [id, 0.5])],
};
const pick = (list) => { const total = list.reduce((s, [, w]) => s + w, 0); let r = rand() * total; for (const [v, w] of list) { r -= w; if (r <= 0) return v; } return list[list.length - 1][0]; };

// the kinds and sizes that make each category
const COMBOS = {};
for (const [id, t] of Object.entries(BILLBOARD_TYPES)) for (const s of t.scales) { const f = faceOf(id, s); const c = categoryOf(f.width, f.height, !!t.tv); (COMBOS[c] = COMBOS[c] || []).push([id, s]); }
// (the digital kinds in the numbers the owner's photographs suggest: the tall unipole most, two buildings)
const TV_MIX = { 'tv-unipole': 6, 'tv-tower': 4, 'tv-curved': 4, 'tv-chrome': 4, 'tv-building': 2 };
const SETBACK = { small: 3.2, medium: 4.5, large: 6.5, xl: 8, tv: 7 };

const placed = [];
function place(category, combo, roadIds) {
  for (let attempt = 0; attempt < 30000; attempt += 1) {
    const road = ROAD(pick(roadIds));
    if (!road) continue;
    const [type, scale] = combo || COMBOS[category][Math.floor(rand() * COMBOS[category].length)];
    const t = BILLBOARD_TYPES[type];
    const along = road.x1 - road.x0 > road.z1 - road.z0;
    const side = rand() < 0.5 ? -1 : 1;
    const back = SETBACK[category] * (0.9 + rand() * 0.8) + (t.footprint ? t.footprint.d * 0.1 : 0);
    const u = rand();
    let X, Z0, h;
    if (along) { X = road.x0 + 4 + u * (road.x1 - road.x0 - 8); Z0 = side > 0 ? road.z1 + back : road.z0 - back; h = side > 0 ? Math.PI : 0; }
    else { Z0 = road.z0 + 4 + u * (road.z1 - road.z0 - 8); X = side > 0 ? road.x1 + back : road.x0 - back; h = side > 0 ? -Math.PI / 2 : Math.PI / 2; }
    // on a main road out of town, turned a little toward the traffic coming at it (it drives on the right)
    if (road.id === 'onitsha' || road.id === 'airport-access') h += side * (along ? 1 : -1) * (0.35 + rand() * 0.2);
    const fit = fits(type, scale, X, Z0, h, placed);
    if (!fit) continue;
    placed.push({ type, scale, category, x: X, z: Z0, heading: h, road: road.id, ...fit });
    return true;
  }
  return false;
}

for (const [type, n] of Object.entries(TV_MIX)) for (let i = 0; i < n; i += 1) if (!place('tv', [type, 1], type === 'tv-building' ? [['onitsha', 1], ['airport-access', 1]] : WHERE.tv)) console.log('no room for a', type);
for (const category of ['xl', 'large', 'medium', 'small']) {
  let n = 0;
  while (n < TARGET[category] && place(category, null, WHERE[category])) n += 1;
  if (n < TARGET[category]) console.log(`only ${n} ${category}`);
}

// ---- the record ----
const roadName = (id) => (ROAD(id) || {}).name || '';
const label = (b) => {
  if (b.road === 'onitsha') return `${roadName('onitsha')}, ${Math.round((-232 - b.x) / 10) * 10} m out of town`;
  if (AIRPORT.includes(b.road)) return `Asaba Airport, ${roadName(b.road)}`;
  if (b.road === 'market' && b.z > 15 && b.z < 105) return 'Market Road, by the market';
  if (b.road === 'waterside' && b.x < -150) return 'Waterside Road, by the bridge';
  return `${roadName(b.road)}, Asaba`;
};
const region = (b) => (b.road === 'onitsha' ? 'road' : AIRPORT.includes(b.road) ? 'airport' : 'town');
const ORDER = { airport: 0, road: 1, town: 2 };
placed.sort((a, b) => ORDER[region(a)] - ORDER[region(b)] || a.x - b.x || a.z - b.z);
const r1 = (v) => Math.round(v * 10) / 10;
const list = placed.map((b, i) => {
  const face = faceOf(b.type, b.scale);
  const feet = feetOf(b.type, b.scale).map((f) => {
    const hw = f.r !== undefined ? f.r : f.w / 2, hd = f.r !== undefined ? f.r : f.d / 2;
    const corners = [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]].map(([a, c]) => toWorld(b.x, b.z, b.heading, f.x + a, f.z + c));
    return [Math.min(...corners.map((p) => p.x)), Math.min(...corners.map((p) => p.z)), Math.max(...corners.map((p) => p.x)), Math.max(...corners.map((p) => p.z))].map(r1);
  });
  return { id: `BB-${String(i + 1).padStart(3, '0')}`, type: b.type, scale: b.scale, category: b.category, tv: !!BILLBOARD_TYPES[b.type].tv, width: face.width, height: face.height, bottom: face.bottom, x: r1(b.x), z: r1(b.z), heading: Math.round(b.heading * 1000) / 1000, region: region(b), place: label(b), feet };
});
const counts = {};
for (const b of list) counts[b.category] = (counts[b.category] || 0) + 1;
const byType = {};
for (const b of list) byType[b.type] = (byType[b.type] || 0) + 1;
console.log(list.length, 'billboards', JSON.stringify(counts));
console.log(JSON.stringify(byType));

const lines = list.map((b) => `  ${JSON.stringify(b)},`).join('\n');
writeFileSync(resolve(root, 'src/sim/zones/atani-billboards.js'), `// Written by tools/billboards/place.mjs: do not edit by hand. The town's advertising billboards: each one's\n// identity (what a campaign is booked against), kind, size and category, where it stands and which way it faces,\n// where it is (for a person), and the ground its supports take up.\nexport const ZONE_BILLBOARDS = Object.freeze([\n${lines}\n].map((b) => Object.freeze({ ...b, feet: Object.freeze(b.feet.map(Object.freeze)) })));\n`);
// the server's copy: what it needs to take a booking (it is not built from the game's code; a test checks the two agree)
writeFileSync(resolve(root, '../api/_lib/billboards.json'), `${JSON.stringify(list.map(({ id, type, category, tv, width, height, region: r, place: p }) => ({ id, type, name: BILLBOARD_TYPES[type].name, category, tv, width, height, region: r, place: p, sides: BILLBOARD_TYPES[type].sides || 1 })), null, 0).replace(/},{/g, '},\n{')}\n`);
