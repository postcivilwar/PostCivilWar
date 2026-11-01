// Oganiru City, drawn (31 October 2026, the owner's brief for the new city with flyovers: Stage 1, the sample). What it
// is and where: src/sim/zones/oganiru.js. Drawn from the same data the town keeps to, so that what is seen is what is
// solid: every kerb, strip and walkway from the boxes the town stands people on, every deck from the line its road
// follows and the heights along it, every pillar where the town has one.
//
//   - The ground: the land round the city flat, red earth along the roads' verges, rising to bush hills beyond its fence.
//   - The roads: tar with its grain, its patches and cracks, darker where the wheels run; lanes, edge lines, zebra
//     crossings and stop lines in white; black-and-white kerbs a metre a block, worn; grass middle strips raised behind
//     them; paved walkways; the Gate Roundabout with its island; drains at the kerb.
//   - The decks (the flyovers, the raised expressway, its ramps and loops): the road on them with its joints, concrete
//     walls 1.1 m high with drain spouts and the stains under them, a barrier down the middle of the expressway and the
//     Independence Flyover, the slab and its girders underneath, pillars with wide caps, embankments between retaining
//     walls where a deck is too low to pass under, lamps under the decks that light the road at night.
//   - The slim trees down Unity Avenue's middle strip: the habitation's slim tree (from its owner's file, unchanged),
//     each copy its own height and turn, its leaves moving in the wind (more in a storm); further off, its picture.
//     Shade trees along the verges, as the town's.
//   - Six towers: glass and stone, each its own; lobbies of glass with canopies and steps, shops at the foot with made-up
//     names; at night their windows lit, more in the evening and fewer late, the tallest crowns lit.
//   - Traffic signals at the junctions, the road signs, the green gantries over the expressway.
// The street lamps are render-lamps.js's (they can be knocked down); the roadblocks and the fence, render-closures.js's.
//
// Built a piece a frame (`oganiruSteps`, a generator, as the land beyond the town is), on a phone only when the player
// is coming near it, and let go again when they are far.
import { OGANIRU, OGANIRU_ROADS, OGANIRU_DECKS, OGANIRU_KERBED, OGANIRU_MEDIAN_GAPS, OGANIRU_TOWERS, OGANIRU_TREES, OGANIRU_PILLARS, OGANIRU_SIGNALS, OGANIRU_SIGNS, OGANIRU_AREAS, EXPRESSWAY_Z, oganiruAway, ZONE, signalState } from '../sim/zone.js';
import { Batch, place, linear, noise, smoothNoise, grassTexture, textTexture, surface, buildingKit, letGoOnceSent } from './render-kit.js';
import { addTree, CITY_FLAT } from './render-world.js';
import { Foliage, foliageMaterials } from './render-foliage.js';
import { reflects, weathers } from './render-finish.js';
import { isRoad } from './world-shading.js';
import { LIGHT } from './light.js';
import { programsReady } from './program-ready.js';
import { HABITATION_MODELS, ofOganiru } from '../sim/zone.js';
import { buildClosures } from './render-closures.js';

const D = OGANIRU.deck;
const GATE = Object.freeze({ x: 0, z: -560, island: 13, outer: 22, walk: 3.5 });
const KERB = OGANIRU.kerb;
const ROAD_Y = 0.005;          // the tar's top (the ground under it a little lower)
const PAINT_Y = 0.013;          // the markings on it
const DECK_LIFT = 0.012;        // a deck's road drawn this much over where it lies on the ground (a ramp's foot)
const GRASS = 0x55803a;
const TT = 12;                  // metres of road to the tar's picture
const TAR = 0x4b4b50, TAR_WORN = 0x444449, PATCH = 0x58585d, LINE = 0xece9df, CONCRETE = 0xc2bdb1, CONCRETE_DARK = 0xa59f92, KERB_WHITE = 0xe8e6df, KERB_BLACK = 0x1f2022;

// ------------------------------------------------------------------------------------------- pictures --
function canvasOf(size, paint, repeat = true) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  paint(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  if (repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const rnd = (i, k) => noise(i * 1.37 + k * 17.1, k * 3.7 + i * 0.13);
// Tar: its grit, light and dark stones in it, a few cracks and a patch or two, near-white so the colour of each surface
// tints it (8 m to the picture).
function asphaltTexture(size) {
  return canvasOf(size, (g, n) => {
    const img = g.createImageData(n, n);
    for (let y = 0; y < n; y += 1) for (let x = 0; x < n; x += 1) {
      const big = smoothNoise((x / n) * 6, (y / n) * 6), mid = smoothNoise((x / n) * 40, (y / n) * 40);
      const grit = noise(x * 1.7, y * 2.3);
      let v = 0.8 + big * 0.07 + mid * 0.06 + (grit - 0.5) * 0.22;
      if (grit > 0.965) v += 0.16; else if (grit < 0.03) v -= 0.16;
      const k = (y * n + x) * 4, c = Math.max(0, Math.min(255, Math.round(255 * v)));
      img.data[k] = c; img.data[k + 1] = c; img.data[k + 2] = Math.min(255, c + 3); img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // patches: a rectangle laid later, a little darker or lighter, its edge a line of tar
    for (let i = 0; i < 2; i += 1) {
      const w = n * (0.12 + rnd(i, 1) * 0.2), h = n * (0.08 + rnd(i, 2) * 0.16), x = rnd(i, 3) * (n - w), y = rnd(i, 4) * (n - h);
      g.fillStyle = rnd(i, 5) > 0.5 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.03)'; g.fillRect(x, y, w, h);
      g.strokeStyle = 'rgba(0,0,0,0.13)'; g.lineWidth = Math.max(1, n / 768); g.strokeRect(x, y, w, h);
    }
    // cracks: thin, wandering, darker
    g.strokeStyle = 'rgba(0,0,0,0.42)';
    for (let i = 0; i < 7; i += 1) {
      g.lineWidth = Math.max(1, (n / 1024) * (1 + rnd(i, 9)));
      let x = rnd(i, 6) * n, y = rnd(i, 7) * n, a = rnd(i, 8) * Math.PI * 2;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 14; k += 1) { a += (rnd(i * 31 + k, 10) - 0.5) * 1.2; x += Math.cos(a) * n * 0.018; y += Math.sin(a) * n * 0.018; g.lineTo(x, y); }
      g.stroke();
    }
  });
}
// Concrete: its pour lines, its grain, the darker streaks the rain leaves down it (6 m to the picture).
function concreteTexture(size) {
  return canvasOf(size, (g, n) => {
    const img = g.createImageData(n, n);
    for (let y = 0; y < n; y += 1) for (let x = 0; x < n; x += 1) {
      const v = 0.86 + smoothNoise((x / n) * 8, (y / n) * 8) * 0.07 + (noise(x * 2.1, y * 1.3) - 0.5) * 0.08;
      const k = (y * n + x) * 4, c = Math.round(255 * Math.min(1, v));
      img.data[k] = c; img.data[k + 1] = c; img.data[k + 2] = c; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.strokeStyle = 'rgba(0,0,0,0.09)'; g.lineWidth = Math.max(1, n / 512);
    for (let k = 1; k < 5; k += 1) { g.beginPath(); g.moveTo(0, (k * n) / 5); g.lineTo(n, (k * n) / 5); g.stroke(); }
    // the streaks: from the top down, fading (the picture's top is v = 1, high up a wall)
    for (let i = 0; i < 26; i += 1) {
      const x = rnd(i, 11) * n, w = n * (0.006 + rnd(i, 12) * 0.02), len = n * (0.15 + rnd(i, 13) * 0.6), y0 = rnd(i, 14) * n * 0.3;
      const grad = g.createLinearGradient(0, y0, 0, y0 + len);
      grad.addColorStop(0, `rgba(40,36,30,${0.18 + rnd(i, 15) * 0.2})`); grad.addColorStop(1, 'rgba(40,36,30,0)');
      g.fillStyle = grad; g.fillRect(x, y0, w, len);
      g.fillRect(x - n, y0, w, len);
    }
  });
}
// The underside of a deck: cast concrete, the lines of its shuttering, damp blotches (6 m to the picture).
function soffitTexture(size) {
  return canvasOf(size, (g, n) => {
    const img = g.createImageData(n, n);
    for (let y = 0; y < n; y += 1) for (let x = 0; x < n; x += 1) {
      const v = 0.8 + smoothNoise((x / n) * 5, (y / n) * 5) * 0.1 - Math.max(0, smoothNoise((x / n) * 3 + 7, (y / n) * 3) - 0.6) * 0.35 + (noise(x * 1.9, y * 2.2) - 0.5) * 0.05;
      const k = (y * n + x) * 4, c = Math.round(255 * Math.max(0, Math.min(1, v)));
      img.data[k] = c; img.data[k + 1] = c; img.data[k + 2] = Math.max(0, c - 4); img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = Math.max(1, n / 400);
    for (let k = 1; k < 4; k += 1) { g.beginPath(); g.moveTo((k * n) / 4, 0); g.lineTo((k * n) / 4, n); g.stroke(); }
  });
}
// A tower's lobby: two storeys of glass in light frames, 2 m panes (8 m to the picture); `lit`: the panes alone,
// white, where its light shows at night.
function lobbyTexture(size, lit = false) {
  return canvasOf(size, (g, n) => {
    const m = n / 8;
    g.fillStyle = lit ? '#000' : '#c9cdd0'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 4; i += 1) for (const [y0, y1] of [[0.6, 3.7], [3.85, 7.0]]) {
      // (the picture's top is high up: y in metres from the foot is (8 - y) down it)
      const top = n - y1 * m, h = (y1 - y0) * m;
      if (lit) { g.fillStyle = y0 < 1 ? '#fff4e0' : '#d8cdb8'; g.fillRect(i * 2 * m + m * 0.06, top, 2 * m - m * 0.12, h); continue; }
      const grad = g.createLinearGradient(0, top, 0, top + h);
      grad.addColorStop(0, '#5d7487'); grad.addColorStop(0.6, '#3e5160'); grad.addColorStop(1, '#2f3b45');
      g.fillStyle = grad; g.fillRect(i * 2 * m + m * 0.06, top, 2 * m - m * 0.12, h);
    }
  });
}
// Pavers: square concrete slabs, 40 cm, each its own shade, joints between (2 m to the picture).
function paverTexture(size) {
  return canvasOf(size, (g, n) => {
    const cells = 5, c = n / cells;
    g.fillStyle = '#9a958b'; g.fillRect(0, 0, n, n);
    for (let j = 0; j < cells; j += 1) for (let i = 0; i < cells; i += 1) {
      const v = 205 + Math.round((rnd(i * 7 + j, 21) - 0.5) * 30);
      g.fillStyle = `rgb(${v},${v - 3},${v - 9})`;
      g.fillRect(i * c + c * 0.04, j * c + c * 0.04, c * 0.92, c * 0.92);
    }
  });
}
// A tower's walls, as a picture of 9 bays by 4 storeys (14.4 m each way), near-white where the material's own colour
// shows through. `kind`: which wall.
const FACADES = {
  'glass-blue': { frame: '#c9d2da', glass: [62, 108, 150], spandrel: null, ribs: 0, punched: false },
  'glass-grey': { frame: '#8c9399', glass: [92, 102, 112], spandrel: null, ribs: 0, punched: false },
  'office-teal': { frame: '#dfe5e6', glass: [52, 120, 122], spandrel: '#e8ecea', ribs: 0, punched: false },
  round: { frame: '#d8dde0', glass: [84, 126, 160], spandrel: '#e2e5e6', ribs: 0, punched: false },
  'ribbed-white': { frame: '#f1efe9', glass: [70, 84, 96], spandrel: '#f1efe9', ribs: 1, punched: true },
  stone: { frame: '#cdbb9b', glass: [58, 70, 78], spandrel: '#c4b190', ribs: 0, punched: true },
};
const BAYS = 9, STOREYS_IN = 4, TILE = 14.4;
function facadeTexture(kind, size) {
  const f = FACADES[kind];
  return canvasOf(size, (g, n) => {
    g.fillStyle = f.frame; g.fillRect(0, 0, n, n);
    const bw = n / BAYS, sh = n / STOREYS_IN;
    for (let j = 0; j < STOREYS_IN; j += 1) for (let i = 0; i < BAYS; i += 1) {
      const k = 0.82 + rnd(i * 11 + j, 31) * 0.3;
      const [r, gg, b] = f.glass.map((c) => Math.round(Math.min(255, c * k)));
      g.fillStyle = `rgb(${r},${gg},${b})`;
      if (f.punched) {
        // windows set in a solid wall; on the ribbed tower, a pier between every two
        const wide = f.ribs && i % 2 ? 0.5 : 0.62;
        g.fillRect(i * bw + bw * (1 - wide) / 2, j * sh + sh * 0.2, bw * wide, sh * 0.6);
      } else {
        // a curtain wall: glass from floor to floor, thin mullions, a band at each floor (or a spandrel panel)
        g.fillRect(i * bw + bw * 0.04, j * sh + sh * 0.06, bw * 0.92, sh * (f.spandrel ? 0.62 : 0.86));
        if (f.spandrel) { g.fillStyle = f.spandrel; g.fillRect(i * bw, j * sh + sh * 0.7, bw, sh * 0.3); }
      }
    }
  });
}
// Which windows are lit at night: in each a number (green) by which one comes on sooner or later in the evening (the
// tower's shader lights those under the share for the hour), where its glass is (red).
function litTexture(punched, size) {
  return canvasOf(size, (g, n) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, n, n);
    const bw = n / BAYS, sh = n / STOREYS_IN;
    for (let j = 0; j < STOREYS_IN; j += 1) for (let i = 0; i < BAYS; i += 1) {
      const order = Math.round(rnd(i * 13 + j * 5, 41) * 255), warm = 170 + Math.round(rnd(i, j + 50) * 85);
      g.fillStyle = `rgb(${warm},${order},0)`;
      if (punched) g.fillRect(i * bw + bw * 0.22, j * sh + sh * 0.22, bw * 0.56, sh * 0.56);
      else g.fillRect(i * bw + bw * 0.06, j * sh + sh * 0.08, bw * 0.88, sh * 0.6);
    }
  }, true);
}

