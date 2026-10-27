// The owner's townspeople and what they do when trouble comes (27 October 2026, his brief):
//   "When a player attacks an NPC for the first time, the NPC usually tries to get away. If the player attacks the
//   same NPC again, it fights back. After a few seconds of fighting, NPCs give up and walk away. Make it a little
//   different each time."
//   The 20-life rule for them as for a player: at 20 nobody can hurt them (a round goes past), they limp slowly, and
//   their life comes back slowly to 100.
//   "If an NPC is shot, it falls using the falling animation, gets up again, and then limps or runs away."
//   They run when they are frightened.
//
//   node --test test/townspeople.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { town, until, run, ok, refused, quietSpot, whereIs, beside } from './world.mjs';
import { HEALTH, COMBAT } from '../src/sim/conflict.js';
import { PACE } from '../src/sim/actors.js';
import { GUNS } from '../src/sim/guns.js';
import { POSE } from '../src/sim/population.js';
import { NPC_FIGURES } from '../src/sim/npc-figures.js';
import { zoneGroundY, zoneWalkable } from '../src/sim/zone.js';

const R = GUNS.rifle;
// one of his townspeople out in the town, put where a test wants them, standing
function townsperson(w, pick = () => true, at = null) {
  const q = w.pop.people.find((q) => q.job !== 'police' && NPC_FIGURES[q.look.figure] && whereIs(w, q.index).pose !== POSE.hidden && pick(q));
  assert.ok(q, 'one of the townspeople is out in the town');
  const [x, z] = at || quietSpot(w);
  w.I.actors.take(q.index, w.g.state.t);
  const m = w.I.actors.get(q.index); m.x = x; m.z = z; m.h = 0;
  w.I.actors.hold(q.index, 'Standing about', POSE.stand, w.g.state.real + 900);
  return { i: q.index, x, z, h: 0, who: q, nerve: w.I.conflict.nerve(q.index) };
}
const mood = (w, i) => (w.I.conflict.record(i) || { mood: 'calm' }).mood;
const health = (w, i) => (w.I.conflict.record(i) || { health: HEALTH.max }).health;
// strikes them once, standing beside them wherever they are now
function strike(w, a, move = 'punch') {
  const at = whereIs(w, a.i);
  beside(w, w.p, { ...a, x: at.x, z: at.z });
  if (!w.p.fight) ok(w.send(w.id, { type: 'combat.engage', target: { kind: 'npc', id: a.i } }));
  w.p.energy = 80;
  return w.send(w.id, { type: 'combat.act', move });
}

test('the townspeople: struck once, most run; struck again, they fight back; after a few seconds they give up and go, never quite the same way twice', () => {
  const w = town();
  const runners = w.pop.people.filter((q) => q.job !== 'police' && w.I.conflict.nerve(q.index) < 0.75);
  assert.ok(runners.length >= 20, `most of the twenty-five would rather run (${runners.length})`);
  const a = townsperson(w, (q) => w.I.conflict.nerve(q.index) < 0.75);
  const first = ok(strike(w, a));
  assert.equal(first.reaction, 'fled', 'the first time, they get away');
  run(w.host, 0.6);
  const second = ok(strike(w, a));
  assert.equal(second.reaction, 'fighting', 'the second time, they fight back');
  ok(w.send(w.id, { type: 'combat.disengage' }));
  // the player stands there and takes it; a few seconds of it, and they have had enough
  w.p.health = HEALTH.max;
  const lasted = until(w, () => mood(w, a.i) !== 'fighting', COMBAT.fightFor[1] + 2, () => { w.p.health = Math.max(w.p.health, 60); });
  assert.ok(lasted >= COMBAT.fightFor[0] - 0.6 && lasted <= COMBAT.fightFor[1] + 0.3, `they fought for ${lasted.toFixed(1)} s`);
  assert.equal(mood(w, a.i), 'done');
  const m = w.I.actors.get(a.i);
  assert.ok(!m || ['Walking away', 'Hurrying away', 'Going back'].includes(m.act), `and they go: ${m && m.act}`);
  // attacked again, they fight back again, for their own few seconds this time
  run(w.host, 1);
  const third = ok(strike(w, a));
  assert.equal(third.reaction, 'fighting');
  ok(w.send(w.id, { type: 'combat.disengage' }));
  const again = until(w, () => mood(w, a.i) !== 'fighting', COMBAT.fightFor[1] + 2, () => { w.p.health = Math.max(w.p.health, 60); });
  assert.ok(Math.abs(again - lasted) > 0.15, `not the same fight twice (${lasted.toFixed(1)} s, then ${again.toFixed(1)} s)`);
  // and in the end everyone is back in their day
  ok(w.send(w.id, { type: 'combat.disengage' }));
  w.place(w.p, w.p.x + 40, w.p.z);
  until(w, () => !w.I.actors.has(a.i), 400);
});

