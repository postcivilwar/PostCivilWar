// At the wheel and on the bars, with the phone (18 October 2026, the owner's brief), in a headless browser on the
// website as it is served with its server and a database:
//   - a new player buys an open car and a motorcycle with nothing but the arrival money, at the new prices;
//   - in the car the driver is seen in their seat, both hands on the steering wheel's rim; the car is steered and
//     the hands go round with the rim;
//   - the phone taken out: the right hand leaves the wheel and holds it, the left stays on the wheel, the head turns
//     to it; the car can still be driven; the phone put away: both hands back on the wheel;
//   - on the motorcycle: the left hand leaves its grip for the phone, the right stays on its grip; put away, both on
//     the grips;
//   - getting off with the phone out puts it away from the bars (on foot it is taken out of the pocket again);
//   - ridden into a wall with the phone in hand: thrown off, and the phone is put away at once;
//   - the graphics taken away (as a phone short of memory does): the game says so, offers a reload, and does not
//     reload by itself.
//   ../server/with-postgres.sh node test/seats.mjs [shots folder]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDevServer } from '../../server/dev.mjs';
import { pastQuestion, enterTown } from './start.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const out = process.argv[2] || '/tmp/seats-shots';
mkdirSync(out, { recursive: true });
const server = createDevServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); };

const context = await browser.newContext({ viewport: { width: 1100, height: 700 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
const page = await context.newPage(); page.setDefaultTimeout(240000);
page.on('pageerror', (e) => check('no error in the page', false, e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 4\d\d/.test(m.text())) check('no error in the console', false, m.text()); });
const shot = (name) => page.screenshot({ path: resolve(out, `${name}.png`) });
const username = `Seat_${Math.random().toString(36).slice(2, 8)}`;

await page.goto(`${origin}/#nointro-gameclock`, { timeout: 300000 });
await page.waitForFunction(() => !!(window.__nlw && window.__nlw.ready), null, { timeout: 300000 });
await page.waitForSelector('#open-signup', { state: 'visible', timeout: 300000 });
await page.click('#open-signup');
await page.fill('#account-username', username); await page.fill('#account-password', 'a password for the seats test');
await page.click('#account-submit');
await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 120000 });
await pastQuestion(page);
await page.fill('#name', 'Seat Test');
await enterTown(page);
await page.waitForFunction(() => window.__nlw.me && window.__nlw.me.mixer, null, { timeout: 240000 });
await page.evaluate(() => { const n = window.__nlw; const hour = n.view.clock.hourFloat; if (hour < 9 || hour > 16) n.skip((24 + 11 - hour) % 24); });

// ---- bought with the arrival money, through the market as the phone buys (the server checks and records it) ----
const buy = (model) => page.evaluate(async (model) => {
  const n = window.__nlw;
  const all = await n.market.all();
  const l = all.listings.find((x) => x.asset.model === model && x.kind === 'primary');
  if (!l) return { ok: false, code: 'NOT_LISTED' };
  // (a deal is opened where the thing stands, as stepping up to it in the showroom opens it)
  n.place(l.place.x, l.place.z);
  const opened = await n.market.open(l.id, { x: l.place.x, z: l.place.z });
  if (!opened.ok) return opened;
  const last = Math.max(0, ...(opened.messages || []).map((m) => m.id));
  const answer = await n.market.offer(opened.thread.id, l.price, l.name, last);
  return { ok: answer.ok, code: answer.code, sale: answer.sale || null, price: l.price };
}, model);
const car = 'yellow-classic-roadster', bike = 'cafe-racer';
const boughtCar = await buy(`car:${car}`);
const boughtBike = await buy(`bike:${bike}`);
const wallet = await page.evaluate(async () => { const n = window.__nlw; await n.market.mine(); const w = (n.wallet && n.wallet.state) || {}; return { mine: n.market.state.mine.holdings.map((h) => h.asset.model), balance: w.balance, starter: w.starter }; });
check('with nothing but the arrival money, the Yellow Classic Roadster (1,100 TR) and the Cafe Racer (300 TR) are bought, and are the player\'s',
  boughtCar.ok && !!boughtCar.sale && boughtBike.ok && !!boughtBike.sale && wallet.mine.includes(`car:${car}`) && wallet.mine.includes(`bike:${bike}`), { boughtCar, boughtBike, wallet });
