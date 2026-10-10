'use strict';
// The market: what is for sale, who owns what, the talk between a buyer and a seller, and the sale itself.
//
// This is the one place a thing changes hands. A sale is a single transaction in the database: the listing is
// locked, the item is given its new owner, the stock goes down, the offer is marked accepted and the sale is
// written, all together or not at all. Two buyers pressing Buy on the last item at the same moment are served
// one after the other, and the second finds it gone.
//
// Money. The TR itself is kept by each player's own game, as all the game's money is today (there is no shared
// world server yet). So a sale here records what is owed: `sales` says the buyer's game must pay this much and
// the seller's game must be given it, and each game does that exactly once and says so with its next save
// (buyer_paid_rev, seller_credited_rev). The buyer's game sets the money aside before it makes an offer, so an
// accepted offer is always paid from money that was really there.

const { ApiError } = require('./http.js');
const { allow } = require('./auth.js');
const { SCHEMA: S } = require('./schema.js');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_PRICE = 2_000_000_000;         // ledger units: a thousand million TR
const REACH = 18;                        // metres from a listing's marker within which a buyer may begin talking
const TR = 2;                            // ledger units in one TR
const trText = (units) => `${(Number(units) / TR).toLocaleString('en-GB', { maximumFractionDigits: 1 })} TR`;

const uuid = (value, what) => { if (typeof value !== 'string' || !UUID.test(value)) throw new ApiError(400, 'BAD_REQUEST', `That is not ${what}.`); return value; };
const amountOf = (value) => { if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_PRICE) throw new ApiError(400, 'AMOUNT', 'That is not an amount the market takes.'); return value; };
// What a person typed, with nothing in it that is not text.
const cleanText = (value, most) => (typeof value === 'string' ? value : '').replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, most);
const num = (value) => (value === null || value === undefined ? null : Number(value));

function placeOf(body) {
  const p = body && typeof body === 'object' ? body : {};
  const x = Number(p.x), z = Number(p.z);
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > 5000 || Math.abs(z) > 5000) throw new ApiError(400, 'PLACE', 'That is not a place in town.');
  return { x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, label: cleanText(p.label, 60) || 'In town' };
}
const zoneOf = (value) => { const zone = cleanText(value, 24); if (!/^[A-Z0-9-]{3,24}$/.test(zone)) throw new ApiError(400, 'PLACE', 'That is not a town.'); return zone; };

const itemName = (row) => (row.serial ? `${row.asset_name} No. ${row.serial} of ${row.edition}` : row.asset_name);

const LISTING = `
  select l.id, l.kind, l.asset_id, l.seller_id, l.shop, l.shop_name, l.holding_id, l.price, l.stock, l.sold, l.status, l.zone, l.place_x, l.place_z, l.place_label, l.created_at,
         a.name as asset_name, a.category, a.model, a.blurb, a.keywords, s.username as seller_name, h.serial, h.edition
  from ${S}.listings l
  join ${S}.assets a on a.id = l.asset_id
  left join ${S}.accounts s on s.id = l.seller_id
  left join ${S}.holdings h on h.id = l.holding_id`;

// A listing as the page is given it.
function listingView(row, me) {
  return {
    id: row.id, kind: row.kind, status: row.status,
    asset: { id: row.asset_id, name: row.asset_name, category: row.category, model: row.model, blurb: row.blurb },
    name: itemName(row),
    price: num(row.price), stock: row.stock, left: row.stock - row.sold,
    seller: row.kind === 'primary' ? row.shop_name : row.seller_name,
    shop: row.shop || null,
    automatic: row.kind === 'primary',
    mine: !!me && row.seller_id === me.id,
    place: { zone: row.zone, x: Number(row.place_x), z: Number(row.place_z), label: row.place_label },
  };
}

// ---- looking ----

