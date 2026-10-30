// One of the owner's sports models (30 October 2026: the bicycle, the skateboard, the inline skates, the e-scooter, the
// hoverboard, the electric unicycle, the speedboat, the surfboard and the naval ship), drawn in the town from the
// triangles of his file, every one as it was: tools/sports/sports.py turned each file to face +Z, stood it on the
// ground and made it its size in metres, and sorted its triangles into the parts that move (src/client/sports-parts.js
// says which: its wheels, a bicycle's fork and bars and its cranks, a skateboard's trucks, a boat's motor and wheel).
//
//   const s = await loadSport('bicycle', { tier: '1k' });
//   scene.add(s.group); s.pose({ travelled, steer, crank });
//
// Its colour picture is one of a set of sizes (`tier`: '512', '1k' or '2k'; the supplied files' pictures are 2048, two
// of them 4096: none larger than 2048 is sent). The shape is fetched once, whatever picture it is drawn with.
import { SPORTS_PARTS } from './sports-parts.js';
import { surface } from './render-kit.js';
import { fetchKept, letGoOnceDrawn, decodeAtMost } from './glb.js';
import { deviceKind } from './budget.js';

const cache = new Map();          // `${id}:${tier}` → its geometry and material, however many are drawn (most recently used last)
const users = new Map();          // how many of each are in the scene now
const KEEP = deviceKind() === 'lite' ? 2 : 6;      // models kept ready when none of them is drawn

// One shape a model, whichever picture it is drawn with: its geometries (one a part), and how many sets hold it.
const shapes = new Map();
function shapeOf(id, base, spec, priority) {
  let s = shapes.get(id);
  if (!s) {
    s = { made: buildShape(base, spec, priority), holders: 0 };
    shapes.set(id, s);
    const mine = s;
    s.made.catch(() => { if (shapes.get(id) === mine) shapes.delete(id); });
  }
  s.holders += 1;
  return s.made;
}
function letShapeGo(id) {
  const s = shapes.get(id);
  if (!s || --s.holders > 0) return;
  shapes.delete(id);
  s.made.then((geometries) => { for (const g of geometries) g.dispose(); }, () => {});
}
async function buildShape(base, spec, priority) {
  const response = await fetchKept(base + spec.files.mesh, priority ? { priority } : undefined);
  if (!response.ok) throw new Error(`${spec.files.mesh}: ${response.status}`);
  const buf = await response.arrayBuffer();
  const n = spec.vertices;
  let at = 0;
  const position = new Float32Array(buf, at, n * 3); at += n * 12;
  const normal = new Int16Array(buf, at, n * 3); at += n * 6 + (n % 2) * 2;
  const uv = new Float32Array(buf, at, n * 2); at += n * 8;
  const index = spec.index === 32 ? new Uint32Array(buf, at, spec.triangles * 3) : new Uint16Array(buf, at, spec.triangles * 3);
  const attrs = { position: new THREE.BufferAttribute(position, 3), normal: new THREE.BufferAttribute(normal, 3, true), uv: new THREE.BufferAttribute(uv, 2) };
  const geometries = [];
  let first = 0;
  for (const count of spec.counts) {
    const g = new THREE.BufferGeometry();
    for (const [name, a] of Object.entries(attrs)) g.setAttribute(name, a);
    const own = index.subarray(first * 3, (first + count) * 3);
    g.setIndex(new THREE.BufferAttribute(own, 1));
    bound(g, own, position);
    geometries.push(g);
    first += count;
  }
  return geometries;
}
// A part's own bounds, of the points its triangles use (the parts share the whole model's list of points).
function bound(g, index, position) {
  if (!index.length) { g.boundingBox = new THREE.Box3(); g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0); return; }
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < index.length; i += 1) {
    const j = index[i] * 3;
    for (let a = 0; a < 3; a += 1) { const v = position[j + a]; if (v < lo[a]) lo[a] = v; if (v > hi[a]) hi[a] = v; }
  }
  g.boundingBox = new THREE.Box3(new THREE.Vector3(lo[0], lo[1], lo[2]), new THREE.Vector3(hi[0], hi[1], hi[2]));
  const c = g.boundingBox.getCenter(new THREE.Vector3());
  let r2 = 0;
  for (let i = 0; i < index.length; i += 1) { const j = index[i] * 3; const dx = position[j] - c.x, dy = position[j + 1] - c.y, dz = position[j + 2] - c.z; const d = dx * dx + dy * dy + dz * dz; if (d > r2) r2 = d; }
  g.boundingSphere = new THREE.Sphere(c, Math.sqrt(r2));
}
const letPictureGo = (t) => { if (t) { t.dispose(); if (t.image && typeof t.image.close === 'function') t.image.close(); } };

