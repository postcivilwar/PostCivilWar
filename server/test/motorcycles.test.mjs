// The motorcycle showroom against a real PostgreSQL: the owner's seventeen motorcycles, their prices, starter TR that
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
const { MOTORCYCLES, POWERBIKE, POWERBIKE_STANDS } = require('../../api/_lib/schema.js');

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

test('the showroom sells the seventeen motorcycles, each at the game\'s own price, from 300 TR to 3,000 TR (the owner\'s prices of 18 October 2026)', async () => {
  const guest = person();
  const list = await showroom(guest);
  assert.equal(list.length, 17);
  assert.equal(Object.keys(POWER_BIKES).length, 17);
  for (const [id, bike] of Object.entries(POWER_BIKES)) {
    const l = list.find((x) => x.asset.model === `bike:${id}`);
    assert.ok(l, id);
    assert.equal(l.asset.name, bike.name, id);
    assert.equal(l.price, bike.price * TR, `${id}: the server's price is the game's`);
    assert.equal(l.asset.category, 'motorcycle');
    // sold by PostCivilWar PowerBike, beside HOLARIS, each from its own stand in the hall (migration 10)
    assert.equal(l.seller, 'PostCivilWar PowerBike');
    assert.equal(l.shop, POWERBIKE.shop);
    assert.deepEqual([l.place.x, l.place.z], POWERBIKE_STANDS[id].slice(0, 2), id);
    assert.equal(l.place.label, 'PostCivilWar PowerBike, north of the motor park, Asaba');
    assert.ok(l.price >= 300 * TR && l.price <= 3000 * TR, `${id}: ${l.price / TR} TR`);
  }
  assert.deepEqual([Math.min(...list.map((l) => l.price)), Math.max(...list.map((l) => l.price))], [300 * TR, 3000 * TR]);
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
  const low = await buy(p, 'streetfighter', 250 * TR);
  assert.equal(low.body.offer.status, 'declined');
  assert.equal((await parts(p)).balance, 2000 * TR);
  // more than the price pays the price and no more
  const sold = await buy(p, 'streetfighter', 400 * TR);
  assert.equal(sold.status, 200, JSON.stringify(sold.body));
  assert.equal(sold.body.offer.status, 'accepted');
  assert.equal(sold.body.sale.amount, 300 * TR);
  assert.deepEqual(await parts(p), { balance: 1700 * TR, starter: 1700 * TR, eligible: 0 });
  // one of each to an account
  const again = await buy(p, 'streetfighter');
  assert.equal(again.body.code, 'OWNED');
  // not more than there is: the show machine is 3,000 TR
  const dear = await buy(p, 'chrome-concept');
  assert.equal(dear.body.code, 'FUNDS');
  assert.deepEqual(await parts(p), { balance: 1700 * TR, starter: 1700 * TR, eligible: 0 });
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
  assert.equal((await parts(p)).balance, 1700 * TR);
  await clean();
});

test('earned TR pays the rest; sold on, what starter TR paid comes back as starter TR', async () => {
  const seller = await earner('Seller', 4000);         // 2,000 TR starter and 2,000 TR earned
  const sale = await buy(seller, 'black-cruiser');      // 450 TR: all of it starter
  assert.equal(sale.body.offer.status, 'accepted');
  assert.deepEqual(await parts(seller), { balance: 3550 * TR, starter: 1550 * TR, eligible: 2000 * TR });
  const second = await buy(seller, 'chrome-concept');   // 3,000 TR: 1,550 starter, then 1,450 earned
  assert.equal(second.body.offer.status, 'accepted');
  assert.deepEqual(await parts(seller), { balance: 550 * TR, starter: 0, eligible: 550 * TR });
  // sold on to another player for 500 TR: 450 of it is starter TR again
  const holding = (await seller.ok('market.mine')).holdings.find((h) => h.asset.model === 'bike:black-cruiser');
  const { listing } = await seller.ok('market.sell', { holding: holding.id, price: 500 * TR, place: { x: 41, z: -10, label: 'Market Road' }, zone: 'NG-AN-OGB-Z1' });
  const buyer = await earner('Buyer', 4000);
  const { thread } = await buyer.ok('market.open', { listing: listing.id, at: { x: 41, z: -11 } });
  const offerId = uuid();
  await buyer.ok('market.offer', { thread: thread.id, offer: offerId, amount: 500 * TR });
  const done = await seller.ok('market.decide', { offer: offerId, accept: true, amount: 500 * TR });
  assert.equal(done.offer.status, 'accepted');
  assert.deepEqual(await parts(seller), { balance: 1050 * TR, starter: 450 * TR, eligible: 600 * TR });
  assert.deepEqual((await buyer.ok('market.mine')).holdings.map((h) => h.asset.model), ['bike:black-cruiser']);
  // and someone who already has that motorcycle cannot buy a second one second-hand
  const { listing: again } = await buyer.ok('market.sell', { holding: (await buyer.ok('market.mine')).holdings[0].id, price: 550 * TR, place: { x: 41, z: -10, label: 'Market Road' }, zone: 'NG-AN-OGB-Z1' });
  const owner2 = await earner('Owner', 6000);
  assert.equal((await buy(owner2, 'black-cruiser')).body.offer.status, 'accepted');
  const t = (await owner2.ok('market.open', { listing: again.id, at: { x: 41, z: -11 } })).thread;
  assert.equal((await owner2.call('market.offer', { thread: t.id, offer: uuid(), amount: 550 * TR })).body.code, 'OWNED');
  await clean();
});

