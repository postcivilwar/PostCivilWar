// How a figure holds a gun (25 October 2026, the owner's brief: "Animate the hands and arms holding the weapon ... Use
// existing character animations wherever suitable. Blend new animations with existing rigs rather than replacing the
// character models or breaking walking, running, jumping, falling, or other actions").
//
// None of the figures' files has a rifle held at the shoulder (the police officer's and three others' "shoot" kneels
// and holds nothing), so the hold is made here, on each figure's own bones, after its own animation has been played
// each frame, the way the phone is put in its hand (phone-hold.js): its legs keep walking, standing or running as its
// file has them, and the gun's hold is laid over the top.
//
//   aim     the gun at the shoulder, its butt in the pocket of the right shoulder, its barrel pointing at what the aim
//           is on; the body turned a little to the right (bladed, the left shoulder forward, as a rifle is held), the
//           chest bent with the aim up or down, the head turned to look along it
//   sight   the same, its sight's line along the aim: the eye behind the sight (the camera is put there: camera.js), the
//           head left undrawn for the player's own figure, whose eye that is
//   carry   at a run: lowered across the body, the barrel down and ahead
//   crouch  the hips let down and the knees bent, the feet where the figure's own walk or stand puts them (each leg
//           reaches its own foot), so that one crouched can stand or move
//   reload  the magazine pulled out by the other hand and dropped, a fresh one from the belt pushed in, the handle
//           pulled; the gun tipped to the hand meanwhile
//   recoil  each round fired: the gun driven back into the shoulder and its muzzle up, springing back
// Moving sideways or back with the gun up, the hips and legs turn toward the way the figure is going while the chest
// stays on the aim (walking backwards, the walk is played backwards: animated.js, `walkBack`).
//
// The hands hold the gun by its own places, measured from the owner's file (gun-model.js): the right hand round the
// pistol grip, the forefinger at the trigger; the left under the handguard ahead of the magazine. Each hand is put
// there by the same reaching that puts them on a steering wheel (animated.js `reach`), turned by its own frame (the
// knuckles and the palm, read from the figure's bones: phone-hold.js `gripOf`), its fingers closed round what it holds.

import { reach } from './animated.js';
import { gripOf } from './phone-hold.js';

const smooth = (t) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };
const ease = (cur, want, dt, seconds) => cur + (want - cur) * (1 - Math.exp(-dt / Math.max(1e-3, seconds)));
const angleGap = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

// How long each change takes (seconds, to most of the way)
export const HOLD_TIME = Object.freeze({ draw: 0.16, away: 0.12, sight: 0.08, carry: 0.12, crouch: 0.12, hips: 0.12 });
// how far a figure 1.8 m tall lets its hips down crouched, and how far it leans its body into the gun
const CROUCH_DROP = 0.4;
// the turn of the body to the right of the aim, standing and walking (radians): bladed, as a rifle is held
const BLADE = Object.freeze({ still: 0.42, moving: 0.28 });
// the share of the aim's angle up or down taken by the chest (the gun and the arms take the rest)
const CHEST_PITCH = 0.55;
// the fingers closed round the grip and the handguard: each joint's angle from the line of the hand toward the palm
const RIGHT_CURL = Object.freeze({ index: [0.22, 0.95, 1.1], middle: [0.55, 1.55, 1.45], ring: [0.62, 1.6, 1.45], pinky: [0.68, 1.6, 1.4] });
const LEFT_CURL = Object.freeze({ index: [0.35, 1.2, 1.2], middle: [0.42, 1.35, 1.35], ring: [0.48, 1.4, 1.35], pinky: [0.52, 1.4, 1.3] });
// a reload, by the share of its time: when the magazine comes out, is dropped, is in the hand again, goes in, and the
// handle is pulled (the controller sounds them: gun-play.js)
export const RELOAD_STEPS = Object.freeze({ grab: 0.12, out: 0.3, pouch: 0.5, back: 0.68, home: 0.8, handle: 0.9 });
// the recoil of one round: how far back (m) and up (radians), and how quickly it springs back (per second)
const KICK = Object.freeze({ back: 0.022, up: 0.045, spring: 26 });

