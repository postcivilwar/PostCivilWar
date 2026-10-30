// The town's people walk facing the way they go (30 October 2026, the owner: "the NPC are walking sideways ... they walk
// with their sides"; his figures face +x as made, and are turned to face +z as they are built, glb.js `figure`): the
// game played on the website on this machine, late morning, at five busy places; for each townsperson drawn as their own
// figure and on the move, which way the body faces (from the hips: the left thigh against the right) against which way
// it is going over the ground, frame by frame. A figure walking with its side to the way it goes is 90 degrees out.
//   ../server/with-postgres.sh node test/npc-walk.mjs [shots folder] [phone]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { createDevServer } = await import(resolve(ROOT, 'server/dev.mjs'));
const { pastQuestion, enterTown } = await import(resolve(ROOT, 'prototype/test/start.mjs'));
const out = resolve(process.argv[2] || '/tmp/npc-walk-shots'); mkdirSync(out, { recursive: true });
const PHONE = process.argv[3] === 'phone';
const server = createDevServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext(PHONE ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, serviceWorkers: 'block' } : { viewport: { width: 1100, height: 620 }, serviceWorkers: 'block' });
const page = await context.newPage();
page.setDefaultTimeout(900000);
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
await page.goto(`${origin}/#gameclock${PHONE ? '-lite' : ''}`, { timeout: 900000 });
await page.waitForSelector('#cover-play', { state: 'visible', timeout: 900000 });
await page.evaluate(() => document.getElementById('cover-play').click());
await page.waitForSelector('#open-signup', { state: 'visible', timeout: 900000 });
await page.click('#open-signup');
await page.fill('#account-username', `Walk_${Math.random().toString(36).slice(2, 7)}`);
await page.fill('#account-password', 'a password for walking');
await page.click('#account-submit');
await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 180000 });
await pastQuestion(page);
await page.fill('#name', 'Walk');
await enterTown(page, { tap: PHONE, wait: 900000 });
await page.waitForFunction(() => window.__nlw.me && window.__nlw.me.mixer, null, { timeout: 300000 });
await page.evaluate(() => { const n = window.__nlw, g = n.host.game; const hour = n.view.clock.hourFloat; n.skip(((24 + 10.5 - hour) % 24)); g.state.weather = { kind: 'clear', until: g.state.t + 24 * 3600 }; for (const id of ['toasts', 'notices']) { const t = document.getElementById(id); if (t) t.style.display = 'none'; } });
// watch every figure drawn of the town's people, every frame, in the page
await page.evaluate(() => {
  const n = window.__nlw;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const a = V(), b = V();
  const angle = (x1, z1, x2, z2) => { let d = Math.atan2(x1, z1) - Math.atan2(x2, z2); while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
  window.__walk = { rows: [], last: new Map() };
  const f = () => {
    for (const actor of n.crowd.actors()) {
      const r = actor.rig;
      if (!r || !r.bones || !r.animated) continue;
      const was = window.__walk.last.get(actor.i);
      const gx = r.group.position.x, gz = r.group.position.z;
      window.__walk.last.set(actor.i, { x: gx, z: gz });
      if (!was) continue;
      const mx = gx - was.x, mz = gz - was.z, moved = Math.hypot(mx, mz);
      if (moved < 0.01 || moved > 1) continue;
      const tl = r.bones.get('thigh_l'), tr = r.bones.get('thigh_r');
      const ul = r.bones.get('upperarm_l'), ur = r.bones.get('upperarm_r');
      if (!tl || !tr) continue;
      tl.getWorldPosition(a); tr.getWorldPosition(b);
      const lx = a.x - b.x, lz = a.z - b.z;                 // the body's left, from the right hip to the left
      const hipsFwd = [-lz, lx];
      let chestFwd = null;
      if (ul && ur) { ul.getWorldPosition(a); ur.getWorldPosition(b); chestFwd = [-(a.z - b.z), a.x - b.x]; }
      const y = r.group.rotation.y;
      const playing = r.mixer ? r.mixer._actions.filter((x) => x.isRunning() && x.getEffectiveWeight() > 0.5).map((x) => x._clip.name).join('+') : '';
      window.__walk.rows.push({ i: actor.i, fig: r.spec ? r.spec.id : r.figure, clip: playing, hipsVsMove: +angle(hipsFwd[0], hipsFwd[1], mx, mz).toFixed(2), chestVsMove: chestFwd ? +angle(chestFwd[0], chestFwd[1], mx, mz).toFixed(2) : null, turnedVsMove: +angle(Math.sin(y), Math.cos(y), mx, mz).toFixed(2), speed: +(moved).toFixed(3), pose: actor.pose, h: +actor.h.toFixed(2), th: +actor.th.toFixed(2) });
      if (window.__walk.rows.length > 20000) window.__walk.rows.shift();
    }
    requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
});
const PLACES = [['market', 43, 60], ['park', -40, 92], ['boulevard', 0, 20], ['waterside', 30, 128], ['registry', 20, -45]];
const shots = [];
for (const [name, x, z] of PLACES) {
  await page.evaluate(([x, z]) => { const n = window.__nlw; n.place(x, z); n.cam.dist = 7; n.cam.pitch = 0.35; }, [x, z]);
  await page.waitForTimeout(PHONE ? 60000 : 40000);
  await page.screenshot({ path: resolve(out, `${name}.png`) });
  shots.push(name);
  console.log('at', name, await page.evaluate(() => ({ rows: window.__walk.rows.length, rigs: window.__nlw.crowd.stats.rigs })));
}
const rows = await page.evaluate(() => window.__walk.rows);
writeFileSync(resolve(out, 'walk.json'), JSON.stringify(rows));
// by figure and clip: how far off the way they go the hips and the chest face, and the figure is turned
const by = {};
for (const r of rows) {
  const k = `${r.fig} ${r.clip}`;
  const e = by[k] || (by[k] = { n: 0, hips: 0, chest: 0, turned: 0, hipsMax: 0 });
  e.n += 1; e.hips += Math.abs(r.hipsVsMove); e.chest += Math.abs(r.chestVsMove || 0); e.turned += Math.abs(r.turnedVsMove); e.hipsMax = Math.max(e.hipsMax, Math.abs(r.hipsVsMove));
}
const table = Object.entries(by).map(([k, e]) => [k, e.n, +(e.hips / e.n * 57.3).toFixed(0), +(e.chest / e.n * 57.3).toFixed(0), +(e.turned / e.n * 57.3).toFixed(0), +(e.hipsMax * 57.3).toFixed(0)]).sort((a, b) => b[2] - a[2]);
console.log('figure clip | frames | hips off the way (deg, mean) | chest | turned | hips worst');
for (const t of table) console.log(JSON.stringify(t));
writeFileSync(resolve(out, 'table.json'), JSON.stringify(table, null, 1));
// judged on the walks proper (a figure turning a corner or stepping round someone is briefly off the way it goes)
const walking = rows.filter((r) => /stroll|catwalk|bold|walk/.test(r.clip) && r.speed > 0.02);
const off = walking.map((r) => Math.abs(r.hipsVsMove) * 57.3).sort((a, b) => a - b);
const median = off.length ? off[Math.floor(off.length / 2)] : null;
const sideways = off.filter((d) => d > 60).length / Math.max(1, off.length);
const figures = new Set(walking.map((r) => r.fig));
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); };
check('townspeople were seen walking, drawn as their own figures, of several kinds', walking.length > 200 && figures.size >= 4, { frames: walking.length, figures: [...figures] });
check('walking, the body faces the way it goes: half the frames within 15 degrees, and fewer than one in twenty more than 60 degrees out (sideways)', median !== null && median < 15 && sideways < 0.05, { median: median && +median.toFixed(1), sideways: +sideways.toFixed(3) });
await browser.close(); server.close();
const passed = results.filter(Boolean).length;
console.log(passed === results.length ? `All ${results.length} checks passed.` : `${passed} of ${results.length} checks passed.`);
process.exit(passed === results.length ? 0 : 1);
