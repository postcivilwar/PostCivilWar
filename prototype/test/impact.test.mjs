// Bodies in the way, and what a moving vehicle does to one: src/sim/impact.js.
//
//   node --test test/impact.test.mjs
//
// As in the other tests, everything is done by sending the requests a client sends. A test may put a player,
// a keke or a townsperson somewhere; it never sets anyone's health, and it never tells the simulation that
// anything was hit. Two players here are two players in one simulation: between two devices these rules need
// the shared world, which is not built.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { town, standing, whereIs, until, run, ok, refused, farFromPolice, quietSpot } from './world.mjs';
import { HEALTH } from '../src/sim/conflict.js';
import { IMPACT, BODY, harmAt, nearestOnStep } from '../src/sim/impact.js';
import { LAW } from '../src/sim/justice.js';
import { CARE } from '../src/sim/care.js';
import { POSE } from '../src/sim/population.js';
import { vehicleSpeedAt } from '../src/sim/vehicles.js';
import { zoneService, zoneWalkable } from '../src/sim/zone.js';
import { createHost } from '../src/sim/host.js';
import { FORMER_TOWN } from './helpers.mjs';

const PARK = zoneService('park');

// A player at the wheel of a hired keke, set down at (x, z) facing `heading`.
function atTheWheel(w, p, x, z, heading) {
  w.place(p, PARK.x, PARK.z);
  const hired = ok(w.send(p.id, { type: 'vehicle.hire' }));
  const v = w.g.state.vehicles.list[hired.vehicle.id];
  w.place(p, v.x + 1.4, v.z);
  ok(w.send(p.id, { type: 'vehicle.enter', vehicleId: v.id }));
  v.x = x; v.z = z; v.heading = heading; p.x = x; p.z = z; p.heading = heading; p.lastMoveAt = w.g.state.real;
  return v;
}

// Drives at a point the way a client does: a step every twentieth of a second, gathering speed, each step
// sent as a request. Returns everyone the simulation says was struck on the way.
function driveAt(w, p, tx, tz, { seconds = 8, horn = false, past = 6 } = {}) {
  const hits = [];
  let speed = 0;
  const start = w.g.view(p.id).self.driving;
  const heading = Math.atan2(tx - start.x, tz - start.z);
  const far = Math.hypot(tx - start.x, tz - start.z) + past;
  for (let t = 0; t < seconds; t += 0.05) {
    w.host.tick(0.05);
    const car = w.g.view(p.id).self.driving;
    if (!car) break;
    if (Math.hypot(car.x - start.x, car.z - start.z) >= far) break;
    speed = Math.min(vehicleSpeedAt(car.kind, car.x, car.z, false), speed + 4.5 * 0.05);
    if (horn) ok(w.send(p.id, { type: 'vehicle.horn' }));
    const r = w.send(p.id, { type: 'vehicle.drive', x: car.x + Math.sin(heading) * speed * 0.05, z: car.z + Math.cos(heading) * speed * 0.05, heading });
    if (!r.ok) { if (r.code === 'STALLED' || r.code === 'BLOCKED') { speed = 0; if (r.code === 'BLOCKED') break; continue; } throw new Error(`drive refused: ${r.code}`); }
    if (r.hit) { hits.push(...r.hit); speed = 0; if (hits.length && !horn) break; }
  }
  return hits;
}

// Open ground with a straight run of `metres` along +x, far from any officer.
function runway(w, metres = 30) {
  const [x, z] = quietSpot(w);
  for (let d = 0; d <= metres; d += 1) if (!zoneWalkable(x + d, z, [], 1.2)) return runwayFrom(w, metres);
  return [x, z];
}
function runwayFrom(w, metres) {
  for (let x = -260; x <= 200; x += 8) for (let z = -360; z <= 60; z += 8) {
    let free = true;
    for (let d = -2; d <= metres && free; d += 1) free = zoneWalkable(x + d, z, [], 1.3);
    if (!free) continue;
    const officers = w.pop.people.filter((q) => q.job === 'police').map((q) => whereIs(w, q.index)).filter((o) => o.pose !== POSE.hidden);
    if (officers.every((o) => Math.hypot(o.x - x, o.z - z) > 150)) return [x, z];
  }
  throw new Error('no runway');
}
// A run of open ground with not a soul within sight of it.
function lonelyRunway(w, metres = 30, clearOf = 45) {
  const seen = [];
  for (let i = 0; i < w.pop.count; i += 1) { const at = whereIs(w, i); if (at.pose !== POSE.hidden) seen.push(at); }
  for (let x = -260; x <= 200; x += 8) for (let z = -360; z <= 60; z += 8) {
    let free = true;
    for (let d = -2; d <= metres && free; d += 1) free = zoneWalkable(x + d, z, [], 1.3);
    if (free && seen.every((o) => Math.hypot(o.x - (x + 14), o.z - z) > clearOf)) return [x, z];
  }
  throw new Error('nowhere lonely enough');
}

