// Tests of health, fighting, offences, witnesses, the police, arrest, fines,
// stolen money, and players who serve as police.
//
//   node --test test/justice.test.mjs
//
// Everything here is done the way a client does it: by sending intents. Where
// a test needs a player somewhere, it puts them there, and where it needs one
// already hurt it has the simulation hurt them; it never writes a balance, an
// arrest or a role by hand.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { town as makeTown, standing, beside, whereIs, post, until, assault, run, ok, refused, farFromPolice, lead, quietSpot } from './world.mjs';
import { HEALTH, MOVES, COMBAT } from '../src/sim/conflict.js';
import { LAW, STARS } from '../src/sim/justice.js';
import { SPEED } from '../src/sim/sim.js';
import { zoneService } from '../src/sim/zone.js';
import { fund, FORMER_TOWN } from './helpers.mjs';
import { createLedger, LedgerError, fineShares, TR } from '../src/sim/ledger.js';
import { createHost } from '../src/sim/host.js';

// The town as it was until 22 October 2026, with its thousand townspeople (FORMER_TOWN): what townspeople do when they
// are struck, robbed or see something is kept ready for the owner's own models of them, and judged on it. Only the
// police are witnesses now, in that town as in this one. (test/police.test.mjs: the town's own police.)
const town = (names, options = {}) => makeTown(names, { people: FORMER_TOWN, ...options });
const MARKET = [8, 58];
const clean = (w) => assert.deepEqual(w.host.auditor.reconcile(), [], 'the ledger balances');
const government = (w) => w.host.auditor.balance(w.I.economy.accounts.government(post().jurisdiction));
const pool = (w) => w.host.auditor.balance(w.I.okada.pool);
// (not one an officer is walking past: a test of a blow is not a test of how fast the police come)
const timid = (w) => farFromPolice(w, standing(w, ...MARKET, { range: 200, not: ['police'] }), 35).find((a) => a.nerve < 0.4 && a.who.age < 55);
const bold = (w) => farFromPolice(w, standing(w, ...MARKET, { range: 500, not: ['police'] })).find((a) => a.nerve >= 0.75 && a.nerve < 0.95);
const txnsOf = (w, kind) => w.host.auditor.transactions().filter((t) => t.kind === kind);

test('health: everyone starts whole, and only the simulation says how hurt a player is', () => {
  const w = town();
  const self = w.g.view(w.id).self;
  assert.equal(self.health, HEALTH.max);
  assert.equal(self.critical, false);
  assert.equal(self.fight, null);
  // there is no intent that sets health, and one that looks like it is not known
  refused(w.send(w.id, { type: 'health.set', value: 100 }), 'UNKNOWN_INTENT');
  refused(w.send(w.id, { type: 'combat.act', move: 'punch' }), 'NOT_FIGHTING');
});

test('fighting: who may be faced, from how far, and never a child', () => {
  const w = town();
  const a = timid(w);
  w.place(w.p, a.x + 12, a.z);
  refused(w.send(w.id, { type: 'combat.engage', target: { kind: 'npc', id: a.i } }), 'TOO_FAR');
  refused(w.send(w.id, { type: 'combat.engage', target: { kind: 'npc', id: 99999 } }), 'NO_TARGET');
  refused(w.send(w.id, { type: 'combat.engage', target: { kind: 'tree', id: 1 } }), 'NO_TARGET');
  const child = standing(w, ...MARKET, { range: 400, adult: false }).find((c) => c.who.age < COMBAT.minAge);
  assert.ok(child, 'there is a child out somewhere in town at ten in the morning');
  beside(w, w.p, child);
  refused(w.send(w.id, { type: 'combat.engage', target: { kind: 'npc', id: child.i } }), 'A_CHILD');
  refused(w.send(w.id, { type: 'crime.steal', target: { kind: 'npc', id: child.i } }), 'A_CHILD');
  beside(w, w.p, a);
  const r = ok(w.send(w.id, { type: 'combat.engage', target: { kind: 'npc', id: a.i } }));
  assert.equal(r.target.name, a.who.short);
  assert.equal(w.g.view(w.id).self.fight.target.id, a.i);
  // squaring up is not an offence, and the other is not made to fight
  assert.equal(w.g.audit().justice.crimes, 0);
  assert.ok(w.g.view(w.id).speech.some((s) => s.who === `n:${a.i}`), 'they say something to calm things down');
  ok(w.send(w.id, { type: 'combat.disengage' }));
  assert.equal(w.g.view(w.id).self.fight, null);
});

test('a blow: reach, readiness and energy are the simulation\'s to judge', () => {
  const w = town();
  const a = timid(w);
  beside(w, w.p, a);
  ok(w.send(w.id, { type: 'combat.engage', target: { kind: 'npc', id: a.i } }));
  const energy = w.p.energy;
  // a client that says it punched from across the road is told it missed, and pays for the swing
  w.place(w.p, a.x + 5, a.z);
  const miss = ok(w.send(w.id, { type: 'combat.act', move: 'punch' }));
  assert.equal(miss.hit, false);
  assert.equal(miss.damage, 0);
  assert.equal(w.p.energy, energy - MOVES.punch.energy);
  assert.equal(w.g.audit().justice.crimes, 0, 'a miss is not an assault');
  // and cannot swing again at once
  refused(w.send(w.id, { type: 'combat.act', move: 'punch' }), 'NOT_READY');
  refused(w.send(w.id, { type: 'combat.act', move: 'headbutt' }), 'NO_MOVE');
  run(w.host, 0.6);
  beside(w, w.p, a);
  const hit = ok(w.send(w.id, { type: 'combat.act', move: 'punch' }));
  assert.equal(hit.hit, true);
  assert.equal(hit.damage, MOVES.punch.damage);
  assert.equal(hit.targetHealth, HEALTH.max - MOVES.punch.damage);
  // a different move straight after is still held back by the recovery from the first
  refused(w.send(w.id, { type: 'combat.act', move: 'kick' }), 'NOT_READY');
  // too tired to swing
  w.p.energy = 0;
  run(w.host, 1.5);
  refused(w.send(w.id, { type: 'combat.act', move: 'heavy' }), 'TIRED');
});

test('townspeople would rather not fight: struck once, most plead and run', () => {
  const w = town();
  const a = timid(w);
  const before = whereIs(w, a.i);
  const hit = assault(w, w.p, a);
  assert.equal(hit.reaction, 'fled');
  assert.ok(w.g.view(w.id).speech.some((s) => s.who === `n:${a.i}` && s.kind === 'shout'));
  let last = before, farthest = 0;
  for (let t = 0; t < 8; t += 0.1) {
    w.host.tick(0.1);
    const now = whereIs(w, a.i);
    assert.ok(Math.hypot(now.x - last.x, now.z - last.z) < 0.9, 'they run; they do not jump');
    farthest = Math.max(farthest, Math.hypot(now.x - before.x, now.z - before.z));
    last = now;
  }
  assert.ok(farthest > 10, `they got ${farthest.toFixed(1)} m away in eight seconds`);
  assert.equal(w.p.health, HEALTH.max, 'and never raised a hand');
  // and after a while they are back in their day
  until(w, () => !w.I.actors.has(a.i), 400);
});

test('struck again, someone with the nerve for it defends themselves, and stops when the attacker is badly hurt', () => {
  const w = town();
  const b = bold(w);
  assert.ok(b, 'someone in town will stand their ground');
  beside(w, w.p, b);
  ok(w.send(w.id, { type: 'combat.engage', target: { kind: 'npc', id: b.i } }));
  const first = ok(w.send(w.id, { type: 'combat.act', move: 'punch' }));
  assert.equal(first.reaction, 'warned', 'the first time they warn');
  assert.equal(w.p.health, HEALTH.max);
  run(w.host, 0.6);
  const second = ok(w.send(w.id, { type: 'combat.act', move: 'punch' }));
  assert.equal(second.reaction, 'fighting');
  // already hurt from something earlier, they stand there and take it
  w.I.conflict.hurt(w.p, 62);
  assert.equal(w.p.health, 38);
  const seen = [];
  until(w, () => w.p.health <= HEALTH.critical, 30, () => seen.push(w.p.health));
  assert.ok(seen.some((h) => h < 38 && h > HEALTH.critical), 'health goes down a blow at a time');
  const self = w.g.view(w.id).self;
  assert.equal(self.critical, true);
  assert.equal(self.fight, null, 'at a fifth of health, fighting is over at once');
  assert.ok(w.events(w.id).some((e) => e.type === 'critical'));
  refused(w.send(w.id, { type: 'combat.engage', target: { kind: 'npc', id: b.i } }), 'CRITICAL');
  refused(w.send(w.id, { type: 'combat.act', move: 'punch' }), 'NOT_FIGHTING');
  const at = w.p.health;
  run(w.host, 30);
  assert.equal(w.p.health, at, 'nobody strikes someone who is down');
  assert.ok(w.p.health >= HEALTH.floor);
  assert.notEqual(w.I.conflict.record(b.i).mood, 'fighting');
});

