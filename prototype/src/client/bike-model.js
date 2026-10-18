// A motorcycle from the owner's own model, drawn in the town: its body, its fork turning with the bars, its
// wheels turning as it goes, all from the triangles of the supplied file (sorted into those parts by
// tools/vehicles/bikes.py, which keeps every one of them as it was).
//
//   const bike = await loadBike('red-superbike', { base: 'bikes/', lite });
//   scene.add(bike.group); bike.pose({ wheel: travelled, steer, lean });
//
// The bike is drawn at its real length (`length`, metres) by one uniform scale. Its pictures are a set of one size
// (`tier`: '1k', '2k' or '4k'; budget.js says which for what): on the road the 2048 set on a computer and the 1024 set
// on a phone; in the showroom the one the player stands at is given more. The supplied files are not changed or
// replaced by any of them (tools/vehicles/bikes.py and smaller.py make the sets).
import { BIKE_PARTS } from './bike-parts.js';
import { surface } from './render-kit.js';
import { fetchKept, letGoOnceDrawn } from './glb.js';
import { deviceKind, PICTURES } from './budget.js';

const cache = new Map();          // one geometry and material a bike and set of pictures, however many are drawn (most recently used last)
const users = new Map();          // how many of each are in the scene now
const KEEP = deviceKind() === 'lite' ? 1 : 2;      // bikes kept ready when none of them is drawn

// One shape a bike, whichever of its sets of pictures it is drawn with (the showroom changes a bike's set as the player
// comes up to it: its shape is not fetched or handed to the graphics card again): its geometry, and how many sets hold it.
const shapes = new Map();
function shapeOf(id, base, spec) {
  let s = shapes.get(id);
  if (!s) {
    s = { made: buildShape(base, spec), holders: 0 };
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
async function buildShape(base, spec) {
  const response = await fetchKept(base + spec.files.mesh);
  if (!response.ok) throw new Error(`${spec.files.mesh}: ${response.status}`);
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
    const own = index.subarray(first * 3, (first + count) * 3);
    g.setIndex(new THREE.BufferAttribute(own, 1));
    bound(g, own, position);
    geometries.push(g);
    first += count;
  }
  return geometries;
}
// A part's own bounds: of the points its triangles use. (The parts share one list of points, the whole model's; three.js
// would bound each part by all of them, and a part turned in the drawing (a wheel put straight, a front end) then
// seemed to carry the whole model round with it: the showroom's pictures were framed round a model twice its size, and
// the market's viewer stood it off its middle.)
function bound(g, index, position) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < index.length; i += 1) {
    const j = index[i] * 3;
    for (let a = 0; a < 3; a += 1) { const v = position[j + a]; if (v < lo[a]) lo[a] = v; if (v > hi[a]) hi[a] = v; }
  }
  if (!index.length) { g.computeBoundingBox(); g.computeBoundingSphere(); return; }
  g.boundingBox = new THREE.Box3(new THREE.Vector3(lo[0], lo[1], lo[2]), new THREE.Vector3(hi[0], hi[1], hi[2]));
  const c = g.boundingBox.getCenter(new THREE.Vector3());
  let r2 = 0;
  for (let i = 0; i < index.length; i += 1) { const j = index[i] * 3; const dx = position[j] - c.x, dy = position[j + 1] - c.y, dz = position[j + 2] - c.z; const d = dx * dx + dy * dy + dz * dz; if (d > r2) r2 = d; }
  g.boundingSphere = new THREE.Sphere(c, Math.sqrt(r2));
}
const letPicturesGo = (maps) => { for (const t of maps) if (t) { t.dispose(); if (t.image && typeof t.image.close === 'function') t.image.close(); } };

