'use strict';
// Guns, on the website's server (25 October 2026, the owner's brief for the guns and for fighting with them between
// players).
//
// Each player's game runs its own copy of the town, so a gun is checked here for whatever another player, or the bank,
// has a stake in:
//
//   what a player owns   every account has the starter rifle, free, from the start (it is never sold and never paid
//                        for); any other gun is bought here, with earned TR, through the bank; only a gun the account
//                        owns can be fired
//   the rounds           how many are in each gun and carried spare is counted here, a round a shot; a reload moves
//                        rounds from the spare and takes the gun's own time, during which nothing is fired; once a day
//                        (by the clock in Lagos) every gun is topped up, free
//   how fast             no gun is fired faster than its rate, however the shots are sent: each shot after the last
//                        by the session's own clock, and no more over the last seconds than the gun could have fired
//   a hit                one player's round hits another only if this server agrees: the shooter was where they say,
//                        the one hit was within reach of where their own game last said they were, nothing solid in
//                        the town stood between the two, the round went the way it was fired, within the gun's range,
//                        and the one hit could be shot at all (on their feet, not in the water or held, and above 20:
//                        the 20-life rule). Its damage is the game's one setting, never what a game says.
//   once                 every shot has its own number in its session; a shot sent twice is counted once and hits once
//
// The one hit is told at their game's next word with this server (world.js, presence), and says which hits it has
// taken (`ack`), so that a hit lost on the way is told again and one taken is never told twice.
//
// What the guns are and do comes from the game itself (prototype/src/sim/guns.js), written beside this file by the
// build (guns-data.json); and what in the town is solid, from the game's own map (walls.json). Nothing here is
// trusted from a page but which way a shot went and what it says it hit, and both are checked.

const { ApiError } = require('./http.js');
const { allow } = require('./auth.js');
const { SCHEMA: S } = require('./schema.js');
const wallet = require('./wallet.js');
const DATA = require('./guns-data.json');
const WALLS = require('./walls.json');

const GUN = DATA.gun;
const GUNS = DATA.guns;
const STARTER = DATA.starter;
// How much is allowed for what the network does to timing: a reload may finish this much early; the shots of a burst
// held up on the way may come together, up to this many seconds of fire at once; shots may come this much faster than
// the gun's rate (`rate`), and this close together by the session's own clock (`spacing`, a share of the gap).
const SLACK = Object.freeze({ reload: 0.5, burst: 1.5, rate: 1.15, spacing: 0.75 });
// How far a target may be from where their own game last said they were, beyond what they could have walked since
// (metres), and the fastest anyone moves on foot (metres a second); and how lately their game must have said where they
// are for them to be hit at all (seconds, and two more for the word on its way: a slow connection's words come seconds
// apart)
const REACH = Object.freeze({ base: 1.4, foot: 6.2, lag: 0.9, seen: 6 });
const MOST_SHOTS = 24;                  // shots one word may carry
const MOST_RELOADS = 4;                 // reloads one word may carry
const MOST_STRUCK = 40;                 // hits told at once

const gunOf = (id) => (typeof id === 'string' && Object.prototype.hasOwnProperty.call(GUNS, id) ? GUNS[id] : null);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
const vec = (a, n) => (Array.isArray(a) && a.length === n && a.every((v) => Number.isFinite(num(v))) ? a.map(Number) : null);
const peerOf = (hex) => `u${hex.slice(0, 20)}`;

// ---- the town's walls ----

