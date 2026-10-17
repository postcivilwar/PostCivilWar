// The owner's houses and towers in town (17 October 2026), in a headless browser on the website as it is served:
//   - every model fetched and drawn as supplied (every triangle), each building at its place, its size and its
//     heading, the plain houses gone and nothing standing in for a building once its model has come;
//   - their houses along the lanes of the quarters, their towers on the city side; the hotel's facade with nothing
//     written on it but what the game puts there;
//   - solid: the player walks up to a house and a tower and stops at its wall;
//   - pictures from the lanes, from the city and from above for the eye; what is drawn, counted; no error.
//   ../server/with-postgres.sh node test/town-buildings.mjs [shots folder]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDevServer } from '../../server/dev.mjs';
import { pastQuestion, enterTown } from './start.mjs';
import { TOWN_MODELS, TOWN_TOWERS } from '../src/sim/zones/town-buildings.js';
import { ZONE_HOUSES } from '../src/sim/zone.js';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const out = process.argv[2] || '/tmp/town-buildings-shots';
mkdirSync(out, { recursive: true });
const server = createDevServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); };
const context = await browser.newContext({ viewport: { width: 1000, height: 640 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
const page = await context.newPage(); page.setDefaultTimeout(300000);
page.on('pageerror', (e) => check('no error in the page', false, e.message));
await page.goto(`${origin}/#nointro-gameclock`, { timeout: 300000 });
await page.waitForFunction(() => !!(window.__nlw && window.__nlw.ready), null, { timeout: 300000 });
await page.waitForSelector('#open-signup', { state: 'visible', timeout: 300000 });
await page.click('#open-signup');
await page.waitForSelector('#account:not([hidden])');
await page.fill('#account-username', `Towns_${Math.random().toString(36).slice(2, 8)}`);
await page.fill('#account-password', 'a password for the browser test');
await page.click('#account-submit');
await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 120000 });
await pastQuestion(page);
await page.fill('#name', 'Towns Test');
await enterTown(page);
await page.evaluate(() => { const g = window.__nlw.host.game; const day = Math.floor(g.state.t / 86400); g.state.t = day * 86400 + 11 * 3600; g.state.weather = { kind: 'clear', until: g.state.t + 6 * 3600 }; });
const shot = (name) => page.screenshot({ path: resolve(out, `town-${name}.png`) });
const go = (x, z, heading, cam = {}) => page.evaluate(([px, pz, h, c]) => { const n = window.__nlw; n.place(px, pz); n.face(h); n.cam.yaw = c.yaw !== undefined ? c.yaw : h; n.cam.dist = c.dist || 9; n.cam.pitch = c.pitch !== undefined ? c.pitch : 0.25; }, [x, z, heading, cam]);
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ---- every model, fetched and drawn as supplied ----
await page.evaluate(() => window.__nlw.townBuildings.loadAll());
await page.waitForFunction(() => window.__nlw.townBuildings.state().models.every((m) => m.state === 'ready' || m.state === 'failed'), null, { timeout: 900000 });
const st = await page.evaluate(() => window.__nlw.townBuildings.state());
const wrong = st.models.filter((m) => m.state !== 'ready' || m.triangles !== TOWN_MODELS[m.id].triangles);
check('every one of the owner\'s nineteen buildings is fetched and read whole, every triangle', st.models.length === 19 && wrong.length === 0, wrong.length ? wrong : st.models.length);
check('every house and tower is drawn from its model, none from a stand-in', st.drawn === st.entries && st.entries === ZONE_HOUSES.filter((h) => h.model).length + TOWN_TOWERS.length, { drawn: st.drawn, entries: st.entries });

// ---- each where it should be, its size and its way round ----
const placed = await page.evaluate(() => window.__nlw.townBuildings.entries.map((e) => {
  e.holder.updateMatrixWorld(true);
  let mesh = null; e.holder.traverse((o) => { if (o.isMesh && o.name.startsWith('town-') && o.visible !== false && o !== e.standIn) mesh = o; });
  if (!mesh) return { id: e.id, missing: true };
  const box = new THREE.Box3().setFromObject(mesh), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
  return { id: e.id, kind: e.kind, x: e.x, z: e.z, w: e.w, d: e.d, h: e.h, size: [size.x, size.y, size.z], mid: [mid.x, mid.z], foot: box.min.y, standIn: e.standIn.visible };
}));
const off = placed.filter((p) => p.missing || p.standIn || !near(p.size[0], p.w, Math.max(0.15, p.w * 0.03)) || !near(p.size[2], p.d, Math.max(0.15, p.d * 0.03)) || !near(p.size[1], p.h, Math.max(0.15, p.h * 0.03)) || !near(p.mid[0], p.x, 0.25) || !near(p.mid[1], p.z, 0.25) || !near(p.foot, 0, 0.05));
check('each stands on its plot, its own size, square to its lane, on the ground', off.length === 0, off.slice(0, 4));

// ---- the hotel's facade: nothing written on it ----
const hotel = await page.evaluate((rects) => {
  const n = window.__nlw; let mesh = null;
  n.townBuildings.entries.find((e) => e.model === 'hotel').holder.traverse((o) => { if (o.isMesh && o.name === 'town-hotel') mesh = o; });
  const img = mesh.material.map.image, c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  return rects.map(({ at: [u0, v0, u1, v1] }) => {
    const x = Math.round(u0 * c.width), y = Math.round(v0 * c.height), w = Math.max(1, Math.round((u1 - u0) * c.width)), h = Math.max(1, Math.round((v1 - v0) * c.height));
    const d = g.getImageData(x, y, w, h).data; let pale = 0;
    for (let i = 0; i < d.length; i += 4) { const lo = Math.min(d[i], d[i + 1], d[i + 2]), hi = Math.max(d[i], d[i + 1], d[i + 2]); if (lo > 170 && hi - lo < 70) pale += 1; }
    return +(pale / (d.length / 4)).toFixed(4);
  });
}, TOWN_MODELS.hotel.brand);
check('the hotel\'s facade carries no other company\'s name: where it was written is the facade\'s own bronze', hotel.every((share) => share < 0.01), hotel);

// ---- solid ----
const house = ZONE_HOUSES.find((h) => h.model && h.door === 's' && h.quarter === 'Umuezei');
await go(house.x, house.z + house.d / 2 + 3.5, Math.PI, { yaw: Math.PI, dist: 7, pitch: 0.25 });
await page.waitForTimeout(600);
await page.keyboard.down('w'); await page.waitForTimeout(2500); await page.keyboard.up('w');
await page.waitForTimeout(300);
const atHouse = await page.evaluate(() => ({ x: window.__nlw.predicted.x, z: window.__nlw.predicted.z }));
check('walked up to, a house is solid: the player stops at its front', atHouse.z > house.z + house.d / 2 + 0.1 && atHouse.z < house.z + house.d / 2 + 1.6, { atHouse, front: house.z + house.d / 2 });
const tower = TOWN_TOWERS.find((t) => t.id === 'registry-towers');
await go(tower.x, tower.z + tower.d / 2 + 4, Math.PI, { yaw: Math.PI, dist: 8, pitch: 0.3 });
await page.waitForTimeout(600);
await page.keyboard.down('w'); await page.waitForTimeout(2500); await page.keyboard.up('w');
await page.waitForTimeout(300);
const atTower = await page.evaluate(() => ({ x: window.__nlw.predicted.x, z: window.__nlw.predicted.z }));
check('and so is a tower', atTower.z > tower.z + tower.d / 2 + 0.1 && atTower.z < tower.z + tower.d / 2 + 1.6, { atTower, front: tower.z + tower.d / 2 });

// ---- pictures, and what is drawn ----
const views = [
  ['1-umuezei-lane', -170, 67, Math.PI / 2, { yaw: Math.PI / 2 + 0.35, dist: 10, pitch: 0.16 }],
  ['2-umuonaje-lane', 170, 67, -Math.PI / 2, { yaw: -Math.PI / 2 - 0.35, dist: 10, pitch: 0.16 }],
  ['3-towers-from-the-motor-park', -40, 80, -Math.PI / 2, { yaw: -Math.PI / 2 - 0.2, dist: 12, pitch: 0.05 }],
  ['4-towers-from-the-market', 45, 80, Math.PI / 2, { yaw: Math.PI / 2 + 0.2, dist: 12, pitch: 0.05 }],
  ['5-north-of-registry-road', 0, -40, Math.PI, { yaw: Math.PI, dist: 14, pitch: 0.08 }],
  ['6-hotel', -14, -109, -Math.PI / 2, { yaw: -Math.PI / 2, dist: 14, pitch: 0.1 }],
  ['7-waterside-road', 0, 112, Math.PI / 2, { yaw: -Math.PI * 0.62, dist: 14, pitch: 0.12 }],
  ['8-north-quarters', -60, -412, Math.PI / 2, { yaw: Math.PI / 2 + 0.3, dist: 10, pitch: 0.16 }],
  ['9-from-above', 0, 40, 0, { yaw: Math.PI, dist: 120, pitch: 0.9 }],
];
const drawn = {};
for (const [name, x, z, h, cam] of views) {
  await go(x, z, h, cam);
  await page.waitForTimeout(2500);
  drawn[name] = await page.evaluate(() => window.__nlw.drawn);
  await shot(name);
}
console.log('drawn', JSON.stringify(drawn));

const passed = results.filter(Boolean).length;
console.log(`${passed} of ${results.length} checks passed`);
await browser.close();
server.close();
process.exit(passed === results.length ? 0 : 1);
