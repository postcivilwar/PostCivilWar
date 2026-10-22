// PostCivilWar PowerBike in a headless browser, on the website as it is served with its server and a database:
//   - the owner's skyscraper beside HOLARIS Watch, a reasonable way off it, its old owner's name covered by the
//     showroom's own band, badge and crown; one pink column before its doors and none for the motorcycles at
//     HOLARIS (whose own column is still there);
//   - walked into the column: the screen goes dark and comes back inside, at the doors; the building is not drawn
//     round the hall, the hall is; the camera stays inside it;
//   - the seventeen motorcycles: on a computer every one of them the owner's model, with the pictures its distance asks
//     for (the one the player stands at the largest, the far end of the hall the smallest: hall-models.js), every one
//     where it stands, with room to walk all round; walked across the hall, the sets follow the player;
//   - the salesman comes to the player and stands with them at a motorcycle (while the showroom's staff are drawn,
//     ZONE_CAST; since 22 October 2026 nobody stands on the floor until the owner's own figures come, and that is
//     what is checked);
//   - asked about the motorcycle: the phone's conversation opens on it (its card, its engine and speed, its price);
//     with the salesman there, the player turns to him, and what each says moves their hands and heads, one after the
//     other; with nobody there, the conversation is on the phone, held up;
//   - a question tapped, a question typed, each answered; the motorcycle bought from the conversation;
//   - on a phone's screen the conversation fits, with everything a finger's size;
//   - a second player (a second copy of the town in the page) in the hall: asked about a bike first, the salesman
//     is theirs; three or more, he walks the floor (with the salesman there);
//   - out by the mat at the doors: back outside, beside the column; gone well away, every motorcycle's model let go;
//   - nothing goes wrong in the page.
//   ../server/with-postgres.sh node test/showroom.mjs [shots folder]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDevServer } from '../../server/dev.mjs';
import { pastQuestion, enterTown, watchPictures, lostPictures } from './start.mjs';
import { POWERBIKE } from '../src/sim/zones/atani-powerbike.js';
import { ZONE_CAST } from '../src/sim/zones/atani.js';
// is the salesman drawn on the showroom's floor (ZONE_CAST)
const STAFF = ZONE_CAST.showroomStaff;
import { HALL } from '../src/client/budget.js';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const out = process.argv[2] || '/tmp/showroom-shots';
mkdirSync(out, { recursive: true });
const server = createDevServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); };

const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
await watchPictures(context);
const page = await context.newPage(); page.setDefaultTimeout(240000);
page.on('pageerror', (e) => check('no error in the page', false, e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 4\d\d/.test(m.text())) check('no error in the console', false, m.text()); });
const shot = (name) => page.screenshot({ path: resolve(out, `${name}.png`) });
const username = `Show_${Math.random().toString(36).slice(2, 8)}`;
const password = 'a password for the showroom test';

await page.goto(`${origin}/#nointro-gameclock`, { timeout: 300000 });
await page.waitForFunction(() => !!(window.__nlw && window.__nlw.intro), null, { timeout: 300000 });
await page.waitForSelector('#open-signup', { state: 'visible', timeout: 300000 });
await page.click('#open-signup');
await page.fill('#account-username', username); await page.fill('#account-password', password);
await page.click('#account-submit');
await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 120000 });
await pastQuestion(page);
await page.fill('#name', 'Showroom Test');
await enterTown(page);
await page.waitForFunction(() => window.__nlw.me && window.__nlw.me.mixer, null, { timeout: 240000 });
// (the day's light, for the pictures)
await page.evaluate(() => { const n = window.__nlw; const hour = n.view.clock.hourFloat; if (hour < 9 || hour > 16) n.skip((24 + 11 - hour) % 24); });

const P = { portal: { x: -63.6, z: 59.6 } };
const go = async (x, z, h, cam) => {
  await page.evaluate(([x, z, h, cam]) => { const n = window.__nlw; n.place(x, z); n.face(h); if (cam) { n.cam.yaw = cam.yaw; n.cam.pitch = cam.pitch; n.cam.dist = cam.dist; n.rig.snap(n.cam); } }, [x, z, h, cam || null]);
};

// ---- outside: the tower, beside HOLARIS ----
await go(-48, 92, Math.PI, { yaw: Math.PI - 0.32, pitch: 0.2, dist: 30 });
await page.waitForFunction(() => window.__nlw.powerbike.tower || window.__nlw.powerbike.failed, null, { timeout: 300000 });
const tower = await page.evaluate(() => { const p = window.__nlw.powerbike; return { loaded: !!p.tower, failed: p.failed, triangles: p.tower && p.tower.triangles, signs: p.signs.map((s) => s.name), visible: p.exterior.visible }; });
check('the owner\'s skyscraper is drawn from the supplied file, whole (every one of its 7,985 triangles)', tower.loaded && !tower.failed && tower.triangles === 7985 && tower.visible, tower);
check('its old owner\'s name and badge are covered by the showroom\'s own: the band, the badge, and the name standing on its top', ['powerbike-band', 'powerbike-badge', 'powerbike-crown', 'powerbike-crown'].every((n, i) => tower.signs[i] === n), tower.signs);
await page.waitForTimeout(2500);
await shot('01-beside-holaris');
await go(-40, 150, Math.PI, { yaw: Math.PI - 0.2, pitch: 0.28, dist: 60 });
await page.waitForTimeout(2500);
await shot('02-the-tower-and-its-crown');

