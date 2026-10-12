import test from 'node:test';
import assert from 'node:assert/strict';
import { POWER_BIKES, HANDLING, handlingOf, stepPowerBike, bikeRevs } from '../src/sim/power-bikes.js';

const ride = (input, seconds, state = { speed: 0, lean: 0, heading: 0 }, options) => { for (let t = 0; t < seconds; t += 1 / 60) stepPowerBike(state, input, 1 / 60, options); return state; };

test('no power bike is offered until its model has been supplied', () => {
  assert.deepEqual(Object.keys(POWER_BIKES), []);
});

test('the throttle takes it up to its top speed, and no further', () => {
  const s = ride({ throttle: 1 }, 4);
  assert.ok(s.speed > 10 && s.speed < HANDLING.top, `after 4 s: ${s.speed}`);
  const t = ride({ throttle: 1 }, 40);
  assert.ok(t.speed <= HANDLING.top + 1e-9 && t.speed > HANDLING.top * 0.9, `flat out: ${t.speed}`);
  const rough = ride({ throttle: 1 }, 40, { speed: 0, lean: 0, heading: 0 }, { onTar: false });
  assert.ok(rough.speed <= HANDLING.rough + 1e-9);
});

test('the brake stops it in a short distance, without it going backwards', () => {
  const s = { speed: 20, lean: 0, heading: 0 };
  let metres = 0;
  for (let i = 0; i < 600 && s.speed > 0; i += 1) { stepPowerBike(s, { brake: 1 }, 1 / 60); metres += s.speed / 60; }
  assert.equal(s.speed, 0);
  assert.ok(metres > 15 && metres < 30, `stopping distance ${metres}`);
});

test('let go, it rolls to a stop', () => {
  const s = ride({}, 30, { speed: 15, lean: 0, heading: 0 });
  assert.equal(s.speed, 0);
});

test('it turns by leaning: never in an instant, wider the faster it goes, and it stands up again', () => {
  const quick = ride({ steer: 1, throttle: 0.3 }, 0.05, { speed: 20, lean: 0, heading: 0 });
  assert.ok(Math.abs(quick.heading) < 0.05, `one twentieth of a second of steering turned it ${quick.heading}`);
  assert.ok(quick.lean > 0, 'steering right leans it right');
  const slow = ride({ steer: 1 }, 1, { speed: 8, lean: 0, heading: 0 });
  const fast = ride({ steer: 1 }, 1, { speed: 22, lean: 0, heading: 0 });
  assert.ok(slow.heading < 0 && fast.heading < 0, 'right is the heading going down, as the small motorcycle turns');
  const radius = (s, v) => v / (Math.abs(s.heading) / 1);
  assert.ok(radius(fast, 22) > radius(slow, 8), 'a faster bike turns wider');
  assert.ok(fast.lean <= HANDLING.leanMax + 1e-9);
  const upright = ride({}, 2, { speed: 15, lean: 0.5, heading: 0 });
  assert.ok(Math.abs(upright.lean) < 0.03, `let go, it stands up: ${upright.lean}`);
});

test('at walking pace the bars turn it; standing still it does not turn at all', () => {
  const walking = ride({ steer: -1 }, 1, { speed: 1, lean: 0, heading: 0 });
  assert.ok(walking.heading > 0.3, `${walking.heading}`);
  const still = ride({ steer: 1 }, 1, { speed: 0, lean: 0, heading: 0 });
  assert.equal(still.heading, 0);
});

test('a bike can have its own handling', () => {
  const h = handlingOf({ handling: { top: 34, accel: 7 } });
  assert.equal(h.top, 34); assert.equal(h.brake, HANDLING.brake);
});

test('the revs climb through each gear, drop at the change and stay between idle and the red line', () => {
  let last = 0, drops = 0;
  for (let v = 0; v <= HANDLING.top; v += 0.25) { const r = bikeRevs(v, 1); assert.ok(r >= 0 && r <= 1); if (r < last - 0.05) drops += 1; last = r; }
  assert.ok(drops >= 4, `gear changes heard: ${drops}`);
  assert.ok(bikeRevs(0, 0) < 0.2, 'idle is low');
});
