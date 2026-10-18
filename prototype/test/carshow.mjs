// The Post Civil War Car Showroom in a headless browser, on the website as it is served with its server and a
// database:
//   - the compound beside the Kwale road: the owner's five buildings drawn from their files, the showroom's name on
//     its podium and its tower; white railings all round, a camera on each corner post that turns and blinks red;
//   - the gate: shut with nobody near; walked up to, its glass leaves slide apart slowly; it waits, then closes;
//   - walked up to, the showroom's doors open and take the player in: the screen goes dark and comes back inside;
//     the buildings are not drawn round the hall, the hall is, and the camera stays inside it;
//   - the twenty cars on their stands: on a computer every one of them the owner's model, with the pictures its
//     distance asks for (the one the player stands at the largest, the far end of the hall the smallest:
//     hall-models.js); gone well away from the doors, every model let go;
//   - Tochi and Oluchi, each looking after one side of the floor: the one whose side the player is on comes over;
//   - asked about a car: the phone's conversation opens with whoever sells it (its card, its top speed, its price);
//     the arrival money buys it (since 18 October 2026, as it does a motorcycle), at the owner's new price;
//   - another player asking about a car on the other side of the floor is looked after by the other;
//   - out by the mat at the doors; the car brought from Property; driven (its engine heard, its speedometer, its
//     wheels and steering, its brake lamps), the gate opening ahead of it from further off; out of it, it stands
//     where it was left; its headlamps at night;
//   - another player's car, driven past: seen and heard here;
//   - nothing goes wrong in the page.
//   ../server/with-postgres.sh node test/carshow.mjs [shots folder]

import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createDevServer } from '../../server/dev.mjs';
import { pastQuestion, enterTown } from './start.mjs';
import { CARSHOW } from '../src/sim/zones/asaba-carshow.js';
import { HALL as SETS } from '../src/client/budget.js';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
if (!process.env.PCW_DATABASE_URL) { console.error('PCW_DATABASE_URL is not set: run this with server/with-postgres.sh'); process.exit(2); }
const out = process.argv[2] || '/tmp/carshow-shots';
mkdirSync(out, { recursive: true });
const server = createDevServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); };
const TR = 2;
const tag = Math.random().toString(36).slice(2, 6);


const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
const page = await context.newPage(); page.setDefaultTimeout(240000);
page.on('pageerror', (e) => check('no error in the page', false, e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 4\d\d/.test(m.text())) check('no error in the console', false, m.text()); });
const shot = (name) => page.screenshot({ path: resolve(out, `${name}.png`) });
const username = `Cars_${tag}`;
const password = 'a password for the car showroom test';

await page.goto(`${origin}/#nointro-gameclock`, { timeout: 300000 });
await page.waitForFunction(() => !!(window.__nlw && window.__nlw.ready), null, { timeout: 300000 });
await page.waitForSelector('#open-signup', { state: 'visible', timeout: 300000 });
await page.click('#open-signup');
await page.fill('#account-username', username); await page.fill('#account-password', password);
await page.click('#account-submit');
await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 120000 });
await pastQuestion(page);
await page.fill('#name', 'Car Showroom Test');
await enterTown(page);
await page.waitForFunction(() => window.__nlw.me && window.__nlw.me.mixer, null, { timeout: 240000 });
await page.evaluate(() => { const n = window.__nlw; const hour = n.view.clock.hourFloat; if (hour < 9 || hour > 15) n.skip((24 + 10 - hour) % 24); const g = n.host.game; g.state.weather = { kind: 'clear', until: g.state.t + 8 * 3600 }; });

const go = async (x, z, h, cam) => {
  await page.evaluate(([x, z, h, cam]) => { const n = window.__nlw; n.place(x, z); n.face(h); if (cam) { n.cam.yaw = cam.yaw; n.cam.pitch = cam.pitch; n.cam.dist = cam.dist; n.rig.snap(n.cam); } }, [x, z, h, cam || null]);
};
// where things are (asaba-carshow.js)
const G = { x: -420, z: -70 };
const DOORS = { x: -420.7, z: -156.09 };
const ENTRY = { x: -420.7, z: -155.19 };
const HALL = { x0: -443.95, z0: -194.57, x1: -360.49, z1: -157.09 };
const MAT = { x: -420.7, z: HALL.z1 - 0.5 };

