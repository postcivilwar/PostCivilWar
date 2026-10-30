// The town's people on bicycles, skateboards and skates (31 October 2026, stage 3 of the owner's brief of 30 October: "10
// NPCs riding bicycles, 5 on skateboards, and 5 on skating shoes ... The player must also be able to hijack these ...
// hijacked bikes cannot be resold"): who they are, where and how they ride, what they do about what is in their way, and
// taking one from its rider, riding it, leaving it, and the police giving everything back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { town, run } from './world.mjs';
import { RIDERS, SPORT_RIDING, BEATS, chooseRiders } from '../src/sim/sport-riders.js';
import { SPORT_HANDLING } from '../src/sim/sport-ride.js';
import { zoneWalkable, ZONE_ROADS } from '../src/sim/zone.js';
import { POSE } from '../src/sim/population.js';

const out = (r) => r.mode === 'ride' || r.mode === 'stop' || r.mode === 'turn';
// a town at 10 in the morning with one player near the middle, its riders let out and ridden for `seconds`
function townOut(seconds = 300, names = ['Watcher']) {
  const w = town(names, { hour: 10 });
  for (const p of w.players) w.place(p, 0, 0, 0);
  const sr = w.I.sportRiders;
  const seen = { unwalkable: 0, close: Infinity, turns: 0, pace: {}, side: 0, sideOk: 0 };
  const was = new Map();
  for (let t = 0; t < seconds; t += 0.25) {
    run(w.host, 0.25);
    const list = sr.riders();
    for (const r of list) {
      if (!out(r)) { was.set(r.n, r.mode); continue; }
      if (!zoneWalkable(r.x, r.z, [], 0.3)) seen.unwalkable += 1;
      if (was.get(r.n) !== 'turn' && r.mode === 'turn') seen.turns += 1;
      if (r.mode === 'ride') { seen.pace[r.item] = Math.max(seen.pace[r.item] || 0, r.v); seen.side += 1; if (r.lat > 0) seen.sideOk += 1; }
      was.set(r.n, r.mode);
    }
    for (let a = 0; a < list.length; a += 1) for (let b = a + 1; b < list.length; b += 1) if (out(list[a]) && out(list[b])) seen.close = Math.min(seen.close, Math.hypot(list[a].x - list[b].x, list[a].z - list[b].z));
  }
  return { w, sr, seen };
}

test('twenty of the town\'s people: ten on bicycles, five on skateboards, five on skates; each its own road, the boards and skates only on the tar', () => {
  const w = town(['Counter']);
  const sr = w.I.sportRiders;
  const riders = sr.riders();
  assert.equal(riders.length, 20);
  assert.deepEqual(RIDERS, { bicycle: 10, skateboard: 5, 'inline-skates': 5 });
  const by = (k) => riders.filter((r) => r.item === k).length;
  assert.equal(by('bicycle'), 10); assert.equal(by('skateboard'), 5); assert.equal(by('inline-skates'), 5);
  // twenty different people, of riding age, none of them police or motorists; each of the owner's figures at most once
  const people = w.I.population.people;
  assert.equal(new Set(riders.map((r) => r.i)).size, 20);
  for (const r of riders) { const p = people[r.i]; assert.ok(p.age >= 16 && p.age <= 38 && p.job !== 'police' && p.job !== 'motorist', `${p.name}: ${p.job}, ${p.age}`); }
  const figures = riders.map((r) => people[r.i].look && people[r.i].look.figure).filter(Boolean);
  assert.equal(new Set(figures).size, figures.length, 'each a different figure');
  assert.deepEqual(chooseRiders(people), riders.map((r) => r.i), 'the same each time');
  // the skateboards and the skates on tarred roads only
  for (const k of ['skateboard', 'inline-skates']) for (const id of BEATS[k]) assert.equal(ZONE_ROADS.find((q) => q.id === id).surface, 'asphalt', `${k} on ${id}`);
});

