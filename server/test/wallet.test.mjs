// The bank against a real PostgreSQL: the arrival money, sending TR, asking twice, many at once, the people
// sent to often, the history, what the town reports, erasing a character, and the database's own guards.
//   server/with-postgres.sh node --test server/test/*.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { person, newPlayer, database, closeDatabase, uuid, HOLARIS, NEAR_HOLARIS, ZONE } from './harness.mjs';

const require = createRequire(import.meta.url);
const wallet = require('../../api/_lib/wallet.js');
const { WALLET } = require('../../api/_lib/schema.js');

after(() => closeDatabase());

const TR = 2;
const START = 2000 * TR;
const balance = async (p) => (await p.ok('wallet.get')).wallet.balance;
const clean = async () => assert.deepEqual(await wallet.audit(await database()), [], 'the bank\'s books are right');
const save = (p, baseRev, report) => p.call('save.put', { baseRev, enc: 'json', data: JSON.stringify({ host: { v: baseRev + 1 } }), summary: { name: 'Ada Obi', figure: 'W1' }, ...(report ? { wallet: report } : {}) });

test('a new account has a wallet with the arrival money, £20 as 2,000 TR: given once, by the bank, and written down', async () => {
  const p = await newPlayer('Arrive');
  const got = await p.ok('wallet.get');
  assert.deepEqual(got.wallet, { username: p.username, balance: START, held: 0, last: got.wallet.last });
  const me = await p.ok('me');
  assert.deepEqual(me.wallet, { balance: START, held: 0, last: got.wallet.last });
  const { entries, more } = await p.ok('wallet.history');
  assert.equal(entries.length, 1);
  assert.equal(more, false);
  assert.equal(entries[0].type, 'opening');
  assert.equal(entries[0].direction, 'in');
  assert.equal(entries[0].amount, START);
  assert.equal(entries[0].balanceAfter, START);
  assert.match(entries[0].ref, /^TR-[2-9A-HJ-NP-Z]{10}$/);
  // signing in again, on this device or another, gives nothing more
  const again = person();
  await again.ok('login', { username: p.username, password: `pw-${p.username}-long` });
  assert.equal(await balance(again), START);
  assert.equal((await again.ok('wallet.history')).entries.length, 1);
  // and a wallet is only ever its owner's to see
  const guest = person();
  for (const op of ['wallet.get', 'wallet.history', 'wallet.people', 'wallet.send', 'wallet.check', 'wallet.find', 'wallet.person.add', 'wallet.person.remove', 'save.erase']) assert.equal((await guest.call(op, {})).status, 401, op);
  await clean();
});

test('sending: the recipient must be a registered user, and every wrong amount is refused in plain words', async () => {
  const a = await newPlayer('Sender'), b = await newPlayer('Getter');
  const send = (body) => a.call('wallet.send', { key: uuid(), ...body });
  const refused = async (body, status, code, message) => {
    for (const op of ['wallet.check', 'wallet.send']) {
      const r = op === 'wallet.send' ? await send(body) : await a.call(op, body);
      assert.equal(r.status, status, `${op} ${JSON.stringify(body)}`);
      assert.equal(r.body.code, code, `${op} ${JSON.stringify(body)}`);
      if (message) assert.match(r.body.message, message, `${op} ${JSON.stringify(body)}`);
    }
  };
  await refused({ username: '', amount: '10' }, 400, 'RECIPIENT');
  await refused({ username: 'nobody_here_9', amount: '10' }, 404, 'NO_USER', /^Username not found\. You can only send TR to registered users\.$/);
  await refused({ username: 'x'.repeat(60), amount: '10' }, 404, 'NO_USER');
  await refused({ username: "a'; drop table pcw.wallets; --", amount: '10' }, 404, 'NO_USER');
  await refused({ username: a.username, amount: '10' }, 400, 'SELF', /yourself/);
  await refused({ username: a.username.toUpperCase(), amount: '10' }, 400, 'SELF');
  for (const amount of ['', '   ', undefined, null]) await refused({ username: b.username, amount }, 400, 'AMOUNT', /Enter an amount/);
  for (const amount of ['0', '0.0', '-5', '-0.5', '\u22125']) await refused({ username: b.username, amount }, 400, 'AMOUNT', /more than zero/);
  for (const amount of ['ten', '1e3', '0x10', '1,5', '12,34', '5 5', 'NaN', 'Infinity', '.5', '5.', '1.2.3', '+5']) await refused({ username: b.username, amount }, 400, 'AMOUNT', /not an amount/);
  for (const amount of ['10.25', '0.1', '0.05', '1.55', '3.333']) await refused({ username: b.username, amount }, 400, 'AMOUNT', /a half and no further/);
  await refused({ username: b.username, amount: '99999999999999' }, 400, 'AMOUNT', /more than can be sent/);
  await refused({ username: b.username, amount: '2000.5' }, 409, 'FUNDS', /You do not have that much\. Your balance is 2,000 TR\./);
  await refused({ username: b.username, amount: '1000000' }, 409, 'FUNDS');
  // a number where a figure in writing is expected is the same amount
  assert.equal((await a.ok('wallet.check', { username: b.username, amount: 12.5 })).amount, 25);
  // a request to send with no key, or a key that is not one, is not read
  assert.equal((await a.call('wallet.send', { username: b.username, amount: '5' })).status, 400);
  assert.equal((await a.call('wallet.send', { key: 'again', username: b.username, amount: '5' })).status, 400);
  // nothing moved in any of that
  assert.equal(await balance(a), START);
  assert.equal(await balance(b), START);
  assert.equal((await a.ok('wallet.history')).entries.length, 1);
  await clean();
});

