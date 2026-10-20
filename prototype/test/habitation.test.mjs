// The habitation at the far end of the River Niger (20 October 2026, the owner's brief), as the simulation has it:
// the river made longer (not wider) and its bridge as it was; Waterside Road on north to the car park at the gate;
// where one may walk (its paths, boardwalks and bridges, sand, open grass, shallow water) and where not (the forest,
// cliffs, deep water); every one of the owner's 49 models in it, the trees, plants and rocks solid where they stand;
// and no vehicle onto a bridge, boardwalk, jetty or stairs.
//   node --test test/habitation.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { town, run, ok, refused } from './world.mjs';
import {
  HABITATION, HABITATION_PATHS, HABITATION_DECKS, HABITATION_STANDING, HABITATION_MODELS, HABITATION_WATERS, HABITATION_SAND, HABITATION_GRASS, UPRIVER, RIVER_HEAD, RIVER_FAR, riverShore,
  habitationFooting, habitationFootOnly, habitationWaterAt, habitationDeckAt, zoneWalkable, zoneGroundY, zoneBlockKind, zoneOnGround, zoneShoreZ, BRIDGE, ZONE_CLOSURES, ROAD_CLOSURES,
} from '../src/sim/zone.js';

const along = (line, d) => {
  let run0 = 0;
  for (let i = 0; i + 1 < line.length; i += 1) {
    const [ax, az] = line[i], [bx, bz] = line[i + 1], len = Math.hypot(bx - ax, bz - az);
    if (run0 + len >= d) { const t = (d - run0) / (len || 1); return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dx: (bx - ax) / len, dz: (bz - az) / len }; }
    run0 += len;
  }
  const [ax, az] = line[line.length - 2], [bx, bz] = line[line.length - 1], len = Math.hypot(bx - ax, bz - az);
  return { x: bx, z: bz, dx: (bx - ax) / len, dz: (bz - az) / len };
};
const lengthOf = (line) => line.slice(1).reduce((s, [x, z], i) => s + Math.hypot(x - line[i][0], z - line[i][1]), 0);

test('the River Niger is made longer, not wider, up to its lagoon; and its bridge is exactly as it was', () => {
  // as wide all the way up as it is along the town
  const widthAtTown = RIVER_FAR - riverShore(250);
  for (let x = 260; x < RIVER_HEAD; x += 25) {
    const w = RIVER_FAR - riverShore(x);
    assert.ok(Math.abs(w - widthAtTown) < 18, `at ${x} it is ${w.toFixed(0)} m wide (${widthAtTown.toFixed(0)} by the town)`);
    const mid = habitationWaterAt(x, (riverShore(x) + RIVER_FAR) / 2);
    assert.ok(mid && mid.id === 'niger' && mid.depth > 1, `the river at ${x}`);
  }
  // its west bank meets the town's own
  assert.ok(Math.abs(riverShore(250) - zoneShoreZ(250)) < 8, `${riverShore(250)} against ${zoneShoreZ(250)}`);
  // the bridge across the Niger: as it was before the habitation (atani-outskirts.js, unchanged)
  assert.deepEqual({ ...BRIDGE, roadway: { ...BRIDGE.roadway }, piers: [...BRIDGE.piers], truss: { ...BRIDGE.truss } }, {
    name: 'River Niger Bridge', x0: -212, x1: -198, roadway: { x0: -209.5, x1: -200.5 }, start: 118, up: 178, down: 272, land: 322, end: 384, height: 7, farBank: 1.0,
    piers: [165, 195, 225, 255, 285], truss: { from: 158, to: 292, bay: 9.6, rise: 7.6 },
  });
});

test('Waterside Road goes on north out of the town along the river to the car park at the gate: open, walked and driven all the way', () => {
  // its roadblock at the town's north end is open now; none stands across it
  assert.equal(ROAD_CLOSURES.find((c) => c.id === 'waterside-north').state, 'open');
  assert.ok(!ZONE_CLOSURES.some((c) => c.id === 'waterside-north'));
  const R = UPRIVER.road, P = UPRIVER.park;
  for (let x = 200; x <= R.x1; x += 1) for (const z of [R.z0 + 2.5, (R.z0 + R.z1) / 2, R.z1 - 2.5]) assert.ok(zoneWalkable(x, z, [], 1.3), `the road at (${x}, ${z})`);
  // (its fenced edges a little way in from its sides)
  for (let x = P.x0 + 3; x <= P.x1 - 3; x += 2) for (let z = P.z0 + 3; z <= P.z1 - 3; z += 2) assert.ok(zoneWalkable(x, z, [], 0.6), `the car park at (${x}, ${z})`);
  // north of the town (the site grid's +x is true north), its gate at the end of the road
  assert.ok(HABITATION.bounds.x0 > 1800 && HABITATION.gate.x > P.x1 && HABITATION.gate.z > P.z0 && HABITATION.gate.z < P.z1);
  // and level with the town: the road and the car park lie at the town's ground
  for (let x = 300; x < R.x1; x += 100) assert.equal(zoneGroundY(x, (R.z0 + R.z1) / 2), 0);
});

