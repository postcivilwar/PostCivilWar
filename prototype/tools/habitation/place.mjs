// Where each of the owner's habitation models stands (and the rocks), written to src/sim/zones/habitation-scene.js:
// the same for every player and for the website, worked out once here from the habitation's own ground
// (habitation.js) and each model's measures (facts.json), by the rules of each place as its pictures show it.
//
//   node tools/habitation/place.mjs            (then: the simulation and the drawing both read the file it writes)
//
// Every one of the 49 models is used, most of them many times, turned and sized as such a plant or thing would be.
// What stands by a path stands off it (never on it: one keeps to the paths and they are clear); a tree's or a rock's
// solid part is as big as it is at the ground.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
// (the scene file is written by this tool: an empty one first, so that the habitation can be read without it)
const sceneFile = resolve(root, 'src/sim/zones/habitation-scene.js');
const H = await import(resolve(root, 'src/sim/zones/habitation.js'));
const facts = JSON.parse(readFileSync(resolve(here, 'facts.json'), 'utf8'));
const spec = JSON.parse(readFileSync(resolve(here, 'models.json'), 'utf8'));
const stem = (name) => name.replace('3dmodel', '').replace('.glb', '');
// (the model's own measures in its own units, and its real size in metres: `real`, a height or for a structure a length)
const FACT = Object.fromEntries(Object.entries(facts).map(([k, v]) => [stem(k), { ...spec.models[k], ...v, real: spec.models[k].height || spec.models[k].length, isLength: !spec.models[k].height, file: k }]));

// a repeatable chance
let seed = 20261020;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const pick = (list) => list[Math.floor(rand() * list.length)];
const between = (a, b) => a + (b - a) * rand();