// ---- the columns: one for the showroom, none for its motorcycles at HOLARIS, HOLARIS's own kept ----
await page.evaluate(() => window.__nlw.refreshDealMarkers());
await page.waitForFunction(() => window.__nlw.market.state.all.length >= 18, null, { timeout: 60000 }).catch(() => {});
const columns = await page.evaluate(() => {
  const n = window.__nlw;
  const named = []; n.scene.traverse((o) => { if (o.name === 'powerbike-portal') named.push(o); });
  const marks = [...n.dealMarkers.values()];
  const motors = n.market.state.all.filter((l) => l.shop === 'motors');
  return { showroom: named.length, motorsMarkers: marks.filter((m) => m.listing.shop === 'motors').length, holaris: marks.filter((m) => m.listing.shop === 'holaris').length, listed: motors.length, places: motors.map((l) => [l.place.x, l.place.z]) };
});
check('exactly one pink column for the showroom; none for its motorcycles; HOLARIS keeps its own', columns.showroom === 1 && columns.motorsMarkers === 0 && columns.holaris === 1 && columns.listed === 17, columns);
check('each motorcycle is sold where it stands in the hall', columns.places.every(([x, z]) => x > -78.6 && x < -45.4 && z > 27.6 && z < 53.9), columns.places);
await go(-60.6, 70, Math.PI, { yaw: Math.PI + 0.25, pitch: 0.16, dist: 9 });
await page.waitForTimeout(1800);
await shot('03-the-column-before-the-doors');

// ---- in, by the column ----
await go(P.portal.x, P.portal.z + 3.2, Math.PI, { yaw: Math.PI, pitch: 0.2, dist: 7 });
await page.waitForTimeout(600);
await page.keyboard.down('w');
let faded = false;
for (let i = 0; i < 300 && !faded; i += 1) { await page.waitForTimeout(100); faded = await page.evaluate(() => document.getElementById('fade').classList.contains('on') || window.__nlw.showroom.inside); }
await page.keyboard.up('w');
check('stepping into the column darkens the screen', faded, null);
await page.waitForFunction(() => window.__nlw.showroom.inside && !document.getElementById('fade').classList.contains('on'), null, { timeout: 30000 });
const inside = await page.evaluate(() => { const n = window.__nlw, p = n.powerbike; return { at: [+n.predicted.x.toFixed(2), +n.predicted.z.toFixed(2)], sim: [n.view.self.x, n.view.self.z], hall: !!p.hall && p.hall.group.visible, exterior: p.exterior.visible, portal: p.portal.group.visible }; });
check('and it comes back inside, at the doors, where the simulation put the player', inside.at[0] === -63.6 && inside.at[1] === 51.6 && inside.sim[0] === -63.6 && inside.sim[1] === 51.6, inside);
check('inside, the hall is drawn and the building round it is not', inside.hall && !inside.exterior && !inside.portal, inside);
await page.waitForTimeout(2500);
await shot('04-inside-the-doors');

