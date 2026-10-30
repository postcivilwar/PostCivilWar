// The owner's sports models (30 October 2026): his files exactly as supplied, and the game's copies made from them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { SPORTS_PARTS } from '../src/client/sports-parts.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const asset = (rel) => resolve(ROOT, 'assets', 'sports', rel);

const manifest = JSON.parse(readFileSync(asset('sports.json'), 'utf8'));

test('his files are in the repository exactly as he sent them', () => {
  // his nine files, byte for byte as he sent them on 30 October 2026 (their SHA-256, taken from the files he attached)
  const expected = JSON.parse(readFileSync(resolve(HERE, 'fixtures', 'sports-masters.json'), 'utf8'));
  assert.equal(Object.keys(expected).length, 9, 'nine files');
  for (const [file, sha] of Object.entries(expected)) {
    assert.ok(existsSync(asset(file)), file);
    assert.equal(createHash('sha256').update(readFileSync(asset(file))).digest('hex'), sha, file);
  }
  for (const [id, m] of Object.entries(manifest)) assert.equal(m.sha256, expected[m.master], `${id}: made from this very file`);
});

test('each game copy is every triangle of his file, its parts in order', () => {
  for (const [id, m] of Object.entries(manifest)) {
    const p = SPORTS_PARTS[id];
    assert.ok(p, id);
    assert.equal(p.counts.reduce((a, b) => a + b, 0), m.triangles, `${id}: every triangle in one part or another`);
    assert.equal(p.parts[0], 'body', id);
    const bin = statSync(asset(`game/${p.files.mesh}`)).size;
    const n = p.vertices;
    const expected = n * 12 + n * 6 + (n % 2) * 2 + n * 8 + p.triangles * 3 * (p.index === 32 ? 4 : 2);
    assert.equal(bin, expected, `${id}: the shape's file holds what it says`);
    for (const tag of ['2k', '1k', '512']) assert.ok(existsSync(asset(`game/${p.files[`color${tag}`]}`)), `${id} ${tag}`);
  }
});

test('the copies are their real sizes, standing on the ground, facing +Z', () => {
  const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} (expected ${b} ± ${tol})`);
  const P = SPORTS_PARTS;
  near(P.bicycle.size[2], 1.75, 0.01, 'the bicycle is 1.75 m long');
  near(P.bicycle.wheels.front.r, 0.365, 0.02, "the bicycle's wheels are 0.73 m across");
  assert.ok(P.bicycle.wheels.front.c[2] > 0.4 && P.bicycle.wheels.rear.c[2] < -0.4, 'its front wheel is at the front');
  near(P.bicycle.seat[1], 0.96, 0.05, 'its saddle is 0.96 m up');
  near(P.bicycle.crank.r, 0.17, 0.02, 'its cranks are 17 cm');
  near(P.skateboard.size[2], 0.98, 0.01, 'the skateboard is 0.98 m long');
  assert.equal(Object.keys(P.skateboard.wheels).length, 4, 'four wheels');
  assert.equal(Object.keys(P['inline-skates'].wheels).length, 4, 'four wheels on a skate');
  for (const w of Object.values(P['inline-skates'].wheels)) near(w.r, 0.04, 0.005, 'a skate wheel is 80 mm');
  near(P['e-scooter'].size[1], 1.15, 0.01, 'the scooter is 1.15 m to its bars');
  assert.ok(P['e-scooter'].wheels.front.c[2] > 0.3, "the scooter's front wheel is at the front");
  near(P.hoverboard.size[0], 0.58, 0.01, 'the hoverboard is 0.58 m across');
  near(P.speedboat.size[2], 5.2, 0.01, 'the speedboat is 5.2 m long');
  assert.ok(P.speedboat.motor.p[2] < -1.5, "the boat's motor is at its stern");
  near(P.surfboard.size[2], 1.83, 0.01, 'the surfboard is 1.83 m long');
  for (const [id, p] of Object.entries(P)) assert.ok(p.size.every((v) => v > 0), id);
});
