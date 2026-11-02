// Oganiru City, drawn (the owner's brief of 31 October 2026 for the new city with flyovers: Stage 1, the sample, 31
// October; Stage 2, the whole road network, 1 November). What it is and where: src/sim/zones/oganiru.js. Drawn from the
// same data the town keeps to, so that what is seen is what is solid: every kerb, strip and walkway from the boxes the
// town stands people on, every deck from the line its road follows and the heights along it, every pillar where the
// town has one.
//
//   - The ground: the land round the city flat, red earth along the roads' verges, rising to bush hills beyond its fence;
//     the expressway's cutting let down into it, between its retaining walls.
//   - The roads: tar with its grain, its patches and cracks, darker where the wheels run; lanes, edge lines, zebra
//     crossings, stop lines and turn arrows in white; black-and-white kerbs a metre a block, worn; grass middle strips
//     raised behind them; paved walkways; the roundabouts with their islands; drains at the kerb; the junctions.
//   - The decks (the flyovers, the raised expressway, its ramps and loops, the bridge): the road on them with its joints,
//     concrete walls 1.1 m high with drain spouts and the stains under them, a barrier down the middle of the expressway
//     and the flyovers, the slab and its girders underneath, pillars with wide caps, embankments between retaining walls
//     where a deck is too low to pass under, lamps under the decks that light the road at night.
//   - The slim trees down the middle strips: the habitation's slim tree (from its owner's file, unchanged), each copy its
//     own height and turn, its leaves moving in the wind (more in a storm); further off, its picture. Shade trees along
//     the verges, palms on the expressway's banks, as the town's.
//   - Six towers: glass and stone, each its own; lobbies of glass with canopies and steps, shops at the foot with made-up
//     names; at night their windows lit, more in the evening and fewer late, the tallest crowns lit.
//   - Traffic signals at the junctions, the road signs, the green gantries over the expressway.
// The street lamps are render-lamps.js's (they can be knocked down); the roadblocks and the fence, render-closures.js's.
//
// In pieces (Stage 2: the city is too big to be one thing on a phone): the land is cut into squares (`PIECE` m), each
// built by itself a few milliseconds a frame when the player comes near it and let go again when they are far; what
// is the whole city's (its pictures and materials, the slim trees, the signals' lamps, the roadblocks and the fence) is
// built once (`oganiruSteps`, a generator, as the land beyond the town is), on a phone only when the player is coming
// near the city, and let go again when they are far.
import { OGANIRU, OGANIRU_ROADS, OGANIRU_DECKS, OGANIRU_KERBED, OGANIRU_MEDIAN_GAPS, OGANIRU_TOWERS, OGANIRU_TREES, OGANIRU_PILLARS, OGANIRU_SIGNALS, OGANIRU_SIGNS, OGANIRU_JUNCTIONS, OGANIRU_ROUNDABOUTS, OGANIRU_CUTTING, OGANIRU_STOP_LINES, OGANIRU_PLACES, EXPRESSWAY_Z, oganiruAway, expresswayY, roadWidthAt, ZONE, signalState, HABITATION_MODELS, HABITATION, habitationGroundAt, ofOganiru } from '../sim/zone.js';
import { Batch, place, linear, noise, smoothNoise, grassTexture, surface, buildingKit, letGoOnceSent } from './render-kit.js';
import { Mesher, Q_UV } from './render-mesher.js';
import { letPaintedGo } from './painted.js';
import { addTree, CITY_FLAT } from './render-world.js';
import { Foliage, foliageMaterials } from './render-foliage.js';
import { reflects, weathers } from './render-finish.js';
import { isRoad } from './world-shading.js';
import { LIGHT } from './light.js';
import { programsReady } from './program-ready.js';
import { buildClosures } from './render-closures.js';

const D = OGANIRU.deck;
const CUT = OGANIRU.cutting;
const KERB = OGANIRU.kerb;
const ROAD_Y = 0.005;          // the tar's top (the ground under it a little lower)
const PAINT_Y = 0.013;          // the markings on it
const DECK_LIFT = 0.012;        // a deck's road drawn this much over where it lies on the ground (a ramp's foot)
const GRASS = 0x55803a;
const TT = 12;                  // metres of road to the tar's picture
const TAR = 0x4b4b50, TAR_WORN = 0x444449, LINE = 0xece9df, CONCRETE = 0xc2bdb1, CONCRETE_DARK = 0xa59f92, KERB_WHITE = 0xe8e6df, KERB_BLACK = 0x1f2022;
const EZ = EXPRESSWAY_Z;
const PEACE_X = OGANIRU_PLACES.PEACE_X;
// the expressway's three lanes each way, measured from its middle where the town's cars keep to them (oganiru.js,
// OGANIRU_TRAFFIC: 5, 8.5 and 12 m out): the solid lines at their edges, the broken lines between them, the wheels' wear
const EXPRESSWAY_LINES = Object.freeze({ lanes: [5, 8.5, 12], edges: [3.25, 13.75], between: [6.75, 10.25] });
// the ground under a point before any deck: the expressway's cutting below the land, the land itself
const inCut = (x, z) => x > OGANIRU_CUTTING.x0 && x < OGANIRU_CUTTING.x1 && Math.abs(z - EZ) <= CUT.wall;
const groundBelow = (x, z) => (inCut(x, z) ? expresswayY(x) : 0);

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

// ------------------------------------------------------------------------------------- building shapes --
// (Mesher, the triangles for one material made into one mesh: render-mesher.js)
const UP = [0, 1, 0], DOWN = [0, -1, 0];
const shade = (hex, k) => linear(hex).multiplyScalar(k);

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

// ------------------------------------------------------------------------------------------ the pieces --
// The squares the city is drawn in: each built when the player comes within `come` of it, let go beyond `go`.
export const PIECE = 320;
const T_X0 = -1510, T_Z0 = -1750, T_NX = 8, T_NZ = 6;
export const OGANIRU_TILES = Object.freeze(Array.from({ length: T_NX * T_NZ }, (_, k) => {
  const i = Math.floor(k / T_NZ), j = k % T_NZ;
  return Object.freeze({ key: `${i},${j}`, i, j, x0: T_X0 + i * PIECE, x1: T_X0 + (i + 1) * PIECE, z0: T_Z0 + j * PIECE, z1: T_Z0 + (j + 1) * PIECE });
}));
const inTile = (T, x, z) => x >= T.x0 && x < T.x1 && z >= T.z0 && z < T.z1;
const tileAway = (T, x, z) => Math.hypot(Math.max(T.x0 - x, 0, x - T.x1), Math.max(T.z0 - z, 0, z - T.z1));
// how near a piece must be for it to be built, and how far for it to be let go: a phone keeps the pieces round the
// player, a computer most of the city
const TILE_NEAR = Object.freeze({ lite: Object.freeze({ come: 360, go: 560 }), full: Object.freeze({ come: 820, go: 1150 }) });

