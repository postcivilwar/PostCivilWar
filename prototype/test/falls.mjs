// Riding, running into things, falling and getting up, the roads that are closed, and the camera on the street: the
// website as it is served with its server, in a headless browser. A new test account buys the White Sport Tourer with
// its arrival money, as a player does, and rides it. The owner's brief and video of 19 October 2026: a rider was
// thrown off on the grass beside Waterside Road, next to the purple tower, with nothing in front of him, and got up
// like a robot.
//   G  the camera on the street: close behind at about head height; the view button on foot going round its views
//   A  a paved road at a walking pace and at town speed; the airport's runway flat out: nobody falls
//   B  the place in the video: from the road across its red verge onto the grass, and along the tower's curved wall
//      under its roof, at the speed he was going: nobody falls
//   C  a road that runs into land not built yet: a roadblock before its end, drawn, and solid
//   D  into the roadblock at a walking pace: the bike stops, the rider stays on
//   E  into it at 50 km/h (watched in slow motion, every frame): thrown over the bars and over the boards, through
//      the air, down onto the front on the road beyond; never through the ground; up again through the hands and a
//      knee, smoothly (no jump, no slide); the motorcycle down on its side where it stopped
//   F  knocked down from behind, from in front and from the side: down the way the blow sent them, on the front or
//      the back, and up the way that suits how they lie, the body on the ground all the while
//   ../server/with-postgres.sh node test/falls.mjs [shots folder]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDevServer } from '../../server/dev.mjs';
import { pastQuestion, enterTown } from './start.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const out = process.argv[2] || '/tmp/falls-shots';
mkdirSync(out, { recursive: true });
const server = createDevServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); };
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 1000, height: 520 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
const page = await context.newPage();
page.setDefaultTimeout(300000);
page.on('pageerror', (e) => check('no error in the page', false, e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 4\d\d/.test(m.text())) check('no error in the console', false, m.text()); });
let shotN = 0;
const shot = (name) => page.screenshot({ path: resolve(out, `${String(++shotN).padStart(2, '0')}-${name}.png`) });

await page.goto(`${origin}/#nointro-gameclock`, { timeout: 300000 });
await page.waitForFunction(() => !!(window.__nlw && window.__nlw.ready), null, { timeout: 300000 });
await page.waitForSelector('#open-signup', { state: 'visible', timeout: 300000 });
await page.click('#open-signup');
await page.fill('#account-username', `Falls_${Math.random().toString(36).slice(2, 8)}`);
await page.fill('#account-password', 'a password for the falls test');
await page.click('#account-submit');
await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 120000 });
await pastQuestion(page);
await page.fill('#name', 'Falls Test');
await enterTown(page);
await page.waitForFunction(() => window.__nlw.me && window.__nlw.me.mixer && window.__nlw.me.fallDriver, null, { timeout: 240000 });
// (by day, and dry)
await page.evaluate(() => { const n = window.__nlw; const g = n.host.game; g.state.weather = { kind: 'clear', until: g.state.t + 6 * 3600 }; const hour = n.view.clock.hourFloat; if (hour < 9 || hour > 15) n.skip((24 + 11 - hour) % 24); });
await page.waitForTimeout(1500);

// ---- G: the camera on the street ----
const camNow = () => page.evaluate(() => { const n = window.__nlw, c = n.camera, t = n.me.group.position; return { view: n.rig.view, back: +Math.hypot(c.position.x - t.x, c.position.z - t.z).toFixed(2), up: +(c.position.y - t.y).toFixed(2), fov: +c.fov.toFixed(1) }; });
await page.evaluate(() => { const n = window.__nlw; n.place(0, 60); n.face(Math.PI); n.cam.yaw = Math.PI; });
await page.waitForTimeout(1500);
const street = await camNow();
check('G: the game starts on the street view: close behind, the eye at about head height, a little wider lens', street.view === 'street' && street.back > 3.0 && street.back < 4.6 && street.up > 1.5 && street.up < 2.3 && street.fov > 58, street);
await shot('G-street-standing');
const keys = await page.evaluate(() => document.getElementById('keys').innerText);
check('G: the view key is offered on foot', /View/.test(keys), keys);
const seen = [];
for (let i = 0; i < 4; i += 1) { await page.keyboard.press('c'); await page.waitForTimeout(250); seen.push(await page.evaluate(() => window.__nlw.rig.view)); }
check('G: on foot the view goes round: further back, over the shoulder, from above, and back to the street', seen.join(',') === 'behind,shoulder,high,street', seen);
await page.keyboard.down('w'); await page.keyboard.down('Shift'); await page.waitForTimeout(2500);
const running = await camNow();
await shot('G-street-running');
await page.keyboard.up('Shift'); await page.keyboard.up('w'); await page.waitForTimeout(1500);
check('G: at a run it comes a little closer', running.back < street.back - 0.3 && running.back > 2.2, { running, street });

