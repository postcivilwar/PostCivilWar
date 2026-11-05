// Feet and tyres on the surface (5 November 2026, the owner's brief, part 1, with a recording of his iPhone at night by a
// slip road: "my character's shoes and the bottom of his trousers are washed out ... the bottom of the coupé's tyres fades
// into the same surface"; and "each foot on the surface, the hips lowered, the toes following the slope ... the tyres'
// bottoms on the drawn surface, with the body on its springs"). The game played on the website on this machine, with a
// computer's settings or a phone's:
//  A  the marks on the ground (a street lamp's pool of light, the soft patch under a figure) are drawn with the solid
//     things, after the ground and before whoever stands on them; every part of the player's figure after them
//  B  on flat ground: both feet at their own height over it
//  C  across a kerb, one foot on the walkway and one in the road: each foot on its own surface (within 3 cm of where it
//     stands on flat ground), the hips let down for the lower one
//  D  on a ramp up to a flyover: each foot on the ramp under it, within 3 cm, and laid along its slope
//  E  in the town, on a tarred road: standing on its top, 8 cm up, not down in it
//  F  a car on that ramp, driven and then left standing there: each tyre's bottom on the surface under it, within 3 cm
//  G  pictures by night: the feet close up under a street lamp, and the car's tyres on the ramp
//   ../server/with-postgres.sh node test/feet-surface.mjs [shots folder] [phone]
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
const out = resolve(process.argv[2] || '/tmp/feet-surface-shots'); mkdirSync(out, { recursive: true });
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
await page.fill('#account-username', `Feet_${Math.random().toString(36).slice(2, 7)}`);
await page.fill('#account-password', 'a password for feet on the ground');
await page.click('#account-submit');
await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 180000 });
await pastQuestion(page);
await page.fill('#name', 'Feet');
await enterTown(page, { tap: PHONE, wait: 900000 });
await page.waitForFunction(() => window.__nlw.me && window.__nlw.me.mixer, null, { timeout: 300000 });
await page.evaluate((phone) => { const n = window.__nlw, g = n.host.game; const hour = n.view.clock.hourFloat; n.skip(((24 + 22 - hour) % 24) || 24); g.state.weather = { kind: 'clear', until: g.state.t + 24 * 3600 }; n.setGraphics(phone ? 'medium' : 'high'); }, PHONE);

// each foot: its ankle's height over the surface under it (the surface the player stands on, at their level), and how
// far the foot is turned from flat, along the way the figure faces (positive: toes up)
const feet = () => page.evaluate(() => {
  const n = window.__nlw, me = n.me, lv = n.view.self.y;
  const at = (name) => { const b = me.bones.get(name); return b ? b.getWorldPosition(new THREE.Vector3()) : null; };
  const out = {};
  for (const s of ['l', 'r']) {
    const a = at(`foot_${s}`), ball = at(`ball_${s}`);
    if (!a) continue;
    const ground = n.surfaceY(a.x, a.z, lv);
    const along = ball ? Math.atan2(ball.y - a.y, Math.hypot(ball.x - a.x, ball.z - a.z)) : null;
    out[s] = { x: +a.x.toFixed(3), z: +a.z.toFixed(3), over: +(a.y - ground).toFixed(4), ground: +ground.toFixed(3), pitch: along === null ? null : +along.toFixed(3) };
  }
  const root = me.group.position;
  out.root = { y: +root.y.toFixed(3), stand: +n.surfaceY(root.x, root.z, lv).toFixed(3), drop: +(me.plantDrop || 0).toFixed(3) };
  return out;
});
const standAt = async (x, z, y, face, wait = 6000) => {
  await page.evaluate(([x, z, y, face]) => { const n = window.__nlw; n.place(x, z, y); n.face(face); }, [x, z, y, face]);
  await page.waitForTimeout(wait);
};