test('sending: what is checked is what is sent; there is no charge; both sides and the record move together', async () => {
  const a = await newPlayer('Payer'), b = await newPlayer('Payee');
  const checked = await a.ok('wallet.check', { username: b.username.toLowerCase(), amount: '1,250.5', note: '  for the   blocks ' });
  assert.deepEqual(checked, { ok: true, person: { username: b.username, saved: false }, amount: 2501, fee: 0, total: 2501, balance: START, note: 'for the blocks' });
  const sent = await a.ok('wallet.send', { key: uuid(), username: `@${b.username}`, amount: '1250.5', note: 'for the blocks' });
  assert.equal(sent.balance, START - 2501);
  assert.equal(sent.transfer.to, b.username);
  assert.equal(sent.transfer.amount, 2501);
  assert.equal(sent.transfer.fee, 0);
  assert.equal(sent.transfer.replayed, false);
  assert.match(sent.transfer.ref, /^TR-[2-9A-HJ-NP-Z]{10}$/);
  assert.equal(await balance(a), START - 2501);
  assert.equal(await balance(b), START + 2501);
  // each sees it in their own history, from their own side, under the same reference
  const mine = (await a.ok('wallet.history')).entries[0], theirs = (await b.ok('wallet.history')).entries[0];
  assert.deepEqual({ type: mine.type, direction: mine.direction, amount: mine.amount, other: mine.other, note: mine.note, status: mine.status, ref: mine.ref, after: mine.balanceAfter },
    { type: 'sent', direction: 'out', amount: 2501, other: b.username, note: 'for the blocks', status: 'completed', ref: sent.transfer.ref, after: START - 2501 });
  assert.deepEqual({ type: theirs.type, direction: theirs.direction, amount: theirs.amount, other: theirs.other, note: theirs.note, ref: theirs.ref, after: theirs.balanceAfter },
    { type: 'received', direction: 'in', amount: 2501, other: a.username, note: 'for the blocks', ref: sent.transfer.ref, after: START + 2501 });
  assert.ok(Date.now() - new Date(mine.at).getTime() < 60000);
  // the recipient's page is told when it next looks
  const news = await b.ok('wallet.get', { since: theirs.id - 1 });
  assert.equal(news.news.length, 1);
  assert.equal(news.news[0].other, a.username);
  assert.equal((await b.ok('wallet.get', { since: theirs.id })).news.length, 0);
  // everything can be sent, to the last half TR, and then there is nothing
  const rest = await a.ok('wallet.send', { key: uuid(), username: b.username, amount: String((START - 2501) / TR) });
  assert.equal(rest.balance, 0);
  const none = await a.call('wallet.send', { key: uuid(), username: b.username, amount: '0.5' });
  assert.equal(none.body.code, 'FUNDS');
  assert.equal(await balance(b), START * 2);
  await clean();
});

