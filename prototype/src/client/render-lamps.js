// The street lamps, every one of them, drawn as they stand, fall and stand again (31 October 2026, the owner's brief for
// the new city: "Knocking one down depends on speed ... The town's existing street lamps behave the same way"). Which
// lamps there are, where, and which are down: street-lamps.js, shared with the town this page runs.
//
// Each kind of lamp is one shape drawn as many times as there are lamps of it (one instanced mesh for all of them), so
// that any one can be laid down, shaken or raised by itself. Until 31 October 2026 the town's lamps were merged into the
// town's own meshes (render-world.js), Market Road's into its block's (render-city.js), those beyond the town into
// theirs (render-outskirts.js): drawn as they are here, the same shapes, sizes and colours, but unable to fall.
//
// At night each comes on at its own moment, one after another along its street (street-lamps.js lampOnAt), its head lit
// and a pool of light painted on the ground under it; on a wet night that light is also drawn out along the road towards
// the eye, as wet tarmac draws it out. Only the nearest two (on a computer, not a phone) light anything for real.
//
// Knocked over (sim/lamps.js), a lamp falls the way it was hit, its pole snapping at its foot and turning as it goes so
// that it lies flat, and breaks on the road: its glass flies, sparks, and it clangs. It lies there, dark, until it stands
// again: put back unseen once it has lain LAMP_KNOCK.back seconds where nobody here is looking at it, or rising in
// front of whoever is still looking after LAMP_KNOCK.watched (the town raises it then: lamps.js). Knocked gently, it
// shakes and its lamp flickers.
import { STREET_LAMPS, LAMP_KNOCK, lampsDown, lampOnAt, raiseLamp } from '../sim/street-lamps.js';
import { cityGroundY, zoneGroundY } from '../sim/zone.js';
import { Batch, place, linear, surface, buildingKit } from './render-kit.js';
import { reflects } from './render-finish.js';
import { STREET_LAMP } from './light.js';

// Which part of the land each kind stands in: drawn only while that part is (the land beyond the town and the city are
// let go on a phone far from them, main.js).
const REGION = Object.freeze({ town: 'town', block: 'town', outskirt: 'outskirts', median: 'city', 'median+banner': 'city', edge: 'city', ornate: 'city', deck: 'city' });
// (how each lamp is drawn: its kind, the city's downtown middle-strip lamps with their banners a shape of their own)
const drawnKind = (l) => (l.banner ? `${l.kind}+banner` : l.kind);
const FIXED_MOST = 320;
const GREY = 0x4a4d52, DARK = 0x3a3d42, STONE = 0x8d877b, LAMPLIGHT = 0xfff1c9;
const STEEL = 0x9ba1a7, STEEL_DARK = 0x5d6268, IRON = 0x1d1f22, CONCRETE = 0xb6b1a5;

// A tube from a to b ([y, z] in the lamp's own upright plane, x = 0), for the curved arms.
function tube(B, a, b, r0, r1, colour, segs) {
  const dy = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dy, dz);
  B.round(new THREE.CylinderGeometry(r1, r0, len, segs), place(0, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0, 1, 1, 1, Math.atan2(dz, dy)), colour);
}
// A curved arm through the points ([y, z]), from the pole out.
function arm(B, points, r, colour, segs, side = 1) {
  for (let k = 1; k < points.length; k += 1) tube(B, [points[k - 1][0], points[k - 1][1] * side], [points[k][0], points[k][1] * side], r * (1 - (k - 1) * 0.08), r * (1 - k * 0.08), colour, segs);
}

