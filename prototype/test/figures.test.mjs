// The owner's supplied figures: that the baked data is theirs and complete, that what a figure held was
// taken out, and that the choice made on the start screen is the simulation's, kept, checked and seen by others.
//
//   node --test test/figures.test.mjs
//
// The figures themselves are drawn and checked by eye from tools/characters/figures.py --preview, and in a
// browser by test/play.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { FIGURE_META } from '../src/client/figure-data.js';
import { FIGURES, FIGURE_ORDER, FIGURE_PARTS, FIGURE_DEFAULTS, cleanFigureLook } from '../src/sim/figures.js';
import { createChoice } from '../src/client/choice.js';
import { characterSpec, configFromLook } from '../src/sim/characters.js';
import { createHost } from '../src/sim/host.js';
import { encodePlayer, decodePlayer } from '../src/net/link.js';
import { ZONE } from '../src/sim/zone.js';
import { parseGLB, figureLabels, boneName } from '../src/client/glb.js';
import { ANIMATED } from '../src/client/animated.js';
import { SEAT_POSE } from '../src/client/seat-pose.js';
import { figureMoves, borrowedFor, seatFor } from '../src/client/figure-moves.js';

const master = (file) => { const b = readFileSync(new URL(`../assets/characters/figures/animated/${file}`, import.meta.url)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const MASTERS = {
  M1: { file: 'muscular_male.glb', md5: '36cc552a8a95352f60266797de804403', animations: 24, joints: 61, images: 1 },
  W1: { file: 'woman.glb', md5: '86cbd1e74c05c1adc5abd7c9f7d4d0a6', animations: 40, joints: 61, images: 1 },
  // supplied on 12 October 2026
  W2: { file: 'athlete.glb', md5: '0cd1ed9f2a89e026ef142f956a17423b', animations: 32, joints: 61, images: 1 },
  W3: { file: 'police.glb', md5: 'd7f5ddcf60e8e56583ed93db5ef2ed36', animations: 18, joints: 61, images: 1 },
  M4: { file: 'priest.glb', md5: 'cb27d9d600e3a46a67c509fc58854d65', animations: 19, joints: 65, images: 3 },
  M5: { file: 'warrior.glb', md5: '230877a24a149d161f015fc06706e3b8', animations: 14, joints: 65, images: 1 },
  // supplied on 16 October 2026 (two of the files supplied were one figure: zombie_character.glb is the fuller)
  W4: { file: 'female_figure.glb', md5: '704224bcbfca52bec3313d7f68b6845c', animations: 11, joints: 65, images: 3 },
  W5: { file: 'athletic_outfit.glb', md5: '39a99defd263d62da1c9a39ce85bb9e9', animations: 14, joints: 65, images: 3 },
  W6: { file: 'fashion_model_3.glb', md5: 'a625ebbdff017179f4800a881e6f800f', animations: 20, joints: 65, images: 2 },
  W7: { file: 'zombie_survivor.glb', md5: '224c67af76e9f7f77491ea1fedab6a86', animations: 16, joints: 65, images: 3 },
  W8: { file: 'female_character_2.glb', md5: '18f21504e75078151633b60aecabdf01', animations: 13, joints: 65, images: 3 },
  W9: { file: 'horror_nurse.glb', md5: '9ec2b92e0944108a8396163e8b58d7b5', animations: 12, joints: 65, images: 3 },
  W10: { file: 'camouflage_bikini.glb', md5: 'ae932d015787db7a79eb26b5b0db6d55', animations: 9, joints: 65, images: 3 },
  W11: { file: 'swimwear_model.glb', md5: 'abe7b532432707b1c28ed437237fb512', animations: 11, joints: 65, images: 1 },
  W12: { file: 'fashion_model_2.glb', md5: '1774dfb2ee13c401bb5cd3e2e0025f97', animations: 12, joints: 65, images: 1 },
  W13: { file: 'fashion_model_1.glb', md5: '4b7bfb20bafa2d4e36811cb08c8c3c82', animations: 28, joints: 65, images: 2 },
  M6: { file: 'male_figure.glb', md5: '3a7aa49293940b7c11a5fc8f61711add', animations: 16, joints: 65, images: 1 },
  M7: { file: 'zombie.glb', md5: 'a5a3a1561d549d934b0aa60dc296a4e7', animations: 15, joints: 65, images: 3 },
  M8: { file: 'horror_character.glb', md5: '8d0f497ef08709b97970744cdd50e650', animations: 13, joints: 65, images: 3 },
  M9: { file: 'hobo_character.glb', md5: 'b9f0f14679183e9e0c202b748a92adc5', animations: 18, joints: 65, images: 3 },
  M10: { file: 'zombie_character.glb', md5: '73312db769b15a5f9851aa3d69e96445', animations: 21, joints: 65, images: 3 },
  M11: { file: 'human_character.glb', md5: 'c510cb7e8f781e336c6bb432fc9a36d1', animations: 10, joints: 65, images: 1 },
  M12: { file: 'ninja_armor.glb', md5: '7bfb69491e40c80877b094ae1155d65a', animations: 15, joints: 65, images: 1 },
  M13: { file: 'ninja_warrior.glb', md5: 'c7a13d9945a3c46ebbc6f502955329bf', animations: 27, joints: 65, images: 1 },
  // the six of 17 October 2026
  W14: { file: 'fashion_model_7.glb', md5: '5df25c6f19873fe6149b6c769a8be7f2', animations: 17, joints: 65, images: 3 },
  W15: { file: 'fashion_model_5.glb', md5: '3b85fd9813e6438d2d33b44bf3d301fb', animations: 15, joints: 65, images: 3 },
  M14: { file: 'fashion_model_6.glb', md5: '6ab16a5c6900f06619f550bfacb1161d', animations: 17, joints: 65, images: 3 },
  M15: { file: 'patchwork_shirt.glb', md5: '934edcdbc343d9d5c16a5b2839c94af9', animations: 9, joints: 65, images: 3 },
  M16: { file: 'nigerian_traditional.glb', md5: '478589e4762c608113bfb84eedb27aa2', animations: 16, joints: 65, images: 3 },
  M17: { file: 'urban_streetwear.glb', md5: '4c7f8f5e2c48bd17609219a0ce51b59e', animations: 13, joints: 65, images: 3 },
};
const NEW_WOMEN = ['W4', 'W5', 'W6', 'W7', 'W8', 'W9', 'W10', 'W11', 'W12', 'W13', 'W14', 'W15'];
const NEW_MEN = ['M6', 'M7', 'M8', 'M9', 'M10', 'M11', 'M12', 'M13', 'M14', 'M15', 'M16', 'M17'];

test('fifteen women and fifteen men, each drawn from the file the owner supplied, which is kept unchanged', () => {
  assert.deepEqual(FIGURE_ORDER.f, ['W1', 'W2', 'W3', ...NEW_WOMEN]);
  assert.deepEqual(FIGURE_ORDER.m, ['M1', 'M4', 'M5', ...NEW_MEN]);
  assert.deepEqual(Object.keys(FIGURES).sort(), Object.keys(MASTERS).sort());
  // no figure is in the game twice: every file is a different figure (its mesh and its textures differ)
  const shapes = new Set(), files = new Set();
  for (const f of Object.values(FIGURES)) {
    const parsed = parseGLB(master(f.file));
    const a = parsed.json.accessors[parsed.json.meshes[0].primitives[0].attributes.POSITION];
    shapes.add(`${a.count}:${a.max.join(',')}`); files.add(f.file);
  }
  assert.equal(shapes.size, Object.keys(FIGURES).length, 'each figure has its own shape');
  assert.equal(files.size, Object.keys(FIGURES).length);
  // the new ones are the women and the men they were seen to be
  for (const id of NEW_WOMEN) assert.equal(FIGURES[id].gender, 'f', id);
  for (const id of NEW_MEN) assert.equal(FIGURES[id].gender, 'm', id);
  for (const id of FIGURE_ORDER.f) assert.equal(FIGURES[id].gender, 'f', `${id} is a woman`);
  for (const id of FIGURE_ORDER.m) assert.equal(FIGURES[id].gender, 'm', `${id} is a man`);
  // the ids of the figures taken out on 8 October are not given to new ones: an old save naming one stays as it was
  for (const old of ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'M2', 'M3']) assert.ok(!FIGURES[old], old);
  assert.deepEqual(['W2', 'W3', 'M4', 'M5'].map((id) => FIGURES[id].file), ['athlete.glb', 'police.glb', 'priest.glb', 'warrior.glb']);
  for (const f of Object.values(FIGURES)) {
    assert.ok(f.animated && ANIMATED[f.id], `${f.id} is drawn from its own file`);
    assert.equal(f.file, MASTERS[f.id].file);
    assert.equal(createHash('md5').update(Buffer.from(master(f.file))).digest('hex'), MASTERS[f.id].md5, `${f.file} is the file as it was supplied`);
    assert.deepEqual(f.parts, [], 'drawn as supplied: no part of it takes a colour');
  }
  assert.equal(FIGURES.W1.gender, 'f'); assert.equal(FIGURES.M1.gender, 'm');
  assert.equal(Object.keys(FIGURE_META.figures).length, 6, 'the old baked women are still reproducible, but are not in the game');
});

for (const [id, m] of Object.entries(MASTERS)) {
  test(`${id}: its texture, its skeleton and all ${m.animations} of its animations, each with its own one-word name, each played where it stands`, () => {
    const parsed = parseGLB(master(m.file));
    assert.equal(parsed.json.skins[0].joints.length, m.joints);
    assert.equal(parsed.json.images.length, m.images, 'the textures are inside the file');
    assert.equal(parsed.animations.length, m.animations);
    const labels = figureLabels(parsed.animations.map((a) => a.name));
    assert.equal(new Set(labels).size, m.animations, `every animation has its own name: ${labels.join(' ')}`);
    for (const l of labels) assert.match(l, /^[A-Z][a-z]+$/, 'one word each');
    // standing, walking, running and swimming: the file's own, or (named ~) borrowed from another supplied figure
    const spec = ANIMATED[id];
    for (const a of [spec.walk, spec.run, spec.still, spec.swim]) {
      if (a.startsWith('~')) assert.ok(borrowedFor(m.file)[a.slice(1)], `${a} is borrowed for ${m.file}`);
      else assert.ok(parsed.animations.some((x) => x.name === a), `${a} is in the file`);
    }
    // what is shown for each thing that happens to it is in its own file
    for (const [kind, list] of Object.entries(spec.react)) for (const a of list) assert.ok(parsed.animations.some((x) => x.name === a), `${kind}: ${a} is in the file`);
    // nothing in the file moves the root or the hips across the ground
    for (const a of parsed.animations) for (const t of a.tracks) {
      if (t.path !== 'translation' || !['root', 'pelvis'].includes(t.node)) continue;
      for (let i = 3; i < t.values.length; i += 3) { assert.ok(Math.abs(t.values[i] - t.values[0]) < 0.02, `${a.name} moves ${t.node} sideways`); assert.ok(Math.abs(t.values[i + 2] - t.values[2]) < 0.02, `${a.name} moves ${t.node} forward`); }
    }
  });
}

test('the sitting pose is the woman\'s own sit animation, and fits both skeletons', () => {
  const w = parseGLB(master('woman.glb')), man = parseGLB(master('muscular_male.glb'));
  const sit = w.animations.find((a) => a.name === 'sit.001');
  const names = (p) => new Set(p.json.skins[0].joints.map((j) => p.json.nodes[j].name));
  for (const bone of Object.keys(SEAT_POSE)) { assert.ok(names(w).has(bone), `${bone} is hers`); assert.ok(names(man).has(bone), `${bone} is his too`); }
  const thigh = sit.tracks.find((t) => t.node === 'thigh_l' && t.path === 'rotation');
  const k = thigh.times.findIndex((t) => Math.abs(t - 1.0) < 0.03);
  assert.deepEqual(SEAT_POSE.thigh_l.map((v) => +v.toFixed(3)), Array.from(thigh.values.slice(k * 4, k * 4 + 4), (v) => +v.toFixed(3)));
});

test('what a figure lacks is borrowed onto its own bones, and each new figure has a seat of its own', () => {
  for (const [file, moves] of Object.entries(figureMoves().borrowed)) for (const [as, b] of Object.entries(moves)) {
    const parsed = parseGLB(master(file));
    const bones = new Set(parsed.json.skins[0].joints.map((j) => boneName(parsed.json.nodes[j].name)));
    for (const bone of b.bones) assert.ok(bones.has(bone), `${file} ${as}: ${bone} is one of its bones`);
    assert.ok(b.frames >= 2 && b.duration > 0.5);
    assert.equal(Buffer.from(b.data, 'base64').length, b.frames * b.bones.length * 4 * 2);
    assert.ok(!parseGLB(master(file)).animations.some((a) => a.name.replace(/\.\d+$/, '') === as), `${file} has no ${as} of its own`);
  }
  for (const file of ['athlete.glb', 'police.glb', 'priest.glb', 'warrior.glb', ...[...NEW_WOMEN, ...NEW_MEN].map((id) => FIGURES[id].file)]) {
    const parsed = parseGLB(master(file));
    const bones = new Set(parsed.json.skins[0].joints.map((j) => boneName(parsed.json.nodes[j].name)));
    assert.ok(Object.keys(seatFor(file)).length >= 20, file);
    for (const bone of Object.keys(seatFor(file))) assert.ok(bones.has(bone), `${file}: ${bone}`);
  }
  // a woman borrows the woman's walk and run, a man the man's walk and the warrior's run
  for (const id of NEW_WOMEN) for (const [as, b] of Object.entries(borrowedFor(FIGURES[id].file))) if (as === 'walk' || as === 'run') assert.match(b.from, /^woman\.glb#/, `${id} ${as}`);
  for (const id of NEW_MEN) for (const [as, b] of Object.entries(borrowedFor(FIGURES[id].file))) if (as === 'walk' || as === 'run') assert.match(b.from, /^(muscular_male|warrior)\.glb#/, `${id} ${as}`);
});

test('a figure look is checked: an unknown figure is refused and a colour that is not a colour takes the default', () => {
  assert.equal(cleanFigureLook({ figure: 'F9' }), null);
  assert.equal(cleanFigureLook({ figure: 'F2' }), null, 'the old baked women are not accepted any more');
  assert.equal(cleanFigureLook({ figure: 'constructor' }), null);
  assert.equal(cleanFigureLook(null), null);
  const look = cleanFigureLook({ figure: 'W1', body: 'm', colours: { skin: 0x6b4226, hair: 'red', top: -4, bottom: 0x1000000, hat: 0x7b2d2d, extra: 3 } });
  assert.equal(look.figure, 'W1');
  assert.equal(look.body, 'f', 'the figure says whose it is, not the client');
  assert.deepEqual(look.colours, { skin: 0x6b4226, hair: FIGURE_DEFAULTS.hair, top: FIGURE_DEFAULTS.top, bottom: FIGURE_DEFAULTS.bottom, shoes: FIGURE_DEFAULTS.shoes, hat: 0x7b2d2d });
  const spec = characterSpec(configFromLook(look));
  assert.equal(spec.figure, 'W1');
  for (const p of FIGURE_PARTS) assert.ok(p in FIGURE_DEFAULTS);
});

test('the choice on the start screen: a woman or a man, the arrows going round each list, the name each starts with', () => {
  const c = createChoice({});
  assert.equal(c.gender, 'f');
  assert.equal(c.figure.id, 'W1');
  assert.deepEqual(Array.from({ length: FIGURE_ORDER.f.length }, () => c.step(1).id), ['W2', 'W3', ...NEW_WOMEN, 'W1'], 'the arrows go through the women only');
  assert.equal(c.step(-1).id, FIGURE_ORDER.f.at(-1)); assert.equal(c.step(-1).id, FIGURE_ORDER.f.at(-2));
  c.step(1); c.step(1);
  assert.equal(c.step(1).id, 'W2');
  assert.equal(c.setGender('m').id, 'M1');
  assert.deepEqual(Array.from({ length: FIGURE_ORDER.m.length }, () => c.step(1).id), ['M4', 'M5', ...NEW_MEN, 'M1'], 'the arrows go through the men only');
  c.setGender('f'); assert.equal(c.figure.id, 'W2', 'each list keeps its place');
  assert.equal(FIGURES.W1.name, 'Adaeze'); assert.equal(FIGURES.M1.name, 'Emeka');
  assert.deepEqual(['W2', 'W3', 'M4', 'M5'].map((id) => FIGURES[id].name), ['Ngozi', 'Amaka', 'Ikenna', 'Uche']);
  assert.equal(new Set(Object.values(FIGURES).map((f) => f.name)).size, Object.keys(FIGURES).length, 'each starts with a name of its own');
  assert.equal(createChoice({ figure: 'M4' }).figure.id, 'M4');
  // the last choice on this device is where the screen starts; an old one starts at the woman
  assert.equal(createChoice({ figure: 'M1' }).figure.id, 'M1');
  assert.equal(createChoice({ figure: 'F4' }).figure.id, 'W1');
});

test('the figure joins with the character, is saved with it, and comes back on a reload', () => {
  const host = createHost();
  const id = host.game.join({ name: 'Adaeze Test', look: createChoice({ figure: 'W1' }).look() });
  const look = host.game.view(id).self.look;
  assert.equal(look.figure, 'W1');
  const saved = JSON.parse(JSON.stringify(host.save()));
  const again = createHost({ saved });
  assert.deepEqual(again.game.view(id).self.look, look);
  const other = host.game.join({ name: 'Nobody Test', look: { figure: 'Z1', skin: 0x4a2c17 } });
  assert.equal(host.game.view(other).self.look.figure, undefined);
  assert.equal(host.game.view(other).self.look.outfit, 'streetwear');
});

test('another player sees the figure that was chosen: it travels with the player and is checked again on arrival', () => {
  const host = createHost();
  const id = host.game.join({ name: 'Emeka Test', look: { figure: 'M1', colours: { top: 0x1a1a1c } } });
  const self = host.game.view(id).self;
  const sent = JSON.parse(JSON.stringify(encodePlayer(self, ZONE.id)));
  const heard = decodePlayer(sent, ZONE.id);
  assert.equal(heard.look.figure, 'M1');
  const watcher = createHost();
  const w = watcher.game.join({ name: 'Watcher Test', look: {} });
  watcher.game.state.players[w].x = self.x + 2; watcher.game.state.players[w].z = self.z;
  watcher.game.visitors.seen('remote-1', { ...heard, x: self.x + 1, z: self.z, look: { ...heard.look, colours: { ...heard.look.colours, top: 'not a colour' } } });
  const seen = watcher.game.visitors.list()[0];
  assert.ok(seen, 'the visitor is known');
  assert.equal(seen.look.figure, 'M1');
  assert.equal(seen.look.colours.top, FIGURE_DEFAULTS.top);
});

test('a character saved with one of the figures taken out of the game comes back as an ordinary character, not a broken one', () => {
  for (const old of ['F1', 'M3']) {
    const host = createHost();
    const id = host.game.join({ name: 'Old Save Test', look: { figure: 'W1' } });
    host.game.state.players[id].look = { ...host.game.state.players[id].look, figure: old };
    const saved = JSON.parse(JSON.stringify(host.save()));
    const again = createHost({ saved });
    const spec = characterSpec(configFromLook(again.game.view(id).self.look));
    assert.equal(spec.figure, undefined, `${old} is drawn from the kit`);
    assert.ok(spec.parts.length > 2);
  }
});
