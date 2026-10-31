// A player's car against everything in its way (31 October 2026, the owner's words: "users can use their car to run
// over another car, as if nothing was blocking. Sometimes cars pass through characters without jamming them ... I don't
// want characters to stop a car movement when jammed, the car should jam them if they block the road/path. Jam them and
// climb over them, while the tyres of the car is climbing them, it should show on the car reaction").
//
// Another player's car, driven or standing, and any motorcycle left standing, is as solid to it as one of the town's
// (in-the-way.js); one already against it never holds it there. Whoever is in its way is struck at any pace but a
// standstill and goes down across its way a little ahead of it; the car is never stopped by them, goes on over them
// where they lie, and they stay down until it is past (impact.js). A town rider is knocked off, what they rode thrown
// off the car's way, and goes back for it after (sport-riders.js). Another player's car driven through this town's own
// player knocks them down here (never below 20). The wheels climb over a body and the body answers on its springs
// (wheel-bumps.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { town, run } from './world.mjs';
import { POSE } from '../src/sim/population.js';
import { carFits } from '../src/sim/own-cars.js';
import { HEALTH } from '../src/sim/conflict.js';
import { IMPACT } from '../src/sim/impact.js';
import { visitorBoxes, clearOf } from '../src/sim/in-the-way.js';
import { POWER_CARS } from '../src/sim/power-cars.js';
import { wheelLifts, bodyOn, bodyBars, BUMP } from '../src/client/wheel-bumps.js';
import { CAR_PARTS } from '../src/client/car-parts.js';

const ROAD = { x: -420, z: -60 };          // a straight stretch of road, heading north (+z)
const CAR = 'grey-saloon';

function inCar(w, at = ROAD, h = 0) {
  w.send(w.id, { type: 'cars.owned', cars: [CAR] });
  w.place(w.p, at.x, at.z, h);
  const r = w.send(w.id, { type: 'cars.enter', car: CAR });
  assert.ok(r.ok, `into the car: ${r.code || ''}`);
  return r;
}
// Drives straight on at `speed` metres a second, a step each tenth of a second: what stopped it, how far it went, what
// it struck.
function drive(w, h, steps, speed, until = null) {
  let stopped = null, went = 0;
  const hits = [];
  for (let k = 0; k < steps; k += 1) {
    run(w.host, 0.1);
    const r = w.send(w.id, { type: 'car.drive', x: w.p.x + Math.sin(h) * speed * 0.1, z: w.p.z + Math.cos(h) * speed * 0.1, heading: h, speed, throttle: 1, steer: 0, rev: 0.5 });
    if (!r.ok) { stopped = r.code; break; }
    went += speed * 0.1;
    for (const q of r.hit || []) hits.push(q);
    if (until && until()) break;
  }
  return { stopped, went, hits };
}
// someone of the town's, grown up and not one of the police, held standing at (x, z)
function standingAt(w, x, z) {
  const A = w.I.actors;
  for (let i = 0; i < w.pop.count; i += 1) {
    const who = w.pop.people[i];
    if (who.age < 20 || who.job === 'police' || A.has(i)) continue;
    if (w.pop.locate(i, w.g.state.t, {}).pose !== POSE.stand) continue;
    A.take(i, w.g.state.t, { x, z });
    A.hold(i, 'Waiting', POSE.stand, 0);
    A.get(i).h = Math.PI / 2;
    return i;
  }
  throw new Error('nobody to stand there');
}

