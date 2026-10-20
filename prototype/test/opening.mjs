// The opening and the character screen as a phone on a slow connection meets them (20 October 2026, the owner's brief:
// the character screen was slow, the game crashed with "The picture was lost", and the opening was heavy).
//
// The website (site/ as built) is served the way the host serves it, over one shared link of 1.6 Mbit/s with 150 ms
// before each answer (test/slow-server.mjs: the "Slow 4G" of the browsers' tools, which a throttle inside the browser
// cannot give a service worker), and the page's own thread is slowed four times (the browser's CPU throttle), on a
// phone's screen with a phone's touch. Measured, as the brief asks:
//   - when the splash is first painted, and when PLAY can be pressed;
//   - on the character screen, for each press of the arrow: how soon the press is answered, how soon something of the
//     next character is on the turntable, how soon the whole figure is, and how many bytes it took;
//   - the arrow pressed again while the next figure is still arriving: whether the very next frame already shows the
//     figure pressed for, and whether the download on its way is stopped;
//   - the graphics memory the page holds (every texture and render buffer handed to the graphics card, counted as it
//     is handed over), how many drawing surfaces (WebGL contexts) the page has, and the script's own memory;
//   - the page's longest freezes (long tasks) on each screen;
//   - then the same opening again, as a returning player has it.
//
//   server/with-postgres.sh node test/opening.mjs <site folder> <out folder> [arrows=N] [link=4g] [check]
// With `check`, the brief's targets are checked and the test fails on any missed (the new behaviour); without it, the
// numbers are only written (out/opening.json) and printed.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createSlowServer } from './slow-server.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }

const site = resolve(process.argv[2] || resolve(process.cwd(), '../site'));
const out = resolve(process.argv[3] || '/tmp/opening');
const arrows = Number((process.argv.find((a) => a.startsWith('arrows=')) || 'arrows=2').split('=')[1]);
const checking = process.argv.includes('check');
mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); };