// ------------------------------------------------------------------------------------- building shapes --
// Triangles for one material, gathered and made into one mesh: every face its own normal (or the shape's own), its
// colour, and where its picture lies.
class Mesher {
  constructor() { this.p = []; this.n = []; this.c = []; this.u = []; }
  get empty() { return this.p.length === 0; }
  vert(x, y, z, nx, ny, nz, col, u, v) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(col.r, col.g, col.b); this.u.push(u, v); }
  // a four-sided face a b c d (each [x, y, z]), facing `facing` ([x, y, z]; its corners put round the other way if it
  // would face away), with its picture's corners (`uv`: four [u, v])
  quad(a, b, c, d, col, uv = Q_UV, facing = null) {
    // (its normal across its diagonals: right for a face of three corners, one given twice, too)
    const ux = c[0] - a[0], uy = c[1] - a[1], uz = c[2] - a[2], vx = d[0] - b[0], vy = d[1] - b[1], vz = d[2] - b[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    if (facing && nx * facing[0] + ny * facing[1] + nz * facing[2] < 0) { this.quad(a, d, c, b, col, [uv[0], uv[3], uv[2], uv[1]], null); return; }
    const C = col.isColor ? col : linear(col);
    this.vert(...a, nx, ny, nz, C, ...uv[0]); this.vert(...b, nx, ny, nz, C, ...uv[1]); this.vert(...c, nx, ny, nz, C, ...uv[2]);
    this.vert(...a, nx, ny, nz, C, ...uv[0]); this.vert(...c, nx, ny, nz, C, ...uv[2]); this.vert(...d, nx, ny, nz, C, ...uv[3]);
  }
  // a shape from the library, placed by `matrix`, its picture laid as `mode` says ('wall': across x + z and up; 'plan':
  // across the ground; 'own': its own), `scale` metres to the picture
  geo(geometry, matrix, col, mode = 'wall', scale = 4) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    g.applyMatrix4(matrix);
    if (!g.attributes.normal) g.computeVertexNormals();
    const P = g.attributes.position.array, N = g.attributes.normal.array, T = g.attributes.uv ? g.attributes.uv.array : null;
    const C = col.isColor ? col : linear(col);
    for (let i = 0, k = 0; i < P.length; i += 3, k += 2) {
      const u = mode === 'plan' ? P[i] / scale : mode === 'own' && T ? T[k] : (P[i] + P[i + 2]) / scale;
      const v = mode === 'plan' ? P[i + 2] / scale : mode === 'own' && T ? T[k + 1] : P[i + 1] / scale;
      this.vert(P[i], P[i + 1], P[i + 2], N[i], N[i + 1], N[i + 2], C, u, v);
    }
    g.dispose(); geometry.dispose();
  }
  // a box w (x) by h by d (z), its middle at (x, y, z), turned `ry`: its picture laid as walls are
  box(w, h, d, x, y, z, col, ry = 0, mode = 'wall', scale = 4) { this.geo(new THREE.BoxGeometry(w, h, d), place(x, y, z, ry), col, mode, scale); }
  build(material, { shadows = true, receive = true } = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.computeBoundingSphere();
    letGoOnceSent(g);
    this.p = this.n = this.c = this.u = null;
    const mesh = new THREE.Mesh(g, material);
    mesh.castShadow = shadows; mesh.receiveShadow = receive;
    return mesh;
  }
}
const Q_UV = [[0, 0], [1, 0], [1, 1], [0, 1]];
const UP = [0, 1, 0], DOWN = [0, -1, 0];
const shade = (hex, k) => linear(hex).multiplyScalar(k);

