// The billboards and the ADS app in a headless browser, on the website as it is served with its server:
//   - each of the seventeen kinds of billboard, seen from the road in front of it, says PLACE YOUR ADS and its size,
//     and stands on the ground (a picture of each for the eye); what the fifty of them cost to draw;
//   - a player with earned TR books a billboard in the ADS app: chooses it, a week, brand, link, the picture (the
//     page refuses one of the wrong shape first), the price and tax, the terms and the checkbox, submit; the TR is
//     held; nothing is shown on the billboard;
//   - an ordinary player has no Admin app; made an administrator, the Admin app shows the campaign with its
//     picture, and Approve charges it; on its first day the picture is on that billboard and no other;
//   - a digital screen's three slides are shown in turn.
//   ../server/with-postgres.sh node test/adverts.mjs [shots folder]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import zlib from 'node:zlib';
import { createDevServer } from '../../server/dev.mjs';
import { pastQuestion, enterTown } from './start.mjs';
import { ZONE_BILLBOARDS } from '../src/sim/zones/atani-billboards.js';
import { BILLBOARD_TYPES } from '../src/sim/billboards.js';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const out = process.argv[2] || '/tmp/advert-shots';
mkdirSync(out, { recursive: true });
const { database, closeDatabase } = require('../../api/_lib/db.js');
const wallet = require('../../api/_lib/wallet.js');
const server = createDevServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); };
const TR = 2;

// a real PNG of the size asked for, in bands of colour (so that it can be told apart on the board)
function png(width, height, colours) {
  const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  const rows = [];
  for (let y = 0; y < height; y += 1) { const row = Buffer.alloc(1 + width * 3); const c = colours[Math.floor((y / height) * colours.length)]; for (let x = 0; x < width; x += 1) row.set(c, 1 + x * 3); rows.push(row); }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}
const sizeFor = (b) => [Math.round(600 * b.width / b.height), 600];

const context = await browser.newContext({ viewport: { width: 1000, height: 640 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
const page = await context.newPage(); page.setDefaultTimeout(240000);
page.on('pageerror', (e) => check('no error in the page', false, e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 4\d\d/.test(m.text())) check('no error in the console', false, m.text()); });
const shot = (name) => page.screenshot({ path: resolve(out, `${name}.png`) });
const username = `Adv_${Math.random().toString(36).slice(2, 8)}`;

await page.goto(`${origin}/#nointro-gameclock`, { timeout: 300000 });
await page.waitForFunction(() => !!(window.__nlw && window.__nlw.intro), null, { timeout: 300000 });
await page.waitForSelector('#open-signup', { state: 'visible', timeout: 300000 });
await page.click('#open-signup');
await page.fill('#account-username', username); await page.fill('#account-password', 'a password for the advertising test');
await page.click('#account-submit');
await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 120000 });
await pastQuestion(page);
await page.fill('#name', 'Advert Test');
await enterTown(page);
await page.waitForFunction(() => window.__nlw.me && window.__nlw.me.mixer && window.__nlw.beyond && window.__nlw.billboards, null, { timeout: 240000 });
// (noon, so that the pictures can be seen)
await page.evaluate(() => { const g = window.__nlw.host.game; const day = Math.floor(g.state.t / 86400); g.state.t = day * 86400 + 12 * 3600; });

// ---- the billboards, empty ----
const stats = await page.evaluate(() => window.__nlw.billboards.stats);
check('the fifty billboards are built, as instances of their kinds, ten of them screens', stats.boards === ZONE_BILLBOARDS.length && stats.boards === 50 && stats.kinds === Object.keys(BILLBOARD_TYPES).length && stats.screens === 10, stats);
// stand in front of one: the camera looks at its face from the road
const front = (b, back = 1) => {
  const t = BILLBOARD_TYPES[b.type], D = (Math.max(b.width, b.height * 2.2) * 0.9 + 6) * back;
  const nx = Math.sin(b.heading), nz = Math.cos(b.heading);
  return { x: b.x + nx * D, z: b.z + nz * D, yaw: b.heading + Math.PI, lift: (t.bottom * b.scale + b.height / 2) };
};
async function lookAt(b, back = 1) {
  const f = front(b, back);
  await page.evaluate(([p]) => { const n = window.__nlw; n.place(p.x, p.z); n.face(p.yaw); n.cam.yaw = p.yaw; n.cam.dist = 3; n.cam.pitch = -0.05; }, [f]);
  await page.waitForTimeout(1600);
}
const drawn = [];
for (const type of Object.keys(BILLBOARD_TYPES)) {
  const b = ZONE_BILLBOARDS.find((x) => x.type === type);
  await lookAt(b);
  const seen = await page.evaluate(() => ({ drawn: window.__nlw.drawn, shown: window.__nlw.billboards.stats.shown, full: window.__nlw.billboards.stats.full }));
  drawn.push(seen.drawn);
  await shot(`kind-${type}`);
}
check('the billboards near a player are drawn in full, the rest as outlines or not at all', drawn.length === 17, drawn);