test('asked twice is done once: the same key is the same movement, and cannot be used for another', async () => {
  const a = await newPlayer('Twice'), b = await newPlayer('Once'), c = await newPlayer('Other');
  const key = uuid();
  const first = await a.ok('wallet.send', { key, username: b.username, amount: '300', note: 'rent' });
  const second = await a.ok('wallet.send', { key, username: b.username, amount: '300', note: 'rent' });
  assert.equal(second.transfer.ref, first.transfer.ref);
  assert.equal(second.transfer.replayed, true);
  assert.equal(second.balance, START - 600);
  assert.equal(await balance(a), START - 600);
  assert.equal(await balance(b), START + 600);
  // the same key with a different amount, person or note is a different request: refused, nothing moved
  for (const other of [{ username: b.username, amount: '301', note: 'rent' }, { username: c.username, amount: '300', note: 'rent' }, { username: b.username, amount: '300', note: 'rent!' }]) {
    const r = await a.call('wallet.send', { key, ...other });
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'KEY_REUSED');
  }
  // someone else may happen on the same key: it is theirs, and a movement of its own
  const theirs = await b.ok('wallet.send', { key, username: c.username, amount: '1' });
  assert.notEqual(theirs.transfer.ref, first.transfer.ref);
  // the same press arriving ten times at once
  const burst = uuid();
  const answers = await Promise.all(Array.from({ length: 10 }, () => a.call('wallet.send', { key: burst, username: c.username, amount: '50' })));
  assert.ok(answers.every((r) => r.status === 200), JSON.stringify(answers.map((r) => r.body.code || 'ok')));
  assert.equal(new Set(answers.map((r) => r.body.transfer.ref)).size, 1);
  assert.equal(answers.filter((r) => !r.body.transfer.replayed).length, 1);
  assert.equal(await balance(a), START - 600 - 100);
  assert.equal(await balance(c), START + 2 + 100);
  assert.equal((await a.ok('wallet.history')).entries.filter((e) => e.type === 'sent').length, 2);
  await clean();
});

test('many at once: the same TR is never spent twice, a balance never goes below nothing, and nobody waits for ever', async () => {
  const a = await newPlayer('Rush'), b = await newPlayer('Rush'), c = await newPlayer('Rush');
  // twenty payments of 150 TR from a wallet that holds 2,000: thirteen can be paid
  const many = await Promise.all(Array.from({ length: 20 }, () => a.call('wallet.send', { key: uuid(), username: b.username, amount: '150' })));
  const paid = many.filter((r) => r.status === 200), short = many.filter((r) => r.status === 409 && r.body.code === 'FUNDS');
  assert.equal(paid.length, 13, JSON.stringify(many.map((r) => r.body.code || 'ok')));
  assert.equal(short.length, 7);
  assert.equal(await balance(a), START - 13 * 150 * TR);
  assert.equal(await balance(b), START + 13 * 150 * TR);
  // every answer that said "sent" said a different balance, and none below nothing
  assert.equal(new Set(paid.map((r) => r.body.balance)).size, 13);
  assert.ok(paid.every((r) => r.body.balance >= 0));
  // two people sending to each other, and round in a ring, all at the same moment
  const ring = [];
  for (let i = 0; i < 8; i += 1) {
    ring.push(b.call('wallet.send', { key: uuid(), username: c.username, amount: '10' }));
    ring.push(c.call('wallet.send', { key: uuid(), username: b.username, amount: '10' }));
    ring.push(c.call('wallet.send', { key: uuid(), username: a.username, amount: '5' }));
    ring.push(a.call('wallet.send', { key: uuid(), username: c.username, amount: '2.5' }));
  }
  const done = await Promise.all(ring);
  assert.ok(done.every((r) => r.status === 200), JSON.stringify(done.filter((r) => r.status !== 200).map((r) => r.body)));
  assert.equal(await balance(a) + await balance(b) + await balance(c), START * 3);
  await clean();
});

test('sending is not something to be done hundreds of times a minute', async () => {
  const a = await newPlayer('Flood'), b = await newPlayer('Flood');
  const tries = [];
  for (let i = 0; i < 34; i += 1) tries.push(await a.call('wallet.send', { key: uuid(), username: b.username, amount: '1' }));
  assert.equal(tries.filter((r) => r.status === 200).length, 30);
  assert.ok(tries.slice(30).every((r) => r.status === 429 && r.body.code === 'TOO_MANY'), JSON.stringify(tries.slice(30).map((r) => [r.status, r.body.code])));
  assert.equal(await balance(a), START - 60);
  assert.equal(await balance(b), START + 60);
});

