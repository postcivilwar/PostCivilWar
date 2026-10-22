// The habitation at the far end of the River Niger (20 October 2026, the owner's brief), as the simulation has it:
// the river made longer (not wider) and its bridge as it was; Waterside Road on past the habitation's sign to the car
// park at its gate, at the end of the town's road (21 October 2026); where one may walk (anywhere on its land and in its
// shallow water: 21 October 2026) and where not (a cliff's face, deep or fast water, the boiling river round it, off the
// side of a bridge); every place reached on foot from the gate; every one of the owner's 49 models in it, the trees,
// plants and rocks solid where they stand; no vehicle onto a bridge, boardwalk, jetty or stairs; no swimming offered.
//   node --test test/habitation.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { town, run, ok, refused } from './world.mjs';
import { createHost } from '../src/sim/host.js';
import { HABITATION_ROOTS, HABITATION_ROOT_CELL } from '../src/sim/zones/habitation-roots.js';
import {
  HABITATION, HABITATION_PATHS, HABITATION_DECKS, HABITATION_STANDING, HABITATION_MODELS, HABITATION_WATERS, HABITATION_SAND, HABITATION_GRASS, UPRIVER, RIVER_HEAD, RIVER_FAR, riverShore,
  habitationFooting, habitationFootOnly, habitationWaterAt, habitationDeckAt, zoneWalkable, zoneStep, zoneGroundY, zoneBlockKind, zoneOnGround, zoneShoreZ, BRIDGE, ZONE_CLOSURES, ROAD_CLOSURES,
  HABITATION_SHIFT, HABITATION_HOT_RIVER, HOT_RIVER_SIGNS, HABITATION_STREAMS, hotRiverNear, habitationLand, habitationHome, onUpriver,
  habitationRootAt, zoneSolid, HABITATION_ROOT_SQUARES,
} from '../src/sim/zone.js';
// (a place as it was drawn, before the habitation was brought down to the end of the town's road)
const S = HABITATION_SHIFT;

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