function free({ id, geometries, material, shared }) {
  if (shared) letShapeGo(id); else for (const g of geometries) g.dispose();
  letPicturesGo([material.map, material.normalMap, material.roughnessMap]);
  material.dispose();
}
// Lets go of the bikes nobody is drawing, oldest first, beyond the few kept ready.
function trim() {
  for (const [key, made] of cache) {
    if (cache.size <= KEEP) break;
    if (users.get(key)) continue;
    cache.delete(key);
    made.then(free, () => {});
  }
}

// (once the graphics card has a picture of the shared set, the page lets its own copy go: glb.js; the market's
// viewer, a renderer of its own, is given a copy of its own, `own`, which keeps its pictures)
function picture(url, colour, own) {
  const map = new THREE.Texture();
  map.flipY = false; map.anisotropy = 4;
  if (colour) map.encoding = THREE.sRGBEncoding;
  const ready = fetchKept(url).then((r) => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.blob(); })
    .then((blob) => (typeof createImageBitmap === 'function' ? createImageBitmap(blob).catch(() => null) : null).then((bmp) => bmp || new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error(`${url} could not be read`)); img.src = URL.createObjectURL(blob); })))
    .then((image) => { map.image = image; map.needsUpdate = true; if (!own) letGoOnceDrawn(map); return map; });
  return { map, ready };
}
// which file each picture of a set comes from (the 4096 set: its colour at 4096, its relief and finish at 2048)
const SETS = Object.freeze({ '512': ['512', '512', '512'], '1k': ['1k', '1k', '1k'], '2k': ['2k', '2k', '2k'], '4k': ['4k', '2k', '2k'] });
const LARGER = ['512', '1k', '2k', '4k'];
const tierOf = (lite, tier) => tier || PICTURES[lite ? 'lite' : 'full'].vehicle;

async function partsOf(id, { base, tier, own = false }) {
  const key = `${id}:${tier}`;
  if (!own && cache.has(key)) return cache.get(key);
  const spec = BIKE_PARTS[id];
  if (!spec) throw new Error(`There is no motorcycle ${id}.`);
  const made = (async () => {
    const f = spec.files, sizes = SETS[tier] || SETS['2k'];
    // (a bike made with few triangles may come with its colour picture only: then it has no other to fetch)
    const file = (name, size) => { for (const k of LARGER.slice(LARGER.indexOf(size))) if (f[`${name}${k}`]) return f[`${name}${k}`]; return null; };
    const textures = [['color', true], ['normal', false], ['rm', false]].map(([name, colour], k) => (file(name, sizes[k]) ? picture(base + file(name, sizes[k]), colour, own) : null));
    // (the market's viewer, with a renderer of its own, has a shape of its own too)
    let geometries;
    try { geometries = own ? await buildShape(base, spec) : await shapeOf(id, base, spec); } catch (error) { textures.forEach((t) => t && t.ready.then((m) => letPicturesGo([m]), () => {})); throw error; }
    try {
      const [color, normalMap, rm] = await Promise.all(textures.map((t) => (t ? t.ready : null)));
      const material = surface({ map: color, normalMap, normalScale: new THREE.Vector2(spec.normalScale, -spec.normalScale), roughnessMap: rm, metalnessMap: rm, roughness: spec.roughness, metalness: spec.metallic, envMapIntensity: 1.1 });
      return { id, spec, geometries, material, shared: !own };
    } catch (error) {
      if (own) for (const g of geometries) g.dispose(); else letShapeGo(id);
      textures.forEach((t) => t && t.ready.then((m) => letPicturesGo([m]), () => {}));
      throw error;
    }
  })();
  if (own) return made;
  cache.set(key, made);
  made.catch(() => cache.delete(key));
  return made;
}

