// Oganiru City's traffic (the owner's brief of 31 October 2026, Stage 2, 1 November: "The town's cars drive the new
// roads, flyovers and ramps (faster on the expressway), stop at lights, merge on slip roads. Watch a whole town day: no
// car stuck.").
//   node --test test/oganiru-traffic.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { town } from './world.mjs';
import { TRAFFIC_ROADS, TRAFFIC_STOPS, trafficNetwork, trafficWay, trafficLevel } from '../src/sim/traffic.js';
import { POWER_CARS } from '../src/sim/power-cars.js';
import { OGANIRU_TRAFFIC, OGANIRU_STOP_LINES, OGANIRU_ROUNDABOUTS, OGANIRU_DECKS, OGANIRU_SOLIDS, OGANIRU_LAMPS, OGANIRU_KERBED, oganiruTar, oganiruDecksAt, zoneSurfaceY, signalState } from '../src/sim/zone.js';
import { createHost } from '../src/sim/host.js';

const N = trafficNetwork();
const roadIndex = (id) => TRAFFIC_ROADS.findIndex((r) => r.id === id);
const nodeOf = (id, along) => N.nodes.findIndex((n) => n.on.has(roadIndex(id)) && Math.abs(n.on.get(roadIndex(id)) - along) < 1);
// a place at the roadside on a road, going its way, nearest a point along it
const stopOn = (id, dir, along) => TRAFFIC_STOPS.filter((s) => TRAFFIC_ROADS[s.road].id === id && s.dir === dir).sort((a, b) => Math.abs(a.s - along) - Math.abs(b.s - along))[0];
const roadsOf = (w) => new Set(w.legs.map((l) => TRAFFIC_ROADS[l.road].id));
// the way's height where it passes a point
const yNear = (w, x, z) => { let best = Infinity, y = NaN; for (let k = 0; k < w.xs.length; k += 1) { const d = Math.hypot(w.xs[k] - x, w.zs[k] - z); if (d < best) { best = d; y = w.ys[k]; } } return { y, d: best }; };

test('the city\'s roads are the traffic\'s: its avenues, boulevards and streets both ways, the flyovers over its junctions, the expressway down its cutting and up on its viaduct, every slip road and roundabout one way; joined to the town\'s roads; no junction where one road passes over another, and nowhere to turn about but at the junctions', () => {
  for (const r of OGANIRU_TRAFFIC) assert.ok(roadIndex(r.id) >= 0, `${r.id} is driven`);
  // joined to the town: College Road, Campus Road and the Kwale road go on into the city
  for (const [town, city] of [['college', 'unity-gate'], ['campus', 'campus-gate'], ['onitsha', 'kwale-on']]) {
    assert.ok(N.nodes.some((n) => n.on.has(roadIndex(town)) && n.on.has(roadIndex(city))), `${town} goes on into ${city}`);
  }
  // every road at a junction is at the junction's height (a flyover over a road, the viaduct over a street: no junction)
  for (const n of N.nodes) for (const [ri, a] of n.on) {
    const r = TRAFFIC_ROADS[ri];
    if (!r.city) continue;
    assert.ok(Math.abs(trafficLevel(r, a) - n.y) < 1.5, `${r.id} at ${a.toFixed(0)} is at its junction's height`);
  }
  // the slip roads and the rings one way; the expressway's north-bound start one way
  for (const A of N.arcs) { const r = TRAFFIC_ROADS[A.road]; if (r.axis === 'path' || r.oneway) assert.equal(A.dir, r.oneway || 1, `${r.id} one way`); }
  // nowhere to turn about on the expressway, a flyover, a slip road or a ring; in the city only at its junctions
  for (const n of N.nodes) {
    if (!n.uturn || !n.city) continue;
    for (const ri of n.on.keys()) { const r = TRAFFIC_ROADS[ri]; assert.ok(r.axis !== 'path' && !r.deck && !/^expressway/.test(r.id), `no turning about on ${r.id}`); }
  }
  // every junction reached from every other, as the cars may drive
  for (let a = 0; a < N.nodes.length; a += 1) for (let b = 0; b < N.nodes.length; b += 1) assert.ok(Number.isFinite(N.dist[a][b]), `junction ${a} to ${b}`);
  // places at the roadside in the city, on its avenues and streets only
  const city = TRAFFIC_STOPS.filter((s) => TRAFFIC_ROADS[s.road].city);
  assert.ok(city.length > 300, `${city.length} places at the city's roadside`);
  for (const s of city) assert.ok(TRAFFIC_ROADS[s.road].stops, `none on ${TRAFFIC_ROADS[s.road].id}`);
});

