// The first city block (src/sim/zones/atani-city.js): Market Road as a boulevard between Registry Road and Waterside
// Road, its pavements, its buildings, and how the town's people and traffic use it.
//   node --test test/city.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Z from '../src/sim/zone.js';
import { createHost } from '../src/sim/host.js';
import { graphIndex, graphRoute, graphPoint } from '../src/sim/graph.js';
import { FORMER_TOWN } from './helpers.mjs';

const C = Z;
const inBox = (b, x, z, m = 0) => x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m;
const footprint = (b) => ({ x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 });
const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;

test('the boulevard: four lanes of about three metres between kerbs, Market Road its whole width', () => {
  const B = C.BOULEVARD;
  const road = Z.ZONE_ROADS.find((r) => r.id === 'market');
  assert.deepEqual([road.x0, road.z0, road.x1, road.z1], [B.x0, B.z0, B.x1, B.z1]);
  const width = B.x1 - B.x0;
  assert.ok(width >= 12.5 && width <= 14.5, `${width} m`);
  assert.ok(B.lane >= 3.0 && B.lane <= 3.5);
  assert.ok(Math.abs(2 * (B.centre + 0.12 + 2 * B.lane) - width) < 0.6, 'four lanes and the paired lines fill it');
  // Market Road goes on south as it was
  const south = Z.ZONE_ROADS.find((r) => r.id === 'market-s');
  assert.equal(south.z1, B.z0);
});

test('the pavements stand a kerb above the road, and come down to it at every crossing, with no step to trip on', () => {
  for (const p of C.PAVEMENTS) {
    const x = (p.x0 + p.x1) / 2, z = (p.z0 + p.z1) / 2;
    if (!C.RAMPS.some((r) => inBox(r, x, z))) assert.equal(Z.zoneGroundY(x, z), C.KERB, `${x}, ${z}`);
  }
  assert.ok(C.KERB >= 0.12 && C.KERB <= 0.18);
  assert.equal(Z.zoneGroundY(0, 20), 0, 'the road');
  // walking the line of every crossing, from pavement to pavement: the ground never jumps
  for (const c of C.CROSSINGS) {
    let last = null;
    for (let u = c.from - 4; u <= c.to + 4; u += 0.05) {
      const [x, z] = c.along === 'x' ? [u, c.at] : [c.at, u];
      const y = Z.zoneGroundY(x, z);
      if (last !== null) assert.ok(Math.abs(y - last) < 0.02, `${c.id}: a step of ${(y - last).toFixed(3)} m at ${x.toFixed(2)}, ${z.toFixed(2)}`);
      last = y;
    }
  }
});

test('the buildings: real buildings on their own ground, clear of the roads, the pavements, the plots and each other', () => {
  const city = Z.ZONE_BUILDINGS.filter((b) => b.kind === 'city');
  assert.equal(city.length, C.CITY_BUILDINGS.length);
  assert.ok(city.length >= 6);
  assert.deepEqual(new Set(city.map((b) => b.style)), new Set(['brick', 'pale', 'stone', 'glass']));
  for (const b of city) {
    const f = footprint(b);
    assert.ok(b.storeys >= 4 && b.h >= 12, `${b.id}: a city building`);
    for (const r of Z.ZONE_ROADS) assert.ok(!overlap(f, r), `${b.id} is on ${r.id}`);
    for (const p of C.PAVEMENTS) assert.ok(!overlap(f, p), `${b.id} is on a pavement`);
    for (const p of Z.ZONE_PARCELS) assert.ok(!overlap(f, p), `${b.id} is on plot ${p.id}`);
    for (const o of Z.ZONE_BUILDINGS) if (o !== b) assert.ok(!overlap(f, footprint(o)), `${b.id} and ${o.id}`);
    for (const s of Z.ZONE_SHEDS) assert.ok(!overlap(f, { x0: s.x - s.w / 2, x1: s.x + s.w / 2, z0: s.z - s.d / 2, z1: s.z + s.d / 2 }), `${b.id} and ${s.id}`);
    for (const s of Z.ZONE_STALLS) assert.ok(!inBox(f, s.x, s.z, 1.5), `${b.id} and a market stall`);
    for (const sp of Z.ZONE_SPOTS) assert.ok(!inBox(f, sp.x, sp.z, 0.4), `${b.id} and ${sp.venue} ${sp.slot}`);
    assert.equal(Z.zoneWalkable(b.x, b.z), false, `${b.id} is solid`);
  }
  // everything the town had here is where it was: the police post, the clinic, the store, the kitchen, the sheds,
  // the HOLARIS showroom, the motor park's bays
  for (const id of ['police', 'clinic', 'store', 'kitchen', 'holaris']) assert.ok(Z.zoneBuilding(id), id);
  for (const id of ['police', 'clinic', 'store', 'kitchen']) {
    const p = Z.ZONE_PLACES[id];
    assert.ok(Z.zoneWalkable(p.x, p.z), `${id}: its door can be reached`);
  }
});

test('the way into the market and to the store\'s door is left open from the boulevard', () => {
  for (let x = 11; x < 23; x += 0.5) assert.ok(Z.zoneWalkable(x, 21, [], 1.2), `a keke can pass at ${x}, 21`);
});

