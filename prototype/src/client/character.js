// A character: the base model's skeleton, with the parts a person is made of
// skinned to it and joined into one mesh.
//
// What someone is made of comes from a spec (see ../sim/characters.js): a
// list of kit parts, the colours and prints for each, a build, a face and a
// height. Every character shares the one skeleton, so one set of movements
// serves them all.
//
// The skeleton has two standing poses. 'base' is how the supplied character
// was bound, arms out and feet wide to suit its big hoodie and shoes; its own
// clothes are worn in that pose. 'natural' is the same bones standing
// ordinarily, and is what all the tailored clothing is cut for.
//
// The figure keeps the handles the rest of the client already drives: hips,
// knees, shoulders, elbows, a torso that leans and a head that turns. Each
// is a plain rotation; they are turned into bone rotations just before the
// figure is placed in the world.

import { REACTIONS, REACTION_FPS } from './reaction-data.js';
import { linear, nameTexture, surface } from './render-kit.js';
import { kitPart, kitBones, kitPose, kitIdle, figureMeta, KIT_SHADE_ONE } from './character-kit.js';
import { characterSpec, configFromLook } from '../sim/characters.js';
import { printTexture } from './character-looks.js';
import { gaitPose } from './gait.js';
import { ANIMATED, makeAnimatedRig, driveAnimated } from './animated.js';

// ---------------------------------------------------------------- skeleton --

const templates = new Map();
// A supplied figure stands on the same skeleton with its own measures above the hips (tools/characters/figures.py):
// those bones take the figure's own place and turn, so that its body stands as it was baked.
function skeletonTemplate(pose = 'base', figure = null) {
  const key = figure ? `${pose}|${figure}` : pose;
  let T = templates.get(key);
  if (T) return T;
  const bones = kitBones();
  const local = { ...kitPose(pose) };
  const own = figure && figureMeta(figure);
  if (own) {
    local.t = local.t.map((t, i) => (own.bones[bones[i].name] ? own.bones[bones[i].name].t : t));
    local.q = local.q.map((q, i) => (own.bones[bones[i].name] ? own.bones[bones[i].name].q : q));
  }
  const index = new Map(bones.map((b, i) => [b.name, i]));
  const rest = bones.map((b, i) => ({ name: b.name, parent: b.parent, t: new THREE.Vector3(...local.t[i]), q: new THREE.Quaternion(...local.q[i]) }));
  // each bone's rotation in the model's own space, standing in this pose
  const world = [];
  rest.forEach((b, i) => { world[i] = b.parent < 0 ? b.q.clone() : world[b.parent].clone().multiply(b.q); });
  rest.forEach((b, i) => { b.world = world[i]; b.unworld = world[i].clone().invert(); });
  const inverses = bones.map((b) => new THREE.Matrix4().fromArray(b.ibm));
  T = { rest, index, inverses, idle: kitIdle() };
  templates.set(key, T);
  return T;
}

function makeBones(pose, figure = null) {
  const T = skeletonTemplate(pose, figure);
  const bones = T.rest.map((b) => { const bone = new THREE.Bone(); bone.name = b.name; bone.position.copy(b.t); bone.quaternion.copy(b.q); return bone; });
  T.rest.forEach((b, i) => { if (b.parent >= 0) bones[b.parent].add(bones[i]); });
  return { bones, skeleton: new THREE.Skeleton(bones, T.inverses), root: bones[0], template: T };
}

// --------------------------------------------------------------- materials --

let plain = null;
const printed = new Map();
function materialFor(print) {
  if (!print) return plain || (plain = surface({ vertexColors: true, skinning: true, roughness: 0.8, metalness: 0, side: THREE.DoubleSide }));
  let m = printed.get(print);
  if (!m) { m = surface({ vertexColors: true, skinning: true, roughness: 0.86, metalness: 0, side: THREE.DoubleSide, map: printTexture(print) }); printed.set(print, m); }
  return m;
}

// ---------------------------------------------------------------- geometry --

const colourCache = new Map();
const colourOf = (hex) => { let c = colourCache.get(hex); if (!c) { c = linear(hex); colourCache.set(hex, c); } return c; };
const WHITE = 0xffffff;
const bump = (v, centre, width) => Math.exp(-(((v - centre) / width) ** 2));
const ramp = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