// ---- the floor: the motorcycles ----
// The set of pictures each bike should be drawn with, the player at (x, z): as hall-models.js chooses them (budget.js,
// HALL), the largest given up first on a device that is struggling (`level`), worked out here on its own.
const ORDER = ['512', '1k', '2k', '4k'], CAP = ['4k', '2k', '1k', '512'];
const hallTiers = (at, { lite, level }, ranges = { inspect: 2.5, near: 7, mid: 14 }, shrink = 1) => {
  const plan = HALL[lite ? 'lite' : 'full'];
  const gaps = POWERBIKE.displays.map((d) => Math.max(0, Math.hypot(d.x - at.x, d.z - at.z) - d.r));
  const tiers = [];
  gaps.map((gap, k) => [gap, k]).sort((a, b) => a[0] - b[0]).forEach(([full, k], rank) => {
    const gap = full / shrink;
    let t = rank === 0 && gap < ranges.inspect ? plan.inspect : rank < plan.nearRanks && gap < ranges.near ? plan.near : gap < ranges.mid ? plan.mid : plan.far;
    const cap = CAP[Math.max(0, Math.min(3, level))];
    if (t && ORDER.indexOf(t) > ORDER.indexOf(cap)) t = cap;
    tiers[k] = t;
  });
  return tiers;
};
// (waits until the bikes are drawn with the sets the player's place asks for; gives what is drawn, and what was asked)
const settled = async (at, limit = 600000) => {
  const t0 = Date.now();
  let got = null;
  while (Date.now() - t0 < limit) {
    got = await page.evaluate(() => { const n = window.__nlw; return { shown: n.powerbike.shown(), state: n.powerbike.models(), level: n.quality, lite: !!n.lite, sun: n.sunShadows }; });
    // (each with what its distance asks for, or a set it already had that it keeps while it is within a quarter of
    // that set's distance again: hall-models.js gives a vehicle a smaller set only once it is clearly further off, so
    // that nothing flickers between two sets at the edge of one)
    const want = hallTiers(at, got), keep = hallTiers(at, got, undefined, 1.25);
    const rankOf = (t) => (t ? ORDER.indexOf(t) : -1);         // (no set at all: its picture, on a phone)
    const between = (t, lo, hi) => rankOf(t) >= rankOf(lo) && rankOf(t) <= rankOf(hi);
    if (got.shown.every((d, k) => between(d.tier, want[k], keep[k]) && (d.model ? !d.picture : d.picture))) return { ...got, want, keep, ok: true };
    await page.waitForTimeout(1000);
  }
  return { ...got, want: got && hallTiers(at, got), ok: false };
};
const FLOOR = { x: -61.2, z: 46.0 };
await go(FLOOR.x, FLOOR.z, Math.PI * 0.75, { yaw: Math.PI * 0.8, pitch: 0.2, dist: 6.5 });
const floor = await settled(FLOOR);
const models = floor.shown.filter((d) => d.model), pictures = floor.shown.filter((d) => d.picture);
check('every motorcycle is the owner\'s model, drawn with the pictures its distance from the player asks for (the one the player stands at the largest); each is drawn once, as its model or (on a phone, across the hall) as a picture of it',
  floor.ok && models.length + pictures.length === 17 && floor.shown.every((d) => d.model !== d.picture) && (floor.lite || models.length === 17),
  { ok: floor.ok, level: floor.level, lite: floor.lite, drawn: floor.shown.map((d) => `${d.bike}:${d.model ? d.tier : 'picture'}`), asked: floor.want, state: floor.state });
// the sun's shadow: cast by the bikes near the player (within 7 m of a stand, kept to 8.5 m; a little either side of
// those is not judged, the player's own place being a few centimetres from where it was put), every other with the
// soft shadow under it that a picture has (the sun's shadow is drawn from the whole hall at once, every model whole)
// (with the sun's shadows given up, on a device that is struggling, none casts and every one has the soft shadow)
const shadowsOk = (at, shown, sun) => shown.every((d, k) => { const p = POWERBIKE.displays[k]; const gap = Math.max(0, Math.hypot(p.x - at.x, p.z - at.z) - p.r); return d.soft === !d.casts && (!d.model || !sun ? !d.casts : gap < 6.8 ? d.casts : gap > 8.7 ? !d.casts : true); });
check('only the motorcycles near the player cast the sun\'s shadow; the others have a soft shadow under them', shadowsOk(FLOOR, floor.shown, floor.sun) && (!floor.sun || floor.shown.some((d) => d.casts)), { sun: floor.sun, shadows: floor.shown.map((d) => `${d.bike}:${d.casts ? 'casts' : d.soft ? 'soft' : 'none'}`) });
const camInside = await page.evaluate(() => { const c = window.__nlw.camera.position; return [c.x, c.y, c.z]; });
check('the camera is inside the hall', camInside[0] > -78.6 && camInside[0] < -45.4 && camInside[2] > 27.6 && camInside[2] < 53.9 && camInside[1] < 6.6, camInside);
await shot('05-the-floor');
const ACROSS = { x: -52, z: 46.0 };
await go(ACROSS.x, ACROSS.z, -Math.PI / 2, { yaw: -Math.PI / 2 - 0.1, pitch: 0.22, dist: 7.4 });
const across = await settled(ACROSS);
check('walked across the hall, the sets follow the player: the bikes now near given the larger, those left behind the smaller, and nothing left without its model', across.ok && across.shown.every((d) => d.model !== d.picture) && (across.lite || across.shown.every((d) => d.model)),
  { ok: across.ok, level: across.level, drawn: across.shown.map((d) => `${d.bike}:${d.model ? d.tier : 'picture'}`), asked: across.want });
await shot('06-across-the-hall');

