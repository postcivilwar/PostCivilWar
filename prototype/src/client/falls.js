// Falling, lying and getting up (19 October 2026, the owner's brief and his video: "the character gets thrown off
// and falls, and the recovery animation looks unnatural and robotic").
//
// Until now a figure knocked off its feet played its file's own fall if it had one (fewer than half do), lay there,
// and was then crossfaded from lying to standing in half a second: it rose off the ground like a plank swinging up.
// A figure with no fall of its own was tipped over stiff, and tipped back. Now every supplied figure falls, lies and
// gets up the same way, with motion taken from the supplied figures' own files (tools/characters/falls.mjs) and
// carried onto its own bones as it is loaded:
//
//   1. the blow: the figure is caught as it was (walking, standing, on a motorcycle) and taken into the fall within a
//      fifth of a second; pushed from the side it is turned with the blow;
//   2. the fall, the way it was pushed: forward (a stumble, down onto a knee, onto its front), or back (a stagger with
//      the arms out, onto its back); a rider thrown over the handlebars goes through the air, the body level and the
//      arms out ahead, and lands on the front where the town put them;
//   3. on the ground: let down until its lowest part rests on the ground (never through it), and still;
//   4. getting up, by how it lies: on its front it brings its hands under its shoulders and pushes up, brings a knee
//      forward under itself, rises onto that foot and stands; on its back it bends its knees, sits up on its hands,
//      turns onto a knee and stands; whatever is on the ground stays where it is put while it bears weight (the body
//      moves over it, it does not slide); then it settles into standing.
//
// Every stage is worked out from how long ago the fall began and what kind of fall it was, so that the figure of a
// player on another device falls and gets up in step with what that player sees (link.js carries when and how).
// Control comes back when the town says the player is up (impact.js, own-bikes.js), and that is when the getting up
// here has ended.

import { FALL_MOVES } from './fall-moves.js';

const BODY = FALL_MOVES.bones;
export const FALL_BONES = BODY;
const NEXT = {
  pelvis: 'spine_01', spine_01: 'spine_02', spine_02: 'spine_03', spine_03: 'neck_01', neck_01: 'head',
  clavicle_l: 'upperarm_l', upperarm_l: 'lowerarm_l', lowerarm_l: 'hand_l', hand_l: 'middle_01_l',
  clavicle_r: 'upperarm_r', upperarm_r: 'lowerarm_r', lowerarm_r: 'hand_r', hand_r: 'middle_01_r',
  thigh_l: 'calf_l', calf_l: 'foot_l', foot_l: 'ball_l', thigh_r: 'calf_r', calf_r: 'foot_r', foot_r: 'ball_r',
};
const FRAME = 4 + (BODY.length - 1) * 3;
// the bones that can rest on the ground
const RESTS = ['head', 'neck_01', 'spine_03', 'spine_02', 'spine_01', 'pelvis', 'hand_l', 'hand_r', 'lowerarm_l', 'lowerarm_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r', 'ball_l', 'ball_r'];

let unpacked = null;
function moves() {
  if (unpacked) return unpacked;
  const read = (b64) => { const raw = atob(b64); const bytes = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i); const ints = new Int16Array(bytes.buffer); const out = new Float32Array(ints.length); for (let i = 0; i < ints.length; i += 1) out[i] = ints[i] / 32767; return out; };
  const clips = {}, poses = {};
  for (const [name, c] of Object.entries(FALL_MOVES.clips)) { const all = read(c.data); clips[name] = { duration: c.duration, frames: Array.from({ length: c.frames }, (_, i) => all.subarray(i * FRAME, (i + 1) * FRAME)) }; }
  for (const [name, p] of Object.entries(FALL_MOVES.poses)) poses[name] = read(p.data);
  unpacked = { clips, poses };
  return unpacked;
}

const smooth = (t) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };
const angleGap = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

