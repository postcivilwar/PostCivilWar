// The town's traffic in the showroom's cars, and taking one (30 October 2026, the owner's brief: "You need to allow
// the NPC to drive different kinds of cars based on the cars available at the showroom. Users can hijack cars but can
// never put the car for sale. And if police catch them, all cars must be returned."). The game played on the website
// on this machine, with a phone's settings or a computer's:
//  A  by day beside Market Road: the town's cars on the road near the player, the nearest drawn as their models (no
//     more of them than the level allows), the rest within sight as their pictures
//  B  on the move, drawn smoothly: never a step back, never a jump
//  C  a car standing at the roadside: "Take" offered from beside its door; taken (an officer on her beat in sight of
//     it), the driver out and running, the player at the wheel, the police's stars for taking a vehicle
//  D  driven a little way, as one's own car is
//  E  got out of: it stands where it was left; "Drive" offered; back in
//  F  it is never the player's: not among what they own on the website (the market's holdings), nothing to sell
//  G  caught by the police: every car taken goes back; nothing offered any more
//  H  at night: the cars' lamps lit
//  I  what it costs: the graphics card's memory (a phone under 150 MB), frames a second; nothing in the console
//   ../server/with-postgres.sh node test/traffic.mjs [shots folder] [phone]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { createDevServer } = await import(resolve(ROOT, 'server/dev.mjs'));
const { pastQuestion, enterTown, watchPictures, lostPictures, officerOnScene } = await import(resolve(ROOT, 'prototype/test/start.mjs'));
const out = resolve(process.argv[2] || '/tmp/traffic-shots'); mkdirSync(out, { recursive: true });
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
await page.fill('#account-username', `Traffic_${Math.random().toString(36).slice(2, 7)}`);
await page.fill('#account-password', 'a password for the traffic');
await page.click('#account-submit');
await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 180000 });
await pastQuestion(page);
await page.fill('#name', 'Traffic');
await enterTown(page, { tap: PHONE, wait: 900000 });
await page.waitForFunction(() => window.__nlw.me && window.__nlw.me.mixer, null, { timeout: 300000 });
const setHour = (h) => page.evaluate((h) => { const n = window.__nlw, g = n.host.game; const hour = n.view.clock.hourFloat; n.skip(((24 + h - hour) % 24) || 24); g.state.weather = { kind: 'clear', until: g.state.t + 24 * 3600 }; for (const id of ['toasts', 'notices']) { const el = document.getElementById(id); if (el) el.hidden = true; } }, h);
await setHour(10.5);
await page.evaluate((phone) => window.__nlw.setGraphics(phone ? 'low' : 'medium'), PHONE);
// somewhere to stand beside Market Road, south of the Registry Road lights, off the road
const standAt = (x, z) => page.evaluate(([x, z]) => { const n = window.__nlw; for (let r = 0; r < 12; r += 0.5) for (let k = 0; k < 12; k += 1) { const a = (k / 12) * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (n.walkable(px, pz)) { n.place(px, pz); return [px, pz]; } } return null; }, [x, z]);
const fps = async (ms = 8000) => page.evaluate((ms) => new Promise((done) => { let f = 0; const t0 = performance.now(); const tick = () => { f += 1; if (performance.now() - t0 < ms) requestAnimationFrame(tick); else done(+(f * 1000 / (performance.now() - t0)).toFixed(1)); }; requestAnimationFrame(tick); }), ms);
const LIMIT = PHONE ? 2 : 5;
// until one of the town's cars is drawn as its model near the player: if none comes by within a minute, the player is
// put beside the road a little way from the nearest car on the move
const modelDrawn = () => page.waitForFunction(() => { const n = window.__nlw; return n.carView.keys().some((k) => k.startsWith('traffic:') && n.carView.driven(k)); }, null, { timeout: 60000 }).then(() => true, () => false);
async function untilModelDrawn() {
  if (await modelDrawn()) return true;
  await page.evaluate(() => {
    const n = window.__nlw, g = n.host.game, eye = n.view.self;
    const c = g.internals.traffic.cars.filter((q) => q.mode === 'drive' || q.mode === 'stop').sort((a, b) => Math.hypot(a.x - eye.x, a.z - eye.z) - Math.hypot(b.x - eye.x, b.z - eye.z))[0];
    if (!c) return;
    for (let r = 6; r < 20; r += 1) for (let k = 0; k < 12; k += 1) { const a = (k / 12) * Math.PI * 2, x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r; if (n.walkable(x, z)) { n.place(x, z); return; } }
  });
  return modelDrawn();
}

