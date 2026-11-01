// Oganiru City, Stage 2 (1 November 2026, the owner's brief: the whole road network), in the game as it is served with
// its server, in a headless browser; two players, the second on a phone's settings (#lite):
//   A  the city in pieces: built round the player as they come, let go behind them on the phone
//   B  both levels of the Harmony Interchange driven: on the flyover over Harmony Avenue, on the upper flyover over
//      it, and on the avenue under both; each car on its own level
//   C  down the expressway into its cutting and under the Hope Avenue bridge: on the road down there; the camera
//      under the bridge stays under it; on foot under the Peace Avenue flyover, the camera under its deck
//   D  the town's cars on the city's roads drawn at their height (up on the viaduct and the flyovers); the townspeople
//      out walking in the city drawn on its pavements
//   E  the billboards along the expressway with the game's own adverts on them
//   F  downtown at night: its street lamps lit, the towers' windows
//   G  the phone's graphics card at the new places, at Medium (the brief: under 135 MB at the busiest: downtown at
//      night, the big interchange)
//   H  nothing goes wrong in either page
//   ../server/with-postgres.sh node test/oganiru-city.mjs [shots folder]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDevServer } from '../../server/dev.mjs';
import { pastQuestion, enterTown } from './start.mjs';
import { OGANIRU_DECKS, oganiruDecksAt, expresswayY, EXPRESSWAY_Z } from '../src/sim/zones/oganiru.js';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const out = process.argv[2] || '/tmp/oganiru-city-shots';
mkdirSync(out, { recursive: true });
const server = createDevServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); };

