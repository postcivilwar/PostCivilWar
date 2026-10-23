// Things that change: vehicles, survey markers, building sites, block stacks.

import { ZONE_PARCELS, zoneSiteLayout } from '../sim/zone.js';
import { DESIGNS, PAINT_COLOURS } from '../sim/economy.js';
import { structureFootprint } from '../sim/sim.js';
import { Batch, place, linear, textTexture, addPitchedRoof, addWindow, buildingKit, shadeOf, surface } from './render-kit.js';
import { makeVehicleModel } from './vehicle-models.js';
import { addVehicle } from './render-vehicles.js';

const matte = (hex) => surface({ color: linear(hex), roughness: 0.9, metalness: 0 });

// --- vehicles --------------------------------------------------------------------

// A vehicle the simulation owns: the supplied model in this vehicle's own
// colours and markings, with wheels that turn and steer.
export function makeVehicle(look, plateText, region) {
  const model = makeVehicleModel(look, { plate: plateText, region, level: 1 });
  const group = model.group;
  // a ring on the ground under a vehicle the player may drive
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.45, 1.7, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.08;
  ring.visible = false;
  group.add(ring);
  return { group, ring, model };
}

// A van that moves: the hospital's ambulance. It is the same van that used to
// stand in the hospital yard, built on its own so that it can be driven.
export function makeVan({ body, band, beacon }, glowMaterial) {
  const solid = new Batch(), glow = new Batch();
  addVehicle(solid, glow, { kind: 'van', x: 0, z: 0, heading: 0, body, band });
  const group = new THREE.Group();
  const shell = solid.build(surface({ vertexColors: true, roughness: 0.6, metalness: 0.1 }));
  shell.castShadow = true; shell.receiveShadow = true;
  group.add(shell);
  if (!glow.empty) group.add(glow.build(glowMaterial));
  // the lamp on the roof
  const lamp = new THREE.MeshStandardMaterial({ color: linear(beacon), roughness: 0.3, metalness: 0, emissive: linear(beacon), emissiveIntensity: 0 });
  const light = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), lamp);
  light.position.set(0, 2.3, 1.4);
  group.add(light);
  return { group, beacon: lamp, siren: null };
}

// --- survey markers -------------------------------------------------------------

const STATUS_COLOUR = { available: 0xd8d8d6, yours: 0xffffff, taken: 0x6f6f73 };

export function createParcelLayer(scene) {
  const material = surface({ vertexColors: true, roughness: 0.9, metalness: 0 });
  let mesh = null;
  let signature = '';
  const boards = new Map();

  function boardFor(p) {
    const layout = zoneSiteLayout(p);
    const group = new THREE.Group();
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.5, 0.09), matte(0x5d4a35));
    post.position.y = 0.75;
    post.castShadow = true;
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.95), new THREE.MeshBasicMaterial({ toneMapped: false, side: THREE.DoubleSide }));
    plate.position.y = 1.45;
    group.add(post, plate);
    group.position.set(layout.board.x, 0, layout.board.z);
    group.rotation.y = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[layout.facing];
    scene.add(group);
    return { group, plate, state: '' };
  }

  function update(parcels) {
    const next = parcels.map((p) => (p.yours ? 'y' : p.status === 'available' ? 'a' : 't')).join('');
    if (next === signature) return;
    signature = next;
    if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); }
    const batch = new Batch();
    parcels.forEach((row, index) => {
      const p = ZONE_PARCELS[index];
      const key = row.yours ? 'yours' : row.status === 'available' ? 'available' : 'taken';
      const colour = STATUS_COLOUR[key];
      const w = p.x1 - p.x0;
      const d = p.z1 - p.z0;
      batch.box(w, 0.05, 0.1, place(p.cx, 0.04, p.z0 + 0.05), colour);
      batch.box(w, 0.05, 0.1, place(p.cx, 0.04, p.z1 - 0.05), colour);
      batch.box(0.1, 0.05, d, place(p.x0 + 0.05, 0.04, p.cz), colour);
      batch.box(0.1, 0.05, d, place(p.x1 - 0.05, 0.04, p.cz), colour);
      for (const [x, z] of [[p.x0, p.z0], [p.x1, p.z0], [p.x0, p.z1], [p.x1, p.z1]]) {
        batch.box(0.22, 0.5, 0.22, place(x + (x === p.x0 ? 0.11 : -0.11), 0.25, z + (z === p.z0 ? 0.11 : -0.11)), colour);
      }
      let board = boards.get(p.id);
      if (!board) { board = boardFor(p); boards.set(p.id, board); }
      if (board.state !== key) {
        board.state = key;
        const second = key === 'yours' ? 'YOUR LAND' : key === 'available' ? 'FOR SALE' : 'PRIVATE';
        const palette = key === 'yours' ? ['#ffffff', '#0a0a0a'] : key === 'available' ? ['#e4e4e2', '#0a0a0a'] : ['#8e8e93', '#0a0a0a'];
        if (board.plate.material.map) board.plate.material.map.dispose();
        board.plate.material.map = textTexture([{ text: `PLOT ${p.plot}`, size: 62 }, { text: second, size: 44 }, { text: `${p.area.toLocaleString('en-GB')} m²`, size: 34 }], { width: 384, height: 240, background: palette[0], colour: palette[1], border: palette[1] });
        board.plate.material.needsUpdate = true;
      }
    });
    mesh = batch.build(material);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  return { update };
}

