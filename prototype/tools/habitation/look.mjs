// Pictures of the habitation's models, drawn by three.js in a browser as the game lights its world, for looking at them
// side by side (the owner's file as supplied and the game's copy made from it):
//
//   node tools/habitation/look.mjs <out.png> <a.glb>[=label] [b.glb ...] [cols=7] [size=300] [yaw=0.6] [pitch=0.18]
//                                  [sizes=name:metres,...] [ground=1]
//
// Each model is framed on its own (its height filling the frame), seen from `yaw` (radians round from its front) and
// `pitch` (radians down), on a patch of ground, in late-morning sun. Needs Playwright with Chromium.
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const out = resolve(args[0]);
const opt = (name, fallback) => { const a = args.find((x) => x.startsWith(`${name}=`)); return a ? a.slice(name.length + 1) : fallback; };
const files = args.slice(1).filter((x) => !/^(cols|size|yaw|pitch|ground|light|zoom|aim)=/.test(x)).map((x) => { const [f, label] = x.split('='); return { file: resolve(f), label: label || basename(f).replace(/3dmodel|\.glb$/g, '') }; });
const COLS = Math.min(Number(opt('cols', 7)), files.length), SIZE = Number(opt('size', 300));
const YAW = Number(opt('yaw', 0.6)), PITCH = Number(opt('pitch', 0.18)), GROUND = opt('ground', '1') === '1';
const ZOOM = Number(opt('zoom', 1)), AIM = opt('aim', '0.5,0.5,0.5').split(',').map(Number);
const ROWS = Math.ceil(files.length / COLS);

