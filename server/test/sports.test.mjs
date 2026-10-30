// The Post Civil War Sports Mall against a real PostgreSQL (30 October 2026): the owner's eight sports models at the game's
// prices (the owner's: 50 TR for the skateboard to 600 TR for the speedboat), each sold from its own stand in the mall's hall by its saleswoman,
// Nkem; any TR buys one, the arrival money included, starter TR first, as for a motorcycle or a car; one of each to an
// account, new or second-hand; and sold on, what arrival money paid is arrival money again. The naval ships are not sold.
//   server/with-postgres.sh node --test server/test/*.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { newPlayer, person, earner, report, database, closeDatabase, uuid, NEAR_HOLARIS, ZONE } from './harness.mjs';
import { SPORTS as GAME_SPORTS, NOT_FOR_SALE } from '../../prototype/src/sim/sports.js';
import { SPORTS_MALL as GAME } from '../../prototype/src/sim/zones/asaba-sports.js';

const require = createRequire(import.meta.url);
const wallet = require('../../api/_lib/wallet.js');
const { SPORTS, SPORTS_MALL, SPORT_STANDS } = require('../../api/_lib/schema.js');
const { sportsReply } = require('../../api/_lib/market.js');

after(() => closeDatabase());
const TR = 2;
const clean = async () => assert.deepEqual(await wallet.audit(await database()), [], 'the bank\'s books are right');
const parts = async (p) => { const w = (await p.ok('wallet.get')).wallet; return { balance: w.balance, starter: w.starter, eligible: w.eligible }; };
const mall = async (p) => (await p.ok('market.list', { q: 'sports mall' })).listings;
const listingOf = async (p, id) => (await mall(p)).find((l) => l.asset.model === `sport:${id}`);
// where a buyer stands to look at a thing: just off its round stand
const atStand = (l) => ({ x: l.place.x + 1.2, z: l.place.z + 2.0 });
async function buy(p, id, amount) {
  const l = await listingOf(p, id);
  const { thread } = await p.ok('market.open', { listing: l.id, at: atStand(l) });
  return p.call('market.offer', { thread: thread.id, offer: uuid(), amount: amount === undefined ? l.price : amount });
}

test('the eight things, their prices and their stands are the game\'s own; the naval ship is not among them', () => {
  assert.equal(SPORTS.length, 8);
  assert.deepEqual(SPORTS.map((t) => [t.id, t.name, t.price, t.kmh, t.on, t.drive, t.blurb]), Object.values(GAME_SPORTS).map((t) => [t.id, t.name, t.price * TR, t.kmh, t.on, t.drive, t.blurb]));
  assert.ok(SPORTS.every((t) => t.asset === `sport-${t.id}`));
  assert.equal(new Set(SPORTS.map((t) => t.listing)).size, 8);
  assert.ok(!SPORTS.some((t) => NOT_FOR_SALE.includes(t.id)), 'the naval ships are not sold');
  // the owner's prices: the skateboard the cheapest at 50 TR, the speedboat the dearest at 600 TR, the bicycle 300, the e-scooter 200
  assert.deepEqual([Math.min(...SPORTS.map((t) => t.price)) / TR, Math.max(...SPORTS.map((t) => t.price)) / TR], [50, 600]);
  assert.equal(SPORTS.find((t) => t.price === 600 * TR).id, 'speedboat');
  assert.equal(SPORTS.find((t) => t.price === 50 * TR).id, 'skateboard');
  assert.deepEqual(['bicycle', 'e-scooter'].map((id) => SPORTS.find((t) => t.id === id).price / TR), [300, 200]);
  // the mall is the game's: its name, the market's name for it, its address, its town, its saleswoman
  assert.deepEqual([SPORTS_MALL.name, SPORTS_MALL.shop, SPORTS_MALL.label, SPORTS_MALL.zone, SPORTS_MALL.seller], [GAME.name, GAME.shop, GAME.label, ZONE, GAME.seller.name]);
  // each is sold where the game shows it
  assert.deepEqual(Object.keys(SPORT_STANDS).sort(), Object.keys(GAME_SPORTS).sort());
  assert.equal(GAME.displays.length, 8);
  for (const d of GAME.displays) assert.deepEqual(SPORT_STANDS[d.item], [d.x, d.z], d.item);
});

