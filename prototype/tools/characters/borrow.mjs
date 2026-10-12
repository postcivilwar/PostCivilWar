// Writes src/client/figure-borrowed.js: the few movements a supplied figure's own file does not have, taken from
// another supplied figure's file and carried over to this figure's skeleton, plus each new figure's sitting pose.
//
// Why: the police officer's file has no walk and no run, the priest's no run, and the priest, the hooded warrior
// and the athlete have no standing-still animation; the officer, the priest and the warrior have no swim. Rather than slide a figure along the ground in a pose, the
// figure walks with the man's walk, runs with the warrior's run, stands with the officer's idle: each played on
// its own body. Nothing in any GLB is changed; this file holds only rotations, sampled from the source.
//
// How: both files are posed by the source animation at each moment; each bone's turn away from how it was bound
// to its mesh (in the world) is given to the same bone of the other figure, away from how that one was bound.
// The bones are matched by name: the supplied files come in two namings (Unreal's pelvis/thigh_l, Mixamo's
// mixamorig:Hips/LeftUpLeg), and NAMES pairs them. Only rotations are carried: each figure keeps its own bone
// lengths, so a tall figure does not take a short one's legs. The fingers are left out (they are held still).
//
//   node tools/characters/borrow.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseGLB, boneName } from '../../src/client/glb.js';

const THREE = createRequire(import.meta.url)('../../vendor/three.min.js');
const dir = new URL('../../assets/characters/figures/animated/', import.meta.url);

// Unreal names to Mixamo names (the body only; the fingers are not carried)
export const NAMES = {
  pelvis: 'Hips', spine_01: 'Spine', spine_02: 'Spine1', spine_03: 'Spine2', neck_01: 'Neck', head: 'Head',
  clavicle_l: 'LeftShoulder', upperarm_l: 'LeftArm', lowerarm_l: 'LeftForeArm', hand_l: 'LeftHand',
  clavicle_r: 'RightShoulder', upperarm_r: 'RightArm', lowerarm_r: 'RightForeArm', hand_r: 'RightHand',
  thigh_l: 'LeftUpLeg', calf_l: 'LeftLeg', foot_l: 'LeftFoot', ball_l: 'LeftToeBase',
  thigh_r: 'RightUpLeg', calf_r: 'RightLeg', foot_r: 'RightFoot', ball_r: 'RightToeBase',
};
const BODY = Object.keys(NAMES);

// what is borrowed: for figure `to`, clip `as` is `clip` from `from`, sampled `fps` times a second
const JOBS = [
  { to: 'police.glb', as: 'walk', from: 'muscular_male.glb', clip: 'walk.001', fps: 30 },
  { to: 'police.glb', as: 'run', from: 'muscular_male.glb', clip: 'run.001', fps: 30 },
  { to: 'priest.glb', as: 'run', from: 'warrior.glb', clip: 'run.001', fps: 30 },
  { to: 'priest.glb', as: 'idle', from: 'police.glb', clip: 'idle.001', fps: 10 },
  { to: 'warrior.glb', as: 'idle', from: 'police.glb', clip: 'idle.001', fps: 10 },
  { to: 'athlete.glb', as: 'idle', from: 'police.glb', clip: 'idle.001', fps: 10 },
  { to: 'police.glb', as: 'swim', from: 'muscular_male.glb', clip: 'swim.001', fps: 15 },
  { to: 'priest.glb', as: 'swim', from: 'muscular_male.glb', clip: 'swim.001', fps: 15 },
  { to: 'warrior.glb', as: 'swim', from: 'muscular_male.glb', clip: 'swim.001', fps: 15 },
];
// the sitting pose (the woman's sit.001 at 1 s, as src/client/seat-pose.js has it for the first two)
const SEATS = ['athlete.glb', 'police.glb', 'priest.glb', 'warrior.glb'];

