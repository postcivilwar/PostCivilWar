// The habitation at the far end of the River Niger (20 October 2026, the owner's brief and nineteen pictures).
//
// The river is made longer to the north (upstream; not wider): from where it went out of sight beyond the town it runs
// on up to a lagoon, its head, fed by waterfalls from the cliffs round it. Waterside Road runs on north out of the town
// along the river to a car park at the habitation's gate; from there it is on foot, over a footbridge across the
// stream that rings the habitation. A vehicle is stopped at the bridge: "Get off your vehicle to cross the bridge".
//
// Inside, eleven places, each as one of the owner's pictures shows it (pictures in brackets: assets/habitation/
// reference): the entrance hill (10), the forest path (4, 15), the swamp boardwalk (12), the mangrove boardwalk (5),
// the lagoon with its beaches, islets and palm island (6, 2, 8, 16, 18), the rocky stream gorge (1, 7), the big
// waterfall (11), the suspension bridge over its outflow (9, 13), the waterfall pool (3), the overlook (17), the gazebo
// garden (19) and the sunset beach (14).
//
// One walks only on its paths, boardwalks and bridges, on sand, on open grass and in shallow water; the trees, plants,
// rocks and cliffs stand in the way as they are, and deep water and the forest are not walked into.
//
// Content only, like the town's other files: the simulation (where one may go, how high the ground is) and the
// drawing (render-habitation.js) read it through ../zone.js. Directions are the site grid's (atani.js): +x is true
// north, +z true east (the river side); one grid metre is one metre. Heights are metres above the town's ground (0);
// the river and the lagoon lie at WATER (a little under it).

export const WATER = -0.32;
const box = (x0, z0, x1, z1) => Object.freeze({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) });
const pts = (list) => Object.freeze(list.map(([x, z]) => Object.freeze([x, z])));

// ----------------------------------------------------------------------------------------- small sums --

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => { const u = clamp(t, 0, 1); return u * u * (3 - 2 * u); };
// a repeatable noise (the same everywhere it is worked out: on the website and in every page)
function hash(i, j) { let h = (i * 374761393 + j * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function noise(x, z) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export const habitationNoise = noise;
const fbm = (x, z) => noise(x, z) * 0.55 + noise(x * 2.1 + 17, z * 2.1 + 9) * 0.3 + noise(x * 4.3 + 3, z * 4.3 + 41) * 0.15;

// Along a line of points: the nearest point's distance, how far along the line it is (metres), and which piece.
function nearLine(line, x, z) {
  let best = Infinity, at = 0, run = 0, seg = 0, t = 0;
  for (let i = 0; i + 1 < line.length; i += 1) {
    const [ax, az] = line[i], [bx, bz] = line[i + 1];
    const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz || 1e-9, len = Math.sqrt(len2);
    const u = clamp(((x - ax) * dx + (z - az) * dz) / len2, 0, 1);
    const qx = ax + dx * u - x, qz = az + dz * u - z, d = Math.sqrt(qx * qx + qz * qz);
    if (d < best) { best = d; at = run + u * len; seg = i; t = u; }
    run += len;
  }
  return { d: best, at, seg, t, length: run };
}
const lineLength = (line) => { let s = 0; for (let i = 0; i + 1 < line.length; i += 1) s += Math.hypot(line[i + 1][0] - line[i][0], line[i + 1][1] - line[i][1]); return s; };
// Inside a closed outline (points in order): true or false; and how far from its edge (negative inside).
function inside(poly, x, z) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
function edgeDistance(poly, x, z) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [ax, az] = poly[j], [bx, bz] = poly[i];
    const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz || 1e-9;
    const u = clamp(((x - ax) * dx + (z - az) * dz) / len2, 0, 1);
    best = Math.min(best, Math.hypot(ax + dx * u - x, az + dz * u - z));
  }
  return best;
}
const signedDistance = (poly, x, z) => (inside(poly, x, z) ? -edgeDistance(poly, x, z) : edgeDistance(poly, x, z));
const boundsOf = (poly, pad = 0) => { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } return box(x0 - pad, z0 - pad, x1 + pad, z1 + pad); };
const circle = (cx, cz, r, n = 18, wobble = 0, seed = 0) => pts(Array.from({ length: n }, (_, k) => { const a = (k / n) * Math.PI * 2, rr = r * (1 + wobble * (noise(k * 1.7 + seed, seed * 0.3) - 0.5) * 2); return [cx + Math.cos(a) * rr, cz + Math.sin(a) * rr]; }));

// -------------------------------------------------------------------------------- the road up the river --
// Waterside Road on north out of the town, along the river, to the habitation's car park: tar with laterite shoulders,
// as it is in the town.
export const UPRIVER = Object.freeze({
  road: Object.freeze({ id: 'upriver', name: 'Waterside Road', x0: 243, z0: 108, x1: 1846, z1: 118, surface: 'asphalt', lanes: 2, edgeLines: true }),
  // the car park at the gate: bays along its two long sides
  park: Object.freeze({ id: 'habitation-park', name: 'Habitation car park', x0: 1832, z0: 64, x1: 1880, z1: 118, surface: 'asphalt', bays: true }),
  // the verges that can be walked (the bush beyond them is not)
  verge: 4,
  // a sign at the town's end of the road, and one at the gate
  signs: Object.freeze([
    Object.freeze({ id: 'habitation-way', lines: ['THE HABITATION', 'North, along the river'], x: 262, z: 104, facing: -Math.PI / 2, width: 6.4, height: 2.1, palette: ['#ffffff', '#1f5a3a'] }),
    Object.freeze({ id: 'habitation-near', lines: ['THE HABITATION', 'Car park ahead'], x: 1760, z: 104, facing: -Math.PI / 2, width: 6, height: 2.1, palette: ['#ffffff', '#1f5a3a'] }),
  ]),
});
// The river runs on north to the lagoon: its western bank as it is along the town (atani.js zoneShoreZ), its far bank
// where it is there, as wide all the way.
export const RIVER_HEAD = 2086;                     // grid x where the river opens into the lagoon
export const riverShore = (x) => 150 + 5 * Math.sin(x / 37) + 3 * Math.sin(x / 11 + 1);
export const RIVER_FAR = 300;

