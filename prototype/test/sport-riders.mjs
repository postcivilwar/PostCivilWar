// The town's people out on their bicycles, skateboards and skates, and taking one (31 October 2026, stage 3 of the
// owner's brief of 30 October: "NPCs should also be seen using these items on the streets—10 NPCs riding bicycles, 5 on
// skateboards, and 5 on skating shoes. Ensure each NPC realistically pedals, balances, and maneuvers their equipment,
// with smooth wheel rotation and realistic motions. The player must also be able to hijack these bicycles ... hijacked
// bikes cannot be resold"). The game played on the website on this machine, with a phone's settings or a computer's:
//  A  by day the town's riders out on its roads; the nearest few drawn as their own figures on the owner's models (no
//     more than the level draws), none drawn standing on nothing
//  B  a cyclist: stopped at the roadside, a foot down; going, sitting on the saddle with the feet on the pedals going
//     round with the cranks and the hands on the grips, the wheels turning; drawn smoothly, never a step back or a jump
//  C  a skateboarder pushing (a foot down on the road, then back on the board) and a skater striding (the feet out and
//     back in turn)
//  D  a cyclist stood at the roadside: "Take the bicycle from ..." offered beside them; taken: on it, the rider off and
//     running, the police's stars; pedalled away as one's own, the feet on the pedals
//  E  never the player's: not among what the website says they own; got off, it stands where it was left, drawn there;
//     "Ride the bicycle you took" offered; back on
//  F  caught by the police: it goes back to its owner, who walks to it and rides off again
//  G  a cyclist rings the bell for someone on foot in the road ahead
//  H  what it costs: a phone at Medium under 135 MB on its graphics card with the riders near; frames a second; nothing
//     in the console; no picture lost
//   ../server/with-postgres.sh node test/sport-riders.mjs [shots folder] [phone]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDevServer } from '../../server/dev.mjs';
import { pastQuestion, enterTown, watchPictures, lostPictures } from './start.mjs';
// (how many the page draws, as sport-riders-view.js has it: read from its text, as the module itself needs the page's
// three.js to load)
const seenText = readFileSync(new URL('../src/client/sport-riders-view.js', import.meta.url), 'utf8');
const RIDERS_SEEN = { full: { most: Number(/full: Object\.freeze\(\{ most: (\d+)/.exec(seenText)[1]) }, lite: { most: Number(/lite: Object\.freeze\(\{ most: (\d+)/.exec(seenText)[1]) } };
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

if (!process.env.PCW_DATABASE_URL) { console.error('PCW_DATABASE_URL is not set: run this with server/with-postgres.sh'); process.exit(2); }
const out = resolve(process.argv[2] || '/tmp/sport-riders-shots');
const PHONE = process.argv[3] === 'phone';
mkdirSync(out, { recursive: true });
const server = createDevServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); };
const tag = Math.random().toString(36).slice(2, 6);
const LIMIT = PHONE ? RIDERS_SEEN.lite.most : RIDERS_SEEN.full.most;

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
await page.fill('#account-username', `Riders_${tag}`); await page.fill('#account-password', 'a password for the riders test');
await page.click('#account-submit');
await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 120000 });
await pastQuestion(page);
await page.fill('#name', 'Town Riders Test');
await enterTown(page, { tap: PHONE, wait: 900000 });
await page.waitForFunction(() => window.__nlw.me && window.__nlw.me.mixer, null, { timeout: 600000 });
if (PHONE) await page.evaluate(() => window.__nlw.setGraphics('medium'));
// 10.30 in the morning, clear; the notices out of the pictures
await page.evaluate(() => { const n = window.__nlw, g = n.host.game; const hour = n.view.clock.hourFloat; n.skip(((24 + 10.5 - hour) % 24) || 24); g.state.weather = { kind: 'clear', until: g.state.t + 24 * 3600 }; for (const id of ['toasts', 'notices']) { const el = document.getElementById(id); if (el) el.hidden = true; } });
// (the town's cars held at home: a car stopped in a rider's way holds them up, and this test is of the riders; the
// traffic's own test, and test/sport-riders.test.mjs, have the cars and the riders together)
await page.evaluate(() => { const T = window.__nlw.host.game.internals.traffic; T.tick = () => {}; for (const c of T.cars) if (c.mode !== 'taken' && c.mode !== 'kept') { c.mode = 'off'; c.v = 0; } });
const fps = async (ms = 8000) => page.evaluate((ms) => new Promise((done) => { let f = 0; const t0 = performance.now(); const tick = () => { f += 1; if (performance.now() - t0 < ms) requestAnimationFrame(tick); else done(+(f * 1000 / (performance.now() - t0)).toFixed(1)); }; requestAnimationFrame(tick); }), ms);