const V = () => new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// Some figures' files tie a few points of what they wear at the hip (a holster, a pouch) to the hand or the forearm
// beside them, as the figure stands with its arms down: harmless while the arms hang, but with the hands up on a gun
// those points go with them and a flap is pulled out of the hip (the police officer's file, 25 October 2026). Such a
// point (held by the arm, well off the arm's own bones, nearer the body's, and below the chest) is given to the body's
// bone nearest it instead, in the page's own copy of the figure (its file is not changed). Once for each figure's model.
const mended = new WeakSet();
export function mendArmSkin(rig) {
  const mesh = rig && rig.mesh;
  if (!mesh || !mesh.isSkinnedMesh || mended.has(mesh.geometry)) return 0;
  mended.add(mesh.geometry);
  const sk = mesh.skeleton, si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight, pos = mesh.geometry.attributes.position;
  if (!sk || !si || !sw || !pos) return 0;
  const index = (name) => sk.bones.indexOf(rig.bones.get(name));
  const bind = sk.boneInverses.map((m) => new THREE.Vector3().setFromMatrixPosition(m.clone().invert()));
  const at = (name) => { const i = index(name); return i >= 0 ? bind[i] : null; };
  const arm = new Set();
  for (const s of ['l', 'r']) { const top = rig.bones.get(`upperarm_${s}`); if (top) top.traverse((b) => { const i = sk.bones.indexOf(b); if (i >= 0) arm.add(i); }); }
  const segs = (pairs) => pairs.map(([a, b]) => [index(a), at(a), at(b)]).filter(([i, a, b]) => i >= 0 && a && b);
  const ARM = segs([['upperarm_l', 'lowerarm_l'], ['lowerarm_l', 'hand_l'], ['hand_l', 'middle_01_l'], ['upperarm_r', 'lowerarm_r'], ['lowerarm_r', 'hand_r'], ['hand_r', 'middle_01_r']]);
  const BODY = segs([['pelvis', 'spine_01'], ['spine_01', 'spine_02'], ['spine_02', 'spine_03'], ['thigh_l', 'calf_l'], ['thigh_r', 'calf_r'], ['calf_l', 'foot_l'], ['calf_r', 'foot_r']]);
  const pelvis = at('pelvis'), shoulder = at('upperarm_r'), head = at('head'), foot = at('foot_l');
  if (!ARM.length || !BODY.length || !pelvis || !shoulder || !head || !foot) return 0;
  const unit = Math.max(0.1, head.y - foot.y);
  const below = pelvis.y + (shoulder.y - pelvis.y) * 0.45;
  const v = new THREE.Vector3(), ab = new THREE.Vector3(), c = new THREE.Vector3();
  const dSeg = (p, a, b) => { ab.copy(b).sub(a); const t2 = Math.max(0, Math.min(1, c.copy(p).sub(a).dot(ab) / Math.max(1e-9, ab.lengthSq()))); return p.distanceTo(c.copy(a).addScaledVector(ab, t2)); };
  let moved = 0;
  for (let i = 0; i < pos.count; i += 1) {
    let wArm = 0;
    for (let k = 0; k < 4; k += 1) if (arm.has(si.getComponent(i, k))) wArm += sw.getComponent(i, k);
    if (wArm < 0.15) continue;
    v.fromBufferAttribute(pos, i);
    if (v.y > below) continue;
    let da = Infinity; for (const [, a, b] of ARM) da = Math.min(da, dSeg(v, a, b));
    let db = Infinity, bone = -1; for (const [j, a, b] of BODY) { const d = dSeg(v, a, b); if (d < db) { db = d; bone = j; } }
    if (da < 0.055 * unit || db > da * 0.8 || bone < 0) continue;
    // the arm's share to the body's nearest bone, in the slot the arm had the most of
    let slot = -1, most = -1;
    for (let k = 0; k < 4; k += 1) if (arm.has(si.getComponent(i, k))) { const w2 = sw.getComponent(i, k); if (w2 > most) { most = w2; slot = k; } }
    for (let k = 0; k < 4; k += 1) if (arm.has(si.getComponent(i, k)) && k !== slot) sw.setComponent(i, k, 0);
    // (the body's bone may already be in another slot: then its share grows there, and the arm's slot is emptied)
    let have = -1; for (let k = 0; k < 4; k += 1) if (si.getComponent(i, k) === bone && sw.getComponent(i, k) > 0) have = k;
    if (have >= 0) { sw.setComponent(i, have, sw.getComponent(i, have) + wArm); sw.setComponent(i, slot, 0); } else { si.setComponent(i, slot, bone); sw.setComponent(i, slot, wArm); }
    moved += 1;
  }
  if (moved) { si.needsUpdate = true; sw.needsUpdate = true; }
  return moved;
}