// ---- A: by day beside Market Road
await standAt(8.5, -75);
await page.evaluate(() => { const n = window.__nlw; n.face(0); n.cam.yaw = 0; });
await page.waitForTimeout(PHONE ? 30000 : 20000);
const drawnA = await untilModelDrawn();
await page.waitForTimeout(2000);
const seenA = await page.evaluate(() => {
  const n = window.__nlw, eye = n.view.self;
  const near = n.view.traffic.filter((c) => Math.hypot(c.x - eye.x, c.z - eye.z) < 150);
  const models = n.carView.keys().filter((k) => k.startsWith('traffic:'));
  return { near: near.length, models, drawn: models.filter((k) => n.carView.driven(k)).length, standins: n.standins.shown().filter((s) => s.key.startsWith('t:')), pictures: +((n.graphics.pictures || 0) / 1048576).toFixed(1), buffers: +((n.graphics.buffers || 0) / 1048576).toFixed(1), perf: { fps: n.perf.fps, calls: n.perf.calls, triangles: n.perf.triangles } };
});
seenA.fps = await fps();
await page.screenshot({ path: resolve(out, 'a-traffic-by-day.png') });
console.log('A', JSON.stringify(seenA));
check('A: by day the town\'s cars are on the road near the player', seenA.near >= 3, { near: seenA.near });
check(`A: the nearest drawn as their models, no more than ${LIMIT}, and drawn`, drawnA && seenA.models.length >= 1 && seenA.models.length <= LIMIT && seenA.drawn >= 1, { models: seenA.models, drawn: seenA.drawn });
check('A: the rest within sight as their pictures', seenA.near <= seenA.models.length || seenA.standins.some((s) => s.drawn), { standins: seenA.standins.length, drawn: seenA.standins.filter((s) => s.drawn).length });

// ---- B: drawn smoothly
const smooth = await page.evaluate(() => new Promise((done) => {
  const n = window.__nlw;
  const rows = [];
  const t0 = performance.now();
  let last = performance.now();
  const f = () => {
    const now = performance.now();
    for (const c of n.trafficCars) if (c.speed > 2) rows.push({ n: c.n, x: c.x, z: c.z, h: c.h, v: c.speed, dt: (now - last) / 1000 });
    last = now;
    if (now - t0 < 8000) requestAnimationFrame(f); else done(rows);
  };
  requestAnimationFrame(f);
}));
let worst = 0, back = 0, moved = 0;
const prev = new Map();
for (const r of smooth) {
  const p = prev.get(r.n);
  if (p) {
    const dx = r.x - p.x, dz = r.z - p.z, step = Math.hypot(dx, dz);
    const along = dx * Math.sin(r.h) + dz * Math.cos(r.h);
    worst = Math.max(worst, step - (r.v * r.dt * 1.5 + 0.25));
    if (along < -0.05) back += 1;
    moved += step;
  }
  prev.set(r.n, r);
}
check('B: on the move, drawn smoothly: never a step back, never a jump', moved > 20 && back === 0 && worst <= 0, { frames: smooth.length, moved: +moved.toFixed(1), back, worst: +worst.toFixed(2) });

