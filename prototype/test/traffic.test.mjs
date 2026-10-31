// The town's traffic: its motorists in the showroom's cars, and taking one (30 October 2026, the owner's brief: "You
// need to allow the NPC to drive different kinds of cars based on the cars available at the showroom. Users can
// hijack cars but can never put the car for sale. And if police catch them, all cars must be returned.").
//   node --test test/traffic.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { town, ok, refused, until } from './world.mjs';
import { TRAFFIC, TRAFFIC_MODELS, TRAFFIC_ROADS, TRAFFIC_STOPS, trafficNetwork } from '../src/sim/traffic.js';
import { POWER_CARS } from '../src/sim/power-cars.js';
import { CAR_PARTS } from '../src/client/car-parts.js';
import { ZONE_ROADS, OUTSKIRT_ROADS } from '../src/sim/zone.js';
import { NPC_FIGURES } from '../src/sim/npc-figures.js';
import { driverSide } from '../src/sim/hijack.js';
import { signalState, CITY_AREA } from '../src/sim/zones/atani-city.js';
import { createHost } from '../src/sim/host.js';

const roadsAll = [...ZONE_ROADS, ...OUTSKIRT_ROADS];
const onRoad = (x, z, m) => roadsAll.some((r) => x >= r.x0 - m && x <= r.x1 + m && z >= r.z0 - m && z <= r.z1 + m);
// two cars, as boxes turned as they stand: do they overlap? (separating axes)
const corners = (c) => { const s = POWER_CARS[c.model]; const ux = Math.sin(c.h), uz = Math.cos(c.h), sx = Math.cos(c.h), sz = -Math.sin(c.h); const L = s.length / 2, W = s.width / 2; return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => [c.x + ux * L * a + sx * W * b, c.z + uz * L * a + sz * W * b]); };
function overlap(A, B) {
  const pa = corners(A), pb = corners(B);
  for (const poly of [pa, pb]) for (let i = 0; i < 4; i += 1) {
    const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % 4];
    const nx = -(z1 - z0), nz = x1 - x0;
    const a = pa.map(([x, z]) => x * nx + z * nz), b = pb.map(([x, z]) => x * nx + z * nz);
    if (Math.max(...a) < Math.min(...b) || Math.max(...b) < Math.min(...a)) return false;
  }
  return true;
}
const onRoads = (c) => c.mode === 'drive' || c.mode === 'stop';
// a car standing at the roadside with its driver at the wheel, and where to stand to take it
function standingCar(w) {
  const T = w.I.traffic;
  for (let k = 0; k < 2400; k += 1) {
    const c = T.cars.find((q) => q.mode === 'stop' && !q.frozen && w.g.state.real < q.until - 4);
    if (c) {
      const side = driverSide('car', c, c.x + Math.cos(c.h) * 2, c.z - Math.sin(c.h) * 2);
      return { c, at: side.stand };
    }
    w.host.tick(0.05);
  }
  throw new Error('no car standing at the roadside');
}

test('its roads: those wide enough for two cars (not the lanes between the houses), short of every roadblock, every junction reached from every other; its places at the roadside with room for the biggest car', () => {
  const N = trafficNetwork();
  assert.ok(TRAFFIC_ROADS.length >= 10);
  for (const r of TRAFFIC_ROADS) assert.ok(r.w >= TRAFFIC.wide, `${r.id} is ${r.w} m wide`);
  for (const r of ZONE_ROADS) if (Math.min(r.x1 - r.x0, r.z1 - r.z0) < TRAFFIC.wide) assert.ok(!TRAFFIC_ROADS.some((q) => q.id === r.id), `${r.id} is a lane`);
  for (let a = 0; a < N.nodes.length; a += 1) for (let b = 0; b < N.nodes.length; b += 1) assert.ok(Number.isFinite(N.dist[a][b]), `junction ${a} to ${b}`);
  assert.ok(TRAFFIC_STOPS.length > 100, `${TRAFFIC_STOPS.length} places at the roadside`);
  // (none on the city block's boulevard, with its lights and its pavements)
  assert.ok(!TRAFFIC_STOPS.some((s) => TRAFFIC_ROADS[s.road].boulevard));
});

