// The Post Civil War Sports Mall in a headless browser, on the website as it is served with its server and a database
// (30 October 2026, the owner's brief: a shopping mall, like the car showroom, where his sports models are sold for TR):
//   - beside the Kwale road: the mall, the game's own building, its name on its front and on its roof, the banners by its
//     doors, railings round the compound and the arch over the gateway with the name;
//   - walked up to, the doors open and take the player in: the screen goes dark and comes back inside; the hall is
//     drawn, the building round it is not, and the camera stays inside it;
//   - the eight things on their stands, each the owner's model with the picture its distance asks for (hall-models.js,
//     render-sports.js PLAN), the skates as a pair, the surfboard on its tail, the speedboat on its platform;
//   - asked about the bicycle: the phone's conversation opens with Nkem (its card: what moves it, how fast, its price,
//     300 TR); asked, she says the arrival money pays; bought with the arrival money: it is the player's, in Property;
//   - out by the mat; gone well away, every model let go;
//   - nothing goes wrong in the page.
//   ../server/with-postgres.sh node test/sports.mjs [shots folder] [phone]

import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDevServer } from '../../server/dev.mjs';
import { pastQuestion, enterTown, watchPictures, lostPictures } from './start.mjs';
import { SPORTS_MALL as M } from '../src/sim/zones/asaba-sports.js';
import { SPORTS } from '../src/sim/sports.js';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
if (!process.env.PCW_DATABASE_URL) { console.error('PCW_DATABASE_URL is not set: run this with server/with-postgres.sh'); process.exit(2); }
const out = process.argv[2] || '/tmp/sports-shots';
const PHONE = process.argv[3] === 'phone';
mkdirSync(out, { recursive: true });
const server = createDevServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); };
const tag = Math.random().toString(36).slice(2, 6);

const context = await browser.newContext(PHONE ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, serviceWorkers: 'block' } : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
await watchPictures(context);
const page = await context.newPage(); page.setDefaultTimeout(240000);
page.on('pageerror', (e) => check('no error in the page', false, e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 4\d\d/.test(m.text())) check('no error in the console', false, m.text()); });
const shot = (name) => page.screenshot({ path: resolve(out, `${name}.png`) });
const username = `Sport_${tag}`;
const password = 'a password for the sports mall test';

await page.goto(`${origin}/#nointro-gameclock${PHONE ? '-lite' : ''}`, { timeout: 600000 });
await page.waitForFunction(() => !!(window.__nlw && window.__nlw.intro), null, { timeout: 600000 });
await page.waitForSelector('#open-signup', { state: 'visible', timeout: 300000 });
await page.click('#open-signup');
await page.fill('#account-username', username); await page.fill('#account-password', password);
await page.click('#account-submit');
await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 120000 });
await pastQuestion(page);
await page.fill('#name', 'Sports Mall Test');
await enterTown(page, { tap: PHONE, wait: 900000 });
await page.waitForFunction(() => window.__nlw.me && window.__nlw.me.mixer, null, { timeout: 600000 });
if (PHONE) await page.evaluate(() => window.__nlw.setGraphics('medium'));
await page.evaluate(() => { const n = window.__nlw; const hour = n.view.clock.hourFloat; if (hour < 9 || hour > 15) n.skip((24 + 10 - hour) % 24); const g = n.host.game; g.state.weather = { kind: 'clear', until: g.state.t + 8 * 3600 }; });

const go = async (x, z, h, cam) => {
  await page.evaluate(([x, z, h, cam]) => { const n = window.__nlw; n.place(x, z); n.face(h); if (cam) { n.cam.yaw = cam.yaw; n.cam.pitch = cam.pitch; n.cam.dist = cam.dist; n.rig.snap(n.cam); } }, [x, z, h, cam || null]);
};
const D = M.doors, E = M.entry, H = M.hall, G = M.gateway;

