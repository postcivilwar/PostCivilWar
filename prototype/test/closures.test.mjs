// The roads that are not open yet, and the edge of the built land (19 October 2026, the owner's brief: "Players
// must be able to see that these routes are not available instead of travelling into an incomplete area, hitting
// invisible boundaries, falling, or discovering missing map geometry").
//   node --test test/closures.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { AREA_STATE, ROAD_CLOSURES, openClosures, closureColliders, CLOSURE_KIT, EDGE_FENCE } from '../src/sim/zones/closures.js';
import { ZONE_CLOSURES, ZONE_EDGE_FENCES, ZONE_ROADS, ZONE_NODES, ZONE_EDGES, zoneWalkable, zoneBlockKind, zoneSolid, zoneOnGround } from '../src/sim/zone.js';
import { OGANIRU_CLOSURES, OGANIRU_ROADS, OGANIRU_DECKS } from '../src/sim/zones/oganiru.js';

// Oganiru City's roads (31 October 2026) as boxes like the town's: across their whole width, from end to end
const CITY_ROADS = OGANIRU_ROADS.map((r) => (r.along === 'z' ? { id: r.id, x0: r.c - r.half, x1: r.c + r.half, z0: r.from, z1: r.to } : { id: r.id, x0: r.from, x1: r.to, z0: r.c - r.half, z1: r.c + r.half }));
// and its slip roads where they leave the ground (1 November 2026: the one up onto the expressway's north-bound
// carriageway from Peace Avenue, which runs only to the road works at its north end, is closed at its foot): the first
// twenty metres of each, across its width (walls or kerbs either side of it rather than verges)
const SLIP_FEET = OGANIRU_DECKS.filter((d) => d.kind === 'ramp').map((d) => { const P = d.path, p = P[0].y < 0.3 ? P[0] : P[P.length - 1]; return Math.abs(p.ux) > Math.abs(p.uz) ? { id: d.id, slip: true, x0: p.x - 10, x1: p.x + 10, z0: p.z - d.half, z1: p.z + d.half } : { id: d.id, slip: true, x0: p.x - d.half, x1: p.x + d.half, z0: p.z - 10, z1: p.z + 10 }; });

const BETWEEN = new Set(['oganiru-town-west', 'oganiru-town-north', 'oganiru-airport-west', 'oganiru-airport-south', 'oganiru-kwale-inland', 'oganiru-kwale-end']);
const along = (c, t) => ({ x: c.a.x + (c.b.x - c.a.x) * t, z: c.a.z + (c.b.z - c.a.z) * t });

test('every part of the land is in one of four states; the roads closed now are all under construction, and each is closed by what is drawn', () => {
  assert.deepEqual(Object.values(AREA_STATE).sort(), ['closed', 'open', 'restricted', 'under construction']);
  for (const c of ROAD_CLOSURES) assert.ok(Object.values(AREA_STATE).includes(c.state), c.id);
  assert.deepEqual(ROAD_CLOSURES.map((c) => c.id), ['waterside-south', 'waterside-north', 'registry-north', 'campus-north', 'college-west']);
  // (Waterside Road's north end is open since 20 October 2026: it goes on up the river to the habitation)
  assert.equal(ROAD_CLOSURES.find((c) => c.id === 'waterside-north').state, AREA_STATE.OPEN);
  // (College Road's west end is open since 31 October 2026: it goes on as Oganiru City's Unity Avenue)
  assert.equal(ROAD_CLOSURES.find((c) => c.id === 'college-west').state, AREA_STATE.OPEN);
  // (Campus Road's north end is open since 1 November 2026: it goes on as Oganiru City's Campus Link)
  assert.equal(ROAD_CLOSURES.find((c) => c.id === 'campus-north').state, AREA_STATE.OPEN);
  // the new city's roads that go no further yet, each closed where it stops (Stage 2: the far ends of its avenues, the
  // Kwale road on south, the roundabouts' legs not built on; the slip road onto the expressway north of Peace Avenue,
  // closed at its foot until 4 November 2026, is open: there is road ahead, up to the road works at its north end)
  assert.deepEqual(OGANIRU_CLOSURES.map((c) => c.id), ['unity-west', 'harmony-west', 'kwale-south', 'airport-south', 'campus-north']);
  assert.ok([...ROAD_CLOSURES, ...OGANIRU_CLOSURES].filter((c) => c.state !== AREA_STATE.OPEN).every((c) => c.state === AREA_STATE.BUILDING && c.sign[0] === 'ROAD CLOSED' && c.why.length > 10));
  // what is closed is what is not open, the town's and the city's: one that is opened has no roadblock and nothing solid
  assert.deepEqual(ZONE_CLOSURES.map((c) => c.id), [...openClosures(), ...OGANIRU_CLOSURES].map((c) => c.id));
  const opened = ROAD_CLOSURES.map((c) => (c.id === 'waterside-south' ? { ...c, state: AREA_STATE.OPEN } : c)).filter((c) => c.state !== AREA_STATE.OPEN);
  assert.equal(closureColliders(opened).length, ROAD_CLOSURES.filter((c) => c.state !== AREA_STATE.OPEN).length - 1);
  assert.ok(!closureColliders(opened).some((b) => b.closure === 'waterside-south'));
});