test('blocking and stepping aside are judged by the simulation too', () => {
  const w = town();
  const b = bold(w);
  beside(w, w.p, b);
  ok(w.send(w.id, { type: 'combat.engage', target: { kind: 'npc', id: b.i } }));
  ok(w.send(w.id, { type: 'combat.act', move: 'punch' }));
  run(w.host, 0.6);
  ok(w.send(w.id, { type: 'combat.act', move: 'punch' }));
  // block from now on, facing them: every blow that lands is cut
  const losses = [];
  let health = w.p.health;
  for (let t = 0; t < 25 && losses.length < 4; t += 0.1) {
    const m = w.I.actors.get(b.i);
    if (m) w.p.heading = Math.atan2(m.x - w.p.x, m.z - w.p.z);
    w.send(w.id, { type: 'combat.block', on: true });
    w.host.tick(0.1);
    if (w.p.health < health) { losses.push(health - w.p.health); health = w.p.health; }
  }
  assert.ok(losses.length >= 2, 'some blows came');
  for (const lost of losses) assert.ok(lost <= Math.ceil(COMBAT.npcHeavy * (1 - COMBAT.blockCutHeavy)), `a blocked blow took ${lost}`);
  // a step aside moves the player and cannot be done again at once
  const from = { x: w.p.x, z: w.p.z };
  const d = ok(w.send(w.id, { type: 'combat.dodge', dx: 1, dz: 0 }));
  assert.ok(Math.hypot(d.x - from.x, d.z - from.z) <= COMBAT.dodgeStep + 0.01);
  refused(w.send(w.id, { type: 'combat.dodge', dx: 1, dz: 0 }), 'NOT_READY');
});

test('someone who has had enough sits down, and cannot be struck again', () => {
  const w = town();
  const a = farFromPolice(w, standing(w, ...MARKET, { range: 500, not: ['police'] })).find((c) => c.nerve < 0.4 && c.who.age < 55);
  beside(w, w.p, a);
  ok(w.send(w.id, { type: 'combat.engage', target: { kind: 'npc', id: a.i } }));
  ok(w.send(w.id, { type: 'combat.act', move: 'grab' }));          // held, so they cannot run
  let down = false;
  for (let k = 0; k < 40 && !down; k += 1) {
    run(w.host, 1.2);
    const at = whereIs(w, a.i);
    w.place(w.p, at.x + 0.9, at.z);
    w.p.energy = 80;
    const r = w.send(w.id, { type: 'combat.act', move: 'heavy' });
    if (r.ok && r.reaction === 'down') down = true;
    if (!r.ok && r.code === 'TARGET_DOWN') down = true;
  }
  assert.ok(down);
  const rec = w.I.conflict.record(a.i);
  assert.ok(rec.health >= HEALTH.critical, 'nobody is beaten below a fifth');
  assert.equal(rec.mood, 'down');
  refused(w.send(w.id, { type: 'combat.act', move: 'punch' }), 'TARGET_DOWN');
  const crime = Object.values(w.g.state.justice.crimes).find((c) => c.victim.id === a.i);
  assert.equal(crime.type, 'assault_serious', 'and the offence is the graver one');
});

test('an offence is recorded where and when it happened, with who saw it: only the police are witnesses', () => {
  const w = town();
  const a = timid(w);
  const around = standing(w, a.x, a.z, { range: LAW.witness.range, adult: false }).filter((q) => q.i !== a.i);
  assert.ok(around.length > 0, 'there are townspeople about, near enough to see');
  assault(w, w.p, a);
  const crimes = Object.values(w.g.state.justice.crimes);
  assert.equal(crimes.length, 1);
  const c = crimes[0];
  assert.equal(c.culprit, w.id);
  assert.equal(c.type, 'assault');
  assert.deepEqual(c.victim, { kind: 'npc', id: a.i, name: a.who.name });
  assert.ok(Math.hypot(c.x - a.x, c.z - a.z) < 2);
  assert.equal(c.at, Math.round(w.g.state.t));
  assert.equal(c.status, 'open');
  assert.equal(c.arrest, null);
  assert.equal(c.detection, 'identified', 'the person struck knows who did it');
  // (22 October 2026, the owner's word: "remove witness. only police should serve as witness")
  assert.deepEqual(c.witnesses, [], 'the townspeople who saw it are no witnesses; no officer was near');
  // an officer standing near sees the next one
  const b = standing(w, a.x, a.z, { range: 300, not: ['police'] }).find((q) => q.i !== a.i && q.who.age >= 18 && Math.hypot(q.x - a.x, q.z - a.z) > 4);
  const officer = w.pop.people.find((q) => q.job === 'police' && whereIs(w, q.index).pose !== 4);
  w.I.actors.take(officer.index, w.g.state.t);
  const m = w.I.actors.get(officer.index); m.x = b.x + 6; m.z = b.z;
  w.I.actors.hold(officer.index, 'On patrol', 0, w.g.state.real + 600);
  const p2 = w.g.state.players[w.g.join({ name: 'Second Striker', look: {} })];
  assault(w, p2, b);
  const seen = Object.values(w.g.state.justice.crimes).find((x) => x.culprit === p2.id);
  assert.ok(seen.witnesses.length >= 1 && seen.witnesses.every((s) => s.kind === 'npc' && s.police), JSON.stringify(seen.witnesses));
  for (const s of seen.witnesses) { assert.ok(s.metres <= LAW.witness.range); assert.notEqual(s.id, b.i); }
  // more blows in the same fight are the same offence
  const again = Object.values(w.g.state.justice.crimes).length;
  beside(w, w.p, whereIs(w, a.i).x ? { ...whereIs(w, a.i), h: 0 } : a);
  w.send(w.id, { type: 'combat.engage', target: { kind: 'npc', id: a.i } });
  w.send(w.id, { type: 'combat.act', move: 'punch' });
  assert.equal(Object.values(w.g.state.justice.crimes).length, again);
});

test('the police: told within seconds, they come on foot from where they are, challenge, arrest, hold the culprit in handcuffs four seconds and then they are at the Police Post', () => {
  const w = town();
  const a = timid(w);
  assert.equal(w.g.view(w.id).self.law.state, 'normal');
  assault(w, w.p, a);
  const told = until(w, () => w.p.law.state !== 'normal', 12);
  assert.ok(told >= 0.4 && told <= LAW.report[1] + 0.3, `word reached the police in ${told.toFixed(1)} s`);
  assert.ok(['wanted', 'pursuit'].includes(w.p.law.state));
  const officers = () => w.g.view(w.id).officers;
  assert.ok(officers().length >= 1, 'an officer is sent');
  const i = officers()[0].i;
  assert.equal(w.pop.people[i].job, 'police');
  // until the arrest every step of the officer and of the culprit is a step: nobody is moved in a jump. Once
  // taken, the culprit stays in handcuffs where they were caught, and is then at the Police Post.
  let lastOfficer = whereIs(w, i), lastMe = { x: w.p.x, z: w.p.z };
  const states = new Set([w.p.law.state]);
  let cuffedAt = null, cuffedWhere = null, elapsed = 0;
  until(w, () => w.p.law.state === 'custody', 400, () => {
    elapsed += 0.1;
    const o = whereIs(w, i);
    if (w.p.law.state === 'arrested' && cuffedAt === null) { cuffedAt = elapsed; cuffedWhere = { x: w.p.x, z: w.p.z }; }
    if (cuffedAt === null) {
      assert.ok(Math.hypot(o.x - lastOfficer.x, o.z - lastOfficer.z) < 0.9, `the officer moved ${Math.hypot(o.x - lastOfficer.x, o.z - lastOfficer.z).toFixed(2)} m in a tenth of a second`);
      assert.ok(Math.hypot(w.p.x - lastMe.x, w.p.z - lastMe.z) < 1.1, 'the culprit moves by steps');
    } else if (w.p.law.state === 'arrested') assert.ok(Math.hypot(w.p.x - cuffedWhere.x, w.p.z - cuffedWhere.z) < 1.5, 'held where they were caught');
    lastOfficer = o; lastMe = { x: w.p.x, z: w.p.z };
    states.add(w.p.law.state);
  });
  assert.deepEqual([...states].filter((x) => x !== 'wanted'), ['pursuit', 'arrested', 'custody'], 'wanted, then chased, then taken, then held: in that order');
  assert.ok(cuffedAt !== null && elapsed - cuffedAt >= LAW.cuffed - 0.3 && elapsed - cuffedAt <= LAW.cuffed + 0.5, `in handcuffs ${(elapsed - cuffedAt).toFixed(1)} s before the Police Post`);
  assert.ok(Math.hypot(w.p.x - post().x, w.p.z - post().z) < 4, 'and that is where they end up');
  const events = w.events(w.id).filter((e) => e.type === 'police').map((e) => e.title);
  assert.deepEqual(events.filter((e) => e !== 'Wanted' || true), ['Wanted', 'Police', 'Under arrest', 'In custody']);
  const law = w.g.view(w.id).self.law;
  assert.equal(law.arrest.offences.length, 1);
  assert.equal(law.arrest.fine.amount, LAW.offences.assault.fine);
  assert.equal(law.arrest.fine.confirmed, true);
  assert.equal(law.arrest.byConstable, false);
  assert.equal(w.g.state.justice.crimes[Object.keys(w.g.state.justice.crimes)[0]].arrest, law.arrest.id);
  // the officer goes back to the beat
  until(w, () => officers().length === 0, 60);
});

