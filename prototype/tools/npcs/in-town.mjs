// The town's own people as the game draws them: the game played on this machine, the player put a few metres from
// each of the first townspeople the town has out (the police: his officers), the camera on them, a picture of each,
// standing and walking. For checking his figures in the game itself (27 October 2026).
//   ../server/with-postgres.sh node tools/npcs/in-town.mjs <out folder> [site folder] [phone|computer] [how many]
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
const context = await browser.newContext(PHONE ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' } : { viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
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
const people = await page.evaluate(() => { const n = window.__nlw, g = n.host.game, pop = g.internals.population; return pop.people.map((p) => ({ i: p.index, name: p.name, job: p.job, gender: p.gender, figure: p.look.figure, height: p.look.height })); });
writeFileSync(resolve(out, 'people.json'), JSON.stringify(people, null, 1));
const shots = [];
for (const p of people.slice(0, HOW_MANY)) {
  // where the person is now, the player put 3.5 m off in front of them, the camera over the player's shoulder at them
  // (wherever the town has them now: the view only lists those within 150 m)
  const at = await page.evaluate((i) => { const g = window.__nlw.host.game; const o = g.internals.population.locate(i, g.state.t, {}); return o && o.pose !== 4 ? { x: o.x, z: o.z, h: o.h || 0, pose: o.pose } : null; }, p.i);
  if (!at) { console.log(p.name, 'indoors now'); continue; }
  await page.evaluate(({ x, z, h }) => { const n = window.__nlw; const px = x + Math.sin(h) * 3.2, pz = z + Math.cos(h) * 3.2; n.place(px, pz); const face = Math.atan2(x - px, z - pz); n.face(face); n.cam.yaw = face; n.cam.dist = 2.2; n.cam.pitch = 0.04; }, at);
  // wait for the full figure to have come and be drawn
  const got = await page.waitForFunction((i) => { const a = window.__nlw.crowd.figureAt(i); return a && a.rig && a.rig.mesh ? true : null; }, p.i, { timeout: 180000, polling: 1000 }).then(() => true, () => false);
  // (again where the figure is now, the player a step to its side so as not to stand in front of it)
  await page.evaluate((i) => { const n = window.__nlw, a = n.crowd.figureAt(i); if (!a) return; const h = a.h || 0; const px = a.x + Math.sin(h) * 3.4 + Math.cos(h) * 1.1, pz = a.z + Math.cos(h) * 3.4 - Math.sin(h) * 1.1; n.place(px, pz); const face = Math.atan2(a.x - px, a.z - pz); n.face(face); n.cam.yaw = face + 0.35; n.cam.dist = 2.2; n.cam.pitch = 0.04; }, p.i);
  await page.waitForTimeout(1500);
  const info = await page.evaluate((i) => { const a = window.__nlw.crowd.figureAt(i); const r = a && a.rig; return r ? { animated: !!r.animated, figure: r.spec ? r.spec.id : null, triangles: r.triangles || null, failed: r.failed || null, playing: r.mixer ? r.mixer._actions.filter((x) => x.isRunning()).map((x) => x._clip.name) : [] } : null; }, p.i);
  const file = `${String(shots.length + 1).padStart(2, '0')}-${p.figure}-${p.name.replace(/[^A-Za-z]+/g, '_')}.png`;
  await page.screenshot({ path: resolve(out, file) });
  shots.push({ ...p, got, info, file });
  console.log(p.name, p.figure, JSON.stringify(info));
}
writeFileSync(resolve(out, 'shots.json'), JSON.stringify({ errors, shots }, null, 1));
await browser.close(); server.close(); process.exit(0);
