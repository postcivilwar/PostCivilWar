// The town's meshes are gathered by Batch (src/client/render-kit.js). It was rewritten to gather them faster;
// what it gathers must not have changed by a single bit. Here the way it was done before (the library's own
// steps: unfold, move, work out the normals, copy a number at a time) is kept, and the two are compared on
// every kind of shape the town is made of.
//
//   node --test test/render-kit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.THREE = require('../vendor/three.min.js');
const { Batch, Chunked, place, linear } = await import('../src/client/render-kit.js');
const THREE = globalThis.THREE;

// ---- as it was before 12 October 2026, word for word ----
class OldBatch {
  constructor({ uv = 'keep', scale = 1 } = {}) { this.positions = []; this.normals = []; this.colours = []; this.uvs = []; this.uv = uv; this.scale = scale; }
  add(geometry, matrix, hex, shade = 1, smooth = false, uvMode = this.uv) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    g.applyMatrix4(matrix);
    if (!smooth || !g.attributes.normal) g.computeVertexNormals();
    const c = linear(hex).multiplyScalar(shade);
    const p = g.attributes.position.array;
    const n = g.attributes.normal.array;
    const t = g.attributes.uv ? g.attributes.uv.array : null;
    const s = this.scale;
    for (let i = 0, j = 0; i < p.length; i += 3, j += 2) {
      this.positions.push(p[i], p[i + 1], p[i + 2]);
      this.normals.push(n[i], n[i + 1], n[i + 2]);
      this.colours.push(c.r, c.g, c.b);
      if (uvMode === 'plan') this.uvs.push(p[i] / s, p[i + 2] / s);
      else if (uvMode === 'planZ') this.uvs.push(p[i + 2] / s, p[i] / s);
      else if (uvMode === 'wall') this.uvs.push((p[i] + p[i + 2]) / s, p[i + 1] / s);
      else if (t) this.uvs.push(t[j], t[j + 1]);
      else this.uvs.push(0, 0);
    }
    g.dispose();
    return this;
  }
  round(geometry, matrix, hex, shade = 1, uvMode) { return this.add(geometry, matrix, hex, shade, true, uvMode); }
  box(w, h, d, matrix, hex, shade, uvMode) { return this.add(new THREE.BoxGeometry(w, h, d), matrix, hex, shade, false, uvMode); }
  build() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colours, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.computeBoundingSphere();
    return new THREE.Mesh(geometry, null);
  }
}
class OldChunked {
  constructor(options = {}, size = 125) { this.options = options; this.size = size; this.chunks = new Map(); }
  pick(geometry, matrix) {
    const e = matrix.elements;
    let x = e[12], z = e[14];
    if (x === 0 && z === 0 && e[0] === 1 && e[10] === 1) { const p = geometry.attributes.position.array; x = p[0]; z = p[2]; }
    const key = `${Math.floor(x / this.size)},${Math.floor(z / this.size)}`;
    let chunk = this.chunks.get(key);
    if (!chunk) { chunk = new OldBatch(this.options); this.chunks.set(key, chunk); }
    return chunk;
  }
  add(geometry, matrix, hex, shade = 1, smooth = false, uvMode) { this.pick(geometry, matrix).add(geometry, matrix, hex, shade, smooth, uvMode); return this; }
  round(geometry, matrix, hex, shade = 1, uvMode) { return this.add(geometry, matrix, hex, shade, true, uvMode); }
  box(w, h, d, matrix, hex, shade, uvMode) { return this.add(new THREE.BoxGeometry(w, h, d), matrix, hex, shade, false, uvMode); }
}

// a generator of numbers that is the same every time
let seed = 20261012;
const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const between = (a, b) => a + (b - a) * rnd();

