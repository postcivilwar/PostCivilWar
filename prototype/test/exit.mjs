// Exit game and Restart game, in the phone's Settings (19 October 2026, the owner: "user will go to the game phone,
// click setting icon/app. Then they can see exit game button. Don't we need restart game?"), on the website as it is
// served with its server, on a phone held upright:
//   - the Game section is the first thing in Settings: Exit game and Restart game, in view without scrolling;
//   - Exit is asked about first; Cancel changes nothing;
//   - Save and Exit: the game is saved with the account (its copy is the one just made), the link is closed (the
//     other players stop seeing the player), the town's sounds stop, and the start screen says the game is saved,
//     with Play; the player stays signed in;
//   - on another device (this one with all it kept wiped): the player is back where they left the town;
//   - Play, after Exit: back in the town where they were, the link open again;
//   - Restart asks the owner's question (Erase your saved game?); Cancel changes nothing; yes: a new journey begins,
//     the account's TR kept.
//   ../server/with-postgres.sh node test/exit.mjs [shots folder]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDevServer } from '../../server/dev.mjs';
import { pastQuestion, enterTown } from './start.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const out = process.argv[2] || '/tmp/exit-shots';
mkdirSync(out, { recursive: true });
const server = createDevServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); };
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
const page = await context.newPage();
page.setDefaultTimeout(300000);
page.on('pageerror', (e) => check('no error in the page', false, e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 4\d\d/.test(m.text())) check('no error in the console', false, m.text()); });
let shotN = 0;
const shot = (name) => page.screenshot({ path: resolve(out, `${String(++shotN).padStart(2, '0')}-${name}.png`) });
const where = () => page.evaluate(() => { const n = window.__nlw, s = n.view && n.view.self; return s ? { x: +s.x.toFixed(2), z: +s.z.toFixed(2), playing: n.playing, exited: n.exited, hud: !document.querySelector('#hud').hidden, link: n.link, rev: n.online.status().save ? n.online.status().save.rev : null, state: n.online.status().state } : null; });

await page.goto(`${origin}/#nointro-gameclock`, { timeout: 300000 });
await page.waitForFunction(() => !!(window.__nlw && window.__nlw.intro), null, { timeout: 300000 });
await page.waitForSelector('#open-signup', { state: 'visible', timeout: 300000 });
await page.click('#open-signup');
const username = `Exit_${Math.random().toString(36).slice(2, 8)}`;
await page.fill('#account-username', username);
await page.fill('#account-password', 'a password for the exit test');
await page.click('#account-submit');
await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 120000 });
await pastQuestion(page);
await page.fill('#name', 'Exit Test');
await enterTown(page, { tap: true });
await page.waitForFunction(() => window.__nlw.playing && window.__nlw.me && window.__nlw.me.mixer, null, { timeout: 240000 });
// somewhere of its own: the open road north of the motor park
await page.evaluate(() => { const n = window.__nlw; n.place(2.5, 64); n.face(0.6); });
await page.waitForTimeout(1500);
await page.evaluate(() => window.__nlw.accountSync.upload());
const before = await where();
const tr = await page.evaluate(() => window.__nlw.wallet.state.balance);

// ---- Settings, from the phone: the Game section first ----
await page.tap('#btn-phone'); await page.waitForTimeout(600);
await page.tap('.app:has-text("Settings")'); await page.waitForSelector('#exit-game');
await page.waitForTimeout(400);
const top = await page.evaluate(() => {
  const box = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { t: Math.round(r.top), b: Math.round(r.bottom), l: Math.round(r.left), r: Math.round(r.right), text: e.textContent.trim() }; };
  const first = document.querySelector('.page .screen h3, .page .screen .section, .page .screen h2');
  return { exit: box('#exit-game'), restart: box('#erase-save'), first: first ? first.textContent.trim() : null, H: innerHeight, W: innerWidth };
});
await shot('settings');
check('Settings opens on the Game section: Exit game and Restart game, both in view without scrolling', !!top.exit && !!top.restart && top.exit.text === 'Exit game' && top.restart.text === 'Restart game' && top.exit.b <= top.H && top.restart.b <= top.H && top.exit.l >= 0 && top.restart.r <= top.W, top);

// ---- Exit: asked first; Cancel changes nothing ----
await page.tap('#exit-game'); await page.waitForSelector('#confirm:not([hidden])');
const asked = await page.evaluate(() => ({ title: document.querySelector('#confirm-title').textContent, yes: document.querySelector('#confirm-yes').textContent, no: document.querySelector('#confirm-no').textContent, body: document.querySelector('#confirm-body').textContent }));
await shot('exit-asked');
check('Exit game asks first: "Exit the game?", Save and Exit or Cancel', asked.title === 'Exit the game?' && asked.yes === 'Save and Exit' && asked.no === 'Cancel' && /saved/.test(asked.body), asked);
await page.tap('#confirm-no'); await page.waitForTimeout(600);
const stayed = await where();
check('Cancel: still in the town, playing, nothing changed', stayed.playing && !stayed.exited && Math.hypot(stayed.x - before.x, stayed.z - before.z) < 0.5, stayed);

