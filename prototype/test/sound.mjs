// The sound mix, measured in a headless browser: how loud each group is in
// several places, that nothing clips when the loudest things sound together,
// that music and background step back when they should, and that only so many
// short sounds are started at once.
//   node test/sound.mjs
// Needs Playwright with Chromium and a built dist/local.html. Not part of the unit tests.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const here = dirname(fileURLToPath(import.meta.url));
const problems = [];
const seen = {};
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await (await browser.newContext({ viewport: { width: 320, height: 180 }, deviceScaleFactor: 1 })).newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto('file://' + resolve(here, '../dist/local.html') + '#nodraw-nointro', { timeout: 300000 });
await page.fill('#name', 'Loud'); await page.click('#enter'); await page.waitForTimeout(1500);
const measure = async (label, seconds = 8) => {
  const r = await page.evaluate(async (secs) => {
    const a = window.__nlw.audio; const out = []; let peak = 0; const sums = {};
    for (let i = 0; i < secs * 10; i += 1) { await new Promise((res) => setTimeout(res, 100)); const s = a.status(); out.push(s.level); peak = Math.max(peak, s.peak); for (const [k, v] of Object.entries(s.groups)) sums[k] = (sums[k] || 0) + v * v; }
    const mean = Math.sqrt(out.reduce((x, y) => x + y * y, 0) / out.length); const sorted = out.slice().sort((x, y) => x - y);
    const w = window.__nlw.view.weather;
    return { groups: Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, v > 0 ? Math.round(10 * Math.log10(v / out.length)) : -99])), weather: w.kind, rms: mean, loud: sorted[Math.floor(sorted.length * 0.95)], quiet: sorted[Math.floor(sorted.length * 0.1)], peak, state: a.status().state, stations: a.status().stations.length, voices: a.status().voices };
  }, seconds);
  seen[label] = 20 * Math.log10(r.rms || 1e-9);
  if (r.state !== 'running') problems.push(`the sound is ${r.state}`);
  if (r.peak > 0.5) problems.push(`${label}: peaks at ${(20 * Math.log10(r.peak)).toFixed(1)} dB`);
  const db = (v) => (v > 0 ? (20 * Math.log10(v)).toFixed(1) : '-inf');
  console.log(label.padEnd(30), 'rms', db(r.rms), 'dB  loud moments', db(r.loud), 'dB  quiet', db(r.quiet), 'peak', db(r.peak), '|', Object.entries(r.groups).filter(([, v]) => v > -90).map(([k, v]) => `${k} ${v}`).join(', '));
};
const go = (x, z, hours = 0, kind = 'clear') => page.evaluate(([px, pz, h, k]) => { if (h) window.__nlw.skip(h); window.__nlw.host.game.state.weather = { kind: k, until: 1e15 }; window.__nlw.place(px, pz); }, [x, z, hours, kind]);
await go(150, 150, 3); await page.waitForTimeout(3000); await measure('edge of town, dry', 10);
await go(8, 58); await page.waitForTimeout(3000); await measure('market, mid-morning');
await go(44, 47); await page.waitForTimeout(3000); await measure('25 m from the DJ');
await go(44, 26); await page.waitForTimeout(3000); await measure('beside the DJ');
await go(-50, 74); await page.waitForTimeout(3000); await measure('motor park radio');
await go(-78, -166); await page.waitForTimeout(3000); await measure('building yard');
await go(-131, 46); await page.waitForTimeout(3000); await measure('hospital generator');
await go(0, 60); await page.keyboard.down('Shift'); await page.keyboard.down('w'); await page.waitForTimeout(1000); await measure('running up the road', 6); await page.keyboard.up('w'); await page.keyboard.up('Shift');
await go(8, 58, 0, 'rain'); await page.waitForTimeout(3500); await measure('market in rain');
await go(8, 58, 0, 'clear');
await page.evaluate(() => { const g = window.__nlw.host.game; const id = Object.keys(g.state.vehicles.list).find((k) => g.state.vehicles.list[k].kind === 'keke'); const v = g.state.vehicles.list[id]; v.hire = { playerId: window.__nlw.playerId, until: 1e12 }; v.fuel = v.fuel || 5; window.__nlw.place(v.x + 1.6, v.z); });
await page.waitForTimeout(800); await page.keyboard.press('e'); await page.waitForTimeout(800);
await page.evaluate(() => window.__nlw.park(0, 40, Math.PI)); await page.keyboard.down('w'); await page.waitForTimeout(1500); await measure('driving a keke', 6); await page.keyboard.up('w');
await page.keyboard.press('e'); await page.waitForTimeout(500);
await go(8, 58, 10); await page.waitForTimeout(3000); await measure('market, night');
// the loudest things: a heavy blow, the whistle, a horn, the phone ringing, all at once beside the DJ
await go(44, 26, 12); await page.waitForTimeout(3000);
const burst = await page.evaluate(async () => { const a = window.__nlw.audio; const v = window.__nlw.view.self; let peak = 0; a.blow('heavy'); a.whistle(v.x + 3, v.z); a.horn(); a.chime('ring'); for (let i = 0; i < 30; i += 1) { await new Promise((r) => setTimeout(r, 30)); peak = Math.max(peak, a.status().peak); } return { peak, ducked: a.status().ducked }; });
console.log('everything loud at once: peak', (20 * Math.log10(burst.peak)).toFixed(1), 'dB', JSON.stringify(burst.ducked));
// voice limits: thirty blows asked for in one moment
const many = await page.evaluate(() => { const a = window.__nlw.audio; const before = a.status().voices; for (let i = 0; i < 30; i += 1) a.blow('punch'); const after = a.status().voices; return { started: after.started - before.started, refused: after.refused - before.refused, sounding: after.short }; });
console.log('thirty blows at once:', JSON.stringify(many));


await browser.close();
const louder = (a, b, by) => { if (!(seen[a] - seen[b] >= by)) problems.push(`"${a}" should be at least ${by} dB louder than "${b}" (${seen[a].toFixed(1)} against ${seen[b].toFixed(1)})`); };
louder('beside the DJ', '25 m from the DJ', 4);        // a loudspeaker fades with distance
louder('beside the DJ', 'edge of town, dry', 6);
louder('market in rain', 'market, mid-morning', 5);
louder('driving a keke', 'market, mid-morning', 8);
if (seen['edge of town, dry'] > -38) problems.push(`the quietest place is not quiet: ${seen['edge of town, dry'].toFixed(1)} dB`);
if (burst.peak > 0.6) problems.push(`the loudest things together peak at ${(20 * Math.log10(burst.peak)).toFixed(1)} dB`);
if (!(burst.ducked.music < 0.5 && burst.ducked.ambient < 0.8)) problems.push(`music and background did not step back: ${JSON.stringify(burst.ducked)}`);
if (!(many.started <= 3 && many.refused >= 27)) problems.push(`thirty blows at once started ${many.started}`);
for (const p of problems) console.log('PROBLEM', p);
console.log(problems.length ? 'sound: FAILURES' : 'sound: ok');
process.exit(problems.length ? 1 : 0);
