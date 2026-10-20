// Shared drawing kit: colour, placement, merged meshes, and the textures the
// prototype paints for itself. Nothing here is loaded from a file; every
// surface is drawn in code. THREE is the global from three.min.js.

export function linear(hex) {
  return new THREE.Color(hex).convertSRGBToLinear();
}

export function place(x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
  return m;
}

// Once the graphics card has a batch's numbers, the page lets its own go (the town is some eighty megabytes of them):
// they are kept aside as a Blob, which the browser holds outside the page's own memory, so that they can be handed
// to the card again if the browser takes the drawing surface away and gives it back (20 October 2026: the game then
// carries on where it was; restoreGeometry, main.js).
const sentAway = new Map();          // attribute -> { blob, type }
function letGo() { if (this.array && !sentAway.has(this)) sentAway.set(this, { blob: new Blob([this.array]), type: this.array.constructor }); this.array = null; }
// Every batch's numbers handed back, for the graphics card to be given them again. Gives how many.
export async function restoreGeometry() {
  let n = 0;
  await Promise.all([...sentAway].map(async ([attribute, kept]) => {
    if (attribute.array) return;
    attribute.array = new kept.type(await kept.blob.arrayBuffer());
    attribute.needsUpdate = true;
    n += 1;
  }));
  return n;
}
export const geometryKeptAside = () => sentAway.size;

// A list of numbers that grows as it is added to, kept as the 32-bit floats the graphics card is given. (The
// town is some forty million of them. They were once gathered in ordinary lists, a number at a time, at twice
// the room each, and copied into floats at the end.)
class Floats {
  constructor() { this.array = new Float32Array(3072); this.length = 0; }
  // room for `n` more; gives the array to write into, from `this.length`
  room(n) {
    if (this.length + n > this.array.length) {
      let size = this.array.length * 2;
      while (size < this.length + n) size *= 2;
      const next = new Float32Array(size);
      next.set(this.array.subarray(0, this.length));
      this.array = next;
    }
    return this.array;
  }
  // the numbers, exactly as many as there are; the list is finished with
  take() { const out = this.array.slice(0, this.length); this.array = null; return out; }
}

// A box, as THREE.BoxGeometry makes one and `toNonIndexed` unfolds it: which corner each of its thirty-six
// points is (as signs), and where a texture lies on it. Made once, from the library's own box, so that a box
// added from here is the same box, number for number, without a geometry being built for each one.
let boxSigns = null, boxUv = null;
const boxPoints = new Float32Array(108);
function boxOf(w, h, d) {
  if (!boxSigns) {
    const made = new THREE.BoxGeometry(2, 2, 2).toNonIndexed();
    boxSigns = new Float32Array(made.attributes.position.array);
    boxUv = new Float32Array(made.attributes.uv.array);
  }
  const hw = w / 2, hh = h / 2, hd = d / 2;
  for (let i = 0; i < 108; i += 3) { boxPoints[i] = boxSigns[i] * hw; boxPoints[i + 1] = boxSigns[i + 1] * hh; boxPoints[i + 2] = boxSigns[i + 2] * hd; }
  return boxPoints;
}
const normalMatrix = () => (normalMatrix.m || (normalMatrix.m = new THREE.Matrix3()));

// Collects many small shapes into one vertex-coloured mesh.
//   add()    flat-shaded: every face catches the light on its own
//   round()  keeps the shape's own normals, for curved surfaces
// `uv` chooses how a texture lies on everything in the batch: 'plan' lays it
// on the ground, 'wall' hangs it on upright faces, 'keep' uses the shape's own.
//
// What is written is what the library itself would have written (unfold the shape, move it by the matrix,
// work out its normals): the same sums in the same order, so the town is the same town to the last bit
// (test/render-kit.test.mjs holds it to that). It is done here in one pass over the numbers, where the
// library made three copies of every shape on the way.
export class Batch {
  constructor({ uv = 'keep', scale = 1 } = {}) { this.positions = new Floats(); this.normals = new Floats(); this.colours = new Floats(); this.uvs = new Floats(); this.uv = uv; this.scale = scale; }

