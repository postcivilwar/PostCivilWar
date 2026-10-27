// Trouble with the town's people, as the game draws it (27 October 2026, the owner's brief): one of his townspeople shot
// (falls, lies, gets up, runs; blood), another struck once (runs) and again (fights back, gives up, goes), one brought
// to 20 (limps, sits), the moods about the town, and gunfire frightening those near. Pictures of each moment, and what
// the figure was playing then, written to <out folder>/trouble.json.
//   ../server/with-postgres.sh node tools/npcs/trouble.mjs <out folder> [site folder] [phone|computer]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, existsSync, statSync, createReadStream } from 'node:fs';
import { resolve, extname, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const { pastQuestion } = await import(`${ROOT}/prototype/test/start.mjs`);
const out = resolve(process.argv[2] || '/tmp/intown'); mkdirSync(out, { recursive: true });
const SITE = resolve(process.argv[3] || `${ROOT}/prototype/dist/site`);
const PHONE = (process.argv[4] || 'computer') === 'phone';
const HOW_MANY = Number(process.argv[5]) || 10;
const game = require(`${ROOT}/api/game.js`);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.gz': 'application/gzip', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
const server = createServer((req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  if (path === '/api/game') { game(req, res); return; }
  const file = resolve(SITE, `.${path === '/' ? '/index.html' : path}`);
  if (!(file === SITE || file.startsWith(SITE + sep)) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('Not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Content-Length': statSync(file).size, 'Cache-Control': 'no-cache' });
  if (req.method === 'HEAD') { res.end(); return; }
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext(PHONE ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' } : { viewport: { width: 800, height: 450 }, serviceWorkers: 'block' });
const page = await context.newPage();
page.setDefaultTimeout(900000);
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); console.log('PAGE ERROR', e.message); });
await page.goto(`${origin}/#gameclock${PHONE ? '-lite' : ''}`, { timeout: 900000 });
await page.waitForSelector('#cover-play', { state: 'visible', timeout: 900000 });
await page.evaluate(() => document.getElementById('cover-play').click());
await page.waitForSelector('#open-signup', { state: 'visible', timeout: 900000 });
await page.click('#open-signup');
await page.fill('#account-username', `Look_${Math.random().toString(36).slice(2, 7)}`);
await page.fill('#account-password', 'a password for looking');
await page.click('#account-submit');
await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 180000 });
await pastQuestion(page);
await page.fill('#name', 'Look');
await page.click('#enter');
await page.waitForSelector('#confirm:not([hidden])', { timeout: 180000 });
await page.click('#confirm-yes');
await page.waitForFunction(() => !document.querySelector('#hud').hidden && window.__nlw.view && window.__nlw.me && window.__nlw.me.mixer, null, { timeout: 900000 });
// late morning, clear: everyone on their way about the town
await page.evaluate(() => { const n = window.__nlw, g = n.host.game; const hour = n.view.clock.hourFloat; n.skip(((24 + 10.5 - hour) % 24)); g.state.weather = { kind: 'clear', until: g.state.t + 24 * 3600 }; for (const id of ['toasts', 'notices']) { const t = document.getElementById(id); if (t) t.style.display = 'none'; } });
await page.waitForTimeout(4000);

