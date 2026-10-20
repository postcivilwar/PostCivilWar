// The figures as the character screen shows them, drawn by the game's own code (animated.js, glb.js), for two things:
//
//   node tools/characters/previews.mjs turn [ids...]      each figure's turntable: its light copy from sixteen sides, as
//                                                          the character screen lights it, standing as it stands there;
//                                                          written to assets/characters/figures/light/<name>.turn.webp,
//                                                          with turns.json (what each frame holds). The character screen
//                                                          shows these the instant a figure is asked for (creator.js),
//                                                          until the figure itself has come.
//   node tools/characters/previews.mjs compare <out> [ids...] [size=1024] [w=390 h=450 dpr=2]
//                                                          the owner's file and its light copy side by side, at the size a
//                                                          phone's character screen shows them, in the same pose, from the
//                                                          front, the side and the back; with how far apart the two
//                                                          pictures are, pixel by pixel (compare.json)
//
// Needs Playwright with Chromium. The figures are read exactly as the game reads them: the owner's file by glb.js
// (its pictures made smaller to `size` on the way to the graphics card, as a phone does), the light copy as the
// website sends it (tools/characters/light.py).
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { writeFileSync, readFileSync, createReadStream, statSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve, extname, sep, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const LIGHT = resolve(root, 'assets/characters/figures/light');
const ORIGINALS = resolve(root, 'assets/characters/figures/animated');
const { FIGURES } = await import(resolve(root, 'src/sim/figures.js'));
const mode = process.argv[2];
if (!['turn', 'compare'].includes(mode)) { console.error('usage: previews.mjs turn [ids...] | compare <out> [ids...]'); process.exit(2); }
const out = mode === 'compare' ? resolve(process.argv[3]) : null;
const rest = process.argv.slice(mode === 'compare' ? 4 : 3);
const opt = (name, fallback) => { const a = rest.find((x) => x.startsWith(`${name}=`)); return a ? Number(a.split('=')[1]) : fallback; };
const ids = rest.filter((x) => !x.includes('=')).length ? rest.filter((x) => !x.includes('=')) : Object.keys(FIGURES);
const SIZE = opt('size', 1024), W = opt('w', 390), H = opt('h', 450), DPR = opt('dpr', 2);
// the turntable: sixteen frames, four across, each FW by FH pixels; the frame holds the figure from BAND[0] to BAND[1]
// metres above the ground, centred on it, seen level from the front (+z) and then round toward its left
const FRAMES = 16, COLS = 4, FW = 256, FH = 384, BAND = [-0.08, 2.0];
const TYPES = { '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.gz': 'application/gzip', '.glb': 'model/gltf-binary' };

// the light copies, as the website's table lists them (build.mjs), served from here
const made = JSON.parse(readFileSync(resolve(LIGHT, 'made.json'), 'utf8'));
const lightTable = {};
for (const f of Object.values(FIGURES)) {
  const entry = made.figures[f.file];
  if (!entry) continue;
  const stem = f.file.replace(/\.glb$/, '');
  const glb = gunzipSync(readFileSync(resolve(LIGHT, `${stem}.glb.gz`)));
  const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8'));
  const pictures = json.images.map((img, index) => ({ index, sizes: Object.fromEntries([img.uri, ...Object.values((img.extras && img.extras.larger) || {})].map((name) => [Number(/\.[cnm](\d+)\.webp$/.exec(name)[1]), [`/light/${name}`, statSync(resolve(LIGHT, name)).size]])) }));
  lightTable[f.id] = { file: f.file, model: `/light/${stem}.glb.gz`, bytes: statSync(resolve(LIGHT, `${stem}.glb.gz`)).size, pictures };
}

const page_html = (light) => `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000">
<canvas id="c" width="${W * DPR}" height="${H * DPR}" style="width:${W}px;height:${H}px"></canvas>
<script>window.__PCW_FIGURES = ${light ? JSON.stringify({ figures: lightTable }) : '{}'};</script>
<script src="/vendor/three.min.js"></script><script type="module">
import { makeAnimatedRig, driveAnimated } from '/src/client/animated.js';
const blobOf = (c, type, q) => new Promise((r) => c.toBlob(r, type, q));
const b64 = async (blob) => { const bytes = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(${W * DPR}, ${H * DPR}, false);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.setClearColor(0x000000, 0);
// lit as the character screen lights it (creator.js)
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xe8eef6, 0x2a2622, 0.75));
const key = new THREE.DirectionalLight(0xfff4e6, 1.15); key.position.set(2.2, 3.4, 3.0); scene.add(key);
const rim = new THREE.DirectionalLight(0xbfd2ff, 0.55); rim.position.set(-2.6, 2.4, -2.8); scene.add(rim);
const floor = new THREE.Mesh(new THREE.CircleGeometry(0.42, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.06, depthWrite: false }));
floor.rotation.x = -Math.PI / 2;
const ring = new THREE.Mesh(new THREE.RingGeometry(0.41, 0.418, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false }));
ring.rotation.x = -Math.PI / 2; ring.position.y = 0.002;
// the character screen's camera for a view w by h (creator.js, frame)
function screenCamera(w, h) {
  const camera = new THREE.PerspectiveCamera(26, w / h, 0.1, 50);
  const top = 8, foot = 6;
  const band = Math.max(80, h - top - foot) / Math.max(1, h);
  const tall = 1.76, half = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const dist = Math.max(tall / band / 2 / half, (0.95 / Math.max(0.3, camera.aspect)) / half) + 0.4;
  const shift = ((top + (h - foot)) / 2 - h / 2) / Math.max(1, h);
  const visible = 2 * dist * half;
  camera.position.set(0, 0.95 + shift * visible, dist); camera.lookAt(0, 0.92 + shift * visible, 0);
  return camera;
}
async function figure(id) {
  const rig = makeAnimatedRig(id, null, false);
  rig.held = true; rig.play(rig.spec.still, 0);
  await rig.loaded;
  if (rig.label) rig.label.visible = false;
  rig.blob.visible = false;
  // the same moment of its standing for every picture: a second into it
  driveAnimated(rig, 0.016, 0);
  rig.mixer.setTime(1.0);
  rig.group.updateMatrixWorld(true);
  return rig;
}
// the owner's file or its light copy, on the character screen, from three sides; the picture of each
window.compare = async (id) => {
  const rig = await figure(id);
  scene.add(floor); scene.add(ring); scene.add(rig.group);
  const camera = screenCamera(${W}, ${H});
  const shots = [];
  for (const yaw of [0.35, Math.PI / 2, Math.PI]) {
    rig.group.rotation.y = yaw; rig.group.updateMatrixWorld(true);
    renderer.render(scene, camera);
    shots.push(await b64(await blobOf(canvas, 'image/png')));
  }
  scene.remove(rig.group); scene.remove(floor); scene.remove(ring);
  const info = { triangles: rig.triangles, clip: rig.current ? rig.current.getClip().name : null };
  rig.dispose();
  return { shots, info };
};
// the turntable: the light copy from sixteen sides on a transparent ground, the figure alone
window.turn = async (id) => {
  const rig = await figure(id);
  scene.add(rig.group);
  const frame = document.createElement('canvas'); frame.width = ${FW}; frame.height = ${FH};
  renderer.setSize(${FW}, ${FH}, false);
  const h = ${BAND[1] - BAND[0]}, w = h * ${FW} / ${FH};
  const camera = new THREE.OrthographicCamera(-w / 2, w / 2, ${BAND[1]}, ${BAND[0]}, 0.1, 50);
  camera.position.set(0, 0, 12); camera.lookAt(0, 0, 0);
  // level, from in front: the character screen's own camera is a little above, which a level view stands for well
  const sheet = document.createElement('canvas'); sheet.width = ${FW * COLS}; sheet.height = ${FH * (FRAMES / COLS)};
  const g = sheet.getContext('2d');
  for (let i = 0; i < ${FRAMES}; i += 1) {
    rig.group.rotation.y = (i / ${FRAMES}) * Math.PI * 2; rig.group.updateMatrixWorld(true);
    renderer.render(scene, camera);
    g.drawImage(canvas, 0, 0, ${FW}, ${FH}, (i % ${COLS}) * ${FW}, Math.floor(i / ${COLS}) * ${FH}, ${FW}, ${FH});
  }
  renderer.setSize(${W * DPR}, ${H * DPR}, false);
  scene.remove(rig.group);
  rig.dispose();
  return b64(await blobOf(sheet, 'image/webp', 0.82));
};
window.ready = true;
</script>`;

const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/' || url === '/light.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(page_html(url === '/light.html')); return; }
  let file = resolve(root, `.${url}`);
  if (url.startsWith('/light/')) file = resolve(LIGHT, url.slice(7));
  else if (/^\/[^/]+\.glb$/.test(url)) file = resolve(ORIGINALS, url.slice(1));
  if (!(file.startsWith(root + sep)) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Content-Length': statSync(file).size });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const open = async (path) => {
  const page = await browser.newPage({ viewport: { width: Math.max(W, FW), height: Math.max(H, FH) }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  // (#lite: the pictures as a phone has them)
  await page.goto(`${origin}${path}#${SIZE <= 1024 ? 'lite' : 'full'}`);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 600000 });
  page.setDefaultTimeout(600000);
  return page;
};

