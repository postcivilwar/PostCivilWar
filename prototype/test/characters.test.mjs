// Tests of the character system: the kit baked from the base character, the
// catalogue, and the rules that dress the town.
//
//   node --test test/characters.test.mjs
//
// These run without a browser. They check what a character is made of, not
// how it looks; the look is judged in the character lab (dist/lab.html).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { KIT_META, KIT_B64 } from '../src/client/character-kit-data.js';
import { DRESS_OF, OUTFITS, FOOTWEAR, HAIR, HEADWEAR, EXTRAS, BODY_TYPES, PROTOTYPES, VARIATIONS, ANIMATION_SETS, characterSpec, configFromLook, wearFor, figFor, heightOf, partsUsed, printKey } from '../src/sim/characters.js';
import { rosterOf } from '../src/sim/population.js';
import { ZONE_RESIDENTS, ZONE_POPULATION } from '../src/sim/zone.js';

const here = dirname(fileURLToPath(import.meta.url));
const bytes = Buffer.from(KIT_B64, 'base64');
const part = (id) => KIT_META.parts[id];
const triangles = (spec) => spec.parts.reduce((sum, p) => sum + part(p.id).lods[Math.min(spec.lod, part(p.id).lods.length - 1)].t, 0);
const people = rosterOf(ZONE_POPULATION.seed, 1);
const configOf = (p) => configFromLook(p.look);
const signature = (c) => [c.outfit, c.hair, c.hat, c.body, c.skin, JSON.stringify(c.colours), JSON.stringify(c.prints), (c.extras || []).join('+')].join('|');

// ------------------------------------------------------------------ the kit --

test('the base character: one skeleton of 22 named bones, bound as supplied', () => {
  const names = KIT_META.bones.map((b) => b.name);
  assert.equal(names.length, 22);
  for (const n of ['Root', 'Hips', 'Spine', 'Chest', 'Neck', 'Head', 'Clavicle_L', 'UpperArm_L', 'Forearm_L', 'Hand_L', 'Thigh_R', 'Shin_R', 'Foot_R', 'Toe_R']) assert.ok(names.includes(n), `no bone called ${n}`);
  for (const b of KIT_META.bones) { assert.equal(b.ibm.length, 16); assert.ok(b.parent < KIT_META.bones.indexOf(b), 'a parent comes before its children'); }
  // the supplied file is in the repository untouched, and the kit was baked from it
  const glb = readFileSync(resolve(here, '../assets/characters/base/streetwear_character_rigged.glb'));
  assert.equal(glb.subarray(0, 4).toString(), 'glTF');
  assert.equal(glb.length, 1701556);
  // the model stands 1.8 m: scale and orientation are as supplied, y up, metres
  const head = part('base.head');
  assert.ok(head.box[4] > 1.76 && head.box[4] < 1.80, `the top of the head is at ${head.box[4]}`);
  assert.ok(part('base.sneakers').box[1] > -0.01 && part('base.sneakers').box[1] < 0.02, 'the feet are on the ground');
});

test('the base character is kept whole: every supplied part, at full detail, for the player', () => {
  // triangle counts of the supplied meshes, as the GLB has them
  const supplied = { 'base.hands': 6848, 'base.beard': 2476, 'base.cap': 800, 'base.glasses': 1520, 'base.headphones': 3392, 'base.joggers': 1208, 'base.sneakers': 4480 };
  for (const [id, count] of Object.entries(supplied)) assert.equal(part(id).lods[0].t, count, `${id} at full detail`);
  // the hoodie gains a few triangles where its two colours were cut apart; the head loses its empty pockets and gains eyes
  assert.ok(part('base.hoodie').lods[0].t >= 13626 && part('base.hoodie').lods[0].t < 14200);
  assert.ok(part('base.head').lods[0].t > 8000);
  const player = characterSpec(PROTOTYPES[0].config, 0);
  assert.equal(player.pose, 'base', 'the player stands as the model was bound');
  assert.ok(player.parts.every((p) => p.id.startsWith('base.')), 'the player wears only the supplied parts');
  for (const id of ['base.head', 'base.hands', 'base.hoodie', 'base.joggers', 'base.sneakers', 'base.cap', 'base.glasses', 'base.headphones', 'base.beard']) assert.ok(player.parts.some((p) => p.id === id), `the player is missing ${id}`);
  assert.ok(triangles(player) > 43000, 'nothing was thinned for the player');
});