const files = new Map();
function load(name) {
  if (files.has(name)) return files.get(name);
  const b = readFileSync(new URL(name, dir));
  const parsed = parseGLB(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  const { json, accessor } = parsed;
  const skin = json.skins[0];
  const mixamo = json.nodes.some((n) => /^mixamorig:/.test(n.name || ''));
  // the node tree, as three.js objects, in the file's own rest
  // (named as three.js binds them: Mixamo's "mixamorig:Hips" is "mixamorigHips" to an animation; see glb.js)
  const objects = json.nodes.map((n) => {
    const o = new THREE.Object3D(); o.name = boneName(n.name || '');
    if (n.translation) o.position.fromArray(n.translation);
    if (n.rotation) o.quaternion.fromArray(n.rotation);
    if (n.scale) o.scale.fromArray(n.scale);
    return o;
  });
  json.nodes.forEach((n, i) => { for (const c of n.children || []) objects[i].add(objects[c]); });
  const root = new THREE.Object3D();
  for (const r of json.scenes[json.scene || 0].nodes) root.add(objects[r]);
  root.updateMatrixWorld(true);
  const byName = new Map(objects.map((o) => [o.name, o]));
  // how each bone was bound to the mesh, as a turn in the model's space
  const inverse = accessor(skin.inverseBindMatrices).array;
  const bind = new Map();
  skin.joints.forEach((j, k) => {
    const m = new THREE.Matrix4().fromArray(inverse, k * 16).invert();
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    m.decompose(p, q, s);
    bind.set(objects[j].name, q);
  });
  const clips = parsed.animations.map((a) => new THREE.AnimationClip(a.name, a.length, a.tracks.filter((t) => t.path === 'rotation').map((t) => new THREE.QuaternionKeyframeTrack(`${boneName(t.node)}.quaternion`, t.times, t.values, t.step ? THREE.InterpolateDiscrete : undefined))));
  const rest = new Map(objects.map((o) => [o, o.quaternion.clone()]));
  const file = { name, root, byName, bind, clips, mixamo, rest, json };
  // a body bone by its Unreal name, in whichever naming the file has
  file.bone = (ue) => byName.get(mixamo ? boneName(`mixamorig:${NAMES[ue]}`) : ue);
  // the knuckle of the middle finger: where a hand points
  file.knuckle = (side) => byName.get(mixamo ? boneName(`mixamorig:${side === 'l' ? 'Left' : 'Right'}HandMiddle1`) : `middle_01_${side}`);
  files.set(name, file);
  return file;
}
const reset = (f) => { for (const [o, q] of f.rest) o.quaternion.copy(q); f.root.updateMatrixWorld(true); };

// Each bone's child, the way it points: the next joint along the body.
const NEXT = {
  pelvis: 'spine_01', spine_01: 'spine_02', spine_02: 'spine_03', spine_03: 'neck_01', neck_01: 'head',
  clavicle_l: 'upperarm_l', upperarm_l: 'lowerarm_l', lowerarm_l: 'hand_l', hand_l: 'knuckle_l',
  clavicle_r: 'upperarm_r', upperarm_r: 'lowerarm_r', lowerarm_r: 'hand_r', hand_r: 'knuckle_r',
  thigh_l: 'calf_l', calf_l: 'foot_l', foot_l: 'ball_l', thigh_r: 'calf_r', calf_r: 'foot_r', foot_r: 'ball_r',
};
// The target's bones, posed like the source's. Between files rigged the same way (bound in the same pose) each
// bone turns from its bind as the source's does from its own. Between the two riggings (one bound with its arms
// down, the other with them out level) that would leave the arms where the bind put them: there each limb and
// the spine is pointed the way the source's points (the hips, which point nowhere, still turn as the source's do).
function carry(src, dst) {
  src.root.updateMatrixWorld(true);
  const out = {};
  const w = new THREE.Quaternion(), parent = new THREE.Quaternion(), turn = new THREE.Quaternion();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e = new THREE.Vector3();
  const same = src.mixamo === dst.mixamo;
  const child = (f, ue) => (NEXT[ue] && NEXT[ue].startsWith('knuckle') ? f.knuckle(NEXT[ue].slice(-1)) : NEXT[ue] ? f.bone(NEXT[ue]) : null);
  // parents before children: the order of the Unreal list is down the body from the hips
  for (const ue of BODY) {
    const s = src.bone(ue), d = dst.bone(ue);
    if (!s || !d) continue;
    const sNext = child(src, ue), dNext = child(dst, ue);
    if (!same && sNext && dNext && ue !== 'pelvis') {
      s.getWorldPosition(a); sNext.getWorldPosition(b);
      const want = b.sub(a).normalize();
      d.updateMatrixWorld(true);
      d.getWorldPosition(c); dNext.getWorldPosition(e);
      const now = e.sub(c).normalize();
      turn.setFromUnitVectors(now, want);
      d.getWorldQuaternion(w); w.premultiply(turn);
    } else {
      s.getWorldQuaternion(w);
      // the source's turn from its bind, in the model's space, given to the target's bind
      const delta = w.clone().multiply(src.bind.get(s.name).clone().invert());
      w.copy(delta.multiply(dst.bind.get(d.name)));
    }
    d.parent.getWorldQuaternion(parent);
    d.quaternion.copy(parent.invert().multiply(w));
    d.updateMatrixWorld(true);
    out[d.name] = d.quaternion.toArray();
  }
  return out;
}

// sampled into whole numbers: a rotation's four parts each to one part in 32767
const pack = (frames, names) => {
  const a = new Int16Array(frames.length * names.length * 4);
  let k = 0;
  for (const f of frames) for (const n of names) for (const v of f[n]) a[k++] = Math.round(Math.max(-1, Math.min(1, v)) * 32767);
  return Buffer.from(a.buffer).toString('base64');
};

const borrowed = {};
for (const job of JOBS) {
  const src = load(job.from), dst = load(job.to);
  const clip = src.clips.find((c) => c.name === job.clip);
  if (!clip) throw new Error(`${job.from} has no ${job.clip}`);
  reset(src); reset(dst);
  const mixer = new THREE.AnimationMixer(src.root);
  const action = mixer.clipAction(clip); action.play();
  const n = Math.max(2, Math.round(clip.duration * job.fps) + 1);
  const frames = [];
  for (let i = 0; i < n; i += 1) {
    mixer.setTime((clip.duration * i) / (n - 1));
    reset(dst);
    frames.push(carry(src, dst));
  }
  mixer.stopAllAction();
  const names = Object.keys(frames[0]);
  (borrowed[job.to] ||= {})[job.as] = { from: `${job.from}#${job.clip}`, duration: +clip.duration.toFixed(4), frames: n, bones: names, data: pack(frames, names) };
  console.log(`${job.to} ${job.as}: ${job.from} ${job.clip}, ${n} frames, ${names.length} bones`);
}

// the seat: the woman's own sit, as the first two figures are seated, on each new figure's bones
const woman = load('woman.glb');
const sit = woman.clips.find((c) => c.name === 'sit.001');
const seats = {};
for (const name of SEATS) {
  const dst = load(name);
  reset(woman); reset(dst);
  const mixer = new THREE.AnimationMixer(woman.root); mixer.clipAction(sit).play(); mixer.setTime(1.0);
  const pose = carry(woman, dst);
  // the root of an Unreal file stays as it is bound; the legs and body are what sit
  seats[name] = Object.fromEntries(Object.entries(pose).map(([k, q]) => [k, q.map((v) => +v.toFixed(5))]));
  mixer.stopAllAction();
}

writeFileSync(new URL('../../src/client/figure-borrowed.js', import.meta.url),
  `// Generated by tools/characters/borrow.mjs. Do not edit by hand.\n` +
  `// Movements a figure's own file lacks, carried over from another supplied figure (rotations only, sampled; each\n` +
  `// rotation's parts in whole numbers out of 32767, base64), and each new figure's sitting pose, by file.\n` +
  `export const BORROWED = ${JSON.stringify(borrowed)};\n` +
  `export const SEATS = ${JSON.stringify(seats)};\n`);
console.log(`written: ${Object.keys(borrowed).length} figures borrow, ${Object.keys(seats).length} seats`);
