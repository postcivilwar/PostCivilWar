// Tests of the phone (contacts, calls, messages, the way to a place, help
// with a fine) and of taking a vehicle that is not yours.
//
//   node --test test/phone.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { town as ourTown, standing, until, assault, run, ok, refused, post, whereIs, farFromPolice, officerOnScene, quietSpot } from './world.mjs';
import { LAW } from '../src/sim/justice.js';
import { HIJACK, driverSide } from '../src/sim/hijack.js';
import { MOTO } from '../src/sim/okada.js';
import { zoneService, zoneResident, zoneAccountHolder, ZONE_RESIDENTS, ZONE_FORMER_RESIDENTS, ZONE_VEHICLE_BAYS } from '../src/sim/zone.js';
import { FORMER_TOWN } from './helpers.mjs';

// The town as it is (its people: the police, and the named residents at the counters), and the town as it was until
// 22 October 2026, with its thousand townspeople and its okadas (FORMER_TOWN): where a test needs a townsperson to be
// struck, or an okada to be taken, it is the town as it was, whose systems are kept ready for the owner's own models.
const town = (names, options = {}) => ourTown(names, options);
const former = (names, options = {}) => ourTown(names, { people: FORMER_TOWN, ...options });
const MARKET = [8, 58];
const clean = (w) => assert.deepEqual(w.host.auditor.reconcile(), [], 'the ledger balances');
const timid = (w) => standing(w, ...MARKET, { not: ['police'] }).find((a) => a.nerve < 0.4 && a.who.age < 55);
const contactsOf = (w, id) => ok(w.send(id, { type: 'phone.contacts' })).contacts;
const inCustody = (w, p) => { assault(w, p, timid(w)); until(w, () => p.law.state === 'custody', 600); return w.g.view(p.id).self.law.arrest; };

test('contacts: emergency numbers and the town\'s businesses from the start; players as they are met, and nobody else', () => {
  const w = town(['Ada Caller', 'Bola Friend']);
  const [a, b] = w.players;
  const first = contactsOf(w, a.id);
  assert.deepEqual(first.filter((c) => c.kind === 'emergency').map((c) => c.key), ['svc:police', 'svc:hospital']);
  assert.ok(first.filter((c) => c.kind === 'business').length >= 7);
  assert.equal(first.filter((c) => c.kind === 'person' || c.kind === 'friend').length, 0);
  // someone in town spoken to is not a contact: the phone reaches players (22 October 2026, the owner's word: "its only
  // playable character one can phone"), and the town's businesses and emergency numbers
  const r = ZONE_RESIDENTS.map((x) => ({ x, live: w.I.residents.get(x.id) })).find((e) => e.live.mode === 'at');
  w.place(a, r.live.x + 1, r.live.z);
  ok(w.send(a.id, { type: 'talk', residentId: r.x.id }));
  assert.ok(!contactsOf(w, a.id).some((c) => c.key === `res:${r.x.id}` || c.kind === 'person'), 'a resident spoken to is no contact');
  refused(w.send(a.id, { type: 'phone.call', key: `res:${r.x.id}` }), 'NO_CONTACT');
  // another player: only by standing next to them, and both get the number
  w.place(b, a.x + 30, a.z);
  refused(w.send(a.id, { type: 'contacts.add', playerId: b.id }), 'TOO_FAR');
  refused(w.send(a.id, { type: 'contacts.add', playerId: a.id }), 'NO_PLAYER');
  w.place(b, a.x + 2, a.z);
  ok(w.send(a.id, { type: 'contacts.add', playerId: b.id }));
  assert.ok(contactsOf(w, a.id).some((c) => c.key === `ply:${b.id}` && c.kind === 'friend'));
  assert.ok(contactsOf(w, b.id).some((c) => c.key === `ply:${a.id}`), 'and the other has theirs');
  ok(w.send(a.id, { type: 'contacts.tag', key: `ply:${b.id}`, tag: 'family' }));
  assert.equal(contactsOf(w, a.id).find((c) => c.key === `ply:${b.id}`).kind, 'family');
  refused(w.send(a.id, { type: 'contacts.tag', key: `ply:${b.id}`, tag: 'admin' }), 'BAD_TAG');
  refused(w.send(a.id, { type: 'phone.call', key: 'ply:p-9999' }), 'NO_CONTACT');
});

