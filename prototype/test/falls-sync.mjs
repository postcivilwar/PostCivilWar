// A fall seen by another player (19 October 2026, the owner's brief, test H): two players in two browsers, each with
// its own copy of the town, joined only by the website (the presence the server keeps), the network made slow as on a
// mobile connection. One rides their White Sport Tourer (bought with arrival money) into the roadblock at the south end
// of Waterside Road at 50 km/h; the other stands by the road and watches.
//   - the watcher sees them riding, then thrown: over the bars and the boards, down on the road beyond, lying, and
//     getting up, once (no fall begun again by a later word of the same one), where the rider really is, the body on
//     the ground and never in it, up again about when the rider is up on their own screen;
//   - the motorcycle is seen go down on its side where it stopped;
//   - only the rider is hurt and thrown: nothing happens to the watcher; nothing goes wrong in either page.
//   ../server/with-postgres.sh node test/falls-sync.mjs [shots folder]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDevServer } from '../../server/dev.mjs';
import { pastQuestion, enterTown } from './start.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const out = process.argv[2] || '/tmp/falls-sync-shots';
mkdirSync(out, { recursive: true });
const server = createDevServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); };
const LATENCY = 180;          // ms each way

async function player(label, size) {
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await context.newPage(); page.setDefaultTimeout(300000);
  page.on('pageerror', (e) => check(`no error in ${label}'s page`, false, `${e.message} ${(e.stack || '').split('\n').slice(0, 4).join(' | ')}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 4\d\d/.test(m.text())) check(`no error in ${label}'s console`, false, m.text()); });
  await page.goto(`${origin}/#nointro-gameclock`, { timeout: 300000 });
  await page.waitForFunction(() => !!(window.__nlw && window.__nlw.ready), null, { timeout: 300000 });
  await page.waitForSelector('#open-signup', { state: 'visible', timeout: 300000 });
  await page.click('#open-signup');
  const username = `${label}_${Math.random().toString(36).slice(2, 7)}`;
  await page.fill('#account-username', username); await page.fill('#account-password', `a password for ${label}`);
  await page.click('#account-submit');
  await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 120000 });
  await pastQuestion(page);
  await page.fill('#name', label);
  await enterTown(page);
  await page.waitForFunction(() => window.__nlw.me && window.__nlw.me.mixer && window.__nlw.me.fallDriver, null, { timeout: 240000 });
  await page.evaluate(() => { const n = window.__nlw; const g = n.host.game; g.state.weather = { kind: 'clear', until: g.state.t + 6 * 3600 }; const hour = n.view.clock.hourFloat; if (hour < 9 || hour > 15) n.skip((24 + 11 - hour) % 24); });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: LATENCY, downloadThroughput: 1.5e6 / 8, uploadThroughput: 750e3 / 8 });
  return { context, page, username, shot: (name) => page.screenshot({ path: resolve(out, `${name}.png`) }) };
}

const A = await player('Rider', { width: 560, height: 360 });
const B = await player('Watcher', { width: 960, height: 540 });

// ---- the rider buys the White Sport Tourer with arrival money; the watcher stands by Waterside Road, near its end ----
const bought = await A.page.evaluate(async () => {
  const n = window.__nlw;
  const r = await n.market.list('motorcycle');
  if (!r.ok) return r;
  const l = r.listings.find((x) => x.asset.model === 'bike:white-sport');
  n.place(l.place.x, l.place.z - 2);
  const opened = await n.market.open(l.id, { x: l.place.x, z: l.place.z - 1 });
  if (!opened.ok) return opened;
  const o = await n.market.offer(opened.thread.id, l.price, l.asset.name, 0);
  await n.market.mine();
  return { ok: o.ok, status: o.offer && o.offer.status };
});
check('the rider buys the White Sport Tourer with arrival money', bought.ok && bought.status === 'accepted', bought);
await A.page.waitForFunction(() => window.__nlw.view.self.ownBikes && window.__nlw.view.self.ownBikes.bikes.includes('white-sport'), null, { timeout: 60000 }).catch(() => {});
await A.page.keyboard.press('Escape');
await B.page.evaluate(() => { const n = window.__nlw; n.place(-236, 103.5); n.face(-Math.PI / 2); n.cam.yaw = -Math.PI / 2 + 0.9; n.cam.dist = 7.5; n.cam.pitch = 0.2; n.cam.lastDrag = 1e9; });
const on = await A.page.evaluate(() => { const n = window.__nlw; n.place(-222, 113); n.face(-Math.PI / 2); return n.rideBike('white-sport'); });
check('the rider is on it on Waterside Road', !!(on && on.ok), on);
await A.page.waitForFunction(() => window.__nlw.ownBikeView.ready() || window.__nlw.ownBikeView.failed(), null, { timeout: 300000 });
// (the watcher is told of them, and of the bike under them)
await B.page.waitForFunction((name) => { const n = window.__nlw; const q = n.shownPeers.find((o) => o.name === name); return !!(q && q.ride && n.peerBikeView.ridden(`peer:${q.id}`)); }, A.username, { timeout: 180000 }).catch(() => {});
const before = await B.page.evaluate((name) => { const n = window.__nlw; const q = n.shownPeers.find((o) => o.name === name); return q ? { ride: q.ride && q.ride.bike, drawn: !!n.peerBikeView.ridden(`peer:${q.id}`), x: q.x } : null; }, A.username);
check('the watcher sees the rider on the White Sport Tourer', !!before && before.ride === 'white-sport' && before.drawn, before);
await B.shot('H1-watcher-sees-the-rider');

