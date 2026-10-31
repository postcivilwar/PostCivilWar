// On the River Niger by the town, in a headless browser, on the website as it is served with its server and a database
// (31 October 2026, stage 4 of the owner's brief of 30 October: "the navel ship should be only 3 in number and not for
// sale, it should be on the river, driven by NPCs, but can still be hijacked ... Once a user buys a boat or any item, it
// is theirs"), with a phone's settings or a computer's:
//  A  the speedboat bought at the sports mall with the arrival money; Property says to take it out from the water
//  B  at the jetty, "Take your speedboat out": in the water beside it, drawn without its stand, the player at its wheel
//  C  driven out: up to about 60 km/h, its bow up as it climbs onto the plane, its wake behind it, banked into a turn;
//     astern it slows; heard
//  D  never through the bank, the jetty or a ship: against them it stops
//  E  the navy's three ships on patrol, drawn on the river; alongside one, "Climb aboard the naval ship": the helm is the
//     player's, the police's stars; the ship slow to gather way; the player unseen in its wheelhouse
//  F  off the ship, down into the boat alongside; brought in to the jetty, "Step ashore": it is left moored there, drawn
//  G  at night: the ships' lamps lit
//  H  what it costs: a phone at Medium under 135 MB on its graphics card with the ships near; nothing in the console; no
//     picture lost
//   ../server/with-postgres.sh node test/water.mjs [shots folder] [phone]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDevServer } from '../../server/dev.mjs';
import { pastQuestion, enterTown, watchPictures, lostPictures } from './start.mjs';
import { SPORTS_MALL as M } from '../src/sim/zones/asaba-sports.js';
import { ZONE_JETTY } from '../src/sim/zone.js';
import { NAVAL } from '../src/sim/naval.js';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

if (!process.env.PCW_DATABASE_URL) { console.error('PCW_DATABASE_URL is not set: run this with server/with-postgres.sh'); process.exit(2); }
const out = resolve(process.argv[2] || '/tmp/water-shots');
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
await page.fill('#account-username', `Boater_${tag}`); await page.fill('#account-password', 'a password for the river test');
await page.click('#account-submit');
await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 120000 });
await pastQuestion(page);
await page.fill('#name', 'River Test');
await enterTown(page, { tap: PHONE, wait: 900000 });
await page.waitForFunction(() => window.__nlw.me && window.__nlw.me.mixer, null, { timeout: 600000 });
if (PHONE) await page.evaluate(() => window.__nlw.setGraphics('medium'));
const setHour = (h) => page.evaluate((h) => { const n = window.__nlw, g = n.host.game; const hour = n.view.clock.hourFloat; n.skip(((24 + h - hour) % 24) || 24); g.state.weather = { kind: 'clear', until: g.state.t + 24 * 3600 }; for (const id of ['toasts', 'notices']) { const el = document.getElementById(id); if (el) el.hidden = true; } }, h);
await setHour(10.5);
const go = (x, z, h) => page.evaluate(([x, z, h]) => { const n = window.__nlw; n.place(x, z); n.face(h); }, [x, z, h]);
const kmh = (v) => Math.round(v * 3.6 * 10) / 10;
const sample = () => page.evaluate(() => {
  const n = window.__nlw, b = n.boatState, v = n.boatView;
  const wake = n.scene.getObjectByName('boat-wake');
  const m = v.model('drive');
  return { t: performance.now() / 1000, speed: b.speed, pitch: b.pitch, bank: b.bank, heading: n.predicted.heading, at: [n.predicted.x, n.predicted.z], ready: v.ready('drive'), wake: !!(wake && wake.visible), parts: m ? m.frame.children.length : 0, sound: n.audio.status ? n.audio.status() : null };
});
// Held until `done(sample, all)`, or for `most` seconds, sampling as often as the page lets: on this machine a frame drawn
// in software can take seconds, longer than the game's longest step (half a second), and a boat's time then runs slower
// than the clock's, so a test holds on until it is going, not for a fixed time (30 October 2026).
const holdUntil = async (keys, done, most = 120, every = 0.3) => { for (const k of keys) await page.keyboard.down(k); const got = []; const t0 = Date.now(); while (Date.now() - t0 < most * 1000) { await page.waitForTimeout(every * 1000); const q = await sample(); got.push(q); if (done(q, got)) break; } for (const k of keys) await page.keyboard.up(k); return got; };
const behindBoat = (dist = 9, pitch = 0.22) => page.evaluate(([dist, pitch]) => { const n = window.__nlw; n.cam.yaw = n.predicted.heading + 0.5; n.cam.pitch = pitch; n.cam.dist = dist; n.cam.lastDrag = 1e9; n.rig.snap(n.cam); }, [dist, pitch]);

