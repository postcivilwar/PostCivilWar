// Beyond the town, in a headless browser on the website as it is served: the road out south towards Kwale, Asaba
// Airport and the bridge over the Niger. A player walks out along the road, through the airport's car park and
// its terminal, onto its apron by the gate, and across the bridge to its barrier; the deck carries them at its
// height, the rails and the fence hold, the swim button is not offered on the deck, and what is drawn there
// costs about what the town does. Screenshots of each for the eye.
//   ../server/with-postgres.sh node test/outskirts.mjs [shots folder]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDevServer } from '../../server/dev.mjs';
import { pastQuestion, enterTown } from './start.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const out = process.argv[2] || '/tmp/outskirts-shots';
mkdirSync(out, { recursive: true });
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
const context = await browser.newContext({ viewport: { width: 1000, height: 640 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
const page = await context.newPage(); page.setDefaultTimeout(240000);
page.on('pageerror', (e) => check('no error in the page', false, e.message));
await page.goto(`${origin}/#nointro-gameclock`, { timeout: 300000 });
await page.waitForFunction(() => !!(window.__nlw && window.__nlw.ready), null, { timeout: 300000 });
await signUp(page, 'World');
await pastQuestion(page);
await page.fill('#name', 'World Test');
await enterTown(page);
await page.waitForTimeout(1500);
await page.waitForFunction(() => window.__nlw.beyond, null, { timeout: 120000 });
// (noon, so that the screenshots can be seen)
await page.evaluate(() => { const g = window.__nlw.host.game; const day = Math.floor(g.state.t / 86400); g.state.t = day * 86400 + 12 * 3600; });
const shot = (name) => page.screenshot({ path: resolve(out, `world-${name}.png`) });
const at = () => page.evaluate(() => { const n = window.__nlw; return { x: +n.view.self.x.toFixed(1), z: +n.view.self.z.toFixed(1), y: +n.me.group.position.y.toFixed(2), keys: n.controls.shown.map((b) => b.id) }; });
// (W walks the way the camera looks: by default it looks the way the player faces)
const go = (x, z, heading, cam = {}) => page.evaluate(([px, pz, h, c]) => { const n = window.__nlw; n.place(px, pz); n.face(h); n.cam.yaw = c.yaw !== undefined ? c.yaw : h; n.cam.dist = c.dist || 9; n.cam.pitch = c.pitch !== undefined ? c.pitch : 0.25; }, [x, z, heading, cam]);
const walk = async (ms, key = 'w') => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); await page.waitForTimeout(300); };
const cost = () => page.evaluate(() => window.__nlw.drawn);
// Walks (W, and Shift to run) until `done(where)` holds, or the player has stopped (six frames drawn without a step
// taken: a wall, a barrier), or `limit` ms have gone: by the frames drawn, not by the clock, so that a slow frame
// (without a graphics card, a large picture being taken in can hold the page for seconds) cannot cut a walk short.
const frameNo = () => page.evaluate(() => window.__nlw.renderer.info.render.frame);
const walkUntil = async (done, { run = true, limit = 45000 } = {}) => {
  if (run) await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  const t0 = Date.now(); let last = await at(), lastFrame = await frameNo();
  while (Date.now() - t0 < limit) {
    await page.waitForTimeout(400);
    const now = await at(), f = await frameNo();
    if (done(now)) break;
    if (Math.hypot(now.x - last.x, now.z - last.z) < 0.05) { if (f - lastFrame >= 6) break; } else { last = now; lastFrame = f; }
  }
  await page.keyboard.up('w'); if (run) await page.keyboard.up('Shift');
  await page.waitForTimeout(300);
  return at();
};

// in town, for comparison
await go(-30, 60, 0); await page.waitForTimeout(2000);
const town = await cost();

// out of town along the Onitsha road (true north is grid -x: the heading for -x is -pi/2)
await go(-236, -40, -Math.PI / 2, { dist: 10, pitch: 0.18 });
await page.waitForTimeout(1200);
await walk(3000, 'Shift');
const before = await at();
await page.keyboard.down('Shift'); await walk(4000); await page.keyboard.up('Shift');
const after = await at();
check('a player walks out of town onto the Onitsha road', after.x < before.x - 5 && after.x < -240, { before, after });
await shot('1-onitsha-road');
await go(-1170, -40, -Math.PI / 2, { dist: 14, pitch: 0.2 });
await page.waitForTimeout(1500);
const end = await walkUntil(() => false);
check('the road works at the end stop anyone going further', end.x > -1186 && end.x < -1180, end);
await shot('2-roadworks');

// the airport: the car park, the terminal's doors, the hall inside, the gate to the apron
await go(-746, -60, Math.PI, { yaw: Math.PI * 1.15, dist: 30, pitch: 0.3 });
await page.waitForTimeout(2500);
await shot('3-airport-road');
await go(-850, -180, Math.PI, { yaw: Math.PI + 0.35, dist: 22, pitch: 0.2 });
await page.waitForTimeout(2000);
await shot('4-terminal');
await go(-850, -195, Math.PI);
const hall = await walkUntil((p) => p.z < -218);
check('through the middle door into the hall', hall.z < -214 && hall.z > -248, hall);
await shot('5-hall');
const wall = await walkUntil(() => false);
check('the glass at the back holds: nobody walks out onto the apron through it', wall.z > -248.5 && wall.z < -244, wall);
await go(-683, -240, Math.PI, { dist: 12, pitch: 0.2 });
await page.waitForTimeout(800);
const apron = await walkUntil((p) => p.z < -256);
check('through the gate by the admin building onto the airside', apron.z < -253, apron);
await go(-850, -300, 0, { yaw: 0.4, dist: 70, pitch: 0.3 });
await page.waitForTimeout(3000);
await shot('6-apron-runway');
const airport = await cost();
const planes = await page.evaluate(() => { let n = 0; window.__nlw.scene.traverse((o) => { if (/aircraft|plane|jet/i.test(o.name || '')) n += 1; }); return n; });
check('no aircraft anywhere', planes === 0, planes);

// the bridge: up the approach from Waterside Road, across, to the barrier
await go(-205, 112, 0, { yaw: Math.PI, dist: 10, pitch: 0.2 });
await page.waitForTimeout(1500);
await shot('7-bridge-approach');
await go(-205, 112, 0);
const deck = await walkUntil((p) => p.z > 156 && p.y > 3);
check('up the approach onto the deck, carried at its height', deck.z > 150 && deck.y > 3, deck);
check('no swimming from the deck', !deck.keys.includes('swim'), deck.keys);
await go(-205, 225, 0, { yaw: Math.PI + 0.25, dist: 9, pitch: 0.12 });
await page.waitForTimeout(2000);
const mid = await at();
check('in the middle of the river the deck is 7 m up', Math.abs(mid.y - 7) < 0.2, mid);
await shot('8-on-the-bridge');
// against the rail: it holds
await go(-205, 225, -Math.PI / 2); await walk(3000);
const rail = await at();
check('the rail holds: nobody steps off the deck', rail.x > -211.5, rail);
await go(-150, 225, -Math.PI / 2, { yaw: -Math.PI / 2 + 0.25, dist: 70, pitch: 0.12 });
await page.waitForTimeout(2000);
await shot('9-bridge-from-the-water');
await go(-205, 360, 0, { dist: 10, pitch: 0.2 });
await page.waitForTimeout(1200);
const far = await walkUntil(() => false);
check('on the far bank, at its ground, the barrier stops anyone going on', far.z < 384 && far.z > 380 && far.y > 0.9 && far.y < 1.1, far);
await shot('10-far-bank');
const bridge = await cost();
check('what is drawn out there costs about what the town does', airport.calls < town.calls * 1.6 && bridge.calls < town.calls * 1.6, { town, airport, bridge });

await browser.close(); server.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nAll ${results.length} checks passed.`);
process.exit(failed ? 1 : 0);
