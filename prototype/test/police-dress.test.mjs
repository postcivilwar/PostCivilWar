// The town's sixteen policewomen as they are drawn (src/client/police-dress.js): each from the owner's supplied police
// officer, the website's light copy of it read here as the game reads it, with her own face, skin, uniform and hat.
// What can be checked without a graphics card: what is made for each of them and what is shared, which parts of the
// figure are which, that the figure's file and model are left as they are, and that what was made is let go.
//
//   node --test test/police-dress.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
globalThis.THREE = require('../vendor/three.min.js');
const { splitGLB } = await import('../src/client/glb-read.js');
const { parsedParts, modelFromGLB } = await import('../src/client/glb.js');
const { dressPolice, undressPolice } = await import('../src/client/police-dress.js');
const { POLICE_LOOKS, UNIFORMS, policeLook } = await import('../src/sim/police-looks.js');

const ORIGINAL = new URL('../assets/characters/figures/animated/police.glb', import.meta.url);
const LIGHT = new URL('../assets/characters/figures/light/police.glb.gz', import.meta.url);
const sha = (url) => createHash('sha256').update(readFileSync(url)).digest('hex');
const before = { original: sha(ORIGINAL), light: sha(LIGHT) };

// The supplied officer's light copy as the game makes it (animated.js, loadAnimated): its picture is not decoded here.
function policeModel() {
  const glb = gunzipSync(readFileSync(LIGHT));
  const parts = splitGLB(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength));
  return modelFromGLB(parsedParts(parts), { surface: (o) => new THREE.MeshStandardMaterial(o), pictures: [{ bitmap: { width: 1, height: 1 } }] });
}
// A figure of the model, as makeAnimatedRig makes one, dressed as the k-th officer.
function officer(model, k) {
  const { root, mesh } = model.figure();
  root.scale.setScalar(1.8 / model.height);
  const bones = new Map();
  root.traverse((o) => { if (o.isBone) bones.set(o.name, o); });
  const was = { geometry: mesh.geometry, material: mesh.material, scale: root.scale.x };
  const police = dressPolice({ model, root, mesh, bones, k, shadow: true });
  return { root, mesh, bones, police, was };
}
const zones = (mesh) => mesh.geometry.attributes.aZone;
// where each point of the figure is as it was bound, in the model's units
const positionsOf = (geometry) => { const p = geometry.attributes.position; const k = p.normalized ? 32767 : 1; return Float32Array.from(p.array, (v) => v / k); };

const model = policeModel();

test('each of the sixteen officers is drawn from the supplied officer: her own face, skin, uniform and hat', () => {
  const made = POLICE_LOOKS.map((L, k) => officer(model, k));
  made.forEach(({ police, mesh, root, bones, was }, k) => {
    const L = POLICE_LOOKS[k];
    assert.equal(police.skin, L.skin); assert.equal(police.uniform, L.uniform);
    // her height: about 1.69 m, her own
    assert.ok(Math.abs(root.scale.x - was.scale * 0.94 * L.height) < 1e-9, `officer ${k + 1}: her height`);
    assert.ok(was.scale * 0.94 * L.height * model.height > 1.6 && was.scale * 0.94 * L.height * model.height < 1.78);
    // her own shape and her own material, the figure's left as it was
    assert.notEqual(mesh.geometry, was.geometry); assert.notEqual(mesh.material, was.material);
    const u = mesh.material.userData.dress;
    const tone = new THREE.Color(L.tone).convertSRGBToLinear();
    assert.ok(Math.abs(u.uTone.x - tone.r) < 1e-6 && Math.abs(u.uTone.z - tone.b) < 1e-6, `officer ${k + 1}: her skin`);
    assert.equal(u.uCamo, L.uniform === 'camo' ? 1 : 0);
    // her hat on her head: a beret (its band, its crown, its badge) or a peaked cap (band, crown, top, peak, badge)
    const hat = bones.get('head').children.find((o) => o.name === 'police-hat');
    assert.ok(hat, `officer ${k + 1}: a hat`);
    assert.equal(hat.children.length, UNIFORMS[L.uniform].hat === 'beret' ? 3 : 5);
    assert.ok(hat.children.every((m) => m.castShadow));
  });
  // sixteen faces: no two officers' heads the same shape
  const heads = new Set(made.map(({ mesh }) => createHash('md5').update(Buffer.from(mesh.geometry.attributes.position.array.buffer)).digest('hex')));
  assert.equal(heads.size, 16);
});

