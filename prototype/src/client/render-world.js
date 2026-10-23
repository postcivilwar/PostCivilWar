// Static world: ground, river, roads, buildings, trees and street furniture.
// Almost everything is baked into a handful of merged meshes, one for each
// kind of surface, so the whole town costs a few draw calls.
// THREE is the global from three.min.js.

import { ZONE, ZONE_ROADS, ZONE_BUILDINGS, ZONE_STALLS, ZONE_VEHICLES, ZONE_LAMPS, ZONE_BENCHES, ZONE_MOULD_STATIONS, ZONE_TREES, ZONE_JETTY, ZONE_PROPS, ZONE_PLACES, ZONE_SHOPS, CITY_AREA, zoneShoreZ, zoneWalkable, POWERBIKE , HABITATION, RIVER_HEAD, RIVER_FAR, UPRIVER } from '../sim/zone.js';
import { Batch, Chunked, createSight, place, linear, lathe, textTexture, noise, smoothNoise, grainTexture, grassTexture, rippleNormalTexture, shadeOf, addPitchedRoof, addWindow, buildingKit, surface, isLite } from './render-kit.js';
import { addVehicle } from './render-vehicles.js';
import { makeVehicleModel } from './vehicle-models.js';
import { buildShowroom } from './render-holaris.js';
import { buildCity } from './render-city.js';
import { Foliage, treeLeaves, foliageMaterials, setWind } from './render-foliage.js';
import { reflects, weathers } from './render-finish.js';

const mixOf = (a, b, k) => new THREE.Color(a).lerp(new THREE.Color(b), k).getHex();
const onRoad = (x, z, pad = 0) => ZONE_ROADS.some((r) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad);
const wornAt = (x, z) => { let busiest = 0; for (const [wx, wz, radius] of ZONE_PROPS.worn) busiest = Math.max(busiest, 1 - Math.hypot(x - wx, z - wz) / radius); return busiest; };

