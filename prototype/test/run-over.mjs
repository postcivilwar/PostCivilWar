// A player's car running into someone and over them, and into another player's car (31 October 2026, the owner's
// words: "users can use their car to run over another car, as if nothing was blocking. Sometimes cars pass through
// characters without jamming them ... the car should jam them if they block the road/path. Jam them and climb over
// them, while the tyres of the car is climbing them, it should show on the car reaction"), played in a headless
// browser with a computer's settings or a phone's:
//  A  someone standing in the road ahead, the car at a crawl: struck, they go down across its way (as their figure is
//     drawn, from its bones), and the car is not stopped by them
//  B  it goes on over them: the front wheels climb onto them and come down, then the back wheels; the body's nose up as
//     the front wheels climb and down as the back ones do (stopped a moment with a front wheel and then a back wheel up
//     on them, for a picture from beside it)
//  C  they stay down until it is past, stopped on them or going over them, and get up after
//  D  the same at speed: struck, thrown a little ahead, and gone over; the car keeps most of its pace
//  E  another player's car standing in the road: the car stops against it, not through it
//  F  what it costs: frames a second, the graphics card's memory (a phone under 150 MB); nothing in the console
//   ../server/with-postgres.sh node test/run-over.mjs [shots folder] [phone]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const here = dirname(fileURLToPath(import.meta.url));
const { createDevServer } = await import(resolve(here, '../../server/dev.mjs'));
const { pastQuestion, enterTown, watchPictures } = await import(resolve(here, 'start.mjs'));
const out = resolve(process.argv[2] || '/tmp/run-over-shots');
const PHONE = process.argv[3] === 'phone';
mkdirSync(out, { recursive: true });
if (!process.env.PCW_DATABASE_URL) { console.error('PCW_DATABASE_URL is not set: run this with server/with-postgres.sh'); process.exit(2); }
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); };
// the website as it is served, with its server (a page opened from the disk cannot fetch a car's model)
const server = createDevServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext(PHONE ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, serviceWorkers: 'block' } : { viewport: { width: 1100, height: 620 }, serviceWorkers: 'block' });
await watchPictures(context);
const page = await context.newPage();
page.setDefaultTimeout(900000);
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); console.log('PAGE ERROR', e.message); });
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 4\d\d|AudioContext|Service Worker registration blocked|GPU stall due to ReadPixels/.test(m.text())) errors.push(m.text()); });
await page.goto(`${origin}/#gameclock${PHONE ? '-lite' : ''}`, { timeout: 900000 });
await page.waitForSelector('#cover-play', { state: 'visible', timeout: 900000 });
await page.evaluate(() => document.getElementById('cover-play').click());
await page.waitForSelector('#open-signup', { state: 'visible', timeout: 900000 });
await page.click('#open-signup');
await page.fill('#account-username', `Runover_${Math.random().toString(36).slice(2, 7)}`);
await page.fill('#account-password', 'a password for running over');
await page.click('#account-submit');
await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 180000 });
await pastQuestion(page);
await page.fill('#name', 'Car Driver');
await enterTown(page, { tap: PHONE, wait: 900000 });
await page.waitForFunction(() => window.__nlw.me && window.__nlw.me.mixer, null, { timeout: 300000 });
await page.evaluate((phone) => { const n = window.__nlw, g = n.host.game; const hour = n.view.clock.hourFloat; n.skip((24 + 10.5 - hour) % 24); g.state.weather = { kind: 'clear', until: g.state.t + 24 * 3600 }; n.setGraphics(phone ? 'low' : 'medium'); for (const id of ['toasts', 'notices']) { const el = document.getElementById(id); if (el) el.style.display = 'none'; } }, PHONE);
await page.waitForTimeout(2000);
const shot = (name) => page.screenshot({ path: resolve(out, `${name}.png`) });