// ---- from the road: the compound, the mall, its name ----
await go(G.x, -45, Math.PI, { yaw: Math.PI - 0.1, pitch: 0.1, dist: 30 });
await page.waitForFunction(() => { const s = window.__nlw.sportsView; return s && s.state().built; }, null, { timeout: 120000 }).catch(() => {});
await page.waitForTimeout(3000);
const built = await page.evaluate(() => { const s = window.__nlw.sportsView; return { state: s.state(), signs: s.front ? s.front.signs.map((m) => m.name) : [], banners: s.front ? s.front.banners.map((m) => m.name) : [], railings: s.railings, exterior: s.exterior.visible, outside: s.outside.visible }; });
check('beside the Kwale road the mall stands, its name across its front and on its roof, the banners by its doors, the railings round its compound', built.state.built && built.exterior && built.outside && built.signs.includes('sports-name') && built.signs.includes('sports-crown') && built.banners.length === 2 && built.railings && built.railings.posts > 100, built);
await shot('01-from-the-road');
await go(G.x + 40, -30, Math.PI + 0.6, { yaw: Math.PI + 0.55, pitch: 0.22, dist: 70 });
await page.waitForTimeout(2500);
await shot('02-the-compound');
await go(E.x, E.z + 14, Math.PI, { yaw: Math.PI, pitch: 0.08, dist: 10 });
await page.waitForTimeout(2500);
await shot('03-the-front');

// ---- in by the doors ----
await go(E.x, E.z + 6, Math.PI, { yaw: Math.PI, pitch: 0.18, dist: 7 });
await page.waitForTimeout(800);
await page.keyboard.down('w');
let doorsOpen = 0, faded = false;
for (let i = 0; i < 300 && !faded; i += 1) { await page.waitForTimeout(100); const s = await page.evaluate(() => ({ doors: window.__nlw.sportsView.state().doors, in: document.getElementById('fade').classList.contains('on') || window.__nlw.sports.inside })); doorsOpen = Math.max(doorsOpen, s.doors); faded = s.in; }
await page.keyboard.up('w');
check('walked up to, the mall\'s glass doors slide open, and stepping through them darkens the screen', faded && doorsOpen > 0.3, { faded, doorsOpen });
await page.waitForFunction(() => window.__nlw.sports.inside && !document.getElementById('fade').classList.contains('on'), null, { timeout: 30000 });
const inside = await page.evaluate(() => { const n = window.__nlw, s = n.sportsView; return { at: [+n.predicted.x.toFixed(2), +n.predicted.z.toFixed(2)], hall: !!s.hall && s.hall.group.visible, exterior: s.exterior.visible, outside: s.outside.visible }; });
check('it comes back inside the doors; the hall is drawn and the mall round it is not (the compound through the glass is)', Math.abs(inside.at[0] - M.arrive.x) < 0.01 && inside.at[1] <= M.arrive.z + 0.01 && inside.at[1] > M.arrive.z - 1 && inside.hall && !inside.exterior && inside.outside, inside);
await page.waitForTimeout(2000);
await shot('04-inside-the-doors');

