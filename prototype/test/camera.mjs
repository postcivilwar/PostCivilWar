// The camera on the street as a player sees it (19 October 2026, the owner's brief and his video of the classic
// open-world game on a phone), through every case the brief lists: standing, walking forward and toward the camera,
// turning left and right, running, running while turning, the View button, dragging, a wall behind at four distances,
// another player, a phone upright and on its side. For each a screenshot, and where the figure and the horizon are in
// the picture (shares of its height from the top: in the owner's recording, walking, the top of the head at 0.43, the
// feet at 0.80, the horizon at 0.42).
// Since 30 October 2026 (the owner's brief and his second video, of the classic open-world game on a phone: "the main
// character is shown big on the screen"), closer: the top of the head a little over a third of the way down, the feet
// near the foot of the picture, the horizon a little above the middle; and the mouse's wheel (two fingers pinched on a
// touch screen, touch.mjs) brings it nearer and takes it further.
//   node test/camera.mjs [shots folder]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pastQuestion, enterTown } from './start.mjs';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || '/tmp/camera-shots';
mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); };
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
// (the shape of the owner's recording, a phone on its side)
const page = await browser.newPage({ viewport: { width: 1200, height: 540 } });
page.setDefaultTimeout(300000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`file://${resolve(root, 'dist/local.html')}#nointro-gameclock`, { timeout: 300000 });
await pastQuestion(page);
await page.fill('#name', 'Camera Look').catch(() => {});
await enterTown(page);
await page.waitForFunction(() => window.__nlw.me && window.__nlw.me.mixer, null, { timeout: 240000 });
await page.evaluate(() => { const n = window.__nlw; const hour = n.view.clock.hourFloat; if (hour < 9 || hour > 16) n.skip((24 + 11 - hour) % 24); });
await page.waitForTimeout(3000);

// where the top of the figure's head, its feet and the horizon are in the picture; how far back and how high the eye
// is; the lens; which way the player and the camera face; the sway
const state = () => page.evaluate(() => {
  const n = window.__nlw, c = n.camera, me = n.me, p = n.predicted || n.view.self;
  const v = new THREE.Vector3();
  const share = (x, y, z) => { v.set(x, y, z).project(c); return +((1 - v.y) / 2).toFixed(3); };
  const g = n.ground(p.x, p.z);
  const head = me.bones && me.bones.get('head') ? me.bones.get('head').getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(p.x, g + 1.6, p.z);
  const fwd = new THREE.Vector3(); c.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  const far = c.position.clone().addScaledVector(fwd, 5000);
  return {
    view: n.rig.view, fov: +c.fov.toFixed(1),
    back: +Math.hypot(c.position.x - p.x, c.position.z - p.z).toFixed(2), up: +(c.position.y - g).toFixed(2),
    head: share(head.x, head.y + 0.12, head.z), feet: share(p.x, g, p.z), horizon: share(far.x, c.position.y, far.z),
    heading: +p.heading.toFixed(3), yaw: +n.cam.yaw.toFixed(3), sway: +(n.rig.live.sway || 0).toFixed(3),
  };
});
const seen = {};
async function shot(name) {
  const s = await state();
  await page.screenshot({ path: resolve(out, `${name}.png`) });
  seen[name] = s;
  return s;
}
const keys = async (down, ms) => { for (const k of down) await page.keyboard.down(k); await page.waitForTimeout(ms); };
const up = async (list) => { for (const k of list) await page.keyboard.up(k); };
const gap = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const framed = (s) => s.head > 0.28 && s.head < 0.45 && s.feet > 0.84 && s.feet < 0.98 && s.horizon > 0.3 && s.horizon < 0.45;

