// A look at Oganiru City in a headless browser (the site as built, served here with no database): the city built, and a
// picture from each of a few places. Not a test of anything but that it is drawn and nothing goes wrong in the page.
//   ../server/with-postgres.sh node test/oganiru-look.mjs [shots folder] [views, comma separated]
//   (LOOK_LITE=1 a phone's screen and settings; LOOK_LEVEL=n the graphics level held at n)
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pastQuestion, enterTown } from './start.mjs';
import { createDevServer } from '../../server/dev.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || '/tmp/oganiru-look';
const only = process.argv[3] ? new Set(process.argv[3].split(',')) : null;
mkdirSync(out, { recursive: true });
const errors = [];
const server = createDevServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const lite = process.env.LOOK_LITE === '1';
const context = await browser.newContext(lite ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, serviceWorkers: 'block' } : { viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
const page = await context.newPage();
page.setDefaultTimeout(600000);
page.on('pageerror', (e) => { errors.push(e.message); console.log('PAGE ERROR', e.message); });
page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.log('CONSOLE', m.text()); } });
await page.goto(`${origin}/#nointro-gameclock${lite ? '-lite' : ''}`, { timeout: 600000 });
// (an account first, as on the website: the server's database is the one with-postgres.sh makes)
await page.waitForFunction(() => !!(window.__nlw && window.__nlw.intro), null, { timeout: 300000 });
await page.waitForSelector('#open-signup', { state: 'visible', timeout: 300000 });
await page.click('#open-signup');
await page.fill('#account-username', `Look_${Math.random().toString(36).slice(2, 7)}`);
await page.fill('#account-password', 'a password for the city look');
await page.click('#account-submit');
await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 120000 });
await pastQuestion(page);
await page.fill('#name', 'City Looker').catch(() => {});
await enterTown(page, { tap: lite, wait: 900000 });
await page.waitForTimeout(1500);
await page.evaluate(() => { const n = window.__nlw; const g = n.host.game; g.state.weather = { kind: 'clear', until: g.state.t + 12 * 3600 }; const hour = n.view.clock.hourFloat; if (hour < 9 || hour > 14) n.skip((24 + 10 - hour) % 24); });
// (LOOK_LEVEL=n holds the graphics level at n, as tools/measure/places.mjs does: 0 Ultra, 1 High, 2 Medium, 3 Low; left
// alone, Auto chooses, and with no graphics card here that is Low)
if (process.env.LOOK_LEVEL) await page.evaluate((level) => { const g = window.__nlw.governor; g.hold(true); g.set(level, 'looking'); }, Number(process.env.LOOK_LEVEL));
const t0 = Date.now();
await page.evaluate(() => { const n = window.__nlw; n.place(0, -470); n.buildCity(); });
console.log('city built in', Date.now() - t0, 'ms', JSON.stringify(await page.evaluate(() => { const n = window.__nlw; return { ready: n.city.ready, stats: n.city.stats ? n.city.stats() : null, lamps: n.streetLamps.stats() }; })));
for (let k = 0; k < 120; k += 1) { const t = await page.evaluate(() => { const c = window.__nlw.city; return c.trees ? { loaded: c.trees.loaded, failed: c.trees.failed } : null; }); if (t && (t.loaded || t.failed)) { console.log('trees', JSON.stringify(t)); break; } await page.waitForTimeout(1000); }
const view = async (name, v) => {
  if (only && !only.has(name)) return;
  await page.evaluate((v) => { const n = window.__nlw; n.place(v.x, v.z, v.y); n.face(v.h); n.cam.yaw = v.yaw; n.cam.dist = v.dist; n.cam.pitch = v.pitch; }, v);
  await page.waitForTimeout(v.wait || 4000);
  await page.screenshot({ path: resolve(out, `${name}.png`) });
  const info = await page.evaluate(() => { const n = window.__nlw; const r = n.renderer; return { at: [+n.predicted.x.toFixed(1), +n.predicted.z.toFixed(1)], feet: +n.me.group.position.y.toFixed(2), eye: [+n.camera.position.x.toFixed(1), +n.camera.position.y.toFixed(1), +n.camera.position.z.toFixed(1)], calls: r ? r.info.render.calls : null, tris: r ? r.info.render.triangles : null }; });
  console.log(name, JSON.stringify(info));
};
await view('01-unity-from-college-road', { x: 0, z: -486, h: Math.PI, yaw: Math.PI, dist: 7, pitch: 0.12 });
await view('02-gate-roundabout-above', { x: 30, z: -560, h: Math.PI, yaw: -Math.PI / 2 - 0.4, dist: 60, pitch: 0.55 });
await view('03-median-trees-lamps', { x: -6, z: -640, h: Math.PI, yaw: Math.PI - 0.15, dist: 6, pitch: 0.06 });
await view('04-towers-junction', { x: -14, z: -760, h: Math.PI, yaw: -0.6, dist: 12, pitch: 0.05 });
await view('05-under-independence-flyover', { x: 2, z: -770, h: Math.PI, yaw: Math.PI, dist: 7, pitch: 0.1 });
await view('06-on-independence-flyover', { x: -40, z: -782, y: 7.5, h: Math.PI / 2, yaw: Math.PI / 2, dist: 8, pitch: 0.12 });
// (the player on Unity Avenue short of the interchange: under a deck the camera is kept under it)
await view('07-interchange-above', { x: 0, z: -1060, h: Math.PI, yaw: Math.PI + 0.4, dist: 170, pitch: 0.6 });
await view('08-under-viaduct', { x: -6, z: -1110, h: Math.PI, yaw: Math.PI, dist: 7, pitch: 0.12 });
await view('09-on-viaduct', { x: -120, z: -1122, y: 7.5, h: Math.PI / 2, yaw: Math.PI / 2 + 0.2, dist: 9, pitch: 0.15 });
await view('10-towers-from-avenue', { x: 2, z: -600, h: Math.PI, yaw: Math.PI + 0.05, dist: 8, pitch: -0.08 });
// a lamp knocked down, and the night
if (!only || only.has('11-lamp-down')) {
  const lamp = await page.evaluate(() => { const n = window.__nlw; const near = n.lampsNear(-4, -640, 40).filter((l) => l.kind === 'median'); return near[0] || null; });
  console.log('lamp', JSON.stringify(lamp));
  if (lamp) { await page.evaluate((id) => window.__nlw.knockLamp(id, 0.6), lamp.id); await page.waitForTimeout(3000); await view('11-lamp-down', { x: -7, z: lamp.z + 14, h: Math.PI, yaw: Math.PI, dist: 8, pitch: 0.2 }); console.log('drawn', JSON.stringify(await page.evaluate((i) => window.__nlw.streetLamps.drawnOf(i), lamp.i))); }
}
// by day in the rain (his third video), on the expressway with the interchange's flyover over it (his first), and the
// towers at dusk (his second)
if (!only || only.has('15-day-rain')) {
  await page.evaluate(() => { const g = window.__nlw.host.game; g.state.weather = { kind: 'rain', until: g.state.t + 2 * 3600 }; });
  await page.waitForTimeout(6000);
  await view('15-day-rain', { x: -6, z: -604, h: Math.PI, yaw: Math.PI - 0.12, dist: 7, pitch: 0.08, wait: 8000 });
  await page.evaluate(() => { const g = window.__nlw.host.game; g.state.weather = { kind: 'clear', until: g.state.t + 12 * 3600 }; });
  await page.waitForTimeout(4000);
}
await view('16-expressway-flyover-overhead', { x: 340, z: -1124, y: 7.5, h: -Math.PI / 2, yaw: -Math.PI / 2, dist: 7, pitch: 0.1 });
if (!only || only.has('17-dusk-towers')) {
  await page.evaluate(() => { const n = window.__nlw; const hour = n.view.clock.hourFloat; if (hour < 18.55) n.skip(18.55 - hour); });
  await view('17-dusk-towers', { x: -6, z: -660, h: Math.PI, yaw: Math.PI + 0.25, dist: 7, pitch: 0.02, wait: 6000 });
}
if (!only || only.has('12-night')) {
  for (let i = 0; i < 24 && (await page.evaluate(() => window.__nlw.night)) < 0.6; i += 1) { await page.evaluate(() => window.__nlw.skip(1)); await page.waitForTimeout(300); }
  await view('12-night', { x: 0, z: -486, h: Math.PI, yaw: Math.PI, dist: 7, pitch: 0.12, wait: 5000 });
  console.log('lamps at night', JSON.stringify(await page.evaluate(() => window.__nlw.streetLamps.stats())));
  console.log('pools', JSON.stringify(await page.evaluate(() => { const n = window.__nlw; let pools = null; n.scene.traverse((o) => { if (o.name === 'lamp-pools') pools = o; }); if (!pools) return null; const m = new THREE.Matrix4(); const near = []; for (let i = 0; i < pools.count; i += 1) { pools.getMatrixAt(i, m); const e = m.elements; if (Math.hypot(e[12] - 0, e[14] + 500) < 60) near.push([+e[12].toFixed(1), +e[13].toFixed(2), +e[14].toFixed(1), +e[0].toFixed(1)]); } return { visible: pools.visible, count: pools.count, opacity: +pools.material.opacity.toFixed(2), near }; })));
  await view('12b-night-town', { x: -8.6, z: 15, h: 0, yaw: 0.25, dist: 6, pitch: 0.12, wait: 5000 });
  await view('13-night-towers', { x: -14, z: -760, h: Math.PI, yaw: -0.6, dist: 12, pitch: 0.05, wait: 5000 });
  await page.evaluate(() => { const g = window.__nlw.host.game; g.state.weather = { kind: 'storm', until: g.state.t + 6 * 3600 }; });
  await page.waitForTimeout(6000);
  await view('14-night-rain', { x: -6, z: -600, h: Math.PI, yaw: Math.PI, dist: 7, pitch: 0.1, wait: 8000 });
}
console.log('errors', errors.length);
await browser.close();
server.close();