// ---- booking one in the ADS app ----
const sql = await database();
const me = (await sql.unsafe('select a.id, w.id as wallet from pcw.accounts a join pcw.wallets w on w.account_id = a.id where a.username_key = $1', [username.toLowerCase()]))[0];
// earned in town: 9,000 TR, as the bank takes a game's earnings (a controlled test account)
{
  const world = (await sql.unsafe("select id from pcw.wallets where code = 'world'"))[0].id;
  const have = Number((await sql.unsafe('select balance - starter - illicit as earned from pcw.wallets where id = $1', [me.wallet]))[0].earned);
  if (have < 9000 * TR) await sql.begin(async (tx) => wallet.post(tx, { kind: 'game', actor: me.id, key: `test-earn2:${me.id}`, note: 'Earned in town (the advertising test)', legs: [{ wallet: me.wallet, amount: 9000 * TR - have, bucket: 'earned' }, { wallet: await wallet.systemWallet(tx, 'world'), amount: -(9000 * TR - have) }] }));
}
await page.evaluate(() => window.__nlw.online.ask('wallet.get', {}));

const board = ZONE_BILLBOARDS.find((b) => b.category === 'medium' && b.region === 'town' && !BILLBOARD_TYPES[b.type].tv);
await page.evaluate(() => window.__nlw.ui.openPhone());
await page.waitForTimeout(500);
check('the phone has an ADS app and no Admin app', await page.evaluate(() => !!document.querySelector('.app[data-app="ads"]') && !document.querySelector('.app[data-app="admin"]')), null);
await page.click('.app[data-app="ads"]');
await page.waitForSelector('#ad-prices');
await page.waitForSelector('#ads-mine, #ads-none', { timeout: 30000 });
await shot('ads-01-home');
const prices = await page.evaluate(() => [...document.querySelectorAll('#ad-prices .adprice:not(.head)')].map((r) => r.textContent));
check('ADS shows the five prices, fee and tax', prices.length === 5 && /Small66 TR4 TR70 TR/.test(prices[0]) && /731 TR/.test(prices[4]), prices);
await page.click('#ads-browse');
await page.waitForSelector('#ads-boards');
await shot('ads-02-boards');
const listed = await page.evaluate(() => document.querySelector('#ads-count').textContent);
check('every billboard can be chosen from', listed.startsWith(`${ZONE_BILLBOARDS.length} `), listed);
await page.evaluate((id) => window.__nlw.ui.openPhone('ads', { board: id }), board.id);
await page.waitForSelector('#ad-breakdown', { timeout: 30000 });
await shot('ads-03-board');
const quoted = await page.evaluate(() => document.querySelector('#ad-total').textContent);
check('the server\'s price for a week of a medium board: 980 TR', /980/.test(quoted), quoted);
await page.click('#ads-continue');
await page.waitForSelector('#ad-brand');
await page.fill('#ad-brand', 'Okwuosa Bakery');
await page.fill('#ad-link', 'okwuosabakery.example.com');
// the wrong shape first: refused by the page, with the shape it must be
const wrong = resolve(out, 'square.png'); writeFileSync(wrong, png(800, 800, [[200, 40, 40]]));
await page.setInputFiles('#ad-file', wrong);
await page.waitForSelector('#ad-problem', { timeout: 30000 });
const refusedShape = await page.evaluate(() => document.querySelector('#ad-problem').textContent);
check('a picture of the wrong shape is refused, and the shape it must be is said', /not the shape/.test(refusedShape), refusedShape);
const right = resolve(out, 'flier.png'); const [fw, fh] = sizeFor(board); writeFileSync(right, png(fw, fh, [[230, 30, 40], [255, 210, 0], [20, 90, 200]]));
await page.setInputFiles('#ad-file', right);
await page.waitForSelector('#ad-art .adslide img', { timeout: 60000 });
await shot('ads-04-form');
await page.click('#ads-review');
await page.waitForSelector('#ad-agree', { timeout: 30000 });
check('Submit waits for the terms to be accepted', await page.evaluate(() => document.querySelector('#ads-submit').disabled), null);
await page.click('#ads-read-terms');
await page.waitForSelector('#ad-terms-text');
await shot('ads-05-terms');
const termsText = await page.evaluate(() => document.querySelector('#ad-terms-text').textContent);
check('the terms are there to read, all fifteen sections', /15\. Acceptance/.test(termsText) && /Ponzi/.test(termsText), termsText.length);
await page.click('#page-back');
await page.waitForSelector('#ad-agree');
await page.check('#ad-agree');
await shot('ads-06-review');
await page.click('#ads-submit');
await page.waitForSelector('#ad-done', { timeout: 60000 });
await shot('ads-07-done');
const held = await page.evaluate(() => window.__nlw.online.ask('wallet.get', {}));
check('980 TR of earned TR is held, the arrival money untouched', held.wallet.adHeld === 980 * TR && held.wallet.starter === 2000 * TR, held.wallet);
const shownBefore = await page.evaluate(async () => (await window.__nlw.online.ask('ads.board', {})).campaigns.length);
check('nothing is shown on any billboard before it is approved', shownBefore === 0, shownBefore);

