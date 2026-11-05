// Writes src/sim/zones/town-footprints.js: where each of the owner's buildings in town (town-buildings.js: the
// towers, and the houses on the plain houses' plots) really stands at the height of a person or a rider, as boxes
// for what is in the way.
//
// Why (19 October 2026, the owner's video): a motorcycle on the grass beside Waterside Road threw its rider at
// 28 km/h with nothing in front of it. Each of these buildings stood in the way as the box round the whole model,
// its roof and its overhangs included: the purple tower's roof reaches out over its curved podium, so the bike met an
// invisible wall from two to seventeen metres before the wall that is drawn. Now each building is solid where its
// walls, posts and steps are, from 0.15 m to 2.3 m above the ground (under a roof higher than that a rider passes),
// and inside them; under an overhang, a canopy or an arcade it is open, as it is drawn.
//
// How: the supplied model (the same file the page draws, exactly as it is) is placed as the page places it
// (render-town-buildings.js, `modelMatrix`); every triangle is cut to the band between 0.15 m and 2.3 m and laid on
// a grid of half-metre squares seen from above; gaps narrower than two metres (a doorway, the joins between panes)
// are closed, so that nothing walks into a building through its door; whatever the outside cannot reach is inside
// the building and solid too; and the squares are joined into as few boxes as rows allow.
//
//   node tools/buildings/footprints.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseGLB } from '../../src/client/glb.js';
import { TOWN_TOWERS, TOWN_MODELS, ZONE_HOUSES, CARSHOW } from '../../src/sim/zone.js';

const THREE = createRequire(import.meta.url)('../../vendor/three.min.js');
const CELL = 0.5;                 // metres: the grid the footprint is drawn on
const LOW = 0.15, HIGH = 2.3;     // metres above the ground: what is in the way of a person or a rider
const TOP_FROM = 0.012;           // metres: a top lower than this is the ground's own height, near enough
const CLOSE = 2;                  // squares: gaps up to twice this (two metres) are closed
const SITE = new URL('../../../site/', import.meta.url);

// The page's placing of a model (render-town-buildings.js `modelMatrix`): its own frame turned so that its front faces
// +z, the middle of its foot at the origin, scaled, then turned to its heading and set on its plot.
function modelMatrix(e, m) {
  const turn = new THREE.Matrix4().makeRotationY(-m.front);
  const scale = new THREE.Matrix4().makeScale(e.k, e.k, e.k);
  const centre = new THREE.Matrix4().makeTranslation(-m.mid[0] * e.k, 0, -m.mid[1] * e.k);
  const place = new THREE.Matrix4().makeRotationY(e.heading).setPosition(e.x, 0, e.z);
  return place.multiply(centre).multiply(scale).multiply(turn);
}

// the shape of a model, as the page reads it (supplied-model.js: the first primitive of the first mesh)
const shapes = new Map();
function shapeOf(id) {
  if (shapes.has(id)) return shapes.get(id);
  const b = readFileSync(new URL(TOWN_MODELS[id].file, SITE));
  const { json, accessor } = parseGLB(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  const prim = json.meshes[0].primitives[0];
  const pos = accessor(prim.attributes.POSITION).array;
  const index = prim.indices !== undefined ? accessor(prim.indices).array : Uint32Array.from({ length: pos.length / 3 }, (_, i) => i);
  const mat = json.materials ? json.materials[prim.material || 0] : null;
  const shape = { pos, index, both: !!(mat && mat.doubleSided) };
  shapes.set(id, shape);
  return shape;
}

// A triangle cut to the band LOW..HIGH: the polygon left, or nothing.
function clipBand(tri) {
  let poly = tri;
  for (const [limit, keepBelow] of [[HIGH, true], [LOW, false]]) {
    const out = [];
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const ina = keepBelow ? a[1] <= limit : a[1] >= limit, inb = keepBelow ? b[1] <= limit : b[1] >= limit;
      if (ina) out.push(a);
      if (ina !== inb) { const t = (limit - a[1]) / (b[1] - a[1]); out.push([a[0] + (b[0] - a[0]) * t, limit, a[2] + (b[2] - a[2]) * t]); }
    }
    poly = out;
    if (!poly.length) return null;
  }
  return poly.length >= 2 ? poly : null;
}

