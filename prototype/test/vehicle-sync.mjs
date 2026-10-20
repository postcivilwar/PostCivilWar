// Vehicles seen by every player, on the website as it is served with its server: two players in two browsers, each
// with its own copy of the town, joined only by the website (the presence the server keeps), with the network made
// slow (a delay each way, as on a mobile connection).
//   - one hires a keke and drives it: the other sees that keke (its plate and paint) with them at the wheel, where it
//     really is, moving smoothly, its lamps at night; the hire fleet's keke is no longer also shown in its bay;
//   - the driver gets out and walks off: the keke is seen standing where it was left, and gone with them;
//   - someone on an okada, and on the back of one, is seen on it (from a visitor's word, as the link gives it);
//   - another player on their own motorcycle is seen on it, its bars turned as theirs are, their phone in their left
//     hand; another in their open car is seen at its wheel with the phone in their right; one in a closed car is not
//     seen through it; more motorcycles about than are drawn as models are their pictures, each with its rider on it;
//   - nothing goes wrong in either page.
//   ../server/with-postgres.sh node test/vehicle-sync.mjs [shots folder]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDevServer } from '../../server/dev.mjs';
import { pastQuestion, enterTown, watchPictures, lostPictures } from './start.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const out = process.argv[2] || '/tmp/vehicle-sync-shots';
mkdirSync(out, { recursive: true });
const server = createDevServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); };
const LATENCY = 220;          // ms each way

async function player(label, size) {
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1, serviceWorkers: 'block' });
  await watchPictures(context);
  const page = await context.newPage(); page.setDefaultTimeout(240000);
  page.on('pageerror', (e) => check(`no error in ${label}'s page`, false, `${e.message} ${(e.stack || '').split('\n').slice(0, 4).join(' | ')}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 4\d\d/.test(m.text())) check(`no error in ${label}'s console`, false, m.text()); });
  await page.goto(`${origin}/#nointro-gameclock`, { timeout: 300000 });
  await page.waitForFunction(() => !!(window.__nlw && window.__nlw.intro), null, { timeout: 300000 });
  await page.waitForSelector('#open-signup', { state: 'visible', timeout: 300000 });
  await page.click('#open-signup');
  const username = `${label}_${Math.random().toString(36).slice(2, 7)}`;
  await page.fill('#account-username', username); await page.fill('#account-password', `a password for ${label}`);
  await page.click('#account-submit');
  await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 120000 });
  await pastQuestion(page);
  await page.fill('#name', label);
  await enterTown(page);
  // the network made slow, as on a mobile connection
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: LATENCY, downloadThroughput: 1.5e6 / 8, uploadThroughput: 750e3 / 8 });
  return { context, page, username, shot: (name) => page.screenshot({ path: resolve(out, `${name}.png`) }) };
}

const A = await player('Driver', { width: 560, height: 360 });
const B = await player('Watcher', { width: 900, height: 560 });