// A clear stretch of ground heading north (+z), to the road and over it, kept clear of the town's own cars for this
// (they are in the way, as they should be: test/traffic.mjs)
const ROAD = { x: -420, z: -60 };
// (and the police kept out of it: what this tests is the car, not the law. An officer seeing it would bring the law down
// on the player, as she should (test/stars.mjs), and take them out of the car: every officer of the beat near is kept
// at the station for the while, none sent, and anything of the player's on the book let lapse)
const clearRoad = () => page.evaluate(() => {
  const n = window.__nlw, g = n.host.game, p = g.state.players[n.playerId], J = g.state.justice;
  const A = g.internals.actors, pop = g.internals.population;
  for (const c of g.internals.traffic.cars) if (c.mode === 'drive' || c.mode === 'stop') { c.mode = 'off'; c.v = 0; }
  for (const o of Object.values(J.officers || {})) { delete J.officers[o.i]; if (A.has(o.i)) A.release(o.i); }
  for (const q of pop.people) {
    if (q.job !== 'police') continue;
    const at = pop.locate(q.index, g.state.t, {});
    if (at.pose === 4 || Math.hypot(at.x - n.predicted.x, at.z - n.predicted.z) > 90) continue;
    if (A.has(q.index) || A.take(q.index, g.state.t, { x: at.x, z: at.z })) A.hold(q.index, 'At the station', 4, 0);
  }
  for (const c of Object.values(J.crimes || {})) if (c.culprit === p.id && c.status === 'open') c.status = 'lapsed';
  if (p.law && p.law.state !== 'normal' && !p.custody) p.law = { state: 'normal', since: 0, crimes: [], seenAt: null };
});
// the car held at a pace (the page's own driving goes on as it does, every frame; this only keeps its speed). And, while
// `climb` is set, the car stopped where it is the moment its right front wheel and then its right back wheel is first up
// on someone (eight centimetres), for a picture of it from that side: `window.__climb` says which, and `go()` drives it
// on again.
const pace = (v) => page.evaluate((v) => { const n = window.__nlw; window.__pace = v; if (!window.__paceOn) { window.__paceOn = true; const keep = () => {
  const c = window.__climb, b = c && n.carView.bumpOf('drive');
  if (b && !c.at) {
    // (the wheels on the side the picture is taken from, the car's right: its second and fourth)
    const front = b.lifts[1] || 0, back = b.lifts[3] || 0;
    if (!c.front && front > 0.08) { c.front = { lifts: b.lifts, pitch: b.pitch }; c.at = 'front'; c.was = window.__pace; window.__pace = 0; }
    else if (c.front && c.front.done && !c.back && back > 0.08) { c.back = { lifts: b.lifts, pitch: b.pitch }; c.at = 'back'; c.was = window.__pace; window.__pace = 0; }
  }
  if (window.__pace !== null && window.__pace !== undefined) n.carState.speed = window.__pace; requestAnimationFrame(keep); }; requestAnimationFrame(keep); } }, v);
const go = () => page.evaluate(() => { const c = window.__climb; if (c && c.at) { c[c.at].done = true; c.at = null; window.__pace = c.was; } });
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
// the view from beside the car, a little behind it (in a car the view follows it: turned round as a finger would turn
// it, and held there; `behind()` lets it go back)
const side = () => page.evaluate(() => { const n = window.__nlw; n.cam.lastDrag = 1e9; n.rig.live.look = 1.45; n.rig.live.lookPitch = -0.04; });
const behind = () => page.evaluate(() => { const n = window.__nlw; n.cam.lastDrag = -10; });
// where things are, in one look: the car, the one in its way, how the car's wheels and body stand, the most each wheel
// was lifted since the last look, and the climb
const state = (i) => page.evaluate((i) => {
  const n = window.__nlw, g = n.host.game, m = g.internals.actors.get(i);
  const f = n.crowd.figureAt(i);
  // (the body as it is drawn, from its bones: the bars the wheels meet, the trunk first, wheel-bumps.js)
  const bars = n.crowd.lying(n.predicted.x, n.predicted.z, 30).map((b) => [b.ax, b.az, b.bx, b.bz].map((v) => +v.toFixed(2)));
  return { car: { x: +n.predicted.x.toFixed(2), z: +n.predicted.z.toFixed(2), h: +n.predicted.heading.toFixed(3), speed: +n.carState.speed.toFixed(2) }, person: m ? { x: +m.x.toFixed(2), z: +m.z.toFixed(2), h: +m.h.toFixed(3), pose: m.pose, act: m.act } : null, bump: n.carView.bumpOf('drive'), peak: n.carView.bumpPeak('drive'), drawn: f ? { x: +f.x.toFixed(2), z: +f.z.toFixed(2), pose: f.pose } : null, bars, climb: window.__climb ? { at: window.__climb.at || null, front: !!window.__climb.front, back: !!window.__climb.back } : null, incar: !!n.view.self.incar, stars: n.view.self.law ? n.view.self.law.stars || 0 : 0 };
}, i);
// (no part of this runs on for ever: each has a while of its own, and is a failure if it runs out)
const within = (minutes) => { const end = Date.now() + minutes * 60000; return () => Date.now() < end; };

