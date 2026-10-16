// Talking face to face: the hands, the head and the body of someone in a conversation, over whatever else the
// figure is doing (standing, breathing, its idle). Used in PostCivilWar PowerBike for the salesman and for whoever
// is asking him about a motorcycle (main.js): the one speaking explains with their hands, the one listening nods
// and keeps still, and each looks at the other.
//
// Two kinds of figure: one of the game's own (character.js), moved through its handles, which become its bones when
// it is drawn; and a supplied figure with its own skeleton (animated.js), whose bones are turned after its own
// animation has set them this frame. Either way nothing in a file is changed, and walking off ends it at once (the
// caller stops asking for it).
//
//   talkGesture(rig, { t, amount, speaking, look })
//     t         seconds, running (the gestures are worked out from it, so they never repeat exactly)
//     amount    0..1: how much of the conversation shows (faded in and out by the caller)
//     speaking  0..1: how much of that is speaking (the rest is listening)
//     look      radians: where the other person is, from straight ahead (left positive), for the head and the chest

import { reach } from './animated.js';

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const tmp = { q: new THREE.Quaternion(), w: new THREE.Quaternion(), p: new THREE.Quaternion(), axis: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3() };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const mix = (a, b, k) => a + (b - a) * k;
// a slow, uneven wave in -1..1: three sines at unrelated rates, so that a gesture never comes round the same way
const drift = (t, seed) => (Math.sin(t * 1.13 + seed) * 0.5 + Math.sin(t * 0.71 + seed * 2.3) * 0.32 + Math.sin(t * 2.37 + seed * 0.7) * 0.18);
// beats of speech: a hand comes up on each, about every second and a half, and settles between
const beat = (t, seed) => { const u = (t * 0.68 + seed) % 1; return u < 0.35 ? Math.sin((u / 0.35) * Math.PI * 0.5) : Math.cos(((u - 0.35) / 0.65) * Math.PI * 0.5) ** 2; };

// Turns a bone of a supplied figure about an axis in the figure's own frame (x its left, y up, z ahead).
function bend(rig, name, axis, angle) {
  const b = rig.bones && rig.bones.get(name);
  if (!b || !angle) return;
  rig.body.updateMatrixWorld(true);
  tmp.axis.copy(axis).transformDirection(rig.body.matrixWorld);
  tmp.q.setFromAxisAngle(tmp.axis, angle);
  b.getWorldQuaternion(tmp.w); tmp.w.premultiply(tmp.q);
  b.parent.getWorldQuaternion(tmp.p);
  b.quaternion.copy(tmp.p.invert().multiply(tmp.w));
  b.updateMatrixWorld(true);
}

