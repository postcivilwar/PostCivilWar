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
// (Stage 2, 5 November 2026, the three sample cars; Stage 3, 6 November: every car whose windows are painted on. The
// ten shells with nothing inside, as the brief names them, are given a cabin of ours; the cars with cabins of their
// own keep them, the Peach Luxury SUV's and the White Square SUV's painted panes made glass)
const SHELLS = ['black-luxury-suv', 'black-pickup', 'black-square-suv', 'blue-off-roader', 'camo-expedition', 'grey-grand-tourer', 'grey-saloon', 'midnight-saloon', 'mint-sports-coupe', 'state-limousine'];
const GLASS = Object.keys(CAR_WINDOWS);
const SAMPLE = GLASS.filter((id) => !(CAR_PARTS[id].driver && CAR_PARTS[id].driver.seen));
const PRIVACY = new Set(['black-luxury-suv', 'white-square-suv', 'black-square-suv', 'peach-suv', 'state-limousine', 'camo-expedition', 'grey-grand-tourer', 'midnight-saloon']);

test('every shell the brief names has glass and is given a cabin; the cars with cabins of their own keep theirs', () => {
  for (const id of SHELLS) assert.ok(SAMPLE.includes(id), `${id}: glass and a cabin of ours`);
  for (const id of GLASS) if (!SHELLS.includes(id)) assert.ok(CAR_PARTS[id].driver.seen, `${id}: has a cabin of its own`);
  assert.deepEqual(GLASS.filter((id) => !SHELLS.includes(id)).sort(), ['peach-suv', 'white-square-suv']);
});

