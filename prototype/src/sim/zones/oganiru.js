// Oganiru City: the new city with flyovers on the free land west of the town (the owner's brief of 31 October 2026,
// claude/brief-flyovers-city.md; the plan he said yes to the same evening, claude/plan-city-flyovers.md).
//
// Stage 1 (live 1 November 2026), the sample: Unity Avenue from College Road's west end through the Gate Roundabout to
// the Unity Interchange, the Independence Flyover, six towers.
// Stage 2 (1 November 2026), the whole road network: the Oganiru Expressway from the Harmony Interchange at its south end,
// at ground, down into a cutting under the Hope Avenue bridge, up onto its viaduct through downtown, over Unity Avenue
// (the Unity Interchange) and Peace Avenue (the Peace Interchange), to road works at its north end; the avenues (Unity,
// Harmony, Peace, Hope; Campus Link), the boulevards (Gateway, Independence, Sunrise) and downtown's streets (Exchange,
// Council, Charter, Commerce, Union, Tower); five roundabouts; the flyovers where Peace, Harmony and Hope Avenues cross
// Independence Boulevard; and the city joined to the town at three places: College Road (Stage 1), the Kwale road's
// end (on to the Southgate Roundabout) and Campus Road's north end (on as Campus Link). What is not built on yet is
// closed by roadblocks, and the edge of the built land is fenced, as in the town.
// (From the plan, three things moved: Hope Avenue 100 m north, to x -750, so that the Harmony Interchange's upper flyover
// comes down before the expressway goes into its cutting; Peace Avenue 70 m north, to x 720, so that the Peace
// Interchange's slip road leaves the expressway after the Unity Interchange's flyover has come down onto it; Council and
// Charter Streets 40 m out, to x -240 and 240, so that the Independence Flyover's ramps are down before them. The
// expressway stays up on its viaduct to its north end: there is no room to bring it down before the city's edge.)
//
// Content, like atani.js: the simulation and the drawing read it through ../zone.js. Nothing in the town moves for it:
// the town's roads, its people and vehicles, the river, the airport, the showrooms, the sports mall and the habitation
// are where they were; College Road, the Kwale road and Campus Road are joined, not changed (their road works opened:
// closures.js, atani-outskirts.js).
//
// Levels (the brief: "a vehicle or a person always stays on the level it is on, never popping up or dropping
// through"). A deck (a flyover, the raised expressway, a ramp, a loop, the bridge) is a surface above the ground:
// something at a height stands on the highest surface under it that is no more than a step above it (`oganiruSurface`),
// so that a car under the flyover stays on the road while one on the flyover stays on it, and a ramp is climbed a step
// at a time from where it meets the road. On a deck one can go only where the deck is, inside its walls; where a deck is
// too low to pass under it is an embankment, solid from the ground; where it is high it stands on pillars, and only they
// are in the way under it. The expressway's cutting is ground below the land round it, between retaining walls with a
// parapet along their tops; the bridge over it is a deck at street level.
//
// Grid metres, as the town's: +x is true north, +z true east; the free land is west (-z). One grid metre is a metre.

const KERB = 0.15;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const box = (x0, z0, x1, z1, extra = {}) => Object.freeze({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), ...extra });
const inBox = (b, x, z, pad = 0) => x >= b.x0 - pad && x <= b.x1 + pad && z >= b.z0 - pad && z <= b.z1 + pad;

// ---------------------------------------------------------------------------------------------- the city --
export const OGANIRU = Object.freeze({
  name: 'Oganiru City',
  stage: 2,
  // a main road: two lanes of 3.5 m each way and a gutter, split by a raised grass strip with black-and-white kerbs
  lane: 3.5, carriage: 7.5, median: 5, kerb: KERB, walk: 3.5, verge: 4.5,
  // the decks: 2 m thick, walls 1.1 m high and half a metre thick, at least 5.5 m clear under them; the first level
  // 7.5 m up (the raised expressway, the flyovers over the avenues), the upper about 15 m
  deck: Object.freeze({ thick: 2, wall: 1.1, wallWidth: 0.5, clear: 5.5, level: 7.5, upper: 15.4, grade: 0.06, curve: 30 }),
  // how far below a deck's underside the ground must be to walk or drive under it: less than this and the deck is an
  // embankment with retaining walls, solid from the ground
  under: 4.5,
  // the most anything climbs in one step from one surface to the next (a deck far above is never stepped up to)
  step: 1.2,
  // the expressway's cutting: how deep under the Hope Avenue bridge, and its retaining walls' parapets
  cutting: Object.freeze({ deep: 7.6, wall: 15.5, wallWidth: 0.6, parapet: 1.1 }),
  // where the city's land is, for anything that only needs to know whether to look further
  bounds: box(-1430, -1670, 960, -12),
});

// ------------------------------------------------------------------------------------------- geometry --
// Points along a path, every `step` metres, each with its distance along it (`s`) and the way it runs (ux, uz).
function resample(pts, step = 2) {
  const out = [];
  let s = 0;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-6) continue;
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = i === 0 ? 0 : 1; k <= n; k += 1) {
      const t = k / n;
      if (out.length) s += len / n;
      out.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, s });
    }
  }
  for (let i = 0; i < out.length; i += 1) {
    const a = out[Math.max(0, i - 1)], b = out[Math.min(out.length - 1, i + 1)];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    out[i].ux = (b.x - a.x) / l; out[i].uz = (b.z - a.z) / l;
  }
  return out;
}
// A smooth curve through the points (Catmull-Rom), as many pieces between each two.
function spline(pts, n = 16) {
  const out = [];
  const P = [pts[0], ...pts, pts[pts.length - 1]];
  for (let i = 1; i < P.length - 2; i += 1) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    for (let k = 0; k < n; k += 1) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
// An arc round (cx, cz) of radius r, from angle a0 to a1 in degrees (0 points to +z, 90 to +x: on the map, east and
// north): turning one way or the other as a1 is less or more than a0.
const arc = (cx, cz, r, a0, a1, step = 5) => {
  const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * Math.PI / 180 * r) / step));
  return Array.from({ length: n + 1 }, (_, i) => { const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180; return [cx + r * Math.sin(a), cz + r * Math.cos(a)]; });
};
// A height that goes from h0 to h1 between two places along a road, level at both ends, rising no steeper than the
// brief allows in the middle (a straight grade between two curves `curve` long).
function ease(t, a) {
  // t 0..1 along; a: the share of the way each curve takes. Level at 0 and 1, straight between.
  const u = clamp(t, 0, 1);
  const m = 1 / (1 - a);                      // the straight's slope, the whole rise being 1
  if (u < a) return (m * u * u) / (2 * a);
  if (u > 1 - a) return 1 - (m * (1 - u) * (1 - u)) / (2 * a);
  return (m * a) / 2 + m * (u - a);
}
// Heights along a path from `knots` [[s, h], ...] (each knot level, the way between eased).
function profile(knots, curve = OGANIRU.deck.curve) {
  return (s) => {
    if (s <= knots[0][0]) return knots[0][1];
    for (let i = 1; i < knots.length; i += 1) {
      const [s0, h0] = knots[i - 1], [s1, h1] = knots[i];
      if (s <= s1) { const len = s1 - s0; return h0 + (h1 - h0) * ease((s - s0) / len, Math.min(0.45, curve / len)); }
    }
    return knots[knots.length - 1][1];
  };
}
const hash = (i, k) => { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); };

// ------------------------------------------------------------------------------------------ where things are --
// The avenues run east-west (along z) at their x; the boulevards and downtown's cross streets north-south (along x)
// at their z.
const U = 0;                                                   // Unity Avenue
const HARMONY_X = -1290, HOPE_X = -750, PEACE_X = 720;         // Harmony, Hope and Peace Avenues
const EXCHANGE_X = -400, COUNCIL_X = -240, CHARTER_X = 240, COMMERCE_X = 400;   // downtown's streets along z
const GATEWAY_Z = -560, UNION_Z = -670, INDEPENDENCE_Z = -780, TOWER_Z = -880, SUNRISE_Z = -1550;
const CAMPUS_Z = -341, KWALE_Z = -40;
export const EXPRESSWAY_Z = -1130;
// where Unity Avenue's walkways stop: beyond, the slip roads and loops of the interchange join it
const UNITY_WALKS_TO = -950;
export const OGANIRU_PLACES = Object.freeze({ U, HARMONY_X, HOPE_X, PEACE_X, EXCHANGE_X, COUNCIL_X, CHARTER_X, COMMERCE_X, GATEWAY_Z, UNION_Z, INDEPENDENCE_Z, TOWER_Z, SUNRISE_Z, CAMPUS_Z, KWALE_Z, EXPRESSWAY_Z });

// --------------------------------------------------------------------------------------- the roundabouts --
// Each: its middle, its island (grass behind a kerb), its ring of road to `outer`, a walkway round it, and the roads that
// come into it (`legs`: which way each leaves, n +x, s -x, e +z, w -z, and its half-width where it meets the ring).
const RING = Object.freeze({ island: 13, outer: 22, walk: 3.5 });
const RING_EDGE = RING.outer + 0.5;           // where a road coming in meets the ring
const roundabout = (id, name, x, z, legs) => Object.freeze({ id, name, x, z, ...RING, legs: Object.freeze(legs.map(([dir, half]) => Object.freeze({ dir, half }))) });
export const OGANIRU_ROUNDABOUTS = Object.freeze([
  roundabout('gate', 'Gate Roundabout', U, GATEWAY_Z, [['e', 10], ['w', 10], ['n', 10], ['s', 10]]),
  roundabout('airport', 'Airport Roundabout', HARMONY_X, GATEWAY_Z, [['e', 10], ['w', 10], ['n', 10], ['s', 10]]),
  roundabout('southgate', 'Southgate Roundabout', HARMONY_X, KWALE_Z, [['n', 7], ['s', 7], ['w', 10]]),
  roundabout('campus', 'Campus Roundabout', PEACE_X, CAMPUS_Z, [['s', 10], ['w', 10], ['n', 10]]),
  roundabout('sunrise', 'Sunrise Roundabout', U, SUNRISE_Z, [['e', 10], ['w', 10], ['n', 10], ['s', 10]]),
]);
const GATE = OGANIRU_ROUNDABOUTS[0];
const legVector = (dir) => (dir === 'n' ? [1, 0] : dir === 's' ? [-1, 0] : dir === 'e' ? [0, 1] : [0, -1]);
// Is (x, z) in the mouth of one of a roundabout's legs (where its walkway ring is cut for the road)?
const inMouth = (r, x, z) => r.legs.some((l) => { const [ux, uz] = legVector(l.dir); const along = (x - r.x) * ux + (z - r.z) * uz, across = Math.abs(-(x - r.x) * uz + (z - r.z) * ux); return along > 0 && across < l.half + 0.5; });

// ------------------------------------------------------------------------------------- the expressway's levels --
// Its road along x: at ground from its south end, down into the cutting (7.6 m under the Hope Avenue bridge), up out of
// it onto its viaduct at the first level (7.5 m) by downtown, and level from there to its north end.
const L1 = OGANIRU.deck.level, L2 = OGANIRU.deck.upper;
const CUT = OGANIRU.cutting;
const EXPRESSWAY_PROFILE = profile([[-930, 0], [-770, -CUT.deep], [-735, -CUT.deep], [-450, L1]], 30);
export const expresswayY = (x) => (x <= -930 ? 0 : x >= -450 ? L1 : EXPRESSWAY_PROFILE(x));
// where the cutting is: the expressway below the land, from where it goes down to where it comes up through the ground
const CUTTING_TO = (() => { let x = -735; while (expresswayY(x) < 0) x += 0.25; return x; })();
export const OGANIRU_CUTTING = Object.freeze({ x0: -930, x1: CUTTING_TO, z: EXPRESSWAY_Z, half: CUT.wall });
const inCutting = (x, z) => x > OGANIRU_CUTTING.x0 && x < OGANIRU_CUTTING.x1 && Math.abs(z - EXPRESSWAY_Z) <= CUT.wall;