test('a fine paid to an officer of the regular police goes to the government, once', () => {
  const w = town();
  assault(w, w.p, timid(w));
  until(w, () => w.p.law.state === 'custody', 400);
  const arrest = w.g.view(w.id).self.law.arrest;
  const mine = w.balance(w.p), gov = government(w), count = w.host.auditor.transactionCount();
  const fine = LAW.offences.assault.fine;
  assert.equal(fine, 10 * TR, 'the town\'s police charge 10 TR');
  assert.equal(arrest.fine.amount, fine);
  const paid = ok(w.send(w.id, { type: 'custody.pay' }));
  assert.equal(paid.amount, fine);
  assert.equal(paid.replayed, false);
  assert.equal(paid.toGovernment, fine);
  assert.equal(paid.toOfficer, 0);
  assert.equal(w.balance(w.p), mine - fine);
  assert.equal(government(w), gov + fine);
  assert.equal(w.host.auditor.transactionCount(), count + 1);
  const txn = w.host.auditor.transactions().find((t) => t.id === paid.txn);
  assert.equal(txn.kind, 'fine');
  assert.equal(txn.key, `fine:${arrest.id}`);
  assert.equal(txn.meta.arrest, arrest.id);
  assert.equal(txn.meta.culprit, w.id);
  assert.ok(txn.meta.crimes.length > 0 && txn.at > 0);
  assert.equal(w.p.law.state, 'released');
  assert.equal(w.p.custody, null);
  // asked again (a second tap, a retry after the connection dropped): the same receipt, and no second charge
  const again = ok(w.send(w.id, { type: 'custody.pay', arrestId: arrest.id }));
  assert.equal(again.replayed, true);
  assert.equal(again.txn, paid.txn);
  assert.equal(w.balance(w.p), mine - fine);
  assert.equal(w.host.auditor.transactionCount(), count + 1);
  // free to walk again
  ok(w.send(w.id, { type: 'move', x: w.p.x, z: w.p.z - 0.2, heading: 0 }));
  run(w.host, LAW.released + 2);
  assert.equal(w.p.law.state, 'normal');
  clean(w);
});

test('held by the police: no walking off, no fighting, no shopping; time served ends it', () => {
  const w = town();
  assault(w, w.p, timid(w));
  until(w, () => w.p.law.state === 'arrested', 60);
  refused(w.send(w.id, { type: 'move', x: w.p.x + 0.1, z: w.p.z, heading: 0 }), 'IN_CUSTODY');
  refused(w.send(w.id, { type: 'combat.engage', target: { kind: 'npc', id: 3 } }), 'IN_CUSTODY');
  refused(w.send(w.id, { type: 'hijack.start', okada: 0 }), 'IN_CUSTODY');
  refused(w.send(w.id, { type: 'crime.steal', target: { kind: 'npc', id: 3 } }), 'IN_CUSTODY');
  refused(w.send(w.id, { type: 'eat' }), 'IN_CUSTODY');
  refused(w.send(w.id, { type: 'custody.pay' }), 'NOT_IN_CUSTODY');        // not until brought in
  ok(w.send(w.id, { type: 'police.status' }));
  ok(w.send(w.id, { type: 'map.route', x: post().x, z: post().z }));
  until(w, () => w.p.law.state === 'custody', 400);
  const mine = w.balance(w.p);
  const waited = ok(w.send(w.id, { type: 'custody.wait' }));
  assert.ok(waited.hours >= LAW.offences.assault.hours - 0.05);
  assert.equal(w.p.law.state, 'released');
  assert.equal(w.balance(w.p), mine, 'time served: no fine taken');
  assert.equal(w.g.view(w.id).self.law.arrest, null);
  assert.equal(w.g.intent(w.id, { type: 'police.status' }).record.arrests[0].payment.status, 'served');
  // an arrest is made once
  assert.equal(w.g.audit().justice.arrests, 1);
  clean(w);
});

test('running from the police is an offence of its own; out of sight long enough, the chase is broken off', () => {
  const w = town();
  assault(w, w.p, timid(w));
  until(w, () => w.p.law.state === 'pursuit', 60);
  // run north up Market Road, faster than an officer, as a client would: small steps the simulation checks
  const flee = () => { const nz = w.p.z - SPEED.run * 0.1; const r = w.send(w.id, { type: 'move', x: w.p.x, z: nz, heading: Math.PI, run: true }); if (!r.ok) w.send(w.id, { type: 'move', x: w.p.x + 0.4, z: w.p.z, heading: 0, run: true }); };
  w.place(w.p, 0, w.p.z);
  until(w, () => Object.values(w.g.state.justice.crimes).some((c) => c.type === 'resisting'), 30, flee);
  assert.equal(w.p.law.state, 'pursuit');
  // now somewhere they cannot be seen, far off
  w.place(w.p, 150, -200);
  until(w, () => w.p.law.state === 'wanted', LAW.lost + 20);
  // out of every officer's sight, with nobody on the way any more: the stars fade, one at a time (two for running on,
  // thirty seconds; one, twenty more), and they are no longer looked for; the offences stay on the books, unsolved
  // (30 October 2026, the stars: until then a culprit stayed wanted half a day)
  const seen = new Set();
  until(w, () => w.p.law.state === 'normal', 400, () => { w.place(w.p, 150, -200); seen.add(w.g.view(w.id).self.law.stars); });
  assert.ok(seen.has(2) && seen.has(1), `the stars went one at a time: ${[...seen]}`);
  assert.ok(Object.values(w.g.state.justice.crimes).every((c) => c.status === 'lapsed'));
  assert.equal(w.g.view(w.id).self.law.stars, 0);
});

test('the stars (30 October 2026, the owner\'s brief): one for a fight, two for running on after being told to stop; never less while an officer has them in sight; at 20 life every chase stops and the stars go', () => {
  const w = town();
  assault(w, w.p, timid(w));
  until(w, () => w.p.law.state === 'wanted' || w.p.law.state === 'pursuit', 60);
  assert.equal(w.g.view(w.id).self.law.stars, STARS.of.assault);
  assert.equal(STARS.of.assault, 1);
  // the officer comes; standing in her sight, the star stays however long it is
  until(w, () => w.p.law.state === 'pursuit', 120);
  const officer = Object.values(w.g.state.justice.officers).find((o) => o.suspect === w.id);
  assert.ok(officer, 'an officer is after them');
  // (at one star she jogs: STARS)
  assert.equal(w.I.actors.get(officer.i).speed < 4, true, `at one star the officer jogs (${w.I.actors.get(officer.i).speed} m/s)`);
  // running on after being told to stop: two stars
  const flee = () => { const nz = w.p.z - SPEED.run * 0.1; const r = w.send(w.id, { type: 'move', x: w.p.x, z: nz, heading: Math.PI, run: true }); if (!r.ok) w.send(w.id, { type: 'move', x: w.p.x + 0.4, z: w.p.z, heading: 0, run: true }); };
  until(w, () => Object.values(w.g.state.justice.crimes).some((c) => c.type === 'resisting'), 40, flee);
  until(w, () => w.g.view(w.id).self.law.stars === 2, 20);
  assert.equal(w.g.view(w.id).self.law.stars, STARS.of.resisting);
  // brought down to 20 (by whatever): the chase is over at once, and the stars gone
  w.I.conflict.injure(w.p, w.p.health - HEALTH.critical);
  run(w.host, 0.5);
  assert.equal(w.p.law.state, 'normal');
  assert.equal(w.g.view(w.id).self.law.stars, 0);
  assert.equal(Object.values(w.g.state.justice.officers).filter((o) => o.suspect === w.id).length, 0, 'every officer after them has gone back');
  assert.ok(w.events(w.id).some((e) => e.type === 'police' && /badly hurt/.test(e.text)));
});

