// Riding, running into things, falling and getting up, the roads that are closed, and the camera on the street, in a
// headless browser (the page as it is built, with no server: the White Sport Tourer given to the player in its own
// town). The owner's brief and video of 19 October 2026: a rider was thrown off on the grass beside Waterside Road,
// next to the purple tower, with nothing in front of him, and got up like a robot.
//   A  riding down a paved road at a walking pace, at town speed and flat out: nobody falls
//   B  the place in the video: off the road, across its red verge and onto the grass along the tower's curved wall,
//      where its roof reaches out overhead, at the speed he was going: nobody falls
//   C  a road that runs into land not built yet: closed before its end by a roadblock that is drawn, and solid
//   D  into the roadblock at a walking pace: the bike stops, the rider stays on
//   E  into it hard: thrown over the handlebars, through the air, down onto the front; on the ground, never through
//      it; up again through the hands, a knee and a foot; the motorcycle tipped onto its side where it stopped
//   F  pushed from behind, from in front and from the side: down the way the blow sent them, on the front or the
//      back, and up again the way that suits how they lie
//   G  the camera on the street: close behind at about head height, the view button on foot going round its views
//   node test/falls.mjs [shots folder]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pastQuestion, enterTown } from './start.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || '/tmp/falls-shots';
mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); };
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 540 } });
page.setDefaultTimeout(300000);
page.on('pageerror', (e) => check('no error in the page', false, e.message));
page.on('console', (m) => { if (m.type() === 'error') check('no error in the console', false, m.text()); });
const shot = (name) => page.screenshot({ path: resolve(out, `${name}.png`) });
await page.goto(`file://${resolve(here, '../dist/local.html')}#nointro-gameclock`, { timeout: 300000 });
await pastQuestion(page);
await page.fill('#name', 'Falls Test').catch(() => {});
await enterTown(page);
await page.waitForFunction(() => window.__nlw.me && window.__nlw.me.mixer && window.__nlw.me.fallDriver, null, { timeout: 240000 });
// (by day, and dry: a bike's top speed is lower in the rain)
await page.evaluate(() => { const n = window.__nlw; const g = n.host.game; g.state.weather = { kind: 'clear', until: g.state.t + 6 * 3600 }; const hour = n.view.clock.hourFloat; if (hour < 9 || hour > 16) n.skip((24 + 11 - hour) % 24); });
await page.waitForTimeout(1500);

// ---- G: the camera on the street ----
const camNow = () => page.evaluate(() => { const n = window.__nlw, c = n.camera, t = n.me.group.position; return { view: n.rig.view, back: +Math.hypot(c.position.x - t.x, c.position.z - t.z).toFixed(2), up: +(c.position.y - t.y).toFixed(2), fov: +c.fov.toFixed(1) }; });
const street = await camNow();
check('G: the game starts on the street view: close behind, the eye at about head height, a little wider lens', street.view === 'street' && street.back > 3.0 && street.back < 4.6 && street.up > 1.5 && street.up < 2.3 && street.fov > 58, street);
await shot('G1-street-standing');
const keys = await page.evaluate(() => document.getElementById('keys').innerText);
check('G: the view key is offered on foot', /View/.test(keys), keys);
const seen = [];
for (let i = 0; i < 4; i += 1) { await page.keyboard.press('c'); await page.waitForTimeout(250); seen.push(await page.evaluate(() => window.__nlw.rig.view)); }
check('G: on foot the view goes round: further back, over the shoulder, from above, and back to the street', seen.join(',') === 'behind,shoulder,high,street', seen);
await page.keyboard.down('w'); await page.keyboard.down('Shift'); await page.waitForTimeout(2500);
const running = await camNow();
await shot('G2-street-running');
await page.keyboard.up('Shift'); await page.keyboard.up('w'); await page.waitForTimeout(1500);
check('G: at a run it comes a little closer', running.back < street.back - 0.3 && running.back > 2.2, { running, street });

// ---- helpers ----
const ride = (x, z, h) => page.evaluate(([x, z, h]) => {
  const n = window.__nlw;
  if (n.view.self.astride) n.server.send({ type: 'moto.leave' });
  const me = n.host.game.state.players[n.playerId];
  me.down = null; if (me.parked) for (const k of Object.keys(me.parked)) delete me.parked[k];
  n.server.send({ type: 'bikes.owned', bikes: ['white-sport'] });
  n.place(x, z); n.face(h);
  return n.rideBike('white-sport');
}, [x, z, h]);
const state = () => page.evaluate(() => { const n = window.__nlw, s = n.view.self; return { x: +n.view.self.x.toFixed(2), z: +n.view.self.z.toFixed(2), astride: !!s.astride, down: s.down ? { by: s.down.by, rising: s.down.rising } : null, kmh: Math.round(Math.abs(n.bikeState.speed) * 3.6), crashes: (n.host.game.state.players[n.playerId].stats.crashes || 0) }; });
const behind = (yaw) => page.evaluate((yaw) => { const n = window.__nlw; n.cam.yaw = yaw; n.cam.lastDrag = -10; }, yaw);
// holds the throttle, and the bike at `speed` m/s once it is there, for `seconds` (steering held at `steer`)
const hold = (speed, seconds, steer = null) => page.evaluate(async ([speed, seconds, steer]) => {
  const n = window.__nlw;
  const t0 = performance.now();
  let worst = 0;
  while (performance.now() - t0 < seconds * 1000) {
    if (n.view.self.astride && Math.abs(n.bikeState.speed) > speed) n.bikeState.speed = speed;
    worst = Math.max(worst, Math.abs(n.bikeState.speed));
    await new Promise((r) => requestAnimationFrame(r));
  }
  return worst;
}, [speed, seconds, steer]);

