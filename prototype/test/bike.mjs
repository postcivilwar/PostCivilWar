// The power bike's controls and its engine, in a headless browser on the website as it is served. No power bike
// is in the game yet (its model has not been supplied), so the controls are put on screen by the test hook
// (__nlw.bikePreview) with nothing to ride: their layout, their pressed look and what they send are checked, and
// that the walking controls come back exactly as they were. Each engine is played into an offline recorder and
// measured: it is heard, it climbs with the revs, and no two engines are the same.
//   ../server/with-postgres.sh node test/bike.mjs [shots folder]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDevServer } from '../../server/dev.mjs';
import { pastQuestion, enterTown } from './start.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const out = process.argv[2] || '/tmp/bike-shots';
mkdirSync(out, { recursive: true });
const server = createDevServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
// The website asks for an account before play: one is made, as a player makes one.
async function signUp(page, prefix) {
  await page.waitForSelector('#open-signup', { state: 'visible', timeout: 300000 });
  await page.click('#open-signup');
  await page.waitForSelector('#account:not([hidden])');
  await page.fill('#account-username', `${prefix}_${Math.random().toString(36).slice(2, 8)}`);
  await page.fill('#account-password', 'a password for the browser test');
  await page.click('#account-submit');
  await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 120000 });
}
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); };