test('PostCivilWar PowerBike\'s salesman: says who he is, answers about the bike from what is so, and never bargains', async () => {
  const p = await newPlayer('Asker');
  const l = (await showroom(p)).find((x) => x.asset.model === 'bike:red-superbike');
  const { thread, messages } = await p.ok('market.open', { listing: l.id, at: { x: l.place.x + 1.5, z: l.place.z + 1.6 } });
  assert.equal(thread.automatic, true);
  // his greeting: the showroom, his name, that his answers are automatic, and the bike's own engine, speed and price
  const hello = messages[messages.length - 1];
  assert.equal(hello.from, 'shop');
  const price = `${(l.price / TR).toLocaleString('en-GB')} TR`;
  for (const part of ['PostCivilWar PowerBike', 'Obi', 'automatic', 'Red Superbike', '2,500 cc', '212 km/h', price]) assert.ok(hello.body.includes(part), `${part}: ${hello.body}`);
  const ask = async (text) => { const r = await p.ok('market.say', { thread: thread.id, text, after: 0 }); const last = r.messages[r.messages.length - 1]; assert.equal(last.from, 'shop', text); return last.body; };
  assert.match(await ask('Tell me about the engine'), /2,500 cc engine/);
  assert.match(await ask('How fast does it go?'), /212 km\/h/);
  assert.match(await ask('is it really 2500cc?'), /2,500 cc engine/, 'a figure with cc is a question about the engine, not an offer');
  assert.ok((await ask('Can you give me a discount?')).includes(`price is fixed at ${price}`));
  assert.match(await ask(`I will pay ${l.price / TR - 500}`), /can't take less/);
  assert.match(await ask('Can I pay with my arrival money?'), /arrival TR included/);
  assert.match(await ask('Can I take it for a test ride?'), /Once it's yours you can ride it/);
  assert.match(await ask('How do I get it after I buy?'), /Property on your phone/);
  assert.match(await ask('Are you a real person?'), /game's people.*automatic/);
  assert.match(await ask('hello'), /What would you like to know about the Red Superbike/);
  // asking costs nothing and buys nothing
  assert.deepEqual(await parts(p), { balance: 2000 * TR, starter: 2000 * TR, eligible: 0 });
  assert.equal((await p.ok('market.mine')).holdings.length, 0);
  // the price is the price: Buy pays it, and it is theirs (the superbike's 1,200 TR, out of the arrival money)
  const bought = await p.call('market.offer', { thread: thread.id, offer: uuid(), amount: l.price });
  assert.equal(bought.body.offer.status, 'accepted', JSON.stringify(bought.body));
  assert.deepEqual(await parts(p), { balance: 2000 * TR - l.price, starter: 2000 * TR - l.price, eligible: 0 });
  const cheap = (await showroom(p)).find((x) => x.asset.model === 'bike:white-sport');
  const second = await p.ok('market.open', { listing: cheap.id, at: { x: cheap.place.x, z: cheap.place.z - 1.6 } });
  assert.ok(second.messages[second.messages.length - 1].body.includes('500 cc'));
  const paid = await p.call('market.offer', { thread: second.thread.id, offer: uuid(), amount: cheap.price });
  assert.equal(paid.body.offer.status, 'accepted', JSON.stringify(paid.body));
  assert.deepEqual((await p.ok('market.mine')).holdings.map((h) => h.asset.model).sort(), ['bike:red-superbike', 'bike:white-sport']);
  await clean();
});

test('the showroom\'s stands, engines and top speeds are the game\'s own', async () => {
  const { POWERBIKE: GAME } = await import('../../prototype/src/sim/zones/atani-powerbike.js');
  assert.equal(GAME.name, POWERBIKE.name);
  assert.equal(GAME.shop, POWERBIKE.shop);
  assert.equal(GAME.salesman, POWERBIKE.salesman);
  assert.deepEqual(Object.keys(POWERBIKE_STANDS).sort(), Object.keys(POWER_BIKES).sort());
  for (const d of GAME.displays) {
    const [x, z, cc, kmh] = POWERBIKE_STANDS[d.bike];
    assert.deepEqual([x, z], [d.x, d.z], d.bike);
    assert.equal(cc, POWER_BIKES[d.bike].cc, d.bike);
    assert.equal(kmh, POWER_BIKES[d.bike].topKmh, d.bike);
  }
});
