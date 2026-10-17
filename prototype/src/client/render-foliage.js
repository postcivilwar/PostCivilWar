// Leaves as leaves are: the crowns of the town's broadleaf trees and the fronds of its palms (render-world.js,
// addTree), drawn from pictures of leaves with the air between them, not as solid shapes.
//
//   - A broadleaf crown is many small sprays of leaves (cards: a picture of a spray, the gaps in it see-through),
//     set round the crown's shape at every angle. Each spray is lit as if it were part of a round crown, not as the
//     flat card it is, so that the crown is light on top and toward the sun and dark beneath and inside; a card is
//     drawn from both sides with that same light, so that it never shows its back as a dark patch. The mango's sprays
//     are its long dark leaves, in a dense dome; the tropical almond's its broad paler leaves, in its flat tiers.
//   - A palm frond is its ribbon with a picture of a rib and its leaflets, the air between them see-through, lit on
//     whichever side is seen as a leaf is (its top toward the sky, its underside dark).
//   - The leaves move in the wind a little, the tips more than the heart, each tree a moment apart from the next.
//   - Their shadows are the shapes of the leaves, moving with them, not of the cards.
//
// The pictures are drawn here, once, on a canvas: nothing is fetched. Built in squares of ground like the rest of
// the town (render-kit.js, Chunked), so that what is out of sight is not drawn.

import { linear, noise, isLite } from './render-kit.js';

const SIZE = 125;

// ---------------------------------------------------------------------------------------------- the pictures --

// The pictures, two to a sheet so that a square of ground draws all its leaves in two goes, not four: the mango's and
// the almond's sprays side by side on one, the coconut palm's and the oil palm's fronds on the other. Where each is on
// its sheet (`u0` to `u1` across it):
const PICTURES = Object.freeze({
  mango: { sheet: 'spray', u0: 0, u1: 0.5 }, almond: { sheet: 'spray', u0: 0.5, u1: 1 },
  frond: { sheet: 'frond', u0: 0, u1: 0.5 }, oilfrond: { sheet: 'frond', u0: 0.5, u1: 1 },
});
function sheet(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.clearRect(0, 0, w, h);
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
  return t;
}
// (each picture kept inside its own part of the sheet, a few pixels in from its edge)
function within(g, x, y, w, h, draw) { g.save(); g.beginPath(); g.rect(x + 3, y + 3, w - 6, h - 6); g.clip(); g.translate(x, y); draw(); g.restore(); }

