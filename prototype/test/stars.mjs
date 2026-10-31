// The police's stars on the screen (30 October 2026, the owner's brief: "That star is for the police. The star
// increases as you commit crime", src/sim/justice.js STARS), played in a headless browser:
//  A  not wanted: no stars; a fight no officer saw (31 October 2026, the owner's word: "If police is out of sight,
//     don't count it as crime"): still none
//  B  a fight an officer on the scene saw: one star of five, filled, at the top right under the time
//  C  running on after being told to stop: two
//  D  out of every officer's sight with nobody on the way: they blink while one fades, and go one at a time; at none,
//     no stars and not wanted
//  E  at the wheel and on foot alike (the stars are part of the screen in every mode)
//   node test/stars.mjs [shots folder]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pastQuestion, enterTown, officerOnScene } from './start.mjs';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || '/tmp/stars-shots';
mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); };
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const context = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const page = await context.newPage();
page.setDefaultTimeout(300000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`file://${resolve(root, 'dist/local.html')}#nointro-gameclock-lite`, { timeout: 300000 });
await pastQuestion(page);
await page.fill('#name', 'Star Look').catch(() => {});
await enterTown(page, { tap: true });
await page.waitForFunction(() => window.__nlw.me && window.__nlw.me.mixer, null, { timeout: 240000 });
await page.evaluate(() => { const n = window.__nlw, g = n.host.game; const hour = n.view.clock.hourFloat; n.skip((24 + 10.5 - hour) % 24); g.state.weather = { kind: 'clear', until: g.state.t + 24 * 3600 }; for (const id of ['toasts', 'notices']) { const t = document.getElementById(id); if (t) t.style.display = 'none'; } });
await page.waitForTimeout(2000);
const stars = () => page.evaluate(() => {
  const el = document.getElementById('stars'), law = window.__nlw.view.self.law;
  const r = el.getBoundingClientRect(), clock = document.getElementById('hud-clock').getBoundingClientRect();
  return { shown: !el.hidden && r.width > 0, on: [...el.children].filter((s) => s.classList.contains('on')).length, of: el.children.length, fading: el.classList.contains('fading'), label: el.getAttribute('aria-label'), state: law.state, stars: law.stars, right: Math.round(innerWidth - r.right), belowClock: r.top >= clock.bottom - 1, chip: !document.getElementById('lawchip').hidden };
});
const settle = () => page.waitForTimeout(900);

// ---- A
let s = await stars();
check('A: not wanted, no stars', !s.shown && s.state === 'normal', s);

// ---- A: a fight out of every officer's sight (the simulation's own offence, where no officer is within sight of it)
const unseen = await page.evaluate(() => {
  const n = window.__nlw, g = n.host.game, J = g.internals.justice, A = g.internals.actors, pop = g.internals.population, p = g.state.players[n.playerId];
  // (the player put there at once, in the town as on the screen: the town's own word of where they are follows the
  // page's only at its next step, and the fight is where they are now)
  const X = 150, Z = -200;
  n.place(X, Z); p.x = X; p.z = Z;
  // (any officer whose beat has her near just now sent along it a way off, for this)
  const away = [];
  for (const q of pop.people) {
    if (q.job !== 'police') continue;
    const at = pop.locate(q.index, g.state.t, {});
    if (at.pose === 4 || Math.hypot(at.x - X, at.z - Z) >= 60) continue;
    if (!A.has(q.index) && !A.take(q.index, g.state.t, { x: X + 200, z: Z })) continue;
    const m = A.get(q.index); m.x = X + 200; m.z = Z; A.hold(q.index, 'Elsewhere', 0, 0); away.push(q.index);
  }
  // (someone of the town's who is not one of the police: an officer it was done to has seen it, wherever she is)
  const victim = pop.people.find((q) => q.job !== 'police').index;
  const c = J.offence(p, 'assault', { victim: { kind: 'npc', id: victim, name: 'Someone' }, x: X, z: Z });
  window.__away = away;
  return { id: c.id, detection: g.state.justice.crimes[c.id].detection, witnesses: g.state.justice.crimes[c.id].witnesses.length };
});
await page.waitForTimeout(8000);
s = await stars();
check('A: a fight no officer saw: no stars, not wanted', unseen.detection === 'unseen' && unseen.witnesses === 0 && !s.shown && s.state === 'normal', { unseen, s });
await page.evaluate(() => { const A = window.__nlw.host.game.internals.actors; for (const i of window.__away || []) A.release(i); window.__nlw.place(0, 40); });
await page.waitForTimeout(1500);

