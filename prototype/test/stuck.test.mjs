// Stuck for no reason (4 November 2026, the owner's video: at night under the city's slip roads, a car he had taken
// going nowhere at full throttle, and once out of it he could not walk away from it; the deck over him was see-through).
// A car of the town's taken where it stood on a slip road was put at the ground under it, inside the bank the slip road
// is built on: solid on every side, and its walls, seen from inside, let the sky through. Now a taken car keeps the
// height it stood at, and anyone already put inside a slip road's bank is on its deck at their next step.
//   node --test test/stuck.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { town, ok, until } from './world.mjs';
import { driverSide } from '../src/sim/hijack.js';
import { keepLevel, levelAt, walkLevel } from '../src/sim/levels.js';
import { zoneWalkable, zoneDeckHeights } from '../src/sim/zone.js';
import { OGANIRU_DECKS } from '../src/sim/zones/oganiru.js';
import { carFits } from '../src/sim/own-cars.js';

// A car of the town's on a slip road, part way up it (stopped there for the test: as in a queue for the lights)
function carOnASlipRoad(w) {
  const T = w.I.traffic;
  w.place(w.p, 700, -1050); keepLevel(w.p, 0);
  for (let k = 0; k < 12000; k += 1) {
    w.host.tick(0.1);
    const c = T.cars.find((q) => (q.mode === 'drive' || q.mode === 'stop') && Number.isFinite(q.y) && q.y > 1.4 && q.y < 6 && !q.frozen);
    if (c) { c.v = 0; return c; }
  }
  throw new Error('no car of the town\'s came onto a slip road');
}

test('a car taken while it stands on a slip road stays on it: driven on up or down it, and got out of onto it', () => {
  const w = town(['Emeka Test'], { hour: 10 });
  const p = w.p;
  const car = carOnASlipRoad(w);
  const side = driverSide('car', car, car.x + Math.cos(car.h) * 2, car.z - Math.sin(car.h) * 2);
  w.place(p, side.stand.x, side.stand.z, Math.atan2(car.x - side.stand.x, car.z - side.stand.z));
  keepLevel(p, car.y);
  ok(w.send(w.id, { type: 'hijack.start', car: car.n }));
  until(w, () => !p.hijack, 15);
  assert.equal(p.incar, `pc:${car.model}`);
  assert.ok(Math.abs(levelAt(p.pcar) - car.y) < 0.3, `the car at ${levelAt(p.pcar).toFixed(2)} m, where it stood ${car.y.toFixed(2)} m`);
  assert.ok(Math.abs(levelAt(p) - car.y) < 0.3, 'its driver with it');
  // driven on, a few steps along the way it faces
  for (let k = 0; k < 5; k += 1) {
    const c = p.pcar;
    w.g.state.real += 0.2;
    ok(w.send(w.id, { type: 'car.drive', x: c.x + Math.sin(c.h) * 1.5, z: c.z + Math.cos(c.h) * 1.5, heading: c.h, speed: 7 }));
  }
  const out = ok(w.send(w.id, { type: 'car.leave' }));
  assert.ok(zoneWalkable(out.x, out.z, [], 0.4, levelAt(p)), 'out of it onto the slip road, where one can stand');
  assert.ok(levelAt(p) > 1, `on the slip road (${levelAt(p).toFixed(2)} m)`);
  // and walks away
  w.g.state.real += 0.5;
  const away = { x: p.x + Math.cos(p.pcar ? 0 : car.h) * 0.6, z: p.z - Math.sin(car.h) * 0.6 };
  const step = walkLevel(p.x, p.z, levelAt(p), away.x, away.z, [], 0.4);
  assert.ok(step !== null || zoneWalkable(p.x, p.z, [], 0.4, levelAt(p)), 'not held where they stand');
});

test('someone already inside a slip road\'s bank (put there before this was mended) is on its deck at their next step; a car the same', () => {
  const w = town(['Emeka Test'], { hour: 10 });
  const p = w.p;
  // a point on a slip road where it is a bank (too low to pass under), and the ground under it
  const d = OGANIRU_DECKS.find((q) => q.id === 'p-nb-off');
  const at = d.path.find((q) => q.y > 2 && q.y < 4);
  assert.ok(at, 'a point of the bank');
  w.place(p, at.x, at.z, Math.atan2(at.ux, at.uz));
  keepLevel(p, 0);
  assert.ok(!zoneWalkable(p.x, p.z, [], 0.4, 0), 'inside the bank at the ground');
  assert.ok(zoneDeckHeights(p.x, p.z).some((h) => Math.abs(h - at.y) < 0.3));
  w.g.state.real += 0.5;
  ok(w.send(w.id, { type: 'move', x: p.x + at.ux * 0.6, z: p.z + at.uz * 0.6, heading: p.heading }));
  assert.ok(Math.abs(levelAt(p) - at.y) < 0.4, `on the deck (${levelAt(p).toFixed(2)} m)`);
  // a car of theirs, the same: the driver's next step is on the deck
  const T = w.I.traffic;
  const c = T.cars.find((q) => q.mode === 'off' || q.mode === 'stop' || q.mode === 'drive');
  const n = c.n;
  T.take(n, p);
  w.I.ownCars.enterTaken(p, { model: c.model, x: at.x, z: at.z, h: Math.atan2(at.ux, at.uz), n });
  keepLevel(p.pcar, 0); keepLevel(p, 0);
  assert.ok(!carFits(c.model, at.x, at.z, p.pcar.h, [], 0.2, 0), 'the car inside the bank');
  w.g.state.real += 0.3;
  ok(w.send(w.id, { type: 'car.drive', x: at.x + at.ux * 1.2, z: at.z + at.uz * 1.2, heading: p.pcar.h, speed: 4 }));
  assert.ok(levelAt(p.pcar) > 1.5, `the car on the deck (${levelAt(p.pcar).toFixed(2)} m)`);
});
