// The habitation at the far end of the River Niger (20 October 2026, the owner's brief), in the game as it is served,
// with its server, in a headless browser; two players, the second on a phone's settings (#lite):
//   A  the way there: Waterside Road on out of the town, its sign, and the habitation's gate a short walk past it
//      (21 October 2026: brought down to the end of the town's road)
//   B  on a motorcycle to the gate: stopped at the footbridge, "Get off your vehicle to cross the bridge" and a button
//      that gets the rider off; the motorcycle left where it stopped; on foot over the bridge, on its boards
//   C  walking: the paths walked; a tree and a rock stop the walker; off the path, on into the forest, free to go
//      anywhere nothing stands in the way
//   K  the boiling river at its far end: steaming and boiling, heard, its signs; never gone into, and no swimming offered
//   D  the owner's models: every one fetched and drawn near, the trees' pictures afar; what it costs to draw, on a
//      computer and on a phone; how long it takes to arrive
//   E  fish in its waters, scattering as the player wades in; none in the Niger
//   F  birds: at least ten kinds, parrots among them, high and low, flying, sitting and wading; their songs played
//   G  the big waterfall heard, louder near it; at night frogs and crickets
//   H  night: dark, the moon and the stars out; the phone's Torch lights the way ahead; the other player sees its beam
//   I  each place, beside the owner's picture of it (screenshots)
//   L  22 October 2026: feet on the ground drawn, on a phone too (the sandy bank); the legs seen in the shallows, and deep
//      water stopping the walker with a word why, the big signs; a bridge's rails and posts in the way; the big
//      waterfall's stairs walked down in their cutting and back up with the figure's own climb; a jump, seen by the other
//   ../server/with-postgres.sh node test/habitation.mjs [shots folder]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createDevServer } from '../../server/dev.mjs';
import { pastQuestion, enterTown } from './start.mjs';
import { HABITATION, HABITATION_STANDING, HABITATION_MODELS, HABITATION_DECKS, HABITATION_SHIFT, UPRIVER, HOT_RIVER_SIGNS, HABITATION_SWIM_SIGNS, HABITATION_DECK_POSTS, habitationFooting, habitationDeckAt, habitationGroundAt, habitationWaterAt, hotRiverNear, habitationRootAt, zoneWalkable, zoneStep } from '../src/sim/zone.js';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const out = process.argv[2] || '/tmp/habitation-shots';
mkdirSync(out, { recursive: true });
const server = createDevServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;
const results = [];
const measures = {};
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); };
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
// (the brightness of a picture: its mean, 0 to 255, over all of it or a part [x0, y0, x1, y1] as shares of it)
function brightness(file, part = [0, 0, 1, 1]) {
  const r = spawnSync('python3', ['-c', `
import sys
from PIL import Image, ImageStat
im = Image.open(sys.argv[1]).convert('L')
w, h = im.size
p = [float(v) for v in sys.argv[2:6]]
print(ImageStat.Stat(im.crop((int(p[0]*w), int(p[1]*h), int(p[2]*w), int(p[3]*h)))).mean[0])`, file, ...part.map(String)], { encoding: 'utf8' });
  return Number(r.stdout.trim());
}

async function player(name, { lite = false } = {}) {
  const context = await browser.newContext(lite ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, serviceWorkers: 'block' } : { viewport: { width: 1000, height: 520 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(300000);
  page.on('pageerror', (e) => check(`no error in ${name}'s page`, false, e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 4\d\d/.test(m.text())) check(`no error in ${name}'s console`, false, m.text()); });
  // (what of the habitation could not be read, and why: written down with the results)
  page.on('console', (m) => { if (m.type() === 'warning' && /habitation/.test(m.text())) console.log(`${name}'s page:`, m.text()); });
  await page.goto(`${origin}/#nointro-gameclock${lite ? '-lite' : ''}`, { timeout: 300000 });
  await page.waitForFunction(() => !!(window.__nlw && window.__nlw.intro), null, { timeout: 300000 });
  await page.waitForSelector('#open-signup', { state: 'visible', timeout: 300000 });
  await page.click('#open-signup');
  await page.fill('#account-username', `Hab_${name}_${Math.random().toString(36).slice(2, 7)}`);
  await page.fill('#account-password', 'a password for the habitation test');
  await page.click('#account-submit');
  await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 120000 });
  await pastQuestion(page);
  await page.fill('#name', `Habitation ${name}`);
  await enterTown(page, { tap: lite, wait: 900000 });
  await page.waitForFunction(() => window.__nlw.me && window.__nlw.me.mixer, null, { timeout: 240000 });
  await page.evaluate(() => { const n = window.__nlw; const g = n.host.game; g.state.weather = { kind: 'clear', until: g.state.t + 12 * 3600 }; const hour = n.view.clock.hourFloat; if (hour < 9 || hour > 14) n.skip((24 + 10 - hour) % 24); n.audio.start(); });
  return { page, context };
}
const A = await player('A');
const page = A.page;
let shotN = 0;
const shot = async (name, p = page) => { const file = resolve(out, `${String(++shotN).padStart(2, '0')}-${name}.png`); await p.screenshot({ path: file }); return file; };
const at = (x, z, heading, p = page) => p.evaluate(([x, z, heading]) => { const n = window.__nlw; n.place(x, z); n.face(heading); n.cam.yaw = heading; }, [x, z, heading]);
// (a place in the habitation as it was laid out: it stands HABITATION_SHIFT metres along from there, at the end of the
// town's road)
const S = HABITATION_SHIFT;
// Each model's bulk round its middle, for framing a picture (not for walking: what stops a walker is zone.js's): a
// tree's trunk with its buttresses, a palm's trunk, a big plant, a rock (tools/habitation/facts.json, the models' own
// measures). `openYaw` is the way to look, nearest `want`, with nothing's bulk between whoever is looked at and an eye
// `dist` behind them (21 October 2026: in the forest the eye had come down inside a buttressed tree's root).
const FACTS = Object.fromEntries(Object.entries(JSON.parse(readFileSync(new URL('../tools/habitation/facts.json', import.meta.url), 'utf8'))).map(([file, f]) => [file.replace('3dmodel', '').replace('.glb', ''), f]));
const bulkOf = (p) => {
  if (p.m.startsWith('rock-')) return p.s * 0.55;
  const f = FACTS[p.m];
  if (!f) return 0;
  const unit = p.s / f.height;
  if (f.kind === 'tree') return f.trunk_r * unit * 1.25;
  if (f.kind === 'palm' || f.kind === 'banana') return f.trunk_r * unit + 0.4;
  return p.s > 2 ? f.base_r * unit * 0.8 : 0;
};
const openYaw = (x, z, want, dist = 6) => {
  const near = HABITATION_STANDING.filter((p) => Math.hypot(p.x - x, p.z - z) < dist + 12).map((p) => ({ p, r: bulkOf(p) })).filter((q) => q.r > 0);
  const clear = (yaw) => { for (let d = 0.8; d <= dist + 0.5; d += 0.4) { const px = x - Math.sin(yaw) * d, pz = z - Math.cos(yaw) * d; if (near.some((q) => Math.hypot(q.p.x - px, q.p.z - pz) < q.r + 0.4)) return false; } return true; };
  for (let k = 0; k <= 24; k += 1) for (const yaw of k ? [want + (k * Math.PI) / 24, want - (k * Math.PI) / 24] : [want]) if (clear(yaw)) return yaw;
  return want;
};
const atHab = (x, z, heading, p = page) => at(x + S, z, heading, p);
const hold = async (key, ms, p = page) => { await p.keyboard.down(key); await p.waitForTimeout(ms); await p.keyboard.up(key); };
const state = (p = page) => p.evaluate(() => { const n = window.__nlw; return { x: n.predicted.x, z: n.predicted.z, y: n.me.group.position.y, astride: !!n.view.self.astride, hab: n.habitation ? n.habitation.state() : null }; });
// Frames drawn: counted in the page, so that a view is looked at once it has been drawn a few times over (the models
// near the camera chosen afresh after a move), however slowly this machine draws.
const countFrames = (p) => p.evaluate(() => { if (window.__frames === undefined) { window.__frames = 0; const f = () => { window.__frames += 1; requestAnimationFrame(f); }; requestAnimationFrame(f); } });
async function settle(n = 4, p = page) {
  await countFrames(p);
  const f0 = await p.evaluate(() => window.__frames);
  await p.waitForFunction(([a, k]) => window.__frames >= a + k, [f0, n], { timeout: 120000 }).catch(() => {});
}
// Walk ahead until stopped by something (or `most` ms): the town's time goes by frame by frame, at most half a second a
// frame, and this machine (no graphics card) draws the habitation a frame every second or two, so a walk is measured by
// where the walker got to, not by how long the key was held.
async function walkUntilStopped(most = 30000, p = page) {
  await p.keyboard.down('w');
  const t0 = Date.now();
  let prev = await state(p), still = 0, moved = 0;
  while (Date.now() - t0 < most) {
    await p.waitForTimeout(700);
    const s = await state(p);
    const d = Math.hypot(s.x - prev.x, s.z - prev.z);
    moved += d; prev = s;
    still = d < 0.03 ? still + 1 : 0;
    if (still >= 3 && moved > 0.2) break;
  }
  await p.keyboard.up('w');
  return { ...prev, moved };
}

