// A character that comes with its own skeleton and its own animations: the owner's supplied GLB, drawn as it
// is (src/client/glb.js). It does not use the game's skeleton or its walk; it plays what the file has.
//
// The figure made here has the same handles as one from character.js (a group to place, a body to lay down,
// a name label, a shadow), so the town can carry it like anyone else. The arm and leg handles are there so
// that nothing that writes to them breaks; this figure does not read them.
//
// The file is large, so it is fetched once, beside the page, and shared by every figure made from it. Until it
// has arrived a figure is an empty place in the world.

import { parseGLB, modelFromGLB, figureLabels, boneName } from './glb.js';
import { nameTexture, surface } from './render-kit.js';
import { SEAT_POSE } from './seat-pose.js';
import { borrowedFor, seatFor } from './figure-moves.js';
import { pictureSize } from './budget.js';

// Which supplied animated figures there are, where each file is, and how tall a person it is. The files are
// made one unit tall; they are drawn at a person's height, the same all over, nothing else changed.
// `still` is what plays when the figure stands in town; `walk`, `run` and `swim` what plays as it goes. A name
// beginning with ~ is a movement the file itself does not have, borrowed from another supplied figure and played
// on this one's own bones (figure-moves.js; tools/characters/borrow.mjs says how).
// `rig` is how the file names its bones: 'ue' (pelvis, hand_r) or 'mixamo' (mixamorig:Hips, mixamorig:RightHand).
// `react` names, for each thing that can happen to the figure, which of its own clips shows it, best first:
//   hit    a blow lands on it                      fall   knocked off its feet (the first that goes all the way down)
//   punch  it throws a punch      heavy  a heavy one      kick  it kicks      call  it talks on the phone
// A figure with no clip for one of these is moved by hand instead (a flinch, an arm thrown out, laid down flat).
export const ANIMATED = Object.freeze({
  W1: Object.freeze({ id: 'W1', file: 'woman.glb', text: 'woman.b64.txt', inline: '__PCW_WOMAN_B64', height: 1.70, rig: 'ue', walk: 'walk.001', run: 'run.001', still: 'agree.001', swim: 'swim.001', walkSpeed: 1.3, runSpeed: 4.4,
    react: Object.freeze({ hit: [], fall: ['fall.001', 'defeat_03.001'], punch: ['box_01.001', 'box_02.001'], heavy: ['box_03.001'], kick: ['front_kick_02.001', 'front_kick_01.001'], call: ['make_a_call_02.001'] }) }),
  M1: Object.freeze({ id: 'M1', file: 'man.glb', text: 'man.b64.txt', inline: '__PCW_MAN_B64', height: 1.80, rig: 'ue', walk: 'walk.001', run: 'run.001', still: 'agree.001', swim: 'swim.001', walkSpeed: 1.35, runSpeed: 4.6,
    react: Object.freeze({ hit: ['hit_to_head.001'], fall: [], punch: [], heavy: [], kick: ['front_kick_02.001', 'front_kick_01.001'], call: ['make_a_call_01.001', 'make_a_call_02.001'] }) }),
  W2: Object.freeze({ id: 'W2', file: 'athlete.glb', text: 'athlete.b64.txt', inline: '__PCW_ATHLETE_B64', height: 1.72, rig: 'ue', walk: 'walk.001', run: 'run.001', still: '~idle', swim: 'swim.001', walkSpeed: 1.3, runSpeed: 4.6,
    react: Object.freeze({ hit: [], fall: ['fall.001'], punch: [], heavy: [], kick: [], call: ['make_a_call_02.001'] }) }),
  W3: Object.freeze({ id: 'W3', file: 'police.glb', text: 'police.b64.txt', inline: '__PCW_POLICE_B64', height: 1.80, rig: 'ue', walk: '~walk', run: '~run', still: 'idle.001', swim: '~swim', walkSpeed: 1.35, runSpeed: 4.6,
    react: Object.freeze({ hit: [], fall: ['fall.001', 'defeat_03.001'], punch: [], heavy: [], kick: [], call: ['make_a_call_02.001'] }) }),
  M4: Object.freeze({ id: 'M4', file: 'priest.glb', text: 'priest.b64.txt', inline: '__PCW_PRIEST_B64', height: 1.78, rig: 'mixamo', walk: 'walk', run: '~run', still: '~idle', swim: '~swim', walkSpeed: 1.25, runSpeed: 4.2,
    react: Object.freeze({ hit: [], fall: ['fall', 'defeat_03'], punch: [], heavy: [], kick: [], call: ['make_a_call_02'] }) }),
  M5: Object.freeze({ id: 'M5', file: 'warrior.glb', text: 'warrior.b64.txt', inline: '__PCW_WARRIOR_B64', height: 1.82, rig: 'mixamo', walk: 'walk.001', run: 'run.001', still: '~idle', swim: '~swim', walkSpeed: 1.35, runSpeed: 4.8,
    react: Object.freeze({ hit: ['hit_to_head.001'], fall: [], punch: ['box_01.001', 'box_02.001'], heavy: ['box_03.001'], kick: ['front_kick_02.001', 'front_kick_01.001'], call: ['make_a_call_02.001'] }) }),
  // The eighteen of 16 October 2026 (src/sim/figures.js). The website serves each file as it is (no copy as text:
  // `text` is null), and the copy of the game on disk carries none of them (`inline` is null).
  ...newFigures([
    ['W4', 'female_figure.glb', 1.68, { swim: 'swim.001' }, { hit: ['hit_to_stomach.001'], fall: ['fall.001'], punch: ['box_01.001', 'box_02.001'] }],
    ['W5', 'athletic_outfit.glb', 1.70, { swim: 'swim.001' }, { hit: ['hit_to_stomach.001'], punch: ['box_01.001', 'box_02.001'], kick: ['front_kick_02.001', 'front_kick_01.001'], call: ['make_a_call_02.001'] }],
    ['W6', 'fashion_model_3.glb', 1.72, { swim: 'swim.001' }, { punch: ['box_01.001', 'box_02.001'], heavy: ['box_03.001'], kick: ['front_kick_01.001'] }],
    ['W7', 'zombie_survivor.glb', 1.68, { run: 'run.001', swim: 'swim.001' }, { fall: ['fall.001'], punch: ['box_01.001', 'box_02.001'], heavy: ['box_03.001'], kick: ['front_kick_02.001'], call: ['make_a_call_02.001'] }],
    ['W8', 'female_character_2.glb', 1.70, { run: 'run.001', swim: 'swim.001' }, { punch: ['box_01.001'], kick: ['front_kick_02.001'] }],
    ['W9', 'horror_nurse.glb', 1.70, {}, { fall: ['defeat_03.001'], punch: ['box_01.001', 'box_02.001'], heavy: ['box_03.001'] }],
    ['W10', 'camouflage_bikini.glb', 1.70, { swim: 'swim.001' }, { fall: ['fall.001'], punch: ['box_01.001'] }],
    ['W11', 'swimwear_model.glb', 1.72, { swim: 'swim.001' }, { fall: ['fall.001'], punch: ['box_01.001'] }],
    ['W12', 'fashion_model_2.glb', 1.74, { swim: 'swim.001' }, { punch: ['box_01.001'] }],
    ['W13', 'fashion_model_1.glb', 1.68, { swim: 'swim.001' }, { hit: ['hit_to_head.001', 'hit_to_body_01.001'], fall: ['fall.001'], punch: ['box_01.001', 'box_02.001'], kick: ['front_kick_01.001'], call: ['make_a_call_02.001'] }],
    ['M6', 'male_figure.glb', 1.82, { swim: 'swim.001' }, { fall: ['fall.001'], punch: ['box_01.001', 'box_02.001'], heavy: ['box_03.001'] }],
    ['M7', 'zombie.glb', 1.80, { walk: 'walk.001', swim: 'swim.001' }, { fall: ['fall.001'], punch: ['box_02.001'], heavy: ['box_03.001'], kick: ['front_kick_02.001', 'front_kick_01.001'], call: ['make_a_call_02.001'] }],
    ['M8', 'horror_character.glb', 1.85, { run: 'run.001', swim: 'swim.001' }, { fall: ['fall.001'], punch: ['box_01.001', 'box_02.001'], heavy: ['box_03.001'], kick: ['front_kick_02.001'] }],
    ['M9', 'hobo_character.glb', 1.78, { walk: 'walk.001', swim: 'swim.001' }, { hit: ['hit_to_head.001'], fall: ['defeat_03.001'], punch: ['box_01.001', 'box_02.001'], heavy: ['box_03.001'], kick: ['front_kick_02.001'], call: ['make_a_call_02.001'] }],
    ['M10', 'zombie_character.glb', 1.80, { walk: 'walk.001', run: 'run.001', swim: 'swim.001' }, { punch: ['box_01.001', 'box_02.001'], heavy: ['box_03.001'], kick: ['front_kick_02.001'] }],
    ['M11', 'human_character.glb', 1.80, {}, { punch: ['box_01.001', 'box_02.001'], heavy: ['box_03.001'] }],
    ['M12', 'ninja_armor.glb', 1.83, {}, { fall: ['defeat_03.001'], punch: ['box_01.001', 'box_02.001'], heavy: ['box_03.001'] }],
    ['M13', 'ninja_warrior.glb', 1.85, { walk: 'walk.001', run: 'run.001', swim: 'swim.001' }, { hit: ['hit_to_head.001', 'hit_to_body_01.001'], fall: ['fall.001'], punch: ['box_01.001', 'box_02.001'], heavy: ['box_03.001'], kick: ['front_kick_02.001', 'front_kick_01.001'], call: ['make_a_call_02.001'] }],          // (its defeat_02, "Slump", ends on its knees, not on the ground: not a fall)
    // the six of 17 October 2026
    ['W14', 'fashion_model_7.glb', 1.72, { swim: 'swim.001' }, { fall: ['fall.001'], punch: ['box_01.001', 'box_02.001'], heavy: ['box_03.001'], kick: ['front_kick_02.001', 'front_kick_01.001'] }],
    ['W15', 'fashion_model_5.glb', 1.66, {}, { hit: ['hit_to_stomach.001', 'hit_to_head.001'], punch: ['box_01.001', 'box_02.001'], heavy: ['box_03.001'], kick: ['front_kick_02.001'] }],
    ['M14', 'fashion_model_6.glb', 1.80, { swim: 'swim.001' }, { punch: ['box_01.001', 'box_02.001'], heavy: ['box_03.001'], kick: ['front_kick_02.001', 'front_kick_01.001'], call: ['make_a_call_02.001'] }],
    ['M15', 'patchwork_shirt.glb', 1.82, { swim: 'swim.001' }, { punch: ['box_01.001'], heavy: ['box_03.001'], kick: ['front_kick_02.001', 'front_kick_01.001'], call: ['make_a_call_02.001'] }],
    ['M16', 'nigerian_traditional.glb', 1.80, { swim: 'swim.001' }, { punch: ['box_01.001', 'box_02.001'], heavy: ['box_03.001'], kick: ['front_kick_02.001', 'front_kick_01.001'], call: ['make_a_call_02.001'] }],
    ['M17', 'urban_streetwear.glb', 1.78, { swim: 'swim.001' }, { punch: ['box_01.001', 'box_02.001'], heavy: ['box_03.001'], kick: ['front_kick_01.001'], call: ['make_a_call_02.001'] }],
  ]),
});
// [id, file, height, its own walk/run/swim clips (what it lacks is borrowed: ~walk, ~run, ~swim), what shows what
// happens to it]. Every one of them stands with the borrowed idle; women walk and run at a woman's pace.
function newFigures(list) {
  return Object.fromEntries(list.map(([id, file, height, own, react]) => {
    const woman = id.startsWith('W');
    return [id, Object.freeze({
      id, file, text: null, inline: null, height, rig: 'mixamo',
      walk: own.walk || '~walk', run: own.run || '~run', still: '~idle', swim: own.swim || '~swim',
      walkSpeed: woman ? 1.3 : 1.35, runSpeed: woman ? 4.5 : 4.7,
      react: Object.freeze({ hit: [], fall: [], punch: [], heavy: [], kick: [], call: [], ...react }),
    })];
  }));
}