// The timings, in seconds (what the town allows is in impact.js and own-bikes.js: `lie` and `rise`)
export const FALL = Object.freeze({
  blow: 0.18,                     // caught as it was and taken into the fall
  settle: 0.35,                   // from where the fall ended to lying still
  // the getting up: each step's share of the time the town allows for it
  front: Object.freeze([['prone', 0], ['prone', 0.08], ['pushup', 0.3], ['halfKneel', 0.57], ['stand', 0.82], ['idle', 1]]),
  back: Object.freeze([['supine', 0], ['supine', 0.08], ['situp', 0.32], ['halfKneel', 0.6], ['stand', 0.84], ['idle', 1]]),
});
// How long the fall itself takes, before it lies still: through the air for a thrown rider (flightTimes), otherwise its
// fall played a little quicker than the file's (quicker still after a hard blow), always leaving it a moment on the
// ground before it starts to get up.
export function fallTime(down, how = fallKind(down)) {
  if (how.fall === 'thrown') { const f = flightTimes(down); return f.up + f.down; }
  const len = how.fall === 'back' ? FALL_MOVES.clips.fallBack.duration : FALL_MOVES.clips.fallFwd.duration;
  return Math.max(0.5, Math.min(Math.max(down.lie, 0.6) - FALL.settle - 0.25, len / (down.hard ? 1.45 : 1.2)));
}
// A rider thrown over the handlebars goes from the motorcycle to where the town put them on the ground (`from`, `to`),
// the lowest of the body (at first the feet, on the pegs, PEGS high; soon the body itself, laid level) on a curve:
//   - in the open, or down beside the bike: a body under gravity, carried along the ground at a steady pace, rising a
//     little over the straight line down (more the further they go: `peak`) and coming down onto the ground;
//   - over something low in the way (a roadblock's boards, a fence: `over`, the metres along the way it lies from the
//     bike, contact.js): pitched up over the bars, high enough to pass over its top (OVER_TOP: the boards are 1.25 m
//     high, closures.js) by the time its far side is reached, and from there falling under gravity to the ground
//     beyond, going on at the pace it went over at.
const GRAVITY = 9.8;
export const PEGS = 0.32;
const OVER_TOP = 1.32;
const flightDist = (down) => (down.from && down.to ? Math.hypot(down.to.x - down.from.x, down.to.z - down.from.z) : 1);
const overOf = (down) => (down.over && Number.isFinite(down.over.b) && down.over.b > 0 && down.over.b < flightDist(down) - 0.3 ? down.over : null);
export function flightTimes(down) {
  const dist = flightDist(down), over = overOf(down);
  if (!over) { const peak = 0.2 + 0.07 * dist; return { up: 0, down: Math.max(0.35, Math.min(1.15, Math.sqrt((8 * peak) / GRAVITY))), peak }; }
  // the fall from over its top, and the pitch up over it, taken at the pace it goes on at
  const fall = Math.sqrt((2 * OVER_TOP) / GRAVITY);
  const up = Math.max(0.22, Math.min(0.45, (2 * over.b * fall) / Math.max(0.3, dist - over.b)));
  return { up, down: fall, peak: OVER_TOP };
}
// Where a thrown rider is, `age` seconds after the blow: { x, y, z } (y the height of the lowest of the body: the fall
// driver lays the body on it), and whether they have come down.
export function flightAt(down, age, ground) {
  const f = down.from, to = down.to;
  const dist = flightDist(down), over = overOf(down);
  const t = flightTimes(down);
  let s, y;
  if (!over) {
    const k = Math.max(0, Math.min(1, age / t.down));
    s = k; y = PEGS * (1 - k) + t.peak * 4 * k * (1 - k);
  } else if (age < t.up) {
    // up and over the bars: rising fast and slowing at the top, going on slowly at first and then quicker
    const k = age / t.up, s1 = over.b / dist;
    s = s1 * k * k; y = PEGS + (OVER_TOP - PEGS) * (1 - (1 - k) ** 3);
  } else {
    const k = Math.min(1, (age - t.up) / t.down), s1 = over.b / dist;
    s = s1 + (1 - s1) * k; y = OVER_TOP * (1 - k * k);
  }
  return { x: f.x + (to.x - f.x) * s, y: ground + y, z: f.z + (to.z - f.z) * s, done: age >= t.up + t.down };
}
// How it falls, from how it was pushed: `push` the way the blow sent the body, `facing` the way the figure faced.
// A rider thrown from a motorcycle goes over the handlebars.
export function fallKind({ kind, push, facing }) {
  if (kind === 'crash') return { fall: 'thrown', turn: 0, lands: 'front' };
  const rel = angleGap(push, facing);
  if (Math.abs(rel) <= 0.9) return { fall: 'fwd', turn: rel * 0.5, lands: 'front' };
  if (Math.abs(rel) >= Math.PI - 0.9) return { fall: 'back', turn: angleGap(rel, Math.PI) * 0.5, lands: 'back' };
  // from the side: turned with the blow, and down the way it was turned
  return { fall: 'fwd', turn: rel, lands: 'front' };
}

