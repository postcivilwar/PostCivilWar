// Tests of the guns in the town's own simulation (src/sim/guns.js): the starter rifle every player has, free; rounds,
// the rate of fire, reloading; a round stopping at the first thing in its way; the police shooting back; the 20-life
// rule; hits on this player told by the website's server, taken once each.
//
//   node --test test/guns.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { town, until, run, ok, refused, quietSpot, whereIs } from './world.mjs';
import { GUN, GUNS, STARTER_GUN, rayWorld, rayPost } from '../src/sim/guns.js';
import { HEALTH } from '../src/sim/conflict.js';
import { LAW } from '../src/sim/justice.js';
import { POSE } from '../src/sim/population.js';
import { zoneGroundY, zoneWalkable } from '../src/sim/zone.js';

const R = GUNS.rifle;
const muzzleOf = (p, d) => [p.x + d[0] * 0.6, zoneGroundY(p.x, p.z) + 1.4, p.z + d[2] * 0.6];
const level = (h) => [Math.sin(h), 0, Math.cos(h)];
// one round from where the player stands, along a way (a heading, and up or down)
const shoot = (w, p, d) => w.send(p.id, { type: 'gun.fire', shots: [{ o: muzzleOf(p, d), d }] });
// waits for the gun to be ready to fire again
const ready = (w) => run(w.host, 60 / R.rpm + 0.01);
// an officer out on her beat, put where a test wants her, standing
function officerAt(w, x, z) {
  const officer = w.pop.people.find((q) => q.job === 'police' && whereIs(w, q.index).pose !== POSE.hidden);
  assert.ok(officer, 'an officer is out on her beat');
  w.I.actors.take(officer.index, w.g.state.t);
  const m = w.I.actors.get(officer.index); m.x = x; m.z = z;
  w.I.actors.hold(officer.index, 'On patrol', POSE.stand, w.g.state.real + 600);
  return officer.index;
}
// open ground with a clear line `metres` long eastward: [x, z]
function range(w, metres = 30) {
  const [x, z] = quietSpot(w);
  for (let dx = -60; dx <= 60; dx += 3) for (let dz = -60; dz <= 60; dz += 3) {
    const ax = x + dx, az = z + dz;
    if (!zoneWalkable(ax, az)) continue;
    // (clear from 8 m behind to a little past `metres` ahead: another player may stand behind)
    const o = [ax - 8, zoneGroundY(ax, az) + 1.4, az];
    const hit = rayWorld(o, [1, 0, 0], metres + 12);
    if (hit.what === 'air' && [-8, -6, -3, 2, 6, 10, metres].every((k) => zoneWalkable(ax + k, az))) return [ax, az];
  }
  throw new Error('no open line');
}

test('every player has the rifle from the start, free: 30 in it and 120 spare, and taking it out costs nothing', () => {
  const w = town(['Ada Newcomer']);
  const before = w.balance(w.p);
  const gun = w.g.view(w.id).self.gun;
  assert.equal(gun.equipped, STARTER_GUN);
  assert.deepEqual(gun.have.map((g) => [g.id, g.mag, g.spare, g.starter]), [['rifle', 30, 120, true]]);
  assert.equal(gun.out, false, 'put away to begin with');
  assert.ok(GUNS.rifle.starter && GUNS.rifle.price === 0 && GUNS.rifle.forSale === false, 'never sold');
  const drawn = ok(w.send(w.id, { type: 'gun.draw' })).gun;
  assert.equal(drawn.out, true);
  assert.equal(w.balance(w.p), before, 'no TR taken');
  ok(w.send(w.id, { type: 'gun.holster' }));
  assert.equal(w.g.view(w.id).self.gun.out, false);
});