// --- building sites ---------------------------------------------------------------

const BLOCK_GREY = 0x9a9a94;
const ZINC = 0x8f969c;

function buildSite(parcel, site) {
  const group = new THREE.Group();
  const solid = new Batch();
  const walls = new Batch({ uv: 'wall', scale: 3.2 });
  const roofs = new Batch({ uv: 'plan', scale: 2 });
  const glass = new Batch();
  const B = { solid, walls, roofs, glow: glass };
  const layout = zoneSiteLayout(parcel);

  // materials waiting on site
  const stackX = layout.work.x + (layout.facing === 'w' ? -2.5 : 2.5);
  const stackZ = layout.work.z;
  const shown = Math.min(72, Math.ceil(site.blocks / 2));
  for (let i = 0; i < shown; i += 1) {
    const layer = Math.floor(i / 12);
    const within = i % 12;
    solid.box(0.44, 0.21, 0.22, place(stackX + (within % 4) * 0.47, 0.11 + layer * 0.22, stackZ + Math.floor(within / 4) * 0.25, 0), BLOCK_GREY, 0.92 + ((i * 7) % 5) * 0.02);
  }
  for (let i = 0; i < Math.min(12, site.cement); i += 1) {
    solid.box(0.62, 0.16, 0.4, place(stackX + (i % 3) * 0.66, 0.08 + Math.floor(i / 3) * 0.16, stackZ - 1.3), 0xc9c2b2);
  }
  if (site.other > 0) solid.box(1.4, 0.5, 0.9, place(stackX + 0.6, 0.25, stackZ - 2.6), 0x8a6a45);

  if (site.design) {
    const design = DESIGNS[site.design];
    const f = structureFootprint(parcel, design);
    const w = f.x1 - f.x0;
    const d = f.z1 - f.z0;
    const cx = parcel.cx;
    const cz = parcel.cz;
    const H = design.wallHeight;
    const stage = site.stage;
    const p = site.progress;
    const painted = site.complete ? PAINT_COLOURS[site.paint || 'cream'] : (stage === 4 ? 0xbdb6a8 : BLOCK_GREY);

    // setting-out lines and the foundation
    for (const [lx, lz, lw, ld] of [[cx, f.z0, w + 0.6, 0.06], [cx, f.z1, w + 0.6, 0.06], [f.x0, cz, 0.06, d + 0.6], [f.x1, cz, 0.06, d + 0.6]]) solid.box(lw, 0.04, ld, place(lx, 0.05, lz), 0xf3ecdc);
    const slab = stage >= 1 ? 0.3 : 0.3 * p;
    if (slab > 0.01) solid.box(w + 0.3, slab, d + 0.3, place(cx, slab / 2, cz), 0x8c877c);

    // walls
    const wallH = stage > 1 ? H : stage === 1 ? H * p : 0;
    if (wallH > 0.05) {
      const t = 0.24;
      const base = 0.3;
      const front = { s: 'z1', n: 'z0', e: 'x1', w: 'x0' }[layout.facing];
      const wall = (x, z, ww, dd, isFront) => {
        if (!isFront) { walls.box(ww, wallH, dd, place(x, base + wallH / 2, z), painted); return; }
        // front wall in two leaves around the doorway
        const along = ww > dd;
        const span = along ? ww : dd;
        const leaf = (span - 1.1) / 2;
        for (const side of [-1, 1]) {
          const off = side * (0.55 + leaf / 2);
          walls.box(along ? leaf : ww, wallH, along ? dd : leaf, place(x + (along ? off : 0), base + wallH / 2, z + (along ? 0 : off)), painted);
        }
        if (wallH > 2.15) walls.box(along ? 1.1 : ww, wallH - 2.15, along ? dd : 1.1, place(x, base + 2.15 + (wallH - 2.15) / 2, z), painted);
      };
      wall(cx, f.z0 + t / 2, w, t, front === 'z0');
      wall(cx, f.z1 - t / 2, w, t, front === 'z1');
      wall(f.x0 + t / 2, cz, t, d - 2 * t, front === 'x0');
      wall(f.x1 - t / 2, cz, t, d - 2 * t, front === 'x1');
    }

    // roof: timbers first, then sheets
    if (stage === 2 && p > 0) {
      const count = Math.max(2, Math.round(p * 6));
      const alongX = w >= d;
      for (let i = 0; i < count; i += 1) {
        const k = (i + 0.5) / 6 - 0.5;
        solid.box(alongX ? 0.1 : w + 0.8, 0.1, alongX ? d + 0.8 : 0.1, place(cx + (alongX ? k * w : 0), 0.3 + H + 0.05, cz + (alongX ? 0 : k * d)), 0x8a6a45);
      }
    }
    if (stage > 2) addPitchedRoof(B, cx, cz, w, d, 0.3 + H, site.complete ? 0x7a2f22 : ZINC, painted, 0.6, 0.5);
    // once it is finished the lower wall is painted darker, as on every house in town
    if (site.complete) walls.box(w + 0.05, 0.75, d + 0.05, place(cx, 0.3 + 0.375, cz), shadeOf(painted, 0.66));

    // doors and windows
    if (stage > 3) {
      const face = { s: [cx, f.z1 + 0.02, 0], n: [cx, f.z0 - 0.02, 0], e: [f.x1 + 0.02, cz, 1], w: [f.x0 - 0.02, cz, 1] }[layout.facing];
      const sized = (ww, hh, dd) => (face[2] ? [dd, hh, ww] : [ww, hh, dd]);
      const out = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] }[layout.facing];
      solid.box(...sized(1.26, 2.26, 0.12), place(face[0], 0.3 + 1.13, face[1]), 0x3a2a1c);
      solid.box(...sized(1.0, 2.1, 0.1), place(face[0] + out[0] * 0.05, 0.3 + 1.05, face[1] + out[1] * 0.05), 0x5a3d26);
      for (const py of [0.6, 1.5]) solid.box(...sized(0.66, 0.66, 0.05), place(face[0] + out[0] * 0.1, 0.3 + py, face[1] + out[1] * 0.1), 0x4a3120);
      solid.round(new THREE.SphereGeometry(0.045, 8, 6), place(face[0] + out[0] * 0.14 + (face[2] ? 0 : 0.36), 0.3 + 1.05, face[1] + out[1] * 0.14 + (face[2] ? 0.36 : 0)), 0xc9a227);
      solid.box(...sized(1.5, 0.14, 0.5), place(face[0] + out[0] * 0.3, 0.07, face[1] + out[1] * 0.3), 0x8d877b);
      const back = { s: [cx, f.z0 - 0.02, 0], n: [cx, f.z1 + 0.02, 0], e: [f.x0 - 0.02, cz, 1], w: [f.x1 + 0.02, cz, 1] }[layout.facing];
      const sideA = face[2] ? [cx, f.z0 - 0.02, 0] : [f.x0 - 0.02, cz, 1];
      const sideB = face[2] ? [cx, f.z1 + 0.02, 0] : [f.x1 + 0.02, cz, 1];
      for (const sd of [back, sideA, sideB]) addWindow(B, sd[0], 0.3 + H * 0.58, sd[1], !sd[2], false, 1.0, 0.85);
    }
  }

  const kit = buildingKit();
  for (const [batch, material] of [[solid, kit.solid], [walls, kit.walls], [roofs, kit.roofs]]) {
    if (batch.empty) continue;
    const mesh = batch.build(material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  let glowMaterial = null;
  if (glass.positions.length) {
    glowMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, emissive: linear(0xffc66b), emissiveIntensity: 0 });
    group.add(glass.build(glowMaterial));
  }
  return { group, glowMaterial };
}

