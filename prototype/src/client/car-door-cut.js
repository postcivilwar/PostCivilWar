// A car's doors cut from the skin of the owner's model (4 November 2026; their edges cut straight, 6 November 2026),
// for car-model.js, which draws them on their hinges, and for the tests. Nothing here touches a file: it works on the
// game's own copy of a car's shape as it is read.
//
//   const plan = doorPlan(id, spec, position, bodyIndex)              where its doors are, or null
//   const cut = clipDoors(plan, position, normal, uv, bodyIndex)      its doors' edges cut through the skin, or null
//   const doors = sortDoors(plan, position, normal, index, parent)    which triangles go with which door, in order
import { TWO_DOORS, DOORS_UP } from '../sim/car-doors.js';
import { POWER_CARS } from '../sim/power-cars.js';

// A car's doors in its model (4 November 2026: the owner, "the open of the door and banging of the door"): the skin of
// its sides between the arches of its wheels, from the sill up to the roof, cut at the middle pillar into a front and
// a back door on each side (a car of two doors: one long door a side). Each opens on a hinge at its front edge. What is
// cut out is the model's own skin, the same triangles drawn in the same place while the door is shut; open, the body
// is drawn without them and they swing out. The model's units: facing +z, its left at +x, from the ground up.
// (6 November 2026, the owner's brief: "an open door shows its inside panel and its window glass; the opening shows the
// cabin ..., never a hollow shell or ragged edges": its edges are cut straight through the skin now (`clipDoors`), and
// a door is all of the side within a door's thickness of its outer skin there (`sortDoors`): its creases and handle,
// its window and mirror, and the inside of it where the model has one; not the end of a dashboard or a seat inside.)
//
// Where they are (`doorPlan`): the stretch along the car each takes, the sill under them, the top of the sides (an open
// car's, or a closed one's up to its roof), and how thick a door is in the model's units. null for a car whose doors are
// not cut.
export function doorPlan(id, spec, position = null, index = null) {
  if (!spec.wheels || spec.wheels.length < 4 || DOORS_UP.has(id)) return null;
  const wf = spec.wheels[0], wr = spec.wheels[2];
  const fz = (wf.c ? wf.c[2] : wf.z), rz = (wr.c ? wr.c[2] : wr.z), wy = (wf.c ? wf.c[1] : wf.y);
  const frontArch = fz - wf.r * 1.18, rearArch = rz + wr.r * 1.18;
  if (!(frontArch > rearArch + 0.1 * spec.length)) return null;
  const two = TWO_DOORS.has(id);
  const pillar = two ? frontArch - (frontArch - rearArch) * 0.62 : (frontArch + rearArch) / 2 + (frontArch - rearArch) * 0.02;
  const half = (spec.body || spec.width) / 2;
  const sill = wy * 0.82, top = spec.height * 0.985;
  const regions = (two ? [['fl', 1, pillar, frontArch], ['fr', -1, pillar, frontArch]] : [['fl', 1, pillar, frontArch], ['fr', -1, pillar, frontArch], ['rl', 1, rearArch, pillar], ['rr', -1, rearArch, pillar]]);
  // (the model's units in a metre: its length over the car's)
  const unit = spec.length / ((POWER_CARS[id] && POWER_CARS[id].length) || 4.6);
  const plan = { two, pillar, half, sill, top, regions, unit, thick: 0.14 * unit, roofed: !!(spec.driver && spec.driver.roof) };
  // (a car with a step along its side under its doors (the pickup's, the square SUVs'): its doors cut off over it)
  if (position && index) plan.sill = Math.max(sill, stepTop(plan, position, index));
  // (an open car's doors cut off straight along their own tops, a little over where their sides turn over into them:
  // the windscreen's frame and a roll hoop over that are the body's)
  if (position && index && !plan.roofed) { const t = doorTops(plan, position, index); if (t) { plan.top = Math.min(plan.top, t + 0.06 * unit); plan.cutTop = true; } }
  return plan;
}

