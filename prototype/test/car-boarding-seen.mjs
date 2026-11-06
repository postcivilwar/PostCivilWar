// Getting into and out of a car, seen by another player, and the rest of what the owner's sample of the cars lacked (6
// November 2026, the owner's brief: "Other players see all of it"; "Moving the stick before sitting down cancels getting
// in"; "the dials light up and the engine starts"; "Running from the police, leave it open"; "in the rain ... the wipers
// sweeping on the car you drive"; "A door left open swings as the car moves and slams shut once the car picks up
// speed"), in a headless browser on the website as it is served with its server and a database:
//  A  this player's own Grey Saloon (a car with real glass) brought to them, got out of and into again: while they get
//     out and in, their game tells the other players which door, how far into it and where the car stands (link.js
//     `bd`: what travels); in, the engine heard starting once the door is shut;
//  B  getting in given up: the stick pushed before they are in the seat: out again beside the car, its door shut again;
//  C  getting out while the police are after them: off as soon as they are clear of the door, which is left standing
//     open, and their game tells the others so (on the car left standing: link.js `pc`);
//  D  in the rain, at its wheel: its wipers sweep back and forth across its windscreen;
//  E  a door standing open as it moves off: it swings, and is slammed shut once the car is going at a run;
//  F  a second player (a second copy of the town in this page, joined as two devices are) beside this one gets into
//     their own Grey Saloon: here, its door swings open and shut again, and their figure goes from where they stood
//     into its driver's seat by the owner's moves; and out again, running from the police: from the seat out beside the
//     car, the door left standing open after they are gone;
//  G  nothing in the console; pictures of each step.
//   ../server/with-postgres.sh node test/car-boarding-seen.mjs [shots folder]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDevServer } from '../../server/dev.mjs';
import { pastQuestion, enterTown, watchPictures, lostPictures } from './start.mjs';
import { encodePlayer } from '../src/net/link.js';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const out = process.argv[2] || '/tmp/car-boarding-seen-shots';
mkdirSync(out, { recursive: true });
const server = createDevServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); };
const MODEL = 'grey-saloon';

const context = await browser.newContext({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
await watchPictures(context);
const page = await context.newPage(); page.setDefaultTimeout(240000);
page.on('pageerror', (e) => check('G: no error in the page', false, `${e.message} ${(e.stack || '').split('\n').slice(0, 4).join(' | ')}`));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 4\d\d/.test(m.text())) check('G: no error in the console', false, m.text()); });
const shot = (name) => page.screenshot({ path: resolve(out, `${name}.png`) });
const username = `Board_${Math.random().toString(36).slice(2, 8)}`;

await page.goto(`${origin}/#nointro-gameclock`, { timeout: 300000 });
await page.waitForFunction(() => !!(window.__nlw && window.__nlw.intro), null, { timeout: 300000 });
await page.waitForSelector('#open-signup', { state: 'visible', timeout: 300000 });
await page.click('#open-signup');
await page.fill('#account-username', username); await page.fill('#account-password', 'a password for the car boarding test');
await page.click('#account-submit');
await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 120000 });
await pastQuestion(page);
await page.fill('#name', 'Boarding Test');
await enterTown(page);
await page.waitForFunction(() => window.__nlw.me && window.__nlw.me.mixer, null, { timeout: 240000 });
await page.evaluate(() => { const n = window.__nlw; const g = n.host.game; g.state.weather = { kind: 'clear', until: g.state.t + 8 * 3600 }; const hour = n.view.clock.hourFloat; if (hour < 9 || hour > 14) n.skip((24 + 10 - hour) % 24); });

