// Advertising on the billboards against a real PostgreSQL: the price the server works out, earned TR only, the
// hold while a campaign is reviewed, approval charging once and rejection returning once, no two campaigns on the
// same days of one billboard, the pictures checked from their own bytes and shown only when approved, and the
// review and the bank's figures for administrators only.
//   server/with-postgres.sh node --test server/test/*.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { newPlayer, earner, earn, person, database, closeDatabase, uuid } from './harness.mjs';
import { AD_CATEGORIES } from '../../prototype/src/sim/billboards.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const wallet = require('../../api/_lib/wallet.js');
const ads = require('../../api/_lib/ads.js');
const BOARDS = require('../../api/_lib/billboards.json');

// (these players earn more than a new account is believed about at once: that limit is tested in wallet.test.mjs)
process.env.PCW_EARN_BURST = '100000000';
after(() => closeDatabase());
const TR = 2;
const clean = async () => assert.deepEqual(await wallet.audit(await database()), [], 'the bank\'s books are right');
const purse = async (p) => (await p.ok('wallet.get')).wallet;
const sql = () => database();

// a real PNG of the size asked for (a flat colour), as a browser would send it
function png(width, height, colour = [200, 30, 40]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.alloc(1 + width * 3); for (let x = 0; x < width; x += 1) row.set(colour, 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}
const boardOf = (category, skip = 0) => BOARDS.filter((b) => b.category === category)[skip];
const picFor = (b) => png(Math.round(600 * b.width / b.height), 600);
const spare = {};
// a board nobody else in these tests uses
const freshBoard = (category) => { spare[category] = (spare[category] || 1) + 1; return boardOf(category, spare[category]); };

async function campaign(p, b, { duration = '1w', slides = b.tv ? 3 : 1 } = {}) {
  const { campaign: c } = await p.ok('ads.draft', { key: uuid(), billboard: b.id, duration, brand: 'Okafor Paints', link: 'okaforpaints.example.com' });
  for (let i = 0; i < slides; i += 1) await p.ok('ads.upload', { campaign: c.id, index: i, data: picFor(b) });
  return c;
}
const submit = (p, c, extra = {}) => p.call('ads.submit', { campaign: c.id, terms: ads.TERMS_VERSION, accepted: true, rights: true, ...extra });
async function admin() {
  const boss = await newPlayer('AdBoss');
  await (await sql()).unsafe(`update pcw.accounts set role = 'admin' where username_key = $1`, [boss.username.toLowerCase()]);
  return boss;
}

test('the server\'s prices are the owner\'s table, and a booking costs (fee + tax) × days', async () => {
  for (const [cat, { fee, tax }] of Object.entries(AD_CATEGORIES)) assert.deepEqual(ads.PRICES[cat], { fee, tax }, cat);
  assert.deepEqual(ads.PRICES, { small: { fee: 66, tax: 4 }, medium: { fee: 132, tax: 8 }, large: { fee: 200, tax: 16 }, xl: { fee: 267, tax: 32 }, tv: { fee: 667, tax: 64 } });
  const p = await newPlayer('Quoter');
  for (const cat of ['small', 'medium', 'large', 'xl', 'tv']) {
    const b = boardOf(cat);
    const { quote } = await p.ok('ads.quote', { billboard: b.id, duration: '1m' });
    assert.equal(quote.days, 30);
    assert.equal(quote.total, (ads.PRICES[cat].fee + ads.PRICES[cat].tax) * 30 * TR, cat);
    assert.equal(quote.fee + quote.tax, quote.total);
    assert.ok(new Date(quote.start) > new Date(), 'it starts on a day still to come');
  }
  assert.equal((await p.call('ads.quote', { billboard: 'BB-999', duration: '1w' })).status, 404);
  assert.equal((await p.call('ads.quote', { billboard: boardOf('small').id, duration: '5y' })).status, 400);
  const cat = await person().ok('ads.catalog');
  assert.equal(cat.terms, ads.TERMS_VERSION);
  assert.deepEqual(cat.durations, ads.DURATIONS);
  // a price the page sends is ignored: the server's is what is held
  const rich = await earner('Pricer', 40000);
  const b = freshBoard('small');
  const c = await campaign(rich, b);
  const before = await purse(rich);
  const done = await submit(rich, c, { total: 1, fee: 1, tax: 0 });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.equal(done.body.campaign.price.total, 70 * 7 * TR);
  assert.equal(before.balance - (await purse(rich)).balance, 70 * 7 * TR);
  await clean();
});

test('only earned TR pays for advertising: not the arrival money, not TR taken from someone, not the two together', async () => {
  const b = freshBoard('small');
  // arrival money alone: 2,000 TR, more than a week of a small board, and still refused
  const newcomer = await newPlayer('Starter');
  const c = await campaign(newcomer, b);
  const refused = await submit(newcomer, c);
  assert.equal(refused.status, 409);
  assert.equal(refused.body.code, 'EARNED_FUNDS');
  assert.match(refused.body.message, /Starter TR cannot pay for advertising/);
  assert.equal((await purse(newcomer)).balance, 2000 * TR, 'nothing moved');
  // a little earned and the rest starter: still refused, for the earned part is short
  await earn(newcomer, 100 * TR);
  assert.equal((await submit(newcomer, c)).body.code, 'EARNED_FUNDS');
  // TR taken from someone does not pay either
  const thief = await newPlayer('Taker');
  await earn(thief, 1000 * TR, 'illicit');
  const c2 = await campaign(thief, freshBoard('small'));
  const r2 = await submit(thief, c2);
  assert.equal(r2.status, 409);
  assert.ok(['EARNED_FUNDS', 'FUNDS'].includes(r2.body.code));
  // earned TR sent by another player is the receiver's earned TR, and pays
  const giver = await earner('Giver', 4000);
  const taker = await newPlayer('Receiver');
  await giver.ok('wallet.send', { username: taker.username, amount: '600', key: uuid() });
  const c3 = await campaign(taker, freshBoard('small'));
  const ok = await submit(taker, c3);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const w = await purse(taker);
  assert.equal(w.starter, 2000 * TR, 'the arrival money is untouched');
  assert.equal(w.adHeld, 70 * 7 * TR);
  await clean();
});

test('submitted, the TR is held; approved, it is charged once (fee to the town, tax to the agency); rejected or cancelled, returned once', async () => {
  const db = await sql();
  const bank = async () => Object.fromEntries((await db.unsafe(`select code, balance from pcw.wallets where code in ('adhold', 'adverts', 'adtax')`)).map((r) => [r.code, Number(r.balance)]));
  const boss = await admin();
  const p = await earner('Advertiser', 40000);
  const start = await purse(p);
  const b = freshBoard('medium');
  const c = await campaign(p, b);
  const was = await bank();
  const sub = await submit(p, c);
  assert.equal(sub.status, 200);
  assert.equal(sub.body.campaign.status, 'pending');
  const total = 140 * 7 * TR;
  // a second press finds it done
  const again = await submit(p, c);
  assert.equal(again.status, 200);
  assert.equal(again.body.replayed, true);
  assert.equal(start.balance - (await purse(p)).balance, total);
  assert.equal((await bank()).adhold - was.adhold, total);
  // its pictures cannot be changed once submitted
  assert.equal((await p.call('ads.upload', { campaign: c.id, index: 0, data: picFor(b) })).status, 409);
  // only an administrator decides
  assert.equal((await p.call('admin.ad.decide', { campaign: c.id, approve: true })).status, 403);
  assert.equal((await p.call('admin.ads')).status, 403);
  assert.equal((await p.call('admin.overview')).status, 403);
  const list = await boss.ok('admin.ads', { status: 'pending' });
  const seen = list.campaigns.find((x) => x.id === c.id);
  assert.ok(seen && seen.advertiser === p.username && seen.termsVersion === ads.TERMS_VERSION && seen.rights === true);
  // two administrators at once: one approves, the other is told it is done
  const both = await Promise.all([boss.call('admin.ad.decide', { campaign: c.id, approve: true }), boss.call('admin.ad.decide', { campaign: c.id, approve: true })]);
  assert.deepEqual(both.map((r) => r.status).sort(), [200, 409]);
  const now = await bank();
  assert.equal(now.adhold, was.adhold);
  assert.equal(now.adverts - was.adverts, 132 * 7 * TR);
  assert.equal(now.adtax - was.adtax, 8 * 7 * TR);
  assert.equal(start.balance - (await purse(p)).balance, total, 'charged once, not twice');
  assert.equal((await p.call('admin.ad.decide', { campaign: c.id, approve: false, note: 'changed my mind' })).status, 403);
  assert.equal((await boss.call('admin.ad.decide', { campaign: c.id, approve: false, note: 'changed my mind' })).status, 409);
  // rejected: a reason is needed, and the TR comes back once
  const c2 = await campaign(p, freshBoard('medium'));
  await submit(p, c2);
  assert.equal((await boss.call('admin.ad.decide', { campaign: c2.id, approve: false })).status, 400);
  const mid = (await purse(p)).balance;
  const rej = await Promise.all([boss.call('admin.ad.decide', { campaign: c2.id, approve: false, note: 'The artwork is unreadable at road distance.' }), p.call('ads.cancel', { campaign: c2.id })]);
  assert.equal(rej.filter((r) => r.status === 200).length, 1, 'rejected or cancelled, not both');
  assert.equal((await purse(p)).balance - mid, total, 'returned once');
  const mine = (await p.ok('ads.mine')).campaigns.find((x) => x.id === c2.id);
  assert.ok(['rejected', 'cancelled'].includes(mine.status));
  // cancelled while it waits: returned
  const c3 = await campaign(p, freshBoard('medium'));
  await submit(p, c3);
  const before3 = (await purse(p)).balance;
  assert.equal((await p.ok('ads.cancel', { campaign: c3.id })).campaign.status, 'cancelled');
  assert.equal((await p.ok('ads.cancel', { campaign: c3.id })).replayed, true);
  assert.equal((await purse(p)).balance - before3, total);
  // the history says what happened
  const events = await db.unsafe(`select action from pcw.ad_events where campaign_id = $1 order by id`, [c.id]);
  assert.deepEqual(events.map((e) => e.action), ['drafted', 'submitted', 'notification', 'approved']);
  await assert.rejects(db.unsafe(`delete from pcw.ad_events where campaign_id = $1`, [c.id]), 'its history is kept');
  await clean();
});

test('no two campaigns take the same days of a billboard, even submitted at the same instant', async () => {
  const b = freshBoard('large');
  const a = await earner('RivalA', 40000), z = await earner('RivalZ', 40000);
  const ca = await campaign(a, b), cz = await campaign(z, b);
  const [ra, rz] = await Promise.all([submit(a, ca), submit(z, cz)]);
  assert.equal(ra.status, 200); assert.equal(rz.status, 200);
  const x = ra.body.campaign, y = rz.body.campaign;
  const overlap = new Date(x.start) < new Date(y.end) && new Date(y.start) < new Date(x.end);
  assert.equal(overlap, false, `${x.start}..${x.end} and ${y.start}..${y.end}`);
  // the billboard shows as in review in the catalogue; the next free days come after both
  const cat = await person().ok('ads.catalog');
  assert.equal(cat.state[b.id].status, 'review');
  const { quote } = await a.ok('ads.quote', { billboard: b.id, duration: '1w' });
  assert.ok(new Date(quote.start) >= new Date(Math.max(new Date(x.end), new Date(y.end))));
  await clean();
});

test('pictures: still PNG, JPEG or WebP only, the billboard\'s shape, one for a print and three to ten for a screen', async () => {
  const p = await earner('Artist', 80000);
  const print = freshBoard('small');
  const { campaign: c } = await p.ok('ads.draft', { key: uuid(), billboard: print.id, duration: '1w', brand: 'Delta Rice', link: 'https://deltarice.example.com/shop' });
  const bad = async (data, code) => { const r = await p.call('ads.upload', { campaign: c.id, index: 0, data }); assert.equal(r.body.code, code, JSON.stringify(r.body)); };
  await bad(Buffer.from('MZ\x90\x00 this is a program, not a picture').toString('base64'), 'ART_TYPE');
  await bad(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64'), 'ART_TYPE');
  await bad(Buffer.from('GIF89a......').toString('base64'), 'ART_TYPE');
  await bad(png(800, 800), 'ART_SHAPE');
  await bad(png(200, Math.round(200 * print.height / print.width)), 'ART_PIXELS');
  assert.equal((await p.call('ads.upload', { campaign: c.id, index: 1, data: picFor(print) })).body.code, 'ART');
  // nothing yet: not submitted
  assert.equal((await submit(p, c)).body.code, 'ART_COUNT');
  await p.ok('ads.upload', { campaign: c.id, index: 0, data: picFor(print) });
  // links: a website, nothing else
  for (const link of ['javascript:alert(1)', 'file:///etc/passwd', 'ftp://x.example.com', 'https://user:pw@x.example.com', 'not a link']) {
    assert.equal((await p.call('ads.draft', { key: uuid(), billboard: print.id, duration: '1w', brand: 'X Ltd', link })).body.code, 'LINK', link);
  }
  // the terms must be the ones in force, accepted, and the rights confirmed
  assert.equal((await submit(p, c, { terms: 'ads-terms-old' })).body.code, 'TERMS');
  assert.equal((await submit(p, c, { accepted: false })).body.code, 'TERMS');
  assert.equal((await submit(p, c, { rights: false })).body.code, 'RIGHTS');
  assert.equal((await submit(p, c)).status, 200);
  // a screen: three to ten slides
  const tv = freshBoard('tv');
  const { campaign: t } = await p.ok('ads.draft', { key: uuid(), billboard: tv.id, duration: '1w', brand: 'Asaba Mobile', link: 'https://asabamobile.example.com' });
  await p.ok('ads.upload', { campaign: t.id, index: 0, data: picFor(tv) });
  await p.ok('ads.upload', { campaign: t.id, index: 1, data: picFor(tv) });
  assert.equal((await submit(p, t)).body.code, 'ART_COUNT');
  await p.ok('ads.upload', { campaign: t.id, index: 3, data: picFor(tv) });
  assert.equal((await submit(p, t)).body.code, 'ART_COUNT', 'no gap between slides');
  await p.ok('ads.unupload', { campaign: t.id, index: 3 });
  await p.ok('ads.upload', { campaign: t.id, index: 2, data: picFor(tv) });
  const ok = await submit(p, t);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.campaign.art.length, 3);
  // someone else's campaign cannot be touched
  const other = await newPlayer('Nosy');
  assert.equal((await other.call('ads.cancel', { campaign: t.id })).status, 404);
  assert.equal((await other.call('ads.upload', { campaign: c.id, index: 0, data: picFor(print) })).status, 404);
  await clean();
});

test('a picture is shown to everyone only while its campaign is approved and running; expired, it is gone', async () => {
  const db = await sql();
  const boss = await admin();
  const p = await earner('Shower', 40000);
  const b = freshBoard('xl');
  const c = await campaign(p, b);
  const sub = (await submit(p, c)).body.campaign;
  const artId = sub.art[0].id;
  const stranger = person();
  assert.equal((await stranger.call('ads.art', { id: artId })).status, 404, 'not while it waits');
  assert.equal((await p.ok('ads.art', { id: artId })).mime, 'image/png', 'its advertiser may see it');
  assert.equal((await boss.ok('ads.art', { id: artId })).mime, 'image/png', 'an administrator may see it');
  // approved two days after its first day: those days are given back, and it runs from now
  await db.unsafe(`update pcw.ad_campaigns set start_at = now() - interval '36 hours', end_at = now() - interval '36 hours' + interval '7 days' where id = $1`, [c.id]);
  const before = await purse(p);
  const ap = await boss.ok('admin.ad.decide', { campaign: c.id, approve: true, note: 'Clear and legible.' });
  assert.equal(ap.campaign.price.refunded, 2 * (267 + 32) * TR);
  assert.equal((await purse(p)).balance - before.balance, 2 * (267 + 32) * TR);
  assert.equal((await p.ok('ads.mine')).campaigns.find((x) => x.id === c.id).stage, 'active');
  const showing = (await stranger.ok('ads.board')).campaigns.find((x) => x.billboard === b.id);
  assert.ok(showing && showing.art[0] === artId);
  const pic = await stranger.ok('ads.art', { id: artId });
  assert.ok(Buffer.from(pic.data, 'base64').subarray(1, 4).toString() === 'PNG');
  assert.equal((await person().ok('ads.catalog')).state[b.id].status, 'occupied');
  await clean();
  // its days over: no longer on the board, and its picture no longer anyone's to see
  await db.unsafe(`update pcw.ad_campaigns set start_at = now() - interval '8 days', end_at = now() - interval '1 day' where id = $1`, [c.id]);
  assert.equal((await stranger.ok('ads.board')).campaigns.find((x) => x.id === c.id), undefined);
  assert.equal((await stranger.call('ads.art', { id: artId })).status, 404);
  assert.equal((await p.ok('ads.mine')).campaigns.find((x) => x.id === c.id).stage, 'expired');
  assert.equal((await person().ok('ads.catalog')).state[b.id], undefined, 'free again');
  await clean();
});

test('the administrator\'s overview: the advertising tax and fees, what is held, recent payments, the books', async () => {
  const boss = await admin();
  const view = await boss.ok('admin.overview');
  assert.ok(Number.isSafeInteger(view.bank.adTax) && view.bank.adTax > 0);
  assert.ok(view.bank.adFees > view.bank.adTax);
  assert.ok(view.recent.length > 0 && view.recent.some((r) => r.kind === 'ad-charge'));
  assert.ok(view.tax.length > 0);
  assert.ok(view.events.length > 0);
  assert.deepEqual(view.audit, []);
  assert.deepEqual(await ads.audit(await sql()), []);
  // nothing in it, or anywhere a player can see, names a reviewer's email
  assert.doesNotMatch(JSON.stringify(view), /@[a-z0-9-]+\.[a-z]/i);
  assert.equal((await (await newPlayer('Plainer')).call('admin.overview')).status, 403);
  assert.equal((await person().call('admin.overview')).status, 401);
});
