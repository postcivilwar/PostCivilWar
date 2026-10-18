// A car from the owner's own model, drawn in the town: its body, its four wheels turning as it rolls and the front
// two turning with the steering, all from the triangles of the supplied file (sorted into those parts by
// tools/vehicles/cars.py, which keeps every one of them as it was).
//
//   const car = await loadCar('grey-saloon', { base: 'cars/', lite, length });
//   scene.add(car.group); car.pose({ travelled, steerAngle, pitch, roll }); car.lamps({ head, tail, brake, reverse });
//
// The car is drawn at its real length (`length`, metres) by one uniform scale. Its pictures are a set of one size
// (`tier`: '1k', '2k' or '4k'; budget.js says which for what): on the road the 2048 set on a computer and the 1024 set
// on a phone; in a showroom the one the player stands at is given more. The supplied files are not changed or replaced
// by any of them (tools/vehicles/cars.py and smaller.py make the sets).
//
// Its finish (17 October 2026, the owner's brief: lifelike glass and paint): the model's own colour, and where its
// file has them its own normal and metal-and-roughness pictures, under a clear coat that takes the sky's reflection,
// as a car's lacquer does; on a phone, the plain material every model there is drawn with.
import { CAR_PARTS } from './car-parts.js';
import { surface } from './render-kit.js';
import { fetchKept, letGoOnceDrawn } from './glb.js';
import { vehicleEnvironment } from './vehicle-models.js';
import { deviceKind, PICTURES } from './budget.js';

const cache = new Map();          // one geometry set and material a car and set of pictures, however many are drawn (most recently used last)
const users = new Map();          // how many of each are in the scene now
// cars kept ready when none of them is drawn (a car's three 2048 pictures are 64 MB of graphics memory)
const KEEP = deviceKind() === 'lite' ? 1 : 2;
const live = new Set();           // the materials of cars drawn now (their reflection follows the daylight)
let daylight = 1;

function free({ geometries, material }) {
  for (const g of geometries) g.dispose();
  for (const t of [material.map, material.normalMap, material.roughnessMap]) if (t) { t.dispose(); if (t.image && typeof t.image.close === 'function') t.image.close(); }
  live.delete(material);
  material.dispose();
}
function trim() {
  for (const [key, made] of cache) {
    if (cache.size <= KEEP) break;
    if (users.get(key)) continue;
    cache.delete(key);
    made.then(free, () => {});
  }
}

// A picture of the car. The town's renderer is the only one that draws a car from the shared set, so once the
// graphics card has the picture the page lets its own copy go (glb.js); the market's viewer, a renderer of its own,
// is given a copy of its own (`own`), which keeps its picture.
function picture(url, colour, own) {
  const map = new THREE.Texture();
  map.flipY = false; map.anisotropy = 8;
  if (colour) map.encoding = THREE.sRGBEncoding;
  const ready = fetchKept(url).then((r) => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.blob(); })
    .then((blob) => (typeof createImageBitmap === 'function' ? createImageBitmap(blob).catch(() => null) : null).then((bmp) => bmp || new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error(`${url} could not be read`)); img.src = URL.createObjectURL(blob); })))
    .then((image) => { map.image = image; map.needsUpdate = true; if (!own) letGoOnceDrawn(map); return map; });
  return { map, ready };
}
// Which of a car's files each of its pictures comes from, for a set: the 4096 set is its colour at 4096 with its
// relief and its finish at 2048 (they are seen no closer than its colour, and the two at 4096 are 170 MB more).
const SETS = Object.freeze({ '512': ['512', '512', '512'], '1k': ['1k', '1k', '1k'], '2k': ['2k', '2k', '2k'], '4k': ['4k', '2k', '2k'] });
const LARGER = ['512', '1k', '2k', '4k'];
const tierOf = (lite, tier) => tier || PICTURES[lite ? 'lite' : 'full'].vehicle;

// The car's finish: its own pictures, and over them a clear coat that reflects the sky (not on a phone).
function finish(spec, { color, normalMap, rm, lite }) {
  const options = { map: color, normalMap, normalScale: new THREE.Vector2(spec.normalScale, -spec.normalScale), roughnessMap: rm, metalnessMap: rm, roughness: rm ? 1 : Math.min(spec.roughness, 0.55), metalness: rm ? 1 : spec.metallic };
  if (lite || typeof THREE.MeshPhysicalMaterial !== 'function') return surface({ ...options, envMapIntensity: 1 });
  const env = vehicleEnvironment();
  const m = new THREE.MeshPhysicalMaterial({ ...options, envMap: env, envMapIntensity: 1.05 * daylight, clearcoat: 0.65, clearcoatRoughness: 0.12 });
  m.userData.carEnv = 1.05;
  live.add(m);
  return m;
}
// How bright the sky is (0 at night to 1 at noon): the reflections in the cars' paint and glass fade after dark.
export function setCarDaylight(amount) {
  const value = Math.max(0.05, Math.min(1, amount));
  if (Math.abs(value - daylight) < 0.01) return;
  daylight = value;
  for (const m of live) m.envMapIntensity = m.userData.carEnv * daylight;
}

