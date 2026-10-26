// What a change of graphics level costs a phone while playing (the owner's brief of 26 October 2026: the game hung on
// his phones): on a phone's settings (#lite, an iPhone's screen, the processor slowed four times), in the town at the
// motor park, each change Auto can make (Medium to High and back, Medium to Low and back), and then a drawing surface
// taken away and given back: how long the page's main thread was busy in the seconds after it, its longest task, the
// programs compiled, the pictures made again (and how long until the last was made), and the memory before and after.
//   ../server/with-postgres.sh node tools/measure/level-steps.mjs <out folder> [site folder]
// STEPS_DPR (3), STEPS_THROTTLE (4), STEPS_LABEL (names the output)
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, existsSync, statSync, createReadStream, readFileSync, readdirSync } from 'node:fs';
import { resolve, extname, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const { pastQuestion } = await import(`${ROOT}/prototype/test/start.mjs`);
const out = resolve(process.argv[2] || '/tmp/steps'); mkdirSync(out, { recursive: true });
const SITE = resolve(process.argv[3] || `${ROOT}/prototype/dist/site`);
const DPR = Number(process.env.STEPS_DPR) > 0 ? Number(process.env.STEPS_DPR) : 3;
const THROTTLE = Number(process.env.STEPS_THROTTLE) > 0 ? Number(process.env.STEPS_THROTTLE) : 4;
const LABEL = process.env.STEPS_LABEL || 'steps';
const game = require(`${ROOT}/api/game.js`);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
const server = createServer((req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  if (path === '/api/game') { game(req, res); return; }
  const file = resolve(SITE, `.${path === '/' ? '/index.html' : path}`);
  if (!(file === SITE || file.startsWith(SITE + sep)) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('Not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Content-Length': statSync(file).size, 'Cache-Control': 'no-cache' });
  if (req.method === 'HEAD') { res.end(); return; }
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;
const TAG = `steps${Date.now().toString(36)}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--autoplay-policy=no-user-gesture-required', `--steps-tag=${TAG}`] });
// the page's process and the graphics process, their private memory in MB (Linux: /proc), looked at four times a second
// for the highest each step reaches
const cmdline = (pid) => { try { return readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0'); } catch (e) { return null; } };
const parentOf = (pid) => { try { const s = readFileSync(`/proc/${pid}/stat`, 'utf8'); return Number(s.slice(s.lastIndexOf(')') + 2).split(' ')[1]); } catch (e) { return null; } };
const pids = () => readdirSync('/proc').filter((d) => /^\d+$/.test(d)).map(Number);
const top = pids().find((p) => { const c = cmdline(p); return c && c.some((a) => a === `--steps-tag=${TAG}`) && !c.some((a) => a.startsWith('--type=')); });
function procMemory() {
  const kids = new Map();
  for (const p of pids()) { const pp = parentOf(p); if (pp) { if (!kids.has(pp)) kids.set(pp, []); kids.get(pp).push(p); } }
  let page = 0, gpu = 0; const stack = [top];
  while (stack.length) {
    const p = stack.pop(); if (!p) continue; for (const k of kids.get(p) || []) stack.push(k);
    const c = cmdline(p); if (!c) continue;
    const type = (/--type=(\S+)/.exec(c.join(' ')) || [])[1] || 'browser';
    let m; try { m = readFileSync(`/proc/${p}/smaps_rollup`, 'utf8'); } catch (e) { continue; }
    const field = (name) => { const r = new RegExp(`^${name}:\\s+(\\d+) kB`, 'm').exec(m); return r ? Number(r[1]) : 0; };
    const priv = (field('Private_Clean') + field('Private_Dirty')) / 1024;
    if (type === 'renderer') page = Math.max(page, priv); else if (type === 'gpu-process') gpu += priv;
  }
  return { page: +page.toFixed(1), gpu: +gpu.toFixed(1), sum: +(page + gpu).toFixed(1) };
}
let peak = null;
setInterval(() => { try { const m = procMemory(); if (peak) { for (const k of Object.keys(m)) peak[k] = Math.max(peak[k], m[k]); } } catch (e) { /* looked at again */ } }, 250);
const context = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
const page = await context.newPage();
page.setDefaultTimeout(900000);
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
const cdp = await context.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
await cdp.send('Performance.enable');
const metrics = async () => { const { metrics: list } = await cdp.send('Performance.getMetrics'); return Object.fromEntries(list.map((x) => [x.name, x.value])); };
await page.addInitScript(() => {
  window.__steps = { long: [] };
  try { new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__steps.long.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch (e) { /* not here */ }
});
await page.goto(`${origin}/#gameclock-lite`, { timeout: 900000 });
await page.waitForSelector('#cover-play', { state: 'visible', timeout: 900000 });
await page.evaluate(() => document.getElementById('cover-play').click());
await page.waitForSelector('#open-signup', { state: 'visible', timeout: 900000 });
await page.click('#open-signup');
await page.fill('#account-username', `Steps_${Math.random().toString(36).slice(2, 7)}`);
await page.fill('#account-password', 'a password for the steps');
await page.click('#account-submit');
await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 180000 });
await pastQuestion(page);
await page.fill('#name', 'Steps');
await page.tap('#enter');
await page.waitForSelector('#confirm:not([hidden])', { timeout: 180000 });
await page.tap('#confirm-yes');
await page.waitForFunction(() => !document.querySelector('#hud').hidden && window.__nlw.view && window.__nlw.me && window.__nlw.me.mixer, null, { timeout: 900000 });
await page.evaluate(() => { const n = window.__nlw, g = n.host.game; const hour = n.view.clock.hourFloat; n.skip(((24 + 11 - hour) % 24)); g.state.weather = { kind: 'clear', until: g.state.t + 24 * 3600 }; n.setGraphics('medium'); for (const id of ['toasts', 'notices']) { const t = document.getElementById(id); if (t) t.style.display = 'none'; } });
// at the motor park, looking along the road past it to the river (the mirror has something to show at High)
const park = await page.evaluate(() => window.__nlw.service('park'));
await page.evaluate(([x, z]) => { const n = window.__nlw; n.place(x, z); n.face(Math.PI); n.cam.yaw = Math.PI; n.cam.dist = 6.5; n.cam.pitch = 0.12; }, [park.x + 6, park.z + 4]);
// settled: nothing more arriving for a while
const quiet = async (most = 240000) => { const t0 = Date.now(); let last = '', same = 0; while (Date.now() - t0 < most) { const now = await page.evaluate(() => { const r = window.__nlw.renderer, g = window.__nlw.graphics || {}; return `${r.info.memory.geometries}/${r.info.memory.textures}/${r.info.programs.length}/${g.held}/${window.__nlw.levelState.picturesWaiting}`; }); if (now === last) { same += 1; if (same >= 4) return Date.now() - t0; } else { same = 0; last = now; } await page.waitForTimeout(2000); } return Date.now() - t0; };
console.log('settling', await quiet());
const state = () => page.evaluate(() => { const n = window.__nlw, r = n.renderer, g = n.graphics || {}, m = performance.memory || {}; const ls = n.levelState; return { level: n.governor.level, programs: r.info.programs.length, textures: r.info.memory.textures, geometries: r.info.memory.geometries, gpuMB: +(((g.pictures || 0) + (g.buffers || 0)) / 1048576).toFixed(1), screenMB: +((g.screen || 0) / 1048576).toFixed(1), heapMB: m.usedJSHeapSize ? +(m.usedJSHeapSize / 1048576).toFixed(1) : null, pictures: ls.pictures, waiting: ls.picturesWaiting, pixelRatio: r.getPixelRatio(), longCount: window.__steps.long.length }; });
const results = [];
async function step(name, change, watchMs = 30000) {
  const before = { ...(await state()), proc: procMemory() };
  peak = { ...before.proc };
  const m0 = await metrics();
  const t0 = Date.now();
  const l0 = before.longCount;
  await page.evaluate(change);
  // until the pictures waiting are all made and nothing changes (at most a few minutes), then the rest of the window
  let picturesDoneMs = null;
  while (Date.now() - t0 < 300000) {
    const s = await page.evaluate(() => window.__nlw.levelState.picturesWaiting);
    if (s === 0) { picturesDoneMs = Date.now() - t0; break; }
    await page.waitForTimeout(1000);
  }
  if (Date.now() - t0 < watchMs) await page.waitForTimeout(watchMs - (Date.now() - t0));
  const m1 = await metrics();
  const after = { ...(await state()), proc: procMemory() };
  const highest = { ...peak }; peak = null;
  const long = await page.evaluate((from) => window.__steps.long.slice(from), l0);
  const wall = Date.now() - t0;
  const row = {
    name, wallMs: wall, busyMs: Math.round(((m1.TaskDuration || 0) - (m0.TaskDuration || 0)) * 1000), scriptMs: Math.round(((m1.ScriptDuration || 0) - (m0.ScriptDuration || 0)) * 1000),
    longTasks: long.length, longestMs: long.reduce((a, b) => Math.max(a, b[1]), 0), longSumMs: long.reduce((a, b) => a + b[1], 0),
    programsMade: after.programs - before.programs, memoryPeak: highest, picturesDoneMs, picturesBefore: before.pictures, picturesAfter: after.pictures,
    before: { ...before, pictures: undefined, longCount: undefined }, after: { ...after, pictures: undefined, longCount: undefined },
  };
  results.push(row);
  console.log(name, JSON.stringify({ ...row, picturesBefore: undefined, picturesAfter: undefined }));
  console.log('  pictures', JSON.stringify(before.pictures), '->', JSON.stringify(after.pictures));
}
// (a quiet minute first, for the page's own time with no change: what each change adds is over this)
await step('nothing changed (a minute at Medium)', () => {}, 60000);
await step('Medium to High', () => window.__nlw.governor.set(1, 'measuring'), 60000);
await step('High to Medium', () => window.__nlw.governor.set(2, 'measuring'), 60000);
await step('Medium to High again', () => window.__nlw.governor.set(1, 'measuring'), 60000);
await step('High to Medium again', () => window.__nlw.governor.set(2, 'measuring'), 60000);
await step('Medium to Low', () => window.__nlw.governor.set(3, 'measuring'), 60000);
await step('Low to Medium', () => window.__nlw.governor.set(2, 'measuring'), 60000);
await step('Medium to Low again', () => window.__nlw.governor.set(3, 'measuring'), 60000);
await step('Low to Medium again', () => window.__nlw.governor.set(2, 'measuring'), 60000);
// the drawing surface taken away and given back (as a phone short of memory does)
await step('the drawing surface lost and given back', async () => {
  const ext = window.__nlw.renderer.getContext().getExtension('WEBGL_lose_context');
  ext.loseContext();
  await new Promise((r) => setTimeout(r, 1500));
  ext.restoreContext();
}, 90000);
writeFileSync(resolve(out, `level-steps-${LABEL}.json`), JSON.stringify({ site: SITE, dpr: DPR, throttle: THROTTLE, results }, null, 1));
console.log('written');
await browser.close();
server.close();
process.exit(0);