// Each kind's shape, standing at its foot with its arm (if it has one) reaching along +z: what is solid, what is its
// lamp's glass, what is cloth (the banners), where its heads are ([x, y, z]), how wide the pool under each, how thick
// its pole is at the foot, and whether it is of painted steel (the city's and Market Road's) or the town's plain finish.
function shapeOf(kind, lite) {
  const B = new Batch(), G = new Batch(), C = new Batch();
  const cyl = (rt, rb, h, y, colour, segs) => B.round(new THREE.CylinderGeometry(rt, rb, h, segs), place(0, y, 0), colour);
  const segs = lite ? 8 : 12;
  let heads, pool, foot, metal;
  if (kind === 'town') {
    // (render-world.js until 31 October 2026, turned so its arm reaches along +z)
    cyl(0.06, 0.1, 5.4, 2.7, GREY, 8);
    B.box(0.24, 0.3, 0.24, place(0, 0.15, 0), STONE);
    B.round(new THREE.CylinderGeometry(0.035, 0.035, 1.0, 6), place(0, 5.3, 0.45, 0, 1, 1, 1, Math.PI / 2 + 0.15), GREY);
    B.box(0.3, 0.1, 0.6, place(0, 5.33, 0.85), DARK);
    G.box(0.24, 0.05, 0.5, place(0, 5.27, 0.85), LAMPLIGHT);
    heads = [[0, 5.27, 0.85]]; pool = 15; foot = 0.1; metal = false;
  } else if (kind === 'block') {
    // (render-city.js until 31 October 2026)
    cyl(0.08, 0.13, 8.4, 4.2, 0x3b3f44, 10);
    cyl(0.2, 0.24, 0.5, 0.25, 0x33363a, 10);
    B.round(new THREE.CylinderGeometry(0.045, 0.055, 2.0, 8), place(0, 8.3, 0.95, 0, 1, 1, 1, Math.PI / 2 - 0.12), 0x3b3f44);
    B.box(0.32, 0.16, 0.75, place(0, 8.42, 1.85), 0x2c2f33);
    G.box(0.24, 0.03, 0.62, place(0, 8.33, 1.85), 0xfff1d0);
    heads = [[0, 8.33, 1.85]]; pool = 17; foot = 0.13; metal = true;
  } else if (kind === 'outskirt') {
    // (render-outskirts.js until 31 October 2026)
    cyl(0.07, 0.11, 6.2, 3.1, GREY, 8);
    B.box(0.26, 0.3, 0.26, place(0, 0.15, 0), STONE);
    B.box(0.1, 0.08, 1.3, place(0, 6.15, 0.6), GREY);
    B.box(0.32, 0.1, 0.62, place(0, 6.12, 1.15), DARK);
    G.box(0.26, 0.05, 0.52, place(0, 6.06, 1.15), LAMPLIGHT);
    heads = [[0, 6.06, 1.15]]; pool = 15; foot = 0.11; metal = false;
  } else if (kind === 'median' || kind === 'median+banner') {
    // Oganiru City's middle strips: a tall galvanised pole on a concrete plinth, two arms curving out over both
    // carriageways, a flat lamp at the end of each; downtown, two banners hung from it, one over each carriageway's side
    // (green, white and green, facing the traffic each way)
    B.box(0.7, 0.5, 0.7, place(0, 0.25, 0), CONCRETE);
    B.box(0.46, 0.06, 0.46, place(0, 0.53, 0), STEEL_DARK);
    cyl(0.09, 0.16, 10.5, 0.55 + 5.25, STEEL, segs);
    const curve = [[10.3, 0], [10.95, 0.75], [11.3, 1.7], [11.42, 2.7], [11.42, 3.2]];
    for (const side of [1, -1]) {
      arm(B, curve, 0.065, STEEL, lite ? 6 : 8, side);
      B.box(0.42, 0.13, 0.95, place(0, 11.38, 3.42 * side), 0x51565c);
      G.box(0.34, 0.03, 0.8, place(0, 11.3, 3.42 * side), LAMPLIGHT);
    }
    cyl(0.1, 0.1, 0.3, 10.95, STEEL_DARK, segs);
    if (kind === 'median+banner') for (const side of [1, -1]) {
      // its two rods out from the pole, top and foot, and the cloth between them in three bands
      for (const y of [8.3, 5.95]) B.round(new THREE.CylinderGeometry(0.018, 0.018, 0.92, 6), place(0, y, side * 0.55, 0, 1, 1, 1, Math.PI / 2), STEEL_DARK);
      for (const [y, h, colour] of [[7.83, 0.84, 0x1d7a46], [7.12, 0.58, 0xf2f0e9], [6.42, 0.82, 0x1d7a46]]) C.box(0.025, h, 0.74, place(0, y, side * 0.6), colour);
    }
    heads = [[0, 11.2, 3.4], [0, 11.2, -3.4]]; pool = 21; foot = 0.16; metal = true;
  } else if (kind === 'edge') {
    // at the roads' edges and round the roundabout: one arm out over the road
    B.box(0.6, 0.4, 0.6, place(0, 0.2, 0), CONCRETE);
    cyl(0.08, 0.14, 9.6, 0.4 + 4.8, STEEL, segs);
    arm(B, [[9.35, 0], [9.95, 0.7], [10.28, 1.6], [10.38, 2.45], [10.38, 2.85]], 0.06, STEEL, lite ? 6 : 8);
    B.box(0.4, 0.12, 0.88, place(0, 10.34, 3.0), 0x51565c);
    G.box(0.32, 0.03, 0.74, place(0, 10.27, 3.0), LAMPLIGHT);
    heads = [[0, 10.2, 3.0]]; pool = 19; foot = 0.14; metal = true;
  } else if (kind === 'ornate') {
    // downtown: black iron, a fluted foot, a slim column, a lantern of glass under a pointed cap
    B.round(new THREE.LatheGeometry([[0.27, 0], [0.27, 0.1], [0.22, 0.16], [0.18, 0.42], [0.13, 0.58], [0.1, 0.72], [0.0001, 0.72]].map(([r, y]) => new THREE.Vector2(r, y)), segs), place(0, 0, 0), IRON);
    cyl(0.055, 0.075, 2.75, 0.72 + 1.375, IRON, segs);
    cyl(0.11, 0.07, 0.14, 3.5, IRON, segs);
    cyl(0.07, 0.15, 0.16, 3.62, IRON, segs);
    for (const [cx, cz] of [[0.17, 0.17], [-0.17, 0.17], [0.17, -0.17], [-0.17, -0.17]]) B.box(0.035, 0.62, 0.035, place(cx, 4.0, cz), IRON);
    B.round(new THREE.ConeGeometry(0.31, 0.3, 4), place(0, 4.46, 0, Math.PI / 4), IRON);
    B.round(new THREE.SphereGeometry(0.05, 8, 6), place(0, 4.66, 0), IRON);
    G.box(0.32, 0.56, 0.32, place(0, 4.0, 0), 0xffe6b8);
    heads = [[0, 4.0, 0]]; pool = 10; foot = 0.12; metal = true;
  } else {
    // 'deck': on a deck's wall, its arm over the road on the deck
    B.box(0.36, 0.08, 0.36, place(0, 0.04, 0), STEEL_DARK);
    cyl(0.07, 0.12, 7.5, 0.08 + 3.75, STEEL, segs);
    arm(B, [[7.3, 0], [7.82, 0.65], [8.08, 1.5], [8.14, 2.3], [8.14, 2.5]], 0.055, STEEL, lite ? 6 : 8);
    B.box(0.36, 0.11, 0.78, place(0, 8.1, 2.62), 0x51565c);
    G.box(0.3, 0.03, 0.66, place(0, 8.04, 2.62), LAMPLIGHT);
    heads = [[0, 8.0, 2.6]]; pool = 17; foot = 0.12; metal = true;
  }
  const scratch = new THREE.MeshBasicMaterial();
  const solid = B.build(scratch).geometry, glow = G.build(scratch).geometry, cloth = C.empty ? null : C.build(scratch).geometry;
  scratch.dispose();
  return { solid, glow, cloth, heads, pool, foot, metal };
}