test('Waterside Road goes on out of the town past the habitation\'s sign to the car park at its gate: open, walked and driven all the way', () => {
  // its roadblock at the town's north end is open now; none stands across it
  assert.equal(ROAD_CLOSURES.find((c) => c.id === 'waterside-north').state, 'open');
  assert.ok(!ZONE_CLOSURES.some((c) => c.id === 'waterside-north'));
  const R = UPRIVER.road, P = UPRIVER.park;
  for (let x = 200; x <= R.x1; x += 0.5) for (const z of [R.z0 + 2.5, (R.z0 + R.z1) / 2, R.z1 - 2.5]) assert.ok(zoneWalkable(x, z, [], 1.3), `the road at (${x}, ${z})`);
  // (its fenced edges a little way in from its sides)
  for (let x = P.x0 + 3; x <= P.x1 - 3; x += 2) for (let z = P.z0 + 3; z <= P.z1 - 3; z += 2) assert.ok(zoneWalkable(x, z, [], 0.6), `the car park at (${x}, ${z})`);
  // north of the town (the site grid's +x is true north), its gate at the end of the road, just past the first sign after
  // the town's own road (21 October 2026, the owner: "bring the habitation closer to the first signboard")
  const sign = UPRIVER.signs[0];
  assert.equal(sign.id, 'habitation-way');
  assert.ok(sign.x > 250 && sign.x < 275, `the sign at ${sign.x}, just past the town's end at 250`);
  assert.ok(HABITATION.gate.x - sign.x < 90, `the gate ${(HABITATION.gate.x - sign.x).toFixed(0)} m past the sign`);
  assert.ok(HABITATION.bounds.x0 > 250 && HABITATION.gate.x > P.x1 && HABITATION.gate.z > P.z0 && HABITATION.gate.z < P.z1);
  // and level with the town: the road and the car park lie at the town's ground
  for (let x = 250; x < R.x1; x += 5) assert.equal(zoneGroundY(x, (R.z0 + R.z1) / 2), 0);
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
  const under = habitationWaterAt(1887 + S, 91);
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

test('from the gate every one of the habitation\'s places can be walked to (a walk over the whole of it, a metre at a time, each step one a walker can take)', () => {
  const b = HABITATION.bounds, G = 1.0;
  const nx = Math.ceil((b.x1 - b.x0) / G), nz = Math.ceil((b.z1 - b.z0) / G);
  const ok2 = new Uint8Array(nx * nz), seen = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j += 1) for (let i = 0; i < nx; i += 1) ok2[j * nx + i] = zoneWalkable(b.x0 + i * G, b.z0 + j * G, [], 0.35) ? 1 : 0;
  const cell = (x, z) => [Math.round((x - b.x0) / G), Math.round((z - b.z0) / G)];
  const gate = HABITATION_DECKS.find((d) => d.id === 'gate-bridge'), end = gate.line[gate.line.length - 1];
  const [si, sj] = cell(end[0], end[1]);
  const queue = [[si, sj]]; seen[sj * nx + si] = 1;
  while (queue.length) {
    const [i, j] = queue.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, c = j + dj;
      if (a < 0 || c < 0 || a >= nx || c >= nz) continue;
      const k = c * nx + a;
      if (seen[k] || !ok2[k]) continue;
      // (a step a walker can take: not off a bridge's side, nor down a drop)
      if (!zoneStep(b.x0 + i * G, b.z0 + j * G, b.x0 + a * G, b.z0 + c * G)) continue;
      seen[k] = 1; queue.push([a, c]);
    }
  }
  for (const place of HABITATION.places) {
    // the nearest place to stand that is reached from the gate (a place that is a pool or a waterfall is reached at
    // its shore: the big waterfall's pool is 21 m across)
    let best = null;
    for (let j = 0; j < nz; j += 1) for (let i = 0; i < nx; i += 1) if (seen[j * nx + i]) { const d = Math.hypot(b.x0 + i * G - place.x, b.z0 + j * G - place.z); if (!best || d < best.d) best = { d, k: j * nx + i }; }
    assert.ok(best && best.d < 22, `${place.name} is reached on foot from the gate: within ${best ? best.d.toFixed(1) : '?'} m of it`);
  }
  // and nearly all of its land: whatever can be stood on, short of the boiling river, is reached (not counting the land
  // beyond the boiling river and that on its far banks, which nobody reaches)
  let can = 0, got = 0;
  for (let j = 0; j < nz; j += 1) for (let i = 0; i < nx; i += 1) {
    const k = j * nx + i, x = b.x0 + i * G, z = b.z0 + j * G;
    if (!ok2[k]) continue;
    const h = hotRiverNear(x, z);
    // (inside the ring of the boiling river: west of its east side, east of its west side, south of its far end)
    const inside = z > -200 && z < 478 && x < 2538 + S;
    if (!inside || h.d < 4) continue;
    can += 1; if (seen[k]) got += 1;
  }
  assert.ok(got / can > 0.7, `${got} of ${can} square metres one can stand on are reached from the gate`);
  // and nothing beyond the moat or the boiling river is ever reached: not its far banks, not the strip outside the moat
  // (the habitation is entered by its gate, and the boiling river is its far end)
  let beyond = 0, strayed = 0;
  for (let j = 0; j < nz; j += 1) for (let i = 0; i < nx; i += 1) {
    const x = b.x0 + i * G, z = b.z0 + j * G;
    // (the car park, beside the moat, is the town's side of it)
    if (habitationHome(x, z) || habitationDeckAt(x, z) || onUpriver(x, z)) continue;
    beyond += 1;
    if (seen[j * nx + i]) strayed += 1;
    if (!habitationWaterAt(x, z)) assert.equal(zoneWalkable(x, z, [], 0.1) && !zoneOnGround(x, z) ? 'walked' : 'not', 'not', `(${x}, ${z}) beyond the moat and the boiling river`);
  }
  assert.ok(beyond > 20000 && strayed === 0, `${strayed} of ${beyond} square metres beyond the moat and the boiling river reached`);
  for (const [x, z] of [[400, -226], [700, -228], [1020, 0], [1024, 300], [700, 515], [324, 30], [324, -150], [326, 380]]) assert.equal(habitationFooting(x, z).walk, false, `(${x}, ${z}): the far bank, or outside the moat`);
  // every path and deck too
  for (const p of [...HABITATION_PATHS, ...HABITATION_DECKS.filter((d) => d.kind !== 'platform')]) {
    const mid = along(p.line, lengthOf(p.line) / 2), [i, j] = cell(mid.x, mid.z);
    let reached = false;
    for (let dj = -1; dj <= 1 && !reached; dj += 1) for (let di = -1; di <= 1 && !reached; di += 1) { const k = (j + dj) * nx + (i + di); if (seen[k]) reached = true; }
    assert.ok(reached, `${p.id} is reached from the gate`);
  }
});

