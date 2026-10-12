// Every screen a player meets, at many sizes and both ways up, in a real browser: nothing cut off at an edge,
// nothing that cannot be reached, no words squeezed out of their button. The window is turned and resized
// without the page being loaded again, as a phone is turned in the hand.
//   ../server/with-postgres.sh node test/fit.mjs [output-directory]
// Needs Playwright with Chromium, a database (with-postgres.sh starts a throwaway one), and `node build.mjs`
// first. Not part of the unit tests.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createDevServer } from '../../server/dev.mjs';
import { overTown } from './start.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
if (!process.env.PCW_DATABASE_URL) { console.error('PCW_DATABASE_URL is not set: run this with ../server/with-postgres.sh'); process.exit(2); }
const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(process.argv[2] || resolve(here, '../dist/shots-fit'));
mkdirSync(out, { recursive: true });

// [name, width, height]: small and large phones upright and on their sides, a short wide phone, tablets both
// ways, a laptop and a desktop
const SIZES = [
  ['phone-small', 320, 568], ['phone', 360, 640], ['phone-tall', 390, 844], ['phone-large', 412, 915],
  ['phone-small-side', 568, 320], ['phone-side', 640, 360], ['phone-side-wide', 800, 360], ['phone-tall-side', 844, 390], ['phone-large-side', 915, 412],
  ['tablet', 768, 1024], ['tablet-side', 1024, 768], ['laptop', 1280, 720], ['desktop', 1600, 900],
];
const SHOTS = new Set(['phone-small', 'phone-tall', 'phone-side', 'phone-side-wide', 'tablet', 'laptop']);

const server = createDevServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
const page = await context.newPage();
page.setDefaultTimeout(180000);
const problems = [];
const bad = (text) => { problems.push(text); console.log(`   PROBLEM: ${text}`); };
page.on('pageerror', (e) => bad(`page error: ${e.message}`));

// What is wrong with what is on the screen now. `whole`: things that must be on the screen entire, without
// scrolling. `reach`: things that must at least be reachable (on the screen, or scrolled to: never cut off above
// the top of the thing that scrolls them). Everything named must fit across; no button's words may spill.
const look = ({ whole = [], reach = [], words = [] }) => page.evaluate(({ whole, reach, words }) => {
  const W = innerWidth, H = innerHeight, wrong = [];
  const seen = (el) => { if (!el) return false; const c = getComputedStyle(el); const r = el.getBoundingClientRect(); return c.display !== 'none' && c.visibility !== 'hidden' && r.width > 0 && r.height > 0 && !el.closest('[hidden]'); };
  const scroller = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const c = getComputedStyle(p); if (/(auto|scroll)/.test(c.overflowY) && p.scrollHeight > p.clientHeight + 1) return p; } return null; };
  const box = (r) => `${Math.round(r.left)},${Math.round(r.top)} to ${Math.round(r.right)},${Math.round(r.bottom)}`;
  for (const sel of [...whole, ...reach]) {
    for (const el of document.querySelectorAll(sel)) {
      if (!seen(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.left < -0.5 || r.right > W + 0.5) wrong.push(`${sel} runs off the side (${box(r)} on ${W} by ${H})`);
      if (whole.includes(sel)) { if (r.top < -0.5 || r.bottom > H + 0.5) wrong.push(`${sel} is not wholly on the screen (${box(r)} on ${W} by ${H})`); continue; }
      // reachable: scrolled to the top, nothing of it may lie above what scrolls it
      const s = scroller(el);
      const top = s ? s.getBoundingClientRect().top : 0;
      const above = r.top + (s ? s.scrollTop : 0) < top - 0.5;
      if (above) wrong.push(`${sel} is cut off above the top and cannot be scrolled to (${box(r)} on ${W} by ${H})`);
      if (!s && (r.top < -0.5 || r.bottom > H + 0.5)) wrong.push(`${sel} is off the screen and nothing scrolls to it (${box(r)} on ${W} by ${H})`);
    }
  }
  for (const sel of words) for (const el of document.querySelectorAll(sel)) { if (seen(el) && (el.scrollWidth > el.clientWidth + 1.5 || el.scrollHeight > el.clientHeight + 1.5)) wrong.push(`the words of ${sel} "${el.textContent.trim().slice(0, 30)}" do not fit in it (${el.scrollWidth} in ${el.clientWidth} wide, ${el.scrollHeight} in ${el.clientHeight} high, on ${W} by ${H})`); }
  if (document.documentElement.scrollWidth > W + 1) wrong.push(`the page scrolls sideways (${document.documentElement.scrollWidth} wide on ${W})`);
  return wrong;
}, { whole, reach, words });