test('another player\'s car, driven or standing, and a motorcycle left standing, are solid to a car; one already against it never holds it', () => {
  const peer = (w, data) => { for (let k = 0; k < 3; k += 1) { w.g.visitors.seen('peer-a', { name: 'Other_Driver', look: {}, ...data }); run(w.host, 0.1); } };
  {
    const w = town(['Car Tester'], { hour: 10 }); inCar(w);
    peer(w, { x: ROAD.x, z: ROAD.z + 15, heading: Math.PI / 2, car: { car: 'red-winged-supercar', speed: 0 } });
    const r = drive(w, 0, 40, 8);
    assert.equal(r.stopped, 'BLOCKED', 'into another player\'s car being driven');
    assert.ok(r.went > 8 && r.went < 14, `stopped at it, not through it: ${r.went.toFixed(1)} m`);
  }
  {
    const w = town(['Car Tester'], { hour: 10 }); inCar(w);
    peer(w, { x: ROAD.x + 3, z: ROAD.z + 12, heading: 0, cars: [{ car: 'red-winged-supercar', x: ROAD.x, z: ROAD.z + 15, h: Math.PI / 2 }] });
    assert.equal(drive(w, 0, 40, 8).stopped, 'BLOCKED', 'into another player\'s car standing');
  }
  {
    const w = town(['Car Tester'], { hour: 10 }); inCar(w);
    w.p.parked = { 'night-rider': { x: ROAD.x, z: ROAD.z + 14, h: Math.PI / 2 } };
    assert.equal(drive(w, 0, 40, 8).stopped, 'BLOCKED', 'into a motorcycle left standing');
  }
  {
    // another player's car (so their page says) on top of this one: it does not hold it there
    const w = town(['Car Tester'], { hour: 10 }); inCar(w);
    peer(w, { x: ROAD.x + 0.5, z: ROAD.z + 1, heading: 0, car: { car: 'red-winged-supercar', speed: 0 } });
    const r = drive(w, 0, 10, 8);
    assert.equal(r.stopped, null, 'driven away from it');
    // (the same whole: none of it is left to hold the car)
    const boxes = visitorBoxes(w.g.visitors.list());
    assert.ok(boxes.length > 0);
    assert.equal(clearOf(boxes, POWER_CARS[CAR], ROAD.x, ROAD.z, 0, 0.2).length, 0);
  }
});

test('someone standing in a car\'s way is knocked down at any pace, the car goes on over them, and they stay down until it is past', () => {
  // at a crawl
  {
    const w = town(['Car Tester'], { hour: 10 }); inCar(w);
    const i = standingAt(w, ROAD.x + 0.3, ROAD.z + 8);
    let underCar = 0, upUnder = 0;
    const r = drive(w, 0, 160, 1.0, () => {
      const m = w.I.actors.get(i);
      if (!m) return false;
      const a = m.z - w.p.z;
      const under = a > -POWER_CARS[CAR].length / 2 && a < POWER_CARS[CAR].length / 2;
      if (under) { underCar += 1; if (m.pose !== POSE.lie) upUnder += 1; }
      return false;
    });
    assert.equal(r.stopped, null, 'the car was never stopped');
    assert.ok(r.went > 15, `it went on: ${r.went.toFixed(1)} m`);
    assert.ok(r.hits.some((h) => h.kind === 'npc' && h.id === i && !h.over), 'struck at a crawl (1 m/s)');
    assert.ok(r.hits.some((h) => h.id === i && h.over), 'and gone over where they lay');
    assert.ok(underCar > 20, `the car over them a while: ${underCar}`);
    assert.equal(upUnder, 0, 'nobody gets up under a car');
  }
  // at speed
  {
    const w = town(['Car Tester'], { hour: 10 }); inCar(w);
    const i = standingAt(w, ROAD.x + 0.3, ROAD.z + 10);
    const r = drive(w, 0, 40, 8);
    assert.equal(r.stopped, null, 'not stopped by them');
    assert.ok(r.went > 30, `it went on: ${r.went.toFixed(1)} m`);
    const hit = r.hits.filter((h) => h.id === i);
    assert.equal(hit.length, 1, 'struck once');
    const m = w.I.actors.get(i);
    assert.equal(m.pose, POSE.lie, 'down on the road');
    assert.ok(m.z > ROAD.z + 10.5, `thrown a little ahead: ${(m.z - ROAD.z).toFixed(2)} m along`);
    assert.ok(Math.abs(Math.cos(m.h)) < 0.01, `lying across the car's way (facing ${m.h.toFixed(2)})`);
    assert.ok(Math.abs(m.x - (ROAD.x + 0.3)) < 0.05, 'in its way, where they were');
    assert.ok(w.p.z > m.z + 3, 'and the car has gone over them and on');
  }
});

