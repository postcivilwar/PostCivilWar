// A motorcycle from the owner's own model, drawn in the town: its body, its fork turning with the bars, its
// wheels turning as it goes, all from the triangles of the supplied file (sorted into those parts by
// tools/vehicles/bikes.py, which keeps every one of them as it was).
//
//   const bike = await loadBike('red-superbike', { base: 'bikes/', lite });
//   scene.add(bike.group); bike.pose({ wheel: travelled, steer, lean });
//
// The bike is drawn at its real length (`length`, metres) by one uniform scale. On a phone (`lite`) its pictures
// are the 2048 set; elsewhere the 4096 set. The supplied files are not changed or replaced by either.
import { BIKE_PARTS } from './bike-parts.js';
import { surface } from './render-kit.js';
import { fetchKept } from './glb.js';

const cache = new Map();          // one geometry and material a bike, however many are drawn (most recently used last)
const users = new Map();          // how many of each are in the scene now
const KEEP = 3;                   // bikes kept ready when none of them is drawn: their 4096 pictures are large

// Lets go of the bikes nobody is drawing, oldest first, beyond the few kept ready.
function trim() {
  for (const [key, made] of cache) {
    if (cache.size <= KEEP) break;
    if (users.get(key)) continue;
    cache.delete(key);
    made.then(({ geometries, material }) => {
      for (const g of geometries) g.dispose();
      for (const t of [material.map, material.normalMap, material.roughnessMap]) if (t) t.dispose();
      material.dispose();
    }, () => {});
  }
}

function picture(url, colour) {
  const map = new THREE.Texture();
  map.flipY = false; map.anisotropy = 4;
  if (colour) map.encoding = THREE.sRGBEncoding;
  const ready = fetchKept(url).then((r) => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.blob(); })
    .then((blob) => (typeof createImageBitmap === 'function' ? createImageBitmap(blob).catch(() => null) : null).then((bmp) => bmp || new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error(`${url} could not be read`)); img.src = URL.createObjectURL(blob); })))
    .then((image) => { map.image = image; map.needsUpdate = true; return map; });
  return { map, ready };
}