// -------------------------------------------------------------------------------------- the habitation --
export const HABITATION = Object.freeze({
  name: 'The Habitation',
  bounds: box(1872, -175, 2530, 470),          // (from the gate's footbridge, which starts at the car park's edge)
  gate: Object.freeze({ x: 1888, z: 91 }),
  // the eleven places, where each is, and which of the owner's pictures it is made from
  places: Object.freeze([
    { id: 'entrance-hill', name: 'Entrance hill', x: 1934, z: 16, pictures: [10] },
    { id: 'forest-path', name: 'Forest path', x: 2045, z: 86, pictures: [4, 15] },
    { id: 'swamp', name: 'Swamp boardwalk', x: 2050, z: -82, pictures: [12] },
    { id: 'mangroves', name: 'Mangrove boardwalk', x: 2060, z: 162, pictures: [5] },
    { id: 'lagoon', name: 'The lagoon', x: 2210, z: 230, pictures: [6, 2, 8, 16, 18] },
    { id: 'gorge', name: 'Rocky stream gorge', x: 2370, z: 95, pictures: [1, 7] },
    { id: 'big-waterfall', name: 'Big waterfall', x: 2468, z: 225, pictures: [11] },
    { id: 'suspension-bridge', name: 'Suspension bridge', x: 2386, z: 221, pictures: [9, 13] },
    { id: 'waterfall-pool', name: 'Waterfall pool', x: 2350, z: 326, pictures: [3] },
    { id: 'overlook', name: 'Overlook', x: 2252, z: 370, pictures: [17] },
    { id: 'gazebo-garden', name: 'Gazebo garden', x: 2160, z: 408, pictures: [19] },
    { id: 'sunset-beach', name: 'Sunset beach', x: 2192, z: 348, pictures: [14] },
  ].map(Object.freeze)),
});

// -------------------------------------------------------------------------------------------- water --
// Each water: its outline, the level of its surface, how deep it gets and how fast (metres deeper for each metre in
// from its edge), its look (lagoon: clear turquoise, shallows showing the sand; pool: green and clear; swamp: dark and
// still; stream: moving), and the sand round it.
const water = (id, kind, outline, level, deepest, slope, extra = {}) => Object.freeze({ id, kind, outline: pts(outline), level, deepest, slope, bounds: boundsOf(outline, 12), ...extra });
export const HABITATION_WATERS = Object.freeze([
  // the lagoon, the river's head: from the river's mouth round by its west beach, the gorge's mouth, the outflow's
  // mouth, the waterfall pool's cascade and the sunset beach, back to the river's far bank
  water('lagoon', 'lagoon', [
    [2086, 151], [2104, 140], [2126, 129], [2160, 121], [2200, 118], [2240, 121], [2274, 131], [2302, 146], [2322, 168],
    [2333, 196], [2336, 226], [2330, 258], [2318, 286], [2300, 310], [2276, 328], [2246, 341], [2214, 345], [2180, 343],
    [2148, 336], [2118, 322], [2096, 308], [2086, 300],
  ], WATER, 3.2, 0.09, { beach: 9, islands: Object.freeze([Object.freeze({ id: 'palm-island', outline: circle(2206, 205, 15, 16, 0.12, 11), top: 1.6 })]) }),
  // the big waterfall's pool, under its cliffs
  water('big-pool', 'pool', circle(2464, 225, 21, 22, 0.08, 3), 3.6, 2.6, 0.22, { beach: 0 }),
  // the waterfall pool in its bowl of pale cliffs, its sand beach to the south-west
  water('falls-pool', 'pool', circle(2352, 328, 17, 20, 0.1, 7), 1.1, 2.0, 0.18, { beach: 8 }),
  // the swamp: dark, still water among the great trees
  water('swamp', 'swamp', [[1994, -42], [2028, -34], [2066, -40], [2092, -62], [2096, -92], [2084, -122], [2054, -136], [2016, -130], [1994, -108], [1987, -74]], 0.35, 1.1, 0.25, { beach: 0 }),
  // the garden's still pool by the gazebo
  water('garden-pool', 'pond', [[2148, 396], [2166, 394], [2174, 402], [2168, 412], [2150, 413], [2143, 405]], 6.05, 0.9, 0.5, { beach: 0 }),
]);
// Streams: a line from source to mouth, its width, the height of its water along the line (each point's own), and how
// deep it runs (shallow ones are waded).
const stream = (id, line, width, depth, heights, extra = {}) => Object.freeze({ id, line: pts(line), width, depth, heights: Object.freeze(heights), bounds: boundsOf(line, width + 14), length: lineLength(line), ...extra });
export const HABITATION_STREAMS = Object.freeze([
  // the stream round the habitation's south side, which the gate's footbridge crosses into it (too deep to wade)
  stream('moat', [[1897, -176], [1894, -110], [1891, -40], [1889, 30], [1887, 90], [1885, 130], [1884, 156]], 5.5, 1.3, [0.2, 0.1, 0.0, -0.1, -0.2, -0.3, WATER], { deep: true }),
  // the rocky gorge's stream, down from the north-west into the lagoon, over stones and a cascade (waded)
  stream('gorge', [[2482, -6], [2452, 24], [2424, 52], [2398, 76], [2376, 92], [2356, 106], [2336, 120], [2318, 134], [2306, 144]], 7, 0.35, [14, 12.2, 10.4, 8.6, 5.0, 3.4, 2.0, 0.6, WATER], { stones: true, banks: 4.5, walls: 2.6 }),
  // the big waterfall's outflow, a rocky gorge with rapids down to the lagoon (too fast to wade)
  stream('outflow', [[2444, 225], [2424, 224], [2404, 222], [2386, 221], [2366, 220], [2348, 221], [2334, 222]], 9, 0.9, [3.6, 3.0, 2.2, 1.5, 0.9, 0.3, WATER], { rapids: true, banks: 1.5, walls: 2.4 }),
  // the waterfall pool's cascade into the lagoon
  stream('falls-run', [[2340, 316], [2328, 306], [2316, 298]], 6, 0.3, [1.1, 0.5, WATER], { banks: 2, walls: 1.2 }),
]);
// Waterfalls: where the water leaves the cliff's top (a line across it) and where it lands; foam and spray at its foot.
export const HABITATION_FALLS = Object.freeze([
  Object.freeze({ id: 'big', top: Object.freeze([2492, 225, 25.5]), foot: Object.freeze([2481, 225, 3.6]), width: 7, pool: 'big-pool' }),
  Object.freeze({ id: 'pool', top: Object.freeze([2370, 340, 19.5]), foot: Object.freeze([2362, 335, 1.1]), width: 4.5, pool: 'falls-pool' }),
  Object.freeze({ id: 'gorge', top: Object.freeze([2395, 78, 8.4]), foot: Object.freeze([2384, 87, 5.4]), width: 6, stream: 'gorge' }),
  // far off over the lagoon, the thin fall that the pictures show from its west beach
  Object.freeze({ id: 'thin', top: Object.freeze([2342, 182, 14.5]), foot: Object.freeze([2334, 182, WATER]), width: 2.2, pool: 'lagoon' }),
]);