// ---- the administrator ----
await sql.unsafe("update pcw.accounts set role = 'admin' where id = $1", [me.id]);
await page.evaluate(() => window.__nlw.online.check());
await page.evaluate(() => window.__nlw.ui.openPhone());
await page.waitForSelector('.app[data-app="admin"]', { timeout: 30000 });
await page.click('.app[data-app="admin"]');
await page.waitForSelector('[data-review]', { timeout: 30000 });
await page.waitForSelector('[data-review] img', { timeout: 30000 });
await shot('admin-01-review');
await page.click('[data-approve]');
await page.waitForSelector('#admin-ads-none, .notice.good', { timeout: 30000 });
const decided = (await sql.unsafe('select status, start_at from pcw.ad_campaigns where account_id = $1', [me.id]))[0];
check('Approve approves it, to begin on its first day', decided.status === 'approved' && new Date(decided.start_at) > new Date(), decided);
await page.evaluate(() => window.__nlw.ui.openPhone('admin', { tab: 'money' }));
await page.waitForSelector('#admin-money', { timeout: 60000 });
await shot('admin-02-money');
const money = await page.evaluate(() => document.querySelector('#admin-money').textContent);
check('the administrator sees the advertising tax taken: 56 TR', /56 TR/.test(money), money.slice(0, 200));
await page.keyboard.press('Escape');

// ---- its first day: on its billboard, and on no other ----
await sql.unsafe("update pcw.ad_campaigns set start_at = now() - interval '1 minute', end_at = now() + interval '7 days' where account_id = $1", [me.id]);
// a digital screen too, with three slides, booked and approved the same way through the server
const tv = ZONE_BILLBOARDS.find((b) => b.tv && b.type === 'tv-unipole');
const [tw, th] = sizeFor(tv);
const tvId = await page.evaluate(async ([boardId, slides]) => {
  const o = window.__nlw.online;
  const d = await o.ask('ads.draft', { key: crypto.randomUUID(), billboard: boardId, duration: '1w', brand: 'Asaba Phones', link: 'https://asabaphones.example.com' });
  for (let i = 0; i < slides.length; i += 1) { const u = await o.ask('ads.upload', { campaign: d.campaign.id, index: i, data: slides[i] }, { timeout: 60000 }); if (!u.ok) return u; }
  const s = await o.ask('ads.submit', { campaign: d.campaign.id, terms: 'ads-terms-2026-10-13', accepted: true, rights: true });
  if (!s.ok) return s;
  const a = await o.ask('admin.ad.decide', { campaign: d.campaign.id, approve: true, note: 'Test' });
  return a.ok ? d.campaign.id : a;
}, [tv.id, [[255, 0, 0], [0, 200, 0], [0, 0, 255]].map((c) => png(tw, th, [c]).toString('base64'))]);
check('a screen campaign of three slides is booked and approved', typeof tvId === 'string', tvId);
await sql.unsafe("update pcw.ad_campaigns set start_at = now() - interval '1 minute' where id = $1", [tvId]);
await page.evaluate(() => window.__nlw.adBoard.refresh());
await page.waitForFunction(() => window.__nlw.billboards.boards.some((b) => b.art), null, { timeout: 60000 }).catch(() => null);
await page.waitForTimeout(1000);
const onBoards = await page.evaluate(() => window.__nlw.billboards.boards.filter((b) => b.art).map((b) => b.id));
check('the picture is on its billboard and on no other', onBoards.length === 1 && onBoards[0] === board.id, onBoards);
await lookAt(board);
await page.waitForTimeout(1000);
await shot('board-approved');
const topColour = await page.evaluate((id) => { const b = window.__nlw.billboards.boards.find((x) => x.id === id); const c = b.art.material.map.image; const p = c.getContext('2d').getImageData(c.width / 2, 2, 1, 1).data; return [p[0], p[1], p[2]]; }, board.id);
check('the flier is the right way up (its red band at the top)', topColour[0] > 200 && topColour[2] < 80, topColour);
await lookAt(tv);
const colours = [];
for (let i = 0; i < 3; i += 1) {
  const c = await page.evaluate((id) => { const s = window.__nlw.billboards.screens.find((x) => x.b.id === id); const g = s.face.canvas.getContext('2d'); const p = g.getImageData(s.face.canvas.width / 2, s.face.canvas.height / 2, 1, 1).data; return [p[0], p[1], p[2]]; }, tv.id);
  colours.push(c);
  await shot(`screen-slide-${i}`);
  await page.waitForTimeout(8200);
}
check('the screen shows its slides in turn', new Set(colours.map((c) => c.indexOf(Math.max(...c)))).size >= 2, colours);

await closeDatabase();
await browser.close();
server.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `${failed} FAILED` : 'all ok');
process.exit(failed ? 1 : 0);