// ------------------------------------------------------------------------------------------------ ground --
// The land drawn under and round the city: flat where the city is (and a little round it), rising to bush hills beyond
// its fence as the town's land does beyond the town (render-world.js). Where the town's ground or the land beyond the
// town is already drawn, nothing.
const TOWN_GROUND = { x0: -470, x1: 470, z0: -700 };
const OUTSKIRTS_GROUND = { x0: -1330, x1: -232, z0: -660 };
function landY(x, z) {
  const away = oganiruAway(x, z);
  if (away <= CITY_FLAT.flat) return -0.02;
  const b = ZONE.bounds;
  const outside = Math.max(b.minX - x, x - b.maxX, b.minZ - z, 0);
  const hill = Math.min(9, outside * 0.03) * smoothNoise(x / 60, z / 60);
  if (away >= CITY_FLAT.rise) return hill;
  const k = (away - CITY_FLAT.flat) / (CITY_FLAT.rise - CITY_FLAT.flat);
  return -0.12 + (hill + 0.12) * k * k * (3 - 2 * k);
}
function buildGround(lite) {
  const x0 = -760, x1 = 820, z0 = -1720, z1 = -478;
  const step = lite ? 14 : 9;
  const nx = Math.ceil((x1 - x0) / step), nz = Math.ceil((z1 - z0) / step);
  const pos = [], col = [], uv = [];
  const grassA = linear(0x5f9440), grassB = linear(0x8cb655), dry = linear(0xa9a85a), earth = linear(0xa0623a), c = new THREE.Color();
  const covered = (x, z) => (x > TOWN_GROUND.x0 && x < TOWN_GROUND.x1 && z > TOWN_GROUND.z0 && oganiruAway(x, z) > CITY_FLAT.flat - 2) || (x > OUTSKIRTS_GROUND.x0 && x < OUTSKIRTS_GROUND.x1 && z > OUTSKIRTS_GROUND.z0);
  const at = (i, j) => {
    const x = Math.min(x1, x0 + i * step), z = Math.min(z1, z0 + j * step);
    const patch = smoothNoise(x / 34, z / 34) * 0.65 + smoothNoise(x / 9, z / 9) * 0.35;
    c.copy(grassA).lerp(grassB, patch).lerp(dry, Math.max(0, smoothNoise(x / 55 + 9, z / 55) - 0.5) * 1.3);
    // red earth trodden along the roads' verges and round the decks' feet
    const away = oganiruAway(x, z);
    if (away < 1) { const nearRoad = roadEdgeNear(x, z); if (nearRoad < 7) c.lerp(earth, 0.55 * (1 - nearRoad / 7) + 0.1 * smoothNoise(x / 6, z / 6)); }
    return { x, y: landY(x, z), z, r: c.r, g: c.g, b: c.b };
  };
  const grid = [];
  for (let j = 0; j <= nz; j += 1) { const row = []; for (let i = 0; i <= nx; i += 1) row.push(at(i, j)); grid.push(row); }
  const put = (v) => { pos.push(v.x, v.y, v.z); col.push(v.r, v.g, v.b); uv.push(v.x / 3.2, v.z / 3.2); };
  for (let j = 0; j < nz; j += 1) for (let i = 0; i < nx; i += 1) {
    const a = grid[j][i], b = grid[j][i + 1], cc = grid[j + 1][i + 1], d = grid[j + 1][i];
    const mx = (a.x + cc.x) / 2, mz = (a.z + cc.z) / 2;
    if (covered(mx, mz)) continue;
    // (two triangles facing up: x north, z east)
    put(a); put(d); put(cc); put(a); put(cc); put(b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  letGoOnceSent(g);
  const map = grassTexture();
  map.repeat.set(1, 1);
  const mesh = new THREE.Mesh(g, surface({ vertexColors: true, map, roughness: 1, metalness: 0 }));
  mesh.receiveShadow = true;
  mesh.name = 'oganiru:ground';
  return mesh;
}
// how far a point is from the edge of the nearest road's tar (for the verges' red earth)
function roadEdgeNear(x, z) {
  let best = Infinity;
  for (const r of OGANIRU_ROADS) {
    const half = r.kind === 'approach' ? 10 : r.half;
    const across = r.along === 'z' ? Math.abs(x - r.c) : Math.abs(z - r.c), along = r.along === 'z' ? z : x;
    if (along < r.from - 3 || along > r.to + 3) continue;
    const edge = half + (r.walk || 0);
    if (across > edge) best = Math.min(best, across - edge);
    else best = 0;
  }
  return best;
}

// ------------------------------------------------------------------------------------------------- roads --
// The stretches of [a0, a1] where `open(at)` holds, looked at a metre at a time: [[from, to], ...].
function runsOf(a0, a1, open) {
  const out = [];
  let from = null;
  for (let a = a0; a < a1; a += 1) {
    const ok = open(a + 0.5);
    if (ok && from === null) from = a;
    if (!ok && from !== null) { out.push([from, a]); from = null; }
  }
  if (from !== null) out.push([from, a1]);
  return out;
}
function addRoads(M, lite) {
  const tar = (x0, z0, x1, z1, col = TAR, y = ROAD_Y) => M.tar.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], col, [[x0 / TT, z0 / TT], [x1 / TT, z0 / TT], [x1 / TT, z1 / TT], [x0 / TT, z1 / TT]], UP);
  const paint = (x0, z0, x1, z1, col = LINE) => M.paint.quad([x0, PAINT_Y, z0], [x1, PAINT_Y, z0], [x1, PAINT_Y, z1], [x0, PAINT_Y, z1], col, Q_UV, UP);
  // where a road's markings stop short of a junction or the roundabout
  const junctions = OGANIRU_ROADS.filter((r) => r.along === 'x').map((r) => ({ c: r.c, half: r.half }));
  const inJunction = (z, pad = 3) => junctions.some((j) => Math.abs(z - j.c) < j.half + pad) || OGANIRU_MEDIAN_GAPS.some((g) => g.why === 'u-turn' && z > g.from - 2 && z < g.to + 2);
  for (const r of OGANIRU_ROADS) {
    if (r.kind === 'approach') continue;
    const lo = r.c - r.half, hi = r.c + r.half;
    if (r.along === 'z') {
      tar(lo, r.from, hi, r.to);
      // the wheels' darker paths down each lane, and the markings: the edge lines, the line between the lanes
      for (const k of [-1, 1]) {
        const inner = r.c + k * (r.median / 2), outer = r.c + k * (r.half - 0.5);
        for (const lane of [inner + k * 1.75, inner + k * 5.25]) for (const w of [-0.85, 0.85]) {
          const x = lane + w;
          M.wear.quad([x - 0.28, ROAD_Y + 0.002, r.from], [x + 0.28, ROAD_Y + 0.002, r.from], [x + 0.28, ROAD_Y + 0.002, r.to], [x - 0.28, ROAD_Y + 0.002, r.to], TAR_WORN, [[(x - 0.28) / TT, r.from / TT], [(x + 0.28) / TT, r.from / TT], [(x + 0.28) / TT, r.to / TT], [(x - 0.28) / TT, r.to / TT]], UP);
        }
        for (const [z0, z1] of runsOf(r.from, r.to, (z) => !inJunction(z))) {
          paint(inner + k * 0.2 - 0.075, z0, inner + k * 0.2 + 0.075, z1);
          paint(outer - k * 0.15 - 0.075, z0, outer - k * 0.15 + 0.075, z1);
        }
        for (let z = r.from + 2; z < r.to - 3; z += 9) if (!inJunction(z + 1.5, 5)) paint(inner + k * 3.5 - 0.075, z, inner + k * 3.5 + 0.075, z + 3);
      }
    } else if (r.kind === 'flyover-road') {
      // the boulevard either side of its flyover; under the flyover, paving
      for (const k of [-1, 1]) {
        const z0 = r.c + k * (r.median / 2), z1 = r.c + k * r.half;
        tar(r.from, Math.min(z0, z1), r.to, Math.max(z0, z1));
        for (let x = r.from + 3; x < r.to - 3; x += 9) paint(x, (z0 + z1) / 2 - 0.075, x + 3, (z0 + z1) / 2 + 0.075);
      }
      M.pave.quad([r.from, ROAD_Y + 0.01, r.c - r.median / 2], [r.to, ROAD_Y + 0.01, r.c - r.median / 2], [r.to, ROAD_Y + 0.01, r.c + r.median / 2], [r.from, ROAD_Y + 0.01, r.c + r.median / 2], CONCRETE_DARK, [[r.from / 2, (r.c - 8) / 2], [r.to / 2, (r.c - 8) / 2], [r.to / 2, (r.c + 8) / 2], [r.from / 2, (r.c + 8) / 2]], UP);
      // (the mouth where it meets Unity Avenue's edge)
      const mouth = r.from > 0 ? [10, r.from] : [r.to, -10];
      tar(mouth[0], r.c - r.half, mouth[1], r.c + r.half);
    } else {
      tar(r.from, lo, r.to, hi);
      if (r.median > 0) {
        for (const k of [-1, 1]) {
          const inner = r.c + k * (r.median / 2), outer = r.c + k * (r.half - 0.5);
          paint(r.from, inner + k * 0.2 - 0.075, r.to, inner + k * 0.2 + 0.075); paint(r.from, outer - k * 0.15 - 0.075, r.to, outer - k * 0.15 + 0.075);
          for (let x = r.from + 2; x < r.to - 3; x += 9) paint(x, inner + k * 3.5 - 0.075, x + 3, inner + k * 3.5 + 0.075);
        }
      } else {
        // a street: a dashed line down its middle, edge lines
        for (let x = r.from + 3; x < r.to - 3; x += 6) paint(x, r.c - 0.075, x + 3, r.c + 0.075);
        for (const k of [-1, 1]) paint(r.from, r.c + k * (r.half - 0.5) - 0.075, r.to, r.c + k * (r.half - 0.5) + 0.075);
      }
    }
  }
  // College Road carried on, widening to the roundabout
  const flareHalf = (z) => { const t = Math.max(0, Math.min(1, (-505 - z) / (-505 - (GATE.z + GATE.outer)))); return 5 + 5 * t; };
  for (let z = -478.6; z > GATE.z + GATE.outer - 0.6; z -= 2) {
    const z1 = Math.max(GATE.z + GATE.outer - 0.6, z - 2);
    const h0 = flareHalf(z), h1 = flareHalf(z1);
    M.tar.quad([-h0, ROAD_Y, z], [h0, ROAD_Y, z], [h1, ROAD_Y, z1], [-h1, ROAD_Y, z1], TAR, [[-h0 / TT, z / TT], [h0 / TT, z / TT], [h1 / TT, z1 / TT], [-h1 / TT, z1 / TT]], UP);
  }
  for (let z = -481; z > GATE.z + GATE.outer + 4; z -= 9) {
    if (z < -505) break;
    paint(-0.075, z - 3, 0.075, z);
  }
  for (let z = -478.6; z > GATE.z + GATE.outer + 1; z -= 1) { const h0 = flareHalf(z) - 0.5; paint(-h0 - 0.075, z - 1, -h0 + 0.075, z); paint(h0 - 0.075, z - 1, h0 + 0.075, z); }
  // the roundabout: its ring of tar, the island's edge marked, the give-way lines where each road comes in
  {
    const seg = lite ? 48 : 72;
    for (let i = 0; i < seg; i += 1) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const P = (r, a, y = ROAD_Y) => [GATE.x + Math.sin(a) * r, y, GATE.z + Math.cos(a) * r];
      const p0 = P(GATE.island, a0), p1 = P(GATE.outer + 0.6, a0), p2 = P(GATE.outer + 0.6, a1), p3 = P(GATE.island, a1);
      M.tar.quad(p0, p1, p2, p3, TAR, [[p0[0] / TT, p0[2] / TT], [p1[0] / TT, p1[2] / TT], [p2[0] / TT, p2[2] / TT], [p3[0] / TT, p3[2] / TT]], UP);
      // the line between its two lanes, dashed
      if (i % 2 === 0) { const q0 = P(17.6, a0, PAINT_Y), q1 = P(17.75, a0, PAINT_Y), q2 = P(17.75, a1, PAINT_Y), q3 = P(17.6, a1, PAINT_Y); M.paint.quad(q0, q1, q2, q3, LINE, Q_UV, UP); }
    }
    // give way: a row of short white teeth across each way in, on the inside of the ring
    for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (let k = -8.5; k <= 8.5; k += 1.2) {
        const r0 = GATE.outer + 0.8, r1 = GATE.outer + 1.4;
        const cx = GATE.x + ax * r0 + az * k, cz = GATE.z + az * r0 + ax * k, ex = GATE.x + ax * r1 + az * k, ez = GATE.z + az * r1 + ax * k;
        const sx = az * 0.25, sz = ax * 0.25;
        M.paint.quad([cx - sx, PAINT_Y, cz - sz], [cx + sx, PAINT_Y, cz + sz], [ex + sx, PAINT_Y, ez + sz], [ex - sx, PAINT_Y, ez - sz], LINE, Q_UV, UP);
      }
    }
  }
  // zebra crossings and stop lines where the streets cross Unity Avenue, and across each street's mouth
  for (const j of OGANIRU_ROADS.filter((r) => r.kind === 'street' && r.from > 0)) {
    for (const k of [-1, 1]) {
      const zc = j.c + k * (j.half + 2.6);
      for (let x = -9.4; x < 9.6; x += 1) paint(x, zc - 2, x + 0.5, zc + 2);
      // (the stop line across the carriageway coming to it: west-bound on the avenue's north half, east-bound on its south)
      paint(k > 0 ? 2.7 : -9.6, zc + k * 2.6 - 0.2, k > 0 ? 9.6 : -2.7, zc + k * 2.6 + 0.2);
    }
    for (const k of [-1, 1]) {
      const xc = k * (10 + OGANIRU.walk + 2.5);
      for (let z = j.c - j.half + 0.6; z < j.c + j.half - 0.6; z += 1) paint(xc - 2, z, xc + 2, z + 0.5);
    }
  }
  // drains in the gutter along the kerbs: a grate every 25 m (a dark hole, its iron frame and five bars across it)
  for (const r of OGANIRU_ROADS.filter((q) => q.along === 'z' && q.kind === 'avenue')) {
    for (let z = r.from + 6; z < r.to - 6; z += 25) {
      if (inJunction(z, 5)) continue;
      for (const k of [-1, 1]) {
        const x = r.c + k * (r.half - 0.3);
        M.solid.box(0.45, 0.02, 0.9, x, ROAD_Y + 0.004, z, 0x141516);
        for (const s of [-1, 1]) { M.solid.box(0.45, 0.03, 0.05, x, ROAD_Y + 0.008, z + s * 0.425, 0x4a4b4e); M.solid.box(0.05, 0.03, 0.9, x + s * 0.2, ROAD_Y + 0.008, z, 0x4a4b4e); }
        for (let b = -2; b <= 2; b += 1) M.solid.box(0.4, 0.028, 0.035, x, ROAD_Y + 0.008, z + b * 0.15, 0x56575a);
      }
    }
  }
}