// How high an open car's doors' sides go: along the middle of each door's stretch, the highest point of its skin
// facing out (the middle of those found along it), the higher of its two sides; or null.
function doorTops(plan, position, index) {
  const { half, sill, top, regions, unit } = plan;
  const cell = 0.05 * unit;
  let best = null;
  for (const [, side, z0, z1] of regions) {
    const nz = Math.max(1, Math.ceil((z1 - z0) / cell));
    const high = new Float32Array(nz).fill(-Infinity);
    for (let t = 0; t < index.length / 3; t += 1) {
      const a = index[t * 3] * 3, b = index[t * 3 + 1] * 3, c = index[t * 3 + 2] * 3;
      const x = side * (position[a] + position[b] + position[c]) / 3, z = (position[a + 2] + position[b + 2] + position[c + 2]) / 3;
      if (x < half * 0.55 || z < z0 || z >= z1) continue;
      const yHi = Math.max(position[a + 1], position[b + 1], position[c + 1]);
      if (yHi < sill || yHi > top) continue;
      const ux = position[b] - position[a], uy = position[b + 1] - position[a + 1], uz = position[b + 2] - position[a + 2];
      const vx = position[c] - position[a], vy = position[c + 1] - position[a + 1], vz = position[c + 2] - position[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nzz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nzz);
      if (!(l > 0) || side * nx / l < 0.35 || Math.abs(ny / l) > 0.8) continue;
      const i = Math.min(nz - 1, Math.floor((z - z0) / cell));
      if (yHi > high[i]) high[i] = yHi;
    }
    const list = [];
    for (let i = Math.floor(nz * 0.2); i < Math.ceil(nz * 0.8); i += 1) if (high[i] > -Infinity) list.push(high[i]);
    if (!list.length) continue;
    list.sort((p, q) => p - q);
    const m = list[list.length >> 1];
    best = best === null ? m : Math.max(best, m);
  }
  return best;
}

// The top of a step running along a car's side under its doors (the pickup's, the square SUVs', the off-roaders'), or
// the sill if it has none: its tread, the most of what faces up low down along the doors' stretch, on both sides (at
// least 0.12 square metres a side in a band 5 cm high, and the bands just over it with a third of that).
function stepTop(plan, position, index) {
  const { half, sill, top, regions, unit } = plan;
  const z0 = Math.min(...regions.map((r) => r[2])), z1 = Math.max(...regions.map((r) => r[3]));
  const cell = 0.05 * unit, ny = Math.max(1, Math.ceil((top - sill) / cell));
  const up = [new Float64Array(ny), new Float64Array(ny)];
  for (let t = 0; t < index.length / 3; t += 1) {
    const a = index[t * 3] * 3, b = index[t * 3 + 1] * 3, c = index[t * 3 + 2] * 3;
    const x = (position[a] + position[b] + position[c]) / 3, y = (position[a + 1] + position[b + 1] + position[c + 1]) / 3, z = (position[a + 2] + position[b + 2] + position[c + 2]) / 3;
    if (Math.abs(x) < half * 0.7 || y < sill || y >= top || z < z0 || z >= z1) continue;
    const ux = position[b] - position[a], uy = position[b + 1] - position[a + 1], uz = position[b + 2] - position[a + 2];
    const vx = position[c] - position[a], vy = position[c + 1] - position[a + 1], vz = position[c + 2] - position[a + 2];
    const nx = uy * vz - uz * vy, nyy = uz * vx - ux * vz, nzz = ux * vy - uy * vx;
    const l = Math.hypot(nx, nyy, nzz);
    if (!(l > 0) || nyy / l < 0.8) continue;
    up[x > 0 ? 0 : 1][Math.min(ny - 1, Math.floor((y - sill) / cell))] += l / 2 / (unit * unit);
  }
  const low = Math.floor(ny * 0.4);
  let j = -1;
  for (let k = 0; k < low; k += 1) if (up[0][k] >= 0.12 && up[1][k] >= 0.12) j = k;
  if (j < 0) return sill;
  while (j + 1 < low && up[0][j + 1] >= 0.04 && up[1][j + 1] >= 0.04) j += 1;
  return sill + (j + 1) * cell + 0.02 * unit;
}