export function createSiteLayer(scene) {
  const built = new Map();
  let lit = 0;

  function update(sites) {
    const seen = new Set();
    for (const site of sites) {
      seen.add(site.parcelId);
      const signature = `${site.design}|${site.stage}|${Math.round(site.progress * 20)}|${site.complete}|${site.paint}|${Math.ceil(site.blocks / 2)}|${site.cement}|${site.other > 0}`;
      const existing = built.get(site.parcelId);
      if (existing && existing.signature === signature) continue;
      if (existing) scene.remove(existing.group);
      const parcel = ZONE_PARCELS.find((p) => p.id === site.parcelId);
      const made = buildSite(parcel, site);
      made.signature = signature;
      made.lived = site.complete;
      if (made.glowMaterial) made.glowMaterial.emissiveIntensity = made.lived ? lit : 0;
      scene.add(made.group);
      built.set(site.parcelId, made);
    }
    for (const [id, made] of built) if (!seen.has(id)) { scene.remove(made.group); built.delete(id); }
  }

  function setNight(amount) {
    lit = amount;
    for (const made of built.values()) if (made.glowMaterial) made.glowMaterial.emissiveIntensity = made.lived ? amount : 0;
  }
  return { update, setNight };
}

// --- cured blocks at the yard ---------------------------------------------------------

