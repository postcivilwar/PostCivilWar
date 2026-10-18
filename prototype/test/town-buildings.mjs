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
import { pastQuestion, enterTown, watchPictures, lostPictures } from './start.mjs';
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
await watchPictures(context);
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

// ---- a tower not yet drawn from its model is a glass tower, not a dark slab like its own shadow (18 October 2026) ----
await go(-40, 80, -Math.PI / 2, { yaw: -Math.PI / 2 - 0.2, dist: 12, pitch: 0.05 });
await page.waitForTimeout(1500);
await shot('0-towers-while-their-models-come');
const plain = await page.evaluate(() => {
  const blocks = []; window.__nlw.scene.traverse((o) => { if (o.name === 'town-blocks') blocks.push(o); });
  const tower = blocks.find((b) => b.material.map);
  if (!tower) return null;
  const c = tower.material.color; const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return { glass: !!tower.material.map, lum: +lum.toFixed(2), metalness: tower.material.metalness, drawn: tower.count };
});
check('a tower drawn as its plain shape (from afar, or while its model comes) is glass with its panes, pale, not near black', !!plain && plain.glass && plain.lum > 0.25, plain);

// ---- every model, fetched and drawn as supplied ----
await page.evaluate(() => window.__nlw.townBuildings.loadAll());
await page.waitForFunction(() => window.__nlw.townBuildings.state().models.every((m) => m.state === 'ready' || m.state === 'failed'), null, { timeout: 900000 });
const st = await page.evaluate(() => window.__nlw.townBuildings.state());
const wrong = st.models.filter((m) => m.state !== 'ready' || m.triangles !== TOWN_MODELS[m.id].triangles);
check('every one of the owner\'s nineteen buildings is fetched and read whole, every triangle', st.models.length === 19 && wrong.length === 0, wrong.length ? wrong : st.models.length);
// near each building, it is drawn from its model; from afar, a house is a plain block (towers are always their models)
const drawnNear = await page.evaluate(() => {
  const tb = window.__nlw.townBuildings, out = { near: 0, far: 0, of: tb.entries.length, missing: [] };
  for (const e of tb.entries) { tb.see(e.x, e.z + 3, 300, false); if (e.drawn) out.near += 1; else out.missing.push(e.id); }
  const h = tb.entries.find((e) => e.kind === 'house'); tb.see(h.x + tb.state().houseSight + 60, h.z, 300, false); if (!h.drawn) out.far += 1;
  tb.see(window.__nlw.cam.target.x, window.__nlw.cam.target.z, 300, false);
  return out;
});
check('every house and tower is drawn from its model by whoever is near it; from afar a house is a plain block', drawnNear.near === drawnNear.of && drawnNear.far === 1 && drawnNear.of === ZONE_HOUSES.filter((h) => h.model).length + TOWN_TOWERS.length, drawnNear);

// ---- each where it should be, its size and its way round: every point of its model, where it is drawn ----
const placed = await page.evaluate(() => {
  const tb = window.__nlw.townBuildings;
  return tb.entries.map((e) => {
    const geo = tb.geometryOf(e.model), pos = geo.attributes.position, v = new THREE.Vector3(), box = new THREE.Box3();
    for (let i = 0; i < pos.count; i += 1) box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(e.matrix));
    const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
    return { id: e.id, kind: e.kind, x: e.x, z: e.z, w: e.w, d: e.d, h: e.h, size: [size.x, size.y, size.z], mid: [mid.x, mid.z], foot: box.min.y };
  });
});
const off = placed.filter((p) => !near(p.size[0], p.w, Math.max(0.15, p.w * 0.03)) || !near(p.size[2], p.d, Math.max(0.15, p.d * 0.03)) || !near(p.size[1], p.h, Math.max(0.15, p.h * 0.03)) || !near(p.mid[0], p.x, 0.25) || !near(p.mid[1], p.z, 0.25) || !near(p.foot, 0, 0.05));
check('each stands on its plot, its own size, square to its lane, on the ground', off.length === 0, off.slice(0, 4));