// ------------------------------------------------------------------------------------------- the land --
// The ground is low by the water and rises into hills, and north and east of the lagoon into high ground that ends in
// cliffs: a highland is an outline, its height (rising across it, `rise` metres for each metre north), how wide its
// cliff edge is (narrow: sheer), and its rock. Into the high ground are carved the big waterfall's bowl and the
// waterfall pool's (a floor, and sheer walls round it), and the streams' gorges (their walls `walls` steep). The rock
// pillars stand up out of the lagoon (drawn as rocks, not ground).
const hill = (x, z, r, h) => Object.freeze({ x, z, r, h });
export const HABITATION_HILLS = Object.freeze([
  hill(1934, 14, 46, 9.5),       // the entrance hill, its great tree on top
  hill(1962, -78, 60, 5),        // the rise west of the swamp
  hill(2050, 34, 40, 2.4),       // the forest's floor, rising a little from the swamp to the beach
  hill(2220, 40, 90, 4),         // the forest behind the west beach, rising toward the gorge
]);
const highland = (id, outline, top, rise, edge, rock, extra = {}) => Object.freeze({ id, outline: pts(outline), top, rise, edge, rock, bounds: boundsOf(outline, edge + 2), ...extra });
export const HABITATION_HIGHLANDS = Object.freeze([
  // north of the lagoon: the gorge's sides, the big waterfall's cliffs, the outflow's gorge
  highland('north', [[2318, -90], [2560, -90], [2560, 330], [2410, 330], [2392, 300], [2372, 282], [2352, 264], [2340, 244], [2338, 220], [2338, 192], [2330, 168], [2318, 150], [2312, 128], [2312, 60], [2310, 0], [2312, -50]], 12, 0.085, 5, 'mossy',
    { rocks: Object.freeze([[2420, 'redstone'], [2380, 'granite']]) }),
  // east of the lagoon: the overlook's crag and the cliffs over the sunset beach
  // (round the gazebo garden's shelf below them: their cliffs stand behind it on three sides, and it is open to the lagoon)
  highland('east', [[2342, 312], [2420, 330], [2420, 480], [2084, 480], [2084, 378], [2116, 372], [2126, 372], [2126, 412], [2148, 436], [2200, 432], [2208, 400], [2202, 366], [2214, 364], [2252, 358], [2284, 346], [2314, 330]], 20, 0.0, 4.5, 'limestone'),
  // the gazebo garden's shelf, at the foot of the east cliffs: level, a few metres above the sunset beach
  highland('garden', [[2128, 372], [2196, 366], [2204, 400], [2196, 428], [2150, 432], [2126, 410]], 6.0, 0, 3, 'mossy', { flat: true }),
]);
const bowl = (id, outline, floor, walls, rock) => Object.freeze({ id, outline: pts(outline), floor, walls, rock, bounds: boundsOf(outline, 40) });
export const HABITATION_BOWLS = Object.freeze([
  // the big waterfall's horseshoe: open to the south, where its outflow leaves
  bowl('big-bowl', [[2436, 204], [2450, 198], [2468, 199], [2484, 208], [2490, 225], [2484, 242], [2468, 251], [2450, 252], [2436, 246], [2430, 232], [2430, 218]], 3.0, 4.5, 'redstone'),
  // the waterfall pool's bowl of pale cliffs, open to the south-west
  bowl('falls-bowl', [[2336, 316], [2344, 312], [2360, 312], [2370, 320], [2372, 334], [2364, 344], [2350, 346], [2338, 340], [2332, 328]], 0.6, 4, 'limestone'),
]);
// the rock pillars and islets out in the lagoon (limestone, with plants on their tops: habitation-scene.js)
export const HABITATION_PILLARS = Object.freeze([
  { id: 'pillar-a', x: 2268, z: 268, r: 8.5, h: 26 }, { id: 'pillar-b', x: 2243, z: 297, r: 6, h: 18 },
  { id: 'pillar-c', x: 2292, z: 236, r: 5, h: 14 }, { id: 'islet-a', x: 2163, z: 303, r: 7, h: 9 },
  { id: 'islet-b', x: 2232, z: 168, r: 3, h: 2.6 }, { id: 'pillar-d', x: 2302, z: 290, r: 4, h: 20 },
].map(Object.freeze));

