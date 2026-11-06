// A car's doors cut from its model (6 November 2026, the owner's brief: "The doors hinge at their front edge; an open
// door shows its inside panel and its window glass; the opening shows the cabin (seats, dashboard), never a hollow shell
// or ragged edges"), and the lit dials of the cars with cabins of their own ("add ... only what's missing (the doors'
// insides, lit dials)"). Headless, from the game's own copies of the cars (src/client/car-door-cut.js, car-dials.js):
//  - cutting the doors' edges straight through the skin keeps the body's surface as it was (nothing lost, nothing
//    added) and leaves no triangle across a cut out at the car's sides (no crack, no teeth);
//  - each door is all within its own stretch of the car, over its sill, out at the side, and big enough to be a door;
//    a car with a step along its side has its doors cut off over the step, the rest at their sills;
//  - each opening has the edges its faces are drawn along;
//  - the lit dials sit inside their car, facing back toward the driver.
//   node --test test/car-doors-cut.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { CAR_PARTS } = await import('../src/client/car-parts.js');
const { doorPlan, clipDoors, sortDoors } = await import('../src/client/car-door-cut.js');
const { CAR_DIALS } = await import('../src/client/car-dials.js');
const GAME = new URL('../assets/vehicles/cars/game/', import.meta.url);
const STEPS = new Set(['black-pickup', 'black-square-suv', 'white-square-suv', 'camo-expedition']);

function shapeOf(spec) {
  const buf = readFileSync(new URL(spec.files.mesh, GAME));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const n = spec.vertices;
  let at = 0;
  const position = new Float32Array(ab, at, n * 3); at += n * 12;
  const normal = new Int16Array(ab, at, n * 3); at += n * 6 + (n % 2) * 2;
  const uv = new Float32Array(ab, at, n * 2); at += n * 8;
  const index = new Uint32Array(ab, at, spec.triangles * 3);
  return { position, normal, uv, body: index.subarray(0, spec.parts[0] * 3) };
}
const area = (P, I, from = 0, count = I.length / 3) => {
  let s = 0;
  for (let t = from; t < from + count; t += 1) {
    const a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    s += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  }
  return s;
};
const cut = {};
for (const [id, spec] of Object.entries(CAR_PARTS)) {
  const shape = shapeOf(spec);
  const plan = doorPlan(id, spec, shape.position, shape.body);
  if (!plan) continue;
  const clipped = clipDoors(plan, shape.position, shape.normal, shape.uv, shape.body);
  const P = clipped ? clipped.position : shape.position, I = clipped ? clipped.index : shape.body.slice();
  const before = area(shape.position, shape.body);
  const doors = sortDoors(plan, P, clipped ? clipped.normal : shape.normal, I, clipped ? clipped.parent : null);
  cut[id] = { spec, shape, plan, base: doorPlan(id, spec), clipped, P, I, before, doors };
}

test('every car but the hypercar (its doors up as made) has its doors cut', () => {
  for (const id of Object.keys(CAR_PARTS)) {
    if (id === 'gold-hypercar') { assert.equal(cut[id], undefined, id); continue; }
    assert.ok(cut[id] && cut[id].doors, `${id}: doors cut`);
    const keys = cut[id].doors.list.map((d) => d.key).sort().join(',');
    assert.equal(keys, cut[id].plan.two ? 'fl,fr' : 'fl,fr,rl,rr', `${id}: its doors`);
  }
});

test('cutting the doors\' edges keeps the body\'s surface as it was, and leaves nothing across a cut at the sides', () => {
  for (const [id, c] of Object.entries(cut)) {
    assert.ok(c.clipped, `${id}: its edges cut`);
    const after = area(c.P, c.I);
    assert.ok(Math.abs(after - c.before) / c.before < 1e-5, `${id}: the body's surface ${c.before} before, ${after} after`);
    // (the triangles a car is drawn with grow by no more than a quarter)
    assert.ok(c.I.length / c.shape.body.length < 1.25, `${id}: ${c.shape.body.length / 3} triangles, ${c.I.length / 3} cut`);
    // (no triangle out at the sides lies across a cut: each was cut along it, the triangles either side alike)
    const { half, sill, regions, top, cutTop } = c.plan;
    const planes = [...new Set(regions.flatMap((r) => [r[2], r[3]]))].map((z) => [2, z]).concat([[1, sill]], cutTop ? [[1, top]] : []);
    let across = 0;
    for (let t = 0; t < c.I.length / 3; t += 1) {
      const k = [c.I[t * 3], c.I[t * 3 + 1], c.I[t * 3 + 2]];
      if (Math.max(...k.map((v) => Math.abs(c.P[v * 3]))) <= half * 0.3) continue;
      for (const [axis, v] of planes) { const vs = k.map((q) => c.P[q * 3 + axis]); if (Math.min(...vs) < v - 1e-5 && Math.max(...vs) > v + 1e-5) across += 1; }
    }
    assert.equal(across, 0, `${id}: triangles across a cut`);
    // (each triangle cut came from one of the model's own, for its glass)
    assert.equal(c.clipped.parent.length, c.I.length / 3, `${id}: where each came from`);
    assert.ok(c.clipped.parent.every((p) => p >= 0 && p < c.shape.body.length / 3), `${id}: from the model's own`);
  }
});

