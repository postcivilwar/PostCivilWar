// The advertising billboards (src/sim/billboards.js for the kinds, src/sim/zones/*-billboards.js for where each
// stands), drawn from the owner's photographs: real steel in three dimensions, not pictures of billboards.
//
// Every kind is built once, in its own frame, from its parts: round poles with flanged joints and base plates,
// raked legs, yellow scaffold legs with their cross-bracing, a side truss of chords and diagonals, the steel box
// behind the face and its stiffeners, a girder from pole to face, a platform of grating on brackets with a handrail,
// a ladder with a cage or pegs up the pole, and floodlights on arms. The digital kinds have their own: a screen
// tower on four columns with a yellow band, a building wrapped in screens, a curved screen on a lattice mast, and a
// chrome-framed screen on a plinth.
//
// Five hundred billboards are drawn as instances of those few shapes (THREE.InstancedMesh): near ones in full,
// further ones as their outline of face, supports and platform, and those out of sight not at all. The faces are
// instances too, one set for each size of face (each says PLACE YOUR ADS and its own size). Digital screens are
// drawn one by one, with their own moving picture, which is only drawn again while one is near enough to see.
//
//   const boards = buildBillboards(scene, { glowMaterial, lite });
//   boards.update(dt, { x, z, night, clock })            (twice a second is enough for what is drawn; every frame
//                                                          for the screens' pictures)
//   boards.show(campaigns, artwork)                       approved campaigns: their pictures on their billboards
import { BILLBOARD_TYPES, EMPTY_FACE, aspectOf } from '../sim/billboards.js';
import { zoneGroundY } from '../sim/zone.js';
import { ZONE_BILLBOARDS } from '../sim/zones/atani-billboards.js';
import { Batch, place, buildingKit, surface } from './render-kit.js';

const NEAR = { full: 120, lite: 80 };       // metres within which a billboard is drawn in full
const FAR = { full: 520, lite: 360 };       // and within which it is drawn at all (the screens a little less)
const SCREEN_LIVE = 160;                    // a digital screen's picture is drawn again only within this

const up = new THREE.Vector3(0, 1, 0);
const tmp = { a: new THREE.Vector3(), b: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3(), m: new THREE.Matrix4(), m2: new THREE.Matrix4(), e: new THREE.Euler() };

// A round member from one point to another (a leg, a brace, a lamp arm).
function strut(B, a, b, r, hex, sides = 6) {
  tmp.a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const length = tmp.a.length();
  if (length < 1e-4) return;
  tmp.q.setFromUnitVectors(up, tmp.a.normalize());
  tmp.m.compose(tmp.b.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), tmp.q, tmp.s.set(1, 1, 1));
  B.add(new THREE.CylinderGeometry(r, r, length, sides, 1, true), tmp.m.clone(), hex, 1, true);
}
const at = (x, y, z, ry = 0, rx = 0, rz = 0) => place(x, y, z, ry, 1, 1, 1, rx, rz);

// ---------------------------------------------------------------------------------------- the parts --
function pole(B, x, z, r, h, c, flanges = 1) {
  B.add(new THREE.CylinderGeometry(r * 0.86, r, h, 16, 1, true), at(x, h / 2, z), c.pole, 1, true);
  B.add(new THREE.CylinderGeometry(r * 0.86, r * 0.86, 0.06, 16), at(x, h, z), c.deep, 1, true);
  B.box(r * 3.2, 0.25, r * 3.2, at(x, 0.125, z), c.deep);
  for (let k = 0; k < 8; k += 1) B.box(0.08, 0.35, r * 1.1, at(x + Math.sin(k * Math.PI / 4) * r * 1.05, 0.42, z + Math.cos(k * Math.PI / 4) * r * 1.05, k * Math.PI / 4), c.deep);
  for (let f = 1; f <= flanges; f += 1) {
    const y = (h * f) / (flanges + 1);
    B.add(new THREE.CylinderGeometry(r * 1.18, r * 1.18, 0.16, 16), at(x, y, z), c.deep, 1, true);
    for (let k = 0; k < 10; k += 1) B.box(0.07, 0.07, 0.07, at(x + Math.sin(k * 0.628) * r * 1.12, y + 0.11, z + Math.cos(k * 0.628) * r * 1.12), c.rail);
  }
}

// the steel box behind the face, its stiffeners and the frame round the face
function faceBox(B, W, H, b, c, depth = 0.45) {
  B.box(W + 0.3, H + 0.3, depth, at(0, b + H / 2, -depth / 2 - 0.04), c.deep);
  for (const [w, h, x, y] of [[W + 0.34, 0.16, 0, b - 0.07], [W + 0.34, 0.16, 0, b + H + 0.07], [0.16, H + 0.3, -W / 2 - 0.07, b + H / 2], [0.16, H + 0.3, W / 2 + 0.07, b + H / 2]]) B.box(w, h, 0.12, at(x, y, 0.02), c.steel);
  for (let x = -W / 2 + 1.2; x < W / 2 - 0.5; x += 2) B.box(0.12, H, 0.14, at(x, b + H / 2, -depth - 0.1), c.steel);
  for (const k of [0.25, 0.75]) B.box(W, 0.16, 0.16, at(0, b + H * k, -depth - 0.22), c.steel);
}