// ----------------------------------------------------------------------------------- where one walks --
// Paths: a line, its width, what it is (earth: red laterite; mud: the forest's, with puddles; stone: paving or flat
// slabs; sand), and whether it keeps to the ground (every path does: its ground is made level across it).
const path = (id, line, width, surface, extra = {}) => Object.freeze({ id, line: pts(line), width, surface, bounds: boundsOf(line, width + 12), ...extra });
export const HABITATION_PATHS = Object.freeze([
  // from the gate's footbridge up the entrance hill to the great tree, and down its north side into the forest
  path('hill-up', [[1897, 91], [1906, 82], [1914, 66], [1921, 52], [1927, 38], [1932, 25], [1936, 17]], 3.2, 'earth'),
  path('hill-top', [[1936, 17], [1944, 12], [1950, 20], [1956, 33]], 4, 'earth'),
  path('hill-down', [[1956, 33], [1966, 44], [1978, 53], [1994, 62]], 3.2, 'earth'),
  // the forest path, muddy, between the great trees, to the lagoon's west beach
  path('forest', [[1994, 62], [2014, 70], [2034, 80], [2054, 90], [2074, 99], [2094, 107], [2112, 115], [2126, 121]], 3.6, 'mud', { puddles: true }),
  // off it to the west: to the swamp's boardwalk, and back round from its far end
  path('to-swamp', [[2014, 70], [2017, 46], [2021, 20], [2025, -8], [2028, -28]], 3, 'mud', { puddles: true }),
  path('from-swamp', [[2090, -40], [2096, -14], [2098, 18], [2094, 50], [2084, 76], [2074, 99]], 3, 'mud', { puddles: true }),
  // off it to the river: to the mangrove boardwalk's start
  path('to-mangroves', [[2034, 80], [2026, 102], [2016, 122], [2010, 136]], 3, 'earth'),
  // along the lagoon's west beach and north to the gorge's mouth (on sand)
  path('west-beach', [[2126, 121], [2160, 116], [2200, 113], [2240, 116], [2272, 125], [2296, 137], [2310, 140]], 5, 'sand'),
  // up the gorge on its west bank, to its footbridge
  path('gorge-west', [[2310, 140], [2324, 128], [2338, 118], [2350, 110], [2362, 104]], 3, 'stone', { heights: [0.4, 1.5, 2.7, 3.7, 4.5] }),
  // across the gorge's footbridge and up its east bank by stone steps, then on to the big waterfall's cliff top
  path('gorge-east', [[2376, 108], [2386, 116], [2398, 130], [2412, 148], [2426, 166], [2436, 180], [2440, 192]], 3, 'earth', { heights: [4.8, 7.5, 11, 14.5, 17.5, 20.2, 21.6], steps: true }),
  // down the wooden stairs (a deck, below) to the big pool's shore, and along it to the outflow's footbridge
  path('pool-shore', [[2448, 211], [2446, 215], [2444, 218]], 3.4, 'stone', { heights: [4.3, 4.3, 4.3] }),
  // from the outflow's footbridge down the west rim of its gorge to the suspension bridge
  path('outflow-west', [[2440, 192], [2430, 195], [2416, 200], [2400, 206], [2388, 211]], 3, 'earth', { heights: [21.6, 20.8, 19.8, 18.6, 17.6] }),
  path('pool-east', [[2440, 232], [2448, 240], [2456, 248], [2448, 257], [2434, 262], [2420, 262]], 3, 'earth', { heights: [4.4, 8, 12, 16, 19, 20.2], steps: true }),
  path('east-rim', [[2420, 262], [2404, 252], [2392, 242], [2386, 234]], 3, 'earth', { heights: [20.2, 19.2, 18.2, 17.6] }),
  // over the suspension bridge (a deck) and away from its east end to the waterfall pool
  path('to-falls-pool', [[2386, 234], [2380, 248], [2372, 266], [2364, 286], [2356, 302], [2346, 310]], 3, 'earth', { heights: [17.6, 15, 11, 7, 3.2, 1.5] }),
  // round the waterfall pool's beach (sand) and up to the overlook
  path('falls-pool-beach', [[2346, 310], [2336, 318], [2334, 330]], 5, 'sand', { heights: [1.5, 1.3, 1.4] }),
  path('to-overlook', [[2334, 330], [2324, 352], [2310, 370], [2292, 378], [2274, 374], [2264, 370]], 3, 'earth', { heights: [1.4, 6, 11, 16, 19.6, 20.2] }),
  // the overlook: a paved terrace at the very edge of the cliffs, the lagoon and its pillars below it (picture 17)
  path('overlook-terrace', [[2238, 371], [2266, 369]], 9, 'stone', { heights: [20.2, 20.2] }),
  // from the overlook along the cliffs to the gazebo garden (stone paving there)
  path('overlook-garden', [[2240, 374], [2228, 386], [2212, 398], [2194, 406], [2176, 408]], 3.2, 'earth', { heights: [20.2, 17, 12.5, 8.4, 6.3] }),
  path('garden', [[2176, 408], [2166, 404], [2156, 400], [2148, 392], [2146, 382]], 2.6, 'stone', { heights: [6.3, 6.2, 6.2, 6.1, 5.8] }),
  // down from the garden to the sunset beach
  path('to-sunset', [[2146, 382], [2150, 372], [2160, 364], [2174, 357], [2188, 352], [2198, 349]], 3, 'earth', { heights: [5.8, 4.3, 2.8, 1.6, 0.8, 0.45] }),
  // the stone stairs from the overlook down the cliff's face to the bay (a deck, below; the ground cut to them here)
  path('overlook-steps', [[2238, 366], [2228, 362], [2218, 358], [2208, 353]], 2.4, 'stone', { heights: [20.2, 13.6, 7.0, 0.7] }),
  path('stairs-foot', [[2208, 353], [2200, 350]], 3, 'sand'),
]);
// Open grass that can be walked (the hilltop meadow, the garden's lawn), and sand (beaches), as outlines.
export const HABITATION_GRASS = Object.freeze([
  Object.freeze({ id: 'meadow', outline: circle(1938, 16, 22, 16, 0.18, 2) }),
  Object.freeze({ id: 'garden-lawn', outline: pts([[2140, 410], [2160, 420], [2186, 418], [2190, 404], [2176, 392], [2152, 386], [2138, 394]]) }),
  Object.freeze({ id: 'overlook-top', outline: circle(2252, 378, 6, 12, 0.1, 5) }),
]).map((g) => Object.freeze({ ...g, bounds: boundsOf(g.outline, 2) }));
export const HABITATION_SAND = Object.freeze([
  // the west beach: from the forest's edge down into the lagoon's shallows
  Object.freeze({ id: 'west-beach', outline: pts([[2116, 128], [2130, 112], [2170, 104], [2210, 103], [2250, 107], [2282, 118], [2308, 131], [2320, 146], [2300, 150], [2260, 132], [2210, 124], [2160, 128], [2126, 136]]) }),
  Object.freeze({ id: 'island', outline: circle(2206, 205, 15, 16, 0.12, 11) }),
  Object.freeze({ id: 'sunset-beach', outline: pts([[2150, 338], [2176, 352], [2210, 356], [2240, 352], [2262, 340], [2250, 334], [2214, 340], [2178, 338]]) }),
  Object.freeze({ id: 'falls-pool-beach', outline: pts([[2330, 312], [2342, 304], [2352, 310], [2346, 322], [2336, 330], [2328, 324]]) }),
]).map((g) => Object.freeze({ ...g, bounds: boundsOf(g.outline, 2) }));