test('the motorists: twenty-five of his townspeople, each with a car of the showroom\'s, the ten closed models (no one is seen sitting on nothing inside); most out by day, fewer late, a few at night', () => {
  const w = town(['Watcher'], { hour: 10 });
  const T = w.I.traffic;
  assert.equal(T.cars.length, 25);
  for (const c of T.cars) {
    const p = w.pop.people[c.i];
    assert.equal(p.job, 'motorist');
    assert.ok(NPC_FIGURES[p.look.figure], `${p.name} wears one of his figures`);
    assert.ok(POWER_CARS[c.model], `${c.model} is sold at the showroom`);
    assert.equal(CAR_PARTS[c.model].driver.seen, false, `${c.model} is closed`);
  }
  assert.equal(new Set(T.cars.map((c) => c.model)).size, TRAFFIC_MODELS.length, 'every one of the ten is driven');
  const out = () => T.cars.filter(onRoads).length;
  const day = out();
  w.g.advance(12.5 * 3600);
  const late = out();
  w.g.advance(2.5 * 3600);
  const night = out();
  assert.ok(day >= 12, `at ten in the morning: ${day}`);
  assert.ok(late >= 4 && late < day, `at half past ten at night: ${late}`);
  assert.ok(night >= 1 && night < late, `at one in the morning: ${night}`);
});

test('on the roads for ten minutes about the boulevard: on the roads, on their own side of them, never into each other, never through a red light', () => {
  const w = town(['Watcher'], { hour: 10 });
  const T = w.I.traffic;
  w.place(w.p, 20, 30);
  // the lights on Market Road and where traffic stops for them (atani-city.js): north, south, east, west
  const LINES = [{ way: 'n', at: -49, phase: 0 }, { way: 's', at: -31, phase: 0 }, { way: 'e', at: -10.7, phase: 1 }, { way: 'w', at: 10.7, phase: 1 }, { way: 'n', at: 58, phase: 2 }, { way: 's', at: 62, phase: 2 }];
  const front = (c) => { const L = POWER_CARS[c.model].length / 2; return [c.x + Math.sin(c.h) * L, c.z + Math.cos(c.h) * L]; };
  const was = new Map();
  let samples = 0, offRoad = 0, wrongSide = 0, sideSamples = 0, overlaps = 0, red = 0, moved = 0;
  for (let s = 0; s < 600; s += 0.1) {
    w.host.tick(0.1);
    const now = w.g.state.real;
    const live = T.cars.filter(onRoads);
    for (const c of live) {
      samples += 1;
      const atStop = c.mode === 'stop' && TRAFFIC_STOPS.some((st) => Math.hypot(st.x - c.x, st.z - c.z) < 0.5);
      // (on the road, or on its verge pulling out from the roadside or in to it)
      if (!atStop && !onRoad(c.x, c.z, 1.5)) offRoad += 1;
      // its own side: cruising, not going round anything, away from the junctions
      const road = TRAFFIC_ROADS[c.road];
      if (c.mode === 'drive' && c.v > 4 && !c.side && road && !trafficNetwork().nodes.some((n) => Math.hypot(n.x - c.x, n.z - c.z) < 14)) {
        sideSamples += 1;
        const right = road.axis === 'x' ? (c.z - road.c) * c.dir : -(c.x - road.c) * c.dir;
        if (right < road.lane - 0.6) wrongSide += 1;
      }
      // a stop line crossed while its light was red
      const [fx, fz] = front(c), last = was.get(c.n);
      if (last && c.mode === 'drive') {
        if (Math.hypot(fx - last[0], fz - last[1]) > 0.01) moved += 1;
        for (const L of LINES) {
          const ns = L.way === 'n' || L.way === 's';
          if (ns ? Math.abs(fx) > 8 : Math.abs(fz + 40) > 6) continue;
          const a = ns ? last[1] : last[0], b = ns ? fz : fx;
          const crossed = L.way === 'n' || L.way === 'e' ? a <= L.at && b > L.at : a >= L.at && b < L.at;
          if (crossed && signalState(L.phase, now) === 'red') red += 1;
        }
      }
      was.set(c.n, [fx, fz]);
    }
    for (let a = 0; a < live.length; a += 1) for (let b = a + 1; b < live.length; b += 1) if (Math.hypot(live[a].x - live[b].x, live[a].z - live[b].z) < 7 && overlap(live[a], live[b])) overlaps += 1;
  }
  assert.ok(samples > 50000 && moved > 20000, `${samples} looks, ${moved} on the move`);
  assert.equal(offRoad, 0, 'off the roads');
  assert.ok(sideSamples > 5000 && wrongSide / sideSamples < 0.01, `on the wrong side ${wrongSide} of ${sideSamples}`);
  assert.equal(red, 0, 'through a red light');
  assert.ok(overlaps / samples < 1 / 5000, `into each other: ${overlaps} of ${samples}`);
});

