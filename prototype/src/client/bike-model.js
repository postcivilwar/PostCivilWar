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

const cache = new Map();          // one geometry and material a bike, however many are drawn

function picture(url, colour) {
  const map = new THREE.Texture();
  map.flipY = false; map.anisotropy = 4;
  if (colour) map.encoding = THREE.sRGBEncoding;
  const ready = fetch(url).then((r) => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.blob(); })
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
    const response = await fetch(base + f.mesh);
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

// One motorcycle to put in the scene. `length` is its real length in metres.
export async function loadBike(id, { base = 'bikes/', lite = false, length = 2.1 } = {}) {
  const { spec, geometries, material } = await partsOf(id, { base, lite });
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
    pose({ travelled = 0, steerAngle = 0, tilt = 0 } = {}) {
      frontSpin.rotation.x = travelled / wheelRadius.front;
      rearSpin.rotation.x = travelled / wheelRadius.rear;
      steer.rotation.y = steerAngle;
      lean.rotation.z = -tilt;
    },
    dispose() { if (group.parent) group.parent.remove(group); },
  };
}

export const bikeLoaded = (id, lite) => cache.has(`${id}:${lite ? 2 : 4}`);
