// Voice chat between players, in real browsers (29 October 2026, the owner's brief for voice chat, stage 1): several
// players, each in a browser of their own with a microphone of its own (a recording played as one: a tone that comes
// and goes, as speech does), each signed in to the website's server on this machine (server/dev.mjs, with the
// database), using the game's own voice chat (src/net/voice-chat.js), sound (src/client/audio.js) and word with the
// server (src/net/online.js), on a page of their own without the town (test/voice-chat-page.html): that is tested in
// the game itself by test/voice-chat-game.mjs.
//
//   A  off to begin with: the microphone not asked for, nothing sent; the age asked; a microphone refused leaves the
//      page as it was
//   B  put in touch: the players near each other, through the server's words; not one too far away
//   C  heard: nothing until the button is held (push to talk), then heard; louder near, fainter far, nothing beyond
//      25 m; muffled through a wall; open mic sends only while the player speaks
//   D  mute one player, mute everyone; block (never put in touch again, either way), unblock
//   E  a report reaches the Admin app's list, with the date, the accounts and the place
//   F  through the relay, when the two cannot reach each other directly (a relay of the test's own on this machine)
//   G  measured: the data used an hour, and the time voice chat takes each frame with five players talking
//
//   ../server/with-postgres.sh node test/voice-chat.mjs [out folder]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, symlinkSync, existsSync, rmSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startRelay } from './turn-relay.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(process.argv[2] || '/tmp/voice-chat-test');
mkdirSync(out, { recursive: true });

