// A player's car running into someone and over them, and into another player's car (31 October 2026, the owner's
// words: "users can use their car to run over another car, as if nothing was blocking. Sometimes cars pass through
// characters without jamming them ... the car should jam them if they block the road/path. Jam them and climb over
// them, while the tyres of the car is climbing them, it should show on the car reaction"), played in a headless
// browser with a computer's settings or a phone's:
//  A  someone standing in the road ahead, the car at a crawl: struck, they go down across its way, and the car is not
//     stopped by them
//  B  it goes on over them: the front wheels climb onto them and come down, then the back wheels; the body's nose up as
//     the front wheels climb and down as the back ones do (pictures from beside it)
//  C  they stay down until it is past, and get up after
//  D  the same at speed: struck, thrown a little ahead, and gone over; the car keeps most of its pace
//  E  another player's car standing in the road: the car stops against it, not through it
//  F  what it costs: frames a second, the graphics card's memory (a phone under 150 MB); nothing in the console
//   node test/run-over.mjs [shots folder] [phone]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pastQuestion, enterTown } from './start.mjs';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] || '/tmp/run-over-shots');
const PHONE = process.argv[3] === 'phone';
mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); };
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const context = await browser.newContext(PHONE ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true } : { viewport: { width: 1100, height: 620 } });
const page = await context.newPage();
page.setDefaultTimeout(600000);
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); console.log('PAGE ERROR', e.message); });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`file://${resolve(root, 'dist/local.html')}#nointro-gameclock${PHONE ? '-lite' : ''}`, { timeout: 600000 });
await pastQuestion(page);
await page.fill('#name', 'Car Driver').catch(() => {});
await enterTown(page, { tap: PHONE });
await page.waitForFunction(() => window.__nlw.me && window.__nlw.me.mixer, null, { timeout: 300000 });
await page.evaluate((phone) => { const n = window.__nlw, g = n.host.game; const hour = n.view.clock.hourFloat; n.skip((24 + 10.5 - hour) % 24); g.state.weather = { kind: 'clear', until: g.state.t + 24 * 3600 }; n.setGraphics(phone ? 'low' : 'medium'); for (const id of ['toasts', 'notices']) { const el = document.getElementById(id); if (el) el.style.display = 'none'; } }, PHONE);
await page.waitForTimeout(2000);
const shot = (name) => page.screenshot({ path: resolve(out, `${name}.png`) });

// A straight stretch of road heading north, kept clear of the town's own cars for this (they are in the way, as they
// should be: test/traffic.mjs)
const ROAD = { x: -420, z: -60 };
const clearRoad = () => page.evaluate(() => { const g = window.__nlw.host.game; for (const c of g.internals.traffic.cars) if (c.mode === 'drive' || c.mode === 'stop') { c.mode = 'off'; c.v = 0; } });
// the car held at a pace (the page's own driving goes on as it does, every frame; this only keeps its speed)
const pace = (v) => page.evaluate((v) => { const n = window.__nlw; window.__pace = v; if (!window.__paceOn) { window.__paceOn = true; const keep = () => { if (window.__pace !== null && window.__pace !== undefined) n.carState.speed = window.__pace; requestAnimationFrame(keep); }; requestAnimationFrame(keep); } }, v);
// someone of the town's, grown up and not one of the police, standing at (x, z), facing across the road
const standSomeone = (x, z) => page.evaluate(([x, z]) => {
  const n = window.__nlw, g = n.host.game, A = g.internals.actors, pop = g.internals.population;
  for (let i = 0; i < pop.count; i += 1) {
    const who = pop.people[i];
    if (who.age < 20 || who.job === 'police' || A.has(i)) continue;
    if (pop.locate(i, g.state.t, {}).pose !== 0) continue;
    A.take(i, g.state.t, { x, z }); A.hold(i, 'Waiting', 0, 0); A.get(i).h = Math.PI / 2;
    return i;
  }
  return null;
}, [x, z]);
const into = async (x, z, h) => {
  await page.evaluate(([x, z, h]) => { const n = window.__nlw; if (n.view.self.incar) n.leaveCar(); n.place(x, z); n.face(h); n.server.send({ type: 'cars.owned', cars: ['grey-saloon'] }); }, [x, z, h]);
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => window.__nlw.driveCar('grey-saloon'));
  await page.waitForFunction(() => window.__nlw.view.self.incar && window.__nlw.carView.ready(), null, { timeout: 300000 }).catch(() => {});
  return r;
};
const side = () => page.evaluate(() => { const n = window.__nlw; n.cam.yaw = n.predicted.heading + 1.25; n.cam.dist = 6.5; n.cam.pitch = 0.12; n.cam.lastDrag = 1e9; });
const state = (i) => page.evaluate((i) => {
  const n = window.__nlw, g = n.host.game, m = g.internals.actors.get(i);
  return { car: { x: +n.predicted.x.toFixed(2), z: +n.predicted.z.toFixed(2), h: +n.predicted.heading.toFixed(3), speed: +n.carState.speed.toFixed(2) }, person: m ? { x: +m.x.toFixed(2), z: +m.z.toFixed(2), h: +m.h.toFixed(3), pose: m.pose, act: m.act } : null, bump: n.carView.bumpOf('drive') };
}, i);

