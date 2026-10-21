// The roads not open yet, and the edge of the built land, as they are drawn (19 October 2026, the owner's brief:
// players see that a road is closed, rather than riding into an unfinished part of the map). What each is and where
// is closures.js; each is solid exactly where it is drawn here (atani.js).
//
// A roadblock, across the road and both verges a little before its end: barricades on timber trestles, their boards
// striped red and white, the white of the stripes giving back light at night as reflective sheeting does; amber lamps
// on every other one, blinking after dark; a red-and-white painted oil drum at each end; a line of cones before it;
// and a ROAD CLOSED board saying why, its face lit. The edge of the land: timber posts every three metres with two
// striped rails, and a board now and then saying that the land beyond is under construction.
//
// What it costs: see FENCE_CHUNK below.

import { ZONE_CLOSURES, ZONE_EDGE_FENCES, CLOSURE_KIT, EDGE_FENCE, zoneGroundY } from '../sim/zone.js';
import { textTexture, surface } from './render-kit.js';

const RED = '#c4302b', WHITE = '#f3f1ea';
// diagonal red and white stripes, as on a barricade's boards (repeated along a board or a rail every `STRIPE` metres)
const STRIPE = 0.6;
function stripes() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = WHITE; g.fillRect(0, 0, 128, 32);
  g.fillStyle = RED;
  for (let x = -64; x < 192; x += 64) { g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 32, 0); g.lineTo(x + 64, 0); g.lineTo(x + 32, 32); g.closePath(); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
  return t;
}
// what of the stripes gives back light at night: the white
function stripeGlow() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 32);
  g.fillStyle = '#000000';
  for (let x = -64; x < 192; x += 64) { g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 32, 0); g.lineTo(x + 64, 0); g.lineTo(x + 32, 32); g.closePath(); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
// an oil drum's paint: bands round it, red and white
function drumPaint() {
  const c = document.createElement('canvas'); c.width = 16; c.height = 128;
  const g = c.getContext('2d');
  for (let i = 0; i < 4; i += 1) { g.fillStyle = i % 2 ? WHITE : RED; g.fillRect(0, i * 32, 16, 32); }
  g.fillStyle = 'rgba(40,30,25,0.55)'; g.fillRect(0, 0, 16, 5); g.fillRect(0, 123, 16, 5);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
  return t;
}

// Many shapes, each placed by a matrix, made into one geometry (positions, normals and pictures' coordinates).
class Pile {
  constructor() { this.parts = []; }
  add(geometry, matrix, uvScale = null) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    if (uvScale) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * uvScale[0], uv.getY(i) * uvScale[1]); }
    g.applyMatrix4(matrix);
    this.parts.push(g);
    return this;
  }
  build(material) {
    let n = 0;
    for (const g of this.parts) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let k = 0;
    for (const g of this.parts) {
      pos.set(g.attributes.position.array, k * 3); nor.set(g.attributes.normal.array, k * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, k * 2);
      k += g.attributes.position.count;
      g.dispose();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geometry.computeBoundingSphere();
    this.parts = [];
    return new THREE.Mesh(geometry, material);
  }
}
// a matrix: at (x, y, z), turned `ry` about the vertical, then `rx` about its own x and `rz` about its own z
const at = (x, y, z, ry = 0, rx = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(1, 1, 1));

// What it costs (measured 19 October 2026: drawn as one mesh a material for the whole map, the fence alone was some
// 70,000 triangles in every frame, shadows included, wherever the player was): each roadblock, and each sixty metres
// of fence, is its own few meshes (one a material), so that only those in view are drawn at all, and none further off
// than it can be made out.
const FENCE_CHUNK = 20;              // panels of fence (three metres each) in one piece
const SEE_FENCE = 170, SEE_BLOCK = 320;   // metres beyond which a piece of fence, and a roadblock, is not drawn

