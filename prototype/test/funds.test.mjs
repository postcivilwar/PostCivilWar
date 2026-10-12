// Starter TR and earned TR, as the town itself keeps them (src/sim/funds.js), and the paid character upgrade.
// Everything is done the way a client does it, by sending intents; money is only ever put into a wallet the way
// the game puts it there (a wage, a theft, the bank bringing the wallet into step).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { town, standing, beside, ok, refused, run } from './world.mjs';
import { createHost } from '../src/sim/host.js';
import { ARRIVAL_FUNDS, UPGRADE, upgradeFee } from '../src/sim/sim.js';
import { classOf, applyFunds, FUND_WORDS } from '../src/sim/funds.js';
import { BUSINESSES } from '../src/sim/economy.js';
import { VEHICLE_KINDS } from '../src/sim/vehicles.js';
import { TR } from '../src/sim/ledger.js';
import { zoneService, ZONE_PARCELS, ZONE_MOULD_STATIONS } from '../src/sim/zone.js';

const funds = (w, id = w.id) => w.g.view(id).self.funds;
const at = (w, service, p = w.p) => { const s = zoneService(service); w.place(p, s.x, s.z); };
// TR as the bank would add it: received from someone, so it is earned TR and not starter
const earn = (w, units, id = w.id) => { const have = w.g.view(id).self.balance; const r = w.host.bank.report(id); ok(w.host.bank.align(id, have + units + r.spent - r.earned, 'Earned')); };
const sound = (w) => assert.deepEqual(w.host.auditor.reconcile(), [], 'the ledger balances');
const whole = (w, id = w.id) => { const f = funds(w, id); assert.equal(f.starter + f.earned + f.illicit, f.total); assert.equal(f.eligible, f.earned + f.illicit); assert.equal(f.total, w.g.view(id).self.balance); assert.ok(f.starter >= 0 && f.earned >= 0 && f.illicit >= 0); return f; };

test('what a payment is, is read from the ledger\'s own record of it', () => {
  const out = (txn) => classOf(txn, -1), into = (txn) => classOf(txn, 1);
  assert.equal(into({ key: 'arrival:p-0001', kind: 'issuance' }), 'starter');
  assert.equal(into({ key: 'sim:4:wage', kind: 'wage' }), 'lawful');
  assert.equal(into({ key: 'run:r-3', kind: 'wage' }), 'lawful');
  assert.equal(into({ key: 'theft:c-9', kind: 'theft' }), 'illicit');
  assert.equal(out({ key: 'theft:c-9', kind: 'theft' }), 'taken');
  assert.equal(into({ key: 'bank:align:p-0001:1:40', kind: 'issuance' }), 'bank');
  // charges: a fine, the ambulance, the hospital, a permit, a debt for a fine someone else paid
  for (const txn of [{ key: 'fine:a-1', kind: 'fine' }, { key: 'ambulance:c-1', kind: 'medical_fee' }, { key: 'care:q-1', kind: 'medical_fee' }, { key: 'permit:x:house', kind: 'government_fee' }, { key: 'repay:d-1:1', kind: 'transfer' }, { key: 'sim:9:goods_purchase', kind: 'goods_purchase', meta: { service: 'treatment' } }]) assert.equal(out(txn), 'fee', txn.key);
  // living: a plate of food, a fare, a day's hire, petrol, a course
  for (const txn of [{ key: 'sim:3:goods_purchase', kind: 'goods_purchase', meta: { item: 'meal', qty: 1 } }, { key: 'okada:5:p-0001', kind: 'transfer' }, { key: 'hire:v-1:p-0001:900', kind: 'goods_purchase' }, { key: 'fuel:v-1:2', kind: 'goods_purchase' }, { key: 'sim:8:goods_purchase', kind: 'goods_purchase', meta: { service: 'course' } }]) assert.equal(out(txn), 'living', txn.key);
  // things to own: land, a keke, what a building is made of, the mason who raises it
  for (const txn of [{ key: 'land:NG-1:p-0001', kind: 'land_purchase' }, { key: 'vehicle:3:p-0001', kind: 'goods_purchase' }, { key: 'sim:5:goods_purchase', kind: 'goods_purchase', meta: { item: 'block', qty: 40 } }, { key: 'sim:6:wage', kind: 'wage' }]) assert.equal(out(txn), 'asset', txn.key);
  assert.equal(out({ key: 'restitution:c-9:a-1', kind: 'restitution' }), 'restitution');
  assert.equal(out({ key: 'upgrade:p-0001:1', kind: 'government_fee' }), 'upgrade');
});