// The same screen at every size, turned and resized without loading the page again.
async function everySize(name, what, { before = null, sizes = SIZES } = {}) {
  console.log(`${name}`);
  for (const [size, width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(350);
    if (before) await before();
    for (const wrong of await look(what)) bad(`${name}, ${size}: ${wrong}`);
    if (SHOTS.has(size)) await page.screenshot({ path: resolve(out, `${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${size}.png`) });
  }
}
const top = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (e) e.scrollTop = 0; }, sel);
const BUTTONS = ['.hx', '.btn'];

await page.goto(`${origin}/`, { timeout: 300000 });
await page.waitForFunction(() => window.__nlw && window.__nlw.intro && window.__nlw.intro.ready() && window.__nlw.ready, null, { timeout: 300000 });

// ---- the cover ----
await everySize('the cover', { whole: ['#cover-logo', '#cover-play'], words: [] });
await page.setViewportSize({ width: 390, height: 844 });
await page.tap('#cover-play');
await page.waitForFunction(() => window.__nlw.intro.stage() === 'done' && !document.querySelector('#start').hidden);

// ---- the start screen, shut: the game's name is whole, and the two buttons are there to press ----
await everySize('the start screen before an account', { reach: ['#start h1', '#start .brand', '#gate', '#open-signup', '#open-login', '#start .story'], words: ['#start h1', ...BUTTONS] }, { before: () => top('#start') });
// on every phone held sideways the name and both buttons are on the screen at once, with nothing to scroll for
await everySize('the start screen before an account, sideways', { whole: ['#start h1', '#open-signup', '#open-login'] }, { sizes: SIZES.filter(([, w, h]) => w > h && h >= 360), before: () => top('#start') });

// ---- the account page ----
await page.setViewportSize({ width: 390, height: 844 });
await page.tap('#open-signup');
await page.waitForSelector('#account:not([hidden])');
await everySize('making an account', { reach: ['#account-title', '#account-username', '#account-password', '#account-submit', '#account-back'], words: BUTTONS });
const username = `Fit_${Math.random().toString(36).slice(2, 8)}`;
await page.setViewportSize({ width: 390, height: 844 });
await page.fill('#account-username', username); await page.fill('#account-password', 'a password for the fit test');
await page.tap('#account-submit');
await page.waitForFunction(() => window.__nlw.online.status().state === 'in');

// ---- the one question, asked once ----
await page.waitForFunction(() => window.__nlw.intro.asking(), null, { timeout: 30000 }).catch(() => bad('a new account was not asked hero or villain'));
await everySize('hero or villain', { whole: ['#choice-title', '.pick[data-path="hero"]', '.pick[data-path="villain"]'], words: ['.pick'] });
await page.setViewportSize({ width: 390, height: 844 });
await page.tap('.pick[data-path="hero"]');
// While the answer is going away, the game is asked where the player belongs again and again (as it is when the
// town becomes ready or a sign-in lands at that moment): the question is not put a second time.
for (let i = 0; i < 12; i += 1) { await page.evaluate(() => window.__nlw.route()); await page.waitForTimeout(60); }
await page.waitForFunction(() => !window.__nlw.intro.asking() && document.querySelector('#intro').hidden && document.querySelector('#start').dataset.screen === 'create', null, { timeout: 30000 }).catch(() => bad('answered once, hero or villain was put again (or never went away)'));
await page.waitForFunction(() => window.__nlw.online.account && window.__nlw.online.account.path === 'hero', null, { timeout: 30000 }).catch(() => bad('the answer did not reach the account'));
// ...and a name with a V in it is a name, not an answer
await page.focus('#name'); await page.keyboard.type('Victor Vv');
await page.waitForTimeout(700);
{ const kept = await page.evaluate(() => ({ known: window.__nlw.knownPath(), account: window.__nlw.online.account.path, asking: window.__nlw.intro.asking(), name: document.querySelector('#name').value })); if (kept.known !== 'hero' || kept.account !== 'hero' || kept.asking) bad(`typing a name changed the answer: ${JSON.stringify(kept)}`); }

