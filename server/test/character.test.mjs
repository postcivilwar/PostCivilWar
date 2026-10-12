// The one character an account is, against a real PostgreSQL: chosen once, the same everywhere, changed only by
// an upgrade that is paid for in earned TR.
//   server/with-postgres.sh node --test server/test/*.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { person, newPlayer, earn, report, database, closeDatabase, uuid, ZONE } from './harness.mjs';
import { FIGURES as GAME_FIGURES } from '../../prototype/src/sim/figures.js';
import { UPGRADE as GAME_UPGRADE, upgradeFee as gameFee, ARRIVAL_FUNDS } from '../../prototype/src/sim/sim.js';

const require = createRequire(import.meta.url);
const wallet = require('../../api/_lib/wallet.js');
const character = require('../../api/_lib/character.js');
const { WALLET } = require('../../api/_lib/schema.js');

after(() => closeDatabase());

const TR = 2;
const STARTER = 2000 * TR;
const clean = async () => assert.deepEqual(await wallet.audit(await database()), [], 'the bank\'s books are right');
const parts = async (p) => { const w = (await p.ok('wallet.get')).wallet; return { balance: w.balance, starter: w.starter, earned: w.balance - w.starter - w.illicit, illicit: w.illicit, eligible: w.eligible }; };
const mine = async (p) => (await p.ok('me')).account;
// someone who has arrived, chosen a character and earned `units` in town
const settler = async (prefix, figure, units = 0) => { const p = await newPlayer(prefix); await p.ok('character.choose', { figure, path: 'hero' }); if (units) await earn(p, units); return p; };

test('the server and the game mean the same characters, the same arrival money and the same fee', () => {
  assert.deepEqual(Object.keys(character.FIGURES).sort(), Object.keys(GAME_FIGURES).sort());
  for (const id of Object.keys(character.FIGURES)) assert.equal(character.FIGURES[id], GAME_FIGURES[id].name);
  assert.equal(WALLET.grant, ARRIVAL_FUNDS);
  assert.deepEqual({ above: character.UPGRADE.above, parts: character.UPGRADE.parts }, { above: GAME_UPGRADE.above, parts: GAME_UPGRADE.parts });
  for (const total of [0, 1, 3999, 4000, 4001, 4801, 8000, 16000, 24000, 123457]) assert.equal(character.upgradeFee(total), gameFee(total), String(total));
  // the owner's table: 2,400 TR -> 600; 4,000 -> 1,000; 8,000 -> 2,000; 12,000 -> 3,000
  for (const [total, fee] of [[2400, 600], [4000, 1000], [8000, 2000], [12000, 3000]]) assert.equal(character.upgradeFee(total * TR), fee * TR);
});

test('a character is chosen once: it is kept with the account, is there on any device, and is not chosen again', async () => {
  const p = await newPlayer('Chooser');
  assert.deepEqual(await mine(p), { username: p.username, admin: false, figure: null, path: null });
  // not something that is not a character
  for (const figure of ['X9', '', 'w1', 'M1 ', 7, null, { id: 'M1' }]) assert.equal((await p.call('character.choose', { figure })).status, 400, JSON.stringify(figure));
  const first = await p.ok('character.choose', { figure: 'W1', path: 'villain' });
  assert.equal(first.chosen, true);
  assert.deepEqual({ figure: first.character.figure, path: first.character.path }, { figure: 'W1', path: 'villain' });
  assert.ok(first.character.chosenAt);
  // asked again for the same one (a poor connection): nothing new
  assert.equal((await p.ok('character.choose', { figure: 'W1', path: 'villain' })).chosen, false);
  // asked for another: refused, and told how a character is changed. The path is not asked for twice either
  const other = await p.call('character.choose', { figure: 'M1', path: 'hero' });
  assert.equal(other.status, 409);
  assert.equal(other.body.code, 'CHOSEN');
  assert.match(other.body.message, /stays yours\. It can be changed with a character upgrade\./);
  assert.equal((await p.ok('character.choose', { figure: 'W1', path: 'hero' })).character.path, 'villain', 'the first answer stands');
  assert.deepEqual(await mine(p), { username: p.username, admin: false, figure: 'W1', path: 'villain' });
  // another device, logging in: the same character, nothing to choose
  const phone = person();
  const inNow = await phone.ok('login', { username: p.username, password: `pw-${p.username}-long` });
  assert.deepEqual({ figure: inNow.account.figure, path: inNow.account.path }, { figure: 'W1', path: 'villain' });
  // a saved game that calls itself another figure does not make it one
  await p.ok('save.put', { baseRev: 0, enc: 'json', data: '{"host":{}}', summary: { name: 'Ada', figure: 'M1' }, wallet: report(0, 3) });
  assert.equal((await mine(p)).figure, 'W1');
  assert.equal((await p.ok('me')).save.figure, 'W1', 'what the account is, is what is written down');
  // erasing the saved game and starting again: still the same character, still the same path
  await p.ok('save.erase');
  assert.deepEqual(await mine(p), { username: p.username, admin: false, figure: 'W1', path: 'villain' });
  assert.equal((await p.call('character.choose', { figure: 'M1' })).body.code, 'CHOSEN');
  await clean();
});