// The body's triangles that cross a door's edges (its front and back, and the sill under it) split along them, so that
// the door cut out to swing open is the skin within them exactly: straight edges, as a door's, not a row of the
// model's own triangles' teeth. Each new point lies on the old triangle's edge (its place, the way it faces and its
// picture's place drawn between the edge's ends), and the triangles either side of an edge share it: nothing is seen
// to change while the door is shut, and no crack opens along the cut. Returns the points (the model's, then the new
// ones), the body's new list of triangles, and which of its own triangles each came from (for its glass); or null.
export function clipDoors(plan, position, normal, uv, index) {
  const { half, sill, regions } = plan;
  // the planes: [axis, value] (axis 2: across the car at z = value; axis 1: level at y = value), cutting whatever
  // crosses them out at the car's sides (all of it there, both sides of every cut edge alike: no crack)
  const planes = [];
  for (const [, , z0, z1] of regions) for (const z of [z0, z1]) if (!planes.some((q) => q[0] === 2 && q[1] === z)) planes.push([2, z]);
  planes.push([1, sill]);
  if (plan.cutTop) planes.push([1, plan.top]);
  const n = position.length / 3;
  // (the new points, after the model's own)
  const extraP = [], extraN = [], extraU = [];
  const pos = (k, i) => (k < n ? position[k * 3 + i] : extraP[(k - n) * 3 + i]);
  const nor = (k, i) => (k < n ? normal[k * 3 + i] : extraN[(k - n) * 3 + i]);
  const tex = (k, i) => (k < n ? uv[k * 2 + i] : extraU[(k - n) * 2 + i]);
  const made = new Map();
  // (the point where edge a-b crosses the plane, made once and shared by both triangles along that edge)
  const cross = (a, b, axis, v) => {
    const key = a < b ? `${a}|${b}|${axis}|${v}` : `${b}|${a}|${axis}|${v}`;
    let k = made.get(key);
    if (k !== undefined) return k;
    const pa = pos(a, axis), pb = pos(b, axis);
    const t = Math.max(0, Math.min(1, (v - pa) / (pb - pa)));
    k = n + extraP.length / 3;
    for (let i = 0; i < 3; i += 1) extraP.push(i === axis ? v : pos(a, i) + (pos(b, i) - pos(a, i)) * t);
    let nx = nor(a, 0) + (nor(b, 0) - nor(a, 0)) * t, ny = nor(a, 1) + (nor(b, 1) - nor(a, 1)) * t, nz = nor(a, 2) + (nor(b, 2) - nor(a, 2)) * t;
    const l = Math.hypot(nx, ny, nz) || 1;
    extraN.push(Math.round((nx / l) * 32767), Math.round((ny / l) * 32767), Math.round((nz / l) * 32767));
    for (let i = 0; i < 2; i += 1) extraU.push(tex(a, i) + (tex(b, i) - tex(a, i)) * t);
    made.set(key, k);
    return k;
  };
  // (a polygon, a list of points, split by a plane into what lies below it and what lies above; a point on the plane
  // belongs to both)
  const EPS = 1e-6;
  const split = (poly, axis, v) => {
    const sides = poly.map((a) => { const d = pos(a, axis) - v; return d < -EPS ? -1 : d > EPS ? 1 : 0; });
    if (!sides.includes(-1) || !sides.includes(1)) return [poly];
    const lo = [], hi = [];
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i], j = (i + 1) % poly.length, b = poly[j], sa = sides[i], sb = sides[j];
      if (sa <= 0) lo.push(a);
      if (sa >= 0) hi.push(a);
      if (sa * sb < 0) { const k = cross(a, b, axis, v); lo.push(k); hi.push(k); }
    }
    return [lo, hi].filter((q) => q.length >= 3);
  };
  const crosses = (q, axis, v) => {
    let lo = Infinity, hi = -Infinity, xs = 0;
    for (const k of q) { const c = pos(k, axis); if (c < lo) lo = c; if (c > hi) hi = c; const x = Math.abs(pos(k, 0)); if (x > xs) xs = x; }
    return xs > reach && lo < v - EPS && hi > v + EPS;
  };
  const tris = index.length / 3;
  // (the new list, grown as it fills)
  let out = new Uint32Array(index.length + 3072), parent = new Int32Array(tris + 1024), w = 0;
  const put = (a, b, c, t) => {
    if (w + 1 > parent.length) { const o = new Uint32Array(out.length * 2); o.set(out); out = o; const p = new Int32Array(parent.length * 2); p.set(parent); parent = p; }
    out[w * 3] = a; out[w * 3 + 1] = b; out[w * 3 + 2] = c; parent[w] = t; w += 1;
  };
  let changed = false;
  const reach = half * 0.3;
  for (let t = 0; t < tris; t += 1) {
    const a = index[t * 3], b = index[t * 3 + 1], c = index[t * 3 + 2];
    // (most cross none of the planes: kept as they are)
    let any = false;
    if (Math.max(Math.abs(position[a * 3]), Math.abs(position[b * 3]), Math.abs(position[c * 3])) > reach) {
      for (const [axis, v] of planes) {
        const pa = position[a * 3 + axis], pb = position[b * 3 + axis], pc = position[c * 3 + axis];
        if (Math.min(pa, pb, pc) < v - EPS && Math.max(pa, pb, pc) > v + EPS) { any = true; break; }
      }
    }
    if (!any) { put(a, b, c, t); continue; }
    let pieces = [[a, b, c]];
    for (const [axis, v] of planes) {
      const next = [];
      for (const q of pieces) { if (crosses(q, axis, v)) { next.push(...split(q, axis, v)); changed = true; } else next.push(q); }
      pieces = next;
    }
    for (const q of pieces) for (let i = 1; i + 1 < q.length; i += 1) put(q[0], q[i], q[i + 1], t);
  }
  if (!changed) return null;
  const P = new Float32Array(position.length + extraP.length); P.set(position); P.set(extraP, position.length);
  const N = new Int16Array(normal.length + extraN.length); N.set(normal); N.set(extraN, normal.length);
  const U = new Float32Array(uv.length + extraU.length); U.set(uv); U.set(extraU, uv.length);
  return { position: P, normal: N, uv: U, index: out.slice(0, w * 3), parent: parent.slice(0, w) };
}

