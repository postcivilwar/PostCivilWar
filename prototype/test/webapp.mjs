// The website as an app, in a real browser: serves dist/site/ the way the host does, with the game's own server
// behind it, opens it on a phone-sized screen, lets its worker settle, checks the browser would install it,
// makes an account (nobody plays on the website without one), then takes the network away and plays.
//   ../server/with-postgres.sh node test/webapp.mjs [output-directory]
// Needs Playwright with Chromium, a database (with-postgres.sh starts a throwaway one), and `node build.mjs`
// first. Not part of the unit tests.
import { pastQuestion, enterTown, overTown } from './start.mjs';
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
if (!process.env.PCW_DATABASE_URL) { console.error('PCW_DATABASE_URL is not set: run this with ../server/with-postgres.sh'); process.exit(2); }
const game = require('../../api/game.js');      // the very function the host runs

// ---- the host, in small: each file with its type, a fingerprint to ask again by, and the host's caching rules
// (vercel.json: the files the page asks for by their fingerprint are kept by the browser for a year) ----
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.json': 'application/json', '.gz': 'application/gzip', '.glb': 'model/gltf-binary' };
const cacheRule = (name) => (/^(reactions\.json|three\.min\.js|game\.js|.*\.bin\.gz|cover\/.*|figures\/.*)$/.test(name) ? 'public, max-age=31536000, immutable' : name.startsWith('assets/') ? 'public, max-age=604800' : 'public, max-age=0, must-revalidate');
const overrides = new Map();          // a file changed on the server, as a new build would
const sent = [];                      // every answer: [path, status, bytes]
let serverUp = true;
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const name = path === '/' ? 'index.html' : path.slice(1);
  if (!serverUp) { req.socket.destroy(); return; }
  // the host also answers for the game's server: the very function it runs (api/game.js), on this machine's database
  if (path === '/api/game') { sent.push([path, 200, 0]); game(req, res); return; }
  const file = resolve(site, name);
  if (name.includes('..') || !(overrides.has(name) || existsSync(file))) { sent.push([path, 404, 0]); res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found'); return; }
  const body = overrides.has(name) ? Buffer.from(overrides.get(name)) : readFileSync(file);
  const etag = `"${createHash('sha1').update(body).digest('hex')}"`;
  const headers = { 'content-type': TYPES[extname(name)] || 'application/octet-stream', etag, 'cache-control': cacheRule(name) };
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
let offline = false, cutting = false;
// (the browser's own line for a request cut off as the connection went is weighed against those requests below)
let cutOff = 0, cutLines = 0;
page.on('console', (m) => { if (m.type() !== 'error') return; if (/^Failed to load resource: net::ERR_INTERNET_DISCONNECTED$/.test(m.text())) { cutLines += 1; return; } bad(`console${offline ? ' (offline)' : ''}: ${m.text()}`); });
page.on('pageerror', (e) => bad(`page error: ${e.message}`));
// (a question to the game's server that the page was asking as it was navigated away from is not a failure of anything;
// nor is a file that was still coming when the connection was taken away, and the page reloaded: the game asking, with
// no connection, for what it cannot have is what is looked for, and that is a request begun while there was none)
const begunOffline = new WeakSet();
page.on('request', (r) => { if (offline) begunOffline.add(r); });
page.on('requestfailed', (r) => {
  const why = r.failure() ? r.failure().errorText : '';
  if (/\/api\/game$/.test(r.url()) && why === 'net::ERR_ABORTED') return;
  if ((offline || cutting) && !begunOffline.has(r)) { cutOff += 1; say(`   (still coming when the connection went, and cut off: ${r.url()}, ${why})`); return; }
  bad(`request failed${offline ? ' (offline)' : ''}: ${r.url()} (${why})`);
});

// Taking the connection away. What the page had begun asking as it went is cut off, which is not the page asking for
// what it cannot have: it is held to that once it has been told the connection is gone (navigator.onLine).
const goOffline = async () => {
  serverUp = false; cutting = true;
  await context.setOffline(true);
  await page.waitForFunction(() => navigator.onLine === false, null, { timeout: 10000 }).catch(() => {});
  offline = true; cutting = false;
};
// the game's own word that the town is made (since 20 October 2026 it is built once the player goes into it)
const townReady = () => page.waitForFunction(() => !!(window.__nlw && window.__nlw.ready), null, { timeout: 300000 });
// a figure's light copy (build.mjs): the files a phone fetches for it, beside the page, and how many bytes they are
const lightOf = (id) => page.evaluate((which) => { const f = window.__PCW_FIGURES.figures[which]; const bare = (u) => u.split('?')[0]; const pictures = f.pictures.map((p) => { const sizes = Object.keys(p.sizes).map(Number).sort((a, b) => a - b); return p.sizes[sizes.filter((n) => n <= 1024).pop() || sizes[0]]; }); return { files: [bare(f.model), ...pictures.map(([u]) => bare(u)), bare(f.moves[0])], bytes: f.bytes + pictures.reduce((n, [, b]) => n + b, 0) }; }, id);
// has the figure arrived, whole, on this page: what the game's own record of each figure it fetched says
const figureHere = (id) => page.waitForFunction((which) => (window.__nlw.figureLog() || []).find((r) => r.id === which && (r.readyMs !== undefined || r.failed)), id, { timeout: 300000 }).then((h) => h.jsonValue(), () => null);
const figureOfFile = (path) => { const m = /^\/figures\/([^.]+)\./.exec(path); return m ? m[1] : null; };
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
// (the library the build carries: three.js r186 since 23 October 2026, vendor/three.symbols.json)
const carried = JSON.parse(readFileSync(resolve(here, '../vendor/three.symbols.json'), 'utf8')).revision;
if (doc.three !== 'object' || doc.revision !== carried) bad(`the 3D library: ${doc.three} ${doc.revision}, where the build carries r${carried}`);
if (doc.scripts.some((s) => !s.startsWith(origin))) bad(`a script from another site: ${doc.scripts}`);
if (doc.framed) bad('the page thinks it is in a frame');
if (doc.overscroll !== 'none') bad(`pulling down would reload the page (${doc.overscroll})`);
// the first figure, the woman (W1), as her light copy (a phone's: her pictures at 1024): fetched ahead once the cover
// is up, and kept; she is drawn once the player is past the account gate (below)
const woman = await lightOf('W1');
if (woman.bytes > 3 * 1048576) bad(`the woman's light copy is ${woman.bytes} bytes`);
const coverFiles = await page.evaluate(() => [...document.querySelectorAll('link[rel="preload"][as="image"]')].map((l) => l.getAttribute('href').split('?')[0]));
const kept1 = await waitKept(woman.files[0]);
say(`   kept after the first visit: ${JSON.stringify(kept1)}`);
for (const need of ['', 'three.min.js', 'game.js', 'manifest.webmanifest', 'icon-192.png', ...coverFiles, ...woman.files]) if (!kept1 || !kept1.includes(need)) bad(`not kept after the first visit: ${need || 'the page'}`);
// the figures either side of her are fetched ahead (the brief: "prefetch the next and previous figures") but not kept;
// no other figure is fetched at all
const fetchedFigures = [...new Set(sent.filter(([p, st]) => st === 200 && figureOfFile(p)).map(([p]) => figureOfFile(p)))];
const womanStem = woman.files[0].split('/')[1].split('.')[0];
if (!fetchedFigures.includes(womanStem) || fetchedFigures.length > 3) bad(`figures fetched on the first visit: ${fetchedFigures.join(', ')}`);
if (kept1 && kept1.some((k) => k.startsWith('figures/') && !woman.files.includes(k))) bad(`a figure was kept though it is not hers: ${kept1.filter((k) => k.startsWith('figures/') && !woman.files.includes(k))}`);
// nothing was sent twice: the worker keeps what the page fetched, as the page fetched it
for (const path of ['/', '/three.min.js', '/game.js', ...coverFiles.map((f) => `/${f}`), ...woman.files.map((f) => `/${f}`)]) if (bytesOf(path) !== 1) bad(`${path} was sent in full ${bytesOf(path)} times on a first visit`);
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
say('3. an account, and into the town');
// the website is shut to anyone without an account: no name to fill in, no way in
const shut = await page.evaluate(() => { const seen = (sel) => { const e = document.querySelector(sel); const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }; return { gate: document.querySelector('#start').dataset.gate, name: seen('#name'), enter: seen('#enter'), signup: seen('#open-signup'), login: seen('#open-login'), may: window.__nlw.mayEnter(), wide: document.documentElement.scrollWidth > document.documentElement.clientWidth }; });
if (shut.gate !== 'shut' || shut.name || shut.enter || shut.may || !shut.signup || !shut.login) bad(`before an account is made the start screen is ${JSON.stringify(shut)}`);
if (shut.wide) bad('the shut start screen scrolls sideways on a phone');
await page.screenshot({ path: resolve(out, 'webapp-01b-account-first.png') });
const username = `App_${Math.random().toString(36).slice(2, 8)}`;
// (asking the game whether the town may be entered is what pressing Enter does: it answers no and opens the account page)
if (await page.isVisible('#account')) { await page.tap('#account-back'); await page.waitForSelector('#account', { state: 'hidden' }); }
await page.tap('#open-signup');
await page.fill('#account-username', username); await page.fill('#account-password', 'a password for the app test');
await page.tap('#account-submit');
await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 60000 });
await page.waitForSelector('#account', { state: 'hidden' });
// a new account: hero or villain, once; then the character, once, and asked to be sure
await pastQuestion(page, 'hero');
const first = await figureHere('W1');
if (!first || first.failed || first.bytes !== woman.bytes) bad(`the woman arrived as ${JSON.stringify(first)}, not the ${woman.bytes} bytes of her light copy`);
for (const path of woman.files.map((f) => `/${f}`)) if (bytesOf(path) !== 1) bad(`${path} was sent in full ${bytesOf(path)} times (she was fetched ahead and kept: drawing her fetches nothing again)`);
await page.fill('#name', 'Adaeze Okeke');
const sure = await enterTown(page, { tap: true });
if (sure.title !== 'Choose Adaeze?' || sure.yes !== 'Choose This Character') bad(`choosing a character asked ${JSON.stringify(sure)}`);
await page.waitForFunction(() => window.__nlw && window.__nlw.view && window.__nlw.view.self && !document.querySelector('#hud').hidden, null, { timeout: 300000 });
await townReady();
// the town is built from the two kits and the townspeople's reactions, files of their own beside the page, kept too
const kept2 = await waitKept('reactions.json');
for (const need of ['kit.bin.gz', 'vehicles.bin.gz', 'reactions.json']) if (!kept2 || !kept2.includes(need)) bad(`not kept once in town: ${need}`);
for (const path of ['/kit.bin.gz', '/vehicles.bin.gz', '/reactions.json']) if (bytesOf(path) !== 1) bad(`${path} was sent in full ${bytesOf(path)} times`);
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
await goOffline();
const before = sent.length;
await page.goto(`${origin}/`, { timeout: 300000 }).catch((e) => bad(`with no connection the page did not open: ${e.message}`));
await page.waitForSelector('#intro[data-stage="splash"] .wordmark', { timeout: 120000 }).catch(() => bad('with no connection the opening did not appear'));
await page.screenshot({ path: resolve(out, 'webapp-04-offline-opening.png') });
// someone who has signed in on this device may carry on with their own character; they are told how things stand
await page.waitForFunction(() => window.__nlw.online.status().state === 'down', null, { timeout: 60000 }).catch(() => bad('with no connection the game does not notice the server is out of reach'));
const back = await page.evaluate(() => ({ three: typeof THREE, gate: document.querySelector('#start').dataset.gate, may: window.__nlw.mayEnter(), note: document.querySelector('#account-note').hidden ? '' : document.querySelector('#account-note').textContent }));
if (back.gate !== 'open' || !back.may) bad(`with no connection a player who had signed in here is shut out (${back.gate})`);
if (!back.note.includes(username) || !/no connection/i.test(back.note)) bad(`with no connection the start screen says "${back.note}"`);
if (sent.length !== before) bad('something reached the server while there was no connection');
await page.waitForSelector('#intro[data-stage="cover"] #cover-play', { timeout: 30000 }).catch(() => bad('with no connection the cover never took the splash\'s place'));
await page.screenshot({ path: resolve(out, 'webapp-05-offline-ready.png') });
// PLAY: their own character, as they left it, straight into the town. Nothing to choose and nothing asked.
await page.tap('#cover-play');
await page.waitForFunction(() => window.__nlw.view && window.__nlw.playerId && !document.querySelector('#hud').hidden, null, { timeout: 300000 }).catch(() => bad('with no connection the player was not taken into the town'));
await townReady().catch(() => bad('with no connection the town was never ready'));
const again = await figureHere('W1');
if (!again || again.failed || again.bytes !== woman.bytes) bad(`with no connection the woman arrived as ${JSON.stringify(again)}`);
const home = await page.evaluate(() => ({ name: window.__nlw.view ? window.__nlw.view.self.name : null, figure: window.__nlw.view ? window.__nlw.view.self.look.figure : null, start: !document.querySelector('#start').hidden, asked: window.__nlw.intro.log.path }));
if (home.name !== 'Adaeze Okeke' || home.figure !== 'W1' || home.start || home.asked !== null) bad(`with no connection the player came back as ${JSON.stringify(home)}`);
{ const over = await page.evaluate(overTown); if (over) bad(`with no connection the player is in town, but ${over}`); }
if (sent.length !== before) bad('something reached the server while there was no connection (after PLAY)');
await page.screenshot({ path: resolve(out, 'webapp-05b-offline-in-town.png') });
offline = false;

