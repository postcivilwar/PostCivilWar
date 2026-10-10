// A character taken from one browser to another that shares nothing with it, in real browsers: the browser an
// iPhone player made their character in, and the game installed on the home screen, which the phone keeps apart.
//   node test/carry.mjs [output-directory]
// Needs Playwright with Chromium, and `node build.mjs` first. Not part of the unit tests.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, extname } from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, '../dist/site');
const out = resolve(process.argv[2] || resolve(here, '../dist/shots'));
mkdirSync(out, { recursive: true });
if (!existsSync(resolve(site, 'sw.js'))) { console.error('dist/site/ is not built: run node build.mjs'); process.exit(2); }

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const name = path === '/' ? 'index.html' : path.slice(1);
  const file = resolve(site, name);
  if (name.includes('..') || !existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(name)] || 'application/octet-stream', 'cache-control': 'public, max-age=0, must-revalidate' });
  res.end(readFileSync(file));
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const origin = `http://localhost:${server.address().port}`;

const problems = [];
const bad = (text) => { problems.push(text); console.log(`  PROBLEM: ${text}`); };
const say = (text) => console.log(text);
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
// One place a game can be: a browser with storage of its own. `clipboard`: whether it lets a page read what was copied.
async function place(name, { clipboard }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, userAgent: IPHONE, permissions: clipboard ? ['clipboard-read', 'clipboard-write'] : [] });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  page.on('console', (m) => { if (m.type() === 'error') bad(`${name}: console: ${m.text()}`); });
  page.on('pageerror', (e) => bad(`${name}: ${e.message}`));
  const ready = () => page.waitForFunction(() => !!(window.__nlw && window.__nlw.ready), null, { timeout: 300000 });
  const inTown = () => page.waitForFunction(() => window.__nlw && window.__nlw.view && window.__nlw.view.self && !document.querySelector('#hud').hidden, null, { timeout: 120000 });
  return { context, page, ready, inTown };
}
const who = (page) => page.evaluate(() => { const s = window.__nlw.view.self; return { name: s.name, balance: s.balance, path: s.path, day: document.querySelector('#hud-day').textContent, x: Math.round(s.x), z: Math.round(s.z) }; });
const start = (page) => page.evaluate(() => ({ install: !document.querySelector('#start-install').hidden, bring: !document.querySelector('#bring').hidden, resume: !document.querySelector('#continue').hidden, label: document.querySelector('#continue').textContent, panel: !document.querySelector('#bring-panel').hidden, error: document.querySelector('#bring-error').hidden ? '' : document.querySelector('#bring-error').textContent }));

// ---- 1. the browser: a character is made, plays a little, and is copied in Settings ----
say('1. in the browser');
const safari = await place('browser', { clipboard: true });
await safari.page.goto(`${origin}/#nointro`, { timeout: 300000 });
await safari.ready();
let s = await start(safari.page);
if (!s.bring || s.resume) bad(`a new player is not offered to bring a character (${JSON.stringify(s)})`);
if (s.panel) bad('the way to bring a character is open before it is asked for');
if (!s.install) bad('a new player in the browser on an iPhone is not told to install first');
await safari.page.screenshot({ path: resolve(out, 'carry-01-new-player.png'), fullPage: false });
await safari.page.fill('#name', 'Adaeze Okeke');
await safari.page.tap('#paths [data-path="villain"]');
await safari.page.tap('#enter');
await safari.inTown();
// some time passes, and something is paid for, so there is more to carry than a name
await safari.page.evaluate(() => { window.__nlw.skip(3); });
const made = await who(safari.page);
say(`   ${JSON.stringify(made)}`);
await safari.page.evaluate(() => window.__nlw.ui.openPhone('settings'));
await safari.page.waitForSelector('#copy-character:not([disabled])');
await safari.page.evaluate(() => document.querySelector('#copy-character').scrollIntoView({ block: 'center' }));
const told = await safari.page.evaluate(() => ({ device: document.querySelector('#ondevice').nextElementSibling.textContent, character: document.querySelector('#copy-character').closest('.rows').nextElementSibling.textContent }));
if (!/An iPhone keeps the installed game apart/.test(told.device) || !/Copy under Your character/.test(told.device)) bad(`on an iPhone, Settings does not say how to take the character into the installed game: ${told.device}`);
if (!/no accounts yet/.test(told.character)) bad(`Settings does not say why a character has to be carried: ${told.character}`);
await safari.page.screenshot({ path: resolve(out, 'carry-02-settings-copy.png') });
await safari.page.tap('#copy-character');
await safari.page.waitForFunction(() => document.querySelector('#copy-character').textContent === 'Copied', null, { timeout: 10000 }).catch(() => bad('Copy did not say Copied'));
const code = await safari.page.evaluate(() => navigator.clipboard.readText());
say(`   the code: ${code.length} characters, ${code.slice(0, 24)}…`);
if (!/^PCW1\.[A-Za-z0-9_-]+$/.test(code)) bad('what was copied is not a character code');
// a place that has a character never offers to bring another over it
await safari.page.evaluate(() => window.__nlw.saveNow());
await safari.page.reload({ timeout: 300000 });
await safari.ready();
s = await start(safari.page);
if (s.bring || !s.resume) bad(`a place that already has a character offers to bring one (${JSON.stringify(s)})`);
if (s.install) bad('a player who already has a character here is told to install before making one');
await safari.context.close();

