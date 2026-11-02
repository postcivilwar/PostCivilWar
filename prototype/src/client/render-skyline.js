// Oganiru City's towers, the whole downtown's (Stage 3, 2 November 2026; the owner's brief of 31 October, "The whole
// downtown and the skyline"): their walls with their windows, their glass lobbies, their tops (crowns set back in
// steps, the stone ones' pyramids, the tallest glass ones' masts) and the lit bands round the tallest crowns. Built once
// for the whole city, a phone's as well as a computer's, so that the skyline is seen from the town and from the flyovers
// whether or not the city near it is built; drawn as one thing for each kind of wall, one for the lobbies, one for the
// tops and one for the bands. What is at a tower's foot (its columns, canopy and steps, its doors, its shops and their
// names) and its finer work (the white towers' ribs, the stone ones' cornices and finials, the plant on the roofs) is
// drawn by the city's pieces near it, render-oganiru.js: far towers are simpler.
//
// The haze: the town's air fades everything out beyond a few hundred metres (render-sky.js), the more the nearer the
// ground (world-shading.js). The towers stand up out of it: the higher up a tower, the less of the haze over it, so that
// from the town, a kilometre off, their upper storeys are seen, pale, and at night their lit windows.
//
//   const steps = skylineSteps(scene, { lite, renderer, camera })   a few milliseconds a step; at the end:
//   { group, update(dt, { night, hour }), show(on), see(x, z), letGo(), stats() }

import { OGANIRU_TOWERS } from '../sim/zone.js';
import { place, linear, noise, surface } from './render-kit.js';
import { reflects, weathers } from './render-finish.js';
import { Mesher } from './render-mesher.js';
import { programsReady } from './program-ready.js';

// ------------------------------------------------------------------------------------------- the pictures --
function canvasOf(size, paint) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  paint(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const rnd = (i, k) => noise(i * 1.37 + k * 17.1, k * 3.7 + i * 0.13);

// A tower's walls, as a picture of 9 bays by 4 storeys (14.4 m each way), near-white where the material's own colour
// shows through. `kind`: which wall.
export const FACADES = Object.freeze({
  'glass-blue': { frame: '#c9d2da', glass: [62, 108, 150], spandrel: null, ribs: 0, punched: false },
  'glass-grey': { frame: '#8c9399', glass: [92, 102, 112], spandrel: null, ribs: 0, punched: false },
  'office-teal': { frame: '#dfe5e6', glass: [52, 120, 122], spandrel: '#e8ecea', ribs: 0, punched: false },
  round: { frame: '#d8dde0', glass: [84, 126, 160], spandrel: '#e2e5e6', ribs: 0, punched: false },
  'ribbed-white': { frame: '#f1efe9', glass: [70, 84, 96], spandrel: '#f1efe9', ribs: 1, punched: true },
  stone: { frame: '#cdbb9b', glass: [58, 70, 78], spandrel: '#c4b190', ribs: 0, punched: true },
  // (Stage 3: a teal glass tower, and offices of blue glass and of grey, a band at each floor)
  'glass-teal': { frame: '#c3d1cf', glass: [46, 112, 114], spandrel: null, ribs: 0, punched: false },
  'office-blue': { frame: '#e2e6e9', glass: [62, 102, 140], spandrel: '#e5e8ea', ribs: 0, punched: false },
  'office-grey': { frame: '#c7cacb', glass: [80, 90, 98], spandrel: '#b8bcbe', ribs: 0, punched: false },
});
const BAYS = 9, STOREYS_IN = 4;
export const TILE = 14.4;
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
// tower's shader lights those under the share for the hour), where its glass is and how bright (red), and whether its
// light is an office's cooler white rather than a warm lamp's (blue: a third of them).
function litTexture(punched, size) {
  const t = canvasOf(size, (g, n) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, n, n);
    const bw = n / BAYS, sh = n / STOREYS_IN;
    for (let j = 0; j < STOREYS_IN; j += 1) for (let i = 0; i < BAYS; i += 1) {
      const order = Math.round(rnd(i * 13 + j * 5, 41) * 255), warm = 170 + Math.round(rnd(i, j + 50) * 85), cool = rnd(i * 7 + j * 3, 61) < 0.34 ? 255 : 0;
      g.fillStyle = `rgb(${warm},${order},${cool})`;
      if (punched) g.fillRect(i * bw + bw * 0.22, j * sh + sh * 0.22, bw * 0.56, sh * 0.56);
      else g.fillRect(i * bw + bw * 0.06, j * sh + sh * 0.08, bw * 0.88, sh * 0.6);
    }
  });
  t.colorSpace = THREE.NoColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  return t;
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