// ------------------------------------------------------------------------------------------------ ground --
// The land drawn under and round the city: flat where the city is (and a little round it), rising to bush hills beyond
// its fence as the town's land does beyond the town (render-world.js). Where the town's ground or the land beyond the
// town is already drawn, nothing; where the expressway's cutting is, nothing (its walls and its road are drawn).
// (the town's ground stops at the habitation's edge: render-world.js, HABITATION_EDGE)
const TOWN_GROUND = { x0: -470, x1: HABITATION.bounds.x0, z0: -700 };
const OUTSKIRTS_GROUND = { x0: -1330, x1: -232, z0: -660 };
const GROUND = { x0: -1500, x1: 1040, z0: -1740, z1: -12 };
// (1 November 2026: the city's land since Stage 2 comes round north of the town, and the hills beyond its fence reached
// over the habitation's south end, round its boiling river: there, under the habitation's own ground, out of sight
// whenever that is drawn, and the land there whenever it is not)
const HAB = HABITATION.bounds;
const inHabitationLand = (x, z) => x > HAB.x0 - 1 && x < HAB.x1 + 1 && z > HAB.z0 - 1 && z < HAB.z1 + 1;
function landY(x, z) {
  const y = cityLandY(x, z);
  return inHabitationLand(x, z) ? Math.min(y, habitationGroundAt(x, z) - 0.6) : y;
}
function cityLandY(x, z) {
  const away = oganiruAway(x, z);
  if (away <= CITY_FLAT.flat) return -0.02;
  const b = ZONE.bounds;
  const outside = Math.max(b.minX - x, x - b.maxX, b.minZ - z, 0);
  const hill = Math.min(9, outside * 0.03) * smoothNoise(x / 60, z / 60);
  if (away >= CITY_FLAT.rise) return hill;
  const k = (away - CITY_FLAT.flat) / (CITY_FLAT.rise - CITY_FLAT.flat);
  return -0.12 + (hill + 0.12) * k * k * (3 - 2 * k);
}
const covered = (x, z) => (x > TOWN_GROUND.x0 && x < TOWN_GROUND.x1 && z > TOWN_GROUND.z0 && oganiruAway(x, z) > CITY_FLAT.flat - 2) || (x > OUTSKIRTS_GROUND.x0 && x < OUTSKIRTS_GROUND.x1 && z > OUTSKIRTS_GROUND.z0);
const cutOut = (x, z) => x > OGANIRU_CUTTING.x0 && x < OGANIRU_CUTTING.x1 && Math.abs(z - EZ) < CUT.wall + CUT.wallWidth;
// the coordinates of a grid from a0 to a1 every `step`, with `extra` lines in it
function gridLines(a0, a1, step, extra = []) {
  const out = [];
  for (let a = a0; a < a1 - 0.01; a += step) out.push(a);
  out.push(a1);
  for (const e of extra) if (e > a0 + 0.05 && e < a1 - 0.05) out.push(e);
  return [...new Set(out.map((v) => Math.round(v * 100) / 100))].sort((p, q) => p - q);
}
// how far a point is from the edge of the nearest road's tar (for the verges' red earth)
function roadEdgeNear(x, z) {
  let best = Infinity;
  for (const r of OGANIRU_ROADS) {
    const along = r.along === 'z' ? z : x;
    if (along < r.from - 3 || along > r.to + 3) continue;
    const w = roadWidthAt(r, along);
    const across = r.along === 'z' ? Math.abs(x - r.c) : Math.abs(z - r.c);
    const edge = w.half + (w.walk || 0);
    if (across > edge) best = Math.min(best, across - edge); else return 0;
  }
  return best;
}
function groundTile(T, lite) {
  const x0 = Math.max(T.x0, GROUND.x0), x1 = Math.min(T.x1, GROUND.x1), z0 = Math.max(T.z0, GROUND.z0), z1 = Math.min(T.z1, GROUND.z1);
  if (x1 <= x0 || z1 <= z0) return null;
  const step = lite ? 14 : 9;
  const xs = gridLines(x0, x1, step, [OGANIRU_CUTTING.x0, OGANIRU_CUTTING.x1]);
  const zs = gridLines(z0, z1, step, [EZ - CUT.wall - CUT.wallWidth, EZ + CUT.wall + CUT.wallWidth]);
  const pos = [], col = [], uv = [];
  const grassA = linear(0x5f9440), grassB = linear(0x8cb655), dry = linear(0xa9a85a), earth = linear(0xa0623a), c = new THREE.Color();
  const at = (x, z) => {
    const patch = smoothNoise(x / 34, z / 34) * 0.65 + smoothNoise(x / 9, z / 9) * 0.35;
    c.copy(grassA).lerp(grassB, patch).lerp(dry, Math.max(0, smoothNoise(x / 55 + 9, z / 55) - 0.5) * 1.3);
    // red earth trodden along the roads' verges
    if (oganiruAway(x, z) < 1) { const nearRoad = roadEdgeNear(x, z); if (nearRoad < 7) c.lerp(earth, 0.55 * (1 - nearRoad / 7) + 0.1 * smoothNoise(x / 6, z / 6)); }
    return { x, y: landY(x, z), z, r: c.r, g: c.g, b: c.b };
  };
  const grid = zs.map((z) => xs.map((x) => at(x, z)));
  const put = (v) => { pos.push(v.x, v.y, v.z); col.push(v.r, v.g, v.b); uv.push(v.x / 3.2, v.z / 3.2); };
  for (let j = 0; j < zs.length - 1; j += 1) for (let i = 0; i < xs.length - 1; i += 1) {
    const a = grid[j][i], b = grid[j][i + 1], cc = grid[j + 1][i + 1], d = grid[j + 1][i];
    const mx = (a.x + cc.x) / 2, mz = (a.z + cc.z) / 2;
    if (covered(mx, mz) || cutOut(mx, mz)) continue;
    // (two triangles facing up: x north, z east)
    put(a); put(d); put(cc); put(a); put(cc); put(b);
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  letGoOnceSent(g);
  return g;
}

// The land under the whole city, coarse, a little below its pieces' own ground and drawn with the same material: where a
// piece is not built yet (the player come there faster than it is built, or put there), the land is seen there, never the
// sky below the horizon (1 November 2026: a phone put down in the middle of the city saw a white plain for the seconds its
// pieces took). The same cells as the pieces' ground (none where the town's or the land beyond it is drawn, none over the
// expressway's cutting).
function baseGround(lite) {
  const step = lite ? 48 : 32;
  const xs = gridLines(GROUND.x0, GROUND.x1, step, [OGANIRU_CUTTING.x0, OGANIRU_CUTTING.x1, TOWN_GROUND.x0, TOWN_GROUND.x1, OUTSKIRTS_GROUND.x0, OUTSKIRTS_GROUND.x1]);
  const zs = gridLines(GROUND.z0, GROUND.z1, step, [EZ - CUT.wall - CUT.wallWidth, EZ + CUT.wall + CUT.wallWidth, TOWN_GROUND.z0, OUTSKIRTS_GROUND.z0]);
  const grassA = linear(0x5f9440), grassB = linear(0x8cb655), dry = linear(0xa9a85a), c = new THREE.Color();
  const at = (x, z) => {
    const patch = smoothNoise(x / 34, z / 34) * 0.65 + smoothNoise(x / 9, z / 9) * 0.35;
    c.copy(grassA).lerp(grassB, patch).lerp(dry, Math.max(0, smoothNoise(x / 55 + 9, z / 55) - 0.5) * 1.3);
    return { x, y: landY(x, z) - 0.45, z, r: c.r, g: c.g, b: c.b };
  };
  const grid = zs.map((z) => xs.map((x) => at(x, z)));
  const pos = [], col = [], uv = [];
  const put = (v) => { pos.push(v.x, v.y, v.z); col.push(v.r, v.g, v.b); uv.push(v.x / 3.2, v.z / 3.2); };
  for (let j = 0; j < zs.length - 1; j += 1) for (let i = 0; i < xs.length - 1; i += 1) {
    const a = grid[j][i], b = grid[j][i + 1], cc = grid[j + 1][i + 1], d = grid[j + 1][i];
    const mx = (a.x + cc.x) / 2, mz = (a.z + cc.z) / 2;
    if (covered(mx, mz) || cutOut(mx, mz)) continue;
    put(a); put(d); put(cc); put(a); put(cc); put(b);
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  letGoOnceSent(g);
  return g;
}

// ------------------------------------------------------------------------------------------------- roads --
// (a point `lat` metres across a road from its middle, `a` along it)
const Pt = (r, lat, a) => (r.along === 'z' ? [r.c + lat, a] : [a, r.c + lat]);
// a flat quad on a road, `lat0`..`lat1` across it and `a0`..`a1` along it, at height y
function flat(Mx, r, lat0, lat1, a0, a1, y, col, scale = TT) {
  const [x00, z00] = Pt(r, lat0, a0), [x10, z10] = Pt(r, lat1, a0), [x11, z11] = Pt(r, lat1, a1), [x01, z01] = Pt(r, lat0, a1);
  Mx.quad([x00, y, z00], [x10, y, z10], [x11, y, z11], [x01, y, z01], col, [[x00 / scale, z00 / scale], [x10 / scale, z10 / scale], [x11 / scale, z11 / scale], [x01 / scale, z01 / scale]], UP);
}
// a quad between two cross-sections (a road narrowing or opening out): lat ranges [l0a, l1a] at a0 and [l0b, l1b] at a1
function trapezoid(Mx, r, l0a, l1a, l0b, l1b, a0, a1, y, col, scale = TT) {
  const [x00, z00] = Pt(r, l0a, a0), [x10, z10] = Pt(r, l1a, a0), [x11, z11] = Pt(r, l1b, a1), [x01, z01] = Pt(r, l0b, a1);
  Mx.quad([x00, y, z00], [x10, y, z10], [x11, y, z11], [x01, y, z01], col, [[x00 / scale, z00 / scale], [x10 / scale, z10 / scale], [x11 / scale, z11 / scale], [x01 / scale, z01 / scale]], UP);
}
// the stretch of a road drawn in a piece: where its middle line is in the piece
function runIn(r, T) {
  if (r.along === 'z') { if (r.c < T.x0 || r.c >= T.x1) return null; const a0 = Math.max(r.from, T.z0), a1 = Math.min(r.to, T.z1); return a1 > a0 ? [a0, a1] : null; }
  if (r.c < T.z0 || r.c >= T.z1) return null;
  const a0 = Math.max(r.from, T.x0), a1 = Math.min(r.to, T.x1);
  return a1 > a0 ? [a0, a1] : null;
}
// the junctions along a road: where along it each one's box is
const JUNCTIONS_OF = new Map(OGANIRU_ROADS.map((r) => [r.id, OGANIRU_JUNCTIONS.filter((j) => j.roads.includes(r.id)).map((j) => (r.along === 'z' ? [j.z - j.hz, j.z + j.hz] : [j.x - j.hx, j.x + j.hx]))]));
// [a0, a1] less the junctions' boxes: the runs of a road's own tar
function minus(a0, a1, cuts) {
  let runs = [[a0, a1]];
  for (const [c0, c1] of cuts) runs = runs.flatMap(([p, q]) => (c1 <= p || c0 >= q ? [[p, q]] : [[p, c0], [c1, q]].filter(([u, v]) => v - u > 0.05)));
  return runs;
}
// near a junction (for where the markings stop)
const nearCut = (cuts, a, pad) => cuts.some(([c0, c1]) => a > c0 - pad && a < c1 + pad);
function paintStrip(M, r, lat0, lat1, a0, a1, col = LINE) { flat(M.paint, r, lat0, lat1, a0, a1, PAINT_Y, col, 1); }
// A road's tar, its markings, the wheels' wear and its drains, in this piece.
function roadTile(M, r, T) {
  const run = runIn(r, T);
  if (!run || r.kind === 'cutting') return;
  const cuts = JUNCTIONS_OF.get(r.id) || [];
  const [a0, a1] = run;
  const w = roadWidthAt(r, (a0 + a1) / 2);
  const varying = !!(r.flare || r.taper);
  // the tar: across its whole width, but in its junctions' boxes (drawn with the junction); a flyover-road's middle under
  // its flyover is paving, and under the flyover's low ends its embankment
  for (const [p, q] of minus(a0, a1, cuts)) {
    if (!varying) { flat(M.tar, r, -r.half, r.half, p, q, ROAD_Y, TAR); continue; }
    for (let a = p; a < q - 1e-6; a += 2) {
      const b = Math.min(q, a + 2), wa = roadWidthAt(r, a), wb = roadWidthAt(r, b);
      if (r.kind === 'flyover-road') {
        // (where its flyover is over it: the side carriageways; the middle paved where the flyover is high, its
        // embankment's where it is low; beyond the flyover's foot, the whole width)
        const mid = deckOverMiddle(r, (a + b) / 2);
        if (mid) {
          for (const k of [-1, 1]) trapezoid(M.tar, r, k > 0 ? wa.median / 2 : -wa.half, k > 0 ? wa.half : -wa.median / 2, k > 0 ? wb.median / 2 : -wb.half, k > 0 ? wb.half : -wb.median / 2, a, b, ROAD_Y, TAR);
          if (mid === 'high') trapezoid(M.pave, r, -wa.median / 2, wa.median / 2, -wb.median / 2, wb.median / 2, a, b, ROAD_Y + 0.01, CONCRETE_DARK, 2);
          continue;
        }
      }
      trapezoid(M.tar, r, -wa.half, wa.half, -wb.half, wb.half, a, b, ROAD_Y, TAR);
    }
  }
  // the markings
  if (r.kind === 'expressway') {
    // three lanes each way: their lines measured from the expressway's middle (its north-bound half alone where the
    // south-bound has gone off to the Harmony Interchange)
    const toLat = (o) => EZ + o - r.c;
    for (const k of r.half > 10 ? [-1, 1] : [1]) {
      for (const o of EXPRESSWAY_LINES.edges) { const l = toLat(k * o); paintStrip(M, r, l - 0.075, l + 0.075, a0, a1); }
      for (const o of EXPRESSWAY_LINES.between) for (let a = Math.ceil(a0 / 12) * 12; a < a1 - 4; a += 12) { const l = toLat(k * o); paintStrip(M, r, l - 0.075, l + 0.075, a, a + 4); }
      for (const o of EXPRESSWAY_LINES.lanes) for (const s of [-0.85, 0.85]) { const l = toLat(k * o) + s; flat(M.wear, r, l - 0.3, l + 0.3, a0, a1, ROAD_Y + 0.002, TAR_WORN); }
    }
    if (r.barrier) groundBarrier(M, r, a0, a1, () => 0);
    return;
  }
  if (varying) {
    // (an approach opening out, a flyover-road narrowing: its edge lines and the line between its lanes)
    for (let a = Math.max(a0, r.from + 2); a < a1 - 2; a += 2) {
      if (nearCut(cuts, a + 1, 3)) continue;
      const wa = roadWidthAt(r, a), wb = roadWidthAt(r, a + 2);
      for (const k of [-1, 1]) trapezoid(M.paint, r, k * (wa.half - 0.65) - 0.075, k * (wa.half - 0.65) + 0.075, k * (wb.half - 0.65) - 0.075, k * (wb.half - 0.65) + 0.075, a, a + 2, PAINT_Y, LINE, 1);
      if (r.kind === 'flyover-road' && wa.median > 1 && Math.floor(a / 2) % 4 === 0) for (const k of [-1, 1]) { const m = k * (wa.median / 2 + wa.half) / 2; paintStrip(M, r, m - 0.075, m + 0.075, a, a + 3); }
      if (r.kind === 'approach' && wa.median < 0.6 && Math.floor(a / 2) % 4 === 0) paintStrip(M, r, -0.075, 0.075, a, a + 3);
    }
    return;
  }
  for (const [p, q] of minus(a0, a1, cuts.map(([c0, c1]) => [c0 - 3, c1 + 3]))) {
    if (r.median > 0) {
      for (const k of [-1, 1]) {
        const inner = k * (r.median / 2), outer = k * (r.half - 0.5);
        paintStrip(M, r, inner + k * 0.2 - 0.075, inner + k * 0.2 + 0.075, p, q);
        paintStrip(M, r, outer - k * 0.15 - 0.075, outer - k * 0.15 + 0.075, p, q);
        for (let a = Math.ceil((p - 2) / 9) * 9 + 2; a < q - 3; a += 9) paintStrip(M, r, inner + k * 3.5 - 0.075, inner + k * 3.5 + 0.075, a, a + 3);
        for (const lane of [inner + k * 1.75, inner + k * 5.25]) for (const s of [-0.85, 0.85]) flat(M.wear, r, lane + s - 0.28, lane + s + 0.28, p, q, ROAD_Y + 0.002, TAR_WORN);
      }
    } else {
      // a street, the Kwale road on: a dashed line down its middle, edge lines
      for (let a = Math.ceil(p / 6) * 6; a < q - 3; a += 6) paintStrip(M, r, -0.075, 0.075, a, a + 3);
      for (const k of [-1, 1]) paintStrip(M, r, k * (r.half - 0.5) - 0.075, k * (r.half - 0.5) + 0.075, p, q);
      for (const k of [-1, 1]) for (const s of [-0.85, 0.85]) flat(M.wear, r, k * r.half / 2 + s - 0.28, k * r.half / 2 + s + 0.28, p, q, ROAD_Y + 0.002, TAR_WORN);
    }
  }
  // drains in the gutter along the kerbs: a grate every 25 m (a dark hole, its iron frame and five bars across it)
  if (r.kind === 'avenue' || r.kind === 'street') {
    for (let a = Math.ceil(a0 / 25) * 25 + 6; a < a1 - 6; a += 25) {
      if (nearCut(cuts, a, 5)) continue;
      for (const k of [-1, 1]) {
        const [x, z] = Pt(r, k * (r.half - 0.3), a), turn = r.along === 'z' ? 0 : Math.PI / 2;
        M.solid.box(0.45, 0.02, 0.9, x, ROAD_Y + 0.004, z, 0x141516, turn);
        for (const s of [-1, 1]) {
          const [fx, fz] = Pt(r, k * (r.half - 0.3), a + s * 0.425), [gx, gz] = Pt(r, k * (r.half - 0.3) + s * 0.2, a);
          M.solid.box(0.45, 0.03, 0.05, fx, ROAD_Y + 0.008, fz, 0x4a4b4e, turn);
          M.solid.box(0.05, 0.03, 0.9, gx, ROAD_Y + 0.008, gz, 0x4a4b4e, turn);
        }
      }
    }
  }
}
// Is a junction flyover over the middle of this flyover-road here, and high or low? ('high': on columns; 'low': its
// embankment; null: past its foot)
function deckOverMiddle(r, a) {
  const [x, z] = Pt(r, 0, a);
  let best = null;
  for (const d of OGANIRU_DECKS) {
    if (d.kind !== 'flyover' || !d.barrier) continue;
    const p0 = d.path[0], pn = d.path[d.path.length - 1];
    const alongX = Math.abs(p0.z - pn.z) < 1;
    if (alongX ? Math.abs(z - p0.z) > 1 || x < Math.min(p0.x, pn.x) || x > Math.max(p0.x, pn.x) : Math.abs(x - p0.x) > 1 || z < Math.min(p0.z, pn.z) || z > Math.max(p0.z, pn.z)) continue;
    const s = alongX ? x - Math.min(p0.x, pn.x) : z - Math.min(p0.z, pn.z);
    const q = d.path.find((pp) => pp.s >= (alongX ? (p0.x < pn.x ? s : d.len - s) : (p0.z < pn.z ? s : d.len - s))) || pn;
    best = q.y - D.thick >= OGANIRU.under ? 'high' : 'low';
  }
  return best;
}
// The expressway's middle barrier on the ground (and in its cutting, `y(a)` the road's height along it): a concrete
// wall, wide at its foot, narrow at its top.
function groundBarrier(M, r, a0, a1, y, step = 4) {
  const prof = [[0.3, 0], [0.19, 0.28], [0.08, 0.82]];
  const lat0 = EZ - r.c;
  for (let a = a0; a < a1 - 1e-6; a += step) {
    const b = Math.min(a1, a + step), ya = y(a), yb = y(b);
    for (const side of [-1, 1]) for (let k = 0; k < prof.length - 1; k += 1) {
      const [o0, h0] = prof[k], [o1, h1] = prof[k + 1];
      const [xa0, za0] = Pt(r, lat0 + side * o0, a), [xb0, zb0] = Pt(r, lat0 + side * o0, b), [xb1, zb1] = Pt(r, lat0 + side * o1, b), [xa1, za1] = Pt(r, lat0 + side * o1, a);
      M.concrete.quad([xa0, ya + h0, za0], [xb0, yb + h0, zb0], [xb1, yb + h1, zb1], [xa1, ya + h1, za1], 0xd6d1c6, [[a / 6, h0 / 6], [b / 6, h0 / 6], [b / 6, h1 / 6], [a / 6, h1 / 6]], r.along === 'x' ? [0, 0.4, side] : [side, 0.4, 0]);
    }
    const [xa, za] = Pt(r, lat0 - 0.08, a), [xb, zb] = Pt(r, lat0 - 0.08, b), [xc, zc] = Pt(r, lat0 + 0.08, b), [xd, zd] = Pt(r, lat0 + 0.08, a);
    M.concrete.quad([xa, ya + 0.82, za], [xb, yb + 0.82, zb], [xc, yb + 0.82, zc], [xd, ya + 0.82, zd], 0xdcd7cc, [[a / 6, 0.13], [b / 6, 0.13], [b / 6, 0.14], [a / 6, 0.14]], UP);
  }
}
// An arrow painted on a lane: `a` along the road, pointing `dir` (+1: toward its higher end), turning `turn` (0 straight
// on, -1 left, +1 right, as the driver sees it), its middle `lat` across.
function arrow(M, r, lat, a, dir, turn) {
  const P = (u, v) => { const [x, z] = Pt(r, lat + v * (r.along === 'z' ? -dir : dir), a + u * dir); return [x, PAINT_Y, z]; };
  // (u: forward, v: to the driver's right)
  const tri = (p, q, s) => M.paint.quad(P(...p), P(...q), P(...s), P(...s), LINE, Q_UV, UP);
  if (!turn) {
    M.paint.quad(P(-2.2, -0.08), P(-2.2, 0.08), P(0.4, 0.08), P(0.4, -0.08), LINE, Q_UV, UP);
    tri([0.4, -0.35], [0.4, 0.35], [1.4, 0]);
    return;
  }
  M.paint.quad(P(-2.2, -0.08), P(-2.2, 0.08), P(0.2, 0.08), P(0.2, -0.08), LINE, Q_UV, UP);
  M.paint.quad(P(0.2, -0.08), P(0.2, 0.08), P(0.36, turn * 0.9 + 0.08), P(0.2, turn * 0.9 - 0.08), LINE, Q_UV, UP);
  tri([0.0, turn * 0.9], [0.6, turn * 0.9], [0.3, turn * 1.6]);
}
// A junction, in this piece: its tar; across each road coming into it a zebra crossing, and the stop line before it on
// the side its traffic comes in on; on a street, the arrows for the lanes coming to it.
function junctionTile(M, j) {
  const x0 = j.x - j.hx, x1 = j.x + j.hx, z0 = j.z - j.hz, z1 = j.z + j.hz;
  M.tar.quad([x0, ROAD_Y, z0], [x1, ROAD_Y, z0], [x1, ROAD_Y, z1], [x0, ROAD_Y, z1], TAR, [[x0 / TT, z0 / TT], [x1 / TT, z0 / TT], [x1 / TT, z1 / TT], [x0 / TT, z1 / TT]], UP);
  for (const leg of j.legs) {
    const alongZ = leg === 'e' || leg === 'w', sign = leg === 'e' || leg === 'n' ? 1 : -1;
    const half = alongZ ? j.hx : j.hz;
    const edge = alongZ ? j.z + sign * j.hz : j.x + sign * j.hx;
    const road = OGANIRU_ROADS.find((q) => j.roads.includes(q.id) && (q.along === 'z') === alongZ && (sign > 0 ? q.to > (alongZ ? j.z : j.x) + 1 : q.from < (alongZ ? j.z : j.x) - 1));
    if (!road) continue;
    const r = { along: alongZ ? 'z' : 'x', c: alongZ ? j.x : j.z };
    // the zebra: white bars along the road, half a metre wide, a metre apart, four metres long (across its carriageways:
    // under a flyover not over the paving between them)
    const a0 = edge + sign * 0.6, a1 = edge + sign * 4.6;
    const paved = road.kind === 'flyover-road' ? roadWidthAt(road, edge).median / 2 : 0;
    for (let l = -half + 0.6; l < half - 0.5; l += 1) if (!(paved && l + 0.5 > -paved && l < paved)) paintStrip(M, r, l, l + 0.5, Math.min(a0, a1), Math.max(a0, a1));
    // the stop line, across the half its traffic comes in on (for traffic going west, -z, the north half, +x; and so
    // round: the coming-in half is on the driver's right)
    const s0 = edge + sign * 5.0, s1 = edge + sign * 5.4;
    const inLat = alongZ ? (sign > 0 ? [0.3, half - 0.4] : [-half + 0.4, -0.3]) : (sign > 0 ? [-half + 0.4, -0.3] : [0.3, half - 0.4]);
    const median = paved || (road.median > 0 && road.kind === 'avenue' ? road.median / 2 : 0);
    const [l0, l1] = inLat[0] > 0 ? [Math.max(inLat[0], median), inLat[1]] : [inLat[0], Math.min(inLat[1], -median)];
    paintStrip(M, r, l0, l1, Math.min(s0, s1), Math.max(s0, s1));
    // a street's arrows, ten metres before the stop line: straight on in the inner lane, a turn in the outer
    if (road.kind === 'street') {
      const dirIn = -sign;
      const laneIn = (l0 + l1) / 2, laneOut = inLat[0] > 0 ? l1 - 1.6 : l0 + 1.6, laneInner = inLat[0] > 0 ? l0 + 1.6 : l1 - 1.6;
      void laneIn;
      arrow(M, r, laneInner, edge + sign * 14, dirIn, 0);
      arrow(M, r, laneOut, edge + sign * 14, dirIn, 1);
    }
  }
}
// A stop line by itself (where the Peace Interchange's slip roads meet the avenue, at its lights): across the half its
// traffic comes in on, just beyond where that traffic stops.
function stopLineTile(M, l) {
  const alongZ = l.way === 'e' || l.way === 'w', toward = l.way === 'e' || l.way === 'n' ? 1 : -1;
  const r = { along: alongZ ? 'z' : 'x', c: alongZ ? PEACE_X : l.z };
  const at = alongZ ? l.z : l.x, mid = alongZ ? l.x - PEACE_X : 0;
  paintStrip(M, r, mid - l.half + 0.5, mid + l.half - 0.5, toward > 0 ? at : at - 0.4, toward > 0 ? at + 0.4 : at);
}
// A roundabout, in this piece: its ring of tar, the line between its two lanes, the give-way teeth where each road
// comes in, its island of grass behind a black-and-white kerb, its walkway round it but where a road comes in, and at its
// middle the Gate Roundabout's obelisk, or a raised bed of palms.
function roundaboutTile(M, rb, lite, shade, foliage) {
  const seg = lite ? 48 : 72;
  const P = (r, a, y) => [rb.x + Math.sin(a) * r, y, rb.z + Math.cos(a) * r];
  for (let i = 0; i < seg; i += 1) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const p0 = P(rb.island, a0, ROAD_Y), p1 = P(rb.outer + 0.6, a0, ROAD_Y), p2 = P(rb.outer + 0.6, a1, ROAD_Y), p3 = P(rb.island, a1, ROAD_Y);
    M.tar.quad(p0, p1, p2, p3, TAR, [[p0[0] / TT, p0[2] / TT], [p1[0] / TT, p1[2] / TT], [p2[0] / TT, p2[2] / TT], [p3[0] / TT, p3[2] / TT]], UP);
    if (i % 2 === 0) M.paint.quad(P(17.6, a0, PAINT_Y), P(17.75, a0, PAINT_Y), P(17.75, a1, PAINT_Y), P(17.6, a1, PAINT_Y), LINE, Q_UV, UP);
  }
  for (const leg of rb.legs) {
    const [ax, az] = leg.dir === 'n' ? [1, 0] : leg.dir === 's' ? [-1, 0] : leg.dir === 'e' ? [0, 1] : [0, -1];
    for (let k = -leg.half + 1.5; k <= leg.half - 1.5; k += 1.2) {
      const r0 = rb.outer + 0.8, r1 = rb.outer + 1.4;
      const cx = rb.x + ax * r0 + az * k, cz = rb.z + az * r0 + ax * k, ex = rb.x + ax * r1 + az * k, ez = rb.z + az * r1 + ax * k;
      const sx = az * 0.25, sz = ax * 0.25;
      M.paint.quad([cx - sx, PAINT_Y, cz - sz], [cx + sx, PAINT_Y, cz + sz], [ex + sx, PAINT_Y, ez + sz], [ex - sx, PAINT_Y, ez - sz], LINE, Q_UV, UP);
    }
  }
  const mouth = (a) => rb.legs.some((l) => { const [ax, az] = l.dir === 'n' ? [1, 0] : l.dir === 's' ? [-1, 0] : l.dir === 'e' ? [0, 1] : [0, -1]; const px = Math.sin(a) * (rb.outer + 2), pz = Math.cos(a) * (rb.outer + 2); return px * ax + pz * az > 0 && Math.abs(-px * az + pz * ax) < l.half + 0.5; });
  const iseg = 56;
  for (let i = 0; i < iseg; i += 1) {
    const a0 = (i / iseg) * Math.PI * 2, a1 = ((i + 1) / iseg) * Math.PI * 2;
    const c0 = P(0, a0, KERB), p0 = P(rb.island, a0, KERB), p1 = P(rb.island, a1, KERB);
    M.grass.quad(c0, p0, p1, c0, GRASS, [[c0[0] / 3.2, c0[2] / 3.2], [p0[0] / 3.2, p0[2] / 3.2], [p1[0] / 3.2, p1[2] / 3.2], [c0[0] / 3.2, c0[2] / 3.2]], UP);
    const k = i % 2 ? KERB_BLACK : KERB_WHITE;
    const m = (a0 + a1) / 2;
    M.solid.box(0.22, KERB + 0.04, (Math.PI * 2 * rb.island) / iseg - 0.03, rb.x + Math.sin(m) * rb.island, (KERB + 0.04) / 2, rb.z + Math.cos(m) * rb.island, k, m + Math.PI / 2);
    if (!mouth(m)) {
      const w0 = P(rb.outer, a0, KERB), w1 = P(rb.outer + rb.walk, a0, KERB), w2 = P(rb.outer + rb.walk, a1, KERB), w3 = P(rb.outer, a1, KERB);
      M.pave.quad(w0, w1, w2, w3, 0xe6e2d8, [[w0[0] / 2, w0[2] / 2], [w1[0] / 2, w1[2] / 2], [w2[0] / 2, w2[2] / 2], [w3[0] / 2, w3[2] / 2]], UP);
      M.solid.box(0.22, KERB + 0.04, (Math.PI * 2 * rb.outer) / iseg - 0.03, rb.x + Math.sin(m) * rb.outer, (KERB + 0.04) / 2, rb.z + Math.cos(m) * rb.outer, k, m + Math.PI / 2);
    }
  }
  if (rb.id === 'gate') {
    // the island's middle: a stepped plinth and a slim obelisk, the city's emblem (a rising sun's rays) round its foot
    M.concrete.box(7, 0.6, 7, rb.x, KERB + 0.3, rb.z, 0xd8d2c4);
    M.concrete.box(5, 0.6, 5, rb.x, KERB + 0.9, rb.z, 0xe2ddd0);
    M.concrete.geo(new THREE.CylinderGeometry(0.55, 1.1, 9, 4), place(rb.x, KERB + 1.2 + 4.5, rb.z, Math.PI / 4), 0xeee9dc);
    M.concrete.geo(new THREE.ConeGeometry(0.62, 1.4, 4), place(rb.x, KERB + 1.2 + 9 + 0.7, rb.z, Math.PI / 4), 0xd4b24a);
    return;
  }
  // a raised round bed behind a low wall, three palms in it
  M.concrete.geo(new THREE.CylinderGeometry(4.2, 4.4, 0.55, 24, 1, true), place(rb.x, KERB + 0.27, rb.z), 0xd8d2c4, 'wall', 4);
  M.grass.geo(new THREE.CircleGeometry(4.2, 24).rotateX(-Math.PI / 2), place(rb.x, KERB + 0.5, rb.z), GRASS, 'plan', 3.2);
  for (let k = 0; k < 3; k += 1) {
    const a = (k / 3) * Math.PI * 2 + rb.x * 0.01;
    addTree(shade, foliage, { x: rb.x + Math.sin(a) * 1.8, z: rb.z + Math.cos(a) * 1.8, kind: 'palm', size: 0.85 + k * 0.1, turn: a * 2.3, base: KERB + 0.5 });
  }
}

// ------------------------------------------------------------------------------- kerbs, strips, walkways --
// A run of black-and-white kerb, from (x0, z0) to (x1, z1), its face toward `out` ([x, z]): its top and its face, the
// blocks (a metre each, black and white, worn) a picture along it, by where they are along the road (so that they run on
// unbroken from one piece of the city to the next).
const KERB_TOP = KERB + 0.04;
function kerbRun(M, x0, z0, x1, z1, out) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  if (len < 0.3) return;
  const ox = out[0] * 0.11, oz = out[1] * 0.11;
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const u0 = (alongX ? x0 : z0) / 32, u1 = (alongX ? x1 : z1) / 32;
  M.kerb.quad([x0 - ox, KERB_TOP, z0 - oz], [x1 - ox, KERB_TOP, z1 - oz], [x1 + ox, KERB_TOP, z1 + oz], [x0 + ox, KERB_TOP, z0 + oz], 0xffffff, [[u0, 0.9], [u1, 0.9], [u1, 1], [u0, 1]], UP);
  M.kerb.quad([x0 + ox, 0, z0 + oz], [x1 + ox, 0, z1 + oz], [x1 + ox, KERB_TOP, z1 + oz], [x0 + ox, KERB_TOP, z0 + oz], 0xffffff, [[u0, 0], [u1, 0], [u1, 0.85], [u0, 0.85]], [out[0], 0, out[1]]);
}
const ROAD_OF = new Map(OGANIRU_ROADS.map((r) => [r.id, r]));
function* kerbsTile(M, T) {
  let n = 0;
  for (const B of OGANIRU_KERBED) {
    if ((n += 1) % 150 === 0) yield;
    // (the part of it in this piece; its ends drawn only where they are its own)
    const x0 = Math.max(B.x0, T.x0), x1 = Math.min(B.x1, T.x1), z0 = Math.max(B.z0, T.z0), z1 = Math.min(B.z1, T.z1);
    if (x1 - x0 < 0.02 || z1 - z0 < 0.02) continue;
    const kind = B.median ? 'median' : B.walk ? 'walk' : 'plaza';
    const top = kind === 'plaza' ? KERB + 0.003 : KERB;
    const target = kind === 'median' ? M.grass : M.pave;
    const sc = kind === 'median' ? 3.2 : 2;
    target.quad([x0, top, z0], [x1, top, z0], [x1, top, z1], [x0, top, z1], kind === 'median' ? shade(GRASS, 0.92 + rnd(Math.round(B.x0), Math.round(B.z0)) * 0.16) : kind === 'plaza' ? 0xf4f0e6 : 0xe6e2d8, [[x0 / sc, z0 / sc], [x1 / sc, z0 / sc], [x1 / sc, z1 / sc], [x0 / sc, z1 / sc]], UP);
    // its sides down to the road
    const side = (p, q, facing) => M.concrete.quad([p[0], 0, p[1]], [q[0], 0, q[1]], [q[0], top, q[1]], [p[0], top, p[1]], CONCRETE, Q_UV, facing);
    if (z0 === B.z0) side([x0, z0], [x1, z0], [0, 0, -1]);
    if (z1 === B.z1) side([x0, z1], [x1, z1], [0, 0, 1]);
    if (x0 === B.x0) side([x0, z0], [x0, z1], [-1, 0, 0]);
    if (x1 === B.x1) side([x1, z0], [x1, z1], [1, 0, 0]);
    // the kerbs: black and white down both long sides of a middle strip, and along the road's edge of a walkway
    const alongZ = B.z1 - B.z0 >= B.x1 - B.x0;
    if (kind === 'median') {
      if (alongZ) { if (x0 === B.x0) kerbRun(M, x0, z0, x0, z1, [-1, 0]); if (x1 === B.x1) kerbRun(M, x1, z0, x1, z1, [1, 0]); } else { if (z0 === B.z0) kerbRun(M, x0, z0, x1, z0, [0, -1]); if (z1 === B.z1) kerbRun(M, x0, z1, x1, z1, [0, 1]); }
    } else if (kind === 'walk') {
      const road = ROAD_OF.get(B.walk);
      if (!road) continue;
      // (the side nearer the road's middle)
      if (road.along === 'z') { const near0 = Math.abs(B.x0 - road.c) < Math.abs(B.x1 - road.c); if ((near0 ? x0 === B.x0 : x1 === B.x1)) kerbRun(M, near0 ? x0 : x1, z0, near0 ? x0 : x1, z1, [near0 ? -1 : 1, 0]); }
      else { const near0 = Math.abs(B.z0 - road.c) < Math.abs(B.z1 - road.c); if ((near0 ? z0 === B.z0 : z1 === B.z1)) kerbRun(M, x0, near0 ? z0 : z1, x1, near0 ? z0 : z1, [0, near0 ? -1 : 1]); }
    }
  }
}