// A pocket picked in the market without its owner feeling it, at the first try: a try that is felt makes the culprit
// wanted for it at once, and only the police are witnesses now (22 October 2026), so a pocket picked after one that
// was felt would not be known before the arrest. Each try is in a town of its own, with its own throw of the dice.
function pickPocket(options = {}) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const w = town(['Emeka Test'], { ...options, seed: 20261006 + attempt });
    const before = pool(w), mine = w.balance(w.p);
    const a = farFromPolice(w, standing(w, ...MARKET, { range: 120, not: ['police'] }), 35)[attempt % 4];
    beside(w, w.p, a, { behind: true, metres: 0.9 });
    const r = ok(w.send(w.id, { type: 'crime.steal', target: { kind: 'npc', id: a.i } }));
    refused(w.send(w.id, { type: 'crime.steal', target: { kind: 'npc', id: a.i } }), 'NOTHING_LEFT');
    if (r.taken > 0) return { w, got: { ...r, a }, before, mine };
  }
  return { w: null, got: null };
}

test('stolen money: taken by a ledger transaction, and taken back and returned on arrest, to the last unit', () => {
  const { w, got, before, mine } = pickPocket();
  assert.ok(got, 'a pocket was picked');
  assert.ok(got.taken >= LAW.steal.npc[0] && got.taken <= LAW.steal.npc[1]);
  assert.equal(w.balance(w.p), mine + got.taken);
  assert.equal(pool(w), before - got.taken, 'it came out of the households\' money, not out of nowhere');
  const theft = txnsOf(w, 'theft');
  assert.equal(theft.length, 1);
  assert.equal(theft[0].key, `theft:${got.crime}`);
  assert.equal(theft[0].meta.crime, got.crime);
  const crime = w.g.state.justice.crimes[got.crime];
  assert.equal(crime.amount, got.taken);
  assert.equal(crime.victim.id, got.a.i);
  // however it comes out, the culprit ends up arrested (seen, found out by the officer who looks into it, or giving themselves up)
  until(w, () => w.p.law.state !== 'normal' || crime.detection !== 'undetected', LAW.discover[1] + 10);
  if (w.p.law.state === 'normal' || w.p.law.state === 'suspicious') { w.place(w.p, crime.x + 1, crime.z + 1); until(w, () => ['wanted', 'pursuit', 'arrested'].includes(w.p.law.state), 200); }
  until(w, () => w.p.law.state === 'custody', 500);
  const arrest = w.g.view(w.id).self.law.arrest;
  const back = arrest.restitution.find((r) => r.kind === 'returned');
  assert.equal(back.paid, got.taken);
  assert.equal(back.due, got.taken);
  assert.equal(pool(w), before, 'the households have every unit back');
  assert.equal(w.balance(w.p), mine, 'and the culprit is no richer');
  const given = txnsOf(w, 'restitution');
  assert.equal(given.length, 1);
  assert.equal(given[0].key, `restitution:${got.crime}:${arrest.id}`);
  // arresting twice does nothing twice
  const same = w.I.justice.arrest(w.p, { kind: 'npc', id: 0, name: 'x' });
  assert.equal(same.id, arrest.id);
  assert.equal(txnsOf(w, 'restitution').length, 1);
  assert.equal(pool(w), before);
  assert.equal(w.g.view(w.id).self.law.owed, 0);
  clean(w);
});

test('stolen money that has been spent: only what the culprit has is taken, the rest is owed, and nothing is made from nothing', () => {
  const { w, got, before, mine } = pickPocket({ broke: true });       // the arrival money left with family
  assert.ok(got);
  assert.equal(mine, 0);
  // spend most of it: lunch
  const kitchen = zoneService('kitchen');
  w.place(w.p, kitchen.x, kitchen.z + 1);
  let spent = 0;
  if (w.g.view(w.id).services.kitchen.open && got.taken >= 250 && w.p.law.state === 'normal') { ok(w.send(w.id, { type: 'eat' })); spent = 250; }
  const has = w.balance(w.p);
  assert.equal(has, got.taken - spent);
  const crime = w.g.state.justice.crimes[got.crime];
  if (!['wanted', 'pursuit'].includes(w.p.law.state)) { w.place(w.p, crime.x + 1, crime.z + 1); until(w, () => ['wanted', 'pursuit', 'arrested', 'custody'].includes(w.p.law.state), LAW.discover[1] + 200); }
  until(w, () => w.p.law.state === 'custody', 500);
  const arrest = w.g.view(w.id).self.law.arrest;
  const back = arrest.restitution[0];
  assert.equal(back.paid, has, 'all they had, and no more');
  assert.equal(w.balance(w.p), 0);
  assert.equal(pool(w), before - spent, 'the households are short only by what was spent');
  assert.equal(w.g.view(w.id).self.law.owed, spent);
  // cannot pay the fine: sits it out
  refused(w.send(w.id, { type: 'custody.pay' }), 'NL001');
  assert.equal(w.p.law.state, 'custody');
  ok(w.send(w.id, { type: 'custody.wait' }));
  if (spent) {
    refused(w.send(w.id, { type: 'police.settle' }), 'CANNOT_PAY');
    fund(w.host, w.id);
    const settled = ok(w.send(w.id, { type: 'police.settle' }));
    assert.equal(settled.paid, spent);
    assert.equal(settled.owed, 0);
    assert.equal(pool(w), before);
    refused(w.send(w.id, { type: 'police.settle' }), 'NOTHING_OWED');
  }
  clean(w);
});

test('player against player: nobody is made to fight, a player can be hurt only so far, and the one who started it is the offender', () => {
  const w = town(['Ada Attacker', 'Bayo Bystander', 'Chidi Watching']);
  const [a, b, c] = w.players;
  const [qx, qz] = quietSpot(w);
  w.place(a, qx, qz); w.place(b, qx + 0.9, qz, -Math.PI / 2); w.place(c, qx + 6, qz + 2);
  ok(w.send(a.id, { type: 'combat.engage', target: { kind: 'player', id: b.id } }));
  assert.equal(b.fight, null, 'being squared up to does not put anyone in a fight');
  assert.ok(w.events(b.id).some((e) => /squaring up/.test(e.text || '')));
  assert.equal(w.g.view(c.id).self.fight, null);
  const hit = ok(w.send(a.id, { type: 'combat.act', move: 'punch' }));
  assert.equal(hit.hit, true);
  assert.equal(b.health, HEALTH.max - MOVES.punch.damage);
  assert.equal(b.fight, null, 'still not in a fight unless they choose it');
  assert.ok(w.events(b.id).some((e) => e.type === 'struck' && e.damage === MOVES.punch.damage));
  const crime = Object.values(w.g.state.justice.crimes)[0];
  assert.equal(crime.culprit, a.id);
  assert.deepEqual(crime.victim, { kind: 'player', id: b.id, name: b.name });
  // (another player standing by is no witness: only the police are, 22 October 2026; the one struck knows who did it)
  assert.ok(!crime.witnesses.some((s) => s.kind === 'player'), 'the third player is no witness');
  assert.ok(!w.events(c.id).some((e) => e.type === 'witness'));
  assert.equal(crime.detection, 'identified');
  assert.equal(c.health, HEALTH.max);
  // the one attacked may fight back, and commits no offence by it
  ok(w.send(b.id, { type: 'combat.engage', target: { kind: 'player', id: a.id } }));
  run(w.host, 0.5);
  const back = ok(w.send(b.id, { type: 'combat.act', move: 'kick' }));
  assert.equal(back.hit, true);
  assert.equal(a.health, HEALTH.max - MOVES.kick.damage);
  assert.equal(Object.values(w.g.state.justice.crimes).filter((x) => x.culprit === b.id).length, 0);
  // a block from the front takes most of a blow
  w.place(a, qx, qz, Math.PI / 2); w.place(b, qx + 0.9, qz, -Math.PI / 2);
  ok(w.send(b.id, { type: 'combat.block', on: true }));
  run(w.host, 1.2);
  const blocked = ok(w.send(a.id, { type: 'combat.act', move: 'heavy' }));
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.damage, Math.round(MOVES.heavy.damage * (1 - COMBAT.blockCutHeavy)));
  // beaten down to a fifth, and no further: nobody may strike a player who is that hurt
  ok(w.send(b.id, { type: 'combat.disengage' }));
  let guard = 0;
  while (b.health > HEALTH.critical && guard < 60) { run(w.host, 1.2); a.energy = 80; w.place(a, qx, qz); w.place(b, qx + 0.9, qz); const r = w.send(a.id, { type: 'combat.act', move: 'heavy' }); if (!r.ok && r.code !== 'NOT_READY') break; guard += 1; }
  assert.ok(b.health <= HEALTH.critical && b.health >= HEALTH.floor);
  run(w.host, 1.2);
  refused(w.send(a.id, { type: 'combat.act', move: 'punch' }), 'TARGET_DOWN');
  assert.equal(crime.type, 'assault_serious');
  // the victim is compensated out of the attacker's pocket when the attacker is arrested
  const bBefore = w.balance(b), aBefore = w.balance(a);
  if (!a.custody) ok(w.send(a.id, { type: 'combat.disengage' }));
  until(w, () => a.law.state === 'custody', 600);
  assert.equal(w.balance(b), bBefore + LAW.compensation);
  assert.equal(w.balance(a), aBefore - LAW.compensation);
  assert.equal(b.law.state, 'normal');
  clean(w);
});