await page.waitForFunction((car) => { const s = window.__nlw.view.self; return s.ownCars && s.ownCars.cars.includes(car) && s.ownBikes && s.ownBikes.bikes.includes('cafe-racer'); }, car, { timeout: 60000 }).catch(() => {});

// ---- measuring the hands ----
// (each hand's wrist against where it should be: the car's rim at ten to two as the wheel is turned, or the bike's grips)
const measure = () => page.evaluate(() => {
  const n = window.__nlw, me = n.me, b = (name) => { const x = me.bones.get(name); return x ? x.getWorldPosition(new THREE.Vector3()) : null; };
  const r3 = (v) => (v ? v.toArray().map((x) => +x.toFixed(3)) : null);
  const out = { visible: me.group.visible, phone: { out: +n.phoneHold.out.toFixed(2), side: n.phoneHold.side, shown: n.phoneHold.prop.visible } };
  const prop = n.phoneHold.prop.getWorldPosition(new THREE.Vector3());
  out.phone.toLeft = +prop.distanceTo(b('middle_01_l')).toFixed(3); out.phone.toRight = +prop.distanceTo(b('middle_01_r')).toFixed(3);
  const c = n.carView.driven();
  if (c && n.view.self.incar) {
    const d = c.driver, cab = c.cabin; cab.updateMatrixWorld(true);
    const q = cab.getWorldQuaternion(new THREE.Quaternion());
    const dir = (x, y, z) => new THREE.Vector3(x, y, z).applyQuaternion(q).normalize();
    const centre = cab.localToWorld(new THREE.Vector3(...d.wheel)), x = dir(1, 0, 0), u = dir(0, Math.cos(d.tilt), -Math.sin(d.tilt));
    const R = n.carView.rules, turn = Math.max(-R.wheelMost, Math.min(R.wheelMost, -(n.carState.steer || 0) * R.wheelTurn));
    const rim = (side) => { const a = side * Math.PI / 3 + turn; return centre.clone().addScaledVector(u, Math.cos(a) * d.radius * c.scale).addScaledVector(x, Math.sin(a) * d.radius * c.scale); };
    out.car = { left: +b('hand_l').distanceTo(rim(1)).toFixed(3), right: +b('hand_r').distanceTo(rim(-1)).toFixed(3), hips: +b('pelvis').distanceTo(cab.localToWorld(new THREE.Vector3(...d.hip))).toFixed(3), steer: +(n.carState.steer || 0).toFixed(2) };
  }
  const bk = n.ownBikeView.ridden();
  if (bk && n.view.self.astride) {
    out.bike = { left: +b('hand_l').distanceTo(bk.gripWorld(0)).toFixed(3), right: +b('hand_r').distanceTo(bk.gripWorld(1)).toFixed(3) };
  }
  // the head: which way it faces now, against which way it faced before the phone came out (`window.__headBefore`): the
  // figure's own forward turned by the head's turn since, and how much more that looks at the handset than before
  const head = me.bones.get('head'), hq = head.getWorldQuaternion(new THREE.Quaternion());
  if (window.__headBefore) {
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(me.group.getWorldQuaternion(new THREE.Quaternion()));
    const turned = fwd.clone().applyQuaternion(hq.clone().multiply(window.__headBefore.clone().invert()));
    const toPhone = prop.clone().sub(b('head')).normalize();
    out.headTurn = +(turned.dot(toPhone) - fwd.dot(toPhone)).toFixed(3);
  }
  out.headQ = hq.toArray();
  out.at = r3(b('pelvis'));
  return out;
});
// (the camera looked round, as a drag looks round in a view that follows the vehicle, and held there for the pictures)
const view = (yaw, dist, pitch) => page.evaluate(([yaw, dist, pitch]) => { const n = window.__nlw; n.cam.yaw = n.predicted.heading + yaw; n.cam.dist = dist; n.cam.pitch = pitch; n.rig.live.look = Math.max(-1.6, Math.min(1.6, Math.PI - yaw > 0 ? Math.PI - yaw : yaw)); n.cam.lastDrag = 1e9; }, [yaw, dist, pitch]);

