// Oganiru City: the new city with flyovers on the free land west of the town (the owner's brief of 31 October 2026,
// claude/brief-flyovers-city.md; the plan he said yes to the same evening, claude/plan-city-flyovers.md).
//
// Stage 1, the sample: Unity Avenue carried on from College Road's west end, through the Gate Roundabout and
// Oganiru Central, to the Unity Interchange on the Oganiru Expressway; the Independence Flyover, where Independence
// Boulevard goes over Unity Avenue; the interchange itself, the expressway raised on pillars over the avenue, two loops,
// four slip roads and a flyover about 15 m up; and six towers round the avenue's crossing with the boulevard. What is
// not built yet (the rest of the boulevards, the expressway beyond the interchange) is closed by roadblocks, and the
// edge of the built land is fenced, as in the town.
//
// Content, like atani.js: the simulation and the drawing read it through ../zone.js. Nothing in the town moves for it:
// the town's roads, its people and vehicles, the river, the airport, the showrooms, the sports mall and the habitation
// are where they were; College Road is joined, not changed (its closure is opened: closures.js).
//
// Levels (the brief: "a vehicle or a person always stays on the level it is on, never popping up or dropping
// through"). A deck (a flyover, the raised expressway, a ramp, a loop) is a surface above the ground: something at a
// height stands on the highest surface under it that is no more than a step above it (`oganiruSurfaceY`), so that a
// car under the flyover stays on the road while one on the flyover stays on it, and a ramp is climbed a step at a time
// from where it meets the road. On a deck one can go only where the deck is, inside its walls; where a deck is too low
// to pass under it is an embankment, solid from the ground; where it is high it stands on pillars, and only they are in
// the way under it.
//
// Grid metres, as the town's: +x is true north, +z true east; the free land is west (-z). One grid metre is a metre.

const KERB = 0.15;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const box = (x0, z0, x1, z1, extra = {}) => Object.freeze({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), ...extra });
const inBox = (b, x, z, pad = 0) => x >= b.x0 - pad && x <= b.x1 + pad && z >= b.z0 - pad && z <= b.z1 + pad;