test('every part: three levels of detail, sound data, skinned to the one skeleton', () => {
  let count = 0;
  for (const [id, p] of Object.entries(KIT_META.parts)) {
    assert.equal(p.lods.length, 3, `${id} has ${p.lods.length} levels`);
    assert.ok(p.lods[0].t >= p.lods[1].t && p.lods[1].t >= p.lods[2].t, `${id} does not get lighter with distance: ${p.lods.map((l) => l.t)}`);
    for (const lod of p.lods) {
      assert.ok(lod.v > 0 && lod.v < 65536 && lod.t > 0);
      const joints = bytes.subarray(lod.joints, lod.joints + lod.v * 4);
      const weights = bytes.subarray(lod.weights, lod.weights + lod.v * 4);
      for (let i = 0; i < lod.v; i += 1) {
        const sum = weights[i * 4] + weights[i * 4 + 1] + weights[i * 4 + 2] + weights[i * 4 + 3];
        if (sum !== 255) assert.fail(`${id}: a vertex's weights add to ${sum}`);
        for (let k = 0; k < 4; k += 1) if (joints[i * 4 + k] >= 22) assert.fail(`${id}: a vertex follows bone ${joints[i * 4 + k]}`);
      }
      const idx = new Uint16Array(bytes.buffer, bytes.byteOffset + lod.idx, lod.t * 3);
      for (const v of idx) if (v >= lod.v) assert.fail(`${id}: a triangle points past the end`);
      count += 1;
    }
  }
  assert.ok(count >= 200);
  assert.deepEqual(partsUsed().filter((id) => !part(id)), [], 'the catalogue asks for parts the kit does not have');
});

test('the natural pose: the same bones, standing with arms at the sides and feet under the hips', () => {
  const quat = ([x, y, z, w]) => [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]];
  const mul = (A, B) => A.map((row) => B[0].map((_, j) => row.reduce((s, v, k) => s + v * B[k][j], 0)));
  const apply = (R, v) => R.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
  const stand = (pose) => {
    const R = [], P = [];
    KIT_META.bones.forEach((b, i) => {
      const local = quat(pose.q[i]);
      if (b.parent < 0) { R[i] = local; P[i] = pose.t[i]; } else { R[i] = mul(R[b.parent], local); const o = apply(R[b.parent], pose.t[i]); P[i] = P[b.parent].map((v, k) => v + o[k]); }
    });
    return Object.fromEntries(KIT_META.bones.map((b, i) => [b.name, P[i]]));
  };
  const bound = stand({ t: KIT_META.bones.map((b) => b.t), q: KIT_META.bones.map((b) => b.r) });
  for (const b of KIT_META.bones) for (let k = 0; k < 3; k += 1) assert.ok(Math.abs(bound[b.name][k] - b.head[k]) < 1e-3, `${b.name} is not where the model put it`);
  const natural = stand(KIT_META.poses.natural);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  // the trunk, head and joints at the body do not move
  for (const n of ['Hips', 'Spine', 'Chest', 'Neck', 'Head', 'UpperArm_L', 'Thigh_R']) assert.ok(dist(natural[n], bound[n]) < 1e-3, `${n} moved`);
  assert.ok(Math.abs(bound.Foot_L[0]) > 0.14 && Math.abs(natural.Foot_L[0]) < 0.11, 'the feet come in under the hips');
  assert.ok(Math.abs(dist(natural.Forearm_L, natural.Hand_L) - 0.235) < 0.002, 'a forearm of ordinary length');
  assert.ok(natural.Hand_L[1] < 0.96 && natural.Hand_L[1] > 0.86, 'hands hang at the top of the thigh');
  assert.ok(Math.abs(natural.Hand_L[0]) < Math.abs(bound.Hand_L[0]), 'arms hang closer to the body');
  // legs keep their length: nobody gets taller or shorter by standing differently
  assert.ok(Math.abs(dist(natural.Thigh_L, natural.Shin_L) - dist(bound.Thigh_L, bound.Shin_L)) < 1e-3);
  assert.ok(KIT_META.idle && KIT_META.idle.length > 3.5 && Object.keys(KIT_META.idle.tracks).includes('Chest'), 'the supplied idle clip is carried');
});