// ---------------------------------------------------------------- standing in the way --

test('two players cannot stand in the same place: one walking into the other is stopped', () => {
  const w = town(['Ada Walker', 'Bayo Stands'], { funded: false });
  const [a, b] = w.players;
  const [x, z] = quietSpot(w);
  w.place(a, x, z); w.place(b, x + 3, z);
  // Ada walks straight at Bayo, a step every tenth of a second
  let stopped = null;
  for (let k = 0; k < 60 && !stopped; k += 1) {
    w.host.tick(0.1);
    const r = w.send(a.id, { type: 'move', x: a.x + 0.2, z: a.z, heading: Math.PI / 2 });
    if (!r.ok) stopped = r;
  }
  assert.ok(stopped, 'she was stopped');
  assert.equal(stopped.code, 'IN_THE_WAY');
  assert.match(stopped.message, /Bayo Stands is in the way/);
  const gap = Math.hypot(a.x - b.x, a.z - b.z);
  assert.ok(gap >= BODY.radius * 2 - 1e-6 && gap < BODY.radius * 2 + 0.25, `she stands ${gap.toFixed(2)} m from him, shoulder to shoulder and no nearer`);
  // he has not been moved by it
  assert.equal(b.x, x + 3);
});

test('nobody walks through a townsperson either: the step is refused, and says where they stand', () => {
  const w = town(['Ada Walker'], { funded: false });
  const [a] = w.players;
  const MARKET_ROAD = [0, 60];
  const them = standing(w, ...MARKET_ROAD, { range: 200 }).find((s) => { const h = s.h; return zoneWalkable(s.x - Math.sin(h + 1.57) * 2, s.z - Math.cos(h + 1.57) * 2); });
  assert.ok(them, 'someone standing still somewhere in town');
  // set down two metres to one side of them, then walk straight at them
  const ux = Math.sin(them.h + 1.57), uz = Math.cos(them.h + 1.57);
  w.place(a, them.x - ux * 2, them.z - uz * 2);
  let stopped = null;
  for (let k = 0; k < 30 && !stopped; k += 1) {
    const r = w.send(a.id, { type: 'move', x: a.x + ux * 0.2, z: a.z + uz * 0.2, heading: Math.atan2(ux, uz) });
    if (!r.ok) stopped = r;
  }
  assert.ok(stopped, 'she was stopped');
  assert.equal(stopped.code, 'IN_THE_WAY');
  assert.ok(stopped.at && Math.hypot(stopped.at.x - them.x, stopped.at.z - them.z) < 0.6, 'the refusal says where they stand');
  assert.ok(Math.hypot(a.x - them.x, a.z - them.z) >= BODY.radius * 2 - 1e-6, 'and she is no nearer than shoulder to shoulder');
  // a step away is always allowed
  ok(w.send(a.id, { type: 'move', x: a.x - ux * 0.2, z: a.z - uz * 0.2, heading: 0 }));
});