test('a player\'s pocket: pocket money only, the victim is told at once, and gets it back', () => {
  const w = town(['Tunde Thief', 'Vera Victim']);
  const [t, v] = w.players;
  const vBefore = w.balance(v), tBefore = w.balance(t);
  let got = null;
  // one try a day against the same person; move the days on until a try comes off
  for (let day = 0; day < 12 && !got; day += 1) {
    w.place(v, 0, 40, 0); w.place(t, 0, 39.1, 0);            // behind them
    const r = w.send(t.id, { type: 'crime.steal', target: { kind: 'player', id: v.id } });
    if (r.ok && r.taken > 0) got = r;
    else { if (t.custody) { until(w, () => t.law.state === 'custody', 600); ok(w.send(t.id, { type: 'custody.pay' })); } else if (t.law.state !== 'normal') { until(w, () => t.law.state === 'custody', 900); ok(w.send(t.id, { type: 'custody.pay' })); } w.g.advance(86400); w.g.state.weather = { kind: 'clear', until: 1e15 }; }
  }
  assert.ok(got, 'a try came off');
  const fines = tBefore - (w.balance(t) - got.taken);
  assert.ok(got.taken <= LAW.steal.player, 'never more than pocket money');
  assert.ok(got.taken <= Math.floor(vBefore * LAW.steal.share));
  assert.equal(w.balance(v), vBefore - got.taken);
  const told = w.events(v.id).find((e) => e.type === 'alert');
  assert.ok(told && told.amount === -got.taken && /gone/.test(told.text), 'the victim is told at once, with the amount');
  refused(w.send(t.id, { type: 'crime.steal', target: { kind: 'player', id: v.id } }), 'NOTHING_LEFT');
  // the victim reports it from their phone; they did not see who, so an officer comes to look, finds the thief standing there, and takes them in
  const seen = w.g.view(v.id).self.law.seen;
  assert.equal(seen.length, 1);
  ok(w.send(v.id, { type: 'police.reportSeen', crimeId: seen[0].id }));
  refused(w.send(t.id, { type: 'police.reportSeen', crimeId: seen[0].id }), 'NOT_A_WITNESS');
  until(w, () => t.law.state === 'custody', 900);
  assert.equal(w.balance(v), vBefore, 'every unit is back with the victim');
  assert.ok(w.events(v.id).some((e) => e.type === 'receipt' && e.amount === got.taken));
  assert.equal(w.balance(t), tBefore - fines);
  clean(w);
});

test('special constables: the badge is given by the simulation, and it carries the power of arrest and nothing else', () => {
  const w = town(['Ngozi Constable', 'Wale Wanted', 'Femi Friend']);
  const [n, x, f] = w.players;
  // nobody is police by saying so
  refused(w.send(n.id, { type: 'police.wanted' }), 'NOT_POLICE');
  refused(w.send(n.id, { type: 'police.arrest', playerId: x.id }), 'NOT_POLICE');
  refused(w.send(n.id, { type: 'police.fine', arrestId: 'AR-000001', amount: 1 }), 'NOT_POLICE');
  assert.equal(w.send(n.id, { type: 'police.enlist', role: 'police', badge: 'X' }).ok, false, 'not from anywhere but the Police Post');
  w.place(n, post().x, post().z - 1);
  const role = ok(w.send(n.id, { type: 'police.enlist' })).role;
  assert.match(role.badge, /^OGB\/SC\/\d{3}$/);
  refused(w.send(n.id, { type: 'police.enlist' }), 'ALREADY');
  assert.equal(w.g.view(n.id).self.law.role.badge, role.badge);
  // someone who is not wanted cannot be arrested
  w.place(x, 0, 40); w.place(n, 0.9, 40);
  refused(w.send(n.id, { type: 'police.arrest', playerId: x.id }), 'NOT_WANTED');
  // Wale strikes someone and is wanted
  assault(w, x, timid(w));
  until(w, () => x.law.state === 'wanted' || x.law.state === 'pursuit', 20);
  const list = ok(w.send(n.id, { type: 'police.wanted' })).wanted;
  assert.equal(list.length, 1);
  assert.equal(list[0].id, x.id);
  assert.deepEqual(list[0].offences, ['Assault']);
  assert.equal(w.g.view(n.id).others[x.id].wanted, true, 'a constable sees who is wanted');
  assert.equal(w.g.view(f.id).others ? (w.g.view(f.id).others[x.id] || {}).wanted || false : false, false, 'nobody else does');
  w.place(n, x.x + 8, x.z);
  refused(w.send(n.id, { type: 'police.arrest', playerId: x.id }), 'TOO_FAR');
  w.place(n, x.x + 1, x.z);
  const arrest = ok(w.send(n.id, { type: 'police.arrest', playerId: x.id })).arrest;
  assert.equal(arrest.byConstable, true);
  assert.equal(arrest.officer, n.name);
  assert.equal(x.law.state, 'arrested');
  refused(w.send(n.id, { type: 'police.arrest', playerId: x.id }), 'ALREADY_ARRESTED');
  assert.equal(w.g.audit().justice.arrests, 1, 'arrested once');
  until(w, () => w.g.view(w.ids[0]).officers.length === 0, 60);            // the regular police stand down
  // the fine: within limits, set once, then fixed
  assert.equal(arrest.fine.confirmed, false);
  assert.deepEqual([arrest.fine.least, arrest.fine.scale, arrest.fine.most, arrest.fine.amount], [5 * TR, 10 * TR, 10 * TR, 10 * TR]);
  refused(w.send(n.id, { type: 'police.fine', arrestId: arrest.id, amount: 5000 }), 'OUT_OF_RANGE');
  refused(w.send(n.id, { type: 'police.fine', arrestId: arrest.id, amount: 21 }), 'OUT_OF_RANGE');
  refused(w.send(n.id, { type: 'police.fine', arrestId: arrest.id, amount: 9 }), 'OUT_OF_RANGE');
  refused(w.send(n.id, { type: 'police.fine', arrestId: arrest.id, amount: 15.5 }), 'OUT_OF_RANGE');
  refused(w.send(f.id, { type: 'police.fine', arrestId: arrest.id, amount: 18 }), 'NOT_POLICE');
  ok(w.send(n.id, { type: 'police.fine', arrestId: arrest.id, amount: 18 }));
  refused(w.send(n.id, { type: 'police.fine', arrestId: arrest.id, amount: 20 }), 'FINE_SET');
  assert.equal(w.g.view(x.id).self.law.arrest.fine.amount, 18);
  // the prisoner walks with the constable, and is booked in at the Police Post
  refused(w.send(n.id, { type: 'police.book', arrestId: arrest.id }), 'TOO_FAR');
  refused(w.send(x.id, { type: 'custody.pay' }), 'NOT_IN_CUSTODY');
  let last = { x: x.x, z: x.z };
  lead(w, n, post().x, post().z - 1.5);
  assert.ok(Math.hypot(x.x - n.x, x.z - n.z) < 2.5, 'the prisoner kept up');
  assert.ok(Math.hypot(x.x - last.x, x.z - last.z) > 20, 'and walked all the way');
  last = null;
  ok(w.send(n.id, { type: 'police.book', arrestId: arrest.id }));
  assert.equal(x.law.state, 'custody');
  // the arresting officer cannot pay it themselves; a constable cannot touch anyone's money any other way
  refused(w.send(n.id, { type: 'bail.pay', arrestId: arrest.id }), 'NOT_YOU');
  // a friend has to be at the Police Post to pay
  w.place(f, 100, 100);
  refused(w.send(f.id, { type: 'bail.pay', arrestId: arrest.id }), 'TOO_FAR');
  // the prisoner pays: one transaction, three entries
  const xB = w.balance(x), nB = w.balance(n), gB = government(w), count = w.host.auditor.transactionCount();
  const paid = ok(w.send(x.id, { type: 'custody.pay' }));
  assert.equal(paid.amount, 18);
  assert.equal(paid.toGovernment, 1, 'one in a hundred, rounded up to a whole ledger unit');
  assert.equal(paid.toOfficer, 17);
  assert.equal(w.balance(x), xB - 18);
  assert.equal(w.balance(n), nB + 17);
  assert.equal(government(w), gB + 1);
  assert.equal(w.host.auditor.transactionCount(), count + 1, 'one transaction');
  const txn = w.host.auditor.transactions().find((t) => t.id === paid.txn);
  assert.equal(txn.entries.length, 3);
  assert.equal(txn.entries.reduce((sum, e) => sum + e.amount, 0), 0);
  assert.equal(txn.meta.toOfficer, 17);
  assert.ok(w.events(n.id).some((e) => e.type === 'receipt' && e.amount === 17));
  // paid again from anywhere: nothing moves
  ok(w.send(x.id, { type: 'custody.pay', arrestId: arrest.id }));
  w.place(f, post().x, post().z - 1);
  const fB = w.balance(f);
  const again = ok(w.send(f.id, { type: 'bail.pay', arrestId: arrest.id }));
  assert.equal(again.replayed, true);
  assert.equal(w.balance(n), nB + 17);
  assert.equal(w.balance(f), fB, 'the friend is charged nothing');
  assert.equal(w.host.auditor.transactionCount(), count + 1);
  clean(w);
});