// ---- A: bought at the mall
await go(M.entry.x, M.entry.z + 0.8, Math.PI);
await page.evaluate(() => window.__nlw.goSports('in'));
await page.waitForFunction(() => window.__nlw.sports.inside && !document.getElementById('fade').classList.contains('on'), null, { timeout: 30000 });
const d = M.displays.find((q) => q.item === 'speedboat');
await go(d.x + Math.sin(d.h) * (d.r + 0.6), d.z + Math.cos(d.h) * (d.r + 0.6), d.h + Math.PI);
await page.evaluate(() => window.__nlw.askAboutSport('speedboat'));
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
await page.waitForFunction(() => { const o = window.__nlw.view.self.ownBoats; return o && o.boats.includes('speedboat'); }, null, { timeout: 60000 }).catch(() => {});
const owns = await page.evaluate(() => window.__nlw.view.self.ownBoats);
check('A: the speedboat bought at the mall with the arrival money (600 TR); the town knows it is theirs', bought && owns && owns.boats.includes('speedboat'), { bought, owns });
// Property: take it out (here, far from the water: told where to go)
await page.evaluate(() => window.__nlw.ui.openPhone('property', {}));
await page.waitForSelector('#my-assets', { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(1500);
await page.evaluate(() => { const card = [...document.querySelectorAll('#my-assets .assetcard')].find((c) => /Speedboat/i.test(c.textContent)); if (card) card.click(); });
const launchButton = await page.waitForSelector('#launch-boat', { timeout: 30000 }).then(() => true, () => false);
await page.click('#launch-boat').catch(() => {});
await page.waitForTimeout(1200);
const notHere = await page.evaluate(() => ({ astride: window.__nlw.view.self.astride, said: [...document.querySelectorAll('#notices *, #toasts *')].map((e) => e.textContent).join(' | ') }));
check('A: in Property, "Take it out"; away from the water it is not, and says where to go', launchButton && !notHere.astride, notHere);
await page.evaluate(() => { if (window.__nlw.ui.isOpen()) window.__nlw.ui.close(); });

// ---- B: at the jetty
const jx = (ZONE_JETTY.x0 + ZONE_JETTY.x1) / 2;
await go(jx, ZONE_JETTY.z1 - 5, 0);
await page.waitForTimeout(1500);
const offered = await page.evaluate(() => { const n = window.__nlw; n.refresh(); const p = n.prompt(); return p ? p.text : null; });
check('B: on the jetty, "Take your speedboat out" offered', offered === 'Take your speedboat out', offered);
await page.evaluate(() => { const p = window.__nlw.prompt(); if (p) p.run(); });
await page.waitForFunction(() => window.__nlw.ownBoat() === 'speedboat', null, { timeout: 20000 }).catch(() => {});
await page.waitForFunction(() => window.__nlw.boatView.ready('drive'), null, { timeout: 240000 }).catch(() => {});
await page.waitForTimeout(1500);
await behindBoat(8, 0.25);
const inB = await page.evaluate(() => { const n = window.__nlw, m = n.boatView.model('drive'); const names = m ? m.spec.parts : []; return { boat: n.ownBoat(), ready: n.boatView.ready('drive'), stand: names.includes('stand'), meshes: m ? m.frame.children.filter((c) => c.isMesh).length : 0, y: m ? +m.group.position.y.toFixed(3) : null, at: [n.predicted.x, n.predicted.z] }; });
check('B: in the water beside the jetty, drawn without the stand it stands on at the mall', inB.boat === 'speedboat' && inB.ready && inB.y < 0, inB);
const seat = await page.evaluate(() => { const n = window.__nlw, me = n.me, m = n.boatView.model('drive'); if (!me || !m) return null; const l = n.sportView.limbs(me); const hips = l && l.pelvis ? l.pelvis : me.group.position; const s = m.spec.seats[0]; const seatAt = m.frame.localToWorld(new THREE.Vector3(s[0], s[1], s[2])); return { gap: +hips.distanceTo(seatAt).toFixed(3), visible: me.group.visible }; });
check('B: the player in the right-hand seat, at its wheel', !!seat && seat.visible && seat.gap < 0.35, seat);
await shot('b-speedboat-at-the-jetty');

// ---- C: driven out (along the river, east from the jetty: straight across, it is at the far bank before it is flat out;
// first out from beside the jetty, where turned along the river her stern would be over it, and stopped there)
await page.evaluate(() => { const n = window.__nlw; n.face(0); n.boatState.heading = 0; });
await holdUntil(['w'], (q) => q.at[1] > 186, 180);
await holdUntil(['s'], (q) => Math.abs(q.speed) < 0.4, 120);
await page.evaluate(() => { const n = window.__nlw; n.face(Math.PI / 2); n.boatState.heading = Math.PI / 2; n.boatState.speed = 0; });
await page.waitForTimeout(1500);
const going = await holdUntil(['w'], (q, got) => kmh(q.speed) >= 55 && got.length >= 8, 300);
const fast = going[going.length - 1];
check('C: flat out it gathers speed to about 60 km/h', kmh(Math.max(...going.map((q) => q.speed))) > 45 && kmh(Math.max(...going.map((q) => q.speed))) <= 61, going.map((q) => kmh(q.speed)));
check('C: its bow up as it climbs onto the plane, and down again on it', Math.max(...going.map((q) => q.pitch)) > 0.05 && fast.pitch < Math.max(...going.map((q) => q.pitch)), going.map((q) => +q.pitch.toFixed(3)));
check('C: its wake behind it', going.some((q) => q.wake), going.map((q) => q.wake));
await behindBoat(10, 0.2); await page.keyboard.down('w'); await page.waitForTimeout(600); await shot('c1-speedboat-on-the-plane'); await page.keyboard.up('w');
const turning = await holdUntil(['w', 'd'], (q, got) => Math.abs(q.heading - got[0].heading) > 0.8 && got.length >= 3, 120);
check('C: steered, it turns, banked into the turn', Math.abs(turning[turning.length - 1].heading - turning[0].heading) > 0.4 && turning.some((q) => Math.abs(q.bank) > 0.04), turning.map((q) => [+q.heading.toFixed(2), +q.bank.toFixed(3)]));
await behindBoat(10, 0.2); await shot('c2-speedboat-turning');
const astern = await holdUntil(['s'], (q, got) => q.speed < got[0].speed - 6 && got.length >= 2, 120);
check('C: astern, it slows', astern[astern.length - 1].speed < astern[0].speed - 4, astern.map((q) => kmh(q.speed)));
check('C: its motor heard', !!fast.sound, null);

// ---- D: never through the bank
await page.evaluate(() => { const n = window.__nlw; n.face(Math.PI); n.boatState.heading = Math.PI; });
const toBank = await holdUntil(['w'], (q, got) => got.length >= 4 && q.speed < 0.5 && got.some((g) => g.speed > 3), 240, 0.4);
const last = toBank[toBank.length - 1];
check('D: driven at the bank, it stops against it, still in the water', last.at[1] > 150 && toBank.some((q) => q.speed < 0.5) , toBank.map((q) => +q.at[1].toFixed(1)));

// ---- E: the navy's ships
const ships = await page.evaluate(() => { const n = window.__nlw; return { list: n.view.naval.map((s) => ({ n: s.n, x: s.x, z: s.z, mode: s.mode })), drawn: n.shipView.shown() }; });
await page.waitForFunction(() => window.__nlw.shipView.shown().some((s) => s.drawn), null, { timeout: 240000 }).catch(() => {});
const drawnShips = await page.evaluate(() => window.__nlw.shipView.shown());
check('E: the navy\'s three ships on patrol on the river, drawn', ships.list.length === 3 && ships.list.every((s) => s.mode === 'patrol') && drawnShips.some((s) => s.drawn), { ships, drawnShips });
// alongside the nearest: the boat put four metres off its side
const along = await page.evaluate(([beam]) => {
  const n = window.__nlw, g = n.host.game, p = g.state.players[n.playerId];
  const s = g.internals.naval.ships().slice().sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
  for (const k of [1, -1]) {
    const side = { x: Math.cos(s.h) * k, z: -Math.sin(s.h) * k };
    const x = s.x + side.x * (beam / 2 + 4), z = s.z + side.z * (beam / 2 + 4);
    if (z < 160) continue;
    p.pboat.x = x; p.pboat.z = z; p.pboat.h = s.h; p.x = x; p.z = z; p.heading = s.h; p.lastMoveAt = g.state.real;
    n.predicted.x = x; n.predicted.z = z; n.predicted.heading = s.h; n.boatState.speed = 0; n.boatState.heading = s.h; n.refresh();
    n.cam.yaw = s.h + Math.PI / 2 * k; n.cam.pitch = 0.18; n.cam.dist = 22; n.cam.lastDrag = 1e9; n.rig.snap(n.cam);
    return { n: s.n, x, z };
  }
  return null;
}, [NAVAL.beam]);
await page.waitForTimeout(2500);
const boardOffered = await page.evaluate(() => { const n = window.__nlw; n.refresh(); const p = n.prompt(); return p ? p.text : null; });
await shot('e1-alongside-a-naval-ship');
check('E: alongside a ship, "Climb aboard the naval ship" offered', boardOffered === 'Climb aboard the naval ship', { along, boardOffered });
await page.evaluate(() => window.__nlw.boardShip());
await page.waitForFunction(() => window.__nlw.aboardShip() !== null, null, { timeout: 20000 }).catch(() => {});
await page.waitForFunction(() => window.__nlw.view.self.law.stars >= 2, null, { timeout: 30000 }).catch(() => {});
const aboard = await page.evaluate(() => { const n = window.__nlw; return { ship: n.aboardShip(), stars: n.view.self.law.stars, seen: n.me.group.visible, mode: n.mode }; });
check('E: aboard: the helm is the player\'s, the police\'s stars for taking a vehicle, the player unseen in its wheelhouse', aboard.ship !== null && aboard.stars === 2 && !aboard.seen && aboard.mode === 'ship', aboard);
await page.evaluate(() => { const n = window.__nlw, p = n.host.game.state.players[n.playerId]; p.law.crimes = []; p.law.stars = 0; p.law.state = 'normal'; });
const shipGoing = await holdUntil(['w'], (q, got) => got.length >= 6 && q.speed > 0.3, 240, 0.5);
check('E: a ship gathers way slowly (after ten seconds well under its top speed of 22 km/h)', shipGoing[shipGoing.length - 1].speed > 0.2 && kmh(shipGoing[shipGoing.length - 1].speed) < 12, shipGoing.map((q) => kmh(q.speed)));
await page.evaluate(() => { const n = window.__nlw; n.cam.yaw = n.predicted.heading + 0.7; n.cam.lastDrag = 1e9; n.rig.snap(n.cam); });
await shot('e2-at-the-helm');
await holdUntil(['s'], (q) => Math.abs(q.speed) < 0.2, 240, 1);
// back astern to the boat she was boarded from (it lies where it was left), and the way taken off her there
const boatLeft = await page.evaluate(() => { const o = window.__nlw.view.self.ownBoats; return ((o && o.moored) || []).find((m) => m.boat === 'speedboat') || null; });
const backTo = boatLeft ? await holdUntil(['s'], (q) => Math.hypot(q.at[0] - boatLeft.x, q.at[1] - boatLeft.z) < 20, 400, 0.5) : [];
await holdUntil(['w'], (q) => Math.abs(q.speed) < 0.2, 240, 0.5);

// ---- F: off the ship into the boat; ashore at the jetty
const off = await page.evaluate(() => window.__nlw.leaveBoat());
await page.waitForTimeout(1000);
check('F: off the ship, down into the boat alongside', off.ok && off.into === 'boat' && (await page.evaluate(() => window.__nlw.ownBoat())) === 'speedboat', { off, boatLeft, back: backTo.length ? backTo[backTo.length - 1].at : null });
await page.evaluate(([x0, x1, z1]) => {
  const n = window.__nlw, g = n.host.game, p = g.state.players[n.playerId];
  const x = x1 + 2.2, z = z1 - 8;
  p.pboat.x = x; p.pboat.z = z; p.pboat.h = 0; p.x = x; p.z = z; p.heading = 0; p.lastMoveAt = g.state.real;
  n.predicted.x = x; n.predicted.z = z; n.predicted.heading = 0; n.boatState.speed = 0; n.boatState.heading = 0; n.refresh();
}, [ZONE_JETTY.x0, ZONE_JETTY.x1, ZONE_JETTY.z1]);
await page.waitForTimeout(1500);
const ashorePrompt = await page.evaluate(() => { const n = window.__nlw; n.refresh(); const p = n.prompt(); return p ? p.text : null; });
check('F: brought in by the jetty, "Step ashore" offered', ashorePrompt === 'Step ashore', ashorePrompt);
await page.evaluate(() => { const p = window.__nlw.prompt(); if (p) p.run(); });
await page.waitForTimeout(2500);
const moored = await page.evaluate(() => { const n = window.__nlw; return { astride: n.view.self.astride, moored: n.view.self.ownBoats.moored, drawn: n.boatView.keys() }; });
await page.evaluate(() => { const n = window.__nlw; n.cam.yaw = 1.2; n.cam.pitch = 0.3; n.cam.dist = 9; n.cam.lastDrag = 1e9; n.rig.snap(n.cam); });
await page.waitForTimeout(1500);
await shot('f-moored-at-the-jetty');
check('F: ashore; the boat moored where it was left, drawn there', !moored.astride && moored.moored.length === 1 && moored.drawn.includes('moored:own'), moored);

// ---- G: at night
await setHour(21.5);
await go(jx, ZONE_JETTY.z1 - 2, 0);
await page.evaluate(() => { const n = window.__nlw; n.cam.yaw = 0; n.cam.pitch = 0.05; n.cam.dist = 6; n.cam.lastDrag = 1e9; n.rig.snap(n.cam); });
await page.waitForTimeout(PHONE ? 15000 : 9000);
const lit = await page.evaluate(() => { const n = window.__nlw; const out = []; for (const s of n.shipView.shown()) { const m = n.shipView.model(s.n); if (!m) continue; let on = 0; m.frame.traverse((o) => { if (o.isMesh && o.geometry && o.geometry.type === 'SphereGeometry' && o.visible) on += 1; }); out.push(on); } return { night: n.night, lamps: out }; });
await shot('g-ships-at-night');
check('G: at night the ships\' lamps are lit', lit.lamps.length > 0 && lit.lamps.every((k) => k >= 3), lit);

// ---- H: what it costs
await setHour(10.5);
await go(jx, ZONE_JETTY.z1 - 2, 0);
await page.waitForTimeout(8000);
const mem = await page.evaluate(() => { const n = window.__nlw; return { pictures: +((n.graphics.pictures || 0) / 1048576).toFixed(1), buffers: +((n.graphics.buffers || 0) / 1048576).toFixed(1), ships: n.shipView.shown(), perf: { fps: n.perf.fps, calls: n.perf.calls, triangles: n.perf.triangles } }; });
console.log('at the jetty with the ships in sight:', JSON.stringify(mem));
check('H: a phone at Medium on the jetty with the ships in sight: the graphics card under 135 MB', !PHONE || mem.pictures + mem.buffers < 135, mem);
const lost = await lostPictures(page);
check('H: no picture handed to the graphics card after the page had let it go; nothing in the console', lost === 0 && errors.length === 0, { lost, errors: errors.slice(0, 5) });
writeFileSync(resolve(out, 'water.json'), JSON.stringify({ owns, inB, seat, going, turning, astern, toBank, ships, aboard, shipGoing, off, moored, lit, mem }, null, 1));
await browser.close(); server.close();
const passed = results.filter(Boolean).length;
console.log(passed === results.length ? `All ${results.length} checks passed.` : `${passed} of ${results.length} checks passed.`);
process.exit(passed === results.length ? 0 : 1);