test('the market sells the eight at the mall, each from its own stand and at the game\'s price', async () => {
  const guest = person();
  const list = await mall(guest);
  assert.equal(list.length, 8);
  for (const [id, t] of Object.entries(GAME_SPORTS)) {
    const l = list.find((x) => x.asset.model === `sport:${id}`);
    assert.ok(l, id);
    assert.deepEqual({ name: l.asset.name, category: l.asset.category, blurb: l.asset.blurb }, { name: t.name, category: 'sport', blurb: t.blurb }, id);
    assert.equal(l.price, t.price * TR, `${id}: the server's price is the game's`);
    assert.deepEqual({ kind: l.kind, seller: l.seller, shop: l.shop, automatic: l.automatic, stock: l.stock }, { kind: 'primary', seller: 'Post Civil War Sports Mall', shop: 'sports', automatic: true, stock: 1000000 }, id);
    assert.deepEqual(l.place, { zone: ZONE, x: SPORT_STANDS[id][0], z: SPORT_STANDS[id][1], label: 'Post Civil War Sports Mall, Kwale Road, Asaba' }, id);
  }
  // found by what they are and where they are sold
  for (const q of ['sport', 'SPORTS', 'post civil war sports mall', 'ride']) assert.equal((await guest.ok('market.list', { q })).listings.filter((l) => l.asset.category === 'sport').length, 8, q);
  assert.deepEqual((await guest.ok('market.list', { q: 'bicycle' })).listings.map((l) => l.asset.model), ['sport:bicycle']);
  assert.deepEqual((await guest.ok('market.list', { q: 'water' })).listings.map((l) => l.asset.model).sort(), ['sport:speedboat', 'sport:surfboard']);
  assert.ok((await guest.ok('market.list', { q: 'car' })).listings.every((l) => l.asset.category === 'car'), 'a thing from the mall is not a car');
});

test('at its stand Nkem greets the buyer; from anywhere else, nobody does', async () => {
  const p = await newPlayer('Looker');
  const list = await mall(p);
  for (const [id, t] of Object.entries(GAME_SPORTS)) {
    const l = list.find((x) => x.asset.model === `sport:${id}`);
    const { thread, messages } = await p.ok('market.open', { listing: l.id, at: atStand(l) });
    assert.deepEqual({ automatic: thread.automatic, other: thread.other }, { automatic: true, other: 'Post Civil War Sports Mall' });
    assert.equal(messages.length, 1);
    const hello = messages[0].body;
    for (const part of ['Welcome to Post Civil War Sports Mall!', "I'm Nkem, and I look after the floor here", 'automatic', `This is the ${t.name}.`, `It's ${t.price} TR.`]) assert.ok(hello.includes(part), `${id}: "${part}" is not in "${hello}"`);
  }
  const other = await newPlayer('Faraway');
  const bike = list.find((x) => x.asset.model === 'sport:bicycle');
  const far = await other.call('market.open', { listing: bike.id, at: NEAR_HOLARIS });
  assert.equal(far.status, 403);
  assert.equal(far.body.code, 'TOO_FAR');
  assert.equal(far.body.message, 'Go to Post Civil War Sports Mall, Kwale Road, Asaba to talk to the seller.');
  assert.equal((await other.call('market.open', { listing: bike.id })).body.code, 'TOO_FAR');
});