test('people sent to often: offered after sending, kept by who they are, never twice, and nobody else\'s business', async () => {
  const a = await newPlayer('Keeper'), b = await newPlayer('Friend'), c = await newPlayer('Friend');
  assert.deepEqual((await a.ok('wallet.people')).people, []);
  const sent = await a.ok('wallet.send', { key: uuid(), username: b.username, amount: '5' });
  assert.equal(sent.transfer.saved, false);
  const added = await a.ok('wallet.person.add', { username: b.username.toUpperCase() });
  assert.equal(added.added, b.username);
  assert.deepEqual(added.people.map((p) => p.username), [b.username]);
  // again: still one
  assert.equal((await a.ok('wallet.person.add', { username: b.username })).people.length, 1);
  await a.ok('wallet.person.add', { username: c.username });
  assert.deepEqual((await a.ok('wallet.people')).people.map((p) => p.username).sort(), [b.username, c.username].sort());
  assert.equal((await a.ok('wallet.send', { key: uuid(), username: b.username, amount: '5' })).transfer.saved, true);
  assert.equal((await a.ok('wallet.find', { username: b.username })).person.saved, true);
  // not oneself, and not someone who does not exist
  assert.equal((await a.call('wallet.person.add', { username: a.username })).body.code, 'SELF');
  assert.equal((await a.call('wallet.person.add', { username: 'nobody_here_9' })).body.message, 'Username not found. You can only send TR to registered users.');
  // it is the person that is kept, not the spelling of their name
  const sql = await database();
  const rows = await sql.unsafe(`select b.person_id, a.username from pcw.beneficiaries b join pcw.accounts a on a.id = b.person_id where b.owner_id = (select id from pcw.accounts where username = $1)`, [a.username]);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => /^[0-9a-f-]{36}$/.test(r.person_id)));
  // each person's list is their own
  assert.deepEqual((await b.ok('wallet.people')).people, []);
  await b.ok('wallet.person.remove', { username: c.username });
  assert.equal((await a.ok('wallet.people')).people.length, 2);
  // removing
  assert.deepEqual((await a.ok('wallet.person.remove', { username: b.username })).people.map((p) => p.username), [c.username]);
  assert.equal((await a.ok('wallet.find', { username: b.username })).person.saved, false);
  await clean();
});

test('the history is the player\'s own, newest first, a page at a time', async () => {
  const a = await newPlayer('Pages'), b = await newPlayer('Pages');
  for (let i = 1; i <= 23; i += 1) await a.ok('wallet.send', { key: uuid(), username: b.username, amount: String(i) });
  const first = await a.ok('wallet.history');
  assert.equal(first.entries.length, 20);
  assert.equal(first.more, true);
  assert.equal(first.entries[0].amount, 23 * TR);
  assert.ok(first.entries.every((e, i) => !i || e.id < first.entries[i - 1].id));
  const second = await a.ok('wallet.history', { before: first.next });
  assert.equal(second.entries.length, 4);
  assert.equal(second.more, false);
  assert.equal(second.entries[3].type, 'opening');
  // nothing of anyone else's is in it
  const all = [...first.entries, ...second.entries];
  assert.ok(all.every((e) => e.type === 'opening' || e.other === b.username));
  const theirs = await b.ok('wallet.history');
  assert.ok(theirs.entries.every((e) => e.type === 'opening' || (e.type === 'received' && e.other === a.username)));
  await clean();
});