test('someone standing in the road: the car stops short of them, sounds its horn, and goes round them when it can; never through them', () => {
  const w = town(['Stander'], { hour: 10 });
  const T = w.I.traffic;
  // a car on its way, its way straight on for a good stretch ahead: the player stands on that way, on its side of the
  // road, some way ahead of it
  const pointAt = (way, d) => { let k = 0; while (k + 2 < way.cum.length && way.cum[k + 1] < d) k += 1; const f = (d - way.cum[k]) / ((way.cum[k + 1] - way.cum[k]) || 1); return { x: way.xs[k] + (way.xs[k + 1] - way.xs[k]) * f, z: way.zs[k] + (way.zs[k + 1] - way.zs[k]) * f }; };
  let c = null, at = null;
  for (let k = 0; k < 6000 && !c; k += 1) {
    w.host.tick(0.05);
    for (const q of T.cars) {
      if (q.mode !== 'drive' || q.v < 6 || q.side) continue;
      const way = T.wayOf(q.n);
      if (!way || way.len - q.d < 90) continue;
      const pts = [q.d + 10, q.d + 25, q.d + 40, q.d + 55].map((d) => pointAt(way, d));
      // (straight: all on one line)
      const straight = pts.every((p) => Math.abs(p.x - pts[0].x) < 0.05) || pts.every((p) => Math.abs(p.z - pts[0].z) < 0.05);
      if (!straight || trafficNetwork().nodes.some((n) => pts.some((p) => Math.hypot(n.x - p.x, n.z - p.z) < 18))) continue;
      // (and away from Market Road's lights: a car stopped at a red light short of them goes round them from there,
      // with no horn)
      const lights = (p) => p.x > CITY_AREA.x0 - 45 && p.x < CITY_AREA.x1 + 45 && p.z > CITY_AREA.z0 - 45 && p.z < CITY_AREA.z1 + 45;
      if ([{ x: q.x, z: q.z }, ...pts].some(lights)) continue;
      c = q; at = pts[2];
      break;
    }
  }
  assert.ok(c, 'a car on its way along a straight road');
  w.place(w.p, at.x, at.z);
  const spec = POWER_CARS[c.model];
  let closest = Infinity, horn = false, past = false;
  for (let s = 0; s < 60 && !past; s += 0.05) {
    w.place(w.p, at.x, at.z);
    w.host.tick(0.05);
    // how near the player the car's body comes (the player as a circle of 0.3 m)
    const dx = at.x - c.x, dz = at.z - c.z;
    const along = dx * Math.sin(c.h) + dz * Math.cos(c.h), across = dx * Math.cos(c.h) - dz * Math.sin(c.h);
    const gx = Math.max(0, Math.abs(along) - spec.length / 2), gz = Math.max(0, Math.abs(across) - spec.width / 2);
    closest = Math.min(closest, Math.hypot(gx, gz));
    if (c.hornAt) horn = true;
    if (along < -spec.length) past = true;
  }
  assert.ok(closest > 0.35, `never through them: ${closest.toFixed(2)} m at the nearest`);
  assert.ok(horn, 'the horn');
  assert.ok(past, 'round them and on');
});

