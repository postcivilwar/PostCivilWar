// The game's one-off pieces of work while playing, timed on a phone's settings (the owner's brief of 26 October 2026:
// the game hung on his phones): the land beyond the town and its billboards built (a minute or so into play), the
// habitation built as the player nears it, and the first round fired; each, how long the page's main thread was held
// at once (its longest task), the frames after it, and the programs compiled. The processor slowed four times, an
// iPhone's screen, Medium.
//   ../server/with-postgres.sh node tools/measure/one-shots.mjs <out folder> [site folder]
// SHOTS_THROTTLE (4), SHOTS_LABEL
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
const out = resolve(process.argv[2] || '/tmp/shots'); mkdirSync(out, { recursive: true });
const SITE = resolve(process.argv[3] || `${ROOT}/prototype/dist/site`);
const THROTTLE = Number(process.env.SHOTS_THROTTLE) > 0 ? Number(process.env.SHOTS_THROTTLE) : 4;
const LABEL = process.env.SHOTS_LABEL || 'shots';
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
await page.addInitScript(() => {
  window.__shots = { long: [], frames: [] };
  try { new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__shots.long.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch (e) { /* not here */ }
  const f = (t) => { const s = window.__shots.frames; s.push(t); if (s.length > 5000) s.splice(0, 2500); requestAnimationFrame(f); };
  requestAnimationFrame(f);
});
const cdp = await context.newCDPSession(page);
await page.goto(`${origin}/#gameclock-lite`, { timeout: 900000 });
await page.waitForSelector('#cover-play', { state: 'visible', timeout: 900000 });
await page.evaluate(() => document.getElementById('cover-play').click());
await page.waitForSelector('#open-signup', { state: 'visible', timeout: 900000 });
await page.click('#open-signup');
await page.fill('#account-username', `Shot_${Math.random().toString(36).slice(2, 7)}`);
await page.fill('#account-password', 'a password for the shots');
await page.click('#account-submit');
await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 180000 });
await pastQuestion(page);
await page.fill('#name', 'Shot');
await page.tap('#enter');
await page.waitForSelector('#confirm:not([hidden])', { timeout: 180000 });
await page.tap('#confirm-yes');
await page.waitForFunction(() => !document.querySelector('#hud').hidden && window.__nlw.view && window.__nlw.me && window.__nlw.me.mixer, null, { timeout: 900000 });
await page.evaluate(() => { const n = window.__nlw, g = n.host.game; const hour = n.view.clock.hourFloat; n.skip(((24 + 11 - hour) % 24)); g.state.weather = { kind: 'clear', until: g.state.t + 24 * 3600 }; n.setGraphics('medium'); for (const id of ['toasts', 'notices']) { const t = document.getElementById(id); if (t) t.style.display = 'none'; } });
// (the town warmed up first, with the processor at its own speed: what is timed is each piece on its own)
await page.waitForFunction(() => window.__nlw.beyond || (window.__nlw.warmUp && window.__nlw.warmUp.stats && window.__nlw.warmUp.stats.left === 0), null, { timeout: 900000, polling: 2000 }).catch(() => {});
const results = [];
async function timed(name, start, done, settleMs = 20000, extra = null) {
  await page.waitForTimeout(3000);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  const before = await page.evaluate(() => ({ long: window.__shots.long.length, frames: window.__shots.frames.length, programs: window.__nlw.renderer.info.programs.length, t: performance.now() }));
  await page.evaluate(start);
  const t0 = Date.now();
  if (done) await page.waitForFunction(done, null, { timeout: 600000, polling: 500 }).catch(() => {});
  const doneMs = Date.now() - t0;
  await page.waitForTimeout(settleMs);
  const after = await page.evaluate((b) => {
    const S = window.__shots, f = S.frames.slice(Math.max(0, b.frames - 1)), d = [];
    for (let i = 1; i < f.length; i += 1) d.push(f[i] - f[i - 1]);
    const long = S.long.filter((x) => x[0] >= b.t - 50);
    return { longest: long.reduce((a, x) => Math.max(a, x[1]), 0), longSum: long.reduce((a, x) => a + x[1], 0), longN: long.length, worstFrame: d.length ? Math.round(Math.max(...d)) : null, frames: d.length, programs: window.__nlw.renderer.info.programs.length - b.programs };
  }, before);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const row = { name, doneMs, ...after, ...(extra ? { detail: await page.evaluate(extra) } : {}) };
  results.push(row);
  console.log(name, JSON.stringify(row));
}
// 1. the land beyond the town and the billboards (if Auto has not built them already)
// (as the game does it by itself a few seconds after the town is warmed up: in a build that makes it a piece a frame,
// begun (beginBeyond); in one before that, all at once (buildBeyond))
const already = await page.evaluate(() => !!window.__nlw.beyond);
if (!already) await timed('the land beyond the town and its billboards', () => { const n = window.__nlw; if (n.beginBeyond) n.beginBeyond(); else n.buildBeyond(); }, () => window.__nlw.beyond, 20000, () => window.__nlw.beyondSteps || null);
else console.log('the land beyond the town was built already, before it could be timed');
// 2. the habitation, built as the player comes within reach of it (and the road up to it)
const habDetail = () => { const h = window.__nlw.habitation && window.__nlw.habitation.state(); return h ? { buildMs: h.buildMs, buildSpanMs: h.buildSpanMs, longestPieceMs: h.buildLongestMs, longestPiece: h.buildLongestPiece, builds: h.builds, ground: h.ground } : null; };
await timed('the habitation built, coming up the road', () => { const n = window.__nlw; n.place(262, 113); n.face(Math.PI / 2); n.cam.yaw = Math.PI / 2; }, () => window.__nlw.habitation && window.__nlw.habitation.state().built, 20000, habDetail);
// 3. back in the town, then up to it again (built a second time)
await timed('back in the town (the habitation let go)', () => { const n = window.__nlw; n.place(-37, 94); }, () => window.__nlw.habitation && !window.__nlw.habitation.state().built);
await timed('the habitation built again', () => { const n = window.__nlw; n.place(262, 113); }, () => window.__nlw.habitation && window.__nlw.habitation.state().built, 20000, habDetail);
// 4. the gun out, and the first round
await page.evaluate(() => { const n = window.__nlw; n.place(-37, 94); });
await page.waitForTimeout(5000);
await timed('the gun taken out', () => { window.__nlw.gunPlay.act('gun', 'down'); }, () => window.__nlw.gunPlay.out && window.__nlw.gunPlay.stats !== undefined);
await timed('the first round fired', () => { const g = window.__nlw.gunPlay; g.act('shoot', 'down'); setTimeout(() => g.act('shoot', 'up'), 400); }, () => window.__nlw.gunPlay.stats.fired > 0);
writeFileSync(resolve(out, `one-shots-${LABEL}.json`), JSON.stringify({ site: SITE, throttle: THROTTLE, results }, null, 1));
await browser.close();
server.close();
process.exit(0);