test('the town: what a character earns and spends goes to the bank with its save, and only as much as could be earned', async () => {
  const p = await newPlayer('Worker');
  // earned 37.5 TR at the yard and spent 20 since arriving
  const one = await save(p, 0, { from: 0, upto: 40, earned: 75, spent: 40 });
  assert.equal(one.status, 200);
  assert.deepEqual(one.body.wallet, { balance: START + 35, mark: 40, refused: 0, short: 0, held: 0 });
  assert.equal(await balance(p), START + 35);
  // it is one line in the full history, and kept out of the short one
  assert.equal((await p.ok('wallet.history')).entries.length, 1);
  const full = (await p.ok('wallet.history', { all: true })).entries;
  assert.deepEqual({ type: full[0].type, direction: full[0].direction, amount: full[0].amount, earned: full[0].earned, spent: full[0].spent }, { type: 'game', direction: 'in', amount: 35, earned: 75, spent: 40 });
  // the same report again cannot be taken twice: the save it came with is no longer the newest
  const again = await save(p, 0, { from: 0, upto: 40, earned: 75, spent: 40 });
  assert.equal(again.status, 409);
  assert.equal(again.body.code, 'NEWER');
  assert.equal(await balance(p), START + 35);
  // nor can a report that does not start where the last one ended
  const skipped = await save(p, 1, { from: 0, upto: 80, earned: 500, spent: 0 });
  assert.equal(skipped.status, 409);
  assert.equal(skipped.body.code, 'OUT_OF_STEP');
  assert.equal(await balance(p), START + 35);
  assert.equal((await p.ok('me')).save.rev, 1, 'and the save that came with it was not kept either');
  // spending more than there is takes the wallet to nothing, not below
  const broke = await save(p, 1, { from: 40, upto: 50, earned: 0, spent: START * 3 });
  assert.equal(broke.body.wallet.balance, 0);
  assert.equal(broke.body.wallet.short, START * 3 - (START + 35));
  // a page that says it earned a fortune is believed only as far as a person could have earned
  const rich = await save(p, 2, { from: 50, upto: 60, earned: 1_000_000_000, spent: 0 });
  assert.equal(rich.status, 200);
  assert.equal(rich.body.wallet.balance, WALLET.earnBurst - 75);
  assert.equal(rich.body.wallet.refused, 1_000_000_000 - (WALLET.earnBurst - 75));
  // and straight afterwards, hardly anything more (the allowance comes back with time, not with asking)
  const more = await save(p, 3, { from: 60, upto: 70, earned: 1_000_000, spent: 0 });
  assert.ok(more.body.wallet.balance - rich.body.wallet.balance <= 10, `took ${more.body.wallet.balance - rich.body.wallet.balance} more`);
  // nonsense is not read, and a save with no report changes nothing in the bank
  for (const bad of [{ from: 70, upto: 60, earned: 0, spent: 0 }, { from: 70, upto: 80, earned: -5, spent: 0 }, { from: 70, upto: 80, earned: 1.5, spent: 0 }, { from: '70', upto: 80, earned: 0, spent: 0 }, { from: 70, upto: 80, earned: 0 }]) assert.equal((await save(p, 4, bad)).status, 400, JSON.stringify(bad));
  const quiet = await save(p, 4, null);
  assert.equal(quiet.body.wallet.balance, more.body.wallet.balance);
  assert.equal(quiet.body.wallet.mark, 70);
  await clean();
});

test('erasing a character: only the character goes. The account, the wallet, its history, the people and what is owned all stay', async () => {
  const p = await newPlayer('Eraser'), friend = await newPlayer('Friend');
  await save(p, 0, { from: 0, upto: 30, earned: 100, spent: 0 });
  await save(p, 1, { from: 30, upto: 44, earned: 0, spent: 10 });
  await p.ok('wallet.send', { key: uuid(), username: friend.username, amount: '100' });
  await p.ok('wallet.person.add', { username: friend.username });
  const { thread } = await p.ok('market.open', { listing: HOLARIS.listing, at: NEAR_HOLARIS });
  await p.ok('market.offer', { thread: thread.id, offer: uuid(), amount: 100 * TR });
  const before = { balance: await balance(p), history: (await p.ok('wallet.history', { all: true })).entries.map((e) => e.ref), people: (await p.ok('wallet.people')).people.length, owned: (await p.ok('market.mine')).holdings.length };
  assert.equal(before.balance, START + 90 - 200 - 200);
  assert.equal(before.owned, 1);
  assert.equal((await p.ok('me')).save.rev, 2);

  const erased = await p.ok('save.erase');
  assert.equal(erased.rev, 3);
  assert.equal(erased.erased, true);
  assert.equal(erased.wallet.balance, before.balance);
  assert.equal(erased.wallet.mark, 0);
  // the account is as it was
  const me = await p.ok('me');
  assert.equal(me.account.username, p.username);
  assert.deepEqual(me.save, { rev: 3, erased: true });
  assert.deepEqual(await p.ok('save.get'), { ok: true, save: null, erased: true, rev: 3, wallet: { balance: before.balance, held: 0, last: erased.wallet.last, mark: 0 } });
  assert.equal(await balance(p), before.balance);
  assert.deepEqual((await p.ok('wallet.history', { all: true })).entries.map((e) => e.ref), before.history);
  assert.equal((await p.ok('wallet.people')).people.length, before.people);
  assert.equal((await p.ok('market.mine')).holdings.length, before.owned);
  // the password still opens it
  const elsewhere = person();
  assert.equal((await elsewhere.ok('login', { username: p.username, password: `pw-${p.username}-long` })).save.erased, true);
  // a copy of the old character, still open somewhere, cannot bring it back
  for (const stale of [0, 1, 2]) { const r = await save(p, stale, { from: 44, upto: 60, earned: 50, spent: 0 }); assert.equal(r.status, 409, `a save from revision ${stale}`); assert.equal(r.body.code, 'NEWER'); assert.equal(r.body.rev, 3); }
  assert.equal(await balance(p), before.balance);
  // the new journey begins from here, once, and its own count starts again
  const fresh = await save(p, 3, { from: 0, upto: 12, earned: 0, spent: 0 });
  assert.equal(fresh.status, 200);
  assert.equal(fresh.body.rev, 4);
  assert.equal(fresh.body.wallet.balance, before.balance);
  assert.equal((await save(p, 3, { from: 0, upto: 12, earned: 0, spent: 0 })).status, 409, 'and only once');
  assert.equal((await p.ok('me')).save.name, 'Ada Obi');
  // erasing where there is nothing to erase is the same thing: a clean start, nothing else touched
  const none = await newPlayer('Blank');
  assert.equal((await none.ok('save.erase')).rev, 1);
  assert.equal(await balance(none), START);
  assert.equal((await friend.ok('wallet.get')).wallet.balance, START + 200, 'and nobody else\'s was touched');
  await clean();
});

