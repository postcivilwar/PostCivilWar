// The owner's vehicles of 17 October 2026 in a headless browser, on the website as it is served with its server:
//   - the red box truck parked beside Nwosu Building Materials, its lettered side to the market; the heavy truck in
//     Udeh Block Industry's yard, ready to go out to the road; the private jet on the middle stand at Asaba Airport,
//     nose to the terminal: each the supplied model (every triangle), drawn at its size and turned its way, fetched
//     as the player comes near it, and solid (the player walks round them, not through);
//   - the hospital's ambulance: the owner's model on the van the simulation drives, the van the town had before
//     put away; called out to someone badly hurt, the lamps on its roof flash red and blue in turn;
//   - nothing goes wrong in the page.
//   ../server/with-postgres.sh node test/supplied.mjs [shots folder]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDevServer } from '../../server/dev.mjs';
import { pastQuestion, enterTown } from './start.mjs';
import { SUPPLIED_VEHICLES } from '../src/sim/zones/supplied-vehicles.js';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const out = process.argv[2] || '/tmp/supplied-shots';
mkdirSync(out, { recursive: true });
const server = createDevServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); };
const context = await browser.newContext({ viewport: { width: 1000, height: 640 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
const page = await context.newPage(); page.setDefaultTimeout(240000);
page.on('pageerror', (e) => check('no error in the page', false, e.message));
await page.goto(`${origin}/#nointro-gameclock`, { timeout: 300000 });
await page.waitForFunction(() => !!(window.__nlw && window.__nlw.ready), null, { timeout: 300000 });
await page.waitForSelector('#open-signup', { state: 'visible', timeout: 300000 });
await page.click('#open-signup');
await page.waitForSelector('#account:not([hidden])');
await page.fill('#account-username', `Fleet_${Math.random().toString(36).slice(2, 8)}`);
await page.fill('#account-password', 'a password for the browser test');
await page.click('#account-submit');
await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 120000 });
await pastQuestion(page);
await page.fill('#name', 'Fleet Test');
await enterTown(page);
// (noon on a dry day, so that the pictures can be seen)
await page.evaluate(() => { const g = window.__nlw.host.game; const day = Math.floor(g.state.t / 86400); g.state.t = day * 86400 + 12 * 3600; g.state.weather = { kind: 'clear', until: g.state.t + 6 * 3600 }; });
const shot = (name) => page.screenshot({ path: resolve(out, `supplied-${name}.png`) });
const go = (x, z, heading, cam = {}) => page.evaluate(([px, pz, h, c]) => { const n = window.__nlw; n.place(px, pz); n.face(h); n.cam.yaw = c.yaw !== undefined ? c.yaw : h; n.cam.dist = c.dist || 9; n.cam.pitch = c.pitch !== undefined ? c.pitch : 0.25; }, [x, z, heading, cam]);

// The model as drawn: its size along the world's axes, and where its highest part is (a box truck's box stands taller
// than its cab, a jet's fin is at its tail), from every point of its mesh in the town.
const drawnOf = (which) => page.evaluate((id) => {
  const n = window.__nlw;
  const holder = id === 'ambulance' ? n.ambulanceDrawn && n.ambulanceDrawn.group : n.supplied.parked.find((p) => p.id === id).holder;
  if (!holder) return null;
  holder.updateMatrixWorld(true);
  let mesh = null; holder.traverse((o) => { if (o.isMesh && o.name.startsWith('supplied-')) mesh = o; });
  if (!mesh) return null;
  const pos = mesh.geometry.attributes.position, v = new THREE.Vector3(), pts = [];
  for (let i = 0; i < pos.count; i += 1) { v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld); pts.push([v.x, v.y, v.z]); }
  const ext = (k, list = pts) => [Math.min(...list.map((p) => p[k])), Math.max(...list.map((p) => p[k]))];
  const [x0, x1] = ext(0), [y0, y1] = ext(1), [z0, z1] = ext(2);
  const high = pts.filter((p) => p[1] > y0 + (y1 - y0) * 0.86);
  return { x: [+x0.toFixed(2), +x1.toFixed(2)], y: [+y0.toFixed(2), +y1.toFixed(2)], z: [+z0.toFixed(2), +z1.toFixed(2)], highX: ext(0, high).map((a) => +a.toFixed(2)), highZ: ext(2, high).map((a) => +a.toFixed(2)), triangles: mesh.geometry.index ? mesh.geometry.index.count / 3 : pos.count / 3, standIn: holder.children.some((c) => c.isMesh && c.visible && !c.name) };
}, which);
const loaded = (id) => page.waitForFunction((which) => { const p = window.__nlw.supplied.state().parked.find((q) => q.id === which); return p.loaded || p.failed; }, id, { timeout: 180000 });
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ---- the red box truck, beside the store ----
const T = SUPPLIED_VEHICLES.boxTruck;
await go(T.x - 3, T.z + 14, Math.PI, { yaw: Math.PI + 0.5, dist: 13, pitch: 0.22 });
await loaded('boxTruck');
const truck = await drawnOf('boxTruck');
const tState = (await page.evaluate(() => window.__nlw.supplied.state())).parked.find((p) => p.id === 'boxTruck');
// (facing west, -x: along x it is as long as it is meant to be, and its box, taller than its cab, is toward +x)
check('the red box truck is the owner\'s model, every triangle, beside the store', tState.loaded && !tState.failed && truck.triangles === 9240 && !truck.standIn, { tState, triangles: truck && truck.triangles });
check('it is drawn its length and height, square to the street, its cab toward the store (west)', near(truck.x[1] - truck.x[0], T.length, 0.05) && near(truck.y[1] - truck.y[0], T.height, 0.25) && near(truck.y[0], 0, 0.02) && truck.highX[0] > truck.x[0] + 1.2 && near((truck.x[0] + truck.x[1]) / 2, T.x, 0.05), truck);
await page.waitForTimeout(1500);
await shot('1-box-truck');
// solid: walked into from the market side, the player stops at its side
await go(T.x, T.z + 4.2, Math.PI, { yaw: Math.PI, dist: 7, pitch: 0.3 });
await page.waitForTimeout(500);
await page.keyboard.down('w'); await page.waitForTimeout(2500); await page.keyboard.up('w');
await page.waitForTimeout(400);
const stopped = await page.evaluate(() => ({ x: window.__nlw.predicted.x, z: window.__nlw.predicted.z }));
check('walked into, it is in the way: the player stops at its side', stopped.z > T.z + T.width / 2 + 0.1 && stopped.z < T.z + 3.6, stopped);

