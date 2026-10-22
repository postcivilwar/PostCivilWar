// Life in the habitation (20 October 2026, the owner's brief: "small fish in the habitation's waters, not the Niger,
// that scatter when a player comes near; at least ten kinds of birds, parrots among them, at different heights,
// sometimes landing, only in the habitation"; and footprints in its sand).
//
//   - Fish: shoals in the lagoon's shallows by its beaches, the island and the jetty, in the two waterfall pools, the
//     garden pool and the gorge's stream; each fish a small body that bends to swim, a little under the surface (the
//     clear water shows them). A player who comes within a few metres of one sends it and its shoal darting away; they
//     come back together once the player has gone on. None in the Niger, none in the swamp.
//   - Birds: fourteen kinds of West Africa's own (BIRD_KINDS), each with its own colours, size and ways: parrots and
//     turacos going from tree to tree and sitting in their crowns, weavers and parakeets in flocks, egrets and ibises
//     wading at the water's edge, kingfishers on low perches over the water, a fish eagle circling high over the lagoon.
//     Those that sit somewhere fly up when someone comes close. At night they roost and are quiet.
//   - Fireflies over the swamp, the forest's edge and the garden at night.
//   - Footprints: whoever walks on the sand leaves prints, which fade after a while.
//
// None of it is in the simulation: each player's game has its own fish and birds, as each has its own okadas and
// pedestrians. What a bird sings is played by audio.js (made there from oscillators, as all of the game's sounds are);
// `calls()` hands over who sang and where.
//
//   const life = createHabitationLife(scene, { lite });
//   life.update(dt, { eye, people: [{ x, z }], night, listener })     each frame while the habitation is built
//   life.calls()                                                         the birds that sang since it was last asked
//   life.dispose()

import { HABITATION, HABITATION_WATERS, HABITATION_STREAMS, HABITATION_STANDING, HABITATION_MODELS, HABITATION_PATHS, HABITATION_SHIFT, habitationWaterAt, habitationLand, habitationFooting } from '../sim/zone.js';
import { linear } from './render-kit.js';

