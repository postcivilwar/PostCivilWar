'use strict';
// The bank: every account's TR, and every movement of it.
//
// A balance is a row in `wallets`, and it changes in one way only: an entry is written in `wallet_entries`,
// and the database itself moves the balance and records what it became (see the triggers in schema.js). A
// movement is two or more entries that sum to nothing, written together or not at all. Nothing here ever
// takes a balance from the page: what a player has is what the entries say.
//
//   to send      both wallets are locked (always in the same order, so two people sending to each other
//                cannot wait on each other for ever), the sender's balance is read under that lock, and the
//                debit, the credit and the record are one transaction.
//   asked twice  every request to send carries a key the page made up once. The same key from the same
//                account is the same movement: it is done once, and the second asking is told what the first
//                did. The same key with different details is refused.
//
// Where TR came from. A wallet is three amounts, and every TR in it is one of them:
//
//   starter   the arrival money every account is given once (2,000 TR), as much of it as is left. It pays the
//             town's charges and costs (a fine, the ambulance, the hospital, a levy, a permit, a fare, food) and
//             nothing else: it is never sent to another player, never set aside for an offer, never the price
//             of a thing to own, never the fee for a character upgrade.
//   earned    wages and payments for work, what another player sent, what a sale brought.
//   illicit   what a character took from someone in the game. Kept apart so that it is never mistaken for
//             either of the others; it can be spent and sent as earned TR can, and is what the law takes back first.
//
// "Eligible" TR is earned + illicit: what can be sent, offered, or spent on a thing to own. Which part of a
// wallet an entry moves is written on the entry (`bucket`), and the database itself moves that part and
// refuses a movement that would take starter TR anywhere but to the town's charges and costs (schema.js, step
// 3). No page says what kind of TR it has: the bank reads its own rows.
//
// The town itself still runs in each player's own browser, so what a character earns and spends there is told
// to the bank by the game, with each save (world.js), sorted by what each thing was. Earnings are taken only up
// to what a person playing could have earned in the time (WALLET.earnStart, earnHour, earnBurst): a page that
// has been tampered with cannot report itself rich. What it says was spent on things to own is taken from
// earned TR only: if there is not enough, the rest is simply not taken, and the arrival money is not touched.

const crypto = require('crypto');
const { ApiError } = require('./http.js');
const { allow } = require('./auth.js');
const { SCHEMA: S, WALLET } = require('./schema.js');

