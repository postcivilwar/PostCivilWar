// The game's own client code against the real server: accounts, the character kept with them, the wallet kept
// by the bank and this world's own ledger kept in line with it, sending TR, erasing a character, and a watch
// bought, sold on and paid for.
//   server/with-postgres.sh node --test server/test/*.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { browser, earner, uuid, closeDatabase, database, HOLARIS, NEAR_HOLARIS, ZONE } from './harness.mjs';
import { createOnline, packSave, unpackSave, createWebTransport } from '../../prototype/src/net/online.js';
import { createMarket, createAccountSync } from '../../prototype/src/client/market.js';
import { createWallet } from '../../prototype/src/client/wallet.js';
import { createHost } from '../../prototype/src/sim/host.js';
import { ARRIVAL_FUNDS } from '../../prototype/src/sim/sim.js';
import { BUSINESSES } from '../../prototype/src/sim/economy.js';
import { TR } from '../../prototype/src/sim/ledger.js';
import { createLink } from '../../prototype/src/net/link.js';
import { goToMould, waitUntilOpen, run } from '../../prototype/test/helpers.mjs';

const require = createRequire(import.meta.url);
const bank = require('../../api/_lib/wallet.js');
const { WALLET } = require('../../api/_lib/schema.js');

after(() => closeDatabase());

const WAGE = BUSINESSES.yard.wagePerBlock;
// Every player made here has, besides the arrival money (starter TR), 2,000 TR that someone sent them: earned
// TR, which is what can be sent on and spent in the market. START is what they hold altogether.
const EARNED = 2000 * TR;
const START = ARRIVAL_FUNDS + EARNED;
let n = 0;
// One device: a browser, a game, and the pieces of the page that talk to the server.
function device(address) {
  const web = browser(address);
  const online = createOnline({ available: true, fetcher: web.fetcher });
  const d = { web, online, host: null, playerId: null, events: [], local: null, mark: null, forgotten: [], seen: null };
  d.read = () => (d.playerId ? { host: d.host.save(), playerId: d.playerId } : null);
  d.newCharacter = (name) => { d.host = createHost(); d.playerId = d.host.game.join({ name, look: {} }); };
  // what the wallet in this world's own ledger says
  d.balance = () => d.host.game.view(d.playerId).self.balance;
  // a morning's work at the block yard: a wage in this world's ledger, as the game pays it
  d.earn = (blocks = 1) => { goToMould(d.host, d.playerId, 0); waitUntilOpen(d.host, d.playerId, 'yard'); for (let i = 0; i < blocks; i += 1) { run(d.host, 1.3); const r = d.host.game.intent(d.playerId, { type: 'job.mould', stationId: 'mould-1' }); assert.equal(r.ok, true, r.message); } };
  // something paid for in town, in this world's ledger
  // (a cost of living: food, fares and the like. It comes out of starter TR first)
  d.spend = (units) => { const eco = d.host.game.internals.economy; const p = d.host.game.state.players[d.playerId]; assert.equal(eco.tryPay('transfer', p.wallet, eco.accounts.business(`family:${p.id}`), units, 'Spent in town'), true); };
  d.parts = () => d.host.game.view(d.playerId).self.funds;
  d.wallet = createWallet({ online, bank: () => (d.host ? d.host.bank : null), playerId: () => d.playerId, saveNow: () => d.sync.upload(), saveSoon: () => { d.wantsSave = true; }, notify: (e) => d.events.push(e), seen: { get: () => d.seen, set: (v) => { d.seen = v; } } });
  d.market = createMarket({ online, bridge: () => (d.host ? d.host.market : null), playerId: () => d.playerId, zone: ZONE, notify: (e) => d.events.push(e), saveSoon: () => { d.wantsSave = true; }, saveNow: () => d.sync.upload(), wallet: () => d.wallet });
  d.sync = createAccountSync({
    online, read: d.read, pack: packSave, unpack: unpackSave,
    adopt: (saved) => { d.host = createHost({ saved: saved.host }); d.playerId = saved.playerId; d.adopted = (d.adopted || 0) + 1; },
    forget: (why) => { d.host = null; d.playerId = null; d.forgotten.push(why); },
    summary: () => ({ name: d.host.game.view(d.playerId).self.name, figure: 'W1' }),
    applied: () => d.market.applied(),
    wallet: () => d.wallet,
    mark: { get: () => d.mark, set: (v) => { d.mark = v; } },
    notify: (e) => d.events.push(e),
  });
  // what the bank says this account has
  d.banked = async () => { const a = await online.ask('wallet.get'); assert.equal(a.ok, true, a.message); return a.wallet.balance; };
  // the two agree, and this world's own books balance
  d.inStep = async (expected) => { const b = await d.banked(); assert.equal(d.balance(), b, 'this world\'s wallet and the bank\'s figure'); if (expected !== undefined) assert.equal(b, expected); assert.deepEqual(d.host.auditor.reconcile(), []); };
  return d;
}
const name = (prefix) => `${prefix}${(n += 1)}${Math.random().toString(36).slice(2, 5)}`.slice(0, 16);
async function player(prefix, characterName, earned = EARNED) {
  const d = device();
  await d.online.check();
  d.username = name(prefix);
  d.password = `${d.username} password`;
  // as the page does it: the account first, then the character, kept with the account at once
  const made = await d.sync.signUp(d.username, d.password);
  assert.equal(made.ok, true, made.message);
  d.newCharacter(characterName);
  assert.equal((await d.sync.upload()).ok, true);
  if (earned > 0) {
    // someone sends them TR, and their page hears of it: earned TR, at the bank and in this world's own wallet
    const teller = await earner('Teller', earned);
    await teller.ok('wallet.send', { key: uuid(), username: d.username, amount: String(earned / TR) });
    assert.equal((await d.wallet.refresh()).ok, true);
    d.events.length = 0;
  }
  return d;
}
const books = async () => assert.deepEqual(await bank.audit(await database()), [], 'the bank\'s books are right');

