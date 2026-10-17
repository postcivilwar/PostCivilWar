// Pictures of each motorcycle from all round, for the showroom to stand in for a motorcycle seen across the hall
// (src/client/render-powerbike.js): the model itself is drawn for the ones near the player, and these for the rest.
//
//   node tools/vehicles/bike_impostors.mjs [ids...]     writes assets/market/bike-<id>-impostor.webp and
//                                                       src/client/bike-impostors.js
//
// Each is the owner's model, drawn as the game draws it (bike-model.js, from the parts tools/vehicles/bikes.py made,
// lit as the showroom is lit), at the length the game rides it, from twenty-four sides a little above, with a camera
// that keeps its size (no perspective), so that a picture can be put up in the hall at the bike's own size and stand
// exactly where it does.
// The frame is square and holds the whole bike from every side. Nothing is written but the pictures and their
// measurements. Needs Playwright with Chromium.
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { writeFileSync, createReadStream, statSync, existsSync } from 'node:fs';
import { dirname, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { BIKE_PARTS } = await import(resolve(root, 'src/client/bike-parts.js'));
const { POWER_BIKES } = await import(resolve(root, 'src/sim/power-bikes.js'));
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(BIKE_PARTS);
const FRAME = 192, COLS = 6, ROWS = 4, FRAMES = COLS * ROWS, ELEVATION = 0.16;
const TYPES = { '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.bin': 'application/octet-stream' };

const page_html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000"><canvas id="c" width="${FRAME * 2}" height="${FRAME * 2}"></canvas>
<script src="/vendor/three.min.js"></script><script type="module">
import { loadBike } from '/src/client/bike-model.js';
const blobOf = (c, type, q) => new Promise((r) => c.toBlob(r, type, q));
const b64 = async (blob) => { const bytes = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(${FRAME * 2}, ${FRAME * 2}, false);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.setClearColor(0x000000, 0);
// lit as the showroom lights its floor (render-sky.js, indoors): the sky's light all round and a light from straight
// above, the same from every side, so that a picture matches the model drawn there whichever way it stands; no
// tone mapping and nothing reflected, as the game draws its motorcycles
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8478, 1.0));
const key = new THREE.DirectionalLight(0xffffff, 0.75); key.position.set(0.001, 10, 0.001); scene.add(key);
window.take = async (id, length) => {
  const bike = await loadBike(id, { base: '/assets/vehicles/bikes/game/', lite: false, length });
  bike.pose({});
  scene.add(bike.group);
  bike.group.updateMatrixWorld(true);
  // (the bike itself: not its lamps' glows or the flames kept hidden at its pipes, which are not drawn standing still)
  const box = new THREE.Box3();
  bike.group.traverse((o) => { if (o.isMesh && o.castShadow) box.expandByObject(o); });
  const centre = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  // the frame: square, holding the bike whole from every side at this height
  const across = Math.hypot(size.x, size.z) / 2;
  const half = Math.max(across, (size.y * Math.cos(${ELEVATION}) + 2 * across * Math.sin(${ELEVATION})) / 2) * 1.04;
  const camera = new THREE.OrthographicCamera(-half, half, half, -half, 0.05, 40);
  const sheet = document.createElement('canvas'); sheet.width = ${FRAME * COLS}; sheet.height = ${FRAME * ROWS};
  const g = sheet.getContext('2d'); g.imageSmoothingQuality = 'high';
  for (let i = 0; i < ${FRAMES}; i += 1) {
    // frame i: seen from i twenty-fourths of the way round, from in front (+z, the way the bike faces) toward its left (+x)
    const a = (i / ${FRAMES}) * Math.PI * 2, d = 12;
    camera.position.set(centre.x + Math.sin(a) * Math.cos(${ELEVATION}) * d, centre.y + Math.sin(${ELEVATION}) * d, centre.z + Math.cos(a) * Math.cos(${ELEVATION}) * d);
    camera.lookAt(centre); camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    g.drawImage(canvas, (i % ${COLS}) * ${FRAME}, Math.floor(i / ${COLS}) * ${FRAME}, ${FRAME}, ${FRAME});
  }
  scene.remove(bike.group);
  bike.dispose();
  return { sheet: await b64(await blobOf(sheet, 'image/webp', 0.9)), size: +(half * 2).toFixed(4), centre: [+centre.x.toFixed(4), +centre.y.toFixed(4), +centre.z.toFixed(4)], box: [+size.x.toFixed(3), +size.y.toFixed(3), +size.z.toFixed(3)] };
};
window.ready = true;
</script>`;
const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(page_html); return; }
  const file = resolve(root, `.${url}`);
  if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Content-Length': statSync(file).size });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: FRAME * 2, height: FRAME * 2 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.waitForFunction(() => window.ready === true, null, { timeout: 600000 });
const measured = {};
for (const id of ids) {
  const out = await page.evaluate(([which, length]) => window.take(which, length), [id, POWER_BIKES[id].length]);
  const sheet = Buffer.from(out.sheet, 'base64');
  writeFileSync(resolve(root, `assets/market/bike-${id}-impostor.webp`), sheet);
  measured[id] = { size: out.size, centre: out.centre };
  console.log(`${id}: ${(sheet.length / 1024).toFixed(0)} KB, frame ${out.size} m, centre ${out.centre.join(', ')}, box ${out.box.join(' x ')}`);
}
await browser.close();
server.close();
// (named bikes only: their measurements join those already written for the rest, which are kept as they are)
const all = process.argv.slice(2).length === 0 ? measured : { ...(await import(resolve(root, 'src/client/bike-impostors.js'))).BIKE_IMPOSTOR.bikes, ...measured };
const sorted = Object.fromEntries(Object.keys(all).sort().map((k) => [k, all[k]]));
{
  writeFileSync(resolve(root, 'src/client/bike-impostors.js'),
    `// Written by tools/vehicles/bike_impostors.mjs: do not edit by hand.\n` +
    `// Each motorcycle's pictures from all round (assets/market/bike-<id>-impostor.webp): ${FRAMES} frames, ${COLS} across and ${ROWS} down,\n` +
    `// frame i seen from i/${FRAMES} of the way round from the bike's front toward its left, ${ELEVATION} rad above. \`size\` is the side of a\n` +
    `// frame in metres; \`centre\` where the middle of the picture is, from the bike's own origin on the ground (metres).\n` +
    `export const BIKE_IMPOSTOR = Object.freeze({ frames: ${FRAMES}, cols: ${COLS}, rows: ${ROWS}, elevation: ${ELEVATION}, bikes: ${JSON.stringify(sorted)} });\n`);
  console.log('written src/client/bike-impostors.js');
}