test('an account from before the path was kept with it: the answer its game already has is taken, once', async () => {
  const p = await newPlayer('Legacy');
  const sql = await database();
  await sql.unsafe(`update pcw.accounts set figure = 'M1', figure_at = now() where username = $1`, [p.username]);
  assert.deepEqual(await mine(p), { username: p.username, admin: false, figure: 'M1', path: null });
  const kept = await p.ok('character.choose', { figure: 'M1', path: 'hero' });
  assert.deepEqual({ chosen: kept.chosen, figure: kept.character.figure, path: kept.character.path }, { chosen: false, figure: 'M1', path: 'hero' });
  assert.equal((await p.ok('character.choose', { path: 'villain' })).character.path, 'hero');
});

test('other players see the character the account is, whatever a page says it looks like', async () => {
  const a = await settler('Seen', 'W1'), b = await settler('Seer', 'M1');
  const here = (x, figure) => ({ zone: ZONE, state: { v: 2, zn: ZONE, n: 'Somebody Else', x, z: 60, h: 0, lg: 'en', lk: { s: 1, t: 2, b: 3, f: 0, g: figure } } });
  await a.ok('presence', here(10, 'M1'));               // a page that says it is the man, under another name
  const seen = (await b.ok('presence', here(12, 'W1'))).peers;
  assert.equal(seen.length, 1);
  assert.equal(seen[0].state.n, a.username);
  assert.equal(seen[0].state.lk.g, 'W1');
  assert.equal(seen[0].state.lk.f, 1);
  const back = (await a.ok('presence', here(10, 'M1'))).peers;
  assert.equal(back[0].state.lk.g, 'M1');
});

