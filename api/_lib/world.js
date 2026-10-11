'use strict';
// Two things a signed-in player's game keeps with the server: its character (so that the same character is
// there on any device), and where it is standing in town just now (so that players near each other see each
// other, each under their username).

const { ApiError } = require('./http.js');
const { allow } = require('./auth.js');
const { SCHEMA: S } = require('./schema.js');
const { UUID } = require('./market.js');
const wallet = require('./wallet.js');

const MAX_SAVE = 3 * 1024 * 1024;
const SEEN_FOR = 14;                     // seconds a player stays in sight after their game last said where they are (a game alone in town says so every ten)
const MOST_PEERS = 48;

const short = (value, most) => (typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, most) : null);
const ids = (value) => (Array.isArray(value) ? value : []).filter((id) => typeof id === 'string' && UUID.test(id)).slice(0, 200);

// ---- the character ----

// What the start screen needs to know of the character kept with an account. (A character that has been erased
// is not there: only its place in the count of saves is kept, so that an old copy cannot come back.)
async function saveInfo(sql, accountId) {
  const rows = await sql.unsafe(`select rev, erased, character_name, figure, tr, updated_at, length(data) as size from ${S}.saves where account_id = $1`, [accountId]);
  if (!rows.length) return null;
  if (rows[0].erased) return { rev: rows[0].rev, erased: true };
  return { rev: rows[0].rev, name: rows[0].character_name, figure: rows[0].figure, tr: rows[0].tr === null ? null : Number(rows[0].tr), updatedAt: rows[0].updated_at, size: rows[0].size };
}

async function saveGet(sql, me) {
  const rows = await sql.unsafe(`select rev, erased, enc, data, wallet_mark, updated_at from ${S}.saves where account_id = $1`, [me.id]);
  const purse = await wallet.after(sql, me.id);
  if (!rows.length) return { save: null, wallet: { ...purse, mark: 0 } };
  if (rows[0].erased) return { save: null, erased: true, rev: rows[0].rev, wallet: { ...purse, mark: 0 } };
  return { save: { rev: rows[0].rev, enc: rows[0].enc, data: rows[0].data, updatedAt: rows[0].updated_at }, wallet: { ...purse, mark: Number(rows[0].wallet_mark) } };
}

// Keeps the character as the player's game has it now. `baseRev` is the copy this game began from: if another
// device has saved since (or the character has been erased), this one is refused and told so, and nothing is
// overwritten. With the character comes what it has earned and spent in town since its last save (`wallet`):
// the bank takes that in the same transaction, so a save and its money are kept together or not at all.
async function savePut(sql, me, body, { first = false } = {}) {
  const enc = body.enc === 'gzip-b64' ? 'gzip-b64' : body.enc === 'json' ? 'json' : null;
  if (!enc || typeof body.data !== 'string' || !body.data) throw new ApiError(400, 'BAD_REQUEST', 'There is no character in that.');
  if (body.data.length > MAX_SAVE) throw new ApiError(413, 'TOO_LARGE', 'That character is too large to keep.');
  const baseRev = Number.isInteger(body.baseRev) ? body.baseRev : 0;
  const summary = body.summary && typeof body.summary === 'object' ? body.summary : {};
  const applied = body.applied && typeof body.applied === 'object' ? body.applied : {};
  const report = body.wallet && typeof body.wallet === 'object' ? body.wallet : null;
  if (!first) await allow(sql, `save:${me.id}`, 40, 300);
  return sql.begin(async (tx) => {
    const now = await tx.unsafe(`select rev, wallet_mark from ${S}.saves where account_id = $1 for update`, [me.id]);
    const rev = now.length ? now[0].rev : 0;
    if (rev !== baseRev) throw new ApiError(409, 'NEWER', 'This character has been played on another device since.', { rev });
    const next = rev + 1;
    // the town's earnings and spendings, into the bank
    let mark = now.length ? Number(now[0].wallet_mark) : 0;
    let bank = null;
    if (report) { bank = await wallet.game(tx, me, report, mark); mark = bank.mark; }
    else bank = { balance: (await wallet.walletOf(tx, me.id, false)).balance, mark, refused: 0, short: 0 };
    await tx.unsafe(
      `insert into ${S}.saves (account_id, rev, enc, data, character_name, figure, tr, wallet_mark, erased) values ($1, $2, $3, $4, $5, $6, $7, $8, false)
       on conflict (account_id) do update set rev = excluded.rev, enc = excluded.enc, data = excluded.data, character_name = excluded.character_name, figure = excluded.figure, tr = excluded.tr, wallet_mark = excluded.wallet_mark, erased = false, updated_at = now()`,
      [me.id, next, enc, body.data, short(summary.name, 40), short(summary.figure, 8), bank.balance, mark]);
    // (sales made before the bank kept the money were settled by each game and marked here; none are made that way now)
    const paid = ids(applied.debits), credited = ids(applied.credits);
    if (paid.length) await tx.unsafe(`update ${S}.sales set buyer_paid_rev = $2 where buyer_id = $1 and buyer_paid_rev is null and id in (select value::uuid from jsonb_array_elements_text($3::text::jsonb))`, [me.id, next, JSON.stringify(paid)]);
    if (credited.length) await tx.unsafe(`update ${S}.sales set seller_credited_rev = $2 where seller_id = $1 and seller_credited_rev is null and id in (select value::uuid from jsonb_array_elements_text($3::text::jsonb))`, [me.id, next, JSON.stringify(credited)]);
    return { rev: next, wallet: { ...bank, held: await wallet.heldBy(tx, me.id) } };
  });
}