// a lattice down one side of the face, from below the platform to above the top
function sideTruss(B, side, W, H, b, c) {
  const x = side * (W / 2 + 0.55), y0 = b - 1.0, y1 = b + H + 0.25;
  for (const z of [-0.15, -1.25]) B.box(0.18, y1 - y0, 0.18, at(x, (y0 + y1) / 2, z), c.steel);
  const steps = Math.max(3, Math.round((y1 - y0) / 1.1));
  for (let i = 0; i <= steps; i += 1) {
    const y = y0 + ((y1 - y0) * i) / steps;
    B.box(0.12, 0.12, 1.1, at(x, y, -0.7), c.steel);
    B.box(0.9, 0.1, 0.1, at(x - side * 0.45, y, -0.15), c.steel);
    if (i < steps) { const y2 = y0 + ((y1 - y0) * (i + 1)) / steps; strut(B, [x, y, i % 2 ? -0.15 : -1.25], [x, y2, i % 2 ? -1.25 : -0.15], 0.05, c.steel, 5); strut(B, [x - side * 0.05, y, -0.15], [x - side * 0.9, y2, -0.15], 0.04, c.steel, 5); }
  }
}

// the platform under the face: grating on brackets, with a handrail in front, or a second deck below it
function deck(B, W, b, c, kind, deep) {
  const y = b - 0.55, len = W + 0.9;
  B.box(len, 0.08, 1.35, at(0, y, 0.62), c.rail, 0.82);
  for (const z of [0, 1.28]) B.box(len, 0.18, 0.1, at(0, y - 0.08, z), c.steel);
  for (let x = -W / 2; x <= W / 2 + 0.01; x += 2.4) { B.box(0.12, 0.14, 1.4, at(x, y - 0.18, 0.62), c.steel); strut(B, [x, y - 0.22, 1.2], [x, y - 1.15, -0.2], 0.05, c.steel, 5); }
  if (deep) B.box(W + 0.4, 0.8, 1.6, at(0, y - 0.5, -0.35), c.deep);
  if (kind === 'railing') {
    for (let x = -len / 2; x <= len / 2 + 0.01; x += 1.6) B.box(0.05, 1.05, 0.05, at(x, y + 0.55, 1.28), c.rail);
    for (const h of [1.05, 0.55]) B.box(len, 0.05, 0.05, at(0, y + h, 1.28), c.rail);
    for (const s of [-1, 1]) for (const h of [1.05, 0.55]) B.box(0.05, 0.05, 1.3, at(s * len / 2, y + h, 0.64), c.rail);
    B.box(len, 0.12, 0.02, at(0, y + 0.1, 1.29), c.rail);
  }
  if (kind === 'double') {
    const y2 = y - 1.15;
    B.box(len + 0.6, 0.08, 1.6, at(0, y2, 0.5), c.rail, 0.82);
    for (let x = -W / 2; x <= W / 2 + 0.01; x += 2.4) strut(B, [x, y2, 1.25], [x, y, 1.25], 0.04, c.steel, 5);
    for (const z of [-0.2, 1.3]) B.box(len + 0.6, 0.16, 0.1, at(0, y2 - 0.08, z), c.steel);
  }
}

// a lattice under the platform along its length (the long twin-pole kind)
function underTruss(B, W, b, c) {
  const y0 = b - 0.65, y1 = b - 2.0;
  B.box(W, 0.16, 0.16, at(0, y1, -0.3), c.steel);
  for (let x = -W / 2; x < W / 2 - 0.1; x += 1.5) { strut(B, [x, y0, -0.3], [x + 1.5, y1, -0.3], 0.05, c.steel, 5); strut(B, [x, y1, -0.3], [x + 1.5, y0, -0.3], 0.05, c.steel, 5); }
}

// floodlights: on arms over the top of the face, or on the platform aimed up at it
function lamps(B, G, n, where, W, H, b, c) {
  if (!n) return;
  for (let i = 0; i < n; i += 1) {
    const x = n === 1 ? 0 : -W / 2 + W * (0.06 + (0.88 * i) / (n - 1));
    if (where === 'top') {
      strut(B, [x, b + H + 0.1, -0.12], [x, b + H + 0.75, 1.05], 0.045, c.steel, 5);
      B.box(0.55, 0.12, 0.36, at(x, b + H + 0.8, 1.2, 0, 0.35), c.lamp);
      G.box(0.46, 0.02, 0.28, at(x, b + H + 0.73, 1.22, 0, 0.35), 0xfff4d6);
    } else {
      strut(B, [x, b - 0.5, 1.15], [x, b - 0.05, 1.7], 0.045, c.steel, 5);
      B.box(0.5, 0.34, 0.14, at(x, b + 0.05, 1.78, 0, -0.55), c.lamp);
      G.box(0.42, 0.28, 0.02, at(x, b + 0.08, 1.7, 0, -0.55), 0xfff4d6);
    }
  }
}