// ---- A: the way there ----
await at(238, 113, Math.PI / 2);
await page.waitForFunction(() => window.__nlw.habitation && window.__nlw.habitation.state().upriver, null, { timeout: 60000 }).catch(() => {});
const road = await page.evaluate(() => { const n = window.__nlw; const names = []; n.scene.traverse((o) => { if (o.name && o.name.startsWith('sign:')) names.push(o.name); }); return { upriver: n.habitation.state().upriver, signs: names, ground: n.ground(270, 113) }; });
check('A: north out of the town Waterside Road goes on along the river, its sign saying where it goes', road.upriver && road.signs.includes('sign:habitation-way') && road.signs.includes('sign:habitation-gate') && road.ground === 0, road);
await page.evaluate(() => { const n = window.__nlw; n.cam.dist = 9; n.cam.pitch = 0.18; });
await page.waitForTimeout(2500);
await shot('the-road-north');
// the sign at the start of the road, and the gate a short walk past it: from beside the sign, the habitation is there
{
  const sign = UPRIVER.signs[0];
  await at(sign.x - 8, 113, Math.PI / 2);
  await page.waitForFunction(() => { const h = window.__nlw.habitation.state(); return h.built; }, null, { timeout: 120000 }).catch(() => {});
  await page.evaluate(() => { const n = window.__nlw; n.cam.dist = 7; n.cam.pitch = 0.1; });
  await settle(4); await page.waitForTimeout(800);
  const seen = await page.evaluate(() => ({ built: window.__nlw.habitation.state().built }));
  const gap = Math.hypot(HABITATION.gate.x - sign.x, HABITATION.gate.z - sign.z);
  check('A: the habitation\'s gate is a short walk past the first sign at the end of the town\'s road, and is there to be seen from it', gap < 90 && seen.built, { sign: [sign.x, sign.z], gate: [HABITATION.gate.x, HABITATION.gate.z], gap: +gap.toFixed(0), ...seen });
  await shot('from-the-first-sign');
}

// ---- B: to the gate on a motorcycle, and over the footbridge on foot ----
const bought = await page.evaluate(async () => {
  const n = window.__nlw;
  const all = await n.market.all();
  const l = all.listings.find((x) => x.asset.model === 'bike:cafe-racer' && x.kind === 'primary');
  if (!l) return { ok: false, code: 'NOT_LISTED' };
  n.place(l.place.x, l.place.z);
  const opened = await n.market.open(l.id, { x: l.place.x, z: l.place.z });
  if (!opened.ok) return opened;
  const last = Math.max(0, ...(opened.messages || []).map((m) => m.id));
  const answer = await n.market.offer(opened.thread.id, l.price, l.name, last);
  return { ok: answer.ok, code: answer.code };
});
await page.waitForFunction(() => { const s = window.__nlw.view.self; return s.ownBikes && s.ownBikes.bikes.includes('cafe-racer'); }, null, { timeout: 60000 }).catch(() => {});
await atHab(1852, 91, Math.PI / 2);
await page.waitForTimeout(1500);
await page.evaluate(() => window.__nlw.rideBike('cafe-racer'));
await page.waitForFunction(() => !!window.__nlw.view.self.astride, null, { timeout: 30000 }).catch(() => {});
await page.evaluate(() => { const n = window.__nlw; n.face(Math.PI / 2); n.bikeState.heading = Math.PI / 2; n.cam.yaw = Math.PI / 2; });
await page.keyboard.down('w');
const stopped = await page.waitForFunction(() => { const b = document.getElementById('bridge-stop'); return b && !b.hidden; }, null, { timeout: 30000 }).then(() => true, () => false);
await page.keyboard.up('w');
await page.waitForTimeout(400);
const atBridge = await page.evaluate(() => { const n = window.__nlw, b = document.getElementById('bridge-stop'); return { shown: !b.hidden, text: document.getElementById('bridge-stop-text').textContent, button: document.getElementById('bridge-stop-off').textContent, x: n.predicted.x, astride: !!n.view.self.astride, speed: n.bikeState.speed }; });
check('B: ridden to the gate, the motorcycle is stopped at the footbridge: "Get off your vehicle to cross the bridge", with a button to get off', bought.ok && stopped && atBridge.shown && atBridge.text === 'Get off your vehicle to cross the bridge' && /Get off/.test(atBridge.button) && atBridge.x < 1876 + S && atBridge.astride, { bought, ...atBridge });
await shot('stopped-at-the-footbridge');
await page.click('#bridge-stop-off');
await page.waitForFunction(() => !window.__nlw.view.self.astride, null, { timeout: 20000 }).catch(() => {});
const off = await page.evaluate(() => { const n = window.__nlw, s = n.view.self; const b = (s.ownBikes.parked || []).find((p) => p.bike === 'cafe-racer'); return { astride: !!s.astride, parked: b ? { x: b.x, z: b.z } : null, banner: !document.getElementById('bridge-stop').hidden }; });
check('the button gets the rider off; the motorcycle stays where it stopped, before the bridge', !off.astride && !!off.parked && off.parked.x < 1876 + S && Math.abs(off.parked.x - atBridge.x) < 2.5 && !off.banner, off);
// across on foot: on the boards, above the stream
await page.evaluate(() => { const n = window.__nlw; n.face(Math.PI / 2); n.cam.yaw = Math.PI / 2; });
const crossing = [];
await page.keyboard.down('w');
for (let i = 0; i < 160; i += 1) { await page.waitForTimeout(400); const s = await state(); crossing.push(s); if (s.x > 1900 + S) break; }
await page.keyboard.up('w');
const onBoards = crossing.filter((s) => s.x > 1878 + S && s.x < 1896 + S);
const deckY = (x) => habitationDeckAt(x, 91);
check('on foot the footbridge is crossed, on its boards above the stream, onto the hill\'s path', crossing.length && crossing[crossing.length - 1].x > 1898 + S && onBoards.length > 0 && onBoards.every((s) => deckY(s.x) && Math.abs(s.y - deckY(s.x).y) < 0.35), { end: crossing.length ? +crossing[crossing.length - 1].x.toFixed(1) : null, onBoards: onBoards.map((s) => [+s.x.toFixed(1), +s.y.toFixed(2)]) });
await page.evaluate((x) => { const n = window.__nlw; n.place(x, 91); n.face(Math.PI / 2); n.cam.yaw = -Math.PI / 2 + 0.5; n.cam.dist = 7; }, 1887 + S);
await page.waitForTimeout(1500);
await shot('on-the-footbridge');