// ---- A hires a keke at the motor park; B stands by the road ----
const hired = await A.page.evaluate(() => {
  const n = window.__nlw;
  const park = n.service('park');
  n.place(park.x, park.z);
  const r = n.server.send({ type: 'vehicle.hire' });
  if (!r.ok) return r;
  const v = n.view.vehicles.find((x) => x.id === r.vehicle.id);
  n.place(v.x + 1.6, v.z);
  const e = n.server.send({ type: 'vehicle.enter', vehicleId: v.id });
  return { ok: e.ok, code: e.code, id: v.id, plate: v.plate, look: v.look, x: v.x, z: v.z, bay: { x: v.x, z: v.z } };
});
check('the driver hires a keke at the motor park and gets in', hired.ok, hired);
if (!hired.ok) { await browser.close(); server.close(); process.exit(1); }
await B.page.evaluate((h) => { const n = window.__nlw; n.place(h.x + 14, h.z + 6); }, hired);
// (alone in town a game asks the website only every ten seconds; then, with someone near, often)
await B.page.waitForFunction((name) => (window.__nlw.view.players || []).some((q) => q.name === name && q.vehicle), A.username, { timeout: 60000 }).catch(() => {});
const first = await B.page.evaluate((name) => { const q = (window.__nlw.view.players || []).find((o) => o.name === name); return q ? { vehicle: q.vehicle, x: q.x, z: q.z } : null; }, A.username);
check('the watcher is told the driver is at the wheel of a keke, with its plate and paint', first && first.vehicle && first.vehicle.kind === 'keke' && first.vehicle.plate === hired.plate && first.vehicle.look.paint === hired.look.paint && first.vehicle.fleet, first);
// (if not: how often each page has asked the website who is about, and how long since it last had an answer)
if (!(first && first.vehicle)) console.log('     what each page\'s link says:', JSON.stringify({ driver: await A.page.evaluate(() => window.__nlw.link), watcher: await B.page.evaluate(() => window.__nlw.link) }));
await B.page.waitForTimeout(1500);
const drawn = await B.page.evaluate(({ name, id }) => {
  const n = window.__nlw, q = n.shownPeers.find((o) => o.name === name);
  const e = q && n.peerKekes.get(`d:${q.id}`);
  const bay = n.vehicleActors.get(id);
  const rig = q && n.crowd.rigOf(`p:${q.id}`);
  return { drawn: !!e, at: e && [e.actor.group.position.x, e.actor.group.position.z], bayShown: bay ? bay.group.visible : null, claimed: n.claimedFleet.has(id), plate: e && e.actor.model.look && e.actor.model.look.paint, seated: rig ? +(rig.group.position.y - window.__nlw.ground(rig.group.position.x, rig.group.position.z)).toFixed(2) : null };
}, { name: A.username, id: hired.id });
check('the watcher sees the keke itself, with the driver in its seat, and its copy in the bay is not also shown', drawn.drawn && drawn.bayShown === false && drawn.claimed, drawn);
await B.page.evaluate(({ x, z }) => { const n = window.__nlw; n.cam.yaw = Math.atan2(x - n.view.self.x, z - n.view.self.z) + Math.PI; n.cam.dist = 6; n.cam.pitch = 0.2; }, hired);
await B.page.waitForTimeout(600);
await B.shot('01-watcher-sees-keke');

// ---- A drives off along the road: where B shows it, against where it really is ----
await A.page.keyboard.down('w');
const samples = [];
let lastShown = null, biggestStep = -Infinity;
for (let i = 0; i < 26; i += 1) {
  await A.page.waitForTimeout(250);
  const [truth, shown] = await Promise.all([
    A.page.evaluate(() => { const n = window.__nlw; return { x: n.predicted ? n.predicted.x : n.view.self.x, z: n.predicted ? n.predicted.z : n.view.self.z, t: Date.now() }; }),
    B.page.evaluate((name) => { const n = window.__nlw, q = n.shownPeers.find((o) => o.name === name); const e = q && n.peerKekes.get(`d:${q.id}`); return e ? { x: e.actor.group.position.x, z: e.actor.group.position.z, t: Date.now(), speed: Math.hypot(...(q.vel || [0, 0])) } : null; }, A.username),
  ]);
  if (!shown) continue;
  samples.push({ err: Math.hypot(truth.x - shown.x, truth.z - shown.z), speed: shown.speed, truth, shown });
  // (a jump: further from one reading to the next than its speed would take it, with room for a slow frame)
  if (lastShown) biggestStep = Math.max(biggestStep, Math.hypot(shown.x - lastShown.x, shown.z - lastShown.z) - (2 + 1.6 * Math.max(16, shown.speed, lastShown.speed) * (shown.t - lastShown.t) / 1000));
  lastShown = shown;
}
await A.page.keyboard.up('w');
// (this machine's two browsers each draw a frame a second or so, and the driver's game runs slower than the wall
// clock, so how near the watcher keeps to it while it moves is measured in test/vehicle-sync.test.mjs, over a
// simulated network; here: that the watcher's keke goes where it goes, without jumping, and ends where it stops)
const travelled = samples.length > 1 ? Math.hypot(samples[samples.length - 1].shown.x - samples[0].shown.x, samples[samples.length - 1].shown.z - samples[0].shown.z) : 0;
await A.page.waitForTimeout(7000);
const [endTruth, endShown] = await Promise.all([
  A.page.evaluate(() => ({ x: window.__nlw.predicted.x, z: window.__nlw.predicted.z })),
  B.page.evaluate((name) => { const n = window.__nlw, q = n.shownPeers.find((o) => o.name === name); const e = q && n.peerKekes.get(`d:${q.id}`); return e ? { x: e.actor.group.position.x, z: e.actor.group.position.z } : null; }, A.username),
]);
const endErr = endShown ? Math.hypot(endTruth.x - endShown.x, endTruth.z - endShown.z) : null;
check('the watcher\'s keke follows the driver\'s along the road, never jumping, and stops where it really stopped', travelled > 8 && biggestStep <= 0 && endErr !== null && endErr < 2.5, { travelled: +travelled.toFixed(1), biggestStep: +biggestStep.toFixed(2), endErr: endErr && +endErr.toFixed(2) });
await B.page.evaluate((name) => { const n = window.__nlw, q = n.shownPeers.find((o) => o.name === name); if (q) { n.cam.yaw = Math.atan2(q.x - n.view.self.x, q.z - n.view.self.z) + Math.PI; n.cam.dist = 7; } }, A.username);
await B.page.waitForTimeout(600);
await B.shot('02-watcher-sees-it-driven');