test('an upgrade is offered only above 2,000 TR, and then only if a quarter of the wallet can be paid in earned TR', async () => {
  const p = await settler('Quote', 'W1');
  const quote = async (figure = 'M1') => (await p.ok('character.quote', { figure })).quote;
  // exactly 2,000 TR: not eligible
  let q = await quote();
  assert.deepEqual({ ok: q.ok, code: q.code, total: q.total, from: q.from, to: q.to, above: q.above }, { ok: false, code: 'BALANCE', total: STARTER, from: 'W1', to: 'M1', above: STARTER });
  assert.match(q.message, /once you have more than 2,000 TR\. You have 2,000 TR\./);
  // below it (a fine has been paid): not eligible
  await p.ok('save.put', { baseRev: 0, enc: 'json', data: '{"host":{}}', summary: { name: 'Quote' }, wallet: report(0, 4, { cost: 300 }) });
  q = await quote();
  assert.deepEqual({ ok: q.ok, code: q.code, total: q.total }, { ok: false, code: 'BALANCE', total: STARTER - 300 });
  // above it, but the quarter is more than has been earned: 1,850 starter + 600 earned = 2,450 TR; the fee is 612.5 TR
  await earn(p, 600 * TR);
  q = await quote();
  assert.deepEqual({ ok: q.ok, code: q.code, total: q.total, fee: q.fee, after: q.after, eligible: q.eligible, starter: q.starter }, { ok: false, code: 'ELIGIBLE_FUNDS', total: 2450 * TR, fee: 1225, after: 2450 * TR - 1225, eligible: 600 * TR, starter: STARTER - 300 });
  assert.match(q.message, /^You do not have enough eligible TR for this transaction\. The upgrade is 612\.5 TR, and 600 TR of what you have is TR you have earned\. Starter TR cannot pay for a character upgrade\./);
  // and the attempt itself is refused for the same reason, with nothing charged and nothing changed
  const no = await p.call('character.upgrade', { key: uuid(), figure: 'M1', fee: q.fee });
  assert.equal(no.status, 409);
  assert.equal(no.body.code, 'ELIGIBLE_FUNDS');
  assert.equal((await mine(p)).figure, 'W1');
  assert.equal((await parts(p)).balance, 2450 * TR);
  // the same character is not an upgrade, and neither is one that does not exist
  assert.equal((await quote('W1')).code, 'SAME');
  assert.equal((await quote('Z3')).code, 'NO_CHARACTER');
  assert.equal((await p.call('character.upgrade', { key: uuid(), figure: 'W1', fee: 1 })).body.code, 'SAME');
  assert.equal((await p.call('character.upgrade', { key: uuid(), figure: 'Z3', fee: 1 })).status, 400);
  // an account that has not chosen a character has nothing to upgrade
  const blank = await newPlayer('Blank');
  await earn(blank, 4000 * TR);
  assert.equal((await blank.ok('character.quote', { figure: 'M1' })).quote.code, 'NO_CHARACTER');
  assert.equal((await blank.call('character.upgrade', { key: uuid(), figure: 'M1', fee: 3000 })).body.code, 'NO_CHARACTER');
  await clean();
});