// ---- into the roadblock at 50 km/h; the watcher watches every frame ----
const watching = B.page.evaluate(async (name) => {
  const n = window.__nlw, THREE = n.THREE, v = new THREE.Vector3();
  const names = ['head', 'neck_01', 'spine_03', 'spine_01', 'pelvis', 'hand_l', 'hand_r', 'lowerarm_l', 'lowerarm_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r'];
  const seen = [];
  const t0 = performance.now();
  let fellAt = null;
  while (performance.now() - t0 < 60000) {
    await new Promise((r) => requestAnimationFrame(r));
    const q = n.shownPeers.find((o) => o.name === name);
    const rig = q && n.crowd.rigOf(`p:${q.id}`);
    if (!rig || !rig.fallDriver || !rig.bones) continue;
    const d = rig.fallDriver;
    let low = Infinity;
    for (const b of names) { const bone = rig.bones.get(b); if (bone) { bone.getWorldPosition(v); low = Math.min(low, v.y - n.ground(v.x, v.z)); } }
    const bike = n.peerBikeView.keys().includes(`ppark:${q.id}:white-sport`) ? (q.parked || []).find((b) => b.bike === 'white-sport') : null;
    seen.push({ t: Math.round(performance.now() - t0), phase: d.phase, fall: d.how ? d.how.fall : null, low: +low.toFixed(3), x: +rig.group.position.x.toFixed(2), qx: +q.x.toFixed(2), down: q.down ? { kind: q.down.kind, age: +q.down.age.toFixed(2) } : null, bike: bike ? { fallen: !!bike.fallen, ago: bike.ago, x: bike.x } : null, ride: !!q.ride, mine: !!n.view.self.down });
    if (d.phase) fellAt = fellAt || performance.now();
    if (fellAt && !d.phase && !q.down && performance.now() - fellAt > 3000) break;
  }
  return seen;
}, A.username);
const crashed = await A.page.evaluate(async () => {
  const n = window.__nlw;
  n.bikeState.speed = 13.9;
  const t0 = performance.now();
  while (performance.now() - t0 < 20000 && n.view.self.astride) {
    if (Math.abs(n.bikeState.speed) > 13.9) n.bikeState.speed = 13.9;
    n.predicted.heading = -Math.PI / 2;
    await new Promise((r) => requestAnimationFrame(r));
  }
  const s = n.view.self;
  return { at: Math.round(performance.now()), down: s.down ? { by: s.down.by, lie: s.down.lie, rise: s.down.rise, over: s.down.over } : null, x: +s.x.toFixed(2), z: +s.z.toFixed(2), crashes: n.host.game.state.players[n.playerId].stats.crashes || 0 };
});
check('the rider runs into the roadblock at 50 km/h and is thrown, over it, onto the road beyond', !!crashed.down && crashed.down.by === 'crash' && !!crashed.down.over && crashed.x < -244 && crashed.crashes === 1, crashed);
for (let i = 0; i < 5; i += 1) { await B.page.waitForTimeout(900); await B.shot(`H2-watcher-sees-the-fall-${i}`); }
const film = await watching;
// the rider's own end of it: up again, and when
const riderUp = await A.page.evaluate(async () => { const n = window.__nlw; const t0 = performance.now(); while (n.view.self.down && performance.now() - t0 < 30000) await new Promise((r) => requestAnimationFrame(r)); return { up: !n.view.self.down, x: +n.view.self.x.toFixed(2), z: +n.view.self.z.toFixed(2), crashes: n.host.game.state.players[n.playerId].stats.crashes || 0 }; });
const phases = film.map((f) => f.phase).filter((p, i, a) => p && p !== a[i - 1]);
const starts = film.filter((f, i) => f.phase === 'fall' && (i === 0 || film[i - 1].phase !== 'fall')).length;
check('the watcher sees the rider thrown, lying and getting up, once: no fall begun again by a later word of the same one', phases.join(',') === 'fall,lie,rise' && starts === 1, { phases, starts, frames: film.length });
const lying = film.filter((f) => f.phase === 'lie' || f.phase === 'rise');
check('as the watcher sees it, the body is on the ground and never in it, where the rider really is (beyond the boards)', lying.length > 3 && Math.min(...lying.map((f) => f.low)) > -0.06 && lying.every((f) => Math.abs(f.x - crashed.x) < 0.8), { lowest: lying.length ? Math.min(...lying.map((f) => f.low)) : null, seenAt: lying.length ? lying[0].x : null, riderAt: crashed.x });
const tipped = film.filter((f) => f.bike && f.bike.fallen);
check('the watcher sees the motorcycle down on its side where it stopped, short of the boards, from the moment it came down', tipped.length > 0 && tipped[0].bike.x > -242.65 && Number.isFinite(tipped[0].bike.ago) && tipped[0].bike.ago < 3, tipped.slice(0, 2));
check('only the rider fell: the watcher is untouched, the rider thrown once', !film.some((f) => f.mine) && riderUp.up && riderUp.crashes === 1, riderUp);
await B.page.evaluate(() => { const n = window.__nlw; n.cam.yaw = -Math.PI / 2 + 0.5; n.cam.dist = 9; });
await B.page.waitForTimeout(1500);
await B.shot('H3-watcher-after');
await A.shot('H3-rider-after');

const failed = results.filter((x) => !x).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nAll ${results.length} checks passed.`);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
