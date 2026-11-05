// Cars with real glass, a real cabin and the people in them seen (5 November 2026, the owner's brief, parts 2 to 5;
// Stage 2: the Mint Sports Coupé, the Grey Saloon and the Black Luxury SUV). Headless, from the game's own files:
//  - each car with glass has its windows' pictures and the list of its glass's triangles beside its other files, made
//    from the game's copy of it (tools/vehicles/windows.py), and the glass is a part of it, not all of it;
//  - its cabin fitted inside its shell: no point of it out past the shell's side at its place along the car and its
//    height, the dashboard under the windscreen, the roof's lining under the roof;
//  - every figure fits every seat: the tallest of the players' characters and of the townspeople, sitting, has room
//    over the head (leant back no further, and sunk no deeper, than car-seating.js allows), and reaches the wheel;
//  - taking a car leaves time for the owner's moves: the pull as long as his `pulled`, getting in as long as his `enter`.
//   node --test test/car-glass.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';

const require = createRequire(import.meta.url);
globalThis.THREE = require('../vendor/three.min.js');
// (the cabin's pictures are drawn on canvases: a page's; here a stand-in that draws nothing)
const blank2d = new Proxy({}, { get: (t, k) => (k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : k === 'createImageData' ? (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) : () => {}), set: () => true });
if (!globalThis.document) globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => blank2d }) };
const { CAR_WINDOWS } = await import('../src/client/car-windows.js');
const { CAR_PARTS } = await import('../src/client/car-parts.js');
const { makeCabin } = await import('../src/client/car-cabin.js');
const { SEATING } = await import('../src/client/car-seating.js');
const { boardTimes, BOARDING } = await import('../src/client/car-boarding.js');
const { CAR_TAKING } = await import('../src/sim/hijack.js');
const { POWER_CARS } = await import('../src/sim/power-cars.js');
const { ANIMATED } = await import('../src/client/animated.js');
const GAME = new URL('../assets/vehicles/cars/game/', import.meta.url);
const SAMPLE = ['mint-sports-coupe', 'grey-saloon', 'black-luxury-suv'];

test('the three sample cars have glass: their windows pictures and their glass triangles beside their files, the glass a part of each', () => {
  for (const id of SAMPLE) {
    const w = CAR_WINDOWS[id];
    assert.ok(w, `${id} has glass`);
    const spec = CAR_PARTS[id];
    for (const f of [...Object.values(w.masks), w.tris]) assert.ok(existsSync(new URL(f, GAME)), `${id}: ${f}`);
    const bits = readFileSync(new URL(w.tris, GAME));
    const body = spec.parts[0];
    assert.equal(bits.length, Math.ceil(body / 8), `${id}: a bit for each of the body's triangles`);
    let n = 0; for (const b of bits) for (let k = 0; k < 8; k += 1) n += (b >> k) & 1;
    assert.equal(n, w.count, `${id}: the count written`);
    assert.ok(n > 40 && n < body * 0.45, `${id}: ${n} of ${body} triangles carry glass`);
    // (each picture a PNG of its size: 1024 and 512)
    for (const [k, f] of Object.entries(w.masks)) { const png = readFileSync(new URL(f, GAME)); assert.equal(png.readUInt32BE(16), k === '1k' ? 1024 : 512, `${id}: ${f} wide`); }
    assert.ok(w.belt > 0 && w.belt < spec.height, `${id}: its side glass's foot ${w.belt}`);
    assert.equal(w.privacy, id === 'black-luxury-suv', `${id}: privacy glass behind the front doors on the SUV only`);
  }
});

// the room inside a car's shell at a place along it and a height (metres), from its fit (as car-cabin.js reads it)
function shell(fit, scale) {
  const find = (list, v) => { if (v <= list[0]) return [0, 0, 0]; const n = list.length - 1; if (v >= list[n]) return [n, n, 0]; let i = 0; while (list[i + 1] < v) i += 1; return [i, i + 1, (v - list[i]) / (list[i + 1] - list[i])]; };
  return {
    room(z, y) { const [a, b] = find(fit.z, z / scale), [c, d] = find(fit.y, y / scale); const v = [fit.half[a][c], fit.half[b][c], fit.half[a][d], fit.half[b][d]].filter((q) => q !== null); return v.length ? Math.max(...v) * scale : null; },
    top(z) { const [a, b, f] = find(fit.z, z / scale); const p = fit.top[a], q = fit.top[b]; return p === null || q === null ? null : (p + (q - p) * f) * scale; },
  };
}

