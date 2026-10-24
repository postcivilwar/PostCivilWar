// Beyond the town (src/sim/zones/atani-outskirts.js): the ground out to the road works on the Onitsha road, the
// road itself and what stands beside it, Asaba Airport, and the bridge over the Niger. Drawn the way the town is:
// merged into a few meshes by kind of surface, in squares that are drawn only within sight.
//
// The bridge follows the owner's photographs of the Niger's steel through-truss bridges: a deck carried between
// two riveted steel trusses, each bay crossed by an X of lattice members with a post at every panel point, a
// cross girder over the roadway at each post, rails along the footways, and under it all concrete piers of
// two tapering legs on round caissons in the water, joined by a beam under the deck. Nothing on it advertises
// anything, and nothing on it says it is any real bridge.

import { BRIDGE, AIRPORT, OUTSKIRT_ROADS, OUTSKIRT_AREAS, OUTSKIRT_LAMPS, OUTSKIRT_SIGNS, OUTSKIRT_BUILDINGS, ONITSHA_ROAD, zoneGroundY, ZONE, ZONE_PROPS } from '../sim/zone.js';
import { Chunked, createSight, place, linear, noise, smoothNoise, grassTexture, grainTexture, textTexture, surface, buildingKit } from './render-kit.js';
import { addTree } from './render-world.js';
import { Foliage, foliageMaterials } from './render-foliage.js';
import { reflects, weathers } from './render-finish.js';
import { isRoad } from './world-shading.js';

const STEEL = 0x8f9499, STEEL_DARK = 0x5f656b, CONCRETE = 0xb3a48a, CONCRETE_OLD = 0x9c8a6c, TAR = 0x56555a, LINE = 0xe6e2d6, YELLOW = 0xd8b33a;

