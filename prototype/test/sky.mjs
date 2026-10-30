// The sky the player chooses (30 October 2026, the owner's brief: "users to be able to choose the weather of their game.
// The game should be able to use the real time weather as default but users can choose to change the settings, maybe
// morning, noon, dusk or night, rainy or whatever"): Settings, Time and weather. Played in a headless browser:
//  A  Settings has the two rows of choices, Real time and Real weather pressed to begin with
//  B  at the town's late morning, Night chosen: the sky is a night sky (dark, the stars out, the lamps lit), the
//     buttons' rings white; the town's own clock and its people's day not moved
//  C  Rain chosen: rain falling and the ground wet in the picture, the corner of the screen saying Rain; the town's own
//     weather not changed (the roads' grip and the people's day keep it)
//  D  Dusk, Morning, Noon: the sun where each puts it; Storm: the storm's dark sky
//  E  back to Real time and Real weather: the town's own again; the choice kept with the settings on this device
//   node test/sky.mjs [shots folder]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pastQuestion, enterTown } from './start.mjs';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || '/tmp/sky-shots';
mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); };
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 560 } });
page.setDefaultTimeout(300000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`file://${resolve(root, 'dist/local.html')}#nointro-gameclock`, { timeout: 300000 });
await pastQuestion(page);
await page.fill('#name', 'Sky Look').catch(() => {});
await enterTown(page);
await page.waitForFunction(() => window.__nlw.me && window.__nlw.me.mixer, null, { timeout: 240000 });
// late morning, clear, out on the boulevard
await page.evaluate(() => { const n = window.__nlw, g = n.host.game; const hour = n.view.clock.hourFloat; n.skip((24 + 10.5 - hour) % 24); g.state.weather = { kind: 'clear', until: g.state.t + 24 * 3600 }; n.place(0, 20); n.face(0); n.cam.yaw = 0; });
await page.waitForTimeout(3000);
const frames = async (k = 4) => { await page.evaluate(() => { if (window.__frames === undefined) { window.__frames = 0; const f = () => { window.__frames += 1; requestAnimationFrame(f); }; requestAnimationFrame(f); } }); const f0 = await page.evaluate(() => window.__frames); await page.waitForFunction(([a, k]) => window.__frames >= a + k, [f0, k], { timeout: 120000 }).catch(() => {}); };
const seen = () => page.evaluate(() => {
  const n = window.__nlw, s = n.sky.state();
  return { night: +n.night.toFixed(2), sunUp: s.sunUp, cover: s.cover, wet: s.wetness, stars: s.stars, word: document.getElementById('hud-weather').textContent, rings: document.getElementById('touch').classList.contains('night'), townHour: +n.view.clock.hourFloat.toFixed(2), townWeather: n.view.weather.kind, clock: document.getElementById('hud-clock').textContent };
});

// ---- A: Settings
await page.evaluate(() => window.__nlw.ui.openPhone('settings'));
await page.waitForSelector('#sky-time-of-day', { timeout: 60000 });
await page.waitForTimeout(400);
const panel = await page.evaluate(() => {
  const group = (id) => { const g = document.getElementById(id); return g ? [...g.querySelectorAll('button')].map((b) => [b.dataset.sky, b.textContent, b.getAttribute('aria-pressed')]) : null; };
  return { time: group('sky-time-of-day'), weather: group('sky-weather'), note: (document.getElementById('sky-note') || {}).textContent || '' };
});
check('A: Settings has Time of day (Real time, Morning, Noon, Dusk, Night) and Weather (Real weather, Clear, Cloudy, Rain, Storm), the real ones pressed', !!panel.time && !!panel.weather && panel.time.map((b) => b[0]).join() === 'real,morning,noon,dusk,night' && panel.weather.map((b) => b[0]).join() === 'real,clear,cloudy,rain,storm' && panel.time[0][2] === 'true' && panel.weather[0][2] === 'true' && /real/i.test(panel.note), panel);
await page.screenshot({ path: resolve(out, 'a-settings.png') });
// the choice made by pressing it, as a player would
await page.click('#sky-time-of-day button[data-sky="night"]');
await page.waitForTimeout(300);
const pressed = await page.evaluate(() => [...document.querySelectorAll('#sky-time-of-day button')].map((b) => b.getAttribute('aria-pressed')).join());
check('A: pressing Night marks it chosen', pressed === 'false,false,false,false,true', pressed);
await page.evaluate(() => window.__nlw.ui.close());
await page.waitForTimeout(400);