export function createYardStacks(scene) {
  const capacity = 420;
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.44, 0.21, 0.22), matte(0x9c9b95), capacity);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // Pallets fill one at a time, so the yard shows full stacks and bare ground.
  const m = new THREE.Matrix4();
  let i = 0;
  for (let row = 0; row < 7 && i < capacity; row += 1) {
    for (let pallet = 0; pallet < 4 && i < capacity; pallet += 1) {
      for (let layer = 0; layer < 3 && i < capacity; layer += 1) {
        for (let k = 0; k < 6 && i < capacity; k += 1) {
          m.makeTranslation(-63.4 + pallet * 3.4 + k * 0.47, 0.11 + layer * 0.22, -194.6 + row * 2.75 + (layer % 2) * 0.05);
          mesh.setMatrixAt(i, m);
          i += 1;
        }
      }
    }
  }
  // (three.js since r151 tests a set of copies against the view by a sphere round the copies drawn when it is first
  // tested, kept after: worked out here round all of them, as they never move, so that the stacks are seen however
  // few were drawn when the yard was first in view)
  mesh.computeBoundingSphere();
  mesh.count = 0;
  scene.add(mesh);
  return { set(blocks) { const n = Math.min(capacity, Math.round(blocks / 2)); if (n !== mesh.count) mesh.count = n; } };
}
