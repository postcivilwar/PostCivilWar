// The graphics levels (23 October 2026, the owner's brief, its second stage), in the game as the website serves it
// (prototype/dist/site, with the server behind it), on a phone's settings and on a computer's:
//  - Auto's choice on a first start, and the level it settles at kept for the next (the silent test);
//  - Settings → Graphics: Auto, Low, Medium, High and Ultra, a line for each, the note on battery and heat;
//  - every level chosen there, one after another, without reloading: the pixels drawn, the sun's shadows, the frames
//    going on, nothing reloaded and no page error;
//  - memory freed when the level is lowered (the game's own count of the graphics card);
//  - Auto lowering the level by itself when frames are slow, and when the graphics card is nearly full, and saying so:
//    "Graphics lowered to keep the game smooth";
//  - the #stats readout: the level, the frames a second, the pictures on the graphics card, the card's name;
//  - on a phone, the owner's box truck drawn from 512 pictures from far off and at its own size near it, and the signs'
//    pictures out of sight for half a minute let go from the graphics card.
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
const { pastQuestion, enterTown, watchPictures, lostPictures } = await import(resolve(here, 'start.mjs'));
const { GRAPHICS_LEVELS, GRAPHICS_LOWERED, LOW, levelSetting, autoStart } = await import(resolve(here, '../src/client/graphics.js'));
const { SUPPLIED_VEHICLES } = await import(resolve(here, '../src/sim/zones/supplied-vehicles.js'));
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
  // (every picture handed to the graphics card watched for one the page had let go of: none is drawn black)
  await watchPictures(context);
  const page = await context.newPage();
  page.setDefaultTimeout(300000);
  const errors = [];
  page.on('pageerror', (e) => { errors.push(e.message); console.log(`${kind} page error:`, e.message); });
  // (and any of the 3D library's own complaints: a shader that would not compile, a picture it could not make)
  page.on('console', (m) => { if (m.type() === 'error' && /THREE|shader|WebGL/i.test(m.text())) { errors.push(m.text().slice(0, 400)); console.log(`${kind} console:`, m.text().slice(0, 400)); } });
  let loads = 0;
  page.on('load', () => { loads += 1; });
  // (#stats: the readout in its corner; the notices kept, so that what was said can be read after)
  await page.addInitScript(() => { window.__said = []; window.__lowered = 0; const seen = new WeakSet(); new MutationObserver(() => { for (const t of document.querySelectorAll('#notices > *')) { if (seen.has(t)) continue; const s = t.textContent.trim(); if (!s) continue; seen.add(t); window.__said.push(s); if (s.includes('Graphics lowered')) window.__lowered += 1; } }).observe(document, { subtree: true, childList: true, characterData: true }); });
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
  return { ...n.levelState, level: n.quality, detail: n.qualityDetail, choice: n.graphicsChoice, shadowLive: !!(n.sky && n.sky.sun.shadow.map), heldMB: +(((g.pictures || 0) + (g.buffers || 0) + (g.screen || 0)) / 1048576).toFixed(1), picturesMB: +((g.pictures || 0) / 1048576).toFixed(1), frames: n.frameCount !== undefined ? n.frameCount : null, changes: n.governor.changes.slice(-3), stored: (() => { try { return localStorage.getItem('pcw-graphics-auto'); } catch (e) { return null; } })() };
});
const frames = (page) => page.evaluate(() => new Promise((done) => { let n = 0; const t0 = performance.now(); const f = () => { n += 1; if (n >= 3) done(performance.now() - t0); else requestAnimationFrame(f); }; requestAnimationFrame(f); }));