test('a friend pays the fine at the Police Post; an arrest by the regular police pays no constable', () => {
  const w = town(['Ngozi Constable', 'Wale Wanted', 'Femi Friend']);
  const [n, x, f] = w.players;
  w.place(n, post().x, post().z - 1);
  ok(w.send(n.id, { type: 'police.enlist' }));
  w.place(n, 200, 200);
  assault(w, x, timid(w));
  until(w, () => x.law.state === 'custody', 600);
  const arrest = w.g.view(x.id).self.law.arrest;
  assert.equal(arrest.byConstable, false);
  const nB = w.balance(n), fB = w.balance(f), xB = w.balance(x), gB = government(w);
  w.place(f, post().x + 1, post().z - 1);
  const paid = ok(w.send(f.id, { type: 'bail.pay', arrestId: arrest.id, requestId: 'bail-request-0001' }));
  assert.equal(paid.toOfficer, 0);
  assert.equal(paid.amount, LAW.offences.assault.fine);
  assert.equal(w.balance(f), fB - LAW.offences.assault.fine);
  assert.equal(w.balance(x), xB, 'the prisoner paid nothing');
  assert.equal(w.balance(n), nB, 'a constable who did not make the arrest is paid nothing');
  assert.equal(government(w), gB + LAW.offences.assault.fine);
  assert.equal(x.law.state, 'released');
  // the same request sent again
  const again = ok(w.send(f.id, { type: 'bail.pay', arrestId: arrest.id, requestId: 'bail-request-0001' }));
  assert.equal(again.replayed, true);
  assert.equal(w.balance(f), fB - LAW.offences.assault.fine);
  // and the id cannot be reused for something else
  refused(w.send(f.id, { type: 'eat', requestId: 'bail-request-0001' }), 'REQUEST_REUSED');
  clean(w);
});

// The owner's charges (10 October 2026), in ledger units, two to a TR: 10 TR for a crime, 100 TR for a killing. Offences are put on the books the way the
// simulation records them (justice.offence), and the police are told in their own time.
const offend = (w, p, type) => {
  const victim = standing(w, p.x, p.z, { range: 600, not: ['police'] })[0];
  return w.I.justice.offence(p, type, { victim: { kind: 'npc', id: victim.i, name: victim.who.name }, x: p.x, z: p.z }).id;
};
const wantedFor = (w, p, n) => until(w, () => p.law.crimes.length === n && ['wanted', 'pursuit'].includes(p.law.state), LAW.report[1] + 2);

test('the police charge 10 TR whatever was done, 100 TR where someone was killed: the heaviest offence, not the sum', () => {
  assert.equal(LAW.mostFine, undefined); assert.equal(LAW.fineRange, undefined);
  for (const [type, rule] of Object.entries(LAW.offences)) assert.equal(rule.fine, (rule.death ? 100 : 10) * TR, type);
  assert.deepEqual(Object.keys(LAW.offences).filter((k) => LAW.offences[k].death), ['death_by_driving']);
  const w = town(['Ola Ordinary', 'Dayo Driver'], { funded: false });
  const [a, d] = w.players;
  const [x, z] = quietSpot(w);
  w.place(a, x, z); w.place(d, x + 3, z);
  offend(w, a, 'assault'); offend(w, a, 'theft');
  offend(w, d, 'dangerous_driving'); offend(w, d, 'death_by_driving');
  wantedFor(w, a, 2); wantedFor(w, d, 2);
  const officer = w.pop.people.find((q) => q.job === 'police');
  const by = { kind: 'npc', id: officer.index, name: officer.name };
  const ordinary = w.I.justice.arrest(a, by);
  assert.deepEqual([ordinary.fine.scale, ordinary.fine.amount, ordinary.fine.confirmed], [10 * TR, 10 * TR, true], 'two offences, 10 TR: not 20');
  const killing = w.I.justice.arrest(d, by);
  assert.deepEqual([killing.fine.scale, killing.fine.amount, killing.fine.confirmed], [100 * TR, 100 * TR, true], '100 TR, not 110');
  assert.equal(w.g.view(a.id).self.law.arrest.fine.amount, 10 * TR);
  assert.equal(w.g.view(d.id).self.law.arrest.fine.amount, 100 * TR);
  clean(w);
});

test('a player constable sets a fine from 5 TR up to the charge: 10 TR, or 100 TR where someone was killed', () => {
  const w = town(['Ngozi Constable', 'Ade Low', 'Bisi High', 'Dayo Driver'], { funded: false });
  const [n, lo, hi, d] = w.players;
  w.place(n, post().x, post().z - 1);
  ok(w.send(n.id, { type: 'police.enlist' }));
  const [x, z] = quietSpot(w);
  w.place(lo, x, z); w.place(hi, x + 3, z); w.place(d, x + 6, z);
  offend(w, lo, 'assault'); offend(w, hi, 'vehicle_theft'); offend(w, hi, 'assault'); offend(w, d, 'assault'); offend(w, d, 'death_by_driving');
  wantedFor(w, lo, 1); wantedFor(w, hi, 2); wantedFor(w, d, 2);
  const take = (q) => { w.place(n, q.x + 1, q.z); return ok(w.send(n.id, { type: 'police.arrest', playerId: q.id })).arrest; };
  // an ordinary arrest: 5 TR to 10 TR, and it stands at the police's 10 TR until set
  const a1 = take(lo);
  assert.deepEqual([a1.fine.least, a1.fine.scale, a1.fine.most, a1.fine.amount, a1.fine.confirmed], [5 * TR, 10 * TR, 10 * TR, 10 * TR, false]);
  refused(w.send(n.id, { type: 'police.fine', arrestId: a1.id, amount: 9 }), 'OUT_OF_RANGE');
  ok(w.send(n.id, { type: 'police.fine', arrestId: a1.id, amount: 10 }));
  assert.equal(w.g.view(lo.id).self.law.arrest.fine.amount, 10);
  const a2 = take(hi);
  assert.deepEqual([a2.fine.scale, a2.fine.most], [10 * TR, 10 * TR], 'two ordinary offences: still at most 10 TR');
  const tooMuch = refused(w.send(n.id, { type: 'police.fine', arrestId: a2.id, amount: 10 * TR + 1 }), 'OUT_OF_RANGE');
  assert.match(tooMuch.message, /5 TR and 10 TR/);
  ok(w.send(n.id, { type: 'police.fine', arrestId: a2.id, amount: 10 * TR }));
  assert.equal(w.g.view(hi.id).self.law.arrest.fine.amount, 10 * TR);
  // where a killing is among the crimes: up to 100 TR
  const a3 = take(d);
  assert.deepEqual([a3.fine.least, a3.fine.scale, a3.fine.most, a3.fine.amount], [5 * TR, 100 * TR, 100 * TR, 100 * TR]);
  refused(w.send(n.id, { type: 'police.fine', arrestId: a3.id, amount: 100 * TR + 1 }), 'OUT_OF_RANGE');
  ok(w.send(n.id, { type: 'police.fine', arrestId: a3.id, amount: 100 * TR }));
  refused(w.send(n.id, { type: 'police.fine', arrestId: a3.id, amount: 21 }), 'FINE_SET');
  assert.equal(w.g.view(d.id).self.law.arrest.fine.amount, 100 * TR);
  clean(w);
});