test('the gate\'s footbridge takes the way on, on foot, from the car park over the stream into the habitation and onto its first path', () => {
  const gate = HABITATION_DECKS.find((d) => d.id === 'gate-bridge');
  assert.ok(gate.entrance);
  for (let d = 0; d <= gate.length; d += 0.5) {
    const p = along(gate.line, d);
    assert.ok(habitationFootOnly(p.x, p.z), `the bridge at ${d} m is for feet only`);
    assert.ok(zoneWalkable(p.x, p.z, [], 0.4), `and walked at ${d} m`);
    // on its boards, above the stream
    const f = habitationFooting(p.x, p.z);
    assert.equal(f.deck, 'gate-bridge');
    assert.ok(Math.abs(zoneGroundY(p.x, p.z) - f.y) < 1e-9);
  }
  // under it, the stream is too deep to wade
  const under = habitationWaterAt(1887, 91);
  assert.ok(under && under.depth > 0.55);
  // its far end is where the first path begins
  const end = gate.line[gate.line.length - 1], first = HABITATION_PATHS.find((p) => p.id === 'hill-up').line[0];
  assert.ok(Math.hypot(end[0] - first[0], end[1] - first[1]) < 2);
});

test('every path, boardwalk and bridge can be walked from end to end, with room to pass, nothing in the way', () => {
  for (const p of HABITATION_PATHS) {
    const L = lengthOf(p.line);
    for (let d = 0; d <= L; d += 0.5) {
      const q = along(p.line, d);
      assert.ok(zoneWalkable(q.x, q.z, [], 0.4), `${p.id} at ${d.toFixed(1)} m (${q.x.toFixed(1)}, ${q.z.toFixed(1)})`);
      // wide: a person can step aside to let another by
      const aside = Math.max(0.5, p.width / 2 - 0.6);
      for (const s of [-1, 1]) assert.ok(zoneWalkable(q.x - q.dz * aside * s, q.z + q.dx * aside * s, [], 0.35), `${p.id} at ${d.toFixed(1)} m, to the ${s < 0 ? 'left' : 'right'}`);
    }
  }
  for (const deck of HABITATION_DECKS) {
    if (deck.kind === 'platform') continue;
    for (let d = 0; d <= deck.length; d += 0.5) {
      const q = along(deck.line, d);
      assert.ok(zoneWalkable(q.x, q.z, [], 0.4), `${deck.id} at ${d.toFixed(1)} m`);
    }
  }
});

test('from the gate every one of the habitation\'s places can be walked to (a walk over the whole of it, a metre and a half at a time)', () => {
  const b = HABITATION.bounds, S = 1.5;
  const nx = Math.ceil((b.x1 - b.x0) / S), nz = Math.ceil((b.z1 - b.z0) / S);
  const ok2 = new Uint8Array(nx * nz), seen = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j += 1) for (let i = 0; i < nx; i += 1) ok2[j * nx + i] = zoneWalkable(b.x0 + i * S, b.z0 + j * S, [], 0.35) ? 1 : 0;
  const cell = (x, z) => [Math.round((x - b.x0) / S), Math.round((z - b.z0) / S)];
  const [si, sj] = cell(1898, 91);
  const queue = [[si, sj]]; seen[sj * nx + si] = 1;
  while (queue.length) {
    const [i, j] = queue.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, c = j + dj;
      if (a < 0 || c < 0 || a >= nx || c >= nz) continue;
      const k = c * nx + a;
      if (seen[k] || !ok2[k]) continue;
      seen[k] = 1; queue.push([a, c]);
    }
  }
  for (const place of HABITATION.places) {
    // the nearest place to stand that is reached from the gate (a place that is a pool or a waterfall is reached at
    // its shore: the big waterfall's pool is 21 m across)
    let best = null;
    for (let j = 0; j < nz; j += 1) for (let i = 0; i < nx; i += 1) if (seen[j * nx + i]) { const d = Math.hypot(b.x0 + i * S - place.x, b.z0 + j * S - place.z); if (!best || d < best.d) best = { d, k: j * nx + i }; }
    assert.ok(best && best.d < 22, `${place.name} is reached on foot from the gate: within ${best ? best.d.toFixed(1) : '?'} m of it`);
  }
  // every path and deck too
  for (const p of [...HABITATION_PATHS, ...HABITATION_DECKS.filter((d) => d.kind !== 'platform')]) {
    const mid = along(p.line, lengthOf(p.line) / 2), [i, j] = cell(mid.x, mid.z);
    let reached = false;
    for (let dj = -1; dj <= 1 && !reached; dj += 1) for (let di = -1; di <= 1 && !reached; di += 1) { const k = (j + dj) * nx + (i + di); if (seen[k]) reached = true; }
    assert.ok(reached, `${p.id} is reached from the gate`);
  }
});