// ---- the White Sport Tourer, bought with arrival money at the showroom ----
const bought = await page.evaluate(async () => {
  const n = window.__nlw;
  const r = await n.market.list('motorcycle');
  if (!r.ok) return r;
  const l = r.listings.find((x) => x.asset.model === 'bike:white-sport');
  n.place(l.place.x, l.place.z - 2);
  const opened = await n.market.open(l.id, { x: l.place.x, z: l.place.z - 1 });
  if (!opened.ok) return opened;
  const o = await n.market.offer(opened.thread.id, l.price, l.asset.name, 0);
  await n.market.mine();
  return { ok: o.ok, status: o.offer && o.offer.status, mine: n.market.state.mine.holdings.map((h) => h.asset.model) };
});
check('a new account buys the White Sport Tourer with its arrival money', bought.ok && bought.status === 'accepted' && bought.mine.includes('bike:white-sport'), bought);
await page.waitForFunction(() => window.__nlw.view.self.ownBikes && window.__nlw.view.self.ownBikes.bikes.includes('white-sport'), null, { timeout: 60000 }).catch(() => {});
await page.keyboard.press('Escape');

// ---- helpers ----
// (a person run down on the way is a crime, and the police come for the rider: that is the game, but not what is
// tested here, so anything held against the rider is let go between the parts of this test)
const clean = () => page.evaluate(() => { const n = window.__nlw, p = n.host.game.state.players[n.playerId]; const was = p.law ? p.law.state : 'normal'; if (p.law && p.law.state === 'wanted') { p.law.state = 'normal'; p.law.crimes = []; } return was; });
const ride = async (x, z, h) => {
  await clean();
  const r = await page.evaluate(([x, z, h]) => {
    const n = window.__nlw;
    if (n.view.self.astride) n.server.send({ type: 'moto.leave' });
    n.place(x, z); n.face(h);
    return n.rideBike('white-sport');
  }, [x, z, h]);
  await page.waitForFunction(() => window.__nlw.ownBikeView.ready() || window.__nlw.ownBikeView.failed(), null, { timeout: 300000 });
  await page.evaluate((h) => { const n = window.__nlw; n.cam.yaw = h; n.cam.lastDrag = -10; }, h);
  return r;
};
const state = () => page.evaluate(() => { const n = window.__nlw, s = n.view.self; return { x: +s.x.toFixed(2), z: +s.z.toFixed(2), astride: !!s.astride, down: s.down ? { by: s.down.by || 'knock' } : null, kmh: Math.round(Math.abs(n.bikeState.speed) * 3.6), crashes: n.host.game.state.players[n.playerId].stats.crashes || 0 }; });
// the throttle held (the key, by the caller), the bike kept at `speed` m/s and steered to `heading` (an expression of
// x and z, or a number) until `until` (an expression of x and z) or `limit` seconds of the game's time: every frame's
// speed and place
const rideOn = (speed, heading, until, limit = 20) => page.evaluate(async ([speed, heading, until, limit]) => {
  const n = window.__nlw;
  const steer = new Function('x', 'z', `return (${heading});`), stop = new Function('x', 'z', `return (${until});`);
  const t0 = n.host.game.state.real, seen = [];
  n.bikeState.speed = Math.max(n.bikeState.speed, speed);
  while (n.view.self.astride && n.host.game.state.real - t0 < limit && !stop(n.predicted.x, n.predicted.z)) {
    n.predicted.heading = steer(n.predicted.x, n.predicted.z);
    if (Math.abs(n.bikeState.speed) > speed) n.bikeState.speed = speed;
    seen.push({ x: +n.predicted.x.toFixed(2), z: +n.predicted.z.toFixed(2), v: +n.bikeState.speed.toFixed(2) });
    await new Promise((r) => requestAnimationFrame(r));
  }
  return seen;
}, [speed, String(heading), String(until), limit]);
const brake = async () => { await page.keyboard.up('w'); await page.keyboard.down('s'); await page.waitForFunction(() => Math.abs(window.__nlw.bikeState.speed) < 0.3 || !window.__nlw.view.self.astride, null, { timeout: 60000 }).catch(() => {}); await page.keyboard.up('s'); };

