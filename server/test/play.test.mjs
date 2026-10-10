// The game's own client code against the real server: accounts, the character kept with them, and a watch
// bought, sold on and paid for, with each player's own world and ledger.
//   server/with-postgres.sh node --test server/test/*.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { browser, closeDatabase, database, HOLARIS, NEAR_HOLARIS, ZONE } from './harness.mjs';
import { createOnline, packSave, unpackSave, createWebTransport } from '../../prototype/src/net/online.js';
import { createMarket, createAccountSync } from '../../prototype/src/client/market.js';
import { createHost } from '../../prototype/src/sim/host.js';
import { ARRIVAL_FUNDS } from '../../prototype/src/sim/sim.js';
import { TR } from '../../prototype/src/sim/ledger.js';
import { createLink } from '../../prototype/src/net/link.js';

after(() => closeDatabase());

let n = 0;
// One device: a browser, a game, and the pieces of the page that talk to the server.
function device(address) {
  const web = browser(address);
  const online = createOnline({ available: true, fetcher: web.fetcher });
  const d = { web, online, host: null, playerId: null, events: [], local: null, mark: null, forgotten: 0 };
  d.read = () => (d.playerId ? { host: d.host.save(), playerId: d.playerId } : null);
  d.newCharacter = (name) => { d.host = createHost(); d.playerId = d.host.game.join({ name, look: {} }); };
  d.balance = () => d.host.game.view(d.playerId).self.balance;
  d.market = createMarket({ online, bridge: () => (d.host ? d.host.market : null), playerId: () => d.playerId, zone: ZONE, notify: (e) => d.events.push(e), saveSoon: () => { d.wantsSave = true; } });
  d.sync = createAccountSync({
    online, read: d.read, pack: packSave, unpack: unpackSave,
    adopt: (saved) => { d.host = createHost({ saved: saved.host }); d.playerId = saved.playerId; d.adopted = (d.adopted || 0) + 1; },
    forget: () => { d.host = null; d.playerId = null; d.forgotten += 1; },
    summary: () => ({ name: d.host.game.view(d.playerId).self.name, figure: 'W1', tr: d.balance() }),
    applied: () => d.market.applied(),
    mark: { get: () => d.mark, set: (v) => { d.mark = v; } },
    notify: (e) => d.events.push(e),
  });
  return d;
}
const name = (prefix) => `${prefix}${(n += 1)}${Math.random().toString(36).slice(2, 5)}`.slice(0, 16);
async function player(prefix, characterName) {
  const d = device();
  await d.online.check();
  d.newCharacter(characterName);
  d.username = name(prefix);
  const made = await d.sync.signUp(d.username, `${d.username} password`);
  assert.equal(made.ok, true, made.message);
  return d;
}

test('a page with no server asks the network for nothing', async () => {
  let asked = 0;
  const online = createOnline({ available: false, fetcher: async () => { asked += 1; throw new Error('no'); } });
  assert.equal((await online.check()).state, 'off');
  assert.equal((await online.ask('me')).code, 'NO_SERVER');
  assert.equal(asked, 0);
});

test('a character is squeezed for sending and comes back exactly', async () => {
  const host = createHost();
  const id = host.game.join({ name: 'Round Trip', look: {} });
  const saved = { host: host.save(), playerId: id };
  const packed = await packSave(saved);
  assert.equal(packed.enc, 'gzip-b64');
  assert.ok(packed.data.length < JSON.stringify(saved).length / 4, `${packed.data.length} of ${JSON.stringify(saved).length}`);
  assert.deepEqual(await unpackSave(packed), JSON.parse(JSON.stringify(saved)));
  assert.equal(await unpackSave({ enc: 'gzip-b64', data: 'not a character' }), null);
});