// ---- the hotel's facade: nothing written on it ----
const hotel = await page.evaluate((rects) => {
  const n = window.__nlw; let mesh = null;
  mesh = n.townBuildings.entries.find((e) => e.model === 'hotel').mesh;
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

// ---- solid: pushed against from right beside it, the player stays outside, at arm's length from its wall ----
const pushInto = async (x, z, heading, ms = 2000) => {
  await go(x, z, heading, { yaw: heading, dist: 7, pitch: 0.3 });
  await page.waitForTimeout(500);
  await page.keyboard.down('w'); await page.waitForTimeout(ms); await page.keyboard.up('w');
  await page.waitForTimeout(300);
  return page.evaluate(() => ({ x: +window.__nlw.predicted.x.toFixed(2), z: +window.__nlw.predicted.z.toFixed(2) }));
};
const house = ZONE_HOUSES.find((h) => h.model && h.door === 's' && h.quarter === 'Umuezei');
const fromBehind = await pushInto(house.x, house.z - house.d / 2 - 0.9, 0);
const fromSide = await pushInto(house.x - house.w / 2 - 0.9, house.z, Math.PI / 2);
check('pushed against from behind and from the side, a house holds: the player stays outside its walls', fromBehind.z < house.z - house.d / 2 - 0.2 && fromSide.x < house.x - house.w / 2 - 0.2, { fromBehind, fromSide, back: house.z - house.d / 2, side: house.x - house.w / 2 });
const tower = TOWN_TOWERS.find((t) => t.id === 'registry-towers');
const atTower = await pushInto(tower.x, tower.z + tower.d / 2 + 0.9, Math.PI);
check('and so does a tower', atTower.z > tower.z + tower.d / 2 + 0.2, { atTower, front: tower.z + tower.d / 2 });

// ---- far from every lane for a while: the house models are let go (their houses are plain blocks), the towers kept;
// back in a lane, its houses' model is fetched again ----
await page.evaluate(() => window.__nlw.townBuildings.letGoAgain());
await go(-845, -290, Math.PI, { dist: 14, pitch: 0.25 });
await page.waitForTimeout(26000);
const away = await page.evaluate(() => {
  const tb = window.__nlw.townBuildings, houseOnly = new Set(tb.entries.filter((e) => e.kind === 'house').map((e) => e.model));
  for (const e of tb.entries) if (e.kind === 'tower') houseOnly.delete(e.model);
  const models = tb.state().models;
  return { houses: models.filter((m) => houseOnly.has(m.id)).map((m) => `${m.id}:${m.state}:${m.released}`), towers: models.filter((m) => !houseOnly.has(m.id)).map((m) => m.state) };
});
check('far from every lane for a while, each house model is let go (its houses are plain blocks), and the towers are kept', away.houses.length > 0 && away.houses.every((h) => /:idle:[1-9]/.test(h)) && away.towers.every((t) => t === 'ready'), away);
await go(-170, 67, Math.PI / 2, { yaw: Math.PI / 2 + 0.35, dist: 10, pitch: 0.16 });
await page.waitForFunction(() => { const tb = window.__nlw.townBuildings; const e = tb.entries.find((x) => x.kind === 'house' && Math.hypot(x.x + 170, x.z - 67) < 60); return e && e.drawn; }, null, { timeout: 300000 }).catch(() => {});
const back = await page.evaluate(() => { const tb = window.__nlw.townBuildings; const e = tb.entries.find((x) => x.kind === 'house' && Math.hypot(x.x + 170, x.z - 67) < 60); return e ? { id: e.id, model: e.model, drawn: e.drawn, state: (tb.state().models.find((m) => m.id === e.model) || {}).state } : null; });
check('back in the lane, its houses are drawn from their model again', !!back && back.drawn && back.state === 'ready', back);

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

{ const lost = await lostPictures(page); check('no picture was handed to the graphics card after the page had let it go of it (no vehicle or building drawn black)', lost === 0, lost); }
const passed = results.filter(Boolean).length;
console.log(`${passed} of ${results.length} checks passed`);
await browser.close();
server.close();
process.exit(passed === results.length ? 0 : 1);
