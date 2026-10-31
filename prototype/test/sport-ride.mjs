// Riding the things from the sports mall, in a headless browser, on the website as it is served with its server and a
// database (31 October 2026, stage 2 of the owner's brief of 30 October: "the player must pedal and control the bike";
// "Ensure each ... realistically pedals, balances, and maneuvers their equipment, with smooth wheel rotation"):
//   - the six that are ridden on land bought at the mall with the arrival money (the bicycle, the skateboard, the skates,
//     the e-scooter, the hoverboard, the electric unicycle), and each got on from Property or where it was left;
//   - each ridden down the Kwale road: drawn under the rider (the skates on their feet), going as fast as it goes, its
//     wheels turning; the cyclist's feet on the pedals going round with the cranks while pedalled and the cranks still
//     while coasting, hands on the grips, a foot down when stopped; the skateboarder's foot down on the road pushing and
//     back on the board; the skater's strides; the scooter rider's hands on its bars; the hoverboard turned on the spot;
//     the unicycle leaning forward to go;
//   - off again, it stands where it was left; its sounds heard; a phone's graphics card under its limit while riding.
//
//   ../server/with-postgres.sh node test/sport-ride.mjs [shots folder] [phone]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDevServer } from '../../server/dev.mjs';
import { pastQuestion, enterTown, watchPictures, lostPictures } from './start.mjs';
import { SPORTS_MALL as M } from '../src/sim/zones/asaba-sports.js';
import { SPORTS } from '../src/sim/sports.js';
import { SPORT_HANDLING } from '../src/sim/sport-ride.js';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

if (!process.env.PCW_DATABASE_URL) { console.error('PCW_DATABASE_URL is not set: run this with server/with-postgres.sh'); process.exit(2); }
const out = process.argv[2] || '/tmp/sport-ride-shots';
const PHONE = process.argv[3] === 'phone';
mkdirSync(out, { recursive: true });
const server = createDevServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); };
const tag = Math.random().toString(36).slice(2, 6);

const context = await browser.newContext(PHONE ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, serviceWorkers: 'block' } : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
await watchPictures(context);
const page = await context.newPage(); page.setDefaultTimeout(240000);
page.on('pageerror', (e) => check('no error in the page', false, e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 4\d\d/.test(m.text())) check('no error in the console', false, m.text()); });
const shot = (name) => page.screenshot({ path: resolve(out, `${name}.png`) });

await page.goto(`${origin}/#nointro-gameclock${PHONE ? '-lite' : ''}`, { timeout: 600000 });
await page.waitForFunction(() => !!(window.__nlw && window.__nlw.intro), null, { timeout: 600000 });
await page.waitForSelector('#open-signup', { state: 'visible', timeout: 300000 });
await page.click('#open-signup');
await page.fill('#account-username', `Rider_${tag}`); await page.fill('#account-password', 'a password for the riding test');
await page.click('#account-submit');
await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 120000 });
await pastQuestion(page);
await page.fill('#name', 'Sports Riding Test');
await enterTown(page, { tap: PHONE, wait: 900000 });
await page.waitForFunction(() => window.__nlw.me && window.__nlw.me.mixer, null, { timeout: 600000 });
if (PHONE) await page.evaluate(() => window.__nlw.setGraphics('medium'));
await page.evaluate(() => { const n = window.__nlw; const hour = n.view.clock.hourFloat; if (hour < 9 || hour > 15) n.skip((24 + 10 - hour) % 24); const g = n.host.game; g.state.weather = { kind: 'clear', until: g.state.t + 8 * 3600 }; });
// (the town's cars kept at home: the test rides up the Kwale road, which they drive along, and a car stopped ahead of
// the rider would be in the way of its top speed: traffic.js has its own test)
await page.evaluate(() => { const g = window.__nlw.host.game, T = g.internals.traffic; T.tick = () => {}; for (const c of T.cars) if (c.mode !== 'taken' && c.mode !== 'kept') { c.mode = 'off'; c.v = 0; } });
const trafficHeld = await page.evaluate(() => { const T = window.__nlw.host.game.internals.traffic; return { held: T.tick.length === 0 && T.cars.every((c) => c.mode === 'off'), cars: T.cars.length }; });
check('(the town\'s cars held at home for the test)', trafficHeld.held, trafficHeld);
const go = async (x, z, h, cam) => {
  await page.evaluate(([x, z, h, cam]) => { const n = window.__nlw; n.place(x, z); n.face(h); if (cam) { n.cam.yaw = cam.yaw; n.cam.pitch = cam.pitch; n.cam.dist = cam.dist; n.rig.snap(n.cam); } }, [x, z, h, cam || null]);
};

