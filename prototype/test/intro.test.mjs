// The opening: what can be checked of it without a page. The page itself is walked through in test/play.mjs.
//
//   node --test test/intro.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { INTRO_TIMES, PATHS, pathForKey, coverLayout } from '../src/client/intro.js';
import { COVER } from '../src/client/brand-data.js';
import { createHost } from '../src/sim/host.js';

const here = (path) => new URL(`../${path}`, import.meta.url);

test('the splash is a little over a second (it was five until 20 October 2026), and nothing on it is pressed: the cover and its PLAY come after it', () => {
  assert.equal(INTRO_TIMES.splash, 1200);
  assert.deepEqual(PATHS, ['hero', 'villain']);
  const page = readFileSync(here('src/client/template.html'), 'utf8');
  assert.ok(!page.includes('intro-play'), 'the splash has no PLAY of its own');
  assert.ok(!/slide-img|intro-skip|class="slides"/.test(page), 'the story in pictures is gone');
  assert.ok(page.includes('id="cover-play"'), 'PLAY is on the cover');
  assert.ok(!existsSync(here('assets/brand/slides')), 'and so are its pictures');
});

test('the cover is the supplied picture: kept as supplied, and carried in the page in four pieces', () => {
  assert.ok(existsSync(here('assets/brand/cover/cover-master.jpg')), 'the picture as it was supplied');
  for (const piece of ['plate.jpg', 'logo.png', 'words.png', 'play.png', 'cover.json']) assert.ok(existsSync(here(`assets/brand/cover/${piece}`)), piece);
  assert.ok(COVER.plate.startsWith('data:image/webp;base64,'));
  for (const piece of ['logo', 'words', 'play']) {
    assert.ok(COVER[piece].src.startsWith('data:image/webp;base64,'), `${piece} travels inside the page`);
    for (const key of ['x', 'y', 'w', 'h']) assert.ok(COVER[piece][key] > 0 && COVER[piece][key] < 1, `${piece}.${key}`);
  }
  assert.ok(Math.abs(COVER.aspect - 16 / 9) < 0.01);
  assert.ok(COVER.alt.length > 40, 'described for someone who cannot see it');
  assert.match(COVER.sky, /^#[0-9a-f]{6}$/);
});

const SCREENS = [[320, 568], [360, 640], [390, 844], [412, 915], [768, 1024], [820, 1180], [900, 900], [1024, 768], [1180, 820], [740, 360], [844, 390], [932, 430], [1280, 720], [1366, 768], [1440, 900], [1920, 1080], [2560, 1080], [3440, 1440], [280, 653], [1000, 1000]];
const inside = (box, W, H) => box.x >= -0.5 && box.y >= -0.5 && box.x + box.w <= W + 0.5 && box.y + box.h <= H + 0.5;
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test('on a 16:9 screen every piece of the cover is back exactly where it was in the picture', () => {
  for (const [W, H] of [[1280, 720], [1920, 1080], [2560, 1440]]) {
    const at = coverLayout(W, H);
    assert.equal(at.mode, 'wide');
    assert.deepEqual([at.plate.x, at.plate.y, Math.round(at.plate.w), Math.round(at.plate.h)], [0, 0, W, H].map((v, i) => (i === 2 ? Math.round(H * COVER.aspect) : v)));
    for (const piece of ['logo', 'words', 'play']) {
      const box = at[piece];
      assert.ok(Math.abs(box.x - COVER[piece].x * at.plate.w) < 0.6 && Math.abs(box.y - COVER[piece].y * at.plate.h) < 0.6, `${piece} at ${W}x${H}`);
      assert.ok(Math.abs(box.w - COVER[piece].w * at.plate.w) < 0.6 && Math.abs(box.h - COVER[piece].h * at.plate.h) < 0.6, `${piece} size at ${W}x${H}`);
    }
  }
});

test('on every screen the whole name and the whole of PLAY are in view, PLAY is big enough for a finger, and the picture leaves no gap', () => {
  for (const [W, H] of SCREENS) {
    const at = coverLayout(W, H);
    const label = `${W}x${H} (${at.mode})`;
    assert.ok(inside(at.logo, W, H), `the name on ${label}: ${JSON.stringify(at.logo)}`);
    assert.ok(inside(at.play, W, H) && inside(at.hit, W, H), `PLAY on ${label}: ${JSON.stringify(at.hit)}`);
    assert.ok(at.hit.h >= 47.99 && at.hit.w >= 120, `PLAY is ${at.hit.w} by ${at.hit.h} on ${label}`);
    assert.ok(!overlap(at.logo, at.hit), `the name and PLAY overlap on ${label}`);
    if (at.words) { assert.ok(inside(at.words, W, H), `the words on ${label}`); assert.ok(!overlap(at.words, at.logo), `the words are on the name on ${label}`); }
    // the picture reaches both sides and the foot; above it, on a tall screen, is sky of its own colour
    assert.ok(at.plate.x <= 0.5 && at.plate.x + at.plate.w >= W - 0.5, `the picture leaves a gap at a side on ${label}`);
    assert.ok(at.plate.y + at.plate.h >= H - 0.5, `the picture stops short of the foot on ${label}`);
    if (at.mode === 'wide') assert.ok(at.plate.y <= 0.5, `the picture starts below the top on ${label}`);
    // neither is squashed
    assert.ok(Math.abs(at.plate.w / at.plate.h - COVER.aspect) < 0.01, `the picture is squashed on ${label}`);
    assert.ok(Math.abs(at.logo.w / at.logo.h - COVER.logo.ratio) < 0.01 && Math.abs(at.play.w / at.play.h - COVER.play.ratio) < 0.01, `a piece is squashed on ${label}`);
    // the two figures are on the screen from side to side
    const left = at.plate.x + COVER.figures[0] * at.plate.w, right = left + COVER.figures[2] * at.plate.w;
    assert.ok(left >= -1 && right <= W + 1, `the figures run from ${Math.round(left)} to ${Math.round(right)} of ${W} on ${label}`);
    // and on a wide screen the name is clear of them
    if (at.mode === 'wide') assert.ok(at.logo.x + at.logo.w < left, `the name is over the figures on ${label}`);
    else assert.ok(at.logo.y + at.logo.h <= at.plate.y + 0.5, `the name is over the picture on ${label}`);
  }
});

test('a notch or a home bar is kept clear of', () => {
  const tall = coverLayout(390, 844, COVER, { top: 47, bottom: 34 });
  assert.ok(tall.logo.y >= 47 && tall.hit.y + tall.hit.h <= 844 - 34);
  const wide = coverLayout(844, 390, COVER, { left: 47, right: 47 });
  assert.ok(wide.logo.x >= 47 && wide.words.x + wide.words.w <= 844 - 47);
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