test('by day they ride their roads: at their own pace, on the right near the edge, round at the ends, never into a wall or each other', () => {
  const { sr, seen } = townOut(420);
  const riding = sr.riders().filter(out);
  assert.ok(riding.length >= 14, `${riding.length} out`);
  assert.equal(seen.unwalkable, 0, 'never on ground that cannot be walked');
  assert.ok(seen.turns >= 10, `${seen.turns} turned round at a road's end`);
  assert.ok(seen.close > 0.6, `two riders never nearer than ${seen.close.toFixed(2)} m`);
  assert.ok(seen.sideOk / seen.side > 0.97, 'on the right of the road');
  // as fast as such things go, ridden by someone not racing
  const kmh = (v) => v * 3.6;
  assert.ok(kmh(seen.pace.bicycle) > 12 && kmh(seen.pace.bicycle) <= kmh(SPORT_RIDING.pace.bicycle[1]) + 0.5, `bicycles at most ${kmh(seen.pace.bicycle)}`);
  assert.ok(kmh(seen.pace.skateboard) > 7 && kmh(seen.pace.skateboard) <= kmh(SPORT_RIDING.pace.skateboard[1]) + 0.8, `skateboards at most ${kmh(seen.pace.skateboard)}`);
  assert.ok(kmh(seen.pace['inline-skates']) > 8 && kmh(seen.pace['inline-skates']) <= kmh(SPORT_RIDING.pace['inline-skates'][1]) + 0.8);
  for (const k of Object.keys(seen.pace)) assert.ok(seen.pace[k] <= SPORT_HANDLING[k].top);
});

test('while out on it a rider is not also walking about: the town\'s people are told where they are, as hidden', () => {
  const { w, sr } = townOut(120);
  const r = sr.riders().find(out);
  assert.ok(r);
  const at = w.I.population.locate(r.i, w.g.state.t, {});
  assert.equal(at.pose, POSE.hidden);
  assert.ok(Math.hypot(at.x - r.x, at.z - r.z) < 0.01);
  assert.match(at.act, /Cycling|Skateboarding|Skating|Standing/);
});

test('a player near sees them: which, where, how fast, where they are in their pedalling or pushing', () => {
  const { w, sr } = townOut(120);
  const r = sr.riders().find((q) => out(q));
  w.place(w.p, r.x + 5, r.z, 0);
  const seen = w.g.view(w.id).sportRiders;
  const it = seen.find((q) => q.n === r.n);
  assert.ok(it && it.item === r.item && it.person === r.i && Number.isFinite(it.phase) && Number.isFinite(it.speed), JSON.stringify(it));
});

// One riding near the player, slowed for them to reach: the player put right beside them.
function besideOne(w, sr, item = 'bicycle') {
  for (let k = 0; k < 400; k += 1) {
    const r = sr.riders().find((q) => q.item === item && q.mode === 'ride' && q.v > 1);
    if (r) { r.v = 2; w.place(w.p, r.x + Math.cos(r.h) * 1.2, r.z - Math.sin(r.h) * 1.2, r.h); return r; }
    run(w.host, 0.5);
  }
  return null;
}

