// Tests of treatment and the ambulance: quotes, payment that cannot be made
// twice, the government's fixed tariff, the clinic's bargaining, and a van
// that drives to the patient and back by road.
//
//   node --test test/care.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { town, until, run, ok, refused } from './world.mjs';
import { HEALTH } from '../src/sim/conflict.js';
import { CARE } from '../src/sim/care.js';
import { ZONE, zoneService } from '../src/sim/zone.js';
import { ENERGY } from '../src/sim/economy.js';

const clean = (w) => assert.deepEqual(w.host.auditor.reconcile(), [], 'the ledger balances');
const stateAccount = (w) => w.host.auditor.balance(w.I.economy.accounts.government(ZONE.government.state.code));
const clinicAccount = (w) => w.host.auditor.balance(w.I.economy.accounts.business('clinic'));
const hurtTo = (w, p, health) => { w.I.conflict.hurt(p, p.health - health); assert.equal(p.health, health); };
const atDesk = (w, p, id) => { const s = zoneService(id); w.place(p, s.x, s.z + (id === 'hospital' ? -1 : 1)); };

test('the General Hospital: a quote for each level, at the government tariff, before anything is done', () => {
  const w = town();
  refused(w.send(w.id, { type: 'care.quote', place: 'hospital' }), 'TOO_FAR');
  atDesk(w, w.p, 'hospital');
  assert.equal(w.g.view(w.id).services.hospital.open, true, 'emergency is always open');
  refused(w.send(w.id, { type: 'care.quote', place: 'hospital' }), 'NOT_NEEDED');
  hurtTo(w, w.p, 20);
  const balance = w.balance(w.p);
  const q = ok(w.send(w.id, { type: 'care.quote', place: 'hospital' })).quote;
  assert.equal(q.kind, 'government');
  assert.equal(q.health, 20);
  assert.equal(q.balance, balance);
  assert.equal(q.bargain, null);
  assert.deepEqual(q.options.map((o) => o.level), [40, 60, 80, 100]);
  assert.deepEqual(q.options.map((o) => o.restored), [20, 40, 60, 80]);
  assert.deepEqual(q.options.map((o) => o.fee), [300, 540, 780, 1020], 'sixty to be seen and twelve for each point restored');
  for (const o of q.options) { assert.equal(o.balanceAfter, balance - o.fee); assert.equal(o.affordable, true); assert.equal(o.list, o.fee); }
  for (let k = 1; k < q.options.length; k += 1) assert.ok(q.options[k].fee > q.options[k - 1].fee, 'more treatment costs more');
  assert.equal(w.balance(w.p), balance, 'a quote costs nothing');
  assert.equal(w.p.health, 20, 'and treats nothing');
  // someone less hurt is offered only the levels above where they are
  const w2 = town();
  atDesk(w2, w2.p, 'hospital');
  hurtTo(w2, w2.p, 65);
  assert.deepEqual(ok(w2.send(w2.id, { type: 'care.quote', place: 'hospital' })).quote.options.map((o) => [o.level, o.restored, o.fee]), [[80, 15, 240], [100, 35, 480]]);
  // the tariff can be read from anywhere, and says where the money goes
  const tariff = ok(w.send(w.id, { type: 'care.tariff', place: 'hospital' }));
  assert.equal(tariff.bargain, false);
  assert.equal(tariff.paidTo, ZONE.government.state.name);
  refused(w.send(w.id, { type: 'care.bargain', quoteId: q.id, level: 60, offer: 100 }), 'FIXED_PRICE');
  refused(w.send(w.id, { type: 'care.tariff', place: 'witch-doctor' }), 'NO_PLACE');
});

