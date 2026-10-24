// Pictures of stage 3's realism, each where it shows (the owner's brief of 23 October, its third stage, and his extras
// of 24 October): the colour of the hour (noon, the golden hour, dusk, the moon), the haze and the clouds' shadows from
// above the town, dust lifted behind a keke on the red earth, wet footprints and tyre marks and puddles after rain, the
// fireflies in the habitation at night, the river's waves and foam (and at Ultra the town in it), the sun's flare at
// Ultra, the soft darkening where things meet at High and Ultra. Each at a graphics level held (PERF_LEVEL, 0 Ultra to 3
// Low), on a phone's settings or a computer's, from the website as built (dist/site, or the folder given).
//   ../server/with-postgres.sh node tools/measure/realism.mjs <out folder> phone|computer [scenes, comma separated|all] [site folder]
// PERF_DPR=n: the screen's pixels to each of the page's. Writes <scene>.png for each, and realism.json: what each level
// drew there (the game's own readout: levelState).
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, existsSync, statSync, createReadStream } from 'node:fs';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const { pastQuestion } = await import(`${ROOT}/prototype/test/start.mjs`);
const out = resolve(process.argv[2] || '/tmp/realism'); mkdirSync(out, { recursive: true });
const PHONE = process.argv[3] !== 'computer';
const ONLY = process.argv[4] && process.argv[4] !== 'all' ? process.argv[4].split(',') : null;
const SITE = resolve(process.argv[5] || `${ROOT}/prototype/dist/site`);
const LEVEL = process.env.PERF_LEVEL ? Number(process.env.PERF_LEVEL) : (PHONE ? 2 : 0);
const DPR = Number(process.env.PERF_DPR) > 0 ? Number(process.env.PERF_DPR) : 1;

const game = require(`${ROOT}/api/game.js`);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.jpg': 'image/jpeg' };
const server = createServer((req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  if (path === '/api/game') { game(req, res); return; }
  const file = resolve(SITE, `.${path === '/' ? '/index.html' : path}`);
  if (!(file === SITE || file.startsWith(SITE + sep)) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('Not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Content-Length': statSync(file).size, 'Cache-Control': 'no-cache' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const context = await browser.newContext(PHONE ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true, serviceWorkers: 'block' } : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: DPR, serviceWorkers: 'block' });
const page = await context.newPage();
page.setDefaultTimeout(600000);
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); console.log('PAGE ERROR', e.message); });
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 4\d\d/.test(m.text())) { errors.push(m.text().slice(0, 400)); console.log('CONSOLE', m.text().slice(0, 400)); } });
await page.addInitScript(() => { let s = 20261024; Math.random = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; });
const tap = (sel) => (PHONE ? page.tap(sel) : page.click(sel));

await page.goto(`${origin}/#gameclock${PHONE ? '-lite' : ''}`, { timeout: 600000 });
await page.waitForSelector('#cover-play', { state: 'visible', timeout: 600000 });
await page.evaluate(() => document.getElementById('cover-play').click());
await page.waitForSelector('#open-signup', { state: 'visible', timeout: 600000 });
await page.click('#open-signup');
await page.fill('#account-username', `Look_${Math.random().toString(36).slice(2, 7)}`);
await page.fill('#account-password', 'a password for the pictures');
await page.click('#account-submit');
await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 120000 });
await pastQuestion(page);
await page.fill('#name', 'Look');
await tap('#enter');
await page.waitForSelector('#confirm:not([hidden])', { timeout: 120000 });
await tap('#confirm-yes');
await page.waitForFunction(() => !document.querySelector('#hud').hidden && window.__nlw.view && window.__nlw.me && window.__nlw.me.mixer, null, { timeout: 900000 });
await page.evaluate((level) => { const n = window.__nlw, g = n.governor; g.hold(true); g.set(level, 'pictures'); if (n.graphicsPretend) n.graphicsPretend.extraMB = -1e6; }, LEVEL);
await page.evaluate(() => { for (const id of ['toasts', 'notices']) { const t = document.getElementById(id); if (t) t.style.display = 'none'; } });