test('the order TR is drawn in: charges from starter first; things to own never from starter; what was taken is handed back first', () => {
  // the owner's own example: 2,000 TR of starter and 700 TR earned
  const f = { bal: 2700 * TR, starter: 2000 * TR, illicit: 0 };
  applyFunds(f, 'fee', -300 * TR);                       // a 300 TR fine
  assert.deepEqual(f, { bal: 2400 * TR, starter: 1700 * TR, illicit: 0 }, 'the fine came out of starter TR; the 700 earned are untouched');
  assert.equal(f.bal - f.starter - f.illicit, 700 * TR);
  applyFunds(f, 'asset', -500 * TR);                     // a 500 TR vehicle
  assert.deepEqual(f, { bal: 1900 * TR, starter: 1700 * TR, illicit: 0 }, 'the vehicle came out of earned TR only');
  // a charge larger than the starter TR left goes on into earned, then into what was taken
  const g = { bal: 150, starter: 50, illicit: 40 };
  assert.deepEqual(applyFunds(g, 'fee', -120), { starter: -50, earned: -60, illicit: -10 });
  assert.deepEqual(g, { bal: 30, starter: 0, illicit: 30 });
  // restitution: what was taken first
  const h = { bal: 300, starter: 100, illicit: 80 };
  assert.deepEqual(applyFunds(h, 'restitution', -100), { starter: -20, earned: 0, illicit: -80 });
  // coming in: arrival money is starter, a theft is illicit, everything else is earned
  const k = { bal: 0, starter: 0, illicit: 0 };
  applyFunds(k, 'starter', 4000); applyFunds(k, 'lawful', 50); applyFunds(k, 'illicit', 30);
  assert.deepEqual(k, { bal: 4080, starter: 4000, illicit: 30 });
});

test('a new arrival: all 2,000 TR is starter TR; it pays for a meal and a fare, and buys nothing to own', () => {
  const w = town(['Ada Newcomer'], { funded: false, hour: 10 });
  assert.deepEqual(whole(w), { total: ARRIVAL_FUNDS, starter: ARRIVAL_FUNDS, earned: 0, illicit: 0, eligible: 0 });
  // a plate of food: starter TR pays
  at(w, 'kitchen');
  ok(w.send(w.id, { type: 'eat' }));
  assert.equal(whole(w).starter, ARRIVAL_FUNDS - BUSINESSES.kitchen.sells.meal);
  assert.equal(funds(w).earned, 0);
  // building blocks, carried away or delivered: a thing to own. Refused, and in the words that say why.
  const before = w.g.view(w.id).self.balance;
  at(w, 'yard');
  const no = w.send(w.id, { type: 'shop.buy', businessId: 'yard', item: 'block', qty: 10, carry: null, parcelId: null });
  assert.equal(no.ok, false);
  // (with nowhere to deliver to that is what it is told first; the money is the next thing asked)
  assert.ok(['NO_DELIVERY_ADDRESS', 'STARTER_FUNDS'].includes(no.code));
  assert.equal(w.g.view(w.id).self.balance, before, 'nothing was taken');
  sound(w);
});