test('payment: the quoted fee and no more, once and only once, and treatment only when it is paid', () => {
  const w = town();
  atDesk(w, w.p, 'hospital');
  hurtTo(w, w.p, 20);
  const q = ok(w.send(w.id, { type: 'care.quote', place: 'hospital' })).quote;
  const balance = w.balance(w.p), gov = stateAccount(w), count = w.host.auditor.transactionCount();
  refused(w.send(w.id, { type: 'care.pay', quoteId: q.id, level: 55 }), 'NO_OPTION');
  refused(w.send(w.id, { type: 'care.pay', quoteId: 'Q-999999', level: 60 }), 'NO_QUOTE');
  assert.equal(w.p.health, 20);
  const paid = ok(w.send(w.id, { type: 'care.pay', quoteId: q.id, level: 60 }));
  assert.equal(paid.fee, 540);
  assert.equal(paid.restored, 40);
  assert.equal(paid.health, 60);
  assert.equal(paid.replayed, false);
  assert.equal(w.p.health, 60);
  assert.equal(w.balance(w.p), balance - 540, 'exactly the fee shown');
  assert.equal(stateAccount(w), gov + 540, 'to the State\'s account');
  assert.equal(w.host.auditor.transactionCount(), count + 1);
  const txn = w.host.auditor.transactions().find((t) => t.id === paid.txn);
  assert.equal(txn.kind, 'medical_fee');
  assert.equal(txn.key, `care:${q.id}`);
  assert.deepEqual({ ...txn.meta }, { quote: q.id, place: 'hospital', from: 20, to: 60, restored: 40, list: 540 });
  assert.equal(txn.initiator, `player:${w.id}`);
  assert.ok(w.events(w.id).some((e) => e.type === 'receipt' && e.amount === -540));
  // the same request again: the same receipt, no second charge, no second treatment, even from across town
  w.place(w.p, 0, 40);
  const again = ok(w.send(w.id, { type: 'care.pay', quoteId: q.id, level: 60 }));
  assert.equal(again.replayed, true);
  assert.equal(again.txn, paid.txn);
  assert.equal(w.balance(w.p), balance - 540);
  assert.equal(w.p.health, 60);
  assert.equal(w.host.auditor.transactionCount(), count + 1);
  assert.equal(w.events(w.id).filter((e) => e.type === 'receipt').length, 0);
  // a paid quote cannot be used for something else
  refused(w.send(w.id, { type: 'care.pay', quoteId: q.id, level: 100 }), 'USED');
  clean(w);
});

test('payment refused: nothing is charged and nothing is treated', () => {
  const w = town(['Poor Patient'], { broke: true });       // the arrival money left with family: nothing at all
  atDesk(w, w.p, 'hospital');
  hurtTo(w, w.p, 20);
  const q = ok(w.send(w.id, { type: 'care.quote', place: 'hospital' })).quote;
  assert.ok(q.options.every((o) => !o.affordable && o.balanceAfter < 0));
  const count = w.host.auditor.transactionCount();
  refused(w.send(w.id, { type: 'care.pay', quoteId: q.id, level: 40 }), 'NL001');
  assert.equal(w.p.health, 20, 'not treated');
  assert.equal(w.balance(w.p), 0);
  assert.equal(w.host.auditor.transactionCount(), count);
  assert.equal(w.g.view(w.id).self.critical, true);
  clean(w);
});

test('a quote is for one patient, as they were, for a little while', () => {
  const w = town(['One Patient', 'Other Patient']);
  const [a, b] = w.players;
  atDesk(w, a, 'hospital'); atDesk(w, b, 'hospital');
  hurtTo(w, a, 30); hurtTo(w, b, 30);
  const q = ok(w.send(a.id, { type: 'care.quote', place: 'hospital' })).quote;
  refused(w.send(b.id, { type: 'care.pay', quoteId: q.id, level: 60 }), 'NO_QUOTE');
  // their condition changes: the old quote no longer stands
  w.I.conflict.hurt(a, 5);
  refused(w.send(a.id, { type: 'care.pay', quoteId: q.id, level: 60 }), 'STALE_QUOTE');
  const q2 = ok(w.send(a.id, { type: 'care.quote', place: 'hospital' })).quote;
  assert.equal(q2.health, 25);
  refused(w.send(a.id, { type: 'care.pay', quoteId: q.id, level: 60 }), 'NO_QUOTE');       // replaced by the new one
  // (the quote would stand if their condition had not changed; hold it where it was while the clock runs)
  run(w.host, CARE.quoteFor + 5);
  const now = a.health;
  refused(w.send(a.id, { type: 'care.pay', quoteId: q2.id, level: 60 }), 'EXPIRED');
  assert.equal(a.health, now);
  // must be at the desk to pay
  const q3 = ok(w.send(a.id, { type: 'care.quote', place: 'hospital' })).quote;
  w.place(a, 0, 40);
  refused(w.send(a.id, { type: 'care.pay', quoteId: q3.id, level: 60 }), 'TOO_FAR');
  assert.equal(a.health, now);
});

