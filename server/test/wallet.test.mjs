// The bank against a real PostgreSQL: the arrival money (starter TR) and what it may and may not pay for, earned
// TR, sending, asking twice, many at once, the people sent to often, the history, what the town reports, erasing
// a character, the ways starter TR might be passed off as earned, and the database's own guards.
//   server/with-postgres.sh node --test server/test/*.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { person, newPlayer, earner, earn, report, database, closeDatabase, uuid, HOLARIS, NEAR_HOLARIS, ZONE } from './harness.mjs';

const require = createRequire(import.meta.url);
const wallet = require('../../api/_lib/wallet.js');
const { WALLET } = require('../../api/_lib/schema.js');

after(() => closeDatabase());

const TR = 2;
const STARTER = 2000 * TR;               // what every account arrives with: starter TR, all of it
const EARNED = 2000 * TR;                // what a player made by `rich` has earned in town besides
const START = STARTER + EARNED;          // ...and so holds
const rich = (prefix) => earner(prefix, EARNED);
const balance = async (p) => (await p.ok('wallet.get')).wallet.balance;
const parts = async (p) => { const w = (await p.ok('wallet.get')).wallet; return { balance: w.balance, starter: w.starter, earned: w.balance - w.starter - w.illicit, illicit: w.illicit, eligible: w.eligible }; };
const kept = async (p) => { const now = await p.ok('save.get'); return { rev: now.save ? now.save.rev : (now.rev || 0), mark: now.wallet.mark }; };
const clean = async () => assert.deepEqual(await wallet.audit(await database()), [], 'the bank\'s books are right');
const save = (p, baseRev, report) => p.call('save.put', { baseRev, enc: 'json', data: JSON.stringify({ host: { v: baseRev + 1 } }), summary: { name: 'Ada Obi', figure: 'W1' }, ...(report ? { wallet: report } : {}) });

test('a new account has a wallet with the arrival money, £20 as 2,000 TR: given once, by the bank, and written down', async () => {
  const p = await newPlayer('Arrive');
  const got = await p.ok('wallet.get');
  assert.deepEqual(got.wallet, { username: p.username, balance: STARTER, starter: STARTER, illicit: 0, eligible: 0, earned: 0, held: 0, adHeld: 0, last: got.wallet.last }, 'all of it is starter TR');
  const me = await p.ok('me');
  assert.deepEqual(me.wallet, { balance: STARTER, starter: STARTER, illicit: 0, eligible: 0, earned: 0, held: 0, adHeld: 0, last: got.wallet.last });
  const { entries, more } = await p.ok('wallet.history');
  assert.equal(entries.length, 1);
  assert.equal(more, false);
  assert.equal(entries[0].type, 'opening');
  assert.equal(entries[0].direction, 'in');
  assert.equal(entries[0].amount, STARTER);
  assert.equal(entries[0].starter, STARTER);
  assert.equal(entries[0].balanceAfter, STARTER);
  assert.match(entries[0].ref, /^TR-[2-9A-HJ-NP-Z]{10}$/);
  // signing in again, on this device or another, gives nothing more
  const again = person();
  await again.ok('login', { username: p.username, password: `pw-${p.username}-long` });
  assert.equal(await balance(again), STARTER);
  assert.equal((await again.ok('wallet.history')).entries.length, 1);
  // and a wallet is only ever its owner's to see
  const guest = person();
  for (const op of ['wallet.get', 'wallet.history', 'wallet.people', 'wallet.send', 'wallet.check', 'wallet.find', 'wallet.person.add', 'wallet.person.remove', 'save.erase', 'character.get', 'character.choose', 'character.quote', 'character.upgrade']) assert.equal((await guest.call(op, {})).status, 401, op);
  await clean();
});

test('sending: the recipient must be a registered user, and every wrong amount is refused in plain words', async () => {
  const a = await rich('Sender'), b = await newPlayer('Getter');
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
  await refused({ username: b.username, amount: '4000.5' }, 409, 'FUNDS', /You do not have that much\. Your balance is 4,000 TR\./);
  await refused({ username: b.username, amount: '1000000' }, 409, 'FUNDS');
  // less than the wallet holds, but more of it than was earned: the reason given is the real one
  await refused({ username: b.username, amount: '2000.5' }, 409, 'ELIGIBLE_FUNDS', /^You do not have enough eligible TR for this transaction\. 2,000 TR of your 4,000 TR is TR you have earned; the other 2,000 TR is starter TR\. Starter TR cannot be transferred\./);
  // a number where a figure in writing is expected is the same amount
  assert.equal((await a.ok('wallet.check', { username: b.username, amount: 12.5 })).amount, 25);
  // a request to send with no key, or a key that is not one, is not read
  assert.equal((await a.call('wallet.send', { username: b.username, amount: '5' })).status, 400);
  assert.equal((await a.call('wallet.send', { key: 'again', username: b.username, amount: '5' })).status, 400);
  // nothing moved in any of that
  assert.equal(await balance(a), START);
  assert.equal(await balance(b), STARTER);
  assert.equal((await a.ok('wallet.history')).entries.length, 1);
  await clean();
});