// The stored motion, carried onto a figure's own bones (as borrow.mjs carries a walk), once, as it is loaded and
// before it has moved: `bones` its bones by the Unreal names (animated.js maps a Mixamo figure's to them), `bind`
// each one's turn as bound to its mesh, `root` the model's own root. Gives every clip and pose as the figure's own
// local turns, four numbers a bone in the order of BODY (none for a bone it has not got).
export function carryFalls({ root, bones, bind }) {
  const { clips, poses } = moves();
  const rest = new Map(BODY.map((n) => { const b = bones.get(n); return [n, b ? b.quaternion.clone() : null]; }));
  const rootQ = new THREE.Quaternion(), w = new THREE.Quaternion(), pq = new THREE.Quaternion(), turn = new THREE.Quaternion();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), want = new THREE.Vector3(), inv = new THREE.Matrix4();
  const one = (frame) => {
    for (const n of BODY) { const bone = bones.get(n); if (bone) bone.quaternion.copy(rest.get(n)); }
    root.updateMatrixWorld(true);
    inv.copy(root.matrixWorld).invert();
    root.getWorldQuaternion(rootQ); const rootInv = rootQ.clone().invert();
    const out = new Float32Array(BODY.length * 4);
    BODY.forEach((n, k) => {
      const d = bones.get(n);
      if (!d) return;
      const at = k === 0 ? 0 : 4 + (k - 1) * 3;
      if (k === 0) {
        const q = new THREE.Quaternion(frame[0], frame[1], frame[2], frame[3]).normalize();
        w.copy(q).multiply(bind.get(n) || new THREE.Quaternion());
      } else {
        const next = bones.get(NEXT[n]);
        want.set(frame[at], frame[at + 1], frame[at + 2]);
        d.getWorldQuaternion(w); w.premultiply(rootInv);
        if (next && want.lengthSq() > 0.25) {
          a.setFromMatrixPosition(d.matrixWorld).applyMatrix4(inv); b.setFromMatrixPosition(next.matrixWorld).applyMatrix4(inv);
          const now = b.sub(a).normalize();
          turn.setFromUnitVectors(now, want.normalize());
          w.premultiply(turn);
        }
      }
      d.parent.getWorldQuaternion(pq); pq.premultiply(rootInv);
      d.quaternion.copy(pq.invert().multiply(w));
      d.updateMatrixWorld(true);
      d.quaternion.toArray(out, k * 4);
    });
    return out;
  };
  const carried = { clips: {}, poses: {} };
  for (const [name, c] of Object.entries(clips)) carried.clips[name] = { duration: c.duration, frames: c.frames.map(one) };
  for (const [name, p] of Object.entries(poses)) carried.poses[name] = one(p);
  for (const n of BODY) { const bone = bones.get(n); if (bone) bone.quaternion.copy(rest.get(n)); }
  root.updateMatrixWorld(true);
  return carried;
}