function footprint(e) {
  const m = TOWN_MODELS[e.model];
  const { pos, index } = shapeOf(e.model);
  const mat = modelMatrix(e, m);
  const v = new THREE.Vector3();
  const world = new Float64Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) { v.set(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(mat); world[i] = v.x; world[i + 1] = v.y; world[i + 2] = v.z; }
  // the grid: the building's box and a margin
  const half = Math.hypot(e.w, e.d) / 2 + 3;
  const gx0 = e.x - half, gz0 = e.z - half;
  const n = Math.ceil((2 * half) / CELL);
  const solid = new Uint8Array(n * n);
  const mark = (x, z) => { const i = Math.floor((x - gx0) / CELL), j = Math.floor((z - gz0) / CELL); if (i >= 0 && j >= 0 && i < n && j < n) solid[j * n + i] = 1; };
  const at = (k) => [world[k * 3], world[k * 3 + 1], world[k * 3 + 2]];
  for (let t = 0; t < index.length; t += 3) {
    const poly = clipBand([at(index[t]), at(index[t + 1]), at(index[t + 2])]);
    if (!poly) continue;
    // its edges, walked in steps finer than a square (a wall seen from above is a line)
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
      const steps = Math.max(1, Math.ceil(len / (CELL * 0.35)));
      for (let s = 0; s <= steps; s += 1) mark(a[0] + ((b[0] - a[0]) * s) / steps, a[2] + ((b[2] - a[2]) * s) / steps);
    }
    // and what lies within it (a slab or a step seen from above): each square's middle inside it
    if (poly.length >= 3) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const p of poly) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]); }
      if (x1 - x0 > CELL || z1 - z0 > CELL) {
        for (let x = Math.floor((x0 - gx0) / CELL) * CELL + gx0 + CELL / 2; x <= x1; x += CELL) {
          for (let z = Math.floor((z0 - gz0) / CELL) * CELL + gz0 + CELL / 2; z <= z1; z += CELL) {
            let inside = false;
            for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
              const [xi, , zi] = poly[i], [xj, , zj] = poly[j];
              if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
            }
            if (inside) mark(x, z);
          }
        }
      }
    }
  }
  // closed: grown by CLOSE squares, its inside filled, and shrunk back
  const grow = (src, r) => { const out = new Uint8Array(n * n); for (let j = 0; j < n; j += 1) for (let i = 0; i < n; i += 1) { if (!src[j * n + i]) continue; for (let dj = -r; dj <= r; dj += 1) for (let di = -r; di <= r; di += 1) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < n && b < n) out[b * n + a] = 1; } } return out; };
  const shrink = (src, r) => { const out = new Uint8Array(n * n); for (let j = 0; j < n; j += 1) for (let i = 0; i < n; i += 1) { let all = 1; for (let dj = -r; dj <= r && all; dj += 1) for (let di = -r; di <= r; di += 1) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= n || b >= n || !src[b * n + a]) { all = 0; break; } } out[j * n + i] = all; } return out; };
  const grown = grow(solid, CLOSE);
  // what the outside reaches, from the grid's edge
  const outside = new Uint8Array(n * n);
  const stack = [];
  for (let i = 0; i < n; i += 1) for (const k of [i, (n - 1) * n + i, i * n, i * n + n - 1]) if (!grown[k] && !outside[k]) { outside[k] = 1; stack.push(k); }
  while (stack.length) {
    const k = stack.pop(); const i = k % n, j = (k - i) / n;
    for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) { if (a < 0 || b < 0 || a >= n || b >= n) continue; const q = b * n + a; if (!grown[q] && !outside[q]) { outside[q] = 1; stack.push(q); } }
  }
  const filled = new Uint8Array(n * n);
  for (let k = 0; k < n * n; k += 1) filled[k] = outside[k] ? 0 : 1;
  const closed = shrink(filled, CLOSE);
  // anything the closing took away from what is really there is put back (a thin post at a corner)
  for (let k = 0; k < n * n; k += 1) if (solid[k]) closed[k] = 1;
  // joined into boxes: each row's runs, and runs that repeat on the rows below joined with them
  const boxes = [];
  let open = new Map();
  for (let j = 0; j <= n; j += 1) {
    const runs = new Map();
    if (j < n) { let i = 0; while (i < n) { if (!closed[j * n + i]) { i += 1; continue; } const s = i; while (i < n && closed[j * n + i]) i += 1; runs.set(`${s}:${i}`, [s, i]); } }
    const next = new Map();
    for (const [key, [s, f]] of runs) { if (open.has(key)) next.set(key, open.get(key)); else next.set(key, { s, f, j0: j }); }
    for (const [key, r] of open) if (!runs.has(key)) boxes.push([gx0 + r.s * CELL, gz0 + r.j0 * CELL, gx0 + r.f * CELL, gz0 + j * CELL]);
    open = next;
  }
  const area = closed.reduce((a, c) => a + c, 0) * CELL * CELL;
  return { boxes: boxes.map((b) => b.map((q) => Math.round(q * 100) / 100)), area };
}

