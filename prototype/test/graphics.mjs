// The graphics levels (23 October 2026, the owner's brief, its second stage), in the game as the website serves it
// (prototype/dist/site, with the server behind it), on a phone's settings and on a computer's:
//  - Auto's choice on a first start, and the level it settles at kept for the next (the silent test);
//  - Settings → Graphics: Auto, Low, Medium, High and Ultra, a line for each, the note on battery and heat;
//  - every level chosen there, one after another, without reloading: the pixels drawn, the sun's shadows, the frames
//    going on, nothing reloaded and no page error;
//  - memory freed when the level is lowered (the game's own count of the graphics card);
//  - Auto lowering the level by itself when frames are slow, and when the graphics card is nearly full, and saying so:
//    "Graphics lowered to keep the game smooth";
//  - the #stats readout: the level, the frames a second, the pictures on the graphics card, the card's name.
//   ../server/with-postgres.sh node test/graphics.mjs [shots folder]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const here = dirname(fileURLToPath(import.meta.url));
const { createDevServer } = await import(resolve(here, '../../server/dev.mjs'));
const { pastQuestion, enterTown } = await import(resolve(here, 'start.mjs'));
const { GRAPHICS_LEVELS, GRAPHICS_LOWERED, LEVEL_SETTINGS, LOW, autoStart } = await import(resolve(here, '../src/client/graphics.js'));
const out = process.argv[2] || '/tmp/graphics-shots';
mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); };

const server = createDevServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });

async function player(kind) {
  const phone = kind === 'phone';
  const context = await browser.newContext(phone ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: 'block' } : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(300000);
  const errors = [];
  page.on('pageerror', (e) => { errors.push(e.message); console.log(`${kind} page error:`, e.message); });
  let loads = 0;
  page.on('load', () => { loads += 1; });
  // (#stats: the readout in its corner; the toasts kept, so that what was said can be read after)
  await page.addInitScript(() => { window.__said = []; new MutationObserver(() => { for (const t of document.querySelectorAll('#toasts .toast, #toasts > *')) { const s = t.textContent.trim(); if (s && !window.__said.includes(s)) window.__said.push(s); } }).observe(document, { subtree: true, childList: true, characterData: true }); });
  await page.goto(`${origin}/#stats`);
  await page.waitForFunction(() => document.getElementById('intro').classList.contains('ready'), null, { timeout: 300000 });
  await page.evaluate(() => document.getElementById('cover-play').click());
  await page.waitForSelector('#open-signup', { state: 'visible' });
  await page.click('#open-signup');
  await page.fill('#account-username', `Gfx_${kind}_${Math.random().toString(36).slice(2, 7)}`);
  await page.fill('#account-password', 'a password for the graphics test');
  await page.click('#account-submit');
  await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 120000 });
  await pastQuestion(page);
  await page.fill('#name', `Gfx${kind}`);
  await enterTown(page, { tap: phone, wait: 900000 });
  return { kind, phone, context, page, errors, loads: () => loads };
}
const state = (page) => page.evaluate(() => {
  const n = window.__nlw, g = n.graphics || {};
  return { level: n.quality, detail: n.qualityDetail, choice: n.graphicsChoice, pixelRatio: n.renderer.getPixelRatio(), shadows: n.sunShadows, shadowMap: n.sky && n.sky.sun ? n.sky.sun.shadow.mapSize.x : null, shadowLive: !!(n.sky && n.sky.sun.shadow.map), heldMB: +(((g.pictures || 0) + (g.buffers || 0) + (g.screen || 0)) / 1048576).toFixed(1), picturesMB: +((g.pictures || 0) / 1048576).toFixed(1), frames: n.frameCount !== undefined ? n.frameCount : null, changes: n.governor.changes.slice(-3), stored: (() => { try { return localStorage.getItem('pcw-graphics-auto'); } catch (e) { return null; } })() };
});
const frames = (page) => page.evaluate(() => new Promise((done) => { let n = 0; const t0 = performance.now(); const f = () => { n += 1; if (n >= 3) done(performance.now() - t0); else requestAnimationFrame(f); }; requestAnimationFrame(f); }));