test('calls: the police take a report, the hospital sends the ambulance, a business says if it is open', () => {
  const w = town(['Ada Caller', 'Bola Friend']);
  const [a, b] = w.players;
  const desk = ok(w.send(a.id, { type: 'phone.call', key: 'svc:police' }));
  assert.match(desk.said, /Nothing is held against you/);
  refused(w.send(a.id, { type: 'phone.call', key: 'svc:police', about: 'report' }), 'NOTHING');
  refused(w.send(a.id, { type: 'phone.call', key: 'svc:police', about: 'surrender' }), 'NOT_WANTED');
  const yard = ok(w.send(a.id, { type: 'phone.call', key: 'svc:yard' }));
  assert.match(yard.said, /open until 18:00/);
  const hospital = ok(w.send(a.id, { type: 'phone.call', key: 'svc:hospital' }));
  assert.equal(hospital.ambulance.needed, false);
  refused(w.send(a.id, { type: 'phone.call', key: 'svc:hospital', about: 'ambulance' }), 'NOT_NEEDED');
  w.place(a, 2, 40);
  w.I.conflict.hurt(a, 85);
  const sent = ok(w.send(a.id, { type: 'phone.call', key: 'svc:hospital', about: 'ambulance' }));
  assert.equal(sent.call.fee, 0, 'free: their health is critical');
  assert.equal(w.g.view(a.id).ambulance.mode, 'out');
  // a player who was struck: with no officer there to see it, there is nothing the police can do (31 October 2026, the
  // owner's word: only what an officer on the scene sees is a crime); with one there, the one struck can tell them at
  // once by phone (a player who only saw it is no witness, 22 October 2026)
  const w2 = town(['Wale Wrong', 'Sade Struck', 'Bisi Bystander']);
  const [x, s, by] = w2.players;
  const [qx, qz] = quietSpot(w2);
  w2.place(s, qx + 0.9, qz, -Math.PI / 2); w2.place(x, qx, qz, Math.PI / 2); w2.place(by, qx + 4, qz + 2);
  ok(w2.send(x.id, { type: 'combat.engage', target: { kind: 'player', id: s.id } }));
  ok(w2.send(x.id, { type: 'combat.act', move: 'punch' }));
  assert.equal(w2.g.view(s.id).self.law.seen.length, 0, 'no officer saw it: nothing to tell them');
  refused(w2.send(s.id, { type: 'phone.call', key: 'svc:police', about: 'report' }), 'NOTHING');
  run(w2.host, 3);
  assert.equal(x.law.state, 'normal');
  // an officer comes upon them, and the next blow is seen
  officerOnScene(w2, qx, qz);
  run(w2.host, 0.6);
  ok(w2.send(x.id, { type: 'combat.act', move: 'punch' }));
  assert.equal(w2.g.view(by.id).self.law.seen.length, 0, 'the one who only saw it has nothing to report');
  refused(w2.send(by.id, { type: 'phone.call', key: 'svc:police', about: 'report' }), 'NOTHING');
  assert.equal(w2.g.view(s.id).self.law.seen.length, 1);
  const told = ok(w2.send(s.id, { type: 'phone.call', key: 'svc:police', about: 'report' }));
  assert.equal(told.reports[0].identified, true);
  assert.ok(['wanted', 'pursuit'].includes(x.law.state), 'at once: no waiting for word to get round');
  // someone who is wanted can give themselves up by phone, and is then taken without a chase
  ok(w2.send(x.id, { type: 'combat.disengage' }));
  const up = ok(w2.send(x.id, { type: 'phone.call', key: 'svc:police', about: 'surrender' }));
  assert.equal(up.surrendered, true);
  until(w2, () => x.law.state === 'custody', 600);
  assert.equal(Object.values(w2.g.state.justice.crimes).filter((c) => c.type === 'resisting').length, 0);
  void b;
});

