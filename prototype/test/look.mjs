// Close-up screenshots of people, vehicles and buildings, for judging the look.
//   node test/look.mjs <output-directory>
import { pastQuestion, enterTown } from './start.mjs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(process.argv[2] || resolve(here, '../dist/look'));
const only = process.argv[3] ? process.argv[3].split(',') : null;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 1 })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
await page.goto('file://' + resolve(here, '../dist/local.html') + '#nointro-gameclock', { timeout: 300000 });
await pastQuestion(page);
if (process.env.LOOK_BODY) await page.click(`[data-gender="${process.env.LOOK_BODY}"]`);
await enterTown(page);
await page.waitForTimeout(1200);
await page.evaluate(() => { const n = window.__nlw; const g = n.host.game; n.skip(2.6); g.state.weather = { kind: 'clear', until: g.state.t + 9 * 3600 }; document.getElementById('toasts').style.display = 'none'; });

// Portraits: the camera stands in front of a resident, with the player just behind it so the resident turns to look.
const portraits = ['lands', 'clerk', 'sergeant', 'corporal', 'nurse', 'instructor', 'yardowner', 'trader', 'cook', 'mason', 'moulder', 'fisher', 'clothseller', 'produce', 'rider', 'surveyor'];
for (const id of portraits) {
  if (only && !only.some((k) => `face-${id}`.includes(k))) continue;
  const seen = await page.evaluate(([rid, full]) => {
    const n = window.__nlw;
    const r = n.view.residents.find((x) => x.id === rid);
    if (!r || r.mode === 'inside') return false;
    const fx = Math.sin(r.heading), fz = Math.cos(r.heading);
    n.place(r.x + fx * 2.6, r.z + fz * 2.6);
    n.cam.free = { x: r.x, y: full ? 1.0 : 1.5, z: r.z };
    n.cam.yaw = r.heading + Math.PI; n.cam.dist = full ? 3.3 : 1.25; n.cam.pitch = full ? 0.1 : 0.04; n.cam.lastDrag = 1e9;
    return true;
  }, [id, process.env.LOOK_FULL === '1']);
  if (!seen) { console.log(`${id}: indoors`); continue; }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(out, `face-${id}.png`) });
}

// Scenes: a point to look at, and where to look from.
const scenes = [
  ['player-front', 'self', 1.0, Math.PI, 3.3, 0.1],
  ['player-face', 'self', 1.52, Math.PI, 1.2, 0.04],
  ['player-back', 'self', 1.0, 0.5, 3.6, 0.15],
  ['keke', [-29, 0.9, 91.5], null, 2.2, 5.5, 0.22],
  ['keke-front', [-36, 0.9, 86.5], null, -2.2, 5.0, 0.2],
  ['bus', [-58, 1.2, 78], null, -2.5, 10, 0.2],
  ['bus-back', [-50, 1.2, 88], null, 0.7, 10, 0.25],
  ['pickup', [-110, 1.0, -160], null, 2.6, 9, 0.22],
  ['canoes', [22, 0.3, 163], null, 0.5, 12, 0.3],
  ['registry', [48, 2.5, -66], null, Math.PI + 0.35, 26, 0.2],
  ['homes', [-135, 2, 96], null, Math.PI - 0.4, 22, 0.2],
  ['market', [43, 1.2, 58], null, 1.0, 26, 0.32],
  ['stall-yam', [56, 1.0, 44], null, Math.PI - 0.5, 6.5, 0.3],
  ['stall-cloth', [30, 1.0, 44], null, Math.PI + 0.5, 6.5, 0.3],
  ['road', [0, 1.5, 10], null, Math.PI, 30, 0.14],
  ['yard', [-85, 1.2, -172], null, Math.PI + 0.6, 22, 0.28],
  ['river', [21, 1, 150], null, 0.25, 30, 0.2],
  ['overview', [10, 2, 20], null, 0.7, 120, 0.55],
  ['house', [80, 1.6, -162], null, Math.PI + 0.7, 14, 0.25],
  ['site', [100, 1.2, -192], null, 0.6, 14, 0.3],
  ['secretariat', [-48, 2.5, -66], null, Math.PI - 0.3, 24, 0.2],
];
for (const [name, at, y, yaw, dist, pitch] of scenes) {
  if (only && !only.some((k) => name.includes(k))) continue;
  await page.evaluate(([where, height, cy, cd, cp]) => {
    const n = window.__nlw;
    if (where === 'self') { n.place(-20, 97); n.face(0); n.cam.free = { x: -20, y: height, z: 97 }; } else { n.place(where[0] + 30, where[2] > 100 ? 100 : where[2] + 3); n.cam.free = { x: where[0], y: where[1], z: where[2] }; }
    n.cam.yaw = cy; n.cam.dist = cd; n.cam.pitch = cp; n.cam.lastDrag = 1e9;
  }, [at, y, yaw, dist, pitch]);
  await page.waitForTimeout(1300);
  await page.screenshot({ path: resolve(out, `${name}.png`) });
}
if (!only || only.some((k) => 'seated'.includes(k))) {
  await page.evaluate(() => {
    const n = window.__nlw; const g = n.host.game; const v = g.state.vehicles.list['V-0001'];
    v.hire = { playerId: n.playerId, until: g.state.t + 86400, txn: null };
    n.cam.free = null; n.place(v.x - 2.2, v.z + 2.2);
    g.intent(n.playerId, { type: 'vehicle.enter', vehicleId: v.id });
    n.park(-12, 113, Math.PI / 2);
    n.cam.free = { x: -12, y: 1.1, z: 113 }; n.cam.yaw = -1.9; n.cam.dist = 4.6; n.cam.pitch = 0.16; n.cam.lastDrag = 1e9;
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(out, 'seated.png') });
}
const fps = await page.evaluate(() => new Promise((done) => { let frames = 0; const start = performance.now(); const tick = () => { frames += 1; if (performance.now() - start > 2000) done(frames / 2); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); }));
console.log(`frames per second in software rendering: ${fps.toFixed(1)}`);
console.log('drawn each frame: ' + JSON.stringify(await page.evaluate(() => window.__nlw.drawn)));
await browser.close();
if (errors.length) { console.log('ERRORS'); for (const e of errors) console.log(' - ' + e); process.exit(1); }
console.log('look shots in ' + out);