test('a round a shot: the magazine counts down, the rate of fire is kept, and an empty gun fires nothing', () => {
  const w = town(['Ola Shooter']);
  const [x, z] = range(w);
  w.place(w.p, x, z, Math.PI / 2);
  ok(w.send(w.id, { type: 'gun.draw' }));
  const d = level(Math.PI / 2);
  const first = ok(shoot(w, w.p, d));
  assert.equal(first.shots[0].ok, true);
  assert.equal(first.mag, 29);
  // the next, at once: not yet (the rifle fires at its own rate, however fast it is asked)
  const second = ok(shoot(w, w.p, d));
  assert.deepEqual([second.shots[0].ok, second.shots[0].code], [false, 'NOT_READY']);
  assert.equal(second.mag, 29, 'a round not fired is not spent');
  // at its rate, it fires again; the whole magazine, and then nothing
  let mag = 29;
  while (mag > 0) { ready(w); const r = ok(shoot(w, w.p, d)); assert.equal(r.shots[0].ok, true); mag -= 1; assert.equal(r.mag, mag); }
  ready(w);
  const empty = ok(shoot(w, w.p, d));
  assert.deepEqual([empty.shots[0].ok, empty.shots[0].code, empty.mag, empty.spare], [false, 'EMPTY', 0, 120]);
  assert.equal(w.p.stats.shots, 30);
});

test('a reload takes its time, moves rounds from the spare into the gun only when it is done, and cannot be got round', () => {
  const w = town(['Ike Reloader']);
  const [x, z] = range(w);
  w.place(w.p, x, z, Math.PI / 2);
  refused(w.send(w.id, { type: 'gun.reload' }), 'NOT_OUT');
  ok(w.send(w.id, { type: 'gun.draw' }));
  refused(w.send(w.id, { type: 'gun.reload' }), 'FULL');
  const d = level(Math.PI / 2);
  for (let k = 0; k < 7; k += 1) { ok(shoot(w, w.p, d)); ready(w); }
  assert.equal(w.g.view(w.id).self.gun.mag, 23);
  const started = ok(w.send(w.id, { type: 'gun.reload' }));
  assert.equal(started.reloading.seconds, R.reload);
  refused(w.send(w.id, { type: 'gun.reload' }), 'NOT_READY');
  // while it is being reloaded it does not fire, and nothing has moved yet
  const during = ok(shoot(w, w.p, d));
  assert.deepEqual([during.shots[0].ok, during.shots[0].code], [false, 'RELOADING']);
  assert.deepEqual([w.g.view(w.id).self.gun.mag, w.g.view(w.id).self.gun.spare], [23, 120]);
  run(w.host, R.reload - 0.3);
  assert.ok(w.g.view(w.id).self.gun.reloading, 'not done yet');
  run(w.host, 0.4);
  const gun = w.g.view(w.id).self.gun;
  assert.deepEqual([gun.mag, gun.spare, gun.reloading], [30, 113, null]);
  // put away part way through a reload: it stops, and moves nothing
  for (let k = 0; k < 3; k += 1) { ready(w); ok(shoot(w, w.p, d)); }
  ok(w.send(w.id, { type: 'gun.reload' }));
  run(w.host, 0.5);
  ok(w.send(w.id, { type: 'gun.holster' }));
  run(w.host, R.reload);
  ok(w.send(w.id, { type: 'gun.draw' }));
  assert.deepEqual([w.g.view(w.id).self.gun.mag, w.g.view(w.id).self.gun.spare], [27, 113]);
  // with nothing spare, there is nothing to reload with
  w.p.gun.have.rifle = { mag: 5, spare: 0 };
  refused(w.send(w.id, { type: 'gun.reload' }), 'NO_SPARE');
});

