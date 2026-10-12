'use strict';
// The character: one to an account.
//
// It is chosen once, when the player first arrives (with the answer to "hero or villain"), and kept on the
// account's own row: not in the saved game, which a page writes, and which can be erased. So it is the same on
// every device, it is still the account's after a new journey is begun, and nothing a page sends changes it
// except the two things here:
//
//   choose    the first choice. Done once: an account that has a character is not given another this way.
//   upgrade   a change of character, paid for. Offered only to a wallet holding more than the arrival money
//             (2,000 TR); the fee is a quarter of everything in the wallet at that moment (to the half TR,
//             rounded down), and all of it must be earned TR: starter TR pays none of it. The balance is read
//             and the fee worked out here, with the wallet locked; the fee and the new character are written
//             in one transaction, or neither is; and asked twice under one key it is done once.
//
// Looking at the other characters asks nothing of the server and changes nothing.

const { ApiError } = require('./http.js');
const { allow } = require('./auth.js');
const { SCHEMA: S, FIGURES, UPGRADE } = require('./schema.js');
const wallet = require('./wallet.js');

const isFigure = (value) => typeof value === 'string' && Object.prototype.hasOwnProperty.call(FIGURES, value);
const isPath = (value) => value === 'hero' || value === 'villain';
const upgradeFee = (total) => Math.floor(total / UPGRADE.parts);

async function profile(sql, accountId) {
  const rows = await sql.unsafe(`select figure, path, figure_at from ${S}.accounts where id = $1`, [accountId]);
  return rows.length ? { figure: rows[0].figure || null, path: rows[0].path || null, chosenAt: rows[0].figure_at || null } : { figure: null, path: null, chosenAt: null };
}

// The first choice. An account with no character takes the one it is given; one that has a character keeps it
// (asked again for the same one, it is told so; asked for another, it is refused and told how one is changed).
// The answer to "hero or villain" is kept the same way: once.
async function choose(sql, me, body) {
  const figure = isFigure(body.figure) ? body.figure : null;
  const path = isPath(body.path) ? body.path : null;
  if (!figure && !path) throw new ApiError(400, 'NO_CHARACTER', 'That character is not one that can be chosen.');
  await allow(sql, `choose:${me.id}`, 30, 3600);
  return sql.begin(async (tx) => {
    const now = (await tx.unsafe(`select figure, path from ${S}.accounts where id = $1 for update`, [me.id]))[0];
    if (figure && now.figure && now.figure !== figure) throw new ApiError(409, 'CHOSEN', `Your character is ${FIGURES[now.figure]}'s figure, and it stays yours. It can be changed with a character upgrade.`, { figure: now.figure, path: now.path || null });
    const setFigure = figure && !now.figure, setPath = path && !now.path;
    if (setFigure || setPath) await tx.unsafe(`update ${S}.accounts set figure = coalesce(figure, $2), figure_at = case when figure is null and $2::text is not null then now() else figure_at end, path = coalesce(path, $3) where id = $1`, [me.id, setFigure ? figure : null, setPath ? path : null]);
    return { character: await profile(tx, me.id), chosen: !!setFigure };
  });
}

// What an upgrade to `to` would cost this account now, and whether it may be had: from the bank's own rows.
function quoteFrom(from, w, to) {
  const fee = upgradeFee(w.balance);
  const quote = { from: from || null, to: isFigure(to) ? to : null, total: w.balance, fee, after: w.balance - fee, eligible: w.eligible, starter: w.starter, above: UPGRADE.above, ok: false, code: '', message: '' };
  const no = (code, message) => ({ ...quote, code, message });
  if (!quote.to) return no('NO_CHARACTER', 'That character is not one that can be chosen.');
  if (!quote.from) return no('NO_CHARACTER', 'You have no character to upgrade from yet.');
  if (quote.to === quote.from) return no('SAME', 'That is the character you already are.');
  if (w.balance <= UPGRADE.above) return no('BALANCE', `A character can be upgraded once you have more than ${wallet.trText(UPGRADE.above)}. You have ${wallet.trText(w.balance)}.`);
  if (w.eligible < fee) return no('ELIGIBLE_FUNDS', `${wallet.WORDS.short} The upgrade is ${wallet.trText(fee)}, and ${wallet.trText(w.eligible)} of what you have is TR you have earned. ${wallet.WORDS.upgrade}`);
  return { ...quote, ok: true };
}