// ---- the floor: the eight things ----
// the picture each should be drawn with, the player at (x, z): as hall-models.js chooses them with render-sports.js's plan
const PLAN = PHONE ? { inspect: '1k', near: '512', mid: '512', far: '512', nearRanks: 1 } : { inspect: '2k', near: '2k', mid: '1k', far: '512', nearRanks: 3 };
const RANGES = { inspect: 3.5, near: 9, mid: 18 }, ORDER = ['512', '1k', '2k'], CAP = ['2k', '2k', '1k', '512'];
const tiersAt = (at, level, shrink = 1) => {
  const gaps = M.displays.map((d) => Math.max(0, Math.hypot(d.x - at.x, d.z - at.z) - d.r));
  const tiers = [];
  gaps.map((gap, k) => [gap, k]).sort((a, b) => a[0] - b[0]).forEach(([full, k], rank) => {
    const gap = full / shrink;
    let t = rank === 0 && gap < RANGES.inspect ? PLAN.inspect : rank < PLAN.nearRanks && gap < RANGES.near ? PLAN.near : gap < RANGES.mid ? PLAN.mid : PLAN.far;
    const cap = CAP[Math.max(0, Math.min(3, level))];
    if (ORDER.indexOf(t) > ORDER.indexOf(cap)) t = cap;
    tiers[k] = t;
  });
  return tiers;
};
const settled = async (at, limit = 900000) => {
  const t0 = Date.now();
  let got = null;
  while (Date.now() - t0 < limit) {
    got = await page.evaluate(() => { const n = window.__nlw; return { shown: n.sportsView.shown(), state: n.sportsView.models(), level: n.qualityDetail }; });
    const want = tiersAt(at, got.level), keep = tiersAt(at, got.level, 1.25);
    const between = (t, lo, hi) => ORDER.indexOf(t) >= ORDER.indexOf(lo) && ORDER.indexOf(t) <= ORDER.indexOf(hi);
    if (got.shown.every((d, k) => d.model && between(d.tier, want[k], keep[k]))) return { ...got, want, ok: true };
    await page.waitForTimeout(1000);
  }
  return { ...got, want: got && tiersAt(at, got.level), ok: false };
};
const FLOOR = { x: D.x - 4.5, z: M.displays.find((d) => d.item === 'speedboat').z + 5 };
await go(FLOOR.x, FLOOR.z, Math.PI, { yaw: Math.PI + 0.35, pitch: 0.22, dist: 8 });
const floor = await settled(FLOOR);
check(`every one of the eight is the owner's model, drawn with the picture its distance from the player asks for (${PHONE ? 'a phone: the 1024 at hand, the 512 elsewhere' : 'a computer: the 2048 nearest, the 1024 and 512 further'})`, floor.ok && floor.shown.length === 8 && floor.shown.every((d) => d.model && d.loaded), { ok: floor.ok, level: floor.level, drawn: floor.shown.map((d) => `${d.item}:${d.tier}`), asked: floor.want, state: floor.state });
const camInside = await page.evaluate(() => { const c = window.__nlw.camera.position; return [c.x, c.y, c.z]; });
check('the camera stays inside the hall, under its ceiling', camInside[0] > H.x0 && camInside[0] < H.x1 && camInside[2] > H.z0 && camInside[2] < H.z1 && camInside[1] < H.ceiling, camInside);
await page.waitForTimeout(1500);
await shot('05-the-floor');
// each thing seen close to (the pictures for the owner)
for (const [k, item] of ['bicycle', 'inline-skates', 'surfboard', 'speedboat', 'e-scooter', 'skateboard', 'hoverboard', 'e-unicycle'].entries()) {
  const d = M.displays.find((q) => q.item === item);
  // (the player beside the stand, a little in front of it, looking at it; the camera behind them and to one side, so that
  // the thing is in the picture past them)
  const side = d.h + Math.PI / 2 * (d.x < M.doors.x ? 1 : -1), reach = d.r + (item === 'speedboat' ? 2.2 : 1.1);
  const at = { x: d.x + Math.sin(side) * reach + Math.sin(d.h) * 0.8, z: d.z + Math.cos(side) * reach + Math.cos(d.h) * 0.8 };
  const look = Math.atan2(d.x - at.x, d.z - at.z);
  await go(at.x, at.z, look, { yaw: look + (d.x < M.doors.x ? -0.75 : 0.75), pitch: 0.28, dist: item === 'speedboat' ? 9 : 4.6 });
  await page.waitForTimeout(item === 'speedboat' ? 3500 : 2500);
  await shot(`06-${String(k + 1).padStart(2, '0')}-${item}`);
}
const posed = await page.evaluate(() => { const s = window.__nlw.sportsView, h = s.hall.group; const find = (name) => { let f = null; h.traverse((o) => { if (o.name === name) f = o; }); return f; }; const skates = find('sports-display:inline-skates'), surf = find('sports-display:surfboard'); return { skates: skates ? skates.children.length : 0, surfUp: surf ? new THREE.Box3().setFromObject(surf).getSize(new THREE.Vector3()).y : 0 }; });
check('the skates stand as the pair they are sold as; the surfboard stands on its tail in its rack', posed.skates === 2 && posed.surfUp > 1.6, posed);