// ---- A, B, C: at a crawl
await clearRoad();
const entered = await into(ROAD.x, ROAD.z, 0);
const drawnCar = await page.evaluate(() => window.__nlw.carView.ready());
check('in the car, the car drawn', !!(entered && entered.ok !== false) && drawnCar, { entered, drawnCar });
// (in the middle of its way: lying across it, they reach under the wheels on both sides)
const who = await standSomeone(ROAD.x, ROAD.z + 9);
check('someone standing in the car\'s way ahead', who !== null, who);
await clearRoad();
await side();
await page.waitForTimeout(2500);
await shot(`a1-before${PHONE ? '-phone' : ''}`);
await page.evaluate(() => { window.__nlw.carView.bumpPeak('drive'); window.__climb = {}; });
await pace(1.0);
let struck = null, upUnder = 0, underFrames = 0, lastSeen = null, outOfCar = false, body = null;
const frontPeak = [0, 0], backPeak = [0, 0];
let pitchMin = 0, pitchMax = 0;
const climbs = {};
// (each look: the most each wheel was lifted and the body pitched since the last, and whether they were up under it)
const noted = (s) => {
  const pk = s.peak;
  if (pk) { frontPeak[0] = Math.max(frontPeak[0], pk.lifts[0] || 0); frontPeak[1] = Math.max(frontPeak[1], pk.lifts[1] || 0); backPeak[0] = Math.max(backPeak[0], pk.lifts[2] || 0); backPeak[1] = Math.max(backPeak[1], pk.lifts[3] || 0); pitchMin = Math.min(pitchMin, pk.pitchMin); pitchMax = Math.max(pitchMax, pk.pitchMax); }
  if (s.person) { const along = s.person.z - s.car.z; if (Math.abs(along) < 2.3) { underFrames += 1; if (s.person.pose !== 3) upUnder += 1; } }
  // the body lying as drawn: its trunk (the hips to the top of the head) at its longest, flat on the ground
  if (s.person && s.person.pose === 3 && s.bars.length) {
    const [ax, az, bx, bz] = s.bars[0], len = Math.hypot(bx - ax, bz - az);
    if (!body || len > body.len) body = { len: +len.toFixed(2), way: +Math.atan2(bx - ax, bz - az).toFixed(3), bars: s.bars, car: s.car.h };
  }
  return s;
};
for (const more = within(14); more();) {
  await clearRoad();
  const s = noted(await state(who));
  lastSeen = s;
  if (!s.incar) { outOfCar = true; break; }
  if (!struck && s.person && s.person.pose === 3) struck = { ...s };
  // stopped with a wheel up on them: a picture from beside it, and on again
  if (s.climb && s.climb.at) {
    await side();
    await page.waitForTimeout(3000);
    const t = noted(await state(who));
    climbs[s.climb.at] = { bump: t.bump, person: t.person, car: t.car };
    await shot(`b${s.climb.at === 'front' ? 1 : 2}-${s.climb.at}-wheels-up-on-them${PHONE ? '-phone' : ''}`);
    noted(await state(who));
    await go();
  }
  // on until it is well past where they were standing
  if (s.car.z > ROAD.z + 9 + 6.5) break;
  await page.waitForTimeout(700);
}
await pace(0);
await page.evaluate(() => { window.__climb = null; });
await page.waitForTimeout(800);
await shot(`c1-past${PHONE ? '-phone' : ''}`);
check('A: struck at a crawl: down on the ground', !!struck, struck);
// (drawn lying across its way: the trunk, the hips to the top of the head, more across the way than along it)
check('A: lying across the car\'s way, as the figure is drawn', !!body && body.len > 0.5 && Math.abs(Math.cos(body.way - body.car)) < 0.5, body);
check('A: the car not stopped by them: it went on past them', !outOfCar && !!lastSeen && lastSeen.car.z > ROAD.z + 9 + 6.5, lastSeen);
check('B: the front wheels up on them, both sides, as high as a body lies (stopped there for the picture)', !!climbs.front && Math.max(climbs.front.bump.lifts[0], climbs.front.bump.lifts[1]) > 0.08 && Math.min(...frontPeak) > 0.05 && Math.max(...frontPeak) < 0.32, { front: climbs.front && climbs.front.bump, frontPeak });
check('B: and then the back wheels, both sides', !!climbs.back && Math.max(climbs.back.bump.lifts[2], climbs.back.bump.lifts[3]) > 0.08 && Math.min(...backPeak) > 0.05 && Math.max(...backPeak) < 0.32, { back: climbs.back && climbs.back.bump, backPeak });
check('B: the body answered on its springs: nose up as the front climbed, nose down as the back did', pitchMin < -0.01 && pitchMax > 0.01 && !!climbs.front && !!climbs.back && Math.sign(climbs.front.bump.pitch) !== Math.sign(climbs.back.bump.pitch), { pitchMin: +pitchMin.toFixed(3), pitchMax: +pitchMax.toFixed(3), front: climbs.front && +climbs.front.bump.pitch.toFixed(3), back: climbs.back && +climbs.back.bump.pitch.toFixed(3) });
check('C: nobody got up under the car, stopped on them or going over them', underFrames > 3 && upUnder === 0, { underFrames, upUnder });
await page.waitForFunction((i) => { const m = window.__nlw.host.game.internals.actors.get(i); return !m || m.pose !== 3; }, who, { timeout: 180000 }).catch(() => {});
const after = await state(who);
check('C: and once it was past, up again', !after.person || after.person.pose !== 3, after.person);

