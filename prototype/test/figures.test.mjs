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
import { parseGLB, animationLabel, boneName } from '../src/client/glb.js';
import { ANIMATED } from '../src/client/animated.js';
import { SEAT_POSE } from '../src/client/seat-pose.js';
import { BORROWED, SEATS } from '../src/client/figure-borrowed.js';

const master = (file) => { const b = readFileSync(new URL(`../assets/characters/figures/animated/${file}`, import.meta.url)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const MASTERS = {
  M1: { file: 'muscular_male.glb', md5: '36cc552a8a95352f60266797de804403', animations: 24, joints: 61, images: 1 },
  W1: { file: 'woman.glb', md5: '86cbd1e74c05c1adc5abd7c9f7d4d0a6', animations: 40, joints: 61, images: 1 },
  // supplied on 12 October 2026
  W2: { file: 'athlete.glb', md5: '0cd1ed9f2a89e026ef142f956a17423b', animations: 32, joints: 61, images: 1 },
  W3: { file: 'police.glb', md5: 'd7f5ddcf60e8e56583ed93db5ef2ed36', animations: 18, joints: 61, images: 1 },
  M4: { file: 'priest.glb', md5: 'cb27d9d600e3a46a67c509fc58854d65', animations: 19, joints: 65, images: 3 },
  M5: { file: 'warrior.glb', md5: '230877a24a149d161f015fc06706e3b8', animations: 14, joints: 65, images: 1 },
};

test('three women and three men, each drawn from the file the owner supplied, which is kept unchanged', () => {
  assert.deepEqual(FIGURE_ORDER.f, ['W1', 'W2', 'W3']);
  assert.deepEqual(FIGURE_ORDER.m, ['M1', 'M4', 'M5']);
  assert.deepEqual(Object.keys(FIGURES).sort(), ['M1', 'M4', 'M5', 'W1', 'W2', 'W3']);
  for (const id of FIGURE_ORDER.f) assert.equal(FIGURES[id].gender, 'f', `${id} is a woman`);
  for (const id of FIGURE_ORDER.m) assert.equal(FIGURES[id].gender, 'm', `${id} is a man`);
  // the ids of the figures taken out on 8 October are not given to new ones: an old save naming one stays as it was
  for (const old of ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'M2', 'M3']) assert.ok(!FIGURES[old], old);
  assert.deepEqual(['W2', 'W3', 'M4', 'M5'].map((id) => FIGURES[id].file), ['athlete.glb', 'police.glb', 'priest.glb', 'warrior.glb']);
  for (const f of Object.values(FIGURES)) {
    assert.ok(f.animated && ANIMATED[f.id], `${f.id} is drawn from its own file`);
    assert.equal(f.file, MASTERS[f.id].file);
    assert.equal(createHash('md5').update(Buffer.from(master(f.file))).digest('hex'), MASTERS[f.id].md5, `${f.file} is the file supplied on 8 October 2026`);
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
    const labels = parsed.animations.map((a) => animationLabel(a.name));
    assert.equal(new Set(labels).size, m.animations, `every animation has its own name: ${labels.join(' ')}`);
    for (const l of labels) assert.match(l, /^[A-Z][a-z]+$/, 'one word each');
    // standing, walking, running and swimming: the file's own, or (named ~) borrowed from another supplied figure
    const spec = ANIMATED[id];
    for (const a of [spec.walk, spec.run, spec.still, spec.swim]) {
      if (a.startsWith('~')) assert.ok(BORROWED[m.file] && BORROWED[m.file][a.slice(1)], `${a} is borrowed for ${m.file}`);
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
  for (const [file, moves] of Object.entries(BORROWED)) for (const [as, b] of Object.entries(moves)) {
    const parsed = parseGLB(master(file));
    const bones = new Set(parsed.json.skins[0].joints.map((j) => boneName(parsed.json.nodes[j].name)));
    for (const bone of b.bones) assert.ok(bones.has(bone), `${file} ${as}: ${bone} is one of its bones`);
    assert.ok(b.frames >= 2 && b.duration > 0.5);
    assert.equal(Buffer.from(b.data, 'base64').length, b.frames * b.bones.length * 4 * 2);
    assert.ok(!parseGLB(master(file)).animations.some((a) => a.name.replace(/\.\d+$/, '') === as), `${file} has no ${as} of its own`);
  }
  for (const file of ['athlete.glb', 'police.glb', 'priest.glb', 'warrior.glb']) {
    const parsed = parseGLB(master(file));
    const bones = new Set(parsed.json.skins[0].joints.map((j) => boneName(parsed.json.nodes[j].name)));
    assert.ok(Object.keys(SEATS[file]).length >= 20, file);
    for (const bone of Object.keys(SEATS[file])) assert.ok(bones.has(bone), `${file}: ${bone}`);
  }
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
  assert.deepEqual([c.step(1).id, c.step(1).id, c.step(1).id], ['W2', 'W3', 'W1'], 'the arrows go through the women only');
  assert.equal(c.step(-1).id, 'W3'); assert.equal(c.step(-1).id, 'W2');
  assert.equal(c.setGender('m').id, 'M1');
  assert.deepEqual([c.step(1).id, c.step(1).id, c.step(1).id], ['M4', 'M5', 'M1'], 'the arrows go through the men only');
  c.setGender('f'); assert.equal(c.figure.id, 'W2', 'each list keeps its place');
  assert.equal(FIGURES.W1.name, 'Adaeze'); assert.equal(FIGURES.M1.name, 'Emeka');
  assert.deepEqual(['W2', 'W3', 'M4', 'M5'].map((id) => FIGURES[id].name), ['Ngozi', 'Amaka', 'Ikenna', 'Uche']);
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