test('the upgrade: the fee is a quarter of the wallet at that moment, paid in earned TR only, with the character changed in the same step', async () => {
  const p = await settler('Upgrade', 'W1', 2000 * TR);   // 4,000 TR: 2,000 starter, 2,000 earned
  const q = (await p.ok('character.quote', { figure: 'M1' })).quote;
  assert.deepEqual({ ok: q.ok, total: q.total, fee: q.fee, after: q.after, eligible: q.eligible }, { ok: true, total: 4000 * TR, fee: 1000 * TR, after: 3000 * TR, eligible: 2000 * TR });
  // a price the page made up is not the price; neither is no price at all
  for (const fee of [1, 0, -5, q.fee - 1, q.fee + 1, 1.5, '2000', null, undefined]) {
    const r = await p.call('character.upgrade', { key: uuid(), figure: 'M1', fee });
    assert.ok(r.status === 409 || r.status === 400, `${fee}: ${r.status}`);
    if (Number.isSafeInteger(fee) && fee > 0) assert.equal(r.body.code, 'QUOTE_CHANGED', String(fee));
  }
  assert.equal((await mine(p)).figure, 'W1');
  assert.equal((await parts(p)).balance, 4000 * TR);
  // confirmed, with what was shown
  const key = uuid();
  const done = await p.ok('character.upgrade', { key, figure: 'M1', fee: q.fee });
  assert.deepEqual({ from: done.upgrade.from, to: done.upgrade.to, total: done.upgrade.total, fee: done.upgrade.fee, replayed: done.upgrade.replayed }, { from: 'W1', to: 'M1', total: 4000 * TR, fee: 1000 * TR, replayed: false });
  assert.match(done.upgrade.ref, /^TR-[2-9A-HJ-NP-Z]{10}$/);
  assert.deepEqual({ balance: done.balance, starter: done.starter, eligible: done.eligible }, { balance: 3000 * TR, starter: STARTER, eligible: 1000 * TR }, 'what was charged is what was shown, and none of it was starter TR');
  assert.equal(done.character.figure, 'M1');
  assert.equal((await mine(p)).figure, 'M1');
  // it is written down: the change, and the movement at the bank that paid for it
  const record = await p.ok('character.get');
  assert.deepEqual(record.changes.map((c) => [c.from, c.to, c.fee, c.total, c.ref]), [['W1', 'M1', 1000 * TR, 4000 * TR, done.upgrade.ref]]);
  const line = (await p.ok('wallet.history')).entries[0];
  assert.deepEqual({ type: line.type, direction: line.direction, amount: line.amount, ref: line.ref, starter: line.starter }, { type: 'upgrade', direction: 'out', amount: 1000 * TR, ref: done.upgrade.ref, starter: 0 });
  // asked again under the same key (the answer was lost): the same upgrade, and not charged again
  const again = await p.ok('character.upgrade', { key, figure: 'M1', fee: q.fee });
  assert.equal(again.upgrade.replayed, true);
  assert.equal(again.upgrade.ref, done.upgrade.ref);
  assert.equal(again.balance, 3000 * TR);
  // the same key for a different character is a different request
  assert.equal((await p.call('character.upgrade', { key, figure: 'W1', fee: 750 * TR })).body.code, 'KEY_REUSED');
  // logging in elsewhere: the new character
  const phone = person();
  assert.equal((await phone.ok('login', { username: p.username, password: `pw-${p.username}-long` })).account.figure, 'M1');
  // changing again is another upgrade, priced from what is in the wallet now: 3,000 TR, so 750 TR
  const back = (await p.ok('character.quote', { figure: 'W1' })).quote;
  assert.deepEqual({ ok: back.ok, total: back.total, fee: back.fee }, { ok: true, total: 3000 * TR, fee: 750 * TR });
  const second = await p.ok('character.upgrade', { key: uuid(), figure: 'W1', fee: back.fee });
  assert.equal(second.balance, 2250 * TR);
  assert.equal(second.starter, STARTER);
  // 2,250 TR: a third would be 562.5 TR, and only 250 TR of earned TR is left
  const third = (await p.ok('character.quote', { figure: 'M1' })).quote;
  assert.deepEqual({ ok: third.ok, code: third.code, fee: third.fee, eligible: third.eligible }, { ok: false, code: 'ELIGIBLE_FUNDS', fee: 1125, eligible: 250 * TR });
  assert.equal((await p.ok('character.get')).changes.length, 2);
  await clean();
});

test('the four characters added later: chosen by a new player, reached by an existing one only through a paid upgrade', async () => {
  for (const figure of ['W2', 'W3', 'M4', 'M5']) {
    const p = await newPlayer(`New${figure}`);
    const chosen = await p.ok('character.choose', { figure, path: 'hero' });
    assert.equal(chosen.character.figure, figure);
    assert.equal((await mine(p)).figure, figure);
  }
  // someone who chose before they were added: the old character stays until an upgrade is paid for
  const old = await settler('Before', 'M1', 2000 * TR);
  assert.equal((await old.call('character.choose', { figure: 'M4', path: 'hero' })).status, 409);
  assert.equal((await mine(old)).figure, 'M1');
  const q = (await old.ok('character.quote', { figure: 'M4' })).quote;
  assert.equal(q.ok, true);
  const done = await old.ok('character.upgrade', { key: uuid(), figure: 'M4', fee: q.fee });
  assert.deepEqual({ from: done.upgrade.from, to: done.upgrade.to, fee: done.upgrade.fee }, { from: 'M1', to: 'M4', fee: 1000 * TR });
  assert.equal((await mine(old)).figure, 'M4');
  // with no earned TR, no upgrade: the new characters are not given away
  const poor = await settler('Poor', 'W1');
  const none = (await poor.ok('character.quote', { figure: 'W2' })).quote;
  assert.equal(none.ok, false);
  assert.equal((await poor.call('character.upgrade', { key: uuid(), figure: 'W2', fee: 500 * TR })).status >= 400, true);
  assert.equal((await mine(poor)).figure, 'W1');
  await clean();
});