test('the forest\'s floor, sand, open grass and shallow water are walked; a cliff\'s face, deep or fast water and the boiling river are not', () => {
  // the forest between the paths: walked now (21 October 2026, the owner: "users must be able to move freely")
  let forest = 0;
  for (const [x, z] of [[1990, 0], [2140, 40], [2250, 60], [2000, 120], [1960, -150], [2100, -170]]) {
    const f = habitationFooting(x + S, z);
    if (f.kind !== 'forest') continue;
    forest += 1;
    assert.ok(f.walk, `the forest's floor at (${x}, ${z})`);
  }
  assert.ok(forest >= 4, `${forest} of the forest's places are its floor`);
  // a cliff's face is not stood on: the big waterfall's bowl, the gorge's walls, the high ground's edges
  let cliffs = 0;
  for (let x = 2300 + S; x < 2520 + S; x += 0.5) { const f = habitationFooting(x, 300); if (f && f.kind === 'cliff') { cliffs += 1; assert.equal(f.walk, false); } }
  assert.ok(cliffs > 3, `${cliffs} points of cliff across the high ground's edge`);
  // the lagoon's middle and the big pool: deep
  for (const [x, z] of [[2240, 240], [2464, 225]]) { const w = habitationWaterAt(x + S, z); assert.ok(w && w.depth > 1, `deep at (${x}, ${z})`); assert.equal(zoneWalkable(x + S, z, [], 0.3), false); }
  // the outflow's rapids are not waded
  const out = HABITATION_STREAMS.find((q) => q.id === 'outflow');
  const mid = along(out.line, out.length / 2);
  assert.equal(habitationFooting(mid.x, mid.z).walk, false, 'the rapids');
  // the beaches, the meadow on the hill, the garden's lawn
  for (const area of [...HABITATION_SAND, ...HABITATION_GRASS]) {
    const [x, z] = area.outline.reduce(([a, c], [x1, z1]) => [a + x1 / area.outline.length, c + z1 / area.outline.length], [0, 0]);
    const f = habitationFooting(x, z);
    if (f.kind === 'deck' || (f.deck && f.deck.length)) continue;
    assert.ok(f.walk, `${area.id} at its middle (${x.toFixed(0)}, ${z.toFixed(0)}): ${f.kind}`);
  }
  // shallow water at the west beach is waded
  let waded = 0;
  for (let z = 120; z < 140; z += 0.5) { const w = habitationWaterAt(2200 + S, z); if (w && w.depth <= 0.55) { waded += 1; assert.ok(habitationFooting(2200 + S, z).walk, `the shallows at (2200, ${z})`); } }
  assert.ok(waded > 3, 'there are shallows to wade by the west beach');
});