test('a car\'s way along Independence Boulevard goes up over Unity Avenue on its flyover and down again, another\'s along the avenue under it on the ground; from Harmony Avenue to Peace Avenue by the expressway, up its slip road, down through its cutting under the Hope bridge, up onto its viaduct and off at the Peace Interchange', () => {
  const over = trafficWay({ road: roadIndex('independence-2'), along: -500, dir: 1 }, stopOn('independence-3', 1, 450).id);
  assert.ok(over && roadsOf(over).has('independence-flyover'), 'over the flyover');
  const top = yNear(over, 0, -780 + 4.25);
  assert.ok(top.d < 1 && Math.abs(top.y - 7.5) < 0.05, `over Unity Avenue at ${top.y}`);
  const under = trafficWay({ road: roadIndex('unity'), along: -650, dir: -1 }, stopOn('unity', -1, -900).id);
  assert.ok(under && roadsOf(under).has('unity'), 'along the avenue');
  const low = yNear(under, 4.25, -780);
  assert.ok(low.d < 1 && Math.abs(low.y) < 0.05, `under the flyover at ${low.y}`);
  // (the two at the same point are more than a deck apart)
  assert.ok(top.y - low.y > 7);
  const far = trafficWay({ road: roadIndex('harmony-2'), along: -1520, dir: 1 }, stopOn('peace-2', 1, -1000).id);
  assert.ok(far, 'a way from Harmony Avenue to Peace Avenue');
  for (const id of ['h-eb-nb', 'expressway', 'p-nb-off']) assert.ok(roadsOf(far).has(id), `by ${id}: ${[...roadsOf(far)].join(', ')}`);
  const ys = far.ys.filter(Number.isFinite);
  assert.ok(Math.min(...ys) < -7.4 && Math.max(...ys) > 7.4, `down to ${Math.min(...ys).toFixed(1)}, up to ${Math.max(...ys).toFixed(1)}`);
  // every point of every way at the height of what is under it there
  for (const w of [over, under, far]) for (let k = 0; k < w.xs.length; k += 3) if (Number.isFinite(w.ys[k])) assert.ok(Math.abs(zoneSurfaceY(w.xs[k], w.zs[k], w.ys[k]) - w.ys[k]) < 0.3, `on what is under it at ${w.xs[k].toFixed(0)}, ${w.zs[k].toFixed(0)}`);
});