// ---- from the road: the compound, its railings, its gate, its buildings ----
await go(G.x, -40, Math.PI, { yaw: Math.PI - 0.12, pitch: 0.1, dist: 34 });
await page.waitForFunction(() => window.__nlw.carshowView.buildings.every((b) => b.loaded || b.failed), null, { timeout: 600000 }).catch(() => {});
const built = await page.evaluate(() => { const c = window.__nlw.carshowView; return { buildings: c.buildings, signs: c.signs.map((s) => s.name), fence: c.fence, cams: c.cams.length, exterior: c.exterior.visible, outside: c.outside.visible }; });
check('the owner\'s five buildings are drawn from the supplied files, whole', built.buildings.length === 5 && built.buildings.every((b) => b.loaded && !b.failed && b.triangles > 1000), built.buildings);
check('the showroom\'s name stands on its podium and on its tower', built.signs.filter((s) => s === 'carshow-name').length === 1 && built.signs.filter((s) => s === 'carshow-crown').length === 2, built.signs);
check('white railings all round, a bar every thirteen centimetres; a camera on each of the four corner posts', built.fence.bars > 6000 && built.fence.posts > 100 && built.cams === 4, { fence: built.fence, cams: built.cams });
await page.waitForTimeout(3000);
await shot('01-from-the-road');
await go(G.x + 60, -20, Math.PI + 0.5, { yaw: Math.PI + 0.45, pitch: 0.18, dist: 90 });
await page.waitForTimeout(3000);
await shot('02-the-compound');

// ---- the gate ----
await go(G.x, -30, Math.PI, { yaw: Math.PI, pitch: 0.12, dist: 9 });
await page.waitForFunction(() => window.__nlw.view.carshowGate === 0, null, { timeout: 30000 }).catch(() => {});
const shut = await page.evaluate(() => ({ sim: window.__nlw.view.carshowGate, drawn: window.__nlw.carshowView.state().gate }));
check('with nobody near, the gate is shut', shut.sim === 0 && shut.drawn < 0.02, shut);
await shot('03-the-gate-shut');
await go(G.x - 1.5, G.z + 9, Math.PI, { yaw: Math.PI - 0.25, pitch: 0.12, dist: 9 });
const opening = [];
for (let i = 0; i < 40; i += 1) { opening.push(await page.evaluate(() => window.__nlw.view.carshowGate)); if (opening[opening.length - 1] >= 1) break; await page.waitForTimeout(250); }
check('walked up to, its leaves slide apart slowly, all the way', opening[opening.length - 1] === 1 && opening.filter((v) => v > 0 && v < 1).length >= 3, opening);
await page.waitForTimeout(1200);
await shot('04-the-gate-open');
const walkThrough = await page.evaluate(([x, z]) => window.__nlw.walkable(x, z), [G.x - 1.5, G.z - 0.35]);
check('open, the way through it is clear', walkThrough, null);
await go(G.x, -25, Math.PI);
const closing = [];
for (let i = 0; i < 60; i += 1) { closing.push(await page.evaluate(() => window.__nlw.view.carshowGate)); if (closing[closing.length - 1] === 0) break; await page.waitForTimeout(250); }
check('when they have gone it waits a little, then closes', closing[0] === 1 && closing[closing.length - 1] === 0 && closing.filter((v) => v === 1).length >= 3, closing);

// ---- the cameras on the corner posts: turning, and blinking red now and then ----
await go(-545, -82, 0, { yaw: 0.6, pitch: 0.25, dist: 12 });
await page.evaluate(() => {
  const n = window.__nlw, rec = window.__cams = { frames: [], stop: false };
  const look = () => { if (rec.stop) return; rec.frames.push(n.carshowView.state().cams); requestAnimationFrame(look); };
  requestAnimationFrame(look);
});
await page.waitForFunction(() => { const f = window.__cams.frames; return f.length > 10 && [0, 1, 2, 3].some((k) => Math.abs(f[f.length - 1][k].yaw - f[0][k].yaw) > 0.05); }, null, { timeout: 120000 }).catch(() => {});
const cams = await page.evaluate(() => {
  const rec = window.__cams; rec.stop = true;
  const f = rec.frames, first = f[0], last = f[f.length - 1];
  const n = window.__nlw, c = n.carshowView.cams[2];        // the corner by the player (the front corner on the west)
  const at = c.root.position, to = Math.atan2(n.predicted.x - at.x, n.predicted.z - at.z);
  let d = (to - c.yaw) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
  return { frames: f.length, turned: [0, 1, 2, 3].map((k) => +Math.abs(last[k].yaw - first[k].yaw).toFixed(3)), blinked: [0, 1, 2, 3].map((k) => f.some((q) => q[k].lit) && f.some((q) => !q[k].lit)), watching: +Math.abs(d).toFixed(3) };
});
// (the blinking, by the cameras' own clock, a twenty-fifth of a second at a time over three seconds: a software-drawn
// browser shows a frame now and then, and a blink lasts a sixth of a second)
const blink = await page.evaluate(() => {
  const n = window.__nlw, v = n.carshowView, seen = [[], [], [], []];
  const t0 = (Date.now() / 1000) % 1e5;
  for (let k = 0; k < 80; k += 1) { v.tick(0.04, { eye: n.camera.position, player: n.predicted, now: t0 + k * 0.04, people: [n.predicted], gateOpen: n.view.carshowGate || 0 }); v.state().cams.forEach((c, i) => seen[i].push(c.lit)); }
  return seen.map((s) => s.some(Boolean) && s.some((x) => !x));
});
check('each camera turns, and blinks red now and then', blink.every(Boolean) && cams.turned.some((v) => v > 0.05), { ...cams, blinked: blink });
check('the camera nearest the player turns to watch them', cams.watching < 0.3, cams.watching);
await shot('05-a-camera-watching');