function free({ id, geometries, material, shared }) {
  if (shared) letShapeGo(id); else for (const g of geometries) g.dispose();
  letPictureGo(material.map);
  material.dispose();
}
// Lets go of the models nobody is drawing, oldest first, beyond the few kept ready.
function trim(keep = KEEP) {
  let n = 0;
  for (const [key, made] of cache) {
    if (cache.size <= keep) break;
    if (users.get(key)) continue;
    cache.delete(key);
    made.then(free, () => {});
    n += 1;
  }
  return n;
}
// (over the page's budget for the graphics card: every one kept ready but not drawn is let go; gives how many)
export const trimSports = () => trim(0);

function picture(url, own, priority) {
  const map = new THREE.Texture();
  map.flipY = false; map.anisotropy = 4; map.colorSpace = THREE.SRGBColorSpace;
  const ready = fetchKept(url, priority ? { priority } : undefined).then((r) => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.blob(); })
    .then((blob) => (typeof createImageBitmap === 'function' ? createImageBitmap(blob).catch(() => null) : null).then((bmp) => bmp || new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error(`${url} could not be read`)); img.src = URL.createObjectURL(blob); })))
    .then((image) => { map.image = image; map.needsUpdate = true; if (!own) letGoOnceDrawn(map, (size) => fetchKept(url).then((r) => r.blob()).then((blob) => decodeAtMost(blob, size))); return map; });
  return { map, ready };
}
const TIERS = ['512', '1k', '2k'];
export const sportTier = (tier) => (TIERS.includes(tier) ? tier : deviceKind() === 'lite' ? '1k' : '2k');

async function partsOf(id, { base, tier, own = false, priority }) {
  const key = `${id}:${tier}`;
  if (!own && cache.has(key)) return cache.get(key);
  const spec = SPORTS_PARTS[id];
  if (!spec) throw new Error(`There is no sports model ${id}.`);
  const made = (async () => {
    const pic = picture(base + spec.files[`color${tier}`], own, priority);
    let geometries;
    try { geometries = own ? await buildShape(base, spec, priority) : await shapeOf(id, base, spec, priority); } catch (error) { pic.ready.then(letPictureGo, () => {}); throw error; }
    try {
      const map = await pic.ready;
      // (his files' one material: its picture, its roughness, no metal, both sides of each face drawn as the file says)
      const material = surface({ map, roughness: spec.roughness, metalness: spec.metallic, side: spec.doubleSided ? THREE.DoubleSide : THREE.FrontSide, envMapIntensity: 0.9 });
      return { id, spec, geometries, material, shared: !own };
    } catch (error) {
      if (own) for (const g of geometries) g.dispose(); else letShapeGo(id);
      pic.ready.then(letPictureGo, () => {});
      throw error;
    }
  })();
  if (own) return made;
  cache.set(key, made);
  made.catch(() => cache.delete(key));
  return made;
}

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