// ---- B: a fight the police know of: an officer on the scene saw it (the simulation's own offence, with one of the
// town's officers brought to stand in sight of it)
const at = await page.evaluate(() => { const n = window.__nlw, p = n.host.game.state.players[n.playerId]; return [p.x, p.z]; });
const officer = await officerOnScene(page, at[0], at[1], 12);
check('B: an officer of the town\'s in sight of the player', officer !== null, officer);
await page.evaluate(() => {
  const n = window.__nlw, g = n.host.game, J = g.internals.justice, p = g.state.players[n.playerId];
  const victim = g.internals.population.people.find((q) => q.job !== 'police').index;
  J.offence(p, 'assault', { victim: { kind: 'npc', id: victim, name: 'Someone' }, x: p.x, z: p.z });
});
await page.waitForFunction(() => window.__nlw.view.self.law.stars >= 1, null, { timeout: 60000 });
await settle();
s = await stars();
await page.screenshot({ path: resolve(out, 'b-one-star.png') });
check('B: a fight the police know of: one star of five filled, at the top right under the time, in place of the old chip', s.shown && s.on === 1 && s.of === 5 && s.right < 40 && s.belowClock && !s.chip && /1 star/.test(s.label), s);

// ---- C: running on after being told to stop
await page.evaluate(() => { const n = window.__nlw, g = n.host.game, J = g.internals.justice, p = g.state.players[n.playerId]; J.offence(p, 'resisting', { victim: { kind: 'npc', id: 0, name: 'An officer' }, x: p.x, z: p.z }); });
await page.waitForFunction(() => window.__nlw.view.self.law.stars >= 2, null, { timeout: 60000 });
await settle();
s = await stars();
await page.screenshot({ path: resolve(out, 'c-two-stars.png') });
check('C: running on after being told to stop: two stars', s.shown && s.on === 2, s);

// ---- E: in a car the stars are there too
await page.evaluate(() => { const n = window.__nlw; n.server.send({ type: 'cars.owned', cars: ['white-roadster'] }); });
await page.waitForTimeout(500);
const inCar = await page.evaluate(() => { const n = window.__nlw; n.place(0, 60); return n.driveCar('white-roadster').ok; });
await settle();
s = await stars();
await page.screenshot({ path: resolve(out, 'e-in-a-car.png') });
check('E: at the wheel the stars are on the screen as well', inCar && s.shown && s.on === 2, { inCar, s });
await page.evaluate(() => window.__nlw.leaveCar());

// ---- D: out of sight, nobody coming: they blink and go one at a time
await page.evaluate(() => {
  const n = window.__nlw, g = n.host.game, J = g.internals.justice;
  // every officer sent back to her beat, the player somewhere nobody can see them
  for (const o of Object.values(g.state.justice.officers)) { delete g.state.justice.officers[o.i]; if (g.internals.actors.has(o.i)) g.internals.actors.release(o.i); }
  n.place(150, -200);
  void J;
});
const seen = [];
let blinked = false;
const t0 = Date.now();
while (Date.now() - t0 < 240000) {
  await page.evaluate(() => { window.__nlw.place(150, -200); const g = window.__nlw.host.game; for (const o of Object.values(g.state.justice.officers)) { delete g.state.justice.officers[o.i]; if (g.internals.actors.has(o.i)) g.internals.actors.release(o.i); } });
  s = await stars();
  seen.push(s.on);
  if (s.fading && s.shown) { blinked = true; if (!(await page.evaluate(() => !!window.__blinkShot))) { await page.evaluate(() => { window.__blinkShot = true; }); await page.screenshot({ path: resolve(out, 'd-fading.png') }); } }
  if (s.state === 'normal') break;
  await page.waitForTimeout(1500);
}
check('D: out of sight with nobody coming, the stars blink while one fades', blinked, { seen: [...new Set(seen)] });
check('D: they go one at a time, and at none no stars and no longer wanted', seen.includes(2) && seen.includes(1) && s.state === 'normal' && !s.shown, { seen: [...new Set(seen)], last: s });
check('nothing went wrong in the page', errors.length === 0, errors);
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nAll ${results.length} checks passed.`);
await browser.close();
process.exit(failed ? 1 : 0);
