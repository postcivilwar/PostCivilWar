// The motorcycle showroom against a real PostgreSQL: the owner's fifteen motorcycles, their prices, starter TR that
// may buy one (and nothing else it could not buy before), one of each to an account, ownership kept after logging
// in again, and selling one on.
//   server/with-postgres.sh node --test server/test/*.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { person, newPlayer, earner, database, closeDatabase, uuid, HOLARIS, NEAR_HOLARIS } from './harness.mjs';
import { POWER_BIKES } from '../../prototype/src/sim/power-bikes.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const wallet = require('../../api/_lib/wallet.js');
const { MOTORCYCLES } = require('../../api/_lib/schema.js');

after(() => closeDatabase());
const TR = 2;
const clean = async () => assert.deepEqual(await wallet.audit(await database()), [], 'the bank\'s books are right');
const parts = async (p) => { const w = (await p.ok('wallet.get')).wallet; return { balance: w.balance, starter: w.starter, eligible: w.eligible }; };
const showroom = async (p) => (await p.ok('market.list', { q: 'motorcycle' })).listings;
async function buy(p, id, amount) {
  const l = (await showroom(p)).find((x) => x.asset.model === `bike:${id}`);
  const { thread } = await p.ok('market.open', { listing: l.id, at: { x: l.place.x, z: l.place.z } });
  return p.call('market.offer', { thread: thread.id, offer: uuid(), amount: amount === undefined ? l.price : amount });
}

test('the showroom sells the fifteen motorcycles, each at the game\'s own price, from 1,000 TR up', async () => {
  const guest = person();
  const list = await showroom(guest);
  assert.equal(list.length, 15);
  assert.equal(Object.keys(POWER_BIKES).length, 15);
  for (const [id, bike] of Object.entries(POWER_BIKES)) {
    const l = list.find((x) => x.asset.model === `bike:${id}`);
    assert.ok(l, id);
    assert.equal(l.asset.name, bike.name, id);
    assert.equal(l.price, bike.price * TR, `${id}: the server's price is the game's`);
    assert.equal(l.asset.category, 'motorcycle');
    assert.equal(l.seller, 'Motorcycle Showroom');
    assert.ok(l.price >= 1000 * TR);
  }
  // the server's own list and the game's agree
  assert.deepEqual(MOTORCYCLES.map((m) => [m.id, m.name, m.price]), Object.values(POWER_BIKES).map((b) => [b.id, b.name, b.price * TR]));
  // prices rise with the class, never fall
  const byTier = Object.values(POWER_BIKES).sort((a, b) => a.tier - b.tier || a.price - b.price);
  for (let i = 1; i < byTier.length; i += 1) assert.ok(byTier[i].price >= byTier[i - 1].price);
});

test('arrival money buys a motorcycle: once each, at the showroom\'s price, and nothing else it could not buy before', async () => {
  const p = await newPlayer('Rider');
  assert.deepEqual(await parts(p), { balance: 2000 * TR, starter: 2000 * TR, eligible: 0 });
  // below the price: refused, and nothing moves
  const low = await buy(p, 'streetfighter', 900 * TR);
  assert.equal(low.body.offer.status, 'declined');
  assert.equal((await parts(p)).balance, 2000 * TR);
  // more than the price pays the price and no more
  const sold = await buy(p, 'streetfighter', 1200 * TR);
  assert.equal(sold.status, 200, JSON.stringify(sold.body));
  assert.equal(sold.body.offer.status, 'accepted');
  assert.equal(sold.body.sale.amount, 1000 * TR);
  assert.deepEqual(await parts(p), { balance: 1000 * TR, starter: 1000 * TR, eligible: 0 });
  // one of each to an account
  const again = await buy(p, 'streetfighter');
  assert.equal(again.body.code, 'OWNED');
  // not more than there is
  const dear = await buy(p, 'black-cruiser');
  assert.equal(dear.body.code, 'FUNDS');
  assert.deepEqual(await parts(p), { balance: 1000 * TR, starter: 1000 * TR, eligible: 0 });
  // the rest of the arrival money is as restricted as it was: no watch, no transfer
  const { thread } = await p.ok('market.open', { listing: HOLARIS.listing, at: NEAR_HOLARIS });
  assert.equal((await p.call('market.offer', { thread: thread.id, offer: uuid(), amount: 100 * TR })).body.code, 'STARTER_FUNDS');
  const friend = await newPlayer('Friend');
  assert.equal((await p.call('wallet.send', { username: friend.username, amount: '10', key: uuid() })).body.code, 'STARTER_FUNDS');
  // it is theirs, as a motorcycle, and still theirs after logging in again elsewhere
  const mine = (await p.ok('market.mine')).holdings;
  assert.equal(mine.length, 1);
  assert.equal(mine[0].asset.model, 'bike:streetfighter');
  assert.equal(mine[0].serial, null);
  assert.equal(mine[0].name, 'Streetfighter');
  const elsewhere = person();
  await elsewhere.ok('login', { username: p.username, password: `pw-${p.username}-long` });
  assert.deepEqual((await elsewhere.ok('market.mine')).holdings.map((h) => h.asset.model), ['bike:streetfighter']);
  // the history says what was bought
  const history = (await p.ok('wallet.history', {})).entries || (await p.ok('wallet.history', {})).history;
  assert.ok(JSON.stringify(history).includes('Streetfighter'));
  await clean();
});