// ------------------------------------------------------------ the catalogue --

test('the first characters: one of each kind asked for, each a different person', () => {
  const ids = PROTOTYPES.map((p) => p.id);
  for (const want of ['player', 'man', 'woman', 'market-woman', 'doctor', 'nurse', 'priest', 'igbo', 'yoruba', 'hausa', 'urban']) assert.ok(ids.includes(want), `no ${want}`);
  const outfitOf = Object.fromEntries(PROTOTYPES.map((p) => [p.id, p.config.outfit]));
  assert.equal(outfitOf.doctor, 'doctor'); assert.equal(outfitOf.nurse, 'nurse-dress'); assert.equal(outfitOf.priest, 'cassock');
  assert.equal(outfitOf.igbo, 'isiagu'); assert.equal(outfitOf.yoruba, 'agbada'); assert.equal(outfitOf.hausa, 'babanriga');
  for (const proto of PROTOTYPES) {
    for (const lod of [0, 1, 2]) {
      const spec = characterSpec(proto.config, lod);
      for (const p of spec.parts) assert.ok(part(p.id), `${proto.id} needs ${p.id}`);
      assert.ok(spec.parts.some((p) => p.id === 'base.head') && spec.parts.some((p) => p.id === 'base.hands'), 'everyone has the base character\'s head and hands');
      assert.ok(spec.scale > 0.5 && spec.scale < 1.1);
    }
  }
  const specs = PROTOTYPES.map((p) => characterSpec(p.config, 1));
  assert.equal(new Set(specs.map((s) => s.parts.map((p) => p.id).sort().join(','))).size, PROTOTYPES.length, 'no two are made of the same parts');
  assert.ok(new Set(PROTOTYPES.map((p) => p.config.skin)).size >= 6, 'a range of skin tones');
  // a doctor's coat is white, a nurse is white and blue, a priest's cassock has a white collar
  const colour = (id, partId, slot) => characterSpec(PROTOTYPES.find((p) => p.id === id).config, 1).parts.find((p) => p.id === partId).colours[slot];
  assert.ok(colour('doctor', 'top.coat', 'a') > 0xf0f0e8);
  assert.ok(colour('nurse', 'dress.nurse', 'a') > 0xf0f0e8); assert.equal(colour('nurse', 'dress.nurse', 'b'), 0x2f5fa8);
  assert.ok(colour('priest', 'top.cassock', 'a') < 0x202020); assert.ok(colour('priest', 'top.cassock', 'b') > 0xf0f0e8);
});

test('the catalogue: every outfit, hair, hat, shoe and accessory can be put together', () => {
  assert.ok(Object.keys(OUTFITS).length >= 28);
  for (const [id, outfit] of Object.entries(OUTFITS)) {
    for (const gender of outfit.gender ? [outfit.gender] : ['m', 'f']) {
      const spec = characterSpec({ gender, age: 30, outfit: id, hair: 'low', skin: 0x5a3620 }, 1);
      assert.equal(spec.pose, id === 'streetwear' ? 'base' : 'natural');
      // tailored clothes are never mixed with the base character's own, which fit its bound pose only
      if (id !== 'streetwear') assert.ok(!spec.parts.some((p) => ['base.hoodie', 'base.joggers', 'base.sneakers', 'base.yoke'].includes(p.id)), `${id} mixes in the base outfit`);
      assert.ok(spec.parts.some((p) => p.id.startsWith('shoe.') || p.id === 'base.sneakers'), `${id}: nothing on the feet`);
    }
  }
  for (const hat of Object.keys(HEADWEAR)) {
    const spec = characterSpec({ gender: 'f', outfit: 'gown', hair: 'afro', hat }, 1);
    const hair = spec.parts.filter((p) => p.id.startsWith('hair.'));
    if (HEADWEAR[hat].covers) assert.equal(hair.length, 0, `${hat} covers the hair`); else assert.deepEqual(hair.map((p) => p.id), ['hair.low'], `big hair is flattened under a ${hat}`);
  }
  for (const feet of Object.keys(FOOTWEAR)) for (const p of FOOTWEAR[feet]) assert.ok(part(p.id));
  assert.ok(characterSpec({ gender: 'f', outfit: 'long-dress', shoes: 'sandals' }, 1).parts.some((p) => p.id === 'body.feet'), 'sandals are worn on bare feet');
  assert.ok(Object.keys(HAIR).length >= 10 && Object.keys(EXTRAS).length >= 12 && Object.keys(BODY_TYPES).length === 4 && Object.keys(ANIMATION_SETS).length >= 5);
  // a print is a kind of cloth and its colours, and two people in the same cloth share one painted texture
  assert.equal(printKey({ kind: 'ankara', motif: 'rings', colours: [1, 2, 3] }), printKey({ kind: 'ankara', motif: 'rings', colours: [1, 2, 3] }));
});