test('taking a car standing still with its driver at the wheel: from beside a front door, the driver pulled out (who runs, and has seen the thief\'s face); driven as one\'s own, but never one\'s own: not on the list of cars, never sold; left, it stands there for the thief alone', () => {
  const w = town(['Thief', 'Other'], { hour: 10 });
  const T = w.I.traffic;
  const [p, q] = w.players;
  const cars0 = [...(p.cars || [])];
  const { c, at } = standingCar(w);
  const n = c.n, model = c.model, driver = c.i;
  // not from too far, and not one on the move
  w.place(p, c.x + Math.cos(c.h) * 6, c.z - Math.sin(c.h) * 6);
  refused(w.send(w.ids[0], { type: 'hijack.start', car: n }), 'TOO_FAR');
  w.place(p, at.x, at.z);
  const started = ok(w.send(w.ids[0], { type: 'hijack.start', car: n }));
  assert.equal(started.hijack.kind, 'car');
  assert.equal(c.frozen, true, 'the car is held where it is while the door is opened');
  until(w, () => !p.hijack, 5);
  assert.equal(p.incar, `pc:${model}`);
  assert.equal(p.pcar.taken, n);
  assert.equal(c.mode, 'taken');
  assert.ok(w.I.actors.has(driver), 'the driver is out, on foot');
  const crime = Object.values(w.g.state.justice.crimes).find((k) => k.vehicle === `car:${n}`);
  assert.ok(crime && crime.type === 'vehicle_theft' && crime.victim.id === driver);
  assert.equal(crime.detection, 'identified', 'the driver saw who it was');
  // never theirs: not on their list, and the server's list (which knows nothing of it) does not take them out of it
  assert.deepEqual(p.cars || [], cars0);
  ok(w.send(w.ids[0], { type: 'cars.owned', cars: [] }));
  assert.equal(p.incar, `pc:${model}`);
  assert.ok(!w.g.view(w.ids[0]).self.ownCars.cars.includes(model));
  assert.equal(w.g.view(w.ids[0]).self.incar.taken, n);
  // driven a little way, as one's own car is
  const h = p.pcar.h;
  let x = p.pcar.x, z = p.pcar.z;
  for (let k = 0; k < 10; k += 1) {
    w.host.tick(0.1);
    const nx = x + Math.sin(h) * 0.5, nz = z + Math.cos(h) * 0.5;
    const r = w.send(w.ids[0], { type: 'car.drive', x: nx, z: nz, heading: h, speed: 5 });
    if (!r.ok) break;
    x = nx; z = nz;
  }
  assert.ok(Math.hypot(x - c.x, z - c.z) < 0.01, 'the town knows where it is');
  // got out of: it stands where it was left, for them, and nobody else
  const left = ok(w.send(w.ids[0], { type: 'car.leave' }));
  assert.equal(left.taken, n);
  assert.equal(c.mode, 'kept');
  const seen = w.g.view(w.ids[0]).traffic.find((k) => k.n === n);
  assert.ok(seen && seen.mode === 'kept' && seen.mine);
  assert.equal(w.g.view(w.ids[0]).self.takenCars.length, 1);
  w.place(q, p.x, p.z);
  refused(w.send(w.ids[1], { type: 'traffic.enter', n }), 'NOT_YOURS');
  refused(w.send(w.ids[1], { type: 'hijack.start', car: n }), 'BUSY');
  ok(w.send(w.ids[0], { type: 'traffic.enter', n }));
  assert.equal(p.incar, `pc:${model}`);
  assert.equal(c.mode, 'taken');
});