// a ladder up the pole: rails and rungs, with hoops round it, or pegs up the pole itself
function ladder(B, kind, x, z, r, top, c) {
  if (kind === 'cage') {
    const lx = x + r + 0.32;
    for (const dz of [-0.2, 0.2]) B.box(0.05, top - 0.6, 0.05, at(lx, (top + 0.6) / 2, z + dz), c.rail);
    for (let y = 0.9; y < top; y += 0.35) B.box(0.04, 0.04, 0.42, at(lx, y, z), c.rail);
    for (let y = 2.6; y < top; y += 1.15) {
      const hoop = new THREE.TorusGeometry(0.38, 0.025, 4, 12);
      hoop.rotateX(Math.PI / 2);
      B.add(hoop, at(lx + 0.38, y, z), c.rail, 1, true);
    }
    for (let y = 2.6; y < top; y += 2.3) for (const dz of [-0.36, 0.36]) B.box(0.03, 2.3, 0.03, at(lx + 0.38, y + 1.15, z + dz), c.rail);
  } else if (kind === 'rungs') {
    for (let y = 1.2, k = 0; y < top; y += 0.42, k += 1) { const a = k % 2 ? 0.45 : -0.45; B.box(0.36, 0.04, 0.04, at(x + Math.sin(a + 1.57) * (r + 0.14), y, z + Math.cos(a + 1.57) * (r + 0.14), a), c.rail); }
  }
}