// Each wall a box on the ground (x0, z0, x1, z1), solid all the way up, in cells of 12 m for finding those near a line.
const CELL = 12;
const cells = new Map();
for (const b of WALLS.boxes) {
  for (let i = Math.floor(b[0] / CELL); i <= Math.floor(b[2] / CELL); i += 1) {
    for (let j = Math.floor(b[1] / CELL); j <= Math.floor(b[3] / CELL); j += 1) {
      const key = i * 4096 + j;
      const list = cells.get(key);
      if (list) list.push(b); else cells.set(key, [b]);
    }
  }
}
// Does the line on the ground from (ax, az) to (bx, bz) pass through any wall? (Slab test against each box, the box
// shrunk by `inset` so that a round grazing a corner, as the game draws it, is not refused for a centimetre.)
function wallBetween(ax, az, bx, bz, inset = 0.03) {
  const seen = new Set();
  const dx = bx - ax, dz = bz - az;
  const length = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(length / (CELL / 2)));
  for (let k = 0; k <= steps; k += 1) {
    const x = ax + (dx * k) / steps, z = az + (dz * k) / steps;
    const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL);
    for (let i = ci - 1; i <= ci + 1; i += 1) {
      for (let j = cj - 1; j <= cj + 1; j += 1) {
        const list = cells.get(i * 4096 + j);
        if (!list) continue;
        for (const b of list) {
          if (seen.has(b)) continue;
          seen.add(b);
          let t0 = 0, t1 = 1;
          let blocked = true;
          for (const [o, d, lo, hi] of [[ax, dx, b[0] + inset, b[2] - inset], [az, dz, b[1] + inset, b[3] - inset]]) {
            if (hi <= lo) { blocked = false; break; }
            if (Math.abs(d) < 1e-9) { if (o <= lo || o >= hi) { blocked = false; break; } continue; }
            let u0 = (lo - o) / d, u1 = (hi - o) / d;
            if (u0 > u1) [u0, u1] = [u1, u0];
            t0 = Math.max(t0, u0); t1 = Math.min(t1, u1);
            if (t0 > t1) { blocked = false; break; }
          }
          if (blocked) return true;
        }
      }
    }
  }
  return false;
}

// ---- what an account has ----

// The day by the clock in Lagos, which is when the guns are topped up.
const TODAY = `(now() at time zone 'Africa/Lagos')::date`;

// The account's guns, every one of them topped up if a new day has begun, and its starter rifle given if it has none
// yet. `lock`: inside a transaction that will change them.
async function loadGuns(tx, accountId, lock) {
  await tx.unsafe(`insert into ${S}.gun_owned (account_id, gun, mag, spare, topped, how) values ($1, $2, $3, $4, ${TODAY}, 'starter') on conflict do nothing`, [accountId, STARTER, GUNS[STARTER].magazine, GUNS[STARTER].spare]);
  // (a gun not fired for a while may fire a burst at once: the count starts full)
  await tx.unsafe(`insert into ${S}.gun_state (account_id, equipped, bucket) values ($1, $2, 1e6) on conflict do nothing`, [accountId, STARTER]);
  const owned = await tx.unsafe(`select gun, mag, spare, topped < ${TODAY} as stale, how from ${S}.gun_owned where account_id = $1 order by created_at, gun${lock ? ' for update' : ''}`, [accountId]);
  for (const row of owned) {
    const def = gunOf(row.gun);
    if (!row.stale || !def) continue;
    await tx.unsafe(`update ${S}.gun_owned set mag = $3, spare = $4, topped = ${TODAY} where account_id = $1 and gun = $2`, [accountId, row.gun, def.magazine, def.spare]);
    row.mag = def.magazine; row.spare = def.spare;
  }
  const state = (await tx.unsafe(`select equipped, sid, last_seq, last_t, bucket, extract(epoch from (now() - bucket_at))::float8 as bucket_age, extract(epoch from (busy_until - now()))::float8 as busy, extract(epoch from (now() - sid_at))::float8 as sid_age, busy_t, reload_after from ${S}.gun_state where account_id = $1${lock ? ' for update' : ''}`, [accountId]))[0];
  return { owned: owned.filter((row) => gunOf(row.gun)).map((row) => ({ gun: row.gun, mag: Number(row.mag), spare: Number(row.spare), how: row.how })), state };
}

