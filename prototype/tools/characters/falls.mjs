// Writes src/client/fall-moves.js: the movements and poses a figure falls and gets up with, in a form any supplied
// figure can be given at run time (falls.js carries them onto its own bones as it is loaded), whichever way its file
// names its bones and however long they are.
//
// Why (19 October 2026, the owner's brief: a fall that looks like a person losing their balance and hitting the
// ground, and a natural getting up, not a figure snapping between poses): only some of the supplied figures have a
// fall of their own, none has a getting up, and every figure must fall and get up. Rather than store each movement
// once for every figure (as borrow.mjs does for a walk), each is stored once, as the motion itself: for every frame,
// how the hips are turned from how they were bound, and which way every other bone of the body points (to the next
// joint along it). That is what borrow.mjs carries from one figure to another; carried at run time it costs a few
// kilobytes rather than a megabyte.
//
// What is taken (each from the supplied figure whose file has it, as it is in the file):
//   fallBack    the woman's fall: hit, a stagger back with the arms out, down on her back
//   fallFwd     the man in the paper mask's defeat: a stumble forward, down onto a knee, and forward onto his front
//   dive        the zombie survivor's dive: launched forward, the body level, the arms reaching ahead (a rider thrown
//               over the handlebars)
//   prone, supine, pushup, halfKneel, crouch: single poses on the way back up (lying on the front, on the back, the
//               arms straight under the shoulders, one knee down and the other foot forward, squatting)
//
//   node tools/characters/falls.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseGLB, boneName } from '../../src/client/glb.js';

const THREE = createRequire(import.meta.url)('../../vendor/three.min.js');
const dir = new URL('../../assets/characters/figures/animated/', import.meta.url);

// Unreal names to Mixamo names (the body only; the fingers are not carried): as borrow.mjs
export const NAMES = {
  pelvis: 'Hips', spine_01: 'Spine', spine_02: 'Spine1', spine_03: 'Spine2', neck_01: 'Neck', head: 'Head',
  clavicle_l: 'LeftShoulder', upperarm_l: 'LeftArm', lowerarm_l: 'LeftForeArm', hand_l: 'LeftHand',
  clavicle_r: 'RightShoulder', upperarm_r: 'RightArm', lowerarm_r: 'RightForeArm', hand_r: 'RightHand',
  thigh_l: 'LeftUpLeg', calf_l: 'LeftLeg', foot_l: 'LeftFoot', ball_l: 'LeftToeBase',
  thigh_r: 'RightUpLeg', calf_r: 'RightLeg', foot_r: 'RightFoot', ball_r: 'RightToeBase',
};
const BODY = Object.keys(NAMES);
const NEXT = {
  pelvis: 'spine_01', spine_01: 'spine_02', spine_02: 'spine_03', spine_03: 'neck_01', neck_01: 'head',
  clavicle_l: 'upperarm_l', upperarm_l: 'lowerarm_l', lowerarm_l: 'hand_l', hand_l: 'knuckle_l',
  clavicle_r: 'upperarm_r', upperarm_r: 'lowerarm_r', lowerarm_r: 'hand_r', hand_r: 'knuckle_r',
  thigh_l: 'calf_l', calf_l: 'foot_l', foot_l: 'ball_l', thigh_r: 'calf_r', calf_r: 'foot_r', foot_r: 'ball_r',
};

