// Looking at a thing that can be owned: turned by hand, as a set of photographs or as the model itself.
//
// The wristwatch is the owner's own model: 64 MB, 1.9 million triangles, three textures. It is used exactly as
// it was supplied: the file on the site is the file that was given, byte for byte, and nothing is taken out of
// it or made smaller. That is far too much to send to every player who opens the market, so there are two ways
// of seeing it:
//
//   the turntable   twenty-four photographs of that same model, taken once from all round it (tools/assets/
//                   make_turntable.mjs draws them from the supplied file). Dragging across them turns the
//                   watch. They are a few hundred kilobytes and are there at once, on any phone.
//   the model       the supplied file itself, fetched only when a player asks for it and is told its size
//                   first, then drawn live: turned any way, brought close.
//
// Both are only on the website; they are files beside the page, not part of it.
// THREE is the global from three.min.js.

import { BIKE_PARTS } from './bike-parts.js';
import { loadBike } from './bike-model.js';
import { isLite } from './render-kit.js';
import { POWER_BIKES } from '../sim/power-bikes.js';

// The motorcycles (13 October 2026): the owner's twelve, drawn from the same triangles and pictures the game rides
// them with (bike-model.js), which are what is fetched to see one in 3D: 5 MB or so on a phone, 10 elsewhere.
const touchFirst = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const bikeModel = (id) => Object.freeze({ bike: id, get megabytes() { const b = BIKE_PARTS[id].bytes; return Math.round(((touchFirst() || isLite()) ? b.lite : b.full) / 1e6); }, triangles: BIKE_PARTS[id].triangles, turntable: `assets/bike-${id}-turn.webp`, frames: 24, cols: 6, rows: 4, poster: `assets/bike-${id}-poster.webp` });

export const ASSET_MODELS = Object.freeze({
  watch: Object.freeze({ file: 'assets/watch.glb', megabytes: 65, triangles: 1886649, turntable: 'assets/watch-turn.webp', frames: 24, cols: 6, rows: 4, poster: 'assets/watch-poster.webp' }),
  ...Object.fromEntries(Object.keys(BIKE_PARTS).map((id) => [`bike:${id}`, bikeModel(id)])),
});

// ---- the turntable ----

// An element showing one photograph of the set; dragging sideways (or the arrow keys) turns the thing. It turns
// slowly by itself until it is first touched. `size` is in CSS pixels; `still` starts it at rest.
export function createTurntable(modelId, { size = 220, still = false, label = 'Turn it: drag sideways' } = {}) {
  const model = ASSET_MODELS[modelId];
  const el = document.createElement('div');
  el.className = 'turntable';
  el.style.width = `${size}px`; el.style.height = `${size}px`;
  if (!model) { el.classList.add('none'); return { el, dispose() {} }; }
  el.tabIndex = 0;
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', label);
  el.style.backgroundImage = `url("${model.turntable}")`;
  el.style.backgroundSize = `${model.cols * 100}% ${model.rows * 100}%`;
  let at = 0;                       // which photograph, as a fraction of the way round
  const show = () => {
    const i = ((Math.round(at * model.frames) % model.frames) + model.frames) % model.frames;
    const col = i % model.cols, row = Math.floor(i / model.cols);
    el.style.backgroundPosition = `${model.cols > 1 ? (col / (model.cols - 1)) * 100 : 0}% ${model.rows > 1 ? (row / (model.rows - 1)) * 100 : 0}%`;
  };
  show();
  // the pictures may not be there (no connection): say so, plainly, where the thing would be
  const probe = new Image();
  probe.onerror = () => { el.classList.add('none'); el.style.backgroundImage = ''; };
  probe.src = model.turntable;
  let held = null, touched = still, timer = 0, last = 0;
  const spin = (now) => { if (!el.isConnected && last) { timer = 0; return; } if (!touched) { if (last) at += ((now - last) / 1000) * 0.07; show(); } last = now; timer = requestAnimationFrame(spin); };
  if (!still) timer = requestAnimationFrame(spin);
  el.addEventListener('pointerdown', (event) => { held = { x: event.clientX, at }; touched = true; try { el.setPointerCapture(event.pointerId); } catch (error) { /* a pointer the browser no longer has */ } el.classList.add('held'); event.preventDefault(); });
  el.addEventListener('pointermove', (event) => { if (!held) return; at = held.at - (event.clientX - held.x) / (size * 1.6); show(); });
  const drop = () => { held = null; el.classList.remove('held'); };
  el.addEventListener('pointerup', drop); el.addEventListener('pointercancel', drop);
  el.addEventListener('keydown', (event) => { if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return; touched = true; at += (event.key === 'ArrowLeft' ? -1 : 1) / model.frames; show(); event.preventDefault(); });
  return { el, dispose() { if (timer) cancelAnimationFrame(timer); timer = 0; } };
}