let trunkBones = null;
function boneGroups() {
  if (trunkBones) return trunkBones;
  const index = skeletonTemplate('base').index;
  // A few points on top of each shoulder of the supplied model's hidden skin were bound to the hand. With the
  // arm hanging it does not show; with the elbow bent they are dragged out into spikes. They are bound to the
  // collar bone here, as they are read: the supplied model itself is not changed.
  const stray = new Map();
  for (const s of ['L', 'R']) for (const name of ['Forearm', 'Hand']) stray.set(index.get(`${name}_${s}`), index.get(`Clavicle_${s}`));
  trunkBones = { trunk: new Set(['Hips', 'Spine', 'Chest'].map((n) => index.get(n))), head: index.get('Head'), stray };
  return trunkBones;
}

// Joins the parts of a spec into one skinned geometry, painted with its colours and shaped to its build and face.
export function buildGeometry(spec) {
  const lod = spec.lod || 0;
  const parts = spec.parts.map((p) => ({ ...p, data: kitPart(p.id, lod) }));
  let vertices = 0;
  for (const p of parts) vertices += p.data.count;
  const position = new Float32Array(vertices * 3);
  const normal = new Float32Array(vertices * 3);
  const uv = new Float32Array(vertices * 2);
  const colour = new Float32Array(vertices * 3);
  const skinIndex = new Uint16Array(vertices * 4);
  const skinWeight = new Float32Array(vertices * 4);
  const slots = new Uint8Array(vertices);           // what colours each vertex, kept for the checks
  const buckets = new Map();        // material -> triangles
  const body = spec.body || {};
  const wide = body.wide || 1, deep = body.deep || 1, belly = body.belly || 0, fem = body.female || 0;
  const shaped = wide !== 1 || deep !== 1 || belly !== 0 || fem !== 0;
  const face = spec.face || null;
  const groups = boneGroups();
  let at = 0;
  let triangles = 0;
  for (const p of parts) {
    const d = p.data;
    const own = p.colours || {};
    const tint = [spec.skin, spec.hair, spec.lips, 0xe9e4d8, 0x120f0d, spec.skin, spec.brow === undefined ? spec.hair : spec.brow, spec.iris || 0x2e1c12, own.a, own.b === undefined ? own.a : own.b, own.c === undefined ? own.a : own.c, own.d === undefined ? own.a : own.d];
    const prints = p.prints || {};
    const printOf = [null, null, null, null, null, null, null, null, prints.a || null, prints.b || null, prints.c || null, prints.d || null];
    for (let i = 0; i < d.count; i += 1) {
      const o = (at + i) * 3;
      let x = d.pos[i * 3], y = d.pos[i * 3 + 1], z = d.pos[i * 3 + 2];
      let tw = 0, hw = 0;
      for (let k = 0; k < 4; k += 1) {
        let j = d.joints[i * 4 + k];
        const w = d.weights[i * 4 + k] / 255;
        if (!spec.figure && y > 1.33 && x > -0.26 && x < 0.26 && groups.stray.has(j)) j = groups.stray.get(j);
        skinIndex[(at + i) * 4 + k] = j; skinWeight[(at + i) * 4 + k] = w;
        if (groups.trunk.has(j)) tw += w; else if (j === groups.head) hw += w;
      }
      if (shaped && tw > 0.02) {
        // the build: wider and deeper in the trunk; a belly; and for a woman narrower shoulders, a waist, hips and a bust
        let sx = wide, sz = deep, dz = 0;
        if (belly && z > 0) dz += belly * bump(y, 1.10, 0.11) * Math.min(1, z / 0.06);
        if (fem) {
          sx *= 1 - 0.065 * fem * ramp(1.34, 1.44, y);
          const waist = 1 - 0.085 * fem * bump(y, 1.09, 0.07);
          sx *= waist * (1 + 0.07 * fem * bump(y, 0.93, 0.085)); sz *= waist;
          if (z < 0) sz *= 1 + 0.10 * fem * bump(y, 0.93, 0.08);
          if (z > 0.02) dz += 0.028 * fem * bump(y, 1.272, 0.052) * bump(Math.abs(x), 0.068, 0.06);
        }
        x += x * (sx - 1) * tw; z += (z * (sz - 1) + dz) * tw;
      }
      if (face && hw > 0.5 && y > 1.53) {
        // the face: the same field moves everything on the head, so a beard or a pair of glasses follows the jaw and nose under it
        const front = ramp(0.03, 0.09, z);
        x *= 1 + face.jaw * bump(y, 1.583, 0.034) * hw;
        y -= face.chin * 8 * bump(y, 1.556, 0.02) * front * 0.125;
        const nose = bump(y, 1.618, 0.022) * bump(z, 0.165, 0.03);
        x *= 1 + face.nose * nose;
        if (z > 0.135) z += face.lips * bump(y, 1.582, 0.014) * bump(x, 0, 0.03);
        x += Math.sign(x) * face.cheek * bump(y, 1.615, 0.03) * bump(z, 0.10, 0.05);
        if (y < 1.66) y += face.long * (y - 1.66) * front;
      }
      position[o] = x; position[o + 1] = y; position[o + 2] = z;
      normal[o] = d.nrm[i * 3]; normal[o + 1] = d.nrm[i * 3 + 1]; normal[o + 2] = d.nrm[i * 3 + 2];
      uv[(at + i) * 2] = d.uv[i * 2]; uv[(at + i) * 2 + 1] = d.uv[i * 2 + 1];
      const slot = d.slot[i];
      slots[at + i] = slot;
      const shade = d.shade[i] / KIT_SHADE_ONE;
      const c = colourOf(printOf[slot] ? WHITE : tint[slot] === undefined ? 0x808080 : tint[slot]);
      colour[o] = c.r * shade; colour[o + 1] = c.g * shade; colour[o + 2] = c.b * shade;
    }
    for (let t = 0; t < d.triangles; t += 1) {
      const a = d.idx[t * 3], b = d.idx[t * 3 + 1], c = d.idx[t * 3 + 2];
      const key = printOf[d.slot[a]] || '';
      let bucket = buckets.get(key);
      if (!bucket) { bucket = []; buckets.set(key, bucket); }
      bucket.push(a + at, b + at, c + at);
    }
    at += d.count;
    triangles += d.triangles;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(colour, 3));
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  const index = vertices > 65535 ? new Uint32Array(triangles * 3) : new Uint16Array(triangles * 3);
  const materials = [];
  let start = 0;
  for (const [key, bucket] of [...buckets.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    index.set(bucket, start);
    geometry.addGroup(start, bucket.length, materials.length);
    materials.push(materialFor(key || null));
    start += bucket.length;
  }
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.userData.slots = slots;
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.95, 0), 1.6);
  geometry.boundingBox = new THREE.Box3(new THREE.Vector3(-1.1, -0.2, -1.1), new THREE.Vector3(1.1, 2.2, 1.1));
  return { geometry, materials, triangles, vertices };
}