await page.evaluate(() => { const n = window.__nlw; n.server.send({ type: 'bikes.owned', bikes: ['white-sport'] }); });
await page.waitForTimeout(300);

// ---- A: a paved road, slowly, at town speed and flat out ----
let r = await ride(-30, 113, -Math.PI / 2);
check('A: on the White Sport Tourer on Waterside Road', !!(r && r.ok), r);
await page.waitForFunction(() => window.__nlw.ownBikeView.ready() || window.__nlw.ownBikeView.failed(), null, { timeout: 300000 });
await behind(-Math.PI / 2);
await page.keyboard.down('w');
const slow = await hold(3, 2.5);
const town = await hold(14, 3);
const fast = await hold(40, 4);
await page.keyboard.up('w');
await page.keyboard.down('s'); await page.waitForTimeout(1500); await page.keyboard.up('s');
let s = await state();
check('A: slowly, at town speed and flat out along the road: nobody falls', s.astride && !s.down && s.crashes === 0 && fast > 20, { slow, town, fast, ...s });
await shot('A-road');

// ---- B: the place in the video ----
// from the road, across its red verge onto the grass, and along the tower's curved wall where its roof reaches out
// overhead, at 28 km/h (the old box round the whole tower stood here, 4 m from the road)
r = await ride(-80, 112, -Math.PI / 2 - 0.25);
await page.waitForTimeout(500);
await behind(-Math.PI / 2 - 0.25);
await page.evaluate(() => { window.__nlw.bikeState.speed = 7.8; });
await page.keyboard.down('w');
await hold(7.8, 1.0);
// (then straight along the grass, a metre from where the old box began)
await page.evaluate(() => { const n = window.__nlw; n.predicted.heading = -Math.PI / 2; });
await hold(7.8, 3.5);
await page.keyboard.up('w');
s = await state();
await shot('B-beside-the-tower');
check('B: off the road and along the grass by the purple tower at 28 km/h, under its roof\'s overhang: nobody falls', s.astride && !s.down && s.crashes === 0 && s.x < -112, s);
await page.keyboard.down('s'); await page.waitForTimeout(1500); await page.keyboard.up('s');

// ---- C and D: the south end of Waterside Road, closed; into its roadblock at a walking pace ----
const kit = await page.evaluate(() => { const n = window.__nlw; const names = []; n.scene.traverse((o) => { if (o.name && o.name.startsWith('closures-')) names.push(o.name); }); return { names, closures: n.zone ? null : null }; });
check('C: the roadblocks and the fence along the edge are drawn', ['closures-striped', 'closures-drum', 'closures-cone', 'closures-signs', 'closures-posts'].every((k) => kit.names.includes(k)), kit.names);
r = await ride(-232, 113, -Math.PI / 2);
await page.waitForTimeout(400);
await behind(-Math.PI / 2);
await page.waitForTimeout(1200);
await shot('C-road-closed-ahead');
await page.evaluate(() => { window.__nlw.bikeState.speed = 2.8; });
await page.keyboard.down('w');
await hold(2.8, 5);
await page.keyboard.up('w');
s = await state();
check('C: the bike does not go through the roadblock', s.x > -243 + 0.35 + 0.5, s);
check('D: into it at 10 km/h it stops; the rider stays on', s.astride && !s.down && s.crashes === 0, s);
await shot('D-stopped-at-the-roadblock');