if (mode === 'turn') {
  const light = await open('/light.html');
  const turnsFile = resolve(LIGHT, 'turns.json');
  const turns = existsSync(turnsFile) ? JSON.parse(readFileSync(turnsFile, 'utf8')) : { figures: {} };
  turns.frames = FRAMES; turns.cols = COLS; turns.frame = [FW, FH]; turns.band = BAND;
  for (const id of ids) {
    const f = FIGURES[id]; const stem = f.file.replace(/\.glb$/, '');
    const sheet = Buffer.from(await light.evaluate((which) => window.turn(which), id), 'base64');
    writeFileSync(resolve(LIGHT, `${stem}.turn.webp`), sheet);
    turns.figures[f.file] = { madeFrom: createHash('sha256').update(readFileSync(resolve(LIGHT, `${stem}.glb.gz`))).digest('hex').slice(0, 16), bytes: sheet.length };
    console.log(`${id} ${f.file}: ${(sheet.length / 1024).toFixed(0)} KB`);
  }
  turns.figures = Object.fromEntries(Object.keys(turns.figures).sort().map((k) => [k, turns.figures[k]]));
  writeFileSync(turnsFile, `${JSON.stringify(turns, null, 1)}\n`);
} else {
  mkdirSync(out, { recursive: true });
  const original = await open('/');
  const light = await open('/light.html');
  // two pictures alike, pixel by pixel: in the part where either has the figure (or its ground)
  const results = {};
  for (const id of ids) {
    const a = await original.evaluate((which) => window.compare(which), id);
    const b = await light.evaluate((which) => window.compare(which), id);
    const diff = await light.evaluate(async ([sa, sb]) => {
      const load = async (s) => { const img = new Image(); img.src = `data:image/png;base64,${s}`; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; };
      const out = [];
      for (let k = 0; k < sa.length; k += 1) {
        const x = await load(sa[k]), y = await load(sb[k]);
        let n = 0, sum = 0, sq = 0, big = 0;
        for (let i = 0; i < x.length; i += 4) {
          if (x[i + 3] < 8 && y[i + 3] < 8) continue;
          n += 1;
          const d = (Math.abs(x[i] - y[i]) + Math.abs(x[i + 1] - y[i + 1]) + Math.abs(x[i + 2] - y[i + 2])) / 3 + Math.abs(x[i + 3] - y[i + 3]) / 3;
          sum += d; sq += d * d; if (d > 16) big += 1;
        }
        out.push({ pixels: n, mean: +(sum / Math.max(1, n)).toFixed(2), psnr: +(10 * Math.log10(255 * 255 / Math.max(1e-9, sq / Math.max(1, n)))).toFixed(1), over16: +(100 * big / Math.max(1, n)).toFixed(2) });
      }
      return out;
    }, [a.shots, b.shots]);
    results[id] = { file: FIGURES[id].file, original: a.info, light: b.info, sides: diff };
    // side by side: the owner's file on the left of each pair, the light copy on the right
    for (let k = 0; k < a.shots.length; k += 1) {
      writeFileSync(resolve(out, `${id}-${k}-file.png`), Buffer.from(a.shots[k], 'base64'));
      writeFileSync(resolve(out, `${id}-${k}-light.png`), Buffer.from(b.shots[k], 'base64'));
    }
    console.log(`${id} ${FIGURES[id].file}: ${diff.map((d) => `mean ${d.mean} psnr ${d.psnr} dB, ${d.over16}% off by more than 16`).join(' | ')}`);
  }
  writeFileSync(resolve(out, 'compare.json'), JSON.stringify(results, null, 1));
}
await browser.close();
server.close();