for (const size of [{ width: 800, height: 360 }, { width: 390, height: 844 }]) {
  const label = `${size.width}x${size.height}`;
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
  const page = await context.newPage(); page.setDefaultTimeout(240000);
  page.on('pageerror', (e) => check(`${label}: no error in the page`, false, e.message));
  await page.goto(`${origin}/#nointro-gameclock-lite`, { timeout: 300000 });
  await page.waitForFunction(() => !!(window.__nlw && window.__nlw.intro), null, { timeout: 300000 });
  await signUp(page, 'Bike');
  await pastQuestion(page);
  await page.fill('#name', 'Bike Test');
  await enterTown(page, { tap: true });
  await page.waitForTimeout(1500);
  const walking = await page.evaluate(() => ({ pads: window.__nlw.controls.shown.map((b) => b.id), stick: getComputedStyle(document.querySelector('#stick')).display }));
  const shown = await page.evaluate(() => window.__nlw.bikePreview(true).map((b) => b.id));
  await page.waitForTimeout(400);
  check(`${label}: on a power bike, its own buttons`, ['throttle', 'brake', 'steer-left', 'steer-right', 'horn'].every((id) => shown.includes(id)) && !shown.includes('run'), shown);
  const boxes = await page.evaluate(() => {
    const at = (id) => { const e = document.querySelector(`#pad [data-id="${id}"]`); const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, shown: getComputedStyle(e).display !== 'none' }; };
    return { W: innerWidth, H: innerHeight, stick: getComputedStyle(document.querySelector('#stick')).display, left: at('steer-left'), right: at('steer-right'), throttle: at('throttle'), brake: at('brake'), horn: at('horn') };
  });
  const { W, H } = boxes;
  check(`${label}: the walking stick is gone`, boxes.stick === 'none', boxes.stick);
  check(`${label}: the two steering arrows at the lower left, side by side`, boxes.left.r <= boxes.right.l + 1 && boxes.right.r < W / 2 && boxes.left.b > H * 0.6 && boxes.left.l >= 8, { left: boxes.left, right: boxes.right });
  check(`${label}: the throttle and the brake at the right, low down`, boxes.throttle.l > W / 2 && boxes.brake.l > W / 2 - 40 && boxes.throttle.b > H * 0.6 && boxes.throttle.r <= W - 8, { throttle: boxes.throttle, brake: boxes.brake });
  check(`${label}: the horn high up`, boxes.horn.t < H * 0.45 && boxes.horn.r <= W - 8, boxes.horn);
  check(`${label}: each big enough for a thumb`, ['left', 'right', 'throttle', 'brake', 'horn'].every((k) => boxes[k].w >= 52 && boxes[k].h >= 52), null);
  const clash = await page.evaluate(() => {
    const seen = [...document.querySelectorAll('.pad, #btn-phone, #chat-btn, #vitals, .plate, .purse, #hud-dash, #radar, .skills-btn')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && !e.closest('[hidden]') && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden'; });
    const rs = seen.map((e) => { const r = e.getBoundingClientRect(); return { e, id: e.dataset.id || e.id || e.className, l: r.left, t: r.top, r: r.right, b: r.bottom }; });
    const outs = [];
    for (let i = 0; i < rs.length; i += 1) for (let j = i + 1; j < rs.length; j += 1) { const a = rs[i], b = rs[j]; if (a.e.contains(b.e) || b.e.contains(a.e)) continue; if (Math.min(a.r, b.r) - Math.max(a.l, b.l) > 2 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 2) outs.push(`${a.id} / ${b.id}`); }
    for (const a of rs) if (a.l < -1 || a.t < -1 || a.r > innerWidth + 1 || a.b > innerHeight + 1) outs.push(`${a.id} off the screen`);
    return outs;
  });
  check(`${label}: nothing on top of anything else, nothing off the screen`, clash.length === 0, clash);
  await page.screenshot({ path: resolve(out, `bike-${label}-1.png`) });
  // held: lit, and what it sends
  const press = async (id) => { const b = boxes[{ 'steer-left': 'left', 'steer-right': 'right' }[id] || id]; const x = (b.l + b.r) / 2, y = (b.t + b.b) / 2; await page.evaluate(([px, py, pid]) => { const el = document.elementFromPoint(px, py); el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: pid, clientX: px, clientY: py, bubbles: true, pointerType: 'touch' })); }, [x, y, id.length]); };
  const lift = async (id) => { await page.evaluate((pid) => { const el = document.querySelector(`#pad [data-id="${pid}"]`); el.dispatchEvent(new PointerEvent('pointerup', { pointerId: pid.length, bubbles: true, pointerType: 'touch' })); }, id); };
  const before = await page.evaluate(() => getComputedStyle(document.querySelector('#pad [data-id="steer-left"]')).backgroundColor);
  await press('steer-left'); await press('throttle');
  await page.waitForTimeout(200);
  const held = await page.evaluate(() => (document.getAnimations().forEach((a) => a.finish()), { input: window.__nlw.bikeInput, lit: [...document.querySelectorAll('#pad .pad.down')].map((e) => e.dataset.id), bg: getComputedStyle(document.querySelector('#pad [data-id="steer-left"]')).backgroundColor }));
  check(`${label}: held, steer left and the throttle are sent`, held.input.steer === -1 && held.input.throttle === 1 && held.input.brake === 0, held.input);
  check(`${label}: and both light up while held`, held.lit.includes('steer-left') && held.lit.includes('throttle') && held.bg !== before, { lit: held.lit, before, after: held.bg });
  await page.screenshot({ path: resolve(out, `bike-${label}-2-held.png`) });
  await lift('steer-left'); await lift('throttle'); await press('steer-right'); await press('brake'); await page.waitForTimeout(150);
  const other = await page.evaluate(() => window.__nlw.bikeInput);
  check(`${label}: steer right and the brake`, other.steer === 1 && other.brake === 1 && other.throttle === 0, other);
  await lift('steer-right'); await lift('brake'); await page.waitForTimeout(150);
  const none = await page.evaluate(() => ({ input: window.__nlw.bikeInput, lit: document.querySelectorAll('#pad .pad.down').length }));
  check(`${label}: let go, nothing is sent and nothing is lit`, none.input.steer === 0 && none.input.throttle === 0 && none.input.brake === 0 && none.lit === 0, none);
  // off the bike: the walking controls exactly as they were
  const back = await page.evaluate(() => window.__nlw.bikePreview(false).map((b) => b.id));
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({ stick: getComputedStyle(document.querySelector('#stick')).display, bike: document.querySelector('#touch').classList.contains('bike') }));
  check(`${label}: off the bike, the walking controls come back as they were`, JSON.stringify(back) === JSON.stringify(walking.pads) && after.stick === walking.stick && !after.bike, { back, walking });

  if (size.width === 800) {
    // the engines: each heard, each climbing with the revs, no two alike; the horns
    const sound = await page.evaluate(async () => {
      const A = window.__nlw.bikeAudio;
      const pitchOf = (data, rate) => {
        // the strongest period between 15 and 400 Hz, by autocorrelation
        let best = 0, lag = 0;
        for (let L = Math.floor(rate / 400); L < Math.floor(rate / 15); L += 1) { let sum = 0; for (let i = 0; i < 8192; i += 1) sum += data[i] * data[i + L]; if (sum > best) { best = sum; lag = L; } }
        return rate / lag;
      };
      const res = {};
      for (const [id, profile] of Object.entries(A.BIKE_SOUNDS)) {
        const levels = [];
        for (const rev of [0.05, 0.7]) {
          const rate = 22050; const ctx = new OfflineAudioContext(1, rate * 3, rate);
          const noise = ctx.createBuffer(1, rate, rate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
          const engine = A.createBikeEngine(ctx, ctx.destination, profile, { noise });
          engine.start(0);
          engine.set(rev, rev > 0.5 ? 1 : 0, 1.6);
          const buf = await ctx.startRendering();
          const data = buf.getChannelData(0).slice(Math.floor(rate * 2.3));
          let rms = 0; for (const v of data) rms += v * v; rms = Math.sqrt(rms / data.length);
          let peak = 0; for (const v of buf.getChannelData(0)) peak = Math.max(peak, Math.abs(v));
          levels.push({ rev, rms: +rms.toFixed(4), peak: +peak.toFixed(3), firing: +A.firingHz(profile, rev).toFixed(1) });
        }
        res[id] = levels;
      }
      const horns = {};
      for (const [id, horn] of Object.entries(A.BIKE_HORNS)) { const ctx = new OfflineAudioContext(1, 22050, 22050); A.soundBikeHorn(ctx, ctx.destination, horn, 0); const buf = await ctx.startRendering(); let rms = 0; for (const v of buf.getChannelData(0)) rms += v * v; horns[id] = +Math.sqrt(rms / buf.length).toFixed(4); }
      return { res, horns };
    });
    for (const [id, levels] of Object.entries(sound.res)) {
      check(`engine ${id}: heard at idle and at high revs, and never clipping`, levels.every((l) => l.rms > 0.01 && l.peak < 1), levels);
      check(`engine ${id}: its beat climbs with the revs`, levels[1].firing > levels[0].firing * 2, levels);
    }
    const idles = Object.values(sound.res).map((l) => l[0].firing);
    check('no two engines beat alike at idle', new Set(idles.map((f) => Math.round(f))).size === idles.length, idles);
    check('the horns sound', Object.values(sound.horns).every((v) => v > 0.01), sound.horns);
  }
  await context.close();
}
await browser.close(); server.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nAll ${results.length} checks passed.`);
process.exit(failed ? 1 : 0);
