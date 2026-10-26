// A phone's settings (or a computer's), from opening the game to a quarter of an hour walking about the town (the owner's
// brief of 26 October 2026: since the guns the game hung on his phones and, on his iPhone, sometimes closed by itself).
// Every few seconds: the memory of the page's own process and of the graphics process (this machine draws in software,
// so what a graphics card would hold is in that process's memory, as a phone's shared memory holds it), the script's
// heap, the game's own count of the graphics card, the graphics level and its changes, and the frames (each frame's
// time, the long ones, the main thread's time for each); and, first, the time to get into the town.
//   ../server/with-postgres.sh node tools/measure/soak.mjs <out folder> [site folder]
// SOAK_MINUTES (15); SOAK_DEVICE phone|computer (phone); SOAK_GUN=1 the gun out, a short burst fired every half minute;
// SOAK_LEVEL the graphics level chosen in Settings, held (low, medium, high, ultra; or auto: on this machine, which has
// no graphics card, Auto chooses Low) (medium: where a phone's Auto starts); SOAK_DPR the screen's pixels to each of the
// page's (3, an iPhone's); SOAK_THROTTLE the processor slowed so many times (4 on a phone's settings, 1 on a
// computer's); SOAK_SW=0 keeps the web app's service worker out (in by default, as in the installed web app);
// SOAK_LABEL names the output (soak-<label>.json); SOAK_EVERY seconds between samples (15).
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, appendFileSync, existsSync, statSync, createReadStream, readFileSync, readdirSync } from 'node:fs';
import { resolve, extname, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const { pastQuestion } = await import(`${ROOT}/prototype/test/start.mjs`);
const out = resolve(process.argv[2] || '/tmp/soak'); mkdirSync(out, { recursive: true });
const SITE = resolve(process.argv[3] || `${ROOT}/prototype/dist/site`);
const PHONE = (process.env.SOAK_DEVICE || 'phone') !== 'computer';
const MINUTES = Number(process.env.SOAK_MINUTES) > 0 ? Number(process.env.SOAK_MINUTES) : 15;
const GUN = process.env.SOAK_GUN === '1';
const LEVEL = process.env.SOAK_LEVEL || 'medium';
const DPR = Number(process.env.SOAK_DPR) > 0 ? Number(process.env.SOAK_DPR) : 3;
const THROTTLE = Number(process.env.SOAK_THROTTLE) > 0 ? Number(process.env.SOAK_THROTTLE) : PHONE ? 4 : 1;
const SW = process.env.SOAK_SW !== '0';
const EVERY = Number(process.env.SOAK_EVERY) > 0 ? Number(process.env.SOAK_EVERY) : 15;
const LABEL = process.env.SOAK_LABEL || `${PHONE ? 'phone' : 'computer'}-${LEVEL}${GUN ? '-gun' : ''}`;
const LINES = resolve(out, `soak-${LABEL}.jsonl`);
writeFileSync(LINES, '');

// the site and the server's /api/game, as server/dev.mjs serves them (but from the folder given)
const game = require(`${ROOT}/api/game.js`);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.jpg': 'image/jpeg', '.bin': 'application/octet-stream', '.gz': 'application/gzip' };
const served = { files: 0, bytes: 0 };
const server = createServer((req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  if (path === '/api/game') { game(req, res); return; }
  const file = resolve(SITE, `.${path === '/' ? '/index.html' : path}`);
  if (!(file === SITE || file.startsWith(SITE + sep)) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('Not found'); return; }
  const size = statSync(file).size;
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Content-Length': size, 'Cache-Control': 'no-cache' });
  if (req.method === 'HEAD') { res.end(); return; }
  served.files += 1; served.bytes += size;
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;

// ---- the browser's processes and their memory (Linux: /proc) ----
const TAG = `soak${Date.now().toString(36)}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--autoplay-policy=no-user-gesture-required', `--soak-tag=${TAG}`] });
const cmdline = (pid) => { try { return readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0'); } catch (e) { return null; } };
const parentOf = (pid) => { try { const s = readFileSync(`/proc/${pid}/stat`, 'utf8'); return Number(s.slice(s.lastIndexOf(')') + 2).split(' ')[1]); } catch (e) { return null; } };
const pids = () => readdirSync('/proc').filter((d) => /^\d+$/.test(d)).map(Number);
const top = pids().find((p) => { const c = cmdline(p); return c && c.some((a) => a === `--soak-tag=${TAG}`) && !c.some((a) => a.startsWith('--type=')); });
function tree() {
  const all = pids(), kids = new Map();
  for (const p of all) { const pp = parentOf(p); if (pp) { if (!kids.has(pp)) kids.set(pp, []); kids.get(pp).push(p); } }
  const found = [], stack = [top];
  while (stack.length) { const p = stack.pop(); if (!p) continue; found.push(p); for (const k of kids.get(p) || []) stack.push(k); }
  return found;
}
function procMemory() {
  // by kind: the page's (renderer: the largest of them, and all), the graphics process, the rest; in MB, private and
  // proportional
  const MB = (kb) => +(kb / 1024).toFixed(1);
  const kinds = {};
  let renderers = [];
  for (const p of tree()) {
    const c = cmdline(p); if (!c) continue;
    // (a child process writes its title over its arguments: one string, spaces between)
    const typeArg = /--type=(\S+)/.exec(c.join(' '));
    const type = typeArg ? typeArg[1] : 'browser';
    let m;
    try { m = readFileSync(`/proc/${p}/smaps_rollup`, 'utf8'); } catch (e) { continue; }
    const field = (name) => { const r = new RegExp(`^${name}:\\s+(\\d+) kB`, 'm').exec(m); return r ? Number(r[1]) : 0; };
    const priv = field('Private_Clean') + field('Private_Dirty') + field('Swap'), pss = field('Pss') + field('Swap');
    if (type === 'renderer') renderers.push({ pid: p, priv, pss });
    const k = type === 'gpu-process' ? 'gpu' : type === 'renderer' ? 'renderer' : type === 'browser' ? 'browser' : 'other';
    kinds[k] = kinds[k] || { priv: 0, pss: 0 }; kinds[k].priv += priv; kinds[k].pss += pss;
  }
  renderers = renderers.sort((a, b) => b.priv - a.priv);
  const page = renderers[0] || { priv: 0, pss: 0 };
  return {
    pagePriv: MB(page.priv), pagePss: MB(page.pss), renderers: renderers.length,
    gpuPriv: MB((kinds.gpu || {}).priv || 0), gpuPss: MB((kinds.gpu || {}).pss || 0),
    browserPss: MB((kinds.browser || {}).pss || 0), otherPss: MB((kinds.other || {}).pss || 0),
    // the page and what draws its pictures, as a phone counts a page (its process and its share of the graphics)
    pagePlusGpu: MB(page.priv + ((kinds.gpu || {}).priv || 0)),
  };
}

const context = await browser.newContext(PHONE ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true, serviceWorkers: SW ? 'allow' : 'block' } : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: DPR, serviceWorkers: SW ? 'allow' : 'block' });
const page = await context.newPage();
page.setDefaultTimeout(900000);
const events = [];
const note = (kind, text) => { const e = { at: +((Date.now() - T0) / 1000).toFixed(1), kind, text: String(text).slice(0, 400) }; events.push(e); console.log('EVENT', JSON.stringify(e)); };
const T0 = Date.now();
page.on('pageerror', (e) => note('pageerror', e.message));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/Failed to load resource|status of 4\d\d/.test(t)) note('console', t); else if (/graphics|context|lowered|memory|PostCivilWar/i.test(t) && m.type() !== 'debug') note(m.type(), t); });
page.on('crash', () => note('crash', 'the page crashed'));
const cdp = await context.newCDPSession(page);
if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
await cdp.send('Performance.enable');
const metrics = async () => { const { metrics: list } = await cdp.send('Performance.getMetrics'); return Object.fromEntries(list.map((x) => [x.name, x.value])); };
// the same random numbers in every run
await page.addInitScript(() => { let s = 20261026; Math.random = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; });
// every frame's time, and every long task (more than 50 ms of the main thread at once), and a lost drawing surface
await page.addInitScript(() => {
  window.__soak = { frames: [], long: [], lost: 0, restored: 0 };
  const f = (t) => { const s = window.__soak.frames; s.push(t); if (s.length > 20000) s.splice(0, 10000); requestAnimationFrame(f); };
  requestAnimationFrame(f);
  try { new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__soak.long.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch (e) { /* not here */ }
  document.addEventListener('webglcontextlost', () => { window.__soak.lost += 1; }, true);
  document.addEventListener('webglcontextrestored', () => { window.__soak.restored += 1; }, true);
});

const result = { label: LABEL, device: PHONE ? 'phone' : 'computer', site: SITE, level: LEVEL, gun: GUN, dpr: DPR, throttle: THROTTLE, serviceWorker: SW, minutes: MINUTES, when: new Date().toISOString(), loading: {}, samples: [], events };
const tap = (sel) => (PHONE ? page.tap(sel) : page.click(sel));

// ---- loading: a first visit to PLAY, then the character screen, then into the town ----
const tNav = Date.now();
await page.goto(`${origin}/#gameclock${PHONE ? '-lite' : ''}`, { timeout: 900000 });
await page.waitForSelector('#cover-play', { state: 'visible', timeout: 900000 });
result.loading.playMs = Date.now() - tNav;
result.engine = await page.evaluate(() => (window.THREE && window.THREE.REVISION) || null);
result.loading.atPlay = procMemory();
console.log('PLAY after', result.loading.playMs, 'ms; engine', result.engine, JSON.stringify(result.loading.atPlay));
await page.evaluate(() => document.getElementById('cover-play').click());
const t1 = Date.now();
await page.waitForSelector('#open-signup', { state: 'visible', timeout: 900000 });
await page.click('#open-signup');
await page.fill('#account-username', `Soak_${Math.random().toString(36).slice(2, 7)}`);
await page.fill('#account-password', 'a password for the soak');
await page.click('#account-submit');
await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 180000 });
await pastQuestion(page);
result.loading.characterMs = Date.now() - t1;
await page.fill('#name', 'Soak');
await tap('#enter');
await page.waitForSelector('#confirm:not([hidden])', { timeout: 180000 });
const t2 = Date.now();
await tap('#confirm-yes');
await page.waitForFunction(() => !document.querySelector('#hud').hidden && window.__nlw.view && window.__nlw.playerId && window.__nlw.me && window.__nlw.me.mixer, null, { timeout: 900000 });
result.loading.townMs = Date.now() - t2;
result.loading.inTown = procMemory();
console.log('in the town after', result.loading.townMs, 'ms', JSON.stringify(result.loading.inTown));
// the level as a player would choose it in Settings (held), or Auto
await page.evaluate((level) => { const n = window.__nlw; n.setGraphics(level === 'auto' ? 'auto' : level); }, LEVEL);
await page.evaluate(() => { for (const id of ['toasts', 'notices']) { const t = document.getElementById(id); if (t) t.style.display = 'none'; } });
// by day, dry
await page.evaluate(() => { const n = window.__nlw, g = n.host.game; const hour = n.view.clock.hourFloat; n.skip(((24 + 10 - hour) % 24)); g.state.weather = { kind: 'clear', until: g.state.t + 24 * 3600 }; });

// ---- the walk: round the town's middle, by its roads ----
const park = await page.evaluate(() => window.__nlw.service('park'));
const ROUTE = [[park.x + 6, park.z + 4], [0, 60], [0, 113], [-120, 113], [-230, 113], [-120, 113], [0, 113], [120, 113], [230, 113], [120, 113], [0, 113], [0, 40], [0, -40], [-120, -40], [-220, -40], [-120, -40], [0, -40], [120, -40], [220, -40], [120, -40], [0, -40], [0, 40]];
// (the way round as one line, metre by metre: where a walker at SOAK_PACE metres a second (1.4, a walk) would be by
// now. This machine draws a frame in seconds, and the game moves at most half a second a frame, so the figure, walking
// all the time, falls behind: it is put where the walker would be whenever it is more than ten metres behind, so that
// the town is gone through in a quarter of an hour as a player walking it would go through it)
const PACE = Number(process.env.SOAK_PACE) > 0 ? Number(process.env.SOAK_PACE) : 1.4;
const legs = []; let total = 0;
for (let i = 0; i < ROUTE.length; i += 1) { const a = ROUTE[i], b = ROUTE[(i + 1) % ROUTE.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); legs.push({ a, b, from: total, L }); total += L; }
const along = (s) => { s %= total; const l = legs.find((g) => s >= g.from && s < g.from + g.L) || legs[0]; const k = (s - l.from) / Math.max(1e-6, l.L); return { x: l.a[0] + (l.b[0] - l.a[0]) * k, z: l.a[1] + (l.b[1] - l.a[1]) * k, to: l.b }; };
let walkStart = null, placed = 0;
async function steer() {
  const st = await page.evaluate(() => { const n = window.__nlw; const p = n.predicted; return { x: p.x, z: p.z, uiOpen: n.ui.isOpen() }; });
  if (walkStart === null) walkStart = Date.now();
  const want = along(((Date.now() - walkStart) / 1000) * PACE);
  if (Math.hypot(want.x - st.x, want.z - st.z) > 10) { await page.evaluate(([x, z]) => window.__nlw.place(x, z), [want.x, want.z]); placed += 1; st.x = want.x; st.z = want.z; }
  const heading = Math.atan2(want.to[0] - st.x, want.to[1] - st.z);
  if (st.uiOpen) await page.evaluate(() => { try { window.__nlw.ui.close(); } catch (e) { /* nothing open to close */ } });
  await page.evaluate((h) => { const n = window.__nlw; n.cam.yaw = h; if (!(n.gunPlay && n.gunPlay.out)) n.face(h); }, heading);
  return st;
}
await page.focus('canvas').catch(() => {});
if (GUN) {
  await page.keyboard.press('x');
  await page.waitForFunction(() => window.__nlw.gunPlay && window.__nlw.gunPlay.out, null, { timeout: 60000 }).catch(() => note('gun', 'the gun did not come out'));
}
await page.keyboard.down('w');

// ---- sampling ----
let lastFrameN = 0, lastLong = 0;
let m0 = await metrics();
let k0 = await page.evaluate(() => window.__soak.frames.length);
const tTown = Date.now();
let nextShot = Date.now() + 20000, running = false, nextRun = Date.now() + 60000;
async function sample() {
  const m1 = await metrics();
  const s = await page.evaluate(([fromFrame, fromLong]) => {
    const n = window.__nlw, r = n.renderer, g = n.graphics || {}, S = window.__soak;
    const f = S.frames.slice(Math.max(0, fromFrame - (S.frames.length >= 20000 ? 0 : 0)));
    const d = []; for (let i = 1; i < f.length; i += 1) d.push(f[i] - f[i - 1]);
    const sorted = d.slice().sort((a, b) => a - b);
    const q = (p) => (sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]) : null);
    const long = S.long.slice(fromLong);
    const mem = performance.memory || {};
    const safe = (fn) => { try { return fn(); } catch (e) { return null; } };
    const gov = n.governor;
    const self = n.view && n.view.self;
    return {
      frameCount: S.frames.length, longCount: S.long.length,
      frames: { n: d.length, median: q(0.5), p90: q(0.9), max: sorted.length ? Math.round(sorted[sorted.length - 1]) : null, over250: d.filter((x) => x > 250).length, over1000: d.filter((x) => x > 1000).length, over3000: d.filter((x) => x > 3000).length },
      long: { n: long.length, ms: long.reduce((a, b) => a + b[1], 0), max: long.reduce((a, b) => Math.max(a, b[1]), 0) },
      heapMB: mem.usedJSHeapSize ? +(mem.usedJSHeapSize / 1048576).toFixed(1) : null, heapTotalMB: mem.totalJSHeapSize ? +(mem.totalJSHeapSize / 1048576).toFixed(1) : null,
      gpuMB: +(((g.pictures || 0) + (g.buffers || 0)) / 1048576).toFixed(1), picturesMB: +((g.pictures || 0) / 1048576).toFixed(1), buffersMB: +((g.buffers || 0) / 1048576).toFixed(1), screenMB: +((g.screen || 0) / 1048576).toFixed(1),
      textures: r ? r.info.memory.textures : null, geometries: r ? r.info.memory.geometries : null, programs: r && r.info.programs ? r.info.programs.length : null,
      level: gov ? gov.level : null, changes: gov ? gov.changes.length : null, lastChange: gov && gov.changes.length ? gov.changes[gov.changes.length - 1] : null,
      pixelRatio: r ? r.getPixelRatio() : null, picturesWaiting: safe(() => n.levelState.picturesWaiting),
      x: n.predicted ? Math.round(n.predicted.x) : null, z: n.predicted ? Math.round(n.predicted.z) : null,
      gun: n.gunPlay ? { out: !!n.gunPlay.out, mag: self && self.gun ? self.gun.mag : null, spare: self && self.gun ? self.gun.spare : null } : null,
      health: self ? self.health : null, law: self && self.law ? self.law.state : null,
      lost: S.lost, restored: S.restored, fps: n.perf ? Math.round(n.perf.fps * 10) / 10 : null,
      // the programs compiled since the last sample, by the kind and name of the material that asked for each
      newPrograms: safe(() => { const seen = window.__soakPrograms || (window.__soakPrograms = new Set()); const fresh = []; for (const p of r.info.programs) if (!seen.has(p.id)) { seen.add(p.id); fresh.push(`${p.type || ''}:${p.name || ''}`); } return fresh; }),
      // the game's own count of its frames' parts (monitor.js: the mean of each over its whole life, and how many frames)
      mon: safe(() => { const r = n.monitor.report(); const sec = {}; for (const [k, v] of Object.entries(r.sections)) sec[k] = v.mean; return { frames: r.frames, hitches: r.hitches, freezes: r.freezes, sections: sec, counters: r.counters }; }),
    };
  }, [k0, lastLong]);
  k0 = s.frameCount; lastLong = s.longCount;
  const busyMs = s.frames.n ? +((((m1.TaskDuration || 0) - (m0.TaskDuration || 0)) * 1000) / s.frames.n).toFixed(1) : null;
  const scriptMs = s.frames.n ? +((((m1.ScriptDuration || 0) - (m0.ScriptDuration || 0)) * 1000) / s.frames.n).toFixed(1) : null;
  m0 = m1;
  const row = { t: Math.round((Date.now() - tTown) / 1000), ...s, busyMs, scriptMs, nodes: m1.Nodes, listeners: m1.JSEventListeners, ...procMemory() };
  delete row.frameCount; delete row.longCount;
  result.samples.push(row);
  appendFileSync(LINES, `${JSON.stringify(row)}\n`);
  console.log(`t=${row.t}s lvl=${row.level} frames=${row.frames.n} med=${row.frames.median} p90=${row.frames.p90} max=${row.frames.max} busy=${row.busyMs} long=${row.long.n}/${row.long.max} heap=${row.heapMB} gpu=${row.gpuMB} page=${row.pagePriv} gpuProc=${row.gpuPriv} sum=${row.pagePlusGpu} tex=${row.textures} geo=${row.geometries} prog=${row.programs} at=${row.x},${row.z} ${row.gun ? `gun=${row.gun.out ? 'out' : 'away'}:${row.gun.mag}/${row.gun.spare}` : ''} hp=${row.health} law=${row.law}`);
}
const end = tTown + MINUTES * 60000;
let nextSample = Date.now() + EVERY * 1000;
while (Date.now() < end) {
  try {
    await steer();
    if (GUN && Date.now() > nextShot) {
      nextShot = Date.now() + 30000;
      const g = await page.evaluate(() => { const n = window.__nlw, s = n.view && n.view.self; return { out: !!(n.gunPlay && n.gunPlay.out), mag: s && s.gun ? s.gun.mag : 0, spare: s && s.gun ? s.gun.spare : 0, critical: !!(s && s.critical) }; });
      if (!g.out && !g.critical) { await page.keyboard.press('x'); await page.waitForTimeout(600); }
      if (g.mag <= 0 && g.spare > 0) { await page.keyboard.press('r'); }
      else { await page.keyboard.down('f'); await page.waitForTimeout(500); await page.keyboard.up('f'); }
    }
    // a run now and then (Shift held for twenty seconds a minute)
    if (Date.now() > nextRun) { running = !running; if (running) await page.keyboard.down('Shift'); else await page.keyboard.up('Shift'); nextRun = Date.now() + (running ? 20000 : 40000); }
    if (Date.now() >= nextSample) { nextSample += EVERY * 1000; await sample(); }
  } catch (error) {
    note('soak', `the walk: ${error.message}`);
    if (/crash|closed|Target/.test(error.message)) break;
  }
  await page.waitForTimeout(700).catch(() => {});
}
await page.keyboard.up('w').catch(() => {});
await page.keyboard.up('Shift').catch(() => {});

