// The town's traffic: its motorists, in the cars of the Post Civil War Car Showroom (30 October 2026, the owner's
// brief: "You need to allow the NPC to drive different kinds of cars based on the cars available at the showroom.
// Users can hijack cars but can never put the car for sale. And if police catch them, all cars must be returned.").
//
// Twenty-five of the town's people (atani.js, `motorist`: his own figures, as everyone else) each have a car: one of
// the showroom's own models, drawn from the owner's file as every car is (car-model.js). Ten of the twenty models are
// driven about the town: the ten whose windows are painted on, so that nobody is seen sitting on nothing inside them
// (car-view.js: the other ten are open, or can be seen into, and nobody is yet drawn at the wheel of a townsperson's
// car). Each motorist is out in their car for their shift (most by day, some into the evening, a few through the
// night): from one place at the roadside to another along the town's roads and out along the Kwale road to the airport,
// on the right of the road, slower in the bends, stopping at the lights on Market Road, behind whatever is in front of
// them (another car, a player, a parked car), for whoever is on foot in the road (who step aside, as they do for any
// vehicle, impact.js), and standing a while at the roadside before going on, the driver at the wheel.
//
// A car standing still (at the roadside, at a red light, in a queue) can be taken from its driver (hijack.js): the
// driver is pulled out and runs, has seen the thief's face; a crime for the police if an officer saw it (justice.js:
// taking a vehicle).
// The thief drives it as they would their own (own-cars.js), and may leave it and come back to it: it stands where
// they left it and nobody else gets into it. It is never theirs: the website's server, which keeps who owns what, is
// never told of it, so it is never on their list of cars, never in the market and never sold. When the police catch
// them, every car they have taken goes back to its owner (`recover`), who comes for it on foot. One player holds no
// more than five at once: a sixth taken, the first is found by its owner.
//
// Its roads (`TRAFFIC_ROADS`): every road wide enough for two cars to pass (the narrow lanes between the houses are
// for feet and motorcycles), short of every roadblock, and the roads out of town to the airport. Where two meet, a car
// turns from its own side of one to its own side of the other along a curve; at the end of a road it turns round.
//
// What the page draws (traffic-view in main.js and car-view.js): each car within sight as its model or, further off,
// its picture (vehicle-standins.js), lamps lit at night; what it hears: the nearest engines (audio.js).
import { ZONE_ROADS, OUTSKIRT_ROADS, BOULEVARD, ZONE_CLOSURES, CITY_AREA, trafficHold, zoneWalkable, OGANIRU, OGANIRU_TRAFFIC, OGANIRU_JUNCTIONS, oganiruHold, signalState } from './zone.js';
import { levelAt } from './levels.js';
import { inCity } from './city-walks.js';
import { POWER_CARS, carBoxes, carCircles } from './power-cars.js';
import { POSE } from './population.js';
import { GameError } from './registry.js';

export const TRAFFIC = Object.freeze({
  wide: 7.5,               // metres: a road at least this wide carries cars
  town: 9,                 // m/s on the town's roads (about 32 km/h); on the city block's boulevard a little less
  open: 15,                // on the roads out of town (about 54 km/h)
  bend: 3.2,               // m/s², across the road in a bend: the tighter the bend, the slower
  accel: 2.2,              // m/s² gathering speed
  brake: 4.2,              // m/s² stopping, as a driver plans to
  hard: 8,                 // m/s² at most
  gap: 2.4,                // metres between bumpers when stopped behind something
  look: 32,                // metres ahead a driver watches
  turn: 6,                 // metres before and after the corner a turn takes
  shift: 10,               // metres a car takes to pull out from the roadside, or in to it
  every: 45,               // metres between places at the roadside a car may stand
  clear: 18,               // and none nearer a junction than this
  cityClear: 30,           // (in the city, where the junctions are wider and the stop lines further out, this)
  cityPace: 14,            // m/s: the city's roads compared by time at this pace, choosing a way
  cityFar: 2600,           // metres (at that pace) a trip from somewhere in the city may go
  stand: Object.freeze([25, 80]),     // real seconds a car stands at the roadside before going on
  apart: 80,               // metres: a car comes onto the roads, or goes home off them, only this far from every player
  near: 75,                // metres: townspeople are asked to step aside only by a car this near a player
  most: 5,                 // cars one player may have taken and left standing; a sixth, and the first is found by its owner
  wait: 22,                // real seconds a car waits for something that does not move before it turns round
});

// The ten models the town drives (power-cars.js; a motorist's is the n-th, round and round): the showroom's closed
// cars, the six made light first.
export const TRAFFIC_MODELS = Object.freeze(['grey-saloon', 'black-pickup', 'black-square-suv', 'blue-off-roader', 'mint-sports-coupe', 'state-limousine', 'black-luxury-suv', 'camo-expedition', 'grey-grand-tourer', 'midnight-saloon']);

const hash = (a, b = 0) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const inBox = (r, x, z, m = 0) => x >= r.x0 - m && x <= r.x1 + m && z >= r.z0 - m && z <= r.z1 + m;
const smooth = (u) => { const k = Math.max(0, Math.min(1, u)); return k * k * (3 - 2 * k); };
const wrap = (a) => { let d = a % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
// the biggest of the town's cars, for whether a place at the roadside has room
const ROOMY = Object.freeze({ length: 5.9, width: 2.45 });

// ---------------------------------------------------------------- the roads ---

function carRoads() {
  const list = [];
  const take = (r, open) => {
    const w = Math.min(r.x1 - r.x0, r.z1 - r.z0);
    if (w < TRAFFIC.wide) return;
    const axis = r.x1 - r.x0 >= r.z1 - r.z0 ? 'x' : 'z';
    const boulevard = Math.abs(r.x0 - BOULEVARD.x0) < 0.01 && Math.abs(r.x1 - BOULEVARD.x1) < 0.01 && Math.abs(r.z0 - BOULEVARD.z0) < 0.01 && Math.abs(r.z1 - BOULEVARD.z1) < 0.01;
    let a0 = axis === 'x' ? r.x0 : r.z0, a1 = axis === 'x' ? r.x1 : r.z1;
    const c = axis === 'x' ? (r.z0 + r.z1) / 2 : (r.x0 + r.x1) / 2;
    // short of any roadblock across it (closures.js): the land beyond is not built
    for (const k of ZONE_CLOSURES) {
      const kx = (k.a.x + k.b.x) / 2, kz = (k.a.z + k.b.z) / 2;
      if (!inBox(r, kx, kz, 3)) continue;
      const at = axis === 'x' ? kx : kz;
      if (at - a0 < a1 - at) a0 = Math.max(a0, at + 4); else a1 = Math.min(a1, at - 4);
    }
    // its lanes: on the right, in the middle of its own half on the town's roads (2 m from the middle of an 8 m road,
    // 2.2 m of a wider one: people walking along a road keep within half a metre of its middle, population.js); on the
    // city block's boulevard 2.2 m from its middle too, where its two lanes each way meet
    list.push({ id: r.id, axis, c, a0, a1, w, lane: Math.min(2.2, w / 4), kerb: w / 2 + 0.6, cruise: open ? TRAFFIC.open : boulevard ? TRAFFIC.town - 1 : TRAFFIC.town, boulevard, open, city: false, oneway: 0, inner: null, stops: true });
  };
  for (const r of ZONE_ROADS) take(r, false);
  // out of town: the Kwale road and the airport's (not its car park, nor the bridge, which leads nowhere built yet)
  for (const r of OUTSKIRT_ROADS) if (!r.bays && !r.deck) take(r, true);
  // and on into Oganiru City (zones/oganiru.js, 1 November 2026): its avenues, boulevards and streets, the flyovers over
  // its junctions, the expressway, the interchanges' slip roads and loops, the roundabouts' rings
  for (const r of OGANIRU_TRAFFIC) {
    const o = { ...r, city: true, boulevard: false, open: false };
    if (r.axis === 'path') {
      o.xs = Float64Array.from(r.pts, (p) => p.x); o.zs = Float64Array.from(r.pts, (p) => p.z); o.ys = Float64Array.from(r.pts, (p) => p.y);
      o.ss = Float64Array.from(r.pts, (p) => p.s); o.uxs = Float64Array.from(r.pts, (p) => p.ux); o.uzs = Float64Array.from(r.pts, (p) => p.uz);
    }
    list.push(o);
  }
  return list;
}

// Where `along` falls on a path road (its points' distances along it): the point before, and how far on to the next.
function pathSpot(road, along) {
  const ss = road.ss, n = ss.length;
  if (along <= ss[0]) return [0, 0];
  if (along >= ss[n - 1]) return [n - 2, 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ss[m] <= along) lo = m; else hi = m; }
  return [lo, (along - ss[lo]) / Math.max(1e-9, ss[hi] - ss[lo])];
}
// The nearest point of a path road to (x, z): how far along it, and how far off it.
function nearestOnPath(road, x, z) {
  let best = { along: 0, off: Infinity };
  for (let k = 0; k + 1 < road.xs.length; k += 1) {
    const ax = road.xs[k], az = road.zs[k], ex = road.xs[k + 1] - ax, ez = road.zs[k + 1] - az, l2 = ex * ex + ez * ez || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
    const off = Math.hypot(x - ax - ex * t, z - az - ez * t);
    if (off < best.off) best = { along: road.ss[k] + (road.ss[k + 1] - road.ss[k]) * t, off };
  }
  return best;
}
// A road's lane at a point along it (where it changes: a flyover-road opening out, an approach to a roundabout).
const laneOf = (road, along) => (road.laneAt ? road.laneAt(Math.max(road.a0, Math.min(road.a1, along))) : road.lane);
// A point of a road: `along` it, `lat` metres to the right of its middle for something going `dir` (+1: towards its
// higher end) along it.
function pointOf(road, along, lat, dir) {
  if (road.axis === 'x') return [along, road.c + lat * dir];
  if (road.axis === 'z') return [road.c - lat * dir, along];
  const [k, f] = pathSpot(road, along);
  const x = road.xs[k] + (road.xs[k + 1] - road.xs[k]) * f, z = road.zs[k] + (road.zs[k + 1] - road.zs[k]) * f;
  if (!lat) return [x, z];
  const ux = road.uxs[k] + (road.uxs[k + 1] - road.uxs[k]) * f, uz = road.uzs[k] + (road.uzs[k + 1] - road.uzs[k]) * f, l = Math.hypot(ux, uz) || 1;
  return [x - (uz / l) * lat * dir, z + (ux / l) * lat * dir];
}
// Which way something going `dir` along a road faces (on a path road, where along it).
function headingOf(road, dir, along = 0) {
  if (road.axis === 'x') return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  if (road.axis === 'z') return dir > 0 ? 0 : Math.PI;
  const [k, f] = pathSpot(road, along);
  const ux = road.uxs[k] + (road.uxs[k + 1] - road.uxs[k]) * f, uz = road.uzs[k] + (road.uzs[k + 1] - road.uzs[k]) * f;
  return Math.atan2(ux * dir, uz * dir);
}
const alongOf = (road, x, z) => (road.axis === 'x' ? x : road.axis === 'z' ? z : nearestOnPath(road, x, z).along);
// How high a road runs at a point along it: the city's at their levels (the ground there 0, the expressway's cutting
// below it, its viaduct and the flyovers above); the town's as its ground lies (NaN).
function levelOf(road, along) {
  if (!road.city) return NaN;
  if (road.axis === 'path') { const [k, f] = pathSpot(road, along); return road.ys[k] + (road.ys[k + 1] - road.ys[k]) * f; }
  return road.level ? road.level(Math.max(road.a0, Math.min(road.a1, along))) : 0;
}
// the line a road runs along (two roads end to end along it are one way on)
const lineOf = (road) => (road.axis === 'path' ? road.id : `${road.axis}:${Math.round(road.c * 10)}`);