// Decks: boardwalks, bridges, jetties, platforms and stairs, walked on, never driven: a line, its width, the height of
// its boards (each point's own, or `over`: so far above whatever is under it), rails or not, and what it is made of
// (the owner's models where it is one of theirs: render-habitation.js).
const deck = (id, kind, line, width, heights, extra = {}) => Object.freeze({ id, kind, line: pts(line), width, heights: Object.freeze(heights), bounds: boundsOf(line, width + 2), length: lineLength(line), rails: true, ...extra });
export const HABITATION_DECKS = Object.freeze([
  // the gate: a plank footbridge across the stream, from the car park into the habitation
  deck('gate-bridge', 'bridge', [[1876, 91], [1886, 91], [1898, 91]], 2.6, [0.25, 0.75, 0.3], { entrance: true, model: 'woodenboardwalk' }),
  // the swamp's boardwalk, with its round platform among the great trees
  deck('swamp-walk', 'boardwalk', [[2028, -28], [2032, -46], [2040, -60], [2052, -72], [2060, -84], [2070, -96], [2072, -112], [2062, -124], [2050, -118], [2058, -100], [2072, -80], [2082, -62], [2090, -40]], 2.4, [1.0], { over: 0.7, platform: Object.freeze({ x: 2060, z: -84, r: 5 }), model: 'woodenboardwalk', ropes: true }),
  // the mangrove boardwalk on stilts over the green water, from the river bank to the lagoon's west beach
  deck('mangrove-walk', 'boardwalk', [[2010, 136], [2024, 150], [2042, 162], [2062, 168], [2082, 164], [2098, 154], [2110, 142], [2120, 132]], 2.4, [1.0], { over: 1.0, model: 'woodenboardwalk' }),
  // to the palm island over the lagoon, rope rails (picture 16)
  deck('island-walk', 'boardwalk', [[2192, 118], [2196, 140], [2200, 164], [2203, 188]], 2.2, [0.9], { over: 0.8, ropes: true, model: 'woodenboardwalk' }),
  // the gorge's flat footbridge on stone supports (pictures 1, 7)
  deck('gorge-bridge', 'bridge', [[2362, 104], [2369, 106], [2376, 108]], 2.4, [4.6, 5.0, 4.8], { model: 'woodenboardwalk', piers: true }),
  // the wooden stairs down the big waterfall's west side to its pool (picture 11)
  deck('falls-stairs', 'stairs', [[2440, 192], [2452, 194], [2460, 200], [2456, 207], [2448, 211]], 2.2, [21.6, 17, 12, 8, 4.3], { model: 'woodenboardwalk' }),
  // the footbridge over the outflow at the pool's foot (picture 11)
  deck('outflow-bridge', 'bridge', [[2444, 218], [2441, 225], [2440, 232]], 2.4, [4.3, 4.5, 4.3], { model: 'woodenboardwalk' }),
  // the suspension bridge over the outflow's gorge (pictures 9, 13): the owner's model, its span on its own sag
  deck('suspension-bridge', 'suspension', [[2388, 211], [2387, 222], [2386, 234]], 1.55, [17.6, 16.85, 17.6], { model: 'suspensionbridge' }),
  // the overlook's stone stairs down the cliff's face to the bay, with handrails (picture 17)
  deck('overlook-stairs', 'stairs', [[2238, 366], [2228, 362], [2218, 358], [2208, 353]], 2.4, [20.2, 13.6, 7.0, 0.7], { stone: true }),
  // the sunset beach's jetty, rope rails (pictures 14, 18)
  deck('sunset-jetty', 'jetty', [[2196, 350], [2196, 340], [2196, 330]], 2.4, [0.75], { over: 0.7, ropes: true, model: 'woodenboardwalk' }),
  // the gazebo's floor and the pool deck by the garden pool (the owner's models)
  deck('gazebo-floor', 'platform', [[2168, 392], [2168, 386]], 6, [6.6], { rails: false, model: 'tropicalgazebo' }),
]);

