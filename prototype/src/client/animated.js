// A character that comes with its own skeleton and its own animations: the owner's supplied GLB, drawn as it
// is (src/client/glb.js). It does not use the game's skeleton or its walk; it plays what the file has.
//
// The figure made here has the same handles as one from character.js (a group to place, a body to lay down,
// a name label, a shadow), so the town can carry it like anyone else. The arm and leg handles are there so
// that nothing that writes to them breaks; this figure does not read them.
//
// The file is large, so it is fetched once, beside the page, and shared by every figure made from it. Until it
// has arrived a figure is an empty place in the world.

import { parseGLB, modelFromGLB, animationLabel } from './glb.js';
import { nameTexture, surface } from './render-kit.js';
import { SEAT_POSE } from './seat-pose.js';

// Which supplied animated figures there are, where each file is, and how tall a person it is. The files are
// made one unit tall; they are drawn at a person's height, the same all over, nothing else changed.
// `still` is what plays when the figure stands in town: neither file has an idle animation, so it is the
// quietest one each has.
export const ANIMATED = Object.freeze({
  W1: Object.freeze({ id: 'W1', file: 'woman.glb', text: 'woman.b64.txt', inline: '__PCW_WOMAN_B64', height: 1.70, walk: 'walk.001', run: 'run.001', still: 'agree.001', walkSpeed: 1.3, runSpeed: 4.4 }),
  M1: Object.freeze({ id: 'M1', file: 'man.glb', text: 'man.b64.txt', inline: '__PCW_MAN_B64', height: 1.80, walk: 'walk.001', run: 'run.001', still: 'agree.001', walkSpeed: 1.35, runSpeed: 4.6 }),
});

// How high above its own feet a seated figure's seat is, for a figure of height 1: the same number the town
// uses to put anyone in a seat, so the supplied figures sit where everyone else does.
const SEATED_HEIGHT = 0.845;
// where the hands hold the handlebars or the wheel, from the hips: across, up, forward (metres)
const GRIP = { x: 0.25, y: 0.3, z: 0.38 };

const loading = new Map();
// a touch-first device draws the supplied textures at half size (see glb.js); '#full' in the address keeps them whole
const liteTexture = () => { try { const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches; return coarse && !String(location.hash).includes('full') ? 2048 : 0; } catch (error) { return 0; } };
function bytesOf(spec) {
  // started by the page's first script, on a worker (template.html); otherwise fetched and decoded here
  const early = typeof window !== 'undefined' && (window.__PCW_LOAD_FIGURE ? window.__PCW_LOAD_FIGURE(spec.id) : window.__PCW_FIGURE_BYTES && window.__PCW_FIGURE_BYTES[spec.id]);
  if (early) return early.catch(() => bytesHere(spec));
  return bytesHere(spec);
}
function bytesHere(spec) {
  const inline = typeof window !== 'undefined' && window[spec.inline];
  if (inline) {
    const text = atob(inline); const out = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i += 1) out[i] = text.charCodeAt(i);
    return Promise.resolve(out.buffer);
  }
  const decode = (text) => { const raw = atob(text.trim()); const out = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i); return out.buffer; };
  // the file itself where the host serves it; otherwise the same bytes written as text beside it
  return fetch(spec.file)
    .then((r) => { if (!r.ok) throw new Error(`${spec.file}: ${r.status}`); return r.arrayBuffer(); })
    .then((b) => { if (new DataView(b).getUint32(0, true) !== 0x46546c67) throw new Error('not the file'); return b; })
    .catch(() => fetch(spec.text).then((r) => { if (!r.ok) throw new Error(`${spec.text}: ${r.status}`); return r.text(); }).then(decode));
}
export function loadAnimated(id) {
  if (!loading.has(id)) {
    const spec = ANIMATED[id];
    loading.set(id, bytesOf(spec).then((buffer) => {
      const model = modelFromGLB(parseGLB(buffer), { surface, maxTexture: liteTexture() });
      return model.ready.then(() => ({ spec, model, labels: model.clips.map((c) => ({ name: c.name, label: animationLabel(c.name) })) }));
    }));
  }
  return loading.get(id);
}

const control = () => ({ rotation: { x: 0, y: 0, z: 0 } });

