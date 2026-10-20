// The picture taken away and given back (20 October 2026, the owner: on his iPhone the game stopped with "The picture
// was lost", and he had to reload). A browser short of graphics memory may take a page's drawing surface (its WebGL
// context) away and give it back a moment later. On the website as it is built (prototype/dist/site, with the server
// behind it), phone-sized, in a headless browser, the surface is taken away with WEBGL_lose_context:
//  - on the character screen: a calm card ("One moment"), no question; given back, the card goes and the figure on the
//    turntable is drawn again with its pictures (its colours as they were, not black), with nothing reloaded;
//  - in town: the same; the town and the player's own figure drawn again as they were, every picture that had been let
//    go made again, and no frame failing afterwards;
//  - not given back: after about five seconds, the card says what happened in plain words, with one button (Continue)
//    and no word of how the browser works; Continue opens the game straight into the town where the player was,
//    without the opening.
//   ../server/with-postgres.sh node test/context.mjs [shots folder]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const here = dirname(fileURLToPath(import.meta.url));
const { createDevServer } = await import(resolve(here, '../../server/dev.mjs'));
const out = process.argv[2] || '/tmp/context-shots';
mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); };

const server = createDevServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
await context.addInitScript(() => {
  window.__contexts = 0;
  const get = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (k, ...r) { const c = get.call(this, k, ...r); if (c && /webgl/.test(k) && !c.__n) { c.__n = 1; window.__contexts += 1; } return c; };
  // every question the page puts (the old dialog was one) and every reload, counted
  window.__asked = [];
  new MutationObserver(() => { const c = document.getElementById('confirm'); if (c && !c.hidden) { const t = document.getElementById('confirm-title'); const said = t ? t.textContent : ''; if (!window.__asked.includes(said)) window.__asked.push(said); } }).observe(document, { subtree: true, attributes: true, attributeFilter: ['hidden'], childList: true });
});
const page = await context.newPage();
page.setDefaultTimeout(300000);
const pageErrors = [];
page.on('pageerror', (e) => { pageErrors.push(e.message); console.log('page error:', e.message); });
let loads = 0;
page.on('load', () => { loads += 1; });

await page.goto(`${origin}/`);
await page.waitForFunction(() => document.getElementById('intro').classList.contains('ready'), null, { timeout: 300000 });
await page.waitForTimeout(500);
await page.evaluate(() => document.getElementById('cover-play').click());
await page.waitForSelector('#open-signup', { state: 'visible' });
await page.click('#open-signup');
await page.fill('#account-username', `Ctx_${Math.random().toString(36).slice(2, 8)}`);
await page.fill('#account-password', 'a password for the context test');
await page.click('#account-submit');
await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 120000 });
await page.waitForFunction(() => window.__nlw.intro.asking() || document.querySelector('#start').dataset.screen === 'create');
if (await page.evaluate(() => window.__nlw.intro.asking())) await page.evaluate(() => document.querySelector('.pick[data-path="hero"]').click());
await page.waitForFunction(() => window.__creator && window.__creator.rig && window.__creator.rig.mixer && !window.__creator.shown.preview, null, { timeout: 300000 });
await page.waitForTimeout(2500);

// the turntable's own pixels: the town's canvas, in the turntable's box, read straight after the turntable is drawn on
// it (its background is left clear, so the figure is what is not)
const turntable = () => page.evaluate(() => new Promise((done) => {
  const r = window.__nlw.renderer, render = r.render;
  r.render = function (...a) {
    const out = render.apply(this, a);
    const c = r.domElement;
    if (c.classList.contains('in-view')) {
      r.render = render;
      const gl = r.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, d = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, d);
      let n = 0; const sum = [0, 0, 0];
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { n += 1; sum[0] += d[i]; sum[1] += d[i + 1]; sum[2] += d[i + 2]; }
      done({ share: +(n / (w * h)).toFixed(3), colour: sum.map((v) => Math.round(v / Math.max(1, n))) });
    }
    return out;
  };
}));
const card = () => page.evaluate(() => ({ open: !document.getElementById('loading').hidden, kind: document.getElementById('loading').dataset.kind, title: document.getElementById('loading-title').textContent, note: document.getElementById('loading-note').textContent, button: document.getElementById('loading-action').hidden ? null : document.getElementById('loading-action').textContent, buttons: [...document.querySelectorAll('#loading button')].filter((b) => !b.hidden).length, question: !document.getElementById('confirm').hidden }));
const lose = () => page.evaluate(() => { window.__lose = window.__nlw.renderer.getContext().getExtension('WEBGL_lose_context'); window.__lose.loseContext(); });
const giveBack = () => page.evaluate(() => window.__lose.restoreContext());
const near = (a, b, most) => a.every((v, i) => Math.abs(v - b[i]) <= most);