test('an account made while playing keeps the character; another device signs in and plays the same one', async () => {
  const phone = device();
  assert.equal((await phone.online.check()).state, 'out');
  phone.newCharacter('Adaeze Okeke');
  phone.host.market.hold(phone.playerId, { offerId: '11111111-1111-4111-8111-111111111111', amount: 50, what: 'a mark to find again' });
  const username = name('Ada');
  const made = await phone.sync.signUp(username, 'a password for ada');
  assert.equal(made.ok, true);
  assert.equal(phone.online.status().state, 'in');
  assert.equal(phone.sync.rev, 1);
  // the laptop has never seen this character
  const laptop = device();
  await laptop.online.check();
  const wrong = await laptop.sync.logIn(username, 'not the password');
  assert.equal(wrong.ok, false);
  assert.equal(laptop.playerId, null);
  const inNow = await laptop.sync.logIn(username.toUpperCase(), 'a password for ada');
  assert.equal(inNow.ok, true);
  assert.equal(inNow.adopted, true);
  assert.equal(laptop.host.game.view(laptop.playerId).self.name, 'Adaeze Okeke');
  assert.equal(laptop.balance(), ARRIVAL_FUNDS - 50);
  // played on the laptop, saved; the phone, coming back, finds the newer one and takes it
  laptop.host.market.release(laptop.playerId, '11111111-1111-4111-8111-111111111111');
  assert.equal((await laptop.sync.upload()).ok, true);
  assert.equal(laptop.sync.rev, 2);
  const stale = await phone.sync.upload();
  assert.equal(stale.code, 'NEWER');
  assert.equal(phone.adopted, 1);
  assert.equal(phone.balance(), ARRIVAL_FUNDS);
  assert.deepEqual(phone.events.map((e) => e.type), ['newer']);
  assert.equal(phone.sync.rev, 2);
  // and from then on the phone saves normally
  assert.equal((await phone.sync.upload()).ok, true);
  assert.equal(phone.sync.rev, 3);
  // opening the page again on the laptop: signed in still, and it takes the newer copy before play
  const reopened = device(); reopened.web = laptop.web;
  const again = createOnline({ available: true, fetcher: laptop.web.fetcher });
  assert.equal((await again.check()).state, 'in');
  assert.equal(again.status().save.rev, 3);
});

test('signing out sends the character to the account first and then clears this device; with no connection it does neither', async () => {
  const d = await player('Out', 'Leaving Soon');
  d.host.market.credit(d.playerId, { saleId: '99999999-9999-4999-8999-999999999999', amount: 20, what: 'a gift' });
  d.web.net.down = true;
  const refused = await d.sync.logOut();
  assert.equal(refused.ok, false);
  assert.equal(d.online.status().state, 'in');
  assert.ok(d.playerId);
  d.web.net.down = false;
  assert.equal((await d.sync.logOut()).ok, true);
  assert.equal(d.online.status().state, 'out');
  assert.equal(d.playerId, null);
  assert.equal(d.forgotten, 1);
  const back = await d.sync.logIn(d.username, `${d.username} password`);
  assert.equal(back.adopted, true);
  assert.equal(d.balance(), ARRIVAL_FUNDS + 20);
});

test('a watch bought at the shop: 100 TR leaves the buyer\'s wallet once, and the market knows it has been paid', async () => {
  const d = await player('Shop', 'Shopper One');
  await d.market.list('watch');
  const listing = d.market.state.listings.find((l) => l.id === HOLARIS.listing);
  assert.equal(listing.price, 100 * TR);
  const opened = await d.market.open(listing.id, NEAR_HOLARIS);
  assert.equal(opened.ok, true);
  // too little: refused, and the money is back at once
  const low = await d.market.offer(opened.thread.id, 60 * TR, listing.name);
  assert.equal(low.offer.status, 'declined');
  assert.equal(d.balance(), ARRIVAL_FUNDS);
  assert.equal(d.market.held().held, 0);
  const bought = await d.market.offer(opened.thread.id, 100 * TR, listing.name);
  assert.equal(bought.offer.status, 'accepted');
  assert.equal(d.balance(), ARRIVAL_FUNDS - 100 * TR);
  assert.equal(d.market.held().held, 0);
  const mine = await d.market.mine();
  assert.equal(mine.holdings.length, 1);
  assert.equal(mine.debits.length, 1);            // not yet said with a save
  assert.equal(d.balance(), ARRIVAL_FUNDS - 100 * TR, 'being told again that it is owed does not take it again');
  assert.equal((await d.sync.upload()).ok, true);
  assert.deepEqual((await d.market.mine()).debits, []);
  assert.deepEqual(d.host.auditor.reconcile(), []);
});

test('more than the wallet holds cannot be offered, and nothing is sent', async () => {
  const d = await player('Poor', 'Thin Purse');
  const opened = await d.market.open(HOLARIS.listing, NEAR_HOLARIS);
  const calls = d.web.net.calls;
  const r = await d.market.offer(opened.thread.id, ARRIVAL_FUNDS + 2, 'a watch');
  assert.equal(r.ok, false);
  assert.equal(r.code, 'INSUFFICIENT');
  assert.equal(d.web.net.calls, calls);
  assert.equal(d.balance(), ARRIVAL_FUNDS);
});