// ------------------------------------------------------------------------------------- whole kinds --
// Returns { body: Batch, glow: Batch, far: Batch } in the kind's own frame at full size.
function buildKind(t) {
  const B = new Batch(), G = new Batch(), F = new Batch();
  const c = t.colours, W = t.width, H = t.height, b = t.bottom;
  const face = () => { faceBox(B, W, H, b, c); F.box(W + 0.3, H + 0.3, 0.45, at(0, b + H / 2, -0.26), c.deep); };
  const girder = (x0, x1, z) => { B.box(x1 - x0, 0.45, 0.45, at((x0 + x1) / 2, b - 0.3, z), c.deep); B.box(x1 - x0, 0.45, 0.45, at((x0 + x1) / 2, b + H * 0.6, z), c.deep); };
  switch (t.supports) {
    case 'pole': case 'twin': {
      face();
      const xs = t.supports === 'twin' ? [-0.32 * W, 0.32 * W] : [(t.poleOffset || 0) * W];
      const pz = -1.2;
      for (const x of xs) { pole(B, x, pz, t.poleRadius, b + H * 0.65, c, t.supports === 'twin' ? 2 : 1); F.add(new THREE.CylinderGeometry(t.poleRadius * 0.86, t.poleRadius, b + H * 0.65, 6, 1, true), at(x, (b + H * 0.65) / 2, pz), c.pole, 1, true); }
      girder(-W * 0.45, W * 0.45, -0.75);
      for (const x of xs) { B.box(0.5, H * 0.65 + 0.3, 0.5, at(x, b + H * 0.32, -0.75), c.deep); B.box(t.poleRadius * 2.4, 0.3, 1.1, at(x, b - 0.6, -0.95), c.deep); }
      if (t.truss) sideTruss(B, t.truss === 'left' ? -1 : 1, W, H, b, c);
      if (t.deck) { deck(B, W, b, c, t.deck, t.deepDeck); F.box(W + 0.9, 0.12, 1.4, at(0, b - 0.55, 0.62), c.rail); }
      if (t.underTruss) underTruss(B, W, b, c);
      lamps(B, G, t.lamps, t.lampsAt, W, H, b, c);
      if (t.lightBar) { for (const x of [-W * 0.18, W * 0.18]) B.box(0.06, 0.5, 0.06, at(x, b + H + 0.35, 0.1), c.rail); B.box(W * 0.45, 0.1, 0.18, at(0, b + H + 0.62, 0.25), c.lamp); G.box(W * 0.43, 0.02, 0.14, at(0, b + H + 0.56, 0.25), 0xfff4d6); }
      if (t.ladder) ladder(B, t.ladder, xs[xs.length - 1], pz, t.poleRadius, b - 0.6, c);
      break;
    }
    case 'four': {
      face();
      const legs = [-0.36, -0.12, 0.12, 0.36];
      legs.forEach((k, i) => { const foot = [k * W, 0, -0.9 - (i % 2 ? 1.6 : 0.4)], top = [k * W, b - 0.6, -0.8]; strut(B, foot, top, t.poleRadius, c.pole, 12); B.box(0.8, 0.2, 0.8, at(foot[0], 0.1, foot[2]), 0x9a958b); F.box(0.4, b, 0.4, at(foot[0], b / 2, foot[2] / 2 - 0.4), c.pole); });
      for (let i = 0; i < legs.length - 1; i += 1) strut(B, [legs[i] * W, b * 0.45, -1.3 - (i % 2 ? 0.8 : 0)], [legs[i + 1] * W, b * 0.45, -1.3 - ((i + 1) % 2 ? 0.8 : 0)], 0.08, c.steel, 6);
      girder(-W * 0.45, W * 0.45, -0.8);
      if (t.truss) sideTruss(B, -1, W, H, b, c);
      deck(B, W, b, c, 'grating');
      F.box(W + 0.9, 0.12, 1.4, at(0, b - 0.55, 0.62), c.rail);
      break;
    }
    case 'trestle': {
      face();
      const Y = '#d8b33a', yellow = 0xd8b33a, zf = -0.9, zb = -2.7;
      const xs = []; for (let x = -W / 2 + 1; x <= W / 2 - 0.9; x += 3) xs.push(x);
      for (const x of xs) for (const z of [zf, zb]) { strut(B, [x, 0, z], [x, b - 0.7, z], 0.12, yellow, 8); B.box(0.5, 0.18, 0.5, at(x, 0.09, z), 0x8b8f94); }
      for (let i = 0; i < xs.length; i += 1) {
        strut(B, [xs[i], 0.4, zf], [xs[i], b - 1, zb], 0.05, yellow, 5); strut(B, [xs[i], 0.4, zb], [xs[i], b - 1, zf], 0.05, yellow, 5);
        for (const h of [b * 0.33, b * 0.66]) B.box(0.08, 0.08, zf - zb, at(xs[i], h, (zf + zb) / 2), yellow);
        if (i < xs.length - 1) for (const z of [zf, zb]) { strut(B, [xs[i], 0.3, z], [xs[i + 1], b - 0.9, z], 0.05, yellow, 5); strut(B, [xs[i], b - 0.9, z], [xs[i + 1], 0.3, z], 0.05, yellow, 5); for (const h of [b * 0.33, b * 0.66]) B.box(3, 0.08, 0.08, at(xs[i] + 1.5, h, z), yellow); }
      }
      for (const x of xs) F.box(0.3, b, 2.2, at(x, b / 2, (zf + zb) / 2), yellow);
      // the girder platform on top of the legs
      B.box(W + 0.6, 0.5, 2.6, at(0, b - 0.55, -1.6), c.deep);
      for (let x = -W / 2; x < W / 2 - 0.4; x += 1.6) strut(B, [x, b - 0.8, -0.3], [x + 1.6, b - 0.3, -0.3], 0.05, c.steel, 5);
      if (t.truss) sideTruss(B, -1, W, H, b, c);
      deck(B, W, b, c, 'grating');
      lamps(B, G, t.lamps, 'top', W, H, b, c);
      void Y;
      break;
    }
    case 'mast': {
      // a curved screen held out from a lattice mast on brackets, a grating below it with lamps
      const R = W / t.curve, mx = W / 2 + 1.2, top = b + H + 0.6;
      for (const [dx, dz] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) B.box(0.16, top, 0.16, at(mx + dx, top / 2, -1.2 + dz), c.steel);
      for (let y = 0.6, k = 0; y < top - 0.5; y += 1.2, k += 1) { for (const dz of [-0.45, 0.45]) strut(B, [mx - 0.45, y, -1.2 + dz], [mx + 0.45, y + 1.2, -1.2 + dz], 0.04, c.steel, 5); B.box(0.9, 0.08, 0.9, at(mx, y, -1.2), c.steel); }
      B.box(1.6, 0.3, 1.6, at(mx, 0.15, -1.2), 0x9a958b);
      for (const y of [b + 1, b + H / 2, b + H - 1]) { B.box(1.5, 0.3, 0.3, at(mx - 0.9, y, -0.9), c.deep); B.box(0.12, 0.5, 0.5, at(mx - 0.2, y, -0.9), c.steel); }
      // the curved back of the screen
      const back = new THREE.CylinderGeometry(R + 0.35, R + 0.35, H + 0.3, 18, 1, true, Math.PI - t.curve / 2, t.curve);
      back.translate(0, b + H / 2, R);
      B.add(back, at(0, 0, -0.05), c.deep, 1, true);
      for (const y of [b - 0.1, b + H + 0.1]) { const rim = new THREE.CylinderGeometry(R + 0.05, R + 0.05, 0.2, 18, 1, true, Math.PI - t.curve / 2, t.curve); rim.translate(0, y, R); B.add(rim, at(0, 0, 0), c.steel, 1, true); }
      // the walkway, curved as the screen is, on arms from the mast
      const walk = new THREE.CylinderGeometry(R - 0.8, R - 0.8, 0.08, 18, 1, true, Math.PI - t.curve / 2, t.curve);
      walk.translate(0, b - 0.9, R);
      B.add(walk, at(0, 0, 0), c.rail, 0.8, true);
      for (let i = 0; i < 6; i += 1) { const a = Math.PI - t.curve / 2 + (t.curve * (i + 0.5)) / 6; const x = Math.sin(a) * (R - 0.6), z = R + Math.cos(a) * (R - 0.6); strut(B, [x, b - 0.9, z + 0.6], [x, b - 0.6, z + 1.1], 0.04, c.steel, 5); B.box(0.45, 0.3, 0.14, at(x, b - 0.45, z + 1.15, 0, -0.6), c.lamp); G.box(0.4, 0.24, 0.02, at(x, b - 0.42, z + 1.07, 0, -0.6), 0xfff4d6); }
      F.box(W, H, 0.4, at(0, b + H / 2, -0.3), c.deep); F.box(1, top, 1, at(mx, top / 2, -1.2), c.steel);
      break;
    }
    case 'tower': {
      // four sides of screen in two tiers, on four columns round a core, a yellow band under the screens
      const S = W + 0.5, half = S / 2, base = b;
      for (const [x, z] of [[-half + 0.5, -half + 0.5], [half - 0.5, -half + 0.5], [-half + 0.5, half - 0.5], [half - 0.5, half - 0.5]]) { B.box(1.0, base, 1.0, at(x, base / 2, z), c.steel); B.box(1.5, 0.6, 1.5, at(x, 0.3, z), 0x8b8f94); F.box(1, base, 1, at(x, base / 2, z), c.steel); }
      B.box(2.4, base, 2.4, at(0, base / 2, 0), c.deep);
      for (const [x, z] of [[-half + 0.5, 0], [half - 0.5, 0]]) strut(B, [x, 0.6, z - 1.6], [x, base - 0.8, z], 0.12, c.deep, 6);
      B.box(S + 0.8, 0.55, S + 0.8, at(0, base + 0.2, 0), c.deep);
      for (const [x, z] of [[0, half + 0.42], [0, -half - 0.42], [half + 0.42, 0], [-half - 0.42, 0]]) { const along = z !== 0; B.box(along ? S + 0.9 : 0.06, 0.22, along ? 0.06 : S + 0.9, at(x, base + 0.32, z), 0xf2c200); G.box(along ? S + 0.9 : 0.03, 0.18, along ? 0.03 : S + 0.9, at(x * 1.004, base + 0.32, z * 1.004), 0xf2c200); }
      for (let i = 0; i < 9; i += 1) G.box(0.25, 0.02, 0.25, at(-half + 0.8 + (i % 3) * (half - 0.8), base - 0.09, -half + 0.8 + Math.floor(i / 3) * (half - 0.8)), 0xfff4d6);
      // the box of screens and its frame, a band between the tiers and a cap with lamps on its edges
      B.box(S, H + 0.4, S, at(0, base + 0.55 + H / 2, 0), c.deep);
      for (const s of [-1, 1]) for (const k of [-1, 1]) B.box(0.35, H + 0.6, 0.35, at(s * half, base + 0.55 + H / 2, k * half), c.steel);
      B.box(S + 0.3, 0.3, S + 0.3, at(0, base + 0.55 + H / 2, 0), c.steel);
      B.box(S + 0.5, 0.4, S + 0.5, at(0, base + 0.75 + H, 0), c.steel);
      for (const [x, z, ry] of [[0, half + 0.1, 0], [0, -half - 0.1, Math.PI], [half + 0.1, 0, Math.PI / 2], [-half - 0.1, 0, -Math.PI / 2]]) for (const k of [-0.32, 0, 0.32]) {
        const px = x + Math.cos(ry) * k * S, pz = z - Math.sin(ry) * k * S;
        B.box(0.4, 0.15, 0.3, at(px, base + 1.1 + H, pz, ry), c.lamp); G.box(0.34, 0.02, 0.24, at(px, base + 1.03 + H, pz, ry), 0xfff4d6);
      }
      F.box(S, H, S, at(0, base + 0.55 + H / 2, 0), c.deep);
      break;
    }
    case 'building': {
      // a corner building: a colonnade, a band of screen round two sides and the corner, a set-back storey with
      // more screen, and a glass drum at the corner rising above it all
      const fw = t.footprint.w, fd = t.footprint.d, cz = -fd / 2 + 0.6, front = cz + fd / 2;
      const glass = 0x3e5566, dark = 0x2a2e33, panel = 0x5b6066;
      B.box(fw - 2, 6, fd - 2, at(0, 3, cz), glass);
      for (let x = -fw / 2 + 1.5; x <= fw / 2 - 1.4; x += 4.2) B.add(new THREE.CylinderGeometry(0.55, 0.55, 6, 12), at(x, 3, front - 0.5), panel, 1, true);
      for (let z = cz - fd / 2 + 2; z <= front - 2; z += 4.2) B.add(new THREE.CylinderGeometry(0.55, 0.55, 6, 12), at(fw / 2 - 0.5, 3, z), panel, 1, true);
      for (let x = -fw / 2 + 3.6; x < fw / 2 - 3; x += 4.2) B.box(0.08, 5.6, 0.08, at(x, 2.9, front - 1.05), 0x1a1d21);
      B.box(fw + 0.6, 0.7, fd + 0.6, at(0, 6.35, cz), panel);
      B.box(fw, b + H - 6.7 + 0.8, fd, at(0, 6.7 + (b + H - 6.7 + 0.8) / 2, cz), dark);
      B.box(fw + 0.7, 0.5, fd + 0.7, at(0, b + H + 0.8, cz), panel);
      const top = b + H + 1.05;
      B.box(fw - 6, 6, fd - 6, at(-2, top + 3, cz - 1), dark);
      B.box(fw - 5.4, 0.4, fd - 5.4, at(-2, top + 6.2, cz - 1), panel);
      B.add(new THREE.CylinderGeometry(4, 4, top + 9 - 6.7, 20, 1, true), at(fw / 2 - 5, 6.7 + (top + 9 - 6.7) / 2, front - 5), glass, 1, true);
      for (let y = 8; y < top + 9; y += 2.2) B.add(new THREE.CylinderGeometry(4.06, 4.06, 0.12, 20, 1, true), at(fw / 2 - 5, y, front - 5), panel, 1, true);
      B.add(new THREE.CylinderGeometry(4.2, 4.2, 0.4, 20), at(fw / 2 - 5, top + 9, front - 5), panel, 1, true);
      for (let x = -fw / 2 + 2; x < fw / 2 - 8; x += 2.5) B.box(0.06, 1.1, 0.06, at(x, top + 6.9, cz + fd / 2 - 3.2), 0x9aa0a6);
      F.box(fw, top + 6, fd, at(0, (top + 6) / 2, cz), dark);
      break;
    }
    case 'plinth': {
      // a plinth of panels, and on it a chrome frame of rounded ends round the screen, lit warm inside
      const chrome = 0xc9ced3, pw = W + 4, ph = H + 2.4, py = b - 1.0;
      B.box(pw - 6, 2.2, 2.4, at(0, 1.1, -0.6), 0xd5d7d6);
      for (let x = -(pw - 6) / 2 + 0.9; x < (pw - 6) / 2; x += 0.9) B.box(0.03, 2.1, 0.02, at(x, 1.1, 0.61), 0x9da2a6);
      B.box(pw - 5.6, 0.12, 2.8, at(0, 2.25, -0.6), 0x8e9398);
      for (const x of [-W * 0.3, -W * 0.1, W * 0.1, W * 0.3]) B.box(0.06, py - 2.3, 0.06, at(x, (py + 2.3) / 2, 0.2), chrome);
      const r = ph / 2;
      B.box(pw - 2 * r, 0.9, 2.2, at(0, py + 0.45, -0.5), chrome); B.box(pw - 2 * r, 0.9, 2.2, at(0, py + ph - 0.45, -0.5), chrome);
      for (const s of [-1, 1]) { const end = new THREE.TorusGeometry(r - 0.45, 0.45, 8, 18, Math.PI); end.rotateZ(-s * Math.PI / 2); end.scale(1, 1, 2.44); B.add(end, at(s * (pw / 2 - r), py + r, -0.5), chrome, 1, true); }   // the rounded ends of the frame: half rings
      B.box(W + 0.6, H + 0.6, 0.6, at(0, b + H / 2, -0.4), 0x34383d);
      G.box(W + 0.4, 0.08, 0.06, at(0, b + H + 0.35, 0.05), 0xffc979); G.box(W + 0.4, 0.06, 0.06, at(0, py + ph - 0.95, 0.65), 0xffc979);
      F.box(pw, ph, 2.2, at(0, py + ph / 2, -0.5), chrome); F.box(pw - 6, 2.2, 2.4, at(0, 1.1, -0.6), 0xd5d7d6);
      break;
    }
    default: face();
  }
  return { body: B, glow: G, far: F };
}

