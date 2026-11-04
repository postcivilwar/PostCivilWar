// Taking a car of the town's as the owner's videos show it (4 November 2026: "If a user want to hijack a vehicle and
// they clicked the hijack button while staying in front of the car, the user will automatically walk through the driver
// doors, opens it and enters, while the other passengers they are carrying will open the door bang/close it and run
// away ... how the user comes out of the car, the open of the door and banging of the door"). The game played on the
// website on this machine, with a computer's settings or a phone's:
//  A  a car of the town's standing at the roadside (with people riding with its driver, where one has them): "Take"
//     offered from in front of it
//  B  taken: the player goes round it to the driver's door (never through the car), the door swings open, the driver is
//     pulled out onto the road, whoever rides with them gets out of their own doors and runs, the player gets in, the
//     door is slammed (shut again), the player at the wheel; the car on the screen in every frame of it (never gone the
//     moment the player is in it), and drawn whole while a door is open (every door on its hinge, nothing seen through)
//  C  out of it: the driver's door opens, the player steps out, the door is slammed behind them; the car drawn in every
//     frame, whole
//  D  nothing in the console; pictures of each step
//   ../server/with-postgres.sh node test/car-taking.mjs [shots folder] [phone]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { createDevServer } = await import(resolve(ROOT, 'server/dev.mjs'));
const { pastQuestion, enterTown, watchPictures } = await import(resolve(ROOT, 'prototype/test/start.mjs'));
const out = resolve(process.argv[2] || '/tmp/car-taking-shots'); mkdirSync(out, { recursive: true });
const PHONE = process.argv[3] === 'phone';
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); };
const server = createDevServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext(PHONE ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, serviceWorkers: 'block' } : { viewport: { width: 1100, height: 620 }, serviceWorkers: 'block' });
await watchPictures(context);
const page = await context.newPage();
page.setDefaultTimeout(900000);
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); console.log('PAGE ERROR', e.message); });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${origin}/#gameclock${PHONE ? '-lite' : ''}`, { timeout: 900000 });
await page.waitForSelector('#cover-play', { state: 'visible', timeout: 900000 });
await page.evaluate(() => document.getElementById('cover-play').click());
await page.waitForSelector('#open-signup', { state: 'visible', timeout: 900000 });
await page.click('#open-signup');
await page.fill('#account-username', `Taking_${Math.random().toString(36).slice(2, 7)}`);
await page.fill('#account-password', 'a password for taking cars');
await page.click('#account-submit');
await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 180000 });
await pastQuestion(page);
await page.fill('#name', 'Taking');
await enterTown(page, { tap: PHONE, wait: 900000 });
await page.waitForFunction(() => window.__nlw.me && window.__nlw.me.mixer, null, { timeout: 300000 });
await page.evaluate(() => { const n = window.__nlw, g = n.host.game; const hour = n.view.clock.hourFloat; n.skip(((24 + 10.5 - hour) % 24) || 24); g.state.weather = { kind: 'clear', until: g.state.t + 24 * 3600 }; });
await page.evaluate((phone) => window.__nlw.setGraphics(phone ? 'low' : 'medium'), PHONE);
// beside Market Road, where the town's cars stand at the roadside
await page.evaluate(() => { const n = window.__nlw; for (let r = 0; r < 12; r += 0.5) for (let k = 0; k < 12; k += 1) { const a = (k / 12) * Math.PI * 2, x = 8.5 + Math.cos(a) * r, z = -75 + Math.sin(a) * r; if (n.walkable(x, z)) { n.place(x, z); return; } } });
await page.waitForTimeout(15000);