test('the connection fails as Buy is pressed: the money waits, and the next round settles it either way', async () => {
  // the offer never arrived
  const a = await player('Lost', 'Offer Lost');
  const opened = await a.market.open(HOLARIS.listing, NEAR_HOLARIS);
  a.web.net.down = true;
  const lost = await a.market.offer(opened.thread.id, 100 * TR, 'HOLARIS Wristwatch');
  assert.equal(lost.code, 'OFFLINE');
  assert.equal(a.balance(), ARRIVAL_FUNDS - 100 * TR);
  assert.equal(a.market.held().held, 100 * TR);
  a.web.net.down = false;
  await a.market.sync();
  assert.equal(a.balance(), ARRIVAL_FUNDS);
  assert.equal(a.market.held().held, 0);
  assert.deepEqual(a.events.map((e) => e.type), ['returned']);
  assert.equal((await a.market.mine()).holdings.length, 0);
  // the offer arrived and the watch was sold, but the answer was lost on the way back
  const b = await player('Blind', 'Answer Lost');
  const shop = await b.market.open(HOLARIS.listing, NEAR_HOLARIS);
  b.web.net.lose = (body) => body.op === 'market.offer';
  const blind = await b.market.offer(shop.thread.id, 100 * TR, 'HOLARIS Wristwatch');
  assert.equal(blind.code, 'OFFLINE');
  assert.equal(b.balance(), ARRIVAL_FUNDS - 100 * TR);
  b.web.net.lose = null;
  await b.market.sync();
  assert.equal(b.balance(), ARRIVAL_FUNDS - 100 * TR, 'paid once, from what was set aside');
  assert.equal(b.market.held().held, 0);
  assert.equal((await b.market.mine()).holdings.length, 1);
  assert.deepEqual(b.events.map((e) => e.type), ['bought']);
  await b.market.sync(); await b.market.sync();
  assert.equal(b.balance(), ARRIVAL_FUNDS - 100 * TR);
  assert.deepEqual(b.host.auditor.reconcile(), []);
});

test('sold on to another player: the talk, the offer, the seller\'s yes; 140 TR leaves one world and arrives in the other, once', async () => {
  const seller = await player('Sell', 'Seller Eze'), buyer = await player('Buy', 'Buyer Okafor');
  const shop = await seller.market.open(HOLARIS.listing, NEAR_HOLARIS);
  await seller.market.offer(shop.thread.id, 100 * TR, 'HOLARIS Wristwatch');
  const holding = (await seller.market.mine()).holdings[0];
  const spot = { x: 12, z: 30, label: 'By the market' };
  const listed = await seller.market.sell(holding.id, 150 * TR, spot);
  assert.equal(listed.ok, true);
  await buyer.market.list(seller.username);
  assert.equal(buyer.market.state.listings.length, 1);
  const opened = await buyer.market.open(listed.listing.id, spot);
  await buyer.market.say(opened.thread.id, 'I can give 140.');
  await seller.market.sync();
  assert.deepEqual(seller.events.filter((e) => e.type === 'message').map((e) => e.count), [1]);
  const made = await buyer.market.offer(opened.thread.id, 140 * TR, holding.name);
  assert.equal(made.offer.status, 'pending');
  assert.equal(buyer.balance(), ARRIVAL_FUNDS - 140 * TR);        // set aside
  assert.equal(buyer.market.held().held, 140 * TR);
  await seller.market.sync();
  assert.equal(seller.market.state.toDecide, 1);
  assert.ok(seller.events.some((e) => e.type === 'offer'));
  const sold = await seller.market.decide(made.offer.id, true, 140 * TR);
  assert.equal(sold.ok, true);
  assert.equal(seller.balance(), ARRIVAL_FUNDS - 100 * TR + 140 * TR);
  // the buyer's game learns of it on its next round
  await buyer.market.sync();
  assert.equal(buyer.balance(), ARRIVAL_FUNDS - 140 * TR);
  assert.equal(buyer.market.held().held, 0);
  assert.ok(buyer.events.some((e) => e.type === 'bought' && e.amount === 140 * TR));
  assert.equal((await buyer.market.mine()).holdings[0].id, holding.id);
  assert.equal((await seller.market.mine()).holdings.length, 0);
  // any number of further rounds change nothing
  for (let i = 0; i < 3; i += 1) { await buyer.market.sync(); await seller.market.sync(); }
  assert.equal(buyer.balance() + seller.balance(), 2 * ARRIVAL_FUNDS - 100 * TR, 'what the buyer paid is what the seller received');
  // each says so with a save; then the market has nothing outstanding for either
  await buyer.sync.upload(); await seller.sync.upload();
  const sql = await database();
  const open = await sql.unsafe(`select count(*)::int as n from pcw.sales where (buyer_id in (select id from pcw.accounts where username in ($1, $2)) and buyer_paid_rev is null) or (seller_id in (select id from pcw.accounts where username in ($1, $2)) and seller_credited_rev is null)`, [seller.username, buyer.username]);
  assert.equal(open[0].n, 0);
  assert.deepEqual(buyer.host.auditor.reconcile(), []);
  assert.deepEqual(seller.host.auditor.reconcile(), []);
});