// ---- choosing a character ----
await page.waitForTimeout(600);
if (await page.evaluate(() => !!document.querySelector('#paths') || /your path/i.test(document.querySelector('#start').innerText))) bad('the screen where a character is made asks for the path again');
await everySize('choosing a character', { reach: ['#start h1', '#start-title', '#genders', '#stage-view', '#fig-prev', '#fig-next', '#fig-name', '#name', '#enter'], words: ['#start h1', ...BUTTONS] }, { before: () => top('#start') });
await page.setViewportSize({ width: 390, height: 844 });
await page.fill('#name', 'Adaeze Okeke-Nwachukwu Obi');          // as long a name as the box takes
await page.evaluate(() => document.querySelector('#creator').requestSubmit());
await page.waitForSelector('#confirm:not([hidden])');
await everySize('being sure of the character', { whole: ['#confirm-title', '#confirm-no', '#confirm-yes'], reach: ['#confirm-body'], words: ['#confirm .hx'] });
await page.setViewportSize({ width: 390, height: 844 });
await page.tap('#confirm-yes');
await page.waitForFunction(() => !document.querySelector('#hud').hidden, null, { timeout: 60000 });
await page.waitForTimeout(1500);

// ---- in town: the balance and the map at the top, whole, whichever way the phone is held ----
{ const over = await page.evaluate(overTown); if (over) bad(`in town: ${over}`); }
// the town keeps this device's own time and date
{
  const c = await page.evaluate(() => { const d = new Date(); const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']; const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']; return { day: document.querySelector('#hud-day').textContent, clock: document.querySelector('#hud-clock').textContent, want: `${names[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`, minutes: d.getHours() * 60 + d.getMinutes() }; });
  const [hh, mm] = c.clock.split(':').map(Number);
  const off = Math.abs(((hh * 60 + mm) - c.minutes + 1440 + 720) % 1440 - 720);
  if (c.day.toLowerCase() !== c.want.toLowerCase()) bad(`in town the date reads "${c.day}"; this device says ${c.want}`);
  if (!(off <= 1)) bad(`in town the clock reads ${c.clock}; this device's clock is ${Math.floor(c.minutes / 60)}:${String(c.minutes % 60).padStart(2, '0')}`);
}
const before = await page.evaluate(() => ({ x: window.__nlw.view.self.x, z: window.__nlw.view.self.z, name: window.__nlw.view.self.name, figure: window.__nlw.view.self.look.figure }));
await everySize('in town', { whole: ['.purse', '#hud-balance', '#hud-pounds', '#hud-clock', '#radar', '#btn-phone', '#stick', '.pad'] });
// the figures of the balance have a black edge: the whole of it, edge and all, is clear of the top of the screen
for (const [size, width, height] of SIZES) {
  await page.setViewportSize({ width, height }); await page.waitForTimeout(250);
  const t = await page.evaluate(() => { const r = document.querySelector('#hud-balance').getBoundingClientRect(); return { top: r.top, right: innerWidth - r.right }; });
  if (t.top < 5) bad(`in town, ${size}: the balance is ${t.top.toFixed(1)} px from the top of the screen: its edge would be cut`);
}
// a balance of many figures still fits
await page.evaluate(() => { const n = window.__nlw; const have = n.host.game.view(n.playerId).self.balance; n.host.bank.align(n.playerId, have + 1987654321 * 2, 'A great deal of TR'); });
await page.waitForTimeout(900);
await everySize('in town with a very large balance', { whole: ['.purse', '#hud-balance', '#hud-pounds'] }, { sizes: SIZES.filter(([n]) => /phone/.test(n)) });
// turning the phone did not move the player or lose anything
const after = await page.evaluate(() => ({ x: window.__nlw.view.self.x, z: window.__nlw.view.self.z, name: window.__nlw.view.self.name, figure: window.__nlw.view.self.look.figure, playing: !document.querySelector('#hud').hidden }));
if (!after.playing || after.name !== before.name || after.figure !== before.figure || Math.hypot(after.x - before.x, after.z - before.z) > 3) bad(`turning and resizing changed the game: ${JSON.stringify({ before, after })}`);
await page.evaluate(() => window.__nlw.wallet.refresh());          // (the bank's own figure again)