test('messages go between players who have each other\'s number, cleaned and kept', () => {
  const w = town(['Ada Caller', 'Bola Friend', 'Stranger Sam']);
  const [a, b, c] = w.players;
  w.place(b, a.x + 2, a.z);
  refused(w.send(a.id, { type: 'phone.message', key: `ply:${b.id}`, text: 'hello' }), 'NO_CONTACT');
  ok(w.send(a.id, { type: 'contacts.add', playerId: b.id }));
  refused(w.send(a.id, { type: 'phone.message', key: 'svc:police', text: 'hello' }), 'NO_REPLY');
  refused(w.send(a.id, { type: 'phone.message', key: `ply:${b.id}`, text: '   ' }), 'EMPTY');
  w.place(b, 200, 200);                                  // a message does not need them near
  const sent = ok(w.send(a.id, { type: 'phone.message', key: `ply:${b.id}`, text: `  Where are you?${'!'.repeat(400)}` })).message;
  assert.ok(sent.text.startsWith('Where are you?') && sent.text.length <= 160);
  assert.ok(w.events(b.id).some((e) => e.type === 'message' && e.from === a.name));
  assert.equal(w.g.view(b.id).self.phone.unread, 1);
  ok(w.send(b.id, { type: 'phone.message', key: `ply:${a.id}`, text: 'At the jetty.' }));
  const thread = ok(w.send(a.id, { type: 'phone.thread', key: `ply:${b.id}` }));
  assert.deepEqual(thread.messages.map((m) => [m.mine, m.text.slice(0, 14)]), [[true, 'Where are you?'], [false, 'At the jetty.']]);
  assert.equal(w.g.view(a.id).self.phone.unread, 0, 'read once the thread has been opened');
  refused(w.send(c.id, { type: 'phone.thread', key: `ply:${b.id}` }), 'NO_CONTACT');
  assert.equal(ok(w.send(a.id, { type: 'phone.call', key: `ply:${b.id}` })).said, `Ringing ${b.name}.`);
  assert.ok(w.events(b.id).some((e) => e.type === 'call'));
});

test('the way to a place: along the paths, with how far and how long', () => {
  const w = town();
  w.place(w.p, 0, 100);
  const way = ok(w.send(w.id, { type: 'map.route', x: post().x, z: post().z, label: 'Police Post' }));
  const straight = Math.hypot(post().x - 0, post().z - 100);
  assert.ok(way.metres >= straight - 1 && way.metres < straight * 2, `${way.metres} m by the paths, ${straight.toFixed(0)} m as the crow flies`);
  assert.deepEqual(way.points[0], [0, 100]);
  assert.deepEqual(way.points[way.points.length - 1], [post().x, post().z]);
  assert.equal(way.walkSeconds, Math.round(way.metres / 2.4));
  assert.ok(way.walkMinutes >= 1 && way.driveSeconds > 0 && way.driveSeconds < way.walkSeconds);
  for (let k = 1; k < way.points.length; k += 1) assert.ok(Math.hypot(way.points[k][0] - way.points[k - 1][0], way.points[k][1] - way.points[k - 1][1]) < 160, 'a path, not a leap');
  refused(w.send(w.id, { type: 'map.route', x: 'north', z: 1 }), 'NO_PLACE');
});