function buildNetwork() {
  const roads = carRoads();
  const index = new Map(roads.map((r, k) => [r.id, k]));
  const flat = (r, a) => { const y = levelOf(r, a); return Number.isFinite(y) ? y : 0; };
  // where along each road something joins it: [along, how firmly: 2 a road across it, 1.5 a slip road leaving or joining
  // it, 1 a road going on from its end]
  const marks = roads.map(() => []);
  for (let a = 0; a < roads.length; a += 1) {
    for (let b = a + 1; b < roads.length; b += 1) {
      const A = roads[a], B = roads[b];
      if (A.axis === 'path' || B.axis === 'path') continue;
      if (A.axis === B.axis) {
        if (Math.abs(A.c - B.c) > 1.5) continue;
        for (const e of [A.a0, A.a1]) for (const f of [B.a0, B.a1]) if (Math.abs(e - f) < 3 && Math.abs(flat(A, e) - flat(B, f)) < 1.5) { const m = (e + f) / 2; marks[a].push([m, 1]); marks[b].push([m, 1]); }
        continue;
      }
      const ix = A.axis === 'x' ? a : b, iz = A.axis === 'x' ? b : a;
      const X = roads[ix], Z = roads[iz];
      const x = Z.c, z = X.c;
      if (x < X.a0 - Z.w / 2 - 1.5 || x > X.a1 + Z.w / 2 + 1.5 || z < Z.a0 - X.w / 2 - 1.5 || z > Z.a1 + X.w / 2 + 1.5) continue;
      // (one over the other, a flyover over a road, the expressway over or under one: no junction)
      if ((X.city || Z.city) && Math.abs(flat(X, x) - flat(Z, z)) > 2.5) continue;
      marks[ix].push([x, 2]); marks[iz].push([z, 2]);
    }
  }
  roads.forEach((r) => { if (r.axis === 'path') for (const end of [r.from, r.to]) marks[index.get(end.road)].push([end.along, 1.5]); });
  // (a city road's end left free just short of a junction, or just beyond it: the road ends at the junction, no way
  // running on into the few metres past it; and it runs on to every junction it reaches)
  roads.forEach((r, ri) => {
    if (!r.city || r.axis === 'path') return;
    for (const end of ['a0', 'a1']) {
      const at = r[end];
      if (marks[ri].some(([m, f]) => f < 2 && Math.abs(m - at) < 3)) continue;
      const cross = marks[ri].filter(([m, f]) => f === 2 && Math.abs(m - at) <= 12).sort((p, q) => Math.abs(p[0] - at) - Math.abs(q[0] - at))[0];
      if (cross) r[end] = cross[0];
    }
    for (const [m] of marks[ri]) { if (m < r.a0) r.a0 = m; if (m > r.a1) r.a1 = m; }
  });
  const nodes = [];
  const nodeAt = (x, z, y) => {
    for (let k = 0; k < nodes.length; k += 1) if (Math.hypot(nodes[k].x - x, nodes[k].z - z) < 4 && !(Number.isFinite(y) && Number.isFinite(nodes[k].y) && Math.abs(nodes[k].y - y) > 2)) { if (!Number.isFinite(nodes[k].y)) nodes[k].y = y; return k; }
    nodes.push({ x, z, y, on: new Map(), links: [], out: [], into: [] });
    return nodes.length - 1;
  };
  const edges = [];
  const stops = [];
  const link = (e) => {
    edges.push(e);
    nodes[e.a].links.push({ to: e.b, edge: edges.length - 1, len: e.len });
    nodes[e.b].links.push({ to: e.a, edge: edges.length - 1, len: e.len });
  };
  roads.forEach((road, ri) => {
    if (road.axis === 'path') return;
    // its points: where others join it, and its own ends where nothing does; near together, the firmer kept
    const all = [...marks[ri], [road.a0, 0], [road.a1, 0]].sort((p, q) => p[0] - q[0]);
    const kept = [];
    for (const p of all) {
      const last = kept[kept.length - 1];
      if (last && p[0] - last[0] < 8.5) { if (p[1] > last[1]) kept[kept.length - 1] = p; continue; }
      kept.push(p);
    }
    const ids = kept.map(([along]) => { const [x, z] = pointOf(road, along, 0, 1); const k = nodeAt(x, z, levelOf(road, along)); nodes[k].on.set(ri, along); return k; });
    for (let k = 0; k + 1 < ids.length; k += 1) {
      const s0 = kept[k][0], s1 = kept[k + 1][0];
      link({ road: ri, a: ids[k], b: ids[k + 1], s0, s1, len: s1 - s0 });
      // places at the roadside along it, both sides, clear of the junctions; not on the city block's boulevard, nor on
      // the city's roads with nowhere to stand, and only where the biggest of the cars has room
      if (road.boulevard || !road.stops) continue;
      const clear = road.city ? TRAFFIC.cityClear : TRAFFIC.clear;
      for (let s = s0 + clear; s <= s1 - clear; s += TRAFFIC.every) {
        if (road.noStops && road.noStops.some(([p, q]) => s >= p && s <= q)) continue;
        for (const dir of road.oneway ? [road.oneway] : [1, -1]) {
          const [x, z] = pointOf(road, s, road.kerb, dir);
          const h = headingOf(road, dir);
          if (!carCircles(ROOMY, x, z, h).every((c) => zoneWalkable(c.x, c.z, [], Math.max(0.3, c.r - 0.05)))) continue;
          stops.push(Object.freeze({ id: stops.length, road: ri, edge: edges.length - 1, s, dir, x, z, h }));
        }
      }
    }
  });
  // the slip roads, loops and rings: each from the point where it leaves a road to where it joins another
  roads.forEach((road, ri) => {
    if (road.axis !== 'path') return;
    const ends = [road.from, road.to].map((end) => {
      const h = index.get(end.road);
      let best = -1, bestD = Infinity;
      nodes.forEach((n, k) => { const a = n.on.get(h); if (a !== undefined && Math.abs(a - end.along) < bestD) { bestD = Math.abs(a - end.along); best = k; } });
      return best;
    });
    if (ends[0] < 0 || ends[1] < 0 || ends[0] === ends[1]) throw new Error(`traffic: ${road.id} does not join the roads`);
    nodes[ends[0]].on.set(ri, 0); nodes[ends[1]].on.set(ri, road.a1);
    link({ road: ri, a: ends[0], b: ends[1], s0: 0, s1: road.a1, len: road.a1 });
  });
  // what each junction is: in the town, anywhere a car may turn about; in the city only at its junctions (through the
  // gap in the middle strip there), never on the expressway, its slip roads, a flyover or a ring
  for (const n of nodes) {
    n.city = [...n.on.keys()].some((ri) => roads[ri].city);
    const j = n.city ? OGANIRU_JUNCTIONS.find((q) => Math.abs(q.x - n.x) < 3 && Math.abs(q.z - n.z) < 3) : null;
    n.uturn = !n.city || (!!j && ![...n.on.keys()].some((ri) => roads[ri].axis === 'path' || roads[ri].deck));
    n.signals = !!(j && j.signals);
  }
  // the ways along each stretch a car may go: both ways along a road, one way along a one-way road and every slip road
  const arcs = [], arcIndex = new Int32Array(edges.length * 2).fill(-1);
  edges.forEach((e, ei) => {
    const road = roads[e.road];
    for (const dir of [1, -1]) {
      if (road.oneway && dir !== road.oneway) continue;
      const k = arcs.length;
      // (what it costs to go along it, choosing a way: in the city its time, as metres at an avenue's pace, so that
      // the expressway is taken for the longer ways; in the town its length)
      arcs.push({ edge: ei, road: e.road, dir, from: dir > 0 ? e.a : e.b, to: dir > 0 ? e.b : e.a, len: e.len, cost: e.len * (road.city ? TRAFFIC.cityPace / road.cruise : 1) });
      arcIndex[ei * 2 + (dir > 0 ? 0 : 1)] = k;
      nodes[arcs[k].from].out.push(k); nodes[arcs[k].to].into.push(k);
    }
  });
  // each road's junctions in order along it
  const along = roads.map(() => []);
  nodes.forEach((n, k) => { for (const [ri, a] of n.on) along[ri].push([a, k]); });
  for (const l of along) l.sort((p, q) => p[0] - q[0]);
  for (const r of roads) Object.freeze(r);
  const net = { roads, nodes, edges, arcs, stops, along, arcOf: (ei, dir) => arcIndex[ei * 2 + (dir > 0 ? 0 : 1)], lines: roads.map(lineOf) };
  // (for the tests: the shortest way from every junction to every other, as the cars may go; worked out when asked)
  let dist = null;
  Object.defineProperty(net, 'dist', { get() { if (!dist) dist = nodes.map((_, a) => { const R = search({ node: a, arc: -1, cost: 0 }, net); const d = new Float64Array(nodes.length).fill(Infinity); d[a] = 0; arcs.forEach((A, k) => { if (R.dist[k] < d[A.to]) d[A.to] = R.dist[k]; }); return d; }); return dist; } });
  return net;
}