// ---- A: the marks on the ground drawn before whoever stands on them ----
await standAt(-5.6, -59.3, undefined, 0.4, 12000);
const order = await page.evaluate(() => {
  const n = window.__nlw, me = n.me;
  const pools = n.scene.getObjectByName('lamp-pools');
  // (the figure itself: its skinned body, and whatever is worn on it)
  const figure = []; me.group.traverse((o) => { if (o.isSkinnedMesh) figure.push(o); });
  return {
    pools: pools ? { order: pools.renderOrder, mark: !!pools.userData.mark, seeThrough: pools.material.transparent } : null,
    patch: me.blob ? { order: me.blob.renderOrder, mark: !!me.blob.userData.mark, seeThrough: me.blob.material.transparent, up: +me.blob.position.y.toFixed(3) } : null,
    figure: figure.map((o) => o.renderOrder),
  };
});
check('A: the lamps\' pools and the patch under the figure are marks, drawn with the solid things before it; the figure after them',
  !!order.pools && order.pools.mark && !order.pools.seeThrough && order.pools.order === 1 && !!order.patch && order.patch.mark && !order.patch.seeThrough && order.patch.up < 0.02
  && order.figure.length > 0 && order.figure.every((r) => r >= 2), order);

// ---- B: flat ground ----
await standAt(-34, 96, undefined, 0, 6000);
const flat = await feet();
const rest = flat.l && flat.r ? (flat.l.over + flat.r.over) / 2 : null;
check('B: on flat ground, both feet at their own height over it (the same, within 2 cm)', rest !== null && Math.abs(flat.l.over - flat.r.over) < 0.02 && rest > 0 && rest < 0.2, flat);

// ---- C: across a kerb (Oganiru City, by the Peace flyover's foot: the road to x 736, the walkway beyond) ----
// facing along the kerb (+z): the figure's left (+x) foot on the walkway, its right in the road
await standAt(736.07, -700, undefined, 0, 7000);
const kerb = await feet();
const offC = kerb.l && kerb.r ? Math.max(Math.abs(kerb.l.over - rest), Math.abs(kerb.r.over - rest)) : null;
check('C: across a kerb, each foot on its own surface (within 3 cm of its height on flat ground), the hips let down',
  offC !== null && offC < 0.03 && Math.abs(kerb.l.ground - kerb.r.ground) > 0.1 && kerb.root.drop < -0.05, { kerb, rest, off: offC });
await page.screenshot({ path: `${out}/c-kerb.png` });

// ---- D: on a ramp (the Peace Interchange's slip road off the expressway, nearly 6 in 100 down) ----
const ramp = { x: 625.0675, z: -1100.1919, y: 4.3722, face: Math.atan2(0.9165, 0.4) };
await standAt(ramp.x, ramp.z, ramp.y, ramp.face + Math.PI, 7000);
const up = await feet();
const offD = up.l && up.r ? Math.max(Math.abs(up.l.over - rest), Math.abs(up.r.over - rest)) : null;
// (facing up the slope, the toes are higher than the heels by its angle more than on flat ground)
const tilt = up.l && up.r && flat.l && flat.r ? ((up.l.pitch - flat.l.pitch) + (up.r.pitch - flat.r.pitch)) / 2 : null;
check('D: on the ramp, each foot on the ramp under it (within 3 cm), laid along its slope (toes up the slope)',
  offD !== null && offD < 0.03 && tilt !== null && tilt > 0.03 && tilt < 0.1, { up, rest, off: offD, tilt });

// ---- E: on a tarred road in the town (Waterside Road) ----
await standAt(-60, 113, undefined, 0, 5000);
const road = await feet();
check('E: on the town\'s tarred road the player stands on its top, 8 cm up (as it is drawn), not in it', Math.abs(road.root.y - 0.08) < 0.005 && Math.abs(road.root.stand - 0.08) < 0.005, road.root);