// ---- C: walking: the paths; a tree and a rock stop the walker; not into the forest ----
const solidNear = (kind) => HABITATION_STANDING.filter((s) => s.solid >= 0.3 && HABITATION_MODELS[s.m] && HABITATION_MODELS[s.m].kind === kind).map((s) => {
  // a place to stand 2.5 m from it that can be walked, on its open side
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) { const x = s.x + Math.cos(a) * (s.solid + 2.2), z = s.z + Math.sin(a) * (s.solid + 2.2); const f = habitationFooting(x, z); if (f && f.walk && f.kind !== 'shallows' && !f.footOnly) { let clear = true; for (let d = 0.3; d < 2.2; d += 0.3) { const g = habitationFooting(s.x + Math.cos(a) * (s.solid + d), s.z + Math.sin(a) * (s.solid + d)); if (!g || !g.walk) clear = false; } if (clear) return { s, x, z, heading: Math.atan2(s.x - x, s.z - z) }; } }
  return null;
}).filter(Boolean);
for (const kind of ['tree', 'palm', 'rock']) {
  const t = solidNear(kind)[0];
  if (!t) { check(`C: a ${kind} by an open place, to walk into`, false); continue; }
  await at(t.x, t.z, t.heading);
  await page.waitForTimeout(600);
  const s = await walkUntilStopped(30000);
  const gap = Math.hypot(s.x - t.s.x, s.z - t.s.z);
  // (stopped at its trunk, or just short of it where its wood reaches out further at a walker's height: never inside its
  // trunk, and stopped by something the game holds to be there, a step on)
  const ux = (t.s.x - s.x) / gap, uz = (t.s.z - s.z) / gap, ahead = !zoneWalkable(s.x + ux * 0.7, s.z + uz * 0.7, [], 0.4);
  check(`C: walked into, a ${kind} (${t.s.m}) stops the walker at its trunk`, gap >= t.s.solid + 0.2 && gap < t.s.solid + 2.4 && ahead, { gap: +gap.toFixed(2), solid: t.s.solid, ahead });
}
// a big tree's buttresses and roots (21 October 2026: they reach out 5 to 15 m, and were walked through): walked toward
// from open ground, the walker is stopped where they stand at a walker's height, not let in through them to its trunk
{
  const big = (() => {
    for (const q of HABITATION_STANDING.filter((p) => p.m === 'giantbuttress-roottree' && p.y === null)) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
        const sx = q.x + Math.cos(a) * 20, sz = q.z + Math.sin(a) * 20, f0 = habitationFooting(sx, sz);
        if (!f0 || f0.kind !== 'forest' || !zoneWalkable(sx, sz, [], 0.4)) continue;
        // (walked on, over the forest's floor, to the first thing in the way: one of its roots, well short of its trunk)
        for (let d = 0.25, px = sx, pz = sz; d < 20; d += 0.25) {
          const x = sx + ((q.x - sx) * d) / 20, z = sz + ((q.z - sz) * d) / 20, f = habitationFooting(x, z);
          if (!f || f.kind !== 'forest' || !zoneStep(px, pz, x, z)) break;
          px = x; pz = z;
          if (!zoneWalkable(x, z, [], 0.4)) { if (habitationRootAt(x, z, 0.4) && 20 - d > q.solid + 3 && d > 3) return { q, x: sx, z: sz, heading: Math.atan2(q.x - sx, q.z - sz), first: d }; break; }
        }
      }
    }
    return null;
  })();
  if (!big) check('C: a big buttress-rooted tree with open forest floor round it, to walk into', false);
  else {
    await at(big.x, big.z, big.heading);
    await page.waitForTimeout(600);
    const s = await walkUntilStopped(40000);
    const gap = Math.hypot(s.x - big.q.x, s.z - big.q.z);
    check('C: walked toward a giant buttress-rooted tree, the walker is stopped at its roots, not let in through them to its trunk', gap > big.q.solid + 2.5 && Math.abs(s.moved - big.first) < 1.2, { gap: +gap.toFixed(1), trunk: big.q.solid, rootsAt: +(20 - big.first).toFixed(1), moved: +s.moved.toFixed(1) });
    await page.evaluate((yaw) => { const n = window.__nlw; n.cam.dist = 7; n.cam.pitch = 0.18; n.cam.yaw = yaw; }, big.heading + 0.9);
    await settle(3); await page.waitForTimeout(500);
    await shot('stopped-at-a-big-trees-roots');
  }
}
// from the path, off it and on into the forest (21 October 2026, the owner: free to go anywhere nothing stands in the
// way): the walker goes on among the trees until something stands in the way, or a long way in
{
  const x = 2040 + S, z = 81.5;       // (on the forest path; the forest to the west of it)
  const f0 = habitationFooting(x, z);
  // (the way off the path with the most room before a trunk or a plant: the forest is dense, and a walker stopped by a
  // tree at once would say nothing of the ground)
  const room = (h) => { for (let d = 0.5; d <= 16; d += 0.5) { const px = x + Math.sin(h) * d, pz = z + Math.cos(h) * d; const f = habitationFooting(px, pz); if (!f || !f.walk || !zoneWalkable(px, pz, [], 0.45)) return d; } return 16; };
  const ways = Array.from({ length: 24 }, (_, i) => (i / 24) * Math.PI * 2).filter((h) => { const f = habitationFooting(x + Math.sin(h) * 7, z + Math.cos(h) * 7); return f && f.kind === 'forest'; });
  const heading = ways.sort((a, b) => room(b) - room(a))[0];
  await at(x, z, heading === undefined ? -Math.PI / 2 + 0.3 : heading);
  await page.waitForTimeout(500);
  const s = await walkUntilStopped(40000);
  const f = habitationFooting(s.x, s.z);
  check('C: from the path the walker goes on off it, into the forest, free among the trees', f0 && f0.walk && f && f.walk && f.kind === 'forest' && s.moved > 6, { from: f0 && f0.kind, now: f && f.kind, moved: +s.moved.toFixed(1), at: [+s.x.toFixed(1), +s.z.toFixed(1)] });
  // (looked at from where nothing's bulk stands between: the way walked, or as near it as there is room)
  const yaw = openYaw(s.x, s.z, heading === undefined ? -Math.PI / 2 + 0.3 : heading);
  await page.evaluate((yaw) => { const n = window.__nlw; n.cam.dist = 6; n.cam.pitch = 0.15; n.cam.yaw = yaw; }, yaw);
  await settle(3); await page.waitForTimeout(500);
  await shot('in-the-forest-off-the-path');
  { const e = await page.evaluate(() => { const c = window.__nlw.camera.position; return [c.x, c.y, c.z]; }); console.log('  (the forest picture: the eye at', e.map((v) => +v.toFixed(1)).join(', '), 'looking', +yaw.toFixed(2), 'walked', +(heading || 0).toFixed(2), '; nearest:', HABITATION_STANDING.map((p) => ({ p, d: Math.hypot(p.x - e[0], p.z - e[2]) })).sort((a, b) => a.d - b.d).slice(0, 4).map((q) => `${q.p.m} ${q.d.toFixed(1)} m (bulk ${bulkOf(q.p).toFixed(1)})`).join(', '), ')'); }
}

