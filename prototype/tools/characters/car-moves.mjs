// Reads the owner's Mixamo movements for cars (5 November 2026: "Entering Car, Exiting Car, Driving, Sitting Idle,
// Sitting Talking ... Use it. I also supplied pull from car seat animation, also use it to redesign the current pull
// from car seat") and writes the game's own copy of them: assets/characters/animations/car-moves.json.
//
//   node tools/characters/car-moves.mjs
//
// His files (assets/characters/animations/mixamo/*.fbx: Mixamo's Y Bot skeleton without its skin, 30 frames a second)
// are read as they are and never changed. Each movement is kept as motion any figure can be given, as the falls are
// (tools/characters/falls.mjs, falls.js): for each frame, how the hips are turned from how they stand bound (four
// numbers) and which way every other bone of the body points, to the next joint along it (three), in the model's space,
// each number to one part in 32767; and where the hips are (x, y, z in tenths of a millimetre, the model's space: x the
// figure's left, y up, z ahead as it starts). The fingers are left out: each figure holds its own as its file has them.
// The game carries them onto each figure's own bones the first time it needs one (car-moves.js): each keeps its own bone
// lengths.

import { readFileSync, writeFileSync } from 'node:fs';
import { FBXLoader } from './fbx/loaders/FBXLoader.js';
import * as THREE from '../../vendor/three-r186/three.module.js';

const DIR = new URL('../../assets/characters/animations/', import.meta.url);
// each movement: the game's name for it, the owner's file, and how many frames a second are kept (the seated ones move
// slowly: 15)
export const CAR_MOVES = {
  enter: { file: 'Entering_Car.fbx', fps: 30 },
  exit: { file: 'Exiting_Car.fbx', fps: 30 },
  drive: { file: 'Driving.fbx', fps: 15 },
  sit: { file: 'Sitting_Idle.fbx', fps: 15 },
  talk: { file: 'Sitting_Talking.fbx', fps: 15 },
  pulled: { file: 'Pulled_From_Seat.fbx', fps: 30 },
};

// Unreal names to Mixamo names, the body only, and each bone's next joint (as falls.mjs has them: importing that, or
// borrow.mjs, would run it)
const NAMES = {
  pelvis: 'Hips', spine_01: 'Spine', spine_02: 'Spine1', spine_03: 'Spine2', neck_01: 'Neck', head: 'Head',
  clavicle_l: 'LeftShoulder', upperarm_l: 'LeftArm', lowerarm_l: 'LeftForeArm', hand_l: 'LeftHand',
  clavicle_r: 'RightShoulder', upperarm_r: 'RightArm', lowerarm_r: 'RightForeArm', hand_r: 'RightHand',
  thigh_l: 'LeftUpLeg', calf_l: 'LeftLeg', foot_l: 'LeftFoot', ball_l: 'LeftToeBase',
  thigh_r: 'RightUpLeg', calf_r: 'RightLeg', foot_r: 'RightFoot', ball_r: 'RightToeBase',
};
const BODY = Object.keys(NAMES);
const NEXT = {
  pelvis: 'spine_01', spine_01: 'spine_02', spine_02: 'spine_03', spine_03: 'neck_01', neck_01: 'head',
  clavicle_l: 'upperarm_l', upperarm_l: 'lowerarm_l', lowerarm_l: 'hand_l', hand_l: 'LeftHandMiddle1',
  clavicle_r: 'upperarm_r', upperarm_r: 'lowerarm_r', lowerarm_r: 'hand_r', hand_r: 'RightHandMiddle1',
  thigh_l: 'calf_l', calf_l: 'foot_l', foot_l: 'ball_l', thigh_r: 'calf_r', calf_r: 'foot_r', foot_r: 'ball_r',
};
const bone = (root, n) => root.getObjectByName(`mixamorig${NAMES[n] || n}`);

const read = (file) => {
  const b = readFileSync(new URL(`mixamo/${file}`, DIR));
  return new FBXLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '');
};
// the pose now, as motion: the hips' turn from their bind and every other bone's direction to its next joint
function capture(root, bindHips) {
  root.updateMatrixWorld(true);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), w = new THREE.Quaternion(), out = [];
  for (const n of BODY) {
    const s = bone(root, n);
    if (n === 'pelvis') { s.getWorldQuaternion(w); out.push(...w.multiply(bindHips.clone().invert()).toArray()); continue; }
    // (the head and the toes point nowhere further: none, as falls.mjs has it)
    if (!NEXT[n]) { out.push(0, 0, 0); continue; }
    const next = bone(root, NEXT[n]);
    s.getWorldPosition(a); next.getWorldPosition(b);
    const v = b.sub(a).normalize();
    out.push(v.x, v.y, v.z);
  }
  return out;
}

const moves = {};
for (const [as, job] of Object.entries(CAR_MOVES)) {
  const root = read(job.file);
  const clip = root.animations[0];
  for (const n of BODY) if (!bone(root, n) || (NEXT[n] && !bone(root, NEXT[n]))) throw new Error(`${job.file}: no ${NAMES[n]} or what comes after it`);
  root.updateMatrixWorld(true);
  const bindHips = bone(root, 'pelvis').getWorldQuaternion(new THREE.Quaternion());
  const mixer = new THREE.AnimationMixer(root);
  // (once, held at its end: played round again, its last frame would be its first)
  const action = mixer.clipAction(clip); action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play();
  const frames = Math.max(2, Math.round(clip.duration * job.fps) + 1);
  const motion = [], hips = new Int32Array(frames * 3);
  for (let f = 0; f < frames; f += 1) {
    mixer.setTime(Math.min(clip.duration, f / job.fps));
    motion.push(capture(root, bindHips));
    // (the hips' place in the model's space, the files' centimetres as tenths of a millimetre)
    bone(root, 'pelvis').getWorldPosition(new THREE.Vector3()).toArray().forEach((v, k) => { hips[f * 3 + k] = Math.round(v * 100); });
  }
  const a = new Int16Array(frames * motion[0].length); let k = 0;
  for (const m of motion) for (const v of m) a[k++] = Math.round(Math.max(-1, Math.min(1, v)) * 32767);
  moves[as] = { from: job.file, fps: job.fps, duration: +clip.duration.toFixed(4), frames, data: Buffer.from(a.buffer).toString('base64'), hips: Buffer.from(hips.buffer).toString('base64') };
  const at = (f) => [0, 1, 2].map((c) => (hips[f * 3 + c] / 10000).toFixed(2)).join(', ');
  console.log(`${as}: ${job.file}, ${clip.duration.toFixed(2)} s, ${frames} frames at ${job.fps}; the hips from (${at(0)}) to (${at(frames - 1)}) m`);
}
const out = { made: 'tools/characters/car-moves.mjs', bones: BODY, moves };
writeFileSync(new URL('car-moves.json', DIR), JSON.stringify(out));
console.log(`written: assets/characters/animations/car-moves.json, ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
