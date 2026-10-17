// The owner's seventeen motorcycles in a headless browser, on the website as it is served with its server:
//   - the showroom lists all seventeen at their prices; a bike's page starts its engine (the owner's recordings),
//     revs it while Rev is held and falls back to idle when let go, sounds its horn while Horn is held, and stops
//     when switched off, when another bike's page is opened or when the page is left; it puts no bike in the town;
//   - a new player buys one with arrival money, at the showroom, and it is in Property;
//   - Ride it: the bike is drawn under the player (the owner's model), the rider sits on its seat with hands on
//     its grips and feet on its pegs; the throttle takes it away, the wheels turn, it leans when steered, the
//     engine follows the throttle; getting off leaves it standing; it is still theirs after the page is reloaded;
//   - the speedometer, leaning forward and into turns, and being thrown off into a wall;
//   - every one of the seventeen ridden in turn: its engine on the recordings, its red line flat out, flames only on
//     the big engines, the brake lamp and the nose dipping on the brake, with a picture of each;
//   - another player on their motorcycle (a second copy of the town): seen on the same model, seated, leaning,
//     with its flames and brake lamp, its engine and horn heard from where it is, and let go when they get off;
//   - the lamps at night and by day; and the riding buttons on a phone.
//   ../server/with-postgres.sh node test/motorcycles.mjs [shots folder] [ids...]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDevServer } from '../../server/dev.mjs';
import { pastQuestion, enterTown } from './start.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const out = process.argv[2] || '/tmp/motorcycle-shots';
const only = process.argv.slice(3);
mkdirSync(out, { recursive: true });
const server = createDevServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); };
const TR = 2;

const context = await browser.newContext({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
const page = await context.newPage(); page.setDefaultTimeout(240000);
page.on('pageerror', (e) => check('no error in the page', false, e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 4\d\d/.test(m.text())) check('no error in the console', false, m.text()); });
const shot = (name) => page.screenshot({ path: resolve(out, `${name}.png`) });
const username = `Moto_${Math.random().toString(36).slice(2, 8)}`;
const password = 'a password for the motorcycle test';

await page.goto(`${origin}/#nointro-gameclock`, { timeout: 300000 });
await page.waitForFunction(() => !!(window.__nlw && window.__nlw.ready), null, { timeout: 300000 });
await page.waitForSelector('#open-signup', { state: 'visible', timeout: 300000 });
await page.click('#open-signup');
await page.fill('#account-username', username); await page.fill('#account-password', password);
await page.click('#account-submit');
await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 120000 });
await pastQuestion(page);
await page.fill('#name', 'Moto Test');
await enterTown(page);
await page.waitForFunction(() => window.__nlw.me && window.__nlw.me.mixer, null, { timeout: 240000 });

