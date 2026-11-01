// Oganiru City on foot (the owner's brief of 31 October 2026, Stage 2, 1 November: "Townspeople walk the pavements and
// use the crossings, never the expressway or flyovers (players may)." "The police chase over the flyovers too.").
//
// The ways about the city for anyone the town moves on foot (actors.js: an officer giving chase, someone running from
// trouble; city-strollers.js: the townspeople out walking in the city), as a network of points and the ways between
// them, each point at its height:
//   - the pavements beside the roads (their middle, every 20 m or so), joined where they meet round a corner, round the
//     roundabouts and across the towers' plazas to their doors; the Hope bridge's walkways over the cutting;
//   - the zebra crossings at every junction, across each road coming into it, each with the light its traffic stops at;
//   - for those who may go anywhere (an officer, someone running) and never for someone out walking: up the flyovers,
//     the slip roads and the loops (the middle of each, every 8 m), along the expressway's carriageways from where it is
//     on the ground, down through its cutting and up along its viaduct.
// Worked out when first wanted, not before (a phone opening the town has enough to do).
import { OGANIRU, OGANIRU_ROADS, OGANIRU_KERBED, OGANIRU_JUNCTIONS, OGANIRU_DECKS, OGANIRU_TOWERS, OGANIRU_ROUNDABOUTS, OGANIRU_PLACES, OGANIRU_CUTTING, EXPRESSWAY_Z, expresswayY, oganiruGroundY, onOganiru, roadWidthAt, zoneWalkable } from './zone.js';
import { walkLevel } from './levels.js';

const KERB = OGANIRU.kerb;
const CELL = 40;
const inCityLand = (x, z) => x >= OGANIRU.bounds.x0 && x <= OGANIRU.bounds.x1 && z >= OGANIRU.bounds.z0 && z <= OGANIRU.bounds.z1;
// Is (x, z) in the city (its own land, or the road on from College Road's end to it)?
export const inCity = (x, z) => inCityLand(x, z) && (onOganiru(x, z) || (Math.abs(x) < 6 && z < -466 && z > -482));
// Where the town's ways and the city's meet: College Road's end (and the road on from it), Campus Road's.
export const CITY_GATES = Object.freeze([
  Object.freeze({ id: 'college', town: [0, -462], city: [0, -486] }),
  Object.freeze({ id: 'campus', town: [234, -341], city: [258, -341] }),
]);

// on a carriageway (a road's, a junction's, a roundabout's ring) or down in the cutting: not for someone out walking
function onCarriageway(x, z) {
  if (x > OGANIRU_CUTTING.x0 && x < OGANIRU_CUTTING.x1 && Math.abs(z - OGANIRU_CUTTING.z) <= OGANIRU_CUTTING.half + 0.7) return true;
  for (const rb of OGANIRU_ROUNDABOUTS) { const d = Math.hypot(x - rb.x, z - rb.z); if (d < rb.outer + 0.2 && d > rb.island - 0.2) return true; }
  for (const j of OGANIRU_JUNCTIONS) if (Math.abs(x - j.x) <= j.hx && Math.abs(z - j.z) <= j.hz) return true;
  for (const r of OGANIRU_ROADS) {
    if (r.kind === 'cutting') continue;
    const a = r.along === 'z' ? z : x;
    if (a < r.from - 0.3 || a > r.to + 0.3) continue;
    const w = roadWidthAt(r, a), off = Math.abs((r.along === 'z' ? x : z) - r.c);
    if (off <= w.half + 0.2 && !(w.median > 0 && off < w.median / 2 - 0.2)) return true;
  }
  return false;
}

// Worked out a few milliseconds at a time (`prepareCityWalks`, each tick of the town until it is done), or all at once
// where it is wanted before then.
let built = null, building = null;
const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
export function prepareCityWalks(ms = 3) {
  if (built) return true;
  if (!building) building = build();
  const end = clock() + ms;
  while (clock() < end) { const r = building.next(); if (r.done) { built = r.value; building = null; return true; } }
  return false;
}
export function cityWalks() { while (!prepareCityWalks(1000)); return built; }