// ------------------------------------------------------------------ figure --

const control = () => ({ rotation: { x: 0, y: 0, z: 0 } });
const stillHips = () => ({ yaw: 0, roll: 0, drop: 0, sway: 0 });
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
const D = new THREE.Quaternion(), D2 = new THREE.Quaternion(), BASE = new THREE.Quaternion();

// Sets a bone to its standing rotation turned by (x, y, z) about the model's own axes.
function turn(rig, i, x, y, z, base) {
  const T = rig.template.rest[i];
  D.setFromAxisAngle(AX, x);
  if (y) { D2.setFromAxisAngle(AY, y); D.premultiply(D2); }
  if (z) { D2.setFromAxisAngle(AZ, z); D.premultiply(D2); }
  rig.bones[i].quaternion.copy(base || T.q).multiply(T.unworld).multiply(D).multiply(T.world);
}

const IDLE_A = new THREE.Quaternion(), IDLE_B = new THREE.Quaternion();
function idleRotation(T, name, time) {
  const idle = T.idle;
  const track = idle && idle.tracks[name];
  if (!track) return null;
  const n = track.length / 4;
  const f = ((time % idle.length) / idle.length) * n;
  const i = Math.floor(f) % n, j = (i + 1) % n;
  IDLE_A.fromArray(track, i * 4); IDLE_B.fromArray(track, j * 4);
  return BASE.copy(IDLE_A).slerp(IDLE_B, f - Math.floor(f));
}