test('from custody the phone is the officer\'s to allow: asked for, granted, and then only a few messages to people one knows', () => {
  const w = former(['Wale Held', 'Femi Friend']);
  const [x, f] = w.players;
  w.place(f, x.x + 2, x.z);
  ok(w.send(x.id, { type: 'contacts.add', playerId: f.id }));
  w.place(f, 120, 60);
  const arrest = inCustody(w, x);
  assert.equal(arrest.call.status, 'none');
  refused(w.send(x.id, { type: 'phone.message', key: `ply:${f.id}`, text: 'help' }), 'NOT_ALLOWED');
  refused(w.send(x.id, { type: 'phone.call', key: `ply:${f.id}` }), 'NOT_ALLOWED');
  ok(w.send(x.id, { type: 'phone.contacts' }));                  // the contact list itself can be read
  ok(w.send(x.id, { type: 'map.route', x: 0, z: 0 }));           // and the map
  assert.equal(ok(w.send(x.id, { type: 'custody.requestCall' })).call.status, 'asked');
  refused(w.send(x.id, { type: 'custody.requestCall' }), 'ASKED');
  // an officer of the regular police says yes after a moment
  until(w, () => w.g.view(x.id).self.law.arrest.call.status === 'allowed', 10);
  assert.ok(w.events(x.id).some((e) => e.title === 'You may use the phone'));
  refused(w.send(x.id, { type: 'phone.call', key: 'svc:yard' }), 'NOT_ALLOWED');     // only people they know
  for (let k = 0; k < LAW.messagesInCustody; k += 1) ok(w.send(x.id, { type: 'phone.message', key: `ply:${f.id}`, text: `message ${k}` }));
  refused(w.send(x.id, { type: 'phone.message', key: `ply:${f.id}`, text: 'one more' }), 'NO_MORE');
  assert.equal(w.g.view(x.id).self.law.arrest.call.messagesLeft, 0);
  // asking the friend to pay: the friend is shown where to go, how far, and how long it will take
  const asked = ok(w.send(x.id, { type: 'phone.askBail', key: `ply:${f.id}` }));
  const fine = LAW.offences.assault.fine;
  assert.equal(arrest.fine.amount, fine);
  assert.equal(asked.amount, fine);
  const request = w.g.view(f.id).self.phone.requests[0];
  assert.equal(request.kind, 'bail');
  assert.equal(request.from, x.name);
  assert.equal(request.amount, fine);
  assert.deepEqual(request.station, { x: post().x, z: post().z, name: 'Police Post' });
  assert.ok(request.metres > 150 && Math.abs(request.walkSeconds - request.metres / 2.4) <= 0.75 && request.walkMinutes >= 1, JSON.stringify(request));
  assert.equal(request.near, false);
  assert.equal(request.ready, true);
  refused(w.send(f.id, { type: 'bail.pay', arrestId: request.arrest }), 'TOO_FAR');
  w.place(f, post().x + 1, post().z - 1);
  assert.equal(w.g.view(f.id).self.phone.requests[0].near, true);
  const fB = w.balance(f), xB = w.balance(x);
  ok(w.send(f.id, { type: 'bail.pay', arrestId: request.arrest }));
  assert.equal(w.balance(f), fB - fine);
  assert.equal(w.balance(x), xB);
  assert.equal(x.law.state, 'released');
  assert.equal(w.g.view(f.id).self.phone.requests.length, 0, 'the request is gone once the fine is paid');
  clean(w);
});

test('a constable decides whether their prisoner may use the phone; silence is taken as yes', () => {
  const w = former(['Ngozi Constable', 'Wale Held']);
  const [n, x] = w.players;
  w.place(n, post().x, post().z - 1);
  ok(w.send(n.id, { type: 'police.enlist' }));
  const victim = farFromPolice(w, standing(w, ...MARKET, { range: 500, not: ['police'] })).find((a) => a.nerve < 0.4 && a.who.age < 55);
  officerOnScene(w, victim.x, victim.z);
  assault(w, x, victim);
  until(w, () => ['wanted', 'pursuit'].includes(x.law.state), 20);
  w.place(n, x.x + 1, x.z);
  const arrest = ok(w.send(n.id, { type: 'police.arrest', playerId: x.id })).arrest;
  ok(w.send(x.id, { type: 'custody.requestCall' }));
  assert.ok(w.events(n.id).some((e) => e.title === 'Prisoner asks to make a call'));
  refused(w.send(x.id, { type: 'police.decideCall', arrestId: arrest.id, allow: true }), 'IN_CUSTODY');     // not the prisoner's to decide
  ok(w.send(n.id, { type: 'police.decideCall', arrestId: arrest.id, allow: false }));
  assert.equal(w.g.view(x.id).self.law.arrest.call.status, 'denied');
  refused(w.send(x.id, { type: 'custody.requestCall' }), 'DENIED');
  run(w.host, 61);
  ok(w.send(x.id, { type: 'custody.requestCall' }));
  // the constable says nothing: after half a minute at the post the call is allowed
  w.place(n, post().x, post().z - 1.5);
  w.place(x, post().x + 0.8, post().z - 1.5);
  ok(w.send(n.id, { type: 'police.book', arrestId: arrest.id }));
  run(w.host, LAW.callWait + 1);
  assert.equal(w.g.view(x.id).self.law.arrest.call.status, 'allowed');
});