// The lamps' glass: as the town's window glass (render-world.js glowMaterial), lit from within at night, each lamp by
// itself (`lampOn`, one number a lamp: 0 dark, 1 lit).
function lampGlass() {
  const m = reflects(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.3, emissive: linear(0xffc66b), emissiveIntensity: 0 }), 1);
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float lampOn;\nvarying float vLampOn;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLampOn = lampOn;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vLampOn;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vLampOn;');
  };
  m.customProgramCacheKey = () => 'pcw-lamp-glass';
  return m;
}

// A soft round pool of lamplight, and the streak of it on a wet road (bright at the lamp's end, fading towards the eye).
function poolTexture() {
  const size = 64, c = document.createElement('canvas');
  c.width = size; c.height = size;
  const g = c.getContext('2d');
  const fall = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  fall.addColorStop(0, 'rgba(255,214,160,1)'); fall.addColorStop(0.35, 'rgba(255,200,138,0.5)'); fall.addColorStop(1, 'rgba(255,190,120,0)');
  g.fillStyle = fall; g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}
function streakTexture() {
  const w = 32, h = 128, c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const across = 1 - Math.min(1, Math.abs((x + 0.5) / w - 0.5) * 2);
    const along = y / (h - 1);                   // 0 at the lamp's end, 1 at the eye's
    const a = Math.pow(across, 1.8) * Math.pow(1 - along, 1.6) * (0.75 + 0.25 * Math.sin(y * 0.9 + x * 0.3));
    const k = (y * w + x) * 4;
    img.data[k] = 255; img.data[k + 1] = 196; img.data[k + 2] = 128; img.data[k + 3] = Math.round(255 * Math.max(0, Math.min(1, a)));
  }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