// ------------------------------------------------------------------------------------------- the haze --
// The fog's own (as world-shading.js leaves it), but over a tower no more than this much of it: all of it at its foot,
// from 8 m up less and less, from 110 m up half of it just beyond the fog's own reach, more further off (86% three and a
// half times as far). (`vPcwSkyY`: how high the point is.)
const HAZE_VERTEX = ['#include <fog_vertex>', '#include <fog_vertex>\n\tvPcwSkyY = ( modelMatrix * vec4( transformed, 1.0 ) ).y;'];
const HAZE_LINE = 'float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );';
const HAZE_CAP = 'float fogFactor = min( smoothstep( fogNear, fogFar, vFogDepth ), mix( 1.0, mix( 0.5, 0.86, smoothstep( fogFar, fogFar * 3.5, vFogDepth ) ), smoothstep( 8.0, 110.0, vPcwSkyY ) ) );';
function hazed(shader) {
  const fog = THREE.ShaderChunk.fog_fragment;
  if (typeof fog !== 'string' || fog.split(HAZE_LINE).length !== 2) return;
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying float vPcwSkyY;').replace(...HAZE_VERTEX);
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vPcwSkyY;').replace('#include <fog_fragment>', () => fog.replace(HAZE_LINE, HAZE_CAP));
}
export const SKYLINE_HAZE = Object.freeze({ low: 8, high: 110, near: 0.5, far: 0.86, reach: 3.5 });

// ------------------------------------------------------------------------------------------- the materials --
// A kind of wall: its picture, lit at night window by window (`uLit`: the share lit; each tower's walls and each 14.4 m
// of them a different share of their windows, so that no two are lit alike), its glass giving back the sky.
function towerMaterial(kind, lite, textures) {
  const punched = FACADES[kind].punched;
  const glass = !punched;
  const m = surface({ vertexColors: true, map: textures.facade(kind), emissiveMap: textures.lit(punched), emissive: linear(0xffd59a), emissiveIntensity: 0, roughness: glass ? 0.14 : 0.62, metalness: glass ? 0.55 : 0.08 });
  if (glass) reflects(m, 0.9); else weathers(m, { darken: 0.15 });
  const lit = { value: 0.5 };
  m.userData.lit = lit;
  m.userData.kind = kind;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uLit = lit;
    // a window is lit when its own number (shifted by which 14.4 m of which wall it is in) is under tonight's share: its
    // glass (red) times whether it is on
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uLit;').replace('#include <emissivemap_fragment>', `#ifdef USE_EMISSIVEMAP
        vec4 litWin = texture2D(emissiveMap, vEmissiveMapUv);
        float litShift = fract(sin(dot(floor(vEmissiveMapUv), vec2(12.9898, 78.233))) * 43758.5453);
        totalEmissiveRadiance *= litWin.r * step(fract(litWin.g + litShift), uLit) * mix(vec3(1.0), vec3(0.8, 0.95, 1.3), litWin.b);
      #endif`);
    hazed(shader);
  };
  m.customProgramCacheKey = () => 'pcw-tower-windows-haze';
  return m;
}
function hazeMaterial(m) {
  m.onBeforeCompile = (shader) => hazed(shader);
  m.customProgramCacheKey = () => 'pcw-skyline-haze';
  return m;
}