// What is for sale. Anyone may look; `q` narrows it to listings whose name, kind, keywords or seller hold every word.
async function list(sql, me, body) {
  const words = cleanText(body.q, 60).toLowerCase().split(' ').filter(Boolean).slice(0, 5);
  const params = [];
  let where = `l.status = 'open'`;
  for (const word of words) {
    // "cars" finds "car", "watches" finds "watch": a plural is looked for in the singular too
    const stem = word.length > 3 ? word.replace(/(es|s)$/, '') : word;
    params.push(`%${stem.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    where += ` and (a.name || ' ' || a.category || ' ' || a.keywords || ' ' || coalesce(l.shop_name, '') || ' ' || coalesce(s.username, '') || ' ' || l.place_label) ilike $${params.length}`;
  }
  const rows = await sql.unsafe(`${LISTING} where ${where} order by l.kind, l.created_at limit 60`, params);
  return { listings: rows.map((row) => listingView(row, me)) };
}

// Everything of the market that is this player's own.
async function mine(sql, me) {
  const holdings = await sql.unsafe(
    `select h.id, h.asset_id, a.name as asset_name, a.category, a.model, a.blurb, h.serial, h.edition, h.acquired_at,
            l.id as listing_id, l.price as listing_price,
            (select amount from ${S}.sales x where x.holding_id = h.id and x.buyer_id = h.owner_id order by x.at desc limit 1) as paid
     from ${S}.holdings h join ${S}.assets a on a.id = h.asset_id
     left join ${S}.listings l on l.holding_id = h.id and l.status = 'open'
     where h.owner_id = $1 order by h.acquired_at desc limit 200`, [me.id]);
  const threads = await sql.unsafe(
    `select t.id, t.buyer_id, t.seller_id, t.last_at, l.id as listing_id, l.kind, l.status, l.shop_name, l.price,
            a.name as asset_name, h.serial, h.edition, b.username as buyer_name, s.username as seller_name,
            (select count(*) from ${S}.messages m where m.thread_id = t.id and m.sender_id is distinct from $1 and m.id > (case when t.buyer_id = $1 then t.buyer_read else t.seller_read end))::int as unread,
            (select body from ${S}.messages m where m.thread_id = t.id order by m.id desc limit 1) as last_body,
            (select kind from ${S}.messages m where m.thread_id = t.id order by m.id desc limit 1) as last_kind,
            (select amount from ${S}.messages m where m.thread_id = t.id order by m.id desc limit 1) as last_amount,
            o.id as offer_id, o.amount as offer_amount
     from ${S}.threads t
     join ${S}.listings l on l.id = t.listing_id
     join ${S}.assets a on a.id = l.asset_id
     left join ${S}.holdings h on h.id = l.holding_id
     join ${S}.accounts b on b.id = t.buyer_id
     left join ${S}.accounts s on s.id = t.seller_id
     left join ${S}.offers o on o.thread_id = t.id and o.status = 'pending'
     where t.buyer_id = $1 or t.seller_id = $1
     order by t.last_at desc limit 60`, [me.id]);
  const history = await sql.unsafe(
    `select x.id, x.amount, x.at, x.buyer_id, x.seller_id, a.name as asset_name, h.serial, h.edition, b.username as buyer_name, s.username as seller_name, l.shop_name
     from ${S}.sales x join ${S}.assets a on a.id = x.asset_id join ${S}.holdings h on h.id = x.holding_id join ${S}.listings l on l.id = x.listing_id
     join ${S}.accounts b on b.id = x.buyer_id left join ${S}.accounts s on s.id = x.seller_id
     where x.buyer_id = $1 or x.seller_id = $1 order by x.at desc limit 60`, [me.id]);
  return {
    holdings: holdings.map((row) => ({ id: row.id, asset: { id: row.asset_id, name: row.asset_name, category: row.category, model: row.model, blurb: row.blurb }, name: itemName(row), serial: row.serial, edition: row.edition, acquiredAt: row.acquired_at, paid: num(row.paid), listing: row.listing_id ? { id: row.listing_id, price: num(row.listing_price) } : null })),
    threads: threads.map((row) => ({
      id: row.id, role: row.buyer_id === me.id ? 'buyer' : 'seller', listing: row.listing_id, open: row.status === 'open', automatic: row.kind === 'primary',
      name: itemName(row), price: num(row.price), other: row.buyer_id === me.id ? (row.kind === 'primary' ? row.shop_name : row.seller_name) : row.buyer_name,
      unread: row.unread, last: { kind: row.last_kind, body: row.last_body, amount: num(row.last_amount) }, lastAt: row.last_at,
      offer: row.offer_id ? { id: row.offer_id, amount: num(row.offer_amount) } : null,
    })),
    history: history.map((row) => ({ id: row.id, name: itemName(row), amount: num(row.amount), at: row.at, side: row.buyer_id === me.id ? 'bought' : 'sold', other: row.buyer_id === me.id ? (row.seller_name || row.shop_name) : row.buyer_name })),
    ...(await dues(sql, me)),
  };
}

// What this player's own game still has to pay and be paid for sales that have happened.
async function dues(sql, me) {
  const rows = await sql.unsafe(
    `select x.id, x.offer_id, x.amount, x.buyer_id, x.seller_id, x.buyer_paid_rev, x.seller_credited_rev, a.name as asset_name, h.serial, h.edition
     from ${S}.sales x join ${S}.assets a on a.id = x.asset_id join ${S}.holdings h on h.id = x.holding_id
     where (x.buyer_id = $1 and x.buyer_paid_rev is null) or (x.seller_id = $1 and x.seller_credited_rev is null)
     order by x.at limit 100`, [me.id]);
  const debits = [], credits = [];
  for (const row of rows) {
    if (row.buyer_id === me.id && row.buyer_paid_rev === null) debits.push({ sale: row.id, offer: row.offer_id, amount: num(row.amount), what: itemName(row) });
    if (row.seller_id === me.id && row.seller_credited_rev === null) credits.push({ sale: row.id, amount: num(row.amount), what: itemName(row) });
  }
  return { debits, credits };
}

// What the player's game asks every little while: how its offers stand, what it owes and is owed, and whether
// anything is waiting to be read or answered.
async function sync(sql, me, body) {
  const ids = (Array.isArray(body.offers) ? body.offers : []).filter((id) => typeof id === 'string' && UUID.test(id)).slice(0, 60);
  const offers = {};
  for (const id of ids) offers[id] = 'unknown';
  if (ids.length) {
    const rows = await sql.unsafe(`select id, status from ${S}.offers where buyer_id = $1 and id in (select value::uuid from jsonb_array_elements_text($2::text::jsonb))`, [me.id, JSON.stringify(ids)]);
    for (const row of rows) offers[row.id] = row.status;
  }
  const waiting = await sql.unsafe(
    `select
       (select count(*) from ${S}.messages m join ${S}.threads t on t.id = m.thread_id
         where (t.buyer_id = $1 or t.seller_id = $1) and m.sender_id is distinct from $1 and m.id > (case when t.buyer_id = $1 then t.buyer_read else t.seller_read end))::int as unread,
       (select count(*) from ${S}.offers o join ${S}.threads t on t.id = o.thread_id where t.seller_id = $1 and o.status = 'pending')::int as to_decide`, [me.id]);
  return { offers, unread: waiting[0].unread, toDecide: waiting[0].to_decide, ...(await dues(sql, me)) };
}

// ---- talking ----

async function threadFor(sql, me, threadId, lock) {
  const rows = await sql.unsafe(`select t.* from ${S}.threads t where t.id = $1 and (t.buyer_id = $2 or t.seller_id = $2)${lock ? ' for update' : ''}`, [threadId, me.id]);
  if (!rows.length) throw new ApiError(404, 'NO_THREAD', 'That conversation is not yours.');
  return rows[0];
}

const say = (sql, threadId, senderId, kind, body, amount, offerId) => sql.unsafe(
  `with m as (insert into ${S}.messages (thread_id, sender_id, kind, body, amount, offer_id) values ($1, $2, $3, $4, $5, $6) returning id)
   update ${S}.threads set last_at = now() where id = $1`, [threadId, senderId, kind, body, amount === undefined ? null : amount, offerId || null]);

// The whole of one conversation from `after` on, as this player sees it.
async function threadView(sql, me, thread, after) {
  const listing = (await sql.unsafe(`${LISTING} where l.id = $1`, [thread.listing_id]))[0];
  const role = thread.buyer_id === me.id ? 'buyer' : 'seller';
  const messages = await sql.unsafe(`select id, sender_id, kind, body, amount, offer_id, at from ${S}.messages where thread_id = $1 and id > $2 order by id limit 300`, [thread.id, Number.isSafeInteger(after) && after > 0 ? after : 0]);
  const pending = await sql.unsafe(`select id, amount, created_at from ${S}.offers where thread_id = $1 and status = 'pending'`, [thread.id]);
  const other = role === 'buyer' ? (listing.kind === 'primary' ? listing.shop_name : listing.seller_name) : (await sql.unsafe(`select username from ${S}.accounts where id = $1`, [thread.buyer_id]))[0].username;
  if (messages.length) {
    const last = Number(messages[messages.length - 1].id);
    await sql.unsafe(`update ${S}.threads set ${role === 'buyer' ? 'buyer_read' : 'seller_read'} = greatest(${role === 'buyer' ? 'buyer_read' : 'seller_read'}, $2) where id = $1`, [thread.id, last]);
  }
  return {
    thread: { id: thread.id, role, other, automatic: listing.kind === 'primary', listing: listingView(listing, me), offer: pending.length ? { id: pending[0].id, amount: num(pending[0].amount) } : null },
    messages: messages.map((m) => ({ id: Number(m.id), from: m.sender_id === null ? 'shop' : m.sender_id === me.id ? 'me' : 'them', kind: m.kind, body: m.body, amount: num(m.amount), offer: m.offer_id, at: m.at })),
  };
}

// A buyer steps into a listing's marker: the conversation begins, or is taken up where it was left.
async function open(sql, me, body) {
  const listingId = uuid(body.listing, 'a listing');
  const result = await sql.begin(async (tx) => {
    const rows = await tx.unsafe(`${LISTING} where l.id = $1`, [listingId]);
    if (!rows.length) throw new ApiError(404, 'NO_LISTING', 'That is no longer for sale.');
    const listing = rows[0];
    if (listing.seller_id === me.id) throw new ApiError(400, 'OWN', 'This is your own listing. Buyers who come here will write to you.');
    let thread = (await tx.unsafe(`select * from ${S}.threads where listing_id = $1 and buyer_id = $2`, [listingId, me.id]))[0];
    if (!thread) {
      if (listing.status !== 'open') throw new ApiError(409, 'GONE', 'That is no longer for sale.');
      // a conversation begins at the seller's door, not from across town
      const at = body.at && typeof body.at === 'object' ? body.at : {};
      const far = Math.hypot(Number(at.x) - Number(listing.place_x), Number(at.z) - Number(listing.place_z));
      if (!(far <= REACH)) throw new ApiError(403, 'TOO_FAR', `Go to ${listing.place_label} to talk to the seller.`);
      await allow(tx, `threads:${me.id}`, 30, 3600);
      thread = (await tx.unsafe(`insert into ${S}.threads (listing_id, buyer_id, seller_id) values ($1, $2, $3) on conflict (listing_id, buyer_id) do update set last_at = now() returning *`, [listingId, me.id, listing.seller_id]))[0];
      if (listing.kind === 'primary') await say(tx, thread.id, null, 'attendant', `Welcome to ${listing.shop_name}. The ${listing.asset_name} is ${trText(listing.price)}. ${leftText(listing)}`);
    }
    return threadView(tx, me, thread, 0);
  });
  return result;
}

const leftText = (listing) => { const left = listing.stock - listing.sold; return left <= 0 ? 'They are all sold.' : `${left} of ${listing.stock} ${left === 1 ? 'is' : 'are'} left.`; };

async function read(sql, me, body) {
  const thread = await threadFor(sql, me, uuid(body.thread, 'a conversation'), false);
  return threadView(sql, me, thread, Number(body.after));
}

// What the shop's attendant says to something typed. It is a machine and says so; it knows the price and the
// stock and nothing else, and it never bargains: a shop's price is the price.
function attendantReply(listing, text, alreadyExplained) {
  const price = Number(listing.price);
  const figure = (text.match(/\d[\d,]*(?:\.\d+)?/) || [''])[0].replace(/,/g, '');
  if (listing.status !== 'open' || listing.sold >= listing.stock) return `The ${listing.asset_name} is sold out.`;
  if (figure) { const offered = Math.round(Number(figure) * TR); return offered < price ? `The price is ${trText(price)}. It is not reduced.` : `It is ${trText(price)}. Press Buy to pay.`; }
  if (/\b(how many|left|stock|remain|available|quantity)\b/i.test(text)) return leftText(listing);
  if (/\b(price|cost|how much|pay|buy)\b/i.test(text)) return `The ${listing.asset_name} is ${trText(price)}. Press Buy to pay.`;
  return alreadyExplained ? null : `I am this shop's attendant: a machine, not a person. I can tell you the price and how many are left, and take your payment. The ${listing.asset_name} is ${trText(price)}.`;
}

async function write(sql, me, body) {
  const text = cleanText(body.text, 400);
  if (!text) throw new ApiError(400, 'EMPTY', 'There is nothing to send.');
  const threadId = uuid(body.thread, 'a conversation');
  await allow(sql, `say:${me.id}`, 40, 60);
  return sql.begin(async (tx) => {
    const thread = await threadFor(tx, me, threadId, true);
    await say(tx, thread.id, me.id, 'text', text);
    if (thread.seller_id === null) {
      const listing = (await tx.unsafe(`${LISTING} where l.id = $1`, [thread.listing_id]))[0];
      const explained = (await tx.unsafe(`select 1 from ${S}.messages where thread_id = $1 and kind = 'attendant' and body like 'I am this shop''s attendant%' limit 1`, [thread.id])).length > 0;
      const reply = attendantReply(listing, text, explained);
      if (reply) await say(tx, thread.id, null, 'attendant', reply);
    }
    return threadView(tx, me, thread, Number(body.after));
  });
}

// ---- buying and selling ----

// The sale. Called with the listing's row locked. Gives { sold, sale } or declines the offer and says why.
async function settle(tx, listing, offer, thread, amount) {
  const decline = async (why) => {
    await tx.unsafe(`update ${S}.offers set status = 'declined', decided_at = now() where id = $1 and status = 'pending'`, [offer.id]);
    await say(tx, thread.id, null, 'declined', why, num(offer.amount), offer.id);
    return { sold: false, reason: why };
  };
  if (listing.status !== 'open' || listing.sold >= listing.stock) return decline('It has been sold.');
  let holdingId, serial = null, edition = null;
  if (listing.kind === 'primary') {
    serial = listing.sold + 1; edition = listing.stock;
    holdingId = (await tx.unsafe(`insert into ${S}.holdings (asset_id, owner_id, serial, edition, origin_listing) values ($1, $2, $3, $4, $5) returning id`, [listing.asset_id, offer.buyer_id, serial, edition, listing.id]))[0].id;
  } else {
    const moved = await tx.unsafe(`update ${S}.holdings set owner_id = $1, acquired_at = now() where id = $2 and owner_id = $3 returning id, serial, edition`, [offer.buyer_id, listing.holding_id, listing.seller_id]);
    if (!moved.length) {
      await tx.unsafe(`update ${S}.listings set status = 'closed', closed_at = now() where id = $1`, [listing.id]);
      return decline('The seller no longer has it.');
    }
    holdingId = moved[0].id; serial = moved[0].serial; edition = moved[0].edition;
  }
  const gone = listing.sold + 1 >= listing.stock;
  await tx.unsafe(`update ${S}.listings set sold = sold + 1, status = $2, closed_at = case when $2 = 'sold' then now() else null end where id = $1`, [listing.id, gone ? 'sold' : 'open']);
  const took = await tx.unsafe(`update ${S}.offers set status = 'accepted', decided_at = now() where id = $1 and status = 'pending' returning id`, [offer.id]);
  if (!took.length) throw new ApiError(409, 'DECIDED', 'That offer has already been answered.');
  const sale = (await tx.unsafe(`insert into ${S}.sales (offer_id, listing_id, asset_id, holding_id, buyer_id, seller_id, amount) values ($1, $2, $3, $4, $5, $6, $7) returning id, at`, [offer.id, listing.id, listing.asset_id, holdingId, offer.buyer_id, listing.seller_id, amount]))[0];
  const name = serial ? `${listing.asset_name} No. ${serial} of ${edition}` : listing.asset_name;
  await say(tx, thread.id, null, 'accepted', `Sold: ${name}, for ${trText(amount)}.`, amount, offer.id);
  if (gone) {
    // anyone else who was offering for it is told, and their money is theirs again
    const others = await tx.unsafe(`update ${S}.offers set status = 'declined', decided_at = now() where listing_id = $1 and status = 'pending' returning id, thread_id, amount`, [listing.id]);
    for (const other of others) await say(tx, other.thread_id, null, 'declined', 'It has been sold to another buyer.', num(other.amount), other.id);
  }
  return { sold: true, sale: { id: sale.id, offer: offer.id, amount, what: name, holding: holdingId } };
}

const lockedListing = async (tx, id) => {
  const locked = await tx.unsafe(`select id from ${S}.listings where id = $1 for update`, [id]);
  if (!locked.length) throw new ApiError(404, 'NO_LISTING', 'That is no longer for sale.');
  return (await tx.unsafe(`${LISTING} where l.id = $1`, [id]))[0];
};

// A buyer offers a price. At a shop the price is the price: an offer of at least that much buys it there and
// then, for the shop's price and no more; a lower one is refused. From another player, the offer waits for them.
async function offer(sql, me, body) {
  const offerId = uuid(body.offer, 'an offer');
  const threadId = uuid(body.thread, 'a conversation');
  const amount = amountOf(body.amount);
  await allow(sql, `offer:${me.id}`, 20, 60);
  return sql.begin(async (tx) => {
    const thread = await threadFor(tx, me, threadId, true);
    if (thread.buyer_id !== me.id) throw new ApiError(403, 'NOT_BUYER', 'Only the buyer makes an offer.');
    // asked twice (a poor connection): the offer made the first time is the answer
    const before = await tx.unsafe(`select id, buyer_id, status, amount from ${S}.offers where id = $1`, [offerId]);
    if (before.length) {
      if (before[0].buyer_id !== me.id) throw new ApiError(409, 'OFFER', 'That offer cannot be made.');
      const sale = (await tx.unsafe(`select id, amount from ${S}.sales where offer_id = $1`, [offerId]))[0];
      return { offer: { id: offerId, status: before[0].status, amount: num(before[0].amount) }, sale: sale ? { id: sale.id, offer: offerId, amount: num(sale.amount) } : null, ...(await threadView(tx, me, thread, Number(body.after))) };
    }
    const listing = await lockedListing(tx, thread.listing_id);
    if (listing.status !== 'open') throw new ApiError(409, 'GONE', 'That is no longer for sale.');
    if ((await tx.unsafe(`select 1 from ${S}.offers where thread_id = $1 and status = 'pending'`, [thread.id])).length) throw new ApiError(409, 'PENDING', 'You have an offer waiting for an answer. Withdraw it to make another.');
    const made = { id: offerId, buyer_id: me.id, amount };
    await tx.unsafe(`insert into ${S}.offers (id, thread_id, listing_id, buyer_id, amount, status) values ($1, $2, $3, $4, $5, 'pending')`, [offerId, thread.id, listing.id, me.id, amount]);
    await say(tx, thread.id, me.id, 'offer', '', amount, offerId);
    let outcome = { sold: false }, status = 'pending';
    if (listing.kind === 'primary') {
      const price = Number(listing.price);
      if (amount >= price) outcome = await settle(tx, listing, made, thread, price);
      else {
        await tx.unsafe(`update ${S}.offers set status = 'declined', decided_at = now() where id = $1`, [offerId]);
        await say(tx, thread.id, null, 'declined', `The price is ${trText(price)}. It is not reduced.`, amount, offerId);
      }
      status = outcome.sold ? 'accepted' : 'declined';
    }
    return { offer: { id: offerId, status, amount }, sale: outcome.sold ? outcome.sale : null, ...(await threadView(tx, me, thread, Number(body.after))) };
  });
}

// The buyer takes an offer back before it is answered.
async function withdraw(sql, me, body) {
  const offerId = uuid(body.offer, 'an offer');
  return sql.begin(async (tx) => {
    const rows = await tx.unsafe(`select o.id, o.thread_id, o.amount, o.status from ${S}.offers o where o.id = $1 and o.buyer_id = $2 for update`, [offerId, me.id]);
    if (!rows.length) {
      // nothing reached the market under that number: remember it as void, so that it never can
      await tx.unsafe(`insert into ${S}.offers (id, buyer_id, amount, status, decided_at) values ($1, $2, 0, 'void', now()) on conflict (id) do nothing`, [offerId, me.id]);
      const now = await tx.unsafe(`select status, buyer_id from ${S}.offers where id = $1`, [offerId]);
      return { offer: { id: offerId, status: now.length && now[0].buyer_id === me.id ? now[0].status : 'void' } };
    }
    const found = rows[0];
    if (found.status === 'pending') {
      await tx.unsafe(`update ${S}.offers set status = 'withdrawn', decided_at = now() where id = $1`, [offerId]);
      await say(tx, found.thread_id, me.id, 'withdrawn', '', num(found.amount), offerId);
      return { offer: { id: offerId, status: 'withdrawn' } };
    }
    return { offer: { id: offerId, status: found.status } };
  });
}

// The seller answers an offer. Yes is the sale.
async function decide(sql, me, body) {
  const offerId = uuid(body.offer, 'an offer');
  const accept = body.accept === true;
  return sql.begin(async (tx) => {
    const found = (await tx.unsafe(`select o.id, o.thread_id, o.listing_id, o.buyer_id, o.amount, o.status from ${S}.offers o join ${S}.threads t on t.id = o.thread_id where o.id = $1 and t.seller_id = $2`, [offerId, me.id]))[0];
    if (!found) throw new ApiError(404, 'NO_OFFER', 'That offer is not yours to answer.');
    const listing = await lockedListing(tx, found.listing_id);
    const thread = await threadFor(tx, me, found.thread_id, true);
    // read again now that the listing is ours alone: the buyer may have withdrawn in the meantime
    const now = (await tx.unsafe(`select status, amount from ${S}.offers where id = $1 for update`, [offerId]))[0];
    if (now.status !== 'pending') throw new ApiError(409, 'DECIDED', now.status === 'withdrawn' ? 'The buyer has withdrawn that offer.' : 'That offer has already been answered.');
    const amount = Number(now.amount);
    if (accept && body.amount !== undefined && Number(body.amount) !== amount) throw new ApiError(409, 'CHANGED', 'The offer is not the one you were shown. Look again.');
    let outcome = { sold: false };
    if (accept) outcome = await settle(tx, listing, { id: offerId, buyer_id: found.buyer_id, amount }, thread, amount);
    else {
      await tx.unsafe(`update ${S}.offers set status = 'declined', decided_at = now() where id = $1`, [offerId]);
      await say(tx, thread.id, me.id, 'declined', '', amount, offerId);
    }
    return { offer: { id: offerId, status: outcome.sold ? 'accepted' : 'declined' }, sale: outcome.sold ? outcome.sale : null, ...(await threadView(tx, me, thread, Number(body.after))) };
  });
}

// An owner puts one of their things up for sale, at a place in town where buyers will find the marker.
async function sell(sql, me, body) {
  const holdingId = uuid(body.holding, 'something you own');
  const price = amountOf(body.price);
  const place = placeOf(body.place);
  const zone = zoneOf(body.zone);
  await allow(sql, `sell:${me.id}`, 20, 3600);
  return sql.begin(async (tx) => {
    const own = await tx.unsafe(`select id, asset_id from ${S}.holdings where id = $1 and owner_id = $2 for update`, [holdingId, me.id]);
    if (!own.length) throw new ApiError(404, 'NOT_YOURS', 'That is not yours to sell.');
    if ((await tx.unsafe(`select 1 from ${S}.listings where holding_id = $1 and status = 'open'`, [holdingId])).length) throw new ApiError(409, 'LISTED', 'It is already for sale.');
    const made = await tx.unsafe(
      `insert into ${S}.listings (asset_id, kind, seller_id, holding_id, price, stock, zone, place_x, place_z, place_label, created_by) values ($1, 'resale', $2, $3, $4, 1, $5, $6, $7, $8, $2) returning id`,
      [own[0].asset_id, me.id, holdingId, price, zone, place.x, place.z, place.label]);
    return { listing: listingView((await tx.unsafe(`${LISTING} where l.id = $1`, [made[0].id]))[0], me) };
  });
}

// A listing is taken down by whoever put it up (or, a shop's, by an administrator). Offers waiting on it are refused.
async function unlist(sql, me, body) {
  const listingId = uuid(body.listing, 'a listing');
  return sql.begin(async (tx) => {
    const listing = await lockedListing(tx, listingId);
    const may = listing.kind === 'primary' ? me.admin : listing.seller_id === me.id;
    if (!may) throw new ApiError(403, 'NOT_YOURS', 'That listing is not yours.');
    if (listing.status !== 'open') return { listing: listingView(listing, me) };
    await tx.unsafe(`update ${S}.listings set status = 'closed', closed_at = now() where id = $1`, [listingId]);
    const waiting = await tx.unsafe(`update ${S}.offers set status = 'declined', decided_at = now() where listing_id = $1 and status = 'pending' returning id, thread_id, amount`, [listingId]);
    for (const o of waiting) await say(tx, o.thread_id, null, 'declined', 'It is no longer for sale.', num(o.amount), o.id);
    return { listing: listingView((await tx.unsafe(`${LISTING} where l.id = $1`, [listingId]))[0], me) };
  });
}

// ---- the administrator's part: only they put new things into the market ----

async function adminAssets(sql, me) {
  if (!me.admin) throw new ApiError(403, 'NOT_ADMIN', 'Only an administrator does that.');
  const rows = await sql.unsafe(`select id, name, category, model, blurb from ${S}.assets order by name`);
  return { assets: rows };
}

async function adminList(sql, me, body) {
  if (!me.admin) throw new ApiError(403, 'NOT_ADMIN', 'Only an administrator does that.');
  const assetId = cleanText(body.asset, 60);
  const price = amountOf(body.price);
  const stock = Number(body.stock);
  if (!Number.isInteger(stock) || stock < 1 || stock > 100000) throw new ApiError(400, 'STOCK', 'How many are for sale: a whole number, at least one.');
  const place = placeOf(body.place);
  const zone = zoneOf(body.zone);
  const shopName = cleanText(body.shopName, 40);
  const shop = cleanText(body.shop, 24).toLowerCase().replace(/[^a-z0-9-]/g, '') || 'government';
  if (!shopName) throw new ApiError(400, 'SHOP', 'Name the shop that sells it.');
  if (!(await sql.unsafe(`select 1 from ${S}.assets where id = $1`, [assetId])).length) throw new ApiError(404, 'NO_ASSET', 'There is no such thing in the catalogue.');
  const made = await sql.unsafe(
    `insert into ${S}.listings (asset_id, kind, shop, shop_name, price, stock, zone, place_x, place_z, place_label, created_by) values ($1, 'primary', $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
    [assetId, shop, shopName, price, stock, zone, place.x, place.z, place.label, me.id]);
  return { listing: listingView((await sql.unsafe(`${LISTING} where l.id = $1`, [made[0].id]))[0], me) };
}

module.exports = { list, mine, sync, open, read, write, offer, withdraw, decide, sell, unlist, adminAssets, adminList, UUID };