// ---- on the character screen ----
const figureBefore = await turntable();
await page.screenshot({ path: resolve(out, '1-character.png') });
await lose();
await page.waitForTimeout(800);
const lostThere = await card();
await page.screenshot({ path: resolve(out, '2-character-lost.png') });
check('on the character screen, the surface taken away shows the calm card and puts no question', lostThere.open && lostThere.kind === 'wait' && lostThere.title === 'One moment' && !lostThere.question && lostThere.buttons === 0, lostThere);
await giveBack();
await page.waitForFunction(() => !window.__nlw.pictureGone && document.getElementById('loading').hidden, null, { timeout: 60000 });
await page.waitForTimeout(2500);
const figureAfter = await turntable();
const restoredThere = await page.evaluate(() => window.__nlw.restored);
await page.screenshot({ path: resolve(out, '3-character-given-back.png') });
check('given back, the card goes and the figure is drawn again in its own colours, every picture let go made again', figureAfter.share > figureBefore.share * 0.6 && near(figureAfter.colour, figureBefore.colour, 30) && restoredThere && restoredThere.pictures.failed === 0 && restoredThere.pictures.made > 0, { figureBefore, figureAfter, restored: restoredThere });

// ---- in town ----
await page.fill('#name', 'Context Tester');
await page.tap('#enter');
await page.waitForSelector('#confirm:not([hidden])');
await page.tap('#confirm-yes');
await page.waitForFunction(() => !document.querySelector('#hud').hidden && window.__nlw.playerId && window.__nlw.playing && window.__nlw.me && window.__nlw.me.mixer, null, { timeout: 600000 });
await page.evaluate(() => { const n = window.__nlw; const hour = n.view.clock.hourFloat; if (hour < 9 || hour > 16) n.skip((24 + 11 - hour) % 24); });
await page.waitForTimeout(5000);
// the player's own figure on the screen: its box, from the camera
const figureBox = () => page.evaluate(() => {
  const n = window.__nlw, T = n.THREE; const box = new T.Box3().setFromObject(n.me.group); const pts = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) pts.push(new T.Vector3(x, y, z).project(n.camera));
  const xs = pts.map((p) => (p.x + 1) / 2 * innerWidth), ys = pts.map((p) => (1 - p.y) / 2 * innerHeight);
  return { x: Math.max(0, Math.min(...xs)), y: Math.max(0, Math.min(...ys)), w: Math.min(innerWidth, Math.max(...xs)) - Math.max(0, Math.min(...xs)), h: Math.min(innerHeight, Math.max(...ys)) - Math.max(0, Math.min(...ys)) };
});
// what a screenshot shows: how much is lit, and the colour inside a box
const seen = async (name, box) => {
  const shot = await page.screenshot({ path: resolve(out, `${name}.png`) });
  return page.evaluate(async ({ b64, box }) => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const k = img.width / innerWidth;
    const all = g.getImageData(0, 0, c.width, c.height).data; let lit = 0;
    for (let i = 0; i < all.length; i += 16) if (all[i] + all[i + 1] + all[i + 2] > 30) lit += 1;
    const d = g.getImageData(Math.round(box.x * k), Math.round(box.y * k), Math.max(1, Math.round(box.w * k)), Math.max(1, Math.round(box.h * k))).data; const sum = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) { sum[0] += d[i]; sum[1] += d[i + 1]; sum[2] += d[i + 2]; }
    return { lit: +(lit / (all.length / 16)).toFixed(3), figure: sum.map((v) => Math.round(v / (d.length / 4))) };
  }, { b64: shot.toString('base64'), box });
};
const box = await figureBox();
const townBefore = await seen('4-town', box);
const held = await page.evaluate(() => ({ contexts: window.__contexts }));
await lose();
await page.waitForTimeout(1000);
const lostInTown = await card();
await page.screenshot({ path: resolve(out, '5-town-lost.png') });
check('in town, the surface taken away shows the calm card and puts no question', lostInTown.open && lostInTown.kind === 'wait' && !lostInTown.question && lostInTown.buttons === 0, lostInTown);
await giveBack();
await page.waitForFunction(() => !window.__nlw.pictureGone && document.getElementById('loading').hidden, null, { timeout: 120000 });
await page.waitForTimeout(4000);
const errorsAt = await page.evaluate(() => window.__nlw.frameErrors);
await page.waitForTimeout(3000);
const townAfter = await seen('6-town-given-back', await figureBox());
const restoredInTown = await page.evaluate(() => ({ restored: window.__nlw.restored, frameErrors: window.__nlw.frameErrors, contexts: window.__contexts, said: window.__nlw.watch.said }));
check('given back in town, the town is on the screen again and the player\'s figure is drawn in its own colours', townAfter.lit > 0.6 && townAfter.lit >= townBefore.lit - 0.1 && near(townAfter.figure, townBefore.figure, 30), { townBefore, townAfter, box });
check('every picture that had been let go is made again, the town\'s numbers given back, and no frame fails afterwards', restoredInTown.restored.pictures.failed === 0 && restoredInTown.restored.pictures.made > 0 && restoredInTown.restored.numbers > 0 && restoredInTown.frameErrors === errorsAt && !restoredInTown.said, restoredInTown);
check('still one drawing surface for the page, and nothing reloaded', restoredInTown.contexts === 1 && held.contexts === 1 && loads === 1, { contexts: restoredInTown.contexts, loads });

