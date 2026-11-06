// Cars shot (6 November 2026, the owner's brief, Stage 4, approved in advance: "bullet holes and breaking glass when a
// car is shot"). Where a round goes into a car a hole is left: in its paint, a dark hole with a ring of bare metal round
// it and a little soot; in its windscreen or its back window, which hold together, a hole with a star of cracks and the
// rings of a spider's web round it. A door's window, toughened glass, breaks whole at the first round: it falls in bits
// onto the road and the seat, and the window is open. What is struck is found from the round's path, the one every
// player's game is told (gun-play.js), against the car as it is drawn (car-model.js `hitBy`, `struck`), so every player
// near sees the same holes and the same windows broken.
//
//   holeDecal(kind, size)          a hole to put on a car: kind 'metal' or 'glass', size across in the units it is put in;
//                                  a small mesh facing +z, to be turned to face out of the surface
//   glassMaskAt(url, u, v)         whether a point of a car's model (its uv) is glass, by its windows picture: true or
//                                  false, or null until a small copy of the picture has been fetched (the first time a
//                                  round strikes a car of that model it is asked for)
//   castOn(mesh, path, out)        a round's path ({ origin, dir, near, far }) against one of a car's parts, quickly
//   createGlassBits(scene, { lite })   the bits of broken windows: .burst(box, dir) falls from a window's box (in the
//                                  town) the way the round went; .update(dt, groundY); .count(); .dispose()

// how big a hole is drawn (metres across: the hole itself is about a centimetre, the rest is the mark round it), how
// many a car keeps (the oldest let go), and how many bits a window breaks into (a phone fewer)
export const HOLES = Object.freeze({ metal: 0.075, glass: 0.2, most: 24 });
export const BITS = Object.freeze({ window: 70, lite: 34, most: 220, liteMost: 100, lie: 40, size: [0.006, 0.02] });

// A small seeded random, so that every player's holes look alike.
function seeded(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }

// The pictures of a hole, made once (a canvas each; a few kilobytes on the graphics card).
let pictures = null;
function holePictures() {
  if (pictures) return pictures;
  const make = (size, draw) => { const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); g.clearRect(0, 0, size, size); draw(g, size); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 2; return t; };
  pictures = {
    // in the paint: soot round it, a ragged ring of bare metal, the hole dark
    metal: make(64, (g, S) => {
      const r = seeded(11), m = S / 2;
      const soot = g.createRadialGradient(m, m, 4, m, m, m * 0.95);
      soot.addColorStop(0, 'rgba(20,18,16,0.55)'); soot.addColorStop(1, 'rgba(20,18,16,0)');
      g.fillStyle = soot; g.beginPath(); g.arc(m, m, m * 0.95, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(196,198,200,0.95)'; g.beginPath();
      for (let k = 0; k <= 18; k += 1) { const a = (k / 18) * Math.PI * 2, rr = S * (0.15 + r() * 0.05); if (k) g.lineTo(m + Math.cos(a) * rr, m + Math.sin(a) * rr); else g.moveTo(m + Math.cos(a) * rr, m + Math.sin(a) * rr); }
      g.fill();
      g.fillStyle = 'rgba(8,8,8,1)'; g.beginPath(); g.arc(m, m, S * 0.1, 0, Math.PI * 2); g.fill();
    }),
    // in laminated glass: the hole, frosted round it, a star of cracks, and rings between them
    glass: make(128, (g, S) => {
      const r = seeded(29), m = S / 2;
      const frost = g.createRadialGradient(m, m, 2, m, m, S * 0.12);
      frost.addColorStop(0, 'rgba(235,240,238,0.9)'); frost.addColorStop(1, 'rgba(235,240,238,0)');
      g.fillStyle = frost; g.beginPath(); g.arc(m, m, S * 0.12, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(240,244,242,0.8)'; g.lineWidth = 1.1; g.lineCap = 'round';
      const cracks = [];
      const n = 11 + Math.floor(r() * 4);
      for (let k = 0; k < n; k += 1) {
        const a0 = (k / n) * Math.PI * 2 + (r() - 0.5) * 0.35, len = S * (0.24 + r() * 0.24);
        cracks.push({ a: a0, len });
        g.beginPath(); g.moveTo(m, m);
        let x = m, y = m, a = a0;
        for (let s = 1; s <= 6; s += 1) { a += (r() - 0.5) * 0.25; x = m + Math.cos(a) * (len * s) / 6; y = m + Math.sin(a) * (len * s) / 6; g.lineTo(x, y); }
        g.stroke();
      }
      g.strokeStyle = 'rgba(240,244,242,0.42)'; g.lineWidth = 0.9;
      for (const ring of [0.1, 0.17, 0.25]) {
        g.beginPath();
        cracks.forEach((c, k) => { if (c.len < S * ring) return; const x = m + Math.cos(c.a) * S * ring * (0.92 + r() * 0.16), y = m + Math.sin(c.a) * S * ring * (0.92 + r() * 0.16); if (k && r() < 0.8) g.lineTo(x, y); else g.moveTo(x, y); });
        g.stroke();
      }
      g.fillStyle = 'rgba(30,32,32,0.85)'; g.beginPath(); g.arc(m, m, S * 0.032, 0, Math.PI * 2); g.fill();
    }),
  };
  return pictures;
}

let shapes = null;
function holeShapes() {
  if (shapes) return shapes;
  const P = holePictures();
  const common = { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, side: THREE.DoubleSide, alphaTest: 0.02 };
  shapes = {
    plane: new THREE.PlaneGeometry(1, 1),
    metal: new THREE.MeshStandardMaterial({ ...common, map: P.metal, roughness: 0.55, metalness: 0.35 }),
    glass: new THREE.MeshStandardMaterial({ ...common, map: P.glass, roughness: 0.25, metalness: 0 }),
  };
  return shapes;
}

// A round's path against one of a car's parts (6 November 2026): as three.js's `raycast` would, which tries every one of a
// part's triangles, but each triangle first passed over unless the path comes within its reach of its middle (worked out
// once for each list of triangles, the first time a round comes near a car of that model: a few numbers a triangle), so
// that a car of ninety thousand triangles is tried in a fraction of a millisecond. Pushes what it meets onto `out`, as
// three.js does: { distance, point, object, face: { a, b, c, normal }, faceIndex, uv }.
const reach = new WeakMap();         // a list of triangles (the index) -> Float32Array of [x, y, z, r] for each
function reachOf(geometry) {
  const index = geometry.index;
  let c = reach.get(index);
  if (c) return c;
  const pos = geometry.attributes.position.array, ix = index.array, n = ix.length / 3;
  c = new Float32Array(n * 4);
  for (let t = 0; t < n; t += 1) {
    const a = ix[t * 3] * 3, b = ix[t * 3 + 1] * 3, d = ix[t * 3 + 2] * 3;
    const x = (pos[a] + pos[b] + pos[d]) / 3, y = (pos[a + 1] + pos[b + 1] + pos[d + 1]) / 3, z = (pos[a + 2] + pos[b + 2] + pos[d + 2]) / 3;
    let r = 0;
    for (const k of [a, b, d]) r = Math.max(r, (pos[k] - x) ** 2 + (pos[k + 1] - y) ** 2 + (pos[k + 2] - z) ** 2);
    c[t * 4] = x; c[t * 4 + 1] = y; c[t * 4 + 2] = z; c[t * 4 + 3] = Math.sqrt(r);
  }
  reach.set(index, c);
  return c;
}
// (the game's own copy of three.js holds no ray of its own, tools/three/make.mjs: a round's path here is
// { origin, dir, near, far }, in the town, `dir` of length one)
let castScratch = null;
export function castOn(mesh, path, out) {
  const g = mesh.geometry;
  if (!g || !g.index || !g.attributes.position) return;
  const W = castScratch || (castScratch = { inv: new THREE.Matrix4(), o: new THREE.Vector3(), d: new THREE.Vector3(), w: new THREE.Vector3(), c: new THREE.Vector3(), scale: new THREE.Vector3(), sphere: new THREE.Sphere() });
  if (!g.boundingSphere) g.computeBoundingSphere();
  // (the part's bounding sphere first: nothing of it is met unless the path comes within it)
  W.sphere.copy(g.boundingSphere).applyMatrix4(mesh.matrixWorld);
  const sc = W.c.copy(W.sphere.center).sub(path.origin), sAlong = sc.dot(path.dir);
  if (sAlong < path.near - W.sphere.radius || sAlong > path.far + W.sphere.radius || sc.lengthSq() - sAlong * sAlong > W.sphere.radius * W.sphere.radius) return;
  W.inv.copy(mesh.matrixWorld).invert();
  const o = W.o.copy(path.origin).applyMatrix4(W.inv), d = W.d.copy(path.dir).transformDirection(W.inv);
  // (the path's length in the part's own units: the town's metres over its scale)
  const scale = W.scale.setFromMatrixScale(mesh.matrixWorld).x || 1;
  const far = path.far / scale, near = path.near / scale;
  const c = reachOf(g), ix = g.index.array, pos = g.attributes.position.array, uv = g.attributes.uv ? g.attributes.uv.array : null;
  const start = Math.floor(g.drawRange.start / 3), end = Math.min(ix.length / 3, g.drawRange.count === Infinity ? Infinity : start + Math.floor(g.drawRange.count / 3));
  for (let t = start; t < end; t += 1) {
    const cx = c[t * 4] - o.x, cy = c[t * 4 + 1] - o.y, cz = c[t * 4 + 2] - o.z, r = c[t * 4 + 3];
    const along = cx * d.x + cy * d.y + cz * d.z;
    if (along < near - r || along > far + r) continue;
    if (cx * cx + cy * cy + cz * cz - along * along > r * r) continue;
    // (where the path meets the triangle, if it does: Moller and Trumbore's way, either face)
    const ia = ix[t * 3] * 3, ib = ix[t * 3 + 1] * 3, ic = ix[t * 3 + 2] * 3;
    const e1x = pos[ib] - pos[ia], e1y = pos[ib + 1] - pos[ia + 1], e1z = pos[ib + 2] - pos[ia + 2];
    const e2x = pos[ic] - pos[ia], e2y = pos[ic + 1] - pos[ia + 1], e2z = pos[ic + 2] - pos[ia + 2];
    const px = d.y * e2z - d.z * e2y, py = d.z * e2x - d.x * e2z, pz = d.x * e2y - d.y * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det;
    const tx = o.x - pos[ia], ty = o.y - pos[ia + 1], tz = o.z - pos[ia + 2];
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < 0 || u > 1) continue;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
    const v = (d.x * qx + d.y * qy + d.z * qz) * inv;
    if (v < 0 || u + v > 1) continue;
    const k = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (k < near || k > far) continue;
    const point = new THREE.Vector3(o.x + d.x * k, o.y + d.y * k, o.z + d.z * k).applyMatrix4(mesh.matrixWorld);
    const distance = W.w.copy(point).sub(path.origin).length();
    const normal = new THREE.Vector3(e1y * e2z - e1z * e2y, e1z * e2x - e1x * e2z, e1x * e2y - e1y * e2x).normalize();
    const a = ix[t * 3], b = ix[t * 3 + 1], cc = ix[t * 3 + 2];
    const hitUv = uv ? new THREE.Vector2(uv[a * 2] * (1 - u - v) + uv[b * 2] * u + uv[cc * 2] * v, uv[a * 2 + 1] * (1 - u - v) + uv[b * 2 + 1] * u + uv[cc * 2 + 1] * v) : null;
    out.push({ distance, point, object: mesh, face: { a, b, c: cc, normal }, faceIndex: t, uv: hitUv });
  }
}