// The lamps and flames of one bike, in its own frame (the model's units). Shared shapes and materials; each bike
// has its own few small meshes, switched on and off, so nothing is made while it is ridden.
const LAMP = {};
function lampParts() {
  if (LAMP.disc) return LAMP;
  LAMP.disc = new THREE.CircleGeometry(1, 20);
  LAMP.glow = new THREE.PlaneGeometry(1, 1);
  const g = document.createElement('canvas'); g.width = g.height = 64;
  const c = g.getContext('2d'); const r = c.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,0.45)'); r.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = r; c.fillRect(0, 0, 64, 64);
  LAMP.glowMap = new THREE.CanvasTexture(g);
  // a flame: a cone from the pipe's end, hot white at its root, orange then blue at its tip
  LAMP.flame = new THREE.ConeGeometry(1, 1, 10, 1, true); LAMP.flame.translate(0, 0.5, 0); LAMP.flame.rotateX(-Math.PI / 2);   // wide at the pipe (z 0), its tip back along -z
  const f = document.createElement('canvas'); f.width = 8; f.height = 64;
  const fc = f.getContext('2d'); const lg = fc.createLinearGradient(0, 0, 0, 64); lg.addColorStop(0, 'rgba(255,250,220,1)'); lg.addColorStop(0.35, 'rgba(255,150,40,0.9)'); lg.addColorStop(0.8, 'rgba(90,120,255,0.45)'); lg.addColorStop(1, 'rgba(60,80,255,0)'); fc.fillStyle = lg; fc.fillRect(0, 0, 8, 64);
  LAMP.flameMap = new THREE.CanvasTexture(f);
  return LAMP;
}
function lampsOf(spec, frame, bars) {
  const P = lampParts();
  const made = [];
  const put = (mesh, on = frame) => { on.add(mesh); made.push(mesh); return mesh; };
  const basic = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, depthWrite: false, ...extra });
  const glowMat = (color) => basic(color, { map: P.glowMap, blending: THREE.AdditiveBlending, opacity: 0 });
  const H = spec.head || [0, spec.height * 0.6, spec.length * 0.42], T = spec.tail || [0, spec.height * 0.45, -spec.length * 0.48];
  // the headlamp: its glass lit, and a glow round it, when it is on (off, the model's own lamp is seen). A lamp held
  // on the fork (`lampTurns`, tools/vehicles/bikes.py) turns with the bars: it rides on the steering, placed from the
  // front axle; one in a fairing stays with the body
  const [on, at] = spec.lampTurns && bars ? [bars.group, bars.at] : [frame, [0, 0, 0]];
  const head = put(new THREE.Mesh(P.disc, basic(0xfffbe8, { opacity: 0.85 })), on);
  head.position.set(H[0] - at[0], H[1] - at[1], H[2] + 0.004 - at[2]); head.scale.setScalar(0.03); head.visible = false;
  const headGlow = put(new THREE.Mesh(P.glow, glowMat(0xfff2cc)), on); headGlow.position.set(H[0] - at[0], H[1] - at[1], H[2] + 0.01 - at[2]); headGlow.scale.setScalar(0.16); headGlow.visible = false;
  // the tail lamp: lit red at night, bright when braking (off, the model's own lamp is seen)
  const tail = put(new THREE.Mesh(P.disc, basic(0x3a0806, { opacity: 0.9 })));
  tail.position.set(T[0], T[1], T[2] - 0.004); tail.rotation.y = Math.PI; tail.scale.setScalar(0.022); tail.visible = false;
  const tailGlow = put(new THREE.Mesh(P.glow, glowMat(0xff2010))); tailGlow.position.set(T[0], T[1], T[2] - 0.01); tailGlow.rotation.y = Math.PI; tailGlow.scale.setScalar(0.1); tailGlow.visible = false;
  // the flames: one from each silencer's end
  const flames = (spec.pipes || []).map((p) => { const m = put(new THREE.Mesh(P.flame, basic(0xffffff, { map: P.flameMap, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 0.95 }))); m.position.set(p[0], p[1], p[2] - 0.003); m.scale.set(0.022, 0.022, 0.06); m.visible = false; return m; });          // (made at its unlit size: a cone a whole bike long, even unseen, made the bike's measured size twice what it is)
  const st = { head: -1, brake: -1, tail: -1 };
  return {
    head,
    set({ head: on = 0, tail: tl = 0, brake = 0, flame = 0, t = 0 } = {}) {
      if (st.head !== on) { st.head = on; head.visible = on > 0; head.material.opacity = 0.85 * Math.min(1, on * 1.5); headGlow.material.opacity = 0.9 * on; headGlow.visible = on > 0; }
      const red = brake ? 1 : tl * 0.45;
      if (st.tail !== red) { st.tail = red; tail.visible = red > 0; tail.material.color.setRGB(0.23 + 0.77 * Math.min(1, red * 1.4), 0.03 + 0.05 * red, 0.02); tailGlow.material.opacity = red; tailGlow.visible = red > 0; tailGlow.scale.setScalar(brake ? 0.14 : 0.1); }
      for (let i = 0; i < flames.length; i += 1) {
        const m = flames[i];
        m.visible = flame > 0.02;
        if (!m.visible) continue;
        const flicker = 0.75 + 0.25 * Math.sin(t * 61 + i * 2.1) * Math.sin(t * 37 + i);
        const len = 0.06 + 0.16 * flame * flicker;
        m.scale.set(0.022 * (0.7 + 0.3 * flame), 0.022 * (0.7 + 0.3 * flame), len);
        m.material.opacity = Math.min(1, 0.4 + 0.6 * flame) * flicker;
      }
    },
    dispose() { for (const m of made) { m.parent && m.parent.remove(m); m.material.dispose(); } },
  };
}