// ------------------------------------------------------------------------------- the ground's height --
// Worked out at any point, the same everywhere: the rolling land, its hills and ridges, the water's beds and the sand
// down to them, the streams' beds, and the paths made level across. Kept, once worked out, in squares of 16 m.
function landAt(x, z) {
  // the land: low and rolling, a metre or so above the water
  let y = 1.0 + (fbm(x / 70, z / 70) - 0.5) * 2.4 + (fbm(x / 18 + 50, z / 18) - 0.5) * 0.6;
  for (const h of HABITATION_HILLS) { const d2 = ((x - h.x) ** 2 + (z - h.z) ** 2) / (h.r * h.r); if (d2 < 9) y += h.h * Math.exp(-d2 * 1.6); }
  // the high ground: its height inside (broken a little), sheer at its edge, the edge itself ragged
  for (const g of HABITATION_HIGHLANDS) {
    if (x < g.bounds.x0 || x > g.bounds.x1 || z < g.bounds.z0 || z > g.bounds.z1) continue;
    const s = signedDistance(g.outline, x, z) + (noise(x / 11, z / 11) - 0.5) * 4;
    if (s > g.edge) continue;
    const top = g.top + g.rise * Math.max(0, x - g.bounds.x0) + (fbm(x / 24 + 9, z / 24) - 0.5) * (g.flat ? 0.4 : 3);
    const k = smooth((g.edge - s) / (g.edge * 2));
    y = Math.max(y, y + (top - y) * k);
  }
  return y;
}
// the height a path is given where it has its own (climbing a cliff, down into a gorge): along it, between its points
function pathLevel(p, n) {
  const i = n.seg, a = p.heights[i], b = p.heights[i + 1] !== undefined ? p.heights[i + 1] : a;
  return a + (b - a) * n.t;
}
function shaped(x, z) {
  let y = landAt(x, z);
  // the bowls carved into the high ground: a floor, and sheer walls up from it
  for (const b of HABITATION_BOWLS) {
    if (x < b.bounds.x0 || x > b.bounds.x1 || z < b.bounds.z0 || z > b.bounds.z1) continue;
    const s = signedDistance(b.outline, x, z) + (noise(x / 6 + 3, z / 6) - 0.5) * 2;
    y = Math.min(y, b.floor + Math.max(0, s) * b.walls);
  }
  // the streams: their beds, their banks, and where they run through high ground, its walls
  for (const s of HABITATION_STREAMS) {
    if (x < s.bounds.x0 - 40 || x > s.bounds.x1 + 40 || z < s.bounds.z0 - 40 || z > s.bounds.z1 + 40) continue;
    const n = nearLine(s.line, x, z);
    const half = s.width / 2, banks = s.banks || 0;
    const surface = streamLevel(s, n);
    if (n.d < half) { y = Math.min(y, surface - s.depth + (s.depth * 0.7) * (n.d / half) ** 2); continue; }
    if (n.d < half + banks) { y = Math.min(y, surface + 0.25 + (n.d - half) * 0.12); continue; }
    if (s.walls) y = Math.min(y, surface + 0.25 + banks * 0.12 + (n.d - half - banks) * s.walls * (0.8 + 0.4 * noise(x / 5, z / 5)));
    else if (n.d < half + 10) y = Math.min(y, surface + 0.15 + (y - surface - 0.15) * smooth((n.d - half) / 10));
  }
  // the waters: their beds below their surface (an island in one is land), and the sand down to them
  for (const w of HABITATION_WATERS) {
    if (x < w.bounds.x0 || x > w.bounds.x1 || z < w.bounds.z0 || z > w.bounds.z1) continue;
    let s = signedDistance(w.outline, x, z);
    if (w.islands) {
      let isle = null, si = Infinity;
      for (const i of w.islands) { const d = signedDistance(i.outline, x, z); if (d < si) { si = d; isle = i; } }
      if (si < 0) { y = w.level + 0.05 + (isle.top - w.level) * smooth(-si / 8) + (noise(x / 4, z / 4) - 0.5) * 0.2; continue; }
      if (s < 0) s = -Math.min(-s, si);         // (shallower toward the island too)
    }
    if (s < 0) { y = Math.min(y, w.level - Math.min(w.deepest, 0.04 - s * w.slope)); continue; }
    const beach = w.beach || 1.5;
    if (s < beach) y = Math.min(y, w.level + 0.05 + (y - w.level - 0.05) * smooth(s / beach));
  }
  // the river, from the town to the lagoon: its bed (deepest in its middle), and its banks down to it
  if (x < RIVER_HEAD + 12 && z > 100 && z < RIVER_FAR + 40) {
    const shore = riverShore(x), into = z - shore, across = RIVER_FAR - z;
    if (into > 0 && across > 0) y = Math.min(y, WATER - Math.min(3.2, 0.04 + Math.min(into, across) * 0.16));
    else if (into > -14 && into <= 0) y = Math.min(y, WATER + 0.05 + (y - WATER - 0.05) * smooth(-into / 14));
    else if (across <= 0 && across > -14) y = Math.min(y, WATER + 0.05 + (y - WATER - 0.05) * smooth(-across / 14));
  }
  // the paths: level across, and where a path has its own heights (up a cliff, down a gorge), the ground cut or built
  // up to it, with banks either side
  for (const p of HABITATION_PATHS) {
    if (x < p.bounds.x0 || x > p.bounds.x1 || z < p.bounds.z0 || z > p.bounds.z1) continue;
    const n = nearLine(p.line, x, z);
    if (p.heights) {
      if (n.d > p.width / 2 + 10) continue;
      const level = pathLevel(p, n);
      if (n.d <= p.width / 2 + 0.6) { y = level; continue; }
      const bank = (n.d - p.width / 2 - 0.6);
      // (a cutting: the ground above the path falls to it at a steep slope; an embankment below rises to it)
      y = y > level ? Math.min(y, level + bank * 1.8) : Math.max(y, level - bank * 1.2);
      continue;
    }
    if (n.d > p.width / 2 + 2) continue;
    const [ax, az] = p.line[n.seg], [bx, bz] = p.line[n.seg + 1];
    const along = landAt(ax + (bx - ax) * n.t, az + (bz - az) * n.t);
    const k = 1 - smooth((n.d - p.width / 2) / 2);
    y = y + (Math.max(along, y - 3) - y) * k * 0.85;
  }
  // at its west edge the land comes down to the town's level (the car park, the road's end and the land along the
  // river lie at the town's ground): level with it at the edge, rising to its own over the first 24 m in
  const inward = x - HABITATION.bounds.x0;
  if (inward < 24 && y > 0) y *= smooth(inward / 24);
  return y;
}
const streamLevel = (s, n) => {
  // (the water's height along the stream: between its points' own, a step down at a cascade)
  const i = n.seg, a = s.heights[i], b = s.heights[i + 1] !== undefined ? s.heights[i + 1] : a;
  return a + (b - a) * n.t;
};
const TILE = 16;
const tiles = new Map();
function heightTile(i, j) {
  const key = i * 100003 + j;
  let t = tiles.get(key);
  if (t) return t;
  t = new Float32Array((TILE + 1) * (TILE + 1));
  for (let b = 0; b <= TILE; b += 1) for (let a = 0; a <= TILE; a += 1) t[b * (TILE + 1) + a] = shaped(i * TILE + a, j * TILE + b);
  if (tiles.size > 4000) tiles.clear();
  tiles.set(key, t);
  return t;
}
// The ground's height (not the decks'): from the squares, between their points.
export function habitationLand(x, z) {
  const i = Math.floor(x / TILE), j = Math.floor(z / TILE);
  const t = heightTile(i, j);
  const fx = x - i * TILE, fz = z - j * TILE;
  const a = Math.min(TILE - 1, Math.floor(fx)), b = Math.min(TILE - 1, Math.floor(fz));
  const u = fx - a, v = fz - b, W = TILE + 1;
  const h00 = t[b * W + a], h10 = t[b * W + a + 1], h01 = t[(b + 1) * W + a], h11 = t[(b + 1) * W + a + 1];
  return h00 + (h10 - h00) * u + (h01 - h00) * v + (h00 - h10 - h01 + h11) * u * v;
}
export const habitationShape = shaped;          // (for drawing: the same ground, not from the squares)

