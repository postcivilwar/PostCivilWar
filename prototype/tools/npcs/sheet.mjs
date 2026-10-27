// The owner's NPC and police models, each drawn as it is in its file (nothing changed, nothing made lighter), from four
// sides, with what it is made of: for the list the owner asked for before his NPCs are brought in (26 October 2026).
//   node tools/npcs/sheet.mjs <out folder> <glb files...>
// Writes <out>/<name>.png (front, left, back, right, on a grey ground, 1 m marks) and <out>/sheet.json (each file's
// triangles, points, pictures, skeleton, moves, height as made). Drawn in software here: the light is plain, for seeing
// the model, not the game's.
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const out = resolve(process.argv[2]); mkdirSync(out, { recursive: true });
const files = process.argv.slice(3).map((f) => resolve(f));
const three = readFileSync(resolve(root, 'vendor/three.min.js'));
const server = createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/three.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(three); return; }
  if (u === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><body style="margin:0;background:#888"><script src="/three.js"></script></body>'); return; }
  const i = Number(u.slice(1)); if (!(i >= 0 && i < files.length)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': 'model/gltf-binary' }); res.end(readFileSync(files[i]));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 640 } });
page.setDefaultTimeout(600000);
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/`);
const sheet = [];
for (let i = 0; i < files.length; i += 1) {
  const info = await page.evaluate(async (i) => {
    const buf = await (await fetch(`/${i}`)).arrayBuffer();
    const dv = new DataView(buf); let at = 12, json = null, bin = null;
    while (at < buf.byteLength) { const len = dv.getUint32(at, true), type = dv.getUint32(at + 4, true); if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, at + 8, len))); else bin = new Uint8Array(buf, at + 8, len); at += 8 + len; }
    const C = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }, N = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
    const acc = (k) => { const a = json.accessors[k], v = json.bufferViews[a.bufferView], T = C[a.componentType], n = N[a.type], stride = v.byteStride || T.BYTES_PER_ELEMENT * n, out = new T(a.count * n), src = new DataView(bin.buffer, bin.byteOffset + (v.byteOffset || 0) + (a.byteOffset || 0)); const get = { 5126: 'getFloat32', 5125: 'getUint32', 5123: 'getUint16', 5121: 'getUint8', 5122: 'getInt16', 5120: 'getInt8' }[a.componentType]; for (let e = 0; e < a.count; e += 1) for (let c = 0; c < n; c += 1) out[e * n + c] = src[get](e * stride + c * T.BYTES_PER_ELEMENT, true); return { array: out, n, norm: !!a.normalized }; };
    const pics = await Promise.all((json.images || []).map((im) => { const v = json.bufferViews[im.bufferView]; return createImageBitmap(new Blob([bin.slice(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength)], { type: im.mimeType })); }));
    const texOf = (ref, colour) => { if (!ref) return null; const t = new THREE.Texture(pics[json.textures[ref.index].source]); t.flipY = false; if (colour) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; };
    const group = new THREE.Group();
    const world = new Map();
    const local = (n) => { const m = new THREE.Matrix4(); if (n.matrix) m.fromArray(n.matrix); else m.compose(new THREE.Vector3(...(n.translation || [0, 0, 0])), new THREE.Quaternion(...(n.rotation || [0, 0, 0, 1])), new THREE.Vector3(...(n.scale || [1, 1, 1]))); return m; };
    const walk = (k, parent) => { const m = parent.clone().multiply(local(json.nodes[k])); world.set(k, m); for (const c of json.nodes[k].children || []) walk(c, m); };
    for (const r of json.scenes[json.scene || 0].nodes) walk(r, new THREE.Matrix4());
    let tris = 0, points = 0;
    json.nodes.forEach((n, k) => {
      if (n.mesh === undefined) return;
      for (const p of json.meshes[n.mesh].primitives) {
        const g = new THREE.BufferGeometry(), pos = acc(p.attributes.POSITION);
        g.setAttribute('position', new THREE.BufferAttribute(pos.array, 3)); points += pos.array.length / 3;
        if (p.attributes.NORMAL !== undefined) g.setAttribute('normal', new THREE.BufferAttribute(acc(p.attributes.NORMAL).array, 3));
        if (p.attributes.TEXCOORD_0 !== undefined) { const uv = acc(p.attributes.TEXCOORD_0); g.setAttribute('uv', new THREE.BufferAttribute(uv.array, 2, uv.norm)); }
        if (p.indices !== undefined) { const ix = acc(p.indices).array; g.setIndex(new THREE.BufferAttribute(ix, 1)); tris += ix.length / 3; } else tris += pos.array.length / 9;
        if (p.attributes.NORMAL === undefined) g.computeVertexNormals();
        const m = (json.materials || [])[p.material || 0] || {}, pbr = m.pbrMetallicRoughness || {};
        const mat = new THREE.MeshStandardMaterial({ map: texOf(pbr.baseColorTexture, true), normalMap: texOf(m.normalTexture, false), roughness: 0.8, metalness: 0, side: THREE.DoubleSide });
        if (pbr.baseColorFactor) mat.color.setRGB(...pbr.baseColorFactor.slice(0, 3));
        const mesh = new THREE.Mesh(g, mat);
        // (a skinned mesh as bound: three draws it from its bind pose, its node's own place not applied)
        if (n.skin === undefined) mesh.applyMatrix4(world.get(k));
        group.add(mesh);
      }
    });
    const box = new THREE.Box3().setFromObject(group), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
    // stood on the ground, its height 1.75 m to draw (all of them are made a unit tall)
    const k = 1.75 / size.y; group.scale.setScalar(k); group.position.set(-mid.x * k, -box.min.y * k, -mid.z * k);
    const r = window.__r || (window.__r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }));
    r.setSize(1600, 640); r.outputColorSpace = THREE.SRGBColorSpace; if (!r.domElement.parentNode) document.body.appendChild(r.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x8a8a8a);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x666655, 1.6)); const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(2, 4, 3); scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: 0x9a9a9a })); ground.rotation.x = -Math.PI / 2; scene.add(ground);
    scene.add(group);
    r.setScissorTest(true);
    const cam = new THREE.PerspectiveCamera(30, 400 / 640, 0.1, 50);
    // (the four sides: along +x, +z, -x, -z; which is the front is seen on the sheet)
    [[1, 0], [0, 1], [-1, 0], [0, -1]].forEach(([dx, dz], s) => { cam.position.set(dx * 5.2, 1.0, dz * 5.2); cam.lookAt(0, 0.88, 0); r.setViewport(s * 400, 0, 400, 640); r.setScissor(s * 400, 0, 400, 640); r.render(scene, cam); });
    scene.remove(group);
    group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); for (const t of [o.material.map, o.material.normalMap]) if (t) t.dispose(); o.material.dispose(); } });
    const skins = json.skins || [];
    return { triangles: tris, points, meshes: (json.meshes || []).length, materials: (json.materials || []).length, pictures: pics.map((p) => `${p.width}x${p.height}`), skeleton: skins.length ? skins[0].joints.length : 0, moves: (json.animations || []).map((a) => a.name.replace(/\.\d+$/, '')), madeSize: [+size.x.toFixed(3), +size.y.toFixed(3), +size.z.toFixed(3)], generator: (json.asset || {}).generator };
  }, i);
  const name = basename(files[i], '.glb');
  await page.screenshot({ path: resolve(out, `${name}.png`) });
  sheet.push({ file: basename(files[i]), bytes: readFileSync(files[i]).length, ...info });
  console.log(name, JSON.stringify(info));
}
writeFileSync(resolve(out, 'sheet.json'), JSON.stringify(sheet, null, 1));
await browser.close(); server.close();