test('nobody passes through anybody: a step that would carry one clean through the other is refused too', () => {
  const w = town(['Ada Walker', 'Bayo Stands'], { funded: false });
  const [a, b] = w.players;
  const [x, z] = quietSpot(w);
  w.place(a, x, z); w.place(b, x + 0.9, z);
  w.host.tick(0.4);
  // one long stride, within what a runner may cover in the time, that begins and ends clear of him but crosses him
  const through = w.send(a.id, { type: 'move', x: x + 1.8, z, heading: Math.PI / 2, run: true });
  refused(through, 'IN_THE_WAY');
  assert.equal(a.x, x, 'she is where she was');
  // quick changes of direction do not get through either
  for (const dz of [0.05, -0.05, 0.1, -0.1]) { w.host.tick(0.4); refused(w.send(a.id, { type: 'move', x: x + 1.8, z: z + dz, heading: 0, run: true }), 'IN_THE_WAY'); }
  // round him is allowed: the same journey by a path that keeps its distance
  w.host.tick(0.4); ok(w.send(a.id, { type: 'move', x: x + 0.3, z: z + 0.9, heading: 0, run: true }));
  w.host.tick(0.4); ok(w.send(a.id, { type: 'move', x: x + 1.6, z: z + 0.9, heading: 0, run: true }));
  w.host.tick(0.4); ok(w.send(a.id, { type: 'move', x: x + 1.8, z, heading: 0, run: true }));
});

test('nobody can be pinned: two players set down on the same spot may each step away, and only away', () => {
  const w = town(['Ada Walker', 'Bayo Stands'], { funded: false });
  const [a, b] = w.players;
  const [x, z] = quietSpot(w);
  w.place(a, x, z); w.place(b, x + 0.2, z);
  w.host.tick(0.3);
  refused(w.send(a.id, { type: 'move', x: x + 0.1, z, heading: 0 }), 'IN_THE_WAY');
  ok(w.send(a.id, { type: 'move', x: x - 0.3, z, heading: 0 }));
  w.host.tick(0.3);
  ok(w.send(b.id, { type: 'move', x: x + 0.5, z, heading: 0 }));
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= BODY.radius * 2);
});

test('someone in a vehicle, in the ambulance or dead takes up no room on the road', () => {
  const w = town(['Ada Walker', 'Bayo Stands']);
  const [a, b] = w.players;
  const [x, z] = runway(w);
  atTheWheel(w, b, x + 3, z, 0);
  w.place(a, x + 2.2, z);
  w.host.tick(0.3);
  // she is beside his keke: it is the keke that is in her way now (a different refusal), not him
  const r = w.send(a.id, { type: 'move', x: x + 2.3, z, heading: 0 });
  assert.notEqual(r.code, 'IN_THE_WAY');
});

// ---------------------------------------------------------------- struck by a vehicle --

test('how hard a blow is depends on how fast the vehicle was going', () => {
  assert.equal(harmAt(0), 0);
  assert.equal(harmAt(IMPACT.least - 0.1), 0, 'a nudge does no harm');
  assert.equal(harmAt(IMPACT.least), IMPACT.floor);
  assert.ok(harmAt(5) > harmAt(3) && harmAt(9) > harmAt(5));
  assert.equal(harmAt(40), IMPACT.most, 'and there is a most');
  assert.ok(harmAt(9) < HEALTH.max, 'one blow at a keke\'s top speed does not kill someone in full health');
  assert.ok(harmAt(9) * 2 >= HEALTH.max, 'two do');
  // the geometry it rests on
  assert.equal(nearestOnStep(0, 0, 10, 0, 5, 2), 2);
  assert.equal(nearestOnStep(0, 0, 10, 0, 13, 4), 5);
  assert.equal(nearestOnStep(0, 0, 0, 0, 3, 4), 5);
});

