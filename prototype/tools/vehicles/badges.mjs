// The makers' badges on the showroom's cars (31 October 2026, the owner's word: "you need paint over those cars with
// brands on them. Or use our logo to redesign and cover it"): each car drawn close from in front, from behind, from
// each side, from its front corners and at a front wheel, as the game draws it (car-model.js, its 4096 colour picture),
// to find what on it is a maker's mark; and, for each of those pictures, where on the car's colour picture each of its
// points is, so that a mark seen in a picture can be found on the colour picture (badges.py `where`).
//
//   node tools/vehicles/badges.mjs <out folder> [ids...] [--after]
//
// writes <id>-<view>.png (what is seen) and <id>-<view>-u.png, <id>-<view>-v.png (where each point is on the colour
// picture: u and v each as a whole and a fraction of 1/255, in red and green; blue 255 where the car is, 0 where it is
// not). `--after` writes only the pictures of what is seen, as <id>-<view>-after.png. Nothing else is written. Needs
// Playwright with Chromium.
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { writeFileSync, createReadStream, statSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { CAR_PARTS } = await import(resolve(root, 'src/client/car-parts.js'));
const { POWER_CARS } = await import(resolve(root, 'src/sim/power-cars.js'));
const args = process.argv.slice(2);
const after = args.includes('--after');
// (`--from=<folder>`: the cars' pictures taken from a folder of covered ones, badges.py cover --into, not the game's)
const from = (args.find((a) => a.startsWith('--from=')) || '').slice(7) || null;
const [outDir, ...rest] = args.filter((a) => !a.startsWith('--'));
const ids = rest.length ? rest : Object.keys(CAR_PARTS);
if (!outDir) { console.error('node tools/vehicles/badges.mjs <out folder> [ids...] [--after]'); process.exit(2); }
mkdirSync(outDir, { recursive: true });
const W = 1280, H = 800;
const TYPES = { '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.bin': 'application/octet-stream' };

const page_html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000"><canvas id="c" width="${W}" height="${H}"></canvas>
<script src="/vendor/three.min.js"></script><script type="module">
import { loadCar } from '/src/client/car-model.js';
import { initVehicles } from '/src/client/vehicle-models.js';
window.BASE = ${JSON.stringify(from ? '/covered/' : '/assets/vehicles/cars/game/')};
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(${W}, ${H}, false);
// (the sky the cars' paint reflects, as the game makes it)
initVehicles(renderer, { lite: false });
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8a9096);
scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(3, 6, 5); scene.add(sun);
const back = new THREE.DirectionalLight(0xffffff, 0.9); back.position.set(-3, 4, -6); scene.add(back);
const camera = new THREE.PerspectiveCamera(34, ${W} / ${H}, 0.05, 100);
// where each point is on the colour picture: u (or v) as a whole part and a fraction, in red and green
const uvMaterial = (which) => new THREE.ShaderMaterial({
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'varying vec2 vUv; void main() { float t = clamp(' + (which === 'u' ? 'vUv.x' : 'vUv.y') + ', 0.0, 1.0) * 255.0; gl_FragColor = vec4(floor(t) / 255.0, fract(t), 1.0, 1.0); }',
  side: THREE.DoubleSide,
});
const target = new THREE.WebGLRenderTarget(${W}, ${H}, { type: THREE.UnsignedByteType });
const png = () => canvas.toDataURL('image/png').split(',')[1];
function pixels() {
  const buf = new Uint8Array(${W} * ${H} * 4);
  renderer.readRenderTargetPixels(target, 0, 0, ${W}, ${H}, buf);
  // (read from the bottom row up: turned the right way up, into a picture)
  const c = document.createElement('canvas'); c.width = ${W}; c.height = ${H};
  const g = c.getContext('2d'); const img = g.createImageData(${W}, ${H});
  for (let y = 0; y < ${H}; y += 1) img.data.set(buf.subarray((${H} - 1 - y) * ${W} * 4, (${H} - y) * ${W} * 4), y * ${W} * 4);
  g.putImageData(img, 0, 0);
  return c.toDataURL('image/png').split(',')[1];
}
window.take = async (id, length, withUv) => {
  const car = await loadCar(id, { base: window.BASE, tier: '4k', own: true, patch: false, length });
  car.pose({});
  scene.add(car.group);
  const L = car.size.length, Wd = car.size.width, Ht = car.size.height;
  const fw = car.wheels[0];
  const views = {
    front: [[0, 0.7 * Ht, L / 2 + 2.4], [0, 0.42 * Ht, L / 2]],
    back: [[0, 0.75 * Ht, -L / 2 - 2.4], [0, 0.45 * Ht, -L / 2]],
    left: [[Wd / 2 + 4.6, 0.6 * Ht, 0], [0, 0.45 * Ht, 0]],
    right: [[-Wd / 2 - 4.6, 0.6 * Ht, 0], [0, 0.45 * Ht, 0]],
    frontleft: [[Wd / 2 + 2.0, 0.85 * Ht, L / 2 + 1.7], [0, 0.42 * Ht, L / 2 - 0.5]],
    backright: [[-Wd / 2 - 2.0, 0.85 * Ht, -L / 2 - 1.7], [0, 0.45 * Ht, -L / 2 + 0.5]],
    wheel: [[fw.x + 1.25, fw.r * 1.05, fw.z + 0.15], [fw.x, fw.r, fw.z]],
    top: [[0, Ht + 3.2, 0.01], [0, Ht * 0.5, 0]],
  };
  const out = {};
  const meshes = []; car.group.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const [name, [eye, at]] of Object.entries(views)) {
    camera.position.set(...eye); camera.lookAt(...at); camera.updateMatrixWorld();
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
    out[name] = { seen: png() };
    if (!withUv) continue;
    const kept = new Map(meshes.map((m) => [m, { material: m.material, visible: m.visible }]));
    const bg = scene.background; scene.background = new THREE.Color(0, 0, 0);
    const tm = renderer.toneMapping; renderer.toneMapping = THREE.NoToneMapping;
    for (const which of ['u', 'v']) {
      const mat = uvMaterial(which);
      for (const m of meshes) { if (m.geometry.attributes.uv) m.material = mat; else m.visible = false; }
      renderer.setRenderTarget(target); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(scene, camera);
      out[name][which] = pixels();
      mat.dispose();
    }
    renderer.setRenderTarget(null);
    for (const [m, k] of kept) { m.material = k.material; m.visible = k.visible; }
    scene.background = bg; renderer.toneMapping = tm;
  }
  scene.remove(car.group); car.dispose();
  return out;
};
window.ready = true;
</script>`;
const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(page_html); return; }
  // (a covered picture from --from where there is one there, otherwise the game's own: the shapes are the same)
  const covered = from && url.startsWith('/covered/') ? resolve(from, url.slice(9)) : null;
  const file = covered && existsSync(covered) ? covered : resolve(root, `.${url.startsWith('/covered/') ? `/assets/vehicles/cars/game/${url.slice(9)}` : url}`);
  if (!(file.startsWith(root + sep) || (from && file.startsWith(resolve(from) + sep))) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Content-Length': statSync(file).size });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.waitForFunction(() => window.ready === true, null, { timeout: 600000 });
for (const id of ids) {
  const length = POWER_CARS[id] ? POWER_CARS[id].length : 4.6;
  const views = await page.evaluate(([which, len, uv]) => window.take(which, len, uv), [id, length, !after]);
  for (const [name, v] of Object.entries(views)) {
    writeFileSync(resolve(outDir, `${id}-${name}${after ? '-after' : ''}.png`), Buffer.from(v.seen, 'base64'));
    if (v.u) writeFileSync(resolve(outDir, `${id}-${name}-u.png`), Buffer.from(v.u, 'base64'));
    if (v.v) writeFileSync(resolve(outDir, `${id}-${name}-v.png`), Buffer.from(v.v, 'base64'));
  }
  console.log(`${id}: ${Object.keys(views).length} views`);
}
await browser.close();
server.close();
