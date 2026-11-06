// The owner's ambulance and two trucks given real glass and a cab inside (6 November 2026, the brief's Stage 3: "the
// ambulance and the two trucks"). Headless, from the game's files:
//  - each has its windows pictures and the list of its glass's triangles (tools/vehicles/windows.py, reading it as
//    tools/vehicles/supplied_cars.py writes it), a bit for each of its file's triangles, the glass a small part of it,
//    and all of it in the cab, at its front;
//  - its cab (car-cabin.js, a van's or a lorry's: two seats and a wall behind them) inside its shell: nothing out past
//    its sides where they were measured, nothing ahead of its front or over its roof, the wall behind the seats in the
//    cab;
//  - its driver's measures inside the cab: the hips over the floor, the wheel ahead of them, the feet ahead of that.
//   node --test test/supplied-glass.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';

const require = createRequire(import.meta.url);
globalThis.THREE = require('../vendor/three.min.js');
const blank2d = new Proxy({}, { get: (t, k) => (k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : k === 'createImageData' ? (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) : k === 'getImageData' ? (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) : typeof k === 'string' ? () => {} : undefined), set: () => true });
if (!globalThis.document) globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => blank2d }) };
const { SUPPLIED_WINDOWS } = await import('../src/client/supplied-windows.js');
const { SUPPLIED_VEHICLES } = await import('../src/sim/zone.js');
const { makeCabin } = await import('../src/client/car-cabin.js');
const DIR = new URL('../assets/vehicles/supplied/', import.meta.url);
const LIGHT = new URL('../assets/models-light/', import.meta.url);
const FILES = { ambulance: 'vehicle-ambulance', boxTruck: 'vehicle-box-truck', heavyTruck: 'vehicle-heavy-truck' };

// (a model's triangles, as its file holds them: the count of its one mesh's list)
function trianglesOf(name) {
  const data = readFileSync(new URL(`${name}.2048.glb`, LIGHT));
  const clen = data.readUInt32LE(12);
  const j = JSON.parse(data.subarray(20, 20 + clen).toString('utf8'));
  return j.accessors[j.meshes[0].primitives[0].indices].count / 3;
}

test('the ambulance and the two trucks have glass: their pictures and their glass\'s triangles, a bit for each of their own', () => {
  assert.deepEqual(Object.keys(SUPPLIED_WINDOWS).sort(), ['ambulance', 'boxTruck', 'heavyTruck']);
  for (const [id, w] of Object.entries(SUPPLIED_WINDOWS)) {
    for (const f of [...Object.values(w.masks), w.tris]) assert.ok(existsSync(new URL(f, DIR)), `${id}: ${f}`);
    const bits = readFileSync(new URL(w.tris, DIR));
    const tris = trianglesOf(FILES[id]);
    assert.equal(bits.length, Math.ceil(tris / 8), `${id}: a bit for each of its ${tris} triangles`);
    let n = 0; for (const b of bits) for (let k = 0; k < 8; k += 1) n += (b >> k) & 1;
    assert.equal(n, w.count, `${id}: the count written`);
    assert.ok(n > 40 && n < tris * 0.1, `${id}: ${n} of ${tris} triangles carry glass`);
    for (const [k, f] of Object.entries(w.masks)) { const png = readFileSync(new URL(f, DIR)); assert.equal(png.readUInt32BE(16), k === '1k' ? 1024 : 512, `${id}: ${f} wide`); }
    assert.equal(w.privacy, false, `${id}: clear glass`);
    assert.ok(w.driver && w.fit, `${id}: its cab's measures and its room`);
  }
});

test('each cab is inside its shell: within its sides where they were measured, behind its front, under its roof', () => {
  for (const [id, w] of Object.entries(SUPPLIED_WINDOWS)) for (const lite of [false, true]) {
    const spec = { length: w.length, height: w.height, body: w.body, width: w.body, driver: w.driver };
    const scale = SUPPLIED_VEHICLES[id].length / w.length;
    const cab = makeCabin(`test:${id}`, spec, { scale, fit: w.fit, doors: [], cab: true, lite });
    const fit = w.fit;
    const find = (list, v) => { if (v <= list[0]) return [0, 0]; const n = list.length - 1; if (v >= list[n]) return [n, n]; let i = 0; while (list[i + 1] < v) i += 1; return [i, i + 1]; };
    const room = (z, y) => { const [a, b] = find(fit.z, z), [c, d] = find(fit.y, y); const v = [fit.half[a][c], fit.half[b][c], fit.half[a][d], fit.half[b][d]].filter((q) => q !== null); return v.length ? Math.max(...v) : null; };
    let out = 0, ahead = 0, over = 0, worst = 0;
    cab.group.updateMatrixWorld(true);
    cab.group.traverse((o) => {
      if (!o.isMesh || !o.geometry.attributes.position) return;
      const p = o.geometry.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < p.count; i += 1) {
        v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);          // (the model's units)
        const r = room(v.z, v.y);
        if (r !== null && Math.abs(v.x) - r > 0.005 / scale) { out += 1; worst = Math.max(worst, (Math.abs(v.x) - r) * scale); }
        if (v.z > w.length / 2) ahead += 1;
        if (v.y > w.height) over += 1;
      }
    });
    assert.equal(out, 0, `${id}${lite ? ' (a phone\'s)' : ''}: ${out} points out past its sides, the most ${worst.toFixed(3)} m`);
    assert.equal(ahead, 0, `${id}: points ahead of its front`);
    assert.equal(over, 0, `${id}: points over its roof`);
    // (the wall behind the seats is in the cab: the box behind it is never seen)
    const m = cab.measures;
    assert.ok(m.rearZ < m.hip[2] - 0.3 && m.rearZ > m.hip[2] - 0.6, `${id}: its wall behind the seats`);
    cab.dispose();
  }
});

test('each driver sits in the cab: hips over the floor, the wheel ahead of them, the feet ahead of that, the glass at the front', () => {
  for (const [id, w] of Object.entries(SUPPLIED_WINDOWS)) {
    const d = w.driver, unit = w.length / SUPPLIED_VEHICLES[id].length;
    assert.ok(d.hip[0] > 0, `${id}: the driver on the left, as the town drives on the right`);
    assert.ok(d.wheel[2] > d.hip[2] + 0.25 * unit && d.wheel[2] < d.hip[2] + 0.6 * unit, `${id}: the wheel ahead of the hips`);
    for (const f of d.feet) assert.ok(f[2] > d.wheel[2] && f[1] < d.hip[1] - 0.3 * unit, `${id}: the feet ahead and below`);
    assert.ok(d.roof > d.hip[1] + 0.9 * unit, `${id}: a seated head under the roof`);
    // (the cab at the front: the hips in its front third)
    assert.ok(d.hip[2] > w.length * 0.05, `${id}: the cab ahead of the middle`);
  }
});
