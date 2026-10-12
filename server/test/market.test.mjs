// The market against a real PostgreSQL: what is for sale, the talk, the sale, the stock, selling on.
//   server/with-postgres.sh node --test server/test/*.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { person, earner, database, closeDatabase, uuid, HOLARIS, NEAR_HOLARIS, ZONE } from './harness.mjs';

// Everyone who buys here has earned TR to buy with (2,000 TR besides the arrival money): a thing to own is not
// bought with starter TR (wallet.test.mjs is where that is tried).
const newPlayer = (prefix) => earner(prefix, 4000);

after(() => closeDatabase());

const TR = 2;
const watch = async (p) => (await p.ok('market.list', { q: 'watch' })).listings.find((l) => l.id === HOLARIS.listing) || null;
const openAtShop = (p) => p.ok('market.open', { listing: HOLARIS.listing, at: NEAR_HOLARIS });
// buys one watch at the shop's price; gives the server's answer
async function buyWatch(p) {
  const { thread } = await openAtShop(p);
  return p.ok('market.offer', { thread: thread.id, offer: uuid(), amount: 100 * TR });
}

test('the first thing for sale is the wristwatch: 100 TR, ten of them, at HOLARIS Watch; anyone may look', async () => {
  const guest = person();
  const all = (await guest.ok('market.list', {})).listings;
  assert.equal(all.length, 1);
  const w = all[0];
  assert.equal(w.asset.name, 'HOLARIS Wristwatch');
  assert.equal(w.asset.model, 'watch');
  assert.equal(w.price, 100 * TR);
  assert.equal(w.stock, 10);
  assert.equal(w.left, 10);
  assert.equal(w.seller, 'HOLARIS Watch');
  assert.equal(w.place.zone, ZONE);
  assert.ok(Number.isFinite(w.place.x) && Number.isFinite(w.place.z));
  // searching
  for (const q of ['watch', 'WATCHES', 'wrist', 'holaris', 'holaris watch', 'jewellery']) assert.equal((await guest.ok('market.list', { q })).listings.length, 1, q);
  for (const q of ['car', 'yacht', 'bike', 'motorcycle', 'gun', 'clothe', 'watch car', '100%', '_']) assert.equal((await guest.ok('market.list', { q })).listings.length, 0, q);
  // but only an account can do anything
  assert.equal((await guest.call('market.mine')).status, 401);
  assert.equal((await guest.call('market.open', { listing: HOLARIS.listing, at: NEAR_HOLARIS })).status, 401);
});

test('talking to the shop begins at its door, and its attendant says what it is', async () => {
  const p = await newPlayer('Talker');
  const far = await p.call('market.open', { listing: HOLARIS.listing, at: { x: NEAR_HOLARIS.x + 60, z: NEAR_HOLARIS.z } });
  assert.equal(far.status, 403);
  assert.equal(far.body.code, 'TOO_FAR');
  const nowhere = await p.call('market.open', { listing: HOLARIS.listing });
  assert.equal(nowhere.body.code, 'TOO_FAR');
  const { thread, messages } = await openAtShop(p);
  assert.equal(thread.role, 'buyer');
  assert.equal(thread.other, 'HOLARIS Watch');
  assert.equal(thread.automatic, true);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].from, 'shop');
  assert.match(messages[0].body, /Welcome to HOLARIS Watch\. The HOLARIS Wristwatch is 100 TR\. \d+ of 10 (is|are) left\./);
  // typed questions: it knows the price and the stock, says it is a machine, and does not bargain
  const said = async (text) => { const r = await p.ok('market.say', { thread: thread.id, text, after: 0 }); return r.messages[r.messages.length - 1]; };
  assert.match((await said('Can you do 80?')).body, /The price is 100 TR\. It is not reduced\./);
  assert.match((await said('how many are left')).body, /of 10 (is|are) left/);
  assert.match((await said('good morning')).body, /a machine, not a person/);
  // it explains itself once, not every time
  const again = await p.ok('market.say', { thread: thread.id, text: 'hello again', after: 0 });
  assert.equal(again.messages[again.messages.length - 1].from, 'me');
  // coming back takes the conversation up where it was, from anywhere
  const back = await p.ok('market.open', { listing: HOLARIS.listing, at: { x: 0, z: 0 } });
  assert.equal(back.thread.id, thread.id);
  assert.ok(back.messages.length >= 8);
  // text is text
  const html = await said('<b>hi</b>\u0000\n\n  there');
  assert.ok(true, html.body);
  const all = await p.ok('market.read', { thread: thread.id, after: 0 });
  assert.ok(all.messages.some((m) => m.body === '<b>hi</b> there'));
  // nobody else can read it or write in it
  const stranger = await newPlayer('Nosy');
  assert.equal((await stranger.call('market.read', { thread: thread.id })).status, 404);
  assert.equal((await stranger.call('market.say', { thread: thread.id, text: 'hello' })).status, 404);
});

