// A player's own motorcycles in the town: only what the server says is theirs can be ridden; getting on (brought
// to them, or where they left it), riding within what the bike can do, getting off and finding it where it stands.
import test from 'node:test';
import assert from 'node:assert/strict';
import { town, run } from './world.mjs';
import { POWER_BIKES, handlingOf, BIKE_CCS, topKmhOfCc, stepPowerBike, FASTEST } from '../src/sim/power-bikes.js';
import { crashHarm, CRASH } from '../src/sim/own-bikes.js';
import { BIKE_PARTS } from '../src/client/bike-parts.js';

test('the fifteen motorcycles: each has its model\'s parts, a price from 1,000 TR, an engine size from the owner\'s list, and its own tuned engine', () => {
  const ids = Object.keys(POWER_BIKES);
  assert.equal(ids.length, 15);
  assert.deepEqual([...ids].sort(), Object.keys(BIKE_PARTS).sort());
  for (const id of ids) {
    const b = POWER_BIKES[id], parts = BIKE_PARTS[id];
    assert.ok(b.price >= 1000, id);
    assert.equal(parts.parts.length, 4, `${id}: body, fork, front wheel, rear wheel`);
    assert.equal(parts.parts.reduce((a, c) => a + c, 0), parts.triangles, `${id}: every triangle kept`);
    assert.ok(parts.front.z > 0 && parts.rear.z < 0 && parts.front.r > 0 && parts.rear.r > 0, `${id}: wheels`);
    assert.ok(parts.seat[1] > parts.peg[1] && parts.grip[1] > parts.peg[1] && parts.grip[2] > parts.seat[2], `${id}: pegs below the seat, grips ahead of it`);
  }
  // no two engines the same
  const tones = ids.map((id) => JSON.stringify([POWER_BIKES[id].sound, POWER_BIKES[id].tone]));
  assert.equal(new Set(tones).size, 15);
  // engine sizes from the owner's list, each bike its own; the top speed (and the speedometer's km/h) follows it
  assert.equal(new Set(ids.map((id) => POWER_BIKES[id].cc)).size, 15);
  for (const id of ids) { assert.ok(BIKE_CCS.includes(POWER_BIKES[id].cc), id); assert.equal(Math.round(handlingOf(POWER_BIKES[id]).top * 3.6), POWER_BIKES[id].topKmh, id); }
  const byCc = ids.map((id) => POWER_BIKES[id]).sort((a, b) => a.cc - b.cc);
  for (let i = 1; i < byCc.length; i += 1) assert.ok(byCc[i].topKmh > byCc[i - 1].topKmh && handlingOf(byCc[i]).accel > handlingOf(byCc[i - 1]).accel, `${byCc[i].id} is faster than ${byCc[i - 1].id}`);
  assert.equal(topKmhOfCc(500), 100); assert.equal(topKmhOfCc(3000), 240);
});

test('the throttle takes it up smoothly, letting go slows it naturally, the brake stops it fast', () => {
  const bike = POWER_BIKES['red-superbike'], h = handlingOf(bike);
  const s = { speed: 0, lean: 0, heading: 0 };
  const trace = [];
  for (let i = 0; i < 600; i += 1) { stepPowerBike(s, { throttle: 1 }, 1 / 60, { handling: h }); trace.push(s.speed); }
  for (let i = 1; i < trace.length; i += 1) assert.ok(trace[i] >= trace[i - 1] && trace[i] - trace[i - 1] < 0.2, 'it rises without a jump');
  assert.ok(s.speed > h.top * 0.7 && s.speed <= h.top);
  const at = s.speed;
  for (let i = 0; i < 60; i += 1) stepPowerBike(s, {}, 1 / 60, { handling: h });
  const coasted = at - s.speed;
  assert.ok(coasted > 0.5 && coasted < 6, `let go for a second it loses ${coasted} m/s`);
  const before = s.speed;
  for (let i = 0; i < 60; i += 1) stepPowerBike(s, { brake: 1 }, 1 / 60, { handling: h });
  assert.ok(before - s.speed > coasted * 3, 'the brake takes off far more than letting go');
});