test('Nkem answers from what is so: the price is fixed, how each goes and what moves it, any TR pays', async () => {
  const p = await newPlayer('Asker');
  const l = await listingOf(p, 'bicycle');
  const { thread } = await p.ok('market.open', { listing: l.id, at: atStand(l) });
  const ask = async (text) => { const r = await p.ok('market.say', { thread: thread.id, text, after: 0 }); const last = r.messages[r.messages.length - 1]; assert.equal(last.from, 'shop', text); return last.body; };
  assert.match(await ask('Can you give me a discount?'), /^I'm sorry: the price is fixed at 300 TR\./);
  assert.match(await ask('I will pay 250'), /can't take less/);
  assert.match(await ask('300 TR?'), /^300 TR it is\. Press Buy to pay/);
  assert.equal(await ask('How fast does it go?'), 'The Fat-Tyre Bicycle goes as fast as you pedal it: about 30 km/h on the tar for a strong rider.');
  assert.equal(await ask('Does it have a motor?'), 'The Fat-Tyre Bicycle has no motor: you pedal it.');
  assert.match(await ask('Can I pay with my arrival money?'), /^Any TR in your wallet pays for it, your arrival TR included: a thing to ride from the mall is one thing arrival money can buy\. The Fat-Tyre Bicycle is 300 TR\.$/);
  assert.match(await ask('Where do I get it?'), /Once it's yours, it's in Property on your phone\.$/);
  assert.match(await ask('Which one do you recommend?'), /^The cheapest here is the Skateboard at 50 TR; the dearest is the Speedboat, at 600 TR\./);
  assert.match(await ask('Are you a real person?'), /^I'm Nkem.*game's people.*automatic/);
  // asking costs nothing and buys nothing
  assert.deepEqual(await parts(p), { balance: 2000 * TR, starter: 2000 * TR, eligible: 0 });
  const reply = (id, text) => { const t = SPORTS.find((x) => x.id === id); return sportsReply({ status: 'open', asset_name: t.name, price: t.price, model: `sport:${id}`, blurb: t.blurb }, text); };
  assert.equal(reply('speedboat', 'what engine?'), 'The Speedboat has an outboard motor at its stern.');
  assert.equal(reply('e-scooter', 'top speed?'), 'Flat out, the Electric Scooter does about 25 km/h.');
  assert.equal(reply('surfboard', 'where can I use it?'), 'The Surfboard is for the water, not the road.');
  assert.equal(reply('skateboard', 'is it electric?'), 'The Skateboard has no motor: you push it along with your foot.');
});

test('a newcomer\'s arrival money buys a thing from the mall: the price exactly, to the town, starter TR first; one of each', async () => {
  const sql = await database();
  const world = async () => Number((await sql.unsafe(`select balance from pcw.wallets where code = 'world'`))[0].balance);
  const p = await newPlayer('Rider');
  // under the price: refused, and nothing moves
  assert.equal((await buy(p, 'bicycle', 250 * TR)).body.offer.status, 'declined');
  assert.deepEqual(await parts(p), { balance: 2000 * TR, starter: 2000 * TR, eligible: 0 });
  const town = await world();
  const sold = await buy(p, 'bicycle', 350 * TR);
  assert.equal(sold.status, 200, JSON.stringify(sold.body));
  assert.deepEqual({ status: sold.body.offer.status, amount: sold.body.sale.amount, what: sold.body.sale.what }, { status: 'accepted', amount: 300 * TR, what: 'Fat-Tyre Bicycle' });
  assert.deepEqual(await parts(p), { balance: 1700 * TR, starter: 1700 * TR, eligible: 0 });
  assert.equal(await world() - town, 300 * TR);
  const legs = await sql.unsafe(`select e.amount, e.bucket, w.code, t.kind, t.meta from pcw.wallet_entries e join pcw.wallets w on w.id = e.wallet_id join pcw.wallet_tx t on t.id = e.tx_id where t.meta->>'sale' = $1 order by e.amount`, [sold.body.sale.id]);
  assert.deepEqual(legs.map((r) => [Number(r.amount), r.bucket, r.code, r.kind]), [[-300 * TR, 'starter', null, 'sale'], [300 * TR, null, 'world', 'sale']]);
  assert.deepEqual({ for: legs[0].meta.starterFor, starter: legs[0].meta.starter, shop: legs[0].meta.shop }, { for: 'sport', starter: 300 * TR, shop: 'Post Civil War Sports Mall' });
  const h = (await p.ok('market.mine')).holdings[0];
  assert.deepEqual({ model: h.asset.model, category: h.asset.category, name: h.name, serial: h.serial, edition: h.edition, paid: h.paid }, { model: 'sport:bicycle', category: 'sport', name: 'Fat-Tyre Bicycle', serial: null, edition: null, paid: 300 * TR });
  // one of each: a second bicycle is refused, and nothing moves
  const again = await buy(p, 'bicycle');
  assert.equal(again.body.code, 'OWNED');
  assert.equal(again.body.message, 'You already own the Fat-Tyre Bicycle. One of each thing from the sports mall to an account.');
  assert.deepEqual(await parts(p), { balance: 1700 * TR, starter: 1700 * TR, eligible: 0 });
  // the other seven are other things: all of them, 1,295 TR more (the arrival money buys all eight)
  for (const id of ['speedboat', 'e-scooter', 'e-unicycle', 'hoverboard', 'surfboard', 'inline-skates', 'skateboard']) assert.equal((await buy(p, id)).body.offer.status, 'accepted', id);
  assert.deepEqual((await p.ok('market.mine')).holdings.map((x) => x.asset.model).sort(), Object.keys(GAME_SPORTS).map((id) => `sport:${id}`).sort());
  assert.deepEqual(await parts(p), { balance: 405 * TR, starter: 405 * TR, eligible: 0 });
  // the rest of the arrival money is as restricted as it ever was
  const friend = await newPlayer('Friend');
  assert.equal((await friend.call('wallet.send', { username: p.username, amount: '10', key: uuid() })).body.code, 'STARTER_FUNDS');
  // and the database itself holds an account to one of each
  const owner = (await sql.unsafe(`select id from pcw.accounts where username_key = $1`, [p.username.toLowerCase()]))[0].id;
  await assert.rejects(sql.unsafe(`insert into pcw.holdings (asset_id, owner_id) values ('sport-bicycle', $1)`, [owner]), /holdings_one_sport/);
  await clean();
});

test('not more than there is: with less than the price, nothing is bought and nothing moves', async () => {
  const p = await newPlayer('Short');
  // (the arrival money spent in town, down to 5 TR: the town's charges, as the game reports them with a save)
  const now = await p.ok('save.get');
  const mark = now.wallet.mark;
  const kept = await p.ok('save.put', { baseRev: now.save ? now.save.rev : (now.rev || 0), enc: 'json', data: JSON.stringify({ host: { test: true } }), summary: { name: 'Test Player', figure: 'W1' }, wallet: report(mark, mark + 1, { cost: 1995 * TR }) });
  assert.ok(!kept.wallet.refused, JSON.stringify(kept.wallet));
  assert.deepEqual(await parts(p), { balance: 5 * TR, starter: 5 * TR, eligible: 0 });
  const r = await buy(p, 'skateboard');
  assert.equal(r.body.code, 'FUNDS');
  assert.equal(r.body.message, 'You do not have that much. Your balance is 5 TR.');
  assert.equal((await p.ok('market.mine')).holdings.length, 0);
  await clean();
});

test('sold on: one of each still holds second-hand; what the arrival money paid comes back as arrival money', async () => {
  const seller = await newPlayer('Seller');
  assert.equal((await buy(seller, 'skateboard')).body.offer.status, 'accepted');          // 50 TR, all arrival money
  const holding = (await seller.ok('market.mine')).holdings[0];
  const spot = { x: 41, z: -10, label: 'Market Road' };
  const { listing } = await seller.ok('market.sell', { holding: holding.id, price: 60 * TR, place: spot, zone: ZONE });
  assert.equal(listing.name, 'Skateboard');
  const owner = await newPlayer('Owner');
  assert.equal((await buy(owner, 'skateboard')).body.offer.status, 'accepted');
  const t1 = (await owner.ok('market.open', { listing: listing.id, at: { x: 41, z: -11 } })).thread;
  assert.equal((await owner.call('market.offer', { thread: t1.id, offer: uuid(), amount: 60 * TR })).body.code, 'OWNED');
  const buyer = await earner('Keen', 100 * TR);
  const t2 = (await buyer.ok('market.open', { listing: listing.id, at: { x: 41, z: -11 } })).thread;
  const offerId = uuid();
  assert.equal((await buyer.ok('market.offer', { thread: t2.id, offer: offerId, amount: 60 * TR })).offer.status, 'pending');
  assert.equal((await seller.ok('market.decide', { offer: offerId, accept: true, amount: 60 * TR })).offer.status, 'accepted');
  assert.deepEqual((await buyer.ok('market.mine')).holdings.map((x) => [x.id, x.asset.model, x.serial, x.paid]), [[holding.id, 'sport:skateboard', null, 60 * TR]]);
  // the 50 TR the arrival money paid is starter TR again for the seller; the 10 TR more is earned
  assert.deepEqual(await parts(seller), { balance: 2010 * TR, starter: 2000 * TR, eligible: 10 * TR });
  await clean();
});