test('an offer under the shop\'s price is refused; the price buys it, once, and it is the buyer\'s', async () => {
  const p = await newPlayer('Buyer');
  const { thread } = await openAtShop(p);
  const before = (await watch(p)).left;
  const low = await p.ok('market.offer', { thread: thread.id, offer: uuid(), amount: 80 * TR });
  assert.equal(low.offer.status, 'declined');
  assert.equal(low.sale, null);
  assert.equal((await watch(p)).left, before);
  const offerId = uuid();
  const bought = await p.ok('market.offer', { thread: thread.id, offer: offerId, amount: 100 * TR });
  assert.equal(bought.offer.status, 'accepted');
  assert.equal(bought.sale.amount, 100 * TR);
  assert.match(bought.sale.what, /^HOLARIS Wristwatch No\. \d+ of 10$/);
  assert.equal((await watch(p)).left, before - 1);
  // the same press arriving again (a poor connection) is the same sale, not a second
  const again = await p.ok('market.offer', { thread: thread.id, offer: offerId, amount: 100 * TR });
  assert.equal(again.offer.status, 'accepted');
  assert.equal(again.sale.id, bought.sale.id);
  assert.equal((await watch(p)).left, before - 1);
  const mine = await p.ok('market.mine');
  assert.equal(mine.holdings.length, 1);
  assert.equal(mine.holdings[0].name, bought.sale.what);
  assert.equal(mine.holdings[0].paid, 100 * TR);
  assert.equal(mine.history.length, 1);
  assert.deepEqual({ side: mine.history[0].side, other: mine.history[0].other, amount: mine.history[0].amount }, { side: 'bought', other: 'HOLARIS Watch', amount: 100 * TR });
  // the price left the buyer's wallet as the watch became theirs: once, for the two askings; neither game is left anything to settle
  assert.equal(bought.balance, 4000 * TR - 100 * TR);
  assert.equal(again.balance, 4000 * TR - 100 * TR);
  assert.equal((await p.ok('wallet.get')).wallet.balance, 4000 * TR - 100 * TR);
  assert.deepEqual(mine.debits, []);
  assert.equal((await p.ok('market.sync', { offers: [offerId] })).offers[offerId], 'accepted');
  // an offer under the price took nothing
  assert.equal((await p.ok('wallet.history')).entries.filter((e) => e.type === 'bought').length, 1);
  // an offer of more than the price pays the price
  const generous = await p.ok('market.offer', { thread: thread.id, offer: uuid(), amount: 500 * TR });
  assert.equal(generous.sale.amount, 100 * TR);
});

test('offers that are not offers are refused', async () => {
  const p = await newPlayer('Odd');
  const { thread } = await openAtShop(p);
  for (const amount of [0, -5, 1.5, '200', null, 3e12, Number.NaN]) assert.equal((await p.call('market.offer', { thread: thread.id, offer: uuid(), amount })).status, 400, String(amount));
  assert.equal((await p.call('market.offer', { thread: thread.id, offer: 'not-an-id', amount: 200 })).status, 400);
  assert.equal((await p.call('market.offer', { thread: uuid(), offer: uuid(), amount: 200 })).status, 404);
});

test('an offer the market never heard of can be voided, and can then never be made', async () => {
  const p = await newPlayer('Voider');
  const { thread } = await openAtShop(p);
  const lost = uuid();
  assert.equal((await p.ok('market.sync', { offers: [lost] })).offers[lost], 'unknown');
  assert.equal((await p.ok('market.withdraw', { offer: lost })).offer.status, 'void');
  const late = await p.ok('market.offer', { thread: thread.id, offer: lost, amount: 100 * TR });
  assert.equal(late.offer.status, 'void');
  assert.equal(late.sale, null);
  assert.equal((await p.ok('market.mine')).holdings.length, 0);
});