// across the habitation's bridges on foot, end to end on their boards: the suspension bridge over the outflow's gorge
// (pictures 9, 13), the rocky gorge's wooden bridge (picture 7) and the bridge below the big waterfall (picture 11)
for (const id of ['suspension-bridge', 'gorge-bridge', 'outflow-bridge']) {
  const d = HABITATION_DECKS.find((q) => q.id === id);
  const a = d.line[0], b = d.line[d.line.length - 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len, heading = Math.atan2(ux, uz);
  // (from its first end, on its boards: the ways up to some of them come in from one side)
  await at(a[0] + ux * 0.6, a[1] + uz * 0.6, heading);
  await page.evaluate(() => { const n = window.__nlw; n.cam.dist = 6; n.cam.pitch = 0.2; });
  await page.waitForTimeout(600);
  const walked = [];
  await page.keyboard.down('w');
  for (let i = 0; i < 150; i += 1) { await page.waitForTimeout(400); const s = await state(); walked.push(s); if ((s.x - a[0]) * ux + (s.z - a[1]) * uz > len + 2) break; }
  await page.keyboard.up('w');
  const last = walked[walked.length - 1];
  const along = (last.x - a[0]) * ux + (last.z - a[1]) * uz;
  const onDeck = walked.filter((s) => habitationDeckAt(s.x, s.z) && habitationDeckAt(s.x, s.z).deck.id === id);
  check(`C: the ${id.replace('-', ' ')} is crossed on foot, end to end, on its boards`, along > len + 1.5 && onDeck.length > 0 && onDeck.every((s) => Math.abs(s.y - habitationDeckAt(s.x, s.z).y) < 0.4), { along: +along.toFixed(1), of: +len.toFixed(1), onDeck: onDeck.length });
  if (id === 'suspension-bridge') { await at(a[0] + ux * len * 0.5, a[1] + uz * len * 0.5, heading); await page.evaluate(() => { const n = window.__nlw; n.cam.dist = 7; n.cam.pitch = 0.25; n.cam.yaw += 0.9; }); await settle(3); await page.waitForTimeout(600); await shot('on-the-suspension-bridge'); }
}

// ---- D: the owner's models, and what it costs to draw ----
// (on this machine, which draws a frame of the habitation in a second or two, its models come in over minutes: how
// many have come is written down each minute; a phone's graphics chip draws a frame in a few hundredths)
let arrived = false;
for (let waited = 0; waited < 900; waited += 15) {
  const h = await page.evaluate(() => window.__nlw.habitation.state());
  if (h.built && h.models >= h.of) { arrived = true; break; }
  if (waited % 60 === 0) console.log(`  the habitation's models: ${h.models} of ${h.of} after ${waited} s (${h.now ? `${h.now.model}: ${h.now.step}` : ''})`);
  await page.waitForTimeout(15000);
}
const hab = await page.evaluate(() => window.__nlw.habitation.state());
check('D: every one of the owner\'s models (and the rocks) is fetched and stands in the habitation', arrived && hab.models === hab.of && hab.instances > 1400 && hab.pictures >= 25, hab);
// the plants sway: their leaves and fronds made to bend (each point by how far out on its leaf it is), in a wind that
// goes on blowing
const swaying = await page.evaluate(async () => {
  const n = window.__nlw, parts = [];
  n.scene.traverse((o) => { if (o.isInstancedMesh && o.geometry.attributes.sway) { const a = o.geometry.attributes.sway.array; let most = 0; for (let i = 0; i < a.length; i += 7) most = Math.max(most, a[i]); if (most > 0.3) parts.push(o.name.split(':')[0]); } });
  const w0 = n.habitation.state().wind;
  await new Promise((r) => setTimeout(r, 1500));
  return { kinds: [...new Set(parts)].length, wind: [w0, n.habitation.state().wind] };
});
check('C: the plants sway in the wind: the palms\', bananas\', ferns\' and bushes\' leaves bend, and the wind keeps blowing', swaying.kinds >= 20 && swaying.wind[1] !== swaying.wind[0], swaying);
measures.computer = { buildMs: hab.buildMs, modelsMs: hab.modelsMs, modelBytes: hab.modelBytes, places: {} };
// each place: where to stand (on its path, boardwalk or beach) and what to look at (as the owner's picture of it does)
const VIEW_AT = {
  gate: [[1895, 91], [1936, 17]], hill: [[1931, 26], [1946, 12]], forest: [[2036, 79], [2110, 112]], swamp: [[2052, -72], [2062, -110]],
  mangroves: [[2030, 154], [2098, 154]], lagoon: [[2170, 119], [2260, 260]], island: [[2196, 140], [2206, 205]], gorge: [[2369, 106], [2420, 52]],
  bigfall: [[2446, 216], [2490, 225]], bridge: [[2388, 212], [2386, 236]], fallspool: [[2338, 318], [2364, 338]], overlook: [[2252, 371], [2200, 290]],
  garden: [[2170, 405], [2156, 396]], sunset: [[2200, 350], [2150, 240]],
};
const VIEWS = Object.fromEntries(Object.entries(VIEW_AT).map(([k, [eye, to]]) => [k, { eye: [eye[0] + S, eye[1]], look: Math.atan2(to[0] - eye[0], to[1] - eye[1]) }]));
// and each of the owner's nineteen pictures: where in the habitation it is, seen from a place the player can stand
// (on its path, boardwalk, stairs, beach or in its shallows), looking as the picture looks; the sunset at sunset
const PICTURE_AT = {
  '01': [[2336, 113], [2384, 87], 0.08], '02': [[2262.6, 133.5], [2338, 184]], '03': [[2338, 318], [2366, 338]], '04': [[2036, 79], [2110, 112]],
  '05': [[2016, 141], [2062, 168]], '06': [[2240, 371], [2225, 250], 0.22], '07': [[2348, 104], [2364, 100.4], 0.06], '08': [[2232, 124], [2336, 182]],
  '09': [[2387.3, 219], [2386, 236], 0.05], '10': [[1927, 38], [1943, 4], 0.05], '11': [[2446, 216], [2490, 225], 0.02], '12': [[2031, -40], [2052, -72]],
  '13': [[2390.9, 209.1], [2368, 232], 0.12], '14': [[2200, 352], [2150, 240]], '15': [[2060, 92], [2020, 74]], '16': [[2246, 368], [2205, 205], 0.32],
  '17': [[2262, 368], [2214, 334], 0.28], '18': [[2205.9, 355.5], [2190, 320]], '19': [[2166, 404], [2168, 389], 0.16],
};
const cost = async (p = page) => p.evaluate(() => { const n = window.__nlw, g = n.graphics; return { calls: n.drawn.calls, triangles: n.drawn.triangles, drawn: n.habitation.state().drawn, gpuMB: +(((g.pictures || 0) + (g.buffers || 0)) / 1048576).toFixed(0) }; });
const toHour = (hour, p = page) => p.evaluate((h) => { const n = window.__nlw, g = n.host.game; n.skip((24 + h - n.view.clock.hourFloat) % 24); g.state.weather = { kind: 'clear', until: g.state.t + 12 * 3600 }; }, hour);
for (const [pic, [eye, to, pitch = 0.12]] of Object.entries(PICTURE_AT)) {
  if (pic === '14') await toHour(18.3);
  await atHab(eye[0], eye[1], Math.atan2(to[0] - eye[0], to[1] - eye[1]));
  await page.evaluate((pitch) => { const n = window.__nlw; n.cam.dist = 5.5; n.cam.pitch = pitch; }, pitch);
  await settle(4); await page.waitForTimeout(800);
  measures.computer.places[`picture-${pic}`] = await cost();
  await shot(`picture-${pic}`);
  if (pic === '14') await toHour(10);
}
const worst = Object.entries(measures.computer.places).sort((a, b) => b[1].triangles - a[1].triangles)[0];
check('D: on a computer, what is drawn stays in hand everywhere in the habitation (draw calls, triangles, graphics memory)', Object.values(measures.computer.places).every((c) => c.calls < 700 && c.triangles < 3.5e6), { worst });

// ---- E: fish ----
const fishWater = await page.evaluate(() => window.__nlw.habitationLife.state().fishNow.map((s) => s.water));
check('E: fish in the habitation\'s waters (the lagoon, the pools, the gorge\'s stream), none in the Niger', fishWater.length >= 10 && !fishWater.includes('niger') && fishWater.includes('lagoon'), fishWater);
{
  // stand on the beach or in the shallows by a shoal of the lagoon's, then wade toward it. (A shoal swims where the
  // water is from a hand's depth to over a man's head, and moves about: the one taken is one that can be waded up to
  // now, from a place to stand 7 to 12 m off, every step of the way to within 4 m of it on sand or in the shallows.)
  const shoals = await page.evaluate(() => window.__nlw.habitationLife.state().fishNow.filter((q) => q.water !== 'niger').sort((p, q) => (p.water === 'lagoon' ? 0 : 1) - (q.water === 'lagoon' ? 0 : 1)));
  const standing = (x, z) => { const f = habitationFooting(x, z); return !!f && f.walk && (f.kind === 'sand' || f.kind === 'shallows'); };
  let from = null, fx = 0, fz = 0;
  for (const shoal of shoals) {
    const cx = shoal.fish.reduce((a, f) => a + f.x, 0) / shoal.fish.length, cz = shoal.fish.reduce((a, f) => a + f.z, 0) / shoal.fish.length;
    for (let r = 7; r <= 12 && !from; r += 1) for (let a = 0; a < Math.PI * 2 && !from; a += Math.PI / 18) {
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      let way = true;
      for (let d = r; d >= 3.6 && way; d -= 0.6) way = standing(cx + Math.cos(a) * d, cz + Math.sin(a) * d);
      if (way) { from = { x, z, heading: Math.atan2(cx - x, cz - z) }; fx = cx; fz = cz; }
    }
    if (from) break;
  }
  if (!from) check('E: somewhere to stand by a shoal, and wade up to it', false, shoals.map((q) => ({ at: [q.fish[0].x, q.fish[0].z] })));
  else {
    await at(from.x, from.z, from.heading);
    await page.waitForTimeout(1500);
    const before = await page.evaluate(([fx, fz]) => { const s = window.__nlw.habitationLife.state().fishNow.find((q) => q.water !== 'niger' && Math.hypot(q.fish[0].x - fx, q.fish[0].z - fz) < 12); return s ? { scared: s.scared } : null; }, [fx, fz]);
    await shot('fish-in-the-shallows');
    await page.keyboard.down('w');
    let scattered = false;
    for (let i = 0; i < 100 && !scattered; i += 1) { await page.waitForTimeout(300); scattered = await page.evaluate(() => window.__nlw.habitationLife.state().scattered > 0); }
    await page.keyboard.up('w');
    const after = await page.evaluate(() => { const n = window.__nlw, me = n.predicted; const near = n.habitationLife.state().fishNow.flatMap((s) => s.fish).map((f) => Math.hypot(f.x - me.x, f.z - me.z)).sort((a, b) => a - b); return { nearest: +near[0].toFixed(2) }; });
    await settle(4); await page.waitForTimeout(500);
    const later = await page.evaluate(() => { const n = window.__nlw, me = n.predicted; const near = n.habitationLife.state().fishNow.flatMap((s) => s.fish).map((f) => Math.hypot(f.x - me.x, f.z - me.z)).sort((a, b) => a - b); return { nearest: +near[0].toFixed(2) }; });
    check('E: wading toward them, the shoal darts away', !!before && !before.scared && scattered && later.nearest > 3, { before, scattered, after, later });
  }
}

// ---- F: birds ----
const birds = await page.evaluate(() => { const s = window.__nlw.habitationLife.state(); const ys = s.birdsNow.map((b) => b.y - window.__nlw.ground(b.x, b.z)); return { kinds: s.kindsSeen, n: s.birds, modes: [...new Set(s.birdsNow.map((b) => b.mode))], highest: Math.max(...ys), lowest: Math.min(...ys) }; });
check('F: at least ten kinds of bird, parrots among them, high over the habitation and low by the water, flying, sitting and wading', birds.kinds.length >= 10 && ['grey-parrot', 'senegal-parrot', 'parakeet'].every((k) => birds.kinds.includes(k)) && birds.modes.includes('rest') && (birds.modes.includes('fly') || birds.modes.includes('soar')) && birds.modes.includes('wade') && birds.highest > 30 && birds.lowest < 2, birds);
await atHab(2160, 118, 0.6);
await page.waitForFunction(() => { const h = window.__nlw.audio.status().habitat; return h.songs >= 2 && h.kinds.length >= 2; }, null, { timeout: 90000 }).catch(() => {});
const heard = await page.evaluate(() => window.__nlw.audio.status().habitat);
check('F: the birds are heard, each kind its own song', heard.songs >= 2 && heard.kinds.length >= 2, heard);
// and seen: flying over in front of whoever is looking (a flock now and then), and sitting about, in the picture
const birdsInView = (p = page) => p.evaluate(() => {
  const n = window.__nlw, cam = n.camera, v = new THREE.Vector3();
  cam.updateMatrixWorld();
  const shown = n.habitationLife.state().birdsNow.filter((b) => b.y > -100).filter((b) => { v.set(b.x, b.y, b.z); const d = v.distanceTo(cam.position); v.project(cam); return d < 140 && v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1; });
  return { inView: shown.length, flying: shown.filter((b) => b.mode === 'cross' || b.mode === 'fly' || b.mode === 'soar').length, kinds: [...new Set(shown.map((b) => b.kind))], crossings: n.habitationLife.state().crossings || 0 };
});
await page.evaluate(() => { const n = window.__nlw; n.cam.dist = 6; n.cam.pitch = -0.05; });
let birdView = { inView: 0, flying: 0 };
for (let i = 0; i < 100 && !(birdView.flying >= 3); i += 1) { await page.waitForTimeout(1500); birdView = await birdsInView(); }
await shot('birds-over-the-lagoon');
check('F: birds are seen flying over, in front of whoever is looking', birdView.flying >= 3, birdView);

// ---- G: the big waterfall heard, louder near it ----
await atHab(2446, 216, 1.6);
await page.waitForFunction(() => { const h = window.__nlw.audio.status().habitat; return h.falls.includes('big') && h.fallsLevel.some((v) => v > 0.2); }, null, { timeout: 30000 }).catch(() => {});
const nearFall = await page.evaluate(() => window.__nlw.audio.status().habitat);
await atHab(2386, 236, 0);
await page.waitForTimeout(3000);
const furtherFall = await page.evaluate(() => window.__nlw.audio.status().habitat);
check('G: the big waterfall is heard from where it falls (its sound placed there: louder the nearer)', nearFall.falls.includes('big') && nearFall.fallsLevel.some((v) => v > 0.2), { nearFall, furtherFall });

// ---- K: the boiling river at the habitation's far end (21 October 2026) ----
// (on its bank by one of its signs, a few metres off the water, looking at it)
const hotSpot = (id) => {
  const sign = HOT_RIVER_SIGNS.find((q) => q.id === id);
  const n = hotRiverNear(sign.x, sign.z);
  // the nearest point of its middle, and the way from it toward the sign
  let best = null;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 90) { const d = n.d + 7.5; const x = sign.x + Math.sin(a) * d, z = sign.z + Math.cos(a) * d; const m = hotRiverNear(x, z); if (!best || m.d < best.m.d) best = { x, z, m }; }
  const ux = (sign.x - best.x) / Math.hypot(sign.x - best.x, sign.z - best.z), uz = (sign.z - best.z) / Math.hypot(sign.x - best.x, sign.z - best.z);
  const px = best.x + ux * 12, pz = best.z + uz * 12;
  // (on ground a walker stands on: not among a big tree's roots, further toward the sign if need be)
  let qx = px, qz = pz;
  for (let d = 0.5; d < 15 && !zoneWalkable(qx, qz, [], 0.45); d += 0.5) { qx = px + ux * d; qz = pz + uz * d; }
  return { sign, x: qx, z: qz, heading: Math.atan2(best.x - qx, best.z - qz) };
};
{
  const k = hotSpot('hot-west-2');
  await at(k.x, k.z, k.heading);
  await page.evaluate((yaw) => { const n = window.__nlw; n.cam.dist = 6; n.cam.pitch = 0.12; n.cam.yaw = yaw; }, openYaw(k.x, k.z, k.heading));
  await page.waitForFunction(() => window.__nlw.habitation.state().steam > 10, null, { timeout: 60000 }).catch(() => {});
  await page.waitForFunction(() => { const h = window.__nlw.audio.status().habitat; return h.boiling > 3 && h.pops > 0; }, null, { timeout: 60000 }).catch(() => {});
  await settle(4); await page.waitForTimeout(800);
  const here = await page.evaluate(() => { const n = window.__nlw, h = n.habitation.state(), a = n.audio.status().habitat; const signs = []; n.scene.traverse((o) => { if (o.name && o.name.startsWith('sign:hot-')) signs.push(o.name); }); return { steam: h.steam, hotSigns: h.hotSigns, signsInScene: signs.length, boiling: a.boiling, pops: a.pops, keys: n.controls.shown.map((b) => b.id), curtain: !!n.scene.getObjectByName('hot-steam-curtain') }; });
  await shot('the-boiling-river');
  check('K: at the habitation\'s far end the boiling river steams (puffs rising off it, and its vapour all along it) and its signs stand along it', here.steam > 10 && here.curtain && here.hotSigns >= 10 && here.signsInScene >= 10, here);
  check('K: its boiling is heard: a seethe, a hiss, and bubbles bursting', here.boiling > 3 && here.pops > 0, { boiling: here.boiling, pops: here.pops });
  check('K: on its bank no Swim is offered', !here.keys.includes('swim'), here.keys);
  // walked toward it: stopped at its edge, never in it; and still no Swim
  const s = await walkUntilStopped(30000);
  const f = habitationFooting(s.x, s.z), keys = await page.evaluate(() => window.__nlw.controls.shown.map((b) => b.id));
  check('K: walking on toward it, the walker is stopped at its edge: never in it, and no Swim is offered there', f && f.walk && f.kind !== 'hot' && hotRiverNear(s.x, s.z).d > 0 && !keys.includes('swim'), { at: [+s.x.toFixed(1), +s.z.toFixed(1)], footing: f && f.kind, fromWater: +hotRiverNear(s.x, s.z).d.toFixed(2), keys });
  await page.evaluate(() => { const n = window.__nlw; n.cam.dist = 7; n.cam.pitch = 0.2; n.cam.yaw += 0.6; });
  await settle(3); await page.waitForTimeout(500);
  await shot('at-the-boiling-river-edge');
  // a warning sign close to, read from the habitation's side
  const w = hotSpot('hot-north-2');
  await at(w.sign.x - Math.sin(w.sign.facing) * -6, w.sign.z - Math.cos(w.sign.facing) * -6, w.sign.facing + Math.PI);
  await page.evaluate(() => { const n = window.__nlw; n.cam.dist = 3.5; n.cam.pitch = 0.05; });
  await settle(4); await page.waitForTimeout(800);
  await shot('a-boiling-river-sign');
}

