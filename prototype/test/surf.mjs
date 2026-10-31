// Surfing on the waves along the town's bank, in a headless browser, on the website as it is served with its server and a
// database (31 October 2026, stage 4 of the owner's brief of 30 October: "incorporate a realistic surf feature for
// certain characters in bikinis, and ensure heavy clothing users can't surf"; "only surf at the river by town"), with a
// phone's settings or a computer's:
//  A  Adanna (in her bikini) chosen; the surfboard bought at the sports mall; Property says where to surf, and in what
//  B  the waves along the town's bank east of the jetty: drawn, coming in, standing up, white where they break; none
//     west of the jetty
//  C  at the water's edge there, "Paddle out on your surfboard": on the board in the water, lying on it face down along
//     it, the head up; paddled, the arms going in turn; turned
//  D  in other clothes, the town says no, and why
//  E  up on a wave: standing across the board side on, knees bent, the feet on its deck, the arms out
//  F  off the board: into the water, or onto the bank
//  G  what it costs: a phone at Medium under 135 MB on its graphics card by the waves; nothing in the console; no picture
//     lost
//   ../server/with-postgres.sh node test/surf.mjs [shots folder] [phone]
// (A frame drawn in software here can take seconds: the waves go by the town's own clock, in real seconds, so catching
// one by hand is not tested here; test/surf-play.test.mjs stands up on one, rides it in and comes down again.)
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDevServer } from '../../server/dev.mjs';
import { pastQuestion, enterTown, watchPictures, lostPictures } from './start.mjs';
import { SPORTS_MALL as M } from '../src/sim/zones/asaba-sports.js';
import { zoneShoreZ } from '../src/sim/zone.js';
import { SURF } from '../src/sim/surf.js';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

if (!process.env.PCW_DATABASE_URL) { console.error('PCW_DATABASE_URL is not set: run this with server/with-postgres.sh'); process.exit(2); }
const out = resolve(process.argv[2] || '/tmp/surf-shots');
const PHONE = process.argv[3] === 'phone';
mkdirSync(out, { recursive: true });
const server = createDevServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); };
const tag = Math.random().toString(36).slice(2, 6);

const context = await browser.newContext(PHONE ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, serviceWorkers: 'block' } : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
await watchPictures(context);
const page = await context.newPage(); page.setDefaultTimeout(240000);
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); console.log('PAGE ERROR', e.message); });
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 4\d\d/.test(m.text())) errors.push(m.text()); });
const shot = (name) => page.screenshot({ path: resolve(out, `${name}.png`) });