// ------------------------------------------------------------------------------------------- the shapes --
const LOBBY = 7.2, STOREY = 3.6;
export const SHADOWS_WITHIN = 250;
// (a tower's own: a shade of its kind's colours, so that two of a kind are not alike; and where its walls' pictures
// begin, so that its windows are lit its own way)
const towerSeed = (t) => { let h = 7; for (const ch of t.id) h = (h * 31 + ch.charCodeAt(0)) % 9973; return h; };
function tintOf(t) {
  const h = towerSeed(t), a = (h % 97) / 96, b = (h % 89) / 88;
  return new THREE.Color(0.9 + 0.1 * a, 0.9 + 0.1 * (0.5 * a + 0.5 * b), 0.9 + 0.1 * b);
}
// One tower's walls into `W` (its kind's), its lobby's into `L`, its top into `T`; its lit band, if any, into `bands`.
function shapeTower(t, lite, W, L, T, bands) {
  const top = t.storeys * STOREY;
  const round = t.kind === 'round';
  const col = tintOf(t);
  const seed = towerSeed(t);
  const segs = lite ? 24 : 40;
  // the walls, from the lobby up; and the lobby's glass below them (8 m to its picture)
  if (round) {
    const r = t.dx / 2, u0 = (seed % 11) * 7;
    for (let i = 0; i < segs; i += 1) {
      const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
      const s0 = Math.sin(a0) * r, c0 = Math.cos(a0) * r, s1 = Math.sin(a1) * r, c1 = Math.cos(a1) * r;
      const out = [Math.sin((a0 + a1) / 2), 0, Math.cos((a0 + a1) / 2)];
      const u = u0 + (a0 * r) / TILE, v = u0 + (a1 * r) / TILE;
      W.quad([t.x + s0, LOBBY, t.z + c0], [t.x + s1, LOBBY, t.z + c1], [t.x + s1, top, t.z + c1], [t.x + s0, top, t.z + c0], col, [[u, LOBBY / TILE], [v, LOBBY / TILE], [v, top / TILE], [u, top / TILE]], out);
      const lu = (a0 * r) / 8, lv = (a1 * r) / 8;
      L.quad([t.x + s0, 0, t.z + c0], [t.x + s1, 0, t.z + c1], [t.x + s1, LOBBY, t.z + c1], [t.x + s0, LOBBY, t.z + c0], 0xffffff, [[lu, 0], [lv, 0], [lv, LOBBY / 8], [lu, LOBBY / 8]], out);
    }
  } else {
    const x0 = t.x - t.dx / 2, x1 = t.x + t.dx / 2, z0 = t.z - t.dz / 2, z1 = t.z + t.dz / 2;
    const face = (a, b, out, k) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]), u0 = ((seed + k * 5) % 13) * 3;
      W.quad([a[0], LOBBY, a[1]], [b[0], LOBBY, b[1]], [b[0], top, b[1]], [a[0], top, a[1]], col, [[u0, LOBBY / TILE], [u0 + len / TILE, LOBBY / TILE], [u0 + len / TILE, top / TILE], [u0, top / TILE]], out);
      L.quad([a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], LOBBY, b[1]], [a[0], LOBBY, a[1]], 0xffffff, [[0, 0], [len / 8, 0], [len / 8, LOBBY / 8], [0, LOBBY / 8]], out);
    };
    face([x0, z0], [x1, z0], [0, 0, -1], 0); face([x1, z0], [x1, z1], [1, 0, 0], 1); face([x1, z1], [x0, z1], [0, 0, 1], 2); face([x0, z1], [x0, z0], [-1, 0, 0], 3);
  }
  // the slab over the lobby, the walls standing on it
  if (round) T.geo(new THREE.CylinderGeometry(t.dx / 2 + 0.2, t.dx / 2 + 0.2, 0.5, segs), place(t.x, LOBBY + 0.05, t.z), 0xd9d6cf);
  else T.box(t.dx + 0.4, 0.5, t.dz + 0.4, t.x, LOBBY + 0.05, t.z, 0xd9d6cf);
  // the roof, and the crown: set back in steps (the stone one's a little pyramid at the top, the tallest a lit band
  // round the top of the crown, the tallest glass ones a mast)
  const roofCol = t.kind === 'stone' ? 0xcdbb9b : t.kind === 'ribbed-white' ? 0xf1efe9 : 0x8a9096;
  if (round) T.geo(new THREE.CylinderGeometry(t.dx / 2, t.dx / 2, 0.6, segs), place(t.x, top + 0.3, t.z), roofCol);
  else T.box(t.dx + 0.4, 0.8, t.dz + 0.4, t.x, top + 0.4, t.z, roofCol);
  const crown = t.crown || 0;
  let y = top + 0.8, cw = 0, cd = 0;
  if (crown > 0) {
    const steps = t.kind === 'stone' ? 3 : 2;
    for (let k = 0; k < steps; k += 1) {
      const shrink = 0.72 - k * 0.18, h = crown * (k === steps - 1 ? 0.5 : 0.25);
      cw = t.dx * shrink; cd = (round ? t.dx : t.dz) * shrink;
      if (round) T.geo(new THREE.CylinderGeometry(cw / 2, cw / 2, h, lite ? 20 : 32), place(t.x, y + h / 2, t.z), roofCol);
      else T.box(cw, h, cd, t.x, y + h / 2, t.z, roofCol);
      y += h;
    }
    if (t.kind === 'stone') T.geo(new THREE.ConeGeometry(t.dx * 0.18, crown * 0.3, 4), place(t.x, y + crown * 0.15, t.z, Math.PI / 4), 0x6f8f7a);
    if (t.storeys >= 30) bands.push({ t, y: y - 0.6, w: cw + 0.1, d: cd + 0.1, round });
  }
  if (t.storeys >= 44 && t.kind !== 'stone') {
    T.geo(new THREE.CylinderGeometry(0.25, 0.45, 22, 8), place(t.x, y + 11, t.z), 0xb9bec4);
    T.geo(new THREE.CylinderGeometry(1.1, 1.1, 0.5, 12), place(t.x, y + 6, t.z), 0x8d9399);
  }
}
// (how high each tower's top is, the mast's tip on those with one: for the tests)
export function towerTop(t) {
  let y = t.storeys * STOREY + 0.8;
  const crown = t.crown || 0;
  if (crown > 0) y += crown * (t.kind === 'stone' ? 1 : 0.75);
  if (crown > 0 && t.kind === 'stone') y += crown * 0.3;
  if (t.storeys >= 44 && t.kind !== 'stone') y += 22;
  return y;
}