// One of the town's riders of `item` out on the road (the nearest to the motor park first), held standing at the roadside
// where they are, and the player put on the near side of them, `back` metres behind and `side` metres to their right
// (beyond the road's edge where that can be walked), the camera turned to them. Gives the rider, or null.
async function holdOne(item, back = -9, side = 2.6) {
  return page.evaluate(([item, back, side]) => {
    const n = window.__nlw, g = n.host.game, sr = g.internals.sportRiders;
    const list = sr.riders().filter((r) => r.item === item && r.mode === 'ride' && r.v > 1.5 && !r.takenBy).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
    for (const r of list) {
      // (somewhere on foot beside them: to their right, else to their left, nearer or further)
      const fx = Math.sin(r.h), fz = Math.cos(r.h), rx = -Math.cos(r.h), rz = Math.sin(r.h);
      for (const s of [side, side + 1, side + 2, -side - 2.5, -side - 3.5]) {
        const x = r.x + fx * back + rx * s, z = r.z + fz * back + rz * s;
        if (!n.walkable(x, z)) continue;
        r.mode = 'stop'; r.v = 0; r.until = g.state.real + 600;
        n.place(x, z);
        const look = Math.atan2(r.x - x, r.z - z);
        n.face(look); n.cam.yaw = look; n.cam.pitch = 0.12; n.cam.dist = 4.2; n.cam.lastDrag = 1e9; n.rig.snap(n.cam);
        return { n: r.n, i: r.i, item: r.item, road: r.road, x: r.x, z: r.z, h: r.h, at: [x, z] };
      }
    }
    return null;
  }, [item, back, side]);
}
// until the rider's figure is drawn on the owner's model (fetched the first time), up to `seconds`
const drawn = (n, seconds = 240) => page.waitForFunction((n) => { const v = window.__nlw.sportRidersView; const rig = v.rigOf(n); return !!(rig && rig.group.visible && v.view.ready(`peer:${n}`)); }, n, { timeout: seconds * 1000 }).then(() => true, () => false);
// the drawn rider, now: where the figure's hands and feet are against the grips and pedals (or the ground), how far the
// wheels have rolled, how far through the pedals or the push or the stride, the figure's place
const sample = (n) => page.evaluate((n) => {
  const nl = window.__nlw, v = nl.sportRidersView, rig = v.rigOf(n), key = `peer:${n}`;
  if (!rig) return null;
  const limbs = v.view.limbs(rig), pedals = v.view.pedals(key), grips = v.view.grips(key), st = v.view.stateOf(key);
  const d = (a, b) => (a && b ? +a.distanceTo(b).toFixed(3) : null);
  const p = rig.group.position;
  const ground = nl.ground(p.x, p.z);
  const r = nl.host.game.internals.sportRiders.riders()[n];
  return {
    t: performance.now() / 1000, x: p.x, z: p.z, ground, visible: rig.group.visible, state: st, speed: r.v, mode: r.mode,
    feet: limbs && limbs.feet[0] && limbs.feet[1] ? limbs.feet.map((f) => [+f.x.toFixed(3), +f.y.toFixed(3), +f.z.toFixed(3)]) : null,
    pelvis: limbs && limbs.pelvis ? +limbs.pelvis.y.toFixed(3) : null,
    footToPedal: pedals && limbs ? [d(limbs.feet[0], pedals[0]), d(limbs.feet[1], pedals[1])] : null,
    handToGrip: grips && limbs ? [d(limbs.hands[0], grips[0]), d(limbs.hands[1], grips[1])] : null,
  };
}, n);
// Watched until `done(sample, all)`, or for `most` seconds (on this machine a frame drawn in software can take seconds,
// longer than the game's longest step: the town's time then runs slower than the clock's, 30 October 2026)
const watch = async (n, done, most = 180, every = 0.25) => { const got = []; const t0 = Date.now(); while (Date.now() - t0 < most * 1000) { const s = await sample(n); if (s) { got.push(s); if (done(s, got)) break; } await page.waitForTimeout(every * 1000); } return got; };
const release = (n) => page.evaluate((n) => { const g = window.__nlw.host.game, r = g.internals.sportRiders.riders()[n]; r.mode = 'ride'; r.next = 5000; }, n);
const kmh = (v) => Math.round(v * 3.6 * 10) / 10;

