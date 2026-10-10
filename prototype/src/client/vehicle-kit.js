// The vehicle kit: the supplied keke and coach, baked by tools/vehicles/bake.py
// into parts at three levels of detail. This unpacks a part the first time it
// is asked for and builds the geometry every vehicle of that kind shares.

import { VEHICLE_META, VEHICLE_B64 } from './vehicle-kit-data.js';

export const VEHICLE_SLOTS = VEHICLE_META.slots;
export const vehicleMeta = (model) => VEHICLE_META.models[model];
export const vehicleHas = (id) => !!VEHICLE_META.parts[id];
export const vehicleParts = () => Object.keys(VEHICLE_META.parts);
// The kinds of surface a part is drawn in, in material order.
export const VEHICLE_GROUPS = Object.freeze(['solid', 'glass']);

let bytes = null;
function buffer() {
  if (bytes) return bytes;
  const text = atob(VEHICLE_B64);
  bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i);
  return bytes;
}

const parts = new Map();

// One level of detail of one part, unpacked. Positions are metres in the
// part's own frame; normals, slots and triangles are as stored.
export function vehiclePart(id, lod = 0) {
  const part = VEHICLE_META.parts[id];
  if (!part) throw new Error(`no vehicle part called ${id}`);
  const level = Math.min(lod, part.lods.length - 1);
  const key = `${id}|${level}`;
  let out = parts.get(key);
  if (out) return out;
  const rec = part.lods[level];
  const data = buffer().buffer;
  const n = rec.v;
  const q = new Uint16Array(data, rec.pos, n * 3);
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i += 1) pos[i] = rec.lo[i % 3] + (q[i] / 65535) * rec.span[i % 3];
  out = {
    id, lod: level, count: n, triangles: rec.t, pos,
    nrm: new Int8Array(data, rec.nrm, n * 3),
    slot: new Uint8Array(data, rec.slot, n),
    uv: rec.uv === undefined ? null : new Int16Array(data, rec.uv, n * 2),
    idx: rec.wide ? new Uint32Array(data, rec.idx, rec.t * 3) : new Uint16Array(data, rec.idx, rec.t * 3),
    groups: rec.groups,
  };
  parts.set(key, out);
  return out;
}

const geometries = new Map();

// The geometry of one or more parts joined together, shared by every vehicle
// that asks for the same parts at the same level. Its groups are the kinds of
// surface in VEHICLE_GROUPS, so one mesh draws with at most two materials.
export function vehicleGeometry(ids, lod = 0) {
  const list = (Array.isArray(ids) ? ids : [ids]).filter(vehicleHas);
  const key = `${list.join('+')}|${lod}`;
  let geometry = geometries.get(key);
  if (geometry) return geometry;
  const chosen = list.map((id) => vehiclePart(id, lod));
  const count = chosen.reduce((sum, p) => sum + p.count, 0);
  const triangles = chosen.reduce((sum, p) => sum + p.triangles, 0);
  const position = new Float32Array(count * 3);
  const normal = new Int8Array(count * 3);
  const slot = new Uint8Array(count);
  const textured = chosen.some((p) => p.uv);
  const uv = textured ? new Float32Array(count * 2) : null;
  const index = count > 65535 ? new Uint32Array(triangles * 3) : new Uint16Array(triangles * 3);
  let base = 0;
  const bases = [];
  for (const p of chosen) {
    position.set(p.pos, base * 3); normal.set(p.nrm, base * 3); slot.set(p.slot, base);
    if (uv && p.uv) for (let i = 0; i < p.count * 2; i += 1) uv[base * 2 + i] = p.uv[i] / VEHICLE_META.uvScale;
    bases.push(base); base += p.count;
  }
  geometry = new THREE.BufferGeometry();
  let at = 0;
  VEHICLE_GROUPS.forEach((kind, material) => {
    const start = at;
    chosen.forEach((p, k) => {
      const g = p.groups.find((e) => e.kind === kind);
      if (!g) return;
      for (let i = 0; i < g.count; i += 1) index[at + i] = p.idx[g.start + i] + bases[k];
      at += g.count;
    });
    if (at > start) geometry.addGroup(start, at - start, material);
  });
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3, true));
  geometry.setAttribute('slot', new THREE.BufferAttribute(slot, 1));
  if (uv) geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  geometry.userData = { triangles, shared: true };
  geometries.set(key, geometry);
  return geometry;
}

// How many triangles a set of parts has at a level, without building anything.
export const vehicleTriangles = (ids, lod = 0) => (Array.isArray(ids) ? ids : [ids]).filter(vehicleHas).reduce((sum, id) => sum + VEHICLE_META.parts[id].lods[Math.min(lod, VEHICLE_META.parts[id].lods.length - 1)].t, 0);
