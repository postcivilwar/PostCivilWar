// The phone in the hand, measured on both figures in a headless browser: the handset is in the palm (by the
// knuckles, not out at the wrist or up the forearm), the hand is behind it, the four fingers come round its far
// edge and the thumb lies on its near one, and the glass faces the figure's own eyes. Then it is put away and
// is gone. Measured from the figures' own bones, so it holds for either figure at any size.
//   node test/hold.mjs
// Needs Playwright with Chromium and a built dist/local.html. Not part of the unit tests.
import { pastQuestion, enterTown } from './start.mjs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const here = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); };
const measure = () => {
  const n = window.__nlw; const prop = n.phoneHold.prop; prop.updateMatrixWorld(true);
  const at = (name) => { const b = n.me.bones.get(name); return b ? b.getWorldPosition(new THREE.Vector3()) : null; };
  const P = prop.getWorldPosition(new THREE.Vector3());
  const wrist = at('hand_r'), knuckle = at('middle_01_r'), elbow = at('lowerarm_r'), head = at('head');
  const glass = new THREE.Vector3(0, 0, 1).transformDirection(prop.matrixWorld);
  const inside = (name) => { const p = at(name); return p ? prop.worldToLocal(p.clone()).toArray().map((x) => +x.toFixed(3)) : null; };
  const r = (x) => +x.toFixed(3);
  return {
    out: n.phoneHold.out, shown: prop.visible, hand: r(wrist.distanceTo(knuckle)),
    toWrist: r(P.distanceTo(wrist)), toKnuckle: r(P.distanceTo(knuckle)), toElbow: r(P.distanceTo(elbow)),
    faces: r(glass.dot(head.clone().sub(P).normalize())),
    knuckle: inside('middle_01_r'), wrist: inside('hand_r'),
    fingers: ['index_03_r', 'middle_03_r', 'ring_03_r', 'pinky_03_r'].map(inside), thumb: inside('thumb_03_r'),
  };
};
for (const [who, label] of [['f', 'the woman'], ['m', 'the man']]) {
  const context = await browser.newContext({ viewport: { width: 800, height: 700 }, deviceScaleFactor: 1 });
  const page = await context.newPage(); page.setDefaultTimeout(180000);
  page.on('pageerror', (e) => check(`${label}: no error in the page`, false, e.message));
  await page.goto('file://' + resolve(here, '../dist/local.html') + '#nointro-gameclock', { timeout: 300000 });
  await page.waitForFunction(() => !!(window.__nlw && window.__nlw.ready), null, { timeout: 300000 });
  await pastQuestion(page);
  await page.click(`#genders [data-gender="${who}"]`);
  await page.fill('#name', 'Hold Test'); await enterTown(page);
  await page.waitForFunction(() => window.__nlw.view && !document.querySelector('#hud').hidden);
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__nlw.place(-2, 80));
  const before = await page.evaluate(() => ({ out: window.__nlw.phoneHold.out, shown: window.__nlw.phoneHold.prop.visible }));
  check(`${label}: before the phone is taken out there is no handset`, before.out === 0 && !before.shown, before);
  await page.evaluate(() => window.__nlw.ui.openPhone());
  await page.waitForFunction(() => window.__nlw.phoneHold.ready, null, { timeout: 60000 });
  await page.waitForTimeout(700);
  for (const [how, keys] of [['standing', null], ['walking', 'w']]) {
    if (keys) { await page.keyboard.down(keys); await page.waitForTimeout(1800); }
    const m = await page.evaluate(measure);
    if (keys) await page.keyboard.up(keys);
    const half = 0.147 / 2;       // the handset is 147 mm long
    check(`${label}, ${how}: the handset is out and showing`, m.out > 0.97 && m.shown, { out: m.out });
    check(`${label}, ${how}: it is by the knuckles, not at the wrist`, m.toKnuckle < m.toWrist - 0.03 && m.toKnuckle < half + 0.02, { toKnuckle: m.toKnuckle, toWrist: m.toWrist });
    check(`${label}, ${how}: and nowhere near the forearm`, m.toElbow > 0.25 && m.toWrist < m.hand + 0.06, { toElbow: m.toElbow, toWrist: m.toWrist, hand: m.hand });
    check(`${label}, ${how}: the hand is behind it, touching its back`, m.knuckle[2] < -0.004 && m.knuckle[2] > -0.05 && m.wrist[2] < 0 && m.wrist[2] > -0.06, { knuckle: m.knuckle, wrist: m.wrist });
    check(`${label}, ${how}: the hand lies within the handset's width`, Math.abs(m.knuckle[0]) < 0.036 + 0.01, m.knuckle);
    check(`${label}, ${how}: the four fingers come round the far edge`, m.fingers.every((t) => t && t[0] < -0.01 && t[2] > -0.012 && t[2] < 0.03), m.fingers);
    check(`${label}, ${how}: the thumb lies on the near edge, at the front`, !!m.thumb && m.thumb[0] > 0.01 && m.thumb[2] > 0 && m.thumb[2] < 0.035, m.thumb);
    check(`${label}, ${how}: the glass faces the figure's eyes`, m.faces > 0.8, m.faces);
  }
  await page.keyboard.press('Tab');
  await page.waitForFunction(() => window.__nlw.phoneHold.out === 0, null, { timeout: 30000 }).catch(() => {});
  const after = await page.evaluate(() => ({ out: window.__nlw.phoneHold.out, shown: window.__nlw.phoneHold.prop.visible }));
  check(`${label}: put away, the handset is gone`, after.out === 0 && !after.shown, after);
  await context.close();
}
await browser.close();
console.log(results.every(Boolean) ? 'hold: ok' : 'hold: FAILURES');
process.exit(results.every(Boolean) ? 0 : 1);