test('a keke driven into a player knocks them down: health is lost, they lie there, they get up', () => {
  const w = town(['Dayo Driver', 'Vera Victim']);
  const [d, v] = w.players;
  const [x, z] = runway(w);
  atTheWheel(w, d, x, z, Math.PI / 2);
  w.place(v, x + 14, z);
  const hits = driveAt(w, d, x + 14, z);
  assert.equal(hits.length, 1, 'the simulation says who was struck; the driver\'s client did not');
  assert.deepEqual({ kind: hits[0].kind, id: hits[0].id, killed: hits[0].killed }, { kind: 'player', id: v.id, killed: false });
  assert.ok(hits[0].harm >= IMPACT.floor && hits[0].harm < HEALTH.max);
  assert.equal(v.health, HEALTH.max - hits[0].harm);
  assert.ok(v.x > x + 14.3, 'she was thrown forward');
  const mine = w.g.view(v.id).self;
  assert.ok(mine.down && !mine.down.rising, 'she is on the ground');
  // she cannot walk, fight or do business while she is down
  refused(w.send(v.id, { type: 'move', x: v.x + 0.1, z: v.z, heading: 0 }), 'DOWN');
  refused(w.send(v.id, { type: 'combat.engage', target: { kind: 'player', id: d.id } }), 'DOWN');
  // the keke was stopped by it
  refused(w.send(d.id, { type: 'vehicle.drive', x: d.x + 0.3, z: d.z, heading: Math.PI / 2 }), 'STALLED');
  // others see her on the ground
  assert.equal(w.g.view(d.id).others[v.id].down, true);
  // she gets up by herself, and has her legs again
  const took = until(w, () => !v.down, 10);
  assert.ok(took >= IMPACT.down[0] && took <= IMPACT.down[1] + IMPACT.rise + 0.2, `down for ${took.toFixed(1)} s`);
  assert.equal(w.g.view(v.id).self.down, null);
  w.host.tick(0.2);
  ok(w.send(v.id, { type: 'move', x: v.x + 0.1, z: v.z, heading: 0 }));
  // and her health did not come back with her
  assert.equal(v.health, HEALTH.max - hits[0].harm);
});

test('no client can say it happened: there is no request that knocks down, hurts, kills or revives', () => {
  const w = town(['Dayo Driver', 'Vera Victim']);
  const [d, v] = w.players;
  for (const type of ['impact.hit', 'vehicle.hit', 'impact.kill', 'player.kill', 'player.revive', 'health.set', 'impact.down']) refused(w.send(d.id, { type, target: v.id, id: v.id, health: 0 }), 'UNKNOWN_INTENT');
  // a drive step that carries its own verdict is still only a step
  const [x, z] = runway(w);
  atTheWheel(w, d, x, z, Math.PI / 2);
  w.place(v, x + 40, z + 30);
  w.host.tick(0.1);
  const r = ok(w.send(d.id, { type: 'vehicle.drive', x: x + 0.2, z, heading: Math.PI / 2, hit: [{ kind: 'player', id: v.id, killed: true }], speed: 99 }));
  assert.equal(r.hit, undefined);
  assert.equal(v.health, HEALTH.max);
  assert.equal(v.dead, null);
});

test('one pass is one blow, and two vehicles at once are one blow', () => {
  const w = town(['Dayo Driver', 'Vera Victim', 'Sola Second']);
  const [d, v, s] = w.players;
  const [x, z] = runway(w, 40);
  atTheWheel(w, d, x, z, Math.PI / 2);
  w.place(v, x + 14, z);
  // the keke goes on pushing at her for a second after it strikes: still one blow
  const first = driveAt(w, d, x + 14, z);
  const after = v.health;
  for (let k = 0; k < 10; k += 1) { w.host.tick(0.05); w.send(d.id, { type: 'vehicle.drive', x: d.x + 0.05, z: d.z, heading: Math.PI / 2 }); }
  assert.equal(v.health, after);
  assert.equal(first.length, 1);
  // a second vehicle arriving in the same instant does not count twice
  const before = v.health;
  v.struckByVehicleAt = w.g.state.real;      // the moment of the first blow, as the simulation recorded it
  const I = w.I.impact;
  const again = I.step(s, { kind: 'moto', id: 1 }, { pace: 8, paceAt: w.g.state.real }, v.x - 2, v.z, v.x, v.z, Math.PI / 2, 0.05);
  assert.deepEqual(again, []);
  assert.equal(v.health, before);
});