// ---- D: at speed
await behind();
await clearRoad();
await into(ROAD.x, ROAD.z, 0);
const who2 = await standSomeone(ROAD.x - 0.4, ROAD.z + 14);
await clearRoad();
await page.waitForTimeout(1000);
await page.evaluate(() => window.__nlw.carView.bumpPeak('drive'));
// (the town's time slowed for this to a twelfth: this machine draws a frame every two seconds or so, and the game moves
// on at most half a second for each, in which a car at speed goes five metres, over someone and past them between two
// frames, its wheels never drawn on them. A twelfth of that is 0.04 s, as close together as a phone's frames at 25 a
// second. Everything in the town goes as it does, only more slowly here)
await page.evaluate(() => window.__nlw.slow(1 / 12));
// brought up to speed, and then driven on into them with the accelerator held, nothing holding its pace
await pace(7);
let hit = null, before = null, gone = null, freed = false, peakD = 0;
for (const more = within(8); more();) {
  await clearRoad();
  const s = await state(who2);
  if (s.peak) peakD = Math.max(peakD, ...s.peak.lifts);
  if (!s.incar) break;
  if (!freed && s.person && s.person.z - s.car.z < 6) { freed = true; await pace(null); await page.keyboard.down('w'); }
  if (!hit && s.person && s.person.pose !== 3) before = s;
  if (!hit && s.person && s.person.pose === 3) { hit = s; await shot(`d1-struck-at-speed${PHONE ? '-phone' : ''}`); }
  if (s.car.z > ROAD.z + 14 + 5) { gone = s; break; }
  await page.waitForTimeout(100);
}
await page.keyboard.up('w');
await pace(0);
{ const s = await state(who2); if (s.peak) peakD = Math.max(peakD, ...s.peak.lifts); }
await page.evaluate(() => window.__nlw.slow(1));
check('D: at speed, struck and down, thrown a little ahead of where they stood', !!hit && hit.person.z > ROAD.z + 14.3, hit);
check('D: the car kept most of its pace through them, and went on over them', !!hit && !!before && !!gone && hit.car.speed > before.car.speed * 0.75 && hit.car.speed > 3, { before: before && before.car, at: hit && hit.car, gone: gone && gone.car });
check('D: its wheels went over them', peakD > 0.1, { peakD: +peakD.toFixed(3) });

// ---- E: another player's car standing in the road
await clearRoad();
await into(ROAD.x, ROAD.z, 0);
const peer = () => page.evaluate(([x, z]) => { const g = window.__nlw.host.game; g.visitors.seen('peer-parked', { name: 'Parked_Peer', x: x + 3, z: z - 2, heading: 0, look: {}, cars: [{ car: 'red-winged-supercar', x, z, h: Math.PI / 2 }] }); }, [ROAD.x, ROAD.z + 16]);
await peer();
await page.waitForTimeout(2500);
await pace(5);
// driven on into it, and pushed on against it as a driver would: it is stopped when it goes no further
let stoppedAt = null, last = -1e9, still = 0;
for (const more = within(8); more();) {
  await peer(); await clearRoad();
  await page.waitForTimeout(200);
  const s = await page.evaluate(() => ({ z: window.__nlw.predicted.z, speed: window.__nlw.carState.speed }));
  if (s.z > ROAD.z + 6) await pace(2);
  still = s.z - last < 0.02 ? still + 1 : 0; last = s.z;
  if (still >= 6 || s.z > ROAD.z + 30) { stoppedAt = s; break; }
}
await pace(null);
await side();
await page.waitForTimeout(2500);
await shot(`e1-against-another-players-car${PHONE ? '-phone' : ''}`);
// its nose short of the other car's side: the other car stands across the road, 1.1 m from its middle to its side
check('E: another player\'s car standing in the road stops it, not through it', !!stoppedAt && stoppedAt.z < ROAD.z + 16 - 1.0 - 2.2 + 0.4, stoppedAt);

// ---- F
const cost = await page.evaluate(() => new Promise((done) => { const n = window.__nlw; let f = 0; const t0 = performance.now(); const tick = () => { f += 1; if (performance.now() - t0 < 6000) requestAnimationFrame(tick); else done({ fps: +(f * 1000 / (performance.now() - t0)).toFixed(1), pictures: +((n.graphics.pictures || 0) / 1048576).toFixed(1), buffers: +((n.graphics.buffers || 0) / 1048576).toFixed(1) }); }; requestAnimationFrame(tick); }));
check('F: what it costs: the graphics card\'s memory (a phone under 150 MB)', !PHONE || cost.pictures + cost.buffers < 150, cost);
check('F: nothing in the console', errors.length === 0, errors.slice(0, 5));
await browser.close();
server.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