test('caught by the police: every car taken goes back to its owner, the one at the wheel and every one left standing; nobody holds more than five', () => {
  const w = town(['Thief'], { hour: 10 });
  const T = w.I.traffic;
  const p = w.p;
  const taken = [];
  // six taken one after another, each left where it was taken
  for (let k = 0; k < 6; k += 1) {
    const { c, at } = standingCar(w);
    w.place(p, at.x, at.z);
    ok(w.send(w.id, { type: 'hijack.start', car: c.n }));
    until(w, () => !p.hijack, 5);
    assert.equal(p.pcar.taken, c.n);
    taken.push(c.n);
    if (k < 5) ok(w.send(w.id, { type: 'car.leave' }));
  }
  // (the sixth at the wheel: the first left was found by its owner when the sixth was left... so far five are left)
  const kept = () => T.cars.filter((c) => c.takenBy === p.id && c.mode === 'kept').length;
  assert.equal(kept(), 5);
  ok(w.send(w.id, { type: 'car.leave' }));
  assert.equal(kept(), 5, 'no more than five');
  assert.equal(T.cars[taken[0]].mode, 'returning', 'the first is found by its owner');
  ok(w.send(w.id, { type: 'traffic.enter', n: taken[5] }));
  // the police have them
  until(w, () => p.law.crimes && p.law.crimes.length > 0, 20);
  const record = w.I.justice.arrest(p, { kind: 'npc', id: w.pop.people.find((x) => x.job === 'police').index, name: 'An officer' });
  assert.ok(record);
  assert.equal(record.carsReturned, 5);
  assert.equal(p.incar, null, 'out of the car');
  for (const n of taken) assert.ok(['returning', 'stop', 'drive', 'off'].includes(T.cars[n].mode) && T.cars[n].takenBy === null, `car ${n} back with its owner`);
  assert.equal(w.g.view(w.id).self.takenCars.length, 0);
  const note = w.events(w.id).find((e) => e.title === 'Under arrest');
  assert.ok(note && /All 5 cars you took go back to their owners/.test(note.text), note && note.text);
  // and their owners come for them
  w.host.tick(0.05);
  let back = 0;
  for (let s = 0; s < 300 && back < taken.length; s += 0.5) { for (let k = 0; k < 10; k += 1) w.host.tick(0.05); back = taken.filter((n) => T.cars[n].mode !== 'returning').length; }
  assert.equal(back, taken.length, 'every one fetched by its owner');
});

test('kept with the town: a car taken and left is still the thief\'s when the town is saved and opened again; at the wheel, still at it', () => {
  const w = town(['Thief'], { hour: 10 });
  const p = w.p;
  const a = standingCar(w);
  w.place(p, a.at.x, a.at.z);
  ok(w.send(w.id, { type: 'hijack.start', car: a.c.n }));
  until(w, () => !p.hijack, 5);
  ok(w.send(w.id, { type: 'car.leave' }));
  const b = standingCar(w);
  w.place(p, b.at.x, b.at.z);
  ok(w.send(w.id, { type: 'hijack.start', car: b.c.n }));
  until(w, () => !p.hijack, 5);
  const again = createHost({ saved: JSON.parse(JSON.stringify(w.host.save())) });
  const T2 = again.game.internals.traffic, p2 = again.game.state.players[w.id];
  assert.equal(T2.cars[a.c.n].mode, 'kept');
  assert.equal(T2.cars[a.c.n].takenBy, w.id);
  assert.equal(p2.pcar.taken, b.c.n);
  again.tick(0.05);
  assert.ok(again.game.view(w.id).self.takenCars.some((k) => k.n === a.c.n && !k.driving));
  assert.ok(again.game.view(w.id).self.takenCars.some((k) => k.n === b.c.n && k.driving));
});