async function partsOf(id, { base, lite }) {
  const key = `${id}:${lite ? 2 : 4}`;
  if (cache.has(key)) return cache.get(key);
  const spec = BIKE_PARTS[id];
  if (!spec) throw new Error(`There is no motorcycle ${id}.`);
  const made = (async () => {
    const f = spec.files, tier = lite ? '2k' : '4k';
    const textures = [picture(base + f[`color${tier}`], true), picture(base + f[`normal${tier}`], false), picture(base + f[`rm${tier}`], false)];
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
    const [color, normalMap, rm] = await Promise.all(textures.map((t) => t.ready));
    const material = surface({ map: color, normalMap, normalScale: new THREE.Vector2(spec.normalScale, -spec.normalScale), roughnessMap: rm, metalnessMap: rm, roughness: spec.roughness, metalness: spec.metallic, envMapIntensity: 1.1 });
    return { spec, geometries, material };
  })();
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
function lampsOf(spec, frame) {
  const P = lampParts();
  const made = [];
  const put = (mesh) => { frame.add(mesh); made.push(mesh); return mesh; };
  const basic = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, depthWrite: false, ...extra });
  const glowMat = (color) => basic(color, { map: P.glowMap, blending: THREE.AdditiveBlending, opacity: 0 });
  const H = spec.head || [0, spec.height * 0.6, spec.length * 0.42], T = spec.tail || [0, spec.height * 0.45, -spec.length * 0.48];
  // the headlamp: its glass, and a glow round it when it is on
  const head = put(new THREE.Mesh(P.disc, basic(0x2a2a26, { opacity: 0.85 })));
  head.position.set(H[0], H[1], H[2] + 0.004); head.scale.setScalar(0.03);
  const headGlow = put(new THREE.Mesh(P.glow, glowMat(0xfff2cc))); headGlow.position.set(H[0], H[1], H[2] + 0.01); headGlow.scale.setScalar(0.16);
  // the tail lamp: dark red, lit red at night, bright when braking
  const tail = put(new THREE.Mesh(P.disc, basic(0x3a0806, { opacity: 0.9 })));
  tail.position.set(T[0], T[1], T[2] - 0.004); tail.rotation.y = Math.PI; tail.scale.setScalar(0.022);
  const tailGlow = put(new THREE.Mesh(P.glow, glowMat(0xff2010))); tailGlow.position.set(T[0], T[1], T[2] - 0.01); tailGlow.rotation.y = Math.PI; tailGlow.scale.setScalar(0.1);
  // the flames: one from each silencer's end
  const flames = (spec.pipes || []).map((p) => { const m = put(new THREE.Mesh(P.flame, basic(0xffffff, { map: P.flameMap, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 0.95 }))); m.position.set(p[0], p[1], p[2] - 0.003); m.visible = false; return m; });
  const st = { head: -1, brake: -1, tail: -1 };
  return {
    head,
    set({ head: on = 0, tail: tl = 0, brake = 0, flame = 0, t = 0 } = {}) {
      if (st.head !== on) { st.head = on; head.material.color.setHex(on > 0 ? 0xfffbe8 : 0x2a2a26); headGlow.material.opacity = 0.9 * on; headGlow.visible = on > 0; }
      const red = brake ? 1 : tl * 0.45;
      if (st.tail !== red) { st.tail = red; tail.material.color.setRGB(0.23 + 0.77 * Math.min(1, red * 1.4), 0.03 + 0.05 * red, 0.02); tailGlow.material.opacity = red; tailGlow.visible = red > 0; tailGlow.scale.setScalar(brake ? 0.14 : 0.1); }
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

// One motorcycle to put in the scene. `length` is its real length in metres.
export async function loadBike(id, { base = 'bikes/', lite = false, length = 2.1 } = {}) {
  const { spec, geometries, material } = await partsOf(id, { base, lite });
  const key = `${id}:${lite ? 2 : 4}`;
  users.set(key, (users.get(key) || 0) + 1);
  if (cache.has(key)) { const made = cache.get(key); cache.delete(key); cache.set(key, made); }
  let held = true;
  const scale = length / spec.length;
  const group = new THREE.Group(); group.name = `bike:${id}`;
  const lean = new THREE.Group(); group.add(lean);          // leans about the line its tyres touch the ground on
  const frame = new THREE.Group(); frame.scale.setScalar(scale); lean.add(frame);
  const mesh = (g) => { const m = new THREE.Mesh(g, material); m.castShadow = true; m.receiveShadow = false; return m; };
  frame.add(mesh(geometries[0]));
  // the front: the steering turns about the fork's own line, leaning back by the rake, through the front axle
  const F = spec.front, R = spec.rear;
  const steerAt = new THREE.Group(); steerAt.position.set(0, F.y, F.z); steerAt.rotation.x = -spec.rake; frame.add(steerAt);
  const steer = new THREE.Group(); steerAt.add(steer);
  const unrake = new THREE.Group(); unrake.rotation.x = spec.rake; steer.add(unrake);
  const steerMesh = mesh(geometries[1]); steerMesh.position.set(0, -F.y, -F.z); unrake.add(steerMesh);
  const frontSpin = new THREE.Group(); unrake.add(frontSpin);
  const frontMesh = mesh(geometries[2]); frontMesh.position.set(0, -F.y, -F.z); frontSpin.add(frontMesh);
  const rearSpin = new THREE.Group(); rearSpin.position.set(0, R.y, R.z); frame.add(rearSpin);
  const rearMesh = mesh(geometries[3]); rearMesh.position.set(0, -R.y, -R.z); rearSpin.add(rearMesh);
  // the lamps and the exhaust flames, where the model has its headlamp, tail lamp and silencers (bikes.py):
  // drawn by the game over the model, which is not changed
  const fx = lampsOf(spec, frame);
  const metres = (v) => v * scale;
  const wheelRadius = { front: metres(F.r), rear: metres(R.r) };
  return {
    id, group, scale, spec,
    // where a rider's hands, seat and feet go, in the bike's own frame (metres; +x is the bike's left)
    seat: new THREE.Vector3(...spec.seat).multiplyScalar(scale),
    grips: [new THREE.Vector3(spec.grip[0], spec.grip[1], spec.grip[2]).multiplyScalar(scale), new THREE.Vector3(-spec.grip[0], spec.grip[1], spec.grip[2]).multiplyScalar(scale)],
    pegs: [new THREE.Vector3(spec.peg[0], spec.peg[1], spec.peg[2]).multiplyScalar(scale), new THREE.Vector3(-spec.peg[0], spec.peg[1], spec.peg[2]).multiplyScalar(scale)],
    lean, frame,
    // travelled: metres the bike has rolled (the wheels turn by it); steer: radians the bars are turned (left
    // positive); tilt: radians it leans (right positive, as the game keeps it)
    pose({ travelled = 0, steerAngle = 0, tilt = 0, dive = 0, bob = 0 } = {}) {
      frontSpin.rotation.x = travelled / wheelRadius.front;
      rearSpin.rotation.x = travelled / wheelRadius.rear;
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
    dispose() { fx.dispose(); if (group.parent) group.parent.remove(group); if (held) { held = false; users.set(key, users.get(key) - 1); trim(); } },
  };
}

export const bikeLoaded = (id, lite) => cache.has(`${id}:${lite ? 2 : 4}`);