// ------------------------------------------------------------------------------- kerbs, strips, walkways --
function inGap(b, z) { return b.median === 'unity' && OGANIRU_MEDIAN_GAPS.some((g) => z >= g.from && z <= g.to); }
// the walkways cut where a street's mouth crosses them (oganiru.js crossingAt)
function walkCut(x, z) { for (const r of OGANIRU_ROADS) if (r.along === 'x' && Math.abs(z - r.c) <= r.half && Math.abs(x) < 10 + OGANIRU.walk + 0.5) return true; return false; }
// A run of black-and-white kerb, from (x0, z0) to (x1, z1), its face toward `out` ([x, z]): its top and its face, the
// blocks (a metre each, black and white, worn) a picture along it.
const KERB_TOP = KERB + 0.04;
function kerbRun(M, x0, z0, x1, z1, out) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  if (len < 0.3) return;
  const ox = out[0] * 0.11, oz = out[1] * 0.11, s0 = (Math.abs(x0) + Math.abs(z0)) % 32, s1 = s0 + len;
  const u0 = s0 / 32, u1 = s1 / 32;
  M.kerb.quad([x0 - ox, KERB_TOP, z0 - oz], [x1 - ox, KERB_TOP, z1 - oz], [x1 + ox, KERB_TOP, z1 + oz], [x0 + ox, KERB_TOP, z0 + oz], 0xffffff, [[u0, 0.9], [u1, 0.9], [u1, 1], [u0, 1]], UP);
  M.kerb.quad([x0 + ox, 0, z0 + oz], [x1 + ox, 0, z1 + oz], [x1 + ox, KERB_TOP, z1 + oz], [x0 + ox, KERB_TOP, z0 + oz], 0xffffff, [[u0, 0], [u1, 0], [u1, 0.85], [u0, 0.85]], [out[0], 0, out[1]]);
}
// The kerb's blocks: 32 a picture, black and white by turns, each worn its own way, darker at its foot.
function kerbTexture(size) {
  const c = document.createElement('canvas');
  c.width = size; c.height = 16;
  const g = c.getContext('2d');
  const bw = size / 32;
  for (let i = 0; i < 32; i += 1) {
    const black = i % 2 === 1, wear = rnd(i, 61);
    const v = black ? 30 + wear * 40 : 236 - wear * 46;
    g.fillStyle = `rgb(${v},${v},${v - (black ? 0 : 4)})`; g.fillRect(i * bw, 0, bw, 16);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(i * bw, 0, Math.max(1, bw * 0.03), 16);
    for (let k = 0; k < 6; k += 1) { g.fillStyle = black ? 'rgba(160,160,155,0.25)' : 'rgba(60,55,50,0.18)'; g.fillRect(i * bw + rnd(i * 7 + k, 62) * bw, rnd(i * 5 + k, 63) * 16, bw * 0.12, 2); }
  }
  const grad = g.createLinearGradient(0, 16, 0, 0); grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = grad; g.fillRect(0, 0, size, 16);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
function addKerbs(M) {
  for (const b of OGANIRU_KERBED) {
    const kind = b.median ? 'median' : b.walk ? 'walk' : 'plaza';
    const top = kind === 'plaza' ? KERB + 0.003 : KERB;
    const target = kind === 'median' ? M.grass : M.pave;
    // the box cut where the strip has a gap or the walkway a street's mouth: in metre steps along its length
    const alongZ = b.z1 - b.z0 >= b.x1 - b.x0;
    const a0 = alongZ ? b.z0 : b.x0, a1 = alongZ ? b.z1 : b.x1;
    const open = (a) => (alongZ ? inGap(b, a) || (kind === 'walk' && walkCut((b.x0 + b.x1) / 2, a)) : kind === 'walk' && walkCut(a, (b.z0 + b.z1) / 2));
    let runFrom = null;
    const runs = [];
    for (let a = a0; a <= a1 + 1e-6; a += 1) {
      const at = Math.min(a1, a);
      if (!open(at + 0.5) && at < a1) { if (runFrom === null) runFrom = at; } else if (runFrom !== null) { runs.push([runFrom, at]); runFrom = null; }
    }
    if (runFrom !== null) runs.push([runFrom, a1]);
    for (const [s0, s1] of runs) {
      const x0 = alongZ ? b.x0 : s0, x1 = alongZ ? b.x1 : s1, z0 = alongZ ? s0 : b.z0, z1 = alongZ ? s1 : b.z1;
      const sc = kind === 'median' ? 3.2 : 2;
      target.quad([x0, top, z0], [x1, top, z0], [x1, top, z1], [x0, top, z1], kind === 'median' ? shade(GRASS, 0.92 + rnd(Math.round(x0), Math.round(z0)) * 0.16) : kind === 'plaza' ? 0xf4f0e6 : 0xe6e2d8, [[x0 / sc, z0 / sc], [x1 / sc, z0 / sc], [x1 / sc, z1 / sc], [x0 / sc, z1 / sc]], UP);
      // its sides down to the road
      const side = (p, q, facing) => M.concrete.quad([p[0], 0, p[1]], [q[0], 0, q[1]], [q[0], top, q[1]], [p[0], top, p[1]], CONCRETE, Q_UV, facing);
      side([x0, z0], [x1, z0], [0, 0, -1]); side([x0, z1], [x1, z1], [0, 0, 1]); side([x0, z0], [x0, z1], [-1, 0, 0]); side([x1, z0], [x1, z1], [1, 0, 0]);
      // the kerbs: black and white down both long sides of a middle strip, and along the road's edge of a walkway
      if (kind === 'median') {
        if (alongZ) { kerbRun(M, x0, z0, x0, z1, [-1, 0]); kerbRun(M, x1, z0, x1, z1, [1, 0]); } else { kerbRun(M, x0, z0, x1, z0, [0, -1]); kerbRun(M, x0, z1, x1, z1, [0, 1]); }
      } else if (kind === 'walk') {
        // (the side nearer the road's middle)
        const road = OGANIRU_ROADS.find((r) => r.id === b.walk);
        if (road && road.along === 'z') { const near0 = Math.abs(x0 - road.c) < Math.abs(x1 - road.c); kerbRun(M, near0 ? x0 : x1, z0, near0 ? x0 : x1, z1, [near0 ? -1 : 1, 0]); }
        else if (road) { const near0 = Math.abs(z0 - road.c) < Math.abs(z1 - road.c); kerbRun(M, x0, near0 ? z0 : z1, x1, near0 ? z0 : z1, [0, near0 ? -1 : 1]); }
        else if (b.walk === 'unity-gate') { const near0 = Math.abs(x0) < Math.abs(x1); kerbRun(M, near0 ? x0 : x1, z0, near0 ? x0 : x1, z1, [near0 ? -1 : 1, 0]); }
      }
    }
  }
  // the roundabout's island: grass behind a black-and-white kerb, a low plinth with the city's name at its middle
  const seg = 56;
  for (let i = 0; i < seg; i += 1) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const P = (r, a, y) => [GATE.x + Math.sin(a) * r, y, GATE.z + Math.cos(a) * r];
    const c0 = P(0, a0, KERB), p0 = P(GATE.island, a0, KERB), p1 = P(GATE.island, a1, KERB);
    M.grass.quad(c0, p0, p1, c0, GRASS, [[c0[0] / 3.2, c0[2] / 3.2], [p0[0] / 3.2, p0[2] / 3.2], [p1[0] / 3.2, p1[2] / 3.2], [c0[0] / 3.2, c0[2] / 3.2]], UP);
    const k = i % 2 ? KERB_BLACK : KERB_WHITE;
    const m = (a0 + a1) / 2;
    M.solid.box(0.22, KERB + 0.04, (Math.PI * 2 * GATE.island) / seg - 0.03, GATE.x + Math.sin(m) * GATE.island, (KERB + 0.04) / 2, GATE.z + Math.cos(m) * GATE.island, k, m + Math.PI / 2);
    // the walkway ring, but where a road comes in
    const mouth = (a) => { const ax = Math.abs(Math.sin(a) * (GATE.outer + 2)), az = Math.abs(Math.cos(a) * (GATE.outer + 2)); return ax < 10.5 || az < 10.5; };
    if (!mouth(m)) {
      const w0 = P(GATE.outer, a0, KERB), w1 = P(GATE.outer + GATE.walk, a0, KERB), w2 = P(GATE.outer + GATE.walk, a1, KERB), w3 = P(GATE.outer, a1, KERB);
      M.pave.quad(w0, w1, w2, w3, 0xe6e2d8, [[w0[0] / 2, w0[2] / 2], [w1[0] / 2, w1[2] / 2], [w2[0] / 2, w2[2] / 2], [w3[0] / 2, w3[2] / 2]], UP);
      M.solid.box(0.22, KERB + 0.04, (Math.PI * 2 * GATE.outer) / seg - 0.03, GATE.x + Math.sin(m) * GATE.outer, (KERB + 0.04) / 2, GATE.z + Math.cos(m) * GATE.outer, k, m + Math.PI / 2);
    }
  }
  // the island's middle: a stepped plinth and a slim obelisk, the city's emblem (a rising sun's rays) round its foot
  M.concrete.box(7, 0.6, 7, GATE.x, KERB + 0.3, GATE.z, 0xd8d2c4);
  M.concrete.box(5, 0.6, 5, GATE.x, KERB + 0.9, GATE.z, 0xe2ddd0);
  M.concrete.geo(new THREE.CylinderGeometry(0.55, 1.1, 9, 4), place(GATE.x, KERB + 1.2 + 4.5, GATE.z, Math.PI / 4), 0xeee9dc);
  M.concrete.geo(new THREE.ConeGeometry(0.62, 1.4, 4), place(GATE.x, KERB + 1.2 + 9 + 0.7, GATE.z, Math.PI / 4), 0xd4b24a);
}

