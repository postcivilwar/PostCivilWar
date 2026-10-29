// Voice chat in the game itself (29 October 2026, the owner's brief for voice chat, stage 1): two players in town, each
// in a browser of their own with a microphone of its own (a recording played as one), one on a computer and one on a
// phone, signed in to the website's server on this machine (server/dev.mjs, with the database). What the player sees
// and presses: voice chat off and out of sight to begin with; turned on in Settings, with what it does and the age
// asked once (a No keeps it off, and only an administrator can change that); the microphone button, held (or B on a
// keyboard); the speaker over whoever is talking; the players near you (mute, block, report); the blocked players in
// Settings; the Privacy page; the reports in the Admin app, and a warning given; and the frame rate with voice on.
// test/voice-chat.mjs tests what is heard, the relay, and the data used, on a page of its own.
//
//   ../server/with-postgres.sh node test/voice-chat-game.mjs [shots folder]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createDevServer } from '../../server/dev.mjs';
import { pastQuestion, enterTown } from './start.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const { database, closeDatabase } = require('../../api/_lib/db.js');
const out = resolve(process.argv[2] || '/tmp/voice-chat-game');
mkdirSync(out, { recursive: true });
// the microphone's recording: a voice-like tone for 1.2 s, then 1 s of quiet, over and over
const wav = resolve(out, 'speech.wav');
{
  const rate = 16000, n = Math.round(rate * 2.2), data = Buffer.alloc(44 + n * 2);
  data.write('RIFF', 0); data.writeUInt32LE(36 + n * 2, 4); data.write('WAVE', 8); data.write('fmt ', 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i += 1) { const t = i / rate, on = t < 1.2 ? Math.min(1, t / 0.05, (1.2 - t) / 0.05) : 0; data.writeInt16LE(Math.round(on * 0.45 * (Math.sin(2 * Math.PI * 220 * t) * 0.6 + Math.sin(2 * Math.PI * 440 * t) * 0.4) * 32767), 44 + i * 2); }
  writeFileSync(wav, data);
}
const server = createDevServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${wav}`] });
try { execSync("for p in $(pgrep -f headless_shell); do renice -n 10 -p $p >/dev/null 2>&1; done"); } catch (error) { /* not on this machine */ }
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let addresses = 0;

async function player(label, { phone = false } = {}) {
  addresses += 1;
  // (small screens: two towns drawn in software on this machine's two processors are slow enough as it is, and the
  // handshakes wait on the pages' timers)
  const size = phone ? { width: 667, height: 320 } : { width: 640, height: 360 };
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1, serviceWorkers: 'block', extraHTTPHeaders: { 'x-real-ip': `10.78.${addresses}.9` }, ...(phone ? { isMobile: true, hasTouch: true } : {}) });
  // (the microphone asked for: counted)
  await context.addInitScript(() => { window.__mics = 0; const m = navigator.mediaDevices; if (m && m.getUserMedia) { const real = m.getUserMedia.bind(m); m.getUserMedia = (c) => { window.__mics += 1; return real(c); }; } });
  const page = await context.newPage(); page.setDefaultTimeout(300000);
  page.on('pageerror', (e) => check(`no error in ${label}'s page`, false, `${e.message} ${(e.stack || '').split('\n').slice(0, 4).join(' | ')}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 4\d\d/.test(m.text())) check(`no error in ${label}'s console`, false, m.text()); });
  await page.goto(`${origin}/#nointro-gameclock${phone ? '-lite' : ''}`, { timeout: 300000 });
  await page.waitForFunction(() => !!(window.__nlw && window.__nlw.intro), null, { timeout: 300000 });
  await page.waitForSelector('#open-signup', { state: 'visible', timeout: 300000 });
  await page.click('#open-signup');
  const username = `${label}_${Math.random().toString(36).slice(2, 7)}`;
  await page.fill('#account-username', username); await page.fill('#account-password', `a password for ${label}`);
  await page.click('#account-submit');
  await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 120000 });
  await pastQuestion(page);
  await page.fill('#name', label);
  await enterTown(page, { tap: phone, wait: 600000 });
  await page.evaluate(() => { const n = window.__nlw; const g = n.host.game; g.state.weather = { kind: 'clear', until: g.state.t + 12 * 3600 }; const hour = n.view.clock.hourFloat; if (hour < 9 || hour > 14) n.skip((24 + 10 - hour) % 24); n.audio.start(); n.setGraphics('low'); });
  const cdp = phone ? await context.newCDPSession(page) : null;
  let shots = 0;
  return {
    label, phone, context, page, username, cdp,
    ev: (fn, arg) => page.evaluate(fn, arg),
    shot: (name) => page.screenshot({ path: resolve(out, `${String(++shots).padStart(2, '0')}-${label}-${name}.png`) }),
    press: (sel) => (phone ? page.tap(sel) : page.click(sel)),
    touch: (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id || 1, radiusX: 8, radiusY: 8, force: 1 })) }),
  };
}
const linksOf = (p) => p.ev(() => { const n = window.__nlw; const names = new Map(n.shownPeers.map((q) => [String(q.id).replace(/^v:/, ''), q.name])); return n.voiceChat.links().map((l) => ({ ...l, name: names.get(l.id) || null })); });
async function connectedTo(p, name, most = 120000) {
  const t0 = Date.now();
  while (Date.now() - t0 < most) { const l = (await linksOf(p)).find((x) => x.name === name); if (l && l.state === 'connected') return l; await sleep(500); }
  return null;
}
const heardOver = (p, name, ms = 2600) => p.ev(async ([name, ms]) => { const n = window.__nlw; let most = 0; const t0 = performance.now(); while (performance.now() - t0 < ms) { const id = (n.shownPeers.find((q) => q.name === name) || {}).id; const l = n.voiceChat.links().find((x) => `v:${x.id}` === id); if (l && l.heard) most = Math.max(most, l.heard); await new Promise((r) => setTimeout(r, 40)); } return most; }, [name, ms]);
const iconSeen = (p, ms = 8000) => p.ev(async (ms) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { const icon = document.querySelector('#voice-icons .voice-speaker'); if (icon && icon.style.display !== 'none' && icon.getBoundingClientRect().width > 0) { const r = icon.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y) }; } await new Promise((r) => setTimeout(r, 50)); } return null; }, ms);
async function openSettings(p) { await p.ev(() => window.__nlw.ui.openPhone('settings')); await p.page.waitForSelector('#voice-on', { timeout: 60000 }); await p.ev(() => document.querySelector('#voice-on').scrollIntoView({ block: 'center' })); }
const closePhone = (p) => p.ev(() => window.__nlw.ui.close());
async function fps(p, ms = 15000) {
  return p.ev(async (ms) => { let f = 0; const t0 = performance.now(); await new Promise((done) => { const step = () => { f += 1; if (performance.now() - t0 < ms) requestAnimationFrame(step); else done(); }; requestAnimationFrame(step); }); return +(f / ((performance.now() - t0) / 1000)).toFixed(1); }, ms);
}