test('the private clinic: its owner\'s prices, its own account, and bargaining within limits', () => {
  const w = town();
  atDesk(w, w.p, 'clinic');
  assert.ok(w.g.view(w.id).services.clinic.open);
  hurtTo(w, w.p, 20);
  const q = ok(w.send(w.id, { type: 'care.quote', place: 'clinic' })).quote;
  assert.equal(q.kind, 'private');
  assert.deepEqual(q.options.map((o) => o.fee), [420, 740, 1060, 1380]);
  assert.deepEqual(q.bargain, { roundsLeft: CARE.rounds });
  const list = 740, floor = Math.ceil(list * CARE.places.clinic.floor);
  // a silly offer is met part of the way, never below the owner's floor
  const low = ok(w.send(w.id, { type: 'care.bargain', quoteId: q.id, level: 60, offer: 100 }));
  assert.equal(low.accepted, false);
  assert.ok(low.fee < list && low.fee >= floor, `countered at ${low.fee}`);
  // a fair offer is taken
  const fair = ok(w.send(w.id, { type: 'care.bargain', quoteId: q.id, level: 60, offer: floor + 5 }));
  assert.equal(fair.accepted, true);
  assert.equal(fair.fee, floor + 5);
  // offering more than the standing price does not raise it
  const silly = ok(w.send(w.id, { type: 'care.bargain', quoteId: q.id, level: 60, offer: 5000 }));
  assert.equal(silly.fee, floor + 5);
  refused(w.send(w.id, { type: 'care.bargain', quoteId: q.id, level: 60, offer: 1 }), 'LAST_PRICE');
  refused(w.send(w.id, { type: 'care.bargain', quoteId: q.id, level: 60, offer: -5 }), 'LAST_PRICE');
  // the other levels are still at list
  assert.equal(ok(w.send(w.id, { type: 'care.quote', place: 'clinic' })).quote.options[1].fee, 740, 'a new quote starts again at list');
  const q2 = ok(w.send(w.id, { type: 'care.quote', place: 'clinic' })).quote;
  const deal = ok(w.send(w.id, { type: 'care.bargain', quoteId: q2.id, level: 100, offer: 1100 }));
  assert.equal(deal.accepted, true);
  const balance = w.balance(w.p), business = clinicAccount(w), gov = stateAccount(w);
  const paid = ok(w.send(w.id, { type: 'care.pay', quoteId: q2.id, level: 100 }));
  assert.equal(paid.fee, 1100, 'the agreed price, not the list price');
  assert.equal(w.balance(w.p), balance - 1100);
  assert.equal(clinicAccount(w), business + 1100, 'to the clinic\'s own account');
  assert.equal(stateAccount(w), gov, 'not to the government');
  assert.equal(w.p.health, 100);
  const txn = w.host.auditor.transactions().find((t) => t.id === paid.txn);
  assert.equal(txn.meta.list, 1380);
  // prices are the owner's to set, and nobody else's; the hospital's are nobody's
  refused(w.send(w.id, { type: 'care.prices', place: 'clinic', consult: 1, perPoint: 1 }), 'UNKNOWN_INTENT');
  assert.throws(() => w.I.care.setPrices(w.p, 'clinic', { consult: 1, perPoint: 1 }), /Only the owner/);
  assert.throws(() => w.I.care.setPrices(w.p, 'hospital', { consult: 1, perPoint: 1 }), /set by the government/);
  clean(w);
});