// ---- the six bought at the mall ----
const LAND = ['bicycle', 'skateboard', 'inline-skates', 'e-scooter', 'hoverboard', 'e-unicycle'];
await go(M.entry.x, M.entry.z + 0.8, Math.PI);
await page.evaluate(() => window.__nlw.goSports('in'));
await page.waitForFunction(() => window.__nlw.sports.inside && !document.getElementById('fade').classList.contains('on'), null, { timeout: 30000 });
const bought = [];
for (const item of LAND) {
  const d = M.displays.find((q) => q.item === item);
  await go(d.x + Math.sin(d.h) * (d.r + 0.6), d.z + Math.cos(d.h) * (d.r + 0.6), d.h + Math.PI);
  await page.evaluate((item) => window.__nlw.askAboutSport(item), item);
  await page.waitForSelector('#deal-buy', { timeout: 90000 });
  await page.waitForTimeout(800);
  await page.click('#deal-buy');
  await page.waitForSelector('#deal-yes', { timeout: 30000 });
  await page.click('#deal-yes');
  const done = await page.waitForSelector('#deal-done', { timeout: 90000 }).then(() => true, () => false);
  if (done) bought.push(item);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  await page.evaluate(() => { if (window.__nlw.ui.isOpen()) window.__nlw.ui.close(); });
}
const mine = await page.evaluate(async () => { const n = window.__nlw; await n.market.mine(); return { models: n.market.state.mine.holdings.map((h) => h.asset.model), balance: n.view.self.balance }; });
const total = LAND.reduce((a, id) => a + SPORTS[id].price, 0);
check(`the six ridden on land bought with the arrival money (${total} TR together)`, bought.length === 6 && LAND.every((id) => mine.models.includes(`sport:${id}`)), { bought, mine });
// out again by the doors' mat, and the town told what the player owns
await go((M.exit.x0 + M.exit.x1) / 2, (M.exit.z0 + M.exit.z1) / 2, 0);
await page.evaluate(() => window.__nlw.goSports('out'));
await page.waitForFunction(() => !window.__nlw.sports.inside && !document.getElementById('fade').classList.contains('on'), null, { timeout: 30000 });
await page.waitForFunction(() => { const o = window.__nlw.view.self.ownSports; return o && o.items.length >= 6; }, null, { timeout: 60000 }).catch(() => {});
const owned = await page.evaluate(() => window.__nlw.view.self.ownSports.items);
check('the town knows the six are the player\'s', LAND.every((id) => owned.includes(id)), owned);