// ---- 2. the installed game: storage of its own, no character; the code is pasted ----
say('2. in the installed game');
const app = await place('installed', { clipboard: true });
await app.page.goto(`${origin}/#nointro`, { timeout: 300000 });
await app.ready();
s = await start(app.page);
if (!s.bring || s.resume) bad(`the installed game, which has no character, does not offer to bring one (${JSON.stringify(s)})`);
await app.page.tap('#bring-open');
await app.page.evaluate(() => document.querySelector('#bring-panel').scrollIntoView({ block: 'center' }));
await app.page.screenshot({ path: resolve(out, 'carry-03-bring.png') });
// something that is not a code first: said so, and nothing changes
await app.page.fill('#bring-code', 'my shopping list');
await app.page.tap('#bring-go');
await app.page.waitForFunction(() => !document.querySelector('#bring-error').hidden);
s = await start(app.page);
if (!/not a character code/.test(s.error) || s.resume) bad(`a wrong code: ${JSON.stringify(s)}`);
await app.page.evaluate((text) => navigator.clipboard.writeText(text), code);
await Promise.all([app.page.waitForEvent('load', { timeout: 300000 }), app.page.tap('#bring-paste')]);
await app.ready();
s = await start(app.page);
say(`   after pasting: ${JSON.stringify({ resume: s.resume, label: s.label, bring: s.bring })}`);
if (!s.resume || s.label !== 'Continue as Adaeze Okeke' || s.bring) bad(`the character did not arrive: ${JSON.stringify(s)}`);
if (await app.page.evaluate(() => !!document.querySelector('#intro'))) bad('the opening played a second time after the character arrived');
await app.page.evaluate(() => document.querySelector('#continue').scrollIntoView({ block: 'center' }));
await app.page.screenshot({ path: resolve(out, 'carry-04-arrived.png') });
await app.page.tap('#continue');
await app.inTown();
const arrived = await who(app.page);
say(`   ${JSON.stringify(arrived)}`);
if (JSON.stringify(arrived) !== JSON.stringify(made)) bad(`the character that arrived is not the one that left: ${JSON.stringify(made)} became ${JSON.stringify(arrived)}`);
await app.page.screenshot({ path: resolve(out, 'carry-05-in-town.png') });
await app.context.close();

// ---- 3. a browser that will not hand over what was copied: the box, by hand ----
say('3. pasting by hand');
const strict = await place('by hand', { clipboard: false });
await strict.page.goto(`${origin}/#nointro`, { timeout: 300000 });
await strict.ready();
await strict.page.tap('#bring-open');
await strict.page.tap('#bring-paste');
await strict.page.waitForFunction(() => !document.querySelector('#bring-error').hidden);
s = await start(strict.page);
if (!/Press and hold in the box/.test(s.error)) bad(`a browser that will not paste is not told what to do: ${s.error}`);
// as a message app might leave it: broken over lines
await strict.page.fill('#bring-code', code.match(/.{1,60}/g).join('\n'));
await Promise.all([strict.page.waitForEvent('load', { timeout: 300000 }), strict.page.tap('#bring-go')]);
await strict.ready();
s = await start(strict.page);
if (s.label !== 'Continue as Adaeze Okeke') bad(`by hand, the character did not arrive: ${JSON.stringify(s)}`);
await strict.context.close();

await browser.close();
server.close();
if (problems.length) { console.log(`\n${problems.length} problem(s):`); for (const p of problems) console.log(` - ${p}`); process.exit(1); }
console.log('\nA character made in one place arrives in another, the same.');
