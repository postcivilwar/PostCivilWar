// Oganiru City, Stage 3 (2 November 2026, the owner's brief: "The whole downtown and the skyline"), in the game as it is
// served with its server, in a headless browser; two players, the second on a phone's settings (#lite):
//   A  the skyline from the town, on the phone before any of the city near it is built (and with nothing of the city's
//      own built at all): every tower, one mesh for each kind of wall, its lobbies, its tops and their lit bands, in
//      sight looking west from the middle of the town; at night their windows lit; on a computer in the north of the
//      town the city built a piece a frame, not all at once at its gate
//   B  downtown at its street level: each tower's foot (its canopy, doors, steps, shops and their names), a piece's
//      signs drawn as one; the towers' pieces drawn from as near as the rest of the city
//   C  the windows lit at night, more in the evening than late in the night; none by day; the tallest crowns' bands lit
//   D  the radar in the corner shows the city's roads under the player
//   E  from inside a hall (PostCivilWar PowerBike's) the skyline is not drawn
//   F  the phone's graphics card and its drawing at the new places, at Medium (the brief: under 135 MB at the busiest
//      new places, downtown at night among them; and no heavier to draw than the busiest place in the town)
//   G  nothing goes wrong in either page
//   ../server/with-postgres.sh node test/oganiru-downtown.mjs [shots folder]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDevServer } from '../../server/dev.mjs';
import { pastQuestion, enterTown } from './start.mjs';
import { OGANIRU_TOWERS } from '../src/sim/zones/oganiru.js';
import { POWERBIKE } from '../src/sim/zones/atani-powerbike.js';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const out = process.argv[2] || '/tmp/oganiru-downtown-shots';
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
  await page.fill('#account-password', `a password for ${label} downtown`);
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
const at = (p, x, z, h, y = undefined, { dist = 7, pitch = 0.12, yaw = h } = {}) => p.evaluate(([x, z, h, y, dist, pitch, yaw]) => { const n = window.__nlw; n.place(x, z, y === null ? undefined : y); n.face(h); n.cam.yaw = yaw; n.cam.dist = dist; n.cam.pitch = pitch; if (n.rig && n.rig.snap) n.rig.snap(n.cam); }, [x, z, h, y === undefined ? null : y, dist, pitch, yaw]);
const pieces = (p) => p.evaluate(() => { const n = window.__nlw; return n.city.ready && n.city.stats ? n.city.stats().pieces : null; });
const hourTo = async (p, want) => { const h = await p.evaluate(() => window.__nlw.view.clock.hourFloat); await p.evaluate((d) => window.__nlw.skip(d), (24 + want - h) % 24); await p.waitForTimeout(600); };
// (the skyline as drawn now: its meshes, whether each is in the camera's sight, its windows' light)
const skyline = (p) => p.evaluate(() => {
  const n = window.__nlw, s = n.skyline;
  if (!s) return null;
  const cam = n.camera; cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  const meshes = s.group.children.map((m) => { if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere(); return { name: m.name, inSight: frustum.intersectsObject(m), tris: m.geometry.attributes.position.count / 3 }; });
  const walls = [...s.materials.values()];
  let band = 0, lobby = 0;
  s.group.traverse((o) => { if (o.name === 'oganiru:crowns') band = o.material.emissiveIntensity; if (o.name === 'oganiru:lobbies') lobby = o.material.emissiveIntensity; });
  return { stats: s.stats(), shown: s.group.visible, inScene: !!s.group.parent, meshes, lit: walls.length ? +walls[0].emissiveIntensity.toFixed(2) : null, share: walls.length ? +walls[0].userData.lit.value.toFixed(3) : null, band: +band.toFixed(2), lobby: +lobby.toFixed(2), cityReady: n.city.ready };
});

const A = await player('Builder');
const B = await player('Walker', { lite: true });
const a = A.page, b = B.page;