const log = [];
const note = (what, x) => { log.push({ what, ...x }); console.log(what, JSON.stringify(x)); };
const shoot = async (name) => { await page.screenshot({ path: resolve(out, `${name}.png`) }); return `${name}.png`; };
// what the page draws of townsperson i: where, its clip, lying, limping, emoting
const drawn = (i) => page.evaluate((i) => {
  const n = window.__nlw, a = n.crowd.figureAt(i), g = n.host.game, m = g.internals.actors.get(i), rec = g.internals.conflict.record(i);
  const r = a && a.rig;
  return { act: m ? m.act : 'own day', pose: m ? m.pose : null, health: rec ? rec.health : 100, mood: rec ? rec.mood : 'calm',
    rig: r ? { animated: !!r.animated, figure: r.spec && r.spec.id, playing: r.mixer ? r.mixer._actions.filter((x) => x.isRunning() && x.getEffectiveWeight() > 0.3).map((x) => x._clip.name) : [], lying: !!r.lying, limp: !!r.limp, emoting: r.emoting ? r.emoting.name : null, speed: Number((r.speed || 0).toFixed(2)), wounds: r.wounds ? r.wounds.length : undefined } : null };
}, i);
// the camera on townsperson i, from the side at `dist`
const watch = (i, dist = 4.5, side = 1.2) => page.evaluate(({ i, dist, side }) => { const n = window.__nlw; n.cam.dist = dist; n.cam.pitch = 0.12; n.cam.lastDrag = 1e9; window.__track = i; window.__side = side; if (!window.__tracking) { window.__tracking = true; const f = () => { const b = n.crowd.figureAt(window.__track); if (b && !window.__aiming) { n.cam.free = { x: b.x, y: 0.9, z: b.z }; n.cam.yaw = (b.h || 0) + window.__side; } requestAnimationFrame(f); }; f(); } }, { i, dist, side });
// a townsperson out now, not police, held standing where they are, the player put `metres` off facing them
const pick = (skip, metres, timid = false) => page.evaluate(({ skip, metres, timid }) => {
  const n = window.__nlw, g = n.host.game, pop = g.internals.population, A = g.internals.actors;
  for (const p of pop.people) {
    if (p.job === 'police' || skip.includes(p.index) || (timid && g.internals.conflict.nerve(p.index) >= 0.75)) continue;
    const o = pop.locate(p.index, g.state.t, {});
    if (!o || o.pose === 4 || o.pose === 2) continue;
    const h = o.h || 0, px = o.x + Math.sin(h) * metres, pz = o.z + Math.cos(h) * metres;
    if (!g.internals.population || !window.__nlw.ground) continue;
    A.take(p.index, g.state.t); A.hold(p.index, 'Standing about', 0, g.state.real + 300);
    n.place(px, pz); const face = Math.atan2(o.x - px, o.z - pz); n.face(face);
    return { i: p.index, name: p.name, figure: p.look.figure, x: o.x, z: o.z };
  }
  return null;
}, { skip, metres, timid });
const figureUp = (i) => page.waitForFunction((i) => { const a = window.__nlw.crowd.figureAt(i); return a && a.rig && a.rig.animated && a.rig.mixer ? true : null; }, i, { timeout: 240000, polling: 500 }).then(() => true, () => false);
// the player put a metre in front of townsperson i, wherever the town has them now, facing them
const besides = (i) => page.evaluate((i) => { const n = window.__nlw, g = n.host.game, o = g.internals.population.locate(i, g.state.t, {}); const h = o.h || 0; const px = o.x + Math.sin(h) * 1.0, pz = o.z + Math.cos(h) * 1.0; n.place(px, pz); n.face(Math.atan2(o.x - px, o.z - pz)); const p = g.state.players[n.playerId]; p.energy = 80; p.health = Math.max(p.health, 80); }, i);
// (between the parts: the player's trouble with the police over, so that the next part is not an arrest; the
// checking machine's own doing, not the game's)
const cleanSlate = () => page.evaluate(() => { const n = window.__nlw, g = n.host.game, p = g.state.players[n.playerId], J = g.state.justice; for (const c of Object.values(J.crimes)) if (c.status === 'open') c.status = 'closed'; for (const k of Object.keys(J.officers || {})) { delete J.officers[k]; if (g.internals.actors.has(Number(k))) g.internals.actors.release(Number(k)); } p.law = null; p.custody = null; p.fight = null; });
const intent = (m) => page.evaluate((m) => { const n = window.__nlw; return n.host.game.intent(n.playerId, m); }, m);