// ---- C: taking a car standing at the roadside
const target = await page.evaluate(() => {
  const n = window.__nlw, g = n.host.game, T = g.internals.traffic, pop = g.internals.population, eye = n.view.self;
  // (the nearest with no police officer within 60 m, if there is one: a car taken in front of an officer may be a
  // prisoner's at once, and this part of the test is of the car)
  const o = {};
  const police = pop.people.filter((q) => q.job === 'police').map((q) => { pop.locate(q.index, g.state.t, o); return { x: o.x, z: o.z, out: o.pose !== 4 }; }).filter((q) => q.out);
  const officer = (c) => Math.min(Infinity, ...police.map((q) => Math.hypot(q.x - c.x, q.z - c.z)));
  const cars = T.cars.filter((c) => c.mode === 'stop' && g.state.real < c.until - 8).sort((a, b) => ((officer(a) > 60 ? 0 : 1) - (officer(b) > 60 ? 0 : 1)) || (Math.hypot(a.x - eye.x, a.z - eye.z) - Math.hypot(b.x - eye.x, b.z - eye.z)));
  const c = cars[0];
  if (!c) return null;
  // (hold it there: a little longer at the roadside)
  c.until = g.state.real + 120;
  return { n: c.n, model: c.model, x: c.x, z: c.z, h: c.h, person: c.i, officer: +officer(c).toFixed(1) };
});
check('C: a car standing at the roadside, its driver at the wheel', !!target, target);
if (!target) { await browser.close(); server.close(); process.exit(1); }
const spec = await page.evaluate((m) => { const s = window.__nlw.carSpec ? window.__nlw.carSpec(m) : null; return s; }, target.model);
void spec;
await page.evaluate((t) => {
  const n = window.__nlw;
  const L = { 'grey-saloon': 4.85, 'black-pickup': 5.6, 'black-square-suv': 4.7, 'blue-off-roader': 4.6, 'mint-sports-coupe': 4.5, 'state-limousine': 5.8, 'black-luxury-suv': 5.2, 'camo-expedition': 5.0, 'grey-grand-tourer': 4.9, 'midnight-saloon': 5.1 }[t.model] || 5;
  const W = { 'grey-saloon': 2.1, 'black-pickup': 2.2, 'black-square-suv': 2.2, 'blue-off-roader': 2.3, 'mint-sports-coupe': 2.1, 'state-limousine': 2.4, 'black-luxury-suv': 2.4, 'camo-expedition': 2.25, 'grey-grand-tourer': 2.2, 'midnight-saloon': 2.2 }[t.model] || 2.2;
  // beside its left front door (the side towards the middle of the road), turned to it
  const a = W / 2 + 0.45, b = -0.15 * L;
  const x = t.x + Math.cos(t.h) * a + Math.sin(t.h) * b, z = t.z - Math.sin(t.h) * a + Math.cos(t.h) * b;
  n.place(x, z); n.face(Math.atan2(t.x - x, t.z - z)); n.cam.yaw = Math.atan2(t.x - x, t.z - z);
}, target);
await page.waitForTimeout(1500);
const offered = await page.evaluate(() => { const n = window.__nlw; n.refresh(); return n.near.take; });
await page.screenshot({ path: resolve(out, 'c-take-offered.png') });
check('C: "Take" offered from beside its door', !!offered && offered.car === target.n && /^Take /.test(offered.text), offered);
// (an officer on her beat in sight of it: 31 October 2026, the owner's word, only what an officer on the scene sees is a
// crime; out of every officer's sight, no stars)
const officerC = await officerOnScene(page, target.x, target.z, 16);
check('C: an officer on her beat in sight of the car', officerC !== null, officerC);
await page.evaluate(() => window.__nlw.act('take'));
await page.waitForTimeout(1200);
await page.screenshot({ path: resolve(out, 'c-taking.png') });
await page.waitForFunction(() => { const s = window.__nlw.view.self; return s.incar && Number.isInteger(s.incar.taken); }, null, { timeout: 20000 }).catch(() => {});
// (read from the town itself as well as from the view: what the player is in, and the law's word on them, so that a
// player taken out of the car again at once says why)
const inC = await page.evaluate((t) => { const n = window.__nlw, g = n.host.game, p = g.state.players[n.playerId]; const s = n.view.self; return { car: s.incar ? s.incar.car : null, taken: s.incar ? s.incar.taken : null, driverOnFoot: g.internals.actors.has(t.person), mode: g.internals.traffic.cars[t.n].mode, incar: p.incar, pcar: p.pcar, custody: p.custody, law: { state: p.law.state, stars: p.law.stars }, hijack: g.state.hijack ? Object.keys(g.state.hijack).length : null }; }, target);
check('C: taken: the player at its wheel, the driver out on foot', inC.taken === target.n && inC.car === target.model && inC.driverOnFoot && inC.mode === 'taken', inC);
if (!inC.car) { console.log('errors', JSON.stringify(errors.slice(0, 5))); await page.screenshot({ path: resolve(out, 'c-not-in-it.png') }); await browser.close(); server.close(); process.exit(1); }
await page.waitForFunction(() => window.__nlw.carView.ready(), null, { timeout: 120000 });
await page.waitForFunction(() => window.__nlw.view.self.law.stars >= 2, null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1500);
const stars = await page.evaluate(() => { const el = document.getElementById('stars'); return { stars: window.__nlw.view.self.law.stars, state: window.__nlw.view.self.law.state, shown: !el.hidden, on: [...el.children].filter((s) => s.classList.contains('on')).length }; });
await page.screenshot({ path: resolve(out, 'c-at-the-wheel.png') });
check('C: the police\'s stars for taking a vehicle: two', stars.stars === 2 && stars.shown && stars.on === 2, stars);
// (the police held off while the car is driven, left and taken up again: an officer coming for the thief may catch them
// part way (on 30 October one did, between D and E), and the catching is G's. The theft stays in the police's book,
// open, and is the player's again for G; the officers on the way stand down while the player is not wanted, justice.js)
await page.evaluate(() => { const n = window.__nlw, p = n.host.game.state.players[n.playerId]; window.__law = { crimes: p.law.crimes.slice(), stars: p.law.stars, state: p.law.state }; p.law.crimes = []; p.law.stars = 0; p.law.state = 'normal'; });

