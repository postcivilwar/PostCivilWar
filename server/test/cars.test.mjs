// The Post Civil War Car Showroom against a real PostgreSQL: the owner's twenty cars at the game's prices, each sold
// from its own stand in the hall by the salesman whose side of the floor it is on; earned TR that buys one, and
// arrival money that does not (as it does a motorcycle); one of each to an account, new or second-hand.
//   server/with-postgres.sh node --test server/test/*.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { person, newPlayer, earner, earn, database, closeDatabase, uuid, NEAR_HOLARIS, ZONE } from './harness.mjs';
import { POWER_CARS } from '../../prototype/src/sim/power-cars.js';
import { CARSHOW as GAME } from '../../prototype/src/sim/zones/asaba-carshow.js';

const require = createRequire(import.meta.url);
const wallet = require('../../api/_lib/wallet.js');
const { CARS, CARSHOW, CAR_STANDS } = require('../../api/_lib/schema.js');
const { carSalesmanReply } = require('../../api/_lib/market.js');

after(() => closeDatabase());
const TR = 2;
const clean = async () => assert.deepEqual(await wallet.audit(await database()), [], 'the bank\'s books are right');
const parts = async (p) => { const w = (await p.ok('wallet.get')).wallet; return { balance: w.balance, starter: w.starter, eligible: w.eligible }; };
const showroom = async (p) => (await p.ok('market.list', { q: 'car' })).listings;
const listingOf = async (p, id) => (await showroom(p)).find((l) => l.asset.model === `car:${id}`);
// where a buyer stands to look at a car: just off its round stand
const atStand = (l) => ({ x: l.place.x + 2.4, z: l.place.z + 3.1 });
async function buy(p, id, amount) {
  const l = await listingOf(p, id);
  const { thread } = await p.ok('market.open', { listing: l.id, at: atStand(l) });
  return p.call('market.offer', { thread: thread.id, offer: uuid(), amount: amount === undefined ? l.price : amount });
}

test('the twenty cars, their stands, their sides of the floor and their top speeds are the game\'s own', () => {
  assert.equal(CARS.length, 20);
  assert.deepEqual(CARS.map((c) => [c.id, c.name, c.price, c.class, c.blurb]), Object.values(POWER_CARS).map((c) => [c.id, c.name, c.price * TR, c.class, c.blurb]));
  // each is its own thing to own, with its own listing
  assert.ok(CARS.every((c) => c.asset === `car-${c.id}`));
  assert.equal(new Set(CARS.map((c) => c.listing)).size, 20);
  // the showroom is the game's: its name, the market's name for it, its address, its town and its two salesmen
  assert.deepEqual([CARSHOW.name, CARSHOW.shop, CARSHOW.label, CARSHOW.zone], [GAME.name, GAME.shop, GAME.label, ZONE]);
  assert.deepEqual(Object.fromEntries(GAME.salesmen.map((s) => [s.side, s.name])), CARSHOW.salesmen);
  // each car is sold where the game shows it, on the side of the floor the game gives it, and goes as fast as the game says
  assert.deepEqual(Object.keys(CAR_STANDS).sort(), Object.keys(POWER_CARS).sort());
  assert.equal(GAME.displays.length, 20);
  for (const d of GAME.displays) {
    const [x, z, kmh, side] = CAR_STANDS[d.car];
    assert.deepEqual([x, z, side], [d.x, d.z, d.side], d.car);
    assert.equal(kmh, POWER_CARS[d.car].kmh, d.car);
  }
});