// The land beyond the town: flat where there is road, airport or bridge, rising into low bush hills away from them.
function buildGround() {
  const x0 = -1330, x1 = -232, z0 = -660, z1 = 150;
  const w = x1 - x0, d = z1 - z0;
  const geometry = new THREE.PlaneGeometry(w, d, 110, 81);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const P = geometry.attributes.position;
  const colours = new Float32Array(P.count * 3);
  const grassA = linear(0x5f9440), grassB = linear(0x8cb655), dry = linear(0xa9a85a), earth = linear(ZONE_PROPS.earth);
  const c = new THREE.Color();
  const away = (x, z) => { let best = Infinity; for (const a of OUTSKIRT_AREAS) { const dx = Math.max(a.x0 - x, 0, x - a.x1), dz = Math.max(a.z0 - z, 0, z - a.z1); best = Math.min(best, Math.hypot(dx, dz)); } return best; };
  for (let i = 0; i < P.count; i += 1) {
    const x = P.getX(i), z = P.getZ(i);
    const patch = smoothNoise(x / 34, z / 34) * 0.65 + smoothNoise(x / 9, z / 9) * 0.35;
    c.copy(grassA).lerp(grassB, patch).lerp(dry, Math.max(0, smoothNoise(x / 55 + 9, z / 55) - 0.5) * 1.3);
    const far = away(x, z);
    // the road's verges are trodden red earth
    if (z > -62 && z < -18) c.lerp(earth, 0.55 * Math.max(0, 1 - Math.abs(z + 40) / 22));
    // hills only well away from where anyone goes, and none near the town's own edge or the river
    const rise = Math.max(0, Math.min(1, (far - 40) / 160)) * Math.max(0, Math.min(1, (-232 - x) / 60)) * Math.max(0, Math.min(1, (120 - z) / 60));
    P.setY(i, rise * (2 + smoothNoise(x / 90, z / 90) * 9));
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

// A flat road: a laterite shoulder, the tar, a dashed line down the middle and the edges painted.
function addRoad(B, r) {
  const w = r.x1 - r.x0, d = r.z1 - r.z0, along = w > d;
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  B.roads.box(w + (along ? 0 : 2.6), 0.04, d + (along ? 2.6 : 0), place(cx, 0.02, cz), ZONE_PROPS.laterite, 0.95);
  B.roads.box(w, 0.06, d, place(cx, 0.05, cz), TAR);
  if (r.bays) {
    // a car park: rows of bays in white
    for (let x = r.x0 + 3; x < r.x1 - 2; x += 2.6) for (const zz of [r.z0 + 3, r.z0 + 30, r.z0 + 52, r.z1 - 6]) B.paint.box(0.12, 0.02, 5, place(x, 0.085, zz), LINE);
    return;
  }
  const length = along ? w : d;
  for (let s = 4; s < length - 4; s += 9) B.paint.box(along ? 3 : 0.16, 0.02, along ? 0.16 : 3, place(along ? r.x0 + s : cx, 0.085, along ? cz : r.z0 + s), LINE);
  if (r.edgeLines) for (const side of [-1, 1]) {
    if (along) B.paint.box(w, 0.02, 0.14, place(cx, 0.084, cz + side * (d / 2 - 0.5)), LINE, 0.9);
    else B.paint.box(0.14, 0.02, d, place(cx + side * (w / 2 - 0.5), 0.084, cz), LINE, 0.9);
  }
}

// A lamp post with its head over the road; `y` is the ground it stands on.
function addLamp(B, lamp, heads) {
  const y = zoneGroundY(lamp.x, lamp.z);
  // the head reaches out over the roadway: across the deck on the bridge, towards the road's middle beside it
  const ax = lamp.deck ? (lamp.x < (BRIDGE.x0 + BRIDGE.x1) / 2 ? 1 : -1) : 0;
  const az = lamp.deck ? 0 : Math.abs(lamp.z + 40) < 15 ? (lamp.z < -40 ? 1 : -1) : 1;
  B.solid.round(new THREE.CylinderGeometry(0.07, 0.11, 6.2, 8), place(lamp.x, y + 3.1, lamp.z), 0x4a4d52);
  B.solid.box(0.26, 0.3, 0.26, place(lamp.x, y + 0.15, lamp.z), 0x8d877b);
  B.solid.box(0.1 + Math.abs(ax) * 1.2, 0.08, 0.1 + Math.abs(az) * 1.2, place(lamp.x + ax * 0.6, y + 6.15, lamp.z + az * 0.6), 0x4a4d52);
  B.solid.box(0.62, 0.1, 0.32, place(lamp.x + ax * 1.15, y + 6.12, lamp.z + az * 1.15, ax ? 0 : Math.PI / 2), 0x3a3d42);
  B.glow.box(0.52, 0.05, 0.26, place(lamp.x + ax * 1.15, y + 6.06, lamp.z + az * 1.15, ax ? 0 : Math.PI / 2), 0xfff1c9);
  heads.push({ x: lamp.x + ax * 1.15, z: lamp.z + az * 1.15 });
}

// A sign on two posts; its face is drawn on a plane facing `facing`.
function addSign(B, s, signs) {
  // (a sign given its own height, `high`, hangs at that height above the town's ground: on a canopy or a girder)
  const ground = s.high !== undefined ? 0 : s.ground !== undefined ? s.ground : zoneGroundY(s.x, s.z);
  const high = s.gantry ? s.gantry.clear + s.height / 2 : s.high !== undefined ? s.high : 2.4 + s.height / 2;
  const fx = Math.sin(s.facing), fz = Math.cos(s.facing), rx = Math.cos(s.facing), rz = -Math.sin(s.facing);
  if (s.gantry) {
    // a gantry over the road: two steel columns on concrete footings outside the road's edges, a box girder across
    // their tops behind the sign, and a gold band of light along the sign's top and bottom edges
    const g = s.gantry, top = g.clear + s.height + 0.9;
    for (const k of [-1, 1]) {
      const px = s.x + rx * k * (g.span / 2), pz = s.z + rz * k * (g.span / 2);
      B.solid.box(1.2, 0.5, 1.2, place(px, ground + 0.25, pz, s.facing), 0x9a958b);
      B.solid.box(0.55, top, 0.55, place(px, ground + top / 2, pz, s.facing), 0x2e3238);
    }
    for (const dy of [top - 0.25, g.clear - 0.25]) B.solid.box(g.span + 0.55, 0.5, 0.6, place(s.x - fx * 0.45, ground + dy, s.z - fz * 0.45, s.facing), 0x2e3238);
    for (let k = -3; k <= 3; k += 1) B.solid.box(0.12, top - g.clear, 0.12, place(s.x + rx * k * (g.span / 7) - fx * 0.45, ground + (top + g.clear) / 2 - 0.25, s.z + rz * k * (g.span / 7) - fz * 0.45), 0x3a3e45);
    for (const dy of [s.height / 2 + 0.16, -s.height / 2 - 0.16]) B.glow.box(s.width + 0.2, 0.08, 0.06, place(s.x + fx * 0.02, ground + high + dy, s.z + fz * 0.02, s.facing), 0xf2c200);
  }
  if (s.high === undefined && !s.gantry) for (const k of [-1, 1]) B.solid.box(0.12, high + s.height / 2, 0.12, place(s.x + rx * k * (s.width / 2 - 0.4) - fx * 0.08, ground + (high + s.height / 2) / 2, s.z + rz * k * (s.width / 2 - 0.4) - fz * 0.08), 0x6b6f74);
  B.solid.box(s.width + 0.2, s.height + 0.2, 0.08, place(s.x - fx * 0.05, ground + high, s.z - fz * 0.05, s.facing), 0x30343a);
  const [colour, background] = s.palette;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(s.width, s.height), new THREE.MeshBasicMaterial({ map: textTexture(s.lines, { width: 1024, height: Math.round(1024 * s.height / s.width / 32) * 32 || 128, background, colour, size: s.lines.length > 1 ? 72 : 96 }), toneMapped: false }));
  mesh.position.set(s.x + fx * 0.01, ground + high, s.z + fz * 0.01);
  mesh.rotation.y = s.facing;
  signs.push(mesh);
}

// ------------------------------------------------------------------------------------------ the bridge --
function addBridge(B, heads) {
  const b = BRIDGE, cx = (b.x0 + b.x1) / 2, W = b.x1 - b.x0;
  const Y = (z) => zoneGroundY(cx, z);
  // the deck, in short lengths that follow the rise and fall of the approaches
  const step = 3;
  for (let z = b.start; z < b.end - 0.01; z += step) {
    const z2 = Math.min(b.end, z + step), zm = (z + z2) / 2, y1 = Y(z), y2 = Y(z2), ym = (y1 + y2) / 2;
    const pitch = -Math.atan2(y2 - y1, z2 - z), len = Math.hypot(z2 - z, y2 - y1) + 0.04;
    // the roadway, and a footway on each side a step up
    B.roads.box(b.roadway.x1 - b.roadway.x0, 0.06, len, place(cx, ym + 0.03, zm, 0, 1, 1, 1, pitch), TAR);
    for (const side of [-1, 1]) B.solid.box((W - (b.roadway.x1 - b.roadway.x0)) / 2, 0.22, len, place(cx + side * ((b.roadway.x1 - b.roadway.x0) / 2 + (W - (b.roadway.x1 - b.roadway.x0)) / 4), ym + 0.1, zm, 0, 1, 1, 1, pitch), CONCRETE);
    // the slab under it all, and its edge beams
    B.solid.box(W, 0.9, len, place(cx, ym - 0.45, zm, 0, 1, 1, 1, pitch), z < 150 ? CONCRETE : STEEL_DARK, 0.9);
    // the white line down the middle
    if (Math.floor(z / step) % 3 === 0) B.paint.box(0.16, 0.02, 2.4, place(cx, ym + 0.075, zm, 0, 1, 1, 1, pitch), LINE);
    // the rails: posts and two rails each side
    for (const side of [-1, 1]) {
      const rx = side < 0 ? b.x0 + 0.3 : b.x1 - 0.3;
      B.solid.box(0.1, 1.1, 0.1, place(rx, y1 + 0.55 + 0.2, z), STEEL);
      for (const h of [0.55, 1.1]) B.solid.box(0.07, 0.07, len, place(rx, ym + h + 0.2, zm, 0, 1, 1, 1, pitch), STEEL);
    }
    // the embankment on land: earth under the deck, held by concrete walls
    if (z < 150) {
      const top = Math.max(ym - 0.9, 0);
      if (top > 0.05) {
        B.solid.box(W - 0.6, top + 0.3, len, place(cx, top / 2 - 0.15, zm), ZONE_PROPS.laterite, 0.85);
        for (const side of [-1, 1]) B.walls.box(0.3, top + 0.4, len, place(side < 0 ? b.x0 + 0.15 : b.x1 - 0.15, top / 2, zm), CONCRETE_OLD);
      }
    }
  }
  // the far bank: the roadway on the land to the barrier, the barrier itself
  const bx0 = -236, bx1 = -174, n = 20, bw = (bx1 - bx0) / n;
  for (const k of [-1, 1]) for (let i = 0; i < n; i += 1) B.solid.box(bw - 0.1, 0.25, 0.12, place(bx0 + (i + 0.5) * bw, b.farBank + 0.6 + (k > 0 ? 0.35 : 0), b.end - 0.3), i % 2 ? 0xf2f0ea : 0xc8342b);
  for (let i = 0; i <= n; i += 1) B.solid.box(0.1, 1.2, 0.1, place(bx0 + i * bw, b.farBank + 0.6, b.end - 0.3), 0x4a4d52);

  // the trusses: over the water, one each side of the deck
  const T = b.truss, H = b.height, top = H + T.rise;
  const bays = Math.round((T.to - T.from) / T.bay);
  for (const side of [-1, 1]) {
    const x = side < 0 ? b.x0 + 0.25 : b.x1 - 0.25;
    // the top chord and the bottom chord, the length of the span
    B.solid.box(0.7, 0.75, T.to - T.from, place(x, top, (T.from + T.to) / 2), STEEL);
    B.solid.box(0.6, 0.9, T.to - T.from, place(x, H - 0.2, (T.from + T.to) / 2), STEEL_DARK);
    for (let i = 0; i <= bays; i += 1) {
      const z = T.from + i * T.bay;
      // the post at each panel point, and the gusset plates where the members meet
      B.solid.box(0.55, T.rise, 0.5, place(x, H + T.rise / 2, z), STEEL);
      B.solid.box(0.75, 1.1, 1.0, place(x, top - 0.2, z), STEEL_DARK);
      B.solid.box(0.75, 1.1, 1.0, place(x, H + 0.25, z), STEEL_DARK);
      if (i === bays) break;
      // the X in the bay: two lattice members crossing, each a pair of flats with lacing between
      const zm = z + T.bay / 2;
      for (const dir of [-1, 1]) {
        const angle = Math.atan2(T.bay * dir, T.rise);
        const len = Math.hypot(T.bay, T.rise) - 0.6;
        for (const o of [-0.16, 0.16]) B.solid.box(0.08, len, 0.42, place(x + o, H + T.rise / 2, zm, 0, 1, 1, 1, angle), STEEL);
        for (let k = 1; k < 6; k += 1) { const t = k / 6 - 0.5; B.solid.box(0.32, 0.08, 0.3, place(x, H + T.rise / 2 + t * T.rise, zm + t * T.bay * dir, 0, 1, 1, 1, angle), STEEL_DARK); }
      }
      B.solid.box(0.9, 0.9, 0.9, place(x, H + T.rise / 2, zm), STEEL_DARK);
    }
  }
  // overhead: a cross girder at each panel point, and the wind bracing between them
  for (let i = 0; i <= bays; i += 1) {
    const z = T.from + i * T.bay;
    B.solid.box(W - 0.2, 0.9, 0.55, place(cx, top - 0.05, z), STEEL);
    if (i < bays) for (const dir of [-1, 1]) B.solid.box(0.18, 0.18, Math.hypot(W - 1, T.bay) - 0.5, place(cx, top + 0.25, z + T.bay / 2, Math.atan2(W - 1, T.bay) * dir), STEEL_DARK);
  }
  // under the deck: cross beams the length of the bridge
  for (let z = b.start + 30; z < b.end - 40; z += 4.8) { const y = Y(z); if (y < 2) continue; B.solid.box(W - 0.4, 0.5, 0.35, place(cx, y - 1.1, z), STEEL_DARK); }

  // the piers: two tapering legs on round caissons in the river, a beam under the deck and a tie lower down
  for (const z of b.piers) {
    const deckBottom = Y(z) - 1.35, bed = -3.2;
    for (const side of [-1, 1]) {
      const x = cx + side * (W / 2 - 2.4);
      B.solid.round(new THREE.CylinderGeometry(2.3, 2.5, 4.2, 20), place(x, bed + 2.1 + 0.4, z), CONCRETE_OLD);
      const legBottom = bed + 4.6, legH = deckBottom - legBottom;
      B.solid.round(new THREE.CylinderGeometry(0.75 * Math.SQRT2, 1.55 * Math.SQRT2, legH, 4), place(x, legBottom + legH / 2, z, Math.PI / 4, 1, 1, 0.75), CONCRETE);
    }
    B.solid.box(W - 0.4, 1.2, 2.0, place(cx, deckBottom - 0.4, z), CONCRETE);
    B.solid.box(W - 5.4, 0.8, 1.2, place(cx, deckBottom - 3.4, z), CONCRETE_OLD);
  }
  // where the deck meets the land on each bank: an abutment
  B.solid.box(W + 1, 1.6, 2, place(cx, BRIDGE.farBank - 0.6, BRIDGE.land + 1), CONCRETE_OLD);
  for (const lamp of OUTSKIRT_LAMPS.filter((l) => l.deck)) addLamp(B, lamp, heads);
}

// ----------------------------------------------------------------------------------------- the airport --
function addAirport(B, glass, signs, heads) {
  const A = AIRPORT;
  const slab = (r, colour, y = 0.06) => B.roads.box(r.x1 - r.x0, 0.08, r.z1 - r.z0, place((r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2), colour);
  // the runway: concrete, a white line down the middle, the threshold bars at each end, edge lights all along
  const R = A.runway, rz = (R.z0 + R.z1) / 2;
  slab(R, 0x6b6b6e, 0.05);
  for (let x = R.x0 + 60; x < R.x1 - 60; x += 30) B.paint.box(15, 0.02, 0.45, place(x + 7.5, 0.1, rz), LINE);
  for (const [end, dir] of [[R.x0, 1], [R.x1, -1]]) {
    for (let k = -7; k <= 7; k += 1) if (k) B.paint.box(30, 0.02, 1.4, place(end + dir * 22, 0.1, rz + k * 2.4), LINE);
    // the touchdown zone: pairs of bars further in
    for (const at of [150, 210]) for (const s of [-1, 1]) B.paint.box(22, 0.02, 3, place(end + dir * at, 0.1, rz + s * 7), LINE);
  }
  for (let x = R.x0; x <= R.x1; x += 30) for (const z of [R.z0 + 0.6, R.z1 - 0.6]) { B.solid.box(0.25, 0.3, 0.25, place(x, 0.2, z), 0x3a3d42); B.glow.box(0.2, 0.08, 0.2, place(x, 0.38, z), 0xfff4d8); }
  // the runway's numbers, painted on it at each end
  for (const [text, x, turn] of [[R.designators[0], R.x0 + 70, -Math.PI / 2], [R.designators[1], R.x1 - 70, Math.PI / 2]]) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(14, 22), new THREE.MeshBasicMaterial({ map: textTexture([text], { width: 256, height: 384, background: '#6b6b6e', colour: '#efeee9', size: 260 }), transparent: false }));
    mesh.rotation.set(-Math.PI / 2, 0, turn); mesh.position.set(x, 0.11, rz); signs.push(mesh);
  }
  // the taxiway and its links: darker, with a yellow line down the middle and blue edge lights
  for (const t of [A.taxiway, ...A.links]) {
    slab(t, 0x59595c, 0.055);
    const along = t.x1 - t.x0 > t.z1 - t.z0;
    B.paint.box(along ? t.x1 - t.x0 : 0.3, 0.02, along ? 0.3 : t.z1 - t.z0, place((t.x0 + t.x1) / 2, 0.105, (t.z0 + t.z1) / 2), YELLOW);
    if (along) for (let x = t.x0; x <= t.x1; x += 40) for (const z of [t.z0 + 0.4, t.z1 - 0.4]) B.glow.box(0.18, 0.2, 0.18, place(x, 0.2, z), 0x6fa8ff);
  }
  // the apron, and where aircraft will stand when there are any: a yellow line in to each stand, its number
  slab(A.apron, 0x8d8b86, 0.06);
  A.stands.forEach((s, i) => {
    B.paint.box(0.3, 0.02, 60, place(s.x, 0.11, s.z - 10), YELLOW);
    B.paint.box(8, 0.02, 0.3, place(s.x, 0.11, s.z + 17), YELLOW);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ map: textTexture([String(i + 1)], { width: 128, height: 128, background: '#8d8b86', colour: '#d8b33a', size: 100 }) }));
    mesh.rotation.set(-Math.PI / 2, 0, Math.PI); mesh.position.set(s.x + 4, 0.115, s.z + 20); signs.push(mesh);
  });

  // the terminal: glass to the front and the back, a long roof on steel columns over a canopy out over the kerb
  const T = A.terminal, tw = T.x1 - T.x0, td = T.z1 - T.z0, tx = (T.x0 + T.x1) / 2, tzm = (T.z0 + T.z1) / 2;
  B.roads.box(tw, 0.18, td, place(tx, 0.09, tzm), 0xcfc9bd);                                           // the hall floor
  B.roads.box(tw + 6, 0.2, 12, place(tx, 0.1, T.z1 + 5.5), 0xb9b2a4);                                  // the pavement under the canopy
  for (const x of [T.x0, T.x1]) B.walls.box(0.5, T.height, td, place(x, T.height / 2, tzm), 0xe8e4da);  // the end walls
  // the glass: the airside face whole, the landside face open where the doors are
  const glassRun = (zLine, from, to) => { if (to - from < 0.5) return; glass.box(to - from, T.height - 1.2, 0.06, place((from + to) / 2, (T.height - 1.2) / 2 + 0.2, zLine), 0x9fd3e6); };
  glassRun(T.z0 + 0.2, T.x0 + 0.3, T.x1 - 0.3);
  let from = T.x0 + 0.3;
  for (const d of [...T.doors].sort((a, b) => a - b)) { glassRun(T.z1 - 0.2, from, d - 4); glass.box(8, T.height - 5.4, 0.06, place(d, T.height - 2.7 + 0.2 - 0.6, T.z1 - 0.2), 0x9fd3e6); from = d + 4; }
  glassRun(T.z1 - 0.2, from, T.x1 - 0.3);
  // the frame of the glass: mullions every three metres, two transoms
  for (const zLine of [T.z0 + 0.2, T.z1 - 0.2]) {
    for (let x = T.x0 + 3; x < T.x1; x += 3) { const door = zLine > tzm && T.doors.some((d) => Math.abs(x - d) < 4); B.solid.box(0.14, door ? 4.6 : T.height - 1, 0.16, place(x, door ? T.height - 2.6 : (T.height - 1) / 2 + 0.2, zLine), 0x2b3138); }
    for (const h of [4.8, 9]) B.solid.box(tw, 0.16, 0.18, place(tx, h, zLine), 0x2b3138);
  }
  // the roof: a deep slab with a fascia, out over the canopy and a little over the apron
  B.roofs.box(tw + 8, 0.9, td + T.canopy + 4, place(tx, T.height + 0.45, tzm + T.canopy / 2), 0xdcdad3);
  B.solid.box(tw + 8.2, 1.4, 0.4, place(tx, T.height + 0.2, T.z1 + T.canopy + 0.2), 0x2b3138);
  B.solid.box(tw + 8.2, 1.4, 0.4, place(tx, T.height + 0.2, T.z0 - 2.2), 0x2b3138);
  for (let x = T.x0 + 2; x <= T.x1 - 2; x += 20) B.solid.round(new THREE.CylinderGeometry(0.35, 0.35, T.height, 12), place(x, T.height / 2, T.z1 + T.canopy - 0.8), 0xc9ccd0);
  // inside: the check-in desks, the departures board, rows of seats
  for (const x of T.desks) {
    B.solid.box(16, 1.1, 1.2, place(x, 0.55, -234.6), 0x3d4a5c);
    B.solid.box(16, 0.06, 1.4, place(x, 1.13, -234.6), 0xe9e6df);
    B.solid.box(16, 2.4, 0.2, place(x, 2.0, -236.6), 0x1f2b3a);
    for (let k = -6; k <= 6; k += 3) B.solid.box(0.9, 0.45, 0.6, place(x + k, 0.25, -233.2), 0x55595e);      // the bag belts
  }
  for (let x = -915; x < -785; x += 10) for (const z of [-221, -224]) { B.solid.box(6, 0.45, 0.6, place(x, 0.45, z), 0x24364f); B.solid.box(6, 0.5, 0.1, place(x, 0.8, z - 0.3), 0x24364f); }
  B.glow.box(10, 2.4, 0.15, place(-850, 7, -246), 0x2a5d9e);
  // the signs over the doors, inside and out
  const over = [['DEPARTURES', T.doors[0]], ['CHECK-IN', T.doors[1]], ['ARRIVALS', T.doors[2]]];
  for (const [text, x] of over) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.1), new THREE.MeshBasicMaterial({ map: textTexture([text], { width: 640, height: 100, background: '#0e2a4a', colour: '#ffffff', size: 64 }), toneMapped: false }));
    mesh.position.set(x, 5.4, T.z1 + 0.05); signs.push(mesh);
  }
  for (const [text, x] of [['CHECK-IN 1–8', T.desks[0]], ['CHECK-IN 9–16', T.desks[1]]]) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.1), new THREE.MeshBasicMaterial({ map: textTexture([text], { width: 640, height: 90, background: '#1f2b3a', colour: '#f2c94c', size: 56 }), toneMapped: false }));
    mesh.position.set(x, 2.6, -236.45); signs.push(mesh);
  }
  // the control tower: a concrete shaft, a glass cab, its roof
  const tw2 = A.tower;
  B.walls.round(new THREE.CylinderGeometry(2.2, 2.8, tw2.height, 16), place(tw2.x, tw2.height / 2, tw2.z), 0xd8d2c4);
  B.solid.round(new THREE.CylinderGeometry(4.6, 3.6, 1.2, 12), place(tw2.x, tw2.height + 0.6, tw2.z), 0x2b3138);
  glass.round(new THREE.CylinderGeometry(4.8, 4.4, 3.4, 12, 1, true), place(tw2.x, tw2.height + 2.9, tw2.z), 0x7ab6cc);
  B.solid.round(new THREE.CylinderGeometry(5.4, 5.0, 0.8, 12), place(tw2.x, tw2.height + 5, tw2.z), 0x2b3138);
  B.solid.round(new THREE.CylinderGeometry(0.08, 0.08, 4, 6), place(tw2.x, tw2.height + 7.2, tw2.z), 0x9a9a9a);
  B.glow.box(0.3, 0.3, 0.3, place(tw2.x, tw2.height + 9.2, tw2.z), 0xff5a4a);
  B.solid.box(A.tower.base, 3.4, A.tower.base, place(tw2.x, 1.7, tw2.z), 0xbdb6a6);
  // the administration building and the fire station
  for (const [r, wall, roof, sign] of [[A.admin, 0xe8e2d4, 0x24364f, 'AIRPORT ADMINISTRATION'], [A.fire, 0xd94a3a, 0x3a3d42, 'FIRE STATION']]) {
    const w = r.x1 - r.x0, d = r.z1 - r.z0;
    B.walls.box(w, r.height, d, place((r.x0 + r.x1) / 2, r.height / 2, (r.z0 + r.z1) / 2), wall);
    B.roofs.box(w + 1, 0.5, d + 1, place((r.x0 + r.x1) / 2, r.height + 0.25, (r.z0 + r.z1) / 2), roof);
    for (let x = r.x0 + 3; x < r.x1 - 2; x += 4) for (const h of [2, 5.2]) if (h < r.height - 1) glass.box(2.4, 1.6, 0.06, place(x, h, r.z1 + 0.04), 0x9fd3e6);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w - 2, 14), 1.1), new THREE.MeshBasicMaterial({ map: textTexture([sign], { width: 1024, height: 80, background: '#24364f', colour: '#ffffff', size: 52 }), toneMapped: false }));
    mesh.position.set((r.x0 + r.x1) / 2, r.height - 0.9, r.z1 + 0.06); signs.push(mesh);
  }
}

