// The smaller parked vehicles, modelled from primitives: a van, a pickup, an
// okada, a canoe. Each is painted into a batch at the vehicle's position.
// A vehicle faces +z in its own frame.
//
// Kekes and coaches are not drawn here. They come from the supplied models:
// see vehicle-models.js.

import { place } from './render-kit.js';

const TYRE = 0x18181a;
const HUB = 0xa9adb2;
const GLASS = 0x86a9bd;
const BLACK = 0x1b1b1e;
const CHROME = 0xc9ccd0;

function hullGeometry(length, beam, depth, inside) {
  const stations = 14;
  const positions = [];
  const section = (i) => {
    const t = (i / stations) * 2 - 1;                       // -1 stern .. 1 bow
    const z = (t * length) / 2;
    const half = beam * Math.pow(Math.max(0, 1 - t * t), 0.75) + 0.02;
    const sheer = 0.26 * t * t;                              // the ends sweep up
    return { z, half, top: sheer, keel: sheer * 0.85 - depth * (0.35 + 0.65 * Math.sqrt(Math.max(0, 1 - t * t))) };
  };
  for (let i = 0; i < stations; i += 1) {
    const a = section(i);
    const b = section(i + 1);
    for (const side of [-1, 1]) {
      const quad = [[side * a.half, a.top, a.z], [0, a.keel, a.z], [0, b.keel, b.z], [side * b.half, b.top, b.z]];
      const flip = (side === 1) !== inside;
      const order = flip ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
      for (const k of order) positions.push(...quad[k]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function addVehicle(solid, glow, v) {
  const at = (x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => new THREE.Matrix4().multiplyMatrices(place(v.x, 0, v.z, v.heading), place(x, y, z, ry, sx, sy, sz, rx, rz));
  const box = (w, h, d, x, y, z, colour, rx = 0, rz = 0) => solid.box(w, h, d, at(x, y, z, 0, 1, 1, 1, rx, rz), colour);
  const wheel = (x, z, r, wide = 0.2) => {
    const tyre = new THREE.TorusGeometry(r - wide * 0.42, wide * 0.42, 8, 18);
    solid.round(tyre, at(x, r, z, Math.PI / 2, 1, 1, wide / (wide * 0.84)), TYRE);
    const hub = new THREE.CylinderGeometry(r * 0.56, r * 0.56, wide * 0.9, 14);
    solid.round(hub, at(x, r, z, 0, 1, 1, 1, 0, Math.PI / 2), HUB);
    solid.round(new THREE.CylinderGeometry(r * 0.2, r * 0.2, wide, 8), at(x, r, z, 0, 1, 1, 1, 0, Math.PI / 2), 0x55585c);
  };
  const post = (x0, y0, z0, x1, y1, z1, r, colour) => {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const length = Math.hypot(dx, dy, dz);
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), new THREE.Vector3(dx, dy, dz), new THREE.Vector3(0, 1, 0.001));
    const g = new THREE.CylinderGeometry(r, r, length, 8);
    g.rotateX(Math.PI / 2);
    g.applyMatrix4(m);
    solid.round(g, at((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), colour);
  };

  if (v.kind === 'van') {
    const body = v.body || 0xf5c518;
    const band = v.band || 0x16161a;
    for (const [x, z] of [[-0.98, 1.72], [0.98, 1.72], [-0.98, -1.62], [0.98, -1.62]]) wheel(x, z, 0.38, 0.26);
    box(2.1, 0.86, 5.36, 0, 0.86, 0, body);                                                    // lower body
    box(2.12, 0.15, 5.38, 0, 1.2, 0, band);
    box(2.0, 0.84, 4.5, 0, 1.69, -0.42, body);                                                 // cabin
    box(2.02, 0.07, 4.56, 0, 2.13, -0.42, 0xdedbd2);
    // windscreen and pillars
    box(1.86, 0.98, 0.05, 0, 1.68, 2.2, GLASS, -0.62);
    for (const side of [-1, 1]) box(0.09, 1.0, 0.09, side * 0.97, 1.68, 2.2, body, -0.62);
    box(2.02, 0.08, 0.12, 0, 2.1, 1.86, body);
    // side windows, with pillars between
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i += 1) box(0.04, 0.5, 0.92, side * 1.005, 1.74, 1.22 - i * 1.06, 0x33485a);
      box(0.05, 0.03, 0.9, side * 1.06, 1.05, 0.2, 0x8a8d92);                                  // door rail
      box(0.02, 0.8, 0.03, side * 1.056, 0.9, 0.7, 0x8a8d92);
      box(0.1, 0.14, 0.2, side * 1.12, 1.42, 2.1, BLACK);                                      // mirror
      for (const z of [1.72, -1.62]) solid.round(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 18, 1, false, 0, Math.PI), at(side * 1.04, 0.42, z, 0, 1, 1, 1, 0, Math.PI / 2), 0x25262a);
    }
    box(1.7, 0.5, 0.04, 0, 1.74, -2.685, 0x33485a);                                            // rear window
    // face: grille, lamps, bumpers, plates
    box(1.1, 0.22, 0.04, 0, 0.98, 2.69, 0x25262a);
    for (const side of [-1, 1]) { box(0.36, 0.2, 0.05, side * 0.76, 0.98, 2.69, 0xfff2c4); box(0.16, 0.28, 0.05, side * 0.9, 1.0, -2.69, 0xb3261e); }
    box(2.16, 0.2, 0.16, 0, 0.5, 2.68, 0x2a2b2f);
    box(2.16, 0.2, 0.16, 0, 0.5, -2.68, 0x2a2b2f);
    box(0.5, 0.14, 0.02, 0, 0.72, 2.7, 0xf3ecdc);
    // roof rack and the load tied on it
    for (const side of [-1, 1]) post(side * 0.86, 2.3, -2.3, side * 0.86, 2.3, 1.2, 0.025, 0x55585c);
    for (const z of [-2.3, -1.1, 0.1, 1.2]) { post(-0.86, 2.3, z, 0.86, 2.3, z, 0.02, 0x55585c); for (const side of [-1, 1]) post(side * 0.86, 2.16, z, side * 0.86, 2.3, z, 0.02, 0x55585c); }
    solid.round(new THREE.SphereGeometry(0.5, 10, 8), at(-0.3, 2.5, -1.6, 0.3, 1.0, 0.5, 1.3), 0xc9b183);
    solid.round(new THREE.SphereGeometry(0.5, 10, 8), at(0.35, 2.48, -1.3, -0.4, 0.9, 0.46, 1.1), 0xd8d2c2);
    box(0.9, 0.42, 0.7, -0.2, 2.53, -0.3, 0x2e86ab);
    box(0.7, 0.34, 0.6, 0.38, 2.49, 0.5, 0x8e5a2b);
  } else if (v.kind === 'pickup') {
    const body = v.body || 0xe9e6dc;
    for (const [x, z] of [[-0.86, 1.48], [0.86, 1.48], [-0.86, -1.42], [0.86, -1.42]]) wheel(x, z, 0.36, 0.24);
    box(1.86, 0.5, 4.86, 0, 0.82, 0, body);
    box(1.8, 0.2, 1.3, 0, 1.12, 1.72, body);                                                   // bonnet
    box(1.76, 0.74, 1.5, 0, 1.44, 0.4, body);                                                  // cab
    box(1.6, 0.62, 0.05, 0, 1.46, 1.19, GLASS, -0.34);
    box(1.6, 0.5, 0.04, 0, 1.5, -0.37, GLASS);
    for (const side of [-1, 1]) { box(0.04, 0.46, 1.1, side * 0.885, 1.5, 0.42, 0x33485a); box(0.1, 0.52, 2.2, side * 0.88, 1.18, -1.3, body); box(0.08, 0.12, 0.18, side * 1.0, 1.36, 1.14, BLACK); }
    box(1.86, 0.52, 0.1, 0, 1.18, -2.38, body);
    box(1.66, 0.05, 2.1, 0, 1.0, -1.3, 0x77756e);                                              // bed floor
    box(1.2, 0.18, 0.05, 0, 0.9, 2.44, 0x25262a);
    for (const side of [-1, 1]) { box(0.3, 0.16, 0.05, side * 0.72, 0.94, 2.44, 0xfff2c4); box(0.16, 0.2, 0.05, side * 0.8, 0.96, -2.44, 0xb3261e); }
    box(1.92, 0.18, 0.14, 0, 0.5, 2.44, 0x2a2b2f);
    box(1.92, 0.18, 0.14, 0, 0.5, -2.44, 0x2a2b2f);
    // a load of cement bags
    for (let i = 0; i < 6; i += 1) solid.round(new THREE.SphereGeometry(0.3, 8, 6), at(-0.45 + (i % 3) * 0.45, 1.14 + Math.floor(i / 3) * 0.2, -1.0 - (i % 2) * 0.55, 0, 1, 0.38, 1.3), 0xc9c2b2);
  } else if (v.kind === 'okada') {
    wheel(0, 0.66, 0.3, 0.1);
    wheel(0, -0.66, 0.3, 0.1);
    box(0.22, 0.3, 1.2, 0, 0.62, 0, 0xb3261e);
    box(0.3, 0.12, 0.7, 0, 0.84, -0.2, BLACK);
    post(-0.3, 1.02, 0.55, 0.3, 1.02, 0.55, 0.02, 0x5a5a5e);
    post(0, 0.3, 0.66, 0, 1.02, 0.55, 0.025, 0x5a5a5e);
  } else {
    // a dug-out river canoe: pointed at both ends, with thwarts, a paddle and a net
    const wood = 0x6a4b2f;
    solid.add(hullGeometry(5.0, 0.5, 0.36, false), at(0, 0.02, 0), wood);
    solid.add(hullGeometry(4.9, 0.46, 0.33, true), at(0, 0.02, 0), 0x4f371f);
    box(0.84, 0.04, 0.2, 0, 0.0, 0.7, 0x8a6a45);
    box(0.8, 0.04, 0.2, 0, 0.0, -0.9, 0x8a6a45);
    post(-0.2, 0.02, -0.6, 0.25, 0.16, 1.1, 0.022, 0x9a7a52);
    solid.round(new THREE.SphereGeometry(0.16, 8, 6), at(0.27, 0.17, 1.2, 0.3, 0.6, 0.12, 1.6), 0x9a7a52);
    solid.round(new THREE.SphereGeometry(0.3, 8, 6), at(-0.05, -0.08, -0.15, 0, 1, 0.35, 1.3), 0x8f8a6a);
  }
  return glow;
}