test('only another player can pay a fine: a townsperson no longer stands it', () => {
  const w = former(['Wale Held', 'Femi Friend']);
  const [x, f] = w.players;
  const r = ZONE_RESIDENTS.map((e) => ({ e, live: w.I.residents.get(e.id) })).find((e) => e.live.mode === 'at' && !['sergeant', 'corporal'].includes(e.e.id));
  w.place(x, r.live.x + 1, r.live.z);
  ok(w.send(x.id, { type: 'talk', residentId: r.e.id }));
  refused(w.send(x.id, { type: 'phone.askSurety', key: `res:${r.e.id}` }), 'NOT_IN_CUSTODY');
  w.place(f, x.x + 2, x.z);
  ok(w.send(x.id, { type: 'contacts.add', playerId: f.id }));
  w.place(f, 120, 60);
  inCustody(w, x);
  ok(w.send(x.id, { type: 'custody.requestCall' }));
  until(w, () => w.g.view(x.id).self.law.arrest.call.status === 'allowed', 10);
  // the resident spoken to is not to be asked, and nobody in town is: only a player
  const asked = refused(w.send(x.id, { type: 'phone.askSurety', key: `res:${r.e.id}` }), 'PLAYERS_ONLY');
  assert.match(asked.message, /Only another player can pay your fine/);
  assert.equal(w.g.view(x.id).self.phone.surety, null);
  assert.equal(ok(w.send(x.id, { type: 'phone.askBail', key: `ply:${f.id}` })).asked, f.name);
  run(w.host, 60);
  assert.equal(x.law.state, 'custody', 'nobody in town came to pay');
});

test('money owed to a townsperson who paid a fine before 22 October 2026 is still the player\'s to repay, when they choose', () => {
  // a game saved then: the fisherman (no longer seen in the town) had paid a 10 TR fine for the player, who owes it him
  const w = town(['Wale Owing']);
  const x = w.p;
  const fisher = zoneAccountHolder('fisher');
  assert.ok(fisher && !zoneResident('fisher') && ZONE_FORMER_RESIDENTS.some((r) => r.id === 'fisher'), 'one of the townspeople no longer seen');
  const fine = LAW.offences.assault.fine;
  w.g.state.phone.debtSeq = 1;
  w.g.state.phone.debts['D-00001'] = { id: 'D-00001', player: x.id, to: 'fisher', amount: fine, left: fine, at: 0, arrest: 'AR-000001' };
  // and he was on his way to pay a second: he does not come, and the player is told
  w.g.state.phone.sureties['AR-000002'] = { resident: 'fisher', arrest: 'AR-000002', player: x.id, askedAt: 0, key: 'surety:AR-000002' };
  run(w.host, 0.2);
  assert.deepEqual(w.g.state.phone.sureties, {});
  assert.ok(w.events(x.id).some((e) => /cannot come to pay your fine/.test(e.text || '')));
  const debts = w.g.view(x.id).self.phone.debts;
  assert.deepEqual(debts.map((d) => [d.to, d.left]), [[fisher.name, fine]]);
  const wallet = w.I.economy.accounts.resident('fisher');
  const theirs = w.host.auditor.balance(wallet), mine = w.balance(x);
  run(w.host, 120);
  assert.equal(w.balance(x), mine, 'nothing is taken back without the player choosing to repay');
  const part = ok(w.send(x.id, { type: 'phone.repay', debtId: 'D-00001', amount: 8 }));
  assert.deepEqual([part.paid, part.left], [8, fine - 8]);
  const rest = ok(w.send(x.id, { type: 'phone.repay', debtId: 'D-00001' }));
  assert.deepEqual([rest.paid, rest.left], [fine - 8, 0]);
  assert.equal(w.balance(x), mine - fine);
  assert.equal(w.host.auditor.balance(wallet), theirs + fine, 'into his own account');
  refused(w.send(x.id, { type: 'phone.repay', debtId: 'D-00001' }), 'NO_DEBT');
  assert.ok(w.host.auditor.transactions().some((t) => t.reason === `Repaid to ${fisher.name}`));
  clean(w);
});

