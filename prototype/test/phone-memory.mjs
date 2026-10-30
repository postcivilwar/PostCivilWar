// A phone's memory and its buttons (29 October 2026, the owner's brief, with a recording from his iPhone: the game hung
// and then restarted by itself, even on Low, and the buttons shrank until they were out of sight). On the website as it
// is built (prototype/dist/site, with the server behind it), on a phone's settings at Low, in a headless browser:
//  A  the car's buttons on an upright iPhone-sized screen whose page is shorter than the screen (an iPhone's Safari with
//     its bars showing), its safe areas, hurt so that the life bar shows: the buttons keep their size, the horn just
//     below the band at the top and on the screen;
//  B  the layers laid over the drawing, the blood at the screen's edges and the speech bubbles, hidden while empty;
//  C  the town's squares far off rest on a phone (their room on the graphics card let go) and come back as the player
//     comes near: at the park as much drawn as before;
//  D  the habitation's pictures: let go by the models far off (from the town's east end), made again at its gate and in
//     its forest, every model drawn having its pictures on the card; again after going back out;
//  E  no picture handed to the graphics card after the page had let it go, and nothing in the console.
//   ../server/with-postgres.sh node test/phone-memory.mjs [shots folder]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const here = dirname(fileURLToPath(import.meta.url));
const { createDevServer } = await import(resolve(here, '../../server/dev.mjs'));
const { pastQuestion, enterTown, watchPictures, lostPictures } = await import(resolve(here, 'start.mjs'));
const { HABITATION_SHIFT } = await import(resolve(here, '../src/sim/zone.js'));
const out = process.argv[2] || '/tmp/phone-memory-shots';
mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); };
const server = createDevServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
await watchPictures(context);
const page = await context.newPage();
page.setDefaultTimeout(900000);
const errors = [];
page.on('pageerror', (e) => errors.push(`page error: ${e.message}`));
// (this machine's own notes left out: the service worker kept out by the test, the graphics card's note on reading back)
page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/Failed to load resource|status of 4\d\d|AudioContext|Service Worker registration blocked|GPU stall due to ReadPixels/.test(m.text())) errors.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
await page.goto(`${origin}/#gameclock-lite`, { timeout: 900000 });
await page.waitForSelector('#cover-play', { state: 'visible', timeout: 900000 });
await page.evaluate(() => document.getElementById('cover-play').click());
await page.waitForSelector('#open-signup', { state: 'visible', timeout: 900000 });
await page.click('#open-signup');
await page.fill('#account-username', `Mem_${Math.random().toString(36).slice(2, 7)}`);
await page.fill('#account-password', 'a password for the phone memory test');
await page.click('#account-submit');
await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 180000 });
await pastQuestion(page);
await page.fill('#name', 'Phone Memory');
await enterTown(page, { tap: true, wait: 900000 });
await page.waitForFunction(() => window.__nlw.me && window.__nlw.me.mixer, null, { timeout: 300000 });
await page.evaluate(() => { const n = window.__nlw, g = n.host.game; const hour = n.view.clock.hourFloat; n.skip(((24 + 11 - hour) % 24)); g.state.weather = { kind: 'clear', until: g.state.t + 24 * 3600 }; n.setGraphics('low'); });
const at = (x, z, heading) => page.evaluate(([x, z, heading]) => { const n = window.__nlw; n.place(x, z); n.face(heading); n.cam.yaw = heading; }, [x, z, heading]);
const frames = async (k = 6) => {
  await page.evaluate(() => { if (window.__frames === undefined) { window.__frames = 0; const f = () => { window.__frames += 1; requestAnimationFrame(f); }; requestAnimationFrame(f); } });
  const f0 = await page.evaluate(() => window.__frames);
  await page.waitForFunction(([a, k]) => window.__frames >= a + k, [f0, k], { timeout: 300000 }).catch(() => {});
};
const shot = (name) => page.screenshot({ path: resolve(out, `${name}.png`) });

// ---- A: the car's buttons, the page shorter than the screen
await page.evaluate(() => { const s = document.documentElement.style; s.setProperty('--st', '47px'); s.setProperty('--sb', '34px'); s.height = `${innerHeight - 120}px`; document.body.style.height = `${innerHeight - 120}px`; });
await page.evaluate(() => { const n = window.__nlw; n.place(-12, 96); n.server.send({ type: 'cars.owned', cars: ['white-roadster'] }); });
await page.waitForTimeout(800);
const entered = await page.evaluate(() => window.__nlw.driveCar('white-roadster'));
await page.evaluate(() => { const n = window.__nlw; n.host.game.state.players[n.playerId].health = 66; });
const pads = () => page.evaluate(() => {
  const g = document.getElementById('game');
  const band = Math.max(...['radar', 'hudr'].map((id) => { const el = document.getElementById(id); return el && !el.hidden ? el.getBoundingClientRect().bottom : 0; }));
  const shown = [...document.querySelectorAll('#pad .pad')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => { const r = e.getBoundingClientRect(); return { id: e.dataset.id, top: Math.round(r.top), bottom: Math.round(r.bottom), w: Math.round(r.width) }; });
  return { scale: Number(getComputedStyle(g).getPropertyValue('--pad-scale')) || 1, band: Math.round(band), H: document.documentElement.getBoundingClientRect().height, shown };
});
const seen = [];
for (let i = 0; i < 6; i += 1) { await page.waitForTimeout(2000); seen.push(await pads()); }
const first = seen[0], last = seen[seen.length - 1];
const horn = last.shown.find((p) => p.id === 'horn');
check('A: in a car on an upright iPhone-sized screen, the page shorter than the screen and hurt: the buttons keep their size, never shrinking away', entered && last.scale >= 0.55 && Math.abs(last.scale - first.scale) < 0.02 && last.shown.length >= 3, { entered, scales: seen.map((s) => s.scale), shown: last.shown.length });
check('A: the horn just below the band at the top, on the screen', !!horn && horn.top >= last.band - 2 && horn.bottom <= last.H, { horn, band: last.band, H: last.H });
await shot('a-car-buttons');
await page.evaluate(() => { const s = document.documentElement.style; s.height = ''; document.body.style.height = ''; window.__nlw.leaveCar && window.__nlw.leaveCar(); });
await page.evaluate(() => { const n = window.__nlw; n.host.game.state.players[n.playerId].health = 100; });
await page.waitForTimeout(1500);