test('the market is paid for at the bank: at the shop as the thing is handed over, and nothing is sold to an empty wallet', async () => {
  const rich = await newPlayer('Buyer'), poor = await newPlayer('Broke'), other = await newPlayer('Other');
  const left = async () => ((await rich.ok('market.list', { q: 'watch' })).listings.find((l) => l.id === HOLARIS.listing) || { left: 0 }).left;
  const stock = await left();
  // a wallet with less than the price
  await poor.ok('wallet.send', { key: uuid(), username: other.username, amount: '1950.5' });
  assert.equal(await balance(poor), 99);
  const shop = await poor.ok('market.open', { listing: HOLARIS.listing, at: NEAR_HOLARIS });
  const no = await poor.call('market.offer', { thread: shop.thread.id, offer: uuid(), amount: 100 * TR });
  assert.equal(no.status, 409);
  assert.equal(no.body.code, 'FUNDS');
  assert.match(no.body.message, /It is 100 TR and you have 49\.5 TR/);
  assert.equal(await left(), stock, 'nothing left the shop');
  assert.equal((await poor.ok('market.mine')).holdings.length, 0);
  assert.equal(await balance(poor), 99);
  // a buyer who has it: the price, exactly, whatever they offered
  const mine = await rich.ok('market.open', { listing: HOLARIS.listing, at: NEAR_HOLARIS });
  const bought = await rich.ok('market.offer', { thread: mine.thread.id, offer: uuid(), amount: 500 * TR });
  assert.equal(bought.sale.amount, 100 * TR);
  assert.equal(bought.balance, START - 100 * TR);
  assert.equal(await balance(rich), START - 100 * TR);
  assert.equal(await left(), stock - 1);
  const entry = (await rich.ok('wallet.history')).entries[0];
  assert.deepEqual({ type: entry.type, direction: entry.direction, amount: entry.amount, other: entry.other }, { type: 'bought', direction: 'out', amount: 100 * TR, other: 'HOLARIS Watch' });
  assert.match(entry.what, /HOLARIS Wristwatch No\. \d+ of 10/);
  // neither game is left anything to settle
  assert.deepEqual({ debits: (await rich.ok('market.mine')).debits, credits: (await rich.ok('market.mine')).credits }, { debits: [], credits: [] });
  await clean();
});