test('each door lies within its own stretch, over its sill, out at the side, and is a door\'s size', () => {
  for (const [id, c] of Object.entries(cut)) {
    const { half, sill, top, unit } = c.plan;
    for (const d of c.doors.list) {
      assert.ok(d.count >= 40, `${id} ${d.key}: ${d.count} triangles`);
      const z0 = d.rear, z1 = d.hinge[1];
      let x0 = Infinity, s = 0;
      for (let t = d.from; t < d.from + d.count; t += 1) for (let i = 0; i < 3; i += 1) {
        const v = c.I[t * 3 + i] * 3;
        assert.ok(c.P[v + 2] >= z0 - 1e-4 && c.P[v + 2] <= z1 + 1e-4, `${id} ${d.key}: a point at z ${c.P[v + 2]} outside ${z0}..${z1}`);
        assert.ok(c.P[v + 1] >= sill - 1e-4, `${id} ${d.key}: a point under the sill`);
        assert.ok(c.P[v + 1] <= top + 0.26 * unit, `${id} ${d.key}: a point over the door`);
        x0 = Math.min(x0, d.side * c.P[v]);
      }
      assert.ok(x0 >= half * 0.3, `${id} ${d.key}: reaches in to ${x0 / half} of the half width`);
      // (a door's skin: at least a third of a square metre of it)
      s = area(c.P, c.I, d.from, d.count) / (unit * unit);
      assert.ok(s > 0.3, `${id} ${d.key}: ${s.toFixed(2)} square metres`);
      // (its opening's edges, for the faces that close it)
      assert.ok(d.jambs && d.jambs.front.length >= 2 && d.jambs.back.length >= 2 && d.jambs.foot.length >= 2, `${id} ${d.key}: the opening's edges`);
      assert.equal(d.bottom, sill, `${id} ${d.key}: its bottom`);
    }
  }
});

test('a car with a step along its side has its doors cut off over the step; the rest at their sills', () => {
  for (const [id, c] of Object.entries(cut)) {
    if (STEPS.has(id)) assert.ok(c.plan.sill > c.base.sill + 0.05 * c.plan.unit, `${id}: its doors over its step (${(c.plan.sill / c.plan.unit).toFixed(2)} m)`);
    else assert.equal(c.plan.sill, c.base.sill, `${id}: its doors from its sill`);
  }
});

test('the lit dials of the cars with cabins of their own sit inside them, facing back toward the driver', () => {
  for (const [id, d] of Object.entries(CAR_DIALS)) {
    const spec = CAR_PARTS[id];
    assert.ok(spec && spec.driver && spec.driver.seen, `${id}: a cabin of its own`);
    const f = d.facing, l = Math.hypot(...f);
    assert.ok(Math.abs(l - 1) < 1e-3, `${id}: facing a way`);
    assert.ok(f[2] < -0.5 && f[1] > 0, `${id}: facing back and up, toward the eyes`);
    assert.ok(Math.abs(d.at[0] - spec.driver.hip[0]) < 0.05 * spec.length, `${id}: in front of the driver`);
    // (ahead of the hips, by the wheel: seen through it)
    assert.ok(d.at[2] > spec.driver.hip[2] && Math.abs(d.at[2] - spec.driver.wheel[2]) < 0.06 * spec.length, `${id}: by the wheel`);
    assert.ok(d.at[1] > 0 && d.at[1] < spec.height, `${id}: within the car's height`);
  }
  // (the cars where a clear view of the dashboard was found: all but two)
  assert.ok(Object.keys(CAR_DIALS).length >= 8);
});