const standing = await shot('01-standing');
check('the game starts on the street view: close behind (under 3 m), the eye about the height of the head, the 58° lens', standing.view === 'street' && standing.fov === 58 && standing.back > 2.3 && standing.back < 3.1 && standing.up > 1.4 && standing.up < 2.0, standing);
check('the figure big in the lower middle of the picture and the street ahead above it, as in the owner\'s second video (head about 0.36, feet about 0.92, horizon about 0.37)', framed(standing), { head: standing.head, feet: standing.feet, horizon: standing.horizon });
await keys(['w'], 2500);
const walking = await shot('02-walking');
check('walking, the same: close behind and framed alike', walking.view === 'street' && framed(walking) && Math.abs(walking.back - standing.back) < 0.3, walking);
await keys(['a'], 1500);
const left = await shot('03-walking-turning-left'); await up(['a']);
await keys(['d'], 1500);
const right = await shot('04-walking-turning-right'); await up(['d']);
check('turning, the eye swings a little to the outside of the turn, one way for a turn to the left and the other for a turn to the right, at most a fifth of a metre and a little', Math.abs(left.sway) > 0.03 && Math.abs(right.sway) > 0.03 && Math.sign(left.sway) !== Math.sign(right.sway) && Math.abs(left.sway) <= 0.22 && Math.abs(right.sway) <= 0.22, { left: left.sway, right: right.sway });
await up(['w']); await keys(['s'], 2000);
const toward = await shot('05-walking-toward-the-camera'); await up(['s']);
check('walking toward the camera, it does not swing round behind: the player is seen coming, face on', Math.abs(gap(toward.yaw + Math.PI, toward.heading)) < 0.6 && framed(toward), toward);
await keys(['w', 'Shift'], 2500);
const running = await shot('06-running');
check('running, it comes in no more than a step closer and no higher', running.back < standing.back - 0.03 && running.back > standing.back - 0.45 && running.up <= standing.up + 0.03, { running: [running.back, running.up], standing: [standing.back, standing.up] });
await keys(['a'], 1200);
const runTurn = await shot('07-running-turning'); await up(['a', 'Shift', 'w']);
check('running while turning, it follows round with a little lag and sway, the figure still in the picture', runTurn.head > 0.2 && runTurn.feet < 1 && Math.abs(runTurn.sway) <= 0.22, runTurn);
await page.waitForTimeout(2500);
const stopped = await shot('08-stopped');
check('stopped again, it settles back out behind, with no sway left', Math.abs(stopped.sway) < 0.03 && Math.abs(stopped.back - standing.back) < 0.35 && Math.abs(gap(stopped.yaw, stopped.heading)) < 0.35, stopped);
// the View button: round the views and back
const round = [];
for (const [i, name] of [[9, 'behind'], [10, 'shoulder'], [11, 'high'], [12, 'street']]) {
  await page.keyboard.press('c'); await page.waitForTimeout(1800);
  round.push((await shot(`${String(i).padStart(2, '0')}-view-${name}`)).view);
}
check('the View button on foot: further back, over the shoulder, from above, and back to the street', JSON.stringify(round) === JSON.stringify(['behind', 'shoulder', 'high', 'street']), round);
// dragging it round with the mouse; walking on, it comes round behind again
const box = await page.locator('canvas').first().boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 - 260, box.y + box.height / 2, { steps: 8 }); await page.mouse.up();
await page.waitForTimeout(600);
const dragged = await shot('13-dragged');
await keys(['w'], 2500); await up(['w']); await page.waitForTimeout(1500);
const after = await shot('14-walked-after-drag');
check('dragging turns it; walking on, it comes round behind the player again', Math.abs(gap(dragged.yaw, round.length ? seen['12-view-street'].yaw : standing.yaw)) > 0.5 && Math.abs(gap(after.yaw, after.heading)) < 0.35, { before: seen['12-view-street'].yaw, dragged: dragged.yaw, after: [after.yaw, after.heading] });
// the mouse's wheel: nearer, then further; where it was put it stays (`own`), and it is put back for the rest
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
for (let k = 0; k < 4; k += 1) { await page.mouse.wheel(0, -120); await page.waitForTimeout(120); }
await page.waitForTimeout(1500);
const nearer = await shot('14b-wheel-nearer');
for (let k = 0; k < 9; k += 1) { await page.mouse.wheel(0, 120); await page.waitForTimeout(120); }
await page.waitForTimeout(1800);
const further = await shot('14c-wheel-further');
const kept = await page.evaluate(() => ({ dist: +window.__nlw.cam.dist.toFixed(2), own: +window.__nlw.cam.own.toFixed(2) }));
check('the wheel brings it nearer and takes it further, and it stays where it was put', nearer.back < after.back - 0.4 && further.back > after.back + 0.6 && kept.dist === kept.own, { nearer: nearer.back, usual: after.back, further: further.back, kept });
await page.evaluate(() => { const n = window.__nlw; n.cam.dist = 2.7; n.cam.own = 2.7; });
await page.waitForTimeout(1500);
// a wall behind: the purple tower's, the nearest from the grass beside it; the player's back that far from where the
// ground stops being walkable (its face is about 0.4 m further). The eye comes in first, at the height of the head,
// and tips down only as far as it must; it never goes past the wall's face (less a camera's width).
await page.evaluate(() => { window.__nlw.place(-100.4, 104.7); });
await page.waitForTimeout(1500);
const wall = await page.evaluate(() => {
  const n = window.__nlw, p = n.view.self;
  let best = null;
  for (let a = 0; a < 32; a += 1) {
    const ang = (a / 32) * Math.PI * 2, sx = Math.sin(ang), sz = Math.cos(ang);
    for (let d = 0.5; d < 40; d += 0.05) { if (!n.walkable(p.x + sx * d, p.z + sz * d)) { if (!best || d < best.d) best = { d, ang, x0: p.x, z0: p.z }; break; } }
  }
  return best;
});
check('there is a wall to stand against by the purple tower', !!wall, wall);
const walls = {};
for (const [k, room] of [['a', 2.0], ['b', 1.3], ['c', 0.9], ['d', 0.5]]) {
  if (!wall) break;
  await page.evaluate(([w, room]) => { const n = window.__nlw; const sx = Math.sin(w.ang), sz = Math.cos(w.ang); n.place(w.x0 + sx * (w.d - room), w.z0 + sz * (w.d - room)); n.face(w.ang + Math.PI); n.cam.yaw = w.ang + Math.PI; }, [wall, room]);
  await page.waitForTimeout(3000);
  const s = await shot(`15${k}-wall-${room}-m-behind`);
  walls[room] = { back: s.back, up: s.up, down: Math.round((Math.atan2(s.up - 1.43, s.back) * 180) / Math.PI) };
}
if (wall) {
  check('with a wall behind, the eye is never past its face', Object.entries(walls).every(([room, w]) => w.back <= Number(room) + 0.2), walls);
  check('with 2 m or 1.3 m of ground behind, it comes in close behind at the height of the head (looking down less than 15°)', walls['2'].down < 15 && walls['1.3'].down < 15 && walls['1.3'].back > 1.0, walls);
  check('closer still, it tips down over the player, as little as it must (0.9 m: less than 45°; 0.5 m: less than 80°)', walls['0.9'].down < 45 && walls['0.5'].down < 80 && walls['0.5'].down >= walls['0.9'].down, walls);
}
// another player a few metres ahead, out on the grass
await page.evaluate(() => { const n = window.__nlw; n.place(-100.4, 104.7); n.face(-Math.PI / 2); n.cam.yaw = -Math.PI / 2; });
await page.waitForTimeout(2500);
await page.evaluate(() => { const n = window.__nlw, p = n.view.self; const t = n.twin('Another Player'); t.place(p.x + Math.sin(p.heading) * 4 + 1.2, p.z + Math.cos(p.heading) * 4); t.face(p.heading + Math.PI); });
await page.waitForTimeout(4000);
const other = await shot('16-another-player');
const peer = await page.evaluate(() => { const n = window.__nlw, q = n.shownPeers.find((o) => o.name === 'Another Player'); const r = q && n.crowd.rigOf(`p:${q.id}`); return { shown: !!q, drawn: !!(r && r.group.visible) }; });
check('another player in front is seen, and the camera still follows this player\'s own figure', peer.shown && peer.drawn && framed(other), { peer, other });
// a phone upright, then on its side
await page.setViewportSize({ width: 400, height: 780 }); await page.waitForTimeout(2500);
const upright = await shot('17-phone-upright');
await page.setViewportSize({ width: 780, height: 360 }); await page.waitForTimeout(2500);
const sideways = await shot('18-phone-sideways');
check('turned upright and back on its side, the view is the same street view, framed alike', upright.view === 'street' && sideways.view === 'street' && Math.abs(upright.feet - standing.feet) < 0.05 && Math.abs(sideways.feet - standing.feet) < 0.05, { upright, sideways });
check('nothing went wrong in the page', errors.length === 0, errors);
writeFileSync(resolve(out, 'camera.json'), JSON.stringify({ seen, wall, walls }, null, 1));
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nAll ${results.length} checks passed.`);
await browser.close();
process.exit(failed ? 1 : 0);