// One hole: shared shape and pictures, so that a car's holes cost nothing but their own place.
export function holeDecal(kind, size) {
  const S = holeShapes();
  const mesh = new THREE.Mesh(S.plane, kind === 'glass' ? S.glass : S.metal);
  mesh.scale.setScalar(size);
  mesh.renderOrder = 3;
  mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.userData.hole = kind;
  return mesh;
}

// A small copy of a car's windows picture, for telling glass from paint where a round strikes (128 points square).
const masks = new Map();             // url -> { data, size } | 'loading' | 'failed'
export function glassMaskAt(url, u, v) {
  const m = masks.get(url);
  if (m && m.data) {
    const s = m.size, x = Math.max(0, Math.min(s - 1, Math.floor(u * s))), y = Math.max(0, Math.min(s - 1, Math.floor(v * s)));
    return m.data[y * s + x] > 127;
  }
  if (!m) {
    masks.set(url, 'loading');
    fetch(url).then((r) => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.blob(); })
      .then((blob) => createImageBitmap(blob))
      .then((bmp) => {
        const size = 128, c = document.createElement('canvas'); c.width = c.height = size;
        const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0, size, size);
        const px = g.getImageData(0, 0, size, size).data, data = new Uint8Array(size * size);
        for (let k = 0; k < size * size; k += 1) data[k] = px[k * 4];
        if (bmp.close) bmp.close();
        masks.set(url, { data, size });
      })
      .catch(() => masks.set(url, 'failed'));
  }
  return null;
}