test('age, build and gender change the same figure, within what the base character allows', () => {
  const at = (config) => characterSpec({ outfit: 'tee', ...config }, 1);
  assert.ok(at({ gender: 'f', age: 30 }).scale < at({ gender: 'm', age: 30 }).scale);
  assert.ok(at({ gender: 'm', age: 8 }).scale < 0.8 && at({ gender: 'm', age: 8 }).headScale > 1.1, 'a child is small with a larger head for their size');
  assert.equal(at({ gender: 'm', age: 30 }).headScale, 1);
  assert.ok(at({ gender: 'm', age: 75 }).stoop > 0 && at({ gender: 'm', age: 75 }).hair !== at({ gender: 'm', age: 30 }).hair, 'the old stoop a little and go grey');
  for (const [name, t] of Object.entries(BODY_TYPES)) { assert.ok(t.wide >= 0.9 && t.wide <= 1.15, `${name} is outside the base character's proportions`); }
  assert.equal(at({ gender: 'f' }).body.female, 1); assert.equal(at({ gender: 'm' }).body.female, 0);
  const faces = new Set(Array.from({ length: 40 }, (_, i) => JSON.stringify(at({ gender: 'm', face: i }).face)));
  assert.equal(faces.size, 40, 'forty numbers, forty faces');
  for (let i = 0; i < 40; i += 1) { const f = at({ gender: 'f', face: i }).face; assert.ok(Math.abs(f.jaw) < 0.12 && Math.abs(f.nose) < 0.14 && Math.abs(f.chin) < 0.007, 'a face stays a face'); }
  assert.deepEqual(at({ gender: 'm', face: 7 }).face, at({ gender: 'm', face: 7 }).face);
});

// ------------------------------------------------------------- the townspeople --

test('everyone in town is dressed by the system, and can be drawn', () => {
  let worst = 0, total1 = 0, total2 = 0;
  for (const p of people) {
    assert.ok(p.look.wear, `${p.name} was not dressed`);
    const config = configOf(p);
    assert.equal(config.gender, p.gender); assert.equal(config.age, p.age);
    assert.ok(OUTFITS[config.outfit], `${p.name} wears ${config.outfit}`);
    if (OUTFITS[config.outfit].gender) assert.equal(OUTFITS[config.outfit].gender, p.gender, `${p.name} (${p.gender}) wears ${config.outfit}`);
    const near = characterSpec(config, 1), mid = characterSpec(config, 2);
    for (const q of near.parts) assert.ok(part(q.id), `${p.name} needs ${q.id}`);
    assert.equal(near.pose, 'natural', 'the base character\'s own outfit is the player\'s');
    const t1 = triangles(near), t2 = triangles(mid);
    worst = Math.max(worst, t1); total1 += t1; total2 += t2;
    // (the heaviest is a bearded site worker in a hi-vis vest, at about 5,500)
    assert.ok(t2 < 5600, `${p.name} is ${t2} triangles at middle distance`);
    assert.deepEqual(wearFor(p, { ...p.look, wear: undefined }), p.look.wear, 'the same person dresses the same way every time');
    assert.ok(Math.abs(p.fig.scale - heightOf(config) * 1.02) < 1e-9 && p.fig.skin === p.look.skin, 'the far figure is the same person');
  }
  assert.ok(worst < 12500, `the heaviest near figure is ${worst} triangles`);
  console.log(`    ${people.length} people: near ${Math.round(total1 / people.length)} triangles each on average (most ${worst}), middle ${Math.round(total2 / people.length)}`);
});

