// The sound mix, measured in a headless browser: how loud each group is in
// several places, that nothing clips when the loudest things sound together,
// that music and background step back when they should, and that only so many
// short sounds are started at once; and inside a shut car with glass the town
// heard muffled, clearer once its door opens (5 November 2026). The town's cars,
// heard all over the town since 30 October, are measured at the market as the
// town has them, and taken off its roads for the places compared.
//   node test/sound.mjs [page]
// Needs Playwright with Chromium and a built dist/local.html (or the local page given: another build's, to run the test
// on it in turn with this one's). Not part of the unit tests.
import { pastQuestion, enterTown } from './start.mjs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const here = dirname(fileURLToPath(import.meta.url));
const problems = [];
const seen = {};
const groupsAt = {};
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await (await browser.newContext({ viewport: { width: 320, height: 180 }, deviceScaleFactor: 1 })).newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto('file://' + resolve(process.argv[2] || resolve(here, '../dist/local.html')) + '#nodraw-nointro-gameclock', { timeout: 300000 });
await pastQuestion(page);
await page.fill('#name', 'Loud'); await enterTown(page); await page.waitForTimeout(1500);
// (and how near the nearest of the town's cars on its roads came while it was measured: since 30 October 2026, driving
// or stopped at the roadside, they are heard as other players' are, the nearest three within 120 m: audio.js)
const measure = async (label, seconds = 8) => {
  const r = await page.evaluate(async (secs) => {
    const n = window.__nlw, a = n.audio; const out = []; let peak = 0; const sums = {};
    const T = n.host.game.internals && n.host.game.internals.traffic; let nearest = Infinity, heard = 0;
    // (each reading is of the last few hundredths of a second: read at uneven moments, about twice as often as at first,
    // so that the music's beat does not come round at the same moment of each reading; 6 November 2026)
    const until = performance.now() + secs * 1000;
    while (performance.now() < until) {
      await new Promise((res) => setTimeout(res, 30 + Math.random() * 40)); const s = a.status(); out.push(s.level); peak = Math.max(peak, s.peak); for (const [k, v] of Object.entries(s.groups)) sums[k] = (sums[k] || 0) + v * v;
      const me = n.view.self; let k = 0;
      for (const c of (T && T.cars) || []) if (c.mode === 'drive' || c.mode === 'stop') { const d = Math.hypot(c.x - me.x, c.z - me.z); nearest = Math.min(nearest, d); if (d < 120) k += 1; }
      heard = Math.max(heard, k);
    }
    const mean = Math.sqrt(out.reduce((x, y) => x + y * y, 0) / out.length); const sorted = out.slice().sort((x, y) => x - y);
    const w = n.view.weather;
    return { groups: Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, v > 0 ? Math.round(10 * Math.log10(v / out.length)) : -99])), weather: w.kind, rms: mean, loud: sorted[Math.floor(sorted.length * 0.95)], quiet: sorted[Math.floor(sorted.length * 0.1)], peak, state: a.status().state, stations: a.status().stations.length, voices: a.status().voices, cars: { nearest: Number.isFinite(nearest) ? nearest : null, heard } };
  }, seconds);
  seen[label] = 20 * Math.log10(r.rms || 1e-9);
  groupsAt[label] = r.groups;
  if (r.state !== 'running') problems.push(`the sound is ${r.state}`);
  if (r.peak > 0.5) problems.push(`${label}: peaks at ${(20 * Math.log10(r.peak)).toFixed(1)} dB`);
  const db = (v) => (v > 0 ? (20 * Math.log10(v)).toFixed(1) : '-inf');
  const cars = r.cars.nearest === null ? 'no car of the town\'s on the roads' : `the town's cars: nearest ${r.cars.nearest.toFixed(0)} m, ${r.cars.heard} within 120 m`;
  console.log(label.padEnd(30), 'rms', db(r.rms), 'dB  loud moments', db(r.loud), 'dB  quiet', db(r.quiet), 'peak', db(r.peak), '|', Object.entries(r.groups).filter(([, v]) => v > -90).map(([k, v]) => `${k} ${v}`).join(', '), '|', cars);
};
const go = (x, z, hours = 0, kind = 'clear') => page.evaluate(([px, pz, h, k]) => { if (h) window.__nlw.skip(h); window.__nlw.host.game.state.weather = { kind: k, until: 1e15 }; window.__nlw.place(px, pz); }, [x, z, hours, kind]);
// (no okada going by within 45 m of the dry market: one passing just then is as loud as the rain, and whether one does
// depends on the moment the test gets there, which depends on how fast the machine is)
const quietRoad = () => page.waitForFunction(() => { const n = window.__nlw, s = n.view.self; return ![...n.crowd.bikes()].some((b) => b.truth && b.truth.moving && Math.hypot(b.x - s.x, b.z - s.z) < 45); }, null, { timeout: 60000, polling: 250 }).catch(() => {});

// The market as the town has it by day, its cars on the roads: told, not compared (6 November 2026: since 30 October
// they are heard as other players' are, the nearest three within 120 m, and in town some are always that near: at the
// market about ten, the nearest 50 m off; the edge of town is 37 m from Waterside Road and 32 m from where they stop)
await go(8, 58, 3); await page.waitForTimeout(3000); await quietRoad(); await measure('market, with its traffic');