// A spray of leaves, W across: along twigs from the middle of the card outward, and in a rosette at the end of each.
// `long` and `wide`: the leaf's shape, as parts of the card (a mango's long and narrow, an almond's broad and rounded
// at its tip). Grey to white, to be coloured by the tree's own green; the midrib a little darker.
function drawSpray(g, W, { twigs = 7, perTwig = 7, long = 0.2, wide = 0.05, round = 0, seed = 0 } = {}) {
  const leaf = (x, y, a, L, Wd, shade) => {
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = `rgb(${shade},${shade},${shade})`;
    // from its stalk at (0, 0) to its tip at (L, 0): widest a third of the way along (or, `round`, near the tip)
    const at = L * (0.35 + 0.3 * round);
    g.beginPath(); g.moveTo(0, 0);
    g.bezierCurveTo(at * 0.6, -Wd, at + (L - at) * 0.5, -Wd * (0.9 + round * 0.3), L, 0);
    g.bezierCurveTo(at + (L - at) * 0.5, Wd * (0.9 + round * 0.3), at * 0.6, Wd, 0, 0);
    g.fill();
    g.strokeStyle = 'rgba(70,70,70,0.5)'; g.lineWidth = Math.max(1, Wd * 0.14);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(L * 0.94, 0); g.stroke();
    g.restore();
  };
  for (let t = 0; t < twigs; t += 1) {
    const r = (k) => noise(t * 7.3 + seed, k * 3.1 + seed * 0.7);
    const a = (t / twigs) * Math.PI * 2 + (r(1) - 0.5) * 0.7, reach = (0.3 + r(2) * 0.14) * W;
    const ex = W / 2 + Math.cos(a) * reach, ey = W / 2 + Math.sin(a) * reach;
    // (the twig itself is hidden by its leaves: only they are drawn)
    for (let k = 0; k < perTwig; k += 1) {
      const q = (j) => noise(t * 13.1 + k * 5.7 + seed, j * 2.3);
      const along = k / perTwig, side = k % 2 ? 1 : -1, end = k >= perTwig - 3;
      const x = W / 2 + (ex - W / 2) * (end ? 1 : 0.25 + along * 0.7), y = W / 2 + (ey - W / 2) * (end ? 1 : 0.25 + along * 0.7);
      const turn = end ? a + (k - perTwig + 2) * 0.75 + (q(1) - 0.5) * 0.4 : a + side * (0.7 + q(2) * 0.5);
      const L = long * (0.75 + q(3) * 0.5) * W, Wd = wide * (0.8 + q(4) * 0.4) * W;
      leaf(x, y, turn, L, Wd, Math.round(150 + q(5) * 105));
    }
  }
}
// A palm frond's leaflets, W across and H long: its rib down the middle (its tip at the top), the leaflets either
// side reaching out and forward toward the tip, longest in the frond's middle.
function drawFrond(g, W, H, { seed = 0, stiff = 0 } = {}) {
  const rib = W / 2;
  for (let y = 10; y < H - 6; y += 4) {
    const t = y / H, reach = (W / 2 - 4) * Math.pow(Math.sin(Math.PI * Math.min(1, 0.08 + t * 0.95)), 0.55);
    for (const side of [-1, 1]) {
      const shade = Math.round(165 + noise(y + seed, side + 5) * 90);
      const forward = (10 + noise(y, side + 9 + seed) * 14) * (1 - stiff * 0.6);
      g.strokeStyle = `rgb(${shade},${shade},${shade})`; g.lineWidth = 3.4 + noise(y, side + 2) * 1.4;
      g.beginPath(); g.moveTo(rib, y); g.quadraticCurveTo(rib + side * reach * 0.55, y - forward * 0.25, rib + side * reach, y - forward); g.stroke();
    }
  }
  g.fillStyle = 'rgb(170,160,120)'; g.fillRect(rib - 2, 0, 4, H);
}
const sprays = () => sheet(512, 256, (g) => {
  within(g, 0, 0, 256, 256, () => drawSpray(g, 256, { twigs: 7, perTwig: 8, long: 0.19, wide: 0.045, seed: 1 }));
  within(g, 256, 0, 256, 256, () => drawSpray(g, 256, { twigs: 6, perTwig: 6, long: 0.17, wide: 0.075, round: 1, seed: 2 }));
});
const fronds = () => sheet(256, 512, (g) => {
  within(g, 0, 0, 128, 512, () => drawFrond(g, 128, 512, { seed: 0 }));
  within(g, 128, 0, 128, 512, () => drawFrond(g, 128, 512, { seed: 3, stiff: 1 }));
});

// ---------------------------------------------------------------------------------------------- the builder --

// Positions, normals, picture coordinates and colours, grown as leaves are added.
class Leaves {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; }
  vertex(x, y, z, nx, ny, nz, u, v, col) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(u, v); this.c.push(col.r, col.g, col.b); }
  get triangles() { return this.p.length / 9; }
  build(material) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    geo.computeBoundingSphere();
    this.p = this.n = this.uv = this.c = null;
    return new THREE.Mesh(geo, material);
  }
}

const FRONT = [0, 1, 2, 0, 2, 3], BACK = [0, 2, 1, 0, 3, 2], CORNER = [[0, 0], [1, 0], [1, 1], [0, 1]];