// ---- A: by day, out on the roads
await page.waitForTimeout(PHONE ? 20000 : 12000);
const seenA = await page.evaluate(() => {
  const n = window.__nlw, sr = n.host.game.internals.sportRiders;
  const all = sr.riders();
  return { out: all.filter((r) => ['ride', 'stop', 'turn'].includes(r.mode)).length, byKind: sr.audit().byKind, near: (n.view.sportRiders || []).length };
});
check('A: by day the town\'s twenty riders (10 bicycles, 5 skateboards, 5 on skates) out on its roads', seenA.out >= 14 && seenA.byKind.bicycle === 10 && seenA.byKind.skateboard === 5 && seenA.byKind['inline-skates'] === 5, seenA);

// ---- B: a cyclist
const bike = await holdOne('bicycle');
check('B: a cyclist on the road, held standing at the roadside beside the player', !!bike, bike);
if (!bike) { await browser.close(); server.close(); process.exit(1); }
const bikeDrawn = await drawn(bike.n);
await page.waitForTimeout(1500);
const still = await sample(bike.n);
check('B: drawn as their own figure on the owner\'s bicycle', bikeDrawn && still && still.visible, { drawn: bikeDrawn, visible: still && still.visible });
check('B: stopped, a foot down on the road', !!(still && still.state && still.state.down > 0.8 && still.feet && still.feet[0][1] - still.ground < 0.16), still && { down: still.state && still.state.down, foot: still.feet && still.feet[0], ground: still.ground });
await shot('b1-cyclist-stopped');
const memB = await page.evaluate(() => { const n = window.__nlw; return { pictures: +((n.graphics.pictures || 0) / 1048576).toFixed(1), buffers: +((n.graphics.buffers || 0) / 1048576).toFixed(1), shown: n.sportRidersView.shown().length, made: n.sportRidersView.stats.made }; });
memB.fps = await fps(6000);
// off again: watched as they ride on past the player, and each frame where the figure is drawn
await release(bike.n);
const frames = page.evaluate((n) => new Promise((done) => { const v = window.__nlw.sportRidersView; const rows = []; const t0 = performance.now(); let last = t0; const f = () => { const now = performance.now(); const rig = v.rigOf(n); const r = window.__nlw.host.game.internals.sportRiders.riders()[n]; if (rig) rows.push({ x: rig.group.position.x, z: rig.group.position.z, h: r.h, v: r.v, dt: (now - last) / 1000 }); last = now; if (rows.length < 24 && now - t0 < 120000) requestAnimationFrame(f); else done(rows); }; requestAnimationFrame(f); }), bike.n);
await page.waitForTimeout(1500);
await shot('b2-cyclist-going');
const going = await watch(bike.n, (q, got) => got.length >= 8 && kmh(q.speed) >= 12.5, 240, 0.3);
const rows = await frames;
const moving = going.filter((q) => q.speed > 1.5);
const fast = moving.length ? Math.max(...moving.map((q) => q.speed)) : 0;
check('B: off again at a cyclist\'s pace (13 to 19 km/h)', kmh(fast) >= 12 && kmh(fast) <= 19.5, going.map((q) => kmh(q.speed)));
const onPedals = moving.filter((q) => q.footToPedal && q.footToPedal.every((d) => d !== null)).map((q) => Math.max(...q.footToPedal));
check('B: going, the feet on the pedals as they go round (each ankle within a hand of its pedal)', onPedals.length >= 4 && onPedals.every((d) => d < 0.17), onPedals);
const onGrips = moving.filter((q) => q.handToGrip && q.handToGrip.every((d) => d !== null)).map((q) => Math.max(...q.handToGrip));
check('B: the hands on the grips', onGrips.length >= 4 && onGrips.every((d) => d < 0.14), onGrips);
const rolled = going.length > 1 && going[going.length - 1].state && going[0].state ? going[going.length - 1].state.travelled - going[0].state.travelled : 0;
const turned = going.slice(1).reduce((a, q, k) => a + (q.state && going[k].state ? ((q.state.phase - going[k].state.phase + Math.PI * 2) % (Math.PI * 2)) : 0), 0);
// (at half a frame a second, as here in software on a phone's settings, the cranks go round more than once between two
// frames, and the angle alone undercounts: then they are seen going round by their angle changing from frame to frame)
const changes = going.slice(1).filter((q, k) => q.state && going[k].state && Math.abs(q.state.phase - going[k].state.phase) > 0.05).length;
check('B: the wheels turn as it rolls, and the cranks go round', rolled > 8 && (turned > Math.PI * 2 || changes >= 4), { rolled: +rolled.toFixed(1), cranks: +(turned / (Math.PI * 2)).toFixed(1), changes });
let worst = 0, back = 0, moved = 0;
for (let k = 1; k < rows.length; k += 1) {
  const a = rows[k - 1], b = rows[k];
  const dx = b.x - a.x, dz = b.z - a.z, step = Math.hypot(dx, dz);
  if (step > 0.001) { const along = dx * Math.sin(b.h) + dz * Math.cos(b.h); if (along < -0.05) back += 1; }
  worst = Math.max(worst, step - (Math.max(a.v, b.v) * b.dt * 1.5 + 0.25));
  moved += step;
}
check('B: drawn smoothly along the road: never a step back, never a jump', moved > 10 && back === 0 && worst <= 0, { frames: rows.length, moved: +moved.toFixed(1), back, worst: +worst.toFixed(2) });