// ---- helpers ----
const frames = (n) => page.evaluate((n) => new Promise((done) => { let k = 0; const f = () => { k += 1; if (k >= n) done(); else requestAnimationFrame(f); }; requestAnimationFrame(f); }), n);
const weather = (hour, kind = 'clear') => page.evaluate(([h, kind]) => { const g = window.__nlw.host.game; const day = Math.floor(g.state.t / 86400); g.state.t = day * 86400 + h * 3600; g.state.weather = { kind, until: g.state.t + 12 * 3600 }; }, [hour, kind]);
const goTo = (x, z, h, { dist = 6.5, pitch = 0.12 } = {}) => page.evaluate(([x, z, h, dist, pitch]) => { const n = window.__nlw; n.place(x, z); n.face(h); n.cam.yaw = h; n.cam.dist = dist; n.cam.pitch = pitch; }, [x, z, h, dist, pitch]);
const quiet = async (most = 45000) => {
  const t0 = Date.now(); let last = '', same = 0;
  while (Date.now() - t0 < most) {
    const now = await page.evaluate(() => { const r = window.__nlw.renderer; const m = r.info.memory; return `${m.geometries}/${m.textures}/${(window.__nlw.graphics || {}).held}`; });
    if (now === last) { same += 1; if (same >= 3) return; } else { same = 0; last = now; }
    await page.waitForTimeout(1500);
  }
};
const report = {};
const shot = async (name, wait = 3) => {
  if (wait) await frames(wait);
  await page.screenshot({ path: resolve(out, `${name}.png`) });
  report[name] = await page.evaluate(() => { const s = window.__nlw.levelState; return { level: s.level, air: s.air, glow: s.glow, dust: s.dust, fireflies: s.fireflies, wetTracks: s.wetTracks, occlusion: s.occlusion, river: s.river, warmth: s.warmth, finish: { wet: +s.finish.wet.toFixed(2) } }; });
  console.log(name, JSON.stringify(report[name]));
};
// walking `metres` straight along `heading`, a step each frame
const walk = async (x, z, heading, metres, step = 0.35) => {
  for (let d = 0; d <= metres; d += step) {
    await page.evaluate(([x, z, h]) => { const n = window.__nlw; n.place(x, z); n.face(h); }, [x + Math.sin(heading) * d, z + Math.cos(heading) * d, heading]);
    await frames(1);
  }
};
const park = await page.evaluate(() => window.__nlw.service('park'));
const want = (scene) => !ONLY || ONLY.includes(scene);