test('each roadblock stands across the whole of its road and both verges, on the land, where the road runs out, and is solid there and nowhere else', () => {
  for (const c of ZONE_CLOSURES) {
    // (a line along z at one x, or along x at one z)
    const alongZ = Math.abs(c.a.z - c.b.z) > Math.abs(c.a.x - c.b.x);
    const at = alongZ ? c.a.x : c.a.z;
    const lo = alongZ ? Math.min(c.a.z, c.b.z) : Math.min(c.a.x, c.b.x), hi = alongZ ? Math.max(c.a.z, c.b.z) : Math.max(c.a.x, c.b.x);
    // the road it closes: across the line, or ending within a few metres of it; all of its width inside the line,
    // with a verge's room either side
    const roads = [...ZONE_ROADS, ...CITY_ROADS, ...SLIP_FEET].filter((r) => {
      const [w0, w1, l0, l1] = alongZ ? [r.z0, r.z1, r.x0, r.x1] : [r.x0, r.x1, r.z0, r.z1];
      return w0 >= lo - 0.01 && w1 <= hi + 0.01 && l1 >= at - 3 && l0 <= at + 3;
    });
    assert.ok(roads.length >= 1, `${c.id} closes a road`);
    for (const r of roads) { const [w0, w1] = alongZ ? [r.z0, r.z1] : [r.x0, r.x1], verge = r.slip ? 0 : 2; assert.ok(lo <= w0 - verge && hi >= w1 + verge, `${c.id}: ${r.id} (${w0} to ${w1}) closed across its whole width and both verges (${lo} to ${hi})`); }
    // on the land, and solid all along it: a roadblock, which gives a little ('barrier')
    for (let t = 0; t <= 1.0001; t += 0.1) { const p = along(c, t); assert.ok(zoneOnGround(p.x, p.z), `${c.id} at ${t}: on the land`); assert.equal(zoneBlockKind(p.x, p.z, [], 0.3), 'barrier', `${c.id} at ${t}`); }
    // the way to it is open, with room before it to see it and stop (`facing`: the way the traffic meeting it comes from)
    const mid = along(c, 0.5);
    for (const d of [1.4, 4, 10, 20]) assert.ok(zoneWalkable(mid.x + Math.sin(c.facing) * d, mid.z + Math.cos(c.facing) * d, [], 0.6), `${c.id}: open ${d} m before it`);
    // no wider than drawn: past either end is not part of it
    for (const t of [-0.08, 1.08]) { const p = along(c, t); assert.notEqual(zoneBlockKind(p.x, p.z, [], 0.1), 'barrier', `${c.id} beyond its end`); }
  }
});

