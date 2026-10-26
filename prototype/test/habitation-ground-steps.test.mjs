// The habitation's drawn ground worked out a piece at a time (26 October 2026, the owner's brief: the game hung on his
// phones; its 101,000 points were 25 seconds at once on a phone's settings): the ground at the decks' ends a row at a
// time (habitationGroundWarm), and each point from only the 1 m squares' corners it is made from (landOnGrid in
// zones/habitation.js). The heights must be the same as before to the last bit: the simulation stands every walker on
// them. (Checked over all 101,043 points against the build before it, byte for byte, on 26 October; here, a sample.)
//
//   node --test test/habitation-ground-steps.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

const H = await import('../src/sim/zones/habitation.js');

test('the ground at the decks\' ends is worked out a row at a time, and the points after it as they always were', () => {
  let steps = 0;
  for (const _ of H.habitationGroundWarm()) steps += 1;
  assert.ok(steps > 100, `in pieces: ${steps}`);
  // asked for again once done: nothing to do
  let again = 0;
  for (const _ of H.habitationGroundWarm()) again += 1;
  assert.equal(again, 0);
  const G = H.HABITATION_GROUND, { x: nx, z: nz } = H.HABITATION_GROUND_POINTS, P = H.UPRIVER.park;
  let same = 0, raised = 0, rows = 0;
  for (let j = 0; j < nz; j += 23) {
    rows += 1;
    for (let i = 0; i < nx; i += 1) {
      const x = G.x0 + i * G.step, z = G.z0 + j * G.step;
      // (as habitationGroundPoint was: the land from the 1 m squares, the town's side and the car park a little below)
      let y = H.habitationLand(x, z);
      if (x < H.HABITATION.bounds.x0) y = Math.min(y, -0.12);
      if (x < P.x1 + 1.5 && z > P.z0 - 1.5 && z < P.z1 + 1.5) y = Math.min(y, -0.08);
      // (the first time asked, a point is given as worked out; after, as kept: Float32)
      const got = Math.fround(H.habitationGroundPoint(i, j));
      if (got === Math.fround(y)) same += 1;
      else { assert.ok(got > y, `only ever raised, at a deck's end: ${i},${j} ${got} ${y}`); raised += 1; }
    }
  }
  assert.ok(rows >= 14);
  assert.ok(raised <= 5 && same >= rows * nx - 5, `${same} the same, ${raised} raised at a deck's end`);
});