// ---- Property: ridden from there ----
await go(-700, -43, Math.PI / 2);
await page.evaluate(() => window.__nlw.ui.openPhone('property', {}));
await page.waitForSelector('#my-assets', { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(1500);
const opened = await page.evaluate(() => { const card = [...document.querySelectorAll('#my-assets .assetcard')].find((c) => /Fat-Tyre Bicycle/.test(c.textContent)); if (card) card.click(); return !!card; });
await page.waitForSelector('#ride-sport', { timeout: 30000 }).catch(() => {});
const button = await page.evaluate(() => { const b = document.getElementById('ride-sport'); return b ? b.textContent : null; });
check('in Property the bicycle has its own button to ride it', opened && button === 'Ride it', { opened, button });
await shot('01-property');
await page.click('#ride-sport');
await page.waitForFunction(() => { const a = window.__nlw.view.self.astride; return a && a.sport === 'bicycle'; }, null, { timeout: 30000 });
await page.evaluate(() => { if (window.__nlw.ui.isOpen()) window.__nlw.ui.close(); });

// ---- what is measured while riding ----
// where the rider's hands and feet are against the thing's grips and pedals, and what the view and the riding say
const sample = () => page.evaluate(() => {
  const n = window.__nlw, s = n.sportView, me = n.me;
  const v = (p) => (p ? [+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)] : null);
  const limbs = s.limbs(me);
  const pedals = s.pedals(), grips = s.grips();
  const d = (a, b) => (a && b ? +a.distanceTo(b).toFixed(3) : null);
  const models = s.ridden() || [];
  return {
    t: performance.now() / 1000, speed: n.sportState.speed, phase: n.sportState.phase, pushing: n.sportState.pushing, lean: n.sportState.lean, heading: n.predicted.heading,
    at: [n.predicted.x, n.predicted.z], ground: n.ground(n.predicted.x, n.predicted.z), state: s.stateOf(), ready: s.ready(), models: models.length,
    feet: limbs ? limbs.feet.map(v) : null, hands: limbs ? limbs.hands.map(v) : null, pelvis: limbs ? v(limbs.pelvis) : null,
    footToPedal: pedals && limbs ? [d(limbs.feet[0], pedals[0]), d(limbs.feet[1], pedals[1])] : null,
    handToGrip: grips && limbs ? [d(limbs.hands[0], grips[0]), d(limbs.hands[1], grips[1])] : null,
    // (the owner's skate is a right one, worn on the right foot; its mirror on the left)
    skates: models.length === 2 && limbs ? models.map((m, k) => +Math.hypot(m.group.position.x - limbs.feet[1 - k].x, m.group.position.z - limbs.feet[1 - k].z).toFixed(3)) : null,
    sound: n.audio.status().sport || null,
  };
});
// Held until `done(sample, all)` is true, or for `most` seconds, sampling as often as the page lets: on this machine a
// frame drawn in software can take seconds, longer than the game's longest step (half a second), and a vehicle's time then
// runs slower than the clock's, so a test holds on until the thing is going, not for a fixed time (30 October 2026).
const holdUntil = async (keys, done, most = 120, every = 0.25) => {
  for (const k of keys) await page.keyboard.down(k);
  const got = [];
  const t0 = Date.now();
  while (Date.now() - t0 < most * 1000) { await page.waitForTimeout(every * 1000); const s = await sample(); got.push(s); if (done(s, got)) break; }
  for (const k of keys) await page.keyboard.up(k);
  return got;
};
const samples = (n) => (s, got) => got.length >= n;
const stopped = () => holdUntil(['s'], (s) => Math.abs(s.speed) < 0.05, 90);
// the camera beside the rider, a little ahead, looking back at them (held there: not swung behind)
const sideView = (side = 1, dist = 4.2, pitch = 0.16) => page.evaluate(([side, dist, pitch]) => { const n = window.__nlw; n.cam.yaw = n.predicted.heading + side * 1.25; n.cam.pitch = pitch; n.cam.dist = dist; n.cam.lastDrag = 1e9; n.rig.snap(n.cam); }, [side, dist, pitch]);
const behind = () => page.evaluate(() => { const n = window.__nlw; n.cam.lastDrag = -1e9; });
const kmh = (v) => Math.round(v * 3.6 * 10) / 10;
const ride = async (item) => {
  const r = await page.evaluate((item) => window.__nlw.rideSport(item), item);
  await page.evaluate(() => { if (window.__nlw.ui.isOpen()) window.__nlw.ui.close(); });
  await page.waitForFunction(() => window.__nlw.sportView.ready(), null, { timeout: 180000 }).catch(() => {});
  return r;
};
const getOff = async () => {
  await page.waitForFunction(() => Math.abs(window.__nlw.sportState.speed) < 0.2, null, { timeout: 30000 }).catch(() => {});
  return page.evaluate(() => { const p = window.__nlw.prompt(); if (!p) return null; const text = p.text; p.run(); return text; });
};
const start = (x) => go(x, -43, Math.PI / 2);

// ---- the bicycle ----
{
  await page.waitForFunction(() => window.__nlw.sportView.ready(), null, { timeout: 180000 }).catch(() => {});
  await sideView(1);
  const still = await sample();
  check('on the bicycle: the owner\'s model is drawn under the rider, sitting on it', still.ready && still.models === 1, { ready: still.ready, models: still.models });
  check('stopped, the cyclist has a foot down on the road and the bike leans onto it', still.state && still.state.down > 0.8 && still.feet && still.feet[0][1] - still.ground < 0.16, { down: still.state && still.state.down, foot: still.feet && still.feet[0], ground: still.ground });
  await shot('02-bicycle-stopped');
  const going = await holdUntil(['w'], (q, got) => kmh(q.speed) >= 27 && got.length >= 6, 180);
  const fast = going[going.length - 1];
  const top = Math.max(...going.map((q) => q.speed));
  check('pedalled on the road it gathers speed to about 30 km/h', kmh(top) > 24 && kmh(top) <= 30.5, going.map((q) => kmh(q.speed)));
  const turns = going.slice(1).reduce((a, q, i) => a + ((q.phase - going[i].phase + Math.PI * 2) % (Math.PI * 2)), 0);
  check('the cranks go round while it is pedalled', turns > Math.PI * 4, { turns: +(turns / (Math.PI * 2)).toFixed(1) });
  const onPedals = going.filter((q) => q.footToPedal).map((q) => Math.max(...q.footToPedal));
  check('the feet stay on the pedals as they go round (each ankle within a hand of its pedal)', onPedals.length > 10 && onPedals.every((d) => d < 0.17), onPedals);
  const onGrips = going.filter((q) => q.handToGrip).map((q) => Math.max(...q.handToGrip));
  check('the hands stay on the grips', onGrips.length > 10 && onGrips.every((d) => d < 0.14), onGrips);
  check('the wheels turn as it rolls (metres rolled, from the view)', fast.state && fast.state.travelled > 30, fast.state);
  check('the wheels on the road and the chain are heard', fast.sound !== null, fast.sound);
  await sideView(1);
  await page.keyboard.down('w'); await page.waitForTimeout(400); await shot('03-bicycle-pedalling'); await page.keyboard.up('w');
  // let go: it rolls on, the cranks still
  const coast = await holdUntil([], samples(3), 30);
  check('let go, it rolls on and the cranks stand still', coast[coast.length - 1].speed > 3 && Math.abs(coast[coast.length - 1].phase - coast[0].phase) < 1e-6, coast.map((q) => [kmh(q.speed), +q.phase.toFixed(2)]));
  check('coasting, its freewheel ticks', !!(coast[coast.length - 1].sound && coast[coast.length - 1].sound.ticks > 3), coast[coast.length - 1].sound);
  // leaned into a turn, then braked to a stop
  const turning = await holdUntil(['w', 'd'], (q, got) => Math.abs(q.heading - got[0].heading) > 0.5 && got.length >= 3, 90);
  check('steered, it leans into the turn and turns', Math.max(...turning.map((q) => q.lean)) > 0.12 && Math.abs(turning[turning.length - 1].heading - turning[0].heading) > 0.3, turning.map((q) => [+q.lean.toFixed(2), +q.heading.toFixed(2)]));
  await sideView(-1); await shot('04-bicycle-leaning');
  const braking = await stopped();
  check('the brake stops it', braking[braking.length - 1].speed < 0.05, braking.map((q) => kmh(q.speed)));
  const off = await getOff();
  const left = await page.evaluate(() => ({ astride: window.__nlw.view.self.astride, parked: window.__nlw.view.self.ownSports.parked }));
  check('got off: it stands where it was left', off === 'Get off the Fat-Tyre Bicycle' && !left.astride && left.parked.some((b) => b.item === 'bicycle'), { off, left });
  await page.waitForTimeout(1200);
  await sideView(1, 5); await shot('05-bicycle-left-standing');
}

// ---- the skateboard ----
{
  await start(-690);
  await ride('skateboard');
  await sideView(1);
  const still = await sample();
  check('on the skateboard: standing across it, both feet on its deck', still.ready && still.feet && still.feet.every((f) => f[1] - still.ground > 0.12 && f[1] - still.ground < 0.32), { feet: still.feet, ground: still.ground });
  await shot('06-skateboard-standing');
  const going = await holdUntil(['w'], (q, got) => kmh(q.speed) >= 14 && got.length >= 14, 180, 0.12);
  const fast = going[going.length - 1];
  const top = Math.max(...going.map((q) => q.speed));
  check('pushed along it goes at a skateboard\'s pace (about 18 km/h at most)', kmh(top) > 12 && kmh(top) <= 18.5, going.map((q) => kmh(q.speed)));
  const down = going.filter((q) => q.state && q.state.push > 0.6 && q.feet && q.feet[1][1] - q.ground < 0.14);
  check('pushing, the back foot goes down to the road beside the board', down.length >= 3, { down: down.length, of: going.length });
  check('each push is heard as the foot scuffs the road', !!(fast.sound && fast.sound.scuffs >= 2), fast.sound);
  await page.keyboard.down('w'); await page.waitForTimeout(700); await shot('07-skateboard-pushing'); await page.keyboard.up('w');
  const ride2 = await holdUntil([], (q, got) => got.length >= 3 && q.state && q.state.push < 0.2, 30);
  const back = ride2[ride2.length - 1];
  check('done pushing, the foot is back on the board and it rolls on', back.state && back.state.push < 0.2 && back.feet[1][1] - back.ground > 0.1 && back.speed > 2, { push: back.state && back.state.push, foot: back.feet && back.feet[1], speed: kmh(back.speed) });
  await sideView(-1); await shot('08-skateboard-rolling');
  await stopped();
  check('got off the skateboard', (await getOff()) === 'Get off the Skateboard');
}

// ---- the skates ----
{
  await start(-680);
  await ride('inline-skates');
  await sideView(1);
  const still = await sample();
  check('the skates are put on: one on each foot', still.ready && still.models === 2 && still.skates && still.skates.every((d) => d < 0.2), { models: still.models, skates: still.skates });
  const going = await holdUntil(['w'], (q, got) => kmh(q.speed) >= 16 && got.length >= 12, 180, 0.12);
  const top = Math.max(...going.map((q) => q.speed));
  check('skated it goes at a skater\'s pace (about 22 km/h at most)', kmh(top) > 14 && kmh(top) <= 22.5, going.map((q) => kmh(q.speed)));
  const spread = going.filter((q) => q.feet).map((q) => Math.hypot(q.feet[0][0] - q.feet[1][0], q.feet[0][2] - q.feet[1][2]));
  check('striding, the feet go out and back in turn', Math.max(...spread) - Math.min(...spread) > 0.2, { least: Math.min(...spread).toFixed(2), most: Math.max(...spread).toFixed(2) });
  check('the skates stay on the feet as they stride', going.filter((q) => q.skates).every((q) => q.skates.every((d) => d < 0.2)), going.map((q) => q.skates));
  await page.keyboard.down('w'); await page.waitForTimeout(600); await sideView(1, 3.6, 0.12); await shot('09-skating'); await page.keyboard.up('w');
  await stopped();
  check('the skates taken off', (await getOff()) === 'Take your skates off');
}

// ---- the e-scooter ----
{
  await start(-670);
  await ride('e-scooter');
  await sideView(1);
  const going = await holdUntil(['w'], (q, got) => kmh(q.speed) >= 22 && got.length >= 6, 180);
  const fast = going[going.length - 1];
  const top = Math.max(...going.map((q) => q.speed));
  check('on the e-scooter: its motor takes it to about 25 km/h', kmh(top) > 20 && kmh(top) <= 25.5, going.map((q) => kmh(q.speed)));
  const onGrips = going.filter((q) => q.handToGrip).map((q) => Math.max(...q.handToGrip));
  check('the rider stands on its deck, hands on its grips', onGrips.length > 5 && onGrips.every((d) => d < 0.14) && going.every((q) => !q.feet || q.feet.every((f) => f[1] - q.ground > 0.15)), onGrips);
  check('its motor is heard', !!fast.sound, fast.sound);
  await page.keyboard.down('w'); await page.waitForTimeout(400); await shot('10-e-scooter'); await page.keyboard.up('w');
  await stopped();
  await getOff();
}

// ---- the hoverboard ----
{
  await start(-660);
  await ride('hoverboard');
  await sideView(1);
  const turning = await holdUntil(['a'], (q, got) => Math.abs(q.heading - got[0].heading) > 1.3 && got.length >= 3, 90);
  check('the hoverboard turns round on the spot', Math.abs(turning[turning.length - 1].heading - turning[0].heading) > 1.2 && Math.hypot(turning[turning.length - 1].at[0] - turning[0].at[0], turning[turning.length - 1].at[1] - turning[0].at[1]) < 0.3, turning.map((q) => +q.heading.toFixed(2)));
  await page.evaluate(() => window.__nlw.face(Math.PI / 2));
  const going = await holdUntil(['w'], (q, got) => kmh(q.speed) >= 10.5 && got.length >= 3, 180);
  const fast = going[going.length - 1];
  check('leaned forward it rolls at about 12 km/h, a foot on each pad', kmh(fast.speed) > 9 && kmh(fast.speed) <= 12.5 && fast.feet && Math.hypot(fast.feet[0][0] - fast.feet[1][0], fast.feet[0][2] - fast.feet[1][2]) > 0.2, { kmh: kmh(fast.speed), feet: fast.feet });
  await sideView(1, 3.4); await page.keyboard.down('w'); await page.waitForTimeout(300); await shot('11-hoverboard'); await page.keyboard.up('w');
  await stopped();
  await getOff();
}

// ---- the electric unicycle ----
{
  await start(-650);
  await ride('e-unicycle');
  await sideView(1);
  const going = await holdUntil(['w'], (q, got) => kmh(q.speed) >= 26 && got.length >= 3, 180);
  const fast = going[going.length - 1];
  check('on the electric unicycle: leaning forward it goes, to about 30 km/h', kmh(fast.speed) > 24 && kmh(fast.speed) <= 30.5 && going.some((q) => q.state && q.state.pitch > 0.03), { kmh: kmh(fast.speed), pitch: going.map((q) => q.state && +q.state.pitch.toFixed(3)) });
  check('a foot on each of its pedals', fast.feet && fast.feet.every((f) => f[1] - fast.ground > 0.14 && f[1] - fast.ground < 0.4), fast.feet);
  await page.keyboard.down('w'); await page.waitForTimeout(400); await shot('12-e-unicycle'); await page.keyboard.up('w');
  await stopped();
  await getOff();
}

// ---- left standing: the ones got off, near where they were left ----
{
  await go(-665, -40, -Math.PI / 2, { yaw: -Math.PI / 2 + 0.6, pitch: 0.3, dist: 14 });
  await page.waitForTimeout(3000);
  const parked = await page.evaluate(() => ({ town: window.__nlw.view.self.ownSports.parked.map((b) => b.item), drawn: window.__nlw.sportView.keys() }));
  check('every one got off stands where it was left, drawn there', LAND.every((id) => parked.town.includes(id)) && parked.drawn.filter((k) => k.startsWith('park:')).length >= 3, parked);
  await shot('13-left-standing');
  // back on one where it stands (the prompt beside it)
  const near = await page.evaluate(() => { const n = window.__nlw; const b = n.view.self.ownSports.parked.find((q) => q.item === 'skateboard'); n.place(b.x + 0.9, b.z); const p = n.prompt(); return p ? p.text : null; });
  check('beside one of them the player is offered to ride it again', near === 'Ride your Skateboard', near);
}

if (PHONE) {
  await start(-640);
  await ride('bicycle');
  await holdUntil(['w'], (q, got) => q.speed > 3 && got.length >= 3, 120);
  const mem = await page.evaluate(() => { const n = window.__nlw; return { pictures: +((n.graphics.pictures || 0) / 1048576).toFixed(1), buffers: +((n.graphics.buffers || 0) / 1048576).toFixed(1), shapes: +((n.graphics.shapes || 0) / 1048576).toFixed(1) }; });
  check('on a phone at Medium, riding, the graphics card holds under 135 MB', mem.pictures + mem.buffers < 135, mem);
}
check('no picture was handed to the graphics card after the page had let go of it (nothing drawn black)', (await lostPictures(page)) === 0, await lostPictures(page));
const passed = results.filter(Boolean).length;
console.log(`${passed} of ${results.length} checks passed`);
await browser.close();
server.close();
process.exit(passed === results.length ? 0 : 1);