// ---- A: a car standing at the roadside, with riders where one has them; the player in front of it
let target = null;
for (let k = 0; k < 24 && !target; k += 1) {
  target = await page.evaluate((late) => {
    const n = window.__nlw, g = n.host.game, T = g.internals.traffic, eye = n.view.self;
    const standing = T.cars.filter((c) => c.mode === 'stop' && !c.frozen && g.state.real < c.until - 8 && Math.abs(c.x) < 230 && c.z > -460 && c.z < 170);
    const withRiders = standing.filter((c) => c.riders.length > 0);
    const list = (withRiders.length || late ? (withRiders.length ? withRiders : standing) : []).sort((a, b) => Math.hypot(a.x - eye.x, a.z - eye.z) - Math.hypot(b.x - eye.x, b.z - eye.z));
    const c = list[0];
    if (!c) return null;
    c.until = g.state.real + 180;
    return { n: c.n, model: c.model, x: c.x, z: c.z, h: c.h, person: c.i, riders: c.riders.map((r) => ({ ...r })) };
  }, k > 12);
  if (!target) await page.waitForTimeout(10000);
}
check('A: a car of the town\'s standing at the roadside', !!target, target);
if (!target) { await browser.close(); server.close(); process.exit(1); }
// in front of it, two metres off its nose, facing it; the view from its left front corner
await page.evaluate((t) => {
  const n = window.__nlw;
  const L = { 'grey-saloon': 4.85, 'black-pickup': 5.6, 'black-square-suv': 4.7, 'blue-off-roader': 4.6, 'mint-sports-coupe': 4.5, 'state-limousine': 5.8, 'black-luxury-suv': 5.2, 'camo-expedition': 5.0, 'grey-grand-tourer': 4.9, 'midnight-saloon': 5.1 }[t.model] || 5;
  const x = t.x + Math.sin(t.h) * (L / 2 + 1.8), z = t.z + Math.cos(t.h) * (L / 2 + 1.8);
  n.place(x, z); n.face(Math.atan2(t.x - x, t.z - z));
  n.cam.yaw = Math.atan2(t.x - x, t.z - z) - 0.9;
}, target);
await page.waitForFunction((t) => { const n = window.__nlw; return n.carView.keys().includes(`traffic:${t.n}`) && n.carView.driven(`traffic:${t.n}`); }, target, { timeout: 120000 }).catch(() => {});
await page.waitForTimeout(1500);
const offered = await page.evaluate(() => { const n = window.__nlw; n.refresh(); return n.near.take; });
await page.screenshot({ path: resolve(out, 'a-in-front.png') });
check('A: "Take" offered from in front of it', !!offered && offered.car === target.n, offered);

