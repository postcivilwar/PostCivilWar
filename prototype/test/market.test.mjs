// The shared market's side of a sale, as this world's ledger sees it (src/sim/market.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { newWorld } from './helpers.mjs';
import { createHost } from '../src/sim/host.js';
import { ARRIVAL_FUNDS } from '../src/sim/sim.js';
import { TR } from '../src/sim/ledger.js';

const OFFER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SALE = '33333333-3333-4333-8333-333333333333';
const SALE2 = '44444444-4444-4444-8444-444444444444';
const balance = (host, id) => host.game.view(id).self.balance;
const sound = (host) => assert.deepEqual(host.auditor.reconcile(), []);

test('money for an offer is set aside from the wallet, and cannot be set aside twice or beyond what is there', () => {
  const { host, id } = newWorld();
  assert.equal(balance(host, id), ARRIVAL_FUNDS);
  assert.deepEqual(host.market.hold(id, { offerId: OFFER, amount: 100 * TR, what: 'HOLARIS Wristwatch' }), { ok: true, held: 100 * TR });
  assert.equal(balance(host, id), ARRIVAL_FUNDS - 100 * TR);
  // the same offer again is the same hold
  assert.equal(host.market.hold(id, { offerId: OFFER, amount: 100 * TR, what: 'HOLARIS Wristwatch' }).replayed, true);
  assert.equal(balance(host, id), ARRIVAL_FUNDS - 100 * TR);
  assert.equal(host.market.hold(id, { offerId: OFFER, amount: 90 * TR }).code, 'CONFLICT');
  // more than is left
  assert.equal(host.market.hold(id, { offerId: OTHER, amount: ARRIVAL_FUNDS }).code, 'INSUFFICIENT');
  for (const amount of [0, -4, 1.5, Number.NaN, '200', 3e12]) assert.equal(host.market.hold(id, { offerId: OTHER, amount }).ok, false, String(amount));
  assert.equal(host.market.hold(id, { offerId: 'not an id', amount: 10 }).ok, false);
  assert.deepEqual(host.market.view(id), { holds: [{ offerId: OFFER, amount: 100 * TR, what: 'HOLARIS Wristwatch' }], held: 100 * TR, paid: [], credited: [] });
  sound(host);
});

test('an offer that comes to nothing gives the money back, once', () => {
  const { host, id } = newWorld();
  host.market.hold(id, { offerId: OFFER, amount: 250, what: 'a watch' });
  assert.deepEqual(host.market.release(id, OFFER), { ok: true, released: 250 });
  assert.equal(balance(host, id), ARRIVAL_FUNDS);
  assert.deepEqual(host.market.release(id, OFFER), { ok: true, released: 0 });
  assert.equal(balance(host, id), ARRIVAL_FUNDS);
  assert.equal(host.market.view(id).held, 0);
  sound(host);
});

test('an accepted offer is paid from what was held: exactly the price, exactly once, and it leaves this world', () => {
  const { host, id } = newWorld();
  const supply = host.auditor.supply().TR;
  host.market.hold(id, { offerId: OFFER, amount: 100 * TR, what: 'HOLARIS Wristwatch No. 3 of 10' });
  assert.deepEqual(host.market.settle(id, { saleId: SALE, offerId: OFFER, amount: 100 * TR, what: 'HOLARIS Wristwatch No. 3 of 10' }), { ok: true, paid: 100 * TR });
  assert.equal(balance(host, id), ARRIVAL_FUNDS - 100 * TR);
  assert.equal(host.auditor.supply().TR, supply - 100 * TR);
  // told again (the page was reloaded before the market heard it had been paid)
  assert.equal(host.market.settle(id, { saleId: SALE, offerId: OFFER, amount: 100 * TR }).replayed, true);
  assert.equal(balance(host, id), ARRIVAL_FUNDS - 100 * TR);
  assert.deepEqual(host.market.view(id), { holds: [], held: 0, paid: [SALE], credited: [] });
  sound(host);
});

test('a shop that charges less than was offered takes its price and the rest comes back', () => {
  const { host, id } = newWorld();
  host.market.hold(id, { offerId: OFFER, amount: 500 * TR, what: 'a watch' });
  assert.equal(balance(host, id), ARRIVAL_FUNDS - 500 * TR);
  host.market.settle(id, { saleId: SALE, offerId: OFFER, amount: 100 * TR, what: 'a watch' });
  assert.equal(balance(host, id), ARRIVAL_FUNDS - 100 * TR);
  assert.equal(host.market.view(id).held, 0);
  sound(host);
});

