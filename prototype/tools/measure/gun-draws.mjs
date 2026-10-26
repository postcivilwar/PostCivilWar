// What the gun out costs the drawing (the owner's brief of 26 October 2026: since the guns the game hung on his phones):
// on a phone's settings at Medium, at a few places, the same spot and the same way, with the gun put away and with it out
// (the camera over the shoulder, as the game puts it): the draws and triangles of the picture and of the sun's shadows,
// counted object by object over a few frames (as tools/measure/places.mjs counts them), what draws the most, and the time
// a frame takes here (drawn in software: only for comparing the two).
//   ../server/with-postgres.sh node tools/measure/gun-draws.mjs <out folder> [site folder]
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
const out = resolve(process.argv[2] || '/tmp/gundraws'); mkdirSync(out, { recursive: true });
const SITE = resolve(process.argv[3] || `${ROOT}/prototype/dist/site`);
const LABEL = process.env.DRAWS_LABEL || 'draws';
const game = require(`${ROOT}/api/game.js`);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
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
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
const page = await context.newPage();
page.setDefaultTimeout(900000);
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
await page.goto(`${origin}/#gameclock-lite`, { timeout: 900000 });
await page.waitForSelector('#cover-play', { state: 'visible', timeout: 900000 });
await page.evaluate(() => document.getElementById('cover-play').click());
await page.waitForSelector('#open-signup', { state: 'visible', timeout: 900000 });
await page.click('#open-signup');
await page.fill('#account-username', `Draw_${Math.random().toString(36).slice(2, 7)}`);
await page.fill('#account-password', 'a password for the draws');
await page.click('#account-submit');
await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 180000 });
await pastQuestion(page);
await page.fill('#name', 'Draw');
await page.tap('#enter');
await page.waitForSelector('#confirm:not([hidden])', { timeout: 180000 });
await page.tap('#confirm-yes');
await page.waitForFunction(() => !document.querySelector('#hud').hidden && window.__nlw.view && window.__nlw.me && window.__nlw.me.mixer, null, { timeout: 900000 });
await page.evaluate(() => { const n = window.__nlw, g = n.host.game; const hour = n.view.clock.hourFloat; n.skip(((24 + 11 - hour) % 24)); g.state.weather = { kind: 'clear', until: g.state.t + 24 * 3600 }; n.setGraphics('medium'); for (const id of ['toasts', 'notices']) { const t = document.getElementById(id); if (t) t.style.display = 'none'; } });
await page.waitForFunction(() => window.__nlw.beyond, null, { timeout: 900000, polling: 2000 }).catch(() => {});
await page.addScriptTag({ content: 'window.__frames = 0; (function f() { window.__frames += 1; requestAnimationFrame(f); })();' });
const settle = async (n) => { const f0 = await page.evaluate(() => window.__frames); await page.waitForFunction(([a, k]) => window.__frames >= a + k, [f0, n], { timeout: 300000 }).catch(() => {}); };
const passes = () => page.evaluate(() => new Promise((done) => {
  const n = window.__nlw, r = n.renderer, rbd = r.renderBufferDirect, render = r.render, town = n.scene;
  const c = { frames: 0, main: { calls: 0, tris: 0 }, shadow: { calls: 0, tris: 0 }, other: { calls: 0, tris: 0 }, by: {} };
  const top = (o) => { const names = []; for (let p = o; p && names.length < 3; p = p.parent) if (p.name) names.push(p.name); return names.reverse().join('/') || o.type; };
  r.render = function (...a) { if (r.getRenderTarget() === null && a[0] === town) c.frames += 1; return render.apply(this, a); };
  r.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
    const target = r.getRenderTarget();
    const shadow = target !== null && material && (material.isMeshDepthMaterial || material.isMeshDistanceMaterial);
    const main = target === null && scene === town;
    const idx = group ? group.count : geometry.index ? geometry.index.count : geometry.attributes.position ? geometry.attributes.position.count : 0;
    const inst = object.isInstancedMesh ? object.count : 1;
    const tris = Math.floor(idx / 3) * Math.max(0, inst);
    const p = shadow ? c.shadow : main ? c.main : c.other; p.calls += 1; p.tris += tris;
    if (main || shadow) { const k = `${shadow ? 'shadow ' : ''}${top(object)}`; const e = c.by[k] || (c.by[k] = [0, 0]); e[0] += 1; e[1] += tris; }
    return rbd.call(this, camera, scene, geometry, material, object, group);
  };
  const t0 = performance.now();
  let k = 0; const f = () => { k += 1; if (k < 5) requestAnimationFrame(f); else { r.render = render; r.renderBufferDirect = rbd; const m = Math.max(1, c.frames); const by = Object.entries(c.by).map(([name, [calls, tris]]) => [name, Math.round(calls / m), Math.round(tris / m)]).sort((a, b) => b[2] - a[2]).slice(0, 14); done({ frameMs: Math.round((performance.now() - t0) / 4), mainCalls: Math.round(c.main.calls / m), mainTris: Math.round(c.main.tris / m), shadowCalls: Math.round(c.shadow.calls / m), shadowTris: Math.round(c.shadow.tris / m), otherCalls: Math.round(c.other.calls / m), heaviest: by, cam: { pitch: +n.cam.pitch.toFixed(2), dist: +n.cam.dist.toFixed(2), view: n.rig.view } }); } };
  requestAnimationFrame(f);
}));
const park = await page.evaluate(() => window.__nlw.service('park'));
const PLACES = [['motor park', park.x + 6, park.z + 4, Math.PI], ['market', 30, 60, Math.PI / 2], ['waterside', -60, 113, -Math.PI / 2], ['boulevard', 0, 20, 0]];
const results = [];
for (const [name, x, z, h] of PLACES) {
  for (const gun of [false, true]) {
    await page.evaluate(([x, z, h, gun]) => { const n = window.__nlw; if (!!(n.gunPlay && n.gunPlay.out) !== gun) n.gunPlay.act('gun', 'down'); n.place(x, z); n.face(h); n.cam.yaw = h; if (!gun) { n.cam.dist = 6.5; n.cam.pitch = 0.12; } }, [x, z, h, gun]);
    await settle(10); await page.waitForTimeout(1500);
    const p = await passes();
    results.push({ place: name, gun, ...p });
    console.log(name, gun ? 'gun out ' : 'gun away', JSON.stringify({ ...p, heaviest: undefined }));
    console.log('   heaviest', JSON.stringify(p.heaviest.slice(0, 6)));
  }
}
writeFileSync(resolve(out, `gun-draws-${LABEL}.json`), JSON.stringify({ site: SITE, results }, null, 1));
await browser.close();
server.close();
process.exit(0);
