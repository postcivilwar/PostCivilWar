// Oganiru City, Stage 1 (31 October 2026, the owner's brief for the new city with flyovers), in the game as it is
// served with its server, in a headless browser; two players, the second on a phone's settings (#lite):
//   A  the city drawn: its roads, decks, towers and lamps, its slim trees read from the habitation's file
//   B  the levels of the Unity Interchange driven: up on the expressway the car stays on its deck; on the flyover over
//      it, 15 m up, on that; under it, on Unity Avenue, on the road; the camera under the deck stays under it
//   C  at night the street lamps lit, the city's among them, their light on the road
//   D  a lamp knocked down by a car going fast: it falls the way it was hit and the car goes on; the other player sees
//      it down
//   E  the phone's graphics card at the city's places, at Medium (the brief: under 135 MB at the busiest)
//   F  nothing goes wrong in either page
//   ../server/with-postgres.sh node test/oganiru.mjs [shots folder]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDevServer } from '../../server/dev.mjs';
import { pastQuestion, enterTown } from './start.mjs';
import { OGANIRU_DECKS, oganiruDecksAt } from '../src/sim/zones/oganiru.js';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const out = process.argv[2] || '/tmp/oganiru-shots';
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
  await page.evaluate(() => { const n = window.__nlw; const g = n.host.game; g.state.weather = { kind: 'clear', until: g.state.t + 12 * 3600 }; const hour = n.view.clock.hourFloat; if (hour < 9 || hour > 14) n.skip((24 + 10 - hour) % 24); for (const id of ['toasts', 'notices']) { const t = document.getElementById(id); if (t) t.style.display = 'none'; } });
  let shotN = 0;
  return { page, context, shot: (name) => page.screenshot({ path: resolve(out, `${label.toLowerCase()}-${String(++shotN).padStart(2, '0')}-${name}.png`) }) };
}
// frames drawn, counted in the page, so that a view is looked at once it has been drawn a few times over
const settle = async (p, n = 4, timeout = 180000) => {
  await p.evaluate(() => { if (window.__frames === undefined) { window.__frames = 0; const f = () => { window.__frames += 1; requestAnimationFrame(f); }; requestAnimationFrame(f); } });
  const from = await p.evaluate(() => window.__frames);
  await p.waitForFunction((k) => window.__frames >= k, from + n, { timeout }).catch(() => {});
};
const at = (p, x, z, h, y = undefined, { dist = 7, pitch = 0.12, yaw = h } = {}) => p.evaluate(([x, z, h, y, dist, pitch, yaw]) => { const n = window.__nlw; n.place(x, z, y === null ? undefined : y); n.face(h); n.cam.yaw = yaw; n.cam.dist = dist; n.cam.pitch = pitch; }, [x, z, h, y === undefined ? null : y, dist, pitch, yaw]);

const A = await player('Builder');
const B = await player('Phone', { lite: true });
const a = A.page, b = B.page;

// ---- A: the city drawn ----
for (const p of [a, b]) await p.evaluate(() => { const n = window.__nlw; n.place(0, -500); n.buildCity(); });
const drawn = await a.evaluate(() => {
  const n = window.__nlw, names = new Set();
  n.scene.traverse((o) => { if (o.name && /^(oganiru|lamps|lamp-)/.test(o.name)) names.add(o.name.replace(/:t\d$/, ':tower')); });
  return { ready: n.city.ready, names: [...names].sort(), lamps: n.streetLamps.stats(), stats: n.city.stats() };
});
check('the city is built and drawn: its ground, roads and markings, kerbs, strips and walkways, decks with their undersides and pillars, its towers, signals and signs', drawn.ready && ['oganiru:ground', 'oganiru:tar', 'oganiru:rampTar', 'oganiru:paint', 'oganiru:kerb', 'oganiru:grass', 'oganiru:pave', 'oganiru:concrete', 'oganiru:soffit', 'oganiru:pillar', 'oganiru:tower', 'oganiru:lobby', 'oganiru:signals'].every((k) => drawn.names.includes(k)), drawn.names);
check('every street lamp is drawn, the town\'s, Market Road\'s, those beyond the town and the city\'s (eight kinds: downtown\'s middle-strip lamps with their banners one of them), the city\'s shown with it', drawn.lamps.kinds === 8 && drawn.lamps.lamps > 250 && drawn.lamps.regions.city === true, drawn.lamps);
for (let k = 0; k < 150; k += 1) { const t = await a.evaluate(() => { const c = window.__nlw.city; return c.trees ? { loaded: c.trees.loaded, failed: c.trees.failed } : null; }); if (t && (t.loaded || t.failed)) break; await a.waitForTimeout(1000); }
await at(a, -6, -640, Math.PI, undefined, { dist: 6, pitch: 0.06, yaw: Math.PI - 0.15 });
await settle(a, 4);
const trees = await a.evaluate(() => { const c = window.__nlw.city; return { loaded: c.trees.loaded, failed: c.trees.failed, drawn: c.trees.drawn, of: c.trees.count }; });
check('the slim trees down Unity Avenue\'s middle strip are the habitation\'s slim tree, read from its file, drawn near and as pictures further off', trees.loaded && !trees.failed && trees.drawn >= 3, trees);
await A.shot('day-median-trees');