const out = {};
const report = [];
for (const t of TOWN_TOWERS) {
  const f = footprint(t);
  out[t.id] = f.boxes;
  report.push(`${t.id.padEnd(18)} ${t.model.padEnd(14)} ${f.boxes.length} boxes, ${f.area.toFixed(0)} m² of the ${(t.w * t.d).toFixed(0)} m² box (${((100 * f.area) / (t.w * t.d)).toFixed(0)}%)`);
}
for (const h of ZONE_HOUSES.filter((q) => q.model && !q.tower)) {
  const f = footprint(h);
  out[h.id] = f.boxes;
  report.push(`${h.id.padEnd(18)} ${h.model.padEnd(14)} ${f.boxes.length} boxes, ${f.area.toFixed(0)} m² of the ${(h.w * h.d).toFixed(0)} m² box (${((100 * f.area) / (h.w * h.d)).toFixed(0)}%)`);
}
// What is lower than that and stood on (5 November 2026, the owner's brief "feet on the ground": people stood at the
// land's height on the buildings' steps, plinths and paths, up to 15 cm into them): the tops of each model's, as
// triangles in its own frame (turned to face +z, the middle of its foot at the origin, its own units: each building
// scales it by its `k`, turns it by its heading and sets it on its plot), those that are from 1.2 cm to 21 cm up on
// some building of the model (each building keeps those in that band at its own size).
const lows = {};
const placed = [...TOWN_TOWERS, ...ZONE_HOUSES.filter((q) => q.model && !q.tower)];
for (const id of [...new Set(placed.map((e) => e.model))]) {
  const m = TOWN_MODELS[id];
  const ks = placed.filter((e) => e.model === id).map((e) => e.k);
  const kLo = Math.min(...ks), kHi = Math.max(...ks);
  const { pos, index, both } = shapeOf(id);
  const local = new THREE.Matrix4().makeTranslation(-m.mid[0], 0, -m.mid[1]).multiply(new THREE.Matrix4().makeRotationY(-m.front));
  const v = new THREE.Vector3(), p = [];
  for (let i = 0; i < pos.length; i += 3) { v.set(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(local); p.push(v.x, v.y, v.z); }
  // (only what can be stood on: not inside the building's own solid boxes, as its first building has them; every
  // building of a model is the same shape)
  const first = placed.find((e) => e.model === id), solidBoxes = out[first.id] || [];
  const c0 = Math.cos(first.heading), s0 = Math.sin(first.heading);
  const outside = (lx, lz) => { const x = first.x + first.k * (lx * c0 + lz * s0), z = first.z + first.k * (-lx * s0 + lz * c0); return !solidBoxes.some(([x0, z0, x1, z1]) => x > x0 && x < x1 && z > z0 && z < z1); };
  const tris = [];
  for (let t = 0; t < index.length; t += 3) {
    const [a, b, c] = [index[t], index[t + 1], index[t + 2]].map((k) => [p[k * 3], p[k * 3 + 1], p[k * 3 + 2]]);
    if (![a, b, c, [(a[0] + b[0] + c[0]) / 3, 0, (a[2] + b[2] + c[2]) / 3]].some((q) => outside(q[0], q[2]))) continue;
    const lo = Math.min(a[1], b[1], c[1]), hi = Math.max(a[1], b[1], c[1]);
    if (hi * kHi < TOP_FROM || lo * kLo > LOW + 0.06) continue;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, len = Math.hypot(nx, ny, nz);
    // (facing up; or either way, where the model is drawn from both sides: supplied-model.js, its material's doubleSided)
    if (len < 1e-12 || (both ? Math.abs(ny / len) : ny / len) < 0.7) continue;
    tris.push(...[...a, ...b, ...c].map((q) => Math.round(q * 1e4)));
  }
  if (tris.length) lows[id] = tris;
  report.push(`${id.padEnd(18)} ${tris.length / 9} low tops`);
}
// And the same round the buildings beside the car showroom on the Kwale road (asaba-carshow.js: each is solid inside
// the outline traced at its foot, placed at its `scale` with no turn of its own): the tops of what is low and stood on
// outside that outline, as triangles in its own units (5 November 2026: the stacked tower's plinth along its east side,
// 18 cm up, had people's feet in it).
const carLows = {};
for (const b of CARSHOW.buildings) {
  const buf = readFileSync(new URL(b.file, SITE));
  const { json, accessor } = parseGLB(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const prim = json.meshes[0].primitives[0];
  const pos = accessor(prim.attributes.POSITION).array;
  const index = prim.indices !== undefined ? accessor(prim.indices).array : Uint32Array.from({ length: pos.length / 3 }, (_, i) => i);
  const mat = json.materials ? json.materials[prim.material || 0] : null, both = !!(mat && mat.doubleSided);
  const inside = (u, v) => { let c = false; for (let i = 0, j = b.outline.length - 1; i < b.outline.length; j = i, i += 1) { const [ui, vi] = b.outline[i], [uj, vj] = b.outline[j]; if ((vi > v) !== (vj > v) && u < ((uj - ui) * (v - vi)) / (vj - vi) + ui) c = !c; } return c; };
  const tris = [];
  for (let t = 0; t < index.length; t += 3) {
    const [a, c1, c2] = [index[t], index[t + 1], index[t + 2]].map((k) => [pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]]);
    if ([a, c1, c2, [(a[0] + c1[0] + c2[0]) / 3, 0, (a[2] + c1[2] + c2[2]) / 3]].every((q) => inside(q[0], q[2]))) continue;
    // (low all over: what rises higher, outside the outline, is a part of the building of its own, solid or not as
    // asaba-carshow.js has it)
    const hi = Math.max(a[1], c1[1], c2[1]) * b.scale;
    if (hi < TOP_FROM || hi > LOW + 0.06) continue;
    const ux = c1[0] - a[0], uy = c1[1] - a[1], uz = c1[2] - a[2], wx = c2[0] - a[0], wy = c2[1] - a[1], wz = c2[2] - a[2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, len = Math.hypot(nx, ny, nz);
    if (len < 1e-12 || (both ? Math.abs(ny / len) : ny / len) < 0.7) continue;
    tris.push(...[...a, ...c1, ...c2].map((q) => Math.round(q * 1e5)));
  }
  if (tris.length) carLows[b.id] = tris;
  report.push(`carshow ${b.id.padEnd(10)} ${tris.length / 9} low tops`);
}
console.log(report.join('\n'));
writeFileSync(new URL('../../src/sim/zones/carshow-footprints.js', import.meta.url),
  '// Generated by tools/buildings/footprints.mjs. Do not edit by hand.\n' +
  '// The tops of what is low and stood on round the buildings beside the car showroom on the Kwale road (from 1.2 cm\n' +
  '// to 21 cm up, outside the outline each is solid within: asaba-carshow.js), by building, as triangles (nine whole\n' +
  '// numbers each: three corners x, y, z, in hundred-thousandths of the model\'s unit) in its own frame. The ground is\n' +
  '// their height there (5 November 2026; asaba-carshow.js `carshowGroundY`).\n' +
  `export const CARSHOW_LOW_TOPS = Object.freeze(${JSON.stringify(carLows)});\n`);
const total = Object.values(out).reduce((a, b) => a + b.length, 0);
writeFileSync(new URL('../../src/sim/zones/town-footprints.js', import.meta.url),
  '// Generated by tools/buildings/footprints.mjs. Do not edit by hand.\n' +
  '// Where each of the owner\'s buildings in town stands at the height of a person or a rider (its walls, posts and\n' +
  '// steps from 0.15 m to 2.3 m above the ground, and what they enclose), by building, as boxes [x0, z0, x1, z1] in\n' +
  '// the town\'s metres: what is in the way, as it is drawn (not the box round the whole model, roof and overhangs\n' +
  '// included). Read by town-buildings.js and atani.js.\n' +
  `export const TOWN_FOOTPRINTS = Object.freeze(${JSON.stringify(out)});\n` +
  '// The tops of what is lower than that and stood on (steps, plinths and paths: from 1.2 cm to 21 cm on some building\n' +
  '// of the model, outside its solid boxes), by model, as triangles (nine whole numbers each: three corners x, y, z, in\n' +
  '// ten-thousandths of the model\'s unit) in its own frame: turned to face\n' +
  '// +z, the middle of its foot at the origin, its own units (each building scales by its k, turns by its heading and\n' +
  '// sets it on its plot). The ground is their height there (5 November 2026; town-buildings.js `townLowTop`).\n' +
  `export const TOWN_LOW_TOPS = Object.freeze(${JSON.stringify(lows)});\n`);
console.log(`written: ${Object.keys(out).length} buildings, ${total} boxes`);