// bit for bit: the two arrays hold the same 32-bit patterns (so NaN equals NaN, and -0 is not 0)
function same(a, b, what) {
  assert.equal(a.length, b.length, `${what}: ${a.length} numbers, was ${b.length}`);
  const x = new Uint32Array(a.buffer, a.byteOffset, a.length), y = new Uint32Array(b.buffer, b.byteOffset, b.length);
  for (let i = 0; i < x.length; i += 1) if (x[i] !== y[i]) assert.fail(`${what}: number ${i} is ${a[i]}, was ${b[i]}`);
}
function sameMesh(now, was, what) {
  for (const name of ['position', 'normal', 'color', 'uv']) same(now.geometry.attributes[name].array, was.geometry.attributes[name].array, `${what}, ${name}`);
  assert.deepEqual(now.geometry.boundingSphere.center.toArray(), was.geometry.boundingSphere.center.toArray(), `${what}, the sphere round it`);
  assert.equal(now.geometry.boundingSphere.radius, was.geometry.boundingSphere.radius);
}

const frond = () => { const positions = []; for (let i = 0; i < 24 * 3; i += 1) positions.push(between(-3, 3)); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.computeVertexNormals(); return g; };
const bare = () => { const positions = []; for (let i = 0; i < 12 * 3; i += 1) positions.push(between(-2, 2)); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); return g; };
const SHAPES = {
  box: () => new THREE.BoxGeometry(between(0.05, 9), between(0.05, 9), between(0.05, 9)),
  cylinder: () => new THREE.CylinderGeometry(between(0.02, 1), between(0.02, 1), between(0.1, 8), 5 + Math.floor(rnd() * 8)),
  openCylinder: () => new THREE.CylinderGeometry(0.3, 0.3, 2, 8, 1, true),
  cone: () => new THREE.ConeGeometry(between(0.2, 2), between(0.2, 3), 4 + Math.floor(rnd() * 6)),
  sphere: () => new THREE.SphereGeometry(between(0.1, 3), 8 + Math.floor(rnd() * 5), 6),
  icosahedron: () => new THREE.IcosahedronGeometry(between(0.5, 2.5), 1),
  plane: () => new THREE.PlaneGeometry(between(0.5, 30), between(0.5, 30)),
  circle: () => new THREE.CircleGeometry(between(0.2, 3), 12),
  ring: () => new THREE.RingGeometry(0.5, 0.8, 12),
  torus: () => new THREE.TorusGeometry(1, 0.2, 6, 10),
  frond, bare,
};
const MATRICES = {
  placed: () => place(between(-400, 400), between(0, 12), between(-400, 400), between(-4, 4)),
  turnedEveryWay: () => place(between(-400, 400), between(0, 12), between(-400, 400), between(-4, 4), 1, 1, 1, between(-2, 2), between(-2, 2)),
  stretched: () => place(between(-400, 400), between(0, 12), between(-400, 400), between(-4, 4), between(0.2, 3), between(0.1, 2), between(0.2, 3), between(-1, 1), between(-1, 1)),
  mirrored: () => place(between(-50, 50), 1, between(-50, 50), 0.4, -1, 1, 1),
  whereItIs: () => new THREE.Matrix4(),
  atTheOrigin: () => place(0, 0, 0, between(-3, 3)),
};

test('a shape gathered the new way is, bit for bit, the shape gathered the old way', () => {
  let shapes = 0;
  for (const uv of ['keep', 'plan', 'planZ', 'wall']) {
    for (const [shape, make] of Object.entries(SHAPES)) for (const [how, matrix] of Object.entries(MATRICES)) for (const smooth of [false, true]) {
      const now = new Batch({ uv, scale: 3.5 }), was = new OldBatch({ uv, scale: 3.5 });
      for (let i = 0; i < 3; i += 1) {
        const g = make(), m = matrix(), hex = Math.floor(rnd() * 0xffffff), shade = between(0.6, 1.2);
        const before = new Float32Array(g.attributes.position.array);
        if (smooth) { now.round(g, m, hex, shade); was.round(g, m, hex, shade); } else { now.add(g, m, hex, shade); was.add(g, m, hex, shade); }
        same(g.attributes.position.array, before, `${shape}: the shape handed in was changed`);
        shapes += 1;
      }
      // (a batch may be told, for one shape, to lay the texture another way)
      const g = make(), m = matrix();
      now.add(g, m, 0x808080, 1, smooth, 'wall'); was.add(g, m, 0x808080, 1, smooth, 'wall');
      sameMesh(now.build(null), was.build(), `${shape}, ${how}, ${smooth ? 'round' : 'flat'}, texture laid "${uv}"`);
    }
  }
  assert.ok(shapes > 1000);
});