// ------------------------------------------------------------------------------------------------- decks --
// For each deck, in this piece (its stretches whose middles are in it): the road on it (and where it lies on the
// ground, the road there), its joints, walls and drain spouts, the barrier down its middle, underneath it the slab and
// girders, its embankments between retaining walls where it is low, the faces at its ends; its pillars; the lamps under
// it.
function* decksTile(M, T, lite, fixedLights) {
  const mid = (a, b) => inTile(T, (a.x + b.x) / 2, (a.z + b.z) / 2);
  for (const d of OGANIRU_DECKS) {
    const P = d.path, n = P.length, half = d.half;
    // (a quick look: none of it in this piece)
    if (!P.some((p) => p.x > T.x0 - 40 && p.x < T.x1 + 40 && p.z > T.z0 - 40 && p.z < T.z1 + 40)) continue;
    yield;
    const ramp = d.id !== 'viaduct';
    const road = ramp ? M.rampTar : M.tar;
    const bridge = d.kind === 'bridge';
    const L = (p) => [p.uz, -p.ux];                     // the deck's left (oganiru.js: +d to the left)
    const at = (p, off, dy = 0) => { const [lx, lz] = L(p); return [p.x + lx * off, p.y + p.bank * off + dy, p.z + lz * off]; };
    const walled = (side, s) => (side > 0 ? d.walls.left : d.walls.right).some(([a, b]) => s >= a - 0.01 && s <= b + 0.01);
    const lift = (p) => (p.y < 0.35 && !bridge ? DECK_LIFT : 0.004);
    const g = (p) => groundBelow(p.x, p.z);
    const under = (p) => p.y - D.thick - g(p) >= OGANIRU.under;   // high enough to pass under: on pillars
    const raised = (p) => bridge || p.y - g(p) > 0.35;
    for (let i = 0; i < n - 1; i += 1) {
      const a = P[i], b = P[i + 1];
      if (!mid(a, b)) continue;
      // the road
      const ua = (u) => [u / TT, a.s / TT], ub = (u) => [u / TT, b.s / TT];
      road.quad(at(a, -half, lift(a)), at(b, -half, lift(b)), at(b, half, lift(b)), at(a, half, lift(a)), TAR, [ua(-half), ub(-half), ub(half), ua(half)], UP);
      for (const side of [-1, 1]) {
        const e = side * half, wa = walled(side, a.s), wb = walled(side, b.s);
        const out = (p) => { const [lx, lz] = L(p); return [lx * side, 0, lz * side]; };
        // the edge line, inside the wall (the expressway's own lines below)
        if (d.id !== 'viaduct' && (raised(a) || d.kind !== 'ramp')) M.paint.quad(at(a, side * (half - D.wallWidth - 0.35), lift(a) + 0.008), at(b, side * (half - D.wallWidth - 0.35), lift(b) + 0.008), at(b, side * (half - D.wallWidth - 0.2), lift(b) + 0.008), at(a, side * (half - D.wallWidth - 0.2), lift(a) + 0.008), LINE, Q_UV, UP);
        // the outer face: from the slab's underside (or the ground, an embankment's retaining wall) to the road, or the
        // wall's top where it has one
        if (raised(a) || raised(b)) {
          const bottomA = under(a) ? a.y - 1.0 : g(a) - 0.05, bottomB = under(b) ? b.y - 1.0 : g(b) - 0.05;
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
      // the expressway on its viaduct: its lanes' lines as on the ground (the edge line beside a slip road coming in or
      // going off broken, where there is no wall between them), the wheels' wear
      if (d.id === 'viaduct') {
        const line = (o, dy = 0.012) => M.paint.quad(at(a, o - 0.075, lift(a) + dy), at(b, o - 0.075, lift(b) + dy), at(b, o + 0.075, lift(b) + dy), at(a, o + 0.075, lift(a) + dy), LINE, Q_UV, UP);
        const dash = ((Math.floor(a.x / 4) % 3) + 3) % 3 === 0;
        for (const side of [-1, 1]) {
          const [inner, outer] = EXPRESSWAY_LINES.edges;
          line(side * inner);
          if (dash || walled(side, a.s) || !raised(a)) line(side * outer);
          if (dash) for (const o of EXPRESSWAY_LINES.between) line(side * o);
          for (const o of EXPRESSWAY_LINES.lanes) for (const s of [-0.85, 0.85]) {
            const l0 = side * o + s - 0.3, l1 = side * o + s + 0.3;
            M.wear.quad(at(a, l0, lift(a) + 0.002), at(b, l0, lift(b) + 0.002), at(b, l1, lift(b) + 0.002), at(a, l1, lift(a) + 0.002), TAR_WORN, [ua(l0), ub(l0), ub(l1), ua(l1)], UP);
          }
        }
      }
      // where an embankment ends and the deck goes on on pillars: its face across, under the deck
      if (raised(a) && raised(b) && under(a) !== under(b) && !bridge) {
        const e = under(a) ? b : a, toward = under(a) ? -1 : 1;
        const l0 = at(e, -half), l1 = at(e, half);
        M.concrete.quad([l0[0], g(e) - 0.05, l0[2]], [l1[0], g(e) - 0.05, l1[2]], [l1[0], e.y - 0.45, l1[2]], [l0[0], e.y - 0.45, l0[2]], CONCRETE, [[-half / 6, 0], [half / 6, 0], [half / 6, e.y / 6], [-half / 6, e.y / 6]], [e.ux * toward, 0, e.uz * toward]);
      }
      // underneath: where it stands on pillars (or spans the cutting), the slab and its girders
      if (under(a) && under(b)) {
        const slab = 0.45;
        const ya = a.y - slab, yb = b.y - slab;
        M.soffit.quad(at(a, -half, -slab), at(b, -half, -slab), at(b, half, -slab), at(a, half, -slab), CONCRETE_DARK, [[-half / 6, a.s / 6], [-half / 6, b.s / 6], [half / 6, b.s / 6], [half / 6, a.s / 6]], DOWN);
        const count = lite ? (half > 10 ? 4 : 2) : Math.max(2, Math.round((half * 2) / 3.6));
        for (let gk = 0; gk < count; gk += 1) {
          const o = -half + 1 + ((half * 2 - 2) * (gk + 0.5)) / count, w = Math.min(1.5, (half * 2 - 2) / count * 0.6);
          const deep = D.thick - slab;
          const A0 = at(a, o - w / 2, -slab - deep), A1 = at(a, o + w / 2, -slab - deep), B0 = at(b, o - w / 2, -slab - deep), B1 = at(b, o + w / 2, -slab - deep);
          M.soffit.quad(A0, B0, B1, A1, CONCRETE_DARK, [[o / 6, a.s / 6], [o / 6, b.s / 6], [(o + w) / 6, b.s / 6], [(o + w) / 6, a.s / 6]], DOWN);
          for (const s of [-1, 1]) {
            const ea = at(a, o + (s * w) / 2, -slab), eb = at(b, o + (s * w) / 2, -slab);
            const fa = at(a, o + (s * w) / 2, -slab - deep), fb = at(b, o + (s * w) / 2, -slab - deep);
            const [lx, lz] = L(a);
            M.concrete.quad(fa, fb, eb, ea, CONCRETE_DARK, [[a.s / 6, ya / 6 - 0.3], [b.s / 6, yb / 6 - 0.3], [b.s / 6, yb / 6], [a.s / 6, ya / 6]], [lx * s, 0, lz * s]);
          }
        }
      }
      // the barrier down the middle (a concrete wall, wide at its foot, narrow at its top)
      if (d.barrier && (a.y >= 0.35 || bridge)) {
        const prof = [[0.3, 0], [0.19, 0.28], [0.08, 0.82]];
        for (const side of [-1, 1]) for (let k = 0; k < prof.length - 1; k += 1) {
          const [o0, h0] = prof[k], [o1, h1] = prof[k + 1];
          const [lx, lz] = L(a);
          M.concrete.quad(at(a, side * o0, h0), at(b, side * o0, h0), at(b, side * o1, h1), at(a, side * o1, h1), 0xd6d1c6, [[a.s / 6, h0 / 6], [b.s / 6, h0 / 6], [b.s / 6, h1 / 6], [a.s / 6, h1 / 6]], [lx * side, 0.4, lz * side]);
        }
        M.concrete.quad(at(a, -0.08, 0.82), at(b, -0.08, 0.82), at(b, 0.08, 0.82), at(a, 0.08, 0.82), 0xdcd7cc, [[a.s / 6, 0.13], [b.s / 6, 0.13], [b.s / 6, 0.14], [a.s / 6, 0.14]], UP);
      }
    }
    // the joints across the road every 30 m, and the drain spouts with the stains under them
    for (let s = 30; s < d.len - 5; s += 30) {
      const k = P.findIndex((q) => q.s >= s);
      if (k < 0) continue;
      const p = P[k];
      if (!raised(p) || !inTile(T, p.x, p.z)) continue;
      const q = P[Math.min(n - 1, k + 1)];
      const ux = q.x - p.x, uz = q.z - p.z, l = Math.hypot(ux, uz) || 1, dx = (ux / l) * 0.09, dz = (uz / l) * 0.09;
      const l0 = at(p, -half + 0.5, 0.012), l1 = at(p, half - 0.5, 0.012);
      M.paint.quad([l0[0] - dx, l0[1], l0[2] - dz], [l1[0] - dx, l1[1], l1[2] - dz], [l1[0] + dx, l1[1], l1[2] + dz], [l0[0] + dx, l0[1], l0[2] + dz], 0x2b2b2e, Q_UV, UP);
    }
    if (!lite) for (let s = 12; s < d.len - 5; s += 20) {
      const p = P.find((q) => q.s >= s);
      if (!p || !under(p) || !inTile(T, p.x, p.z)) continue;
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
    // where it ends in the air (the expressway at its north end): its end face, a wall across it, and the road works
    // before it
    for (const end of d.closed) {
      const p = end === 'start' ? P[0] : P[n - 1];
      if (!inTile(T, p.x, p.z)) continue;
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
      if (!p || !under(p) || !inTile(T, p.x, p.z)) continue;
      for (const side of d.half > 6 ? [-1, 1] : [0]) {
        const off = side * (half - 2.2);
        const q = at(p, off, -D.thick - 0.06);
        M.lit.box(0.7, 0.08, 0.28, q[0], q[1], q[2], 0xfff1c9, Math.atan2(p.ux, p.uz));
        fixedLights.push({ x: q[0], z: q[2], ground: groundBelow(q[0], q[2]), size: 9, region: 'city' });
      }
    }
  }
  // the pillars: a round column on a footing, a wide cap under the deck (the expressway's on two columns, a beam across)
  for (const p of OGANIRU_PILLARS) {
    if (!inTile(T, p.x, p.z)) continue;
    const deck = DECK_BY_ID.get(p.deck);
    const capH = 1.3, capW = p.deck === 'viaduct' ? 7.5 : Math.max(3, deck ? deck.half * 2 - 1.2 : 6);
    const segs = lite ? 12 : 20;
    M.concrete.geo(new THREE.CylinderGeometry(p.r, p.r * 1.06, p.top - capH, segs), place(p.x, (p.top - capH) / 2, p.z), CONCRETE, 'wall', 6);
    M.concrete.geo(new THREE.CylinderGeometry(p.r + 0.35, p.r + 0.45, 0.4, segs), place(p.x, 0.2, p.z), CONCRETE_DARK, 'wall', 6);
    // the cap: wide across the deck, tapering down to the column
    const cap = new THREE.CylinderGeometry(capW / 2, p.r * 1.3, capH, 4, 1);
    cap.rotateY(Math.PI / 4);
    M.concrete.geo(cap, place(p.x, p.top - capH / 2, p.z, p.heading, 1, 1, 1.8 / (capW * Math.SQRT1_2)), 0xccc7bb, 'wall', 6);
  }
  // the expressway's cross beams between its pairs of columns
  for (const [x, two] of VIADUCT_PAIRS) if (two.length === 2 && inTile(T, x, EZ)) {
    const [a, b] = two, top = Math.min(a.top, b.top);
    M.concrete.box(1.6, 1.3, Math.abs(a.z - b.z) + 2, (a.x + b.x) / 2, top - 0.65, (a.z + b.z) / 2, 0xccc7bb);
  }
}
const DECK_BY_ID = new Map(OGANIRU_DECKS.map((d) => [d.id, d]));

// ------------------------------------------------------------------------------------------------ the gores --
// Where a slip road leaves the expressway or joins it (the brief: "chevrons where slip roads split"): the wedge between
// the expressway's edge line and the slip road's own, from where they part to where their roads part, its edge line
// solid along it and white chevrons across it. Where the south-bound carriageway ends in two slip roads (the Harmony
// Interchange), the wedge between the two. Each: { side, twin, pts: [{ x, lo, hi, main, ramp }] } from its point
// outward: `lo` and `hi` how far out from the expressway's middle its two lines are, `main` and `ramp` the heights of
// the expressway's road and the slip road's there (on the viaduct a slip road going down is already a little lower
// where it parts from it: what of the wedge is on the slip road is painted on it).
const EDGE = 15;                    // the expressway's road, from its middle to its edge
const GORES = (() => {
  const out = [];
  const lineIn = (d) => d.half - D.wallWidth - 0.35;                 // a deck's edge line, from its middle
  // how far out from the expressway's middle a deck's middle is where it crosses x
  const offOf = (d, side, x) => { const P = d.path; for (let i = 0; i + 1 < P.length; i += 1) { const a = P[i], b = P[i + 1]; if (a.x !== b.x && (a.x - x) * (b.x - x) <= 0) return (a.z + ((b.z - a.z) * (x - a.x)) / (b.x - a.x) - EZ) * side; } return null; };
  // (where the expressway has a carriageway on that side: the north-bound from the Harmony Interchange, the south-bound
  // to where it ends in its two slip roads there)
  const carriageway = (side, x) => (side > 0 ? x >= -1200 : x >= -1040) && x <= 920;
  for (const d of OGANIRU_DECKS) {
    if (d.id === 'viaduct' || d.kind === 'bridge') continue;
    const P = d.path, n = P.length;
    for (const end of [0, n - 1]) {
      const p = P[end];
      if (Math.abs(Math.abs(p.z - EZ) - 12) > 6 || Math.abs(p.y - expresswayY(p.x)) > 0.3) continue;
      const side = Math.sign(p.z - EZ), dir = end === 0 ? 1 : -1, off0 = (p.z - EZ) * side;
      const twin = OGANIRU_DECKS.find((e) => e !== d && e.kind !== 'bridge' && e.id !== 'viaduct' && Math.hypot(e.path[0].x - p.x, e.path[0].z - p.z) < 8 && (e.path[0].z - EZ) * side < off0 - 2) || null;
      const pts = [];
      for (let i = end; i >= 0 && i < n; i += dir) {
        const q = P[i], off = (q.z - EZ) * side, hi = off - lineIn(d);
        let lo, parted;
        if (twin) { const o = offOf(twin, side, q.x); if (o === null) break; lo = o + lineIn(twin); parted = off - d.half > o + twin.half; }
        else { if (!carriageway(side, q.x)) break; lo = EXPRESSWAY_LINES.edges[1]; parted = off - d.half > EDGE; }
        // (and only while the two roads are within a little over a metre of each other)
        if (parted || Math.abs(q.y - expresswayY(q.x)) > 1.5) break;
        pts.push({ x: q.x, lo, hi, main: twin ? q.y : expresswayY(q.x), ramp: q.y });
      }
      // (from where the two lines are far enough apart for a chevron)
      const from = pts.findIndex((g) => g.hi - g.lo > 0.6);
      if (from >= 0 && pts.length - from >= 2) out.push({ deck: d.id, side, twin: !!twin, pts: pts.slice(from) });
    }
  }
  return out;
})();
function goresTile(M, T) {
  for (const g of GORES) {
    // a point `off` out from the expressway's middle at x, on the road there (the expressway's, or beyond its edge the
    // slip road's), a little over its other markings
    const at = (x, off, A) => { const y = g.twin || off <= EDGE ? A.main : A.ramp; return [x, y + (y > 0.35 ? 0.004 : DECK_LIFT) + 0.014, EZ + g.side * off]; };
    for (let i = 0; i + 1 < g.pts.length; i += 1) {
      const a = g.pts[i], b = g.pts[i + 1];
      if (!inTile(T, a.x, EZ + g.side * a.lo)) continue;
      // its edge line on the expressway's side, solid along it
      M.paint.quad(at(a.x, a.lo - 0.075, a), at(b.x, b.lo - 0.075, b), at(b.x, b.lo + 0.075, b), at(a.x, a.lo + 0.075, a), LINE, Q_UV, UP);
    }
    // the chevrons: every 3 m, a stripe across the wedge, slanting back toward its point (in two where it crosses from
    // the expressway's road onto the slip road's)
    const x0 = g.pts[0].x, last = g.pts[g.pts.length - 1].x, way = Math.sign(last - x0) || 1;
    const lineAt = (x) => { for (let i = 0; i + 1 < g.pts.length; i += 1) { const a = g.pts[i], b = g.pts[i + 1]; if ((a.x - x) * (b.x - x) <= 0 && a.x !== b.x) { const t = (x - a.x) / (b.x - a.x); const m = (k) => a[k] + (b[k] - a[k]) * t; return { lo: m('lo'), hi: m('hi'), main: m('main'), ramp: m('ramp') }; } } return null; };
    const stripe = (xa, oa, xb, ob, A, B) => { const t = 0.4 * way; M.paint.quad(at(xa, oa, A), at(xa + t, oa, A), at(xb + t, ob, B), at(xb, ob, B), LINE, Q_UV, UP); };
    for (let x = x0 + way * 1.5; (last - x) * way > 0.4; x += way * 3) {
      const A = lineAt(x);
      if (!A || A.hi - A.lo < 0.6 || !inTile(T, x, EZ + g.side * A.lo)) continue;
      const xb = x - way * (A.hi - A.lo) * 0.8, B = lineAt(xb);
      if (!B || B.hi - B.lo < 0.4) continue;
      const oa = A.lo + 0.15, ob = B.hi - 0.15;
      if (g.twin || ob <= EDGE || oa >= EDGE) { stripe(x, oa, xb, ob, A, B); continue; }
      const k = (EDGE - oa) / (ob - oa), xm = x + (xb - x) * k, Mid = lineAt(xm) || A;
      stripe(x, oa, xm, EDGE - 0.02, A, Mid);
      stripe(xm, EDGE + 0.02, xb, ob, Mid, B);
    }
  }
}

const VIADUCT_PAIRS = (() => { const pairs = new Map(); for (const p of OGANIRU_PILLARS.filter((q) => q.deck === 'viaduct')) { const key = Math.round(p.x); if (!pairs.has(key)) pairs.set(key, []); pairs.get(key).push(p); } return pairs; })();

// --------------------------------------------------------------------------------------------- the cutting --
// The expressway below the land, in this piece: its road at its own height (going down into the cutting and up out of
// it), its lanes' lines and middle barrier, a gutter at each side, and its retaining walls: from its road to the land,
// a coping along the top and a parapet over the land (none where the Hope Avenue bridge spans it).
const HOPE_BRIDGE = OGANIRU_DECKS.find((d) => d.kind === 'bridge');
function cuttingTile(M, T) {
  const C = OGANIRU_CUTTING;
  if (EZ < T.z0 || EZ >= T.z1) return;
  const x0 = Math.max(C.x0, T.x0), x1 = Math.min(C.x1, T.x1);
  if (x1 <= x0) return;
  const r = { along: 'x', c: EZ };
  const step = 4;
  const bridgeX = HOPE_BRIDGE ? HOPE_BRIDGE.path[0].x : -1e9, bridgeHalf = HOPE_BRIDGE ? HOPE_BRIDGE.half + 0.5 : 0;
  for (let a = x0; a < x1 - 1e-6; a += step) {
    const b = Math.min(x1, a + step), ya = expresswayY(a), yb = expresswayY(b);
    const q = (lat0, lat1, h0a, h0b, h1a, h1b, M_, col, facing, uvs) => {
      const [xa0, za0] = Pt(r, lat0, a), [xb0, zb0] = Pt(r, lat0, b), [xb1, zb1] = Pt(r, lat1, b), [xa1, za1] = Pt(r, lat1, a);
      M_.quad([xa0, h0a, za0], [xb0, h0b, zb0], [xb1, h1b, zb1], [xa1, h1a, za1], col, uvs || [[xa0 / TT, za0 / TT], [xb0 / TT, zb0 / TT], [xb1 / TT, zb1 / TT], [xa1 / TT, za1 / TT]], facing);
    };
    // the road, its lines, the wheels' wear
    q(-15, 15, ya + ROAD_Y, yb + ROAD_Y, ya + ROAD_Y, yb + ROAD_Y, M.tar, TAR, UP);
    for (const k of [-1, 1]) {
      for (const o of EXPRESSWAY_LINES.edges) q(k * o - 0.075, k * o + 0.075, ya + PAINT_Y, yb + PAINT_Y, ya + PAINT_Y, yb + PAINT_Y, M.paint, LINE, UP, Q_UV);
      if (Math.floor(a / step) % 3 === 0) for (const o of EXPRESSWAY_LINES.between) q(k * o - 0.075, k * o + 0.075, ya + PAINT_Y, yb + PAINT_Y, ya + PAINT_Y, yb + PAINT_Y, M.paint, LINE, UP, Q_UV);
      for (const o of EXPRESSWAY_LINES.lanes) for (const s of [-0.85, 0.85]) q(k * o + s - 0.3, k * o + s + 0.3, ya + ROAD_Y + 0.002, yb + ROAD_Y + 0.002, ya + ROAD_Y + 0.002, yb + ROAD_Y + 0.002, M.wear, TAR_WORN, UP);
      // the gutter
      q(k * 15, k * CUT.wall, ya + 0.003, yb + 0.003, ya + 0.003, yb + 0.003, M.concrete, CONCRETE_DARK, UP, Q_UV);
      // the retaining wall's face, from the road to the land (and on up as the parapet's inner face)
      const atBridge = Math.abs((a + b) / 2 - bridgeX) < bridgeHalf;
      const topA = atBridge ? 0 : CUT.parapet, topB = topA;
      if (ya < -0.02 || yb < -0.02 || topA > 0) q(k * CUT.wall, k * CUT.wall, ya, yb, topA, topB, M.concrete, CONCRETE, [-k * 0, 0, -k], [[a / 6, ya / 6], [b / 6, yb / 6], [b / 6, topB / 6], [a / 6, topA / 6]]);
      if (!atBridge) {
        // the parapet: its top and its face to the land
        const outer = k * (CUT.wall + CUT.wallWidth);
        q(k * CUT.wall, outer, CUT.parapet, CUT.parapet, CUT.parapet, CUT.parapet, M.concrete, 0xd8d3c8, UP, Q_UV);
        q(outer, outer, CUT.parapet, CUT.parapet, -0.05, -0.05, M.concrete, CONCRETE, [0, 0, k], [[a / 6, CUT.parapet / 6], [b / 6, CUT.parapet / 6], [b / 6, 0], [a / 6, 0]]);
      } else {
        // under the bridge, the wall's coping at the land's height
        q(k * CUT.wall, k * (CUT.wall + CUT.wallWidth), 0, 0, 0, 0, M.concrete, 0xd8d3c8, UP, Q_UV);
      }
    }
  }
  groundBarrier(M, r, x0, x1, (x) => expresswayY(x));
}

// ------------------------------------------------------------------------------------- signals and signs --
function signalsTile(M, T) {
  for (const s of OGANIRU_SIGNALS) {
    if (!inTile(T, s.x, s.z)) continue;
    M.metal.geo(new THREE.CylinderGeometry(0.07, 0.09, 3.4, 10), place(s.x, KERB + 1.7, s.z), 0x2a2c30);
    const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
    const hx = s.x + fx * 0.12, hy = KERB + 2.9, hz = s.z + fz * 0.12;
    M.metal.box(0.34, 0.98, 0.26, hx, hy, hz, 0x1c1d20, s.heading);
    M.metal.box(0.5, 1.12, 0.03, hx - fx * 0.14, hy, hz - fz * 0.14, 0x111214, s.heading);
    for (const dy of [0.3, 0, -0.3]) M.metal.box(0.26, 0.03, 0.16, hx + fx * 0.2, hy + dy + 0.13, hz + fz * 0.2, 0x1c1d20, s.heading);
  }
}
// where each signal's three lamps are: [colour, phase, offset, x, y, z, facing] (the whole city's, drawn together)
const SIGNAL_LAMPS = OGANIRU_SIGNALS.flatMap((s) => {
  const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
  const hx = s.x + fx * 0.12, hy = KERB + 2.9, hz = s.z + fz * 0.12;
  return [['red', 0.3], ['amber', 0], ['green', -0.3]].map(([colour, dy]) => ({ colour, phase: s.phase, offset: s.offset || 0, x: hx + fx * 0.135, y: hy + dy, z: hz + fz * 0.135, face: s.heading }));
});
function signsTile(M, T, signs) {
  for (const s of OGANIRU_SIGNS) {
    if (!inTile(T, s.x, s.z)) continue;
    const [fg, bg] = s.palette;
    if (s.gantry) {
      // a green sign on a steel frame over the expressway's carriageway, its legs on the deck's walls (or at its edges,
      // on the ground and in its cutting)
      const y = s.gantry === 'viaduct' ? expresswayY(s.x) + D.wall : expresswayY(s.x);
      const across = s.across / 2 - 0.25;
      for (const k of [-1, 1]) M.metal.box(0.35, 7.2, 0.35, s.x, y + 3.6, EZ + k * across, 0x7c8288);
      M.metal.box(0.5, 0.5, s.across - 0.3, s.x, y + 7.0, EZ, 0x7c8288);
      M.metal.box(0.3, 0.3, s.across - 0.3, s.x, y + 6.2, EZ, 0x7c8288);
      signs.add(s.lines, s.x + Math.sin(s.facing) * 0.3, y + 6.0, s.z, s.facing, s.width, s.height, [fg, bg]);
      continue;
    }
    // on two posts beside the road
    const w = s.width, h = s.height;
    for (const k of [-1, 1]) M.metal.box(0.1, h + 2.2, 0.1, s.x + Math.cos(s.facing) * k * (w / 2 - 0.3), (h + 2.2) / 2, s.z - Math.sin(s.facing) * k * (w / 2 - 0.3), 0x6d7177, s.facing);
    signs.add(s.lines, s.x + Math.sin(s.facing) * 0.06, 2.2 + h / 2, s.z + Math.cos(s.facing) * 0.06, s.facing, w, h, [fg, bg]);
  }
}

// ------------------------------------------------------------------------------------------------ towers --
// What is at each tower's foot, drawn by the piece it stands in (its walls, its lobby's glass and its top are the
// skyline's, the whole city's, built once: render-skyline.js): columns at its corners, a canopy over the way in, a frame
// of dark metal round its doors and steps up to them, its name over them, its shops either side with their names over
// their windows and a strip of colour; and its finer work, seen from near: the white towers' ribs standing out of their
// walls, the stone ones' cornices and the finials at the corners of their steps, the plant on the roofs. (Stage 3,
// 2 November 2026: each tower's front faces the street it stands on, `face`.)
const towerSeed = (t) => { let h = 7; for (const ch of t.id) h = (h * 31 + ch.charCodeAt(0)) % 9973; return h; };
function addTowers(signs, M, list) {
  for (const t of list) {
    const lobby = 7.2, top = t.storeys * 3.6;
    const round = t.kind === 'round', r = t.dx / 2;
    const [fx, fz] = t.face;
    // the way along its front (to its left as it looks out), the middle of its front, half its front's width
    const ax = fz, az = -fx;
    const hw = round ? r : fx ? t.dz / 2 : t.dx / 2;
    const fx0 = t.x + fx * (round ? r : t.dx / 2), fz0 = t.z + fz * (round ? r : t.dz / 2);
    const heading = Math.atan2(fx, fz);
    // a box set out from its front, turned as it faces: `width` along its front, `depth` out, its middle `out` from the
    // front and `side` along it
    const obox = (Mx, width, h, depth, out, y, side, col) => Mx.box(width, h, depth, fx0 + fx * out + ax * side, y, fz0 + fz * out + az * side, col, heading);
    // (its own colours: neighbours differ)
    const seed = towerSeed(t);
    const canopy = [0x2d3236, 0x6b5a45, 0x3c4a52, 0xd9d6cf][seed % 4];
    // columns at its corners
    if (!round) for (const cx of [-1, 1]) for (const cz of [-1, 1]) M.solid.box(0.9, lobby, 0.9, t.x + cx * t.dx / 2, lobby / 2 + KERB, t.z + cz * t.dz / 2, 0xd9d6cf);
    // the canopy over the way in; round its doors a frame of dark metal, 4.4 m wide and 3.2 high; the steps up to them
    obox(M.solid, 9, 0.25, 3.2, 1.6, 4.4 + KERB, 0, canopy);
    for (const k of [-1, 1]) obox(M.metal, 0.25, 3.3, 0.3, 0.12, KERB + 1.65, k * 2.2, 0x23272b);
    obox(M.metal, 4.65, 0.3, 0.3, 0.12, KERB + 3.3, 0, 0x23272b);
    for (const [out, hk] of [[2.7, 0.15], [1.8, 0.3], [0.9, 0.45]]) obox(M.concrete, 8, hk, out + 1.2, out / 2 - 0.6, KERB + hk / 2, 0, 0xd8d3c8);
    signs.add([t.lobby], fx0 + fx * 3.25, 5.1 + KERB, fz0 + fz * 3.25, heading, 6.5, 0.55, ['#ffffff', 'rgba(20,24,28,0.92)']);
    // the shops at its foot, either side of the way in: their names over their windows, a strip of colour over each (on
    // the round one, round its wall)
    (t.shops || []).forEach((name, k) => {
      const side = (k === 0 ? -1 : 1) * (round ? r * 0.56 : hw * 0.6);
      const strip = [0x1f5d3a, 0xc59b2a, 0x8a2f2f, 0x2f4f8a, 0x5a3d7a][(seed + k * 3) % 5];
      const words = [['#ffffff', '#1f5d3a'], ['#1a1a1a', '#f2c200'], ['#ffffff', '#8a2f2f'], ['#ffffff', '#2f4f8a'], ['#ffffff', '#5a3d7a']][(seed + k * 3) % 5];
      if (round) {
        const th = Math.asin(Math.max(-1, Math.min(1, side / r))), dx = Math.cos(th) * fx + Math.sin(th) * ax, dz = Math.cos(th) * fz + Math.sin(th) * az, h = Math.atan2(dx, dz);
        signs.add([name.toUpperCase()], t.x + dx * (r + 0.08), 3.3 + KERB, t.z + dz * (r + 0.08), h, 5.2, 0.7, words);
        M.solid.box(5.6, 0.12, 0.6, t.x + dx * (r + 0.3), 2.85 + KERB, t.z + dz * (r + 0.3), strip, h);
        return;
      }
      signs.add([name.toUpperCase()], fx0 + fx * 0.08 + ax * side, 3.3 + KERB, fz0 + fz * 0.08 + az * side, heading, 5.2, 0.7, words);
      obox(M.solid, 5.6, 0.12, 0.6, 0.3, 2.85 + KERB, side, strip);
    });
    // the white towers' ribs: a fin out of the wall at every second bay, from the lobby's slab to the roof
    if (t.kind === 'ribbed-white') {
      const x0 = t.x - t.dx / 2, x1 = t.x + t.dx / 2, z0 = t.z - t.dz / 2, z1 = t.z + t.dz / 2;
      const every = 3.2, h = top - lobby, y = lobby + h / 2, rib = 0xf6f4ee;
      for (let x = x0 + every; x < x1 - 0.8; x += every) for (const [z, out] of [[z0, -1], [z1, 1]]) M.solid.box(0.45, h, 0.5, x, y, z + out * 0.25, rib);
      for (let z = z0 + every; z < z1 - 0.8; z += every) for (const [x, out] of [[x0, -1], [x1, 1]]) M.solid.box(0.5, h, 0.45, x + out * 0.25, y, z, rib);
    }
    // the stone ones: a cornice round the top of the walls, and at each step of the crown, finials at its corners
    const crown = t.crown || 0;
    if (t.kind === 'stone') {
      M.solid.box(t.dx + 1.2, 0.7, t.dz + 1.2, t.x, top - 0.6, t.z, 0xbfae8e);
      let y = top + 0.8;
      const steps = 3;
      for (let k = 0; k < steps && crown > 0; k += 1) {
        const shrink = 0.72 - k * 0.18, h = crown * (k === steps - 1 ? 0.5 : 0.25), cw = t.dx * shrink, cd = t.dz * shrink;
        M.solid.box(cw + 0.8, 0.45, cd + 0.8, t.x, y + h - 0.2, t.z, 0xbfae8e);
        if (k < steps - 1) for (const cx of [-1, 1]) for (const cz of [-1, 1]) M.solid.geo(new THREE.ConeGeometry(0.55, 2.6, 4), place(t.x + cx * (cw / 2 - 0.4), y + h + 1.3, t.z + cz * (cd / 2 - 0.4), Math.PI / 4), 0xd6c6a6);
        y += h;
      }
    }
    // the plant on the roof, beside the crown: a box of machinery and a water tank
    if (!round) {
      const cx = seed % 2 ? 1 : -1, cz = seed % 3 ? 1 : -1;
      const px = t.x + cx * (t.dx / 2 - 2.0), pz = t.z + cz * (t.dz / 2 - 2.6);
      M.solid.box(3, 2.2, 2.4, px, top + 0.8 + 1.1, pz, 0x9a9da0);
      M.metal.geo(new THREE.CylinderGeometry(1.0, 1.0, 2.2, 10), place(px - cx * 3.4, top + 0.8 + 1.1, pz), 0x7f868c);
    }
  }
}

// A piece's signs: their words painted one under another on one picture (or a few, none taller than the graphics card
// takes), each board a part of it, all of them drawn as one (2 November 2026: downtown's seventy-odd names, each its
// own picture and mesh before). Each board stands `facing` (0: toward +z), its middle at (x, y, z), `w` by `h` metres;
// its picture as wide as SIGN_WIDTH (a phone's half of it: it reads them from no nearer), as tall as its shape asks.
let SIGN_WIDTH = 1024;
const SIGN_TALLEST = 4096, SIGN_GAP = 8;
const SIGN_FONT = '"Arial Narrow", "Roboto Condensed", Impact, sans-serif';
class SignAtlas {
  constructor() { this.list = []; }
  get empty() { return this.list.length === 0; }
  add(lines, x, y, z, facing, w, h, [fg, bg]) { this.list.push({ lines, x, y, z, facing, w, h, fg, bg }); }
  // the meshes (one for each picture), `name`d
  build(name, lite) {
    const W = SIGN_WIDTH, k = W / 1024, scale = lite ? 0.5 : 1;
    // each board's place on a picture
    const sheets = [];
    let sheet = null;
    for (const s of this.list) {
      s.px = Math.max(Math.round(96 * k), Math.round(W * (s.h / s.w)));
      s.size = Math.min(Math.round(110 * k), Math.round(760 * k * (s.h / s.w) / Math.max(1, s.lines.length)));
      if (!sheet || sheet.height + s.px + SIGN_GAP > SIGN_TALLEST) { sheet = { signs: [], height: 0 }; sheets.push(sheet); }
      s.top = sheet.height + SIGN_GAP / 2;
      sheet.height += s.px + SIGN_GAP;
      sheet.signs.push(s);
    }
    return sheets.map((S) => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(W * scale)); canvas.height = Math.max(1, Math.round(S.height * scale));
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
      const draw = () => {
        const g = canvas.getContext('2d');
        g.setTransform(scale, 0, 0, scale, 0, 0);
        g.clearRect(0, 0, W, S.height);
        g.textAlign = 'center'; g.textBaseline = 'middle';
        for (const s of S.signs) {
          // (its ground carried a little above and below it, so that its edges stay its own colour far off)
          g.fillStyle = s.bg; g.fillRect(0, s.top - SIGN_GAP / 2, W, s.px + SIGN_GAP);
          g.fillStyle = s.fg;
          s.lines.forEach((text, i) => {
            let px = s.size;
            g.font = `800 ${px}px ${SIGN_FONT}`;
            while (g.measureText(text).width > W - 36 && px > 14) { px -= 2; g.font = `800 ${px}px ${SIGN_FONT}`; }
            g.fillText(text, W / 2, s.top + (s.px * (i + 0.5)) / s.lines.length + 2);
          });
        }
        texture.needsUpdate = true;
      };
      draw();
      // (painted again once the fonts have come; from then on, on a phone, its pixels let go once the graphics card has
      // them, and painted again whenever they are wanted: painted.js)
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { draw(); letPaintedGo(texture, () => draw()); }).catch(() => {});
      else letPaintedGo(texture, () => draw());
      // the boards: one face each, its picture its part of the sheet
      const n = S.signs.length, P = new Float32Array(n * 18), N = new Float32Array(n * 18), U = new Float32Array(n * 12);
      S.signs.forEach((s, i) => {
        const rx = Math.cos(s.facing), rz = -Math.sin(s.facing), nx = Math.sin(s.facing), nz = Math.cos(s.facing);
        const hw = s.w / 2, hh = s.h / 2;
        const c = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([a, b]) => [s.x + rx * a, s.y + b, s.z + rz * a]);
        const v0 = 1 - (s.top + s.px) / S.height, v1 = 1 - s.top / S.height;
        const uv = [[0, v0], [1, v0], [1, v1], [0, v1]];
        [0, 1, 2, 0, 2, 3].forEach((q, j) => { P.set(c[q], i * 18 + j * 3); N.set([nx, 0, nz], i * 18 + j * 3); U.set(uv[q], i * 12 + j * 2); });
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(P, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(N, 3));
      geometry.setAttribute('uv', new THREE.BufferAttribute(U, 2));
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6, metalness: 0.05 }));
      mesh.name = name;
      mesh.userData.signs = n;
      return mesh;
    });
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
// One piece of the city, built: its steps (a few milliseconds each), at the end its group of meshes, its signs, the
// fixed lights under its decks.
function* buildTile(T, S) {
  const { lite, materials } = S;
  const group = new THREE.Group(); group.name = `oganiru:${T.key}`;
  const M = { tar: new Mesher(), rampTar: new Mesher(), wear: new Mesher(), paint: new Mesher(), kerb: new Mesher(), grass: new Mesher(), pave: new Mesher(), concrete: new Mesher(), soffit: new Mesher(), stain: new Mesher(), solid: new Mesher(), metal: new Mesher(), lit: new Mesher() };
  const shadeSolid = new Batch(), foliage = new Foliage();
  const fixedLights = [], signs = new SignAtlas();
  const ground = groundTile(T, lite);
  if (ground) { const mesh = new THREE.Mesh(ground, materials.ground); mesh.receiveShadow = true; mesh.name = `oganiru:ground:${T.key}`; group.add(mesh); }
  yield;
  for (const r of OGANIRU_ROADS) { if (!runIn(r, T)) continue; roadTile(M, r, T); yield; }
  for (const j of OGANIRU_JUNCTIONS) if (inTile(T, j.x, j.z)) junctionTile(M, j);
  for (const l of OGANIRU_STOP_LINES) if (l.junction.startsWith('peace-ramps') && inTile(T, l.x, l.z)) stopLineTile(M, l);
  for (const rb of OGANIRU_ROUNDABOUTS) if (inTile(T, rb.x, rb.z)) roundaboutTile(M, rb, lite, shadeSolid, foliage);
  yield;
  yield* kerbsTile(M, T);
  yield;
  yield* decksTile(M, T, lite, fixedLights);
  goresTile(M, T);
  yield;
  cuttingTile(M, T);
  signalsTile(M, T);
  signsTile(M, T, signs);
  yield;
  const towers = OGANIRU_TOWERS.filter((t) => inTile(T, t.x, t.z));
  if (towers.length) addTowers(signs, M, towers);
  yield;
  // shade trees along the verges and palms on the expressway's banks, as the town's own (render-world.js addTree)
  let n = 0;
  for (const t of OGANIRU_TREES) {
    if (t.kind === 'slim' || !inTile(T, t.x, t.z)) continue;
    addTree(shadeSolid, foliage, { x: t.x, z: t.z, kind: t.kind, size: t.size, turn: t.turn });
    if ((n += 1) % 60 === 0) yield;
  }
  yield;
  const add = (mesh, name, shadows = true) => { if (!mesh) return; mesh.name = `oganiru:${name}:${T.key}`; mesh.castShadow = shadows; group.add(mesh); };
  const build = (key, material, shadows = true) => { if (!M[key].empty) add(M[key].build(material, { shadows }), key, shadows); };
  build('tar', materials.asphalt, false);
  build('rampTar', materials.rampAsphalt, true);
  build('wear', materials.wear, false);
  build('paint', materials.paint, false); yield;
  build('kerb', materials.kerb, false);
  build('grass', materials.grass, false);
  build('pave', materials.pave, false); yield;
  build('concrete', materials.concrete, true); yield;
  build('soffit', materials.soffit, true);
  build('stain', materials.stain, false);
  build('solid', materials.solid, true);
  build('metal', materials.metal, true);
  build('lit', materials.lit, false); yield;
  if (!shadeSolid.empty) { const m = shadeSolid.build(materials.solid); m.castShadow = true; m.receiveShadow = true; m.name = `oganiru:trunks:${T.key}`; group.add(m); }
  for (const mesh of foliage.build(foliageMaterials())) { mesh.name = `oganiru:leaves:${T.key}`; group.add(mesh); }
  if (!signs.empty) for (const mesh of signs.build(`oganiru:signs:${T.key}`, lite)) group.add(mesh);
  if (towers.length) group.userData.towers = towers.length;
  return { group, fixedLights };
}

