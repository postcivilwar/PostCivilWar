// The step that keeps starter TR apart from earned TR, on a database that already has the bank in it and has
// had TR moved about: what the live site's database is when this code first reaches it. Nothing anyone holds
// changes; what changes is what each part of it may do, and that is decided by one cautious rule and written down.
//   server/with-postgres.sh node --test server/test/*.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { person, database, closeDatabase, uuid, HOLARIS } from './harness.mjs';

const require = createRequire(import.meta.url);
const postgres = require('../../api/_lib/postgres/index.js');
const { MIGRATIONS, SCHEMA: S } = require('../../api/_lib/schema.js');
const { hashPassword } = require('../../api/_lib/auth.js');
const bank = require('../../api/_lib/wallet.js');

after(() => closeDatabase());

const TR = 2;
const GRANT = 2000 * TR;

test('a bank that has been in use is brought to starter and earned TR: no balance changes, waiting offers are returned, and what each wallet is made of is written down', async () => {
  // ---- the database as the second version of the server left it ----
  const url = new URL(process.env.PCW_DATABASE_URL);
  const old = postgres({ host: url.hostname, port: Number(url.port), database: url.pathname.slice(1), username: decodeURIComponent(url.username), password: decodeURIComponent(url.password), max: 1, onnotice() {} });
  await old.unsafe(`create schema ${S}`);
  await old.unsafe(`create table ${S}.migrations (id integer primary key, name text not null, applied_at timestamptz not null default now())`);
  for (const step of MIGRATIONS.slice(0, 2)) await old.begin(async (tx) => { for (const statement of step.statements) await tx.unsafe(statement); await tx.unsafe(`insert into ${S}.migrations (id, name) values ($1, $2)`, [step.id, step.name]); });
  const hash = await hashPassword('the old password');
  const systemWallet = async (code) => (await old.unsafe(`select id from ${S}.wallets where code = $1`, [code]))[0].id;
  const issuance = await systemWallet('issuance'), world = await systemWallet('world'), escrow = await systemWallet('escrow');
  let refs = 0;
  // a movement, written the way the second version wrote them: no word of which TR it was
  const move = (kind, actor, meta, sides, key = null) => old.begin(async (tx) => {
    const t = (await tx.unsafe(`insert into ${S}.wallet_tx (ref, kind, actor_id, idem_key, meta) values ($1, $2, $3, $4, $5::text::jsonb) returning id`, [`TR-OLD${String((refs += 1)).padStart(7, '0')}`, kind, actor, key, JSON.stringify(meta)]))[0].id;
    for (const [wallet, amount] of sides) await tx.unsafe(`insert into ${S}.wallet_entries (tx_id, wallet_id, amount) values ($1, $2, $3)`, [t, wallet, amount]);
  });
  const account = async (name, figure) => {
    const id = (await old.unsafe(`insert into ${S}.accounts (username, username_key, pass_hash) values ($1, $2, $3) returning id`, [name, name.toLowerCase(), hash]))[0].id;
    const wallet = (await old.unsafe(`insert into ${S}.wallets (kind, account_id, earn_room) values ('player', $1, 20000) returning id`, [id]))[0].id;
    await move('grant', id, {}, [[wallet, GRANT], [issuance, -GRANT]], 'grant');
    if (figure) await old.unsafe(`insert into ${S}.saves (account_id, rev, enc, data, character_name, figure, tr, wallet_mark) values ($1, 4, 'json', '{"host":{}}', $2, $3, 0, 20)`, [id, name, figure]);
    return { id, wallet, name };
  };
  const worker = await account('Worker', 'W1'), receiver = await account('Receiver', 'M1'), bidder = await account('Bidder', 'W1'), idle = await account('Idle', null), spender = await account('Spender', 'M1');
  // the worker's game reported 1,500 TR earned and 250 TR spent in town; then they sent 500 TR to the receiver
  await move('game', worker.id, { earned: 3000, spent: 500, from: 0, upto: 20 }, [[worker.wallet, 2500], [world, -2500]]);
  await move('transfer', worker.id, { to: receiver.id }, [[worker.wallet, -1000], [receiver.wallet, 1000]]);
  // the receiver bought a watch at the shop for 100 TR, out of what was then just "their balance"
  const holding = (await old.unsafe(`insert into ${S}.holdings (asset_id, owner_id, serial, edition, origin_listing) values ($1, $2, 1, 10, $3) returning id`, [HOLARIS.asset, receiver.id, HOLARIS.listing]))[0].id;
  await old.unsafe(`update ${S}.listings set sold = 1 where id = $1`, [HOLARIS.listing]);
  const shopOffer = uuid();
  await old.unsafe(`insert into ${S}.offers (id, listing_id, buyer_id, amount, status, decided_at) values ($1, $2, $3, 200, 'accepted', now())`, [shopOffer, HOLARIS.listing, receiver.id]);
  await old.unsafe(`insert into ${S}.sales (offer_id, listing_id, asset_id, holding_id, buyer_id, amount, buyer_paid_rev, seller_credited_rev) values ($1, $2, $3, $4, $5, 200, 0, 0)`, [shopOffer, HOLARIS.listing, HOLARIS.asset, holding, receiver.id]);
  await move('sale', receiver.id, { what: 'HOLARIS Wristwatch No. 1 of 10' }, [[receiver.wallet, -200], [world, 200]], `sale:${shopOffer}`);
  // ...and put it up for sale; the bidder has an offer of 150 TR waiting on it, set aside out of their arrival money
  const listing = (await old.unsafe(`insert into ${S}.listings (asset_id, kind, seller_id, holding_id, price, stock, zone, place_x, place_z, place_label) values ($1, 'resale', $2, $3, 400, 1, 'NG-AN-OGB-Z1', 3, 3, 'The well') returning id`, [HOLARIS.asset, receiver.id, holding]))[0].id;
  const thread = (await old.unsafe(`insert into ${S}.threads (listing_id, buyer_id, seller_id) values ($1, $2, $3) returning id`, [listing, bidder.id, receiver.id]))[0].id;
  const waiting = uuid();
  await old.unsafe(`insert into ${S}.offers (id, thread_id, listing_id, buyer_id, amount, status, held) values ($1, $2, $3, $4, 300, 'pending', 300)`, [waiting, thread, listing, bidder.id]);
  await move('hold', bidder.id, { offer: waiting }, [[bidder.wallet, -300], [escrow, 300]], `hold:${waiting}`);
  // the spender's game reported a little earned and a good deal spent: they hold less than they arrived with
  await move('game', spender.id, { earned: 200, spent: 1200, from: 0, upto: 9 }, [[spender.wallet, -1000], [world, 1000]]);
  const before = Object.fromEntries((await old.unsafe(`select account_id, balance from ${S}.wallets where kind = 'player'`)).map((r) => [r.account_id, Number(r.balance)]));
  assert.deepEqual([worker, receiver, bidder, idle, spender].map((a) => before[a.id]), [5500, 4800, 3700, 4000, 3000]);
  await old.end();

  // ---- the new server meets it ----
  const sql = await database();
  assert.deepEqual((await sql.unsafe(`select id from ${S}.migrations order by id`)).map((r) => r.id), MIGRATIONS.map((m) => m.id));
  assert.deepEqual(await bank.audit(sql), [], 'the books are right from the first moment');
  const made = async (a) => { const r = (await sql.unsafe(`select balance, starter, illicit from ${S}.wallets where account_id = $1`, [a.id]))[0]; return { balance: Number(r.balance), starter: Number(r.starter), earned: Number(r.balance) - Number(r.starter) - Number(r.illicit) }; };
  // The offer that was waiting was closed and its TR returned, before anything was counted: so the bidder's
  // wallet is whole again, and nothing is left set aside in the old way
  assert.equal(Number((await sql.unsafe(`select balance from ${S}.wallets where code = 'escrow'`))[0].balance), 0);
  assert.deepEqual((await sql.unsafe(`select status, held from ${S}.offers where id = $1`, [waiting])).map((r) => [r.status, Number(r.held)]), [['declined', 300]]);
  assert.equal((await sql.unsafe(`select count(*)::int as n from ${S}.messages where offer_id = $1 and kind = 'declined' and body like 'Offers are now made with earned TR only%'`, [waiting]))[0].n, 1);
  // no balance changed, except the bidder's getting their own TR back
  assert.deepEqual(await made(worker), { balance: 5500, starter: 4000, earned: 1500 }, 'above the arrival money, and the bank saw that much earned in town: earned');
  assert.deepEqual(await made(receiver), { balance: 4800, starter: 4800, earned: 0 }, 'what another player sent before today may have been arrival money: it is not counted as earned');
  assert.deepEqual(await made(bidder), { balance: 4000, starter: 4000, earned: 0 });
  assert.deepEqual(await made(idle), { balance: 4000, starter: 4000, earned: 0 });
  assert.deepEqual(await made(spender), { balance: 3000, starter: 3000, earned: 0 }, 'below the arrival money: all of it is what is left of the arrival money');
  const total = (await sql.unsafe(`select coalesce(sum(balance), 0)::bigint as n from ${S}.wallets where kind = 'player'`))[0].n;
  assert.equal(Number(total), 5500 + 4800 + 4000 + 4000 + 3000, 'not a unit was lost or made');
  // what was decided for each wallet is written down, with the rule
  const ruled = await sql.unsafe(`select w.account_id, r.balance, r.starter, r.earned, r.town_earned from ${S}.wallet_reconciled r join ${S}.wallets w on w.id = r.wallet_id`);
  assert.equal(ruled.length, 5);
  assert.deepEqual(ruled.filter((r) => r.account_id === worker.id).map((r) => [Number(r.balance), Number(r.starter), Number(r.earned), Number(r.town_earned)]), [[5500, 4000, 1500, 3000]]);
  // the old entries are as they were written: not one was edited to say what kind of TR it moved
  assert.equal((await sql.unsafe(`select count(*)::int as n from ${S}.wallet_entries where bucket is not null`))[0].n, 0);
  // the character each account already had is its character; one with no character has none yet
  assert.deepEqual((await sql.unsafe(`select username, figure from ${S}.accounts order by username`)).map((r) => [r.username, r.figure]), [['Bidder', 'W1'], ['Idle', null], ['Receiver', 'M1'], ['Spender', 'M1'], ['Worker', 'W1']]);
  // the watch was bought before today, out of what may have been arrival money: it carries what it cost
  assert.equal(Number((await sql.unsafe(`select starter_basis from ${S}.holdings where id = $1`, [holding]))[0].starter_basis), 200);

  // ---- and the people in it carry on, under the new rules ----
  const login = async (name) => { const p = person(); const a = await p.ok('login', { username: name, password: 'the old password' }); p.username = name; return { p, a }; };
  const w = await login('Worker'), r = await login('Receiver'), b = await login('Bidder');
  assert.deepEqual({ balance: w.a.wallet.balance, starter: w.a.wallet.starter, eligible: w.a.wallet.eligible }, { balance: 5500, starter: 4000, eligible: 1500 });
  // the receiver cannot send on what they were sent, nor the bidder offer their arrival money
  assert.equal((await r.p.call('wallet.send', { key: uuid(), username: 'Bidder', amount: '100' })).body.code, 'STARTER_FUNDS');
  assert.equal((await b.p.call('market.offer', { thread, offer: uuid(), amount: 300 })).body.code, 'STARTER_FUNDS');
  // the worker can send what they earned, to the half TR, and it is earned TR where it arrives
  assert.equal((await w.p.call('wallet.send', { key: uuid(), username: 'Bidder', amount: '750.5' })).body.code, 'ELIGIBLE_FUNDS');
  await w.p.ok('wallet.send', { key: uuid(), username: 'Bidder', amount: '750' });
  assert.deepEqual(await made(worker), { balance: 4000, starter: 4000, earned: 0 });
  assert.deepEqual(await made(bidder), { balance: 5500, starter: 4000, earned: 1500 });
  // now the bidder can offer for the watch; sold for 150 TR, the 100 TR it was bought for comes back to the
  // receiver as starter TR, and only the 50 TR gained is earned
  const again = uuid();
  await b.p.ok('market.offer', { thread, offer: again, amount: 300 });
  await r.p.ok('market.decide', { offer: again, accept: true, amount: 300 });
  assert.deepEqual(await made(receiver), { balance: 5100, starter: 5000, earned: 100 });
  assert.equal(Number((await sql.unsafe(`select starter_basis from ${S}.holdings where id = $1`, [holding]))[0].starter_basis), 0);
  assert.equal((await r.p.call('wallet.send', { key: uuid(), username: 'Worker', amount: '50.5' })).body.code, 'ELIGIBLE_FUNDS');
  await r.p.ok('wallet.send', { key: uuid(), username: 'Worker', amount: '50' });
  assert.deepEqual(await bank.audit(sql), []);

  // ---- starting again does not do any of it twice ----
  await closeDatabase();
  const once = await database();
  assert.equal((await once.unsafe(`select count(*)::int as n from ${S}.wallet_reconciled`))[0].n, 5);
  assert.equal((await once.unsafe(`select count(*)::int as n from ${S}.wallet_tx where kind = 'grant'`))[0].n, 5);
  assert.deepEqual(await bank.audit(once), []);
});