// May a car come into junction `n` along arc `i` and leave it along arc `o`? Not back the way it came but where it may
// turn about; onto a slip road leaving a road alongside only from that road, going its way; off one joining a road
// alongside only onto that road, going its way.
function turnable(net, n, i, o) {
  const A = net.arcs[i], B = net.arcs[o];
  if (A.edge === B.edge) return net.nodes[n].uturn;
  const ra = net.roads[A.road], rb = net.roads[B.road];
  if (ra.axis !== 'path' && rb.axis !== 'path') return true;
  const hi = ra.axis === 'path' ? ra.to : null, ho = rb.axis === 'path' ? rb.from : null;
  const lineA = hi ? net.lines[net.roads.findIndex((r) => r.id === hi.road)] : net.lines[A.road], dirA = hi ? hi.dir : A.dir;
  const lineB = ho ? net.lines[net.roads.findIndex((r) => r.id === ho.road)] : net.lines[B.road], dirB = ho ? ho.dir : B.dir;
  if (ho && ho.dir) return lineA === lineB && dirA === ho.dir;
  if (hi && hi.dir) return lineA === lineB && dirB === hi.dir;
  return true;
}
// What a turn costs, in metres, choosing a way: in the city, through a junction's lights, round a corner, turning about
// (so that the traffic going on goes over a junction's flyover rather than through the junction under it).
function turnCost(net, n, i, o) {
  const N = net.nodes[n];
  if (!N.city || i < 0) return 0;
  const A = net.arcs[i], B = net.arcs[o];
  if (A.edge === B.edge) return 40;
  const ra = net.roads[A.road], rb = net.roads[B.road];
  return (N.signals ? 12 : 0) + (ra.axis !== 'path' && rb.axis !== 'path' && ra.axis !== rb.axis ? 6 : 0);
}
// The shortest ways on from `start` ({ node, arc: the arc it came in along or -1, cost so far }): for each arc, how far
// to its end by the best way, and the arc before it on that way (the start itself is `S`).
function search(start, net = NET) {
  const n = net.arcs.length, S = n;
  const dist = new Float64Array(n + 1).fill(Infinity), prev = new Int32Array(n + 1).fill(-1), done = new Uint8Array(n + 1);
  const heap = [], put = (k, d) => { heap.push([d, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const take = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top[1]; };
  dist[S] = start.cost || 0; put(S, dist[S]);
  const turns = new Map();
  while (heap.length) {
    const u = take();
    if (done[u]) continue;
    done[u] = 1;
    const node = u === S ? start.node : net.arcs[u].to, inn = u === S ? start.arc : u;
    for (const o of net.nodes[node].out) {
      if (inn >= 0) {
        const key = inn * 65536 + o;
        let ok = turns.get(key);
        if (ok === undefined) { ok = turnable(net, node, inn, o); turns.set(key, ok); }
        if (!ok) continue;
      }
      const d = dist[u] + (inn >= 0 ? turnCost(net, node, inn, o) : 0) + net.arcs[o].cost;
      if (d < dist[o]) { dist[o] = d; prev[o] = u; put(o, d); }
    }
  }
  return { dist, prev, S };
}

const NET = buildNetwork();
// (for the tests and the drawing: the roads a car keeps to, its own side of them, and the places it stands)
export const TRAFFIC_ROADS = NET.roads;
export const TRAFFIC_STOPS = NET.stops;
export const trafficNetwork = () => NET;
// The expressway's through traffic (1 November 2026): the places at the roadside at its two ends, on Harmony Avenue by
// the Harmony Interchange and on Peace Avenue by the Peace Interchange, and the expressway's own road.
const THROUGH = (() => {
  const on = (id, z0, z1) => NET.stops.filter((s) => NET.roads[s.road].id === id && s.z > z0 && s.z < z1);
  return Object.freeze({ south: on('harmony-2', -1240, -1020), north: on('peace-2', -1170, -990), road: NET.roads.findIndex((r) => r.id === 'expressway') });
})();
// While nobody is out in the city, a place at the roadside in it counts as this much further off for one of the town's
// cars (they keep to the town, where the players are; 2 November 2026)
const CITY_EMPTY = 2000;

// The junction ahead of something at `along` on road `ri` going `dir`; -1 where there is none.
function nodeAhead(ri, along, dir) {
  const l = NET.along[ri];
  if (dir > 0) { for (let k = 0; k < l.length; k += 1) if (l[k][0] - along > 0.5) return l[k][1]; return -1; }
  for (let k = l.length - 1; k >= 0; k -= 1) if (along - l[k][0] > 0.5) return l[k][1];
  return -1;
}
// Where something at (road, along, dir) is on the network: the junction ahead of it, the arc it is on to it, how far.
function startOf(from) {
  const first = nodeAhead(from.road, from.along, from.dir);
  if (first < 0) return null;
  const arc = NET.nodes[first].into.find((k) => NET.arcs[k].road === from.road && NET.arcs[k].dir === from.dir);
  if (arc === undefined) return null;
  const road = NET.roads[from.road];
  return { node: first, arc, cost: Math.abs(NET.nodes[first].on.get(from.road) - from.along) * (road.city ? TRAFFIC.cityPace / road.cruise : 1) };
}
// How far by road from where `from` is (its `start` and the ways on from it, `R`) to a place at the roadside.
function farTo(from, stop, R) {
  const e = NET.edges[stop.edge];
  if (from.road === stop.road && from.dir === stop.dir && (stop.s - from.along) * stop.dir > 4 && from.along >= e.s0 - 0.5 && from.along <= e.s1 + 0.5) return (stop.s - from.along) * stop.dir;
  const t = NET.arcOf(stop.edge, stop.dir);
  if (t < 0 || !Number.isFinite(R.dist[t])) return Infinity;
  return R.dist[t] - NET.arcs[t].cost + Math.abs(stop.s - NET.nodes[NET.arcs[t].from].on.get(stop.road));
}

// Where something standing at (x, z), facing h (at height y, where it is known), is on the roads: the road, how far
// along, and which way it faces.
export function placeOnRoads(x, z, h, y = NaN) {
  let best = null, bestD = Infinity;
  const fx = Math.sin(h), fz = Math.cos(h);
  NET.roads.forEach((road, ri) => {
    if (road.axis === 'path') {
      const q = nearestOnPath(road, x, z);
      if (q.off > road.w / 2 + 2 || q.off >= bestD) return;
      if (Number.isFinite(y) && Math.abs(levelOf(road, q.along) - y) > 2.5) return;
      if (Math.cos(h - headingOf(road, 1, q.along)) < 0) return;
      bestD = q.off; best = { road: ri, along: q.along, dir: 1 };
      return;
    }
    const along = alongOf(road, x, z);
    if (along < road.a0 - 3 || along > road.a1 + 3) return;
    const off = Math.abs((road.axis === 'x' ? z : x) - road.c);
    if (off > road.w / 2 + 3 || off >= bestD) return;
    if (road.city && Number.isFinite(y) && Math.abs(levelOf(road, along) - y) > 2.5) return;
    const dir = (road.axis === 'x' ? fx : fz) >= 0 ? 1 : -1;
    if (road.oneway && dir !== road.oneway) return;
    bestD = off; best = { road: ri, along: Math.max(road.a0, Math.min(road.a1, along)), dir };
  });
  return best;
}

// ------------------------------------------------------------------ a way ---

// The legs of a way from (road, along, dir) to a place at the roadside: each a stretch of one road, one way.
function legsTo(from, stop) {
  const road = from.road, end = NET.stops[stop];
  const e = NET.edges[end.edge];
  // already on the stretch the place is on, facing its way, short of it: straight there
  if (road === end.road && from.dir === end.dir && (end.s - from.along) * end.dir > 4 && from.along >= e.s0 - 0.5 && from.along <= e.s1 + 0.5) return [{ road, dir: end.dir, a: from.along, b: end.s, node: -1 }];
  const start = startOf(from);
  if (!start) return null;
  const R = search(start);
  const target = NET.arcOf(end.edge, end.dir);
  if (target < 0 || !Number.isFinite(R.dist[target])) return null;
  const chain = [];
  for (let k = target; k !== R.S; k = R.prev[k]) { if (k < 0) return null; chain.push(k); }
  chain.reverse();
  const on = (node, ri) => NET.nodes[node].on.get(ri);
  const legs = [{ road, dir: from.dir, a: from.along, b: on(start.node, road), node: start.node }];
  for (let k = 0; k + 1 < chain.length; k += 1) { const A = NET.arcs[chain[k]]; legs.push({ road: A.road, dir: A.dir, a: on(A.from, A.road), b: on(A.to, A.road), node: A.to }); }
  legs.push({ road: end.road, dir: end.dir, a: on(NET.arcs[target].from, end.road), b: end.s, node: -1 });
  // a leg of nothing (a junction passed straight through on the same road) is left out
  return legs.filter((l, k) => Math.abs(l.b - l.a) > 0.01 || k === legs.length - 1);
}

// The way itself: points along the middle of the car's own side of each road, round the corners, turned about at
// ends, out from the roadside at the start (`fromLat` metres from the middle) and in to it at the end; onto a slip road
// and off it, into a ring and out of it, along a smooth curve from the one to the other; each point at its height.
function shapeWay(legs, fromLat, toLat) {
  const xs = [], zs = [], ys = [], lg = [], as = [];
  const put = (x, z, y, k, a) => {
    const n = xs.length;
    if (n && Math.hypot(x - xs[n - 1], z - zs[n - 1]) < 0.05) return;
    xs.push(x); zs.push(z); ys.push(y); lg.push(k); as.push(a);
  };
  const R = (k) => NET.roads[legs[k].road];
  // how each leg is trimmed at its ends for the turn into it and out of it: [start along, end along]
  const span = legs.map((l) => [l.a, l.b]);
  const joins = [];
  for (let k = 0; k + 1 < legs.length; k += 1) {
    const A = legs[k], B = legs[k + 1], ra = R(k), rb = R(k + 1);
    const paths = ra.axis === 'path' || rb.axis === 'path';
    const la = laneOf(ra, A.b), lb = laneOf(rb, B.a);
    if (!paths && ra.axis !== rb.axis) {
      // a corner: where the two sides meet (round a wider bend on the city's wide roads)
      const [cx, cz] = ra.axis === 'x' ? [rb.c - lb * B.dir, ra.c + la * A.dir] : [ra.c - la * A.dir, rb.c + lb * B.dir];
      const ai = alongOf(ra, cx, cz), aj = alongOf(rb, cx, cz);
      const most = ra.city || rb.city ? Math.max(TRAFFIC.turn, (la + lb) * 1.1) : TRAFFIC.turn;
      const r = Math.max(1.5, Math.min(most, Math.abs(ai - span[k][0]) * 0.8, Math.abs(B.b - aj) * 0.5));
      span[k][1] = ai - A.dir * r; span[k + 1][0] = aj + B.dir * r;
      joins.push({ kind: 'turn', cx, cz });
    } else if (!paths && A.dir === B.dir && Math.abs(la - lb) < 0.3) {
      joins.push({ kind: 'on' });
    } else if (!paths && A.dir !== B.dir) {
      // turned about: a half circle from its own side to the other, its far edge at the junction
      const rad = (la + lb) / 2;
      const u = A.b - A.dir * rad;
      span[k][1] = u; span[k + 1][0] = u;
      joins.push({ kind: 'about', u, rad });
    } else {
      // onto a slip road or off it, into a ring or out of it, from one lane to another: each trimmed back a little,
      // a smooth curve between (longer where the two run alongside, merging or parting)
      const square = Math.abs(wrap(headingOf(rb, B.dir, B.a) - headingOf(ra, A.dir, A.b))) > 0.6;
      const ring = !!(ra.ring || rb.ring);
      const trim = (r, other) => (r.axis === 'path' ? (r.ring && other.ring ? 0 : r.ring ? 2.5 : square ? 3 : 12) : square ? (ring ? 6 : 8) : 18);
      const lenA = Math.abs(span[k][1] - span[k][0]), lenB = Math.abs(B.b - B.a);
      span[k][1] = A.b - A.dir * Math.min(trim(ra, rb), lenA * 0.45);
      span[k + 1][0] = B.a + B.dir * Math.min(trim(rb, ra), lenB * 0.45);
      joins.push({ kind: 'link' });
    }
  }
  const latAt = (k, along) => {
    // out from the roadside on the first leg, in to it on the last
    const l = legs[k], road = R(k);
    if (road.axis === 'path') return 0;
    let lat = laneOf(road, along);
    if (k === 0 && fromLat !== null) { const u = Math.abs(along - l.a) / TRAFFIC.shift; lat = fromLat + (lat - fromLat) * smooth(u); }
    if (k === legs.length - 1 && toLat !== null) { const u = Math.abs(l.b - along) / TRAFFIC.shift; lat = toLat + (lat - toLat) * smooth(u); }
    return lat;
  };
  legs.forEach((l, k) => {
    const road = R(k);
    const [s0, s1] = span[k];
    const len = Math.abs(s1 - s0);
    // a straight run (or a slip road's own curve), finer where the car moves across the road (at its ends)
    const steps = Math.max(1, Math.ceil(len / 2));
    for (let i = 0; i <= steps; i += 1) {
      const along = s0 + ((s1 - s0) * i) / steps;
      const [x, z] = pointOf(road, along, latAt(k, along), l.dir);
      put(x, z, levelOf(road, along), k, along);
    }
    const j = joins[k];
    if (!j) return;
    const y = levelOf(road, s1);
    if (j.kind === 'turn') {
      const [x0, z0] = pointOf(road, s1, latAt(k, s1), l.dir);
      const nb = legs[k + 1], rb = R(k + 1);
      const [x2, z2] = pointOf(rb, span[k + 1][0], latAt(k + 1, span[k + 1][0]), nb.dir);
      for (let i = 1; i < 10; i += 1) {
        const t = i / 10, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
        put(a * x0 + b * j.cx + c * x2, a * z0 + b * j.cz + c * z2, y, k, s1);
      }
    } else if (j.kind === 'about') {
      const li = latAt(k, j.u), lj = latAt(k + 1, j.u);
      const rad = (li + lj) / 2, mid = (li - lj) / 2;
      for (let i = 1; i < 12; i += 1) {
        const th = (Math.PI * i) / 12;
        const [x, z] = pointOf(road, j.u + l.dir * rad * Math.sin(th), mid + rad * Math.cos(th), l.dir);
        put(x, z, y, k, s1);
      }
    } else if (j.kind === 'link') {
      const nb = legs[k + 1], rb = R(k + 1), a3 = span[k + 1][0];
      const [x0, z0] = pointOf(road, s1, latAt(k, s1), l.dir), h0 = headingOf(road, l.dir, s1);
      const [x3, z3] = pointOf(rb, a3, latAt(k + 1, a3), nb.dir), h3 = headingOf(rb, nb.dir, a3), y3 = levelOf(rb, a3);
      const L = Math.hypot(x3 - x0, z3 - z0), m = L * 0.38;
      const x1 = x0 + Math.sin(h0) * m, z1 = z0 + Math.cos(h0) * m, x2 = x3 - Math.sin(h3) * m, z2 = z3 - Math.cos(h3) * m;
      const n = Math.max(2, Math.ceil(L / 1.5));
      for (let i = 1; i < n; i += 1) {
        const t = i / n, u = 1 - t;
        const yy = Number.isFinite(y) && Number.isFinite(y3) ? y + (y3 - y) * t : Number.isFinite(y3) ? y3 : y;
        put(u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * z0 + 3 * u * u * t * z1 + 3 * u * t * t * z2 + t * t * t * z3, yy, k, s1);
      }
    }
  });
  // distances along it, and how fast each point may be taken: its bend, and its road
  const n = xs.length;
  const cum = new Float64Array(n), most = new Float32Array(n);
  for (let i = 1; i < n; i += 1) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
  for (let i = 0; i < n; i += 1) {
    let v = R(lg[i]).cruise;
    if (i > 0 && i < n - 1) {
      const h0 = Math.atan2(xs[i] - xs[i - 1], zs[i] - zs[i - 1]), h1 = Math.atan2(xs[i + 1] - xs[i], zs[i + 1] - zs[i]);
      const span2 = (cum[i + 1] - cum[i - 1]) / 2;
      const bend = Math.abs(wrap(h1 - h0)) / Math.max(0.3, span2);
      if (bend > 1e-4) v = Math.min(v, Math.sqrt(TRAFFIC.bend / bend));
    }
    most[i] = Math.max(2.2, v);
  }
  // the junctions it goes through: where along it it comes into each and is out of it again, and which way it goes
  // through (from which road, which way, to which): two cars going through the same way may follow each other in
  const junctions = [];
  for (let k = 0; k + 1 < legs.length; k += 1) {
    const node = legs[k].node;
    if (node < 0) continue;
    const N = NET.nodes[node];
    if (N.links.length < 2) continue;
    // (how far the junction reaches each way: in the town as far as its widest road, both ways; in the city, where a
    // narrow street may cross a wide avenue and the stop lines are just beyond each edge, each way as wide as the roads
    // across it, and no less than 8 m)
    let rx = 0, rz = 0;
    for (const ri of N.on.keys()) { const q = NET.roads[ri], h = q.w / 2 + 1; if (!N.city || q.axis !== 'x') rx = Math.max(rx, h); if (!N.city || q.axis !== 'z') rz = Math.max(rz, h); }
    if (N.city) { rx = Math.max(rx, 8); rz = Math.max(rz, 8); }
    let a = -1, b = -1;
    for (let i = 0; i < n; i += 1) {
      if (lg[i] !== k && lg[i] !== k + 1) continue;
      if (Math.abs(xs[i] - N.x) <= rx && Math.abs(zs[i] - N.z) <= rz) { if (a < 0) a = i; b = i; }
    }
    if (a < 0) continue;
    junctions.push({ node, enter: Math.max(0, cum[a] - 2), leave: cum[b] + 1, move: `${legs[k].road}:${legs[k].dir}>${legs[k + 1].road}:${legs[k + 1].dir}` });
  }
  return { xs, zs, ys, as, lg, cum, most, len: n ? cum[n - 1] : 0, legs, junctions };
}

// (for the tests: the way a car at (road, along, dir) would take to a place at the roadside, and a road's height)
export function trafficWay(from, stop) { const legs = legsTo(from, stop); return legs ? shapeWay(legs, null, null) : null; }
export const trafficLevel = (road, along) => levelOf(road, along);

// Two ways through a junction (each from one road, one way, to another: `move`, '2:1>3:-1'): do they cross, or come
// near enough that two cars on them at once would touch? (Worked out from the ways themselves, once for each pair.)
// Two cars going through the same way, or coming in by the same side, follow one another in instead.
const crossings = new Map();
function wayThrough(node, move) {
  const [inn, out] = move.split('>').map((m) => m.split(':').map(Number));
  const N = NET.nodes[node], ai = N.on.get(inn[0]), aj = N.on.get(out[0]);
  if (ai === undefined || aj === undefined) return [];
  const ri = NET.roads[inn[0]], ro = NET.roads[out[0]];
  const a0 = ri.axis === 'path' ? Math.max(0, ai - 25) : ai - inn[1] * 25, b1 = ro.axis === 'path' ? Math.min(ro.a1, aj + 25) : aj + out[1] * 25;
  const w = shapeWay([{ road: inn[0], dir: inn[1], a: a0, b: ai, node }, { road: out[0], dir: out[1], a: aj, b: b1, node: -1 }], null, null);
  let r = 0;
  for (const k of N.on.keys()) r = Math.max(r, NET.roads[k].w / 2 + 2);
  const pts = [];
  for (let k = 0; k < w.xs.length; k += 1) if (Math.abs(w.xs[k] - N.x) <= r && Math.abs(w.zs[k] - N.z) <= r) pts.push([w.xs[k], w.zs[k]]);
  // (and the half metres between its points, so that no crossing slips between two of them)
  const fine = [];
  for (let k = 0; k < pts.length; k += 1) { fine.push(pts[k]); if (k + 1 < pts.length) { const [x0, z0] = pts[k], [x1, z1] = pts[k + 1], n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.5); for (let i = 1; i < n; i += 1) fine.push([x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n]); } }
  return fine;
}
export function waysCross(node, a, b) {
  if (a === b) return false;
  if (a.split('>')[0] === b.split('>')[0]) return false;
  const key = a < b ? `${node}|${a}|${b}` : `${node}|${b}|${a}`;
  let v = crossings.get(key);
  if (v === undefined) {
    const pa = wayThrough(node, a), pb = wayThrough(node, b);
    v = pa.some(([x, z]) => pb.some(([u, w]) => Math.hypot(x - u, z - w) < 2.7));
    crossings.set(key, v);
  }
  return v;
}

// ------------------------------------------------------------- the traffic ---

export function createTraffic({ state, population, players, hub = {}, emit = () => {}, visitors = () => [] }) {
  const people = population.people;
  const drivers = people.filter((p) => p.job === 'motorist');
  if (!state.traffic || !Array.isArray(state.traffic.cars) || state.traffic.cars.length !== drivers.length || state.traffic.cars.some((c, n) => c.i !== drivers[n].index)) {
    state.traffic = {
      cars: drivers.map((p, n) => ({ n, i: p.index, model: TRAFFIC_MODELS[n % TRAFFIC_MODELS.length], mode: 'off', x: 0, z: 0, h: 0, v: 0, road: -1, along: 0, dir: 1, to: -1, d: 0, until: 0, trips: 0, takenBy: null, keptAt: 0, frozen: false, since: 0 })),
      taken: 0, returned: 0, trips: 0,
    };
  }
  const book = state.traffic;
  const cars = book.cars;
  const carOfPerson = new Map(cars.map((c) => [c.i, c.n]));
  const ways = new Map();                 // the way each car is on (not kept: made again from where it is)
  // who is in each junction now, going which way through it: a car going another way waits for them to be out of it
  // (not kept: worked out again from where everyone is)
  const claims = new Map();
  const claim = (node, n, move) => { let m = claims.get(node); if (!m) claims.set(node, (m = new Map())); m.set(n, move); };
  const real = () => state.real;

  const specOf = (c) => POWER_CARS[c.model] || POWER_CARS['grey-saloon'];
  // (in the city, where one road may run over another, where something is up or down matters)
  const nearCity = (x, z) => inBox(OGANIRU.bounds, x, z, 30);
  const heightAt = (ri, along) => { const y = levelOf(NET.roads[ri], along); return Number.isFinite(y) ? y : null; };
  const keptHeight = (at) => (nearCity(at.x, at.z) ? levelAt(at) : null);
  const onRoads = (c) => c.mode === 'drive' || c.mode === 'stop';
  const shown = (c) => onRoads(c) || c.mode === 'kept' || c.mode === 'returning';

  // A motorist's hours at the wheel on a day: most by day, some into the evening, a few through the night.
  function shiftOf(c, dayIndex) {
    const k = dayIndex * 7;
    const r = hash(c.i, k + 1), j = hash(c.i, k + 2), e = hash(c.i, k + 3);
    if (r < 0.58) return [(6.5 + j * 1.5) * 3600, (18.5 + e * 2.5) * 3600];
    if (r < 0.84) return [(13 + j * 3) * 3600, (22.5 + e * 2) * 3600];
    return [(18.5 + j * 2) * 3600, (27 + e * 1.5) * 3600];
  }
  function onShift(c, t) {
    const day = Math.floor(t / 86400), s = t - day * 86400;
    const [a, b] = shiftOf(c, day);
    if (s >= a && s < b) return true;
    const [, before] = shiftOf(c, day - 1);
    return s + 86400 < before;
  }

  const nearestPlayer = (x, z) => { let d = Infinity; for (const id of Object.keys(players)) { const q = players[id]; const g = Math.hypot(q.x - x, q.z - z); if (g < d) d = g; } return d; };
  const anyPlayers = () => Object.keys(players).length > 0;
  // a place at the roadside nobody else is standing at or making for
  const busy = () => {
    const out = new Set();
    for (const c of cars) if (c.to >= 0 && (onRoads(c))) out.add(c.to);
    // (and a place where a car already stands that is out of the town's hands: one taken and left there, one its owner
    // is coming for, a player's own car left there; no car of the town's is driven into it)
    const there = cars.filter((c) => c.mode === 'kept' || c.mode === 'returning' || c.mode === 'taken').map((c) => [c.x, c.z]);
    if (hub.ownCars && hub.ownCars.boxes) for (const b of hub.ownCars.boxes()) there.push([(b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2]);
    if (there.length) for (const st of NET.stops) if (there.some(([x, z]) => Math.hypot(x - st.x, z - st.z) < 5)) out.add(st.id);
    return out;
  };

  // Does the way to a place at the roadside go along the expressway (`R`: the ways from where the car is)?
  function alongExpressway(R, stop) {
    let t = NET.arcOf(stop.edge, stop.dir);
    if (t < 0 || !Number.isFinite(R.dist[t])) return false;
    for (let k = 0; t >= 0 && t !== R.S && k < 600; k += 1, t = R.prev[t]) if (NET.arcs[t].road === THROUGH.road) return true;
    return false;
  }
  // How near the way to a place at the roadside passes a player, along the junctions on it and the straight between
  // each two (`R`: the ways from where the car is, search()).
  const segment = (x, z, ax, az, bx, bz) => { const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez; const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2)) : 0; return Math.hypot(x - ax - ex * t, z - az - ez * t); };
  // (a player up on a flyover or the expressway, or down in its cutting, is passed only on their level: the street under
  // a player on the viaduct does not pass them)
  function passing(R, stop) {
    let t = NET.arcOf(stop.edge, stop.dir);
    if (t < 0 || !Number.isFinite(R.dist[t])) return Infinity;
    const ps = Object.values(players).map((q) => { const y = nearCity(q.x, q.z) ? levelAt(q) : 0; return { x: q.x, z: q.z, y, up: Math.abs(y) > 2 }; });
    const at = (n) => (Number.isFinite(n.y) ? n.y : 0);
    let best = Infinity;
    for (let k = 0; t >= 0 && t !== R.S && k < 600; k += 1, t = R.prev[t]) {
      const A = NET.nodes[NET.arcs[t].from], B = NET.nodes[NET.arcs[t].to], y = (at(A) + at(B)) / 2;
      for (const q of ps) { if (q.up && Math.abs(y - q.y) > 3) continue; const d = segment(q.x, q.z, A.x, A.z, B.x, B.z); if (d < best) best = d; }
    }
    return best;
  }

  // Where a car goes next: somewhere at the roadside a fair way off by the roads; while players are about, mostly
  // somewhere near one of them, where the town is being seen. (In the city, half of those a way past a player rather
  // than to one: its expressway, flyovers and slip roads, where nobody stops, are seen driven where the players are: 1
  // November 2026, a player by the expressway had waited ten minutes for a car on it.)
  function chooseStop(c, from) {
    const taken = busy();
    const near = anyPlayers() && hash(c.n * 13 + 5, c.trips) < 0.65;
    const past = near && !!from && !!NET.roads[from.road].city && hash(c.n * 7 + 11, c.trips) < 0.5;
    // (the ways on from where it is, as it may drive them: one way along the slip roads, turning about only where it may)
    const start = from ? startOf(from) : null;
    if (from && !start) return -1;
    const R = start ? search(start) : null;
    const someoneInCity = Object.values(players).some((q) => inCity(q.x, q.z));
    // (while a player is out in the city, one in five of the cars already in it drive the length of its expressway, from
    // the avenue by the interchange at one end to the avenue by the one at the other, as an expressway's through traffic
    // does: 1 November 2026, the expressway had been driven only by the few going across the whole city)
    if (from && NET.roads[from.road].city && c.n % 5 === 0 && someoneInCity) {
      const ends = c.x > -300 ? THROUGH.south : THROUGH.north;
      const k0 = Math.floor(hash(c.n * 17 + 3, c.trips) * ends.length);
      for (let k = 0; k < ends.length; k += 1) {
        const s = ends[(k0 + k) % ends.length];
        if (!taken.has(s.id) && s.id !== c.to && alongExpressway(R, s)) return s.id;
      }
    }
    // (no further than a fair drive in the town; from the city, across it: along its expressway, over its flyovers; and
    // from the town to a player out in the city, as far as that is)
    const farthest = from && (NET.roads[from.road].city || (near && someoneInCity)) ? TRAFFIC.cityFar : 1100;
    let best = -1, bestScore = Infinity;
    for (const s of NET.stops) {
      if (taken.has(s.id) || s.id === c.to) continue;
      let far = 0;
      if (from) {
        far = farTo(from, s, R);
        if (!Number.isFinite(far)) continue;
        if (far < 60 || far > farthest) continue;
      }
      // (a way past a player: the one passing nearest, give or take a little; to one: near one, give or take more)
      let score = hash(c.n * 31 + s.id, c.trips + 1) * (past ? 120 : 400);
      if (near) score += Math.min(600, past ? passing(R, s) : nearestPlayer(s.x, s.z));
      // (while nobody is out in the city, the town's cars keep to the town, where the players are, and those in the city
      // come back to it: 2 November 2026, with the city's roads joined to the town's, the town had fewer of its cars about
      // a player than before)
      if (!someoneInCity && NET.roads[s.road].city) score += CITY_EMPTY;
      if (score < bestScore) { bestScore = score; best = s.id; }
    }
    return best;
  }

  // The way a car is on: made from where it set out (`from`, kept with the town) to where it is going, so that a town
  // saved and opened again has every car on the very way it was on.
  function wayOf(c) {
    let w = ways.get(c.n);
    if (w) return w;
    if (c.to < 0) return null;
    const f = c.from || { road: c.road, along: c.along, dir: c.dir, lat: c.fromLat === undefined ? null : c.fromLat };
    const legs = legsTo({ road: f.road, along: f.along, dir: f.dir }, c.to);
    if (!legs) return null;
    w = shapeWay(legs, f.lat === undefined ? null : f.lat, NET.roads[NET.stops[c.to].road].kerb);
    ways.set(c.n, w);
    return w;
  }
  // sets out from where it stands (at the roadside, or in the road) for another place
  function setOff(c, fromKerb) {
    const at = c.road >= 0 ? { road: c.road, along: c.along, dir: c.dir } : placeOnRoads(c.x, c.z, c.h, Number.isFinite(c.y) ? c.y : NaN);
    if (!at) return false;
    c.road = at.road; c.along = at.along; c.dir = at.dir;
    const to = chooseStop(c, at);
    if (to < 0) return false;
    // (a way that cannot be made leaves it where it is, with the place it is standing at still its own)
    const was = c.to, wasFrom = c.from;
    c.to = to; c.d = 0;
    c.from = { road: c.road, along: c.along, dir: c.dir, lat: fromKerb ? NET.roads[c.road].kerb : null };
    ways.delete(c.n);
    if (!wayOf(c)) { c.to = was; c.from = wasFrom; ways.delete(c.n); return false; }
    c.trips += 1; book.trips += 1;
    c.mode = 'drive'; c.since = real(); c.waited = 0; c.booked = null; c.passing = null; c.side = 0;
    return true;
  }
  // onto the roads, at a place at the roadside out of every player's sight
  function comeOut(c) {
    const taken = busy();
    const someoneInCity = Object.values(players).some((q) => inCity(q.x, q.z));
    let best = null, bestScore = Infinity;
    for (const s of NET.stops) {
      if (taken.has(s.id)) continue;
      const d = nearestPlayer(s.x, s.z);
      if (d < TRAFFIC.apart) continue;
      const score = hash(c.n * 17 + s.id, c.trips) * 500 + (anyPlayers() ? Math.min(800, d) : 0) + (NET.roads[s.road].city && !someoneInCity ? CITY_EMPTY : 0);
      if (score < bestScore) { bestScore = score; best = s; }
    }
    if (!best) return false;
    Object.assign(c, { mode: 'stop', x: best.x, z: best.z, y: heightAt(best.road, best.s), h: best.h, v: 0, road: best.road, along: best.s, dir: best.dir, to: best.id, d: 0, until: real() + 2 + hash(c.n, c.trips + 7) * 30, since: real() });
    ways.delete(c.n);
    return true;
  }
  const goHome = (c) => { c.mode = 'off'; c.v = 0; c.to = -1; ways.delete(c.n); };

  // ------------------------------------------------------- one car, one step ---

  // what is in the road this step: [x, z, heading, half its width, half its length, speed, what]
  function obstaclesNow() {
    const out = [];
    // (each at its height where it is in the city, where one thing may be over another: what is on a flyover is not in
    // the way of what is under it)
    const yOf = (o) => (nearCity(o.x, o.z) ? levelAt(o) : undefined);
    for (const c of cars) if (shown(c)) { const s = specOf(c); out.push({ x: c.x, z: c.z, y: Number.isFinite(c.y) ? c.y : undefined, h: c.h, hw: s.width / 2, hl: s.length / 2, v: c.mode === 'drive' ? c.v : 0, car: c.n }); }
    for (const id of Object.keys(players)) {
      const q = players[id];
      const y = yOf(q);
      if (q.incar && q.pcar) { const s = POWER_CARS[q.pcar.id] || ROOMY; out.push({ x: q.pcar.x, z: q.pcar.z, y, h: q.pcar.h, hw: s.width / 2, hl: s.length / 2, v: Math.max(0, (q.pcar.drive && q.pcar.drive.speed) || 0), player: q.id }); }
      else if (q.astride !== null && q.astride !== undefined) out.push({ x: q.x, z: q.z, y, h: q.heading || 0, hw: 0.45, hl: 1.1, v: 0, player: q.id });
      else if (q.driving) out.push({ x: q.x, z: q.z, y, h: q.heading || 0, hw: 0.8, hl: 1.5, v: 0, player: q.id });
      else if (!q.carried) out.push({ x: q.x, z: q.z, y, h: 0, hw: 0.4, hl: 0.4, v: 0, player: q.id, foot: true });
      const parked = q.carParked && typeof q.carParked === 'object' ? q.carParked : {};
      for (const [id2, s2] of Object.entries(parked)) { const s = POWER_CARS[id2]; if (s) out.push({ x: s2.x, z: s2.z, y: nearCity(s2.x, s2.z) && Number.isFinite(s2.y) ? s2.y : undefined, h: s2.h, hw: s.width / 2, hl: s.length / 2, v: 0 }); }
    }
    if (hub.vehicles && hub.vehicles.all) for (const v of hub.vehicles.all()) if (!v.driver) out.push({ x: v.x, z: v.z, y: yOf(v), h: v.heading || 0, hw: 0.8, hl: 1.5, v: 0 });
    // players in other copies of the town, seen through the network (talk.js): on foot, or in what they drive
    for (const v of visitors()) {
      if (v.held || v.swimming) continue;
      const car = v.car && POWER_CARS[v.car.car];
      const y = nearCity(v.x, v.z) && Number.isFinite(v.y) ? v.y : undefined;
      if (car) out.push({ x: v.x, z: v.z, y, h: v.heading || 0, hw: car.width / 2, hl: car.length / 2, v: Math.max(0, v.car.speed || 0), player: v.id });
      else if (v.ride) out.push({ x: v.x, z: v.z, y, h: v.heading || 0, hw: 0.45, hl: 1.1, v: 0, player: v.id });
      else if (v.vehicle) out.push({ x: v.x, z: v.z, y, h: v.heading || 0, hw: 0.8, hl: 1.5, v: 0, player: v.id });
      else out.push({ x: v.x, z: v.z, y, h: 0, hw: 0.4, hl: 0.4, v: 0, player: v.id, foot: true });
    }
    // the town's people on their bicycles, skateboards and skates (sport-riders.js)
    if (hub.sportRiders) for (const o of hub.sportRiders.obstacles()) out.push(o);
    // and the ambulance, wherever it is (care.js)
    if (hub.care && hub.care.box) { const b = hub.care.box(), along = b.x1 - b.x0 > b.z1 - b.z0; out.push({ x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2, h: along ? Math.PI / 2 : 0, hw: (along ? b.z1 - b.z0 : b.x1 - b.x0) / 2, hl: (along ? b.x1 - b.x0 : b.z1 - b.z0) / 2, v: 0 }); }
    return out;
  }

  // How far ahead (bumper to bumper) the nearest thing in this car's way is, along the way it is going (round a
  // corner, the way round it, not straight on), and how fast that thing goes the same way. `shift`: as if the car kept
  // that far to the left of its way (going round something, below); `skip`: something not to count; `look`: how far.
  function ahead(c, w, obstacles, shift = 0, skip = null, look = TRAFFIC.look, until = Infinity) {
    const s = specOf(c), half = s.width / 2;
    const front = c.d + s.length / 2;
    let gap = Infinity, speed = 0, foot = null, car = -1, hit = null, left = 0, wide = 0, long = 0;
    const near2 = [];
    for (const o of obstacles) {
      if (o.car === c.n || o === skip) continue;
      if (Math.abs(o.x - c.x) > look + 9 || Math.abs(o.z - c.z) > look + 9) continue;
      near2.push(o);
    }
    const out = () => ({ gap, speed, foot, car, o: hit, left, wide, long });
    if (!near2.length) return out();
    const n = w.xs.length;
    for (let k = Math.max(0, indexAt(w, front) - 1); k < n; k += 1) {
      const sk = w.cum[k];
      if (sk - front > look) break;
      const k2 = k + 1 < n ? k + 1 : k, k1 = k + 1 < n ? k : k - 1;
      const dl = Math.hypot(w.xs[k2] - w.xs[k1], w.zs[k2] - w.zs[k1]) || 1;
      const ux = (w.xs[k2] - w.xs[k1]) / dl, uz = (w.zs[k2] - w.zs[k1]) / dl;
      const ph = Math.atan2(ux, uz);
      const step = k + 1 < n ? w.cum[k + 1] - sk : 1;
      // (the car's left, of this stretch of its way: (cos h, -sin h))
      const sh = sk <= until ? shift : 0;
      const px = w.xs[k] + uz * sh, pz = w.zs[k] - ux * sh;
      const wy = w.ys[k];
      for (const o of near2) {
        if (Number.isFinite(o.y) && Number.isFinite(wy) && Math.abs(o.y - wy) > 2.5) continue;
        const dx = o.x - px, dz = o.z - pz;
        const along = dx * ux + dz * uz;
        const turned = o.h - ph, ca = Math.abs(Math.cos(turned)), sa = Math.abs(Math.sin(turned));
        const reachAcross = ca * o.hw + sa * o.hl, reachAlong = ca * o.hl + sa * o.hw;
        if (along < -reachAlong - 0.5 || along > step + reachAlong) continue;
        const side = dx * uz - dz * ux;
        // (someone walking: as near as passes them by a hand's breadth)
        if (Math.abs(side) > half + reachAcross + (o.walker !== undefined ? 0.08 : 0.25)) continue;
        let g = sk + along - reachAlong - front;
        // beside or behind it: not in its way; level with it but its middle further on (they have run into each
        // other): it waits for that one to go on
        if (g < -1.2) { if ((o.x - c.x) * Math.sin(c.h) + (o.z - c.z) * Math.cos(c.h) <= 0.3) continue; g = 0; }
        if (g < gap) { gap = g; speed = Math.max(0, o.v * Math.cos(turned)); foot = o.foot ? o.player : null; car = o.car === undefined ? -1 : o.car; hit = o; left = side + sh; wide = reachAcross; long = reachAlong; }
      }
      if (gap < sk - front) break;            // nothing further on can be nearer
    }
    return out();
  }

  const near = (c) => nearestPlayer(c.x, c.z);

  // The town's people near the front of a car near a player (nobody else is there to see), as things in its way:
  // those it is coming up to are asked to step aside (impact.js, with the traffic's own dice); whoever is still in the
  // road it stops for, as for anyone on foot, and goes round them if they stay there.
  const peopleSeen = new Map();
  function peopleNear(c, t) {
    if (!hub.impact || !hub.impact.makeWay || near(c) > TRAFFIC.near) return [];
    // (nobody of the town's walks on a flyover, the expressway's viaduct or down in its cutting)
    if (Number.isFinite(c.y) && Math.abs(c.y) > 2) return [];
    const kept = peopleSeen.get(c.n);
    if (kept && real() - kept.at < 0.2 && real() >= kept.at) return kept.list;
    const s = specOf(c);
    const ux = Math.sin(c.h), uz = Math.cos(c.h);
    const fx = c.x + ux * s.length / 2, fz = c.z + uz * s.length / 2;
    const rows = population.within(`traffic:${c.n}`, fx, fz, 18, t, real());
    const list = [], inWay = [];
    for (const row of rows) {
      const [i, px, pz, pose] = row;
      if (pose === POSE.hidden || pose === POSE.ride) continue;
      list.push({ x: px, z: pz, h: 0, hw: 0.28, hl: 0.28, v: 0, walker: i });
      const along = (px - fx) * ux + (pz - fz) * uz;
      const across = Math.abs((px - fx) * uz - (pz - fz) * ux);
      if (along > -0.5 && along < 14 && across < s.width / 2 + 0.7) inWay.push(row);
    }
    if (inWay.length) hub.impact.makeWay(inWay, fx, fz, ux, uz, Math.max(c.v, 2), s.width / 2 + 0.6, { chance: () => hash(c.n * 977 + Math.floor(real() * 4), (c.asked = (c.asked || 0) + 1)), pace: 2.4, react: false });
    peopleSeen.set(c.n, { at: real(), list });
    return list;
  }

  // the lights on Market Road (atani-city.js), and the city's at its junctions (zones/oganiru.js): how far ahead the
  // stop line is, if this car must stop at it (none over a junction, on its flyover)
  function lightAhead(c, w, front) {
    const town = inBox(CITY_AREA, c.x, c.z, 45);
    if (!town && !inBox(OGANIRU.bounds, c.x, c.z, 40)) return Infinity;
    const hold = town ? (x0, z0, x1, z1) => trafficHold(x0, z0, x1, z1, real()) : (x0, z0, x1, z1) => oganiruHold(x0, z0, x1, z1, real(), signalState);
    const at = (d) => { const k = indexAt(w, d); const f = (d - w.cum[k]) / Math.max(1e-6, w.cum[k + 1] - w.cum[k]); return [w.xs[k] + (w.xs[k + 1] - w.xs[k]) * f, w.zs[k] + (w.zs[k + 1] - w.zs[k]) * f, w.ys[k]]; };
    const reach = town ? 26 : 36;
    for (let d = 0; d < reach && front + d + 1 < w.len; d += 1) {
      const [x0, z0, y0] = at(front + d), [x1, z1] = at(front + d + 1);
      if (!town && Number.isFinite(y0) && Math.abs(y0) > 1.5) continue;
      if (!hold(x0, z0, x1, z1)) continue;
      // (the line is somewhere in this metre: to a tenth of one)
      for (let e = 0; e < 1; e += 0.1) { const [a0, b0] = at(front + d + e), [a1, b1] = at(front + d + e + 0.1); if (hold(a0, b0, a1, b1)) return d + e; }
      return d;
    }
    return Infinity;
  }

  function indexAt(w, d) {
    const cum = w.cum;
    let a = 0, b = cum.length - 1;
    if (b <= 0) return 0;
    if (d >= cum[b]) return b - 1;
    while (b - a > 1) { const m = (a + b) >> 1; if (cum[m] <= d) a = m; else b = m; }
    return a;
  }
  function placeAt(c, w, d) {
    const k = indexAt(w, d);
    const span = w.cum[k + 1] - w.cum[k] || 1;
    const f = Math.max(0, Math.min(1, (d - w.cum[k]) / span));
    c.x = w.xs[k] + (w.xs[k + 1] - w.xs[k]) * f;
    c.z = w.zs[k] + (w.zs[k + 1] - w.zs[k]) * f;
    // facing along the way, a little either side of here (a car does not swing round at a point)
    const a = indexAt(w, Math.max(0, d - 1.2)), b = Math.min(w.xs.length - 1, indexAt(w, Math.min(w.len, d + 1.2)) + 1);
    const h = Math.atan2(w.xs[b] - w.xs[a], w.zs[b] - w.zs[a]);
    const turn = wrap(h - c.h);
    c.steer = Math.max(-0.6, Math.min(0.6, -Math.atan2(2.8 * turn, Math.max(0.5, Math.hypot(w.xs[b] - w.xs[a], w.zs[b] - w.zs[a])))));
    c.h = h;
    const leg = w.legs[w.lg[k]], road = NET.roads[leg.road];
    c.road = leg.road; c.dir = leg.dir;
    const along = road.axis === 'path' ? (w.lg[k + 1] === w.lg[k] ? w.as[k] + (w.as[k + 1] - w.as[k]) * f : w.as[k]) : alongOf(road, c.x, c.z);
    c.along = Math.max(road.a0, Math.min(road.a1, along));
    // (its height: the city's road under it, its flyover, its slip road; in the town, its ground)
    const y0 = w.ys[k], y1 = w.ys[k + 1];
    const y = Number.isFinite(y0) ? (Number.isFinite(y1) ? y0 + (y1 - y0) * f : y0) : y1;
    c.y = Number.isFinite(y) ? y : null;
    // out to the left of its way while going round something, and back (no faster sideways than a car is steered)
    const want = c.passing ? c.passing.need : 0;
    const was = c.side || 0;
    if (want !== was) {
      const dt = c.dt || 0.05, move = Math.min(Math.abs(want - was), 1.6 * dt * Math.min(1, 0.3 + c.v / 3));
      c.side = was + Math.sign(want - was) * move;
      // (turned a little towards where it is going sideways: no more than a car's nose is, changing lanes)
      c.h -= Math.max(-0.25, Math.min(0.25, Math.atan2(Math.sign(want - was) * move / dt, Math.max(2, c.v))));
    }
    if (c.side) {
      // (never out over the road's edge going round something: no further to the right than its way goes, where that
      // is already at the kerb)
      let side = c.side;
      if (side < 0 && road.axis !== 'path') { const lat = wayLat(c, w, road), edge = road.w / 2 - specOf(c).width / 2 - 0.1; side = Math.max(side, Math.min(0, lat - edge)); }
      c.x += Math.cos(h) * side; c.z -= Math.sin(h) * side;
    }
  }
  // how far to the right of its road's middle the car's way runs where the car is (a slip road's: 0)
  function wayLat(c, w, road) {
    if (road.axis === 'path') return 0;
    const k = indexAt(w, c.d), f = Math.max(0, Math.min(1, (c.d - w.cum[k]) / (w.cum[k + 1] - w.cum[k] || 1)));
    const x = w.xs[k] + (w.xs[k + 1] - w.xs[k]) * f, z = w.zs[k] + (w.zs[k + 1] - w.zs[k]) * f;
    return road.axis === 'x' ? (z - road.c) * c.dir : -(x - road.c) * c.dir;
  }

  function drive(c, dt, obstacles, t, wet) {
    c.dt = dt;
    const w = wayOf(c);
    if (!w) { if (!setOff(c, false)) { c.v = 0; } return; }
    if (c.frozen) { c.v = 0; c.brake = 1; return; }
    const s = specOf(c);
    let why = '';
    // how fast it may go: its road, the bends coming, the end of its way
    const k0 = indexAt(w, c.d);
    let want = w.most[k0] * (wet ? 0.85 : 1);
    const reach = Math.max(45, (c.v * c.v) / (2 * TRAFFIC.brake) + 12);
    for (let k = k0 + 1; k < w.cum.length && w.cum[k] - c.d < reach; k += 1) want = Math.min(want, Math.sqrt(w.most[k] * w.most[k] + 2 * TRAFFIC.brake * (w.cum[k] - c.d)));
    want = Math.min(want, Math.sqrt(2 * TRAFFIC.brake * Math.max(0, w.len - c.d)) + 0.3);
    // a red light ahead (one it can still stop for)
    const line = lightAhead(c, w, c.d + s.length / 2);
    c.line = line < Infinity ? Math.round(line * 10) / 10 : -1;
    // (one it could not stop for any more, it goes on through: a light gone amber as it came to it)
    // (and however long the step, it is not taken past where it must stop: `upTo`, metres it may go this step)
    let upTo = Infinity;
    if (line < Infinity && !((c.v * c.v) / (2 * TRAFFIC.hard) > line + 0.05)) { const v = Math.sqrt(2 * TRAFFIC.brake * Math.max(0, line - 0.6)); upTo = Math.max(0, line - 0.6 - (c.v * c.v) / (2 * TRAFFIC.hard)); if (v < want) { want = v; why = 'light'; } }
    // whatever is in its way: it keeps its distance behind, and stops for anyone on foot
    const front = c.d + s.length / 2;
    // going round something standing in its way: as if its way were that far to the left until it is past it
    if (c.passing && c.d > c.passing.past) c.passing = null;
    const walkers = peopleNear(c, t);
    if (walkers.length) obstacles = obstacles.concat(walkers);
    // (going round something: what is ahead of it as far over as it has got, not as far as it is going: it does not
    // drive on into what it is going round before it is clear of it)
    const over = c.passing ? Math.sign(c.passing.need) * Math.min(Math.abs(c.side || 0), Math.abs(c.passing.need)) : 0;
    const way = ahead(c, w, obstacles, over, null, Math.max(TRAFFIC.look, (c.v * c.v) / (2 * TRAFFIC.brake) + 12), c.passing ? c.passing.past + s.length / 2 : Infinity);
    const ghost = real() < (c.ghostUntil || 0);
    // (a junction it has asked for, while the car in front of it, short of the junction, waits for that very junction:
    // where two roads join into one, their ways come together a little before the junction, and a car from the other
    // road can be in front of it there; it lets the junction go to that one, or each would wait for the other for ever.
    // 1 November 2026: at the foot of the Harmony Flyover, the cars down it and those along the road beside it, for good)
    if (c.booked && way.car >= 0 && way.gap < c.booked.enter - front) {
      const o = cars[way.car];
      if (o && o.why === 'junction' && o.nextJunction && o.nextJunction.node === c.booked.node) c.booked = null;
    }
    // a junction: taken one way through it at a time. A car coming up to one asks for it a little before it must decide
    // whether to stop (nothing else between it and the junction): if nobody is going through it, or only the same way,
    // it is the car's until it is out of it (`booked`); if someone is going through another way, it waits short of it.
    const next = w.junctions.find((j) => j.enter > front - 0.01 && !(c.booked && c.booked.node === j.node && c.booked.enter === j.enter));
    // (not while a red light stands between it and the junction: it asks when the light lets it go; one it had asked for
    // with a red light come up before it, it lets go)
    const redBefore = (j) => !!j && line < Infinity && upTo < Infinity && line < j.enter - front + 1;
    if (c.booked && redBefore(c.booked)) c.booked = null;
    const redFirst = redBefore(next);
    if (next && !redFirst && next.enter - front < (c.v * c.v) / (2 * TRAFFIC.brake) + 5 && !(way.gap < next.enter - front)) {
      const inside = claims.get(next.node);
      let other = false;
      if (inside) for (const [m, move] of inside) if (m !== c.n && waysCross(next.node, move, next.move)) { other = true; break; }
      if (!other && (!c.booked || c.d - s.length / 2 > c.booked.leave)) { c.booked = { node: next.node, move: next.move, enter: next.enter, leave: next.leave }; claim(next.node, c.n, next.move); }
      else if (other) { const v = Math.sqrt(2 * TRAFFIC.brake * Math.max(0, next.enter - front - 0.4)); upTo = Math.min(upTo, Math.max(0, next.enter - front - 0.4)); if (v < want) { want = v; why = 'junction'; } }
    }
    c.nextJunction = next || null;
    // nor into a junction it could not get out of: something standing on its way just beyond it
    if (next && way.gap < Infinity && way.speed < 0.5 && !ghost && next.enter - front > 0.3 && next.enter - front < (c.v * c.v) / (2 * TRAFFIC.brake) + 6 && way.gap < next.leave - front + s.length + TRAFFIC.gap && way.gap > next.enter - front) {
      const v = Math.sqrt(2 * TRAFFIC.brake * Math.max(0, next.enter - front - 0.4));
      if (v < want) { want = v; why = 'box'; }
    }
    // Something standing in its way that is not going to move off (someone on foot in the road, a car left there,
    // a car stopped at the roadside half in the road): a few seconds' wait, then round it, on whichever side takes the
    // car less far from its way (on the left, across the middle of the road, only with the other side clear well
    // ahead); back to its own side once past it.
    const standing = way.o && way.speed < 0.3 && !(way.car >= 0 && cars[way.car].mode === 'drive') && way.gap < 14;
    if (standing && c.v < 1 && !c.passing) {
      c.facing = (c.facing || 0) + dt;
      const road = NET.roads[c.road];
      if (c.facing > 2 && road) {
        const room = s.width / 2 + way.wide + 0.4;
        // (across the middle of the road onto the other side, but not over a middle strip, the expressway's barrier, a
        // flyover's: there only within its own side)
        // (from where its way has it across the road now: its lane, or nearer the kerb pulling in or out)
        const lane = wayLat(c, w, road);
        const most = road.inner === null || road.inner === undefined ? lane + road.w / 2 - s.width / 2 - 0.3 : lane - road.inner - s.width / 2 - 0.2;
        const least = -(road.w / 2 - lane - s.width / 2 - 0.2);
        const sides = [way.left + room, way.left - room].filter((v) => v <= most && v >= least).sort((a, b) => Math.abs(a) - Math.abs(b));
        const past = c.d + way.gap + way.long * 2 + s.length + 1.5;
        // (never round on the left into a junction, or just short of one: on the wrong side there it would be in the way
        // of whoever comes out of it, and wait for them as they wait for it)
        const junctionNear = w.junctions.some((j) => j.leave > front - 1 && j.enter < past + 8);
        for (const need of sides) {
          if (need > 0.5 && junctionNear) continue;
          // (round on the left: nothing coming for a good way; on the right, along the kerb: nothing there)
          const clear = ahead(c, w, obstacles, need, way.o, need > 0.5 ? 70 : past - c.d + 4, need > 0.5 ? Infinity : past + 2);
          if (clear.gap > past - front + (need > 0.5 ? 30 : 1)) { c.passing = { need, past }; c.facing = 0; book.passed = (book.passed || 0) + 1; break; }
        }
      }
    } else if (!standing) c.facing = 0;
    let blocked = false;
    if (way.gap < Infinity && !ghost) {
      const room = way.gap - TRAFFIC.gap;
      const allowed = room <= 0 ? 0 : way.speed * 0.9 + Math.sqrt(2 * TRAFFIC.brake * room);
      if (allowed < want) { want = allowed; blocked = allowed < 0.3; why = way.foot ? 'player' : way.o && way.o.walker !== undefined ? 'people' : 'ahead'; }
      // at someone on foot standing in front, a sound of the horn now and then
      if ((way.foot || (way.o && way.o.walker !== undefined)) && way.gap < 7 && c.v < 1.5 && real() - (c.hornAt || -1e9) > 6) c.hornAt = real();
    }
    c.why = why;
    // gathering speed, or losing it
    const before = c.v;
    c.v = want < c.v ? Math.max(want, c.v - TRAFFIC.hard * dt) : Math.min(want, c.v + TRAFFIC.accel * dt);
    c.brake = c.v < before - 0.02 || (c.v < 0.05 && want < 0.05) ? 1 : 0;
    c.held = line < Infinity && c.v < 0.3;
    // (one of the town's riders standing just ahead in its way, that it is waiting for: the rider gives way to it,
    // sport-riders.js)
    c.waitRider = way.o && way.o.rider !== undefined && way.gap < 6 && c.v < 0.3 ? way.o.rider : -1;
    // two cars each in the other's way (one turning across the other where they met): the one with the higher
    // number goes through, for a moment, rather than both waiting for ever
    c.blockedBy = blocked && way.car >= 0 ? way.car : -1;
    if (blocked && way.car >= 0 && cars[way.car].blockedBy === c.n && c.n > way.car && (c.waited || 0) > 4) { c.ghostUntil = real() + 3; book.ghosts = (book.ghosts || 0) + 1; c.waited = 0; }
    // (how long it has stood waiting, for the tests: a car waits as long as it must; it does not turn about in the road)
    if (blocked && c.v < 0.05 && !c.held) c.waited = (c.waited || 0) + dt; else c.waited = 0;
    if (way.gap < Infinity && !ghost) upTo = Math.min(upTo, Math.max(0, way.gap - TRAFFIC.gap * 0.6));
    const go = Math.min(c.v * dt, upTo);
    if (go < c.v * dt - 1e-6) c.v = dt > 0 ? Math.min(c.v, go / dt) : 0;
    c.d = Math.min(w.len, c.d + go);
    placeAt(c, w, c.d);
    // into a junction: it is theirs to go through until they are out of it (the next car to look sees them in it)
    for (const j of w.junctions) if (c.d + s.length / 2 >= j.enter && c.d - s.length / 2 <= j.leave) claim(j.node, c.n, j.move);
    if (c.booked && c.d - s.length / 2 > c.booked.leave) c.booked = null;
    if (c.d >= w.len - 0.05) arrive(c);
  }

  function arrive(c) {
    const stop = NET.stops[c.to];
    c.mode = 'stop'; c.v = 0; c.brake = 0; c.passing = null; c.side = 0; c.booked = null;
    if (stop) { c.x = stop.x; c.z = stop.z; c.h = stop.h; c.road = stop.road; c.along = stop.s; c.dir = stop.dir; c.y = heightAt(stop.road, stop.s); }
    c.until = real() + TRAFFIC.stand[0] + hash(c.n * 7, c.trips) * (TRAFFIC.stand[1] - TRAFFIC.stand[0]);
    c.since = real();
    ways.delete(c.n);
  }

  // ------------------------------------------------------- taken, and returned ---

  // May this car be taken, as far as it and its driver go? (Only standing still, with its driver at the wheel.)
  function seizable(n) {
    const c = cars[n];
    if (!c || !shown(c)) return { ok: false, code: 'NO_CAR', reason: 'There is no car there.' };
    if (c.mode === 'kept' || c.mode === 'returning' || c.frozen) return { ok: false, code: 'BUSY', reason: 'Somebody already has that car.' };
    if (c.v > 0.6) return { ok: false, code: 'MOVING', reason: 'It is moving. Wait until it stops.' };
    return { ok: true, x: c.x, z: c.z, y: Number.isFinite(c.y) ? c.y : undefined, h: c.h, model: c.model, person: c.i };
  }
  function freeze(n, on) { const c = cars[n]; if (c) { c.frozen = !!on; if (on) c.v = 0; } }
  // The driver is out and the player is at the wheel.
  function take(n, player) {
    const c = cars[n];
    c.frozen = false; c.mode = 'taken'; c.takenBy = player.id; c.v = 0; c.to = -1; c.since = real();
    ways.delete(c.n);
    book.taken += 1;
    return { person: c.i, model: c.model, x: c.x, z: c.z, h: c.h };
  }
  // The thief has got out (own-cars.js, `leave`): it stands where it was left, theirs to come back to and nobody
  // else's. More than they may hold: the first they left is found by its owner.
  function leftBy(player, n, at) {
    const c = cars[n];
    if (!c || c.takenBy !== player.id) return;
    c.mode = 'kept'; c.x = at.x; c.z = at.z; c.h = at.h; c.v = 0; c.keptAt = real(); c.y = keptHeight(at);
    const kept = cars.filter((o) => o.mode === 'kept' && o.takenBy === player.id).sort((a, b) => a.keptAt - b.keptAt);
    while (kept.length > TRAFFIC.most) {
      const first = kept.shift();
      giveBack(first);
      emit(player.id, { type: 'note', text: `${people[first.i].first} has found the ${specOf(first).name} you took, and has it back.` });
    }
  }
  // Back into one they took and left: from beside it.
  function enter(player, n) {
    const c = cars[n];
    if (!c || c.mode !== 'kept' || c.takenBy !== player.id) throw new GameError('NOT_YOURS', 'That car is not yours.');
    if (player.fight) throw new GameError('FIGHTING', 'Not in the middle of a fight.');
    const s = specOf(c);
    if (Math.hypot(player.x - c.x, player.z - c.z) > s.length / 2 + 2.5) throw new GameError('TOO_FAR', 'Walk up to the car.');
    c.mode = 'taken'; c.since = real();
    return { model: c.model, x: c.x, z: c.z, h: c.h, n, y: Number.isFinite(c.y) ? c.y : undefined };
  }
  // Where the thief's car is as they drive it (own-cars.js keeps it; here it is only remembered).
  function moved(n, at) { const c = cars[n]; if (c && c.mode === 'taken') { c.x = at.x; c.z = at.z; c.h = at.h; c.y = keptHeight(at); } }
  function giveBack(c) {
    c.mode = 'returning'; c.takenBy = null; c.since = real(); c.frozen = false; c.v = 0; c.walking = 0;
    book.returned += 1;
  }
  // Caught by the police: every car this player has taken goes back to its owner. Gives how many.
  function recover(playerId) {
    let count = 0;
    for (const c of cars) if (c.takenBy === playerId && (c.mode === 'kept' || c.mode === 'taken')) { giveBack(c); count += 1; }
    return count;
  }
  const keptBy = (playerId) => cars.filter((c) => c.takenBy === playerId && (c.mode === 'kept' || c.mode === 'taken')).map((c) => ({ n: c.n, model: c.model, x: Math.round(c.x * 100) / 100, z: Math.round(c.z * 100) / 100, h: Math.round(c.h * 1000) / 1000, driving: c.mode === 'taken' }));

  // A car given back: its owner walks to it, gets in, and is on their way (one still running from the thief turns
  // and goes for it). Where they cannot come for it (indoors), or it takes them too long, it is fetched, out of every
  // player's sight.
  function returning(c, t) {
    const actors = hub.actors;
    const owner = c.i;
    // (sent for it: no longer someone who backed away from trouble, to be let go back to their day after a while)
    const sendFor = () => { actors.walkTo(owner, c.x, c.z, 1.9, 'Going for the car'); const sent = actors.get(owner); if (sent) sent.after = 0; c.walking = real(); };
    if (actors) {
      if (!actors.has(owner)) {
        if (real() - (c.tried || -1e9) > 4) { c.tried = real(); if (actors.take(owner, t)) sendFor(); }
      } else if (!c.walking && !actors.dead(owner)) sendFor();
    }
    const m = actors && actors.get(owner);
    if (m && c.walking) {
      if (Math.hypot(m.x - c.x, m.z - c.z) < specOf(c).width / 2 + 1.2) {
        actors.drop(owner);
        c.walking = 0;
        const at = placeOnRoads(c.x, c.z, c.h, Number.isFinite(c.y) ? c.y : NaN);
        Object.assign(c, { mode: 'stop', v: 0, to: -1, until: real() + 4, since: real(), road: at ? at.road : -1, along: at ? at.along : 0, dir: at ? at.dir : 1, fromLat: undefined });
        return;
      }
      // (stopped short of it, or let go back to their day by something else: sent for it again)
      if (real() - c.walking > 4 && (m.mode !== 'go' || m.home)) sendFor();
    }
    if (((!m || !c.walking) && real() - c.since > 20) || real() - c.since > 240) {
      if (near(c) > TRAFFIC.apart) { if (m) actors.release(owner); c.walking = 0; goHome(c); }
    }
  }

  // ----------------------------------------------------------------- the clock ---

  function tick(dt, t, realNow, wet) {
    if (dt <= 0) return;
    const obstacles = obstaclesNow();
    claims.clear();
    for (const c of cars) {
      if (c.mode !== 'drive') { c.booked = null; continue; }
      const w = ways.get(c.n);
      if (!w) continue;
      const half = specOf(c).length / 2;
      for (const j of w.junctions) if (c.d + half >= j.enter && c.d - half <= j.leave) claim(j.node, c.n, j.move);
      if (c.booked) claim(c.booked.node, c.n, c.booked.move);
    }
    for (const c of cars) {
      if (c.mode === 'taken' || c.mode === 'kept') continue;
      if (c.mode === 'returning') { returning(c, t); continue; }
      const person = people[c.i];
      const free = hub.actors ? !hub.actors.has(c.i) : true;
      const due = onShift(c, t) && free && !(person && person.gone);
      if (c.mode === 'off') { if (due && anyPlayers()) comeOut(c); continue; }
      if (c.mode === 'stop') {
        c.v = 0; c.brake = 0;
        if (c.frozen) continue;
        if (!due) { if (near(c) > TRAFFIC.apart) goHome(c); else if (realNow >= c.until) setOff(c, true); continue; }
        if (realNow < c.until) continue;
        // pulling out: not across something coming up behind
        // (anything coming up behind on its side of the road, or a car of the town's there that may move off)
        const back = obstacles.some((o) => o.car !== c.n && (o.v > 0.2 || Math.hypot(o.x - c.x, o.z - c.z) < 9 || (o.car !== undefined && cars[o.car].mode === 'drive')) && Math.hypot(o.x - c.x, o.z - c.z) < 40 && Math.cos(o.h - c.h) > 0.7 && ((c.x - o.x) * Math.sin(o.h) + (c.z - o.z) * Math.cos(o.h)) > -(o.hl + specOf(c).length / 2 + 1.5));
        if (!back) setOff(c, true);
        continue;
      }
      if (c.mode === 'drive') drive(c, dt, obstacles, t, wet);
    }
  }

  // Tells the population where a motorist is while at the wheel: in the car, not to be seen.
  function locate(i, t, out) {
    const n = carOfPerson.get(i);
    if (n === undefined) return false;
    const c = cars[n];
    if (!onRoads(c)) return false;
    out.x = c.x; out.z = c.z; out.h = c.h; out.pose = POSE.hidden; out.moving = c.v > 0.1; out.spot = people[i].homeSpot; out.leg = null;
    out.act = c.mode === 'stop' ? 'Sitting in the car' : 'Driving';
    return true;
  }
  population.setHook(locate);

  // What can be seen of the traffic from a point.
  function list(x, z, viewerId) {
    const out = [];
    for (const c of cars) {
      if (!shown(c) || Math.abs(c.x - x) > 330 || Math.abs(c.z - z) > 330) continue;
      const r = (v, k = 100) => Math.round(v * k) / k;
      out.push({ n: c.n, model: c.model, person: onRoads(c) ? c.i : null, x: r(c.x), z: r(c.z), y: Number.isFinite(c.y) ? r(c.y) : undefined, h: r(c.h, 1000), speed: r(c.mode === 'drive' ? c.v : 0, 10), steer: r(c.steer || 0), brake: c.brake ? 1 : 0, held: !!c.held,
        mode: c.mode, mine: c.takenBy !== null && c.takenBy === viewerId, stopped: onRoads(c) && !c.frozen && c.v <= 0.6, hornAgo: c.hornAt ? r(real() - c.hornAt, 10) : -1 });
    }
    return out;
  }

  // What stands in the way (of someone on foot, a player's car): every car near a player, as its own shape.
  let boxesAt = -1, boxesMade = [];
  function boxes() {
    if (boxesAt === real()) return boxesMade;
    boxesAt = real();
    boxesMade = [];
    const ps = Object.values(players);
    if (!ps.length) return boxesMade;
    for (const c of cars) {
      if (!shown(c)) continue;
      if (!ps.some((q) => Math.abs(q.x - c.x) < 70 && Math.abs(q.z - c.z) < 70)) continue;
      const made = carBoxes(specOf(c), c.x, c.z, c.h);
      if (Number.isFinite(c.y)) for (const b of made) boxesMade.push({ ...b, y: c.y }); else boxesMade.push(...made);
    }
    return boxesMade;
  }

  function audit() {
    const by = {};
    for (const c of cars) by[c.mode] = (by[c.mode] || 0) + 1;
    return { cars: cars.length, modes: by, trips: book.trips, taken: book.taken, returned: book.returned, ghosts: book.ghosts || 0, passed: book.passed || 0, stops: NET.stops.length, roads: NET.roads.length, junctions: NET.nodes.length };
  }

  const api = { tick, list, boxes, seizable, freeze, take, leftBy, enter, moved, recover, keptBy, audit, locate, cars, onShift, shiftOf, wayOf: (n) => ways.get(n) || null, network: NET,
    waitingFor: (rider) => cars.some((c) => c.mode === 'drive' && c.waitRider === rider),
    // (for the tests: who is going through which junction now)
    claims: () => [...claims].map(([node, m]) => [node, [...m]]) };
  hub.traffic = api;
  return api;
}