test('a town rider in a car\'s way is knocked off, what they rode thrown off its way, and later back on it', () => {
  const w = town(['Car Tester'], { hour: 10 });
  const S = w.I.sportRiders;
  // (the town's cars kept off the road for this, where they would be in the way, as they should be)
  const noTraffic = () => { for (const c of w.I.traffic.cars) if (c.mode === 'drive' || c.mode === 'stop') { c.mode = 'off'; c.v = 0; } };
  // (the town's cars standing at the roadside are counted as in the way once a player is near them, traffic.js `boxes`)
  const behind = (q) => { for (let b = 12; b < 30; b += 1) if (carFits(CAR, q.x - Math.sin(q.h) * b, q.z - Math.cos(q.h) * b, q.h, [...w.I.vehicles.boxes(), ...S.boxes(true), ...w.I.traffic.boxes()])) return b; return 0; };
  let r = null;
  for (let k = 0; k < 20000 && !r; k += 1) { noTraffic(); run(w.host, 0.1); r = S.riders().find((q) => q.mode === 'ride' && q.v > 1 && behind(q)); }
  assert.ok(r, 'a rider out on a road a car fits along');
  w.send(w.id, { type: 'cars.owned', cars: [CAR] });
  w.place(w.p, r.x - Math.sin(r.h) * 15, r.z - Math.cos(r.h) * 15, r.h); noTraffic(); run(w.host, 0.1);
  const b = behind(r);
  w.place(w.p, r.x - Math.sin(r.h) * b, r.z - Math.cos(r.h) * b, r.h);
  const into = w.send(w.id, { type: 'cars.enter', car: CAR });
  assert.ok(into.ok, `into the car behind the rider: ${into.code || ''} (${r.road}, ${b} m back)`);
  // after them, steering for them as they go along their road (no more than a car turns in a step)
  const res = { stopped: null, hits: [] };
  for (let k = 0; k < 80 && r.mode !== 'returning'; k += 1) {
    noTraffic(); run(w.host, 0.1);
    const want = Math.atan2(r.x - w.p.x, r.z - w.p.z), now = w.p.pcar.h;
    const turn = Math.max(-0.12, Math.min(0.12, Math.atan2(Math.sin(want - now), Math.cos(want - now))));
    const hh = now + turn;
    const q = w.send(w.id, { type: 'car.drive', x: w.p.x + Math.sin(hh) * 0.9, z: w.p.z + Math.cos(hh) * 0.9, heading: hh, speed: 9, throttle: 1, steer: 0, rev: 0.5 });
    if (!q.ok) { res.stopped = q.code; break; }
    for (const hit of q.hit || []) res.hits.push(hit);
  }
  const h = w.p.pcar.h;
  assert.equal(res.stopped, null, 'the car was not stopped by the rider');
  assert.equal(r.mode, 'returning', 'knocked off');
  assert.ok(r.fallen, 'what they rode lies on the road');
  assert.ok(res.hits.some((q) => q.rider === r.n && q.id === r.i), 'struck as someone on foot is');
  const m = w.I.actors.get(r.i);
  assert.ok(m && m.pose === POSE.lie && m.act === 'Knocked down', 'down on the road');
  // the bicycle off the car's way: further from the car's middle line than half the car and its own half
  const lat = Math.abs((r.x - w.p.x) * Math.cos(h) - (r.z - w.p.z) * Math.sin(h));
  assert.ok(lat > POWER_CARS[CAR].width / 2 + 0.5, `thrown aside: ${lat.toFixed(2)} m from the car's middle line`);
  assert.ok(Math.abs(Math.cos(m.h - h)) < 0.01, 'the rider lying across the car\'s way');
  for (let k = 0; k < 900 && r.mode === 'returning'; k += 1) run(w.host, 0.1);
  assert.equal(r.mode, 'ride', 'up again, back on it and away');
  assert.equal(S.audit().knocked, 1);
});

test('another player\'s car driven through this town\'s own player knocks them down here, never below 20, and a car put somewhere is not driven there', () => {
  const pass = (w, from, to, speed, name) => { let z = from; while (z < to) { w.g.visitors.seen('peer-d', { name, x: ROAD.x - 0.2, z, heading: 0, look: {}, car: { car: 'red-winged-supercar', speed } }); run(w.host, 0.1); z += speed * 0.1; } };
  {
    const w = town(['Walker Tester'], { hour: 10 }); w.place(w.p, ROAD.x, ROAD.z, 0);
    pass(w, ROAD.z - 20, ROAD.z + 10, 8, 'Fast_Driver');
    assert.ok(w.p.down, 'knocked down');
    assert.ok(w.p.health < 100 && w.p.health >= HEALTH.critical, `hurt, by how fast it was seen to go: ${w.p.health}`);
    assert.ok(w.p.z > ROAD.z + 1, 'thrown along its way');
    const told = w.events(w.id).filter((e) => e.type === 'alert' && e.title === 'Knocked down');
    assert.equal(told.length, 1);
    assert.match(told[0].text, /Fast_Driver hit you with a car/);
  }
  {
    // again and again: never below 20
    const w = town(['Walker Tester'], { hour: 10 }); w.place(w.p, ROAD.x, ROAD.z, 0);
    w.p.health = HEALTH.critical + 5;
    for (let n = 0; n < 3; n += 1) { pass(w, w.p.z - 20, w.p.z + 6, 15, 'Fast_Driver'); run(w.host, IMPACT.visitorEvery + 0.5); }
    assert.ok(w.p.health >= HEALTH.critical, `${w.p.health}`);
  }
  {
    // a car put down thirty metres on in one word was not driven there
    const w = town(['Walker Tester'], { hour: 10 }); w.place(w.p, ROAD.x, ROAD.z, 0);
    for (const z of [ROAD.z - 20, ROAD.z - 20, ROAD.z + 10, ROAD.z + 10]) { w.g.visitors.seen('peer-j', { name: 'Jumpy_Driver', x: ROAD.x, z, heading: 0, look: {}, car: { car: 'red-winged-supercar', speed: 8 } }); run(w.host, 0.1); }
    assert.equal(w.p.down, null);
    assert.equal(w.p.health, 100);
  }
});