test('struck again and again, a player is brought to 20 and no lower: nobody dies, and the ambulance is sent for her (the 20-life rule)', () => {
  const w = town(['Dayo Driver', 'Vera Victim']);
  const [d, v] = w.players;
  const [x, z] = runway(w, 40);
  atTheWheel(w, d, x, z, Math.PI / 2);
  const keke = w.g.state.vehicles.list[d.driving];
  let blows = 0, after = 0;
  for (let pass = 0; pass < 60 && after < 3; pass += 1) {
    // back to the start of the run, with her standing in the middle of it
    run(w.host, 1.2);
    keke.x = x; keke.z = z; keke.heading = Math.PI / 2; d.x = x; d.z = z; d.lastMoveAt = w.g.state.real;
    if (!v.down) w.place(v, x + 14, z);
    const before = v.health;
    const hits = driveAt(w, d, v.x, v.z);
    if (!hits.length) continue;
    blows += 1;
    if (before <= HEALTH.critical) after += 1; else assert.ok(v.health < before);
    assert.ok(v.health >= HEALTH.critical, `never below 20 (${v.health})`);
    assert.equal(hits[0].killed, false);
  }
  assert.equal(after, 3, 'struck three more times at 20');
  assert.equal(v.health, HEALTH.critical, 'she is at 20, and no lower');
  assert.equal(v.dead, null, 'nobody dies');
  assert.ok(blows >= 4, `it took ${blows} blows at this speed`);
  const mine = w.g.view(v.id).self;
  assert.equal(mine.critical, true);
  assert.equal(mine.dead, null);
  // told calmly, in the owner's words, and the ambulance is on its way, free
  assert.ok(w.events(v.id).some((e) => e.type === 'critical' && e.text === 'You are badly hurt. An ambulance is on its way.'));
  assert.ok(mine.ambulance && mine.ambulance.fee === 0, 'the ambulance is coming for her, free');
});

test('a blow on someone already on the ground counts for less', () => {
  const w = town(['Dayo Driver', 'Vera Victim']);
  const [d, v] = w.players;
  const [x, z] = runway(w, 40);
  atTheWheel(w, d, x, z, Math.PI / 2);
  const keke = w.g.state.vehicles.list[d.driving];
  w.place(v, x + 14, z);
  const first = driveAt(w, d, x + 14, z)[0];
  // straight back at her from a few metres, while she is still down
  run(w.host, IMPACT.grace + 0.1);
  keke.x = v.x - 5; keke.z = v.z; d.x = keke.x; d.z = keke.z; d.lastMoveAt = w.g.state.real;
  const hits = driveAt(w, d, v.x, v.z, { seconds: 2 });
  assert.equal(hits.length, 1);
  assert.ok(v.down, 'she had not got up');
  assert.ok(hits[0].harm < first.harm, `${hits[0].harm} on the ground, ${first.harm} standing`);
  assert.ok(hits[0].harm >= 1);
});

test('brought to 20 by a vehicle, she cannot run or fight, nobody may fight her, and the ambulance carries her to the hospital', () => {
  const w = town(['Dayo Driver', 'Vera Victim']);
  const [d, v] = w.players;
  const [x, z] = runway(w, 40);
  atTheWheel(w, d, x, z, Math.PI / 2);
  const keke = w.g.state.vehicles.list[d.driving];
  for (let pass = 0; pass < 60 && v.health > HEALTH.critical; pass += 1) {
    run(w.host, 1.2);
    keke.x = x; keke.z = z; d.x = x; d.z = z; d.lastMoveAt = w.g.state.real;
    if (!v.down) w.place(v, x + 14, z);
    driveAt(w, d, v.x, v.z);
  }
  assert.equal(v.health, HEALTH.critical);
  const purse = w.balance(v);
  until(w, () => !v.down, 30);
  // she cannot fight, and nobody may fight her
  refused(w.send(v.id, { type: 'combat.engage', target: { kind: 'player', id: d.id } }), 'CRITICAL');
  ok(w.send(d.id, { type: 'vehicle.exit' }));
  w.place(d, v.x + 1, v.z);
  refused(w.send(d.id, { type: 'combat.engage', target: { kind: 'player', id: v.id } }), 'TARGET_DOWN');
  // the ambulance comes for her and carries her to the hospital, for nothing
  until(w, () => w.g.view(v.id).self.carried === 'aboard', 300);
  until(w, () => w.g.view(v.id).self.carried === null, 300);
  assert.ok(Math.hypot(v.x - CARE.ambulance.door.x, v.z - CARE.ambulance.door.z) < 1, 'she is at the hospital\'s emergency door');
  assert.equal(w.balance(v), purse, 'the ambulance cost her nothing');
  assert.equal(v.stats.deaths || 0, 0);
  assert.deepEqual(w.host.auditor.reconcile(), [], 'the ledger balances');
});