// Mixamo's name for each bone this game reaches for by its Unreal name (the hands and fingers for the phone,
// the arms and legs for a seat). A Mixamo figure answers to both.
const MIXAMO = {
  root: 'Hips', pelvis: 'Hips', spine_01: 'Spine', spine_02: 'Spine1', spine_03: 'Spine2', neck_01: 'Neck', head: 'Head',
  clavicle_l: 'LeftShoulder', upperarm_l: 'LeftArm', lowerarm_l: 'LeftForeArm', hand_l: 'LeftHand',
  clavicle_r: 'RightShoulder', upperarm_r: 'RightArm', lowerarm_r: 'RightForeArm', hand_r: 'RightHand',
  thigh_l: 'LeftUpLeg', calf_l: 'LeftLeg', foot_l: 'LeftFoot', ball_l: 'LeftToeBase',
  thigh_r: 'RightUpLeg', calf_r: 'RightLeg', foot_r: 'RightFoot', ball_r: 'RightToeBase',
};
for (const [ue, side] of [['l', 'Left'], ['r', 'Right']]) {
  for (const [f, m] of [['thumb', 'Thumb'], ['index', 'Index'], ['middle', 'Middle'], ['ring', 'Ring'], ['pinky', 'Pinky']]) for (let i = 1; i <= 3; i += 1) MIXAMO[`${f}_0${i}_${ue}`] = `${side}Hand${m}${i}`;
}