// a clear place near Market Road with room on every side and ahead to drive off (no wall, lamp or tree in the way):
// this player's car stands there, and later (once it has been driven off) the second player's
const spot = await page.evaluate(() => {
  const n = window.__nlw;
  for (let r = 0; r < 90; r += 3) for (let k = 0; k < 24; k += 1) {
    const a = (k / 24) * Math.PI * 2, x = 8.5 + Math.cos(a) * r, z = -75 + Math.sin(a) * r;
    if (!n.walkable(x, z)) continue;
    for (let j = 0; j < 16; j += 1) {
      const h = (j / 16) * Math.PI * 2;
      let clear = true;
      for (let d = -8; d <= 40 && clear; d += 1) for (const s of [-7, -5, -3, -1, 1, 3, 5, 7]) { const px = x + Math.sin(h) * d + Math.cos(h) * s, pz = z + Math.cos(h) * d - Math.sin(h) * s; if (!n.walkable(px, pz)) { clear = false; break; } }
      if (clear) return { x, z, h };
    }
  }
  return null;
});
check('a clear place to stand a car, with room ahead to drive off', !!spot, spot);
if (!spot) { await browser.close(); server.close(); process.exit(1); }
const place = (s) => page.evaluate((s) => { const n = window.__nlw; n.place(s.x, s.z); n.face(s.h); }, s);
const look = (yawOff, dist = 7, pitch = 0.22) => page.evaluate(([o, d, p]) => { const n = window.__nlw; n.cam.yaw = n.predicted.heading + o; n.cam.dist = d; n.cam.pitch = p; if (n.rig && n.rig.snap) n.rig.snap(n.cam); }, [yawOff, dist, pitch]);
const doorsOf = (key) => page.evaluate((k) => { const c = window.__nlw.carView.driven(k); return c && c.doors ? c.doors() : null; }, key);
const started = () => page.evaluate(() => { const v = window.__nlw.audio.status().voices; return v ? (v.kinds.carstart || 0) : null; });
const settle = async () => { await page.waitForFunction(() => !window.__nlw.boarding, null, { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(400); };

// ---- A: their own car brought to them, out of it and in again ----
await place(spot);
await page.evaluate(() => { const n = window.__nlw; n.host.game.intent(n.playerId, { type: 'cars.owned', cars: ['grey-saloon'] }); });
const brought = await page.evaluate((m) => window.__nlw.driveCar(m), MODEL);
check('A: their own Grey Saloon brought to them, and they are in it', !!brought && brought.ok, brought && { ok: brought.ok, code: brought.code });
await page.waitForFunction(() => { const c = window.__nlw.carView.driven(); return c && c.glazed; }, null, { timeout: 240000 }).catch(() => {});
await page.waitForTimeout(1500);
await look(-1.2);
await shot('a-0-in-the-car');
// (out: what this player's game tells the others, a few times a second, while they get out)
const tellings = async (n, gap) => { const list = []; for (let i = 0; i < n; i += 1) { list.push(await page.evaluate(() => { const s = window.__nlw.linkState(); return s && s.boarding ? s : null; })); await page.waitForTimeout(gap); } return list; };
await page.evaluate(() => window.__nlw.leaveCar());
const toldOut = await tellings(10, 200);
await settle();
const outs = toldOut.filter(Boolean);
const enc = (st) => { try { return encodePlayer(st, 'atani'); } catch (error) { return { error: error.message }; } };
const wireOut = outs.length ? enc(outs[Math.floor(outs.length / 2)]).bd : null;
check('A: getting out, their game tells the others: out, by which door, how far into it, where the car stands', outs.length >= 3 && outs.every((s) => s.boarding.kind === 'out' && s.boarding.car === MODEL && ['fl', 'fr'].includes(s.boarding.door)) && outs.every((s, i) => i === 0 || s.boarding.ago >= outs[i - 1].boarding.ago) && Array.isArray(wireOut) && wireOut[0] === 1 && wireOut[3] === MODEL, { told: outs.length, ago: outs.map((s) => +s.boarding.ago.toFixed(2)), wire: wireOut });
check('A: and once they are out, it stops telling', await page.evaluate(() => !window.__nlw.linkState().boarding), null);
await shot('a-1-out');
const before = await started();
await page.evaluate((m) => window.__nlw.driveCar(m), MODEL);
const toldIn = await tellings(8, 200);
await settle();
const ins = toldIn.filter(Boolean);
const wireIn = ins.length ? enc(ins[0]).bd : null;
check('A: getting back in from beside it, their game tells the others: in, by its door, the car where it stands', ins.length >= 3 && ins.every((s) => s.boarding.kind === 'in' && s.boarding.car === MODEL) && Array.isArray(wireIn) && wireIn[0] === 0 && Number.isFinite(wireIn[4]) && Number.isFinite(wireIn[5]), { told: ins.length, wire: wireIn });
await page.waitForTimeout(800);
const after = await started();
check('A: in, the door shut: the engine heard starting', before !== null && after === before + 1, { before, after });
check('A: at its wheel', await page.evaluate(() => !!window.__nlw.view.self.incar), null);

// ---- B: getting in given up, the stick pushed before the seat is reached ----
await page.evaluate(() => window.__nlw.leaveCar());
await settle();
await page.waitForTimeout(600);
await page.evaluate((m) => window.__nlw.driveCar(m), MODEL);
await page.waitForTimeout(250);
const midway = await page.evaluate(() => { const b = window.__nlw.boarding; return b ? { kind: b.kind, t: +(window.__nlw.clock - b.start).toFixed(2) } : null; });
await page.keyboard.down('w'); await page.waitForTimeout(300); await page.keyboard.up('w');
await page.waitForTimeout(1500);
const given = await page.evaluate(() => { const n = window.__nlw; return { up: n.boardingGivenUp, incar: !!n.view.self.incar, boarding: !!n.boarding }; });
const doorsB = await doorsOf(`park:${MODEL}`);
check('B: the stick pushed while getting in: given up, out again beside the car at once', !!midway && midway.kind === 'in' && !!given.up && given.up.why === 'moved' && !given.incar && !given.boarding, { midway, ...given });
check('B: and its door shut again', !doorsB || Object.values(doorsB).every((a) => a < 0.01), doorsB);
await look(-1.2);
await shot('b-given-up');

// ---- C: out while the police are after them: the door left open ----
await place({ x: spot.x + Math.cos(spot.h) * 2.2, z: spot.z - Math.sin(spot.h) * 2.2, h: spot.h });
await page.evaluate((m) => window.__nlw.driveCar(m), MODEL);
await settle();
check('C: in again', await page.evaluate(() => !!window.__nlw.view.self.incar), null);
await page.evaluate(() => { const n = window.__nlw, p = n.host.game.state.players[n.playerId]; p.law = { ...(p.law || {}), state: 'wanted', since: n.host.game.state.real, crimes: (p.law && p.law.crimes) || [], seenAt: null }; n.refresh(); });
await page.waitForFunction(() => { const l = window.__nlw.view.self.law; return l && l.state === 'wanted'; }, null, { timeout: 10000 }).catch(() => {});
await page.evaluate(() => window.__nlw.leaveCar());
const fleeing = await page.evaluate(() => { const b = window.__nlw.boarding; return b ? { kind: b.kind, fleeing: b.fleeing, door: b.door } : null; });
await settle();
await page.waitForTimeout(1500);
// (read a few times over two seconds: the most each door is open, as drawn)
let doorsC = null;
for (let k = 0; k < 7; k += 1) { const d = await doorsOf(`park:${MODEL}`); if (d) { doorsC = doorsC || {}; for (const [door, a] of Object.entries(d)) doorsC[door] = Math.max(doorsC[door] || 0, a); } await page.waitForTimeout(300); }
const stateC = await page.evaluate(() => window.__nlw.linkState());
const wireC = enc(stateC).pc;
// (the police's word on them put back as it was)
await page.evaluate(() => { const n = window.__nlw, p = n.host.game.state.players[n.playerId]; p.law = { state: 'normal', since: 0, crimes: [], seenAt: null }; n.refresh(); });
check('C: running from the police, off as soon as they are clear of the door, which is left standing open', !!fleeing && fleeing.fleeing && !!doorsC && Object.values(doorsC).some((a) => a > 1.0), { fleeing, doors: doorsC });
check('C: and their game tells the others the door is open, on the car left standing', Array.isArray(wireC) && wireC.some((c) => c[0] === MODEL && Number.isInteger(c[4]) && c[4] > 0), wireC);
await look(-1.4);
await shot('c-door-left-open');

// ---- D: in the rain, the wipers ----
await page.evaluate((m) => window.__nlw.driveCar(m), MODEL);
await settle();
await page.evaluate(() => { const g = window.__nlw.host.game; g.state.weather = { kind: 'rain', until: g.state.t + 2 * 3600 }; });
const wipers = () => page.evaluate(() => {
  const c = window.__nlw.carView.driven(); if (!c) return null;
  let w = null;
  c.group.traverse((o) => { if (!w && o.isMesh && o.material && o.material.userData && o.material.userData.wipers) w = o.material.userData.wipers; });
  return w ? { on: w.uWipe.value.w, angle: +w.uWipeAt.value.x.toFixed(3) } : null;
});
await page.waitForFunction(() => { const c = window.__nlw.carView.driven(); let on = false; if (c) c.group.traverse((o) => { if (o.isMesh && o.material && o.material.userData && o.material.userData.wipers && o.material.userData.wipers.uWipe.value.w === 1) on = true; }); return on; }, null, { timeout: 90000 }).catch(() => {});
const sweeps = [];
for (let i = 0; i < 14; i += 1) { sweeps.push(await wipers()); await page.waitForTimeout(110); }
const angles = sweeps.filter((s) => s && s.on === 1).map((s) => s.angle);
check('D: in the rain, at its wheel: the wipers sweep back and forth across its windscreen', angles.length >= 10 && Math.max(...angles) - Math.min(...angles) > 0.6 && Math.max(...angles) <= 1.8, { angles });
await look(Math.PI, 5.5, 0.12);
await shot('d-wipers-in-the-rain');
await page.evaluate(() => { const g = window.__nlw.host.game; g.state.weather = { kind: 'clear', until: g.state.t + 8 * 3600 }; });

// ---- E: a door standing open as it moves off: swinging, then slammed shut at speed ----
check('E: a door left standing open (the one behind the driver)', await page.evaluate(() => window.__nlw.leaveDoorOpen('rl')), null);
await page.waitForTimeout(700);
const ride = [];
await page.evaluate(() => { window.__ride = []; const tick = () => { const n = window.__nlw, c = n.carView.driven(); const d = c && c.doors ? c.doors() : null; window.__ride.push({ speed: +n.carState.speed.toFixed(2), rl: d && d.rl ? +d.rl.toFixed(3) : 0 }); if (window.__ride.length < 2500) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
// (up to a walk's pace and left to roll a while: the door swinging; then on to a run: slammed)
// (kept at a walk's pace a few seconds, the pedal pressed a moment whenever it slows: a frame here takes a third of a
// second or more)
const t0 = Date.now();
while (Date.now() - t0 < 7000) {
  const sp = await page.evaluate(() => window.__nlw.carState.speed);
  if (sp < 1.8) { await page.keyboard.down('w'); await page.waitForTimeout(180); await page.keyboard.up('w'); } else await page.waitForTimeout(180);
}
await page.keyboard.down('w');
await page.waitForFunction(() => window.__nlw.carState.speed > 4.2, null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1200);
await page.keyboard.up('w'); await page.keyboard.down('s'); await page.waitForTimeout(1500); await page.keyboard.up('s');
ride.push(...(await page.evaluate(() => window.__ride)));
const moving = ride.filter((q) => q.speed > 0.6 && q.speed < 3.4 && q.rl > 0.05);
const swing = moving.length ? Math.max(...moving.map((q) => q.rl)) - Math.min(...moving.map((q) => q.rl)) : 0;
const fast = ride.filter((q) => q.speed > 3.8);
check('E: the door swings as the car moves off', moving.length >= 3 && swing > 0.05 && moving.some((q) => q.rl < 1.1), { frames: moving.length, swing: +swing.toFixed(3), sample: moving.slice(0, 6) });
check('E: and is slammed shut once it is going at a run', fast.length >= 2 && fast[fast.length - 1].rl < 0.01, { fast: fast.length, last: fast[fast.length - 1], top: Math.max(0, ...ride.map((q) => q.speed)) });
await page.evaluate(() => { const n = window.__nlw; if (n.view.self.incar) n.leaveCar(); });
await settle();

// ---- F: a second player gets into their own car beside this one, and out again ----
// (this player a few steps off on its driver's side, looking at where it will stand)
// (where this player's car stood before it was driven off)
const twinAt = { x: spot.x, z: spot.z, h: spot.h };
const made = await page.evaluate(([t0, m]) => {
  const n = window.__nlw;
  const t = n.twin('Second Driver', t0.x, t0.z, { figure: 'M1', colours: {} });
  const g = t.host.game;
  g.state.players[t.id].heading = t0.h;
  g.intent(t.id, { type: 'cars.owned', cars: [m] });
  const a = g.intent(t.id, { type: 'cars.enter', car: m });
  const b = g.intent(t.id, { type: 'car.leave' });
  return { id: t.id, enter: a && a.ok, leave: b && b.ok, parked: b && b.parked };
}, [twinAt, MODEL]);
check('F: a second player, their own Grey Saloon standing beside this one', made.enter && made.leave && !!made.parked, made);
// (this player at its front-left quarter, looking past their own shoulder at its driver's door)
await page.evaluate((c) => { const n = window.__nlw; const x = c.x + Math.cos(c.h) * 5.0 + Math.sin(c.h) * 3.2, z = c.z - Math.sin(c.h) * 5.0 + Math.cos(c.h) * 3.2; n.place(x, z); n.face(Math.atan2(c.x - x, c.z - z)); n.rig.view = 'shoulder'; n.cam.yaw = Math.atan2(c.x - x, c.z - z); n.cam.dist = 2.7; n.cam.pitch = 0.1; if (n.rig && n.rig.snap) n.rig.snap(n.cam); }, made.parked);
const peer = await page.waitForFunction((m) => { const n = window.__nlw; const q = n.shownPeers.find((o) => o.name === 'Second Driver'); if (!q) return null; const car = n.carView.driven(`cpark:${q.id}:${m}`); const rig = n.crowd.rigOf(`p:${q.id}`); return car && car.glazed && rig && rig.animated ? q.id : null; }, MODEL, { timeout: 300000 }).then((h) => h.jsonValue()).catch(() => null);
check('F: here, their car seen standing (with its glass), and them beside it', !!peer, peer);
await page.waitForTimeout(1500);
await shot('f-0-second-player-beside-their-car');
// (each frame here: how far into it their game says they are, their car's door, their figure's hips in the car's own
// frame: across to its left, along to its front, up from the ground)
const watch = (key) => page.evaluate(([id, k]) => {
  window.__seen = [];
  // (one watch at a time: the one before stops)
  const me = window.__watching = (window.__watching || 0) + 1;
  const n = window.__nlw, THREE = n.THREE;
  const tick = () => {
    if (window.__watching !== me) return;
    const car = n.carView.driven(k.replace('@', id)), rig = n.crowd.rigOf(`p:${id}`), b = n.peerBoards.find((q) => q.id === id) || null;
    let hips = null;
    if (car && rig) {
      let bone = null; rig.group.traverse((o) => { if (!bone && o.isBone && /hips|pelvis/i.test(o.name)) bone = o; });
      const w = (bone || rig.group).getWorldPosition(new THREE.Vector3());
      const d = w.clone().sub(car.group.position), h = car.group.rotation.y;
      hips = { across: +(d.x * Math.cos(h) - d.z * Math.sin(h)).toFixed(3), along: +(d.x * Math.sin(h) + d.z * Math.cos(h)).toFixed(3), up: +d.y.toFixed(3) };
    }
    const doors = car && car.doors ? car.doors() : null;
    window.__seen.push({ t: b ? +b.t.toFixed(2) : null, end: b ? b.end : null, kind: b ? b.kind : null, fl: doors && doors.fl ? +doors.fl.toFixed(3) : 0, hips, shown: !!(rig && rig.group.visible), half: car ? car.size.width / 2 : null, seat: car ? car.driver.hip : null });
    if (window.__seen.length < 3000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}, [peer, key]);
// in: their game takes them into the car, and says they are getting in by its driver's door, from where they stood
await watch('peer:@');
await page.evaluate((m) => {
  const n = window.__nlw, t = n.second, g = t.host.game, p = g.state.players[t.id];
  const was = { x: p.x, z: p.z };
  const r = g.intent(t.id, { type: 'cars.enter', car: m });
  if (r && r.ok) t.board('in', { car: m, x: r.x, z: r.z, h: r.h }, 'fl', { at: was });
}, MODEL);
for (let k = 0; k < 5; k += 1) { await page.waitForTimeout(550); await shot(`f-1-getting-in-${k}`); }
await page.waitForTimeout(1500);
const seenIn = await page.evaluate(() => window.__seen);
const during = seenIn.filter((q) => q.kind === 'in' && q.t !== null && q.t <= q.end);
// (only frames where their car is drawn where it stands: a car just come is not yet put in place)
const placed = (q) => q.hips && Math.abs(q.hips.along) < 4 && Math.abs(q.hips.across) < 6;
const early = during.filter((q) => q.t < 0.8 && placed(q)), late = seenIn.filter((q) => placed(q) && (q.kind === null || q.t > q.end - 0.15)).slice(-5);
const mostIn = Math.max(0, ...seenIn.map((q) => q.fl));
check('F: in: here, their door swings open and shut again', mostIn > 1.0 && seenIn.length > 5 && seenIn[seenIn.length - 1].fl < 0.01, { most: mostIn, last: seenIn[seenIn.length - 1] && seenIn[seenIn.length - 1].fl, frames: seenIn.length });
check('F: in: their figure drawn from beside the car (outside its side) ...', early.some((q) => q.shown && q.hips.across > q.half - 0.05), { early: early.slice(0, 3) });
check('F: ... into its driver\'s seat, by the owner\'s moves', during.length >= 3 && late.length > 0 && late.every((q) => q.shown && q.hips.across > 0.05 && q.hips.across < q.half - 0.1 && q.hips.up < 1.0), { frames: during.length, late });
await page.evaluate(() => window.__nlw.second.board(null));
await page.waitForTimeout(1500);
// out, running from the police: the door left standing open
await watch('cpark:@:' + MODEL);
await page.evaluate((m) => {
  const n = window.__nlw, t = n.second, g = t.host.game;
  const r = g.intent(t.id, { type: 'car.leave' });
  if (r && r.ok && r.parked) t.board('out', r.parked, 'fl', { open: true });
}, MODEL);
for (let k = 0; k < 4; k += 1) { await page.waitForTimeout(600); await shot(`f-2-getting-out-${k}`); }
await page.waitForTimeout(4500);
const seenOut = await page.evaluate(() => window.__seen);
const outing = seenOut.filter((q) => q.kind === 'out' && q.t !== null && placed(q));
// (as far into it as their game says they are: in the seat early on, beside the car once out; heard a second or so late
// on this machine, its frames a third of a second or more apart, the first moments may not be seen here)
const first = outing.filter((q) => q.t < 1.0), last = outing.filter((q) => q.t > q.end - 0.8);
const tail = seenOut.slice(-10);
check('F: out: their figure drawn from the seat out beside the car, as far into it as their game says', last.length > 0 && last.every((q) => q.hips.across > q.half - 0.1) && first.every((q) => q.hips.across < q.half), { first: first.slice(0, 2), last: last.slice(-2) });
check('F: out, running: the door left standing open after they are gone (as their game says)', tail.length === 10 && tail.every((q) => q.kind === null && q.fl > 1.0), { tail: tail.map((q) => ({ kind: q.kind, fl: q.fl })) });
await shot('f-3-door-left-open');

{ const lost = await lostPictures(page); check('G: no picture was handed to the graphics card after the page had let it go of it', lost === 0, lost); }
await browser.close();
server.close();
const failed = results.filter((r) => !r).length;
console.log(`${results.length - failed} of ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