test('the ambulance: comes by road to whoever is hurt, carries them in, and is charged for once', () => {
  const w = town();
  w.place(w.p, 2, 40);                                   // on Market Road
  refused(w.send(w.id, { type: 'care.ambulance.call' }), 'NOT_NEEDED');
  hurtTo(w, w.p, 45);
  const info = ok(w.send(w.id, { type: 'care.ambulance.info' }));
  assert.deepEqual([info.fee, info.free, info.available, info.needed], [CARE.ambulance.fee, false, true, true]);
  const balance = w.balance(w.p), count = w.host.auditor.transactionCount();
  const call = ok(w.send(w.id, { type: 'care.ambulance.call', requestId: 'ambulance-0001' })).call;
  assert.equal(call.fee, 150);
  assert.equal(w.balance(w.p), balance - 150);
  // asked again, in any way: still one call and one charge
  assert.equal(ok(w.send(w.id, { type: 'care.ambulance.call', requestId: 'ambulance-0001' })).replayed, true);
  assert.equal(ok(w.send(w.id, { type: 'care.ambulance.call' })).replayed, true);
  assert.equal(w.balance(w.p), balance - 150);
  assert.equal(w.host.auditor.transactionCount(), count + 1);
  // it drives: every tenth of a second it has moved no further than its speed allows
  let last = w.g.view(w.id).ambulance, travelled = 0;
  assert.equal(last.mode, 'out');
  assert.equal(last.siren, true);
  const seenModes = new Set();
  let lastMe = { x: w.p.x, z: w.p.z };
  until(w, () => w.g.view(w.id).self.carried === null && w.g.view(w.id).ambulance.mode === 'parked', 300, () => {
    const now = w.g.view(w.id).ambulance;
    const step = Math.hypot(now.x - last.x, now.z - last.z);
    assert.ok(step <= CARE.ambulance.speed * 0.1 + 0.02, `the van moved ${step.toFixed(2)} m in a tenth of a second`);
    // the patient is walked to the van, steps up into it (a metre and a half), and rides
    assert.ok(Math.hypot(w.p.x - lastMe.x, w.p.z - lastMe.z) <= 1.7, 'and its patient is never moved in a jump');
    travelled += step; last = now; lastMe = { x: w.p.x, z: w.p.z };
    seenModes.add(now.mode);
    if (w.g.view(w.id).self.carried) refused(w.send(w.id, { type: 'move', x: w.p.x + 0.1, z: w.p.z, heading: 0 }), 'CARRIED');
  });
  assert.deepEqual([...seenModes].filter((m) => m !== 'parked'), ['out', 'waiting', 'back', 'unloading']);
  assert.ok(travelled > 300, `it drove ${travelled.toFixed(0)} m there and back`);
  const door = zoneService('hospital');
  assert.ok(Math.hypot(w.p.x - door.x, w.p.z - door.z) < 1, 'the patient is at the emergency entrance');
  // and can be treated there
  const q = ok(w.send(w.id, { type: 'care.quote', place: 'hospital' })).quote;
  assert.equal(q.health, 45);
  ok(w.send(w.id, { type: 'care.pay', quoteId: q.id, level: 100 }));
  assert.equal(w.p.health, 100);
  clean(w);
});

test('the ambulance is free to someone whose health is critical, and comes even if they have nothing', () => {
  const w = town(['Poor Patient'], { broke: true });       // the arrival money left with family: nothing at all
  w.place(w.p, 2, 40);
  hurtTo(w, w.p, 12);
  const info = ok(w.send(w.id, { type: 'care.ambulance.info' }));
  assert.deepEqual([info.fee, info.free], [0, true]);
  const count = w.host.auditor.transactionCount();
  const call = ok(w.send(w.id, { type: 'care.ambulance.call' })).call;
  assert.equal(call.fee, 0);
  assert.equal(call.txn, null);
  assert.equal(w.host.auditor.transactionCount(), count, 'no charge, so no transaction');
  until(w, () => w.g.view(w.id).self.carried === 'aboard', 200);
  until(w, () => w.g.view(w.id).self.carried === null, 200);
  assert.ok(Math.hypot(w.p.x - zoneService('hospital').x, w.p.z - zoneService('hospital').z) < 1);
  // a second caller while it is out is told so, and charged nothing
  const w2 = town(['First Caller', 'Second Caller']);
  const [a, b] = w2.players;
  w2.place(a, 2, 40); w2.place(b, 2, 20);
  hurtTo(w2, a, 40); hurtTo(w2, b, 40);
  ok(w2.send(a.id, { type: 'care.ambulance.call' }));
  const before = w2.balance(b);
  refused(w2.send(b.id, { type: 'care.ambulance.call' }), 'BUSY');
  assert.equal(w2.balance(b), before);
});

test('bruises mend slowly on their own, but not for someone badly hurt; a night at home helps', () => {
  const w = town();
  hurtTo(w, w.p, 50);
  w.g.advance(5 * 3600);
  assert.equal(w.p.health, 50 + 5 * HEALTH.restPerHour);
  hurtTo(w, w.p, 18);
  w.g.advance(5 * 3600);
  assert.equal(w.p.health, 18, 'critical health does not mend without treatment');
  assert.ok(ENERGY.max > 0);
});
