// The habitation at the far end of the River Niger (20 October 2026, the owner's brief and nineteen pictures).
//
// The river is made longer to the north (upstream; not wider): from where it went out of sight beyond the town it runs
// on up to a lagoon, its head, fed by waterfalls from the cliffs round it. Waterside Road runs on out of the town's
// north end, past the habitation's sign, to a car park at its gate; from there it is on foot, over a footbridge across
// the stream along its south side. A vehicle is stopped at the bridge: "Get off your vehicle to cross the bridge".
// (It was first laid out 1.6 km up the river; on 21 October 2026 the owner had it brought down to the first signboard,
// at the end of the town's road: HABITATION_SHIFT, below.)
//
// Inside, eleven places, each as one of the owner's pictures shows it (pictures in brackets: assets/habitation/
// reference): the entrance hill (10), the forest path (4, 15), the swamp boardwalk (12), the mangrove boardwalk (5),
// the lagoon with its beaches, islets and palm island (6, 2, 8, 16, 18), the rocky stream gorge (1, 7), the big
// waterfall (11), the suspension bridge over its outflow (9, 13), the waterfall pool (3), the overlook (17), the gazebo
// garden (19) and the sunset beach (14).
//
// One walks anywhere on its land and in its shallow water (21 October 2026, the owner: "users must be able to move
// freely in the habitation, as long as there's no object blocking user"): only what stands there stops a walker, the
// trunks, plants, rocks and the gazebo as they are, a cliff's face, deep or fast water, and the boiling river round its
// far sides (the owner, the same day: "on the extreme of the habitation should just be hot river"), which no one goes
// into. One cannot step off a bridge or a boardwalk onto the ground far below it (habitationStep).
//
// Content only, like the town's other files: the simulation (where one may go, how high the ground is) and the
// drawing (render-habitation.js) read it through ../zone.js. Directions are the site grid's (atani.js): +x is true
// north, +z true east (the river side); one grid metre is one metre. Heights are metres above the town's ground (0);
// the river and the lagoon lie at WATER (a little under it).

export const WATER = -0.32;
// Where it stands: its outlines below are as they were drawn where it was first laid out, each moved this far along the
// grid's x (toward the town) as it is read. The lie of its land (the noise its hills and hollows are made from) is still
// worked out where it was drawn (`drawn`), so that it is the same land, only nearer.
export const HABITATION_SHIFT = -1552;
const S = HABITATION_SHIFT;
const drawn = (x) => x - S;
const box = (x0, z0, x1, z1) => Object.freeze({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) });
const pts = (list) => Object.freeze(list.map(([x, z]) => Object.freeze([x + S, z])));

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
const round = (cx, cz, r, n = 18, wobble = 0, seed = 0) => (Array.from({ length: n }, (_, k) => { const a = (k / n) * Math.PI * 2, rr = r * (1 + wobble * (noise(k * 1.7 + seed, seed * 0.3) - 0.5) * 2); return [cx + Math.cos(a) * rr, cz + Math.sin(a) * rr]; }));
// (a round outline where it now stands; `round` gives it as it was drawn, for what moves its points itself)
const circle = (cx, cz, r, n = 18, wobble = 0, seed = 0) => pts(round(cx, cz, r, n, wobble, seed));

// -------------------------------------------------------------------------------- the road up the river --
// Waterside Road on out of the town's north end, past the habitation's sign (the first thing after the town's own road),
// into its car park at the gate: tar with laterite shoulders, as it is in the town. (Grid metres, where they are: these
// are not moved by HABITATION_SHIFT.)
export const UPRIVER = Object.freeze({
  road: Object.freeze({ id: 'upriver', name: 'Waterside Road', x0: 243, z0: 108, x1: 1846 + S, z1: 118, surface: 'asphalt', lanes: 2, edgeLines: true }),
  // the car park at the gate: bays along its two long sides
  park: Object.freeze({ id: 'habitation-park', name: 'Habitation car park', x0: 1832 + S, z0: 64, x1: 1880 + S, z1: 118, surface: 'asphalt', bays: true }),
  // the verges that can be walked (the bush beyond them is not)
  verge: 4,
  // the sign at the town's end of the road (and one at the gate: HABITATION_GATE_SIGN)
  signs: Object.freeze([
    Object.freeze({ id: 'habitation-way', lines: ['THE HABITATION', 'Park here: on foot from the gate'], x: 262, z: 104, facing: -Math.PI / 2, width: 6.4, height: 2.1, palette: ['#ffffff', '#1f5a3a'] }),
  ]),
});
// The river runs on north to the lagoon: its western bank as it is along the town (atani.js zoneShoreZ), its far bank
// where it is there, as wide all the way.
export const RIVER_HEAD = 2086 + S;                 // grid x where the river opens into the lagoon
export const riverShore = (x) => 150 + 5 * Math.sin(x / 37) + 3 * Math.sin(x / 11 + 1);
export const RIVER_FAR = 300;

// -------------------------------------------------------------------------------------- the habitation --
export const HABITATION = Object.freeze({
  name: 'The Habitation',
  // (from the gate's footbridge, which starts at the car park's edge, to the far banks of the boiling river round it)
  bounds: box(1872 + S, -232, 2582 + S, 522),
  gate: Object.freeze({ x: 1888 + S, z: 91 }),
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
  ].map((p) => Object.freeze({ ...p, x: p.x + S }))),
});