// The airside fence: posts, and a chain-link panel between them, with the gate standing open.
function addFence(B, fence) {
  const f = AIRPORT.fence, g = AIRPORT.gate, h = 2.6;
  const run = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), turn = Math.atan2(x1 - x0, z1 - z0);
    fence.box(0.04, h - 0.3, len, place((x0 + x1) / 2, (h - 0.3) / 2 + 0.15, (z0 + z1) / 2, turn), 0xc9ced2);
    const n = Math.max(1, Math.round(len / 5));
    for (let i = 0; i <= n; i += 1) { const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * i) / n; B.solid.box(0.09, h, 0.09, place(x, h / 2, z), 0x7f868c); }
    B.solid.box(0.06, 0.06, len, place((x0 + x1) / 2, h, (z0 + z1) / 2, turn), 0x7f868c);
  };
  run(f.x0, f.z0, f.x1, f.z0); run(f.x0, f.z0, f.x0, f.z1); run(f.x1, f.z0, f.x1, f.z1);
  run(f.x0, f.z1, g.x0, f.z1); run(g.x1, f.z1, f.x1, f.z1);
  // the gate, swung open
  for (const [x, dir] of [[g.x0, 1], [g.x1, -1]]) fence.box(0.05, h - 0.4, 6.5, place(x + dir * 0.4, (h - 0.4) / 2 + 0.2, f.z1 + 3.3, dir * 0.15), 0xc9ced2);
}

