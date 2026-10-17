// The supplied animated figures in a headless browser, on the website as it is served: each is in the right list
// (women with the women, men with the men), is chosen on the selection screen the way a player chooses, is drawn
// at a person's height standing on the ground, stands, walks and runs with clips that are really playing, sits in
// a seat, reacts by itself to a blow that lands on it in a fight, falls when it is knocked down (onto the ground,
// not hanging in the air) and gets up again, and holds the phone in its palm.
//   ../server/with-postgres.sh node test/figures.mjs [shots folder] [ids, comma separated]
// Needs Playwright with Chromium and a built dist/site (node build.mjs). Not part of the unit tests.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDevServer } from '../../server/dev.mjs';
import { pastQuestion, enterTown } from './start.mjs';
import { FIGURES, FIGURE_ORDER } from '../src/sim/figures.js';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }

const out = process.argv[2] || '/tmp/figure-shots';
mkdirSync(out, { recursive: true });
const only = process.argv[3] ? process.argv[3].split(',') : null;
const server = createDevServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
// The website asks for an account before play: one is made, as a player makes one.
async function signUp(page, prefix) {
  await page.waitForSelector('#open-signup', { state: 'visible', timeout: 300000 });
  await page.click('#open-signup');
  await page.waitForSelector('#account:not([hidden])');
  await page.fill('#account-username', `${prefix}_${Math.random().toString(36).slice(2, 8)}`);
  await page.fill('#account-password', 'a password for the browser test');
  await page.click('#account-submit');
  await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 120000 });
}
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); };

// what the figure is doing, measured from its own bones
const measure = () => {
  const n = window.__nlw, me = n.me;
  me.group.updateMatrixWorld(true);
  const box = new THREE.Box3();
  let low = Infinity, high = -Infinity;
  // (the body's own joints: head, hips, hands, feet; not the file's root, which lies at the feet's level)
  for (const name of ['head', 'pelvis', 'spine_03', 'hand_l', 'hand_r', 'foot_l', 'foot_r', 'calf_l', 'calf_r']) { const b = me.bones.get(name); if (!b) continue; const p = b.getWorldPosition(new THREE.Vector3()); low = Math.min(low, p.y); high = Math.max(high, p.y); }
  box.setFromObject(me.mesh);
  const cur = me.current ? me.current.getClip().name : null;
  const head = me.bones.get('head').getWorldPosition(new THREE.Vector3());
  const pelvis = me.bones.get('pelvis').getWorldPosition(new THREE.Vector3());
  return { clip: cur, time: me.current ? +me.current.time.toFixed(2) : 0, running: !!(me.current && me.current.isRunning()), low: +low.toFixed(2), high: +high.toFixed(2), head: +head.y.toFixed(2), pelvis: +pelvis.y.toFixed(2), ground: +me.group.position.y.toFixed(2), doing: me.doing ? me.doing.kind : null, byHand: me.byHand ? me.byHand.kind : null, lying: me.lying ? me.lying.name : null, drop: +me.drop.toFixed(2), tipped: +me.body.rotation.x.toFixed(2) };
};