const files = new Map();
function load(name) {
  if (files.has(name)) return files.get(name);
  const b = readFileSync(new URL(name, dir));
  const parsed = parseGLB(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  const { json, accessor } = parsed;
  const skin = json.skins[0];
  const mixamo = json.nodes.some((n) => /^mixamorig:/.test(n.name || ''));
  const objects = json.nodes.map((n) => {
    const o = new THREE.Object3D(); o.name = boneName(n.name || '');
    if (n.matrix) new THREE.Matrix4().fromArray(n.matrix).decompose(o.position, o.quaternion, o.scale);
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
  const inverse = accessor(skin.inverseBindMatrices).array;
  const bind = new Map();
  skin.joints.forEach((j, k) => { const m = new THREE.Matrix4().fromArray(inverse, k * 16).invert(); const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); m.decompose(p, q, s); bind.set(objects[j].name, q); });
  // (rotations only, as borrow.mjs: each figure keeps its own bone lengths and its own height)
  const clips = parsed.animations.map((a) => new THREE.AnimationClip(a.name, a.length, a.tracks.filter((t) => t.path === 'rotation').map((t) => new THREE.QuaternionKeyframeTrack(`${boneName(t.node)}.quaternion`, t.times, t.values, t.step ? THREE.InterpolateDiscrete : undefined))));
  const rest = new Map(objects.map((o) => [o, o.quaternion.clone()]));
  const file = { name, root, byName, bind, clips, mixamo, rest };
  file.bone = (ue) => byName.get(mixamo ? boneName(`mixamorig:${NAMES[ue]}`) : ue);
  file.knuckle = (side) => byName.get(mixamo ? boneName(`mixamorig:${side === 'l' ? 'Left' : 'Right'}HandMiddle1`) : `middle_01_${side}`);
  files.set(name, file);
  return file;
}
const reset = (f) => { for (const [o, q] of f.rest) o.quaternion.copy(q); f.root.updateMatrixWorld(true); };

// The source's pose now, as motion: the hips' turn from their bind (a quaternion, in the model's space) and every other
// bone's direction to the next joint (a unit vector, in the model's space).
function capture(src) {
  src.root.updateMatrixWorld(true);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), w = new THREE.Quaternion();
  const child = (ue) => (NEXT[ue] && NEXT[ue].startsWith('knuckle') ? src.knuckle(NEXT[ue].slice(-1)) : NEXT[ue] ? src.bone(NEXT[ue]) : null);
  const out = [];
  for (const ue of BODY) {
    const s = src.bone(ue);
    if (ue === 'pelvis') { s.getWorldQuaternion(w); const d = w.clone().multiply(src.bind.get(s.name).clone().invert()); out.push(...d.toArray()); continue; }
    const n = child(ue);
    if (!s || !n) { out.push(0, 0, 0); continue; }
    s.getWorldPosition(a); n.getWorldPosition(b);
    const v = b.sub(a).normalize();
    out.push(v.x, v.y, v.z);
  }
  return out;
}

const SOURCES = {
  fallBack: { file: 'woman.glb', clip: 'fall.001', from: 0.55, to: 3.02, fps: 20 },
  fallFwd: { file: 'hobo_character.glb', clip: 'defeat_03.001', from: 1.7, to: 3.9, fps: 20 },
  dive: { file: 'zombie_survivor.glb', clip: 'dive.001', from: 0.95, to: 1.32, fps: 20 },
};
const POSES = {
  prone: { file: 'hobo_character.glb', clip: 'defeat_03.001', at: 5.5 },
  supine: { file: 'woman.glb', clip: 'fall.001', at: 3.02 },
  pushup: { file: 'athlete.glb', clip: 'press-up.001', at: 1.0 },
  halfKneel: { file: 'hobo_character.glb', clip: 'defeat_03.001', at: 2.45 },
  crouch: { file: 'woman.glb', clip: 'jump_down.001', at: 2.5 },
};
const sampled = (job, times) => {
  const src = load(job.file);
  const clip = src.clips.find((c) => c.name === job.clip);
  if (!clip) throw new Error(`${job.file} has no ${job.clip}`);
  reset(src);
  const mixer = new THREE.AnimationMixer(src.root);
  mixer.clipAction(clip).play();
  const frames = times.map((t) => { mixer.setTime(Math.min(t, clip.duration - 0.001)); return capture(src); });
  mixer.stopAllAction();
  return frames;
};
// each number to one part in 32767 (the quaternion's four and each direction's three all lie within -1..1)
const pack = (frames) => { const a = new Int16Array(frames.length * frames[0].length); let k = 0; for (const f of frames) for (const v of f) a[k++] = Math.round(Math.max(-1, Math.min(1, v)) * 32767); return Buffer.from(a.buffer).toString('base64'); };

const out = { bones: BODY, clips: {}, poses: {} };
for (const [name, job] of Object.entries(SOURCES)) {
  const n = Math.max(2, Math.round((job.to - job.from) * job.fps) + 1);
  const times = Array.from({ length: n }, (_, i) => job.from + ((job.to - job.from) * i) / (n - 1));
  out.clips[name] = { from: `${job.file}#${job.clip}`, duration: +(job.to - job.from).toFixed(3), frames: n, data: pack(sampled(job, times)) };
  console.log(`${name}: ${job.file} ${job.clip} ${job.from}-${job.to} s, ${n} frames`);
}
for (const [name, job] of Object.entries(POSES)) {
  out.poses[name] = { from: `${job.file}#${job.clip}@${job.at}`, data: pack(sampled({ ...job }, [job.at])) };
  console.log(`${name}: ${job.file} ${job.clip} at ${job.at} s`);
}
const text = JSON.stringify(out);
writeFileSync(new URL('../../src/client/fall-moves.js', import.meta.url),
  '// Generated by tools/characters/falls.mjs. Do not edit by hand.\n' +
  '// The movements and poses every figure falls and gets up with, as motion any figure can be given (falls.js): for\n' +
  '// each frame, the hips\' turn from their bind (four numbers) and each other body bone\'s direction to the next joint\n' +
  '// (three), in the order of `bones`, each number to one part in 32767, base64.\n' +
  `export const FALL_MOVES = ${text};\n`);
console.log(`written: ${(text.length / 1024).toFixed(1)} KB`);