// What the page holds on the graphics card, counted at the moment it is handed over; its drawing surfaces; its long tasks;
// and when each stage of the opening came. Runs before any of the page's own script.
const PROBE = () => {
  const P = window.__probe = { contexts: 0, live: 0, peak: 0, perContext: [], longtasks: [], marks: {}, frames: [] };
  const per = new WeakMap();                     // gl -> { id, unit, bound, textures: Map(tex -> {levels, mips}), renderbuffers: Map }
  const of = (gl) => { let s = per.get(gl); if (!s) { s = { id: P.perContext.length, unit: 33984, bound: new Map(), textures: new Map(), renderbuffers: new Map(), bytes: 0 }; per.set(gl, s); P.perContext.push(s); } return s; };
  const BPP = { 6408: 4, 6407: 4, 32856: 4, 32849: 4, 35907: 4, 35905: 4, 34842: 8, 34843: 8, 34836: 16, 34837: 16, 33321: 1, 33323: 2, 33325: 2, 33326: 4, 33327: 4, 33328: 8, 33329: 4, 33330: 8, 6409: 1, 6410: 2, 6406: 1, 33189: 4, 33190: 4, 36012: 4, 35056: 4, 36013: 8, 6402: 4, 34041: 4, 36168: 1, 32854: 2, 32855: 2, 36194: 2 };
  const recount = (s) => {
    let b = 0;
    for (const t of s.textures.values()) { let l = 0; for (const v of t.levels.values()) l += v; b += l + (t.mips ? Math.round((t.levels.get(0) || 0) / 3) : 0); }
    for (const v of s.renderbuffers.values()) b += v;
    s.bytes = b;
    P.live = P.perContext.reduce((n, c) => n + c.bytes, 0);
    P.peak = Math.max(P.peak, P.live);
  };
  const faceOf = (target) => (target >= 34069 && target <= 34074 ? 34067 : target);
  const texOf = (s, target) => s.bound.get(`${s.unit}:${faceOf(target)}`);
  const entry = (s, tex) => { let t = s.textures.get(tex); if (!t) { t = { levels: new Map(), mips: false, faces: 1 }; s.textures.set(tex, t); } return t; };
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
    const ctx = getContext.call(this, kind, ...rest);
    if (ctx && /webgl/i.test(String(kind)) && !ctx.__probed) { ctx.__probed = true; P.contexts += 1; of(ctx); }
    return ctx;
  };
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!C) continue;
    const p = C.prototype;
    const wrap = (name, before) => { const orig = p[name]; if (!orig) return; p[name] = function (...a) { try { before.call(this, of(this), a); } catch (e) { /* counting only */ } return orig.apply(this, a); }; };
    wrap('activeTexture', function (s, a) { s.unit = a[0]; });
    wrap('bindTexture', function (s, a) { s.bound.set(`${s.unit}:${a[0]}`, a[1]); });
    wrap('deleteTexture', function (s, a) { s.textures.delete(a[0]); recount(s); });
    wrap('texImage2D', function (s, a) {
      const tex = texOf(s, a[0]); if (!tex) return;
      let w, h, fmt = a[2];
      if (a.length >= 8 && typeof a[3] === 'number' && typeof a[4] === 'number' && a.length !== 6) { w = a[3]; h = a[4]; } else { const src = a[5]; w = src && (src.videoWidth || src.naturalWidth || src.width) || 0; h = src && (src.videoHeight || src.naturalHeight || src.height) || 0; }
      const t = entry(s, tex);
      const face = a[0] >= 34069 && a[0] <= 34074 ? a[0] - 34069 : 0;
      t.levels.set(a[1] * 8 + face, w * h * (BPP[fmt] || 4));
      recount(s);
    });
    wrap('texStorage2D', function (s, a) {
      const tex = texOf(s, a[0]); if (!tex) return;
      const t = entry(s, tex); t.levels.clear();
      let w = a[3], h = a[4], total = 0;
      for (let l = 0; l < a[1]; l += 1) { total += Math.max(1, w) * Math.max(1, h) * (BPP[a[2]] || 4); w >>= 1; h >>= 1; }
      t.levels.set(0, total * (a[0] === 34067 ? 6 : 1)); t.mips = false; recount(s);
    });
    wrap('generateMipmap', function (s, a) { const tex = texOf(s, a[0]); if (!tex) return; entry(s, tex).mips = true; recount(s); });
    wrap('bindRenderbuffer', function (s, a) { s.rb = a[1]; });
    wrap('deleteRenderbuffer', function (s, a) { s.renderbuffers.delete(a[0]); recount(s); });
    wrap('renderbufferStorage', function (s, a) { if (s.rb) { s.renderbuffers.set(s.rb, a[2] * a[3] * (BPP[a[1]] || 4)); recount(s); } });
    wrap('renderbufferStorageMultisample', function (s, a) { if (s.rb) { s.renderbuffers.set(s.rb, a[3] * a[4] * (BPP[a[2]] || 4) * Math.max(1, a[1])); recount(s); } });
  }
  try { new PerformanceObserver((list) => { for (const e of list.getEntries()) P.longtasks.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch (e) { /* no long tasks here */ }
  // when the opening's stages came, and the character screen
  const mark = (name) => { if (!(name in P.marks)) { P.marks[name] = Math.round(performance.now()); requestAnimationFrame(() => { P.marks[`${name}:painted`] = Math.round(performance.now()); }); } };
  P.mark = mark;
  new MutationObserver(() => {
    const intro = document.getElementById('intro');
    if (intro) { mark('intro'); if (intro.dataset.stage === 'cover') mark('cover'); if (intro.classList.contains('ready')) mark('ready'); }
    const start = document.getElementById('start');
    if (start && !start.hidden && start.dataset.screen === 'create' && (!intro || intro.hidden)) mark('create');
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-stage', 'class', 'hidden', 'data-screen'] });
};

// the game's server as the host runs it (a database from server/with-postgres.sh): on the website nobody plays without an
// account, and the test makes one (a test account on the test database)
// (`link=4g` measures on an ordinary 4G link instead: 9 Mbit/s, 85 ms before each answer)
const fourG = process.argv.includes('link=4g');
const server = createSlowServer({ root: site, api: require('../../api/game.js'), ...(fourG ? { rate: 9e6 / 8, rtt: 85 } : {}) });
const url = await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await context.addInitScript(PROBE);
const page = await context.newPage();
page.setDefaultTimeout(600000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const cdp = await context.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

const MB = (n) => +(n / 1048576).toFixed(2);
const memory = async () => page.evaluate(() => {
  const P = window.__probe, n = window.__nlw;
  const info = n && n.renderer && n.renderer.info ? { geometries: n.renderer.info.memory.geometries, textures: n.renderer.info.memory.textures, programs: (n.renderer.info.programs || []).length } : null;
  return { contexts: P.contexts, graphicsMB: +(P.live / 1048576).toFixed(1), peakMB: +(P.peak / 1048576).toFixed(1), perContextMB: P.perContext.map((c) => +(c.bytes / 1048576).toFixed(1)), textures: P.perContext.map((c) => c.textures.size), townRenderer: info, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null };
});
const longest = async (from, to = Infinity) => page.evaluate(([a, b]) => { const l = window.__probe.longtasks.filter(([s]) => s >= a && s < b); return { count: l.length, longest: l.reduce((m, [, d]) => Math.max(m, d), 0), total: l.reduce((m, [, d]) => m + d, 0) }; }, [from, to]);
const sentNow = () => server.sent();

const everything = [];               // what was sent in each visit, whole (the server's count is reset for each)
async function opening(label) {
  if (everything.length || label !== 'first visit') everything.push(server.sent());
  server.reset();
  const began = Date.now();
  await page.goto(url, { waitUntil: 'commit' });
  // PLAY can be pressed (the cover is up)
  await page.waitForFunction(() => window.__probe && window.__probe.marks['ready:painted'] !== undefined, null, { timeout: 600000, polling: 100 });
  const at = await page.evaluate(() => {
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const nav = performance.getEntriesByType('navigation')[0];
    return { fcp: fcp ? Math.round(fcp.startTime) : null, splashInDom: window.__probe.marks.intro ?? null, play: window.__probe.marks['ready:painted'], domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null, load: nav ? Math.round(nav.loadEventEnd) : null };
  });
  const sent = sentNow();
  const bytesBeforePlay = Object.values(sent).reduce((n, s) => n + s.bytes, 0);
  const row = { label, splashPaint: at.fcp, splashInDom: at.splashInDom, play: at.play, domContentLoaded: at.domContentLoaded, bytesBeforePlay, filesBeforePlay: Object.fromEntries(Object.entries(sent).map(([p, s]) => [p, { bytes: s.bytes, requests: s.requests, full: s.full, notModified: s.notModified }])), freezes: await longest(0, at.play), memory: await memory(), wall: Date.now() - began };
  console.log(`${label}: splash painted at ${row.splashPaint} ms, PLAY at ${row.play} ms, ${MB(bytesBeforePlay)} MB sent before PLAY; longest freeze ${row.freezes.longest} ms`);
  return row;
}

const report = { site, when: new Date().toISOString(), link: fourG ? '9 Mbit/s, 85 ms (4G), CPU slowed 4 times, 390x844 phone screen' : '1.6 Mbit/s, 150 ms (Slow 4G), CPU slowed 4 times, 390x844 phone screen', first: null, character: null, arrows: [], repeat: null, errors };
report.first = await opening('first visit');
await page.screenshot({ path: resolve(out, '1-cover.png') });

// ---- PLAY, the question if it is put, and the character screen ----
const playAt = await page.evaluate(() => performance.now());
await page.evaluate(() => document.getElementById('cover-play').click());
const atQuestionOrScreen = () => page.waitForFunction(() => { const n = window.__nlw; const s = document.getElementById('start'); const gate = document.getElementById('open-signup'); return (n && n.intro && n.intro.asking && n.intro.asking()) || (document.getElementById('intro').dataset.stage === 'choice') || (s && !s.hidden && s.dataset.screen === 'create' && document.getElementById('intro').hidden) || (gate && gate.offsetParent !== null); }, null, { timeout: 600000, polling: 100 });
await atQuestionOrScreen();
// the website's gate: an account is made (a test account, on the test database)
if (await page.evaluate(() => { const g = document.getElementById('open-signup'); return !!(g && g.offsetParent !== null); })) {
  await page.evaluate(() => document.getElementById('open-signup').click());
  await page.waitForSelector('#account-username', { state: 'visible' });
  await page.fill('#account-username', `Open_${Math.random().toString(36).slice(2, 8)}`);
  await page.fill('#account-password', 'a password for the opening test');
  await page.evaluate(() => document.getElementById('account-submit').click());
  await page.waitForFunction(() => window.__nlw && window.__nlw.online.status().state === 'in', null, { timeout: 300000, polling: 200 });
  await atQuestionOrScreen();
}
if (await page.evaluate(() => document.getElementById('intro').dataset.stage === 'choice' || (window.__nlw.intro.asking && window.__nlw.intro.asking()))) await page.evaluate(() => document.querySelector('.pick[data-path="hero"]').click());
await page.waitForFunction(() => window.__probe.marks.create !== undefined, null, { timeout: 600000, polling: 100 });
// the first character on the turntable, whole
const firstFigure = await page.evaluate(() => window.__creator ? window.__creator.figure() : null).catch(() => null);
const shownWhole = (id) => page.waitForFunction((want) => { const c = window.__creator; const r = c && c.rig; return !!(c && c.figure() === want && r && r.mixer); }, id, { timeout: 600000, polling: 100 }).then(() => page.evaluate(() => performance.now()), () => null);
const wholeAt = await shownWhole(firstFigure);
report.character = { figure: firstFigure, screenAt: await page.evaluate(() => window.__probe.marks.create), wholeAt: wholeAt && Math.round(wholeAt), fromPlay: wholeAt && Math.round(wholeAt - playAt), freezes: await longest(Math.round(playAt)), memory: await memory() };
console.log(`character screen at ${report.character.screenAt} ms; ${firstFigure} whole ${report.character.fromPlay} ms after PLAY`);
await page.screenshot({ path: resolve(out, '2-character.png') });

// ---- the arrow, pressed `arrows` times ----
for (let i = 0; i < arrows; i += 1) {
  const before = sentNow();
  const from = await page.evaluate(() => window.__creator.figure());
  // the press as the page meets it: when the event was made, when the screen first changed, when something of the next
  // figure was on the turntable, and when the whole of it was
  await page.evaluate(() => {
    const P = window.__probe; P.press = { made: null, received: null, answered: null, painted: null, atPaint: null };
    const btn = document.getElementById('fig-next');
    // when the touch was made (the event's time), when the page had it, and what the next frame painted showed
    btn.addEventListener('click', (e) => { P.press.made = e.timeStamp; P.press.received = performance.now(); requestAnimationFrame(() => { P.press.painted = performance.now(); const s = window.__creator.shown; P.press.atPaint = s ? { id: s.id, preview: s.preview || (window.__creator.rig && window.__creator.rig.mixer ? 'figure' : null) } : null; }); }, { capture: true, once: true });
    const count = document.getElementById('fig-count');
    const mo = new MutationObserver(() => { if (P.press.answered === null) P.press.answered = performance.now(); mo.disconnect(); });
    mo.observe(count, { childList: true, characterData: true, subtree: true });
  });
  const t0 = await page.evaluate(() => performance.now());
  await page.tap('#fig-next', { timeout: 600000 });
  const to = await page.waitForFunction((f) => { const c = window.__creator; return c.figure() !== f ? c.figure() : null; }, from, { timeout: 600000, polling: 50 }).then((h) => h.jsonValue());
  // something of it on the turntable: a preview (the new screen) or the figure itself, as the test sees it (from before
  // the test's own tap, which waits for the button to be ready: more than the player's touch; `paintedMs` is that)
  const something = await page.waitForFunction((want) => { const c = window.__creator; const s = c && c.shown; return (s && s.id === want && (s.preview || (c.rig && c.rig.mixer))) ? performance.now() : null; }, to, { timeout: 600000, polling: 50 }).then((h) => h.jsonValue(), () => null);
  const whole = await shownWhole(to);
  const press = await page.evaluate(() => window.__probe.press);
  const after = sentNow();
  const bytes = Object.entries(after).reduce((n, [p, s]) => n + Math.max(0, s.bytes - ((before[p] && before[p].bytes) || 0)), 0);
  const files = Object.entries(after).filter(([p, s]) => s.bytes - ((before[p] && before[p].bytes) || 0) > 0).map(([p, s]) => [p, s.bytes - ((before[p] && before[p].bytes) || 0)]);
  const row = { from, to, answeredMs: press.answered !== null && press.made !== null ? Math.round(press.answered - press.made) : null, paintedMs: press.painted !== null && press.made !== null ? Math.round(press.painted - press.made) : null, receivedMs: press.received !== null && press.made !== null ? Math.round(press.received - press.made) : null, shownMs: press.painted !== null && press.received !== null ? Math.round(press.painted - press.received) : null, atPaint: press.atPaint, somethingMs: something && Math.round(something - t0), wholeMs: whole && Math.round(whole - t0), bytes, files, freezes: await longest(Math.round(t0)), memory: await memory() };
  report.arrows.push(row);
  console.log(`arrow ${i + 1}: ${from} -> ${to}: the page had the touch after ${row.receivedMs} ms and its next frame, ${row.paintedMs} ms after the touch, showed ${JSON.stringify(row.atPaint)}; whole after ${row.wholeMs} ms, ${MB(bytes)} MB; graphics ${row.memory.graphicsMB} MB in ${row.memory.contexts} contexts, script ${row.memory.heapMB} MB`);
  await page.screenshot({ path: resolve(out, `3-arrow-${i + 1}.png`) });
}

// ---- an arrow pressed while the next figure is still arriving: answered in the very next frame, with something of
// the figure pressed for on the turntable, and the download on its way stopped where it was ----
{
  // (on the 4G link a figure arrives too soon to be pressed past on its way: for this, the link is Slow 4G again)
  if (fourG) server.setRate(204800);
  // two presses one after the other: the second figure is one that was not fetched ahead (the first may have been)
  const start = await page.evaluate(() => window.__creator.figure());
  await page.tap('#fig-next', { timeout: 600000 });
  await page.waitForFunction((f) => window.__creator.figure() !== f, start, { timeout: 600000, polling: 20 });
  const between = await page.evaluate(() => window.__creator.figure());
  await page.tap('#fig-next', { timeout: 600000 });
  await page.waitForFunction((f) => window.__creator.figure() !== f, between, { timeout: 600000, polling: 20 });
  const inFlight = await page.waitForFunction(() => { const c = window.__creator; return window.__nlw.heldModels().fetching.includes(c.figure()) ? c.figure() : null; }, null, { timeout: 120000, polling: 20 }).then((h) => h.jsonValue(), () => null);
  await page.evaluate(() => {
    const P = window.__probe; P.press = { made: null, answered: null, painted: null, atPaint: null };
    const btn = document.getElementById('fig-next');
    btn.addEventListener('click', (e) => { P.press.made = e.timeStamp; requestAnimationFrame(() => { P.press.painted = performance.now(); const s = window.__creator.shown; P.press.atPaint = s ? { id: s.id, preview: s.preview || (window.__creator.rig && window.__creator.rig.mixer ? 'figure' : null) } : null; }); }, { capture: true, once: true });
    const count = document.getElementById('fig-count');
    const mo = new MutationObserver(() => { if (P.press.answered === null) P.press.answered = performance.now(); mo.disconnect(); });
    mo.observe(count, { childList: true, characterData: true, subtree: true });
  });
  const t0 = await page.evaluate(() => performance.now());
  const stillComing = await page.evaluate((id) => window.__nlw.heldModels().fetching.includes(id), inFlight);
  await page.tap('#fig-next', { timeout: 600000 });
  const to = await page.waitForFunction((f) => { const c = window.__creator; return c.figure() !== f ? c.figure() : null; }, inFlight, { timeout: 600000, polling: 20 }).then((h) => h.jsonValue());
  await page.waitForTimeout(400);
  const after = await page.evaluate((id) => ({ fetching: window.__nlw.heldModels().fetching, stopped: window.__nlw.figureLog().filter((r) => r.id === id && r.stopped).length }), inFlight);
  const press = await page.evaluate(() => window.__probe.press);
  const whole = await shownWhole(to);
  report.inFlight = { from: inFlight, to, stillComing, answeredMs: press.answered !== null && press.made !== null ? Math.round(press.answered - press.made) : null, paintedMs: press.painted !== null && press.made !== null ? Math.round(press.painted - press.made) : null, atPaint: press.atPaint, stopped: !after.fetching.includes(inFlight) && after.stopped > 0, fetching: after.fetching, wholeMs: whole && Math.round(whole - t0) };
  console.log(`arrow pressed while ${inFlight} was arriving: answered in ${report.inFlight.answeredMs} ms, the next frame painted at ${report.inFlight.paintedMs} ms showing ${JSON.stringify(press.atPaint)}; ${inFlight}'s download stopped: ${report.inFlight.stopped}; ${to} whole after ${report.inFlight.wholeMs} ms`);
  await page.screenshot({ path: resolve(out, '4-arrow-in-flight.png') });
  if (fourG) server.setRate(9e6 / 8);
}

// ---- a returning player: the same opening again (the browser's cache and the service worker have the files) ----
await page.waitForTimeout(3000);
report.repeat = await opening('repeat visit');
report.serverTotal = server.total();
// The first visit as a whole, the opening and the character screen: any file sent in full more than once is a file
// fetched twice (the service worker's own fetching included).
{
  const first = everything[0] || {};
  report.firstWhole = { bytes: Object.values(first).reduce((n, x) => n + x.bytes, 0), twice: Object.entries(first).filter(([p, x]) => x.full > 1 && !p.startsWith('/api/')).map(([p, x]) => [p, x.full, x.bytes]) };
  console.log(`first visit in all: ${MB(report.firstWhole.bytes)} MB; sent in full more than once: ${JSON.stringify(report.firstWhole.twice)}`);
}
writeFileSync(resolve(out, 'opening.json'), JSON.stringify(report, null, 1));

if (checking) {
  const f = report.first, r = report.repeat;
  check('the splash is painted within 1 second (first visit)', f.splashPaint !== null && f.splashPaint <= 1000, f.splashPaint);
  check('PLAY within 8 seconds on a first visit', f.play <= 8000, f.play);
  check('PLAY within 3 seconds on a repeat visit', r.play <= 3000, r.play);
  check('one drawing surface (WebGL context) for the whole page', report.arrows.every((a) => a.memory.contexts <= 1) && report.character.memory.contexts <= 1, report.arrows.map((a) => a.memory.contexts));
  // (the time from the touch to the page having it is this browser's: here every frame is drawn by the processor, with
  // no graphics card, and a touch waits for the frame being drawn; what the page does with it is checked)
  for (const a of report.arrows) {
    check(`arrow ${a.from} -> ${a.to}: answered within one frame: the next frame shows the next character (its picture from all round, or itself)`, !!(a.atPaint && a.atPaint.id === a.to && a.atPaint.preview), a.atPaint);
    check(`arrow ${a.from} -> ${a.to}: something of it on the screen within 1 second of the touch`, a.paintedMs !== null && a.paintedMs <= 1000, { fromTheTouch: a.paintedMs, thePageHadIt: a.receivedMs, thenTheFrame: a.shownMs });
    check(`arrow ${a.from} -> ${a.to}: at most 3 MB fetched`, a.bytes <= 3 * 1048576, MB(a.bytes));
  }
  const q = report.inFlight;
  check('an arrow pressed while a figure is still arriving is answered within one frame: the next frame already shows the figure pressed for', q.stillComing && q.answeredMs !== null && q.paintedMs !== null && q.answeredMs <= q.paintedMs && q.atPaint && q.atPaint.id === q.to && !!q.atPaint.preview, q);
  check('and the figure that was arriving is stopped where it was, not fetched to the end', q.stopped, q);
  check('a first visit fetches no file in full twice', report.firstWhole.twice.length === 0, report.firstWhole.twice);
  check('no error in the page', errors.length === 0, errors.slice(0, 3));
}
console.log(JSON.stringify({ first: { splash: report.first.splashPaint, play: report.first.play, MB: MB(report.first.bytesBeforePlay) }, repeat: { splash: report.repeat.splashPaint, play: report.repeat.play, MB: MB(report.repeat.bytesBeforePlay) }, character: report.character.fromPlay, arrows: report.arrows.map((a) => ({ to: a.to, answered: a.answeredMs, something: a.somethingMs, whole: a.wholeMs, MB: MB(a.bytes) })) }));
await browser.close();
await server.close();
if (checking) { const failed = results.filter((ok) => !ok).length; console.log(`\n${results.length - failed} of ${results.length} checks passed`); process.exit(failed ? 1 : 0); }