test('pressed many times at once: one upgrade, one fee, whichever way the requests fall', async () => {
  // the same confirmation arriving ten times: one movement
  const p = await settler('Burst', 'W1', 6000 * TR);     // 8,000 TR: the fee is 2,000 TR
  const fee = (await p.ok('character.quote', { figure: 'M1' })).quote.fee;
  const key = uuid();
  const same = await Promise.all(Array.from({ length: 10 }, () => p.call('character.upgrade', { key, figure: 'M1', fee })));
  assert.ok(same.every((r) => r.status === 200), JSON.stringify(same.map((r) => r.body.code || 'ok')));
  assert.equal(same.filter((r) => !r.body.upgrade.replayed).length, 1);
  assert.equal(new Set(same.map((r) => r.body.upgrade.ref)).size, 1);
  assert.equal((await parts(p)).balance, 6000 * TR);
  assert.equal((await p.ok('character.get')).changes.length, 1);
  // ten different requests for the same change at the same moment: the first changes the character, and the
  // others find it already is that character. Nobody is charged twice
  const q = await settler('Crowd', 'M1', 6000 * TR);
  const fee2 = (await q.ok('character.quote', { figure: 'W1' })).quote.fee;
  const many = await Promise.all(Array.from({ length: 10 }, () => q.call('character.upgrade', { key: uuid(), figure: 'W1', fee: fee2 })));
  assert.equal(many.filter((r) => r.status === 200).length, 1, JSON.stringify(many.map((r) => r.body.code || 'ok')));
  assert.ok(many.filter((r) => r.status !== 200).every((r) => r.body.code === 'SAME'));
  assert.equal((await parts(q)).balance, 6000 * TR);
  assert.equal((await mine(q)).figure, 'W1');
  // an upgrade and a transfer of the same earned TR at once: the wallet never goes short, and the fee is whatever a quarter was when it was taken
  const r = await settler('Mixed', 'W1', 2000 * TR), friend = await newPlayer('Mixed');
  const fee3 = (await r.ok('character.quote', { figure: 'M1' })).quote.fee;
  const [up, sent] = await Promise.all([r.call('character.upgrade', { key: uuid(), figure: 'M1', fee: fee3 }), r.call('wallet.send', { key: uuid(), username: friend.username, amount: '1500' })]);
  const now = await parts(r);
  assert.equal(now.starter, STARTER);
  assert.ok(now.earned >= 0);
  if (up.status === 200 && sent.status === 200) assert.equal(now.balance, 4000 * TR - fee3 - 3000);
  else if (up.status === 200) { assert.equal(sent.body.code, 'ELIGIBLE_FUNDS'); assert.equal(now.balance, 4000 * TR - fee3); }
  else { assert.ok(['ELIGIBLE_FUNDS', 'QUOTE_CHANGED'].includes(up.body.code), up.body.code); assert.equal((await mine(r)).figure, 'W1', 'no fee, no change'); assert.equal(now.balance, 4000 * TR - 3000); }
  await clean();
});

test('a payment that cannot be made changes nothing: the old character stays and nothing is charged', async () => {
  const p = await settler('Fails', 'W1', 2000 * TR);
  const q = (await p.ok('character.quote', { figure: 'M1' })).quote;
  // between being shown the fee and confirming it, most of the earned TR is sent away
  const friend = await newPlayer('Fails');
  await p.ok('wallet.send', { key: uuid(), username: friend.username, amount: '1900' });
  const r = await p.call('character.upgrade', { key: uuid(), figure: 'M1', fee: q.fee });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'ELIGIBLE_FUNDS');
  assert.equal(r.body.quote.fee, character.upgradeFee(2100 * TR), 'and it is shown what the fee would be now');
  assert.equal((await mine(p)).figure, 'W1');
  assert.deepEqual(await parts(p), { balance: 2100 * TR, starter: STARTER, earned: 100 * TR, illicit: 0, eligible: 100 * TR });
  assert.equal((await p.ok('character.get')).changes.length, 0);
  await clean();
});