// Turns the handles into bone rotations. The supplied idle clip (a breath and a slight shift of weight) runs underneath.
const SHIFT = new THREE.Vector3();
function applyPose(rig) {
  const T = rig.template, b = T.index, t = rig.idleTime;
  const idle = (name) => (rig.pose === 'base' ? idleRotation(T, name, t) : null);
  const sway = rig.pose === 'base' ? 0 : Math.sin((t / 4) * Math.PI * 2);
  const torso = rig.torso.rotation, head = rig.head.group.rotation, pelvis = rig.pelvis;
  // the hips carry everything: they ride up and down, shift over the standing foot, turn and tip
  const hips = b.get('Hips'), root = T.rest[hips].parent;
  SHIFT.set(pelvis.sway, pelvis.drop, 0);
  if (root >= 0) SHIFT.applyQuaternion(T.rest[root].unworld);
  rig.bones[hips].position.copy(T.rest[hips].t).add(SHIFT);
  turn(rig, hips, 0, pelvis.yaw, pelvis.roll, null);
  turn(rig, b.get('Spine'), (torso.x + rig.stoop) * 0.6 + sway * 0.006, torso.y * 0.5, torso.z * 0.5 + sway * 0.004, idle('Spine'));
  turn(rig, b.get('Chest'), (torso.x + rig.stoop) * 0.4 + sway * 0.007, torso.y * 0.5, torso.z * 0.5, idle('Chest'));
  turn(rig, b.get('Neck'), head.x * 0.4 - rig.stoop * 0.5, head.y * 0.4, head.z * 0.4, null);
  turn(rig, b.get('Head'), head.x * 0.6 - sway * 0.01, head.y * 0.6, head.z * 0.6, idle('Head'));
  // the old figure's "left" was at -x: the model's right
  for (const [leg, arm, s, sign] of [[rig.legL, rig.armL, 'R', -1], [rig.legR, rig.armR, 'L', 1]]) {
    const hip = leg.hip.rotation, knee = leg.knee.rotation, sh = arm.shoulder.rotation, el = arm.elbow.rotation;
    // the legs hang from the hips but answer to the ground: what the hips turn, the thighs turn back
    turn(rig, b.get(`Thigh_${s}`), hip.x, -pelvis.yaw, hip.z * sign - pelvis.roll, null);
    turn(rig, b.get(`Shin_${s}`), knee.x, 0, 0, null);
    turn(rig, b.get(`Foot_${s}`), leg.foot.rotation.x, 0, 0, null);
    if (rig.still.has(s)) { turn(rig, b.get(`UpperArm_${s}`), 0, 0, 0, null); turn(rig, b.get(`Forearm_${s}`), 0, 0, 0, null); continue; }
    turn(rig, b.get(`UpperArm_${s}`), sh.x, 0, sh.z * sign - sway * 0.008 * sign, idle(`UpperArm_${s}`));
    turn(rig, b.get(`Forearm_${s}`), el.x, 0, 0, null);
  }
  const breath = T.idle && T.idle.breath;
  if (breath) { const n = breath.length; const f = ((t % T.idle.length) / T.idle.length) * n; const i = Math.floor(f) % n; const k = breath[i] + (breath[(i + 1) % n] - breath[i]) * (f - Math.floor(f)); rig.bones[b.get('Chest')].scale.set(k, k, 1); }
}

