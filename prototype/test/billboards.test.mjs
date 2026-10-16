// The town's advertising billboards: fifty of them (ten screens), well apart, each with its own identity, kind, size and category;
// every pole and leg on open ground (not on a road, in a building or in the river, nor hanging in the air), the
// owner's prices, and the server's copy of the list the same as the game's.
//   node --test test/billboards.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { ZONE_BILLBOARDS } from '../src/sim/zones/atani-billboards.js';
import { AD_CATEGORIES, AD_DURATIONS, BILLBOARD_TYPES, categoryOf, dailyCharge, faceOf, feetOf, EMPTY_FACE } from '../src/sim/billboards.js';
import { AD_TERMS, AD_TERMS_VERSION, AD_TERMS_CHECKBOX } from '../src/sim/ad-terms.js';
import * as Z from '../src/sim/zone.js';

const require = createRequire(import.meta.url);
const SERVER = require('../../api/_lib/billboards.json');
const inBox = (b, x, z, m = 0) => x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m;
// ground: the town's own land, or beyond it the drawn ground near where people go, which is flat (render-outskirts.js)
const nearAreas = (x, z) => Math.min(...Z.OUTSKIRT_AREAS.map((a) => Math.hypot(Math.max(a.x0 - x, 0, x - a.x1), Math.max(a.z0 - z, 0, z - a.z1))));
const ground = (x, z) => (x > -232 ? Z.zoneOnGround(x, z) : Z.zoneOnGround(x, z) || (x > -1325 && z > -655 && z < 110 && nearAreas(x, z) < 36));

test('fifty billboards, each with its own identity, in the five categories, ten of them screens', () => {
  assert.equal(ZONE_BILLBOARDS.length, 50);
  assert.equal(new Set(ZONE_BILLBOARDS.map((b) => b.id)).size, ZONE_BILLBOARDS.length);
  const count = {};
  for (const b of ZONE_BILLBOARDS) count[b.category] = (count[b.category] || 0) + 1;
  for (const c of Object.keys(AD_CATEGORIES)) assert.ok(count[c] >= 5, `${c}: ${count[c]}`);
  assert.equal(count.tv, 10, 'ten screens');
  for (const b of ZONE_BILLBOARDS) {
    const t = BILLBOARD_TYPES[b.type];
    assert.ok(t, b.type);
    assert.equal(!!t.tv, b.tv, b.id);
    const face = faceOf(b.type, b.scale);
    assert.deepEqual([face.width, face.height], [b.width, b.height], `${b.id}: its size is its kind's at its scale`);
    assert.equal(categoryOf(b.width, b.height, b.tv), b.category, `${b.id}: its category follows from its size`);
    assert.ok(['airport', 'road', 'town'].includes(b.region) && b.place.length > 4);
  }
  // every kind the owner's photographs show is used, and drawn from one of them
  const used = new Set(ZONE_BILLBOARDS.map((b) => b.type));
  for (const [id, t] of Object.entries(BILLBOARD_TYPES)) {
    assert.ok(used.has(id), `${id} is used`);
    assert.ok(existsSync(new URL(`../assets/billboards/reference/${t.ref}.jpg`, import.meta.url)) || existsSync(new URL(`../assets/billboards/reference/${t.ref}.jpeg`, import.meta.url)) || existsSync(new URL(`../assets/billboards/reference/${t.ref}.png`, import.meta.url)), `${id}: its photograph ${t.ref}`);
  }
  // the sizes vary: not one board scaled
  assert.ok(new Set(ZONE_BILLBOARDS.map((b) => `${b.width}x${b.height}`)).size >= 15);
  assert.equal(EMPTY_FACE, 'PLACE YOUR ADS');
});

test('well apart: none within 40 m of another, and never more than two close together (within 90 m)', () => {
  for (const a of ZONE_BILLBOARDS) {
    const near = ZONE_BILLBOARDS.filter((b) => b !== a && Math.hypot(a.x - b.x, a.z - b.z) < 90);
    assert.ok(near.length <= 1, `${a.id}: ${near.map((b) => b.id).join(', ')} close by`);
    for (const b of near) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 40, `${a.id} and ${b.id}`);
  }
});

