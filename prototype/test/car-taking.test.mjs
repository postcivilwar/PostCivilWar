// Taking a car of the town's, as the owner's videos show it (4 November 2026): from wherever the player stands near it,
// round to the driver's door, the door opened, the driver pulled out onto the road (who gets up and runs), whoever rides
// with them out of their own doors and away, the player in and the door slammed; where the driver's side is blocked, in
// by the front passenger's door and across to the wheel. And the town's cars carry passengers: in the front seat or the
// back, or nobody, never two of one figure in a car.
//   node --test test/car-taking.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { town, ok, refused, until } from './world.mjs';
import { POWER_CARS } from '../src/sim/power-cars.js';
import { CAR_TAKING } from '../src/sim/hijack.js';
import { RIDERS } from '../src/sim/traffic.js';
import { doorStand, doorPlace, toWorld, toCar, TWO_DOORS, DOOR } from '../src/sim/car-doors.js';
import { NPC_FIGURES } from '../src/sim/npc-figures.js';
import { POSE } from '../src/sim/population.js';
import { zoneWalkable } from '../src/sim/zone.js';
import { keepLevel } from '../src/sim/levels.js';

// a car of the town's standing at the roadside in the town (not the city), with time to stand
function standingCar(w, test = () => true) {
  const T = w.I.traffic;
  for (let k = 0; k < 6000; k += 1) {
    const c = T.cars.find((q) => q.mode === 'stop' && !q.frozen && w.g.state.real < q.until - 8 && Math.abs(q.x) < 240 && q.z > -470 && q.z < 180 && test(q));
    if (c) return c;
    w.host.tick(0.1);
  }
  throw new Error('no car standing at the roadside');
}
const figureOf = (w, i) => w.pop.people[i].look.figure;

test('the town\'s cars carry passengers at random: none, someone in front, up to three behind; never two of one figure; nobody in two places', () => {
  const w = town(['Emeka Test'], { hour: 11 });
  const T = w.I.traffic;
  w.place(w.p, 0, 0);
  const counts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 }, fronts = { yes: 0, no: 0 };
  let seen = 0;
  const looked = new Set();
  for (let k = 0; k < 9000 && seen < 160; k += 1) {
    w.host.tick(0.2);
    for (const c of T.cars) {
      if (c.mode !== 'drive' || looked.has(`${c.n}:${c.trips}`)) continue;
      looked.add(`${c.n}:${c.trips}`);
      seen += 1;
      counts[c.riders.length] += 1;
      fronts[c.riders.some((r) => r.seat === 'front') ? 'yes' : 'no'] += 1;
      // never two of one figure in one car, the driver's included
      const figs = [figureOf(w, c.i), ...c.riders.map((r) => figureOf(w, r.i))];
      assert.equal(new Set(figs).size, figs.length, `car ${c.n}: ${figs.join(', ')}`);
      // none of the police; nobody driving; nobody in two cars; seats not shared
      for (const r of c.riders) {
        assert.ok(!NPC_FIGURES[figureOf(w, r.i)].police, 'not the police');
        assert.ok(!T.cars.some((o) => o.i === r.i), 'not a motorist');
        assert.equal(T.cars.filter((o) => o.riders.some((q) => q.i === r.i)).length, 1, 'in one car');
        // where the town has them: in the car, unseen
        const at = {}; w.pop.locate(r.i, w.g.state.t, at);
        assert.equal(at.pose, POSE.hidden); assert.ok(Math.hypot(at.x - c.x, at.z - c.z) < 0.01);
      }
      assert.equal(new Set(c.riders.map((r) => r.seat)).size, c.riders.length);
      if (TWO_DOORS.has(c.model)) assert.ok(c.riders.filter((r) => r.seat !== 'front').length <= 1, 'a two-door car: one behind at most');
    }
  }
  assert.ok(seen >= 100, `${seen} trips`);
  console.log('riders a trip', JSON.stringify(counts), 'front seat', JSON.stringify(fronts));
  assert.ok(counts[0] > seen * 0.15 && counts[0] < seen * 0.6, 'often alone');
  assert.ok(counts[1] + counts[2] + counts[3] + counts[4] > seen * 0.35, 'often with someone');
  assert.ok(counts[2] + counts[3] + counts[4] > 0, 'now and then two or more');
  assert.ok(fronts.yes > seen * 0.25 && fronts.yes < seen * 0.7);
  assert.ok(RIDERS.front > 0 && RIDERS.back[2] < 1);
});