test('coming off: thrown at speed, the life lost in proportion to the speed, 5 in 100 at the top speed of 3,000 cc', () => {
  assert.equal(crashHarm(FASTEST), 5);
  assert.equal(crashHarm(FASTEST / 2), 2.5);
  assert.equal(crashHarm(0), 0);
  assert.equal(crashHarm(FASTEST * 3), 5, 'never more than 5');
  assert.equal(Math.round(FASTEST * 3.6), 240);
});

test('only the server\'s list can be ridden; on, ride, off, and it stands where it was left', () => {
  const w = town(['Rider One']);
  const { p, id, send, place } = w;
  place(p, -50, 98, Math.PI / 2);
  // nothing owned: nothing to ride
  assert.equal(send(id, { type: 'bikes.ride', bike: 'red-superbike' }).code, 'NOT_YOURS');
  assert.equal(send(id, { type: 'bikes.owned', bikes: ['red-superbike', 'no-such-bike', 'red-superbike'] }).ok, true);
  assert.deepEqual(w.g.view(id).self.ownBikes.bikes, ['red-superbike']);
  assert.equal(send(id, { type: 'bikes.ride', bike: 'chopper' }).code, 'NOT_YOURS');
  // on: brought to where they stand
  const on = send(id, { type: 'bikes.ride', bike: 'red-superbike' });
  assert.equal(on.ok, true, JSON.stringify(on));
  assert.equal(w.g.view(id).self.astride.model, 'red-superbike');
  // riding: a step it could make is taken; one it could not is refused
  run(w.host, 0.2);
  const step = send(id, { type: 'moto.drive', x: p.x + 2, z: p.z, heading: Math.PI / 2 });
  assert.equal(step.ok, true, JSON.stringify(step));
  const leap = send(id, { type: 'moto.drive', x: p.x + 200, z: p.z, heading: Math.PI / 2 });
  assert.equal(leap.code, 'TOO_FAST');
  assert.ok(handlingOf(POWER_BIKES['red-superbike']).top > handlingOf(POWER_BIKES['chopper']).top);
  // off: it stays where it stands
  const at = { x: p.x, z: p.z };
  const off = send(id, { type: 'moto.leave' });
  assert.equal(off.ok, true);
  assert.equal(w.g.view(id).self.astride, null);
  const parked = w.g.view(id).self.ownBikes.parked;
  assert.equal(parked.length, 1);
  assert.ok(Math.hypot(parked[0].x - at.x, parked[0].z - at.z) < 0.01);
  assert.ok(Math.hypot(p.x - at.x, p.z - at.z) > 0.5, 'the rider steps down beside it');
  // back on, where it stands
  const again = send(id, { type: 'bikes.ride', bike: 'red-superbike' });
  assert.equal(again.ok, true);
  assert.ok(Math.hypot(again.x - at.x, again.z - at.z) < 0.01);
  send(id, { type: 'moto.leave' });
  // sold (no longer on the server's list): no longer parked, no longer ridden
  send(id, { type: 'bikes.owned', bikes: [] });
  assert.deepEqual(w.g.view(id).self.ownBikes, { bikes: [], parked: [] });
});

test('a motorcycle is not brought indoors or into a wall', () => {
  const w = town(['Rider Two']);
  const { p, id, send, place } = w;
  send(id, { type: 'bikes.owned', bikes: ['chopper'] });
  // inside the hospital
  place(p, -26, 44, 0);     // inside the HOLARIS showroom building
  const r = send(id, { type: 'bikes.ride', bike: 'chopper' });
  assert.equal(r.ok, false);
  assert.ok(['INDOORS', 'NO_ROOM'].includes(r.code), r.code);
});