  add(geometry, matrix, hex, shade = 1, smooth = false, uvMode = this.uv) {
    const at = geometry.attributes;
    const position = at.position;
    // (anything but plain triangles of 32-bit floats is left to the library, as it always was)
    if (!(position.array instanceof Float32Array) || position.itemSize !== 3 || position.isInterleavedBufferAttribute || (at.normal && (!(at.normal.array instanceof Float32Array) || at.normal.isInterleavedBufferAttribute)) || (at.uv && (!(at.uv.array instanceof Float32Array) || at.uv.isInterleavedBufferAttribute || at.uv.itemSize !== 2))) return this.addByLibrary(geometry, matrix, hex, shade, smooth, uvMode);
    const index = geometry.index ? geometry.index.array : null;
    const count = index ? index.length : position.count;
    if (count % 3 !== 0) return this.addByLibrary(geometry, matrix, hex, shade, smooth, uvMode);
    return this.write(position.array, index, count, smooth && at.normal ? at.normal.array : null, at.uv ? at.uv.array : null, matrix, hex, shade, uvMode);
  }

  // `count` points of the shape (taken in the order of `index`, if it has one), moved by `matrix`.
  write(P, index, count, N, T, matrix, hex, shade, uvMode) {
    const e = matrix.elements;
    const start = this.positions.length;
    const pos = this.positions.room(count * 3), nrm = this.normals.room(count * 3), col = this.colours.room(count * 3);
    const uvAt = this.uvs.length;
    const uvs = this.uvs.room(count * 2);
    const c = linear(hex).multiplyScalar(shade);
    const cr = c.r, cg = c.g, cb = c.b;
    const s = this.scale;
    const mode = uvMode === 'plan' ? 1 : uvMode === 'planZ' ? 2 : uvMode === 'wall' ? 3 : T ? 4 : 0;
    const m = N ? normalMatrix().getNormalMatrix(matrix).elements : null;
    for (let k = 0, o = start, u = uvAt; k < count; k += 1, o += 3, u += 2) {
      const v = index ? index[k] : k;
      const a = v * 3;
      const x = P[a], y = P[a + 1], z = P[a + 2];
      const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
      pos[o] = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
      pos[o + 1] = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
      pos[o + 2] = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
      if (m) {
        // the shape's own normals, turned with it
        const nx = N[a], ny = N[a + 1], nz = N[a + 2];
        const tx = m[0] * nx + m[3] * ny + m[6] * nz, ty = m[1] * nx + m[4] * ny + m[7] * nz, tz = m[2] * nx + m[5] * ny + m[8] * nz;
        const inv = 1 / (Math.sqrt(tx * tx + ty * ty + tz * tz) || 1);
        nrm[o] = tx * inv; nrm[o + 1] = ty * inv; nrm[o + 2] = tz * inv;
      }
      col[o] = cr; col[o + 1] = cg; col[o + 2] = cb;
      // (where a texture lies is worked out from the point as it was stored: a 32-bit float)
      if (mode === 1) { uvs[u] = pos[o] / s; uvs[u + 1] = pos[o + 2] / s; }
      else if (mode === 2) { uvs[u] = pos[o + 2] / s; uvs[u + 1] = pos[o] / s; }
      else if (mode === 3) { uvs[u] = (pos[o] + pos[o + 2]) / s; uvs[u + 1] = pos[o + 1] / s; }
      else if (mode === 4) { uvs[u] = T[v * 2]; uvs[u + 1] = T[v * 2 + 1]; }
      else { uvs[u] = 0; uvs[u + 1] = 0; }
    }
    if (!m) {
      // every face catches the light on its own: its normal is across its own three points, as they were stored
      const end = start + count * 3;
      for (let o = start; o < end; o += 9) {
        const bx = pos[o + 3], by = pos[o + 4], bz = pos[o + 5];
        const cx = pos[o + 6] - bx, cy = pos[o + 7] - by, cz = pos[o + 8] - bz;
        const ax = pos[o] - bx, ay = pos[o + 1] - by, az = pos[o + 2] - bz;
        // (kept as a 32-bit float before it is made one long, as the library keeps it)
        const x = Math.fround(cy * az - cz * ay), y = Math.fround(cz * ax - cx * az), z = Math.fround(cx * ay - cy * ax);
        const inv = 1 / (Math.sqrt(x * x + y * y + z * z) || 1);
        const nx = x * inv, ny = y * inv, nz = z * inv;
        nrm[o] = nx; nrm[o + 1] = ny; nrm[o + 2] = nz;
        nrm[o + 3] = nx; nrm[o + 4] = ny; nrm[o + 5] = nz;
        nrm[o + 6] = nx; nrm[o + 7] = ny; nrm[o + 8] = nz;
      }
    }
    this.positions.length += count * 3; this.normals.length += count * 3; this.colours.length += count * 3; this.uvs.length += count * 2;
    return this;
  }

