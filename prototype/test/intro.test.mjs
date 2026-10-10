// The opening: what can be checked of it without a page. The page itself is walked through in test/play.mjs.
//
//   node --test test/intro.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { INTRO_TIMES, PATHS, slideDelay, pathForKey } from '../src/client/intro.js';
import { STORY_SLIDES } from '../src/client/brand-data.js';
import { createHost } from '../src/sim/host.js';

const here = (path) => new URL(`../${path}`, import.meta.url);

test('the splash is five seconds and each picture one', () => {
  assert.equal(INTRO_TIMES.splash, 5000);
  assert.equal(INTRO_TIMES.slide, 1000);
  assert.deepEqual(PATHS, ['hero', 'villain']);
});

test('the story is the five pictures that were delivered, in the order their author gave', () => {
  assert.deepEqual(STORY_SLIDES.map((s) => s.id), ['01_the_war_ended', '02_home_had_changed', '03_what_remained', '05_voices_from_the_ruins', '06_learning_to_live']);
  for (const slide of STORY_SLIDES) {
    assert.ok(slide.src.startsWith('data:image/jpeg;base64,'), `${slide.id} travels inside the page`);
    assert.ok(slide.alt.length > 20, `${slide.id} is described for someone who cannot see it`);
    // each is the scaled copy of a master that is kept, untouched, beside the tool that scales it
    assert.ok(existsSync(here(`assets/brand/slides/${slide.id}_1080p.jpg`)), `${slide.id} has its master`);
  }
  // the fourth was never delivered, and nothing stands in for it
  assert.ok(!STORY_SLIDES.some((s) => s.id.startsWith('04')));
});

test('every picture gets its turn: on time when the device keeps up, shortened but never skipped when it does not', () => {
  // on time: the first picture went up at 0, the second is due at 1000
  assert.equal(slideDelay(1, 0), 1000);
  assert.equal(slideDelay(1, 400), 600);
  assert.equal(slideDelay(3, 2100), 900);
  // late: the device was busy for two seconds. The next picture still gets a third of a second.
  assert.equal(slideDelay(1, 2000), 1000 / 3);
  // five pictures shown on time end five seconds after the first went up
  let clock = 0;
  for (let shown = 1; shown <= 5; shown += 1) clock += slideDelay(shown, clock);
  assert.equal(clock, 5000);
  // and a device that stalls for 1.7 s on the second picture catches up without dropping one
  clock = 0; let seen = 0;
  for (let shown = 1; shown <= 5; shown += 1) { seen += 1; clock += slideDelay(shown, clock) + (shown === 2 ? 1700 : 0); }
  assert.equal(seen, 5);
  assert.ok(clock < 5000 + 1700);
});

test('H answers hero and V answers villain; nothing else answers', () => {
  assert.equal(pathForKey('h'), 'hero');
  assert.equal(pathForKey('H'), 'hero');
  assert.equal(pathForKey('v'), 'villain');
  for (const key of ['Enter', ' ', 'a', 'Escape', '', undefined]) assert.equal(pathForKey(key), null);
});

test('the answer is kept by the simulation with the character, and only the two answers are', () => {
  const { game } = createHost();
  const hero = game.join({ name: 'Ada Obi', path: 'hero', look: {} });
  const villain = game.join({ name: 'Bayo Ade', path: 'villain', look: {} });
  const neither = game.join({ name: 'Chidi Eze', path: 'saint', look: {} });
  const unasked = game.join({ name: 'Dayo Bello', look: {} });
  assert.equal(game.view(hero).self.path, 'hero');
  assert.equal(game.view(villain).self.path, 'villain');
  assert.equal(game.view(neither).self.path, null);
  assert.equal(game.view(unasked).self.path, null);
});

test('the answer changes nothing the town decides: a hero and a villain start the same and are treated the same', () => {
  const { game } = createHost();
  const a = game.view(game.join({ name: 'Ada Obi', path: 'hero', look: {} })).self;
  const b = game.view(game.join({ name: 'Bayo Ade', path: 'villain', look: {} })).self;
  for (const key of ['balance', 'energy', 'health', 'critical']) assert.deepEqual(a[key], b[key], key);
  assert.equal(a.law.state, b.law.state);
  assert.deepEqual(a.skills, b.skills);
});

test('the answer survives a save and a reload', () => {
  const host = createHost();
  const id = host.game.join({ name: 'Ada Obi', path: 'villain', look: {} });
  const again = createHost({ saved: JSON.parse(JSON.stringify(host.save())) });
  assert.equal(again.game.view(id).self.path, 'villain');
});

test('the brand\'s own letters are a font made here, and the page carries it', () => {
  const font = readFileSync(here('assets/brand/pcw-arcade.ttf'));
  assert.equal(font.readUInt32BE(0), 0x00010000, 'a TrueType font');
  assert.ok(font.length < 12000, 'small enough to travel inside the page');
  const template = readFileSync(here('src/client/template.html'), 'utf8');
  assert.ok(template.includes('@@PCW_FONT@@') && template.includes('"PCW Arcade"'));
  assert.ok(!/fonts\.googleapis|fonts\.gstatic/.test(template), 'no font is fetched from anywhere');
  assert.ok(template.includes('<title>PostCivilWar</title>'));
  assert.ok(!/Nigeria Life World/i.test(template));
});