// ------------------------------------------------------------------ vehicles --

const stoppedOkada = (w) => w.g.view(w.id).okadas.filter((o) => o.stopped).map((o) => ({ ...o, rider: w.I.okada.riders[o.n] })).sort((a, b) => Math.hypot(a.x - 8, a.z - 58) - Math.hypot(b.x - 8, b.z - 58))[0];
const at = (v, lateral, along) => ({ x: v.x + Math.cos(v.h) * lateral + Math.sin(v.h) * along, z: v.z - Math.sin(v.h) * lateral + Math.cos(v.h) * along });

test('where to stand: beside the driver, never where the passenger sits', () => {
  const bike = { x: 10, z: 20, h: 0.7 };
  for (const side of [1, -1]) {
    const here = at(bike, 0.8 * side, 0.3);
    const s = driverSide('okada', bike, here.x, here.z);
    assert.equal(s.ok, true);
    assert.equal(s.side, side);
    assert.ok(Math.abs(s.lateral - 0.8 * side) < 1e-9 && Math.abs(s.along - 0.3) < 1e-9);
    assert.ok(Math.hypot(s.stand.x - bike.x, s.stand.z - bike.z) < 1.2);
  }
  const behind = at(bike, 0.2, -0.8);
  assert.deepEqual([driverSide('okada', bike, behind.x, behind.z).ok, driverSide('okada', bike, behind.x, behind.z).behind], [false, true]);
  const far = at(bike, 3, 0.3);
  assert.equal(driverSide('okada', bike, far.x, far.z).ok, false);
  const keke = { x: 0, z: 0, heading: 0 };
  assert.equal(driverSide('keke', keke, 1.1, 0.5).ok, true, 'at the front seat');
  assert.equal(driverSide('keke', keke, 1.1, -0.9).ok, false, 'at the back bench');
  assert.equal(driverSide('keke', keke, 0, 2.2).ok, false, 'in front of it');
});