// ---------------------------------------------------------------------------------- the ground roads --
// The roads on the ground, all straight: each runs along x or along z at `c`, from `from` to `to`.
// `half`: from its middle to the outer kerb; `median`: the raised strip in the middle (0 for none); `walk`: the
// walkways beyond the kerbs (0 for none), only along `walks` ([[from, to], ...]) if not the whole way; `trees`: a row of
// slim trees down the middle strip; `lamps`: the tall double-armed lamps down it. Kinds: 'avenue' (a dual carriageway);
// 'street' (downtown: two lanes each way, no strip, wide pavements); 'approach' (narrower, opening out: `flare`);
// 'flyover-road' (beside a junction's flyover: a carriageway either side of its ramp, `median` the ramp's width,
// narrowing to the avenue beyond its foot over `taper`: [the end it narrows toward, how long]); 'link' (two lanes, no
// strip); 'expressway' (at ground: three lanes each way and a concrete barrier); 'cutting' (the same, below ground).
const groundRoad = (id, name, along, c, from, to, o = {}) => Object.freeze({ id, name, along, c, from: Math.min(from, to), to: Math.max(from, to), half: 10, median: OGANIRU.median, walk: OGANIRU.walk, trees: false, lamps: true, kind: 'avenue', ...o });
const AVENUE = { half: 10, median: 5, walk: 3.5 };
const STREET = { half: 7, median: 0, walk: 4, kind: 'street', lamps: false };
const FLYOVER_ROAD = { half: 16, median: 16, walk: 3.5, kind: 'flyover-road', lamps: false };
// the junction flyovers' feet: how far out from the junction each ramp comes down, either side (Independence over Unity,
// as Stage 1 built it; Peace, Harmony and Hope over Independence)
const FLY = Object.freeze({ independence: [180, 180], peace: [165, 165], harmony: [165, 165], hope: [165, 165] });
export const OGANIRU_ROADS = Object.freeze([
  // College Road carried on from its end (at the town's edge): as wide as it is there, then opening out to the
  // roundabout
  groundRoad('unity-gate', 'Unity Avenue', 'z', U, -470, GATE.z + RING_EDGE, { half: 5, median: 0, walk: 0, kind: 'approach', lamps: false, flare: { narrow: -505, wide: GATE.z + GATE.outer, half: 10, median: 5, walk: OGANIRU.walk } }),
  groundRoad('unity', 'Unity Avenue', 'z', U, GATE.z - RING_EDGE, SUNRISE_Z + RING_EDGE, { trees: true, walks: [[UNITY_WALKS_TO, GATE.z - RING_EDGE]] }),
  groundRoad('unity-west', 'Unity Avenue', 'z', U, SUNRISE_Z - RING_EDGE, -1640, { trees: true, walk: 0 }),
  // the boulevards, south to north
  groundRoad('gateway-s', 'Gateway Boulevard', 'x', GATEWAY_Z, HARMONY_X + RING_EDGE, U - RING_EDGE, {}),
  groundRoad('gateway-n', 'Gateway Boulevard', 'x', GATEWAY_Z, U + RING_EDGE, PEACE_X - 10, {}),
  groundRoad('independence-1', 'Independence Boulevard', 'x', INDEPENDENCE_Z, HARMONY_X + 16, HOPE_X - 16, {}),
  groundRoad('independence-2', 'Independence Boulevard', 'x', INDEPENDENCE_Z, HOPE_X + 16, -230, {}),
  groundRoad('independence-s', 'Independence Boulevard', 'x', INDEPENDENCE_Z, -230, -10, { ...FLYOVER_ROAD, taper: [-230, 50] }),
  groundRoad('independence-n', 'Independence Boulevard', 'x', INDEPENDENCE_Z, 10, 230, { ...FLYOVER_ROAD, taper: [230, 50] }),
  groundRoad('independence-3', 'Independence Boulevard', 'x', INDEPENDENCE_Z, 230, PEACE_X - 16, {}),
  groundRoad('sunrise-s', 'Sunrise Boulevard', 'x', SUNRISE_Z, HARMONY_X + 10, U - RING_EDGE, { trees: true }),
  groundRoad('sunrise-n', 'Sunrise Boulevard', 'x', SUNRISE_Z, U + RING_EDGE, PEACE_X + 10, { trees: true }),
  // the other avenues, east to west: Harmony from the Southgate Roundabout, Peace from the Campus Roundabout, Hope
  groundRoad('harmony-1', 'Harmony Avenue', 'z', HARMONY_X, KWALE_Z - RING_EDGE, GATEWAY_Z + RING_EDGE, { trees: true }),
  groundRoad('harmony-r2', 'Harmony Avenue', 'z', HARMONY_X, GATEWAY_Z - RING_EDGE, GATEWAY_Z - RING_EDGE - 12.5, { median: 0 }),
  groundRoad('harmony-fe', 'Harmony Avenue', 'z', HARMONY_X, GATEWAY_Z - RING_EDGE - 12.5, INDEPENDENCE_Z + 10, { ...FLYOVER_ROAD, taper: [GATEWAY_Z - RING_EDGE - 12.5, 20] }),
  groundRoad('harmony-fw', 'Harmony Avenue', 'z', HARMONY_X, INDEPENDENCE_Z - 10, INDEPENDENCE_Z - FLY.harmony[0] - 35, { ...FLYOVER_ROAD, taper: [INDEPENDENCE_Z - FLY.harmony[0] - 35, 35] }),
  groundRoad('harmony-2', 'Harmony Avenue', 'z', HARMONY_X, INDEPENDENCE_Z - FLY.harmony[0] - 35, -1620, { trees: true, walk: 0 }),
  groundRoad('peace-1', 'Peace Avenue', 'z', PEACE_X, CAMPUS_Z - RING_EDGE, INDEPENDENCE_Z + FLY.peace[1] + 35, { trees: true }),
  groundRoad('peace-fe', 'Peace Avenue', 'z', PEACE_X, INDEPENDENCE_Z + FLY.peace[1] + 35, INDEPENDENCE_Z + 10, { ...FLYOVER_ROAD, taper: [INDEPENDENCE_Z + FLY.peace[1] + 35, 35] }),
  groundRoad('peace-fw', 'Peace Avenue', 'z', PEACE_X, INDEPENDENCE_Z - 10, INDEPENDENCE_Z - FLY.peace[0] - 35, { ...FLYOVER_ROAD, taper: [INDEPENDENCE_Z - FLY.peace[0] - 35, 35] }),
  groundRoad('peace-2', 'Peace Avenue', 'z', PEACE_X, INDEPENDENCE_Z - FLY.peace[0] - 35, SUNRISE_Z - 10, { trees: true }),
  groundRoad('hope-1', 'Hope Avenue', 'z', HOPE_X, GATEWAY_Z - 10, INDEPENDENCE_Z + FLY.hope[1] + 25, {}),
  groundRoad('hope-fe', 'Hope Avenue', 'z', HOPE_X, INDEPENDENCE_Z + FLY.hope[1] + 25, INDEPENDENCE_Z + 10, { ...FLYOVER_ROAD, taper: [INDEPENDENCE_Z + FLY.hope[1] + 25, 25] }),
  groundRoad('hope-fw', 'Hope Avenue', 'z', HOPE_X, INDEPENDENCE_Z - 10, INDEPENDENCE_Z - FLY.hope[0] - 35, { ...FLYOVER_ROAD, taper: [INDEPENDENCE_Z - FLY.hope[0] - 35, 35] }),
  groundRoad('hope-2', 'Hope Avenue', 'z', HOPE_X, INDEPENDENCE_Z - FLY.hope[0] - 35, -1104, {}),
  groundRoad('hope-3', 'Hope Avenue', 'z', HOPE_X, -1156, SUNRISE_Z + 10, {}),
  // Campus Road carried on (laterite in the town, tar here) to the Campus Roundabout; the Kwale road on to the Southgate
  // Roundabout, and its leg on south, closed at the road works
  groundRoad('campus-gate', 'Campus Link', 'x', CAMPUS_Z, 240, 300, { half: 4, median: 0, walk: 0, kind: 'approach', lamps: false, flare: { narrow: 252, wide: 296, half: 10, median: 5, walk: OGANIRU.walk } }),
  groundRoad('campus-link', 'Campus Link', 'x', CAMPUS_Z, 300, PEACE_X - RING_EDGE, {}),
  groundRoad('kwale-on', 'Asaba–Kwale Road', 'x', KWALE_Z, -1190, HARMONY_X + RING_EDGE, { half: 7, median: 0, walk: 0, kind: 'link', lamps: false }),
  groundRoad('kwale-south', 'Asaba–Kwale Road', 'x', KWALE_Z, HARMONY_X - RING_EDGE, -1390, { half: 7, median: 0, walk: 0, kind: 'link', lamps: false }),
  // the roundabouts' legs not built on yet: a few metres, then their roadblocks
  groundRoad('airport-south', 'Gateway Boulevard', 'x', GATEWAY_Z, HARMONY_X - RING_EDGE, HARMONY_X - 70, { walk: 0, lamps: false }),
  groundRoad('campus-north', 'Peace Avenue', 'x', CAMPUS_Z, PEACE_X + RING_EDGE, PEACE_X + 80, { walk: 0, lamps: false }),
  // the expressway at ground, south of its cutting: both carriageways from where the Harmony Interchange's south-bound
  // ramps leave it; north-bound only before that (the north-bound carriageway begins at the interchange)
  groundRoad('expressway-south', 'Oganiru Expressway', 'x', EXPRESSWAY_Z, -1040, OGANIRU_CUTTING.x0, { half: 15, median: 0, walk: 0, kind: 'expressway', barrier: 0.3, lamps: false }),
  groundRoad('expressway-south-nb', 'Oganiru Expressway', 'x', EXPRESSWAY_Z + 7.5, -1200, -1040, { half: 7.5, median: 0, walk: 0, kind: 'expressway', lamps: false }),
  groundRoad('expressway-cutting', 'Oganiru Expressway', 'x', EXPRESSWAY_Z, OGANIRU_CUTTING.x0, OGANIRU_CUTTING.x1, { half: 15, median: 0, walk: 0, kind: 'cutting', barrier: 0.3, lamps: false }),
  // downtown's streets: two lanes each way, no middle strip, wide pavements
  groundRoad('exchange', 'Exchange Street', 'z', EXCHANGE_X, GATEWAY_Z - 10, SUNRISE_Z + 10, STREET),
  groundRoad('commerce', 'Commerce Street', 'z', COMMERCE_X, GATEWAY_Z - 10, SUNRISE_Z + 10, STREET),
  groundRoad('council', 'Council Street', 'z', COUNCIL_X, GATEWAY_Z - 10, TOWER_Z + 7, STREET),
  groundRoad('charter', 'Charter Street', 'z', CHARTER_X, GATEWAY_Z - 10, TOWER_Z + 7, STREET),
  groundRoad('union-s', 'Union Street', 'x', UNION_Z, EXCHANGE_X + 7, -10, STREET),
  groundRoad('union-n', 'Union Street', 'x', UNION_Z, 10, COMMERCE_X - 7, STREET),
  groundRoad('tower-s', 'Tower Street', 'x', TOWER_Z, EXCHANGE_X + 7, -10, STREET),
  groundRoad('tower-n', 'Tower Street', 'x', TOWER_Z, 10, COMMERCE_X - 7, STREET),
]);
const ROAD_BY_ID = new Map(OGANIRU_ROADS.map((r) => [r.id, r]));
// how wide a road is at a point along it (a flyover-road narrowing over its taper; an approach opening out), and its
// middle strip there: { half, median }
export function roadWidthAt(r, a) {
  if (r.kind === 'flyover-road' && r.taper) {
    const [end, len] = r.taper, t = clamp(1 - Math.abs(a - end) / len, 0, 1);
    return { half: r.half + (AVENUE.half - r.half) * t, median: r.median * (1 - t), walk: r.walk, under: t < 1 };
  }
  if (r.flare) {
    const f = r.flare, t = clamp((a - f.narrow) / (f.wide - f.narrow), 0, 1);
    return { half: r.half + (f.half - r.half) * t, median: f.median * t, walk: f.walk };
  }
  return { half: r.half, median: r.median, walk: r.walk };
}
const across = (r, x, z) => (r.along === 'z' ? x - r.c : z - r.c);
const alongOf = (r, x, z) => (r.along === 'z' ? z : x);

// ----------------------------------------------------------------------------------------------- junctions --
// Where a road along x meets one along z: their junction, its middle and how far it reaches each way; whether one of the
// two ends there (a T); the traffic signals at it (Unity Avenue's and the other avenues' and streets' along z first,
// phase 0; the boulevards' and cross streets' along x, phase 1), each junction's lights a little out of step with the
// next. Under a flyover (Independence over Unity; Peace, Harmony and Hope over Independence) the junction is the
// turning traffic's: the through traffic goes over it.
export const OGANIRU_JUNCTIONS = (() => {
  const out = [];
  const roads = OGANIRU_ROADS.filter((r) => !['expressway', 'cutting', 'link'].includes(r.kind) && !r.id.startsWith('campus-') && !r.id.startsWith('airport-'));
  for (const X of roads) for (const Z of roads) {
    if (X.along !== 'x' || Z.along !== 'z') continue;
    const x = Z.c, z = X.c;
    const wx = roadWidthAt(Z, z).half, wz = roadWidthAt(X, x).half;
    if (x < X.from - wx - 1.5 || x > X.to + wx + 1.5 || z < Z.from - wz - 1.5 || z > Z.to + wz + 1.5) continue;
    const key = `${Math.round(x)},${Math.round(z)}`;
    let j = out.find((q) => q.key === key);
    if (!j) { j = { key, x, z, hx: 0, hz: 0, roads: [], ends: [], flyover: null }; out.push(j); }
    j.hx = Math.max(j.hx, wx); j.hz = Math.max(j.hz, wz);
    for (const r of [X, Z]) if (!j.roads.includes(r.id)) j.roads.push(r.id);
  }
  for (const j of out) {
    // which way each road leaves it (n, s, e, w): a T has three
    const legs = new Set();
    for (const id of j.roads) {
      const r = ROAD_BY_ID.get(id), a = r.along === 'x' ? j.x : j.z, w = (r.along === 'x' ? j.hx : j.hz) + 2;
      if (r.along === 'x') { if (r.to > a + w) legs.add('n'); if (r.from < a - w) legs.add('s'); } else { if (r.to > a + w) legs.add('e'); if (r.from < a - w) legs.add('w'); }
    }
    j.legs = [...legs];
    j.kind = j.legs.length >= 4 ? 'cross' : j.legs.length === 3 ? 'T' : 'corner';
    j.flyover = j.roads.some((id) => ROAD_BY_ID.get(id).kind === 'flyover-road') ? (j.roads.find((id) => ROAD_BY_ID.get(id).kind === 'flyover-road') || '').split('-')[0] : null;
    j.signals = j.kind !== 'corner';
    j.offset = Math.round(hash(Math.round(j.x), Math.round(j.z)) * 4) * 8;
    j.id = `j-${j.key}`;
  }
  return Object.freeze(out.map((j) => Object.freeze({ id: j.id, x: j.x, z: j.z, hx: j.hx, hz: j.hz, roads: Object.freeze(j.roads), legs: Object.freeze(j.legs), kind: j.kind, flyover: j.flyover, signals: j.signals, offset: j.offset })));
})();
// the junction a point is in (its box), if any
const junctionAt = (x, z, pad = 0) => OGANIRU_JUNCTIONS.find((j) => Math.abs(x - j.x) <= j.hx + pad && Math.abs(z - j.z) <= j.hz + pad) || null;

// ----------------------------------------------------------------------------------------- the decks --
// Each deck: its middle line (points every 2 m with the height of its road surface there), its width wall to wall,
// its walls (which sides, from where to where along it: none where another deck joins it, and none where it is too low
// to need one), a concrete barrier down its middle (the expressway, the flyovers), and its ends closed or open.
const D = OGANIRU.deck;
function deck(id, name, kind, pts, { width = 8, heights, step = 2, barrier = 0, closed = [], bank = 0.035, walls = null, curve = D.curve }) {
  const path = resample(pts, step);
  const len = path[path.length - 1].s;
  const hAt = typeof heights === 'function' ? heights : profile(heights.map(([f, h]) => [f < 0 ? len + f : f, h]), curve);
  // the bend at each point (+ to the left), for the road's tilt into it
  for (let i = 0; i < path.length; i += 1) {
    const p = path[i];
    p.y = hAt(p.s);
    const a = path[Math.max(0, i - 3)], b = path[Math.min(path.length - 1, i + 3)];
    const turn = (a.ux * b.uz - a.uz * b.ux);
    p.bank = clamp(turn * 3, -1, 1) * bank;
  }
  const half = width / 2;
  return { id, name, kind, path, len, half, inner: half - D.wallWidth, barrier, closed, walls: walls || 'auto' };
}
// (a helper for where a wall stands: along the whole deck but where it is too low, or where something joins it)
const without = (len, gaps) => {
  const out = [];
  let from = 0;
  for (const [a, b] of [...gaps].sort((p, q) => p[0] - q[0])) { if (a > from) out.push([from, a]); from = Math.max(from, b); }
  if (from < len) out.push([from, len]);
  return out;
};

