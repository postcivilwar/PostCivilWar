// Cars shot, and the view from the driver's seat (6 November 2026, the owner's brief, Stage 4, approved in advance:
// "bullet holes and breaking glass when a car is shot"; "a view from the driver's seat as a camera choice"), in a
// headless browser on the website as it is served with its server and a database:
//  A  this player's own Grey Saloon standing in a street; the rifle taken out beside it;
//  B  a round into its driver's door window: the window breaks whole (toughened glass), its bits fall onto the road,
//     and the window is open;
//  C  rounds into its windscreen: holes, each with its star of cracks, and the windscreen holds together;
//  D  a round into its back door below the window: a hole in the paint;
//  E  gone out of sight and come back: fetched again, it has the same holes and the same window broken;
//  F  a second player's rounds (a second copy of the town in this page, joined as two devices are) into its other
//     front window: here, as their game tells them, that window breaks too;
//  G  the view from the driver's seat: at its wheel, the view brought in past the nearest behind it (a pinch on a
//     phone, the mouse's wheel here) into the driver's seat: the eye where the player's own eyes are, looking ahead
//     along the car, the hands on the wheel drawn and the head not; out again the same way; C goes round it too;
//     at night the street lamps near are given back by the glass;
//  H  nothing in the console; pictures of each.
//   ../server/with-postgres.sh node test/car-shot.mjs [shots folder]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDevServer } from '../../server/dev.mjs';
import { pastQuestion, enterTown, watchPictures, lostPictures } from './start.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const out = process.argv[2] || '/tmp/car-shot-shots';
mkdirSync(out, { recursive: true });
const server = createDevServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); };
const MODEL = 'grey-saloon', KEY = `park:${MODEL}`;

const context = await browser.newContext({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
await watchPictures(context);
const page = await context.newPage(); page.setDefaultTimeout(240000);
page.on('pageerror', (e) => check('H: no error in the page', false, `${e.message} ${(e.stack || '').split('\n').slice(0, 4).join(' | ')}`));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 4\d\d/.test(m.text())) check('H: no error in the console', false, m.text()); });
const shot = (name) => page.screenshot({ path: resolve(out, `${name}.png`) });
const username = `Shot_${Math.random().toString(36).slice(2, 8)}`;

await page.goto(`${origin}/#nointro-gameclock`, { timeout: 300000 });
await page.waitForFunction(() => !!(window.__nlw && window.__nlw.intro), null, { timeout: 300000 });
await page.waitForSelector('#open-signup', { state: 'visible', timeout: 300000 });
await page.click('#open-signup');
await page.fill('#account-username', username); await page.fill('#account-password', 'a password for the car shot test');
await page.click('#account-submit');
await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 120000 });
await pastQuestion(page);
await page.fill('#name', 'Car Shot Test');
await enterTown(page);
await page.waitForFunction(() => window.__nlw.me && window.__nlw.me.mixer, null, { timeout: 240000 });
await page.evaluate(() => { const n = window.__nlw; const g = n.host.game; g.state.weather = { kind: 'clear', until: g.state.t + 8 * 3600 }; const hour = n.view.clock.hourFloat; if (hour < 9 || hour > 14) n.skip((24 + 10 - hour) % 24); });