// ---- the salesman comes to the player at a motorcycle ----
const red = { x: -63.6, z: 48.4, r: 1.45, h: 0.3 };
const stand = { x: red.x + Math.sin(red.h + 0.9) * (red.r + 0.95), z: red.z + Math.cos(red.h + 0.9) * (red.r + 0.95) };
await go(stand.x, stand.z, Math.atan2(red.x - stand.x, red.z - stand.z), { yaw: Math.atan2(red.x - stand.x, red.z - stand.z) - 0.5, pitch: 0.16, dist: 6 });
if (STAFF) {
  await page.waitForFunction(() => { const n = window.__nlw, s = n.salesman.state; return s.with && Math.hypot(s.x - n.predicted.x, s.z - n.predicted.z) < 2.2 && s.speed < 0.2; }, null, { timeout: 60000 }).catch(() => {});
  const came = await page.evaluate(() => { const n = window.__nlw, s = n.salesman.state; return { mode: s.mode, with: s.with, d: +Math.hypot(s.x - n.predicted.x, s.z - n.predicted.z).toFixed(2), shown: n.salesmanActor.group.visible }; });
  check('the salesman comes over and stands with the player at the motorcycle they are looking at', came.shown && came.mode === 'assist' && came.d > 0.9 && came.d < 2.2, came);
  await page.waitForTimeout(1200);
  await shot('07-the-salesman-comes');
} else {
  const floorStaff = await page.evaluate(() => ({ salesman: !!window.__nlw.salesmanActor }));
  check('nobody stands on the showroom\'s floor to sell (the owner\'s own figure of the salesman is to come)', !floorStaff.salesman, floorStaff);
  await page.waitForTimeout(1200);
  await shot('07-at-the-red-superbike');
}

// ---- asking him about it: the conversation on the phone ----
const asking = await page.evaluate(() => { const p = window.__nlw.prompt(); return p ? { short: p.short, text: p.text } : null; });
check('at the motorcycle the player is offered to ask about it', asking && asking.short === 'Ask' && (STAFF ? /Obi about the Red Superbike/ : /^Ask about the Red Superbike$/).test(asking.text), asking);
await page.keyboard.press('e');
await page.waitForSelector('#deal-log .msg.shop', { timeout: 60000 });
await page.waitForTimeout(1500);
const opened = await page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  return {
    head: q('.chathead .who b').textContent, role: q('.chathead .who span').textContent, brand: q('.dealitem .brandline') && q('.dealitem .brandline').textContent,
    card: q('.dealitem.bike .what b').textContent, chips: [...document.querySelectorAll('.dealitem .spec')].map((c) => c.textContent), price: q('.dealitem .price').textContent,
    hello: [...document.querySelectorAll('#deal-log .msg.shop')].map((m) => m.textContent)[0] || '',
    quick: [...document.querySelectorAll('#deal-quick button')].map((b) => b.textContent),
    talk: window.__nlw.showroom.talk, phoneHeld: window.__nlw.phoneHold.out,
    expected: (() => { const l = window.__nlw.market.state.all.find((x) => x.asset && x.asset.model === 'bike:red-superbike'); return l ? `${(l.price / 2).toLocaleString('en-GB')} TR` : null; })(),
  };
});
check('the conversation opens with him: his name, the bike\'s card with its engine, top speed and price', opened.head === 'Obi' && /Salesman/.test(opened.role) && opened.brand === 'PostCivilWar PowerBike' && opened.card === 'Red Superbike' && opened.chips.includes('2,500 cc') && opened.chips.includes('212 km/h') && !!opened.expected && opened.price.includes(opened.expected), opened);
check('he greets the player about this bike, and says his answers are automatic', /Obi/.test(opened.hello) && /automatic/.test(opened.hello) && /Red Superbike/.test(opened.hello), opened.hello);
check('questions to tap are offered', opened.quick.length >= 5, opened.quick);
if (STAFF) check('talking face to face: the phone is not held up in the town', opened.talk && opened.talk.bike === 'red-superbike' && opened.phoneHeld < 0.2, { talk: opened.talk, raised: opened.phoneHeld });
else {
  // (the handset out of the pocket and held in front, as for anything on the phone: phone-hold.js `out`)
  const held = await page.waitForFunction(() => window.__nlw.phoneHold.out > 0.8, null, { timeout: 30000 }).then(() => true, () => false);
  const out = await page.evaluate(() => window.__nlw.phoneHold.out);
  check('with nobody on the floor the conversation is on the phone: the player holds it up', opened.talk && opened.talk.bike === 'red-superbike' && held, { talk: opened.talk, out });
}
if (STAFF) {
  // (looked for frame by frame, as long as it takes: without a graphics card a frame here can take seconds)
  await page.waitForFunction(() => {
    const n = window.__nlw, s = n.salesman.state, me = n.me;
    const gap = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return Math.abs(d); };
    return s.mode === 'talk' && s.speed < 0.2 && gap(Math.atan2(s.x - n.predicted.x, s.z - n.predicted.z), me.group.rotation.y) < 0.35 && gap(Math.atan2(n.predicted.x - s.x, n.predicted.z - s.z), s.heading) < 0.4;
  }, null, { timeout: 90000 }).catch(() => {});
  const facing = await page.evaluate(() => {
    const n = window.__nlw, s = n.salesman.state, me = n.me;
    const to = Math.atan2(s.x - n.predicted.x, s.z - n.predicted.z);
    let d = (to - me.group.rotation.y) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
    let e = (Math.atan2(n.predicted.x - s.x, n.predicted.z - s.z) - s.heading) % (Math.PI * 2); if (e > Math.PI) e -= Math.PI * 2; if (e < -Math.PI) e += Math.PI * 2;
    return { player: +Math.abs(d).toFixed(2), him: +Math.abs(e).toFixed(2), mode: s.mode, apart: +Math.hypot(s.x - n.predicted.x, s.z - n.predicted.z).toFixed(2) };
  });
  check('the player and the salesman face each other, a step apart', facing.player < 0.35 && facing.him < 0.4 && facing.mode === 'talk' && facing.apart > 0.9 && facing.apart < 2.3, facing);
  await shot('08-asking-about-the-red-superbike');
} else await shot('08-asking-about-the-red-superbike');