// ---- F: a car on the ramp, driven and then left standing there ----
const buy = await page.evaluate(async (model) => {
  const n = window.__nlw;
  const all = await n.market.all();
  const l = all.listings.find((x) => x.asset.model === model && x.kind === 'primary');
  if (!l) return { ok: false, code: 'NOT_LISTED' };
  n.place(l.place.x, l.place.z);
  const opened = await n.market.open(l.id, { x: l.place.x, z: l.place.z });
  if (!opened.ok) return opened;
  const last = Math.max(0, ...(opened.messages || []).map((m) => m.id));
  const answer = await n.market.offer(opened.thread.id, l.price, l.name, last);
  return { ok: answer.ok, code: answer.code };
}, 'car:yellow-classic-roadster');
await page.waitForFunction(() => { const s = window.__nlw.view.self; return s.ownCars && s.ownCars.cars.includes('yellow-classic-roadster'); }, null, { timeout: 60000 }).catch(() => {});
await page.evaluate(() => window.__nlw.place(-12, 96));
await page.waitForTimeout(800);
await page.evaluate(() => window.__nlw.driveCar('yellow-classic-roadster'));
await page.waitForFunction(() => window.__nlw.view.self.incar && window.__nlw.carView.ready(), null, { timeout: 300000 }).catch(() => {});
await standAt(ramp.x, ramp.z, ramp.y, ramp.face, 6000);
const tyres = (key) => page.evaluate((key) => {
  const n = window.__nlw, c = n.carView.driven(key), lv = n.view.self.incar ? n.view.self.y : n.view.self.ownCars && n.view.self.ownCars.parked.length ? n.view.self.ownCars.parked[0].y : null;
  if (!c) return null;
  c.group.updateMatrixWorld(true);
  return c.wheels.map((w, k) => { const b = c.tyreBottom(k); const g = n.surfaceY(b.x, b.z, Number.isFinite(lv) ? lv : n.view.self.y); return +(b.y - g).toFixed(4); });
}, key);
const driven = await tyres('drive');
check('F: the car driven onto the ramp: each tyre\'s bottom on the surface under it (within 3 cm)', !!driven && driven.every((d) => Math.abs(d) < 0.03), { buy, driven });
await page.evaluate(() => { const n = window.__nlw; n.cam.yaw = n.predicted.heading + 1.9; n.cam.dist = 5.2; n.cam.pitch = 0.18; n.cam.lastDrag = 1e9; });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/f-tyres-driven.png` });
await page.evaluate(() => window.__nlw.leaveCar());
await page.waitForTimeout(6000);
const parkedKey = await page.evaluate(() => window.__nlw.carView.keys().find((k) => k.startsWith('park:') || k.startsWith('own:')) || null);
const parked = parkedKey ? await tyres(parkedKey) : null;
check('F: left standing there: each tyre\'s bottom on the surface under it (within 3 cm)', !!parked && parked.every((d) => Math.abs(d) < 0.03), { parkedKey, parked, keys: await page.evaluate(() => window.__nlw.carView.keys()) });

// ---- G: pictures by night ----
await page.evaluate(() => { const n = window.__nlw; n.cam.yaw = n.predicted.heading + Math.PI + 0.7; n.cam.dist = 2.4; n.cam.pitch = 0.3; n.cam.lastDrag = 1e9; });
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}/g-ramp-night.png` });
await standAt(-5.6, -59.3, undefined, 0.4, 8000);
await page.evaluate(() => { const n = window.__nlw; n.cam.yaw = 0.4 + Math.PI + 0.6; n.cam.dist = 2.4; n.cam.pitch = 0.32; n.cam.lastDrag = 1e9; });
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}/g-lamp-night.png` });

const bad = errors.filter((e) => !/favicon|net::ERR|Failed to load resource/.test(e));
check('nothing in the console', bad.length === 0, bad.slice(0, 5));
writeFileSync(`${out}/results.json`, JSON.stringify({ results, flat, kerb, up, road, driven, parked }, null, 1));
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
await browser.close(); server.close();
process.exit(results.every(Boolean) ? 0 : 1);