// ---- A gets out: the keke stands where it was left; A walks off: it goes with them ----
await A.page.waitForTimeout(1500);
const left = await A.page.evaluate(() => { const n = window.__nlw; const r = n.server.send({ type: 'vehicle.exit' }); const v = n.view.vehicles.find((x) => x.yours); return { ok: r.ok, x: v && v.x, z: v && v.z }; });
await B.page.waitForFunction((name) => { const q = (window.__nlw.view.players || []).find((o) => o.name === name); return q && !q.vehicle && q.kekes && q.kekes.length; }, A.username, { timeout: 30000 }).catch(() => {});
await B.page.waitForTimeout(800);
const standing = await B.page.evaluate(({ name, id }) => { const n = window.__nlw, q = n.shownPeers.find((o) => o.name === name); const e = q && n.peerKekes.get(`p:${q.id}:${id}`); const driven = q && n.peerKekes.get(`d:${q.id}`); return { standing: !!e, at: e && [e.actor.group.position.x, e.actor.group.position.z], driven: !!driven, bayShown: n.vehicleActors.get(id) ? n.vehicleActors.get(id).group.visible : null }; }, { name: A.username, id: hired.id });
check('out of it, the keke is seen standing where the driver left it (and not in its bay)', left.ok && standing.standing && !standing.driven && Math.hypot(standing.at[0] - left.x, standing.at[1] - left.z) < 0.5 && standing.bayShown === false, { left, standing });

// ---- okadas: someone riding one, and someone on the back of one (a visitor's word, as the link hands it on) ----
const okada = await B.page.evaluate(() => {
  const n = window.__nlw, me = n.view.self;
  const seen = n.host.game.visitors.seen;
  seen('okada-rider', { name: 'Okada_Rider', x: me.x + 4, z: me.z + 3, heading: 1, look: {}, vehicle: { kind: 'okada' }, vel: [0, 0] });
  const driver = (n.view.okadas.find((o) => typeof o.person === 'number') || {}).person;
  seen('okada-back', { name: 'Back_Seat', x: me.x - 4, z: me.z + 3, heading: 2, look: {}, vehicle: { kind: 'okada', back: true, driver }, vel: [0, 0] });
  return { driver };
});
await B.page.waitForTimeout(1500);
const onOkadas = await B.page.evaluate(() => {
  const n = window.__nlw;
  const keep = () => { n.host.game.visitors.seen('okada-rider', { name: 'Okada_Rider', x: n.view.self.x + 4, z: n.view.self.z + 3, heading: 1, look: {}, vehicle: { kind: 'okada' } }); };
  keep();
  const rider = n.shownPeers.find((q) => q.name === 'Okada_Rider'), back = n.shownPeers.find((q) => q.name === 'Back_Seat');
  const rigR = rider && n.crowd.rigOf(`p:${rider.id}`), rigB = back && n.crowd.rigOf(`p:${back.id}`);
  return { rider: !!rider && rider.vehicle && rider.vehicle.kind, back: !!back && back.vehicle && back.vehicle.back, okadasDrawn: n.crowd.peerOkadas ? n.crowd.peerOkadas() : null, riderSeated: rigR ? rigR.group.position.y < n.ground(rigR.group.position.x, rigR.group.position.z) : null, backSeated: rigB ? rigB.group.position.y < n.ground(rigB.group.position.x, rigB.group.position.z) + 0.01 : null };
});
check('someone on an okada and someone on the back of one are seen on their machines, seated', onOkadas.rider === 'okada' && onOkadas.back === true && onOkadas.okadasDrawn === 2 && onOkadas.riderSeated, { okada, onOkadas });
await B.page.evaluate(() => { const n = window.__nlw; n.cam.yaw = Math.PI; n.cam.dist = 7; n.cam.pitch = 0.25; });
await B.page.waitForTimeout(600);
await B.shot('03-okadas');