  // The same, by the library's own steps: for a shape `write` does not take, and what `write` is tested against.
  addByLibrary(geometry, matrix, hex, shade = 1, smooth = false, uvMode = this.uv) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    g.applyMatrix4(matrix);
    if (!smooth || !g.attributes.normal) g.computeVertexNormals();
    const c = linear(hex).multiplyScalar(shade);
    const p = g.attributes.position.array;
    const n = g.attributes.normal.array;
    const t = g.attributes.uv ? g.attributes.uv.array : null;
    const s = this.scale;
    const count = p.length / 3;
    const start = this.positions.length, uvAt = this.uvs.length;
    const pos = this.positions.room(count * 3), nrm = this.normals.room(count * 3), col = this.colours.room(count * 3), uvs = this.uvs.room(count * 2);
    for (let i = 0, j = 0; i < p.length; i += 3, j += 2) {
      const o = start + i, u = uvAt + j;
      pos[o] = p[i]; pos[o + 1] = p[i + 1]; pos[o + 2] = p[i + 2];
      nrm[o] = n[i]; nrm[o + 1] = n[i + 1]; nrm[o + 2] = n[i + 2];
      col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b;
      if (uvMode === 'plan') { uvs[u] = p[i] / s; uvs[u + 1] = p[i + 2] / s; }
      else if (uvMode === 'planZ') { uvs[u] = p[i + 2] / s; uvs[u + 1] = p[i] / s; }
      else if (uvMode === 'wall') { uvs[u] = (p[i] + p[i + 2]) / s; uvs[u + 1] = p[i + 1] / s; }
      else if (t) { uvs[u] = t[j]; uvs[u + 1] = t[j + 1]; }
      else { uvs[u] = 0; uvs[u + 1] = 0; }
    }
    this.positions.length += count * 3; this.normals.length += count * 3; this.colours.length += count * 3; this.uvs.length += count * 2;
    g.dispose();
    return this;
  }

  round(geometry, matrix, hex, shade = 1, uvMode) { return this.add(geometry, matrix, hex, shade, true, uvMode); }

  box(w, h, d, matrix, hex, shade = 1, uvMode = this.uv) { const points = boxOf(w, h, d); return this.write(points, null, 36, null, boxUv, matrix, hex, shade, uvMode); }

  get empty() { return !this.positions || this.positions.length === 0; }

  build(material) {
    if (this.built) throw new Error('This batch has been built already: its numbers were let go.');
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions.take(), 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(this.normals.take(), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colours.take(), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(this.uvs.take(), 2));
    geometry.computeBoundingSphere();
    // These meshes never change and nothing reads their numbers again, so once the graphics card has a
    // copy the page lets its own go. The town is some eighty megabytes of them.
    for (const attribute of Object.values(geometry.attributes)) attribute.onUpload(letGo);
    // Whoever built the town keeps hold of this batch for as long as the page is open, so the lists it was
    // gathered in are dropped here.
    this.built = true;
    this.positions = this.normals = this.colours = this.uvs = null;
    return new THREE.Mesh(geometry, material);
  }
}

// The same thing as a Batch, cut into squares of ground: whatever is added
// goes into the mesh for the square it stands in. A town in one mesh is
// always drawn whole, and its shadows are always cast whole; in squares, what
// is behind the camera or beyond the reach of the shadows is skipped.
export class Chunked {
  constructor(options = {}, size = 125) { this.options = options; this.size = size; this.chunks = new Map(); }

  // the square a shape belongs to: where its matrix puts it, or (placed by its own coordinates) its first point
  pick(points, matrix) {
    const e = matrix.elements;
    let x = e[12], z = e[14];
    if (x === 0 && z === 0 && e[0] === 1 && e[10] === 1) { x = points[0]; z = points[2]; }
    const key = `${Math.floor(x / this.size)},${Math.floor(z / this.size)}`;
    let chunk = this.chunks.get(key);
    if (!chunk) { chunk = new Batch(this.options); this.chunks.set(key, chunk); }
    return chunk;
  }

  add(geometry, matrix, hex, shade = 1, smooth = false, uvMode) { this.pick(geometry.attributes.position.array, matrix).add(geometry, matrix, hex, shade, smooth, uvMode); return this; }

  round(geometry, matrix, hex, shade = 1, uvMode) { return this.add(geometry, matrix, hex, shade, true, uvMode); }

  box(w, h, d, matrix, hex, shade, uvMode) { this.pick(boxOf(w, h, d), matrix).box(w, h, d, matrix, hex, shade, uvMode); return this; }

  get empty() { return this.chunks.size === 0; }

  // one mesh for each square
  build(material) { return [...this.chunks.values()].map((chunk) => chunk.build(material)); }
}