// ---- B: night, at the town's late morning
const before = await page.evaluate(() => ({ hour: window.__nlw.view.clock.hourFloat, spot: window.__nlw.host.game.state.t }));
await frames(8); await page.waitForTimeout(2500); await frames(4);
const night = await seen();
await page.screenshot({ path: resolve(out, 'b-night.png') });
check('B: Night chosen at the town\'s late morning: a night sky, the lamps lit, the buttons\' rings white', night.night > 0.7 && night.rings === true, night);
check('B: the town\'s own clock and day not moved (it is still late morning in the town)', night.townHour > 10 && night.townHour < 12 && night.townWeather === 'clear', { night, before });

// ---- C: rain
await page.evaluate(() => window.__nlw.setSky({ time: 'noon', weather: 'rain' }));
await frames(8); await page.waitForTimeout(4000); await frames(4);
const rain = await seen();
await page.screenshot({ path: resolve(out, 'c-rain.png') });
check('C: Rain chosen: the sky covered and the ground wet in the picture, the corner of the screen says Rain', rain.cover > 0.6 && rain.wet > 0.1 && rain.word === 'Rain' && rain.night < 0.2, rain);
check('C: the town\'s own weather not changed', rain.townWeather === 'clear', rain);

// ---- D: the other times, and the storm
const at = {};
for (const time of ['dusk', 'morning', 'noon']) {
  await page.evaluate((time) => window.__nlw.setSky({ time, weather: 'clear' }), time);
  await frames(6); await page.waitForTimeout(2500); await frames(3);
  at[time] = await seen();
  await page.screenshot({ path: resolve(out, `d-${time}.png`) });
}
check('D: dusk low and dim, morning and noon full day (the sun up, no night)', at.dusk.night < 0.8 && at.morning.night < 0.05 && at.noon.night < 0.05 && at.dusk.sunUp < at.noon.sunUp && at.morning.sunUp < at.noon.sunUp, at);
await page.evaluate(() => window.__nlw.setSky({ time: 'noon', weather: 'storm' }));
await frames(8); await page.waitForTimeout(4000); await frames(3);
const storm = await seen();
await page.screenshot({ path: resolve(out, 'd-storm.png') });
check('D: Storm: the sky all covered, the corner says Storm', storm.cover > 0.8 && storm.word === 'Storm', storm);

// ---- E: back to real, and kept
const kept = await page.evaluate(() => { for (const k of Object.keys(localStorage)) { try { const v = JSON.parse(localStorage.getItem(k)); if (v && typeof v === 'object' && 'skyTime' in v) return v; } catch (e) { /* not this one */ } } return null; });
check('E: the choice is kept with the settings on this device', !!kept && kept.skyTime === 'noon' && kept.skyWeather === 'storm', kept ? { skyTime: kept.skyTime, skyWeather: kept.skyWeather } : null);
await page.evaluate(() => window.__nlw.setSky({ time: 'real', weather: 'real' }));
await frames(8); await page.waitForTimeout(3000); await frames(3);
const real = await seen();
check('E: back to Real time and Real weather: the town\'s own late morning, clear', real.night < 0.05 && real.word === 'Clear', real);
check('nothing went wrong in the page', errors.length === 0, errors);
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nAll ${results.length} checks passed.`);
await browser.close();
process.exit(failed ? 1 : 0);