test('running into something at speed throws the rider: down on the ground, the life lost by the speed, the bike lying where it stopped', () => {
  const w = town(['Rider Three']);
  const { p, id, send, place } = w;
  place(p, -50, 98, Math.PI / 2);
  send(id, { type: 'bikes.owned', bikes: ['chrome-concept', 'streetfighter'] });
  assert.equal(send(id, { type: 'bikes.ride', bike: 'streetfighter' }).ok, true);
  // a bump at walking pace: no fall
  const bump = send(id, { type: 'moto.crash', speed: 3 });
  assert.equal(bump.ok, true); assert.equal(bump.fell, false);
  assert.equal(w.g.view(id).self.astride.model, 'streetfighter');
  // the fastest the streetfighter can go: thrown, a fall's worth of time on the ground, life lost by the speed
  const health = p.health;
  const at = { x: p.x, z: p.z };
  const fell = send(id, { type: 'moto.crash', speed: 500 });
  assert.equal(fell.ok, true, JSON.stringify(fell));
  assert.equal(fell.fell, true);
  const top = handlingOf(POWER_BIKES.streetfighter).top;
  assert.equal(fell.kmh, Math.round(top * 3.6), 'no faster than the bike can go');
  assert.equal(health - p.health, Math.round(health - Math.max(0, health - crashHarm(top))), 'life lost in proportion to the speed');
  const self = w.g.view(id).self;
  assert.equal(self.astride, null);
  assert.ok(self.down && self.down.by === 'crash', 'on the ground');
  assert.ok(Math.hypot(p.x - at.x, p.z - at.z) > 0.5, 'thrown on ahead');
  const parked = self.ownBikes.parked.find((b) => b.bike === 'streetfighter');
  assert.ok(parked && parked.fallen && Math.hypot(parked.x - at.x, parked.z - at.z) < 0.01, 'the bike lies where it stopped');
  // on the ground: cannot get on again until up
  assert.equal(send(id, { type: 'bikes.ride', bike: 'streetfighter' }).ok, false);
  run(w.host, CRASH.lie[1] + CRASH.rise + 1);
  assert.equal(w.g.view(id).self.down, null, 'up again');
  // the biggest engine at its top speed: 5 in 100
  p.health = 100;
  place(p, -50, 98, Math.PI / 2);
  assert.equal(send(id, { type: 'bikes.ride', bike: 'chrome-concept' }).ok, true);
  const hard = send(id, { type: 'moto.crash', speed: FASTEST });
  assert.equal(hard.lost, 5);
  assert.equal(p.health, 95);
});

test('another player on their motorcycle, from another copy of the town: seen out at the airport too, with what the bike is doing (within bounds) and a horn when it is newly sounded', () => {
  const w = town(['Rider Four']);
  const { p, id, place } = w;
  place(p, -600, -454, 0);
  const seen = (ride) => w.g.visitors.seen('peer-1', { name: 'Ada_Rider', x: -606, z: -452, heading: 1.5, look: {}, ride });
  const v = seen({ bike: 'power-cruiser', lean: 2, speed: 500, throttle: 3, brake: 1, rev: 0.9, horns: 4 });
  assert.ok(v, 'out on the airport\'s land, beyond the town\'s square: still seen');
  assert.deepEqual(v.ride, { bike: 'power-cruiser', lean: 0.9, speed: 70, throttle: 1, brake: 1, rev: 0.9 });
  run(w.host, 0.5);
  let q = w.g.view(id).players.find((o) => o.name === 'Ada_Rider');
  assert.ok(q && q.ride && q.ride.bike === 'power-cruiser');
  assert.ok(q.hornAgo > 5, 'the horns counted before it was seen are not heard');
  seen({ bike: 'power-cruiser', lean: 0, speed: 3, throttle: 0, brake: 0, rev: 0.2, horns: 5 });
  q = w.g.view(id).players.find((o) => o.name === 'Ada_Rider');
  assert.ok(q.hornAgo >= 0 && q.hornAgo < 0.5, 'one more: its horn, just now');
  // not one of the game's motorcycles: no ride; somewhere off the land altogether: not seen
  assert.equal(seen({ bike: 'no-such-bike' }).ride, null);
  assert.equal(w.g.visitors.seen('peer-2', { name: 'Far_Away', x: -5000, z: 4000, heading: 0, look: {} }), null);
});
