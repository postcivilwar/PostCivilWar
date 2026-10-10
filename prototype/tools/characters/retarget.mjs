// Writes src/client/reaction-data.js: some of the supplied figures' own animations, carried over onto the
// game's 22-bone skeleton so that the townspeople can play them (crying, being afraid, falling, boxing,
// kicking, waving...). The supplied GLB files are read and never written.
//
// How a clip is carried over. For each frame, each of the supplied skeleton's joints is turned some way from
// where it stands in the file's own resting pose (its world rotation now, against its world rotation at rest).
// The game bone it matches is turned the same way from the game skeleton's bind pose. Where the two skeletons
// do not rest alike (an arm hanging lower in one), each bone is first brought round to lie the way the
// supplied one lies at rest. Only rotations are carried, so each body keeps its own proportions; the hips also
// carry how far they rise and fall (a fall, a jump), scaled to the game body's height, and never move across
// the ground: every clip plays where the person stands.
//
//   node tools/characters/retarget.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { parseGLB } from '../../src/client/glb.js';
import { kitBones } from '../../src/client/character-kit.js';

const FPS = 15;
// [the word the game uses, which file, which clip]. Words are the same ones the selection screen shows.
const CLIPS = [
  ['afraid', 'woman', 'afraid.001'], ['scared', 'man', 'scared_02.001'], ['cry', 'woman', 'cry.001'], ['sad', 'woman', 'depressed.001'],
  ['defeat', 'woman', 'defeat_03.001'], ['slump', 'woman', 'defeat_02.001'], ['fall', 'woman', 'fall.001'], ['hurt', 'man', 'hit_to_head.001'],
  ['flee', 'woman', 'flee_01.001'], ['jump', 'woman', 'jump_down.001'], ['hop', 'man', 'jump.001'],
  ['punch', 'woman', 'box_01.001'], ['jab', 'woman', 'box_02.001'], ['box', 'woman', 'box_03.001'], ['kick', 'woman', 'front_kick_02.001'], ['stomp', 'woman', 'front_kick_01.001'],
  ['wave', 'woman', 'wave_goodbye_02.001'], ['greet', 'woman', 'greet_03.001'], ['hello', 'man', 'greet_01.001'], ['bow', 'woman', 'bow.001'],
  ['cheer', 'woman', 'cheer.001'], ['clap', 'woman', 'clap.001'], ['laugh', 'woman', 'laugh_02.001'], ['giggle', 'woman', 'laugh_01.001'],
  ['agree', 'woman', 'agree.001'], ['call', 'man', 'make_a_call_02.001'], ['scratch', 'man', 'scratch.001'], ['dance', 'woman', 'dance_01.001'], ['sway', 'woman', 'dance_02.001'],
];
// game bone <- supplied joint (sides are matched by where they stand, below)
const MAP = { Hips: 'pelvis', Spine: 'spine_01', Chest: 'spine_03', Neck: 'neck_01', Head: 'head', Clavicle: 'clavicle', UpperArm: 'upperarm', Forearm: 'lowerarm', Hand: 'hand', Thigh: 'thigh', Shin: 'calf', Foot: 'foot', Toe: 'ball' };
// which bone each one points at, for bringing the two rests into line
const CHILD = { Hips: 'Spine', Spine: 'Chest', Chest: 'Neck', Neck: 'Head', Clavicle: 'UpperArm', UpperArm: 'Forearm', Forearm: 'Hand', Thigh: 'Shin', Shin: 'Foot', Foot: 'Toe' };