const NB = EXPRESSWAY_Z + 12, SB = EXPRESSWAY_Z - 12;       // the middle of each carriageway's outer lane
const VIADUCT_HALF = 15, VIADUCT_SOUTH = OGANIRU_CUTTING.x1, VIADUCT_NORTH = 920;
// The ramps of the Unity Interchange (Stage 1, as built). Each is drawn from the end it is driven from, so that its left
// and right are the driver's. (+x north, +z east; the expressway's north-bound carriageway is its east half, the
// south-bound its west; Unity Avenue's east-bound carriageway is its south half, the west-bound its north.)
const RAMP_PATHS = {
  // north-bound to west-bound: off the expressway to the right after the avenue, round a loop down to the avenue
  'u-loop-ne': [[16, NB + 1], [44, NB + 7], [90, NB + 12], ...arc(90, EXPRESSWAY_Z + 79, 55, 180, -90, 4).slice(1), [24, EXPRESSWAY_Z + 66], [15, EXPRESSWAY_Z + 48], [12.5, EXPRESSWAY_Z + 32]],
  // south-bound to east-bound: the same, the other side
  'u-loop-sw': [[-16, SB - 1], [-44, SB - 7], [-90, SB - 12], ...arc(-90, EXPRESSWAY_Z - 79, 55, 0, -270, 4).slice(1), [-24, EXPRESSWAY_Z - 66], [-15, EXPRESSWAY_Z - 48], [-12.5, EXPRESSWAY_Z - 32]],
  // west-bound to south-bound: off the avenue to the right after the expressway, round a loop up onto it
  'u-loop-nw': [[12.5, EXPRESSWAY_Z - 30], [15, EXPRESSWAY_Z - 48], [24, EXPRESSWAY_Z - 66], ...arc(80, EXPRESSWAY_Z - 80, 55, -90, -360, 4).slice(1), [60, SB - 8], [36, SB - 3], [16, SB - 1]],
  // north-bound to east-bound: off before the avenue, down beside the expressway and onto the avenue going east
  'u-se': spline([[-262, NB + 1], [-215, NB + 9], [-150, NB + 21], [-85, NB + 52], [-36, NB + 105], [-15, NB + 140], [-12.5, NB + 162]], 10),
  // west-bound to north-bound: off the avenue before the expressway, round the loop and up onto it going north
  'u-ne': spline([[12.5, NB + 152], [16, NB + 138], [40, NB + 126], [118, NB + 128], [176, NB + 92], [226, NB + 34], [262, NB + 8], [300, NB + 1]], 10),
  // south-bound to west-bound: off the expressway before the avenue, round the outside of the loop and onto it
  'u-nw': spline([[262, SB - 1], [215, SB - 9], [160, SB - 34], [138, SB - 98], [96, SB - 146], [44, SB - 172], [16, SB - 186], [12.5, SB - 205]], 10),
  // east-bound to south-bound: off the avenue before the expressway, round the outside of the loop and up onto it
  'u-sw': spline([[-12.5, SB - 196], [-16, SB - 182], [-46, SB - 172], [-120, SB - 160], [-178, SB - 112], [-226, SB - 40], [-262, SB - 9], [-300, SB - 1]], 10),
  // east-bound to north-bound: the flyover, from the avenue up over it, over the loop and the expressway, about 15 m
  // up, and down onto the expressway going north
  'u-fly': spline([[-12.5, -1508], [-16, -1478], [-24, -1405], [-8, -1338], [40, -1290], [120, -1228], [196, -1172], [248, -1132], [300, -1102], [360, -1100], [430, -1104], [490, -1107], [525, -1112], [555, NB + 1]], 12),
  // The Harmony Interchange, where the expressway ends at Harmony Avenue (Harmony's east-bound carriageway is its south
  // half, x < -1290; its west-bound its north half):
  // south-bound to west-bound: the south-bound carriageway's right lanes, on at ground, curving onto Harmony going west
  'h-sb-wb': spline([[-1040, SB + 1], [-1100, SB + 0.5], [-1160, SB - 2], [-1205, SB - 12], [-1240, SB - 40], [-1264, SB - 92], [-1274, SB - 150], [-1276, SB - 190]], 12),
  // west-bound to north-bound: off Harmony on its right after the Harmony Flyover, curving at ground onto the
  // north-bound carriageway where it begins
  'h-wb-nb': spline([[-1276, -1000], [-1272, -1030], [-1258, -1068], [-1236, -1098], [-1214, NB + 4.5], [-1196, NB + 4.5]], 12),
  // south-bound to east-bound: the south-bound carriageway's left lanes, rising, over Harmony, round south of it and down
  // onto it going east
  'h-sb-eb': spline([[-1040, EXPRESSWAY_Z - 4.5], [-1100, EXPRESSWAY_Z - 4.6], [-1170, EXPRESSWAY_Z - 5.5], [-1240, EXPRESSWAY_Z - 8], [-1300, EXPRESSWAY_Z - 12], [-1350, EXPRESSWAY_Z - 6], [-1374, EXPRESSWAY_Z + 24], [-1368, EXPRESSWAY_Z + 68], [-1340, EXPRESSWAY_Z + 104], [-1306, EXPRESSWAY_Z + 124], [-1304, EXPRESSWAY_Z + 140]], 12),
  // east-bound to north-bound: the upper flyover, off Harmony on its right west of the expressway, climbing, over
  // Harmony, over the south-bound to east-bound flyover and both carriageways, and down onto the north-bound one
  'h-eb-nb': spline([[-1304, -1480], [-1309, -1430], [-1310, -1370], [-1302, -1310], [-1284, -1258], [-1258, -1212], [-1222, -1168], [-1190, -1138], [-1160, -1112], [-1110, -1098], [-1040, -1100], [-980, -1108], [-930, NB + 4]], 12),
  // The Peace Interchange: four slip roads between the raised expressway and Peace Avenue, to traffic lights on it
  'p-nb-off': spline([[PEACE_X - 160, NB + 1], [PEACE_X - 120, NB + 8], [PEACE_X - 75, NB + 26], [PEACE_X - 35, NB + 38], [PEACE_X - 18, NB + 40], [PEACE_X - 10, NB + 40]], 12),
  // (the two onto the viaduct kept just clear of its edge until they are level with it)
  'p-nb-on': spline([[PEACE_X + 10, NB + 40], [PEACE_X + 18, NB + 40], [PEACE_X + 50, NB + 32], [PEACE_X + 110, NB + 14], [PEACE_X + 160, NB + 6], [PEACE_X + 185, NB + 1]], 12),
  'p-sb-off': spline([[PEACE_X + 185, SB - 1], [PEACE_X + 140, SB - 8], [PEACE_X + 80, SB - 26], [PEACE_X + 30, SB - 38], [PEACE_X + 18, SB - 40], [PEACE_X + 10, SB - 40]], 12),
  'p-sb-on': spline([[PEACE_X - 10, SB - 40], [PEACE_X - 18, SB - 40], [PEACE_X - 50, SB - 34], [PEACE_X - 100, SB - 18], [PEACE_X - 150, SB - 6], [PEACE_X - 180, SB - 1]], 12),
};
// the Peace Interchange's two junctions on the avenue, east and west of the expressway, where its slip roads meet it
export const PEACE_RAMP_Z = Object.freeze([NB + 40, SB - 40]);
const RAMP = { width: 8, flyWidth: 9 };
function rampDeck(id, name, pts, knots, o = {}) { return deck(id, name, o.kind || 'ramp', pts, { width: o.width || RAMP.width, heights: knots, ...o }); }
function buildDecks() {
  const out = [];
  // the expressway raised on its viaduct, from where it comes up out of its cutting to its north end (closed: road works)
  out.push(deck('viaduct', 'Oganiru Expressway', 'expressway', [[VIADUCT_SOUTH, EXPRESSWAY_Z], [VIADUCT_NORTH, EXPRESSWAY_Z]], { width: VIADUCT_HALF * 2, heights: (s) => expresswayY(VIADUCT_SOUTH + s), step: 4, barrier: 0.5, closed: ['end'], bank: 0 }));
  // the junction flyovers: a road up from the ground, level over the junction, down again
  {
    const [fs, fn] = FLY.independence, top = 25;
    out.push(deck('independence-flyover', 'Independence Boulevard', 'flyover', [[-fs, INDEPENDENCE_Z], [fn, INDEPENDENCE_Z]], { width: 16, heights: [[0, 0], [fs - top, L1], [fs + top, L1], [fs + fn, 0]], step: 2, barrier: 0.35, bank: 0 }));
  }
  for (const [id, name, x] of [['peace-flyover', 'Peace Avenue', PEACE_X], ['harmony-flyover', 'Harmony Avenue', HARMONY_X], ['hope-flyover', 'Hope Avenue', HOPE_X]]) {
    const [fw, fe] = FLY[id.split('-')[0]], top = 15;
    out.push(deck(id, name, 'flyover', [[x, INDEPENDENCE_Z - fw], [x, INDEPENDENCE_Z + fe]], { width: 16, heights: [[0, 0], [fw - top, L1], [fw + top, L1], [fw + fe, 0]], step: 2, barrier: 0.35, bank: 0, curve: 25 }));
  }
  // Hope Avenue over the expressway in its cutting, at street level, its two carriageways either side of a barrier
  out.push(deck('hope-bridge', 'Hope Avenue', 'bridge', [[HOPE_X, -1156], [HOPE_X, -1104]], { width: 27, heights: () => 0, step: 2, barrier: 0.35, bank: 0, walls: { left: [[0, 52]], right: [[0, 52]] } }));
  // the ramps: from the avenue's level (0) or the expressway's (7.5) to the other
  const down = (len) => [[0, L1], [len, 0]], up = (len) => [[0, 0], [len, L1]];
  const r = (id, name, upward, o = {}) => { const pts = RAMP_PATHS[id], path = resample(pts, 2), len = path[path.length - 1].s; return rampDeck(id, name, pts, upward ? up(len) : down(len), o); };
  out.push(r('u-loop-ne', 'Unity Interchange (north-bound to Unity Avenue west)', false));
  out.push(r('u-loop-sw', 'Unity Interchange (south-bound to Unity Avenue east)', false));
  out.push(r('u-loop-nw', 'Unity Interchange (Unity Avenue west to south-bound)', true));
  out.push(r('u-se', 'Unity Interchange (north-bound to Unity Avenue east)', false));
  out.push(r('u-ne', 'Unity Interchange (Unity Avenue west to north-bound)', true));
  out.push(r('u-nw', 'Unity Interchange (south-bound to Unity Avenue west)', false));
  out.push(r('u-sw', 'Unity Interchange (Unity Avenue east to south-bound)', true));
  const near = (path, x, z) => path.reduce((best, p) => (Math.hypot(p.x - x, p.z - z) < Math.hypot(best.x - x, best.z - z) ? p : best), path[0]).s;
  // the flyover: up from the avenue to cross it at 8.2 m, over the loop below at 13, over the expressway at 15.4,
  // and down onto it at 7.5
  {
    const pts = RAMP_PATHS['u-fly'], path = resample(pts, 2), len = path[path.length - 1].s;
    out.push(rampDeck('u-fly', 'Unity Interchange flyover (Unity Avenue east to north-bound)', pts, [[0, 0], [near(path, 0, -1320), 8.0], [near(path, 150, -1210), 13.2], [near(path, 248, EXPRESSWAY_Z), L2], [near(path, 318, -1101), L2], [near(path, 492, -1107), L1], [len, L1]], { kind: 'flyover', width: RAMP.flyWidth }));
  }
  // the Harmony Interchange: two curves at ground for the right turns, a flyover over Harmony for the left turn off the
  // expressway, and above it the upper flyover for the left turn onto it
  out.push(rampDeck('h-sb-wb', 'Harmony Interchange (south-bound to Harmony Avenue west)', RAMP_PATHS['h-sb-wb'], () => 0, { kind: 'ground-ramp' }));
  out.push(rampDeck('h-wb-nb', 'Harmony Interchange (Harmony Avenue west to north-bound)', RAMP_PATHS['h-wb-nb'], () => 0, { kind: 'ground-ramp' }));
  {
    const pts = RAMP_PATHS['h-sb-eb'], path = resample(pts, 2), len = path[path.length - 1].s;
    out.push(rampDeck('h-sb-eb', 'Harmony Interchange flyover (south-bound to Harmony Avenue east)', pts, [[0, 0], [near(path, -1250, EXPRESSWAY_Z - 9), L1], [near(path, -1335, EXPRESSWAY_Z - 9), L1], [len, 0]], { kind: 'flyover' }));
  }
  {
    const pts = RAMP_PATHS['h-eb-nb'], path = resample(pts, 2), len = path[path.length - 1].s;
    out.push(rampDeck('h-eb-nb', 'Harmony Interchange upper flyover (Harmony Avenue east to north-bound)', pts, [[0, 0], [near(path, -1290, -1268), 9.4], [near(path, -1200, -1145), 14.0], [near(path, -1185, -1134), 14.0], [len, 0]], { kind: 'flyover', width: RAMP.flyWidth }));
  }
  // the Peace Interchange's slip roads
  out.push(r('p-nb-off', 'Peace Interchange (north-bound to Peace Avenue)', false));
  out.push(r('p-nb-on', 'Peace Interchange (Peace Avenue to north-bound)', true));
  out.push(r('p-sb-off', 'Peace Interchange (south-bound to Peace Avenue)', false));
  out.push(r('p-sb-on', 'Peace Interchange (Peace Avenue to south-bound)', true));

  // walls: where each is more than a kerb above the ground under it, and not where another deck runs into it at the same
  // height (40 m or so on the side toward it, where the lanes run together)
  const raised = (q) => q.y > 0.35;
  const footprint = (B, x, z) => { let best = null; for (let m = 0; m < B.path.length - 1; m += 1) { const a = B.path[m], b = B.path[m + 1]; const ex = b.x - a.x, ez = b.z - a.z, l2 = ex * ex + ez * ez; const t = clamp(((x - a.x) * ex + (z - a.z) * ez) / l2, 0, 1); const px = a.x + ex * t, pz = a.z + ez * t, off = Math.hypot(x - px, z - pz); if (off <= B.half + 1 && (!best || off < best.off)) best = { off, y: a.y + (b.y - a.y) * t, s: a.s + (b.s - a.s) * t, px, pz, ux: ex / Math.sqrt(l2), uz: ez / Math.sqrt(l2) }; } return best; };
  const gaps = new Map(out.map((d) => [d, { left: [], right: [] }]));
  for (const d of out) {
    if (d.walls !== 'auto') continue;
    const p = d.path, len = d.len, g = gaps.get(d);
    // (its low ends, where it meets the road it leaves or joins)
    const lowStart = p.findIndex(raised), lowEnd = p.length - 1 - [...p].reverse().findIndex(raised);
    if (lowStart < 0) { g.left.push([0, len]); g.right.push([0, len]); continue; }
    if (lowStart > 0) { g.left.push([0, p[lowStart].s]); g.right.push([0, p[lowStart].s]); }
    if (lowEnd < p.length - 1) { g.left.push([p[lowEnd].s, len]); g.right.push([p[lowEnd].s, len]); }
  }
  for (const A of out) for (const B of out) {
    if (A === B || B.walls !== 'auto' || A.walls !== 'auto') continue;
    // where A runs into B (A's points on B's road, at its height)
    const meets = [];
    for (const q of A.path) { if (!raised(q)) continue; const h = footprint(B, q.x, q.z); if (h && Math.abs(h.y - q.y) < 0.6) meets.push({ q, h }); }
    if (meets.length < 3) continue;
    const s0 = Math.min(...meets.map((m) => m.q.s)), s1 = Math.max(...meets.map((m) => m.q.s));
    const mid = meets[Math.floor(meets.length / 2)];
    // A's side toward B's middle line, and B's side toward A
    const aLeft = { x: mid.q.uz, z: -mid.q.ux };
    const toB = { x: mid.h.px - mid.q.x, z: mid.h.pz - mid.q.z };
    const faceLeft = aLeft.x * toB.x + aLeft.z * toB.z > 0;
    gaps.get(A)[faceLeft ? 'left' : 'right'].push([Math.max(0, s0 - 30), Math.min(A.len, s1 + 30)]);
    const bLeft = { x: mid.h.uz, z: -mid.h.ux };
    const toA = { x: mid.q.x - mid.h.px, z: mid.q.z - mid.h.pz };
    const bs = meets.map((m) => m.h.s);
    gaps.get(B)[bLeft.x * toA.x + bLeft.z * toA.z > 0 ? 'left' : 'right'].push([Math.max(0, Math.min(...bs) - 24), Math.min(B.len, Math.max(...bs) + 24)]);
  }
  for (const d of out) if (d.walls === 'auto') { const g = gaps.get(d); d.walls = { left: without(d.len, g.left), right: without(d.len, g.right) }; }
  return out;
}
export const OGANIRU_DECKS = buildDecks();