export class Foliage {
  constructor() { this.parts = new Map(); }       // `${sheet}:${square}` -> Leaves
  at(kind, x, z) {
    const key = `${kind}:${Math.floor(x / SIZE)},${Math.floor(z / SIZE)}`;
    let part = this.parts.get(key);
    if (!part) { part = new Leaves(); part.kind = kind; this.parts.set(key, part); }
    return part;
  }
  // One spray: a card `size` across centred at (x, y, z), turned `yaw` about the upright and tipped `tilt`, lit as
  // if its face looked along (nx, ny, nz) (outward from its crown's middle), from both sides. `kind`: which picture.
  spray(kind, x, y, z, size, yaw, tilt, nx, ny, nz, hex, shade = 1) {
    const pic = PICTURES[kind], part = this.at(pic.sheet, x, z), col = linear(hex).multiplyScalar(shade), du = pic.u1 - pic.u0;
    const h = size / 2, cy = Math.cos(yaw), sy = Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt);
    const ax = cy * h, az = -sy * h;                                   // across: level, turned by yaw
    const ux = sy * st * h, uy = ct * h, uz = cy * st * h;             // up: tipped by tilt
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const q = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => [x + ax * i + ux * j, y + uy * j, z + az * i + uz * j]);
    for (const order of [FRONT, BACK]) for (const k of order) part.vertex(q[k][0], q[k][1], q[k][2], nx, ny, nz, pic.u0 + CORNER[k][0] * du, CORNER[k][1], col);
  }
  // A palm frond: its ribbon (`points` along it from the crown, each with its left and right edges and how far along
  // it is), with the frond's picture along it; each piece lit by which way it faces.
  frond(kind, points, hex, shade = 1) {
    const [x0, , z0] = points[0].p;
    const pic = PICTURES[kind], part = this.at(pic.sheet, x0, z0), col = linear(hex).multiplyScalar(shade), du = pic.u1 - pic.u0;
    for (let i = 0; i + 1 < points.length; i += 1) {
      const a = points[i], b = points[i + 1];
      const q = [a.l, a.r, b.r, b.l], t = [[0, a.v], [1, a.v], [1, b.v], [0, b.v]];
      // its face's own normal (the side that is seen is lit as the side that faces the eye: see the material)
      const ex = q[1][0] - q[0][0], ey = q[1][1] - q[0][1], ez = q[1][2] - q[0][2];
      const fx = q[3][0] - q[0][0], fy = q[3][1] - q[0][1], fz = q[3][2] - q[0][2];
      let nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      for (const k of FRONT) part.vertex(q[k][0], q[k][1], q[k][2], nx, ny, nz, pic.u0 + t[k][0] * du, t[k][1], col);
    }
  }
  get empty() { return this.parts.size === 0; }
  get triangles() { let n = 0; for (const part of this.parts.values()) n += part.triangles; return n; }
  // One mesh for each sheet of leaves in each square (sprays, fronds), each casting the shadow of its leaves.
  build(materials = foliageMaterials()) {
    return [...this.parts.values()].map((part) => {
      const material = materials[part.kind];
      const mesh = part.build(material);
      mesh.name = `leaves-${part.kind}`;
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.customDepthMaterial = material.userData.depth;
      return mesh;
    });
  }
}

// ---------------------------------------------------------------------------------------------- the trees --

// A palm frond as it grows (its rib rising from the crown and drooping at the tip), turned `a` about the upright at
// (x, y, z): the points along it, each with its left and right edges, for Foliage.frond.
export function frondPoints(x, y, z, a, length, width, rise, droop) {
  const steps = 7, out = [];
  const at = (t) => ({ r: length * t * (1 - 0.2 * t), y: rise * t - droop * t * t, w: width * Math.pow(Math.sin(Math.PI * (0.1 + 0.88 * t)), 0.6) });
  const ca = Math.cos(a), sa = Math.sin(a);
  const world = (lx, ly, lz) => [x + lx * ca + lz * sa, y + ly, z - lx * sa + lz * ca];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps, p = at(t);
    // (the leaflets hang a little either side of the rib, so the frond is a shallow V, not flat)
    out.push({ p: world(0, p.y, p.r), l: world(-p.w, p.y - p.w * 0.3, p.r), r: world(p.w, p.y - p.w * 0.3, p.r), v: t });
  }
  return out;
}