test('asked for twice at once, a motorcycle is bought once', async () => {
  const p = await newPlayer('Twice');
  const l = (await showroom(p)).find((x) => x.asset.model === 'bike:cafe-racer');
  const { thread } = await p.ok('market.open', { listing: l.id, at: { x: l.place.x, z: l.place.z } });
  const t2 = (await p.ok('market.open', { listing: l.id, at: { x: l.place.x, z: l.place.z } })).thread;
  const answers = await Promise.all([p.call('market.offer', { thread: thread.id, offer: uuid(), amount: l.price }), p.call('market.offer', { thread: t2.id, offer: uuid(), amount: l.price })]);
  assert.equal(answers.filter((a) => a.body.ok && a.body.offer.status === 'accepted').length, 1, JSON.stringify(answers.map((a) => a.body.code || a.body.offer.status)));
  assert.equal((await p.ok('market.mine')).holdings.length, 1);
  assert.equal((await parts(p)).balance, 1000 * TR);
  await clean();
});

test('earned TR pays the rest; sold on, what starter TR paid comes back as starter TR', async () => {
  const seller = await earner('Seller', 4000);         // 2,000 TR starter and 2,000 TR earned
  const sale = await buy(seller, 'black-cruiser');      // 1,500 TR: all of it starter
  assert.equal(sale.body.offer.status, 'accepted');
  assert.deepEqual(await parts(seller), { balance: 2500 * TR, starter: 500 * TR, eligible: 2000 * TR });
  const second = await buy(seller, 'purple-sport');     // 1,500 TR: 500 starter, then 1,000 earned
  assert.equal(second.body.offer.status, 'accepted');
  assert.deepEqual(await parts(seller), { balance: 1000 * TR, starter: 0, eligible: 1000 * TR });
  // sold on to another player for 1,600 TR: 1,500 of it is starter TR again
  const holding = (await seller.ok('market.mine')).holdings.find((h) => h.asset.model === 'bike:black-cruiser');
  const { listing } = await seller.ok('market.sell', { holding: holding.id, price: 1600 * TR, place: { x: 41, z: -10, label: 'Market Road' }, zone: 'NG-AN-OGB-Z1' });
  const buyer = await earner('Buyer', 4000);
  const { thread } = await buyer.ok('market.open', { listing: listing.id, at: { x: 41, z: -11 } });
  const offerId = uuid();
  await buyer.ok('market.offer', { thread: thread.id, offer: offerId, amount: 1600 * TR });
  const done = await seller.ok('market.decide', { offer: offerId, accept: true, amount: 1600 * TR });
  assert.equal(done.offer.status, 'accepted');
  assert.deepEqual(await parts(seller), { balance: 2600 * TR, starter: 1500 * TR, eligible: 1100 * TR });
  assert.deepEqual((await buyer.ok('market.mine')).holdings.map((h) => h.asset.model), ['bike:black-cruiser']);
  // and someone who already has that motorcycle cannot buy a second one second-hand
  const { listing: again } = await buyer.ok('market.sell', { holding: (await buyer.ok('market.mine')).holdings[0].id, price: 1700 * TR, place: { x: 41, z: -10, label: 'Market Road' }, zone: 'NG-AN-OGB-Z1' });
  const owner2 = await earner('Owner', 6000);
  assert.equal((await buy(owner2, 'black-cruiser')).body.offer.status, 'accepted');
  const t = (await owner2.ok('market.open', { listing: again.id, at: { x: 41, z: -11 } })).thread;
  assert.equal((await owner2.call('market.offer', { thread: t.id, offer: uuid(), amount: 1700 * TR })).body.code, 'OWNED');
  await clean();
});
