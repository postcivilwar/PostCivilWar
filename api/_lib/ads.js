'use strict';
// Advertising on the billboards (13 October 2026, from the owner's prompt): what a billboard costs, booking one,
// the pictures, holding the advertiser's earned TR while it is reviewed, the review, and what is shown where.
//
// What the server alone decides: the price (from its own table, never from the page), the days, whether the
// billboard is free for them, whether the advertiser has the earned TR (starter TR never pays for advertising, nor
// does TR taken from someone), the pictures' kind, size and shape, the terms accepted, and every movement of TR.
// What the page is told: only what is its own, and, of everyone's campaigns, only the approved ones now showing.
//
// The money, in the bank's own ledger (wallet.js):
//   submitted   the total moves from the advertiser's earned TR to the bank's 'adhold' wallet          ('ad-hold')
//   approved    from 'adhold' the fee to 'adverts' and the tax to 'adtax'                               ('ad-charge')
//               (approved after its first day, the days already gone are given back in the same movement)
//   rejected    from 'adhold' back to the advertiser's earned TR                                        ('ad-release')
//   cancelled   the same, while it waits for review
// Each is done once, under a key of its own, with the campaign's row locked: a second press, a second admin or a
// retried request finds it done.
//
// Email: none is sent (the owner's choice, 13 October 2026: the database only, reviewed in the game's admin
// pages). No address of any reviewer is in this file or anywhere the page can see.

const crypto = require('node:crypto');
const { ApiError } = require('./http.js');
const { allow } = require('./auth.js');
const { SCHEMA: S } = require('./schema.js');
const wallet = require('./wallet.js');
const BILLBOARDS = require('./billboards.json');

const TR = 2;                                   // ledger units in a TR
const DAY = 86400000;
const LAGOS = 3600000;                          // the game's day turns at midnight in Lagos (UTC+1, no summer time)
const BOARD = new Map(BILLBOARDS.map((b) => [b.id, b]));
// what a day costs, in whole TR: the owner's table (prototype/src/sim/billboards.js has the same; a test checks)
const PRICES = Object.freeze({ small: { fee: 66, tax: 4 }, medium: { fee: 132, tax: 8 }, large: { fee: 200, tax: 16 }, xl: { fee: 267, tax: 32 }, tv: { fee: 667, tax: 64 } });
const DURATIONS = Object.freeze({ '1w': 7, '2w': 14, '1m': 30, '2m': 60, '3m': 90, '6m': 180 });
const TERMS_VERSION = 'ads-terms-2026-10-13';
const ART = Object.freeze({ maxBytes: 2400000, maxSide: 4096, minSide: 300, aspectSlack: 0.04, tvMin: 3, tvMax: 10 });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const uuid = (value, what) => { if (typeof value !== 'string' || !UUID.test(value)) throw new ApiError(400, 'BAD_REQUEST', `That is not ${what}.`); return value; };
const clean = (value, most) => (typeof value === 'string' ? value : '').replace(/[\u0000-\u001f\u007f\u2028\u2029<>]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, most);
const trText = (units) => `${(Number(units) / TR).toLocaleString('en-GB', { maximumFractionDigits: 1 })} TR`;
const num = (v) => (v === null || v === undefined ? null : Number(v));

// ---- the price and the days ----

function boardOf(id) {
  const b = BOARD.get(String(id || ''));
  if (!b) throw new ApiError(404, 'NO_BILLBOARD', 'There is no such billboard.');
  return b;
}
function daysOf(duration) {
  const days = DURATIONS[String(duration || '')];
  if (!days) throw new ApiError(400, 'DURATION', 'Choose how long the advertisement is to run.');
  return days;
}
// The price of `days` on a billboard, in ledger units: fee and tax by the day and in all.
function priceOf(board, days) {
  const p = PRICES[board.category];
  const feeDay = p.fee * TR, taxDay = p.tax * TR;
  return { days, feeDay, taxDay, fee: feeDay * days, tax: taxDay * days, total: (feeDay + taxDay) * days };
}
// The first whole day a new campaign can start: the day after the next, in Lagos, so that it can be reviewed first.
function earliestStart(now = Date.now()) {
  const local = now + LAGOS + DAY;
  return Math.ceil(local / DAY) * DAY - LAGOS;
}
// The first run of `days` whole days, from the earliest start, that no other booking on the billboard touches.
async function firstFree(tx, boardId, days, now, except = null) {
  const taken = await tx.unsafe(`select start_at, end_at from ${S}.ad_campaigns where billboard_id = $1 and status in ('pending', 'approved') and end_at > $2 and ($3::uuid is null or id <> $3::uuid) order by start_at`, [boardId, new Date(now).toISOString(), except]);
  let start = earliestStart(now);
  for (const t of taken) {
    const s = new Date(t.start_at).getTime(), e = new Date(t.end_at).getTime();
    if (start + days * DAY <= s) break;
    if (e > start) start = e;
  }
  return { start, end: start + days * DAY };
}