async function partsOf(id, { base, lite, tier, own = false }) {
  const key = `${id}:${tier}`;
  if (!own && cache.has(key)) return cache.get(key);
  const spec = CAR_PARTS[id];
  if (!spec) throw new Error(`There is no car ${id}.`);
  const made = (async () => {
    const f = spec.files, sizes = SETS[tier] || SETS['2k'];
    // (a car made with few triangles comes with its colour picture only: then it has no other to fetch; a set its
    // files do not have is taken from the next larger)
    const file = (name, size) => { for (const k of LARGER.slice(LARGER.indexOf(size))) if (f[`${name}${k}`]) return f[`${name}${k}`]; return null; };
    const textures = [['color', true], ['normal', false], ['rm', false]].map(([name, colour], k) => (file(name, sizes[k]) ? picture(base + file(name, sizes[k]), colour, own) : null));
    const response = await fetchKept(base + f.mesh);
    if (!response.ok) throw new Error(`${f.mesh}: ${response.status}`);
    const buf = await response.arrayBuffer();
    const n = spec.vertices;
    let at = 0;
    const position = new Float32Array(buf, at, n * 3); at += n * 12;
    const normal = new Int16Array(buf, at, n * 3); at += n * 6 + (n % 2) * 2;
    const uv = new Float32Array(buf, at, n * 2); at += n * 8;
    const index = new Uint32Array(buf, at, spec.triangles * 3);
    const attrs = { position: new THREE.BufferAttribute(position, 3), normal: new THREE.BufferAttribute(normal, 3, true), uv: new THREE.BufferAttribute(uv, 2) };
    const geometries = [];
    let first = 0;
    for (const count of spec.parts) {
      const g = new THREE.BufferGeometry();
      for (const [name, a] of Object.entries(attrs)) g.setAttribute(name, a);
      g.setIndex(new THREE.BufferAttribute(index.subarray(first * 3, (first + count) * 3), 1));
      g.computeBoundingSphere();
      geometries.push(g);
      first += count;
    }
    const [color, normalMap, rm] = await Promise.all(textures.map((t) => (t ? t.ready : null)));
    const material = finish(spec, { color, normalMap, rm, lite });
    return { spec, geometries, material };
  })();
  if (own) return made;
  cache.set(key, made);
  made.catch(() => cache.delete(key));
  return made;
}