test('taken from in front: round to the driver\'s door, the door opened, the driver pulled out and down, the riders out and away, in, the door slammed', () => {
  const w = town(['Emeka Test'], { hour: 11 });
  const T = w.I.traffic, p = w.p;
  w.place(p, 0, 0);
  const c = standingCar(w, (q) => q.riders.length >= 1 || q.trips > 2);
  const spec = POWER_CARS[c.model];
  // in front of it, a step off its nose
  const front = toWorld(c, { along: spec.length / 2 + 1.6, across: 0 });
  assert.ok(zoneWalkable(front.x, front.z), 'room in front of it');
  w.place(p, front.x, front.z, c.h + Math.PI);
  keepLevel(p, Number.isFinite(c.y) ? c.y : 0);
  const riders = c.riders.map((r) => ({ ...r })), driver = c.i;
  const started = ok(w.send(w.id, { type: 'hijack.start', car: c.n }));
  assert.equal(started.hijack.kind, 'car');
  assert.equal(started.hijack.door, 'fl', 'the driver\'s door');
  assert.equal(started.hijack.step, 'walk');
  // on the way round: never through the car
  const stand = toWorld(c, doorStand(c.model, 'fl'));
  const steps = [];
  let walked = 0;
  until(w, () => { const r = toCar(c, p.x, p.z); steps.push(r); if (w.g.view(w.id).self.hijack && w.g.view(w.id).self.hijack.step === 'walk') walked += 1; return w.g.view(w.id).self.hijack.step !== 'walk'; }, 15);
  assert.ok(walked > 3, 'walked round');
  for (const r of steps) assert.ok(!(Math.abs(r.along) < spec.length / 2 - 0.1 && Math.abs(r.across) < spec.width / 2 - 0.1), `through the car at ${JSON.stringify(r)}`);
  assert.ok(Math.hypot(p.x - stand.x, p.z - stand.z) < 0.05, 'at the driver\'s door');
  // the door opened, and the driver pulled out onto the road
  until(w, () => w.I.actors.has(driver), 6);
  const d = w.I.actors.get(driver);
  assert.ok(toCar(c, d.x, d.z).across > spec.width / 2, 'out on the driver\'s side');
  until(w, () => w.I.actors.get(driver).pose === POSE.lie, 1);
  // and every rider out of the car, running
  until(w, () => riders.every((r) => w.I.actors.has(r.i)), 6);
  for (const r of riders) { const m = w.I.actors.get(r.i); const at = toCar(c, m.x, m.z); assert.ok(Math.abs(at.across) > spec.width / 2, `${r.seat} out beside the car`); }
  // the doors for the drawing: the driver's, and the riders'
  const listed = T.list(c.x, c.z, w.id).find((q) => q.n === c.n);
  assert.ok(listed.doors && listed.doors.some((q) => q[0] === 'fl'), 'the driver\'s door opened');
  // in at the wheel, the door slammed
  until(w, () => !p.hijack, 10);
  assert.equal(p.incar, `pc:${c.model}`);
  assert.equal(T.cars[c.n].mode, 'taken');
  assert.equal(T.cars[c.n].riders.length, 0);
  // up again, the driver runs
  until(w, () => w.I.actors.get(driver).mode === 'go', 8);
  console.log('riders', riders.map((r) => `${r.seat}:${figureOf(w, r.i)}`).join(' '), 'driver', figureOf(w, driver), 'timing', JSON.stringify(started.hijack.times));
  assert.ok(CAR_TAKING.pace > 2 && DOOR.open > 1);
});

test('the driver\'s side blocked: in by the front passenger\'s door, the driver out after the passenger, across to the wheel', () => {
  const w = town(['Emeka Test'], { hour: 11 });
  const T = w.I.traffic, p = w.p;
  w.place(p, 0, 0);
  const c = standingCar(w);
  const spec = POWER_CARS[c.model];
  // a car of the player's own standing hard against its driver's side
  const beside = toWorld(c, { along: 0, across: spec.width / 2 + 1.25 });
  p.carParked = { 'grey-saloon': { x: beside.x, z: beside.z, h: c.h } };
  // the player on its other side
  const right = toWorld(c, { along: 0, across: -(spec.width / 2 + 1.4) });
  w.place(p, right.x, right.z, c.h - Math.PI / 2);
  keepLevel(p, Number.isFinite(c.y) ? c.y : 0);
  const started = ok(w.send(w.id, { type: 'hijack.start', car: c.n }));
  assert.equal(started.hijack.door, 'fr', 'the front passenger\'s door');
  assert.ok(started.hijack.times.slide, 'across to the wheel');
  until(w, () => w.I.actors.has(c.i), 8);
  const d = w.I.actors.get(c.i);
  assert.ok(toCar(c, d.x, d.z).across < -spec.width / 2, 'the driver out on the passenger\'s side');
  until(w, () => !p.hijack, 12);
  assert.equal(p.incar, `pc:${c.model}`);
  // both sides blocked: no way in
  const w2 = town(['Emeka Test'], { hour: 11 });
  w2.place(w2.p, 0, 0);
  const c2 = standingCar(w2);
  const s2 = POWER_CARS[c2.model];
  const L = toWorld(c2, { along: 0, across: s2.width / 2 + 1.25 }), R = toWorld(c2, { along: 0, across: -(s2.width / 2 + 1.25) });
  w2.p.carParked = { 'grey-saloon': { x: L.x, z: L.z, h: c2.h }, 'black-pickup': { x: R.x, z: R.z, h: c2.h } };
  const f2 = toWorld(c2, { along: s2.length / 2 + 1.6, across: 0 });
  w2.place(w2.p, f2.x, f2.z, c2.h + Math.PI);
  refused(w2.send(w2.id, { type: 'hijack.start', car: c2.n }), 'NO_WAY_IN');
  // and from too far off, not at all
  const far = toWorld(c2, { along: s2.length / 2 + CAR_TAKING.reach + 2, across: 0 });
  w2.place(w2.p, far.x, far.z);
  refused(w2.send(w2.id, { type: 'hijack.start', car: c2.n }), 'TOO_FAR');
  void doorPlace;
});