test('an owner sells on: a listing with its own marker, a real conversation, an offer, and the owner\'s yes', async () => {
  const seller = await newPlayer('Seller'), buyer = await newPlayer('Keen'), rival = await newPlayer('Rival');
  const bought = await buyWatch(seller);
  const holding = (await seller.ok('market.mine')).holdings[0];
  const spot = { x: 40.26, z: -12.04, label: 'By the clinic' };
  // only its owner can list it, once, at a real price and place
  assert.equal((await buyer.call('market.sell', { holding: holding.id, price: 300, place: spot, zone: ZONE })).status, 404);
  assert.equal((await seller.call('market.sell', { holding: holding.id, price: 0, place: spot, zone: ZONE })).status, 400);
  assert.equal((await seller.call('market.sell', { holding: holding.id, price: 300, place: { x: 'here' }, zone: ZONE })).status, 400);
  const { listing } = await seller.ok('market.sell', { holding: holding.id, price: 150 * TR, place: spot, zone: ZONE });
  assert.equal(listing.kind, 'resale');
  assert.equal(listing.name, bought.sale.what);
  assert.equal(listing.seller, seller.username);
  assert.equal(listing.mine, true);
  assert.deepEqual(listing.place, { zone: ZONE, x: 40.3, z: -12, label: 'By the clinic' });
  assert.equal((await seller.call('market.sell', { holding: holding.id, price: 300, place: spot, zone: ZONE })).body.code, 'LISTED');
  // it is in the market, found by its seller's name too
  const found = (await buyer.ok('market.list', { q: seller.username })).listings;
  assert.equal(found.length, 1);
  assert.equal(found[0].mine, false);
  // the seller cannot buy from themselves; the buyer must come to the marker
  assert.equal((await seller.call('market.open', { listing: listing.id, at: spot })).body.code, 'OWN');
  assert.equal((await buyer.call('market.open', { listing: listing.id, at: { x: 0, z: 0 } })).body.code, 'TOO_FAR');
  const { thread, messages } = await buyer.ok('market.open', { listing: listing.id, at: { x: 41, z: -11 } });
  assert.equal(thread.automatic, false);
  assert.equal(thread.other, seller.username);
  assert.deepEqual(messages, []);
  // they talk: each sees the other's words, and nothing answers for the seller
  await buyer.ok('market.say', { thread: thread.id, text: 'Will you take 120?' });
  let sellerSide = await seller.ok('market.sync', {});
  assert.equal(sellerSide.unread, 1);
  const inbox = (await seller.ok('market.mine')).threads;
  assert.equal(inbox.length, 2);      // the shop, and this buyer
  const theirs = inbox.find((t) => t.id === thread.id);
  assert.deepEqual({ role: theirs.role, other: theirs.other, unread: theirs.unread, last: theirs.last.body }, { role: 'seller', other: buyer.username, unread: 1, last: 'Will you take 120?' });
  const read = await seller.ok('market.read', { thread: thread.id, after: 0 });
  assert.deepEqual(read.messages.map((m) => [m.from, m.body]), [['them', 'Will you take 120?']]);
  assert.equal((await seller.ok('market.sync', {})).unread, 0);
  await seller.ok('market.say', { thread: thread.id, text: '140 and it is yours.' });
  const heard = await buyer.ok('market.read', { thread: thread.id, after: read.messages[0].id });
  assert.deepEqual(heard.messages.map((m) => [m.from, m.body]), [['them', '140 and it is yours.']]);
  // the offer waits for the seller; a second cannot be made on top of it; the buyer cannot answer it
  const offerId = uuid();
  const made = await buyer.ok('market.offer', { thread: thread.id, offer: offerId, amount: 140 * TR });
  assert.equal(made.offer.status, 'pending');
  assert.equal(made.sale, null);
  assert.equal((await buyer.call('market.offer', { thread: thread.id, offer: uuid(), amount: 141 * TR })).body.code, 'PENDING');
  assert.equal((await buyer.call('market.decide', { offer: offerId, accept: true })).status, 404);
  assert.equal((await rival.call('market.decide', { offer: offerId, accept: true })).status, 404);
  sellerSide = await seller.ok('market.sync', {});
  assert.equal(sellerSide.toDecide, 1);
  assert.deepEqual((await seller.ok('market.read', { thread: thread.id, after: 0 })).thread.offer, { id: offerId, amount: 140 * TR });
  // the seller is shown 140 and says yes to 140: not to anything else
  assert.equal((await seller.call('market.decide', { offer: offerId, accept: true, amount: 150 * TR })).body.code, 'CHANGED');
  const sold = await seller.ok('market.decide', { offer: offerId, accept: true, amount: 140 * TR });
  assert.equal(sold.offer.status, 'accepted');
  assert.equal(sold.sale.amount, 140 * TR);
  // it has left the seller and is the buyer's; the listing is gone from the market
  assert.deepEqual((await seller.ok('market.mine')).holdings, []);
  const now = await buyer.ok('market.mine');
  assert.equal(now.holdings.length, 1);
  assert.equal(now.holdings[0].id, holding.id);
  assert.equal(now.holdings[0].name, bought.sale.what);
  assert.equal(now.holdings[0].paid, 140 * TR);
  assert.equal((await buyer.ok('market.list', { q: seller.username })).listings.length, 0);
  // exactly 140 TR has left the buyer's wallet and reached the seller's, in the bank, with the watch; nothing is left owing
  assert.equal((await buyer.ok('wallet.get')).wallet.balance, 4000 * TR - 140 * TR);
  assert.equal((await seller.ok('wallet.get')).wallet.balance, 4000 * TR - 100 * TR + 140 * TR);
  assert.equal((await rival.ok('wallet.get')).wallet.balance, 4000 * TR);
  assert.deepEqual(now.debits, []);
  const due = await seller.ok('market.sync', {});
  assert.deepEqual({ credits: due.credits, debits: due.debits }, { credits: [], debits: [] });
  assert.equal(due.wallet.balance, 4000 * TR + 40 * TR);
  // a game cannot say that anything was paid or received: what a save claims of sales changes no wallet
  await rival.ok('save.put', { baseRev: (await rival.ok('me')).save.rev, enc: 'json', data: '{}', applied: { debits: [sold.sale.id], credits: [sold.sale.id] } });
  assert.equal((await rival.ok('wallet.get')).wallet.balance, 4000 * TR);
  // both have it in their history
  assert.deepEqual((await seller.ok('market.mine')).history.map((h) => [h.side, h.other, h.amount]), [['sold', buyer.username, 140 * TR], ['bought', 'HOLARIS Watch', 100 * TR]]);
  assert.deepEqual(now.history.map((h) => [h.side, h.other, h.amount]), [['bought', seller.username, 140 * TR]]);
  // it cannot be sold twice
  assert.equal((await seller.call('market.decide', { offer: offerId, accept: true })).body.code, 'DECIDED');
  assert.equal((await seller.call('market.sell', { holding: holding.id, price: 300, place: spot, zone: ZONE })).status, 404);
});

