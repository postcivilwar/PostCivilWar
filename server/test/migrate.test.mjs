// The steps from the first tables to the bank and on to starter TR kept apart, on a database that already has
// players in it and has never had a bank. (migrate2.test.mjs is the other case: a database that already has the
// bank, with TR moved about in it, which is what the live site's database is today.)
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

test('a database with players, sales and waiting offers in it is brought to the bank without losing or making anything', async () => {
  // ---- the database as the first version of the server left it ----
  const url = new URL(process.env.PCW_DATABASE_URL);
  const old = postgres({ host: url.hostname, port: Number(url.port), database: url.pathname.slice(1), username: decodeURIComponent(url.username), password: decodeURIComponent(url.password), max: 1, onnotice() {} });
  await old.unsafe(`create schema ${S}`);
  await old.unsafe(`create table ${S}.migrations (id integer primary key, name text not null, applied_at timestamptz not null default now())`);
  for (const statement of MIGRATIONS[0].statements) await old.unsafe(statement);
  await old.unsafe(`insert into ${S}.migrations (id, name) values (1, $1)`, [MIGRATIONS[0].name]);
  const hash = await hashPassword('the old password');
  const acct = async (name) => (await old.unsafe(`insert into ${S}.accounts (username, username_key, pass_hash) values ($1, $2, $3) returning id`, [name, name.toLowerCase(), hash]))[0].id;
  const seller = await acct('OldSeller'), buyer = await acct('OldBuyer'), quiet = await acct('OldQuiet');
  await old.unsafe(`insert into ${S}.saves (account_id, rev, enc, data, character_name, figure, tr) values ($1, 7, 'json', '{"host":{}}', 'Seller Eze', 'M1', 4200), ($2, 3, 'json', '{"host":{}}', 'Buyer Obi', 'W1', 3600)`, [seller, buyer]);
  // the seller bought two watches at the shop and sold both on to the buyer
  const hold = async (owner, serial) => (await old.unsafe(`insert into ${S}.holdings (asset_id, owner_id, serial, edition, origin_listing) values ($1, $2, $3, 10, $4) returning id`, [HOLARIS.asset, owner, serial, HOLARIS.listing]))[0].id;
  const h1 = await hold(buyer, 1), h2 = await hold(buyer, 2), h3 = await hold(seller, 3);
  await old.unsafe(`update ${S}.listings set sold = 3 where id = $1`, [HOLARIS.listing]);
  const resale = async (holding, status) => (await old.unsafe(`insert into ${S}.listings (asset_id, kind, seller_id, holding_id, price, stock, sold, status, zone, place_x, place_z, place_label) values ($1, 'resale', $2, $3, 300, 1, $4, $5, 'NG-AN-OGB-Z1', 1, 1, 'Here') returning id`, [HOLARIS.asset, seller, holding, status === 'sold' ? 1 : 0, status]))[0].id;
  const l1 = await resale(h1, 'sold'), l2 = await resale(h2, 'sold'), l3 = await resale(h3, 'open');
  const thread = async (listing, who) => (await old.unsafe(`insert into ${S}.threads (listing_id, buyer_id, seller_id) values ($1, $2, $3) returning id`, [listing, who, seller]))[0].id;
  const t1 = await thread(l1, buyer), t2 = await thread(l2, buyer), t3 = await thread(l3, buyer), t4 = await thread(l3, quiet);
  const offer = async (t, listing, who, amount, status) => { const id = uuid(); await old.unsafe(`insert into ${S}.offers (id, thread_id, listing_id, buyer_id, amount, status) values ($1, $2, $3, $4, $5, $6)`, [id, t, listing, who, amount, status]); return id; };
  const o1 = await offer(t1, l1, buyer, 280, 'accepted'), o2 = await offer(t2, l2, buyer, 300, 'accepted');
  const o3 = await offer(t3, l3, buyer, 250, 'pending'), o4 = await offer(t4, l3, quiet, 260, 'pending');
  // the first sale was settled by both games; the second was paid by the buyer's game, and the seller's had not yet been given it
  const s1 = (await old.unsafe(`insert into ${S}.sales (offer_id, listing_id, asset_id, holding_id, buyer_id, seller_id, amount, buyer_paid_rev, seller_credited_rev) values ($1, $2, $3, $4, $5, $6, 280, 2, 5) returning id`, [o1, l1, HOLARIS.asset, h1, buyer, seller]))[0].id;
  const s2 = (await old.unsafe(`insert into ${S}.sales (offer_id, listing_id, asset_id, holding_id, buyer_id, seller_id, amount, buyer_paid_rev, seller_credited_rev) values ($1, $2, $3, $4, $5, $6, 300, 3, null) returning id`, [o2, l2, HOLARIS.asset, h2, buyer, seller]))[0].id;
  await old.end();

  // ---- the new server meets it ----
  const sql = await database();
  assert.deepEqual((await sql.unsafe(`select id from ${S}.migrations order by id`)).map((r) => r.id), MIGRATIONS.map((m) => m.id));
  assert.deepEqual(await bank.audit(sql), [], 'the books are right from the first moment');
  const wallet = async (id) => Number((await sql.unsafe(`select balance from ${S}.wallets where account_id = $1`, [id]))[0].balance);
  // everyone who had an account has a wallet with the arrival money; the seller also has what they were owed
  assert.equal(await wallet(buyer), 2000 * TR);
  assert.equal(await wallet(quiet), 2000 * TR);
  assert.equal(await wallet(seller), 2000 * TR + 300);
  assert.equal((await sql.unsafe(`select count(*)::int as n from ${S}.wallets where kind = 'player'`))[0].n, 3);
  assert.deepEqual((await sql.unsafe(`select code from ${S}.wallets where kind = 'system' order by code`)).map((r) => r.code), ['adhold', 'adtax', 'adverts', 'escrow', 'issuance', 'world']);
  // each sale's seller is marked as paid, once: the one already settled is as it was
  assert.deepEqual((await sql.unsafe(`select id, seller_credited_rev from ${S}.sales order by amount`)).map((r) => [r.id, r.seller_credited_rev]), [[s1, 5], [s2, 0]]);
  // the offers that were waiting are closed, each buyer is told, and nothing is held for them
  const offers = await sql.unsafe(`select id, status, held from ${S}.offers where id in ($1, $2)`, [o3, o4]);
  assert.ok(offers.every((o) => o.status === 'declined' && Number(o.held) === 0));
  assert.equal((await sql.unsafe(`select count(*)::int as n from ${S}.messages where kind = 'declined' and body like 'The market''s money has moved to the bank%'`))[0].n, 2);
  // nothing else was touched: the characters, what is owned, the shop
  assert.deepEqual((await sql.unsafe(`select account_id, rev, character_name, wallet_mark, erased from ${S}.saves order by rev`)).map((r) => [r.account_id, r.rev, r.character_name, Number(r.wallet_mark), r.erased]), [[buyer, 3, 'Buyer Obi', 0, false], [seller, 7, 'Seller Eze', 0, false]]);
  assert.equal((await sql.unsafe(`select count(*)::int as n from ${S}.holdings`))[0].n, 3);
  assert.equal((await sql.unsafe(`select stock - sold as left from ${S}.listings where id = $1`, [HOLARIS.listing]))[0].left, 7);

  // ---- and the people in it carry on ----
  const p = person();
  const inNow = await p.ok('login', { username: 'oldseller', password: 'the old password' });
  assert.equal(inNow.account.username, 'OldSeller');
  assert.equal(inNow.save.rev, 7);
  assert.equal(inNow.wallet.balance, 2000 * TR + 300);
  // Nobody kept count of where TR came from before today, so everything these wallets hold is treated as starter
  // TR: the bank never saw any of it earned in town. Nothing was taken from anyone; it is written down for each.
  assert.deepEqual({ starter: inNow.wallet.starter, eligible: inNow.wallet.eligible }, { starter: 2000 * TR + 300, eligible: 0 });
  const ruled = await sql.unsafe(`select r.balance, r.starter, r.earned, r.town_earned, r.rule from ${S}.wallet_reconciled r join ${S}.wallets w on w.id = r.wallet_id where w.account_id = $1`, [seller]);
  assert.deepEqual({ balance: Number(ruled[0].balance), starter: Number(ruled[0].starter), earned: Number(ruled[0].earned), town: Number(ruled[0].town_earned) }, { balance: 4300, starter: 4300, earned: 0, town: 0 });
  assert.match(ruled[0].rule, /starter = the rest/);
  assert.equal((await sql.unsafe(`select count(*)::int as n from ${S}.wallet_reconciled`))[0].n, 3);
  // the character each account already had is the account's character from here on
  assert.equal(inNow.account.figure, 'M1');
  // the watches bought before today were bought with arrival money: each carries what it cost
  assert.deepEqual((await sql.unsafe(`select serial, starter_basis from ${S}.holdings order by serial`)).map((r) => [r.serial, Number(r.starter_basis)]), [[1, 280], [2, 300], [3, 0]]);
  const history = (await p.ok('wallet.history')).entries;
  assert.deepEqual(history.map((e) => [e.type, e.amount]), [['sold', 300], ['opening', 2000 * TR]]);
  // their game's first save tells the bank everything the character has earned and spent since it arrived:
  // 215 TR earned; a 200 TR thing to own, paid out of that; 37.5 TR of costs, paid out of starter TR
  const first = await p.ok('save.put', { baseRev: 7, enc: 'json', data: '{"host":{}}', summary: { name: 'Seller Eze' }, wallet: { v: 2, from: 0, upto: 311, in: { lawful: 430, illicit: 0 }, out: { cost: 75, restitution: 0, asset: 400 } } });
  assert.equal(first.wallet.balance, 2000 * TR + 300 + 430 - 475);
  assert.deepEqual({ starter: first.wallet.starter, eligible: first.wallet.eligible, short: first.wallet.short }, { starter: 4300 - 75, eligible: 30, short: 0 });
  assert.equal(first.wallet.mark, 311);
  // a page still open from before today, saving in the old way, is told to reload and nothing of its report is taken
  const stale = await p.call('save.put', { baseRev: 8, enc: 'json', data: '{"host":{}}', wallet: { from: 311, upto: 320, earned: 9000, spent: 0 } });
  assert.equal(stale.body.code, 'OUT_OF_DATE');
  // The buyer whose offer was closed has only arrival money: it cannot be offered. Once they have earned 150 TR
  // in town, 125 TR of it can be; the seller is paid in earned TR, and their arrival money is not touched.
  const b = person();
  await b.ok('login', { username: 'OldBuyer', password: 'the old password' });
  const again = uuid();
  const no = await b.call('market.offer', { thread: t3, offer: again, amount: 250 });
  assert.equal(no.body.code, 'STARTER_FUNDS');
  await b.ok('save.put', { baseRev: 3, enc: 'json', data: '{"host":{}}', summary: { name: 'Buyer Obi' }, wallet: { v: 2, from: 0, upto: 9, in: { lawful: 300, illicit: 0 }, out: { cost: 0, restitution: 0, asset: 0 } } });
  const made = await b.ok('market.offer', { thread: t3, offer: again, amount: 250 });
  assert.equal(made.offer.status, 'pending');
  assert.deepEqual({ balance: made.balance, starter: made.starter, eligible: made.eligible }, { balance: 2000 * TR + 50, starter: 2000 * TR, eligible: 50 });
  const sold = await p.ok('market.decide', { offer: again, accept: true, amount: 250 });
  assert.equal(sold.sale.amount, 250);
  assert.equal(sold.balance, first.wallet.balance + 250);
  assert.equal(sold.starter, first.wallet.starter, 'the watch (No. 3) was never bought with anyone\'s arrival money: all 125 TR is earned');
  assert.deepEqual(await bank.audit(sql), []);

  // ---- starting again does not do any of it twice ----
  await closeDatabase();
  const once = await database();
  assert.equal(Number((await once.unsafe(`select balance from ${S}.wallets where account_id = $1`, [quiet]))[0].balance), 2000 * TR);
  assert.equal((await once.unsafe(`select count(*)::int as n from ${S}.wallet_tx where kind = 'grant'`))[0].n, 3);
  assert.deepEqual(await bank.audit(once), []);
});