// ---- D: driven a little way
const before = await page.evaluate(() => { const s = window.__nlw.view.self; return { x: s.x, z: s.z }; });
// (held until it has gone 3 m, up to fifteen seconds, then braked until it stands: on this machine, drawing in
// software, a frame can take longer than the game's longest step, half a second (main.js, `frameDt`), and the car's
// time then runs slower than the clock's: on 30 October two and a half seconds held took it 1.3 m)
await page.keyboard.down('w');
await page.waitForFunction((b) => { const s = window.__nlw.view.self; return Math.hypot(s.x - b.x, s.z - b.z) > 3; }, before, { timeout: 15000 }).catch(() => {});
await page.keyboard.up('w');
await page.keyboard.down('s');
await page.waitForFunction(() => Math.abs(window.__nlw.carState.speed) < 0.3, null, { timeout: 10000 }).catch(() => {});
await page.keyboard.up('s');
await page.waitForTimeout(1000);
const after = await page.evaluate(() => { const n = window.__nlw, s = n.view.self, c = n.host.game.internals.traffic.cars[s.incar.taken]; return { x: s.x, z: s.z, carX: c.x, carZ: c.z }; });
check('D: driven a little way, the town knowing where it is', Math.hypot(after.x - before.x, after.z - before.z) > 2 && Math.hypot(after.carX - after.x, after.carZ - after.z) < 0.5, { before, after });

// ---- E: got out of; back in
await page.evaluate(() => window.__nlw.leaveCar());
await page.waitForTimeout(1200);
const kept = await page.evaluate((t) => { const n = window.__nlw; n.refresh(); const c = n.view.traffic.find((q) => q.n === t.n); const p = n.prompt(); return { mode: c && c.mode, mine: c && c.mine, prompt: p && p.text, incar: !!n.view.self.incar }; }, target);
await page.screenshot({ path: resolve(out, 'e-left-standing.png') });
check('E: got out of, it stands where it was left; "Drive" offered beside it', kept.mode === 'kept' && kept.mine && !kept.incar && /Drive the .* you took/.test(kept.prompt || ''), kept);
const again = await page.evaluate((t) => window.__nlw.driveTaken(t.n).ok, target);
await page.waitForTimeout(800);
check('E: back in', again && (await page.evaluate(() => !!window.__nlw.view.self.incar)), { again });