// ---------------------------------------------------------------------------------------------- the city --
export const OGANIRU = Object.freeze({
  name: 'Oganiru City',
  stage: 1,
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
  // where the city's land is, for anything that only needs to know whether to look further
  bounds: box(-600, -1560, 680, -470),
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

// ---------------------------------------------------------------------------------- the ground roads --
// The roads on the ground, all straight in this stage: each runs along x or along z at `c`, from `from` to `to`.
// `half`: from its middle to the outer kerb; `median`: the raised strip in the middle (0 for none); `walk`: the
// walkways beyond the kerbs (0 for none); `trees`: a row of slim trees down the middle strip; `lamps`: the tall
// double-armed lamps down it.
const groundRoad = (id, name, along, c, from, to, o = {}) => Object.freeze({ id, name, along, c, from: Math.min(from, to), to: Math.max(from, to), half: 10, median: OGANIRU.median, walk: OGANIRU.walk, trees: false, lamps: false, kind: 'avenue', ...o });
const U = 0;                       // Unity Avenue's middle (x)
const GATE = Object.freeze({ x: 0, z: -560, island: 13, outer: 22, walk: 3.5 });       // the Gate Roundabout
const UNION_Z = -670, INDEPENDENCE_Z = -780, TOWER_Z = -880;
export const EXPRESSWAY_Z = -1130;
// where Unity Avenue's walkways stop: beyond, the slip roads and loops of the interchange join it
const UNITY_WALKS_TO = -950;
export const OGANIRU_ROADS = Object.freeze([
  // College Road carried on: as wide as it is at the town's edge, then opening out to the roundabout
  groundRoad('unity-gate', 'Unity Avenue', 'z', U, -478.6, -GATE.outer + GATE.z + 0.5, { half: 5, median: 0, walk: 0, kind: 'approach', flare: { from: -505, to: GATE.z + GATE.outer, half: 10, median: 5 } }),
  groundRoad('unity', 'Unity Avenue', 'z', U, GATE.z - GATE.outer - 0.5, -1520, { trees: true, lamps: true, walkTo: UNITY_WALKS_TO }),
  // Gateway Boulevard: only its first metres either side of the roundabout in this stage
  groundRoad('gateway-n', 'Gateway Boulevard', 'x', GATE.z, GATE.outer + 0.5, 78, { walk: 3.5 }),
  groundRoad('gateway-s', 'Gateway Boulevard', 'x', GATE.z, -GATE.outer - 0.5, -78, { walk: 3.5 }),
  // the downtown streets across Unity Avenue: two lanes each way, no middle strip, wide pavements
  groundRoad('union-n', 'Union Street', 'x', UNION_Z, 10, 58, { half: 7, median: 0, walk: 4, kind: 'street' }),
  groundRoad('union-s', 'Union Street', 'x', UNION_Z, -10, -58, { half: 7, median: 0, walk: 4, kind: 'street' }),
  groundRoad('tower-n', 'Tower Street', 'x', TOWER_Z, 10, 58, { half: 7, median: 0, walk: 4, kind: 'street' }),
  groundRoad('tower-s', 'Tower Street', 'x', TOWER_Z, -10, -58, { half: 7, median: 0, walk: 4, kind: 'street' }),
  // Independence Boulevard where its flyover crosses Unity Avenue: the flyover in the middle (a deck, below), a road on
  // the ground either side of it for the traffic turning at the lights under it, and the boulevard whole beyond the
  // flyover's ends to the roadblocks
  groundRoad('independence-n', 'Independence Boulevard', 'x', INDEPENDENCE_Z, 13.5, 213, { half: 16, median: 16, walk: 3.5, kind: 'flyover-road' }),
  groundRoad('independence-s', 'Independence Boulevard', 'x', INDEPENDENCE_Z, -13.5, -213, { half: 16, median: 16, walk: 3.5, kind: 'flyover-road' }),
]);

// ----------------------------------------------------------------------------------------- the decks --
// Each deck: its middle line (points every 2 m with the height of its road surface there), its width wall to wall,
// its walls (which sides, from where to where along it: none where another deck joins it, and none where it is too low
// to need one), a concrete barrier down its middle (the expressway, the flyover), and its ends closed or open.
const D = OGANIRU.deck;
function deck(id, name, kind, pts, { width = 8, heights, step = 2, barrier = 0, closed = [], bank = 0.035, walls = null, joins = [] }) {
  const path = resample(pts, step);
  const len = path[path.length - 1].s;
  const hAt = typeof heights === 'function' ? heights : profile(heights.map(([f, h]) => [f < 0 ? len + f : f, h]));
  // the bend at each point (+ to the left), for the road's tilt into it
  for (let i = 0; i < path.length; i += 1) {
    const p = path[i];
    p.y = hAt(p.s);
    const a = path[Math.max(0, i - 3)], b = path[Math.min(path.length - 1, i + 3)];
    const turn = (a.ux * b.uz - a.uz * b.ux);
    p.bank = clamp(turn * 3, -1, 1) * bank;
  }
  const half = width / 2;
  return { id, name, kind, path, len, half, inner: half - D.wallWidth, barrier, closed, walls: walls || { left: [[0, len]], right: [[0, len]] }, joins };
}
// (a helper for where a wall stands: along the whole deck but where it is too low, or where something joins it)
const without = (len, gaps) => {
  const out = [];
  let from = 0;
  for (const [a, b] of [...gaps].sort((p, q) => p[0] - q[0])) { if (a > from) out.push([from, a]); from = Math.max(from, b); }
  if (from < len) out.push([from, len]);
  return out;
};

const L1 = D.level, L2 = D.upper;
const NB = EXPRESSWAY_Z + 12, SB = EXPRESSWAY_Z - 12;       // the middle of each carriageway's outer lane
// (the expressway's raised part in this stage: from 560 m south of Unity Avenue to 640 m north of it, closed at both ends)
const VIADUCT_HALF = 15, VIADUCT_SOUTH = -560, VIADUCT_NORTH = 640;
// The ramps of the Unity Interchange. Each is drawn from the end it is driven from, so that its left and right are the
// driver's. (+x north, +z east; the expressway's north-bound carriageway is its east half, the south-bound its west;
// Unity Avenue's east-bound carriageway is its south half, the west-bound its north.)
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
};
// how far along each its walls begin and end: where it is high enough off the road to need them
const RAMP = { width: 8, flyWidth: 9 };
function rampDeck(id, name, pts, knots, o = {}) { return deck(id, name, o.kind || 'ramp', pts, { width: o.width || RAMP.width, heights: knots, ...o }); }
function buildDecks() {
  const out = [];
  // the expressway raised on pillars through the interchange, closed at both ends in this stage
  out.push(deck('viaduct', 'Oganiru Expressway', 'expressway', [[VIADUCT_SOUTH, EXPRESSWAY_Z], [VIADUCT_NORTH, EXPRESSWAY_Z]], { width: VIADUCT_HALF * 2, heights: () => L1, step: 4, barrier: 0.5, closed: ['start', 'end'], bank: 0 }));
  // Independence Boulevard over Unity Avenue: up from the ground 180 m out, level over the avenue
  const fly = 180, top = 25;
  out.push(deck('independence-flyover', 'Independence Boulevard', 'flyover', [[-fly, INDEPENDENCE_Z], [fly, INDEPENDENCE_Z]], { width: 16, heights: [[0, 0], [fly - top, L1], [fly + top, L1], [2 * fly, 0]], step: 2, barrier: 0.35, bank: 0 }));
  // the ramps: from the avenue's level (0) or the expressway's (7.5) to the other
  const down = (len) => [[0, L1], [len, 0]], up = (len) => [[0, 0], [len, L1]];
  const r = (id, name, pts, upward, o = {}) => { const path = resample(pts, 2), len = path[path.length - 1].s; return rampDeck(id, name, pts, upward ? up(len) : down(len), o); };
  out.push(r('u-loop-ne', 'Unity Interchange (north-bound to Unity Avenue west)', RAMP_PATHS['u-loop-ne'], false));
  out.push(r('u-loop-sw', 'Unity Interchange (south-bound to Unity Avenue east)', RAMP_PATHS['u-loop-sw'], false));
  out.push(r('u-loop-nw', 'Unity Interchange (Unity Avenue west to south-bound)', RAMP_PATHS['u-loop-nw'], true));
  out.push(r('u-se', 'Unity Interchange (north-bound to Unity Avenue east)', RAMP_PATHS['u-se'], false));
  out.push(r('u-ne', 'Unity Interchange (Unity Avenue west to north-bound)', RAMP_PATHS['u-ne'], true));
  out.push(r('u-nw', 'Unity Interchange (south-bound to Unity Avenue west)', RAMP_PATHS['u-nw'], false));
  out.push(r('u-sw', 'Unity Interchange (Unity Avenue east to south-bound)', RAMP_PATHS['u-sw'], true));
  // the flyover: up from the avenue to cross it at 8.2 m, over the loop below at 13, over the expressway at 15.4,
  // and down onto it at 7.5
  {
    const pts = RAMP_PATHS['u-fly'];
    const path = resample(pts, 2);
    const near = (x, z) => path.reduce((best, p) => (Math.hypot(p.x - x, p.z - z) < Math.hypot(best.x - x, best.z - z) ? p : best), path[0]).s;
    const sUnity = near(0, -1320), sLoop = near(150, -1210), sOver = near(248, EXPRESSWAY_Z), sClear = near(318, -1101), sDown = near(492, -1107), len = path[path.length - 1].s;
    out.push(rampDeck('u-fly', 'Unity Interchange flyover (Unity Avenue east to north-bound)', pts, [[0, 0], [sUnity, 8.0], [sLoop, 13.2], [sOver, L2], [sClear, L2], [sDown, L1], [len, L1]], { kind: 'flyover', width: RAMP.flyWidth }));
  }
  // walls: where each is more than a kerb above the ground under it, and not where it joins the expressway
  for (const d of out) {
    if (d.id === 'viaduct' || d.id === 'independence-flyover') continue;
    const p = d.path, len = d.len;
    const low = p.filter((q) => q.y < 0.35).map((q) => q.s);
    const lowEnd = low.length ? (p[0].y < 0.35 ? Math.max(...low.filter((s) => s < len / 2), 0) : null) : null;
    const lowStart = low.length ? (p[p.length - 1].y < 0.35 ? Math.min(...low.filter((s) => s > len / 2), len) : null) : null;
    const gaps = [];
    if (lowEnd !== null) gaps.push([0, lowEnd]);
    if (lowStart !== null) gaps.push([lowStart, len]);
    // (the end that meets the expressway: 40 m open on the side toward it, where the lanes run together)
    const atViaduct = (q) => Math.abs(q.z - EXPRESSWAY_Z) < VIADUCT_HALF + 1 && q.x > VIADUCT_SOUTH && q.x < VIADUCT_NORTH && Math.abs(q.y - L1) < 0.6;
    const meets = p.filter(atViaduct).map((q) => q.s);
    let left = without(len, gaps), right = without(len, gaps);
    if (meets.length) {
      const s0 = Math.min(...meets), s1 = Math.max(...meets);
      const q = p.find((k) => k.s >= (s0 + s1) / 2) || p[0];
      // the side of the ramp facing the expressway's middle: its left if the expressway lies to its left
      const toMiddle = { x: 0, z: EXPRESSWAY_Z - q.z };
      const leftNormal = { x: q.uz, z: -q.ux };
      const faceLeft = leftNormal.z * toMiddle.z > 0;
      const open = [Math.max(0, s0 - 30), Math.min(len, s1 + 30)];
      if (faceLeft) left = without(len, [...gaps, open]); else right = without(len, [...gaps, open]);
    }
    d.walls = { left, right };
  }
  // the expressway's own walls: open where each ramp meets it (on the side the ramp is), the length of its lanes running together
  const v = out[0];
  const gaps = { left: [], right: [] };
  for (const d of out.slice(2)) {
    const meets = d.path.filter((q) => Math.abs(q.z - EXPRESSWAY_Z) < VIADUCT_HALF + 1 && q.x > VIADUCT_SOUTH && q.x < VIADUCT_NORTH && Math.abs(q.y - L1) < 0.6);
    if (!meets.length) continue;
    const xs = meets.map((q) => q.x);
    const a = Math.min(...xs) - VIADUCT_SOUTH - 24, b = Math.max(...xs) - VIADUCT_SOUTH + 24;
    // (the viaduct runs north (+x): its left is the west (-z) side)
    (meets[0].z < EXPRESSWAY_Z ? gaps.left : gaps.right).push([a, b]);
  }
  v.walls = { left: without(v.len, gaps.left), right: without(v.len, gaps.right) };
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
    // past either end of the deck's first or last piece is off it
    const s = a.s + (b.s - a.s) * t;
    const ux = ex / Math.sqrt(l2), uz = ez / Math.sqrt(l2);
    if ((t === 0 && list[k + 1] === 0 && (x - a.x) * ux + (z - a.z) * uz < -0.01) || (t === 1 && list[k + 1] === d.path.length - 2 && (x - b.x) * ux + (z - b.z) * uz > 0.01)) continue;
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

// --------------------------------------------------------------------------------------- the ground --
// Raised 15 cm behind a kerb: the middle strips, the walkways, the roundabout's island and its walkway, the plazas.
const KERBED = [];
function addKerbed(b) { KERBED.push(box(b.x0, b.z0, b.x1, b.z1, b.extra || {})); }
for (const r of OGANIRU_ROADS) {
  const span = (c0, c1, a0, a1) => (r.along === 'z' ? { x0: c0, x1: c1, z0: a0, z1: a1 } : { x0: a0, x1: a1, z0: c0, z1: c1 });
  if (r.median > 0 && r.kind !== 'flyover-road') addKerbed({ ...span(r.c - r.median / 2, r.c + r.median / 2, r.from, r.to), extra: { median: r.id } });
  if (r.walk > 0) {
    const to = r.walkTo !== undefined ? Math.max(r.from, r.walkTo) : r.from;
    if (to < r.to) for (const k of [-1, 1]) addKerbed({ ...span(r.c + k * r.half, r.c + k * (r.half + r.walk), to, r.to), extra: { walk: r.id } });
  }
}
// the approach from College Road: walkways from where it opens out, and the strip in its middle growing to the roundabout
// (the strip is a triangle, which the kerbed boxes approximate in steps)
for (let z = -505; z > GATE.z + GATE.outer; z -= 4) {
  const t = clamp((-505 - z) / (-505 - (GATE.z + GATE.outer)), 0, 1);
  const half = 5 + 5 * t, m = 5 * t;
  if (m > 0.6) addKerbed({ x0: -m / 2, x1: m / 2, z0: z - 4, z1: z, extra: { median: 'unity-gate' } });
  for (const k of [-1, 1]) addKerbed({ x0: k > 0 ? half : -half - OGANIRU.walk, x1: k > 0 ? half + OGANIRU.walk : -half, z0: z - 4, z1: z, extra: { walk: 'unity-gate' } });
}
// the plazas in front of the towers (filled in below, once the towers are placed)
export const OGANIRU_KERBED = KERBED;

// The middle strip's openings along Unity Avenue: at each junction across it (none in the strip there), and two U-turn
// gaps, where the kerb is lowered and a car may turn back.
export const OGANIRU_MEDIAN_GAPS = Object.freeze([
  Object.freeze({ road: 'unity', from: UNION_Z - 9, to: UNION_Z + 9, why: 'junction' }),
  Object.freeze({ road: 'unity', from: INDEPENDENCE_Z - 22, to: INDEPENDENCE_Z + 22, why: 'junction' }),
  Object.freeze({ road: 'unity', from: TOWER_Z - 9, to: TOWER_Z + 9, why: 'junction' }),
  Object.freeze({ road: 'unity', from: -1000, to: -988, why: 'u-turn' }),
  Object.freeze({ road: 'unity', from: -1400, to: -1388, why: 'u-turn' }),
]);
const inMedianGap = (z) => OGANIRU_MEDIAN_GAPS.some((g) => z >= g.from && z <= g.to);

// The towers (Stage 1: the six at Unity Avenue and Independence Boulevard). Footprints in metres along x (`dx`) and z
// (`dz`); `storeys` of 3.6 m; what each is made of; the made-up names on their lobbies. Solid; nobody goes in yet.
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
// roundabout's island and walkway, the plazas), the land 0.
export function oganiruGroundY(x, z) {
  if (!inBox(OGANIRU.bounds, x, z)) return 0;
  const dg = Math.hypot(x - GATE.x, z - GATE.z);
  if (dg < GATE.outer + GATE.walk + 0.5) {
    if (dg <= GATE.island) return KERB;
    if (dg <= GATE.outer) return 0;
    // the walkway round it, but where a road comes in
    const ax = Math.abs(x - GATE.x), az = Math.abs(z - GATE.z);
    const mouth = (ax < 10.5 && dg > GATE.outer) || (az < 10.5 && dg > GATE.outer);
    return mouth ? 0 : KERB;
  }
  const list = KERB_CELLS.get(Math.floor(x / CELL) * 4096 + Math.floor(z / CELL));
  if (list) for (const b of list) if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) {
    if (b.median === 'unity' && inMedianGap(z)) continue;
    // (and the walkways open where a road crosses them, and where the Independence roads meet Unity Avenue)
    if (b.walk && crossingAt(x, z)) continue;
    return KERB;
  }
  return 0;
}
// where a road crosses a walkway (the side streets' mouths), the walkway is cut and the road goes through level
function crossingAt(x, z) {
  for (const r of OGANIRU_ROADS) {
    if (r.along !== 'x') continue;
    if (Math.abs(z - r.c) <= r.half && Math.abs(x) < 10 + OGANIRU.walk + 0.5) return true;
  }
  return false;
}

// --------------------------------------------------------------------------- where the land is open --
// The city's land that can be walked and driven in this stage (its edge is fenced, closures.js).
export const OGANIRU_AREAS = Object.freeze([
  box(-36, -1525, 36, -478.6),                   // Unity Avenue, its walkways and verges, from College Road to the roadblock
  box(-82, -585, 82, -535),                      // the Gate Roundabout and Gateway Boulevard's first metres
  box(-218, -905, 218, -650),                    // the six towers, Union and Tower Streets and Independence Boulevard
  box(-320, -1480, 320, -905),                   // the interchange's land, under and round its ramps
]);
export const onOganiru = (x, z) => inBox(OGANIRU.bounds, x, z) && OGANIRU_AREAS.some((a) => x > a.x0 && x < a.x1 && z > a.z0 && z < a.z1);
// How far a point is from the city's land (0 on it): the ground round it is flat near it, rising beyond (the drawing).
export const oganiruAway = (x, z) => { let best = Infinity; for (const a of OGANIRU_AREAS) best = Math.min(best, Math.hypot(Math.max(a.x0 - x, 0, x - a.x1), Math.max(a.z0 - z, 0, z - a.z1))); return best; };
// The lines along which its edge is fenced where the land ends (closures.js EDGE_LINES; each: from a to b, `out` the
// way off the land). The fence stands only where the land does end beyond it.
const IN = 1.4;
export const OGANIRU_EDGE_LINES = Object.freeze(OGANIRU_AREAS.flatMap((a, i) => [
  { id: `oganiru-${i}-n`, a: { x: a.x1 - IN, z: a.z0 + IN }, b: { x: a.x1 - IN, z: a.z1 - IN }, out: { x: 1, z: 0 } },
  { id: `oganiru-${i}-s`, a: { x: a.x0 + IN, z: a.z0 + IN }, b: { x: a.x0 + IN, z: a.z1 - IN }, out: { x: -1, z: 0 } },
  { id: `oganiru-${i}-w`, a: { x: a.x0 + IN, z: a.z0 + IN }, b: { x: a.x1 - IN, z: a.z0 + IN }, out: { x: 0, z: -1 } },
  { id: `oganiru-${i}-e`, a: { x: a.x0 + IN, z: a.z1 - IN }, b: { x: a.x1 - IN, z: a.z1 - IN }, out: { x: 0, z: 1 } },
]).map((l) => Object.freeze({ ...l, a: Object.freeze(l.a), b: Object.freeze(l.b), out: Object.freeze(l.out), style: 'tape' })));

// The roads not built on yet in this stage, closed across their whole width (closures.js draws and makes them solid).
export const OGANIRU_CLOSURES = Object.freeze([
  { id: 'unity-west', name: 'Unity Avenue, west end', a: { x: -14, z: -1518 }, b: { x: 14, z: -1518 }, facing: 0, sign: ['ROAD CLOSED', 'Road works ahead'], why: 'Oganiru City is still being built beyond this point.' },
  { id: 'gateway-north', name: 'Gateway Boulevard, north', a: { x: 76, z: -574 }, b: { x: 76, z: -546 }, facing: -Math.PI / 2, sign: ['ROAD CLOSED', 'Gateway Boulevard: coming soon'], why: 'Gateway Boulevard is not built on from here yet.' },
  { id: 'gateway-south', name: 'Gateway Boulevard, south', a: { x: -76, z: -574 }, b: { x: -76, z: -546 }, facing: Math.PI / 2, sign: ['ROAD CLOSED', 'Gateway Boulevard: coming soon'], why: 'Gateway Boulevard is not built on from here yet.' },
  { id: 'union-north', name: 'Union Street, north', a: { x: 56, z: UNION_Z - 11 }, b: { x: 56, z: UNION_Z + 11 }, facing: -Math.PI / 2, sign: ['ROAD CLOSED', 'Road works'], why: 'Union Street is not built on from here yet.' },
  { id: 'union-south', name: 'Union Street, south', a: { x: -56, z: UNION_Z - 11 }, b: { x: -56, z: UNION_Z + 11 }, facing: Math.PI / 2, sign: ['ROAD CLOSED', 'Road works'], why: 'Union Street is not built on from here yet.' },
  { id: 'tower-north', name: 'Tower Street, north', a: { x: 56, z: TOWER_Z - 11 }, b: { x: 56, z: TOWER_Z + 11 }, facing: -Math.PI / 2, sign: ['ROAD CLOSED', 'Road works'], why: 'Tower Street is not built on from here yet.' },
  { id: 'tower-south', name: 'Tower Street, south', a: { x: -56, z: TOWER_Z - 11 }, b: { x: -56, z: TOWER_Z + 11 }, facing: Math.PI / 2, sign: ['ROAD CLOSED', 'Road works'], why: 'Tower Street is not built on from here yet.' },
  { id: 'independence-north', name: 'Independence Boulevard, north', a: { x: 211, z: INDEPENDENCE_Z - 20 }, b: { x: 211, z: INDEPENDENCE_Z + 20 }, facing: -Math.PI / 2, sign: ['ROAD CLOSED', 'Independence Boulevard: coming soon'], why: 'Independence Boulevard is not built on from here yet.' },
  { id: 'independence-south', name: 'Independence Boulevard, south', a: { x: -211, z: INDEPENDENCE_Z - 20 }, b: { x: -211, z: INDEPENDENCE_Z + 20 }, facing: Math.PI / 2, sign: ['ROAD CLOSED', 'Independence Boulevard: coming soon'], why: 'Independence Boulevard is not built on from here yet.' },
].map((c) => Object.freeze({ ...c, state: 'under construction', a: Object.freeze(c.a), b: Object.freeze(c.b), sign: Object.freeze(c.sign) })));
// (what of the roadblocks and of the fence at the built land's edge is the city's: drawn with it, render-oganiru.js)
export const ofOganiru = (item, kind) => (kind === 'closure' ? OGANIRU_CLOSURES.includes(item) : String((item && item.line) || '').startsWith('oganiru-'));

// --------------------------------------------------------------------- trees, lamps, signals, pillars --
// The slim trees down Unity Avenue's middle strip: every 9 m, but where a lamp stands (every fourth place), at the
// openings in the strip, near the junctions, and under the decks. Each a copy of the habitation's slim tree (its owner's
// file unchanged), a little taller or shorter and turned its own way.
const hash = (i, k) => { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); };
const underDeck = (x, z, pad = 2) => oganiruDecksAt(x, z).some((h) => h.y - D.thick > 0.5) || [[-pad, 0], [pad, 0], [0, -pad], [0, pad]].some(([dx, dz]) => oganiruDecksAt(x + dx, z + dz).some((h) => h.y > 0.5));
export const OGANIRU_TREES = [];
export const OGANIRU_LAMPS = [];
{
  // (the middle strip's lamps' two arms reach across the avenue, over both carriageways: heading pi/2, along x)
  const ACROSS = Math.PI / 2;
  // at each junction across the avenue, a lamp on the end of the strip either side, so that the junction is lit at night
  const noses = OGANIRU_MEDIAN_GAPS.filter((g) => g.road === 'unity' && g.why === 'junction').flatMap((g) => [g.from - 2.5, g.to + 2.5]);
  for (const z of noses) OGANIRU_LAMPS.push({ kind: 'median', x: 0, z, y: KERB, heading: ACROSS });
  let slot = 0;
  for (let z = GATE.z - GATE.outer - 18; z > -1508; z -= 9, slot += 1) {
    if (inMedianGap(z) || OGANIRU_MEDIAN_GAPS.some((g) => z >= g.from - 6 && z <= g.to + 6)) continue;
    if (underDeck(0, z, 6) || noses.some((n) => Math.abs(n - z) < 5)) continue;
    // (a lamp every fourth place, but not within 14 m of a junction's; downtown, with its two banners)
    if (slot % 4 === 2 && !noses.some((n) => Math.abs(n - z) < 14)) { OGANIRU_LAMPS.push({ kind: 'median', x: 0, z, y: KERB, heading: ACROSS, banner: z > UNITY_WALKS_TO }); continue; }
    OGANIRU_TREES.push({ kind: 'slim', x: (hash(slot, 3) - 0.5) * 0.5, z: z + (hash(slot, 5) - 0.5) * 0.8, y: KERB, size: 0.9 + hash(slot, 7) * 0.22, turn: hash(slot, 9) * Math.PI * 2 });
  }
  // shade trees along the verges, where there are walkways and nothing else
  for (let z = -520; z > UNITY_WALKS_TO; z -= 17) {
    for (const k of [-1, 1]) {
      const x = k * 16.5;
      if (OGANIRU_TOWERS.some((t) => Math.abs(z - t.z) < t.dz / 2 + 10 && Math.sign(t.x) === k)) continue;
      if (OGANIRU_ROADS.some((r) => r.along === 'x' && Math.abs(z - r.c) < r.half + r.walk + 5)) continue;
      if (Math.hypot(x - GATE.x, z - GATE.z) < GATE.outer + 14) continue;
      if (underDeck(x, z, 4)) continue;
      const i = Math.round(-z) * 2 + (k > 0 ? 1 : 0);
      OGANIRU_TREES.push({ kind: hash(i, 2) < 0.6 ? 'mango' : 'almond', x: x + (hash(i, 4) - 0.5) * 1.2, z: z + (hash(i, 6) - 0.5) * 3, y: 0, size: 0.95 + hash(i, 8) * 0.3, turn: hash(i, 10) * 6.28 });
    }
  }
  // lamps round the roundabout, single-armed over its carriageway
  for (let k = 0; k < 8; k += 1) {
    const a = (k + 0.5) * (Math.PI / 4);
    const x = GATE.x + Math.sin(a) * (GATE.outer + 1.4), z = GATE.z + Math.cos(a) * (GATE.outer + 1.4);
    OGANIRU_LAMPS.push({ kind: 'edge', x, z, y: KERB, heading: Math.atan2(GATE.x - x, GATE.z - z) });
  }
  // along the side roads (Gateway's first metres, Independence beyond its flyover): single-armed at the edges
  for (const r of OGANIRU_ROADS.filter((q) => q.id.startsWith('gateway'))) {
    for (const k of [-1, 1]) OGANIRU_LAMPS.push({ kind: 'edge', x: (r.from + r.to) / 2 + 8 * Math.sign(r.from), z: r.c + k * (r.half + 0.8), y: KERB, heading: k > 0 ? Math.PI : 0 });
  }
  for (const xs of [-200, 200]) for (const k of [-1, 1]) OGANIRU_LAMPS.push({ kind: 'edge', x: xs, z: INDEPENDENCE_Z + k * (16 + 0.8), y: KERB, heading: k > 0 ? Math.PI : 0 });
  // the junction under the Independence Flyover, wider than the deck's own lamps light: one at each corner, its arm
  // reaching in over it
  for (const sx of [-1, 1]) for (const k of [-1, 1]) { const x = sx * 11, z = INDEPENDENCE_Z + k * 18; OGANIRU_LAMPS.push({ kind: 'edge', x, z, y: KERB, heading: Math.atan2(-x, INDEPENDENCE_Z - z) }); }
  // along College Road carried on, from the town's edge to the roundabout: single-armed, both sides
  for (const z of [-490, -511, -530]) {
    const t = clamp((-505 - z) / (-505 - (GATE.z + GATE.outer)), 0, 1), half = 5 + 5 * t;
    for (const k of [-1, 1]) { const x = k * (half + 1.0); OGANIRU_LAMPS.push({ kind: 'edge', x, z, y: oganiruGroundY(x, z), heading: k > 0 ? -Math.PI / 2 : Math.PI / 2 }); }
  }
  // the ornate black lamp posts with lanterns, on the downtown streets' pavements and in front of the towers
  for (const r of OGANIRU_ROADS.filter((q) => q.kind === 'street')) {
    for (const k of [-1, 1]) OGANIRU_LAMPS.push({ kind: 'ornate', x: (r.from + r.to) / 2 + 6 * Math.sign(r.from), z: r.c + k * (r.half + 1.2), y: KERB, heading: 0 });
  }
  for (const t of OGANIRU_TOWERS) {
    const front = t.x > 0 ? t.x - t.dx / 2 - 3 : t.x + t.dx / 2 + 3;
    for (const k of [-1, 1]) OGANIRU_LAMPS.push({ kind: 'ornate', x: front, z: t.z + k * (t.dz / 2 - 2), y: KERB, heading: 0 });
  }
  // along the decks' walls: single-armed, every 36 m, alternately each side on a ramp, both sides on the expressway and
  // the Independence Flyover; where the deck is above the ground (not on its first, low metres)
  for (const d of OGANIRU_DECKS) {
    const both = d.id === 'viaduct' || d.id === 'independence-flyover';
    let n = 0;
    for (let s = 18; s < d.len - 10; s += 36, n += 1) {
      const p = d.path.find((q) => q.s >= s) || d.path[d.path.length - 1];
      if (p.y < 2.5) continue;
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

// The traffic signals at the junctions across Unity Avenue: a pole at each corner, facing the traffic that stops there.
// Phase 0 is Unity Avenue's, 1 the street's (atani-city.js signalState: the same cycle as Market Road's).
export const OGANIRU_SIGNALS = Object.freeze([UNION_Z, TOWER_Z, INDEPENDENCE_Z].flatMap((zc) => {
  const half = zc === INDEPENDENCE_Z ? 24 : 7;
  return [
    { x: -12, z: zc + half + 2, heading: Math.PI, phase: 0 }, { x: 12, z: zc - half - 2, heading: 0, phase: 0 },
    { x: 12 + 1.5, z: zc + half + 2, heading: -Math.PI / 2, phase: 1 }, { x: -12 - 1.5, z: zc - half - 2, heading: Math.PI / 2, phase: 1 },
  ];
}).map(Object.freeze));

// Pillars: under each deck where it is high enough to pass under, round concrete columns with wide caps, every 30 m or
// so; the expressway on two columns a cap's width apart. Not on a road.
const onRoadHere = (x, z) => OGANIRU_ROADS.some((r) => (r.along === 'z' ? Math.abs(x - r.c) < r.half + (r.walk || 0) + 0.6 && z >= r.from && z <= r.to : Math.abs(z - r.c) < r.half + (r.walk || 0) + 0.6 && x >= r.from && x <= r.to && r.kind !== 'flyover-road')) || (Math.hypot(x - GATE.x, z - GATE.z) < GATE.outer + 1);
export const OGANIRU_PILLARS = [];
for (const d of OGANIRU_DECKS) {
  const two = d.id === 'viaduct';
  for (let s = 14; s < d.len - 6; s += two ? 30 : 28) {
    const p = d.path.find((q) => q.s >= s) || d.path[d.path.length - 1];
    if (p.y - D.thick - 0 < OGANIRU.under) continue;
    const offsets = two ? [-8, 8] : [0];
    for (const o of offsets) {
      const lx = -p.uz, lz = p.ux;
      let x = p.x + lx * o, z = p.z + lz * o;
      // (not on the avenue: nudged along the deck clear of it)
      if (onRoadHere(x, z)) { const alt = [6, -6, 12, -12].map((k) => ({ x: x + p.ux * k, z: z + p.uz * k })).find((q) => !onRoadHere(q.x, q.z)); if (!alt) continue; x = alt.x; z = alt.z; }
      // (nor in the way of a ramp under it)
      if (oganiruDecksAt(x, z).some((h) => h.deck !== d && h.y < p.y - 3 && h.y > 0.2)) continue;
      OGANIRU_PILLARS.push(Object.freeze({ x, z, r: two ? 0.85 : 0.7, top: p.y - D.thick, deck: d.id, heading: Math.atan2(p.ux, p.uz) }));
    }
  }
}
// the Independence Flyover's columns: on its middle line, either side of Unity Avenue and of the junction under it, and
// once more each side before its ramps come down to their embankments (as one would build it: the same each side)
OGANIRU_PILLARS.splice(0, OGANIRU_PILLARS.length, ...OGANIRU_PILLARS.filter((p) => p.deck !== 'independence-flyover'));
{
  const fly = OGANIRU_DECKS.find((d) => d.id === 'independence-flyover');
  for (const x of [-48, -20, 20, 48]) {
    const h = oganiruDecksAt(x, INDEPENDENCE_Z).find((q) => q.deck === fly);
    if (h && h.y - D.thick >= OGANIRU.under) OGANIRU_PILLARS.push(Object.freeze({ x, z: INDEPENDENCE_Z, r: 0.75, top: h.y - D.thick, deck: 'independence-flyover', heading: Math.PI / 2 }));
  }
}
Object.freeze(OGANIRU_PILLARS);

// --------------------------------------------------------------------------------- what is in the way --
// On the ground: the towers, the trees' trunks, the lamps' poles, the signals' poles, the pillars, and the decks where
// they are too low to go under (embankments). Each with how high it stands (`top`, absolute): something above it is
// not stopped by it (a car on the flyover by the pillar under it, nor by the embankment of the ramp it is on).
const circle = (x, z, r, top, extra = {}) => Object.freeze({ x, z, r, top, ...extra });
export const OGANIRU_SOLIDS = Object.freeze([
  ...OGANIRU_TREES.map((t) => circle(t.x, t.z, t.kind === 'slim' ? 0.3 : 0.42, 12, { tree: true })),
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

// Is something of `radius` at (x, z), standing at height `y` (its feet), in the way of anything of the city's on the
// ground or under a deck? (On a deck, the deck's own rule: oganiruOnDeck.) `above`: how high above the feet the thing
// that would be stopped reaches (a person's or a car's height): what is wholly under the feet is not in the way.
export function oganiruBlocked(x, z, radius = 0.4, y = 0) {
  if (!inBox(OGANIRU.bounds, x, z, radius + 2)) return false;
  for (const t of TOWER_SOLIDS) {
    if (y >= t.top) continue;
    if (t.round ? Math.hypot(x - t.x, z - t.z) < t.r + radius : (x > t.x0 - radius && x < t.x1 + radius && z > t.z0 - radius && z < t.z1 + radius)) return true;
  }
  const list = SOLID_CELLS.get(Math.floor(x / CELL) * 4096 + Math.floor(z / CELL));
  if (list) for (const c of list) if (y < c.top - 0.05 && Math.hypot(x - c.x, z - c.z) < c.r + radius) return true;
  // an embankment: a deck too low to pass under, solid from the ground up to its road
  for (const h of oganiruDecksAt(x, z)) {
    if (h.y <= 0.32) continue;
    if (y >= h.y - 0.3) continue;              // on it (or above it): not in the way
    if (h.y - D.thick - y < OGANIRU.under) {
      // (within its width: its retaining walls are its edges)
      if (h.off <= h.deck.half + radius) return true;
    }
  }
  // the decks' sides and pillars are found above; nothing else of the city's stands in the way on the ground
  // (and the edge of a deck being driven up from the ground: its low end is open)
  for (const h of decksNear(x, z, radius)) if (h.y > 0.32 && y < h.y - 0.3 && h.y - D.thick - y < OGANIRU.under) return true;
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
    if (d.closed.includes('start') && h.s < 1.5 + radius) continue;
    if (d.closed.includes('end') && h.s > d.len - 1.5 - radius) continue;
    return true;
  }
  return false;
}

// Is the road here tarred (for how fast a vehicle goes on it)? The city's roads and every deck.
export function oganiruTar(x, z) {
  if (!inBox(OGANIRU.bounds, x, z)) return false;
  if (Math.hypot(x - GATE.x, z - GATE.z) < GATE.outer && Math.hypot(x - GATE.x, z - GATE.z) > GATE.island) return true;
  for (const r of OGANIRU_ROADS) {
    const half = r.kind === 'approach' ? 10 : r.half;
    if (r.along === 'z' ? Math.abs(x - r.c) <= half && z >= r.from - 1 && z <= r.to + 1 : Math.abs(z - r.c) <= half && x >= r.from - 1 && x <= r.to + 1) return true;
  }
  return oganiruDecksAt(x, z).length > 0;
}

// Is the point (x, y, z) inside one of the city's structures (for the camera, which must never be inside one): a deck's
// slab or walls, a pillar, a tower?
export function oganiruStructureAt(x, z, y) {
  if (!inBox(OGANIRU.bounds, x, z, 4)) return false;
  for (const h of oganiruDecksAt(x, z)) {
    if (y > h.y - D.thick - 0.15 && y < h.y + 0.05) return true;                   // in the slab
    if (h.off > h.deck.inner - 0.1 && y < h.y + D.wall + 0.1 && y > h.y - D.thick) return true;      // in a wall
    if (h.y - D.thick - 0 < OGANIRU.under && y < h.y) return true;                  // in an embankment
  }
  for (const t of TOWER_SOLIDS) if (y < t.top && (t.round ? Math.hypot(x - t.x, z - t.z) < t.r + 0.2 : (x > t.x0 - 0.2 && x < t.x1 + 0.2 && z > t.z0 - 0.2 && z < t.z1 + 0.2))) return true;
  const list = SOLID_CELLS.get(Math.floor(x / CELL) * 4096 + Math.floor(z / CELL));
  if (list) for (const c of list) if (c.pillar && y < c.top + 0.2 && Math.hypot(x - c.x, z - c.z) < c.r + 0.25) return true;
  return false;
}
// How high the city's tallest structure stands over a point (the camera looks for something to be inside only up to it).
export function oganiruTallAt(x, z) {
  if (!inBox(OGANIRU.bounds, x, z, 4)) return 0;
  let top = 0;
  for (const h of oganiruDecksAt(x, z)) top = Math.max(top, h.y + D.wall + 0.2);
  for (const t of TOWER_SOLIDS) if (t.round ? Math.hypot(x - t.x, z - t.z) < t.r + 1 : (x > t.x0 - 1 && x < t.x1 + 1 && z > t.z0 - 1 && z < t.z1 + 1)) top = Math.max(top, t.top);
  return top;
}

// Signs: the names of the roads at their junctions, the city's welcome where it begins, and over the expressway's
// lanes the green gantries pointing to the game's places (what each says, where it stands, which way it faces).
export const OGANIRU_SIGNS = Object.freeze([
  { id: 'welcome', lines: ['WELCOME TO', 'OGANIRU CITY'], x: -9, z: -512, facing: 0, width: 6, height: 2.6, palette: ['#ffffff', '#0f5132', '#f2c200'] },
  { id: 'gate-name', lines: ['GATE ROUNDABOUT'], x: 10.8, z: -530, facing: 0, width: 4.4, height: 0.9, palette: ['#ffffff', '#0f5132'] },
  { id: 'unity-union', lines: ['UNITY AVENUE', 'UNION STREET'], x: -12.2, z: UNION_Z + 11, facing: 0, width: 3.2, height: 1.1, palette: ['#ffffff', '#0f5132'] },
  { id: 'unity-tower', lines: ['UNITY AVENUE', 'TOWER STREET'], x: 12.2, z: TOWER_Z + 11, facing: 0, width: 3.2, height: 1.1, palette: ['#ffffff', '#0f5132'] },
  { id: 'independence-name', lines: ['INDEPENDENCE', 'BOULEVARD'], x: -26, z: INDEPENDENCE_Z + 21, facing: 0, width: 3.4, height: 1.1, palette: ['#ffffff', '#0f5132'] },
  // the gantries over the expressway (green, white letters, as on any expressway): its lanes' ends are road works
  { id: 'gantry-nb', lines: ['UNITY AVENUE  ↗', 'Asaba town centre · Motor park · Market'], x: -300, z: EXPRESSWAY_Z + 7.5, facing: -Math.PI / 2, width: 13, height: 3.2, palette: ['#ffffff', '#0b5d32'], gantry: 'viaduct', across: VIADUCT_HALF * 2 },
  { id: 'gantry-sb', lines: ['UNITY AVENUE  ↖', 'Oganiru Central · Towers'], x: 300, z: EXPRESSWAY_Z - 7.5, facing: Math.PI / 2, width: 13, height: 3.2, palette: ['#ffffff', '#0b5d32'], gantry: 'viaduct', across: VIADUCT_HALF * 2 },
].map(Object.freeze));

// Labels for the map.
export const OGANIRU_MAP_LABELS = Object.freeze([
  ['Oganiru City', -60, -760, 'center'], ['Unity Interchange', -150, -1130, 'center'], ['Oganiru Expressway', 380, -1130, 'vertical'],
]);