// a clear place near Market Road, no police officer within 90 m of it (rounds fired in front of one make a prisoner)
const spot = await page.evaluate(() => {
  const n = window.__nlw, g = n.host.game, pop = g.internals.population, o = {};
  const police = pop.people.filter((q) => q.job === 'police').map((q) => { pop.locate(q.index, g.state.t, o); return { x: o.x, z: o.z }; });
  for (let r = 0; r < 120; r += 3) for (let k = 0; k < 24; k += 1) {
    const a = (k / 24) * Math.PI * 2, x = 8.5 + Math.cos(a) * r, z = -75 + Math.sin(a) * r;
    if (!n.walkable(x, z) || police.some((p) => Math.hypot(p.x - x, p.z - z) < 90)) continue;
    for (let j = 0; j < 16; j += 1) {
      const h = (j / 16) * Math.PI * 2;
      let clear = true;
      for (let d = -9; d <= 12 && clear; d += 1) for (const s of [-8, -6, -4, -2, 0, 2, 4, 6, 8]) { const px = x + Math.sin(h) * d + Math.cos(h) * s, pz = z + Math.cos(h) * d - Math.sin(h) * s; if (!n.walkable(px, pz)) { clear = false; break; } }
      if (clear) return { x, z, h };
    }
  }
  return null;
});
check('a clear place, no police near', !!spot, spot);
if (!spot) { await browser.close(); server.close(); process.exit(1); }
// (the town's people near kept indoors a while, so that the rounds go where they are aimed: as the guns' test does)
const clearPeople = () => page.evaluate((s) => { const n = window.__nlw, g = n.host.game, pop = g.internals.population, A = g.internals.actors, o = {}; for (let i = 0; i < pop.count; i += 1) { if (pop.people[i].job === 'police') continue; pop.locate(i, g.state.t, o); if (o.pose === 4 || Math.hypot(o.x - s.x, o.z - s.z) > 70) continue; if (A.take(i, g.state.t)) A.hold(i, 'Indoors', 4, g.state.real + 900); } }, spot);
const settle = async () => { await page.waitForFunction(() => !window.__nlw.boarding, null, { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(400); };
const harm = (key = KEY) => page.evaluate((k) => window.__nlw.carView.harmOf(k), key);
async function frames(k = 4) {
  await page.evaluate(() => { if (window.__frames === undefined) { window.__frames = 0; const f = () => { window.__frames += 1; requestAnimationFrame(f); }; requestAnimationFrame(f); } });
  const f0 = await page.evaluate(() => window.__frames);
  await page.waitForFunction(([a, n]) => window.__frames >= a + n, [f0, k], { timeout: 180000 }).catch(() => {});
}
// a point of the car, in the town: (`along` metres ahead of its middle, `across` to its left, `up` from the ground)
const carPoint = (along, across, up) => page.evaluate(([a, c, u, k]) => { const car = window.__nlw.carView.driven(k); if (!car) return null; const p = car.group.position, h = car.group.rotation.y; return [p.x + Math.sin(h) * a + Math.cos(h) * c, p.y + u, p.z + Math.cos(h) * a - Math.sin(h) * c]; }, [along, across, up, KEY]);
// stand at a place, facing a point, the aim turned onto it, and rounds fired at it until `count` have gone
async function standAndFire(at, point, count) {
  await page.evaluate(([s, p]) => { const n = window.__nlw; n.place(s[0], s[1]); n.face(Math.atan2(p[0] - s[0], p[2] - s[1])); }, [at, point]);
  await frames(6);
  for (let k = 0; k < 4; k += 1) { await page.evaluate((pt) => { const n = window.__nlw, o = n.gunPlay.aimFrom; const dx = pt[0] - o.x, dy = pt[1] - o.y, dz = pt[2] - o.z, d = Math.hypot(dx, dy, dz); n.cam.yaw = Math.atan2(dx, dz); n.cam.pitch = Math.asin(-dy / d); }, point); await frames(2); }
  const before = await page.evaluate(() => window.__nlw.gunPlay.stats.fired);
  await page.keyboard.down('f');
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    const now = await page.evaluate((pt) => { const n = window.__nlw, o = n.gunPlay.aimFrom; const dx = pt[0] - o.x, dy = pt[1] - o.y, dz = pt[2] - o.z, d = Math.hypot(dx, dy, dz); n.cam.yaw = Math.atan2(dx, dz); n.cam.pitch = Math.asin(-dy / d); return n.gunPlay.stats.fired; }, point);
    if (now - before >= count) break;
    await page.waitForTimeout(20);
  }
  await page.keyboard.up('f');
  await page.waitForTimeout(600);
  return (await page.evaluate(() => window.__nlw.gunPlay.stats.fired)) - before;
}

// ---- A: their car standing in the street, the rifle out beside it ----
await page.evaluate((s) => { const n = window.__nlw; n.place(s.x, s.z); n.face(s.h); n.host.game.intent(n.playerId, { type: 'cars.owned', cars: ['grey-saloon'] }); }, spot);
const brought = await page.evaluate((m) => window.__nlw.driveCar(m), MODEL);
await page.waitForFunction(() => { const c = window.__nlw.carView.driven(); return c && c.glazed; }, null, { timeout: 240000 }).catch(() => {});
await page.evaluate(() => window.__nlw.leaveCar());
await settle();
await page.waitForFunction((k) => { const c = window.__nlw.carView.driven(k); return c && c.glazed; }, KEY, { timeout: 60000 }).catch(() => {});
check('A: their own Grey Saloon standing in the street, drawn with its glass', !!brought && brought.ok && (await page.evaluate((k) => { const c = window.__nlw.carView.driven(k); return !!(c && c.glazed && c.harmNow); }, KEY)), null);
await clearPeople();
await page.keyboard.press('x');
const drawn = await page.waitForFunction(() => { const n = window.__nlw; return n.gunPlay.out && n.gunPlay.state.gun && n.gunPlay.state.gun.ready && n.gunPlay.weight > 0.95; }, null, { timeout: 120000 }).then(() => true).catch(() => false);
check('A: the rifle out', drawn, null);

// ---- B: its driver's door window: broken whole ----
const side = await carPoint(-0.05, 5.2, 0);
// (the middle of its driver's door window, from beside it)
const sideFront = await carPoint(0.5, 5.2, 0);
const headIn = await carPoint(0.5, 0.35, 1.15);
const firedB = await standAndFire([sideFront[0], sideFront[2]], headIn, 1);
const hB = await harm();
const bits = await page.evaluate(() => window.__nlw.carView.glassBits());
check('B: a round into its driver\'s door window: the window breaks whole, and is open', firedB >= 1 && hB && hB.car && hB.car.broken.includes('fl'), { fired: firedB, harm: hB });
check('B: its bits fall onto the road', bits > 10, { bits });
await page.evaluate(() => { const n = window.__nlw; n.cam.yaw += 0.5; n.cam.pitch = 0.15; });
await frames(8);
await shot('b-window-broken');
await page.waitForTimeout(2500);
await shot('b-bits-on-the-road');

// ---- C: its windscreen: holes with their cracks, the windscreen whole ----
const front = await carPoint(6.5, 0.3, 0);
const screenAt = await carPoint(0.9, 0.3, 1.15);
const firedC = await standAndFire([front[0], front[2]], screenAt, 2);
const hC = await harm();
check('C: rounds into its windscreen: holes with their stars of cracks, and the windscreen holds together', firedC >= 2 && hC && hC.car && hC.car.glass >= 1 && hC.car.broken.length === 1, { fired: firedC, harm: hC });
await page.evaluate(() => { const n = window.__nlw; n.cam.dist = 2.4; });
await frames(8);
await shot('c-windscreen-holes');

// ---- D: its back door below the window: a hole in the paint ----
const doorLow = await carPoint(-0.95, 0.4, 0.62);
const firedD = await standAndFire([side[0], side[2]], doorLow, 1);
const hD = await harm();
check('D: a round into its back door below the window: a hole in the paint', firedD >= 1 && hD && hD.car && hD.car.holes - hD.car.glass >= 1, { fired: firedD, harm: hD });
await page.evaluate(() => { const n = window.__nlw; n.cam.dist = 2.2; n.cam.pitch = 0.1; });
await frames(8);
await shot('d-door-hole');
await page.keyboard.press('x');
await page.waitForTimeout(800);

// ---- E: out of sight and back: the same holes and the same window broken ----
const kept = await harm();
await page.evaluate((s) => { const n = window.__nlw; n.place(s.x + 400, s.z); }, spot);
await page.waitForFunction((k) => !window.__nlw.carView.keys().includes(k), KEY, { timeout: 60000 }).catch(() => {});
const away = await page.evaluate((k) => window.__nlw.carView.keys().includes(k), KEY);
await page.evaluate(([s, sd]) => { const n = window.__nlw; n.place(sd[0], sd[2]); n.face(Math.atan2(s.x - sd[0], s.z - sd[2])); }, [spot, side]);
await page.waitForFunction((k) => { const c = window.__nlw.carView.driven(k); return c && c.glazed; }, KEY, { timeout: 120000 }).catch(() => {});
await frames(6);
const back = await harm();
check('E: gone out of sight (put away) and come back: fetched again, the same holes and the same window broken', !away && back && back.car && back.car.holes === kept.car.holes && back.car.broken.join() === kept.car.broken.join(), { kept, back, away });

// ---- F: a second player's rounds, as their game tells them ----
const otherSide = await carPoint(0.5, -5.0, 0);
const headRight = await carPoint(0.5, -0.35, 1.15);
const twin = await page.evaluate((at) => { const n = window.__nlw; const t = n.twin('Second Shooter', at[0], at[2]); return { id: t.id }; }, otherSide);
await page.waitForFunction(() => window.__nlw.shownPeers.some((q) => q.name === 'Second Shooter'), null, { timeout: 120000 }).catch(() => {});
await page.waitForTimeout(1000);
await page.evaluate(([at, aim]) => {
  const n = window.__nlw;
  // (their round's path, as their game tells it: from their gun, through the window and on, stopped beyond the car)
  const o = [at[0], aim[1] + 0.25, at[2]];
  const d = [aim[0] - o[0], aim[1] - o[1], aim[2] - o[2]], L = Math.hypot(d[0], d[1], d[2]);
  const e = [o[0] + (d[0] / L) * (L + 3), o[1] + (d[1] / L) * (L + 3), o[2] + (d[2] / L) * (L + 3)];
  n.second.fire(o, e, 'vehicle');
}, [otherSide, headRight]);
await page.waitForFunction((k) => { const h = window.__nlw.carView.harmOf(k); return h && h.car && h.car.broken.includes('fr'); }, KEY, { timeout: 30000 }).catch(() => {});
const hF = await harm();
check('F: a second player\'s round, as their game tells it: here, the front passenger\'s window breaks too', !!twin && hF && hF.car && hF.car.broken.includes('fr'), { harm: hF });
await page.evaluate(([at, c]) => { const n = window.__nlw; n.place(at[0] + 1.5, at[2]); n.face(Math.atan2(c[0] - at[0], c[2] - at[2])); n.cam.dist = 4; }, [otherSide, headRight]);
await frames(10);
await shot('f-second-players-round');

// ---- G: the view from the driver's seat ----
await page.evaluate((sd) => { const n = window.__nlw; n.place(sd[0], sd[2]); }, side);
await page.evaluate((m) => window.__nlw.driveCar(m), MODEL);
await settle();
check('G: at its wheel', await page.evaluate(() => !!window.__nlw.view.self.incar), null);
// (the view brought in: the mouse's wheel turned toward the picture, as a pinch on a phone)
await page.mouse.move(480, 300);
for (let k = 0; k < 14 && (await page.evaluate(() => window.__nlw.rig.view)) !== 'cockpit'; k += 1) { await page.mouse.wheel(0, -100); await page.waitForTimeout(120); }
await page.waitForTimeout(1500);
const seat = await page.evaluate(() => {
  const n = window.__nlw, THREE = n.THREE, car = n.carView.driven(), camera = n.camera;
  const eye = car.cabin.localToWorld(new THREE.Vector3(car.driver.hip[0], car.driver.hip[1] + 0.66 / car.scale, car.driver.hip[2]));
  const p = camera.position, dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(car.cabin.getWorldQuaternion(new THREE.Quaternion()));
  let head = null; n.me.group.traverse((o) => { if (!head && o.isBone && /head$/i.test(o.name)) head = o; });
  return { view: n.rig.view, gap: +p.distanceTo(eye).toFixed(3), ahead: +dir.dot(fwd).toFixed(3), shown: n.me.group.visible, head: head ? +head.scale.x.toFixed(3) : null, near: camera.near };
});
check('G: in past the nearest view behind it: the view from the driver\'s seat, the eye where the player\'s own eyes are, looking ahead along the car', seat.view === 'cockpit' && seat.gap < 0.3 && seat.ahead > 0.9, seat);
check('G: the figure drawn (the hands on the wheel), its head left out', seat.shown && seat.head !== null && seat.head < 0.01, seat);
await shot('g-driver-seat');
for (let k = 0; k < 6 && (await page.evaluate(() => window.__nlw.rig.view)) === 'cockpit'; k += 1) { await page.mouse.wheel(0, 100); await page.waitForTimeout(120); }
await page.waitForTimeout(1200);
const outOf = await page.evaluate(() => { const n = window.__nlw; let head = null; n.me.group.traverse((o) => { if (!head && o.isBone && /head$/i.test(o.name)) head = o; }); return { view: n.rig.view, head: head ? +head.scale.x.toFixed(3) : null }; });
check('G: out again the same way: close behind, the head drawn again', outOf.view === 'chase' && outOf.head === 1, outOf);
const cycle = [];
for (let k = 0; k < 6; k += 1) { await page.keyboard.press('c'); await page.waitForTimeout(150); cycle.push(await page.evaluate(() => window.__nlw.rig.view)); }
check('G: C goes round the views in a car, the driver\'s seat among them', cycle.includes('cockpit') && cycle.includes('chase'), cycle);
// at night, in the driver's seat: the street lamps near given back by the glass
for (let i = 0; i < 24 && (await page.evaluate(() => window.__nlw.night)) < 0.7; i += 1) { await page.evaluate(() => window.__nlw.skip(1)); await page.waitForTimeout(250); }
for (let k = 0; k < 8 && (await page.evaluate(() => window.__nlw.rig.view)) !== 'cockpit'; k += 1) { await page.keyboard.press('c'); await page.waitForTimeout(150); }
await page.waitForTimeout(2500);
const night = await page.evaluate(() => ({ night: +window.__nlw.night.toFixed(2), glints: window.__nlw.glintCount, view: window.__nlw.rig.view }));
check('G: at night the street lamps and head lamps near are given back by the cars\' glass', night.night > 0.6 && night.glints > 0, night);
await shot('g-driver-seat-night');

{ const lost = await lostPictures(page); check('H: no picture was handed to the graphics card after the page had let it go of it', lost === 0, lost); }
await browser.close();
server.close();
const failed = results.filter((r) => !r).length;
console.log(`${results.length - failed} of ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