// what is said moves the hands: typed, the player speaks; answered, he does
const handHeight = () => page.evaluate(() => { const n = window.__nlw; const b = n.me.bones && n.me.bones.get('hand_r'); return { me: b ? b.getWorldPosition(new THREE.Vector3()).y - n.me.group.position.y : null }; });
// (the car showroom's towers, out on the Kwale road, are fetched once the town is ready by anyone within 900 m of
// them, as this hall is: each carries an 8192 picture, and without a graphics card taking one in holds the page up
// for seconds, long enough for a sentence to be said unseen. Their arrival is waited for, so that what is looked for
// here is the hands, not the pictures)
await page.waitForFunction(() => {
  const n = window.__nlw, c = n.carshowView, tb = n.townBuildings, sv = n.supplied;
  const towers = !c || c.buildings.filter((b) => b.id !== 'villa').every((b) => b.loaded || b.failed);
  // (and whatever of the owner's buildings and vehicles was being fetched before the player came in)
  const town = !tb || tb.state().models.every((m) => m.state !== 'loading');
  const vehicles = !sv || (sv.state().parked.every((p) => !p.loading) && !sv.state().ambulance.loading);
  return towers && town && vehicles;
}, null, { timeout: 600000 }).catch(() => {});
// (and the hall's own models at the sets this place asks for: the bike the player has come up to is given its largest
// pictures, and taking those in, without a graphics card, holds the frames up for seconds, as the towers' do)
await settled(stand);
await page.waitForTimeout(1500);
const quiet = STAFF ? await handHeight() : null;
if (STAFF) {
  // (every frame from here on is written down in the page: without a graphics card a frame can take seconds, and his
  // answer can be over before the test has finished looking at the player's question)
  await page.evaluate(() => {
    const n = window.__nlw, rec = window.__talkFrames = { frames: [], stop: false };
    const look = () => {
      if (rec.stop) return;
      const now = Date.now() / 1000;
      const hb = n.me.bones && n.me.bones.get('hand_r');
      rec.frames.push({ now, his: n.showroom.him.speaking, him: n.showroom.him.amount, player: n.showroom.amount, playerSpeaking: n.showroom.lines.some((l) => l.who === 'me' && now >= l.from && now <= l.to), hand: hb ? hb.getWorldPosition(new THREE.Vector3()).y - n.me.group.position.y : null });
      requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  });
}
const QUESTION = 'How fast does the Red Superbike go when you open it right up on a long straight road?';
// (put in whole, as a phone's keyboard suggestion would: without a graphics card each key pressed waits for a frame,
// and a frame in this hall, every motorcycle drawn as its model, takes seconds)
await page.fill('#deal-text', QUESTION);
await page.keyboard.press('Enter');
const pending = await page.evaluate(() => ({ pending: !!document.querySelector('#deal-log .msg.me.pending') || [...document.querySelectorAll('#deal-log .msg.me')].some((m) => /How fast/.test(m.textContent)) }));
let rose = false, speaking = null;
if (STAFF) {
  // while the words are said the player's right hand comes up (looked for frame by frame)
  rose = await page.waitForFunction((q) => { const n = window.__nlw; const b = n.me.bones.get('hand_r'); return b.getWorldPosition(new THREE.Vector3()).y - n.me.group.position.y > q + 0.05; }, quiet.me, { timeout: 20000 }).then(() => true, () => false);
  speaking = await handHeight();
}
await page.waitForFunction(() => [...document.querySelectorAll('#deal-log .msg.shop')].some((m) => /212 km\/h/.test(m.textContent)), null, { timeout: 90000 });
const said = await page.evaluate(() => [...document.querySelectorAll('#deal-log .msg')].slice(-2).map((m) => m.className + ': ' + m.textContent));
check('a typed question goes up at once and is answered from what is so', pending.pending && /212 km\/h/.test(said[1] || ''), said);
if (STAFF) {
  // (what was drawn while the question was said: each frame's moment within the line, the hand's height, how much the
  // conversation showed on the figure; written down with the result, so that a failure says what was seen)
  const myLine = await page.evaluate(() => { const l = window.__nlw.showroom.lines.filter((x) => x.who === 'me').at(-1); if (!l) return null; const f = window.__talkFrames.frames.filter((q) => q.now >= l.from - 1 && q.now <= l.to + 1); return { length: +(l.to - l.from).toFixed(2), frames: f.map((q) => [+(q.now - l.from).toFixed(2), q.hand === null ? null : +q.hand.toFixed(3), +q.player.toFixed(2)]) }; });
  // (looked for in the frames drawn while it was said, as they were drawn: the test's own looking, a round trip to a
  // page drawing a frame every second or two, can begin after the sentence has ended. Without a graphics card a frame
  // in this hall, every motorcycle in it its model, takes seconds, and a question is said in at most four and a half:
  // one frame may fall in it, as the hand begins to rise. In such a frame, with the figure in its speaking pose, the
  // hand a clear 3 cm above where it rested is enough; at rest it moves by less than one)
  const roseInLine = !!myLine && quiet.me !== null && myLine.frames.some(([at, hand, amount]) => at >= -0.25 && at <= myLine.length + 0.35 && hand !== null && amount > 0.5 && hand > quiet.me + (myLine.frames.length > 3 ? 0.05 : 0.03));
  check('the player speaks with the hands while saying it (the right hand comes up)', quiet.me !== null && (rose || roseInLine), { quiet, speaking, myLine });
  const lines1 = await page.evaluate(() => window.__nlw.showroom.lines.map((l) => `${l.who}@${l.from.toFixed(2)}-${l.to.toFixed(2)}`));
  // (his greeting, then the player's question, then his answer: each begins once the one before has ended)
  const turns = lines1.map((l) => { const [who, span] = l.split('@'); const [from, to] = span.split('-').map(Number); return { who, from, to }; });
  check('then he answers, after the player: one after the other, never both at once', turns.length >= 3 && turns.at(-2).who === 'me' && turns.at(-1).who === 'him' && turns.every((t, i) => i === 0 || t.from >= turns[i - 1].to), lines1);
  // while he answers he speaks with the hands, and the player listens: the frames drawn while his answer was said
  // (once it is over, and a frame after)
  const answer = turns.at(-1);
  await page.waitForFunction((end) => Date.now() / 1000 > end && window.__talkFrames.frames.some((f) => f.now > end), answer.to + 0.4, { timeout: 120000 }).catch(() => {});
  const answering = await page.evaluate(({ from, to }) => {
    const rec = window.__talkFrames; rec.stop = true;
    const during = rec.frames.filter((f) => f.now >= from - 0.25 && f.now <= to + 0.35);
    const best = during.reduce((a, f) => (!a || f.his > a.his ? f : a), null);
    return { frames: rec.frames.length, during: during.length, at: best && { his: +best.his.toFixed(2), him: +best.him.toFixed(2), player: +best.player.toFixed(2), playerSpeaking: best.playerSpeaking } };
  }, answer);
  check('while he answers he speaks (with the hands), and the player listens', !!answering.at && answering.at.his > 0.5 && answering.at.him > 0.8 && answering.at.player > 0.8 && !answering.at.playerSpeaking, answering);
  await shot('09-he-answers');
  // over a few seconds nobody stands still: the hands and heads keep moving
  const track = [];
  for (let i = 0; i < 8; i += 1) {
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    track.push(await page.evaluate(() => {
      const n = window.__nlw, hand = n.me.bones.get('hand_r'), head = n.me.bones.get('head');
      return { hand: hand.getWorldPosition(new THREE.Vector3()).toArray(), head: head.getWorldQuaternion(new THREE.Quaternion()).toArray() };
    }));
  }
  let handMoved = 0, headTurned = 0;
  for (const a of track) for (const b of track) {
    handMoved = Math.max(handMoved, Math.hypot(a.hand[0] - b.hand[0], a.hand[1] - b.hand[1], a.hand[2] - b.hand[2]));
    const dot = Math.abs(a.head[0] * b.head[0] + a.head[1] * b.head[1] + a.head[2] * b.head[2] + a.head[3] * b.head[3]);
    headTurned = Math.max(headTurned, 2 * Math.acos(Math.min(1, dot)));
  }
  check('nobody is still: the player\'s hand and head move all the while', handMoved > 0.01 && headTurned > 0.02, { hand: +handMoved.toFixed(3), head: +headTurned.toFixed(3) });
} else await shot('09-answered');
// a question tapped
await page.click('#deal-quick button[data-ask="Discount?"]');
await page.waitForFunction(() => [...document.querySelectorAll('#deal-log .msg.shop')].some((m) => /price is fixed/.test(m.textContent)), null, { timeout: 90000 });
check('a question tapped is sent as written and answered: no haggling', true, null);
await shot('10-a-question-tapped');

// ---- on a phone's screen ----
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(1200);
const fits = await page.evaluate(() => {
  const box = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; };
  const sheet = box('#sheet');
  const parts = ['.chathead', '.dealitem', '#deal-log', '#deal-quick', '#deal-bar', '.composer'].map((s) => [s, box(s)]);
  const buttons = [...document.querySelectorAll('#deal-quick button, #deal-send, #deal-buy, #deal-back')].map((b) => { const r = b.getBoundingClientRect(); const k = parseFloat(getComputedStyle(document.querySelector('#sheet')).getPropertyValue('--pk')) || 1; return { id: b.id || b.textContent, h: +(r.height).toFixed(1), unscaled: +(r.height / k).toFixed(1) }; });
  const typed = getComputedStyle(document.querySelector('#deal-text')).fontSize;
  return { viewport: [innerWidth, innerHeight], sheet, parts, buttons, typed, scroll: document.documentElement.scrollWidth <= innerWidth };
});
const inside390 = fits.parts.every(([, b]) => b && b.x >= -0.5 && b.right <= 390.5);
check('on a phone the whole conversation is on the screen, nothing off its edge', inside390 && fits.scroll && fits.sheet.right <= 390.5, fits);
check('every button is a finger\'s size, and the typing is 16 px (no zoom on a phone)', fits.buttons.every((b) => b.unscaled >= 36) && parseFloat(fits.typed) >= 16, { buttons: fits.buttons, typed: fits.typed });
await shot('11-on-a-phone');
await page.setViewportSize({ width: 1280, height: 720 });
await page.waitForTimeout(800);