test('between players: an offer sets its TR aside; yes pays the seller; no, withdrawing, or losing gives it back', async () => {
  const seller = await newPlayer('Seller'), b1 = await newPlayer('Bidder'), b2 = await newPlayer('Bidder');
  const shop = await seller.ok('market.open', { listing: HOLARIS.listing, at: NEAR_HOLARIS });
  const got = await seller.ok('market.offer', { thread: shop.thread.id, offer: uuid(), amount: 100 * TR });
  const listed = await seller.ok('market.sell', { holding: got.sale.holding, price: 400 * TR, place: { x: 10, z: 10, label: 'By the well' }, zone: ZONE });
  const at = { x: 10, z: 10 };
  const t1 = await b1.ok('market.open', { listing: listed.listing.id, at }), t2 = await b2.ok('market.open', { listing: listed.listing.id, at });
  // more than there is cannot be offered
  const tooMuch = await b1.call('market.offer', { thread: t1.thread.id, offer: uuid(), amount: START + 1 });
  assert.equal(tooMuch.body.code, 'FUNDS');
  // an offer: the TR is aside, and cannot be sent to anyone meanwhile
  const o1 = uuid();
  const made = await b1.ok('market.offer', { thread: t1.thread.id, offer: o1, amount: 300 * TR });
  assert.equal(made.balance, START - 600);
  assert.deepEqual((await b1.ok('wallet.get')).wallet.held, 600);
  assert.equal((await b1.call('wallet.send', { key: uuid(), username: b2.username, amount: '1800' })).body.code, 'FUNDS');
  // asked again (a poor connection): the same offer, nothing more set aside
  await b1.ok('market.offer', { thread: t1.thread.id, offer: o1, amount: 300 * TR });
  assert.equal(await balance(b1), START - 600);
  // withdrawn: it comes back
  assert.equal((await b1.ok('market.withdraw', { offer: o1 })).balance, START);
  assert.equal((await b1.ok('market.withdraw', { offer: o1 })).offer.status, 'withdrawn');
  assert.equal(await balance(b1), START);
  // refused: it comes back
  const o2 = uuid();
  await b1.ok('market.offer', { thread: t1.thread.id, offer: o2, amount: 250 * TR });
  await seller.ok('market.decide', { offer: o2, accept: false });
  assert.equal(await balance(b1), START);
  const kinds = (await b1.ok('wallet.history')).entries.slice(0, 4).map((e) => `${e.type}:${e.status}`);
  assert.deepEqual(kinds, ['returned:completed', 'held:returned', 'returned:completed', 'held:returned']);
  // two offers waiting; the seller says yes to one: that buyer has paid, the seller has the money, the other has theirs back
  const o3 = uuid(), o4 = uuid();
  await b1.ok('market.offer', { thread: t1.thread.id, offer: o3, amount: 350 * TR });
  await b2.ok('market.offer', { thread: t2.thread.id, offer: o4, amount: 380 * TR });
  await clean();
  const before = await balance(seller);
  const yes = await seller.ok('market.decide', { offer: o4, accept: true, amount: 380 * TR });
  assert.equal(yes.sale.amount, 380 * TR);
  assert.equal(yes.balance, before + 760);
  assert.equal(await balance(seller), before + 760);
  assert.equal(await balance(b2), START - 760);
  assert.equal(await balance(b1), START);
  assert.equal((await b2.ok('market.mine')).holdings.length, 1);
  assert.equal((await seller.ok('market.mine')).holdings.length, 0);
  const sold = (await seller.ok('wallet.history')).entries[0];
  assert.deepEqual({ type: sold.type, direction: sold.direction, amount: sold.amount, other: sold.other }, { type: 'sold', direction: 'in', amount: 760, other: b2.username });
  const paid = (await b2.ok('wallet.history')).entries[0];
  assert.deepEqual({ type: paid.type, status: paid.status, other: paid.other, amount: paid.amount }, { type: 'held', status: 'paid', other: seller.username, amount: 760 });
  // the same yes again does not pay twice
  assert.equal((await seller.call('market.decide', { offer: o4, accept: true })).status, 409);
  assert.equal(await balance(seller), before + 760);
  // a listing taken down gives back what was waiting on it
  const relisted = await b2.ok('market.sell', { holding: yes.sale.holding, price: 500 * TR, place: { x: 10, z: 10, label: 'By the well' }, zone: ZONE });
  const t3 = await b1.ok('market.open', { listing: relisted.listing.id, at });
  await b1.ok('market.offer', { thread: t3.thread.id, offer: uuid(), amount: 450 * TR });
  assert.equal(await balance(b1), START - 900);
  await b2.ok('market.unlist', { listing: relisted.listing.id });
  assert.equal(await balance(b1), START);
  assert.equal((await b1.ok('wallet.get')).wallet.held, 0);
  await clean();
});

