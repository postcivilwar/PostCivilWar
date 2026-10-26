// Where the page's own processor time goes in the town (the owner's brief of 26 October 2026: the game hung on his
// phones): a phone's settings, walked round the town's middle as tools/measure/soak.mjs walks it, the browser's CPU
// profiler run for a while, and its samples summed by function (the time in each function itself, and with what it
// calls), heaviest first. The drawing itself is done in another process on this machine; what is here is what a
// phone's processor would do for the game's own part of each frame, and its handing over of the picture.
//   ../server/with-postgres.sh node tools/measure/cpu-profile.mjs <out folder> [site folder]
// PROFILE_SECONDS (60), PROFILE_WARM seconds walked first (60), PROFILE_GUN=1 the gun out, PROFILE_LEVEL (medium),
// PROFILE_THROTTLE (1), PROFILE_LABEL
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, existsSync, statSync, createReadStream } from 'node:fs';
import { resolve, extname, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const { pastQuestion } = await import(`${ROOT}/prototype/test/start.mjs`);
const out = resolve(process.argv[2] || '/tmp/profile'); mkdirSync(out, { recursive: true });
const SITE = resolve(process.argv[3] || `${ROOT}/prototype/dist/site`);
const SECONDS = Number(process.env.PROFILE_SECONDS) > 0 ? Number(process.env.PROFILE_SECONDS) : 60;
const WARM = Number(process.env.PROFILE_WARM) >= 0 && process.env.PROFILE_WARM ? Number(process.env.PROFILE_WARM) : 60;
const GUN = process.env.PROFILE_GUN === '1';
const LEVEL = process.env.PROFILE_LEVEL || 'medium';
const THROTTLE = Number(process.env.PROFILE_THROTTLE) > 0 ? Number(process.env.PROFILE_THROTTLE) : 1;
const LABEL = process.env.PROFILE_LABEL || `${LEVEL}${GUN ? '-gun' : ''}`;
const game = require(`${ROOT}/api/game.js`);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
const server = createServer((req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  if (path === '/api/game') { game(req, res); return; }
  const file = resolve(SITE, `.${path === '/' ? '/index.html' : path}`);
  if (!(file === SITE || file.startsWith(SITE + sep)) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('Not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Content-Length': statSync(file).size, 'Cache-Control': 'no-cache' });
  if (req.method === 'HEAD') { res.end(); return; }
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
const page = await context.newPage();
page.setDefaultTimeout(900000);
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
const cdp = await context.newCDPSession(page);
if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
await page.goto(`${origin}/#gameclock-lite`, { timeout: 900000 });
await page.waitForSelector('#cover-play', { state: 'visible', timeout: 900000 });
await page.evaluate(() => document.getElementById('cover-play').click());
await page.waitForSelector('#open-signup', { state: 'visible', timeout: 900000 });
await page.click('#open-signup');
await page.fill('#account-username', `Prof_${Math.random().toString(36).slice(2, 7)}`);
await page.fill('#account-password', 'a password for the profile');
await page.click('#account-submit');
await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 180000 });
await pastQuestion(page);
await page.fill('#name', 'Prof');
await page.tap('#enter');
await page.waitForSelector('#confirm:not([hidden])', { timeout: 180000 });
await page.tap('#confirm-yes');
await page.waitForFunction(() => !document.querySelector('#hud').hidden && window.__nlw.view && window.__nlw.me && window.__nlw.me.mixer, null, { timeout: 900000 });
await page.evaluate((level) => { const n = window.__nlw, g = n.host.game; const hour = n.view.clock.hourFloat; n.skip(((24 + 10 - hour) % 24)); g.state.weather = { kind: 'clear', until: g.state.t + 24 * 3600 }; n.setGraphics(level); for (const id of ['toasts', 'notices']) { const t = document.getElementById(id); if (t) t.style.display = 'none'; } }, LEVEL);
const park = await page.evaluate(() => window.__nlw.service('park'));
const ROUTE = [[park.x + 6, park.z + 4], [0, 60], [0, 113], [-120, 113], [-230, 113], [-120, 113], [0, 113], [0, 40], [0, -40], [-120, -40], [-220, -40], [-120, -40], [0, -40], [0, 40]];
const legs = []; let total = 0;
for (let i = 0; i < ROUTE.length; i += 1) { const a = ROUTE[i], b = ROUTE[(i + 1) % ROUTE.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); legs.push({ a, b, from: total, L }); total += L; }
const along = (s) => { s %= total; const l = legs.find((g) => s >= g.from && s < g.from + g.L) || legs[0]; const k = (s - l.from) / Math.max(1e-6, l.L); return { x: l.a[0] + (l.b[0] - l.a[0]) * k, z: l.a[1] + (l.b[1] - l.a[1]) * k, to: l.b }; };
const t0 = Date.now();
await page.focus('canvas').catch(() => {});
if (GUN) { await page.keyboard.press('x'); await page.waitForTimeout(1500); }
await page.keyboard.down('w');
let nextShot = Date.now() + 15000;
const walkFor = async (ms) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const st = await page.evaluate(() => { const p = window.__nlw.predicted; return { x: p.x, z: p.z }; });
    const want = along(((Date.now() - t0) / 1000) * 1.4);
    if (Math.hypot(want.x - st.x, want.z - st.z) > 10) await page.evaluate(([x, z]) => window.__nlw.place(x, z), [want.x, want.z]);
    const h = Math.atan2(want.to[0] - want.x, want.to[1] - want.z);
    await page.evaluate((h) => { const n = window.__nlw; n.cam.yaw = h; if (!(n.gunPlay && n.gunPlay.out)) n.face(h); if (n.ui.isOpen()) n.ui.close(); }, h);
    if (GUN && Date.now() > nextShot) { nextShot = Date.now() + 15000; await page.keyboard.down('f'); await page.waitForTimeout(600); await page.keyboard.up('f'); }
    await page.waitForTimeout(800);
  }
};
await walkFor(WARM * 1000);
const frames0 = await page.evaluate(() => window.__nlw.monitor.report().frames);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
await cdp.send('Profiler.start');
await walkFor(SECONDS * 1000);
const { profile } = await cdp.send('Profiler.stop');
const frames1 = await page.evaluate(() => window.__nlw.monitor.report().frames);
const frames = Math.max(1, frames1 - frames0);
// self time by function; and "within": the time in a function and all it calls (each sample counted once per function)
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const parent = new Map(); for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
const counts = new Map(); for (const s of profile.samples) counts.set(s, (counts.get(s) || 0) + 1);
const dt = (profile.endTime - profile.startTime) / 1000 / Math.max(1, profile.samples.length);     // ms a sample
const name = (n) => { const cf = n.callFrame; const file = String(cf.url || '').split('/').pop().split('?')[0]; return `${cf.functionName || '(anonymous)'} ${file}:${cf.lineNumber + 1}`; };
const self = new Map(), within = new Map();
let idle = 0, program = 0, gc = 0, all = 0;
for (const [id, k] of counts) {
  const n = byId.get(id); const nm = name(n); all += k;
  if (n.callFrame.functionName === '(idle)') { idle += k; continue; }
  if (n.callFrame.functionName === '(program)') program += k;
  if (n.callFrame.functionName === '(garbage collector)') gc += k;
  self.set(nm, (self.get(nm) || 0) + k);
  const seen = new Set();
  for (let p = id; p !== undefined; p = parent.get(p)) { const pn = name(byId.get(p)); if (!seen.has(pn)) { seen.add(pn); within.set(pn, (within.get(pn) || 0) + k); } }
}
const ms = (k) => +((k * dt) / frames).toFixed(2);
const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => [ms(v), k]);
const result = { site: SITE, level: LEVEL, gun: GUN, throttle: THROTTLE, seconds: SECONDS, frames, msPerFrame: { busy: ms(all - idle), idle: ms(idle), program: ms(program), gc: ms(gc) }, selfTop: top(self, 50), withinTop: top(within, 80) };
writeFileSync(resolve(out, `cpu-profile-${LABEL}.json`), JSON.stringify(result, null, 1));
writeFileSync(resolve(out, `cpu-profile-${LABEL}.cpuprofile`), JSON.stringify(profile));
console.log('frames', frames, 'ms a frame', JSON.stringify(result.msPerFrame));
console.log('self:'); for (const [v, k] of result.selfTop.slice(0, 30)) console.log(' ', v, k);
console.log('within:'); for (const [v, k] of result.withinTop.slice(0, 40)) console.log(' ', v, k);
await browser.close();
server.close();
process.exit(0);