// ---- F: never the player's: nothing owned on the website, nothing to sell
const owned = await page.evaluate(() => { const n = window.__nlw; const m = n.market && n.market.state && n.market.state.mine; return { holdings: m ? m.holdings.map((h) => h.asset && h.asset.model) : null, ownCars: n.view.self.ownCars.cars }; });
check('F: never the player\'s: not among what they own on the website, nor their cars', (owned.holdings === null || !owned.holdings.some((m) => String(m || '').includes(target.model))) && !owned.ownCars.includes(target.model), owned);

// ---- G: caught by the police
const caught = await page.evaluate(() => {
  const n = window.__nlw, g = n.host.game, p = g.state.players[n.playerId];
  // (the theft the player's again, as it was at C)
  const w = window.__law; p.law.crimes = w.crimes; p.law.stars = w.stars; p.law.state = w.state;
  const officer = g.internals.population.people.find((q) => q.job === 'police');
  const record = g.internals.justice.arrest(p, { kind: 'npc', id: officer.index, name: officer.name });
  n.refresh();
  return { record: !!record, returned: record ? record.carsReturned : null, incar: !!n.view.self.incar, taken: n.view.self.takenCars.length };
});
check('G: caught by the police: every car taken goes back; out of it; none left to them', caught.record && caught.returned >= 1 && !caught.incar && caught.taken === 0, caught);
await page.waitForTimeout(6000);
await page.screenshot({ path: resolve(out, 'g-arrested.png') });

// ---- H: at night, their lamps lit
await page.evaluate(() => { const n = window.__nlw, g = n.host.game, p = g.state.players[n.playerId]; if (p.custody) { const r = g.state.justice.arrests[p.custody]; r.status = 'released'; p.custody = null; p.law.state = 'normal'; } });
await setHour(21.5);
await standAt(8.5, -75);
await page.evaluate(() => { const n = window.__nlw; n.face(0); n.cam.yaw = 0; });
await page.waitForTimeout(PHONE ? 20000 : 15000);
await untilModelDrawn();
await page.waitForTimeout(1500);
// (each drawn model's lamps are set as it is placed in a frame: a model ready since the last frame has none yet, and on
// this machine a frame comes every two or three seconds; so those placed at least once, and a moment for any new one)
await page.waitForFunction(() => { const n = window.__nlw; const keys = n.carView.keys().filter((k) => k.startsWith('traffic:') && n.carView.driven(k)); return keys.length > 0 && keys.every((k) => n.carView.stateOf(k)); }, null, { timeout: 20000 }).catch(() => {});
const lit = await page.evaluate(() => { const n = window.__nlw; const keys = n.carView.keys().filter((k) => k.startsWith('traffic:') && n.carView.driven(k) && n.carView.stateOf(k)); return { keys, lit: keys.filter((k) => n.carView.stateOf(k).head === 1).length, near: n.view.traffic.length, states: keys.map((k) => n.carView.stateOf(k)) }; });
await page.screenshot({ path: resolve(out, 'h-night.png') });
check('H: at night the town\'s cars have their lamps lit', lit.keys.length === 0 ? lit.near === 0 : lit.lit === lit.keys.length, lit);

// ---- I: what it costs
check('I: the graphics card\'s memory with the traffic about: a phone under 150 MB', !PHONE || seenA.pictures + seenA.buffers < 150, { pictures: seenA.pictures, buffers: seenA.buffers });
console.log('frames a second (this machine, without a graphics card), by day beside Market Road:', seenA.fps, '| draws, triangles:', seenA.perf.calls, seenA.perf.triangles);
const lost = await lostPictures(page);
check('I: no picture handed to the graphics card after the page had let it go; nothing in the console', lost === 0 && errors.length === 0, { lost, errors: errors.slice(0, 5) });
writeFileSync(resolve(out, 'traffic.json'), JSON.stringify({ seenA, smooth: { frames: smooth.length, worst, back }, target, inC, stars, kept, owned, caught, lit }, null, 1));
await browser.close(); server.close();
const passed = results.filter(Boolean).length;
console.log(passed === results.length ? `All ${results.length} checks passed.` : `${passed} of ${results.length} checks passed.`);
process.exit(passed === results.length ? 0 : 1);
