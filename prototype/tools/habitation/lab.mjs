// The habitation drawn by the game's own code (render-habitation.js, render-sky.js), without the rest of the game, from
// chosen places, for looking at as it is built:
//
//   node tools/habitation/lab.mjs <out-folder> [w=960 h=540] [hour=10] [lite=0] [views=name,name] [frames=1]
//
// Each view: where the eye is (grid x, z, height above the ground there) and what it looks at. Needs Playwright with
// Chromium; serves the prototype's own files.
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const out = resolve(args[0] || '/tmp/habitation-lab');
mkdirSync(out, { recursive: true });
const opt = (name, fallback) => { const a = args.find((x) => x.startsWith(`${name}=`)); return a ? a.slice(name.length + 1) : fallback; };
const W = Number(opt('w', 960)), H = Number(opt('h', 540)), HOUR = Number(opt('hour', 10)), LITE = opt('lite', '0') === '1';
// the places the pictures were taken from: eye (x, z, up), looking at (x, z, up)
export const VIEWS = {
  above: { eye: [1980, -260, 260], at: [2230, 160, 0], fov: 50 },
  gate: { eye: [1866, 95, 1.7], at: [1930, 40, 6] },
  hill: { eye: [1906, 70, 1.7], at: [1940, 12, 10] },
  hilltop: { eye: [1934, 20, 1.7], at: [2100, 150, 0] },
  forest: { eye: [2020, 72, 1.7], at: [2110, 112, 1] },
  swamp: { eye: [2034, -40, 1.7], at: [2062, -86, 1] },
  mangroves: { eye: [2014, 140, 1.7], at: [2090, 160, 1] },
  lagoonwest: { eye: [2150, 112, 1.7], at: [2260, 260, 4] },
  island: { eye: [2194, 125, 1.7], at: [2206, 205, 3] },
  gorge: { eye: [2318, 132, 1.7], at: [2380, 92, 6] },
  bigfall: { eye: [2430, 228, 6], at: [2480, 225, 14] },
  bridge: { eye: [2389, 205, 6.5], at: [2385, 240, 6] },
  fallspool: { eye: [2330, 312, 1.7], at: [2362, 338, 8] },
  overlook: { eye: [2252, 371, 1.7], at: [2200, 290, 0] },
  garden: { eye: [2178, 418, 1.7], at: [2158, 398, 7] },
  sunset: { eye: [2205, 352, 1.7], at: [2160, 240, 1] },
  park: { eye: [1838, 100, 1.7], at: [1890, 90, 1] },
  swamp2: { eye: [2031, -40, 1.7], at: [2052, -72, 0] },
  garden2: { eye: [2166, 404, 1.7], at: [2168, 389, 1] },
  gardenTop: { eye: [2200, 445, 30], at: [2160, 395, 0] },
  terrace: { eye: [2262, 368, 1.7], at: [2236, 374, 0] },
};
const names = opt('views', Object.keys(VIEWS).join(',')).split(',');
const TYPES = { '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(PAGE); return; }
  if (url === '/three.min.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(readFileSync(resolve(root, 'vendor/three.min.js'))); return; }
  const p = resolve(root, url.slice(1));
  if (p.startsWith(root) && existsSync(p) && statSync(p).isFile()) { res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(readFileSync(p)); return; }
  res.writeHead(404); res.end();
});
const PAGE = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000">
<canvas id="c" width="${W}" height="${H}"></canvas>
<script>addEventListener('error', (e) => console.error('script error at', e.filename + ':' + e.lineno + ':' + e.colno, e.message));</script>
<script src="/three.min.js"></script>
<script type="module">
import { createSky } from '/src/client/render-sky.js';
import { createHabitation } from '/src/client/render-habitation.js';
import { createHabitationLife } from '/src/client/render-habitation-life.js';
import { zoneGroundY } from '/src/sim/zone.js';
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, ${W} / ${H}, 0.3, 2400);
const sky = createSky(scene, renderer);
const habitation = createHabitation(scene, { lite: ${LITE}, renderer, fetchFile: (url) => fetch('/assets/habitation-dressed/' + url.replace('habitation/', '')), onError: (e) => console.error(String(e)), riverMaterial: new THREE.MeshStandardMaterial({ color: 0x7d8a62, roughness: 0.22, metalness: 0.35, transparent: true, opacity: 0.93 }) });
let life = null;
window.lifeState = () => (life ? life.state() : null);
// the trees' pictures, as one picture (a sheet of slots), read back from the graphics card
window.atlas = () => {
  const imp = habitation.impostors; if (!imp) return null;
  const t = imp.target, w = t.width, h = t.height, px = new Uint8Array(w * h * 4);
  renderer.readRenderTargetPixels(t, 0, 0, w, h, px);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), img = g.createImageData(w, h);
  for (let y = 0; y < h; y += 1) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  g.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
};
window.prepare = async () => { const t = performance.now(); habitation.update(0.016, { at: { x: 2000, z: 0 } }); while (!habitation.built || habitation.state().models < habitation.state().of) await new Promise((r) => setTimeout(r, 250)); life = createHabitationLife(scene, { lite: ${LITE} }); for (let i = 0; i < 20; i += 1) life.update(0.25, { eye: { x: 2100, z: 150 }, people: [], night: 0 }); return { ms: Math.round(performance.now() - t), state: habitation.state(), life: (({ birds, fish, shoals, kinds }) => ({ birds, fish, shoals, kinds }))(life.state()) }; };
window.view = (v, hour, frames = 1) => {
  const ey = zoneGroundY(v.eye[0], v.eye[1]) + v.eye[2], ay = zoneGroundY(v.at[0], v.at[1]) + v.at[2];
  camera.fov = v.fov || 62; camera.updateProjectionMatrix();
  camera.position.set(v.eye[0], ey, v.eye[1]); camera.lookAt(v.at[0], ay, v.at[1]);
  for (let i = 0; i < frames; i += 1) {
    const sk = sky.update(0.5, hour, { kind: 'clear', wet: false, intensity: 0 }, new THREE.Vector3(v.eye[0], ey, v.eye[1]), camera, 0, 1);
    habitation.update(0.05, { at: { x: v.eye[0], z: v.eye[1] }, eye: camera.position, camera, night: sk.night });
    if (life) life.update(0.05, { eye: camera.position, people: v.people || [], night: sk.night });
    renderer.render(scene, camera);
  }
  const info = renderer.info.render;
  return { calls: info.calls, triangles: info.triangles, drawn: habitation.state().drawn, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries };
};
window.__ready = true;
</script>`;
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('page error:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
const prepared = await page.evaluate(() => window.prepare());
console.log('built', JSON.stringify(prepared));
if (opt('atlas', '0') === '1') { const url = await page.evaluate(() => window.atlas()); if (url) { const { writeFileSync } = await import('node:fs'); writeFileSync(resolve(out, 'atlas.png'), Buffer.from(url.split(',')[1], 'base64')); console.log('atlas written'); } }
for (const name of names) {
  const v = VIEWS[name];
  if (!v) continue;
  const t = Date.now();
  const r = await page.evaluate(([v, hour, frames]) => window.view(v, hour, frames), [v, HOUR, Number(opt('frames', 2))]);
  await page.screenshot({ path: resolve(out, `${name}.png`), timeout: 0 });
  console.log(name, JSON.stringify(r), `${Date.now() - t} ms`);
}
await browser.close(); server.close();