// Inside a shut car with glass (5 November 2026, the cars brief: "inside a shut car the town's sounds muffled, clearer
// with a door open"): a car of the town's standing at the roadside, made the Grey Saloon (a sample of Stage 2, with
// glass), is taken (one with none of the police within 60 m: a car taken in front of an officer makes its taker a
// prisoner at once); sitting in it with its doors shut, the town's background is heard through the car (audio.js
// `muffle`); getting out, it is clearer once the door is open; and the background is quieter inside than beside it.
let target = null;
for (let k = 0; k < 20 && !target; k += 1) {
  target = await page.evaluate(() => {
    const n = window.__nlw, g = n.host.game, T = g.internals.traffic, pop = g.internals.population, eye = n.view.self, o = {};
    const police = pop.people.filter((q) => q.job === 'police').map((q) => { pop.locate(q.index, g.state.t, o); return { x: o.x, z: o.z, out: o.pose !== 4 }; }).filter((q) => q.out);
    const officer = (c) => Math.min(Infinity, ...police.map((q) => Math.hypot(q.x - c.x, q.z - c.z)));
    const c = T.cars.filter((q) => q.mode === 'stop' && !q.frozen && g.state.real < q.until - 8 && officer(q) > 60).sort((a, b) => Math.hypot(a.x - eye.x, a.z - eye.z) - Math.hypot(b.x - eye.x, b.z - eye.z))[0];
    if (!c) return null;
    c.model = 'grey-saloon'; c.until = g.state.real + 1200;
    return { x: c.x, z: c.z, h: c.h };
  });
  if (!target) await page.waitForTimeout(3000);
}
let inCar = null;
if (!target) problems.push('no car of the town\'s standing at the roadside to take');
else {
  await page.evaluate((t) => { const n = window.__nlw; const x = t.x + Math.sin(t.h) * 4.2, z = t.z + Math.cos(t.h) * 4.2; n.place(x, z); n.face(Math.atan2(t.x - x, t.z - z)); }, target);
  await page.waitForTimeout(3000);
  await page.evaluate(() => { const n = window.__nlw; n.refresh(); n.act('take'); });
  const sat = await page.waitForFunction(() => { const s = window.__nlw.view.self; return s.incar && Number.isInteger(s.incar.taken) && !s.hijack; }, null, { timeout: 120000 }).then(() => true).catch(() => false);
  if (!sat) problems.push('the Grey Saloon was not taken and sat in');
  else {
    await page.waitForTimeout(1500);
    const shut = await page.evaluate(() => window.__nlw.audio.muffled);
    await measure('in a shut Grey Saloon', 6);
    // out: the door opened, the legs swung out, the door pushed shut
    await page.waitForFunction(() => { const p = window.__nlw.prompt(); return !!p && p.short === 'Get out'; }, null, { timeout: 20000 }).catch(() => {});
    const out = await page.evaluate(async () => {
      const n = window.__nlw, p = n.prompt(); if (p) p.run();
      let least = n.audio.muffled; for (let i = 0; i < 40; i += 1) { await new Promise((r) => setTimeout(r, 100)); least = Math.min(least, n.audio.muffled); }
      return { prompt: p && p.text, least };
    });
    await page.waitForFunction(() => !window.__nlw.view.self.incar, null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await measure('beside the Grey Saloon', 6);
    inCar = { shut, out };
    console.log('in the Grey Saloon, its doors shut, muffled', shut, '| getting out', JSON.stringify(out));
  }
}

// The places compared below as their own sounds have them, the town's cars taken off the roads (each car's mode
// 'off' and their step held: the cars as the town has them are measured above).
await page.evaluate(() => { const T = window.__nlw.host.game.internals.traffic; T.tick = () => {}; for (const c of T.cars) if (c.mode === 'drive' || c.mode === 'stop') { c.mode = 'off'; c.v = 0; } });
await go(150, 150); await page.waitForTimeout(3000); await measure('edge of town, dry', 10);
await go(8, 58); await page.waitForTimeout(3000); await quietRoad(); await measure('market, mid-morning');
// (the DJ's music for 16 s at each: its bars and its quiet moments between them come and go, and 8 s of it, one run's
// beside the DJ 4.7 dB quieter than another's, was not enough to say how loud it is there)
await go(44, 47); await page.waitForTimeout(3000); await measure('25 m from the DJ', 16);
await go(44, 26); await page.waitForTimeout(3000); await measure('beside the DJ', 16);
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
if (inCar) {
  if (!(inCar.shut === 1)) problems.push(`in the Grey Saloon with its doors shut the town is not muffled: ${inCar.shut}`);
  if (!(inCar.out.least === 0)) problems.push(`getting out of the Grey Saloon, its door open, the town still muffled: ${JSON.stringify(inCar.out)}`);
  const inside = groupsAt['in a shut Grey Saloon'].ambient, beside = groupsAt['beside the Grey Saloon'].ambient;
  if (!(inside <= beside - 3)) problems.push(`the town's background inside the shut Grey Saloon (${inside} dB) is not at least 3 dB quieter than beside it (${beside} dB)`);
}
if (seen['edge of town, dry'] > -38) problems.push(`the quietest place is not quiet: ${seen['edge of town, dry'].toFixed(1)} dB`);
if (burst.peak > 0.6) problems.push(`the loudest things together peak at ${(20 * Math.log10(burst.peak)).toFixed(1)} dB`);
if (!(burst.ducked.music < 0.5 && burst.ducked.ambient < 0.8)) problems.push(`music and background did not step back: ${JSON.stringify(burst.ducked)}`);
if (!(many.started <= 3 && many.refused >= 27)) problems.push(`thirty blows at once started ${many.started}`);
for (const p of problems) console.log('PROBLEM', p);
console.log(problems.length ? 'sound: FAILURES' : 'sound: ok');
process.exit(problems.length ? 1 : 0);
