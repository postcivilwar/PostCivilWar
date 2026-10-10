// The character kit: the base character's skeleton and every part that is
// skinned to it. The data is baked by tools/characters/bake.py; this unpacks
// it into typed arrays the first time a part is asked for.

import { KIT_META, KIT_B64 } from './character-kit-data.js';
// The baked figures (src/client/figure-data.js, from tools/characters/figures.py) are no longer in the
// game: the owner's animated figures replaced them (src/client/animated.js). The pack stays empty so that
// nothing of the old figures is carried in the page; the bake still works if they are wanted again.
const FIGURE_META = { figures: {}, parts: {} };
const FIGURE_B64 = '';

// Two packs: the kit (the base character and everything fitted to it) and the owner's supplied figures
// (tools/characters/figures.py). Both are skinned to the same skeleton; a figure's parts are called fig.<id>.
const packs = { kit: { meta: KIT_META, b64: KIT_B64, bytes: null }, fig: { meta: FIGURE_META, b64: FIGURE_B64, bytes: null } };
const packOf = (id) => (id.startsWith('fig.') ? packs.fig : packs.kit);
function buffer(pack) {
  if (pack.bytes) return pack.bytes;
  const text = atob(pack.b64);
  pack.bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) pack.bytes[i] = text.charCodeAt(i);
  return pack.bytes;
}

const cache = new Map();

// One level of detail of one part, unpacked: positions and normals as
// floats in metres, everything else as it was stored.
export function kitPart(id, lod = 0) {
  const pack = packOf(id);
  const META = pack.meta;
  const part = META.parts[id];
  if (!part) throw new Error(`no character part called ${id}`);
  const level = Math.min(lod, part.lods.length - 1);
  const key = `${id}|${level}`;
  let out = cache.get(key);
  if (out) return out;
  const rec = part.lods[level];
  const data = buffer(pack).buffer;
  const n = rec.v;
  const rawPos = new Int16Array(data, rec.pos, n * 3);
  const rawNrm = new Int8Array(data, rec.nrm, n * 3);
  const rawUv = new Int16Array(data, rec.uv, n * 2);
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  const k = META.posRange / 32767;
  for (let i = 0; i < n * 3; i += 1) { pos[i] = rawPos[i] * k + (i % 3 === 1 ? META.posLift : 0); nrm[i] = rawNrm[i] / 127; }
  for (let i = 0; i < n * 2; i += 1) uv[i] = rawUv[i] / META.uvScale;
  out = {
    id, lod: level, count: n, triangles: rec.t, pos, nrm, uv,
    joints: new Uint8Array(data, rec.joints, n * 4),
    weights: new Uint8Array(data, rec.weights, n * 4),
    slot: new Uint8Array(data, rec.slot, n),
    shade: new Uint8Array(data, rec.shade, n),
    idx: new Uint16Array(data, rec.idx, rec.t * 3),
    meta: part,
  };
  cache.set(key, out);
  return out;
}

export const kitHas = (id) => !!packOf(id).meta.parts[id];
// A supplied figure's own measures: where its bones stand above the hips, its height, which arms keep their pose.
export const figureMeta = (id) => FIGURE_META.figures[id] || null;
export const figureIds = () => Object.keys(FIGURE_META.figures);
export const kitParts = () => Object.keys(KIT_META.parts);
export const kitBones = () => KIT_META.bones;
// A named pose of the skeleton: each bone's place and turn in its parent. 'base' is how the model was bound.
export const kitPose = (name) => (name === 'natural' ? KIT_META.poses.natural : { t: KIT_META.bones.map((b) => b.t), q: KIT_META.bones.map((b) => b.r) });
export const kitIdle = () => KIT_META.idle || null;
export const kitSlots = () => KIT_META.slots;
export const KIT_SHADE_ONE = KIT_META.shadeOne;
