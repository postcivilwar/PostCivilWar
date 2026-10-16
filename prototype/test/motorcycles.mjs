// The owner's twelve motorcycles in a headless browser, on the website as it is served with its server:
//   - the showroom lists all twelve at their prices, each with its photographs and a Play/Stop sound that is heard
//     and stops when the page is left;
//   - a new player buys one with arrival money, at the showroom, and it is in Property;
//   - Ride it: the bike is drawn under the player (the owner's model), the rider sits on its seat with hands on
//     its grips and feet on its pegs; the throttle takes it away, the wheels turn, it leans when steered, the
//     engine follows the throttle; getting off leaves it standing; it is still theirs after the page is reloaded;
//   - then every one of the twelve is ridden in turn (the town is told they are owned, as the server would tell
//     it) and measured the same way, with a picture of each.
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
check('the showroom lists the twelve motorcycles', Array.isArray(listed) && listed.length === 12, Array.isArray(listed) ? listed.map((l) => `${l.name} ${l.price / TR}`) : listed);
const cheapest = listed.find((l) => l.model === 'bike:streetfighter');
check('the cheapest is 1,000 TR, the dearest 10,000 TR', cheapest.price === 1000 * TR && Math.max(...listed.map((l) => l.price)) === 10000 * TR, null);
// its page: photographs, Play sound heard, Stop sound, and quiet when the page is left
await page.evaluate((id) => window.__nlw.ui.openPhone('property', { market: true, asset: id }), cheapest.id);
await page.waitForSelector('#bike-sound', { timeout: 30000 });
await page.waitForTimeout(800);
await shot('01-listing');
const terms = await page.evaluate(() => document.querySelector('#bike-terms') && document.querySelector('#bike-terms').textContent);
check('its page says arrival money may pay for it', /arrival money included/.test(terms || ''), terms);
await page.click('#bike-sound');
await page.waitForTimeout(1500);
const heard = await page.evaluate(() => { const a = window.__nlw.audio; const s = a.status(); return { previewing: a.previewing(), state: s.state, label: document.querySelector('#bike-sound').textContent }; });
check('Play sound starts that motorcycle\'s engine', heard.previewing && heard.label === 'Stop sound', heard);
await page.click('#bike-sound');
check('Stop sound stops it', !(await page.evaluate(() => window.__nlw.audio.previewing())), null);
await page.click('#bike-sound');
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
// (out on the open road west of the town, where nobody walks, to ride)
await page.evaluate(() => { const n = window.__nlw; n.place(-300, -40); n.face(-Math.PI / 2); });
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
await page.keyboard.down('d'); await page.waitForTimeout(900);
m = await measure();
check('steered at speed, it leans into the turn, and the rider stays on it', m.lean > 0.1 && seated(m), m);
await page.evaluate(() => { const n = window.__nlw; n.cam.yaw = n.me.group.rotation.y + Math.PI; n.cam.dist = 4.5; n.cam.pitch = 0.12; });
await page.waitForTimeout(200);
await shot('04-leaning');
await page.keyboard.up('d'); await page.keyboard.up('w');
await page.keyboard.down('s'); await page.waitForTimeout(1800);
m = await measure();
await page.keyboard.up('s');
check('the brake stops it (held on, it is then walked back)', m.speed < 0.5 && m.speed > -1.3, m);
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

// ---- every one of the twelve ----
const all = only.length ? only : listed.map((l) => l.model.slice(5));
await page.evaluate((ids) => window.__nlw.server.send({ type: 'bikes.owned', bikes: ids }), all);
for (const id of all) {
  await page.evaluate(() => { const n = window.__nlw; if (n.view.self.astride) n.server.send({ type: 'moto.leave' }); n.place(-300, -40); n.face(-Math.PI / 2); });
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
  check(`${id}: rides, wheels turning, its own engine running`, m.speed > 2 && m.spin > 0.3 && m.engine && m.engine.running && m.engine.id === id, { speed: m.speed, spin: m.spin, engine: m.engine });
  await page.keyboard.up('w'); await page.keyboard.down('s'); await page.waitForTimeout(1800); await page.keyboard.up('s');
}
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nAll ${results.length} checks passed.`);
await browser.close(); server.close();
await require('../../api/_lib/db.js').closeDatabase().catch(() => {});
process.exit(failed ? 1 : 0);