// ------------------------------------------------------------- reactions --
// The supplied figures' own animations, carried onto this skeleton (tools/characters/retarget.mjs): a
// townsperson who cries, cowers, falls, boxes or waves plays one of these over their ordinary pose.
// `rig.reaction` is { name, time, weight }: which, how far into it in seconds, and how much of it shows
// (fading in and out, so it never snaps).
const decoded = new Map();
function reactionClip(name) {
  let c = decoded.get(name);
  if (c) return c;
  const r = REACTIONS[name];
  if (!r) return null;
  const index = skeletonTemplate('base').index;
  const tracks = r.rot.map((b64) => { const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i); const ints = new Int16Array(bytes.buffer); return Float32Array.from(ints, (v) => v / 32767); });
  c = { length: r.length, frames: r.frames, bones: r.bones.map((n) => index.get(n)), tracks, rise: Float32Array.from(r.rise, (v) => v / 1000), hips: index.get('Hips') };
  decoded.set(name, c);
  return c;
}
export const reactionNames = () => Object.keys(REACTIONS);
export const reactionLength = (name) => (REACTIONS[name] ? REACTIONS[name].length : 0);
const RQ = new THREE.Quaternion(), RQ2 = new THREE.Quaternion(), RISE = new THREE.Vector3();
function applyReaction(rig) {
  const { name, time, weight, loop, upper } = rig.reaction;
  const c = reactionClip(name);
  if (!c) return;
  if (!c.lower) c.lower = new Set(['Hips', 'Thigh_L', 'Thigh_R', 'Shin_L', 'Shin_R', 'Foot_L', 'Foot_R', 'Toe_L', 'Toe_R'].map((n) => rig.template.index.get(n)));
  const span = c.frames - 1;
  let f = (time * REACTION_FPS);
  f = loop ? f % span : Math.min(span, Math.max(0, f));
  const i = Math.floor(f), j = Math.min(span, i + 1), k = f - i;
  const w = Math.min(1, weight);
  for (let b = 0; b < c.bones.length; b += 1) {
    const bi = c.bones[b]; if (bi === undefined) continue;
    if (upper && c.lower.has(bi)) continue;       // sitting, or walking: only the body above the hips
    const t = c.tracks[b];
    RQ.fromArray(t, i * 4); RQ2.fromArray(t, j * 4); RQ.slerp(RQ2, k).normalize();
    rig.bones[bi].quaternion.slerp(RQ, w);
  }
  if (upper) return;
  const rise = c.rise[i] + (c.rise[j] - c.rise[i]) * k;
  const T = rig.template, root = T.rest[c.hips].parent;
  RISE.set(0, rise * w, 0);
  if (root >= 0) RISE.applyQuaternion(T.rest[root].unworld);
  rig.bones[c.hips].position.add(RISE);
}

// Builds a figure from a spec. `shadow` says whether it casts a real shadow.
export function makeFigure(spec, labelText, shadow = false) {
  const { geometry, materials, triangles } = buildGeometry(spec);
  const pose = spec.pose || 'base';
  const own = spec.figure ? figureMeta(spec.figure) : null;
  const { bones, skeleton, root, template } = makeBones(pose, own ? spec.figure : null);
  const index = template.index;
  bones[index.get('Head')].scale.setScalar(spec.headScale || 1);
  const body = spec.body || {};
  if (body.female && pose === 'natural') for (const s of ['L', 'R']) bones[index.get(`UpperArm_${s}`)].position.y -= 0.012 * body.female;      // narrower shoulders
  if (pose === 'natural' && body.wide) {
    // thicker or thinner limbs with the build; hands and feet keep their size
    const k = 1 + (body.wide - 1) * 0.7 - (body.female ? 0.05 : 0);
    for (const s of ['L', 'R']) {
      for (const name of ['UpperArm', 'Thigh']) bones[index.get(`${name}_${s}`)].scale.set(k, 1, k);
      for (const name of ['Hand', 'Foot']) bones[index.get(`${name}_${s}`)].scale.set(1 / k, 1, 1 / k);
    }
  }
  const mesh = new THREE.SkinnedMesh(geometry, materials.length === 1 ? materials[0] : materials);
  mesh.add(root);
  mesh.bind(skeleton, new THREE.Matrix4());
  mesh.castShadow = shadow;
  const group = new THREE.Group();
  const holder = new THREE.Group();
  holder.add(mesh);
  group.add(holder);
  const scale = (spec.scale || 1) * (own ? own.scale : 1);
  group.scale.setScalar(scale);

  let label = null;
  if (labelText) {
    const texture = nameTexture(labelText);
    label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    label.scale.set(0.95 / scale, 0.18 / scale, 1);
    label.position.set(0, 2.14 + (1 - scale) * 0.4, 0);
    label.visible = false;
    group.add(label);
  }
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.4, 18), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.13, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.09;
  group.add(blob);

  const rig = {
    group, body: holder, mesh, bones, skeleton, template, pose, label, blob, spec, triangles,
    torso: control(), head: { group: control() }, pelvis: stillHips(), gait: { hipY: 0 }, lean: 0, bank: 0, quirk: Math.random() * 100,
    legL: { hip: control(), knee: control(), foot: control() }, legR: { hip: control(), knee: control(), foot: control() },
    armL: { shoulder: control(), elbow: control() }, armR: { shoulder: control(), elbow: control() },
    stoop: spec.stoop || 0, figure: spec.figure || null,
    // a figure whose hand rests on its body keeps that arm still: swung, the hand would leave what it holds
    still: new Set(own ? own.stillArms : []),
    scale, stride: spec.stride || 1, phase: Math.random(), workPhase: Math.random() * 6, idleTime: Math.random() * 4, speed: 0, working: false,
    dispose() { geometry.dispose(); skeleton.dispose(); blob.geometry.dispose(); blob.material.dispose(); if (label) { label.material.map.dispose(); label.material.dispose(); } },
  };
  // the handles become bone rotations whenever the figure is about to be placed in the world
  const place = group.updateMatrixWorld;
  group.updateMatrixWorld = function updateMatrixWorld(force) { applyPose(rig); if (rig.reaction && rig.reaction.weight > 0.001) applyReaction(rig); place.call(this, force); };
  return rig;
}