// -------------------------------------------------------------------------------------------- water --
// Each water: its outline, the level of its surface, how deep it gets and how fast (metres deeper for each metre in
// from its edge), its look (lagoon: clear turquoise, shallows showing the sand; pool: green and clear; swamp: dark and
// still; stream: moving), and the sand round it.
const water = (id, kind, outline, level, deepest, slope, extra = {}) => { const at = pts(outline); return Object.freeze({ id, kind, outline: at, level, deepest, slope, bounds: boundsOf(at, 12), ...extra }); };
export const HABITATION_WATERS = Object.freeze([
  // the lagoon, the river's head: from the river's mouth round by its west beach, the gorge's mouth, the outflow's
  // mouth, the waterfall pool's cascade and the sunset beach, back to the river's far bank
  water('lagoon', 'lagoon', [
    [2086, 151], [2104, 140], [2126, 129], [2160, 121], [2200, 118], [2240, 121], [2274, 131], [2302, 146], [2322, 168],
    [2333, 196], [2336, 226], [2330, 258], [2318, 286], [2300, 310], [2276, 328], [2246, 341], [2214, 345], [2180, 343],
    [2148, 336], [2118, 322], [2096, 308], [2086, 300],
  ], WATER, 3.2, 0.09, { beach: 9, islands: Object.freeze([Object.freeze({ id: 'palm-island', outline: circle(2206, 205, 15, 16, 0.12, 11), top: 1.6 })]) }),
  // the big waterfall's pool, under its cliffs
  water('big-pool', 'pool', round(2464, 225, 21, 22, 0.08, 3), 3.6, 2.6, 0.22, { beach: 0 }),
  // the waterfall pool in its bowl of pale cliffs, its sand beach to the south-west
  water('falls-pool', 'pool', round(2352, 328, 17, 20, 0.1, 7), 1.1, 2.0, 0.18, { beach: 8 }),
  // the swamp: dark, still water among the great trees
  water('swamp', 'swamp', [[1994, -42], [2028, -34], [2066, -40], [2092, -62], [2096, -92], [2084, -122], [2054, -136], [2016, -130], [1994, -108], [1987, -74]], 0.35, 1.1, 0.25, { beach: 0 }),
  // the garden's still pool by the gazebo
  water('garden-pool', 'pond', [[2148, 396], [2166, 394], [2174, 402], [2168, 412], [2150, 413], [2143, 405]], 6.05, 0.9, 0.5, { beach: 0 }),
]);
// Streams: a line from source to mouth, its width, the height of its water along the line (each point's own), and how
// deep it runs (shallow ones are waded).
const stream = (id, line, width, depth, heights, extra = {}) => { const at = pts(line); return Object.freeze({ id, line: at, width, depth, heights: Object.freeze(heights), bounds: boundsOf(at, width + 14), length: lineLength(at), ...extra }); };
export const HABITATION_STREAMS = Object.freeze([
  // the stream round the habitation's south side, which the gate's footbridge crosses into it (too deep to wade)
  // (from where the boiling river rises, so that the two waters close the habitation round: 21 October 2026)
  stream('moat', [[1902, -206], [1899, -190], [1897, -176], [1894, -110], [1891, -40], [1889, 30], [1887, 90], [1885, 130], [1884, 156]], 5.5, 1.3, [0.36, 0.28, 0.2, 0.1, 0.0, -0.1, -0.2, -0.3, WATER], { deep: true }),
  // the rocky gorge's stream, down from the north-west into the lagoon, over stones and a cascade (waded)
  stream('gorge', [[2482, -6], [2452, 24], [2424, 52], [2398, 76], [2376, 92], [2356, 106], [2336, 120], [2318, 134], [2306, 144]], 7, 0.5, [14, 12.2, 10.4, 8.6, 5.0, 3.4, 2.0, 0.6, WATER], { stones: true, banks: 4.5, walls: 2.6 }),
  // the big waterfall's outflow, a rocky gorge with rapids down to the lagoon (too fast to wade)
  stream('outflow', [[2444, 225], [2424, 224], [2404, 222], [2386, 221], [2366, 220], [2348, 221], [2334, 222]], 9, 0.9, [3.6, 3.0, 2.2, 1.5, 0.9, 0.3, WATER], { rapids: true, banks: 1.5, walls: 2.4 }),
  // the waterfall pool's cascade into the lagoon
  stream('falls-run', [[2340, 316], [2328, 306], [2316, 298]], 6, 0.3, [1.1, 0.5, WATER], { banks: 2, walls: 1.2 }),
]);
// The boiling river round its far sides (21 October 2026, the owner: "on the extreme of the habitation should just be hot
// river, the river should be steaming, with clear evidence of the river boiling, then with signboard instructing user to
// avoid river due to hotness of the river"). From a hot spring at the habitation's south-west corner it runs north along
// its west side, across its far end, back along its east side and under the far bank of the Niger into it, in a valley
// of its own: the high ground ends in cliffs above it, and beyond it is the bush. It steams and boils all along it
// (render-habitation.js); no one goes into it, not even its edge, and there is no swimming in it; signs along its banks
// say so (HOT_RIVER_SIGNS).
export const HABITATION_HOT_RIVER = stream('hot-river', [
  [1904, -214], [1940, -206], [1990, -209], [2050, -204], [2110, -208], [2170, -203], [2230, -207], [2290, -202], [2350, -206], [2410, -203], [2470, -207], [2520, -198], [2546, -176], [2552, -140], [2549, -80], [2553, -20], [2549, 40], [2553, 100], [2549, 160], [2553, 220], [2549, 280], [2553, 340], [2549, 400], [2540, 452], [2516, 484], [2470, 492], [2410, 488], [2350, 493], [2290, 489], [2230, 492], [2170, 488], [2110, 492], [2050, 488], [1990, 491], [1936, 486], [1904, 466], [1890, 420], [1886, 370], [1882, 330], [1880, 296],
], 15, 1.6, [0.4, 0.3, 0.2, 0.1, 0.0, -0.1, -0.22, -0.23, -0.233, -0.236, -0.238, -0.241, -0.244, -0.247, -0.25, -0.253, -0.255, -0.258, -0.261, -0.264, -0.267, -0.269, -0.272, -0.275, -0.278, -0.281, -0.283, -0.286, -0.289, -0.292, -0.295, -0.297, -0.3, -0.303, -0.306, -0.309, -0.312, -0.314, -0.317, WATER], { hot: true, banks: 3.5, walls: 2.2 });
// (the boiling river's bank for two and a half metres beyond its water is not stood on either, the water as drawn
// lapping a little way up it: habitationWaterAt; and for walking, four metres of it, habitationFooting: 21 October 2026,
// a walker stopped two and a half metres off it stood in its froth as drawn, the ground drawn coarser than its bank)
const HOT_EDGE = 2.5, HOT_BANK = 4;
// (the streams and the boiling river: each cuts its bed, its banks and, through high ground, its walls)
const CARVED = [...HABITATION_STREAMS, HABITATION_HOT_RIVER];
// The habitation's own ground: within the ring that the moat (its south side) and the boiling river (round the rest of
// it) make, their middles joined. Beyond them is the bush (21 October 2026: the habitation is entered by its gate, and
// the boiling river is its far end): the far banks, seen across the water and never reached, and the strip outside
// the moat, which the gate's bridge crosses.
const MOAT = HABITATION_STREAMS.find((s) => s.id === 'moat');
const HOME = Object.freeze([...HABITATION_HOT_RIVER.line, ...[...MOAT.line].reverse()]);
export const habitationHome = (x, z) => inside(HOME, x, z);
// How far a point is from the habitation's ground (metres; 0 on it): what decides when it is drawn and let go.
export const habitationAway = (x, z) => { const b = HABITATION.bounds; return Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1)); };
// Waterfalls: where the water leaves the cliff's top (a line across it) and where it lands; foam and spray at its foot.
const at3 = ([x, z, y]) => Object.freeze([x + S, z, y]);
export const HABITATION_FALLS = Object.freeze([
  Object.freeze({ id: 'big', top: at3([2492, 225, 25.5]), foot: at3([2481, 225, 3.6]), width: 7, pool: 'big-pool' }),
  Object.freeze({ id: 'pool', top: at3([2370, 340, 19.5]), foot: at3([2362, 335, 1.1]), width: 4.5, pool: 'falls-pool' }),
  Object.freeze({ id: 'gorge', top: at3([2395, 78, 8.4]), foot: at3([2384, 87, 5.4]), width: 6, stream: 'gorge' }),
  // far off over the lagoon, the thin fall that the pictures show from its west beach
  Object.freeze({ id: 'thin', top: at3([2342, 182, 14.5]), foot: at3([2334, 182, WATER]), width: 2.2, pool: 'lagoon' }),
]);

// ------------------------------------------------------------------------------------------- the land --
// The ground is low by the water and rises into hills, and north and east of the lagoon into high ground that ends in
// cliffs: a highland is an outline, its height (rising across it, `rise` metres for each metre north), how wide its
// cliff edge is (narrow: sheer), and its rock. Into the high ground are carved the big waterfall's bowl and the
// waterfall pool's (a floor, and sheer walls round it), and the streams' gorges (their walls `walls` steep). The rock
// pillars stand up out of the lagoon (drawn as rocks, not ground).
const hill = (x, z, r, h) => Object.freeze({ x: x + S, z, r, h });
export const HABITATION_HILLS = Object.freeze([
  hill(1934, 14, 46, 9.5),       // the entrance hill, its great tree on top
  hill(1962, -78, 60, 5),        // the rise west of the swamp
  hill(2050, 34, 40, 2.4),       // the forest's floor, rising a little from the swamp to the beach
  hill(2220, 40, 90, 4),         // the forest behind the west beach, rising toward the gorge
]);
const highland = (id, outline, top, rise, edge, rock, extra = {}) => { const at = pts(outline); return Object.freeze({ id, outline: at, top, rise, edge, rock, bounds: boundsOf(at, edge + 2), ...extra }); };
export const HABITATION_HIGHLANDS = Object.freeze([
  // north of the lagoon: the gorge's sides, the big waterfall's cliffs, the outflow's gorge
  // (its far side ends in a cliff over the boiling river's valley, 21 October 2026)
  highland('north', [[2318, -90], [2505, -90], [2505, 330], [2410, 330], [2392, 300], [2372, 282], [2352, 264], [2340, 244], [2338, 220], [2338, 192], [2330, 168], [2318, 150], [2312, 128], [2312, 60], [2310, 0], [2312, -50]], 12, 0.085, 5, 'mossy',
    { rocks: Object.freeze([[2420, 'redstone'], [2380, 'granite']]) }),
  // east of the lagoon: the overlook's crag and the cliffs over the sunset beach
  // (round the gazebo garden's shelf below them: their cliffs stand behind it on three sides, and it is open to the lagoon)
  // (its far side ends in a cliff over the boiling river's valley, 21 October 2026)
  highland('east', [[2342, 312], [2420, 330], [2420, 452], [2084, 452], [2084, 378], [2116, 372], [2126, 372], [2126, 412], [2148, 436], [2200, 432], [2208, 400], [2202, 366], [2214, 364], [2252, 358], [2284, 346], [2314, 330]], 20, 0.0, 4.5, 'limestone'),
  // the gazebo garden's shelf, at the foot of the east cliffs: level, a few metres above the sunset beach
  highland('garden', [[2128, 372], [2196, 366], [2204, 400], [2196, 428], [2150, 432], [2126, 410]], 6.0, 0, 3, 'mossy', { flat: true }),
]);
const bowl = (id, outline, floor, walls, rock) => { const at = pts(outline); return Object.freeze({ id, outline: at, floor, walls, rock, bounds: boundsOf(at, 40) }); };
export const HABITATION_BOWLS = Object.freeze([
  // the big waterfall's horseshoe: open to the south, where its outflow leaves
  bowl('big-bowl', [[2436, 204], [2450, 198], [2468, 199], [2484, 208], [2490, 225], [2484, 242], [2468, 251], [2450, 252], [2436, 246], [2430, 232], [2430, 218]], 3.0, 4.5, 'redstone'),
  // the waterfall pool's bowl of pale cliffs, open to the south-west
  bowl('falls-bowl', [[2336, 316], [2344, 312], [2360, 312], [2370, 320], [2372, 334], [2364, 344], [2350, 346], [2338, 340], [2332, 328]], 0.6, 4, 'limestone'),
]);
// the rock pillars and islets out in the lagoon (limestone, with plants on their tops: habitation-scene.js)
export const HABITATION_PILLARS = Object.freeze([
  { id: 'pillar-a', x: 2268, z: 268, r: 8.5, h: 40 }, { id: 'pillar-b', x: 2243, z: 297, r: 6, h: 30 },
  { id: 'pillar-c', x: 2292, z: 236, r: 5, h: 24 }, { id: 'pillar-e', x: 2163, z: 303, r: 5.6, h: 26 },
  { id: 'islet-b', x: 2232, z: 168, r: 3, h: 2.6 }, { id: 'pillar-d', x: 2302, z: 290, r: 4, h: 32 },
].map((p) => Object.freeze({ ...p, x: p.x + S })));