// ------------------------------------------------------------------------------------------------- decks --
// For each deck: the road on it (and where it lies on the ground, the road there), its joints, walls and drain spouts,
// the barrier down its middle, underneath it the slab and girders, its embankments between retaining walls where it is
// low, the faces at its ends; its pillars; the lamps under it.
function addDecks(M, lite, fixedLights) {
  for (const d of OGANIRU_DECKS) {
    const P = d.path, n = P.length, half = d.half;
    const ramp = d.id !== 'viaduct';
    const road = ramp ? M.rampTar : M.tar;
    const L = (p) => [p.uz, -p.ux];                     // the deck's left (oganiru.js: +d to the left)
    const at = (p, off, dy = 0) => { const [lx, lz] = L(p); return [p.x + lx * off, p.y + p.bank * off + dy, p.z + lz * off]; };
    const walled = (side, s) => (side > 0 ? d.walls.left : d.walls.right).some(([a, b]) => s >= a - 0.01 && s <= b + 0.01);
    const lift = (p) => (p.y < 0.35 ? DECK_LIFT : 0.004);
    const under = (p) => p.y - D.thick >= OGANIRU.under;   // high enough to pass under: on pillars
    const raised = (p) => p.y > 0.35;
    for (let i = 0; i < n - 1; i += 1) {
      const a = P[i], b = P[i + 1];
      // the road
      const ua = (u) => [u / TT, a.s / TT], ub = (u) => [u / TT, b.s / TT];
      road.quad(at(a, -half, lift(a)), at(b, -half, lift(b)), at(b, half, lift(b)), at(a, half, lift(a)), TAR, [ua(-half), ub(-half), ub(half), ua(half)], UP);
      for (const side of [-1, 1]) {
        const e = side * half, wa = walled(side, a.s), wb = walled(side, b.s);
        const out = (p) => { const [lx, lz] = L(p); return [lx * side, 0, lz * side]; };
        // the edge line, inside the wall
        if (raised(a) || d.kind !== 'ramp') M.paint.quad(at(a, side * (half - D.wallWidth - 0.35), lift(a) + 0.008), at(b, side * (half - D.wallWidth - 0.35), lift(b) + 0.008), at(b, side * (half - D.wallWidth - 0.2), lift(b) + 0.008), at(a, side * (half - D.wallWidth - 0.2), lift(a) + 0.008), LINE, Q_UV, UP);
        // the outer face: from the slab's underside (or the ground, an embankment's retaining wall) to the road, or the
        // wall's top where it has one
        if (raised(a) || raised(b)) {
          const bottomA = under(a) ? a.y - 1.0 : -0.05, bottomB = under(b) ? b.y - 1.0 : -0.05;
          const topA = wa ? D.wall : 0.05, topB = wb ? D.wall : 0.05;
          const pa0 = at(a, e), pb0 = at(b, e);
          const v = (y) => y / 6;
          M.concrete.quad([pa0[0], bottomA, pa0[2]], [pb0[0], bottomB, pb0[2]], [pb0[0], pb0[1] + topB, pb0[2]], [pa0[0], pa0[1] + topA, pa0[2]], CONCRETE, [[a.s / 6, v(bottomA)], [b.s / 6, v(bottomB)], [b.s / 6, v(pb0[1] + topB)], [a.s / 6, v(pa0[1] + topA)]], out(a));
          // the wall: its inner face and its top
          if (wa && wb) {
            const ia = at(a, side * (half - D.wallWidth)), ib = at(b, side * (half - D.wallWidth));
            M.concrete.quad([ia[0], ia[1], ia[2]], [ib[0], ib[1], ib[2]], [ib[0], ib[1] + D.wall, ib[2]], [ia[0], ia[1] + D.wall, ia[2]], 0xd2cdc2, [[a.s / 6, 0], [b.s / 6, 0], [b.s / 6, D.wall / 6], [a.s / 6, D.wall / 6]], [-out(a)[0], 0, -out(a)[2]]);
            M.concrete.quad([ia[0], ia[1] + D.wall, ia[2]], [ib[0], ib[1] + D.wall, ib[2]], [pb0[0], pb0[1] + D.wall, pb0[2]], [pa0[0], pa0[1] + D.wall, pa0[2]], 0xd8d3c8, [[a.s / 6, 0], [b.s / 6, 0], [b.s / 6, 0.08], [a.s / 6, 0.08]], UP);
          }
        }
      }
      // where an embankment ends and the deck goes on on pillars: its face across, under the deck
      if (raised(a) && raised(b) && under(a) !== under(b)) {
        const e = under(a) ? b : a, toward = under(a) ? -1 : 1;
        const l0 = at(e, -half), l1 = at(e, half);
        M.concrete.quad([l0[0], -0.05, l0[2]], [l1[0], -0.05, l1[2]], [l1[0], e.y - 0.45, l1[2]], [l0[0], e.y - 0.45, l0[2]], CONCRETE, [[-half / 6, 0], [half / 6, 0], [half / 6, e.y / 6], [-half / 6, e.y / 6]], [e.ux * toward, 0, e.uz * toward]);
      }
      // underneath: where it stands on pillars, the slab and its girders; where it is an embankment, nothing is seen
      if (under(a) && under(b)) {
        const slab = 0.45;
        const ya = a.y - slab, yb = b.y - slab;
        M.soffit.quad(at(a, -half, -slab), at(b, -half, -slab), at(b, half, -slab), at(a, half, -slab), CONCRETE_DARK, [[-half / 6, a.s / 6], [-half / 6, b.s / 6], [half / 6, b.s / 6], [half / 6, a.s / 6]], DOWN);
        // the girders: box beams the deck's length, a metre and a half deep
        const count = lite ? (half > 10 ? 4 : 2) : Math.max(2, Math.round((half * 2) / 3.6));
        for (let g = 0; g < count; g += 1) {
          const o = -half + 1 + ((half * 2 - 2) * (g + 0.5)) / count, w = Math.min(1.5, (half * 2 - 2) / count * 0.6);
          const deep = D.thick - slab;
          const A0 = at(a, o - w / 2, -slab - deep), A1 = at(a, o + w / 2, -slab - deep), B0 = at(b, o - w / 2, -slab - deep), B1 = at(b, o + w / 2, -slab - deep);
          M.soffit.quad(A0, B0, B1, A1, CONCRETE_DARK, [[o / 6, a.s / 6], [o / 6, b.s / 6], [(o + w) / 6, b.s / 6], [(o + w) / 6, a.s / 6]], DOWN);
          for (const s of [-1, 1]) {
            const ea = at(a, o + (s * w) / 2, -slab), eb = at(b, o + (s * w) / 2, -slab);
            const fa = at(a, o + (s * w) / 2, -slab - deep), fb = at(b, o + (s * w) / 2, -slab - deep);
            const [lx, lz] = L(a);
            M.under.quad(fa, fb, eb, ea, CONCRETE_DARK, [[a.s / 6, ya / 6 - 0.3], [b.s / 6, yb / 6 - 0.3], [b.s / 6, yb / 6], [a.s / 6, ya / 6]], [lx * s, 0, lz * s]);
          }
        }
      }
    }
    // the joints across the road every 30 m, and the drain spouts with the stains under them
    for (let s = 30; s < d.len - 5; s += 30) {
      const p = P.find((q) => q.s >= s);
      if (!p || !raised(p)) continue;
      const q = P[Math.min(n - 1, P.indexOf(p) + 1)];
      const ux = q.x - p.x, uz = q.z - p.z, l = Math.hypot(ux, uz) || 1, dx = (ux / l) * 0.09, dz = (uz / l) * 0.09;
      const l0 = at(p, -half + 0.5, 0.012), l1 = at(p, half - 0.5, 0.012);
      M.paint.quad([l0[0] - dx, l0[1], l0[2] - dz], [l1[0] - dx, l1[1], l1[2] - dz], [l1[0] + dx, l1[1], l1[2] + dz], [l0[0] + dx, l0[1], l0[2] + dz], 0x2b2b2e, Q_UV, UP);
    }
    if (!lite) for (let s = 12; s < d.len - 5; s += 20) {
      const p = P.find((q) => q.s >= s);
      if (!p || !under(p)) continue;
      for (const side of [-1, 1]) {
        const [lx, lz] = L(p);
        const e = at(p, side * (half + 0.18), -0.55);
        M.solid.geo(new THREE.CylinderGeometry(0.06, 0.06, 0.45, 8), place(e[0], e[1], e[2], 0, 1, 1, 1, Math.PI / 2, 0).premultiply(new THREE.Matrix4().makeRotationY(Math.atan2(lx * side, lz * side))).setPosition(e[0], e[1], e[2]), 0x6e6a62);
        // (the stain the water leaves down the face under it, to the face's foot: never hanging below it)
        const s0 = at(p, side * (half + 0.012), -0.6), drop = D.thick - 0.65;
        const ux = p.ux * 0.18, uz = p.uz * 0.18;
        M.stain.quad([s0[0] - ux, s0[1] - drop, s0[2] - uz], [s0[0] + ux, s0[1] - drop, s0[2] + uz], [s0[0] + ux, s0[1], s0[2] + uz], [s0[0] - ux, s0[1], s0[2] - uz], 0xffffff, [[0, 0], [1, 0], [1, 1], [0, 1]], [lx * side, 0, lz * side]);
      }
    }
    // the barrier down the middle (a concrete wall, wide at its foot, narrow at its top)
    if (d.barrier) for (let i = 0; i < n - 1; i += 1) {
      const a = P[i], b = P[i + 1];
      if (a.y < 0.35) continue;
      const prof = [[0.3, 0], [0.19, 0.28], [0.08, 0.82]];
      for (const side of [-1, 1]) for (let k = 0; k < prof.length - 1; k += 1) {
        const [o0, h0] = prof[k], [o1, h1] = prof[k + 1];
        const [lx, lz] = L(a);
        M.concrete.quad(at(a, side * o0, h0), at(b, side * o0, h0), at(b, side * o1, h1), at(a, side * o1, h1), 0xd6d1c6, [[a.s / 6, h0 / 6], [b.s / 6, h0 / 6], [b.s / 6, h1 / 6], [a.s / 6, h1 / 6]], [lx * side, 0.4, lz * side]);
      }
      M.concrete.quad(at(a, -0.08, 0.82), at(b, -0.08, 0.82), at(b, 0.08, 0.82), at(a, 0.08, 0.82), 0xdcd7cc, [[a.s / 6, 0.13], [b.s / 6, 0.13], [b.s / 6, 0.14], [a.s / 6, 0.14]], UP);
    }
    // where it ends in the air (the expressway beyond the interchange in this stage): its end face, a wall across it,
    // and the road works before it
    for (const end of d.closed) {
      const p = end === 'start' ? P[0] : P[n - 1];
      const inward = end === 'start' ? 1 : -1;
      const l0 = at(p, -half), l1 = at(p, half);
      M.concrete.quad([l0[0], p.y - D.thick, l0[2]], [l1[0], p.y - D.thick, l1[2]], [l1[0], p.y + D.wall, l1[2]], [l0[0], p.y + D.wall, l0[2]], CONCRETE, Q_UV, [-p.ux * inward, 0, -p.uz * inward]);
      M.concrete.quad([l0[0], p.y + D.wall, l0[2]], [l1[0], p.y + D.wall, l1[2]], [l1[0] + p.ux * inward * 0.5, p.y + D.wall, l1[2] + p.uz * inward * 0.5], [l0[0] + p.ux * inward * 0.5, p.y + D.wall, l0[2] + p.uz * inward * 0.5], CONCRETE, Q_UV, UP);
      for (let o = -half + 1.2; o < half - 1; o += 2.4) {
        const q = at(p, o);
        M.solid.box(1.9, 1.0, 0.22, q[0] + p.ux * inward * 6, q[1] + 0.5, q[2] + p.uz * inward * 6, (Math.round(o) % 2) ? 0xf2f0ea : 0xc8342b, Math.atan2(p.ux, p.uz) + Math.PI / 2);
        M.solid.geo(new THREE.ConeGeometry(0.25, 0.7, 10), place(q[0] + p.ux * inward * 11, q[1] + 0.35, q[2] + p.uz * inward * 11), 0xe0702a);
      }
    }
    // the lamps under it, over the road below, lit at night (render-lamps.js paints their light on the ground)
    for (let s = 8; s < d.len; s += 16) {
      const p = P.find((q) => q.s >= s);
      if (!p || !under(p)) continue;
      for (const side of d.half > 6 ? [-1, 1] : [0]) {
        const off = side * (half - 2.2);
        const q = at(p, off, -D.thick - 0.06);
        M.lit.box(0.7, 0.08, 0.28, q[0], q[1], q[2], 0xfff1c9, Math.atan2(p.ux, p.uz));
        fixedLights.push({ x: q[0], z: q[2], ground: 0, size: 9, region: 'city' });
      }
    }
  }
  // the pillars: a round column on a footing, a wide cap under the deck (the expressway's on two columns, a beam across)
  for (const p of OGANIRU_PILLARS) {
    const deck = OGANIRU_DECKS.find((d) => d.id === p.deck);
    const capH = 1.3, capW = p.deck === 'viaduct' ? 7.5 : Math.max(3, deck ? deck.half * 2 - 1.2 : 6);
    const segs = lite ? 12 : 20;
    M.pillar.geo(new THREE.CylinderGeometry(p.r, p.r * 1.06, p.top - capH, segs), place(p.x, (p.top - capH) / 2, p.z), CONCRETE, 'wall', 6);
    M.pillar.geo(new THREE.CylinderGeometry(p.r + 0.35, p.r + 0.45, 0.4, segs), place(p.x, 0.2, p.z), CONCRETE_DARK, 'wall', 6);
    // the cap: wide across the deck, tapering down to the column
    const cap = new THREE.CylinderGeometry(capW / 2, p.r * 1.3, capH, 4, 1);
    cap.rotateY(Math.PI / 4);
    M.pillar.geo(cap, place(p.x, p.top - capH / 2, p.z, p.heading, 1, 1, 1.8 / (capW * Math.SQRT1_2)), 0xccc7bb, 'wall', 6);
  }
  // the expressway's cross beams between its pairs of columns
  const pairs = new Map();
  for (const p of OGANIRU_PILLARS.filter((q) => q.deck === 'viaduct')) { const key = Math.round(p.x); if (!pairs.has(key)) pairs.set(key, []); pairs.get(key).push(p); }
  for (const [, two] of pairs) if (two.length === 2) {
    const [a, b] = two, top = Math.min(a.top, b.top);
    M.pillar.box(1.6, 1.3, Math.abs(a.z - b.z) + 2, (a.x + b.x) / 2, top - 0.65, (a.z + b.z) / 2, 0xccc7bb);
  }
}