// A figure's fall and getting up. `rig` is an animated figure (animated.js): its bones by name, its `holder` (the
// figure's own frame: x its left, y up, z ahead), `lift` (moved and turned here, under the holder), `root`.
export function createFallDriver({ rig, holder, lift, carried, standPose, height }) {
  const bones = BODY.map((n) => rig.bones.get(n) || null);
  const buf = new Float32Array(BODY.length * 4), from = new Float32Array(BODY.length * 4), caught = new Float32Array(BODY.length * 4);
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const poses = { ...carried.poses, stand: standPose, idle: standPose };
  // the sit-up, made from lying on the back: the body raised from the hips, the knees drawn up, the hands behind
  poses.situp = sitUp(rig, holder, carried.poses.supine, height);
  const state = { on: false, kind: null, age: 0, anchor: null, restedAt: null, riseFrom: null };

  const write = (q) => { bones.forEach((b, k) => { if (b && (q[k * 4] || q[k * 4 + 1] || q[k * 4 + 2] || q[k * 4 + 3])) b.quaternion.fromArray(q, k * 4); }); };
  const read = (out) => { bones.forEach((b, k) => { if (b) b.quaternion.toArray(out, k * 4); }); return out; };
  const mix = (p, q, e, out) => {
    for (let k = 0; k < BODY.length; k += 1) {
      const i = k * 4;
      if (!bones[k]) continue;
      const pz = !(p[i] || p[i + 1] || p[i + 2] || p[i + 3]), qz = !(q[i] || q[i + 1] || q[i + 2] || q[i + 3]);
      if (pz && qz) continue;
      if (pz) { out.set(q.subarray(i, i + 4), i); continue; }
      if (qz) { out.set(p.subarray(i, i + 4), i); continue; }
      qa.fromArray(p, i); qb.fromArray(q, i); qa.slerp(qb, e); qa.toArray(out, i);
    }
    return out;
  };
  const clipAt = (name, t, out) => {
    const c = carried.clips[name];
    const f = Math.max(0, Math.min(c.frames.length - 1.0001, (t / c.duration) * (c.frames.length - 1)));
    const i = Math.floor(f);
    return mix(c.frames[i], c.frames[i + 1], f - i, out);
  };
  // the lowest of what can rest on the ground, in the holder's frame (above the figure's own feet)
  const lowest = () => {
    holder.updateMatrixWorld(true);
    let low = Infinity, at = null;
    for (const n of RESTS) { const b = rig.bones.get(n); if (!b) continue; holder.worldToLocal(b.getWorldPosition(v)); if (v.y < low) { low = v.y; at = { n, x: v.x, z: v.z }; } }
    return { low, at };
  };

  // One frame. `down` (or null when the figure is on its feet):
  //   age   seconds since the blow       lie   seconds from the blow to when it starts to get up
  //   rise  seconds the getting up takes  kind  'crash' (thrown from a motorcycle), 'knock' (struck), 'dead'
  //   push  the way the blow sent it      facing the way the figure faced
  //   flight { from: {x, y, z}, to: {x, z}, ground } for a rider thrown through the air, in the group's own space
  // Returns true while it has the figure (the caller then leaves its bones and its height alone).
  function drive(dt, down) {
    if (!down) { if (state.on) end(); return false; }
    // a fall begun afresh (or the first sight of one): its age has gone back
    if (!state.on || down.age < state.age - 0.5 || down.kind !== state.kind) begin(down);
    state.age = down.age;
    const { fall, turn, lands } = state.how;
    const age = down.age;
    const lie = Math.max(down.lie, 0.6);
    const rise = Math.max(0.8, down.rise);
    let phase;
    // the length of the fall itself: within the time on the ground, leaving it a moment still
    const clipName = fall === 'back' ? 'fallBack' : fall === 'fwd' ? 'fallFwd' : 'dive';
    const clipLen = carried.clips[clipName].duration;
    const falling = fallTime(down, state.how);
    if (age < falling) {
      phase = 'fall';
      if (fall === 'thrown') {
        // through the air: from as it was, to level with the arms out ahead, and down onto the front
        const u = age / falling;
        clipAt('dive', Math.min(1, u * 1.6) * clipLen, buf);
        if (age < FALL.blow) mix(state.caught, buf, smooth(age / FALL.blow), buf);
        if (u > 0.72) mix(buf, poses.prone, smooth((u - 0.72) / 0.28), buf);
      } else {
        // (a hard blow skips the first of the stumble: down at once)
        const start = down.hard ? clipLen * 0.3 : 0;
        clipAt(clipName, start + (age / falling) * (clipLen - start), buf);
        if (age < FALL.blow) mix(state.caught, buf, smooth(age / FALL.blow), buf);
      }
      write(buf);
      lift.rotation.y = turn * smooth(age / (FALL.blow * 1.5));
    } else if (age < Math.min(lie + 0.4, Math.max(lie, state.restedAt === null ? Infinity : state.restedAt + 0.15))) {
      // (it starts to get up only once it is lying on the ground: at the latest a moment after the town's time for it,
      // so that it is never left there)
      phase = 'lie';
      // the end of the fall settles into lying still
      if (!state.fallEnd) state.fallEnd = read(new Float32Array(BODY.length * 4));
      mix(state.fallEnd, poses[lands === 'back' ? 'supine' : 'prone'], smooth((age - falling) / FALL.settle), buf);
      write(buf);
      lift.rotation.y = turn;
    } else if (age < lie + rise && down.kind !== 'dead') {
      phase = 'rise';
      if (state.riseFrom === null) state.riseFrom = Math.max(lie, Math.min(age, lie + 0.4));
      const steps = lands === 'back' ? FALL.back : FALL.front;
      const s = Math.min(1, (age - state.riseFrom) / Math.max(0.5, lie + rise - state.riseFrom));
      let i = 0; while (i < steps.length - 2 && s >= steps[i + 1][1]) i += 1;
      const [p0, t0] = steps[i], [p1, t1] = steps[i + 1];
      mix(poses[p0], poses[p1], smooth((s - t0) / Math.max(1e-3, t1 - t0)), buf);
      write(buf);
      // turned with the blow, it comes round to face the way it faces again as it stands
      lift.rotation.y = turn * (1 - smooth((s - 0.55) / 0.4));
    } else {
      phase = down.kind === 'dead' ? 'lie' : 'up';
      if (down.kind === 'dead') write(poses[lands === 'back' ? 'supine' : 'prone']);
      else { write(poses.idle); lift.rotation.y = 0; }
    }
    // let down onto the ground, or raised off it, so that its lowest part rests on it (never through it): quickly
    // down, a little more gently up
    const { low, at } = lowest();
    const want = 0.035 - (low - lift.position.y);
    lift.position.y += (want - lift.position.y) * Math.min(1, dt * (want < lift.position.y ? 22 : 10));
    // (lying on the ground, and settled there: from now it may get up)
    if (phase === 'lie' && state.restedAt === null && Math.abs(want - lift.position.y) < 0.03 && age >= falling + FALL.settle * 0.5) state.restedAt = age;
    // what bears weight stays where it is put: while the same part rests on the ground, the body moves over it
    if (phase === 'rise' || phase === 'lie') {
      if (at && low - lift.position.y < 0.07) {
        if (state.anchor && state.anchor.n === at.n) {
          const dx = state.anchor.x - at.x, dz = state.anchor.z - at.z;
          const most = 0.05;
          lift.position.x += Math.max(-most, Math.min(most, dx)); lift.position.z += Math.max(-most, Math.min(most, dz));
        }
        holder.updateMatrixWorld(true);
        const b = rig.bones.get(at.n); holder.worldToLocal(b.getWorldPosition(v));
        state.anchor = { n: at.n, x: v.x, z: v.z };
      }
      // and comes back over its own place as it stands, a step's worth
      if (phase === 'rise') { const s = (down.age - state.riseFrom) / Math.max(0.5, lie + rise - state.riseFrom); if (s > 0.8) { const k = Math.min(1, dt * 4); lift.position.x -= lift.position.x * k; lift.position.z -= lift.position.z * k; } }
    } else if (phase === 'up') { const k = Math.min(1, dt * 6); lift.position.x -= lift.position.x * k; lift.position.z -= lift.position.z * k; }
    else state.anchor = null;
    state.phase = phase;
    return true;
  }
  function begin(down) {
    state.on = true; state.kind = down.kind; state.anchor = null; state.fallEnd = null; state.restedAt = null; state.riseFrom = null;
    state.how = fallKind(down);
    // as it was when struck (or, seen first already down, as it lies)
    state.caught = read(caught);
    if (down.age > FALL.blow) state.caught = poses[state.how.lands === 'back' ? 'supine' : 'prone'];
  }
  function end() { state.on = false; state.kind = null; state.age = 0; state.anchor = null; lift.position.set(0, 0, 0); lift.rotation.y = 0; }
  return { drive, get phase() { return state.on ? state.phase : null; }, get how() { return state.on ? state.how : null; }, end, pose: (name) => { write(poses[name]); }, poses: () => Object.keys(poses) };
}