// ------------------------------------------------------------------------------------- the deck index --
// Every two points of every deck, in squares of the grid, for finding the decks over a point quickly.
const CELL = 16;
const DECK_CELLS = new Map();
for (let di = 0; di < OGANIRU_DECKS.length; di += 1) {
  const d = OGANIRU_DECKS[di];
  for (let i = 0; i < d.path.length - 1; i += 1) {
    const a = d.path[i], b = d.path[i + 1];
    const pad = d.half + 1;
    const i0 = Math.floor((Math.min(a.x, b.x) - pad) / CELL), i1 = Math.floor((Math.max(a.x, b.x) + pad) / CELL);
    const j0 = Math.floor((Math.min(a.z, b.z) - pad) / CELL), j1 = Math.floor((Math.max(a.z, b.z) + pad) / CELL);
    for (let ci = i0; ci <= i1; ci += 1) for (let cj = j0; cj <= j1; cj += 1) {
      const key = ci * 4096 + cj;
      if (!DECK_CELLS.has(key)) DECK_CELLS.set(key, []);
      DECK_CELLS.get(key).push(di, i);
    }
  }
}
// Where a point is on each deck it is over: the deck, how far along it (s), how far to its left (d, + to the left of the
// way it runs), and the height of its road there. (One answer a deck: the piece of it nearest the point.)
export function oganiruDecksAt(x, z) {
  const hitsOut = [];
  if (!inBox(OGANIRU.bounds, x, z, 20)) return hitsOut;
  const list = DECK_CELLS.get(Math.floor(x / CELL) * 4096 + Math.floor(z / CELL));
  if (!list) return hitsOut;
  const best = new Map();
  for (let k = 0; k < list.length; k += 2) {
    const d = OGANIRU_DECKS[list[k]], a = d.path[list[k + 1]], b = d.path[list[k + 1] + 1];
    const ex = b.x - a.x, ez = b.z - a.z, l2 = ex * ex + ez * ez;
    const t = clamp(((x - a.x) * ex + (z - a.z) * ez) / l2, 0, 1);
    const px = a.x + ex * t, pz = a.z + ez * t;
    const along = Math.hypot(x - px, z - pz);
    if (along > d.half) continue;
    // past either end of the deck is off it (behind its first point, or beyond its last, along the way it runs there:
    // not only on its first and last pieces, whose neighbours' round ends would otherwise reach past them; a loop's
    // later pieces may well lie behind where it began)
    const s = a.s + (b.s - a.s) * t;
    const p0 = d.path[0], pn = d.path[d.path.length - 1];
    if (a.s < d.half + 4 && (x - p0.x) * p0.ux + (z - p0.z) * p0.uz < -0.01) continue;
    if (b.s > d.len - d.half - 4 && (x - pn.x) * pn.ux + (z - pn.z) * pn.uz > 0.01) continue;
    const ux = ex / Math.sqrt(l2), uz = ez / Math.sqrt(l2);
    const left = -(x - px) * uz + (z - pz) * ux;           // + to the left of the way it runs (+x north, +z east: left of north is west, -z)
    const d2 = -left;
    const was = best.get(d);
    if (was && was.off <= along) continue;
    const y = a.y + (b.y - a.y) * t + (a.bank + (b.bank - a.bank) * t) * d2;
    best.set(d, { deck: d, s, d: d2, off: along, y });
  }
  for (const h of best.values()) hitsOut.push(h);
  return hitsOut;
}
// (`d` is measured + to the left of the way the deck runs: for one running north, + to the west)

// ----------------------------------------------------------------------------- the middle strips' openings --
// Where each road's middle strip opens: at each junction across it (none in the strip there), short of each roundabout,
// and the U-turn gaps along it (where the kerb is lowered and a car may turn back; none near a junction).
export const OGANIRU_MEDIAN_GAPS = (() => {
  const out = [];
  for (const r of OGANIRU_ROADS) {
    if (!(r.median > 0) || r.kind !== 'avenue') continue;
    for (const j of OGANIRU_JUNCTIONS) {
      if (!j.roads.includes(r.id)) continue;
      const a = r.along === 'z' ? j.z : j.x, w = r.along === 'z' ? j.hz : j.hx;
      const pad = j.flyover ? 6 : 2;
      out.push({ road: r.id, from: a - w - pad, to: a + w + pad, why: 'junction' });
    }
  }
  // where the Peace Interchange's slip roads meet Peace Avenue, at its lights: open for the traffic turning across it
  for (const z of PEACE_RAMP_Z) out.push({ road: 'peace-2', from: z - 10, to: z + 10, why: 'junction' });
  // Unity Avenue's U-turn gaps, as Stage 1 had them; and on the other avenues every 400 m or so, where no junction is near
  out.push({ road: 'unity', from: -1000, to: -988, why: 'u-turn' }, { road: 'unity', from: -1400, to: -1388, why: 'u-turn' });
  for (const r of OGANIRU_ROADS) {
    if (!(r.median > 0) || r.kind !== 'avenue' || r.id === 'unity' || r.to - r.from < 300) continue;
    for (let a = r.from + 200; a < r.to - 150; a += 400) {
      const at = Math.round(a);
      if (out.some((g) => g.road === r.id && g.to > at - 80 && g.from < at + 80)) continue;
      if (oganiruDecksAt(r.along === 'z' ? r.c : at, r.along === 'z' ? at : r.c).length) continue;
      out.push({ road: r.id, from: at - 6, to: at + 6, why: 'u-turn' });
    }
  }
  return Object.freeze(out.map(Object.freeze));
})();
const GAPS_BY_ROAD = new Map();
for (const g of OGANIRU_MEDIAN_GAPS) { if (!GAPS_BY_ROAD.has(g.road)) GAPS_BY_ROAD.set(g.road, []); GAPS_BY_ROAD.get(g.road).push(g); }
const inMedianGap = (road, a, pad = 0) => (GAPS_BY_ROAD.get(road) || []).some((g) => a >= g.from - pad && a <= g.to + pad);

// (the roadblocks' lines, for keeping trees and lamps clear of them: OGANIRU_CLOSURES below)
const CLOSURE_LINES = [];
// --------------------------------------------------------------------------------------- the ground --
// Raised 15 cm behind a kerb: the middle strips, the walkways, the plazas. Each a box, cut where the strip opens and where
// a road (or a slip road at ground) crosses a walkway, so that what is drawn and what is stood on are the same boxes.
const KERBED = [];
function addKerbed(b) { if (b.x1 - b.x0 > 0.05 && b.z1 - b.z0 > 0.05) KERBED.push(box(b.x0, b.z0, b.x1, b.z1, b.extra || {})); }
// (the runs of [a0, a1] where `open(a)` is false, looked at half a metre at a time)
function runsOf(a0, a1, cut) {
  const out = [];
  let from = null;
  for (let a = a0; a < a1 + 1e-6; a += 0.5) {
    const c = cut(Math.min(a1, a + 0.25));
    if (!c && from === null) from = a;
    if ((c || a >= a1 - 1e-6) && from !== null) { const to = c ? a : a1; if (to - from > 0.4) out.push([from, to]); from = null; }
  }
  return out;
}
// on another road's carriageway, or under a slip road where it meets the ground: a walkway is cut there
const onOtherRoad = (self, x, z) => OGANIRU_ROADS.some((q) => q !== self && q.kind !== 'cutting' && (q.along === 'z' ? z >= q.from - 0.5 && z <= q.to + 0.5 && Math.abs(x - q.c) <= roadWidthAt(q, z).half : x >= q.from - 0.5 && x <= q.to + 0.5 && Math.abs(z - q.c) <= roadWidthAt(q, x).half));
const lowDeckAt = (x, z) => oganiruDecksAt(x, z).some((h) => h.y < 0.6 && h.deck.kind !== 'bridge');
const inAnyRing = (x, z) => OGANIRU_ROUNDABOUTS.some((r) => Math.hypot(x - r.x, z - r.z) < r.outer + r.walk + 0.5);
for (const r of OGANIRU_ROADS) {
  const span = (c0, c1, a0, a1) => (r.along === 'z' ? { x0: Math.min(c0, c1), x1: Math.max(c0, c1), z0: a0, z1: a1 } : { x0: a0, x1: a1, z0: Math.min(c0, c1), z1: Math.max(c0, c1) });
  const P = (lat, a) => (r.along === 'z' ? [r.c + lat, a] : [a, r.c + lat]);
  // the middle strip (an avenue's; an approach's as it opens out, in steps)
  if (r.kind === 'avenue' && r.median > 0) {
    for (const [a0, a1] of runsOf(r.from, r.to, (a) => inMedianGap(r.id, a))) addKerbed({ ...span(r.c - r.median / 2, r.c + r.median / 2, a0, a1), extra: { median: r.id } });
  }
  if (r.flare) {
    const step = 4, dir = Math.sign(r.flare.wide - r.flare.narrow);
    for (let a = r.flare.narrow; dir > 0 ? a < r.flare.wide : a > r.flare.wide; a += dir * step) {
      const w = roadWidthAt(r, a + dir * step / 2);
      if (w.median > 0.6) addKerbed({ ...span(r.c - w.median / 2, r.c + w.median / 2, Math.min(a, a + dir * step), Math.max(a, a + dir * step)), extra: { median: r.id } });
    }
  }
  // the walkways, beyond the kerbs: along the road's length (or its `walks`) but where it is cut; over a taper or a
  // flare, in steps
  const walk = r.flare ? r.flare.walk : r.walk;
  if (walk > 0) {
    const varying = !!(r.taper || r.flare);
    const spans = r.flare ? [[Math.min(r.flare.narrow, r.flare.wide), Math.max(r.flare.narrow, r.flare.wide)]] : r.walks || [[r.from, r.to]];
    for (const k of [-1, 1]) {
      const cut = (a) => { const half = roadWidthAt(r, a).half; const [x, z] = P(k * (half + walk / 2), a); return onOtherRoad(r, x, z) || lowDeckAt(x, z) || inAnyRing(x, z) || inCutting(x, z); };
      for (const [from, to] of spans) for (const [a0, a1] of runsOf(from, to, cut)) {
        if (!varying) { addKerbed({ ...span(r.c + k * r.half, r.c + k * (r.half + walk), a0, a1), extra: { walk: r.id, side: k } }); continue; }
        for (let a = a0; a < a1 - 1e-6; a += 4) {
          const b = Math.min(a1, a + 4), half = roadWidthAt(r, (a + b) / 2).half;
          addKerbed({ ...span(r.c + k * half, r.c + k * (half + walk), a, b), extra: { walk: r.id, side: k } });
        }
      }
    }
  }
}
// the plazas in front of the towers (filled in below, once the towers are placed)
export const OGANIRU_KERBED = KERBED;

// The towers (Stage 1: the six at Unity Avenue and Independence Boulevard; Stage 3 places the rest of downtown).
// Footprints in metres along x (`dx`) and z (`dz`); `storeys` of 3.6 m; what each is made of; the made-up names on their
// lobbies. Solid; nobody goes in yet.
const tower = (id, name, kind, x, z, dx, dz, storeys, o = {}) => Object.freeze({ id, name, kind, x, z, dx, dz, storeys, height: storeys * 3.6 + (o.crown || 0), ...o });
export const OGANIRU_TOWERS = Object.freeze([
  tower('t1', 'Unity Tower', 'glass-blue', 72, -716, 30, 34, 34, { crown: 9, lobby: 'UNITY TOWER', shops: ['Ugo Pharmacy', 'Cool Corner Café'] }),
  tower('t2', 'Ivory Court', 'ribbed-white', 152, -722, 28, 28, 26, { crown: 4, lobby: 'IVORY COURT', shops: ['Ebube Fashion'] }),
  tower('t3', 'Sunrise Chambers', 'stone', -72, -716, 32, 32, 30, { crown: 14, lobby: 'SUNRISE CHAMBERS', shops: ['Oganiru Books', "Chika's Kitchen"] }),
  tower('t4', 'Rotunda House', 'round', -152, -720, 30, 30, 22, { crown: 3, lobby: 'ROTUNDA HOUSE', shops: ['Amara Salon'] }),
  tower('t5', 'Gateway Offices', 'office-teal', 72, -842, 26, 40, 10, { crown: 2, lobby: 'GATEWAY OFFICES', shops: ['Ndidi Travels', 'Akwa Phones'] }),
  tower('t6', 'Harmony Place', 'glass-grey', -72, -846, 30, 30, 40, { crown: 12, lobby: 'HARMONY PLACE', shops: ['Udo Bank', 'Mama Nkechi Foods'] }),
]);
// each tower's plaza: paved, a kerb above the road, from the walkway to a few metres round the tower
for (const t of OGANIRU_TOWERS) {
  const side = t.x > 0 ? 1 : -1;
  const nearX = side > 0 ? 10 + OGANIRU.walk : -(10 + OGANIRU.walk);
  addKerbed({ x0: side > 0 ? nearX : t.x - t.dx / 2 - 6, x1: side > 0 ? t.x + t.dx / 2 + 6 : nearX, z0: t.z - t.dz / 2 - 6, z1: t.z + t.dz / 2 + 6, extra: { plaza: t.id } });
}