test('sending: what is checked is what is sent; there is no charge; both sides and the record move together', async () => {
  const a = await rich('Payer'), b = await newPlayer('Payee');
  const checked = await a.ok('wallet.check', { username: b.username.toLowerCase(), amount: '1,250.5', note: '  for the   blocks ' });
  assert.deepEqual(checked, { ok: true, person: { username: b.username, saved: false }, amount: 2501, fee: 0, total: 2501, balance: START, eligible: EARNED, starter: STARTER, note: 'for the blocks' });
  const sent = await a.ok('wallet.send', { key: uuid(), username: `@${b.username}`, amount: '1250.5', note: 'for the blocks' });
  assert.equal(sent.balance, START - 2501);
  assert.equal(sent.transfer.to, b.username);
  assert.equal(sent.transfer.amount, 2501);
  assert.equal(sent.transfer.fee, 0);
  assert.equal(sent.transfer.replayed, false);
  assert.match(sent.transfer.ref, /^TR-[2-9A-HJ-NP-Z]{10}$/);
  assert.equal(await balance(a), START - 2501);
  assert.equal(await balance(b), STARTER + 2501);
  // it left the sender's earned TR and is earned TR where it arrived: nobody's starter TR moved
  assert.deepEqual(await parts(a), { balance: START - 2501, starter: STARTER, earned: EARNED - 2501, illicit: 0, eligible: EARNED - 2501 });
  assert.deepEqual(await parts(b), { balance: STARTER + 2501, starter: STARTER, earned: 2501, illicit: 0, eligible: 2501 });
  // each sees it in their own history, from their own side, under the same reference
  const mine = (await a.ok('wallet.history')).entries[0], theirs = (await b.ok('wallet.history')).entries[0];
  assert.deepEqual({ type: mine.type, direction: mine.direction, amount: mine.amount, other: mine.other, note: mine.note, status: mine.status, ref: mine.ref, after: mine.balanceAfter },
    { type: 'sent', direction: 'out', amount: 2501, other: b.username, note: 'for the blocks', status: 'completed', ref: sent.transfer.ref, after: START - 2501 });
  assert.deepEqual({ type: theirs.type, direction: theirs.direction, amount: theirs.amount, other: theirs.other, note: theirs.note, ref: theirs.ref, after: theirs.balanceAfter },
    { type: 'received', direction: 'in', amount: 2501, other: a.username, note: 'for the blocks', ref: sent.transfer.ref, after: STARTER + 2501 });
  assert.ok(Date.now() - new Date(mine.at).getTime() < 60000);
  // the recipient's page is told when it next looks
  const news = await b.ok('wallet.get', { since: theirs.id - 1 });
  assert.equal(news.news.length, 1);
  assert.equal(news.news[0].other, a.username);
  assert.equal((await b.ok('wallet.get', { since: theirs.id })).news.length, 0);
  // everything that was earned can be sent, to the last half TR; what is left is the arrival money, and it stays
  const rest = await a.ok('wallet.send', { key: uuid(), username: b.username, amount: String((EARNED - 2501) / TR) });
  assert.equal(rest.balance, STARTER);
  assert.equal(rest.eligible, 0);
  const none = await a.call('wallet.send', { key: uuid(), username: b.username, amount: '0.5' });
  assert.equal(none.body.code, 'STARTER_FUNDS');
  assert.equal(none.body.message, 'Starter TR cannot be transferred. Earn TR through gameplay to send money to other players.');
  assert.equal(await balance(b), STARTER + EARNED);
  await clean();
});

test('asked twice is done once: the same key is the same movement, and cannot be used for another', async () => {
  const a = await rich('Twice'), b = await rich('Once'), c = await rich('Other');
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
  const a = await rich('Rush'), b = await rich('Rush'), c = await rich('Rush');
  // twenty payments of 150 TR from a wallet with 2,000 TR earned (and 2,000 TR of starter besides): thirteen can be paid
  const many = await Promise.all(Array.from({ length: 20 }, () => a.call('wallet.send', { key: uuid(), username: b.username, amount: '150' })));
  const paid = many.filter((r) => r.status === 200), short = many.filter((r) => r.status === 409 && r.body.code === 'ELIGIBLE_FUNDS');
  assert.equal(paid.length, 13, JSON.stringify(many.map((r) => r.body.code || 'ok')));
  assert.equal(short.length, 7);
  assert.equal(await balance(a), START - 13 * 150 * TR);
  assert.equal(await balance(b), START + 13 * 150 * TR);
  // every answer that said "sent" said a different balance, and none below nothing
  assert.equal(new Set(paid.map((r) => r.body.balance)).size, 13);
  assert.ok(paid.every((r) => r.body.balance >= STARTER && r.body.eligible >= 0 && r.body.starter === STARTER), 'and through all of it the starter TR never moved');
  assert.equal((await parts(a)).starter, STARTER);
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
  const a = await rich('Flood'), b = await newPlayer('Flood');
  const tries = [];
  for (let i = 0; i < 34; i += 1) tries.push(await a.call('wallet.send', { key: uuid(), username: b.username, amount: '1' }));
  assert.equal(tries.filter((r) => r.status === 200).length, 30);
  assert.ok(tries.slice(30).every((r) => r.status === 429 && r.body.code === 'TOO_MANY'), JSON.stringify(tries.slice(30).map((r) => [r.status, r.body.code])));
  assert.equal(await balance(a), START - 60);
  assert.equal(await balance(b), STARTER + 60);
});