// a repeatable dice: the same fish and birds in the same places for everyone who comes
function dice(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const angleTo = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

// ------------------------------------------------------------------------------------------------ birds --

// Each kind: what it is called, its wingspan (metres), its colours (back, wings, head, belly, tail, bill), the shape of
// its tail and bill, its ways ('perch': flies from tree to tree and sits in the crowns; 'low': the same among the
// bushes; 'flock': a flock that goes about together; 'wade': walks in the shallows; 'kingfisher': a low perch by the
// water, and dives; 'soar': circles high), how fast it flies and beats its wings, and its song (audio.js).
export const BIRD_KINDS = Object.freeze({
  'grey-parrot': { name: 'African grey parrot', span: 0.5, c: [0x8a8e93, 0x6a6e74, 0xb6babe, 0x9a9ea3, 0xc4242a, 0x1e1e20], tail: 0.7, bill: 1.2, hook: 1, ways: 'perch', speed: 11, flap: 10, song: 'grey-parrot' },
  'senegal-parrot': { name: 'Senegal parrot', span: 0.42, c: [0x3f9a3a, 0x3a8e36, 0x5a5e64, 0xe3a326, 0x3f9a3a, 0x2a2a2c], tail: 0.6, bill: 1.1, hook: 1, ways: 'perch', speed: 11, flap: 11, song: 'senegal-parrot' },
  parakeet: { name: 'Rose-ringed parakeet', span: 0.42, c: [0x79c64a, 0x5fae3a, 0x8ad45a, 0xa8dc78, 0x6cbf46, 0xc62a2a], tail: 2.2, bill: 1.0, hook: 1, ways: 'flock', speed: 13, flap: 12, song: 'parakeet' },
  'blue-turaco': { name: 'Great blue turaco', span: 0.75, c: [0x2d5ea8, 0x2a559a, 0x2f64b0, 0xaebf3a, 0x2d5ea8, 0xe8c21e], tail: 1.6, bill: 1.0, crest: 1, ways: 'perch', speed: 8, flap: 6, song: 'blue-turaco' },
  'violet-turaco': { name: 'Violet turaco', span: 0.55, c: [0x45286a, 0xb3122e, 0x3a2058, 0x45286a, 0x45286a, 0xf08a1c], tail: 1.4, bill: 1.0, crest: 1, ways: 'perch', speed: 9, flap: 7, song: 'violet-turaco' },
  hornbill: { name: 'African pied hornbill', span: 0.9, c: [0x1f1f21, 0x232325, 0x1f1f21, 0xeeeeea, 0x1f1f21, 0xd8c89a], tail: 1.3, bill: 2.6, ways: 'perch', speed: 10, flap: 6, song: 'hornbill' },
  'pied-crow': { name: 'Pied crow', span: 0.95, c: [0x18181a, 0x1c1c1e, 0x18181a, 0xe8e8e6, 0x18181a, 0x18181a], tail: 1.0, bill: 1.3, ways: 'perch', speed: 11, flap: 5, song: 'pied-crow' },
  bulbul: { name: 'Common bulbul', span: 0.28, c: [0x7a6a54, 0x6e5e4a, 0x3a3230, 0xcdbfa6, 0x6e5e4a, 0x1e1e20], tail: 1.1, bill: 0.8, ways: 'low', speed: 9, flap: 15, song: 'bulbul' },
  sunbird: { name: 'Splendid sunbird', span: 0.17, c: [0x1b7f72, 0x214a6e, 0x2b2a7a, 0xb8243a, 0x1b4f6e, 0x161616], tail: 1.0, bill: 1.7, ways: 'low', speed: 9, flap: 20, song: 'sunbird' },
  weaver: { name: 'Village weaver', span: 0.24, c: [0xeec11e, 0x6a5a1e, 0x1c1c1c, 0xf4cc2a, 0x8a7a2a, 0x1c1c1c], tail: 0.8, bill: 0.9, ways: 'flock', speed: 10, flap: 16, song: 'weaver' },
  kingfisher: { name: 'Malachite kingfisher', span: 0.2, c: [0x1f6fd0, 0x1a5fb8, 0x2a80dc, 0xe2782e, 0x1f6fd0, 0xd8261e], tail: 0.6, bill: 1.9, ways: 'kingfisher', speed: 12, flap: 18, song: 'kingfisher' },
  egret: { name: 'Little egret', span: 0.95, c: [0xf3f1ea, 0xf6f4ee, 0xf3f1ea, 0xf3f1ea, 0xf3f1ea, 0x1c1c1c], tail: 0.7, bill: 2.0, legs: 1, neck: 1, ways: 'wade', speed: 8, flap: 4, song: 'egret' },
  ibis: { name: 'Hadada ibis', span: 1.0, c: [0x6b6150, 0x5a6a52, 0x5e5648, 0x6b6150, 0x5e5648, 0x2a2622], tail: 0.7, bill: 2.4, curve: 1, legs: 1, ways: 'wade', speed: 9, flap: 5, song: 'ibis' },
  'fish-eagle': { name: 'African fish eagle', span: 2.0, c: [0x5a3420, 0x3a2618, 0xf2f0ea, 0x6a3a22, 0xf2f0ea, 0xe8c21e], tail: 0.9, bill: 1.2, hook: 1, ways: 'soar', speed: 9, flap: 3, song: 'fish-eagle' },
});

// Where each kind lives, place by place (habitation.js HABITATION.places): how many, and a phone's share of them.
// (21 October 2026, the owner: "I didn't even see the different birds flying and their noises/whistle": more of them, a
// phone's share more too, and many low down by the paths where they are seen, not only up in the crowns)
const HOMES = [
  ['entrance-hill', [['bulbul', 3], ['pied-crow', 3], ['weaver', 8], ['sunbird', 2], ['grey-parrot', 2], ['hornbill', 1]]],
  ['forest-path', [['grey-parrot', 4], ['blue-turaco', 3], ['hornbill', 3], ['bulbul', 2], ['violet-turaco', 2], ['sunbird', 2]]],
  ['swamp', [['ibis', 3], ['kingfisher', 2], ['violet-turaco', 2], ['grey-parrot', 3], ['egret', 2]]],
  ['mangroves', [['egret', 4], ['kingfisher', 2], ['senegal-parrot', 3], ['ibis', 1]]],
  ['lagoon', [['egret', 3], ['parakeet', 8], ['senegal-parrot', 3], ['fish-eagle', 1], ['pied-crow', 2], ['kingfisher', 1]]],
  ['gorge', [['kingfisher', 2], ['bulbul', 2], ['sunbird', 3], ['blue-turaco', 2], ['grey-parrot', 2]]],
  ['big-waterfall', [['pied-crow', 2], ['fish-eagle', 1], ['violet-turaco', 2], ['parakeet', 4]]],
  ['waterfall-pool', [['sunbird', 3], ['violet-turaco', 2], ['kingfisher', 1], ['bulbul', 2]]],
  ['overlook', [['hornbill', 2], ['parakeet', 6], ['pied-crow', 1]]],
  ['gazebo-garden', [['sunbird', 3], ['bulbul', 2], ['weaver', 6], ['senegal-parrot', 2]]],
  ['sunset-beach', [['egret', 2], ['ibis', 2], ['grey-parrot', 3], ['pied-crow', 1]]],
];
// The flocks that cross the sky wherever one is in the habitation (parakeets, weavers, parrots, now and then), calling
// as they go over: seen and heard by anyone there, not only by whoever comes near a bird's home.
const CROSSINGS = [['parakeet', 9], ['weaver', 10], ['grey-parrot', 4], ['senegal-parrot', 5]];

// A bird drawn small: its body, head, bill, tail and two wings, coloured, for a wingspan of one metre (scaled to its
// own). `wing` marks the wings' points (1), so that they can be beaten (and folded along the body when it sits).
function birdGeometry(kind) {
  const k = BIRD_KINDS[kind];
  const col = k.c.map((h) => linear(h));
  const [back, wingC, head, belly, tailC, billC] = col;
  const pos = [], colr = [], wing = [];
  const tri = (a, b, c, cA, cB = cA, cC = cA, w = 0) => { pos.push(...a, ...b, ...c); for (const cc of [cA, cB, cC]) colr.push(cc.r, cc.g, cc.b); wing.push(w, w, w); };
  // the body: rings along it (tail to breast), six sides each
  const neck = k.neck ? 0.06 : 0;
  const rings = [[-0.19, 0.022], [-0.11, 0.05], [0.0, 0.062], [0.08, 0.055], [0.14 + neck, 0.033]];
  const S = 6;
  const ring = (z, r, j) => { const a = (j / S) * TAU; return [Math.cos(a) * r, Math.sin(a) * r * 0.9, z]; };
  for (let i = 0; i + 1 < rings.length; i += 1) for (let j = 0; j < S; j += 1) {
    const a = ring(rings[i][0], rings[i][1], j), b = ring(rings[i][0], rings[i][1], j + 1), c = ring(rings[i + 1][0], rings[i + 1][1], j), d = ring(rings[i + 1][0], rings[i + 1][1], j + 1);
    const ca = a[1] >= 0 ? back : belly, cb = b[1] >= 0 ? back : belly, cc = c[1] >= 0 ? back : belly, cd = d[1] >= 0 ? back : belly;
    tri(a, c, b, ca, cc, cb); tri(b, c, d, cb, cc, cd);
  }
  // the head: a small ball on the breast's end (with a crest for a turaco)
  const hz = 0.19 + neck, hr = 0.042, hy = 0.03 + neck * 0.5;
  const top = [0, hy + hr, hz], bottom = [0, hy - hr, hz], front = [0, hy, hz + hr], rear = [0, hy, hz - hr], left = [-hr * 0.85, hy, hz], right = [hr * 0.85, hy, hz];
  for (const [a, b] of [[front, right], [right, rear], [rear, left], [left, front]]) { tri(top, a, b, head); tri(bottom, b, a, head); }
  if (k.crest) tri([0, hy + hr, hz + 0.01], [0, hy + hr * 2.1, hz - 0.03], [0, hy + hr * 0.6, hz - 0.05], head);
  // the bill: a wedge forward from the face (down-curved for an ibis, hooked for a parrot or the eagle)
  const bl = 0.045 * (k.bill || 1), bw = 0.014 * Math.min(1.6, k.bill || 1);
  const by = hy - (k.hook ? 0.008 : 0.002), bz = hz + hr * 0.8;
  const tip = [0, by - (k.curve ? bl * 0.45 : k.hook ? bl * 0.35 : bl * 0.1), bz + bl];
  tri([-bw, by, bz], [bw, by, bz], tip, billC); tri([bw, by, bz], [0, by + bw * 1.2, bz], tip, billC); tri([0, by + bw * 1.2, bz], [-bw, by, bz], tip, billC);
  // the tail: a fan behind (long for a parakeet or a turaco)
  const tl = 0.11 * (k.tail || 1), tz = -0.18;
  tri([-0.025, 0.012, tz], [0.025, 0.012, tz], [0.05 * Math.min(1.4, 0.8 + (k.tail || 1) * 0.25), 0.0, tz - tl], tailC);
  tri([-0.025, 0.012, tz], [0.05 * Math.min(1.4, 0.8 + (k.tail || 1) * 0.25), 0.0, tz - tl], [-0.05 * Math.min(1.4, 0.8 + (k.tail || 1) * 0.25), 0.0, tz - tl], tailC);
  // legs for the waders (two thin sticks down, seen as they stand in the water)
  if (k.legs) for (const s of [-1, 1]) { const x = s * 0.018; tri([x - 0.006, -0.03, 0.0], [x + 0.006, -0.03, 0.0], [x, -0.26, 0.02], billC); tri([x, -0.03, -0.006], [x, -0.03, 0.006], [x, -0.26, 0.02], billC); }
  // the wings: from the shoulder out to a swept-back tip; the primaries a little darker
  const tipC = wingC.clone().multiplyScalar(0.7);
  for (const s of [-1, 1]) {
    const r0 = [s * 0.04, 0.03, 0.07], r1 = [s * 0.04, 0.03, -0.07];
    const m0 = [s * 0.27, 0.04, 0.06], m1 = [s * 0.27, 0.04, -0.09];
    const t0 = [s * 0.5, 0.03, -0.04], t1 = [s * 0.46, 0.03, -0.12];
    const add = (a, b, c, ca, cb, cc) => (s > 0 ? tri(a, b, c, ca, cb, cc, 1) : tri(a, c, b, ca, cc, cb, 1));
    add(r0, m0, r1, wingC, wingC, wingC); add(r1, m0, m1, wingC, wingC, wingC);
    add(m0, t0, m1, wingC, tipC, wingC); add(m1, t0, t1, wingC, tipC, tipC);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  g.setAttribute('birdWing', new THREE.Float32BufferAttribute(wing, 1));
  g.computeVertexNormals();
  return g;
}

// One material for every bird: the wings beaten (`birdState`: how fast, how far, the moment, how far folded), the rest
// as it is; lit simply, from both sides.
function birdMaterial(clock) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.birdTime = clock;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float birdWing;\nattribute vec4 birdState;\nuniform float birdTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      if (birdWing > 0.5) {
        float r = abs(transformed.x), s = sign(transformed.x);
        float a = birdState.y * sin(birdTime * birdState.x + birdState.z);
        float fold = birdState.w;
        float rr = mix(r, 0.05 + r * 0.12, fold);
        transformed.z = mix(transformed.z, transformed.z - r * 0.32, fold);
        transformed.x = s * rr * cos(a);
        transformed.y += rr * sin(a) + fold * 0.012;
      }`);
  };
  m.customProgramCacheKey = () => 'pcw-habitation-bird';
  return m;
}

// ------------------------------------------------------------------------------------------------- fish --

// A fish (for a length of one metre, scaled): a slim body, its tail fin, dark above and pale below; `bend` (0 at its
// nose to 1 at its tail) says how far each part swings as it swims.
function fishGeometry(backHex, bellyHex, finHex) {
  const back = linear(backHex), belly = linear(bellyHex), fin = linear(finHex);
  const pos = [], col = [], bend = [];
  const push = (p, c, b) => { pos.push(...p); col.push(c.r, c.g, c.b); bend.push(b); };
  const rings = [[0.5, 0.0], [0.38, 0.07], [0.15, 0.11], [-0.12, 0.09], [-0.3, 0.035]];
  const S = 6;
  for (let i = 0; i + 1 < rings.length; i += 1) for (let j = 0; j < S; j += 1) {
    const p = (ri, jj) => { const a = (jj / S) * TAU; const [z, r] = rings[ri]; return [Math.cos(a) * r * 0.55, Math.sin(a) * r, z]; };
    const a = p(i, j), b = p(i, j + 1), c = p(i + 1, j), d = p(i + 1, j + 1);
    const cOf = (q) => (q[1] >= 0 ? back : belly), bOf = (q) => clamp((0.5 - q[2]) / 0.9, 0, 1);
    for (const q of [a, c, b, b, c, d]) push(q, cOf(q), bOf(q));
  }
  // the tail fin, upright
  for (const q of [[0, 0, -0.28], [0, 0.13, -0.48], [0, -0.13, -0.48]]) push(q, fin, 1);
  // a fin on its back
  for (const q of [[0, 0.1, 0.1], [0, 0.17, -0.02], [0, 0.08, -0.12]]) push(q, back, 0.3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('fishBend', new THREE.Float32BufferAttribute(bend, 1));
  g.computeVertexNormals();
  return g;
}
function fishMaterial(clock) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.fishTime = clock;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float fishBend;\nattribute vec3 fishState;\nuniform float fishTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      transformed.x += sin(fishTime * fishState.x + fishState.z - transformed.z * 7.0) * fishState.y * fishBend * fishBend;`);
  };
  m.customProgramCacheKey = () => 'pcw-habitation-fish';
  return m;
}
// The kinds of fish, by water: their colours and sizes (metres)
const FISH_KINDS = Object.freeze({
  tilapia: { back: 0x4a5a52, belly: 0xc9cfc6, fin: 0x5a6a5a, size: [0.16, 0.28] },
  minnow: { back: 0x5a5a44, belly: 0xd8d4c0, fin: 0x6a6a52, size: [0.07, 0.12] },
  gold: { back: 0xd8661c, belly: 0xf2c060, fin: 0xe88a3a, size: [0.18, 0.3] },
});
// The shoals: in which water, near where (so that they are where people come: the beaches, the jetty, the island's
// boardwalk, the pools), how many fish and of what kind.
// (given where they were drawn: HABITATION_SHIFT moves them to where the habitation now is)
const SHOALS = [
  { water: 'lagoon', near: [2168, 132], fish: 9, kind: 'tilapia' },
  { water: 'lagoon', near: [2232, 132], fish: 8, kind: 'tilapia' },
  { water: 'lagoon', near: [2198, 172], fish: 9, kind: 'minnow' },
  { water: 'lagoon', near: [2210, 230], fish: 7, kind: 'tilapia' },
  { water: 'lagoon', near: [2196, 326], fish: 9, kind: 'minnow' },
  { water: 'lagoon', near: [2236, 334], fish: 7, kind: 'tilapia' },
  { water: 'lagoon', near: [2290, 146], fish: 6, kind: 'tilapia' },
  { water: 'falls-pool', near: [2346, 322], fish: 7, kind: 'tilapia' },
  { water: 'falls-pool', near: [2356, 334], fish: 6, kind: 'minnow' },
  { water: 'big-pool', near: [2456, 222], fish: 7, kind: 'tilapia' },
  { water: 'garden-pool', near: [2158, 404], fish: 5, kind: 'gold' },
  { water: 'gorge', near: [2340, 118], fish: 5, kind: 'minnow' },
  { water: 'gorge', near: [2402, 74], fish: 4, kind: 'minnow' },
  { water: 'falls-run', near: [2328, 306], fish: 4, kind: 'minnow' },
].map((s) => ({ ...s, near: [s.near[0] + HABITATION_SHIFT, s.near[1]] }));