test('a round stops at the first thing in its way: a wall, the ground; never through it', () => {
  const w = town(['Tobi Wall']);
  // a wall: from open ground, the nearest thing solid a little way off along some heading
  const [x, z] = range(w);
  let wall = null;
  for (let h = 0; h < Math.PI * 2 && !wall; h += Math.PI / 32) {
    const o = [x, zoneGroundY(x, z) + 1.4, z], d = level(h);
    const hit = rayWorld(o, d, 60);
    if (hit.what === 'wall' && hit.at > 4) wall = { h, at: hit.at };
  }
  assert.ok(wall, 'a wall within sight');
  w.place(w.p, x, z, wall.h);
  ok(w.send(w.id, { type: 'gun.draw' }));
  const d = level(wall.h);
  const r = ok(shoot(w, w.p, d)).shots[0];
  assert.equal(r.what, 'wall');
  const flew = Math.hypot(r.end[0] - muzzleOf(w.p, d)[0], r.end[2] - muzzleOf(w.p, d)[2]);
  assert.ok(Math.abs(flew - (wall.at - 0.6)) < 0.5, `it stopped at the wall (${flew.toFixed(2)} m, the wall ${wall.at.toFixed(2)} m)`);
  // and an officer standing behind that wall is not touched by it
  const behind = [x + d[0] * (wall.at + 3), z + d[2] * (wall.at + 3)];
  if (zoneWalkable(behind[0], behind[1])) {
    const i = officerAt(w, behind[0], behind[1]);
    ready(w);
    const again = ok(shoot(w, w.p, d)).shots[0];
    assert.equal(again.what, 'wall');
    assert.equal(w.I.conflict.record(i), null, 'she was not hit');
  }
  // straight down: the ground
  ready(w);
  const down = ok(w.send(w.id, { type: 'gun.fire', shots: [{ o: muzzleOf(w.p, d), d: [0.05, -1, 0] }] })).shots[0];
  assert.equal(down.what, 'ground');
});

test('an officer shot is hurt a round at a time, shoots back at whoever shot her, and they are wanted for it', () => {
  const w = town(['Femi Shooter']);
  const [x, z] = range(w, 20);
  w.place(w.p, x, z, Math.PI / 2);
  const i = officerAt(w, x + 14, z);
  ok(w.send(w.id, { type: 'gun.draw' }));
  const d = level(Math.PI / 2);
  // aimed at her chest
  const o = muzzleOf(w.p, d);
  const chest = [x + 14, zoneGroundY(x + 14, z) + 1.25, z];
  const v = [chest[0] - o[0], chest[1] - o[1], chest[2] - o[2]], len = Math.hypot(...v);
  const r = ok(w.send(w.id, { type: 'gun.fire', shots: [{ o, d: v.map((k) => k / len) }] })).shots[0];
  assert.equal(r.what, 'person');
  assert.deepEqual([r.target.kind, r.target.id], ['npc', i]);
  assert.equal(r.damage, GUN.damage, 'one hit, the owner\'s setting');
  assert.equal(w.I.conflict.record(i).health, HEALTH.max - GUN.damage);
  assert.equal(w.I.conflict.record(i).mood, 'shooting');
  // she shoots back: rounds of hers come at the shooter, and some hit
  const before = w.p.health;
  until(w, () => w.p.health < before, 30);
  assert.ok(w.events(w.id).some((e) => e.type === 'shot' && e.damage === GUN.damage), 'told of each hit');
  const hers = w.g.view(w.id).shots.filter((s) => s.from === `n:${i}`);
  assert.ok(hers.length > 0, 'her rounds are there to be seen and heard');
  // shooting at a police officer is an offence; she knows who shot her, and the police are told
  until(w, () => w.g.view(w.id).self.law.state !== 'normal', LAW.report[1] + 3);
  assert.ok(w.g.view(w.id).self.law.wanted.some((c) => c.name === 'Shooting at a police officer'));
});