const wrap = (a) => { let d = a % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const ease = (u) => { const k = Math.max(0, Math.min(1, u)); return k * k * (3 - 2 * k); };

export function createStreetLamps(scene, { lite = false, now = () => performance.now() / 1000, onSound = () => {} } = {}) {
  const kit = buildingKit();
  const metal = reflects(surface({ vertexColors: true, roughness: 0.45, metalness: 0.55 }), 0.6, 'metal');
  const glass = lampGlass();
  const kinds = new Map();
  // every lamp: its kind's meshes, its place among them, where its foot is drawn, and its heads
  const lamps = STREET_LAMPS.map((l, i) => ({ l, i, kind: drawnKind(l), slot: 0, y: 0, heads: [], on: 0, shown: true }));
  for (const L of lamps) {
    const l = L.l;
    if (!kinds.has(L.kind)) kinds.set(L.kind, { list: [] });
    const K = kinds.get(L.kind);
    L.slot = K.list.length; K.list.push(L);
    // where its foot is drawn: as each was drawn before (the town's at the ground's level of the time, Market Road's on
    // its pavement, those beyond the town on the ground or the bridge's deck), the city's where the city puts them
    L.y = l.kind === 'town' ? 0 : l.kind === 'block' ? 0.08 + cityGroundY(l.x, l.z) : l.kind === 'outskirt' ? zoneGroundY(l.x, l.z) : l.y;
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qa = new THREE.Quaternion(), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), axis = new THREE.Vector3(), upY = new THREE.Vector3(0, 1, 0), v3 = new THREE.Vector3();
  for (const [kind, K] of kinds) {
    const shape = shapeOf(kind, lite);
    K.shape = shape;
    const n = K.list.length;
    K.solid = new THREE.InstancedMesh(shape.solid, shape.metal ? metal : kit.solid, n);
    K.solid.castShadow = true; K.solid.receiveShadow = true;
    K.solid.name = `lamps:${kind}`;
    const on = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    on.setUsage(THREE.DynamicDrawUsage);
    shape.glow.setAttribute('lampOn', on);
    K.on = on;
    K.glow = new THREE.InstancedMesh(shape.glow, glass, n);
    K.glow.name = `lamp-glass:${kind}`;
    K.cloth = shape.cloth ? new THREE.InstancedMesh(shape.cloth, kit.solid, n) : null;
    if (K.cloth) { K.cloth.castShadow = true; K.cloth.receiveShadow = true; K.cloth.name = `lamp-banners:${kind}`; }
    for (const L of K.list) {
      const l = L.l;
      q.setFromAxisAngle(upY, l.heading);
      m4.compose(pos.set(l.x, L.y, l.z), q, one);
      K.solid.setMatrixAt(L.slot, m4); K.glow.setMatrixAt(L.slot, m4);
      if (K.cloth) K.cloth.setMatrixAt(L.slot, m4);
      L.heads = shape.heads.map(([hx, hy, hz]) => { v3.set(hx, hy, hz).applyQuaternion(q); return { x: l.x + v3.x, y: L.y + v3.y, z: l.z + v3.z, ground: l.kind === 'deck' ? l.gy : zoneGroundY(l.x + v3.x, l.z + v3.z), size: shape.pool, lamp: L }; });
    }
    K.solid.computeBoundingSphere(); K.glow.computeBoundingSphere();
    K.region = REGION[kind] || 'town';
    // (where its lamps stand: none of it is drawn while the eye is further than it sees from all of them, as the town's
    // own squares are not, render-kit.js: before 1 November 2026 they were drawn in the town's squares)
    K.box = { x0: Math.min(...K.list.map((L) => L.l.x)), x1: Math.max(...K.list.map((L) => L.l.x)), z0: Math.min(...K.list.map((L) => L.l.z)), z1: Math.max(...K.list.map((L) => L.l.z)) };
    scene.add(K.solid); scene.add(K.glow);
    if (K.cloth) { K.cloth.computeBoundingSphere(); scene.add(K.cloth); }
  }
  const heads = lamps.flatMap((L) => L.heads);

  // the pools of light under the heads, and the streaks of it on a wet road
  const poolMaterial = new THREE.MeshBasicMaterial({ map: poolTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const disc = new THREE.PlaneGeometry(1, 1); disc.rotateX(-Math.PI / 2);
  // (with room for the fixed lights that come later: the lamps under the city's decks)
  const pools = new THREE.InstancedMesh(disc, poolMaterial, heads.length + FIXED_MOST);
  pools.frustumCulled = false; pools.renderOrder = 2; pools.visible = false; pools.name = 'lamp-pools';
  scene.add(pools);
  const STREAKS = lite ? 16 : 40;
  const streakMaterial = new THREE.MeshBasicMaterial({ map: streakTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: true, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 });
  const strip = new THREE.PlaneGeometry(1, 1); strip.rotateX(-Math.PI / 2); strip.translate(0, 0, 0.5);
  const streaks = new THREE.InstancedMesh(strip, streakMaterial, STREAKS);
  streaks.frustumCulled = false; streaks.renderOrder = 3; streaks.visible = false; streaks.count = 0; streaks.name = 'lamp-streaks';
  scene.add(streaks);
  // (fixed lights that are never knocked down: the lamps under the city's decks, render-oganiru.js)
  const fixed = [];

  // the glass and the sparks of a lamp broken on the road
  const BITS = 160;
  const bitGeometry = new THREE.BufferGeometry();
  const bitPos = new Float32Array(BITS * 3), bitColour = new Float32Array(BITS * 3);
  bitGeometry.setAttribute('position', new THREE.BufferAttribute(bitPos, 3).setUsage(THREE.DynamicDrawUsage));
  bitGeometry.setAttribute('color', new THREE.BufferAttribute(bitColour, 3).setUsage(THREE.DynamicDrawUsage));
  const bits = new THREE.Points(bitGeometry, new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  bits.frustumCulled = false; bits.visible = false; bits.name = 'lamp-bits';
  scene.add(bits);
  const flying = [];
  function scatter(x, y, z, ground, dir) {
    const fx = Math.sin(dir), fz = Math.cos(dir);
    for (let k = 0; k < 44 && flying.length < BITS; k += 1) {
      const spark = k % 3 === 0, a = Math.random() * Math.PI * 2, out = 1 + Math.random() * (spark ? 4 : 2.5);
      flying.push({ x, y, z, ground, vx: Math.cos(a) * out + fx * 1.5, vy: 1 + Math.random() * (spark ? 4.5 : 2.5), vz: Math.sin(a) * out + fz * 1.5, life: spark ? 0.35 + Math.random() * 0.45 : 1.4 + Math.random() * 1.2, age: 0, spark });
    }
  }
  function stepBits(dt) {
    let n = 0;
    for (let k = flying.length - 1; k >= 0; k -= 1) {
      const b = flying[k];
      b.age += dt;
      if (b.age >= b.life) { flying.splice(k, 1); continue; }
      b.vy -= 9.8 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (b.y < b.ground + 0.02) { b.y = b.ground + 0.02; b.vy = Math.abs(b.vy) * 0.25; b.vx *= 0.55; b.vz *= 0.55; }
    }
    for (const b of flying) {
      const fade = 1 - b.age / b.life;
      bitPos[n * 3] = b.x; bitPos[n * 3 + 1] = b.y; bitPos[n * 3 + 2] = b.z;
      if (b.spark) { bitColour[n * 3] = 1.6 * fade; bitColour[n * 3 + 1] = 0.9 * fade; bitColour[n * 3 + 2] = 0.35 * fade; }
      else { const glint = 0.35 + 0.65 * Math.abs(Math.sin(b.age * 23 + n)); bitColour[n * 3] = 0.8 * glint * fade; bitColour[n * 3 + 1] = 0.88 * glint * fade; bitColour[n * 3 + 2] = 0.95 * glint * fade; }
      n += 1;
    }
    bitGeometry.setDrawRange(0, n);
    bitGeometry.attributes.position.needsUpdate = true; bitGeometry.attributes.color.needsUpdate = true;
    bits.visible = n > 0;
  }

  // the two nearest lamps light what is round them, on a computer
  const lights = [];
  for (let k = 0; k < (lite ? 0 : 2); k += 1) { const light = new THREE.PointLight(0xffc98a, 0, STREET_LAMP.distance, STREET_LAMP.decay); light.position.y = -100; scene.add(light); lights.push(light); }

  // ---- each lamp as it is now ----
  const regions = { town: true, outskirts: false, city: false };
  const shown = new Map();          // lamp -> what this page last drew it as: { seq, phase, at, dir, roll }
  const shaking = new Map();        // lamp -> when a gentle knock began (this page's clock, seconds)
  let clock = 0;
  // where a lamp `L` is drawn, `fall` (0 standing, 1 lying) of the way down, falling the way `dir`, its arm turned
  // `roll` about its pole, and swaying `sway` radians the way `swayDir`
  function setLamp(L, fall, dir = 0, roll = 0, sway = 0, swayDir = 0) {
    const K = kinds.get(L.kind), l = L.l;
    // (drawn as it already is: nothing to send again)
    const key = fall === 0 && sway === 0 ? 0 : fall * 1e6 + roll * 1e3 + sway * 7 + dir;
    if (L.drawnAs === key) return;
    L.drawnAs = key;
    q.setFromAxisAngle(upY, l.heading + roll);
    let lift = 0;
    if (fall > 0) {
      axis.set(Math.cos(dir), 0, -Math.sin(dir));
      const tilt = fall * (Math.PI / 2 - 0.02);
      qa.setFromAxisAngle(axis, tilt); q.premultiply(qa);
      lift = K.shape.foot * Math.sin(tilt);
    } else if (sway) {
      axis.set(Math.cos(swayDir), 0, -Math.sin(swayDir));
      qa.setFromAxisAngle(axis, sway); q.premultiply(qa);
    }
    m4.compose(pos.set(l.x, L.y + lift, l.z), q, one);
    K.solid.setMatrixAt(L.slot, m4); K.glow.setMatrixAt(L.slot, m4);
    K.solid.instanceMatrix.needsUpdate = true; K.glow.instanceMatrix.needsUpdate = true;
    if (K.cloth) { K.cloth.setMatrixAt(L.slot, m4); K.cloth.instanceMatrix.needsUpdate = true; }
    K.moved = true;
  }
  // how far round a lamp turns as it falls, so that it lies with its arm flat on the road, not dug into it
  const rollOf = (L, dir) => { if (!L.heads.length || L.kind === 'ornate') return 0; const a = wrap(dir + Math.PI / 2 - L.l.heading), b = wrap(dir - Math.PI / 2 - L.l.heading); return Math.abs(a) < Math.abs(b) ? a : b; };

  const frustum = new THREE.Frustum(), viewProjection = new THREE.Matrix4(), sphere = new THREE.Sphere();
  // Is someone here looking at lamp `L` (it is near, and in view)?
  function seen(L, camera) {
    if (!camera) return false;
    const l = L.l;
    if (Math.hypot(l.x - camera.position.x, l.z - camera.position.z) > 160) return false;
    sphere.center.set(l.x, L.y + 4, l.z); sphere.radius = 7;
    return frustum.intersectsSphere(sphere);
  }

  let lastNight = -1, onTimer = 0, lightTimer = 0, streakTimer = 0, poolsDirty = true;
  const poolAt = new THREE.Matrix4();
  function placePools() {
    let n = 0;
    for (const h of heads) {
      const L = h.lamp;
      const lit = L.on > 0.5 && L.shown && regions[REGION[L.kind] || 'town'];
      poolAt.makeScale(lit ? h.size : 0, 1, lit ? h.size : 0);
      poolAt.setPosition(h.x, h.ground + 0.07, h.z);
      pools.setMatrixAt(n, poolAt);
      n += 1;
    }
    for (const f of fixed) { const lit = f.on && regions[f.region || 'city']; poolAt.makeScale(lit ? f.size : 0, 1, lit ? f.size : 0); poolAt.setPosition(f.x, f.ground + 0.07, f.z); if (n < pools.instanceMatrix.count) pools.setMatrixAt(n, poolAt); n += 1; }
    pools.count = Math.min(n, pools.instanceMatrix.count);
    pools.instanceMatrix.needsUpdate = true;
    poolsDirty = false;
  }

  // (how far from (x, z) the nearest of a kind's lamps can be: the distance to the box they stand in)
  const boxAway = (b, x, z) => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1));
  // `reach`: how far the eye sees from `target` (main.js), a kind's lamps all beyond it not drawn
  function update(dt, { night = 0, wet = 0, camera = null, hall = false, target = null, reach = Infinity } = {}) {
    clock += dt;
    const t = now();
    if (camera) { camera.updateMatrixWorld(); viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(viewProjection); }
    // the lamps down, falling, rising or shaking
    const down = lampsDown();
    for (const [i, d] of down) {
      const L = lamps[i];
      if (!L) continue;
      let s = shown.get(i);
      if (!s || s.seq !== d.seq) {
        s = { seq: d.seq, broke: false, roll: rollOf(L, d.dir), dir: d.dir };
        // (one that fell long before this page heard of it lies there already, broken)
        if (t - d.at > LAMP_KNOCK.fall + 0.5) s.broke = true;
        shown.set(i, s);
        shaking.delete(i);
      }
      if (!d.up) {
        const age = t - d.at;
        // put back unseen, once it has lain long enough where nobody here is looking
        if (age >= LAMP_KNOCK.back && !seen(L, camera)) { raiseLamp(i, t - LAMP_KNOCK.rise - 0.01); setLamp(L, 0); L.down = false; continue; }
        const u = Math.min(1, Math.max(0, age / LAMP_KNOCK.fall));
        // (it falls as things fall: slowly at first, then faster; a little bounce where it lands)
        const f = u < 1 ? u * u : 1 - 0.035 * Math.max(0, Math.sin(Math.min(1, (age - LAMP_KNOCK.fall) / 0.35) * Math.PI)) * (age - LAMP_KNOCK.fall < 0.35 ? 1 : 0);
        setLamp(L, f, s.dir, s.roll * ease(u));
        L.down = true;
        if (u >= 1 && !s.broke) {
          s.broke = true;
          // where its head came down: glass and sparks, and the sound of it
          const h = L.heads[0] || { x: L.l.x, y: L.y + 4, z: L.l.z };
          const len = Math.hypot(h.x - L.l.x, h.z - L.l.z, h.y - L.y);
          const hx = L.l.x + Math.sin(s.dir) * len, hz = L.l.z + Math.cos(s.dir) * len;
          scatter(hx, L.y + 0.3, hz, L.l.kind === 'deck' ? L.l.gy : zoneGroundY(hx, hz), s.dir);
          onSound('down', hx, hz);
        }
      } else {
        // rising again (the town raised it: lamps.js), over LAMP_KNOCK.rise
        const u = Math.min(1, Math.max(0, (t - d.up) / LAMP_KNOCK.rise));
        if (u >= 1) { if (L.down) { setLamp(L, 0); L.down = false; } continue; }
        setLamp(L, 1 - ease(u), s.dir, s.roll * (1 - ease(u)));
        L.down = true;
      }
    }
    // those up again that this page still had down
    for (const [i, s] of shown) {
      const d = down.get(i);
      if (d && (!d.up || t - d.up < LAMP_KNOCK.rise)) continue;
      const L = lamps[i];
      if (L && L.down) { setLamp(L, 0); L.down = false; }
      if (!d) shown.delete(i);
      void s;
    }
    // shaken by a gentle knock
    for (const [i, from] of shaking) {
      const L = lamps[i], age = clock - from;
      if (!L || L.down) { shaking.delete(i); continue; }
      if (age >= LAMP_KNOCK.shake) { setLamp(L, 0); shaking.delete(i); continue; }
      const fade = 1 - age / LAMP_KNOCK.shake;
      setLamp(L, 0, 0, 0, 0.045 * fade * Math.sin(age * Math.PI * 2 * 3.1), L.shakeDir || 0);
    }

    // lit or not: each at its own moment at dusk, none down or in a hall, flickering while it shakes
    onTimer += dt;
    const flicker = shaking.size > 0;
    if (onTimer > 0.25 || flicker || Math.abs(night - lastNight) > 0.01) {
      onTimer = 0; lastNight = night;
      for (const [, K] of kinds) {
        let changed = false;
        const visible = !!regions[K.region] && (!target || boxAway(K.box, target.x, target.z) < reach);
        if (K.solid.visible !== visible) { K.solid.visible = visible; K.glow.visible = visible; if (K.cloth) K.cloth.visible = visible; }
        for (const L of K.list) {
          let on = !hall && !L.down && night > lampOnAt(L.l) ? 1 : 0;
          if (on && shaking.has(L.i)) on = Math.random() < 0.55 ? 1 : 0.15;
          if (on !== L.on) { L.on = on; K.on.array[L.slot] = on; changed = true; poolsDirty = true; }
        }
        if (changed) K.on.needsUpdate = true;
      }
      for (const f of fixed) { const on = !hall && night > 0.15; if (on !== f.on) { f.on = on; poolsDirty = true; } }
    }
    glass.emissiveIntensity = night * 1.5;
    if (poolsDirty) placePools();
    pools.visible = night > 0.02;
    poolMaterial.opacity = night * (0.5 + 0.25 * wet);

    // on a wet night, the light of the lamps near the eye drawn out along the road towards it
    streakTimer += dt;
    if (camera && night > 0.05 && wet > 0.05 && streakTimer > 0.05) {
      streakTimer = 0;
      const ex = camera.position.x, ez = camera.position.z;
      const near = [];
      for (const h of heads) { const L = h.lamp; if (L.on < 0.5 || !regions[REGION[L.kind] || 'town']) continue; const d = Math.hypot(h.x - ex, h.z - ez); if (d < 130 && d > 2) near.push([d, h]); }
      near.sort((a, b) => a[0] - b[0]);
      let n = 0;
      for (const [d, h] of near) {
        if (n >= STREAKS) break;
        const heading = Math.atan2(ex - h.x, ez - h.z);
        const len = Math.min(d * 0.85, 9 + h.y * 1.6);
        q.setFromAxisAngle(upY, heading);
        m4.compose(pos.set(h.x, h.ground + 0.075, h.z), q, v3.set(0.9 + h.y * 0.05, 1, len));
        streaks.setMatrixAt(n, m4);
        n += 1;
      }
      streaks.count = n; streaks.instanceMatrix.needsUpdate = true;
    }
    streaks.visible = night > 0.05 && wet > 0.05 && streaks.count > 0;
    streakMaterial.opacity = Math.min(1, night * wet * 0.85);

    // the real lights, at the two nearest lit heads
    lightTimer += dt;
    if (lights.length && target && lightTimer > 0.5) {
      lightTimer = 0;
      const near = [];
      for (const h of heads) { if (h.lamp.on < 0.5 || !regions[REGION[h.lamp.kind] || 'town']) continue; const d = Math.hypot(h.x - target.x, h.z - target.z); if (d < 60) near.push([d, h]); }
      near.sort((a, b) => a[0] - b[0]);
      lights.forEach((light, k) => { const h = near[k] && near[k][1]; if (h) light.position.set(h.x, h.y - 0.45, h.z); else light.position.y = -100; });
    }
    for (const light of lights) light.intensity = hall || light.position.y < -50 ? 0 : night * STREET_LAMP.intensity;
    if (flying.length || bits.visible) stepBits(dt);
    for (const [, K] of kinds) if (K.moved) { K.moved = false; K.solid.computeBoundingSphere(); K.glow.computeBoundingSphere(); if (K.cloth) K.cloth.computeBoundingSphere(); }
  }

  return {
    update,
    heads,
    lights,
    // which parts of the land are drawn now: { town, outskirts, city }
    show(which) { let changed = false; for (const k of Object.keys(which)) if (regions[k] !== !!which[k]) { regions[k] = !!which[k]; changed = true; } if (changed) { poolsDirty = true; lastNight = -1; } },
    // knocked gently: it shakes, and its lamp flickers (`dir`: the way it was pushed)
    shake(i, dir = 0) { const L = lamps[i]; if (!L || L.down) return; L.shakeDir = dir; shaking.set(i, clock); onSound('hit', L.l.x, L.l.z); },
    // knocked down here: the sound of it snapping (it falls in `update`)
    snapped(i) { const L = lamps[i]; if (L) onSound('snap', L.l.x, L.l.z); },
    // lamps that are never knocked down, only lit at night (their pools: { x, z, ground, size, region })
    addFixed(list) { for (const f of list.slice(0, Math.max(0, FIXED_MOST - fixed.length))) fixed.push({ ...f, on: false }); poolsDirty = true; },
    // let go of the fixed lights of a part of the land let go (`region`)
    dropFixed(region) { for (let k = fixed.length - 1; k >= 0; k -= 1) if ((fixed[k].region || 'city') === region) fixed.splice(k, 1); poolsDirty = true; },
    // (for the tests: how each is drawn now)
    drawnOf(i) { const L = lamps[i]; if (!L) return null; const K = kinds.get(L.kind); K.solid.getMatrixAt(L.slot, m4); const e = m4.elements; return { x: e[12], y: e[13], z: e[14], up: e[5], on: L.on, down: !!L.down, kind: L.l.kind, banner: !!K.cloth, shown: K.solid.visible }; },
    stats: () => ({ kinds: kinds.size, lamps: lamps.length, heads: heads.length, lit: lamps.filter((L) => L.on > 0.5).length, down: lamps.filter((L) => L.down).length, flying: flying.length, regions: { ...regions }, fixed: fixed.length }),
  };
}