test('a whole town day, players about the city: the town\'s cars drive its roads, flyovers, slip roads and roundabouts, faster on the expressway; stop at its lights; on what is under them at their height, on their own side, never into each other; and no car stuck', () => {
  const w = town(['Ada Test', 'Bayo Test', 'Chidi Test', 'Dayo Test'], { hour: 6 });
  const T = w.I.traffic;
  const spots = [[0, -700], [0, -1130], [-1290, -1130], [720, -1130]];
  const corners = (c) => { const s = POWER_CARS[c.model]; const ux = Math.sin(c.h), uz = Math.cos(c.h), sx = Math.cos(c.h), sz = -Math.sin(c.h); const L = s.length / 2, W = s.width / 2; return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => [c.x + ux * L * a + sx * W * b, c.z + uz * L * a + sz * W * b]); };
  const overlap = (A, B) => { const pa = corners(A), pb = corners(B); for (const poly of [pa, pb]) for (let i = 0; i < 4; i += 1) { const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % 4]; const nx = -(z1 - z0), nz = x1 - x0; const a = pa.map(([x, z]) => x * nx + z * nz), b = pb.map(([x, z]) => x * nx + z * nz); if (Math.max(...a) < Math.min(...b) || Math.max(...b) < Math.min(...a)) return false; } return true; };
  const front = (c) => { const L = POWER_CARS[c.model].length / 2; return [c.x + Math.sin(c.h) * L, c.z + Math.cos(c.h) * L]; };
  const driven = new Map(), fastest = new Map(), still = new Map(), was = new Map();
  let samples = 0, offLevel = 0, red = 0, overlaps = 0, sideSamples = 0, wrongSide = 0, longest = 0, high = 0, low = 0;
  const trips = T.audit().trips;
  for (let s = 0; s < 24 * 120; s += 0.1) {
    for (const [k, p] of w.players.entries()) w.place(p, spots[k][0], spots[k][1]);
    w.host.tick(0.1);
    const now = w.g.state.real;
    const live = T.cars.filter((c) => c.mode === 'drive' || c.mode === 'stop');
    for (const c of live) {
      const road = TRAFFIC_ROADS[c.road];
      if (c.mode === 'drive') {
        // standing still on its way: no longer than the lights and the traffic keep it
        const at = still.get(c.n);
        if (!at || Math.hypot(at.x - c.x, at.z - c.z) > 1) still.set(c.n, { x: c.x, z: c.z, since: now });
        else longest = Math.max(longest, now - at.since);
      } else still.delete(c.n);
      if (!road || !road.city) { was.delete(c.n); continue; }
      samples += 1;
      driven.set(road.id, (driven.get(road.id) || 0) + 1);
      fastest.set(road.id, Math.max(fastest.get(road.id) || 0, c.v));
      if (c.y > 5) high += 1;
      if (c.y < -5) low += 1;
      if (!(Math.abs(zoneSurfaceY(c.x, c.z, c.y) - c.y) < 0.3)) offLevel += 1;
      if (c.mode === 'drive' && c.v > 4 && !c.side && road.axis !== 'path' && !N.nodes.some((n) => Math.hypot(n.x - c.x, n.z - c.z) < 30)) {
        sideSamples += 1;
        const right = road.axis === 'x' ? (c.z - road.c) * c.dir : -(c.x - road.c) * c.dir;
        if (right < (road.laneAt ? road.laneAt(Math.max(road.a0, Math.min(road.a1, c.along))) : road.lane) - 0.6) wrongSide += 1;
      }
      const [fx, fz] = front(c), last = was.get(c.n);
      if (last && c.mode === 'drive' && Math.abs(c.y) < 1.5) for (const L of OGANIRU_STOP_LINES) {
        const ns = L.way === 'n' || L.way === 's';
        if (ns ? Math.abs(fz - L.z) > L.half : Math.abs(fx - L.x) > L.half) continue;
        const a = ns ? last[0] : last[1], b = ns ? fx : fz, at = ns ? L.x : L.z;
        if ((L.way === 'n' || L.way === 'e' ? a <= at && b > at : a >= at && b < at) && signalState(L.phase, now + L.offset) === 'red') red += 1;
      }
      was.set(c.n, [fx, fz]);
    }
    for (let a = 0; a < live.length; a += 1) for (let b = a + 1; b < live.length; b += 1) {
      const A = live[a], B = live[b];
      if (Math.hypot(A.x - B.x, A.z - B.z) > 7 || (Number.isFinite(A.y) && Number.isFinite(B.y) && Math.abs(A.y - B.y) > 2.5)) continue;
      if (overlap(A, B)) overlaps += 1;
    }
  }
  const made = T.audit().trips - trips;
  assert.ok(made > 150, `${made} trips in the day`);
  assert.ok(longest < 60, `no car stuck: the longest standing on its way ${longest.toFixed(0)} s`);
  // over its roads: the expressway and its cutting, the viaduct, every junction flyover, the interchanges' slip roads,
  // the roundabouts
  assert.ok(high > 2000 && low > 300, `up on the decks ${high}, down in the cutting ${low}`);
  for (const id of ['expressway', 'independence-flyover', 'h-eb-nb', 'p-nb-off', 'p-sb-on', 'u-fly']) assert.ok(driven.get(id) > 50, `${id} driven: ${driven.get(id) || 0}`);
  for (const rb of OGANIRU_ROUNDABOUTS) assert.ok([...driven.keys()].some((id) => id.startsWith(`ring-${rb.id}-`)), `round the ${rb.name}`);
  const flyovers = OGANIRU_DECKS.filter((d) => d.kind === 'flyover' && d.barrier).map((d) => d.id);
  assert.ok(flyovers.filter((id) => driven.get(id) > 0).length >= flyovers.length - 1, `the junction flyovers: ${flyovers.map((id) => `${id} ${driven.get(id) || 0}`).join(', ')}`);
  const ramps = TRAFFIC_ROADS.filter((r) => r.axis === 'path' && !r.ring).map((r) => r.id);
  assert.ok(ramps.filter((id) => driven.get(id) > 0).length >= ramps.length - 3, `the slip roads: ${ramps.filter((id) => !driven.get(id)).join(', ')} not driven`);
  // faster on the expressway (as fast as 22 m/s, 79 km/h), no faster than 14 on the avenues
  assert.ok(fastest.get('expressway') > 18 && fastest.get('expressway') <= 22.01, `the expressway at ${fastest.get('expressway')}`);
  for (const [id, v] of fastest) if (!/^expressway/.test(id)) assert.ok(v <= 14.01, `${id} at ${v}`);
  assert.ok(samples > 100000);
  assert.ok(offLevel / samples < 0.0005, `on what is under them: ${offLevel} of ${samples} not`);
  assert.equal(red, 0, 'through a red light');
  assert.ok(sideSamples > 20000 && wrongSide / sideSamples < 0.01, `on the wrong side ${wrongSide} of ${sideSamples}`);
  assert.ok(overlaps / samples < 1 / 5000, `into each other: ${overlaps} of ${samples}`);
});