test('the market sells the twenty at the showroom, each from its own stand and at the game\'s price, from 2,000 TR up', async () => {
  const guest = person();
  const list = await showroom(guest);
  assert.equal(list.length, 20);
  for (const [id, car] of Object.entries(POWER_CARS)) {
    const l = list.find((x) => x.asset.model === `car:${id}`);
    assert.ok(l, id);
    assert.deepEqual({ name: l.asset.name, category: l.asset.category, blurb: l.asset.blurb }, { name: car.name, category: 'car', blurb: car.blurb }, id);
    assert.equal(l.price, car.price * TR, `${id}: the server's price is the game's`);
    assert.ok(l.price >= 2000 * TR);
    assert.deepEqual({ kind: l.kind, seller: l.seller, shop: l.shop, automatic: l.automatic, stock: l.stock }, { kind: 'primary', seller: 'Post Civil War Car Showroom', shop: 'cars', automatic: true, stock: 1000000 }, id);
    assert.deepEqual(l.place, { zone: ZONE, x: CAR_STANDS[id][0], z: CAR_STANDS[id][1], label: 'Post Civil War Car Showroom, Kwale Road, Asaba' }, id);
  }
  // found by what they are and by where they are sold; and a car is not a motorcycle
  for (const q of ['cars', 'CAR', 'post civil war car showroom', 'kwale road']) assert.equal((await guest.ok('market.list', { q })).listings.length, 20, q);
  assert.deepEqual((await guest.ok('market.list', { q: 'suv' })).listings.map((l) => l.asset.model).sort(), ['car:black-luxury-suv', 'car:black-square-suv', 'car:camo-expedition', 'car:peach-suv', 'car:white-square-suv']);
  // (the é of the Mint Sports Coupé is kept as it was written, and found either way)
  for (const q of ['coupe', 'Coupé']) assert.deepEqual((await guest.ok('market.list', { q })).listings.map((l) => [l.asset.model, l.asset.name]), [['car:mint-sports-coupe', 'Mint Sports Coupé']], q);
  assert.ok((await guest.ok('market.list', { q: 'motorcycle' })).listings.every((l) => l.asset.category === 'motorcycle'));
  assert.equal((await guest.ok('market.list', {})).listings.filter((l) => l.asset.category === 'car').length, 20);
});

test('at its stand, a car\'s own salesman greets the buyer: Tochi on the west side of the floor, Oluchi on the east; from anywhere else, nobody does', async () => {
  const p = await newPlayer('Looker');
  const list = await showroom(p);
  for (const [id, car] of Object.entries(POWER_CARS)) {
    const l = list.find((x) => x.asset.model === `car:${id}`);
    const { thread, messages } = await p.ok('market.open', { listing: l.id, at: atStand(l) });
    assert.deepEqual({ automatic: thread.automatic, other: thread.other }, { automatic: true, other: 'Post Civil War Car Showroom' });
    assert.equal(messages.length, 1);
    assert.equal(messages[0].from, 'shop');
    const hello = messages[0].body, salesman = CAR_STANDS[id][3] === 'west' ? 'Tochi' : 'Oluchi';
    for (const part of ['Welcome to Post Civil War Car Showroom!', `I'm ${salesman}, the salesman on this side of the floor`, 'automatic', `This is the ${car.name}: about ${car.kmh} km/h flat out.`, `It's ${car.price.toLocaleString('en-GB')} TR.`]) assert.ok(hello.includes(part), `${id}: "${part}" is not in "${hello}"`);
    assert.doesNotMatch(hello, /\bcc\b|engine|horse ?power|\bhp\b|litre/i, `${id}: nothing is said of an engine`);
  }
  // the conversation begins at the car's stand: not from across town, not from the other end of the hall, not from nowhere
  const other = await newPlayer('Faraway');
  const grey = list.find((x) => x.asset.model === 'car:grey-saloon');
  const far = await other.call('market.open', { listing: grey.id, at: NEAR_HOLARIS });
  assert.equal(far.status, 403);
  assert.equal(far.body.code, 'TOO_FAR');
  assert.equal(far.body.message, 'Go to Post Civil War Car Showroom, Kwale Road, Asaba to talk to the seller.');
  assert.equal((await other.call('market.open', { listing: grey.id, at: { x: CAR_STANDS['camo-expedition'][0], z: CAR_STANDS['camo-expedition'][1] } })).body.code, 'TOO_FAR');
  assert.equal((await other.call('market.open', { listing: grey.id })).body.code, 'TOO_FAR');
  assert.equal((await other.ok('market.mine')).threads.length, 0);
});

