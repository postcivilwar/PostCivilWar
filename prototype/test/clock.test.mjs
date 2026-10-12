// The town on the real clock (12 October 2026): the player's own hour, day and date; a second of play a second
// of the day; time that cannot be skipped; and the real weather where the player is, when it is known.
//   node --test test/clock.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHost } from '../src/sim/host.js';
import { wallSeconds, dateOf, clockOf, TIME_SCALE } from '../src/sim/sim.js';

// a clock that says what the test says it says
const clockAt = (date) => { const c = { now: wallSeconds(date) }; c.read = () => c.now; return c; };

test('the clock is the device\'s own: Monday 12 October 2026, 09:20 in Lagos is 09:20 on Monday 12 October in town', () => {
  const at = new Date(2026, 9, 12, 9, 20, 5);
  const t = wallSeconds(at);
  const c = clockOf(t);
  assert.equal(c.label, '09:20');
  assert.deepEqual(dateOf(t), { weekday: 1, day: 12, month: 'October', monthIndex: 9, year: 2026 });
  const clock = clockAt(at);
  const host = createHost({ wallClock: clock.read });
  const id = host.game.join({ name: 'Ada Obi', look: {} });
  const v = host.game.view(id);
  assert.equal(v.clock.label, '09:20');
  assert.equal(v.calendar.weekday, 'Monday', 'the town\'s week is the real week');
  assert.deepEqual(v.date, { weekday: 1, day: 12, month: 'October', monthIndex: 9, year: 2026 });
  assert.equal(v.calendar.school, true);
  // every day of a year is the right day of the week
  for (let d = 0; d < 400; d += 1) {
    const day = new Date(2026, 0, 1 + d, 12);
    const t2 = wallSeconds(day);
    assert.equal(dateOf(t2).weekday, day.getDay());
    assert.equal(dateOf(t2).day, day.getDate());
  }
});

test('a second of play is a second of the day: morning becomes afternoon, and afternoon night, when it does where the player is', () => {
  const clock = clockAt(new Date(2026, 9, 12, 11, 59, 50));
  const host = createHost({ wallClock: clock.read });
  const id = host.game.join({ name: 'Ada Obi', look: {} });
  for (let i = 0; i < 20; i += 1) { clock.now += 1; host.tick(1); }
  assert.equal(host.game.view(id).clock.label, '12:00', 'twenty seconds later is twenty seconds later, not ten minutes');
  // the page put away for the afternoon: the town is where the clock is, at once, without the hours played through
  clock.now = wallSeconds(new Date(2026, 9, 12, 19, 45));
  const began = Date.now();
  host.tick(0.016);
  assert.ok(Date.now() - began < 2000, 'the hours between are not played one by one');
  const evening = host.game.view(id);
  assert.equal(evening.clock.label, '19:45');
  assert.ok(evening.clock.hourFloat > 19.7);
  // and the next morning is the next day, a Tuesday
  clock.now = wallSeconds(new Date(2026, 9, 13, 6, 30));
  host.tick(0.016);
  const next = host.game.view(id);
  assert.equal(next.calendar.weekday, 'Tuesday');
  assert.equal(next.date.day, 13);
  assert.equal(next.clock.label, '06:30');
  // a clock a moment slow (the device's clock set right) does not send the town backwards
  clock.now -= 30; host.tick(0.016);
  assert.equal(host.game.view(id).clock.label, '06:30');
});

test('a game saved on the old short days is opened on the real clock', () => {
  const old = createHost();
  const id = old.game.join({ name: 'Old Save', look: {} });
  for (let i = 0; i < 60; i += 1) old.tick(1);
  const saved = JSON.parse(JSON.stringify(old.save()));
  const clock = clockAt(new Date(2026, 9, 12, 15, 5));
  const host = createHost({ saved, wallClock: clock.read });
  host.tick(0.016);
  const v = host.game.view(id);
  assert.equal(v.self.name, 'Old Save');
  assert.equal(v.clock.label, '15:05');
  assert.equal(v.calendar.weekday, 'Monday');
  assert.deepEqual(host.auditor.reconcile(), []);
});

test('on the real clock nobody\'s time is skipped: resting and sleeping do what they do, and the clock goes on as it was', () => {
  const clock = clockAt(new Date(2026, 9, 12, 21, 0));
  const host = createHost({ wallClock: clock.read });
  const id = host.game.join({ name: 'Ada Obi', look: {} });
  host.game.state.players[id].energy = 10;
  host.game.advance(8 * 3600);
  assert.equal(host.game.view(id).clock.label, '21:00');
  // the old short days still skip, where a play-through asks for them
  const quick = createHost();
  const before = quick.game.state.t;
  quick.game.advance(3600);
  assert.ok(quick.game.state.t >= before + 3600);
  assert.equal(TIME_SCALE, 30);
});

test('the real weather where the player is, while it is known; the town\'s own when it is not', () => {
  const clock = clockAt(new Date(2026, 9, 12, 10, 0));
  const host = createHost({ wallClock: clock.read });
  const id = host.game.join({ name: 'Ada Obi', look: {} });
  assert.equal(host.game.setWeather('rain'), true);
  let v = host.game.view(id);
  assert.equal(v.weather.kind, 'rain');
  assert.equal(v.weather.wet, true);
  assert.equal(v.realWeather, true);
  assert.equal(host.game.setWeather('hail'), false, 'only the four kinds the town knows');
  // told again within the hour: it stays
  clock.now += 1800; host.tick(0.016); host.game.setWeather('cloudy');
  clock.now += 1800; host.tick(0.016);
  assert.equal(host.game.view(id).weather.kind, 'cloudy');
  // not told for three hours: the town's own weather again (and it says so)
  clock.now += 3 * 3600 + 60; host.tick(0.016);
  v = host.game.view(id);
  assert.equal(v.realWeather, false);
  assert.ok(['clear', 'cloudy', 'rain', 'storm'].includes(v.weather.kind));
});