test('only her position numbers are her own: the rest is the supplied figure\'s, shared, and nothing of it is changed', () => {
  const original = Float32Array.from(model.geometry.attributes.position.array);
  const { mesh } = officer(model, 5);
  const g = mesh.geometry, m = model.geometry;
  for (const name of ['normal', 'uv', 'skinIndex', 'skinWeight']) assert.equal(g.attributes[name], m.attributes[name], `${name} is shared`);
  assert.equal(g.index, m.index);
  assert.equal(g.attributes.position.array.constructor, m.attributes.position.array.constructor);
  assert.equal(g.attributes.position.normalized, m.attributes.position.normalized);
  // the model's own positions untouched
  assert.deepEqual(Float32Array.from(m.attributes.position.array), original);
  // her face, her hair under her hat and her body changed; her arms, hands, legs and feet not at all
  const z = zones(mesh), a = positionsOf(g), b = positionsOf(m);
  let moved = 0, limbsMoved = 0, limbs = 0;
  for (let i = 0; i < a.length / 3; i += 1) {
    const d = Math.hypot(a[i * 3] - b[i * 3], a[i * 3 + 1] - b[i * 3 + 1], a[i * 3 + 2] - b[i * 3 + 2]);
    if (d > 1e-4) moved += 1;
    const head = z.getX(i), shirt = z.getY(i), legs = z.getZ(i), feet = z.getW(i);
    const body = 1 - head - shirt - legs - feet;
    if (head < 0.01 && body < 0.01 && legs < 0.01) { limbs += 1; if (d > 1e-4) limbsMoved += 1; }
  }
  assert.ok(moved > 1000, `her head and body reshaped (${moved} points)`);
  assert.ok(limbs > 2000);
  assert.equal(limbsMoved, 0, 'the arms, hands and feet are the figure\'s own');
  // the files as they were supplied and as the website sends them, byte for byte
  assert.equal(sha(ORIGINAL), before.original); assert.equal(sha(LIGHT), before.light);
});

test('the same officer drawn twice shares what was made for her; a new officer gets her own', () => {
  const a = officer(model, 2), b = officer(model, 2), c = officer(model, 3);
  assert.equal(a.mesh.geometry, b.mesh.geometry); assert.equal(a.mesh.material, b.mesh.material);
  const hatA = a.bones.get('head').children.find((o) => o.name === 'police-hat'), hatB = b.bones.get('head').children.find((o) => o.name === 'police-hat');
  assert.notEqual(hatA, hatB, 'each figure has its own hat on its own head');
  assert.deepEqual(hatA.children.map((m) => m.geometry), hatB.children.map((m) => m.geometry), '...made of the same parts');
  assert.notEqual(a.mesh.geometry, c.mesh.geometry); assert.notEqual(a.mesh.material, c.mesh.material);
  // the parts of the body, worked out once for the model: one list shared by all sixteen
  assert.equal(zones(a.mesh), zones(c.mesh));
  // one shader for all of them
  assert.equal(a.mesh.material.customProgramCacheKey(), c.mesh.material.customProgramCacheKey());
});