test('people sent to often: offered after sending, kept by who they are, never twice, and nobody else\'s business', async () => {
  const a = await rich('Keeper'), b = await newPlayer('Friend'), c = await newPlayer('Friend');
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
  const a = await rich('Pages'), b = await newPlayer('Pages');
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

test('the town: what a character earns and spends goes to the bank with its save, each thing as what it was, and only as much as could be earned', async () => {
  const p = await newPlayer('Worker');
  // earned 37.5 TR at the yard and spent 20 on food and fares since arriving: the costs come out of starter TR
  const one = await save(p, 0, report(0, 40, { lawful: 75, cost: 40 }));
  assert.equal(one.status, 200);
  assert.deepEqual(one.body.wallet, { balance: STARTER + 35, starter: STARTER - 40, illicit: 0, eligible: 75, mark: 40, refused: 0, short: 0, shortAsset: 0, held: 0 });
  assert.equal(await balance(p), STARTER + 35);
  // it is one line in the full history, and kept out of the short one
  assert.equal((await p.ok('wallet.history')).entries.length, 1);
  const full = (await p.ok('wallet.history', { all: true })).entries;
  assert.deepEqual({ type: full[0].type, direction: full[0].direction, amount: full[0].amount, earned: full[0].earned, spent: full[0].spent, starter: full[0].starter }, { type: 'game', direction: 'in', amount: 35, earned: 75, spent: 40, starter: 40 });
  // the same report again cannot be taken twice: the save it came with is no longer the newest
  const again = await save(p, 0, report(0, 40, { lawful: 75, cost: 40 }));
  assert.equal(again.status, 409);
  assert.equal(again.body.code, 'NEWER');
  assert.equal(await balance(p), STARTER + 35);
  // nor can a report that does not start where the last one ended
  const skipped = await save(p, 1, report(0, 80, { lawful: 500 }));
  assert.equal(skipped.status, 409);
  assert.equal(skipped.body.code, 'OUT_OF_STEP');
  assert.equal(await balance(p), STARTER + 35);
  assert.equal((await p.ok('me')).save.rev, 1, 'and the save that came with it was not kept either');
  // a page that says it bought a plot with more than it has earned: only earned TR is taken for it, and the starter TR is not touched
  const plot = await save(p, 1, report(40, 50, { asset: 500 }));
  assert.equal(plot.status, 200);
  assert.deepEqual({ balance: plot.body.wallet.balance, starter: plot.body.wallet.starter, eligible: plot.body.wallet.eligible, short: plot.body.wallet.short, shortAsset: plot.body.wallet.shortAsset }, { balance: STARTER - 40, starter: STARTER - 40, eligible: 0, short: 425, shortAsset: 425 });
  // spending more than there is on costs takes the wallet to nothing, not below
  const broke = await save(p, 2, report(50, 60, { cost: STARTER * 3 }));
  assert.equal(broke.body.wallet.balance, 0);
  assert.equal(broke.body.wallet.short, STARTER * 3 - (STARTER - 40));
  // a page that says it earned a fortune is believed only as far as a person could have earned. A new account's
  // game is believed about very little: what a few minutes' work would bring
  const fortune = await save(p, 3, report(60, 70, { lawful: 1_000_000_000 }));
  assert.equal(fortune.status, 200);
  assert.ok(fortune.body.wallet.balance >= WALLET.earnStart - 75 && fortune.body.wallet.balance <= WALLET.earnStart - 75 + 10, `took ${fortune.body.wallet.balance}`);
  assert.equal(fortune.body.wallet.refused, 1_000_000_000 - fortune.body.wallet.balance);
  assert.equal(fortune.body.wallet.starter, 0, 'and what it is believed about is earned TR, never starter');
  // and straight afterwards, hardly anything more (the allowance comes back with time, not with asking)
  const more = await save(p, 4, report(70, 80, { lawful: 1_000_000, illicit: 1_000_000 }));
  assert.ok(more.body.wallet.balance - fortune.body.wallet.balance <= 10, `took ${more.body.wallet.balance - fortune.body.wallet.balance} more`);
  // nonsense is not read; a report in the old way is told to reload; and a save with no report changes nothing in the bank
  for (const bad of [report(80, 70), { ...report(80, 90), in: { lawful: -5, illicit: 0 } }, { ...report(80, 90), in: { lawful: 1.5, illicit: 0 } }, { ...report(80, 90), from: '80' }, { ...report(80, 90), out: { cost: 0, restitution: 0 } }, { ...report(80, 90), in: null }]) assert.equal((await save(p, 5, bad)).status, 400, JSON.stringify(bad));
  const old = await save(p, 5, { from: 80, upto: 90, earned: 100, spent: 0 });
  assert.equal(old.status, 409);
  assert.equal(old.body.code, 'OUT_OF_DATE');
  const quiet = await save(p, 5, null);
  assert.equal(quiet.body.wallet.balance, more.body.wallet.balance);
  assert.equal(quiet.body.wallet.mark, 80);
  await clean();
});

test('what was taken from someone is kept apart from both of the others, and is what is handed back first', async () => {
  const p = await newPlayer('Thief');
  await earn(p, 600);                                    // 300 TR earned
  await earn(p, 400, 'illicit');                         // 200 TR taken from someone
  assert.deepEqual(await parts(p), { balance: STARTER + 1000, starter: STARTER, earned: 600, illicit: 400, eligible: 1000 });
  // the law catches up: 250 TR is handed back. What was taken goes first, then starter TR; what was earned is the last to go
  const now = await kept(p);
  const back = await save(p, now.rev, report(now.mark, now.mark + 5, { restitution: 500 }));
  assert.equal(back.status, 200);
  assert.deepEqual(await parts(p), { balance: STARTER + 500, starter: STARTER - 100, earned: 600, illicit: 0, eligible: 600 });
  await clean();
});

test('erasing a character: only the character goes. The account, the wallet, its history, the people and what is owned all stay', async () => {
  const p = await rich('Eraser'), friend = await newPlayer('Friend');
  let at = await kept(p);
  await save(p, at.rev, report(at.mark, at.mark + 30, { lawful: 100 }));
  await save(p, at.rev + 1, report(at.mark + 30, at.mark + 44, { cost: 10 }));
  await p.ok('wallet.send', { key: uuid(), username: friend.username, amount: '100' });
  await p.ok('wallet.person.add', { username: friend.username });
  const { thread } = await p.ok('market.open', { listing: HOLARIS.listing, at: NEAR_HOLARIS });
  await p.ok('market.offer', { thread: thread.id, offer: uuid(), amount: 100 * TR });
  const before = { ...(await parts(p)), history: (await p.ok('wallet.history', { all: true })).entries.map((e) => e.ref), people: (await p.ok('wallet.people')).people.length, owned: (await p.ok('market.mine')).holdings.length };
  assert.equal(before.balance, START + 90 - 200 - 200);
  assert.equal(before.starter, STARTER - 10);
  assert.equal(before.owned, 1);
  const rev = (await p.ok('me')).save.rev;

  const erased = await p.ok('save.erase');
  assert.equal(erased.rev, rev + 1);
  assert.equal(erased.erased, true);
  assert.equal(erased.wallet.balance, before.balance);
  assert.equal(erased.wallet.starter, before.starter);
  assert.equal(erased.wallet.mark, 0);
  // the account is as it was
  const me = await p.ok('me');
  assert.equal(me.account.username, p.username);
  assert.deepEqual(me.save, { rev: rev + 1, erased: true });
  assert.deepEqual(await p.ok('save.get'), { ok: true, save: null, erased: true, rev: rev + 1, wallet: { balance: before.balance, starter: before.starter, illicit: 0, eligible: before.eligible, earned: before.eligible, held: 0, adHeld: 0, last: erased.wallet.last, mark: 0 } });
  assert.equal(await balance(p), before.balance);
  assert.deepEqual((await p.ok('wallet.history', { all: true })).entries.map((e) => e.ref), before.history);
  assert.equal((await p.ok('wallet.people')).people.length, before.people);
  assert.equal((await p.ok('market.mine')).holdings.length, before.owned);
  // the password still opens it
  const elsewhere = person();
  assert.equal((await elsewhere.ok('login', { username: p.username, password: `pw-${p.username}-long` })).save.erased, true);
  // a copy of the old character, still open somewhere, cannot bring it back
  for (const stale of [0, 1, rev]) { const r = await save(p, stale, report(at.mark + 44, at.mark + 60, { lawful: 50 })); assert.equal(r.status, 409, `a save from revision ${stale}`); assert.equal(r.body.code, 'NEWER'); assert.equal(r.body.rev, rev + 1); }
  assert.equal(await balance(p), before.balance);
  // the new journey begins from here, once, and its own count starts again. It is not given the arrival money a second time
  const fresh = await save(p, rev + 1, report(0, 12));
  assert.equal(fresh.status, 200);
  assert.equal(fresh.body.rev, rev + 2);
  assert.equal(fresh.body.wallet.balance, before.balance);
  assert.equal(fresh.body.wallet.starter, before.starter);
  assert.equal((await save(p, rev + 1, report(0, 12))).status, 409, 'and only once');
  assert.equal((await p.ok('me')).save.name, 'Ada Obi');
  // erasing where there is nothing to erase is the same thing: a clean start, nothing else touched
  const none = await newPlayer('Blank');
  assert.equal((await none.ok('save.erase')).rev, 1);
  assert.equal(await balance(none), STARTER);
  assert.equal((await friend.ok('wallet.get')).wallet.balance, STARTER + 200, 'and nobody else\'s was touched');
  await clean();
});

test('the market is paid for at the bank, with earned TR: nothing is sold to a wallet of starter TR, or to one with too little earned, or to an empty one', async () => {
  const buyer = await rich('Buyer'), newcomer = await newPlayer('Newcomer'), partly = await newPlayer('Partly'), empty = await newPlayer('Empty');
  const left = async () => ((await buyer.ok('market.list', { q: 'watch' })).listings.find((l) => l.id === HOLARIS.listing) || { left: 0 }).left;
  const stock = await left();
  const tryToBuy = async (who) => { const shop = await who.ok('market.open', { listing: HOLARIS.listing, at: NEAR_HOLARIS }); return who.call('market.offer', { thread: shop.thread.id, offer: uuid(), amount: 100 * TR }); };
  // 2,000 TR in the wallet, all of it arrival money: the watch is 100 TR and it is refused, in the words that say why
  const no = await tryToBuy(newcomer);
  assert.equal(no.status, 409);
  assert.equal(no.body.code, 'STARTER_FUNDS');
  assert.equal(no.body.message, 'Starter TR cannot be used to buy assets. Earn TR through gameplay to make purchases.');
  // 49.5 TR earned: not enough of it
  await earn(partly, 99);
  const some = await tryToBuy(partly);
  assert.equal(some.body.code, 'ELIGIBLE_FUNDS');
  assert.match(some.body.message, /^You do not have enough eligible TR for this transaction\. 49\.5 TR of your 2,049\.5 TR is TR you have earned; the other 2,000 TR is starter TR\. Starter TR cannot be used to buy assets\./);
  // a wallet with less than the price in it altogether: that is what it is told
  const e = await kept(empty);
  await save(empty, e.rev, report(e.mark, e.mark + 9, { cost: STARTER - 99 }));
  const none = await tryToBuy(empty);
  assert.equal(none.body.code, 'FUNDS');
  assert.match(none.body.message, /You do not have that much\. Your balance is 49\.5 TR\./);
  assert.equal(await left(), stock, 'nothing left the shop');
  for (const who of [newcomer, partly, empty]) assert.equal((await who.ok('market.mine')).holdings.length, 0);
  assert.equal(await balance(newcomer), STARTER);
  // a buyer who has earned it: the price, exactly, whatever they offered, out of earned TR
  const mine = await buyer.ok('market.open', { listing: HOLARIS.listing, at: NEAR_HOLARIS });
  const bought = await buyer.ok('market.offer', { thread: mine.thread.id, offer: uuid(), amount: 500 * TR });
  assert.equal(bought.sale.amount, 100 * TR);
  assert.equal(bought.balance, START - 100 * TR);
  assert.deepEqual(await parts(buyer), { balance: START - 200, starter: STARTER, earned: EARNED - 200, illicit: 0, eligible: EARNED - 200 });
  assert.equal(await left(), stock - 1);
  const entry = (await buyer.ok('wallet.history')).entries[0];
  assert.deepEqual({ type: entry.type, direction: entry.direction, amount: entry.amount, other: entry.other, starter: entry.starter }, { type: 'bought', direction: 'out', amount: 100 * TR, other: 'HOLARIS Watch', starter: 0 });
  assert.match(entry.what, /HOLARIS Wristwatch No\. \d+ of 10/);
  // neither game is left anything to settle
  assert.deepEqual({ debits: (await buyer.ok('market.mine')).debits, credits: (await buyer.ok('market.mine')).credits }, { debits: [], credits: [] });
  await clean();
});

test('between players: an offer sets earned TR aside; yes pays the seller; no, withdrawing, or losing gives it back as it was', async () => {
  const seller = await rich('Seller'), b1 = await rich('Bidder'), b2 = await rich('Bidder'), starterOnly = await newPlayer('Bidder');
  const shop = await seller.ok('market.open', { listing: HOLARIS.listing, at: NEAR_HOLARIS });
  const got = await seller.ok('market.offer', { thread: shop.thread.id, offer: uuid(), amount: 100 * TR });
  const listed = await seller.ok('market.sell', { holding: got.sale.holding, price: 400 * TR, place: { x: 10, z: 10, label: 'By the well' }, zone: ZONE });
  const at = { x: 10, z: 10 };
  const t1 = await b1.ok('market.open', { listing: listed.listing.id, at }), t2 = await b2.ok('market.open', { listing: listed.listing.id, at });
  // more than there is cannot be offered; nor more than was earned; nor anything at all out of arrival money
  assert.equal((await b1.call('market.offer', { thread: t1.thread.id, offer: uuid(), amount: START + 1 })).body.code, 'FUNDS');
  assert.equal((await b1.call('market.offer', { thread: t1.thread.id, offer: uuid(), amount: EARNED + 1 })).body.code, 'ELIGIBLE_FUNDS');
  const t0 = await starterOnly.ok('market.open', { listing: listed.listing.id, at });
  const refusedOffer = await starterOnly.call('market.offer', { thread: t0.thread.id, offer: uuid(), amount: 300 * TR });
  assert.equal(refusedOffer.body.code, 'STARTER_FUNDS');
  assert.equal((await starterOnly.ok('wallet.get')).wallet.held, 0);
  // an offer: the TR is aside, and cannot be sent to anyone meanwhile
  const o1 = uuid();
  const made = await b1.ok('market.offer', { thread: t1.thread.id, offer: o1, amount: 300 * TR });
  assert.equal(made.balance, START - 600);
  assert.equal(made.starter, STARTER, 'it was earned TR that was set aside');
  assert.deepEqual((await b1.ok('wallet.get')).wallet.held, 600);
  assert.equal((await b1.call('wallet.send', { key: uuid(), username: b2.username, amount: '1800' })).body.code, 'ELIGIBLE_FUNDS');
  // asked again (a poor connection): the same offer, nothing more set aside
  await b1.ok('market.offer', { thread: t1.thread.id, offer: o1, amount: 300 * TR });
  assert.equal(await balance(b1), START - 600);
  // withdrawn: it comes back, and it is earned TR again
  assert.equal((await b1.ok('market.withdraw', { offer: o1 })).balance, START);
  assert.equal((await b1.ok('market.withdraw', { offer: o1 })).offer.status, 'withdrawn');
  assert.deepEqual(await parts(b1), { balance: START, starter: STARTER, earned: EARNED, illicit: 0, eligible: EARNED });
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
  const before = await parts(seller);
  const yes = await seller.ok('market.decide', { offer: o4, accept: true, amount: 380 * TR });
  assert.equal(yes.sale.amount, 380 * TR);
  assert.equal(yes.balance, before.balance + 760);
  // the thing was bought with earned TR, so what it fetched is earned TR: the seller's starter TR is what it was
  assert.deepEqual(await parts(seller), { balance: before.balance + 760, starter: STARTER, earned: before.earned + 760, illicit: 0, eligible: before.eligible + 760 });
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
  assert.equal(await balance(seller), before.balance + 760);
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

// ---- starter TR does not become anyone's spending money, by any road ----

test('the arrival money cannot be sent: not a unit of it, not to a second account, not by saying otherwise', async () => {
  const a = await newPlayer('Alt'), b = await newPlayer('Alt');
  const words = 'Starter TR cannot be transferred. Earn TR through gameplay to send money to other players.';
  for (const amount of ['0.5', '1', '2000']) {
    for (const op of ['wallet.check', 'wallet.send']) {
      const r = await a.call(op, { key: uuid(), username: b.username, amount });
      assert.equal(r.status, 409, `${op} ${amount}`);
      assert.equal(r.body.code, 'STARTER_FUNDS');
      assert.equal(r.body.message, words);
    }
  }
  // a page that says what kind of TR it holds, or how much, is not listened to
  for (const lie of [{ balance: 9_000_000 }, { eligible: 9_000_000 }, { starter: 0 }, { bucket: 'earned' }, { source: 'earned' }, { wallet: { starter: 0, eligible: 4000 } }, { category: 'fee' }, { kind: 'game' }]) {
    const r = await a.call('wallet.send', { key: uuid(), username: b.username, amount: '10', ...lie });
    assert.equal(r.body.code, 'STARTER_FUNDS', JSON.stringify(lie));
  }
  assert.deepEqual(await parts(a), { balance: STARTER, starter: STARTER, earned: 0, illicit: 0, eligible: 0 });
  assert.deepEqual(await parts(b), { balance: STARTER, starter: STARTER, earned: 0, illicit: 0, eligible: 0 });
  // the owner's example: 2,000 TR of starter and 700 TR earned. A fine of 300 TR comes out of starter TR.
  await earn(a, 700 * TR);
  const at = await kept(a);
  await save(a, at.rev, report(at.mark, at.mark + 3, { cost: 300 * TR }));
  assert.deepEqual(await parts(a), { balance: 2400 * TR, starter: 1700 * TR, earned: 700 * TR, illicit: 0, eligible: 700 * TR });
  // 800 TR cannot be sent: only 700 TR is eligible. It is not told that its balance is too small: it is not.
  const tooMuch = await a.call('wallet.send', { key: uuid(), username: b.username, amount: '800' });
  assert.equal(tooMuch.body.code, 'ELIGIBLE_FUNDS');
  assert.match(tooMuch.body.message, /^You do not have enough eligible TR for this transaction\. 700 TR of your 2,400 TR is TR you have earned; the other 1,700 TR is starter TR\./);
  assert.ok(!/do not have that much/.test(tooMuch.body.message));
  // 700 TR can, and it is earned TR where it lands: the other account can send it on, but not a half TR more
  const sent = await a.ok('wallet.send', { key: uuid(), username: b.username, amount: '700' });
  assert.deepEqual({ balance: sent.balance, starter: sent.starter, eligible: sent.eligible }, { balance: 1700 * TR, starter: 1700 * TR, eligible: 0 });
  assert.deepEqual(await parts(b), { balance: 2700 * TR, starter: STARTER, earned: 700 * TR, illicit: 0, eligible: 700 * TR });
  assert.equal((await b.call('wallet.send', { key: uuid(), username: a.username, amount: '700.5' })).body.code, 'ELIGIBLE_FUNDS');
  await b.ok('wallet.send', { key: uuid(), username: a.username, amount: '700' });
  // round and round between two accounts of one person: the starter TR in each is exactly what it was
  assert.deepEqual(await parts(a), { balance: 2400 * TR, starter: 1700 * TR, earned: 700 * TR, illicit: 0, eligible: 700 * TR });
  assert.deepEqual(await parts(b), { balance: STARTER, starter: STARTER, earned: 0, illicit: 0, eligible: 0 });
  await clean();
});

test('what was asked for and refused is written down: who, what, how much and why; and what is written is not changed', async () => {
  const a = await newPlayer('Log'), b = await newPlayer('Log');
  const sql = await database();
  const lines = async (p) => sql.unsafe(`select r.op, r.code, r.amount, r.detail from pcw.wallet_refusals r join pcw.accounts c on c.id = r.account_id where c.username_key = $1 order by r.id`, [p.username.toLowerCase()]);
  assert.equal((await lines(a)).length, 0);
  // starter TR, tried three ways: looked at, sent, and offered for a watch
  await a.call('wallet.check', { username: b.username, amount: '25' });
  await a.call('wallet.send', { key: uuid(), username: b.username, amount: '25', bucket: 'earned' });
  // more than there is at all
  await a.call('wallet.send', { key: uuid(), username: b.username, amount: '9000' });
  // an upgrade at a price of the page's own choosing, by someone with earned TR enough to be quoted
  await earn(a, 1000 * TR);
  await a.ok('character.choose', { figure: 'W1', path: 'hero' });
  await a.call('character.upgrade', { key: uuid(), figure: 'M1', fee: 1 });
  // more than was earned
  await a.call('wallet.send', { key: uuid(), username: b.username, amount: '1500' });
  const got = (await lines(a)).map((r) => [r.op, r.code, r.amount]);
  assert.deepEqual(got, [
    ['wallet.check', 'STARTER_FUNDS', '25'], ['wallet.send', 'STARTER_FUNDS', '25'], ['wallet.send', 'FUNDS', '9000'],
    ['character.upgrade', 'QUOTE_CHANGED', '1'], ['wallet.send', 'ELIGIBLE_FUNDS', '1500'],
  ]);
  const all = await lines(a);
  assert.equal(all[1].detail.username, b.username);
  assert.deepEqual({ balance: all[4].detail.balance, eligible: all[4].detail.eligible, starter: all[4].detail.starter }, { balance: 3000 * TR, eligible: 1000 * TR, starter: STARTER });
  assert.equal(all[3].detail.figure, 'M1');
  assert.equal(all[3].detail.fee, 1500, 'the fee it would have been, in units: a quarter of 3,000 TR');
  // nothing that was only refused for being badly asked is in it, and nothing of anyone else's
  await a.call('wallet.send', { key: uuid(), username: 'nobody_at_all', amount: '5' });
  await a.call('wallet.send', { key: uuid(), username: b.username, amount: 'lots' });
  assert.equal((await lines(a)).length, 5);
  assert.equal((await lines(b)).length, 0);
  // what a page sends cannot fill it with anything long
  await a.call('wallet.send', { key: uuid(), username: b.username, amount: '2000', figure: 'x'.repeat(5000), listing: { a: 1 } });
  const last = (await lines(a)).pop();
  assert.equal(last.code, 'ELIGIBLE_FUNDS');
  assert.ok(JSON.stringify(last.detail).length < 400, JSON.stringify(last.detail).length);
  // it is a record: not edited, not thinned out
  await assert.rejects(sql.unsafe(`update pcw.wallet_refusals set code = 'OK'`), /history is not changed/);
  await assert.rejects(sql.unsafe(`delete from pcw.wallet_refusals`), /history is not changed/);
  await assert.rejects(sql.unsafe(`truncate pcw.wallet_refusals`), /history is not changed/);
  // and none of it moved anything
  assert.deepEqual(await parts(a), { balance: 3000 * TR, starter: STARTER, earned: 1000 * TR, illicit: 0, eligible: 1000 * TR });
  await clean();
});

test('no road turns starter TR into earned TR: not a sale, not a returned offer, not something bought before the rule', async () => {
  const seller = await rich('Launder'), buyer = await rich('Launder'), thief = await newPlayer('Launder');
  const sql = await database();
  const shop = await seller.ok('market.open', { listing: HOLARIS.listing, at: NEAR_HOLARIS });
  const got = await seller.ok('market.offer', { thread: shop.thread.id, offer: uuid(), amount: 100 * TR });
  // This watch stands for one bought before today with arrival money: the database's step 3 marks those with
  // what they cost (see migrate.test.mjs). Sold on for more, that much of the price is starter TR again.
  await sql.unsafe(`update pcw.holdings set starter_basis = 200 where id = $1`, [got.sale.holding]);
  const listed = await seller.ok('market.sell', { holding: got.sale.holding, price: 300 * TR, place: { x: 4, z: 4, label: 'The corner' }, zone: ZONE });
  const before = await parts(seller);
  const t = await buyer.ok('market.open', { listing: listed.listing.id, at: { x: 4, z: 4 } });
  const o = uuid();
  await buyer.ok('market.offer', { thread: t.thread.id, offer: o, amount: 300 * TR });
  await seller.ok('market.decide', { offer: o, accept: true, amount: 300 * TR });
  assert.deepEqual(await parts(seller), { balance: before.balance + 600, starter: before.starter + 200, earned: before.earned + 400, illicit: 0, eligible: before.eligible + 400 }, 'the 100 TR it was bought for came back as starter TR; only the gain is earned');
  // ...and the watch itself carries nothing more: its new owner paid in earned TR
  assert.equal(Number((await sql.unsafe(`select starter_basis from pcw.holdings where id = $1`, [got.sale.holding]))[0].starter_basis), 0);
  // TR that was taken from someone, set aside for an offer and given back, is still what it was
  await earn(thief, 300); await earn(thief, 500, 'illicit');
  const listed2 = await buyer.ok('market.sell', { holding: got.sale.holding, price: 500 * TR, place: { x: 4, z: 4, label: 'The corner' }, zone: ZONE });
  const t2 = await thief.ok('market.open', { listing: listed2.listing.id, at: { x: 4, z: 4 } });
  const o2 = uuid();
  const made = await thief.ok('market.offer', { thread: t2.thread.id, offer: o2, amount: 700 });
  assert.deepEqual({ balance: made.balance, starter: made.starter, illicit: made.illicit, eligible: made.eligible }, { balance: STARTER + 100, starter: STARTER, illicit: 100, eligible: 100 }, 'earned first, then what was taken');
  await thief.ok('market.withdraw', { offer: o2 });
  assert.deepEqual(await parts(thief), { balance: STARTER + 800, starter: STARTER, earned: 300, illicit: 500, eligible: 800 });
  // sent to another player it arrives as what it was, too
  await thief.ok('wallet.send', { key: uuid(), username: buyer.username, amount: '350' });
  assert.deepEqual(await parts(thief), { balance: STARTER + 100, starter: STARTER, earned: 0, illicit: 100, eligible: 100 });
  assert.equal((await parts(buyer)).illicit, 400);
  await clean();
});

test('many things at once for the same earned TR: a transfer, an offer and a purchase cannot all have it', async () => {
  const p = await newPlayer('Race'), friend = await newPlayer('Race'), seller = await rich('Race');
  await earn(p, 150 * TR);                               // enough for one thing of 100 TR, not two
  const shop = await seller.ok('market.open', { listing: HOLARIS.listing, at: NEAR_HOLARIS });
  const got = await seller.ok('market.offer', { thread: shop.thread.id, offer: uuid(), amount: 100 * TR });
  const listed = await seller.ok('market.sell', { holding: got.sale.holding, price: 100 * TR, place: { x: 6, z: 6, label: 'The gate' }, zone: ZONE });
  const mine = await p.ok('market.open', { listing: HOLARIS.listing, at: NEAR_HOLARIS });
  const theirs = await p.ok('market.open', { listing: listed.listing.id, at: { x: 6, z: 6 } });
  const all = await Promise.all([
    p.call('wallet.send', { key: uuid(), username: friend.username, amount: '100' }),
    p.call('market.offer', { thread: mine.thread.id, offer: uuid(), amount: 100 * TR }),
    p.call('market.offer', { thread: theirs.thread.id, offer: uuid(), amount: 100 * TR }),
    p.call('wallet.send', { key: uuid(), username: seller.username, amount: '100' }),
  ]);
  assert.equal(all.filter((r) => r.status === 200).length, 1, JSON.stringify(all.map((r) => r.body.code || 'ok')));
  assert.ok(all.filter((r) => r.status !== 200).every((r) => r.body.code === 'ELIGIBLE_FUNDS'));
  const now = await p.ok('wallet.get');
  assert.equal(now.wallet.starter, STARTER);
  // whichever it was, 100 TR of earned TR went on it (sent, paid, or set aside for the offer) and 50 TR is left
  assert.equal(now.wallet.balance, STARTER + 100);
  assert.equal(now.wallet.eligible, 100);
  assert.equal(now.wallet.held, all[2].status === 200 ? 200 : 0);
  await clean();
});

test('the database itself keeps the books: a balance changes only by an entry, history is not edited, a movement sums to nothing, and starter TR goes nowhere but to the town', async () => {
  const p = await rich('Guard'), q = await newPlayer('Guard');
  const sql = await database();
  const refuses = async (statement, pattern) => assert.rejects(() => sql.unsafe(statement), pattern, statement);
  const mine = `(select id from pcw.accounts where username = '${p.username}')`;
  await refuses(`update pcw.wallets set balance = balance + 1000000 where account_id = ${mine}`, /only by a ledger entry/);
  // nor can arrival money be called earned by hand
  await refuses(`update pcw.wallets set starter = 0 where account_id = ${mine}`, /only by a ledger entry/);
  await refuses(`update pcw.wallets set illicit = 5 where account_id = ${mine}`, /only by a ledger entry/);
  await refuses(`delete from pcw.wallets where kind = 'player'`, /never deleted/);
  await refuses(`update pcw.wallets set overdraw = true where kind = 'player'`, /violates check|not altered/);
  await refuses(`update pcw.wallet_entries set amount = amount * 2`, /history is not changed/);
  await refuses(`update pcw.wallet_entries set bucket = 'earned' where bucket = 'starter'`, /history is not changed/);
  await refuses(`delete from pcw.wallet_entries`, /history is not changed/);
  await refuses(`delete from pcw.wallet_tx`, /history is not changed/);
  await refuses(`update pcw.wallet_tx set note = 'x'`, /history is not changed/);
  await refuses(`truncate pcw.wallet_entries`, /history is not changed/);
  await refuses(`truncate pcw.wallets cascade`, /history is not changed/);
  const movement = (ref, kind, sides) => sql.begin(async (tx) => {
    const t = await tx.unsafe(`insert into pcw.wallet_tx (ref, kind) values ($1, $2) returning id`, [ref, kind]);
    for (const [who, amount, bucket] of sides) await tx.unsafe(`insert into pcw.wallet_entries (tx_id, wallet_id, amount, bucket) select $1, id, $3, $4 from pcw.wallets where account_id = (select id from pcw.accounts where username = $2)`, [t[0].id, who.username, amount, bucket]);
  });
  // TR from nowhere: a movement with one side does not survive its transaction
  await assert.rejects(() => movement('TR-FROMNOWHERE', 'transfer', [[p, 5000, 'earned']]), /must sum to nothing/);
  // one that would leave a part of a player's wallet below nothing is stopped by the wallet itself
  await assert.rejects(() => movement('TR-BELOWNOTHNG', 'transfer', [[p, -999999, 'earned'], [q, 999999, 'earned']]), /violates check constraint/);
  // an entry in a player's wallet that does not say which TR it moves is not written
  await assert.rejects(() => movement('TR-NOKINDATALL', 'transfer', [[p, -10, null], [q, 10, null]]), /says which TR it moves/);
  // and starter TR does not move between players, whatever asks: a transfer, a hold, a sale, an upgrade
  for (const kind of ['transfer', 'hold', 'upgrade', 'release', 'refund']) await assert.rejects(() => movement(`TR-STARTER${kind.toUpperCase().slice(0, 4)}`, kind, [[q, -100, 'starter'], [p, 100, 'earned']]), /starter TR pays the town's charges and costs and for a motorcycle or a car, and nothing else/, kind);
  await assert.rejects(() => movement('TR-STARTERSALE', 'sale', [[q, -100, 'starter'], [p, 100, 'earned']]), /starter TR pays the town's charges/);
  // (a sale that says it is a motorcycle from the showroom may take it, but only to the bank, never to a player)
  const saidMotorcycle = (ref, sides) => sql.begin(async (tx) => {
    const t = await tx.unsafe(`insert into pcw.wallet_tx (ref, kind, meta) values ($1, 'sale', '{"starterFor":"motorcycle"}'::jsonb) returning id`, [ref]);
    for (const [who, amount, bucket] of sides) await tx.unsafe(`insert into pcw.wallet_entries (tx_id, wallet_id, amount, bucket) select $1, id, $3, $4 from pcw.wallets where account_id = (select id from pcw.accounts where username = $2)`, [t[0].id, who.username, amount, bucket]);
  });
  await assert.rejects(() => saidMotorcycle('TR-STARTERMOTO', [[q, -100, 'starter'], [p, 100, 'earned']]), /paid to the town/);
  // (and so may a sale that says it is a car from the car showroom, since 18 October 2026: to the bank, never to a player)
  const saidCar = (ref, sides) => sql.begin(async (tx) => {
    const t = await tx.unsafe(`insert into pcw.wallet_tx (ref, kind, meta) values ($1, 'sale', '{"starterFor":"car"}'::jsonb) returning id`, [ref]);
    for (const [who, amount, bucket] of sides) await tx.unsafe(`insert into pcw.wallet_entries (tx_id, wallet_id, amount, bucket) select $1, id, $3, $4 from pcw.wallets where account_id = (select id from pcw.accounts where username = $2)`, [t[0].id, who.username, amount, bucket]);
  });
  await assert.rejects(() => saidCar('TR-STARTERCARS', [[q, -100, 'starter'], [p, 100, 'earned']]), /paid to the town/);
  // nor is it made out of earned TR, or out of nothing
  await assert.rejects(() => movement('TR-MAKESTARTER', 'transfer', [[p, -100, 'earned'], [q, 100, 'starter']]), /starter TR is not made that way/);
  assert.deepEqual(await parts(p), { balance: START, starter: STARTER, earned: EARNED, illicit: 0, eligible: EARNED });
  assert.deepEqual(await parts(q), { balance: STARTER, starter: STARTER, earned: 0, illicit: 0, eligible: 0 });
  // every table of the bank is closed to the database's public keys
  const open = await sql.unsafe(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'pcw' and c.relkind = 'r' and not c.relrowsecurity`);
  assert.deepEqual(open.map((r) => r.relname), []);
  const policies = await sql.unsafe(`select count(*)::int as n from pg_policies where schemaname = 'pcw'`);
  assert.equal(policies[0].n, 0);
  await clean();
});

test('nothing that reaches the page says anything it should not: no password, no key, no one else\'s wallet', async () => {
  const a = await rich('Quiet'), b = await newPlayer('Quiet');
  const sent = await a.ok('wallet.send', { key: uuid(), username: b.username, amount: '5', note: 'hello' });
  const everything = JSON.stringify([sent, await a.ok('wallet.get', { since: 0 }), await a.ok('wallet.history', { all: true }), await a.ok('wallet.people'), await a.ok('me'), await a.ok('wallet.check', { username: b.username, amount: '1' }), await a.ok('character.get'), await a.ok('character.quote', { figure: 'M1' })]);
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