// ---- the Wallet ----
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => window.__nlw.ui.openPhone('wallet'));
await page.waitForFunction(() => document.querySelector('#wallet-balance') && !document.querySelector('#wallet-balance').classList.contains('wl-wait'));
await everySize('the Wallet', { reach: ['#page-back', '#wallet-balance', '#wallet-parts', '#wallet-username', '#wallet-copy', '#wallet-history', '#wallet-send', '#wallet-receive'], words: BUTTONS }, { before: () => top('.page .screen') });
// the balance card's top is on the screen, under the page's own head, at every size
for (const [size, width, height] of SIZES) {
  await page.setViewportSize({ width, height }); await page.waitForTimeout(250); await top('.page .screen');
  const c = await page.evaluate(() => { const card = document.querySelector('.wl-card').getBoundingClientRect(); const head = document.querySelector('#page-back').getBoundingClientRect(); const bal = document.querySelector('#wallet-balance').getBoundingClientRect(); return { card: card.top, head: head.bottom, bal: [bal.top, bal.bottom], h: innerHeight }; });
  if (c.card < c.head - 1) bad(`the Wallet, ${size}: the balance card starts at ${Math.round(c.card)}, under the page's head (which ends at ${Math.round(c.head)})`);
  if (c.bal[0] < 0 || c.bal[1] > c.h) bad(`the Wallet, ${size}: the balance is not wholly on the screen (${c.bal.map(Math.round)} of ${c.h})`);
}
await page.setViewportSize({ width: 390, height: 844 });
await page.tap('#wallet-parts summary');
await everySize('the Wallet, opened out', { reach: ['#wallet-total', '#wallet-starter', '#wallet-eligible'] }, { before: () => top('.page .screen') });
await page.setViewportSize({ width: 390, height: 844 });
await page.tap('#wallet-send'); await page.waitForSelector('#send-form');
await everySize('sending TR', { reach: ['#send-username', '#send-amount', '#send-note', '#send-continue', '#send-can'], words: BUTTONS }, { before: () => top('.page .screen') });