function* build() {
  const nodes = [];          // { x, z, y, foot }
  const adj = [];            // per node: [[other, length, crossing or null, foot], ...]
  const cells = new Map();
  const add = (x, z, y, foot, kind) => {
    const k = nodes.length;
    nodes.push({ x, z, y, foot, kind });
    adj.push([]);
    const key = Math.floor(x / CELL) * 4096 + Math.floor(z / CELL);
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(k);
    return k;
  };
  const link = (a, b, crossing = null, foot = true) => {
    if (a === b || adj[a].some((e) => e[0] === b)) return;
    const len = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z) + Math.abs(nodes[a].y - nodes[b].y);
    adj[a].push([b, len, crossing, foot]); adj[b].push([a, len, crossing, foot]);
  };
  const near = (x, z, r, test) => {
    const out = [];
    const c0 = Math.floor((x - r) / CELL), c1 = Math.floor((x + r) / CELL), d0 = Math.floor((z - r) / CELL), d1 = Math.floor((z + r) / CELL);
    for (let i = c0; i <= c1; i += 1) for (let j = d0; j <= d1; j += 1) for (const k of cells.get(i * 4096 + j) || []) { const n = nodes[k]; const d = Math.hypot(n.x - x, n.z - z); if (d <= r && (!test || test(n, k))) out.push([k, d]); }
    return out.sort((p, q) => p[1] - q[1]);
  };
  // (a straight way off the carriageways (on the pavements, the plazas, the walkways round the roundabouts and the bits
  // of ground between them): someone out walking keeps to it; across a road only at a crossing)
  const onKerb = (x0, z0, x1, z1) => {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.5));
    for (let i = 0; i <= n; i += 1) { const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * i) / n; if (onCarriageway(x, z)) return false; }
    return true;
  };
  const open = (x0, z0, x1, z1, y = 0) => walkLevel(x0, z0, y, x1, z1, [], 0.3, 0.7) !== null;

  // the pavements: each run of walkway (the boxes the town stands people on) along its middle
  const runs = new Map();
  for (const b of OGANIRU_KERBED) {
    if (!b.walk) continue;
    const r = OGANIRU_ROADS.find((q) => q.id === b.walk);
    if (!r) continue;
    const key = `${b.walk}|${b.side}`;
    if (!runs.has(key)) runs.set(key, []);
    runs.get(key).push({ r, a0: r.along === 'z' ? b.z0 : b.x0, a1: r.along === 'z' ? b.z1 : b.x1, c: r.along === 'z' ? (b.x0 + b.x1) / 2 : (b.z0 + b.z1) / 2 });
  }
  const ends = [], runOf = [];
  let run = 0;
  for (const list of runs.values()) {
    yield;
    list.sort((p, q) => p.a0 - q.a0);
    let last = null;
    for (const p of list) {
      const P = (a) => (p.r.along === 'z' ? [p.c, a] : [a, p.c]);
      const n = Math.max(1, Math.ceil((p.a1 - p.a0 - 1) / 20));
      // (a run of boxes one after another, as a walkway opening out in steps beside a flyover's road: one run)
      const goesOn = last && p.a0 - last.a1 < 0.8;
      if (!goesOn) { if (last) ends.push(last.k); run += 1; }
      let prev = -1;
      for (let i = 0; i <= n; i += 1) {
        const a = p.a0 + 0.5 + ((p.a1 - p.a0 - 1) * i) / n;
        const [x, z] = P(a);
        const k = add(x, z, KERB, true, 'walk');
        runOf[k] = run;
        if (prev >= 0) link(prev, k);
        else if (goesOn) link(last.k, k);
        else ends.push(k);
        prev = k;
      }
      last = { a1: p.a1, k: prev };
    }
    if (last) ends.push(last.k);
  }
  // the towers' plazas: a few points across each, about the towers
  for (const b of OGANIRU_KERBED) {
    if (!b.plaza) continue;
    yield;
    run += 1;
    const grid = new Map();
    for (let x = b.x0 + 1.5; x <= b.x1 - 1.5; x += 12) for (let z = b.z0 + 1.5; z <= b.z1 - 1.5; z += 12) {
      if (!zoneWalkable(x, z, [], 0.6, KERB)) continue;
      const k = add(x, z, KERB, true, 'walk');
      runOf[k] = run; ends.push(k);
      grid.set(`${Math.round((x - b.x0) / 12)},${Math.round((z - b.z0) / 12)}`, k);
    }
    for (const [key, k] of grid) { const [i, j] = key.split(',').map(Number); for (const [di, dj] of [[1, 0], [0, 1], [1, 1], [1, -1]]) { const o = grid.get(`${i + di},${j + dj}`); if (o !== undefined && open(nodes[k].x, nodes[k].z, nodes[o].x, nodes[o].z, KERB)) link(k, o); } }
  }
  // round the roundabouts: their walkways (but where a road comes in)
  for (const rb of OGANIRU_ROUNDABOUTS) {
    yield;
    const R = rb.outer + rb.walk / 2;
    let prev = -1, first = -1;
    for (let a = 0; a < 360; a += 10) {
      const x = rb.x + R * Math.sin((a * Math.PI) / 180), z = rb.z + R * Math.cos((a * Math.PI) / 180);
      if (oganiruGroundY(x, z) < KERB - 0.02) { prev = -1; continue; }
      const k = add(x, z, KERB, true, 'walk');
      if (prev < 0) { run += 1; ends.push(k); }
      runOf[k] = run;
      if (prev >= 0) link(prev, k);
      if (first < 0) first = k;
      prev = k;
    }
    if (prev >= 0 && first >= 0 && Math.hypot(nodes[prev].x - nodes[first].x, nodes[prev].z - nodes[first].z) < R * 0.2) link(prev, first);
  }
  // where two runs meet (round a corner, at a roundabout's walkway): each end joined over the kerbed ground to the
  // nearest points of the other runs there
  let count = 0;
  for (const k of ends) {
    if ((count += 1) % 12 === 0) yield;
    const seen = new Set([runOf[k]]);
    for (const [o, d] of near(nodes[k].x, nodes[k].z, 9, (n, i) => n.foot && !seen.has(runOf[i]))) {
      if (seen.has(runOf[o]) || d < 0.01) continue;
      if (onKerb(nodes[k].x, nodes[k].z, nodes[o].x, nodes[o].z) && open(nodes[k].x, nodes[k].z, nodes[o].x, nodes[o].z, KERB)) { link(k, o); seen.add(runOf[o]); }
    }
  }

  // the zebra crossings: across each road coming into each junction, from the pavement on one side to the other's,
  // with the light that road's traffic stops at (along z the avenues', phase 0; along x the boulevards', phase 1)
  const zebras = [];
  for (const j of OGANIRU_JUNCTIONS) {
    yield;
    for (const leg of j.legs) {
      const alongZ = leg === 'e' || leg === 'w', sign = leg === 'e' || leg === 'n' ? 1 : -1;
      const road = OGANIRU_ROADS.find((q) => j.roads.includes(q.id) && (q.along === 'z') === alongZ && (sign > 0 ? q.to > (alongZ ? j.z : j.x) + 1 : q.from < (alongZ ? j.z : j.x) - 1));
      if (!road) continue;
      const a = (alongZ ? j.z : j.x) + sign * ((alongZ ? j.hz : j.hx) + 2.6);
      const w = roadWidthAt(road, a);
      if (!(w.walk > 0)) continue;
      const half = alongZ ? j.hx : j.hz, lat = half + w.walk / 2;
      const P = (l) => (alongZ ? [j.x + l, a] : [a, j.z + l]);
      const sides = [-1, 1].map((s) => { const [x, z] = P(s * lat); return add(x, z, KERB, true, 'zebra'); });
      // (each end onto its pavement)
      for (const k of sides) for (const [o] of near(nodes[k].x, nodes[k].z, 10, (n, i) => n.foot && i !== sides[0] && i !== sides[1]).slice(0, 3)) if (onKerb(nodes[k].x, nodes[k].z, nodes[o].x, nodes[o].z)) link(k, o);
      const crossing = { junction: j.id, phase: alongZ ? 0 : 1, offset: j.offset, signals: j.signals };
      link(sides[0], sides[1], crossing);
      zebras.push({ a: sides[0], b: sides[1], crossing });
    }
  }
  // the towers' doors (at the foot of their steps, toward Unity Avenue), across their plazas to the pavement
  const doors = [];
  for (const t of OGANIRU_TOWERS) {
    yield;
    const facing = t.x > 0 ? -1 : 1;
    const x = t.x + facing * (t.dx / 2 + 3.2), z = t.z;
    const k = add(x, z, KERB, true, 'door');
    doors.push({ k, tower: t.id, name: t.name, x, z, h: facing > 0 ? Math.PI / 2 : -Math.PI / 2 });
    for (const [o] of near(x, z, 20, (n, i) => n.foot && i !== k).slice(0, 6)) if (onKerb(x, z, nodes[o].x, nodes[o].z) && open(x, z, nodes[o].x, nodes[o].z, KERB)) link(k, o);
  }
  // the Hope bridge's walkways, over the cutting at the street's level
  {
    const X = OGANIRU_PLACES.HOPE_X;
    for (const s of [-1, 1]) {
      let prev = -1;
      for (let z = -1162; z <= -1098; z += 8) {
        const k = add(X + s * 11.75, z, 0, true, 'bridge');
        if (prev >= 0) link(prev, k);
        prev = k;
      }
      for (const end of [nodes.length - 9, nodes.length - 1]) for (const [o] of near(nodes[end].x, nodes[end].z, 10, (n, i) => n.foot && n.kind === 'walk' && i !== end).slice(0, 2)) link(end, o);
    }
  }

  // For those who may go anywhere: the decks along their middles, and the expressway along its two carriageways
  const deckEnds = [];
  const pointOn = (d, s) => {
    let lo = 0, hi = d.path.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (d.path[m].s <= s) lo = m; else hi = m; }
    const p = d.path[lo], q = d.path[hi], f = Math.max(0, Math.min(1, (s - p.s) / Math.max(1e-6, q.s - p.s)));
    return [p.x + (q.x - p.x) * f, p.z + (q.z - p.z) * f, p.y + (q.y - p.y) * f];
  };
  for (const d of OGANIRU_DECKS) {
    if (d.kind === 'expressway' || d.kind === 'bridge') continue;
    yield;
    let prev = -1;
    const n = Math.max(1, Math.ceil(d.len / 8));
    for (let i = 0; i <= n; i += 1) {
      const [x, z, y] = pointOn(d, (d.len * i) / n);
      const k = add(x, z, y, false, 'deck');
      if (prev >= 0) link(prev, k, null, false);
      if (i === 0 || i === n) deckEnds.push(k);
      prev = k;
    }
  }
  const EZ = EXPRESSWAY_Z;
  const lines = [], first = {};
  for (const side of [-1, 1]) {
    let prev = -1;
    for (let x = side > 0 ? -1196 : -1036; x <= 916; x += 10) {
      const k = add(x, EZ + side * 8, expresswayY(x), false, 'expressway');
      if (prev >= 0) link(prev, k, null, false);
      if (x === -1036) first[side] = k;
      prev = k;
      lines.push(k);
    }
  }
  // (round the end of the barrier between them, where the south-bound carriageway begins)
  link(first[-1], first[1], null, false);
  // a deck's ends: onto the expressway or another deck where it runs into one at its height, or down to the ground
  count = 0;
  for (const k of [...deckEnds, ...lines]) {
    if ((count += 1) % 2 === 0) yield;
    const n = nodes[k];
    for (const [o, d] of near(n.x, n.z, n.kind === 'expressway' ? 9 : 16, (m, i) => i !== k && !m.foot && Math.abs(m.y - n.y) < 0.6)) if (d > 0.01 && open(n.x, n.z, nodes[o].x, nodes[o].z, n.y)) { link(k, o, null, false); }
    if (n.y < 0.6) for (const [o] of near(n.x, n.z, 24, (m) => m.foot && m.y < 0.6 + KERB).slice(0, 3)) if (open(n.x, n.z, nodes[o].x, nodes[o].z, 0)) link(k, o, null, false);
  }
  return { nodes, adj, cells, zebras, doors, near };
}