// (beyond the town's north end, from the habitation's edge on, the habitation draws its own ground: render-habitation.js.
// Since 21 October 2026 it is at the end of the town's road, so the town's ground, river bank and far bank stop there.)
const HABITATION_EDGE = HABITATION.bounds.x0;
function buildGround() {
  const b = ZONE.bounds;
  const margin = 220;
  const gx0 = b.minX - margin, gx1 = Math.min(b.maxX + margin, HABITATION_EDGE);
  const w = gx1 - gx0;
  const d = b.maxZ - b.minZ + margin * 2;
  const geometry = new THREE.PlaneGeometry(w, d, 170, 160);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate((gx0 + gx1) / 2, 0, (b.minZ + b.maxZ) / 2);
  const position = geometry.attributes.position;
  const colours = new Float32Array(position.count * 3);
  const grassA = linear(0x5f9440), grassB = linear(0x8cb655), dryGrass = linear(0xa9a85a), earth = linear(ZONE_PROPS.earth), sand = linear(0xe2d2a2), bed = linear(0x6b6a4c);
  const c = new THREE.Color();
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const shore = zoneShoreZ(x);
    const patch = smoothNoise(x / 34, z / 34) * 0.65 + smoothNoise(x / 9, z / 9) * 0.35;
    c.copy(grassA).lerp(grassB, patch);
    c.lerp(dryGrass, Math.max(0, smoothNoise(x / 55 + 9, z / 55) - 0.55) * 1.4);
    // Bare red earth where the town is busiest, and along the road edges.
    const worn = Math.min(1, Math.max(0, wornAt(x, z) * 1.7 - 0.2 + (smoothNoise(x / 12 + 40, z / 12) - 0.5) * 0.5));
    c.lerp(earth, worn * 0.85);
    if (onRoad(x, z, 2.6)) c.lerp(earth, 0.75);
    const toShore = shore - z;
    if (toShore < 26) c.lerp(sand, Math.min(1, Math.max(0, (26 - toShore) / 22)));
    let y = 0;
    if (toShore < 0) { y = Math.max(-3.2, toShore * 0.16); c.lerp(bed, Math.min(1, -toShore / 10)); }
    const outside = Math.max(b.minX - x, x - b.maxX, b.minZ - z, 0);
    if (outside > 0 && toShore > 0) y = Math.min(9, outside * 0.03) * smoothNoise(x / 60, z / 60);
    // (level with the habitation's own ground where it begins)
    if (x > b.maxX && toShore > 0) y *= Math.max(0, Math.min(1, (HABITATION_EDGE - x) / 40));
    // (the road on from the town's end to the habitation's gate and its car park lie on the land: under them and a few
    // metres round them the ground is no higher than they are, 21 October 2026)
    {
      const off = (q) => Math.hypot(Math.max(q.x0 - x, 0, x - q.x1), Math.max(q.z0 - z, 0, z - q.z1));
      const near = Math.min(off(UPRIVER.road), off(UPRIVER.park));
      // (wide enough that this coarse ground has a row of its points under the road and both its sides)
      if (near < 16 && y > -0.06) { const k = Math.max(0, Math.min(1, (near - 6) / 10)); y = -0.06 + (y + 0.06) * k * k * (3 - 2 * k); }
    }
    // beyond the town towards Onitsha the land is drawn by render-outskirts.js: this lies just under it
    if (x < b.minX - 6 && z > -650 && z < 140 && toShore > 0) y = -0.12;
    position.setY(i, y);
    colours[i * 3] = c.r; colours[i * 3 + 1] = c.g; colours[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geometry.computeVertexNormals();
  const map = grassTexture();
  map.repeat.set(w / 3.2, d / 3.2);
  const mesh = new THREE.Mesh(geometry, surface({ vertexColors: true, map, roughness: 1, metalness: 0 }));
  mesh.receiveShadow = true;
  return mesh;
}

// Tufts of grass standing out of the ground: instanced, a square of ground
// to a mesh, so that grass out of sight is not drawn.
function buildGrass() {
  const tri = [];
  for (let i = 0; i < 7; i += 1) {
    const a = i * 2.4;
    const out = 0.03 + (i % 3) * 0.05;
    const bx = Math.cos(a) * out, bz = Math.sin(a) * out;
    const tall = 0.2 + ((i * 5) % 4) * 0.045;
    tri.push(bx - Math.sin(a) * 0.018, 0, bz + Math.cos(a) * 0.018, bx + Math.sin(a) * 0.018, 0, bz - Math.cos(a) * 0.018, bx * 2.6, tall, bz * 2.6);
  }
  const positions = new THREE.Float32BufferAttribute(tri, 3);
  const b = ZONE.bounds;
  const cell = 110;
  const squares = new Map();
  let count = 0;
  for (let i = 0; count < 11000 && i < 90000; i += 1) {
    const x = b.minX + noise(i, 21) * (b.maxX - b.minX);
    const z = b.minZ + noise(i, 37) * (b.maxZ - b.minZ);
    if (z > zoneShoreZ(x) - 6 || onRoad(x, z, 1.2) || wornAt(x, z) > 0.3) continue;
    if (smoothNoise(x / 14, z / 14) < 0.42) continue;                                // grass grows in drifts, not evenly
    if (!zoneWalkable(x, z, [], 1.6)) continue;
    // (none in PostCivilWar PowerBike's hall, whose floor is walked on but is indoors, nor on its paved forecourt)
    const pb = POWERBIKE.footprint, door = POWERBIKE.doors;
    if (x > pb.x0 - 0.5 && x < pb.x1 + 0.5 && z > pb.z0 - 0.5 && z < pb.z1 + 0.5) continue;
    if (x > door.x - 8.5 && x < door.x + 8.5 && z >= pb.z1 && z < pb.z1 + 6.9) continue;
    const key = `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
    if (!squares.has(key)) squares.set(key, []);
    squares.get(key).push([x, z, i]);
    count += 1;
  }
  const material = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  const meshes = [];
  const m = new THREE.Matrix4();
  const colour = new THREE.Color();
  for (const [key, spots] of squares) {
    const [cx, cz] = key.split(',').map(Number);
    const blade = new THREE.BufferGeometry();
    blade.setAttribute('position', positions);
    blade.computeVertexNormals();
    blade.boundingSphere = new THREE.Sphere(new THREE.Vector3((cx + 0.5) * cell, 0, (cz + 0.5) * cell), cell * 0.75);
    const mesh = new THREE.InstancedMesh(blade, material, spots.length);
    // (a cell out of view is not drawn: three.js since r151 tests a set of copies against the view, which r128 never did;
    // by the cell's own sphere, round all its blades, which `blade` carries for the sight list. Left to three.js, the
    // sphere would be the blade's moved to each copy: the cell's moved again, and nowhere near the grass)
    mesh.boundingSphere = blade.boundingSphere.clone();
    spots.forEach(([x, z, i], index) => {
      const s = 0.8 + noise(i, 5) * 0.9;
      m.copy(place(x, 0, z, noise(i, 7) * 6.28, s, s * (0.8 + noise(i, 9) * 0.7), s));
      mesh.setMatrixAt(index, m);
      colour.copy(linear(noise(i, 11) > 0.7 ? 0xa9ad5c : 0x6f9f48)).lerp(linear(0x8cb655), noise(i, 13));
      mesh.setColorAt(index, colour);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.userData.full = spots.length;
    meshes.push(mesh);
  }
  return meshes;
}

// ------------------------------------------------------------------ trees --

// A limb: a tapered round branch from (x, y, z) outward along `a` (an angle on the ground) and up, `tilt` from the
// upright, `length` long, `r0` thick at its base and `r1` at its end. Gives where it ends.
const UP = new THREE.Vector3(0, 1, 0);
function limb(solid, x, y, z, a, tilt, length, r0, r1, colour) {
  const dir = new THREE.Vector3(Math.sin(tilt) * Math.cos(a), Math.cos(tilt), Math.sin(tilt) * Math.sin(a));
  const at = new THREE.Vector3(x, y, z).addScaledVector(dir, length / 2);
  solid.round(new THREE.CylinderGeometry(r1, r0, length, 7), new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromUnitVectors(UP, dir), new THREE.Vector3(1, 1, 1)), colour);
  return { x: x + dir.x * length, y: y + dir.y * length, z: z + dir.z * length };
}

// A tree: its trunk and branches into `solid`, its leaves into `foliage` (render-foliage.js: leaves drawn from pictures
// of leaves, the air between them see-through, moving in the wind).
export function addTree(solid, foliage, t) {
  const s = t.size;
  const jitter = (k) => noise(t.x * 3.1 + k, t.z * 1.7);
  if (t.kind === 'palm') {
    // coconut palm: a tall, slightly curved trunk ringed with old leaf scars
    const height = 7.2 * s;
    const lean = 0.09 * Math.sin(t.turn * 3);
    const segments = 7;
    let topX = t.x;
    for (let i = 0; i < segments; i += 1) {
      const k = i / segments;
      const y = height * k;
      const x = t.x + lean * height * k * k;
      const r0 = (0.25 - 0.1 * k) * s;
      solid.round(new THREE.CylinderGeometry(r0 - 0.014 * s, r0, height / segments + 0.02, 9), place(x, y + height / segments / 2, t.z, 0, 1, 1, 1, 0, -lean * 2 * k), i % 2 ? 0x8f7a5e : 0x7c684e);
      topX = t.x + lean * height * (k + 1 / segments) * (k + 1 / segments);
    }
    treeLeaves(foliage, t, s, jitter, { x: topX, y: height });
    for (let i = 0; i < 4; i += 1) solid.round(new THREE.SphereGeometry(0.17 * s, 8, 6), place(topX + Math.cos(i * 1.7) * 0.24, height - 0.3, t.z + Math.sin(i * 1.7) * 0.24), 0x5f6b2c);
  } else if (t.kind === 'oilpalm') {
    // oil palm: a short stout trunk rough with leaf bases, and a full round crown
    const height = 4.2 * s;
    for (let i = 0; i < 6; i += 1) {
      const y = (height * i) / 6;
      solid.add(new THREE.CylinderGeometry((0.3 + (i % 2) * 0.05) * s, (0.36 + (i % 2) * 0.04) * s, height / 6 + 0.02, 8), place(t.x, y + height / 12, t.z, i * 0.5), i % 2 ? 0x5a4a37 : 0x6a5842);
    }
    treeLeaves(foliage, t, s, jitter, { x: t.x, y: height });
    solid.round(new THREE.SphereGeometry(0.32 * s, 8, 6), place(t.x + 0.3, height - 0.35, t.z + 0.2, 0, 1, 1.2, 1), 0x7a2c1c);
    solid.round(new THREE.SphereGeometry(0.27 * s, 8, 6), place(t.x - 0.28, height - 0.4, t.z - 0.22, 0, 1, 1.2, 1), 0x8a3a1e);
  } else if (t.kind === 'mango') {
    // mango: a short trunk forking into three limbs that reach up and out, each forking again, into a dense dome of
    // leaves (seen between them)
    solid.round(new THREE.CylinderGeometry(0.28 * s, 0.42 * s, 2.3 * s, 9), place(t.x, 1.15 * s, t.z), 0x5f4a36);
    for (let i = 0; i < 3; i += 1) {
      const a = t.turn + i * 2.1 + (jitter(i + 60) - 0.5) * 0.5;
      const end = limb(solid, t.x, 2.1 * s, t.z, a, 0.55 + jitter(i + 63) * 0.2, 2.0 * s, 0.22 * s, 0.13 * s, 0x5f4a36);
      for (const side of [-1, 1]) limb(solid, end.x, end.y, end.z, a + side * 0.6, 0.8 + jitter(i * 2 + side + 66) * 0.35, 1.6 * s, 0.11 * s, 0.05 * s, 0x5a4633);
    }
    treeLeaves(foliage, t, s, jitter, null);
  } else {
    // tropical almond: a straight trunk with level branches in tiers, the leaves lying flat on them
    solid.round(new THREE.CylinderGeometry(0.16 * s, 0.26 * s, 5.0 * s, 8), place(t.x, 2.5 * s, t.z), 0x74604a);
    const tiers = [[2.9, 3.0], [2.3, 4.0], [1.6, 4.9], [0.9, 5.6]];
    tiers.forEach(([r, y], i) => {
      for (let k = 0; k < 5; k += 1) { const a = t.turn + i + k * 1.26; limb(solid, t.x, y * s - 0.2, t.z, a, Math.PI / 2 - 0.12, r * s * 0.95, 0.06 * s, 0.025 * s, 0x74604a); }
    });
    treeLeaves(foliage, t, s, jitter, null);
  }
}

// -------------------------------------------------------------- buildings --

function addBuilding(B, signs, b) {
  if (b.kind === 'showroom') return;      // drawn by its own code: see buildShowroom
  if (b.kind === 'tower') return;         // the owner's supplied model, drawn by its own code: see render-powerbike.js
  const { solid, walls, roofs } = B;
  const south = b.door === 's';
  const dir = south ? 1 : -1;
  const front = b.z + (dir * b.d) / 2;
  const back = b.z - (dir * b.d) / 2;
  const base = 0.35;
  const top = base + b.h;
  const official = b.kind === 'government' || b.kind === 'service';

  solid.box(b.w + 0.5, base, b.d + 0.5, place(b.x, base / 2, b.z), 0x8d877b);
  walls.box(b.w, b.h, b.d, place(b.x, base + b.h / 2, b.z), b.wall);
  // the lower metre is painted darker, where rain splashes the red earth up
  const skirt = mixOf(b.wall, 0x7a4a30, 0.55);
  walls.box(b.w + 0.05, 0.9, b.d + 0.05, place(b.x, base + 0.45, b.z), skirt);
  walls.box(b.w + 0.08, 0.06, b.d + 0.08, place(b.x, base + 0.93, b.z), shadeOf(skirt, 0.8));

  // pitched roof of corrugated sheet, with eaves, fascia and gable ends
  const { rise } = addPitchedRoof(B, b.x, b.z, b.w, b.d, top, b.roof, b.wall);

  // veranda: a raised slab, round columns, a lean-to roof and steps
  const depth = 2.6;
  const vw = Math.min(b.w, b.kind === 'home' ? 5 : b.w);
  solid.box(vw, 0.24, depth, place(b.x, 0.12, front + (dir * depth) / 2), 0x9c958a);
  solid.box(1.8, 0.12, 0.45, place(b.x, 0.06, front + dir * (depth + 0.22)), 0x8d877b);
  roofs.box(vw + 0.7, 0.06, depth + 0.6, place(b.x, base + b.h * 0.8, front + (dir * depth) / 2, 0, 1, 1, 1, dir * 0.16, 0), b.roof, 0.92, 'plan');
  solid.box(vw + 0.2, 0.16, 0.16, place(b.x, base + b.h * 0.72 - 0.02, front + dir * (depth - 0.25)), 0xe4e0d4);
  const posts = Math.max(2, Math.round(vw / 4.5) + 1);
  for (let i = 0; i < posts; i += 1) {
    const px = b.x - vw / 2 + 0.3 + (i * (vw - 0.6)) / (posts - 1);
    const pz = front + dir * (depth - 0.25);
    solid.round(new THREE.CylinderGeometry(0.1, 0.12, b.h * 0.72 - 0.24, 12), place(px, 0.24 + (b.h * 0.72 - 0.24) / 2, pz), 0xeeeae0);
    solid.box(0.32, 0.14, 0.32, place(px, 0.31, pz), 0xd9d4c6);
    solid.box(0.28, 0.1, 0.28, place(px, base + b.h * 0.72 - 0.15, pz), 0xd9d4c6);
  }

  // door
  const doorW = b.kind === 'home' ? 1.05 : 1.7;
  const leaf = b.kind === 'business' ? 0x3d5a73 : 0x5a3d26;
  solid.box(doorW + 0.26, 2.36, 0.14, place(b.x, base + 1.18, front + dir * 0.02), 0x3a2a1c);
  solid.box(doorW, 2.2, 0.1, place(b.x, base + 1.1, front + dir * 0.07), leaf);
  const panels = b.kind === 'home' ? [0] : [-0.25, 0.25];
  for (const off of panels) {
    for (const py of [0.62, 1.58]) solid.box(doorW * (b.kind === 'home' ? 0.66 : 0.34), 0.7, 0.05, place(b.x + off * doorW, base + py, front + dir * 0.12), shadeOf(leaf, 0.82));
    solid.round(new THREE.SphereGeometry(0.045, 8, 6), place(b.x + off * doorW + (b.kind === 'home' ? 0.38 : -Math.sign(off) * 0.12), base + 1.1, front + dir * 0.16), 0xc9a227);
  }
  if (b.kind !== 'home') solid.box(0.03, 2.2, 0.12, place(b.x, base + 1.1, front + dir * 0.08), 0x2a1e14);

  // windows: front and back, then the two sides
  const winY = base + b.h * (b.h > 5 ? 0.3 : 0.58);
  const count = Math.max(1, Math.floor((b.w - 3) / 4.2));
  for (let i = 0; i < count; i += 1) {
    for (const side of [-1, 1]) {
      const wx = b.x + side * (2.3 + i * 3.6);
      if (Math.abs(wx - b.x) > b.w / 2 - 1.1) continue;
      addWindow(B, wx, winY, front + dir * 0.03, true, official);
      addWindow(B, wx, winY, back - dir * 0.03, true, official);
      // an upper floor
      if (b.h > 5) { addWindow(B, wx, base + b.h * 0.78, front + dir * 0.03, true, false); addWindow(B, wx, base + b.h * 0.78, back - dir * 0.03, true, false); }
    }
  }
  if (b.h > 5) walls.box(b.w + 0.1, 0.14, b.d + 0.1, place(b.x, base + b.h * 0.52, b.z), shadeOf(b.wall, 0.85));
  for (const side of [-1, 1]) {
    const n = Math.max(1, Math.floor(b.d / 5));
    for (let i = 0; i < n; i += 1) addWindow(B, b.x + side * (b.w / 2 + 0.03), winY, b.z - b.d / 2 + (b.d * (i + 0.5)) / n, false, official);
  }

  // what stands around it
  if (b.kind !== 'home') {
    // a black water tank on a steel stand, at the back corner
    const tx = b.x - b.w / 2 + 1.4;
    const tz = back - dir * 1.3;
    for (const [dx, dz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) solid.box(0.08, 2.6, 0.08, place(tx + dx, 1.3, tz + dz), 0x55585c);
    solid.box(1.5, 0.08, 1.5, place(tx, 2.62, tz), 0x55585c);
    for (const y of [0.9, 1.8]) { solid.box(1.28, 0.05, 0.05, place(tx, y, tz - 0.6), 0x55585c); solid.box(1.28, 0.05, 0.05, place(tx, y, tz + 0.6), 0x55585c); }
    solid.round(new THREE.CylinderGeometry(0.72, 0.74, 1.5, 18), place(tx, 3.41, tz), 0x1c1d20);
    solid.round(new THREE.SphereGeometry(0.72, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), place(tx, 4.16, tz, 0, 1, 0.32, 1), 0x1c1d20);
    for (const y of [3.0, 3.4, 3.8]) solid.round(new THREE.TorusGeometry(0.735, 0.02, 5, 20), place(tx, y, tz, 0, 1, 1, 1, Math.PI / 2, 0), 0x2a2b2f);
  } else {
    // a blue drum by the door and a dish on the roof
    solid.round(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 12), place(b.x + vw / 2 - 0.5, 0.69, front + dir * 0.6), 0x2e6fab);
    solid.round(new THREE.SphereGeometry(0.42, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.4), place(b.x - b.w / 2 + 1.2, top + rise * 0.55, b.z + dir * 0.9, 0, 1, 0.4, 1, dir * 0.9, 0), 0xc9ccd0);
  }
  if (b.kind === 'government') {
    // the flag, on a pole by the steps
    const fx = b.x + vw / 2 + 1.2;
    const fz = front + dir * (depth + 0.8);
    solid.round(new THREE.CylinderGeometry(0.045, 0.06, 7, 8), place(fx, 3.5, fz), 0xd9dde0);
    for (const [i, colour] of [[0, 0x1f8a4c], [1, 0xf4f4f0], [2, 0x1f8a4c]]) solid.box(0.5, 0.75, 0.03, place(fx + 0.3 + i * 0.5, 6.5, fz), colour);
  }

  if (b.sign) {
    const sw = Math.min(b.w - 1, Math.max(6, b.sign.length * 0.42));
    const palette = { government: ['#f3ecdc', '#14351f'], service: ['#f3ecdc', '#1d2a44'], business: ['#f5c518', '#171a2e'], home: ['#f3ecdc', '#171a2e'], hostel: ['#f3ecdc', '#1d2a44'] }[b.kind];
    const texture = textTexture(b.sign, { width: 1024, height: 128, background: palette[0], colour: palette[1], border: palette[1], size: 78 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sw, sw / 8), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
    mesh.position.set(b.x, base + b.h * 0.8 + 0.72, front + dir * (depth + 0.36));
    mesh.rotation.y = south ? 0 : Math.PI;
    signs.push(mesh);
    solid.box(sw + 0.2, sw / 8 + 0.2, 0.08, place(b.x, base + b.h * 0.8 + 0.72, front + dir * (depth + 0.3)), 0x3a3026);
  }
}

// ------------------------------------------------------------------ market --

function addStall(B, s, index, goodsKind) {
  const { solid, leaves } = B;
  const cloth = [0xc0392b, 0x2e86ab, 0xf2c200, 0x3fa796, 0xe67e22, 0x7b4fa3, 0xf3ecdc, 0x1f5c4d];
  const colour = cloth[index % cloth.length];
  if (index % 3 === 1) {
    // a big market umbrella
    solid.round(new THREE.CylinderGeometry(0.04, 0.05, 2.7, 8), place(s.x, 1.35, s.z - 0.2), 0xc9ccd0);
    for (let i = 0; i < 8; i += 1) leaves.add(new THREE.ConeGeometry(2.0, 0.55, 1, 1, true, (i * Math.PI) / 4, Math.PI / 4), place(s.x, 2.7, s.z - 0.2), i % 2 ? colour : 0xf3ecdc);
  } else {
    // a timber frame under a sheet of tarpaulin
    for (const [dx, dz] of [[-1.6, -1.1], [1.6, -1.1], [-1.6, 1.1], [1.6, 1.1]]) solid.round(new THREE.CylinderGeometry(0.05, 0.06, dz < 0 ? 2.6 : 2.2, 6), place(s.x + dx, dz < 0 ? 1.3 : 1.1, s.z + dz), 0x6a5038);
    solid.box(3.8, 0.04, 2.8, place(s.x, 2.43, s.z, 0, 1, 1, 1, 0.18, 0), colour);
    solid.box(3.8, 0.05, 0.06, place(s.x, 2.22, s.z + 1.38), 0x6a5038);
  }
  // the table
  solid.box(3.0, 0.07, 1.6, place(s.x, 0.8, s.z), 0x9a7a52);
  for (const [dx, dz] of [[-1.4, -0.7], [1.4, -0.7], [-1.4, 0.7], [1.4, 0.7]]) solid.box(0.08, 0.78, 0.08, place(s.x + dx, 0.39, s.z + dz), 0x6a5038);
  const kind = goodsKind != null ? goodsKind : index % 4;
  if (kind === 0) {
    // yam: long brown tubers, heaped
    for (let i = 0; i < 12; i += 1) solid.round(new THREE.SphereGeometry(0.11, 7, 5), place(s.x - 1.0 + (i % 6) * 0.38, 0.93 + Math.floor(i / 6) * 0.14, s.z - 0.2 + (i % 2) * 0.3, noise(i, index) * 3, 1, 1, 3.0), i % 3 ? 0x6b4a2f : 0x7d5a3a);
    for (let i = 0; i < 3; i += 1) solid.round(new THREE.SphereGeometry(0.34, 9, 7), place(s.x + 1.05 + (i % 2) * 0.3, 1.05, s.z - 0.5 + i * 0.4, i, 0.8, 0.6, 1.0), 0xd9d2bd);   // sacks of garri
  } else if (kind === 1) {
    // baskets and basins of tomatoes, peppers and oranges
    const fruit = [0xc0392b, 0xe67e22, 0xd9442b, 0x7fb069];
    for (let k = 0; k < 4; k += 1) {
      const bx = s.x - 1.1 + k * 0.72;
      solid.round(lathe([[0.16, 0], [0.27, 0.06], [0.3, 0.2]], 12), place(bx, 0.84, s.z), k % 2 ? 0xa9814f : 0x2e86ab);
      for (let i = 0; i < 9; i += 1) solid.round(new THREE.SphereGeometry(0.07, 7, 5), place(bx + Math.cos(i * 2.4) * 0.14 * (i % 3) * 0.6, 1.04 + (i % 3) * 0.05, s.z + Math.sin(i * 2.4) * 0.14 * (i % 3) * 0.6), fruit[k]);
    }
  } else if (kind === 2) {
    // bolts of cloth on the table, lengths hung behind
    const prints = [0x7b2d5b, 0xf2c200, 0x1f5c4d, 0x2e86ab, 0xc0392b, 0xe67e22, 0x3fa796];
    for (let i = 0; i < 10; i += 1) solid.round(new THREE.CylinderGeometry(0.09, 0.09, 1.1, 8), place(s.x - 1.1 + (i % 5) * 0.52, 0.93 + Math.floor(i / 5) * 0.18, s.z, 0, 1, 1, 1, Math.PI / 2, 0), prints[(i + index) % prints.length]);
    for (let i = 0; i < 6; i += 1) solid.box(0.5, 1.2, 0.03, place(s.x - 1.35 + i * 0.54, 1.75, s.z - 1.05), prints[(i * 2 + index) % prints.length]);
  } else {
    // fish on trays, and plastic basins
    solid.box(1.2, 0.04, 0.8, place(s.x - 0.7, 0.86, s.z), 0xb9bcc0);
    for (let i = 0; i < 8; i += 1) solid.round(new THREE.SphereGeometry(0.1, 7, 5), place(s.x - 1.15 + (i % 4) * 0.3, 0.92, s.z - 0.18 + Math.floor(i / 4) * 0.36, 0.3, 1, 0.4, 2.4), i % 2 ? 0x8a8f96 : 0x6f757c);
    for (const [k, colour2] of [[0, 0xc0392b], [1, 0x2e86ab]]) solid.round(lathe([[0.2, 0], [0.34, 0.05], [0.38, 0.22]], 14), place(s.x + 0.5 + k * 0.8, 0.84, s.z), colour2);
  }
}

// ------------------------------------------------------------------- world --

export function buildWorld(scene) {
  const solid = new Chunked();
  const walls = new Chunked({ uv: 'wall', scale: 3.2 });
  const roofs = new Chunked({ uv: 'plan', scale: 2.0 });
  const roads = new Batch({ uv: 'plan', scale: 5 });
  const leaves = new Chunked();
  const glow = new Chunked();   // window glass and lamp heads: lit from within at night
  const signs = [];
  const B = { solid, walls, roofs, roads, leaves, glow };

  const ground = buildGround();
  weathers(ground.material, { darken: 0.16 });
  scene.add(ground);
  const sight = createSight();
  const grass = buildGrass();
  for (const mesh of grass) { scene.add(mesh); sight.add(mesh, 150); }

  // roads: a laterite shoulder under each tarred road, and markings on the tar
  for (const r of ZONE_ROADS) {
    if (r.id === 'market') continue;          // (the city block's boulevard is drawn by render-city.js)
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    const tar = r.surface === 'asphalt';
    const along = w > d;
    if (tar) roads.box(w + (along ? 0 : 2.4), 0.04, d + (along ? 2.4 : 0), place((r.x0 + r.x1) / 2, 0.02, (r.z0 + r.z1) / 2), ZONE_PROPS.laterite, 0.95);
    roads.box(w, 0.06, d, place((r.x0 + r.x1) / 2, tar ? 0.05 : 0.03, (r.z0 + r.z1) / 2), tar ? 0x56555a : ZONE_PROPS.laterite);
    if (tar) {
      const length = along ? w : d;
      for (let s = 4; s < length - 4; s += 9) {
        const x = along ? r.x0 + s : (r.x0 + r.x1) / 2;
        const z = along ? (r.z0 + r.z1) / 2 : r.z0 + s;
        if (Math.abs(x) < 7 && along) continue;
        solid.box(along ? 3 : 0.16, 0.02, along ? 0.16 : 3, place(x, 0.085, z), 0xd8d2bf);
      }
      for (const side of [-1, 1]) {
        if (along) solid.box(w, 0.02, 0.12, place((r.x0 + r.x1) / 2, 0.084, (r.z0 + r.z1) / 2 + side * (d / 2 - 0.35)), 0xcfc9b6, 0.9);
        else solid.box(0.12, 0.02, d, place((r.x0 + r.x1) / 2 + side * (w / 2 - 0.35), 0.084, (r.z0 + r.z1) / 2), 0xcfc9b6, 0.9);
      }
    }
  }

  for (const b of ZONE_BUILDINGS) if (b.kind !== 'city') addBuilding(B, signs, b);          // (the city block's are render-city.js's)
  // the glass showroom: its own few meshes
  const showrooms = ZONE_BUILDINGS.filter((b) => b.kind === 'showroom').map((b) => { const shop = ZONE_SHOPS.find((sh) => sh.building === b.id); const made = buildShowroom(b, { storeys: shop ? shop.storeys : 3 }); scene.add(made.group); return made; });
  const foliage = new Foliage();
  for (const t of ZONE_TREES) addTree(solid, foliage, t);
  // parked coaches and kekes are the supplied models, each stepping through its levels of detail with distance
  const parkedVehicles = [];
  for (const v of ZONE_VEHICLES) {
    if (v.kind !== 'bus' && v.kind !== 'keke') { addVehicle(solid, glow, v); continue; }
    const model = makeVehicleModel(v.look, { plate: v.plate, region: ZONE.government.state.short.replace(/ State$/, ''), level: 2 });
    model.group.position.set(v.x, 0, v.z);
    model.group.rotation.y = v.heading;
    scene.add(model.group);
    parkedVehicles.push({ model, x: v.x, z: v.z });
  }

  // market stalls: what is sold where follows who trades there
  const tradeAt = (s) => { for (const [key, kind] of [['stall_cloth', 2], ['stall_produce', 0], ['stall_fish', 3]]) { const p = ZONE_PLACES[key]; if (p && Math.hypot(p.x - s.x, p.z - s.z) < 4) return kind; } return null; };
  ZONE_STALLS.forEach((s, index) => addStall(B, s, index, tradeAt(s)));

  // motor park shelter
  const shelter = ZONE_PROPS.shelter;
  for (const [dx, dz] of [[-5.5, -2], [5.5, -2], [-5.5, 2], [5.5, 2], [0, -2], [0, 2]]) solid.round(new THREE.CylinderGeometry(0.09, 0.09, 3, 8), place(shelter.x + dx, 1.5, shelter.z + dz), 0x5a5a5e);
  roofs.box(12.8, 0.07, 5.8, place(shelter.x, 3.08, shelter.z, 0, 1, 1, 1, 0.07, 0), 0x8f989e, 1, 'plan');
  for (const dx of [-3.5, 0.2, 3.9]) { solid.box(2.6, 0.08, 0.5, place(shelter.x + dx, 0.5, shelter.z - 1.2), 0x7a5a3a); for (const k of [-1.1, 1.1]) solid.box(0.1, 0.5, 0.4, place(shelter.x + dx + k, 0.25, shelter.z - 1.2), 0x55585c); }
  signs.push((() => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(7, 0.9), new THREE.MeshBasicMaterial({ map: textTexture(shelter.sign, { width: 1024, height: 128, background: '#171a2e', colour: '#f5c518', size: 84 }), toneMapped: false }));
    mesh.position.set(shelter.x, 3.72, shelter.z + 2.95);
    return mesh;
  })());

  // benches
  for (const bench of ZONE_BENCHES) {
    for (const k of [-0.16, 0, 0.16]) solid.box(1.8, 0.05, 0.13, place(bench.x - Math.sin(bench.facing) * k, 0.48, bench.z - Math.cos(bench.facing) * k, bench.facing), 0x7a5a3a);
    for (const k of [0.62, 0.8]) solid.box(1.8, 0.13, 0.05, place(bench.x - Math.sin(bench.facing) * 0.27, k, bench.z - Math.cos(bench.facing) * 0.27, bench.facing), 0x7a5a3a);
    for (const side of [-0.75, 0.75]) solid.box(0.08, 0.86, 0.5, place(bench.x + Math.cos(bench.facing) * side, 0.43, bench.z - Math.sin(bench.facing) * side, bench.facing), 0x44474b);
  }

  // street lamps
  const lampHeads = [];
  const inCity = (x, z) => x > CITY_AREA.x0 && x < CITY_AREA.x1 && z > CITY_AREA.z0 && z < CITY_AREA.z1;
  for (const lamp of ZONE_LAMPS) {
    // (the city block's streetlights are its own; their heads are where these lamps are)
    if (inCity(lamp.x, lamp.z)) { lampHeads.push({ x: lamp.x, z: lamp.z }); continue; }
    const reach = lamp.x < 0 ? 1 : -1;
    solid.round(new THREE.CylinderGeometry(0.06, 0.1, 5.4, 8), place(lamp.x, 2.7, lamp.z), 0x4a4d52);
    solid.box(0.24, 0.3, 0.24, place(lamp.x, 0.15, lamp.z), 0x8d877b);
    solid.round(new THREE.CylinderGeometry(0.035, 0.035, 1.0, 6), place(lamp.x + reach * 0.45, 5.3, lamp.z, 0, 1, 1, 1, 0, Math.PI / 2 - reach * 0.15), 0x4a4d52);
    solid.box(0.6, 0.1, 0.3, place(lamp.x + reach * 0.85, 5.33, lamp.z), 0x3a3d42);
    glow.box(0.5, 0.05, 0.24, place(lamp.x + reach * 0.85, 5.27, lamp.z), 0xfff1c9);
    lampHeads.push({ x: lamp.x + reach * 0.85, z: lamp.z });
  }

  // power lines down the two main roads
  const wires = [];
  const line = (points) => {
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      const sag = (t) => 0.9 * 4 * t * (1 - t);
      for (const offset of [-0.7, 0, 0.7]) {
        const ox = (-dz / len) * offset, oz = (dx / len) * offset;
        for (let k = 0; k < 6; k += 1) {
          const t0 = k / 6, t1 = (k + 1) / 6;
          wires.push(a.x + dx * t0 + ox, 7.55 - sag(t0), a.z + dz * t0 + oz, a.x + dx * t1 + ox, 7.55 - sag(t1), a.z + dz * t1 + oz);
        }
      }
    }
    const across = points.length > 1 && Math.abs(points[1].x - points[0].x) > Math.abs(points[1].z - points[0].z);
    for (const p of points) {
      solid.round(new THREE.CylinderGeometry(0.11, 0.15, 8, 8), place(p.x, 4, p.z), 0x8d877b);
      solid.box(across ? 0.1 : 1.8, 0.1, across ? 1.8 : 0.1, place(p.x, 7.5, p.z), 0x6a5038);
      for (const offset of [-0.7, 0, 0.7]) solid.round(new THREE.CylinderGeometry(0.035, 0.05, 0.14, 6), place(p.x + (across ? 0 : offset), 7.6, p.z + (across ? offset : 0)), 0x6d8ea0);
    }
  };
  const zb = ZONE.bounds;
  const poleSpots = (make, from, to, step) => { const out = []; for (let v = from; v <= to; v += step) { const p = make(v); if (zoneWalkable(p.x, p.z, [], 0.3)) out.push(p); } return out; };
  line(poleSpots((x) => ({ x, z: 121.5 }), zb.minX + 14, zb.maxX - 14, 46));
  line(poleSpots((z) => ({ x: 6.3, z }), -165, -35, 50));          // (no further north: the city block has none)

  // jetty: planks on posts
  const jx = (ZONE_JETTY.x0 + ZONE_JETTY.x1) / 2;
  const jw = ZONE_JETTY.x1 - ZONE_JETTY.x0;
  for (let z = ZONE_JETTY.z0; z < ZONE_JETTY.z1 - 0.01; z += 0.5) solid.box(jw, 0.07, 0.44, place(jx, 0.03, z + 0.25), (Math.round(z * 2) % 3) ? 0x8a6f4d : 0x7a6142);
  for (const side of [-1, 1]) solid.box(0.16, 0.14, ZONE_JETTY.z1 - ZONE_JETTY.z0, place(jx + side * (jw / 2 - 0.08), -0.06, (ZONE_JETTY.z0 + ZONE_JETTY.z1) / 2), 0x5d4a35);
  for (let z = ZONE_JETTY.z0 + 6; z < ZONE_JETTY.z1 + 1; z += 6) for (const x of [ZONE_JETTY.x0 + 0.2, ZONE_JETTY.x1 - 0.2]) solid.round(new THREE.CylinderGeometry(0.17, 0.17, 4.2, 8), place(x, -1.3, z), 0x5d4a35);

  // block yard: moulds, sand heaps, a water drum
  for (const m of ZONE_MOULD_STATIONS) {
    solid.box(1.3, 0.72, 1.0, place(m.x, 0.36, m.z), 0x6d6a63);
    solid.box(1.36, 0.05, 1.06, place(m.x, 0.745, m.z), 0x56534d);
    solid.box(0.48, 0.24, 0.26, place(m.x - 0.25, 0.89, m.z), 0x3f4347);
    solid.box(0.44, 0.21, 0.22, place(m.x + 0.35, 0.875, m.z + 0.1), 0x9a9a94);
  }
  for (const [hx, hz, radius, height] of ZONE_PROPS.sandHeaps) solid.round(new THREE.ConeGeometry(radius, height, 16), place(hx, height / 2, hz), 0xd2b98a);
  for (let i = 0; i < 6; i += 1) solid.box(0.7, 0.2, 0.45, place(ZONE_PROPS.yardApron.x + (i % 3) * 0.75, 0.47 + Math.floor(i / 3) * 0.2, ZONE_PROPS.yardApron.z), 0xbfb8a8);

  const tarmac = grainTexture({ low: 0.66, coarse: 0.3, speck: 0.45, seed: 3 });
  const kit = buildingKit();
  const cast = (meshes) => { for (const mesh of meshes) { mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); sight.add(mesh); } };
  cast(solid.build(kit.solid));
  cast(walls.build(kit.walls));
  cast(roofs.build(kit.roofs));
  // (the walls and roofs out in the weather: render-finish.js)
  weathers(kit.walls, { darken: 0.2 });
  weathers(reflects(kit.roofs, 0.5), { darken: 0.14, gloss: 0.3 });
  cast(leaves.build(surface({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide })));      // (the market's umbrellas)
  for (const mesh of foliage.build(foliageMaterials())) { scene.add(mesh); sight.add(mesh); }
  // (tarmac and laterite: in the rain darker, and the tarmac glossy, giving back the sky)
  const roadMesh = roads.build(weathers(surface({ vertexColors: true, map: tarmac, roughness: 0.94, metalness: 0 }), { darken: 0.42, gloss: 0.66, sheen: 1 }));
  roadMesh.receiveShadow = true;
  scene.add(roadMesh);

  // window glass and lamp covers: by day the glass gives back the sky (render-finish.js), at night it is lit from within
  const glowMaterial = reflects(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.3, emissive: linear(0xffc66b), emissiveIntensity: 0 }), 1);
  // the first city block: Market Road's boulevard and its buildings (render-city.js)
  const city = buildCity(scene, { glowMaterial, lite: isLite(), addTree });
  for (const mesh of glow.build(glowMaterial)) { scene.add(mesh); sight.add(mesh); }
  for (const sign of signs) { scene.add(sign); sight.add(sign, 190, { x: sign.position.x, z: sign.position.z, radius: 4 }); }
  const wireGeometry = new THREE.BufferGeometry();
  wireGeometry.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
  scene.add(new THREE.LineSegments(wireGeometry, new THREE.LineBasicMaterial({ color: 0x1a1a1c })));

  // The river, and the far bank across it.
  const nearEdge = 120;                                  // inside the bank everywhere along the town
  const farEdge = 150 + ZONE_PROPS.water.width;
  const ripples = rippleNormalTexture();
  ripples.repeat.set(60, 9);
  // (the river gives back the sky, broken by its ripples: render-finish.js)
  const waterMaterial = reflects(new THREE.MeshStandardMaterial({ color: linear(ZONE_PROPS.water.day), normalMap: ripples, normalScale: new THREE.Vector2(0.4, 0.4), roughness: 0.22, metalness: 0.35, transparent: true, opacity: 0.93 }), 0.5);
  // (where it runs through the habitation it is waded along its banks: there, as deep as one can wade, it is never more
  // than half solid, so that a walker's legs are seen in it, faintly; its bed as the habitation's ground has it,
  // zones/habitation.js `shaped`: 22 October 2026)
  waterMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRiverAt;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRiverAt = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vRiverAt;').replace('#include <color_fragment>', `#include <color_fragment>
      if (vRiverAt.x > ${HABITATION_EDGE.toFixed(1)}) {
        float shore = 150.0 + 5.0 * sin(vRiverAt.x / 37.0) + 3.0 * sin(vRiverAt.x / 11.0 + 1.0);
        float depth = min(3.2, 0.04 + max(0.0, min(vRiverAt.z - shore, ${RIVER_FAR.toFixed(1)} - vRiverAt.z)) * 0.16);
        diffuseColor.a = min(diffuseColor.a, mix(0.5, 1.0, smoothstep(0.55, 0.9, depth)));
      }`);
  };
  waterMaterial.customProgramCacheKey = () => 'pcw-river-shallows';
  // (from far beyond the town's south end up to where it opens into the habitation's lagoon)
  const riverFrom = -750, riverTo = RIVER_HEAD;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(riverTo - riverFrom, farEdge - nearEdge + 8, 1, 1), waterMaterial);
  water.rotation.x = -Math.PI / 2;
  water.position.set((riverFrom + riverTo) / 2, -0.32, (nearEdge + farEdge + 8) / 2);
  water.receiveShadow = true;
  scene.add(water);

  const far = new Batch();
  // (the far bank up to the habitation's, which is its own)
  const bankFrom = -750, bankTo = HABITATION_EDGE;
  far.box(bankTo - bankFrom, 3, 12, place((bankFrom + bankTo) / 2, -1.3, farEdge + 4), 0xd9c79a);                 // sand at the water's edge
  far.box(bankTo - bankFrom, 4, 640, place((bankFrom + bankTo) / 2, -1.0, farEdge + 328), 0x5d8a44);              // bush behind it
  for (let i = 0; i < 110; i += 1) {
    const x = zb.minX - 300 + noise(i, 3) * (zb.maxX - zb.minX + 600);
    if (x > HABITATION_EDGE - 10) continue;
    const z = farEdge + 14 + noise(i, 7) * 90;
    const size = 1.1 + noise(i, 11) * 0.9;
    far.round(new THREE.CylinderGeometry(0.3 * size, 0.42 * size, 4 * size, 6), place(x, 1 + 2 * size, z), 0x5a4a38);
    far.round(new THREE.IcosahedronGeometry(3.2 * size, 1), place(x, 1 + 4.8 * size, z, noise(i, 5) * 6, 1, 0.8, 1), i % 3 ? 0x35703a : 0x2c6233);
    if (i % 2) far.round(new THREE.IcosahedronGeometry(2.4 * size, 1), place(x + 2.2 * size, 1 + 4.2 * size, z + size, 0, 1, 0.8, 1), 0x3a7a3e);
  }
  scene.add(far.build(surface({ vertexColors: true, roughness: 1, metalness: 0 })));

  // the river moves: its ripples drift downstream
  let breeze = 0;
  const tick = (dt, now = null) => { ripples.offset.x += dt * 0.012; ripples.offset.y += dt * 0.004; breeze += dt; setWind(breeze); city.tick(dt, now); };

  // a weak device gets thinner grass, then none
  let quality = 0;
  const setQuality = (level) => { quality = level; for (const mesh of grass) { mesh.count = level >= 1 ? Math.floor(mesh.userData.full / 2) : mesh.userData.full; mesh.visible = level < 3; } };

  // which parked vehicles to draw, and how finely, for an eye at (x, z)
  const VEHICLE_BIAS = [1, 0.8, 0.6, 0.45];
  function seeVehicles(x, z, reach) {
    for (const v of parkedVehicles) {
      const d = Math.hypot(v.x - x, v.z - z);
      v.model.group.visible = d < reach + 14;
      if (v.model.group.visible) v.model.setDistance(d, undefined, VEHICLE_BIAS[quality]);
    }
  }
  return { glowMaterial, waterMaterial, roadMaterial: roadMesh.material, lampHeads, signs, showrooms, city, tick, setQuality, parkedVehicles, seeVehicles, see: (x, z, reach) => { sight.look(x, z, reach); if (quality >= 3) for (const mesh of grass) mesh.visible = false; } };
}