// Points a bone so that a point on its child lies along `to` (world space), by the shortest turn.
function aim(bone, child, to) {
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion(), _w = new THREE.Quaternion(), _p = new THREE.Quaternion();
  bone.getWorldPosition(_a); child.getWorldPosition(_b);
  const cur = _b.sub(_a).normalize(), want = _c.copy(to).sub(_a).normalize();
  _q.setFromUnitVectors(cur, want);
  bone.getWorldQuaternion(_w); bone.parent.getWorldQuaternion(_p);
  bone.quaternion.copy(_p.invert().multiply(_q.multiply(_w)));
  bone.updateMatrixWorld(true);
}
// An arm reaching for a point: the elbow bends toward `pole`, the hand ends on the point if it can reach it.
export function reach(upper, lower, hand, target, pole) {
  if (!upper || !lower || !hand) return;
  const S = upper.getWorldPosition(new THREE.Vector3()), E = lower.getWorldPosition(new THREE.Vector3()), H = hand.getWorldPosition(new THREE.Vector3());
  const l1 = S.distanceTo(E), l2 = E.distanceTo(H);
  const toT = target.clone().sub(S); const d = Math.min(Math.max(toT.length(), Math.abs(l1 - l2) + 1e-3), (l1 + l2) * 0.999);
  const dir = toT.normalize();
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const side = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
  const elbow = S.clone().add(dir.clone().multiplyScalar(a)).add(side.multiplyScalar(h));
  aim(upper, lower, elbow);
  aim(lower, hand, S.clone().add(dir.multiplyScalar(d)));
}

export function makeAnimatedRig(id, labelText, shadow = false) {
  const spec = ANIMATED[id];
  const group = new THREE.Group();
  const holder = new THREE.Group();
  const lift = new THREE.Group();          // raised or lowered to put the figure on a seat
  group.add(holder); holder.add(lift);
  let label = null;
  if (labelText) {
    label = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTexture(labelText), transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    label.scale.set(0.95, 0.18, 1); label.position.set(0, 2.14, 0); label.visible = false;
    group.add(label);
  }
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.4, 18), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.13, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.09; group.add(blob);

  const rig = {
    animated: id, figure: id, group, body: holder, label, blob, mesh: null, triangles: 0, spec, speed: 0, idleTime: 0, phase: 0, scale: 1, stride: 1,
    torso: control(), head: { group: control() }, pelvis: { yaw: 0, roll: 0, drop: 0, sway: 0 }, gait: { hipY: 0 }, lean: 0, bank: 0,
    legL: { hip: control(), knee: control(), foot: control() }, legR: { hip: control(), knee: control(), foot: control() },
    armL: { shoulder: control(), elbow: control() }, armR: { shoulder: control(), elbow: control() },
    mixer: null, actions: new Map(), current: null, chosen: null, labels: [],
    loaded: null, bones: null, seated: false,
    // plays one of the file's animations by its name, fading from whatever was playing
    play(name, fade = 0.3, once = false) {
      rig.chosen = name;
      if (!rig.mixer) return;
      const next = rig.actions.get(name);
      if (!next || (next === rig.current && !once)) return;
      if (next === rig.current) { next.reset(); return; }
      // a skill plays once and holds its last pose until it is faded out; everything else goes round
      next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); next.clampWhenFinished = once;
      next.reset(); next.setEffectiveTimeScale(1); next.setEffectiveWeight(1); next.enabled = true; next.play();
      if (rig.current) rig.current.crossFadeTo(next, fade, false);
      rig.current = next;
    },
    // in a seat: the sitting pose from the supplied woman's own sit animation, the hips on the seat and both
    // hands forward on the handlebars or the wheel. Nothing is changed in the file: the bones are posed.
    seat(on = true) {
      rig.seated = on;
      if (!on) { lift.position.set(0, 0, 0); return; }
      if (!rig.bones) return;
      for (const [name, q] of Object.entries(SEAT_POSE)) { const b = rig.bones.get(name); if (b) b.quaternion.fromArray(q); }
      lift.position.set(0, 0, 0); holder.updateMatrixWorld(true);
      const thigh = rig.bones.get('thigh_l'), pelvis = rig.bones.get('pelvis');
      const t = holder.worldToLocal(thigh.getWorldPosition(new THREE.Vector3()));
      const hips = holder.worldToLocal(pelvis.getWorldPosition(new THREE.Vector3()));
      // the hips over the figure's own origin, where the town puts a seated person's hips
      lift.position.set(0, SEATED_HEIGHT - (t.y - 0.07), -hips.z);
      holder.updateMatrixWorld(true);
      for (const side of [1, -1]) {
        const s = side === 1 ? 'l' : 'r';
        // the figure's left is +x in its own frame (it faces +z)
        const target = holder.localToWorld(new THREE.Vector3(side * GRIP.x, hips.y + lift.position.y + GRIP.y, GRIP.z));
        const pole = holder.localToWorld(new THREE.Vector3(side * 0.8, -1, -0.2)).sub(holder.localToWorld(new THREE.Vector3()));
        reach(rig.bones.get(`upperarm_${s}`), rig.bones.get(`lowerarm_${s}`), rig.bones.get(`hand_${s}`), target, pole);
      }
    },
    // A skill: one of the file's own animations, played once where the figure stands, faded in from what it was
    // doing. When it ends, or the figure moves off, driveAnimated fades it back into standing, walking or running.
    emote(name) {
      if (!rig.actions.has(name)) return false;
      rig.emoting = { name, at: rig.idleTime };
      rig.play(name, 0.3, true);
      return true;
    },
    // what this figure can do: every clip in its file, by its one-word name and how long it lasts
    clips() { return rig.labels.map(({ name, label }) => ({ name, label, duration: rig.actions.has(name) ? rig.actions.get(name).getClip().duration : 0 })); },
    dispose() { if (rig.mixer) rig.mixer.stopAllAction(); blob.geometry.dispose(); blob.material.dispose(); if (label) { label.material.map.dispose(); label.material.dispose(); } },
  };
  rig.loaded = loadAnimated(id).then(({ model, labels }) => {
    const { root, mesh } = model.figure();
    mesh.castShadow = shadow;
    const k = spec.height / model.height;
    root.scale.setScalar(k);
    lift.add(root);
    rig.bones = new Map(); root.traverse((o) => { if (o.isBone) rig.bones.set(o.name, o); });
    rig.mesh = mesh; rig.triangles = model.triangles; rig.labels = labels;
    rig.mixer = new THREE.AnimationMixer(root);
    for (const clip of model.clips) { const a = rig.mixer.clipAction(clip); a.setLoop(THREE.LoopRepeat, Infinity); rig.actions.set(clip.name, a); }
    const first = rig.chosen || spec.still;
    rig.chosen = null; rig.play(first, 0);
    return rig;
  });
  return rig;
}