// ---- in by the doors ----
await go(ENTRY.x, ENTRY.z + 6, Math.PI, { yaw: Math.PI, pitch: 0.18, dist: 7 });
await page.waitForTimeout(800);
await page.keyboard.down('w');
let doorsOpen = 0, faded = false;
for (let i = 0; i < 300 && !faded; i += 1) { await page.waitForTimeout(100); const s = await page.evaluate(() => ({ doors: window.__nlw.carshowView.state().doors, in: document.getElementById('fade').classList.contains('on') || window.__nlw.carshow.inside })); doorsOpen = Math.max(doorsOpen, s.doors); faded = s.in; }
await page.keyboard.up('w');
check('walked up to, the showroom\'s glass doors slide open, and stepping through them darkens the screen', faded && doorsOpen > 0.3, { faded, doorsOpen });
await page.waitForFunction(() => window.__nlw.carshow.inside && !document.getElementById('fade').classList.contains('on'), null, { timeout: 30000 });
const inside = await page.evaluate(() => { const n = window.__nlw, c = n.carshowView; return { at: [+n.predicted.x.toFixed(2), +n.predicted.z.toFixed(2)], hall: !!c.hall && c.hall.group.visible, exterior: c.exterior.visible, outside: c.outside.visible }; });
// (set down just inside them, at z -159.49; W is still held for a moment after, while the test sees the screen darken,
// so the player may have walked a step further in, never out)
check('it comes back inside the doors; the hall is drawn and the buildings round it are not (the compound through the glass is)', inside.at[0] === -420.7 && inside.at[1] <= -159.48 && inside.at[1] > -160.3 && inside.hall && !inside.exterior && inside.outside, inside);
await page.waitForTimeout(2500);
await shot('06-inside-the-doors');

// ---- the floor: the twenty cars ----
// The set of pictures each car should be drawn with, the player at (x, z): as hall-models.js chooses them (budget.js,
// HALL), the largest given up first on a device that is struggling (`level`), worked out here on its own.
const ORDER = ['512', '1k', '2k', '4k'], CAP = ['4k', '2k', '1k', '512'];
const hallTiers = (at, { lite, level }, ranges = { inspect: 4, near: 12, mid: 24 }, shrink = 1) => {
  const plan = SETS[lite ? 'lite' : 'full'];
  const gaps = CARSHOW.displays.map((d) => Math.max(0, Math.hypot(d.x - at.x, d.z - at.z) - d.r));
  const tiers = [];
  gaps.map((gap, k) => [gap, k]).sort((a, b) => a[0] - b[0]).forEach(([full, k], rank) => {
    const gap = full / shrink;
    let t = rank === 0 && gap < ranges.inspect ? plan.inspect : rank < plan.nearRanks && gap < ranges.near ? plan.near : gap < ranges.mid ? plan.mid : plan.far;
    const cap = CAP[Math.max(0, Math.min(3, level))];
    if (t && ORDER.indexOf(t) > ORDER.indexOf(cap)) t = cap;
    tiers[k] = t;
  });
  return tiers;
};
// (waits until the cars are drawn with the sets the player's place asks for; gives what is drawn, and what was asked)
const settled = async (at, limit = 900000) => {
  const t0 = Date.now();
  let got = null;
  while (Date.now() - t0 < limit) {
    got = await page.evaluate(() => { const n = window.__nlw; return { shown: n.carshowView.shown(), state: n.carshowView.models(), level: n.quality, lite: !!n.lite }; });
    // (each with what its distance asks for, or a set it already had that it keeps while it is within a quarter of
    // that set's distance again: hall-models.js gives a vehicle a smaller set only once it is clearly further off, so
    // that nothing flickers between two sets at the edge of one)
    const want = hallTiers(at, got), keep = hallTiers(at, got, undefined, 1.25);
    const rankOf = (t) => (t ? ORDER.indexOf(t) : -1);         // (no set at all: its picture, on a phone)
    const between = (t, lo, hi) => rankOf(t) >= rankOf(lo) && rankOf(t) <= rankOf(hi);
    if (got.shown.every((d, k) => between(d.tier, want[k], keep[k]) && (d.model ? !d.picture : d.picture))) return { ...got, want, keep, ok: true };
    await page.waitForTimeout(1000);
  }
  return { ...got, want: got && hallTiers(at, got), ok: false };
};
const FLOOR = { x: -421.8, z: -164.4 };
await go(FLOOR.x, FLOOR.z, -Math.PI / 2, { yaw: -Math.PI / 2 - 0.5, pitch: 0.2, dist: 7.5 });
const floor = await settled(FLOOR);
const models = floor.shown.filter((d) => d.model), pictures = floor.shown.filter((d) => d.picture);
check('every car is the owner\'s model, drawn with the pictures its distance from the player asks for (the one the player stands at the largest); each is drawn once, as its model or (on a phone, across the hall) as a picture of it',
  floor.ok && models.length + pictures.length === 20 && floor.shown.every((d) => d.model !== d.picture) && (floor.lite || models.length === 20),
  { ok: floor.ok, level: floor.level, lite: floor.lite, drawn: floor.shown.map((d) => `${d.car}:${d.model ? d.tier : 'picture'}`), asked: floor.want, state: floor.state });