// Things too far away to matter are not drawn. A sight list holds meshes and
// how far each can be seen from; `look` shows the ones in range. `reach` is
// how far the air lets one see at the moment.
export function createSight() {
  const list = [];
  return {
    add(mesh, limit = Infinity, centre = null) {
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
      const sphere = mesh.geometry.boundingSphere;
      const c = centre || sphere.center;
      list.push({ mesh, x: c.x, z: c.z, radius: centre ? centre.radius || 0 : sphere.radius, limit });
      return mesh;
    },
    look(x, z, reach) { for (const it of list) it.mesh.visible = Math.hypot(it.x - x, it.z - z) - it.radius < Math.min(reach, it.limit); },
    size: () => list.length,
  };
}

// A pitched roof with its ridge along the longer side.
export function gableGeometry(w, d, rise) {
  const alongX = w >= d;
  const hw = w / 2;
  const hd = d / 2;
  const v = alongX
    ? { a: [-hw, 0, hd], b: [hw, 0, hd], c: [hw, 0, -hd], e: [-hw, 0, -hd], r1: [-hw, rise, 0], r2: [hw, rise, 0] }
    : { a: [-hw, 0, -hd], b: [-hw, 0, hd], c: [hw, 0, hd], e: [hw, 0, -hd], r1: [0, rise, -hd], r2: [0, rise, hd] };
  const tris = [v.a, v.b, v.r2, v.a, v.r2, v.r1, v.c, v.e, v.r1, v.c, v.r1, v.r2, v.e, v.a, v.r1, v.b, v.c, v.r2];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
  geometry.computeVertexNormals();
  return geometry;
}

// A solid of revolution from [radius, height] pairs, optionally squashed front to back.
export function lathe(profile, segments = 16, phiStart = 0, phiLength = Math.PI * 2) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)), segments, phiStart, phiLength);
}

// A limb: a tapered cylinder hanging down from its top end.
export function limb(top, bottom, length, segments = 10) {
  const g = new THREE.CylinderGeometry(top, bottom, length, segments, 1);
  g.translate(0, -length / 2, 0);
  return g;
}