// ---- A, B, C: at a crawl
await clearRoad();
const entered = await into(ROAD.x, ROAD.z, 0);
check('in the car on a straight road', !!(entered && entered.ok !== false), entered);
const who = await standSomeone(ROAD.x + 0.3, ROAD.z + 9);
check('someone standing in the road ahead', who !== null, who);
await side();
await page.waitForTimeout(1500);
await shot(`a1-before${PHONE ? '-phone' : ''}`);
await page.evaluate(() => window.__nlw.carView.bumpPeak('drive'));
await pace(1.0);
let struck = null, frontShot = false, backShot = false, upUnder = 0, underFrames = 0, lastSeen = null;
const frontPeak = [0, 0], backPeak = [0, 0];
let pitchMin = 0, pitchMax = 0;
for (let k = 0; k < 900; k += 1) {
  await clearRoad();
  await page.waitForTimeout(150);
  const s = await state(who);
  lastSeen = s;
  const pk = await page.evaluate(() => window.__nlw.carView.bumpPeak('drive'));
  if (pk) { frontPeak[0] = Math.max(frontPeak[0], pk.lifts[0] || 0); frontPeak[1] = Math.max(frontPeak[1], pk.lifts[1] || 0); backPeak[0] = Math.max(backPeak[0], pk.lifts[2] || 0); backPeak[1] = Math.max(backPeak[1], pk.lifts[3] || 0); pitchMin = Math.min(pitchMin, pk.pitchMin); pitchMax = Math.max(pitchMax, pk.pitchMax); }
  if (!struck && s.person && s.person.pose === 3) struck = { ...s };
  const along = s.person ? s.person.z - s.car.z : 99;
  if (s.person && Math.abs(along) < 2.3) { underFrames += 1; if (s.person.pose !== 3) upUnder += 1; }
  if (!frontShot && s.bump && (s.bump.lifts[0] > 0.08 || s.bump.lifts[1] > 0.08)) { frontShot = true; await shot(`b1-front-wheels-climbing${PHONE ? '-phone' : ''}`); }
  if (!backShot && s.bump && (s.bump.lifts[2] > 0.08 || s.bump.lifts[3] > 0.08)) { backShot = true; await shot(`b2-back-wheels-climbing${PHONE ? '-phone' : ''}`); }
  if (s.person && s.car.z > s.person.z + 4) break;
}
await pace(0);
await page.waitForTimeout(800);
await shot(`c1-past${PHONE ? '-phone' : ''}`);
check('A: struck at a crawl: down on the road, across the car\'s way', !!struck && Math.abs(Math.cos(struck.person.h - struck.car.h)) < 0.05, struck);
check('A: the car not stopped by them: it went on past them', !!lastSeen && lastSeen.person && lastSeen.car.z > lastSeen.person.z + 3, lastSeen);
check('B: the front wheels climbed over them (a wheel lifted by them, as high as a body lies)', Math.max(...frontPeak) > 0.12 && Math.max(...frontPeak) < 0.32, frontPeak);
check('B: and then the back wheels', Math.max(...backPeak) > 0.12 && Math.max(...backPeak) < 0.32, backPeak);
check('B: the body answered on its springs: nose up as the front climbed, nose down as the back did', pitchMin < -0.01 && pitchMax > 0.01, { pitchMin: +pitchMin.toFixed(3), pitchMax: +pitchMax.toFixed(3) });
check('C: nobody got up under the car', underFrames > 3 && upUnder === 0, { underFrames, upUnder });
await page.waitForFunction((i) => { const m = window.__nlw.host.game.internals.actors.get(i); return !m || m.pose !== 3; }, who, { timeout: 120000 }).catch(() => {});
const after = await state(who);
check('C: and once it was past, up again', !after.person || after.person.pose !== 3, after.person);

