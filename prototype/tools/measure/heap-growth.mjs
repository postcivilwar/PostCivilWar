// What the script's memory grows by while the town is walked (the owner's brief of 26 October 2026: the game hung on his
// phones and his iPhone closed it): a phone's settings, walked round the town's middle as tools/measure/soak.mjs walks
// it; after the first minutes the browser's sampling of what is made (V8's sampling heap profiler) is started, and some
// minutes later what of it is still held is read, by where in the game's code it was made (the functions, heaviest first).
//   ../server/with-postgres.sh node tools/measure/heap-growth.mjs <out folder> [site folder]
// GROWTH_WARM minutes walked before the sampling starts (2); GROWTH_MINUTES sampled (8); GROWTH_GUN=1 the gun out.
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
const out = resolve(process.argv[2] || '/tmp/growth'); mkdirSync(out, { recursive: true });
const SITE = resolve(process.argv[3] || `${ROOT}/prototype/dist/site`);
const WARM = Number(process.env.GROWTH_WARM) >= 0 && process.env.GROWTH_WARM ? Number(process.env.GROWTH_WARM) : 2;
const MINUTES = Number(process.env.GROWTH_MINUTES) > 0 ? Number(process.env.GROWTH_MINUTES) : 8;
const GUN = process.env.GROWTH_GUN === '1';
const LABEL = process.env.GROWTH_LABEL || (GUN ? 'gun' : 'walk');
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
await page.goto(`${origin}/#gameclock-lite`, { timeout: 900000 });
await page.waitForSelector('#cover-play', { state: 'visible', timeout: 900000 });
await page.evaluate(() => document.getElementById('cover-play').click());
await page.waitForSelector('#open-signup', { state: 'visible', timeout: 900000 });
await page.click('#open-signup');
await page.fill('#account-username', `Grow_${Math.random().toString(36).slice(2, 7)}`);
await page.fill('#account-password', 'a password for the growth');
await page.click('#account-submit');
await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 180000 });
await pastQuestion(page);
await page.fill('#name', 'Grow');
await page.tap('#enter');
await page.waitForSelector('#confirm:not([hidden])', { timeout: 180000 });
await page.tap('#confirm-yes');
await page.waitForFunction(() => !document.querySelector('#hud').hidden && window.__nlw.view && window.__nlw.me && window.__nlw.me.mixer, null, { timeout: 900000 });
await page.evaluate(() => { const n = window.__nlw, g = n.host.game; const hour = n.view.clock.hourFloat; n.skip(((24 + 10 - hour) % 24)); g.state.weather = { kind: 'clear', until: g.state.t + 24 * 3600 }; n.setGraphics('medium'); for (const id of ['toasts', 'notices']) { const t = document.getElementById(id); if (t) t.style.display = 'none'; } });
const park = await page.evaluate(() => window.__nlw.service('park'));
const ROUTE = [[park.x + 6, park.z + 4], [0, 60], [0, 113], [-120, 113], [-230, 113], [-120, 113], [0, 113], [120, 113], [230, 113], [120, 113], [0, 113], [0, 40], [0, -40], [-120, -40], [-220, -40], [-120, -40], [0, -40], [120, -40], [220, -40], [120, -40], [0, -40], [0, 40]];
const legs = []; let total = 0;
for (let i = 0; i < ROUTE.length; i += 1) { const a = ROUTE[i], b = ROUTE[(i + 1) % ROUTE.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); legs.push({ a, b, from: total, L }); total += L; }
const along = (s) => { s %= total; const l = legs.find((g) => s >= g.from && s < g.from + g.L) || legs[0]; const k = (s - l.from) / Math.max(1e-6, l.L); return { x: l.a[0] + (l.b[0] - l.a[0]) * k, z: l.a[1] + (l.b[1] - l.a[1]) * k, to: l.b }; };
const t0 = Date.now();
await page.focus('canvas').catch(() => {});
if (GUN) { await page.keyboard.press('x'); await page.waitForTimeout(1500); }
await page.keyboard.down('w');
let nextShot = Date.now() + 20000;
const walkFor = async (ms) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const st = await page.evaluate(() => { const p = window.__nlw.predicted; return { x: p.x, z: p.z }; });
    const want = along(((Date.now() - t0) / 1000) * 1.4);
    if (Math.hypot(want.x - st.x, want.z - st.z) > 10) await page.evaluate(([x, z]) => window.__nlw.place(x, z), [want.x, want.z]);
    const h = Math.atan2(want.to[0] - want.x, want.to[1] - want.z);
    await page.evaluate((h) => { const n = window.__nlw; n.cam.yaw = h; if (!(n.gunPlay && n.gunPlay.out)) n.face(h); if (n.ui.isOpen()) n.ui.close(); }, h);
    if (GUN && Date.now() > nextShot) { nextShot = Date.now() + 30000; await page.keyboard.down('f'); await page.waitForTimeout(500); await page.keyboard.up('f'); }
    await page.waitForTimeout(800);
  }
};
const heap = async () => { await cdp.send('HeapProfiler.collectGarbage'); const u = await cdp.send('Runtime.getHeapUsage'); return { usedMB: +(u.usedSize / 1048576).toFixed(1), backingStoreMB: u.backingStorageSize !== undefined ? +(u.backingStorageSize / 1048576).toFixed(1) : null }; };
await walkFor(WARM * 60000);
await cdp.send('HeapProfiler.enable');
const before = await heap();
console.log('before', JSON.stringify(before));
await cdp.send('HeapProfiler.startSampling', { samplingInterval: 16384, includeObjectsCollectedByMajorGC: false, includeObjectsCollectedByMinorGC: false });
await walkFor(MINUTES * 60000);
await cdp.send('HeapProfiler.collectGarbage');
const { profile } = await cdp.send('HeapProfiler.getSamplingProfile');
await cdp.send('HeapProfiler.stopSampling');
const after = await heap();
console.log('after', JSON.stringify(after));
// still held, by function (self) and by the game's own frames on the way to it
const self = new Map(), within = new Map();
const key = (cf) => `${cf.functionName || '(anonymous)'} ${String(cf.url || '').split('/').pop().split('?')[0]}:${cf.lineNumber + 1}:${cf.columnNumber + 1}`;
function walk(node, stack) {
  const k = key(node.callFrame);
  const here = node.selfSize || 0;
  self.set(k, (self.get(k) || 0) + here);
  const path = [...stack, k];
  if (here) for (const s of new Set(path)) within.set(s, (within.get(s) || 0) + here);
  for (const c of node.children || []) walk(c, path);
}
walk(profile.head, []);
const MB = (b) => +(b / 1048576).toFixed(2);
const top = (m, n = 40) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, b]) => [MB(b), k]);
const result = { site: SITE, gun: GUN, warmMinutes: WARM, minutes: MINUTES, before, after, selfTop: top(self), withinTop: top(within, 60) };
writeFileSync(resolve(out, `heap-growth-${LABEL}.json`), JSON.stringify(result, null, 1));
console.log('held, by where it was made:'); for (const [mb, k] of result.selfTop.slice(0, 25)) console.log(' ', mb, 'MB', k);
await browser.close();
server.close();
process.exit(0);