// Shops and stores along the Onitsha road: plain walls, a roof, a door and a window.
function addRoadside(B, b) {
  const fx = Math.sin(b.facing), fz = Math.cos(b.facing);
  B.walls.box(b.w, b.h, b.d, place(b.x, b.h / 2, b.z, b.facing), b.wall);
  B.roofs.box(b.w + 0.8, 0.25, b.d + 0.8, place(b.x, b.h + 0.12, b.z, b.facing, 1, 1, 1, 0.06), b.roof);
  B.solid.box(1.2, 2.2, 0.08, place(b.x + fx * (b.d / 2 + 0.03) - 1.2 * Math.cos(b.facing), 1.1, b.z + fz * (b.d / 2 + 0.03) + 1.2 * Math.sin(b.facing), b.facing), 0x3d2b1f);
  B.solid.box(2.4, 1.2, 0.08, place(b.x + fx * (b.d / 2 + 0.03) + 1.6 * Math.cos(b.facing), 1.6, b.z + fz * (b.d / 2 + 0.03) - 1.6 * Math.sin(b.facing), b.facing), 0x283038);
  // a painted signboard over the door
  B.solid.box(Math.min(b.w - 1, 5), 0.8, 0.1, place(b.x + fx * (b.d / 2 + 0.08), b.h - 0.6, b.z + fz * (b.d / 2 + 0.08), b.facing), [0xc8342b, 0x1f5c4d, 0x24364f, 0xd9a441][Math.abs(Math.round(b.x)) % 4]);
}