test('a keke: with 2,000 TR of starter and enough earned TR to make up the price between them, it is still refused; earned TR alone buys it', () => {
  const w = town(['Bayo Driver'], { funded: false, hour: 10 });
  const k = VEHICLE_KINDS.keke, price = k.price + k.registration;
  earn(w, price - 1000);                                  // total is now well over the price; eligible is 1,000 units short
  assert.ok(funds(w).total > price && funds(w).eligible < price);
  at(w, 'park');
  const no = w.send(w.id, { type: 'vehicle.buy' });
  assert.equal(no.ok, false);
  assert.equal(no.code, 'ELIGIBLE_FUNDS');
  assert.ok(no.message.startsWith(FUND_WORDS.short), no.message);
  assert.ok(no.message.includes(FUND_WORDS.asset), 'and it says why: starter TR does not buy assets');
  assert.ok(!/do not have enough TR for that/.test(no.message), 'it does not say the balance is too small: it is not');
  assert.equal(w.g.view(w.id).self.vehicles.length, 0);
  assert.equal(funds(w).starter, ARRIVAL_FUNDS);
  // the last 1,000 units earned: now it is bought, out of earned TR, and the starter TR is all still there
  earn(w, 1000);
  ok(w.send(w.id, { type: 'vehicle.buy' }));
  assert.deepEqual(whole(w), { total: ARRIVAL_FUNDS, starter: ARRIVAL_FUNDS, earned: 0, illicit: 0, eligible: 0 });
  assert.equal(w.g.view(w.id).self.vehicles.length, 1);
  // the day's hire of another, and petrol, are costs: starter TR pays them
  sound(w);
});

test('land: only starter TR and it is refused with the reason; a wage is earned TR; the plot is bought out of earned TR', () => {
  const w = town(['Chidi Builder'], { funded: false, hour: 10 });
  const parcel = ZONE_PARCELS.slice().sort((a, b) => a.price - b.price)[0];
  const cost = w.I.registry.quote(parcel.id).total;
  assert.ok(cost > ARRIVAL_FUNDS, 'a plot costs more than the arrival money');
  // a wage at the block yard is earned TR
  const station = ZONE_MOULD_STATIONS[0];
  w.place(w.p, station.standX, station.standZ);
  for (let i = 0; i < 2; i += 1) { run(w.host, 1.3); ok(w.send(w.id, { type: 'job.mould', stationId: station.id })); }
  assert.equal(whole(w).earned, 2 * BUSINESSES.yard.wagePerBlock);
  assert.equal(funds(w).starter, ARRIVAL_FUNDS);
  // enough in the wallet altogether, not enough of it earned
  earn(w, cost - ARRIVAL_FUNDS);
  assert.ok(funds(w).total >= cost && funds(w).eligible < cost);
  at(w, 'registry');
  const no = w.send(w.id, { type: 'registry.buy', parcelId: parcel.id });
  assert.equal(no.code, 'ELIGIBLE_FUNDS');
  assert.equal(w.I.registry.record(parcel.id).status, 'available', 'the plot is still for sale');
  earn(w, ARRIVAL_FUNDS);
  const earnedBefore = funds(w).earned;
  ok(w.send(w.id, { type: 'registry.buy', parcelId: parcel.id }));
  assert.equal(whole(w).starter, ARRIVAL_FUNDS, 'not a unit of starter TR went on the plot');
  assert.equal(funds(w).earned, earnedBefore - cost);
  // the permit is a government fee: starter TR pays it
  at(w, 'secretariat');
  const permit = w.send(w.id, { type: 'permit.apply', parcelId: parcel.id, designId: 'house' });
  if (permit.ok) assert.ok(whole(w).starter < ARRIVAL_FUNDS, 'the permit fee came out of starter TR');
  sound(w);
});

test('nothing in the wallet but starter TR: the words are the ones for starter TR, not "not enough"', () => {
  const w = town(['Dayo Short'], { funded: false, hour: 10 });
  const fresh = w.host.game.funds;
  assert.throws(() => fresh.mayPay(w.id, 1000, 'asset'), (error) => error.code === 'STARTER_FUNDS' && error.message === FUND_WORDS.asset);
  assert.doesNotThrow(() => fresh.mayPay(w.id, 1000, 'fee'));
  assert.doesNotThrow(() => fresh.mayPay(w.id, 1000, 'living'));
  // more than the whole wallet: that is the ledger's to refuse, in its own words
  assert.doesNotThrow(() => fresh.mayPay(w.id, ARRIVAL_FUNDS + 1, 'asset'));
});