try {
  const A = await player('Ada');
  const B = await player('Bayo', { phone: true });
  const spot = await A.ev(() => { const n = window.__nlw; for (const [x, z] of [[-236, 103.5], [-226, 96], [-210, 104], [-244, 92]]) for (const dx of [6, -6]) if (n.walkable(x, z) && n.walkable(x + dx, z)) return { x, z, dx }; return null; });
  const placeAt = (p, x, z, h) => p.ev(([x, z, h]) => { const n = window.__nlw; n.place(x, z); n.face(h); n.cam.yaw = h; }, [x, z, h]);
  await placeAt(A, spot.x, spot.z, Math.PI / 2);
  await placeAt(B, spot.x + spot.dx, spot.z, -Math.PI / 2);
  await sleep(3000);

  // ---- off to begin with ----
  const start = await A.ev(() => ({ on: window.__nlw.voiceChat.on, button: !document.querySelector('#voice-talk').hidden, mics: window.__mics }));
  check('off to begin with: no microphone button, the microphone not asked for', !start.on && !start.button && start.mics === 0, start);
  await A.shot('town-voice-off');
  await openSettings(A);
  const privacy = await A.ev(() => (document.querySelector('#privacy') || {}).textContent || '');
  check('Settings has a Privacy page: voice never recorded or kept', /never recorded or kept/.test(privacy) && /18 or older/.test(privacy), privacy.slice(0, 160));

  // ---- turned on, 18 or older ----
  await A.press('#voice-on');
  await A.page.waitForSelector('#voice-intro-yes', { timeout: 30000 });
  const intro = await A.ev(() => document.querySelector('.voice-card').textContent);
  await A.shot('first-time');
  check('the first time: what voice chat does, the data it uses, nothing recorded; the microphone not asked for yet', /mobile data/.test(intro) && /11 MB/.test(intro) && /never recorded/.test(intro) && (await A.ev(() => window.__mics)) === 0, intro);
  await A.press('#voice-intro-yes');
  await A.page.waitForSelector('#voice-age-yes', { timeout: 30000 });
  await A.shot('age');
  await A.press('#voice-age-yes');
  await A.page.waitForFunction(() => window.__nlw.voiceChat.active, null, { timeout: 30000 });
  await closePhone(A);
  const onA = await A.ev(() => ({ button: !document.querySelector('#voice-talk').hidden, people: !document.querySelector('#voice-people').hidden, mics: window.__mics, mode: window.__nlw.voiceChat.prefs.mode }));
  check('turned on: the microphone asked for once, the microphone button and the players-near button shown, push to talk', onA.button && onA.people && onA.mics === 1 && onA.mode === 'ptt', onA);
  await A.shot('voice-on');

  // ---- under 18: a No keeps it off; only an administrator can change it ----
  await openSettings(B);
  await B.press('#voice-on');
  await B.page.waitForSelector('#voice-intro-yes', { timeout: 30000 });
  await B.press('#voice-intro-yes');
  await B.page.waitForSelector('#voice-age-no', { timeout: 30000 });
  await B.shot('age-phone');
  await B.press('#voice-age-no');
  await B.page.waitForSelector('#voice-age-ok', { timeout: 30000 });
  await B.press('#voice-age-ok');
  await sleep(500);
  const offB = await B.ev(() => ({ on: window.__nlw.voiceChat.on, mics: window.__mics, toggle: document.querySelector('#voice-on') ? document.querySelector('#voice-on').getAttribute('aria-checked') : null }));
  check('a player who says they are under 18: voice chat stays off, the microphone never asked for', !offB.on && offB.mics === 0, offB);
  await B.press('#voice-on');
  await sleep(2500);
  const stillB = await B.ev(() => ({ on: window.__nlw.voiceChat.on, mics: window.__mics, asked: !!document.querySelector('#voice-age-yes'), said: (document.querySelector('.voice-card') || {}).textContent || '' }));
  check('asked once: turned on again, not asked again, and still off', !stillB.on && stillB.mics === 0 && !stillB.asked, stillB);
  if (await B.ev(() => !!document.querySelector('#voice-start-ok'))) await B.press('#voice-start-ok');
  await closePhone(B);

  // an administrator sets them as 18 or over (in the Admin app)
  const sql = await database();
  await sql.unsafe("update pcw.accounts set role = 'admin' where username_key = $1", [A.username.toLowerCase()]);
  await A.ev(() => window.__nlw.online.check());
  await A.ev(() => window.__nlw.ui.openPhone('admin', { tab: 'voice' }));
  await A.page.waitForSelector('#voice-admin-user', { timeout: 60000 });
  await A.page.fill('#voice-admin-user', B.username);
  await A.page.click('text=Set as 18 or over');
  await sleep(1500);
  const adult = (await sql.unsafe('select voice_adult, voice_adult_set_by_admin from pcw.accounts where username_key = $1', [B.username.toLowerCase()]))[0];
  check('the Admin app: an administrator sets a player as 18 or over', adult.voice_adult === true && adult.voice_adult_set_by_admin === true, adult);
  await closePhone(A);
  await openSettings(B);
  await B.press('#voice-on');
  await B.page.waitForFunction(() => window.__nlw.voiceChat.active, null, { timeout: 30000 });
  await closePhone(B);
  check('then they can turn voice chat on (not asked again)', await B.ev(() => window.__nlw.voiceChat.active && window.__mics === 1));

  // ---- put in touch, and heard ----
  const ab = await connectedTo(A, B.username);
  const why = (p) => p.ev(() => { const n = window.__nlw, v = n.voiceChat; return { events: v.events(), links: v.links(), stats: v.stats(), nearby: v.nearby(), peers: n.shownPeers.map((q) => ({ id: q.id, name: q.name, x: Math.round(q.x), z: Math.round(q.z) })), me: { x: Math.round(n.view.self.x), z: Math.round(n.view.self.z) } }; });
  check('the two in town, 6 m apart, put in touch', !!ab, ab ? undefined : { A: await why(A), B: await why(B), waiting: await sql.unsafe('select kind, length(data) as size, extract(epoch from (now() - at))::int as age from pcw.voice_signals') });
  if (process.env.PCW_STOP_AFTER_CONNECT) throw new Error('stopped after the connection, as asked');
  check('nothing heard while nobody holds the button', (await heardOver(B, A.username)) < 0.003);
  await A.page.keyboard.down('b');
  const sendingA = await A.ev(() => window.__nlw.voiceChat.sending);
  const btnA = await A.ev(() => document.querySelector('#voice-talk').classList.contains('sending'));
  const hB = await heardOver(B, A.username, 6000);
  const icon = await iconSeen(B);
  await B.shot('speaker-over-ada');
  await A.shot('talking');
  await A.page.keyboard.up('b');
  check('B held on the computer: sent, the button shows it, and heard on the other\'s phone', sendingA && btnA && hB > 0.005, { sendingA, btnA, hB });
  check('the speaker shown over the head of the player talking', !!icon, icon || await B.ev(() => ({ talking: window.__nlw.voiceChat.talkingIds(), links: window.__nlw.voiceChat.links(), icons: document.querySelectorAll('#voice-icons .voice-speaker').length })));
  await sleep(500);
  check('B let go: nothing sent', !(await A.ev(() => window.__nlw.voiceChat.sending)));
  // the phone: the microphone button held with a finger
  const box = await B.page.locator('#voice-talk').boundingBox();
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await B.touch('touchStart', [at]);
  await sleep(300);
  const sendingB = await B.ev(() => window.__nlw.voiceChat.sending);
  const hA = await heardOver(A, B.username, 6000);
  const iconA = await iconSeen(A);
  await B.touch('touchEnd', []);
  await sleep(300);
  check('the microphone button held with a finger on the phone: sent, heard on the computer, the speaker over their head', sendingB && hA > 0.005 && !!iconA, { sendingB, hA, iconA });
  check('the finger lifted: nothing sent', !(await B.ev(() => window.__nlw.voiceChat.sending)));

  // ---- the players near you: mute, report, block ----
  await A.press('#voice-people');
  await A.page.waitForSelector(`#voice-list .voice-person[data-name="${B.username}"]`, { timeout: 90000 }).catch(async (error) => { console.log('the list:', await A.ev(() => ({ open: !!document.querySelector('.voice-dialog'), text: (document.querySelector('.voice-card') || {}).textContent, nearby: window.__nlw.voiceChat.nearby() }))); throw error; });
  await A.shot('players-near');
  await A.page.click(`#voice-list .voice-person[data-name="${B.username}"] [data-act="mute"]`);
  check('Mute: the player muted', await A.ev((n) => window.__nlw.voiceChat.isMuted(n), B.username));
  await A.page.click(`#voice-list .voice-person[data-name="${B.username}"] [data-act="mute"]`);
  check('Unmute: heard again', await A.ev((n) => !window.__nlw.voiceChat.isMuted(n), B.username));
  await A.page.click('#voice-mute-all');
  check('Mute everyone', await A.ev((n) => window.__nlw.voiceChat.muteAll && window.__nlw.voiceChat.isMuted(n), B.username));
  await A.page.click('#voice-mute-all');
  await A.page.click(`#voice-list .voice-person[data-name="${B.username}"] [data-act="report"]`);
  await A.page.waitForSelector('#voice-reasons', { timeout: 60000 });
  const reasons = await A.ev(() => [...document.querySelectorAll('#voice-reasons [data-reason]')].map((b) => b.textContent));
  check('Report: the reasons to choose from', reasons.join('|') === 'Abuse or insults|Harassment|Threats|Hate speech|Other', reasons);
  await A.page.click('#voice-reasons [data-reason="threats"]');
  await A.page.fill('#voice-report-note', 'said he would find me');
  await A.shot('report');
  await A.page.click('#voice-report-send');
  await A.page.waitForSelector('.voice-dialog', { state: 'detached', timeout: 20000 });
  const row = (await sql.unsafe("select r.reason, r.note, r.zone, r.x, r.z, r.at, a.username as reporter, b.username as reported from pcw.voice_reports r join pcw.accounts a on a.id = r.reporter_id join pcw.accounts b on b.id = r.reported_id where b.username_key = $1", [B.username.toLowerCase()]))[0];
  check('the report kept: the date, both accounts, the reason, the note and the place in town', row && row.reason === 'threats' && row.note === 'said he would find me' && row.reporter === A.username && row.at && Math.abs(Number(row.x) - spot.x) < 3, row);
  // the Admin app: the report, and a warning
  await A.ev(() => window.__nlw.ui.openPhone('admin', { tab: 'voice' }));
  await A.page.waitForSelector('[data-voice-report]', { timeout: 60000 });
  await A.shot('admin-reports');
  const card = await A.ev(() => document.querySelector('[data-voice-report]').textContent);
  check('the Admin app shows the report, with what to do: warn, voice bans of 7 days, 30 days or for good, a game ban', card.includes(B.username) && /Threats/.test(card) && /Warn/.test(card) && /No voice 7 days/.test(card) && /No voice 30 days/.test(card) && /No voice for good/.test(card) && /Ban from the game/.test(card), card.slice(0, 300));
  await A.page.click('[data-voice-report] [data-action="warn"]');
  await sleep(1500);
  await closePhone(A);
  await B.ev(() => { window.__nlw.voiceUI.showWarning(); });
  await B.page.waitForSelector('#voice-warning-ok', { timeout: 20000 });
  const warned = await B.ev(() => document.querySelector('.voice-card').textContent);
  await B.shot('warning');
  await B.press('#voice-warning-ok');
  await sleep(800);
  const left = (await sql.unsafe('select warning from pcw.accounts where username_key = $1', [B.username.toLowerCase()]))[0];
  check('the warned player is shown the warning, once', /warning/i.test(warned) && left.warning === null, warned.slice(0, 160));
  // block, from the phone
  await B.press('#voice-people');
  await B.page.waitForSelector(`#voice-list .voice-person[data-name="${A.username}"]`, { timeout: 90000 });
  await B.page.tap(`#voice-list .voice-person[data-name="${A.username}"] [data-act="block"]`);
  await B.page.waitForSelector('#voice-block-yes', { timeout: 60000 });
  await B.page.tap('#voice-block-yes');
  await sleep(6000);
  if (await B.ev(() => !!document.querySelector('#voice-list-close'))) await B.page.tap('#voice-list-close');
  const lA = await linksOf(A), lB = await linksOf(B);
  check('Block: no longer in touch, either way', !lA.some((l) => l.name === B.username) && !lB.some((l) => l.name === A.username), { lA, lB });
  await openSettings(B);
  await B.page.waitForSelector(`#voice-blocked [data-unblock="${A.username}"]`, { timeout: 20000 });
  await B.shot('settings-blocked');
  await B.page.tap(`#voice-blocked [data-unblock="${A.username}"]`);
  await closePhone(B);
  check('Settings: the blocked player listed, and unblocked there: in touch again', !!(await connectedTo(B, A.username, 180000)));

  // ---- the frame rate, voice on and off ----
  await B.ev(() => window.__nlw.voiceChat.setMode('open'));
  const withVoice = await fps(A);
  await A.ev(() => window.__nlw.voiceChat.turnOff());
  await B.ev(() => window.__nlw.voiceChat.turnOff());
  await sleep(3000);
  const without = await fps(A);
  writeFileSync(resolve(out, 'fps.json'), JSON.stringify({ withVoice, without }));
  check('the frame rate on the computer, with the other player talking (open mic) and with voice chat off (drawn in software on this machine)', withVoice > 0 && without > 0 && withVoice >= without * 0.8, { withVoice, without });
  check('turned off: the microphone buttons gone', await A.ev(() => document.querySelector('#voice-talk').hidden));
} catch (error) {
  check('the test ran to its end', false, `${error.message} ${(error.stack || '').split('\n').slice(1, 4).join(' | ')}`);
} finally {
  await browser.close();
  server.close();
  await closeDatabase();
}
const passed = results.filter(Boolean).length;
console.log(`${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