// The steps that build the city's own (what all its pieces share): each a few milliseconds' work, `yield` between them
// (main.js runs one or a few a frame). At the end: { group, update, see, letGo, trees, stats, step }. Its pieces are built
// afterwards, a few milliseconds a frame (`update`), as the player comes near them (`see`).
export function* oganiruSteps(scene, { glowMaterial, lite = false, renderer = null, camera = null, fetchFile = (u) => fetch(u), lamps = null } = {}) {
  const group = new THREE.Group(); group.name = 'oganiru';
  // (a phone's signs at half the picture: it reads them from no nearer)
  SIGN_WIDTH = lite ? 512 : 1024;
  const size = lite ? 512 : 1024;
  const textures = {
    asphalt: asphaltTexture(size), concrete: concreteTexture(lite ? 256 : 512), soffit: soffitTexture(lite ? 128 : 256), pavers: paverTexture(lite ? 128 : 256),
  };
  yield;
  // ---- the materials every piece draws with ----
  const kit = buildingKit();
  textures.asphalt.repeat.set(1, 1);
  const groundMap = grassTexture(); groundMap.repeat.set(1, 1);
  const materials = {
    ground: surface({ vertexColors: true, map: groundMap, roughness: 1, metalness: 0 }),
    asphalt: isRoad(weathers(surface({ vertexColors: true, map: textures.asphalt, roughness: 0.93, metalness: 0 }), { darken: 0.42, gloss: 0.66, sheen: 1 })),
    // (the ramps' road over the expressway's where they run into it: drawn over it)
    rampAsphalt: isRoad(weathers(surface({ vertexColors: true, map: textures.asphalt, roughness: 0.93, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }), { darken: 0.42, gloss: 0.66, sheen: 1 })),
    wear: isRoad(weathers(surface({ vertexColors: true, map: textures.asphalt, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), { darken: 0.42, gloss: 0.66, sheen: 1 })),
    paint: weathers(surface({ vertexColors: true, roughness: 0.72, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), { darken: 0.2, gloss: 0.3 }),
    grass: surface({ vertexColors: true, map: grassTexture(), roughness: 0.95, metalness: 0 }),
    pave: weathers(surface({ vertexColors: true, map: textures.pavers, roughness: 0.82, metalness: 0 }), { darken: 0.25, gloss: 0.32, sheen: 0.25 }),
    concrete: weathers(surface({ vertexColors: true, map: textures.concrete, roughness: 0.9, metalness: 0 }), { darken: 0.18 }),
    soffit: weathers(surface({ vertexColors: true, map: textures.soffit, roughness: 0.92, metalness: 0 }), { darken: 0.1 }),
    stain: new THREE.MeshLambertMaterial({ color: linear(0x2d2a24), transparent: true, opacity: 0.28, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    metal: reflects(surface({ vertexColors: true, roughness: 0.45, metalness: 0.55 }), 0.6, 'metal'),
    kerb: weathers(surface({ map: kerbTexture(lite ? 256 : 512), roughness: 0.8, metalness: 0 }), { darken: 0.2 }),
    solid: kit.solid,
    lit: glowMaterial || new THREE.MeshBasicMaterial({ color: 0xfff1c9 }),
  };
  yield;
  // the signals' lamps, the whole city's: one mesh for each colour, each lamp lit or dark by its own phase and its
  // junction's step in the cycle (as Market Road's: render-city.js, which has one mesh a phase)
  const disc = new THREE.CircleGeometry(0.105, 16);
  const COLOURS = { red: 0xff2a1a, amber: 0xffa31a, green: 0x2dff6a };
  const signalMeshes = Object.keys(COLOURS).map((colour) => {
    const list = SIGNAL_LAMPS.filter((l) => l.colour === colour);
    const mesh = new THREE.InstancedMesh(disc, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), c = new THREE.Color();
    list.forEach((l, i) => { e.set(0, l.face, 0); q.setFromEuler(e); m4.compose(new THREE.Vector3(l.x, l.y, l.z), q, new THREE.Vector3(1, 1, 1)); mesh.setMatrixAt(i, m4); mesh.setColorAt(i, c.setHex(0x1a1a1a)); });
    mesh.computeBoundingSphere();
    mesh.name = `oganiru:signals:${colour}`;
    group.add(mesh);
    return { colour, mesh, list, lit: linear(COLOURS[colour]).multiplyScalar(2.4), dark: linear(0x1a1a1a), state: new Uint8Array(list.length) };
  });
  yield;
  const trees = createSlimTrees(group, { lite, fetchFile, renderer });
  // the roadblocks across the roads not built on yet, and the fence along the built land's edge: the city's own, with it
  // (render-closures.js; each piece drawn within its own distance of the eye)
  yield;
  const closures = buildClosures(group, { lite, keep: ofOganiru });
  // the land under the whole city, where its pieces are not built yet
  yield;
  const base = baseGround(lite);
  if (base) { const mesh = new THREE.Mesh(base, materials.ground); mesh.receiveShadow = true; mesh.name = 'oganiru:base-ground'; group.add(mesh); }
  // the programs the city's own need, made ready before it is put in (program-ready.js)
  if (renderer && camera) {
    yield;
    const ready = programsReady(renderer, group, camera, scene);
    while (!ready.step(6)) { if ((yield 'waiting') === 'now') break; }
  }
  scene.add(group);

  // ---- the pieces ----
  const near = lite ? TILE_NEAR.lite : TILE_NEAR.full;
  const S = { lite, materials, textures };
  const pieces = new Map();             // key -> { T, state: 'queued' | 'building' | 'built', steps, group, fixedLights, ready }
  let building = null;
  let compiled = false;
  const budget = lite ? 3 : 6;          // milliseconds a frame for building pieces
  const stats = { built: 0, letGo: 0, building: null, ms: 0, longest: 0 };
  function stepPieces(ms = budget, wait = true) {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      if (!building) {
        // the nearest piece waiting
        let best = null;
        for (const p of pieces.values()) if (p.state === 'queued' && (!best || p.d < best.d)) best = p;
        if (!best) return;
        best.state = 'building'; best.steps = buildTile(best.T, S); building = best;
        stats.building = best.T.key;
      }
      const s0 = performance.now();
      const r = building.steps.next();
      const took = performance.now() - s0;
      stats.ms += took; stats.longest = Math.max(stats.longest, took);
      if (r.done) {
        const p = building;
        building = null; stats.building = null;
        if (p.state !== 'building') { disposeGroup(r.value.group); continue; }
        p.group = r.value.group; p.fixedLights = r.value.fixedLights.map((f) => ({ ...f, region: `city:${p.T.key}` }));
        // (the first piece: its programs made ready before it is shown; the rest share them)
        if (!compiled && wait && renderer && camera) { p.ready = programsReady(renderer, p.group, camera, scene); p.state = 'compiling'; return; }
        show(p);
      }
    }
  }
  function show(p) {
    p.state = 'built'; p.ready = null;
    group.add(p.group);
    if (lamps && p.fixedLights.length) lamps.addFixed(p.fixedLights);
    stats.built += 1;
  }
  function letGoPiece(p) {
    if (p.group) { group.remove(p.group); disposeGroup(p.group); p.group = null; }
    if (lamps) lamps.dropFixed(`city:${p.T.key}`);
    if (p.state === 'building') { p.state = 'dropped'; } else pieces.delete(p.T.key);
    stats.letGo += 1;
  }
  // (each piece's own geometry, signs and their pictures go with it; the materials are the city's)
  const shared = new Set([...Object.values(materials), kit.solid, ...Object.values(foliageMaterials())]);
  function disposeGroup(g) {
    g.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) { if (shared.has(m)) continue; if (m.map) m.map.dispose(); m.dispose(); }
    });
  }

  let clock = 0;
  const nowLit = new Map();
  function update(dt, { night = 0, hour = 12, camera: eye = null, storm = 0 } = {}) {
    clock += dt;
    // the pieces being built, a few milliseconds a frame; the first one's programs made ready
    for (const p of pieces.values()) if (p.state === 'compiling' && p.ready.step(4)) { compiled = true; show(p); }
    stepPieces();
    // the signals: each lamp lit or dark by its phase and its junction's offset in the cycle
    for (const S2 of signalMeshes) {
      let changed = false;
      S2.list.forEach((l, i) => {
        const key = `${l.phase}|${l.offset}`;
        let state = nowLit.get(key);
        if (state === undefined) { state = signalState(l.phase, clock + l.offset); nowLit.set(key, state); }
        const on = state === S2.colour ? 1 : 0;
        if (S2.state[i] !== on) { S2.state[i] = on; S2.mesh.setColorAt(i, on ? S2.lit : S2.dark); changed = true; }
      });
      if (changed) S2.mesh.instanceColor.needsUpdate = true;
    }
    nowLit.clear();
    // (the towers' windows, lit at night: render-skyline.js)
    trees.update(eye, storm);
    closures.update(dt, night, eye ? eye.position : null);
  }
  // (`reach`: how far the eye sees from (x, z). The pieces within `come` of it are built (the nearest first), those
  // beyond `go` let go; of those built, each drawn only within reach of the eye (the towers from further: they stand over
  // everything). Gives whether any of the city is drawn.)
  function see(x, z, reach) {
    const shownAll = oganiruAway(x, z) < reach;
    if (group.visible !== shownAll) group.visible = shownAll;
    for (const T of OGANIRU_TILES) {
      const d = tileAway(T, x, z);
      let p = pieces.get(T.key);
      if (!p && d < near.come && tileHasCity(T)) { p = { T, state: 'queued', d }; pieces.set(T.key, p); }
      if (!p) continue;
      p.d = d;
      if (d > near.go && p.state !== 'queued') { letGoPiece(p); continue; }
      if (d > near.go && p.state === 'queued') { pieces.delete(T.key); continue; }
      // (the towers themselves are the skyline's, seen from anywhere: render-skyline.js; what is at their feet, with the rest
      // of the piece, from as near as the rest)
      if (p.group) p.group.visible = d < reach;
    }
    return shownAll;
  }
  // (shared with the town, and not let go with the city: the town's own materials, its leaves')
  const keep = new Set([glowMaterial, kit.solid, ...Object.values(foliageMaterials())]);
  function letGo() {
    for (const p of [...pieces.values()]) letGoPiece(p);
    pieces.clear();
    scene.remove(group);
    trees.dispose();
    closures.dispose();
    for (const S2 of signalMeshes) { S2.mesh.dispose(); S2.mesh.material.dispose(); }
    disc.dispose();
    for (const m of Object.values(materials)) { if (keep.has(m)) continue; m.dispose(); }
    for (const t of [groundMap, materials.kerb.map, materials.grass.map, textures.asphalt, textures.concrete, textures.soffit, textures.pavers]) if (t) t.dispose();
    if (lamps) for (const T of OGANIRU_TILES) lamps.dropFixed(`city:${T.key}`);
  }
  // every piece near (x, z) built now, whatever it takes (someone put down in the city, the tests, the measuring)
  function buildAround(x, z) {
    see(x, z, Infinity);
    for (const p of pieces.values()) if (p.state === 'compiling') show(p);
    for (let guard = 0; guard < 100000 && [...pieces.values()].some((p) => p.state === 'queued' || p.state === 'building'); guard += 1) stepPieces(1e9, false);
    see(x, z, Infinity);
  }
  return {
    group, update, see, letGo, trees, buildAround,
    // (for the tests and the measuring: the pieces and what is in them)
    pieces: () => [...pieces.values()].map((p) => ({ key: p.T.key, state: p.state, d: Math.round(p.d) })),
    stats: () => ({ pieces: { ...stats, now: [...pieces.values()].filter((p) => p.state === 'built').length, queued: [...pieces.values()].filter((p) => p.state === 'queued').length }, trees: { drawn: trees.drawn, loaded: trees.loaded, failed: trees.failed, of: trees.count } }),
  };
}
// Is any of the city in this piece (its roads, decks, roundabouts, kerbs, trees; or the land round it, near enough to
// be seen)?
const TILE_HAS = new Map(OGANIRU_TILES.map((T) => {
  const has = OGANIRU_ROADS.some((r) => runIn(r, T)) || OGANIRU_DECKS.some((d) => d.path.some((p) => inTile(T, p.x, p.z))) || OGANIRU_KERBED.some((b) => b.x1 > T.x0 && b.x0 < T.x1 && b.z1 > T.z0 && b.z0 < T.z1) || OGANIRU_TREES.some((t) => inTile(T, t.x, t.z)) || OGANIRU_ROUNDABOUTS.some((r) => inTile(T, r.x, r.z));
  // (the land round the city, its hills, where nothing of its own stands: drawn as part of the nearest piece that has it)
  const land = T.x1 > GROUND.x0 && T.x0 < GROUND.x1 && T.z1 > GROUND.z0 && T.z0 < GROUND.z1;
  return [T.key, has || land];
}));
const tileHasCity = (T) => TILE_HAS.get(T.key);