// ---- bought from the conversation ----
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
const street = { x: -74.8, z: 48.4, r: 1.45, h: 0.55 };
const at2 = { x: street.x + Math.sin(street.h) * (street.r + 0.9), z: street.z + Math.cos(street.h) * (street.r + 0.9) };
await go(at2.x, at2.z, street.h + Math.PI, { yaw: street.h + Math.PI - 0.4, pitch: 0.16, dist: 6 });
await page.waitForTimeout(800);
const ask2 = await page.evaluate(() => { const p = window.__nlw.prompt(); return p && p.text; });
await page.keyboard.press('e');
await page.waitForSelector('#deal-buy', { timeout: 60000 });
await page.click('#deal-buy');
await page.waitForSelector('#deal-yes', { timeout: 30000 });
await page.click('#deal-yes');
await page.waitForSelector('#deal-done', { timeout: 60000 });
const done = await page.evaluate(async () => { const n = window.__nlw; await n.market.mine(); return { text: document.querySelector('#deal-done').textContent, mine: n.market.state.mine.holdings.map((h) => h.asset.model) }; });
check('asked about the Streetfighter and bought it there: it is the player\'s', /Streetfighter/.test(ask2 || '') && /yours/.test(done.text) && done.mine.includes('bike:streetfighter'), { ask2, done });
await shot('12-bought');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
const ended = await page.evaluate(() => ({ talk: window.__nlw.showroom.talk, open: window.__nlw.ui.dealOpen() }));
check('closing the conversation ends it', !ended.talk && !ended.open, ended);
await page.waitForFunction(() => window.__nlw.view.self.ownBikes && window.__nlw.view.self.ownBikes.bikes.includes('streetfighter'), null, { timeout: 30000 }).catch(() => {});
const indoors = await page.evaluate(() => window.__nlw.server.send({ type: 'bikes.ride', bike: 'streetfighter' }));
check('a motorcycle is not brought into the hall', !indoors.ok, indoors);