test('the database itself keeps the books: a balance changes only by an entry, history is not edited, a movement sums to nothing', async () => {
  const p = await newPlayer('Guard');
  const sql = await database();
  const refuses = async (statement, pattern) => assert.rejects(() => sql.unsafe(statement), pattern, statement);
  await refuses(`update pcw.wallets set balance = balance + 1000000 where account_id = (select id from pcw.accounts where username = '${p.username}')`, /only by a ledger entry/);
  await refuses(`delete from pcw.wallets where kind = 'player'`, /never deleted/);
  await refuses(`update pcw.wallets set overdraw = true where kind = 'player'`, /violates check|not altered/);
  await refuses(`update pcw.wallet_entries set amount = amount * 2`, /history is not changed/);
  await refuses(`delete from pcw.wallet_entries`, /history is not changed/);
  await refuses(`delete from pcw.wallet_tx`, /history is not changed/);
  await refuses(`update pcw.wallet_tx set note = 'x'`, /history is not changed/);
  await refuses(`truncate pcw.wallet_entries`, /history is not changed/);
  await refuses(`truncate pcw.wallets cascade`, /history is not changed/);
  // TR from nowhere: a movement with one side does not survive its transaction
  await assert.rejects(() => sql.begin(async (tx) => {
    const t = await tx.unsafe(`insert into pcw.wallet_tx (ref, kind) values ('TR-FROMNOWHERE', 'transfer') returning id`);
    await tx.unsafe(`insert into pcw.wallet_entries (tx_id, wallet_id, amount) select $1, id, 5000 from pcw.wallets where account_id = (select id from pcw.accounts where username = $2)`, [t[0].id, p.username]);
  }), /must sum to nothing/);
  // and one that would leave a player's wallet below nothing is stopped by the wallet itself
  await assert.rejects(() => sql.begin(async (tx) => {
    const t = await tx.unsafe(`insert into pcw.wallet_tx (ref, kind) values ('TR-BELOWNOTHNG', 'transfer') returning id`);
    await tx.unsafe(`insert into pcw.wallet_entries (tx_id, wallet_id, amount) select $1, id, -999999 from pcw.wallets where account_id = (select id from pcw.accounts where username = $2)`, [t[0].id, p.username]);
  }), /violates check constraint/);
  assert.equal(await balance(p), START);
  // every table of the bank is closed to the database's public keys
  const open = await sql.unsafe(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'pcw' and c.relkind = 'r' and not c.relrowsecurity`);
  assert.deepEqual(open.map((r) => r.relname), []);
  const policies = await sql.unsafe(`select count(*)::int as n from pg_policies where schemaname = 'pcw'`);
  assert.equal(policies[0].n, 0);
  await clean();
});

test('nothing that reaches the page says anything it should not: no password, no key, no one else\'s wallet', async () => {
  const a = await newPlayer('Quiet'), b = await newPlayer('Quiet');
  const sent = await a.ok('wallet.send', { key: uuid(), username: b.username, amount: '5', note: 'hello' });
  const everything = JSON.stringify([sent, await a.ok('wallet.get', { since: 0 }), await a.ok('wallet.history', { all: true }), await a.ok('wallet.people'), await a.ok('me'), await a.ok('wallet.check', { username: b.username, amount: '1' })]);
  assert.ok(!/pass|hash|scrypt|token|session|postgres|secret/i.test(everything), everything.match(/.{20}(pass|hash|scrypt|token|session|postgres|secret).{20}/i));
  // an account's own number never leaves the server: people are known to each other by username alone
  const sql = await database();
  const ids = await sql.unsafe(`select id::text as id from pcw.accounts union select id::text from pcw.wallets`);
  for (const row of ids) assert.ok(!everything.includes(row.id), 'an internal number reached the page');
  // from another site, or without the game's own header, nothing is done
  assert.equal((await a.call('wallet.send', { key: uuid(), username: b.username, amount: '5' }, { headers: { origin: 'https://elsewhere.example' } })).status, 403);
  assert.equal((await a.call('wallet.send', { key: uuid(), username: b.username, amount: '5' }, { headers: { 'x-pcw': null } })).status, 403);
  assert.equal(await balance(a), START - 10);
});