// ---- A: the skyline from the town, on the phone, before any of the city near it is built ----
await at(b, 0, 20, Math.PI, undefined, { dist: 8, pitch: 0.02 });
// (the skyline is built once the town is warmed up: on a phone's settings here, drawn in software, that can take many
// minutes, as the land beyond the town does: tools/measure/places.mjs waits up to fifteen for it)
const skylineWait = Date.now();
for (let k = 0; k < 900 && !(await b.evaluate(() => !!window.__nlw.skyline)); k += 1) await b.waitForTimeout(1000);
console.log('the phone\'s skyline built after', Math.round((Date.now() - skylineWait) / 1000), 's', JSON.stringify(await b.evaluate(() => window.__nlw.skylineStats)));
await settle(b, 8);
const fromTown = await skyline(b);
const wantKinds = new Set(OGANIRU_TOWERS.map((t) => t.kind)).size;
check('on the phone, in the middle of the town, the skyline is built (every tower, one mesh for each kind of wall, its lobbies, tops and bands) though nothing of the city near it is', !!fromTown && fromTown.stats.towers === OGANIRU_TOWERS.length && fromTown.stats.kinds === wantKinds && fromTown.meshes.length === wantKinds + 3 && fromTown.inScene && !fromTown.cityReady, fromTown && { stats: fromTown.stats, cityReady: fromTown.cityReady, meshes: fromTown.meshes.length });
check('and, looking west from there, it is in sight', !!fromTown && fromTown.shown && fromTown.meshes.filter((m) => m.name.startsWith('oganiru:towers:')).some((m) => m.inSight), fromTown && fromTown.meshes);
await B.shot('skyline-from-the-town');
await at(a, 0, -300, Math.PI, undefined, { dist: 8, pitch: 0.02 });
for (let k = 0; k < 900 && !(await a.evaluate(() => !!window.__nlw.skyline)); k += 1) await a.waitForTimeout(1000);
await settle(a, 8);
await A.shot('skyline-from-college-road');
// (and the city itself, there in the north of the town 330 m from the habitation, built a piece a frame after the
// warm-up, as everywhere else: until 2 November it waited there for the habitation, which is not built from so far, and
// was built all at once at its gate)
for (let k = 0; k < 900 && !(await a.evaluate(() => window.__nlw.city.ready)); k += 1) await a.waitForTimeout(1000);
const gradual = await a.evaluate(() => { const n = window.__nlw; return { ready: n.city.ready, stats: n.cityStats }; });
check('on a computer in the north of the town, the city is built a piece a frame once the town is warmed up, not all at once at its gate', gradual.ready && gradual.stats.frames > 0 && gradual.stats.builds === 1, gradual);

// ---- B: downtown at its street level ----
await at(a, -120, -588, Math.PI, undefined, { dist: 7, pitch: 0.12, yaw: Math.PI + 0.5 });
await a.evaluate(() => window.__nlw.buildCity());
await settle(a, 8);
const street = await a.evaluate(() => {
  const n = window.__nlw, signs = [], perSign = [], feet = [];
  n.scene.traverse((o) => { if (/^oganiru:signs:/.test(o.name)) signs.push(o.userData.signs || 0); if (o.name === 'oganiru:sign') perSign.push(o.name); if (o.userData && o.userData.towers) feet.push(o.userData.towers); });
  return { sheets: signs.length, signs: signs.reduce((m, k) => m + k, 0), perSign: perSign.length, piecesWithTowers: feet.length, towers: feet.reduce((m, k) => m + k, 0) };
});
const shops = OGANIRU_TOWERS.reduce((m, t) => m + (t.shops || []).length, 0);
await A.shot('a-towers-foot');
// (the whole of downtown's pieces built, from the middle of it)
await at(a, 0, -800, Math.PI);
await a.evaluate(() => window.__nlw.city.buildAround(0, -800));
await settle(a, 6);
const all = await a.evaluate(() => {
  const n = window.__nlw, signs = [], feet = [];
  n.scene.traverse((o) => { if (/^oganiru:signs:/.test(o.name)) signs.push(o.userData.signs || 0); if (o.userData && o.userData.towers) feet.push(o.userData.towers); });
  return { sheets: signs.length, signs: signs.reduce((m, k) => m + k, 0), towers: feet.reduce((m, k) => m + k, 0) };
});
check('downtown\'s pieces draw every tower\'s foot (its canopy, doors, steps), its name over its doors and its shops\' names, each piece\'s signs as one', all.towers === OGANIRU_TOWERS.length && all.signs >= OGANIRU_TOWERS.length + shops && all.sheets >= 1 && all.sheets <= all.signs / 4 && street.perSign === 0, { street, all, shops });
await at(a, -230, -566, -Math.PI / 2, undefined, { dist: 8, pitch: 0.05, yaw: -Math.PI / 2 + 0.35 });
await settle(a, 6);
await A.shot('gateway-boulevard');
await at(a, 0, -930, Math.PI, undefined, { dist: 9, pitch: 0.08, yaw: Math.PI + 0.6 });
await settle(a, 6);
await A.shot('interchange-park');

