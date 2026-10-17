// The touch controls, played in a headless browser with real touch input:
// the Run button with one finger and with two, and every way into and out of
// a run (walk, run, stop, a panel, a vehicle, the page losing focus). Also what
// the buttons are: pictures, not words, on no background; the two pedals at the
// wheel; and the notice card, which is small, dark and near the top.
//   node test/touch.mjs
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
const context = await browser.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const page = await context.newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto('file://' + resolve(here, '../dist/local.html') + '#nointro-gameclock', { timeout: 300000 });
await pastQuestion(page);
await page.fill('#name', 'Run Test'); await enterTown(page, { tap: true }); await page.waitForTimeout(1500);
const box = async (sel) => page.evaluate((s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; }, sel);
const cdp = await context.newCDPSession(page);
const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 8, radiusY: 8, force: 1 })) });
const st = () => page.evaluate(() => ({ run: window.__nlw.controls.state.run, mode: window.__nlw.mode, pressed: (document.querySelector('.pad[data-id=run]') || { getAttribute: () => 'absent' }).getAttribute('aria-pressed'), shown: window.__nlw.controls.shown.map((b) => b.label).join(','), z: window.__nlw.view.self.z, x: window.__nlw.view.self.x }));
const speed = async (seconds = 3) => { const a = await page.evaluate(() => ({ t: window.__nlw.host.game.state.real, x: window.__nlw.view.self.x, z: window.__nlw.view.self.z })); await page.waitForTimeout(seconds * 1000); const b = await page.evaluate(() => ({ t: window.__nlw.host.game.state.real, x: window.__nlw.view.self.x, z: window.__nlw.view.self.z })); return Math.hypot(b.x - a.x, b.z - a.z) / (b.t - a.t); };
const stick = await box('#stick'); let run = await box('.pad[data-id=run]');
const half = { x: stick.x, y: stick.y - stick.h * 0.25, id: 1 }, full = { x: stick.x, y: stick.y - stick.h * 0.5, id: 1 };
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); };
await page.evaluate(() => { window.__nlw.place(0, 60); window.__nlw.cam.yaw = Math.PI; });   // open road north
// what a button is: a picture with a name for a screen reader, no written label, nothing behind it
const pads = () => page.evaluate(() => [...document.querySelectorAll('.pad')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => { const c = getComputedStyle(e); const r = e.getBoundingClientRect(); return { id: e.dataset.id, text: e.textContent.trim(), icon: !!e.querySelector('svg.ico'), name: e.getAttribute('aria-label') || '', back: c.backgroundColor, held: e.getAttribute('aria-pressed'), w: r.width, h: r.height, l: r.left, t: r.top, r: r.right, b: r.bottom }; }));
const clear = (c) => /rgba\(\d+, \d+, \d+, 0(\.0\d*)?\)|transparent/.test(c);
let shownPads = await pads();
check('walking: every button is a picture, with a name, and no written label; no camera button on foot', shownPads.length >= 2 && !shownPads.some((b) => b.id === 'camera') && shownPads.every((b) => b.icon && b.text === '' && b.name.length > 1), shownPads.map((b) => [b.id, b.text, b.name]));
// every button is the owner's design of 16 October 2026: see-through, a thin luminous blue outline and a blue
// drawing (green only while it is pressed)
const look = (sel) => page.evaluate((q) => { const e = document.querySelector(q); if (!e) return null; const c = getComputedStyle(e); const i = e.matches('.pad') ? e.querySelector('.ico') : null; return { down: e.classList.contains('down') || e.classList.contains('held'), shadow: c.boxShadow, back: c.backgroundColor, ink: i ? getComputedStyle(i).color : null }; }, sel);
const BLUE = 'rgb(92, 176, 255)', GREEN = 'rgb(63, 226, 124)';
const alpha = (c) => { const m = c.match(/rgba?\(\d+, \d+, \d+(?:, ([\d.]+))?\)/); return m ? (m[1] === undefined ? 1 : +m[1]) : 1; };
const blue = (l) => !!l && !l.down && l.shadow.includes(BLUE) && alpha(l.back) < 0.3 && (l.ink === null || l.ink === BLUE);
const green = (l) => !!l && l.down && l.shadow.includes(GREEN) && alpha(l.back) < 0.3 && (l.ink === null || l.ink === GREEN);
const allLooks = await page.evaluate(() => [...document.querySelectorAll('.pad')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => `.pad[data-id="${e.dataset.id}"]`));
const looks = []; for (const q of allLooks) looks.push([q, await look(q)]);
check('every button: see-through, a thin blue outline and a blue drawing', looks.every(([, l]) => blue(l) || (l.down === false && l.shadow.includes(BLUE))), looks);
check('the stick: see-through, blue', blue(await look('#stick')), await look('#stick'));
check('every button is big enough for a thumb and on the screen', shownPads.every((b) => b.w >= 44 && b.h >= 44 && b.l >= 0 && b.t >= 0 && b.r <= 390 && b.b <= 800), shownPads.map((b) => [b.id, Math.round(b.w)]));
// the notice card: small, dark, near the top, and not across the middle of the screen
await page.evaluate(() => window.__nlw.ui.toast({ type: 'police', title: 'Under arrest', text: 'Insp. Perpetua Akinola has arrested you: taking a vehicle. You are being walked to the Police Post.' }));
await page.waitForTimeout(700);
const card = await page.evaluate(() => { const e = document.querySelector('#notices > *'); if (!e) return null; const r = e.getBoundingClientRect(); const c = getComputedStyle(e); const rgba = c.backgroundColor.match(/[\d.]+/g).map(Number); return { t: r.top, b: r.bottom, h: r.height, w: r.width, back: rgba, ink: c.color, through: getComputedStyle(e).pointerEvents }; });
check('a notice is a small card near the top', !!card && card.b < 800 * 0.36 && card.h < 120, card);
check('a notice is dark, see-through, with white writing', !!card && card.back[0] + card.back[1] + card.back[2] < 150 && (card.back[3] === undefined ? 1 : card.back[3]) < 0.9 && /rgb\(2[0-9]{2}, 2[0-9]{2}, 2[0-9]{2}\)/.test(card.ink), card);
// WALK: full stick without Run is a walk
await touch('touchStart', [{ ...stick, id: 1 }]); await touch('touchMove', [full]); await page.waitForTimeout(500);
check('the stick is green while a thumb is on it', green(await look('#stick')), await look('#stick'));
let v = await speed(); check('full stick, Run off: walking pace', v > 1.8 && v < 3.0, v.toFixed(2));
// WALK -> RUN with a second finger while the stick is held: green while it is down, blue the moment it is up
await touch('touchStart', [full, { ...run, id: 2 }]); await page.waitForTimeout(60);
const pressedLook = await look('.pad[data-id=run]');
await touch('touchEnd', [{ ...run, id: 2 }]); await page.waitForTimeout(120);
const releasedLook = await look('.pad[data-id=run]');
check('a button turns green the moment it is pressed', green(pressedLook), pressedLook);
check('and blue again the moment it is let go', !releasedLook.down && releasedLook.shadow.includes(BLUE), releasedLook);
await page.waitForTimeout(180);
let s = await st(); check('second finger switches Run on while moving', s.run === true && s.pressed === 'true', s);
v = await speed(); check('WALK -> RUN: running pace', v > 4.6 && v < 6.2, v.toFixed(2));
// RUN -> WALK
await touch('touchStart', [full, { ...run, id: 2 }]); await page.waitForTimeout(60); await touch('touchEnd', [{ ...run, id: 2 }]); await page.waitForTimeout(300);
s = await st(); v = await speed(); check('RUN -> WALK: second tap goes back to a walk', s.run === false && v > 1.8 && v < 3.0, { ...s, v: v.toFixed(2) });
// half stick walks slower, never runs
await touch('touchMove', [half]); await page.waitForTimeout(400); v = await speed(2); check('half stick: slow walk', v > 0.8 && v < 1.7, v.toFixed(2));
// RUN -> STOP: let go of the stick
await touch('touchStart', [half, { ...run, id: 2 }]); await page.waitForTimeout(60); await touch('touchEnd', [{ ...run, id: 2 }]); await touch('touchMove', [full]); await page.waitForTimeout(600);
await touch('touchEnd', []); await page.waitForTimeout(500);
v = await speed(1.5); s = await st(); check('RUN -> STOP: releasing the stick stops at once', v < 0.05, v.toFixed(2));
check('Run stays chosen while standing, and shows it', s.run === true && s.pressed === 'true', s);
// one finger alone still toggles
await touch('touchStart', [{ ...run, id: 3 }]); await page.waitForTimeout(60); await touch('touchEnd', []); await page.waitForTimeout(300);
s = await st(); check('one finger switches Run off', s.run === false && s.pressed === 'false', s);
await touch('touchStart', [{ ...run, id: 3 }]); await page.waitForTimeout(60); await touch('touchEnd', []); await page.waitForTimeout(300);
s = await st(); check('and on again (once per touch, no double toggle)', s.run === true, s);
// RUN -> INTERACTION: open the phone
await page.tap('#btn-phone'); await page.waitForTimeout(500);
s = await st(); check('RUN -> INTERACTION: a panel ends the run and hides the buttons', s.run === false && s.mode === 'panel' && s.shown === '', s);
await page.tap('.homebar'); await page.waitForTimeout(900);      // the bar at the foot of the handset puts it away
s = await st(); check('back from the panel: walking, Run off', s.mode === 'walking' && s.run === false && s.pressed === 'false', s);
// RUN -> VEHICLE: hire a keke by hand, switch Run on, get in
await page.evaluate(() => { const g = window.__nlw.host.game; const id = Object.keys(g.state.vehicles.list).find((k) => g.state.vehicles.list[k].kind === 'keke'); const veh = g.state.vehicles.list[id]; veh.hire = { playerId: window.__nlw.playerId, until: 1e12 }; window.__nlw.place(veh.x + 1.6, veh.z); });
await page.waitForTimeout(600);
run = await box('.pad[data-id=run]');
await touch('touchStart', [{ ...run, id: 3 }]); await page.waitForTimeout(60); await touch('touchEnd', []); await page.waitForTimeout(300);
s = await st(); check('Run on beside the keke', s.run === true, s);
const act = await box('.pad[data-id=act]');
await touch('touchStart', [{ ...act, id: 4 }]); await page.waitForTimeout(60); await touch('touchEnd', []); await page.waitForTimeout(800);
s = await st(); check('RUN -> VEHICLE: getting in ends the run; driving buttons shown', s.mode === 'driving' && s.run === false && /Horn/.test(s.shown) && !/Run/.test(s.shown), s);
// at the wheel: two pedals, as pictures; the accelerator moves the keke while it is held and not after
check('at the wheel there are an accelerator and a brake', /Accelerate/.test(s.shown) && /Brake/.test(s.shown), s.shown);
shownPads = await pads();
check('driving: every button is a picture with no written label', shownPads.every((b) => b.icon && b.text === ''), shownPads.map((b) => [b.id, b.text]));
// (driven on a quiet road, Campus Road in the north of town: from the motor park's bay it drove into the busy park, and
// in one run the police took the player in before the test was done, which has nothing to do with the buttons)
await page.evaluate(() => window.__nlw.park(-100, -341, Math.PI / 2));
await page.waitForTimeout(800);
const car0 = await page.evaluate(() => { const c = window.__nlw.view.self.driving; return { x: c.x, z: c.z }; });
const gas = await box('.pad[data-id=gas]');
await touch('touchStart', [{ ...gas, id: 9 }]); await page.waitForTimeout(3500);
const car1 = await page.evaluate(() => { const c = window.__nlw.view.self.driving; return { x: c.x, z: c.z, held: document.querySelector('.pad[data-id=gas]').getAttribute('aria-pressed') }; });
const gasHeld = await look('.pad[data-id=gas]');
await touch('touchEnd', []); await page.waitForTimeout(150);
const gasUp = await look('.pad[data-id=gas]');
check('the accelerator is green for as long as it is held, blue when let go', green(gasHeld) && blue(gasUp), { gasHeld, gasUp });
// held, then the touch is taken away by the system (a call, a gesture): it lets go and does not stay lit
await touch('touchStart', [{ ...gas, id: 10 }]); await page.waitForTimeout(150);
await touch('touchCancel', []); await page.waitForTimeout(150);
const cancelled = await look('.pad[data-id=gas]');
check('an interrupted touch lets the button go', blue(cancelled) && !(await page.evaluate(() => window.__nlw.controls.held('gas'))), cancelled);
// held, then the finger slides well off it: it lets go
await touch('touchStart', [{ ...gas, id: 11 }]); await page.waitForTimeout(150);
await touch('touchMove', [{ x: gas.x, y: gas.y - 70, id: 11 }]); await page.waitForTimeout(80);
await touch('touchMove', [{ x: 195, y: 300, id: 11 }]); await page.waitForTimeout(150);
const dragged = await look('.pad[data-id=gas]');
const stillHeld = await page.evaluate(() => window.__nlw.controls.held('gas'));
await touch('touchEnd', []); await page.waitForTimeout(150);
check('a finger dragged off a button lets it go', blue(dragged) && !stillHeld, { dragged, stillHeld, mode: await page.evaluate(() => window.__nlw.mode) });
await page.waitForTimeout(2200);
const car2 = await page.evaluate(() => { const c = window.__nlw.view.self.driving; return c ? { x: c.x, z: c.z } : { gone: true, mode: window.__nlw.mode, notices: [...document.querySelectorAll('#notices > *')].map((e) => e.textContent).slice(-3), self: { x: window.__nlw.view.self.x, z: window.__nlw.view.self.z, law: window.__nlw.view.self.law.state } }; });
if (car2.gone) console.log('CAR GONE', JSON.stringify(car2), JSON.stringify(await page.evaluate(() => Object.values(window.__nlw.host.game.state.justice.crimes).slice(-3).map((c) => ({ type: c.type, x: c.x, z: c.z, victim: c.victim, witnesses: (c.witnesses || []).length })))));
await page.waitForTimeout(1500);
const car3 = await page.evaluate(() => { const c = window.__nlw.view.self.driving; return { x: c.x, z: c.z }; });
check('holding the accelerator drives the keke', Math.hypot(car1.x - car0.x, car1.z - car0.z) > 0.5, { from: car0, to: car1 });
check('letting go of it lets the keke come to rest', Math.hypot(car3.x - car2.x, car3.z - car2.z) < 0.6, { car2, car3 });
const act2 = await box('.pad[data-id=act]');
await touch('touchStart', [{ ...act2, id: 4 }]); await page.waitForTimeout(60); await touch('touchEnd', []); await page.waitForTimeout(800);
s = await st(); check('out of the keke: walking, Run off', s.mode === 'walking' && s.run === false && s.pressed === 'false', s);
// a finger lifted while the page is hidden must not leave the stick pushed
await touch('touchStart', [{ ...stick, id: 1 }]); await touch('touchMove', [full]); await page.waitForTimeout(300);
await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.waitForTimeout(300);
const stuck = await page.evaluate(() => ({ x: window.__nlw.controls.state.stickX, y: window.__nlw.controls.state.stickY }));
check('losing the page lets go of the stick', stuck.x === 0 && stuck.y === 0, stuck);
await touch('touchEnd', []);
// RUN -> COMBAT: squaring up to someone ends the run, and a fight has no Run button
const who = await page.evaluate(() => {
  const n = window.__nlw; const g = n.host.game; const pop = g.internals.population; const o = {}; let best = null;
  g.state.weather = { kind: 'clear', until: 1e15 };
  for (let i = 0; i < pop.count; i += 1) {
    const w = pop.people[i]; if (w.age < 18 || w.job === 'police') continue;
    pop.locate(i, g.state.t, o); if (o.pose !== 0 || o.moving) continue;
    let open = true; for (let k = 1; k <= 5; k += 1) if (!n.walkable(o.x + Math.sin(o.h) * k, o.z + Math.cos(o.h) * k)) open = false;
    if (!open) continue;
    const d = Math.hypot(o.x - n.view.self.x, o.z - n.view.self.z); if (!best || d < best.d) best = { i, x: o.x, z: o.z, h: o.h, d };
  }
  const x = best.x + Math.sin(best.h) * 1.1, z = best.z + Math.cos(best.h) * 1.1;
  n.place(x, z); n.face(Math.atan2(best.x - x, best.z - z));
  return best;
});
await page.waitForTimeout(900);
run = await box('.pad[data-id=run]');
await touch('touchStart', [{ ...run, id: 5 }]); await page.waitForTimeout(60); await touch('touchEnd', []); await page.waitForTimeout(300);
s = await st(); check('Run on, facing someone: Fight is offered', s.run === true && /Fight/.test(s.shown), s);
const fight = await box('.pad[data-id=fight]');
await touch('touchStart', [{ ...fight, id: 6 }]); await page.waitForTimeout(60); await touch('touchEnd', []); await page.waitForTimeout(900);
s = await st(); check('RUN -> COMBAT: the fight ends the run; fight buttons only', s.mode === 'combat' && s.run === false && /Punch/.test(s.shown) && /Block/.test(s.shown) && !/Run/.test(s.shown), s);
// Block is held, not switched: down while the finger is on it, up when it lifts
const block = await box('.pad[data-id=block]');
await touch('touchStart', [{ ...block, id: 7 }]); await page.waitForTimeout(500);
let guard = await page.evaluate(() => !!(window.__nlw.view.self.fight && window.__nlw.view.self.fight.blocking));
await touch('touchEnd', []); await page.waitForTimeout(500);
let after = await page.evaluate(() => !!(window.__nlw.view.self.fight && window.__nlw.view.self.fight.blocking));
check('Block is up only while the finger is on it', guard === true && after === false, { guard, after });
const leave = await box('.pad[data-id=leave]');
await touch('touchStart', [{ ...leave, id: 8 }]); await page.waitForTimeout(60); await touch('touchEnd', []); await page.waitForTimeout(900);
s = await st(); check('COMBAT -> WALK: stepping away brings back the walking buttons, Run off', s.mode === 'walking' && s.run === false && /Run/.test(s.shown), s);
// ---- the motorcycle's controls (shown without a bike, as __nlw.bikePreview does): the screenshots' design ----
const { mkdirSync } = await import('node:fs');
const shots = process.argv[2] || '/tmp/touch-shots'; mkdirSync(shots, { recursive: true });
await page.evaluate(() => window.__nlw.bikePreview(true)); await page.waitForTimeout(500);
const bikePads = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.pad')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => [e.dataset.id, { shape: e.dataset.shape, icon: e.dataset.icon }])));
check('on a motorcycle: the throttle and brake are pedals, the steering two chevrons, as in the screenshots', bikePads.throttle && bikePads.throttle.shape === 'pedal-tall' && bikePads.throttle.icon === 'pedalgas' && bikePads.brake.shape === 'pedal-wide' && bikePads.brake.icon === 'pedalbrake' && bikePads['steer-left'].icon === 'chevleft' && bikePads['steer-right'].icon === 'chevright', bikePads);
await page.screenshot({ path: `${shots}/bike-controls.png` });
const thr = await box('.pad[data-id=throttle]'), right = await box('.pad[data-id="steer-right"]');
await touch('touchStart', [{ ...thr, id: 21 }, { ...right, id: 22 }]); await page.waitForTimeout(200);
const both = [await look('.pad[data-id=throttle]'), await look('.pad[data-id="steer-right"]'), await look('.pad[data-id=brake]')];
await page.screenshot({ path: `${shots}/bike-controls-pressed.png` });
const input = await page.evaluate(() => window.__nlw.bikeInput);
await touch('touchEnd', []); await page.waitForTimeout(150);
const after2 = [await look('.pad[data-id=throttle]'), await look('.pad[data-id="steer-right"]')];
check('two held at once (throttle and steering) are both green; the one not touched stays blue', green(both[0]) && green(both[1]) && blue(both[2]) && input.throttle === 1 && input.steer === 1, { both, input });
check('both blue again when let go', after2.every(blue), after2);
await page.evaluate(() => window.__nlw.bikePreview(false)); await page.waitForTimeout(400);
// ---- swimming: the stick in the same design ----
await page.evaluate(() => { const n = window.__nlw; const g = n.host.game; const p = g.state.players[n.playerId]; p.swimming = { since: g.state.real }; p.x = -150; p.z = 160; n.refresh && n.refresh(); });
await page.waitForTimeout(900);
const swimLook = await page.evaluate(() => ({ swim: document.querySelector('#stick').classList.contains('swim'), shadow: getComputedStyle(document.querySelector('#stick')).boxShadow }));
await page.screenshot({ path: `${shots}/swim-controls.png` });
check('swimming: the stick is see-through with the blue outline', !swimLook.swim || swimLook.shadow.includes(BLUE), swimLook);
await browser.close();
console.log(results.every(Boolean) ? 'touch: ok' : 'touch: FAILURES');
process.exit(results.every(Boolean) ? 0 : 1);