export function buildClosures(scene, { lite = false } = {}) {
  const stripeMap = stripes(), glowMap = stripeGlow();
  const materials = {
    // (the white of the stripes gives back light after dark, as reflective sheeting does in a vehicle's lamps)
    striped: surface({ map: stripeMap, roughness: 0.55, metalness: 0, emissive: new THREE.Color(0xffffff), emissiveMap: glowMap, emissiveIntensity: 0.04 }),
    timber: surface({ color: 0x75604a, roughness: 0.9, metalness: 0 }),
    steel: surface({ color: 0x2b2d31, roughness: 0.6, metalness: 0.3 }),
    drum: surface({ map: drumPaint(), roughness: 0.5, metalness: 0.25 }),
    cone: surface({ color: 0xe56a1e, roughness: 0.6, metalness: 0 }),
    collar: surface({ color: 0xf2f2ee, roughness: 0.4, metalness: 0, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.04 }),
    lens: new THREE.MeshStandardMaterial({ color: 0x5a3a08, emissive: new THREE.Color(0xffa31a), emissiveIntensity: 0.4, roughness: 0.3, metalness: 0 }),
  };
  materials.posts = materials.timber;
  // the pieces: { see (metres it is drawn from), piles (by material), faces (the boards' faces, by what they say) }
  const pieces = [];
  const piece = (see) => { const p = { see, piles: {}, faces: new Map(), meshes: [], x: 0, z: 0, r: 0 }; pieces.push(p); return p; };
  const pile = (p, k) => p.piles[k] || (p.piles[k] = new Pile());
  const face = (p, lines, place) => { const words = lines.join('\n'); if (!p.faces.has(words)) p.faces.set(words, { lines, at: [] }); p.faces.get(words).at.push(place); };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const K = CLOSURE_KIT;

  // ---- each roadblock ----
  for (const c of ZONE_CLOSURES) {
    const P = piece(SEE_BLOCK);
    const len = Math.hypot(c.b.x - c.a.x, c.b.z - c.a.z);
    const ux = (c.b.x - c.a.x) / len, uz = (c.b.z - c.a.z) / len;
    const fx = Math.sin(c.facing), fz = Math.cos(c.facing);
    // the way the boards run (along the line), as a turn about the vertical: their length is their own x
    const along = Math.atan2(-uz, ux);
    const n = Math.max(1, Math.floor(len / (K.barricade + K.gap)));
    const step = len / n;
    for (let i = 0; i < n; i += 1) {
      const d = step * (i + 0.5);
      const x = c.a.x + ux * d, z = c.a.z + uz * d, y = zoneGroundY(x, z);
      // the trestles: at each end an A of two legs, splayed to the front and the back, and a foot along the ground
      for (const s of [-1, 1]) {
        const lx = x + ux * s * (K.barricade / 2 - 0.25), lz = z + uz * s * (K.barricade / 2 - 0.25);
        // (a leg on the front leans its top back, one on the back leans it forward: they meet at the top. The board's own
        // z, turned with it, points `toFront` times the front)
        const toFront = Math.sign(fx * Math.sin(along) + fz * Math.cos(along)) || 1;
        for (const lean of [-1, 1]) pile(P, 'timber').add(box(0.07, K.height + 0.05, 0.07), at(lx + fx * lean * 0.14, y + K.height / 2, lz + fz * lean * 0.14, along, -lean * toFront * 0.24));
        pile(P, 'timber').add(box(0.08, 0.06, K.depth), at(lx, y + 0.03, lz, along));
      }
      // three boards, striped
      for (const h of [0.42, 0.74, 1.06]) pile(P, 'striped').add(box(K.barricade, 0.2, 0.035), at(x + fx * 0.04, y + h, z + fz * 0.04, along), [K.barricade / STRIPE, 1]);
      // an amber lamp on every other one
      if (i % 2 === 0) {
        const px = x + ux * (K.barricade / 2 - 0.25), pz = z + uz * (K.barricade / 2 - 0.25);
        pile(P, 'steel').add(box(0.12, 0.16, 0.1), at(px, y + K.height + 0.1, pz, along));
        pile(P, 'lens').add(new THREE.CylinderGeometry(0.075, 0.075, 0.04, 14), at(px + fx * 0.06, y + K.height + 0.12, pz + fz * 0.06, c.facing, Math.PI / 2));
      }
    }
    // a painted oil drum at each end
    for (const [pt, s] of [[c.a, -1], [c.b, 1]]) {
      const x = pt.x + ux * s * (K.drum / 2 + 0.05), z = pt.z + uz * s * (K.drum / 2 + 0.05), y = zoneGroundY(x, z);
      pile(P, 'drum').add(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 16, 1, false), at(x, y + 0.44, z));
    }
    // cones in a line before it, across the road
    for (let i = 0; i < K.cones; i += 1) {
      const d = len * (i + 0.5) / K.cones;
      const x = c.a.x + ux * d + fx * K.coneAhead, z = c.a.z + uz * d + fz * K.coneAhead, y = zoneGroundY(x, z);
      pile(P, 'cone').add(new THREE.ConeGeometry(0.17, 0.7, 14), at(x, y + 0.39, z));
      pile(P, 'cone').add(box(0.42, 0.04, 0.42), at(x, y + 0.02, z));
      pile(P, 'collar').add(new THREE.CylinderGeometry(0.105, 0.125, 0.1, 14, 1, true), at(x, y + 0.48, z));
    }
    // the board: ROAD CLOSED and why, on two posts in the middle, before the barricades, facing what comes
    const mx = (c.a.x + c.b.x) / 2 + fx * 1.1, mz = (c.a.z + c.b.z) / 2 + fz * 1.1, my = zoneGroundY(mx, mz);
    for (const s of [-1, 1]) pile(P, 'steel').add(box(0.08, 2.5, 0.08), at(mx + ux * s * 1.0, my + 1.25, mz + uz * s * 1.0));
    pile(P, 'steel').add(box(2.5, 1.1, 0.05), at(mx - fx * 0.03, my + 2.0, mz - fz * 0.03, c.facing));
    face(P, c.sign, { x: mx + fx * 0.005, y: my + 2.0, z: mz + fz * 0.005, facing: c.facing, w: 2.4, h: 1.0 });
  }

  // ---- the edge of the land: posts, two striped rails, and a board every so often ----
  let posts = 0;
  const fenceBoard = ['UNDER CONSTRUCTION', 'No way through: this land is not built yet'];
  for (const r of ZONE_EDGE_FENCES) {
    const len = Math.hypot(r.b.x - r.a.x, r.b.z - r.a.z);
    const ux = (r.b.x - r.a.x) / len, uz = (r.b.z - r.a.z) / len;
    const along = Math.atan2(-uz, ux);
    const count = Math.max(1, Math.round(len / EDGE_FENCE.post));
    const span = len / count;
    const pieceAt = [];          // the piece each stretch of FENCE_CHUNK panels is in
    const pieceOf = (i) => pieceAt[Math.floor(Math.min(count - 1, Math.max(0, i)) / FENCE_CHUNK)] || (pieceAt[Math.floor(Math.min(count - 1, Math.max(0, i)) / FENCE_CHUNK)] = piece(SEE_FENCE));
    const post = (i) => { const x = r.a.x + (ux * len * i) / count, z = r.a.z + (uz * len * i) / count, y = zoneGroundY(x, z); pile(pieceOf(Math.min(i, count - 1)), 'posts').add(box(0.11, EDGE_FENCE.height + 0.1, 0.11), at(x, y + (EDGE_FENCE.height + 0.1) / 2, z, along)); posts += 1; };
    for (let i = 0; i <= count; i += 1) post(i);
    // the rails, a length of them between each pair of posts (so that they follow the ground where it rises)
    for (let i = 0; i < count; i += 1) {
      const x0 = r.a.x + (ux * len * i) / count, z0 = r.a.z + (uz * len * i) / count, x1 = r.a.x + (ux * len * (i + 1)) / count, z1 = r.a.z + (uz * len * (i + 1)) / count;
      const y0 = zoneGroundY(x0, z0), y1 = zoneGroundY(x1, z1);
      const tilt = Math.atan2(y1 - y0, span);
      if (r.style === 'wood') for (const h of [0.45, 0.95]) pile(pieceOf(i), 'timber').add(box(span, 0.13, 0.06), at((x0 + x1) / 2, (y0 + y1) / 2 + h, (z0 + z1) / 2, along, 0, tilt));
      else for (const h of [0.5, 0.98]) pile(pieceOf(i), 'striped').add(box(span, 0.11, 0.03), at((x0 + x1) / 2, (y0 + y1) / 2 + h, (z0 + z1) / 2, along, 0, tilt), [span / STRIPE, 0.6]);
    }
    // a board facing in, every hundred and forty metres or so (and one on a short run); none on a wooden fence (the
    // habitation's side of its car park: the land beyond is built)
    if (r.style === 'wood') continue;
    const boards = Math.max(1, Math.round(len / 140));
    const inward = Math.atan2(-r.out.x, -r.out.z);
    for (let k = 0; k < boards; k += 1) {
      const d = (len * (k + 0.5)) / boards;
      const P = pieceOf(Math.floor(d / span));
      const x = r.a.x + ux * d - r.out.x * 0.2, z = r.a.z + uz * d - r.out.z * 0.2, y = zoneGroundY(x, z);
      for (const sgn of [-1, 1]) pile(P, 'steel').add(box(0.07, 1.9, 0.07), at(x + ux * sgn * 0.85, y + 0.95, z + uz * sgn * 0.85));
      pile(P, 'steel').add(box(1.9, 0.8, 0.04), at(x + r.out.x * 0.025, y + 1.45, z + r.out.z * 0.025, inward));
      face(P, fenceBoard, { x, y: y + 1.45, z, facing: inward, w: 1.8, h: 0.72 });
    }
  }

  // the boards' faces: a material for each wording (made once), lit by its own light (read at night as by day)
  const faceMaterials = new Map();
  const faceMaterial = (lines, w, h) => {
    const words = lines.join('\n');
    if (faceMaterials.has(words)) return faceMaterials.get(words);
    const wide = Math.round((1024 * h) / w / 32) * 32 || 256;
    // (the first line large and red, what follows smaller and black, all well inside the board's red edge)
    const rows = lines.map((text, i) => (i === 0 ? { text, size: 104, colour: RED } : { text, size: 66, colour: '#161616' }));
    const map = textTexture(rows, { width: 1024, height: wide, background: '#f5f3ea', colour: '#161616', border: RED, size: 80, scale: lite ? 0.5 : 1 });
    const m = new THREE.MeshBasicMaterial({ map, toneMapped: false });
    faceMaterials.set(words, m);
    return m;
  };

  const meshes = [];
  const shadows = !lite;
  const sphere = new THREE.Sphere();
  for (const P of pieces) {
    const box3 = new THREE.Box3();
    for (const [k, pl] of Object.entries(P.piles)) {
      if (!pl.parts.length) continue;
      const mesh = pl.build(materials[k]);
      mesh.name = `closures-${k}`;
      mesh.castShadow = shadows && k !== 'lens' && k !== 'collar'; mesh.receiveShadow = true;
      mesh.geometry.computeBoundingBox(); box3.union(mesh.geometry.boundingBox);
      scene.add(mesh); meshes.push(mesh); P.meshes.push(mesh);
    }
    for (const { lines, at: places } of P.faces.values()) {
      const f = new Pile();
      for (const pl of places) f.add(new THREE.PlaneGeometry(pl.w, pl.h), at(pl.x, pl.y, pl.z, pl.facing));
      const mesh = f.build(faceMaterial(lines, places[0].w, places[0].h));
      mesh.name = 'closures-signs';
      scene.add(mesh); meshes.push(mesh); P.meshes.push(mesh);
    }
    box3.getBoundingSphere(sphere);
    P.x = sphere.center.x; P.z = sphere.center.z; P.r = sphere.radius;
  }

  let blink = 0;
  return {
    meshes,
    // After dark the stripes and the cones' collars give back light, and the lamps blink; by day the lamps glow faintly.
    // `near` (where the camera looks): what is too far off to be made out is not drawn.
    update(dt, night, near = null) {
      blink += dt;
      const on = Math.floor(blink * 1.25) % 2 === 0;
      materials.striped.emissiveIntensity = 0.04 + night * 0.42;
      materials.collar.emissiveIntensity = 0.04 + night * 0.5;
      materials.lens.emissiveIntensity = on ? 0.6 + night * 2.4 : 0.15;
      if (near) for (const P of pieces) { const shown = Math.hypot(P.x - near.x, P.z - near.z) - P.r < P.see; if (P.meshes[0] && P.meshes[0].visible !== shown) for (const m of P.meshes) m.visible = shown; }
    },
    get posts() { return posts; },
    get pieces() { return pieces.length; },
  };
}