// The bits of broken windows: little cubes of toughened glass, thrown the way the round went and falling, bouncing a
// little and lying on the road, fading after a while.
export function createGlassBits(scene, { lite = false } = {}) {
  const most = lite ? BITS.liteMost : BITS.most;
  let mesh = null;
  const list = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const make = () => {
    const material = new THREE.MeshStandardMaterial({ color: 0xd6e6e2, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.85 });
    mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.55, 1), material, most);
    mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.name = 'glass-bits';
    scene.add(mesh);
  };
  return {
    // `box`: the window's box in the town (THREE.Box3), `dir`: the way the round went (a unit vector)
    burst(box, dir) {
      if (!mesh) make();
      const r = Math.random;
      const n = lite ? BITS.lite : BITS.window;
      const size = BITS.size;
      for (let k = 0; k < n; k += 1) {
        if (list.length >= most) list.shift();
        const at = new THREE.Vector3(box.min.x + (box.max.x - box.min.x) * r(), box.min.y + (box.max.y - box.min.y) * (0.15 + 0.85 * r()), box.min.z + (box.max.z - box.min.z) * r());
        // (most on in the way the round went, into the car, some back out onto the road beside it)
        const v = new THREE.Vector3(dir.x, 0, dir.z).multiplyScalar(r() < 0.55 ? 0.4 + r() * 1.5 : -(0.3 + r() * 0.9)).add(new THREE.Vector3((r() - 0.5) * 1.4, r() * 1.0, (r() - 0.5) * 1.4));
        list.push({ p: at, v, spin: new THREE.Vector3((r() - 0.5) * 24, (r() - 0.5) * 24, (r() - 0.5) * 24), turn: new THREE.Euler(r() * 6, r() * 6, r() * 6), size: size[0] + (size[1] - size[0]) * r(), age: 0, still: false });
      }
    },
    update(dt, groundY = () => 0) {
      if (!mesh) return;
      let n = 0;
      for (let k = list.length - 1; k >= 0; k -= 1) {
        const b = list[k];
        b.age += dt;
        if (b.age > BITS.lie) { list.splice(k, 1); continue; }
        if (!b.still) {
          b.v.y -= 9.8 * dt;
          b.p.addScaledVector(b.v, dt);
          b.turn.x += b.spin.x * dt; b.turn.y += b.spin.y * dt; b.turn.z += b.spin.z * dt;
          const floor = groundY(b.p.x, b.p.z) + b.size * 0.3;
          if (b.p.y < floor) {
            b.p.y = floor;
            if (Math.abs(b.v.y) < 0.6) { b.still = true; b.turn.x = 0; b.turn.z = 0; } else { b.v.y = -b.v.y * 0.25; b.v.x *= 0.45; b.v.z *= 0.45; b.spin.multiplyScalar(0.5); }
          }
        }
      }
      for (const b of list) {
        // (fading at the end by shrinking away)
        const k = b.age > BITS.lie - 3 ? Math.max(0, (BITS.lie - b.age) / 3) : 1;
        q.setFromEuler(e.copy(b.turn));
        m4.compose(p.copy(b.p), q, s.setScalar(b.size * k));
        mesh.setMatrixAt(n, m4);
        n += 1;
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.visible = n > 0;
    },
    count: () => list.length,
    dispose() { if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); mesh = null; } list.length = 0; },
  };
}