// The figure for a `look`, which is how the simulation describes a person. `lod` is 0 for the player, 1 near, 2 further off.
export function makeCharacter(look, labelText, shadow = false, lod = 0) {
  // a supplied figure with its own skeleton and animations is drawn as it came
  if (look && look.figure && ANIMATED[look.figure]) return makeAnimatedRig(look.figure, labelText, shadow);
  return makeFigure(characterSpec(configFromLook(look), lod), labelText, shadow);
}

// Moves a figure for one frame. `speed` is how fast it is going over the ground, in metres a second;
// `turning` how fast it is turning, in radians a second (the player's own figure leans into a turn).
// The walk and the run themselves are in gait.js; this puts their answer onto the figure's handles, and
// adds what a person does when not going anywhere: the weight moving from foot to foot, a look to one side.
const GAIT = {};
export function animateCharacter(actor, dt, speed, working, turning = 0) {
  if (actor.animated) { driveAnimated(actor, dt, speed); return; }
  const before = actor.speed;
  // a body has weight: it gathers speed, and loses it a little faster
  actor.speed += (speed - actor.speed) * Math.min(1, dt * (speed > actor.speed ? 6.5 : 9));
  actor.idleTime += dt;
  // from a standstill the first step starts with the feet together, not wherever the last walk left them
  if (before < 0.06 && actor.speed >= 0.06) actor.phase = 0.3;
  const v = actor.speed / (actor.scale || 1);
  const g = gaitPose(actor.hold === undefined ? actor.phase : actor.hold, v, actor.stride, dt, actor.gait, GAIT);
  actor.phase = (actor.phase + dt * g.rate) % 1;
  actor.stepRate = g.rate * 2;
  const still = 1 - Math.min(1, v / 0.5);
  const t = actor.idleTime + actor.quirk;

  // legs: the thigh and shin lean forward by what gait.js found; a turn about X swings a leg back, so the sign changes
  for (const [leg, side] of [[actor.legL, 'L'], [actor.legR, 'R']]) {
    leg.hip.rotation.x = -g[`thigh${side}`];
    leg.knee.rotation.x = -g[`shin${side}`] - leg.hip.rotation.x;
    leg.foot.rotation.x = g[`foot${side}`] + g[`shin${side}`];
    leg.hip.rotation.z = 0;
  }
  // hips: standing still, the weight drifts from one foot to the other and back
  const shift = Math.sin(t * 0.83) * still;
  actor.pelvis.yaw = g.hipYaw;
  actor.pelvis.roll = g.hipRoll + shift * 0.012;
  actor.pelvis.drop = g.hipDrop;
  actor.pelvis.sway = g.sway + shift * 0.009;

  // leaning: forward with speed and with gathering it, back when stopping short, and into a turn
  const push = Math.max(-0.1, Math.min(0.12, (speed - actor.speed) * 0.035));
  actor.lean += (g.lean + push - actor.lean) * Math.min(1, dt * 8);
  const bank = Math.max(-0.16, Math.min(0.16, -turning * v * 0.03));
  actor.bank += (bank - actor.bank) * Math.min(1, dt * 6);

  const head = actor.head.group.rotation;
  if (working) {
    actor.workPhase += dt * 7;
    const s = Math.sin(actor.workPhase), c = Math.cos(actor.workPhase);
    actor.armL.shoulder.rotation.x = -1.05 + s * 0.42;
    actor.armR.shoulder.rotation.x = -1.05 + Math.sin(actor.workPhase + 0.9) * 0.42;
    actor.armL.elbow.rotation.x = -0.75 - c * 0.3;
    actor.armR.elbow.rotation.x = -0.75 - Math.cos(actor.workPhase + 0.9) * 0.3;
    actor.armL.shoulder.rotation.z = 0; actor.armR.shoulder.rotation.z = 0;
    actor.torso.rotation.x = 0.24 + s * 0.03;
    actor.torso.rotation.y = s * 0.05;
    actor.torso.rotation.z = 0;
    head.x = -0.1; head.y = 0; head.z = 0;
  } else {
    // arms hang with a little give at the elbow, and are never quite still
    const hang = Math.sin(t * 0.61) * 0.02 * still;
    actor.armL.shoulder.rotation.x = g.armL + hang;
    actor.armR.shoulder.rotation.x = g.armR - hang;
    // the base model was bound with its forearms held a little forward; gait.js counts the elbow's bend from straight
    const straighten = (actor.pose === 'base' ? 0.42 : 0.12) * g.weight;
    actor.armL.elbow.rotation.x = g.elbowL + straighten - 0.06 * still;
    actor.armR.elbow.rotation.x = g.elbowR + straighten - 0.06 * still;
    actor.armL.shoulder.rotation.z = g.armOut; actor.armR.shoulder.rotation.z = g.armOut;
    // the chest is asked for a turn against the hips; it sits on them, so their turn is taken off first
    actor.torso.rotation.x = actor.lean;
    actor.torso.rotation.y = g.chestYaw - g.hipYaw;
    actor.torso.rotation.z = g.chestRoll - actor.pelvis.roll + actor.bank * 0.6;
    // the head stays on where the body is going; at rest it now and then looks about
    const look = Math.sin(t * 0.19) * Math.sin(t * 0.071 + 1.3);
    head.y = g.headYaw + look * 0.22 * still;
    head.x = g.headPitch + Math.sin(t * 0.13) * 0.03 * still;
    head.z = -(g.chestRoll + actor.bank * 0.6) * 0.8;
  }
  actor.body.rotation.z = actor.bank * 0.4;
  actor.group.position.y = 0;
  actor.blob.position.y = 0.09;
}

