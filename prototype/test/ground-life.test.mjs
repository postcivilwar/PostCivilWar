// What moves over the ground leaves its traces (stage 3 of the owner's brief and his extras of 24 October): dust lifted
// behind vehicles on dirt (dust.js), wet footprints and tyre marks after rain (wet-tracks.js), and the fireflies round the
// player in the habitation at night (fireflies.js). Each worked through here frame by frame, without a screen.
//
//   node --test test/ground-life.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.THREE = require('../vendor/three.min.js');
// (a page's canvas, as far as the marks' pictures need one)
const context = new Proxy({}, { get: (target, name) => (name === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => context }) };
const { createDust } = await import('../src/client/dust.js');
const { createWetTracks } = await import('../src/client/wet-tracks.js');
const { createFireflies } = await import('../src/client/fireflies.js');

// a vehicle or a walker going straight along +z at `speed` m/s for `seconds`, the frames 1/30 s apart
function drive(thing, kind, speed, seconds, extra = {}) {
  const dt = 1 / 30;
  let z = 0;
  for (let t = 0; t < seconds; t += dt) {
    z += speed * dt;
    thing.update(dt, { amount: 1, movers: [{ key: 'v', x: 0, z, heading: 0, kind }], ground: () => 0, eye: { x: 0, z }, ...extra });
  }
}

test('dust: a car on dirt lifts puffs behind it; none on tarmac, none on wet ground, none from someone walking', () => {
  const run = (kind, speed, extra) => { const scene = new THREE.Scene(); const d = createDust(scene); drive(d, kind, speed, 3, extra); return d.state(); };
  const dirt = run('car', 9, { dirt: () => true, wet: 0 });
  assert.ok(dirt.emitted > 10 && dirt.puffs > 5, `on dirt: ${JSON.stringify(dirt)}`);
  assert.equal(run('car', 9, { dirt: () => false, wet: 0 }).emitted, 0, 'on tarmac');
  assert.equal(run('car', 9, { dirt: () => true, wet: 0.6 }).emitted, 0, 'on wet ground');
  assert.equal(run('foot', 1.5, { dirt: () => true, wet: 0 }).emitted, 0, 'a walker');
  assert.equal(run('car', 1.5, { dirt: () => true, wet: 0 }).emitted, 0, 'a car creeping along');
  // and the faster, the more
  assert.ok(run('car', 14, { dirt: () => true, wet: 0 }).emitted > dirt.emitted, 'faster, more');
});

test('wet marks: footprints left and right while the ground is wet, the lines of a car\'s wheels; none on dry ground', () => {
  const scene = new THREE.Scene();
  const w = createWetTracks(scene);
  drive(w, 'foot', 1.4, 5, { wet: 0.8, raining: 0 });
  const s = w.state();
  // 7 m walked: a print every 0.72 m
  assert.ok(s.feet >= 8 && s.feet <= 11, `footprints ${JSON.stringify(s)}`);
  const dry = createWetTracks(new THREE.Scene());
  drive(dry, 'foot', 1.4, 5, { wet: 0, raining: 0 });
  assert.equal(dry.state().laid, 0, 'dry ground');
  const car = createWetTracks(new THREE.Scene());
  drive(car, 'car', 6, 3, { wet: 0.6, raining: 0 });
  // 18 m: two lines, a piece every 0.45 m or so
  assert.ok(car.state().wheels > 50, `tyre marks ${JSON.stringify(car.state())}`);
  const bike = createWetTracks(new THREE.Scene());
  drive(bike, 'bike', 6, 3, { wet: 0.6, raining: 0 });
  assert.ok(bike.state().wheels > 20 && bike.state().wheels < car.state().wheels * 0.7, 'a motorcycle: one line');
});

test('fireflies: shown only while asked (night in the habitation), coming and going gently', () => {
  const scene = new THREE.Scene();
  const f = createFireflies(scene);
  const step = (amount, n) => { for (let i = 0; i < n; i += 1) f.update(1 / 30, { amount, eye: { x: 0, z: 0 }, camera: { fov: 50 }, height: 800, ground: () => 2 }); };
  step(0, 30);
  assert.equal(f.state().shown, false);
  step(1, 15);
  assert.ok(f.state().level > 0 && f.state().level < 0.5, 'coming out slowly');
  step(1, 300);
  assert.equal(f.state().shown, true);
  step(0, 600);
  assert.equal(f.state().shown, false, 'gone by day');
});