test('the street furniture stands on the pavement, and leaves the way along it and across the crossings clear', () => {
  for (const f of C.CITY_FURNITURE) {
    if (f.kind === 'drain' || f.kind === 'manhole') { assert.ok(C.onBoulevard(f.x, f.z), `${f.kind} in the road`); continue; }
    assert.ok(Z.zoneGroundY(f.x, f.z) > 0 || C.PAVEMENTS.some((p) => inBox(p, f.x, f.z, 0.6)), `${f.kind} at ${f.x}, ${f.z} is on the pavement`);
  }
  // the walking line down the west pavement is clear the whole length of the block
  for (let z = -28; z < 102; z += 0.25) assert.ok(Z.zoneWalkable(-8.6, z), `blocked at -8.6, ${z}`);
  for (let z = -28; z < 102; z += 0.25) assert.ok(Z.zoneWalkable(8.6, z), `blocked at 8.6, ${z}`);
  for (const c of C.CROSSINGS) for (let u = c.from; u <= c.to; u += 0.25) { const [x, z] = c.along === 'x' ? [u, c.at] : [c.at, u]; assert.ok(Z.zoneWalkable(x, z), `${c.id}: blocked at ${x}, ${z}`); }
  // streetlights both sides; signals at the junction for all four ways in
  assert.ok(C.CITY_FURNITURE.filter((f) => f.kind === 'light').length >= 10);
  assert.ok(C.CITY_FURNITURE.filter((f) => f.kind === 'signal' && f.phase < 2).length >= 4);
});

test('people on foot walk the pavement, not down the middle of the road, and cross where the crossings are', () => {
  // a walk the length of the block, from the motor park to the police post
  const route = graphRoute(graphIndex('park'), graphIndex('police_door')).map((i) => graphPoint(i));
  for (let k = 1; k < route.length; k += 1) {
    const [ax, az] = route[k - 1], [bx, bz] = route[k];
    const along = Math.abs(bz - az) > 20 && Math.abs(bx - ax) < 2;
    assert.ok(!(along && C.onBoulevard((ax + bx) / 2, (az + bz) / 2)), `walks along the road from ${ax},${az} to ${bx},${bz}`);
  }
});

// (the townspeople's ways and the okadas are judged on the town as it was until 22 October 2026, FORMER_TOWN: the
// town has no townspeople and no okadas now, and their systems are kept ready)
test('someone about to cross the boulevard stops at the kerb first', () => {
  const host = createHost({ people: FORMER_TOWN });
  const pop = host.game.internals.population;
  const t0 = host.game.state.t;
  // find people whose way today steps from the pavement onto the boulevard, and watch them there
  let seen = 0, stood = 0;
  const out = {};
  for (let i = 0; i < pop.people.length && seen < 20; i += 1) {
    for (let s = 0; s < 86400 && seen < 20; s += 30) {
      pop.locate(i, t0 - (t0 % 86400) + s, out);
      if (!out.leg || !out.leg.path || !out.leg.path.still || out.leg.ride) continue;      // (one going by okada rides past)
      seen += 1;
      // walk through that leg second by second: they stand still at the kerb for a few seconds before stepping out
      const leg = out.leg, base = t0 - (t0 % 86400);
      let still = 0;
      for (let u = leg.t0; u < leg.t1; u += 0.5) { pop.locate(i, base + u, out); if (!out.moving && out.leg === leg) still += 0.5; }
      if (still >= 1.5) stood += 1;
      break;
    }
  }
  assert.ok(seen >= 5, `${seen} crossings watched`);
  assert.equal(stood, seen, `every one of them waited at the kerb (${stood} of ${seen})`);
});

test('the traffic signals: Market Road and Registry Road take turns, never green together; riders wait at a red light', () => {
  for (let t = 0; t < C.SIGNAL_CYCLE; t += 0.25) {
    assert.ok(!(C.signalState(0, t) !== 'red' && C.signalState(1, t) !== 'red'), `both ways open at ${t}`);
  }
  assert.ok([...Array(34).keys()].some((t) => C.signalState(0, t) === 'green'));
  assert.ok([...Array(34).keys()].some((t) => C.signalState(1, t) === 'green'));
  // northbound up to the junction on red: held at the line; on green: through
  const red = [...Array(340).keys()].map((k) => k / 10).find((t) => C.signalState(0, t) === 'red');
  const green = [...Array(340).keys()].map((k) => k / 10).find((t) => C.signalState(0, t) === 'green');
  assert.equal(C.trafficHold(0, -50, 0, -48.5, red), true);
  assert.equal(C.trafficHold(0, -50, 0, -48.5, green), false);
  assert.equal(C.trafficHold(0, -48, 0, -46, red), false, 'already over the line: it goes on');
  assert.equal(C.trafficHold(-12, -40, -10, -40, [...Array(340).keys()].map((k) => k / 10).find((t) => C.signalState(1, t) === 'red')), true, 'Registry Road too');
});

test('the town\'s okadas ride in their lane on the boulevard and stop for the lights', () => {
  const host = createHost({ people: FORMER_TOWN });
  const g = host.game;
  let onBlvd = 0, inLane = 0, heldAtRed = 0;
  for (let k = 0; k < 2400; k += 1) {
    host.tick(0.25);
    const list = g.internals.okada ? g.internals.okada.list(0, 30, null) : [];
    for (const o of list) {
      if (!o.moving || !C.onBoulevard(o.x, o.z) || o.z < -28 || o.z > 100) continue;
      onBlvd += 1;
      if (Math.abs(Math.abs(o.x) - 1.85) < 0.6) inLane += 1;
    }
    const riders = g.internals.okada ? g.internals.okada.riders : [];
    for (const r of riders) if (r.held) heldAtRed += 1;
  }
  assert.ok(onBlvd > 20, `${onBlvd} sightings on the boulevard`);
  assert.ok(inLane / onBlvd > 0.9, `${inLane} of ${onBlvd} in the inner lane`);
  assert.ok(heldAtRed > 0, 'some waited at a red light');
});