const KERB_CELLS = new Map();
for (const b of KERBED) {
  for (let i = Math.floor(b.x0 / CELL); i <= Math.floor(b.x1 / CELL); i += 1) for (let j = Math.floor(b.z0 / CELL); j <= Math.floor(b.z1 / CELL); j += 1) {
    const key = i * 4096 + j;
    if (!KERB_CELLS.has(key)) KERB_CELLS.set(key, []);
    KERB_CELLS.get(key).push(b);
  }
}
// How high the ground is here, before any deck: the road 0, behind a kerb 15 cm (the middle strips, walkways, the
// roundabouts' islands and walkways, the plazas), in the expressway's cutting its road, the land 0.
export function oganiruGroundY(x, z) {
  if (!inBox(OGANIRU.bounds, x, z)) return 0;
  if (inCutting(x, z)) return expresswayY(x);
  for (const r of OGANIRU_ROUNDABOUTS) {
    const dg = Math.hypot(x - r.x, z - r.z);
    if (dg >= r.outer + r.walk + 0.5) continue;
    if (dg <= r.island) return KERB;
    if (dg <= r.outer) return 0;
    // the walkway round it, but where a road comes in
    return inMouth(r, x, z) ? 0 : KERB;
  }
  const list = KERB_CELLS.get(Math.floor(x / CELL) * 4096 + Math.floor(z / CELL));
  if (list) for (const b of list) if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return KERB;
  return 0;
}

// --------------------------------------------------------------------------- where the land is open --
// The city's land that can be walked and driven (its edge is fenced, closures.js): the whole of it from Stage 2.
export const OGANIRU_AREAS = Object.freeze([
  box(-1420, -1660, 950, -509),                  // the city, west of the airport, the strip by the showroom and the town
  box(-250, -511, 250, -478.6),                  // in front of the town's west edge, College Road coming out of it
  box(248.6, -511, 950, -290),                   // north of the town (Anwuli Gardens), Campus Road coming out of it
  box(-1420, -511, -1160, -60),                  // south of the airport, Harmony Avenue going to the Southgate Roundabout
  box(-1420, -61, -1190.6, -21.4),               // south of the Kwale road's end, the Southgate Roundabout
  // (each overlapping the next by a metre, so that there is no line between them that is no one's)
]);
export const onOganiru = (x, z) => inBox(OGANIRU.bounds, x, z) && OGANIRU_AREAS.some((a) => x > a.x0 && x < a.x1 && z > a.z0 && z < a.z1);
// How far a point is from the city's land (0 on it): the ground round it is flat near it, rising beyond (the drawing).
export const oganiruAway = (x, z) => { let best = Infinity; for (const a of OGANIRU_AREAS) best = Math.min(best, Math.hypot(Math.max(a.x0 - x, 0, x - a.x1), Math.max(a.z0 - z, 0, z - a.z1))); return best; };
// Is a point near the city's land at all (for the town's tests of where things stand, so that the town's own ground is
// not asked about the city's)?
export const nearOganiru = (x, z, pad = 20) => inBox(OGANIRU.bounds, x, z, pad) && OGANIRU_AREAS.some((a) => x > a.x0 - pad && x < a.x1 + pad && z > a.z0 - pad && z < a.z1 + pad);
// The lines along which its edge is fenced where the land ends (closures.js EDGE_LINES; each: from a to b, `out` the
// way off the land). The fence stands only where the land does end beyond it. And where the city's land meets the
// town's, the airport's and the Kwale road's, which used to end there, a fence stands all the same but at the roads that
// go through (`keep`: where along the line it stands).
const IN = 1.4;
export const OGANIRU_EDGE_LINES = Object.freeze([
  ...OGANIRU_AREAS.flatMap((a, i) => [
    { id: `oganiru-${i}-n`, a: { x: a.x1 - IN, z: a.z0 + IN }, b: { x: a.x1 - IN, z: a.z1 - IN }, out: { x: 1, z: 0 } },
    { id: `oganiru-${i}-s`, a: { x: a.x0 + IN, z: a.z0 + IN }, b: { x: a.x0 + IN, z: a.z1 - IN }, out: { x: -1, z: 0 } },
    { id: `oganiru-${i}-w`, a: { x: a.x0 + IN, z: a.z0 + IN }, b: { x: a.x1 - IN, z: a.z0 + IN }, out: { x: 0, z: -1 } },
    { id: `oganiru-${i}-e`, a: { x: a.x0 + IN, z: a.z1 - IN }, b: { x: a.x1 - IN, z: a.z1 - IN }, out: { x: 0, z: 1 } },
  ]),
  // between the city and its neighbours: (the town's west and north edges, the airport's west and south, the Kwale
  // road's inland side and its end) open only where a road goes through
  { id: 'oganiru-town-west', a: { x: -250 + IN, z: -480 + IN }, b: { x: 250 - IN, z: -480 + IN }, out: { x: 0, z: -1 }, keep: (p) => Math.abs(p.x) > 12 },
  { id: 'oganiru-town-north', a: { x: 250 - IN, z: -480 + IN }, b: { x: 250 - IN, z: -290 }, out: { x: 1, z: 0 }, keep: (p) => Math.abs(p.z - CAMPUS_Z) > 7.5 },
  { id: 'oganiru-airport-west', a: { x: -1160 + IN, z: -510 + IN }, b: { x: -560 - IN, z: -510 + IN }, out: { x: 0, z: -1 }, keep: () => true },
  { id: 'oganiru-airport-south', a: { x: -1160 + IN, z: -510 + IN }, b: { x: -1160 + IN, z: -60 }, out: { x: -1, z: 0 }, keep: () => true },
  { id: 'oganiru-kwale-inland', a: { x: -1192 + IN, z: -60 + IN }, b: { x: -1160 + IN, z: -60 + IN }, out: { x: 0, z: -1 }, keep: () => true },
  { id: 'oganiru-kwale-end', a: { x: -1192 + IN, z: -60 + IN }, b: { x: -1192 + IN, z: -20 - IN }, out: { x: -1, z: 0 }, keep: (p) => Math.abs(p.z - KWALE_Z) > 8 },
].map((l) => Object.freeze({ ...l, a: Object.freeze(l.a), b: Object.freeze(l.b), out: Object.freeze(l.out), style: 'tape' })));

// The roads not built on yet, closed across their whole width (closures.js draws and makes them solid).
export const OGANIRU_CLOSURES = Object.freeze([
  { id: 'unity-west', name: 'Unity Avenue, west end', a: { x: -14, z: -1632 }, b: { x: 14, z: -1632 }, facing: 0, sign: ['ROAD CLOSED', 'Road works ahead'], why: 'Oganiru City is still being built beyond this point.' },
  { id: 'harmony-west', name: 'Harmony Avenue, west end', a: { x: HARMONY_X - 14, z: -1612 }, b: { x: HARMONY_X + 14, z: -1612 }, facing: 0, sign: ['ROAD CLOSED', 'Road works ahead'], why: 'Oganiru City is still being built beyond this point.' },
  { id: 'kwale-south', name: 'Asaba–Kwale Road, south', a: { x: -1385, z: KWALE_Z - 11 }, b: { x: -1385, z: KWALE_Z + 11 }, facing: Math.PI / 2, sign: ['ROAD CLOSED', 'To Kwale and Warri: road works'], why: 'The road on to Kwale and Warri is not built on from here yet.' },
  { id: 'airport-south', name: 'Airport Roundabout, south', a: { x: HARMONY_X - 66, z: GATEWAY_Z - 14 }, b: { x: HARMONY_X - 66, z: GATEWAY_Z + 14 }, facing: Math.PI / 2, sign: ['ROAD CLOSED', 'Road works'], why: 'Oganiru City is still being built beyond this point.' },
  { id: 'campus-north', name: 'Campus Roundabout, north', a: { x: PEACE_X + 76, z: CAMPUS_Z - 14 }, b: { x: PEACE_X + 76, z: CAMPUS_Z + 14 }, facing: -Math.PI / 2, sign: ['ROAD CLOSED', 'Anwuli Gardens: coming soon'], why: 'Oganiru City is still being built beyond this point.' },
].map((c) => Object.freeze({ ...c, state: 'under construction', a: Object.freeze(c.a), b: Object.freeze(c.b), sign: Object.freeze(c.sign) })));
CLOSURE_LINES.push(...OGANIRU_CLOSURES);
// (what of the roadblocks and of the fence at the built land's edge is the city's: drawn with it, render-oganiru.js)
export const ofOganiru = (item, kind) => (kind === 'closure' ? OGANIRU_CLOSURES.includes(item) : String((item && item.line) || '').startsWith('oganiru-'));