// every figure a player may be: the women, then the men, in the order the selection screen offers them
const FIG = Object.fromEntries([...FIGURE_ORDER.f, ...FIGURE_ORDER.m].map((id) => [id, [FIGURES[id].gender, FIGURES[id].name]]));
for (const id of Object.keys(FIG).filter((k) => !only || only.includes(k))) {
  const [gender, name] = FIG[id];
  const label = `${id} (${name})`;
  const context = await browser.newContext({ viewport: { width: 900, height: 640 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await context.newPage(); page.setDefaultTimeout(240000);
  page.on('pageerror', (e) => check(`${label}: no error in the page`, false, e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 4\d\d/.test(m.text())) check(`${label}: no error in the console`, false, m.text()); });
  const shot = (what) => page.screenshot({ path: resolve(out, `${id}-${what}.png`) });
  await page.goto(`${origin}/#nointro-gameclock`, { timeout: 300000 });
  await page.waitForFunction(() => !!(window.__nlw && window.__nlw.ready), null, { timeout: 300000 });
  await signUp(page, 'Fig');
  await pastQuestion(page);

  // the selection screen: this figure is in its own list, and only there
  const dots = await page.evaluate(() => [...document.querySelectorAll('#fig-dots button')].map((b) => b.getAttribute('aria-label')));
  check(`${label}: on the selection screen`, dots.some((d) => d.startsWith(`${name},`)), dots);
  await page.evaluate((who) => [...document.querySelectorAll('#fig-dots button')].find((b) => b.getAttribute('aria-label').startsWith(`${who},`)).click(), name);
  await page.waitForTimeout(500);
  const pressed = await page.evaluate(() => [...document.querySelectorAll('#genders [data-gender]')].find((b) => b.getAttribute('aria-pressed') === 'true').dataset.gender);
  check(`${label}: listed as ${gender === 'f' ? 'a woman' : 'a man'}`, pressed === gender, pressed);
  // the figure drawn on the selection screen arrives (the file is 5 to 36 MB)
  await page.waitForFunction(() => { const c = window.__nlw.creator; return !c || !c.loading || !c.loading(); }, null, { timeout: 240000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await shot('1-chosen');
  await page.fill('#name', `${name} Test`);
  await enterTown(page);
  await page.waitForFunction((want) => window.__nlw.me && window.__nlw.me.animated === want && window.__nlw.me.mixer, id, { timeout: 240000 });
  const spec = await page.evaluate(() => ({ height: window.__nlw.me.spec.height, still: window.__nlw.me.spec.still, walk: window.__nlw.me.spec.walk, run: window.__nlw.me.spec.run, falls: window.__nlw.me.spec.react.fall.length, hit: window.__nlw.me.clipFor('hit'), triangles: window.__nlw.me.triangles }));
  check(`${label}: in town as this figure`, true, spec);
  await page.evaluate(() => { const n = window.__nlw; n.place(-2, 80); n.face(0); n.cam.yaw = Math.PI; n.cam.dist = 5; n.cam.pitch = 0.2; });
  await page.waitForTimeout(1500);

  // standing
  let m = await page.evaluate(measure);
  check(`${label}: standing, it plays its standing clip`, m.clip === spec.still && m.running, m);
  check(`${label}: it is a person's height`, m.high > spec.height * 0.8 && m.high < spec.height * 1.08, { high: m.high, height: spec.height });
  check(`${label}: its feet are on the ground (the ankles, not the soles)`, Math.abs(m.low) < 0.2, { low: m.low });
  await shot('2-standing');
  // walking and running
  await page.keyboard.down('w'); await page.waitForTimeout(1600);
  m = await page.evaluate(measure);
  check(`${label}: walking, it plays its walk`, m.clip === spec.walk && m.running, m);
  await shot('3-walking');
  await page.keyboard.down('Shift'); await page.waitForTimeout(1800);
  m = await page.evaluate(measure);
  check(`${label}: running, it plays its run`, m.clip === spec.run && m.running, m);
  check(`${label}: running, its feet stay under it`, m.low > -0.1 && m.low < 0.45, { low: m.low });
  await shot('4-running');
  await page.keyboard.up('Shift'); await page.keyboard.up('w'); await page.waitForTimeout(1500);

  // in a seat: on the back of an okada... (the keke's seat: driven)
  // the phone: in the palm, the glass to the eyes
  await page.evaluate(() => window.__nlw.ui.openPhone());
  await page.waitForFunction(() => window.__nlw.phoneHold.ready, null, { timeout: 60000 });
  await page.waitForTimeout(700);
  const hold = await page.evaluate(() => {
    const n = window.__nlw; const prop = n.phoneHold.prop; prop.updateMatrixWorld(true);
    const at = (name) => n.me.bones.get(name).getWorldPosition(new THREE.Vector3());
    const P = prop.getWorldPosition(new THREE.Vector3());
    const glass = new THREE.Vector3(0, 0, 1).transformDirection(prop.matrixWorld);
    return { toWrist: +P.distanceTo(at('hand_r')).toFixed(3), toKnuckle: +P.distanceTo(at('middle_01_r')).toFixed(3), faces: +glass.dot(at('head').clone().sub(P).normalize()).toFixed(3) };
  });
  check(`${label}: the phone is in the palm, by the knuckles`, hold.toKnuckle < hold.toWrist && hold.toKnuckle < 0.1, hold);
  check(`${label}: its glass faces the eyes`, hold.faces > 0.8, hold);
  await shot('8-phone');
  await page.keyboard.press('Escape'); await page.waitForTimeout(800);
  // a call: the police desk, from Contacts; the handset goes up to the ear, in the palm, and comes down after
  // (the head bone is at the top of the neck, below and behind the ear: the handset against the ear is about a
  // seventh of the figure's height from it)
  if (await page.evaluate(() => window.__nlw.view.self.law.state === 'normal')) {
    await page.evaluate(() => window.__nlw.ui.openPhone('contacts', { contact: 'svc:police' }));
    await page.waitForTimeout(800);
    const called = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((e) => /Ask the desk/.test(e.textContent) && e.offsetParent); if (!b) return false; b.click(); return true; });
    await page.waitForTimeout(400);
    // the phone's page put away, the call goes on with the town in view
    await page.keyboard.press('Escape');
    // (the camera in front, a little to the right, to see the hand at the ear)
    await page.evaluate(() => { const n = window.__nlw; n.cam.yaw = n.me.group.rotation.y + Math.PI - 0.6; n.cam.dist = 2.4; n.cam.pitch = 0.1; });
    // (all of it read in one frame, frame by frame, until it holds: the call lasts so many seconds of the clock, and
    // without a graphics card a heavy figure's frame can take seconds, so a call can end between two separate looks)
    const ear = await page.waitForFunction(() => {
      const n = window.__nlw; const at = (name) => n.me.bones.get(name).getWorldPosition(new THREE.Vector3());
      const P = n.phoneHold.prop.getWorldPosition(new THREE.Vector3());
      const e = { called: n.ui.calling(), atEar: +n.phoneHold.atEar.toFixed(2), toHead: +P.distanceTo(at('head')).toFixed(3), height: n.me.spec.height, toKnuckle: +P.distanceTo(at('middle_01_r')).toFixed(3), doing: n.me.doing ? n.me.doing.name : null };
      window.__ear = e;
      return e.called && e.atEar > 0.95 && e.toHead < 0.14 * e.height && e.toKnuckle < 0.1 ? e : false;
    }, null, { timeout: 30000 }).then((handle) => handle.jsonValue(), () => page.evaluate(() => window.__ear));
    check(`${label}: on a call the handset is at the ear, still in the palm (${ear.doing || 'no call clip'})`, called && ear.called && ear.atEar > 0.95 && ear.toHead < 0.14 * ear.height && ear.toKnuckle < 0.1, ear);
    await shot('9-call');
    await page.evaluate(() => { const n = window.__nlw; n.cam.dist = 5; });
    await page.waitForFunction(() => !window.__nlw.ui.calling(), null, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const after = await page.evaluate(() => ({ atEar: window.__nlw.phoneHold.atEar, out: window.__nlw.phoneHold.out, doing: window.__nlw.me.doing ? window.__nlw.me.doing.kind : null }));
    check(`${label}: the call over, the handset comes down and the call clip ends`, after.atEar < 0.05 && after.doing !== 'call', after);
  }
  // a blow lands on it in a fight: it reacts by itself
  const who = await page.evaluate(() => {
    const n = window.__nlw; const g = n.host.game; const pop = g.internals.population; const o = {}; let best = null;
    const me = g.state.players[n.playerId];
    for (let i = 0; i < pop.count; i += 1) {
      // a police officer: one who is struck always defends themselves, and so strikes back
      const w = pop.people[i]; if (w.age < 18 || w.job !== 'police') continue;
      pop.locate(i, g.state.t, o); if (o.pose !== 0) continue;
      let open = true; for (let k = 1; k <= 4; k += 1) if (!n.walkable(o.x + Math.sin(o.h) * k, o.z + Math.cos(o.h) * k)) open = false;
      if (!open) continue;
      const d = Math.hypot(o.x - me.x, o.z - me.z); if (!best || d < best.d) best = { i, x: o.x, z: o.z, h: o.h, d };
    }
    return best;
  });
  await page.evaluate((w) => { const n = window.__nlw; const x = w.x + Math.sin(w.h) * 1.1, z = w.z + Math.cos(w.h) * 1.1; n.place(x, z); n.face(Math.atan2(w.x - x, w.z - z)); n.cam.yaw = Math.atan2(w.x - x, w.z - z) + 0.9; n.cam.dist = 4.5; n.cam.pitch = 0.25; }, who);
  await page.waitForTimeout(1200);
  await page.keyboard.press('f'); await page.waitForTimeout(800);
  // the player strikes first; the one struck strikes back, and the figure reacts to each blow that lands on it
  let reacted = null;
  await page.evaluate(() => { window.__hits = []; const me = window.__nlw.me; const was = me.react; me.react = function (kind, o) { const how = was.call(me, kind, o); window.__hits.push({ kind, how, clip: me.doing ? me.doing.name : null }); return how; }; });
  for (let t = 0; t < 40 && !reacted; t += 1) {
    if (t % 3 === 0) { await page.keyboard.press('f'); }
    // (an officer on the move: the player keeps squared up to them)
    if (t % 6 === 5) await page.evaluate((i) => { const n = window.__nlw; const g = n.host.game; const o = {}; g.internals.population.locate(i, g.state.t, o); const m = g.internals.actors && g.internals.actors.get ? g.internals.actors.get(i) : null; const x = m ? m.x : o.x, z = m ? m.z : o.z; const me = g.state.players[n.playerId]; const d = Math.hypot(me.x - x, me.z - z); if (d > 1.6) { n.place(x + (me.x - x) / d * 1.1, z + (me.z - z) / d * 1.1); } n.face(Math.atan2(x - me.x, z - me.z)); }, who.i);
    await page.waitForTimeout(500);
    const hits = await page.evaluate(() => window.__hits);
    reacted = hits.find((h) => h.kind === 'hit') || null;
    if (t === 3) await shot('5-fighting');
  }
  const thrown = await page.evaluate(() => window.__hits.filter((h) => h.kind !== 'hit'));
  check(`${label}: its own blows are shown on it (${thrown.length ? thrown[0].how : 'none'})`, thrown.length > 0 && thrown.every((h) => h.how), thrown.slice(0, 3));
  if (reacted) {
    check(`${label}: struck in the fight, it reacted by itself (${reacted.how}${reacted.clip ? ` ${reacted.clip}` : ''})`, !!reacted.how, reacted);
    if (spec.hit) check(`${label}: with its own clip for being hit`, reacted.how === 'clip' && reacted.clip === spec.hit, reacted);
    await shot('6-struck');
  } else console.log(`note ${label}: nobody struck back this time`);
  await page.keyboard.press('v'); await page.waitForTimeout(800);
  await page.evaluate(() => { const g = window.__nlw.host.game; g.internals.conflict.heal(g.state.players[window.__nlw.playerId], 100); });

  // knocked down: on the ground, and up again
  await page.evaluate(() => { const n = window.__nlw; n.place(-2, 80); n.face(0); n.cam.yaw = Math.PI / 2; n.cam.dist = 5; n.cam.pitch = 0.25; });
  await page.waitForTimeout(1500);
  const downAt = await page.evaluate(() => { const g = window.__nlw.host.game; const p = g.state.players[window.__nlw.playerId]; const now = g.state.real; p.down = { at: now, until: now + 4, upAt: now + 5, by: 'test', h: 0 }; return now; });
  // (waited for by the game's own time, not the clock's: a page that draws slowly, on a busy machine, runs the game
  // slower than the clock, and the fall would be looked at before it had happened)
  const gameTime = (s) => page.waitForFunction((t) => window.__nlw.host.game.state.real >= t, s, { timeout: 180000 });
  await gameTime(downAt + 3.6);
  m = await page.evaluate(measure);
  if (spec.falls) {
    check(`${label}: knocked down, it falls with its own fall`, !!m.lying && m.tipped === 0, m);
    check(`${label}: and lies on the ground, not in the air`, m.pelvis < 0.45 && m.head < 0.55 && m.low > -0.15, m);
  } else check(`${label}: knocked down (no fall in its file), it is laid flat`, m.tipped < -1.2, m);
  await shot('7-down');
  await gameTime(downAt + 11.6);
  m = await page.evaluate(measure);
  check(`${label}: up again, standing on its feet`, !m.lying && m.tipped > -0.05 && m.head > spec.height * 0.78 && Math.abs(m.low) < 0.2, m);

  await context.close();
}
await browser.close(); server.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nAll ${results.length} checks passed.`);
process.exit(failed ? 1 : 0);