// the page, beside the game's own source
const site = resolve(out, 'site');
rmSync(site, { recursive: true, force: true });
mkdirSync(site, { recursive: true });
copyFileSync(resolve(here, 'voice-chat-page.html'), resolve(site, 'index.html'));
symlinkSync(resolve(here, '../src'), resolve(site, 'src'));
process.env.PCW_SITE = site;
// the microphone's recording: a voice-like tone for 1.2 s, then 1 s of quiet, over and over
const wav = resolve(out, 'speech.wav');
{
  const rate = 16000, seconds = 2.2, n = Math.round(rate * seconds), data = Buffer.alloc(44 + n * 2);
  data.write('RIFF', 0); data.writeUInt32LE(36 + n * 2, 4); data.write('WAVE', 8); data.write('fmt ', 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i += 1) {
    const t = i / rate;
    const on = t < 1.2 ? Math.min(1, t / 0.05, (1.2 - t) / 0.05) : 0;
    const v = on * 0.45 * (Math.sin(2 * Math.PI * 220 * t) * 0.6 + Math.sin(2 * Math.PI * 440 * t) * 0.3 + Math.sin(2 * Math.PI * 660 * t) * 0.1) * (0.8 + 0.2 * Math.sin(2 * Math.PI * 4 * t));
    data.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  writeFileSync(wav, data);
}
const { createDevServer } = await import('../../server/dev.mjs');
const { database, closeDatabase } = require('../../api/_lib/db.js');
const server = createDevServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${wav}`, '--autoplay-policy=no-user-gesture-required'] });

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let addresses = 0;
const P = { x: 30, z: 60 };     // where the players meet (a street of the town)

async function player(name, { x = P.x, z = P.z, relayOnly = false } = {}) {
  addresses += 1;
  const context = await browser.newContext({ extraHTTPHeaders: { 'x-real-ip': `10.77.${addresses}.${addresses + 10}` } });
  const page = await context.newPage();
  page.on('pageerror', (e) => check(`no error in ${name}'s page`, false, e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 4\d\d/.test(m.text())) check(`no error in ${name}'s console`, false, m.text()); });
  await page.goto(origin);
  await page.waitForFunction(() => window.ready === true);
  const username = `${name}_${Math.random().toString(36).slice(2, 7)}`;
  await page.evaluate(([u, p, o]) => window.V.setup(u, p, o), [username, `the password of ${name}`, { name, x, z, relayOnly }]);
  return { name, page, context, username, ev: (fn, arg) => page.evaluate(fn, arg) };
}
const turnOn = (p, adult = true) => p.ev(async (adultNow) => {
  const V = window.V;
  let r = await V.voice.start();
  if (r.code === 'AGE') { await V.voice.setAge(adultNow); r = await V.voice.start(); }
  return r;
}, adult);
const moveTo = (p, x, z) => p.ev(([x, z]) => { window.V.me.x = x; window.V.me.z = z; }, [x, z]);
const linksOf = (p) => p.ev(() => window.V.links());
const connectedTo = async (p, other, most = 30000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < most) {
    const l = (await linksOf(p)).find((x) => x.name === other.username);
    if (l && l.state === 'connected') return l;
    await sleep(400);
  }
  return null;
};
const heard = (p, ms) => p.ev((ms) => window.V.heard(ms), ms);
const hold = (p, on) => p.ev((on) => (on ? window.V.voice.press() : window.V.voice.release()), on);

try {
  // ---------------------------------------------------------------- A
  const A = await player('Ada', { x: P.x, z: P.z });
  const B = await player('Bayo', { x: P.x + 6, z: P.z });
  const C = await player('Chi', { x: P.x + 35, z: P.z });
  const off = await A.ev(() => ({ on: window.V.voice.on, active: window.V.voice.active, mics: window.V.T.mics, body: window.V.voice.body() }));
  check('A: voice chat off to begin with: the microphone not asked for, nothing sent with the words to the server', !off.on && !off.active && off.mics === 0 && off.body === null, off);
  const first = await A.ev(() => window.V.voice.start());
  const afterAsk = await A.ev(() => window.V.T.mics);
  check('A: the age asked first (once, kept with the account): the microphone not asked for before', first.ok === false && first.code === 'AGE' && afterAsk === 0, first);
  // a microphone refused: voice stays off, and the page goes on as before
  const refused = await C.ev(async () => { const V = window.V; await V.voice.setAge(true); V.T.refuse = true; const r = await V.voice.start(); V.T.refuse = false; return { r, on: V.voice.on, active: V.voice.active, still: V.online.signedIn }; });
  check('A: a microphone refused: voice chat stays off, a calm word what to do, and the game goes on as it was', !refused.r.ok && refused.r.code === 'MIC' && /allow it/.test(refused.r.message) && !refused.on && !refused.active && refused.still, refused);
  for (const p of [A, B, C]) { const r = await turnOn(p); check(`A: ${p.name} turns voice chat on (18 or older)`, r.ok, r); }

  // ---------------------------------------------------------------- B
  const ab = await connectedTo(A, B);
  check('B: two players near each other put in touch through the server, in a few seconds', !!ab, await linksOf(A));
  const ac = await connectedTo(A, C, 20000);
  check('B: one 35 m away put in touch too (ready before they are heard: within 40 m)', !!ac, await linksOf(A));
  await moveTo(C, P.x + 70, P.z);
  await sleep(4000);
  const far = (await linksOf(A)).find((l) => l.name === C.username);
  check('B: one who walks 70 m away let go of (beyond 50 m)', !far, await linksOf(A));

  // ---------------------------------------------------------------- C
  let h = await heard(B, 2600);
  check('C: push to talk: nothing heard from a player who is not holding the button', (h[A.username] || 0) < 0.003, h);
  await hold(A, true);
  const sendingNow = await A.ev(() => window.V.voice.sending);
  const near6 = await heard(B, 2600);
  check('C: the button held: sent, and heard by the player 6 m away', sendingNow && near6[A.username] > 0.02, { sendingNow, near6 });
  const talkingIcon = await B.ev(async () => { const t0 = performance.now(); const ids = new Set(); while (performance.now() - t0 < 2500) { for (const id of window.V.voice.talkingIds()) ids.add(id); await new Promise((r) => setTimeout(r, 50)); } return [...ids].map((id) => (window.V.shown.find((p) => p.id === id) || {}).state?.n); });
  check('C: the player talking is known as talking (the speaker over their head)', talkingIcon.includes(A.username), talkingIcon);
  await moveTo(B, P.x + 20, P.z);
  await sleep(600);
  const at20 = await heard(B, 2600);
  check('C: fainter 20 m away than 6 m away, and still heard', at20[A.username] > 0.002 && at20[A.username] < near6[A.username] * 0.6, { at6: near6[A.username], at20: at20[A.username] });
  await moveTo(B, P.x + 30, P.z);
  await sleep(600);
  const at30 = await heard(B, 2600);
  check('C: not heard beyond 25 m (30 m away)', (at30[A.username] || 0) < 0.001, at30);
  await moveTo(B, P.x + 6, P.z);
  await sleep(600);
  await B.ev(() => { window.V.T.walls = true; });
  await sleep(700);
  const walled = await heard(B, 2600);
  await B.ev(() => { window.V.T.walls = false; });
  check('C: muffled with a building between: quieter than in the open at the same distance', walled[A.username] > 0.002 && walled[A.username] < near6[A.username] * 0.8, { open: near6[A.username], walled: walled[A.username] });
  await hold(A, false);
  await sleep(500);
  h = await heard(B, 2600);
  const notSending = await A.ev(() => window.V.voice.sending);
  check('C: the button let go: nothing sent, nothing heard', !notSending && (h[A.username] || 0) < 0.003, { notSending, h });
  // open mic: sent while speaking (the recording's tone), not in its quiet
  await A.ev(() => window.V.voice.setMode('open'));
  const open = await A.ev(() => window.V.sendingOver(4400));
  check('C: open mic: sent while the player speaks, not while they are quiet', open.yes > 10 && open.no > 10, open);
  const openHeard = await heard(B, 2600);
  check('C: open mic: heard', openHeard[A.username] > 0.02, openHeard);

  // ---------------------------------------------------------------- D
  await B.ev((n) => window.V.voice.mute(n, true), A.username);
  await sleep(400);
  h = await heard(B, 2600);
  check('D: Ada muted by Bayo: not heard by Bayo', (h[A.username] || 0) < 0.001, h);
  await B.ev((n) => window.V.voice.mute(n, false), A.username);
  await B.ev(() => window.V.voice.setMuteAll(true));
  await sleep(400);
  h = await heard(B, 2600);
  check('D: everyone muted: nobody heard', (h[A.username] || 0) < 0.001, h);
  await B.ev(() => window.V.voice.setMuteAll(false));
  await sleep(400);
  h = await heard(B, 2600);
  check('D: unmuted: heard again', h[A.username] > 0.02, h);
  const adaId = await B.ev((n) => window.V.shown.find((p) => p.state.n === n).id, A.username);
  const blocked = await B.ev((id) => window.V.voice.block(id), adaId);
  check('D: Bayo blocks Ada', blocked.ok, blocked);
  await sleep(6000);
  const bLinks = await linksOf(B), aLinks = await linksOf(A);
  const bNear = await B.ev(() => window.V.voice.nearby().map((q) => q.name));
  check('D: blocked: no longer in touch, either way, and not offered again', !bLinks.some((l) => l.name === A.username) && !aLinks.some((l) => l.name === B.username) && !bNear.includes(A.username), { bLinks, aLinks, bNear });
  h = await heard(B, 2600);
  const h2 = await heard(A, 1000);
  check('D: blocked: neither hears the other', !h[A.username] && !h2[B.username], { bayoHears: h, adaHears: h2 });
  const unblocked = await B.ev((id) => window.V.voice.unblock(id), adaId);
  const again = await connectedTo(B, A, 30000);
  check('D: unblocked: put in touch again', unblocked.ok && !!again, await linksOf(B));

  // ---------------------------------------------------------------- E
  const reported = await B.ev((id) => window.V.voice.report(id, 'harassment', 'kept shouting', { x: window.V.me.x, z: window.V.me.z }), adaId);
  check('E: a report sent (Harassment, with a note)', reported.ok, reported);
  const sql = await database();
  await sql.unsafe(`update pcw.accounts set role = 'admin' where username_key = $1`, [C.username.toLowerCase()]);
  const seen = await C.ev(async () => { const r = await window.V.online.ask('admin.voice.reports', { status: 'open' }); return r; });
  const mine = seen.ok ? seen.reports.find((r) => r.reporter === B.username) : null;
  check('E: the report in the Admin app\'s list: the date, the two accounts, the reason and note, the place in town', !!mine && mine.reported === A.username && mine.reason === 'harassment' && mine.note === 'kept shouting' && !!mine.at && mine.place && Math.round(mine.place.x) === P.x + 6, mine || seen);
  const notAdmin = await A.ev(() => window.V.online.ask('admin.voice.reports'));
  check('E: only an administrator sees the reports', notAdmin.code === 'NOT_ADMIN', notAdmin.code);

  // ---------------------------------------------------------------- G (five talking to one)
  await A.ev(() => window.V.voice.setMode('ptt'));
  await moveTo(C, P.x - 4, P.z + 3);
  const D = await player('Dayo', { x: P.x + 3, z: P.z - 4 });
  const E = await player('Emeka', { x: P.x - 5, z: P.z - 2 });
  const F = await player('Funmi', { x: P.x + 2, z: P.z + 6 });
  for (const p of [D, E, F]) await turnOn(p);
  const talkers = [B, C, D, E, F];
  for (const p of talkers) await connectedTo(A, p, 40000);
  const linked = (await linksOf(A)).filter((l) => l.state === 'connected').map((l) => l.name).sort();
  check('G: one player in touch with the five near them at once', linked.length === 5, linked);
  for (const p of talkers) await p.ev(() => window.V.voice.setMode('open'));
  await sleep(2000);
  const m0 = await A.ev(async () => ({ m: await window.V.voice.measure(), t: performance.now(), frames: window.V.T.frames, ms: window.V.T.updateMs }));
  const hearsAll = await heard(A, 3000);
  await sleep(17000);
  const m1 = await A.ev(async () => ({ m: await window.V.voice.measure(), t: performance.now(), frames: window.V.T.frames, ms: window.V.T.updateMs }));
  check('G: all five heard at once', talkers.every((p) => hearsAll[p.username] > 0.005), hearsAll);
  const hours = (m1.t - m0.t) / 3600000;
  const mbIn = (m1.m.received - m0.m.received) / 1e6 / hours, mbOut = (m1.m.sent - m0.m.sent) / 1e6 / hours;
  const perFrame = (m1.ms - m0.ms) / Math.max(1, m1.frames - m0.frames);
  const measured = { receivedMBperHour: Math.round(mbIn), sentMBperHour: Math.round(mbOut), perVoiceMBperHour: Math.round(mbIn / 5), updateMsPerFrame: +perFrame.toFixed(3) };
  check('G: measured with five talking (the speech recording on and off, as people talk): data an hour, and the time each frame', mbIn > 0 && perFrame < 2, measured);
  writeFileSync(resolve(out, 'measured.json'), JSON.stringify(measured, null, 2));
  // one player talking (push to talk) uses nothing while quiet: what A sent while not holding the button
  const s0 = await A.ev(() => window.V.voice.measure());
  await sleep(10000);
  const s1 = await A.ev(() => window.V.voice.measure());
  const quietKBperHour = Math.round(((s1.sent - s0.sent) / 1e3) / (10 / 3600));
  check('G: not talking (push to talk, the button not held): almost nothing sent', quietKBperHour < 3000, { sentKBperHourToFive: quietKBperHour });
  for (const p of [C, D, E, F]) await p.context.close();

  // ---------------------------------------------------------------- F (the relay)
  const relay = await startRelay();
  process.env.PCW_TURN_TEST = JSON.stringify(relay.iceServers);
  const G = await player('Gozie', { x: P.x + 200, z: P.z, relayOnly: true });
  const H = await player('Halima', { x: P.x + 205, z: P.z, relayOnly: true });
  for (const p of [G, H]) await turnOn(p);
  const gh = await connectedTo(G, H, 40000);
  check('F: two players whose network will not let them reach each other: put in touch through the relay', !!gh && gh.relayed === true && relay.counts.allocations >= 1 && relay.counts.relayedPackets > 0, { link: gh, relay: relay.counts });
  await hold(G, true);
  const viaRelay = await heard(H, 2600);
  await hold(G, false);
  check('F: heard through the relay', viaRelay[G.username] > 0.02, viaRelay);
  const iceWord = await G.ev(() => window.V.online.ask('voice.ice'));
  check('F: the relay\'s password made by the server for each player, short-lived; no key in it', iceWord.ok && iceWord.relay === true && !JSON.stringify(iceWord).includes('CF_TURN'), { relay: iceWord.relay, ttl: iceWord.ttl });
  delete process.env.PCW_TURN_TEST;
  relay.close();

  // ---------------------------------------------------------------- the page out of sight
  const paused = await B.ev(async () => { await window.V.voice.pause(); const s = window.V.voice.stats(); await window.V.voice.resume(); return { mic: s.mic, links: s.links, after: window.V.voice.stats().mic }; });
  check('A: the game out of sight: the microphone stopped and everyone let go; back: the microphone again', !paused.mic && paused.links === 0 && paused.after, paused);
  await A.ev(() => window.V.voice.turnOff());
  const offAgain = await A.ev(() => ({ s: window.V.voice.stats(), tracks: 0 }));
  check('A: turned off: the microphone closed, nobody in touch', !offAgain.s.mic && offAgain.s.links === 0 && !offAgain.s.on, offAgain.s);
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