// --------------------------------------------------------------------- trees, lamps, signals, pillars --
// Under a deck (or beside it within `pad`), where nothing grows and no lamp stands.
const underDeck = (x, z, pad = 2) => oganiruDecksAt(x, z).some((h) => h.y - D.thick > 0.5 || h.y > 0.3) || [[-pad, 0], [pad, 0], [0, -pad], [0, pad]].some(([dx, dz]) => oganiruDecksAt(x + dx, z + dz).some((h) => h.y > 0.3));
const nearJunction = (x, z, pad) => !!junctionAt(x, z, pad);
// (and the roadblocks across the roads not built on yet: nothing grows or stands just before them; they are declared below)
const closureNear = (x, z, pad) => CLOSURE_LINES.some(({ a, b }) => { const dx = b.x - a.x, dz = b.z - a.z, t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1); return Math.hypot(x - a.x - dx * t, z - a.z - dz * t) < pad; });
const nearRing = (x, z, pad) => OGANIRU_ROUNDABOUTS.some((r) => Math.hypot(x - r.x, z - r.z) < r.outer + pad);
const towerNear = (x, z, pad) => OGANIRU_TOWERS.some((t) => Math.abs(x - t.x) < t.dx / 2 + pad && Math.abs(z - t.z) < t.dz / 2 + pad);
export const OGANIRU_TREES = [];
export const OGANIRU_LAMPS = [];
{
  // Down each avenue's middle strip: the slim trees every 9 m on those that have them (the habitation's slim tree, from
  // its owner's file unchanged, each copy a little taller or shorter and turned its own way), and a tall lamp with two
  // arms every fourth place (every 36 m on those without trees); none at the strip's openings, near a junction, under a
  // deck. At each junction, a lamp on the end of the strip either side, so that the junction is lit at night. Downtown
  // (Unity Avenue from the Gate Roundabout to the interchange), the lamps carry two banners.
  for (const r of OGANIRU_ROADS) {
    if (r.kind !== 'avenue' || !(r.median > 0) || r.lamps === false) continue;
    // (the middle strip's lamps' two arms reach across the road, over both carriageways)
    const ACROSS = r.along === 'z' ? Math.PI / 2 : 0;
    const P = (a, lat = 0) => (r.along === 'z' ? [r.c + lat, a] : [a, r.c + lat]);
    const noses = (GAPS_BY_ROAD.get(r.id) || []).filter((g) => g.why === 'junction').flatMap((g) => [g.from - 2.5, g.to + 2.5]).filter((a) => a > r.from + 2 && a < r.to - 2);
    for (const a of noses) { const [x, z] = P(a); if (!underDeck(x, z, 3)) OGANIRU_LAMPS.push({ kind: 'median', x, z, y: KERB, heading: ACROSS }); }
    const dir = r.along === 'z' ? -1 : 1;              // (from the end nearer the town)
    const start = dir < 0 ? r.to - 18 : r.from + 18, end = dir < 0 ? r.from + 6 : r.to - 6;
    let slot = 0;
    for (let a = start; dir < 0 ? a > end : a < end; a += dir * 9, slot += 1) {
      if (inMedianGap(r.id, a, 6)) continue;
      const [x, z] = P(a);
      if (underDeck(x, z, 6) || noses.some((n) => Math.abs(n - a) < 5) || nearRing(x, z, 8) || closureNear(x, z, 12)) continue;
      // (a lamp every fourth place, but not within 14 m of a junction's)
      if (slot % 4 === 2 && !noses.some((n) => Math.abs(n - a) < 14)) { OGANIRU_LAMPS.push({ kind: 'median', x, z, y: KERB, heading: ACROSS, banner: r.id === 'unity' && a > UNITY_WALKS_TO }); continue; }
      if (r.trees) {
        const i = Math.round(Math.abs(a)) * 7 + (r.along === 'x' ? 3 : 0) + Math.round(Math.abs(r.c));
        const [tx, tz] = P(a + (hash(i, 5) - 0.5) * 0.8, (hash(i, 3) - 0.5) * 0.5);
        OGANIRU_TREES.push({ kind: 'slim', x: tx, z: tz, y: KERB, size: 0.9 + hash(i, 7) * 0.22, turn: hash(i, 9) * Math.PI * 2, road: r.id });
      }
    }
  }
  // shade trees along the verges beyond the walkways, every 17 m, where nothing else is (no road mouth, tower, deck)
  for (const r of OGANIRU_ROADS) {
    if (!(r.walk > 0) || r.kind === 'approach') continue;
    const P = (a, lat) => (r.along === 'z' ? [r.c + lat, a] : [a, r.c + lat]);
    const spans = r.walks || [[r.from, r.to]];
    for (const [w0, w1] of spans) for (let a = w0 + 8; a < w1 - 8; a += 17) {
      for (const k of [-1, 1]) {
        const half = roadWidthAt(r, a).half;
        const [x, z] = P(a, k * (half + r.walk + 3));
        if (towerNear(x, z, 10) || nearJunction(x, z, 8) || nearRing(x, z, 14) || underDeck(x, z, 5) || onOtherRoad(null, x, z) || inCutting(x, z)) continue;
        if (OGANIRU_KERBED.some((b) => b.plaza && inBox(b, x, z, 2))) continue;
        const i = Math.round(Math.abs(a)) * 2 + (k > 0 ? 1 : 0) + Math.round(Math.abs(r.c)) * 3;
        OGANIRU_TREES.push({ kind: hash(i, 2) < 0.6 ? 'mango' : 'almond', x: x + (hash(i, 4) - 0.5) * 1.2, z: z + (hash(i, 6) - 0.5) * 3, y: 0, size: 0.95 + hash(i, 8) * 0.3, turn: hash(i, 10) * 6.28 });
      }
    }
  }
  // the expressway's grass banks (at ground south of its cutting, and along the land either side of the cutting): palms
  // and shade trees, back from the road
  for (let x = -1180; x < OGANIRU_CUTTING.x1 - 20; x += 23) {
    for (const k of [-1, 1]) {
      const z = EXPRESSWAY_Z + k * (inCutting(x, EXPRESSWAY_Z) || x > OGANIRU_CUTTING.x0 ? 27 : 24) + (hash(Math.round(x), k + 4) - 0.5) * 4;
      if (underDeck(x, z, 8) || onOtherRoad(null, x, z) || nearJunction(x, z, 10)) continue;
      const i = Math.round(-x) * 3 + (k > 0 ? 1 : 0);
      OGANIRU_TREES.push({ kind: hash(i, 12) < 0.5 ? 'palm' : hash(i, 13) < 0.6 ? 'mango' : 'almond', x, z, y: 0, size: 0.9 + hash(i, 14) * 0.3, turn: hash(i, 15) * 6.28 });
    }
  }
  // lamps round each roundabout, single-armed over its carriageway: two each side of every diagonal between its roads
  // (none in a road's mouth)
  for (const rb of OGANIRU_ROUNDABOUTS) {
    for (let k = 0; k < 8; k += 1) {
      const a = (Math.floor(k / 2) * 90 + 45 + (k % 2 ? 12 : -12)) * (Math.PI / 180);
      const x = rb.x + Math.sin(a) * (rb.outer + 1.4), z = rb.z + Math.cos(a) * (rb.outer + 1.4);
      if (inMouth(rb, x, z)) continue;
      OGANIRU_LAMPS.push({ kind: 'edge', x, z, y: KERB, heading: Math.atan2(rb.x - x, rb.z - z) });
    }
  }
  // along the flyover-roads beside the junction flyovers, the approaches, the Kwale road on and the roundabouts' stubs:
  // single-armed at the road's edges, every 36 m, the arm over the road
  for (const r of OGANIRU_ROADS) {
    if (!['flyover-road', 'link'].includes(r.kind) && !(r.kind === 'avenue' && r.lamps === false)) continue;
    const P = (a, lat) => (r.along === 'z' ? [r.c + lat, a] : [a, r.c + lat]);
    for (let a = r.from + 12; a < r.to - 6; a += 36) {
      for (const k of [-1, 1]) {
        const half = roadWidthAt(r, a).half;
        const [x, z] = P(a, k * (half + 0.8));
        if (nearJunction(x, z, 3) || nearRing(x, z, 4) || underDeck(x, z, 2)) continue;
        const heading = r.along === 'z' ? (k > 0 ? -Math.PI / 2 : Math.PI / 2) : (k > 0 ? Math.PI : 0);
        OGANIRU_LAMPS.push({ kind: 'edge', x, z, y: oganiruGroundY(x, z), heading });
      }
    }
  }
  // the junctions under the junction flyovers, wider than the decks' own lamps light: one at each corner, its arm
  // reaching in over it
  for (const j of OGANIRU_JUNCTIONS) {
    if (!j.flyover) continue;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = j.x + sx * (j.hx + 1), z = j.z + sz * (j.hz + 2);
      if (underDeck(x, z, 1)) continue;
      OGANIRU_LAMPS.push({ kind: 'edge', x, z, y: KERB, heading: Math.atan2(j.x - x, j.z - z) });
    }
  }
  // along College Road and Campus Road carried on, from the town's edge to the roundabout: single-armed, both sides
  for (const z of [-490, -511, -530]) {
    const half = roadWidthAt(ROAD_BY_ID.get('unity-gate'), z).half;
    for (const k of [-1, 1]) { const x = k * (half + 1.0); OGANIRU_LAMPS.push({ kind: 'edge', x, z, y: oganiruGroundY(x, z), heading: k > 0 ? -Math.PI / 2 : Math.PI / 2 }); }
  }
  for (const x of [262, 284]) {
    const half = roadWidthAt(ROAD_BY_ID.get('campus-gate'), x).half;
    for (const k of [-1, 1]) { const z = CAMPUS_Z + k * (half + 1.0); OGANIRU_LAMPS.push({ kind: 'edge', x, z, y: oganiruGroundY(x, z), heading: k > 0 ? Math.PI : 0 }); }
  }
  // the expressway at ground and over its cutting: single-armed on its edges, every 40 m, the arm over its lanes (on the
  // cutting's parapets they reach out over it)
  for (let x = -1180; x < OGANIRU_CUTTING.x1 - 10; x += 40) {
    for (const k of [-1, 1]) {
      if (x < -1040 && k < 0) continue;
      const z = EXPRESSWAY_Z + k * (inCutting(x, EXPRESSWAY_Z) || x > OGANIRU_CUTTING.x0 ? CUT.wall + CUT.wallWidth / 2 : 15.8);
      if (underDeck(x, z, 3) || Math.abs(x - HOPE_X) < 20) continue;
      OGANIRU_LAMPS.push({ kind: 'edge', x, z, y: 0, heading: k > 0 ? Math.PI : 0, gy: expresswayY(x) });
    }
  }
  // the ornate black lamp posts with lanterns on downtown's pavements, every 30 m both sides, and in front of the towers
  for (const r of OGANIRU_ROADS.filter((q) => q.kind === 'street')) {
    const P = (a, lat) => (r.along === 'z' ? [r.c + lat, a] : [a, r.c + lat]);
    for (let a = r.from + 9; a < r.to - 6; a += 30) {
      for (const k of [-1, 1]) {
        const [x, z] = P(a, k * (r.half + 1.2));
        if (nearJunction(x, z, 4) || towerNear(x, z, 3) || underDeck(x, z, 2) || onOtherRoad(r, x, z)) continue;
        OGANIRU_LAMPS.push({ kind: 'ornate', x, z, y: KERB, heading: 0 });
      }
    }
  }
  for (const t of OGANIRU_TOWERS) {
    const front = t.x > 0 ? t.x - t.dx / 2 - 3 : t.x + t.dx / 2 + 3;
    for (const k of [-1, 1]) OGANIRU_LAMPS.push({ kind: 'ornate', x: front, z: t.z + k * (t.dz / 2 - 2), y: KERB, heading: 0 });
  }
  // along the decks' walls: single-armed, every 36 m, alternately each side on a ramp, both sides on the expressway and
  // the flyovers; where the deck is above the ground (not on its first, low metres)
  for (const d of OGANIRU_DECKS) {
    if (d.kind === 'ground-ramp') continue;
    const both = d.id === 'viaduct' || d.kind === 'flyover' && d.barrier || d.kind === 'bridge';
    let n = 0;
    for (let s = 18; s < d.len - 10; s += 36, n += 1) {
      const p = d.path.find((q) => q.s >= s) || d.path[d.path.length - 1];
      if (p.y < 2.5 && d.kind !== 'bridge') continue;
      for (const side of both ? [-1, 1] : [n % 2 ? 1 : -1]) {
        // (side +1 is the deck's left; a lamp stands on the wall there, its arm over the road)
        const wall = (side > 0 ? d.walls.left : d.walls.right).some(([a, b]) => s >= a && s <= b);
        if (!wall) continue;
        const lx = p.uz * side, lz = -p.ux * side;        // the deck's left (side +1) or right: (+x north, +z east) left of (ux, uz) is (uz, -ux)
        OGANIRU_LAMPS.push({ kind: 'deck', x: p.x + lx * (d.half - 0.25), z: p.z + lz * (d.half - 0.25), y: p.y + D.wall, heading: Math.atan2(-lx, -lz), deck: d.id });
      }
    }
  }
}
// (each lamp is known by its place in this list: street-lamps.js)
Object.freeze(OGANIRU_TREES); Object.freeze(OGANIRU_LAMPS);

// The traffic signals at the junctions: a pole at each corner where traffic comes in, facing it. Phase 0 is the roads'
// along z (the avenues), 1 the roads' along x (the boulevards, the cross streets) (atani-city.js signalState: the same
// cycle as Market Road's, each junction's a few seconds out of step with the next, `offset`). At the Peace Interchange,
// the avenue's (phase 0) and its slip roads' (phase 1).
export const OGANIRU_SIGNALS = Object.freeze([
  ...OGANIRU_JUNCTIONS.filter((j) => j.signals).flatMap((j) => {
    const out = [];
    const hx = j.hx + 2, hz = j.hz + 2;
    // (on the far side of the junction from the traffic it is for, on that traffic's right, facing it: for the traffic
    // coming from the west, going east on the road's south half, at the south-east corner facing west; and so round)
    if (j.legs.includes('w')) out.push({ x: j.x - hx, z: j.z + hz, heading: Math.PI, phase: 0, offset: j.offset, junction: j.id });
    if (j.legs.includes('e')) out.push({ x: j.x + hx, z: j.z - hz, heading: 0, phase: 0, offset: j.offset, junction: j.id });
    if (j.legs.includes('s')) out.push({ x: j.x + hx + 1.5, z: j.z + hz, heading: -Math.PI / 2, phase: 1, offset: j.offset, junction: j.id });
    if (j.legs.includes('n')) out.push({ x: j.x - hx - 1.5, z: j.z - hz, heading: Math.PI / 2, phase: 1, offset: j.offset, junction: j.id });
    return out;
  }),
  // (the slip road coming in: off the north-bound carriageway to the south of the avenue, off the south-bound one to
  // its north; the other two go out from it)
  ...PEACE_RAMP_Z.flatMap((z, k) => {
    const offset = 8 + k * 8, junction = `peace-ramps-${k}`;
    return [
      { x: PEACE_X + 12, z: z + 12, heading: 0, phase: 0, offset, junction },
      { x: PEACE_X - 12, z: z - 12, heading: Math.PI, phase: 0, offset, junction },
      k === 0 ? { x: PEACE_X - 12, z: z + 6, heading: -Math.PI / 2, phase: 1, offset, junction } : { x: PEACE_X + 12, z: z - 6, heading: Math.PI / 2, phase: 1, offset, junction },
    ];
  }),
].map(Object.freeze));
// Where the traffic coming into each signalled junction stops (the far edge of the stop line painted across its half,
// beyond the zebra: render-oganiru.js), and which way it is going: for the town's cars (traffic.js).
export const STOP_LINE_OUT = 5.4;       // metres beyond a junction's edge
export const OGANIRU_STOP_LINES = Object.freeze([
  ...OGANIRU_JUNCTIONS.filter((j) => j.signals).flatMap((j) => {
    const out = [];
    const ex = j.hx + STOP_LINE_OUT, ez = j.hz + STOP_LINE_OUT;
    if (j.legs.includes('e')) out.push({ way: 'w', x: j.x + j.hx / 2, z: j.z + ez, half: j.hx / 2 + 0.5, phase: 0, offset: j.offset, junction: j.id });
    if (j.legs.includes('w')) out.push({ way: 'e', x: j.x - j.hx / 2, z: j.z - ez, half: j.hx / 2 + 0.5, phase: 0, offset: j.offset, junction: j.id });
    if (j.legs.includes('n')) out.push({ way: 's', x: j.x + ex, z: j.z - j.hz / 2, half: j.hz / 2 + 0.5, phase: 1, offset: j.offset, junction: j.id });
    if (j.legs.includes('s')) out.push({ way: 'n', x: j.x - ex, z: j.z + j.hz / 2, half: j.hz / 2 + 0.5, phase: 1, offset: j.offset, junction: j.id });
    return out;
  }),
  // (at the Peace Interchange's: the avenue's traffic either way, and the slip road's coming in, painted there too)
  ...PEACE_RAMP_Z.flatMap((z, k) => {
    const offset = 8 + k * 8, junction = `peace-ramps-${k}`;
    return [
      { way: 'w', x: PEACE_X + 5, z: z + 11.5, half: 5.5, phase: 0, offset, junction },
      { way: 'e', x: PEACE_X - 5, z: z - 11.5, half: 5.5, phase: 0, offset, junction },
      k === 0 ? { way: 'n', x: PEACE_X - 14, z, half: 4.5, phase: 1, offset, junction } : { way: 's', x: PEACE_X + 14, z, half: 4.5, phase: 1, offset, junction },
    ];
  }),
].map(Object.freeze));

// Pillars: under each deck where it is high enough to pass under, round concrete columns with wide caps, every 30 m or
// so; the expressway on two columns a cap's width apart. Not on a road.
const onRoadHere = (x, z) => OGANIRU_ROADS.some((r) => {
  const a = alongOf(r, x, z);
  if (a < r.from - 0.5 || a > r.to + 0.5) return false;
  const w = roadWidthAt(r, a);
  const off = Math.abs(across(r, x, z));
  // (a flyover-road's middle is its deck's: the columns stand in it)
  if (r.kind === 'flyover-road' && off < w.median / 2 - 1) return false;
  return off < w.half + (w.walk || 0) + 0.6;
}) || OGANIRU_ROUNDABOUTS.some((r) => Math.hypot(x - r.x, z - r.z) < r.outer + 1) || inCutting(x, z);
export const OGANIRU_PILLARS = [];
for (const d of OGANIRU_DECKS) {
  const two = d.id === 'viaduct';
  if (d.kind === 'bridge' || d.kind === 'ground-ramp' || (d.kind === 'flyover' && d.barrier)) continue;
  for (let s = 14; s < d.len - 6; s += two ? 30 : 28) {
    const p = d.path.find((q) => q.s >= s) || d.path[d.path.length - 1];
    if (p.y - D.thick - oganiruGroundY(p.x, p.z) < OGANIRU.under) continue;
    const offsets = two ? [-8, 8] : [0];
    for (const o of offsets) {
      const lx = -p.uz, lz = p.ux;
      let x = p.x + lx * o, z = p.z + lz * o;
      // (not on a road: nudged along the deck clear of it)
      if (onRoadHere(x, z)) { const alt = [6, -6, 12, -12].map((k) => ({ x: x + p.ux * k, z: z + p.uz * k })).find((q) => !onRoadHere(q.x, q.z)); if (!alt) continue; x = alt.x; z = alt.z; }
      // (nor in the way of a ramp under it)
      if (oganiruDecksAt(x, z).some((h) => h.deck !== d && h.y < p.y - 3 && h.y > 0.2)) continue;
      OGANIRU_PILLARS.push(Object.freeze({ x, z, r: two ? 0.85 : 0.7, top: p.y - D.thick, deck: d.id, heading: Math.atan2(p.ux, p.uz) }));
    }
  }
}
// the junction flyovers' columns: on their middle lines, either side of the road under them and once more each side
// before the ramps come down to their embankments (the same each side)
for (const d of OGANIRU_DECKS.filter((q) => q.kind === 'flyover' && q.barrier)) {
  const alongX = Math.abs(d.path[0].z - d.path[d.path.length - 1].z) < 1;
  const c = alongX ? d.path[0].z : d.path[0].x, mid = alongX ? (d.path[0].x + d.path[d.path.length - 1].x) / 2 : (d.path[0].z + d.path[d.path.length - 1].z) / 2;
  for (const o of [-48, -20, 20, 48]) {
    const x = alongX ? mid + o : c, z = alongX ? c : mid + o;
    const h = oganiruDecksAt(x, z).find((q) => q.deck === d);
    if (h && h.y - D.thick >= OGANIRU.under) OGANIRU_PILLARS.push(Object.freeze({ x, z, r: 0.75, top: h.y - D.thick, deck: d.id, heading: alongX ? Math.PI / 2 : 0 }));
  }
}
Object.freeze(OGANIRU_PILLARS);