test('an offer withdrawn cannot be accepted; one refused leaves everything as it was; a listing taken down refuses what was waiting', async () => {
  const seller = await newPlayer('Owner'), buyer = await newPlayer('Wavering');
  await buyWatch(seller);
  const holding = (await seller.ok('market.mine')).holdings[0];
  const spot = { x: 10, z: 10, label: 'Under the tree' };
  const { listing } = await seller.ok('market.sell', { holding: holding.id, price: 120 * TR, place: spot, zone: ZONE });
  const { thread } = await buyer.ok('market.open', { listing: listing.id, at: spot });
  const first = uuid();
  await buyer.ok('market.offer', { thread: thread.id, offer: first, amount: 90 * TR });
  assert.equal((await buyer.ok('market.withdraw', { offer: first })).offer.status, 'withdrawn');
  assert.equal((await seller.call('market.decide', { offer: first, accept: true })).body.code, 'DECIDED');
  const second = uuid();
  await buyer.ok('market.offer', { thread: thread.id, offer: second, amount: 95 * TR });
  assert.equal((await seller.ok('market.decide', { offer: second, accept: false })).offer.status, 'declined');
  assert.equal((await buyer.ok('market.sync', { offers: [first, second] })).offers[second], 'declined');
  assert.equal((await seller.ok('market.mine')).holdings.length, 1);
  assert.equal((await buyer.ok('market.mine')).holdings.length, 0);
  const third = uuid();
  await buyer.ok('market.offer', { thread: thread.id, offer: third, amount: 100 * TR });
  // only the seller takes it down
  assert.equal((await buyer.call('market.unlist', { listing: listing.id })).status, 403);
  assert.equal((await seller.ok('market.unlist', { listing: listing.id })).listing.status, 'closed');
  assert.equal((await buyer.ok('market.sync', { offers: [third] })).offers[third], 'declined');
  assert.equal((await seller.call('market.decide', { offer: third, accept: true })).body.code, 'DECIDED');
  assert.equal((await buyer.call('market.offer', { thread: thread.id, offer: uuid(), amount: 120 * TR })).body.code, 'GONE');
  // the words of the conversation say what happened
  const kinds = (await buyer.ok('market.read', { thread: thread.id, after: 0 })).messages.map((m) => m.kind);
  assert.deepEqual(kinds, ['offer', 'withdrawn', 'offer', 'declined', 'offer', 'declined']);
  // and the owner can list it again
  assert.equal((await seller.ok('market.sell', { holding: holding.id, price: 130 * TR, place: spot, zone: ZONE })).listing.status, 'open');
});

