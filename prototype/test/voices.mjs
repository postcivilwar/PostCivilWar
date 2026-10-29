// The town's recorded voices in the real page (28 October 2026, the owner's brief for the NPCs' voices, step 2): one
// player on the website, the way a player is, through its server.
//   1  the voices of the people about the player are fetched, and only theirs: no file of a voice not near
//   2  a conversation near the player: its lines heard (the recordings decoded and played, from where each speaker
//      stands), and its words shown as subtitles (Settings, on unless turned off)
//   3  subtitles turned off: the voices still heard, the words not shown
//   4  beyond 25 m nothing of it is played
//   5  a gunshot near people: one of them calls out, a reaction line heard
//   6  the page's memory: the recordings held as they came (small) and only a few made into sound at a time
//   and no error in the page.
//   ../server/with-postgres.sh node test/voices.mjs [shots folder]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createDevServer } from '../../server/dev.mjs';
import { pastQuestion, enterTown } from './start.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const out = process.argv[2] || '/tmp/voices-shots';
mkdirSync(out, { recursive: true });
const server = createDevServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
try { execSync("for p in $(pgrep -f headless_shell); do renice -n 10 -p $p >/dev/null 2>&1; done"); } catch (error) { /* not on this machine */ }
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); };

const context = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
const page = await context.newPage(); page.setDefaultTimeout(300000);
page.on('pageerror', (e) => check('no error in the page', false, `${e.message} ${(e.stack || '').split('\n').slice(0, 4).join(' | ')}`));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 4\d\d/.test(m.text())) check('no error in the console', false, m.text()); });
const fetched = [];
// (every voice the page has been told is near the player, from the first moment there is a town)
await page.addInitScript(() => { window.__nearSeen = new Set(); setInterval(() => { const n = window.__nlw, v = n && n.view; if (v && v.voicesNear) for (const x of v.voicesNear) window.__nearSeen.add(x); }, 30); });
page.on('request', (r) => { const m = /\/voices\/([^/?]+)\.mp3/.exec(r.url()); if (m) fetched.push(m[1]); });
await page.goto(`${origin}/#nointro-gameclock-lite`, { timeout: 300000 });
await page.waitForFunction(() => !!(window.__nlw && window.__nlw.intro), null, { timeout: 300000 });
await page.waitForSelector('#open-signup', { state: 'visible', timeout: 300000 });
await page.click('#open-signup');
await page.fill('#account-username', `Voices_${Math.random().toString(36).slice(2, 7)}`); await page.fill('#account-password', 'a password for the voices');
await page.click('#account-submit');
await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 120000 });
await pastQuestion(page);
await page.fill('#name', 'Listener');
await enterTown(page, { wait: 600000 });
await page.evaluate(() => { const n = window.__nlw; const g = n.host.game; g.state.weather = { kind: 'clear', until: g.state.t + 12 * 3600 }; const hour = n.view.clock.hourFloat; if (hour < 9 || hour > 14) n.skip((24 + 10 - hour) % 24); n.audio.start(); n.setGraphics('low'); });
// (a touch on the town, as a player's first is: the browser lets a page's sound start only after one)
await page.mouse.click(422, 120);
await page.waitForFunction(() => window.__nlw.audio.running, null, { timeout: 30000 }).catch(() => {});
check('the sound is running', await page.evaluate(() => window.__nlw.audio.running), await page.evaluate(() => window.__nlw.audio.status().state));
const heap0 = await page.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize : 0));


// whose voice a line is: its file is named <voice>_<what about>_<number>
const voiceOf = (id) => id.split('_').slice(0, -2).join('_');

// a conversation going on somewhere: the player put beside its speaker (within `d` m), at most `minutes` of the town's
// time looked through (the town's clock run on a little at a time)
async function besideTalk(d) {
  // (the town's own plan of its conversations, looked through from now, the way the unit test finds one: the town's
  // clock then run on to a moment before it begins, and the player put beside its first speaker. A conversation is
  // played only with a player within 40 m of it.)
  return page.evaluate((dist) => {
    const n = window.__nlw, g = n.host.game, V = g.internals.voices, S = g.internals.timeScale, step = 30 * S;
    for (let t = g.state.t + 2 * S; t < g.state.t + 86400; t += step) {
      const b = V.schedule(t).find((x) => !x.walk && x.t0 >= t - step && x.t0 > g.state.t + 2 * S);
      if (!b) continue;
      n.skip((b.t0 - g.state.t - 1.5 * S) / 3600);
      const w = b.at[0];
      n.place(w.x + dist, w.z);
      return { id: b.c.id, who: w.who, x: w.x, z: w.z, length: b.length };
    }
    return null;
  }, d);
}
const stats = () => page.evaluate(() => window.__nlw.voiceStats());
const speech = () => page.evaluate(() => (window.__nlw.view.speech || []).filter((l) => l.voice).map((l) => ({ id: l.id, voice: l.voice, text: l.text, x: l.x, z: l.z })));
const subtitle = () => page.evaluate(() => [...document.querySelectorAll('#bubbles *')].map((e) => e.textContent.trim()).filter(Boolean).join(' | '));

