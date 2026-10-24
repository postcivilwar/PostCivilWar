// The light from the whole sky (sky-light.js, stage 3 of the owner's brief: "Lighting from the whole sky that changes with
// the time of day ... warm sunrise and sunset, cool moonlight"): nine colours a surface reads by the way it faces,
// scaled so the town is as bright as it was tuned.
//
//   node --test test/sky-light.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.THREE = require('../vendor/three.min.js');
const { skyHarmonics, irradianceAt } = await import('../src/client/sky-light.js');
const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

test('a surface facing up, and one facing down, get just what the hemisphere light gave them, colour by colour', () => {
  const up = [1.9, 2.1, 2.4], down = [0.9, 0.8, 0.6];
  const sh = skyHarmonics({ top: [0.2, 0.35, 0.7], horizon: [0.6, 0.66, 0.7], sun: [0.6, 0.6, 0.53], glow: [0.5, 0.48, 0.4], aureole: 0.3, ground: [0.25, 0.2, 0.13] }, { up, down });
  const u = irradianceAt(sh, [0, 1, 0]), d = irradianceAt(sh, [0, -1, 0]);
  for (let k = 0; k < 3; k += 1) {
    assert.ok(near(u[k], up[k], 0.01), `up ${u} against ${up}`);
    assert.ok(near(d[k], down[k], 0.02), `down ${d} against ${down}`);
  }
  // (the colour of the town as tuned: the bluer sky does not make the ground bluer than the hemisphere light did)
  assert.ok(Math.abs(u[2] / u[0] - up[2] / up[0]) < 0.02);
});

test('a low sun in the east: the wall facing it is lit brighter and warmer than the wall turned from it', () => {
  const sun = [Math.cos(0.1), Math.sin(0.1), 0];       // low in the east (+x)
  const sh = skyHarmonics({ top: [0.25, 0.35, 0.6], horizon: [0.8, 0.5, 0.3], sun, glow: [1.0, 0.6, 0.3], aureole: 1, ground: [0.2, 0.15, 0.1] }, { up: [2, 2, 2.2], down: [0.6, 0.5, 0.4] });
  const east = irradianceAt(sh, [1, 0, 0]), west = irradianceAt(sh, [-1, 0, 0]);
  assert.ok(luma(east) > luma(west) * 1.2, `east ${luma(east).toFixed(3)} against west ${luma(west).toFixed(3)}`);
  assert.ok(east[0] / east[2] > west[0] / west[2], 'warmer towards the sun');
});

test('under the moon the side towards it is the brighter, and cool', () => {
  const moon = [-0.5, 0.6, 0.62];
  const len = Math.hypot(...moon), m = moon.map((x) => x / len);
  const sh = skyHarmonics({ top: [0.01, 0.015, 0.04], horizon: [0.02, 0.025, 0.06], sun: m, glow: [0.15, 0.2, 0.35], aureole: 0.6, ground: [0.02, 0.018, 0.015] }, { up: [0.3, 0.33, 0.45], down: [0.1, 0.09, 0.08] });
  const towards = irradianceAt(sh, [m[0], 0, m[2]].map((x) => x / Math.hypot(m[0], m[2]))), away = irradianceAt(sh, [-m[0], 0, -m[2]].map((x) => x / Math.hypot(m[0], m[2])));
  assert.ok(luma(towards) > luma(away), 'brighter towards the moon');
  assert.ok(towards[2] > towards[0], 'and blue more than red');
});

test('the nine colours never make a surface receive less than nothing, whichever way it faces', () => {
  const sh = skyHarmonics({ top: [0.2, 0.35, 0.7], horizon: [0.9, 0.55, 0.3], sun: [0.99, 0.12, 0], glow: [1.2, 0.7, 0.3], aureole: 1, ground: [0.2, 0.16, 0.1] }, { up: [2, 2, 2.2], down: [0.5, 0.45, 0.35] });
  for (let i = 0; i < 200; i += 1) {
    const z = 1 - (2 * (i + 0.5)) / 200, r = Math.sqrt(1 - z * z), a = i * 2.39996;
    const e = irradianceAt(sh, [Math.cos(a) * r, z, Math.sin(a) * r]);
    assert.ok(e.every((x) => x > -0.02), `${e}`);
  }
});