// One figure's hold on its gun. `pose(rig, gun, want, dt)` each frame, after the figure's own animation; it gives back
// where the eye behind the sight is, where the muzzle is and which way the barrel points, as they are drawn this frame.
//   want: { up (the gun out), mode: 'aim' | 'sight' | 'carry', at (what the barrel points at), dir (the aim's way),
//           crouch, moving: { x, z } (how fast and which way the figure goes over the ground), reload (0..1, or null),
//           kicks (rounds fired this frame), hideHead (the eye is the camera's) }
export function createGunHold() {
  const st = {
    w: 0, sight: 0, carry: 0, crouch: 0, hips: 0, kick: 0, kickV: 0, side: 0, sideV: 0,
    shoulder: null, posed: new Map(), headHidden: null, lastReload: null, dropped: [], hand: { r: null, l: null },
  };
  const t = { a: V(), b: V(), c: V(), d: V(), e: V(), f: V(), g: V(), h: V(), s: V(), m: V(), p: V(), x: V(), y: V(), z: V(), fw: V(), rt: V(), lf: V(), pole: V(), tmp: V(), tmp2: V(), eye: V(), muzzle: V(), dir: V() };
  const q = { a: new THREE.Quaternion(), b: new THREE.Quaternion(), w: new THREE.Quaternion(), p: new THREE.Quaternion(), g: new THREE.Quaternion(), aim: new THREE.Quaternion(), sight: new THREE.Quaternion(), carry: new THREE.Quaternion() };
  const m = new THREE.Matrix4();
  const out = { eye: t.eye, muzzle: t.muzzle, dir: t.dir, shown: false, events: [] };

  // a bone this file turns keeps a note of how the animation had it (as phone-hold.js does): bones the animation does
  // not move every frame (the fingers, in most files) are put back as they were when the gun goes away
  function baseOf(bone) {
    let note = st.posed.get(bone);
    if (!note) { note = { base: bone.quaternion.clone(), set: new THREE.Quaternion(NaN, 0, 0, 1) }; st.posed.set(bone, note); }
    else if (!bone.quaternion.equals(note.set)) note.base.copy(bone.quaternion);
    bone.quaternion.copy(note.base);
    return note;
  }
  function done(bone) { const note = st.posed.get(bone); if (note) note.set.copy(bone.quaternion); }
  function release(rig) {
    for (const [bone, note] of st.posed) if (bone.quaternion.equals(note.set)) bone.quaternion.copy(note.base);
    st.posed.clear();
    showHead(rig, false);
  }
  function showHead(rig, hide) {
    const head = rig && rig.bones && rig.bones.get('head');
    if (!head) return;
    if (hide) { if (!st.headHidden) st.headHidden = head; head.scale.setScalar(0.001); }
    else if (st.headHidden) { st.headHidden.scale.setScalar(1); st.headHidden = null; }
  }
  // Turns a bone about an axis in the scene's frame, by `angle`, on top of how it is posed.
  function turnWorld(bone, axis, angle) {
    if (!bone || !angle) return;
    bone.getWorldQuaternion(q.w);
    q.a.setFromAxisAngle(axis, angle);
    q.w.premultiply(q.a);
    bone.parent.getWorldQuaternion(q.p);
    bone.quaternion.copy(q.p.invert().multiply(q.w));
    bone.updateMatrixWorld(true);
  }
  // Turns a bone, by `weight`, from how it is posed toward the turn `world` (in the scene's frame).
  function turnTo(bone, world, weight) {
    baseOf(bone);
    bone.parent.getWorldQuaternion(q.p);
    q.a.copy(q.p).invert().multiply(world);
    bone.quaternion.slerp(q.a, weight);
    done(bone);
    bone.updateMatrixWorld(true);
  }
  // Points a bone along `want` (from its joint to the next), by `weight`.
  function pointAt(bone, next, want, weight) {
    baseOf(bone);
    bone.updateMatrixWorld(true);
    bone.getWorldPosition(t.a); next.getWorldPosition(t.b);
    t.b.sub(t.a).normalize();
    q.a.setFromUnitVectors(t.b, want);
    bone.getWorldQuaternion(q.w);
    q.w.premultiply(q.a);
    bone.parent.getWorldQuaternion(q.p);
    q.a.copy(q.p).invert().multiply(q.w);
    bone.quaternion.slerp(q.a, weight);
    done(bone);
    bone.updateMatrixWorld(true);
  }
  // A hand on a place of the gun: the arm reaches the wrist's place, the hand turned to its frame (f: along the fingers,
  // side: from the little finger to the forefinger, n: the way the palm faces), its fingers closed by `curl`.
  function hold(rig, s, wrist, f, side, n, pole, curl, weight, thumb) {
    const upper = rig.bones.get(`upperarm_${s}`), lower = rig.bones.get(`lowerarm_${s}`), hand = rig.bones.get(`hand_${s}`);
    if (!upper || !lower || !hand || weight < 0.001) return null;
    const saved = [upper.quaternion.clone(), lower.quaternion.clone(), hand.quaternion.clone()];
    reach(upper, lower, hand, wrist, pole);
    // (eased in from where the figure's own animation had the arm)
    if (weight < 0.999) { const ikU = upper.quaternion.clone(), ikL = lower.quaternion.clone(); upper.quaternion.copy(saved[0]).slerp(ikU, weight); lower.quaternion.copy(saved[1]).slerp(ikL, weight); upper.updateMatrixWorld(true); }
    const grip = gripOf(rig, hand, s);
    if (grip) {
      m.makeBasis(f, side, n).multiply(grip.toLocal);
      q.g.setFromRotationMatrix(m);
      turnTo(hand, q.g, weight);
      for (const finger of grip.fingers) {
        const c = curl[finger.name];
        if (!c) continue;
        const [b1, b2, b3] = finger.bones;
        const tip = b3.children.find((k) => k.isBone) || null;
        const ends = [b2, b3, tip];
        for (let i = 0; i < 3; i += 1) {
          if (!ends[i]) continue;
          t.tmp.copy(f).multiplyScalar(Math.cos(c[i])).addScaledVector(n, Math.sin(c[i]));
          pointAt(finger.bones[i], ends[i], t.tmp, weight);
        }
      }
      if (grip.thumb.length === 3 && thumb) {
        const [t1, t2, t3] = grip.thumb;
        const end = t3.children.find((k) => k.isBone);
        pointAt(t1, t2, t.tmp.copy(thumb[0]).normalize(), weight);
        pointAt(t2, t3, t.tmp.copy(thumb[1]).normalize(), weight);
        if (end) pointAt(t3, end, t.tmp.copy(thumb[2]).normalize(), weight);
      }
    } else hand.updateMatrixWorld(true);
    return hand;
  }
  // How long the figure's hand is, wrist to the middle knuckle (for where the wrist goes to put the palm on a grip)
  const handLength = (rig, s) => {
    const hand = rig.bones.get(`hand_${s}`), mid = rig.bones.get(`middle_01_${s}`);
    if (!hand || !mid) return 0.085 * (rig.spec.height / 1.75);
    return hand.getWorldPosition(t.tmp).distanceTo(mid.getWorldPosition(t.tmp2)) || 0.085;
  };

  // The legs of one crouched: the hips let down by `drop`, each leg reaching its foot where it was, the knee forward.
  function crouchLegs(rig, drop, fw) {
    const feet = [];
    for (const s of ['l', 'r']) {
      const foot = rig.bones.get(`foot_${s}`);
      if (!foot) return;
      feet.push({ s, foot, at: foot.getWorldPosition(V()), turn: foot.getWorldQuaternion(new THREE.Quaternion()) });
    }
    rig.lift.position.y -= drop;
    rig.body.updateMatrixWorld(true);
    for (const { s, foot, at, turn } of feet) {
      const thigh = rig.bones.get(`thigh_${s}`), calf = rig.bones.get(`calf_${s}`);
      if (!thigh || !calf) continue;
      t.pole.copy(fw).multiplyScalar(1).addScaledVector(UP, 0.2);
      reach(thigh, calf, foot, at, t.pole);
      // the foot flat as it was
      foot.parent.getWorldQuaternion(q.p);
      foot.quaternion.copy(q.p.invert().multiply(turn));
      foot.updateMatrixWorld(true);
    }
  }

  function pose(rig, gun, want, dt) {
    out.events.length = 0;
    out.shown = false;
    const able = rig && rig.animated && rig.bones && rig.mixer && rig.group.visible && !rig.lying && !rig.seated && !rig.swimming && !(rig.fallDriver && rig.fallDriver.phase);
    st.w = ease(st.w, want.up && able ? 1 : 0, dt, want.up ? HOLD_TIME.draw : HOLD_TIME.away);
    if (!able || st.w < 0.01) {
      if (gun) gun.group.visible = false;
      if (rig) rig.walkBack = false;
      if (st.posed.size || st.headHidden) release(rig);
      st.w = able ? st.w : 0;
      return out;
    }
    const w = st.w, H = rig.spec.height, hs = H / 1.75;
    const holder = rig.body;
    if (!st.mended) { st.mended = true; st.mendedPoints = mendArmSkin(rig); }
    st.sight = ease(st.sight, want.mode === 'sight' ? 1 : 0, dt, HOLD_TIME.sight);
    st.carry = ease(st.carry, want.mode === 'carry' ? 1 : 0, dt, HOLD_TIME.carry);
    st.crouch = ease(st.crouch, want.crouch ? 1 : 0, dt, HOLD_TIME.crouch);
    // which way the figure faces, which way it is aimed, and the way it is going over the ground
    const facing = rig.group.rotation.y;
    const dir = t.dir.copy(want.dir).normalize();
    const aimYaw = Math.atan2(dir.x, dir.z);
    const speed = want.moving ? Math.hypot(want.moving.x, want.moving.z) : 0;
    // the hips toward the way it goes (forward-ish: that way; backward-ish: its opposite, the walk played backwards),
    // the chest kept on the aim; standing, bladed to the right
    let hipsWant = -BLADE.still * 0.7;
    if (speed > 0.3) {
      const rel = angleGap(Math.atan2(want.moving.x, want.moving.z), facing);
      const back = Math.abs(rel) > 1.95;
      rig.walkBack = back && st.carry < 0.5;
      const r = back ? angleGap(rel, Math.PI) : rel;
      hipsWant = Math.max(-1.0, Math.min(1.0, r * 0.8));
    } else rig.walkBack = false;
    st.hips = ease(st.hips, hipsWant, dt, HOLD_TIME.hips);
    holder.updateMatrixWorld(true);
    const pelvis = rig.bones.get('pelvis'), s1 = rig.bones.get('spine_01'), s2 = rig.bones.get('spine_02'), s3 = rig.bones.get('spine_03');
    const neck = rig.bones.get('neck_01'), head = rig.bones.get('head');
    const hipTurn = st.hips * w * (1 - st.carry * 0.6);
    if (pelvis && s1 && hipTurn) { turnWorld(pelvis, UP, hipTurn); turnWorld(s1, UP, -hipTurn); }
    // the frame of the aim: ahead, to the right, to the left (level)
    t.fw.set(Math.sin(aimYaw), 0, Math.cos(aimYaw));
    t.rt.set(-Math.cos(aimYaw), 0, Math.sin(aimYaw));
    t.lf.copy(t.rt).negate();
    // crouched: the hips let down, the knees bent, and the body a little forward
    if (st.crouch > 0.002) crouchLegs(rig, st.crouch * CROUCH_DROP * (H / 1.8) * w, t.fw);
    // the chest on the aim (turned from where the figure faces, less the blade), bent with it up or down
    const blade = (speed > 0.3 ? BLADE.moving : BLADE.still) * (1 - st.carry);
    const twist = angleGap(aimYaw - blade, facing) * w;
    const pitch = Math.asin(Math.max(-1, Math.min(1, -dir.y)));
    for (const [bone, share] of [[s1, 0.3], [s2, 0.35], [s3, 0.35]]) if (bone) turnWorld(bone, UP, twist * share);
    const chestYaw = facing + twist;
    t.a.set(Math.cos(chestYaw), 0, -Math.sin(chestYaw));            // the chest's left, about which it bends forward
    const bendDown = (pitch * CHEST_PITCH * (1 - st.carry) + st.crouch * 0.12 + st.carry * 0.08) * w;
    for (const [bone, share] of [[s2, 0.45], [s3, 0.55]]) if (bone) turnWorld(bone, t.a, bendDown * share);

    // ---- where the gun is ----
    const R = rig.bones.get('upperarm_r'), L = rig.bones.get('upperarm_l');
    if (!R || !L || !gun) return out;
    R.getWorldPosition(t.b); L.getWorldPosition(t.c);
    // the pocket of the right shoulder: a little in from the joint, a little ahead, and up at the top of it, where the
    // butt sits with the cheek down on the stock
    t.s.copy(t.b).lerp(t.c, 0.2).addScaledVector(t.fw, 0.015 * hs).addScaledVector(UP, 0.03 * hs);
    // (looking through the sight, held steady: the shoulder's bob with the stride let go of, so the view does not shake)
    if (!st.shoulder) st.shoulder = t.s.clone();
    if (st.sight > 0.02) st.shoulder.lerp(t.s, 1 - Math.exp(-dt / 0.07)); else st.shoulder.copy(t.s);
    t.s.copy(st.shoulder);
    const spec = gun.spec, k = spec.scale;
    // (the butt, in the gun's own frame and size)
    t.h.set(spec.butt[0] * k, spec.butt[1] * k, spec.butt[2] * k);
    t.m.set(spec.muzzle[0] * k, spec.muzzle[1] * k, spec.muzzle[2] * k);
    const frame = (x, out2) => {
      // the gun's frame from the way its barrel points: up as near the world's up as it can be, its right side to the right
      t.x.copy(x).normalize();
      t.y.copy(UP).addScaledVector(t.x, -UP.dot(t.x));
      if (t.y.lengthSq() < 1e-6) t.y.copy(t.fw).negate();
      t.y.normalize();
      t.z.crossVectors(t.x, t.y);
      m.makeBasis(t.x, t.y, t.z);
      return out2.setFromRotationMatrix(m);
    };
    // aimed: the barrel from the muzzle to what it is aimed at (worked out twice: the muzzle moves as the gun turns)
    frame(dir, q.aim);
    const at = want.at;
    for (let i = 0; i < 2 && at; i += 1) {
      t.e.copy(t.m).applyQuaternion(q.aim).sub(t.tmp.copy(t.h).applyQuaternion(q.aim)).add(t.s);      // the muzzle
      t.d.copy(at).sub(t.e);
      if (t.d.lengthSq() < 1.4 * 1.4 || t.d.dot(dir) < 0.5) break;      // too close to point at: along the aim
      frame(t.d, q.aim);
    }
    // through the sight: its line along the aim, exactly
    frame(dir, q.sight);
    // carried at a run: across the body, the barrel down and ahead, a little to the left
    t.d.copy(t.fw).multiplyScalar(Math.cos(0.62)).addScaledVector(UP, -Math.sin(0.62)).addScaledVector(t.lf, 0.42);
    frame(t.d, q.carry);
    q.a.setFromAxisAngle(t.tmp.copy(t.d).normalize(), -0.4);
    q.carry.premultiply(q.a);
    q.b.copy(q.aim).slerp(q.sight, st.sight).slerp(q.carry, st.carry);
    // a reload: the gun tipped onto its side toward the hand, the muzzle a little down
    const u = want.reload === null || want.reload === undefined ? null : Math.max(0, Math.min(1, want.reload));
    const tip = u === null ? 0 : smooth(u / 0.1) * (1 - smooth((u - 0.9) / 0.1));
    if (tip > 0) {
      t.tmp.set(1, 0, 0).applyQuaternion(q.b);
      q.a.setFromAxisAngle(t.tmp, 0.42 * tip); q.b.premultiply(q.a);
      t.tmp.set(0, 0, 1).applyQuaternion(q.b);
      q.a.setFromAxisAngle(t.tmp, -0.18 * tip); q.b.premultiply(q.a);
    }
    // recoil: each round drives it back and its muzzle up, springing back
    if (want.kicks) { st.kickV += KICK.spring * want.kicks; st.sideV += (Math.random() - 0.5) * 6 * want.kicks; }
    st.kickV -= st.kick * KICK.spring * KICK.spring * dt; st.kickV *= Math.exp(-dt * 2 * KICK.spring * 0.7); st.kick += st.kickV * dt;
    st.sideV -= st.side * 400 * dt; st.sideV *= Math.exp(-dt * 25); st.side += st.sideV * dt;
    const kick = Math.max(-0.3, Math.min(1.5, st.kick));
    t.tmp.set(0, 0, 1).applyQuaternion(q.b);
    q.a.setFromAxisAngle(t.tmp, KICK.up * kick); q.b.premultiply(q.a);
    q.a.setFromAxisAngle(UP, st.side * 0.02); q.b.premultiply(q.a);
    // the place: the butt at the shoulder (lowered toward the hip at a run, lower still in a reload)
    t.p.copy(t.s).addScaledVector(UP, (-0.1 * st.carry - 0.03 * tip) * hs).addScaledVector(t.rt, 0.03 * st.carry * hs).sub(t.tmp.copy(t.h).applyQuaternion(q.b));
    t.p.addScaledVector(t.tmp.set(1, 0, 0).applyQuaternion(q.b), -KICK.back * kick);
    gun.group.position.copy(t.p);
    gun.group.quaternion.copy(q.b);
    gun.group.visible = true;
    gun.group.updateMatrixWorld(true);

    // ---- the hands ----
    const X = t.x.set(1, 0, 0).applyQuaternion(q.b), Y = t.y.set(0, 1, 0).applyQuaternion(q.b), Z = t.z.set(0, 0, 1).applyQuaternion(q.b);
    // the right hand round the pistol grip: the palm against its right side, the fingers round its front, the
    // forefinger at the trigger
    const lean = spec.gripLean;
    const fR = t.f.copy(X).multiplyScalar(Math.cos(lean)).addScaledVector(Y, -Math.sin(lean)).normalize();
    const sideR = t.g.copy(Y).multiplyScalar(Math.cos(lean)).addScaledVector(X, Math.sin(lean)).normalize();
    const nR = V().crossVectors(sideR, fR).normalize();
    const LR = handLength(rig, 'r');
    const grip = gun.point('grip', V());
    const wristR = grip.clone().addScaledVector(Z, spec.gripHalf * k + 0.018 * hs).addScaledVector(fR, -0.55 * LR).addScaledVector(sideR, -0.005 * hs);
    t.pole.copy(t.rt).multiplyScalar(0.9).addScaledVector(UP, -0.8).addScaledVector(t.fw, -0.25);
    const thumbR = [V().copy(sideR).multiplyScalar(0.5).addScaledVector(fR, 0.55).addScaledVector(nR, 0.65), V().copy(fR).multiplyScalar(0.65).addScaledVector(nR, 0.7).addScaledVector(sideR, 0.2), V().copy(fR).multiplyScalar(0.55).addScaledVector(nR, 0.8)];
    hold(rig, 'r', wristR, fR, sideR, nR, t.pole.clone(), RIGHT_CURL, w, thumbR);
    // the left hand: under the handguard, palm up, its fingers round the right side; in a reload, at the magazine, the
    // belt, the magazine again and the handle
    const fL = V().copy(Z).multiplyScalar(0.92).addScaledVector(X, 0.38).normalize();
    const nL = V().copy(Y);
    const sideL = V().crossVectors(nL, fL).normalize();
    const LL = handLength(rig, 'l');
    let wristL = gun.point('support', V()).addScaledVector(nL, -(0.016 * hs)).addScaledVector(fL, -0.6 * LL);
    let magShown = true;
    if (u !== null && gun.mag) {
      // (the magazine's place in the gun, in its own units: out of it below, then gone, then back in the hand)
      const S = RELOAD_STEPS;
      const below = 0.32;
      let dy = 0, inHand = false;
      if (u < S.grab) dy = 0;
      else if (u < S.out) dy = -below * smooth((u - S.grab) / (S.out - S.grab));
      else if (u < S.back) { magShown = u >= S.pouch; inHand = true; dy = -below; }
      else if (u < S.home) dy = -below * (1 - smooth((u - S.back) / (S.home - S.back)));
      gun.mag.position.set(0, dy, 0);
      const magAt = gun.point('magazine', V());
      const handAtMag = magAt.clone().addScaledVector(Z, -(0.04 * hs)).addScaledVector(Y, -(0.03 * hs));
      const pouch = holder.localToWorld(V().set(0.11 * H, 0.52 * H, 0.1 * H));
      const handle = gun.point('handle', V()).addScaledVector(Z, -(0.05 * hs));
      let target = wristL;
      if (u < S.grab) target = wristL.clone().lerp(handAtMag, smooth(u / S.grab));
      else if (u < S.out) target = handAtMag;
      else if (u < S.pouch) target = handAtMag.clone().lerp(pouch, smooth((u - S.out) / (S.pouch - S.out)));
      else if (u < S.back) {
        const k2 = smooth((u - S.pouch) / (S.back - S.pouch));
        target = pouch.clone().lerp(handAtMag, k2);
        // the fresh magazine in the hand on its way up
        if (inHand) { const local = gun.group.worldToLocal(target.clone().addScaledVector(Z, 0.04 * hs).addScaledVector(Y, 0.03 * hs)); gun.mag.position.set(local.x - spec.magazine.hold[0], local.y - spec.magazine.hold[1], local.z - spec.magazine.hold[2]); }
      } else if (u < S.home) target = handAtMag;
      else if (u < S.handle) { const k2 = (u - S.home) / (S.handle - S.home); target = handAtMag.clone().lerp(handle, smooth(k2 * 2)).addScaledVector(X, -0.05 * smooth((k2 - 0.5) * 2)); }
      else target = handle.clone().lerp(wristL, smooth((u - S.handle) / (1 - S.handle)));
      wristL = target;
      // what has happened, once each (the old magazine falls; the sounds: gun-play.js)
      const last = st.lastReload === null ? -1 : st.lastReload;
      for (const [name, at2] of [['grab', S.grab], ['out', S.out], ['home', S.home], ['handle', S.handle]]) if (last < at2 && u >= at2) out.events.push(name);
      st.lastReload = u;
      gun.mag.updateMatrixWorld(true);
    } else {
      if (gun.mag && (gun.mag.position.lengthSq() > 0)) gun.mag.position.set(0, 0, 0);
      st.lastReload = null;
    }
    gun.showMagazine(magShown);
    t.pole.copy(UP).multiplyScalar(-1).addScaledVector(t.lf, 0.45).addScaledVector(t.fw, -0.1);
    const thumbL = [V().copy(sideL).multiplyScalar(0.7).addScaledVector(fL, 0.4).addScaledVector(nL, 0.3), V().copy(sideL).multiplyScalar(0.85).addScaledVector(nL, 0.2), V().copy(sideL)];
    hold(rig, 'l', wristL, fL, sideL, nL, t.pole.clone(), LEFT_CURL, w, thumbL);

    // ---- the head: along the aim (left undrawn where the eye is the camera's) ----
    if (head && !want.hideHead) {
      head.getWorldPosition(t.a);
      t.b.set(Math.sin(chestYaw), 0, Math.cos(chestYaw));
      t.c.copy(want.at || t.d.copy(t.a).addScaledVector(dir, 20)).sub(t.a).normalize();
      q.a.setFromUnitVectors(t.b, t.c);
      for (const [bone, share] of [[neck, 0.35], [head, 0.55]]) {
        if (!bone) continue;
        q.w.identity().slerp(q.a, share * w * (1 - st.carry * 0.5));
        bone.getWorldQuaternion(q.p);
        q.g.copy(q.w).multiply(q.p);
        bone.parent.getWorldQuaternion(q.p);
        bone.quaternion.copy(q.p.invert().multiply(q.g));
        bone.updateMatrixWorld(true);
      }
      // the cheek down on the stock: the head tipped forward and over to the right, aimed (not at a run)
      const weld = w * (1 - st.carry);
      if (weld > 0.01) { turnWorld(head, t.a.set(Math.cos(chestYaw), 0, -Math.sin(chestYaw)), 0.14 * weld); turnWorld(head, t.b.set(Math.sin(aimYaw), 0, Math.cos(aimYaw)), 0.2 * weld); }
    }
    showHead(rig, !!want.hideHead && st.sight > 0.35);

    gun.point('eye', t.eye);
    gun.point('muzzle', t.muzzle);
    t.dir.set(1, 0, 0).applyQuaternion(q.b);
    out.shown = true;
    return out;
  }

  return {
    pose,
    release,
    get weight() { return st.w; },
    get sight() { return st.sight; },
    get crouch() { return st.crouch; },
    // (for the tests)
    state: st,
  };
}
