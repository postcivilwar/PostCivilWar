// The guns in the real page (25 October 2026, the owner's brief for the guns, its tests A to G): two players in two
// browsers, each with their own copy of the town, joined only by the website (its server and database), the way two
// devices are. One at a computer (a keyboard and a mouse), one on a phone held on its side (touch, the phone's lighter
// drawing).
//   A  the rifle: everyone's from the start, free (no TR taken), kept by the account (the counts the same on another
//      device); the guns panel: only what is owned can be taken in hand, and where more will be sold
//   B  the shooting screen: the aim in the middle, the gun and its rounds at the top right, life at the foot, nothing
//      else to press but the gun's own buttons and the view; the buttons ash grey, green while pressed, greyed when
//      they cannot be used; the keys on a computer; on a phone, the stick, the buttons, Shoot dragged to aim
//   C  aiming: the rounds go where the aim is, from the gun's own muzzle (its flash there); through the gun's own
//      sight, the eye on the sight's line and the red dot where the rounds go
//   D  the rounds: the owner's recordings played, one for each round; the count down a round a shot, as the server
//      counts them; an empty gun clicks and reloads itself; a reload takes its time and is stopped by putting the gun
//      away, the rounds moved only when it is done
//   E  one player shoots the other: the server agrees each hit, the other's game takes each once (one life point
//      each), the shooter sees the hit, the other is told where it came from, the blood on their screen and on their
//      clothes, as the shooter sees them too; the shots heard by both; behind a wall, no hit, and a hit claimed through
//      it (a game changed to cheat) refused, like one claimed where nobody is, and rounds faster than the gun fires
//   F  the 20-life rule: shot down to 20 and no lower; at 20 the gun is put away and cannot be taken out, the aim over
//      them green, nobody's rounds strike them; the blood on the screen at its most, fading as they heal, gone at 100;
//      "Reduce intense effects" takes the splashes away and keeps where it came from
//   G  the view from further back: five seconds by the game's clock and back, or back at once pressed again; where
//      the player is, the aim and where the rounds come from are not changed by it
//   and on the phone, at the busiest places of the town with the gun out and fired, under 150 MB on the graphics card;
//   no error in either page.
//   ../server/with-postgres.sh node test/guns.mjs [shots folder]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createDevServer } from '../../server/dev.mjs';
import { pastQuestion, enterTown } from './start.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const out = process.argv[2] || '/tmp/guns-shots';
mkdirSync(out, { recursive: true });
const server = createDevServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
// (the two pages are drawn in software on this machine's two processors, and would leave the website's server, here in
// this same process, too little time to answer: the browser is put behind it, as the players' own devices would be,
// each drawing on its own; the pages' processes made later go behind it too)
try { execSync("for p in $(pgrep -f headless_shell); do renice -n 10 -p $p >/dev/null 2>&1; done"); } catch (error) { /* not on this machine */ }
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); };
const near = (a, b, within) => Math.abs(a - b) <= within;

async function player(label, { phone = false } = {}) {
  const size = phone ? { width: 844, height: 390 } : { width: 960, height: 540 };
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1, serviceWorkers: 'block', ...(phone ? { isMobile: true, hasTouch: true } : {}) });
  const page = await context.newPage(); page.setDefaultTimeout(300000);
  page.on('pageerror', (e) => check(`no error in ${label}'s page`, false, `${e.message} ${(e.stack || '').split('\n').slice(0, 4).join(' | ')}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 4\d\d/.test(m.text())) check(`no error in ${label}'s console`, false, m.text()); });
  await page.goto(`${origin}/#nointro-gameclock${phone ? '-lite' : ''}`, { timeout: 300000 });
  await page.waitForFunction(() => !!(window.__nlw && window.__nlw.intro), null, { timeout: 300000 });
  await page.waitForSelector('#open-signup', { state: 'visible', timeout: 300000 });
  await page.click('#open-signup');
  const username = `${label}_${Math.random().toString(36).slice(2, 7)}`;
  await page.fill('#account-username', username); await page.fill('#account-password', `a password for ${label}`);
  await page.click('#account-submit');
  await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 120000 });
  await pastQuestion(page);
  await page.fill('#name', label);
  await enterTown(page, { tap: phone, wait: 600000 });
  await page.waitForFunction(() => window.__nlw.me && window.__nlw.me.mixer && window.__nlw.gunPlay, null, { timeout: 300000 });
  // (the graphics at Low on both: two pages drawn in software beside the website's server on this machine leave it
  // little time to answer, and the rounds are told to it with each word; the phone's memory is measured at Medium below)
  await page.evaluate(() => { const n = window.__nlw; const g = n.host.game; g.state.weather = { kind: 'clear', until: g.state.t + 12 * 3600 }; const hour = n.view.clock.hourFloat; if (hour < 9 || hour > 14) n.skip((24 + 10 - hour) % 24); n.audio.start(); n.setGraphics('low'); });
  await page.evaluate(() => {
    const net = window.__nlw.gunNet, log = []; window.__netLog = log;
    const t = () => +(performance.now() / 1000).toFixed(2);
    const body = net.body.bind(net), answer = net.answer.bind(net);
    net.body = () => { const b = body(); if (b.fire) log.push({ at: t(), sent: b.fire.s.map((x) => x[0]) }); return b; };
    net.answer = (r) => { if (!r) log.push({ at: t(), lost: true }); else if (r.fire) log.push({ at: t(), ok: r.fire.ok, no: r.fire.no, error: r.fire.error }); return answer(r); };
  });
  const cdp = phone ? await context.newCDPSession(page) : null;
  let shots = 0;
  return {
    label, phone, context, page, username, cdp,
    shot: (name) => page.screenshot({ path: resolve(out, `${String(++shots).padStart(2, '0')}-${label}-${name}.png`) }),
    touch: (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id || 1, radiusX: 8, radiusY: 8, force: 1 })) }),
  };
}