// ------------------------------------------------------------------------------------------------ towers --
// Each tower: its walls from the lobby up (the picture of its kind, lit at night window by window), its crown (set back
// in steps, the tallest lit), its lobby of glass with a canopy and steps, its shops at the foot with their names.
function towerMaterial(kind, lite, textures) {
  const punched = FACADES[kind].punched;
  const glass = !punched;
  const m = surface({ map: textures.facade(kind), emissiveMap: textures.lit(punched), emissive: linear(0xffd59a), emissiveIntensity: 0, roughness: glass ? 0.14 : 0.62, metalness: glass ? 0.55 : 0.08 });
  if (glass) reflects(m, 0.9); else weathers(m, { darken: 0.15 });
  const lit = { value: 0.5 };
  m.userData.lit = lit;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uLit = lit;
    // a window is lit when its own number is under tonight's share: its glass (red) times whether it is on
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uLit;').replace('#include <emissivemap_fragment>', `#ifdef USE_EMISSIVEMAP
        vec4 litWin = texture2D(emissiveMap, vEmissiveMapUv);
        totalEmissiveRadiance *= litWin.r * step(litWin.g, uLit);
      #endif`);
  };
  m.customProgramCacheKey = () => 'pcw-tower-windows';
  return m;
}
function addTowers(group, lite, textures, signs, M) {
  const meshes = [], materials = new Map(), crowns = [];
  for (const t of OGANIRU_TOWERS) {
    if (!materials.has(t.kind)) materials.set(t.kind, towerMaterial(t.kind, lite, textures));
    const mat = materials.get(t.kind);
    const W = new Mesher();
    const lobby = 7.2, top = t.storeys * 3.6;
    const facing = t.x > 0 ? -1 : 1;              // the side toward Unity Avenue (its lobby faces the avenue)
    const bodyTop = top;
    const col = 0xffffff;
    if (t.kind === 'round') {
      const segs = lite ? 24 : 40, r = t.dx / 2;
      for (let i = 0; i < segs; i += 1) {
        const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
        const p0 = [t.x + Math.sin(a0) * r, lobby, t.z + Math.cos(a0) * r], p1 = [t.x + Math.sin(a1) * r, lobby, t.z + Math.cos(a1) * r];
        const u0 = (a0 * r) / TILE, u1 = (a1 * r) / TILE;
        W.quad(p0, p1, [p1[0], bodyTop, p1[2]], [p0[0], bodyTop, p0[2]], col, [[u0, lobby / TILE], [u1, lobby / TILE], [u1, bodyTop / TILE], [u0, bodyTop / TILE]], [Math.sin((a0 + a1) / 2), 0, Math.cos((a0 + a1) / 2)]);
      }
    } else {
      const x0 = t.x - t.dx / 2, x1 = t.x + t.dx / 2, z0 = t.z - t.dz / 2, z1 = t.z + t.dz / 2;
      const face = (a, b, out) => { const len = Math.hypot(b[0] - a[0], b[1] - a[1]); W.quad([a[0], lobby, a[1]], [b[0], lobby, b[1]], [b[0], bodyTop, b[1]], [a[0], bodyTop, a[1]], col, [[0, lobby / TILE], [len / TILE, lobby / TILE], [len / TILE, bodyTop / TILE], [0, bodyTop / TILE]], out); };
      face([x0, z0], [x1, z0], [0, 0, -1]); face([x1, z0], [x1, z1], [1, 0, 0]); face([x1, z1], [x0, z1], [0, 0, 1]); face([x0, z1], [x0, z0], [-1, 0, 0]);
    }
    const body = W.build(mat);
    body.name = `oganiru:${t.id}`;
    group.add(body); meshes.push(body);
    // the roof and the crown: stepped back, its own solid stuff (and on the stone one, a little pyramid of a top)
    const round = t.kind === 'round';
    const roofCol = t.kind === 'stone' ? 0xcdbb9b : t.kind === 'ribbed-white' ? 0xf1efe9 : 0x8a9096;
    if (round) M.solid.geo(new THREE.CylinderGeometry(t.dx / 2, t.dx / 2, 0.6, lite ? 24 : 40), place(t.x, top + 0.3, t.z), roofCol);
    else M.solid.box(t.dx + 0.4, 0.8, t.dz + 0.4, t.x, top + 0.4, t.z, roofCol);
    const crown = t.crown || 0;
    if (crown > 0) {
      const steps = t.kind === 'stone' ? 3 : 2;
      let y = top + 0.8;
      for (let k = 0; k < steps; k += 1) {
        const shrink = 0.72 - k * 0.18, h = (crown * (k === steps - 1 ? 0.5 : 0.25));
        const cw = (round ? t.dx : t.dx) * shrink, cd = (round ? t.dx : t.dz) * shrink;
        if (round) M.crownSolid.geo(new THREE.CylinderGeometry(cw / 2, cw / 2, h, lite ? 20 : 32), place(t.x, y + h / 2, t.z), roofCol);
        else M.crownSolid.box(cw, h, cd, t.x, y + h / 2, t.z, roofCol);
        y += h;
      }
      if (t.kind === 'stone') M.crownSolid.geo(new THREE.ConeGeometry(t.dx * 0.18, crown * 0.3, 4), place(t.x, y + crown * 0.15, t.z, Math.PI / 4), 0x6f8f7a);
      // the tallest: a lit band round the top of the crown
      if (t.storeys >= 30) crowns.push({ t, y: y - 0.6, w: (round ? t.dx : t.dx) * (0.72 - (steps - 1) * 0.18) + 0.1, d: (round ? t.dx : t.dz) * (0.72 - (steps - 1) * 0.18) + 0.1, round });
    }
    // rooftop plant: boxes and a water tank
    M.solid.box(4, 2.2, 3, t.x + 3, top + 0.8 + (crown > 0 ? 0 : 1.1), t.z - 4, 0x9a9da0);
    // the lobby: two storeys of clear glass set back a metre, columns, a canopy over the way in, steps up to it
    const lx = round ? t.dx / 2 - 1 : t.dx / 2 - 1, lz = round ? t.dx / 2 - 1 : t.dz / 2 - 1;
    if (round) M.lobby.geo(new THREE.CylinderGeometry(lx, lx, lobby, lite ? 24 : 40, 1, true), place(t.x, lobby / 2 + KERB, t.z), 0xffffff, 'wall', 8);
    else M.lobby.box(lx * 2, lobby, lz * 2, t.x, lobby / 2 + KERB, t.z, 0xffffff, 0, 'wall', 8);
    if (!round) for (const cx of [-1, 1]) for (const cz of [-1, 1]) M.solid.box(0.8, lobby, 0.8, t.x + cx * (t.dx / 2 - 0.4), lobby / 2 + KERB, t.z + cz * (t.dz / 2 - 0.4), 0xd9d6cf);
    // (the slab over the lobby, the tower's walls standing on it)
    if (round) M.solid.geo(new THREE.CylinderGeometry(t.dx / 2 + 0.15, t.dx / 2 + 0.15, 0.5, lite ? 24 : 40), place(t.x, lobby + KERB - 0.1, t.z), 0xd9d6cf);
    else M.solid.box(t.dx + 0.3, 0.5, t.dz + 0.3, t.x, lobby + KERB - 0.1, t.z, 0xd9d6cf);
    const front = t.x + facing * (round ? t.dx / 2 : t.dx / 2);
    M.solid.box(3.2, 0.25, 9, front + facing * 1.4, 4.4 + KERB, t.z, 0x2d3236);
    for (const [out, hk] of [[2.7, 0.15], [1.8, 0.3], [0.9, 0.45]]) M.concrete.box(out, hk, 8, front + facing * (out / 2), KERB + hk / 2, t.z, 0xd8d3c8);
    signs.push(signMesh([t.lobby], front + facing * 0.05 + facing * 2.95, 5.1 + KERB, t.z, facing > 0 ? Math.PI / 2 : -Math.PI / 2, 6.5, 0.55, ['#ffffff', 'rgba(20,24,28,0.92)']));
    // the shops at its foot, along the walkway beside the avenue: their names over their windows
    (t.shops || []).forEach((name, k) => {
      const z = t.z + (k === 0 ? -1 : 1) * (round ? t.dx * 0.28 : t.dz * 0.3);
      signs.push(signMesh([name.toUpperCase()], front + facing * 0.08, 3.3 + KERB, z, facing > 0 ? Math.PI / 2 : -Math.PI / 2, 5.2, 0.7, k === 0 ? ['#ffffff', '#1f5d3a'] : ['#1a1a1a', '#f2c200']));
      M.solid.box(0.6, 0.12, 5.6, front + facing * 0.5, 2.85 + KERB, z, k === 0 ? 0x1f5d3a : 0xc59b2a);
    });
  }
  // the lit bands round the tallest crowns
  const band = new Mesher();
  for (const c of crowns) {
    if (c.round) { const g = new THREE.CylinderGeometry(c.w / 2 + 0.05, c.w / 2 + 0.05, 0.5, 40, 1, true); band.geo(g, place(c.t.x, c.y, c.t.z), 0xfff4dc, 'own'); }
    else band.box(c.w, 0.5, c.d, c.t.x, c.y, c.t.z, 0xfff4dc);
  }
  const bandMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, color: linear(0xb9bcc0), emissive: linear(0xfff0d0), emissiveIntensity: 0, roughness: 0.6 });
  const bandMesh = band.empty ? null : band.build(bandMaterial, { shadows: false });
  if (bandMesh) { bandMesh.name = 'oganiru:crowns'; group.add(bandMesh); }
  return { meshes, materials: [...materials.values()], bandMaterial };
}

// A sign: a board with the text on it, standing `facing` (0: toward +z), its middle at (x, y, z).
let SIGN_WIDTH = 1024;
function signMesh(lines, x, y, z, facing, w, h, [fg, bg]) {
  const W = SIGN_WIDTH, k = W / 1024;
  const tex = textTexture(lines, { width: W, height: Math.max(Math.round(96 * k), Math.round(W * (h / w))), background: bg, colour: fg, size: Math.min(Math.round(110 * k), Math.round(760 * k * (h / w) / Math.max(1, lines.length))) });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.05 }));
  mesh.position.set(x, y, z);
  mesh.rotation.y = facing;
  mesh.name = 'oganiru:sign';
  return mesh;
}

