'use strict';
// Voice chat between players, on the website's server (29 October 2026, the owner's brief for voice chat, stage 1).
//
// The voices themselves never come here: they go from one player's device to another's (WebRTC), or, where a network
// will not let two devices reach each other, through Cloudflare's relay (TURN). What this server does:
//
//   the handshake   two devices that are to talk first exchange a description of themselves (an offer and an answer).
//                   Each goes with the game's next word about where the player is (world.js, presence), is kept here
//                   until the other's game next says where it is, and is handed to it then (`voice_signals`). Only
//                   between two players in the same town, both with voice on, both allowed voice, and neither having
//                   blocked the other.
//   the relay       a short-lived password for Cloudflare's relay, made here with the key the site was given
//                   (CF_TURN_KEY_ID and CF_TURN_API_TOKEN, the host's environment): the key never leaves this server.
//   blocks          a player blocked is never put in touch with the one who blocked them, either way.
//   reports         a player reported for abuse, harassment, threats or hate, with the date, the two accounts and the
//                   place; seen in the Admin app, where an administrator warns, bans from voice (7 days, 30 days, for
//                   good) or bans from the game.
//   the age         voice is for players of 18 and over: the game asks once, and what the player says is kept here;
//                   one who says they are not is kept from voice, and only an administrator can change that.
//
// Nothing of what is said is ever here: no voice is recorded or kept, anywhere.

const crypto = require('node:crypto');
const { ApiError } = require('./http.js');
const { allow } = require('./auth.js');
const { SCHEMA: S } = require('./schema.js');

const VOICE = Object.freeze({
  most: 8,                 // handshakes one word may carry
  size: 16000,             // characters in one (a description of a device with its ways to be reached: a few thousand)
  keep: 40,                // seconds a handshake waits to be taken
  ttl: 4 * 3600,           // seconds the relay's password lasts (it is asked for again before then)
  stun: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'],
});
const REASONS = Object.freeze(['abuse', 'harassment', 'threats', 'hate', 'other']);
const ACTIONS = Object.freeze({ dismiss: 'dismissed', warn: 'warned', voice7: 'voice-7', voice30: 'voice-30', voiceForever: 'voice-forever', gameBan: 'game-ban' });

// A player as other players' games know them: never the account's own number (world.js does the same)
const peerOf = (accountId) => `u${crypto.createHash('sha256').update(String(accountId)).digest('hex').slice(0, 20)}`;
const short = (value, most) => (typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, most) : '');
const banned = (row) => !!(row && row.voice_ban_until && new Date(row.voice_ban_until).getTime() > Date.now());
const allowed = (row) => !!row && row.voice_adult === true && !banned(row) && !row.game_ban;

async function voiceRow(sql, id) {
  const rows = await sql.unsafe(`select id, username, voice_adult, voice_adult_set_by_admin, voice_ban_until, game_ban, warning from ${S}.accounts where id = $1`, [id]);
  return rows[0] || null;
}
// the account a peer id stands for, among those with a place in town just now, or among all
async function accountOfPeer(sql, peer) {
  if (typeof peer !== 'string' || !/^u[0-9a-f]{20}$/.test(peer)) return null;
  const rows = await sql.unsafe(`select id, username from ${S}.accounts where left(encode(sha256(id::text::bytea), 'hex'), 20) = $1 limit 1`, [peer.slice(1)]);
  return rows[0] || null;
}

// What the game needs to know before it offers voice: whether the age has been asked, whether the player may use it,
// a warning from an administrator not yet seen, and whom they have blocked.
async function status(sql, me) {
  const row = await voiceRow(sql, me.id);
  const blocks = await sql.unsafe(`select a.username, b.blocked_id from ${S}.voice_blocks b join ${S}.accounts a on a.id = b.blocked_id where b.account_id = $1 order by b.at desc limit 200`, [me.id]);
  return { voice: {
    adult: row.voice_adult, ageLocked: !!row.voice_adult_set_by_admin,
    allowed: allowed(row), bannedUntil: banned(row) ? new Date(row.voice_ban_until).toISOString() : null,
    warning: row.warning || null,
    blocked: blocks.map((b) => ({ username: b.username, id: peerOf(b.blocked_id) })),
  } };
}

// The age, as the player says it: once. (One who has said no stays so; an administrator can change it.)
async function setAge(sql, me, body) {
  if (typeof body.adult !== 'boolean') throw new ApiError(400, 'BAD_REQUEST', 'Say yes or no.');
  const row = await voiceRow(sql, me.id);
  if (row.voice_adult !== null) return status(sql, me);
  await sql.unsafe(`update ${S}.accounts set voice_adult = $2 where id = $1 and voice_adult is null`, [me.id, body.adult]);
  return status(sql, me);
}