// ---- asking about the bicycle ----
const bike = M.displays.find((d) => d.item === 'bicycle');
await go(bike.x + Math.sin(bike.h) * (bike.r + 0.6), bike.z + Math.cos(bike.h) * (bike.r + 0.6), bike.h + Math.PI, { yaw: bike.h + Math.PI + 0.6, pitch: 0.2, dist: 5 });
await page.waitForTimeout(800);
const asking = await page.evaluate(() => { const p = window.__nlw.prompt(); return p ? { short: p.short, text: p.text } : null; });
check('at the bicycle the player is offered to ask about it', asking && asking.short === 'Ask' && asking.text === 'Ask about the Fat-Tyre Bicycle', asking);
await page.evaluate(() => window.__nlw.prompt().run());
await page.waitForSelector('#deal-log .msg.shop', { timeout: 60000 });
await page.waitForTimeout(1500);
const opened = await page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  return {
    head: q('.chathead .who b').textContent, role: q('.chathead .who span').textContent, brand: q('.dealitem .brandline') && q('.dealitem .brandline').textContent,
    card: q('.dealitem .what b').textContent, chips: [...document.querySelectorAll('.dealitem .spec')].map((c) => c.textContent), price: q('.dealitem .price').textContent,
    hello: [...document.querySelectorAll('#deal-log .msg.shop')].map((m) => m.textContent)[0] || '',
    quick: [...document.querySelectorAll('#deal-quick button')].map((b) => b.textContent), talk: window.__nlw.sports.talk, placeholder: q('#deal-text').placeholder,
  };
});
check('the conversation opens with Nkem: the bicycle\'s card, what moves it, how fast, its price of 300 TR', opened.head === 'Nkem' && opened.brand === 'Post Civil War Sports Mall' && opened.card === 'Fat-Tyre Bicycle' && opened.chips.includes('Pedalled') && opened.chips.includes('30 km/h') && /(^|[^\d,])300 TR/.test(opened.price) && opened.placeholder === 'Ask Nkem about it' && opened.talk && opened.talk.item === 'bicycle', opened);
check('Nkem greets the player about it, and says her answers are automatic', /Nkem/.test(opened.hello) && /automatic/.test(opened.hello) && /Fat-Tyre Bicycle/.test(opened.hello) && /300 TR/.test(opened.hello), opened.hello);
check('questions to tap are offered', opened.quick.length >= 5 && opened.quick.includes('Arrival money?'), opened.quick);
await shot('07-asking-nkem');
await page.click('#deal-quick button[data-ask="Arrival money?"]');
await page.waitForFunction(() => [...document.querySelectorAll('#deal-log .msg.shop')].some((m) => /arrival TR included/.test(m.textContent)), null, { timeout: 90000 }).catch(() => {});
const arrival = await page.evaluate(() => [...document.querySelectorAll('#deal-log .msg.shop')].map((m) => m.textContent).find((t) => /arrival/i.test(t)) || null);
check('asked, Nkem says the arrival money pays for it', /arrival TR included: a thing to ride from the mall is one thing arrival money can buy/.test(arrival || ''), arrival);
const before = await page.evaluate(() => window.__nlw.view.self.balance);
await page.click('#deal-buy');
await page.waitForSelector('#deal-yes', { timeout: 30000 });
const asked = await page.evaluate(() => (document.querySelector('#deal-yes').closest('div') || {}).textContent || '');
await page.click('#deal-yes');
await page.waitForSelector('#deal-done', { timeout: 60000 });
await page.waitForTimeout(2500);
const done = await page.evaluate(async () => { const n = window.__nlw; await n.market.mine(); return { text: document.querySelector('#deal-done').textContent, mine: n.market.state.mine.holdings.map((h) => h.asset.model), balance: n.view.self.balance }; });
check('with only the arrival money the bicycle is bought for 300 TR: it is the player\'s', /yours/.test(done.text) && done.mine.includes('sport:bicycle') && /300 TR/.test(asked), { ...done, asked, before });
await shot('08-bought');
await page.keyboard.press('Escape');
await page.waitForTimeout(800);
// in Property: the bicycle among what the player owns, with its photograph
await page.evaluate(() => window.__nlw.ui.openPhone('property', {}));
await page.waitForSelector('#my-assets', { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(2000);
const property = await page.evaluate(() => [...document.querySelectorAll('#my-assets .assetcard')].map((c) => ({ name: (c.querySelector('.what b') || {}).textContent, picture: getComputedStyle(c.querySelector('.turntable')).backgroundImage })));
check('it is in Property on the phone, with its photograph', property.some((c) => c.name === 'Fat-Tyre Bicycle' && /sport-bicycle-turn\.webp/.test(c.picture)), property);
await shot('09-property');
await page.keyboard.press('Escape');
await page.waitForTimeout(800);
// (nothing is brought into the hall: test/sports-mall.test.mjs, headless)

// ---- out by the mat ----
await page.evaluate(() => { if (window.__nlw.ui.isOpen()) window.__nlw.ui.close(); });
const MAT = { x: (M.exit.x0 + M.exit.x1) / 2, z: (M.exit.z0 + M.exit.z1) / 2 };
await go(MAT.x, MAT.z - 1.8, 0, { yaw: 0, pitch: 0.2, dist: 6 });
await page.waitForTimeout(500);
await page.keyboard.down('w');
let left = false;
for (let i = 0; i < 300 && !left; i += 1) { await page.waitForTimeout(100); left = await page.evaluate(() => !window.__nlw.sports.inside); }
await page.keyboard.up('w');
await page.waitForFunction(() => !document.getElementById('fade').classList.contains('on'), null, { timeout: 20000 });
const outside = await page.evaluate(() => { const n = window.__nlw, s = n.sportsView; return { at: [+n.predicted.x.toFixed(2), +n.predicted.z.toFixed(2)], hall: s.hall.group.visible, exterior: s.exterior.visible }; });
check('the mat inside the doors takes the player out before them; the mall is drawn again, the hall is not', left && Math.hypot(outside.at[0] - M.leave.x, outside.at[1] - M.leave.z) < 0.6 && !outside.hall && outside.exterior, outside);
{
  const kept = await page.evaluate(() => window.__nlw.sportsView.models().tiers.filter(Boolean).length);
  await go(D.x, D.z + 180, 0, { yaw: 0, pitch: 0.2, dist: 6 });
  await page.waitForFunction(() => window.__nlw.sportsView.models().tiers.every((t) => !t), null, { timeout: 30000 }).catch(() => {});
  const away = await page.evaluate(() => window.__nlw.sportsView.models());
  check('just outside the doors the models are kept (for stepping back in); gone well away, every one is let go', kept > 0 && away.tiers.every((t) => !t) && away.running === 0 && away.waiting === 0, { kept, away });
}
if (PHONE) {
  // the graphics card's memory, at the doors and inside, on a phone's settings at Medium
  await go(M.arrive.x, M.arrive.z, Math.PI, { yaw: Math.PI, pitch: 0.18, dist: 7 });
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.__nlw.goSports('in'));
  await page.waitForFunction(() => window.__nlw.sports.inside, null, { timeout: 30000 }).catch(() => {});
  await settled({ x: M.arrive.x, z: M.arrive.z }, 300000);
  await page.waitForTimeout(5000);
  const mem = await page.evaluate(() => { const n = window.__nlw; return { pictures: +((n.graphics.pictures || 0) / 1048576).toFixed(1), buffers: +((n.graphics.buffers || 0) / 1048576).toFixed(1), triangles: n.perf.triangles, calls: n.perf.calls }; });
  check('on a phone at Medium the graphics card holds under 135 MB in the hall', mem.pictures + mem.buffers < 135, mem);
}
{ const lost = await lostPictures(page); check('no picture was handed to the graphics card after the page had let go of it (nothing drawn black)', lost === 0, lost); }
await browser.close();
server.close();
const failed = results.filter((r) => !r).length;
console.log(`${results.length - failed} of ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