// ---- A: a paved road slowly and at town speed (the Asaba-Kwale Road, out of town); the airport's runway flat out ----
let r = await ride(-300, -40, -Math.PI / 2);
check('A: on the White Sport Tourer on the Asaba-Kwale Road', !!(r && r.ok), r);
await page.keyboard.down('w');
const slow = await rideOn(2.8, -Math.PI / 2, 'x < -312');
const town = await rideOn(13.9, -Math.PI / 2, 'x < -380');
await shot('A-kwale-road-50kmh');
await brake();
let s = await state();
check('A: along the Asaba-Kwale Road at 10 km/h and at 50 km/h: nobody falls', s.astride && !s.down && s.crashes === 0 && slow.length > 3 && town.some((f) => f.v > 13.5), { slow: slow.length, town: Math.max(...town.map((f) => f.v)), ...s });
r = await ride(-600, -454, -Math.PI / 2);
await page.keyboard.down('w');
const runway = await rideOn(27.5, -Math.PI / 2, 'x < -760');
await shot('A-runway-100kmh');
await brake();
s = await state();
check('A: down the airport\'s runway flat out (100 km/h): nobody falls', s.astride && !s.down && s.crashes === 0 && runway.filter((f) => f.v > 27).length > 5, { top: Math.max(...runway.map((f) => f.v)), ...s });

// ---- B: the place in the video ----
// from the road across its red verge onto the grass, then straight along it 1.5 m from the tower's curved wall (its
// foot reaches z 103.06), under its roof, at 28 km/h: inside where the old box round the whole tower stood (to z 104)
r = await ride(-80, 110.5, -Math.PI / 2);
// (in slow motion, to see it frame by frame)
await page.evaluate(() => window.__nlw.slow(0.35));
await page.keyboard.down('w');
const lineB = await rideOn(7.8, 'z > 104.9 ? -Math.PI / 2 - 0.3 : -Math.PI / 2', 'x < -120');
await page.evaluate(() => window.__nlw.slow(1));
await shot('B-on-the-grass-by-the-tower');
await brake();
s = await state();
const alongB = lineB.filter((f) => f.x < -100 && f.x > -116);
check('B: across the verge onto the grass by the purple tower, and along it inside where the old box stood, at 28 km/h the whole way', alongB.length >= 4 && alongB.every((f) => f.z < 105 && f.z > 103.7 && f.v > 7.4) && lineB.some((f) => f.z > 108), { from: lineB[0], first: alongB[0], last: alongB[alongB.length - 1], frames: alongB.length, slowest: alongB.length ? Math.min(...alongB.map((f) => f.v)) : null });
check('B: and nobody falls', s.astride && !s.down && s.crashes === 0 && s.x < -112, s);

// ---- C and D: the south end of Waterside Road, closed; into its roadblock at a walking pace ----
const kit = await page.evaluate(() => { const names = []; window.__nlw.scene.traverse((o) => { if (o.name && o.name.startsWith('closures-')) names.push(o.name); }); return names; });
check('C: the roadblocks and the fence along the edge of the land are drawn', ['closures-striped', 'closures-drum', 'closures-cone', 'closures-signs', 'closures-posts'].every((k) => kit.includes(k)), kit);
r = await ride(-226, 113, -Math.PI / 2);
await page.waitForTimeout(1500);
await shot('C-road-closed-ahead');
await page.keyboard.down('w');
await rideOn(2.8, -Math.PI / 2, 'false', 8);
await page.keyboard.up('w');
s = await state();
check('C: the bike does not go through the roadblock (its boards from x -243.35 to -242.65; the bike takes 0.6 m)', s.x >= -242.65 + 0.5, s);
check('D: into it at 10 km/h it stops; the rider stays on', s.astride && !s.down && s.crashes === 0, s);
await shot('D-stopped-at-the-roadblock');