async function seenWarning(sql, me) {
  await sql.unsafe(`update ${S}.accounts set warning = null where id = $1`, [me.id]);
  return {};
}

// The ways for this player's device to be reached and to reach others: the public STUN servers, and Cloudflare's relay
// with a password of its own for this player, good for a few hours. Without the key (a copy of the site not given
// one), the STUN servers alone: two devices on networks that block each other then cannot talk, and the game says so.
async function ice(sql, me, { fetcher = (...a) => fetch(...a) } = {}) {
  const row = await voiceRow(sql, me.id);
  if (!allowed(row)) throw new ApiError(403, 'NO_VOICE', row && row.voice_adult === false ? 'Voice chat is for players aged 18 and over.' : 'Voice chat is not open to this account just now.');
  await allow(sql, `voice-ice:${me.id}`, 30, 3600);
  const stun = { urls: VOICE.stun };
  // (the tests' own relay, on the machine they run on: never set on the website)
  if (process.env.PCW_TURN_TEST) {
    try { return { iceServers: [stun, ...JSON.parse(process.env.PCW_TURN_TEST)], relay: true, ttl: VOICE.ttl }; } catch (error) { /* not set properly */ }
  }
  const keyId = process.env.CF_TURN_KEY_ID, token = process.env.CF_TURN_API_TOKEN;
  if (!keyId || !token) return { iceServers: [stun], relay: false, ttl: VOICE.ttl };
  try {
    const response = await fetcher(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ttl: VOICE.ttl }),
    });
    const got = await response.json();
    const servers = Array.isArray(got && got.iceServers) ? got.iceServers : got && got.iceServers ? [got.iceServers] : [];
    // (the relay's addresses on port 53, which browsers block, are left out: they would only be waited on)
    const out = servers.map((s) => ({ ...s, urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => typeof u === 'string' && !/:53(\?|$)/.test(u)) })).filter((s) => s.urls.length);
    if (!response.ok || !out.length) throw new Error(`relay ${response.status}`);
    return { iceServers: out, relay: out.some((s) => s.urls.some((u) => u.startsWith('turn'))), ttl: VOICE.ttl };
  } catch (error) {
    console.error('voice relay:', error && error.message);
    return { iceServers: [stun], relay: false, ttl: VOICE.ttl };
  }
}

// With each word about where the player is (world.js): the players near them whom they may talk with, the handshakes
// this player's game is sending, and those waiting for it. `rows`: the players in town the word answers with, each
// with its account (`aid`) and what its game last said (`state`, `vc`: voice on).
async function exchange(sql, me, word, rows) {
  const mine = peerOf(me.id);
  const row = await voiceRow(sql, me.id);
  const on = !!word.on && allowed(row);
  const others = rows.filter((r) => r.state && r.state.vc === 1);
  let ok = [];
  if (on && others.length) {
    const ids = others.map((r) => r.aid);
    const [them, blocks] = await Promise.all([
      sql.unsafe(`select id, voice_adult, voice_ban_until, game_ban from ${S}.accounts where id = any(string_to_array($1, ',')::uuid[])`, [ids.join(',')]),
      sql.unsafe(`select account_id, blocked_id from ${S}.voice_blocks where (account_id = $1 and blocked_id = any(string_to_array($2, ',')::uuid[])) or (blocked_id = $1 and account_id = any(string_to_array($2, ',')::uuid[]))`, [me.id, ids.join(',')]),
    ]);
    const may = new Set(them.filter(allowed).map((r) => r.id));
    for (const b of blocks) { may.delete(b.account_id); may.delete(b.blocked_id); }
    ok = others.filter((r) => may.has(r.aid)).map((r) => ({ id: peerOf(r.aid), aid: r.aid }));
  }
  const byPeer = new Map(ok.map((p) => [p.id, p.aid]));
  // the handshakes sent: only to a player this one may talk with (a goodbye to anyone once talked with)
  const out = Array.isArray(word.out) ? word.out.slice(0, VOICE.most) : [];
  let sent = 0;
  for (const s of out) {
    if (!s || typeof s !== 'object' || !['offer', 'answer', 'bye'].includes(s.k)) continue;
    const data = s.k === 'bye' ? null : typeof s.d === 'string' && s.d.length <= VOICE.size ? s.d : undefined;
    if (data === undefined) continue;
    let to = byPeer.get(s.to);
    if (!to && s.k === 'bye') { const acc = rows.find((r) => peerOf(r.aid) === s.to); to = acc ? acc.aid : null; }
    if (!to || (!on && s.k !== 'bye')) continue;
    await sql.unsafe(`insert into ${S}.voice_signals (to_id, from_id, kind, data) values ($1, $2, $3, $4)`, [to, me.id, s.k, data]);
    sent += 1;
  }
  // those waiting for this one, taken once
  const waiting = await sql.unsafe(
    `delete from ${S}.voice_signals where to_id = $1 returning from_id, kind, data, extract(epoch from (now() - at))::float8 as age`, [me.id]);
  if (Math.random() < 0.02) await sql.unsafe(`delete from ${S}.voice_signals where at < now() - make_interval(secs => $1::int)`, [VOICE.keep * 3]);
  const incoming = waiting
    .filter((w) => Number(w.age) <= VOICE.keep && (w.kind === 'bye' || (on && byPeer.has(peerOf(w.from_id)))))
    .map((w) => ({ from: peerOf(w.from_id), k: w.kind, ...(w.data ? { d: w.data } : {}) }));
  return { me: mine, on, ok: ok.map((p) => p.id), in: incoming, sent, ...(row && !allowed(row) ? { no: row.voice_adult === false ? 'AGE' : row.game_ban || banned(row) ? 'BANNED' : 'AGE_UNKNOWN' } : {}) };
}