// ------------------------------------------------------------------------------------ what is where --
// The water at a point, if any: which, its surface, and how deep it is there.
export function habitationWaterAt(x, z) {
  const ground = habitationLand(x, z);
  for (const w of HABITATION_WATERS) {
    if (x < w.bounds.x0 || x > w.bounds.x1 || z < w.bounds.z0 || z > w.bounds.z1) continue;
    if (inside(w.outline, x, z) && ground < w.level && !(w.islands && w.islands.some((i) => inside(i.outline, x, z) && ground > w.level - 0.02))) return { id: w.id, kind: w.kind, level: w.level, depth: w.level - ground };
  }
  for (const s of HABITATION_STREAMS) {
    if (x < s.bounds.x0 || x > s.bounds.x1 || z < s.bounds.z0 || z > s.bounds.z1) continue;
    const n = nearLine(s.line, x, z);
    if (n.d < s.width / 2) { const level = streamLevel(s, n); if (ground < level) return { id: s.id, kind: s.rapids ? 'rapids' : 'stream', level, depth: s.deep ? Math.max(1, level - ground) : level - ground }; }
  }
  if (x < RIVER_HEAD + 6 && z > riverShore(x) && z < RIVER_FAR && ground < WATER) return { id: 'niger', kind: 'river', level: WATER, depth: WATER - ground };
  return null;
}
// A deck at a point, if any: which, and the height of its boards there.
export function habitationDeckAt(x, z) {
  for (const d of HABITATION_DECKS) {
    if (x < d.bounds.x0 || x > d.bounds.x1 || z < d.bounds.z0 || z > d.bounds.z1) continue;
    const n = nearLine(d.line, x, z);
    const onPlatform = d.platform && Math.hypot(x - d.platform.x, z - d.platform.z) < d.platform.r;
    if (n.d > d.width / 2 && !onPlatform) continue;
    return { deck: d, y: deckHeight(d, n, x, z), along: n.at, of: n.length };
  }
  return null;
}
function deckHeight(d, n, x, z) {
  if (d.over !== undefined) {
    // so far above what is under it: the water's surface, or the ground where there is no water
    const w = habitationWaterAt(x, z);
    return Math.max(w ? w.level : -Infinity, habitationLand(x, z)) + d.over;
  }
  const h = d.heights;
  if (h.length === 1) return h[0];
  // (a suspension bridge hangs: its boards sag between its ends, lowest at its middle)
  const t = n.at / (n.length || 1);
  const k = t * (h.length - 1), i = Math.min(h.length - 2, Math.floor(k));
  return h[i] + (h[i + 1] - h[i]) * (k - i);
}

