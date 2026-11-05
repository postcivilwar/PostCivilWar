// Who sits in a car, seen by another player (5 November 2026, the owner's brief, cars with real glass: "a second player
// sees who sits in the first player's car"). Two players in two browsers, each with its own copy of the town, joined
// only by the website (the presence the server keeps). The first takes one of the town's cars made a car with glass
// (the Grey Saloon, a sample of Stage 2) at the roadside of Market Road; the second stands beside it and looks.
//   - the second sees the first player's car, drawn with its glass and cabin;
//   - and the first player in it: their figure shown, sitting in the driver's seat (within the car, at the seat), and
//     seen through the glass (every part of the figure painted one bright colour, the colour found on the screen where
//     the car's windows are);
//   - nothing goes wrong in either page.
//   ../server/with-postgres.sh node test/car-seen-sync.mjs [shots folder]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDevServer } from '../../server/dev.mjs';
import { pastQuestion, enterTown } from './start.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const out = process.argv[2] || '/tmp/car-seen-sync-shots';
mkdirSync(out, { recursive: true });
const MODEL = 'grey-saloon';
const server = createDevServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); };

// (bright magenta pixels in a picture of the screen, read by the page itself: no PNG reader is needed here)
const countMagenta = (pg, buf) => pg.evaluate(async (b64) => {
  const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data; let hit = 0;
  for (let i = 0; i < d.length; i += 4) { const r = d[i], gg = d[i + 1], b = d[i + 2]; if (r > 90 && b > 90 && gg < 0.6 * Math.min(r, b)) hit += 1; }
  return hit;
}, buf.toString('base64'));

async function player(label, size) {
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await context.newPage(); page.setDefaultTimeout(300000);
  page.on('pageerror', (e) => check(`no error in ${label}'s page`, false, `${e.message} ${(e.stack || '').split('\n').slice(0, 4).join(' | ')}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 4\d\d/.test(m.text())) check(`no error in ${label}'s console`, false, m.text()); });
  await page.goto(`${origin}/#nointro-gameclock`, { timeout: 300000 });
  await page.waitForFunction(() => !!(window.__nlw && window.__nlw.intro), null, { timeout: 300000 });
  await page.waitForSelector('#open-signup', { state: 'visible', timeout: 300000 });
  await page.click('#open-signup');
  const username = `${label}_${Math.random().toString(36).slice(2, 7)}`;
  await page.fill('#account-username', username); await page.fill('#account-password', `a password for ${label}`);
  await page.click('#account-submit');
  await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 120000 });
  await pastQuestion(page);
  await page.fill('#name', label);
  await enterTown(page);
  await page.waitForFunction(() => window.__nlw.me && window.__nlw.me.mixer, null, { timeout: 240000 });
  await page.evaluate(() => { const n = window.__nlw; const g = n.host.game; g.state.weather = { kind: 'clear', until: g.state.t + 6 * 3600 }; const hour = n.view.clock.hourFloat; if (hour < 9 || hour > 15) n.skip((24 + 11 - hour) % 24); });
  return { context, page, username, shot: (name) => page.screenshot({ path: resolve(out, `${name}.png`) }) };
}

const A = await player('Driver', { width: 560, height: 360 });
const B = await player('Watcher', { width: 960, height: 540 });

// ---- the first player takes a car of the town's standing at the roadside of Market Road, made the Grey Saloon ----
await A.page.evaluate(() => { const n = window.__nlw; for (let r = 0; r < 12; r += 0.5) for (let k = 0; k < 12; k += 1) { const a = (k / 12) * Math.PI * 2, x = 8.5 + Math.cos(a) * r, z = -75 + Math.sin(a) * r; if (n.walkable(x, z)) { n.place(x, z); return; } } });
let target = null;
for (let k = 0; k < 40 && !target; k += 1) {
  target = await A.page.evaluate((model) => {
    const n = window.__nlw, g = n.host.game, T = g.internals.traffic, eye = n.view.self;
    const c = T.cars.filter((q) => q.mode === 'stop' && !q.frozen && g.state.real < q.until - 8 && Math.hypot(q.x - eye.x, q.z - eye.z) < 160).sort((a, b) => Math.hypot(a.x - eye.x, a.z - eye.z) - Math.hypot(b.x - eye.x, b.z - eye.z))[0];
    if (!c) return null;
    c.model = model; c.until = g.state.real + 1200;
    return { n: c.n, x: c.x, z: c.z, h: c.h };
  }, MODEL);
  if (!target) await A.page.waitForTimeout(5000);
}
check('a car of the town\'s stands at the roadside, made the Grey Saloon', !!target, target);
if (!target) { await browser.close(); server.close(); process.exit(1); }
await A.page.evaluate((t) => { const n = window.__nlw; const x = t.x + Math.sin(t.h) * 4.2, z = t.z + Math.cos(t.h) * 4.2; n.place(x, z); n.face(Math.atan2(t.x - x, t.z - z)); }, target);
await A.page.waitForTimeout(3000);
await A.page.evaluate(() => { const n = window.__nlw; n.refresh(); n.act('take'); });
const taken = await A.page.waitForFunction(() => { const s = window.__nlw.view.self; return s.incar && Number.isInteger(s.incar.taken) && !s.hijack ? { taken: s.incar.taken, x: s.x, z: s.z, h: s.heading } : null; }, null, { timeout: 120000 }).then((h) => h.jsonValue()).catch(() => null);
check('the first player takes it and sits at its wheel', !!taken, taken);
if (!taken) { await A.shot('A-take-failed'); await browser.close(); server.close(); process.exit(1); }

