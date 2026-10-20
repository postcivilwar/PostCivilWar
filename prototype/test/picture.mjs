// The town on the screen (19 October 2026, the owner: on his phone the game played on behind a picture purely black;
// 20 October 2026: and "The picture was lost" stopped it). In a headless browser, the page as it is built with no server:
//  - a frame that fails part way through a picture drawn elsewhere (as the warm-up and the phone's camera draw) does
//    not leave the town to be drawn there: the screen shows the town again straight after;
//  - drawing that fails frame after frame is told on the game's calm card, in plain words with one button (Continue),
//    and what was found in detail (the error, the device's graphics) is kept for the readout; the card goes when it
//    stops;
//  - a town drawn black at every point for a while is told the same way; the card goes when it is seen again;
//  - the graphics taken away shows only "One moment" over whatever was open (no question offering a reload: the
//    question already open stays as it was), and given back, the card goes and the town is drawn again;
//  - nothing is told while the town is seen.
// (test/context.mjs takes the graphics away on the website, on the character screen and in town, and leaves it away.)
//   node test/picture.mjs [shots folder]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pastQuestion, enterTown } from './start.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || '/tmp/picture-shots';
mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); };
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 560 } });
page.setDefaultTimeout(300000);
const consoleErrors = [];
page.on('pageerror', (e) => check('no error in the page', false, e.message));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
await page.goto(`file://${resolve(here, '../dist/local.html')}#nointro-gameclock`, { timeout: 300000 });
await pastQuestion(page);
await page.fill('#name', 'Picture Watcher').catch(() => {});
await enterTown(page);
await page.waitForFunction(() => window.__nlw.me && window.__nlw.me.mixer, null, { timeout: 240000 });
await page.evaluate(() => { const n = window.__nlw; const hour = n.view.clock.hourFloat; if (hour < 9 || hour > 16) n.skip((24 + 11 - hour) % 24); });
await page.waitForTimeout(4000);

// how much of the screen is not black (from a screenshot: what the player sees, the page's own buttons included)
const seen = async (name) => {
  const shot = await page.screenshot({ path: resolve(out, `${name}.png`) });
  return page.evaluate(async (b64) => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
    const c = document.createElement('canvas'); c.width = 100; c.height = 56; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 100, 56);
    const d = g.getImageData(0, 0, 100, 56).data; let lit = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 30) lit += 1;
    return +(lit / (d.length / 4)).toFixed(3);
  }, shot.toString('base64'));
};
const notice = () => page.evaluate(() => { const c = document.getElementById('loading'); return { said: window.__nlw.watch.said, shown: !!(c && !c.hidden), kind: c ? c.dataset.kind : '', title: document.getElementById('loading-title').textContent, text: document.getElementById('loading-note').textContent, button: document.getElementById('loading-action').hidden ? null : document.getElementById('loading-action').textContent, detail: window.__nlw.watch.detail }; });
const waitSaid = (want, ms) => page.waitForFunction((want) => (want ? !!window.__nlw.watch.said : !window.__nlw.watch.said), want, { timeout: ms }).then(() => true, () => false);
const plain = (n) => !/memory|graphic|context|webgl|gpu|reload|error/i.test(`${n.title} ${n.text} ${n.button}`);

const first = await seen('1-town');
check('the town is on the screen, and nothing is told', first > 0.6 && !(await notice()).shown, { lit: first, notice: await notice() });

// ---- a frame failing part way through a picture drawn elsewhere ----
await page.evaluate(() => {
  const n = window.__nlw, r = n.renderer, render = r.render;
  const tiny = new n.THREE.WebGLRenderTarget(4, 4, { depthBuffer: false });
  window.__failedBefore = n.frameErrors; r.render = function (scene, ...rest) { if (scene !== n.scene) return render.call(this, scene, ...rest); r.render = render; r.setRenderTarget(tiny); throw new Error('test: a picture drawn elsewhere failed part way'); };
});
await page.waitForTimeout(3000);
const after = await seen('2-after-a-failed-picture');
const target = await page.evaluate(() => window.__nlw.renderer.getRenderTarget());
check('a frame failing part way through a picture drawn elsewhere leaves the town on the screen', after > 0.6 && target === null && (await page.evaluate(() => window.__nlw.frameErrors - window.__failedBefore)) === 1 && !(await notice()).shown, { lit: after, target, errors: await page.evaluate(() => window.__nlw.frameErrors - window.__failedBefore) });