test('a box added by its three sizes is the library\'s own box', () => {
  for (const uv of ['keep', 'plan', 'wall']) {
    const now = new Batch({ uv, scale: 2 }), was = new OldBatch({ uv, scale: 2 });
    for (let i = 0; i < 400; i += 1) {
      const w = i % 7 === 0 ? 0.3 : between(0.01, 40), h = i % 11 === 0 ? 12 : between(0.01, 12), d = between(0.01, 40);
      const m = Object.values(MATRICES)[i % 6](), hex = Math.floor(rnd() * 0xffffff);
      if (i % 3 === 0) { now.box(w, h, d, m, hex); was.box(w, h, d, m, hex); } else if (i % 3 === 1) { const shade = between(0.5, 1.1); now.box(w, h, d, m, hex, shade); was.box(w, h, d, m, hex, shade); } else { now.box(w, h, d, m, hex, 0.9, 'planZ'); was.box(w, h, d, m, hex, 0.9, 'planZ'); }
    }
    sameMesh(now.build(null), was.build(), `boxes, texture laid "${uv}"`);
  }
});

test('cut into squares of ground, everything falls in the square it fell in before', () => {
  const now = new Chunked({ uv: 'plan', scale: 4 }, 125), was = new OldChunked({ uv: 'plan', scale: 4 }, 125);
  for (let i = 0; i < 600; i += 1) {
    const hex = Math.floor(rnd() * 0xffffff);
    // (some are placed by their matrix, some by their own coordinates with no matrix at all, some sit on a line between squares)
    const m = i % 5 === 0 ? new THREE.Matrix4() : i % 9 === 0 ? place(125 * Math.round(between(-3, 3)), 0, 125 * Math.round(between(-3, 3))) : MATRICES.placed();
    if (i % 3 === 0) { const w = between(0.2, 300), h = between(0.2, 5), d = between(0.2, 300); now.box(w, h, d, m, hex); was.box(w, h, d, m, hex); }
    else if (i % 3 === 1) { const g = SHAPES.frond(); now.add(g, m, hex); was.add(g, m, hex); }
    else { const g = SHAPES.sphere(); now.round(g, m, hex, 0.95); was.round(g, m, hex, 0.95); }
  }
  assert.deepEqual([...now.chunks.keys()], [...was.chunks.keys()], 'the same squares, met in the same order');
  assert.ok(now.chunks.size > 20);
  for (const [key, chunk] of now.chunks) sameMesh(chunk.build(null), was.chunks.get(key).build(), `the square ${key}`);
});

test('an empty batch is empty, and a batch is built once', () => {
  const b = new Batch();
  assert.equal(b.empty, true);
  assert.equal(b.positions.length, 0);
  b.box(1, 1, 1, new THREE.Matrix4(), 0xffffff);
  assert.equal(b.empty, false);
  assert.equal(b.positions.length, 108);
  const mesh = b.build(null);
  assert.equal(mesh.geometry.attributes.position.count, 36);
  assert.equal(mesh.geometry.attributes.position.array.length, 108, 'no more room is kept than there are numbers');
  assert.throws(() => b.build(null), /built already/);
});

test('a shape that is not plain triangles of floats is still gathered, the library\'s way', () => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
  const now = new Batch(), was = new OldBatch();
  now.add(g, place(3, 0, 4, 1), 0x336699); was.add(g, place(3, 0, 4, 1), 0x336699);
  sameMesh(now.build(null), was.build(), 'a shape in 64-bit floats');
});