function stateView({ owned, state }) {
  const have = new Map(owned.map((row) => [row.gun, row]));
  return {
    equipped: have.has(state.equipped) ? state.equipped : STARTER,
    guns: Object.values(GUNS).map((def) => {
      const row = have.get(def.id);
      return { id: def.id, name: def.name, owned: !!row, mag: row ? row.mag : 0, spare: row ? row.spare : 0, magazine: def.magazine, starter: !!def.starter, price: def.price, forSale: !!def.forSale && !def.starter };
    }),
    reloading: state.busy !== null && state.busy !== undefined && Number(state.busy) > 0 ? Math.round(Number(state.busy) * 100) / 100 : 0,
  };
}

// What an account owns and has, every gun the game has (owned or not, for sale or not), and which is in hand.
async function gunState(sql, me) {
  await allow(sql, `gun-state:${me.id}`, 120, 600);
  return sql.begin(async (tx) => ({ gun: stateView(await loadGuns(tx, me.id, true)) }));
}

async function equip(sql, me, body) {
  await allow(sql, `gun-equip:${me.id}`, 120, 600);
  const def = gunOf(body.gun);
  if (!def) throw new ApiError(400, 'NO_GUN', 'There is no such gun.');
  return sql.begin(async (tx) => {
    const now = await loadGuns(tx, me.id, true);
    if (!now.owned.some((row) => row.gun === def.id)) throw new ApiError(409, 'NOT_OWNED', 'You do not own that gun.');
    await tx.unsafe(`update ${S}.gun_state set equipped = $2, busy_until = null where account_id = $1`, [me.id, def.id]);
    now.state.equipped = def.id; now.state.busy = 0;
    return { gun: stateView(now) };
  });
}

// A reload: rounds from the spare into the gun, as many as it takes (or as there are), and the gun out of use for the
// time a reload takes. Asked again while it is under way, it is refused (rounds are never moved twice).
async function reload(sql, me, body) {
  await allow(sql, `gun-reload:${me.id}`, 240, 600);
  return sql.begin(async (tx) => {
    const now = await loadGuns(tx, me.id, true);
    const id = body.gun === undefined ? now.state.equipped : body.gun;
    const def = gunOf(id);
    if (!def) throw new ApiError(400, 'NO_GUN', 'There is no such gun.');
    const row = now.owned.find((r) => r.gun === def.id);
    if (!row) throw new ApiError(409, 'NOT_OWNED', 'You do not own that gun.');
    if (now.state.busy !== null && Number(now.state.busy) > 0) throw new ApiError(409, 'NOT_READY', 'Already reloading.');
    if (row.mag >= def.magazine) throw new ApiError(409, 'FULL', 'The magazine is full.');
    if (row.spare <= 0) throw new ApiError(409, 'NO_SPARE', 'You have no rounds left to reload with.');
    const moved = Math.min(def.magazine - row.mag, row.spare);
    row.mag += moved; row.spare -= moved;
    await tx.unsafe(`update ${S}.gun_owned set mag = $3, spare = $4 where account_id = $1 and gun = $2`, [me.id, def.id, row.mag, row.spare]);
    await tx.unsafe(`update ${S}.gun_state set busy_until = now() + make_interval(secs => $2::float8), reload_at = now() where account_id = $1`, [me.id, Math.max(0, def.reload - SLACK.reload)]);
    now.state.busy = def.reload;
    return { gun: stateView(now), moved };
  });
}