// ---- C: a skateboarder and a skater
const board = await holdOne('skateboard');
check('C: a skateboarder on the road', !!board, board);
if (board) {
  const ok = await drawn(board.n);
  await page.waitForTimeout(1000);
  const s0 = await sample(board.n);
  check('C: the skateboarder drawn standing on the board, both feet on its deck', ok && !!(s0 && s0.feet && s0.feet.every((f) => f[1] - s0.ground > 0.08 && f[1] - s0.ground < 0.34)), s0 && { feet: s0.feet, ground: s0.ground });
  await shot('c1-skateboarder');
  await release(board.n);
  // (a figure's ankle stands up to 0.14 m above its sole in a heeled shoe: on the road it is that high)
  const isDown = (q) => q.state && q.state.push > 0.6 && q.feet && Math.min(q.feet[0][1], q.feet[1][1]) - q.ground < 0.19;
  const isOn = (q) => q.state && q.state.push < 0.2 && q.feet && q.feet.every((f) => f[1] - q.ground > 0.08);
  // (watched until both are seen, or a good while: a frame drawn here in software can take more than a second, and a
  // fixed number of looks can all fall within one push)
  const g = await watch(board.n, (q, got) => (got.filter(isDown).length >= 2 && got.filter(isOn).length >= 2) || got.length >= 90, 300, 0.25);
  const down = g.filter(isDown);
  const on = g.filter(isOn);
  check('C: pushing: a foot down to the road beside the board, then back on it', down.length >= 2 && on.length >= 2, { down: down.length, on: on.length, of: g.length });
  await shot('c2-skateboarder-going');
}
const skates = await holdOne('inline-skates');
check('C: a skater on the road', !!skates, skates);
if (skates) {
  const ok = await drawn(skates.n);
  await release(skates.n);
  await page.waitForTimeout(1500);
  const g = await watch(skates.n, (q, got) => got.length >= 14, 300, 0.2);
  const spread = g.filter((q) => q.feet && q.speed > 1).map((q) => Math.hypot(q.feet[0][0] - q.feet[1][0], q.feet[0][2] - q.feet[1][2]));
  check('C: the skater striding: the feet out and back in turn', ok && spread.length >= 5 && Math.max(...spread) - Math.min(...spread) > 0.15, { least: spread.length ? +Math.min(...spread).toFixed(2) : null, most: spread.length ? +Math.max(...spread).toFixed(2) : null });
  await shot('c3-skater');
}
const seenNow = await page.evaluate(() => { const n = window.__nlw, v = n.sportRidersView; return { shown: v.shown().length, drawn: v.stats.drawn, seated: v.stats.seated, near: (n.view.sportRiders || []).filter((r) => typeof r.person === 'number').length }; });
check(`A: the nearest few drawn, no more than the level allows (${LIMIT}), each on what they ride`, seenNow.shown >= 1 && seenNow.shown <= LIMIT && seenNow.seated === seenNow.drawn, seenNow);