// ---- in the page ----
// frames drawn: a view is looked at once it has been drawn a few times over, however slowly this machine draws
async function frames(p, k = 4) {
  await p.page.evaluate(() => { if (window.__frames === undefined) { window.__frames = 0; const f = () => { window.__frames += 1; requestAnimationFrame(f); }; requestAnimationFrame(f); } });
  const f0 = await p.page.evaluate(() => window.__frames);
  await p.page.waitForFunction(([a, n]) => window.__frames >= a + n, [f0, k], { timeout: 180000 }).catch(() => {});
}
const gunOf = (p) => p.page.evaluate(() => { const n = window.__nlw, g = n.view.self.gun; return { out: g.out, mag: g.mag, spare: g.spare, reloading: !!g.reloading, equipped: g.equipped, server: g.server, health: n.view.self.health, critical: !!n.view.self.critical, mode: n.mode, fired: n.gunPlay.stats.fired }; });
const serverGuns = (p) => p.page.evaluate(async () => { const r = await window.__nlw.online.ask('gun.state'); return r.ok ? r.gun : r; });
// (since 27 October 2026 the owner's townspeople are about the town, and a round stops at the first body in its way:
// anyone of the town's near where the players stand is kept indoors a few minutes, so that the rounds tested are the
// ones between the two players)
const place = (p, x, z, heading) => p.page.evaluate(([x, z, heading]) => { const n = window.__nlw; n.place(x, z); n.face(heading); n.cam.yaw = heading; n.cam.pitch = 0.05; const g = n.host.game, pop = g.internals.population, A = g.internals.actors, o = {}; for (let i = 0; i < pop.count; i += 1) { if (pop.people[i].job === 'police') continue; pop.locate(i, g.state.t, o); if (o.pose === 4 || Math.hypot(o.x - x, o.z - z) > 70) continue; if (A.take(i, g.state.t)) A.hold(i, 'Indoors', 4, g.state.real + 900); } }, [x, z, heading]);
// the gun taken out with its key (X), and in the hands
async function draw(p) {
  if (p.phone) await p.page.tap('#pad .pad[data-id="gun"]'); else await p.page.keyboard.press('x');
  await p.page.waitForFunction(() => { const n = window.__nlw; return n.gunPlay.out && n.gunPlay.state.gun && n.gunPlay.state.gun.ready && n.gunPlay.weight > 0.95; }, null, { timeout: 120000 });
}
// The aim turned onto a point: the camera's way set so that the aim's line, from where the aim is from, goes through it
// (the aim is from beside the figure's shoulder: it moves as the aim turns, so this is done a few times over)
async function aimAt(p, point) {
  for (let k = 0; k < 4; k += 1) {
    await p.page.evaluate((pt) => {
      const n = window.__nlw, o = n.gunPlay.aimFrom;
      const dx = pt[0] - o.x, dy = pt[1] - o.y, dz = pt[2] - o.z, d = Math.hypot(dx, dy, dz);
      n.cam.yaw = Math.atan2(dx, dz); n.cam.pitch = Math.asin(-dy / d);
    }, point);
    await frames(p, 2);
  }
}
// rounds fired with the trigger held (the key F, or Shoot on the screen) until `count` more have gone (or `most` ms)
async function fireRounds(p, count, { most = 60000, keepAim = null } = {}) {
  const before = await p.page.evaluate(() => window.__nlw.gunPlay.stats.fired);
  if (p.phone) await p.page.evaluate(() => window.__nlw.gunPlay.act('shoot', 'down')); else await p.page.keyboard.down('f');
  const t0 = Date.now();
  // (the recoil climbs the aim: put back onto the point between rounds, as a player holds it there)
  while (Date.now() - t0 < most) {
    const now = await p.page.evaluate((pt) => { const n = window.__nlw; if (pt) { const o = n.gunPlay.aimFrom; const dx = pt[0] - o.x, dy = pt[1] - o.y, dz = pt[2] - o.z, d = Math.hypot(dx, dy, dz); n.cam.yaw = Math.atan2(dx, dz); n.cam.pitch = Math.asin(-dy / d); } return n.gunPlay.stats.fired; }, keepAim);
    if (now - before >= count) break;
    await p.page.waitForTimeout(30);
  }
  if (p.phone) await p.page.evaluate(() => window.__nlw.gunPlay.act('shoot', 'up')); else await p.page.keyboard.up('f');
  return (await p.page.evaluate(() => window.__nlw.gunPlay.stats.fired)) - before;
}
// the server has heard of every round fired (nothing waiting to be told)
const told = (p) => p.page.waitForFunction(() => window.__nlw.gunNet.waiting === 0, null, { timeout: 90000 }).catch(() => {});
// the server's count, once it has answered every round (and the town's, which takes the server's when nothing is on its way)
async function serverAgrees(p, most = 40000) {
  await told(p);
  const trace = await p.page.evaluate(() => (window.__netLog || []).slice(-40));
  const t0 = Date.now();
  let town = null, server = null;
  while (Date.now() - t0 < most) {
    town = await gunOf(p);
    const sg = await serverGuns(p);
    server = sg.guns ? sg.guns.find((g) => g.id === town.equipped) : null;
    if (server && server.mag === town.mag && server.spare === town.spare) break;
    await p.page.waitForTimeout(1500);
  }
  const lost = await p.page.evaluate(() => window.__nlw.gunNet.stats.lost);
  return { town: town && { mag: town.mag, spare: town.spare }, server: server && { mag: server.mag, spare: server.spare }, lost, ...(lost ? { trace } : {}) };
}
// The law in A's town, kept out of what follows: shooting another player is an offence, which the one shot reports
// (src/sim/justice.js) and the police come for, and an arrest would take A away from the test. Each crime of A's still
// open is let lapse, as it would after a while, and A is no longer wanted. (The law is tested elsewhere: police.test.mjs.)
const forgive = (p) => p.page.evaluate(() => {
  const n = window.__nlw, g = n.host.game, me = g.state.players[n.playerId], book = g.state.justice;
  let n2 = 0;
  for (const c of Object.values(book.crimes || {})) if (c.culprit === me.id && c.status === 'open') { c.status = 'lapsed'; n2 += 1; }
  const was = me.law ? me.law.state : 'normal';
  if (was !== 'arrested' && was !== 'custody') me.law = { state: 'normal', since: 0, crimes: [], seenAt: null };
  n.refresh && n.refresh();
  return { lapsed: n2, was };
});
// a point in the scene on the screen, in px (null behind the camera)
const onScreen = (p, pt) => p.page.evaluate((pt) => { const n = window.__nlw; const v = new n.THREE.Vector3(pt[0], pt[1], pt[2]).project(n.camera); if (v.z < -1 || v.z > 1) return null; return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }; }, pt);
// the other player as this one's game has them: where, their chest, their health, their peer number
const other = (p, name) => p.page.evaluate((name) => { const n = window.__nlw; const q = n.shownPeers.find((o) => o.name === name); if (!q) return null; const gy = n.ground(q.x, q.z); return { id: q.id, peer: q.peer, x: q.x, z: q.z, chest: [q.x, gy + 1.25, q.z], health: q.health, gun: q.gun ? { aim: q.gun.aim, out: q.gun.out } : null, wounds: (q.wounds || []).length }; }, name);

const A = await player('Shooter');
const B = await player('Target', { phone: true });

// ---- places to stand: open ground with a clear line twelve metres long (no wall, no fence, no post in it): one by the
// road works on Waterside Road, with walls near to shoot at; and one where no police beat comes within 150 m (the south
// west, by the Kwale road), for one player to shoot the other: an officer who saw it would come for the shooter ----
const findLine = (spots) => A.page.evaluate((spots) => {
  const n = window.__nlw, g = n.host.game;
  for (const [x0, z0] of spots) {
    for (let k = 0; k < 32; k += 1) {
      const h = -Math.PI / 2 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 16);
      const dx = Math.sin(h), dz = Math.cos(h);
      const y = n.ground(x0, z0) + 1.3;
      const hit = g.aimAt([x0, y, z0], [dx, 0, dz], 30, n.playerId);
      if (!(hit.what === 'air' || hit.at > 24)) continue;
      if (![1, 2, 4, 6, 8, 10, 12, 14].every((d) => n.walkable(x0 + dx * d, z0 + dz * d))) continue;
      if (Math.abs(n.ground(x0 + dx * 12, z0 + dz * 12) - n.ground(x0, z0)) > 0.4) continue;
      return { x: x0, z: z0, h, bx: x0 + dx * 12, bz: z0 + dz * 12 };
    }
  }
  return null;
}, spots);
const line = await findLine([[-236, 103.5], [-226, 96], [-210, 104], [-244, 92]]);
const quiet = await findLine([[-315, -210], [-305, -205], [-320, -200], [-300, -212]]);
// (and a second such place, far from the first: where B goes at 20, out of reach of the ambulance sent for them there)
const quiet2 = await findLine([[245, -280], [245, -285], [240, -280], [235, -282]]) || quiet;
check('there is open ground with a clear line to stand on, for the two players: by the road works, and away from the police', !!line && !!quiet, { line, quiet });
await place(A, line.x, line.z, line.h);
await place(B, line.bx, line.bz, line.h + Math.PI);
// (each knows the other by their account's name, as the website names players)
await A.page.waitForFunction((name) => window.__nlw.shownPeers.some((q) => q.name === name && q.peer), B.username, { timeout: 180000 });
await B.page.waitForFunction((name) => window.__nlw.shownPeers.some((q) => q.name === name && q.peer), A.username, { timeout: 180000 });
await frames(A, 4);

// ---- A: the rifle, everyone's, free ----
const balance0 = await A.page.evaluate(() => window.__nlw.view.self.balance);
const sg0 = await serverGuns(A);
const rifle0 = sg0.guns && sg0.guns.find((g) => g.id === 'rifle');
check('A: a new account has the rifle from the start, in its hands to take out: 30 in it and 120 spare; everyone\'s, free, never for sale', !!rifle0 && rifle0.owned && rifle0.starter && rifle0.price === 0 && !rifle0.forSale && rifle0.mag === 30 && rifle0.spare === 120 && sg0.equipped === 'rifle' && sg0.guns.filter((g) => g.owned).length === 1, sg0);
const g0 = await gunOf(A);
check('A: the town agrees with the server: the rifle, 30 and 120, put away to begin with', g0.equipped === 'rifle' && g0.mag === 30 && g0.spare === 120 && !g0.out && g0.server, g0);
await A.shot('walking');
const walkKeys = await A.page.evaluate(() => [...document.querySelectorAll('#keys .key')].map((k) => [...k.children].map((c) => c.textContent.trim()).join(' ')));
check('A: on foot, the gun is one of the buttons (X)', walkKeys.some((k) => /Gun/.test(k)), walkKeys);
await draw(A);
await frames(A, 4);