const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(PAGE); return; }
  if (url === '/three.min.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(readFileSync(resolve(root, 'vendor/three.min.js'))); return; }
  if (url.startsWith('/src/client/') && url.endsWith('.js') && existsSync(resolve(root, url.slice(1)))) { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(readFileSync(resolve(root, url.slice(1)))); return; }
  // a picture a model names (the leaves' sheet): beside the model's own file
  const f = /^\/beside\/(\d+)\/([\w.-]+)$/.exec(url);
  if (f && files[+f[1]]) { const p = resolve(dirname(files[+f[1]].file), f[2]); if (existsSync(p)) { res.writeHead(200, { 'content-type': 'image/webp' }); res.end(readFileSync(p)); return; } }
  const m = /^\/model\/(\d+)$/.exec(url);
  if (m && files[+m[1]] && existsSync(files[+m[1]].file)) { res.writeHead(200, { 'content-type': 'model/gltf-binary' }); res.end(readFileSync(files[+m[1]].file)); return; }
  res.writeHead(404); res.end();
});
const PAGE = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000">
<canvas id="c" width="${COLS * SIZE}" height="${ROWS * SIZE}"></canvas>
<script src="/three.min.js"></script>
<script type="module">
import { readDressed } from '/src/client/habitation-plants.js';
const TYPES = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const sharedPictures = new Map();
function sharedPicture(i, uri, colour) {
  const key = i + ':' + uri;
  if (!sharedPictures.has(key)) sharedPictures.set(key, (async () => { const blob = await (await fetch('/beside/' + i + '/' + uri)).blob(); const bmp = await createImageBitmap(blob, { imageOrientation: 'none', premultiplyAlpha: 'none' }); const t = new THREE.Texture(bmp); t.flipY = false; if (colour) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.needsUpdate = true; t.userData.shared = true; return t; })());
  return sharedPictures.get(key);
}
async function load(i) {
  const buf = await (await fetch('/model/' + i)).arrayBuffer();
  // a model made by dress.py: drawn as the game draws it (habitation-plants.js)
  { const dv = new DataView(buf); const len = dv.getUint32(12, true); const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, len))); if (head.extras && head.extras.dressed) { const m = await readDressed(buf, { shared: (uri, colour) => sharedPicture(i, uri, colour) }); return m.make(); } }
  const dv = new DataView(buf); let at = 12, json, bin;
  while (at < dv.byteLength) { const len = dv.getUint32(at, true), type = dv.getUint32(at + 4, true); if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, at + 8, len))); else bin = new Uint8Array(buf, at + 8, len); at += 8 + len; }
  const acc = (k) => { const a = json.accessors[k], v = json.bufferViews[a.bufferView], T = TYPES[a.componentType], n = a.count * WIDTH[a.type];
    const stride = v.byteStride || 0, size = WIDTH[a.type] * T.BYTES_PER_ELEMENT, off = bin.byteOffset + (v.byteOffset || 0) + (a.byteOffset || 0);
    if (!stride || stride === size) return new T(bin.buffer.slice(off, off + n * T.BYTES_PER_ELEMENT));
    const outA = new T(n); const src = new DataView(bin.buffer); for (let e = 0; e < a.count; e++) for (let c = 0; c < WIDTH[a.type]; c++) { const o = off + e * stride + c * T.BYTES_PER_ELEMENT; outA[e * WIDTH[a.type] + c] = T === Float32Array ? src.getFloat32(o, true) : T === Uint16Array ? src.getUint16(o, true) : T === Int16Array ? src.getInt16(o, true) : T === Uint8Array ? src.getUint8(o) : src.getInt8(o); } return outA; };
  const group = new THREE.Group();
  const textures = {};
  const texture = async (ti, colour) => { const key = ti + ':' + colour; if (textures[key]) return textures[key];
    const tx = json.textures[ti]; const img = json.images[tx.source ?? (tx.extensions && tx.extensions.EXT_texture_webp && tx.extensions.EXT_texture_webp.source)]; const v = json.bufferViews[img.bufferView];
    const blob = new Blob([new Uint8Array(bin.buffer, bin.byteOffset + (v.byteOffset || 0), v.byteLength)], { type: img.mimeType });
    const bmp = await createImageBitmap(blob, { imageOrientation: 'none' });
    const t = new THREE.Texture(bmp); t.flipY = false; if (colour) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.needsUpdate = true; return (textures[key] = t); };
  for (const node of json.nodes || []) {
    if (node.mesh === undefined) continue;
    for (const p of json.meshes[node.mesh].primitives) {
      const g = new THREE.BufferGeometry();
      const q = (k) => { const a = json.accessors[k]; let arr = acc(k); if (a.normalized || (a.componentType !== 5126)) { const max = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }[a.componentType]; if (a.normalized) arr = Float32Array.from(arr, (x) => Math.max(x / max, -1)); else arr = Float32Array.from(arr); } return arr; };
      g.setAttribute('position', new THREE.BufferAttribute(q(p.attributes.POSITION), 3));
      if (p.attributes.NORMAL !== undefined) g.setAttribute('normal', new THREE.BufferAttribute(q(p.attributes.NORMAL), 3));
      if (p.attributes.TEXCOORD_0 !== undefined) g.setAttribute('uv', new THREE.BufferAttribute(q(p.attributes.TEXCOORD_0), 2));
      if (p.attributes.COLOR_0 !== undefined) g.setAttribute('color', new THREE.BufferAttribute(q(p.attributes.COLOR_0), json.accessors[p.attributes.COLOR_0].type === 'VEC4' ? 4 : 3));
      if (p.attributes._SWAY !== undefined) g.setAttribute('sway', new THREE.BufferAttribute(q(p.attributes._SWAY), 1));
      if (p.indices !== undefined) g.setIndex(new THREE.BufferAttribute(acc(p.indices), 1));
      if (!g.attributes.normal) g.computeVertexNormals();
      const md = json.materials[p.material || 0] || {}; const pbr = md.pbrMetallicRoughness || {};
      const mat = new THREE.MeshStandardMaterial({ roughness: pbr.roughnessFactor ?? 1, metalness: pbr.metallicFactor ?? 1, side: md.doubleSided ? THREE.DoubleSide : THREE.FrontSide, vertexColors: !!g.attributes.color });
      if (pbr.baseColorFactor) mat.color.setRGB(pbr.baseColorFactor[0], pbr.baseColorFactor[1], pbr.baseColorFactor[2]);
      if (pbr.baseColorTexture) mat.map = await texture(pbr.baseColorTexture.index, true);
      if (md.normalTexture) { mat.normalMap = await texture(md.normalTexture.index, false); mat.normalScale.set(md.normalTexture.scale ?? 1, -(md.normalTexture.scale ?? 1)); }
      if (pbr.metallicRoughnessTexture) { mat.roughnessMap = mat.metalnessMap = await texture(pbr.metallicRoughnessTexture.index, false); }
      if (md.occlusionTexture) { mat.aoMap = await texture(md.occlusionTexture.index, false); if (g.attributes.uv) g.setAttribute('uv2', g.attributes.uv); }
      if (md.alphaMode === 'MASK') { mat.alphaTest = md.alphaCutoff ?? 0.5; mat.transparent = false; }
      if (md.alphaMode === 'BLEND') { mat.transparent = true; mat.depthWrite = false; }
      const mesh = new THREE.Mesh(g, mat); mesh.castShadow = true; mesh.receiveShadow = true;
      if (node.translation) mesh.position.fromArray(node.translation); if (node.rotation) mesh.quaternion.fromArray(node.rotation); if (node.scale) mesh.scale.fromArray(node.scale);
      group.add(mesh);
    }
  }
  return group;
}
window.draw = async function draw(n, yaw, pitch, size, cols, ground, zoom, aim) {
  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.setScissorTest(true);
  for (let i = 0; i < n; i++) {
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0xa9c9df);
    // the town's light at ten in the morning (render-sky.js): the sky's light, and the sun's
    const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();
    // (three.js r186's units: π times r128's, src/client/light.js)
    const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 0.68 * Math.PI); hemi.color.copy(lin(0x3f8fe0)).lerp(new THREE.Color(1, 1, 1), 0.55); hemi.groundColor.copy(lin(0x8a7a5a)).multiplyScalar(0.7 + 0.68 * 0.5);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(lin(0xfff4e0), 1.3 * Math.PI); sun.position.set(3, 6, 4); sun.castShadow = true; sun.shadow.radius = 1.73; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006;
    scene.add(sun); scene.add(sun.target);
    const model = await load(i);
    const box = new THREE.Box3().setFromObject(model); const s = box.getSize(new THREE.Vector3()); const c = new THREE.Vector3(box.min.x + s.x * aim[0], box.min.y + s.y * aim[1], box.min.z + s.z * aim[2]);
    const r = Math.max(s.x, s.y, s.z);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -r; sun.shadow.camera.right = sun.shadow.camera.top = r; sun.shadow.camera.near = 0.01; sun.shadow.camera.far = 20 * r; sun.position.set(c.x + 3 * r, c.y + 6 * r, c.z + 4 * r); sun.target.position.copy(c); sun.shadow.camera.updateProjectionMatrix();
    scene.add(model);
    model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    if (ground) { const gm = new THREE.Mesh(new THREE.CircleGeometry(r * 1.6, 48), new THREE.MeshStandardMaterial({ color: 0x8a7a5c, roughness: 1 })); gm.rotation.x = -Math.PI / 2; gm.position.y = box.min.y - 0.002 * r; gm.receiveShadow = true; scene.add(gm); }
    const cam = new THREE.PerspectiveCamera(30, 1, r / 100, r * 50);
    const d = r / Math.tan(15 * Math.PI / 180) * 0.62 / zoom;
    cam.position.set(c.x + d * Math.sin(yaw) * Math.cos(pitch), c.y + d * Math.sin(pitch), c.z + d * Math.cos(yaw) * Math.cos(pitch)); cam.lookAt(c);
    const x = (i % cols) * size, y = canvas.height - (Math.floor(i / cols) + 1) * size;
    renderer.setViewport(x, y, size, size); renderer.setScissor(x, y, size, size);
    renderer.render(scene, cam);
    window.__dims = window.__dims || []; window.__dims.push([s.x, s.y, s.z]);
    scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { for (const k of ['map', 'normalMap', 'roughnessMap', 'aoMap']) if (o.material[k]) o.material[k].dispose(); o.material.dispose(); } });
  }
  return window.__dims;
};
window.__ready = true;
</script>`;
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: COLS * SIZE, height: ROWS * SIZE }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('page:', e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.waitForFunction(() => window.__ready === true);
const dims = await page.evaluate(([n, yaw, pitch, size, cols, ground, zoom, aim]) => draw(n, yaw, pitch, size, cols, ground, zoom, aim), [files.length, YAW, PITCH, SIZE, COLS, GROUND, ZOOM, AIM]);
await page.screenshot({ path: out });
// the labels, written under each picture by the browser's own text (a second pass over the same page)
await page.evaluate(([labels, size, cols]) => {
  const c = document.getElementById('c'); const g = document.createElement('canvas'); g.width = c.width; g.height = c.height; const x = g.getContext('2d');
  x.drawImage(c, 0, 0); x.font = '600 13px sans-serif'; x.textBaseline = 'bottom';
  labels.forEach((l, i) => { const px = (i % cols) * size + 6, py = (Math.floor(i / cols) + 1) * size - 6; x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillRect(px - 4, py - 17, x.measureText(l).width + 8, 19); x.fillStyle = '#fff'; x.fillText(l, px, py); });
  document.body.innerHTML = ''; g.style.display = 'block'; document.body.appendChild(g);
}, [files.map((f) => f.label), SIZE, COLS]);
await page.screenshot({ path: out });
writeFileSync(out.replace(/\.png$/, '.json'), JSON.stringify(files.map((f, i) => ({ file: f.file, label: f.label, dims: dims[i] })), null, 1));
await browser.close(); server.close();
console.log('wrote', out);