// The way on foot between two points in the city, each at its height ({ x, z, y }): the points to pass through, each
// [x, z, y], or null. `foot`: someone out walking (the pavements and the crossings only); else anyone (an officer, up
// the flyovers too). The nearest point of the network that can be walked straight to from each end, and the shortest
// way between (by its length, a crossing a little longer for someone out walking).
export function cityRoute(from, to, { foot = false } = {}) {
  const W = cityWalks();
  const start = entry(W, from, foot), end = entry(W, to, foot);
  if (start < 0 || end < 0) return null;
  const path = astar(W, start, end, foot);
  if (!path) return null;
  return [...path.map((k) => [W.nodes[k].x, W.nodes[k].z, W.nodes[k].y]), [to.x, to.z, Number.isFinite(to.y) ? to.y : W.nodes[end].y]];
}
// the network's point nearest (x, z) at its height that can be walked to straight from there
function entry(W, at, foot) {
  const y = Number.isFinite(at.y) ? at.y : 0;
  const list = W.near(at.x, at.z, 60, (n) => (!foot || n.foot) && Math.abs(n.y - y) < 1.3);
  for (const [k] of list.slice(0, 12)) { const n = W.nodes[k]; if (walkLevel(at.x, at.z, y, n.x, n.z, [], 0.3, 0.7) !== null) return k; }
  return list.length ? list[0][0] : -1;
}
function astar(W, a, b, foot) {
  const N = W.nodes.length, goal = W.nodes[b];
  const g = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  const heap = [];
  const push = (k, f) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top[1]; };
  const h = (k) => Math.hypot(W.nodes[k].x - goal.x, W.nodes[k].z - goal.z);
  g[a] = 0; push(a, h(a));
  while (heap.length) {
    const u = pop();
    if (done[u]) continue;
    done[u] = 1;
    if (u === b) break;
    for (const [v, len, crossing, onFoot] of W.adj[u]) {
      if (foot && !onFoot) continue;
      const d = g[u] + len + (foot && crossing ? 12 : 0);
      if (d < g[v]) { g[v] = d; prev[v] = u; push(v, d + h(v)); }
    }
  }
  if (!Number.isFinite(g[b])) return null;
  const out = [];
  for (let k = b; k >= 0; k = prev[k]) out.push(k);
  return out.reverse();
}