// 1 and 2: beside a conversation
const s0 = await stats();
const at = await besideTalk(4);
check('a conversation found going on in the town', !!at, at);
if (at) {
  let heard = null, words = '', lines = [], last = null;
  for (let k = 0; k < 60 && !heard; k += 1) {
    await page.waitForTimeout(500);
    lines = await speech();
    const s = await stats(); last = s;
    if (s.played > s0.played) heard = s;
    if (!words) { const sub = await subtitle(); if (lines.some((l) => sub.includes(l.text.replace(/\[[^\]]*\]\s*/g, '').trim().slice(0, 12)))) words = sub; }
  }
  check('its lines are heard: recordings fetched, decoded and played', !!heard && heard.fetched > 0 && heard.decoded > 0 && heard.failed === 0, heard || last);
  for (let k = 0; k < 16 && !words; k += 1) { await page.waitForTimeout(500); lines = await speech(); const sub = await subtitle(); if (lines.some((l) => sub.includes(l.text.replace(/\[[^\]]*\]\s*/g, '').trim().slice(0, 12)))) words = sub; }
  check('its words shown as subtitles (on by default)', !!words, words);
  await page.screenshot({ path: resolve(out, '01-conversation.png') });
}
// only the voices of the people about the player were fetched
const near = new Set(await page.evaluate(() => [...window.__nearSeen]));
const wrong = fetched.filter((id) => !near.has(voiceOf(id)));
check('only the voices of the people near the player were fetched', fetched.length > 0 && wrong.length === 0, { files: fetched.length, different: new Set(fetched).size, voicesNear: near.size, others: wrong.slice(0, 5) });

// 3: subtitles off
// (Settings opened on the phone, and its switch pressed, as a player does)
await page.evaluate(() => window.__nlw.ui.openPhone('settings'));
const sw = await page.waitForSelector('#subtitles-on', { timeout: 30000 }).catch(() => null);
const wasOn = sw ? await sw.getAttribute('aria-checked') : null;
if (sw) await sw.click();
const turned = sw ? (await sw.getAttribute('aria-checked')) === 'false' && wasOn === 'true' : false;
await page.screenshot({ path: resolve(out, '02-settings.png') });
await page.evaluate(() => window.__nlw.ui.close && window.__nlw.ui.close());
const s1 = await stats();
const at2 = await besideTalk(4);
let shownOff = '';
let heardOff = false;
for (let k = 0; k < 40 && at2; k += 1) {
  await page.waitForTimeout(500);
  const lines = await speech(); const sub = await subtitle();
  if (lines.some((l) => sub.includes(l.text.replace(/\[[^\]]*\]\s*/g, '').trim().slice(0, 12)))) shownOff = sub;
  if ((await stats()).played > s1.played) heardOff = true;
}
check('Settings: subtitles on at first; turned off, the voices still heard and the words not shown', !!at2 && turned && heardOff && !shownOff, { wasOn, turned, heardOff, shownOff });

// 4: beyond 25 m, nothing played
const s2 = await stats();
const at3 = await besideTalk(32);
let far = 0, said = 0;
for (let k = 0; k < 20 && at3; k += 1) { await page.waitForTimeout(500); const s = await stats(); far = s.played - s2.played; said = Math.max(said, (await page.evaluate(() => window.__nlw.host.game.internals.voices.talking().filter((t) => t[3] === 1).length))); }
check('a conversation 32 m away (going on: it is within 40 m of the player) is not heard', !!at3 && said > 0 && far === 0, { at3, said, far });

// 5: a gunshot near people (beside a conversation, where people with voices stand): one of them calls out
// (or, should the town's plan have none coming, beside someone with a voice who is up and about)
const at5 = (await besideTalk(5)) || (await page.evaluate(() => {
  const n = window.__nlw, g = n.host.game, I = g.internals, o = {};
  for (let i = 0; i < I.population.count; i += 1) {
    if (!I.voices.voiced(`n:${i}`)) continue;
    I.population.locate(i, g.state.t, o);
    if (o.pose === 4 || o.moving) continue;
    n.place(o.x + 4, o.z); return { who: `n:${i}`, x: o.x, z: o.z };
  }
  return null;
}));
check('beside people with voices, for the gunshot', !!at5, at5);
await page.waitForTimeout(1500);
const before5 = await stats();
const r0 = await page.evaluate(() => window.__nlw.host.game.internals.voices.stats().reactions);
if (at5) await page.evaluate(([x, z]) => window.__nlw.host.game.internals.voices.event('gunshot', x, z), [at5.x, at5.z]);
let reacted = null;
for (let k = 0; k < 40 && !reacted; k += 1) { await page.waitForTimeout(500); const l = (await speech()).find((x) => /_gunshot_/.test(x.voice)); if (l) reacted = l; }
for (let k = 0; k < 20 && (await stats()).played <= before5.played; k += 1) await page.waitForTimeout(500);
const after5 = await stats();
const r1 = await page.evaluate(() => window.__nlw.host.game.internals.voices.stats().reactions);
check('a gunshot near people: someone calls out, and it is heard', !!reacted && after5.played > before5.played, { reacted, reactions: r1 - r0, played: after5.played - before5.played });

// 6: memory
const s6 = await stats();
const heap1 = await page.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize : 0));
check('the page holds few recordings made into sound, and their files small', s6.ready <= 6 && s6.kept <= 120 && s6.bytes / Math.max(1, s6.fetched) < 45000, { ready: s6.ready, kept: s6.kept, fetched: s6.fetched, avgKB: Math.round(s6.bytes / Math.max(1, s6.fetched) / 1024), heapMB: [Math.round(heap0 / 1e6), Math.round(heap1 / 1e6)] });

await browser.close(); server.close();
const failed = results.filter((x) => !x).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