// ---- H: night, the moon and the stars, the torch; the other player sees its beam ----
// (while the second player comes into the town, the first looks down at its feet: this machine draws both pages, and
// the first's view of the habitation takes it a second or more a frame)
await page.evaluate(() => { const n = window.__nlw; n.cam.pitch = 1.3; n.cam.dist = 3; });
const B = await player('B', { lite: true });
const pageB = B.page;
await page.evaluate(() => { const n = window.__nlw; n.skip(0); });
const dayFile = await (async () => { await atHab(1934, 18, 0.9); await page.evaluate(() => { const n = window.__nlw; n.cam.dist = 6.5; n.cam.pitch = 0.12; }); await settle(4); await page.waitForTimeout(800); return shot('hill-by-day'); })();
// (to eleven at night, and a clear night: the hours skipped can have brought cloud, and a cloudy night hides the stars,
// as it should)
for (const p of [page, pageB]) await p.evaluate(() => { const n = window.__nlw, g = n.host.game; const hour = n.view.clock.hourFloat; n.skip((24 + 23 - hour) % 24); g.state.weather = { kind: 'clear', until: g.state.t + 8 * 3600 }; });
// (the stars come out over a few seconds of the town's time, frame by frame: waited for, at most a minute)
await page.waitForFunction(() => { const s = window.__nlw.sky.state(); return s.stars > 0.8 && s.faint > 0.5; }, null, { timeout: 60000 }).catch(() => {});
await settle(4); await page.waitForTimeout(800);
const nightFile = await shot('hill-at-night');
const sky = await page.evaluate(() => ({ night: window.__nlw.night, ...window.__nlw.sky.state() }));
const lum = { day: brightness(dayFile), night: brightness(nightFile) };
check('H: the habitation\'s night is dark, the moon and the stars out', sky.night > 0.9 && sky.moon && sky.stars > 0.8 && sky.faint > 0.5 && lum.night < lum.day * 0.25 && lum.night < 40, { sky, lum });
await page.waitForFunction((c0) => window.__nlw.audio.status().habitat.crickets > c0 + 3, (await page.evaluate(() => window.__nlw.audio.status().habitat.crickets)), { timeout: 60000 }).catch(() => {});
const nightSounds = await page.evaluate(() => window.__nlw.audio.status().habitat);
check('G: at night, crickets all round', nightSounds.crickets > 3, nightSounds);
// the torch: on from the phone, the light from the back of the handset, ahead and down, a soft cone
const darkFile = await shot('night-no-torch');
await page.evaluate(() => window.__nlw.ui.openPhone());
await page.waitForSelector('#sheet .app[data-app="torch"]', { timeout: 30000 });
await page.click('#sheet .app[data-app="torch"]');
await page.waitForTimeout(300);
const tile = await page.evaluate(() => { const b = document.querySelector('#sheet .app[data-app="torch"]'); return { on: b.classList.contains('on'), label: b.getAttribute('aria-label') }; });
await page.evaluate(() => window.__nlw.ui.close());
await page.waitForFunction(() => window.__nlw.torch.lit, null, { timeout: 60000 }).catch(() => {});
await settle(3); await page.waitForTimeout(600);
const lamp = await page.evaluate(() => { const n = window.__nlw, h = n.headlight, me = n.me.group.position, t = n.torch.self; return { lit: n.torch.lit, intensity: h.intensity, angle: +h.angle.toFixed(2), penumbra: h.penumbra, distance: h.distance, from: [+(h.position.x - me.x).toFixed(2), +(h.position.y - me.y).toFixed(2), +(h.position.z - me.z).toFixed(2)], dir: [+t.dir.x.toFixed(2), +t.dir.y.toFixed(2), +t.dir.z.toFixed(2)], heading: +n.predicted.heading.toFixed(2), phoneOut: +n.phoneHold.out.toFixed(2) }; });
const litFile = await shot('night-torch-on');
const ahead = { off: brightness(darkFile, [0.3, 0.55, 0.7, 0.95]), on: brightness(litFile, [0.3, 0.55, 0.7, 0.95]) };
const forward = lamp.dir[0] * Math.sin(lamp.heading) + lamp.dir[2] * Math.cos(lamp.heading);
check('H: Torch on the phone: its tile lit; the light from the back of the phone in the hand, a soft cone ahead and down that brightens the ground in front', tile.on && /Torch, on/.test(tile.label) && lamp.lit && lamp.intensity > 2 && lamp.penumbra > 0.6 && lamp.from[1] > 0.8 && lamp.from[1] < 1.8 && Math.hypot(lamp.from[0], lamp.from[2]) < 1 && forward > 0.6 && lamp.dir[1] < -0.1 && lamp.phoneOut > 0.85 && ahead.on > ahead.off * 1.3, { tile, lamp, ahead });
// the other player, near, sees the beam
await pageB.evaluate((x) => { const n = window.__nlw; n.place(x, 22); n.face(Math.PI); n.cam.yaw = Math.PI + 0.6; n.cam.dist = 8; }, 1938 + S);
await page.evaluate((x) => { const n = window.__nlw; n.place(x, 18); n.face(0.9); }, 1934 + S);
const seen = await pageB.waitForFunction(() => { const n = window.__nlw; return n.shownPeers.some((q) => q.torch === 1) && n.torchBeams.shown > 0; }, null, { timeout: 90000 }).then(() => true, () => false);
await pageB.waitForTimeout(1500);
const watcher = await pageB.evaluate(() => { const n = window.__nlw; return { peers: n.shownPeers.map((q) => ({ phone: q.phone, torch: q.torch })), beams: n.torchBeams.shown, lite: n.lite }; });
await shot('the-other-sees-the-beam', pageB);
check('H: the other player (on a phone) sees the torch\'s beam', seen && watcher.beams >= 1, watcher);
// off again
await page.evaluate(() => window.__nlw.ui.openPhone());
await page.waitForSelector('#sheet .app[data-app="torch"]', { timeout: 30000 });
await page.click('#sheet .app[data-app="torch"]');
await page.evaluate(() => window.__nlw.ui.close());
await page.waitForTimeout(1500);
const offAgain = await page.evaluate(() => ({ lit: window.__nlw.torch.lit, intensity: window.__nlw.headlight.intensity }));
check('H: Torch off again: the light goes out', !offAgain.lit && offAgain.intensity === 0, offAgain);
// frogs by the water at night: on the swamp's boardwalk
await atHab(2031, -40, Math.PI * 0.8);
const frogs0 = await page.evaluate(() => window.__nlw.audio.status().habitat.frogs);
await page.waitForFunction((f0) => window.__nlw.audio.status().habitat.frogs > f0 + 1, frogs0, { timeout: 90000 }).catch(() => {});
const swampNight = await page.evaluate(() => window.__nlw.audio.status().habitat);
check('G: at night, frogs calling by the water (the swamp)', swampNight.frogs > frogs0 + 1, { before: frogs0, after: swampNight.frogs, crickets: swampNight.crickets });

