'use strict';
// Two things a signed-in player's game keeps with the server: its character (so that the same character is
// there on any device), and where it is standing in town just now (so that players near each other see each
// other, each under their username).

const { ApiError } = require('./http.js');
const { allow } = require('./auth.js');
const { SCHEMA: S } = require('./schema.js');
const { UUID } = require('./market.js');

const MAX_SAVE = 3 * 1024 * 1024;
const SEEN_FOR = 8;                      // seconds a player stays in sight after their game last said where they are
const MOST_PEERS = 48;

const short = (value, most) => (typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, most) : null);
const ids = (value) => (Array.isArray(value) ? value : []).filter((id) => typeof id === 'string' && UUID.test(id)).slice(0, 200);

// ---- the character ----

async function saveInfo(sql, accountId) {
  const rows = await sql.unsafe(`select rev, character_name, figure, tr, updated_at, length(data) as size from ${S}.saves where account_id = $1`, [accountId]);
  return rows.length ? { rev: rows[0].rev, name: rows[0].character_name, figure: rows[0].figure, tr: rows[0].tr === null ? null : Number(rows[0].tr), updatedAt: rows[0].updated_at, size: rows[0].size } : null;
}

async function saveGet(sql, me) {
  const rows = await sql.unsafe(`select rev, enc, data, updated_at from ${S}.saves where account_id = $1`, [me.id]);
  return { save: rows.length ? { rev: rows[0].rev, enc: rows[0].enc, data: rows[0].data, updatedAt: rows[0].updated_at } : null };
}

// Keeps the character as the player's game has it now. `baseRev` is the copy this game began from: if another
// device has saved since, this one is refused and told so, and nothing is overwritten. What the game says it
// has paid and been paid for market sales is marked in the same transaction as the save that holds the money.
async function savePut(sql, me, body, { first = false } = {}) {
  const enc = body.enc === 'gzip-b64' ? 'gzip-b64' : body.enc === 'json' ? 'json' : null;
  if (!enc || typeof body.data !== 'string' || !body.data) throw new ApiError(400, 'BAD_REQUEST', 'There is no character in that.');
  if (body.data.length > MAX_SAVE) throw new ApiError(413, 'TOO_LARGE', 'That character is too large to keep.');
  const baseRev = Number.isInteger(body.baseRev) ? body.baseRev : 0;
  const summary = body.summary && typeof body.summary === 'object' ? body.summary : {};
  const tr = Number.isSafeInteger(summary.tr) ? summary.tr : null;
  const applied = body.applied && typeof body.applied === 'object' ? body.applied : {};
  if (!first) await allow(sql, `save:${me.id}`, 40, 300);
  return sql.begin(async (tx) => {
    const now = await tx.unsafe(`select rev from ${S}.saves where account_id = $1 for update`, [me.id]);
    const rev = now.length ? now[0].rev : 0;
    if (rev !== baseRev) throw new ApiError(409, 'NEWER', 'This character has been played on another device since.', { rev });
    const next = rev + 1;
    await tx.unsafe(
      `insert into ${S}.saves (account_id, rev, enc, data, character_name, figure, tr) values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (account_id) do update set rev = excluded.rev, enc = excluded.enc, data = excluded.data, character_name = excluded.character_name, figure = excluded.figure, tr = excluded.tr, updated_at = now()`,
      [me.id, next, enc, body.data, short(summary.name, 40), short(summary.figure, 8), tr]);
    const paid = ids(applied.debits), credited = ids(applied.credits);
    if (paid.length) await tx.unsafe(`update ${S}.sales set buyer_paid_rev = $2 where buyer_id = $1 and buyer_paid_rev is null and id in (select value::uuid from jsonb_array_elements_text($3::text::jsonb))`, [me.id, next, JSON.stringify(paid)]);
    if (credited.length) await tx.unsafe(`update ${S}.sales set seller_credited_rev = $2 where seller_id = $1 and seller_credited_rev is null and id in (select value::uuid from jsonb_array_elements_text($3::text::jsonb))`, [me.id, next, JSON.stringify(credited)]);
    return { rev: next };
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

module.exports = { saveInfo, saveGet, savePut, presence };