// The sit-up, made once for a figure from lying on its back: the body brought up from the hips toward sitting, the
// thighs kept where they lay and the knees drawn up so the feet are flat on the ground in front, the hands behind the
// hips bearing weight. Worked on the figure's own bones and then put back.
function sitUp(rig, holder, supine, height) {
  const bones = BODY.map((n) => rig.bones.get(n) || null);
  const keep = new Float32Array(BODY.length * 4);
  bones.forEach((b, k) => { if (b) b.quaternion.toArray(keep, k * 4); });
  bones.forEach((b, k) => { if (b && (supine[k * 4] || supine[k * 4 + 3])) b.quaternion.fromArray(supine, k * 4); });
  holder.updateMatrixWorld(true);
  const S = height / 1.75;
  const tq = new THREE.Quaternion(), w = new THREE.Quaternion(), p = new THREE.Quaternion(), hq = new THREE.Quaternion();
  const turnWorld = (bone, axis, angle) => {
    if (!bone) return;
    holder.getWorldQuaternion(hq);
    const ax = axis.clone().applyQuaternion(hq);
    tq.setFromAxisAngle(ax, angle);
    bone.getWorldQuaternion(w); w.premultiply(tq);
    bone.parent.getWorldQuaternion(p);
    bone.quaternion.copy(p.invert().multiply(w));
    bone.updateMatrixWorld(true);
  };
  const thighs = ['thigh_l', 'thigh_r'].map((n) => rig.bones.get(n));
  const before = thighs.map((t) => (t ? t.getWorldQuaternion(new THREE.Quaternion()) : null));
  const pelvis = rig.bones.get('pelvis'), head = rig.bones.get('head');
  const inHolder = (b) => holder.worldToLocal(b.getWorldPosition(new THREE.Vector3()));
  const hips = inHolder(pelvis);
  // the way it lies: along the ground from the hips to the head (L), and so the way it will face sitting up (F, toward
  // its feet) and its left (Y x F)
  const L = inHolder(head).sub(hips); L.y = 0; if (L.lengthSq() < 1e-6) L.set(0, 0, -1); L.normalize();
  const Y = new THREE.Vector3(0, 1, 0), F = L.clone().negate(), left = Y.clone().cross(F).normalize();
  // the body comes up from the hips, about the axis that lifts the head (L x Y), and the spine curls a little forward
  const up = L.clone().cross(Y).normalize();
  turnWorld(pelvis, up, 1.05);
  for (const n of ['spine_01', 'spine_02', 'spine_03']) turnWorld(rig.bones.get(n), up, 0.1);
  turnWorld(rig.bones.get('neck_01'), up, 0.12);
  // the thighs kept where they lay, then the knees drawn up, the feet flat in front of the hips
  thighs.forEach((t, i) => { if (!t || !before[i]) return; t.parent.getWorldQuaternion(p); t.quaternion.copy(p.invert().multiply(before[i])); t.updateMatrixWorld(true); });
  const at = (base, f, l, y) => holder.localToWorld(base.clone().addScaledVector(F, f * S).addScaledVector(left, l * S).addScaledVector(Y, y * S));
  const dirOf = (f, l, y) => { const o = holder.localToWorld(new THREE.Vector3()); return holder.localToWorld(new THREE.Vector3().addScaledVector(F, f).addScaledVector(left, l).addScaledVector(Y, y)).sub(o); };
  for (const [side, sl] of [['l', 1], ['r', -1]]) {
    const thigh = rig.bones.get(`thigh_${side}`), calf = rig.bones.get(`calf_${side}`), foot = rig.bones.get(`foot_${side}`);
    if (!thigh || !calf || !foot) continue;
    legTo(thigh, calf, foot, at(hips, 0.44, sl * 0.15, -0.02), dirOf(0.45, sl * 0.15, 1));
  }
  // the hands behind, flat on the ground, the arms nearly straight
  for (const [side, sl] of [['l', 1], ['r', -1]]) {
    const upper = rig.bones.get(`upperarm_${side}`), lower = rig.bones.get(`lowerarm_${side}`), hand = rig.bones.get(`hand_${side}`);
    if (!upper || !lower || !hand) continue;
    legTo(upper, lower, hand, at(hips, -0.28, sl * 0.3, -0.06), dirOf(-0.6, sl * 1, -0.2));
  }
  const out = new Float32Array(BODY.length * 4);
  bones.forEach((b, k) => { if (b) b.quaternion.toArray(out, k * 4); });
  bones.forEach((b, k) => { if (b) b.quaternion.fromArray(keep, k * 4); });
  holder.updateMatrixWorld(true);
  return out;
}