// A name over someone's head comes and goes: it fades in as the player comes near and out as they move off.
export function showName(rig, wanted, dt) {
  const label = rig && rig.label;
  if (!label) return;
  const m = label.material;
  m.opacity += ((wanted ? 1 : 0) - m.opacity) * Math.min(1, dt * 9);
  label.visible = m.opacity > 0.03;
}

// Lays a figure on the ground, or stands it up again: `amount` runs from 0 (upright) to 1 (flat on its back,
// where it was standing). Someone knocked down by a vehicle goes down fast and gets up slower.
// A supplied figure whose file has a fall of its own falls with it instead, and is let down onto the ground
// (animated.js); `how` says which of its falls: 'hard' (run down, killed) or 'soft'.
export function layCharacter(actor, amount, how = 'hard') {
  if (actor.animated && actor.lay && actor.lay(amount, how)) { actor.body.rotation.x = 0; actor.body.position.set(0, 0, 0); if (amount > 0.5) actor.blob.visible = false; return; }
  const a = Math.max(0, Math.min(1, amount));
  actor.body.rotation.x = -Math.PI / 2 * a;
  actor.body.position.set(0, 0.14 * a, 0.85 * a);
  if (a > 0.5) actor.blob.visible = false;
}

// Puts a character in a seat: thighs level, shins down, hands forward.
export function seatCharacter(actor) {
  if (actor.animated) { actor.seat(true); actor.blob.visible = false; return; }
  actor.legL.hip.rotation.x = -1.5;
  actor.legR.hip.rotation.x = -1.5;
  actor.legL.knee.rotation.x = 1.45;
  actor.legR.knee.rotation.x = 1.45;
  actor.legL.foot.rotation.x = 0;
  actor.legR.foot.rotation.x = 0;
  actor.armL.shoulder.rotation.x = -0.95;
  actor.armR.shoulder.rotation.x = -0.95;
  actor.armL.elbow.rotation.x = -0.5;
  actor.armR.elbow.rotation.x = -0.5;
  actor.torso.rotation.x = 0.04;
  actor.torso.rotation.y = 0;
  actor.torso.rotation.z = 0;
  actor.pelvis.yaw = 0; actor.pelvis.roll = 0; actor.pelvis.drop = 0; actor.pelvis.sway = 0;
  actor.head.group.rotation.y = 0; actor.head.group.rotation.z = 0;
  actor.body.rotation.z = 0;
  actor.blob.visible = false;
}

export function standCharacter(actor) {
  if (actor.animated && actor.seated) actor.seat(false);
  actor.blob.visible = true;
}