test('a sale found with nothing held for it is paid from the wallet; if the wallet is short it stays owed', () => {
  const { host, id } = newWorld();
  assert.deepEqual(host.market.settle(id, { saleId: SALE, offerId: OFFER, amount: 100 * TR, what: 'a watch' }), { ok: true, paid: 100 * TR });
  assert.equal(balance(host, id), ARRIVAL_FUNDS - 100 * TR);
  const short = host.market.settle(id, { saleId: SALE2, offerId: OTHER, amount: ARRIVAL_FUNDS, what: 'a yacht' });
  assert.equal(short.code, 'INSUFFICIENT');
  assert.equal(balance(host, id), ARRIVAL_FUNDS - 100 * TR);
  assert.deepEqual(host.market.view(id).paid, [SALE]);
  sound(host);
});

test('what a buyer paid arrives in the seller\'s wallet: exactly that, exactly once', () => {
  const { host, id } = newWorld();
  const supply = host.auditor.supply().TR;
  assert.deepEqual(host.market.credit(id, { saleId: SALE, amount: 140 * TR, what: 'HOLARIS Wristwatch No. 3 of 10' }), { ok: true, credited: 140 * TR });
  assert.equal(balance(host, id), ARRIVAL_FUNDS + 140 * TR);
  assert.equal(host.market.credit(id, { saleId: SALE, amount: 140 * TR }).replayed, true);
  assert.equal(balance(host, id), ARRIVAL_FUNDS + 140 * TR);
  assert.equal(host.auditor.supply().TR, supply + 140 * TR);
  assert.deepEqual(host.market.view(id).credited, [SALE]);
  sound(host);
});

test('a buyer and a seller, each in their own world: what leaves one is what arrives in the other', () => {
  const buyer = newWorld('Buyer Okafor'), seller = newWorld('Seller Eze');
  buyer.host.market.hold(buyer.id, { offerId: OFFER, amount: 140 * TR, what: 'a watch' });
  buyer.host.market.settle(buyer.id, { saleId: SALE, offerId: OFFER, amount: 140 * TR, what: 'a watch' });
  seller.host.market.credit(seller.id, { saleId: SALE, amount: 140 * TR, what: 'a watch' });
  assert.equal(balance(buyer.host, buyer.id) + balance(seller.host, seller.id), 2 * ARRIVAL_FUNDS);
  assert.equal(balance(buyer.host, buyer.id), ARRIVAL_FUNDS - 140 * TR);
  assert.equal(balance(seller.host, seller.id), ARRIVAL_FUNDS + 140 * TR);
  sound(buyer.host); sound(seller.host);
});

test('holds, payments and receipts are kept with the character: a saved game takes them up where they were', () => {
  const { host, id } = newWorld();
  host.market.hold(id, { offerId: OFFER, amount: 60 * TR, what: 'a watch' });
  host.market.credit(id, { saleId: SALE, amount: 10 * TR, what: 'a ring' });
  const again = createHost({ saved: JSON.parse(JSON.stringify(host.save())) });
  assert.deepEqual(again.market.view(id), host.market.view(id));
  assert.equal(balance(again, id), ARRIVAL_FUNDS - 60 * TR + 10 * TR);
  // still exactly once after the reload
  assert.equal(again.market.credit(id, { saleId: SALE, amount: 10 * TR }).replayed, true);
  assert.equal(again.market.hold(id, { offerId: OFFER, amount: 60 * TR }).replayed, true);
  again.market.settle(id, { saleId: SALE2, offerId: OFFER, amount: 60 * TR, what: 'a watch' });
  assert.equal(balance(again, id), ARRIVAL_FUNDS - 60 * TR + 10 * TR);
  sound(again);
});

test('a character saved before there was a market loads, and can use it', () => {
  const { host, id } = newWorld();
  const old = JSON.parse(JSON.stringify(host.save()));
  delete old.game.market;
  const again = createHost({ saved: old });
  assert.deepEqual(again.market.view(id), { holds: [], held: 0, paid: [], credited: [] });
  assert.equal(again.market.hold(id, { offerId: OFFER, amount: 20 }).ok, true);
  sound(again);
});

test('the market cannot be reached through the game\'s front door', () => {
  const { host, id } = newWorld();
  for (const type of ['market.credit', 'market.hold', 'market.settle', 'market.release']) {
    const r = host.game.intent(id, { type, saleId: SALE, offerId: OFFER, amount: 1000 });
    assert.equal(r.ok, false, type);
  }
  assert.equal(balance(host, id), ARRIVAL_FUNDS);
});