// ---- the heavy truck, in the block yard ----
const H = SUPPLIED_VEHICLES.heavyTruck;
await go(H.x + 9, H.z + 9, -Math.PI * 0.75, { yaw: -Math.PI * 0.75, dist: 14, pitch: 0.2 });
await loaded('heavyTruck');
const heavy = await drawnOf('heavyTruck');
const hState = (await page.evaluate(() => window.__nlw.supplied.state())).parked.find((p) => p.id === 'heavyTruck');
check('the heavy truck is the owner\'s model, every triangle, in Udeh Block Industry\'s yard', hState.loaded && heavy.triangles === 98697 && !heavy.standIn, { hState, triangles: heavy && heavy.triangles });
check('it is drawn its length and height, along the yard, ready to go out to the road', near(heavy.z[1] - heavy.z[0], H.length, 0.05) && near(heavy.y[1] - heavy.y[0], H.height, 0.25) && near((heavy.z[0] + heavy.z[1]) / 2, H.z, 0.05), heavy);
await page.waitForTimeout(1500);
await shot('2-heavy-truck');

// ---- the private jet, on its stand ----
const J = SUPPLIED_VEHICLES.jet;
await go(J.x + 24, J.z + 22, -Math.PI * 0.72, { yaw: -Math.PI * 0.72, dist: 20, pitch: 0.18 });
await page.waitForFunction(() => window.__nlw.beyond, null, { timeout: 120000 });
await loaded('jet');
const jet = await drawnOf('jet');
const jState = (await page.evaluate(() => window.__nlw.supplied.state())).parked.find((p) => p.id === 'jet');
check('the private jet is the owner\'s model, every triangle, on the middle stand at Asaba Airport', jState.loaded && jet.triangles === 10105 && !jet.standIn, { jState, triangles: jet && jet.triangles });
// (its fin, the highest of it, is at its tail: the -z end, away from the terminal)
check('it is drawn its length and span, nose to the terminal, its fin at the tail', near(jet.z[1] - jet.z[0], J.length, 0.1) && jet.x[1] - jet.x[0] > J.width * 0.85 && jet.highZ[1] < (jet.z[0] + jet.z[1]) / 2 - 4 && near((jet.x[0] + jet.x[1]) / 2, J.x, 1.5), jet);
await page.waitForTimeout(2000);
await shot('3-jet');
await go(J.x - 4, J.z + 26, Math.PI, { yaw: Math.PI + 0.15, dist: 6, pitch: 0.12 });
await page.waitForTimeout(2000);
await shot('4-jet-from-the-terminal');