// Two bones reaching a point (an arm for a hand, a leg for a foot), bending toward `pole`: as animated.js `reach`.
function legTo(upper, lower, end, target, pole) {
  const S = upper.getWorldPosition(new THREE.Vector3()), E = lower.getWorldPosition(new THREE.Vector3()), H = end.getWorldPosition(new THREE.Vector3());
  const l1 = S.distanceTo(E), l2 = E.distanceTo(H);
  const toT = target.clone().sub(S); const d = Math.min(Math.max(toT.length(), Math.abs(l1 - l2) + 1e-3), (l1 + l2) * 0.999);
  const dir = toT.normalize();
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const side = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
  const elbow = S.clone().add(dir.clone().multiplyScalar(a)).add(side.multiplyScalar(h));
  pointAt(upper, lower, elbow);
  pointAt(lower, end, S.clone().add(dir.multiplyScalar(d)));
}
function pointAt(bone, child, to) {
  const a = bone.getWorldPosition(new THREE.Vector3()), b = child.getWorldPosition(new THREE.Vector3());
  const cur = b.sub(a).normalize(), want = to.clone().sub(a).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(cur, want);
  const w = bone.getWorldQuaternion(new THREE.Quaternion()), p = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(p.invert().multiply(q.multiply(w)));
  bone.updateMatrixWorld(true);
}
