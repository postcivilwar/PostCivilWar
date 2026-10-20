// Reading a GLB file's two parts, its description and its numbers: the part of glb.js that needs no page and no
// three.js, so that the figures' worker (figure-worker.js) reads a file the very same way the page does.
//
// It reads what the owner's files use (one skinned mesh, its pictures, its skeleton, its animations) and what the
// light copies made from them use (tools/characters/light.py): numbers stored as 8 and 16 bits (KHR_mesh_quantization,
// and glTF's own 16-bit turns in animations), elements padded to four bytes, and pictures as WebP files beside the
// model (EXT_texture_webp). A file that needs anything else is refused by name, never drawn wrong.
//
// The worker's source is put together from inflate.js, this file and figure-worker.js by build.mjs: nothing here may
// use anything outside it.

export const GLB_READS = ['KHR_mesh_quantization', 'EXT_texture_webp'];
const GLB_TYPES = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const GLB_WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const GLB_MAX = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };

// The file's description and its binary data. Pure: runs without a page.
export function readGLB(buffer) {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB file');
  if (view.getUint32(4, true) !== 2) throw new Error('not glTF 2.0');
  let at = 12, json = null, bin = null;
  while (at < view.byteLength) {
    const length = view.getUint32(at, true), type = view.getUint32(at + 4, true);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, at + 8, length)));
    else if (type === 0x004e4942) bin = new Uint8Array(buffer, at + 8, length);
    at += 8 + length;
  }
  if (!json || !bin) throw new Error('GLB without its description or its data');
  for (const ext of json.extensionsRequired || []) if (!GLB_READS.includes(ext)) throw new Error(`the file needs ${ext}, which this reader does not have`);
  return { json, bin };
}

// One accessor's numbers, copied out of the file into an array of their own (so that they do not hold on to the
// whole file, are aligned however the file was packed, and have no padding between elements). `float`: as floats,
// a normalized integer turned back into the -1..1 (or 0..1) it stands for, as glTF lays down.
export function readAccessor(json, bin, i, float = false) {
  const a = json.accessors[i];
  if (a.sparse) throw new Error('a sparse accessor is not read here');
  const bv = json.bufferViews[a.bufferView];
  const T = GLB_TYPES[a.componentType], n = GLB_WIDTH[a.type];
  if (!T || !n) throw new Error(`an accessor of ${a.componentType}/${a.type} is not read here`);
  const size = T.BYTES_PER_ELEMENT * n;
  const stride = bv.byteStride || size;
  const start = bin.byteOffset + (bv.byteOffset || 0) + (a.byteOffset || 0);
  let out;
  if (stride === size) {
    out = new T(bin.buffer.slice(start, start + a.count * size));
  } else {
    // each element padded out (an 8-bit normal is three bytes and a spare, a 16-bit position six and two spare)
    const raw = new Uint8Array(bin.buffer, start, stride * (a.count - 1) + size);
    const packed = new Uint8Array(a.count * size);
    for (let k = 0; k < a.count; k += 1) packed.set(raw.subarray(k * stride, k * stride + size), k * size);
    out = new T(packed.buffer);
  }
  const normalized = !!a.normalized;
  if (float && T !== Float32Array) {
    const f = new Float32Array(out.length);
    const most = normalized ? GLB_MAX[a.componentType] : 1;
    for (let k = 0; k < out.length; k += 1) f[k] = Math.max(out[k] / most, -1);
    return { array: f, width: n, count: a.count, normalized: false };
  }
  return { array: out, width: n, count: a.count, normalized };
}

// The accessors an animation reads (its keys' times and values): as floats, which is how three.js plays them.
export function animationAccessors(json) {
  const out = new Set();
  for (const a of json.animations || []) for (const s of a.samplers) { out.add(s.input); out.add(s.output); }
  return out;
}

// The animations, as plain data: a name, a length, and per node the keyed values.
export function readAnimations(json, accessor) {
  return (json.animations || []).map((a) => {
    let length = 0;
    const tracks = a.channels.map((c) => {
      const s = a.samplers[c.sampler];
      const times = accessor(s.input, true).array, values = accessor(s.output, true).array;
      length = Math.max(length, times[times.length - 1]);
      return { node: json.nodes[c.target.node].name, path: c.target.path, times, values, step: s.interpolation === 'STEP' };
    });
    return { name: a.name, length, tracks };
  });
}

// The picture a texture shows: its own `source`, or (a WebP picture) the one its EXT_texture_webp names.
export function textureSource(json, index) {
  const t = json.textures[index];
  if (t.extensions && t.extensions.EXT_texture_webp) return t.extensions.EXT_texture_webp.source;
  return t.source;
}

// A whole file read into arrays of its own, ready to be handed from a worker to the page: every accessor (the
// animations' as floats), keyed by its index. The file's own buffer is not kept.
export function splitGLB(buffer) {
  const { json, bin } = readGLB(buffer);
  const animated = animationAccessors(json);
  const arrays = {};
  for (let i = 0; i < (json.accessors || []).length; i += 1) {
    if (json.accessors[i].bufferView === undefined) continue;
    const a = readAccessor(json, bin, i, animated.has(i));
    arrays[i] = a.array;
  }
  return { json, arrays };
}