// ------------------------------------------------------------------------------------- signals and signs --
function addSignals(M, lamps) {
  for (const s of OGANIRU_SIGNALS) {
    M.metal.geo(new THREE.CylinderGeometry(0.07, 0.09, 3.4, 10), place(s.x, KERB + 1.7, s.z), 0x2a2c30);
    const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
    const hx = s.x + fx * 0.12, hy = KERB + 2.9, hz = s.z + fz * 0.12;
    M.metal.box(0.34, 0.98, 0.26, hx, hy, hz, 0x1c1d20, s.heading);
    M.metal.box(0.5, 1.12, 0.03, hx - fx * 0.14, hy, hz - fz * 0.14, 0x111214, s.heading);
    [['red', 0.3], ['amber', 0], ['green', -0.3]].forEach(([colour, dy]) => {
      (lamps[colour][s.phase] = lamps[colour][s.phase] || []).push({ x: hx + fx * 0.135, y: hy + dy, z: hz + fz * 0.135, face: s.heading });
      M.metal.box(0.26, 0.03, 0.16, hx + fx * 0.2, hy + dy + 0.13, hz + fz * 0.2, 0x1c1d20, s.heading);
    });
  }
}
function addSigns(M, group, signs) {
  for (const s of OGANIRU_SIGNS) {
    const [fg, bg] = s.palette;
    if (s.gantry) {
      // a green sign on a steel frame over the expressway's carriageway, its legs on the deck's walls
      const deck = OGANIRU_DECKS.find((d) => d.id === 'viaduct');
      const y = OGANIRU.deck.level + D.wall;
      const across = s.across / 2 - 0.25;
      for (const k of [-1, 1]) M.metal.box(0.35, 7.2, 0.35, s.x, y + 3.6, EXPRESSWAY_Z + k * across, 0x7c8288);
      M.metal.box(0.5, 0.5, s.across - 0.3, s.x, y + 7.0, EXPRESSWAY_Z, 0x7c8288);
      M.metal.box(0.3, 0.3, s.across - 0.3, s.x, y + 6.2, EXPRESSWAY_Z, 0x7c8288);
      const sign = signMesh(s.lines, s.x + Math.sin(s.facing) * 0.3, y + 6.0, s.z, s.facing, s.width, s.height, [fg, bg]);
      signs.push(sign);
      void deck;
      continue;
    }
    // on two posts beside the road
    const w = s.width, h = s.height;
    for (const k of [-1, 1]) M.metal.box(0.1, h + 2.2, 0.1, s.x + Math.cos(s.facing) * k * (w / 2 - 0.3), (h + 2.2) / 2, s.z - Math.sin(s.facing) * k * (w / 2 - 0.3), 0x6d7177, s.facing);
    signs.push(signMesh(s.lines, s.x + Math.sin(s.facing) * 0.06, 2.2 + h / 2, s.z + Math.cos(s.facing) * 0.06, s.facing, w, h, [fg, bg]));
  }
}

// ------------------------------------------------------------------------------------------- the trees --
// (a page opened from the disk fetches no files, as the habitation's (render-habitation.js): the strip's trees are not
// drawn there; their trunks are solid all the same)
const ON_DISK = (() => { try { return location.protocol === 'file:'; } catch (error) { return false; } })();
// The slim trees down the middle strip: the habitation's slim tree, read from its file (the habitation's copy, made
// from its owner's model and unchanged), drawn as copies of it; further off, a picture of it on two crossed boards.
// (The reading of the model is the habitation's own code, in its script: `plants`, given once main.js has it.)
function createSlimTrees(group, { lite, fetchFile, renderer }) {
  const info = HABITATION_MODELS.slimtree || { unit: 1, base: [0, 0, 0] };
  const copies = OGANIRU_TREES.filter((t) => t.kind === 'slim').map((t, i) => {
    const height = 13.4 * t.size;
    const scale = height / info.unit;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.turn);
    const off = new THREE.Vector3(info.base[0] * scale, info.base[1] * scale, info.base[2] * scale).applyQuaternion(q);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(t.x - off.x, t.y - off.y - 0.05, t.z - off.z), q, new THREE.Vector3(scale, scale, scale));
    return { t, i, height, matrix: Float32Array.from(m.elements), x: t.x, z: t.z, y: t.y };
  });
  const state = { model: null, meshes: [], failed: null, pictures: new Map(), boards: null, amount: { value: 0.012 } };
  let P = null;
  const shared = (uri, colour) => {
    const { decodePicture, PICTURE_OPTIONS, letGoOnceDrawn, decodeAtMost } = P;
    if (!state.pictures.has(uri)) state.pictures.set(uri, (async () => {
      const res = await fetchFile(`habitation/${uri}`);
      if (!res.ok) throw new Error(`${uri}: ${res.status}`);
      const blob = await res.blob();
      const t = new THREE.Texture(await decodePicture(blob)); t.flipY = false; if (colour) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.needsUpdate = true;
      letGoOnceDrawn(t, (size) => decodeAtMost(blob, size, PICTURE_OPTIONS));
      return t;
    })());
    return state.pictures.get(uri);
  };
  const load = async () => {
    try {
      const res = await fetchFile(`habitation/slimtree.${lite ? 'lite' : 'full'}.glb`);
      if (!res.ok) throw new Error(`slimtree: ${res.status}`);
      const model = await P.readDressed(await res.arrayBuffer(), { lite, shared });
      if (state.disposed) { model.dispose(); return; }
      state.model = model;
      for (const part of model.parts) {
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, copies.length);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.castShadow = part.part !== 'inside'; mesh.receiveShadow = true;
        if (part.depth) mesh.customDepthMaterial = part.depth;
        mesh.frustumCulled = false; mesh.count = 0; mesh.name = `oganiru:slimtree:${part.part}`;
        // (the leaves move more in a storm: their reach set here, render-oganiru's own)
        if (part.part === 'leaves') { const before = part.material.onBeforeCompile; part.material.onBeforeCompile = (shader, r) => { before(shader, r); shader.uniforms.uAmount = state.amount; }; part.material.needsUpdate = true; }
        group.add(mesh);
        state.meshes.push(mesh);
      }
      if (renderer) state.boards = treeBoards(group, model, copies, renderer, lite);
    } catch (error) { state.failed = String(error && error.message || error); }
  };
  const frustum = new THREE.Frustum(), vp = new THREE.Matrix4(), sphere = new THREE.Sphere();
  const NEAR = lite ? 110 : 190, MOST = lite ? 18 : 60;
  let drawn = 0;
  function update(camera, storm) {
    state.amount.value = 0.012 * (1 + storm * 1.6);
    if (!state.meshes.length || !camera) return;
    camera.updateMatrixWorld();
    vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(vp);
    const ex = camera.position.x, ez = camera.position.z;
    const near = [];
    for (const c of copies) {
      const d = Math.hypot(c.x - ex, c.z - ez);
      sphere.center.set(c.x, c.y + c.height / 2, c.z); sphere.radius = c.height * 0.6 + 6;
      c.seen = frustum.intersectsSphere(sphere);
      c.d = d;
      if (d < NEAR && c.seen) near.push(c);
    }
    near.sort((a, b) => a.d - b.d);
    const chosen = near.slice(0, MOST);
    const set = new Set(chosen);
    chosen.forEach((c, n) => { for (const mesh of state.meshes) mesh.instanceMatrix.array.set(c.matrix, n * 16); });
    for (const mesh of state.meshes) { mesh.count = chosen.length; mesh.visible = chosen.length > 0; mesh.instanceMatrix.needsUpdate = true; }
    drawn = chosen.length;
    if (state.boards) state.boards.place(copies.filter((c) => !set.has(c) && c.seen && c.d < 700));
  }
  return {
    update,
    // the habitation's code for reading its plants, once main.js has it: the trees are read then
    use(plants) { if (P || !plants || state.disposed) return; P = plants; if (ON_DISK) { state.failed = 'opened from the disk'; return; } state.loading = load(); },
    get drawn() { return drawn; },
    get loaded() { return !!state.model; },
    get failed() { return state.failed; },
    count: copies.length,
    dispose() { state.disposed = true; for (const mesh of state.meshes) { group.remove(mesh); mesh.dispose(); } if (state.model) state.model.dispose(); if (state.boards) state.boards.dispose(); for (const p of state.pictures.values()) p.then((t) => t.dispose(), () => {}); state.pictures.clear(); },
  };
}
// A picture of the tree, taken once from its side against nothing, on two crossed boards for each tree far off.
function treeBoards(group, model, copies, renderer, lite) {
  const size = lite ? 128 : 256;
  const target = new THREE.WebGLRenderTarget(size, size * 2, { samples: 0 });
  target.texture.colorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const tree = model.make();
  scene.add(tree);
  // (lit as by day, in the game's units: light.js)
  scene.add(new THREE.AmbientLight(0xffffff, 0.45 * LIGHT));
  const sun = new THREE.DirectionalLight(0xffffff, 0.75 * LIGHT); sun.position.set(3, 6, 4); scene.add(sun);
  const box = model.box, h = box.max.y - box.min.y, w = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
  const cam = new THREE.OrthographicCamera(-w / 2 * 1.05, w / 2 * 1.05, h * 1.02, 0, -10, 10);
  cam.position.set((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2 + 5); cam.lookAt(cam.position.x, box.min.y, cam.position.z - 5);
  const was = renderer.getRenderTarget(), clear = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha();
  renderer.setRenderTarget(target); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, cam);
  renderer.setRenderTarget(was); renderer.setClearColor(clear, alpha);
  scene.remove(tree);
  const material = new THREE.MeshLambertMaterial({ map: target.texture, alphaTest: 0.45, side: THREE.DoubleSide });
  const plane = new THREE.PlaneGeometry(1, 2); plane.translate(0, 1, 0);
  const crossed = new THREE.BufferGeometry();
  const a = plane.clone(), b = plane.clone(); b.rotateY(Math.PI / 2);
  const merge = (gs) => { const pos = [], nrm = [], uv = [], idx = []; let base = 0; for (const g of gs) { pos.push(...g.attributes.position.array); nrm.push(...g.attributes.normal.array); uv.push(...g.attributes.uv.array); idx.push(...Array.from(g.index.array, (k) => k + base)); base += g.attributes.position.count; } crossed.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); crossed.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); crossed.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); crossed.setIndex(idx); };
  merge([a, b]);
  const mesh = new THREE.InstancedMesh(crossed, material, copies.length);
  mesh.frustumCulled = false; mesh.count = 0; mesh.name = 'oganiru:slimtree:boards';
  group.add(mesh);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), sc = new THREE.Vector3();
  return {
    place(list) {
      list.forEach((c, n) => { q.setFromAxisAngle(up, c.t.turn); const bw = c.height * (w / h) * 1.05; m4.compose(pos.set(c.x, c.y, c.z), q, sc.set(bw, c.height / 2, bw)); mesh.setMatrixAt(n, m4); });
      mesh.count = list.length; mesh.visible = list.length > 0; mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() { group.remove(mesh); mesh.dispose(); crossed.dispose(); material.dispose(); target.dispose(); },
  };
}