// ---- the model itself ----

const TYPES = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

// Reads a GLB that holds one still mesh with one material (which is what the watch is). Nothing is copied that
// need not be and nothing is changed: the numbers the graphics card is given are the file's own.
export function readStillModel(buffer) {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) throw new Error('This is not a model the game can read.');
  let at = 12, json = null, binAt = 0;
  while (at < view.byteLength) {
    const length = view.getUint32(at, true), type = view.getUint32(at + 4, true);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, at + 8, length)));
    else if (type === 0x004e4942) binAt = at + 8;
    at += 8 + length;
  }
  if (!json || !binAt) throw new Error('The model file is incomplete.');
  for (const ext of json.extensionsRequired || []) throw new Error(`The model needs ${ext}, which is not read here.`);
  if ((json.meshes || []).length !== 1 || json.meshes[0].primitives.length !== 1) throw new Error('One mesh with one part is read here.');
  const prim = json.meshes[0].primitives[0];
  if (prim.mode !== undefined && prim.mode !== 4) throw new Error('Only triangles are read here.');
  const accessor = (index) => {
    const a = json.accessors[index], bv = json.bufferViews[a.bufferView];
    const T = TYPES[a.componentType], n = WIDTH[a.type];
    if (!T || !n) throw new Error('The model holds a kind of number that is not read here.');
    if (bv.byteStride && bv.byteStride !== T.BYTES_PER_ELEMENT * n) throw new Error('Interleaved data is not read here.');
    const start = binAt + (bv.byteOffset || 0) + (a.byteOffset || 0);
    // in place when the file is packed on a whole word, as it should be; copied when it is not
    const array = start % T.BYTES_PER_ELEMENT === 0 ? new T(buffer, start, a.count * n) : new T(buffer.slice(start, start + a.count * n * T.BYTES_PER_ELEMENT));
    return { array, width: n, count: a.count, min: a.min, max: a.max };
  };
  const imageOf = (texture) => {
    if (!texture) return null;
    const image = json.images[json.textures[texture.index].source];
    const bv = json.bufferViews[image.bufferView];
    return new Blob([new Uint8Array(buffer, binAt + (bv.byteOffset || 0), bv.byteLength)], { type: image.mimeType || 'image/png' });
  };
  const material = (json.materials || [])[prim.material || 0] || {};
  const pbr = material.pbrMetallicRoughness || {};
  return {
    position: accessor(prim.attributes.POSITION),
    normal: prim.attributes.NORMAL !== undefined ? accessor(prim.attributes.NORMAL) : null,
    uv: prim.attributes.TEXCOORD_0 !== undefined ? accessor(prim.attributes.TEXCOORD_0) : null,
    index: prim.indices !== undefined ? accessor(prim.indices) : null,
    colour: imageOf(pbr.baseColorTexture), roughMetal: imageOf(pbr.metallicRoughnessTexture), bump: imageOf(material.normalTexture),
    metalness: pbr.metallicFactor === undefined ? 1 : pbr.metallicFactor, roughness: pbr.roughnessFactor === undefined ? 1 : pbr.roughnessFactor,
  };
}

async function textureFrom(blob, srgb, most) {
  if (!blob) return null;
  const texture = new THREE.Texture();
  texture.flipY = false;                  // glTF lays a picture with its first row at the top
  if (srgb) texture.encoding = THREE.sRGBEncoding;
  texture.anisotropy = 8;
  let picture = null;
  if (typeof createImageBitmap === 'function') { try { picture = await createImageBitmap(blob); } catch (error) { picture = null; } }
  if (!picture) picture = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('A picture in the model could not be read.')); img.src = URL.createObjectURL(blob); });
  // A graphics card has a largest picture it will take. Only then is what it is given smaller than the file's own.
  if (most && Math.max(picture.width, picture.height) > most) {
    const k = most / Math.max(picture.width, picture.height);
    const canvas = document.createElement('canvas'); canvas.width = Math.round(picture.width * k); canvas.height = Math.round(picture.height * k);
    canvas.getContext('2d').drawImage(picture, 0, 0, canvas.width, canvas.height);
    picture = canvas;
  }
  texture.image = picture; texture.needsUpdate = true;
  return texture;
}