// ----------------------------------------------------------------------------------------- the faces --
// What an empty face says: PLACE YOUR ADS, and its own size, on dark board.
function emptyFace(width, height, { tv = false, sides = 1, lite = false } = {}) {
  const canvas = document.createElement('canvas');
  // about 80 pixels a metre, 1,024 at most along its long side: the words can be read from the road (on a phone half
  // that: on its screen they read the same, and the faces take a quarter of the graphics memory)
  const k = Math.min(lite ? 40 : 80, (tv ? 640 : 1024) / (lite ? 2 : 1) / Math.max(width, height));
  canvas.width = Math.max(64, Math.round(width * k)); canvas.height = Math.max(32, Math.round(height * k));
  const g = canvas.getContext('2d');
  const draw = (phase = 0) => {
    const W = canvas.width, H = canvas.height, u = Math.min(W, H * 3.2);
    const ground = g.createLinearGradient(0, 0, W, H);
    if (tv) { const p = (Math.sin(phase) + 1) / 2; ground.addColorStop(0, `hsl(${210 + p * 40}, 70%, ${10 + p * 6}%)`); ground.addColorStop(1, `hsl(${280 - p * 30}, 60%, ${12 + (1 - p) * 6}%)`); }
    else { ground.addColorStop(0, '#1a1c20'); ground.addColorStop(1, '#25282d'); }
    g.fillStyle = ground; g.fillRect(0, 0, W, H);
    if (tv) { g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 1; for (let x = (phase * 40) % 16; x < W; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x - H * 0.3, H); g.stroke(); } }
    g.fillStyle = '#f2c200'; g.fillRect(W * 0.04, H * 0.08, W * 0.92, Math.max(2, H * 0.012));
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const fit = (text, px, weight, y, colour) => { g.font = `${weight} ${px}px "Arial Narrow", "Roboto Condensed", Impact, sans-serif`; while (g.measureText(text).width > W * 0.9 && px > 8) { px -= 1; g.font = `${weight} ${px}px "Arial Narrow", "Roboto Condensed", Impact, sans-serif`; } g.fillStyle = colour; g.fillText(text, W / 2, y); };
    fit(EMPTY_FACE, Math.round(u * 0.13), 900, H * 0.42, '#ffffff');
    fit(`${tv ? 'Digital screen' : 'Billboard'} size: ${width} m × ${height} m${sides > 1 ? `, ${sides} sides` : ''}`, Math.round(u * 0.045), 700, H * 0.66, '#f2c200');
    fit(`Artwork ${aspectOf(width, height)} · book it in the ADS app on your phone`, Math.round(u * 0.032), 600, H * 0.8, 'rgba(255,255,255,0.75)');
  };
  draw(0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding; texture.anisotropy = 4;
  return { canvas, texture, draw };
}

