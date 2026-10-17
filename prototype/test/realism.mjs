// The realism pass in a headless browser (the page as it is built, with no server):
//   - the trees' leaves are pictures of leaves cut out of the air (sprays on the mangoes and almonds, leaflets on the
//     palms' fronds), each kind with the shadow of its leaves, and they move in the wind;
//   - window glass, the river and the zinc roofs give back the sky by day, and hardly at all at night;
//   - in the rain the roads are wet: darker and glossy, giving back the sky; and they dry slowly after it;
//   - nothing goes wrong in the page; and what a frame costs to draw, with a picture of each view.
//   node test/realism.mjs [shots folder]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pastQuestion, enterTown } from './start.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || '/tmp/realism-shots';
mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); };
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(300000);
page.on('pageerror', (e) => check('no error in the page', false, e.message));
page.on('console', (m) => { if (m.type() === 'error') check('no error in the console', false, m.text()); });
await page.goto(`file://${resolve(here, '../dist/local.html')}#nointro-gameclock`, { timeout: 300000 });
await pastQuestion(page);
await page.fill('#name', 'Tree Looker').catch(() => {});
await enterTown(page);
await page.waitForTimeout(2000);

// a dry day, at eleven in the morning
await page.evaluate(() => { const n = window.__nlw; const hour = n.view.clock.hourFloat; n.skip((24 + 11 - hour) % 24); n.host.game.setWeather('clear'); });
await page.waitForTimeout(3000);

const view = async (name, v) => {
  await page.evaluate((v) => { const n = window.__nlw; n.place(v.x, v.z); n.face(v.h); n.cam.yaw = v.yaw === undefined ? v.h : v.yaw; n.cam.dist = v.dist; n.cam.pitch = v.pitch; }, v);
  await page.waitForTimeout(v.wait || 2500);
  await page.screenshot({ path: resolve(out, `${name}.png`) });
  return page.evaluate(() => window.__nlw.drawn);
};

// ---- the leaves ----
const leaves = await page.evaluate(() => {
  const n = window.__nlw, kinds = {}, wrong = [];
  n.scene.traverse((o) => {
    if (!o.isMesh || !o.name || !o.name.startsWith('leaves-')) return;
    const kind = o.name.slice(7), k = kinds[kind] || (kinds[kind] = { meshes: 0, triangles: 0 });
    k.meshes += 1; k.triangles += o.geometry.attributes.position.count / 3;
    const m = o.material, d = o.customDepthMaterial;
    if (!(m.map && m.alphaTest > 0)) wrong.push(`${o.name}: its leaves are not cut out of the air`);
    if (!(d && d.map && d.alphaTest > 0)) wrong.push(`${o.name}: its shadow is not the shape of its leaves`);
    if (!o.castShadow) wrong.push(`${o.name}: casts no shadow`);
  });
  return { kinds, wrong, foliage: n.foliage() };
});
check('every kind of tree has leaves cut out of pictures of leaves, mangoes, almonds, coconut and oil palms', ['mango', 'almond', 'frond', 'oilfrond'].every((k) => leaves.kinds[k] && leaves.kinds[k].meshes > 0) && leaves.wrong.length === 0, leaves);
const w0 = (await page.evaluate(() => window.__nlw.foliage())).wind;
await page.waitForTimeout(1500);
const w1 = (await page.evaluate(() => window.__nlw.foliage())).wind;
check('the leaves move in the wind (its clock runs)', w1 > w0 + 0.5, { w0, w1 });
const programs = await page.evaluate(() => window.__nlw.renderer.info.programs.map((p) => p.cacheKey).filter((k) => k.includes('pcw-leaves')).length);
check('the leaves are drawn by the swaying shader, and their shadows too', programs >= 2, programs);

// ---- the pictures: each kind of tree, near ----
const costs = {};
costs.mango = await view('01-mango', { x: 23.8, z: -66, h: 0, dist: 7, pitch: 0.02 });
costs.oilpalm = await view('02-oil-palm', { x: 38.9, z: -34, h: 0, dist: 7, pitch: 0.02 });
costs.almond = await view('03-almond', { x: 24.9, z: -16, h: 0, dist: 7, pitch: 0.04 });
costs.palm = await view('04-coconut-palm-and-river', { x: -6.3, z: 124, h: 0, dist: 7, pitch: 0.03 });
costs.above = await view('05-trees-from-above', { x: -60, z: -60, h: 0.6, dist: 45, pitch: 0.75, wait: 3500 });

// ---- glass, river and roofs by day ----
costs.street = await view('06-registry-windows', { x: 34, z: -50, h: 2.4, dist: 7, pitch: 0.05 });
const day = await page.evaluate(() => { const n = window.__nlw, w = n.world; return { finishes: n.finishes(), glass: { env: !!w.glowMaterial.envMap, k: +w.glowMaterial.envMapIntensity.toFixed(2) }, river: { env: !!w.waterMaterial.envMap, k: +w.waterMaterial.envMapIntensity.toFixed(2) }, lite: n.lite === true }; });
check('by day the glass and the river give back the sky', day.lite || (day.finishes.envSet && day.glass.env && day.glass.k > 0.5 && day.river.env && day.river.k > 0.4), day);
costs.river = await view('07-the-river-from-the-jetty', { x: 21, z: 170, h: 0.2, dist: 6, pitch: 0.08 });

// ---- the rain, and after it ----
await page.evaluate(() => window.__nlw.host.game.setWeather('rain'));
await page.waitForTimeout(9000);
const rain = await page.evaluate(() => { const n = window.__nlw, road = n.world.roadMaterial; return { finishes: n.finishes(), road: { roughness: +(road.roughness || 0).toFixed(2), sheen: +(road.envMapIntensity || 0).toFixed(2), env: !!road.envMap }, lite: n.lite === true }; });
check('in the rain the ground is wet, and the tarmac glossy', rain.finishes.wet > 0.6 && (rain.lite || (rain.road && rain.road.roughness < 0.6 && rain.road.sheen > 0.2)), rain);
costs.rain = await view('08-rain-on-the-road', { x: 6, z: -40, h: 0, dist: 7, pitch: 0.08, wait: 3000 });
await page.evaluate(() => window.__nlw.host.game.setWeather('clear'));
await page.waitForTimeout(6000);
const after = await page.evaluate(() => window.__nlw.finishes());
check('after the rain the ground dries, slowly', after.wet < rain.finishes.wet && after.wet > 0.3, { during: rain.finishes.wet, after: after.wet });

// ---- at night ----
for (let i = 0; i < 24 && (await page.evaluate(() => window.__nlw.night)) < 0.6; i += 1) { await page.evaluate(() => window.__nlw.skip(1)); await page.waitForTimeout(400); }
await page.waitForTimeout(1500);
costs.night = await view('09-night-windows', { x: 34, z: -50, h: 2.4, dist: 7, pitch: 0.05, wait: 3500 });
const night = await page.evaluate(() => { const w = window.__nlw.world; return { glass: +w.glowMaterial.envMapIntensity.toFixed(3), lit: +w.glowMaterial.emissiveIntensity.toFixed(2) }; });
check('at night the glass gives back almost nothing, and is lit from within', night.glass < 0.15 && night.lit > 0.5, night);

console.log('what a frame costs (triangles, calls):', JSON.stringify(costs));
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nAll ${results.length} checks passed.`);
await browser.close();