test('a keke and a motorcycle are still stopped for a moment by whoever they strike; a car is not', () => {
  assert.ok(IMPACT.stall > 0 && IMPACT.carry > 0.5 && IMPACT.carry < 1, 'a car keeps most of its pace');
  assert.ok(IMPACT.crawl < IMPACT.least, 'a car strikes at a pace slower than anything else does');
});

test('the wheels climb over a body lying in the way, and the body answers on its springs (wheel-bumps.js)', () => {
  const parts = CAR_PARTS[CAR];
  const L = POWER_CARS[CAR].length, scale = L / parts.length;
  const wheels = parts.wheels.map((w, k) => ({ x: w.x * scale, z: w.z * scale, r: w.r * scale, front: k < 2 }));
  const R = wheels[0].r;
  // someone lying across the way 6 m ahead of the car's middle (as a car that struck them leaves them)
  const bars = bodyBars({ x: 0, z: 6, h: Math.PI / 2 });
  const lifts = [];
  let most = 0, firstAt = null, frontUp = 0, backUp = 0, pitchMin = 0, pitchMax = 0, rollMost = 0;
  const st = {};
  const dt = 1 / 60, speed = 3;
  for (let t = 0, z = 0; z < 14; t += dt, z += speed * dt) {
    wheelLifts(bars, wheels, 0, z, 0, 0, lifts);
    const b = bodyOn(st, lifts, wheels, dt);
    most = Math.max(most, ...lifts);
    if (firstAt === null && lifts[0] > 0.001) firstAt = z + wheels[0].z;
    if (lifts[0] > 0.05 && lifts[1] > 0.05) frontUp += 1;
    if (lifts[2] > 0.05 && lifts[3] > 0.05) backUp += 1;
    pitchMin = Math.min(pitchMin, b.pitch); pitchMax = Math.max(pitchMax, b.pitch); rollMost = Math.max(rollMost, Math.abs(b.roll));
  }
  assert.ok(Math.abs(most - 2 * BUMP.trunk) < 0.01, `a wheel goes over the top of them: ${most.toFixed(3)} m (twice the trunk's half, ${2 * BUMP.trunk})`);
  // a wheel of radius R first touches a bar of radius r a little before it, as a real one does
  const reach = Math.sqrt((R + BUMP.trunk) ** 2 - (R - BUMP.trunk) ** 2);
  assert.ok(Math.abs((6 - firstAt) - reach) < 0.06, `climbing from ${(6 - firstAt).toFixed(3)} m short of them (${reach.toFixed(3)})`);
  assert.ok(frontUp > 5 && backUp > 5, 'the front wheels climb over, then the back');
  assert.ok(pitchMin < -0.02, `the nose up as the front wheels climb: ${pitchMin.toFixed(3)} rad`);
  assert.ok(pitchMax > 0.02, `and down as the back ones do: ${pitchMax.toFixed(3)} rad`);
  assert.ok(rollMost < 0.005, 'level from side to side, across the whole way');
  // and it settles: a while after, on the flat, the body is back on its springs as it was
  for (let k = 0; k < 240; k += 1) bodyOn(st, [0, 0, 0, 0], wheels, dt);
  assert.ok(Math.abs(st.rise) < 0.002 && Math.abs(st.pitch) < 0.002, 'settled again');
  // only one side over them: it leans
  const side = bodyBars({ x: 0.85, z: 6, h: 0 });
  const st2 = {};
  let lean = 0;
  for (let z = 0; z < 10; z += speed * dt) { wheelLifts(side, wheels, 0, z, 0, 0, lifts); lean = Math.max(lean, bodyOn(st2, lifts, wheels, dt).roll); }
  assert.ok(lean > 0.02, `a body under its left wheels only: it leans over to its right (${lean.toFixed(3)} rad)`);
});