// ---- what it comes to ----
const S = result.samples;
const after = (t) => S.filter((r) => r.t >= t);
const pick = (rows, key) => rows.map((r) => r[key]).filter((v) => Number.isFinite(v));
const max = (a) => (a.length ? Math.max(...a) : null);
const first = (rows, key) => { const a = pick(rows, key); return a.length ? a[0] : null; };
const last = (rows, key) => { const a = pick(rows, key); return a.length ? a[a.length - 1] : null; };
// growth: a line fitted through the samples after the first two minutes, in MB a minute
const slope = (key) => { const rows = after(120).filter((r) => Number.isFinite(r[key])); if (rows.length < 4) return null; const xs = rows.map((r) => r.t / 60), ys = rows.map((r) => r[key]); const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length; let num = 0, den = 0; for (let i = 0; i < xs.length; i += 1) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; } return den ? +(num / den).toFixed(2) : null; };
const frames = S.reduce((a, r) => { a.n += r.frames.n; a.over1000 += r.frames.over1000; a.over3000 += r.frames.over3000; a.max = Math.max(a.max, r.frames.max || 0); return a; }, { n: 0, over1000: 0, over3000: 0, max: 0 });
const medians = S.map((r) => r.frames.median).filter(Number.isFinite).sort((a, b) => a - b);
const busy = S.map((r) => r.busyMs).filter(Number.isFinite).sort((a, b) => a - b);
result.summary = {
  label: LABEL, townMs: result.loading.townMs, playMs: result.loading.playMs, characterMs: result.loading.characterMs,
  memory: Object.fromEntries(['pagePlusGpu', 'pagePriv', 'gpuPriv', 'heapMB', 'gpuMB'].map((k) => [k, { first: first(after(60), k), peak: max(pick(S, k)), last: last(S, k), perMinute: slope(k) }])),
  frames: { ...frames, typicalMs: medians.length ? medians[Math.floor(medians.length / 2)] : null, busyMs: busy.length ? busy[Math.floor(busy.length / 2)] : null },
  levelChanges: S.length ? S[S.length - 1].changes : null, programs: last(S, 'programs'), textures: last(S, 'textures'), geometries: last(S, 'geometries'),
  lost: S.length ? S[S.length - 1].lost : null, events: events.length, served, placed,
  // the game's own time for each part of a frame, from the first sample after two minutes to the last (ms a frame)
  parts: (() => {
    const a = after(120)[0], b = S[S.length - 1];
    if (!a || !b || !a.mon || !b.mon || b.mon.frames <= a.mon.frames) return null;
    const out = {}; const fa = a.mon.frames, fb = b.mon.frames;
    for (const k of Object.keys(b.mon.sections)) out[k] = +(((b.mon.sections[k] * fb) - ((a.mon.sections[k] || 0) * fa)) / (fb - fa)).toFixed(2);
    return out;
  })(),
};
writeFileSync(resolve(out, `soak-${LABEL}.json`), JSON.stringify(result, null, 1));
console.log('SUMMARY', JSON.stringify(result.summary));
await browser.close();
server.close();
process.exit(0);
