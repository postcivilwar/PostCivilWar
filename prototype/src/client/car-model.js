// A car from the owner's own model, drawn in the town: its body, its four wheels turning as it rolls and the front
// two turning with the steering, all from the triangles of the supplied file (sorted into those parts by
// tools/vehicles/cars.py, which keeps every one of them as it was).
//
//   const car = await loadCar('grey-saloon', { base: 'cars/', lite, length });
//   scene.add(car.group); car.pose({ travelled, steerAngle, pitch, roll }); car.lamps({ head, tail, brake, reverse });
//
// The car is drawn at its real length (`length`, metres) by one uniform scale. On a phone (`lite`) its pictures are
// the 2048 set; elsewhere the 4096 set. The supplied files are not changed or replaced by either.
//
// Its finish (17 October 2026, the owner's brief: lifelike glass and paint): the model's own colour, and where its
// file has them its own normal and metal-and-roughness pictures, under a clear coat that takes the sky's reflection,
// as a car's lacquer does; on a phone, the plain material every model there is drawn with.
import { CAR_PARTS } from './car-parts.js';
import { surface } from './render-kit.js';
import { fetchKept } from './glb.js';
import { vehicleEnvironment } from './vehicle-models.js';

const cache = new Map();          // one geometry set and material a car, however many are drawn (most recently used last)
const users = new Map();          // how many of each are in the scene now
const KEEP = 3;                   // cars kept ready when none of them is drawn: their 4096 pictures are large
const live = new Set();           // the materials of cars drawn now (their reflection follows the daylight)
let daylight = 1;

function trim() {
  for (const [key, made] of cache) {
    if (cache.size <= KEEP) break;
    if (users.get(key)) continue;
    cache.delete(key);
    made.then(({ geometries, material }) => {
      for (const g of geometries) g.dispose();
      for (const t of [material.map, material.normalMap, material.roughnessMap]) if (t) t.dispose();
      live.delete(material);
      material.dispose();
    }, () => {});
  }
}

function picture(url, colour) {
  const map = new THREE.Texture();
  map.flipY = false; map.anisotropy = 8;
  if (colour) map.encoding = THREE.sRGBEncoding;
  const ready = fetchKept(url).then((r) => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.blob(); })
    .then((blob) => (typeof createImageBitmap === 'function' ? createImageBitmap(blob).catch(() => null) : null).then((bmp) => bmp || new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error(`${url} could not be read`)); img.src = URL.createObjectURL(blob); })))
    .then((image) => { map.image = image; map.needsUpdate = true; return map; });
  return { map, ready };
}

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

async function partsOf(id, { base, lite }) {
  const key = `${id}:${lite ? 2 : 4}`;
  if (cache.has(key)) return cache.get(key);
  const spec = CAR_PARTS[id];
  if (!spec) throw new Error(`There is no car ${id}.`);
  const made = (async () => {
    const f = spec.files, tier = lite ? '2k' : '4k';
    // (a car made with few triangles comes with its colour picture only: then it has no other to fetch)
    const textures = [['color', true], ['normal', false], ['rm', false]].map(([name, colour]) => (f[`${name}${tier}`] ? picture(base + f[`${name}${tier}`], colour) : null));
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

// One car to put in the scene. `length` is its real length in metres.
export async function loadCar(id, { base = 'cars/', lite = false, length = 4.6 } = {}) {
  const { spec, geometries, material } = await partsOf(id, { base, lite });
  const key = `${id}:${lite ? 2 : 4}`;
  users.set(key, (users.get(key) || 0) + 1);
  if (cache.has(key)) { const made = cache.get(key); cache.delete(key); cache.set(key, made); }
  let held = true;
  const scale = length / spec.length;
  const group = new THREE.Group(); group.name = `car:${id}`;
  const frame = new THREE.Group(); frame.scale.setScalar(scale); group.add(frame);
  const mesh = (g) => { const m = new THREE.Mesh(g, material); m.castShadow = true; m.receiveShadow = false; return m; };
  // the body rides on its springs: it pitches under the brake and the throttle and rolls in a turn, about a point a
  // little above its middle; the wheels stay on the ground
  const springs = new THREE.Group(); springs.position.set(0, spec.height * 0.35, 0); frame.add(springs);
  const body = mesh(geometries[0]); body.position.set(0, -spec.height * 0.35, 0); springs.add(body);
  // the wheels: each turns about its own axle; the front two also turn about their upright with the steering
  const wheels = spec.wheels.map((w, k) => {
    const at = new THREE.Group(); at.position.set(w.x, w.y, w.z); frame.add(at);
    const steer = new THREE.Group(); at.add(steer);
    const spin = new THREE.Group(); steer.add(spin);
    const m = mesh(geometries[k + 1]); m.position.set(-w.x, -w.y, -w.z); spin.add(m);
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
    dispose() { fx.dispose(); if (group.parent) group.parent.remove(group); if (held) { held = false; users.set(key, users.get(key) - 1); trim(); } },
  };
}

export const carLoaded = (id, lite) => cache.has(`${id}:${lite ? 2 : 4}`);