// ---- the showroom ----
const listed = await page.evaluate(async () => { const r = await window.__nlw.market.list('motorcycle'); return r.ok ? r.listings.map((l) => ({ id: l.id, model: l.asset.model, name: l.asset.name, price: l.price, place: l.place })) : r; });
check('the showroom lists the seventeen motorcycles', Array.isArray(listed) && listed.length === 17, Array.isArray(listed) ? listed.map((l) => `${l.name} ${l.price / TR}`) : listed);
const cheapest = listed.find((l) => l.model === 'bike:streetfighter');
check('the cheapest is 1,000 TR, the dearest 10,000 TR', cheapest.price === 1000 * TR && Math.max(...listed.map((l) => l.price)) === 10000 * TR, null);
// its page: photographs, and its engine heard there: the key, Rev held, Horn held; quiet when the page is left
await page.evaluate((id) => window.__nlw.ui.openPhone('property', { market: true, asset: id }), cheapest.id);
await page.waitForSelector('#bike-ignition', { timeout: 30000 });
await page.waitForTimeout(800);
await shot('01-listing');
const terms = await page.evaluate(() => document.querySelector('#bike-terms') && document.querySelector('#bike-terms').textContent);
check('its page says arrival money may pay for it', /arrival money included/.test(terms || ''), terms);
const pv = () => page.evaluate(() => { const a = window.__nlw.audio, s = a.status(); return { previewing: a.previewing(), preview: s.preview, vehicles: s.groups.vehicles, label: document.querySelector('#bike-ignition') && document.querySelector('#bike-ignition').textContent, revOff: document.querySelector('#bike-rev') && document.querySelector('#bike-rev').disabled, revLit: !!document.querySelector('#bike-rev.down'), hornLit: !!document.querySelector('#bike-horn.down'), recordings: s.recordings, astride: window.__nlw.view.self.astride, ridesSeen: (window.__nlw.view.players || []).filter((q) => q.ride).length }; });
let p0 = await pv();
check('before the key is turned: Start engine, Rev not yet possible, nothing running', p0.label === 'Start engine' && p0.revOff && !p0.previewing, p0);
await page.click('#bike-ignition');
await page.waitForFunction(() => { const s = window.__nlw.audio.status(); return s.preview && s.preview.recording && s.preview.running; }, null, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(2500);         // (the starter, then it catches)
p0 = await pv();
check('Start engine: the owner\'s recording of the start, then its idle, heard; the key now switches it off', p0.preview && p0.preview.running && p0.preview.recording && p0.label === 'Switch off' && !p0.revOff && p0.vehicles > 0.001 && p0.recordings.sport === 'ready', p0);
check('the page\'s engine is only a sound: no bike in the town, and nobody else is sent one', !p0.astride && p0.ridesSeen === 0, p0);
const idleRev = p0.preview.rev;
// Rev held: green while held, the revs climbing smoothly to the red line
const revBox = await page.locator('#bike-rev').boundingBox();
await page.mouse.move(revBox.x + revBox.width / 2, revBox.y + revBox.height / 2);
await page.mouse.down();
const climb = [];
for (let i = 0; i < 8; i += 1) { await page.waitForTimeout(200); climb.push((await pv()).preview.rev); }
const held = await pv();
check('Rev held: lit green, the revs climb smoothly towards the red line', held.revLit && held.preview.revving && climb.every((r, i) => i === 0 || (r >= climb[i - 1] - 0.01 && r - climb[i - 1] < 0.3)) && climb[climb.length - 1] > 0.9 && idleRev < 0.05, { climb, held });
await page.mouse.up();
const revFall = [];
for (let i = 0; i < 6; i += 1) { await page.waitForTimeout(250); revFall.push((await pv()).preview.rev); }
const after = await pv();
check('let go: no longer lit, the revs fall back gradually to idle', !after.revLit && !after.preview.revving && revFall[0] > 0.3 && revFall.every((r, i) => i === 0 || r <= revFall[i - 1]) && revFall[revFall.length - 1] < 0.3, { revFall, after });
// dragged off the button while held: it lets go (never left revving)
await page.mouse.move(revBox.x + revBox.width / 2, revBox.y + revBox.height / 2);
await page.mouse.down();
await page.waitForTimeout(400);
await page.mouse.move(revBox.x + revBox.width / 2, revBox.y - 160, { steps: 6 });
await page.waitForTimeout(150);
const dragged = await pv();
await page.mouse.up();
check('a finger dragged off Rev lets it go', !dragged.revLit && !dragged.preview.revving, dragged);
// Horn held: sounds for as long as it is held
const hornBox = await page.locator('#bike-horn').boundingBox();
await page.mouse.move(hornBox.x + hornBox.width / 2, hornBox.y + hornBox.height / 2);
await page.mouse.down();
await page.waitForTimeout(500);
const honk = await pv();
await page.mouse.up();
await page.waitForTimeout(100);
const unhonk = await pv();
check('Horn held: lit green and sounding; let go, it stops', honk.hornLit && honk.preview.horn && !unhonk.hornLit && !unhonk.preview.horn, { honk: honk.preview, unhonk: unhonk.preview });
await shot('01b-engine-page');
await page.click('#bike-ignition');
await page.waitForTimeout(300);
const offd = await pv();
check('Switch off: it runs down and stops; Rev is not possible again until it is started', offd.label === 'Start engine' && offd.revOff && !offd.preview.running, offd);
// one engine at a time: started, then another motorcycle's page: the first stops
await page.click('#bike-ignition');
await page.waitForTimeout(600);
const other = listed.find((l) => l.model === 'bike:black-bobber');
await page.evaluate((id) => window.__nlw.ui.openPhone('property', { market: true, asset: id }), other.id);
await page.waitForSelector('#bike-ignition', { timeout: 30000 });
await page.waitForTimeout(400);
const switched = await pv();
check('another motorcycle\'s page stops the first engine (nothing left running)', !switched.previewing && switched.label === 'Start engine', switched);
await page.click('#bike-ignition');
await page.waitForFunction(() => { const s = window.__nlw.audio.status(); return s.preview && s.preview.recording; }, null, { timeout: 60000 }).catch(() => {});
const twinEngine = await pv();
check('a V-twin cruiser (the Black Bobber) plays the V-twin recordings', twinEngine.preview && twinEngine.preview.id === 'black-bobber' && twinEngine.preview.recording && twinEngine.recordings.twin === 'ready', twinEngine);
await page.evaluate(() => window.__nlw.ui.openPhone('property', {}));
await page.waitForTimeout(300);
check('leaving the page stops it', !(await page.evaluate(() => window.__nlw.audio.previewing())), null);
await page.keyboard.press('Escape');

// ---- bought with arrival money, at the showroom ----
const bought = await page.evaluate(async (l) => {
  const n = window.__nlw;
  n.place(l.place.x, l.place.z - 2);
  const opened = await n.market.open(l.id, { x: l.place.x, z: l.place.z - 1 });
  if (!opened.ok) return opened;
  const r = await n.market.offer(opened.thread.id, l.price, l.name, 0);
  await n.market.mine();
  return { ok: r.ok, status: r.offer && r.offer.status, code: r.code, balance: r.balance, starter: r.starter, mine: n.market.state.mine.holdings.map((h) => h.asset.model) };
}, cheapest);
check('a new player buys the Streetfighter with arrival money', bought.ok && bought.status === 'accepted' && bought.balance === 1000 * TR && bought.mine.includes('bike:streetfighter'), bought);
await page.waitForFunction(() => window.__nlw.view.self.ownBikes && window.__nlw.view.self.ownBikes.bikes.includes('streetfighter'), null, { timeout: 30000 }).catch(() => {});
check('the town is told it is theirs', await page.evaluate(() => window.__nlw.view.self.ownBikes.bikes.includes('streetfighter')), null);

// ---- riding it ----
async function measure() {
  return page.evaluate(() => {
    const n = window.__nlw, me = n.me, v = n.ownBikeView;
    const at = (b) => me.bones.get(b).getWorldPosition(new THREE.Vector3());
    const ride = n.view.self.astride;
    // the bike drawn under the player: its grips, pegs and seat in the world
    const b = v.ridden();
    if (!b || !ride) return { drawn: false, ready: v.ready(), failed: v.failed() };
    const bike = b.group;
    const w = (p) => b.lean.localToWorld(p.clone());
    const gripL = w(b.grips[0]), gripR = w(b.grips[1]), pegL = w(b.pegs[0]), pegR = w(b.pegs[1]), seat = w(b.seat);
    let spin = 0; bike.traverse((o) => { if (o.isGroup && Math.abs(o.rotation.x) > spin && o !== bike) spin = Math.abs(o.rotation.x); });
    return {
      drawn: true, model: ride.model, ready: v.ready(),
      handL: +at('hand_l').distanceTo(gripL).toFixed(3), handR: +at('hand_r').distanceTo(gripR).toFixed(3),
      footL: +at('foot_l').distanceTo(pegL).toFixed(3), footR: +at('foot_r').distanceTo(pegR).toFixed(3),
      hipsOverSeat: +(at('pelvis').y - seat.y).toFixed(3), hipsFromSeat: +Math.hypot(at('pelvis').x - seat.x, at('pelvis').z - seat.z).toFixed(3),
      lean: +n.bikeState.lean.toFixed(3), speed: +n.bikeState.speed.toFixed(2), spin: +spin.toFixed(2), x: +n.view.self.x.toFixed(2), z: +n.view.self.z.toFixed(2),
      engine: n.audio.status().bike,
      debug: { hand: at('hand_l').toArray().map((x) => +x.toFixed(2)), grip: gripL.toArray().map((x) => +x.toFixed(2)), peg: pegL.toArray().map((x) => +x.toFixed(2)), foot: at('foot_l').toArray().map((x) => +x.toFixed(2)) },
    };
  });
}
const seated = (m) => m.drawn && m.ready && m.handL < 0.13 && m.handR < 0.13 && m.footL < 0.16 && m.footR < 0.16 && m.hipsOverSeat > 0 && m.hipsOverSeat < 0.2 && m.hipsFromSeat < 0.35;
await page.evaluate(() => window.__nlw.ui.openPhone('property', {}));
await page.waitForTimeout(1500);
const holding = await page.evaluate(() => window.__nlw.market.state.mine.holdings.find((h) => h.asset.model === 'bike:streetfighter').id);
await page.evaluate((id) => window.__nlw.ui.openPhone('property', { own: id }), holding);
await page.waitForSelector('#ride-bike', { timeout: 30000 });
await shot('02-owned');
// (on Asaba Airport's runway, long and open, where nobody walks, to ride)
await page.evaluate(() => { const n = window.__nlw; n.place(-600, -454); n.face(-Math.PI / 2); });
await page.click('#ride-bike');
await page.waitForFunction(() => window.__nlw.ownBikeView.ready() || window.__nlw.ownBikeView.failed(), null, { timeout: 300000 });
await page.evaluate(() => { const n = window.__nlw; n.cam.yaw = n.me.group.rotation.y - Math.PI / 2; n.cam.dist = 4.2; n.cam.pitch = 0.15; });
await page.waitForTimeout(800);
let m = await measure();
check('Ride it: the Streetfighter is drawn under the player, who sits on its seat with hands on the grips and feet on the pegs', seated(m), m);
await shot('03-on');
const start = { x: m.x, z: m.z };
await page.keyboard.down('w'); await page.waitForTimeout(4000);   // (a headless browser draws slowly, and the game's time with it)
m = await measure();
check('the throttle takes it away, the wheels turn and the engine runs', m.speed > 3 && Math.hypot(m.x - start.x, m.z - start.z) > 3 && m.spin > 0.5 && m.engine && m.engine.running, m);
// the speedometer: at the front of the screen, see-through, the bike's own km/h, its engine size under it
const dial = await page.evaluate(() => { const e = document.querySelector('#speedo'); const r = e.getBoundingClientRect(); const n = window.__nlw; return { shown: !e.hidden && r.width > 0, centre: Math.abs((r.left + r.right) / 2 - innerWidth / 2), low: r.bottom > innerHeight * 0.6, reading: n.speedo.reading, kmh: Math.abs(n.bikeState.speed) * 3.6, max: n.speedo.max, cc: e.querySelector('.cc').textContent, back: getComputedStyle(e).backgroundColor }; });
check('the speedometer shows at the front of the screen, see-through, reading the bike\'s km/h, with its engine size', dial.shown && dial.centre < 4 && dial.low && Math.abs(dial.reading - dial.kmh) < 8 && dial.cc === '650 CC' && dial.max >= 108 && /rgba\(0, 0, 0, 0\)|transparent/.test(dial.back), dial);
await shot('03b-speedometer');
// the speed rises smoothly while the throttle is held (no jump from one reading to the next)
const readings = [];
for (let i = 0; i < 8; i += 1) { readings.push(await page.evaluate(() => window.__nlw.speedo.reading)); await page.waitForTimeout(150); }
check('the speed climbs smoothly while the throttle is held', readings.every((r, i) => i === 0 || (r >= readings[i - 1] - 1 && r - readings[i - 1] < 25)) && readings[readings.length - 1] > readings[0], readings);
// steered right at speed: the bike leans over, the rider's body goes further into the turn and the head turns into it
const bodyNow = () => page.evaluate(() => {
  const n = window.__nlw, me = n.me, g = me.group;
  const at = (b) => me.bones.get(b).getWorldPosition(new THREE.Vector3());
  const o = g.localToWorld(new THREE.Vector3(0, 0, 0));
  const right = g.localToWorld(new THREE.Vector3(-1, 0, 0)).sub(o).setY(0).normalize();
  const head = at('head'), pelvis = at('pelvis');
  // where the head is, across the bike, beyond what the bike's own lean puts it
  const local = g.worldToLocal(head.clone()), localPelvis = g.worldToLocal(pelvis.clone());
  const hq = me.bones.get('head').getWorldQuaternion(new THREE.Quaternion());
  const fwd = g.localToWorld(new THREE.Vector3(0, 0, 1)).sub(o).setY(0).normalize();
  // which of the head bone's own axes is its face's forward (the skeleton's own choice): the one most along the
  // bike's forward when the head is straight (window.__lookAxis, found on the first look)
  const axes = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((a) => new THREE.Vector3(...a).applyQuaternion(hq).setY(0).normalize());
  if (window.__lookAxis === undefined) window.__lookAxis = axes.reduce((best, a, i) => (a.dot(fwd) > axes[best].dot(fwd) ? i : best), 0);
  const look = axes[window.__lookAxis];
  return { headRight: +head.clone().sub(pelvis).dot(right).toFixed(3), bodyBeyondBike: +(localPelvis.x - local.x).toFixed(3), lookRight: +look.dot(right).toFixed(3), lookFwd: +look.dot(fwd).toFixed(3), heading: n.view.self.heading };
});
const before = await page.evaluate(() => window.__nlw.view.self.heading);
const straight = await bodyNow();
await page.keyboard.down('d'); await page.waitForTimeout(650);
m = await measure();
check('steered at speed, it leans into the turn, and the rider stays on it', m.lean > 0.1 && seated(m), m);
const body = await bodyNow();
// (and straight onto the brake: at this speed the runway's edge is near; the rest is measured as it slows)
await page.keyboard.up('d'); await page.keyboard.up('w'); await page.keyboard.down('s');
const braking0 = await page.evaluate(() => ({ speed: window.__nlw.bikeState.speed, red: document.querySelector('#speedo').classList.contains('braking') }));
const turnedRight = body.heading < before;
check('into a right turn the rider leans right, further than the bike, and looks into the turn', turnedRight && body.headRight > 0.05 && body.bodyBeyondBike > 0.02 && body.lookRight - straight.lookRight > 0.1, { body, straight, before });
// leaning forward: the head ahead of the hips
const forward = await page.evaluate(() => { const n = window.__nlw, me = n.me, g = me.group; const l = (b) => g.worldToLocal(me.bones.get(b).getWorldPosition(new THREE.Vector3())); return +(l('head').z - l('pelvis').z).toFixed(3); });
check('the rider leans forward over the tank', forward > 0.12, forward);
await page.evaluate(() => { const n = window.__nlw; n.cam.yaw = n.me.group.rotation.y + Math.PI; n.cam.dist = 4.5; n.cam.pitch = 0.12; });
await page.waitForTimeout(200);
await shot('04-leaning');
await page.waitForTimeout(1800);
m = await measure();
await page.keyboard.up('s');
check('the brake stops it fast (held on, it is then walked back), and the speedometer shows braking', m.speed < 0.5 && m.speed > -1.3 && braking0.red, { m, braking0 });
const off = await page.evaluate(() => { const p = window.__nlw.prompt(); if (p) p.run(); return window.__nlw.view.self; });
await page.waitForTimeout(800);
const left = await page.evaluate(() => ({ astride: window.__nlw.view.self.astride, parked: window.__nlw.view.self.ownBikes.parked, engine: window.__nlw.audio.status().bike }));
check('getting off leaves it standing where it was, and the engine stops', !left.astride && left.parked.length === 1 && left.parked[0].bike === 'streetfighter' && !left.engine, left);
await page.evaluate(() => { const n = window.__nlw; n.cam.dist = 5; });
await page.waitForTimeout(600);
await shot('05-parked');

// ---- still theirs after the page is loaded again ----
await page.reload({ timeout: 300000 });
await page.waitForFunction(() => !!(window.__nlw && window.__nlw.ready), null, { timeout: 300000 });
await page.waitForFunction(() => window.__nlw.view && window.__nlw.view.self && !document.querySelector('#hud').hidden, null, { timeout: 240000 }).catch(() => {});
await page.waitForFunction(() => window.__nlw.view.self.ownBikes && window.__nlw.view.self.ownBikes.bikes.includes('streetfighter'), null, { timeout: 60000 }).catch(() => {});
check('after loading the page again, it is still theirs', await page.evaluate(() => window.__nlw.view.self.ownBikes.bikes.includes('streetfighter')), null);

// ---- coming off: ridden into a wall at speed ----
await page.evaluate(() => { const n = window.__nlw; n.place(48, -92); n.face(0); });
await page.waitForTimeout(400);
await page.evaluate(() => window.__nlw.rideBike('streetfighter'));
await page.waitForFunction(() => window.__nlw.ownBikeView.ready() || window.__nlw.ownBikeView.failed(), null, { timeout: 300000 });
const health0 = await page.evaluate(() => window.__nlw.view.self.health);
await page.evaluate(() => { const n = window.__nlw; n.cam.yaw = Math.PI * 0.75; n.cam.dist = 7; n.cam.pitch = 0.25; n.bikeState.speed = 22; });
await page.keyboard.down('w');
await page.waitForFunction(() => !window.__nlw.view.self.astride, null, { timeout: 20000 }).catch(() => {});
await page.keyboard.up('w');
await page.waitForTimeout(500);
const fall = await page.evaluate(() => { const n = window.__nlw, s = n.view.self; return { astride: s.astride, down: s.down, health: s.health, parked: s.ownBikes.parked.find((b) => b.bike === 'streetfighter'), lying: n.me.fall, speedo: !document.querySelector('#speedo').hidden, notice: [...document.querySelectorAll('#notices > *')].map((e) => e.textContent).join(' | ') }; });
await shot('06-thrown-off');
const lost = health0 - fall.health;
check('into a wall at speed, the rider is thrown off by themselves: on the ground, with a fall', !fall.astride && fall.down && fall.down.by === 'crash' && fall.lying > 0.5 && /Thrown off/.test(fall.notice), fall);
check('the life lost follows the speed, and is no more than 5', lost >= 1 && lost <= 5, { health0, after: fall.health, lost });
check('the bike lies where it hit; the speedometer is gone', fall.parked && fall.parked.fallen && !fall.speedo, fall.parked);
await page.waitForFunction(() => !window.__nlw.view.self.down, null, { timeout: 30000 }).catch(() => {});
check('and up again after a few seconds', await page.evaluate(() => !window.__nlw.view.self.down), null);

// ---- every one of the seventeen ----
let shotFlames = false;
const all = only.length ? only : listed.map((l) => l.model.slice(5));
await page.evaluate((ids) => window.__nlw.server.send({ type: 'bikes.owned', bikes: ids }), all);
for (const id of all) {
  // (the bikes already ridden are put away, out of the way of this one's run down the runway)
  await page.evaluate(() => { const n = window.__nlw; if (n.view.self.astride) n.server.send({ type: 'moto.leave' }); const me = n.host.game.state.players[n.playerId]; if (me.parked) for (const k of Object.keys(me.parked)) delete me.parked[k]; n.place(-600, -454); n.face(-Math.PI / 2); });
  await page.waitForTimeout(300);
  const r = await page.evaluate((which) => window.__nlw.rideBike(which), id);
  if (!r || !r.ok) { check(`${id}: ridden`, false, r); continue; }
  await page.waitForFunction(() => window.__nlw.ownBikeView.ready() || window.__nlw.ownBikeView.failed(), null, { timeout: 300000 });
  await page.evaluate(() => { const n = window.__nlw; n.cam.yaw = n.me.group.rotation.y - Math.PI / 2 + 0.35; n.cam.dist = 4.2; n.cam.pitch = 0.12; });
  await page.waitForTimeout(900);
  m = await measure();
  check(`${id}: its model under the rider, hands on its grips, feet on its pegs, hips on its seat`, seated(m) && m.model === id, m);
  await shot(`10-${id}`);
  await page.keyboard.down('w'); await page.waitForTimeout(1500);
  m = await measure();
  check(`${id}: rides, wheels turning, its engine running on the owner's recordings`, m.speed > 2 && m.spin > 0.3 && m.engine && m.engine.running && m.engine.id === id && m.engine.recording === true, { speed: m.speed, spin: m.spin, engine: m.engine });
  // flat out at its top speed: the engine at its red line; flames from the silencers only on the big engines
  await page.evaluate((which) => { const n = window.__nlw; n.bikeState.speed = n.bikeTop(which) * 0.99; }, id);
  let flame = 0, rev = 0;
  // (held there: a headless browser's frames are slow and uneven, and a step the server finds too long stops it)
  const bigOne = (await page.evaluate((which) => window.__nlw.bikeCc(which), id)) >= 1850;
  for (let i = 0; i < 30 && !(rev > 0.9 && (bigOne ? flame > 0.2 : i >= 3)); i += 1) { await page.waitForTimeout(150); const f = await page.evaluate((which) => { const n = window.__nlw, st = n.ownBikeView.stateOf(); if (n.view.self.astride) n.bikeState.speed = Math.max(n.bikeState.speed, n.bikeTop(which) * 0.97); const b = n.audio.status().bike; return { flame: st ? st.flame : 0, rev: b ? b.rev : 0, astride: !!n.view.self.astride, speed: +n.bikeState.speed.toFixed(1), x: +n.view.self.x.toFixed(1), z: +n.view.self.z.toFixed(1), down: !!n.view.self.down }; }, id); if (process.env.TRACE) console.log('FLAT', id, JSON.stringify(f)); flame = Math.max(flame, f.flame); rev = Math.max(rev, f.rev); }
  const big = await page.evaluate((which) => window.__nlw.bikeCc(which), id) >= 1850;
  check(`${id}: flat out, the engine at its red line; ${big ? 'flames from its silencers' : 'no flames (not one of the big engines)'}`, rev > 0.9 && (big ? flame > 0.2 : flame === 0), { rev, flame, big });
  if (big && !shotFlames) { shotFlames = true; await page.evaluate(() => { const n = window.__nlw; n.cam.yaw = n.me.group.rotation.y + 0.5; n.cam.dist = 3.6; n.cam.pitch = 0.1; }); await page.waitForTimeout(150); await shot(`11-flames-${id}`); }
  // and on the brake: the brake lamp lit, the nose down
  await page.evaluate(() => { window.__nlw.bikeState.speed = 12; });
  await page.keyboard.up('w'); await page.keyboard.down('s');
  let brake = null;
  for (let i = 0; i < 8 && !(brake && brake.brake === 1 && brake.dive > 0.005); i += 1) {
    await page.waitForTimeout(100);
    brake = await page.evaluate(() => { const n = window.__nlw, st = n.ownBikeView.stateOf(); if (n.view.self.astride && n.bikeState.speed < 6) n.bikeState.speed = 10; return st ? { brake: st.brake, dive: +st.dive.toFixed(3), flame: st.flame, speed: +n.bikeState.speed.toFixed(2), astride: !!n.view.self.astride, down: !!n.view.self.down } : null; });
  }
  check(`${id}: braking, its brake lamp lights red and the nose dips`, brake && brake.brake === 1 && brake.dive > 0.005, brake);
  await page.waitForTimeout(1500); await page.keyboard.up('s');
}

// ---- another player on a motorcycle, seen and heard from here (a second player in a second copy of the town,
// joined by the same path two devices take) ----
await page.evaluate(() => { const n = window.__nlw; if (n.view.self.astride) n.server.send({ type: 'moto.leave' }); n.place(-600, -454); n.face(-Math.PI / 2); });
await page.waitForTimeout(500);
const peer = await page.evaluate(() => {
  const n = window.__nlw, me = n.view.self;
  const t = n.twin('Second Rider', me.x - 10, me.z + 3.5);
  const g = t.host.game;
  g.intent(t.id, { type: 'bikes.owned', bikes: ['power-cruiser'] });
  const on = g.intent(t.id, { type: 'bikes.ride', bike: 'power-cruiser' });
  // ridden past at walking pace, wide open (as its game would say), leaning a little
  window.__peerRide = { throttle: 1, brake: false, rev: 0.95, lean: 0.25, speed: 3 };
  window.__peerTimer = setInterval(() => {
    const q = g.state.players[t.id], r = window.__peerRide;
    if (q.astride === null || q.astride === undefined) return;
    g.intent(t.id, { type: 'moto.drive', x: q.x + (r.speed > 0 ? 0.25 : 0), z: q.z, heading: Math.PI / 2, lean: r.lean, speed: r.speed, throttle: r.throttle, brake: r.brake, rev: r.rev });
  }, 100);
  return { id: t.id, on };
});
check('a second player gets on their own Dark Power Cruiser', peer.on && peer.on.ok, peer.on);
// (seen here as a visitor from the other copy, under the id the link gives them)
await page.waitForFunction(() => (window.__nlw.view.players || []).some((q) => q.ride && q.ride.bike === 'power-cruiser'), null, { timeout: 60000 }).catch(() => {});
peer.seenAs = await page.evaluate(() => { const q = (window.__nlw.view.players || []).find((o) => o.ride && o.ride.bike === 'power-cruiser'); return q ? q.id : null; });
await page.waitForFunction((id) => window.__nlw.peerBikeView.ridden(`peer:${id}`), peer.seenAs, { timeout: 120000 }).catch(() => {});
await page.waitForTimeout(1500);
const seenPeer = await page.evaluate((id) => {
  const n = window.__nlw, key = `peer:${id}`, b = n.peerBikeView.ridden(key), rig = n.crowd.rigOf(`p:${id}`);
  const q = (n.view.players || []).find((p) => p.id === id);
  if (!b || !rig) return { drawn: !!b, rig: !!rig, q };
  const w = (p) => b.lean.localToWorld(p.clone());
  const kit = { hand_l: 'Hand_L', foot_l: 'Foot_L' };
  const boneOf = (name) => (!rig.bones ? null : typeof rig.bones.get === 'function' ? rig.bones.get(name) : rig.bones.find((b) => b.name === kit[name]));
  const at = (bone) => (boneOf(bone) ? boneOf(bone).getWorldPosition(new THREE.Vector3()) : null);
  const hand = at('hand_l'), foot = at('foot_l');
  const st = n.peerBikeView.stateOf(key), heard = n.audio.status().peerBikes.find((e) => e.key === id);
  const r = n.peerRides.find((e) => e.key === id);
  return { drawn: true, model: b.id, ride: q && q.ride, apart: r ? +Math.hypot(b.group.position.x - r.x, b.group.position.z - r.z).toFixed(3) : null, kit: typeof rig.bones.get !== 'function', handAt: hand && hand.toArray().map((v) => +v.toFixed(2)), gripAt: w(b.grips[0]).toArray().map((v) => +v.toFixed(2)), footAt: foot && foot.toArray().map((v) => +v.toFixed(2)), pegAt: w(b.pegs[0]).toArray().map((v) => +v.toFixed(2)), lean: +b.lean.rotation.z.toFixed(3),
    hand: hand ? +hand.distanceTo(w(b.grips[0])).toFixed(3) : null, foot: foot ? +foot.distanceTo(w(b.pegs[0])).toFixed(3) : null, flame: st && st.flame, heard };
}, peer.seenAs);
check('here, the other player is seen on the same model, leaning as their game says, hands on its grips and feet on its pegs', seenPeer.drawn && seenPeer.model === 'power-cruiser' && seenPeer.ride && seenPeer.ride.bike === 'power-cruiser' && seenPeer.apart !== null && seenPeer.apart < 0.05 && Math.abs(seenPeer.lean - 0.25) < 0.03 && seenPeer.hand !== null && seenPeer.hand < 0.15 && seenPeer.foot < 0.18, seenPeer);
check('wide open near its red line, the other player\'s big engine shows flames here too', seenPeer.flame > 0.2, seenPeer.flame);
check('and its engine is heard from where it is, on the owner\'s recordings (one engine for it, no more)', seenPeer.heard && seenPeer.heard.running && seenPeer.heard.recording && (await page.evaluate(() => window.__nlw.audio.status().peerBikes.length)) === 1, seenPeer.heard);
await page.evaluate(() => { const n = window.__nlw; n.cam.yaw = n.me.group.rotation.y; n.cam.dist = 3; n.cam.pitch = 0.15; });
await page.waitForTimeout(300);
await shot('12-another-player');
await page.evaluate(() => { window.__peerRide = { throttle: 0, brake: true, rev: 0.4, lean: 0, speed: 3 }; });
await page.waitForFunction((id) => { const st = window.__nlw.peerBikeView.stateOf(`peer:${id}`); return st && st.brake === 1; }, peer.seenAs, { timeout: 20000 }).catch(() => {});
const peerBrake = await page.evaluate((id) => { const st = window.__nlw.peerBikeView.stateOf(`peer:${id}`); return st && { brake: st.brake, flame: st.flame }; }, peer.seenAs);
check('on the brake, their brake lamp is lit here', peerBrake && peerBrake.brake === 1, peerBrake);
const hornsBefore = await page.evaluate(() => window.__nlw.peerHornsHeard);
await page.evaluate((id) => window.__nlw.second.host.game.intent(id, { type: 'moto.horn' }), peer.id);
await page.waitForFunction((n0) => window.__nlw.peerHornsHeard > n0, hornsBefore, { timeout: 8000 }).catch(() => {});
check('their horn is heard here, from where they are', (await page.evaluate(() => window.__nlw.peerHornsHeard)) > hornsBefore, null);
// off their bike: nothing of it is left drawn or running here
await page.evaluate((id) => { clearInterval(window.__peerTimer); window.__nlw.second.host.game.intent(id, { type: 'moto.leave' }); }, peer.id);
await page.waitForFunction(() => !window.__nlw.peerBikeView.keys().some((k) => k.startsWith('peer:')) && window.__nlw.audio.status().peerBikes.length === 0, null, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1500);
const gone = await page.evaluate(() => ({ keys: window.__nlw.peerBikeView.keys(), heard: window.__nlw.audio.status().peerBikes.length }));
check('when they get off, their bike is no longer ridden here and its engine is let go; it is seen standing where they left it', !gone.keys.some((k) => k.startsWith('peer:')) && gone.heard === 0 && gone.keys.some((k) => k.startsWith('ppark:') && k.endsWith(':power-cruiser')), gone);

// ---- at night: the headlamp lights the road ahead ----
for (let i = 0; i < 24 && (await page.evaluate(() => window.__nlw.night)) < 0.6; i += 1) { await page.evaluate(() => window.__nlw.skip(1)); await page.waitForTimeout(200); }
await page.evaluate(() => { const n = window.__nlw; n.place(-600, -454); n.face(-Math.PI / 2); });
await page.waitForTimeout(300);
await page.evaluate(() => window.__nlw.rideBike('streetfighter'));
await page.waitForFunction(() => window.__nlw.ownBikeView.ready(), null, { timeout: 120000 });
await page.evaluate(() => { const n = window.__nlw; n.cam.yaw = n.me.group.rotation.y + Math.PI; n.cam.dist = 5; n.cam.pitch = 0.18; });
await page.waitForTimeout(1200);
const dark = await page.evaluate(() => { const n = window.__nlw, st = n.ownBikeView.stateOf(); return { night: n.night, head: st && st.head, tail: st && st.tail, light: n.headlight.intensity }; });
check('at night the headlamp and tail lamp are on, and the headlamp lights the way ahead', dark.night > 0.5 && dark.head === 1 && dark.tail === 1 && dark.light > 0, dark);
await shot('13-night');
for (let i = 0; i < 24 && (await page.evaluate(() => window.__nlw.night)) > 0.1; i += 1) { await page.evaluate(() => window.__nlw.skip(1)); await page.waitForTimeout(100); }
const day = await page.evaluate(() => { const n = window.__nlw, st = n.ownBikeView.stateOf(); return { night: n.night, head: st && st.head, light: n.headlight.intensity }; });
check('by day the lamps are off', day.head === 0 && day.light === 0, day);

// ---- on a phone held sideways: the riding buttons in the owner's design, and the speedometer clear of them ----
await page.evaluate(() => { const n = window.__nlw; if (n.view.self.astride) n.server.send({ type: 'moto.leave' }); });
await page.evaluate(() => window.__nlw.accountSync && window.__nlw.accountSync.upload && window.__nlw.accountSync.upload()).catch(() => {});
await page.waitForTimeout(500);
await context.close();          // (one town drawn at a time on this machine)
const phone = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
const pp = await phone.newPage(); pp.setDefaultTimeout(240000);
pp.on('pageerror', (e) => check('no error on the phone', false, e.message));
await pp.goto(`${origin}/#nointro-gameclock`, { timeout: 300000 });
await pp.waitForFunction(() => !!(window.__nlw && window.__nlw.ready), null, { timeout: 300000 });
await pp.waitForSelector('#open-login', { state: 'visible', timeout: 300000 });
await pp.tap('#open-login');
await pp.fill('#account-username', username); await pp.fill('#account-password', password);
await pp.tap('#account-submit');
await pp.waitForFunction(() => window.__nlw.view && window.__nlw.playerId && !document.querySelector('#hud').hidden, null, { timeout: 300000 }).catch(async () => { await pp.screenshot({ path: resolve(out, '07-phone-stuck.png') }); console.log('PHONE', JSON.stringify(await pp.evaluate(() => ({ state: window.__nlw.online.status(), screen: document.querySelector('#start') && document.querySelector('#start').dataset.screen, err: (document.querySelector('#account-error') || {}).textContent })))); });
await pp.waitForFunction(() => window.__nlw.view.self.ownBikes && window.__nlw.view.self.ownBikes.bikes.length > 0, null, { timeout: 120000 }).catch(() => {});
await pp.evaluate(() => { const n = window.__nlw; n.place(-600, -454); n.face(-Math.PI / 2); });
await pp.waitForTimeout(300);
await pp.evaluate(() => window.__nlw.rideBike('streetfighter'));
await pp.waitForFunction(() => window.__nlw.ownBikeView.ready() || window.__nlw.ownBikeView.failed(), null, { timeout: 300000 });
await pp.evaluate(() => { window.__nlw.bikeState.speed = 14; });
await pp.waitForTimeout(800);
const layout = await pp.evaluate(() => {
  const box = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
  const dial = box(document.querySelector('#speedo'));
  const pads = [...document.querySelectorAll('.pad')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => ({ id: e.dataset.id, shape: e.dataset.shape, ...box(e), shadow: getComputedStyle(e).boxShadow }));
  const over = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  return { dial, shown: !document.querySelector('#speedo').hidden, clash: pads.filter((p) => over(p, dial)).map((p) => p.id), pads: pads.map((p) => [p.id, p.shape, p.shadow.includes('rgb(92, 176, 255)')]) };
});
await pp.screenshot({ path: resolve(out, '07-phone-riding.png') });
check('on a phone: the speedometer is shown and no button is under it; every riding button is in the blue design', layout.shown && layout.clash.length === 0 && layout.pads.every((p) => p[2]) && layout.pads.some((p) => p[0] === 'throttle' && p[1] === 'pedal-tall'), layout);
await phone.close();

const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nAll ${results.length} checks passed.`);
await browser.close(); server.close();
await require('../../api/_lib/db.js').closeDatabase().catch(() => {});
process.exit(failed ? 1 : 0);