// (in the sun: the clouds' shadows drift over the land, and a picture of the hour's colours is taken where none lies:
// waited for, up to two minutes)
const inSun = async (x, z) => {
  const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    const shade = await page.evaluate(([x, z]) => (window.__nlw.cloudShadeAt ? window.__nlw.cloudShadeAt(x, z) : 1), [x, z]);
    if (shade > 0.97) return shade;
    await frames(2);
  }
  return null;
};
// ---- the colour of the hour, at the motor park ----
for (const [name, hour] of [['noon', 12.5], ['golden', 17.8], ['dusk', 18.9], ['moon', 23]]) {
  if (!want(name)) continue;
  await goTo(park.x + 6, park.z + 4, Math.PI);
  await weather(hour);
  await quiet();
  await frames(6);
  await inSun(park.x + 6, park.z - 10);
  await shot(`hour-${name}`);
}
// ---- the haze and the clouds' shadows, from high over the town, a day of broken cloud ----
if (want('clouds')) {
  await goTo(10, 40, Math.PI * 0.8, { dist: 60, pitch: 0.55 });
  await weather(12.5, 'cloudy');
  await quiet();
  await frames(12);
  await shot('clouds-and-haze');
}
// ---- the mirage, along Waterside Road at the height of a hot day ----
if (want('mirage')) {
  // (the player to one side of the way, the view a little across it, low: the far road seen past them)
  await goTo(-60, 110.5, Math.PI / 2, { dist: 4.5, pitch: 0.0 });
  await page.evaluate(() => { window.__nlw.cam.yaw = Math.PI / 2 + 0.16; });
  await weather(13);
  await quiet();
  await frames(6);
  await shot('mirage-waterside-road');
}
// ---- dust behind a keke on the red earth of the motor park, a dry noon ----
let keke = null;
if (want('dust') || want('wet')) {
  keke = await page.evaluate(() => {
    const n = window.__nlw, park = n.service('park');
    n.place(park.x, park.z);
    const r = n.server.send({ type: 'vehicle.hire' });
    if (!r.ok) return { ok: false, code: r.code };
    const v = n.view.vehicles.find((x) => x.id === r.vehicle.id);
    n.place(v.x + 1.6, v.z);
    const e = n.server.send({ type: 'vehicle.enter', vehicleId: v.id });
    return { ok: e.ok, x: v.x, z: v.z };
  });
  console.log('keke', JSON.stringify(keke));
}
const drive = async (x, z, heading, metres, step = 0.5) => {
  for (let d = 0; d <= metres; d += step) {
    await page.evaluate(([x, z, h]) => window.__nlw.park(x, z, h), [x + Math.sin(heading) * d, z + Math.cos(heading) * d, heading]);
    await frames(1);
    // (REALISM_TRACE: the game's clock and the dust in the air at each step)
    if (process.env.REALISM_TRACE) console.log('step', d, JSON.stringify(await page.evaluate(() => { const s = window.__nlw.levelState; return { t: s.air.time, dust: s.dust }; })));
  }
};
if (want('dust') && keke && keke.ok) {
  await weather(12.5);
  await page.evaluate(() => { const n = window.__nlw; n.cam.dist = 9; n.cam.pitch = 0.2; });
  // (along Yard Lane, the town's laterite lane, eastwards, clear of everything)
  const h = Math.PI / 2, lane = { x: -100, z: -141 };
  await page.evaluate(([x, z, h]) => window.__nlw.park(x, z, h), [lane.x, lane.z, h]);
  await quiet(30000);
  // Driven for real, the accelerator held down, from a standstill. This machine draws a frame in a second or more where
  // a phone draws thirty a second, and the game takes at most half a second of its own time for a frame: with the
  // game's clock slowed ten times, a frame here is a twentieth of a second of the game's, as on a phone, and the keke,
  // its dust and the air go as they do on a phone, only slower; the picture taken on the move.
  await page.evaluate(() => window.__nlw.slow(0.1));
  await page.keyboard.down('w');
  const went = await page.evaluate(([x, z]) => new Promise((done) => {
    const n = window.__nlw, t0 = Date.now();
    const f = () => { const p = n.predicted, d = Math.hypot(p.x - x, p.z - z); if (d >= 32 || Date.now() - t0 > 900000) done({ metres: +d.toFixed(1), kmh: +(Math.abs(n.car.speed) * 3.6).toFixed(1), seconds: Math.round((Date.now() - t0) / 1000) }); else requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }), [lane.x, lane.z]);
  console.log('dust drive', JSON.stringify(went));
  await shot('dust-behind-keke', 0);
  await page.keyboard.up('w');
  await page.evaluate(() => window.__nlw.slow(1));
  // (and out of it again: the next scenes are on foot, the habitation's is entered on foot only)
  if (!want('wet')) await page.evaluate(() => { const n = window.__nlw; if (n.view.self.driving) n.server.send({ type: 'vehicle.exit' }); });
}
// ---- after rain: tyre marks and footprints on the wet earth, puddles on the tarmac ----
if (want('wet')) {
  await weather(13, 'rain');
  await frames(30);
  await weather(13.2, 'clear');
  if (keke && keke.ok) {
    await page.evaluate(([x, z]) => window.__nlw.park(x, z, Math.PI / 2), [keke.x, keke.z]);
    await page.evaluate(() => { const n = window.__nlw; n.cam.dist = 8; n.cam.pitch = 0.45; });
    await drive(keke.x, keke.z, Math.PI / 2, 14);
    await page.evaluate(() => { const n = window.__nlw; n.cam.yaw = -Math.PI / 2; });
    await shot('wet-tyre-marks');
    await page.evaluate(() => window.__nlw.server.send({ type: 'vehicle.exit' }));
  }
  await page.evaluate(() => { const n = window.__nlw; n.cam.dist = 5; n.cam.pitch = 0.5; });
  await walk(park.x + 4, park.z - 6, 0, 7);
  await page.evaluate(() => { const n = window.__nlw; n.cam.yaw = 0; });
  await shot('wet-footprints');
  await goTo(-40, 113, Math.PI / 2, { dist: 6, pitch: 0.15 });
  await quiet(20000);
  await frames(4);
  await shot('puddles-waterside-road');
}
// ---- the river: its waves and foam at the bank (High and up), the town in it (Ultra) ----
if (want('river')) {
  await page.evaluate(() => { const n = window.__nlw; if (n.view.self.driving) n.server.send({ type: 'vehicle.exit' }); });
  await goTo(10, 146, 0.2, { dist: 7, pitch: 0.25 });
  await weather(16.5);
  await quiet();
  await frames(6);
  await shot('river-bank');
}
// ---- the sun's flare (Ultra): early morning on the river bank, looking across the water into the low sun (in the town's
// grid the morning sun lies over the river, 19 degrees west of its line) ----
if (want('flare')) {
  await page.evaluate(() => { const n = window.__nlw; if (n.view.self.driving) n.server.send({ type: 'vehicle.exit' }); });
  await goTo(10, 141, -0.34, { dist: 5, pitch: -0.14 });
  await weather(7.1);
  await quiet();
  await frames(4);
  const way = await page.evaluate(() => { const n = window.__nlw, s = n.sky.sun; return Math.atan2(s.position.x - s.target.position.x, s.position.z - s.target.position.z); });
  // (the view's yaw is the way it looks: towards the sun)
  await page.evaluate((w) => { const n = window.__nlw; n.face(w); n.cam.yaw = w + 0.12; }, way);
  await frames(4);
  await shot('sun-flare');
}
// ---- the fireflies, at the lagoon in the habitation at night ----
if (want('fireflies')) {
  await page.evaluate(() => { const n = window.__nlw; if (n.view.self.driving) n.server.send({ type: 'vehicle.exit' }); });
  await goTo(618, 118, 0.6, { dist: 6, pitch: 0.1 });
  await weather(22.5);
  await quiet(120000);
  await frames(20);
  await shot('fireflies-lagoon-night');
}
writeFileSync(resolve(out, 'realism.json'), JSON.stringify({ phone: PHONE, level: LEVEL, dpr: DPR, report, errors }, null, 1));
console.log('errors', errors.length);
await browser.close();
server.close();