// ---- B: both levels of the interchange driven; the camera under the deck ----
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
const where = (p) => p.evaluate(() => { const n = window.__nlw, s = n.view.self, e = n.camera.position; return { x: +n.predicted.x.toFixed(1), z: +n.predicted.z.toFixed(1), y: +(s.y || 0).toFixed(2), drawnY: +n.me.group.position.y.toFixed(2), incar: !!s.incar, eye: [+e.x.toFixed(1), +e.y.toFixed(2), +e.z.toFixed(1)] }; });
// up on the expressway's deck, going north along it
const onDeck = await intoCar(a, -150, -1122, Math.PI / 2, 7.5);
const deck0 = await where(a);
check('a car brought to someone up on the expressway stands on its deck', !!(onDeck && onDeck.ok !== false) && deck0.incar && Math.abs(deck0.y - 7.5) < 0.1, { onDeck, deck0 });
const deckTrace = [];
await a.evaluate(() => { window.__nlw.carState.speed = 8; });
for (let k = 0; k < 6; k += 1) { await drive(a, 1500); deckTrace.push(await where(a)); }
await A.shot('driving-on-the-expressway');
check('driven along the expressway, the car stays up on its deck, and is drawn there', deckTrace.every((q) => Math.abs(q.y - 7.5) < 0.1) && deckTrace[deckTrace.length - 1].x > deck0.x + 3, deckTrace);
// the interchange's upper level: the flyover over the expressway, 15 m up, going on along it
const top = OGANIRU_DECKS.find((d) => d.id === 'u-fly').path.find((q) => q.s >= 505);
const onTop = await intoCar(a, top.x, top.z, Math.atan2(top.ux, top.uz), top.y);
const top0 = await where(a);
const topTrace = [];
await a.evaluate(() => { window.__nlw.carState.speed = 8; });
for (let k = 0; k < 3; k += 1) { await drive(a, 1200); topTrace.push(await where(a)); }
await A.shot('driving-on-the-upper-flyover');
const flyAt = (q) => { const h = oganiruDecksAt(q.x, q.z).find((d) => d.deck.id === 'u-fly'); return h ? h.y : null; };
const under7 = (q) => oganiruDecksAt(q.x, q.z).some((d) => d.deck.id === 'viaduct');
check('up on the flyover over the expressway (the interchange\'s upper level), the car stays on it, 15 m up, the expressway\'s deck under it', !!(onTop && onTop.ok !== false) && top0.incar && Math.abs(top0.y - top.y) < 0.1 && topTrace.every((q) => flyAt(q) !== null && Math.abs(q.y - flyAt(q)) < 0.15 && q.y > 13) && Math.hypot(topTrace[topTrace.length - 1].x - top0.x, topTrace[topTrace.length - 1].z - top0.z) > 4 && [top0, ...topTrace].some(under7), { top0, topTrace });
// under it, on Unity Avenue going west, from the north of the expressway to its south
const under = await intoCar(a, 6.5, -1100, Math.PI, undefined);
const under0 = await where(a);
const underTrace = [];
await a.evaluate(() => { window.__nlw.carState.speed = 8; });
for (let k = 0; k < 8; k += 1) { await drive(a, 1500); underTrace.push(await where(a)); }
const beneath = underTrace.filter((q) => Math.abs(q.z - (-1130)) < 13);
await A.shot('driving-under-the-expressway');
check('driven along Unity Avenue under the expressway, the car stays on the road and passes under it', !!(under && under.ok !== false) && underTrace.every((q) => Math.abs(q.y) < 0.2) && underTrace[underTrace.length - 1].z < under0.z - 3, { under0, underTrace });
check('under the deck the camera stays under it (it comes closer rather than going up into it)', beneath.length === 0 || beneath.every((q) => q.eye[1] < 7.5 - 2), beneath);
await a.evaluate(() => { const n = window.__nlw; if (n.view.self.incar) n.leaveCar(); });
// on foot under the Independence Flyover, the camera behind: under the deck
await at(a, 2, -776, Math.PI, undefined, { dist: 8, pitch: 0.35 });
await settle(a, 4);
const underFly = await where(a);
check('on foot under the Independence Flyover, the camera is under its deck too', underFly.eye[1] < 7.5 - 2 + 0.05, underFly);
await A.shot('under-the-independence-flyover');

