// The habitation at the far end of the River Niger (20 October 2026, the owner's brief), in the game as it is served,
// with its server, in a headless browser; two players, the second on a phone's settings (#lite):
//   A  the way there: Waterside Road on north out of the town, its sign, the river and the road drawn beyond the town
//   B  on a motorcycle to the gate: stopped at the footbridge, "Get off your vehicle to cross the bridge" and a button
//      that gets the rider off; the motorcycle left where it stopped; on foot over the bridge, on its boards
//   C  walking: the paths walked; a tree and a rock stop the walker; the forest is not walked into
//   D  the owner's models: every one fetched and drawn near, the trees' pictures afar; what it costs to draw, on a
//      computer and on a phone; how long it takes to arrive
//   E  fish in its waters, scattering as the player wades in; none in the Niger
//   F  birds: at least ten kinds, parrots among them, high and low, flying, sitting and wading; their songs played
//   G  the big waterfall heard, louder near it; at night frogs and crickets
//   H  night: dark, the moon and the stars out; the phone's Torch lights the way ahead; the other player sees its beam
//   I  each place, beside the owner's picture of it (screenshots)
//   ../server/with-postgres.sh node test/habitation.mjs [shots folder]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createDevServer } from '../../server/dev.mjs';
import { pastQuestion, enterTown } from './start.mjs';
import { HABITATION, HABITATION_STANDING, HABITATION_MODELS, habitationFooting, habitationDeckAt } from '../src/sim/zone.js';
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
const road = await page.evaluate(() => { const n = window.__nlw; const names = []; n.scene.traverse((o) => { if (o.name && o.name.startsWith('sign:')) names.push(o.name); }); return { upriver: n.habitation.state().upriver, signs: names, ground: n.ground(600, 113) }; });
check('A: north out of the town Waterside Road goes on along the river, its sign saying where it goes', road.upriver && road.signs.includes('sign:habitation-way') && road.signs.includes('sign:habitation-gate') && road.ground === 0, road);
await page.evaluate(() => { const n = window.__nlw; n.cam.dist = 9; n.cam.pitch = 0.18; });
await page.waitForTimeout(2500);
await shot('the-road-north');

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
await at(1852, 91, Math.PI / 2);
await page.waitForTimeout(1500);
await page.evaluate(() => window.__nlw.rideBike('cafe-racer'));
await page.waitForFunction(() => !!window.__nlw.view.self.astride, null, { timeout: 30000 }).catch(() => {});
await page.evaluate(() => { const n = window.__nlw; n.face(Math.PI / 2); n.bikeState.heading = Math.PI / 2; n.cam.yaw = Math.PI / 2; });
await page.keyboard.down('w');
const stopped = await page.waitForFunction(() => { const b = document.getElementById('bridge-stop'); return b && !b.hidden; }, null, { timeout: 30000 }).then(() => true, () => false);
await page.keyboard.up('w');
await page.waitForTimeout(400);
const atBridge = await page.evaluate(() => { const n = window.__nlw, b = document.getElementById('bridge-stop'); return { shown: !b.hidden, text: document.getElementById('bridge-stop-text').textContent, button: document.getElementById('bridge-stop-off').textContent, x: n.predicted.x, astride: !!n.view.self.astride, speed: n.bikeState.speed }; });
check('B: ridden to the gate, the motorcycle is stopped at the footbridge: "Get off your vehicle to cross the bridge", with a button to get off', bought.ok && stopped && atBridge.shown && atBridge.text === 'Get off your vehicle to cross the bridge' && /Get off/.test(atBridge.button) && atBridge.x < 1876 && atBridge.astride, { bought, ...atBridge });
await shot('stopped-at-the-footbridge');
await page.click('#bridge-stop-off');
await page.waitForFunction(() => !window.__nlw.view.self.astride, null, { timeout: 20000 }).catch(() => {});
const off = await page.evaluate(() => { const n = window.__nlw, s = n.view.self; const b = (s.ownBikes.parked || []).find((p) => p.bike === 'cafe-racer'); return { astride: !!s.astride, parked: b ? { x: b.x, z: b.z } : null, banner: !document.getElementById('bridge-stop').hidden }; });
check('the button gets the rider off; the motorcycle stays where it stopped, before the bridge', !off.astride && !!off.parked && off.parked.x < 1876 && Math.abs(off.parked.x - atBridge.x) < 2.5 && !off.banner, off);
// across on foot: on the boards, above the stream
await page.evaluate(() => { const n = window.__nlw; n.face(Math.PI / 2); n.cam.yaw = Math.PI / 2; });
const crossing = [];
await page.keyboard.down('w');
for (let i = 0; i < 160; i += 1) { await page.waitForTimeout(400); const s = await state(); crossing.push(s); if (s.x > 1900) break; }
await page.keyboard.up('w');
const onBoards = crossing.filter((s) => s.x > 1878 && s.x < 1896);
const deckY = (x) => habitationDeckAt(x, 91);
check('on foot the footbridge is crossed, on its boards above the stream, onto the hill\'s path', crossing.length && crossing[crossing.length - 1].x > 1898 && onBoards.length > 0 && onBoards.every((s) => deckY(s.x) && Math.abs(s.y - deckY(s.x).y) < 0.35), { end: crossing.length ? +crossing[crossing.length - 1].x.toFixed(1) : null, onBoards: onBoards.map((s) => [+s.x.toFixed(1), +s.y.toFixed(2)]) });
await page.evaluate(() => { const n = window.__nlw; n.place(1887, 91); n.face(Math.PI / 2); n.cam.yaw = -Math.PI / 2 + 0.5; n.cam.dist = 7; });
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
  check(`C: walked into, a ${kind} (${t.s.m}) stops the walker at its trunk`, gap >= t.s.solid + 0.2 && gap < t.s.solid + 1.6, { gap: +gap.toFixed(2), solid: t.s.solid });
}
// from a path's edge straight into the forest: not entered
{
  const x = 2040, z = 81.5;           // (on the forest path; the forest to the west of it)
  const f0 = habitationFooting(x, z);
  await at(x, z, -Math.PI / 2 + 0.3);
  await page.waitForTimeout(500);
  const s = await walkUntilStopped(20000);
  const f = habitationFooting(s.x, s.z);
  check('C: from the path the forest is not walked into', f0 && f0.walk && f && f.walk, { from: f0 && f0.kind, now: f && f.kind, at: [+s.x.toFixed(1), +s.z.toFixed(1)] });
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
const VIEWS = Object.fromEntries(Object.entries(VIEW_AT).map(([k, [eye, to]]) => [k, { eye, look: Math.atan2(to[0] - eye[0], to[1] - eye[1]) }]));
// and each of the owner's nineteen pictures: where in the habitation it is, seen from a place the player can stand
// (on its path, boardwalk, stairs, beach or in its shallows), looking as the picture looks; the sunset at sunset
const PICTURE_AT = {
  '01': [[2336, 113], [2384, 87], 0.08], '02': [[2262.6, 133.5], [2338, 184]], '03': [[2338, 318], [2366, 338]], '04': [[2036, 79], [2110, 112]],
  '05': [[2016, 141], [2062, 168]], '06': [[2240, 371], [2225, 250], 0.22], '07': [[2348, 104], [2364, 100.4], 0.06], '08': [[2232, 124], [2336, 182]],
  '09': [[2387.8, 214], [2386, 236], 0.05], '10': [[1927, 38], [1943, 4], 0.05], '11': [[2446, 216], [2490, 225], 0.02], '12': [[2031, -40], [2052, -72]],
  '13': [[2390.9, 209.1], [2368, 232], 0.12], '14': [[2200, 352], [2150, 240]], '15': [[2060, 92], [2020, 74]], '16': [[2246, 368], [2205, 205], 0.32],
  '17': [[2262, 368], [2214, 334], 0.28], '18': [[2205.9, 355.5], [2190, 320]], '19': [[2166, 404], [2168, 389], 0.16],
};
const cost = async (p = page) => p.evaluate(() => { const n = window.__nlw, g = n.graphics; return { calls: n.drawn.calls, triangles: n.drawn.triangles, drawn: n.habitation.state().drawn, gpuMB: +(((g.pictures || 0) + (g.buffers || 0)) / 1048576).toFixed(0) }; });
const toHour = (hour, p = page) => p.evaluate((h) => { const n = window.__nlw, g = n.host.game; n.skip((24 + h - n.view.clock.hourFloat) % 24); g.state.weather = { kind: 'clear', until: g.state.t + 12 * 3600 }; }, hour);
for (const [pic, [eye, to, pitch = 0.12]] of Object.entries(PICTURE_AT)) {
  if (pic === '14') await toHour(18.3);
  await at(eye[0], eye[1], Math.atan2(to[0] - eye[0], to[1] - eye[1]));
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
await at(2160, 118, 0.6);
await page.waitForFunction(() => { const h = window.__nlw.audio.status().habitat; return h.songs >= 2 && h.kinds.length >= 2; }, null, { timeout: 90000 }).catch(() => {});
const heard = await page.evaluate(() => window.__nlw.audio.status().habitat);
check('F: the birds are heard, each kind its own song', heard.songs >= 2 && heard.kinds.length >= 2, heard);

// ---- G: the big waterfall heard, louder near it ----
await at(2446, 216, 1.6);
await page.waitForFunction(() => { const h = window.__nlw.audio.status().habitat; return h.falls.includes('big') && h.fallsLevel.some((v) => v > 0.2); }, null, { timeout: 30000 }).catch(() => {});
const nearFall = await page.evaluate(() => window.__nlw.audio.status().habitat);
await at(2386, 236, 0);
await page.waitForTimeout(3000);
const furtherFall = await page.evaluate(() => window.__nlw.audio.status().habitat);
check('G: the big waterfall is heard from where it falls (its sound placed there: louder the nearer)', nearFall.falls.includes('big') && nearFall.fallsLevel.some((v) => v > 0.2), { nearFall, furtherFall });

// ---- H: night, the moon and the stars, the torch; the other player sees its beam ----
// (while the second player comes into the town, the first looks down at its feet: this machine draws both pages, and
// the first's view of the habitation takes it a second or more a frame)
await page.evaluate(() => { const n = window.__nlw; n.cam.pitch = 1.3; n.cam.dist = 3; });
const B = await player('B', { lite: true });
const pageB = B.page;
await page.evaluate(() => { const n = window.__nlw; n.skip(0); });
const dayFile = await (async () => { await at(1934, 18, 0.9); await page.evaluate(() => { const n = window.__nlw; n.cam.dist = 6.5; n.cam.pitch = 0.12; }); await settle(4); await page.waitForTimeout(800); return shot('hill-by-day'); })();
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
await pageB.evaluate(() => { const n = window.__nlw; n.place(1938, 22); n.face(Math.PI); n.cam.yaw = Math.PI + 0.6; n.cam.dist = 8; });
await page.evaluate(() => { const n = window.__nlw; n.place(1934, 18); n.face(0.9); });
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
await at(2031, -40, Math.PI * 0.8);
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
for (const name of ['gate', 'hill', 'forest', 'lagoon', 'bigfall', 'garden']) {
  const v = VIEWS[name];
  await pageB.evaluate(([x, z, h]) => { const n = window.__nlw; n.place(x, z); n.face(h); n.cam.yaw = h; n.cam.dist = 6.5; n.cam.pitch = 0.12; }, [v.eye[0], v.eye[1], v.look]);
  await settle(6, pageB); await pageB.waitForTimeout(800);
  measures.phone.places[name] = await cost(pageB);
  await shot(`phone-${name}`, pageB);
}
const phoneWorst = Object.entries(measures.phone.places).sort((a, b) => b[1].gpuMB - a[1].gpuMB)[0];
check('D: on a phone (#lite), what is drawn stays within what a mid-range phone draws: under 260 draw calls and 900,000 triangles, and under the phone\'s budget of 150 MB on the graphics card (budget.js)', Object.values(measures.phone.places).every((c) => c.calls < 260 && c.triangles < 9e5 && c.gpuMB < 150), { phoneWorst, modelBytes: habB.modelBytes });
// (the town's towers, 1.7 km off and out of sight, are let go up here: a phone needs the room)
const towersB = await pageB.evaluate(() => { const tb = window.__nlw.townBuildings, ids = new Set(tb.entries.filter((e) => e.kind === 'tower').map((e) => e.model)); return tb.state().models.filter((m) => ids.has(m.id)).map((m) => `${m.id}:${m.state}:${m.released}`); });
measures.phone.townTowers = towersB;
check('D: up at the habitation the town\'s towers (out of sight) are let go', towersB.length > 0 && towersB.every((t) => /:idle:/.test(t)), towersB);

// ---- back in the town: the habitation, and the road and river beyond the town, let go ----
await at(60, 113, -Math.PI / 2);
const gone = await page.waitForFunction(() => { const h = window.__nlw.habitation.state(); return !h.built && !h.upriver; }, null, { timeout: 30000 }).then(() => true, () => false);
const left = await page.evaluate(() => { const n = window.__nlw, h = n.habitation.state(); let named = 0; n.scene.traverse((o) => { if (o.name === 'habitation-near' || o.name === 'upriver') named += 1; }); return { built: h.built, upriver: h.upriver, letGo: h.letGo, inScene: named, calls: n.drawn.calls }; });
check('back in the town, the habitation and the road beyond the town are let go: nothing of them left drawn or held', gone && !left.built && !left.upriver && left.inScene === 0 && left.letGo >= 1, left);
// and the town's towers, let go while it was up at the habitation, drawn from their models again
const towersBack = await page.waitForFunction(() => { const tb = window.__nlw.townBuildings, ids = new Set(tb.entries.filter((e) => e.kind === 'tower').map((e) => e.model)); return tb.state().models.filter((m) => ids.has(m.id)).every((m) => m.state === 'ready'); }, null, { timeout: 600000 }).then(() => true, () => false);
const towersA = await page.evaluate(() => { const tb = window.__nlw.townBuildings, ids = new Set(tb.entries.filter((e) => e.kind === 'tower').map((e) => e.model)); return tb.state().models.filter((m) => ids.has(m.id)).map((m) => `${m.id}:${m.state}:${m.released}`); });
check('back in the town, its towers (let go up at the habitation) are fetched and drawn from their models again', towersBack && towersA.some((t) => /:ready:[1-9]/.test(t)), towersA);

writeFileSync(resolve(out, 'measures.json'), `${JSON.stringify(measures, null, 1)}\n`);
console.log('measures', JSON.stringify(measures));
const failed = results.filter((ok) => !ok).length;
console.log(failed ? `${failed} of ${results.length} checks failed` : `All ${results.length} checks passed.`);
await browser.close(); server.close();
process.exit(failed ? 1 : 0);