// ---- at the wheel ----
await page.evaluate(() => { const n = window.__nlw; n.place(-12, 96); });
await page.waitForTimeout(800);
const entered = await page.evaluate((car) => window.__nlw.driveCar(car), car);
await page.waitForFunction(() => window.__nlw.view.self.incar && window.__nlw.carView.ready(), null, { timeout: 300000 }).catch(() => {});
await view(0.9, 4.6, 0.3);
await page.waitForTimeout(2000);
const seated = await measure();
check('in the open car the driver is seen in their seat', entered.ok && seated.visible && seated.car && seated.car.hips < 0.12, { entered: entered.ok, ...seated });
check('both hands are on the steering wheel\'s rim, at ten to two', !!seated.car && seated.car.left < 0.09 && seated.car.right < 0.09, seated.car);
await shot('01-at-the-wheel');
// steering: the hands go round with the rim
await page.keyboard.down('w'); await page.waitForTimeout(1200); await page.keyboard.down('a'); await page.waitForTimeout(900);
const steering = await measure();
await page.keyboard.up('a'); await page.keyboard.up('w');
check('steered, the hands stay on the rim as it turns', !!steering.car && Math.abs(steering.car.steer) > 0.05 && steering.car.left < 0.09 && steering.car.right < 0.09, steering.car);
await page.evaluate(() => { window.__nlw.carState.speed = 0; });
await page.waitForTimeout(1500);