test('kept with the town: the cars on the city\'s roads, saved and opened again, are each where they were on the same way', () => {
  const w = town(['Ada Test', 'Bayo Test'], { hour: 10 });
  const T = w.I.traffic;
  w.place(w.players[0], 0, -1130); w.place(w.players[1], -1290, -1130);
  for (let s = 0; s < 400; s += 0.1) { w.place(w.players[0], 0, -1130); w.place(w.players[1], -1290, -1130); w.host.tick(0.1); }
  const driving = T.cars.filter((c) => c.mode === 'drive' && TRAFFIC_ROADS[c.road].city);
  assert.ok(driving.length >= 3, `${driving.length} on the city's roads`);
  const again = createHost({ saved: JSON.parse(JSON.stringify(w.host.save())) });
  const T2 = again.game.internals.traffic;
  for (const c of driving) {
    const d = T2.cars[c.n];
    assert.equal(d.mode, 'drive');
    const way = T2.wayOf(d.n) || (again.tick(0.01), T2.wayOf(d.n));
    assert.ok(way, `car ${c.n} has its way`);
    assert.ok(Math.abs(way.len - T.wayOf(c.n).len) < 0.01, `car ${c.n} on the same way`);
  }
  again.tick(0.05);
  for (const c of driving) assert.ok(Math.hypot(T2.cars[c.n].x - c.x, T2.cars[c.n].z - c.z) < 2, `car ${c.n} where it was`);
});

test('nothing stands in the way where the city\'s cars drive on the ground: no trunk, lamp, signal or billboard leg on a carriageway (its middle strips, walkways and the roundabouts\' islands apart), nor on a slip road or flyover where it is still on the ground', () => {
  const kerbed = (x, z) => OGANIRU_KERBED.some((b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1);
  const island = (x, z) => OGANIRU_ROUNDABOUTS.some((r) => Math.hypot(x - r.x, z - r.z) <= r.island);
  const things = [
    ...OGANIRU_SOLIDS.filter((s) => !s.pillar).map((s) => ({ what: s.tree ? 'a tree' : s.billboard ? 'a billboard' : 'a signal', x: s.x ?? (s.x0 + s.x1) / 2, z: s.z ?? (s.z0 + s.z1) / 2, r: s.r ?? 0.3 })),
    // (the lamps on the decks' walls stand up there, at the deck's height)
    ...OGANIRU_LAMPS.filter((l) => l.kind !== 'deck').map((l) => ({ what: `a lamp (${l.kind})`, x: l.x, z: l.z, r: 0.2 })),
  ];
  assert.ok(things.length > 2000, `${things.length} things standing in the city`);
  const inWay = [];
  for (const t of things) {
    for (const [dx, dz] of [[0, 0], [t.r, 0], [-t.r, 0], [0, t.r], [0, -t.r]]) {
      const x = t.x + dx, z = t.z + dz;
      const onRoad = oganiruTar(x, z) && !kerbed(x, z) && !island(x, z);
      const onSlip = oganiruDecksAt(x, z).some((h) => h.y < 2.2 && h.deck.kind !== 'bridge');
      if (onRoad || onSlip) { inWay.push(`${t.what} at (${t.x.toFixed(1)}, ${t.z.toFixed(1)})${onSlip ? ' on a slip road' : ''}`); break; }
    }
  }
  assert.deepEqual(inWay, []);
});