test('an offer refused, and one withdrawn: the money set aside comes back', async () => {
  const seller = await player('Firm', 'Firm Seller'), buyer = await player('Low', 'Low Bidder');
  const shop = await seller.market.open(HOLARIS.listing, NEAR_HOLARIS);
  await seller.market.offer(shop.thread.id, 100 * TR, 'HOLARIS Wristwatch');
  const holding = (await seller.market.mine()).holdings[0];
  const spot = { x: 5, z: 5, label: 'Here' };
  const listed = await seller.market.sell(holding.id, 300 * TR, spot);
  const opened = await buyer.market.open(listed.listing.id, spot);
  const first = await buyer.market.offer(opened.thread.id, 50 * TR, holding.name);
  assert.equal(buyer.balance(), ARRIVAL_FUNDS - 50 * TR);
  await seller.market.decide(first.offer.id, false);
  assert.equal(seller.balance(), ARRIVAL_FUNDS - 100 * TR);
  await buyer.market.sync();
  assert.equal(buyer.balance(), ARRIVAL_FUNDS);
  const second = await buyer.market.offer(opened.thread.id, 60 * TR, holding.name);
  assert.equal(buyer.balance(), ARRIVAL_FUNDS - 60 * TR);
  assert.equal((await buyer.market.withdraw(second.offer.id)).offer.status, 'withdrawn');
  assert.equal(buyer.balance(), ARRIVAL_FUNDS);
  assert.equal(buyer.market.held().held, 0);
});

test('two players in the same town see each other walk, each under the other\'s username', async () => {
  const a = await player('Walk', 'Walker One'), b = await player('Stand', 'Stander Two');
  let clock = 100;
  const ticks = [];
  const every = (fn) => { ticks.push(fn); return ticks.length; };
  const tick = async (seconds) => { clock += seconds; for (const fn of ticks) fn(); await new Promise((r) => setTimeout(r, 60)); };
  const linkOf = (d) => createLink({ transport: createWebTransport({ online: d.online, zone: ZONE, now: () => clock, every, never: () => {} }), game: d.host.game, zoneId: ZONE, self: () => d.host.game.view(d.playerId).self });
  const la = linkOf(a), lb = linkOf(b);
  const pa = a.host.game.state.players[a.playerId], pb = b.host.game.state.players[b.playerId];
  pa.x = -30; pa.z = 100; pb.x = -28; pb.z = 100;
  la.tick(1); lb.tick(1);
  await tick(4); await tick(4); await tick(0.2);
  const seenByA = a.host.game.visitors.list();
  const seenByB = b.host.game.visitors.list();
  assert.deepEqual(seenByA.map((v) => v.name), [b.username]);
  assert.deepEqual(seenByB.map((v) => v.name), [a.username]);
  assert.equal(seenByA[0].x, -28);
  // a walks 6 m; b sees them part of the way there before all of it
  pa.x = -24; la.tick(1);
  await tick(1.2);          // a's new place reaches the server; b hears it on its own next round
  await tick(1.2);
  const mid = [];
  for (let i = 0; i < 6; i += 1) { await tick(0.3); mid.push(b.host.game.visitors.list()[0].x); }
  assert.ok(mid.some((x) => x > -30 && x < -24), `moved evenly: ${mid.join(', ')}`);
  await tick(4); await tick(1);
  assert.equal(b.host.game.visitors.list()[0].x, -24);
  // a signs out: gone from b's town
  la.close();
  await tick(4); await tick(9);
  b.host.tick(0.1);
  assert.deepEqual(b.host.game.visitors.list().map((v) => v.name), []);
  lb.close();
  await new Promise((r) => setTimeout(r, 200));      // the two goodbyes reach the server before the test ends
});