async function block(sql, me, body) {
  const them = await accountOfPeer(sql, body.peer);
  if (!them) throw new ApiError(404, 'NOT_FOUND', 'That player could not be found.');
  if (them.id === me.id) throw new ApiError(400, 'BAD_REQUEST', 'You cannot block yourself.');
  await allow(sql, `voice-block:${me.id}`, 60, 3600);
  await sql.unsafe(`insert into ${S}.voice_blocks (account_id, blocked_id) values ($1, $2) on conflict do nothing`, [me.id, them.id]);
  // whatever handshakes were on their way between the two go
  await sql.unsafe(`delete from ${S}.voice_signals where (to_id = $1 and from_id = $2) or (to_id = $2 and from_id = $1)`, [me.id, them.id]);
  return status(sql, me);
}

async function unblock(sql, me, body) {
  const them = await accountOfPeer(sql, body.peer);
  if (them) await sql.unsafe(`delete from ${S}.voice_blocks where account_id = $1 and blocked_id = $2`, [me.id, them.id]);
  return status(sql, me);
}

async function report(sql, me, body) {
  const them = await accountOfPeer(sql, body.peer);
  if (!them) throw new ApiError(404, 'NOT_FOUND', 'That player could not be found.');
  if (them.id === me.id) throw new ApiError(400, 'BAD_REQUEST', 'You cannot report yourself.');
  if (!REASONS.includes(body.reason)) throw new ApiError(400, 'BAD_REQUEST', 'Choose a reason.');
  await allow(sql, `voice-report:${me.id}`, 10, 3600);
  const x = Number(body.x), z = Number(body.z);
  const zone = short(body.zone, 24) || null;
  const rows = await sql.unsafe(
    `insert into ${S}.voice_reports (reporter_id, reported_id, reason, note, zone, x, z) values ($1, $2, $3, $4, $5, $6, $7) returning id, at`,
    [me.id, them.id, body.reason, short(body.note, 400) || null, zone, Number.isFinite(x) ? x : null, Number.isFinite(z) ? z : null]);
  return { report: { id: Number(rows[0].id), at: rows[0].at, username: them.username } };
}

// ---- the Admin app ----

const mustBeAdmin = (me) => { if (!me || !me.admin) throw new ApiError(403, 'NOT_ADMIN', 'Only an administrator can do that.'); };