// --------------------------------------------------------------------------------- what is in the way --
// On the ground: the towers, the trees' trunks, the lamps' poles, the signals' poles, the pillars, the expressway's
// barrier and the cutting's walls, and the decks where they are too low to go under (embankments). Each with how high it
// stands (`top`, absolute): something above it is not stopped by it (a car on the flyover by the pillar under it, nor
// by the embankment of the ramp it is on).
const circle = (x, z, r, top, extra = {}) => Object.freeze({ x, z, r, top, ...extra });
export const OGANIRU_SOLIDS = Object.freeze([
  ...OGANIRU_TREES.map((t) => circle(t.x, t.z, t.kind === 'slim' ? 0.3 : t.kind === 'palm' ? 0.28 : 0.42, 12, { tree: true })),
  ...OGANIRU_SIGNALS.map((s) => circle(s.x, s.z, 0.13, 5)),
  ...OGANIRU_PILLARS.map((p) => circle(p.x, p.z, p.r, p.top, { pillar: true })),
]);
// (the lamps' poles are street-lamps.js's: they can be knocked down)
const SOLID_CELLS = new Map();
for (const c of OGANIRU_SOLIDS) {
  for (let i = Math.floor((c.x - c.r) / CELL); i <= Math.floor((c.x + c.r) / CELL); i += 1) for (let j = Math.floor((c.z - c.r) / CELL); j <= Math.floor((c.z + c.r) / CELL); j += 1) {
    const key = i * 4096 + j;
    if (!SOLID_CELLS.has(key)) SOLID_CELLS.set(key, []);
    SOLID_CELLS.get(key).push(c);
  }
}
// the towers as boxes (round ones as circles), with a metre's lobby canopy that is not in the way
const TOWER_SOLIDS = OGANIRU_TOWERS.map((t) => (t.kind === 'round' ? { round: true, x: t.x, z: t.z, r: t.dx / 2, top: t.height } : { ...box(t.x - t.dx / 2, t.z - t.dz / 2, t.x + t.dx / 2, t.z + t.dz / 2), top: t.height }));
// the walls along the ground: the expressway's middle barrier at ground and in its cutting (0.82 m), the cutting's
// retaining walls with their parapets (from its road to 1.1 m over the land)
export const OGANIRU_WALLS = Object.freeze([
  Object.freeze({ id: 'barrier-south', along: 'x', c: EXPRESSWAY_Z, from: -1040, to: OGANIRU_CUTTING.x1, half: 0.3, top: (x) => expresswayY(x) + 0.82 }),
  ...[-1, 1].map((k) => Object.freeze({ id: `cutting-${k > 0 ? 'east' : 'west'}`, along: 'x', c: EXPRESSWAY_Z + k * (CUT.wall + CUT.wallWidth / 2), from: OGANIRU_CUTTING.x0, to: OGANIRU_CUTTING.x1, half: CUT.wallWidth / 2, top: () => CUT.parapet, bottom: (x) => expresswayY(x) })),
]);
const wallAt = (x, z, radius, y) => {
  for (const w of OGANIRU_WALLS) {
    if (x < w.from - radius || x > w.to + radius || Math.abs(z - w.c) > w.half + radius) continue;
    if (y >= w.top(x) - 0.05) continue;
    return w;
  }
  return null;
};

// Is something of `radius` at (x, z), standing at height `y` (its feet), in the way of anything of the city's on the
// ground or under a deck? (On a deck, the deck's own rule: oganiruOnDeck.)
export function oganiruBlocked(x, z, radius = 0.4, y = 0) {
  if (!inBox(OGANIRU.bounds, x, z, radius + 2)) return false;
  for (const t of TOWER_SOLIDS) {
    if (y >= t.top) continue;
    if (t.round ? Math.hypot(x - t.x, z - t.z) < t.r + radius : (x > t.x0 - radius && x < t.x1 + radius && z > t.z0 - radius && z < t.z1 + radius)) return true;
  }
  const list = SOLID_CELLS.get(Math.floor(x / CELL) * 4096 + Math.floor(z / CELL));
  if (list) for (const c of list) if (y < c.top - 0.05 && Math.hypot(x - c.x, z - c.z) < c.r + radius) return true;
  if (wallAt(x, z, radius, y)) return true;
  // an embankment: a deck too low to pass under, solid from the ground up to its road
  const g = (px, pz) => (inCutting(px, pz) ? expresswayY(px) : 0);
  for (const h of oganiruDecksAt(x, z)) {
    if (h.y - g(x, z) <= 0.32) continue;
    if (y >= h.y - 0.3) continue;              // on it (or above it): not in the way
    if (h.y - D.thick - y < OGANIRU.under) {
      // (within its width: its retaining walls are its edges)
      if (h.off <= h.deck.half + radius) return true;
    }
  }
  // the decks' sides and pillars are found above; nothing else of the city's stands in the way on the ground
  // (and the edge of a deck being driven up from the ground: its low end is open)
  for (const h of decksNear(x, z, radius)) if (h.y - g(x, z) > 0.32 && y < h.y - 0.3 && h.y - D.thick - y < OGANIRU.under) return true;
  return false;
}
// the decks within `radius` of a point (for a body's width against an embankment's side)
function decksNear(x, z, radius) {
  const out = [];
  if (radius <= 0.05) return out;
  for (const [dx, dz] of [[radius, 0], [-radius, 0], [0, radius], [0, -radius]]) for (const h of oganiruDecksAt(x + dx, z + dz)) out.push({ ...h });
  return out;
}

// ------------------------------------------------------------------------------------------ levels --
// The surface something standing at height `y` at (x, z) is on: the highest of the ground and the decks over the
// point that is no more than a step above where it was. With no `y`, the ground (the lowest surface). Returns the
// height, and the deck if it is on one.
export function oganiruSurface(x, z, y, ground = 0) {
  let best = { y: ground, deck: null, hit: null };
  if (!Number.isFinite(y)) return best;
  for (const h of oganiruDecksAt(x, z)) {
    if (h.y <= y + OGANIRU.step && h.y > best.y + 0.02) best = { y: h.y, deck: h.deck, hit: { ...h } };
  }
  return best;
}
// On a deck, can something of `radius` stand at (x, z)? Inside the deck's walls (or across into another deck it runs
// into at the same height), clear of its middle barrier, short of its closed ends.
export function oganiruOnDeck(x, z, radius, y) {
  const hits = oganiruDecksAt(x, z).filter((h) => Math.abs(h.y - y) < 0.9);
  if (!hits.length) return false;
  for (const h of hits) {
    const d = h.deck;
    if (h.off > d.inner - radius) {
      // past the inner edge: only where its wall is open on that side (another deck runs on beside it)
      const side = h.d > 0 ? 'left' : 'right';
      const walled = d.walls[side].some(([a, b]) => h.s >= a && h.s <= b);
      if (walled || h.off > d.half) continue;
    }
    if (d.barrier && Math.abs(h.d) < d.barrier + radius && h.y > 1) continue;
    if (d.barrier && d.kind === 'bridge' && Math.abs(h.d) < d.barrier + radius) continue;
    if (d.closed.includes('start') && h.s < 1.5 + radius) continue;
    if (d.closed.includes('end') && h.s > d.len - 1.5 - radius) continue;
    return true;
  }
  return false;
}

// Is the road here tarred (for how fast a vehicle goes on it)? The city's roads, its roundabouts and every deck.
export function oganiruTar(x, z) {
  if (!inBox(OGANIRU.bounds, x, z)) return false;
  for (const r of OGANIRU_ROUNDABOUTS) { const d = Math.hypot(x - r.x, z - r.z); if (d < r.outer && d > r.island) return true; }
  if (junctionAt(x, z)) return true;
  for (const r of OGANIRU_ROADS) {
    const a = alongOf(r, x, z);
    if (a < r.from - 1 || a > r.to + 1) continue;
    if (Math.abs(across(r, x, z)) <= roadWidthAt(r, a).half) return true;
  }
  return oganiruDecksAt(x, z).length > 0;
}

// Is the point (x, y, z) inside one of the city's structures (for the camera, which must never be inside one): a deck's
// slab or walls, a pillar, a tower, the cutting's walls or the land beside it?
export function oganiruStructureAt(x, z, y) {
  if (!inBox(OGANIRU.bounds, x, z, 4)) return false;
  const g = inCutting(x, z) ? expresswayY(x) : 0;
  for (const h of oganiruDecksAt(x, z)) {
    if (y > h.y - D.thick - 0.15 && y < h.y + 0.05) return true;                   // in the slab
    if (h.off > h.deck.inner - 0.1 && y < h.y + D.wall + 0.1 && y > h.y - D.thick) return true;      // in a wall
    if (h.y - D.thick - g < OGANIRU.under && y < h.y && y > g - 0.05) return true;                  // in an embankment
  }
  for (const t of TOWER_SOLIDS) if (y < t.top && (t.round ? Math.hypot(x - t.x, z - t.z) < t.r + 0.2 : (x > t.x0 - 0.2 && x < t.x1 + 0.2 && z > t.z0 - 0.2 && z < t.z1 + 0.2))) return true;
  const list = SOLID_CELLS.get(Math.floor(x / CELL) * 4096 + Math.floor(z / CELL));
  if (list) for (const c of list) if (c.pillar && y < c.top + 0.2 && Math.hypot(x - c.x, z - c.z) < c.r + 0.25) return true;
  // the cutting's walls, and the land either side of it below the ground's level
  if (x > OGANIRU_CUTTING.x0 && x < OGANIRU_CUTTING.x1) {
    const off = Math.abs(z - EXPRESSWAY_Z);
    if (off > CUT.wall - 0.1 && off < CUT.wall + CUT.wallWidth + 0.1 && y < CUT.parapet + 0.1 && y > expresswayY(x) - 0.1) return true;
    if (off >= CUT.wall + CUT.wallWidth && y < -0.05) return true;
  }
  return false;
}
// How high the city's tallest structure stands over a point (the camera looks for something to be inside only up to it).
export function oganiruTallAt(x, z) {
  if (!inBox(OGANIRU.bounds, x, z, 4)) return 0;
  let top = 0;
  for (const h of oganiruDecksAt(x, z)) top = Math.max(top, h.y + D.wall + 0.2);
  for (const t of TOWER_SOLIDS) if (t.round ? Math.hypot(x - t.x, z - t.z) < t.r + 1 : (x > t.x0 - 1 && x < t.x1 + 1 && z > t.z0 - 1 && z < t.z1 + 1)) top = Math.max(top, t.top);
  if (x > OGANIRU_CUTTING.x0 - 1 && x < OGANIRU_CUTTING.x1 + 1 && Math.abs(z - EXPRESSWAY_Z) < CUT.wall + CUT.wallWidth + 1) top = Math.max(top, CUT.parapet + 0.2);
  return top;
}

// The traffic lights for the town's cars (traffic.js): must something going from (x, z) to (nx, nz) wait here, the
// light at the stop line ahead not being green? `signalState`: the town's cycle (atani-city.js), passed in.
const STOP_CELLS = new Map();
for (const s of OGANIRU_STOP_LINES) { const key = Math.floor(s.x / 64) * 4096 + Math.floor(s.z / 64); if (!STOP_CELLS.has(key)) STOP_CELLS.set(key, []); STOP_CELLS.get(key).push(s); }
export function oganiruHold(x, z, nx, nz, seconds, signalState) {
  if (!inBox(OGANIRU.bounds, x, z, 30)) return false;
  for (let i = -1; i <= 1; i += 1) for (let k = -1; k <= 1; k += 1) {
    const list = STOP_CELLS.get((Math.floor(x / 64) + i) * 4096 + Math.floor(z / 64) + k);
    if (!list) continue;
    for (const s of list) {
      if (s.way === 'n' || s.way === 's') {
        if (Math.abs(z - s.z) > s.half) continue;
        const going = s.way === 'n' ? nx > x : nx < x;
        if (!going) continue;
        const before = s.way === 'n' ? x <= s.x && nx > s.x : x >= s.x && nx < s.x;
        if (before && signalState(s.phase, seconds + s.offset) !== 'green') return true;
      } else {
        if (Math.abs(x - s.x) > s.half) continue;
        const going = s.way === 'e' ? nz > z : nz < z;
        if (!going) continue;
        const before = s.way === 'e' ? z <= s.z && nz > s.z : z >= s.z && nz < s.z;
        if (before && signalState(s.phase, seconds + s.offset) !== 'green') return true;
      }
    }
  }
  return false;
}