const ONLY_SHOT = process.env.TROUBLE_ONLY === 'shot';
const pics = {};
let F = { i: -1 }, D = { i: -1 }, M = { i: -1 };
if (!ONLY_SHOT) {
// ---- 1. struck once, then again ----
await page.waitForTimeout(1000);
F = await pick([], 1.0, true);
note('fight: who', F);
await figureUp(F.i); await watch(F.i, 4.2, 1.3); await page.waitForTimeout(1200);
pics.fight = [await shoot('2-fight-before')];
await page.evaluate(() => window.__nlw.slow(0.25));
note('fight: engage', await intent({ type: 'combat.engage', target: { kind: 'npc', id: F.i } }));
note('fight: first blow', await intent({ type: 'combat.act', move: 'punch' }));
await page.waitForTimeout(1200);
pics.fight.push(await shoot('2-fight-runs')); note('fight: after the first', await drawn(F.i));
// caught up with (the player put beside them again), and struck again
await besides(F.i);
await page.waitForTimeout(700);
note('fight: second blow', await intent({ type: 'combat.act', move: 'punch' }));
await intent({ type: 'combat.disengage' });
const t0 = Date.now();
for (let k = 0; k < 4; k += 1) { await page.waitForTimeout(1300); pics.fight.push(await shoot(`2-fight-back-${k}`)); note(`fight: fighting ${k}`, await drawn(F.i)); }
await page.waitForFunction((i) => { const r = window.__nlw.host.game.internals.conflict.record(i); return r && r.mood !== 'fighting'; }, F.i, { timeout: 400000 });
note('fight: gave up after (real seconds, about)', { seconds: Math.round((Date.now() - t0) / 100) / 10 });
await page.waitForTimeout(1500);
pics.fight.push(await shoot('2-fight-goes')); note('fight: goes', await drawn(F.i));
await page.evaluate(() => window.__nlw.slow(1));

// ---- 3. brought to 20: limps, sits ----
await cleanSlate();
D = await pick([F.i], 1.0, true);
note('down: who', D);
await figureUp(D.i);
await intent({ type: 'combat.engage', target: { kind: 'npc', id: D.i } });
await besides(D.i);
note('down: first blow', await intent({ type: 'combat.act', move: 'punch' }));
await page.evaluate((i) => { const g = window.__nlw.host.game, r = g.internals.conflict.record(i); if (r) r.health = 24; }, D.i);
let down = null;
for (let k = 0; k < 25 && !down; k += 1) {
  // (already hurt from before: one heavy blow that lands brings them to 20)
  const r = await page.evaluate((i) => { const n = window.__nlw, g = n.host.game, o = g.internals.population.locate(i, g.state.t, {}); const h = o.h || 0; const px = o.x + Math.sin(h) * 0.9, pz = o.z + Math.cos(h) * 0.9; n.place(px, pz); n.face(Math.atan2(o.x - px, o.z - pz)); const p = g.state.players[n.playerId]; p.energy = 80; p.health = Math.max(p.health, 80); const rec = g.internals.conflict.record(i); if (rec && rec.health > 21) rec.health = 21; if (!p.fight) g.intent(n.playerId, { type: 'combat.engage', target: { kind: 'npc', id: i } }); return g.intent(n.playerId, { type: 'combat.act', move: 'heavy' }); }, D.i);
  note(`down: heavy ${k}`, { ok: r.ok, code: r.code, reaction: r.reaction, blocked: r.blocked, reason: r.reason });
  if ((r.ok && r.reaction === 'down') || (!r.ok && r.code === 'TARGET_DOWN')) down = r;
  await page.waitForTimeout(1300);
}
await intent({ type: 'combat.disengage' });
note('down: brought to 20', { down, health: (await drawn(D.i)).health });
await page.evaluate(() => { const n = window.__nlw; n.place(n.predicted.x + 8, n.predicted.z + 8); });
await watch(D.i, 4.5, 1.6);
pics.limp = [];
for (let k = 0; k < 3; k += 1) { await page.waitForTimeout(2500); pics.limp.push(await shoot(`3-limp-${k}`)); note(`down: limping ${k}`, await drawn(D.i)); }
await page.waitForFunction((i) => { const m = window.__nlw.host.game.internals.actors.get(i); return m && m.pose === 2; }, D.i, { timeout: 120000 }).catch(() => {});
await page.waitForTimeout(1500);
pics.limp.push(await shoot('3-sitting')); note('down: sitting', await drawn(D.i));

// ---- 4. moods about the town ----
await cleanSlate();
M = await pick([F.i, D.i], 4);
await figureUp(M.i); await watch(M.i, 3.6, 0.3);
pics.moods = [];
for (const mood of ['~dance', '~phone', '~stretch', '~talk', '~tired', '~wave']) {
  const ok2 = await page.evaluate(({ i, mood }) => { const a = window.__nlw.crowd.figureAt(i); return a && a.rig && a.rig.emote ? a.rig.emote(mood) : false; }, { i: M.i, mood });
  await page.waitForTimeout(1300);
  pics.moods.push(await shoot(`4-mood-${mood.slice(1)}`)); note(`mood ${mood}`, { played: ok2, ...(await drawn(M.i)) });
}
note('moods about town so far', await page.evaluate(() => ({ moods: window.__nlw.crowd.stats.moods || 0, reacted: window.__nlw.crowd.stats.reacted || 0 })));
}
// ---- 4. shot (last: the police come for the one who shot) ----
await cleanSlate();
const S = await pick([F.i, D.i, M.i], 7);
note('shot: who', S);
await figureUp(S.i); await watch(S.i); await page.waitForTimeout(1500);
pics.shot = [await shoot('1-shot-before')];
await page.keyboard.press('x');
await page.waitForFunction(() => { const n = window.__nlw; return n.gunPlay.out && n.gunPlay.state.gun && n.gunPlay.state.gun.ready && n.gunPlay.weight > 0.95; }, null, { timeout: 120000 });
await page.evaluate(() => { window.__aiming = true; const n = window.__nlw; n.cam.free = null; });
const chest = await page.evaluate((i) => { const a = window.__nlw.crowd.figureAt(i); return [a.x, window.__nlw.ground(a.x, a.z) + 1.25, a.z]; }, S.i);
for (let k = 0; k < 4; k += 1) { await page.evaluate((pt) => { const n = window.__nlw, o = n.gunPlay.aimFrom; const dx = pt[0] - o.x, dy = pt[1] - o.y, dz = pt[2] - o.z, d = Math.hypot(dx, dy, dz); n.cam.yaw = Math.atan2(dx, dz); n.cam.pitch = Math.asin(-dy / d); }, chest); await page.waitForTimeout(150); }
// (the town's clock slowed to a fifth while it is pictured: a picture takes seconds to draw on this machine)
await page.evaluate(() => window.__nlw.slow(0.2));
const fired0 = await page.evaluate(() => window.__nlw.gunPlay.stats.fired);
await page.keyboard.down('f');
await page.waitForFunction(({ f0, pt }) => { const n = window.__nlw, o = n.gunPlay.aimFrom; const dx = pt[0] - o.x, dy = pt[1] - o.y, dz = pt[2] - o.z, d = Math.hypot(dx, dy, dz); n.cam.yaw = Math.atan2(dx, dz); n.cam.pitch = Math.asin(-dy / d); return n.gunPlay.stats.fired > f0; }, { f0: fired0, pt: chest }, { timeout: 30000, polling: 16 });
await page.keyboard.up('f');
note('shot: fired', { hits: await page.evaluate(() => window.__nlw.gunPlay.stats.hits) });
note('shot: at once', await page.evaluate((i) => { const n = window.__nlw, a = n.crowd.figureAt(i), r = a && a.rig; if (!r) return null; const v = new n.THREE.Vector3(); const hips = r.bones && (r.bones.get('pelvis') || r.bones.get('mixamorigHips')); if (hips) hips.getWorldPosition(v); let shown = true; for (let o = r.mesh; o; o = o.parent) if (!o.visible) shown = false; return { pose: a.pose, fall: a.fall, inFallen: (n.view.fallen || []).includes(i), group: r.group.position.toArray().map((x) => +x.toFixed(2)), body: r.body.position.toArray(), lying: r.lying, hips: v.toArray().map((x) => +x.toFixed(2)), shown, inScene: !!r.group.parent }; }, S.i));
await page.evaluate(() => { window.__aiming = false; });
await page.keyboard.press('x');
await watch(S.i, 4.5, 1.4);
// (the body through it: the sim's time since the shot, its pose, the hips' height, how far down it is drawn; a picture
// at each of these moments of the town's own clock: on the ground, getting up, running)
const real0 = await page.evaluate(() => window.__nlw.host.game.state.real);
const want = [[1.2, 'falling'], [2.4, 'lying'], [4.4, 'getting-up'], [7.5, 'running']];
const track = [];
for (let k = 0; k < 400 && want.length; k += 1) {
  const at = await page.evaluate(({ i, real0 }) => { const n = window.__nlw, a = n.crowd.figureAt(i), r = a && a.rig, g = n.host.game; const v = new n.THREE.Vector3(); const hips = r && r.bones && (r.bones.get('pelvis') || r.bones.get('mixamorigHips')); if (hips) hips.getWorldPosition(v); const m = g.internals.actors.get(i); return { t: +(g.state.real - real0).toFixed(2), act: m ? m.act : '', hips: +v.y.toFixed(2), fall: a ? +(a.fall || 0).toFixed(2) : null, lying: !!(r && r.lying) }; }, { i: S.i, real0 });
  track.push(at);
  if (at.t >= want[0][0]) { const [, name] = want.shift(); pics.shot.push(await shoot(`1-shot-${name}`)); note(`shot: ${name}`, { ...at, ...(await drawn(S.i)) }); }
  await page.waitForTimeout(150);
}
note('shot: the body through it', { track: track.filter((x, k) => k % 3 === 0) });
await page.evaluate(() => window.__nlw.slow(1));
note('shot: blood on the ground', { pools: await page.evaluate((i) => (window.__nlw.view.blood || []).filter((b) => b.key === `n:${i}`).length, S.i) });
note('shot: frightened about', { running: await page.evaluate(() => window.__nlw.host.game.internals.actors.all().filter((m) => /gunfire|Cowering/.test(m.act)).length) });

writeFileSync(resolve(out, 'trouble.json'), JSON.stringify({ errors, log, pics }, null, 1));
await browser.close(); server.close(); process.exit(0);