const placed = [];
const near = (x, z, r) => placed.some((p) => Math.hypot(p.x - x, p.z - z) < r + (p.keep || 0));
// the nearest path's edge, and whether a point is on a path or a deck (or close to one)
function clearOfWays(x, z, clear) {
  for (const p of H.HABITATION_PATHS) {
    for (let i = 0; i + 1 < p.line.length; i += 1) {
      const [ax, az] = p.line[i], [bx, bz] = p.line[i + 1];
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      if (Math.hypot(ax + dx * t - x, az + dz * t - z) < p.width / 2 + clear) return false;
    }
  }
  for (const d of H.HABITATION_DECKS) {
    for (let i = 0; i + 1 < d.line.length; i += 1) {
      const [ax, az] = d.line[i], [bx, bz] = d.line[i + 1];
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      if (Math.hypot(ax + dx * t - x, az + dz * t - z) < d.width / 2 + clear) return false;
    }
    if (d.platform && Math.hypot(x - d.platform.x, z - d.platform.z) < d.platform.r + clear) return false;
  }
  return true;
}
const water = (x, z) => H.habitationWaterAt(x, z);
const ground = (x, z) => H.habitationLand(x, z);
const slope = (x, z) => Math.hypot(ground(x + 1, z) - ground(x - 1, z), ground(x, z + 1) - ground(x, z - 1)) / 2;
// can a thing stand here: off the ways by `clear`, not in water (unless `wet`: a mangrove, a swamp tree), not on a cliff
function standsAt(x, z, { clear = 1.2, wet = false, steep = 0.9, spacing = 2, above = -Infinity, below = Infinity, open = false } = {}) {
  const b = H.HABITATION.bounds;
  // (the open grass and the beaches are left open, as the pictures have them: only what is put there on purpose)
  if (!open) { const f = H.habitationFooting(x, z); if (f && (f.kind === 'grass' || f.kind === 'sand')) return false; }
  // (only on ground this high, or this low: the rim of a bowl, not its floor)
  const h = ground(x, z);
  if (h < above || h > below) return false;
  if (x < b.x0 + 4 || x > b.x1 - 2 || z < b.z0 + 2 || z > b.z1 - 2) return false;
  if (!clearOfWays(x, z, clear)) return false;
  const w = water(x, z);
  if (w && !wet) return false;
  if (wet && (!w || w.depth > (wet === true ? 2.4 : wet))) return false;
  if (slope(x, z) > steep) return false;
  if (near(x, z, spacing)) return false;
  // (not on the gate's car park side, nor in the river's open water)
  if (x < H.HABITATION.gate.x + 8 && z > 60) return false;
  return true;
}
// put one model: at its real size (`size`: its height, or for a structure its length), turned, solid as it is at the
// ground; `y` where it stands on something other than the ground (a pillar's top)
// the nearest point of any path or deck to a point
function nearestWay(x, z) {
  let best = null;
  for (const w of [...H.HABITATION_PATHS, ...H.HABITATION_DECKS]) {
    for (let i = 0; i + 1 < w.line.length; i += 1) {
      const [ax, az] = w.line[i], [bx, bz] = w.line[i + 1];
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      const qx = ax + dx * t, qz = az + dz * t, d = Math.hypot(qx - x, qz - z);
      if (!best || d < best.d) best = { d, x: qx, z: qz };
    }
  }
  return best;
}
function put(m, x, z, { size = null, turn = rand() * Math.PI * 2, solid = null, keep = 0, y = null, tag = '' } = {}) {
  const f = FACT[m];
  if (!f) throw new Error(`no model ${m}`);
  const s = size || f.real || 1;
  // its solid part: the trunk or base, at its real size (a little less: one brushes past leaves), at most 2.6 m
  const unit = s / (f.isLength ? f.across[1] : f.height);
  const hard = solid !== null ? solid : Math.min(2.6, Math.max(0, (f.kind === 'tree' || f.kind === 'palm' ? f.trunk_r : f.kind === 'shrub' ? f.base_r * 0.75 : f.kind === 'banana' ? f.trunk_r : 0) * unit));
  // (anything solid is never on a path or a deck, nor so near one that a walker brushes it: one put too near, by hand,
  // is moved off, straight away from the way, or left out)
  if (hard > 0 && !clearOfWays(x, z, hard + 0.45)) {
    const w = nearestWay(x, z);
    let ux = x - w.x, uz = z - w.z;
    const l = Math.hypot(ux, uz) || 1; ux /= l; uz /= l;
    for (let k = 0; k < 40 && !clearOfWays(x, z, hard + 0.45); k += 1) { x += ux * 0.25; z += uz * 0.25; }
    if (!clearOfWays(x, z, hard + 0.45)) return false;
  }
  placed.push({ m, x: +x.toFixed(2), z: +z.toFixed(2), y: y === null ? null : +y.toFixed(2), r: +turn.toFixed(3), s: +s.toFixed(2), solid: +hard.toFixed(2), keep, tag });
  return true;
}
// scatter `count` of `models` in a region (a test), each `spacing` from the rest
function scatter(models, count, region, rules = {}, sizes = null, tries = 40) {
  let n = 0;
  for (let k = 0; k < count * tries && n < count; k += 1) {
    const [x, z] = region();
    const m = pick(models);
    if (!standsAt(x, z, rules)) continue;
    const f = FACT[m];
    const size = sizes ? between(...sizes) : f.real * between(0.85, 1.15);
    put(m, x, z, { size, keep: rules.keep || 0, tag: rules.tag || '' });
    n += 1;
  }
  return n;
}
const disc = (cx, cz, r) => () => { const a = rand() * Math.PI * 2, d = r * Math.sqrt(rand()); return [cx + Math.cos(a) * d, cz + Math.sin(a) * d]; };
const rect = (x0, z0, x1, z1) => () => [between(x0, x1), between(z0, z1)];
// along a path: either side, `from`..`to` metres off its edge, every `every` metres
function alongPath(id, models, every, from, to, rules = {}, sizes = null) {
  const p = H.HABITATION_PATHS.find((q) => q.id === id) || H.HABITATION_DECKS.find((q) => q.id === id);
  let n = 0;
  for (let i = 0; i + 1 < p.line.length; i += 1) {
    const [ax, az] = p.line[i], [bx, bz] = p.line[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    for (let s = rand() * every; s < len; s += every * between(0.7, 1.3)) {
      const t = s / len, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      for (const side of [-1, 1]) {
        if (rand() < (rules.skip || 0.15)) continue;
        const off = p.width / 2 + between(from, to);
        const px = x - (bz - az) / len * side * off, pz = z + (bx - ax) / len * side * off;
        const m = pick(models);
        if (!standsAt(px, pz, { clear: from * 0.9, ...rules })) continue;
        const f = FACT[m];
        put(m, px, pz, { size: (sizes ? between(...sizes) : f.real * between(0.85, 1.15)), keep: rules.keep || 0, tag: rules.tag || id });
        n += 1;
      }
    }
  }
  return n;
}
const ROCK = { mossy: ['rock-mossy-0', 'rock-mossy-1', 'rock-mossy-2'], limestone: ['rock-limestone-0', 'rock-limestone-1', 'rock-limestone-2'], granite: ['rock-granite-0', 'rock-granite-1', 'rock-granite-2'], redstone: ['rock-redstone-0', 'rock-redstone-1', 'rock-redstone-2'] };
for (const [kind, list] of Object.entries(ROCK)) for (const r of list) FACT[r] = { kind: 'rock', height: 1, across: [1, 1], trunk_r: 0.42, base_r: 0.45, real: 1, isLength: true, base: [0, 0, 0], file: r };
// a rock: `size` metres across; solid as wide as it is
function rock(kind, x, z, size, { y = null, flat = false } = {}) {
  // (a flat slab is stepped on, not walked round)
  return put(pick(ROCK[kind]), x, z, { size, solid: flat ? 0 : size * 0.42, y, tag: flat ? 'flat' : 'rock' });
}
function rocksAlong(id, kind, every, from, to, sizes, rules = {}) {
  const p = H.HABITATION_PATHS.find((q) => q.id === id);
  for (let i = 0; i + 1 < p.line.length; i += 1) {
    const [ax, az] = p.line[i], [bx, bz] = p.line[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    for (let s = rand() * every; s < len; s += every * between(0.6, 1.4)) {
      const t = s / len, side = rand() < 0.5 ? -1 : 1, size = between(...sizes);
      const off = p.width / 2 + between(from, to) + size * 0.45;
      const px = ax + (bx - ax) * t - (bz - az) / len * side * off, pz = az + (bz - az) * t + (bx - ax) / len * side * off;
      if (standsAt(px, pz, { clear: size * 0.45 + 0.3, steep: 2, spacing: size * 0.7, ...rules })) rock(kind, px, pz, size);
    }
  }
}

// ======================================================================================= the places ==

const PALMS = ['palmtree_2', 'palmtree_3', 'palmtree_4', 'palmtree_5', 'coconutpalmtree', 'coconutpalmtree_1', 'coconutpalmtree_2', 'coconutpalmtree_3', 'coconutpalmtree_4'];
const LEANING = ['palmtree_4', 'palmtree_9', 'coconutpalm', 'palmtree_2', 'coconutpalmtree_3'];
const OIL = ['palmtree_6', 'palmtree_7', 'palmtree_8'];
const BIG = ['buttress-roottree', 'giantbuttress-roottree', 'buttressedtree', 'foresttree', 'tree'];
const TALL = ['talltree', 'slimtree', 'palmtree', 'palmtree_1'];
const UNDER = ['fernclump', 'fernplant_1', 'fernplant', 'bananaplant', 'bananaplant_1', 'bananaplant_2', 'monsteraplant', 'monsteraplant_1', 'monsteraplant_2', 'palmplant', 'fanpalmshrub', 'roundshrub', 'roundleafyshrub'];
const FERNS = ['fernclump', 'fernplant_1', 'fernplant'];
const BROAD = ['monsteraplant', 'monsteraplant_1', 'monsteraplant_2', 'palmplant', 'fanpalmshrub', 'bananaplant', 'bananaplant_1', 'bananaplant_2'];
const MANGROVES = ['mangrovetree', 'mangrovetree_1', 'mangrovetree_2', 'mangrovetree_3'];
const SHRUBS = ['roundshrub', 'roundleafyshrub'];

// ---- the owner's structures, where they belong
// the gazebo by the garden pool (picture 19), on its floor
put('tropicalgazebo', 2168, 389, { size: 4.6, turn: -Math.PI / 2 + 0.2, solid: 0, keep: 4, tag: 'gazebo' });
// the pool deck at the garden's south end, its pool looking out over the bay
put('tropicalpooldeck', 2138, 418, { size: 10, turn: Math.PI * 0.75, solid: 0, keep: 6, tag: 'pooldeck' });
// the bench on the hilltop, facing the view over the forest to the river (picture 10)
put('sceniclandscape', 1929, 22, { size: 1.8, turn: Math.atan2(2100 - 1929, 150 - 22) + Math.PI / 2, solid: 0.5, keep: 1, tag: 'bench' });
// the cliff with its waterfall and its stream, at the gorge's head (pictures 1, 7)
put('waterfalllandscape', 2486, -14, { size: 30, turn: Math.atan2(2420 - 2486, 60 + 14) + Math.PI, solid: 0, keep: 10, tag: 'gorge-head' });
// the boardwalk with its round platform in the swamp, the owner's (picture 12): its walk is the swamp's deck
put('woodenboardwalk', 2060, -82, { size: 34, turn: 0.35, solid: 0, keep: 8, tag: 'swamp-walk' });
// the suspension bridge across the outflow's gorge (pictures 9, 13): its deck is the bridge's (habitation.js)
{
  // His suspension bridge across the outflow's gorge: its own deck lies across the model at an angle (from x -0.18,
  // z -0.456 to x 0.145, z 0.352 in its own units, its planks' top from 0.066 at that end to 0.034 at this, lowest
  // 0.013 a little past its middle), so it is turned and placed so that its planks run from one path's end to the
  // other's, and made long enough to span the gorge (26.5 m along its length; as supplied, 16 m); the walk on it
  // (habitation.js, 'suspension-bridge') follows its planks.
  const a = [-0.1795, -0.4563], b = [0.1452, 0.3516], from = [2388, 211], to = [2386, 234];
  const unitLength = Math.hypot(b[0] - a[0], b[1] - a[1]), span = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const scale = span / unitLength;
  const turn = Math.atan2(to[0] - from[0], to[1] - from[1]) - Math.atan2(b[0] - a[0], b[1] - a[1]);
  // (put stands the model's foot, its `base`, on the point given: the point where that must be for the planks' middle to
  // be the gorge's)
  const f = FACT.suspensionbridge, mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const dx = (f.base[0] - mid[0]) * scale, dz = (f.base[2] - mid[1]) * scale;
  const cx = (from[0] + to[0]) / 2, cz = (from[1] + to[1]) / 2;
  const px = cx + dx * Math.cos(turn) + dz * Math.sin(turn), pz = cz - dx * Math.sin(turn) + dz * Math.cos(turn);
  // its foot so low that its planks' top at the north end is the path's there (17.6 m)
  put('suspensionbridge', px, pz, { size: scale * f.across[1], turn, y: 17.6 - 0.0664 * scale + 0.04, solid: 0, keep: 3, tag: 'suspension-bridge' });
}

// ---- the entrance hill (picture 10): the great spreading tree on top, the bench, boulders, trees round its edges
put('treeonhill', 1943, 4, { size: 14, turn: 0.6, solid: 0.9, keep: 8, tag: 'hill' });
put('tree_1', 1966, -14, { size: 11, turn: 2.1, keep: 6, tag: 'hill' });
for (const [x, z, s] of [[1918, 6, 1.4], [1952, 30, 1.1], [1926, 40, 0.9], [1949, -6, 1.6], [1916, 26, 0.8]]) rock('mossy', x, z, s);
scatter(['coconutpalmtree_1', 'palmtree_3', 'slimtree', 'talltree', 'palmtree_5'], 10, disc(1936, 14, 40), { clear: 3, spacing: 9, tag: 'hill' });

// ---- the forest path (pictures 4, 15): great buttressed trees either side, ferns, bananas and broad leaves by it,
// mossy boulders at its edges; palms where it opens toward the lagoon
alongPath('forest', BIG, 15, 5, 11, { spacing: 9, keep: 2, skip: 0.2 });
alongPath('hill-down', BIG, 18, 5, 10, { spacing: 9, keep: 2 });
alongPath('to-swamp', BIG, 16, 5, 11, { spacing: 9, keep: 2 });
alongPath('from-swamp', BIG, 16, 5, 11, { spacing: 9, keep: 2 });
alongPath('to-mangroves', [...BIG, ...PALMS], 14, 4, 9, { spacing: 7 });
for (const id of ['forest', 'to-swamp', 'from-swamp', 'hill-down', 'to-mangroves']) {
  alongPath(id, UNDER, 3.6, 0.6, 2.6, { spacing: 1.6, skip: 0.25 }, null);
  rocksAlong(id, 'mossy', 9, 0.3, 1.5, [0.6, 1.8]);
}
scatter(PALMS, 10, rect(2096, 96, 2124, 122), { clear: 2, spacing: 6, tag: 'forest-edge' });

// ---- the swamp (picture 12): giant buttressed trees standing in its dark water, a fern island, broad leaves at its edge
for (const [x, z, m, s] of [[2036, -52, 'giantbuttress-roottree', 30], [2048, -104, 'buttressedtree', 24], [2076, -70, 'giantbuttress-roottree', 32], [2018, -84, 'tree', 26], [2068, -118, 'buttressedtree', 22], [2088, -96, 'buttress-roottree', 20], [2006, -110, 'foresttree', 18]]) {
  if (clearOfWays(x, z, 3)) put(m, x, z, { size: s, keep: 4, tag: 'swamp' });
}
for (const [x, z] of [[2044, -88], [2041, -92], [2047, -94]]) put(pick(FERNS), x, z, { size: between(1.1, 1.6), solid: 0, tag: 'fern-island' });
rock('mossy', 2044, -91, 3.2);
scatter([...FERNS, ...BROAD], 24, rect(1990, -140, 2100, -30), { clear: 1.4, spacing: 3, wet: 0.5, tag: 'swamp' });

// ---- the mangroves (picture 5): red mangroves on their stilt roots in the green water either side of the boardwalk,
// coconut palms on the bank behind
scatter(MANGROVES, 34, rect(1990, 140, 2120, 182), { clear: 2.2, spacing: 6, wet: 2.6, tag: 'mangroves' }, [5, 9]);
scatter(PALMS, 8, rect(1990, 118, 2090, 145), { clear: 2, spacing: 8, tag: 'mangroves' });

// ---- the lagoon (pictures 6, 2, 8, 16, 18): coconut palms leaning out over its beaches, the palm island, plants on
// the pillars' tops
alongPath('west-beach', LEANING, 11, 3, 7, { spacing: 7, skip: 0.45, open: true }, [9, 14]);
scatter([...SHRUBS, ...FERNS, 'palmplant', 'fanpalmshrub'], 22, rect(2120, 92, 2300, 128), { clear: 1.5, spacing: 3, tag: 'beach-back' });
// tropical almonds, their crowns in tiers, behind the beaches as they grow along the coast
scatter(['oaktree'], 4, rect(2120, 70, 2290, 112), { clear: 4, spacing: 14, tag: 'beach-back' }, [12, 16]);
scatter(['oaktree'], 3, rect(2100, 370, 2300, 470), { clear: 4, spacing: 14, steep: 1.2, tag: 'east-woods' }, [12, 16]);
// the island
for (const [x, z, m, s] of [[2202, 200, 'palmtree_4', 13], [2211, 210, 'coconutpalmtree_3', 12], [2196, 212, 'palmtree_9', 9], [2214, 198, 'coconutpalm', 8], [2207, 216, 'palmtree_2', 11]]) put(m, x, z, { size: s, keep: 2, tag: 'island' });
for (const [x, z] of [[2200, 206], [2212, 204], [2205, 196]]) put(pick([...SHRUBS, ...FERNS]), x, z, { size: between(1.2, 1.7), tag: 'island' });
// on the pillars' tops: a palm or two, bushes and ferns (the green on their tops in the pictures)
for (const p of H.HABITATION_PILLARS) {
  const n = p.r > 5 ? 4 : 2;
  for (let k = 0; k < n; k += 1) {
    const a = rand() * Math.PI * 2, d = p.r * between(0.1, 0.55);
    const m = k === 0 && p.r > 5 ? pick(['palmtree_5', 'palmtree_3', 'coconutpalmtree_1']) : pick([...SHRUBS, ...FERNS, 'fanpalmshrub']);
    put(m, p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, { size: k === 0 && p.r > 5 ? between(7, 10) : between(1.4, 2.4), y: p.h - 0.2, solid: 0, tag: `pillar:${p.id}` });
  }
}
// the sunset beach (picture 14): palms on its point, ferns and grass behind
for (const [x, z, m, s] of [[2252, 342, 'palmtree_9', 9], [2244, 348, 'coconutpalm', 8], [2160, 344, 'palmtree_2', 12], [2171, 352, 'palmtree_4', 13]]) if (standsAt(x, z, { clear: 1.5, spacing: 3, open: true })) put(m, x, z, { size: s, keep: 2, tag: 'sunset' });
scatter([...FERNS, ...SHRUBS], 14, rect(2140, 344, 2270, 368), { clear: 1.5, spacing: 3, steep: 1.4, tag: 'sunset' });

// ---- the rocky stream gorge (pictures 1, 7): boulders big and small along and in its stream, flat stones to step on,
// ferns and broad leaves on its banks and walls, slender trees on its rims
{
  const s = H.HABITATION_STREAMS.find((q) => q.id === 'gorge');
  for (let k = 0; k < 70; k += 1) {
    const i = Math.floor(rand() * (s.line.length - 1)), t = rand();
    const [ax, az] = s.line[i], [bx, bz] = s.line[i + 1];
    const len = Math.hypot(bx - ax, bz - az), side = rand() < 0.5 ? -1 : 1;
    const off = between(0, s.width / 2 + 4);
    const x = ax + (bx - ax) * t - (bz - az) / len * side * off, z = az + (bz - az) * t + (bx - ax) / len * side * off;
    const size = off < s.width / 2 ? between(0.6, 1.6) : between(0.8, 3.4);
    if (standsAt(x, z, { clear: size * 0.45 + 0.3, wet: 0.6, steep: 3, spacing: size * 0.8 }) || standsAt(x, z, { clear: size * 0.45 + 0.3, steep: 3, spacing: size * 0.8 })) rock('mossy', x, z, size);
  }
  // a huge mossy boulder by the stream (picture 1, at the left)
  rock('mossy', 2344, 124, 5.5);
}
scatter([...FERNS, ...BROAD], 60, rect(2310, -20, 2470, 150), { clear: 1.2, spacing: 2.5, steep: 2.5, tag: 'gorge' });
scatter([...TALL, ...PALMS], 30, rect(2300, -60, 2480, 160), { clear: 3, spacing: 9, steep: 1.2, tag: 'gorge-rim' });

// ---- the big waterfall (picture 11): ferns and broad leaves on its ledges, palms on its cliff tops, flat slabs of its
// red stone where its outflow leaves the pool
scatter([...FERNS, ...BROAD], 28, disc(2464, 225, 40), { clear: 1.2, spacing: 3, steep: 3, tag: 'big-fall' });
scatter([...PALMS, ...TALL, ...BIG], 18, disc(2468, 225, 70), { clear: 3, spacing: 10, steep: 1.0, above: 14, tag: 'big-fall-top' });
for (const [x, z, s] of [[2442, 214, 2.2], [2446, 236, 2.6], [2436, 220, 1.6], [2438, 230, 1.8], [2450, 214, 1.4]]) rock('redstone', x, z, s, { flat: true });

// ---- the suspension bridge (pictures 9, 13): granite boulders down its gorge, palms and ferns at its ends
{
  const s = H.HABITATION_STREAMS.find((q) => q.id === 'outflow');
  for (let k = 0; k < 40; k += 1) {
    const i = Math.floor(rand() * (s.line.length - 1)), t = rand();
    const [ax, az] = s.line[i], [bx, bz] = s.line[i + 1];
    const len = Math.hypot(bx - ax, bz - az), side = rand() < 0.5 ? -1 : 1, off = between(0, s.width / 2 + 3);
    const x = ax + (bx - ax) * t - (bz - az) / len * side * off, z = az + (bz - az) * t + (bx - ax) / len * side * off;
    const size = between(1, 4);
    if (standsAt(x, z, { clear: size * 0.45, wet: 1.2, steep: 4, spacing: size * 0.8 })) rock('granite', x, z, size);
  }
}
scatter([...PALMS, ...FERNS, 'fanpalmshrub', 'palmplant'], 16, disc(2387, 222, 30), { clear: 1.5, spacing: 4, steep: 1.6, tag: 'bridge-ends' });

// ---- the waterfall pool (picture 3): palms leaning over it, ferns and monstera in front, stones on its beach
for (const [x, z, m, s] of [[2338, 312, 'palmtree_4', 13], [2364, 318, 'palmtree_9', 9], [2342, 342, 'coconutpalmtree_3', 12]]) if (standsAt(x, z, { clear: 1.5, spacing: 3, steep: 3, open: true })) put(m, x, z, { size: s, keep: 2, tag: 'falls-pool' });
scatter([...FERNS, 'monsteraplant', 'monsteraplant_2', 'fanpalmshrub'], 14, disc(2348, 322, 30), { clear: 1.2, spacing: 2.5, steep: 2.5, tag: 'falls-pool' });
for (let k = 0; k < 8; k += 1) { const [x, z] = disc(2338, 318, 9)(); if (standsAt(x, z, { clear: 1, spacing: 1.5, steep: 2 })) rock('limestone', x, z, between(0.5, 1.2)); }

// ---- the overlook (picture 17): palms framing its view, ferns by its terrace
for (const [x, z, m, s] of [[2270, 376, 'palmtree_5', 12], [2232, 378, 'coconutpalmtree_1', 13]]) if (standsAt(x, z, { clear: 1.2, spacing: 3, steep: 2, open: true })) put(m, x, z, { size: s, keep: 2, tag: 'overlook' });
scatter([...FERNS, ...SHRUBS], 10, disc(2252, 380, 18), { clear: 1.2, spacing: 2.5, steep: 2, tag: 'overlook' });

// ---- the gazebo garden (picture 19): bananas, monstera, broad leaves, ferns and bushes round its pool and path, mossy
// boulders
scatter([...BROAD, ...FERNS, ...SHRUBS], 30, rect(2126, 372, 2200, 432), { clear: 1.0, spacing: 2.2, steep: 1.6, tag: 'garden' });
for (const [x, z, s] of [[2152, 392, 1.4], [2142, 404, 1.1], [2174, 414, 1.6], [2160, 386, 0.9]]) rock('mossy', x, z, s);

// ---- the forest everywhere off the paths: the west woods, the high ground north and east
// (as thick as the pictures have it: from the lagoon and the paths the high ground round it is all forest, seen far off
// as the trees' pictures, render-habitation.js)
scatter([...BIG, ...TALL, ...OIL], 420, rect(1890, -175, 2300, 120), { clear: 5, spacing: 11, steep: 1.2, keep: 1, tag: 'woods' });
scatter([...TALL, ...OIL, ...PALMS, ...BIG], 420, rect(2310, -90, 2530, 330), { clear: 4, spacing: 9, steep: 1.4, above: 9, tag: 'north-woods' });
scatter([...PALMS, ...TALL, ...OIL], 260, rect(2084, 360, 2420, 470), { clear: 4, spacing: 9, steep: 1.4, above: 9, tag: 'east-woods' });
// palms all along the lagoon's shores and leaning out over the water at its edges
scatter([...PALMS, ...LEANING], 40, rect(2096, 96, 2320, 140), { clear: 2.5, spacing: 7, open: true, tag: 'lagoon-palms' }, [8, 14]);
scatter([...PALMS, ...LEANING], 30, rect(2120, 328, 2300, 372), { clear: 2.5, spacing: 7, steep: 1.6, open: true, tag: 'lagoon-palms' }, [8, 14]);
scatter([...UNDER], 220, rect(1890, -175, 2300, 120), { clear: 2.5, spacing: 5, steep: 1.2, tag: 'woods-floor' });

// ---- plants on the cliff walls (pictures 3, 11 and 1): ferns, broad leaves and palm shrubs growing from the ledges
// and cracks up the walls of the two waterfalls' bowls and the gorge, as thick as the pictures have them; each where
// its wall stands, at that height. (Put last, so that nothing placed before them moves.) Mostly the light ferns.
const WALL = ['fernclump', 'fernclump', 'fernplant_1', 'fernplant_1', 'monsteraplant', 'fanpalmshrub', 'palmplant'];
function onWall(px, pz, nx, nz, rise, floor, tag) {
  // `rise`: metres the wall climbs for each metre out from its foot; a plant 1.5 m up to 2 m below its top
  const top = ground(px + nx * 30, pz + nz * 30);
  if (top - floor < 4) return false;
  const up = between(1.5, top - floor - 2);
  const x = px + nx * (up / rise), z = pz + nz * (up / rise);
  if (!clearOfWays(x, z, 1.2) || near(x, z, 3.2) || water(x, z) || ground(x, z) < floor + 1) return false;
  const m = pick(WALL);
  // (big: clumps that a wall of twenty metres shows from across its pool)
  return put(m, x, z, { size: FACT[m].real * between(1.6, 2.6), solid: 0, tag });
}
for (const [id, count] of [['falls-bowl', 45], ['big-bowl', 55]]) {
  const b = H.HABITATION_BOWLS.find((q) => q.id === id);
  const segs = b.outline.map((a, i) => { const c = b.outline[(i + 1) % b.outline.length]; return [a, c, Math.hypot(c[0] - a[0], c[1] - a[1])]; });
  const total = segs.reduce((t, q) => t + q[2], 0);
  for (let k = 0, n = 0; k < count * 30 && n < count; k += 1) {
    let d = rand() * total, seg = segs[0];
    for (const q of segs) { if (d <= q[2]) { seg = q; break; } d -= q[2]; }
    const [a, c, l] = seg, t = Math.min(1, d / l);
    const px = a[0] + (c[0] - a[0]) * t, pz = a[1] + (c[1] - a[1]) * t;
    // (out of the bowl: the side the ground rises)
    let nx = (c[1] - a[1]) / l, nz = -(c[0] - a[0]) / l;
    if (ground(px + nx * 4, pz + nz * 4) < ground(px - nx * 4, pz - nz * 4)) { nx = -nx; nz = -nz; }
    if (onWall(px, pz, nx, nz, b.walls, b.floor, `wall:${id}`)) n += 1;
  }
}
{
  const s = H.HABITATION_STREAMS.find((q) => q.id === 'gorge');
  for (let k = 0, n = 0; k < 40 * 30 && n < 40; k += 1) {
    const i = Math.floor(rand() * (s.line.length - 1)), t = rand();
    const [ax, az] = s.line[i], [bx, bz] = s.line[i + 1];
    const l = Math.hypot(bx - ax, bz - az), side = rand() < 0.5 ? -1 : 1;
    const nx = -(bz - az) / l * side, nz = (bx - ax) / l * side;
    const foot = s.width / 2 + (s.banks || 0);
    const px = ax + (bx - ax) * t + nx * foot, pz = az + (bz - az) * t + nz * foot;
    if (s.walls && onWall(px, pz, nx, nz, s.walls, ground(px, pz), 'wall:gorge')) n += 1;
  }
}

// ---- stones on the waterfall pool's sand at the water's edge (picture 3), pale limestone like its cliffs: put by hand,
// last, each turned and sized as given (no chance taken, so nothing put before them moves), where there is room
[[2348.6, 312.4, 0.8, 0.4], [2346.6, 314.8, 0.5, 2.1], [2338.4, 322.6, 0.9, 4.0], [2338.8, 325.6, 0.45, 1.2], [2331.2, 316.2, 0.6, 5.3], [2330.6, 324.4, 0.7, 3.1]].forEach(([x, z, s, r], k) => {
  if (standsAt(x, z, { clear: s * 0.45 + 0.3, spacing: s * 0.8, steep: 2, open: true })) put(ROCK.limestone[k % 3], x, z, { size: s, turn: r, solid: s * 0.42, tag: 'falls-pool' });
});

// ======================================================================================== written out ==
const used = new Set(placed.map((p) => p.m));
const all = Object.keys(spec.models).map(stem);
const missing = all.filter((m) => !used.has(m));
if (missing.length) { console.error('not used:', missing.join(', ')); process.exit(1); }
const count = {};
for (const p of placed) count[p.m] = (count[p.m] || 0) + 1;
const lines = placed.map((p) => `  [${JSON.stringify(p.m)}, ${p.x}, ${p.z}, ${p.y === null ? 'null' : p.y}, ${p.r}, ${p.s}, ${p.solid}, ${JSON.stringify(p.tag)}],`);
writeFileSync(sceneFile, `// Where each of the owner's habitation models stands, and the rocks: made by tools/habitation/place.mjs from
// habitation.js and the models' own measures (tools/habitation/facts.json); not edited by hand. Each: the model, where
// (grid x, z), the height it stands at where that is not the ground (a pillar's top), turned (radians), its size
// (metres: its height, or a structure's length, or a rock's width), how far round it is solid at the ground (0:
// nothing that stops a walker), and which place it is part of. ${placed.length} in all.
const rows = [
${lines.join('\n')}
];
export const HABITATION_STANDING = Object.freeze(rows.map(([m, x, z, y, r, s, solid, tag]) => Object.freeze({ m, x, z, y, r, s, solid, tag })));
// Each model's own measures (its units): how big one unit is against its size above (its height, or a structure's
// length along z), and the middle of its foot (placed on the ground at the point given).
export const HABITATION_MODELS = Object.freeze(${JSON.stringify(Object.fromEntries([...used].sort().map((m) => { const f = FACT[m]; return [m, { unit: +(f.isLength ? f.across[1] : f.height).toFixed(4), base: f.base || [0, 0, 0], kind: f.kind }]; })))});
`);
console.log(`placed ${placed.length}: ${Object.entries(count).sort((a, b) => b[1] - a[1]).map(([m, n]) => `${m} ${n}`).join(', ')}`);