// ---- not given back ----
const where = await page.evaluate(() => { const n = window.__nlw; const p = n.host.game.state.players[n.playerId]; return { id: n.playerId, x: p.x, z: p.z }; });
await lose();
await page.waitForTimeout(6500);
const trouble = await card();
await page.screenshot({ path: resolve(out, '7-not-given-back.png') });
check('not given back within five seconds: one calm card, plain words, one button, Continue', trouble.open && trouble.kind === 'trouble' && trouble.buttons === 1 && trouble.button === 'Continue' && !trouble.question, trouble);
check('the card has no word of how the browser works', !/memory|graphic|context|webgl|gpu|browser|reload|error/i.test(`${trouble.title} ${trouble.note} ${trouble.button}`), trouble);
const askedBefore = await page.evaluate(() => window.__asked);
await Promise.all([page.waitForEvent('load', { timeout: 120000 }), page.tap('#loading-action')]);
const opening = await page.evaluate(() => ({ intro: !document.getElementById('intro').hidden, active: window.__nlw && window.__nlw.intro ? window.__nlw.intro.active() : null }));
check('Continue opens the game afresh without the opening', !opening.intro && opening.active === false, opening);
await page.waitForFunction(() => window.__nlw && !document.querySelector('#hud').hidden && window.__nlw.playing && window.__nlw.playerId, null, { timeout: 600000 });
const back = await page.evaluate(() => { const n = window.__nlw; const p = n.host.game.state.players[n.playerId]; return { id: n.playerId, x: p.x, z: p.z }; });
await page.waitForTimeout(3000);
await page.screenshot({ path: resolve(out, '8-carried-on.png') });
check('and straight into the town, the same player where they were', back.id === where.id && Math.hypot(back.x - where.x, back.z - where.z) < 3, { where, back });
const askedAfter = await page.evaluate(() => window.__asked);
check('no question about the picture was ever put (the old "The picture was lost" dialog)', askedBefore.concat(askedAfter).every((t) => !/picture/i.test(t)), { askedBefore, askedAfter });
check('no error in the page', pageErrors.length === 0, pageErrors);

const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nAll ${results.length} checks passed.`);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