// --------------------------------------------------------------------------------------------- footprints --

function footprintTexture() {
  const c = document.createElement('canvas'); c.width = 32; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, 32, 64);
  const blob = (x, y, rx, ry, a) => { const r = g.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry)); r.addColorStop(0, `rgba(255,255,255,${a})`); r.addColorStop(0.7, `rgba(255,255,255,${a * 0.75})`); r.addColorStop(1, 'rgba(255,255,255,0)'); g.save(); g.translate(x, y); g.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry)); g.translate(-x, -y); g.fillStyle = r; g.beginPath(); g.arc(x, y, Math.max(rx, ry), 0, TAU); g.fill(); g.restore(); };
  blob(16, 50, 8, 10, 0.9);       // the heel
  blob(17, 30, 9, 13, 0.8);       // the ball of the foot
  for (const [x, y, r] of [[11, 13, 3.5], [16, 11, 3], [20, 12, 2.6], [23.5, 14, 2.2], [26, 17, 2]]) blob(x, y, r, r, 0.85);
  const t = new THREE.CanvasTexture(c);
  return t;
}

// ------------------------------------------------------------------------------------------------ the whole --

export function createHabitationLife(scene, { lite = false } = {}) {
  const rand = dice(20261020);
  const group = new THREE.Group(); group.name = 'habitation-life';
  scene.add(group);
  const clock = { value: 0 };
  let time = 0;
  const share = lite ? 0.8 : 1;

  // ---- the birds' places to sit: the crowns of the trees and palms, the tops of the bushes, rocks by the water
  const crowns = [], bushes = [], waterside = [], wading = [];
  for (const p of HABITATION_STANDING) {
    const info = HABITATION_MODELS[p.m];
    if (!info) continue;
    const ground = p.y !== null ? p.y : habitationLand(p.x, p.z);
    if (info.kind === 'tree' || info.kind === 'palm') crowns.push({ x: p.x, y: ground + p.s * (info.kind === 'palm' ? 0.93 : 0.86), z: p.z, high: p.s });
    else if (info.kind === 'shrub' || info.kind === 'banana' || info.kind === 'herb') bushes.push({ x: p.x, y: ground + p.s * 0.92, z: p.z, high: p.s });
    else if (info.kind === 'rock') { const w = habitationWaterAt(p.x + 1.5, p.z) || habitationWaterAt(p.x - 1.5, p.z) || habitationWaterAt(p.x, p.z + 1.5) || habitationWaterAt(p.x, p.z - 1.5); if (w && w.kind !== 'river') waterside.push({ x: p.x, y: ground + p.s * 0.85, z: p.z, water: w }); }
  }
  // low places by the paths, where a bird is seen: the tops of the bushes within a few metres of a path, and the ground
  // at a path's edge (for those that walk about on it: crows, hornbills, ibises), each by where it is
  const nearPath = (x, z, within) => HABITATION_PATHS.some((p) => p.line.some(([px, pz], i) => { if (i === 0) return false; const [ax, az] = p.line[i - 1], dx = px - ax, dz = pz - az, l2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)); return Math.hypot(ax + dx * t - x, az + dz * t - z) < p.width / 2 + within; }));
  const lows = bushes.filter((b) => b.high < 4.5 && nearPath(b.x, b.z, 8));
  const verges = [];
  for (const p of HABITATION_PATHS) for (let i = 0; i + 1 < p.line.length; i += 1) {
    const [ax, az] = p.line[i], [bx, bz] = p.line[i + 1], len = Math.hypot(bx - ax, bz - az) || 1;
    for (let d = 2; d < len; d += 5) for (const side of [-1, 1]) {
      const off = p.width / 2 + 1.5 + rand() * 3, x = ax + ((bx - ax) * d) / len - ((bz - az) / len) * side * off, z = az + ((bz - az) * d) / len + ((bx - ax) / len) * side * off;
      const f = habitationFooting(x, z);
      if (f && f.walk && !f.deck && f.kind !== 'shallows') verges.push({ x, y: habitationLand(x, z), z, ground: true });
    }
  }
  // places in the shallows (a hand's depth) for the waders to walk, by the beaches, the island, the swamp and the pools
  for (let i = 0; i < 2400 && wading.length < 160; i += 1) {
    const b = HABITATION.bounds;
    const x = b.x0 + rand() * (b.x1 - b.x0), z = b.z0 + rand() * (b.z1 - b.z0);
    const w = habitationWaterAt(x, z);
    if (w && w.kind !== 'river' && w.kind !== 'rapids' && w.depth > 0.03 && w.depth < 0.22) wading.push({ x, y: w.level - w.depth, z, water: w.id });
  }
  const placeOf = (id) => HABITATION.places.find((p) => p.id === id);
  const nearest = (list, x, z, within, filter = () => true) => { const out = []; for (const p of list) { const d = Math.hypot(p.x - x, p.z - z); if (d < within && filter(p)) out.push(p); } return out; };

  const kinds = Object.keys(BIRD_KINDS);
  const birdMat = birdMaterial(clock);
  const birdMeshes = new Map();       // kind -> { mesh, state, list }
  const birds = [];
  for (const [placeId, list] of HOMES) {
    const place = placeOf(placeId);
    if (!place) continue;
    for (const [kind, many] of list) {
      const n = Math.max(1, Math.round(many * share));
      const k = BIRD_KINDS[kind];
      const flockOf = k.ways === 'flock' ? { leader: null, members: [] } : null;
      for (let i = 0; i < n; i += 1) {
        const b = { kind, k, home: place, x: place.x, y: 8, z: place.z, h: rand() * TAU, pitch: 0, mode: 'rest', wait: rand() * 8, from: null, to: null, ctrl: null, t: 0, dur: 1, flap: 0, fold: 1, phase: rand() * TAU, rate: k.flap * (0.9 + rand() * 0.2), songAt: rand() * 12, flock: flockOf, spot: null, roost: false };
        if (flockOf) { if (!flockOf.leader) flockOf.leader = b; else flockOf.members.push(b); b.offset = [(rand() - 0.5) * 6, (rand() - 0.5) * 2, (rand() - 0.5) * 6]; }
        birds.push(b);
      }
    }
  }
  // the flocks that cross the sky over whoever is there: idle (not drawn) until one goes over
  const crossings = [];
  for (const [kind, many] of CROSSINGS) {
    const k = BIRD_KINDS[kind], n = Math.max(3, Math.round(many * share));
    const flock = { kind, members: [], t: 0, dur: 1, from: null, to: null, ctrl: null, callAt: 0 };
    for (let i = 0; i < n; i += 1) {
      const b = { kind, k, home: HABITATION.places[0], x: 0, y: -1000, z: 0, h: 0, pitch: 0, mode: 'idle', wait: 0, flap: 0, fold: 0, phase: rand() * TAU, rate: k.flap * (0.9 + rand() * 0.2), songAt: Infinity, flock: null, spot: null, roost: false, cross: flock, offset: [(rand() - 0.5) * 9, (rand() - 0.5) * 3, (rand() - 0.5) * 9] };
      flock.members.push(b); birds.push(b);
    }
    crossings.push(flock);
  }
  let nextCrossing = 6 + rand() * 6, crossingTurn = 0;
  // each bird's first place: sitting where its kind sits, at home
  const GROUNDERS = new Set(['pied-crow', 'hornbill', 'ibis']);
  const spotFor = (b, from = b.home, within = 90) => {
    const k = b.k;
    let list;
    if (k.ways === 'wade') list = nearest(wading, from.x, from.z, within);
    else if (k.ways === 'kingfisher') list = nearest(waterside, from.x, from.z, within * 1.6);
    else if (k.ways === 'low') list = nearest(rand() < 0.6 && lows.length ? lows : bushes, from.x, from.z, within, (p) => p.high > 1.0);
    // (a parrot, a turaco, a crow, a hornbill: as often low by a path, on a bush or the ground, as up in a crown)
    else if (k.ways === 'perch' && rand() < 0.5) list = GROUNDERS.has(b.kind) && rand() < 0.6 ? nearest(verges, from.x, from.z, within) : nearest(lows, from.x, from.z, within);
    else list = nearest(crowns, from.x, from.z, within, (p) => p.high > (k.span > 0.7 ? 9 : 5));
    if (!list || !list.length) list = nearest(crowns, from.x, from.z, within, (p) => p.high > (k.span > 0.7 ? 9 : 5));
    if (!list.length) list = nearest(crowns, from.x, from.z, within * 2);
    if (!list.length) return { x: from.x, y: habitationLand(from.x, from.z) + 8, z: from.z };
    const p = list[Math.floor(rand() * list.length)];
    // (a wader stands on the bed with its legs in the water; one on the ground stands on it)
    if (k.ways === 'wade') return { x: p.x, y: p.y + 0.24 * k.span, z: p.z, water: p.water };
    if (p.ground) return { x: p.x, y: p.y + 0.2 * k.span, z: p.z, ground: true };
    // (a little apart on a crown: each its own place on the fronds)
    const spread = k.ways === 'wade' ? 0 : Math.min(2.4, 0.6 + (p.high || 2) * 0.08);
    const a = rand() * TAU;
    return { x: p.x + Math.cos(a) * spread * rand(), y: p.y, z: p.z + Math.sin(a) * spread * rand(), water: p.water };
  };
  for (const b of birds) {
    if (b.cross) continue;
    if (b.k.ways === 'soar') { b.mode = 'soar'; b.circle = { x: b.home.x + (rand() - 0.5) * 60, z: b.home.z + (rand() - 0.5) * 60, r: 34 + rand() * 30, y: 48 + rand() * 30, dir: rand() < 0.5 ? 1 : -1 }; b.a = rand() * TAU; continue; }
    const s = b.flock && b.flock.leader !== b ? null : spotFor(b);
    if (s) { b.x = s.x; b.y = s.y; b.z = s.z; b.spot = s; }
  }
  for (const b of birds) if (!b.cross && b.flock && b.flock.leader !== b) { const L = b.flock.leader; b.x = L.x + b.offset[0] * 0.3; b.y = L.y; b.z = L.z + b.offset[2] * 0.3; b.spot = { x: b.x, y: b.y, z: b.z }; }
  for (const kind of kinds) {
    const list = birds.filter((b) => b.kind === kind);
    if (!list.length) continue;
    const geometry = birdGeometry(kind);
    const state = new Float32Array(list.length * 4);
    geometry.setAttribute('birdState', new THREE.InstancedBufferAttribute(state, 4));
    const mesh = new THREE.InstancedMesh(geometry, birdMat, list.length);
    mesh.name = `bird:${kind}`; mesh.frustumCulled = false; mesh.castShadow = false;
    group.add(mesh);
    birdMeshes.set(kind, { mesh, state, list });
  }

  // a flight from where the bird is to a place, over whatever is between (an arc above the ground and the trees)
  function fly(b, to, { low = false } = {}) {
    const from = { x: b.x, y: b.y, z: b.z };
    const d = Math.hypot(to.x - from.x, to.z - from.z);
    let top = Math.max(from.y, to.y) + (low ? 0.8 : 2 + Math.min(10, d * 0.12));
    for (let i = 1; i < 6; i += 1) { const u = i / 6; top = Math.max(top, habitationLand(from.x + (to.x - from.x) * u, from.z + (to.z - from.z) * u) + (low ? 2 : 6)); }
    b.from = from; b.to = to; b.ctrl = { x: (from.x + to.x) / 2, y: top + (top - (from.y + to.y) / 2) * 0.6, z: (from.z + to.z) / 2 };
    b.t = 0; b.dur = Math.max(1.2, (d + Math.abs(to.y - from.y) * 0.5) / b.k.speed);
    b.mode = 'fly';
  }
  const bez = (a, c, b, u) => (1 - u) * (1 - u) * a + 2 * (1 - u) * u * c + u * u * b;

  // ---- the fish
  const fishMat = fishMaterial(clock);
  const fishMeshes = new Map();
  const shoals = [];
  const waterKinds = new Map(HABITATION_WATERS.map((w) => [w.id, w]));
  for (const s of SHOALS) {
    const n = Math.max(2, Math.round(s.fish * share));
    // the places in its water, near its spot, where it is deep enough to swim and clear enough to be seen
    const spots = [];
    for (let i = 0; i < 600 && spots.length < 40; i += 1) {
      const x = s.near[0] + (rand() - 0.5) * 36, z = s.near[1] + (rand() - 0.5) * 36;
      const w = habitationWaterAt(x, z);
      if (w && w.id === s.water && w.depth > 0.28 && w.depth < 2.6) spots.push({ x, z });
    }
    if (spots.length < 3) continue;
    const kind = FISH_KINDS[s.kind];
    const shoal = { water: s.water, spots, at: { ...spots[0] }, goal: spots[1], scare: 0, fish: [] };
    for (let i = 0; i < n; i += 1) {
      const size = kind.size[0] + rand() * (kind.size[1] - kind.size[0]);
      const w0 = waterKinds.get(s.water) || HABITATION_STREAMS.find((q) => q.id === s.water);
      const at0 = habitationWaterAt(shoal.at.x, shoal.at.z);
      shoal.fish.push({ kind: s.kind, size, x: shoal.at.x, z: shoal.at.z, y: 0, h: rand() * TAU, v: 0.3, off: [(rand() - 0.5) * 3.2, (rand() - 0.5) * 3.2], scare: 0, rate: 9 + rand() * 4, phase: rand() * TAU, check: rand() * 0.3, ok: true, level: at0 ? at0.level : w0 && w0.level !== undefined ? w0.level : 0, depth: at0 ? at0.depth : 0.6 });
    }
    shoals.push(shoal);
  }
  for (const [kindId, kind] of Object.entries(FISH_KINDS)) {
    const list = shoals.flatMap((s) => s.fish.filter((f) => f.kind === kindId).map((f) => ({ f, s })));
    if (!list.length) continue;
    const geometry = fishGeometry(kind.back, kind.belly, kind.fin);
    const state = new Float32Array(list.length * 3);
    geometry.setAttribute('fishState', new THREE.InstancedBufferAttribute(state, 3));
    const mesh = new THREE.InstancedMesh(geometry, fishMat, list.length);
    mesh.name = `fish:${kindId}`; mesh.frustumCulled = false; mesh.castShadow = false;
    group.add(mesh);
    fishMeshes.set(kindId, { mesh, state, list });
  }

  // ---- fireflies: over the swamp, the forest's edge by the path, the mangroves and the garden
  const FLY_AREAS = [[2040, -80, 40], [2030, 70, 30], [2070, 150, 30], [2160, 400, 22], [1990, 40, 26]].map(([x, z, r]) => [x + HABITATION_SHIFT, z, r]);
  const flyCount = lite ? 40 : 90;
  const flies = [];
  for (let i = 0; i < flyCount; i += 1) { const a = FLY_AREAS[i % FLY_AREAS.length]; const x = a[0] + (rand() - 0.5) * 2 * a[2], z = a[1] + (rand() - 0.5) * 2 * a[2]; flies.push({ x, z, y: 0.6 + rand() * 2.2, base: habitationLand(x, z), a: rand() * TAU, s: 0.3 + rand() * 0.5, blink: rand() * 10, rate: 0.35 + rand() * 0.5 }); }
  const flyPos = new Float32Array(flyCount * 3), flyCol = new Float32Array(flyCount * 3);
  const flyGeom = new THREE.BufferGeometry();
  flyGeom.setAttribute('position', new THREE.BufferAttribute(flyPos, 3));
  flyGeom.setAttribute('color', new THREE.BufferAttribute(flyCol, 3));
  const dot = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); const r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,0.6)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
  const fireflies = new THREE.Points(flyGeom, new THREE.PointsMaterial({ size: 0.32, map: dot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
  fireflies.name = 'fireflies'; fireflies.frustumCulled = false; fireflies.visible = false;
  group.add(fireflies);

  // ---- footprints in the sand
  const PRINTS = lite ? 90 : 180;
  const printTex = footprintTexture();
  const printGeom = new THREE.PlaneGeometry(0.13, 0.28); printGeom.rotateX(-Math.PI / 2);
  const printFade = new Float32Array(PRINTS);
  printGeom.setAttribute('printFade', new THREE.InstancedBufferAttribute(printFade, 1));
  const printMat = new THREE.MeshBasicMaterial({ map: printTex, color: linear(0x6e5a3e), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  printMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float printFade;\nvarying float vPrintFade;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvPrintFade = printFade;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vPrintFade;').replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a = texture2D(map, vUv).r * 0.42 * vPrintFade;');
  };
  printMat.customProgramCacheKey = () => 'pcw-habitation-print';
  const prints = new THREE.InstancedMesh(printGeom, printMat, PRINTS);
  prints.name = 'footprints'; prints.frustumCulled = false; prints.count = 0; prints.renderOrder = 1;
  group.add(prints);
  const printList = [];            // { x, y, z, h, side, age }
  const walkers = new Map();       // key -> { x, z, gone, side }
  const PRINT_LIFE = 90;           // seconds before a print has faded away

  const calls = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), sc = new THREE.Vector3(), at = new THREE.Vector3();
  const stats = { birds: birds.length, fish: shoals.reduce((n, s) => n + s.fish.length, 0), shoals: shoals.length, kinds: birdMeshes.size, flying: 0, sitting: 0, wading: 0, soaring: 0, scattered: 0, prints: 0, fireflies: 0, flushed: 0 };

  // A flock going over: across in front of whoever is looking, from one side to the other, a little above the trees,
  // calling as it goes.
  function startCrossing(eye, look) {
    const flock = crossings[crossingTurn % crossings.length]; crossingTurn += 1;
    const fx = look ? look.x : 1, fz = look ? look.z : 0, fl = Math.hypot(fx, fz) || 1;
    const ux = fx / fl, uz = fz / fl, rx = -uz, rz = ux;
    const ahead = 28 + rand() * 30, wide = 70, side = rand() < 0.5 ? 1 : -1, slant = (rand() - 0.5) * 30;
    const a = { x: eye.x + ux * (ahead + slant) - rx * wide * side, z: eye.z + uz * (ahead + slant) - rz * wide * side };
    const c = { x: eye.x + ux * (ahead - slant) + rx * wide * side, z: eye.z + uz * (ahead - slant) + rz * wide * side };
    let top = 0;
    for (let i = 0; i <= 6; i += 1) { const u = i / 6; top = Math.max(top, habitationLand(a.x + (c.x - a.x) * u, a.z + (c.z - a.z) * u)); }
    const y = Math.max(top, habitationLand(eye.x, eye.z)) + 9 + rand() * 7;
    flock.from = { x: a.x, y: y + 4, z: a.z }; flock.to = { x: c.x, y: y + 2, z: c.z };
    flock.ctrl = { x: (a.x + c.x) / 2 + ux * 6, y: y - 3, z: (a.z + c.z) / 2 + uz * 6 };
    flock.t = 0; flock.dur = Math.hypot(c.x - a.x, c.z - a.z) / (BIRD_KINDS[flock.kind].speed * 1.1);
    flock.callAt = 0.5;
    for (const m of flock.members) m.mode = 'cross';
    stats.crossings = (stats.crossings || 0) + 1;
  }
  function updateBirds(dt, people, night, eye, look) {
    const roost = night > 0.55;
    stats.flying = stats.sitting = stats.wading = stats.soaring = 0;
    // a flock over now and then, by day, for whoever is in the habitation
    const b0 = HABITATION.bounds, inside = eye && eye.x > b0.x0 && eye.x < b0.x1 && eye.z > b0.z0 && eye.z < b0.z1;
    nextCrossing -= dt;
    if (nextCrossing <= 0 && inside && !roost && !crossings.some((f) => f.members[0].mode === 'cross')) { startCrossing(eye, look); nextCrossing = 16 + rand() * 18; }
    for (const f of crossings) {
      if (f.members[0].mode !== 'cross') continue;
      f.t += dt / f.dur;
      const u = Math.min(1, f.t);
      if (u > f.callAt && calls.length < 24) { const m = f.members[0]; calls.push({ song: BIRD_KINDS[f.kind].song, kind: f.kind, x: m.x, y: m.y, z: m.z }); f.callAt += 0.18 + rand() * 0.2; }
      for (const m of f.members) {
        const nx = bez(f.from.x, f.ctrl.x, f.to.x, u) + m.offset[0], ny = bez(f.from.y, f.ctrl.y, f.to.y, u) + m.offset[1], nz = bez(f.from.z, f.ctrl.z, f.to.z, u) + m.offset[2];
        if (Math.hypot(nx - m.x, nz - m.z) > 1e-4 && m.y > -100) m.h = Math.atan2(nx - m.x, nz - m.z);
        m.x = nx; m.y = ny; m.z = nz; m.flap = 0.75; m.fold = 0; m.pitch = 0;
        if (u >= 1) { m.mode = 'idle'; m.y = -1000; }
      }
      stats.flying += f.members.length;
    }
    for (const b of birds) {
      const k = b.k;
      if (b.cross) continue;
      if (b.mode === 'soar') {
        if (roost) { const s = spotFor(b, b, 160); fly(b, s); b.roost = true; continue; }
        b.a += dt * (k.speed / b.circle.r) * b.circle.dir;
        b.circle.x += Math.sin(time * 0.013 + b.phase) * dt * 0.8; b.circle.z += Math.cos(time * 0.011 + b.phase) * dt * 0.8;
        const nx = b.circle.x + Math.cos(b.a) * b.circle.r, nz = b.circle.z + Math.sin(b.a) * b.circle.r;
        const ny = b.circle.y + Math.sin(time * 0.2 + b.phase) * 3;
        b.h = Math.atan2(nx - b.x, nz - b.z); b.pitch = 0; b.x = nx; b.y = ny; b.z = nz;
        // (gliding: a few slow beats now and then)
        b.flap = Math.sin(time * 0.35 + b.phase) > 0.85 ? 0.5 : 0.04; b.fold = 0;
        stats.soaring += 1;
      } else if (b.mode === 'fly') {
        b.t += dt / b.dur;
        const u = Math.min(1, b.t), eu = u < 0.85 ? u : 0.85 + (1 - Math.pow(1 - (u - 0.85) / 0.15, 2)) * 0.15;
        const nx = bez(b.from.x, b.ctrl.x, b.to.x, eu), ny = bez(b.from.y, b.ctrl.y, b.to.y, eu), nz = bez(b.from.z, b.ctrl.z, b.to.z, eu);
        const dx = nx - b.x, dz = nz - b.z, dy = ny - b.y;
        if (Math.hypot(dx, dz) > 1e-4) b.h = Math.atan2(dx, dz);
        b.pitch = clamp(-Math.atan2(dy, Math.hypot(dx, dz) + 1e-4), -0.5, 0.5);
        b.x = nx; b.y = ny; b.z = nz;
        // beating up, gliding level, wings spread to land
        b.flap = u > 0.88 ? 0.9 : dy > 0.02 ? 0.8 : 0.45 + 0.25 * Math.sin(time * 0.9 + b.phase); b.fold = 0;
        if (u >= 1) {
          if (k.ways === 'soar' && !b.roost) { b.mode = 'soar'; b.a = Math.atan2(b.z - b.circle.z, b.x - b.circle.x); }
          else { b.mode = k.ways === 'wade' && b.to.water ? 'wade' : 'rest'; b.spot = b.to; b.wait = (k.ways === 'flock' ? 4 : 5) + rand() * (k.ways === 'wade' ? 24 : 12); b.pitch = 0; }
        }
        stats.flying += 1;
      } else {
        // sitting or wading: still (a wader walks a few steps now and then); wings folded
        b.fold = Math.min(1, b.fold + dt * 3); b.flap = 0;
        if (b.mode === 'wade') {
          stats.wading += 1;
          if (b.step) { const d = Math.hypot(b.step.x - b.x, b.step.z - b.z); if (d < 0.05) b.step = null; else { const s = Math.min(d, dt * 0.35); b.h = Math.atan2(b.step.x - b.x, b.step.z - b.z); b.x += ((b.step.x - b.x) / d) * s; b.z += ((b.step.z - b.z) / d) * s; } }
          else if (rand() < dt * 0.15) { const a = rand() * TAU, r = 0.6 + rand() * 1.4, x = b.x + Math.cos(a) * r, z = b.z + Math.sin(a) * r, w = habitationWaterAt(x, z); if (w && w.depth < 0.25) b.step = { x, z }; }
          const w = habitationWaterAt(b.x, b.z);
          if (w) b.y = w.level - Math.min(0.22, w.depth) + 0.24 * k.span;
        } else stats.sitting += 1;
        // someone close: up and away (a wader further off than a small bird among the leaves)
        const low = b.spot && b.y - habitationLand(b.x, b.z) < 6;
        const shy = k.ways === 'wade' ? 9 : k.ways === 'kingfisher' ? 6 : k.ways === 'low' ? 4 : low ? 7 : 0;
        let flushed = false;
        if (shy) for (const p of people) if (Math.hypot(p.x - b.x, p.z - b.z) < shy && Math.abs((p.y || 0) - b.y) < 6) { flushed = true; break; }
        b.wait -= dt;
        // (and flies off calling, as a startled bird does)
        if (flushed && !roost) { stats.flushed += 1; if (calls.length < 24) calls.push({ song: k.song, kind: b.kind, x: b.x, y: b.y, z: b.z, alarm: true }); fly(b, spotFor(b, b, 70), { low: k.ways === 'wade' }); continue; }
        if (k.ways === 'soar' && b.wait <= 0 && !roost) {
          // (an eagle that roosted for the night goes back up to circle once it is light)
          b.roost = false;
          fly(b, { x: b.circle.x + Math.cos(b.a) * b.circle.r, y: b.circle.y, z: b.circle.z + Math.sin(b.a) * b.circle.r });
          continue;
        }
        if (b.wait <= 0 && !roost && !(b.flock && b.flock.leader !== b)) {
          // off again: a kingfisher dives for a fish and comes back; the rest go to another place near home
          if (k.ways === 'kingfisher' && rand() < 0.5 && b.spot) { const a = rand() * TAU, x = b.x + Math.cos(a) * 4, z = b.z + Math.sin(a) * 4, w = habitationWaterAt(x, z); if (w) { const back = { ...b.spot }; fly(b, { x, y: w.level + 0.05, z }, { low: true }); b.then = back; continue; } }
          const from = Math.hypot(b.x - b.home.x, b.z - b.home.z) > 70 ? b.home : b;
          fly(b, spotFor(b, from, 70), { low: k.ways === 'wade' });
          if (b.flock) for (const m of b.flock.members) { const t = { x: b.to.x + m.offset[0] * 0.25, y: b.to.y + Math.abs(m.offset[1]) * 0.2, z: b.to.z + m.offset[2] * 0.25 }; fly(m, t); m.dur = b.dur * (0.95 + rand() * 0.1); }
        }
        if (b.then && b.mode === 'rest') { const back = b.then; b.then = null; b.wait = 0; fly(b, back, { low: true }); }
      }
      // a song now and then, by day, from a bird that is near enough to be heard
      if (!roost && time > b.songAt) {
        b.songAt = time + (k.ways === 'flock' ? 2 + rand() * 5 : k.ways === 'soar' ? 18 + rand() * 30 : 4 + rand() * 12);
        if (eye && Math.hypot(b.x - eye.x, b.z - eye.z) < 150 && calls.length < 24) calls.push({ song: k.song, kind: b.kind, x: b.x, y: b.y, z: b.z });
      }
    }
    // drawing: each kind's birds, where they are, those far off not at all
    for (const { mesh, state, list } of birdMeshes.values()) {
      let n = 0;
      for (const b of list) {
        if (b.mode === 'idle') continue;
        if (eye && Math.hypot(b.x - eye.x, b.z - eye.z) > (lite ? 220 : 340)) continue;
        e.set(b.pitch, b.h, b.mode === 'soar' ? -0.25 * b.circle.dir : 0);
        q.setFromEuler(e);
        const s = b.k.span;
        // (sitting, the bird's body stands a little up; its feet on the branch)
        at.set(b.x, b.y + (b.mode === 'rest' ? s * 0.04 : 0), b.z);
        m4.compose(at, q, sc.set(s, s, s));
        mesh.setMatrixAt(n, m4);
        state[n * 4] = b.rate; state[n * 4 + 1] = b.flap; state[n * 4 + 2] = b.phase; state[n * 4 + 3] = b.fold;
        n += 1;
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.geometry.attributes.birdState.needsUpdate = true;
    }
  }

  function updateFish(dt, people, eye) {
    stats.scattered = 0;
    for (const s of shoals) {
      // a person close to any fish of it: the shoal is startled and makes for a place well away from them
      let fright = null;
      for (const f of s.fish) for (const p of people) { const d = Math.hypot(p.x - f.x, p.z - f.z); if (d < 4.2) { fright = p; break; } }
      if (fright && s.scare <= 0) {
        s.scare = 3.5;
        let best = null, far = -1;
        for (let i = 0; i < 8; i += 1) { const c = s.spots[Math.floor(rand() * s.spots.length)]; const d = Math.hypot(c.x - fright.x, c.z - fright.z); if (d > far) { far = d; best = c; } }
        s.goal = best;
        for (const f of s.fish) { const d = Math.hypot(f.x - fright.x, f.z - fright.z) || 1; f.scare = 1.4 + rand() * 0.6; f.away = [(f.x - fright.x) / d, (f.z - fright.z) / d]; }
      }
      s.scare = Math.max(0, s.scare - dt);
      if (s.scare > 0) stats.scattered += 1;
      // the shoal's middle wanders slowly from place to place
      const gx = s.goal.x - s.at.x, gz = s.goal.z - s.at.z, gd = Math.hypot(gx, gz);
      if (gd < 0.8) s.goal = s.spots[Math.floor(rand() * s.spots.length)];
      else { const v = (s.scare > 0 ? 2.6 : 0.35) * dt; s.at.x += (gx / gd) * Math.min(gd, v); s.at.z += (gz / gd) * Math.min(gd, v); }
      for (const f of s.fish) {
        let tx, tz, speed;
        if (f.scare > 0) { f.scare -= dt; tx = f.x + f.away[0] * 3; tz = f.z + f.away[1] * 3; speed = 3.4; }
        else { const a = time * 0.15 + f.phase; tx = s.at.x + f.off[0] + Math.cos(a) * 0.6; tz = s.at.z + f.off[1] + Math.sin(a) * 0.6; speed = Math.min(0.9, 0.25 + Math.hypot(tx - f.x, tz - f.z) * 0.35); }
        const want = Math.atan2(tx - f.x, tz - f.z);
        f.h += clamp(angleTo(f.h, want), -dt * (f.scare > 0 ? 9 : 2.4), dt * (f.scare > 0 ? 9 : 2.4));
        f.v += (speed - f.v) * Math.min(1, dt * (f.scare > 0 ? 6 : 1.5));
        const nx = f.x + Math.sin(f.h) * f.v * dt, nz = f.z + Math.cos(f.h) * f.v * dt;
        // (kept in its water, deep enough: looked at a few times a second)
        f.check -= dt;
        if (f.check <= 0) { f.check = 0.25; const w = habitationWaterAt(nx, nz); f.ok = !!w && w.id === s.water && w.depth > 0.18; f.level = w ? w.level : f.level; f.depth = w ? w.depth : f.depth; }
        if (f.ok) { f.x = nx; f.z = nz; } else { f.h += Math.PI * 0.6; f.check = 0; }
        const depth = f.depth || 0.5;
        f.y = (f.level !== undefined ? f.level : 0) - clamp(depth * 0.45, 0.1, 0.8);
      }
    }
    for (const { mesh, state, list } of fishMeshes.values()) {
      let n = 0;
      for (const { f } of list) {
        if (eye && Math.hypot(f.x - eye.x, f.z - eye.z) > (lite ? 45 : 70)) continue;
        e.set(0, f.h, 0); q.setFromEuler(e);
        m4.compose(at.set(f.x, f.y, f.z), q, sc.set(f.size, f.size, f.size));
        mesh.setMatrixAt(n, m4);
        state[n * 3] = f.rate * (f.scare > 0 ? 2.2 : 1); state[n * 3 + 1] = f.scare > 0 ? 0.12 : 0.06 + f.v * 0.05; state[n * 3 + 2] = f.phase;
        n += 1;
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.geometry.attributes.fishState.needsUpdate = true;
    }
  }

  function updateFireflies(dt, night, eye) {
    const on = night > 0.5;
    fireflies.visible = on;
    stats.fireflies = on ? flyCount : 0;
    if (!on) return;
    for (let i = 0; i < flyCount; i += 1) {
      const f = flies[i];
      f.a += dt * f.s * (0.6 + 0.4 * Math.sin(time * 0.3 + i));
      f.x += Math.cos(f.a) * dt * f.s; f.z += Math.sin(f.a) * dt * f.s;
      const y = f.base + f.y + Math.sin(time * 0.7 + i) * 0.3;
      flyPos[i * 3] = f.x; flyPos[i * 3 + 1] = y; flyPos[i * 3 + 2] = f.z;
      // (a firefly's light: a slow glow up and out, then dark for a while)
      const cyc = (time * f.rate + f.blink) % 3.2, glow = cyc < 0.9 ? Math.sin((cyc / 0.9) * Math.PI) : 0;
      const k = glow * night * (eye && Math.hypot(f.x - eye.x, f.z - eye.z) < 90 ? 1 : 0);
      flyCol[i * 3] = 0.75 * k; flyCol[i * 3 + 1] = 1.0 * k; flyCol[i * 3 + 2] = 0.35 * k;
    }
    flyGeom.attributes.position.needsUpdate = true; flyGeom.attributes.color.needsUpdate = true;
  }

  // footprints: each walker on the sand leaves one every stride, left and right in turn
  function updatePrints(dt, people) {
    const seen = new Set();
    for (const p of people) {
      if (!p.key || p.riding) continue;
      seen.add(p.key);
      let w = walkers.get(p.key);
      if (!w) { w = { x: p.x, z: p.z, side: 1 }; walkers.set(p.key, w); continue; }
      const d = Math.hypot(p.x - w.x, p.z - w.z);
      if (d > 6) { w.x = p.x; w.z = p.z; continue; }
      if (d < 0.68) continue;
      const h = Math.atan2(p.x - w.x, p.z - w.z);
      w.x = p.x; w.z = p.z; w.side = -w.side;
      const f = habitationFooting(p.x, p.z);
      if (!f || (f.kind !== 'sand' && !(f.kind === 'path' && f.surface === 'sand'))) continue;
      const px = p.x + Math.cos(h) * 0.11 * w.side, pz = p.z - Math.sin(h) * 0.11 * w.side;
      printList.push({ x: px, y: habitationLand(px, pz) + 0.015, z: pz, h, age: 0 });
      if (printList.length > PRINTS) printList.shift();
    }
    for (const key of walkers.keys()) if (!seen.has(key)) walkers.delete(key);
    let n = 0;
    for (let i = printList.length - 1; i >= 0; i -= 1) { const pr = printList[i]; pr.age += dt; if (pr.age > PRINT_LIFE) printList.splice(i, 1); }
    for (const pr of printList) {
      e.set(0, pr.h, 0); q.setFromEuler(e);
      m4.compose(at.set(pr.x, pr.y, pr.z), q, sc.set(1, 1, 1));
      prints.setMatrixAt(n, m4);
      printFade[n] = 1 - Math.max(0, (pr.age - PRINT_LIFE * 0.5) / (PRINT_LIFE * 0.5));
      n += 1;
    }
    prints.count = n; stats.prints = n;
    prints.instanceMatrix.needsUpdate = true;
    printGeom.attributes.printFade.needsUpdate = true;
  }

  function update(dt, { eye = null, look = null, people = [], night = 0 } = {}) {
    time += dt;
    clock.value = time % 3600;
    updateBirds(dt, people, night, eye, look);
    updateFish(dt, people, eye);
    updateFireflies(dt, night, eye);
    updatePrints(dt, people);
  }

  return {
    update,
    group,
    // the birds that sang since this was last asked: [{ song, kind, x, y, z }]
    calls() { const out = calls.splice(0); return out; },
    // (for the tests: what lives here now)
    state: () => ({ ...stats, kindsSeen: [...birdMeshes.keys()], birdsNow: birds.map((b) => ({ kind: b.kind, mode: b.mode, x: +b.x.toFixed(1), y: +b.y.toFixed(1), z: +b.z.toFixed(1) })), fishNow: shoals.map((s) => ({ water: s.water, scared: s.scare > 0, fish: s.fish.map((f) => ({ x: +f.x.toFixed(2), z: +f.z.toFixed(2), y: +f.y.toFixed(2) })) })) }),
    dispose() {
      scene.remove(group);
      for (const { mesh } of birdMeshes.values()) { mesh.geometry.dispose(); mesh.dispose(); }
      for (const { mesh } of fishMeshes.values()) { mesh.geometry.dispose(); mesh.dispose(); }
      birdMat.dispose(); fishMat.dispose();
      flyGeom.dispose(); fireflies.material.dispose(); dot.dispose();
      printGeom.dispose(); printMat.dispose(); printTex.dispose(); prints.dispose();
    },
  };
}