async function player(label, { lite = false } = {}) {
  const context = await browser.newContext(lite ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, serviceWorkers: 'block' } : { viewport: { width: 1100, height: 620 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(300000);
  page.on('pageerror', (e) => check(`no error in ${label}'s page`, false, `${e.message} ${(e.stack || '').split('\n').slice(0, 3).join(' | ')}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 4\d\d/.test(m.text())) check(`no error in ${label}'s console`, false, m.text()); });
  await page.goto(`${origin}/#nointro-gameclock${lite ? '-lite' : ''}`, { timeout: 300000 });
  await page.waitForFunction(() => !!(window.__nlw && window.__nlw.intro), null, { timeout: 300000 });
  await page.waitForSelector('#open-signup', { state: 'visible', timeout: 300000 });
  await page.click('#open-signup');
  await page.fill('#account-username', `${label}_${Math.random().toString(36).slice(2, 7)}`);
  await page.fill('#account-password', `a password for ${label} in the city`);
  await page.click('#account-submit');
  await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 120000 });
  await pastQuestion(page);
  await page.fill('#name', label);
  await enterTown(page, { tap: lite, wait: 900000 });
  await page.waitForFunction(() => window.__nlw.view && window.__nlw.view.clock, null, { timeout: 120000 }).catch(() => {});
  await page.evaluate(() => { const n = window.__nlw; const g = n.host.game; g.state.weather = { kind: 'clear', until: g.state.t + 12 * 3600 }; const hour = n.view.clock.hourFloat; if (hour < 10 || hour > 14) n.skip((24 + 11 - hour) % 24); for (const id of ['toasts', 'notices']) { const t = document.getElementById(id); if (t) t.style.display = 'none'; } });
  let shotN = 0;
  return { page, context, shot: (name) => page.screenshot({ path: resolve(out, `${label.toLowerCase()}-${String(++shotN).padStart(2, '0')}-${name}.png`) }) };
}
const settle = async (p, n = 4, timeout = 180000) => {
  await p.evaluate(() => { if (window.__frames === undefined) { window.__frames = 0; const f = () => { window.__frames += 1; requestAnimationFrame(f); }; requestAnimationFrame(f); } });
  const from = await p.evaluate(() => window.__frames);
  await p.waitForFunction((k) => window.__frames >= k, from + n, { timeout }).catch(() => {});
};
const at = (p, x, z, h, y = undefined, { dist = 7, pitch = 0.12, yaw = h } = {}) => p.evaluate(([x, z, h, y, dist, pitch, yaw]) => { const n = window.__nlw; n.place(x, z, y === null ? undefined : y); n.face(h); n.cam.yaw = yaw; n.cam.dist = dist; n.cam.pitch = pitch; }, [x, z, h, y === undefined ? null : y, dist, pitch, yaw]);
const drive = async (p, ms) => { await p.keyboard.down('w'); await p.waitForTimeout(ms); await p.keyboard.up('w'); };
const intoCar = async (p, x, z, h, y) => {
  await p.evaluate(() => { const n = window.__nlw; if (n.view.self.incar) n.leaveCar(); });
  await at(p, x, z, h, y);
  await p.evaluate(() => window.__nlw.server.send({ type: 'cars.owned', cars: ['grey-saloon'] }));
  await p.waitForTimeout(500);
  const r = await p.evaluate(() => window.__nlw.driveCar('grey-saloon'));
  await p.waitForFunction(() => window.__nlw.view.self.incar && window.__nlw.carView.ready(), null, { timeout: 300000 }).catch(() => {});
  return r;
};
const where = (p) => p.evaluate(() => { const n = window.__nlw, s = n.view.self, e = n.camera.position; return { x: +n.predicted.x.toFixed(1), z: +n.predicted.z.toFixed(1), y: +(s.y || 0).toFixed(2), incar: !!s.incar, eye: [+e.x.toFixed(1), +e.y.toFixed(2), +e.z.toFixed(1)] }; });
const pieces = (p) => p.evaluate(() => { const n = window.__nlw; return n.city.ready && n.city.stats ? n.city.stats().pieces : null; });

const A = await player('Driver');
const B = await player('Walker', { lite: true });
const a = A.page, b = B.page;

// ---- A: the city in pieces ----
await at(a, 0, -500, Math.PI);
await a.evaluate(() => window.__nlw.buildCity());
await settle(a, 6);
const atGate = await pieces(a);
check('the city is built in pieces round the player: those near the gate drawn', !!atGate && atGate.now >= 2, atGate);
// the phone: built as they come near it, near pieces only
await at(b, 0, -470, Math.PI);
for (let k = 0; k < 120 && !(await b.evaluate(() => window.__nlw.city.ready)); k += 1) await b.waitForTimeout(1000);
await settle(b, 10);
const phoneGate = await pieces(b);
await at(b, -1290, -1150, 0);
for (let k = 0; k < 90; k += 1) { const q = await pieces(b); if (q && q.now >= 2 && q.queued === 0) break; await b.waitForTimeout(1000); }
const phoneFar = await pieces(b);
check('on the phone, the pieces round the player are built as they come, and those left far behind let go', !!phoneGate && !!phoneFar && phoneGate.now >= 1 && phoneFar.now >= 1 && phoneFar.built > phoneGate.built && phoneFar.letGo >= 1, { phoneGate, phoneFar });

// ---- B: both levels of the Harmony Interchange ----
const sbEb = OGANIRU_DECKS.find((d) => d.id === 'h-sb-eb'), ebNb = OGANIRU_DECKS.find((d) => d.id === 'h-eb-nb');
const low = sbEb.path.find((q) => q.y > 7.45), high = ebNb.path.find((q) => q.y > 13.9);
const levelOf = (id, q) => { const h = oganiruDecksAt(q.x, q.z).find((d) => d.deck.id === id); return h ? h.y : null; };
const onLow = await intoCar(a, low.x, low.z, Math.atan2(low.ux, low.uz), low.y);
const low0 = await where(a);
const lowTrace = [];
await a.evaluate(() => { window.__nlw.carState.speed = 7; });
for (let k = 0; k < 4; k += 1) { await drive(a, 1200); lowTrace.push(await where(a)); }
await A.shot('harmony-flyover-over-harmony-avenue');
check('on the Harmony Interchange\'s flyover over Harmony Avenue, the car stays on it', !!(onLow && onLow.ok !== false) && low0.incar && Math.abs(low0.y - low.y) < 0.1 && lowTrace.every((q) => levelOf('h-sb-eb', q) !== null && Math.abs(q.y - levelOf('h-sb-eb', q)) < 0.15) && Math.hypot(lowTrace[3].x - low0.x, lowTrace[3].z - low0.z) > 4, { low0, lowTrace });
const onHigh = await intoCar(a, high.x, high.z, Math.atan2(high.ux, high.uz), high.y);
const high0 = await where(a);
const highTrace = [];
await a.evaluate(() => { window.__nlw.carState.speed = 7; });
for (let k = 0; k < 4; k += 1) { await drive(a, 1200); highTrace.push(await where(a)); }
await A.shot('harmony-upper-flyover');
check('on the upper flyover over both, about 14 m up, the car stays on it', !!(onHigh && onHigh.ok !== false) && high0.incar && Math.abs(high0.y - high.y) < 0.1 && highTrace.every((q) => levelOf('h-eb-nb', q) !== null && Math.abs(q.y - levelOf('h-eb-nb', q)) < 0.15 && q.y > 12) && Math.hypot(highTrace[3].x - high0.x, highTrace[3].z - high0.z) > 4, { high0, highTrace });
const onAvenue = await intoCar(a, -1294.25, -1330, 0, undefined);
const ave0 = await where(a);
const aveTrace = [];
await a.evaluate(() => { window.__nlw.carState.speed = 9; });
for (let k = 0; k < 10; k += 1) { await drive(a, 1500); aveTrace.push(await where(a)); }
const passedUnder = aveTrace.filter((q) => oganiruDecksAt(q.x, q.z).some((d) => d.y > 5));
await A.shot('harmony-avenue-under-the-interchange');
check('on Harmony Avenue under the interchange the car stays on the road, under the flyovers', !!(onAvenue && onAvenue.ok !== false) && ave0.incar && aveTrace.every((q) => Math.abs(q.y) < 0.25) && aveTrace[aveTrace.length - 1].z > ave0.z + 20 && passedUnder.length >= 1, { ave0, aveTrace });

// ---- C: down into the cutting, under the Hope bridge; under the Peace flyover on foot ----
const onCut = await intoCar(a, -700, EXPRESSWAY_Z - 8.5, -Math.PI / 2, expresswayY(-700));
const cut0 = await where(a);
const cutTrace = [];
await a.evaluate(() => { window.__nlw.carState.speed = 8; });
for (let k = 0; k < 6; k += 1) { await drive(a, 1500); cutTrace.push(await where(a)); }
const underBridge = cutTrace.filter((q) => Math.abs(q.x - -750) < 26);
await A.shot('in-the-cutting-under-the-hope-bridge');
check('down in the expressway\'s cutting the car stays on the road there, under the Hope bridge, the camera below the bridge\'s deck', !!(onCut && onCut.ok !== false) && cut0.incar && cutTrace.every((q) => Math.abs(q.y - expresswayY(q.x)) < 0.25 && q.y < -5) && cutTrace[cutTrace.length - 1].x < cut0.x - 10 && underBridge.every((q) => q.eye[1] < -0.6), { cut0, cutTrace });
await a.evaluate(() => { const n = window.__nlw; if (n.view.self.incar) n.leaveCar(); });
await at(a, 716, -770, Math.PI / 2, undefined, { dist: 8, pitch: 0.35 });
await settle(a, 4);
const underPeace = await where(a);
check('on foot under the Peace Avenue flyover, the camera is under its deck', underPeace.eye[1] < 7.5 - 2 + 0.05, underPeace);
await A.shot('under-the-peace-flyover');

// ---- D: the town's cars and people drawn at their heights ----
// (up on the expressway's viaduct, on its shoulder south of the Unity Interchange, facing the north-bound traffic: the
// town's cars going by up there, its through traffic among them, each drawn up there as its model)
await at(a, -400, EXPRESSWAY_Z + 14.2, -Math.PI / 2, expresswayY(-400), { dist: 9, pitch: 0.16, yaw: -Math.PI / 2 });
let up = null;
// (as long as a quarter of an hour: drawing in software here, a frame can take longer than the game's longest step, and
// the town's time then runs slower than the clock's)
for (let k = 0; k < 900 && !up; k += 1) {
  await a.waitForTimeout(1000);
  up = await a.evaluate(() => {
    const n = window.__nlw;
    for (const c of n.view.traffic || []) {
      if (!(c.y > 5) || Math.hypot(c.x - n.predicted.x, c.z - n.predicted.z) > 90) continue;
      const car = n.carView.driven(`traffic:${c.n}`);
      if (car && car.group) return { n: c.n, y: c.y, drawn: +car.group.position.y.toFixed(2), x: c.x, z: c.z, after: 0 };
    }
    return null;
  });
  if (up) up.after = k;
}
await A.shot('the-towns-cars-up-on-the-expressway');
check('the town\'s cars drive up on the viaduct, and are drawn up there', !!up && Math.abs(up.drawn - up.y) < 0.6, up);
await at(a, 0, -760, Math.PI, undefined, { dist: 9, pitch: 0.15, yaw: Math.PI - 0.4 });
let walker = null;
for (let k = 0; k < 180 && !walker; k += 1) {
  await a.waitForTimeout(1000);
  walker = await a.evaluate(() => {
    const n = window.__nlw, S = n.host.game.internals.strollers;
    const out = new Set(S.out().map((w) => w.i));
    const row = (n.view.people || []).find((r) => out.has(r[0]) && Math.hypot(r[1] - n.predicted.x, r[2] - n.predicted.z) < 60);
    return row ? { i: row[0], x: row[1], z: row[2], y: row[5] } : null;
  });
}
await settle(a, 4);
await A.shot('out-walking-downtown');
check('townspeople are out walking downtown by day, on its pavements', !!walker && Number.isFinite(walker.y) && walker.y >= 0 && walker.y < 0.3, walker);

// ---- E: the billboards along the expressway ----
await at(a, -560, -1122, Math.PI / 2, expresswayY(-560), { dist: 7, pitch: 0.05 });
for (let k = 0; k < 60; k += 1) { if (await a.evaluate(() => { const c = window.__nlw.cityBoards; return !!c && c.boards.every((x) => x.art); })) break; await a.waitForTimeout(1000); }
await settle(a, 6);
const boards = await a.evaluate(() => { const c = window.__nlw.cityBoards; return c ? { boards: c.boards.length, withArt: c.boards.filter((x) => x.art).length } : null; });
await A.shot('a-billboard-from-the-viaduct');
check('the billboards along the expressway are drawn, each with one of the game\'s own adverts', !!boards && boards.boards === 10 && boards.withArt === 10, boards);

// ---- F: downtown at night ----
for (let i = 0; i < 24 && (await a.evaluate(() => window.__nlw.night)) < 0.7; i += 1) { await a.evaluate(() => window.__nlw.skip(1)); await a.waitForTimeout(300); }
await at(a, -14, -760, -0.6, undefined, { dist: 12, pitch: 0.05 });
await settle(a, 6);
const night = await a.evaluate(() => { const n = window.__nlw, s = n.streetLamps.stats(); return { night: +n.night.toFixed(2), lit: s.lit, of: s.lamps }; });
check('downtown at night: the street lamps lit', night.night > 0.6 && night.lit > night.of * 0.8, night);
await A.shot('downtown-at-night');

// ---- G: the phone's graphics card at the new places, at Medium ----
await b.evaluate(() => { const n = window.__nlw, g = n.governor; g.hold(true); g.set(2, 'measuring'); });
const card = {};
const NIGHT = async (on) => { const h = await b.evaluate(() => window.__nlw.view.clock.hourFloat); const want = on ? 22 : 12; await b.evaluate((d) => window.__nlw.skip(d), (24 + want - h) % 24); };
for (const [name, x, z, h, y, night2] of [['downtown at night', -14, -760, -0.6, undefined, true], ['Harmony Interchange', -1250, -1185, -0.9, undefined, false], ['Peace Interchange', 700, -1100, -2.4, undefined, false], ['in the cutting', -700, EXPRESSWAY_Z + 8.5, -Math.PI / 2, expresswayY(-700), false], ['Southgate Roundabout', -1265, -40, -Math.PI / 2, undefined, false], ['Sunrise Roundabout', 30, -1550, -Math.PI / 2, undefined, false]]) {
  await NIGHT(night2);
  await at(b, x, z, h, y);
  for (let k = 0; k < 120; k += 1) { const q = await pieces(b); if (q && q.queued === 0) break; await b.waitForTimeout(1000); }
  await settle(b, 6, 240000);
  await b.waitForTimeout(3000);
  card[name] = await b.evaluate(() => { const g = window.__nlw.graphics || {}; return +(((g.pictures || 0) + (g.buffers || 0)) / 1048576).toFixed(1); });
  await B.shot(name.toLowerCase().replace(/ /g, '-'));
}
const most = Math.max(...Object.values(card));
check('a phone at Medium holds under 135 MB on its graphics card at every one of the new places', most < 135, card);

const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nAll ${results.length} checks passed.`);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
