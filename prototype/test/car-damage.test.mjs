// Cars shot, and their glass at night (6 November 2026, the owner's brief, Stage 4: "bullet holes and breaking glass
// when a car is shot"; Stage 3: "street lamps and headlights reflected at night"). Headless, from the game's files:
//  - a round's path tried against a part quickly (car-damage.js `castOn`) finds what trying every triangle finds: the
//    same nearest triangle, at the same distance; on a part drawing only a stretch of its list, only that stretch; a
//    flat square met where it is, at its picture's place;
//  - a hole: in the paint small, in glass larger, facing out, its pictures shared;
//  - a broken window's bits fall, lie on the road and are gone after a while;
//  - the lamps the glass gives back at night: at most eight, where the eye sees them, none by day.
//   node --test test/car-damage.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.THREE = require('../vendor/three.min.js');
const blank2d = new Proxy({}, { get: (t, k) => (k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : k === 'createImageData' ? (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) : k === 'getImageData' ? (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) : typeof k === 'string' ? () => {} : undefined), set: () => true });
if (!globalThis.document) globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => blank2d }) };
const { castOn, holeDecal, createGlassBits, HOLES, BITS } = await import('../src/client/car-damage.js');
const { setGlassGlints } = await import('../src/client/car-glass.js');

// a lumpy shell of many triangles, turned and scaled as a car's parts are
function shell() {
  const g = new THREE.SphereGeometry(1, 48, 32);
  for (let i = 0; i < g.attributes.position.count; i += 1) { const y = g.attributes.position.getY(i); g.attributes.position.setY(i, y * 0.6 + 0.1 * Math.sin(i)); }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const holder = new THREE.Group(); holder.position.set(3, 0.4, -2); holder.rotation.y = 0.7; holder.scale.setScalar(2.2);
  holder.add(m); holder.updateMatrixWorld(true);
  return m;
}

// every triangle tried, one by one, in the town (a plain reference for `castOn`, which passes most of them over)
function everyTriangle(mesh, path) {
  const g = mesh.geometry, ix = g.index.array, P = g.attributes.position;
  const start = Math.floor(g.drawRange.start / 3), end = Math.min(ix.length / 3, g.drawRange.count === Infinity ? Infinity : start + Math.floor(g.drawRange.count / 3));
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), hits = [];
  for (let t = start; t < end; t += 1) {
    A.fromBufferAttribute(P, ix[t * 3]).applyMatrix4(mesh.matrixWorld); B.fromBufferAttribute(P, ix[t * 3 + 1]).applyMatrix4(mesh.matrixWorld); C.fromBufferAttribute(P, ix[t * 3 + 2]).applyMatrix4(mesh.matrixWorld);
    const e1 = B.clone().sub(A), e2 = C.clone().sub(A), p = path.dir.clone().cross(e2), det = e1.dot(p);
    if (Math.abs(det) < 1e-12) continue;
    const s = path.origin.clone().sub(A), u = s.dot(p) / det; if (u < 0 || u > 1) continue;
    const q = s.clone().cross(e1), v = path.dir.dot(q) / det; if (v < 0 || u + v > 1) continue;
    const k = e2.dot(q) / det; if (k < path.near || k > path.far) continue;
    hits.push({ distance: k, faceIndex: t });
  }
  return hits.sort((a, b) => a.distance - b.distance);
}