test('the boiling river runs round the habitation\'s far sides, is never gone into, not even at its edge, and signs along it say so', () => {
  const h = HABITATION_HOT_RIVER;
  assert.ok(h.hot && h.length > 1800, `${h.length.toFixed(0)} m long`);
  // all along it: its water is the boiling river's, and none of it, its middle or its very edge, is walked
  let at = 0;
  for (let d = 2; d < h.length - 30; d += 3) {
    const p = along(h.line, d);
    for (const off of [0, -h.width / 2 + 0.6, h.width / 2 - 0.6]) {
      const x = p.x - p.dz * off, z = p.z + p.dx * off;
      const w = habitationWaterAt(x, z);
      if (!w) continue;
      at += 1;
      assert.equal(w.kind, 'hot', `its water at ${d.toFixed(0)} m (${x.toFixed(1)}, ${z.toFixed(1)})`);
      assert.equal(zoneWalkable(x, z, [], 0.1), false, `not walked at ${d.toFixed(0)} m, ${off.toFixed(1)} m from its middle`);
    }
  }
  assert.ok(at > 1000, `${at} points of its water`);
  // it runs along the far sides: west, north and east of every one of the places
  for (const place of HABITATION.places) {
    assert.ok(place.z > -200 && place.z < 480 && place.x < 2538 + S, `${place.name} is inside the ring of the boiling river`);
  }
  // its banks come down to it: one stands near the water (four metres up its bank, the last four not stood on) on the
  // west side, and never nearer
  let bank = 0, nearer = 0;
  for (let x = 1950 + S; x < 2450 + S; x += 10) { for (let z = -185; z > -200; z -= 0.25) { if (zoneWalkable(x, z, [], 0.3)) { const n = hotRiverNear(x, z); if (n.d < 4) nearer += 1; if (n.d < 5.5) { bank += 1; break; } } } }
  assert.ok(bank > 30 && nearer === 0, `${bank} of 50 places on the west bank where one stands within 5.5 m of the water; ${nearer} nearer than 4 m`);
  // the signs: on ground one can stand on, facing whoever comes toward the river, and in sight of it
  assert.ok(HOT_RIVER_SIGNS.length >= 10);
  for (const s of HOT_RIVER_SIGNS) {
    assert.ok(habitationFooting(s.x, s.z) && habitationFooting(s.x, s.z).walk, `${s.id} stands on ground at (${s.x}, ${s.z})`);
    assert.ok(hotRiverNear(s.x, s.z).d < 60, `${s.id} is ${hotRiverNear(s.x, s.z).d.toFixed(0)} m from the water`);
    assert.match(s.lines.join(' '), /BOILING RIVER/);
    // (a board's face is toward +z turned by `facing`: toward the habitation's middle, away from the river)
    const fx = Math.sin(s.facing), fz = Math.cos(s.facing);
    const n = hotRiverNear(s.x, s.z), q = along(h.line, n.at);
    assert.ok((s.x - q.x) * fx + (s.z - q.z) * fz > 0, `${s.id} faces away from the river, toward whoever comes`);
    // nothing of the forest stands at it (4.5 m round) or in front of it (16 m out, 3.5 m to either side), and the place
    // 6 m in front of it, where it is read, is stood on
    for (const p of HABITATION_STANDING) {
      const dx = p.x - s.x, dz = p.z - s.z, out = dx * fx + dz * fz, side = Math.abs(-dx * fz + dz * fx);
      assert.ok(Math.hypot(dx, dz) >= 4.5 && !(out > 0 && out < 16 && side < 3.5), `${p.m} (${p.tag}) stands at ${s.id} or in front of it`);
    }
    assert.ok(habitationFooting(s.x + fx * 6, s.z + fz * 6).walk, `${s.id} is read from ground one stands on`);
  }
});