// ---- B: the layers over the drawing, hidden while empty
await frames(4); await page.waitForTimeout(1500);
const layers = await page.evaluate(() => ({ flash: getComputedStyle(document.getElementById('flash')).visibility, bubbles: getComputedStyle(document.getElementById('bubbles')).visibility, talking: document.querySelectorAll('#bubbles .bubble:not([hidden])').length }));
check('B: the blood at the screen\'s edges and the speech bubbles\' layer hidden while they show nothing', layers.flash === 'hidden' && (layers.talking > 0 || layers.bubbles === 'hidden'), layers);

// ---- C: the town far off rests, and comes back
const drawnNow = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve({ calls: window.__nlw.perf.calls, triangles: window.__nlw.perf.triangles, resting: window.__nlw.levelState.resting })))));
await page.waitForFunction(() => window.__nlw.ready, null, { timeout: 900000 }).catch(() => {});
await at(-33.5, 97.6, Math.PI * 0.75);
await frames(8); await page.waitForTimeout(15000); await frames(8);
const park0 = await drawnNow();
await shot('c-park');

// ---- D: the habitation's pictures, from the town's east end
const look = () => page.evaluate(() => {
  const n = window.__nlw, r = n.renderer, hab = n.habitation.state();
  let drawnMeshes = 0;
  const bad = [];
  n.scene.traverse((o) => {
    if (!o.isInstancedMesh || !o.visible || !o.count || !o.name.includes(':')) return;
    drawnMeshes += 1;
    for (const k of ['map', 'normalMap', 'roughnessMap']) {
      const t = o.material && o.material[k]; if (!t) continue;
      const p = r.properties.get(t), img = t.image;
      if (!(p && p.__webglTexture) || !((t.userData.drawn || 0) > 0 || (img && img.width > 0))) bad.push(`${o.name}/${k}`);
    }
  });
  const ps = n.levelState.pictures;
  return { built: hab.built, models: hab.models, of: hab.of, asleep: hab.asleep, woken: hab.woken, drawnMeshes, bad: bad.slice(0, 6), badCount: bad.length, pictures: { asleep: ps.asleep, waking: ps.waking } };
});
await at(262, 104, Math.PI / 2);
const t0 = Date.now();
for (;;) {
  const h = await page.evaluate(() => window.__nlw.habitation && window.__nlw.habitation.state());
  if (h && h.built && h.models >= h.of) break;
  if (Date.now() - t0 > 1200000) break;
  await page.waitForTimeout(10000);
}
await page.waitForTimeout(20000); await frames(4);
const east = await look();
check('D: from the town\'s east end, the habitation built and its models far off let go of their pictures', east.built && east.models === east.of && east.asleep > 0 && east.pictures.asleep > 0 && east.badCount === 0, east);
await shot('d-east-end');
const restEast = (await drawnNow()).resting;
check('C: on a phone the town\'s squares far off rest out at the east end (their room on the graphics card let go)', restEast.rested > 0 && restEast.resting > 0 && restEast.failed === 0, restEast);
await at(336 + 2, 91, Math.PI / 2);
await frames(10); await page.waitForTimeout(8000); await frames(10);
const gate = await look();
check('D: at the habitation\'s gate the models in sight are drawn with their pictures, made again', gate.drawnMeshes > 0 && gate.badCount === 0 && gate.woken > 0, gate);
await shot('d-gate');
await at(2036 + HABITATION_SHIFT, 79, Math.atan2(2110 - 2036, 112 - 79));
await frames(10); await page.waitForTimeout(8000); await frames(10);
const forest = await look();
check('D: in the forest every model drawn has its pictures', forest.drawnMeshes > 0 && forest.badCount === 0, forest);
await shot('d-forest');
await at(262, 104, Math.PI / 2);
await frames(6); await page.waitForTimeout(25000); await frames(4);
await at(2036 + HABITATION_SHIFT, 79, Math.atan2(2110 - 2036, 112 - 79));
await frames(10); await page.waitForTimeout(8000); await frames(10);
const forest2 = await look();
check('D: out to the east end and back into the forest: let go and made again a second time, every model drawn with its pictures', forest2.drawnMeshes > 0 && forest2.badCount === 0 && forest2.woken > gate.woken, forest2);

// ---- C: back at the park
await at(-33.5, 97.6, Math.PI * 0.75);
await frames(8); await page.waitForTimeout(15000); await frames(8);
const park1 = await drawnNow();
check('C: back at the park what rested has come back: as much of the town drawn as before', park1.resting.woken > 0 && park1.resting.failed === 0 && park1.triangles >= park0.triangles * 0.9 && park1.calls >= park0.calls * 0.9, { park0, park1 });
await shot('c-park-again');

// ---- E
const lost = await lostPictures(page);
check('E: no picture handed to the graphics card after the page had let it go', lost === 0, { lost });
check('E: nothing in the console', errors.length === 0, errors.slice(0, 8));
const passed = results.filter(Boolean).length;
console.log(passed === results.length ? `All ${results.length} checks passed.` : `${passed} of ${results.length} checks passed.`);
await browser.close();
server.close();
process.exit(passed === results.length ? 0 : 1);