test('a motorcycle: taken only from beside a rider who has stopped, in steps that take time, and it is an offence', () => {
  const w = former();
  const o = stoppedOkada(w);
  assert.ok(o, 'a rider is waiting somewhere');
  const riderName = w.pop.people[o.person].name;
  const bike = { x: o.rider.x, z: o.rider.z, h: o.rider.h };
  // from behind, where a passenger would sit: no
  let here = at(bike, 0.15, -0.9);
  w.place(w.p, here.x, here.z);
  refused(w.send(w.id, { type: 'hijack.start', okada: o.n }), 'PASSENGER_SIDE');
  here = at(bike, 4, 0.3);
  w.place(w.p, here.x, here.z);
  refused(w.send(w.id, { type: 'hijack.start', okada: o.n }), 'TOO_FAR');
  refused(w.send(w.id, { type: 'hijack.start', okada: 999 }), 'NO_RIDER');
  refused(w.send(w.id, { type: 'hijack.start' }), 'NO_TARGET');
  // one that is moving: no
  const moving = w.g.view(w.id).okadas.find((m) => m.moving && !m.stopped);
  if (moving) { const r = w.I.okada.riders[moving.n]; const b = at({ x: r.x, z: r.z, h: r.h }, 0.8, 0.3); w.place(w.p, b.x, b.z); refused(w.send(w.id, { type: 'hijack.start', okada: moving.n }), 'MOVING'); }
  // from beside the rider
  here = at(bike, 1.1, 0.4);
  w.place(w.p, here.x, here.z);
  const started = ok(w.send(w.id, { type: 'hijack.start', okada: o.n })).hijack;
  assert.deepEqual([started.kind, started.step], ['okada', 'reach']);
  assert.ok(Math.hypot(w.p.x - here.x, w.p.z - here.z) < 0.6, 'a step to the rider\'s side, not a jump');
  assert.equal(w.g.view(w.id).self.astride, null, 'not in the saddle yet');
  refused(w.send(w.id, { type: 'move', x: w.p.x + 0.1, z: w.p.z, heading: 0 }), 'BUSY');
  refused(w.send(w.id, { type: 'hijack.start', okada: o.n }), 'BUSY');
  const steps = [];
  const took = until(w, () => w.g.view(w.id).self.astride !== null, 5, () => { const h = w.g.view(w.id).self.hijack; if (h && steps[steps.length - 1] !== h.step) steps.push(h.step); });
  assert.deepEqual(steps, ['reach', 'pull', 'mount']);
  assert.ok(Math.abs(took - HIJACK.okada.steps[2][1]) < 0.25, `it took ${took.toFixed(1)} s`);
  assert.deepEqual(w.g.view(w.id).self.astride, { n: o.n });
  // the rider is on his feet beside it, and runs
  const rider = whereIs(w, o.person);
  assert.ok(Math.hypot(rider.x - bike.x, rider.z - bike.z) < 2.5 && rider.pose !== 5, 'pulled off, not vanished');
  const listed = w.g.view(w.id).okadas.find((e) => e.n === o.n);
  assert.deepEqual([listed.person, listed.taken, listed.mine, listed.free], [null, w.id, true, false]);
  const crime = Object.values(w.g.state.justice.crimes)[0];
  assert.deepEqual([crime.type, crime.victim.name, crime.vehicle, crime.detection], ['vehicle_theft', riderName, `okada:${o.n}`, 'identified']);
  refused(w.send(w.id, { type: 'okada.options', n: o.n }), 'RIDING');
  // riding it: the simulation checks every step
  refused(w.send(w.id, { type: 'move', x: w.p.x, z: w.p.z + 0.2, heading: 0 }), 'RIDING');
  refused(w.send(w.id, { type: 'moto.drive', x: w.p.x + 30, z: w.p.z, heading: 0 }), 'TOO_FAST');
  run(w.host, 0.1);
  const step = MOTO.speedRough * 0.1;
  const dir = [[0, -1], [0, 1], [1, 0], [-1, 0]].find(([dx, dz]) => w.send(w.id, { type: 'moto.drive', x: w.p.x + dx * step, z: w.p.z + dz * step, heading: Math.atan2(dx, dz) }).ok);
  assert.ok(dir, 'it moves');
  // the police come for whoever took it; arrested in the saddle, they are taken off it
  until(w, () => w.p.law.state === 'custody', 900);
  assert.equal(w.g.view(w.id).self.astride, null);
  assert.equal(w.g.view(w.id).self.law.arrest.offences[0].name, 'Taking a vehicle');
  assert.equal(w.g.view(w.id).self.law.arrest.fine.amount, LAW.offences.vehicle_theft.fine);
  // and the rider walks back to his machine and goes on with his day
  until(w, () => !w.I.okada.parted(w.I.okada.riders[o.n]), 900);
  assert.equal(w.I.okada.riders[o.n].takenBy, null);
  assert.ok(['rank', 'toRank', 'off', 'home'].includes(w.I.okada.riders[o.n].mode));
  clean(w);
});

