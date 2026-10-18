// The first city block in a headless browser (the page as it is built, with no server): walked along both
// pavements, looked at from the road, from the junction, from above and at night, with a picture of each; the
// ground under the walker is the pavement's height; the buildings, the furniture and the signals are drawn; the
// lights change; nothing goes wrong in the page; and what it costs to draw.
//   node test/city.mjs [shots folder]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pastQuestion, enterTown } from './start.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || '/tmp/city-shots';
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
await page.fill('#name', 'City Walker').catch(() => {});
await enterTown(page);
await page.waitForTimeout(2000);

const view = async (name, v) => {
  await page.evaluate((v) => { const n = window.__nlw; n.place(v.x, v.z); n.face(v.h); n.cam.yaw = v.yaw; n.cam.dist = v.dist; n.cam.pitch = v.pitch; }, v);
  await page.waitForTimeout(v.wait || 2200);
  await page.screenshot({ path: resolve(out, `${name}.png`) });
};

// ---- drawn ----
const drawn = await page.evaluate(() => {
  const scene = window.__nlw.scene || null;
  const names = [];
  if (scene) scene.traverse((o) => { if (o.name && o.name.startsWith('city-')) names.push(o.name); });
  return { names };
});
check('the city block is drawn: road, paint, paving, kerbs, the buildings\' walls of brick, render and stone, their glass and frames', ['city-road', 'city-paint', 'city-paving', 'city-concrete', 'city-brick', 'city-render', 'city-stone', 'city-glass', 'city-trim', 'city-metal'].every((n) => drawn.names.includes(n)), drawn);

// ---- walking the west pavement: the walker is up on it ----
await view('01-west-pavement-looking-north', { x: -8.6, z: -10, h: 0, yaw: 0.12, dist: 4.5, pitch: 0.1 });
const up = await page.evaluate(() => { const n = window.__nlw; return { feet: +n.me.group.position.y.toFixed(3), ground: n.ground(n.view.self.x, n.view.self.z) }; });
check('on the pavement the walker stands a kerb above the road', Math.abs(up.feet - up.ground) < 0.02 && up.ground > 0.1, up);
// (every frame's time written down while walking, and who was near on the way: a failure says whether the walk was
// slowed by slow frames or stopped by someone in the way)
await page.evaluate(() => { const rec = window.__walkFrames = { t: [], stop: false }; let last = 0; const step = (now) => { if (rec.stop) return; if (last) rec.t.push(Math.round(now - last)); last = now; requestAnimationFrame(step); }; requestAnimationFrame(step); });
// (walked until two metres on, or for as long as twenty seconds: without a graphics card a frame here takes seconds,
// and the game moves the walker by at most half a second's walk a frame, so a fixed time held says nothing; something
// in the way would hold the walker short however long it is held)
await page.keyboard.down('w');
await page.waitForFunction(() => window.__nlw.view.self.z > -8, null, { timeout: 20000 }).catch(() => {});
await page.keyboard.up('w');
const walked = await page.evaluate(() => {
  const n = window.__nlw, s = n.view.self, rec = window.__walkFrames; rec.stop = true;
  const near = (n.view.people || []).concat(n.view.residents || [], n.view.players || []).filter((q) => q && Number.isFinite(q.x) && Math.hypot(q.x - s.x, q.z - s.z) < 2).map((q) => [+q.x.toFixed(2), +q.z.toFixed(2)]);
  return { z: s.z, x: s.x, frames: rec.t.length, slowest: Math.max(0, ...rec.t), near };
});
check('walking along the pavement goes freely', walked.z > -8, walked);
await view('02-west-pavement-looking-south', { x: -8.6, z: 45, h: Math.PI, yaw: 3.0, dist: 5, pitch: 0.1 });
await view('03-east-pavement-arcade', { x: 8.6, z: -25, h: 0, yaw: -0.2, dist: 5, pitch: 0.12 });
await view('04-lawn-and-bollards', { x: -8.8, z: 52, h: 0, yaw: -0.35, dist: 5, pitch: 0.12 });
await view('05-registry-road-junction', { x: -12, z: -27, h: 2.5, yaw: 2.4, dist: 14, pitch: 0.3 });
await view('06-from-above', { x: 0, z: 20, h: 0, yaw: 2.6, dist: 75, pitch: 0.55, wait: 3000 });
await view('07-glass-tower', { x: 9, z: 14, h: 0, yaw: -1.9, dist: 9, pitch: -0.05 });

// ---- the signals change ----
const lights = await page.evaluate(async () => {
  const n = window.__nlw, seen = new Set();
  for (let i = 0; i < 40; i += 1) { n.host.game.state.real += 1; await new Promise((r) => setTimeout(r, 30)); seen.add(n.world.city.signal(0) + '/' + n.world.city.signal(1)); }
  return [...seen];
});
check('the junction\'s signals change, and Market Road and Registry Road are never green together', lights.some((s) => s.startsWith('green')) && lights.some((s) => s.endsWith('green')) && !lights.includes('green/green'), lights);

// ---- at night ----
// (an hour at a time, letting a frame be drawn between, so that the sky and the lamps follow)
for (let i = 0; i < 24 && (await page.evaluate(() => window.__nlw.night)) < 0.6; i += 1) { await page.evaluate(() => window.__nlw.skip(1)); await page.waitForTimeout(400); }
await view('08-night', { x: -8.6, z: 15, h: 0, yaw: 0.25, dist: 6, pitch: 0.12, wait: 3500 });
const dark = await page.evaluate(() => { const n = window.__nlw; return { night: +n.night.toFixed(2), lit: +n.world.glowMaterial.emissiveIntensity.toFixed(2), lamps: n.world.lampHeads.filter((l) => l.x > -31 && l.x < 30 && l.z > -49 && l.z < 118).length }; });
check('at night the block\'s streetlights and some of its windows are lit', dark.night > 0.5 && dark.lit > 0.5 && dark.lamps >= 10, dark);

// ---- what it costs ----
const cost = await page.evaluate(() => { const n = window.__nlw; n.place(-8.6, 0); n.cam.yaw = 0; const r = n.renderer; return r ? { calls: r.info.render.calls, triangles: r.info.render.triangles } : null; });
console.log('cost of a frame on the block', JSON.stringify(cost));

const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nAll ${results.length} checks passed.`);
await browser.close();
process.exit(failed ? 1 : 0);