// A gun bought from the shop, with earned TR (as anything to own is), to the town; the gun and the payment together or
// not at all, once however often it is asked (`key`). The starter is never sold. (25 October 2026: none is for sale
// yet; the owner sends the guns, and their prices.) `catalog`: the guns there are, for the tests.
async function buy(sql, me, body, catalog = GUNS) {
  await allow(sql, `gun-buy:${me.id}`, 30, 600);
  const def = typeof body.gun === 'string' && Object.prototype.hasOwnProperty.call(catalog, body.gun) ? catalog[body.gun] : null;
  if (!def) throw new ApiError(400, 'NO_GUN', 'There is no such gun.');
  if (def.starter || !def.forSale || !(def.price > 0)) throw new ApiError(409, 'NOT_FOR_SALE', `The ${def.name} is not sold${def.starter ? ': everyone has one, free' : ''}.`);
  const key = wallet.keyOf(body.key);
  const units = def.price * wallet.TR;
  if (body.price !== def.price) throw new ApiError(409, 'QUOTE_CHANGED', `The price is ${wallet.trText(units)}.`, { price: def.price });
  return sql.begin(async (tx) => {
    await loadGuns(tx, me.id, true);
    const had = await tx.unsafe(`select how, tx_id from ${S}.gun_owned where account_id = $1 and gun = $2`, [me.id, def.id]);
    if (had.length) {
      // asked again after it was bought: the same answer, nothing paid twice
      const first = had[0].tx_id ? await tx.unsafe(`select ref from ${S}.wallet_tx where id = $1 and actor_id = $2 and idem_key = $3`, [had[0].tx_id, me.id, `gun:${key}`]) : [];
      if (first.length) return { bought: { gun: def.id, ref: first[0].ref, replayed: true }, gun: stateView(await loadGuns(tx, me.id, false)), ...(await wallet.after(tx, me.id)) };
      throw new ApiError(409, 'OWNED', `You already own the ${def.name}.`);
    }
    const w = await wallet.walletOf(tx, me.id, true);
    wallet.mustBeEligible(w, units, 'asset');
    const { legs, drawn } = wallet.eligibleLegs(w, units);
    legs.push({ wallet: await wallet.systemWallet(tx, 'world'), amount: units });
    const moved = await wallet.post(tx, { kind: 'gun', actor: me.id, key: `gun:${key}`, note: `Bought: ${def.name}`, meta: { gun: def.id, price: units, earned: drawn.earned, illicit: drawn.illicit }, legs });
    await tx.unsafe(`insert into ${S}.gun_owned (account_id, gun, mag, spare, topped, how, tx_id) values ($1, $2, $3, $4, ${TODAY}, 'bought', $5)`, [me.id, def.id, def.magazine, def.spare, moved.id]);
    return { bought: { gun: def.id, ref: moved.ref, replayed: false }, gun: stateView(await loadGuns(tx, me.id, false)), ...(await wallet.after(tx, me.id)) };
  });
}

// ---- shots ----

// Can someone, as their own game last said, be shot? (On their feet, not in the water, not held by the police, not in
// or on a vehicle, not on the ground, and above 20.)
function shootable(st) {
  if (!st || typeof st !== 'object') return false;
  const hp = num(st.hp);
  return Number.isFinite(hp) && hp > GUN.floor && !st.vh && !st.mb && !st.mc && !st.sw && !st.hd && !st.dn;
}
// May this player fire, as their own game says they are? (The same, and their gun out.)
function mayFire(st) { return shootable(st) && Array.isArray(st.gn); }