// A round crown of sprays: `count` of them over the outside of an ellipsoid (radius `rx` across, `ry` up) centred at
// (x, y, z), most on its upper part, each lit as if the crown were round, and darker underneath and further in.
export function crown(foliage, kind, x, y, z, rx, ry, count, size, colours, jitter, { from = 0.62, under = 1.75 } = {}) {
  for (let i = 0; i < count; i += 1) {
    const u = jitter(i * 3 + 1), v = jitter(i * 3 + 2), w = jitter(i * 3 + 3);
    const theta = u * Math.PI * 2, cosPhi = 1 - under * v;            // (from the top down to a little below the middle)
    const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi)), shell = from + (1 - from) * w;
    const dx = sinPhi * Math.cos(theta), dy = cosPhi, dz = sinPhi * Math.sin(theta);
    const nx = dx / rx, ny = dy / ry, nz = dz / rx, nl = Math.hypot(nx, ny, nz) || 1;
    const shade = (0.86 + jitter(i * 3 + 43) * 0.24) * (0.8 + 0.2 * shell) * (0.82 + 0.18 * (dy + 1) / 2);
    foliage.spray(kind, x + dx * rx * shell, y + dy * ry * shell, z + dz * rx * shell, size * (0.8 + 0.45 * jitter(i * 3 + 40)),
      theta + (jitter(i * 3 + 41) - 0.5) * 1.6, (jitter(i * 3 + 42) - 0.5) * 1.3,
      nx / nl, ny / nl * 0.8 + 0.2, nz / nl, colours[i % colours.length], shade);
  }
}

// The leaves of one tree, `t` (render-world.js addTree has drawn its trunk and branches): `s` its size, `jitter` its
// own numbers, `top` where its trunk ends.
export function treeLeaves(foliage, t, s, jitter, top) {
  if (t.kind === 'palm') {
    // coconut palm: long arching fronds, a few rising, most hanging
    for (let i = 0; i < 15; i += 1) {
      const a = t.turn + (i * Math.PI * 2) / 15 + jitter(i) * 0.3, up = i % 3 === 0;
      foliage.frond('frond', frondPoints(top.x, top.y - 0.05, t.z, a, (3.5 + jitter(i + 20) * 0.9) * s, 0.66 * s, (up ? 1.9 : 0.75) * s, (up ? 1.7 : 2.5) * s), i % 2 ? 0x5f9038 : 0x72a344, 0.86 + jitter(i + 40) * 0.24);
    }
  } else if (t.kind === 'oilpalm') {
    // oil palm: a full round head of stiffer fronds in three tiers, the lowest hanging
    for (let i = 0; i < 21; i += 1) {
      const a = t.turn + (i * Math.PI * 2) / 21 + jitter(i) * 0.25, tier = i % 3;
      foliage.frond('oilfrond', frondPoints(t.x, top.y - 0.1, t.z, a, (3.0 + jitter(i + 9) * 0.6) * s, 0.58 * s, [2.1, 1.1, 0.3][tier] * s, [1.4, 1.9, 2.2][tier] * s), [0x4a7f36, 0x55903f, 0x426f31][tier], 0.88 + jitter(i + 30) * 0.22);
    }
  } else if (t.kind === 'mango') {
    // a dense dome of long dark leaves: an outer shell, and a smaller one inside it so that it is not hollow
    crown(foliage, 'mango', t.x, 4.6 * s, t.z, 3.0 * s, 2.35 * s, 96, 1.55 * s, [0x2f6b34, 0x377a3a, 0x2b6130, 0x3d8040], jitter, { under: 1.85 });
    crown(foliage, 'mango', t.x, 4.5 * s, t.z, 1.9 * s, 1.5 * s, 30, 1.45 * s, [0x285c2c, 0x2f6b34], (k) => jitter(k + 500), { from: 0.3 });
  } else {
    // tropical almond: flat tiers of broad leaves on its level branches, widest at the bottom
    [[2.9, 3.0], [2.3, 4.0], [1.6, 4.9], [0.9, 5.6]].forEach(([r, y], tier) => {
      const n = Math.round(9 + r * 6);
      for (let k = 0; k < n; k += 1) {
        const j = (m) => jitter(tier * 50 + k * 7 + m);
        const a = t.turn + tier + (k / n) * Math.PI * 2 + j(0) * 0.4, d = r * s * (0.3 + 0.7 * Math.sqrt(j(1)));
        // (lying nearly level, each tipped a little, and lit as the tier's top and its rim are)
        foliage.spray('almond', t.x + Math.cos(a) * d, y * s + (j(2) - 0.5) * 0.35 * s, t.z + Math.sin(a) * d, (1.25 + j(3) * 0.5) * s,
          -a, Math.PI / 2 - 0.22 + (j(4) - 0.5) * 0.5, Math.cos(a) * 0.35 * d / (r * s), 0.95, Math.sin(a) * 0.35 * d / (r * s),
          [0x4f8c3c, 0x5a9a44, 0x66a84c, 0x5a9a44][tier], (0.86 + j(5) * 0.24) * (0.9 + 0.1 * tier / 3));
      }
    });
  }
}