// Light for something of polished metal and glass: a bright room to be reflected, made of a few plain shapes.
function studio(renderer) {
  const room = new THREE.Scene();
  const wall = (w, h, d, x, y, z, hex, strength) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(strength), side: THREE.BackSide })); m.position.set(x, y, z); room.add(m); return m; };
  wall(20, 12, 20, 0, 0, 0, 0x8a8f96, 1);
  const lamp = (w, h, x, y, z, strength) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(strength), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); room.add(m); };
  lamp(8, 5, 0, 5.6, 2, 9); lamp(5, 7, -8, 1, 3, 5); lamp(5, 7, 8, 2, -2, 4); lamp(9, 3, 0, 1, 9, 3); lamp(6, 3, 0, -4, -6, 1.2);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const made = pmrem.fromScene(room, 0.03);
  pmrem.dispose();
  room.traverse((o) => { if (o.geometry) { o.geometry.dispose(); o.material.dispose(); } });
  return made;
}

// The model on a canvas of its own, turned by dragging and brought nearer by the wheel or two fingers.
//   const view = createModelView(canvas); await view.load('watch', (done, total) => ...); view.dispose()
// `shot(yaw, pitch)` draws it once from a given side and is what the turntable's photographs are taken with.
export function createModelView(canvas, { transparent = true, pixelRatio = Math.min(2, window.devicePixelRatio || 1) } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: transparent, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(pixelRatio);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.setClearColor(0x000000, transparent ? 0 : 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 50);
  const env = studio(renderer);
  scene.environment = env.texture;
  const key = new THREE.DirectionalLight(0xffffff, 0.9); key.position.set(2.5, 4, 3); scene.add(key);
  scene.add(new THREE.AmbientLight(0xffffff, 0.25));
  const holder = new THREE.Group();
  scene.add(holder);
  let mesh = null, radius = 1, raf = 0, closed = false;
  const look = { yaw: 0.6, pitch: 0.22, dist: 4.1, auto: true };

  function fit() {
    const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
    if (canvas.width !== Math.round(w * pixelRatio) || canvas.height !== Math.round(h * pixelRatio)) renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
  }
  function draw() {
    fit();
    const d = look.dist * radius;
    camera.position.set(Math.sin(look.yaw) * Math.cos(look.pitch) * d, Math.sin(look.pitch) * d, Math.cos(look.yaw) * Math.cos(look.pitch) * d);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  }
  let last = 0;
  function loop(now) {
    if (closed) return;
    if (look.auto && last) look.yaw += ((now - last) / 1000) * 0.35;
    last = now;
    draw();
    raf = requestAnimationFrame(loop);
  }

  // turning and coming closer
  const fingers = new Map();
  let spread = 0;
  canvas.addEventListener('pointerdown', (event) => { fingers.set(event.pointerId, { x: event.clientX, y: event.clientY }); try { canvas.setPointerCapture(event.pointerId); } catch (error) { /* a pointer the browser no longer has */ } look.auto = false; event.preventDefault(); });
  canvas.addEventListener('pointermove', (event) => {
    const f = fingers.get(event.pointerId);
    if (!f) return;
    const dx = event.clientX - f.x, dy = event.clientY - f.y;
    f.x = event.clientX; f.y = event.clientY;
    if (fingers.size === 1) { look.yaw -= dx * 0.01; look.pitch = Math.max(-1.3, Math.min(1.3, look.pitch + dy * 0.008)); }
    else if (fingers.size === 2) { const [a, b] = [...fingers.values()]; const gap = Math.hypot(a.x - b.x, a.y - b.y); if (spread) look.dist = Math.max(1.3, Math.min(7, look.dist * (spread / gap))); spread = gap; }
  });
  const lift = (event) => { fingers.delete(event.pointerId); spread = 0; };
  canvas.addEventListener('pointerup', lift); canvas.addEventListener('pointercancel', lift);
  canvas.addEventListener('wheel', (event) => { look.dist = Math.max(1.3, Math.min(7, look.dist * (event.deltaY > 0 ? 1.1 : 0.9))); look.auto = false; event.preventDefault(); }, { passive: false });

  let shownBike = null;           // (given back when the viewer closes, so that its pictures can be let go)
  async function load(modelId, onProgress, { source = null, base = 'bikes/', lite = touchFirst() || isLite() } = {}) {
    const model = ASSET_MODELS[modelId];
    if (!model) throw new Error('There is no model of that.');
    if (model.bike) {
      // a motorcycle: its own parts, at its real length, stood in the middle on its wheels
      if (onProgress) onProgress(0, 1);
      const bike = await loadBike(model.bike, { base, lite, length: POWER_BIKES[model.bike] ? POWER_BIKES[model.bike].length : 2.1 });
      if (closed) { bike.dispose(); return null; }
      shownBike = bike;
      bike.pose({});
      // (its size is what is drawn of it: a lamp's glow or a flame that is not lit is left out)
      const box = new THREE.Box3(), part = new THREE.Box3();
      bike.group.updateMatrixWorld(true);
      bike.group.traverseVisible((o) => { if (!o.isMesh || !o.geometry) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); box.union(part.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld)); });
      const centre = box.getCenter(new THREE.Vector3());
      bike.group.position.sub(centre);
      radius = box.getBoundingSphere(new THREE.Sphere()).radius;
      holder.add(bike.group);
      if (onProgress) onProgress(1, 1);
      return { triangles: model.triangles, bike: model.bike };
    }
    let buffer = source;
    if (!buffer) {
      const response = await fetch(model.file);
      if (!response.ok) throw new Error('The model could not be fetched. Check the connection and try again.');
      const total = Number(response.headers.get('Content-Length')) || model.megabytes * 1048576;
      if (response.body && typeof response.body.getReader === 'function') {
        const reader = response.body.getReader();
        const parts = [];
        let got = 0;
        for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); got += value.length; if (onProgress) onProgress(got, total); if (closed) { reader.cancel(); throw new Error('Stopped.'); } }
        const whole = new Uint8Array(got);
        let at = 0;
        for (const part of parts) { whole.set(part, at); at += part.length; }
        buffer = whole.buffer;
      } else buffer = await response.arrayBuffer();
    }
    const read = readStillModel(buffer);
    const most = renderer.capabilities.maxTextureSize;
    const [map, roughMetal, normalMap] = await Promise.all([textureFrom(read.colour, true, most), textureFrom(read.roughMetal, false, most), textureFrom(read.bump, false, most)]);
    if (closed) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(read.position.array, 3));
    if (read.normal) geometry.setAttribute('normal', new THREE.BufferAttribute(read.normal.array, 3));
    if (read.uv) geometry.setAttribute('uv', new THREE.BufferAttribute(read.uv.array, 2));
    if (read.index) geometry.setIndex(new THREE.BufferAttribute(read.index.array, 1));
    if (!read.normal) geometry.computeVertexNormals();
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const material = new THREE.MeshStandardMaterial({ map, roughnessMap: roughMetal, metalnessMap: roughMetal, normalMap, roughness: read.roughness, metalness: read.metalness, envMapIntensity: 1.15 });
    if (normalMap) material.normalScale.set(1, -1);
    mesh = new THREE.Mesh(geometry, material);
    // stood in the middle, whatever its own origin
    const centre = geometry.boundingBox.getCenter(new THREE.Vector3());
    mesh.position.copy(centre).multiplyScalar(-1);
    radius = geometry.boundingSphere.radius;
    holder.add(mesh);
    return { triangles: (read.index ? read.index.count : read.position.count) / 3, vertices: read.position.count };
  }

  return {
    canvas, load, look,
    start() { if (!raf && !closed) raf = requestAnimationFrame(loop); },
    // one still picture from a given side
    shot(yaw, pitch = 0.2, dist = 4.1) { look.yaw = yaw; look.pitch = pitch; look.dist = dist; look.auto = false; draw(); },
    dispose() {
      closed = true;
      if (raf) cancelAnimationFrame(raf);
      if (shownBike) { shownBike.dispose(); shownBike = null; }
      if (mesh) { mesh.geometry.dispose(); for (const t of [mesh.material.map, mesh.material.roughnessMap, mesh.material.normalMap]) if (t) t.dispose(); mesh.material.dispose(); }
      env.dispose();
      renderer.dispose();
      const lose = renderer.getContext().getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    },
  };
}