// ---- D (a phone): the second player's costs, by day ----
await pageB.evaluate(() => { const n = window.__nlw; const hour = n.view.clock.hourFloat; n.skip((24 + 11 - hour) % 24); });
await pageB.waitForFunction(() => { const h = window.__nlw.habitation.state(); return h.built && h.models >= h.of; }, null, { timeout: 600000 }).catch(() => {});
const habB = await pageB.evaluate(() => window.__nlw.habitation.state());
measures.phone = { buildMs: habB.buildMs, modelsMs: habB.modelsMs, modelBytes: habB.modelBytes, places: {} };
await settle(8, pageB);
for (const name of ['gate', 'hill', 'forest', 'lagoon', 'garden', 'bigfall']) {
  const v = VIEWS[name];
  await pageB.evaluate(([x, z, h]) => { const n = window.__nlw; n.place(x, z); n.face(h); n.cam.yaw = h; n.cam.dist = 6.5; n.cam.pitch = 0.12; }, [v.eye[0], v.eye[1], v.look]);
  await settle(6, pageB); await pageB.waitForTimeout(800);
  measures.phone.places[name] = await cost(pageB);
  // (at the gate, the town's towers more than 160 m off are drawn from their pictures at 512 on a phone, while the
  // habitation is drawn: the two together fit the phone's budget)
  if (name === 'gate') {
    await pageB.waitForFunction(() => { const tb = window.__nlw.townBuildings.state(); return tb.thin && tb.models.filter((m) => m.state === 'ready' && m.size === 512).length >= 5; }, null, { timeout: 300000 }).catch(() => {});
    const thinB = await pageB.evaluate(() => { const tb = window.__nlw.townBuildings.state(); return { thin: tb.thin, sizes: tb.models.filter((m) => m.size).map((m) => `${m.id}:${m.size}`) }; });
    measures.phone.places.gate = await cost(pageB);
    measures.phone.thinTowers = thinB;
    check('D: on a phone at the gate, the town\'s far towers are drawn from their smaller pictures while the habitation is drawn', thinB.thin && thinB.sizes.filter((t) => /:512$/.test(t)).length >= 5, thinB);
  }
  await shot(`phone-${name}`, pageB);
}
// (by the big waterfall, the town's towers, over 650 m off and hidden by the haze, are let go: a phone needs the room)
await pageB.waitForFunction(() => { const tb = window.__nlw.townBuildings, ids = new Set(tb.entries.filter((e) => e.kind === 'tower').map((e) => e.model)); return tb.state().models.filter((m) => ids.has(m.id)).every((m) => m.state === 'idle'); }, null, { timeout: 90000 }).catch(() => {});
const towersB = await pageB.evaluate(() => { const tb = window.__nlw.townBuildings, ids = new Set(tb.entries.filter((e) => e.kind === 'tower').map((e) => e.model)); return tb.state().models.filter((m) => ids.has(m.id)).map((m) => `${m.id}:${m.state}:${m.released}`); });
measures.phone.townTowers = towersB;
check('D: deep in the habitation the town\'s towers (over 650 m off, hidden by the haze) are not held', towersB.length > 0 && towersB.every((t) => /:idle:/.test(t)), towersB);
// (and on the phone, by the boiling river and under the birds: after the towers, as the birds' place is nearer the town)
{
  const k = hotSpot('hot-north-2');
  await pageB.evaluate(([x, z, h, yaw]) => { const n = window.__nlw; n.place(x, z); n.face(h); n.cam.yaw = yaw; n.cam.dist = 6.5; n.cam.pitch = 0.12; }, [k.x, k.z, k.heading, openYaw(k.x, k.z, k.heading, 6.5)]);
  await pageB.waitForFunction(() => window.__nlw.habitation.state().steam > 5, null, { timeout: 60000 }).catch(() => {});
  await settle(6, pageB); await pageB.waitForTimeout(800);
  measures.phone.places.boiling = await cost(pageB);
  const hot = await pageB.evaluate(() => ({ steam: window.__nlw.habitation.state().steam, keys: window.__nlw.controls.shown.map((b) => b.id) }));
  await shot('phone-boiling-river', pageB);
  check('K: on a phone too the boiling river steams, and no Swim is offered on its bank', hot.steam > 5 && !hot.keys.includes('swim'), hot);
  // and birds over the phone player's view
  let seenB = { flying: 0 };
  await pageB.evaluate((x) => { const n = window.__nlw; n.place(x, 118); n.face(0.6); n.cam.yaw = 0.6; n.cam.pitch = -0.05; }, 2160 + S);
  for (let i = 0; i < 100 && !(seenB.flying >= 3); i += 1) { await pageB.waitForTimeout(1500); seenB = await birdsInView(pageB); }
  await shot('phone-birds', pageB);
  check('F: on a phone too, birds are seen flying over', seenB.flying >= 3, seenB);
}

const phoneWorst = Object.entries(measures.phone.places).sort((a, b) => b[1].gpuMB - a[1].gpuMB)[0];
check('D: on a phone (#lite), what is drawn stays within what a mid-range phone draws: under 260 draw calls and 900,000 triangles, and under the phone\'s budget of 150 MB on the graphics card (budget.js)', Object.values(measures.phone.places).every((c) => c.calls < 260 && c.triangles < 9e5 && c.gpuMB < 150), { phoneWorst, calls: Object.fromEntries(Object.entries(measures.phone.places).map(([k, v]) => [k, v.calls])), modelBytes: habB.modelBytes });