export function buildOutskirts(scene, { glowMaterial }) {
  const sight = createSight();
  const solid = new Chunked();
  const walls = new Chunked({ uv: 'wall', scale: 3.2 });
  const roofs = new Chunked({ uv: 'plan', scale: 2.0 });
  const roads = new Chunked({ uv: 'plan', scale: 5 });
  const paint = new Chunked();
  const leaves = new Foliage();
  const glow = new Chunked();
  const glass = new Chunked();
  const fence = new Chunked({ uv: 'wall', scale: 1 });
  const B = { solid, walls, roofs, roads, paint, leaves, glow };
  const signs = [];
  const heads = [];

  scene.add(buildGround());
  for (const r of OUTSKIRT_ROADS) if (!r.deck) addRoad(B, r);
  addBridge(B, heads);
  addAirport(B, glass, signs, heads);
  addFence(B, fence);
  for (const b of OUTSKIRT_BUILDINGS) addRoadside(B, b);
  for (const lamp of OUTSKIRT_LAMPS.filter((l) => !l.deck)) addLamp(B, lamp, heads);
  for (const s of OUTSKIRT_SIGNS) addSign(B, s, signs);
  // the road works at the end of the Onitsha road: barriers and cones across it
  const R = ONITSHA_ROAD;
  for (let z = R.z0 + 0.5; z < R.z1; z += 2.2) { solid.box(0.25, 1.0, 2.0, place(R.x0 + 4, 0.5, z), Math.round(z) % 2 ? 0xf2f0ea : 0xc8342b); solid.round(new THREE.ConeGeometry(0.25, 0.7, 10), place(R.x0 + 9, 0.35, z + 1), 0xe0702a); }
  // trees on the land beyond the town, but nowhere anyone walks or drives
  const away = (x, z, pad) => OUTSKIRT_AREAS.every((a) => x < a.x0 - pad || x > a.x1 + pad || z < a.z0 - pad || z > a.z1 + pad);
  let made = 0;
  for (let i = 0; made < 170 && i < 4000; i += 1) {
    const x = -1300 + noise(i, 71) * 1050, z = -640 + noise(i, 73) * 760;
    if (x > -262 || !away(x, z, 6) || OUTSKIRT_BUILDINGS.some((b) => Math.hypot(b.x - x, b.z - z) < 9)) continue;
    const r = noise(i, 79);
    addTree(solid, leaves, { x, z, kind: r < 0.45 ? 'oilpalm' : r < 0.7 ? 'mango' : r < 0.85 ? 'palm' : 'almond', size: 0.8 + noise(i, 83) * 0.5, turn: noise(i, 89) * 6.28 });
    made += 1;
  }

  const kit = buildingKit();
  const add = (meshes, shadows = true) => { for (const mesh of meshes) { mesh.castShadow = shadows; mesh.receiveShadow = true; scene.add(mesh); sight.add(mesh); } };
  add(solid.build(kit.solid));
  add(walls.build(kit.walls));
  add(roofs.build(kit.roofs));
  for (const mesh of leaves.build(foliageMaterials())) { scene.add(mesh); sight.add(mesh); }
  const tarmac = grainTexture({ low: 0.66, coarse: 0.3, speck: 0.45, seed: 7 });
  add(roads.build(isRoad(weathers(surface({ vertexColors: true, map: tarmac, roughness: 0.94, metalness: 0 }), { darken: 0.42, gloss: 0.66, sheen: 1 }))), false);
  add(paint.build(surface({ vertexColors: true, roughness: 0.8, metalness: 0 })), false);
  add(glass.build(reflects(surface({ vertexColors: true, roughness: 0.08, metalness: 0.55, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false }), 1)), false);
  add(fence.build(new THREE.MeshLambertMaterial({ map: chainLink(), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide })), false);
  for (const mesh of glow.build(glowMaterial)) { scene.add(mesh); sight.add(mesh); }
  for (const sign of signs) { scene.add(sign); sight.add(sign, 260, { x: sign.position.x, z: sign.position.z, radius: 14 }); }
  return { lampHeads: heads, signs, see: (x, z, reach) => sight.look(x, z, reach) };
}

// a chain-link pattern, repeated along the fence
function chainLink() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 64); g.strokeStyle = 'rgba(205,210,214,1)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, 32); g.lineTo(32, 0); g.lineTo(64, 32); g.lineTo(32, 64); g.closePath(); g.stroke();
  g.beginPath(); g.moveTo(0, 0); g.lineTo(4, 0); g.moveTo(60, 64); g.lineTo(64, 64); g.stroke();
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