test('the 20-life rule: shot down to 20 and no lower; the police stop; at 20 nobody shoots, and nobody can shoot them', () => {
  const w = town(['Kola Hurt', 'Bola Other']);
  const [a, b] = w.players;
  const [x, z] = range(w, 20);
  w.place(a, x, z, Math.PI / 2);
  // (a little to one side of the line between the two players, so that a round between them does not pass her)
  const side = zoneWalkable(x + 12, z + 3) ? 3 : -3;
  const i = officerAt(w, x + 12, z + side);
  ok(w.send(a.id, { type: 'gun.draw' }));
  const d = level(Math.PI / 2);
  // a shot past her: she is being shot at, and shoots back
  const o = muzzleOf(a, d);
  const past = [12, 0, side * 0.55], pl = Math.hypot(...past);
  ok(w.send(a.id, { type: 'gun.fire', shots: [{ o, d: past.map((k) => k / pl) }] }));
  assert.equal(w.I.conflict.record(i).mood, 'shooting');
  a.health = HEALTH.critical + 3;
  // (the other player stands by, gun out, a few metres behind)
  w.place(b, x - 6, z, Math.PI / 2);
  ok(w.send(b.id, { type: 'gun.draw' }));
  until(w, () => a.health <= HEALTH.critical, 120);
  assert.equal(a.health, HEALTH.critical);
  // at once: another player's round goes past them (nobody at 20 can be shot), and the aim over them says so (green)
  run(w.host, 0.2);
  const ob = muzzleOf(b, d);
  const at = [a.x, zoneGroundY(a.x, a.z) + 1.2, a.z], v = [at[0] - ob[0], at[1] - ob[1], at[2] - ob[2]], len = Math.hypot(...v);
  const look = w.g.aimAt(ob, v.map((k) => k / len), 40);
  assert.deepEqual([look.target.kind, look.target.id, look.target.able], ['local', a.id, false]);
  const r = ok(w.send(b.id, { type: 'gun.fire', shots: [{ o: ob, d: v.map((k) => k / len) }] })).shots[0];
  assert.notEqual(r.what === 'person' && r.target.id === a.id, true, 'not hit');
  assert.equal(a.health, HEALTH.critical);
  // they cannot use a gun now (it was put away for them)
  assert.equal(w.g.view(a.id).self.gun.out, false);
  refused(w.send(a.id, { type: 'gun.draw' }), 'CRITICAL');
  // the officer stops at once, and a while later has not brought them lower
  run(w.host, 10);
  assert.equal(a.health, HEALTH.critical, 'no lower than 20');
  assert.notEqual(w.I.conflict.record(i).mood, 'shooting');
});

test('two players in one town: a round that hits the other takes the owner\'s one point, and it is an offence', () => {
  const w = town(['Chidi Shooter', 'Ngozi Target']);
  const [a, b] = w.players;
  const [x, z] = range(w, 20);
  w.place(a, x, z, Math.PI / 2); w.place(b, x + 10, z, -Math.PI / 2);
  ok(w.send(a.id, { type: 'gun.draw' }));
  const o = muzzleOf(a, level(Math.PI / 2));
  const at = [b.x, zoneGroundY(b.x, b.z) + 1.1, b.z], v = [at[0] - o[0], at[1] - o[1], at[2] - o[2]], len = Math.hypot(...v);
  const r = ok(w.send(a.id, { type: 'gun.fire', shots: [{ o, d: v.map((k) => k / len) }] })).shots[0];
  assert.deepEqual([r.what, r.target.kind, r.target.id, r.damage], ['person', 'local', b.id, GUN.damage]);
  assert.equal(b.health, HEALTH.max - GUN.damage);
  assert.ok(w.events(b.id).some((e) => e.type === 'shot' && e.by === a.name));
  assert.ok(Object.values(w.g.state.justice.crimes).some((c) => c.type === 'shooting' && c.culprit === a.id && c.victim.id === b.id));
});

test('hits told by the website\'s server are taken once each, never more than a round does, and never below 20', () => {
  const w = town(['Uche Target']);
  const p = w.p;
  const hits = [{ id: 11, dmg: 1, name: 'Somebody', at: [p.x, 1.2, p.z], from: [p.x - 9, p.z] }, { id: 12, dmg: 50, name: 'Somebody' }];
  const r = ok(w.send(w.id, { type: 'gun.struck', hits }));
  assert.deepEqual(r.applied.map((h) => [h.id, h.lost]), [[11, 1], [12, GUN.damage]], 'a round takes no more than the owner\'s setting');
  assert.equal(p.health, HEALTH.max - 2 * GUN.damage);
  // told again (a message sent twice, a reply lost and asked again): nothing more
  const again = ok(w.send(w.id, { type: 'gun.struck', hits }));
  assert.deepEqual(again.applied, []);
  assert.equal(p.health, HEALTH.max - 2 * GUN.damage);
  // down to 20, and no lower
  p.health = HEALTH.critical + 1;
  ok(w.send(w.id, { type: 'gun.struck', hits: [{ id: 13, dmg: 1 }, { id: 14, dmg: 1 }, { id: 15, dmg: 1 }] }));
  assert.equal(p.health, HEALTH.critical);
});