test('what is taken from someone is kept apart: it is not starter TR, it is handed back first, and it never becomes starter TR', () => {
  const w = town(['Emeka Light'], { funded: false, hour: 10 });
  let got = null;
  for (const a of standing(w, 8, 58, { range: 120, not: ['police'] })) {
    beside(w, w.p, a, { behind: true, metres: 0.9 });
    const r = w.send(w.id, { type: 'crime.steal', target: { kind: 'npc', id: a.i } });
    if (r.ok && r.taken > 0) { got = r; break; }
  }
  assert.ok(got, 'a pocket was picked');
  const f = whole(w);
  assert.equal(f.illicit, got.taken);
  assert.equal(f.starter, ARRIVAL_FUNDS, 'the arrival money is what it was');
  assert.equal(f.eligible, got.taken, 'what was taken can be spent as earned TR can');
  const r = w.host.bank.report(w.id);
  assert.deepEqual(r.in, { lawful: 0, illicit: got.taken }, 'and the bank is told it for what it is');
  sound(w);
});

test('between two players in one town: what a thief takes from another player stays what it was', () => {
  const w = town(['Femi Thief', 'Gozie Victim'], { funded: false, hour: 10 });
  const [t, v] = w.players;
  // the victim has only arrival money: whatever is taken from it is starter TR, and is starter TR in the thief's wallet too
  w.place(v, 8, 58, 0); w.place(t, 8, 57.1, 0);
  let taken = 0;
  for (let i = 0; i < 6 && !taken; i += 1) { const r = w.send(t.id, { type: 'crime.steal', target: { kind: 'player', id: v.id } }); if (r.ok) taken = r.taken || 0; else break; }
  if (taken > 0) {
    const thief = whole(w, t.id), victim = whole(w, v.id);
    assert.equal(victim.starter, ARRIVAL_FUNDS - taken);
    assert.equal(thief.starter, ARRIVAL_FUNDS + taken, 'starter TR that changed hands is still starter TR');
    assert.equal(thief.eligible, 0, 'and nothing of it can be sent on or spent on a thing to own');
  }
  sound(w);
});

test('the bank\'s word on what a wallet is made of is the one that stands, with what has happened in town since on top of it', () => {
  const w = town(['Halima Bank'], { funded: false, hour: 10 });
  const station = ZONE_MOULD_STATIONS[0];
  w.place(w.p, station.standX, station.standZ);
  run(w.host, 1.3); ok(w.send(w.id, { type: 'job.mould', stationId: station.id }));
  const first = w.host.bank.report(w.id);
  assert.deepEqual({ in: first.in, out: first.out }, { in: { lawful: BUSINESSES.yard.wagePerBlock, illicit: 0 }, out: { cost: 0, restitution: 0, asset: 0 } });
  // the bank takes that report, and says: 4,025 units, of which 3,000 are starter TR (someone has been paying fines)
  w.host.bank.told(w.id, first.upto);
  ok(w.host.bank.align(w.id, 4025, 'The bank', { starter: 3000, illicit: 0 }));
  assert.deepEqual(whole(w), { total: 4025, starter: 3000, earned: 1025, illicit: 0, eligible: 1025 });
  // one more block, not yet told to the bank; then the bank says 500 TR arrived from someone
  run(w.host, 1.3); ok(w.send(w.id, { type: 'job.mould', stationId: station.id }));
  ok(w.host.bank.align(w.id, 4025 + 1000, 'Received', { starter: 3000, illicit: 0 }));
  assert.deepEqual(whole(w), { total: 5025 + BUSINESSES.yard.wagePerBlock, starter: 3000, earned: 2025 + BUSINESSES.yard.wagePerBlock, illicit: 0, eligible: 2025 + BUSINESSES.yard.wagePerBlock });
  // all of it is kept with a saved game
  const again = createHost({ saved: JSON.parse(JSON.stringify(w.host.save())) });
  assert.deepEqual(again.game.view(w.id).self.funds, funds(w));
  sound(w);
});