test('a constable who is arrested loses the badge; one with a record is not taken on', () => {
  const w = town(['Ngozi Constable']);
  const n = w.p;
  w.place(n, post().x, post().z - 1);
  ok(w.send(n.id, { type: 'police.enlist' }));
  assault(w, n, timid(w));
  until(w, () => n.law.state === 'custody', 600);
  assert.equal(w.g.view(n.id).self.law.role, null);
  ok(w.send(n.id, { type: 'custody.pay' }));
  run(w.host, LAW.released + 2);
  w.place(n, post().x, post().z - 1);
  refused(w.send(n.id, { type: 'police.enlist' }), 'RECORD');
});

test('a request with an id is answered once, whatever it is for', () => {
  const w = town();
  const kitchen = w.g.view(w.id).services.kitchen;
  assert.ok(kitchen.open);
  w.place(w.p, 64, 13);
  const mine = w.balance(w.p);
  const first = ok(w.send(w.id, { type: 'eat', requestId: 'meal-0000001' }));
  const second = ok(w.send(w.id, { type: 'eat', requestId: 'meal-0000001' }));
  assert.equal(second.replayed, true);
  assert.equal(second.txn, first.txn);
  assert.equal(w.balance(w.p), mine - 250, 'one plate, paid for once');
  // without an id, two requests are two meals: the id is what makes them one
  ok(w.send(w.id, { type: 'eat' }));
  assert.equal(w.balance(w.p), mine - 500);
});

// --- the ledger's own rules for this money (the same ones migration 0003 puts in PostgreSQL) -------------

function books() {
  const ledger = createLedger();
  const g = ledger.gameplay;
  const fund = (account, amount) => ledger.monetary.post({ key: `issue-${account}-${amount}-${Math.random()}`, kind: 'issuance', initiator: 'svc:test', reason: 'test funds', legs: [{ account: ledger.system.issuance, amount: -amount }, { account, amount }] });
  const player = (id, amount = 0) => { const account = g.openAccount('player', id, 'wallet'); if (amount) fund(account, amount); return account; };
  const government = g.openAccount('government', 'NG', 'treasury');
  let n = 0;
  const post = (kind, legs, meta, key) => g.post({ key: key || `test-key-${(n += 1)}`, kind, initiator: 'svc:test', reason: 'test', legs: legs.map(([account, amount]) => ({ account, amount })), meta });
  const code = (fn) => { try { fn(); } catch (error) { if (error instanceof LedgerError) return error.code; throw error; } return 'posted'; };
  return { ledger, g, player, government, post, code, balance: (a) => g.balance(a) };
}

test('the ledger itself: a fine goes to government in full, or is split with the constable to the unit, and no other way', () => {
  const b = books();
  const culprit = b.player('culprit', 10_000), constable = b.player('officer-1'), friend = b.player('friend');
  // an arrest by the regular police: all of it to government, and no player paid
  assert.equal(b.code(() => b.post('fine', [[culprit, -400], [b.government, 396], [friend, 4]], { arrest: 'A-1', officer: 'npc:7' })), 'NL012');
  b.post('fine', [[culprit, -400], [b.government, 400]], { arrest: 'A-1', officer: 'npc:7' });
  assert.equal(b.balance(b.government), 400);
  // an arrest by a constable: one part in a hundred to government, rounded up and never nothing
  for (const [amount, tax] of [[1_000, 10], [250, 3], [50, 1], [101, 2], [2, 1]]) {
    assert.deepEqual(fineShares(amount), { government: tax, constable: amount - tax });
    const meta = { arrest: `B-${amount}`, officer: 'player:officer-1' };
    assert.equal(b.code(() => b.post('fine', [[culprit, -amount], [constable, amount - tax + 1], [b.government, tax - 1]].filter(([, x]) => x !== 0), meta)), 'NL012', `${amount}: a unit too many for the constable`);
    assert.equal(b.code(() => b.post('fine', [[culprit, -amount], [friend, amount - tax], [b.government, tax]], meta)), 'NL012', `${amount}: the share to someone else`);
    assert.equal(b.code(() => b.post('fine', [[culprit, -amount], [constable, amount - tax], [b.government, tax]], meta)), 'posted');
  }
  assert.deepEqual(fineShares(1), { government: 1, constable: 0 });
  // the constable cannot be the one who pays
  assert.equal(b.code(() => b.post('fine', [[constable, -100], [friend, 99], [b.government, 1]], { arrest: 'C-1', officer: 'player:officer-1' })), 'NL012');
  // and a fine has to say what it is for
  assert.equal(b.code(() => b.post('fine', [[culprit, -100], [b.government, 100]], { officer: 'npc:7' })), 'NL012');
  assert.equal(b.code(() => b.post('fine', [[culprit, -100], [b.government, 100]], { arrest: 'D-1' })), 'NL012');
  assert.deepEqual(b.ledger.auditor.reconcile(), []);
});

test('the ledger itself: one fine for an arrest, one bill for a quote, one theft for a crime, under any key', () => {
  const b = books();
  const culprit = b.player('culprit', 5_000), friend = b.player('friend', 5_000), victim = b.player('victim', 1_000);
  const clinic = b.g.openAccount('business', 'clinic', 'operating');
  b.post('fine', [[culprit, -400], [b.government, 400]], { arrest: 'A-1', officer: 'npc:7' }, 'fine-key-one');
  // the same request again is answered, not charged
  assert.equal(b.post('fine', [[culprit, -400], [b.government, 400]], { arrest: 'A-1', officer: 'npc:7' }, 'fine-key-one').replayed, true);
  // another key, another payer, another amount: the arrest has been paid for
  assert.equal(b.code(() => b.post('fine', [[culprit, -400], [b.government, 400]], { arrest: 'A-1', officer: 'npc:7' }, 'fine-key-two')), 'NL011');
  assert.equal(b.code(() => b.post('fine', [[friend, -900], [b.government, 900]], { arrest: 'A-1', officer: 'npc:7' })), 'NL011');
  assert.equal(b.balance(b.government), 400);
  // a fine that could not be paid leaves the arrest open
  const poor = b.player('poor', 10);
  assert.equal(b.code(() => b.post('fine', [[poor, -400], [b.government, 400]], { arrest: 'A-2', officer: 'npc:7' })), 'NL001');
  assert.equal(b.code(() => b.post('fine', [[friend, -400], [b.government, 400]], { arrest: 'A-2', officer: 'npc:7' })), 'posted');
  // treatment: once for the quote, to a clinic or government and never to a player, and it must name the quote or the call
  b.post('medical_fee', [[culprit, -540], [b.government, 540]], { quote: 'Q-1' });
  assert.equal(b.code(() => b.post('medical_fee', [[culprit, -780], [b.government, 780]], { quote: 'Q-1' })), 'NL011');
  assert.equal(b.code(() => b.post('medical_fee', [[culprit, -300], [friend, 300]], { quote: 'Q-2' })), 'NL012');
  assert.equal(b.code(() => b.post('medical_fee', [[culprit, -300], [clinic, 300]], { place: 'clinic' })), 'NL012');
  assert.equal(b.code(() => b.post('medical_fee', [[culprit, -300], [clinic, 300]], { quote: 'Q-2' })), 'posted');
  b.post('medical_fee', [[culprit, -150], [b.government, 150]], { call: 'AMB-1' });
  assert.equal(b.code(() => b.post('medical_fee', [[culprit, -150], [b.government, 150]], { call: 'AMB-1' })), 'NL011');
  // theft once for the crime; restitution may come in parts, each under its own key
  b.post('theft', [[victim, -200], [culprit, 200]], { crime: 'CR-1' });
  assert.equal(b.code(() => b.post('theft', [[victim, -200], [culprit, 200]], { crime: 'CR-1' })), 'NL011');
  b.post('restitution', [[culprit, -120], [victim, 120]], { crime: 'CR-1', arrest: 'A-9' });
  b.post('restitution', [[culprit, -80], [victim, 80]], { crime: 'CR-1', arrest: 'A-9' });
  assert.equal(b.balance(victim), 1_000);
  assert.equal(b.code(() => b.post('restitution', [[culprit, -80], [victim, 80]], { crime: 'CR-1' })), 'NL012');
  assert.deepEqual(b.ledger.auditor.reconcile(), []);
});