export function talkGesture(rig, { t, amount = 1, speaking = 0, look = 0 }) {
  const k = clamp(amount, 0, 1);
  if (k < 0.01 || !rig) return;
  const s = clamp(speaking, 0, 1), l = 1 - s;
  const head = clamp(look, -0.75, 0.75);
  if (rig.animated) {
    if (!rig.bones || !rig.mixer) return;
    // the chest and the head toward the other person; a nod now and then when listening, a tilt when speaking
    bend(rig, 'spine_03', Y, head * 0.35 * k);
    bend(rig, 'neck_01', Y, head * 0.25 * k);
    bend(rig, 'head', Y, head * 0.3 * k);
    const nod = l * Math.max(0, Math.sin(t * 2.2)) ** 6 * 0.16 + s * drift(t, 4.1) * 0.05;
    bend(rig, 'head', X, (nod + 0.03) * k);
    bend(rig, 'head', Z, (s * drift(t * 0.8, 1.7) * 0.07 + l * 0.04) * k);
    bend(rig, 'spine_02', X, (0.04 + s * 0.03 * Math.sin(t * 1.6)) * k);
    // the hands: speaking, they come up in front of the chest and open and turn with what is said, the right
    // more than the left; listening, they rest together low in front
    const H = (rig.spec && rig.spec.height) || 1.7;
    const holder = rig.body;
    holder.updateMatrixWorld(true);
    for (const side of ['r', 'l']) {
      const sign = side === 'r' ? -1 : 1;                   // the figure's left is +x in its own frame
      const lead = side === 'r' ? 1 : 0.62;
      const up = beat(t, side === 'r' ? 0.1 : 0.55) * lead;
      const sway = drift(t, side === 'r' ? 0.3 : 2.9);
      const speak = new THREE.Vector3(sign * (0.17 + 0.07 * sway) * H, (0.56 + 0.1 * up) * H, (0.2 + 0.1 * up) * H);
      // (listening, the hands are never quite still: the fingers of one move a little against the other)
      const fidget = drift(t * 0.45, side === 'r' ? 5.1 : 1.9);
      const rest = new THREE.Vector3(sign * (0.06 + 0.012 * fidget) * H, (0.47 + 0.01 * fidget) * H, (0.14 + 0.008 * fidget) * H);
      const want = rest.lerp(speak, s);
      const before = ['upperarm', 'lowerarm', 'hand'].map((n) => { const b = rig.bones.get(`${n}_${side}`); return b ? b.quaternion.clone() : null; });
      const target = holder.localToWorld(want);
      const pole = holder.localToWorld(tmp.a.set(sign * 0.9, -0.6, -0.6)).sub(holder.localToWorld(tmp.b.set(0, 0, 0)));
      reach(rig.bones.get(`upperarm_${side}`), rig.bones.get(`lowerarm_${side}`), rig.bones.get(`hand_${side}`), target, pole);
      // blended from where the figure's own animation had the arm, by how much of the conversation shows
      ['upperarm', 'lowerarm', 'hand'].forEach((n, i) => { const b = rig.bones.get(`${n}_${side}`); if (b && before[i]) { const done = b.quaternion.clone(); b.quaternion.copy(before[i]).slerp(done, k); b.updateMatrixWorld(true); } });
      // the open hand turns a little with each beat
      bend(rig, `hand_${side}`, Z, sign * (0.25 * s * up + 0.1) * k);
    }
    return;
  }
  // one of the game's own figures: its handles (character.js applies them when it is drawn)
  const hd = rig.head.group.rotation, torso = rig.torso.rotation;
  hd.y = mix(hd.y, head * 0.55 + s * drift(t, 4.1) * 0.08, k);
  hd.x = mix(hd.x, l * (Math.max(0, Math.sin(t * 2.2)) ** 6 * 0.18) + s * drift(t * 1.3, 2.2) * 0.06 + 0.02, k);
  hd.z = mix(hd.z, s * drift(t * 0.8, 1.7) * 0.06 + l * 0.05, k);
  torso.y = mix(torso.y, head * 0.25 + s * Math.sin(t * 0.9) * 0.04, k);
  // leaning in a little to say something, upright to listen
  torso.x = mix(torso.x, 0.03 + s * 0.04 * (0.6 + 0.4 * Math.sin(t * 1.3)), k);
  for (const [arm, side] of [[rig.armR, 'r'], [rig.armL, 'l']]) {
    const lead = side === 'r' ? 1 : 0.6;
    const up = beat(t, side === 'r' ? 0.1 : 0.55) * lead;
    const sway = drift(t, side === 'r' ? 0.3 : 2.9);
    const fidget = drift(t * 0.45, side === 'r' ? 5.1 : 1.9) * 0.05;
    // speaking: the upper arm forward and a little out, the forearm up; listening: the hands together low in front
    arm.shoulder.rotation.x = mix(arm.shoulder.rotation.x, mix(-0.32 + fidget, -0.62 - 0.32 * up, s), k);
    arm.shoulder.rotation.z = mix(arm.shoulder.rotation.z, mix(-0.12, 0.08 + 0.12 * sway, s), k);
    arm.elbow.rotation.x = mix(arm.elbow.rotation.x, mix(-0.95 - fidget, -1.15 - 0.45 * up, s), k);
  }
}
