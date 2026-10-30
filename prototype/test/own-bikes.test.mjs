// A player's own motorcycles in the town: only what the server says is theirs can be ridden; getting on (brought
// to them, or where they left it), riding within what the bike can do, getting off and finding it where it stands.
import test from 'node:test';
import assert from 'node:assert/strict';
import { town, run } from './world.mjs';
import { POWER_BIKES, handlingOf, BIKE_CCS, topKmhOfCc, stepPowerBike, FASTEST } from '../src/sim/power-bikes.js';
import { crashHarm, CRASH } from '../src/sim/own-bikes.js';
import { zoneWalkable, zoneBlockKind } from '../src/sim/zone.js';
import { BIKE_PARTS } from '../src/client/bike-parts.js';

test('the seventeen motorcycles: each has its model\'s parts, a price from 300 TR to 3,000 TR (the owner\'s of 18 October 2026), an engine size from the owner\'s list, and its own tuned engine', () => {
  const ids = Object.keys(POWER_BIKES);
  assert.equal(ids.length, 17);
  assert.deepEqual([...ids].sort(), Object.keys(BIKE_PARTS).sort());
  for (const id of ids) {
    const b = POWER_BIKES[id], parts = BIKE_PARTS[id];
    assert.ok(b.price >= 300 && b.price <= 3000, id);
    assert.equal(parts.parts.length, 4, `${id}: body, fork, front wheel, rear wheel`);
    assert.equal(parts.parts.reduce((a, c) => a + c, 0), parts.triangles, `${id}: every triangle kept`);
    assert.ok(parts.front.z > 0 && parts.rear.z < 0 && parts.front.r > 0 && parts.rear.r > 0, `${id}: wheels`);
    assert.ok(parts.seat[1] > parts.peg[1] && parts.grip[1] > parts.peg[1] && parts.grip[2] > parts.seat[2], `${id}: pegs below the seat, grips ahead of it`);
  }
  // no two engines the same
  const tones = ids.map((id) => JSON.stringify([POWER_BIKES[id].sound, POWER_BIKES[id].tone]));
  assert.equal(new Set(tones).size, 17);
  // engine sizes from the owner's list, each bike its own; the top speed (and the speedometer's km/h) follows it
  assert.equal(new Set(ids.map((id) => POWER_BIKES[id].cc)).size, 17, 'every size on the owner\'s list, each once');
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

test('coming off: thrown at speed costs no life at any speed (30 October 2026, the owner\'s word: "Users life should never reduce for hitting anything")', () => {
  assert.equal(crashHarm(FASTEST), 0);
  assert.equal(crashHarm(FASTEST / 2), 0);
  assert.equal(crashHarm(0), 0);
  assert.equal(crashHarm(FASTEST * 3), 0);
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

test('running into something at speed throws the rider: down on the ground, no life lost (30 October 2026, the owner\'s word), the bike lying where it stopped', () => {
  const w = town(['Rider Three']);
  const { p, id, send, place } = w;
  // facing the purple tower's curved wall across the grass from Waterside Road, just short of it
  place(p, -101.5, 104.2, Math.PI);
  send(id, { type: 'bikes.owned', bikes: ['chrome-concept', 'streetfighter'] });
  assert.equal(send(id, { type: 'bikes.ride', bike: 'streetfighter' }).ok, true);
  // a bump at walking pace: no fall
  const bump = send(id, { type: 'moto.crash', speed: 3 });
  assert.equal(bump.ok, true); assert.equal(bump.fell, false);
  assert.equal(w.g.view(id).self.astride.model, 'streetfighter');
  // the fastest the streetfighter can go: thrown, a fall's worth of time on the ground, and no life lost
  const health = p.health;
  const at = { x: p.x, z: p.z };
  const fell = send(id, { type: 'moto.crash', speed: 500 });
  assert.equal(fell.ok, true, JSON.stringify(fell));
  assert.equal(fell.fell, true);
  const top = handlingOf(POWER_BIKES.streetfighter).top;
  assert.equal(fell.kmh, Math.round(top * 3.6), 'no faster than the bike can go');
  assert.equal(p.health, health, 'no life lost for hitting anything');
  assert.equal(fell.lost, 0);
  assert.equal(crashHarm(top), 0);
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
  // the biggest engine at its top speed: thrown, and still no life lost
  p.health = 37;
  place(p, -101.5, 104.2, Math.PI);
  assert.equal(send(id, { type: 'bikes.ride', bike: 'chrome-concept' }).ok, true);
  const hard = send(id, { type: 'moto.crash', speed: FASTEST });
  assert.equal(hard.fell, true);
  assert.equal(hard.lost, 0);
  assert.equal(p.health, 37);
});

test('only a real blow throws a rider (19 October 2026, the owner\'s video): nothing in the way, a scrape along a wall, a knock, the edge of the map: nobody falls', () => {
  const w = town(['Rider Five']);
  const { p, id, send, place } = w;
  send(id, { type: 'bikes.owned', bikes: ['white-sport'] });
  const ride = (x, z, h) => { place(p, x, z, h); const r = send(id, { type: 'bikes.ride', bike: 'white-sport' }); assert.equal(r.ok, true, JSON.stringify(r)); };
  const off = () => { if (w.g.view(id).self.astride) send(id, { type: 'moto.leave' }); };
  // where the owner's rider came off: on the grass between Waterside Road and the purple tower, the curved wall
  // metres away, the old box round its roof right there. Nothing is in the way any more: the page would not stop, and
  // a page that said it had crashed there is not believed.
  ride(-108, 105.2, -Math.PI / 2);
  assert.ok(zoneWalkable(-108, 103.5, [], 0.6) && zoneWalkable(-110, 103.5, [], 0.6), 'under the tower\'s roof, short of its wall, is open ground now');
  let r = send(id, { type: 'moto.crash', speed: 7.8, heading: -Math.PI / 2 });
  assert.equal(r.ok, true); assert.equal(r.fell, false); assert.equal(r.outcome, 'none');
  assert.ok(w.g.view(id).self.astride, 'still riding');
  off();
  // brushing along the tower's wall at speed: a scrape, not a fall (going along x beside the curved podium's north tip)
  ride(-101.5, 103.8, -Math.PI / 2 - 0.12);
  r = send(id, { type: 'moto.crash', speed: 10, heading: -Math.PI / 2 - 0.12 });
  assert.equal(r.fell, false, JSON.stringify(r));
  assert.ok(['slide', 'none'].includes(r.outcome), r.outcome);
  off();
  // head on at a little under 23 km/h: a knock, the bike stops, the rider stays on
  ride(-101.5, 104.2, Math.PI);
  r = send(id, { type: 'moto.crash', speed: 6.0, heading: Math.PI });
  assert.equal(r.fell, false); assert.equal(r.outcome, 'stop');
  // the same head on at 30 km/h: thrown
  r = send(id, { type: 'moto.crash', speed: 8.4, heading: Math.PI });
  assert.equal(r.fell, true, JSON.stringify(r));
  assert.equal(w.g.view(id).self.down.by, 'crash');
  run(w.host, CRASH.lie[1] + CRASH.rise + 1);
  // the end of the land is not a thing to be thrown by: the river's bank, straight at it
  let bank = 125;
  while (zoneWalkable(-60, bank + 0.7, [], 0.6)) bank += 0.25;
  ride(-60, bank, 0);
  r = send(id, { type: 'moto.crash', speed: 20, heading: 0 });
  assert.equal(r.fell, false, JSON.stringify(r));
  assert.equal(r.outcome, 'stop');
  off();
  // a roadblock gives a little: at the south end of Waterside Road, met at 27 km/h it stops the bike; at 34 it throws
  ride(-241.6, 113, -Math.PI / 2);
  assert.equal(zoneBlockKind(-243, 113, [], 0.6), 'barrier');
  r = send(id, { type: 'moto.crash', speed: 7.5, heading: -Math.PI / 2 });
  assert.equal(r.fell, false, JSON.stringify(r)); assert.equal(r.outcome, 'stop');
  r = send(id, { type: 'moto.crash', speed: 9.4, heading: -Math.PI / 2 });
  assert.equal(r.fell, true, JSON.stringify(r));
  run(w.host, CRASH.lie[1] + CRASH.rise + 1);
  // and a crash is judged at no more than the town saw the bike going: steps of 3 m/s, then a page that says 25
  ride(-101.5, 107.5, Math.PI);
  for (let i = 1; i <= 22; i += 1) { run(w.host, 0.05); const step = send(id, { type: 'moto.drive', x: -101.5, z: 107.5 - i * 0.15, heading: Math.PI, speed: 3 }); assert.equal(step.ok, true, JSON.stringify(step)); }
  r = send(id, { type: 'moto.crash', speed: 25, heading: Math.PI });
  assert.equal(r.ok, true);
  assert.equal(r.fell, false, `a page that says 25 m/s, of a bike the town saw going at 3: ${JSON.stringify(r)}`);
  assert.equal(r.outcome, 'stop');
});

test('where a thrown rider comes down (19 October 2026): over a roadblock when there is ground beyond it; beside the bike against a wall, or the fence at the end of the land; the whole body always on open ground, never in anything', () => {
  const w = town(['Rider Six']);
  const { p, id, send, place } = w;
  send(id, { type: 'bikes.owned', bikes: ['white-sport'] });
  const LIE = { ahead: 0.85, behind: 0.95 };
  // the body lying along the way it was going, from the feet to the hands: nothing there, all of it on the land
  const bodyClear = (h) => { for (let k = -LIE.behind; k <= LIE.ahead + 1e-6; k += 0.15) { const x = p.x + Math.sin(h) * k, z = p.z + Math.cos(h) * k; const kind = zoneBlockKind(x, z, [], 0.2); if (kind) return `${kind} at ${x.toFixed(2)}, ${z.toFixed(2)}`; } return ''; };
  // ridden at `speed` along `h` for `steps` twentieths of a second (the town sees every step), to `end`, and into it
  const crash = (end, h, speed, steps) => {
    const ux = Math.sin(h), uz = Math.cos(h), d = speed * 0.05;
    place(p, end.x - ux * d * steps, end.z - uz * d * steps, h);
    const on = send(id, { type: 'bikes.ride', bike: 'white-sport' });
    assert.equal(on.ok, true, JSON.stringify(on));
    for (let i = 1; i <= steps; i += 1) { run(w.host, 0.05); const step = send(id, { type: 'moto.drive', x: end.x - ux * d * (steps - i), z: end.z - uz * d * (steps - i), heading: h, speed }); assert.equal(step.ok, true, `step ${i}: ${JSON.stringify(step)}`); }
    const at = { x: p.x, z: p.z };
    const r = send(id, { type: 'moto.crash', speed, heading: h });
    return { r, at, down: w.g.view(id).self.down };
  };
  const up = () => { run(w.host, CRASH.lie[1] + CRASH.rise + 1); assert.equal(w.g.view(id).self.down, null); };
  // into the roadblock at the south end of Waterside Road at 50 km/h: over the bars and over the boards, down on the
  // road beyond them (still the town's land, inside its fence), the body clear of the boards
  let c = crash({ x: -241.3, z: 113 }, -Math.PI / 2, 14, 24);
  assert.equal(c.r.fell, true, JSON.stringify(c.r));
  assert.ok(p.x < -243.35 - LIE.behind, `beyond the boards: ${p.x}`);
  assert.ok(p.x > -248.6 + LIE.ahead, `short of the fence at the end of the land: ${p.x}`);
  assert.ok(c.down.over && c.down.over.a > 0.3 && c.down.over.b > c.down.over.a && c.down.over.b < Math.hypot(p.x - c.at.x, p.z - c.at.z), `what it went over, along the way: ${JSON.stringify(c.down.over)}`);
  assert.equal(bodyClear(-Math.PI / 2), '');
  up();
  // head on into the purple tower's wall at 50 km/h: no way on: down beside the bike, alongside it, on its right (it
  // goes down on its left), the hands short of the wall
  c = crash({ x: -101.5, z: 104.0 }, Math.PI, 14, 18);
  assert.equal(c.r.fell, true, JSON.stringify(c.r));
  assert.equal(c.down.over, null);
  const right = { x: -Math.cos(Math.PI), z: Math.sin(Math.PI) };
  const sideways = (p.x - c.at.x) * right.x + (p.z - c.at.z) * right.z;
  assert.ok(sideways > 0.8 && sideways < 1.6, `beside the bike, on its right: ${sideways}`);
  assert.equal(bodyClear(Math.PI), '');
  up();
  // the fence along the end of the land, ridden straight at hard: it is not gone over (there is no land beyond it)
  assert.equal(zoneBlockKind(-248.6, 40, [], 0.6), 'barrier', 'the fence stands there');
  c = crash({ x: -247.6, z: 40 }, -Math.PI / 2, 14, 18);
  assert.equal(c.r.fell, true, JSON.stringify(c.r));
  assert.ok(p.x > -248.45, `not over the fence: ${p.x}`);
  assert.equal(c.down.over, null);
  assert.equal(bodyClear(-Math.PI / 2), '');
  up();
});

test('another player on their motorcycle, from another copy of the town: seen out at the airport too, with what the bike is doing (within bounds) and a horn when it is newly sounded', () => {
  const w = town(['Rider Four']);
  const { p, id, place } = w;
  place(p, -600, -454, 0);
  const seen = (ride) => w.g.visitors.seen('peer-1', { name: 'Ada_Rider', x: -606, z: -452, heading: 1.5, look: {}, ride });
  const v = seen({ bike: 'power-cruiser', lean: 2, speed: 500, throttle: 3, brake: 1, rev: 0.9, steer: -3, horns: 4 });
  assert.ok(v, 'out on the airport\'s land, beyond the town\'s square: still seen');
  // (its bars turned, held to the lock as the rest is held to what a bike can do)
  assert.deepEqual(v.ride, { bike: 'power-cruiser', lean: 0.9, speed: 70, throttle: 1, brake: 1, rev: 0.9, steer: -0.7 });
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