test('a page with no server asks the network for nothing', async () => {
  let asked = 0;
  const online = createOnline({ available: false, fetcher: async () => { asked += 1; throw new Error('no'); } });
  assert.equal((await online.check()).state, 'off');
  assert.equal((await online.ask('me')).code, 'NO_SERVER');
  const w = createWallet({ online, bank: () => null, playerId: () => null });
  assert.equal(w.can(), false);
  assert.equal((await w.refresh()).code, 'SIGNED_OUT');
  assert.equal((await w.send({ key: 'k', username: 'a', amount: '1' })).code, 'SIGNED_OUT');
  assert.equal(asked, 0);
});

test('one answer lost as the page starts is not a server out of reach: it is asked again before anyone is told so', async () => {
  // the answer to the first question ("who is signed in here?") is lost on its way back, once
  const one = device();
  let lost = 0;
  one.web.net.lose = (body) => body.op === 'me' && (lost += 1) === 1;
  assert.equal((await one.online.check()).state, 'out', 'asked again, and answered: nobody is signed in, and the server is there');
  assert.equal(lost, 2, 'asked twice');
  // an answer that cannot be read (cut off half-way) is the same
  const garbled = browser();
  let bad = 0;
  const half = async (url, init) => { const r = await garbled.fetcher(url, init); const body = init && init.body ? JSON.parse(init.body) : {}; return body.op === 'me' && (bad += 1) === 1 ? { ok: true, status: 200, json: async () => { throw new Error('aborted'); } } : r; };
  const two = createOnline({ available: true, fetcher: half });
  assert.equal((await two.check()).state, 'out');
  assert.equal(bad, 2);
  // lost every time: then, and only then, the player is told the server cannot be reached
  const three = device();
  three.web.net.lose = (body) => body.op === 'me';
  const st = await three.online.check();
  assert.equal(st.state, 'down');
  assert.match(st.message, /could not be reached/);
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

test('a new account: the bank gives the arrival money once, and the new character\'s wallet is that same money, not more', async () => {
  const d = await player('New', 'Fresh Arrival', 0);
  assert.equal(d.online.status().state, 'in');
  assert.equal(d.sync.rev, 1);
  await d.inStep(ARRIVAL_FUNDS);
  assert.equal(d.wallet.state.balance, ARRIVAL_FUNDS);
  // all of it is starter TR, at the bank and in this world's own count
  assert.deepEqual({ starter: d.wallet.state.starter, eligible: d.wallet.state.eligible }, { starter: ARRIVAL_FUNDS, eligible: 0 });
  assert.deepEqual(d.parts(), { total: ARRIVAL_FUNDS, starter: ARRIVAL_FUNDS, earned: 0, illicit: 0, eligible: 0 });
  // saving again and again gives nothing
  for (let i = 0; i < 3; i += 1) assert.equal((await d.sync.upload()).ok, true);
  await d.inStep(ARRIVAL_FUNDS);
  await books();
});

test('what is earned and spent in town reaches the bank with the save; another device signs in and plays the same character with the same money', async () => {
  const phone = await player('Ada', 'Adaeze Okeke');
  phone.earn(3);
  assert.equal(phone.balance(), START + 3 * WAGE);
  assert.equal(await phone.banked(), START, 'the bank has not been told yet');
  assert.equal((await phone.sync.upload()).ok, true);
  await phone.inStep(START + 3 * WAGE);
  phone.spend(50);
  assert.equal((await phone.sync.upload()).ok, true);
  await phone.inStep(START + 3 * WAGE - 50);
  // the laptop has never seen this character
  const laptop = device();
  await laptop.online.check();
  const wrong = await laptop.sync.logIn(phone.username, 'not the password');
  assert.equal(wrong.ok, false);
  assert.equal(laptop.playerId, null);
  const inNow = await laptop.sync.logIn(phone.username.toUpperCase(), phone.password);
  assert.equal(inNow.ok, true);
  assert.equal(inNow.adopted, true);
  assert.equal(laptop.host.game.view(laptop.playerId).self.name, 'Adaeze Okeke');
  await laptop.inStep(START + 3 * WAGE - 50);
  // played on the laptop, saved; meanwhile the phone played on without a connection
  laptop.earn(1);
  assert.equal((await laptop.sync.upload()).ok, true);
  phone.earn(2);
  // the phone, coming back, finds the newer one and takes it: one character, one wallet, nothing counted twice
  const stale = await phone.sync.upload();
  assert.equal(stale.code, 'NEWER');
  assert.equal(phone.adopted, 1);
  assert.ok(phone.events.some((e) => e.type === 'newer'));
  await phone.inStep(START + 4 * WAGE - 50);
  await laptop.inStep(START + 4 * WAGE - 50);
  // and from then on the phone saves normally
  phone.earn(1);
  assert.equal((await phone.sync.upload()).ok, true);
  await phone.inStep(START + 5 * WAGE - 50);
  // opening the page again on the laptop: signed in still, the newer copy is there to take, and the wallet with it
  const again = createOnline({ available: true, fetcher: laptop.web.fetcher });
  assert.equal((await again.check()).state, 'in');
  assert.equal(again.status().save.rev, phone.sync.rev);
  assert.equal(again.status().wallet.balance, START + 5 * WAGE - 50);
  await books();
});

test('the answer to a save is lost on its way back (19 October 2026): the copy the server kept is known for this game\'s own; the game played on here is kept, not put back to it, and every wage reaches the bank once', async () => {
  const phone = await player('Lost', 'Lost Answer', 0);
  phone.earn(2);
  // this save arrives and is kept, but its answer never comes back (a poor connection, a busy server)
  let lost = 0;
  phone.web.net.lose = (body) => body.op === 'save.put' && (lost += 1) === 1;
  const cut = await phone.sync.upload();
  assert.equal(cut.ok, false);
  assert.equal(lost, 1);
  assert.equal(phone.sync.rev, 1, 'the page does not know the server kept it');
  // played on here: a third wage, and where they now stand
  phone.earn(1);
  const here = phone.host.game.view(phone.playerId).self;
  // the next save is told the server's copy is newer: it is this game's own, so nothing is swapped
  const next = await phone.sync.upload();
  assert.equal(next.code, 'NEWER');
  assert.equal(phone.adopted || 0, 0, 'not put back to the copy the server kept');
  assert.ok(!phone.events.some((e) => e.type === 'newer'), 'and not told it was played on another device');
  assert.equal(phone.sync.rev, 2, 'the account is at that copy now');
  const still = phone.host.game.view(phone.playerId).self;
  assert.deepEqual([still.x, still.z], [here.x, here.z]);
  // saved again from here: kept, and the bank told of the three wages once each
  assert.equal((await phone.sync.upload()).ok, true);
  assert.equal(phone.sync.rev, 3);
  await phone.inStep(ARRIVAL_FUNDS + 3 * WAGE);
  // a copy truly played on another device is still taken, as before
  const laptop = device();
  await laptop.online.check();
  assert.equal((await laptop.sync.logIn(phone.username, phone.password)).adopted, true);
  laptop.earn(1);
  assert.equal((await laptop.sync.upload()).ok, true);
  phone.earn(1);
  assert.equal((await phone.sync.upload()).code, 'NEWER');
  assert.equal(phone.adopted, 1, 'the laptop\'s copy, played on since, is taken');
  assert.ok(phone.events.some((e) => e.type === 'newer'));
  await phone.inStep(ARRIVAL_FUNDS + 4 * WAGE);
  await books();
});

test('a page that says it earned a fortune is believed only as far as a person could have earned, and is put right', async () => {
  const d = await player('Cheat', 'Too Rich');
  // a tampered game gives itself a thousand million TR in its own ledger
  d.host.market.credit(d.playerId, { saleId: '99999999-9999-4999-8999-999999999999', amount: 2_000_000_000, what: 'nothing at all' });
  assert.equal(d.balance(), START + 2_000_000_000);
  assert.equal((await d.sync.upload()).ok, true);
  const banked = await d.banked();
  // (a game on an account made a moment ago is believed about very little: what a few minutes' work would bring)
  assert.ok(banked >= START + WALLET.earnStart && banked <= START + WALLET.earnStart + 20, `the bank took ${banked - START}`);
  // its own wallet is brought down to the bank's figure, and its player is told
  assert.equal(d.balance(), banked);
  assert.ok(d.events.some((e) => e.type === 'refused' && e.amount === 2_000_000_000 - (banked - START)));
  // and none of it is counted as anything but what it was said to be: the arrival money is still the arrival money
  assert.equal(d.parts().starter, ARRIVAL_FUNDS);
  // and what the bank did not take cannot be sent to anyone
  const other = await player('Mark', 'Honest Mark');
  const tooMuch = await d.wallet.check({ username: other.username, amount: '1000000' });
  assert.equal(tooMuch.code, 'FUNDS');
  await d.inStep();
  await books();
});

test('signing out sends the character to the account first and then clears this device; with no connection it does neither', async () => {
  const d = await player('Out', 'Leaving Soon');
  d.earn(1);
  d.web.net.down = true;
  const refused = await d.sync.logOut();
  assert.equal(refused.ok, false);
  assert.match(refused.message, /could not be saved to your account just now, so you are still signed in/);
  assert.equal(d.online.status().state, 'in');
  assert.ok(d.playerId);
  d.web.net.down = false;
  assert.equal((await d.sync.logOut()).ok, true);
  assert.equal(d.online.status().state, 'out');
  assert.equal(d.playerId, null);
  assert.deepEqual(d.forgotten, ['out']);
  assert.equal(d.mark, null);
  // signed out, the server will do nothing for this device
  for (const op of ['wallet.get', 'save.get', 'market.mine', 'wallet.history']) assert.equal((await d.online.ask(op)).code, 'SIGNED_OUT', op);
  const back = await d.sync.logIn(d.username, d.password);
  assert.equal(back.adopted, true);
  await d.inStep(START + WAGE);
});

test('sending TR: checked by the bank, confirmed, sent once; the other player is told and has it', async () => {
  const a = await player('Give', 'Giver Obi'), b = await player('Take', 'Taker Eze');
  await b.wallet.refresh();                                   // b's page has looked at its wallet before
  a.earn(2);                                                  // not yet told to the bank: sending tells it first
  const none = await a.wallet.check({ username: 'nobody_at_all', amount: '10' });
  assert.equal(none.message, 'Username not found. You can only send TR to registered users.');
  const self = await a.wallet.check({ username: a.username, amount: '10' });
  assert.equal(self.code, 'SELF');
  const checked = await a.wallet.check({ username: b.username.toLowerCase(), amount: '2025', note: 'for the roof' });
  assert.equal(checked.ok, true, checked.message);
  assert.deepEqual({ to: checked.person.username, amount: checked.amount, fee: checked.fee, total: checked.total, balance: checked.balance }, { to: b.username, amount: 4050, fee: 0, total: 4050, balance: START + 2 * WAGE });
  assert.match(checked.key, /^[0-9a-f-]{36}$/);
  // nothing has moved yet
  assert.equal(await b.banked(), START);
  const sent = await a.wallet.send({ key: checked.key, username: checked.person.username, amount: '2025', note: checked.note });
  assert.equal(sent.ok, true, sent.message);
  assert.match(sent.transfer.ref, /^TR-[2-9A-HJ-NP-Z]{10}$/);
  assert.equal(sent.balance, START + 2 * WAGE - 4050);
  await a.inStep(START + 2 * WAGE - 4050);
  // what is left is the arrival money, untouched: every TR that was sent was TR that had been earned
  assert.deepEqual(a.parts(), { total: ARRIVAL_FUNDS, starter: ARRIVAL_FUNDS, earned: 0, illicit: 0, eligible: 0 });
  assert.equal((await a.wallet.check({ username: b.username, amount: '0.5' })).code, 'STARTER_FUNDS');
  // the receiver's game learns of it on its next round: told once, and the money is in its own wallet in town
  assert.equal(b.balance(), START);
  await b.market.sync();
  assert.deepEqual(b.events.filter((e) => e.type === 'received').map((e) => [e.other, e.amount, e.note]), [[a.username, 4050, 'for the roof']]);
  await b.inStep(START + 4050);
  await b.market.sync(); await b.market.sync();
  assert.equal(b.events.filter((e) => e.type === 'received').length, 1);
  // the receiver can spend it in town and send it on
  b.spend(1000);
  const on = await b.wallet.check({ username: a.username, amount: '3000' });
  assert.equal(on.ok, true, on.message);
  assert.equal(on.balance, START + 4050 - 1000, 'the bank knew of the 500 TR spent in town before it was asked');
  assert.equal((await b.wallet.send({ key: on.key, username: a.username, amount: '3000' })).ok, true);
  await b.inStep(START + 4050 - 1000 - 6000);
  // The 500 TR spent in town came out of starter TR (it was a cost of living), so what can still be sent is what
  // is left of the earned TR, to the half TR, and not the starter TR beside it
  assert.deepEqual(b.parts(), { total: START + 4050 - 1000 - 6000, starter: ARRIVAL_FUNDS - 1000, earned: EARNED + 4050 - 6000, illicit: 0, eligible: EARNED + 4050 - 6000 });
  const over = await b.wallet.check({ username: a.username, amount: String((EARNED + 4050 - 6000 + 1) / TR) });
  assert.equal(over.code, 'ELIGIBLE_FUNDS');
  assert.equal((await b.wallet.check({ username: a.username, amount: String((EARNED + 4050 - 6000) / TR) })).ok, true);
  await books();
});

test('the answer to Confirm Transfer is lost: pressing again finishes the same transfer, and never sends twice', async () => {
  const a = await player('Blind', 'Sender Blind'), b = await player('Sure', 'Receiver Sure');
  const checked = await a.wallet.check({ username: b.username, amount: '700' });
  a.web.net.lose = (body) => body.op === 'wallet.send';
  const lost = await a.wallet.send({ key: checked.key, username: b.username, amount: '700' });
  assert.equal(lost.code, 'OFFLINE');
  assert.equal(a.balance(), START, 'the page does not say sent, and has not moved its own figure');
  assert.equal(await b.banked(), START + 1400, 'though the bank did move it');
  a.web.net.lose = null;
  const again = await a.wallet.send({ key: checked.key, username: b.username, amount: '700' });
  assert.equal(again.ok, true);
  assert.equal(again.transfer.replayed, true);
  await a.inStep(START - 1400);
  assert.equal(await b.banked(), START + 1400);
  // and with no connection at all, nothing is sent and nothing is claimed
  const next = await a.wallet.check({ username: b.username, amount: '5' });
  a.web.net.down = true;
  assert.equal((await a.wallet.send({ key: next.key, username: b.username, amount: '5' })).code, 'OFFLINE');
  assert.equal((await a.wallet.check({ username: b.username, amount: '5' })).code, 'OFFLINE');
  a.web.net.down = false;
  assert.equal(await b.banked(), START + 1400);
  await books();
});

test('erasing the saved game: the character goes, here and on every other device; the account, the wallet and what is owned stay; a new journey begins once', async () => {
  const phone = await player('Wipe', 'Old Journey'), friend = await player('Pal', 'A Friend');
  phone.earn(2);
  await phone.sync.upload();
  const sent = await phone.wallet.check({ username: friend.username, amount: '250' });
  await phone.wallet.send({ key: sent.key, username: friend.username, amount: '250' });
  assert.equal((await phone.wallet.addPerson(friend.username)).ok, true);
  const shop = await phone.market.open(HOLARIS.listing, NEAR_HOLARIS);
  assert.equal((await phone.market.offer(shop.thread.id, 100 * TR, 'HOLARIS Wristwatch')).ok, true);
  const had = START + 2 * WAGE - 500 - 200;
  await phone.inStep(had);
  // the same character is open on a laptop too
  const laptop = device();
  await laptop.online.check();
  await laptop.sync.logIn(phone.username, phone.password);
  laptop.earn(1);                                           // played on, not yet saved
  // with no connection it cannot be erased, and is not
  phone.web.net.down = true;
  const refused = await phone.sync.erase();
  assert.equal(refused.ok, false);
  assert.ok(phone.playerId, 'the character is still here');
  phone.web.net.down = false;
  // erased
  const erased = await phone.sync.erase();
  assert.equal(erased.ok, true);
  assert.equal(phone.playerId, null);
  assert.deepEqual(phone.forgotten, ['erased']);
  assert.equal(phone.online.status().state, 'in', 'the account is still signed in');
  assert.deepEqual(phone.online.status().save, { rev: erased.rev, erased: true });
  assert.equal(await phone.banked(), had);
  assert.equal(phone.wallet.state.balance, had);
  assert.deepEqual((await phone.wallet.people()).people.map((p) => p.username), [friend.username]);
  assert.equal((await phone.market.mine()).holdings.length, 1);
  assert.equal((await phone.wallet.history(null, true)).entries.length, 5, 'arrival, what was received, the town, the transfer and the watch are all still written down');
  // nothing on this device can save the old character back
  assert.equal(await phone.sync.upload(), null);
  // the laptop's copy of the old character cannot come back either: its next save is refused and it is put away
  const stale = await laptop.sync.upload();
  assert.equal(stale.code, 'NEWER');
  assert.equal(laptop.playerId, null);
  assert.deepEqual(laptop.forgotten, ['erased']);
  assert.ok(laptop.events.some((e) => e.type === 'erased'));
  assert.equal(await phone.banked(), had, 'and the wage it had not saved was not taken into the bank');
  // a third device that signs in afterwards finds no character to bring, and the same wallet
  const tablet = device();
  await tablet.online.check();
  const inNow = await tablet.sync.logIn(phone.username, phone.password);
  assert.equal(inNow.ok, true);
  assert.equal(inNow.adopted, false);
  assert.equal(tablet.playerId, null);
  // the new journey: a new character, kept once; its wallet is the account's, not a second arrival money
  phone.newCharacter('New Journey');
  assert.equal(phone.balance(), ARRIVAL_FUNDS);
  const first = await phone.sync.upload();
  assert.equal(first.ok, true);
  assert.equal(first.rev, erased.rev + 1);
  await phone.inStep(had);
  assert.equal(phone.host.game.view(phone.playerId).self.name, 'New Journey');
  // and it is the one the other devices now find
  await laptop.online.check();                              // (as the page does when it is opened again)
  const found = await laptop.sync.settle();
  assert.equal(found.adopted, true);
  assert.equal(laptop.host.game.view(laptop.playerId).self.name, 'New Journey');
  await laptop.inStep(had);
  await books();
});

test('a watch bought at the shop: 100 TR leaves the wallet once, at the bank, and this world\'s wallet says the same', async () => {
  const d = await player('Shop', 'Shopper One');
  await d.market.list('watch');
  const listing = d.market.state.listings.find((l) => l.id === HOLARIS.listing);
  assert.equal(listing.price, 100 * TR);
  const opened = await d.market.open(listing.id, NEAR_HOLARIS);
  assert.equal(opened.ok, true);
  // too little: refused, and nothing was taken or set aside
  const low = await d.market.offer(opened.thread.id, 60 * TR, listing.name);
  assert.equal(low.offer.status, 'declined');
  await d.inStep(START);
  assert.equal(d.market.held().held, 0);
  const bought = await d.market.offer(opened.thread.id, 100 * TR, listing.name);
  assert.equal(bought.offer.status, 'accepted');
  await d.inStep(START - 100 * TR);
  assert.equal(d.market.held().held, 0);
  assert.deepEqual(d.events.filter((e) => e.type === 'bought').map((e) => e.amount), [100 * TR]);
  const mine = await d.market.mine();
  assert.equal(mine.holdings.length, 1);
  assert.deepEqual(mine.debits, []);
  // any number of rounds and saves later it has still been paid for once, and told once
  for (let i = 0; i < 3; i += 1) { await d.market.sync(); await d.sync.upload(); }
  await d.inStep(START - 100 * TR);
  assert.equal(d.events.filter((e) => e.type === 'bought').length, 1);
  await books();
});

test('what has been spent in town cannot be spent again in the market', async () => {
  const d = await player('Poor', 'Thin Purse');
  const opened = await d.market.open(HOLARIS.listing, NEAR_HOLARIS);
  // more than the wallet holds: the bank says no
  const big = await d.market.offer(opened.thread.id, START + 2, 'a watch');
  assert.equal(big.ok, true);            // (at a shop a larger offer pays the price: that is 100 TR, which is there)
  assert.equal(big.sale.amount, 100 * TR);
  // now nearly everything is spent in town, in this world's own ledger, and the bank has not been told
  d.spend(START - 100 * TR - 50);
  assert.equal(d.balance(), 50);
  const r = await d.market.offer(opened.thread.id, 100 * TR, 'a watch');
  assert.equal(r.ok, false);
  assert.equal(r.code, 'FUNDS');
  assert.match(r.message, /You do not have that much\. Your balance is 25 TR\./);
  assert.equal((await d.market.mine()).holdings.length, 1, 'a second watch was not sold to an empty wallet');
  await d.inStep(50);
  await books();
});

test('the connection fails as Buy is pressed: nothing is taken for an offer that never arrived, and one whose answer was lost is paid for once', async () => {
  // the offer never arrived
  const a = await player('Lost', 'Offer Lost');
  const opened = await a.market.open(HOLARIS.listing, NEAR_HOLARIS);
  a.web.net.down = true;
  const lost = await a.market.offer(opened.thread.id, 100 * TR, 'HOLARIS Wristwatch');
  assert.equal(lost.code, 'OFFLINE');
  assert.equal(a.balance(), START);
  a.web.net.down = false;
  await a.market.sync();
  await a.inStep(START);
  assert.equal((await a.market.mine()).holdings.length, 0);
  // the offer arrived and the watch was sold, but the answer was lost on the way back
  const b = await player('Blind', 'Answer Lost');
  const shop = await b.market.open(HOLARIS.listing, NEAR_HOLARIS);
  b.web.net.lose = (body) => body.op === 'market.offer';
  const blind = await b.market.offer(shop.thread.id, 100 * TR, 'HOLARIS Wristwatch');
  assert.equal(blind.code, 'OFFLINE');
  b.web.net.lose = null;
  // the player presses Buy again: the same offer is finished, not a second one made
  const again = await b.market.offer(shop.thread.id, 100 * TR, 'HOLARIS Wristwatch');
  assert.equal(again.ok, true);
  assert.equal(again.offer.status, 'accepted');
  await b.inStep(START - 100 * TR);
  assert.equal((await b.market.mine()).holdings.length, 1);
  await b.market.sync(); await b.market.sync();
  await b.inStep(START - 100 * TR);
  // or does nothing: the next round still finds what the bank did
  const c = await player('Wait', 'Answer Waited');
  const shop2 = await c.market.open(HOLARIS.listing, NEAR_HOLARIS);
  c.web.net.lose = (body) => body.op === 'market.offer';
  await c.market.offer(shop2.thread.id, 100 * TR, 'HOLARIS Wristwatch');
  c.web.net.lose = null;
  assert.equal(c.balance(), START);
  await c.market.sync();
  await c.inStep(START - 100 * TR);
  assert.deepEqual(c.events.filter((e) => e.type === 'bought').map((e) => e.amount), [100 * TR]);
  await books();
});

test('sold on to another player: the talk, the offer, the seller\'s yes; 140 TR leaves one wallet and arrives in the other, once', async () => {
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
  await buyer.inStep(START - 140 * TR);                   // set aside, at the bank
  assert.equal(buyer.market.held().held, 140 * TR);
  await seller.market.sync();
  assert.equal(seller.market.state.toDecide, 1);
  assert.ok(seller.events.some((e) => e.type === 'offer'));
  const sold = await seller.market.decide(made.offer.id, true, 140 * TR);
  assert.equal(sold.ok, true);
  await seller.inStep(START - 100 * TR + 140 * TR);
  assert.ok(seller.events.some((e) => e.type === 'sold' && e.amount === 140 * TR));
  // the buyer's game learns of it on its next round
  await buyer.market.sync();
  await buyer.inStep(START - 140 * TR);
  assert.equal(buyer.market.held().held, 0);
  assert.deepEqual(buyer.events.filter((e) => e.type === 'bought').map((e) => e.amount), [140 * TR]);
  assert.equal((await buyer.market.mine()).holdings[0].id, holding.id);
  assert.equal((await seller.market.mine()).holdings.length, 0);
  // any number of further rounds change nothing, and tell nobody anything twice
  for (let i = 0; i < 3; i += 1) { await buyer.market.sync(); await seller.market.sync(); await buyer.sync.upload(); await seller.sync.upload(); }
  assert.equal(buyer.balance() + seller.balance(), 2 * START - 100 * TR, 'what the buyer paid is what the seller received');
  assert.equal(buyer.events.filter((e) => e.type === 'bought').length, 1, JSON.stringify(buyer.events));
  assert.equal(seller.events.filter((e) => e.type === 'sold').length, 1, JSON.stringify(seller.events));
  await books();
});

test('an offer refused, and one withdrawn: the TR set aside comes back', async () => {
  const seller = await player('Firm', 'Firm Seller'), buyer = await player('Low', 'Low Bidder');
  const shop = await seller.market.open(HOLARIS.listing, NEAR_HOLARIS);
  await seller.market.offer(shop.thread.id, 100 * TR, 'HOLARIS Wristwatch');
  const holding = (await seller.market.mine()).holdings[0];
  const spot = { x: 5, z: 5, label: 'Here' };
  const listed = await seller.market.sell(holding.id, 300 * TR, spot);
  const opened = await buyer.market.open(listed.listing.id, spot);
  await buyer.wallet.refresh();
  const first = await buyer.market.offer(opened.thread.id, 50 * TR, holding.name);
  await buyer.inStep(START - 50 * TR);
  await seller.market.decide(first.offer.id, false);
  await seller.inStep(START - 100 * TR);
  await buyer.market.sync();
  await buyer.inStep(START);
  assert.deepEqual(buyer.events.filter((e) => e.type === 'returned').map((e) => e.amount), [50 * TR]);
  const second = await buyer.market.offer(opened.thread.id, 60 * TR, holding.name);
  await buyer.inStep(START - 60 * TR);
  assert.equal((await buyer.market.withdraw(second.offer.id)).offer.status, 'withdrawn');
  await buyer.inStep(START);
  assert.equal(buyer.market.held().held, 0);
  await books();
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
  await tick(11); await tick(11); await tick(0.2);      // alone in town a game asks only every ten seconds
  const seenByA = a.host.game.visitors.list();
  const seenByB = b.host.game.visitors.list();
  assert.deepEqual(seenByA.map((v) => v.name), [b.username]);
  assert.deepEqual(seenByB.map((v) => v.name), [a.username]);
  assert.equal(seenByA[0].x, -28);
  // a walks 6 m; b sees them part of the way there before all of it
  pa.x = -24; la.tick(1);
  await tick(1.3);          // a's new place reaches the server; b hears it on its own next round
  await tick(1.3);
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