// ---- L: the owner's brief of 22 October 2026 (four screen recordings) ----
// L1 feet on the ground as drawn, never in it: on a phone, on the sandy bank of the lagoon's west beach where the owner's
// walker was drawn sunk into it; the phone's ground the same triangles as the walker's (its coarser one only from afar)
{
  const where = (p) => p.evaluate(() => {
    const n = window.__nlw, me = n.me, v = new n.THREE.Vector3();
    let low = Infinity;
    for (const b of ['foot_l', 'foot_r', 'ball_l', 'ball_r']) { const bone = me.bones && me.bones.get(b); if (bone) { bone.getWorldPosition(v); low = Math.min(low, v.y); } }
    const h = n.habitation.state(), c = n.camera.position;
    return { x: n.predicted.x, z: n.predicted.z, y: me.group.position.y, low, every: h.groundEvery, cam: [c.x, c.y, c.z] };
  });
  // (the town's east end first: from there a phone draws the habitation's ground from every other point)
  await pageB.evaluate(() => { const n = window.__nlw; n.place(200, 113); n.face(Math.PI / 2); });
  await settle(4, pageB);
  const far = await pageB.evaluate(() => window.__nlw.habitation.state().groundEvery);
  await pageB.evaluate(([x, z]) => { const n = window.__nlw; n.place(x, z); n.face(0.3); n.cam.yaw = 0.3; n.cam.dist = 4.5; n.cam.pitch = 0.1; }, [2232 + S, 116]);
  await settle(6, pageB); await pageB.waitForTimeout(800);
  const near = await where(pageB);
  // the mesh drawn: its points where the simulation's ground is (a sample of them)
  const points = await pageB.evaluate(() => { const g = window.__nlw.scene.getObjectByName('habitation-ground'), out = []; if (g) g.traverse((o) => { if (o.isMesh) { const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i += 1777) out.push([p.getX(i), p.getY(i), p.getZ(i)]); } }); return out; });
  const off = Math.max(...points.map(([x, y, z]) => Math.abs(habitationGroundAt(x, z) - y)));
  // walked along the bank and down to the water and back, a sample every step
  const samples = [];
  for (const h of [1.2, -0.4, 2.6]) {
    await pageB.evaluate((h) => { const n = window.__nlw; n.face(h); n.cam.yaw = h; }, h);
    await pageB.keyboard.down('w');
    for (let i = 0; i < 8; i += 1) { await pageB.waitForTimeout(500); samples.push(await where(pageB)); }
    await pageB.keyboard.up('w');
  }
  const on = samples.filter((q) => { const f = habitationFooting(q.x, q.z); return f && f.walk && !f.deck && f.kind !== 'shallows'; });
  const sunk = on.filter((q) => q.low < habitationGroundAt(q.x, q.z) - 0.05 || Math.abs(q.y - habitationGroundAt(q.x, q.z)) > 0.02);
  const camUnder = samples.filter((q) => q.cam[1] < habitationGroundAt(q.cam[0], q.cam[2]) + 0.15);
  await pageB.evaluate(() => { const n = window.__nlw; n.cam.dist = 4.5; n.cam.pitch = 0.08; });
  await settle(4, pageB); await pageB.waitForTimeout(600);
  await shot('phone-feet-on-the-sandy-bank', pageB);
  check('L: on a phone the habitation\'s ground is drawn from the walker\'s own triangles (every point near it, every other one only from the town\'s east end)', far === 2 && near.every === 1 && points.length > 30 && off < 0.002, { far, near: near.every, points: points.length, off: +off.toFixed(4) });
  check('L: on the sandy bank of the lagoon\'s beach the walker\'s feet are on the ground drawn, never in it, and the eye never under it', on.length >= 10 && sunk.length === 0 && camUnder.length === 0 && near.low >= habitationGroundAt(near.x, near.z) - 0.05, { walked: samples.length, onGround: on.length, sunk: sunk.length, camUnder: camUnder.length, feet: +(near.low - habitationGroundAt(near.x, near.z)).toFixed(3) });
}
// L2 in the shallows the legs are seen through the water, faintly; walked on out, deep water stops the walker and says why;
// the big sign at the beach
{
  const x = 2180 + S;
  await at(x, 121, 0);
  await page.evaluate(() => { const n = window.__nlw; n.cam.dist = 4; n.cam.pitch = 0.12; });
  const s = await walkUntilStopped(40000);
  const f = habitationFooting(s.x, s.z), ahead = habitationFooting(s.x, s.z + 0.8);
  const note = await page.evaluate(() => document.getElementById('notices').textContent);
  check('L: walking out from the lagoon\'s beach the shallows are waded, and where it gets too deep the walker is stopped and told: "Swimming in the swamps is not advisable"', f && f.kind === 'shallows' && ahead && ahead.kind === 'water' && /not advisable/.test(note), { at: [+s.x.toFixed(1), +s.z.toFixed(1)], footing: f && f.kind, ahead: ahead && ahead.kind, depth: f && f.y !== undefined ? +(habitationWaterAt(s.x, s.z).level - f.y).toFixed(2) : null, note });
  await page.evaluate(() => { const n = window.__nlw; n.cam.dist = 3.2; n.cam.pitch = 0.05; n.cam.yaw = Math.PI * 0.75; });
  await settle(4); await page.waitForTimeout(600);
  await shot('legs-in-the-shallows');
  const sign = HABITATION_SWIM_SIGNS.find((q) => q.id === 'swim-lagoon-west-1');
  await at(sign.x + Math.sin(sign.facing) * 9, sign.z + Math.cos(sign.facing) * 9, sign.facing + Math.PI);
  await page.evaluate(() => { const n = window.__nlw; n.cam.dist = 3; n.cam.pitch = 0.06; });
  await settle(4); await page.waitForTimeout(800);
  const signs = await page.evaluate(() => window.__nlw.habitation.state().swimSigns);
  await shot('swimming-is-not-advisable');
  check('L: big signs stand where one wades in and it soon gets deep, saying swimming in the swamps is not advisable', signs === HABITATION_SWIM_SIGNS.length && signs >= 10, { signs });
}
// L3 a bridge's rails and posts stand in the way: from the middle of the gorge's bridge, walked at its side; and from
// the bank beside it, walked at it
{
  const d = HABITATION_DECKS.find((q) => q.id === 'gorge-bridge');
  const a = d.line[0], b = d.line[d.line.length - 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
  const mid = [a[0] + ux * L * 0.45, a[1] + uz * L * 0.45], side = Math.atan2(-uz, ux);
  await at(mid[0], mid[1], side);
  await page.evaluate(() => { const n = window.__nlw; n.cam.dist = 4.5; n.cam.pitch = 0.2; });
  const s = await walkUntilStopped(25000);
  const fromLine = Math.abs(-(s.x - a[0]) * uz + (s.z - a[1]) * ux);
  const post = Math.min(...HABITATION_DECK_POSTS.filter((p) => p.deck === d.id).map((p) => Math.hypot(p.x - s.x, p.z - s.z)));
  await page.evaluate((yaw) => { const n = window.__nlw; n.cam.yaw = yaw; n.cam.dist = 3.5; n.cam.pitch = 0.15; }, side + 2.4);
  await settle(4); await page.waitForTimeout(600);
  await shot('stopped-by-a-bridges-rail');
  check('L: on a bridge, walked at its side, the walker is stopped short of its rail and posts, half a metre in from its edge', fromLine <= d.width / 2 - 0.45 && fromLine > 0.3 && post > 0.4, { fromLine: +fromLine.toFixed(2), halfWidth: d.width / 2, nearestPost: +post.toFixed(2) });
  // from the bank beside it (the forest at its east end, a few metres to its side), walked at it
  let start = null;
  for (let k = 3.5; k < 9 && !start; k += 0.5) for (const sgn of [1, -1]) { const along = L - 2.5, x = a[0] + ux * along - uz * sgn * k, z = a[1] + uz * along + ux * sgn * k; if (zoneWalkable(x, z, [], 0.4) && !habitationDeckAt(x, z)) { start = { x, z, heading: Math.atan2(uz * sgn, -ux * sgn) }; break; } }
  if (!start) check('L: somewhere to stand beside the gorge\'s bridge', false);
  else {
    await at(start.x, start.z, start.heading);
    const t = await walkUntilStopped(25000);
    const gap = Math.abs(-(t.x - a[0]) * uz + (t.z - a[1]) * ux), deck = habitationDeckAt(t.x, t.z);
    check('L: walked at a bridge from beside it, the walker is stopped outside its rails: onto it only past its ends', !deck && gap >= d.width / 2 + 0.45, { gap: +gap.toFixed(2), onIt: !!deck });
  }
}
// L4 the big waterfall's wooden stairs: seen going down from the cliff's top in their cutting, walked down end to end
// on their boards (never through the ground, the eye never under it), and back up with the figure's own climb
{
  const st = HABITATION_DECKS.find((q) => q.id === 'falls-stairs');
  // (as a player steers down a flight that turns: toward its next corner, and on to the one after once there)
  const steer = (to) => page.evaluate(([x, z]) => { const n = window.__nlw, p = n.predicted; n.cam.yaw = Math.atan2(x - p.x, z - p.z); return Math.hypot(x - p.x, z - p.z); }, to);
  const walkAlong = async (dir) => {
    const got = [], end = st.line[dir > 0 ? st.line.length - 1 : 0];
    let next = dir > 0 ? 1 : st.line.length - 2;
    await page.keyboard.down('w');
    for (let i = 0; i < 200; i += 1) {
      const gap = await steer(st.line[next]);
      if (gap < 1.2 && next !== (dir > 0 ? st.line.length - 1 : 0)) { next += dir; await steer(st.line[next]); }
      await page.waitForTimeout(500);
      const q = await page.evaluate(() => { const n = window.__nlw, c = n.camera.position; return { x: n.predicted.x, z: n.predicted.z, y: n.me.group.position.y, cam: [c.x, c.y, c.z], clip: n.me.current ? n.me.current.getClip().name : null, climbing: !!n.me.climbing, stairs: n.me.spec ? n.me.spec.stairs : null }; });
      got.push(q);
      if (Math.hypot(q.x - end[0], q.z - end[1]) < 1.3) break;
    }
    await page.keyboard.up('w');
    return got;
  };
  const [ax, az] = st.line[0], [bx, bz] = st.line[1], l0 = Math.hypot(bx - ax, bz - az);
  await at(ax - ((bx - ax) / l0) * 1.5, az - ((bz - az) / l0) * 1.5, Math.atan2(bx - ax, bz - az));
  await page.evaluate(() => { const n = window.__nlw; n.cam.dist = 6; n.cam.pitch = 0.42; });
  await settle(4); await page.waitForTimeout(800);
  await shot('the-waterfall-stairs-from-the-top');
  const down = await walkAlong(1);
  const onBoards = down.filter((q) => habitationDeckAt(q.x, q.z));
  const off = onBoards.filter((q) => Math.abs(q.y - habitationDeckAt(q.x, q.z).y) > 0.05);
  const under = down.filter((q) => q.cam[1] < habitationGroundAt(q.cam[0], q.cam[2]) + 0.15 || q.y < habitationGroundAt(q.x, q.z) - 0.02);
  const last = down[down.length - 1], bottom = st.line[st.line.length - 1];
  check('L: the big waterfall\'s stairs are walked down from the cliff\'s top to the pool, on their boards all the way (never through the ground, the eye never under it)', Math.hypot(last.x - bottom[0], last.z - bottom[1]) < 1.5 && onBoards.length > 10 && off.length === 0 && under.length === 0, { steps: down.length, onBoards: onBoards.length, off: off.length, under: under.length, end: [+last.x.toFixed(1), +last.z.toFixed(1), +last.y.toFixed(2)] });
  await page.evaluate((yaw) => { const n = window.__nlw; n.cam.yaw = yaw; n.cam.dist = 9; n.cam.pitch = 0.3; }, Math.atan2(ax - bottom[0], az - bottom[1]));
  await settle(4); await page.waitForTimeout(800);
  await shot('the-waterfall-stairs-from-the-pool');
  const upAgain = await walkAlong(-1);
  const climbing = upAgain.filter((q) => q.climbing && q.clip === q.stairs);
  check('L: walking back up the stairs the figure climbs them with its own climb up stairs (its own where its file has one, borrowed where not)', climbing.length >= 3 && Math.hypot(upAgain[upAgain.length - 1].x - ax, upAgain[upAgain.length - 1].z - az) < 1.5, { steps: upAgain.length, climbing: climbing.length, clip: upAgain.map((q) => q.clip).find((c) => c && c !== 'walk.001') });
}
// L5 a jump: Space (a button on a phone), the figure's own leap, the body off the ground and down again; seen by the other
// player, near
{
  await atHab(2170, 119, 0.3);
  await pageB.evaluate(([x, z]) => { const n = window.__nlw; n.place(x, z); n.face(Math.PI); n.cam.yaw = Math.PI + 0.3; n.cam.dist = 7; n.cam.pitch = 0.12; }, [2172 + S, 123]);
  await page.evaluate(() => { const n = window.__nlw; n.cam.dist = 4.5; n.cam.pitch = 0.1; n.cam.yaw = 1.8; });
  await settle(4); await settle(4, pageB);
  const buttons = await page.evaluate(() => window.__nlw.controls.shown.map((b) => b.id));
  const buttonsB = await pageB.evaluate(() => window.__nlw.controls.shown.map((b) => b.id));
  const idA = await page.evaluate(() => window.__nlw.playerId);
  for (const p of [page, pageB]) await p.evaluate(() => window.__nlw.slow(0.08));
  await page.keyboard.press('Space');
  const lifts = [], seenB = [];
  for (let i = 0; i < 60; i += 1) {
    await page.waitForTimeout(600);
    const l = await page.evaluate(() => { const n = window.__nlw; return { lift: n.me.jumpLift, jumping: !!n.me.jumping, t: n.me.current ? n.me.current.time : 0, clip: n.me.current ? n.me.current.getClip().name : null, jump: n.me.spec ? n.me.spec.jump : null }; });
    lifts.push(l);
    const b = await pageB.evaluate((id) => { const r = window.__nlw.crowd.rigOf(`p:${id}`); return r ? { lift: r.jumpLift || 0, jumping: !!r.jumping } : null; }, idA);
    if (b) seenB.push(b);
    if (l.jumping && l.lift > 0.3 && !lifts.some((q) => q.shot)) { l.shot = true; await shot('a-jump'); await shot('a-jump-seen-by-the-other', pageB); }
    if (!l.jumping && i > 2) break;
  }
  for (const p of [page, pageB]) await p.evaluate(() => window.__nlw.slow(1));
  const top = Math.max(...lifts.map((q) => q.lift)), lowest = Math.min(...lifts.map((q) => q.lift));
  check('L: Space jumps (and on a phone a Jump button): the figure\'s own leap, the body lifted off the ground in an arc and down again', buttons.includes('jump') && buttonsB.includes('jump') && lifts.some((q) => q.jumping && q.clip === q.jump) && top > 0.3 && lowest < -0.1 && !lifts[lifts.length - 1].jumping, { buttons, buttonsB, top: +top.toFixed(2), crouch: +lowest.toFixed(2), clip: lifts.map((q) => q.clip).find((c) => c && /jump|leap/.test(c)), samples: lifts.length });
  check('L: the other player sees the jump', seenB.some((q) => q.jumping) && Math.max(...seenB.map((q) => q.lift)) > 0.2, { seen: seenB.filter((q) => q.jumping).length, top: seenB.length ? +Math.max(...seenB.map((q) => q.lift)).toFixed(2) : null });
}

// ---- back across the town: the habitation, and the road's end and its car park, let go ----
await at(-230, 113, -Math.PI / 2);
const gone = await page.waitForFunction(() => { const h = window.__nlw.habitation.state(); return !h.built && !h.upriver; }, null, { timeout: 30000 }).then(() => true, () => false);
const left = await page.evaluate(() => { const n = window.__nlw, h = n.habitation.state(); let named = 0; n.scene.traverse((o) => { if (o.name === 'habitation-near' || o.name === 'upriver') named += 1; }); return { built: h.built, upriver: h.upriver, letGo: h.letGo, inScene: named, calls: n.drawn.calls }; });
check('back in the town, the habitation and the road beyond the town are let go: nothing of them left drawn or held', gone && !left.built && !left.upriver && left.inScene === 0 && left.letGo >= 1, left);
// and the town's towers, not held up at the habitation, drawn from their models again (fetched as the player comes
// back; that one held is let go up there and fetched again is test/town-buildings.mjs's)
const towersBack = await page.waitForFunction(() => { const tb = window.__nlw.townBuildings, ids = new Set(tb.entries.filter((e) => e.kind === 'tower').map((e) => e.model)); return tb.state().models.filter((m) => ids.has(m.id)).every((m) => m.state === 'ready'); }, null, { timeout: 600000 }).then(() => true, () => false);
const towersA = await page.evaluate(() => { const tb = window.__nlw.townBuildings, ids = new Set(tb.entries.filter((e) => e.kind === 'tower').map((e) => e.model)); return tb.state().models.filter((m) => ids.has(m.id)).map((m) => `${m.id}:${m.state}:${m.released}`); });
check('back in the town, its towers are drawn from their models', towersBack, towersA);

writeFileSync(resolve(out, 'measures.json'), `${JSON.stringify(measures, null, 1)}\n`);
console.log('measures', JSON.stringify(measures));
const failed = results.filter((ok) => !ok).length;
console.log(failed ? `${failed} of ${results.length} checks failed` : `All ${results.length} checks passed.`);
await browser.close(); server.close();
process.exit(failed ? 1 : 0);