// ---- the characters, and the upgrade that is not to be had ----
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => window.__nlw.ui.openPhone('settings'));
await page.waitForSelector('#open-gallery');
await everySize('Settings', { reach: ['#settings-username', '#settings-logout', '#open-gallery', '#sound-on'], words: BUTTONS }, { before: () => top('.page .screen') });
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => document.querySelector('#open-gallery').click());
await page.waitForFunction(() => window.__nlw.gallery);
await page.waitForTimeout(600);
await everySize('the characters, one\'s own', { reach: ['#start h1', '#start-title', '#stage-view', '#fig-prev', '#fig-next', '#gallery-tag', '#gallery-text', '#gallery-back', '#gallery-rule'], words: ['#start h1', ...BUTTONS] }, { before: () => top('#start') });
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => document.querySelector('#fig-next').click());
await page.waitForFunction(() => !document.querySelector('#gallery-upgrade').hidden);
await everySize('the characters, another', { reach: ['#gallery-tag', '#gallery-text', '#gallery-upgrade', '#gallery-back'], words: BUTTONS }, { before: () => top('#start') });
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => document.querySelector('#gallery-upgrade').click());
await page.waitForSelector('#confirm:not([hidden])');
await everySize('the upgrade, set out', { whole: ['#confirm-title', '#confirm-no'], reach: ['#confirm-body', '#confirm-rows', '#confirm-note'], words: ['#confirm .hx'] });
// on a phone held sideways, the button that closes it is on the screen with the figures, without scrolling
await everySize('the upgrade, set out, sideways', { whole: ['#confirm-title', '#confirm-rows', '#confirm-no'] }, { sizes: SIZES.filter(([, w, h]) => w > h && h >= 360) });
await page.setViewportSize({ width: 390, height: 844 });
await page.tap('#confirm-no');
const looked = await page.evaluate(() => ({ figure: window.__nlw.host.game.view(window.__nlw.playerId).self.look.figure, account: window.__nlw.online.account.figure, kept: JSON.parse(localStorage.getItem('nlw-prefs-v1') || '{}').look }));
if (looked.figure !== before.figure || looked.account !== before.figure) bad(`looking at another character changed who the player is: ${JSON.stringify(looked)}`);
await page.tap('#gallery-back');
await page.waitForFunction(() => !document.querySelector('#hud').hidden);
const back = await page.evaluate(() => ({ x: window.__nlw.view.self.x, z: window.__nlw.view.self.z, figure: window.__nlw.view.self.look.figure }));
if (back.figure !== before.figure || Math.hypot(back.x - before.x, back.z - before.z) > 3) bad(`coming back from the characters moved or changed the player: ${JSON.stringify(back)}`);

// ---- coming back: the page is loaded again, the player is taken into the town, and nothing is left over it ----
await page.evaluate(() => window.__nlw.accountSync.upload());
for (const [size, width, height] of [['phone-tall', 390, 844], ['phone-side-wide', 800, 360]]) {
  await page.setViewportSize({ width, height });
  await page.goto(`${origin}/#nointro`, { timeout: 300000 });
  await page.waitForFunction(() => window.__nlw && window.__nlw.playerId && !document.querySelector('#hud').hidden, null, { timeout: 300000 }).catch(() => bad(`coming back, ${size}: the player was not taken into the town`));
  await page.waitForTimeout(800);
  const over = await page.evaluate(overTown);
  if (over) bad(`coming back, ${size}: ${over}`);
  for (const wrong of await look({ whole: ['.purse', '#hud-balance', '#radar', '#btn-phone', '#stick', '.pad', '#skills-btn'] })) bad(`coming back, ${size}: ${wrong}`);
  await page.screenshot({ path: resolve(out, `coming-back-${size}.png`) });
}
await page.setViewportSize({ width: 390, height: 844 });

// ---- logging out and erasing: the two questions ----
await page.evaluate(() => window.__nlw.ui.openPhone('settings'));
await page.waitForSelector('#erase-save');
await page.evaluate(() => document.querySelector('#erase-save').click());
await page.waitForSelector('#confirm:not([hidden])');
await everySize('erase your saved game?', { whole: ['#confirm-title', '#confirm-no', '#confirm-yes'], reach: ['#confirm-body'], words: ['#confirm .hx'] });
await page.setViewportSize({ width: 390, height: 844 });
await page.tap('#confirm-no');
await page.evaluate(() => document.querySelector('#settings-logout').click());
await page.waitForSelector('#confirm:not([hidden])');
await everySize('log out of your account?', { whole: ['#confirm-title', '#confirm-no', '#confirm-yes'], reach: ['#confirm-body'], words: ['#confirm .hx'] });
await page.tap('#confirm-no');

await browser.close();
server.close();
await require('../../api/_lib/db.js').closeDatabase();
console.log(problems.length ? `\n${problems.length} problem(s):\n${problems.map((x) => ` - ${x}`).join('\n')}` : `\nEvery screen fits at ${SIZES.length} sizes, upright and sideways, and turning the phone loses nothing.`);
process.exit(problems.length ? 1 : 0);
