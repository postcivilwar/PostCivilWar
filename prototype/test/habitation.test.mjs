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
  ZONE, HABITATION, HABITATION_PATHS, HABITATION_DECKS, HABITATION_STANDING, HABITATION_MODELS, HABITATION_WATERS, HABITATION_SAND, HABITATION_GRASS, UPRIVER, RIVER_HEAD, RIVER_FAR, riverShore,
  habitationFooting, habitationFootOnly, habitationWaterAt, habitationDeckAt, zoneWalkable, zoneStep, zoneGroundY, zoneBlockKind, zoneOnGround, zoneShoreZ, BRIDGE, ZONE_CLOSURES, ROAD_CLOSURES,
  HABITATION_SHIFT, HABITATION_HOT_RIVER, HOT_RIVER_SIGNS, HABITATION_STREAMS, hotRiverNear, habitationLand, habitationHome, onUpriver,
  habitationRootAt, zoneSolid, HABITATION_ROOT_SQUARES,
  HABITATION_GROUND, HABITATION_GROUND_POINTS, habitationGroundPoint, habitationGroundAt, habitationRailsAt, HABITATION_RAILS, HABITATION_DECK_POSTS, HABITATION_SWIM_SIGNS, habitationSignPosts, habitationClimbing, habitationAlongDeck,
} from '../src/sim/zone.js';
import { JUMP_EVERY } from '../src/sim/sim.js';
import { encodePlayer, decodePlayer } from '../src/net/link.js';
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
  // (from its first boards to its last: out past its ends one is on the ground)
  for (let d = 0.25; d <= gate.length - 0.25; d += 0.5) {
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
      // wide: a person can step aside to let another by (where the path meets a deck's end, the deck's rails are its
      // sides there)
      if (habitationDeckAt(q.x, q.z) || HABITATION_DECKS.some((d) => [d.line[0], d.line[d.line.length - 1]].some((e) => Math.hypot(e[0] - q.x, e[1] - q.z) < 3))) continue;
      const aside = Math.max(0.5, p.width / 2 - 0.6);
      for (const s of [-1, 1]) {
        const x = q.x - q.dz * aside * s, z = q.z + q.dx * aside * s;
        // (a deck's post where a path comes to its end is the deck's)
        if (HABITATION_DECK_POSTS.some((post) => Math.hypot(post.x - x, post.z - z) < 1)) continue;
        assert.ok(zoneWalkable(x, z, [], 0.35), `${p.id} at ${d.toFixed(1)} m, to the ${s < 0 ? 'left' : 'right'}`);
      }
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
    // (a walker goes any way, not only along the squares' sides: a boardwalk running across them, between its rails,
    // is walked from square to square corner to corner)
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
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
  // a car: the same (the motorcycle sold first, and bought again: left standing where it stopped, it would be in the car's
  // way, as a motorcycle left standing is now, 31 October 2026)
  ok(w.send(rid, { type: 'bikes.owned', bikes: [] }));
  ok(w.send(rid, { type: 'bikes.owned', bikes: ['red-superbike'] }));
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

// ---- 22 October 2026, the owner's brief from his four screen recordings ----

test('a walker stands on the ground as it is drawn: on the land, on sand and in the shallows, the same triangles 2.5 m across (no feet sunk in a sandy bank)', () => {
  const G = HABITATION_GROUND, N = HABITATION_GROUND_POINTS;
  assert.equal(G.step, 2.5);
  // the grid's points are the land's, and between them the ground is the triangle each point falls in
  let checked = 0, worst = 0;
  for (let k = 0; k < 4000; k += 1) {
    const i = 3 + ((k * 7919) % (N.x - 6)), j = 3 + ((k * 104729) % (N.z - 6));
    const x = G.x0 + i * G.step, z = G.z0 + j * G.step;
    assert.ok(Math.abs(habitationGroundAt(x, z) - habitationGroundPoint(i, j)) < 1e-4, `(${i}, ${j})`);
    // a point inside the square: on the plane of the three corners its triangle has
    const u = 0.31, v = 0.47, px = x + u * G.step, pz = z + v * G.step;
    const a = habitationGroundPoint(i, j), b = habitationGroundPoint(i + 1, j), c = habitationGroundPoint(i, j + 1), d = habitationGroundPoint(i + 1, j + 1);
    const want = u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
    assert.ok(Math.abs(habitationGroundAt(px, pz) - want) < 1e-4);
    // and a walker there (off the decks) is put on exactly that ground
    const f = habitationFooting(px, pz);
    if (f && f.walk && !f.deck) { worst = Math.max(worst, Math.abs(zoneGroundY(px, pz) - habitationGroundAt(px, pz))); checked += 1; }
  }
  assert.ok(checked > 1500 && worst < 1e-6, `${checked} places walked on, the walker at most ${worst} m off the ground drawn`);
  // the sandy bank of the lagoon's west beach and its shallows, where the owner's walker was drawn sunk to the head
  for (let x = 2140 + S; x < 2300 + S; x += 3.3) for (let z = 104; z < 140; z += 1.7) {
    const f = habitationFooting(x, z);
    if (f && f.walk && !f.deck) assert.ok(Math.abs(zoneGroundY(x, z) - habitationGroundAt(x, z)) < 1e-6, `(${x.toFixed(1)}, ${z.toFixed(1)})`);
  }
});

test('every deck\'s boards are above the ground all along and right across them: the big waterfall\'s stairs go down a cutting in the cliff, open to the sky, and no bridge\'s end is buried', () => {
  for (const d of HABITATION_DECKS) {
    let worst = -Infinity, where = null;
    for (let s0 = 0.05; s0 <= d.length - 0.05; s0 += 0.25) {
      const q = along(d.line, s0);
      for (let k = -1; k <= 1; k += 0.25) {
        const off = k * (d.width / 2 - 0.05), x = q.x - q.dz * off, z = q.z + q.dx * off;
        const deck = habitationDeckAt(x, z);
        if (!deck || deck.deck !== d) continue;
        const gap = habitationGroundAt(x, z) - deck.y;
        if (gap > worst) { worst = gap; where = [s0, off]; }
      }
    }
    assert.ok(worst < -0.02, `${d.id}: the ground drawn ${worst.toFixed(2)} m from its boards at ${where && where[0].toFixed(2)} m along, ${where && where[1].toFixed(2)} m across`);
  }
  // the stairs: where the cliff's top stood over them, a cutting: its floor under the boards beside them too, and its
  // walls of rock rising from there (as steep as a cliff's face: nobody walks up them)
  const stairs = HABITATION_DECKS.find((q) => q.id === 'falls-stairs');
  let walls = 0;
  for (let s0 = 3; s0 < 16; s0 += 1) {
    const q = along(stairs.line, s0), boards = habitationDeckAt(q.x, q.z).y;
    for (const side of [-1, 1]) {
      const floor = { x: q.x - q.dz * side * (stairs.width / 2 + 2), z: q.z + q.dx * side * (stairs.width / 2 + 2) };
      assert.ok(habitationLand(floor.x, floor.z) < boards, `falls-stairs at ${s0} m: the cutting's floor beside it under its boards`);
      const wall = { x: q.x - q.dz * side * (stairs.width / 2 + 4.5), z: q.z + q.dx * side * (stairs.width / 2 + 4.5) };
      if (habitationLand(wall.x, wall.z) > boards + 1) { walls += 1; assert.equal(habitationFooting(wall.x, wall.z).walk, false, `falls-stairs at ${s0} m: its cutting's wall is not walked up`); }
    }
  }
  assert.ok(walls >= 10, `${walls} places along the stairs with the cutting's wall of rock beside them`);
});

test('out past a deck\'s end one stands on the ground in front of it, a step from its boards (no boards that are not there, no notch): a raised boardwalk comes down to the ground at an end one walks on from', () => {
  let ends = 0;
  for (const d of HABITATION_DECKS.filter((q) => q.kind !== 'platform')) {
    for (const line of [d.line, [...d.line].reverse()]) {
      const end = along(line, 0), [ix, iz] = [end.dx, end.dz], boards = habitationDeckAt(end.x + ix * 0.05, end.z + iz * 0.05).y;
      const at = (b, s) => [end.x - ix * b - iz * s, end.z - iz * b + ix * s];
      const which = `${d.id} at its ${line === d.line ? 'first' : 'far'} end`;
      // nothing to stand on out past it but the ground (or the water)
      assert.equal(habitationDeckAt(...at(0.3, 0)), null, `${which}: no boards out past it`);
      if (!zoneWalkable(...at(1.2, 0), [], 0.4)) continue;
      ends += 1;
      // in front of its way in, the ground a step from its boards: just in front, within half a metre of them
      for (let b = 0.05; b <= 0.8; b += 0.05) for (let s = -(d.width / 2 - 0.7); s <= d.width / 2 - 0.7 + 1e-9; s += 0.1) {
        if (!zoneWalkable(...at(b, s), [], 0.1)) continue;
        const g = zoneGroundY(...at(b, s)) - boards;
        assert.ok(g > -0.55 && (b > 0.3 || g < 0.55), `${which}: the ground ${b.toFixed(2)} m in front, ${s.toFixed(1)} m across, ${g.toFixed(2)} m from its boards`);
      }
      // and stepped onto and off there
      assert.ok(zoneStep(...at(1.2, 0), ...at(-1, 0)) && zoneStep(...at(-1, 0), ...at(1.2, 0)), `${which}: on and off`);
      // a boardwalk or jetty laid well above what is under it: down at this end to just above the ground (or the water)
      if (d.over !== undefined) assert.ok(boards - Math.max(habitationGroundAt(end.x, end.z), (habitationWaterAt(end.x, end.z) || { level: -Infinity }).level) < 0.35, `${which}: down to the ground`);
    }
    // (and along its middle, as high above it as it is laid)
    if (d.over !== undefined) {
      const q = along(d.line, d.length / 2), w = habitationWaterAt(q.x, q.z);
      assert.ok(habitationDeckAt(q.x, q.z).y - Math.max(habitationGroundAt(q.x, q.z), w ? w.level : -Infinity) >= d.over - 0.01, `${d.id}: ${d.over} m up along its middle`);
    }
  }
  assert.ok(ends >= 16, `${ends} ends walked on from`);
});

test('a deck\'s rails and posts stand in the way all along it: on it one keeps half a metre off its edges, beside it half a metre (stairs: the floor of their cutting), and it is stepped onto and off only past its ends', () => {
  const R = HABITATION_RAILS;
  for (const d of HABITATION_DECKS.filter((q) => q.rails)) {
    const out = d.kind === 'stairs' ? R.stairs : R.outside;
    for (const s0 of [d.length * 0.3, d.length * 0.5, d.length * 0.7]) {
      const q = along(d.line, s0);
      if (d.platform && Math.hypot(q.x - d.platform.x, q.z - d.platform.z) < d.platform.r + 1) continue;
      const at = (off) => [q.x - q.dz * off, q.z + q.dx * off];
      // its middle: walked
      assert.ok(zoneWalkable(...at(0), [], 0.4), `${d.id} at ${s0.toFixed(1)} m: its middle`);
      for (const side of [-1, 1]) {
        // within its rails' reach, on its boards: not stood on
        assert.ok(habitationRailsAt(...at(side * (d.width / 2 - R.inside / 2))), `${d.id}: by its rail`);
        assert.equal(zoneWalkable(...at(side * (d.width / 2 - R.inside / 2)), [], 0.1), false, `${d.id}: in its rails`);
        // beside it: not stood on either
        assert.equal(zoneWalkable(...at(side * (d.width / 2 + out / 2)), [], 0.1), false, `${d.id}: beside it, in its rails' way`);
        // and from beside it (past its rails' reach), never a step onto it
        const [bx, bz] = at(side * (d.width / 2 + out + 0.3)), [mx, mz] = at(0);
        assert.equal(zoneStep(bx, bz, mx, mz), false, `${d.id}: onto it from its side`);
        assert.equal(zoneStep(mx, mz, bx, bz), false, `${d.id}: off it by its side`);
      }
    }
    // past its ends, where the way goes on: on and off
    for (const [k, s0] of [[1, 0], [-1, d.length]]) {
      const end = along(d.line, s0), inward = along(d.line, k > 0 ? 1.2 : d.length - 1.2);
      const beyond = { x: end.x - end.dx * k * 1.5, z: end.z - end.dz * k * 1.5 };
      if (!zoneWalkable(beyond.x, beyond.z, [], 0.4)) continue;
      assert.ok(zoneStep(beyond.x, beyond.z, inward.x, inward.z), `${d.id}: onto it past its end`);
      assert.ok(zoneStep(inward.x, inward.z, beyond.x, beyond.z), `${d.id}: off it past its end`);
    }
  }
  // its posts: each where it is drawn (at its edges, every 2.4 m, and at its ends), and nobody stands in one
  assert.ok(HABITATION_DECK_POSTS.length > 300, `${HABITATION_DECK_POSTS.length} posts`);
  for (const post of HABITATION_DECK_POSTS) {
    assert.equal(zoneWalkable(post.x, post.z, [], 0.4), false, `${post.deck}: its post at (${post.x.toFixed(1)}, ${post.z.toFixed(1)})`);
    // (those at its ends, walked past onto it, solid; never in the way of the camera's eye above a walker's head)
    if (post.end) { assert.equal(zoneSolid(post.x, post.z, 0.1), true); assert.equal(zoneSolid(post.x, post.z, 0.1, 1.6), false); }
  }
  assert.ok(HABITATION_DECK_POSTS.filter((p) => p.end).length >= 30);
});

test('every bridge, boardwalk, jetty and flight of stairs is walked from end to end between its rails, a walker steering from corner to corner as a player does (a step into its rails turned along it)', () => {
  const ok = (ax, az, bx, bz) => zoneWalkable(bx, bz, [], 0.4) && zoneStep(ax, az, bx, bz);
  for (const d of HABITATION_DECKS.filter((q) => q.rails && q.kind !== 'suspension')) {
    for (const line of [d.line, [...d.line].reverse()]) {
      const [ax, az] = line[0], [bx, bz] = line[1], l0 = Math.hypot(bx - ax, bz - az);
      let x = ax + ((bx - ax) / l0) * 0.5, z = az + ((bz - az) / l0) * 0.5, next = 1, stuck = 0, done = false, walked = 0;
      for (let i = 0; i < 30000 && !done && stuck < 60; i += 1) {
        if (Math.hypot(line[next][0] - x, line[next][1] - z) < 1.2 && next < line.length - 1) next += 1;
        const [tx, tz] = line[next], g = Math.hypot(tx - x, tz - z) || 1, dx = ((tx - x) / g) * 0.05, dz = ((tz - z) / g) * 0.05;
        let nx = x + dx, nz = z + dz;
        if (!ok(x, z, nx, nz)) {
          const along = habitationAlongDeck(x, z, dx, dz, (bx, bz) => ok(x, z, bx, bz));
          if (along) { nx = x + along.dx; nz = z + along.dz; } else { stuck += 1; continue; }
        }
        walked += Math.hypot(nx - x, nz - z); x = nx; z = nz; stuck = 0;
        // (and every step of it on its boards, between its rails)
        assert.ok(habitationDeckAt(x, z) || Math.hypot(x - line[line.length - 1][0], z - line[line.length - 1][1]) < 1.5, `${d.id}: on its boards at (${x.toFixed(1)}, ${z.toFixed(1)})`);
        if (next === line.length - 1 && Math.hypot(line[next][0] - x, line[next][1] - z) < 0.6) done = true;
      }
      assert.ok(done, `${d.id}: walked to its ${line === d.line ? 'far' : 'first'} end (got ${walked.toFixed(1)} m of ${d.length.toFixed(1)}, stopped at (${x.toFixed(1)}, ${z.toFixed(1)}))`);
    }
  }
});

test('a deck with rails is gone onto from anywhere in front of its end, not only from its middle: a walker coming at it from one side, steering at its first corner or at its way in, is turned in between its rails and not stopped at its end\'s posts', () => {
  const ok = (ax, az, bx, bz) => zoneWalkable(bx, bz, [], 0.4) && zoneStep(ax, az, bx, bz);
  let tried = 0;
  for (const d of HABITATION_DECKS.filter((q) => q.rails)) {
    for (const line of [d.line, [...d.line].reverse()]) {
      const end = along(line, 0), [ix, iz] = [end.dx, end.dz], [px, pz] = [-iz, ix];
      for (const behind of [0.4, 1, 1.8]) {
        for (const side of [-(d.width / 2 + 0.8), -d.width / 2, -d.width / 4, 0, d.width / 4, d.width / 2, d.width / 2 + 0.8]) for (const aim of ['corner', 'way in']) {
          // (from out to the side of its end, one steering at its first corner would go along beside it: one comes at its way in)
          if (aim === 'corner' && Math.abs(side) > d.width / 2) continue;
          let x = end.x - ix * behind + px * side, z = end.z - iz * behind + pz * side;
          if (!zoneWalkable(x, z, [], 0.4)) continue;
          tried += 1;
          const mouth = [end.x + ix, end.z + iz];
          let stuck = 0, inside = false, there = aim === 'corner';
          for (let i = 0; i < 800 && !inside && stuck < 60; i += 1) {
            if (!there && Math.hypot(mouth[0] - x, mouth[1] - z) < 0.3) there = true;
            const [tx, tz] = there ? line[1] : mouth;
            const g = Math.hypot(tx - x, tz - z) || 1, dx = ((tx - x) / g) * 0.05, dz = ((tz - z) / g) * 0.05;
            let nx = x + dx, nz = z + dz;
            if (!ok(x, z, nx, nz)) {
              const turn = habitationAlongDeck(x, z, dx, dz, (bx, bz) => ok(x, z, bx, bz));
              if (turn) { nx = x + turn.dx; nz = z + turn.dz; } else { stuck += 1; continue; }
            }
            x = nx; z = nz; stuck = 0;
            const on = habitationDeckAt(x, z);
            inside = !!on && on.deck.id === d.id && (x - end.x) * ix + (z - end.z) * iz > Math.min(2, lengthOf(line.slice(0, 2)) - 0.5);
          }
          assert.ok(inside, `${d.id}: onto it from ${behind} m out past its ${line === d.line ? 'first' : 'far'} end, ${side.toFixed(2)} m to its side, steering at its ${aim} (stopped at (${x.toFixed(2)}, ${z.toFixed(2)}))`);
        }
      }
    }
  }
  assert.ok(tried > 60, `${tried} ways in tried`);
});

test('big signs say swimming in the swamps is not advisable where one wades in and the water soon gets too deep; and that deep water is not walked into', () => {
  assert.ok(HABITATION_SWIM_SIGNS.length >= 10);
  const kinds = new Set();
  for (const s0 of HABITATION_SWIM_SIGNS) {
    assert.equal(s0.lines.map((l) => (typeof l === 'string' ? l : l.text)).slice(0, 2).join(' '), 'SWIMMING IN THE SWAMPS IS NOT ADVISABLE');
    assert.ok(s0.width >= 5 && s0.height >= 2.4, `${s0.id}: a big board`);
    const f = habitationFooting(s0.x, s0.z);
    assert.ok(f && f.walk && ['sand', 'forest', 'grass'].includes(f.kind), `${s0.id}: on dry ground (${f && f.kind})`);
    // the shallows near: a few metres down to them, and beyond them deep water
    let near = null;
    for (let r = 0.5; r <= 7 && !near; r += 0.5) for (let k = 0; k < 48 && !near; k += 1) { const a = (k / 48) * Math.PI * 2, x = s0.x + Math.cos(a) * r, z = s0.z + Math.sin(a) * r; const g = habitationFooting(x, z); if (g && (g.kind === 'shallows' || g.kind === 'water')) near = { x, z, r, water: g.water }; }
    assert.ok(near && near.r >= 1.5 && near.r <= 6.5, `${s0.id}: ${near ? near.r : '?'} m from the water`);
    kinds.add(near.water);
    // facing up from the water, toward whoever comes down to it
    const fx = Math.sin(s0.facing), fz = Math.cos(s0.facing), ax = s0.x - near.x, az = s0.z - near.z, len = Math.hypot(ax, az);
    assert.ok((fx * ax + fz * az) / len > 0.5, `${s0.id}: faces away from the water`);
    // nothing standing in front of it, and its posts in the way of a walker
    for (let d = 1; d <= 6; d += 0.5) for (let k = -2; k <= 2; k += 0.5) { const x = s0.x + fx * d + fz * k, z = s0.z + fz * d - fx * k; assert.equal(zoneSolid(x, z, 0.1) && !habitationSignPosts(s0).some(([px, pz]) => Math.hypot(px - x, pz - z) < 0.5), false, `${s0.id}: nothing in front of it at ${d} m`); }
    for (const [px, pz] of habitationSignPosts(s0)) assert.equal(zoneWalkable(px, pz, [], 0.3), false, `${s0.id}: its post`);
  }
  assert.ok(['lagoon', 'swamp', 'niger', 'falls-pool'].every((w) => kinds.has(w)), [...kinds].join(', '));
  // from the lagoon's west beach straight out: the shallows are waded, then the deep water stops the walker
  for (const x of [2180 + S, 2240 + S]) {
    let z = 112, kinds2 = [];
    while (z < 160 && zoneWalkable(x, z + 0.3, [], 0.4) && zoneStep(x, z, x, z + 0.3)) { z += 0.3; kinds2.push(habitationFooting(x, z).kind); }
    assert.ok(kinds2.includes('shallows'), `at x ${x}: waded in`);
    assert.equal(habitationFooting(x, z + 0.6).kind, 'water', `at x ${x}: stopped where it gets deep (${z.toFixed(1)})`);
  }
});

test('a jump: on foot, seen by those near; never from a vehicle or in the water, nor again before the last is over', () => {
  const w = town(['Jumper One', 'Jumper Two']);
  const [p, q] = w.players, [id, id2] = w.ids;
  w.place(p, 20, 60, 0); w.place(q, 22, 60, 0); run(w.host, 0.2);
  ok(w.send(id, { type: 'jump' }));
  run(w.host, 0.3);
  const seen = w.g.view(id2).others[id];
  assert.ok(seen && seen.jump !== null && seen.jump >= 0.2 && seen.jump < JUMP_EVERY, JSON.stringify(seen && seen.jump));
  refused(w.send(id, { type: 'jump' }), 'NOT_READY');
  run(w.host, JUMP_EVERY);
  assert.equal(w.g.view(id2).others[id].jump, null, 'over');
  ok(w.send(id, { type: 'jump' }));
  // in the water: no
  run(w.host, JUMP_EVERY + 0.1);
  w.place(q, 0, zoneShoreZ(0) - 2, 0); run(w.host, 0.2);
  ok(w.send(id2, { type: 'swim.in' }));
  refused(w.send(id2, { type: 'jump' }), 'SWIMMING');
});

test('a jump is seen by another player in their own game: it travels over the link with how far into it the jumper is, is shown from its beginning, is the same jump word after word, and is over when it is over', () => {
  const j = town(['Jumper Link']);
  j.place(j.p, 30, 60, 0); run(j.host, 0.2);
  assert.equal(j.g.view(j.id).self.jump, null, 'not jumping yet');
  assert.equal(encodePlayer(j.g.view(j.id).self, ZONE.id).jp, undefined);
  ok(j.send(j.id, { type: 'jump' }));
  run(j.host, 0.2);
  const self = j.g.view(j.id).self;
  assert.ok(self.jump >= 0.15 && self.jump < JUMP_EVERY, `${self.jump}`);
  const heard = decodePlayer(JSON.parse(JSON.stringify(encodePlayer(self, ZONE.id))), ZONE.id);
  assert.equal(heard.jump, self.jump);
  // another player's own game: it hears of the jump, a moment late, and shows it from its beginning
  const watcher = createHost();
  const w = watcher.game.join({ name: 'Watcher Link', look: {} });
  watcher.game.state.players[w].x = 32; watcher.game.state.players[w].z = 60;
  watcher.game.visitors.seen('remote-jumper', heard);
  const row = () => watcher.game.view(w).players.find((q) => q.visitor);
  assert.equal(row().jump, 0, 'from its beginning');
  run(watcher, 0.5);
  // (the next word, further into the same jump: still the same jump, not begun again)
  watcher.game.visitors.seen('remote-jumper', { ...heard, jump: 0.7 });
  assert.ok(Math.abs(row().jump - 0.5) < 0.05, `${row().jump}`);
  run(watcher, JUMP_EVERY);
  watcher.game.visitors.seen('remote-jumper', { ...heard, jump: null });
  assert.equal(row().jump, null, 'over');
  // nonsense is not a jump
  for (const bad of [-1, 99, 'high', Infinity]) { watcher.game.visitors.seen('remote-other', { ...heard, name: 'Other Link', jump: bad }); assert.equal(watcher.game.view(w).players.find((q) => q.name === 'Other Link').jump, null, String(bad)); }
});

test('going up the habitation\'s stairs is known where a walker is, for the figure\'s own climb up them', () => {
  for (const id of ['falls-stairs', 'overlook-stairs']) {
    const d = HABITATION_DECKS.find((q) => q.id === id), q = along(d.line, d.length / 2);
    // (the stairs go down from their first point: up them is toward it)
    const up = Math.atan2(-q.dx, -q.dz), down = Math.atan2(q.dx, q.dz);
    assert.equal(habitationClimbing(q.x, q.z, up), true, `${id}: going up`);
    assert.equal(habitationClimbing(q.x, q.z, down), false, `${id}: going down`);
  }
  const bridge = HABITATION_DECKS.find((q) => q.id === 'gorge-bridge'), m = along(bridge.line, bridge.length / 2);
  assert.equal(habitationClimbing(m.x, m.z, Math.atan2(m.dx, m.dz)), false, 'on a bridge');
});