// Which of the body's triangles go with which door, and the body's list put in order: the rest, then each door's
// (and, for the glass, which of the shape's own triangles each now is: `parent`, from `clipDoors`).
export function sortDoors(plan, position, normal, index, parent = null) {
  const { half, sill, top, regions, thick, pillar } = plan;
  const tris = index.length / 3;
  const tag = new Int8Array(tris).fill(-1);
  const slack = 1e-4;
  // each triangle: its middle, the way it faces, and which door's stretch it lies within (on its side)
  const cx = new Float32Array(tris), cy = new Float32Array(tris), cz = new Float32Array(tris), fx = new Float32Array(tris), fy = new Float32Array(tris);
  const where = new Int8Array(tris).fill(-1);
  // (over an open car's door, cut along its top, only a mirror standing out from it goes with it: `over`)
  const over = new Uint8Array(tris);
  const mirrorTop = plan.cutTop ? top + 0.25 * plan.unit : top;
  for (let t = 0; t < tris; t += 1) {
    const a = index[t * 3] * 3, b = index[t * 3 + 1] * 3, c = index[t * 3 + 2] * 3;
    const yLo = Math.min(position[a + 1], position[b + 1], position[c + 1]), yHi = Math.max(position[a + 1], position[b + 1], position[c + 1]);
    if (yLo < sill - slack || yHi > mirrorTop + slack) continue;
    if (yHi > top + slack) { if (yLo < top - slack) continue; over[t] = 1; }
    const zLo = Math.min(position[a + 2], position[b + 2], position[c + 2]), zHi = Math.max(position[a + 2], position[b + 2], position[c + 2]);
    const x = (position[a] + position[b] + position[c]) / 3, z = (position[a + 2] + position[b + 2] + position[c + 2]) / 3;
    let k = -1;
    for (let r = 0; r < regions.length; r += 1) {
      const [, side, z0, z1] = regions[r];
      if (side * x > half * 0.3 && zLo >= z0 - slack && zHi <= z1 + slack) { k = r; break; }
    }
    if (k < 0) continue;
    const ux = position[b] - position[a], uy = position[b + 1] - position[a + 1], uz = position[b + 2] - position[a + 2];
    const vx = position[c] - position[a], vy = position[c + 1] - position[a + 1], vz = position[c + 2] - position[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (!(l > 0)) continue;
    where[t] = k; cx[t] = x; cy[t] = (position[a + 1] + position[b + 1] + position[c + 1]) / 3; cz[t] = z; fx[t] = nx / l; fy[t] = ny / l;
  }
  // the outer skin over each door, on a grid along it and up it (about 5 cm a square): how far out it is there, read
  // from what faces outward and stands out at the side (the most of it)
  const cell = 0.05 * plan.unit;
  const skins = regions.map(([, , z0, z1]) => { const nz = Math.max(1, Math.ceil((z1 - z0) / cell)), ny = Math.max(1, Math.ceil((top - sill) / cell)); return { z0, nz, ny, out: new Float32Array(nz * ny).fill(-Infinity) }; });
  const cellOf = (s, y, z) => Math.min(s.nz - 1, Math.max(0, Math.floor((z - s.z0) / cell))) * s.ny + Math.min(s.ny - 1, Math.max(0, Math.floor((y - sill) / cell)));
  // (each square of the skin a triangle covers, seen from the side: a large one covers many)
  for (let t = 0; t < tris; t += 1) {
    const k = where[t]; if (k < 0 || over[t]) continue;
    const side = regions[k][1], o = side * cx[t];
    if (!(side * fx[t] > 0.35 && Math.abs(fy[t]) < 0.8 && o > half * 0.55)) continue;
    const s = skins[k];
    const a = index[t * 3] * 3, b = index[t * 3 + 1] * 3, c = index[t * 3 + 2] * 3;
    const y0 = Math.min(position[a + 1], position[b + 1], position[c + 1]), y1 = Math.max(position[a + 1], position[b + 1], position[c + 1]);
    const zl = Math.min(position[a + 2], position[b + 2], position[c + 2]), zh = Math.max(position[a + 2], position[b + 2], position[c + 2]);
    const i0 = Math.max(0, Math.floor((zl - s.z0) / cell)), i1 = Math.min(s.nz - 1, Math.floor((zh - s.z0) / cell));
    const j0 = Math.max(0, Math.floor((y0 - sill) / cell)), j1 = Math.min(s.ny - 1, Math.floor((y1 - sill) / cell));
    for (let i = i0; i <= i1; i += 1) for (let j = j0; j <= j1; j += 1) if (o > s.out[i * s.ny + j]) s.out[i * s.ny + j] = o;
  }
  // (a square standing out from those round it, a mirror's, taken as theirs: the door's skin behind the mirror is the
  // door; and a square with none of the skin found in it takes the furthest out of its neighbours', a few squares round)
  for (const s of skins) {
    const known = s.out.slice();
    for (let i = 0; i < s.nz; i += 1) for (let j = 0; j < s.ny; j += 1) {
      const near = [];
      for (let di = -2; di <= 2; di += 1) for (let dj = -4; dj <= 4; dj += 1) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < s.nz && b < s.ny && known[a * s.ny + b] > -Infinity) near.push(known[a * s.ny + b]); }
      if (!near.length) continue;
      near.sort((p, q) => p - q);
      const middle = near[near.length >> 1];
      const own = known[i * s.ny + j];
      s.out[i * s.ny + j] = own > -Infinity ? Math.min(own, middle + thick * 0.25) : -Infinity;
    }
    const firm = s.out.slice();
    for (let i = 0; i < s.nz; i += 1) for (let j = 0; j < s.ny; j += 1) {
      if (firm[i * s.ny + j] > -Infinity) continue;
      let best = -Infinity;
      for (let r = 1; r <= 3 && best === -Infinity; r += 1) for (let di = -r; di <= r; di += 1) for (let dj = -r; dj <= r; dj += 1) {
        const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= s.nz || b >= s.ny) continue;
        best = Math.max(best, firm[a * s.ny + b]);
      }
      s.out[i * s.ny + j] = best;
    }
    // (how high the side's skin goes at each place along the door: over it, a closed car's roof and its lining)
    s.high = new Float32Array(s.nz).fill(-Infinity);
    for (let i = 0; i < s.nz; i += 1) for (let j = s.ny - 1; j >= 0; j -= 1) if (known[i * s.ny + j] > -Infinity) { s.high[i] = sill + (j + 1) * cell; break; }
  }
  const roofed = !!plan.roofed;

  // the door: whatever lies within a door's thickness of that skin (the skin itself, its creases, its window, the
  // mirror standing out from it, and its inside where the model has one)
  const counts = regions.map(() => 0), outer = regions.map(() => 0);
  for (let t = 0; t < tris; t += 1) {
    const k = where[t]; if (k < 0) continue;
    const side = regions[k][1], o = side * cx[t], s = skins[k];
    const skin = s.out[cellOf(s, cy[t], cz[t])];
    // (how deep a door is: its skin and window within 14 cm, its inside's panel facing the seats within 36, what lies
    // along it (an armrest's top, a pocket) within 20)
    const facing = side * fx[t];
    const deep = facing > 0.2 ? thick : facing < -0.2 ? thick * 2.57 : thick * 1.43;
    if (!(skin > -Infinity) || o < skin - deep || o < half * 0.5) continue;
    if (over[t] && !(o > skin + 0.02 * plan.unit)) continue;
    // (a step or a sill standing out low down is the body's: a mirror stands out high up)
    if (o > skin + thick * 0.25 && cy[t] < sill + (top - sill) * 0.3) continue;
    // (a closed car's roof over the door, and its lining under it, are the body's)
    if (roofed && Math.abs(fy[t]) > 0.8) { const col = Math.min(s.nz - 1, Math.max(0, Math.floor((cz[t] - s.z0) / cell))); if (cy[t] > s.high[col] - cell) continue; }
    tag[t] = k; counts[k] += 1;
    // (its hinge on its skin, not out at its mirror)
    if (o > outer[k] && o <= skin + 0.02 * plan.unit) outer[k] = o;
  }
  // (too few to be a door: none cut there)
  for (let k = 0; k < regions.length; k += 1) if (counts[k] < 40) { for (let t = 0; t < tris; t += 1) if (tag[t] === k) tag[t] = -1; counts[k] = 0; }
  if (!counts.some((c) => c > 0)) return null;
  // the list in order: the rest, then each door's (and, for the glass, which of the shape's own triangles each now is)
  const copy = index.slice();
  const order = new Int32Array(tris);
  const own = (t) => (parent ? parent[t] : t);
  let w = 0;
  for (let t = 0; t < tris; t += 1) if (tag[t] < 0) { index[w * 3] = copy[t * 3]; index[w * 3 + 1] = copy[t * 3 + 1]; index[w * 3 + 2] = copy[t * 3 + 2]; order[w] = own(t); w += 1; }
  const restCount = w;
  const list = [];
  for (let k = 0; k < regions.length; k += 1) {
    if (!counts[k]) continue;
    const from = w;
    for (let t = 0; t < tris; t += 1) if (tag[t] === k) { index[w * 3] = copy[t * 3]; index[w * 3 + 1] = copy[t * 3 + 1]; index[w * 3 + 2] = copy[t * 3 + 2]; order[w] = own(t); w += 1; }
    const [key, side, z0, z1] = regions[k];
    // (the opening's edges, where the door is cut from the body: how far out the skin is up its front and back edges
    // and along its foot, for the faces that close the opening (car-model.js `jambs`))
    const s = skins[k];
    const edge = (i) => { const pts = []; const hi = s.high[i] > -Infinity ? s.high[i] : top; for (let j = 0; j < s.ny; j += 1) { const y = sill + (j + 0.5) * cell; if (y > hi) break; const o = s.out[i * s.ny + j]; if (o > -Infinity) pts.push([Math.min(y, top), o]); } return pts; };
    const foot = []; for (let i = 0; i < s.nz; i += 1) { const o = s.out[i * s.ny]; if (o > -Infinity) foot.push([Math.min(z1, z0 + (i + 0.5) * cell), o]); }
    list.push({ key, side, from, count: counts[k], hinge: [side * outer[k], z1], rear: z0, bottom: sill, jambs: { front: edge(s.nz - 1), back: edge(0), foot } });
  }
  return { restCount, list, order, pillar };
}