// ---- 5. the game is brought up to date: with a connection the new page, at once ----
say('5. a new version');
const pageNow = readFileSync(resolve(site, 'index.html'), 'utf8');
overrides.set('index.html', pageNow.replace('<title>PostCivilWar</title>', '<title>PostCivilWar</title><meta name="pcw-build" content="two">'));
serverUp = true;
await context.setOffline(false);
const sentBefore = { three: bytesOf('/three.min.js'), game: bytesOf('/game.js'), woman: bytesOf(`/${woman.files[0]}`) };
await page.goto(`${origin}/?again=1#nointro`, { timeout: 300000 });
const build = await page.evaluate(() => (document.querySelector('meta[name=pcw-build]') || {}).content || null);
if (build !== 'two') bad('with a connection the page was not the newest');
await townReady();
if (bytesOf('/three.min.js') !== sentBefore.three || bytesOf('/game.js') !== sentBefore.game || bytesOf(`/${woman.files[0]}`) !== sentBefore.woman) bad('a file that had not changed was sent again');
await page.waitForTimeout(1500);
// and without one, the newest it has seen
await goOffline();
await page.reload({ timeout: 300000 }).catch((e) => bad(`offline after an update: ${e.message}`));
const buildOff = await page.evaluate(() => (document.querySelector('meta[name=pcw-build]') || {}).content || null);
if (buildOff !== 'two') bad(`with no connection the page was not the newest seen (${buildOff})`);
await townReady().catch(() => bad('offline after an update the town was never ready'));
offline = false;

await context.close();
server.close();
await require('../../api/_lib/db.js').closeDatabase();
rmSync(profile, { recursive: true, force: true });
say(`sent in full by the server: the page ${bytesOf('/')} times, the 3D library ${bytesOf('/three.min.js')}, the game's script ${bytesOf('/game.js')}, the woman's model ${bytesOf(`/${woman.files[0]}`)}, the kits ${bytesOf('/kit.bin.gz')} and ${bytesOf('/vehicles.bin.gz')}`);
if (cutLines > cutOff) bad(`the browser said ${cutLines} request(s) failed with no connection, ${cutLines - cutOff} more than were cut off as it went`);
if (problems.length) { console.log(`\n${problems.length} problem(s):`); for (const p of problems) console.log(` - ${p}`); process.exit(1); }
console.log('\nThe website installs, keeps itself, asks for an account, and then plays with no connection.');
process.exit(0);
