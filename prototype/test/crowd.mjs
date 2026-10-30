// His townspeople, ten of each of his figures, drawn as themselves (30 October 2026, the owner's brief: "the npc are
// looking so cartoonish. They don't even look exactly like the 3D GLb file I imported. Also the NPC seems to be very
// few ... Maybe 1 NPC character should be multiplied into 10 places"). The game played on the website on this machine,
// with a phone's settings or a computer's:
//  A  by day at the market and the motor park: many of his townspeople about; those near enough drawn from his own
//     figures, many at once (crowd-figures.js), each figure held once for all who wear it; none failed
//  B  of those standing or walking within the level's reach, nearly all drawn as his figures (a full figure close by,
//     or one of the many), not as the plain shapes
//  C  at one in the morning near the motor park: people out of doors, and drawn
//  D  what it costs: frames a second, draws and triangles at the market, the graphics card's memory, kept under a phone's
//     150 MB; nothing in the console
//   ../server/with-postgres.sh node test/crowd.mjs [shots folder] [phone]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { createDevServer } = await import(resolve(ROOT, 'server/dev.mjs'));
const { pastQuestion, enterTown, watchPictures, lostPictures } = await import(resolve(ROOT, 'prototype/test/start.mjs'));
const out = resolve(process.argv[2] || '/tmp/crowd-shots'); mkdirSync(out, { recursive: true });
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
await page.fill('#account-username', `Crowd_${Math.random().toString(36).slice(2, 7)}`);
await page.fill('#account-password', 'a password for the crowd');
await page.click('#account-submit');
await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 180000 });
await pastQuestion(page);
await page.fill('#name', 'Crowd');
await enterTown(page, { tap: PHONE, wait: 900000 });
await page.waitForFunction(() => window.__nlw.me && window.__nlw.me.mixer, null, { timeout: 300000 });
const setHour = (h) => page.evaluate((h) => { const n = window.__nlw, g = n.host.game; const hour = n.view.clock.hourFloat; n.skip(((24 + h - hour) % 24) || 24); g.state.weather = { kind: 'clear', until: g.state.t + 24 * 3600 }; for (const id of ['toasts', 'notices']) { const el = document.getElementById(id); if (el) el.hidden = true; } }, h);
await setHour(10.5);
await page.evaluate((phone) => window.__nlw.setGraphics(phone ? 'low' : 'medium'), PHONE);

// what is drawn of the town's people now: within the level's reach, standing or walking, how each is drawn
// (of those beyond the full figures, only the ones in the picture: as the drawing has it, render-crowd.js, nobody out of
// the camera's sight is drawn at all, neither as his figure nor plainly)
const census = () => page.evaluate(() => {
  const n = window.__nlw, eye = n.view.self;
  const reach = n.crowdReach ? n.crowdReach() : null;
  const stats = n.crowd.stats;
  const cam = n.camera;
  const sight = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  const ball = new THREE.Sphere(new THREE.Vector3(), 1.3), ground = n.me && n.me.group ? n.me.group.position.y : 0;
  let near = 0, rigs = 0, behind = 0;
  for (const a of n.crowd.actors()) {
    const d = Math.hypot(a.x - eye.x, a.z - eye.z);
    if (!(reach && d < reach && (a.pose === 0 || a.pose === 1))) continue;
    if (a.rig) { near += 1; rigs += 1; continue; }
    ball.center.set(a.x + (a.ox || 0), ground + 0.9, a.z + (a.oz || 0));
    if (sight.intersectsSphere(ball)) near += 1; else behind += 1;
  }
  return { people: n.view.people.length, near, rigs, behind, crowd: stats.crowd || 0, kinds: n.crowdFigures(), reach, simple: stats.simple, perf: { fps: n.perf.fps, calls: n.perf.calls, triangles: n.perf.triangles }, pictures: +((n.graphics.pictures || 0) / 1048576).toFixed(1), buffers: +((n.graphics.buffers || 0) / 1048576).toFixed(1) };
});
// (turned to where most of those near are: the test looks at the crowd)
const faceCrowd = () => page.evaluate(() => {
  const n = window.__nlw, eye = n.view.self, reach = n.crowdReach ? n.crowdReach() : 30;
  let dx = 0, dz = 0;
  for (const a of n.crowd.actors()) { const ax = a.x - eye.x, az = a.z - eye.z, d = Math.hypot(ax, az); if (d > 1 && d < reach && (a.pose === 0 || a.pose === 1)) { dx += ax / d; dz += az / d; } }
  if (Math.hypot(dx, dz) < 0.5) return null;
  const yaw = Math.atan2(dx, dz); n.face(yaw); n.cam.yaw = yaw; return +yaw.toFixed(2);
});
const fps = async (ms = 8000) => page.evaluate((ms) => new Promise((done) => { let f = 0; const t0 = performance.now(); const tick = () => { f += 1; if (performance.now() - t0 < ms) requestAnimationFrame(tick); else done(+(f * 1000 / (performance.now() - t0)).toFixed(1)); }; requestAnimationFrame(tick); }), ms);