const TR = 2;                            // ledger units in one TR
const MOST = 2_000_000_000;              // ledger units in one movement: a thousand million TR
const NOTE = 140;
const PEOPLE = 100;
const PAGE = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const trText = (units) => `${(Number(units) / TR).toLocaleString('en-GB', { maximumFractionDigits: 1 })} TR`;
const cleanText = (value, most) => (typeof value === 'string' ? value : '').replace(/[\x00-\x1f\x7f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, most);
const num = (value) => (value === null || value === undefined ? null : Number(value));
const limits = () => ({
  burst: Math.max(0, Number(process.env.PCW_EARN_BURST) || WALLET.earnBurst),
  hour: Math.max(0, Number(process.env.PCW_EARN_HOUR) || WALLET.earnHour),
  start: Math.max(0, process.env.PCW_EARN_START === undefined ? WALLET.earnStart : Number(process.env.PCW_EARN_START) || 0),
});

// What a player is told when starter TR is in the way: the actual reason, in the same words everywhere.
const WORDS = {
  transfer: 'Starter TR cannot be transferred. Earn TR through gameplay to send money to other players.',
  asset: 'Starter TR cannot be used to buy assets. Earn TR through gameplay to make purchases.',
  upgrade: 'Starter TR cannot pay for a character upgrade. Earn TR through gameplay first.',
  short: 'You do not have enough eligible TR for this transaction.',
};

// ---- the parts of a wallet ----

// Which part is drawn from first, for each thing TR is paid for.
const ORDER = {
  eligible: ['earned', 'illicit'],                       // sending, an offer, a thing to own, an upgrade: never starter
  cost: ['starter', 'earned', 'illicit'],                // the town's charges and costs
  restitution: ['illicit', 'starter', 'earned'],         // what was taken is handed back first
};
const partsOf = (row) => { const balance = Number(row.balance), starter = Number(row.starter), illicit = Number(row.illicit); return { balance, starter, illicit, earned: balance - starter - illicit, eligible: balance - starter }; };

// Takes up to `amount` out of `have` ({ starter, earned, illicit }, which it changes), in the order given.
// Gives { starter, earned, illicit } taken, and `short`: how much could not be found.
function take(have, amount, order) {
  const taken = { starter: 0, earned: 0, illicit: 0 };
  let left = amount;
  for (const part of order) { const n = Math.min(left, have[part]); if (n > 0) { taken[part] = n; have[part] -= n; left -= n; } }
  return { ...taken, short: left };
}

// May `amount` be sent, offered or spent on a thing to own out of this wallet? If not, the player is told why:
// that they have less than that altogether, or that what they have is starter TR, whichever is the case.
function mustBeEligible(w, amount, what) {
  if (w.eligible >= amount) return;
  if (w.balance < amount) throw new ApiError(409, 'FUNDS', `You do not have that much. Your balance is ${trText(w.balance)}.`, { balance: w.balance, eligible: w.eligible });
  if (w.eligible <= 0) throw new ApiError(409, 'STARTER_FUNDS', WORDS[what], { balance: w.balance, eligible: 0, starter: w.starter });
  throw new ApiError(409, 'ELIGIBLE_FUNDS', `${WORDS.short} ${trText(w.eligible)} of your ${trText(w.balance)} is TR you have earned; the other ${trText(w.starter)} is starter TR. ${WORDS[what]}`, { balance: w.balance, eligible: w.eligible, starter: w.starter });
}

// The sides of a movement that take `amount` of eligible TR out of wallet `w`: one for each part drawn from.
function eligibleLegs(w, amount) {
  const drawn = take({ starter: 0, earned: w.earned, illicit: w.illicit }, amount, ORDER.eligible);
  if (drawn.short > 0) throw new ApiError(409, 'FUNDS', 'There is not enough TR for that.');
  const legs = [];
  if (drawn.earned) legs.push({ wallet: w.id, amount: -drawn.earned, bucket: 'earned' });
  if (drawn.illicit) legs.push({ wallet: w.id, amount: -drawn.illicit, bucket: 'illicit' });
  return { legs, drawn };
}

// An amount of TR as a person typed it, in ledger units. TR goes down to a half and no further.
function amountOf(value) {
  const typed = (typeof value === 'number' ? String(value) : typeof value === 'string' ? value : '').trim().replace(/\s*TR$/i, '');
  if (!typed) throw new ApiError(400, 'AMOUNT', 'Enter an amount.');
  if (/^[-\u2212]/.test(typed)) throw new ApiError(400, 'AMOUNT', 'The amount must be more than zero.');
  const plain = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(typed) ? typed.replace(/,/g, '') : typed;
  if (!/^\d+(\.\d+)?$/.test(plain)) throw new ApiError(400, 'AMOUNT', 'That is not an amount. Use figures, for example 100 or 12.5.');
  const [whole, part = ''] = plain.split('.');
  if (whole.replace(/^0+/, '').length > 10) throw new ApiError(400, 'AMOUNT', 'That is more than can be sent at once.');
  const decimals = part.replace(/0+$/, '');
  if (decimals !== '' && decimals !== '5') throw new ApiError(400, 'AMOUNT', 'TR goes down to a half and no further: 0.5 TR is the smallest amount.');
  const units = Number(whole) * TR + (decimals === '5' ? 1 : 0);
  if (!(units > 0)) throw new ApiError(400, 'AMOUNT', 'The amount must be more than zero.');
  if (units > MOST) throw new ApiError(400, 'AMOUNT', 'That is more than can be sent at once.');
  return units;
}

const keyOf = (value) => { if (typeof value !== 'string' || !UUID.test(value)) throw new ApiError(400, 'BAD_REQUEST', 'That request cannot be read. Reload the page and try again.'); return value; };

// A reference a person can read out: TR- and ten letters and figures, none of which can be taken for another.
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const newRef = () => { const bytes = crypto.randomBytes(10); let out = 'TR-'; for (let i = 0; i < 10; i += 1) out += ALPHABET[bytes[i] % 32]; return out; };

// ---- wallets ----

const system = new Map();                // the bank's own wallets, by name (they never change)
async function systemWallet(tx, code) {
  if (!system.has(code)) {
    const rows = await tx.unsafe(`select id from ${S}.wallets where kind = 'system' and code = $1`, [code]);
    if (!rows.length) throw new Error(`the bank has no ${code} wallet`);
    system.set(code, rows[0].id);
  }
  return system.get(code);
}

async function walletOf(tx, accountId, lock) {
  const rows = await tx.unsafe(`select id, balance, starter, illicit, earn_room, extract(epoch from (now() - earn_at)) as idle from ${S}.wallets where account_id = $1${lock ? ' for update' : ''}`, [accountId]);
  if (!rows.length) throw new ApiError(409, 'NO_WALLET', 'This account has no wallet yet. Sign out and in again.');
  return { id: rows[0].id, ...partsOf(rows[0]), room: Number(rows[0].earn_room), idle: Number(rows[0].idle) };
}

// Writes one movement. `legs` are [{ wallet, amount, bucket }] and must sum to nothing; `bucket` says which
// part of a player's wallet the side moves ('starter', 'earned' or 'illicit': 'earned' if it is not said), and
// is left out for the bank's own wallets. With a `key` it is done once for that account however often it is
// asked. Gives { id, ref, at, replayed }.
async function post(tx, { kind, actor = null, key = null, hash = null, note = '', meta = {}, legs }) {
  if (!Array.isArray(legs) || legs.length < 2 || legs.reduce((sum, leg) => sum + leg.amount, 0) !== 0 || legs.some((leg) => !Number.isSafeInteger(leg.amount) || leg.amount === 0)) throw new Error('a movement of TR must have two sides or more that sum to nothing');
  let made = null;
  for (let tries = 0; tries < 4 && !made; tries += 1) {
    const ref = newRef();
    const rows = await tx.unsafe(
      `insert into ${S}.wallet_tx (ref, kind, actor_id, idem_key, request_hash, note, meta) values ($1, $2, $3, $4, $5, $6, $7::text::jsonb)
       on conflict do nothing returning id, ref, at`, [ref, kind, actor, key, hash, note, JSON.stringify(meta)]);
    if (rows.length) { made = rows[0]; break; }
    if (key) {
      // this account has used this key before: that movement is the answer
      const before = await tx.unsafe(`select id, ref, at, request_hash, kind from ${S}.wallet_tx where actor_id = $1 and idem_key = $2`, [actor, key]);
      if (before.length) {
        if (before[0].kind !== kind || (hash && before[0].request_hash !== hash)) throw new ApiError(409, 'KEY_REUSED', 'That request was already used for something else. Nothing was moved.');
        return { id: before[0].id, ref: before[0].ref, at: before[0].at, replayed: true };
      }
    }
    // (otherwise the reference was already taken: another is drawn)
  }
  if (!made) throw new Error('could not record the movement');
  // Every wallet in it is locked before any is moved, always in the same order: players' wallets lowest first,
  // then the bank's own. (Two movements that share wallets therefore never wait on each other in a ring.)
  const own = new Set(system.values());
  const sides = legs.map((leg) => ({ wallet: leg.wallet, amount: leg.amount, bucket: own.has(leg.wallet) ? null : (leg.bucket || 'earned') }));
  if (new Set(sides.map((leg) => `${leg.wallet}|${leg.bucket}`)).size !== sides.length) throw new Error('each part of a wallet appears once in a movement');
  const order = [...sides].sort((a, b) => (own.has(a.wallet) - own.has(b.wallet)) || (a.wallet < b.wallet ? -1 : a.wallet > b.wallet ? 1 : 0));
  try {
    for (const id of [...new Set(order.map((leg) => leg.wallet))]) await tx.unsafe(`select id from ${S}.wallets where id = $1 for update`, [id]);
    for (const leg of order) await tx.unsafe(`insert into ${S}.wallet_entries (tx_id, wallet_id, amount, bucket) values ($1, $2, $3, $4)`, [made.id, leg.wallet, leg.amount, leg.bucket]);
  } catch (error) {
    // the database's own last word: no part of a wallet may go below nothing
    if (error && error.code === '23514') throw new ApiError(409, 'FUNDS', 'There is not enough TR for that.');
    throw error;
  }
  return { id: made.id, ref: made.ref, at: made.at, replayed: false };
}

// A new account's wallet, with the arrival money every character begins with: starter TR, all of it. Once: an
// account has one wallet. (A new account's game is believed about very little it says it earned until it has
// been played for a while: see `game`, below.)
async function open(tx, accountId) {
  const made = await tx.unsafe(`insert into ${S}.wallets (kind, account_id, earn_room) values ('player', $1, $2) on conflict (account_id) do nothing returning id`, [accountId, Math.min(limits().start, limits().burst)]);
  if (!made.length) return false;
  await post(tx, { kind: 'grant', actor: accountId, key: 'grant', note: 'Arrival money: £20', legs: [{ wallet: made[0].id, amount: WALLET.grant, bucket: 'starter' }, { wallet: await systemWallet(tx, 'issuance'), amount: -WALLET.grant }] });
  return true;
}

// What an answer that moved TR says of the wallet afterwards: { balance, starter, illicit, eligible, held, last }.
async function after(sql, accountId) {
  const rows = await sql.unsafe(`select w.balance, w.starter, w.illicit, (select coalesce(max(id), 0) from ${S}.wallet_entries e where e.wallet_id = w.id) as last from ${S}.wallets w where w.account_id = $1`, [accountId]);
  const p = partsOf(rows[0]);
  return { balance: p.balance, starter: p.starter, illicit: p.illicit, eligible: p.eligible, held: await heldBy(sql, accountId), last: Number(rows[0].last) };
}

const heldBy = async (sql, accountId) => Number((await sql.unsafe(`select coalesce(sum(held), 0) as held from ${S}.offers where buyer_id = $1 and status = 'pending'`, [accountId]))[0].held);

// What a player's wallet page begins with, and what has come in since the page last looked.
async function get(sql, me, body = {}) {
  const wallet = await walletOf(sql, me.id, false);
  const since = Number.isSafeInteger(body.since) && body.since >= 0 ? body.since : null;
  const last = Number((await sql.unsafe(`select coalesce(max(id), 0) as last from ${S}.wallet_entries where wallet_id = $1`, [wallet.id]))[0].last);
  let news = [];
  if (since !== null && last > since) {
    // what came in (TR received, a sale, an offer's TR returned) and what was bought at a shop
    const rows = await sql.unsafe(`${HISTORY} where e.wallet_id = $1 and e.id > $2 and ((e.amount > 0 and t.kind in ('transfer', 'sale', 'release', 'refund')) or (e.amount < 0 and t.kind = 'sale')) order by e.id desc limit 10`, [wallet.id, since]);
    news = rows.map(line);
  }
  return { wallet: { username: me.username, balance: wallet.balance, starter: wallet.starter, illicit: wallet.illicit, eligible: wallet.eligible, held: await heldBy(sql, me.id), last }, news };
}

// ---- sending ----

const NO_USER = 'Username not found. You can only send TR to registered users.';

async function personNamed(sql, typed) {
  const name = cleanText(typed, 40).replace(/^@/, '');
  if (!name) throw new ApiError(400, 'RECIPIENT', 'Enter the username of the person you are sending to.');
  const rows = name.length > 32 ? [] : await sql.unsafe(`select id, username from ${S}.accounts where username_key = $1`, [name.toLowerCase()]);
  if (!rows.length) throw new ApiError(404, 'NO_USER', NO_USER);
  return rows[0];
}

// Is there such a person? (The page asks before it shows what is about to be sent.)
async function find(sql, me, body) {
  await allow(sql, `find:${me.id}`, 60, 60);
  const person = await personNamed(sql, body.username);
  if (person.id === me.id) throw new ApiError(400, 'SELF', 'That is your own username. You cannot send TR to yourself.');
  const saved = await sql.unsafe(`select 1 from ${S}.beneficiaries where owner_id = $1 and person_id = $2`, [me.id, person.id]);
  return { person: { username: person.username, saved: saved.length > 0 } };
}

// Checks what is to be sent without sending it: the same refusals, in the same words, as sending itself.
async function check(sql, me, body) {
  const amount = amountOf(body.amount);
  const found = await find(sql, me, body);
  const wallet = await walletOf(sql, me.id, false);
  // only earned TR can be sent: the arrival money is not another player's to have
  mustBeEligible(wallet, amount, 'transfer');
  // there is no charge for sending: what leaves is what arrives
  return { ...found, amount, fee: 0, total: amount, balance: wallet.balance, eligible: wallet.eligible, starter: wallet.starter, note: cleanText(body.note, NOTE) };
}

async function send(sql, me, body) {
  const key = keyOf(body.key);
  const amount = amountOf(body.amount);
  const note = cleanText(body.note, NOTE);
  await allow(sql, `send:${me.id}`, 30, 60);
  return sql.begin(async (tx) => {
    const person = await personNamed(tx, body.username);
    if (person.id === me.id) throw new ApiError(400, 'SELF', 'That is your own username. You cannot send TR to yourself.');
    const hash = crypto.createHash('sha256').update(`${person.id}|${amount}|${note}`).digest('hex');
    // the two wallets, locked lowest first; the sender's balance is read only once it is ours alone
    const pair = await tx.unsafe(`select id, account_id, balance, starter, illicit from ${S}.wallets where account_id in ($1, $2) order by id for update`, [me.id, person.id]);
    const mine = pair.find((row) => row.account_id === me.id), theirs = pair.find((row) => row.account_id === person.id);
    if (!mine || !theirs) throw new ApiError(409, 'NO_WALLET', 'That account cannot be sent TR yet.');
    const before = await tx.unsafe(`select id, ref, at, request_hash, kind from ${S}.wallet_tx where actor_id = $1 and idem_key = $2`, [me.id, key]);
    let moved;
    if (before.length) {
      if (before[0].kind !== 'transfer' || before[0].request_hash !== hash) throw new ApiError(409, 'KEY_REUSED', 'That request was already used for something else. Nothing was moved.');
      moved = { id: before[0].id, ref: before[0].ref, at: before[0].at, replayed: true };
    } else {
      // Earned TR, and only that, read under the lock. It arrives as what it was: earned as earned, and TR that
      // was taken from someone as that. Not a unit of the arrival money moves.
      const from = { id: mine.id, ...partsOf(mine) };
      mustBeEligible(from, amount, 'transfer');
      const { legs, drawn } = eligibleLegs(from, amount);
      if (drawn.earned) legs.push({ wallet: theirs.id, amount: drawn.earned, bucket: 'earned' });
      if (drawn.illicit) legs.push({ wallet: theirs.id, amount: drawn.illicit, bucket: 'illicit' });
      moved = await post(tx, { kind: 'transfer', actor: me.id, key, hash, note, meta: { to: person.id, earned: drawn.earned, illicit: drawn.illicit }, legs });
    }
    const now = partsOf((await tx.unsafe(`select balance, starter, illicit from ${S}.wallets where id = $1`, [mine.id]))[0]);
    const saved = await tx.unsafe(`select 1 from ${S}.beneficiaries where owner_id = $1 and person_id = $2`, [me.id, person.id]);
    return { transfer: { ref: moved.ref, to: person.username, amount, fee: 0, note, at: moved.at, replayed: moved.replayed, saved: saved.length > 0 }, balance: now.balance, starter: now.starter, illicit: now.illicit, eligible: now.eligible };
  });
}

// ---- what has happened ----

// (A movement may have touched more than one part of the wallet: its entries are read as the one line they are.)
const HISTORY = `
  select e.id, e.amount, e.balance_after, e.at, e.starter, t.ref, t.kind, t.note, t.meta,
         coalesce(
           (select a.username from ${S}.wallet_entries o join ${S}.wallets w on w.id = o.wallet_id join ${S}.accounts a on a.id = w.account_id
             where t.kind = 'transfer' and o.tx_id = e.tx_id and o.wallet_id <> e.wallet_id limit 1),
           (select a.username from ${S}.accounts a where t.kind in ('sale', 'hold') and a.id::text = (case when e.amount < 0 then t.meta->>'seller' else t.meta->>'buyer' end))) as other,
         (select o.status from ${S}.offers o where t.kind = 'hold' and o.id::text = t.meta->>'offer') as offer_status
  from (select max(id) as id, tx_id, wallet_id, sum(amount) as amount, (array_agg(balance_after order by id desc))[1] as balance_after, max(at) as at,
               coalesce(sum(amount) filter (where bucket = 'starter'), 0) as starter
        from ${S}.wallet_entries where wallet_id = $1 group by tx_id, wallet_id) e
  join ${S}.wallet_tx t on t.id = e.tx_id`;

const TYPES = { grant: 'opening', game: 'game', hold: 'held', release: 'returned', refund: 'returned', upgrade: 'upgrade' };
function line(row) {
  const amount = Number(row.amount);
  const type = row.kind === 'transfer' ? (amount < 0 ? 'sent' : 'received') : row.kind === 'sale' ? (amount < 0 ? 'bought' : 'sold') : TYPES[row.kind] || row.kind;
  const meta = row.meta && typeof row.meta === 'object' ? row.meta : {};
  let status = 'completed';
  if (row.kind === 'hold') status = row.offer_status === 'pending' ? 'held' : row.offer_status === 'accepted' ? 'paid' : 'returned';
  return {
    id: Number(row.id), ref: row.ref, type, direction: amount < 0 ? 'out' : 'in', amount: Math.abs(amount), balanceAfter: Number(row.balance_after),
    other: row.other || (typeof meta.shop === 'string' ? meta.shop : null), what: typeof meta.what === 'string' ? meta.what : null,
    note: row.note || '', status, at: row.at,
    // how much of it was arrival money (only ever the town's charges and costs, or its first arrival)
    starter: Math.abs(Number(row.starter) || 0),
    ...(row.kind === 'game' ? { earned: num(meta.earned) || 0, spent: num(meta.spent) || 0 } : {}),
  };
}

// A page of the player's own history, newest first. `before` is the id the last page ended on.
async function history(sql, me, body) {
  const wallet = await walletOf(sql, me.id, false);
  const before = Number.isSafeInteger(body.before) && body.before > 0 ? body.before : null;
  const every = body.all === true;      // with the town's own earnings and spendings, which are many and small
  const rows = await sql.unsafe(`${HISTORY} where e.wallet_id = $1 and ($2::bigint is null or e.id < $2::bigint)${every ? '' : ` and t.kind <> 'game'`} order by e.id desc limit ${PAGE + 1}`, [wallet.id, before]);
  const page = rows.slice(0, PAGE).map(line);
  return { entries: page, more: rows.length > PAGE, next: page.length ? page[page.length - 1].id : null };
}

// ---- people sent to often ----

async function people(sql, me) {
  const rows = await sql.unsafe(`select a.username, b.added_at from ${S}.beneficiaries b join ${S}.accounts a on a.id = b.person_id where b.owner_id = $1 order by lower(a.username)`, [me.id]);
  return { people: rows.map((row) => ({ username: row.username, addedAt: row.added_at })) };
}

async function addPerson(sql, me, body) {
  await allow(sql, `people:${me.id}`, 40, 60);
  const person = await personNamed(sql, body.username);
  if (person.id === me.id) throw new ApiError(400, 'SELF', 'That is your own username.');
  return sql.begin(async (tx) => {
    await tx.unsafe(`select id from ${S}.accounts where id = $1 for update`, [me.id]);
    const have = await tx.unsafe(`select person_id from ${S}.beneficiaries where owner_id = $1`, [me.id]);
    if (!have.some((row) => row.person_id === person.id)) {
      if (have.length >= PEOPLE) throw new ApiError(409, 'FULL', `You can keep ${PEOPLE} people. Remove one first.`);
      await tx.unsafe(`insert into ${S}.beneficiaries (owner_id, person_id) values ($1, $2) on conflict do nothing`, [me.id, person.id]);
    }
    return { ...(await people(tx, me)), added: person.username };
  });
}

async function removePerson(sql, me, body) {
  const person = await personNamed(sql, body.username);
  await sql.unsafe(`delete from ${S}.beneficiaries where owner_id = $1 and person_id = $2`, [me.id, person.id]);
  return people(sql, me);
}

// ---- the town's earnings and spendings ----

// What the game says its character has earned and spent in town since it last said, taken into the bank. Called
// with the character's row locked, inside the transaction that keeps the character itself (world.js), so that a
// save and what it reports are kept together or not at all. Gives what the wallet is now.
//
//   report   { v: 2, from, upto, in: { lawful, illicit }, out: { cost, restitution, asset } }, in ledger units
//
// The game sorts each thing by what it was (prototype/src/sim/funds.js); the bank decides what each may be paid
// from, and that is all a page can affect: it cannot say what kind of TR it holds.
//   earnings      taken only as far as a person playing could have earned them (the allowance); lawful first
//   things to own taken from earned TR, then from TR that was taken; never from starter TR. What cannot be
//                 found there is not taken at all (`short`): the arrival money does not buy a thing to own
//                 whatever a page says it bought.
//   handed back   from what was taken first, then starter, then earned
//   charges and   from starter TR first, then earned, then what was taken
//   costs
async function game(tx, me, report, mark) {
  const wallet = await walletOf(tx, me.id, true);
  const whole = (value) => (Number.isSafeInteger(value) && value >= 0 && value <= MOST * 10 ? value : null);
  if (report.v !== 2) throw new ApiError(409, 'OUT_OF_DATE', 'This copy of the game is out of date. Reload the page to carry on: nothing has been lost.');
  const into = report.in && typeof report.in === 'object' ? report.in : {}, out = report.out && typeof report.out === 'object' ? report.out : {};
  const from = whole(report.from), upto = whole(report.upto);
  const lawful = whole(into.lawful), illicit = whole(into.illicit), cost = whole(out.cost), restitution = whole(out.restitution), asset = whole(out.asset);
  if ([from, upto, lawful, illicit, cost, restitution, asset].includes(null) || upto < from) throw new ApiError(400, 'BAD_REQUEST', 'The game sent the bank something it cannot read.');
  if (from !== mark) throw new ApiError(409, 'OUT_OF_STEP', 'This character and its wallet are out of step. The copy kept with your account is being fetched.', { mark });
  const { burst, hour } = limits();
  const room = Math.min(burst, wallet.room + Math.floor((Math.max(0, wallet.idle) / 3600) * hour));
  // what comes in
  const inLawful = Math.min(lawful, room), inIllicit = Math.min(illicit, room - inLawful);
  const have = { starter: wallet.starter, earned: wallet.earned + inLawful, illicit: wallet.illicit + inIllicit };
  // what goes out, each from the parts it may come from
  const forAssets = take(have, asset, ORDER.eligible);
  const handedBack = take(have, restitution, ORDER.restitution);
  const forCosts = take(have, cost, ORDER.cost);
  const net = { starter: have.starter - wallet.starter, earned: have.earned - wallet.earned, illicit: have.illicit - wallet.illicit };
  const total = net.starter + net.earned + net.illicit;
  const refused = lawful + illicit - inLawful - inIllicit;
  const short = forAssets.short + handedBack.short + forCosts.short;
  await tx.unsafe(`update ${S}.wallets set earn_room = $2, earn_at = now() where id = $1`, [wallet.id, room - inLawful - inIllicit]);
  const legs = ['starter', 'earned', 'illicit'].filter((part) => net[part] !== 0).map((part) => ({ wallet: wallet.id, amount: net[part], bucket: part }));
  if (legs.length) {
    // (the town's side is one figure; when the parts of the wallet only changed places with each other it is nothing, and is left out)
    if (total !== 0) legs.push({ wallet: await systemWallet(tx, 'world'), amount: -total });
    if (legs.length >= 2) {
      await post(tx, {
        kind: 'game', actor: me.id, note: 'In town',
        meta: {
          earned: inLawful + inIllicit, spent: asset + restitution + cost - short, refused, short, from, upto,
          in: { lawful: inLawful, illicit: inIllicit }, out: { cost: cost - forCosts.short, restitution: restitution - handedBack.short, asset: asset - forAssets.short },
          starter: -net.starter, shortAsset: forAssets.short,
        },
        legs,
      });
    }
  }
  return { balance: wallet.balance + total, starter: have.starter, illicit: have.illicit, eligible: have.earned + have.illicit, mark: upto, refused, short, shortAsset: forAssets.short };
}

// Does every balance agree with its entries, does every movement sum to nothing, is all the TR accounted for,
// and is every wallet's starter TR what its entries say? (For the tests, and for anyone who wants to check the
// bank.) Gives the list of what is wrong: none.
async function audit(sql) {
  const problems = [];
  for (const row of await sql.unsafe(`select w.id, w.balance, coalesce(sum(e.amount), 0) as entries from ${S}.wallets w left join ${S}.wallet_entries e on e.wallet_id = w.id group by w.id having w.balance <> coalesce(sum(e.amount), 0)`)) problems.push(`wallet ${row.id} says ${row.balance} and its entries say ${row.entries}`);
  for (const row of await sql.unsafe(`select tx_id, sum(amount) as total from ${S}.wallet_entries group by tx_id having sum(amount) <> 0`)) problems.push(`movement ${row.tx_id} sums to ${row.total}`);
  for (const row of await sql.unsafe(`select id from ${S}.wallets where balance < 0 and not overdraw`)) problems.push(`wallet ${row.id} is below nothing`);
  const total = Number((await sql.unsafe(`select coalesce(sum(balance), 0) as total from ${S}.wallets`))[0].total);
  if (total !== 0) problems.push(`all the balances together are ${total}, not nothing`);
  for (const row of await sql.unsafe(`select e.id from ${S}.wallet_entries e join ${S}.wallet_entries p on p.wallet_id = e.wallet_id and p.id = (select max(id) from ${S}.wallet_entries x where x.wallet_id = e.wallet_id and x.id < e.id) where e.balance_after <> p.balance_after + e.amount limit 5`)) problems.push(`entry ${row.id} does not follow from the one before it`);
  const escrow = Number((await sql.unsafe(`select balance from ${S}.wallets where code = 'escrow'`))[0].balance);
  const held = Number((await sql.unsafe(`select coalesce(sum(held), 0) as held from ${S}.offers where status = 'pending'`))[0].held);
  if (escrow !== held) problems.push(`${escrow} is set aside and waiting offers account for ${held}`);
  // the parts of each wallet: none below nothing, never more than the whole, and each what its entries say
  // (counted from the day the count began for that wallet: its first entry, or the reconciliation of step 3)
  for (const row of await sql.unsafe(`select id from ${S}.wallets where kind = 'player' and (starter < 0 or illicit < 0 or starter + illicit > balance)`)) problems.push(`wallet ${row.id} has parts that do not fit in it`);
  for (const row of await sql.unsafe(
    `select w.id, w.starter, w.illicit, coalesce(r.starter, 0) + coalesce(sum(e.amount) filter (where e.bucket = 'starter'), 0) as starter_said, coalesce(r.illicit, 0) + coalesce(sum(e.amount) filter (where e.bucket = 'illicit'), 0) as illicit_said
     from ${S}.wallets w left join ${S}.wallet_reconciled r on r.wallet_id = w.id left join ${S}.wallet_entries e on e.wallet_id = w.id and e.id > coalesce(r.last_entry, 0)
     where w.kind = 'player' group by w.id, r.starter, r.illicit
     having w.starter <> coalesce(r.starter, 0) + coalesce(sum(e.amount) filter (where e.bucket = 'starter'), 0) or w.illicit <> coalesce(r.illicit, 0) + coalesce(sum(e.amount) filter (where e.bucket = 'illicit'), 0)`)) problems.push(`wallet ${row.id} says ${row.starter} starter and ${row.illicit} taken; its entries say ${row.starter_said} and ${row.illicit_said}`);
  // starter TR has gone nowhere but to the town: no entry takes it out of a wallet in any other kind of movement
  for (const row of await sql.unsafe(`select e.id, t.kind from ${S}.wallet_entries e join ${S}.wallet_tx t on t.id = e.tx_id where e.bucket = 'starter' and ((e.amount < 0 and t.kind <> 'game') or (e.amount > 0 and t.kind not in ('grant', 'sale'))) limit 5`)) problems.push(`entry ${row.id} moves starter TR in a ${row.kind}`);
  return problems;
}

module.exports = { after, get, find, check, send, history, people, addPerson, removePerson, game, open, post, walletOf, systemWallet, heldBy, audit, amountOf, trText, mustBeEligible, eligibleLegs, partsOf, keyOf, NO_USER, WORDS, TR };