// ---- D: taking a bicycle from its rider
const prey = await holdOne('bicycle', 0.4, 1.3);
check('D: a cyclist stood at the roadside, the player beside them', !!prey, prey);
if (!prey) { await browser.close(); server.close(); process.exit(1); }
await page.waitForTimeout(1500);
const offered = await page.evaluate(() => { const n = window.__nlw; n.refresh(); const p = n.prompt(); return p ? p.text : null; });
await shot('d1-take-offered');
check('D: "Take the bicycle from ..." offered beside them', /^Take the bicycle from /.test(offered || ''), offered);
const took = await page.evaluate((n) => window.__nlw.takeSport(n), prey.n);
await page.waitForFunction(() => { const a = window.__nlw.view.self.astride; return a && a.sport === 'bicycle' && Number.isInteger(a.taken); }, null, { timeout: 20000 }).catch(() => {});
const inD = await page.evaluate((t) => { const n = window.__nlw, g = n.host.game, p = g.state.players[n.playerId], a = n.view.self.astride; const m = g.internals.actors.get(t.i); return { astride: a, mode: g.internals.sportRiders.riders()[t.n].mode, rider: m ? m.act : null, stars: p.law.stars }; }, prey);
check('D: taken: the player on it, the rider off and running from the thief', inD.astride && inD.astride.sport === 'bicycle' && inD.astride.taken === prey.n && inD.mode === 'taken' && /thief/i.test(inD.rider || ''), { took, inD });
await page.waitForFunction(() => window.__nlw.view.self.law.stars >= 2, null, { timeout: 30000 }).catch(() => {});
const stars = await page.evaluate(() => { const el = document.getElementById('stars'); return { stars: window.__nlw.view.self.law.stars, shown: !el.hidden, on: [...el.children].filter((s) => s.classList.contains('on')).length }; });
check('D: the police\'s stars for taking a vehicle: two', stars.stars === 2 && stars.shown && stars.on === 2, stars);
// (the police held off while it is ridden, left and got on again: the theft kept to be the player's again for F)
await page.evaluate(() => { const n = window.__nlw, p = n.host.game.state.players[n.playerId]; window.__law = { crimes: p.law.crimes.slice(), stars: p.law.stars, state: p.law.state }; p.law.crimes = []; p.law.stars = 0; p.law.state = 'normal'; });
await page.waitForFunction(() => window.__nlw.sportView.ready(), null, { timeout: 180000 }).catch(() => {});
await page.evaluate(() => { const n = window.__nlw; n.cam.yaw = n.predicted.heading + 1.25; n.cam.pitch = 0.16; n.cam.dist = 4.2; n.cam.lastDrag = 1e9; n.rig.snap(n.cam); });
const before = await page.evaluate(() => ({ x: window.__nlw.predicted.x, z: window.__nlw.predicted.z }));
await page.keyboard.down('w');
const pedalling = [];
for (let k = 0; k < 60; k += 1) {
  await page.waitForTimeout(250);
  pedalling.push(await page.evaluate(() => { const n = window.__nlw, s = n.sportView; const l = s.limbs(n.me), p = s.pedals(); return { speed: n.sportState.speed, foot: l && p ? Math.max(l.feet[0].distanceTo(p[0]), l.feet[1].distanceTo(p[1])) : null, x: n.predicted.x, z: n.predicted.z }; }));
  if (Math.hypot(pedalling[k].x - before.x, pedalling[k].z - before.z) > 12) break;
}
await shot('d2-riding-it-away');
await page.keyboard.up('w');
const last = pedalling[pedalling.length - 1];
check('D: pedalled away as one\'s own, the feet on its pedals', Math.hypot(last.x - before.x, last.z - before.z) > 5 && pedalling.filter((q) => q.foot !== null).every((q) => q.foot < 0.17), { gone: +Math.hypot(last.x - before.x, last.z - before.z).toFixed(1), feet: pedalling.map((q) => q.foot && +q.foot.toFixed(3)) });
const kept = await page.evaluate((t) => { const r = window.__nlw.host.game.internals.sportRiders.riders()[t.n]; const n = window.__nlw; return { townAt: [r.x, r.z], at: [n.predicted.x, n.predicted.z] }; }, prey);
check('D: the town has it where the thief has it', Math.hypot(kept.townAt[0] - kept.at[0], kept.townAt[1] - kept.at[1]) < 1, kept);