// the phone: out of the wheel into the right hand, the left keeps the wheel
await page.evaluate(() => { const h = window.__nlw.me.bones.get('head'); window.__headBefore = h.getWorldQuaternion(new THREE.Quaternion()); window.__nlw.ui.openPhone(); });
await page.waitForFunction(() => window.__nlw.phoneHold.ready, null, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(800);
const phoning = await measure();
check('the phone taken out at the wheel: it is in the right hand, held up to be read, the head turned to it', phoning.phone.out > 0.97 && phoning.phone.shown && phoning.phone.side === 'r' && phoning.phone.toRight < 0.12 && phoning.headTurn > 0.05, { phone: phoning.phone, headTurn: phoning.headTurn });
check('and the left hand stays on the wheel', !!phoning.car && phoning.car.left < 0.09 && phoning.car.right > 0.15, phoning.car);
await view(0.75, 3.8, 0.28);
await page.waitForTimeout(1200);
await shot('02-phone-at-the-wheel');
// still driven with the phone out (the small phone leaves the keys to the car): on the brake, then backed up (ahead
// of it, after the turn, may be the kerb)
const before = await page.evaluate(() => ({ x: window.__nlw.predicted.x, z: window.__nlw.predicted.z }));
await page.keyboard.down('s'); await page.waitForTimeout(3000);
const moved = await page.evaluate(() => { const n = window.__nlw; return { x: n.predicted.x, z: n.predicted.z, speed: n.carState.speed, braking: n.carState.braking, out: n.phoneHold.out, phoneOut: n.ui.phoneOut(), keys: [...n.controls.state.keys] }; });
await page.keyboard.up('s');
check('with the phone in hand the car can still be driven: its brake held, it backs up', moved.speed < -0.3 && Math.hypot(moved.x - before.x, moved.z - before.z) > 0.3 && moved.out > 0.9 && moved.phoneOut, { before, moved });
await page.evaluate(() => { window.__nlw.carState.speed = 0; });
// put away: both hands back on the wheel
await page.evaluate(() => window.__nlw.ui.close());
await page.waitForFunction(() => window.__nlw.phoneHold.out === 0, null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(500);
const after = await measure();
check('the phone put away: both hands back on the wheel', after.phone.out === 0 && !after.phone.shown && after.car && after.car.left < 0.09 && after.car.right < 0.09, after);
await shot('03-both-hands-again');

// ---- on the motorcycle ----
await page.evaluate(() => { const p = window.__nlw.prompt(); if (p && /Get out/.test(p.text)) p.run(); });
await page.waitForTimeout(800);
await page.evaluate(() => { const n = window.__nlw; n.place(-12, 108); });
await page.waitForTimeout(600);
const rode = await page.evaluate((bike) => window.__nlw.rideBike(bike), bike);
await page.waitForFunction(() => window.__nlw.view.self.astride && window.__nlw.ownBikeView.ready(), null, { timeout: 300000 }).catch(() => {});
await view(0.9, 3.4, 0.22);
await page.waitForTimeout(2000);
const riding = await measure();
check('on the motorcycle both hands are on the grips', rode.ok && !!riding.bike && riding.bike.left < 0.08 && riding.bike.right < 0.08, { rode: rode.ok, ...riding.bike });
await shot('04-on-the-bike');
await page.evaluate(() => { const h = window.__nlw.me.bones.get('head'); window.__headBefore = h.getWorldQuaternion(new THREE.Quaternion()); window.__nlw.ui.openPhone(); });
await page.waitForFunction(() => window.__nlw.phoneHold.ready, null, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(800);
const bikePhone = await measure();
check('the phone taken out on the motorcycle: the left hand leaves its grip and holds it, the head turned to it', bikePhone.phone.out > 0.97 && bikePhone.phone.side === 'l' && bikePhone.phone.toLeft < 0.12 && bikePhone.headTurn > 0.05 && !!bikePhone.bike && bikePhone.bike.left > 0.15, { phone: bikePhone.phone, headTurn: bikePhone.headTurn, bike: bikePhone.bike });
check('and the right hand stays on its grip, on the throttle', !!bikePhone.bike && bikePhone.bike.right < 0.08, bikePhone.bike);
await view(-0.9, 3.2, 0.22);
await page.waitForTimeout(1200);
await shot('05-phone-on-the-bike');
await page.evaluate(() => window.__nlw.ui.close());
await page.waitForFunction(() => window.__nlw.phoneHold.out === 0, null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(500);
const bikeAfter = await measure();
check('put away: both hands back on the grips', bikeAfter.phone.out === 0 && !!bikeAfter.bike && bikeAfter.bike.left < 0.08 && bikeAfter.bike.right < 0.08, bikeAfter.bike);

// getting off with the phone out: it comes off the bars (the hand that held it changes), and on foot it is out of the pocket
await page.evaluate(() => window.__nlw.ui.openPhone());
await page.waitForFunction(() => window.__nlw.phoneHold.ready, null, { timeout: 60000 }).catch(() => {});
await page.evaluate(() => { const p = window.__nlw.prompt(); if (p && /Get off/.test(p.text)) p.run(); });
await page.waitForTimeout(150);
const off = await page.evaluate(() => ({ astride: !!window.__nlw.view.self.astride, side: window.__nlw.phoneHold.side, out: window.__nlw.phoneHold.out }));
check('getting off with the phone out puts it away from the bars at once, to come out of the pocket on foot', !off.astride && off.side === 'r' && off.out < 0.5, off);
await page.evaluate(() => window.__nlw.ui.close());

// a fall comes before the phone: ridden into a wall at speed with the phone in the left hand, the rider is thrown off
// and the phone is put away at once (just behind the registry, facing its back wall, as in motorcycles.mjs)
await page.waitForFunction(() => window.__nlw.phoneHold.out === 0, null, { timeout: 30000 }).catch(() => {});
await page.evaluate(() => { const n = window.__nlw; n.place(48, -81); n.face(0); });
await page.waitForTimeout(600);
const remounted = await page.evaluate((b) => window.__nlw.rideBike(b), bike);
await page.waitForFunction(() => window.__nlw.view.self.astride && window.__nlw.ownBikeView.ready(), null, { timeout: 300000 }).catch(() => {});
await page.evaluate(() => window.__nlw.ui.openPhone());
await page.waitForFunction(() => window.__nlw.phoneHold.out > 0.97, null, { timeout: 60000 }).catch(() => {});
const holding = await page.evaluate(() => ({ out: +window.__nlw.phoneHold.out.toFixed(2), side: window.__nlw.phoneHold.side }));
await page.evaluate(() => { const n = window.__nlw; n.cam.yaw = Math.PI * 0.75; n.cam.dist = 7; n.cam.pitch = 0.25; n.bikeState.speed = 22; });
await page.keyboard.down('w');
await page.waitForFunction(() => !window.__nlw.view.self.astride, null, { timeout: 20000 }).catch(() => {});
await page.keyboard.up('w');
await page.waitForTimeout(100);
const fell = await page.evaluate(() => { const n = window.__nlw, s = n.view.self; return { astride: !!s.astride, down: s.down ? s.down.by : null, out: n.phoneHold.out, phoneOnScreen: n.ui.usingPhone() }; });
check('thrown off with the phone in hand: the fall comes first, and the phone is put away at once', !!(remounted && remounted.ok) && holding.out > 0.97 && holding.side === 'l' && !fell.astride && fell.down === 'crash' && fell.out === 0, { remounted: !!(remounted && remounted.ok), holding, fell });
await shot('06-thrown-off-phone-away');
await page.evaluate(() => window.__nlw.ui.close());
await page.waitForFunction(() => !window.__nlw.view.self.down, null, { timeout: 30000 }).catch(() => {});

// ---- the picture lost: the browser takes the graphics away (as a phone short of memory does) ----
// The game is saved, the player is told and offered to reload; it does not reload itself.
await page.evaluate(() => { window.__stillHere = true; window.__lose = window.__nlw.renderer ? null : null; const c = document.getElementById('view').getContext('webgl2') || document.getElementById('view').getContext('webgl'); window.__lose = c && c.getExtension('WEBGL_lose_context'); window.__lose.loseContext(); });
await page.waitForTimeout(4000);
const lost = await page.evaluate(() => { const box = document.getElementById('confirm'); return { stillHere: !!window.__stillHere, counted: window.__nlw.contextLost, asked: box && !box.hidden ? box.textContent.replace(/\s+/g, ' ').trim() : null }; });
check('the graphics taken away: the game says so and offers to reload, and does not reload by itself', lost.stillHere && lost.counted === 1 && /picture was lost/i.test(lost.asked || '') && /Reload the page/.test(lost.asked || '') && /saved/i.test(lost.asked || ''), lost);
// "Not now": the question goes; a tap on the lost picture asks it again (and the page is still not reloaded)
await page.click('#confirm-no');
await page.waitForTimeout(400);
const putOff = await page.evaluate(() => document.getElementById('confirm').hidden);
await page.mouse.click(550, 330);
await page.waitForTimeout(800);
const askedAgain = await page.evaluate(() => { const box = document.getElementById('confirm'); return { shown: !box.hidden && /picture was lost/i.test(box.textContent), stillHere: !!window.__stillHere }; });
check('"Not now" puts the question away; a tap on the lost picture asks it again, and nothing reloads', putOff && askedAgain.shown && askedAgain.stillHere, { putOff, ...askedAgain });
await page.evaluate(() => { window.__lose.restoreContext(); });
await page.waitForTimeout(1500);

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed} of ${results.length} checks passed`);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