test('being down, and being dead, survive a save and a reload', () => {
  const w = town(['Dayo Driver', 'Vera Victim']);
  const [d, v] = w.players;
  const [x, z] = runway(w);
  atTheWheel(w, d, x, z, Math.PI / 2);
  w.place(v, x + 14, z);
  const hits = driveAt(w, d, x + 14, z);
  assert.equal(hits.length, 1);
  const health = v.health;
  const again = createHost({ saved: JSON.parse(JSON.stringify(w.host.save())) });
  const q = again.game.state.players[v.id];
  assert.equal(q.health, health, 'a reload does not heal');
  assert.ok(q.down, 'she is still on the ground');
  assert.equal(again.game.intent(v.id, { type: 'move', x: q.x + 0.1, z: q.z, heading: 0 }).code, 'DOWN');
  for (let t = 0; t < 6; t += 0.1) again.tick(0.1);
  assert.equal(again.game.state.players[v.id].down, null, 'and gets up in the reloaded world as she would have');
});

// ---------------------------------------------------------------- who may see whose health --

test('nobody is shown another player\'s health until they have something to do with each other', () => {
  const w = town(['Dayo Driver', 'Vera Victim', 'Wale Watcher']);
  const [d, v, o] = w.players;
  const [x, z] = runway(w);
  atTheWheel(w, d, x, z, Math.PI / 2);
  w.place(v, x + 14, z); w.place(o, x + 10, z + 8);
  // walking past each other: no number, for anyone
  for (const viewer of [d, v, o]) for (const row of Object.values(w.g.view(viewer.id).others)) assert.equal(row.health, null);
  assert.deepEqual(w.g.view(d.id).self.involved, []);
  driveAt(w, d, x + 14, z);
  // the driver and the one he hit now see each other's; the bystander sees neither
  assert.equal(w.g.view(d.id).others[v.id].health, v.health);
  assert.equal(w.g.view(v.id).others[d.id].health, d.health);
  assert.deepEqual(w.g.view(d.id).self.involved.map((e) => [e.kind, e.id, e.health]), [['player', v.id, v.health]]);
  assert.equal(w.g.view(o.id).others[v.id].health, null);
  assert.equal(w.g.view(o.id).others[d.id].health, null);
  assert.equal(w.g.view(o.id).others[v.id].down, true, 'though he can see she is on the ground');
  // and it passes
  run(w.host, IMPACT.seen + 0.5);
  assert.equal(w.g.view(d.id).others[v.id].health, null);
  assert.deepEqual(w.g.view(d.id).self.involved, []);
});

// ---------------------------------------------------------------- townspeople --

// (what townspeople do in the road is judged on the town as it was until 22 October 2026, FORMER_TOWN: the town has no
// townspeople now but its police, and their systems are kept ready for the owner's own models)
test('townspeople get out of the way of a vehicle that sounds its horn', () => {
  const w = town(['Dayo Driver'], { people: FORMER_TOWN });
  const d = w.p;
  const someone = farFromPolice(w, standing(w, 8, 58, { range: 400, not: ['police'] })).find((a) => { for (let k = 2; k <= 16; k += 1) if (!zoneWalkable(a.x - k, a.z, [], 1.3)) return false; return zoneWalkable(a.x, a.z + 2.4) || zoneWalkable(a.x, a.z - 2.4); });
  assert.ok(someone, 'someone standing with a clear road in front of them');
  atTheWheel(w, d, someone.x - 15, someone.z, Math.PI / 2);
  const hits = driveAt(w, d, someone.x, someone.z, { horn: true });
  assert.deepEqual(hits.filter((h) => h.kind === 'npc' && h.id === someone.i), [], 'they were not struck');
  const now = whereIs(w, someone.i);
  // (an old person may already be on the way back to where they were by the time the keke has passed)
  assert.ok(Math.abs(now.z - someone.z) > 0.6 || Math.abs(now.x - someone.x) > 0.6 || (now.act === 'Going back' && Math.hypot(now.x - someone.x, now.z - someone.z) > 0.3), `they stepped aside ${JSON.stringify({ someone: { x: someone.x, z: someone.z }, now })}`);
});