test('occupations are recognisable by their dress', () => {
  const of = (job) => people.filter((p) => p.job === job).map((p) => ({ p, c: configOf(p) }));
  for (const { p, c } of of('doctor')) { assert.equal(c.outfit, 'doctor', p.name); assert.ok(c.extras.includes('stethoscope')); assert.ok(c.colours.coat > 0xf0f0e8, 'a white coat'); }
  for (const { p, c } of of('nurse')) { assert.equal(c.outfit, p.gender === 'f' ? 'nurse-dress' : 'nurse-tunic'); assert.ok(c.colours.top > 0xf0f0e8 && c.colours.trim === 0x2f5fa8, 'white and blue'); }
  assert.equal(wearFor({ index: 1, gender: 'm', age: 30, job: 'nurse', people: 'igbo' }, { skin: 1, top: 2, bottom: 3, body: 'm' }).outfit, 'nurse-tunic', 'a male nurse has his own uniform');
  for (const { c } of [...of('priest'), ...of('vicar')]) { assert.equal(c.outfit, 'cassock'); assert.notEqual(c.colours.collar, c.colours.top, 'the collar shows against the cassock'); }
  for (const { c } of [...of('police'), ...of('guard')]) { assert.equal(c.outfit, 'uniform'); assert.equal(c.hat, 'beret'); }
  for (const { p, c } of of('pupil')) assert.equal(c.outfit, p.gender === 'f' ? 'gown' : 'shirt-shorts');
  assert.equal(new Set(of('pupil').filter((x) => x.p.gender === 'm').map((x) => JSON.stringify(x.c.colours))).size, 1, 'one school uniform');
  const worker = [...of('labourer'), ...of('carpenter'), ...of('mechanic'), ...of('welder')];
  for (const x of worker) assert.ok(['singlet', 'singlet-trousers', 'hivis', 'tee', 'tee-shorts', 'polo', 'shirt-short', 'shirt-shorts'].includes(x.c.outfit), `${x.p.name}, a ${x.p.job}, is at work in ${x.c.outfit}`);
  assert.ok(worker.some((x) => x.c.hat === 'helmet'), 'some site workers wear a hard hat');
  assert.ok(of('farmer').some((x) => x.c.hat === 'straw'));
  for (const set of new Set(people.map((p) => configOf(p).animations))) assert.ok(ANIMATION_SETS[set], `no animation set called ${set}`);
  assert.equal(configOf(people.find((p) => p.job === 'trader')).animations, 'trader');
});

test('cultural dress is worn where it would be, and not by everyone', () => {
  const adults = people.filter((p) => p.age >= 18).map((p) => ({ p, c: configOf(p), o: OUTFITS[configOf(p).outfit] }));
  const native = adults.filter((x) => x.o.kind === 'native');
  assert.ok(native.length > adults.length * 0.2 && native.length < adults.length * 0.7, `${native.length} of ${adults.length} adults are in native wear`);
  // outfits that belong to one people are worn by that people
  for (const x of adults) if (x.o.culture) assert.equal(DRESS_OF[x.p.people] || x.p.people, x.o.culture, `${x.p.name} (${x.p.people}) wears ${x.c.outfit}`);
  const hausaWomen = adults.filter((x) => x.p.people === 'hausa' && x.p.gender === 'f' && !['nurse', 'doctor', 'police'].includes(x.p.job));
  for (const x of hausaWomen) assert.equal(x.c.hat, 'hijab', `${x.p.name} is not veiled`);
  assert.ok(!adults.some((x) => x.c.hat === 'hijab' && x.p.gender === 'm'));
  assert.ok(!adults.some((x) => ['gele', 'headtie', 'scarf'].includes(x.c.hat) && x.p.gender === 'm'), 'head ties are women\'s');
  assert.ok(!adults.some((x) => ['fila', 'hula', 'knit'].includes(x.c.hat) && x.p.gender === 'f'), 'men\'s caps are men\'s');
  // elders dress traditionally more than the young; office workers less than traders
  const share = (list) => list.filter((x) => x.o.kind === 'native').length / Math.max(1, list.length);
  assert.ok(share(adults.filter((x) => x.p.age >= 55)) > share(adults.filter((x) => x.p.age < 30)) + 0.2);
  assert.ok(share(adults.filter((x) => x.p.job === 'trader')) > share(adults.filter((x) => ['teacher', 'lecturer', 'clerk', 'officer'].includes(x.p.job))));
  // people at work in a uniform keep it whatever their people
  assert.ok(adults.filter((x) => ['doctor', 'nurse', 'police'].includes(x.p.job)).every((x) => x.o.kind === 'work'));
  assert.ok(adults.some((x) => x.c.outfit === 'isiagu') && adults.some((x) => x.c.outfit === 'double-wrapper'), 'Igbo dress is seen in an Anioma town');
});