// ---- E: into it at 50 km/h, in slow motion ----
r = await ride(-222, 113, -Math.PI / 2);
// (seen from the side, behind: the street view held where it is put, for the pictures)
await page.evaluate(() => { const n = window.__nlw; n.rig.view = 'street'; n.cam.yaw = -Math.PI / 2 - 1.15; n.cam.dist = 6.5; n.cam.pitch = 0.16; n.cam.lastDrag = 1e9; });
await page.waitForTimeout(1500);
const health0 = await page.evaluate(() => window.__nlw.view.self.health);
await page.evaluate(() => window.__nlw.slow(0.2));
await page.keyboard.down('w');
// watched every frame: the fall's phase, the figure's place, the lowest of its body above the ground under it, the
// height of its hips; and the bike
const watching = page.evaluate(async () => {
  const n = window.__nlw, THREE = n.THREE;
  const seen = [];
  const v = new THREE.Vector3();
  const names = ['head', 'neck_01', 'spine_03', 'spine_01', 'pelvis', 'hand_l', 'hand_r', 'lowerarm_l', 'lowerarm_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r'];
  const t0 = n.host.game.state.real;
  let crashedAt = null;
  n.bikeState.speed = 13.9;
  while (n.host.game.state.real - t0 < 16) {
    if (n.view.self.astride && Math.abs(n.bikeState.speed) > 13.9) n.bikeState.speed = 13.9;
    await new Promise((r) => requestAnimationFrame(r));
    const me = n.me, d = me.fallDriver;
    let low = Infinity;
    for (const name of names) { const b = me.bones.get(name); if (b) { b.getWorldPosition(v); low = Math.min(low, v.y - n.ground(v.x, v.z)); } }
    const hips = me.bones.get('pelvis').getWorldPosition(new THREE.Vector3());
    const down = n.view.self.down;
    if (down && crashedAt === null) crashedAt = n.host.game.state.real - (down.age || 0);
    seen.push({ t: +(n.host.game.state.real - t0).toFixed(3), phase: d.phase, lands: d.how ? d.how.lands : null, low: +low.toFixed(3), hipsY: +(hips.y - n.ground(hips.x, hips.z)).toFixed(3), hx: +hips.x.toFixed(3), hz: +hips.z.toFixed(3), x: +me.group.position.x.toFixed(2), astride: !!n.view.self.astride, down: !!down });
    if (crashedAt !== null && !down && !d.phase && n.host.game.state.real - crashedAt > 2) break;
  }
  const bike = (n.view.self.ownBikes.parked || []).find((b) => b.bike === 'white-sport') || null;
  return { seen, bike };
});
await shot('E-crash-coming');
// the throttle let go once the rider is off; where the town put them
await page.waitForFunction(() => !!window.__nlw.view.self.down || !window.__nlw.view.self.astride, null, { timeout: 120000 });
await page.keyboard.up('w');
const landed = await page.evaluate(() => { const s = window.__nlw.view.self; return { x: +s.x.toFixed(2), z: +s.z.toFixed(2), over: s.down ? s.down.over : null }; });
// pictures as it goes (the game at a fifth of its speed)
for (let i = 0; i < 20; i += 1) { await page.waitForTimeout(1000); await shot(`E-crash-${String(i).padStart(2, '0')}`); }
const film = await watching;
await page.evaluate(() => window.__nlw.slow(1));
const f = film.seen;
const phases = f.map((x) => x.phase).filter((p, i, a) => p && p !== a[i - 1]);
const air = f.filter((x) => x.phase === 'fall');
const crossing = air.filter((x) => x.hx < -242.55 && x.hx > -243.45);
const grounded = f.filter((x) => x.phase && x.phase !== 'fall');
const after = await page.evaluate(() => { const s = window.__nlw.view.self; return { health: s.health, x: +s.x.toFixed(2), z: +s.z.toFixed(2), down: !!s.down, astride: !!s.astride }; });
check('E: into the roadblock at 50 km/h: thrown off, through the air, down, up again, once (fall, lie, rise, each once)', phases.join(',') === 'fall,lie,rise' && air.length >= 4, { phases, airFrames: air.length });
check('E: over the bars and over the boards, the lowest of the body above them as it passes (they are 1.25 m high), and down on the road beyond', crossing.length > 0 && Math.min(...crossing.map((x) => x.low)) > 1.0 && landed.x < -244 && !!landed.over, { over: crossing.map((x) => x.low), landed });
check('E: on the ground and getting up, never through it (the lowest of the body no more than a few centimetres in)', grounded.length > 10 && Math.min(...grounded.map((x) => x.low)) > -0.06, { lowest: Math.min(...grounded.map((x) => x.low)) });
// smooth: the hips never jump (up or along) while lying and getting up
let worstUp = 0, worstAlong = 0;
for (let i = 1; i < grounded.length; i += 1) {
  const a = grounded[i - 1], b = grounded[i], dt = Math.max(0.005, b.t - a.t);
  worstUp = Math.max(worstUp, Math.abs(b.hipsY - a.hipsY) / dt);
  worstAlong = Math.max(worstAlong, Math.hypot(b.hx - a.hx, b.hz - a.hz) / dt);
}
check('E: lying and getting up the hips rise smoothly, without a jump, and the body does not slide (at most 1.6 m/s up, 1.2 m/s along)', worstUp < 1.6 && worstAlong < 1.2, { worstUp: +worstUp.toFixed(2), worstAlong: +worstAlong.toFixed(2), hipsLying: Math.min(...grounded.map((x) => x.hipsY)), hipsUp: grounded.length ? grounded[grounded.length - 1].hipsY : null });
check('E: the motorcycle lies on its side where it stopped, short of the boards; a little health lost; up and on foot at the end', !!(film.bike && film.bike.fallen && film.bike.x > -242.65) && after.health < health0 && after.health > 80 && !after.down && !after.astride && !f[f.length - 1].phase, { bike: film.bike, health: [health0, after.health], end: f[f.length - 1] });