test('a game saved before starter TR was kept apart: its history is read, and nothing in the wallet changes', () => {
  const w = town(['Ifeoma Old'], { funded: false, hour: 10 });
  at(w, 'kitchen'); ok(w.send(w.id, { type: 'eat' }));
  const station = ZONE_MOULD_STATIONS[0];
  w.place(w.p, station.standX, station.standZ);
  run(w.host, 1.3); ok(w.send(w.id, { type: 'job.mould', stationId: station.id }));
  const saved = JSON.parse(JSON.stringify(w.host.save()));
  delete saved.game.funds;                               // as a save from before this was written
  const old = createHost({ saved });
  const f = old.game.view(w.id).self.funds;
  assert.equal(f.total, w.g.view(w.id).self.balance, 'the balance is what it was');
  assert.deepEqual(f, { total: f.total, starter: ARRIVAL_FUNDS - BUSINESSES.kitchen.sells.meal, earned: BUSINESSES.yard.wagePerBlock, illicit: 0, eligible: BUSINESSES.yard.wagePerBlock });
});

// ---- the character: chosen once, looked at freely, changed only by a paid upgrade ----

const arrive = (figure = 'W1') => {
  const host = createHost();
  const id = host.game.join({ name: 'Kemi Chosen', look: { figure }, path: 'hero' });
  const p = host.game.state.players[id];
  const send = (message) => host.game.intent(id, message);
  const give = (units) => { const have = host.game.view(id).self.balance; const r = host.bank.report(id); ok(host.bank.align(id, have + units + r.spent - r.earned, 'Earned')); };
  return { host, id, p, send, give, self: () => host.game.view(id).self };
};

test('an upgrade is not offered at 2,000 TR or below, and above it only if the fee can be paid in earned TR', () => {
  const c = arrive('W1');
  assert.equal(c.self().look.figure, 'W1');
  let q = ok(c.send({ type: 'character.quote', figure: 'M1' })).quote;
  assert.equal(q.ok, false); assert.equal(q.code, 'BALANCE');
  assert.equal(q.total, ARRIVAL_FUNDS, 'exactly 2,000 TR does not qualify');
  refused(c.send({ type: 'character.upgrade', figure: 'M1' }), 'BALANCE');
  // above 2,000 TR by a little: it qualifies to be looked at, but a quarter of the wallet is more than was earned
  c.give(400 * TR);                                       // 2,400 TR: the fee is 600 TR and only 400 TR is earned
  q = ok(c.send({ type: 'character.quote', figure: 'M1' })).quote;
  assert.deepEqual({ total: q.total, fee: q.fee, after: q.after, eligible: q.eligible, ok: q.ok, code: q.code }, { total: 2400 * TR, fee: 600 * TR, after: 1800 * TR, eligible: 400 * TR, ok: false, code: 'ELIGIBLE_FUNDS' });
  assert.ok(q.message.startsWith(FUND_WORDS.short));
  refused(c.send({ type: 'character.upgrade', figure: 'M1' }), 'ELIGIBLE_FUNDS');
  assert.equal(c.self().look.figure, 'W1', 'nothing changed');
  assert.equal(c.self().balance, 2400 * TR, 'and nothing was charged');
  // the same character, or one that does not exist
  assert.equal(ok(c.send({ type: 'character.quote', figure: 'W1' })).quote.code, 'SAME');
  assert.equal(ok(c.send({ type: 'character.quote', figure: 'X9' })).quote.code, 'NO_CHARACTER');
  refused(c.send({ type: 'character.upgrade', figure: 'W1' }), 'SAME');
});