test('no crowd of clones: market women, and men, differ from one another', () => {
  const traders = people.filter((p) => p.gender === 'f' && ['trader', 'foodvendor', 'hawker'].includes(p.job)).map(configOf);
  assert.ok(traders.length >= 40);
  const sig = traders.map(signature);
  assert.ok(new Set(sig).size >= traders.length - 1, `${traders.length - new Set(sig).size} market women are exact copies of another`);
  for (const key of ['outfit', 'hat', 'body', 'hair']) assert.ok(new Set(traders.map((c) => c[key])).size >= 3, `market women all share one ${key}`);
  assert.ok(new Set(traders.map((c) => printKey((c.prints || {}).print))).size >= 6, 'more than a few cloths');
  assert.ok(new Set(traders.map((c) => c.skin)).size >= 6);
  assert.ok(traders.filter((c) => (c.extras || []).includes('apron')).length > 3 && traders.filter((c) => (c.extras || []).includes('apron')).length < traders.length * 0.7, 'some wear aprons, not all');
  assert.ok(traders.filter((c) => c.hat).length > traders.length * 0.4 && traders.filter((c) => !c.hat).length > 2, 'most cover their hair, not all');
  const men = people.filter((p) => p.gender === 'm' && p.age >= 18).map(configOf);
  const copies = men.length - new Set(men.map(signature)).size;
  assert.ok(copies < men.length * 0.04, `${copies} of ${men.length} men are exact copies of another`);
  assert.ok(new Set(men.map((c) => c.hair)).size >= 5 && men.some((c) => (c.extras || []).includes('beard')) && men.some((c) => !(c.extras || []).includes('beard')));
  // the same face number is never used twice
  assert.equal(new Set(people.map((p) => configOf(p).face)).size, people.length);
});

test('named residents and players: older looks are read as before', () => {
  for (const r of ZONE_RESIDENTS) {
    const config = configFromLook(r.look);
    assert.ok(OUTFITS[config.outfit], `${r.name}: ${config.outfit}`);
    for (const p of characterSpec(config, 1).parts) assert.ok(part(p.id), `${r.name} needs ${p.id}`);
    assert.equal(config.skin, r.look.skin);
  }
  const player = configFromLook({ skin: 0x4f3019, top: 0xd9442f, bottom: 0x2c3440, build: 1, body: 'm', outfit: 'streetwear' });
  assert.equal(player.outfit, 'streetwear');
  const spec = characterSpec(player, 0);
  assert.equal(spec.skin, 0x4f3019, 'their own skin tone');
  assert.equal(spec.parts.find((p) => p.id === 'base.hoodie').colours.b, 0xd9442f, 'their own colour on the hoodie');
  const woman = characterSpec(configFromLook({ skin: 0x4f3019, top: 0xd9442f, body: 'f', outfit: 'streetwear' }), 0);
  assert.ok(!woman.parts.some((p) => p.id === 'base.beard') && woman.parts.some((p) => p.id.startsWith('hair.')));
  const fig = figFor(configFromLook(people[10].look));
  for (const key of ['skin', 'arm', 'top', 'bottom', 'legs', 'hair']) assert.ok(Number.isInteger(fig[key]), `the far figure has no ${key} colour`);
});