// ---- quaternions and vectors, [x, y, z, w] ----
const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qinv = (a) => [-a[0], -a[1], -a[2], a[3]];
const qnorm = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l); };
const qrot = (q, v) => { const p = qmul(qmul(q, [v[0], v[1], v[2], 0]), qinv(q)); return [p[0], p[1], p[2]]; };
const vnorm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
function qbetween(a, b) {          // the shortest turn that takes direction a onto direction b
  a = vnorm(a); b = vnorm(b);
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (d < -0.9999) { const ax = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]; const c = vnorm([a[1] * ax[2] - a[2] * ax[1], a[2] * ax[0] - a[0] * ax[2], a[0] * ax[1] - a[1] * ax[0]]); return [c[0], c[1], c[2], 0]; }
  const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  return qnorm([c[0], c[1], c[2], 1 + d]);
}
const slerp = (a, b, t) => {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  if (d < 0) { b = b.map((v) => -v); d = -d; }
  if (d > 0.9995) return qnorm(a.map((v, i) => v + (b[i] - v) * t));
  const th = Math.acos(d), s = Math.sin(th);
  return a.map((v, i) => (v * Math.sin((1 - t) * th) + b[i] * Math.sin(t * th)) / s);
};
// rotation and position out of a column-major 4x4
function matDecompose(m) {
  const sx = Math.hypot(m[0], m[1], m[2]), sy = Math.hypot(m[4], m[5], m[6]), sz = Math.hypot(m[8], m[9], m[10]);
  const r = [m[0] / sx, m[1] / sx, m[2] / sx, m[4] / sy, m[5] / sy, m[6] / sy, m[8] / sz, m[9] / sz, m[10] / sz];
  const [m11, m21, m31, m12, m22, m32, m13, m23, m33] = r;
  const tr = m11 + m22 + m33; let q;
  if (tr > 0) { const s = 0.5 / Math.sqrt(tr + 1); q = [(m32 - m23) * s, (m13 - m31) * s, (m21 - m12) * s, 0.25 / s]; }
  else if (m11 > m22 && m11 > m33) { const s = 2 * Math.sqrt(1 + m11 - m22 - m33); q = [0.25 * s, (m12 + m21) / s, (m13 + m31) / s, (m32 - m23) / s]; }
  else if (m22 > m33) { const s = 2 * Math.sqrt(1 + m22 - m11 - m33); q = [(m12 + m21) / s, 0.25 * s, (m23 + m32) / s, (m13 - m31) / s]; }
  else { const s = 2 * Math.sqrt(1 + m33 - m11 - m22); q = [(m13 + m31) / s, (m23 + m32) / s, 0.25 * s, (m21 - m12) / s]; }
  return { q: qnorm(q), t: [m[12], m[13], m[14]] };
}
function matInvertAffine(m) {      // inverse of a rotation-scale-translation matrix (bind poses are rigid here)
  const { q, t } = matDecompose(m);
  const qi = qinv(q); const ti = qrot(qi, t).map((v) => -v);
  return { q: qi, t: ti };
}