// ---- the pictures ----

// The kind and size of a picture, from its own bytes (nothing else is believed). Only PNG, JPEG and WebP stills.
function pictureOf(buffer) {
  const b = buffer;
  if (b.length > 24 && b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG' && b.toString('ascii', 12, 16) === 'IHDR') return { mime: 'image/png', width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i += 1; continue; }
      const marker = b[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const length = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { mime: 'image/jpeg', width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
      i += 2 + length;
    }
    return null;
  }
  if (b.length > 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const kind = b.toString('ascii', 12, 16);
    if (kind === 'VP8 ' && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) return { mime: 'image/webp', width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    if (kind === 'VP8L' && b[20] === 0x2f) { const v = b.readUInt32LE(21); return { mime: 'image/webp', width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1 }; }
    if (kind === 'VP8X') { if (b[20] & 0x02) return { animated: true }; return { mime: 'image/webp', width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) }; }
  }
  return null;
}

// ---- reading ----

const ROW = `select c.*, a.username from ${S}.ad_campaigns c join ${S}.accounts a on a.id = c.account_id`;
// what a campaign is now, by its days and the clock
function stageOf(row, now = Date.now()) {
  if (row.status !== 'approved') return row.status;
  const s = new Date(row.start_at).getTime(), e = new Date(row.end_at).getTime();
  return now < s ? 'scheduled' : now < e ? 'active' : 'expired';
}
async function artOf(sql, ids) {
  if (!ids.length) return new Map();
  const rows = await sql.unsafe(`select id, campaign_id, idx, mime, width, height, bytes from ${S}.ad_art where campaign_id = any(string_to_array($1, ',')::uuid[]) order by idx`, [ids.join(',')]);
  const out = new Map();
  for (const r of rows) { if (!out.has(r.campaign_id)) out.set(r.campaign_id, []); out.get(r.campaign_id).push({ id: r.id, index: r.idx, mime: r.mime, width: r.width, height: r.height, bytes: r.bytes }); }
  return out;
}
function campaignView(row, art, { admin = false } = {}) {
  const b = BOARD.get(row.billboard_id) || {};
  return {
    id: row.id, billboard: row.billboard_id, place: b.place || '', category: row.category, size: { width: b.width, height: b.height }, tv: !!b.tv,
    brand: row.brand, link: row.link, days: row.days, start: row.start_at, end: row.end_at,
    price: { feeDay: num(row.fee_day), taxDay: num(row.tax_day), fee: num(row.fee), tax: num(row.tax), total: num(row.total), refunded: num(row.refunded) },
    status: row.status, stage: stageOf(row), feedback: row.review_note || '', submitted: row.submitted_at, reviewed: row.reviewed_at,
    art: art || [],
    ...(admin ? { advertiser: row.username, termsVersion: row.terms_version, termsAt: row.terms_at, rights: row.rights } : {}),
  };
}

// The prices, the lengths, the terms in force, and how each billboard stands (anyone may look).
async function catalog(sql) {
  const now = new Date().toISOString();
  const rows = await sql.unsafe(`select billboard_id, status, start_at, end_at from ${S}.ad_campaigns where status in ('pending', 'approved') and end_at > $1 order by start_at`, [now]);
  const state = {};
  for (const r of rows) {
    const live = r.status === 'approved' && new Date(r.start_at) <= new Date();
    const was = state[r.billboard_id];
    const mine = { status: live ? 'occupied' : r.status === 'pending' ? 'review' : 'reserved', until: r.end_at };
    if (!was || mine.status === 'occupied' || (was.status === 'reserved' && mine.status === 'review')) state[r.billboard_id] = mine;
  }
  return { prices: PRICES, durations: DURATIONS, terms: TERMS_VERSION, rules: ART, earliest: new Date(earliestStart()).toISOString(), state };
}

// What a booking would cost and when it would run, and what the advertiser has to pay it with.
async function quote(sql, me, body) {
  const board = boardOf(body.billboard), days = daysOf(body.duration);
  const { start, end } = await firstFree(sql, board.id, days, Date.now());
  const w = await wallet.walletOf(sql, me.id, false);
  const price = priceOf(board, days);
  return { quote: { billboard: board.id, place: board.place, category: board.category, size: { width: board.width, height: board.height }, start: new Date(start).toISOString(), end: new Date(end).toISOString(), ...price }, funds: { balance: w.balance, starter: w.starter, earned: w.earned, short: Math.max(0, price.total - w.earned) } };
}

async function mine(sql, me) {
  const rows = await sql.unsafe(`${ROW} where c.account_id = $1 order by c.created_at desc limit 100`, [me.id]);
  const art = await artOf(sql, rows.map((r) => r.id));
  return { campaigns: rows.map((r) => campaignView(r, art.get(r.id))) };
}

// What is showing now, on which billboard (anyone may look): only approved campaigns within their days.
async function board(sql) {
  const now = new Date().toISOString();
  const rows = await sql.unsafe(`select id, billboard_id from ${S}.ad_campaigns where status = 'approved' and start_at <= $1 and end_at > $1`, [now]);
  const art = await artOf(sql, rows.map((r) => r.id));
  return { campaigns: rows.map((r) => ({ id: r.id, billboard: r.billboard_id, art: (art.get(r.id) || []).map((a) => a.id), seconds: 8 })) };
}

// One picture: to anyone, while its campaign is approved and showing; otherwise only to its advertiser or an admin.
async function art(sql, me, body) {
  const id = uuid(body.id, 'a picture');
  const rows = await sql.unsafe(`select x.mime, x.data, c.account_id, c.status, c.start_at, c.end_at from ${S}.ad_art x join ${S}.ad_campaigns c on c.id = x.campaign_id where x.id = $1`, [id]);
  if (!rows.length) throw new ApiError(404, 'NO_ART', 'There is no such picture.');
  const r = rows[0], now = Date.now();
  const showing = r.status === 'approved' && new Date(r.start_at).getTime() <= now && new Date(r.end_at).getTime() > now;
  if (!showing && !(me && (me.id === r.account_id || me.admin))) throw new ApiError(404, 'NO_ART', 'There is no such picture.');
  return { mime: r.mime, data: Buffer.from(r.data).toString('base64') };
}

// ---- booking ----

async function lockedCampaign(tx, me, id) {
  const rows = await tx.unsafe(`select * from ${S}.ad_campaigns where id = $1 for update`, [id]);
  if (!rows.length || rows[0].account_id !== me.id) throw new ApiError(404, 'NO_CAMPAIGN', 'There is no such campaign of yours.');
  return rows[0];
}
const event = (tx, campaign, actor, action, note = '', meta = {}) => tx.unsafe(`insert into ${S}.ad_events (campaign_id, actor_id, action, note, meta) values ($1, $2, $3, $4, $5::text::jsonb)`, [campaign, actor, action, note, JSON.stringify(meta)]);

function linkOf(value) {
  const text = clean(value, 300);
  if (!text) throw new ApiError(400, 'LINK', 'Give the website or app store link for what is advertised.');
  let url;
  try { url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`); } catch (error) { throw new ApiError(400, 'LINK', 'That link cannot be read. Give it as it appears in a browser, for example https://example.com.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname)) throw new ApiError(400, 'LINK', 'That is not a website or app store link. Give it as it appears in a browser, for example https://example.com.');
  return url.toString();
}
function brandOf(value) {
  const text = clean(value, 60);
  if (text.length < 2) throw new ApiError(400, 'BRAND', 'Give the name of the brand or business advertised.');
  return text;
}

// A campaign begun: its billboard, length, brand and link. Asked twice with the same key, the same campaign.
async function draft(sql, me, body) {
  const key = clean(body.key, 64);
  if (!UUID.test(key)) throw new ApiError(400, 'BAD_REQUEST', 'That request cannot be read. Reload the page and try again.');
  const board = boardOf(body.billboard), days = daysOf(body.duration);
  const brand = brandOf(body.brand), link = linkOf(body.link);
  await allow(sql, `ad-draft:${me.id}`, 20, 3600);
  return sql.begin(async (tx) => {
    const before = await tx.unsafe(`select * from ${S}.ad_campaigns where account_id = $1 and idem_key = $2`, [me.id, key]);
    let row = before[0];
    if (row && row.status === 'draft') row = (await tx.unsafe(`update ${S}.ad_campaigns set billboard_id = $2, category = $3, days = $4, brand = $5, link = $6, fee_day = $7, tax_day = $8, fee = $9, tax = $10, total = $11 where id = $1 returning *`, [row.id, board.id, board.category, days, brand, link, ...Object.values((({ feeDay, taxDay, fee, tax, total }) => ({ feeDay, taxDay, fee, tax, total }))(priceOf(board, days)))]))[0];
    if (!row) {
      const p = priceOf(board, days);
      row = (await tx.unsafe(`insert into ${S}.ad_campaigns (account_id, idem_key, billboard_id, category, brand, link, days, fee_day, tax_day, fee, tax, total) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning *`, [me.id, key, board.id, board.category, brand, link, days, p.feeDay, p.taxDay, p.fee, p.tax, p.total]))[0];
      await event(tx, row.id, me.id, 'drafted', '', { billboard: board.id, days });
    }
    const art = await artOf(tx, [row.id]);
    return { campaign: campaignView(row, art.get(row.id)) };
  });
}

// One picture of a campaign still being made. Its kind, size and shape are checked here, from its own bytes.
async function upload(sql, me, body) {
  const id = uuid(body.campaign, 'a campaign');
  const index = Number(body.index);
  if (!Number.isInteger(index) || index < 0 || index >= ART.tvMax) throw new ApiError(400, 'ART', 'That is not a place for a picture.');
  if (typeof body.data !== 'string' || body.data.length > Math.ceil(ART.maxBytes / 3) * 4 + 8) throw new ApiError(413, 'ART_SIZE', `A picture may be ${(ART.maxBytes / 1e6).toFixed(1)} MB at most.`);
  const bytes = Buffer.from(body.data, 'base64');
  if (!bytes.length || bytes.length > ART.maxBytes) throw new ApiError(413, 'ART_SIZE', `A picture may be ${(ART.maxBytes / 1e6).toFixed(1)} MB at most.`);
  const pic = pictureOf(bytes);
  if (!pic || pic.animated) throw new ApiError(400, 'ART_TYPE', 'A picture must be a still PNG, JPEG or WebP image.');
  await allow(sql, `ad-art:${me.id}`, 80, 3600);
  return sql.begin(async (tx) => {
    const row = await lockedCampaign(tx, me, id);
    if (row.status !== 'draft') throw new ApiError(409, 'SUBMITTED', 'This campaign has been submitted: its pictures cannot be changed.');
    const board = boardOf(row.billboard_id);
    if (!board.tv && index !== 0) throw new ApiError(400, 'ART', 'A printed billboard takes one picture.');
    if (Math.min(pic.width, pic.height) < ART.minSide || Math.max(pic.width, pic.height) > ART.maxSide) throw new ApiError(400, 'ART_PIXELS', `A picture must be at least ${ART.minSide} pixels on its short side and at most ${ART.maxSide} on its long side. This one is ${pic.width} × ${pic.height}.`);
    const want = board.width / board.height, got = pic.width / pic.height;
    if (Math.abs(got / want - 1) > ART.aspectSlack) throw new ApiError(400, 'ART_SHAPE', `This billboard is ${board.width} m × ${board.height} m: a picture for it must be that shape (${pic.width} × ${pic.height} is not; for example ${Math.round(1200 * want)} × 1200 would be).`);
    const sha = crypto.createHash('sha256').update(bytes).digest('hex');
    const made = await tx.unsafe(`insert into ${S}.ad_art (campaign_id, idx, mime, width, height, bytes, sha256, data) values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (campaign_id, idx) do update set mime = excluded.mime, width = excluded.width, height = excluded.height, bytes = excluded.bytes, sha256 = excluded.sha256, data = excluded.data, created_at = now() returning id`, [id, index, pic.mime, pic.width, pic.height, bytes.length, sha, bytes]);
    return { art: { id: made[0].id, index, mime: pic.mime, width: pic.width, height: pic.height, bytes: bytes.length } };
  });
}

async function removeArt(sql, me, body) {
  const id = uuid(body.campaign, 'a campaign'), index = Number(body.index);
  return sql.begin(async (tx) => {
    const row = await lockedCampaign(tx, me, id);
    if (row.status !== 'draft') throw new ApiError(409, 'SUBMITTED', 'This campaign has been submitted: its pictures cannot be changed.');
    await tx.unsafe(`delete from ${S}.ad_art where campaign_id = $1 and idx = $2`, [id, index]);
    return { removed: index };
  });
}

// Submitted: the terms accepted, the pictures checked, the days found, the earned TR held, and it waits for review.
async function submit(sql, me, body) {
  const id = uuid(body.campaign, 'a campaign');
  if (body.terms !== TERMS_VERSION) throw new ApiError(409, 'TERMS', 'The advertising terms have changed. Read them again and accept them to submit.');
  if (body.accepted !== true) throw new ApiError(400, 'TERMS', 'Read and accept the advertising terms to submit.');
  if (body.rights !== true) throw new ApiError(400, 'RIGHTS', 'Confirm that you have the rights to this artwork and brand.');
  await allow(sql, `ad-submit:${me.id}`, 12, 86400);
  return sql.begin(async (tx) => {
    const row = await lockedCampaign(tx, me, id);
    if (row.status !== 'draft') { const art = await artOf(tx, [row.id]); return { campaign: campaignView(row, art.get(row.id)), replayed: true, ...(await wallet.after(tx, me.id)) }; }
    const board = boardOf(row.billboard_id);
    const art = (await artOf(tx, [row.id])).get(row.id) || [];
    if (board.tv) {
      const slides = art.map((a) => a.index).sort((a, b) => a - b);
      if (slides.length < ART.tvMin || slides.length > ART.tvMax) throw new ApiError(400, 'ART_COUNT', `A digital screen shows ${ART.tvMin} to ${ART.tvMax} slides. This campaign has ${slides.length}.`);
      if (slides.some((s, i) => s !== i)) throw new ApiError(400, 'ART_COUNT', 'The slides must be numbered from the first without a gap.');
    } else if (art.length !== 1 || art[0].index !== 0) throw new ApiError(400, 'ART_COUNT', 'A printed billboard takes one picture. Add it to submit.');
    // the days, with the billboard's row locked: nobody else can book the same days meanwhile
    await tx.unsafe(`select billboard_id from ${S}.ad_slots where billboard_id = $1 for update`, [board.id]);
    const now = Date.now();
    const { start, end } = await firstFree(tx, board.id, row.days, now, row.id);
    const p = priceOf(board, row.days);
    // earned TR only: not the arrival money, not TR taken from someone
    const w = await wallet.walletOf(tx, me.id, true);
    if (w.earned < p.total) {
      if (w.balance >= p.total) throw new ApiError(409, 'EARNED_FUNDS', `Advertising is paid for with TR you have earned. This campaign is ${trText(p.total)}; you have ${trText(w.earned)} of earned TR, ${trText(p.total - w.earned)} short. Starter TR cannot pay for advertising.`, { balance: w.balance, earned: w.earned, starter: w.starter, short: p.total - w.earned });
      throw new ApiError(409, 'FUNDS', `This campaign is ${trText(p.total)}; you have ${trText(w.earned)} of earned TR, ${trText(p.total - w.earned)} short.`, { balance: w.balance, earned: w.earned, short: p.total - w.earned });
    }
    const moved = await wallet.post(tx, { kind: 'ad-hold', actor: me.id, key: `ad-hold:${row.id}`, note: `Advertising held for review: ${board.place}`, meta: { campaign: row.id, billboard: board.id, fee: p.fee, tax: p.tax }, legs: [{ wallet: w.id, amount: -p.total, bucket: 'earned' }, { wallet: await wallet.systemWallet(tx, 'adhold'), amount: p.total }] });
    const done = (await tx.unsafe(`update ${S}.ad_campaigns set status = 'pending', start_at = $2, end_at = $3, fee_day = $4, tax_day = $5, fee = $6, tax = $7, total = $8, terms_version = $9, terms_at = now(), rights = true, submitted_at = now() where id = $1 and status = 'draft' returning *`, [row.id, new Date(start).toISOString(), new Date(end).toISOString(), p.feeDay, p.taxDay, p.fee, p.tax, p.total, TERMS_VERSION]))[0];
    await event(tx, row.id, me.id, 'submitted', '', { ref: moved.ref, total: p.total, start: done.start_at, end: done.end_at, terms: TERMS_VERSION });
    // (the review is in the game's own admin pages; no email is sent: the owner's choice)
    await event(tx, row.id, null, 'notification', 'Waiting in the admin review list. No email is sent (none is set up).');
    return { campaign: campaignView(done, art), ref: moved.ref, ...(await wallet.after(tx, me.id)) };
  });
}

// Given back while it waits: by its advertiser (cancel) or an admin (reject).
async function giveBack(tx, row, actor, action, note) {
  if (row.status !== 'pending') throw new ApiError(409, 'DECIDED', `This campaign has already been ${row.status === 'draft' ? 'left unsubmitted' : row.status}.`);
  const w = await wallet.walletOf(tx, row.account_id, false);
  const moved = await wallet.post(tx, { kind: 'ad-release', actor: row.account_id, key: `ad-release:${row.id}`, note: action === 'cancelled' ? 'Advertising cancelled: returned' : 'Advertising not approved: returned', meta: { campaign: row.id, billboard: row.billboard_id }, legs: [{ wallet: await wallet.systemWallet(tx, 'adhold'), amount: -Number(row.total) }, { wallet: w.id, amount: Number(row.total), bucket: 'earned' }] });
  const done = (await tx.unsafe(`update ${S}.ad_campaigns set status = $2, reviewer_id = $3, reviewed_at = now(), review_note = $4 where id = $1 and status = 'pending' returning *`, [row.id, action, action === 'rejected' ? actor : null, note]))[0];
  await event(tx, row.id, actor, action, note, { ref: moved.ref, returned: Number(row.total) });
  return done;
}

async function cancel(sql, me, body) {
  const id = uuid(body.campaign, 'a campaign');
  return sql.begin(async (tx) => {
    const row = await lockedCampaign(tx, me, id);
    if (row.status === 'draft') { await tx.unsafe(`update ${S}.ad_campaigns set status = 'cancelled' where id = $1`, [id]); await event(tx, id, me.id, 'cancelled', 'before it was submitted'); return { campaign: campaignView({ ...row, status: 'cancelled' }), ...(await wallet.after(tx, me.id)) }; }
    if (row.status === 'cancelled') return { campaign: campaignView(row), replayed: true, ...(await wallet.after(tx, me.id)) };
    const done = await giveBack(tx, row, me.id, 'cancelled', '');
    return { campaign: campaignView(done), ...(await wallet.after(tx, me.id)) };
  });
}

// ---- the review (administrators only) ----

const mustBeAdmin = (me) => { if (!me || !me.admin) throw new ApiError(403, 'NOT_ADMIN', 'Only an administrator can do that.'); };

async function adminList(sql, me, body) {
  mustBeAdmin(me);
  const status = ['draft', 'pending', 'approved', 'rejected', 'cancelled'].includes(body.status) ? body.status : null;
  const rows = await sql.unsafe(`${ROW} where ($1::text is null or c.status = $1) and c.status <> 'draft' order by (c.status = 'pending') desc, c.submitted_at desc nulls last limit 200`, [status]);
  const art = await artOf(sql, rows.map((r) => r.id));
  return { campaigns: rows.map((r) => campaignView(r, art.get(r.id), { admin: true })) };
}

async function decide(sql, me, body) {
  mustBeAdmin(me);
  const id = uuid(body.campaign, 'a campaign');
  const approve = body.approve === true;
  const note = clean(body.note, 400);
  if (!approve && note.length < 3) throw new ApiError(400, 'REASON', 'Say why it is not approved: the advertiser is shown this.');
  return sql.begin(async (tx) => {
    const rows = await tx.unsafe(`select * from ${S}.ad_campaigns where id = $1 for update`, [id]);
    if (!rows.length) throw new ApiError(404, 'NO_CAMPAIGN', 'There is no such campaign.');
    const row = rows[0];
    if (row.status !== 'pending') throw new ApiError(409, 'DECIDED', `This campaign has already been ${row.status}.`);
    if (!approve) { const done = await giveBack(tx, row, me.id, 'rejected', note); return { campaign: campaignView(done, null, { admin: true }) }; }
    const now = Date.now(), start = new Date(row.start_at).getTime(), end = new Date(row.end_at).getTime();
    if (now >= end) throw new ApiError(409, 'TOO_LATE', 'Its days have all gone by. It can only be not approved now, which returns the advertiser\'s TR.');
    // approved after its first day: the days already gone are given back, and it runs for the rest
    const lost = now > start ? Math.ceil((now - start) / DAY) : 0;
    const refund = lost * (Number(row.fee_day) + Number(row.tax_day));
    const fee = Number(row.fee) - lost * Number(row.fee_day), tax = Number(row.tax) - lost * Number(row.tax_day);
    const legs = [{ wallet: await wallet.systemWallet(tx, 'adhold'), amount: -Number(row.total) }];
    if (fee > 0) legs.push({ wallet: await wallet.systemWallet(tx, 'adverts'), amount: fee });
    if (tax > 0) legs.push({ wallet: await wallet.systemWallet(tx, 'adtax'), amount: tax });
    if (refund > 0) legs.push({ wallet: (await wallet.walletOf(tx, row.account_id, false)).id, amount: refund, bucket: 'earned' });
    const moved = await wallet.post(tx, { kind: 'ad-charge', actor: row.account_id, key: `ad-charge:${row.id}`, note: refund ? `Advertising approved (${lost} day${lost === 1 ? '' : 's'} already gone returned)` : 'Advertising approved', meta: { campaign: row.id, billboard: row.billboard_id, fee, tax, refund, reviewer: me.id }, legs });
    const done = (await tx.unsafe(`update ${S}.ad_campaigns set status = 'approved', reviewer_id = $2, reviewed_at = now(), review_note = $3, refunded = $4, start_at = greatest(start_at, now()) where id = $1 and status = 'pending' returning *`, [id, me.id, note, refund]))[0];
    await event(tx, id, me.id, 'approved', note, { ref: moved.ref, fee, tax, refund });
    return { campaign: campaignView(done, null, { admin: true }) };
  });
}

// What an administrator sees of the bank and the market: the taxes, the fees, every recent movement, the totals.
async function overview(sql, me) {
  mustBeAdmin(me);
  const sys = await sql.unsafe(`select code, balance from ${S}.wallets where kind = 'system'`);
  const bank = Object.fromEntries(sys.map((r) => [r.code, Number(r.balance)]));
  const totals = (await sql.unsafe(`select count(*)::int as wallets, coalesce(sum(balance), 0) as balance, coalesce(sum(starter), 0) as starter, coalesce(sum(illicit), 0) as illicit from ${S}.wallets where kind = 'player'`))[0];
  const accounts = (await sql.unsafe(`select count(*)::int as n, count(*) filter (where role = 'admin')::int as admins from ${S}.accounts`))[0];
  const campaigns = await sql.unsafe(`select status, count(*)::int as n, coalesce(sum(total), 0) as total from ${S}.ad_campaigns where status <> 'draft' group by status`);
  const recent = await sql.unsafe(
    `select t.ref, t.kind, t.note, t.at, a.username,
            (select coalesce(sum(e.amount), 0) from ${S}.wallet_entries e join ${S}.wallets w on w.id = e.wallet_id where e.tx_id = t.id and w.kind = 'player' and e.amount > 0) as credited,
            (select coalesce(sum(-e.amount), 0) from ${S}.wallet_entries e join ${S}.wallets w on w.id = e.wallet_id where e.tx_id = t.id and w.kind = 'player' and e.amount < 0) as debited
     from ${S}.wallet_tx t left join ${S}.accounts a on a.id = t.actor_id order by t.at desc limit 120`);
  const sales = await sql.unsafe(
    `select x.at, x.amount, s.name as what, b.username as buyer, coalesce(v.username, l.shop_name) as seller from ${S}.sales x join ${S}.assets s on s.id = x.asset_id join ${S}.accounts b on b.id = x.buyer_id join ${S}.listings l on l.id = x.listing_id left join ${S}.accounts v on v.id = x.seller_id order by x.at desc limit 60`);
  const taxLines = await sql.unsafe(
    `select t.ref, t.at, e.amount, t.meta->>'billboard' as billboard, a.username from ${S}.wallet_entries e join ${S}.wallet_tx t on t.id = e.tx_id left join ${S}.accounts a on a.id = t.actor_id where e.wallet_id = (select id from ${S}.wallets where code = 'adtax') order by e.id desc limit 60`);
  const events = await sql.unsafe(`select ev.at, ev.action, ev.note, ev.campaign_id, a.username as actor from ${S}.ad_events ev left join ${S}.accounts a on a.id = ev.actor_id order by ev.id desc limit 80`);
  const upgrades = await sql.unsafe(`select at, fee, from_figure, to_figure, (select username from ${S}.accounts where id = account_id) as username from ${S}.character_changes order by at desc limit 30`).catch(() => []);
  const problems = await wallet.audit(sql);
  return {
    bank: { adTax: bank.adtax || 0, adFees: bank.adverts || 0, adHeld: bank.adhold || 0, offersHeld: bank.escrow || 0, issued: -(bank.issuance || 0), world: bank.world || 0 },
    players: { accounts: accounts.n, admins: accounts.admins, wallets: totals.wallets, balance: Number(totals.balance), starter: Number(totals.starter), illicit: Number(totals.illicit), earned: Number(totals.balance) - Number(totals.starter) - Number(totals.illicit) },
    campaigns: Object.fromEntries(campaigns.map((r) => [r.status, { count: r.n, total: Number(r.total) }])),
    recent: recent.map((r) => ({ ref: r.ref, kind: r.kind, note: r.note, at: r.at, who: r.username, credited: Number(r.credited), debited: Number(r.debited) })),
    sales: sales.map((r) => ({ at: r.at, amount: Number(r.amount), what: r.what, buyer: r.buyer, seller: r.seller })),
    tax: taxLines.map((r) => ({ ref: r.ref, at: r.at, amount: Number(r.amount), billboard: r.billboard, advertiser: r.username })),
    events: events.map((r) => ({ at: r.at, action: r.action, note: r.note, campaign: r.campaign_id, actor: r.actor })),
    upgrades: upgrades.map((r) => ({ at: r.at, fee: Number(r.fee), from: r.from_figure, to: r.to_figure, who: r.username })),
    audit: problems,
  };
}

// The books of advertising: what 'adhold' holds is exactly what waiting campaigns are owed.
async function audit(sql) {
  const problems = [];
  const held = Number((await sql.unsafe(`select balance from ${S}.wallets where code = 'adhold'`))[0].balance);
  const owed = Number((await sql.unsafe(`select coalesce(sum(total), 0) as owed from ${S}.ad_campaigns where status = 'pending'`))[0].owed);
  if (held !== owed) problems.push(`${held} is held for advertising and waiting campaigns account for ${owed}`);
  const fees = Number((await sql.unsafe(`select balance from ${S}.wallets where code = 'adverts'`))[0].balance);
  const tax = Number((await sql.unsafe(`select balance from ${S}.wallets where code = 'adtax'`))[0].balance);
  const charged = (await sql.unsafe(`select coalesce(sum(fee - refunded * fee_day / (fee_day + tax_day)), 0) as fee, coalesce(sum(tax - refunded * tax_day / (fee_day + tax_day)), 0) as tax from ${S}.ad_campaigns where status = 'approved'`))[0];
  if (fees !== Number(charged.fee) || tax !== Number(charged.tax)) problems.push(`advertising took ${fees} in fees and ${tax} in tax; approved campaigns account for ${charged.fee} and ${charged.tax}`);
  return problems;
}

module.exports = { catalog, quote, mine, board, art, draft, upload, removeArt, submit, cancel, adminList, decide, overview, audit, pictureOf, priceOf, earliestStart, PRICES, DURATIONS, TERMS_VERSION, ART, BILLBOARDS };