// A name to float over someone's head: white letters with a dark edge so they read against anything, and nothing behind them.
export function nameTexture(text, { width = 512, height = 96, size = 46 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  let px = size;
  const face = (n) => `600 ${n}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
  ctx.font = face(px);
  while (ctx.measureText(text).width > width - 28 && px > 18) { px -= 2; ctx.font = face(px); }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
  ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = Math.max(4, px * 0.14);
  ctx.strokeText(text, width / 2, height / 2 + 2);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, width / 2, height / 2 + 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;
  texture.anisotropy = 4;
  return texture;
}

export function textTexture(lines, { width = 512, height = 128, background = '#f3ecdc', colour = '#171a2e', border = null, size = 54 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;
  texture.anisotropy = 4;
  const draw = () => {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
    if (border) { ctx.strokeStyle = border; ctx.lineWidth = 10; ctx.strokeRect(5, 5, width - 10, height - 10); }
    ctx.fillStyle = colour;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const rows = Array.isArray(lines) ? lines : [lines];
    rows.forEach((row, index) => {
      const text = typeof row === 'string' ? row : row.text;
      let px = (typeof row === 'string' ? size : row.size) || size;
      ctx.font = `800 ${px}px "Arial Narrow", "Roboto Condensed", Impact, sans-serif`;
      while (ctx.measureText(text).width > width - 36 && px > 14) { px -= 2; ctx.font = `800 ${px}px "Arial Narrow", "Roboto Condensed", Impact, sans-serif`; }
      if (row.colour) ctx.fillStyle = row.colour; else ctx.fillStyle = colour;
      ctx.fillText(text, width / 2, (height * (index + 0.5)) / rows.length + 2);
    });
    texture.needsUpdate = true;
  };
  draw();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw).catch(() => {});
  return texture;
}

// ---------------------------------------------------------------- noise --

export function noise(x, z) {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

export function smoothNoise(x, z) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const w = zf * zf * (3 - 2 * zf);
  const a = noise(xi, zi), b = noise(xi + 1, zi), c = noise(xi, zi + 1), d = noise(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
}

// Noise that repeats every `period` cells, so a texture made from it tiles.
function tileNoise(x, y, period) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const at = (i, j) => noise(((i % period) + period) % period, ((j % period) + period) % period);
  const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function canvasTexture(size, paint, { repeat = true, srgb = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  paint(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.encoding = THREE.sRGBEncoding;
  if (repeat) { texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping; }
  texture.anisotropy = 4;
  return texture;
}

function paintPixels(ctx, size, fn) {
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a = 255] = fn(x, y);
      const i = (y * size + x) * 4;
      image.data[i] = r; image.data[i + 1] = g; image.data[i + 2] = b; image.data[i + 3] = a;
    }
  }
  ctx.putImageData(image, 0, 0);
}

// ------------------------------------------------------------- textures --
// Surface textures are near-white grain. They are multiplied by each
// surface's own colour, so one texture serves every wall or every road.

// A tower's glass curtain wall, for a tower drawn as its plain shape (from afar, or while its model is on its way):
// panes of sky-blue glass, each a little its own shade, between pale mullions and spandrels, `across` panes by `up`
// floors to the picture, near-white so that each shape's own colour tints it (18 October 2026, the owner's brief: a
// building seen from afar kept its shape and its surface, and was not a dark slab like its own shadow).
const facades = new Map();
export function facadeTexture(across = 8, up = 24) {
  const key = `${across}x${up}`;
  if (facades.has(key)) return facades.get(key);
  const t = canvasTexture(256, (g, size) => {
    const w = size / across, h = size / up;
    g.fillStyle = '#e9edf1'; g.fillRect(0, 0, size, size);
    for (let j = 0; j < up; j += 1) {
      for (let i = 0; i < across; i += 1) {
        const k = 0.78 + noise(i * 3.1, j * 7.7) * 0.22;
        g.fillStyle = `rgb(${Math.round(150 * k)},${Math.round(176 * k)},${Math.round(198 * k)})`;
        g.fillRect(i * w + w * 0.08, j * h + h * 0.16, w * 0.84, h * 0.7);
      }
    }
  });
  facades.set(key, t);
  return t;
}

// Fine mottled grain: plaster, earth, tarmac.
export function grainTexture({ size = 256, low = 0.72, coarse = 0.5, speck = 0.25, seed = 0 } = {}) {
  return canvasTexture(size, (ctx) => paintPixels(ctx, size, (x, y) => {
    const big = tileNoise((x / size) * 8 + seed, (y / size) * 8, 8);
    const mid = tileNoise((x / size) * 32 + seed, (y / size) * 32, 32);
    const fine = noise(x + seed * 7, y);
    const v = low + (1 - low) * (big * coarse + mid * (1 - coarse - speck) + fine * speck);
    const c = Math.round(255 * Math.min(1, v));
    return [c, c, c];
  }));
}

// Grass seen from standing height: short strokes of light and shade.
export function grassTexture(size = 256) {
  return canvasTexture(size, (ctx) => {
    paintPixels(ctx, size, (x, y) => { const v = 200 + Math.round(40 * tileNoise((x / size) * 16, (y / size) * 16, 16)); return [v, v, v]; });
    for (let i = 0; i < 2600; i += 1) {
      const x = noise(i, 1) * size, y = noise(i, 2) * size, len = 3 + noise(i, 3) * 6, lean = (noise(i, 4) - 0.5) * 3;
      const light = noise(i, 5) > 0.5;
      ctx.strokeStyle = light ? 'rgba(255,255,255,0.32)' : 'rgba(140,140,140,0.3)';
      ctx.lineWidth = 1;
      for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) { ctx.beginPath(); ctx.moveTo(x + ox, y + oy); ctx.lineTo(x + ox + lean, y + oy - len); ctx.stroke(); }
    }
  });
}

// Corrugated roofing sheet: the ridges run across the texture's u axis.
export function corrugatedTextures(size = 128) {
  const ridges = 8;
  const map = canvasTexture(size, (ctx) => paintPixels(ctx, size, (x, y) => {
    const wave = Math.cos((x / size) * ridges * Math.PI * 2);
    const streak = tileNoise((x / size) * 16, (y / size) * 4, 4);
    const v = 0.74 + 0.16 * wave + 0.1 * streak;
    const c = Math.round(255 * Math.min(1, v));
    return [c, Math.round(c * (0.97 + 0.03 * streak)), Math.round(c * (0.93 + 0.07 * streak))];
  }));
  const normalMap = canvasTexture(size, (ctx) => paintPixels(ctx, size, (x) => {
    const slope = -Math.sin((x / size) * ridges * Math.PI * 2);
    return [Math.round(127.5 + 110 * slope), 128, 230];
  }), { srgb: false });
  return { map, normalMap };
}

// Ripples on open water, as a normal map that tiles.
export function rippleNormalTexture(size = 256) {
  const h = (x, y) => tileNoise((x / size) * 12, (y / size) * 12, 12) * 0.6 + tileNoise((x / size) * 28 + 3, (y / size) * 28, 28) * 0.4;
  return canvasTexture(size, (ctx) => paintPixels(ctx, size, (x, y) => {
    const dx = h(x + 1, y) - h(x - 1, y);
    const dy = h(x, y + 1) - h(x, y - 1);
    return [Math.round(127.5 - dx * 900), Math.round(127.5 - dy * 900), 255];
  }), { srgb: false });
}

// Rendered plaster, as a normal map that tiles: the slight waves of a trowelled coat, and the sand in it.
export function plasterNormalTexture(size = 256) {
  const h = (x, y) => tileNoise((x / size) * 6, (y / size) * 6, 6) * 0.55 + tileNoise((x / size) * 22 + 5, (y / size) * 22, 22) * 0.3 + noise(((x % size) + size) % size, ((y % size) + size) % size) * 0.15;
  return canvasTexture(size, (ctx) => paintPixels(ctx, size, (x, y) => {
    const dx = h(x + 1, y) - h(x - 1, y);
    const dy = h(x, y + 1) - h(x, y - 1);
    return [Math.round(127.5 - dx * 260), Math.round(127.5 - dy * 260), 255];
  }), { srgb: false });
}

// Printed wrapper cloth: a ground colour with a repeating motif in two more.
export function clothTexture(colours, motif = 'rings', size = 128) {
  const css = (hex) => `#${hex.toString(16).padStart(6, '0')}`;
  const [ground, first, second = first] = colours;
  return canvasTexture(size, (ctx) => {
    ctx.fillStyle = css(ground);
    ctx.fillRect(0, 0, size, size);
    const cell = size / 4;
    for (let i = -1; i < 5; i += 1) {
      for (let j = -1; j < 5; j += 1) {
        const x = i * cell + (j % 2 ? cell / 2 : 0);
        const y = j * cell;
        if (motif === 'rings') {
          ctx.strokeStyle = css(first); ctx.lineWidth = cell * 0.14; ctx.beginPath(); ctx.arc(x, y, cell * 0.3, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = css(second); ctx.beginPath(); ctx.arc(x, y, cell * 0.12, 0, Math.PI * 2); ctx.fill();
        } else if (motif === 'leaves') {
          ctx.fillStyle = css(first);
          for (const turn of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) { ctx.save(); ctx.translate(x, y); ctx.rotate(turn + 0.5); ctx.beginPath(); ctx.ellipse(cell * 0.2, 0, cell * 0.2, cell * 0.08, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
          ctx.fillStyle = css(second); ctx.beginPath(); ctx.arc(x, y, cell * 0.07, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.fillStyle = css(first); ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.fillRect(-cell * 0.22, -cell * 0.22, cell * 0.44, cell * 0.44); ctx.restore();
          ctx.fillStyle = css(second); ctx.fillRect(x - cell * 0.06, y - cell * 0.06, cell * 0.12, cell * 0.12);
        }
      }
    }
  });
}

// A face, painted on a clear ground so it sits on any skin tone: eyes, brows
// and lips. `kind` is 'man', 'woman' or 'elder'; `beard` adds a short beard.
const faceCache = new Map();
export function faceTexture(kind = 'man', beard = false, closed = false) {
  const key = `${kind}|${beard}|${closed}`;
  if (faceCache.has(key)) return faceCache.get(key);
  const size = 256;
  const texture = canvasTexture(size, (ctx) => {
    ctx.clearRect(0, 0, size, size);
    const eyeY = 116, browY = kind === 'woman' ? 86 : 88, mouthY = 191;
    const hair = kind === 'elder' ? '#9a9a96' : '#120d0a';
    if (beard) {
      ctx.fillStyle = kind === 'elder' ? 'rgba(150,150,146,0.8)' : 'rgba(18,13,10,0.78)';
      ctx.beginPath(); ctx.moveTo(74, 168); ctx.quadraticCurveTo(128, 150, 182, 168); ctx.quadraticCurveTo(190, 222, 128, 246); ctx.quadraticCurveTo(66, 222, 74, 168); ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath(); ctx.ellipse(128, mouthY, 27, 11, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    for (const side of [-1, 1]) {
      const cx = 128 + side * 45;
      // soft shade in the socket
      const shade = ctx.createRadialGradient(cx, eyeY - 2, 4, cx, eyeY - 2, 30);
      shade.addColorStop(0, 'rgba(0,0,0,0.12)'); shade.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = shade; ctx.fillRect(cx - 32, eyeY - 32, 64, 64);
      if (closed) {
        ctx.strokeStyle = '#120d0a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx - 17, eyeY); ctx.quadraticCurveTo(cx, eyeY + 6, cx + 17, eyeY); ctx.stroke();
      } else {
        const ry = kind === 'woman' ? 12.5 : 11.5;
        ctx.fillStyle = '#f6f1e8'; ctx.beginPath(); ctx.ellipse(cx, eyeY, 21, ry, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3a2412'; ctx.beginPath(); ctx.arc(cx, eyeY + 0.5, 9.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#0b0705'; ctx.beginPath(); ctx.arc(cx, eyeY + 0.5, 4.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.beginPath(); ctx.arc(cx + 3.5, eyeY - 3.5, 2.3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#120d0a'; ctx.lineWidth = kind === 'woman' ? 3.4 : 2.2; ctx.beginPath(); ctx.moveTo(cx - 22, eyeY); ctx.quadraticCurveTo(cx, eyeY - ry - 5, cx + 22, eyeY); ctx.stroke();
        ctx.strokeStyle = 'rgba(18,13,10,0.35)'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(cx - 20, eyeY + 2); ctx.quadraticCurveTo(cx, eyeY + ry + 2, cx + 20, eyeY + 2); ctx.stroke();
      }
      ctx.strokeStyle = hair; ctx.lineCap = 'round'; ctx.lineWidth = kind === 'woman' ? 3.6 : 5;
      ctx.beginPath(); ctx.moveTo(cx - side * 22, browY + 2); ctx.quadraticCurveTo(cx, browY - 8, cx + side * 23, browY + 4); ctx.stroke();
    }
    // lips
    ctx.fillStyle = kind === 'woman' ? 'rgba(120,36,44,0.82)' : 'rgba(74,38,30,0.62)';
    ctx.beginPath(); ctx.moveTo(100, mouthY - 3); ctx.quadraticCurveTo(115, mouthY - 10, 128, mouthY - 5); ctx.quadraticCurveTo(141, mouthY - 10, 156, mouthY - 3); ctx.quadraticCurveTo(128, mouthY + 6, 100, mouthY - 3); ctx.fill();
    ctx.fillStyle = kind === 'woman' ? 'rgba(150,56,60,0.8)' : 'rgba(104,58,46,0.55)';
    ctx.beginPath(); ctx.moveTo(100, mouthY - 3); ctx.quadraticCurveTo(128, mouthY + 20, 156, mouthY - 3); ctx.quadraticCurveTo(128, mouthY + 6, 100, mouthY - 3); ctx.fill();
    ctx.strokeStyle = 'rgba(20,10,8,0.7)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(98, mouthY - 4); ctx.quadraticCurveTo(128, mouthY + 7, 158, mouthY - 4); ctx.stroke();
    if (kind === 'elder') {
      ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 1.6;
      for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(128 + side * 26, 150); ctx.quadraticCurveTo(128 + side * 40, 172, 128 + side * 34, 198); ctx.stroke(); }
      for (const y of [58, 68]) { ctx.beginPath(); ctx.moveTo(92, y); ctx.quadraticCurveTo(128, y - 4, 164, y); ctx.stroke(); }
    }
  }, { repeat: false });
  faceCache.set(key, texture);
  return texture;
}

// ------------------------------------------------------- building parts --

export const shadeOf = (hex, k) => { const c = new THREE.Color(hex); c.multiplyScalar(k); return c.getHex(); };

// A pitched roof of corrugated sheet over a w by d box whose walls end at
// `top`: two slopes with eaves, fascia boards, a ridge cap, and gable ends in
// the wall's colour. `B` holds the batches: roofs, solid and walls.
export function addPitchedRoof(B, x, z, w, d, top, roofColour, wallColour, over = 0.75, pitch = 0.52) {
  const { solid, walls, roofs } = B;
  const alongX = w >= d;
  const half = (alongX ? d : w) / 2;
  const span = alongX ? w : d;
  const rise = half * pitch;
  const slope = rise / half;
  const run = half + over;
  const length = Math.hypot(run, run * slope);
  const angle = Math.atan(slope);
  const midY = top + rise - (run * slope) / 2 + 0.05;
  for (const side of [-1, 1]) {
    if (alongX) roofs.box(span + over * 2, 0.07, length, place(x, midY, z + (side * run) / 2, 0, 1, 1, 1, side * angle, 0), roofColour, 1, 'plan');
    else roofs.box(length, 0.07, span + over * 2, place(x + (side * run) / 2, midY, z, 0, 1, 1, 1, 0, -side * angle), roofColour, 1, 'planZ');
    const eaveY = top - over * slope;
    if (alongX) solid.box(span + over * 2, 0.16, 0.05, place(x, eaveY - 0.02, z + side * run), shadeOf(roofColour, 0.55));
    else solid.box(0.05, 0.16, span + over * 2, place(x + side * run, eaveY - 0.02, z), shadeOf(roofColour, 0.55));
    const tri = alongX
      ? [[top, -half], [top, half], [top + rise, 0]].map(([y, dz]) => [x + (side * w) / 2, y, z + dz])
      : [[-half, top], [half, top], [0, top + rise]].map(([dx, y]) => [x + dx, y, z + (side * d) / 2]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...tri[0], ...tri[1], ...tri[2]], 3));
    walls.add(g, new THREE.Matrix4(), wallColour, 0.96);
    // a round vent in the gable
    solid.round(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 12), alongX ? place(x + side * (w / 2 + 0.02), top + rise * 0.42, z, 0, 1, 1, 1, 0, Math.PI / 2) : place(x, top + rise * 0.42, z + side * (d / 2 + 0.02), 0, 1, 1, 1, Math.PI / 2, 0), 0x3a3026);
  }
  if (alongX) solid.box(span + over * 2 + 0.1, 0.09, 0.3, place(x, top + rise + 0.09, z), shadeOf(roofColour, 0.8));
  else solid.box(0.3, 0.09, span + over * 2 + 0.1, place(x, top + rise + 0.09, z), shadeOf(roofColour, 0.8));
  return { rise, alongX };
}

// A louvred window in a timber frame, on a wall that runs along x or along z.
export function addWindow(B, x, y, z, alongX, barred, w = 1.3, h = 1.15) {
  const { solid, glow } = B;
  const size = (ww, hh, dd) => (alongX ? [ww, hh, dd] : [dd, hh, ww]);
  solid.box(...size(w + 0.22, h + 0.22, 0.1), place(x, y, z), 0x5d4630);                       // frame
  glow.box(...size(w, h, 0.12), place(x, y, z), 0x8aa2ae);                                       // glass
  solid.box(...size(0.06, h, 0.14), place(x, y, z), 0x5d4630);                                 // mullion
  for (let i = 0; i < 5; i += 1) solid.box(...size(w, 0.025, 0.16), place(x, y - h / 2 + ((i + 0.5) * h) / 5, z), 0xd4d7d6);   // louvre blades
  solid.box(...size(w + 0.36, 0.07, 0.22), place(x, y - h / 2 - 0.14, z), 0x9c958a);           // sill
  if (barred) for (let i = 0; i < 4; i += 1) solid.box(...size(0.03, h, 0.18), place(alongX ? x - w / 2 + ((i + 0.5) * w) / 4 : x, y, alongX ? z : z - w / 2 + ((i + 0.5) * w) / 4), 0x2a2b2f);
}


// How a surface answers the light. A desktop graphics card can afford to work that out for every pixel,
// with roughness and sheen; a phone's cannot do it for a whole town at once and hold its frame rate. On a
// phone (see `lite` in main.js) the light is worked out at each corner of a face and spread across it:
// the same colours, the same shadows, without the gloss. It is decided once, before anything is built.
let lite = false;
export function setLite(on) { lite = !!on; buildingMaterials = null; }
export function isLite() { return lite; }
export function surface(options) {
  if (!lite) return new THREE.MeshStandardMaterial(options);
  const { roughness, metalness, normalMap, normalScale, roughnessMap, metalnessMap, envMap, envMapIntensity, ...plain } = options;
  return new THREE.MeshLambertMaterial(plain);
}

// The materials buildings are made of, shared by everything that builds one.
let buildingMaterials = null;
export function buildingKit() {
  if (buildingMaterials) return buildingMaterials;
  const sheet = corrugatedTextures();
  buildingMaterials = {
    solid: surface({ vertexColors: true, roughness: 0.86, metalness: 0.02 }),
    // (painted plaster: the paint's faint sheen, and the plaster's own slight unevenness under it)
    walls: surface({ vertexColors: true, map: grainTexture({ low: 0.74 }), normalMap: plasterNormalTexture(), normalScale: new THREE.Vector2(0.45, 0.45), roughness: 0.88, metalness: 0, side: THREE.DoubleSide }),
    // (corrugated zinc: a dull metal, giving back a little of the sky: render-finish.js)
    roofs: surface({ vertexColors: true, map: sheet.map, normalMap: sheet.normalMap, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.5, metalness: 0.45 }),
  };
  return buildingMaterials;
}