test('every car with glass has its windows pictures and its glass triangles beside its files, the glass a part of each', () => {
  for (const id of GLASS) {
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
    assert.equal(w.privacy, PRIVACY.has(id), `${id}: privacy glass behind the front doors on the SUVs, the limousine and the luxury cars only`);
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

test('each car\'s cabin (and a phone\'s plainer one) is inside its shell: nothing out past its sides, the dashboard under the windscreen, the lining under the roof', () => {
  for (const id of SAMPLE) for (const lite of [false, true]) {
    const spec = CAR_PARTS[id], w = CAR_WINDOWS[id], scale = POWER_CARS[id].length / spec.length;
    const cabin = makeCabin(id, spec, { scale, fit: w.fit, doors: [], lite });
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
    assert.equal(out, 0, `${id}${lite ? ' (a phone\'s)' : ''}: ${out} points of its cabin out past its shell's side, the most ${worst.toFixed(3)} m at ${JSON.stringify(at)}`);
    for (let z = m.dashZ; z <= m.dashZ + m.dashDeep; z += 0.05) { const t = S.top(z); if (t !== null) assert.ok(m.dashTop < t - 0.01, `${id}: the dashboard (${m.dashTop.toFixed(3)} m) under the windscreen (${t.toFixed(3)} m) at ${z.toFixed(2)} m along`); }
    assert.ok(m.roof <= spec.driver.roof * scale + 1e-6, `${id}: the lining under the roof`);
    cabin.dispose();
  }
});

// The car's own surface, from its shape file (as car-model.js reads it): its body's triangles laid flat on a grid a
// centimetre square, along it and up (for each square, the nearest of its surface to the middle line on each side: the
// skin, not a mirror or a flared arch further out) and along it and across (the highest of it: the roof, the glass, the
// bonnet). The model's units.
function surfaceOf(id, spec, scale) {
  const buf = readFileSync(new URL(spec.files.mesh, GAME));
  const n = spec.vertices;
  const pos = new Float32Array(buf.buffer, buf.byteOffset, n * 3);
  let at = n * 12 + n * 6 + (n % 2) * 2 + n * 8;
  const index = new Uint32Array(buf.buffer.slice(buf.byteOffset + at, buf.byteOffset + at + spec.parts[0] * 12));
  const cell = 0.01 / scale, L = spec.length, H = spec.height, B = spec.body;
  const nz = Math.ceil(L * 1.1 / cell), ny = Math.ceil(H * 1.1 / cell), nx = Math.ceil(B * 1.4 / cell);
  const iz = (z) => Math.floor((z + L * 0.55) / cell), iy = (y) => Math.floor((y + H * 0.05) / cell), ix = (x) => Math.floor((x + B * 0.7) / cell);
  const left = new Float32Array(nz * ny).fill(Infinity), right = new Float32Array(nz * ny).fill(Infinity), top = new Float32Array(nz * nx).fill(-Infinity);
  // (each triangle onto a plane: every square whose middle it covers given the third coordinate there)
  const lay = (a, b, c, u, v, w, nu, nv, toU, toV, put) => {
    const ua = pos[a * 3 + u], va = pos[a * 3 + v], ub = pos[b * 3 + u], vb = pos[b * 3 + v], uc = pos[c * 3 + u], vc = pos[c * 3 + v];
    const d = (vb - vc) * (ua - uc) + (uc - ub) * (va - vc);
    if (Math.abs(d) < 1e-14) return;
    const u0 = Math.max(0, toU(Math.min(ua, ub, uc))), u1 = Math.min(nu - 1, toU(Math.max(ua, ub, uc))), v0 = Math.max(0, toV(Math.min(va, vb, vc))), v1 = Math.min(nv - 1, toV(Math.max(va, vb, vc)));
    for (let i = u0; i <= u1; i += 1) for (let j = v0; j <= v1; j += 1) {
      const pu = (i + 0.5) * cell - (u === 2 ? L * 0.55 : 0), pv = (j + 0.5) * cell - (v === 1 ? H * 0.05 : B * 0.7);
      const l1 = ((vb - vc) * (pu - uc) + (uc - ub) * (pv - vc)) / d, l2 = ((vc - va) * (pu - uc) + (ua - uc) * (pv - vc)) / d, l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      put(i, j, l1 * pos[a * 3 + w] + l2 * pos[b * 3 + w] + l3 * pos[c * 3 + w]);
    }
  };
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let t = 0; t < spec.parts[0]; t += 1) {
    const a = index[t * 3], b = index[t * 3 + 1], c = index[t * 3 + 2];
    // (the sides from the surface that faces out sideways: the doors' skin and the side glass, not the roof, the glass
    // over the cabin or the floor, which cross a height along it near the middle line, nor the inner face of a roof
    // rail or a mirror, which face in)
    e1.set(pos[b * 3] - pos[a * 3], pos[b * 3 + 1] - pos[a * 3 + 1], pos[b * 3 + 2] - pos[a * 3 + 2]);
    e2.set(pos[c * 3] - pos[a * 3], pos[c * 3 + 1] - pos[a * 3 + 1], pos[c * 3 + 2] - pos[a * 3 + 2]);
    const facing = e1.cross(e2).normalize().x;
    if (Math.abs(facing) > 0.45) lay(a, b, c, 2, 1, 0, nz, ny, iz, iy, (i, j, x) => { const k = i * ny + j; if (x > 0 && facing > 0) left[k] = Math.min(left[k], x); else if (x < 0 && facing < 0) right[k] = Math.min(right[k], -x); });
    lay(a, b, c, 2, 0, 1, nz, nx, iz, ix, (i, j, y) => { const k = i * nx + j; top[k] = Math.max(top[k], y); });
  }
  return {
    // how far out the skin is on the side `s` (1 its left, -1 its right) at a place along it and a height, or null
    side: (s, z, y) => { const i = iz(z), j = iy(y); if (i < 0 || i >= nz || j < 0 || j >= ny) return null; const v = (s > 0 ? left : right)[i * ny + j]; return Number.isFinite(v) ? v : null; },
    // how high it is at a place along it and across, or null (the highest of the squares round it too: where the surface
    // turns from the roof down to the side, its triangles laid flat may leave a square's middle uncovered)
    top: (z, x) => {
      const i = iz(z), j = ix(x); let v = -Infinity;
      for (let a = Math.max(0, i - 1); a <= Math.min(nz - 1, i + 1); a += 1) for (let b = Math.max(0, j - 1); b <= Math.min(nx - 1, j + 1); b += 1) v = Math.max(v, top[a * nx + b]);
      return Number.isFinite(v) ? v : null;
    },
  };
}

test('each car\'s cabin (and a phone\'s plainer one) is inside its own surface: no point of it out through the body, the glass or the roof where the car is drawn', () => {
  for (const id of SAMPLE) for (const lite of [false, true]) {
    const spec = CAR_PARTS[id], w = CAR_WINDOWS[id], scale = POWER_CARS[id].length / spec.length;
    const S = surfaceOf(id, spec, scale);
    const cabin = makeCabin(id, spec, { scale, fit: w.fit, doors: [], lite });
    cabin.group.updateMatrixWorld(true);
    let side = 0, over = 0, worst = 0, at = null, what = null;
    const tol = 0.004 / scale;
    cabin.group.traverse((o) => {
      if (!o.isMesh || !o.geometry.attributes.position) return;
      const p = o.geometry.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < p.count; i += 1) {
        v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);   // (the model's units: the group is scaled to them)
        // (out through its side: past the skin on its own side, where the skin is found at its place and height)
        const s = S.side(Math.sign(v.x) || 1, v.z, v.y);
        if (Math.abs(v.x) > 0.02 * spec.body && s !== null && Math.abs(v.x) > s + tol) { side += 1; const e = (Math.abs(v.x) - s) * scale; if (e > worst) { worst = e; at = [v.x, v.y, v.z].map((q) => +(q * scale).toFixed(3)); what = `${o.name} side`; } }
        // (out through its top: above the roof, the glass or the bonnet over it, where it is well in from the sides; near
        // them the sides' glass leans in over it, and the side's test is the one that holds there)
        const t = S.top(v.z, v.x);
        if (s !== null && Math.abs(v.x) < s - 0.05 / scale && t !== null && v.y > t + tol) { over += 1; const e = (v.y - t) * scale; if (e > worst) { worst = e; at = [v.x, v.y, v.z].map((q) => +(q * scale).toFixed(3)); what = `${o.name} top`; } }
      }
    });
    assert.equal(side + over, 0, `${id}${lite ? ' (a phone\'s)' : ''}: ${side} points of its cabin out through its sides and ${over} through its top, the most ${worst.toFixed(3)} m (${what}) at ${JSON.stringify(at)} (metres)`);
    cabin.dispose();
  }
});

test('every figure fits every seat of every car given a cabin: room over the head, sat as far back as the seat allows, and the wheel within the driver\'s reach', () => {
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
      assert.ok(head <= m.overHead - SEATING.headRoom + 0.02, `${id}: a figure ${h} m tall has room over its head (${head.toFixed(3)} against the lining's ${m.overHead.toFixed(3)} over the seat)`);
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