// ----------------------------------------------------------------------------------- where one walks --
// Paths: a line, its width, what it is (earth: red laterite; mud: the forest's, with puddles; stone: paving or flat
// slabs; sand), and whether it keeps to the ground (every path does: its ground is made level across it).
const path = (id, line, width, surface, extra = {}) => { const at = pts(line); return Object.freeze({ id, line: at, width, surface, bounds: boundsOf(at, width + 12), ...extra }); };
export const HABITATION_PATHS = Object.freeze([
  // from the gate's footbridge up the entrance hill to the great tree, and down its north side into the forest
  // (straight on out of the gate's bridge for a few metres, clear of its end posts, before it turns up the hill)
  path('hill-up', [[1897, 91], [1900.5, 90.4], [1906, 82], [1914, 66], [1921, 52], [1927, 38], [1932, 25], [1936, 17]], 3.2, 'earth'),
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
  // (along the stream's bank, a few metres from its water, up to the bridge that crosses it)
  // (it ends in front of the footbridge's end, where its way goes on between the bridge's end posts)
  path('gorge-west', [[2310, 140], [2322, 124], [2336, 113], [2348, 104], [2357, 97], [2358.3, 92.8]], 3, 'stone', { heights: [0.4, 1.8, 2.9, 3.8, 4.5, 4.95] }),
  // across the gorge's footbridge and up its east bank by stone steps, then on to the big waterfall's cliff top
  path('gorge-east', [[2368.8, 106.8], [2376, 108], [2386, 116], [2398, 130], [2412, 148], [2426, 166], [2436, 180], [2440, 192]], 3, 'earth', { heights: [5.1, 5.4, 7.5, 11, 14.5, 17.5, 20.2, 21.6], steps: true }),
  // down the wooden stairs (a deck, below) to the big pool's shore, and along it to the outflow's footbridge
  path('pool-shore', [[2448, 211], [2446, 215], [2444, 218]], 3.4, 'stone', { heights: [4.3, 4.3, 4.3] }),
  // from the outflow's footbridge down the west rim of its gorge to the suspension bridge
  path('outflow-west', [[2440, 192], [2430, 195], [2416, 200], [2400, 206], [2388, 211]], 3, 'earth', { heights: [21.6, 20.8, 19.8, 18.6, 17.6] }),
  path('pool-east', [[2440, 232], [2448, 240], [2456, 248], [2448, 257], [2434, 262], [2420, 262]], 3, 'earth', { heights: [4.4, 8, 12, 16, 19, 20.2], steps: true }),
  path('east-rim', [[2420, 262], [2404, 252], [2392, 242], [2386, 234]], 3, 'earth', { heights: [20.2, 19.2, 18.2, 16.75] }),
  // over the suspension bridge (a deck) and away from its east end to the waterfall pool
  path('to-falls-pool', [[2386, 234], [2380, 248], [2372, 266], [2364, 286], [2356, 302], [2346, 310]], 3, 'earth', { heights: [16.75, 15, 11, 7, 3.2, 1.5] }),
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
const deck = (id, kind, line, width, heights, extra = {}) => { const at = pts(line); return Object.freeze({ id, kind, line: at, width, heights: Object.freeze(heights), bounds: boundsOf(at, width + 2), length: lineLength(at), rails: true, ...extra, ...(extra.platform ? { platform: Object.freeze({ ...extra.platform, x: extra.platform.x + S }) } : {}) }); };
export const HABITATION_DECKS = Object.freeze([
  // the gate: a plank footbridge across the stream, from the car park into the habitation
  // (its east end level with the habitation's land there: 22 October 2026, it had ended a quarter of a metre under it)
  deck('gate-bridge', 'bridge', [[1876, 91], [1886, 91], [1898, 91]], 2.6, [0.25, 0.75, 0.56], { entrance: true, model: 'woodenboardwalk' }),
  // the swamp's boardwalk, with its round platform among the great trees
  deck('swamp-walk', 'boardwalk', [[2028, -28], [2032, -46], [2040, -60], [2052, -72], [2060, -84], [2070, -96], [2072, -112], [2062, -124], [2050, -118], [2058, -100], [2072, -80], [2082, -62], [2090, -40]], 2.4, [1.0], { over: 0.7, platform: Object.freeze({ x: 2060, z: -84, r: 5 }), model: 'woodenboardwalk', ropes: true }),
  // the mangrove boardwalk on stilts over the green water, from the river bank to the lagoon's west beach
  deck('mangrove-walk', 'boardwalk', [[2010, 136], [2024, 150], [2042, 162], [2062, 168], [2082, 164], [2098, 154], [2110, 142], [2120, 132]], 2.4, [1.0], { over: 1.0, model: 'woodenboardwalk' }),
  // to the palm island over the lagoon, rope rails (picture 16)
  deck('island-walk', 'boardwalk', [[2192, 118], [2196, 140], [2200, 164], [2203, 188]], 2.2, [0.9], { over: 0.8, ropes: true, model: 'woodenboardwalk' }),
  // the gorge's flat footbridge on stone supports (pictures 1, 7)
  // (straight across the stream, from bank to bank, a metre above its water)
  deck('gorge-bridge', 'bridge', [[2359.2, 94], [2364, 100.4], [2368.8, 106.8]], 2.4, [4.95, 5.25, 5.1], { model: 'woodenboardwalk', piers: true }),
  // the wooden stairs down the big waterfall's west side to its pool (picture 11)
  deck('falls-stairs', 'stairs', [[2440, 192], [2452, 194], [2460, 200], [2456, 207], [2448, 211]], 2.2, [21.6, 17, 12, 8, 4.3], { model: 'woodenboardwalk' }),
  // the footbridge over the outflow at the pool's foot (picture 11)
  deck('outflow-bridge', 'bridge', [[2444, 218], [2441, 225], [2440, 232]], 2.4, [4.3, 4.5, 4.3], { model: 'woodenboardwalk' }),
  // the suspension bridge over the outflow's gorge (pictures 9, 13): the owner's model, its span on its own sag
  // (its boards where the owner's bridge's own planks are, as the model is placed (tools/habitation/place.mjs): they sag to
  // the middle and one end is lower than the other, as his model has them; as wide as its deck between its ropes)
  deck('suspension-bridge', 'suspension', [[2388, 211], [2387, 222], [2386, 234]], 2.4, [17.6, 17.6, 17.2, 16.92, 16.63, 16.42, 16.29, 16.2, 16.22, 16.34, 16.49, 16.74, 16.73], { model: 'suspensionbridge' }),
  // the overlook's stone stairs down the cliff's face to the bay, with handrails (picture 17)
  deck('overlook-stairs', 'stairs', [[2238, 366], [2228, 362], [2218, 358], [2208, 353]], 2.4, [20.2, 13.6, 7.0, 0.7], { stone: true }),
  // the sunset beach's jetty, rope rails (pictures 14, 18)
  // (from the beach's edge, a step down from the path along it: its end posts clear of the path)
  deck('sunset-jetty', 'jetty', [[2196, 348.4], [2196, 340], [2196, 330]], 2.4, [0.75], { over: 0.7, ropes: true, model: 'woodenboardwalk' }),
  // the gazebo's floor and the pool deck by the garden pool (the owner's models)
  deck('gazebo-floor', 'platform', [[2168, 392], [2168, 386]], 6, [6.6], { rails: false, model: 'tropicalgazebo' }),
]);
// The land cut down under the decks whose boards have heights of their own (not those laid so far above whatever is
// under them, and not the gazebo's floor, in its garden): see `shaped`.
const CUT_UNDER = Object.freeze({ stairs: 0.35, other: 0.16 }), CUT_SIDE = 2.6, CUT_WALL = 1.6, CUT_TAPER = 2.5, CUT_PAST = 2.6;
const CUT_DECKS = HABITATION_DECKS.filter((d) => d.over === undefined && d.kind !== 'platform').map((d) => ({ ...d, cutBounds: boundsOf(d.line, d.width / 2 + CUT_SIDE + 16) }));
// Rails: a deck's posts stand at its edges, 0.05 m out, every 2.4 m (render-habitation.js buildDecks), and its rails
// along their tops (ropes on some). Whoever is on it keeps RAIL_IN off its edges, and whoever is beside it RAIL_OUT off
// them (stairs: the floor of the cutting they go down in, CUT_SIDE), all along it but past its ends; so it is stepped
// onto and off only at its ends, and nobody stands in its rails or its posts (22 October 2026, the owner: a walker went
// through a bridge's rails by its end, and stood half inside its posts).
const RAIL_IN = 0.5, RAIL_OUT = 0.5;
// (how far out in front of a deck's end one goes round its end's posts: clear of them however the deck lies)
const END_CLEAR = 0.8;
export const HABITATION_RAILS = Object.freeze({ inside: RAIL_IN, outside: RAIL_OUT, stairs: CUT_SIDE });
const POST_EVERY = 2.4, POST_OUT = 0.05;

// ------------------------------------------------------------------------------- the ground's height --
// Worked out at any point, the same everywhere: the rolling land, its hills and ridges, the water's beds and the sand
// down to them, the streams' beds, and the paths made level across. Kept, once worked out, in squares of 16 m.
function landAt(x, z) {
  // the land: low and rolling, a metre or so above the water
  const u = drawn(x);
  let y = 1.0 + (fbm(u / 70, z / 70) - 0.5) * 2.4 + (fbm(u / 18 + 50, z / 18) - 0.5) * 0.6;
  for (const h of HABITATION_HILLS) { const d2 = ((x - h.x) ** 2 + (z - h.z) ** 2) / (h.r * h.r); if (d2 < 9) y += h.h * Math.exp(-d2 * 1.6); }
  // the high ground: its height inside (broken a little), sheer at its edge, the edge itself ragged
  for (const g of HABITATION_HIGHLANDS) {
    if (x < g.bounds.x0 || x > g.bounds.x1 || z < g.bounds.z0 || z > g.bounds.z1) continue;
    const s = signedDistance(g.outline, x, z) + (noise(u / 11, z / 11) - 0.5) * 4;
    if (s > g.edge) continue;
    const top = g.top + g.rise * Math.max(0, x - g.bounds.x0) + (fbm(u / 24 + 9, z / 24) - 0.5) * (g.flat ? 0.4 : 3);
    const k = smooth((g.edge - s) / (g.edge * 2));
    y = Math.max(y, y + (top - y) * k);
  }
  return y;
}
// the height a path is given where it has its own (climbing a cliff, down into a gorge): along it, between its points
// whether a deck (a bridge, a boardwalk) goes on from a path's first point and from its last
const opens = new Map();
function openEnds(p) {
  if (!opens.has(p.id)) {
    const near = (pt) => HABITATION_DECKS.some((d) => [d.line[0], d.line[d.line.length - 1]].some((e) => Math.hypot(e[0] - pt[0], e[1] - pt[1]) < 2.5));
    opens.set(p.id, [near(p.line[0]), near(p.line[p.line.length - 1])]);
  }
  return opens.get(p.id);
}
function pathLevel(p, n) {
  const i = n.seg, a = p.heights[i], b = p.heights[i + 1] !== undefined ? p.heights[i + 1] : a;
  return a + (b - a) * n.t;
}
function shaped(x, z) {
  let y = landAt(x, z);
  const u = drawn(x);
  // the bowls carved into the high ground: a floor, and sheer walls up from it
  for (const b of HABITATION_BOWLS) {
    if (x < b.bounds.x0 || x > b.bounds.x1 || z < b.bounds.z0 || z > b.bounds.z1) continue;
    const s = signedDistance(b.outline, x, z) + (noise(u / 6 + 3, z / 6) - 0.5) * 2;
    y = Math.min(y, b.floor + Math.max(0, s) * b.walls);
  }
  // the streams and the boiling river: their beds, their banks, and where they run through high ground, its walls
  for (const s of CARVED) {
    if (x < s.bounds.x0 - 40 || x > s.bounds.x1 + 40 || z < s.bounds.z0 - 40 || z > s.bounds.z1 + 40) continue;
    const n = nearLine(s.line, x, z);
    const half = s.width / 2, banks = s.banks || 0;
    const surface = streamLevel(s, n);
    if (n.d < half) { y = Math.min(y, surface - s.depth + (s.depth * 0.7) * (n.d / half) ** 2); continue; }
    if (n.d < half + banks) { y = Math.min(y, surface + 0.25 + (n.d - half) * 0.12); continue; }
    if (s.walls) y = Math.min(y, surface + 0.25 + banks * 0.12 + (n.d - half - banks) * s.walls * (0.8 + 0.4 * noise(u / 5, z / 5)));
    else if (n.d < half + 10) y = Math.min(y, surface + 0.15 + (y - surface - 0.15) * smooth((n.d - half) / 10));
  }
  // the waters: their beds below their surface (an island in one is land), and the sand down to them
  for (const w of HABITATION_WATERS) {
    if (x < w.bounds.x0 || x > w.bounds.x1 || z < w.bounds.z0 || z > w.bounds.z1) continue;
    let s = signedDistance(w.outline, x, z);
    if (w.islands) {
      let isle = null, si = Infinity;
      for (const i of w.islands) { const d = signedDistance(i.outline, x, z); if (d < si) { si = d; isle = i; } }
      if (si < 0) { y = w.level + 0.05 + (isle.top - w.level) * smooth(-si / 8) + (noise(u / 4, z / 4) - 0.5) * 0.2; continue; }
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
      // (beyond an end where a bridge goes on from it, the ground is left as it is: the gorge it crosses is not filled)
      const [startOpen, endOpen] = openEnds(p);
      if ((startOpen && n.seg === 0 && n.t <= 0) || (endOpen && n.seg === p.line.length - 2 && n.t >= 1)) continue;
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
  // the decks: where a deck's boards would be under the land, the land cut down below them (22 October 2026, the owner:
  // the big waterfall's wooden stairs went down into the cliff's top, and whoever walked down them went through the
  // ground and came out under it). All along it, not past its ends (where the way goes on at its boards' height): a
  // floor below its boards (CUT_UNDER, less near its ends) from its middle to CUT_SIDE beyond its edges, so that the
  // ground as drawn (2.5 m triangles: HABITATION_GROUND) is under its boards everywhere on it, and from there walls of
  // rock (CUT_WALL up for each metre out) up to the land. The stairs go down in a cutting in the cliff, open to the sky.
  // (and in front of each end, the land comes down to its boards there, rising from them gently: no step up onto a
  // bridge's end, and the ground drawn not over its last boards)
  for (const d of CUT_DECKS) {
    const c = d.cutBounds;
    if (x < c.x0 || x > c.x1 || z < c.z0 || z > c.z1) continue;
    const n = nearLine(d.line, x, z);
    if (n.at <= 0 || n.at >= n.length) {
      // (past an end: `e` metres past it, `l` to the side of the way on; for a grid's square past it, and as far to the
      // side as its cutting's floor reaches, the land no higher than its boards there, rising from them gently)
      const first = n.at <= 0, [px, pz] = first ? d.line[0] : d.line[d.line.length - 1], [qx, qz] = first ? d.line[1] : d.line[d.line.length - 2];
      const len = Math.hypot(px - qx, pz - qz) || 1, ux = (px - qx) / len, uz = (pz - qz) / len;
      const e = (x - px) * ux + (z - pz) * uz, l = Math.abs((z - pz) * ux - (x - px) * uz);
      if (e <= CUT_PAST && l <= d.width / 2 + CUT_SIDE) y = Math.min(y, deckHeight(d, n, x, z) - 0.08 + Math.max(0, e) * 0.2);
      continue;
    }
    const ends = Math.max(0.5, Math.min(1, n.at / CUT_TAPER, (n.length - n.at) / CUT_TAPER));
    const floor = deckHeight(d, n, x, z) - (d.kind === 'stairs' ? CUT_UNDER.stairs : CUT_UNDER.other) * ends;
    y = Math.min(y, floor + Math.max(0, n.d - d.width / 2 - CUT_SIDE) * CUT_WALL);
  }
  // at its west edge the land comes down to the town's level (the car park, the road's end and the land along the
  // river lie at the town's ground): level with it at the edge, rising to its own over the first 24 m in
  const inward = x - HABITATION.bounds.x0;
  if (inward < 24 && y > 0) y *= smooth(inward / 24);
  // and at its far edges, beyond the boiling river, down to the level of the bush beyond it (render-habitation.js: apron)
  const b = HABITATION.bounds, out = Math.min(b.x1 - x, z - b.z0, b.z1 - z);
  if (out < 14 && y > 0) y *= smooth(out / 14);
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
// The land's 1 m squares over the boxes given worked out ahead, one tile of them a step (a generator: 289 points of the
// land's shape, a few milliseconds each on a phone): what the habitation's waters are drawn from (habitationWaterAt),
// worked out piece by piece before they are built rather than all at once as they are (26 October 2026: seven seconds of
// a phone's page on its settings here).
export function* habitationLandWarm(boxes) {
  for (const b of boxes) {
    for (let j = Math.floor(b.z0 / TILE); j <= Math.floor(b.z1 / TILE); j += 1) for (let i = Math.floor(b.x0 / TILE); i <= Math.floor(b.x1 / TILE); i += 1) {
      if (tiles.has(i * 100003 + j)) continue;
      heightTile(i, j);
      yield;
    }
  }
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
// The same as habitationLand, to the last bit, working out only the square's corners it is made from: a 1 m square's
// four points (as a square of the 16 m tile holds them, Float32), or two where it is on the square's side (one from
// the other is then weighted nothing). For the drawn ground's points, 2.5 m apart (habitationGroundPoint): through
// the tiles, every point of every 1 m square over the habitation was worked out for them, about 630,000, where these
// want about 230,000 (26 October 2026, the owner's brief: the game hung on his phones; the habitation's ground was 25
// seconds of it on a phone's settings). The last few rows of corners are kept, the drawn ground being worked out a row
// at a time.
const cornerRows = new Map();
let cornerX0 = 0, cornerW = 0;
function corner(ix, iz) {
  if (!cornerW) { cornerX0 = Math.floor(HABITATION_GROUND.x0) - 2; cornerW = Math.ceil(HABITATION_GROUND.x1) + 4 - cornerX0; }
  const at = ix - cornerX0;
  if (at < 0 || at >= cornerW) return Math.fround(shaped(ix, iz));
  let row = cornerRows.get(iz);
  if (!row) { if (cornerRows.size >= 6) cornerRows.delete(cornerRows.keys().next().value); row = new Float32Array(cornerW).fill(NaN); cornerRows.set(iz, row); }
  let h = row[at];
  if (h !== h) { h = Math.fround(shaped(ix, iz)); row[at] = h; }
  return h;
}
function landOnGrid(x, z) {
  const i = Math.floor(x / TILE), j = Math.floor(z / TILE);
  const fx = x - i * TILE, fz = z - j * TILE;
  const a = Math.min(TILE - 1, Math.floor(fx)), b = Math.min(TILE - 1, Math.floor(fz));
  const u = fx - a, v = fz - b, ix = i * TILE + a, iz = j * TILE + b;
  const h00 = corner(ix, iz);
  const h10 = u ? corner(ix + 1, iz) : h00, h01 = v ? corner(ix, iz + 1) : h00, h11 = u && v ? corner(ix + 1, iz + 1) : h00;
  return h00 + (h10 - h00) * u + (h01 - h00) * v + (h00 - h10 - h01 + h11) * u * v;
}

// The ground as it is drawn (render-habitation.js buildGround): points 2.5 m apart over the habitation and 30 m past its
// edges, each square of four of them two triangles (split from its corner at +x to its corner at +z), and its height
// anywhere that of the triangle it falls in. Where a figure's feet are, what is laid on the ground, and below what a
// camera never goes (22 October 2026, the owner: a walker on a steep sandy bank was drawn sunk into it, to the head;
// the ground drawn on a phone was then a coarser grid, 5 m, which stood far above the ground worked out between its
// points at the foot of a steep bank). Past the habitation's south edge, under the town's ground and the car park's tar,
// it is kept a little below them, as they are drawn there.
export const HABITATION_GROUND = Object.freeze({ step: 2.5, pad: 30, x0: HABITATION.bounds.x0 - 30, z0: HABITATION.bounds.z0 - 30, x1: HABITATION.bounds.x1 + 30, z1: HABITATION.bounds.z1 + 30 });
const GN = Object.freeze({ x: Math.ceil((HABITATION_GROUND.x1 - HABITATION_GROUND.x0) / HABITATION_GROUND.step) + 1, z: Math.ceil((HABITATION_GROUND.z1 - HABITATION_GROUND.z0) / HABITATION_GROUND.step) + 1 });
const groundPoints = new Float32Array(GN.x * GN.z).fill(NaN);
export function habitationGroundPoint(i, j) {
  const k = j * GN.x + i;
  if (i >= 0 && j >= 0 && i < GN.x && j < GN.z && !Number.isNaN(groundPoints[k])) return groundPoints[k];
  const G = HABITATION_GROUND, x = G.x0 + i * G.step, z = G.z0 + j * G.step;
  let y = landOnGrid(x, z);
  if (x < HABITATION.bounds.x0) y = Math.min(y, -0.12);
  const P = UPRIVER.park;
  if (x < P.x1 + 1.5 && z > P.z0 - 1.5 && z < P.z1 + 1.5) y = Math.min(y, -0.08);
  if (i >= 0 && j >= 0 && i < GN.x && j < GN.z) { const f = endFill().get(k); if (f !== undefined && y < f) y = f; groundPoints[k] = y; }
  return y;
}
// The drawn ground's points as the build worked them out (render-habitation.js: the file beside the page, the same
// numbers as habitationGroundPoint gives here), taken for every point not yet worked out: the walkers stand on the very
// ground drawn, and nothing of it is worked out again (26 October 2026).
export function habitationGroundGiven(heights) {
  if (!heights || heights.length !== groundPoints.length) return false;
  for (let k = 0; k < groundPoints.length; k += 1) if (Number.isNaN(groundPoints[k])) groundPoints[k] = heights[k];
  return true;
}
// In front of a deck's end the ground drawn is a step from its boards (22 October 2026: one steps off its end onto the
// ground there, there being no boards past it). Where a triangle of it, in front of the end or under its first metres,
// reaches down into a gorge beside it (the suspension bridge's south end stood over a notch 2.3 m deep, the drawn
// triangle there having a corner deep in the gorge), its low corners are brought up to a little below the boards over
// them: a shelf of rock the end rests on. Not where they are in water; not the gate's bridge at the car park.
const END_FILL = Object.freeze({ stairs: 0.4, other: 0.25 });
let endFills = null, endFillMap = null, endFillJob = null, endFillBusy = false;
function stepEndFill(all) {
  if (!endFillJob) { endFillMap = new Map(); endFillJob = endFillSteps(endFillMap); }
  endFillBusy = true;
  try {
    do { if (endFillJob.next().done) { endFills = endFillMap; endFillJob = null; return true; } } while (all);
  } finally { endFillBusy = false; }
  return false;
}
function endFill() {
  if (endFills) return endFills;
  // (asked for while it is being worked out, by a deck's height over the ground drawn under it: as it is so far, as it
  // always was)
  if (endFillBusy) return endFillMap;
  stepEndFill(true);
  return endFills;
}
// The ends' fill a row at a time (a generator), for the drawn ground worked out a few milliseconds a frame (26 October
// 2026: worked out all at once it is a second or more of a phone's page: render-habitation.js, groundDataSteps). The
// sim asking for it meanwhile (endFill) finishes the same work, in the same order.
export function* habitationGroundWarm() {
  while (!endFills && !stepEndFill(false)) yield;
}
function* endFillSteps(endFills) {
  const G = HABITATION_GROUND;
  for (const d of CUT_DECKS) {
    for (const last of [false, true]) {
      if (d.entrance && !last) continue;
      const [ex, ez] = d.line[last ? d.line.length - 1 : 0], [nx, nz] = d.line[last ? d.line.length - 2 : 1];
      const l = Math.hypot(nx - ex, nz - ez) || 1, ix = (nx - ex) / l, iz = (nz - ez) / l, half = d.width / 2 - RAIL_IN + 0.2;
      // (no higher than below its end's boards: where stairs go up from it, the ground under them between is not lifted
      // up through them)
      const top = deckHeight(d, nearLine(d.line, ex + ix * 0.01, ez + iz * 0.01), ex, ez);
      for (let b = -0.3; b <= 1.5 + 1e-9; b += 0.1) {
        for (let s0 = -half; s0 <= half + 1e-9; s0 += 0.1) {
          const x = ex - ix * b - iz * s0, z = ez - iz * b + ix * s0;
          const fi = (x - G.x0) / G.step, fj = (z - G.z0) / G.step, i = Math.floor(fi), j = Math.floor(fj);
          for (const [ci, cj] of fi - i + (fj - j) <= 1 ? [[i, j], [i + 1, j], [i, j + 1]] : [[i + 1, j + 1], [i, j + 1], [i + 1, j]]) {
            if (ci < 0 || cj < 0 || ci >= GN.x || cj >= GN.z) continue;
            const vx = G.x0 + ci * G.step, vz = G.z0 + cj * G.step;
            if (habitationWaterAt(vx, vz)) continue;
            const want = Math.min(top, deckHeight(d, nearLine(d.line, vx, vz), vx, vz)) - (d.kind === 'stairs' ? END_FILL.stairs : END_FILL.other), k = cj * GN.x + ci;
            if (!(endFills.get(k) >= want)) endFills.set(k, want);
          }
        }
        yield;
      }
    }
  }
}
export const HABITATION_GROUND_POINTS = GN;
export function habitationGroundAt(x, z) {
  const G = HABITATION_GROUND, fi = (x - G.x0) / G.step, fj = (z - G.z0) / G.step;
  const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j;
  const a = habitationGroundPoint(i, j), b = habitationGroundPoint(i + 1, j), c = habitationGroundPoint(i, j + 1);
  if (u + v <= 1) return a + (b - a) * u + (c - a) * v;
  const d = habitationGroundPoint(i + 1, j + 1);
  return d + (c - d) * (1 - u) + (b - d) * (1 - v);
}

// ------------------------------------------------------------------------------------ what is where --
// The water at a point, if any: which, its surface, and how deep it is there.
export function habitationWaterAt(x, z) {
  // (the land's height there, worked out only once some water is near enough to want it: most of the habitation is
  // dry, and the land's shape is the dear part (26 October 2026: the fish and birds' first places, asked over the whole
  // habitation, were seven seconds of a phone's page on its settings here). The same answers as when it was worked out
  // first.)
  let land;
  const ground = () => (land === undefined ? (land = habitationLand(x, z)) : land);
  for (const w of HABITATION_WATERS) {
    if (x < w.bounds.x0 || x > w.bounds.x1 || z < w.bounds.z0 || z > w.bounds.z1) continue;
    if (inside(w.outline, x, z) && ground() < w.level && !(w.islands && w.islands.some((i) => inside(i.outline, x, z) && ground() > w.level - 0.02))) return { id: w.id, kind: w.kind, level: w.level, depth: w.level - ground() };
  }
  const niger = x < RIVER_HEAD + 6 && z > riverShore(x) && z < RIVER_FAR && ground() < WATER;
  // the boiling river (where it runs into the Niger, the Niger; where the moat leaves it at its spring, still the boiling
  // river): its water, and its bank for a little way beyond, so that whoever comes to it stands on its bank, never at
  // the very edge of the water drawn
  const h = HABITATION_HOT_RIVER;
  if (!niger && x >= h.bounds.x0 && x <= h.bounds.x1 && z >= h.bounds.z0 && z <= h.bounds.z1) {
    const n = nearLine(h.line, x, z);
    if (n.d < h.width / 2 + HOT_EDGE) { const level = streamLevel(h, n); return { id: h.id, kind: 'hot', level, depth: Math.max(0.05, level - ground()), hot: true }; }
  }
  for (const s of HABITATION_STREAMS) {
    if (x < s.bounds.x0 || x > s.bounds.x1 || z < s.bounds.z0 || z > s.bounds.z1) continue;
    const n = nearLine(s.line, x, z);
    if (n.d < s.width / 2) { const level = streamLevel(s, n); if (ground() < level) return { id: s.id, kind: s.rapids ? 'rapids' : 'stream', level, depth: s.deep ? Math.max(1, level - ground()) : level - ground() }; }
  }
  if (niger) return { id: 'niger', kind: 'river', level: WATER, depth: WATER - ground() };
  return null;
}
// How far a point is from the boiling river's water (metres; 0 in it), where along it, and its water's height there:
// for its steam and its sound, and for keeping its banks clear.
export function hotRiverNear(x, z) {
  const h = HABITATION_HOT_RIVER;
  const n = nearLine(h.line, x, z);
  return { d: Math.max(0, n.d - h.width / 2), at: n.at, of: n.length, level: streamLevel(h, n), seg: n.seg, t: n.t };
}
// A deck at a point, if any: which, and the height of its boards there.
export function habitationDeckAt(x, z) {
  for (const d of HABITATION_DECKS) {
    if (x < d.bounds.x0 || x > d.bounds.x1 || z < d.bounds.z0 || z > d.bounds.z1) continue;
    const n = nearLine(d.line, x, z);
    const onPlatform = d.platform && Math.hypot(x - d.platform.x, z - d.platform.z) < d.platform.r;
    if (n.d > d.width / 2 && !onPlatform) continue;
    // (out past its ends one is on the ground in front of it, not on boards that are not there: 22 October 2026; the
    // gazebo's round floor, all of it)
    if (!onPlatform && d.kind !== 'platform' && (n.at <= 1e-6 || n.at >= n.length - 1e-6)) continue;
    return { deck: d, y: deckHeight(d, n, x, z), along: n.at, of: n.length };
  }
  return null;
}
// A deck's rails at a point (RAIL_IN inside its edges, RAIL_OUT beyond them; for stairs, the floor of their cutting,
// CUT_SIDE), anywhere along it but past its ends: the deck, or null. The round platform among the swamp's trees has
// them round its edge, but where its boardwalk joins it.
export function habitationRailsAt(x, z) {
  for (const d of HABITATION_DECKS) {
    if (!d.rails) continue;
    const out = d.kind === 'stairs' ? CUT_SIDE : RAIL_OUT;
    if (x < d.bounds.x0 - out || x > d.bounds.x1 + out || z < d.bounds.z0 - out || z > d.bounds.z1 + out) continue;
    const n = nearLine(d.line, x, z);
    const along = n.at > 1e-6 && n.at < n.length - 1e-6;
    const p = d.platform ? Math.hypot(x - d.platform.x, z - d.platform.z) : Infinity;
    // (in the way between its rails, or out past its ends, where the way goes on)
    if ((along ? n.d <= d.width / 2 - RAIL_IN : n.d <= d.width / 2) || (d.platform && p <= d.platform.r - RAIL_IN)) continue;
    if ((along && n.d <= d.width / 2 + out) || p <= (d.platform ? d.platform.r + RAIL_OUT : -1)) return d;
  }
  return null;
}
// Going up a flight of stairs (the big waterfall's wooden ones, the overlook's stone ones) at (x, z), facing `heading`
// (0 toward +z, as the game turns): for a figure's own climb up them (animated.js).
export function habitationClimbing(x, z, heading) {
  const d = habitationDeckAt(x, z);
  if (!d || d.deck.kind !== 'stairs') return false;
  const ahead = habitationDeckAt(x + Math.sin(heading) * 0.8, z + Math.cos(heading) * 0.8);
  return !!ahead && ahead.deck === d.deck && ahead.y > d.y + 0.15;
}
// A step on a deck that would run into its rails, turned along the deck instead: the part of it along the deck where
// the walker is, and a little toward its middle (22 October 2026: with its rails in the way, a walker going along a
// bending boardwalk or the stairs would otherwise be stopped at every bend). And at a deck's end, a step in toward it
// that would go into its end's posts or rails, from out to one side of its way in: round in front of them to its way in
// (a walker coming at a bridge from beside its end is not stopped there). `ok(x, z)`, if given, says whether a step
// to (x, z) can be taken: the first turn that can is given. Null where there is none.
export function habitationAlongDeck(x, z, dx, dz, ok = null) {
  const step = Math.hypot(dx, dz);
  if (step < 1e-6) return null;
  for (const t of deckTurns(x, z, dx, dz, step)) if (t && (!ok || ok(x + t.dx, z + t.dz))) return t;
  return null;
}
function deckTurns(x, z, dx, dz, step) {
  const toward = (tx, tz) => { const gx = tx - x, gz = tz - z, g = Math.hypot(gx, gz); if (g < 1e-6) return null; const k = Math.min(step, g) / g; return { dx: gx * k, dz: gz * k }; };
  const here = habitationDeckAt(x, z);
  if (here && !pastEnd(here.deck, x, z)) {
    const line = here.deck.line, n = nearLine(line, x, z);
    const [ax, az] = line[n.seg], [bx, bz] = line[n.seg + 1];
    const len = Math.hypot(bx - ax, bz - az) || 1, tx = (bx - ax) / len, tz = (bz - az) / len;
    const along = dx * tx + dz * tz;
    const cx = ax + (bx - ax) * n.t - x, cz = az + (bz - az) * n.t - z, off = Math.hypot(cx, cz);
    const pull = off > 1e-6 ? Math.min(off, Math.abs(along) * 0.35) / off : 0;
    return [{ dx: tx * along + cx * pull, dz: tz * along + cz * pull }, toward(x + cx, z + cz)];
  }
  // (out past an end of a deck with rails, near it, going in toward it)
  for (const d of HABITATION_DECKS) {
    if (!d.rails || x < d.bounds.x0 - 3 || x > d.bounds.x1 + 3 || z < d.bounds.z0 - 3 || z > d.bounds.z1 + 3) continue;
    for (const last of [false, true]) {
      const [ex, ez] = d.line[last ? d.line.length - 1 : 0], [nx, nz] = d.line[last ? d.line.length - 2 : 1];
      const l = Math.hypot(nx - ex, nz - ez) || 1, ix = (nx - ex) / l, iz = (nz - ez) / l;
      const behind = (ex - x) * ix + (ez - z) * iz, side = (x - ex) * -iz + (z - ez) * ix;
      if (behind < -1e-3 || behind > 2.5 || Math.abs(side) > d.width / 2 + 2.5 || dx * ix + dz * iz < 0.3 * step) continue;
      // (in front of its way between its rails: on in, toward its middle; else along in front of its end toward its
      // middle; or round in front of its end's posts to its way in; or backing off them)
      return [Math.abs(side) <= d.width / 2 - RAIL_IN - 0.05 ? toward(ex + ix * 0.8, ez + iz * 0.8) : null,
        toward(ex - ix * behind, ez - iz * behind), toward(ex - ix * END_CLEAR, ez - iz * END_CLEAR), toward(x - ix, z - iz)];
    }
  }
  return [];
}
// Past one of a deck's ends (its way going on from there), not beside it.
const pastEnd = (d, x, z) => { const n = nearLine(d.line, x, z); return n.at <= 1e-6 || n.at >= n.length - 1e-6; };
// Its posts (each a box the size of the post: render-habitation.js draws them, and its rails along their tops), for a
// deck drawn with them: every POST_EVERY metres along both its edges, from its end. None where it would stand in the way
// of whoever walks along another stretch of it: on the inside of a sharp turn of the stairs, where the swamp's
// boardwalk crosses itself, on the swamp's round platform (there the rails stop on either side: `run` says between
// which posts a rail goes).
const awayFrom = (d, x, z, seg) => {
  // (how far a point is from the deck's way along its other stretches, leaving out the one `seg` it is beside)
  let best = Infinity;
  for (let i = 0; i + 1 < d.line.length; i += 1) {
    if (i === seg) continue;
    const [ax, az] = d.line[i], [bx, bz] = d.line[i + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1e-9;
    const u = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
    best = Math.min(best, Math.hypot(ax + dx * u - x, az + dz * u - z));
  }
  return best;
};
export const HABITATION_DECK_POSTS = Object.freeze(HABITATION_DECKS.filter((d) => d.kind !== 'suspension' && d.kind !== 'platform').flatMap((d) => {
  const out = [], half = d.stone ? 0.11 : 0.06, runs = [0, 0], open = [true, true];
  for (let s0 = 0.1; s0 <= d.length; s0 += POST_EVERY) {
    const at = Math.min(s0, d.length - 0.05);
    let run = 0;
    for (let i = 0; i + 1 < d.line.length; i += 1) {
      const [ax, az] = d.line[i], [bx, bz] = d.line[i + 1], len = Math.hypot(bx - ax, bz - az);
      if (run + len >= at || i === d.line.length - 2) {
        const t = Math.min(1, Math.max(0, (at - run) / (len || 1))), dx = (bx - ax) / (len || 1), dz = (bz - az) / (len || 1);
        const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
        [-1, 1].forEach((side, k) => {
          const x = px - dz * side * (d.width / 2 + POST_OUT), z = pz + dx * side * (d.width / 2 + POST_OUT);
          const onWay = (d.platform && Math.hypot(x - d.platform.x, z - d.platform.z) < d.platform.r + 0.2) || awayFrom(d, x, z, i) < d.width / 2 - RAIL_IN + 0.46;
          if (onWay) { if (open[k]) { runs[k] += 1; open[k] = false; } return; }
          open[k] = true;
          out.push(Object.freeze({ deck: d.id, s: at, side, run: runs[k], x, z, half, end: s0 < 1 || s0 + POST_EVERY > d.length }));
        });
        break;
      }
      run += len;
    }
  }
  return out;
}));
// A boardwalk or jetty laid so far above what is under it comes down at an end that one walks on from, onto land or
// into shallow water, to just above it, over its last OVER_RAMP metres (22 October 2026: its end had stood up to a
// metre above the ground, one stepping up onto it, and out past it onto nothing).
const OVER_RAMP = 4, OVER_END = 0.06;
const endsLand = new Map();
function endLands(d, last) {
  const key = `${d.id}:${last ? 1 : 0}`;
  if (!endsLand.has(key)) {
    const [ex, ez] = d.line[last ? d.line.length - 1 : 0], [nx, nz] = d.line[last ? d.line.length - 2 : 1], l = Math.hypot(nx - ex, nz - ez) || 1;
    const f = landFooting(ex - ((nx - ex) / l) * 1.2, ez - ((nz - ez) / l) * 1.2);
    endsLand.set(key, !!(f && f.walk));
  }
  return endsLand.get(key);
}
function deckHeight(d, n, x, z) {
  if (d.over !== undefined) {
    // so far above what is under it, right across it: the water's surface, or the ground as it is drawn where there is
    // no water (its boards level across, as they are drawn)
    const [ax, az] = d.line[n.seg], [bx, bz] = d.line[n.seg + 1], len = Math.hypot(bx - ax, bz - az) || 1;
    const px = ax + (bx - ax) * n.t, pz = az + (bz - az) * n.t, sx = (-(bz - az) / len) * (d.width / 2), sz = ((bx - ax) / len) * (d.width / 2);
    let under = -Infinity;
    for (const k of [-1, 0, 1]) {
      const qx = px + sx * k, qz = pz + sz * k, w = habitationWaterAt(qx, qz);
      under = Math.max(under, w ? w.level : -Infinity, habitationGroundAt(qx, qz));
    }
    const from = Math.min(endLands(d, false) ? n.at : Infinity, endLands(d, true) ? n.length - n.at : Infinity);
    return under + OVER_END + (d.over - OVER_END) * smooth(from / OVER_RAMP);
  }
  const h = d.heights;
  if (h.length === 1) return h[0];
  // (a suspension bridge hangs: its boards sag between its ends, lowest at its middle)
  const t = n.at / (n.length || 1);
  const k = t * (h.length - 1), i = Math.min(h.length - 2, Math.floor(k));
  return h[i] + (h[i + 1] - h[i]) * (k - i);
}

// Where one may walk (21 October 2026, the owner: free to go anywhere nothing stands in the way): on a deck, a path, sand,
// open grass, the forest's floor and the rest of the land, and in water shallow enough to wade; not up a cliff's face,
// in deep or fast water, anywhere in the boiling river, nor beyond it and the moat (the bush). (What stands there, a trunk, a plant, a rock, the gazebo, is
// in the way as well: HABITATION_COLLIDERS.) `footOnly`: a deck (no vehicle goes onto it). `kind`: what is underfoot.
const WADE = 0.55;
const STEEP = 1.0;            // a slope steeper than this (metres up for each metre along) is a cliff's face: not stood on
// (on the ground as it is drawn, where one stands: 22 October 2026, a bank in the finer land under a gentle slope of it
// had stood in a walker's way unseen, and a slope drawn steep been walked up)
export function habitationSteep(x, z) {
  const gx = habitationGroundAt(x + 0.5, z) - habitationGroundAt(x - 0.5, z), gz = habitationGroundAt(x, z + 0.5) - habitationGroundAt(x, z - 0.5);
  return Math.hypot(gx, gz) > STEEP;
}
export function habitationFooting(x, z) {
  const b = HABITATION.bounds;
  if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) return null;
  const deckHere = habitationDeckAt(x, z);
  // (on a deck within its rails' reach, or beside it: its rails and posts, not stood in)
  const rails = habitationRailsAt(x, z);
  if (rails) return { walk: false, kind: 'rail', deck: rails.id, ...(deckHere ? { footOnly: true, y: deckHere.y } : {}) };
  if (deckHere) return { walk: true, footOnly: true, kind: deckHere.deck.kind, deck: deckHere.deck.id, y: deckHere.y };
  return landFooting(x, z);
}
// What is underfoot on the ground itself, whatever deck is over it: the water, its banks, a path, sand, grass, the
// forest's floor or a cliff's face (for the ground's colours, render-habitation.js; null outside the habitation).
export function habitationGroundKind(x, z) {
  const b = HABITATION.bounds;
  if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) return null;
  return landFooting(x, z);
}
function landFooting(x, z) {
  const w = habitationWaterAt(x, z);
  if (w) {
    if (w.hot) return { walk: false, kind: 'hot', water: w.id, depth: w.depth };
    return w.depth <= WADE && w.kind !== 'rapids' ? { walk: true, kind: 'shallows', water: w.id, y: w.level - w.depth } : { walk: false, kind: 'water', water: w.id, depth: w.depth };
  }
  // (the boiling river's bank, four metres up from its water: not stood on; where it runs into the Niger, the Niger's)
  { const h = HABITATION_HOT_RIVER; if (!(x < RIVER_HEAD + 6 && z > riverShore(x) && z < RIVER_FAR) && nearLine(h.line, x, z).d < h.width / 2 + HOT_BANK) return { walk: false, kind: 'hot', water: h.id, bank: true, depth: 0 }; }
  // (beyond the moat and the boiling river: the bush)
  if (!inside(HOME, x, z)) return { walk: false, kind: 'beyond' };
  for (const p of HABITATION_PATHS) {
    if (x < p.bounds.x0 || x > p.bounds.x1 || z < p.bounds.z0 || z > p.bounds.z1) continue;
    if (nearLine(p.line, x, z).d <= p.width / 2) return { walk: true, kind: 'path', surface: p.surface, path: p.id };
  }
  for (const s of HABITATION_SAND) if (x >= s.bounds.x0 && x <= s.bounds.x1 && z >= s.bounds.z0 && z <= s.bounds.z1 && inside(s.outline, x, z)) return { walk: true, kind: 'sand', area: s.id };
  for (const g of HABITATION_GRASS) if (x >= g.bounds.x0 && x <= g.bounds.x1 && z >= g.bounds.z0 && z <= g.bounds.z1 && inside(g.outline, x, z)) return { walk: true, kind: 'grass', area: g.id };
  // the rest of the land, the forest's floor: walked, unless it is a cliff's face
  return habitationSteep(x, z) ? { walk: false, kind: 'cliff' } : { walk: true, kind: 'forest' };
}
export const onHabitation = (x, z) => { const f = habitationFooting(x, z); return !!(f && f.walk); };
// One step from (ax, az) to (bx, bz) in the habitation: onto or off a bridge, a boardwalk, a jetty or stairs only at its
// ends (its rails are in the way along its sides; a deck without rails, anywhere), never down off it onto the ground or
// the water far below, and on the land no drop or climb more than a stride can take. (The simulation's `move` and the
// page's own walking both ask it, step by step.)
const DECK_STEP = 1.1, LAND_STEP = 0.9;
export function habitationStep(ax, az, bx, bz) {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.4));
  let px = ax, pz = az, pd = habitationDeckAt(ax, az), py = pd ? pd.y : habitationGroundY(ax, az);
  for (let i = 1; i <= n; i += 1) {
    const x = ax + ((bx - ax) * i) / n, z = az + ((bz - az) * i) / n;
    // (never through a deck's rails on the way: they stand all along it)
    if (habitationRailsAt(x, z)) return false;
    const d = habitationDeckAt(x, z), y = d ? d.y : habitationGroundY(x, z);
    if (pd && d && pd.deck === d.deck) { /* along the same deck */ }
    else if (pd || d) {
      // onto, off or between decks: a deck with rails from past its end, where its way goes on, and no higher a step
      // than onto a low boardwalk
      if ((pd && pd.deck.rails && !pastEnd(pd.deck, x, z)) || (d && d.deck.rails && !pastEnd(d.deck, px, pz)) || Math.abs(y - py) > DECK_STEP) return false;
    } else if (Math.abs(y - py) > LAND_STEP) return false;
    px = x; pz = z; pd = d; py = y;
  }
  return true;
}
// Where no vehicle goes (21 October 2026, the owner: the habitation is entered on foot, the vehicle left at its car
// park): a deck (its id, its name for a sign, and whether it is the gate's bridge), and the rest of the habitation's
// land, anywhere beyond the car park and the road to it.
export function habitationFootOnly(x, z) {
  const b = HABITATION.bounds;
  if (x < b.x0 - 4 || x > b.x1 || z < b.z0 || z > b.z1) return null;
  const d = habitationDeckAt(x, z);
  if (d) return { id: d.deck.id, kind: d.deck.kind, entrance: !!d.deck.entrance };
  if (x < b.x0 || onUpriver(x, z)) return null;
  return { id: 'habitation', kind: 'land', entrance: false };
}
// What a vehicle stopped there is told.
export const footOnlySaid = (f) => (f && f.kind === 'land' ? 'Get off your vehicle: the habitation is entered on foot.' : 'Get off your vehicle to cross the bridge.');
// The ground's height where one stands: a deck's boards, or the ground as it is drawn (the land, or the bed of shallow
// water: habitationGroundAt).
export function habitationGroundY(x, z) {
  const f = habitationFooting(x, z);
  if (!f) return 0;
  if (f.footOnly) return f.y;
  return habitationGroundAt(x, z);
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
// The wood of each tree, palm and banana at a walker's height (21 October 2026: the big trees' buttresses and roots
// reach out 5 to 15 m from their trunks and were walked through; the box above is only its trunk's middle): the
// half-metre squares of habitation-roots.js (made from the owner's files) for each copy, at its size and turned as it
// stands, kept as one bit for each half-metre square of the habitation. None on a path or a deck or within 0.8 m of
// one's edge (a root never closes a way), nor for a tree on a pillar's top. They stand 2.2 m high: a camera above that
// looks over them.
import { HABITATION_ROOTS, HABITATION_ROOT_CELL } from './habitation-roots.js';
const RG = 0.5, RB = HABITATION.bounds;
const RNX = Math.ceil((RB.x1 - RB.x0) / RG) + 1, RNZ = Math.ceil((RB.z1 - RB.z0) / RG) + 1;
const ROOT_TOP = 2.2;
const bitAt = (bits, i, j) => (i < 0 || j < 0 || i >= RNX || j >= RNZ ? 0 : (bits[(j * RNX + i) >>> 5] >>> ((j * RNX + i) & 31)) & 1);
const setBit = (bits, i, j) => { if (i < 0 || j < 0 || i >= RNX || j >= RNZ) return; const k = j * RNX + i; bits[k >>> 5] |= 1 << (k & 31); };
const rootBits = new Uint32Array(Math.ceil((RNX * RNZ) / 32));
let rootSquares = 0;
const rootsMade = Date.now();
{
  // (the ways first: every square whose middle is within 0.8 m of a path's or a deck's edge, along them every 0.4 m)
  const wayBits = new Uint32Array(rootBits.length);
  const mark = (x, z, reach) => {
    const i0 = Math.floor((x - reach - RB.x0) / RG), i1 = Math.floor((x + reach - RB.x0) / RG);
    const j0 = Math.floor((z - reach - RB.z0) / RG), j1 = Math.floor((z + reach - RB.z0) / RG);
    for (let j = j0; j <= j1; j += 1) for (let i = i0; i <= i1; i += 1) {
      const cx = RB.x0 + (i + 0.5) * RG, cz = RB.z0 + (j + 0.5) * RG;
      if ((cx - x) * (cx - x) + (cz - z) * (cz - z) <= reach * reach) setBit(wayBits, i, j);
    }
  };
  for (const w of [...HABITATION_PATHS, ...HABITATION_DECKS]) {
    const reach = w.width / 2 + 0.8 + RG * 0.71;
    for (let k = 0; k + 1 < w.line.length; k += 1) {
      const [ax, az] = w.line[k], [bx, bz] = w.line[k + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.4));
      for (let t = 0; t <= n; t += 1) mark(ax + ((bx - ax) * t) / n, az + ((bz - az) * t) / n, reach);
    }
    if (w.platform) mark(w.platform.x, w.platform.z, w.platform.r + 0.8 + RG * 0.71);
  }
  for (const p of HABITATION_STANDING) {
    const R = HABITATION_ROOTS[p.m];
    if (!R || !R.cells.length || p.y !== null) continue;
    const k = p.s / R.ref, c = Math.cos(p.r), sn = Math.sin(p.r), size = HABITATION_ROOT_CELL * k;
    for (const [ci, cj] of R.cells) {
      const lx = (ci + 0.5) * size, lz = (cj + 0.5) * size;
      // (where the square's middle stands, turned as the tree is: three.js's turn about the upright, as it is drawn;
      // the habitation's square it falls in is its wood)
      const x = p.x + lx * c + lz * sn, z = p.z - lx * sn + lz * c;
      const i = Math.floor((x - RB.x0) / RG), j = Math.floor((z - RB.z0) / RG);
      if (!bitAt(wayBits, i, j) && !bitAt(rootBits, i, j)) { setBit(rootBits, i, j); rootSquares += 1; }
    }
  }
}
// How many half-metre squares of the habitation its trees' wood takes at a walker's height (and how long it took to work
// out, in milliseconds).
export const HABITATION_ROOT_SQUARES = rootSquares;
export const HABITATION_ROOTS_MADE = Date.now() - rootsMade;
// Is there a tree's wood (a buttress, a root arching up, a prop root, its trunk) within `radius` of (x, z), at a
// walker's height? `above`: how high above the ground the point is (a camera's eye): over 2.2 m, nothing of it.
export function habitationRootAt(x, z, radius = 0.4, above = 0) {
  if (above > ROOT_TOP || x < RB.x0 - radius || x > RB.x1 + radius || z < RB.z0 - radius || z > RB.z1 + radius) return false;
  const i0 = Math.floor((x - radius - RB.x0) / RG), i1 = Math.floor((x + radius - RB.x0) / RG);
  const j0 = Math.floor((z - radius - RB.z0) / RG), j1 = Math.floor((z + radius - RB.z0) / RG);
  for (let j = j0; j <= j1; j += 1) for (let i = i0; i <= i1; i += 1) if (bitAt(rootBits, i, j)) return true;
  return false;
}
// Filled in by habitation-scene.js (where each of the owner's models stands, and the rocks): each a solid box the size
// of its trunk or stone at the ground.
export const HABITATION_GATE_SIGN = Object.freeze({ id: 'habitation-gate', lines: ['THE HABITATION', 'On foot from here'], x: 1874 + S, z: 97, facing: -Math.PI / 2, width: 5.2, height: 1.8, palette: ['#ffffff', '#1f5a3a'] });
// The signs along the boiling river (21 October 2026, the owner): on its near bank wherever one can walk to it, and at
// the edges of the cliffs above it; each faces whoever comes toward the river. Black on amber, as a warning is.
const WARN = Object.freeze(['DANGER: BOILING RIVER', 'The water is boiling hot. Keep away.']);
const warn = (id, x, z, facing) => Object.freeze({ id, lines: WARN, x: x + S, z, facing, width: 3.4, height: 1.5, palette: Object.freeze(['#1a1a1a', '#f4c430']), ground: true });
// (each where nothing of the forest stands at it or in front of it, so that it is read from the habitation's side:
// test/habitation.test.mjs)
export const HOT_RIVER_SIGNS = Object.freeze([
  // the west bank (the river to the west of whoever reads them)
  ...[1960, 2083, 2198, 2317, 2438].map((x, i) => warn(`hot-west-${i + 1}`, x, -187, 0)),
  // the north-west corner
  warn('hot-corner', 2522.6, -163.4, -Math.PI / 4),
  // on the north cliffs' edge, the river below
  ...[-40, 97, 261].map((z, i) => warn(`hot-north-${i + 1}`, 2493, z, -Math.PI / 2)),
  // on the east cliffs' edge, the river below
  ...[2138, 2270, 2405].map((x, i) => warn(`hot-east-${i + 1}`, x, 441, Math.PI)),
]);
// Big signs where one wades into the water and the shallows end in deep water (22 October 2026, the owner: "users can
// enter the river but there are places they can't reach in the river, also add a big signboard, saying swimming swamps
// is unadvisable"): on the lagoon's beaches and its island, by the waterfall pool, round the swamp, and on both banks of
// the Niger where it comes through the habitation. White on red, five metres wide, each on dry ground two to four
// metres up from the shallows, nothing standing at it or in front of it, facing whoever comes down to the water
// (found by looking round each place for such ground: test/habitation.test.mjs checks each).
const SWIM = Object.freeze([{ text: 'SWIMMING IN THE SWAMPS', size: 96 }, { text: 'IS NOT ADVISABLE', size: 96 }, { text: 'The water is deep beyond the shallows', size: 58 }]);
const swim = (id, x, z, facing) => Object.freeze({ id, lines: SWIM, x: x + S, z, facing, width: 5, height: 2.4, palette: Object.freeze(['#ffffff', '#b3261e']), ground: true });
export const HABITATION_SWIM_SIGNS = Object.freeze([
  swim('swim-lagoon-west-1', 2180.5, 117.5, -2.945), swim('swim-lagoon-west-2', 2260.5, 125, 2.945), swim('swim-island', 2204.5, 193.5, 0.393),
  swim('swim-sunset-1', 2168, 343.5, 0.196), swim('swim-sunset-2', 2236, 345.5, 0.393), swim('swim-falls-pool', 2358, 310, 3.142),
  swim('swim-swamp-1', 2024, -31.5, 0), swim('swim-swamp-2', 2098.5, -85.5, 1.571), swim('swim-niger-south', 1959.5, 142.5, 2.945),
  swim('swim-niger-north', 2000, 303, 0.393), swim('swim-lagoon-east', 2336, 239.5, 1.374),
]);
// Where a sign's two posts stand (render-habitation.js roadSign: 0.3 m in from its ends), each in the way of a walker.
export const habitationSignPosts = (s) => [-1, 1].map((side) => [s.x + Math.cos(s.facing) * side * (s.width / 2 - 0.3), s.z - Math.sin(s.facing) * side * (s.width / 2 - 0.3)]);

// What stands in the way of a walker in the habitation: every trunk, plant and rock (a box the size of what stands at
// the ground), the gazebo's posts, the posts at the decks' ends and the signs' posts (low and thin: never in the way of
// the camera's eye above a walker's head, `barrier`).
const thin = (x, z, half) => Object.freeze({ ...box(x - half, z - half, x + half, z + half), barrier: true });
export const HABITATION_COLLIDERS = Object.freeze([
  ...HABITATION_STANDING.filter((s) => s.solid > 0).map((s) => box(s.x - s.solid, s.z - s.solid, s.x + s.solid, s.z + s.solid)),
  ...HABITATION_GAZEBO_SOLID.map((p) => box(p.x - p.half, p.z - p.half, p.x + p.half, p.z + p.half)),
  // (the posts at a deck's ends, which one walks past onto it; those along it stand within its rails' reach, where
  // nobody walks: habitationRailsAt)
  ...HABITATION_DECK_POSTS.filter((p) => p.end).map((p) => thin(p.x, p.z, p.half)),
  ...[...HOT_RIVER_SIGNS, ...HABITATION_SWIM_SIGNS].flatMap((sign) => habitationSignPosts(sign).map(([x, z]) => thin(x, z, 0.08))),
]);