// One sports model to put in the scene, at its own size (metres). `tier`: its picture ('512', '1k', '2k'); `own`: a copy
// of its own, for a renderer other than the town's; `mirror`: drawn as its mirror image (an inline skate for the left foot).
export async function loadSport(id, { base = 'sports/', tier = null, own = false, priority, mirror = false, shadows = true } = {}) {
  const set = sportTier(tier);
  const key = `${id}:${set}`;
  if (!own) users.set(key, (users.get(key) || 0) + 1);
  let parts;
  try { parts = await partsOf(id, { base, tier: set, own, priority }); } catch (error) { if (!own) { users.set(key, users.get(key) - 1); trim(); } throw error; }
  const { spec, geometries, material } = parts;
  if (!own && cache.has(key)) { const made = cache.get(key); cache.delete(key); cache.set(key, made); }
  let held = true;
  const group = new THREE.Group(); group.name = `sport:${id}`;
  const lean = new THREE.Group(); group.add(lean);           // leans about the line its wheels touch the ground on
  const frame = new THREE.Group(); lean.add(frame);
  if (mirror) frame.scale.x = -1;
  const mesh = (g) => { const m = new THREE.Mesh(g, material); m.castShadow = shadows; m.receiveShadow = false; return m; };
  const names = spec.parts;
  const geometryOf = (name) => geometries[names.indexOf(name)];
  frame.add(mesh(geometries[0]));
  // a part that turns about a point: a group at the point, the part's mesh put back by it
  const pivot = (parent, at, name) => { const g = new THREE.Group(); g.position.copy(at); parent.add(g); const m = mesh(geometryOf(name)); m.position.copy(at).negate(); g.add(m); return g; };
  // the steering (a bicycle's fork and bars with its front wheel, a scooter's bars with its front wheel): about the
  // fork's or the stem's own line, through the point on it the model gives
  let steerAxis = null, steerGroup = null;
  if (spec.steer) {
    const p = V(spec.steer.p);
    steerAxis = V(spec.steer.axis).normalize();
    steerGroup = new THREE.Group(); steerGroup.position.copy(p); frame.add(steerGroup);
    const inner = new THREE.Group(); inner.position.copy(p).negate(); steerGroup.add(inner);
    if (names.includes('steer')) inner.add(mesh(geometryOf('steer')));
    steerGroup.userData.inner = inner;
  }
  // the wheels: each about its own axle (across the model, along x), the front one with the steering
  const wheels = [];
  for (const name of names) {
    if (!name.startsWith('wheel:')) continue;
    const w = spec.wheels[name.slice(6)];
    const front = name === 'wheel:front' && steerGroup;
    const g = pivot(front ? steerGroup.userData.inner : frame, V(w.c), name);
    wheels.push({ name: name.slice(6), group: g, r: w.r });
  }
  // a bicycle's cranks, about the bottom bracket (across the bike); a skateboard's trucks, about their middles; a boat's
  // motor about the upright at its mount, its steering wheel about its own column
  const crank = spec.crank ? pivot(frame, V(spec.crank.c), 'crank') : null;
  const trucks = spec.trucks ? Object.fromEntries(Object.entries(spec.trucks).map(([end, t]) => [end, pivot(frame, V(t.c), `truck:${end}`)])) : {};
  // (the wheels on a truck turn with it: each is carried round its truck's middle)
  for (const [end, t] of Object.entries(trucks)) {
    for (const w of wheels) {
      if (!(end === 'front' ? /^f/ : /^r/).test(w.name)) continue;
      const at = w.group.position.clone();
      frame.remove(w.group); t.add(w.group); w.group.position.copy(at).sub(t.position);
    }
  }
  const motor = names.includes('motor') ? pivot(frame, V(spec.motor.p), 'motor') : null;
  const helm = names.includes('helm') ? pivot(frame, V(spec.helm.p), 'helm') : null;
  const helmAxis = spec.helm ? V(spec.helm.axis).normalize() : null;
  const q = new THREE.Quaternion();
  return {
    id, group, spec, frame, lean,
    size: V(spec.size),
    // travelled: metres it has rolled (its wheels turn by it); steer: radians its bars or motor are turned (left
    // positive); crank: radians a bicycle's cranks have gone round; tilt: radians it leans (right positive); truck:
    // radians a skateboard's trucks are turned by its lean (left positive)
    pose({ travelled = 0, steer = 0, crank: turn = 0, tilt = 0, truck = 0 } = {}) {
      for (const w of wheels) w.group.rotation.x = travelled / w.r;
      if (steerGroup) steerGroup.quaternion.copy(q.setFromAxisAngle(steerAxis, steer));
      if (crank) crank.rotation.x = turn;
      if (trucks.front) trucks.front.rotation.y = truck;
      if (trucks.rear) trucks.rear.rotation.y = -truck;
      if (motor) motor.rotation.y = -steer;
      if (helm) helm.quaternion.copy(q.setFromAxisAngle(helmAxis, steer * 2.5));
      lean.rotation.z = mirror ? -tilt : tilt;
    },
    dispose() { if (group.parent) group.parent.remove(group); if (held) { held = false; if (own) free(parts); else { users.set(key, users.get(key) - 1); trim(); } } },
  };
}

export const sportLoaded = (id, tier) => cache.has(`${id}:${sportTier(tier)}`);
// (for the tests: the models kept, by set, and the shapes held)
export const sportsHeld = () => ({ kept: [...cache.keys()], users: Object.fromEntries(users), shapes: Object.fromEntries([...shapes].map(([id, s]) => [id, s.holders])) });