test('a townsperson who cannot get clear is knocked down, bleeds, and gets up; struck again and again, they are brought to 20 and no lower (nobody dies)', () => {
  const w = town(['Dayo Driver', 'Ebuka Careful'], { people: FORMER_TOWN });
  const d = w.p;
  const [x, z] = runway(w, 40);
  const people = farFromPolice(w, standing(w, x, z, { range: 500, not: ['police'] }));
  const A = w.I.actors;
  const inTheRoad = (who) => { A.take(who.i, w.g.state.t); const m = A.get(who.i); m.x = x + 14; m.z = z; A.hold(who.i, 'Standing in the road', POSE.stand, w.g.state.real + 600); };
  // the first: struck once, at speed
  const first = people[0];
  inTheRoad(first);
  atTheWheel(w, d, x, z, Math.PI / 2);
  const keke = w.g.state.vehicles.list[d.driving];
  let hits = driveAt(w, d, x + 14, z);
  assert.equal(hits.length, 1);
  assert.deepEqual({ kind: hits[0].kind, id: hits[0].id, killed: hits[0].killed }, { kind: 'npc', id: first.i, killed: false });
  assert.equal(whereIs(w, first.i).pose, POSE.lie, 'they are on the ground');
  const rec = w.I.impact.record(first.i);
  assert.equal(rec.health, 100 - hits[0].harm);
  assert.equal(rec.blood, hits[0].harm, 'they bleed as much as they were hurt');
  // the blood is there to be drawn, under them
  const pool = w.g.view(d.id).blood.find((b) => b.key === `n:${first.i}`);
  assert.ok(pool && pool.lying && !pool.dead && pool.blood === rec.blood);
  // the driver may see how badly, for a while
  assert.deepEqual(w.g.view(d.id).self.involved.map((e) => [e.kind, e.id]), [['npc', first.i]]);
  // run down again and again: the blood grows with every blow, and they are brought to 20 and no lower: nobody dies
  let lastBlood = rec.blood, atFloor = 0;
  for (let pass = 0; pass < 30 && atFloor < 2; pass += 1) {
    run(w.host, 1.2);
    const at = whereIs(w, first.i);
    keke.x = at.x - 14; keke.z = at.z; d.x = keke.x; d.z = keke.z; d.lastMoveAt = w.g.state.real;
    hits = driveAt(w, d, at.x, at.z);
    const hit = hits.find((h) => h.id === first.i);
    if (hit) { assert.equal(hit.killed, false); assert.ok(w.I.impact.record(first.i).blood >= lastBlood, 'more blood with each blow'); lastBlood = w.I.impact.record(first.i).blood; if (w.I.impact.record(first.i).health <= HEALTH.critical) atFloor += 1; }
  }
  assert.equal(atFloor, 2, 'struck at 20 again');
  assert.equal(w.I.impact.record(first.i).health, HEALTH.critical, 'at 20, and no lower');
  assert.ok(!Object.values(w.g.state.justice.crimes).some((c) => c.type === 'death_by_driving'), 'nobody was killed');
  ok(w.send(d.id, { type: 'vehicle.exit' }));
  // they get up again in time
  until(w, () => whereIs(w, first.i).pose !== POSE.lie, 90);
  // a second person, struck once, gets up and walks back to what they were doing
  const second = people[1];
  const e = w.players[1];
  inTheRoad(second);
  atTheWheel(w, e, x, z, Math.PI / 2);
  hits = driveAt(w, e, x + 14, z);
  assert.ok(hits.some((h) => h.id === second.i && !h.killed));
  ok(w.send(e.id, { type: 'vehicle.exit' }));
  until(w, () => whereIs(w, second.i).pose !== POSE.lie, 60);
});

test('a child in the road is never struck: they jump clear', () => {
  const w = town(['Dayo Driver'], { people: FORMER_TOWN });
  const d = w.p;
  const [x, z] = runway(w, 40);
  const child = w.pop.people.find((q) => q.age < IMPACT.minAge && q.age >= 6);
  const A = w.I.actors;
  assert.ok(A.take(child.index, w.g.state.t, { x: x + 14, z }), 'a child, set down in the road');
  A.hold(child.index, 'Standing in the road', POSE.stand, w.g.state.real + 600);
  atTheWheel(w, d, x, z, Math.PI / 2);
  const hits = driveAt(w, d, x + 14, z);
  assert.deepEqual(hits, []);
  assert.equal(w.I.impact.record(child.index).health, 100);
  assert.notEqual(whereIs(w, child.index).pose, POSE.lie);
});