// One motorcycle to put in the scene. `length` is its real length in metres; `tier` its set of pictures (or the one
// for the road on this kind of device); `own`: a copy of its own, for a renderer other than the town's.
export async function loadBike(id, { base = 'bikes/', lite = false, length = 2.1, tier = null, own = false } = {}) {
  const set = tierOf(lite, tier);
  const parts = await partsOf(id, { base, tier: set, own });
  const { spec, geometries, material } = parts;
  const key = `${id}:${set}`;
  if (!own) users.set(key, (users.get(key) || 0) + 1);
  if (!own && cache.has(key)) { const made = cache.get(key); cache.delete(key); cache.set(key, made); }
  let held = true;
  const scale = length / spec.length;
  const group = new THREE.Group(); group.name = `bike:${id}`;
  const lean = new THREE.Group(); group.add(lean);          // leans about the line its tyres touch the ground on
  const frame = new THREE.Group(); frame.scale.setScalar(scale); lean.add(frame);
  const mesh = (g) => { const m = new THREE.Mesh(g, material); m.castShadow = true; m.receiveShadow = false; return m; };
  frame.add(mesh(geometries[0]));
  // the front: the steering turns about the fork's own line, leaning back by the rake, through the front axle. A bike
  // whose bars are turned in its file (`steered`, radians about that line) has its front end put straight first, and
  // the front wheel turns about its own axle after that (tools/vehicles/wheelfit.py).
  const F = spec.front, R = spec.rear;
  const fx0 = F.x || 0, rx0 = R.x || 0;          // (a wheel's middle, across: some bikes' wheels are not on their middle line)
  const steerAt = new THREE.Group(); steerAt.position.set(fx0, F.y, F.z); steerAt.rotation.x = -spec.rake; frame.add(steerAt);
  const steer = new THREE.Group(); steerAt.add(steer);
  const unrake = new THREE.Group(); unrake.rotation.x = spec.rake; steer.add(unrake);
  const line = new THREE.Vector3(0, Math.cos(spec.rake), -Math.sin(spec.rake));
  const straightened = () => { const g = new THREE.Group(); if (spec.steered) g.quaternion.setFromAxisAngle(line, -spec.steered); return g; };
  const steerStraight = straightened(); unrake.add(steerStraight);
  const steerMesh = mesh(geometries[1]); steerMesh.position.set(-fx0, -F.y, -F.z); steerStraight.add(steerMesh);
  const frontSpin = new THREE.Group(); unrake.add(frontSpin);
  const frontStraight = straightened(); frontSpin.add(frontStraight);
  const frontMesh = mesh(geometries[2]); frontMesh.position.set(-fx0, -F.y, -F.z); frontStraight.add(frontMesh);
  const rearSpin = new THREE.Group(); rearSpin.position.set(rx0, R.y, R.z); frame.add(rearSpin);
  const rearMesh = mesh(geometries[3]); rearMesh.position.set(-rx0, -R.y, -R.z); rearSpin.add(rearMesh);
  // where the grips are as the bars turn: two points carried round with the steering (the rider's hands follow them)
  const gripAt = [1, -1].map((side) => { const o = new THREE.Object3D(); o.position.set(side * spec.grip[0] - fx0, spec.grip[1] - F.y, spec.grip[2] - F.z); unrake.add(o); return o; });
  // the lamps and the exhaust flames, where the model has its headlamp, tail lamp and silencers (bikes.py):
  // drawn by the game over the model, which is not changed
  const fx = lampsOf(spec, frame, { group: unrake, at: [fx0, F.y, F.z] });
  const metres = (v) => v * scale;
  const wheelRadius = { front: metres(F.r), rear: metres(R.r) };
  return {
    id, group, scale, spec,
    // where a rider's hands, seat and feet go, in the bike's own frame (metres; +x is the bike's left)
    seat: new THREE.Vector3(...spec.seat).multiplyScalar(scale),
    grips: [new THREE.Vector3(spec.grip[0], spec.grip[1], spec.grip[2]).multiplyScalar(scale), new THREE.Vector3(-spec.grip[0], spec.grip[1], spec.grip[2]).multiplyScalar(scale)],
    // where each grip is in the world now, the bars turned as they are (0: the left grip, 1: the right)
    gripWorld: (k, out = new THREE.Vector3()) => gripAt[k].getWorldPosition(out),
    pegs: [new THREE.Vector3(spec.peg[0], spec.peg[1], spec.peg[2]).multiplyScalar(scale), new THREE.Vector3(-spec.peg[0], spec.peg[1], spec.peg[2]).multiplyScalar(scale)],
    lean, frame,
    // travelled: metres the bike has rolled (the wheels turn by it); steer: radians the bars are turned (left
    // positive); tilt: radians it leans (right positive, as the game keeps it)
    pose({ travelled = 0, steerAngle = 0, tilt = 0, dive = 0, bob = 0 } = {}) {
      // (a wheel the model has only part of does not turn: wheelfit.py, STILL)
      if (!F.still) frontSpin.rotation.x = travelled / wheelRadius.front;
      if (!R.still) rearSpin.rotation.x = travelled / wheelRadius.rear;
      steer.rotation.y = steerAngle;
      // the suspension: the nose dips under hard braking (dive, radians) and the bike rides up and down over the road
      frame.rotation.x = dive; lean.position.y = bob;
      lean.rotation.z = tilt;            // (the bike's +x is its left: a turn about its length by +tilt leans it to the right)
    },
    // headlamp and tail lamp (0..1 each), the brake lamp (on or off), the exhaust flames (0..1); `t` seconds
    lamps(state) { fx.set(state); },
    // where its headlamp is in the world (for a light that follows it)
    headlampAt: (out = new THREE.Vector3()) => fx.head.getWorldPosition(out),
    headlamp: fx.head,
    dispose() { fx.dispose(); if (group.parent) group.parent.remove(group); if (held) { held = false; if (own) free(parts); else { users.set(key, users.get(key) - 1); trim(); } } },
  };
}

export const bikeLoaded = (id, tier) => cache.has(`${id}:${tier}`);
// (for the tests: the bikes kept, by set, and the shapes held, by bike)
export const bikesHeld = () => ({ kept: [...cache.keys()], users: Object.fromEntries(users), shapes: Object.fromEntries([...shapes].map(([id, s]) => [id, s.holders])) });