// Shots from a player's game, with the presence that came with them (`mine`: their state, just kept). Each shot:
//   [seq, t (seconds by the session's clock), gun, origin [x, y, z], direction [x, y, z], hit?]
//   hit: { who: the one hit (as the others know them, 'u...'), at: [x, y, z], w: a wound on their body (optional) }
// and the reloads done since (`r`), each told once it is done, in its place among the rounds: [after (the number of the
// last round fired before it), t (when it began, by the session's clock), gun]. A reload told this way is counted in
// order with the rounds, however late the word comes (one asked for apart, gun.reload, could be counted before the
// last rounds fired ahead of it); the rounds after it are held to its time by the same clock (`busy_t`).
// Answers { ok: [seq...], no: [[seq, code]...], hit: [seq...], r: [[after, 'ok' | code]...], mag, spare, gun }.
async function fire(sql, me, fireIn, mine, zone) {
  if (!fireIn || typeof fireIn !== 'object') return null;
  const sid = typeof fireIn.sid === 'string' && /^[A-Za-z0-9_-]{8,40}$/.test(fireIn.sid) ? fireIn.sid : null;
  if (!sid) throw new ApiError(400, 'BAD_REQUEST', 'That cannot be read.');
  const shots = (Array.isArray(fireIn.s) ? fireIn.s : []).slice(0, MOST_SHOTS);
  const reloads = (Array.isArray(fireIn.r) ? fireIn.r : []).slice(0, MOST_RELOADS)
    .map((r) => (Array.isArray(r) ? { after: Math.floor(num(r[0])), t: num(r[1]), gun: r[2] } : null))
    .filter((r) => r && Number.isSafeInteger(r.after) && r.after >= 0 && Number.isFinite(r.t));
  await allow(sql, `gun-fire:${me.id}`, 900, 60);
  return sql.begin(async (tx) => {
    const now = await loadGuns(tx, me.id, true);
    const st = now.state;
    const out = { ok: [], no: [], hit: [] };
    // a new session of the game (a page opened again): its shots are numbered from one again, by its own clock. Not more
    // often than every few seconds (a game that kept starting new sessions is still held to the count over time, below).
    let lastSeq = Number(st.last_seq || 0), lastT = st.last_t === null ? null : Number(st.last_t);
    // (a reload's end, by the session's clock; and the last reload counted, by the round it came after)
    let busyT = st.busy_t === null || st.busy_t === undefined ? null : Number(st.busy_t), reloadAfter = Number(st.reload_after || 0);
    out.r = [];
    if (st.sid !== sid) {
      if (st.sid && st.sid_age !== null && Number(st.sid_age) < 3) {
        for (const s of shots) if (Array.isArray(s)) out.no.push([s[0], 'SESSION']);
        for (const r of reloads) out.r.push([r.after, 'SESSION']);
        return { ...out, ...gunCounts(now, st.equipped) };
      }
      await tx.unsafe(`update ${S}.gun_state set sid = $2, sid_at = now(), last_seq = 0, last_t = null, busy_t = null, reload_after = 0 where account_id = $1`, [me.id, sid]);
      lastSeq = 0; lastT = null; busyT = null; reloadAfter = 0;
    }
    // the count over the last seconds: refilled at the gun's rate (and a little), up to a burst
    const rate = (GUNS[st.equipped] || GUNS[STARTER]).rpm / 60;
    let bucket = Math.min(rate * SLACK.burst, Number(st.bucket || 0) + Number(st.bucket_age || 0) * rate * SLACK.rate);
    const busy = st.busy !== null && Number(st.busy) > 0;
    const targets = new Map();
    const firing = mayFire(mine);
    const counts = new Map(now.owned.map((row) => [row.gun, row]));
    // the rounds and the reloads in the order they were done: a reload just after the round it follows
    const events = [
      ...shots.filter(Array.isArray).map((s) => ({ key: Math.floor(num(s[0])), s })),
      ...reloads.map((r) => ({ key: r.after + 0.5, r })),
    ].filter((e) => Number.isFinite(e.key)).sort((a, b) => a.key - b.key);
    for (const { s, r } of events) {
      if (r) {
        // told before (a word lost on the way and sent again): counted then
        if (r.after <= reloadAfter) { out.r.push([r.after, 'ok']); continue; }
        const def = gunOf(r.gun);
        const row = def ? counts.get(def.id) : null;
        const refuse = (code) => { out.r.push([r.after, code]); };
        if (!def || !row) { refuse('NOT_OWNED'); continue; }
        if (def.id !== st.equipped) { refuse('NOT_EQUIPPED'); continue; }
        // begun after the last round fired before it, and not during another
        if ((lastT !== null && r.t < lastT - 0.05) || (busyT !== null && r.t < busyT)) { refuse('NOT_READY'); continue; }
        if (row.mag >= def.magazine) { refuse('FULL'); continue; }
        if (row.spare <= 0) { refuse('NO_SPARE'); continue; }
        const moved = Math.min(def.magazine - row.mag, row.spare);
        row.mag += moved; row.spare -= moved; row.touched = true;
        busyT = r.t + Math.max(0, def.reload - SLACK.reload);
        reloadAfter = r.after;
        // (a round before it that never came is not counted now: it was never heard of)
        if (r.after > lastSeq) lastSeq = r.after;
        out.r.push([r.after, 'ok']);
        continue;
      }
      const seq = Math.floor(num(s[0]));
      if (!(seq > 0)) continue;
      // sent before: counted then, not again
      if (seq <= lastSeq) continue;
      lastSeq = seq;
      const no = (code) => { out.no.push([seq, code]); };
      const t = num(s[1]);
      const def = gunOf(s[2]);
      const o = vec(s[3], 3), dRaw = vec(s[4], 3);
      if (!def || !Number.isFinite(t) || !o || !dRaw) { no('BAD_SHOT'); continue; }
      const row = counts.get(def.id);
      if (!row) { no('NOT_OWNED'); continue; }
      if (def.id !== st.equipped) { no('NOT_EQUIPPED'); continue; }
      if (!firing) { no('CANNOT'); continue; }
      if (busy || (busyT !== null && t < busyT)) { no('RELOADING'); continue; }
      if (row.mag <= 0) { no('EMPTY'); continue; }
      // never faster than the gun fires: by the session's own clock, after the last shot; and over the last seconds
      if (lastT !== null && t - lastT < (60 / def.rpm) * SLACK.spacing) { no('RATE'); continue; }
      if (bucket < 1) { no('RATE'); continue; }
      const len = Math.hypot(dRaw[0], dRaw[1], dRaw[2]);
      if (!(len > 0.5 && len < 1.5)) { no('BAD_SHOT'); continue; }
      const d = dRaw.map((v) => v / len);
      // fired: a round gone
      bucket -= 1; lastT = t; row.mag -= 1; row.spent = (row.spent || 0) + 1;
      out.ok.push(seq);
      // where it was fired from: where the shooter is (their own game's word, kept with this same request)
      if (Math.hypot(o[0] - num(mine.x), o[2] - num(mine.z)) > GUN.muzzle.reach + 1.2) continue;
      const h = s[5] && typeof s[5] === 'object' ? s[5] : null;
      if (!h) continue;
      const who = typeof h.who === 'string' && /^u[0-9a-f]{20}$/.test(h.who) ? h.who : null;
      const p = vec(h.at, 3);
      if (!who || !p) continue;
      targets.set(seq, { who, p, o, d, def, w: Array.isArray(h.w) && h.w.length >= 4 && h.w.length <= 5 && Number.isInteger(h.w[0]) && h.w[0] >= 0 && h.w[0] < 32 && h.w.slice(1).every((v) => Number.isFinite(num(v)) && Math.abs(v) < 4) ? h.w.map(Number) : null });
    }
    // the ones claimed hit: each checked against where they were, and the walls between
    if (targets.size) {
      const ids = [...new Set([...targets.values()].map((x) => x.who.slice(1)))];
      const rows = await tx.unsafe(
        `select p.account_id, p.x, p.z, p.state, extract(epoch from (now() - p.at))::float8 as age, left(encode(sha256(p.account_id::text::bytea), 'hex'), 20) as who
         from ${S}.presence p where p.zone = $1 and p.account_id <> $2 and p.at > now() - make_interval(secs => $3::float8)
         and left(encode(sha256(p.account_id::text::bytea), 'hex'), 20) in (select jsonb_array_elements_text($4::text::jsonb))`,
        [zone, me.id, REACH.seen + 2, JSON.stringify(ids)]);
      const byWho = new Map(rows.map((r) => [`u${r.who}`, r]));
      for (const [seq, claim] of targets) {
        const r = byWho.get(claim.who);
        if (!r || !shootable(r.state)) { out.no.push([seq, 'NOT_A_TARGET']); continue; }
        const st2 = r.state;
        const age = Math.max(0, Number(r.age));
        const vl = Array.isArray(st2.vl) ? Math.min(REACH.foot, Math.hypot(num(st2.vl[0]) || 0, num(st2.vl[1]) || 0)) : REACH.foot;
        const reach = REACH.base + Math.max(1, vl) * (age + REACH.lag);
        if (Math.hypot(claim.p[0] - num(r.x), claim.p[2] - num(r.z)) > reach) { out.no.push([seq, 'NOT_THERE']); continue; }
        // within the height of a body above where they stand (their own game's word on its ground)
        const gy = Number.isFinite(num(st2.gy)) ? Math.max(-3, Math.min(80, num(st2.gy))) : 0;
        if (claim.p[1] < gy - 0.4 || claim.p[1] > gy + 2.3) { out.no.push([seq, 'NOT_THERE']); continue; }
        // along the way it was fired, within the gun's range
        const v = [claim.p[0] - claim.o[0], claim.p[1] - claim.o[1], claim.p[2] - claim.o[2]];
        const along = v[0] * claim.d[0] + v[1] * claim.d[1] + v[2] * claim.d[2];
        const off = Math.hypot(v[0] - claim.d[0] * along, v[1] - claim.d[1] * along, v[2] - claim.d[2] * along);
        if (along < 0 || along > claim.def.range || off > 0.45) { out.no.push([seq, 'OFF_LINE']); continue; }
        // nothing solid between
        if (wallBetween(claim.o[0], claim.o[2], claim.p[0], claim.p[2])) { out.no.push([seq, 'WALL']); continue; }
        const data = { at: claim.p.map((k) => Math.round(k * 100) / 100), from: [Math.round(claim.o[0] * 100) / 100, Math.round(claim.o[2] * 100) / 100], w: claim.w };
        const made = await tx.unsafe(`insert into ${S}.gun_hits (target_id, shooter_id, sid, seq, gun, damage, data) values ($1, $2, $3, $4, $5, $6, $7::text::jsonb) on conflict do nothing returning id`, [r.account_id, me.id, sid, seq, claim.def.id, GUN.damage, JSON.stringify(data)]);
        if (made.length) out.hit.push([seq, claim.who]);
      }
    }
    for (const row of counts.values()) if (row.spent || row.touched) await tx.unsafe(`update ${S}.gun_owned set mag = $3, spare = $4 where account_id = $1 and gun = $2`, [me.id, row.gun, row.mag, row.spare]);
    await tx.unsafe(`update ${S}.gun_state set last_seq = $2, last_t = $3, bucket = $4, bucket_at = now(), shots = shots + $5, hits = hits + $6, refused = refused + $7, busy_t = $8, reload_after = $9 where account_id = $1`,
      [me.id, lastSeq, lastT, Math.max(0, bucket), out.ok.length, out.hit.length, out.no.length, busyT, reloadAfter]);
    return { ...out, ...gunCounts(now, st.equipped) };
  });
}
const gunCounts = (now, equipped) => { const row = now.owned.find((r) => r.gun === equipped) || now.owned[0]; return { gun: row.gun, mag: row.mag, spare: row.spare }; };