// ---- other players on their own motorcycles and in their own cars, with their phones (each as its link hands it on) ----
// (kept told of every half second, as a link does; a motorcycle's bars turned, a phone held up)
await B.page.evaluate(() => {
  const n = window.__nlw, me = n.view.self;
  const at = { x: me.x, z: me.z };
  const peers = [
    ['bike-phone', { name: 'Bike_Phone', look: { figure: 'W1' }, x: at.x + 5, z: at.z + 4, heading: 0.5, ride: { bike: 'red-superbike', lean: 0, speed: 0, throttle: 0, brake: 0, rev: 0, steer: 0.45 }, phone: 1 }],
    ['open-car', { name: 'Open_Car', look: { figure: 'M1' }, x: at.x - 7, z: at.z + 6, heading: 2.2, car: { car: 'white-roadster', steer: 0.3, speed: 0, throttle: 0, brake: 0, rev: 0, lamps: 0 }, phone: 1 }],
    ['closed-car', { name: 'Closed_Car', look: { figure: 'W1' }, x: at.x + 9, z: at.z - 7, heading: -1, car: { car: 'grey-saloon', steer: 0, speed: 0, throttle: 0, brake: 0, rev: 0, lamps: 0 } }],
    // more motorcycles than are drawn as models: the furthest stand in as their pictures
    ...['streetfighter', 'chopper', 'cafe-racer', 'gold-tourer'].map((bike, k) => [`bike-${k}`, { name: `Bike_${k}`, x: at.x - 14 - k * 4, z: at.z - 12 - k * 3, heading: 0.3 * k, ride: { bike, lean: 0, speed: 0, throttle: 0, brake: 0, rev: 0, steer: 0 } }]),
  ];
  // (each with one of the game's own figures, as every player now has: a figure the phone can be held by)
  const tell = () => { for (const [id, d] of peers) n.host.game.visitors.seen(id, { look: {}, vel: [0, 0], ...d }); };
  tell();
  window.__keepPeers = setInterval(tell, 500);
});
await B.page.waitForFunction(() => {
  const n = window.__nlw; const id = (name) => (n.shownPeers.find((q) => q.name === name) || {}).id;
  // (and their own figures come, with the bones that hold the bars, the wheel and the phone)
  const ready = (name) => { const r = n.crowd.rigOf(`p:${id(name)}`); return !!(r && r.animated && r.bones && typeof r.bones.get === 'function'); };
  return n.peerBikeView.ridden(`peer:${id('Bike_Phone')}`) && n.carView.driven(`peer:${id('Open_Car')}`) && n.carView.driven(`peer:${id('Closed_Car')}`) && ready('Bike_Phone') && ready('Open_Car');
}, null, { timeout: 300000 }).catch(() => {});
{
  // (if not all came: which did not)
  const came = await B.page.evaluate(() => {
    const n = window.__nlw; const id = (name) => (n.shownPeers.find((q) => q.name === name) || {}).id;
    const ready = (name) => { const r = n.crowd.rigOf(`p:${id(name)}`); return !!(r && r.animated && r.bones && typeof r.bones.get === 'function'); };
    return { bike: !!n.peerBikeView.ridden(`peer:${id('Bike_Phone')}`), openCar: !!n.carView.driven(`peer:${id('Open_Car')}`), closedCar: !!n.carView.driven(`peer:${id('Closed_Car')}`), figureW1: ready('Bike_Phone'), figureM1: ready('Open_Car') };
  });
  if (!Object.values(came).every(Boolean)) console.log('     after five minutes, what had come:', JSON.stringify(came));
}
await B.page.waitForTimeout(2500);
const peerVehicles = await B.page.evaluate(() => {
  const n = window.__nlw, P = (name) => n.shownPeers.find((q) => q.name === name);
  const pos = (rig, bone) => { const b = rig && rig.bones && typeof rig.bones.get === 'function' && rig.bones.get(bone); return b ? b.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(1e6, 1e6, 1e6); };
  const out = {};
  // the motorcycle: its bars turned as theirs are, them in its saddle, the phone in their left hand
  const bp = P('Bike_Phone'), bike = bp && n.peerBikeView.ridden(`peer:${bp.id}`), rigB = bp && n.crowd.rigOf(`p:${bp.id}`);
  const phoneB = bp && n.peerPhones.get(bp.id);
  out.bike = bike ? { steer: +bike.steerAngle.toFixed(2), seat: +pos(rigB, 'pelvis').distanceTo(bike.group.localToWorld(bike.seat.clone())).toFixed(2), rightGrip: +pos(rigB, 'hand_r').distanceTo(bike.gripWorld(1)).toFixed(2), visible: rigB.group.visible } : null;
  out.bikePhone = phoneB ? { out: +phoneB.hold.out.toFixed(2), side: phoneB.hold.side, shown: phoneB.hold.prop.visible, toLeft: +phoneB.hold.prop.getWorldPosition(new THREE.Vector3()).distanceTo(pos(rigB, 'middle_01_l')).toFixed(2) } : null;
  // the open car: drawn, them at its wheel, seen; the phone in their right hand
  const oc = P('Open_Car'), car = oc && n.carView.driven(`peer:${oc.id}`), rigC = oc && n.crowd.rigOf(`p:${oc.id}`);
  const phoneC = oc && n.peerPhones.get(oc.id);
  out.openCar = car ? { visible: rigC.group.visible, hips: +pos(rigC, 'pelvis').distanceTo(car.cabin.localToWorld(new THREE.Vector3(...car.driver.hip))).toFixed(2) } : null;
  out.carPhone = phoneC ? { out: +phoneC.hold.out.toFixed(2), side: phoneC.hold.side, toRight: +phoneC.hold.prop.getWorldPosition(new THREE.Vector3()).distanceTo(pos(rigC, 'middle_01_r')).toFixed(2) } : null;
  // the closed car: drawn, with no one seen in it
  const cc = P('Closed_Car'), closed = cc && n.carView.driven(`peer:${cc.id}`), rigX = cc && n.crowd.rigOf(`p:${cc.id}`);
  out.closedCar = { drawn: !!closed, driverSeen: rigX ? rigX.group.visible : null };
  // the motorcycles beyond the nearest few: their pictures, with their riders on them
  const models = n.peerBikeView.keys().filter((k) => k.startsWith('peer:')).length;
  const pictures = n.standins.shown().filter((e) => e.kind === 'bike');
  const riders = n.shownPeers.filter((q) => /^Bike_\d$/.test(q.name)).map((q) => { const r = n.crowd.rigOf(`p:${q.id}`); return r ? { name: q.name, visible: r.group.visible, model: !!n.peerBikeView.ridden(`peer:${q.id}`), picture: pictures.some((e) => e.key === `b:${q.id}`), sits: +(r.group.position.y - n.ground(r.group.position.x, r.group.position.z)).toFixed(2) } : null; });
  out.many = { models, pictures: pictures.length, drawn: pictures.filter((e) => e.drawn).length, riders };
  return out;
});
check('another player on their motorcycle: its bars turned as theirs are, them in its saddle (as far forward as its bars ask) with a hand on the right grip', !!peerVehicles.bike && Math.abs(peerVehicles.bike.steer - 0.45) < 0.01 && peerVehicles.bike.seat < 0.45 && peerVehicles.bike.rightGrip < 0.1 && peerVehicles.bike.visible, peerVehicles.bike);
check('and their phone out: held in their left hand, off the grip', !!peerVehicles.bikePhone && peerVehicles.bikePhone.out > 0.97 && peerVehicles.bikePhone.side === 'l' && peerVehicles.bikePhone.shown && peerVehicles.bikePhone.toLeft < 0.12, peerVehicles.bikePhone);
check('another player in their open car: the car drawn, them seen at its wheel, the phone in their right hand', !!peerVehicles.openCar && peerVehicles.openCar.visible && peerVehicles.openCar.hips < 0.15 && !!peerVehicles.carPhone && peerVehicles.carPhone.out > 0.97 && peerVehicles.carPhone.side === 'r' && peerVehicles.carPhone.toRight < 0.12, { car: peerVehicles.openCar, phone: peerVehicles.carPhone });
check('another in a closed car: the car drawn, no one floating beside it or showing through it', peerVehicles.closedCar.drawn && peerVehicles.closedCar.driverSeen === false, peerVehicles.closedCar);
check('with more motorcycles about than are drawn as models, the rest are their pictures, each with its rider on it: no one rides nothing',
  peerVehicles.many.models <= 4 && peerVehicles.many.pictures >= 1 && peerVehicles.many.riders.every((r) => r && r.visible && (r.model || r.picture)) && peerVehicles.many.drawn === peerVehicles.many.pictures, peerVehicles.many);