// ---- the supplied file: its node tree and its clips ----
function source(name) {
  const file = readFileSync(new URL(`../../assets/characters/figures/animated/${name === 'man' ? 'muscular_male' : 'woman'}.glb`, import.meta.url));
  const parsed = parseGLB(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
  const { json } = parsed;
  const nodes = json.nodes.map((n, i) => ({ i, name: n.name, t: n.translation || [0, 0, 0], q: n.rotation || [0, 0, 0, 1], children: n.children || [], parent: -1 }));
  nodes.forEach((n) => n.children.forEach((c) => { nodes[c].parent = n.i; }));
  const byName = new Map(nodes.map((n) => [n.name, n]));
  const order = []; const visit = (i) => { order.push(i); nodes[i].children.forEach(visit); };
  json.scenes[json.scene || 0].nodes.forEach(visit);
  // world rotation and position of every node, given local rotations (and the pelvis's position)
  function world(localQ, localT) {
    const W = [];
    for (const i of order) {
      const n = nodes[i]; const q = localQ[i] || n.q; const t = localT[i] || n.t;
      if (n.parent < 0) W[i] = { q, t };
      else { const p = W[n.parent]; W[i] = { q: qnorm(qmul(p.q, q)), t: vadd(p.t, qrot(p.q, t)) }; }
    }
    return W;
  }
  const rest = world([], []);
  function sample(clip, time) {
    const localQ = [], localT = [];
    for (const tr of clip.tracks) {
      const n = byName.get(tr.node); if (!n) continue;
      const times = tr.times; let k = 0; while (k < times.length - 1 && times[k + 1] <= time) k += 1;
      const k2 = Math.min(times.length - 1, k + 1); const f = tr.step || k2 === k ? 0 : Math.max(0, Math.min(1, (time - times[k]) / (times[k2] - times[k])));
      if (tr.path === 'rotation') localQ[n.i] = slerp(Array.from(tr.values.slice(k * 4, k * 4 + 4)), Array.from(tr.values.slice(k2 * 4, k2 * 4 + 4)), f);
      if (tr.path === 'translation') { const a = tr.values.slice(k * 3, k * 3 + 3), b = tr.values.slice(k2 * 3, k2 * 3 + 3); localT[n.i] = [0, 1, 2].map((j) => a[j] + (b[j] - a[j]) * f); }
    }
    return world(localQ, localT);
  }
  return { parsed, nodes, byName, rest, sample };
}

// ---- the game's skeleton, at its bind pose ----
const bones = kitBones();
const kitIndex = new Map(bones.map((b, i) => [b.name, i]));
const bind = bones.map((b) => matInvertAffine(b.ibm));            // world rotation and position of each bone, bound
const files = { woman: source('woman'), man: source('man') };

// sides: the game's _L is whichever side the supplied _l stands on
function sideMap(src) {
  const gl = bind[kitIndex.get('Thigh_L')].t[0], sl = src.rest[src.byName.get('thigh_l').i].t[0];
  return Math.sign(gl) === Math.sign(sl) ? { L: 'l', R: 'r' } : { L: 'r', R: 'l' };
}
function pairs(src) {
  const side = sideMap(src);
  const out = [];
  for (const b of bones) {
    const m = b.name.match(/^([A-Za-z]+?)(?:_(L|R))?$/);
    const base = m[1], s = m[2];
    if (!MAP[base]) continue;
    const joint = s ? `${MAP[base]}_${side[s]}` : MAP[base];
    if (!src.byName.has(joint)) continue;
    const child = CHILD[base] ? (s ? `${CHILD[base]}_${s}` : CHILD[base]) : null;
    out.push({ bone: b.name, bi: kitIndex.get(b.name), joint, ji: src.byName.get(joint).i, child, base, s });
  }
  // bringing the two rests into line, bone by bone
  for (const p of out) {
    const c = p.child && out.find((o) => o.bone === p.child);
    if (!c) continue;
    const dt = vsub(bind[c.bi].t, bind[p.bi].t), ds = vsub(src.rest[c.ji].t, src.rest[p.ji].t);
    p.align = qbetween(dt, ds);
  }
  for (const p of out) if (!p.align) { const parent = out.find((o) => o.bi === bones[p.bi].parent); p.align = parent && parent.align ? parent.align : [0, 0, 0, 1]; }
  return out;
}

const hipsRest = bind[kitIndex.get('Hips')].t[1];
const out = {};
let floats = 0;
for (const [word, which, clipName] of CLIPS) {
  const src = files[which];
  const clip = src.parsed.animations.find((a) => a.name === clipName);
  if (!clip) throw new Error(`${which} has no ${clipName}`);
  const map = pairs(src);
  const srcHips = src.rest[src.byName.get('pelvis').i].t[1];
  const frames = Math.max(2, Math.round(clip.length * FPS) + 1);
  const rot = map.map(() => []);
  const rise = [];
  for (let f = 0; f < frames; f += 1) {
    const W = src.sample(clip, Math.min(clip.length, f / FPS));
    // each game bone's world rotation: the supplied joint's turn from its rest, applied to the game bone brought into line
    const want = new Map();
    for (const p of map) {
      const delta = qmul(W[p.ji].q, qinv(src.rest[p.ji].q));
      want.set(p.bi, qnorm(qmul(delta, qmul(p.align, bind[p.bi].q))));
    }
    // to local rotations, parent by parent (an unmapped parent keeps its bind rotation)
    const worldOf = (bi) => (want.has(bi) ? want.get(bi) : bind[bi].q);
    map.forEach((p, k) => {
      const parent = bones[p.bi].parent;
      const local = parent < 0 ? worldOf(p.bi) : qnorm(qmul(qinv(worldOf(parent)), worldOf(p.bi)));
      rot[k].push(...local.map((v) => Math.round(v * 32767)));
    });
    // the hips rise and fall, scaled to this body; they never go across the ground
    const dy = W[src.byName.get('pelvis').i].t[1] - srcHips;
    rise.push(Math.round((dy * (hipsRest / srcHips)) * 1000));
  }
  floats += rot.reduce((a, r) => a + r.length, 0);
  out[word] = { from: `${which === 'man' ? 'muscular_male' : 'woman'}.glb ${clipName}`, length: +clip.length.toFixed(3), frames, bones: map.map((p) => p.bone), rot: rot.map((r) => Buffer.from(Int16Array.from(r).buffer).toString('base64')), rise };
}
writeFileSync(new URL('../../src/client/reaction-data.js', import.meta.url),
  `// Generated by tools/characters/retarget.mjs from the supplied figures' own animations, carried onto the game skeleton. Do not edit by hand.\nexport const REACTION_FPS = ${FPS};\nexport const REACTIONS = ${JSON.stringify(out)};\n`);
console.log(`${Object.keys(out).length} reactions, ${floats} values`);
