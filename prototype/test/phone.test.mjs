// Tests of the phone (contacts, calls, messages, the way to a place, help
// with a fine) and of taking a vehicle that is not yours.
//
//   node --test test/phone.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { town, standing, until, assault, run, ok, refused, post, whereIs, farFromPolice } from './world.mjs';
import { LAW } from '../src/sim/justice.js';
import { HIJACK, driverSide } from '../src/sim/hijack.js';
import { MOTO } from '../src/sim/okada.js';
import { zoneService, zoneResident, ZONE_RESIDENTS, ZONE_VEHICLE_BAYS } from '../src/sim/zone.js';

const MARKET = [8, 58];
const clean = (w) => assert.deepEqual(w.host.auditor.reconcile(), [], 'the ledger balances');
const timid = (w) => standing(w, ...MARKET, { not: ['police'] }).find((a) => a.nerve < 0.4 && a.who.age < 55);
const contactsOf = (w, id) => ok(w.send(id, { type: 'phone.contacts' })).contacts;
const inCustody = (w, p) => { assault(w, p, timid(w)); until(w, () => p.law.state === 'custody', 600); return w.g.view(p.id).self.law.arrest; };

test('contacts: emergency numbers and the town\'s businesses from the start; people as they are met', () => {
  const w = town(['Ada Caller', 'Bola Friend']);
  const [a, b] = w.players;
  const first = contactsOf(w, a.id);
  assert.deepEqual(first.filter((c) => c.kind === 'emergency').map((c) => c.key), ['svc:police', 'svc:hospital']);
  assert.ok(first.filter((c) => c.kind === 'business').length >= 7);
  assert.equal(first.filter((c) => c.kind === 'person' || c.kind === 'friend').length, 0);
  // someone in town spoken to is a contact from then on
  const r = ZONE_RESIDENTS.map((x) => ({ x, live: w.I.residents.get(x.id) })).find((e) => e.live.mode === 'at');
  w.place(a, r.live.x + 1, r.live.z);
  ok(w.send(a.id, { type: 'talk', residentId: r.x.id }));
  assert.ok(contactsOf(w, a.id).some((c) => c.key === `res:${r.x.id}` && c.name === r.x.name));
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
  // a player who saw an offence reports it by phone
  const w2 = town(['Wale Wrong', 'Sade Saw']);
  const [x, s] = w2.players;
  const victim = timid(w2);
  w2.place(s, victim.x + 4, victim.z + 1);
  assault(w2, x, victim);
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
  const w = town(['Wale Held', 'Femi Friend']);
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
  const w = town(['Ngozi Constable', 'Wale Held']);
  const [n, x] = w.players;
  w.place(n, post().x, post().z - 1);
  ok(w.send(n.id, { type: 'police.enlist' }));
  assault(w, x, farFromPolice(w, standing(w, ...MARKET, { range: 500, not: ['police'] })).find((a) => a.nerve < 0.4 && a.who.age < 55));
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

test('someone in town who knows the player will walk to the Police Post and pay; the money is then owed to them', () => {
  const w = town(['Wale Held']);
  const x = w.p;
  const r = ZONE_RESIDENTS.map((e) => ({ e, live: w.I.residents.get(e.id) })).find((e) => e.live.mode === 'at' && !['sergeant', 'corporal'].includes(e.e.id) && Math.hypot(e.live.x - post().x, e.live.z - post().z) > 40);
  w.place(x, r.live.x + 1, r.live.z);
  ok(w.send(x.id, { type: 'talk', residentId: r.e.id }));
  const key = `res:${r.e.id}`;
  refused(w.send(x.id, { type: 'phone.askSurety', key }), 'NOT_IN_CUSTODY');
  const arrest = inCustody(w, x);
  refused(w.send(x.id, { type: 'phone.askSurety', key }), 'NOT_ALLOWED');
  ok(w.send(x.id, { type: 'custody.requestCall' }));
  until(w, () => w.g.view(x.id).self.law.arrest.call.status === 'allowed', 10);
  const wallet = w.I.economy.accounts.resident(r.e.id);
  const theirs = w.host.auditor.balance(wallet), mine = w.balance(x), fine = LAW.offences.assault.fine;
  const asked = ok(w.send(x.id, { type: 'phone.askSurety', key }));
  assert.equal(asked.agreed, true, asked.said);
  assert.equal(w.g.view(x.id).self.phone.surety, r.e.name);
  refused(w.send(x.id, { type: 'phone.askSurety', key }), 'ASKED');
  // they walk there: every step a step
  let last = { x: r.live.x, z: r.live.z };
  const took = until(w, () => x.law.state === 'released', 900, () => { const live = w.I.residents.get(r.e.id); assert.ok(Math.hypot(live.x - last.x, live.z - last.z) < 0.5); last = { x: live.x, z: live.z }; });
  assert.ok(took > 10, `it took them ${took.toFixed(0)} s to get there`);
  assert.equal(w.host.auditor.balance(wallet), theirs - fine, 'out of their own pocket');
  assert.equal(w.balance(x), mine, 'and not the prisoner\'s');
  const debts = w.g.view(x.id).self.phone.debts;
  assert.equal(debts.length, 1);
  assert.deepEqual([debts[0].to, debts[0].amount, debts[0].left], [r.e.name, fine, fine]);
  assert.equal(w.g.intent(x.id, { type: 'police.status' }).record.arrests[0].payment.paidBy, r.e.name);
  assert.equal(arrest.fine.amount, fine);
  // nothing is taken back without the player choosing to repay; part now, the rest later
  run(w.host, 120);
  assert.equal(w.balance(x), mine);
  const part = ok(w.send(x.id, { type: 'phone.repay', debtId: debts[0].id, amount: 8 }));
  assert.deepEqual([part.paid, part.left], [8, fine - 8]);
  const rest = ok(w.send(x.id, { type: 'phone.repay', debtId: debts[0].id }));
  assert.deepEqual([rest.paid, rest.left], [fine - 8, 0]);
  assert.equal(w.balance(x), mine - fine);
  assert.equal(w.host.auditor.balance(wallet), theirs);
  refused(w.send(x.id, { type: 'phone.repay', debtId: debts[0].id }), 'NO_DEBT');
  clean(w);
});

test('someone still owed money will not stand a second fine', () => {
  const w = town(['Wale Held']);
  const x = w.p;
  const r = ZONE_RESIDENTS.map((e) => ({ e, live: w.I.residents.get(e.id) })).find((e) => e.live.mode === 'at' && !['sergeant', 'corporal'].includes(e.e.id));
  w.place(x, r.live.x + 1, r.live.z);
  ok(w.send(x.id, { type: 'talk', residentId: r.e.id }));
  inCustody(w, x);
  ok(w.send(x.id, { type: 'custody.requestCall' }));
  until(w, () => w.g.view(x.id).self.law.arrest.call.status === 'allowed', 10);
  ok(w.send(x.id, { type: 'phone.askSurety', key: `res:${r.e.id}` }));
  until(w, () => x.law.state === 'released', 900);
  run(w.host, LAW.released + 2);
  inCustody(w, x);
  ok(w.send(x.id, { type: 'custody.requestCall' }));
  until(w, () => w.g.view(x.id).self.law.arrest.call.status === 'allowed', 10);
  const again = ok(w.send(x.id, { type: 'phone.askSurety', key: `res:${r.e.id}` }));
  assert.equal(again.agreed, false);
  assert.match(again.said, /not paid back/);
  assert.equal(zoneResident(r.e.id).name, r.e.name);
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
  const w = town();
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
  const w = town();
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
  const started = ok(w.send(w.id, { type: 'hijack.start', vehicle: v.id })).hijack;
  assert.deepEqual([started.kind, started.step], ['keke', 'door']);
  assert.equal(w.g.view(w.id).self.driving, null);
  const took = until(w, () => !!w.g.view(w.id).self.driving, 5);
  assert.ok(Math.abs(took - HIJACK.keke.steps[1][1]) < 0.25);
  assert.equal(w.g.view(w.id).self.driving.id, v.id);
  const crime = Object.values(w.g.state.justice.crimes)[0];
  assert.deepEqual([crime.type, crime.vehicle], ['vehicle_theft', v.id]);
  assert.equal(crime.detection, 'identified', 'the dealer was at his desk and saw it');
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