// ---- a second player in the hall ----
await page.evaluate(() => { const n = window.__nlw; n.twin('Second Rider', -58.0 + 2.3, 43.2); });
await page.waitForFunction(() => (window.__nlw.view.players || []).some((q) => q.name === 'Second Rider'), null, { timeout: 90000 });
await go(-63.6, 46.0, Math.PI, { yaw: Math.PI - 0.9, pitch: 0.2, dist: 7 });
await page.evaluate(() => { const n = window.__nlw; n.second.face(-Math.PI / 2); n.second.ask('black-bobber'); });
if (STAFF) {
  await page.waitForFunction(() => { const n = window.__nlw, s = n.salesman.state; const q = n.view.players.find((x) => x.name === 'Second Rider'); return q && q.talk && s.mode === 'talk' && s.with === `p:${q.id}`; }, null, { timeout: 90000 }).catch(() => {});
  const theirs = await page.evaluate(() => { const n = window.__nlw, s = n.salesman.state; const q = n.view.players.find((x) => x.name === 'Second Rider'); return { mode: s.mode, with: s.with, them: q && `p:${q.id}`, talk: q && q.talk }; });
  check('another player asks him about a motorcycle: he goes to them', theirs.mode === 'talk' && theirs.with === theirs.them && theirs.talk && theirs.talk.bike === 'black-bobber', theirs);
  await page.waitForFunction(() => { const n = window.__nlw, s = n.salesman.state; const q = n.view.players.find((x) => x.name === 'Second Rider'); return q && Math.hypot(s.x - q.x, s.z - q.z) < 2.2 && s.speed < 0.2; }, null, { timeout: 90000 }).catch(() => {});
  await page.waitForFunction(() => { const n = window.__nlw; const q = n.view.players.find((x) => x.name === 'Second Rider'); return q && n.showroom.peers.has(q.id) && n.showroom.peers.get(q.id).amount > 0.5; }, null, { timeout: 60000 }).catch(() => {});
  const peerTalk = await page.evaluate(() => { const n = window.__nlw; const q = n.view.players.find((x) => x.name === 'Second Rider'); return { gesturing: n.showroom.peers.has(q.id) && n.showroom.peers.get(q.id).amount > 0.5 }; });
  check('and they are seen talking with him', peerTalk.gesturing, peerTalk);
  await shot('13-another-player-asks');
  // the player asks too, after them: he stays with whoever asked first
  await page.evaluate(() => window.__nlw.askAbout('chrome-concept'));
  await page.waitForFunction(() => window.__nlw.showroom.talk && window.__nlw.ui.dealOpen() && document.querySelector('#deal-log .msg.shop'), null, { timeout: 90000 }).catch(() => {});
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const first = await page.evaluate(() => { const n = window.__nlw, s = n.salesman.state; const q = n.view.players.find((x) => x.name === 'Second Rider'); return { with: s.with, them: `p:${q.id}` }; });
  check('two asking at once: he stays with whoever began first', first.with === first.them, first);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__nlw.second.ask(null));
  // three more in the hall, nobody asking: he walks the floor
  await page.evaluate(() => { const g = window.__nlw.host.game; for (const [k, x, z] of [['third', -72, 45.8], ['fourth', -55.2, 40.6]]) g.visitors.seen(k, { name: `Visitor ${k}`, x, z, heading: 0 }); });
  await page.waitForFunction(() => window.__nlw.salesman.state.mode === 'roam', null, { timeout: 60000 }).catch(() => {});
  const roam = await page.evaluate(() => ({ mode: window.__nlw.salesman.state.mode, customers: window.__nlw.hallCustomers().length }));
  check('with four in the hall he walks the floor, not after anyone in particular', roam.mode === 'roam' && roam.customers >= 4, roam);
  await page.waitForTimeout(1500);
  await shot('14-a-busy-floor');
} else {
  // (with nobody on the floor: the other player's question is known to this town, and asked on their own phone)
  await page.waitForFunction(() => { const q = window.__nlw.view.players.find((x) => x.name === 'Second Rider'); return q && q.talk && q.talk.bike === 'black-bobber'; }, null, { timeout: 90000 }).catch(() => {});
  const theirs = await page.evaluate(() => { const q = window.__nlw.view.players.find((x) => x.name === 'Second Rider'); return { talk: q && q.talk, salesman: !!window.__nlw.salesmanActor }; });
  check('another player asks about a motorcycle: their question is on their own phone, and nobody walks over', theirs.talk && theirs.talk.bike === 'black-bobber' && !theirs.salesman, theirs);
  await shot('13-another-player-asks');
  await page.evaluate(() => window.__nlw.second.ask(null));
}