const camInside = await page.evaluate(() => { const c = window.__nlw.camera.position; return [c.x, c.y, c.z]; });
check('the camera stays inside the hall, under its ceiling', camInside[0] > HALL.x0 && camInside[0] < HALL.x1 && camInside[2] > HALL.z0 && camInside[2] < HALL.z1 && camInside[1] < 7.2, camInside);
await shot('07-the-floor');
const spin0 = await page.evaluate(() => window.__nlw.carshowView.hall.spin.rotation.y);
await go(-400.4, -164.4, Math.PI, { yaw: Math.PI + 0.3, pitch: 0.2, dist: 9 });
await page.waitForTimeout(3000);
const spin1 = await page.evaluate(() => window.__nlw.carshowView.hall.spin.rotation.y);
check('the gold hypercar turns on its turntable', Math.abs(spin1 - spin0) > 0.05, { spin0, spin1 });
await shot('08-the-hypercar');

// ---- Tochi and Oluchi ----
const saloon = { x: -426.11, z: -164.39, r: 3.3 };
const by = { x: saloon.x + saloon.r + 0.95, z: saloon.z };
await go(by.x, by.z, -Math.PI / 2, { yaw: -Math.PI / 2 - 0.6, pitch: 0.16, dist: 6.5 });
// (Oluchi may still be walking back to her desk from the player's look at the hypercar, on her side of the floor)
await page.waitForFunction(() => { const n = window.__nlw, t = n.carSalesmen[0].sim.state, o = n.carSalesmen[1]; return t.with && Math.hypot(t.x - n.predicted.x, t.z - n.predicted.z) < 2.2 && t.speed < 0.2 && Math.hypot(o.sim.state.x - o.spec.home.x, o.sim.state.z - o.spec.home.z) < 0.6; }, null, { timeout: 150000 }).catch(() => {});
const staff = await page.evaluate(() => { const n = window.__nlw; return n.carSalesmen.map((s) => ({ name: s.spec.name, mode: s.sim.state.mode, d: +Math.hypot(s.sim.state.x - n.predicted.x, s.sim.state.z - n.predicted.z).toFixed(2), home: +Math.hypot(s.sim.state.x - s.spec.home.x, s.sim.state.z - s.spec.home.z).toFixed(2), shown: s.actor.group.visible })); });
check('on Tochi\'s side of the floor, Tochi comes over to the player at the car; Oluchi stays at her desk', staff[0].shown && staff[1].shown && staff[0].mode === 'assist' && staff[0].d < 2.2 && staff[1].home < 0.6, staff);
await shot('09-tochi-comes');