// ---- D: the radar shows the city's roads under the player ----
await at(a, -6, -700, Math.PI);
await settle(a, 10);
const radar = await a.evaluate(() => {
  const c = document.getElementById('radar-map'); const g = c.getContext('2d');
  const W = c.width, d = g.getImageData(Math.round(W / 2) - 30, Math.round(W / 2) - 30, 60, 60).data;
  let grey = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 200) < 12 && Math.abs(d[i + 1] - 200) < 12 && Math.abs(d[i + 2] - 194) < 12) grey += 1;
  return { grey, of: d.length / 4 };
});
check('the radar in the corner shows the city\'s roads under the player on Unity Avenue', radar.grey > radar.of * 0.05, radar);

// ---- C: the windows at night, more in the evening than late; none by day ----
const day = await skyline(a);
await hourTo(a, 19.5);
await settle(a, 6);
const evening = await skyline(a);
await at(a, -14, -760, -0.6, undefined, { dist: 12, pitch: 0.05 });
await settle(a, 6);
await A.shot('downtown-in-the-evening');
await hourTo(a, 2);
await settle(a, 6);
const late = await skyline(a);
await at(a, 60, -1121.5, 0.3, 7.5, { dist: 9, pitch: 0.02 });
await settle(a, 8);
await A.shot('skyline-from-the-viaduct-late-at-night');
check('by day no window lit; in the evening the towers\' windows lit, more of them than late in the night; the tallest crowns\' bands and the lobbies lit', day.lit === 0 && evening.lit > 1 && late.lit > 1 && evening.share > late.share + 0.1 && evening.band > 1 && evening.lobby > 0.2, { day: [day.lit, day.share], evening: [evening.lit, evening.share, evening.band, evening.lobby], late: [late.lit, late.share] });
await hourTo(b, 21);
await at(b, 0, 20, Math.PI, undefined, { dist: 8, pitch: 0.02 });
await settle(b, 8);
await B.shot('skyline-from-the-town-at-night');
// (in the rain at dusk, as his second video)
await hourTo(a, 18.6);
await a.evaluate(() => { const g = window.__nlw.host.game; g.state.weather = { kind: 'rain', until: g.state.t + 2 * 3600 }; });
await at(a, -6, -660, Math.PI, undefined, { dist: 7, pitch: 0.02, yaw: Math.PI + 0.25 });
await a.waitForTimeout(8000);
await settle(a, 6);
await A.shot('downtown-at-dusk-in-the-rain');
await a.evaluate(() => { const g = window.__nlw.host.game; g.state.weather = { kind: 'clear', until: g.state.t + 12 * 3600 }; });

// ---- F: the phone's graphics card and drawing at the new places, at Medium ----
await b.evaluate(() => { const n = window.__nlw, g = n.governor; g.hold(true); g.set(2, 'measuring'); });
const card = {}, calls = {};
for (const [name, x, z, h, hour] of [['downtown at night', 0, -670, Math.PI, 22], ['Gateway Boulevard at night', -230, -566, -Math.PI / 2, 22], ['Interchange Park', 0, -930, Math.PI, 12], ['the skyline from the town at night', 0, 20, Math.PI, 22]]) {
  await hourTo(b, hour);
  await at(b, x, z, h);
  for (let k = 0; k < 120; k += 1) { const q = await pieces(b); if (!q || q.queued === 0) break; await b.waitForTimeout(1000); }
  await settle(b, 6, 240000);
  await b.waitForTimeout(3000);
  card[name] = await b.evaluate(() => { const g = window.__nlw.graphics || {}; return +(((g.pictures || 0) + (g.buffers || 0)) / 1048576).toFixed(1); });
  calls[name] = await b.evaluate(() => { const n = window.__nlw; return n.drawn ? n.drawn.calls : n.renderer.info.render.calls; });
  await B.shot(name.toLowerCase().replace(/ /g, '-'));
}
check('a phone at Medium holds under 135 MB on its graphics card at every one of the new places', Math.max(...Object.values(card)) < 135, card);
check('and draws no more there than the busiest place in the town (449 draws a frame, the PowerBike showroom at night, measured 2 November)', Math.max(...Object.values(calls)) <= 449, calls);

// ---- E: from inside a hall, the skyline is not drawn ----
await at(a, POWERBIKE.portal.x, POWERBIKE.portal.z + 3.2, Math.PI, undefined, { yaw: Math.PI, pitch: 0.2, dist: 7 });
await a.waitForTimeout(600);
await a.keyboard.down('w');
let inside = false;
for (let i = 0; i < 300 && !inside; i += 1) { await a.waitForTimeout(100); inside = await a.evaluate(() => window.__nlw.showroom.inside); }
await a.keyboard.up('w');
await a.waitForTimeout(2500);
const inHall = await skyline(a);
check('inside PostCivilWar PowerBike\'s hall the skyline is not drawn', inside && inHall && !inHall.shown, { inside, shown: inHall && inHall.shown });

const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nAll ${results.length} checks passed.`);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