test('a motorcycle left standing is not lost: its rider comes for it', () => {
  const w = former();
  const o = stoppedOkada(w);
  const here = at({ x: o.rider.x, z: o.rider.z, h: o.rider.h }, -1.0, 0.3);
  w.place(w.p, here.x, here.z);
  ok(w.send(w.id, { type: 'hijack.start', okada: o.n }));
  until(w, () => w.g.view(w.id).self.astride !== null, 5);
  const left = ok(w.send(w.id, { type: 'moto.leave' }));
  assert.ok(Math.hypot(left.x - o.rider.x, left.z - o.rider.z) < 2);
  assert.equal(w.g.view(w.id).self.astride, null);
  assert.equal(w.g.view(w.id).okadas.find((e) => e.n === o.n).abandoned, true);
  refused(w.send(w.id, { type: 'moto.drive', x: w.p.x, z: w.p.z, heading: 0 }), 'NOT_RIDING');
  w.place(w.p, 150, -200);
  let last = null;
  until(w, () => !w.I.okada.parted(w.I.okada.riders[o.n]), 900, () => { const r = whereIs(w, o.person); if (last) assert.ok(Math.hypot(r.x - last.x, r.z - last.z) < 0.9, 'he walks to it'); last = r; });
});

test('a keke: locked at night, taken by day only from the front seat, and returned when the taker is arrested', () => {
  const w = town();
  const v = w.g.view(w.id).vehicles.find((c) => !c.yours);
  assert.ok(v && v.locked === false, 'by day the dealer\'s kekes stand open');
  const body = { x: v.x, z: v.z, heading: v.heading, h: v.heading };
  let here = at(body, 1.1, -1.0);
  w.place(w.p, here.x, here.z);
  refused(w.send(w.id, { type: 'hijack.start', vehicle: v.id }), 'PASSENGER_SIDE');
  refused(w.send(w.id, { type: 'vehicle.enter', vehicleId: v.id }), 'NOT_YOURS');
  here = at(body, 1.3, 0.5);
  w.place(w.p, here.x, here.z);
  // (an officer on her beat by the park: 31 October 2026, only what an officer sees is a crime)
  officerOnScene(w, v.x, v.z);
  const started = ok(w.send(w.id, { type: 'hijack.start', vehicle: v.id })).hijack;
  assert.deepEqual([started.kind, started.step], ['keke', 'door']);
  assert.equal(w.g.view(w.id).self.driving, null);
  const took = until(w, () => !!w.g.view(w.id).self.driving, 5);
  assert.ok(Math.abs(took - HIJACK.keke.steps[1][1]) < 0.25);
  assert.equal(w.g.view(w.id).self.driving.id, v.id);
  const crime = Object.values(w.g.state.justice.crimes)[0];
  assert.deepEqual([crime.type, crime.vehicle], ['vehicle_theft', v.id]);
  assert.equal(crime.detection, 'identified', 'the officer on her beat saw it');
  ok(w.send(w.id, { type: 'vehicle.exit' }));
  until(w, () => w.p.law.state === 'custody', 900);
  const back = w.g.view(w.id).vehicles.find((c) => c.id === v.id);
  const bay = ZONE_VEHICLE_BAYS.find((b) => Math.hypot(b.x - back.x, b.z - back.z) < 0.01);
  assert.ok(bay, 'it is back in its bay');
  assert.equal(back.taken, false);
  assert.equal(w.g.audit().vehicles.count, w.g.audit().vehicles.expected);
  // at night it is locked
  const night = town(['Night Owl'], { hour: 23 });
  const n = night.g.view(night.id).vehicles.find((c) => !c.yours);
  assert.equal(n.locked, true);
  const side = at({ x: n.x, z: n.z, h: n.heading }, 1.3, 0.5);
  night.place(night.p, side.x, side.z);
  refused(night.send(night.id, { type: 'hijack.start', vehicle: n.id }), 'LOCKED');
  assert.equal(zoneService('park').id, 'park');
});