test('taken from its rider: they are pushed off and run shouting, the police are told; it is ridden as one\'s own, never owned, never sold', () => {
  const { w, sr } = townOut(60);
  const { p, id, send } = w;
  const r = besideOne(w, sr);
  assert.ok(r, 'a cyclist to take it from');
  // too fast: not taken
  r.v = SPORT_RIDING.slow + 1;
  assert.equal(send(id, { type: 'sports.take', n: r.n }).code, 'TOO_FAST');
  r.v = 2;
  const got = send(id, { type: 'sports.take', n: r.n });
  assert.equal(got.ok, true, JSON.stringify(got));
  assert.equal(got.item, 'bicycle');
  const self = w.g.view(id).self;
  assert.equal(self.astride.sport, 'bicycle');
  assert.equal(self.astride.taken, r.n);
  assert.equal(r.mode, 'taken');
  // the rider: off it and running from the thief; the police: a vehicle taken
  const m = w.I.actors.get(r.i);
  assert.ok(m && /thief/i.test(m.act), JSON.stringify(m && m.act));
  const law = w.I.justice.lawOf ? w.I.justice.lawOf(p) : null;
  assert.ok(!law || law.crimes.some((c) => c.type === 'vehicle_theft'), 'taking it is a crime');
  // never theirs: not on their list of things (the server's), so never in the market; the server's list does not change it
  assert.deepEqual(self.ownSports.items, []);
  send(id, { type: 'sports.owned', items: [] });
  assert.equal(w.g.view(id).self.astride.sport, 'bicycle', 'still ridden: the server knows nothing of it');
  // ridden: each step moves it
  run(w.host, 0.2);
  const step = send(id, { type: 'moto.drive', x: p.x + Math.sin(p.heading) * 1, z: p.z + Math.cos(p.heading) * 1, heading: p.heading, speed: 4, throttle: 1, phase: 1 });
  assert.equal(step.ok, true, JSON.stringify(step));
  assert.ok(Math.hypot(r.x - p.x, r.z - p.z) < 0.01, 'the town has it where the thief has it');
  // left: it stands where it was left, not among their own; back on from beside it
  const off = send(id, { type: 'moto.leave' });
  assert.equal(off.ok, true);
  assert.equal(r.mode, 'kept');
  assert.deepEqual(w.g.view(id).self.ownSports.parked, []);
  const kept = w.g.view(id).sportRiders.find((q) => q.n === r.n);
  assert.ok(kept && kept.mine && kept.person === null);
  const back = send(id, { type: 'sports.retake', n: r.n });
  assert.equal(back.ok, true, JSON.stringify(back));
  assert.equal(w.g.view(id).self.astride.taken, r.n);
});

test('caught by the police: everything taken goes back; its owner walks to it and rides off again', () => {
  const { w, sr } = townOut(60);
  const { p, id, send } = w;
  const r = besideOne(w, sr);
  assert.ok(r);
  assert.equal(send(id, { type: 'sports.take', n: r.n }).ok, true);
  send(id, { type: 'moto.leave' });
  const back = sr.recover(p.id);
  assert.equal(back, 1);
  assert.equal(r.mode, 'returning');
  for (let k = 0; k < 240 && r.mode === 'returning'; k += 1) run(w.host, 0.5);
  assert.ok(out(r) || r.mode === 'off', `back with its owner: ${r.mode}`);
  assert.equal(r.takenBy, null);
});

test('one player holds three at most: a fourth taken, the first is found by its owner', () => {
  const { w, sr } = townOut(60);
  const { id, send } = w;
  const taken = [];
  for (let k = 0; k < 4; k += 1) {
    const r = besideOne(w, sr, k % 2 ? 'skateboard' : 'bicycle') || besideOne(w, sr, 'inline-skates');
    assert.ok(r, `a rider for the ${k + 1}th`);
    const got = send(id, { type: 'sports.take', n: r.n });
    assert.equal(got.ok, true, JSON.stringify(got));
    send(id, { type: 'moto.leave' });
    w.I.actors.drop(r.i);
    taken.push(r);
  }
  assert.equal(taken[0].mode, 'returning');
  assert.equal(taken.filter((r) => r.mode === 'kept').length, 3);
});

test('a car of the town\'s does not run a rider down: it slows behind one in its way', () => {
  const w = town(['Driver Watch'], { hour: 10 });
  w.place(w.p, 0, 0, 0);
  const obstacles = w.I.sportRiders.obstacles();
  // every rider out on the road is something in the traffic's way (traffic.js asks for them)
  run(w.host, 30);
  assert.ok(w.I.sportRiders.obstacles().length >= obstacles.length);
  for (const o of w.I.sportRiders.obstacles()) assert.ok(o.hw > 0 && o.hl > 0 && Number.isFinite(o.v));
});