// ---- E: into it hard ----
r = await ride(-226, 113, -Math.PI / 2);
await page.waitForTimeout(400);
await behind(-Math.PI / 2);
const health0 = await page.evaluate(() => window.__nlw.view.self.health);
await page.evaluate(() => { window.__nlw.bikeState.speed = 14; });
await page.keyboard.down('w');
// watched every frame from here: where the figure is and what of it is lowest, against the ground under it
const watch = page.evaluate(async () => {
  const n = window.__nlw;
  const seen = [];
  const t0 = performance.now();
  const v = new THREE.Vector3();
  const names = ['head', 'neck_01', 'spine_03', 'spine_01', 'pelvis', 'hand_l', 'hand_r', 'lowerarm_l', 'lowerarm_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r'];
  while (performance.now() - t0 < 16000) {
    await new Promise((r) => requestAnimationFrame(r));
    const me = n.me; const d = me.fallDriver;
    let low = Infinity;
    for (const name of names) { const b = me.bones.get(name); if (b) { b.getWorldPosition(v); low = Math.min(low, v.y - n.zoneGroundY(v.x, v.z)); } }
    seen.push({ t: Math.round(performance.now() - t0), phase: d ? d.phase : null, lands: d && d.how ? d.how.lands : null, low: +low.toFixed(3), y: +me.group.position.y.toFixed(2), x: +me.group.position.x.toFixed(2), down: !!n.view.self.down, astride: !!n.view.self.astride });
    if (seen.length > 30 && !n.view.self.down && !d.phase && seen[seen.length - 2].phase === null) break;
  }
  return seen;
});
await hold(14, 1.5);
await page.keyboard.up('w');
// pictures along the way
const pics = [['E1-thrown', 250], ['E2-on-the-ground', 1300], ['E3-getting-up', 1600], ['E4-on-a-knee', 900], ['E5-up', 1500]];
for (const [name, wait] of pics) { await page.waitForTimeout(wait); await shot(name); }
const film = await watch;
const fell = await page.evaluate(() => { const s = window.__nlw.view.self; return { parked: (s.ownBikes.parked || []).find((b) => b.bike === 'white-sport') || null, health: s.health, down: s.down, astride: !!s.astride }; });
const phases = [...new Set(film.map((f) => f.phase).filter(Boolean))];
const lowest = Math.min(...film.filter((f) => f.phase && f.phase !== 'fall').map((f) => f.low));
const air = film.filter((f) => f.phase === 'fall');
const highest = Math.max(...air.map((f) => f.y), 0);
check('E: into the roadblock at 50 km/h the rider is thrown off: through the air, down on the front, on the ground, up again', phases.join(',') === 'fall,lie,rise' && air.length > 3 && film.some((f) => f.lands === 'front'), { phases, airFrames: air.length });
check('E: carried through the air from the seat, and down onto the ground', highest > 0.4, { highest });
check('E: on the ground and getting up, never through it (the lowest part of the body no more than a few centimetres in)', lowest > -0.06, { lowest });
check('E: the motorcycle lies on its side where it stopped; a little health lost', !!(fell.parked && fell.parked.fallen) && health0 - fell.health >= 0 && health0 - fell.health <= 5, fell);
check('E: up and in control again at the end', !fell.down && film.length && film[film.length - 1].phase === null, film.slice(-2));

// ---- F: pushed from behind, from in front, from the side ----
const pushed = async (rel, name) => {
  await page.evaluate(() => { const n = window.__nlw; if (n.view.self.astride) n.server.send({ type: 'moto.leave' }); });
  await page.evaluate(() => { const n = window.__nlw; n.place(-40, 100); n.face(0.4); });
  await page.waitForTimeout(800);
  await page.evaluate((rel) => {
    const n = window.__nlw, g = n.host.game, p = g.state.players[n.playerId];
    const now = g.state.real;
    p.down = { at: now, until: now + 2.6, upAt: now + 2.6 + 2.7, by: 'test', h: 0.4 + rel, from: { x: p.x - Math.sin(0.4 + rel) * 1.2, z: p.z - Math.cos(0.4 + rel) * 1.2 } };
  }, rel);
  const seen = await page.evaluate(async () => {
    const n = window.__nlw, out = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 9000) { await new Promise((r) => requestAnimationFrame(r)); const d = n.me.fallDriver; out.push({ phase: d.phase, how: d.how ? { ...d.how } : null }); if (out.length > 20 && !d.phase && !n.view.self.down) break; }
    return out;
  });
  const how = (seen.find((f) => f.how) || {}).how;
  const phases = [...new Set(seen.map((f) => f.phase).filter(Boolean))];
  return { how, phases, ended: seen.length && !seen[seen.length - 1].phase };
};
const fromBehind = await pushed(0, 'behind');
check('F: pushed from behind: forward, onto the front, and up through the hands and a knee', fromBehind.how && fromBehind.how.fall === 'fwd' && fromBehind.how.lands === 'front' && fromBehind.phases.join(',') === 'fall,lie,rise' && fromBehind.ended, fromBehind);
const fromFront = await pushed(Math.PI, 'front');
check('F: pushed from in front: back, onto the back, and up by sitting up, onto a knee', fromFront.how && fromFront.how.fall === 'back' && fromFront.how.lands === 'back' && fromFront.phases.join(',') === 'fall,lie,rise' && fromFront.ended, fromFront);
const fromSide = await pushed(Math.PI / 2, 'side');
check('F: pushed from the side: turned with the blow and down', fromSide.how && Math.abs(Math.abs(fromSide.how.turn) - Math.PI / 2) < 0.01 && fromSide.ended, fromSide);

const failed = results.filter((x) => !x).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nAll ${results.length} checks passed.`);
await browser.close();
process.exit(failed ? 1 : 0);