test('the forest, the cliffs, the swamp\'s water and deep water are not walked; sand, open grass and shallow water are', () => {
  // the forest between the paths
  for (const [x, z] of [[1990, 0], [2140, 40], [2250, 60], [2000, 120]]) {
    const f = habitationFooting(x, z);
    if (f.kind !== 'forest') continue;
    assert.equal(zoneWalkable(x, z, [], 0.3), false, `the forest at (${x}, ${z})`);
  }
  assert.equal(habitationFooting(2140, 40).kind, 'forest');
  // the lagoon's middle and the big pool: deep
  for (const [x, z] of [[2240, 240], [2464, 225]]) { const w = habitationWaterAt(x, z); assert.ok(w && w.depth > 1, `deep at (${x}, ${z})`); assert.equal(zoneWalkable(x, z, [], 0.3), false); }
  // the swamp's dark water, however shallow, is not walked into (its boardwalk is)
  const sw = HABITATION_WATERS.find((w) => w.id === 'swamp');
  assert.equal(habitationFooting(2010, -100).walk, false, 'the swamp');
  // the beaches, the meadow on the hill, the garden's lawn
  for (const area of [...HABITATION_SAND, ...HABITATION_GRASS]) {
    const [x, z] = area.outline.reduce(([a, c], [x1, z1]) => [a + x1 / area.outline.length, c + z1 / area.outline.length], [0, 0]);
    const f = habitationFooting(x, z);
    if (f.kind === 'deck' || (f.deck && f.deck.length)) continue;
    assert.ok(f.walk, `${area.id} at its middle (${x.toFixed(0)}, ${z.toFixed(0)}): ${f.kind}`);
  }
  // shallow water at the west beach is waded
  let waded = 0;
  for (let z = 120; z < 140; z += 0.5) { const w = habitationWaterAt(2200, z); if (w && w.depth <= 0.55) { waded += 1; assert.ok(habitationFooting(2200, z).walk, `the shallows at (2200, ${z})`); } }
  assert.ok(waded > 3, 'there are shallows to wade by the west beach');
  assert.ok(sw);
});