// ---- out by the mat ----
if (STAFF) await page.evaluate(() => { const g = window.__nlw.host.game; g.visitors.gone('third'); g.visitors.gone('fourth'); });
await go(-63.6, 51.9, 0, { yaw: 0, pitch: 0.2, dist: 6 });
await page.waitForTimeout(500);
await page.keyboard.down('w');
let left = false;
for (let i = 0; i < 300 && !left; i += 1) { await page.waitForTimeout(100); left = await page.evaluate(() => !window.__nlw.showroom.inside); }
await page.keyboard.up('w');
await page.waitForFunction(() => !document.getElementById('fade').classList.contains('on'), null, { timeout: 20000 });
const outside = await page.evaluate(() => { const n = window.__nlw, p = n.powerbike; return { at: [n.predicted.x, n.predicted.z], hall: p.hall.group.visible, exterior: p.exterior.visible, portal: p.portal.group.visible, salesman: !!n.salesmanActor && n.salesmanActor.group.visible }; });
check('the mat at the doors takes the player out, beside the column; the building is drawn again and the hall is not', left && outside.at[0] === -60 && outside.at[1] === 58.4 && !outside.hall && outside.exterior && outside.portal && !outside.salesman, outside);
await page.waitForTimeout(2000);
await shot('15-back-outside');
// ---- gone well away: every motorcycle's model let go ----
const kept = await page.evaluate(() => window.__nlw.powerbike.models().tiers.filter(Boolean).length);
await go(-63.6, 59.6 + 160, 0, { yaw: 0, pitch: 0.2, dist: 6 });
await page.waitForFunction(() => window.__nlw.powerbike.models().tiers.every((t) => !t), null, { timeout: 30000 }).catch(() => {});
const away = await page.evaluate(() => ({ state: window.__nlw.powerbike.models(), held: window.__nlw.bikesHeld ? window.__nlw.bikesHeld() : null }));
check('just outside the doors the models are kept (for stepping back in); gone well away from the doors, every one is let go', kept > 0 && away.state.tiers.every((t) => !t) && away.state.running === 0 && away.state.waiting === 0, { kept, ...away });

{ const lost = await lostPictures(page); check('no picture was handed to the graphics card after the page had let it go of it (no vehicle or building drawn black)', lost === 0, lost); }
await browser.close();
server.close();
const failed = results.filter((r) => !r).length;
console.log(`${results.length - failed} of ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