test('the fee is a quarter of everything in the wallet, exactly, and it is paid in earned TR only', () => {
  for (const [total, fee] of [[2400, 600], [4000, 1000], [8000, 2000], [12000, 3000]]) assert.equal(upgradeFee(total * TR), fee * TR, `${total} TR`);
  assert.equal(upgradeFee(4801), 1200, 'to the half TR, rounded down');
  assert.equal(UPGRADE.above, ARRIVAL_FUNDS);
  const c = arrive('W1');
  c.give(2000 * TR);                                      // 4,000 TR: 2,000 starter, 2,000 earned; the fee is 1,000 TR
  const where = { x: c.p.x, z: c.p.z, name: c.p.name, path: c.p.path };
  const q = ok(c.send({ type: 'character.quote', figure: 'M1' })).quote;
  assert.deepEqual({ ok: q.ok, from: q.from, to: q.to, total: q.total, fee: q.fee, after: q.after }, { ok: true, from: 'W1', to: 'M1', total: 4000 * TR, fee: 1000 * TR, after: 3000 * TR });
  // a client that names its own price is not believed
  refused(c.send({ type: 'character.upgrade', figure: 'M1', fee: 1 }), 'QUOTE_CHANGED');
  assert.equal(c.self().look.figure, 'W1');
  const done = ok(c.send({ type: 'character.upgrade', figure: 'M1', fee: q.fee, requestId: 'upgrade-request-01' }));
  assert.equal(done.upgrade.fee, 1000 * TR);
  assert.equal(done.balance, 3000 * TR);
  assert.equal(c.self().look.figure, 'M1');
  assert.deepEqual(c.self().funds, { total: 3000 * TR, starter: 2000 * TR, earned: 1000 * TR, illicit: 0, eligible: 1000 * TR }, 'the starter TR is all still there');
  assert.deepEqual({ x: c.p.x, z: c.p.z, name: c.p.name, path: c.p.path }, where, 'the player is who and where they were');
  // asked again under the same request: the first answer, and nothing charged twice
  const again = c.send({ type: 'character.upgrade', figure: 'M1', fee: q.fee, requestId: 'upgrade-request-01' });
  assert.equal(again.replayed, true);
  assert.equal(c.self().balance, 3000 * TR);
  // the record of it
  assert.deepEqual(c.p.upgrades.map((u) => [u.from, u.to, u.fee]), [['W1', 'M1', 1000 * TR]]);
  const txn = c.host.auditor.transactions().find((t) => t.key.startsWith('upgrade:'));
  assert.ok(txn && txn.meta.from === 'W1' && txn.meta.to === 'M1');
  // back again costs a quarter of what is there now, and is refused: 750 TR is more than... no: 1,000 TR is earned
  const back = ok(c.send({ type: 'character.quote', figure: 'W1' })).quote;
  assert.deepEqual({ total: back.total, fee: back.fee, ok: back.ok }, { total: 3000 * TR, fee: 750 * TR, ok: true });
  // it survives a save
  const kept = createHost({ saved: JSON.parse(JSON.stringify(c.host.save())) });
  assert.equal(kept.game.view(c.id).self.look.figure, 'M1');
  assert.deepEqual(c.host.auditor.reconcile(), []);
});

test('there is no other way to change a character: no intent sets a look, and looking at another changes nothing', () => {
  const c = arrive('M1');
  for (const type of ['character.set', 'look.set', 'settings.look', 'character.choose']) assert.equal(c.send({ type, figure: 'W1', look: { figure: 'W1' } }).code, 'UNKNOWN_INTENT', type);
  ok(c.send({ type: 'character.quote', figure: 'W1' }));
  ok(c.send({ type: 'character.quote', figure: 'W1' }));
  assert.equal(c.self().look.figure, 'M1');
  assert.equal(c.self().balance, ARRIVAL_FUNDS);
  assert.equal(c.p.upgrades, undefined);
});