// How much each kind of thing that can happen matters: a figure doing one thing is interrupted only by something
// that matters as much or more. Walking, standing and swimming are underneath all of them.
export const PRIORITY = Object.freeze({ skill: 1, call: 2, shoot: 3, punch: 3, heavy: 3, kick: 3, shove: 3, hit: 4, fall: 5 });
// how fast a clip shown for a blow is played: the files' fighting clips are slower than a blow in the game
const PACE = Object.freeze({ punch: 1.9, heavy: 1.5, kick: 1.35, hit: 1.4, fall: 1.15, call: 1 });

// How high above its own feet a seated figure's seat is, for a figure of height 1: the same number the town
// uses to put anyone in a seat, so the supplied figures sit where everyone else does.
const SEATED_HEIGHT = 0.845;
// where the hands hold the handlebars or the wheel, from the hips: across, up, forward (metres)
const GRIP = { x: 0.25, y: 0.3, z: 0.38 };

const loading = new Map();
// Each figure's model (its shape and pictures, shared by every figure drawn from it) is kept while a figure on the
// screen is drawn from it, and one more besides; beyond that, the one let go longest ago is freed. A figure's pictures
// are up to half a gigabyte of graphics memory at full size, and a player looking through thirty characters on the
// choosing screen otherwise kept every one they had looked at, until the page fell over (17 October 2026).
const users = new Map();          // id -> how many figures on the screen are drawn from it
const unused = [];                // ids drawn by none, the longest unused first
const KEEP_UNUSED = 1;
function useModel(id) {
  users.set(id, (users.get(id) || 0) + 1);
  const i = unused.indexOf(id); if (i >= 0) unused.splice(i, 1);
}
function releaseModel(id) {
  const n = (users.get(id) || 1) - 1;
  if (n > 0) { users.set(id, n); return; }
  users.delete(id); unused.push(id);
  while (unused.length > KEEP_UNUSED) {
    const old = unused.shift(), held = loading.get(old);
    loading.delete(old);
    if (held) held.then(({ model }) => {
      model.geometry.dispose();
      const m = model.material;
      for (const t of new Set([m.map, m.normalMap, m.roughnessMap, m.metalnessMap].filter(Boolean))) { t.dispose(); if (t.image && typeof t.image.close === 'function') t.image.close(); }
      m.dispose();
    }, () => {});
  }
}
// (for the tests: which models are held)
export const heldModels = () => ({ loaded: [...loading.keys()], users: Object.fromEntries(users), unused: [...unused] });
// a figure's pictures are drawn at 2048 on a computer and 1024 on a phone (budget.js): its files keep their 4096
const liteTexture = () => pictureSize('figure');
function bytesOf(spec) {
  if (!figureHere(spec.id)) return Promise.reject(new Error(`${spec.file} is not in this copy of the game`));
  // started by the page's first script, on a worker (template.html); otherwise fetched and decoded here
  const early = typeof window !== 'undefined' && (window.__PCW_LOAD_FIGURE ? window.__PCW_LOAD_FIGURE(spec.id) : window.__PCW_FIGURE_BYTES && window.__PCW_FIGURE_BYTES[spec.id]);
  if (early) return early.catch(() => bytesHere(spec));
  return bytesHere(spec);
}
// Can this copy of the game draw that figure? On the website, any; opened from a file on disk, which can fetch
// nothing beside it, only one whose bytes are written into the page.
export function figureHere(id) {
  const spec = ANIMATED[id];
  if (!spec) return false;
  try { if (typeof location !== 'undefined' && location.protocol === 'file:') return typeof window !== 'undefined' && !!window[spec.inline]; } catch (error) { /* no location: not a page */ }
  return true;
}
function bytesHere(spec) {
  const inline = typeof window !== 'undefined' && window[spec.inline];
  if (!inline && !figureHere(spec.id)) return Promise.reject(new Error(`${spec.file} is not in this copy of the game`));
  if (inline) {
    const text = atob(inline); const out = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i += 1) out[i] = text.charCodeAt(i);
    return Promise.resolve(out.buffer);
  }
  const decode = (text) => { const raw = atob(text.trim()); const out = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i); return out.buffer; };
  // the file itself where the host serves it; otherwise the same bytes written as text beside it (a figure with no
  // text copy has only the file)
  return fetch(spec.file)
    .then((r) => { if (!r.ok) throw new Error(`${spec.file}: ${r.status}`); return r.arrayBuffer(); })
    .then((b) => { if (new DataView(b).getUint32(0, true) !== 0x46546c67) throw new Error('not the file'); return b; })
    .catch((error) => { if (!spec.text) throw error; return fetch(spec.text).then((r) => { if (!r.ok) throw new Error(`${spec.text}: ${r.status}`); return r.text(); }).then(decode); });
}
export function loadAnimated(id) {
  if (!loading.has(id)) {
    const spec = ANIMATED[id];
    loading.set(id, bytesOf(spec).then((buffer) => {
      const model = modelFromGLB(parseGLB(buffer), { surface, maxTexture: liteTexture() });
      return model.ready.then(() => { const words = figureLabels(model.clips.map((c) => c.name)); return { spec, model, labels: model.clips.map((c, i) => ({ name: c.name, label: words[i] })) }; });
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

// A movement borrowed from another figure's file (figure-moves.js), as a clip for this figure's bones.
function borrowedClip(name, b) {
  const raw = atob(b.data); const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  const all = new Int16Array(bytes.buffer);
  const times = new Float32Array(b.frames);
  for (let i = 0; i < b.frames; i += 1) times[i] = (b.duration * i) / (b.frames - 1);
  const tracks = b.bones.map((bone, k) => {
    const values = new Float32Array(b.frames * 4);
    for (let i = 0; i < b.frames; i += 1) for (let c = 0; c < 4; c += 1) values[i * 4 + c] = all[(i * b.bones.length + k) * 4 + c] / 32767;
    return new THREE.QuaternionKeyframeTrack(`${boneName(bone)}.quaternion`, times, values);
  });
  return new THREE.AnimationClip(name, b.duration, tracks);
}

// A walk or a run is played where the figure is: a file that carries its figure forward (or holds it a step ahead
// of its feet) along the ground has that taken out, so that the game alone says where the figure is. Up and down
// are kept: the body still rises and falls with the stride.
function inPlace(clip, hips, rest) {
  const tracks = clip.tracks.map((t) => {
    if (t.name !== `${hips}.position`) return t;
    const values = t.values.slice();
    for (let i = 0; i < values.length; i += 3) { values[i] = rest.x; values[i + 2] = rest.z; }
    return new THREE.VectorKeyframeTrack(t.name, t.times, values);
  });
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

// the bones whose lowest says how far a lying figure has to be let down to rest on the ground
const GROUNDED = ['head', 'neck_01', 'spine_03', 'spine_01', 'pelvis', 'hand_l', 'hand_r', 'lowerarm_l', 'lowerarm_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r'];
const smooth01 = (t) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };

export function makeAnimatedRig(id, labelText, shadow = false) {
  const spec = ANIMATED[id];
  useModel(id);
  let released = false;
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
  const tmp = { a: new THREE.Vector3(), b: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Quaternion(), p: new THREE.Quaternion(), axis: new THREE.Vector3() };

  const rig = {
    animated: id, figure: id, group, body: holder, label, blob, mesh: null, triangles: 0, spec, speed: 0, idleTime: 0, phase: 0, scale: 1, stride: 1,
    torso: control(), head: { group: control() }, pelvis: { yaw: 0, roll: 0, drop: 0, sway: 0 }, gait: { hipY: 0 }, lean: 0, bank: 0,
    legL: { hip: control(), knee: control(), foot: control() }, legR: { hip: control(), knee: control(), foot: control() },
    armL: { shoulder: control(), elbow: control() }, armR: { shoulder: control(), elbow: control() },
    mixer: null, actions: new Map(), current: null, chosen: null, labels: [],
    loaded: null, bones: null, seated: false,
    // what the figure is doing over and above standing, walking or swimming: { kind, priority, name } while a clip
    // plays for it, or a movement by hand ({ kind, at, length }) for one the file has no clip for
    doing: null, byHand: null,
    // lying on the ground: { name, amount } while knocked down, with the clip that took it there (or none)
    lying: null, drop: 0,
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
    // which of the figure's own clips shows `kind` (PRIORITY), if it has one
    clipFor(kind) { const list = (spec.react && spec.react[kind]) || []; return list.find((n) => rig.actions.has(n)) || null; },
    // Something happens to the figure, or it does something: a blow lands (hit), it throws one (punch, heavy, kick,
    // shove), it talks on the phone (call). It is shown at once if nothing that matters more is being shown,
    // by the figure's own clip for it where its file has one, otherwise by moving its bones by hand.
    // Returns how it was shown: 'clip', 'hand', or null when something more important is under way.
    react(kind, { length = 0.4 } = {}) {
      const priority = PRIORITY[kind] || 1;
      if (rig.lying) return null;
      if (rig.doing && rig.doing.priority > priority && !rig.doneDoing()) return null;
      const name = rig.clipFor(kind);
      if (rig.emoting) rig.endEmote();
      if (name && rig.mixer && !rig.seated && !rig.swimming) {
        rig.doing = { kind, priority, name };
        rig.play(name, 0.12, true);
        if (rig.current) rig.current.setEffectiveTimeScale(PACE[kind] || 1);
        rig.byHand = null;
        return 'clip';
      }
      rig.byHand = { kind, at: rig.idleTime, length };
      return 'hand';
    },
    // is the clip being shown for something finished
    doneDoing() {
      if (!rig.doing) return true;
      const a = rig.actions.get(rig.doing.name);
      return !a || a !== rig.current || a.time >= a.getClip().duration - 0.05;
    },
    endDoing(fade = 0.25) {
      if (!rig.doing) return;
      const a = rig.actions.get(rig.doing.name);
      rig.doing = null;
      if (a) { a.setLoop(THREE.LoopRepeat, Infinity); a.clampWhenFinished = false; a.paused = false; }
      rig.fadeNext = fade;
    },
    endEmote() {
      const a = rig.emoting && rig.actions.get(rig.emoting.name);
      rig.emoting = null;
      if (a) { a.setLoop(THREE.LoopRepeat, Infinity); a.clampWhenFinished = false; a.paused = false; }
      if (rig.onEmoteEnd) rig.onEmoteEnd();
    },
    // Knocked off its feet (amount rising towards 1), lying there (1), and getting up (falling back to 0). `how`
    // picks among the figure's own falls: 'hard' (run down, or killed) takes the first, anything else the second
    // where there is one. Returns false for a figure with no fall of its own: it is then laid flat by hand.
    lay(amount, how = 'hard') {
      const falls = ((spec.react && spec.react.fall) || []).filter((n) => rig.actions.has(n));
      if (!rig.mixer || !falls.length) return false;
      if (amount > 0.02 && !rig.lying) {
        const name = how === 'hard' || falls.length < 2 ? falls[0] : falls[1];
        if (rig.emoting) rig.endEmote();
        rig.doing = null; rig.byHand = null;
        rig.lying = { name, amount };
        rig.play(name, 0.15, true);
        // down on the ground in a little over two seconds, however long the file's fall is: a knock-down lasts
        // only a few seconds, and a slow fall would still be on its way down when it was time to get up
        if (rig.current) rig.current.setEffectiveTimeScale(Math.max(PACE.fall, rig.current.getClip().duration / 2.2));
      }
      if (rig.lying) {
        rig.lying.amount = amount;
        // up again: back to standing, and the body raised as it comes
        if (amount < 0.02) { const a = rig.actions.get(rig.lying.name); rig.lying = null; if (a) { a.setLoop(THREE.LoopRepeat, Infinity); a.clampWhenFinished = false; } rig.fadeNext = 0.5; }
      }
      return true;
    },
    // in a seat: the sitting pose from the supplied woman's own sit animation, the hips on the seat and both
    // hands forward on the handlebars or the wheel. Nothing is changed in the file: the bones are posed.
    seat(on = true) {
      rig.seated = on;
      if (!on) { lift.position.set(0, 0, 0); return; }
      if (!rig.bones) return;
      const pose = seatFor(spec.file) || SEAT_POSE;
      for (const [name, q] of Object.entries(pose)) { const b = rig.bones.get(boneName(name)); if (b) b.quaternion.fromArray(q); }
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
      if (!rig.actions.has(name) || rig.lying) return false;
      if (rig.doing && rig.doing.priority > PRIORITY.skill && !rig.doneDoing()) return false;
      rig.doing = null;
      rig.emoting = { name, at: rig.idleTime };
      rig.play(name, 0.3, true);
      return true;
    },
    // what this figure can do: every clip in its file, by its one-word name and how long it lasts
    clips() { return rig.labels.map(({ name, label }) => ({ name, label, duration: rig.actions.has(name) ? rig.actions.get(name).getClip().duration : 0 })); },
    // After the clips have been played this frame: a movement by hand for something the file has no clip for,
    // and a lying figure let down onto the ground.
    afterClips(dt) {
      const h = rig.byHand;
      if (h && rig.bones) {
        const t = (rig.idleTime - h.at) / h.length;
        if (t >= 1 || t < 0) rig.byHand = null;
        else byHand(h.kind, Math.sin(Math.PI * t));
      }
      // a figure whose file's falls turn the body over without lowering it is let down until its lowest part rests
      // on the ground; one whose falls come down by themselves needs nothing, and is given nothing
      let want = 0;
      if (rig.lying && rig.bones) {
        holder.updateMatrixWorld(true);
        let low = Infinity;
        for (const n of GROUNDED) { const b = rig.bones.get(n); if (b) { holder.worldToLocal(b.getWorldPosition(tmp.a)); low = Math.min(low, tmp.a.y - lift.position.y); } }
        if (low < Infinity) want = Math.min(0, 0.09 - low);
      }
      rig.drop += (want - rig.drop) * Math.min(1, dt * (want < rig.drop ? 14 : 3));
      if (Math.abs(rig.drop) < 1e-4) rig.drop = 0;
      if (!rig.seated) lift.position.y = rig.drop;
    },
    dispose() { if (rig.mixer) rig.mixer.stopAllAction(); blob.geometry.dispose(); blob.material.dispose(); if (label) { label.material.map.dispose(); label.material.dispose(); } if (!released) { released = true; releaseModel(id); } },
  };

  // Turns a bone about an axis given in the figure's own frame (x its left, y up, z ahead), on top of its pose.
  function bend(name, axis, angle) {
    const b = rig.bones.get(name);
    if (!b || !angle) return;
    holder.updateMatrixWorld(true);
    tmp.axis.copy(axis).transformDirection(holder.matrixWorld);
    tmp.q.setFromAxisAngle(tmp.axis, angle);
    b.getWorldQuaternion(tmp.w);
    tmp.w.premultiply(tmp.q);
    b.parent.getWorldQuaternion(tmp.p);
    b.quaternion.copy(tmp.p.invert().multiply(tmp.w));
    b.updateMatrixWorld(true);
  }
  const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
  // A movement made by hand, `k` from 0 to 1 and back: for a figure whose file has no clip for it.
  function byHand(kind, k) {
    if (kind === 'hit' || kind === 'flinch') {
      // struck: the head snaps back, the chest goes with it, a little to one side
      bend('spine_02', X, -0.16 * k); bend('spine_03', X, -0.2 * k); bend('neck_01', X, -0.16 * k); bend('head', X, -0.3 * k); bend('spine_03', Z, 0.08 * k);
    } else if (kind === 'punch' || kind === 'heavy' || kind === 'shove' || kind === 'grab') {
      // the right arm thrown out at the chest of someone in front, the shoulders turning into it
      const H = spec.height;
      bend('spine_03', Y, (kind === 'heavy' ? 0.42 : 0.28) * k);
      const target = holder.localToWorld(tmp.b.set(-0.06 * H, 0.78 * H, (0.25 + 0.3 * k) * H));
      const pole = holder.localToWorld(tmp.a.set(-1, -0.4, -0.3)).sub(holder.localToWorld(new THREE.Vector3()));
      const before = new Map(['upperarm_r', 'lowerarm_r', 'hand_r'].map((n) => [n, rig.bones.get(n) && rig.bones.get(n).quaternion.clone()]));
      reach(rig.bones.get('upperarm_r'), rig.bones.get('lowerarm_r'), rig.bones.get('hand_r'), target, pole);
      // eased in and out from where the clip had the arm
      for (const [n, q] of before) { const b = rig.bones.get(n); if (b && q) { const done = b.quaternion.clone(); b.quaternion.copy(q).slerp(done, Math.min(1, k * 1.6)); b.updateMatrixWorld(true); } }
      if (kind === 'shove') { bend('spine_02', X, 0.15 * k); }
    } else if (kind === 'kick') {
      // the right leg swung up in front
      bend('thigh_r', X, -1.1 * k); bend('calf_r', X, 0.5 * k * (1 - k)); bend('spine_02', X, -0.12 * k);
    } else if (kind === 'dodge' || kind === 'block') {
      bend('spine_02', X, -0.12 * k); bend('spine_03', Z, -0.18 * k);
    }
  }

  rig.loaded = loadAnimated(id).catch((error) => { rig.failed = String(error && error.message || error); throw error; }).then(({ model, labels }) => {
    const { root, mesh } = model.figure();
    mesh.castShadow = shadow;
    const k = spec.height / model.height;
    root.scale.setScalar(k);
    lift.add(root);
    rig.bones = new Map(); root.traverse((o) => { if (o.isBone) rig.bones.set(o.name, o); });
    // a Mixamo file's bones answer to the Unreal names the rest of the game reaches for
    if (spec.rig === 'mixamo') for (const [ue, mx] of Object.entries(MIXAMO)) { const b = rig.bones.get(boneName(`mixamorig:${mx}`)); if (b && !rig.bones.has(ue)) rig.bones.set(ue, b); }
    rig.mesh = mesh; rig.triangles = model.triangles; rig.labels = labels;
    rig.mixer = new THREE.AnimationMixer(root);
    const hips = spec.rig === 'mixamo' ? boneName('mixamorig:Hips') : 'pelvis';
    const hipBone = rig.bones.get(hips);
    const rest = hipBone ? hipBone.position.clone() : new THREE.Vector3();
    for (let clip of model.clips) {
      if (spec.rig === 'mixamo' && (clip.name === spec.walk || clip.name === spec.run)) clip = inPlace(clip, hips, rest);
      const a = rig.mixer.clipAction(clip); a.setLoop(THREE.LoopRepeat, Infinity); rig.actions.set(clip.name, a);
    }
    // what the file lacks, borrowed (not offered as a skill: it is not the figure's own)
    for (const [as, b] of Object.entries(borrowedFor(spec.file))) { const a = rig.mixer.clipAction(borrowedClip(`~${as}`, b)); a.setLoop(THREE.LoopRepeat, Infinity); rig.actions.set(`~${as}`, a); }
    // (a clip chosen for another figure that this one does not have: it stands instead)
    const first = rig.chosen && rig.actions.has(rig.chosen) ? rig.chosen : spec.still;
    rig.chosen = null; rig.play(first, 0);
    return rig;
  });
  rig.loaded.catch(() => { /* (the figure stays an empty place; rig.failed says why) */ });
  return rig;
}

// In the town: standing, walking or running by how fast the figure is going, the walk and run played at the pace
// they are walked. On the selection screen the player's own choice plays instead (`rig.held`).
export function driveAnimated(rig, dt, speed) {
  rig.speed += (speed - rig.speed) * Math.min(1, dt * 6.5);
  if (!rig.mixer) return;
  rig.idleTime += dt;
  // on the ground: the fall plays to its end and stays there until the figure is got up
  if (rig.lying) { rig.mixer.update(dt); rig.afterClips(dt); return; }
  // something shown for a blow or a call: it runs to its end; walking off, or getting into a seat or the water, ends it
  if (rig.doing) {
    if (rig.held || rig.swimming || rig.seated || (speed > 1.0 && rig.doing.priority < PRIORITY.fall) || rig.doneDoing()) rig.endDoing();
    else { rig.mixer.update(dt); rig.afterClips(dt); return; }
  }
  // a skill being played: it runs to its end where the figure stands; moving off ends it at once
  if (rig.emoting) {
    const a = rig.actions.get(rig.emoting.name);
    const done = !a || a !== rig.current || a.time >= a.getClip().duration - 0.04;
    if (rig.held || rig.swimming || rig.seated || speed > 0.35 || done) {
      // back to going round, so that a clip that is also the standing one (Agree) does not stay on its last frame
      if (a && done && a === rig.current) a.reset();
      rig.endEmote();
    }
    else { rig.mixer.update(dt); rig.afterClips(dt); return; }
  }
  const fade = rig.fadeNext || 0.25; rig.fadeNext = 0;
  if (!rig.held && rig.swimming) {
    // in the river: the file's own swim (or one borrowed), slower when drifting and quicker with the stroke held
    rig.play(rig.spec.swim || 'swim.001', 0.4);
    if (rig.current) rig.current.setEffectiveTimeScale(Math.max(0.45, Math.min(1.4, 0.45 + rig.speed / 1.6)));
  } else if (!rig.held) {
    const v = rig.speed, s = rig.spec;
    const want = v > 3.0 ? s.run : v > 0.25 ? s.walk : s.still;
    rig.play(want, fade);
    if (rig.current) rig.current.setEffectiveTimeScale(want === s.run ? Math.max(0.6, v / s.runSpeed) : want === s.walk ? Math.max(0.5, v / s.walkSpeed) : 1);
  }
  rig.mixer.update(dt);
  rig.afterClips(dt);
}