test('every one of the owner\'s 49 models is in the habitation; his trees, plants and rocks are solid where they stand, and none stands on a path', () => {
  const spec = JSON.parse(readFileSync(new URL('../tools/habitation/models.json', import.meta.url), 'utf8')).models;
  const names = Object.keys(spec).map((n) => n.replace('3dmodel', '').replace('.glb', ''));
  assert.equal(names.length, 49);
  const placed = new Set(HABITATION_STANDING.map((s) => s.m));
  for (const n of names) assert.ok(placed.has(n), `${n} stands somewhere`);
  for (const n of placed) assert.ok(HABITATION_MODELS[n], n);
  let solid = 0;
  for (const s of HABITATION_STANDING) {
    if (!(s.solid > 0)) continue;
    solid += 1;
    assert.equal(zoneWalkable(s.x, s.z, [], 0.2), false, `${s.m} at (${s.x}, ${s.z}) stops a walker`);
    // (where the ground round it could be walked, it is what stops one: deep in the forest, the forest is)
    if (habitationFooting(s.x, s.z).walk) assert.equal(zoneBlockKind(s.x, s.z, [], 0.2), 'solid', `${s.m} at (${s.x}, ${s.z}) is solid`);
  }
  assert.ok(solid > 400, `${solid} solid`);
  // the trunks and rocks are clear of the paths and decks (a walker of 0.4 m passes on the path's line)
  for (const p of HABITATION_PATHS) for (const s of HABITATION_STANDING) {
    if (!(s.solid > 0)) continue;
    let d = Infinity;
    for (let i = 0; i + 1 < p.line.length; i += 1) {
      const [ax, az] = p.line[i], [bx, bz] = p.line[i + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const u = Math.max(0, Math.min(1, ((s.x - ax) * dx + (s.z - az) * dz) / l2));
      d = Math.min(d, Math.hypot(ax + dx * u - s.x, az + dz * u - s.z));
    }
    assert.ok(d > s.solid + 0.4, `${s.m} at (${s.x}, ${s.z}) is ${d.toFixed(2)} m from the line of ${p.id}`);
  }
});

test('no vehicle goes onto a bridge, a boardwalk, a jetty or stairs: the motorcycle and the car are stopped at the gate\'s footbridge, and left where they stopped', () => {
  const w = town(['Rider Habitation', 'Driver Habitation']);
  const [rider, driver] = w.players;
  const [rid, did] = w.ids;
  // on a motorcycle of one's own, from the car park toward the gate's bridge
  w.place(rider, 1866, 91, Math.PI / 2);
  ok(w.send(rid, { type: 'bikes.owned', bikes: ['red-superbike'] }));
  ok(w.send(rid, { type: 'bikes.ride', bike: 'red-superbike' }));
  let stopped = null;
  for (let i = 1; i <= 80 && !stopped; i += 1) {
    run(w.host, 0.05);
    const r = w.send(rid, { type: 'moto.drive', x: 1866 + i * 0.15, z: 91, heading: Math.PI / 2, speed: 3 });
    if (!r.ok) stopped = { r, x: 1866 + i * 0.15 };
  }
  assert.ok(stopped, 'the motorcycle was stopped');
  assert.equal(stopped.r.code, 'FOOT_ONLY');
  assert.equal(stopped.r.message, 'Get off your vehicle to cross the bridge.');
  const bike = w.g.view(rid).self;
  assert.ok(bike.x < 1876, `it stopped short of the bridge (${bike.x})`);
  // off: it stays there, and on foot the bridge is crossed
  const off = ok(w.send(rid, { type: 'moto.leave' }));
  const parked = w.g.view(rid).self.ownBikes.parked.find((b) => b.bike === 'red-superbike');
  assert.ok(parked && parked.x < 1876.5, `the motorcycle stands where it stopped (${parked && parked.x})`);
  w.place(rider, off.x, off.z, Math.PI / 2);
  let x = rider.x;
  for (let i = 0; i < 60 && x < 1899; i += 1) { run(w.host, 0.2); x = Math.min(1899, x + 0.5); const r = w.send(rid, { type: 'move', x, z: 91, heading: Math.PI / 2 }); assert.equal(r.ok, true, `on foot at ${x}: ${JSON.stringify(r)}`); }
  assert.ok(rider.x >= 1898.9, 'across the bridge on foot');
  // a car: the same
  w.place(driver, 1860, 91, Math.PI / 2);
  ok(w.send(did, { type: 'cars.owned', cars: ['grey-saloon'] }));
  ok(w.send(did, { type: 'cars.enter', car: 'grey-saloon' }));
  let carStopped = null;
  for (let i = 1; i <= 120 && !carStopped; i += 1) {
    run(w.host, 0.05);
    const r = w.send(did, { type: 'car.drive', x: 1860 + i * 0.15, z: 91, heading: Math.PI / 2, speed: 3, throttle: 0.3, steer: 0, rev: 0.2 });
    if (!r.ok) carStopped = r;
  }
  assert.ok(carStopped, 'the car was stopped');
  assert.equal(carStopped.code, 'FOOT_ONLY');
  const car = w.g.view(did).self;
  assert.ok(car.x < 1876, `the car stopped short of the bridge (${car.x})`);
  // and a vehicle cannot be brought to someone in the habitation
  w.place(rider, 2010, 70, 0);
  refused(w.send(rid, { type: 'bikes.ride', bike: 'red-superbike' }), 'ON_FOOT_HERE');
});

test('every deck is for feet only, and is where its boards are: a bridge over water, a boardwalk over the swamp and the mangroves', () => {
  for (const d of HABITATION_DECKS) {
    const mid = along(d.line, d.length / 2);
    assert.ok(habitationFootOnly(mid.x, mid.z), d.id);
    const f = habitationDeckAt(mid.x, mid.z);
    assert.equal(f.deck.id, d.id);
    assert.ok(Number.isFinite(f.y));
    // the boards above what is under them (water or ground), not in it
    const w = habitationWaterAt(mid.x, mid.z);
    if (w && d.kind !== 'platform') assert.ok(f.y > w.level, `${d.id}: above the water`);
  }
});