// ---- D: at speed
await clearRoad();
await into(ROAD.x, ROAD.z, 0);
const who2 = await standSomeone(ROAD.x - 0.4, ROAD.z + 14);
await side();
await page.waitForTimeout(1000);
await page.evaluate(() => window.__nlw.carView.bumpPeak('drive'));
// brought up to speed, and then driven on into them with the accelerator held, nothing holding its pace
await pace(7);
let hit = null, before = null, gone = null, freed = false;
for (let k = 0; k < 600; k += 1) {
  await clearRoad();
  await page.waitForTimeout(120);
  const s = await state(who2);
  if (!freed && s.person && s.person.z - s.car.z < 6) { freed = true; await pace(null); await page.keyboard.down('w'); }
  if (!hit && s.person && s.person.pose !== 3) before = s;
  if (!hit && s.person && s.person.pose === 3) { hit = s; await shot(`d1-struck-at-speed${PHONE ? '-phone' : ''}`); }
  if (hit && s.person && s.car.z > s.person.z + 4) { gone = s; break; }
}
await page.keyboard.up('w');
await pace(0);
const peakD = await page.evaluate(() => window.__nlw.carView.bumpPeak('drive'));
check('D: at speed, struck and down across its way, thrown a little ahead of where they stood', !!hit && Math.abs(Math.cos(hit.person.h - hit.car.h)) < 0.05 && hit.person.z > ROAD.z + 14.3, hit);
check('D: the car kept most of its pace through them, and went on over them', !!hit && !!before && !!gone && hit.car.speed > before.car.speed * 0.75 && hit.car.speed > 3, { before: before && before.car, at: hit && hit.car, gone: gone && gone.car });
check('D: its wheels went over them', !!peakD && Math.max(...peakD.lifts) > 0.1, peakD);

// ---- E: another player's car standing in the road
await clearRoad();
await into(ROAD.x, ROAD.z, 0);
const peer = () => page.evaluate(([x, z]) => { const g = window.__nlw.host.game; g.visitors.seen('peer-parked', { name: 'Parked_Peer', x: x + 3, z: z - 2, heading: 0, look: {}, cars: [{ car: 'red-winged-supercar', x, z, h: Math.PI / 2 }] }); }, [ROAD.x, ROAD.z + 16]);
await peer();
await page.waitForTimeout(2500);
await pace(5);
// driven on into it, and pushed on against it as a driver would: it is stopped when it goes no further
let stoppedAt = null, last = -1e9, still = 0;
for (let k = 0; k < 400; k += 1) {
  await peer(); await clearRoad();
  await page.waitForTimeout(200);
  const s = await page.evaluate(() => ({ z: window.__nlw.predicted.z, speed: window.__nlw.carState.speed }));
  if (s.z > ROAD.z + 6) await pace(2);
  still = s.z - last < 0.02 ? still + 1 : 0; last = s.z;
  if (still >= 6 || s.z > ROAD.z + 30) { stoppedAt = s; break; }
}
await pace(null);
await side();
await page.waitForTimeout(1500);
await shot(`e1-against-another-players-car${PHONE ? '-phone' : ''}`);
// its nose short of the other car's side: the other car stands across the road, 1.1 m from its middle to its side
check('E: another player\'s car standing in the road stops it, not through it', !!stoppedAt && stoppedAt.z < ROAD.z + 16 - 1.0 - 2.2 + 0.4, stoppedAt);

// ---- F
const cost = await page.evaluate(() => new Promise((done) => { const n = window.__nlw; let f = 0; const t0 = performance.now(); const tick = () => { f += 1; if (performance.now() - t0 < 6000) requestAnimationFrame(tick); else done({ fps: +(f * 1000 / (performance.now() - t0)).toFixed(1), pictures: +((n.graphics.pictures || 0) / 1048576).toFixed(1), buffers: +((n.graphics.buffers || 0) / 1048576).toFixed(1) }); }; requestAnimationFrame(tick); }));
check('F: what it costs: the graphics card\'s memory (a phone under 150 MB)', !PHONE || cost.pictures + cost.buffers < 150, cost);
check('F: nothing in the console', errors.length === 0, errors.slice(0, 5));
await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
