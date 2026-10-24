// The colour grade (grade.js, stage 3 of the owner's brief of 23 October: "Filmic colour grading suited to Nigeria's
// warm daylight (all levels)"): three.js's own place for a tone mapping filled once with the game's; the mid-tones as
// chosen, a soft shoulder above them, warm by day, warmest at the golden hour, cool under the moon.
//
//   node --test test/grade.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.THREE = require('../vendor/three.min.js');
const { KNEE, GRADE_GLSL, gradeInstalled, gradeColour, warmthAt } = await import('../src/client/grade.js');

test('three.js\'s place for a tone mapping of the game\'s own is filled once, with the grade', () => {
  assert.equal(gradeInstalled, true);
  const chunk = THREE.ShaderChunk.tonemapping_pars_fragment;
  assert.ok(chunk.includes(GRADE_GLSL), 'the grade is the custom tone mapping');
  assert.ok(!chunk.includes('vec3 CustomToneMapping( vec3 color ) { return color; }'), 'three.js\'s placeholder is gone');
  assert.equal(chunk.split('vec3 CustomToneMapping(').length, 2, 'once');
  assert.ok(typeof THREE.CustomToneMapping === 'number', 'the library carries the name the game asks for');
});

test('the colours as chosen in the mid-tones; above the knee a soft shoulder towards white, never past it', () => {
  for (const c of [[0.5, 0.3, 0.2], [0.05, 0.08, 0.12], [KNEE, 0.4, 0.1]]) {
    assert.deepEqual(gradeColour(c, 0).map((x) => +x.toFixed(6)), c.map((x) => +x.toFixed(6)), `${c} unchanged with no warmth`);
  }
  let before = 0;
  for (const x of [0.86, 0.9, 1, 1.2, 1.5, 3, 10]) {
    const [y] = gradeColour([x, x, x], 0);
    assert.ok((x <= 1.5 ? y > before : y >= before) && y <= 1 && y < x, `${x} → ${y.toFixed(4)}: rolled off, rising, never past white`);
    before = y;
  }
  assert.ok(gradeColour([1, 1, 1], 0)[0] > 0.94, 'white still nearly white');
});

test('warm in the day\'s light, warmer at sunrise and sunset, cool under the moon; less of it under cloud, none indoors', () => {
  const noon = warmthAt(12), low = warmthAt(6.6), dusk = warmthAt(18.2), night = warmthAt(0.5);
  assert.ok(noon > 0.3 && noon < 0.6, `noon ${noon}`);
  assert.ok(low > 0.8 && dusk > 0.8, `the golden hour ${low}, ${dusk}`);
  assert.ok(night < -0.6, `night ${night}`);
  // the colour of the hour: fresher in the morning than in the afternoon, blue at dusk
  assert.ok(warmthAt(9.5) < warmthAt(15.5), `morning ${warmthAt(9.5)} against afternoon ${warmthAt(15.5)}`);
  assert.ok(warmthAt(19.2) < 0, `dusk ${warmthAt(19.2)}`);
  assert.ok(warmthAt(12, { dull: 1 }) < noon, 'under cloud, less');
  assert.equal(warmthAt(12, { indoor: 1 }), 0, 'a hall lit by its own panels: none');
  // the colour the warmth gives a grey wall: redder and less blue by day, bluer at night
  const [rd, , bd] = gradeColour([0.4, 0.4, 0.4], noon), [rn, , bn] = gradeColour([0.4, 0.4, 0.4], night);
  assert.ok(rd > 0.4 && bd < 0.4, 'by day warm');
  assert.ok(bn > 0.4 && rn < 0.4, 'at night cool');
  // never far: a few hundredths
  assert.ok(Math.abs(rd - 0.4) < 0.03 && Math.abs(bn - 0.4) < 0.03);
});

test('the shader and its twin here agree: the same numbers in both', () => {
  for (const n of ['0.85', '0.045', '0.008', '-0.06', '0.06', '0.05', '0.15']) assert.ok(GRADE_GLSL.includes(n), n);
});