// In the town: standing, walking or running by how fast the figure is going, the walk and run played at the pace
// they are walked. On the selection screen the player's own choice plays instead (`rig.held`).
export function driveAnimated(rig, dt, speed) {
  rig.speed += (speed - rig.speed) * Math.min(1, dt * 6.5);
  if (!rig.mixer) return;
  // a skill being played: it runs to its end where the figure stands; moving off ends it at once
  if (rig.emoting && rig.mixer) {
    const a = rig.actions.get(rig.emoting.name);
    const done = !a || a !== rig.current || a.time >= a.getClip().duration - 0.04;
    if (rig.held || rig.swimming || rig.seated || speed > 0.35 || done) {
      rig.emoting = null;
      // back to going round, so that a clip that is also the standing one (Agree) does not stay on its last frame
      if (a) { a.setLoop(THREE.LoopRepeat, Infinity); a.clampWhenFinished = false; a.paused = false; if (done && a === rig.current) a.reset(); }
      if (rig.onEmoteEnd) rig.onEmoteEnd();
    }
    else { rig.mixer.update(dt); rig.idleTime += dt; return; }
  }
  if (!rig.held && rig.swimming) {
    // in the river: the file's own swim, slower when drifting and quicker with the stroke held
    rig.play('swim.001', 0.4);
    if (rig.current) rig.current.setEffectiveTimeScale(Math.max(0.45, Math.min(1.4, 0.45 + rig.speed / 1.6)));
  } else if (!rig.held) {
    const v = rig.speed, s = rig.spec;
    const want = v > 3.0 ? s.run : v > 0.25 ? s.walk : s.still;
    rig.play(want, 0.25);
    if (rig.current) rig.current.setEffectiveTimeScale(want === s.run ? Math.max(0.6, v / s.runSpeed) : want === s.walk ? Math.max(0.5, v / s.walkSpeed) : 1);
  }
  rig.mixer.update(dt);
}
