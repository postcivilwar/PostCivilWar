// Oganiru City, Stage 3 (2 November 2026; the owner's brief of 31 October, "The whole downtown and the skyline"): the
// towers, where they stand and what they are; each solid to its top and standing clear of the roads, decks and its
// neighbours; its front toward its street, its plaza out to that street's walkway; its door on the townspeople's ways.
//   node --test test/oganiru-downtown.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { OGANIRU, OGANIRU_ROADS, OGANIRU_DECKS, OGANIRU_TOWERS, OGANIRU_LAMPS, OGANIRU_TREES, OGANIRU_JUNCTIONS, OGANIRU_ROUNDABOUTS, OGANIRU_SIGNALS, OGANIRU_KERBED, oganiruGroundY, oganiruDecksAt, onOganiru, zoneWalkable, zoneSolid, towerFront } from '../src/sim/zone.js';
import { roadWidthAt, OGANIRU_BILLBOARDS } from '../src/sim/zones/oganiru.js';
import { cityWalks, cityRoute } from '../src/sim/city-walks.js';

const KERB = OGANIRU.kerb;
const HIGH = OGANIRU_TOWERS.filter((t) => t.storeys >= 15);
const OFFICES = OGANIRU_TOWERS.filter((t) => t.storeys >= 6 && t.storeys <= 12);
// (on a road's carriageway: which)
const roadAt = (x, z) => OGANIRU_ROADS.find((r) => r.kind !== 'cutting' && (r.along === 'z' ? z >= r.from && z <= r.to && Math.abs(x - r.c) <= roadWidthAt(r, z).half : x >= r.from && x <= r.to && Math.abs(z - r.c) <= roadWidthAt(r, x).half));
// (how far apart two towers' footprints are; 0 if they touch)
const gap = (a, b) => Math.max(0, Math.abs(a.x - b.x) - (a.dx + b.dx) / 2, Math.abs(a.z - b.z) - (a.dz + b.dz) / 2);
const inside = (t, x, z, pad = 0) => (t.kind === 'round' ? Math.hypot(x - t.x, z - t.z) < t.dx / 2 + pad : Math.abs(x - t.x) < t.dx / 2 + pad && Math.abs(z - t.z) < t.dz / 2 + pad);

test('downtown: 20 to 40 high-rises of 15 to 50 storeys, glass offices of 6 to 12, every kind the brief asks for', () => {
  assert.ok(HIGH.length >= 20 && HIGH.length <= 40, `${HIGH.length} high-rises`);
  for (const t of HIGH) assert.ok(t.storeys <= 50, `${t.name}: ${t.storeys} storeys`);
  assert.ok(OFFICES.length >= 4, `${OFFICES.length} offices of 6 to 12 storeys`);
  for (const t of OFFICES) assert.ok(t.kind.startsWith('office-'), `${t.name}: glass offices`);
  const kinds = new Set(OGANIRU_TOWERS.map((t) => t.kind));
  for (const k of ['glass-blue', 'glass-teal', 'glass-grey', 'ribbed-white', 'stone', 'round']) assert.ok(kinds.has(k), `a ${k} tower`);
  const round = OGANIRU_TOWERS.filter((t) => t.kind === 'round');
  assert.ok(round.length >= 1 && round.length <= 2, `${round.length} round`);
  // the stone ones' stepped, decorated tops; the tallest, nearly 50 storeys
  for (const t of OGANIRU_TOWERS.filter((q) => q.kind === 'stone')) assert.ok(t.crown >= 10, `${t.name}: its crown ${t.crown} m`);
  assert.ok(OGANIRU_TOWERS.some((t) => t.storeys >= 45), 'one of 45 storeys or more');
  // made-up names, every one its own, on its lobby and its shops
  const names = new Set(OGANIRU_TOWERS.map((t) => t.name));
  assert.equal(names.size, OGANIRU_TOWERS.length, 'every tower its own name');
  for (const t of OGANIRU_TOWERS) { assert.ok(t.lobby && t.lobby === t.name.toUpperCase(), `${t.name}: its name over its doors`); assert.ok(t.shops && t.shops.length >= 1, `${t.name}: its shops`); }
});

test('no two neighbours alike: towers whose footprints are within 70 m of each other are of different kinds', () => {
  for (const a of OGANIRU_TOWERS) for (const b of OGANIRU_TOWERS) {
    if (a === b || gap(a, b) > 70) continue;
    assert.notEqual(a.kind, b.kind, `${a.name} and ${b.name}, ${gap(a, b).toFixed(0)} m apart`);
  }
});