const seen = {};
for (const [name, x, z, yaw] of [['market', 43, 60, -Math.PI / 2], ['park', -40, 92, Math.PI]]) {
  await page.evaluate(([x, z, yaw]) => { const n = window.__nlw; n.place(x, z); n.face(yaw); n.cam.yaw = yaw; }, [x, z, yaw]);
  await page.waitForTimeout(PHONE ? 10000 : 6000);
  await faceCrowd();
  await page.waitForTimeout(PHONE ? 60000 : 40000);
  const c = await census();
  c.fps = await fps();
  await page.screenshot({ path: resolve(out, `day-${name}.png`) });
  seen[name] = c;
  console.log(name, JSON.stringify({ ...c, kinds: c.kinds.map((k) => `${k.id}:${k.state}:${k.drawn}`) }));
}
const m = seen.market, p = seen.park;
check('A: by day, many of his townspeople at the market and the motor park', m.people >= 40 && p.people >= 30, { market: m.people, park: p.people });
check('A: those near enough drawn from his own figures, many at once, each figure held once', m.crowd + p.crowd >= (PHONE ? 12 : 20) && m.kinds.length >= 3 && m.kinds.every((k) => k.state === 'ready' || k.state === 'loading'), { market: m.crowd, park: p.crowd, kinds: m.kinds.map((k) => k.id) });
check('A: no figure failed to be made', [...m.kinds, ...p.kinds].every((k) => k.state !== 'failed'), [...m.kinds, ...p.kinds].filter((k) => k.state === 'failed'));
const share = (c) => (c.near ? (c.rigs + c.crowd) / c.near : 1);
check('B: of those standing or walking within the reach, nearly all drawn as his figures, not the plain shapes', share(m) >= 0.8 && share(p) >= 0.8, { market: [m.rigs, m.crowd, m.near], park: [p.rigs, p.crowd, p.near] });

// C: one in the morning, near the motor park
await setHour(1);
await page.evaluate(() => { const n = window.__nlw; n.place(-40, 92); n.face(Math.PI); n.cam.yaw = Math.PI; });
await page.waitForTimeout(PHONE ? 10000 : 6000);
await faceCrowd();
await page.waitForTimeout(PHONE ? 50000 : 34000);
const night = await census();
await page.screenshot({ path: resolve(out, 'night-park.png') });
console.log('night', JSON.stringify({ ...night, kinds: night.kinds.map((k) => `${k.id}:${k.state}:${k.drawn}`) }));
const outside = await page.evaluate(() => { const n = window.__nlw, eye = n.view.self; return n.view.people.filter(([, x, z, , pose]) => pose !== 4 && Math.hypot(x - eye.x, z - eye.z) < 80).length; });
check('C: at one in the morning, people out of doors near the motor park, and drawn', outside >= 8 && night.rigs + night.crowd >= Math.min(6, night.near), { outside, drawn: night.rigs + night.crowd, near: night.near });

// D: what it costs
check('D: the graphics card\'s memory under a phone\'s 150 MB (pictures and shapes)', !PHONE || m.pictures + m.buffers < 150, { market: [m.pictures, m.buffers], park: [p.pictures, p.buffers] });
console.log('frames a second (this machine, without a graphics card): market', m.fps, 'park', p.fps, '| draws, triangles:', JSON.stringify({ market: [m.perf.calls, m.perf.triangles], park: [p.perf.calls, p.perf.triangles] }));
const lost = await lostPictures(page);
check('D: no picture handed to the graphics card after the page had let it go; nothing in the console', lost === 0 && errors.length === 0, { lost, errors: errors.slice(0, 5) });
writeFileSync(resolve(out, 'crowd.json'), JSON.stringify({ seen, night, outside }, null, 1));
await browser.close(); server.close();
const passed = results.filter(Boolean).length;
console.log(passed === results.length ? `All ${results.length} checks passed.` : `${passed} of ${results.length} checks passed.`);
process.exit(passed === results.length ? 0 : 1);