// A low shrub of the same leaves as the mango's: a small round crown standing on the ground at (x, y, z).
export function bush(foliage, x, y, z, r, jitter, colours = [0x3f7a35, 0x4d8a3c, 0x447f38]) {
  crown(foliage, 'mango', x, y + r * 0.75, z, r, r * 0.8, 9, r * 0.95, colours, jitter, { from: 0.35, under: 1.6 });
}

// ---------------------------------------------------------------------------------------------- the materials --

// The wind: every leaf moves with it a little, the tips of a frond and the top of a crown more than the rest, now and
// then in a gust, each tree a moment apart from the next. One clock for all of them (`setWind`).
const wind = { value: 0 };
export const setWind = (seconds) => { wind.value = seconds % 3600; };
// (the tests: the wind's clock, and which kinds of leaf there are)
export const foliageState = () => ({ wind: wind.value, kinds: made ? Object.keys(made) : [] });
function sway(material, kind) {
  const frond = kind === 'frond';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = wind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        float phase = transformed.x * 0.21 + transformed.z * 0.17;
        float gust = 0.6 + 0.4 * sin(uWind * 0.23 + phase * 0.05);
        ${frond ? 'float flex = uv.y * uv.y * 0.16;' : 'float flex = clamp((transformed.y - 2.0) / 7.0, 0.0, 1.0) * 0.05;'}
        transformed.x += (sin(uWind * 1.3 + phase) + 0.3 * sin(uWind * 3.1 + phase * 3.0)) * flex * gust;
        transformed.z += cos(uWind * 1.1 + phase * 1.3) * flex * 0.8 * gust;
        transformed.y += sin(uWind * 1.7 + phase * 2.0) * flex * 0.35 * gust;
      }`);
  };
  material.customProgramCacheKey = () => `pcw-leaves-${frond ? 'frond' : 'spray'}`;
  return material;
}

let made = null;
export function foliageMaterials() {
  if (made) return made;
  const pictures = { spray: sprays(), frond: fronds() };
  made = {};
  const lite = isLite();
  for (const [kind, map] of Object.entries(pictures)) {
    const frond = kind === 'frond';
    const cut = frond ? 0.35 : 0.42;
    // (a spray is drawn from both sides by its own two faces, each lit as the crown is; a frond from both sides of
    // its one face, its underside dark as a leaf's is). Matte, lit at its corners: a leaf has no gloss to speak of
    // from where it is seen, and a gloss worked out from the crown's light rather than the card's own face turned a
    // card white seen from beneath it.
    const m = sway(new THREE.MeshLambertMaterial({ map, vertexColors: true, alphaTest: cut, alphaToCoverage: !lite, side: frond ? THREE.DoubleSide : THREE.FrontSide }), kind);
    m.userData.depth = sway(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: cut }), kind);
    made[kind] = m;
  }
  return made;
}