test('which part of her each point is: the sleeves and the collar the shirt\'s; the trousers by her hands, the armour and the hair at her nape not', () => {
  const { mesh, bones } = officer(model, 1);
  const z = zones(mesh), p = positionsOf(mesh.geometry);
  const skeleton = mesh.skeleton;
  const at = (name) => new THREE.Vector3().setFromMatrixPosition(skeleton.boneInverses[skeleton.bones.indexOf(bones.get(name))].clone().invert());
  const line = (a, b, more = 0) => { const l = new THREE.Line3(at(a), at(b)); if (more) l.end.add(l.end.clone().sub(l.start).multiplyScalar(more)); return l; };
  const from = (lines, v) => Math.min(...lines.map((l) => l.closestPointToPoint(v, true, new THREE.Vector3()).distanceTo(v)));
  const thighs = [line('thigh_l', 'calf_l'), line('thigh_r', 'calf_r')], hands = [line('lowerarm_l', 'hand_l', 0.45), line('lowerarm_r', 'hand_r', 0.45)];
  const hip = at('thigh_l').y, spine = at('spine_03');
  // the chin: the lowest point of her face
  const head = z.array;
  let chin = Infinity;
  for (let i = 0; i < p.length / 3; i += 1) if (head[i * 4] / 255 > 0.6 && p[i * 3 + 2] > 0.05) chin = Math.min(chin, p[i * 3 + 1]);
  // (the supplied figure's own bones move nearly a thousand points of her head and her hair, a few of the trousers
  // beside her hands and of the armour's back, with the neck's or an arm's: a shirt's colour there would show)
  let shirt = 0, onHead = 0, onThighs = 0, onBack = 0;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.length / 3; i += 1) {
    if (z.getY(i) < 0.15) continue;
    shirt += 1;
    v.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
    if (v.y > chin + 0.02) onHead += 1;
    if (v.y < hip && from(thighs, v) < 0.09 && from(hands, v) > 0.05) onThighs += 1;
    if (v.z < spine.z - 0.055 && Math.abs(v.x - spine.x) < 0.1 && v.y > 0.25 && v.y < spine.y + 0.13) onBack += 1;
  }
  assert.ok(shirt > 2000, `the sleeves and the collar (${shirt} points)`);
  assert.equal(onHead, 0, 'nothing of her head or her hair is the shirt\'s');
  assert.equal(onThighs, 0, 'nothing of the trousers or the holster beside her hands is the shirt\'s');
  assert.equal(onBack, 0, 'nothing of the armour\'s back is the shirt\'s');
});

test('the town gives the k-th officer her look; one that is not one of them is the figure as supplied', () => {
  for (let k = 0; k < 16; k += 1) {
    const look = policeLook(k);
    assert.equal(look.figure, 'W3'); assert.equal(look.police, k);
  }
  assert.equal(policeLook(17).police, 1);
  // a negative or out-of-range number still dresses her as one of the sixteen
  const { police } = officer(model, -1);
  assert.equal(police.skin, POLICE_LOOKS[15].skin);
});

test('what was made for the officers is let go with the model', () => {
  const m2 = policeModel();
  const figures = [0, 1, 2].map((k) => officer(m2, k));
  const disposed = new Set();
  for (const { mesh, bones } of figures) {
    mesh.geometry.addEventListener('dispose', () => disposed.add(mesh.geometry));
    mesh.material.addEventListener('dispose', () => disposed.add(mesh.material));
    for (const part of bones.get('head').children.find((o) => o.name === 'police-hat').children) part.geometry.addEventListener('dispose', () => disposed.add(part.geometry));
  }
  undressPolice(m2);
  for (const { mesh } of figures) { assert.ok(disposed.has(mesh.geometry)); assert.ok(disposed.has(mesh.material)); }
  assert.ok(disposed.size >= 3 * 2 + 3 * 3);
  // and dressing again after that makes them afresh
  const again = officer(m2, 0);
  assert.notEqual(again.mesh.geometry, figures[0].mesh.geometry);
});

test('where the supplied officer cannot be had (the copy of the game on a disk), each officer is one of the game\'s own figures in her uniform', async () => {
  const { configFromLook, characterSpec } = await import('../src/sim/characters.js');
  for (let k = 0; k < 16; k += 1) {
    const look = policeLook(k), L = POLICE_LOOKS[k], U = UNIFORMS[L.uniform];
    assert.ok(look.plain, 'a plain look');
    const config = configFromLook(look.plain);
    assert.equal(config.gender, 'f'); assert.equal(config.outfit, 'uniform'); assert.equal(config.hat, 'beret');
    assert.equal(config.skin, L.tone); assert.equal(config.colours.top, U.shirt); assert.equal(config.colours.bottom, U.trousers); assert.equal(config.colours.hat, U.hatColour);
    assert.ok(characterSpec(config, 1).parts.length > 3, 'a figure that can be drawn');
  }
});