await B.page.evaluate(() => { const n = window.__nlw, q = n.shownPeers.find((o) => o.name === 'Bike_Phone'); n.cam.yaw = Math.atan2(q.x - n.view.self.x, q.z - n.view.self.z) + Math.PI; n.cam.dist = 6; n.cam.pitch = 0.22; });
await B.page.waitForTimeout(1200);
await B.shot('04-other-player-on-a-motorcycle-with-the-phone');
await B.page.evaluate(() => { const n = window.__nlw, q = n.shownPeers.find((o) => o.name === 'Open_Car'); n.cam.yaw = Math.atan2(q.x - n.view.self.x, q.z - n.view.self.z) + Math.PI; n.cam.dist = 8; n.cam.pitch = 0.3; });
await B.page.waitForTimeout(1200);
await B.shot('05-other-player-at-the-wheel-with-the-phone');
await B.page.evaluate(() => { const n = window.__nlw; n.cam.yaw = Math.PI * 1.25; n.cam.dist = 22; n.cam.pitch = 0.35; });
await B.page.waitForTimeout(1500);
await B.shot('06-the-motorcycles-beyond-the-nearest-four');
await B.page.evaluate(() => { clearInterval(window.__keepPeers); });

// ---- A walks off out of sight: their keke goes with them ----
await A.page.evaluate(() => { const n = window.__nlw; n.place(n.view.self.x - 120, n.view.self.z); });
// (the website is asked about who is where at most every few seconds; on the slow network, with the watcher's page
// still fetching the vehicles it has just been shown, an answer can take a while)
await B.page.waitForFunction((name) => { const q = (window.__nlw.view.players || []).find((o) => o.name === name); return !q || !(q.kekes || []).length; }, A.username, { timeout: 120000 }).catch(() => {});
await B.page.waitForTimeout(800);
const gone = await B.page.evaluate((id) => ({ kekes: window.__nlw.peerKekes.size, bayShown: window.__nlw.vehicleActors.get(id) ? window.__nlw.vehicleActors.get(id).group.visible : null }), hired.id);
check('when the driver has gone off, nothing of theirs is left drawn, and the hire fleet\'s keke is in its bay again', gone.kekes === 0, gone);

{ const lost = (await lostPictures(A.page)) + (await lostPictures(B.page)); check('no picture was handed to the graphics card after the page had let it go of it (no vehicle or building drawn black)', lost === 0, lost); }
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nAll ${results.length} checks passed.`);
await browser.close(); server.close();
await require('../../api/_lib/db.js').closeDatabase().catch(() => {});
process.exit(failed ? 1 : 0);