for (const kind of ['phone', 'computer']) {
  const p = await player(kind);
  const { page } = p;
  const gpu = await page.evaluate(() => { const gl = window.__nlw.renderer.getContext(); const i = gl.getExtension('WEBGL_debug_renderer_info'); return i ? gl.getParameter(i.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); });
  // ---- Auto's first choice: the device's kind and its graphics card (this machine draws in software: Low)
  const first = await state(page);
  const expected = autoStart({ lite: p.phone, gpu });
  check(`${kind}: Auto on a first start chooses by the device and its graphics card (${gpu.slice(0, 60)})`, first.choice === 'auto' && first.level >= expected, { first, expected });
  // ---- Settings → Graphics
  await page.evaluate(() => window.__nlw.ui.openPhone('settings'));
  await page.waitForSelector('#graphics-choice', { timeout: 60000 });
  const settings = await page.evaluate(() => ({
    buttons: [...document.querySelectorAll('#graphics-choice button')].map((b) => ({ label: b.textContent, value: b.dataset.graphics, pressed: b.getAttribute('aria-pressed') })),
    lines: [...document.querySelectorAll('#graphics-lines .setrow, #graphics-lines > *')].map((r) => r.textContent.trim()),
    note: document.querySelector('#graphics-lines').nextElementSibling.textContent,
  }));
  check(`${kind}: Settings has Graphics: Auto, Low, Medium, High, Ultra, a line for each, and the note on battery and heat`,
    settings.buttons.map((b) => b.label).join(',') === 'Auto,Low,Medium,High,Ultra' && settings.buttons[0].pressed === 'true' && settings.lines.length === 5 && /battery/.test(settings.note) && /warm/.test(settings.note), settings);
  await page.screenshot({ path: resolve(out, `${kind}-settings.png`) });
  // ---- every level, one after another, without reloading
  const seen = [];
  for (const id of ['ultra', 'high', 'medium', 'low', 'high']) {
    await page.evaluate((v) => document.querySelector(`#graphics-choice button[data-graphics="${v}"]`).click(), id);
    await frames(page); await page.waitForTimeout(1500); await frames(page);
    const s = await state(page);
    const level = GRAPHICS_LEVELS.findIndex((l) => l.id === id);
    const dpr = await page.evaluate(() => window.devicePixelRatio || 1);
    seen.push({ id, ...s, ok: s.level === level && s.choice === id && Math.abs(s.pixelRatio - Math.min(dpr, LEVEL_SETTINGS.pixelRatio[level])) < 1e-6 && s.shadows === (LEVEL_SETTINGS.shadowMap[level] > 0) && (!s.shadows || s.shadowMap === LEVEL_SETTINGS.shadowMap[level]) });
  }
  check(`${kind}: each level made at once, without reloading: its pixels, its sun shadows (none at Low), the frames going on`, seen.every((s) => s.ok) && p.loads() === 1 && p.errors.length === 0, { seen: seen.map(({ id, level, pixelRatio, shadows, shadowMap, ok }) => ({ id, level, pixelRatio, shadows, shadowMap, ok })), loads: p.loads(), errors: p.errors });
  // ---- memory freed when lowering
  await page.evaluate(() => document.querySelector('#graphics-choice button[data-graphics="ultra"]').click());
  for (let i = 0; i < 3; i += 1) { await frames(page); await page.waitForTimeout(1000); }
  const high = await state(page);
  await page.evaluate(() => document.querySelector('#graphics-choice button[data-graphics="low"]').click());
  for (let i = 0; i < 3; i += 1) { await frames(page); await page.waitForTimeout(1000); }
  const low = await state(page);
  check(`${kind}: lowered from Ultra to Low, the graphics card holds less (the sun's shadow map let go, fewer pixels drawn)`, low.heldMB < high.heldMB - 3 && !low.shadowLive, { ultraMB: high.heldMB, lowMB: low.heldMB, shadowAfter: low.shadowLive });
  await page.screenshot({ path: resolve(out, `${kind}-low.png`) });
  // ---- Auto lowers by itself when frames are slow (this machine draws in software: slow at Ultra), and says so
  await page.evaluate(() => document.querySelector('#graphics-choice button[data-graphics="auto"]').click());
  await page.evaluate(() => window.__nlw.ui.close());
  await page.evaluate(() => { const g = window.__nlw.governor; g.set(0, 'Auto: for the test'); window.__said = []; });
  await page.waitForFunction(() => window.__nlw.quality > 0, null, { timeout: 300000 }).catch(() => {});
  const slow = await state(page);
  const said = await page.evaluate(() => window.__said.slice());
  check(`${kind}: Auto lowers the level by itself when the frames are slow, and says "${GRAPHICS_LOWERED}"`, slow.level > 0 && slow.choice === 'auto' && said.some((s) => s.includes(GRAPHICS_LOWERED)) && /typical frame/.test(JSON.stringify(slow.changes)), { level: slow.level, changes: slow.changes, said });
  // ---- and when the graphics card is nearly full (the game's count made to read nine tenths and more of its budget)
  await page.evaluate(() => { const g = window.__nlw.governor; g.set(1, 'Auto: for the test'); g.hold(true); window.__said = []; });
  const budget = await page.evaluate(() => window.__nlw.graphicsBudget || null);
  await page.evaluate((mb) => { const g = window.__nlw.graphics; window.__fill = setInterval(() => { g.pictures = mb * 0.95 * 1048576; g.buffers = 0; }, 50); }, budget || 700);
  await page.waitForFunction(() => window.__nlw.quality > 1, null, { timeout: 30000 }).catch(() => {});
  await page.evaluate(() => { clearInterval(window.__fill); window.__nlw.governor.hold(false); });
  const full = await state(page);
  const saidFull = await page.evaluate(() => window.__said.slice());
  check(`${kind}: the graphics card nearly full: the level lowered a step, and said`, full.level === 2 && saidFull.some((s) => s.includes(GRAPHICS_LOWERED)) && /nearly full/.test(JSON.stringify(full.changes)), { budget, level: full.level, changes: full.changes, said: saidFull });
  // ---- the #stats readout
  await page.waitForTimeout(1500);
  const stats = await page.evaluate(() => { const b = document.getElementById('stats'); return b ? b.textContent : null; });
  check(`${kind}: #stats shows the level, the frames a second, the pictures on the graphics card and the card's name`, !!stats && /Graphics/.test(stats) && GRAPHICS_LEVELS.some((l) => stats.includes(l.name)) && /frames a second/.test(stats) && /pictures [\d.]+ MB/.test(stats) && stats.includes(gpu.slice(0, 20)), { stats: stats && stats.slice(0, 600) });
  // ---- the silent test kept its level for this device
  await page.evaluate(() => { window.__nlw.setGraphics('auto'); });
  await page.waitForFunction(() => { try { return !!localStorage.getItem('pcw-graphics-auto'); } catch (e) { return false; } }, null, { timeout: 150000 }).catch(() => {});
  const kept = await state(page);
  check(`${kind}: Auto keeps the level it settled at for this device's graphics card`, !!kept.stored && JSON.parse(kept.stored).gpu === gpu && Number.isInteger(JSON.parse(kept.stored).level), { stored: kept.stored });
  await page.screenshot({ path: resolve(out, `${kind}-auto.png`) });
  check(`${kind}: no page error, never reloaded`, p.errors.length === 0 && p.loads() === 1, { errors: p.errors, loads: p.loads() });
  await p.context.close();
}
await browser.close();
server.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