test('the 20-life rule for the townspeople: at 20 they cannot be struck or shot, they limp off slowly, sit a while, and mend slowly to 100', () => {
  const w = town();
  const a = townsperson(w, (q) => w.I.conflict.nerve(q.index) < 0.75);
  ok(strike(w, a));
  run(w.host, 0.6);
  ok(strike(w, a));
  // already hurt from something before: a few heavy blows bring them to 20, and no lower
  w.I.conflict.record(a.i).health = 34;
  let down = false;
  for (let k = 0; k < 30 && !down; k += 1) {
    run(w.host, 1.2);
    w.p.health = HEALTH.max;
    const r = strike(w, a, 'heavy');
    if (r.ok && r.reaction === 'down') down = true;
    if (!r.ok && r.code === 'TARGET_DOWN') down = true;
  }
  assert.ok(down, 'brought to 20');
  assert.equal(health(w, a.i), HEALTH.critical, 'never below 20');
  assert.equal(mood(w, a.i), 'down');
  if (w.p.fight) { w.p.energy = 80; run(w.host, 1.2); refused(w.send(w.id, { type: 'combat.act', move: 'punch' }), 'TARGET_DOWN'); ok(w.send(w.id, { type: 'combat.disengage' })); }
  refused(w.send(w.id, { type: 'combat.engage', target: { kind: 'npc', id: a.i } }), 'TARGET_DOWN');
  // shown limping, to anyone near
  const shown = w.g.view(w.id).moods.find((q) => q.i === a.i);
  assert.ok(shown && shown.limp === 1, 'they limp');
  // a round goes past them
  const at = whereIs(w, a.i);
  const look = w.I.guns.look([at.x - 6, zoneGroundY(at.x, at.z) + 1.3, at.z], [1, 0, 0], 20);
  if (look.what === 'person' && look.target.id === a.i) assert.equal(look.target.able, false, 'not to be shot');
  // slowly, away; then sitting down, hurt
  let fastest = 0, last = whereIs(w, a.i);
  const sat = until(w, () => whereIs(w, a.i).pose === POSE.sit, 120, () => { const now = whereIs(w, a.i); fastest = Math.max(fastest, Math.hypot(now.x - last.x, now.z - last.z) / 0.1); last = now; });
  assert.ok(fastest <= PACE.limp + 0.05, `a limp, never faster than ${PACE.limp} m/s (${fastest.toFixed(2)})`);
  assert.ok(sat < 40, `they sit down after limping off (${sat.toFixed(0)} s)`);
  assert.equal(health(w, a.i), HEALTH.critical, 'no better yet, sitting there');
  // then back to their day, and their life comes back, a point at a time, to 100
  until(w, () => mood(w, a.i) === 'mending', HEALTH.hurtFor[1] + 5);
  const seen = [];
  until(w, () => health(w, a.i) >= HEALTH.max, HEALTH.mend * 80 + 60, () => { const h = health(w, a.i); if (seen[seen.length - 1] !== h) seen.push(h); });
  assert.ok(seen.length > 40 && seen.every((h, k) => k === 0 || h - seen[k - 1] === 1), 'slowly: a point at a time');
});