test('the salesman answers from what is so: the price is fixed, the top speed is the game\'s, earned TR pays, and no engine figure is made up', async () => {
  const p = await newPlayer('Asker');
  const l = await listingOf(p, 'grey-saloon');
  const { thread } = await p.ok('market.open', { listing: l.id, at: atStand(l) });
  const ask = async (text) => { const r = await p.ok('market.say', { thread: thread.id, text, after: 0 }); const last = r.messages[r.messages.length - 1]; assert.equal(last.from, 'shop', text); return last.body; };
  assert.match(await ask('Can you give me a discount?'), /^I'm sorry: the price is fixed at 2,000 TR\./);
  assert.match(await ask('I will pay 1500'), /can't take less/);
  assert.match(await ask('2,000 TR?'), /^2,000 TR it is\. Press Buy to pay/);
  assert.match(await ask('How fast does it go?'), /about 170 km\/h/);
  // the game claims nothing of any car's engine, and nor does its salesman: he says so, and says what he does know
  for (const q of ['Tell me about the engine', 'How much horsepower does it have?', 'Is it a 2.0 litre?', 'Is it a V8?']) {
    const said = await ask(q);
    assert.match(said, /^The showroom doesn't give engine figures for its cars/, q);
    assert.match(said, /the Grey Saloon is a saloon, and it does about 170 km\/h flat out\.$/, q);
    assert.doesNotMatch(said, /\d\s*(cc|hp|bhp|litre)|horse ?power|cylinder|\bv\d/i, q);
  }
  const pay = await ask('Can I pay with my arrival money?');
  assert.match(pay, /^Earned TR pays for it\./);
  assert.match(pay, /Arrival money doesn't buy a car/);
  assert.match(await ask('How much is it?'), /^The Grey Saloon is 2,000 TR\./);
  assert.match(await ask('How much is this motor?'), /^The Grey Saloon is 2,000 TR\./, 'in town a motor is a car: that asks its price');
  assert.match(await ask('Can I take it for a test drive?'), /step outside, open Property on your phone and choose to drive it, and it's brought to you/);
  assert.match(await ask('What colour is it?'), /^A modern grey saloon with a fastback roof/);
  assert.match(await ask('How many can I own?'), /one of each of our cars/);
  assert.equal(await ask('Which one do you recommend?'), 'For a first car, the Grey Saloon at 2,000 TR; the Gold Hypercar on the turntable, at 18,000 TR, is the fastest car in town.');
  assert.match(await ask('Are you a real person?'), /^I'm Tochi.*west side.*game's people.*automatic/);
  assert.match(await ask('kedu'), /What would you like to know about the Grey Saloon/);
  // asking costs nothing and buys nothing
  assert.deepEqual(await parts(p), { balance: 2000 * TR, starter: 2000 * TR, eligible: 0 });
  assert.equal((await p.ok('market.mine')).holdings.length, 0);
  // the other side of the floor, and what is said of the fastest cars and the gentlest
  const reply = (id, text) => { const c = CARS.find((x) => x.id === id); return carSalesmanReply({ status: 'open', asset_name: c.name, price: c.price, model: `car:${id}`, blurb: c.blurb }, text); };
  assert.match(reply('gold-hypercar', 'who are you?'), /^I'm Oluchi.*east side/);
  assert.equal(reply('gold-hypercar', 'top speed?'), 'Flat out, the Gold Hypercar does about 350 km/h: the fastest car in town.');
  assert.equal(reply('red-winged-supercar', 'how fast?'), 'Flat out, the Red Winged Supercar does about 320 km/h: one of the fastest cars on our floor.');
  assert.equal(reply('classic-two-tone', 'how fast?'), 'Flat out, the Classic Two-Tone does about 145 km/h: one of the gentlest cars on our floor.');
  assert.equal(reply('peach-suv', 'how fast?'), 'Flat out, the Peach Luxury SUV does about 220 km/h.');
  assert.match(reply('state-limousine', 'what engine does it have?'), /is a limousine, and it does about 180 km\/h/);
});

test('earned TR buys a car: the price exactly, paid to the town; the car is the buyer\'s, new and not one of a numbered edition', async () => {
  const sql = await database();
  const world = async () => Number((await sql.unsafe(`select balance from pcw.wallets where code = 'world'`))[0].balance);
  // (test setup: 2,000 TR earned in town, as the game reports it with a save; harness.mjs, earn)
  const p = await earner('Driver', 2000 * TR);
  assert.deepEqual(await parts(p), { balance: 4000 * TR, starter: 2000 * TR, eligible: 2000 * TR });
  const before = await listingOf(p, 'grey-saloon');
  // under the price: refused, and nothing moves
  assert.equal((await buy(p, 'grey-saloon', 1900 * TR)).body.offer.status, 'declined');
  assert.deepEqual(await parts(p), { balance: 4000 * TR, starter: 2000 * TR, eligible: 2000 * TR });
  // more than the price pays the price and no more, out of earned TR, to the town
  const town = await world();
  const sold = await buy(p, 'grey-saloon', 2600 * TR);
  assert.equal(sold.status, 200, JSON.stringify(sold.body));
  assert.equal(sold.body.offer.status, 'accepted');
  assert.deepEqual({ amount: sold.body.sale.amount, what: sold.body.sale.what }, { amount: 2000 * TR, what: 'Grey Saloon' });
  assert.deepEqual(await parts(p), { balance: 2000 * TR, starter: 2000 * TR, eligible: 0 }, 'the arrival money is untouched');
  assert.equal(await world() - town, 2000 * TR);
  // at the bank: earned TR out of the buyer's wallet and the same into the town's, and nothing else; not as a motorcycle is paid for
  const legs = await sql.unsafe(`select e.amount, e.bucket, w.code, t.kind, t.meta from pcw.wallet_entries e join pcw.wallets w on w.id = e.wallet_id join pcw.wallet_tx t on t.id = e.tx_id where t.meta->>'sale' = $1 order by e.amount`, [sold.body.sale.id]);
  assert.deepEqual(legs.map((r) => [Number(r.amount), r.bucket, r.code, r.kind]), [[-2000 * TR, 'earned', null, 'sale'], [2000 * TR, null, 'world', 'sale']]);
  assert.equal(legs[0].meta.starterFor, undefined);
  assert.equal(legs[0].meta.shop, 'Post Civil War Car Showroom');
  // it is theirs: a car, new from the showroom, with no number
  const mine = await p.ok('market.mine');
  assert.equal(mine.holdings.length, 1);
  const h = mine.holdings[0];
  assert.deepEqual({ model: h.asset.model, category: h.asset.category, name: h.name, serial: h.serial, edition: h.edition, paid: h.paid }, { model: 'car:grey-saloon', category: 'car', name: 'Grey Saloon', serial: null, edition: null, paid: 2000 * TR });
  assert.deepEqual(mine.history.map((x) => [x.side, x.other, x.amount, x.name]), [['bought', 'Post Civil War Car Showroom', 2000 * TR, 'Grey Saloon']]);
  assert.deepEqual({ debits: mine.debits, credits: mine.credits }, { debits: [], credits: [] });
  const row = (await sql.unsafe(`select serial, edition, starter_basis, origin_listing from pcw.holdings where id = $1`, [h.id]))[0];
  assert.deepEqual({ serial: row.serial, edition: row.edition, starterBasis: Number(row.starter_basis), from: row.origin_listing }, { serial: null, edition: null, starterBasis: 0, from: before.id });
  // the showroom has sold one and still has it for sale
  const now = await listingOf(p, 'grey-saloon');
  assert.deepEqual({ status: now.status, left: now.left }, { status: 'open', left: before.left - 1 });
  // the wallet's history says what was bought, from whom, and that none of it was arrival money
  const entry = (await p.ok('wallet.history')).entries[0];
  assert.deepEqual({ type: entry.type, amount: entry.amount, other: entry.other, what: entry.what, starter: entry.starter }, { type: 'bought', amount: 2000 * TR, other: 'Post Civil War Car Showroom', what: 'Grey Saloon', starter: 0 });
  // one of each car: a second Grey Saloon is refused whatever there is to pay with, and nothing moves
  await earn(p, 3000 * TR);
  const again = await buy(p, 'grey-saloon');
  assert.equal(again.status, 409);
  assert.equal(again.body.code, 'OWNED');
  assert.equal(again.body.message, 'You already own the Grey Saloon. One of each car to an account.');
  assert.deepEqual(await parts(p), { balance: 5000 * TR, starter: 2000 * TR, eligible: 3000 * TR });
  // ...but another car is another car
  assert.equal((await buy(p, 'classic-two-tone')).body.offer.status, 'accepted');
  assert.deepEqual((await p.ok('market.mine')).holdings.map((x) => x.asset.model).sort(), ['car:classic-two-tone', 'car:grey-saloon']);
  assert.deepEqual(await parts(p), { balance: 2500 * TR, starter: 2000 * TR, eligible: 500 * TR });
  // and the database itself holds an account to one of each, whatever the market's code might do
  const owner = (await sql.unsafe(`select id from pcw.accounts where username_key = $1`, [p.username.toLowerCase()]))[0].id;
  await assert.rejects(sql.unsafe(`insert into pcw.holdings (asset_id, owner_id) values ('car-grey-saloon', $1)`, [owner]), /holdings_one_car/);
  await clean();
});

test('asked for twice at once, a car is bought once', async () => {
  const p = await earner('Twice', 3000 * TR);
  const l = await listingOf(p, 'black-pickup');
  const { thread } = await p.ok('market.open', { listing: l.id, at: atStand(l) });
  const answers = await Promise.all([p.call('market.offer', { thread: thread.id, offer: uuid(), amount: l.price }), p.call('market.offer', { thread: thread.id, offer: uuid(), amount: l.price })]);
  assert.equal(answers.filter((a) => a.body.ok && a.body.offer.status === 'accepted').length, 1, JSON.stringify(answers.map((a) => a.body.code || a.body.offer.status)));
  assert.deepEqual((await p.ok('market.mine')).holdings.map((x) => x.asset.model), ['car:black-pickup']);
  assert.deepEqual(await parts(p), { balance: 2000 * TR, starter: 2000 * TR, eligible: 0 });
  await clean();
});

test('arrival money does not buy a car, as it does a motorcycle: refused in the words for any thing to own, and nothing moves', async () => {
  const p = await newPlayer('Walker');
  assert.deepEqual(await parts(p), { balance: 2000 * TR, starter: 2000 * TR, eligible: 0 });
  // the Grey Saloon is 2,000 TR: exactly the arrival money, and all of it starter TR
  const no = await buy(p, 'grey-saloon');
  assert.equal(no.status, 409);
  assert.equal(no.body.code, 'STARTER_FUNDS');
  assert.equal(no.body.message, 'Starter TR cannot be used to buy assets. Earn TR through gameplay to make purchases.');
  // a dearer car is more than there is at all
  assert.equal((await buy(p, 'classic-two-tone')).body.code, 'FUNDS');
  // some earned, but not enough: the arrival money does not make up the rest
  await earn(p, 1000 * TR);
  const short = await buy(p, 'grey-saloon');
  assert.equal(short.body.code, 'ELIGIBLE_FUNDS');
  assert.match(short.body.message, /^You do not have enough eligible TR for this transaction\. 1,000 TR of your 3,000 TR is TR you have earned; the other 2,000 TR is starter TR\. Starter TR cannot be used to buy assets\./);
  assert.deepEqual(await parts(p), { balance: 3000 * TR, starter: 2000 * TR, eligible: 1000 * TR });
  assert.equal((await p.ok('market.mine')).holdings.length, 0);
  // each refusal is written down, as every refusal over money is
  const sql = await database();
  const lines = await sql.unsafe(`select r.op, r.code from pcw.wallet_refusals r join pcw.accounts a on a.id = r.account_id where a.username_key = $1 order by r.id`, [p.username.toLowerCase()]);
  assert.deepEqual(lines.map((r) => [r.op, r.code]), [['market.offer', 'STARTER_FUNDS'], ['market.offer', 'FUNDS'], ['market.offer', 'ELIGIBLE_FUNDS']]);
  // the same arrival money still buys a motorcycle (migration 6): it is only the car that it does not buy
  const bike = (await p.ok('market.list', { q: 'motorcycle' })).listings.find((x) => x.asset.model === 'bike:streetfighter');
  const t = (await p.ok('market.open', { listing: bike.id, at: { x: bike.place.x, z: bike.place.z } })).thread;
  assert.equal((await p.call('market.offer', { thread: t.id, offer: uuid(), amount: bike.price })).body.offer.status, 'accepted');
  assert.deepEqual(await parts(p), { balance: 2000 * TR, starter: 1000 * TR, eligible: 1000 * TR });
  // (2,000 TR in all, as much as the Grey Saloon, but half of it arrival money)
  assert.equal((await buy(p, 'grey-saloon')).body.code, 'ELIGIBLE_FUNDS');
  assert.deepEqual((await p.ok('market.mine')).holdings.map((x) => x.asset.model), ['bike:streetfighter']);
  await clean();
});

test('a car sold on: one of each still holds second-hand, and the seller is paid in earned TR', async () => {
  const seller = await earner('Seller', 2000 * TR);
  assert.equal((await buy(seller, 'grey-saloon')).body.offer.status, 'accepted');
  const holding = (await seller.ok('market.mine')).holdings[0];
  const spot = { x: 41, z: -10, label: 'Market Road' };
  const { listing } = await seller.ok('market.sell', { holding: holding.id, price: 2100 * TR, place: spot, zone: ZONE });
  assert.equal(listing.name, 'Grey Saloon');
  // someone who already has a Grey Saloon cannot have a second, second-hand
  const owner = await earner('Owner', 2000 * TR);
  assert.equal((await buy(owner, 'grey-saloon')).body.offer.status, 'accepted');
  const t1 = (await owner.ok('market.open', { listing: listing.id, at: { x: 41, z: -11 } })).thread;
  assert.equal((await owner.call('market.offer', { thread: t1.id, offer: uuid(), amount: 2100 * TR })).body.code, 'OWNED');
  // someone who has none can, from the seller, with earned TR set aside for the offer
  const buyer = await earner('Keen', 2200 * TR);
  const t2 = (await buyer.ok('market.open', { listing: listing.id, at: { x: 41, z: -11 } })).thread;
  const offerId = uuid();
  assert.equal((await buyer.ok('market.offer', { thread: t2.id, offer: offerId, amount: 2100 * TR })).offer.status, 'pending');
  const done = await seller.ok('market.decide', { offer: offerId, accept: true, amount: 2100 * TR });
  assert.equal(done.offer.status, 'accepted');
  const theirs = (await buyer.ok('market.mine')).holdings;
  assert.deepEqual(theirs.map((x) => [x.id, x.asset.model, x.serial, x.paid]), [[holding.id, 'car:grey-saloon', null, 2100 * TR]]);
  assert.deepEqual(await parts(seller), { balance: 4100 * TR, starter: 2000 * TR, eligible: 2100 * TR }, 'it was bought with earned TR: all it fetched is earned');
  assert.deepEqual(await parts(buyer), { balance: 2100 * TR, starter: 2000 * TR, eligible: 100 * TR });
  assert.equal((await seller.ok('market.mine')).holdings.length, 0);
  await clean();
});