test('only the guns a player owns can be taken out, and what the server says they own and have is what they have', () => {
  const w = town(['Ama Owner']);
  refused(w.send(w.id, { type: 'gun.draw', gun: 'cannon' }), 'NO_GUN');
  refused(w.send(w.id, { type: 'gun.equip', gun: 'cannon' }), 'NO_GUN');
  // the server's word: rounds as it counts them; a gun the game does not know is not kept; the starter is always there
  const told = ok(w.send(w.id, { type: 'gun.owned', guns: [{ id: 'rifle', mag: 12, spare: 60 }, { id: 'cannon', mag: 9, spare: 9 }] })).gun;
  assert.deepEqual(told.have.map((g) => [g.id, g.mag, g.spare]), [['rifle', 12, 60]]);
  assert.equal(told.server, true);
  ok(w.send(w.id, { type: 'gun.owned', guns: [] }));
  assert.deepEqual(w.g.view(w.id).self.gun.have.map((g) => g.id), ['rifle'], 'the starter is never taken away');
  // numbers out of bounds are brought within them
  ok(w.send(w.id, { type: 'gun.owned', guns: [{ id: 'rifle', mag: 999, spare: -5 }] }));
  assert.deepEqual([w.g.view(w.id).self.gun.mag, w.g.view(w.id).self.gun.spare], [R.magazine, 0]);
});

test('with no server, the rounds are topped up once a day', () => {
  const w = town(['Dayo Daily']);
  const [x, z] = range(w);
  w.place(w.p, x, z, Math.PI / 2);
  ok(w.send(w.id, { type: 'gun.draw' }));
  for (let k = 0; k < 5; k += 1) { ok(shoot(w, w.p, level(Math.PI / 2))); ready(w); }
  ok(w.send(w.id, { type: 'gun.holster' }));
  ok(w.send(w.id, { type: 'gun.draw' }));
  assert.equal(w.g.view(w.id).self.gun.mag, 25, 'the same day: no more');
  w.g.advance(24 * 3600);
  ok(w.send(w.id, { type: 'gun.draw' }));
  assert.deepEqual([w.g.view(w.id).self.gun.mag, w.g.view(w.id).self.gun.spare], [30, 120], 'the next day: full');
});

test('a gun is not used from a vehicle, in the water, or in the hands of the police; and it is put away for them', () => {
  const w = town(['Sola Rules']);
  const p = w.p;
  ok(w.send(w.id, { type: 'gun.draw' }));
  p.swimming = { since: w.g.state.real };
  run(w.host, 0.2);
  assert.equal(w.g.view(w.id).self.gun.out, false, 'put away in the water');
  refused(w.send(w.id, { type: 'gun.draw' }), 'SWIMMING');
  p.swimming = null;
  p.custody = 'AR-1';
  refused(w.send(w.id, { type: 'gun.draw' }), 'IN_CUSTODY');
  p.custody = null;
  ok(w.send(w.id, { type: 'gun.draw' }));
});

test('a body is an upright post: a round meets it where it crosses, and goes over or under one it does not', () => {
  // from 10 m off, level at chest height: met at the near side of the post
  const k = rayPost([0, 1.3, 0], [1, 0, 0], 50, 10, 0, 0, 1.78, 0.32);
  assert.ok(Math.abs(k - 9.68) < 1e-6);
  // over its head
  assert.equal(rayPost([0, 2.5, 0], [1, 0, 0], 50, 10, 0, 0, 1.78, 0.32), Infinity);
  // to one side
  assert.equal(rayPost([0, 1.3, 0.5], [1, 0, 0], 50, 10, 0, 0, 1.78, 0.32), Infinity);
  // short of it
  assert.equal(rayPost([0, 1.3, 0], [1, 0, 0], 8, 10, 0, 0, 1.78, 0.32), Infinity);
});