// ------------------------------------------------------------------------------------------ building --
export function buildBillboards(scene, { glowMaterial, lite = false, boards = ZONE_BILLBOARDS, loadArtwork = null } = {}) {
  const near = lite ? NEAR.lite : NEAR.full, far = lite ? FAR.lite : FAR.full;
  const kit = buildingKit();
  const group = new THREE.Group(); group.name = 'billboards';
  scene.add(group);
  const kinds = new Map();
  const matrixOf = (b) => { const m = new THREE.Matrix4(); m.compose(new THREE.Vector3(b.x, zoneGroundY(b.x, b.z), b.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, b.heading, 0)), new THREE.Vector3(b.scale, b.scale, b.scale)); return m; };
  let triangles = 0;
  // one shape of each kind there is, and as many instances of it as there are billboards of that kind
  for (const id of new Set(boards.map((b) => b.type))) {
    const t = BILLBOARD_TYPES[id];
    const made = buildKind(t);
    const count = boards.filter((b) => b.type === id).length;
    const inst = (batch, material) => { const mesh = batch.build(material); const im = new THREE.InstancedMesh(mesh.geometry, material, count); im.count = 0; im.frustumCulled = false; im.castShadow = !lite; im.receiveShadow = true; group.add(im); return im; };
    const body = inst(made.body, kit.solid), glow = made.glow.positions.length ? inst(made.glow, glowMaterial) : null, outline = inst(made.far, kit.solid);
    if (glow) glow.castShadow = false;
    outline.castShadow = false;
    triangles += body.geometry.attributes.position.count / 3;
    kinds.set(id, { body, glow, outline });
  }
  // the faces: one set of instances for each size of face (each its own picture); the digital screens one by one
  const faceSets = new Map();
  const plane = new THREE.PlaneGeometry(1, 1);
  const all = boards.map((b) => ({ ...b, matrix: matrixOf(b), t: BILLBOARD_TYPES[b.type], d: Infinity, art: null }));
  const screens = [];
  for (const b of all) {
    const t = b.t;
    if (t.tv) { screens.push(makeScreen(b)); continue; }
    const key = `${b.width}x${b.height}`;
    if (!faceSets.has(key)) {
      const face = emptyFace(b.width, b.height, { lite });
      const material = surface({ map: face.texture, emissive: 0xffffff, emissiveMap: face.texture, emissiveIntensity: 0.12, roughness: 0.8, metalness: 0 });
      const im = new THREE.InstancedMesh(plane, material, all.filter((x) => !x.t.tv && x.width === b.width && x.height === b.height).length);
      im.count = 0; im.frustumCulled = false; im.receiveShadow = true;
      group.add(im);
      faceSets.set(key, { mesh: im, material, list: [] });
    }
    // the face in the billboard's frame (at full size: the instance's own scale makes it the size it is)
    b.faceMatrix = b.matrix.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(0, t.bottom + t.height / 2, 0.02), new THREE.Quaternion(), new THREE.Vector3(t.width, t.height, 1)));
    b.faceKey = key;
  }

  // A digital screen: its own picture (a canvas drawn again while it is near), on each of its faces.
  function makeScreen(b) {
    const t = b.t;
    const face = emptyFace(b.width, b.height, { tv: true, sides: t.sides || 1, lite });
    const material = new THREE.MeshBasicMaterial({ map: face.texture, toneMapped: false });
    const holder = new THREE.Group();
    holder.matrixAutoUpdate = false; holder.matrix.copy(b.matrix);
    const add = (geometry, x, y, z, ry) => { const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z); m.rotation.y = ry; holder.add(m); };
    if (t.supports === 'tower') {
      const half = (t.width + 0.5) / 2 + 0.01, y = t.bottom + 0.55 + t.height / 2, g = new THREE.PlaneGeometry(t.width, t.height);
      add(g, 0, y, half, 0); add(g, 0, y, -half, Math.PI); add(g, half, y, 0, Math.PI / 2); add(g, -half, y, 0, -Math.PI / 2);
    } else if (t.supports === 'building') {
      const fw = t.footprint.w, fd = t.footprint.d, cz = -fd / 2 + 0.6, front = cz + fd / 2 + 0.02;
      add(new THREE.PlaneGeometry(t.width, t.height), -fw / 2 + t.width / 2 + 1, t.bottom + t.height / 2, front, 0);
      add(new THREE.PlaneGeometry(fd - 4, t.height), fw / 2 + 0.02, t.bottom + t.height / 2, cz, Math.PI / 2);
    } else if (t.supports === 'mast') {
      const R = t.width / t.curve, g = new THREE.CylinderGeometry(R, R, t.height, 24, 1, true, Math.PI - t.curve / 2, t.curve);
      g.scale(-1, 1, 1);           // turned inside out: its face looks out of the hollow of the curve, towards the road, the right way round
      add(g, 0, t.bottom + t.height / 2, R + 0.03, 0);
    } else add(new THREE.PlaneGeometry(t.width, t.height), 0, t.bottom + t.height / 2, 0.03, 0);
    group.add(holder);
    holder.updateMatrixWorld(true);
    return { b, face, material, holder, phase: (b.x * 0.37) % 6, slides: null, slide: 0, slideAt: 0 };
  }

  // ---- what is drawn: twice a second, from where the camera looks ----
  const assign = (x, z) => {
    for (const k of kinds.values()) { k.body.count = 0; if (k.glow) k.glow.count = 0; k.outline.count = 0; }
    for (const f of faceSets.values()) f.mesh.count = 0;
    let shown = 0, full = 0;
    for (const b of all) {
      b.d = Math.hypot(b.x - x, b.z - z);
      if (b.d > far + b.width) { if (b.art) b.art.visible = false; continue; }
      shown += 1;
      const k = kinds.get(b.type);
      if (b.d < near + b.width) { k.body.setMatrixAt(k.body.count++, b.matrix); if (k.glow) k.glow.setMatrixAt(k.glow.count++, b.matrix); full += 1; }
      else k.outline.setMatrixAt(k.outline.count++, b.matrix);
      if (b.faceKey) { const f = faceSets.get(b.faceKey); f.mesh.setMatrixAt(f.mesh.count++, b.faceMatrix); }
      if (b.art) b.art.visible = true;
    }
    for (const k of kinds.values()) for (const m of [k.body, k.glow, k.outline]) if (m) { m.instanceMatrix.needsUpdate = true; m.visible = m.count > 0; }
    for (const f of faceSets.values()) { f.mesh.instanceMatrix.needsUpdate = true; f.mesh.visible = f.mesh.count > 0; }
    for (const s of screens) s.holder.visible = s.b.d < far * 0.8;
    stats.shown = shown; stats.full = full;
  };
  const stats = { boards: all.length, kinds: kinds.size, faceSizes: faceSets.size, screens: screens.length, triangles: Math.round(triangles), shown: 0, full: 0 };
  let since = 1, lastX = Infinity, lastZ = Infinity;

  // ---- campaigns: an approved picture over its billboard's face ----
  const textures = new Map();
  async function pictureOf(url) {
    if (textures.has(url)) return textures.get(url);
    const made = (async () => {
      const blob = loadArtwork ? await loadArtwork(url) : await (await fetch(url)).blob();
      const bitmap = typeof createImageBitmap === 'function' ? await createImageBitmap(blob) : await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = URL.createObjectURL(blob); });
      return bitmap;
    })();
    textures.set(url, made);
    made.catch(() => textures.delete(url));
    return made;
  }
  let campaigns = new Map();
  function show(list = []) {
    const next = new Map(list.map((c) => [c.billboard, c]));
    // a static board: its picture on a face of its own, over the empty one
    for (const b of all) {
      const was = campaigns.get(b.id), now = next.get(b.id);
      if (was && (!now || now.id !== was.id)) { if (b.art) { group.remove(b.art); b.art.material.map && b.art.material.map.dispose(); b.art.material.dispose(); b.art = null; } }
    }
    for (const s of screens) { const now = next.get(s.b.id); if (!now) { s.slides = null; } else if (!s.slides || s.campaign !== now.id) { s.campaign = now.id; s.slides = []; s.seconds = now.seconds || 8; now.art.forEach((url, i) => pictureOf(url).then((img) => { if (s.campaign === now.id) s.slides[i] = img; }, () => {})); } }
    for (const [id, c] of next) {
      const b = all.find((x) => x.id === id);
      if (!b || b.t.tv || (campaigns.get(id) && campaigns.get(id).id === c.id && b.art)) continue;
      pictureOf(c.art[0]).then((img) => {
        if (!next.has(id) || b.art) return;
        // (drawn into a canvas first: a picture decoded as an ImageBitmap would be put on the face upside down)
        const canvas = document.createElement('canvas'); canvas.width = Math.min(lite ? 1024 : 2048, img.width); canvas.height = Math.round(canvas.width * img.height / img.width);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const tex = new THREE.CanvasTexture(canvas); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 4;
        const m = new THREE.Mesh(plane, surface({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.12, roughness: 0.8, metalness: 0 }));
        m.matrixAutoUpdate = false; m.matrix.copy(b.faceMatrix).multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.01));
        b.art = m; group.add(m);
      }, () => {});
    }
    campaigns = next;
  }

  function update(dt, { x, z, night = 0, clock = 0 }) {
    since += dt;
    if (since > 0.5 || Math.hypot(x - lastX, z - lastZ) > 25) { since = 0; lastX = x; lastZ = z; assign(x, z); }
    for (const f of faceSets.values()) f.material.emissiveIntensity = 0.12 + night * 0.75;
    for (const b of all) if (b.art) b.art.material.emissiveIntensity = 0.12 + night * 0.75;
    // the screens near enough to see: their picture moves (about ten times a second)
    for (const s of screens) {
      if (s.b.d > SCREEN_LIVE) continue;
      s.phase += dt; s.next = (s.next || 0) - dt;
      if (s.next > 0) continue;
      // (an empty screen's colours drift twice a second; a campaign's slide is drawn again only when it changes)
      s.next = 0.5;
      if (s.slides && s.slides.length) {
        const shown = s.slides.filter(Boolean);
        if (!shown.length) continue;
        const i = Math.floor(clock / s.seconds) % shown.length;
        if (s.drawnSlide === `${s.campaign}:${i}:${shown.length}`) continue;
        s.drawnSlide = `${s.campaign}:${i}:${shown.length}`;
        const g = s.face.canvas.getContext('2d'), W = s.face.canvas.width, H = s.face.canvas.height;
        g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
        const img = shown[i], k = Math.min(W / img.width, H / img.height);
        g.drawImage(img, (W - img.width * k) / 2, (H - img.height * k) / 2, img.width * k, img.height * k);
      } else s.face.draw(s.phase);
      s.face.texture.needsUpdate = true;
    }
  }

  return { group, update, show, stats, boards: all, screens, dispose() { scene.remove(group); } };
}