// ---- B: taken
// (every frame recorded in the page: the step, the doors of the car drawn, the driver and the riders, where the player is)
const record = (t) => page.evaluate((t) => {
  const n = window.__nlw, g = n.host.game;
  window.__rec = [];
  const look = () => {
    const self = n.view.self, A = g.internals.actors, p = g.state.players[n.playerId];
    const car = n.carView.driven(`traffic:${t.n}`) || n.carView.driven('drive');
    const doors = car && car.doors ? car.doors() : null;
    const dx = p.x - t.x, dz = p.z - t.z;
    const d = A.get(t.person);
    window.__rec.push({ at: performance.now(), step: self.hijack ? self.hijack.step : null, incar: self.incar ? self.incar.taken : null, doors, along: dx * Math.sin(t.h) + dz * Math.cos(t.h), across: dx * Math.cos(t.h) - dz * Math.sin(t.h), driver: d ? d.pose : null, riders: t.riders.filter((r) => A.has(r.i)).length, shown: n.me.group.visible,
      // (the car on the screen in this frame, and whole: every door drawn, open or shut, nothing to see through)
      drawn: !!(car && car.group.parent && car.group.visible), whole: car && car.whole ? car.whole() : null });
    if (window.__rec.length < 4000) requestAnimationFrame(look);
  };
  requestAnimationFrame(look);
}, t);
await record(target);
await page.evaluate(() => window.__nlw.act('take'));
const plan = await page.evaluate(() => { const n = window.__nlw; n.refresh(); return n.view.self.hijack; });
check('B: the steps: round to the driver\'s door, the door opened, the driver pulled out, in, the door slammed', !!plan.times && ['walk', 'door', 'pull', 'enter', 'shut'].every((k) => plan.times[k]) && plan.door === 'fl', plan);
for (let k = 0; k < 12; k += 1) { await page.waitForTimeout(450); await page.screenshot({ path: resolve(out, `b-${String(k).padStart(2, '0')}.png`) }); }
await page.waitForFunction((t) => { const s = window.__nlw.view.self; return s.incar && s.incar.taken === t.n && !s.hijack; }, target, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(1500);
const rec = await page.evaluate(() => window.__rec);
const most = (key) => Math.max(0, ...rec.map((q) => (q.doors && q.doors[key]) || 0));
const steps = [...new Set(rec.map((q) => q.step).filter(Boolean))];
check('B: every step drawn', ['walk', 'door', 'pull', 'enter', 'shut'].every((k) => steps.includes(k)), { steps, frames: rec.length });
check('B: never through the car on the way round', rec.filter((q) => q.step === 'walk' && Math.abs(q.along) < 2.0 && Math.abs(q.across) < 0.9).length === 0);
check('B: the driver\'s door swung open, and shut again', most('fl') > 1.0 && rec.length && rec[rec.length - 1].doors && rec[rec.length - 1].doors.fl < 0.01, { most: most('fl'), last: rec[rec.length - 1] && rec[rec.length - 1].doors });
check('B: the driver out on the road, and down', rec.some((q) => q.driver === 3), rec.filter((q) => q.driver !== null).length);
const riderDoors = target.riders.map((r) => (r.seat === 'front' ? 'fr' : r.seat === 'rl' ? 'rl' : 'rr'));
check('B: whoever rode with them out of the car, each door opened for them', Math.max(0, ...rec.map((q) => q.riders)) === target.riders.length && riderDoors.every((d) => most(d) > 0.8), { out: Math.max(0, ...rec.map((q) => q.riders)), riders: target.riders.length, doors: Object.fromEntries(['fr', 'rl', 'rr'].map((d) => [d, +most(d).toFixed(2)])) });
const opens = rec.filter((q) => q.doors && Object.values(q.doors).some((a) => a > 0.01));
check('B: while a door is open the car is drawn whole: every door on its hinge, the shut ones in their places', opens.length > 3 && opens.every((q) => q.whole === true), { frames: opens.length, notWhole: opens.filter((q) => q.whole !== true).length });
// (from the moment it is taken to the wheel: the car on the screen in every frame, never gone while it is fetched as the
// car driven, car-view.js)
const fromTake = rec.slice(rec.findIndex((q) => q.step));
check('B: the car on the screen in every frame, the moment the player is in it as well', fromTake.length > 10 && fromTake.every((q) => q.drawn), { frames: fromTake.length, missing: fromTake.filter((q) => !q.drawn).length, firstMissing: fromTake.findIndex((q) => !q.drawn) });
const final = await page.evaluate((t) => { const s = window.__nlw.view.self; return { incar: s.incar ? s.incar.taken : null, step: s.hijack ? s.hijack.step : null }; }, target);
check('B: at the wheel', final.incar === target.n && !final.step, final);
await page.screenshot({ path: resolve(out, 'b-at-the-wheel.png') });

// ---- C: out of it again
await page.evaluate(() => { window.__rec = []; });
await record(target);
await page.evaluate(() => window.__nlw.leaveCar());
for (let k = 0; k < 6; k += 1) { await page.waitForTimeout(250); await page.screenshot({ path: resolve(out, `c-${k}-out.png`) }); }
await page.waitForTimeout(2000);
const rec2 = await page.evaluate(() => window.__rec);
const opened = Math.max(0, ...rec2.map((q) => Math.max((q.doors && q.doors.fl) || 0, (q.doors && q.doors.fr) || 0)));
const last2 = rec2[rec2.length - 1];
check('C: out of it: the door opened, and slammed behind them', opened > 1.0 && !last2.incar && last2.doors && Object.values(last2.doors).every((a) => a < 0.01), { opened, last: last2 });
check('C: the player seen stepping out', rec2.some((q) => q.shown && !q.incar), rec2.filter((q) => q.shown).length);
check('C: the car on the screen in every frame of it, and whole while its door is open', rec2.length > 5 && rec2.every((q) => q.drawn) && rec2.filter((q) => q.doors && Object.values(q.doors).some((a) => a > 0.01)).every((q) => q.whole === true), { frames: rec2.length, missing: rec2.filter((q) => !q.drawn).length, notWhole: rec2.filter((q) => q.doors && Object.values(q.doors).some((a) => a > 0.01) && q.whole !== true).length });

// ---- D
check('D: nothing in the console', errors.length === 0, errors.slice(0, 5));
writeFileSync(resolve(out, 'results.json'), JSON.stringify({ target, plan }, null, 1));
await browser.close(); server.close();
const failed = results.filter((r) => !r).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