test('a round\'s path tried quickly finds what trying every triangle finds: the same nearest one, at the same distance', () => {
  const m = shell();
  let agreed = 0;
  for (let k = 0; k < 60; k += 1) {
    const a = k * 0.37, from = new THREE.Vector3(3 + Math.cos(a) * 9, 0.4 + Math.sin(k) * 1.5, -2 + Math.sin(a) * 9);
    const to = new THREE.Vector3(3 + Math.sin(k) * 0.8, 0.4 + Math.cos(k) * 0.5, -2 + Math.cos(k * 1.3) * 0.8);
    const path = { origin: from, dir: to.clone().sub(from).normalize(), near: 0, far: 30 };
    const theirs = everyTriangle(m, path);
    const mine = []; castOn(m, path, mine); mine.sort((p, q) => p.distance - q.distance);
    assert.equal(mine.length, theirs.length, `path ${k}: as many met`);
    if (!theirs.length) continue;
    const t = theirs[0], o = mine[0];
    assert.ok(Math.abs(t.distance - o.distance) < 1e-4, `path ${k}: ${t.distance} against ${o.distance}`);
    assert.equal(o.faceIndex, t.faceIndex, `path ${k}: the same triangle`);
    assert.ok(Math.abs(o.point.distanceTo(from) - o.distance) < 1e-4);
    assert.ok(o.uv && o.uv.x >= 0 && o.uv.x <= 1 && o.uv.y >= 0 && o.uv.y <= 1, `path ${k}: its picture's place`);
    assert.ok(Math.abs(o.face.normal.length() - 1) < 1e-6);
    agreed += 1;
  }
  assert.ok(agreed > 40, `${agreed} paths met it`);
  // (a part drawing a stretch of the list: only that stretch is met)
  const g = m.geometry, n = g.index.count;
  g.setDrawRange(0, Math.floor(n / 6) * 3);
  const path = { origin: new THREE.Vector3(3, 0.4, 10), dir: new THREE.Vector3(0, 0, -1), near: 0, far: 40 };
  const theirs = everyTriangle(m, path), mine = []; castOn(m, path, mine);
  assert.deepEqual(mine.map((h) => h.faceIndex).sort(), theirs.map((h) => h.faceIndex).sort());
  // (a flat square a known way off: met there, facing the path)
  const sq = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial());
  sq.position.set(0, 1, -5); sq.updateMatrixWorld(true);
  const hit = []; castOn(sq, { origin: new THREE.Vector3(0.3, 1.2, 0), dir: new THREE.Vector3(0, 0, -1), near: 0, far: 20 }, hit);
  assert.equal(hit.length, 1);
  assert.ok(Math.abs(hit[0].distance - 5) < 1e-6 && Math.abs(hit[0].point.x - 0.3) < 1e-6 && Math.abs(hit[0].point.y - 1.2) < 1e-6);
  assert.ok(Math.abs(hit[0].uv.x - 0.65) < 1e-6 && Math.abs(hit[0].uv.y - 0.6) < 1e-6, `its picture's place ${hit[0].uv.x} ${hit[0].uv.y}`);
  assert.ok(Math.abs(Math.abs(hit[0].face.normal.z) - 1) < 1e-6);
});

test('a hole: in the paint small, in glass larger with its cracks, facing out of the surface (+z), its pictures shared', () => {
  const a = holeDecal('metal', 0.075), b = holeDecal('glass', 0.2), c = holeDecal('glass', 0.2);
  assert.equal(a.userData.hole, 'metal'); assert.equal(b.userData.hole, 'glass');
  assert.ok(Math.abs(a.scale.x - 0.075) < 1e-9 && Math.abs(b.scale.x - 0.2) < 1e-9);
  assert.equal(b.material, c.material, 'one material for every hole in glass');
  assert.equal(a.geometry, b.geometry, 'one shape for all');
  assert.ok(HOLES.glass > HOLES.metal && HOLES.most >= 12);
  const normal = new THREE.Vector3(); a.geometry.computeBoundingBox(); normal.set(0, 0, 1);
  assert.ok(a.geometry.attributes.normal.getZ(0) > 0.99, 'facing +z');
});

test('a broken window\'s bits fall, lie on the road, and are gone after a while', () => {
  const scene = new THREE.Scene();
  const bits = createGlassBits(scene, { lite: false });
  bits.burst(new THREE.Box3(new THREE.Vector3(0, 0.95, 0), new THREE.Vector3(0.05, 1.35, 0.9)), new THREE.Vector3(-1, 0, 0));
  assert.equal(bits.count(), BITS.window);
  for (let t = 0; t < 4; t += 1 / 30) bits.update(1 / 30, () => 0);
  const mesh = scene.children.find((o) => o.name === 'glass-bits');
  assert.ok(mesh && mesh.count === BITS.window, 'all drawn');
  const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  let low = 0;
  for (let k = 0; k < mesh.count; k += 1) { mesh.getMatrixAt(k, m4); m4.decompose(p, q, s); if (p.y < 0.05) low += 1; }
  assert.ok(low > BITS.window * 0.9, `${low} of ${BITS.window} lying on the road after four seconds`);
  for (let t = 0; t < BITS.lie + 1; t += 0.5) bits.update(0.5, () => 0);
  assert.equal(bits.count(), 0, 'gone after a while');
  // (a phone: fewer)
  const lite = createGlassBits(new THREE.Scene(), { lite: true });
  lite.burst(new THREE.Box3(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0.1, 1.3, 0.8)), new THREE.Vector3(1, 0, 0));
  assert.equal(lite.count(), BITS.lite);
  bits.dispose(); lite.dispose();
});

test('at night the glass gives back the lamps near: at most eight, where the eye sees them; none by day', () => {
  const camera = new THREE.PerspectiveCamera(55, 1.5, 0.3, 2000);
  camera.position.set(0, 1.6, 0); camera.lookAt(0, 1.6, -10);
  const lamps = Array.from({ length: 11 }, (_, k) => ({ x: k - 5, y: 6, z: -12, w: 0.9, colour: 0xffc98a }));
  const n = setGlassGlints(lamps, camera);
  assert.equal(n, 8, 'the nearest eight');
  assert.equal(setGlassGlints([{ x: 0, y: 6, z: -12, w: 0, colour: 0xffffff }], camera), 0, 'one not lit is left out');
  assert.equal(setGlassGlints(null, camera), 0, 'none by day');
  assert.equal(setGlassGlints([], camera), 0);
});