// Stage 3's realism at a level (23 and 24 October 2026): every setting as the level has it; the light from the whole sky
// from Medium up; the glow drawn from Medium up and let go at Low; the soft darkening fetched and drawn at High and
// Ultra, let go below; the grade at every level.
const STAGE3 = ['clouds', 'haze', 'mirage', 'glint', 'puddles', 'glow', 'glowWide', 'flare', 'dust', 'fireflies', 'wetTracks', 'ao', 'waves', 'foam', 'mirror'];
function stage3(s, at) {
  const settings = STAGE3.every((k) => s.airLevel && s.airLevel[k] === at(k));
  const sky = s.skyLight === at('skyLight');
  const glow = at('glow') > 0 ? !!s.glow && s.glow.applied > 0 && s.glow.width > 0 : !s.glow || s.glow.width === 0;
  const ao = at('ao') > 0 ? !!s.occlusion && s.occlusion.loaded && s.occlusion.applied > 0 && s.occlusion.width > 0 : !s.occlusion || s.occlusion.width === 0;
  const grade = s.toneMapping === 5;                         // (three.js's CustomToneMapping: the game's grade)
  const river = s.river && s.river.waves === at('waves') && s.river.foam === at('foam');
  return settings && sky && glow && ao && grade && river;
}
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
    const at = (key) => levelSetting(key, level, p.phone);
    const shadowMap = at('shadowMap');
    seen.push({ id, ...s, ok: s.level === level && s.choice === id && Math.abs(s.pixelRatio - Math.min(dpr, at('pixelRatio'))) < 1e-6
      && s.shadows === (shadowMap > 0) && (!s.shadows || (s.shadowMap === shadowMap && s.shadowReach === at('shadowReach') && Math.abs(s.softness - at('shadowSoft')) < 1e-6))
      // (the soft patch under each vehicle at every level since stage 3: as dark as before without the sun's shadows, lighter with them)
      && s.patches === true && Math.abs(s.patchOpacity - (s.shadows ? 0.17 : 0.32)) < 1e-6 && s.finish.reflections === at('reflections') && s.finish.water === at('water') && Math.abs(s.view - at('view')) < 1e-6 && s.pictureMost === at('pictureMost')
      // (the waters' ripples and the sky in what gives it back, as the level has them)
      && (at('water') === 'full' ? s.finish.rippling === s.finish.waters : s.finish.rippling === 0) && (at('reflections') === 'none' ? s.finish.withSky === 0 : s.finish.withSky > 0)
      // (stage 3: the light from the whole sky, the air, the glow, the soft darkening, the river, as the level has them)
      && stage3(s, at) });
  }
  check(`${kind}: each level made at once, without reloading: its pixels, its sun shadows (how far, how soft; none at Low), the soft patch under each vehicle (darker at Low), its largest picture, the sky in glass and water, the waters' ripples, how far one sees; and stage 3's light from the whole sky, air, glow, soft darkening and river as the level has them`, seen.every((s) => s.ok) && p.loads() === 1 && p.errors.length === 0, { seen: seen.map(({ id, level, pixelRatio, shadows, shadowMap, shadowReach, softness, patches, patchOpacity, finish, view, pictureMost, skyLight, toneMapping, glow, occlusion, river, air, ok }) => ({ id, level, pixelRatio, shadows, shadowMap, shadowReach, softness, patches, patchOpacity, reflections: finish.reflections, withSky: finish.withSky, water: finish.water, rippling: `${finish.rippling}/${finish.waters}`, view, pictureMost, skyLight, toneMapping, glow, occlusion, river, air, ok })), loads: p.loads(), errors: p.errors });
  // ---- memory freed when lowering
  // (with Settings shut, so that the town is drawn: a picture made again at another size goes to the graphics card when
  // it is next drawn; and each level's pictures all made before it is measured: glb.js makes them one at a time)
  await page.evaluate(() => window.__nlw.ui.close());
  const settled = () => page.waitForFunction(() => window.__nlw.levelState.picturesWaiting === 0, null, { timeout: 600000, polling: 1000 }).catch(() => {});
  const chooseAndSettle = async (id) => {
    await page.evaluate((v) => window.__nlw.setGraphics(v), id);
    await settled();
    for (let i = 0; i < 4; i += 1) { await frames(page); await page.waitForTimeout(1000); }
    await settled();
    return state(page);
  };
  const high = await chooseAndSettle('ultra');
  const low = await chooseAndSettle('low');
  check(`${kind}: lowered from Ultra to Low, the graphics card holds less: the pictures made smaller, the sun's shadow map let go, fewer pixels drawn`, low.heldMB < high.heldMB - 3 && low.picturesMB < high.picturesMB && !low.shadowLive && low.picturesWaiting === 0, { ultraMB: high.heldMB, lowMB: low.heldMB, ultraPicturesMB: high.picturesMB, lowPicturesMB: low.picturesMB, shadowAfter: low.shadowLive, ultraPictures: high.pictures, lowPictures: low.pictures });
  // and raised again: the pictures given back (as large as before, within a little: what was made meanwhile)
  const back = await chooseAndSettle('ultra');
  check(`${kind}: raised from Low to Ultra again, the pictures made large again`, back.picturesMB > low.picturesMB && back.picturesMB > high.picturesMB * 0.8, { ultraMB: high.picturesMB, lowMB: low.picturesMB, backMB: back.picturesMB, backPictures: back.pictures });
  await page.screenshot({ path: resolve(out, `${kind}-ultra-again.png`) });
  // ---- a phone: the owner's box truck from far off (more than 60 m) drawn from its pictures at 512, near it (within 40 m)
  // at their own size, and from far off again at 512 (render-supplied.js; none changed within ten seconds of the last)
  if (p.phone) {
    const T = SUPPLIED_VEHICLES.boxTruck;
    const truck = () => page.evaluate(() => {
      const n = window.__nlw, s = n.supplied.state().parked.find((q) => q.id === 'boxTruck');
      let map = null; n.supplied.parked.find((q) => q.id === 'boxTruck').holder.traverse((o) => { if (o.isMesh && o.name.startsWith('supplied-') && o.material.map) map = o.material.map; });
      return { loaded: s.loaded, want: s.want, thinned: s.thinned, drawn: map ? map.userData.drawn || 0 : null, cap: map ? map.userData.cap || 0 : null, waiting: n.levelState.picturesWaiting };
    });
    const until = async (test, ms) => { const t0 = Date.now(); let t = await truck(); while (!test(t) && Date.now() - t0 < ms) { await frames(page); await page.waitForTimeout(1000); t = await truck(); } return t; };
    const goTo = (x, z, h) => page.evaluate(([px, pz, ph]) => { const n = window.__nlw; n.place(px, pz); n.face(ph); n.cam.yaw = ph; }, [x, z, h]);
    // (at Medium, the memory guard kept off meanwhile: a phone's level is not lowered under the test)
    await page.evaluate(() => { window.__nlw.setGraphics('medium'); window.__nlw.graphicsPretend.extraMB = -100000; });
    // (from the town's east end, 187 m from it and within its reach, looking at it: a picture goes to the graphics card
    // when what it is on is drawn)
    const toTruck = Math.atan2(T.x - 200, T.z - 113);
    await goTo(200, 113, toTruck);
    const far = await until((t) => t.loaded && t.want === 512 && t.drawn === 512, 180000);
    await goTo(T.x - 3, T.z + 14, Math.PI);            // (14 m from it)
    const close = await until((t) => t.want === 0 && t.drawn > 512, 180000);
    await page.screenshot({ path: resolve(out, `${kind}-truck-near.png`) });
    await goTo(200, 113, toTruck);
    const again = await until((t) => t.want === 512 && t.drawn === 512, 180000);
    await page.evaluate(() => { window.__nlw.graphicsPretend.extraMB = 0; });
    check(`${kind}: the box truck from far off drawn from its pictures at 512, near it at their own size, from far off again at 512`, far.want === 512 && far.drawn === 512 && close.want === 0 && close.drawn === 1024 && again.want === 512 && again.drawn === 512, { far, close, again });
    // ---- a phone: the signs' pictures out of sight for half a minute let go from the graphics card, and handed to it
    // again when next drawn (picture-keeper.js): none drawn black
    const kept = (await state(page)).kept;
    // (one of them drawn again, on a little picture of its own: three.js hands it to the card again, and it is drawn as
    // it was painted, not black)
    const again2 = await page.evaluate(() => {
      const n = window.__nlw, T = n.THREE, r = n.renderer;
      const held = (x) => !!(r.properties.has(x) && r.properties.get(x).__webglTexture);
      const t = n.keeper.recent.reverse().find((x) => !held(x));
      if (!t) return null;
      const before = held(t);
      const target = new T.WebGLRenderTarget(16, 16), scene = new T.Scene(), cam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const plane = new T.Mesh(new T.PlaneGeometry(2, 2), new T.MeshBasicMaterial({ map: t, toneMapped: false }));
      scene.add(plane);
      const was = r.getRenderTarget();
      r.setRenderTarget(target); r.render(scene, cam);
      const px = new Uint8Array(16 * 16 * 4); r.readRenderTargetPixels(target, 0, 0, 16, 16, px);
      r.setRenderTarget(was);
      const after = held(t);
      let lit = 0; for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] > 30) lit += 1;
      plane.geometry.dispose(); plane.material.dispose(); target.dispose();
      return { size: [t.image.width, t.image.height], onCardBefore: before, onCardAfter: after, litPixels: lit };
    });
    check(`${kind}: signs and boards out of sight for half a minute let go from the graphics card, and one drawn again handed back as painted`, !!kept && kept.letGo > 0 && kept.MB > 0 && !!again2 && !again2.onCardBefore && again2.onCardAfter && again2.litPixels > 0 && (await lostPictures(page)) === 0, { kept, again: again2, lost: await lostPictures(page) });
  }
  // ---- Auto lowers by itself when frames are slow. (This machine draws in software, a frame at Ultra in a second or
  // more, and the game takes a frame of more than two seconds for the page being hidden, not for the game being slow:
  // so the frames it is given to judge here are frames of 45 ms, under thirty a second, one after another; and the card
  // is taken to hold little meanwhile, so that what lowers the level here is the frames, not the memory guard.)
  await page.evaluate(() => { window.__nlw.setGraphics('auto'); window.__nlw.graphicsPretend.extraMB = -100000; });
  await page.evaluate(() => { const g = window.__nlw.governor; g.set(0, 'Auto: for the test'); });
  await page.evaluate(() => new Promise((done) => { const g = window.__nlw.governor; let n = 0; const tick = () => { for (let i = 0; i < 20; i += 1) g.frame(45, 0.045); n += 1; if (window.__nlw.quality > 0 || n > 400) done(); else setTimeout(tick, 20); }; tick(); }));
  await page.evaluate(() => { window.__nlw.graphicsPretend.extraMB = 0; });
  await page.waitForTimeout(1500);
  const slow = await state(page);
  check(`${kind}: Auto lowers the level by itself when the frames are slow (under thirty a second)`, slow.level > 0 && slow.choice === 'auto' && /typical frame/.test(JSON.stringify(slow.changes.slice(-1))), { level: slow.level, changes: slow.changes });
  // ---- and when the graphics card is nearly full (the game's count taken to hold its limit and a little more:
  // graphicsPretend; the count itself is redone as each picture goes to the card, and a test could not hold it there)
  await page.evaluate(() => { const g = window.__nlw.governor; g.set(1, 'Auto: for the test'); g.hold(true); });
  await settled();
  const budget = await page.evaluate(() => ({ budget: window.__nlw.graphicsBudget, limit: window.__nlw.memoryLimit }));
  await page.evaluate((limit) => { const n = window.__nlw, g = n.graphics; n.graphicsPretend.extraMB = Math.max(0, limit * 1.05 - (g.pictures + g.buffers) / 1048576); }, budget.limit);
  await page.waitForFunction(() => window.__nlw.quality > 1, null, { timeout: 120000 }).catch(() => {});
  await page.evaluate(() => { window.__nlw.graphicsPretend.extraMB = 0; window.__nlw.governor.hold(false); });
  const full = await state(page);
  check(`${kind}: the graphics card nearly full: the level lowered a step`, full.level === 2 && /nearly full/.test(JSON.stringify(full.changes.slice(-1))), { budget, level: full.level, changes: full.changes });
  // ---- the player told, once: "Graphics lowered to keep the game smooth", however many times the game lowered it by
  // itself (here twice or more: for the frames, for the memory, and, on a phone at Ultra, for its own memory before that)
  await page.waitForTimeout(1500);
  const told = await page.evaluate(() => ({ lowered: window.__lowered, said: window.__said.filter((s) => /Graphics/.test(s)) }));
  const byItself = full.changes.filter((c) => c.to > c.from && /typical frame|nearly full|gave the picture up/.test(c.why)).length;
  check(`${kind}: the player is told once, "${GRAPHICS_LOWERED}", though the game lowered the level by itself ${byItself} times`, told.lowered === 1 && told.said.every((s) => s.includes(GRAPHICS_LOWERED)), { told, byItself });
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