// ---- D: a lamp knocked down; the other player sees it ----
// (the lamp on the walkway beside College Road carried on, where it widens to the roundabout; the car comes at it along
// the walkway's line from the open ground before it; B stands by, on foot)
const target = await a.evaluate(() => window.__nlw.lampsNear(6.9, -511, 3).find((l) => l.kind === 'edge'));
await at(b, 16, -500, Math.PI, undefined, { dist: 9, pitch: 0.2, yaw: Math.PI + 0.5 });
await intoCar(a, target.x, -494.5, Math.PI, undefined);
await a.evaluate(() => { const n = window.__nlw; n.carState.speed = 13; });
let knocked = null;
await a.keyboard.down('w');
for (let k = 0; k < 120 && !knocked; k += 1) {
  await a.waitForTimeout(500);
  knocked = await a.evaluate((i) => { const n = window.__nlw, d = n.streetLamps.drawnOf(i); return d && d.down ? { drawn: d, speed: +n.carState.speed.toFixed(1), z: +n.predicted.z.toFixed(1) } : null; }, target.i);
}
// (the car goes on past it: looked at a moment later, the knock having been seen between two looks)
await a.waitForTimeout(1500);
const after = await a.evaluate(() => { const n = window.__nlw; return { speed: +n.carState.speed.toFixed(1), z: +n.predicted.z.toFixed(1) }; });
await a.keyboard.up('w');
check('a car at speed knocks the lamp in its way down, and goes on past it', !!knocked && knocked.speed > 3 && after.z < target.z - 1, { target, knocked, after });
await a.waitForTimeout(2500);
await A.shot('the-lamp-knocked-down');
let seen = null;
for (let k = 0; k < 60 && !seen; k += 1) { await b.waitForTimeout(1000); seen = await b.evaluate((i) => { const d = window.__nlw.streetLamps.drawnOf(i); return d && d.down ? d : null; }, target.i); }
check('the other player sees the lamp down where it fell', !!seen, seen);
await settle(b, 3);
await B.shot('the-lamp-seen-down');

// ---- C: at night ----
for (let i = 0; i < 24 && (await a.evaluate(() => window.__nlw.night)) < 0.7; i += 1) { await a.evaluate(() => window.__nlw.skip(1)); await a.waitForTimeout(300); }
await at(a, 0, -600, Math.PI, undefined, { dist: 7, pitch: 0.1 });
await settle(a, 5);
const night = await a.evaluate(() => { const n = window.__nlw, s = n.streetLamps.stats(); let pools = null; n.scene.traverse((o) => { if (o.name === 'lamp-pools') pools = o; }); return { night: +n.night.toFixed(2), lit: s.lit, of: s.lamps, pools: pools ? { visible: pools.visible, count: pools.count, opacity: +pools.material.opacity.toFixed(2) } : null }; });
check('at night the street lamps are lit, the city\'s among them, and their light is on the road', night.night > 0.6 && night.lit > night.of * 0.8 && night.pools && night.pools.visible && night.pools.opacity > 0.25, night);
await A.shot('night-unity-avenue');
await at(a, -14, -760, Math.PI, undefined, { dist: 12, pitch: 0.05, yaw: -0.6 });
await settle(a, 4);
await A.shot('night-towers');
await a.evaluate(() => { const g = window.__nlw.host.game; g.state.weather = { kind: 'storm', until: g.state.t + 6 * 3600 }; });
await a.waitForTimeout(8000);
await at(a, 0, -600, Math.PI, undefined, { dist: 7, pitch: 0.1 });
await settle(a, 5);
await A.shot('night-rain');

// ---- E: the phone's graphics card at the city's places, at Medium ----
await b.evaluate(() => { const n = window.__nlw, g = n.governor; g.hold(true); g.set(2, 'measuring'); });
const card = {};
for (const [name, x, z, h, y] of [['city gate', 0, -500, Math.PI], ['city towers', -14, -760, -0.6], ['under the flyover', 2, -770, Math.PI], ['interchange', -6, -1110, Math.PI], ['on the expressway', -120, -1122, Math.PI / 2, 7.5]]) {
  await at(b, x, z, h, y);
  await settle(b, 6, 240000);
  await b.waitForTimeout(3000);
  card[name] = await b.evaluate(() => { const g = window.__nlw.graphics || {}; return +(((g.pictures || 0) + (g.buffers || 0)) / 1048576).toFixed(1); });
}
const most = Math.max(...Object.values(card));
check('a phone at Medium holds under 135 MB on its graphics card at every one of the city\'s places', most < 135, card);
await B.shot('phone-on-the-expressway');

const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nAll ${results.length} checks passed.`);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