// ---- drawing failing frame after frame ----
await page.evaluate(() => { const r = window.__nlw.renderer; window.__render = r.render; r.render = function () { throw new Error('test: drawing failed'); }; });
const toldFailing = await waitSaid(true, 20000);
await page.waitForTimeout(300);
const failing = await notice();
await page.screenshot({ path: resolve(out, '3-drawing-failing.png') });
check('drawing that fails frame after frame is told on the calm card: plain words, one button, Continue', toldFailing && failing.shown && failing.kind === 'trouble' && failing.button === 'Continue' && plain(failing), failing);
check('what was found in detail is kept for the readout: the error and the device\'s graphics', /Drawing the town failed/.test(failing.detail) && /test: drawing failed/.test(failing.detail) && /graphics:/.test(failing.detail), failing.detail);
await page.evaluate(() => { window.__nlw.renderer.render = window.__render; });
check('the card goes once the town is drawn again', await waitSaid(false, 20000) && !(await notice()).shown, await notice());

// ---- drawn black ----
await page.evaluate(() => { window.__nlw.scene.visible = false; });
const toldBlack = await waitSaid(true, 60000);
await page.waitForTimeout(300);
const black = await notice();
await page.screenshot({ path: resolve(out, '4-drawn-black.png') });
check('a town drawn black at every point for a while is told on the calm card', toldBlack && /drawn black/.test(black.said) && black.shown && black.kind === 'trouble' && plain(black), black);
await page.evaluate(() => { window.__nlw.scene.visible = true; });
check('the card goes once the town is seen again', await waitSaid(false, 30000) && !(await notice()).shown, await notice());

// ---- the graphics taken away, with another question open ----
await page.evaluate(() => { window.__nlw.confirm.ask({ title: 'Another question', body: 'Open when the picture is lost', confirm: 'Yes', cancel: 'No' }); });
await page.waitForTimeout(500);
await page.evaluate(() => { window.__lose = window.__nlw.renderer.getContext().getExtension('WEBGL_lose_context'); window.__lose.loseContext(); });
await page.waitForTimeout(1000);
const lost = await notice();
const question = await page.evaluate(() => ({ open: window.__nlw.confirm.isOpen, shown: !document.getElementById('confirm').hidden, text: document.getElementById('confirm-title').textContent, cardOver: Number(getComputedStyle(document.getElementById('loading')).zIndex) > Number(getComputedStyle(document.getElementById('confirm')).zIndex || 0) }));
await page.screenshot({ path: resolve(out, '5-graphics-lost.png') });
check('the graphics taken away shows the calm card, "One moment", with nothing to press', lost.shown && lost.kind === 'wait' && lost.title === 'One moment' && lost.button === null && plain(lost) && !lost.said, lost);
check('no question offering a reload: the question already open stays as it was, under the card', question.open && question.shown && /Another question/.test(question.text) && question.cardOver, question);
await page.evaluate(() => window.__lose.restoreContext());
const given = await page.waitForFunction(() => !window.__nlw.pictureGone && document.getElementById('loading').hidden, null, { timeout: 120000 }).then(() => true, () => false);
await page.evaluate(() => { if (window.__nlw.confirm.isOpen) document.getElementById('confirm-no').click(); });
await page.waitForTimeout(3000);
const back = await seen('6-given-back');
check('given back, the card goes and the town is drawn again', given && back > 0.6 && !(await notice()).shown, { lit: back, restored: await page.evaluate(() => window.__nlw.restored) });

console.log('console errors written (expected: the ones made on purpose, and the context lost):', consoleErrors.length);
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nAll ${results.length} checks passed.`);
await browser.close();
process.exit(failed ? 1 : 0);