test('each sample car\'s cabin is inside its shell: nothing out past its sides, the dashboard under the windscreen, the lining under the roof', () => {
  for (const id of SAMPLE) {
    const spec = CAR_PARTS[id], w = CAR_WINDOWS[id], scale = POWER_CARS[id].length / spec.length;
    const cabin = makeCabin(id, spec, { scale, fit: w.fit, doors: [] });
    const S = shell(w.fit, scale);
    const m = cabin.measures;
    // every point of it (metres, from the car's middle and its ground) within the shell's side where it was measured
    let out = 0, worst = 0, at = null;
    cabin.group.updateMatrixWorld(true);
    cabin.group.traverse((o) => {
      if (!o.isMesh || !o.geometry.attributes.position || !o.visible) return;
      const p = o.geometry.attributes.position, v = new THREE.Vector3();
      const local = new THREE.Matrix4().copy(o.matrixWorld).premultiply(new THREE.Matrix4().makeScale(scale, scale, scale));
      for (let i = 0; i < p.count; i += 1) {
        v.fromBufferAttribute(p, i).applyMatrix4(local);
        const r = S.room(v.z, v.y);
        if (r === null) continue;
        const over = Math.abs(v.x) - r;
        if (over > 0.005) { out += 1; if (over > worst) { worst = over; at = [v.x, v.y, v.z].map((q) => +q.toFixed(3)); } }
      }
    });
    assert.equal(out, 0, `${id}: ${out} points of its cabin out past its shell's side, the most ${worst.toFixed(3)} m at ${JSON.stringify(at)}`);
    for (let z = m.dashZ; z <= m.dashZ + m.dashDeep; z += 0.05) { const t = S.top(z); if (t !== null) assert.ok(m.dashTop < t - 0.01, `${id}: the dashboard (${m.dashTop.toFixed(3)} m) under the windscreen (${t.toFixed(3)} m) at ${z.toFixed(2)} m along`); }
    assert.ok(m.roof <= spec.driver.roof * scale + 1e-6, `${id}: the lining under the roof`);
    cabin.dispose();
  }
});

test('every figure fits every seat of the sample cars: room over the head, sat as far back as the seat allows, and the wheel within the driver\'s reach', () => {
  // the tallest and the shortest of everyone who can sit in a car: the players' characters and the townspeople
  const heights = Object.values(ANIMATED).map((f) => f.height).filter(Number.isFinite);
  const tall = Math.max(...heights), short = Math.min(...heights);
  assert.ok(tall > 1.75 && short < 1.7, `heights ${short} to ${tall}`);
  for (const id of SAMPLE) {
    const spec = CAR_PARTS[id], w = CAR_WINDOWS[id], scale = POWER_CARS[id].length / spec.length;
    const cabin = makeCabin(id, spec, { scale, fit: w.fit, doors: [] });
    const m = cabin.measures;
    // (a seated body by its height: the hips to the top of the head 0.52 of it, leant back at most `mostRecline`, sunk
    // at most `sink`; the shoulder 0.30 of it above the hips, the arm 0.33 of it long)
    for (const h of [tall, short]) {
      const hipY = m.hip[1] - SEATING.sink;
      const head = hipY + 0.52 * h * Math.cos(SEATING.mostRecline);
      assert.ok(head <= m.roof - SEATING.headRoom + 0.02, `${id}: a figure ${h} m tall has room over its head (${head.toFixed(3)} against the roof's ${m.roof.toFixed(3)})`);
      const shoulder = [m.hip[0] + 0.2 * (h / 1.8) * 0, m.hip[1] + 0.3 * h * Math.cos(0.25), m.hip[2] - 0.3 * h * Math.sin(0.25)];
      const reach = Math.hypot(m.wheel[0] - shoulder[0], m.wheel[1] - shoulder[1], m.wheel[2] - shoulder[2]);
      assert.ok(reach <= 0.33 * h + SEATING.slide + 0.1, `${id}: a figure ${h} m tall reaches the wheel (${reach.toFixed(2)} m from the shoulder)`);
    }
    cabin.dispose();
  }
});

test('taking a car leaves time for the owner\'s moves: the driver pulled out as long as his move takes, the taker in as long as his', () => {
  assert.ok(CAR_TAKING.pulled <= CAR_TAKING.pull, 'the driver handed to the town by the end of the pull');
  assert.ok(Math.abs(CAR_TAKING.pulled - boardTimes('pulled').length) < 0.25, `the pull ${CAR_TAKING.pulled} s, his move ${boardTimes('pulled').length.toFixed(2)} s`);
  assert.ok(Math.abs(CAR_TAKING.enter + CAR_TAKING.shut - boardTimes('in').length) < 0.3, `in and shut ${CAR_TAKING.enter + CAR_TAKING.shut} s, his move ${boardTimes('in').length.toFixed(2)} s`);
  // (getting in and out about two to three seconds, the brief)
  for (const k of ['in', 'out']) { const t = boardTimes(k); assert.ok(t.length > 2 && t.length < 3.3, `${k}: ${t.length.toFixed(2)} s`); assert.ok(t.open < t.shut, `${k}: the door opened before it is shut`); }
  assert.ok(BOARDING.in.from < BOARDING.in.open && BOARDING.in.shut < BOARDING.in.to);
});
