// A rigged figure (one of tools/npcs/rig.py's, or any of the owner's rigged models) drawn in a few moments of a few
// moves, taken from another of his rigged models with the same skeleton (only the bones' turns: each figure keeps its
// own bone lengths), from the front and the side: how it bends at the hips, knees, shoulders and elbows, for checking
// a skeleton given to a model that came without one (26 October 2026).
//   node tools/npcs/poses.mjs <out.png> <figure.glb> <moves.glb> <move:time,...>
// e.g. walk.001:0.3 box_01.001:0.8. The figure's own pose as bound is drawn first.
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const [outPng, figureFile, movesFile, ...asked] = process.argv.slice(2);
const moments = [['bound', 0], ...asked.map((a) => { const i = a.lastIndexOf(':'); return [a.slice(0, i), Number(a.slice(i + 1))]; })];
const files = [resolve(figureFile), resolve(movesFile)];
const three = readFileSync(resolve(root, 'vendor/three.min.js'));
const server = createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/three.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(three); return; }
  if (u === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><body style="margin:0"><script src="/three.js"></script></body>'); return; }
  const i = Number(u.slice(1)); res.writeHead(200); res.end(readFileSync(files[i]));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const W = 300, H = 480;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W * 2 * moments.length, height: H } });
page.setDefaultTimeout(600000);
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/`);
const result = await page.evaluate(async ({ moments, W, H }) => {
  const read = async (i) => {
    const buf = await (await fetch(`/${i}`)).arrayBuffer();
    const dv = new DataView(buf); let at = 12, json = null, bin = null;
    while (at < buf.byteLength) { const len = dv.getUint32(at, true), type = dv.getUint32(at + 4, true); if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, at + 8, len))); else bin = new Uint8Array(buf, at + 8, len); at += 8 + len; }
    const C = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }, N = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
    const acc = (k) => { const a = json.accessors[k], v = json.bufferViews[a.bufferView], T = C[a.componentType], n = N[a.type], stride = v.byteStride || T.BYTES_PER_ELEMENT * n, out = new T(a.count * n), src = new DataView(bin.buffer, bin.byteOffset + (v.byteOffset || 0) + (a.byteOffset || 0)); const get = { 5126: 'getFloat32', 5125: 'getUint32', 5123: 'getUint16', 5121: 'getUint8', 5122: 'getInt16', 5120: 'getInt8' }[a.componentType]; for (let e = 0; e < a.count; e += 1) for (let c = 0; c < n; c += 1) out[e * n + c] = src[get](e * stride + c * T.BYTES_PER_ELEMENT, true); return { array: out, n, norm: !!a.normalized }; };
    return { json, bin, acc };
  };
  // (a bone's name as three.js can bind a move to it: no spaces, none of [ ] . : /)
  const clean = (n) => n.replace(/\s/g, '_').replace(/[\[\]\.:\/]/g, '');
  const fig = await read(0), mov = await read(1);
  const { json, acc, bin } = fig;
  // the figure: its nodes as bones, its body as a skinned mesh
  const skin = json.skins[0];
  const objs = json.nodes.map((n, i) => { const o = skin.joints.includes(i) ? new THREE.Bone() : new THREE.Group(); o.name = clean(n.name || `n${i}`); if (n.matrix) new THREE.Matrix4().fromArray(n.matrix).decompose(o.position, o.quaternion, o.scale); if (n.translation) o.position.fromArray(n.translation); if (n.rotation) o.quaternion.fromArray(n.rotation); if (n.scale) o.scale.fromArray(n.scale); return o; });
  json.nodes.forEach((n, i) => (n.children || []).forEach((c) => objs[i].add(objs[c])));
  const top = new THREE.Group();
  const meshNode = json.nodes.findIndex((n) => n.mesh !== undefined);
  for (const r of json.scenes[json.scene || 0].nodes) if (r !== meshNode) top.add(objs[r]);
  const p = json.meshes[0].primitives[0], g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(acc(p.attributes.POSITION).array, 3));
  if (p.attributes.NORMAL !== undefined) g.setAttribute('normal', new THREE.BufferAttribute(acc(p.attributes.NORMAL).array, 3));
  if (p.attributes.TEXCOORD_0 !== undefined) g.setAttribute('uv', new THREE.BufferAttribute(acc(p.attributes.TEXCOORD_0).array, 2));
  const ji = acc(p.attributes.JOINTS_0), wi = acc(p.attributes.WEIGHTS_0);
  g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(ji.array), 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(wi.norm ? Float32Array.from(wi.array, (v) => v / (wi.array instanceof Uint8Array ? 255 : 65535)) : wi.array, 4));
  g.setIndex(new THREE.BufferAttribute(acc(p.indices).array, 1));
  const m = json.materials[p.material || 0], pbr = m.pbrMetallicRoughness || {};
  let map = null;
  if (pbr.baseColorTexture) { const im = json.images[json.textures[pbr.baseColorTexture.index].source], v = json.bufferViews[im.bufferView]; map = new THREE.Texture(await createImageBitmap(new Blob([bin.slice(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength)], { type: im.mimeType }))); map.flipY = false; map.colorSpace = THREE.SRGBColorSpace; map.needsUpdate = true; }
  const mesh = new THREE.SkinnedMesh(g, new THREE.MeshStandardMaterial({ map, roughness: 0.8, metalness: 0, side: THREE.DoubleSide }));
  const ibm = acc(skin.inverseBindMatrices).array;
  const bones = skin.joints.map((k) => objs[k]);
  const inverses = skin.joints.map((_, j) => new THREE.Matrix4().fromArray(ibm, j * 16));
  top.add(mesh);
  top.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones, inverses), new THREE.Matrix4());
  // the moves: only the bones' turns, by name
  const mj = mov.json;
  const clips = (mj.animations || []).map((a) => new THREE.AnimationClip(a.name, -1, a.channels.filter((c) => c.target.path === 'rotation').map((c) => { const s = a.samplers[c.sampler]; return new THREE.QuaternionKeyframeTrack(`${clean(mj.nodes[c.target.node].name)}.quaternion`, mov.acc(s.input).array, mov.acc(s.output).array); })));
  const mixer = new THREE.AnimationMixer(top);
  const box = new THREE.Box3().setFromObject(mesh), k = 1.75 / (box.max.y - box.min.y);
  top.scale.setScalar(k);
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r.setSize(W * 2 * moments.length, H); r.outputColorSpace = THREE.SRGBColorSpace; document.body.appendChild(r.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x8a8a8a);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x666655, 1.6)); const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(2, 4, 3); scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: 0xa0a0a0 })); ground.rotation.x = -Math.PI / 2; scene.add(ground);
  scene.add(top);
  r.setScissorTest(true);
  const cam = new THREE.PerspectiveCamera(32, W / H, 0.1, 50);
  const names = clips.map((c) => c.name);
  moments.forEach(([name, t], i) => {
    mixer.stopAllAction();
    if (name !== 'bound') { const c = clips.find((c) => c.name === name); if (c) { const a = mixer.clipAction(c); a.play(); mixer.setTime(t); } }
    else { top.traverse((o) => {}); }
    top.updateMatrixWorld(true);
    [[1, 0], [0, 1]].forEach(([dx, dz], s) => { cam.position.set(dx * 5, 1.0, dz * 5); cam.lookAt(0, 0.9, 0); const x = (i * 2 + s) * W; r.setViewport(x, 0, W, H); r.setScissor(x, 0, W, H); r.render(scene, cam); });
    if (name === 'bound' && i === 0) { /* first: as bound */ }
  });
  return { clips: names };
}, { moments, W, H });
await page.screenshot({ path: resolve(outPng) });
console.log(JSON.stringify(result));
await browser.close(); server.close();