test('one of the townspeople shot: they fall, lie a moment, get up and run from whoever shot them, bleeding; it is an offence', () => {
  const w = town(['Shooter Test']);
  const [x, z] = quietSpot(w);
  // open ground: the townsperson eight metres east of the player
  let spot = null;
  for (let dx = -60; dx <= 60 && !spot; dx += 2) for (let dz = -60; dz <= 60 && !spot; dz += 2) {
    const ax = x + dx, az = z + dz;
    if ([0, 2, 4, 6, 8, 10].every((k) => zoneWalkable(ax + k, az))) spot = [ax, az];
  }
  assert.ok(spot, 'open ground');
  const a = townsperson(w, () => true, [spot[0] + 8, spot[1]]);
  w.place(w.p, spot[0], spot[1], Math.PI / 2);
  ok(w.send(w.id, { type: 'gun.draw' }));
  const o = [w.p.x + 0.6, zoneGroundY(w.p.x, w.p.z) + 1.4, w.p.z];
  const to = [a.x - o[0], zoneGroundY(a.x, a.z) + 1.2 - o[1], a.z - o[2]];
  const len = Math.hypot(...to);
  const shot = ok(w.send(w.id, { type: 'gun.fire', shots: [{ o, d: to.map((v) => v / len) }] })).shots[0];
  assert.equal(shot.what, 'person');
  assert.equal(shot.target.kind, 'npc');
  assert.equal(shot.target.id, a.i);
  assert.equal(shot.target.health, HEALTH.max - 1, 'a round takes a point');
  // down, where the drawing shows them fallen, and blood under them
  assert.equal(whereIs(w, a.i).pose, POSE.lie);
  const v = w.g.view(w.id);
  assert.ok(v.fallen.includes(a.i), 'drawn fallen');
  assert.ok(v.blood.some((b) => b.key === `n:${a.i}`), 'and bleeding');
  assert.ok(!w.I.guns.look(o, to.map((q) => q / len), 20).target || w.I.guns.look(o, to.map((q) => q / len), 20).target.id !== a.i, 'someone lying is not in the way of a round');
  // up again, and away from the shooter at a run
  const upIn = until(w, () => whereIs(w, a.i).pose !== POSE.lie, 8);
  assert.ok(upIn >= 2, `on the ground ${upIn.toFixed(1)} s`);
  let farthest = 0;
  for (let t = 0; t < 8; t += 0.1) { w.host.tick(0.1); const at = whereIs(w, a.i); farthest = Math.max(farthest, Math.hypot(at.x - w.p.x, at.z - w.p.z)); }
  assert.ok(farthest > 20, `they ran (${farthest.toFixed(0)} m from the shooter)`);
  const crime = Object.values(w.g.state.justice.crimes).find((c) => c.victim.kind === 'npc' && c.victim.id === a.i);
  assert.ok(crime && crime.type === 'shooting', 'shooting someone is an offence');
});

test('gunfire frightens the townspeople near it: they run from it, or cower', () => {
  const w = town(['Shooter Test']);
  // someone standing about in their own day, and the player a few metres from them
  let about = [];
  for (let k = 0; k < 24 && !about.length; k += 1) {
    about = w.pop.people.filter((q) => q.job !== 'police').map((q) => ({ i: q.index, ...whereIs(w, q.index) })).filter((q) => q.pose === POSE.stand && !q.moving && !w.I.actors.has(q.i) && zoneWalkable(q.x - 4, q.z));
    if (!about.length) run(w.host, 20);
  }
  assert.ok(about.length, 'someone is standing about');
  const b = about[0];
  w.place(w.p, b.x - 4, b.z, Math.PI / 2);
  ok(w.send(w.id, { type: 'gun.draw' }));
  // a round into the air
  const o = [w.p.x, zoneGroundY(w.p.x, w.p.z) + 1.4, w.p.z - 0.6];
  ok(w.send(w.id, { type: 'gun.fire', shots: [{ o, d: [0, 0.6, -0.8] }] }));
  const m = w.I.actors.get(b.i);
  assert.ok(m && ['Running from the gunfire', 'Cowering'].includes(m.act), `frightened: ${m && m.act}`);
  // and later they go back to their day
  w.place(w.p, w.p.x + 60, w.p.z);
  until(w, () => !w.I.actors.has(b.i), 400);
});