// Signs: the names of the roads at their junctions, the city's welcome where it begins (at each of its three ways in
// from the town), and over the expressway's lanes the green gantries pointing to the game's places (what each says,
// where it stands, which way it faces).
const NAME_OF = new Map(OGANIRU_ROADS.map((r) => [r.id, r.name]));
export const OGANIRU_SIGNS = Object.freeze([
  { id: 'welcome', lines: ['WELCOME TO', 'OGANIRU CITY'], x: -9, z: -512, facing: 0, width: 6, height: 2.6, palette: ['#ffffff', '#0f5132', '#f2c200'] },
  { id: 'welcome-kwale', lines: ['WELCOME TO', 'OGANIRU CITY'], x: -1215, z: KWALE_Z + 10.5, facing: Math.PI / 2, width: 6, height: 2.6, palette: ['#ffffff', '#0f5132', '#f2c200'] },
  { id: 'welcome-campus', lines: ['WELCOME TO', 'OGANIRU CITY'], x: 272, z: CAMPUS_Z - 13, facing: -Math.PI / 2, width: 6, height: 2.6, palette: ['#ffffff', '#0f5132', '#f2c200'] },
  ...OGANIRU_ROUNDABOUTS.map((r) => ({ id: `${r.id}-name`, lines: [r.name.toUpperCase()], x: r.x + RING.outer + RING.walk + 3, z: r.z + 12, facing: Math.PI / 2, width: 4.8, height: 0.9, palette: ['#ffffff', '#0f5132'] })),
  // at each junction, on its north-east corner, the names of the two roads
  ...OGANIRU_JUNCTIONS.filter((j) => j.roads.length >= 2).map((j) => {
    const names = [...new Set(j.roads.map((id) => NAME_OF.get(id)))];
    return { id: `name-${j.id}`, lines: names.slice(0, 2).map((n) => n.toUpperCase()), x: j.x + j.hx + 2.2, z: j.z + j.hz + 3.4, facing: 0, width: 3.4, height: 1.1, palette: ['#ffffff', '#0f5132'] };
  }),
  // the gantries over the expressway (green, white letters, as on any expressway)
  { id: 'gantry-nb', lines: ['UNITY AVENUE  ↗', 'Asaba town centre · Motor park · Market'], x: -300, z: EXPRESSWAY_Z + 7.5, facing: -Math.PI / 2, width: 13, height: 3.2, palette: ['#ffffff', '#0b5d32'], gantry: 'viaduct', across: VIADUCT_HALF * 2 },
  { id: 'gantry-sb', lines: ['UNITY AVENUE  ↖', 'Oganiru Central · Towers'], x: 300, z: EXPRESSWAY_Z - 7.5, facing: Math.PI / 2, width: 13, height: 3.2, palette: ['#ffffff', '#0b5d32'], gantry: 'viaduct', across: VIADUCT_HALF * 2 },
  { id: 'gantry-nb-peace', lines: ['PEACE AVENUE  ↗', 'Campus Link · Anwuli Gardens · Habitation'], x: PEACE_X - 330, z: EXPRESSWAY_Z + 7.5, facing: -Math.PI / 2, width: 13, height: 3.2, palette: ['#ffffff', '#0b5d32'], gantry: 'viaduct', across: VIADUCT_HALF * 2 },
  { id: 'gantry-nb-end', lines: ['ROAD WORKS AHEAD', 'All traffic: Peace Avenue exit'], x: PEACE_X - 60, z: EXPRESSWAY_Z + 7.5, facing: -Math.PI / 2, width: 13, height: 3.2, palette: ['#ffffff', '#b8860b'], gantry: 'viaduct', across: VIADUCT_HALF * 2 },
  { id: 'gantry-sb-harmony', lines: ['HARMONY AVENUE  ↙  ↘', 'Airport · Kwale · Warri  |  Ihuoma Park'], x: -900, z: EXPRESSWAY_Z - 7.5, facing: Math.PI / 2, width: 13, height: 3.2, palette: ['#ffffff', '#0b5d32'], gantry: 'ground', across: VIADUCT_HALF * 2 },
].map(Object.freeze));

// Labels for the map.
export const OGANIRU_MAP_LABELS = Object.freeze([
  ['Oganiru City', -60, -760, 'center'], ['Unity Interchange', -150, -1130, 'center'], ['Oganiru Expressway', 380, -1130, 'vertical'],
  ['Harmony Interchange', -1290, -1200, 'center'], ['Peace Interchange', PEACE_X, -1200, 'center'],
  ['Anwuli Gardens', 600, -450, 'center'], ['Ihuoma Park', -900, -620, 'center'], ['Ugwuoma Heights', -400, -1400, 'center'],
]);

// ------------------------------------------------------------------------- the town's cars on the city's roads --
// The roads the town's cars drive in the city (traffic.js keeps the town's own the same way): each a road along x or
// along z (`axis`, its middle `c`, from `a0` to `a1`), how wide (`w`), where its cars keep (`lane`: from its middle, on
// the right; `laneAt(along)` where that changes: a flyover-road opening out beside its flyover, an approach opening out
// to its roundabout), where its middle strip begins (`inner`: how near its middle a car may go, going round something
// in its way), where cars stand at the roadside (`kerb`, where `stops`, but for `noStops`), how fast they go (`cruise`,
// m/s), one way only (`oneway`: +1, along it only) and how high it runs (`level(along)`; none: on the ground, 0). Or a
// line of points (`axis` 'path': `pts`, each with its height `y`): the interchanges' slip roads, loops and flyovers and
// the roundabouts' rings, one way, from the road it leaves (`from`: { road, along, dir }, `dir` the way along that road
// the traffic it takes is going, 0 where it leaves square at a junction, either way) to the road it joins (`to`, the
// same). A ring's stretch runs from where one road comes in to where the next goes out: its ends are those roads' ends.
// Not the stubs closed at their roadblocks, nor the expressway beyond the Peace Interchange to its road works, nor its
// slip roads there: nobody drives there but the players.
const TRAFFIC_SPEED = Object.freeze({ expressway: 22, avenue: 14, street: 11, ramp: 12, ring: 9, link: 13 });
// (lanes: an avenue's inner lane, beside its middle strip, so that a car standing at the kerb is out of the way; a
// street's and a link's middle of its own half; on a flyover its inner lane; on the expressway its middle lane)
const TRAFFIC_LANE = Object.freeze({ avenue: 4.25, street: 2.0, link: 2.2, deck: 4.25, expressway: 8.5, kerb: 8.6, streetKerb: 5.6, ring: 19.5 });
export const OGANIRU_TRAFFIC = (() => {
  const roads = [];
  const ground = (id, from, to, o = {}) => {
    const r = ROAD_BY_ID.get(id);
    const base = r.kind === 'street' ? { lane: TRAFFIC_LANE.street, inner: 0, kerb: TRAFFIC_LANE.streetKerb, cruise: TRAFFIC_SPEED.street, stops: true }
      : r.kind === 'link' ? { lane: TRAFFIC_LANE.link, inner: 0, kerb: r.half - 1.4, cruise: TRAFFIC_SPEED.link, stops: false }
        : r.kind === 'flyover-road' ? { lane: TRAFFIC_LANE.avenue, laneAt: (a) => Math.max(roadWidthAt(r, a).median / 2, 2.5) + 1.75, inner: 2.5, kerb: r.half - 1.4, cruise: TRAFFIC_SPEED.avenue, stops: false }
          : r.kind === 'approach' ? { lane: TRAFFIC_LANE.avenue, laneAt: (a) => Math.max(o.least || 2.2, roadWidthAt(r, a).median / 2 + 1.75), inner: 2.5, kerb: r.half - 1.4, cruise: TRAFFIC_SPEED.link, stops: false }
            : { lane: TRAFFIC_LANE.avenue, inner: r.median > 0 ? r.median / 2 : 0, kerb: TRAFFIC_LANE.kerb, cruise: TRAFFIC_SPEED.avenue, stops: true };
    roads.push({ id, axis: r.along, c: r.c, a0: from === undefined ? r.from : from, a1: to === undefined ? r.to : to, w: 2 * r.half, ...base, oneway: 0, level: null, ...o });
  };
  // the avenues, boulevards and streets on the ground (College Road on, from the town's end of it; Campus Road on; the
  // Kwale road on to the Southgate Roundabout)
  ground('unity-gate', undefined, -470, { least: 2.2 });
  for (const id of ['unity', 'gateway-s', 'gateway-n', 'independence-1', 'independence-2', 'independence-3', 'sunrise-s', 'sunrise-n', 'harmony-1', 'harmony-r2', 'peace-1', 'peace-2', 'hope-1', 'campus-link', 'kwale-on', 'exchange', 'commerce', 'council', 'charter', 'union-s', 'union-n', 'tower-s', 'tower-n']) ground(id);
  ground('campus-gate', undefined, undefined, { least: 2.0 });
  ground('harmony-2', SUNRISE_Z, undefined);
  // Hope Avenue from Sunrise Boulevard to its flyover, over the expressway on its bridge (at the street's level; nobody
  // stands on the bridge)
  roads.push({ id: 'hope-south', axis: 'z', c: HOPE_X, a0: SUNRISE_Z + 10, a1: INDEPENDENCE_Z - FLY.hope[0] - 35, w: 20, lane: TRAFFIC_LANE.avenue, inner: 2.5, kerb: TRAFFIC_LANE.kerb, cruise: TRAFFIC_SPEED.avenue, stops: true, noStops: [[-1175, -1085]], oneway: 0, level: null });
  // the flyover-roads beside the junction flyovers (for the traffic turning at the junction under them), and the
  // flyovers themselves for the traffic going on over it, from where the avenue opens out to where it closes again
  for (const id of ['independence-s', 'independence-n', 'peace-fe', 'peace-fw', 'harmony-fe', 'harmony-fw', 'hope-fe', 'hope-fw']) ground(id);
  for (const d of OGANIRU_DECKS.filter((q) => q.kind === 'flyover' && q.barrier)) {
    const p0 = d.path[0], pn = d.path[d.path.length - 1], alongX = Math.abs(p0.z - pn.z) < 1;
    const c = alongX ? p0.z : p0.x, s0 = alongX ? Math.min(p0.x, pn.x) : Math.min(p0.z, pn.z), s1 = alongX ? Math.max(p0.x, pn.x) : Math.max(p0.z, pn.z);
    const sides = OGANIRU_ROADS.filter((r) => r.kind === 'flyover-road' && r.along === (alongX ? 'x' : 'z') && Math.abs(r.c - c) < 1 && r.to > s0 - 60 && r.from < s1 + 60);
    const forward = alongX ? p0.x < pn.x : p0.z < pn.z;
    const at = (a) => {
      const s = forward ? a - s0 : s1 - a;
      if (s <= 0 || s >= d.len) return 0;
      let lo = 0, hi = d.path.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (d.path[m].s <= s) lo = m; else hi = m; }
      const p = d.path[lo], q = d.path[hi];
      return p.y + (q.y - p.y) * clamp((s - p.s) / Math.max(1e-6, q.s - p.s), 0, 1);
    };
    roads.push({ id: d.id, axis: alongX ? 'x' : 'z', c, a0: Math.min(...sides.map((r) => r.from)), a1: Math.max(...sides.map((r) => r.to)), w: 16, lane: TRAFFIC_LANE.deck, inner: 0.5, kerb: 6, cruise: TRAFFIC_SPEED.avenue, stops: false, oneway: 0, level: at, deck: d.id });
  }
  // the expressway, from where the Harmony Interchange's south-bound slip roads leave it, down through its cutting and up
  // onto its viaduct, to the Peace Interchange's last slip road; and its north-bound carriageway alone south of that
  // (from the Harmony Interchange's right turn onto it), one way
  roads.push({ id: 'expressway', axis: 'x', c: EXPRESSWAY_Z, a0: -1040, a1: PEACE_X - 160, w: 30, lane: TRAFFIC_LANE.expressway, inner: 3.25, kerb: 13, cruise: TRAFFIC_SPEED.expressway, stops: false, oneway: 0, level: (x) => expresswayY(x) });
  roads.push({ id: 'expressway-nb', axis: 'x', c: EXPRESSWAY_Z, a0: -1200, a1: -1040, w: 30, lane: TRAFFIC_LANE.expressway, inner: 0.5, kerb: 13, cruise: TRAFFIC_SPEED.expressway, stops: false, oneway: 1, level: null });
  const axisRoads = roads.slice();
  const path = (id, pts, o = {}) => { roads.push({ id, axis: 'path', pts, a0: 0, a1: pts[pts.length - 1].s, w: 8, lane: 0, inner: 0, kerb: 0, cruise: TRAFFIC_SPEED.ramp, stops: false, oneway: 1, level: null, ...o }); return roads[roads.length - 1]; };
  // where a slip road's end meets a road: the nearest road whose lane its end is beside, at its height; and which way
  // along that road the traffic it leaves or joins is going (0: it meets it square, at a junction)
  const levelOf = (r, a) => (r.level ? r.level(clamp(a, r.a0, r.a1)) : 0);
  const attach = (p) => {
    let best = null;
    for (const r of axisRoads) {
      const a = r.axis === 'x' ? p.x : p.z, off = (r.axis === 'x' ? p.z : p.x) - r.c;
      if (a < r.a0 - 2 || a > r.a1 + 2 || Math.abs(off) > r.w / 2 + 6) continue;
      if (Math.abs(levelOf(r, a) - p.y) > 1.2) continue;
      const along = r.axis === 'x' ? p.ux : p.uz, dir = Math.abs(along) > 0.7 ? Math.sign(along) : 0;
      // (beside a one-way road: on the side it is driven on)
      const side = r.axis === 'x' ? Math.sign(off) : -Math.sign(off);
      if (r.oneway && side !== r.oneway) continue;
      const d = Math.abs(Math.abs(off) - (r.laneAt ? r.laneAt(clamp(a, r.a0, r.a1)) : r.lane));
      if (!best || d < best.d) best = { road: r.id, along: clamp(a, r.a0, r.a1), dir, d };
    }
    return best ? { road: best.road, along: best.along, dir: best.dir } : null;
  };
  // the slip roads, loops and flyovers, from their decks (their heights as the decks have them)
  for (const d of OGANIRU_DECKS) {
    if (!/^(u-|h-|p-nb-off$|p-sb-on$)/.test(d.id)) continue;
    const pts = d.path.map((q) => Object.freeze({ x: q.x, z: q.z, y: q.y, s: q.s, ux: q.ux, uz: q.uz }));
    const r = path(d.id, pts, { w: 2 * d.half, deck: d.id });
    r.from = attach(pts[0]);
    r.to = attach(pts[pts.length - 1]);
  }
  // the roundabouts' rings, one way round (anticlockwise as the map is drawn, north up: in to the right, out to the
  // right), a stretch from each road's way in to the next road's way out
  for (const rb of OGANIRU_ROUNDABOUTS) {
    const legs = [];
    for (const leg of rb.legs) {
      const ns = leg.dir === 'n' || leg.dir === 's', far = leg.dir === 'n' || leg.dir === 'e';
      const edge = (ns ? rb.x : rb.z) + (far ? RING_EDGE : -RING_EDGE);
      const road = axisRoads.find((r) => r.axis === (ns ? 'x' : 'z') && Math.abs(r.c - (ns ? rb.z : rb.x)) < 1 && Math.abs((far ? r.a0 : r.a1) - edge) < 2);
      if (!road) continue;
      const base = leg.dir === 'e' ? 0 : leg.dir === 'n' ? 90 : leg.dir === 'w' ? 180 : 270;
      const lane = road.laneAt ? road.laneAt(edge) : road.lane;
      const off = (Math.asin(Math.min(0.9, lane / TRAFFIC_LANE.ring)) * 180) / Math.PI;
      legs.push({ base, off, road: road.id, along: edge });
    }
    legs.sort((p, q) => p.base - q.base);
    legs.forEach((p, k) => {
      const q = legs[(k + 1) % legs.length];
      const to = q.base - q.off + (k + 1 === legs.length ? 360 : 0);
      const pts = resample(arc(rb.x, rb.z, TRAFFIC_LANE.ring, p.base + p.off, to, 1.5), 1.5).map((o) => Object.freeze({ ...o, y: 0 }));
      path(`ring-${rb.id}-${p.road}`, pts, { cruise: TRAFFIC_SPEED.ring, w: 8, ring: rb.id, from: { road: p.road, along: p.along, dir: 0 }, to: { road: q.road, along: q.along, dir: 0 } });
    });
  }
  return Object.freeze(roads.map((r) => Object.freeze(r)));
})();