test('every tower is solid to its top, on the city\'s land, clear of every road, deck, junction and roundabout, and of its neighbours', () => {
  for (const t of OGANIRU_TOWERS) {
    assert.ok(!zoneWalkable(t.x, t.z, [], 0.4, 0.15), `${t.name} is solid`);
    assert.ok(zoneSolid(t.x, t.z, 0.25, t.height - 1), `${t.name} to its top`);
    // its footprint and the room round it (4 m): on the city's land, on no road's carriageway, under no deck
    const pad = 4;
    for (let x = t.x - t.dx / 2 - pad; x <= t.x + t.dx / 2 + pad; x += 2) for (let z = t.z - t.dz / 2 - pad; z <= t.z + t.dz / 2 + pad; z += 2) {
      assert.ok(onOganiru(x, z), `${t.name}: (${x}, ${z}) on the city's land`);
      const r = roadAt(x, z);
      assert.ok(!r, `${t.name}: (${x.toFixed(0)}, ${z.toFixed(0)}) on ${r && r.id}`);
      assert.equal(oganiruDecksAt(x, z).length, 0, `${t.name}: (${x.toFixed(0)}, ${z.toFixed(0)}) under a deck`);
    }
    for (const j of OGANIRU_JUNCTIONS) assert.ok(!(Math.abs(j.x - t.x) < j.hx + t.dx / 2 && Math.abs(j.z - t.z) < j.hz + t.dz / 2), `${t.name}: in the junction ${j.id}`);
    for (const r of OGANIRU_ROUNDABOUTS) assert.ok(Math.hypot(r.x - t.x, r.z - t.z) > r.outer + r.walk + Math.hypot(t.dx, t.dz) / 2, `${t.name}: by ${r.id}`);
    // the expressway's viaduct and cutting: well clear
    assert.ok(Math.abs(t.z - OGANIRU_DECKS.find((d) => d.id === 'viaduct').path[0].z) - t.dz / 2 > 40, `${t.name}: clear of the expressway`);
  }
  for (const a of OGANIRU_TOWERS) for (const b of OGANIRU_TOWERS) if (a !== b) assert.ok(gap(a, b) >= 8, `${a.name} and ${b.name}: ${gap(a, b).toFixed(1)} m apart`);
});

test('each tower\'s front looks onto its street: its plaza runs out to that street\'s walkway, and the walkway to the road', () => {
  for (const t of OGANIRU_TOWERS) {
    const [fx, fz] = t.face;
    const f = towerFront(t);
    // across its front (its middle and a little to either side of its doors), from its face out to the walkway: raised
    // behind a kerb all the way (the plaza, then the walkway); then the street's carriageway within the next 8 m
    for (const side of [-6, 0, 6]) {
      const sx = f.x + f.along[0] * side, sz = f.z + f.along[1] * side;
      const out = fx ? Math.abs(t.front - sx) : Math.abs(t.front - sz);
      // (its steps up to its doors first, 8 m wide, each 15 cm, out to 0.9, 1.8 and 2.7 m: stood on, 5 November 2026)
      const step = (d) => (Math.abs(side) >= 4 ? 0 : d <= 0.9 ? 0.45 : d <= 1.8 ? 0.3 : d <= 2.7 ? 0.15 : 0);
      // (further out, across a plaza, another tower's steps may be met: raised all the way)
      for (let d = 0.5; d <= out + 1; d += 0.5) {
        const y = oganiruGroundY(sx + fx * d, sz + fz * d);
        assert.ok(step(d) ? Math.abs(y - (KERB + step(d))) < 1e-9 : y >= KERB - 1e-9, `${t.name}: ${d} m out of its front (${side} along) is its steps, its plaza or the walkway`);
      }
      let road = null;
      for (let d = out + 1; d <= out + 8 && !road; d += 0.5) road = roadAt(sx + fx * d, sz + fz * d);
      assert.ok(road, `${t.name}: its street within 8 m of its plaza's edge (${side} along)`);
    }
  }
});

test('nothing stands in a tower or on its steps: the city\'s lamps, trees, signals and billboards', () => {
  for (const t of OGANIRU_TOWERS) {
    for (const l of OGANIRU_LAMPS) assert.ok(!inside(t, l.x, l.z, 0.5), `a ${l.kind} lamp in ${t.name}`);
    for (const q of OGANIRU_TREES) assert.ok(!inside(t, q.x, q.z, 1.5), `a tree in ${t.name}`);
    for (const s of OGANIRU_SIGNALS) assert.ok(!inside(t, s.x, s.z, 0.5), `a signal in ${t.name}`);
    for (const b of OGANIRU_BILLBOARDS || []) assert.ok(!inside(t, b.x, b.z, 4), `a billboard in ${t.name}`);
    // its steps and the way in clear (3 m out of its front, 5 m either side of its doors): no lamp nor tree there
    const f = towerFront(t, 1.5);
    for (const l of [...OGANIRU_LAMPS, ...OGANIRU_TREES]) {
      const dx = l.x - f.x, dz = l.z - f.z, along = dx * f.along[0] + dz * f.along[1], out = dx * t.face[0] + dz * t.face[1];
      assert.ok(!(Math.abs(along) < 5 && Math.abs(out) < 1.6), `${t.name}: something on its steps at (${l.x.toFixed(1)}, ${l.z.toFixed(1)})`);
    }
  }
});

test('every tower has its door on the city\'s pavements, and from each door a walk to another tower\'s', () => {
  const W = cityWalks();
  const doors = W.doors || [];
  assert.equal(doors.length, OGANIRU_TOWERS.length, 'a door each');
  for (const t of OGANIRU_TOWERS) assert.ok(doors.some((d) => d.tower === t.id), `${t.name}: its door`);
  // from each door, on foot, to a door across downtown (and none of it over a deck or along the expressway)
  const far = (d) => doors.reduce((best, e) => (Math.hypot(e.x - d.x, e.z - d.z) > Math.hypot(best.x - d.x, best.z - d.z) ? e : best), doors[0]);
  for (const d of doors) {
    const e = far(d);
    const route = cityRoute({ x: d.x, z: d.z, y: KERB }, { x: e.x, z: e.z, y: KERB }, { foot: true });
    assert.ok(route && route.length >= 2, `${d.name} to ${e.name} on foot`);
    for (const p of route) assert.ok(!(p[2] > 0.6), `${d.name} to ${e.name}: up at ${p[2]} m`);
  }
});