// Where one may walk: on a path, a deck, sand, open grass, or in water shallow enough to wade; not in the forest, up
// a cliff or in deep water. `footOnly`: a deck (no vehicle goes onto it).
const WADE = 0.55;
export function habitationFooting(x, z) {
  const b = HABITATION.bounds;
  if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) return null;
  const deckHere = habitationDeckAt(x, z);
  if (deckHere) return { walk: true, footOnly: true, kind: deckHere.deck.kind, deck: deckHere.deck.id, y: deckHere.y };
  const w = habitationWaterAt(x, z);
  if (w) return w.depth <= WADE && w.kind !== 'rapids' && w.kind !== 'swamp' ? { walk: true, kind: 'shallows', water: w.id, y: w.level - w.depth } : { walk: false, kind: 'water', water: w.id, depth: w.depth };
  for (const p of HABITATION_PATHS) {
    if (x < p.bounds.x0 || x > p.bounds.x1 || z < p.bounds.z0 || z > p.bounds.z1) continue;
    if (nearLine(p.line, x, z).d <= p.width / 2) return { walk: true, kind: 'path', surface: p.surface, path: p.id };
  }
  for (const s of HABITATION_SAND) if (x >= s.bounds.x0 && x <= s.bounds.x1 && z >= s.bounds.z0 && z <= s.bounds.z1 && inside(s.outline, x, z)) return { walk: true, kind: 'sand', area: s.id };
  for (const g of HABITATION_GRASS) if (x >= g.bounds.x0 && x <= g.bounds.x1 && z >= g.bounds.z0 && z <= g.bounds.z1 && inside(g.outline, x, z)) return { walk: true, kind: 'grass', area: g.id };
  return { walk: false, kind: 'forest' };
}
export const onHabitation = (x, z) => { const f = habitationFooting(x, z); return !!(f && f.walk); };
// A deck under a point (no vehicle goes onto it): its id, its name for a sign, and whether it is the gate's bridge.
export function habitationFootOnly(x, z) {
  const b = HABITATION.bounds;
  if (x < b.x0 - 4 || x > b.x1 || z < b.z0 || z > b.z1) return null;
  const d = habitationDeckAt(x, z);
  return d ? { id: d.deck.id, kind: d.deck.kind, entrance: !!d.deck.entrance } : null;
}
// The ground's height where one stands: a deck's boards, the bed of shallow water, or the land.
export function habitationGroundY(x, z) {
  const f = habitationFooting(x, z);
  if (!f) return 0;
  if (f.y !== undefined) return f.y;
  return habitationLand(x, z);
}

// -------------------------------------------------------------------------- the road up the river: ground --
const R = UPRIVER.road, PARK = UPRIVER.park, V = UPRIVER.verge;
// the road and its verges, and the car park: walked and driven
export const onUpriver = (x, z) => (x > R.x0 - 1 && x < R.x1 && z > R.z0 - V && z < R.z1 + V) || (x > PARK.x0 && x < PARK.x1 + 2 && z > PARK.z0 && z < PARK.z1 + V);
// (the road keeps level with the town's ground; the land round it lies a little above or below)
export const upriverGroundY = (x, z) => 0;

// -------------------------------------------------------------------------------------- what stands --
// Every trunk, plant and rock that stands where one could otherwise walk (habitation-scene.js puts them; each a box
// the size of what stands at the ground), and the gazebo's posts.
import { HABITATION_STANDING, HABITATION_MODELS } from './habitation-scene.js';
export * from './habitation-scene.js';
// The gazebo stands in the way as a gazebo would: its four corner posts, the post in its middle, and the wall with the
// bench along its back; its floor (a deck) is walked on, in by any of its three open sides. Measured from the supplied
// model (tropicalgazebo3dmodel.glb, in its own units: [across, along, half its width]), placed where the gazebo stands.
const GAZEBO_SOLID = [
  [-0.288, -0.291, 0.03], [-0.3, 0.3, 0.03], [0.286, -0.271, 0.03], [0.287, 0.289, 0.03], [0.004, 0.133, 0.07],
  ...[-0.2, -0.12, -0.04, 0.04, 0.12, 0.2].map((z) => [-0.293, z, 0.045]),
];
const GAZEBO = HABITATION_STANDING.find((s) => s.m === 'tropicalgazebo');
export const HABITATION_GAZEBO_SOLID = Object.freeze(GAZEBO ? GAZEBO_SOLID.map(([mx, mz, half]) => {
  const { unit, base } = HABITATION_MODELS.tropicalgazebo, k = GAZEBO.s / unit;
  const lx = k * (mx - base[0]), lz = k * (mz - base[2]), c = Math.cos(GAZEBO.r), sn = Math.sin(GAZEBO.r);
  return Object.freeze({ x: GAZEBO.x + lx * c + lz * sn, z: GAZEBO.z - lx * sn + lz * c, half: k * half });
}) : []);
export const HABITATION_COLLIDERS = Object.freeze([
  ...HABITATION_STANDING.filter((s) => s.solid > 0).map((s) => box(s.x - s.solid, s.z - s.solid, s.x + s.solid, s.z + s.solid)),
  ...HABITATION_GAZEBO_SOLID.map((p) => box(p.x - p.half, p.z - p.half, p.x + p.half, p.z + p.half)),
]);
// Filled in by habitation-scene.js (where each of the owner's models stands, and the rocks): each a solid box the size
// of its trunk or stone at the ground.
export const HABITATION_GATE_SIGN = Object.freeze({ id: 'habitation-gate', lines: ['THE HABITATION', 'On foot from here'], x: 1874, z: 97, facing: -Math.PI / 2, width: 5.2, height: 1.8, palette: ['#ffffff', '#1f5a3a'] });