// ---- F: knocked down from behind, from in front, from the side (as the town knocks a player down: impact.js) ----
const knocked = async (rel, name) => {
  await clean();
  await page.evaluate(() => { const n = window.__nlw; n.place(-30, 100); n.face(0.4); n.cam.yaw = 0.4 + 1.3; n.cam.dist = 4.6; n.cam.pitch = 0.18; n.cam.lastDrag = 1e9; });
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.__nlw.slow(0.25));
  // the blow, as a vehicle's is: down for 2.6 s, up over the next 2.7, pushed `rel` from the way they face, from 1.2 m back
  await page.evaluate((rel) => {
    const n = window.__nlw, g = n.host.game, p = g.state.players[n.playerId];
    const now = g.state.real, h = 0.4 + rel;
    p.down = { at: now, until: now + 2.6, upAt: now + 2.6 + 2.7, by: 'test', h, from: { x: p.x - Math.sin(h) * 1.2, z: p.z - Math.cos(h) * 1.2 }, hard: false };
  }, rel);
  const watch = page.evaluate(async () => {
    const n = window.__nlw, THREE = n.THREE, out = [];
    const v = new THREE.Vector3();
    const t0 = n.host.game.state.real;
    const names = ['head', 'neck_01', 'spine_03', 'spine_01', 'pelvis', 'hand_l', 'hand_r', 'lowerarm_l', 'lowerarm_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r'];
    while (n.host.game.state.real - t0 < 9) {
      await new Promise((r) => requestAnimationFrame(r));
      const me = n.me, d = me.fallDriver;
      let low = Infinity;
      for (const name of names) { const b = me.bones.get(name); if (b) { b.getWorldPosition(v); low = Math.min(low, v.y - n.ground(v.x, v.z)); } }
      const hips = me.bones.get('pelvis').getWorldPosition(new THREE.Vector3());
      out.push({ t: +(n.host.game.state.real - t0).toFixed(3), phase: d.phase, how: d.how ? { ...d.how } : null, low: +low.toFixed(3), hipsY: +(hips.y - n.ground(hips.x, hips.z)).toFixed(3) });
      if (out.length > 10 && !d.phase && !n.view.self.down) break;
    }
    return out;
  });
  for (let i = 0; i < 6; i += 1) { await page.waitForTimeout(3000); await shot(`F-${name}-${i}`); }
  const seen = await watch;
  await page.evaluate(() => window.__nlw.slow(1));
  const how = (seen.find((x) => x.how) || {}).how;
  const ph = seen.map((x) => x.phase).filter((p, i, a) => p && p !== a[i - 1]);
  const onGround = seen.filter((x) => x.phase === 'lie' || x.phase === 'rise');
  return { how, phases: ph, ended: !seen[seen.length - 1].phase, lowest: Math.min(...onGround.map((x) => x.low)), lyingHips: Math.min(...onGround.map((x) => x.hipsY)) };
};
const fromBehind = await knocked(0, 'from-behind');
check('F: knocked from behind: forward, onto the front, up through the hands and a knee; on the ground, never in it', fromBehind.how && fromBehind.how.fall === 'fwd' && fromBehind.how.lands === 'front' && fromBehind.phases.join(',') === 'fall,lie,rise' && fromBehind.ended && fromBehind.lowest > -0.06 && fromBehind.lyingHips < 0.4, fromBehind);
const fromFront = await knocked(Math.PI, 'from-in-front');
check('F: knocked from in front: back, onto the back, up by sitting up and onto a knee; on the ground, never in it', fromFront.how && fromFront.how.fall === 'back' && fromFront.how.lands === 'back' && fromFront.phases.join(',') === 'fall,lie,rise' && fromFront.ended && fromFront.lowest > -0.06 && fromFront.lyingHips < 0.4, fromFront);
const fromSide = await knocked(Math.PI / 2, 'from-the-side');
check('F: knocked from the side: turned with the blow and down, and up again', fromSide.how && Math.abs(Math.abs(fromSide.how.turn) - Math.PI / 2) < 0.01 && fromSide.phases.join(',') === 'fall,lie,rise' && fromSide.ended && fromSide.lowest > -0.06, fromSide);

const failed = results.filter((x) => !x).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nAll ${results.length} checks passed.`);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