await page.goto(`${origin}/#nointro-gameclock${PHONE ? '-lite' : ''}`, { timeout: 600000 });
await page.waitForFunction(() => !!(window.__nlw && window.__nlw.intro), null, { timeout: 600000 });
await page.waitForSelector('#open-signup', { state: 'visible', timeout: 300000 });
await page.click('#open-signup');
await page.fill('#account-username', `Surfer_${tag}`); await page.fill('#account-password', 'a password for the surfing test');
await page.click('#account-submit');
await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 120000 });
await pastQuestion(page);
// ---- A: Adanna, in her bikini
const chose = await page.evaluate(() => { const b = [...document.querySelectorAll('#fig-dots button')].find((e) => (e.getAttribute('aria-label') || '').startsWith('Adanna,')); if (b) b.click(); return !!b; });
await page.waitForTimeout(800);
await page.fill('#name', 'Surfing Test');
await enterTown(page, { tap: PHONE, wait: 900000 });
await page.waitForFunction(() => window.__nlw.me && window.__nlw.me.mixer, null, { timeout: 600000 });
if (PHONE) await page.evaluate(() => window.__nlw.setGraphics('medium'));
await page.evaluate(() => { const n = window.__nlw, g = n.host.game; const hour = n.view.clock.hourFloat; n.skip(((24 + 11 - hour) % 24) || 24); g.state.weather = { kind: 'clear', until: g.state.t + 24 * 3600 }; for (const id of ['toasts', 'notices']) { const el = document.getElementById(id); if (el) el.hidden = true; } });
const figure = await page.evaluate(() => window.__nlw.view.self.look.figure);
check('A: Adanna chosen, in her bikini', chose && figure === 'W10', { chose, figure });
const go = (x, z, h) => page.evaluate(([x, z, h]) => { const n = window.__nlw; n.place(x, z); n.face(h); }, [x, z, h]);
await go(M.entry.x, M.entry.z + 0.8, Math.PI);
await page.evaluate(() => window.__nlw.goSports('in'));
await page.waitForFunction(() => window.__nlw.sports.inside && !document.getElementById('fade').classList.contains('on'), null, { timeout: 30000 });
const d = M.displays.find((q) => q.item === 'surfboard');
await go(d.x + Math.sin(d.h) * (d.r + 0.6), d.z + Math.cos(d.h) * (d.r + 0.6), d.h + Math.PI);
await page.evaluate(() => window.__nlw.askAboutSport('surfboard'));
await page.waitForSelector('#deal-buy', { timeout: 90000 });
await page.waitForTimeout(800);
await page.click('#deal-buy');
await page.waitForSelector('#deal-yes', { timeout: 30000 });
await page.click('#deal-yes');
const bought = await page.waitForSelector('#deal-done', { timeout: 120000 }).then(() => true, () => false);
await page.keyboard.press('Escape');
await page.waitForTimeout(600);
await page.evaluate(() => { if (window.__nlw.ui.isOpen()) window.__nlw.ui.close(); });
await go((M.exit.x0 + M.exit.x1) / 2, (M.exit.z0 + M.exit.z1) / 2, 0);
await page.evaluate(() => window.__nlw.goSports('out'));
await page.waitForFunction(() => !window.__nlw.sports.inside && !document.getElementById('fade').classList.contains('on'), null, { timeout: 30000 });
await page.evaluate(async () => { await window.__nlw.market.mine(); });
await page.evaluate(() => window.__nlw.ui.openPhone('property', {}));
await page.waitForSelector('#my-assets', { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(1500);
await page.evaluate(() => { const card = [...document.querySelectorAll('#my-assets .assetcard')].find((c) => /Surfboard/i.test(c.textContent)); if (card) card.click(); });
const note = await page.waitForSelector('#sport-water', { timeout: 30000 }).then((el) => el.textContent(), () => null);
check('A: the surfboard bought (100 TR); in Property, where to surf and in what', bought && /east of the jetty/.test(note || '') && /swimwear/.test(note || ''), { bought, note });
await page.evaluate(() => { if (window.__nlw.ui.isOpen()) window.__nlw.ui.close(); });

// ---- B: the waves, along the town's bank east of the jetty
const X = 120, bankZ = zoneShoreZ(X);
await go(X, bankZ - 1.5, 0);
await page.evaluate(() => { const n = window.__nlw; n.cam.yaw = 0.6; n.cam.pitch = 0.18; n.cam.dist = 7; n.cam.lastDrag = 1e9; n.rig.snap(n.cam); });
const seenWaves = [];
for (let k = 0; k < 12; k += 1) { await page.waitForTimeout(1500); seenWaves.push(await page.evaluate(() => { const n = window.__nlw, w = n.surfView.waves; const mesh = n.scene.getObjectByName('surf-waves'); return { frames: w.frames, highest: +w.highest.toFixed(2), foam: w.foam, shown: !!(mesh && mesh.visible), t: n.waveNow() }; })); }
check('B: the waves drawn along the bank, coming in, standing up and breaking white', seenWaves.some((q) => q.shown) && Math.max(...seenWaves.map((q) => q.highest)) > 0.4 && seenWaves.some((q) => q.foam > 0), seenWaves);
await shot('b-waves-along-the-bank');
const west = await page.evaluate(() => { const n = window.__nlw; return { x0: n.surfView.waves ? 1 : 0 }; });
void west;

// ---- C: out on the board
await page.waitForTimeout(800);
const offered = await page.evaluate(() => { const n = window.__nlw; n.refresh(); const p = n.prompt(); return p ? p.text : null; });
check('C: at the water\'s edge, "Paddle out on your surfboard" offered', offered === 'Paddle out on your surfboard', offered);
const outR = await page.evaluate(() => window.__nlw.surfOut());
await page.waitForFunction(() => window.__nlw.surfView.ready('own'), null, { timeout: 240000 }).catch(() => {});
await page.waitForTimeout(2000);
const pose = () => page.evaluate(() => {
  const n = window.__nlw, me = n.me, m = n.surfView.model('own');
  const l = n.sportView.limbs(me);
  const at = (v) => (v ? [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)] : null);
  const head = me.bones && (typeof me.bones.get === 'function' ? me.bones.get('head') : null);
  const water = n.surfView.waterAt(n.predicted.x, n.predicted.z);
  // (and each foot's height, and the hips', above the board in its own frame: on a wave's face it is pitched along the
  // slope, and the back foot is higher than the board's middle by as much)
  const onBoard = (v) => (v && m ? +m.group.worldToLocal(v.clone()).y.toFixed(3) : null);
  return { feetOnBoard: l && m ? l.feet.map(onBoard) : null, pelvisOnBoard: l && m ? onBoard(l.pelvis) : null, mode: n.ownSurf() && n.ownSurf().mode, ready: n.surfView.ready('own'), board: m ? at(m.group.position) : null, water: +water.toFixed(3), pelvis: l ? at(l.pelvis) : null, hands: l ? l.hands.map(at) : null, feet: l ? l.feet.map(at) : null, head: head ? at(head.getWorldPosition(new THREE.Vector3())) : null, heading: n.predicted.heading, speed: n.surfState.speed, at: [n.predicted.x, n.predicted.z] };
});
const lying = await pose();
const ahead = lying.head && lying.pelvis ? (lying.head[0] - lying.pelvis[0]) * Math.sin(lying.heading) + (lying.head[2] - lying.pelvis[2]) * Math.cos(lying.heading) : 0;
check('C: on the board in the water, lying face down along it, the head up ahead of the hips', outR.ok && lying.mode === 'lie' && lying.ready && lying.pelvis && lying.pelvis[1] - lying.water < 0.5 && ahead > 0.5, { outR, lying, ahead: +ahead.toFixed(2) });
await page.evaluate(() => { const n = window.__nlw; n.cam.yaw = n.predicted.heading + 2.0; n.cam.pitch = 0.22; n.cam.dist = 4.2; n.cam.lastDrag = 1e9; n.rig.snap(n.cam); });
await page.waitForTimeout(1200);
await shot('c1-lying-on-the-board');
// paddled out: the arms going in turn
await page.keyboard.down('w');
const strokes = [];
for (let k = 0; k < 30; k += 1) { await page.waitForTimeout(300); strokes.push(await pose()); if (strokes.length > 6 && Math.hypot(strokes[strokes.length - 1].at[0] - lying.at[0], strokes[strokes.length - 1].at[1] - lying.at[1]) > 2.5) break; }
await page.keyboard.up('w');
const moved = Math.hypot(strokes[strokes.length - 1].at[0] - lying.at[0], strokes[strokes.length - 1].at[1] - lying.at[1]);
const handSpread = strokes.filter((q) => q.hands && q.hands[0] && q.hands[1]).map((q) => q.hands[0][2] - q.hands[1][2]);
check('C: paddled, it goes out at a paddler\'s pace, the arms going in turn', moved > 1 && Math.max(...strokes.map((q) => q.speed)) <= 1.6 && handSpread.length > 3 && Math.max(...handSpread) - Math.min(...handSpread) > 0.25, { moved: +moved.toFixed(2), speeds: strokes.map((q) => +q.speed.toFixed(2)), handSpread: handSpread.map((v) => +v.toFixed(2)) });
await page.evaluate(() => { const n = window.__nlw; n.cam.yaw = n.predicted.heading + 1.6; n.cam.lastDrag = 1e9; n.rig.snap(n.cam); });
await page.keyboard.down('w'); await page.waitForTimeout(700); await shot('c2-paddling'); await page.keyboard.up('w');
// turned round to face the bank
await page.keyboard.down('a');
for (let k = 0; k < 60; k += 1) { await page.waitForTimeout(300); const h = await page.evaluate(() => window.__nlw.predicted.heading); if (Math.abs(Math.atan2(Math.sin(h - Math.PI), Math.cos(h - Math.PI))) < 0.4) break; }
await page.keyboard.up('a');
const facing = await page.evaluate(() => window.__nlw.predicted.heading);
check('C: turned round on the board to face the bank', Math.abs(Math.atan2(Math.sin(facing - Math.PI), Math.cos(facing - Math.PI))) < 0.6, { facing: +facing.toFixed(2) });

// ---- D: in other clothes, no
const refused = await page.evaluate(() => {
  const n = window.__nlw, g = n.host.game, p = g.state.players[n.playerId];
  const look = p.look, at = { x: p.x, z: p.z, astride: p.astride, psurf: p.psurf };
  p.astride = null; p.psurf = null; p.swimming = null;
  const bank = { x: p.x, z: 150 + 5 * Math.sin(p.x / 37) + 3 * Math.sin(p.x / 11 + 1) - 1.5 };
  p.x = bank.x; p.z = bank.z;
  p.look = { ...look, figure: 'W3' };
  const r = g.intent(n.playerId, { type: 'surf.out' });
  p.look = look; p.x = at.x; p.z = at.z; p.astride = at.astride; p.psurf = at.psurf; n.refresh();
  return { ok: r.ok, code: r.code, message: r.message };
});
check('D: someone not in swimwear cannot surf, and is told why', !refused.ok && refused.code === 'CLOTHES' && /swimwear/.test(refused.message || ''), refused);

// ---- E: up on a wave (put in front of a wave's crest as it stands up; catching one is test/surf-play.test.mjs's)
const placeOnWave = () => page.evaluate(([from, speed]) => {
  const n = window.__nlw, g = n.host.game, p = g.state.players[n.playerId];
  const t = n.waveNow();
  // (the wave nearest to standing up at the board's place, put under the board: the board in front of its crest)
  const shore = (x) => 150 + 5 * Math.sin(x / 37) + 3 * Math.sin(x / 11 + 1);
  const cycle = 3 * 9 + 16, travel = (from - 150 + 4) / speed;
  let best = null;
  for (let c = Math.floor(t / cycle) - 2; c <= Math.floor(t / cycle) + 1; c += 1) for (let k = 0; k < 3; k += 1) { const age = t - (c * cycle + k * 9); if (age > 0 && age < travel) { const z = from - speed * age; if (!best || Math.abs(z - (shore(p.x) + 12)) < Math.abs(best.z - (shore(p.x) + 12))) best = { id: c * 3 + k, z }; } }
  // (only when one is out where the waves stand up, twelve metres off the bank; otherwise waited for: in a lull between
  // sets they are all in the shallows or still far out)
  if (!best || Math.abs(best.z - (shore(p.x) + 12)) > 1.5) return { wait: true, nearest: best ? +best.z.toFixed(1) : null };
  const crestZ = best.z;
  const z = Math.min(crestZ - 1.9, 183);
  p.psurf.x = p.x; p.psurf.z = z; p.z = z; p.psurf.mode = 'ride'; p.psurf.wave = best.id; p.psurf.h = Math.PI; p.heading = Math.PI; p.lastMoveAt = g.state.real;
  n.predicted.z = z; n.predicted.heading = Math.PI; n.refresh();
  n.cam.yaw = Math.PI + 1.9; n.cam.pitch = 0.16; n.cam.dist = 4.6; n.cam.lastDrag = 1e9; n.rig.snap(n.cam);
  return { wave: best.id, crest: +crestZ.toFixed(1), z: +z.toFixed(1) };
}, [SURF.from, SURF.speed]);
let stood = null;
for (let tries = 0; tries < 300 && !stood; tries += 1) { const r = await placeOnWave(); if (r && !r.wait) stood = r; else await page.waitForTimeout(300); }
await page.waitForTimeout(1500);
const up = await pose();
const deck = up.board ? up.board[1] + 0.25 : 0;
check('E: up on the wave: standing on the board, knees bent, both feet on its deck', !!stood && up.mode === 'ride' && up.pelvisOnBoard !== null && up.pelvisOnBoard - 0.25 > 0.45 && up.pelvisOnBoard - 0.25 < 1.0 && up.feetOnBoard && up.feetOnBoard.every((y) => Math.abs(y - 0.25) < 0.2), { stood, up, deck: +deck.toFixed(3) });
await shot('e-standing-on-a-wave');

// ---- F: off the board
await page.evaluate(() => { const n = window.__nlw, g = n.host.game, p = g.state.players[n.playerId]; p.psurf.mode = 'lie'; p.psurf.wave = null; n.refresh(); });
await page.waitForTimeout(800);
const offText = await page.evaluate(() => { const p = window.__nlw.prompt(); return p ? p.text : null; });
const off = await page.evaluate(() => window.__nlw.offBoard());
await page.waitForTimeout(1200);
const after = await page.evaluate(() => ({ astride: window.__nlw.view.self.astride, swimming: !!window.__nlw.view.self.swimming }));
check('F: off the board, into the water or onto the bank', /^Off the board/.test(offText || '') && off.ok && !after.astride, { offText, off, after });

// ---- G: what it costs
await go(X, bankZ - 2, 0);
await page.waitForTimeout(6000);
const mem = await page.evaluate(() => { const n = window.__nlw; return { pictures: +((n.graphics.pictures || 0) / 1048576).toFixed(1), buffers: +((n.graphics.buffers || 0) / 1048576).toFixed(1), waves: n.surfView.waves, perf: { fps: n.perf.fps, calls: n.perf.calls, triangles: n.perf.triangles } }; });
console.log('by the waves:', JSON.stringify(mem));
check('G: a phone at Medium by the waves: the graphics card under 135 MB', !PHONE || mem.pictures + mem.buffers < 135, mem);
const lost = await lostPictures(page);
check('G: no picture handed to the graphics card after the page had let it go; nothing in the console', lost === 0 && errors.length === 0, { lost, errors: errors.slice(0, 5) });
writeFileSync(resolve(out, 'surf.json'), JSON.stringify({ figure, seenWaves, lying, strokes: strokes.length, refused, stood, up, off, mem }, null, 1));
await browser.close(); server.close();
const passed = results.filter(Boolean).length;
console.log(passed === results.length ? `All ${results.length} checks passed.` : `${passed} of ${results.length} checks passed.`);
process.exit(passed === results.length ? 0 : 1);