// ---- Save and Exit ----
await page.tap('#exit-game'); await page.waitForSelector('#confirm:not([hidden])');
await page.tap('#confirm-yes');
await page.waitForSelector('#resume-play', { state: 'visible', timeout: 120000 }).catch(() => {});
await page.waitForTimeout(800);
const left = await where();
const screen = await page.evaluate(() => ({ title: document.querySelector('#resume-title').textContent, text: document.querySelector('#resume-text').textContent, play: !document.querySelector('#resume-play').hidden, wait: !document.querySelector('#resume-wait').hidden, signedIn: !document.querySelector('#account-who').hidden, sound: window.__nlw.audio.status().state }));
await shot('exited');
check('Save and Exit: out of the town, the start screen says the game is saved, with Play', !left.playing && left.exited && !left.hud && screen.play && !screen.wait && screen.title === 'Your game is saved' && /Press Play to carry on/.test(screen.text), { left, screen });
check('the game was saved with the account just now (its copy is newer than before)', left.rev > before.rev, { before: before.rev, after: left.rev });
check('the link is closed: other players no longer see this one', left.link === null, left.link);
check('the town\'s sounds have stopped', screen.sound !== 'running', screen.sound);
check('still signed in, as on the start screen', left.state === 'in' && screen.signedIn, { state: left.state, shown: screen.signedIn });

// ---- another device: everything this one kept wiped, the page loaded again ----
await page.evaluate(() => localStorage.clear());
// (loaded again: the same address with the same ending would not be loaded again by going to it)
await page.reload({ timeout: 300000 });
await page.waitForFunction(() => window.__nlw && window.__nlw.playing && window.__nlw.view && window.__nlw.view.self, null, { timeout: 300000 }).catch(() => {});
await page.waitForTimeout(1500);
const elsewhere = await where();
await shot('another-device');
check('on another device the player is in the town where they left it (from the account\'s copy)', !!elsewhere && elsewhere.playing && Math.hypot(elsewhere.x - before.x, elsewhere.z - before.z) < 0.6, { elsewhere, before });

// ---- Exit, then Play: back where they were, the link open again ----
await page.evaluate(() => window.__nlw.ui.openPhone('settings')); await page.waitForSelector('#exit-game');
await page.tap('#exit-game'); await page.waitForSelector('#confirm:not([hidden])'); await page.tap('#confirm-yes');
await page.waitForSelector('#resume-play', { state: 'visible', timeout: 120000 }).catch(() => {});
const out2 = await where();
await page.tap('#resume-play');
await page.waitForFunction(() => window.__nlw.playing && !document.querySelector('#hud').hidden, null, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(2500);
const back = await where();
await shot('played-again');
check('Play: back in the town where they were, the link open again', back.playing && !back.exited && back.hud && !!back.link && Math.hypot(back.x - out2.x, back.z - out2.z) < 0.5, { out: out2, back });

// ---- Restart: the owner's question; Cancel changes nothing; yes, a new journey, the TR kept ----
await page.evaluate(() => window.__nlw.ui.openPhone('settings')); await page.waitForSelector('#erase-save');
await page.tap('#erase-save'); await page.waitForSelector('#confirm:not([hidden])');
const restart = await page.evaluate(() => ({ title: document.querySelector('#confirm-title').textContent, yes: document.querySelector('#confirm-yes').textContent, no: document.querySelector('#confirm-no').textContent }));
await shot('restart-asked');
check('Restart game asks the owner\'s question: Erase your saved game? (Erase Save and Restart, or Cancel)', restart.title === 'Erase your saved game?' && restart.yes === 'Erase Save and Restart' && restart.no === 'Cancel', restart);
await page.tap('#confirm-no'); await page.waitForTimeout(600);
const kept = await where();
check('Cancel: nothing erased, still in the town', kept.playing && Math.hypot(kept.x - back.x, kept.z - back.z) < 0.5, kept);
await page.tap('#erase-save'); await page.waitForSelector('#confirm:not([hidden])'); await page.tap('#confirm-yes');
await page.waitForFunction(() => !window.__nlw.playing && window.__nlw.playerId === null && document.querySelector('#start').dataset.screen === 'create', null, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(800);
const fresh = await page.evaluate(() => ({ playerId: window.__nlw.playerId, screen: document.querySelector('#start').dataset.screen, title: document.querySelector('#start-title').textContent, erased: !!(window.__nlw.online.status().save && window.__nlw.online.status().save.erased), tr: window.__nlw.wallet.state.balance }));
await shot('restarted');
check('Restart: the character erased, with the account too; a new journey begins', fresh.playerId === null && fresh.screen === 'create' && fresh.erased, fresh);
check('and the account\'s TR is kept', fresh.tr === tr, { before: tr, after: fresh.tr });

const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nAll ${results.length} checks passed.`);
await browser.close(); server.close();
await require('../../api/_lib/db.js').closeDatabase().catch(() => {});
process.exit(failed ? 1 : 0);