// --------------------------------------------------------------------------------------------- the whole --
// The steps that build the city: each a few milliseconds' work, `yield` between them (main.js runs one or a few a frame).
// At the end, what was built: { group, update, see, letGo, stats }.
export function* oganiruSteps(scene, { glowMaterial, lite = false, renderer = null, camera = null, fetchFile = (u) => fetch(u), lamps = null } = {}) {
  const group = new THREE.Group(); group.name = 'oganiru';
  // (a phone's signs at half the picture: it reads them from no nearer)
  SIGN_WIDTH = lite ? 512 : 1024;
  const size = lite ? 512 : 1024;
  const textures = {
    asphalt: asphaltTexture(size), concrete: concreteTexture(lite ? 256 : 512), soffit: soffitTexture(lite ? 128 : 256), lobby: lobbyTexture(lite ? 128 : 512), lobbyLit: lobbyTexture(lite ? 64 : 128, true), pavers: paverTexture(lite ? 128 : 256),
    facades: new Map(), lits: new Map(),
    facade(kind) { if (!this.facades.has(kind)) this.facades.set(kind, facadeTexture(kind, lite ? 256 : 1024)); return this.facades.get(kind); },
    lit(punched) { if (!this.lits.has(punched)) { const t = litTexture(punched, lite ? 128 : 256); t.colorSpace = THREE.NoColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; this.lits.set(punched, t); } return this.lits.get(punched); },
  };
  yield;
  const ground = buildGround(lite);
  group.add(ground);
  yield;
  const M = { soffit: new Mesher(), kerb: new Mesher(), tar: new Mesher(), rampTar: new Mesher(), wear: new Mesher(), paint: new Mesher(), grass: new Mesher(), pave: new Mesher(), concrete: new Mesher(), under: new Mesher(), stain: new Mesher(), pillar: new Mesher(), solid: new Mesher(), metal: new Mesher(), lit: new Mesher(), lobby: new Mesher(), crownSolid: new Mesher() };
  addRoads(M, lite);
  yield;
  addKerbs(M);
  yield;
  const fixedLights = [];
  addDecks(M, lite, fixedLights);
  yield;
  const signs = [];
  const towers = addTowers(group, lite, textures, signs, M);
  yield;
  const signalLamps = { red: [], amber: [], green: [] };
  addSignals(M, signalLamps);
  addSigns(M, group, signs);
  yield;
  // shade trees along the verges, as the town's own (render-world.js addTree)
  const shadeSolid = new Batch(), foliage = new Foliage();
  for (const t of OGANIRU_TREES.filter((q) => q.kind !== 'slim')) addTree(shadeSolid, foliage, { x: t.x, z: t.z, kind: t.kind, size: t.size, turn: t.turn });
  yield;

  // ---- materials ----
  const asphalt = isRoad(weathers(surface({ vertexColors: true, map: textures.asphalt, roughness: 0.93, metalness: 0 }), { darken: 0.42, gloss: 0.66, sheen: 1 }));
  textures.asphalt.repeat.set(1, 1);
  // (the ramps' road over the expressway's where they run into it: drawn over it)
  const rampAsphalt = isRoad(weathers(surface({ vertexColors: true, map: textures.asphalt, roughness: 0.93, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }), { darken: 0.42, gloss: 0.66, sheen: 1 }));
  const wear = isRoad(weathers(surface({ vertexColors: true, map: textures.asphalt, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), { darken: 0.42, gloss: 0.66, sheen: 1 }));
  const paint = weathers(surface({ vertexColors: true, roughness: 0.72, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), { darken: 0.2, gloss: 0.3 });
  const grass = surface({ vertexColors: true, map: grassTexture(), roughness: 0.95, metalness: 0 });
  const pave = weathers(surface({ vertexColors: true, map: textures.pavers, roughness: 0.82, metalness: 0 }), { darken: 0.25, gloss: 0.32, sheen: 0.25 });
  const concrete = weathers(surface({ vertexColors: true, map: textures.concrete, roughness: 0.9, metalness: 0 }), { darken: 0.18 });
  const stain = new THREE.MeshLambertMaterial({ color: linear(0x2d2a24), transparent: true, opacity: 0.28, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const metal = reflects(surface({ vertexColors: true, roughness: 0.45, metalness: 0.55 }), 0.6, 'metal');
  // (the lobbies' glass: dark by day, giving back the sky; lit warm from within at night)
  const lobbyGlass = reflects(new THREE.MeshStandardMaterial({ vertexColors: true, map: textures.lobby, emissiveMap: textures.lobbyLit, emissive: linear(0xffe2b0), emissiveIntensity: 0, roughness: 0.12, metalness: 0.35 }), 0.8);
  const kit = buildingKit();
  const add = (mesh, name, shadows = true) => { if (!mesh) return; mesh.name = `oganiru:${name}`; mesh.castShadow = shadows; group.add(mesh); };
  const build = (key, material, shadows = true) => { if (!M[key].empty) add(M[key].build(material, { shadows }), key, shadows); };
  build('tar', asphalt, false); yield;
  build('rampTar', rampAsphalt, true); yield;
  build('wear', wear, false);
  build('paint', paint, false); yield;
  const kerbMaterial = weathers(surface({ map: kerbTexture(lite ? 256 : 512), roughness: 0.8, metalness: 0 }), { darken: 0.2 });
  build('kerb', kerbMaterial, false);
  build('grass', grass, false);
  build('pave', pave, false); yield;
  build('concrete', concrete, true); yield;
  build('under', concrete, true);
  build('soffit', weathers(surface({ vertexColors: true, map: textures.soffit, roughness: 0.92, metalness: 0 }), { darken: 0.1 }), true);
  build('stain', stain, false);
  build('pillar', concrete, true); yield;
  build('solid', kit.solid, true);
  build('crownSolid', kit.solid, true);
  build('metal', metal, true);
  build('lit', glowMaterial || new THREE.MeshBasicMaterial({ color: 0xfff1c9 }), false);
  build('lobby', lobbyGlass, false); yield;
  if (!shadeSolid.empty) { const m = shadeSolid.build(kit.solid); m.castShadow = true; m.receiveShadow = true; m.name = 'oganiru:trunks'; group.add(m); }
  for (const mesh of foliage.build(foliageMaterials())) { mesh.name = 'oganiru:leaves'; group.add(mesh); }
  for (const s of signs) group.add(s);
  // the signal lamps: one mesh for each colour of each phase, lit by turns (as Market Road's: render-city.js)
  const disc = new THREE.CircleGeometry(0.105, 16);
  const COLOURS = { red: 0xff2a1a, amber: 0xffa31a, green: 0x2dff6a };
  const lampMeshes = [];
  for (const [colour, byPhase] of Object.entries(signalLamps)) byPhase.forEach((list, phase) => {
    if (!list || !list.length) return;
    const material = new THREE.MeshStandardMaterial({ color: linear(0x1a1a1a), emissive: linear(COLOURS[colour]), emissiveIntensity: 0, roughness: 0.3 });
    const mesh = new THREE.InstancedMesh(disc, material, list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ');
    list.forEach((l, i) => { e.set(0, l.face, 0); q.setFromEuler(e); m4.compose(new THREE.Vector3(l.x, l.y, l.z), q, new THREE.Vector3(1, 1, 1)); mesh.setMatrixAt(i, m4); });
    mesh.name = 'oganiru:signals';
    group.add(mesh);
    lampMeshes.push({ colour, phase, material });
  });
  yield;
  const trees = createSlimTrees(group, { lite, fetchFile, renderer });
  if (lamps) lamps.addFixed(fixedLights);
  // the roadblocks across the roads not built on yet, and the fence along the built land's edge: the city's own, with it
  // (render-closures.js; drawn from as far as the rest of the city, `see`)
  yield;
  const closures = buildClosures(group, { lite, keep: ofOganiru });
  // the programs it needs, made ready before it is put in (program-ready.js)
  if (renderer && camera) {
    yield;
    const ready = programsReady(renderer, group, camera, scene);
    while (!ready.step(6)) { if ((yield 'waiting') === 'now') break; }
  }
  scene.add(group);

  // what is drawn from where: each mesh by its distance (the ground and the roads always while the city is)
  const far = new Map();
  // (the roadblocks and the fence see to their own: each piece drawn within its own distance of the eye, render-closures.js)
  group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !o.geometry || o.name.startsWith('closures-')) return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    const s = o.geometry.boundingSphere;
    if (s && s.radius >= 0 && Number.isFinite(s.center.x)) far.set(o, s);
  });
  let clock = 0;
  function update(dt, { night = 0, hour = 12, camera: eye = null, storm = 0 } = {}) {
    clock += dt;
    for (const l of lampMeshes) l.material.emissiveIntensity = signalState(l.phase, clock) === l.colour ? 2.4 : 0;
    // the towers' windows: lit at night, more of them in the evening than late (`uLit`: the share lit)
    const h = ((hour % 24) + 24) % 24;
    // (from dusk about half of them, fewer as the night goes on, a few at four in the morning, more again before dawn)
    const share = h >= 18 ? 0.55 - (h - 18) * 0.05 : h < 5 ? 0.25 - h * 0.035 : h < 7 ? 0.12 + (h - 5) * 0.1 : 0.4;
    for (const m of towers.materials) { m.emissiveIntensity = night * 1.6; m.userData.lit.value = Math.max(0.08, share); }
    towers.bandMaterial.emissiveIntensity = night * 2.2;
    lobbyGlass.emissiveIntensity = night * 0.45;
    trees.update(eye, storm);
    closures.update(dt, night, eye ? eye.position : null);
  }
  // (`reach`: how far the eye sees from (x, z). The city's land beyond it, none of the city is drawn: its meshes are each
  // the whole city's of their kind, so that from the town, its frames as they were on a computer that has the city
  // built (1 November 2026: at the motor park 819 -> 888 draws a frame, the frame 6% to 20% longer, before this).
  // Gives whether it is drawn.)
  function see(x, z, reach) {
    const shown = oganiruAway(x, z) < reach;
    if (group.visible !== shown) group.visible = shown;
    if (!shown) return false;
    for (const [mesh, s] of far) {
      if (mesh.name === 'oganiru:ground' || mesh.name === 'oganiru:tar') { mesh.visible = true; continue; }
      const d = Math.hypot(s.center.x - x, s.center.z - z) - s.radius;
      // (the towers seen from further: they stand over everything)
      mesh.visible = d < (mesh.name.startsWith('oganiru:t') && mesh.name.length < 12 ? reach * 2.2 : reach);
    }
    return true;
  }
  // (shared with the town, and not let go with the city: the town's own materials, its leaves')
  const keep = new Set([glowMaterial, kit.solid, ...Object.values(foliageMaterials())]);
  function letGo() {
    scene.remove(group);
    trees.dispose();
    const disposed = new Set(), pictures = new Set();
    group.traverse((o) => {
      if (o.geometry && !disposed.has(o.geometry)) { disposed.add(o.geometry); o.geometry.dispose(); }
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) { if (keep.has(m) || disposed.has(m)) continue; disposed.add(m); for (const key of ['map', 'emissiveMap']) if (m[key]) pictures.add(m[key]); m.dispose(); }
    });
    for (const t of [...pictures, textures.asphalt, textures.concrete, textures.soffit, textures.lobby, textures.lobbyLit, textures.pavers, ...textures.facades.values(), ...textures.lits.values()]) t.dispose();
    if (lamps) lamps.dropFixed('city');
  }
  return { group, update, see, letGo, trees, stats: () => ({ meshes: far.size, trees: { drawn: trees.drawn, loaded: trees.loaded, failed: trees.failed, of: trees.count }, fixedLights: fixedLights.length }) };
}