// The lamps of one car, in its own frame (the model's units): two headlamps, two tail lamps (red, bright when
// braking), and white reversing lamps beside them. Shared shapes and materials; each car has its own few small
// meshes, switched on and off, so nothing is made while it is driven.
const LAMP = {};
function lampParts() {
  if (LAMP.glow) return LAMP;
  LAMP.glow = new THREE.PlaneGeometry(1, 1);
  const g = document.createElement('canvas'); g.width = g.height = 64;
  const c = g.getContext('2d'); const r = c.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,0.5)'); r.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = r; c.fillRect(0, 0, 64, 64);
  LAMP.map = new THREE.CanvasTexture(g);
  return LAMP;
}
function lampsOf(spec, frame) {
  const P = lampParts();
  const made = [];
  const glow = (color, x, y, z, size, back) => {
    const m = new THREE.Mesh(P.glow, new THREE.MeshBasicMaterial({ color, map: P.map, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    m.position.set(x, y, z); m.scale.setScalar(size); if (back) m.rotation.y = Math.PI; m.visible = false;
    frame.add(m); made.push(m);
    return m;
  };
  const L = spec.length;
  const [hx, hy, hz] = spec.lamps.head, [tx, ty, tz] = spec.lamps.tail;
  const heads = [glow(0xfff4dc, hx, hy, hz + 0.006 * L, 0.09 * L), glow(0xfff4dc, -hx, hy, hz + 0.006 * L, 0.09 * L)];
  const tails = [glow(0xff1a0a, tx, ty, tz - 0.006 * L, 0.06 * L, true), glow(0xff1a0a, -tx, ty, tz - 0.006 * L, 0.06 * L, true)];
  const reverse = [glow(0xf4f6ff, tx * 0.72, ty * 0.92, tz - 0.007 * L, 0.035 * L, true), glow(0xf4f6ff, -tx * 0.72, ty * 0.92, tz - 0.007 * L, 0.035 * L, true)];
  const st = { head: -1, red: -1, rev: -1 };
  return {
    head: heads[0],
    set({ head = 0, tail = 0, brake = 0, reverse: back = 0 } = {}) {
      if (st.head !== head) { st.head = head; for (const m of heads) { m.material.opacity = 0.95 * head; m.visible = head > 0; } }
      const red = brake ? 1 : tail * 0.5;
      if (st.red !== red) { st.red = red; for (const m of tails) { m.material.opacity = red; m.visible = red > 0; m.scale.setScalar((brake ? 0.075 : 0.06) * L); } }
      if (st.rev !== back) { st.rev = back; for (const m of reverse) { m.material.opacity = back ? 0.9 : 0; m.visible = !!back; } }
    },
    dispose() { for (const m of made) { m.parent && m.parent.remove(m); m.material.dispose(); } },
  };
}

// One car to put in the scene. `length` is its real length in metres; `tier` its set of pictures (or the one for the
// road on this kind of device); `own`: a copy of its own, for a renderer other than the town's (the market's viewer).
export async function loadCar(id, { base = 'cars/', lite = false, length = 4.6, tier = null, own = false } = {}) {
  const set = tierOf(lite, tier);
  const parts = await partsOf(id, { base, lite, tier: set, own });
  const { spec, geometries, material } = parts;
  const key = `${id}:${set}`;
  if (!own) users.set(key, (users.get(key) || 0) + 1);
  if (!own && cache.has(key)) { const made = cache.get(key); cache.delete(key); cache.set(key, made); }
  let held = true;
  const scale = length / spec.length;
  const group = new THREE.Group(); group.name = `car:${id}`;
  const frame = new THREE.Group(); frame.scale.setScalar(scale); group.add(frame);
  const mesh = (g) => { const m = new THREE.Mesh(g, material); m.castShadow = true; m.receiveShadow = false; return m; };
  // the body rides on its springs: it pitches under the brake and the throttle and rolls in a turn, about a point a
  // little above its middle; the wheels stay on the ground
  const springs = new THREE.Group(); springs.position.set(0, spec.height * 0.35, 0); frame.add(springs);
  const body = mesh(geometries[0]); body.position.set(0, -spec.height * 0.35, 0); springs.add(body);
  // the wheels: each turns about its own axle; the front two also turn about their upright with the steering. A wheel
  // is first put straight (`axle`: which way its own axle points in the file; some cars' front wheels were turned
  // there, as a car is photographed), then turned as it rolls, then steered (tools/vehicles/wheelfit.py)
  const X = new THREE.Vector3(1, 0, 0);
  const wheels = spec.wheels.map((w, k) => {
    const c = w.c || [w.x, w.y, w.z];
    const at = new THREE.Group(); at.position.set(c[0], c[1], c[2]); frame.add(at);
    const steer = new THREE.Group(); at.add(steer);
    const spin = new THREE.Group(); steer.add(spin);
    const straight = new THREE.Group(); spin.add(straight);
    if (w.axle) straight.quaternion.setFromUnitVectors(new THREE.Vector3(w.axle[0], w.axle[1], w.axle[2]).normalize(), X);
    const m = mesh(geometries[k + 1]); m.position.set(-c[0], -c[1], -c[2]); straight.add(m);
    return { at, steer, spin, r: w.r * scale, front: k < 2 };
  });
  // the lamps ride on the body too, at their places on the model (measured from the ground, as the body is drawn)
  const lampFrame = new THREE.Group(); lampFrame.position.set(0, -spec.height * 0.35, 0); springs.add(lampFrame);
  const fx = lampsOf(spec, lampFrame);
  const toBody = (v) => v;           // (the lamps are on the body: they pitch and roll with it)
  return {
    id, group, scale, spec, frame, toBody,
    // metres: how long, wide and high it is drawn
    size: { length, width: spec.body * scale, height: spec.height * scale },
    // travelled: metres the car has rolled (the wheels turn by it); steerAngle: radians the front wheels are turned
    // (left positive, as the car's own +x is its left); pitch: radians the nose dips (positive) or lifts; roll:
    // radians it leans over to its right (positive) in a left-hand turn's push
    pose({ travelled = 0, steerAngle = 0, pitch = 0, roll = 0 } = {}) {
      for (const w of wheels) {
        w.spin.rotation.x = travelled / w.r;
        if (w.front) w.steer.rotation.y = steerAngle;
      }
      springs.rotation.set(pitch, 0, roll);
    },
    // head and tail lamps (0..1), the brake lamps and the reversing lamps (on or off)
    lamps(state) { fx.set(state); },
    headlampAt: (out = new THREE.Vector3()) => fx.head.getWorldPosition(out),
    dispose() { fx.dispose(); if (group.parent) group.parent.remove(group); if (held) { held = false; if (own) free(parts); else { users.set(key, users.get(key) - 1); trim(); } } },
  };
}

export const carLoaded = (id, tier) => cache.has(`${id}:${tier}`);
// (for the tests: the cars kept, by set)
export const carsHeld = () => ({ kept: [...cache.keys()], users: Object.fromEntries(users) });