// ------------------------------------------------------------------------------------------- the whole --
export function* skylineSteps(scene, { lite = false, renderer = null, camera = null, towers = OGANIRU_TOWERS } = {}) {
  const group = new THREE.Group(); group.name = 'oganiru:skyline';
  const textures = {
    facades: new Map(), lits: new Map(),
    lobby: lobbyTexture(lite ? 128 : 512), lobbyLit: lobbyTexture(lite ? 64 : 128, true),
    facade(kind) { if (!this.facades.has(kind)) this.facades.set(kind, facadeTexture(kind, lite ? 256 : 1024)); return this.facades.get(kind); },
    lit(punched) { if (!this.lits.has(punched)) this.lits.set(punched, litTexture(punched, lite ? 128 : 256)); return this.lits.get(punched); },
  };
  const materials = new Map();
  const lobby = reflects(new THREE.MeshStandardMaterial({ vertexColors: true, map: textures.lobby, emissiveMap: textures.lobbyLit, emissive: linear(0xffe2b0), emissiveIntensity: 0, roughness: 0.12, metalness: 0.35 }), 0.8);
  const tops = hazeMaterial(weathers(surface({ vertexColors: true, roughness: 0.85, metalness: 0 }), { darken: 0.2 }));
  const band = hazeMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, color: linear(0xb9bcc0), emissive: linear(0xfff0d0), emissiveIntensity: 0, roughness: 0.6 }));
  yield;
  const walls = new Map(), L = new Mesher(), T = new Mesher(), bands = [];
  let n = 0;
  for (const t of towers) {
    if (!walls.has(t.kind)) { walls.set(t.kind, new Mesher()); materials.set(t.kind, towerMaterial(t.kind, lite, textures)); }
    shapeTower(t, lite, walls.get(t.kind), L, T, bands);
    if ((n += 1) % 8 === 0) yield;
  }
  for (const [kind, W] of walls) {
    const mesh = W.build(materials.get(kind));
    mesh.name = `oganiru:towers:${kind}`; mesh.userData.tower = true;
    group.add(mesh);
  }
  const lobbies = L.build(lobby, { shadows: false }); lobbies.name = 'oganiru:lobbies'; group.add(lobbies);
  const topsMesh = T.build(tops); topsMesh.name = 'oganiru:tops'; group.add(topsMesh);
  if (bands.length) {
    const B = new Mesher();
    for (const c of bands) {
      if (c.round) B.geo(new THREE.CylinderGeometry(c.w / 2 + 0.05, c.w / 2 + 0.05, 0.5, 40, 1, true), place(c.t.x, c.y, c.t.z), 0xfff4dc, 'own');
      else B.box(c.w, 0.5, c.d, c.t.x, c.y, c.t.z, 0xfff4dc);
    }
    const mesh = B.build(band, { shadows: false }); mesh.name = 'oganiru:crowns'; group.add(mesh);
  }
  yield;
  // its programs made ready before it is put in (program-ready.js)
  if (renderer && camera) {
    const ready = programsReady(renderer, group, camera, scene);
    while (!ready.step(6)) { if ((yield 'waiting') === 'now') break; }
  }
  scene.add(group);

  function update(dt, { night = 0, hour = 12 } = {}) {
    const h = ((hour % 24) + 24) % 24;
    // (from dusk about half of the windows, fewer as the night goes on, a few at four in the morning, more again before dawn)
    const share = h >= 18 ? 0.55 - (h - 18) * 0.05 : h < 5 ? 0.25 - h * 0.035 : h < 7 ? 0.12 + (h - 5) * 0.1 : 0.4;
    for (const m of materials.values()) { m.emissiveIntensity = night * 1.6; m.userData.lit.value = Math.max(0.08, share); }
    band.emissiveIntensity = night * 2.2;
    lobby.emissiveIntensity = night * 0.45;
  }
  function show(on) { if (group.visible !== !!on) group.visible = !!on; }
  // (their shadows cast only for someone among them, within SHADOWS_WITHIN m of downtown: from further off the sun's
  // shadows, which reach a few tens of metres round the player, never have them in, and each mesh would be drawn into
  // them all the same, the whole downtown being one mesh of each kind)
  const box = towers.reduce((b, t) => ({ x0: Math.min(b.x0, t.x - t.dx / 2), x1: Math.max(b.x1, t.x + t.dx / 2), z0: Math.min(b.z0, t.z - t.dz / 2), z1: Math.max(b.z1, t.z + t.dz / 2) }), { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity });
  let shadows = null;
  function see(x, z) {
    const away = Math.hypot(Math.max(box.x0 - x, 0, x - box.x1), Math.max(box.z0 - z, 0, z - box.z1));
    const want = away < SHADOWS_WITHIN;
    if (want === shadows) return;
    shadows = want;
    for (const m of group.children) if (m.name !== 'oganiru:lobbies' && m.name !== 'oganiru:crowns') m.castShadow = want;
  }
  function letGo() {
    scene.remove(group);
    group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const m of [...materials.values(), lobby, tops, band]) m.dispose();
    for (const t of [...textures.facades.values(), ...textures.lits.values(), textures.lobby, textures.lobbyLit]) t.dispose();
  }
  const stats = () => ({ towers: towers.length, kinds: walls.size, meshes: group.children.length, bands: bands.length, shown: group.visible });
  see(Infinity, Infinity);
  return { group, update, show, see, letGo, stats, materials };
}