// ---- E: never theirs; left standing; back on
const owned = await page.evaluate(async () => { const n = window.__nlw; try { await n.market.mine(); } catch (error) { /* (the website's answer, below) */ } const m = n.market.state.mine; return { holdings: m ? m.holdings.map((h) => h.asset && h.asset.model) : null, ownSports: n.view.self.ownSports.items }; });
check('E: never the player\'s: not among what the website says they own, nor their own things from the mall', !!owned.holdings && !owned.holdings.some((m) => String(m || '').startsWith('sport:')) && owned.ownSports.length === 0, owned);
await page.keyboard.down('s');
await page.waitForFunction(() => Math.abs(window.__nlw.sportState.speed) < 0.2, null, { timeout: 15000 }).catch(() => {});
await page.keyboard.up('s');
const off = await page.evaluate(() => { const p = window.__nlw.prompt(); if (!p) return null; const text = p.text; p.run(); return text; });
await page.waitForTimeout(2500);
const leftE = await page.evaluate((t) => { const n = window.__nlw; n.refresh(); const r = (n.view.sportRiders || []).find((q) => q.n === t.n); const p = n.prompt(); return { off: !n.view.self.astride, mode: r && r.mode, mine: r && r.mine, person: r ? r.person : undefined, drawn: n.sportRidersView.view.keys().includes(`npc-left:${t.n}`), prompt: p && p.text }; }, prey);
await shot('e1-left-standing');
check('E: got off: it stands where it was left, drawn there, and "Ride the bicycle you took" is offered', /^Get off the /.test(off || '') && leftE.off && leftE.mode === 'kept' && leftE.mine && leftE.person === null && leftE.drawn && leftE.prompt === 'Ride the bicycle you took', { off, leftE });
const again = await page.evaluate((t) => window.__nlw.retakeSport(t.n), prey);
await page.waitForTimeout(800);
const onAgain = await page.evaluate(() => window.__nlw.view.self.astride);
check('E: back on it', again.ok && onAgain && onAgain.sport === 'bicycle' && onAgain.taken === prey.n, { again, onAgain });