// ---- B: the shooting screen, on a computer ----
const screenA = await A.page.evaluate(() => {
  const n = window.__nlw, hs = n.gunPlay.hud.state();
  const shown = (sel) => { const el = document.querySelector(sel); if (!el) return false; const r = el.getBoundingClientRect(); return !el.hidden && getComputedStyle(el).display !== 'none' && r.width > 0 && r.height > 0; };
  const rect = (sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom) }; };
  return {
    mode: n.mode, armed: document.querySelector('#hud').classList.contains('armed'), hud: hs, view: n.rig.view, cameraView: n.gunPlay.cameraView(),
    keys: [...document.querySelectorAll('#keys .key')].map((k) => [...k.children].map((c) => c.textContent.trim()).join(' ')),
    purse: shown('.purse'), panel: shown('#gun-panel'), panelAt: rect('#gun-panel'), life: shown('#gun-life'), lifeAt: rect('#gun-life'), reticle: shown('#gun-reticle .aim'), radar: shown('#radar'),
    w: innerWidth, h: innerHeight, balance: n.view.self.balance,
  };
});
check('B: with the gun out, the shooting screen: the aim in the middle of the picture', screenA.mode === 'gun' && screenA.armed && screenA.reticle && near(screenA.hud.x, screenA.w / 2, 3) && near(screenA.hud.y, screenA.h / 2, 3) && screenA.hud.kind === 'neutral', { x: screenA.hud.x, y: screenA.hud.y, kind: screenA.hud.kind });
check('B: the gun\'s name and its rounds at the top right (Rifle, 30 / 120, its picture), in the purse\'s place; life at the foot, in the middle; the map still at the top left', screenA.panel && screenA.panelAt.right > screenA.w - 30 && screenA.panelAt.top < 40 && !screenA.purse && screenA.hud.gun.name === 'Rifle' && screenA.hud.gun.mag === '30' && screenA.hud.gun.spare === '120' && screenA.hud.gun.picture && screenA.life && near((screenA.lifeAt.left + screenA.lifeAt.right) / 2, screenA.w / 2, 4) && screenA.lifeAt.bottom > screenA.h - 40 && screenA.hud.life === '100' && screenA.radar, { panel: screenA.panelAt, life: screenA.lifeAt, gun: screenA.hud.gun });
const wantKeys = ['F Shoot', 'Q Aim', 'R Reload', 'C Crouch', 'Space Jump', 'G Guns', 'V View', 'X Put away'];
check('B: on a computer, the gun\'s own keys and nothing else (no running, fighting, taking or driving): F shoots, Q aims through the sight, R reloads, C crouches, Space jumps, G the guns, V the view, X puts it away', JSON.stringify(screenA.keys) === JSON.stringify(wantKeys), screenA.keys);
check('B: the camera over the shoulder', screenA.cameraView === 'aim', screenA.cameraView);
check('A: taking the rifle out took no TR', screenA.balance === balance0, { before: balance0, after: screenA.balance });
await A.shot('gun-out');

// ---- C: the rounds go where the aim is, from the muzzle ----
// (a wall to shoot at: the nearest the aim meets, looked for round the player)
const wall = await A.page.evaluate((away) => {
  const n = window.__nlw, g = n.host.game, o = n.gunPlay.aimFrom;
  let best = null;
  for (let k = 0; k < 48; k += 1) {
    const h = (k / 48) * Math.PI * 2, d = [Math.sin(h), 0, Math.cos(h)];
    const hit = g.aimAt([o.x, o.y, o.z], d, 60, n.playerId);
    // (well away from the way the other player stands)
    const off = Math.abs(Math.atan2(Math.sin(h - away), Math.cos(h - away)));
    if (hit.what === 'wall' && hit.at > 6 && hit.at < 45 && off > 0.7 && (!best || hit.at < best.at)) best = { h, at: hit.at, point: hit.point };
  }
  return best;
}, line.h);
check('C: there is a wall in sight to shoot at', !!wall, wall);
await aimAt(A, wall.point);
await frames(A, 3);
const reticleOnWall = await A.page.evaluate(() => window.__nlw.gunPlay.hud.state());
const wallOnScreen = await onScreen(A, wall.point);
check('C: the aim on the wall: the mark in the middle is where the wall is', !!wallOnScreen && near(wallOnScreen.x, reticleOnWall.x, 4) && near(wallOnScreen.y, reticleOnWall.y, 4), { wall: wallOnScreen, reticle: { x: reticleOnWall.x, y: reticleOnWall.y } });
await A.page.evaluate(() => { window.__shots = []; const n = window.__nlw; const S = n.gunPlay.state; window.__muzzles = []; const send = n.server.send; n.__wrappedSend = n.__wrappedSend || send; n.server.send = (intent) => { const r = n.__wrappedSend(intent); if (intent.type === 'gun.fire' && r.ok) { const s = r.shots[0]; const m = S.gun.point('muzzle'); window.__shots.push({ o: intent.shots[0].o, d: intent.shots[0].d, end: s.end, what: s.what, muzzle: [m.x, m.y, m.z], flash: null }); } return r; }; });
const firedC = await fireRounds(A, 6, { keepAim: wall.point });
await frames(A, 2);
const cShots = await A.page.evaluate(() => { const n = window.__nlw; return { shots: window.__shots, flash: n.gunPlay.fx.last.flash, muzzle: (() => { const m = n.gunPlay.state.gun.point('muzzle'); return [m.x, m.y, m.z]; })() }; });
const cScreen = [];
for (const s of cShots.shots) cScreen.push(await onScreen(A, s.end));
const fromMuzzle = cShots.shots.every((s) => Math.hypot(s.o[0] - s.muzzle[0], s.o[1] - s.muzzle[1], s.o[2] - s.muzzle[2]) < 0.02);
const onWall = cShots.shots.filter((s) => s.what === 'wall').length;
const offAim = cScreen.map((q, k) => (q ? Math.hypot(q.x - reticleOnWall.x, q.y - reticleOnWall.y) : 999));
check('C: each round from the gun\'s own muzzle, to the wall the aim is on, within a few pixels of the aim\'s mark (the spread of a steady aim, and the climb of the recoil)', firedC >= 6 && fromMuzzle && onWall >= 5 && offAim.every((d) => d < 40), { fired: firedC, onWall, offAim: offAim.map((d) => Math.round(d)) });
check('C: the flash at the muzzle', !!cShots.flash && Math.hypot(cShots.flash[0] - cShots.shots[cShots.shots.length - 1].muzzle[0], cShots.flash[1] - cShots.shots[cShots.shots.length - 1].muzzle[1], cShots.flash[2] - cShots.shots[cShots.shots.length - 1].muzzle[2]) < 0.02, { flash: cShots.flash, muzzle: cShots.shots.length ? cShots.shots[cShots.shots.length - 1].muzzle : null });
await A.shot('fired-at-the-wall');
// through the sight (Q)
await A.page.keyboard.press('q');
await A.page.waitForFunction(() => window.__nlw.gunPlay.state.sightW > 0.98, null, { timeout: 60000 }).catch(() => {});
await aimAt(A, wall.point);
await frames(A, 3);
const sight = await A.page.evaluate(() => {
  const n = window.__nlw, gun = n.gunPlay.state.gun, cam = n.camera;
  const pr = (v) => { const q = v.clone().project(cam); return { x: (q.x * 0.5 + 0.5) * innerWidth, y: (-q.y * 0.5 + 0.5) * innerHeight }; };
  const head = n.me.bones && n.me.bones.get('head');
  return { fov: cam.fov, front: pr(gun.point('sight')), rear: pr(gun.point('rear')), hud: n.gunPlay.hud.state(), dotShown: !document.querySelector('#gun-dot').hidden, keysShown: getComputedStyle(document.querySelector('#keys')).display !== 'none', head: head ? head.scale.x : null, w: innerWidth, h: innerHeight, sightKey: [...document.querySelectorAll('#keys .key')].find((k) => /Aim/.test(k.textContent)) };
});
check('C: through the sight (Q): the view closes in (a narrower view), the eye on the sight\'s own line, its front and back over the middle of the picture', sight.fov < 40 && near(sight.front.x, sight.w / 2, 3) && near(sight.front.y, sight.h / 2, 3) && near(sight.rear.x, sight.w / 2, 3) && near(sight.rear.y, sight.h / 2, 3), { fov: sight.fov, front: sight.front, rear: sight.rear });
check('C: the red dot shown where the rounds go, the aim\'s ring put away, the keys written at the foot put away, the player\'s own head out of the way', sight.dotShown && !sight.hud.reticle && near(sight.hud.x, sight.w / 2, 3) && near(sight.hud.y, sight.h / 2, 3) && !sight.keysShown && sight.head !== null && sight.head < 0.01, { dot: sight.dotShown, reticle: sight.hud.reticle, at: [sight.hud.x, sight.hud.y], keys: sight.keysShown, head: sight.head });
await A.shot('through-the-sight');
await A.page.evaluate(() => { window.__shots = []; });
const firedS = await fireRounds(A, 3, { keepAim: wall.point });
await frames(A, 2);
const sShots = await A.page.evaluate(() => window.__shots);
const sOff = [];
for (const s of sShots) { const q = await onScreen(A, s.end); sOff.push(q ? Math.round(Math.hypot(q.x - sight.w / 2, q.y - sight.h / 2)) : 999); }
check('C: through the sight, the rounds go to the red dot (the spread of a sight)', firedS >= 3 && sOff.every((d) => d < 24), { fired: firedS, off: sOff });
await A.shot('fired-through-the-sight');
await A.page.keyboard.press('q');
await A.page.waitForFunction(() => window.__nlw.gunPlay.state.sightW < 0.02, null, { timeout: 60000 }).catch(() => {});