// ---- asking about the Grey Saloon ----
const asking = await page.evaluate(() => { const p = window.__nlw.prompt(); return p ? { short: p.short, text: p.text } : null; });
check('at the car the player is offered to ask Tochi about it', asking && asking.short === 'Ask' && asking.text === 'Ask Tochi about the Grey Saloon', asking);
await page.keyboard.press('e');
await page.waitForSelector('#deal-log .msg.shop', { timeout: 60000 });
await page.waitForTimeout(1500);
const opened = await page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  return {
    head: q('.chathead .who b').textContent, role: q('.chathead .who span').textContent, brand: q('.dealitem .brandline') && q('.dealitem .brandline').textContent,
    card: q('.dealitem .what b').textContent, chips: [...document.querySelectorAll('.dealitem .spec')].map((c) => c.textContent), price: q('.dealitem .price').textContent,
    hello: [...document.querySelectorAll('#deal-log .msg.shop')].map((m) => m.textContent)[0] || '',
    quick: [...document.querySelectorAll('#deal-quick button')].map((b) => b.textContent),
    talk: window.__nlw.carshow.talk, placeholder: q('#deal-text').placeholder,
  };
});
check('the conversation opens with Tochi: the car\'s card with its top speed and its price, and nothing said of an engine', opened.head === 'Tochi' && opened.brand === 'Post Civil War Car Showroom' && opened.card === 'Grey Saloon' && opened.chips.includes('170 km/h') && !opened.chips.some((c) => /cc|CC/.test(c)) && /(^|[^\d,])600 TR/.test(opened.price) && opened.placeholder === 'Ask Tochi about the car', opened);
check('Tochi greets the player about this car, and says the answers are automatic', /Tochi/.test(opened.hello) && /automatic/.test(opened.hello) && /Grey Saloon/.test(opened.hello) && /170 km\/h/.test(opened.hello), opened.hello);
check('questions to tap are offered (none about an engine)', opened.quick.length >= 5 && !opened.quick.some((q) => /engine/i.test(q)), opened.quick);
await page.waitForFunction(() => { const n = window.__nlw, t = n.carSalesmen[0].sim.state; return t.mode === 'talk' && t.speed < 0.2; }, null, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(1500);
await shot('10-asking-tochi');
await page.click('#deal-quick button[data-ask="Arrival money?"]');
await page.waitForFunction(() => [...document.querySelectorAll('#deal-log .msg.shop')].some((m) => /arrival TR included: a car from the showroom is one thing arrival money can buy/.test(m.textContent)), null, { timeout: 90000 }).catch(() => {});
const arrival = await page.evaluate(() => [...document.querySelectorAll('#deal-log .msg.shop')].map((m) => m.textContent).find((t) => /arrival/i.test(t)) || null);
check('asked, Tochi says the arrival money pays for a car', /arrival TR included: a car from the showroom is one thing arrival money can buy/.test(arrival || ''), arrival);
// bought with nothing but the arrival money: it is theirs, and the 600 TR came out of the arrival money
await page.click('#deal-buy');
await page.waitForSelector('#deal-yes', { timeout: 30000 });
const asked = await page.evaluate(() => document.querySelector('.dealask') ? document.querySelector('.dealask').textContent : (document.querySelector('#deal-yes').closest('div') || {}).textContent || '');
await page.click('#deal-yes');
await page.waitForSelector('#deal-done', { timeout: 60000 });
const done = await page.evaluate(async () => { const n = window.__nlw; await n.market.mine(); return { text: document.querySelector('#deal-done').textContent, mine: n.market.state.mine.holdings.map((h) => h.asset.model) }; });
check('with only the arrival money, the Grey Saloon is bought for 600 TR: it is the player\'s', /yours/.test(done.text) && done.mine.includes('car:grey-saloon') && /600 TR/.test(asked), { ...done, asked });
await shot('11-bought');
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
await page.waitForFunction(() => window.__nlw.view.self.ownCars && window.__nlw.view.self.ownCars.cars.includes('grey-saloon'), null, { timeout: 30000 }).catch(() => {});
const indoors = await page.evaluate(() => window.__nlw.server.send({ type: 'cars.enter', car: 'grey-saloon' }));
check('the town is told it is theirs; and a car is not brought into the hall', indoors.code === 'INDOORS', indoors);

// ---- another player asks about a car on the other side of the floor ----
await page.evaluate(() => { const n = window.__nlw; n.twin('Second Buyer', -396.3, -176.4); });          // (in the aisle on Oluchi's side)
await page.waitForFunction(() => (window.__nlw.view.players || []).some((q) => q.name === 'Second Buyer'), null, { timeout: 90000 });
await page.evaluate(() => { const n = window.__nlw; n.second.face(-Math.PI / 2); n.second.askCar('black-luxury-suv'); });
await page.waitForFunction(() => { const n = window.__nlw, s = n.carSalesmen[1].sim.state; const q = n.view.players.find((x) => x.name === 'Second Buyer'); return q && q.carTalk && s.mode === 'talk' && s.with === `p:${q.id}` && Math.hypot(s.x - q.x, s.z - q.z) < 2.4 && s.speed < 0.2; }, null, { timeout: 120000 }).catch(() => {});
const theirs = await page.evaluate(() => { const n = window.__nlw, s = n.carSalesmen[1].sim.state, t = n.carSalesmen[0].sim.state; const q = n.view.players.find((x) => x.name === 'Second Buyer'); return { oluchi: s.mode, with: s.with, them: q && `p:${q.id}`, talk: q && q.carTalk, apart: q ? +Math.hypot(s.x - q.x, s.z - q.z).toFixed(2) : null, tochiWith: t.with }; });
check('another player asking about a car on the other side: Oluchi looks after them, Tochi stays with the player', theirs.oluchi === 'talk' && theirs.with === theirs.them && theirs.talk && theirs.talk.car === 'black-luxury-suv' && theirs.apart < 2.4 && theirs.tochiWith && theirs.tochiWith !== theirs.them, theirs);
await go(-405, -172, -Math.PI / 2, { yaw: -Math.PI / 2 + 0.6, pitch: 0.2, dist: 9 });
await page.waitForTimeout(2500);
await shot('12-oluchi-with-another-player');
await page.evaluate(() => window.__nlw.second.askCar(null));

// ---- out by the mat ----
await go(MAT.x, MAT.z - 1.8, 0, { yaw: 0, pitch: 0.2, dist: 6 });
await page.waitForTimeout(500);
await page.keyboard.down('w');
let left = false;
for (let i = 0; i < 300 && !left; i += 1) { await page.waitForTimeout(100); left = await page.evaluate(() => !window.__nlw.carshow.inside); }
await page.keyboard.up('w');
await page.waitForFunction(() => !document.getElementById('fade').classList.contains('on'), null, { timeout: 20000 });
const outside = await page.evaluate(() => { const n = window.__nlw, c = n.carshowView; return { at: [+n.predicted.x.toFixed(2), +n.predicted.z.toFixed(2)], hall: c.hall.group.visible, exterior: c.exterior.visible, staff: n.carSalesmen.some((s) => s.actor.group.visible) }; });
check('the mat inside the doors takes the player out before them; the buildings are drawn again, the hall is not', left && Math.hypot(outside.at[0] - DOORS.x, outside.at[1] - (DOORS.z + 4.6)) < 0.6 && !outside.hall && outside.exterior && !outside.staff, outside);
// gone well away from the doors (and back again: the car is fetched from the doors' side), every car's model let go
{
  const kept = await page.evaluate(() => window.__nlw.carshowView.models().tiers.filter(Boolean).length);
  const back = await page.evaluate(() => [window.__nlw.predicted.x, window.__nlw.predicted.z]);
  await go(DOORS.x, DOORS.z + 200, 0, { yaw: 0, pitch: 0.2, dist: 6 });
  await page.waitForFunction(() => window.__nlw.carshowView.models().tiers.every((t) => !t), null, { timeout: 30000 }).catch(() => {});
  const away = await page.evaluate(() => ({ state: window.__nlw.carshowView.models(), held: window.__nlw.carsHeld() }));
  check('just outside the doors the cars\' models are kept (for stepping back in); gone well away from the doors, every one is let go', kept > 0 && away.state.tiers.every((t) => !t) && away.state.running === 0 && away.state.waiting === 0, { kept, ...away });
  await go(back[0], back[1], 0, { yaw: 0, pitch: 0.2, dist: 6 });
  await page.waitForTimeout(1000);
}

// ---- driving it ----
await page.evaluate(() => window.__nlw.ui.openPhone('property', {}));
await page.waitForTimeout(1500);
const holding = await page.evaluate(() => window.__nlw.market.state.mine.holdings.find((h) => h.asset.model === 'car:grey-saloon').id);
await page.evaluate((id) => window.__nlw.ui.openPhone('property', { own: id }), holding);
await page.waitForSelector('#drive-car', { timeout: 30000 });
await shot('13-owned');
await page.click('#drive-car');
await page.waitForFunction(() => window.__nlw.view.self.incar && window.__nlw.carView.ready(), null, { timeout: 300000 }).catch(() => {});
await page.evaluate(() => { const n = window.__nlw; n.cam.yaw = n.predicted.heading + 0.5; n.cam.dist = 7; n.cam.pitch = 0.18; });
await page.waitForTimeout(1500);
const inCar = await page.evaluate(() => { const n = window.__nlw, c = n.carView.driven(); return { incar: n.view.self.incar && n.view.self.incar.car, drawn: !!c, at: c && [c.group.position.x, c.group.position.z], me: [n.predicted.x, n.predicted.z], figure: n.me.group.visible, mode: n.mode, engine: n.audio.status().car }; });
check('Drive it: the Grey Saloon is brought to the player, who is in it (the figure inside, unseen), its engine started', inCar.incar === 'grey-saloon' && inCar.drawn && Math.hypot(inCar.at[0] - inCar.me[0], inCar.at[1] - inCar.me[1]) < 0.05 && !inCar.figure && inCar.mode === 'car' && inCar.engine && inCar.engine.running, inCar);
await shot('14-in-the-car');
const startAt = await page.evaluate(() => ({ x: window.__nlw.predicted.x, z: window.__nlw.predicted.z, h: window.__nlw.predicted.heading }));
await page.keyboard.down('w'); await page.waitForTimeout(4000);
const going = await page.evaluate(() => { const n = window.__nlw, e = document.querySelector('#speedo'), c = n.carView.driven(); let spin = 0; c.group.traverse((o) => { if (o.isGroup && Math.abs(o.rotation.x) > spin && o !== c.group) spin = Math.abs(o.rotation.x); }); return { speed: n.carState.speed, at: [n.predicted.x, n.predicted.z], spin, dial: { shown: !e.hidden, reading: n.speedo.reading, max: n.speedo.max, cc: e.querySelector('.cc').textContent }, engine: n.audio.status().car }; });
check('the accelerator takes it away: it moves, its wheels turn, its engine revs', going.speed > 3 && Math.hypot(going.at[0] - startAt.x, going.at[1] - startAt.z) > 3 && going.spin > 0.5 && going.engine.running && going.engine.rev > 0.1, going);
check('its speedometer reads its km/h, to its own top speed, with no engine size on it', going.dial.shown && Math.abs(going.dial.reading - going.speed * 3.6) < 8 && going.dial.max >= 170 && going.dial.cc === '', going.dial);
await page.keyboard.down('d'); await page.waitForTimeout(900);
const turned = await page.evaluate(() => ({ h: window.__nlw.predicted.heading, steer: window.__nlw.carState.steer, wheels: window.__nlw.carView.driven().frame.children.filter((g) => g.isGroup && g.children[0] && Math.abs(g.children[0].rotation.y) > 0.05).length }));
await page.keyboard.up('d');
check('steered right, it turns right, its front wheels turned', turned.h < startAt.h - 0.02 && turned.steer > 0.05 && turned.wheels === 2, { turned, from: startAt.h });
await page.evaluate(() => { const n = window.__nlw; n.cam.yaw = n.predicted.heading + Math.PI - 0.4; n.cam.dist = 6.5; n.cam.pitch = 0.14; });
// (held for a few seconds: it stops; held on, it then backs up. Every frame is written down in the page from before
// the brake is pressed: a software-drawn browser's frames are far apart (each is simulated in steps of a twentieth of
// a second), so that the moment the car stands still can fall inside one frame. How long it stood is the time the
// brake has been held at a standstill (`held`, power-cars.js) less the time it has been backing up since, at 2.2 m/s²)
await page.evaluate(() => {
  const n = window.__nlw, rec = window.__brake = { frames: [], stop: false };
  const look = () => { if (rec.stop) return; const st = n.carView.stateOf(); rec.frames.push({ v: +n.carState.speed.toFixed(2), held: +(n.carState.held || 0).toFixed(3), brake: st && st.brake, reverse: st && st.reverse, red: document.querySelector('#speedo').classList.contains('braking') }); requestAnimationFrame(look); };
  requestAnimationFrame(look);
});
await page.keyboard.up('w'); await page.keyboard.down('s');
await page.waitForFunction(() => window.__brake.frames.some((f) => f.brake === 1), null, { timeout: 20000 }).catch(() => {});
await shot('15-braking');
await page.waitForFunction(() => { const f = window.__brake.frames; return f.length && f[f.length - 1].v < -0.6; }, null, { timeout: 30000 }).catch(() => {});
await page.keyboard.up('s');
const braking = await page.evaluate(() => { window.__brake.stop = true; return window.__brake.frames; });
const last = braking[braking.length - 1];
const firstBack = braking.findIndex((f) => f.v < -0.05), back = braking[firstBack];
const stood = back ? back.held - Math.abs(back.v) / 2.2 : 0;
check('on the brake its brake lamps light and it slows to a stop; held on a moment more, it backs up, its reversing lamps lit and its brake lamps not',
  braking.some((f) => f.brake === 1 && f.red && f.v > 0.3) && !!back && stood > 0.25 && braking.slice(firstBack).every((f) => f.brake === 0 && !f.red && (f.v > -0.2 || f.reverse === 1)) && last.reverse === 1 && last.v < -0.6,
  { stood: +stood.toFixed(2), frames: braking.slice(Math.max(0, firstBack - 3), firstBack + 2), last });
await page.evaluate(() => { const n = window.__nlw; n.carState.speed = 0; });
const horns0 = await page.evaluate(() => window.__nlw.view.self.incar.horns);
await page.keyboard.press('h');
await page.waitForTimeout(400);
check('its horn is sounded (and the town told, for others to hear)', (await page.evaluate(() => window.__nlw.view.self.incar.horns)) === horns0 + 1, null);

// the gate opens ahead of a car from further off than for someone on foot
await page.evaluate(() => { const n = window.__nlw; const p = n.host.game.state.players[n.playerId]; p.pcar.x = p.x = -420.5; p.pcar.z = p.z = -96; p.pcar.h = p.heading = 0; p.lastMoveAt = n.host.game.state.real; n.predicted.x = -420.5; n.predicted.z = -96; n.predicted.heading = 0; n.carState.speed = 0; n.cam.yaw = 0; n.cam.dist = 9; n.cam.pitch = 0.16; });
await page.waitForFunction(() => window.__nlw.view.carshowGate > 0.2, null, { timeout: 20000 }).catch(() => {});
const ahead = await page.evaluate(() => ({ gate: window.__nlw.view.carshowGate, gap: 96 - 70 }));
check('driving up, the gate opens ahead of the car from 26 m', ahead.gate > 0.2, ahead);
await page.keyboard.down('w');
let through = false;
for (let i = 0; i < 200 && !through; i += 1) { await page.waitForTimeout(100); through = await page.evaluate(() => window.__nlw.predicted.z > -62); }
await page.keyboard.up('w'); await page.keyboard.down('s');
await page.waitForTimeout(2500);
await page.keyboard.up('s');
check('and the car drives out through it to the road', through, await page.evaluate(() => [window.__nlw.predicted.x, window.__nlw.predicted.z]));
await shot('16-out-through-the-gate');

// out: it stays where it stands
const outPrompt = await page.evaluate(() => { const p = window.__nlw.prompt(); return p && p.text; });
await page.evaluate(() => { const p = window.__nlw.prompt(); if (p) p.run(); });
await page.waitForTimeout(1200);
const parked = await page.evaluate(() => { const n = window.__nlw; return { incar: n.view.self.incar, parked: n.view.self.ownCars.parked, keys: n.carView.keys(), figure: n.me.group.visible, engine: n.audio.status().car, me: [n.predicted.x, n.predicted.z] }; });
check('Get out: the player steps out beside it, and it stands where it was left, drawn there; its engine stops', outPrompt === 'Get out of the Grey Saloon' && !parked.incar && parked.parked.length === 1 && parked.keys.includes('park:grey-saloon') && parked.figure && !parked.engine, parked);
await page.evaluate(() => { const n = window.__nlw; n.cam.yaw = n.predicted.heading + 2.4; n.cam.dist = 6; n.cam.pitch = 0.2; });
await page.waitForTimeout(1500);
await shot('17-parked');
const again = await page.evaluate(() => { const p = window.__nlw.prompt(); return p && p.text; });
check('beside it, the player is offered to drive it again', again === 'Drive your Grey Saloon', again);

// at night: its headlamps light the road ahead
await page.evaluate(() => { const p = window.__nlw.prompt(); if (p) p.run(); });
await page.waitForFunction(() => window.__nlw.view.self.incar, null, { timeout: 20000 });
for (let i = 0; i < 24 && (await page.evaluate(() => window.__nlw.night)) < 0.6; i += 1) { await page.evaluate(() => window.__nlw.skip(1)); await page.waitForTimeout(200); }
await page.evaluate(() => { const n = window.__nlw; n.cam.yaw = n.predicted.heading + Math.PI; n.cam.dist = 7; n.cam.pitch = 0.16; });
await page.waitForTimeout(1500);
const dark = await page.evaluate(() => { const n = window.__nlw, st = n.carView.stateOf(); return { night: n.night, head: st && st.head, tail: st && st.tail, light: n.headlight.intensity }; });
check('at night its headlamps and tail lamps are on, and the headlamps light the way ahead', dark.night > 0.5 && dark.head === 1 && dark.tail === 1 && dark.light > 0, dark);
await shot('18-night');
for (let i = 0; i < 24 && (await page.evaluate(() => window.__nlw.night)) > 0.1; i += 1) { await page.evaluate(() => window.__nlw.skip(1)); await page.waitForTimeout(100); }

// ---- another player's car, driven past ----
const peer = await page.evaluate(() => {
  const n = window.__nlw, me = n.view.self;
  const t = n.twin('Second Driver', me.x - 12, me.z + 4);
  const g = t.host.game;
  g.intent(t.id, { type: 'cars.owned', cars: ['red-winged-supercar'] });
  const q = g.state.players[t.id];
  q.heading = Math.PI / 2;
  const on = g.intent(t.id, { type: 'cars.enter', car: 'red-winged-supercar' });
  window.__peerDrive = { speed: 3, throttle: 1, rev: 0.6 };
  window.__peerTimer = setInterval(() => {
    const p = g.state.players[t.id], r = window.__peerDrive;
    if (!p.incar) return;
    g.intent(t.id, { type: 'car.drive', x: p.x + r.speed * 0.1, z: p.z, heading: Math.PI / 2, speed: r.speed, throttle: r.throttle, brake: false, rev: r.rev, steer: 0, lamps: false });
  }, 100);
  return { id: t.id, on };
});
check('a second player gets into their own car', peer.on && peer.on.ok, peer.on);
await page.waitForFunction(() => window.__nlw.carView.keys().some((k) => k.startsWith('peer:')) && window.__nlw.audio.status().peerCars.length === 1, null, { timeout: 120000 }).catch(() => {});
const seen = await page.evaluate(() => ({ keys: window.__nlw.carView.keys(), heard: window.__nlw.audio.status().peerCars }));
check('here, their car is seen where it is, on the owner\'s model, and its engine heard from there', seen.keys.some((k) => k.startsWith('peer:')) && seen.heard.length === 1 && seen.heard[0].id === 'red-winged-supercar' && seen.heard[0].running, seen);
const hornsHeard = await page.evaluate(() => window.__nlw.peerHornsHeard);
await page.evaluate((id) => window.__nlw.second.host.game.intent(id, { type: 'car.horn' }), peer.id);
await page.waitForFunction((n0) => window.__nlw.peerHornsHeard > n0, hornsHeard, { timeout: 15000 }).catch(() => {});
check('their horn is heard here', (await page.evaluate(() => window.__nlw.peerHornsHeard)) > hornsHeard, null);
await page.evaluate(() => { const n = window.__nlw; n.cam.yaw = n.predicted.heading - 1.2; n.cam.dist = 10; n.cam.pitch = 0.2; });
await page.waitForTimeout(1500);
await shot('19-another-players-car');
await page.evaluate((id) => { clearInterval(window.__peerTimer); window.__nlw.second.host.game.intent(id, { type: 'car.leave' }); }, peer.id);
await page.waitForFunction(() => !window.__nlw.carView.keys().some((k) => k.startsWith('peer:')) && window.__nlw.audio.status().peerCars.length === 0, null, { timeout: 30000 }).catch(() => {});
const gone = await page.evaluate(() => ({ keys: window.__nlw.carView.keys(), heard: window.__nlw.audio.status().peerCars.length }));
check('out of it, their car is no longer driven here and its engine is let go; it is seen standing where they left it', !gone.keys.some((k) => k.startsWith('peer:')) && gone.heard === 0 && gone.keys.some((k) => k.startsWith('cpark:') && k.endsWith(':red-winged-supercar')), gone);

await page.evaluate(() => { const n = window.__nlw; if (n.view.self.incar) n.server.send({ type: 'car.leave' }); });
await browser.close();
server.close();
const failed = results.filter((r) => !r).length;
console.log(`${results.length - failed} of ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