test('the fence along the edge of the built land: on the land, where the land ends; it never closes a road that goes on, nor any of the town\'s paths', () => {
  assert.ok(ZONE_EDGE_FENCES.length >= 8, `${ZONE_EDGE_FENCES.length} runs`);
  const metres = ZONE_EDGE_FENCES.reduce((a, r) => a + Math.hypot(r.b.x - r.a.x, r.b.z - r.a.z), 0);
  assert.ok(metres > 2000, `${Math.round(metres)} m of fence`);
  for (const r of ZONE_EDGE_FENCES) {
    const len = Math.hypot(r.b.x - r.a.x, r.b.z - r.a.z);
    assert.ok(len >= EDGE_FENCE.least, r.line);
    for (let t = 0; t <= 1; t += 0.25) {
      const p = { x: r.a.x + (r.b.x - r.a.x) * t, z: r.a.z + (r.b.z - r.a.z) * t };
      assert.ok(zoneOnGround(p.x, p.z), `${r.line} on the land`);
      // (but where Oganiru City's land meets the town's, the airport's and the Kwale road's: a fence between two lands,
      // since 1 November 2026, open only where a road goes through)
      // (and the fences at a roadblock's ends, back along the road it closes to the land's edge: 4 November 2026)
      if (BETWEEN.has(r.line) || /(^|-)wing-/.test(r.line)) continue;
      assert.ok(!zoneOnGround(p.x + r.out.x * EDGE_FENCE.beyond, p.z + r.out.z * EDGE_FENCE.beyond), `${r.line}: the land ends just beyond it`);
    }
  }
  // none of the town's paths (people walking, vehicles driving) crosses a roadblock or the fence
  const solid = (x, z) => zoneBlockKind(x, z, [], 0.05) === 'barrier';
  const crossing = [];
  for (const [p, q] of ZONE_EDGES) {
    const a = ZONE_NODES[p], b = ZONE_NODES[q];
    for (let t = 0; t <= 1; t += 0.02) if (solid(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) { crossing.push(`${p}-${q}`); break; }
  }
  assert.deepEqual(crossing, []);
  // the road to Kwale goes on from the town: nothing across it where it leaves
  for (let x = -260; x >= -1180; x -= 2) assert.ok(zoneWalkable(x, -40, [], 0.6), `the road to Kwale at ${x}`);
});

test('what is low does not stand in the way of the camera\'s eye: it looks over a roadblock and the fence, not through a building', () => {
  assert.equal(zoneSolid(-243, 113, 0.25), true);
  assert.equal(zoneSolid(-243, 113, 0.25, 1.0), true, 'below the top of the boards');
  assert.equal(zoneSolid(-243, 113, 0.25, 1.8), false, 'over them');
  const fence = ZONE_EDGE_FENCES[0];
  const f = { x: (fence.a.x + fence.b.x) / 2, z: (fence.a.z + fence.b.z) / 2 };
  assert.equal(zoneSolid(f.x, f.z, 0.25), true);
  assert.equal(zoneSolid(f.x, f.z, 0.25, 1.8), false);
  // the purple tower's foot is solid at any height
  assert.equal(zoneSolid(-101.5, 100, 0.25, 1.8), true);
  assert.ok(CLOSURE_KIT.height < 1.4);
});

// (4 November 2026, the owner: "You need to enforce in the game so that user can't pass through any area with road
// block ... remove road blocks if there's road ahead")
test('nobody gets past a roadblock: not through it, not round it over the verges and the grass (fenced at its ends back to the land\'s edge)', async () => {
  const { ZONE_CLOSURE_WINGS } = await import('../src/sim/zone.js');
  assert.equal(ZONE_CLOSURE_WINGS.length, ZONE_CLOSURES.length * 2, 'a fence at each end of each roadblock');
  const R = 0.4, STEP = 0.6;
  for (const c of ZONE_CLOSURES) {
    const mid = along(c, 0.5);
    const fx = Math.sin(c.facing), fz = Math.cos(c.facing);
    const start = { x: mid.x + fx * 6, z: mid.z + fz * 6 }, goal = { x: mid.x - fx * 3, z: mid.z - fz * 3 };
    assert.ok(zoneWalkable(start.x, start.z, [], R) && zoneWalkable(goal.x, goal.z, [], R), `${c.id}: open either side of it`);
    // every place a body can reach from before it, within the wings' length round it
    const wings = ZONE_CLOSURE_WINGS.filter((w) => w.id.endsWith(`wing-${c.id}-a`) || w.id.endsWith(`wing-${c.id}-b`));
    const reach = Math.max(...wings.map((w) => Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z))) + 30;
    const key = (i, j) => `${i},${j}`;
    const seen = new Set([key(0, 0)]), queue = [[0, 0]];
    const gi = Math.round((goal.x - start.x) / STEP), gj = Math.round((goal.z - start.z) / STEP);
    let got = false;
    while (queue.length && !got) {
      const [i, j] = queue.shift();
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj, k = key(ni, nj);
        if (seen.has(k)) continue;
        seen.add(k);
        const x = start.x + ni * STEP, z = start.z + nj * STEP;
        if (Math.hypot(x - mid.x, z - mid.z) > reach || !zoneWalkable(x, z, [], R)) continue;
        if (Math.abs(ni - gi) <= 1 && Math.abs(nj - gj) <= 1) { got = true; break; }
        queue.push([ni, nj]);
      }
    }
    assert.ok(!got, `${c.id}: the road beyond it reached from before it`);
    assert.ok(seen.size > 2000, `${c.id}: the way to it is open (${seen.size})`);
  }
});

test('the slip road from Peace Avenue onto the expressway is open (road ahead); the road works at the expressway\'s north end are solid', async () => {
  const { OGANIRU_DECKS: decks } = await import('../src/sim/zones/oganiru.js');
  const { walkLevel } = await import('../src/sim/levels.js');
  const slip = decks.find((d) => d.id === 'p-nb-on');
  // up it, a step at a time, from Peace Avenue to the top, on its level
  let y = 0;
  for (let k = 1; k < slip.path.length; k += 1) {
    const a = slip.path[k - 1], b = slip.path[k];
    y = walkLevel(a.x, a.z, y, b.x, b.z, [], 1.0, 0.5);
    assert.ok(y !== null, `the slip road open at ${b.s.toFixed(0)} m`);
  }
  assert.ok(y > 7, `up on the expressway (${y.toFixed(1)} m)`);
  // the viaduct's north end: its road works' barriers 6 m short of its end wall, and nobody past them
  const v = decks.find((d) => d.id === 'viaduct'), end = v.path[v.path.length - 1];
  const at = (s, off) => ({ x: end.x - end.ux * s - end.uz * off, z: end.z - end.uz * s + end.ux * off });
  for (const off of [-12, -6, 6, 12]) {
    const before = at(9, off), past = at(4, off);
    assert.ok(zoneWalkable(before.x, before.z, [], 1.0, end.y), `before the road works (${off})`);
    assert.ok(!zoneWalkable(past.x, past.z, [], 1.0, end.y), `past the road works (${off})`);
  }
});
