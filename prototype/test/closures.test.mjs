// The roads that are not open yet, and the edge of the built land (19 October 2026, the owner's brief: "Players
// must be able to see that these routes are not available instead of travelling into an incomplete area, hitting
// invisible boundaries, falling, or discovering missing map geometry").
//   node --test test/closures.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { AREA_STATE, ROAD_CLOSURES, openClosures, closureColliders, CLOSURE_KIT, EDGE_FENCE } from '../src/sim/zones/closures.js';
import { ZONE_CLOSURES, ZONE_EDGE_FENCES, ZONE_ROADS, ZONE_NODES, ZONE_EDGES, zoneWalkable, zoneBlockKind, zoneSolid, zoneOnGround } from '../src/sim/zone.js';

const along = (c, t) => ({ x: c.a.x + (c.b.x - c.a.x) * t, z: c.a.z + (c.b.z - c.a.z) * t });

test('every part of the land is in one of four states; the roads closed now are all under construction, and each is closed by what is drawn', () => {
  assert.deepEqual(Object.values(AREA_STATE).sort(), ['closed', 'open', 'restricted', 'under construction']);
  for (const c of ROAD_CLOSURES) assert.ok(Object.values(AREA_STATE).includes(c.state), c.id);
  assert.deepEqual(ROAD_CLOSURES.map((c) => c.id), ['waterside-south', 'waterside-north', 'registry-north', 'campus-north', 'college-west']);
  assert.ok(ROAD_CLOSURES.every((c) => c.state === AREA_STATE.BUILDING && c.sign[0] === 'ROAD CLOSED' && c.why.length > 10));
  // what is closed is what is not open: one that is opened has no roadblock and nothing solid
  assert.deepEqual(ZONE_CLOSURES.map((c) => c.id), openClosures().map((c) => c.id));
  const opened = ROAD_CLOSURES.map((c) => (c.id === 'waterside-south' ? { ...c, state: AREA_STATE.OPEN } : c)).filter((c) => c.state !== AREA_STATE.OPEN);
  assert.equal(closureColliders(opened).length, ROAD_CLOSURES.length - 1);
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
    const roads = ZONE_ROADS.filter((r) => {
      const [w0, w1, l0, l1] = alongZ ? [r.z0, r.z1, r.x0, r.x1] : [r.x0, r.x1, r.z0, r.z1];
      return w0 >= lo - 0.01 && w1 <= hi + 0.01 && l1 >= at - 3 && l0 <= at + 3;
    });
    assert.ok(roads.length >= 1, `${c.id} closes a road`);
    for (const r of roads) { const [w0, w1] = alongZ ? [r.z0, r.z1] : [r.x0, r.x1]; assert.ok(lo <= w0 - 2 && hi >= w1 + 2, `${c.id}: ${r.id} (${w0} to ${w1}) closed across its whole width and both verges (${lo} to ${hi})`); }
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