test('a tree\'s buttresses and roots stop a walker where they stand at a walker\'s height, not only its trunk\'s middle; no way is closed by them; a camera looks over them', () => {
  // (each square of wood placed as the page draws the model: three.js's own matrix, from where the copy stands, its
  // turn and its size, as render-habitation.js makes it; the square's middle in the model's own units)
  const THREE = createRequire(import.meta.url)('../vendor/three.min.js');
  const up = new THREE.Vector3(0, 1, 0);
  const nearWay = (x, z) => [...HABITATION_PATHS, ...HABITATION_DECKS].some((w) => {
    if (x < w.bounds.x0 - 3 || x > w.bounds.x1 + 3 || z < w.bounds.z0 - 3 || z > w.bounds.z1 + 3) return false;
    for (let i = 0; i + 1 < w.line.length; i += 1) {
      const [ax, az] = w.line[i], [bx, bz] = w.line[i + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      if (Math.hypot(ax + dx * t - x, az + dz * t - z) < w.width / 2 + 1.6) return true;
    }
    return !!(w.platform && Math.hypot(x - w.platform.x, z - w.platform.z) < w.platform.r + 1.6);
  });
  let checked = 0, open = 0, overWay = 0, bigTrees = 0;
  const openAt = [];
  for (const p of HABITATION_STANDING) {
    const R = HABITATION_ROOTS[p.m];
    if (!R || p.y !== null) continue;
    const info = HABITATION_MODELS[p.m], scale = p.s / info.unit, base = info.base, perMetre = info.unit / R.ref;
    const q = new THREE.Quaternion().setFromAxisAngle(up, p.r);
    const off = new THREE.Vector3(base[0] * scale, base[1] * scale, base[2] * scale).applyQuaternion(q);
    const m4 = new THREE.Matrix4().compose(new THREE.Vector3(p.x - off.x, 0, p.z - off.z), q, new THREE.Vector3(scale, scale, scale));
    if (R.cells.length > 100) bigTrees += 1;
    for (const [ci, cj] of R.cells) {
      const v = new THREE.Vector3(base[0] + (ci + 0.5) * HABITATION_ROOT_CELL * perMetre, 0, base[2] + (cj + 0.5) * HABITATION_ROOT_CELL * perMetre).applyMatrix4(m4);
      const f = habitationFooting(v.x, v.z);
      if (!f || !f.walk) continue;              // (in water or on a cliff's face: not stood on anyway)
      if (nearWay(v.x, v.z)) { overWay += 1; continue; }
      checked += 1;
      if (zoneWalkable(v.x, v.z, [], 0.4)) { open += 1; if (openAt.length < 5) openAt.push(`${p.m} (${v.x.toFixed(1)}, ${v.z.toFixed(1)})`); }
      // (a camera's eye 3 m up is not stopped by a root; at 1 m it is)
      if (checked % 997 === 1) { assert.ok(habitationRootAt(v.x, v.z, 0.25, 1.0) || zoneSolid(v.x, v.z, 0.25, 1.0)); assert.equal(habitationRootAt(v.x, v.z, 0.25, 3.0), false); }
    }
  }
  assert.ok(bigTrees > 150, `${bigTrees} copies of the big buttress-rooted trees`);
  assert.ok(checked > 20000 && open === 0, `${open} of ${checked} squares of a tree's wood at a walker's height stood in: ${openAt.join(', ')}`);
  // (and only near a way is it walked over: a root never closes a path)
  assert.ok(overWay < checked * 0.03, `${overWay} squares by a way, of ${checked}`);
  // what the wood takes of the habitation: a few hundredths of it
  assert.ok(HABITATION_ROOT_SQUARES * 0.25 < 0.06 * (HABITATION.bounds.x1 - HABITATION.bounds.x0) * (HABITATION.bounds.z1 - HABITATION.bounds.z0), `${HABITATION_ROOT_SQUARES} half-metre squares`);
});

test('someone kept up the river before the habitation was brought down to the end of the road is put where they can be: in the same place in it, at its car park on their motorcycle, or where everyone arrives', () => {
  const h = createHost(), g = h.game, P = g.state.players;
  const [a, b, c, d] = ['Ada Path', 'Bayo Road', 'Chidi Rider', 'Dede Town'].map((name) => g.join({ name, look: {} }));
  P[a].x = 2040; P[a].z = 81.5;                 // (on the forest path as it was, 1,552 m further up the river)
  P[b].x = 1500; P[b].z = 113;                  // (on the old road up the river, now the bush beyond the habitation)
  P[c].astride = 'pb:test'; P[c].pbike = { id: 'test', x: 1200, z: 113, h: Math.PI / 2, movedAt: 0 }; P[c].x = 1200; P[c].z = 113;
  P[d].x = 30; P[d].z = 60;                     // (in the town: left where they are)
  const Q = createHost({ saved: JSON.parse(JSON.stringify(h.save())) }).game.state.players;
  assert.ok(Math.hypot(Q[a].x - (2040 + S), Q[a].z - 81.5) < 2 && zoneWalkable(Q[a].x, Q[a].z), `the forest path: at (${Q[a].x}, ${Q[a].z})`);
  assert.ok(zoneWalkable(Q[b].x, Q[b].z) && Q[b].x < 250, `the old road: at (${Q[b].x}, ${Q[b].z})`);
  const park = UPRIVER.park;
  assert.ok(Q[c].pbike && Q[c].pbike.x > park.x0 && Q[c].pbike.x < park.x1 && Q[c].pbike.z > park.z0 && Q[c].pbike.z < park.z1 && Q[c].x === Q[c].pbike.x, `the rider: at (${Q[c].x}, ${Q[c].z})`);
  assert.deepEqual([Q[d].x, Q[d].z], [30, 60]);
});

test('one cannot step off the side of a bridge or a boardwalk, nor down a drop; one steps on and off at its ends', () => {
  for (const id of ['gorge-bridge', 'suspension-bridge', 'mangrove-walk', 'falls-stairs']) {
    const d = HABITATION_DECKS.find((q) => q.id === id);
    const m = along(d.line, d.length / 2);
    // along it: yes
    const a = along(d.line, d.length / 2 + 0.6);
    assert.ok(zoneStep(m.x, m.z, a.x, a.z), `${id}: along it`);
    // off its side, a step of half a metre past its edge: no
    const off = d.width / 2 + 0.5;
    assert.equal(zoneStep(m.x, m.z, m.x - m.dz * off, m.z + m.dx * off), false, `${id}: off its side`);
    assert.equal(zoneStep(m.x - m.dz * off, m.z + m.dx * off, m.x, m.z), false, `${id}: onto it from its side`);
    // at its ends, on to it and off it: yes, onto the path or ground there
    for (const [e, k] of [[d.line[0], 1], [d.line[d.line.length - 1], -1]]) {
      const inward = along(d.line, k > 0 ? 1.0 : d.length - 1.0);
      const out = along(d.line, k > 0 ? 0 : d.length);
      const beyond = { x: out.x - out.dx * k * 1.2, z: out.z - out.dz * k * 1.2 };
      if (!zoneWalkable(beyond.x, beyond.z, [], 0.2)) continue;
      assert.ok(zoneStep(inward.x, inward.z, beyond.x, beyond.z), `${id}: off its end at (${e[0].toFixed(0)}, ${e[1]})`);
    }
  }
  // on the land, no step down a cliff: from the top of the north cliffs toward the boiling river's valley
  let refused = 0;
  for (let z = -60; z < 300; z += 20) { const x0 = 2490 + S; let x = x0; while (x < 2530 + S && zoneWalkable(x + 0.4, z, [], 0.2) && zoneStep(x, z, x + 0.4, z)) x += 0.4; if (x < 2525 + S && habitationLand(x, z) > 8) refused += 1; }
  assert.ok(refused >= 12, `${refused} of 18 walks off the north cliffs' edge stopped at the top`);
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
  w.place(rider, 1866 + S, 91, Math.PI / 2);
  ok(w.send(rid, { type: 'bikes.owned', bikes: ['red-superbike'] }));
  ok(w.send(rid, { type: 'bikes.ride', bike: 'red-superbike' }));
  let stopped = null;
  for (let i = 1; i <= 80 && !stopped; i += 1) {
    run(w.host, 0.05);
    const r = w.send(rid, { type: 'moto.drive', x: 1866 + S + i * 0.15, z: 91, heading: Math.PI / 2, speed: 3 });
    if (!r.ok) stopped = { r, x: 1866 + S + i * 0.15 };
  }
  assert.ok(stopped, 'the motorcycle was stopped');
  assert.equal(stopped.r.code, 'FOOT_ONLY');
  assert.equal(stopped.r.message, 'Get off your vehicle to cross the bridge.');
  const bike = w.g.view(rid).self;
  assert.ok(bike.x < 1876 + S, `it stopped short of the bridge (${bike.x})`);
  // off: it stays there, and on foot the bridge is crossed
  const off = ok(w.send(rid, { type: 'moto.leave' }));
  const parked = w.g.view(rid).self.ownBikes.parked.find((b) => b.bike === 'red-superbike');
  assert.ok(parked && parked.x < 1876.5 + S, `the motorcycle stands where it stopped (${parked && parked.x})`);
  w.place(rider, off.x, off.z, Math.PI / 2);
  let x = rider.x;
  for (let i = 0; i < 60 && x < 1899 + S; i += 1) { run(w.host, 0.2); x = Math.min(1899 + S, x + 0.5); const r = w.send(rid, { type: 'move', x, z: 91, heading: Math.PI / 2 }); assert.equal(r.ok, true, `on foot at ${x}: ${JSON.stringify(r)}`); }
  assert.ok(rider.x >= 1898.9 + S, 'across the bridge on foot');
  // a car: the same
  w.place(driver, 1860 + S, 91, Math.PI / 2);
  ok(w.send(did, { type: 'cars.owned', cars: ['grey-saloon'] }));
  ok(w.send(did, { type: 'cars.enter', car: 'grey-saloon' }));
  let carStopped = null;
  for (let i = 1; i <= 120 && !carStopped; i += 1) {
    run(w.host, 0.05);
    const r = w.send(did, { type: 'car.drive', x: 1860 + S + i * 0.15, z: 91, heading: Math.PI / 2, speed: 3, throttle: 0.3, steer: 0, rev: 0.2 });
    if (!r.ok) carStopped = r;
  }
  assert.ok(carStopped, 'the car was stopped');
  assert.equal(carStopped.code, 'FOOT_ONLY');
  const car = w.g.view(did).self;
  assert.ok(car.x < 1876 + S, `the car stopped short of the bridge (${car.x})`);
  // and a vehicle cannot be brought to someone in the habitation
  w.place(rider, 2010 + S, 70, 0);
  refused(w.send(rid, { type: 'bikes.ride', bike: 'red-superbike' }), 'ON_FOOT_HERE');
});

test('no vehicle goes into the habitation anywhere: off the car park\'s far side, round the moat or along its bank, a motorcycle is stopped at the habitation\'s edge', () => {
  const w = town(['Rider Edge']);
  const [rider] = w.players;
  const [rid] = w.ids;
  ok(w.send(rid, { type: 'bikes.owned', bikes: ['red-superbike'] }));
  // (the car park's corner by the moat, heading out of it: north past its end, and on round the moat's bank)
  const tries = [
    { from: [UPRIVER.park.x1 - 3, UPRIVER.park.z0 + 3], heading: Math.PI, say: 'out of the car park\'s inland side, beside the moat' },
    { from: [UPRIVER.park.x1 - 3, UPRIVER.park.z1 - 2], heading: Math.PI / 2 + 0.25, say: 'off the car park\'s far corner, beside the bridge' },
  ];
  for (const t of tries) {
    w.place(rider, t.from[0], t.from[1], t.heading);
    if (w.g.view(rid).self.astride) ok(w.send(rid, { type: 'moto.leave' }));
    ok(w.send(rid, { type: 'bikes.ride', bike: 'red-superbike' }));
    let x = t.from[0], z = t.from[1], stopped = null;
    for (let i = 1; i <= 120 && !stopped; i += 1) {
      run(w.host, 0.05);
      const nx = x + Math.sin(t.heading) * 0.15, nz = z + Math.cos(t.heading) * 0.15;
      const r = w.send(rid, { type: 'moto.drive', x: nx, z: nz, heading: t.heading, speed: 3 });
      if (!r.ok) stopped = r; else { x = nx; z = nz; }
    }
    assert.ok(stopped, `${t.say}: stopped`);
    assert.ok(['FOOT_ONLY', 'BLOCKED'].includes(stopped.code), `${t.say}: ${stopped.code}`);
    assert.ok(!habitationHome(x, z) && !habitationDeckAt(x, z), `${t.say}: it never got into the habitation (${x.toFixed(1)}, ${z.toFixed(1)})`);
    ok(w.send(rid, { type: 'moto.leave' }));
  }
  // every point of the habitation's land and decks: no vehicle goes there (the car park and the road to it, yes)
  const b = HABITATION.bounds;
  for (let x = b.x0; x <= b.x1; x += 7) for (let z = b.z0; z <= b.z1; z += 7) {
    if (zoneOnGround(x, z) && !onUpriver(x, z)) assert.ok(habitationFootOnly(x, z), `(${x}, ${z}): on foot only`);
  }
  assert.equal(habitationFootOnly(UPRIVER.park.x0 + 10, 90), null, 'the car park is driven');
  assert.equal(habitationFootOnly(270, 113), null, 'the road is driven');
  assert.match(String(habitationFootOnly(600, 0) && habitationFootOnly(600, 0).kind), /land/);
});

test('no swimming is offered anywhere up the river: not by the boiling river, the Niger there or the lagoon; by the town\'s river it is', () => {
  const w = town(['Swimmer Habitation']);
  const [p] = w.players, [id] = w.ids;
  // in the town, a step from the river: offered
  w.place(p, 0, zoneShoreZ(0) - 2, 0); run(w.host, 0.2);
  assert.equal(w.g.view(id).self.byWater, true, 'by the town\'s river');
  // up the river: by the boiling river's bank, by the Niger's bank at the mangroves, on the lagoon's west beach
  const h = HABITATION_HOT_RIVER;
  const spots = [];
  for (let x = 1960 + S; x < 2440 + S; x += 40) for (let z = -186; z > -200; z -= 0.5) if (zoneWalkable(x, z, [], 0.3)) { spots.push([x, z]); break; }
  for (let z = 140; z < 160; z += 0.5) if (zoneWalkable(2004 + S, z, [], 0.3)) spots.push([2004 + S, z]);
  for (let z = 118; z < 136; z += 0.5) if (zoneWalkable(2200 + S, z, [], 0.3)) spots.push([2200 + S, z]);
  assert.ok(spots.length > 20 && h.length > 0);
  for (const [x, z] of spots) { w.place(p, x, z, 0); run(w.host, 0.05); assert.equal(w.g.view(id).self.byWater, false, `no swimming offered at (${x.toFixed(1)}, ${z.toFixed(1)})`); }
  // and asked for there anyway, it is refused
  w.place(p, spots[0][0], spots[0][1], 0);
  assert.equal(w.send(id, { type: 'swim.in' }).ok, false);
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