test('only an administrator puts new things into the market', async () => {
  const player = await newPlayer('Plain');
  const what = { asset: HOLARIS.asset, price: 50 * TR, stock: 3, shop: 'govt-store', shopName: 'Government Store', place: { x: 0, z: 0, label: 'Secretariat' }, zone: ZONE };
  assert.equal((await player.call('admin.list', what)).status, 403);
  assert.equal((await player.call('admin.assets')).status, 403);
  assert.equal((await player.call('market.unlist', { listing: HOLARIS.listing })).status, 403);
  assert.equal((await player.ok('me')).account.admin, false);
  // the owner names administrators in the site's settings, never in the page
  const boss = await newPlayer('Boss');
  process.env.PCW_ADMINS = `someone_else, ${boss.username.toUpperCase()}`;
  try {
    assert.equal((await boss.ok('me')).account.admin, true);
    assert.equal((await player.call('admin.list', what)).status, 403);
    assert.equal((await boss.ok('admin.assets')).assets.length, 1);
    assert.equal((await boss.call('admin.list', { ...what, asset: 'a-yacht-nobody-made' })).status, 404);
    assert.equal((await boss.call('admin.list', { ...what, stock: 0 })).status, 400);
    const { listing } = await boss.ok('admin.list', what);
    assert.equal(listing.kind, 'primary');
    assert.equal(listing.left, 3);
    assert.equal((await player.ok('market.list', { q: 'government' })).listings.length, 1);
    assert.equal((await boss.ok('market.unlist', { listing: listing.id })).listing.status, 'closed');
    assert.equal((await player.ok('market.list', { q: 'government' })).listings.length, 0);
  } finally { delete process.env.PCW_ADMINS; }
  assert.equal((await boss.ok('me')).account.admin, false);
});

// Last, because it empties the shop.
test('ten watches, and never an eleventh: many buyers at once are served one after another, and then it is gone from the market', async () => {
  const sql = await database();
  const left = (await watch(person())).left;
  assert.ok(left >= 3 && left <= 10);
  const buyers = [];
  for (let i = 0; i < left + 5; i += 1) buyers.push(await newPlayer('Rush'));
  const threads = [];
  for (const b of buyers) threads.push((await openAtShop(b)).thread.id);
  const answers = await Promise.all(buyers.map((b, i) => b.call('market.offer', { thread: threads[i], offer: uuid(), amount: 100 * TR })));
  const sold = answers.filter((a) => a.status === 200 && a.body.sale);
  const missed = answers.filter((a) => !(a.status === 200 && a.body.sale));
  assert.equal(sold.length, left);
  assert.equal(missed.length, 5);
  for (const a of missed) assert.ok((a.status === 200 && a.body.offer.status === 'declined') || a.body.code === 'GONE', JSON.stringify(a.body).slice(0, 200));
  // every watch has its own number, 1 to 10, and one owner
  const holdings = await sql.unsafe(`select serial, edition, owner_id from pcw.holdings where origin_listing = $1 order by serial`, [HOLARIS.listing]);
  assert.deepEqual(holdings.map((h) => h.serial), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.ok(holdings.every((h) => h.edition === 10));
  const row = (await sql.unsafe(`select stock, sold, status, closed_at from pcw.listings where id = $1`, [HOLARIS.listing]))[0];
  assert.deepEqual({ stock: row.stock, sold: row.sold, status: row.status }, { stock: 10, sold: 10, status: 'sold' });
  assert.ok(row.closed_at);
  assert.equal((await sql.unsafe(`select count(*)::int as n from pcw.sales where listing_id = $1`, [HOLARIS.listing]))[0].n, 10);
  // it has vanished from the store
  assert.equal(await watch(person()), null);
  assert.equal((await person().ok('market.list', {})).listings.filter((l) => l.kind === 'primary').length, 0);
  // and cannot be bought by someone who was already standing in the shop
  const late = await buyers[0].call('market.offer', { thread: threads[0], offer: uuid(), amount: 100 * TR });
  assert.equal(late.body.code, 'GONE');
  assert.match((await buyers[0].ok('market.say', { thread: threads[0], text: 'any left?' })).messages.pop().body, /sold out/);
  // the money owed is exactly ten sales of 100 TR, each owed by its own buyer
  const owed = await sql.unsafe(`select count(distinct buyer_id)::int as buyers, sum(amount)::int as total from pcw.sales where listing_id = $1`, [HOLARIS.listing]);
  assert.equal(owed[0].total, 10 * 100 * TR);
});