test('every pole and leg stands on open ground: not on a road, in a building, a plot or the river, and not in the air', () => {
  const roads = [...Z.ZONE_ROADS, ...Z.OUTSKIRT_ROADS];
  const buildings = [...Z.ZONE_BUILDINGS, ...Z.ZONE_HOUSES, ...Z.OUTSKIRT_BUILDINGS].map((b) => ({ x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 }));
  const plots = Z.ZONE_PARCELS;
  for (const b of ZONE_BILLBOARDS) {
    assert.ok(b.feet.length >= 1 && b.feet.length === feetOf(b.type, b.scale).length, b.id);
    const heights = new Set();
    for (const [x0, z0, x1, z1] of b.feet) {
      for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [(x0 + x1) / 2, (z0 + z1) / 2]]) {
        assert.ok(ground(x, z), `${b.id}: a foot at ${x}, ${z} is on the ground`);
        assert.ok(!roads.some((r) => inBox(r, x, z, 0.5)), `${b.id}: a foot at ${x}, ${z} is on a road`);
        assert.ok(!buildings.some((r) => inBox(r, x, z)), `${b.id}: a foot at ${x}, ${z} is in a building`);
        assert.ok(!plots.some((r) => inBox(r, x, z)), `${b.id}: a foot at ${x}, ${z} is on a plot`);
        if (x > -232) assert.ok(z < Z.zoneShoreZ(x) - 2, `${b.id}: a foot in the river`);
        heights.add(Z.zoneGroundY(x, z));
      }
    }
    // the ground under it is level: its supports reach the ground at one height (the renderer runs them down to it)
    assert.equal(heights.size, 1, `${b.id}: the ground under it is not level (${[...heights]})`);
    // and each is something a player walks into, not through
    assert.ok(Z.ZONE_COLLIDERS.some((c) => c.billboard === b.id), `${b.id} has its supports as colliders`);
  }
});

test('the owner\'s prices: fee and tax a day by category, (fee + tax) × days, whole TR', () => {
  assert.deepEqual(Object.fromEntries(Object.values(AD_CATEGORIES).map((c) => [c.id, [c.fee, c.tax, dailyCharge(c.id)]])), { small: [66, 4, 70], medium: [132, 8, 140], large: [200, 16, 216], xl: [267, 32, 299], tv: [667, 64, 731] });
  // the owner's examples for seven days
  assert.deepEqual(['small', 'medium', 'large', 'xl', 'tv'].map((c) => dailyCharge(c) * 7), [490, 980, 1512, 2093, 5117]);
  assert.deepEqual(AD_DURATIONS.map((d) => d.days), [7, 14, 30, 60, 90, 180]);
  const ads = require('../../api/_lib/ads.js');
  for (const d of AD_DURATIONS) assert.equal(ads.DURATIONS[d.id], d.days, d.id);
  for (const c of Object.values(AD_CATEGORIES)) assert.deepEqual(ads.PRICES[c.id], { fee: c.fee, tax: c.tax });
});

test('the server\'s list of billboards is the game\'s, and the terms the page shows are the version the server asks for', () => {
  assert.equal(SERVER.length, ZONE_BILLBOARDS.length);
  for (let i = 0; i < SERVER.length; i += 1) {
    const s = SERVER[i], g = ZONE_BILLBOARDS[i];
    assert.deepEqual([s.id, s.type, s.category, s.tv, s.width, s.height, s.region, s.place], [g.id, g.type, g.category, g.tv, g.width, g.height, g.region, g.place]);
  }
  const ads = require('../../api/_lib/ads.js');
  assert.equal(ads.TERMS_VERSION, AD_TERMS_VERSION);
  assert.equal(AD_TERMS.length, 15);
  const text = JSON.stringify(AD_TERMS);
  for (const word of ['Ponzi', 'phishing', 'Malware', 'does not guarantee sales', 'starter grants']) assert.ok(text.includes(word), word);
  assert.match(AD_TERMS_CHECKBOX, /^I have read and agree to the Advertising Terms and Conditions\. I confirm that I have the rights to submit this artwork and understand that advertising does not guarantee sales or customers\.$/);
  // no email address in anything the page is given
  assert.doesNotMatch(text, /@[a-z0-9-]+\.[a-z]/i);
});