test('the ledger itself: what was paid once is still paid once after a save and a reload', () => {
  const b = books();
  const culprit = b.player('culprit', 5_000);
  b.post('fine', [[culprit, -400], [b.government, 400]], { arrest: 'A-1', officer: 'npc:7' }, 'fine-key-one');
  const again = createLedger(JSON.parse(JSON.stringify(b.ledger.serialize())));
  const post = (key) => again.gameplay.post({ key, kind: 'fine', initiator: 'svc:test', reason: 'test', legs: [{ account: culprit, amount: -400 }, { account: b.government, amount: 400 }], meta: { arrest: 'A-1', officer: 'npc:7' } });
  assert.equal(post('fine-key-one').replayed, true);
  assert.throws(() => post('fine-key-two'), (error) => error instanceof LedgerError && error.code === 'NL011');
  assert.equal(again.gameplay.balance(culprit), 4_600);
});

// --- leaving and coming back --------------------------------------------------------------------

// The world as it was saved, loaded again: what a player finds after the page was closed or the connection lost.
function reloaded(w) {
  const host = createHost({ saved: JSON.parse(JSON.stringify(w.host.save())) });
  const g = host.game;
  return { host, g, send: (id, m) => g.intent(id, m), player: (id) => g.state.players[id], balance: (id) => host.auditor.balance(g.state.players[id].wallet) };
}

test('closing the page in the cell and coming back: still held, the fine still owed once, and paid once', () => {
  const w = town();
  assault(w, w.p, timid(w));
  until(w, () => w.p.law.state === 'custody', 400);
  const arrest = w.g.view(w.id).self.law.arrest;
  const before = w.balance(w.p);
  // the page is closed before anything is paid
  const a = reloaded(w);
  const law = a.g.view(w.id).self.law;
  assert.equal(law.state, 'custody');
  assert.equal(law.arrest.id, arrest.id);
  assert.equal(law.arrest.fine.amount, arrest.fine.amount, 'the same fine, not a new one');
  assert.equal(a.balance(w.id), before);
  refused(a.send(w.id, { type: 'move', x: 0, z: 0, heading: 0 }), 'IN_CUSTODY');
  const paid = ok(a.send(w.id, { type: 'custody.pay', arrestId: arrest.id, requestId: 'pay-after-reload-1' }));
  assert.equal(paid.replayed, false);
  assert.equal(a.balance(w.id), before - arrest.fine.amount);
  // closed again the moment after paying, and the same request arrives a second time from the client's retry
  const b = reloaded({ host: a.host });
  assert.notEqual(b.g.view(w.id).self.law.state, 'custody');
  const again = ok(b.send(w.id, { type: 'custody.pay', arrestId: arrest.id, requestId: 'pay-after-reload-1' }));
  assert.equal(again.replayed, true);
  assert.equal(again.txn, paid.txn);
  assert.equal(b.balance(w.id), before - arrest.fine.amount, 'not charged a second time');
  assert.equal(b.host.auditor.transactions().filter((t) => t.kind === 'fine').length, 1);
  assert.deepEqual(b.host.auditor.reconcile(), []);
});

test('coming back does not pay a constable twice, heal a patient twice or lift what someone is wanted for', () => {
  const w = town(['Ngozi Constable', 'Wale Wanted']);
  const [n, x] = w.players;
  w.place(n, post().x, post().z - 1);
  ok(w.send(n.id, { type: 'police.enlist' }));
  const [qx, qz] = quietSpot(w);
  w.place(x, qx, qz);
  // Wale strikes someone where there are no police, and is wanted
  const victim = farFromPolice(w, standing(w, qx, qz, { range: 400, not: ['police'] }))[0];
  assault(w, x, victim);
  until(w, () => x.law.state === 'wanted' || x.law.state === 'pursuit', 60);
  // a save while wanted: still wanted afterwards
  const a = reloaded(w);
  assert.ok(['wanted', 'pursuit'].includes(a.g.view(x.id).self.law.state), 'still wanted after coming back');
  assert.equal(a.g.view(n.id).self.law.role.badge, w.g.view(n.id).self.law.role.badge, 'the badge is kept');
  // the constable arrests, sets the fine and brings the prisoner in, in the reloaded world
  const N = a.player(n.id), X = a.player(x.id);
  N.x = X.x + 1; N.z = X.z; N.lastMoveAt = a.g.state.real - 5;
  const arrest = ok(a.send(n.id, { type: 'police.arrest', playerId: x.id })).arrest;
  ok(a.send(n.id, { type: 'police.fine', arrestId: arrest.id, amount: 10 * TR }));
  N.x = post().x; N.z = post().z - 1; X.x = post().x + 1; X.z = post().z - 1; N.lastMoveAt = X.lastMoveAt = a.g.state.real - 5;
  for (let t = 0; t < 30 && a.g.view(x.id).self.law.state !== 'custody'; t += 1) { a.send(n.id, { type: 'police.book', arrestId: arrest.id }); a.host.tick(0.5); }
  assert.equal(a.g.view(x.id).self.law.state, 'custody');
  const reward0 = a.balance(n.id);
  ok(a.send(x.id, { type: 'custody.pay', arrestId: arrest.id }));
  const reward = a.balance(n.id) - reward0;
  assert.equal(reward, 10 * TR - 1, 'all of the 10 TR but the government\'s one unit');
  // and back again: asking a second time pays nobody a second time
  const b = reloaded({ host: a.host });
  assert.equal(ok(b.send(x.id, { type: 'custody.pay', arrestId: arrest.id })).replayed, true);
  assert.equal(b.balance(n.id), reward0 + reward);
  assert.equal(b.host.auditor.transactions().filter((t) => t.kind === 'fine').length, 1);
  // treatment: paid before the page closed, asked for again after
  const P = b.player(x.id);
  b.g.internals.conflict.hurt(P, 60);
  const hospital = zoneService('hospital');
  P.x = hospital.x; P.z = hospital.z + 1.2; P.lastMoveAt = b.g.state.real - 5;
  const q = ok(b.send(x.id, { type: 'care.quote', place: 'hospital' })).quote;
  const level = q.options[0].level;
  const bill = ok(b.send(x.id, { type: 'care.pay', quoteId: q.id, level }));
  const c = reloaded({ host: b.host });
  const health = c.g.view(x.id).self.health;
  assert.equal(health, level, 'the treatment that was paid for is still there');
  const twice = ok(c.send(x.id, { type: 'care.pay', quoteId: q.id, level }));
  assert.equal(twice.replayed, true);
  assert.equal(twice.txn, bill.txn);
  assert.equal(c.g.view(x.id).self.health, health, 'not healed again');
  assert.equal(c.balance(x.id), b.balance(x.id), 'not charged again');
  assert.deepEqual(c.host.auditor.reconcile(), []);
});

test('a townsperson\'s body answers: kicked, they are hurt and run; those near are frightened; only townspeople are shown so', () => {
  const w = town(['Ada Kicker', 'Bayo Watching']);
  const a = timid(w);
  beside(w, w.p, a);
  w.place(w.players[1], a.x + 3, a.z + 3);
  ok(w.send(w.id, { type: 'combat.engage', target: { kind: 'npc', id: a.i } }));
  const r = ok(w.send(w.id, { type: 'combat.act', move: 'kick' }));
  assert.equal(r.hit, true);
  const reacts = w.g.view(w.id).reacts;
  const theirs = reacts.find((e) => e[0] === a.i);
  assert.ok(theirs, 'the one kicked plays a reaction');
  assert.ok(['hurt', 'flee', 'box', 'stomp'].includes(theirs[1]), `kicked, they play ${theirs[1]}`);
  // every entry names a townsperson by number: nothing is ever played on a player
  for (const [i] of reacts) assert.ok(Number.isInteger(i) && i >= 0 && i < w.pop.count);
  assert.ok(!reacts.some(([i]) => typeof i === 'string'));
  // it ends of itself
  run(w.host, 12);
  assert.ok(!w.g.view(w.id).reacts.some((e) => e[0] === a.i && e[1] === theirs[1] && e[2] > 11));
});