// ---- the ambulance at the hospital ----
const A = SUPPLIED_VEHICLES.ambulance;
await page.waitForFunction(() => { const s = window.__nlw.supplied.state().ambulance; return s.loaded || s.failed; }, null, { timeout: 180000 });
await go(-131, 6, -Math.PI * 0.8, { yaw: -Math.PI * 0.8, dist: 11, pitch: 0.2 });
await page.waitForTimeout(1500);
const amb = await drawnOf('ambulance');
const dressed = await page.evaluate(() => { const a = window.__nlw.ambulanceDrawn; return { dressed: !!a.dressed, lamps: a.dressed ? a.dressed.lamps.length : 0, vanShown: a.group.children.filter((c) => c.visible).length, h: +a.group.rotation.y.toFixed(3), at: [+a.group.position.x.toFixed(2), +a.group.position.z.toFixed(2)] }; });
check('the hospital\'s ambulance is the owner\'s model, every triangle, the old van put away', dressed.dressed && amb && amb.triangles === 9763 && dressed.vanShown === 3, { dressed, triangles: amb && amb.triangles });
// (at home it faces +z: its box, taller than its cab, toward -z)
check('it is drawn its length and height, its cab to the front', amb && near(amb.z[1] - amb.z[0], A.length, 0.1) && near(amb.y[1] - amb.y[0], A.height, 0.25) && amb.highZ[1] < amb.z[1] - 0.6, amb);
await shot('5-ambulance');
// badly hurt, the player calls it: out on the call, its lamps flash, red and blue in turn
await page.evaluate(() => { const n = window.__nlw; n.host.game.state.players[n.playerId].health = 12; });
await go(-176, -40, 0, { yaw: Math.PI * 0.85, dist: 14, pitch: 0.2 });
const call = await page.evaluate(() => window.__nlw.server.send({ type: 'care.ambulance.call' }));
const flashes = [];
for (let i = 0; i < 24; i += 1) {
  await page.waitForTimeout(120);
  flashes.push(await page.evaluate(() => { const a = window.__nlw.ambulanceDrawn; return a.dressed.lamps.map((l) => l.material.emissiveIntensity > 0 ? (l.side < 0 ? 'r' : 'b') : '').join(''); }));
}
check('called out to someone badly hurt, it comes, the lamps on its roof flashing red and blue in turn', call.ok && flashes.some((f) => f === 'r') && flashes.some((f) => f === 'b') && !flashes.includes('rb'), { call: call.ok ? 'ok' : call, flashes: flashes.join(' ') });
await page.waitForFunction(() => { const v = window.__nlw.view.ambulance; return v && Math.hypot(v.x + 168, v.z + 14) < 30; }, null, { timeout: 60000 }).catch(() => {});
await shot('6-ambulance-on-a-call');

const passed = results.filter(Boolean).length;
console.log(`${passed} of ${results.length} checks passed`);
await browser.close();
server.close();
process.exit(passed === results.length ? 0 : 1);