async function adminReports(sql, me, body) {
  mustBeAdmin(me);
  const all = body.status === 'all';
  const rows = await sql.unsafe(
    `select r.id, r.reason, r.note, r.zone, r.x, r.z, r.at, r.status, r.decided_at, r.message,
            a.username as reporter, b.username as reported, b.id as reported_id, d.username as decided_by,
            b.voice_ban_until, b.game_ban,
            (select count(*) from ${S}.voice_reports q where q.reported_id = r.reported_id)::int as reports_on_them
     from ${S}.voice_reports r
     join ${S}.accounts a on a.id = r.reporter_id
     join ${S}.accounts b on b.id = r.reported_id
     left join ${S}.accounts d on d.id = r.decided_by
     where $1::boolean or r.status = 'open'
     order by r.at desc limit 200`, [all]);
  return { reports: rows.map((r) => ({
    id: Number(r.id), reason: r.reason, note: r.note, place: r.zone ? { zone: r.zone, x: r.x, z: r.z } : null, at: r.at, status: r.status,
    reporter: r.reporter, reported: r.reported, reportsOnThem: r.reports_on_them, decidedBy: r.decided_by, decidedAt: r.decided_at, message: r.message,
    voiceBannedUntil: banned(r) ? new Date(r.voice_ban_until).toISOString() : null, gameBanned: !!r.game_ban,
  })) };
}

// An administrator's decision on a report: dismiss it, warn the player (they see the message at their next word with the
// server), ban them from voice chat for 7 or 30 days or for good, or ban them from the game.
async function adminDecide(sql, me, body) {
  mustBeAdmin(me);
  const id = Number(body.report);
  const status = ACTIONS[body.action];
  if (!Number.isSafeInteger(id) || !status) throw new ApiError(400, 'BAD_REQUEST', 'Choose a report and what to do.');
  const message = short(body.message, 400);
  return sql.begin(async (tx) => {
    const rows = await tx.unsafe(`select reported_id from ${S}.voice_reports where id = $1 for update`, [id]);
    if (!rows.length) throw new ApiError(404, 'NOT_FOUND', 'There is no such report.');
    const who = rows[0].reported_id;
    const warning = message || {
      warned: 'A warning from PostCivilWar: other players reported what you said in voice chat. Keep it friendly, or voice chat will be closed to you.',
      'voice-7': 'Voice chat is closed to you for 7 days, after reports from other players.',
      'voice-30': 'Voice chat is closed to you for 30 days, after reports from other players.',
      'voice-forever': 'Voice chat is closed to you, after reports from other players.',
    }[status] || null;
    if (status === 'voice-7' || status === 'voice-30' || status === 'voice-forever') {
      const days = status === 'voice-7' ? 7 : status === 'voice-30' ? 30 : 36500;
      await tx.unsafe(`update ${S}.accounts set voice_ban_until = greatest(coalesce(voice_ban_until, now()), now() + make_interval(days => $2::int)) where id = $1`, [who, days]);
    }
    if (status === 'game-ban') {
      await tx.unsafe(`update ${S}.accounts set game_ban = true where id = $1`, [who]);
      // signed out everywhere, and out of town at once
      await tx.unsafe(`delete from ${S}.sessions where account_id = $1`, [who]);
      await tx.unsafe(`delete from ${S}.presence where account_id = $1`, [who]);
    }
    if (warning && status !== 'dismissed' && status !== 'game-ban') await tx.unsafe(`update ${S}.accounts set warning = $2 where id = $1`, [who, warning]);
    await tx.unsafe(`update ${S}.voice_reports set status = $2, decided_by = $3, decided_at = now(), message = $4 where id = $1`, [id, status, me.id, message || null]);
    return { decided: { report: id, status } };
  });
}

// An administrator undoes a ban, or sets what an account's age is for voice chat.
async function adminAccount(sql, me, body) {
  mustBeAdmin(me);
  const key = short(body.username, 32).toLowerCase();
  const rows = await sql.unsafe(`select id from ${S}.accounts where username_key = $1`, [key]);
  if (!rows.length) throw new ApiError(404, 'NOT_FOUND', 'There is no such account.');
  const id = rows[0].id;
  if (body.unbanVoice) await sql.unsafe(`update ${S}.accounts set voice_ban_until = null where id = $1`, [id]);
  if (body.unbanGame) await sql.unsafe(`update ${S}.accounts set game_ban = false where id = $1`, [id]);
  if (typeof body.adult === 'boolean') await sql.unsafe(`update ${S}.accounts set voice_adult = $2, voice_adult_set_by_admin = true where id = $1`, [id, body.adult]);
  const after = await sql.unsafe(`select username, voice_adult, voice_ban_until, game_ban from ${S}.accounts where id = $1`, [id]);
  const a = after[0];
  return { account: { username: a.username, adult: a.voice_adult, voiceBannedUntil: banned(a) ? new Date(a.voice_ban_until).toISOString() : null, gameBanned: !!a.game_ban } };
}

module.exports = { VOICE, REASONS, ACTIONS, peerOf, status, setAge, seenWarning, ice, exchange, block, unblock, report, adminReports, adminDecide, adminAccount, allowed };
