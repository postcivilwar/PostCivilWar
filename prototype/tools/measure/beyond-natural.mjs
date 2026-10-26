// The land beyond the town as the game puts it in by itself (a few seconds after the town is warmed up), timed on a
// phone's settings from the moment the town is warmed up until it is in and twenty seconds after: the page's longest
// task in that time, and the worst frame. (one-shots.mjs times it when asked for; this, as it comes.)
//   ../server/with-postgres.sh node tools/measure/beyond-natural.mjs <out folder> [site folder]
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

await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
await page.waitForFunction(() => { const w = window.__nlw.warmUp; return window.__nlw.beyond || (w && w.stats && w.stats.left === 0 && w.stats.meshes > 0); }, null, { timeout: 1800000, polling: 1000 });
const before = await page.evaluate(() => ({ t: performance.now(), frames: window.__shots.frames.length, beyond: !!window.__nlw.beyond }));
const t0 = Date.now();
await page.waitForFunction(() => window.__nlw.beyond, null, { timeout: 1800000, polling: 500 });
const doneMs = Date.now() - t0;
await page.waitForTimeout(20000);
const after = await page.evaluate((b) => {
  const S = window.__shots, f = S.frames.slice(Math.max(0, b.frames - 1)), d = [];
  for (let i = 1; i < f.length; i += 1) d.push(f[i] - f[i - 1]);
  const long = S.long.filter((x) => x[0] >= b.t - 50);
  return { longest: long.reduce((a, x) => Math.max(a, x[1]), 0), longN: long.length, worstFrame: d.length ? Math.round(Math.max(...d)) : null, frames: d.length, steps: window.__nlw.beyondSteps || null };
}, before);
const row = { name: 'the land beyond the town, as it comes', builtBeforeWatched: before.beyond, doneMs, ...after };
console.log(JSON.stringify(row));
writeFileSync(resolve(out, `beyond-natural-${LABEL}.json`), JSON.stringify(row, null, 1));
await browser.close(); server.close(); process.exit(0);