// ---- the second player beside it, on the driver's side, looking at it ----
await B.page.evaluate((t) => { const n = window.__nlw; const x = t.x + Math.cos(t.h) * 4.5, z = t.z - Math.sin(t.h) * 4.5; n.place(x, z); n.face(Math.atan2(t.x - x, t.z - z)); n.cam.yaw = Math.atan2(t.x - x, t.z - z); n.cam.dist = 4.5; n.cam.pitch = 0.12; n.cam.lastDrag = 1e9; }, taken);
const seen = await B.page.waitForFunction((name) => {
  const n = window.__nlw;
  const q = n.shownPeers.find((o) => o.name === name);
  if (!q || !q.car) return null;
  const car = n.carView.driven(`peer:${q.id}`);
  const rig = n.crowd.rigOf(`p:${q.id}`);
  if (!car || !rig) return null;
  return { id: q.id, model: q.car.car, glazed: !!car.glazed };
}, A.username, { timeout: 300000 }).then((h) => h.jsonValue()).catch(() => null);
check('the second player sees the first player\'s car, the Grey Saloon, drawn with its glass and cabin', !!seen && seen.model === MODEL && seen.glazed, seen);
await B.page.waitForTimeout(4000);
const sitting = seen && await B.page.evaluate((id) => {
  const n = window.__nlw, THREE = n.THREE;
  const car = n.carView.driven(`peer:${id}`), rig = n.crowd.rigOf(`p:${id}`);
  car.group.updateMatrixWorld(true);
  const seat = car.cabin.localToWorld(new THREE.Vector3(...car.driver.hip));
  // (the figure's hips, as its bones have them: the first bone that is the hips or the pelvis)
  let hips = null;
  rig.group.traverse((o) => { if (!hips && o.isBone && /hips|pelvis/i.test(o.name)) hips = o; });
  const at = (hips || rig.group).getWorldPosition(new THREE.Vector3());
  return { shown: rig.group.visible, gap: +at.distanceTo(seat).toFixed(3), seat: seat.toArray().map((v) => +v.toFixed(2)), hips: at.toArray().map((v) => +v.toFixed(2)) };
}, seen.id);
check('the first player is shown sitting in the driver\'s seat, as the second player sees it', !!sitting && sitting.shown && sitting.gap < 0.35, sitting);
await B.shot('seen-1-beside');
// (every part of the figure one bright colour, lit by itself; found on the screen where the windows are)
const painted = seen && await B.page.evaluate((id) => {
  const n = window.__nlw, rig = n.crowd.rigOf(`p:${id}`); let k = 0;
  rig.group.traverse((o) => { if (o.isMesh && o.material) for (const m of (Array.isArray(o.material) ? o.material : [o.material])) { m.map = null; if (m.color) m.color.setRGB(1, 0, 1); if (m.emissive) m.emissive.setRGB(1, 0, 1); m.needsUpdate = true; k += 1; } });
  return k;
}, seen.id);
await B.page.waitForTimeout(2000);
const buf = await B.page.screenshot({ path: resolve(out, 'seen-2-painted.png') });
const hit = await countMagenta(B.page, buf);
check('the first player is seen through the car\'s glass (their figure painted bright magenta, found on the second player\'s screen)', hit > 150, { painted, magenta: hit });
await A.shot('seen-0-driver');
const failed = results.filter((r) => !r).length;
console.log(`${results.length - failed}/${results.length} passed`);
await browser.close(); server.close();
process.exit(failed ? 1 : 0);