// ---- F: caught by the police: it goes back to its owner
const caught = await page.evaluate((t) => {
  const n = window.__nlw, g = n.host.game, p = g.state.players[n.playerId];
  const w = window.__law; p.law.crimes = w.crimes; p.law.stars = w.stars; p.law.state = w.state;
  const officer = g.internals.population.people.find((q) => q.job === 'police');
  const record = g.internals.justice.arrest(p, { kind: 'npc', id: officer.index, name: officer.name });
  n.refresh();
  const r = g.internals.sportRiders.riders()[t.n];
  return { record: !!record, returned: record ? record.sportsReturned : null, astride: n.view.self.astride, mode: r.mode, said: record ? record.message || null : null };
}, prey);
check('F: caught by the police: what was taken goes back; off it', caught.record && caught.returned === 1 && !caught.astride && caught.mode === 'returning', caught);
await page.waitForFunction((t) => { const r = window.__nlw.host.game.internals.sportRiders.riders()[t.n]; return r.mode !== 'returning'; }, prey, { timeout: 300000 }).catch(() => {});
const home = await page.evaluate((t) => { const r = window.__nlw.host.game.internals.sportRiders.riders()[t.n]; return { mode: r.mode, takenBy: r.takenBy }; }, prey);
check('F: its owner walks to it and rides off on it again', ['ride', 'stop', 'turn', 'off'].includes(home.mode) && home.takenBy === null, home);
await page.evaluate(() => { const n = window.__nlw, g = n.host.game, p = g.state.players[n.playerId]; if (p.custody) { const r = g.state.justice.arrests[p.custody]; r.status = 'released'; p.custody = null; p.law.state = 'normal'; } });

// ---- G: the bell
const bell = await page.evaluate(() => {
  const n = window.__nlw, g = n.host.game, sr = g.internals.sportRiders;
  const r = sr.riders().filter((q) => q.item === 'bicycle' && q.mode === 'ride' && q.v > 2).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
  if (!r) return null;
  // the player stood in the road ahead of them, in their line
  for (const d of [12, 14, 16, 10]) { const x = r.x + Math.sin(r.h) * d, z = r.z + Math.cos(r.h) * d; if (n.walkable(x, z)) { n.place(x, z); n.face(r.h + Math.PI); return { n: r.n, rang: r.bellAt, heard: n.bellsHeard }; } }
  return null;
});
if (bell) {
  await page.waitForFunction((b) => { const r = window.__nlw.host.game.internals.sportRiders.riders()[b.n]; return r.bellAt > b.rang; }, bell, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const rang = await page.evaluate((b) => { const n = window.__nlw, r = n.host.game.internals.sportRiders.riders()[b.n]; return { rang: r.bellAt > b.rang, heard: n.bellsHeard - b.heard, v: r.v }; }, bell);
  check('G: a cyclist coming up behind someone on foot in the road rings the bell, and it is heard', rang.rang && rang.heard >= 1, rang);
} else check('G: a cyclist to ring', false, null);

// ---- H: what it costs
console.log('the graphics card with the riders near (B):', JSON.stringify(memB), '| frames a second here (drawn in software):', memB.fps);
check('H: a phone at Medium with the riders near: the graphics card under 135 MB', !PHONE || memB.pictures + memB.buffers < 135, memB);
const lost = await lostPictures(page);
check('H: no picture handed to the graphics card after the page had let it go; nothing in the console', lost === 0 && errors.length === 0, { lost, errors: errors.slice(0, 5) });
writeFileSync(resolve(out, 'sport-riders.json'), JSON.stringify({ seenA, bike, still, memB, going, rows: rows.length, seenNow, prey, inD, stars, owned, leftE, caught, home }, null, 1));
await browser.close(); server.close();
const passed = results.filter(Boolean).length;
console.log(passed === results.length ? `All ${results.length} checks passed.` : `${passed} of ${results.length} checks passed.`);
process.exit(passed === results.length ? 0 : 1);
