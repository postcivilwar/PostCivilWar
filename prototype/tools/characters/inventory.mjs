// What each figure the website serves is made of: the file's size, every picture in it (its kind, size in pixels and
// bytes, and what it costs decoded), triangles, vertices, joints, animations and the bytes they take. For the
// owner's brief of 20 October 2026 (the slow character screen and "the picture was lost" on phones), before and after.
//   node tools/characters/inventory.mjs [site folder] [--json out.json]
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIGURES } from '../../src/sim/figures.js';

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : resolve(here, '../../../site'));
const jsonAt = process.argv.indexOf('--json') > 0 ? process.argv[process.argv.indexOf('--json') + 1] : null;

// The GLB's two chunks.
export function readGlb(bytes) {
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB');
  let at = 12, json = null, bin = null;
  while (at < b.length) {
    const len = b.readUInt32LE(at), type = b.readUInt32LE(at + 4);
    const body = b.subarray(at + 8, at + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(body.toString('utf8'));
    else if (type === 0x004e4942) bin = body;
    at += 8 + len;
  }
  return { json, bin };
}
// A picture's width and height from its own header (JPEG, PNG, WebP).
export function pictureSize(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return { kind: 'png', w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) { i += 1; continue; }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { kind: 'jpeg', h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      i += 2 + buf.readUInt16BE(i + 2);
    }
    return { kind: 'jpeg', w: 0, h: 0 };
  }
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return { kind: 'webp', w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
    if (chunk === 'VP8L') { const v = buf.readUInt32LE(21); return { kind: 'webp', w: 1 + (v & 0x3fff), h: 1 + ((v >> 14) & 0x3fff) }; }
    if (chunk === 'VP8 ') return { kind: 'webp', w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  }
  if (buf.toString('ascii', 0, 4) === '\xabKTX') return { kind: 'ktx2', w: buf.readUInt32LE(20), h: buf.readUInt32LE(24) };
  return { kind: 'unknown', w: 0, h: 0 };
}
const ELEMENT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };

export function describe(bytes) {
  const { json, bin } = readGlb(bytes);
  const views = json.bufferViews || [];
  const viewBytes = (i) => (views[i] ? views[i].byteLength : 0);
  const pictures = (json.images || []).map((img, i) => {
    const v = views[img.bufferView];
    const buf = bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
    const size = pictureSize(buf);
    // which material slot uses it
    const used = new Set();
    for (const m of json.materials || []) {
      const slot = (t, name) => { if (t && json.textures[t.index] && pictureOf(json.textures[t.index]) === i) used.add(name); };
      const p = m.pbrMetallicRoughness || {};
      slot(p.baseColorTexture, 'colour'); slot(p.metallicRoughnessTexture, 'metal/rough'); slot(m.normalTexture, 'normal'); slot(m.occlusionTexture, 'occlusion'); slot(m.emissiveTexture, 'emissive');
    }
    return { i, ...size, bytes: v.byteLength, mime: img.mimeType, decodedMB: +(size.w * size.h * 4 / 1048576).toFixed(1), used: [...used].join('+') || '?' };
  });
  function pictureOf(t) { const e = t.extensions || {}; for (const k of Object.keys(e)) if (e[k] && typeof e[k].source === 'number') return e[k].source; return t.source; }
  let triangles = 0, vertices = 0, geometryBytes = 0;
  const seenAcc = new Set();
  for (const mesh of json.meshes || []) for (const p of mesh.primitives) {
    const pos = json.accessors[p.attributes.POSITION];
    vertices += pos.count;
    triangles += p.indices !== undefined ? json.accessors[p.indices].count / 3 : pos.count / 3;
    for (const a of [...Object.values(p.attributes), ...(p.indices !== undefined ? [p.indices] : []), ...((p.targets || []).flatMap((t) => Object.values(t)))]) {
      if (seenAcc.has(a)) continue; seenAcc.add(a);
      const acc = json.accessors[a]; geometryBytes += acc.count * ELEMENT[acc.type] * BYTES[acc.componentType];
    }
  }
  const joints = (json.skins || []).reduce((n, s) => Math.max(n, s.joints.length), 0);
  let animationBytes = 0, keys = 0;
  const animAcc = new Set();
  for (const an of json.animations || []) for (const s of an.samplers) for (const a of [s.input, s.output]) {
    if (animAcc.has(a)) continue; animAcc.add(a);
    const acc = json.accessors[a]; animationBytes += acc.count * ELEMENT[acc.type] * BYTES[acc.componentType];
    if (a === s.input) keys += acc.count;
  }
  return {
    bytes: bytes.length, pictures, picturesBytes: pictures.reduce((n, p) => n + p.bytes, 0), decodedMB: +pictures.reduce((n, p) => n + p.decodedMB, 0).toFixed(1),
    triangles: Math.round(triangles), vertices, geometryBytes, joints, animations: (json.animations || []).length, animationBytes, keys,
    extensions: json.extensionsUsed || [],
  };
}

// What the page asks for each figure (build.mjs: the six of 8 and 12 October as base64 text, the rest as .glb).
const B64 = { 'muscular_male.glb': 'man.b64.txt', 'woman.glb': 'woman.b64.txt', 'athlete.glb': 'athlete.b64.txt', 'police.glb': 'police.b64.txt', 'priest.glb': 'priest.b64.txt', 'warrior.glb': 'warrior.b64.txt' };
if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = [];
  for (const f of Object.values(FIGURES)) {
    const asB64 = B64[f.file] && existsSync(resolve(site, B64[f.file]));
    const servedName = asB64 ? B64[f.file] : f.file;
    const path = resolve(site, servedName);
    if (!existsSync(path)) { rows.push({ id: f.id, file: servedName, missing: true }); continue; }
    const raw = readFileSync(path);
    const bytes = asB64 ? Buffer.from(raw.toString('utf8'), 'base64') : raw;
    rows.push({ id: f.id, name: f.name, file: servedName, served: raw.length, ...describe(bytes) });
  }
  const mb = (n) => (n / 1048576).toFixed(1);
  console.log('id   file                       served MB  pictures (kind wxh MB use)                                              tris    verts  joints anims  geomMB animMB decodedMB');
  for (const r of rows) {
    if (r.missing) { console.log(`${r.id.padEnd(4)} ${r.file} MISSING`); continue; }
    const pics = r.pictures.map((p) => `${p.kind} ${p.w}x${p.h} ${mb(p.bytes)} ${p.used}`).join('; ');
    console.log(`${r.id.padEnd(4)} ${r.file.padEnd(26)} ${mb(r.served).padStart(6)}     ${pics.padEnd(70).slice(0, 90)} ${String(r.triangles).padStart(7)} ${String(r.vertices).padStart(7)} ${String(r.joints).padStart(4)} ${String(r.animations).padStart(4)} ${mb(r.geometryBytes).padStart(7)} ${mb(r.animationBytes).padStart(6)} ${String(r.decodedMB).padStart(7)}`);
  }
  const total = rows.reduce((n, r) => n + (r.served || 0), 0);
  console.log(`\n${rows.length} figures, ${mb(total)} MB served in all; largest ${mb(Math.max(...rows.map((r) => r.served || 0)))} MB; largest picture ${Math.max(...rows.flatMap((r) => (r.pictures || []).map((p) => Math.max(p.w, p.h))))} px`);
  if (jsonAt) writeFileSync(jsonAt, JSON.stringify(rows, null, 1));
}