// The character is erased, at its owner's word, and a new journey can begin. The account, its username and
// password, its wallet and every movement in it, the people it sends to and everything it owns in the market
// are not touched: only the character goes. Its place in the count of saves is kept and moved on by one, so
// that a copy of the old character still open on this or another device is refused when it next tries to save.
async function saveErase(sql, me) {
  await allow(sql, `erase:${me.id}`, 10, 3600);
  return sql.begin(async (tx) => {
    const now = await tx.unsafe(`select rev from ${S}.saves where account_id = $1 for update`, [me.id]);
    const next = (now.length ? now[0].rev : 0) + 1;
    await tx.unsafe(
      `insert into ${S}.saves (account_id, rev, enc, data, wallet_mark, erased) values ($1, $2, 'json', '', 0, true)
       on conflict (account_id) do update set rev = excluded.rev, enc = 'json', data = '', character_name = null, figure = null, tr = null, wallet_mark = 0, erased = true, updated_at = now()`, [me.id, next]);
    await tx.unsafe(`delete from ${S}.presence where account_id = $1`, [me.id]);
    return { rev: next, erased: true, wallet: { ...(await wallet.after(tx, me.id)), mark: 0 } };
  });
}

// ---- who is in town ----

// The player's game says where it stands (and how it looks, and what it last said aloud), and is told who else
// is in the same town. The name others see is the account's username, put there by the server: a game cannot
// appear under a name that is not its own.
async function presence(sql, me, body) {
  const zone = short(body.zone, 24);
  if (!zone || !/^[A-Z0-9-]{3,24}$/.test(zone)) throw new ApiError(400, 'BAD_REQUEST', 'That is not a town.');
  const state = body.state && typeof body.state === 'object' && !Array.isArray(body.state) ? body.state : null;
  if (state) {
    const x = Number(state.x), z = Number(state.z);
    const text = JSON.stringify(state);
    if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > 5000 || Math.abs(z) > 5000 || text.length > 900) throw new ApiError(400, 'BAD_REQUEST', 'That is not a place in town.');
    const stamped = JSON.stringify({ ...state, n: me.username });
    await sql.unsafe(
      `insert into ${S}.presence (account_id, zone, x, z, state, at) values ($1, $2, $3, $4, $5::text::jsonb, now())
       on conflict (account_id) do update set zone = excluded.zone, x = excluded.x, z = excluded.z, state = excluded.state, at = now()`,
      [me.id, zone, x, z, stamped]);
  } else {
    await sql.unsafe(`delete from ${S}.presence where account_id = $1`, [me.id]);
    return { peers: [] };
  }
  const rows = await sql.unsafe(
    `select encode(sha256(p.account_id::text::bytea), 'hex') as who, p.state from ${S}.presence p
     where p.zone = $1 and p.account_id <> $2 and p.at > now() - make_interval(secs => $3::int)
     order by (p.x - $4::real) * (p.x - $4::real) + (p.z - $5::real) * (p.z - $5::real) limit $6::int`,
    [zone, me.id, SEEN_FOR, Number(state.x), Number(state.z), MOST_PEERS]);
  if (Math.random() < 0.02) await sql.unsafe(`delete from ${S}.presence where at < now() - interval '2 minutes'`);
  return { peers: rows.map((row) => ({ id: `u${row.who.slice(0, 20)}`, state: row.state })) };
}

module.exports = { saveInfo, saveGet, savePut, saveErase, presence };
