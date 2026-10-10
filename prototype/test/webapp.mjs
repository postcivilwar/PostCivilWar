// The website as an app, in a real browser: serves dist/site/ the way the host does, opens it on a phone-sized
// screen, lets its worker settle, checks the browser would install it, then takes the network away and plays.
//   node test/webapp.mjs [output-directory]
// Needs Playwright with Chromium, and `node build.mjs` first. Not part of the unit tests.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, extname, join } from 'node:path';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, '../dist/site');
const out = resolve(process.argv[2] || resolve(here, '../dist/shots'));
mkdirSync(out, { recursive: true });
if (!existsSync(resolve(site, 'sw.js'))) { console.error('dist/site/ is not built: run node build.mjs'); process.exit(2); }

// ---- the host, in small: each file with its type, a fingerprint to ask again by, and the host's caching rules ----
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const overrides = new Map();          // a file changed on the server, as a new build would
const sent = [];                      // every answer: [path, status, bytes]
let serverUp = true;
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const name = path === '/' ? 'index.html' : path.slice(1);
  if (!serverUp) { req.socket.destroy(); return; }
  // the host also answers for the game's server (api/game.js); here, as on a site that has been given no database
  if (path === '/api/game') { sent.push([path, 200, 0]); res.writeHead(req.method === 'GET' ? 200 : 503, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(req.method === 'GET' ? { ok: true, service: 'postcivilwar', accounts: false } : { ok: false, code: 'NO_DATABASE', message: 'Accounts are not set up on this site yet.' })); return; }
  const file = resolve(site, name);
  if (name.includes('..') || !(overrides.has(name) || existsSync(file))) { sent.push([path, 404, 0]); res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found'); return; }
  const body = overrides.has(name) ? Buffer.from(overrides.get(name)) : readFileSync(file);
  const etag = `"${createHash('sha1').update(body).digest('hex')}"`;
  const headers = { 'content-type': TYPES[extname(name)] || 'application/octet-stream', etag, 'cache-control': name.endsWith('.b64.txt') ? 'public, max-age=3600' : 'public, max-age=0, must-revalidate' };
  if (req.headers['if-none-match'] === etag) { sent.push([path, 304, 0]); res.writeHead(304, headers); res.end(); return; }
  sent.push([path, 200, body.length]);
  res.writeHead(200, headers); res.end(body);
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const origin = `http://localhost:${server.address().port}`;
const bytesOf = (path) => sent.filter(([p, s]) => p === path && s === 200).length;

const problems = [];
const bad = (text) => { problems.push(text); console.log(`  PROBLEM: ${text}`); };
const say = (text) => console.log(text);

// One player's browser, kept between visits: a profile on disk, a phone's screen, touch.
const profile = mkdtempSync(join(tmpdir(), 'pcw-webapp-'));
const context = await chromium.launchPersistentContext(profile, {
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
});
const page = context.pages()[0] || await context.newPage();
page.setDefaultTimeout(120000);
let offline = false;
page.on('console', (m) => { if (m.type() === 'error') bad(`console${offline ? ' (offline)' : ''}: ${m.text()}`); });
page.on('pageerror', (e) => bad(`page error: ${e.message}`));
// (a question to the game's server that the page was asking as it was navigated away from is not a failure of anything)
page.on('requestfailed', (r) => { if (/\/api\/game$/.test(r.url()) && r.failure() && r.failure().errorText === 'net::ERR_ABORTED') return; bad(`request failed${offline ? ' (offline)' : ''}: ${r.url()}`); });

// the game's own word that the town is made and can be entered (the button exists before the game has started)
const townReady = () => page.waitForFunction(() => !!(window.__nlw && window.__nlw.ready), null, { timeout: 300000 });
const figureHere = (id) => page.evaluate((which) => Promise.resolve(window.__PCW_FIGURE_BYTES[which]).then((b) => b.byteLength, (e) => `failed: ${e.message}`), id);
const keptByWorker = () => page.evaluate(() => new Promise((resolve) => {
  navigator.serviceWorker.ready.then((r) => { const c = new MessageChannel(); c.port1.onmessage = (e) => resolve(e.data.paths.slice().sort()); r.active.postMessage({ type: 'kept' }, [c.port2]); });
  setTimeout(() => resolve(null), 8000);
}));
const waitKept = async (path) => { for (let i = 0; i < 60; i += 1) { const k = await keptByWorker(); if (k && k.includes(path)) return k; await page.waitForTimeout(500); } return keptByWorker(); };

// ---- 1. a first visit, with a connection ----
say('1. first visit');
await page.goto(`${origin}/#nointro`, { timeout: 300000 });
const doc = await page.evaluate(() => ({
  mode: document.compatMode, width: innerWidth, layout: document.documentElement.clientWidth, margin: getComputedStyle(document.body).margin, title: document.title, lang: document.documentElement.lang,
  charset: document.characterSet, manifest: (document.querySelector('link[rel=manifest]') || {}).href, theme: (document.querySelector('meta[name=theme-color]') || {}).content, three: typeof THREE, revision: typeof THREE === 'object' ? THREE.REVISION : null,
  scripts: [...document.scripts].map((s) => s.src).filter(Boolean), framed: document.documentElement.classList.contains('framed'), overscroll: getComputedStyle(document.documentElement).overscrollBehaviorY,
}));
if (doc.mode !== 'CSS1Compat') bad(`the page is read by the old rules (${doc.mode})`);
if (doc.width !== 390 || doc.layout !== 390) bad(`a phone 390 wide lays the page out ${doc.layout} wide (window ${doc.width})`);
if (doc.margin !== '0px') bad(`the page has a margin of ${doc.margin}`);
if (doc.title !== 'PostCivilWar' || doc.lang !== 'en' || doc.charset !== 'UTF-8') bad(`title, language, characters: ${doc.title}, ${doc.lang}, ${doc.charset}`);
if (doc.three !== 'object' || doc.revision !== '128') bad(`the 3D library: ${doc.three} ${doc.revision}`);
if (doc.scripts.some((s) => !s.startsWith(origin))) bad(`a script from another site: ${doc.scripts}`);
if (doc.framed) bad('the page thinks it is in a frame');
if (doc.overscroll !== 'none') bad(`pulling down would reload the page (${doc.overscroll})`);
await townReady();
const first = await figureHere('W1');
if (first !== 9852308) bad(`the woman arrived as ${first} bytes, not the 9,852,308 that were supplied`);
const kept1 = await waitKept('woman.b64.txt');
say(`   kept after the first visit: ${JSON.stringify(kept1)}`);
for (const need of ['', 'three.min.js', 'woman.b64.txt', 'manifest.webmanifest', 'icon-192.png']) if (!kept1 || !kept1.includes(need)) bad(`not kept after the first visit: ${need || 'the page'}`);
if (kept1 && kept1.includes('man.b64.txt')) bad('the man was kept though he was never used');
if (bytesOf('/man.b64.txt')) bad('the man was fetched though he was never used');
// nothing large was sent twice: the worker asked again and was told it had not changed
for (const path of ['/', '/three.min.js', '/woman.b64.txt']) if (bytesOf(path) !== 1) bad(`${path} was sent in full ${bytesOf(path)} times on a first visit`);
await page.screenshot({ path: resolve(out, 'webapp-01-first-visit.png') });

// ---- 2. would the browser install it ----
say('2. installable');
const cdp = await context.newCDPSession(page);
const manifest = await cdp.send('Page.getAppManifest');
if (!manifest.url || !manifest.url.endsWith('/manifest.webmanifest')) bad(`the browser found no manifest (${manifest.url})`);
if (manifest.errors && manifest.errors.length) bad(`the manifest has errors: ${JSON.stringify(manifest.errors)}`);
const parsed = JSON.parse(manifest.data || '{}');
if (parsed.name !== 'PostCivilWar' || parsed.display !== 'fullscreen') bad(`the manifest the browser read: ${parsed.name}, ${parsed.display}`);
const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
say(`   what stands in the way of installing: ${JSON.stringify(installabilityErrors.map((e) => e.errorId))}`);
// a test browser is never "a place to install into"; anything about the manifest, the icons or the worker is ours
for (const e of installabilityErrors) if (!['in-incognito', 'platform-not-supported-on-android', 'not-from-secure-origin'].includes(e.errorId)) bad(`cannot be installed: ${e.errorId} ${JSON.stringify(e.errorArguments)}`);
const icons = await page.evaluate(async () => { const m = await (await fetch('manifest.webmanifest')).json(); const out = []; for (const i of m.icons) { const img = new Image(); img.src = i.src; await img.decode(); out.push([i.src, `${img.naturalWidth}x${img.naturalHeight}`, i.sizes]); } return out; });
for (const [src, real, said] of icons) if (real !== said) bad(`${src} is ${real}, the manifest says ${said}`);

// ---- 3. into the town, and Settings says what is true ----
say('3. in the town');
await page.fill('#name', 'Adaeze Okeke');
await page.tap('#enter');
await page.waitForFunction(() => window.__nlw && window.__nlw.view && window.__nlw.view.self && !document.querySelector('#hud').hidden, null, { timeout: 120000 });
await page.evaluate(() => window.__nlw.ui.openPhone('settings'));
await page.waitForSelector('#ondevice');
await page.waitForFunction(() => /Plays without a connection\s*Yes/.test(document.querySelector('#ondevice').textContent), null, { timeout: 30000 }).catch(() => {});
const device = await page.evaluate(() => { const el = document.querySelector('#ondevice'); el.scrollIntoView({ block: 'center' }); return { text: `${el.previousElementSibling.textContent} | ${el.textContent} | ${el.nextElementSibling.textContent}`, install: !!document.querySelector('#install-app') }; });
say(`   Settings: ${device.text}`);
if (!/^This device \|/.test(device.text) || !/Plays without a connection\s*Yes/.test(device.text)) bad(`Settings does not say the game plays without a connection: ${device.text}`);
// this browser has made no offer, so no Install button is shown
if (device.install) bad('Settings offers Install though the browser has not');
await page.screenshot({ path: resolve(out, 'webapp-02-settings.png') });
// the browser offers: the button appears, and pressing it asks the browser, once
await page.evaluate(() => { window.__asked = 0; window.__PCW_INSTALL = { prompt() { window.__asked += 1; }, userChoice: Promise.resolve({ outcome: 'accepted' }) }; window.__nlw.ui.openPhone(null); window.__nlw.ui.openPhone('settings'); });
await page.waitForSelector('#install-app');
await page.evaluate(() => document.querySelector('#install-app').scrollIntoView({ block: 'center' }));
await page.screenshot({ path: resolve(out, 'webapp-03-install-offered.png') });
await page.tap('#install-app');
await page.waitForFunction(() => !document.querySelector('#install-app'));
if ((await page.evaluate(() => window.__asked)) !== 1) bad('pressing Install did not ask the browser exactly once');
await page.evaluate(() => { window.__nlw.saveNow(); });

// ---- 4. no connection: the game still opens, with the player's character ----
say('4. no connection');
serverUp = false; offline = true;
await context.setOffline(true);
const before = sent.length;
await page.goto(`${origin}/`, { timeout: 300000 }).catch((e) => bad(`with no connection the page did not open: ${e.message}`));
await page.waitForSelector('#intro[data-stage="splash"] .wordmark', { timeout: 120000 }).catch(() => bad('with no connection the opening did not appear'));
await page.screenshot({ path: resolve(out, 'webapp-04-offline-opening.png') });
await townReady().catch(() => bad('with no connection the town was never ready'));
const again = await figureHere('W1');
if (again !== 9852308) bad(`with no connection the woman arrived as ${again}`);
const back = await page.evaluate(() => ({ resume: !document.querySelector('#continue').hidden, label: document.querySelector('#continue').textContent, three: typeof THREE }));
if (!back.resume || !/Adaeze/.test(back.label)) bad(`with no connection the character was not offered back (${back.label})`);
if (sent.length !== before) bad('something reached the server while there was no connection');
await page.waitForSelector('#intro-play.ready, #intro-play:not([tabindex="-1"])', { timeout: 20000 }).catch(() => {});
await page.screenshot({ path: resolve(out, 'webapp-05-offline-ready.png') });
offline = false;

// ---- 5. the game is brought up to date: with a connection the new page, at once ----
say('5. a new version');
const pageNow = readFileSync(resolve(site, 'index.html'), 'utf8');
overrides.set('index.html', pageNow.replace('<title>PostCivilWar</title>', '<title>PostCivilWar</title><meta name="pcw-build" content="two">'));
serverUp = true;
await context.setOffline(false);
const sentBefore = { three: bytesOf('/three.min.js'), woman: bytesOf('/woman.b64.txt') };
await page.goto(`${origin}/?again=1#nointro`, { timeout: 300000 });
const build = await page.evaluate(() => (document.querySelector('meta[name=pcw-build]') || {}).content || null);
if (build !== 'two') bad('with a connection the page was not the newest');
await townReady();
if (bytesOf('/three.min.js') !== sentBefore.three || bytesOf('/woman.b64.txt') !== sentBefore.woman) bad('a file that had not changed was sent again');
await page.waitForTimeout(1500);
// and without one, the newest it has seen
serverUp = false; offline = true;
await context.setOffline(true);
await page.reload({ timeout: 300000 }).catch((e) => bad(`offline after an update: ${e.message}`));
const buildOff = await page.evaluate(() => (document.querySelector('meta[name=pcw-build]') || {}).content || null);
if (buildOff !== 'two') bad(`with no connection the page was not the newest seen (${buildOff})`);
await townReady().catch(() => bad('offline after an update the town was never ready'));
offline = false;

await context.close();
server.close();
rmSync(profile, { recursive: true, force: true });
say(`sent in full by the server: the page ${bytesOf('/')} times, the 3D library ${bytesOf('/three.min.js')}, the woman ${bytesOf('/woman.b64.txt')}, the man ${bytesOf('/man.b64.txt')}`);
if (problems.length) { console.log(`\n${problems.length} problem(s):`); for (const p of problems) console.log(` - ${p}`); process.exit(1); }
console.log('\nThe website installs, keeps itself, and plays with no connection.');