// ---------------------------------------------------------------- the law --

test('running someone down is written in the police\'s book with its reason; with no officer on the scene it is no crime to them (31 October 2026): no stars, nobody looking for the driver', () => {
  const w = town(['Dayo Driver', 'Vera Victim']);
  const [d, v] = w.players;
  const [x, z] = runway(w);
  atTheWheel(w, d, x, z, Math.PI / 2);
  w.place(v, x + 14, z);
  driveAt(w, d, x + 14, z);
  const crimes = Object.values(w.g.state.justice.crimes);
  assert.equal(crimes.length, 1);
  assert.equal(crimes[0].type, 'dangerous_driving');
  assert.equal(crimes[0].culprit, d.id);
  assert.deepEqual(crimes[0].victim, { kind: 'player', id: v.id, name: 'Vera Victim' });
  assert.equal(crimes[0].vehicle.kind, 'keke');
  // no officer within sight of it: she knows who hit her, but the police were not there, and that is the end of it
  assert.deepEqual(crimes[0].witnesses, []);
  assert.equal(crimes[0].detection, 'unseen');
  assert.ok(w.events(v.id).some((e) => e.type === 'witness' && /No police officer was there to see it/.test(e.text)), 'she is told the police did not see it');
  run(w.host, 20);
  const law = w.g.view(d.id).self.law;
  assert.equal(law.state, 'normal');
  assert.equal(law.stars, 0);
  assert.deepEqual(law.wanted, []);
  // nor can she tell them of it by phone after
  assert.deepEqual(w.g.view(v.id).self.law.seen, []);
});

test('a vehicle kills nobody: a blow on someone already badly hurt leaves them at 20, and a driver seen doing it by an officer is wanted for dangerous driving', () => {
  const w = town(['Dayo Driver', 'Vera Victim', 'Wale Watcher']);
  const [d, v, o] = w.players;
  const [x, z] = runway(w, 40);
  atTheWheel(w, d, x, z, Math.PI / 2);
  // she is already badly hurt (once, a blow like this one killed)
  w.I.conflict.injure(v, HEALTH.max - 24);
  // a police officer on her beat stands a few metres off the road, and another player too (22 October 2026: only the
  // police are witnesses, the owner's word)
  const officer = w.pop.people.find((q) => q.job === 'police' && whereIs(w, q.index).pose !== POSE.hidden);
  assert.ok(officer, 'an officer is out on her beat at ten in the morning');
  w.I.actors.take(officer.index, w.g.state.t);
  const m = w.I.actors.get(officer.index); m.x = x + 12; m.z = z + 6;
  w.I.actors.hold(officer.index, 'On patrol', POSE.stand, w.g.state.real + 600);
  w.place(v, x + 14, z); w.place(o, x + 12, z + 9);
  const hits = driveAt(w, d, x + 14, z);
  assert.equal(hits[0].killed, false);
  assert.equal(v.health, HEALTH.critical, 'at 20');
  assert.equal(v.dead, null);
  const crime = Object.values(w.g.state.justice.crimes)[0];
  assert.equal(crime.type, 'dangerous_driving');
  assert.ok(crime.witnesses.some((e) => e.kind === 'npc' && e.id === officer.index && e.police), 'the officer saw it');
  assert.ok(!crime.witnesses.some((e) => e.kind === 'player'), 'the other player is no witness');
  assert.ok(!w.events(o.id).some((e) => e.type === 'witness'), 'and is not asked to be one');
  until(w, () => w.g.view(d.id).self.law.state !== 'normal', LAW.report[1] + 2);
  assert.deepEqual(w.g.view(d.id).self.law.wanted.map((c) => c.name), ['Dangerous driving causing harm']);
  // he gives himself up on foot, and an officer takes him
  ok(w.send(d.id, { type: 'vehicle.exit' }));
  ok(w.send(d.id, { type: 'police.surrender' }));
  until(w, () => !!d.custody, 400);
  const arrest = w.g.view(d.id).self.law.arrest;
  assert.match(arrest.offences.map((c) => c.name).join(), /Dangerous driving causing harm/);
  assert.equal(arrest.fine.amount, LAW.offences.dangerous_driving.fine);
});