// ---- D: the rounds, the sound, the count, empty, reloading ----
await told(A);
const dTown = await gunOf(A);
const dServer = await serverAgrees(A);
const dSound = await A.page.evaluate(() => window.__nlw.audio.gunState('rifle'));
check('D: the owner\'s four recordings of the rifle loaded and played, one for each round fired (never two for one)', dSound.state === 'ready' && Array.isArray(dSound.rounds) && dSound.rounds.length === 4 && dSound.rounds.every((k) => k >= 6) && dSound.shots === dTown.fired && dSound.failed === 0, { sound: dSound, fired: dTown.fired });
check('D: a round a shot: the count down by the rounds fired, and the server has counted every one of them', dTown.mag === 30 - dTown.fired && dServer.server.mag === 30 - dTown.fired && dTown.spare === 120 && dServer.server.spare === 120, { fired: dTown.fired, town: { mag: dTown.mag, spare: dTown.spare }, server: dServer.server, lost: dServer.lost, trace: await A.page.evaluate(() => (window.__netLog || []).slice(-30)) });
// empty: all but the last round or two at the wall; then, watched frame by frame, the trigger held: the last rounds go,
// the empty gun clicks and reloads itself (there being rounds spare), nothing fired while it reloads; let go before it is
// done
await fireRounds(A, Math.max(0, dTown.mag - 2), { keepAim: wall.point, most: 120000 });
await A.page.waitForTimeout(500);
await A.page.evaluate(() => {
  const n = window.__nlw, w = { began: null, ended: null, firedAt: null, firedDuring: null, emptyAt: null };
  window.__reload = w;
  const f = () => {
    const g = n.view.self.gun, t = n.host.game.state.real;
    if (g.mag === 0 && w.emptyAt === null) w.emptyAt = t;
    if (g.reloading && w.began === null) { w.began = t; w.firedAt = n.gunPlay.stats.fired; }
    if (!g.reloading && w.began !== null && w.ended === null) { w.ended = t; w.firedDuring = n.gunPlay.stats.fired - w.firedAt; w.mag = g.mag; w.spare = g.spare; }
    if (w.ended === null) requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
});
await A.page.keyboard.down('f');
await A.page.waitForFunction(() => window.__reload.began !== null, null, { timeout: 60000 }).catch(() => {});
const reloadingNow = await A.page.evaluate(() => { const n = window.__nlw; return { reloading: !!n.view.self.gun.reloading, stats: { ...n.gunPlay.stats }, sound: n.audio.gunState('rifle'), hud: n.gunPlay.hud.state(), mag: n.view.self.gun.mag }; });
await A.page.waitForFunction(() => { const n = window.__nlw; return n.host.game.state.real - window.__reload.began > 1 || window.__reload.ended !== null; }, null, { timeout: 30000 }).catch(() => {});
await A.page.keyboard.up('f');
await A.shot('reloading');
await A.page.waitForFunction(() => window.__reload.ended !== null, null, { timeout: 60000 }).catch(() => {});
const rl = await A.page.evaluate(() => window.__reload);
check('D: an empty gun: the trigger clicks on nothing (its sound), and it reloads itself with rounds spare ("Reloading" shown)', reloadingNow.reloading && reloadingNow.stats.empties >= 1 && reloadingNow.stats.autoReloads >= 1 && reloadingNow.sound.empty >= 1 && reloadingNow.mag === 0 && reloadingNow.hud.gun.note === 'Reloading', { empties: reloadingNow.stats.empties, autoReloads: reloadingNow.stats.autoReloads, emptySound: reloadingNow.sound.empty, hud: reloadingNow.hud.gun });
check('D: a reload takes its time (2.4 seconds by the town\'s clock), nothing is fired during it however the trigger is held, and then 30 are in it, taken from the spare', rl.began !== null && rl.ended !== null && rl.ended - rl.began >= 2.35 && rl.ended - rl.began < 3.1 && rl.firedDuring === 0 && rl.mag === 30 && rl.spare === 90, { took: rl.ended !== null ? +(rl.ended - rl.began).toFixed(2) : null, firedDuring: rl.firedDuring, mag: rl.mag, spare: rl.spare });
await told(A);
const afterReload = await serverAgrees(A);
check('D: and the server has the same', afterReload.server.mag === afterReload.town.mag && afterReload.server.spare === afterReload.town.spare && afterReload.server.spare === 90, afterReload);
// a reload stopped by putting the gun away: no rounds moved
await fireRounds(A, 4, { keepAim: wall.point });
const { mag: m0, spare: s0 } = await gunOf(A);
await A.page.keyboard.press('r');
await A.page.waitForFunction(() => !!window.__nlw.view.self.gun.reloading, null, { timeout: 10000 }).catch(() => {});
await A.page.keyboard.press('x');
await frames(A, 2);
const stopped = await gunOf(A);
await A.page.waitForTimeout(3500);
const stoppedLater = await gunOf(A);
check('D: a reload stopped by putting the gun away: no rounds moved into it, none lost', !stopped.out && !stopped.reloading && stoppedLater.mag === m0 && m0 < 30 && stoppedLater.spare === s0, { before: { mag: m0, spare: s0 }, stopped, later: stoppedLater });
await draw(A);
await A.page.keyboard.press('r');
await A.page.waitForFunction(() => !window.__nlw.view.self.gun.reloading && window.__nlw.view.self.gun.mag === 30, null, { timeout: 60000 }).catch(() => {});
const full = await gunOf(A);
await told(A);
const fullServer = await serverAgrees(A);
check('D: reloaded again: 30 in it, the rounds fired made up from the spare; the server the same', full.mag === 30 && full.spare === s0 - (30 - m0) && fullServer.server.mag === 30 && fullServer.server.spare === full.spare, { full, before: { mag: m0, spare: s0 }, server: fullServer.server });

// ---- G: the view from further back, five seconds ----
const before = await A.page.evaluate(() => { const n = window.__nlw; return { x: n.predicted.x, z: n.predicted.z, yaw: n.cam.yaw, pitch: n.cam.pitch }; });
// (when it comes and when it goes, by the game's clock, watched frame by frame in the page; and at the first frame of it
// with the camera come to its place (still since the frame before), the whole figure looked for in the picture there and
// a round fired. A frame drawn in software on this machine can take half a second, and the five seconds could be over
// before a look from outside the page came: on 25 October, in the first batch of the whole series, the figure was
// looked for after them.)
const watchView = () => A.page.evaluate(() => {
  const n = window.__nlw, S = n.gunPlay.state, w = { pressedAt: null, on: null, off: null, frames: 0, last: null, settled: null, fired: null, shot: null };
  window.__ov = w;
  const bones = ['head', 'foot_l', 'foot_r', 'hand_l', 'hand_r'];
  const f = () => {
    const v = n.gunPlay.cameraView();
    if (v === 'overview' && w.on === null) { w.on = S.clock; w.pressedAt = S.overviewAt; w.until = S.overviewUntil; }
    if (v === 'overview' && w.off === null) {
      const cam = n.camera, p = cam.position;
      const moved = w.last ? Math.hypot(p.x - w.last[0], p.y - w.last[1], p.z - w.last[2]) : 99;
      w.last = [p.x, p.y, p.z]; w.frames += 1;
      if (moved < 0.02 && !w.settled) {
        const pts = bones.map((b) => n.me.bones.get(b)).filter(Boolean).map((b) => b.getWorldPosition(new n.THREE.Vector3()).project(cam));
        w.settled = { after: +(S.clock - S.overviewAt).toFixed(2), dist: +p.distanceTo(n.me.group.position).toFixed(2), all: pts.length === 5 && pts.every((q) => Math.abs(q.x) < 0.95 && Math.abs(q.y) < 0.95 && q.z < 1), pts: pts.map((q) => [+q.x.toFixed(2), +q.y.toFixed(2)]) };
        // (the trigger held until one round has gone)
        w.fired = n.gunPlay.stats.fired; window.__shots = []; n.gunPlay.act('shoot', 'down');
      }
      if (w.fired !== null && w.shot === null && n.gunPlay.stats.fired > w.fired) {
        n.gunPlay.act('shoot', 'up');
        const d = n.gunPlay.aimDir;
        w.shot = { ...(window.__shots[0] || {}), view: v, aim: [d.x, d.y, d.z] };
      }
    }
    if (v === 'aim' && w.on !== null && w.off === null) { w.off = S.clock; if (w.fired !== null && w.shot === null) n.gunPlay.act('shoot', 'up'); }
    if (w.off === null) requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
});
await watchView();
await A.page.keyboard.press('v');
await A.page.waitForFunction(() => window.__ov.on !== null, null, { timeout: 30000 }).catch(() => {});
await A.page.waitForFunction(() => !!window.__ov.settled || window.__ov.off !== null, null, { timeout: 120000 }).catch(() => {});
await A.shot('the-view-from-further-back');
await A.page.waitForFunction(() => window.__ov.off !== null, null, { timeout: 120000 }).catch(() => {});
const ovw = await A.page.evaluate(() => window.__ov);
const ovEnd = await A.page.evaluate(() => { const n = window.__nlw; return { view: n.gunPlay.cameraView(), x: n.predicted.x, z: n.predicted.z }; });
const lasted = ovw.off !== null ? ovw.off - ovw.pressedAt : null;
const ovSeen = ovw.settled, ovShot = ovw.shot;
check('G: V: the view from further back, the whole figure and round it in the picture, the camera further off', !!ovSeen && ovSeen.all && ovSeen.dist > 4, { settled: ovSeen, frames: ovw.frames });
check('G: five seconds by the game\'s clock, and back over the shoulder by itself', ovEnd.view === 'aim' && lasted !== null && lasted >= 4.99 && lasted < 5.6 && Math.abs(ovw.until - ovw.pressedAt - 5) < 1e-6, { lasted: lasted !== null ? +lasted.toFixed(2) : null });
check('G: where the player is and the aim are not changed by it, and a round fired in it goes from the muzzle along the aim', Math.hypot(ovEnd.x - before.x, ovEnd.z - before.z) < 0.05 && !!ovShot && ovShot.view === 'overview' && !!ovShot.o && Math.hypot(ovShot.o[0] - ovShot.muzzle[0], ovShot.o[1] - ovShot.muzzle[1], ovShot.o[2] - ovShot.muzzle[2]) < 0.02 && (ovShot.d[0] * ovShot.aim[0] + ovShot.d[1] * ovShot.aim[1] + ovShot.d[2] * ovShot.aim[2]) > 0.98, { moved: +Math.hypot(ovEnd.x - before.x, ovEnd.z - before.z).toFixed(3), shot: ovShot ? { view: ovShot.view, from: ovShot.o, muzzle: ovShot.muzzle } : null });
// pressed again during it: back at once; three times: on again, its five seconds from the third
await A.page.keyboard.press('v');
await frames(A, 2);
const onAgain = await A.page.evaluate(() => window.__nlw.gunPlay.cameraView());
await A.page.keyboard.press('v');
await frames(A, 2);
const offAgain = await A.page.evaluate(() => window.__nlw.gunPlay.cameraView());
await A.page.keyboard.press('v'); await A.page.keyboard.press('v'); await A.page.keyboard.press('v');
await frames(A, 2);
const thrice = await A.page.evaluate(() => { const S = window.__nlw.gunPlay.state; return { view: window.__nlw.gunPlay.cameraView(), span: +(S.overviewUntil - S.overviewAt).toFixed(3), sinceThird: +(S.clock - S.overviewAt).toFixed(2) }; });
check('G: pressed again during it: back at once; pressed three times: on, with its five seconds from the third', onAgain === 'overview' && offAgain === 'aim' && thrice.view === 'overview' && thrice.span === 5, { onAgain, offAgain, thrice });
await A.page.keyboard.press('v');
await told(A);

// ---- B: the shooting screen on a phone (facing away from A: what it fires goes nowhere near them) ----
await place(B, line.bx, line.bz, line.h);
await draw(B);
await frames(B, 4);
const padsB = await B.page.evaluate(() => [...document.querySelectorAll('#pad .pad')].map((b) => ({ id: b.dataset.id, primary: b.classList.contains('primary'), off: b.disabled, opacity: +getComputedStyle(b).opacity, shadow: getComputedStyle(b).boxShadow })).sort((p, q) => p.id.localeCompare(q.id)));
const stickB = await B.page.evaluate(() => { const r = document.querySelector('#stick').getBoundingClientRect(); return { left: r.left, bottom: innerHeight - r.bottom, shown: r.width > 0 }; });
const ids = padsB.map((p) => p.id).sort().join(',');
check('B: on a phone with the gun out, the gun\'s own buttons and nothing else: Shoot the large one, Aim, Reload, Crouch, Jump, Guns, the view and Put away; the stick at the lower left', ids === ['aim', 'crouch', 'holster', 'jump', 'overview', 'reload', 'shoot', 'switch'].sort().join(',') && padsB.find((p) => p.id === 'shoot').primary && stickB.shown && stickB.left < 60, { ids, stick: stickB });
const reloadPad = padsB.find((p) => p.id === 'reload');
check('B: a button that cannot be used just now (Reload, with the gun full) greyed', reloadPad.off && reloadPad.opacity < 0.5 && padsB.filter((p) => p.id !== 'reload').every((p) => !p.off && p.opacity > 0.9 && /178, 190, 181/.test(p.shadow)), padsB.map((p) => `${p.id}:${p.off ? 'off' : 'on'}:${p.opacity}`));
await B.shot('gun-out-on-a-phone');
// Shoot held: green while pressed; dragged, it turns the aim
const shoot = await B.page.evaluate(() => { const r = document.querySelector('#pad .pad[data-id="shoot"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
const yaw0 = await B.page.evaluate(() => window.__nlw.cam.yaw);
await B.touch('touchStart', [{ ...shoot, id: 7 }]);
await B.page.waitForTimeout(300);
const held = await B.page.evaluate(() => { const b = document.querySelector('#pad .pad[data-id="shoot"]'); return { down: b.classList.contains('down'), shadow: getComputedStyle(b).boxShadow, firing: window.__nlw.gunPlay.firing }; });
for (let k = 1; k <= 6; k += 1) { await B.touch('touchMove', [{ x: shoot.x - k * 12, y: shoot.y, id: 7 }]); await B.page.waitForTimeout(60); }
await B.page.waitForTimeout(300);
const yaw1 = await B.page.evaluate(() => window.__nlw.cam.yaw);
await B.touch('touchEnd', []);
await B.page.waitForTimeout(400);
const released = await B.page.evaluate(() => { const b = document.querySelector('#pad .pad[data-id="shoot"]'); return { down: b.classList.contains('down'), firing: window.__nlw.gunPlay.firing, fired: window.__nlw.gunPlay.stats.fired, shadow: getComputedStyle(b).boxShadow }; });
check('B: Shoot held on a phone: green while the finger is on it, firing; dragged, the aim turns; let go, ash grey again and the firing stops', held.down && /63, 226, 124/.test(held.shadow) && held.firing && Math.abs(yaw1 - yaw0) > 0.05 && !released.down && !released.firing && released.fired > 0 && /178, 190, 181/.test(released.shadow), { held, turned: +(yaw1 - yaw0).toFixed(3), released });
// B faces A again, and puts the gun away, for what follows
await B.page.evaluate(() => window.__nlw.gunPlay.act('holster', 'down'));
await place(B, line.bx, line.bz, line.h + Math.PI);
await told(B);

// ---- E: A shoots B (where no officer can see it) ----
await place(A, quiet.x, quiet.z, quiet.h);
await place(B, quiet.bx, quiet.bz, quiet.h + Math.PI);
await A.page.waitForFunction(([name, x, z]) => { const q = window.__nlw.shownPeers.find((o) => o.name === name); return q && Math.hypot(q.x - x, q.z - z) < 0.8; }, [B.username, quiet.bx, quiet.bz], { timeout: 120000 }).catch(() => {});
await A.page.evaluate(() => { const n = window.__nlw; n.gunPlay.state.crouch = false; });
await A.page.waitForFunction((name) => { const q = window.__nlw.shownPeers.find((o) => o.name === name); return q && Number.isFinite(q.health) && q.health === 100; }, B.username, { timeout: 60000 }).catch(() => {});
const bSeen = await other(A, B.username);
check('E: A sees B where B stands, at 100', !!bSeen && Math.hypot(bSeen.x - quiet.bx, bSeen.z - quiet.bz) < 0.8 && bSeen.health === 100, bSeen);
await aimAt(A, bSeen.chest);
await frames(A, 3);
const overB = await A.page.evaluate(() => { const n = window.__nlw; return { look: n.gunPlay.look ? { what: n.gunPlay.look.what, kind: n.gunPlay.look.target && n.gunPlay.look.target.kind, able: n.gunPlay.look.target && n.gunPlay.look.target.able } : null, hud: n.gunPlay.hud.state() }; });
check('E: the aim over B: red (someone who can be shot), their name and life over the aim', overB.look && overB.look.what === 'person' && overB.look.kind === 'player' && overB.hud.kind === 'hostile' && !!overB.hud.target && overB.hud.target.name === B.username, overB);
await A.shot('the-aim-on-the-other-player');
const bBefore = await B.page.evaluate(() => { const n = window.__nlw; return { health: n.view.self.health, blood: n.gunPlay.blood.state(), heard: n.audio.gunState('rifle'), peerShots: n.gunPlay.stats.peerShots, struck: n.gunPlay.stats.struck }; });
// (the blood on B's screen watched frame by frame: a hit's splash lasts a moment)
await B.page.evaluate(() => { const n = window.__nlw, m = { hit: 0, base: 0, shown: false, splashes: 0 }; window.__bloodMax = m; window.__bloodStop = false; const f = () => { const b = n.gunPlay.blood.state(); m.hit = Math.max(m.hit, b.hit); m.base = Math.max(m.base, b.base); m.shown = m.shown || b.shown; m.splashes = Math.max(m.splashes, b.splashes); if (!window.__bloodStop) requestAnimationFrame(f); }; requestAnimationFrame(f); });
const aBefore = await A.page.evaluate(() => ({ ...window.__nlw.gunNet.stats, codes: { ...window.__nlw.gunNet.stats.codes }, confirmed: window.__nlw.gunPlay.stats.confirmed }));
await A.page.evaluate(() => { window.__shots = []; });
// (someone the server has not heard of lately is not a target, NOT_A_TARGET. Two pages drawn in software beside it, B's
// words can come further apart than its eight seconds, and the rounds told in a later word are then refused: 26
// October, two hits agreed of six. Each burst is fired just after a word of B's, and if fewer than three hits were
// agreed, another, up to three in all.)
let firedE = 0, burstsAtB = 0;
for (let k = 0; k < 3; k += 1) {
  await B.page.waitForFunction(() => { const l = window.__nlw.link; return !!l && l.quiet !== null && l.quiet < 1; }, null, { timeout: 60000 }).catch(() => {});
  firedE += await fireRounds(A, 5, { keepAim: bSeen.chest }); burstsAtB += 1;
  await told(A);
  if ((await A.page.evaluate(() => window.__nlw.gunNet.stats.hits)) - aBefore.hits >= 3) break;
}
const agreedSoFar = (await A.page.evaluate(() => window.__nlw.gunNet.stats.hits)) - aBefore.hits;
await A.page.waitForTimeout(3000);
// (B's game takes each agreed hit with its next words)
await B.page.waitForFunction(([n0, want]) => window.__nlw.gunPlay.stats.struck >= n0 + want, [bBefore.struck, Math.max(1, agreedSoFar)], { timeout: 90000 }).catch(() => {});
await B.page.waitForTimeout(4000);
const claimed = await A.page.evaluate(() => window.__shots.filter((s) => s.what === 'person').length);
const aAfter = await A.page.evaluate(() => ({ ...window.__nlw.gunNet.stats, codes: { ...window.__nlw.gunNet.stats.codes }, confirmed: window.__nlw.gunPlay.stats.confirmed }));
const bAfter = await B.page.evaluate(() => { const n = window.__nlw; window.__bloodStop = true; return { health: n.view.self.health, blood: n.gunPlay.blood.state(), most: window.__bloodMax, heard: n.audio.gunState('rifle'), peerShots: n.gunPlay.stats.peerShots, struck: n.gunPlay.stats.struck, ack: n.gunNet.ack, wounds: n.gunPlay.state.wounds.length, painted: !!n.me.woundMaterial }; });
const agreed = aAfter.hits - aBefore.hits;
const taken = bAfter.struck - bBefore.struck;
const refusedE = Object.fromEntries(Object.entries(aAfter.codes).map(([k, v]) => [k, v - (aBefore.codes[k] || 0)]).filter(([, v]) => v > 0));
// (B's life also comes back two points each game hour, out of a fight: two real minutes here)
const lost = bBefore.health - bAfter.health;
const refusedCount = Object.values(refusedE).reduce((a, b) => a + b, 0);
check('E: A fires five rounds at B: each hit A\'s game saw is decided by the server (agreed, or refused with its reason), and B\'s game takes each agreed hit once, a life point each (none taken twice, none lost)', firedE >= 5 && claimed >= 3 && agreed >= 3 && agreed + refusedCount === claimed && taken === agreed && [0, 2, 4].includes(agreed - lost), { fired: firedE, bursts: burstsAtB, claimed, agreed, refused: refusedE, taken, healthBefore: bBefore.health, healthAfter: bAfter.health });
check('E: A is shown each hit (the mark round the aim)', aAfter.confirmed - aBefore.confirmed === agreed, { marks: aAfter.confirmed - aBefore.confirmed, agreed });
check('E: B: blood on the screen with each hit, a little for a few hits (not all of it), and on the clothes where they were hit', bAfter.most.shown && bAfter.most.hit > 0.1 && bAfter.most.base < 0.2 && bAfter.wounds >= 1 && bAfter.painted, { most: bAfter.most, now: bAfter.blood, wounds: bAfter.wounds, painted: bAfter.painted });
let seenE = bAfter.peerShots - bBefore.peerShots, heardE = bAfter.heard.shots - (bBefore.heard.shots || 0), burstsE = 1;
// (A's rounds are in what A's game tells the others for three seconds. Two pages drawn in software beside the website's
// server, B's words can come further apart than that, and then none reach B: 25 October, the second batch's run. If
// so, another burst, at the ground in front of A, just after a word of B's; on a phone near someone with a gun out,
// the words come every third of a second.)
for (let k = 0; k < 3 && seenE < 3; k += 1) {
  await B.page.waitForFunction(() => { const l = window.__nlw.link; return !!l && l.quiet !== null && l.quiet < 1; }, null, { timeout: 60000 }).catch(() => {});
  const b0 = await B.page.evaluate(() => { const n = window.__nlw; return { seen: n.gunPlay.stats.peerShots, heard: n.audio.gunState('rifle').shots || 0 }; });
  const groundAhead = await A.page.evaluate(([x, z, h]) => { const n = window.__nlw; const gx = x + Math.sin(h) * 5, gz = z + Math.cos(h) * 5; return [gx, n.ground(gx, gz) + 0.02, gz]; }, [quiet.x, quiet.z, quiet.h]);
  await fireRounds(A, 4, { keepAim: groundAhead });
  await B.page.waitForFunction((s0) => window.__nlw.gunPlay.stats.peerShots >= s0 + 3, b0.seen, { timeout: 30000 }).catch(() => {});
  await B.page.waitForTimeout(1500);
  const b1 = await B.page.evaluate(() => { const n = window.__nlw; return { seen: n.gunPlay.stats.peerShots, heard: n.audio.gunState('rifle').shots || 0 }; });
  seenE = b1.seen - b0.seen; heardE = b1.heard - b0.heard; burstsE += 1;
}
await told(A);
check('E: B sees A\'s rounds and hears each one (the owner\'s recording, from where A is)', seenE >= 3 && heardE === seenE, { fired: firedE, seen: seenE, heard: heardE, bursts: burstsE, sound: bAfter.heard.state });
await B.shot('hit');
await A.page.waitForFunction(([name, health]) => { const q = window.__nlw.shownPeers.find((o) => o.name === name); return q && (q.wounds || []).length > 0 && q.health === health; }, [B.username, bAfter.health], { timeout: 45000 }).catch(() => {});
const aSeesWounds = await A.page.evaluate((name) => { const n = window.__nlw; const q = n.shownPeers.find((o) => o.name === name); const rig = q && n.crowd.rigOf(`p:${q.id}`); return { wounds: q ? (q.wounds || []).length : 0, painted: !!(rig && rig.woundMaterial), health: q && q.health }; }, B.username);
check('E: A sees the blood on B\'s clothes where B was hit, and B\'s life down', aSeesWounds.wounds >= 1 && aSeesWounds.painted && aSeesWounds.health === bAfter.health, aSeesWounds);
await A.shot('the-other-player-hit');
const forgivenE = await forgive(A);
check('E: A is reported for it by the one shot (wanted: the law of the town); the test lets it lapse here', forgivenE.lapsed >= 1, forgivenE);

// behind a wall: B stands on the far side of a building from A
const cover = await A.page.evaluate(() => {
  const n = window.__nlw, g = n.host.game;
  const y = (x, z) => n.ground(x, z) + 1.3;
  for (const [cx, cz] of [[30, 13], [64, 12], [46, -19], [48, -60], [-33, 98]]) {
    for (let r = 4; r <= 26; r += 2) for (let k = 0; k < 24; k += 1) {
      const a = (k / 24) * Math.PI * 2, x0 = cx + Math.cos(a) * r, z0 = cz + Math.sin(a) * r;
      if (!n.walkable(x0, z0)) continue;
      for (let j = 0; j < 16; j += 1) {
        const h = (j / 16) * Math.PI * 2, d = [Math.sin(h), 0, Math.cos(h)];
        const hit = g.aimAt([x0, y(x0, z0), z0], d, 30, n.playerId);
        if (hit.what !== 'wall' || hit.at < 3 || hit.at > 10) continue;
        for (let b = hit.at + 1.5; b < 24; b += 0.5) {
          const bx = x0 + d[0] * b, bz = z0 + d[2] * b;
          if (!n.walkable(bx, bz)) continue;
          if (Math.abs(n.ground(bx, bz) - n.ground(x0, z0)) > 0.5) break;
          // (and from the very point B stands, nothing but that wall between: the line from A meets it first)
          return { x: x0, z: z0, h, bx, bz, wallAt: hit.at, b };
        }
      }
    }
  }
  return null;
});
check('E: a wall to stand behind', !!cover, cover);
await place(A, cover.x, cover.z, cover.h);
await place(B, cover.bx, cover.bz, cover.h + Math.PI);
await A.page.waitForFunction(([name, x, z]) => { const q = window.__nlw.shownPeers.find((o) => o.name === name); return q && Math.hypot(q.x - x, q.z - z) < 0.6; }, [B.username, cover.bx, cover.bz], { timeout: 90000 }).catch(() => {});
await frames(A, 4);
const hidden = await other(A, B.username);
await aimAt(A, hidden.chest);
await frames(A, 3);
const overWall = await A.page.evaluate(() => { const n = window.__nlw; return { look: n.gunPlay.look ? { what: n.gunPlay.look.what, at: n.gunPlay.look.at } : null, kind: n.gunPlay.hud.state().kind }; });
const wHealth0 = await B.page.evaluate(() => window.__nlw.view.self.health);
const wNet0 = await A.page.evaluate(() => ({ ...window.__nlw.gunNet.stats, codes: { ...window.__nlw.gunNet.stats.codes } }));
await A.page.evaluate(() => { window.__shots = []; });
await fireRounds(A, 3, { keepAim: hidden.chest });
await told(A);
await A.page.waitForTimeout(3000);
const wShots = await A.page.evaluate(() => window.__shots);
const wHealth1 = await B.page.evaluate(() => window.__nlw.view.self.health);
const wNet1 = await A.page.evaluate(() => ({ ...window.__nlw.gunNet.stats, codes: { ...window.__nlw.gunNet.stats.codes } }));
check('E: B behind a wall: the aim is on the wall, the rounds stop at it, and B is not hit', overWall.look && overWall.look.what === 'wall' && overWall.look.at < cover.b && wShots.length >= 3 && wShots.every((s) => s.what === 'wall') && wHealth1 >= wHealth0 && wNet1.hits === wNet0.hits, { overWall, shots: wShots.map((s) => s.what), health: [wHealth0, wHealth1] });
await A.shot('the-other-player-behind-a-wall');
// a game changed to cheat: a hit on B claimed through the wall, a hit claimed where B is not, rounds faster than the gun.
// (The server first wants B heard of in the last few seconds, and refuses a claim on someone it has not heard of lately
// as NOT_A_TARGET, before it looks for a wall. With two pages drawn in software beside it, this machine's words can come
// further apart than that: the two claims are then made again, just after a word of B's, until the server has looked.)
const forgeOnce = (fast) => A.page.evaluate(([chest, peer, fast]) => {
  const n = window.__nlw, m = n.gunPlay.state.gun.point('muzzle'), o = [m.x, m.y, m.z];
  const d = [chest[0] - o[0], chest[1] - o[1], chest[2] - o[2]], L = Math.hypot(...d);
  // (timed just after the last round really fired: the rounds after them are timed later still)
  const t = n.gunPlay.state.clock + 0.1;
  n.gunNet.fire({ t, gun: 'rifle', o, d: d.map((v) => v / L), hit: { who: peer, at: chest } });
  n.gunNet.fire({ t: t + 0.2, gun: 'rifle', o, d: d.map((v) => v / L), hit: { who: peer, at: [chest[0] + 40, chest[1], chest[2] + 40] } });
  if (fast) for (let k = 0; k < 6; k += 1) n.gunNet.fire({ t: t + 0.4, gun: 'rifle', o, d: d.map((v) => v / L) });
  return true;
}, [hidden.chest, hidden.peer, fast]);
const codesOf = () => A.page.evaluate(() => ({ ...window.__nlw.gunNet.stats.codes }));
let forged = 0, staleB = 0;
for (let k = 0; k < 5; k += 1) {
  await B.page.waitForFunction(() => { const l = window.__nlw.link; return !!l && l.quiet !== null && l.quiet < 1; }, null, { timeout: 60000 }).catch(() => {});
  const before = await codesOf();
  if (await forgeOnce(k === 0)) forged += 1;
  await told(A);
  await A.page.waitForTimeout(3000);
  const after = await codesOf();
  if (!((after.NOT_A_TARGET || 0) > (before.NOT_A_TARGET || 0))) break;
  staleB += 1;
}
const fNet = await A.page.evaluate(() => ({ ...window.__nlw.gunNet.stats, codes: { ...window.__nlw.gunNet.stats.codes } }));
const fHealth = await B.page.evaluate(() => window.__nlw.view.self.health);
const codeGain = (c) => (fNet.codes[c] || 0) - (wNet1.codes[c] || 0);
check('E: a game changed to cheat is refused by the server: a hit claimed through the wall (WALL), one claimed where B is not (NOT_THERE or OFF_LINE), rounds faster than the gun fires (RATE); B is not hit', forged > 0 && codeGain('WALL') === 1 && codeGain('NOT_THERE') + codeGain('OFF_LINE') === 1 && codeGain('RATE') >= 5 && fHealth >= wHealth1 && fNet.hits === wNet1.hits, { gained: Object.fromEntries(Object.keys(fNet.codes).map((c) => [c, codeGain(c)])), health: [wHealth1, fHealth], tries: forged, notHeardOfLately: staleB });
// the counts: what the server says goes (the cheat's rounds were counted by it)
await A.page.waitForTimeout(2500);
const cheatCount = await gunOf(A);
const cheatServer = (await serverGuns(A)).guns.find((g) => g.id === 'rifle');
check('E: the rounds in the gun are what the server counted', cheatCount.mag === cheatServer.mag && cheatCount.spare === cheatServer.spare, { town: cheatCount, server: cheatServer });

// ---- F: the 20-life rule ----
try {
await forgive(A);
await place(A, quiet.x, quiet.z, quiet.h);
await place(B, quiet.bx, quiet.bz, quiet.h + Math.PI);
await draw(B);
// (what B is told, kept as it is shown: a notice goes again after a few seconds)
await B.page.evaluate(() => { window.__told = []; new MutationObserver(() => { for (const e of document.querySelectorAll('#notices > *')) { const t = e.textContent.replace(/\s+/g, ' ').trim(); if (!window.__told.includes(t)) window.__told.push(t); } }).observe(document.querySelector('#notices'), { childList: true, subtree: true, characterData: true }); });
await B.page.evaluate(() => { const n = window.__nlw; n.host.game.state.players[n.playerId].health = 22; });
await A.page.waitForFunction(([name, x, z]) => { const q = window.__nlw.shownPeers.find((o) => o.name === name); return q && q.health <= 24 && Math.hypot(q.x - x, q.z - z) < 1; }, [B.username, quiet.bx, quiet.bz], { timeout: 180000 }).catch(() => {});
const b22 = await other(A, B.username);
if (!b22) throw new Error('A does not see B back at the line');
await aimAt(A, b22.chest);
const fBefore = await B.page.evaluate(() => ({ blood: window.__nlw.gunPlay.blood.state(), out: window.__nlw.gunPlay.out }));
await fireRounds(A, 6, { keepAim: b22.chest, most: 90000 });
await told(A);
await B.page.waitForFunction(() => window.__nlw.view.self.health <= 20, null, { timeout: 90000 }).catch(() => {});
// (B as it is at 20, at once: the ambulance sent for B may come and carry B off before A has heard of it)
await B.page.waitForTimeout(1500);
const at20 = await B.page.evaluate(() => {
  const n = window.__nlw;
  const gunPad = [...document.querySelectorAll('#pad .pad')].find((b) => b.dataset.id === 'gun');
  return { health: n.view.self.health, critical: !!n.view.self.critical, out: n.gunPlay.out, mode: n.mode, gunPad: gunPad ? { off: gunPad.disabled } : null, limp: !!n.me.limp, told: window.__told, blood: n.gunPlay.blood.state(), drawn: n.server.send({ type: 'gun.draw' }) };
});
await B.shot('at-20');
await place(A, quiet2.x, quiet2.z, quiet2.h);
await place(B, quiet2.bx, quiet2.bz, quiet2.h + Math.PI);
await A.page.waitForFunction(([name, x, z]) => { const q = window.__nlw.shownPeers.find((o) => o.name === name); return q && q.health === 20 && Math.hypot(q.x - x, q.z - z) < 1; }, [B.username, quiet2.bx, quiet2.bz], { timeout: 240000 }).catch(() => {});
// A's aim over B, and A's rounds at B
const bDown = await other(A, B.username);
await aimAt(A, bDown.chest);
await frames(A, 3);
const overDown = await A.page.evaluate(() => { const n = window.__nlw; return { kind: n.gunPlay.hud.state().kind, target: n.gunPlay.hud.state().target }; });
await A.page.evaluate(() => { window.__shots = []; });
const net20 = await A.page.evaluate(() => ({ ...window.__nlw.gunNet.stats }));
await fireRounds(A, 3, { keepAim: bDown.chest });
await told(A);
await A.page.waitForTimeout(2500);
const after20 = await A.page.evaluate(() => ({ shots: window.__shots.map((s) => s.what), net: { ...window.__nlw.gunNet.stats } }));
const stillB = await B.page.evaluate(() => window.__nlw.view.self.health);
await A.shot('the-aim-over-someone-at-20');
check('F: shot down to 20 and no lower, however many rounds are fired at them', at20.health === 20 && stillB === 20, { health: at20.health, later: stillB });
check('F: the aim over someone at 20 is green (they cannot be shot), and rounds go past them: none strikes them, nothing is claimed', overDown.kind === 'friendly' && !!overDown.target && overDown.target.down && after20.shots.length >= 3 && !after20.shots.includes('person') && after20.net.hits === net20.hits && stillB === 20, { overDown, shots: after20.shots, health: stillB });
check('F: at 20: the gun put away and cannot be taken out (its button greyed), a limp, and told "You are badly hurt. An ambulance is on its way." (or, the ambulance out on another call, that one will come as soon as it can)', fBefore.out && !at20.out && at20.mode !== 'gun' && !!at20.gunPad && at20.gunPad.off && !at20.drawn.ok && at20.limp && at20.told.some((t) => /You are badly hurt\. An ambulance (is on its way|will come for you as soon as one can)\./.test(t)), { before: fBefore.out, out: at20.out, mode: at20.mode, pad: at20.gunPad, limp: at20.limp, told: at20.told, drawn: at20.drawn.code });
check('F: the blood on the screen at its most at 20 (the edges red, the splashes), more than after a few hits', at20.blood.shown && at20.blood.base > 0.9 && at20.blood.splashes >= 4 && at20.blood.base > fBefore.blood.base, { at20: at20.blood, before: fBefore.blood });

// (B goes on, out of the ambulance's way, to heal)
await B.page.evaluate(([x, z]) => window.__nlw.place(x, z), [quiet2.bx + 40, quiet2.bz]);
// healing: the blood fades as the health comes back, and is gone at 100
await B.page.evaluate(() => { const n = window.__nlw; n.host.game.state.players[n.playerId].health = 60; });
await B.page.waitForTimeout(6000);
const at60 = await B.page.evaluate(() => window.__nlw.gunPlay.blood.state());
await B.page.evaluate(() => { const n = window.__nlw; n.host.game.state.players[n.playerId].health = 100; });
await B.page.waitForFunction(() => !window.__nlw.gunPlay.blood.state().shown, null, { timeout: 60000 }).catch(() => {});
const at100 = await B.page.evaluate(() => ({ blood: window.__nlw.gunPlay.blood.state(), wounds: window.__nlw.gunPlay.state.wounds.length, painted: !!window.__nlw.me.woundMaterial }));
check('F: healed: the blood on the screen fades as the health comes back (less at 60), and is all gone at 100, from the clothes too', at60.base < at20.blood.base && at60.base > 0.2 && !at100.blood.shown && at100.blood.base === 0 && at100.wounds === 0 && !at100.painted, { at60, at100 });
// Reduce intense effects
await B.page.evaluate(() => window.__nlw.ui.openPhone('settings'));
await B.page.waitForSelector('#calm-on');
await B.page.tap('#calm-on');
await B.page.evaluate(() => window.__nlw.ui.close());
await B.page.evaluate(() => { const n = window.__nlw; n.host.game.state.players[n.playerId].health = 30; });
await B.page.waitForTimeout(5000);
const calm = await B.page.evaluate(() => ({ blood: window.__nlw.gunPlay.blood.state(), calm: JSON.parse(localStorage.getItem('nlw-prefs-v1') || '{}').calm }));
check('F: "Reduce intense effects" (Settings): no splashes, the red at the edges fainter, kept as the player\'s choice', calm.blood.shown && calm.blood.splashes === 0 && calm.blood.edge <= 0.45 && calm.calm === true, calm);
await B.page.evaluate(() => { const n = window.__nlw; n.host.game.state.players[n.playerId].health = 100; });
} catch (error) { check('F: the 20-life rule and the blood, run to the end', false, `${error.message}`.slice(0, 300)); }

const lawA = await A.page.evaluate(() => { const n = window.__nlw; return n.host.game.internals.justice.lawOf(n.host.game.state.players[n.playerId]).state; });
check('A was never taken by the police during the test (each shooting let lapse before they came)', lawA !== 'arrested' && lawA !== 'custody', lawA);
await forgive(A);

// ---- the phone at the busiest places, the gun out (and fired at the sky, near nobody), at Medium (Auto's choice on a phone) ----
await B.page.evaluate(() => window.__nlw.setGraphics('medium'));
const memory = {};
for (const [name, x, z, fire] of [['PowerBike showroom', -63.6, 64, false], ['motor park', -33, 98, true]]) {
  await B.page.evaluate(([x, z]) => { const n = window.__nlw; n.place(x, z); }, [x, z]);
  await B.page.waitForTimeout(500);
  if (!(await B.page.evaluate(() => window.__nlw.gunPlay.out))) await Promise.race([draw(B), new Promise((r) => setTimeout(r, 60000))]).catch(() => {});
  if (fire) {
    await B.page.evaluate(() => { const n = window.__nlw; n.cam.pitch = -0.7; n.gunPlay.act('shoot', 'down'); });
    await B.page.waitForTimeout(2500);
    await B.page.evaluate(() => window.__nlw.gunPlay.act('shoot', 'up'));
  }
  await B.page.evaluate(() => { window.__nlw.cam.pitch = 0.05; });
  await frames(B, 6);
  await B.page.waitForFunction(() => window.__nlw.levelState.picturesWaiting === 0, null, { timeout: 90000 }).catch(() => {});
  await frames(B, 4);
  memory[name] = await B.page.evaluate(() => { const g = window.__nlw.graphics; return { MB: +(((g.pictures || 0) + (g.buffers || 0)) / 1048576).toFixed(1), out: window.__nlw.gunPlay.out, fired: window.__nlw.gunPlay.stats.fired, level: window.__nlw.quality }; });
  await B.shot(`phone-at-the-${name.replace(/ /g, '-')}`);
}
check('the phone keeps under 150 MB on its graphics card at the busiest places of the town, with the gun out and fired', Object.values(memory).every((m) => m.MB < 150 && m.out), memory);

// ---- A: kept by the account: the counts the same on another device ----
await told(A);
await A.page.waitForTimeout(2000);
const keptServer = (await serverGuns(A)).guns.find((g) => g.id === 'rifle');
const keptTown = await gunOf(A);
await A.page.evaluate(() => localStorage.clear());
await A.page.reload({ timeout: 300000 });
await A.page.waitForFunction(() => window.__nlw && window.__nlw.playing && window.__nlw.view && window.__nlw.view.self && window.__nlw.view.self.gun && window.__nlw.view.self.gun.server, null, { timeout: 360000 }).catch(() => {});
await A.page.waitForTimeout(2000);
const again = await gunOf(A);
check('A: kept by the account: opened again on another device, the rifle and its rounds as the server has them (as they were)', again.server && again.equipped === 'rifle' && again.mag === keptServer.mag && again.spare === keptServer.spare && keptTown.mag === keptServer.mag, { before: keptTown, server: keptServer, again });
const balance1 = await A.page.evaluate(() => window.__nlw.view.self.balance);
check('A: no TR taken for the rifle or its rounds, all along', balance1 === balance0, { before: balance0, after: balance1 });
await draw(A);
await A.page.keyboard.press('g');
await A.page.waitForSelector('#gun-switch:not([hidden])', { timeout: 30000 }).catch(() => {});
const panel = await A.page.evaluate(() => ({ rows: [...document.querySelectorAll('#gun-switch .gun')].map((r) => ({ gun: r.dataset.gun, here: r.classList.contains('here'), locked: r.classList.contains('locked'), act: r.querySelector('button') ? { text: r.querySelector('button').textContent, off: r.querySelector('button').disabled } : null })), shop: (document.querySelector('#gun-switch .shop') || {}).textContent }));
check('A: the guns panel (G): the rifle in the player\'s hands; where more guns will be sold', panel.rows.length >= 1 && panel.rows[0].gun === 'rifle' && panel.rows[0].here && !panel.rows[0].locked && panel.rows[0].act && panel.rows[0].act.off && /sold/.test(panel.shop || ''), panel);
const notOwned = await A.page.evaluate(() => window.__nlw.server.send({ type: 'gun.equip', gun: 'pistol' }));
check('A: a gun the player does not own cannot be taken in hand', !notOwned.ok, notOwned);
await A.shot('the-guns-panel');

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed} of ${results.length} passed`);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