// The hits on this player not yet taken (after `ack`, the last their game says it has taken), oldest first; those taken
// are let go. Each: { id, by (the shooter, as the others know them), name, dmg, at, from, w }.
async function struck(sql, me, ack) {
  const taken = Number.isSafeInteger(ack) && ack > 0 ? ack : 0;
  if (taken) await sql.unsafe(`delete from ${S}.gun_hits where target_id = $1 and id <= $2`, [me.id, taken]);
  const rows = await sql.unsafe(
    `select h.id, h.damage, h.data, a.username, encode(sha256(h.shooter_id::text::bytea), 'hex') as who from ${S}.gun_hits h join ${S}.accounts a on a.id = h.shooter_id
     where h.target_id = $1 and h.id > $2 order by h.id limit ${MOST_STRUCK}`, [me.id, taken]);
  if (Math.random() < 0.01) await sql.unsafe(`delete from ${S}.gun_hits where at < now() - interval '30 minutes'`);
  return rows.map((r) => ({ id: Number(r.id), by: peerOf(r.who), name: r.username, dmg: Number(r.damage), at: r.data.at, from: r.data.from, ...(r.data.w ? { w: r.data.w } : {}) }));
}

module.exports = { gunState, equip, reload, buy, fire, struck, wallBetween, shootable, GUNS, GUN, STARTER, SLACK, REACH };