async function quote(sql, me, body) {
  await allow(sql, `quote:${me.id}`, 120, 60);
  const mine = await profile(sql, me.id);
  return { quote: quoteFrom(mine.figure, await wallet.walletOf(sql, me.id, false), body.figure), names: FIGURES };
}

const changeView = (row, replayed) => ({ id: row.id, from: row.from_figure, to: row.to_figure, total: Number(row.total), fee: Number(row.fee), ref: row.ref || null, at: row.at, replayed: !!replayed });

// The upgrade itself. `fee` is what the player was shown: it is not the price (the price is worked out here),
// it is checked against it, so that nobody is charged a fee they did not see.
async function upgrade(sql, me, body) {
  const key = wallet.keyOf(body.key);
  const to = body.figure;
  if (!isFigure(to)) throw new ApiError(400, 'NO_CHARACTER', 'That character is not one that can be chosen.');
  if (!Number.isSafeInteger(body.fee) || body.fee <= 0) throw new ApiError(400, 'BAD_REQUEST', 'The fee you were shown is missing. Look at the upgrade again.');
  await allow(sql, `upgrade:${me.id}`, 20, 3600);
  return sql.begin(async (tx) => {
    // the account, then its wallet: each ours alone until this is done, so two upgrades asked at once are one after the other
    const account = (await tx.unsafe(`select figure from ${S}.accounts where id = $1 for update`, [me.id]))[0];
    const w = await wallet.walletOf(tx, me.id, true);
    const before = await tx.unsafe(`select c.id, c.from_figure, c.to_figure, c.total, c.fee, c.at, t.ref from ${S}.character_changes c join ${S}.wallet_tx t on t.id = c.tx_id where c.account_id = $1 and c.idem_key = $2`, [me.id, key]);
    if (before.length) {
      // asked twice: what was done the first time is the answer, and nothing is charged again
      if (before[0].to_figure !== to) throw new ApiError(409, 'KEY_REUSED', 'That request was already used for something else. Nothing was changed.');
      return { upgrade: changeView(before[0], true), character: await profile(tx, me.id), ...(await wallet.after(tx, me.id)) };
    }
    const q = quoteFrom(account.figure, w, to);
    if (!q.ok) throw new ApiError(q.code === 'NO_CHARACTER' ? 400 : 409, q.code, q.message, { quote: q });
    if (body.fee !== q.fee) throw new ApiError(409, 'QUOTE_CHANGED', `Your balance has changed since you were shown the fee. It is now ${wallet.trText(q.fee)}.`, { quote: q });
    // the fee, out of earned TR only, and the character, together or not at all
    const { legs, drawn } = wallet.eligibleLegs(w, q.fee);
    legs.push({ wallet: await wallet.systemWallet(tx, 'world'), amount: q.fee });
    const moved = await wallet.post(tx, {
      kind: 'upgrade', actor: me.id, key: `upgrade:${key}`, note: `Character upgrade: ${FIGURES[q.from]} to ${FIGURES[q.to]}`,
      meta: { from: q.from, to: q.to, total: q.total, fee: q.fee, earned: drawn.earned, illicit: drawn.illicit }, legs,
    });
    await tx.unsafe(`update ${S}.accounts set figure = $2, figure_at = now() where id = $1`, [me.id, q.to]);
    const made = (await tx.unsafe(`insert into ${S}.character_changes (account_id, from_figure, to_figure, total, fee, tx_id, idem_key) values ($1, $2, $3, $4, $5, $6, $7) returning id, from_figure, to_figure, total, fee, at`, [me.id, q.from, q.to, q.total, q.fee, moved.id, key]))[0];
    await tx.unsafe(`update ${S}.saves set figure = $2 where account_id = $1 and not erased`, [me.id, q.to]);
    return { upgrade: changeView({ ...made, ref: moved.ref }, false), character: await profile(tx, me.id), ...(await wallet.after(tx, me.id)) };
  });
}

// Every change of character an account has made, newest first.
async function changes(sql, me) {
  const rows = await sql.unsafe(`select c.id, c.from_figure, c.to_figure, c.total, c.fee, c.at, t.ref from ${S}.character_changes c join ${S}.wallet_tx t on t.id = c.tx_id where c.account_id = $1 order by c.at desc limit 50`, [me.id]);
  return { changes: rows.map((row) => changeView(row, false)) };
}

module.exports = { profile, choose, quote, upgrade, changes, upgradeFee, quoteFrom, FIGURES, UPGRADE };
