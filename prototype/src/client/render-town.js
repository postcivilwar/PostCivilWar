// The wider town: the walled institutions and the buildings in them that can
// be walked into, the housing quarters, the trade sheds and the farms.
//
// A building that can be entered is drawn in two parts. The lower part is
// the floor, the furniture and the walls up to a cut line; the upper part is
// the rest of the walls and the roof. When the player steps inside, the upper
// part of that one building is put away, so the room can be seen from above.
// THREE is the global from three.min.js.

import { ZONE_COMPOUNDS, ZONE_HOUSES, ZONE_SHEDS, ZONE_FARMLAND, ZONE_BUILDINGS, ZONE_RANKS, ZONE_SPOTS, ZONE_CAST, CITY_AREA, zoneShedWalls } from '../sim/zone.js';
import { Batch, Chunked, createSight, place, linear, textTexture, noise, shadeOf, addPitchedRoof, buildingKit } from './render-kit.js';
import { addVehicle } from './render-vehicles.js';

const WOOD = 0x9a7a52;
const DARK_WOOD = 0x5a3d26;
const STEEL = 0x8a8f96;
const CONCRETE = 0xa8a195;
const STAINED = [0x2f6fd0, 0xc0392b, 0xf2c200, 0x2e9f6b, 0x7b4fa3];

// A plain window: a frame and a pane that glows at night.
function pane(B, x, y, z, alongX, w = 1.2, h = 1.0, thick = 0.34) {
  const size = (ww, hh, dd) => (alongX ? [ww, hh, dd] : [dd, hh, ww]);
  B.solid.box(...size(w + 0.16, h + 0.16, thick - 0.06), place(x, y, z), 0x5d4630);
  B.glow.box(...size(w, h, thick), place(x, y, z), 0xa9c6d6);
  B.solid.box(...size(0.05, h, thick + 0.02), place(x, y, z), 0x5d4630);
}

function sign(text, width, height, palette = ['#f3ecdc', '#171a2e'], lines = null) {
  const texture = textTexture(lines || text, { width: 512, height: Math.round((512 * height) / width), background: palette[0], colour: palette[1], border: palette[1], size: lines ? 23 : 36 });
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, side: THREE.DoubleSide }));
}

// ------------------------------------------------------------ furniture --

function addItem(B, item, walls) {
  const { solid, glow } = B;
  const { x, z, sx, sz, h } = item;
  const alongX = sx >= sz;
  const legs = (inset, height, colour) => { for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) solid.box(0.06, height, 0.06, place(x + dx * (sx / 2 - inset), height / 2, z + dz * (sz / 2 - inset)), colour); };
  // which way is "front": a unit step along the item's facing
  const fx = Math.sin(item.facing), fz = Math.cos(item.facing);
  switch (item.kind) {
    case 'desk': solid.box(sx, 0.05, sz, place(x, h, z), WOOD); solid.box(alongX ? 0.04 : sx, h, alongX ? sz : 0.04, place(x - (alongX ? sx / 2 - 0.02 : 0), h / 2, z - (alongX ? 0 : sz / 2 - 0.02)), shadeOf(WOOD, 0.8)); solid.box(alongX ? 0.04 : sx, h, alongX ? sz : 0.04, place(x + (alongX ? sx / 2 - 0.02 : 0), h / 2, z + (alongX ? 0 : sz / 2 - 0.02)), shadeOf(WOOD, 0.8)); break;
    case 'bench': solid.box(sx, 0.05, sz, place(x, h, z), shadeOf(WOOD, 0.9)); solid.box(alongX ? 0.05 : sx * 0.8, h, alongX ? sz * 0.8 : 0.05, place(x - (alongX ? sx / 2 - 0.1 : 0), h / 2, z - (alongX ? 0 : sz / 2 - 0.1)), DARK_WOOD); solid.box(alongX ? 0.05 : sx * 0.8, h, alongX ? sz * 0.8 : 0.05, place(x + (alongX ? sx / 2 - 0.1 : 0), h / 2, z + (alongX ? 0 : sz / 2 - 0.1)), DARK_WOOD); break;
    case 'table': solid.box(sx, 0.06, sz, place(x, h, z), WOOD); legs(0.08, h, DARK_WOOD); break;
    case 'workbench': solid.box(sx, 0.1, sz, place(x, h, z), 0x6a5038); legs(0.1, h, 0x44474b); solid.box(0.22, 0.2, 0.16, place(x + sx * 0.3, h + 0.15, z), 0x2f4f7f); break;
    case 'machine': solid.box(sx, h * 0.7, sz, place(x, h * 0.35, z), 0x3c6e47); solid.round(new THREE.CylinderGeometry(0.16, 0.16, Math.max(sx, sz) * 0.7, 10), place(x, h * 0.9, z, 0, 1, 1, 1, alongX ? 0 : Math.PI / 2, alongX ? Math.PI / 2 : 0), STEEL); solid.box(0.3, 0.5, 0.3, place(x - (alongX ? sx * 0.36 : 0), h + 0.1, z - (alongX ? 0 : sz * 0.36)), 0x55585c); break;
    case 'board': solid.box(sx + (alongX ? 0.16 : 0), h + 0.16, sz + (alongX ? 0 : 0.16), place(x, 1.65, z), DARK_WOOD); solid.box(sx + (alongX ? 0 : 0.02), h, sz + (alongX ? 0.02 : 0), place(x + fx * 0.02, 1.65, z + fz * 0.02), 0x1f3a2c); break;
    case 'lectern': solid.box(sx, h, sz, place(x, h / 2, z), DARK_WOOD); solid.box(sx + 0.1, 0.05, sz + 0.1, place(x, h + 0.02, z, 0, 1, 1, 1, 0.2, 0), WOOD); break;
    case 'labbench': solid.box(sx, h, sz, place(x, h / 2, z), 0xd8d2c2); solid.box(sx + 0.06, 0.05, sz + 0.06, place(x, h + 0.02, z), 0x2a2b2f); for (let i = 0; i < 5; i += 1) solid.round(new THREE.CylinderGeometry(0.035, 0.045, 0.16, 6), place(x + (alongX ? (i - 2) * sx * 0.18 : 0), h + 0.13, z + (alongX ? 0 : (i - 2) * sz * 0.18)), [0x2e86ab, 0xc0392b, 0xf2c200, 0x3fa796, 0xd9dde0][i]); break;
    case 'shelf': {
      solid.box(sx, h, sz, place(x, h / 2, z), DARK_WOOD);
      const colours = item.style === 'medicine' ? [0xf4f4f0, 0x2e86ab, 0xc0392b, 0x3fa796] : [0x7a2f22, 0x2f4f7f, 0x3c6e47, 0xd9a441, 0x5a1f47];
      const long = Math.max(sx, sz);
      for (let row = 0; row < 4; row += 1) for (let k = 0; k < Math.floor(long / 0.42); k += 1) { const off = -long / 2 + 0.25 + k * 0.42; for (const face of [-1, 1]) solid.box(alongX ? 0.36 : 0.05, 0.3, alongX ? 0.05 : 0.36, place(x + (alongX ? off : face * (sx / 2 + 0.01)), 0.38 + row * 0.44, z + (alongX ? face * (sz / 2 + 0.01) : off)), colours[(row * 3 + k) % colours.length]); }
      break;
    }
    case 'cabinet': solid.box(sx, h, sz, place(x, h / 2, z), 0x8a8f96); solid.box(sx * (alongX ? 0.02 : 1.02), h * 0.9, sz * (alongX ? 1.02 : 0.02), place(x, h / 2, z), 0x6e7378); break;
    case 'counter': solid.box(sx, h, sz, place(x, h / 2, z), item.style === 'food' ? 0xb98a5a : 0xd9d2c0); solid.box(sx + 0.08, 0.05, sz + 0.08, place(x, h + 0.02, z), DARK_WOOD); if (item.style === 'food') for (let i = 0; i < 3; i += 1) solid.round(new THREE.CylinderGeometry(0.2, 0.17, 0.24, 10), place(x + (alongX ? (i - 1) * 0.6 : 0), h + 0.16, z + (alongX ? 0 : (i - 1) * 0.6)), 0x3a3d42); break;
    case 'bed': {
      const high = item.style === 'trolley' ? 0.75 : item.style === 'couch' ? 0.6 : 0.5;
      const frame = item.style === 'ward' ? 0xe6e9ec : item.style === 'trolley' ? STEEL : 0x6e7378;
      solid.box(sx, 0.06, sz, place(x, high - 0.08, z), frame);
      legs(0.06, high - 0.1, frame);
      solid.box(sx - 0.08, 0.12, sz - 0.08, place(x, high + 0.01, z), item.style === 'couch' ? 0x2f5d50 : 0xf4f4f0);
      if (item.style !== 'couch') { solid.box(alongX ? 0.4 : sx * 0.7, 0.08, alongX ? sz * 0.7 : 0.4, place(x - fx * (alongX ? sx : sz) * 0.36, high + 0.1, z - fz * (alongX ? sx : sz) * 0.36), 0xdfe6ee); solid.box(alongX ? sx * 0.55 : sx - 0.06, 0.05, alongX ? sz - 0.06 : sz * 0.55, place(x + fx * (alongX ? sx : sz) * 0.2, high + 0.09, z + fz * (alongX ? sx : sz) * 0.2), item.style === 'trolley' ? 0x3fa796 : 0x9fc6d8); }
      if (item.style === 'ward') solid.box(alongX ? 0.04 : sx, 0.5, alongX ? sz : 0.04, place(x - fx * (alongX ? sx : sz) * 0.5, high + 0.15, z - fz * (alongX ? sx : sz) * 0.5), frame);
      break;
    }
    case 'cubicle': walls.box(alongX ? 0.06 : sx, h, alongX ? sz : 0.06, place(x - (alongX ? sx / 2 : 0), h / 2, z - (alongX ? 0 : sz / 2)), 0xd9dde0); walls.box(alongX ? 0.06 : sx, h, alongX ? sz : 0.06, place(x + (alongX ? sx / 2 : 0), h / 2, z + (alongX ? 0 : sz / 2)), 0xd9dde0); solid.box(0.4, 0.4, 0.5, place(x, 0.2, z), 0xf4f4f0); break;
    case 'pew': solid.box(sx, 0.06, sz, place(x, 0.44, z), DARK_WOOD); solid.box(alongX ? sx : 0.06, 0.5, alongX ? 0.06 : sz, place(x - fx * 0.22, 0.68, z - fz * 0.22), shadeOf(DARK_WOOD, 0.85)); for (const side of [-1, 1]) solid.box(alongX ? 0.06 : sx, 0.9, alongX ? sz : 0.06, place(x + (alongX ? side * (sx / 2 - 0.03) : 0), 0.45, z + (alongX ? 0 : side * (sz / 2 - 0.03))), shadeOf(DARK_WOOD, 0.7)); break;
    case 'dais': solid.box(sx, 0.1, sz, place(x, 0.05, z), 0x8a2f2f); solid.box(sx + 0.3, 0.05, sz, place(x, 0.025, z), 0xcfc9b6); break;
    case 'altar': {
      solid.box(sx, h, sz, place(x, h / 2, z), 0xd9d2c0);
      solid.box(sx + 0.16, 0.05, sz + 0.5, place(x, h + 0.02, z), 0xf7f5ee);
      solid.box(sx + 0.02, h * 0.7, 0.9, place(x, h * 0.6, z), item.style === 'catholic' ? 0x2e7d4f : 0x6a4a8a);
      const across = alongX ? [1, 0] : [0, 1];
      for (const side of [-1, 1]) { solid.round(new THREE.CylinderGeometry(0.03, 0.04, 0.4, 8), place(x + across[0] * side * 0.9, h + 0.24, z + across[1] * side * 0.9), 0xf4f4f0); glow.round(new THREE.SphereGeometry(0.035, 6, 5), place(x + across[0] * side * 0.9, h + 0.47, z + across[1] * side * 0.9), 0xffd27a); }
      solid.box(0.04, 0.42, 0.04, place(x, h + 0.25, z), 0xc9a227); solid.box(across[0] ? 0.22 : 0.04, 0.04, across[1] ? 0.22 : 0.04, place(x, h + 0.34, z), 0xc9a227);
      break;
    }
    case 'ambo': solid.box(sx, h, sz, place(x, h / 2, z), DARK_WOOD); solid.box(sx + 0.12, 0.05, sz + 0.12, place(x, h + 0.02, z), WOOD); solid.box(sx * 0.6, 0.02, sz * 0.6, place(x, h + 0.06, z), 0xf7f5ee); break;
    case 'tabernacle': solid.box(sx, 1.0, sz, place(x, 0.5, z), 0xd9d2c0); solid.box(0.42, 0.5, 0.42, place(x, 1.25, z), 0xc9a227); solid.box(0.3, 0.3, 0.44, place(x, 1.22, z), 0xa8841a); glow.round(new THREE.SphereGeometry(0.07, 8, 6), place(x - fz * 0.7, 1.7, z + fx * 0.7), 0xff3b2f); solid.round(new THREE.CylinderGeometry(0.01, 0.01, 0.7, 4), place(x - fz * 0.7, 2.1, z + fx * 0.7), 0xc9a227); break;
    case 'cross-table': solid.box(sx, 0.95, sz, place(x, 0.475, z), DARK_WOOD); solid.box(sx + 0.1, 0.04, sz + 0.1, place(x, 0.97, z), 0xf7f5ee); solid.box(0.05, 0.7, 0.05, place(x, 1.35, z), 0xc9a227); solid.box(alongX ? 0.05 : 0.36, 0.05, alongX ? 0.36 : 0.05, place(x, 1.5, z), 0xc9a227); break;
    case 'font': solid.round(new THREE.CylinderGeometry(0.16, 0.26, h * 0.8, 10), place(x, h * 0.4, z), 0xcfc9b6); solid.round(new THREE.CylinderGeometry(0.42, 0.3, 0.26, 12), place(x, h - 0.08, z), 0xd9d2c0); glow.round(new THREE.CylinderGeometry(0.34, 0.34, 0.02, 12), place(x, h + 0.05, z), 0x86a9bd); break;
    case 'confessional': solid.box(sx, h, sz, place(x, h / 2, z), DARK_WOOD); solid.box(sx * 0.3, h * 0.8, 0.04, place(x, h * 0.42, z + sz / 2 + 0.01), 0x6b2d3a); solid.box(sx + 0.1, 0.08, sz + 0.1, place(x, h + 0.03, z), shadeOf(DARK_WOOD, 0.7)); break;
    default: solid.box(sx, h, sz, place(x, h / 2, z), CONCRETE);
  }
}

// ------------------------------------------------------------- buildings --

function batches() {
  return { solid: new Batch(), walls: new Batch({ uv: 'wall', scale: 3.2 }), roofs: new Batch({ uv: 'plan', scale: 2.0 }), glow: new Batch() };
}

// Draws one enterable building into a lower set and an upper set of batches.
function addEnterable(lower, upper, inner, b, signs) {
  const church = b.kind === 'church';
  const cut = church ? 3.4 : 1.15;
  const h = b.h;
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  const w = b.x1 - b.x0, d = b.z1 - b.z0;
  const skirt = shadeOf(b.wall, 0.82);
  // floor
  lower.solid.box(w + 0.1, 0.04, d + 0.1, place(cx, 0.02, cz), church ? 0xb9ab95 : 0xa39c8f);
  if (b.veranda) { const v = b.veranda; lower.solid.box(v.x1 - v.x0, 0.035, v.z1 - v.z0, place((v.x0 + v.x1) / 2, 0.018, (v.z0 + v.z1) / 2), 0x9c958a); }
  for (const wall of b.walls) {
    const ww = wall.x1 - wall.x0, wd = wall.z1 - wall.z0;
    const x = (wall.x0 + wall.x1) / 2, z = (wall.z0 + wall.z1) / 2;
    lower.walls.box(ww, cut, wd, place(x, cut / 2, z), church ? b.wall : skirt);
    upper.walls.box(ww, h - cut, wd, place(x, cut + (h - cut) / 2, z), b.wall);
    if (!church) lower.solid.box(ww + 0.04, 0.05, wd + 0.04, place(x, cut + 0.02, z), shadeOf(skirt, 0.8));
  }
  for (const door of b.doors) {
    const top = door.arched ? 3.1 : 2.25;
    // the wall over the doorway: below the cut line it stays, above it goes with the roof
    const over = (hh) => (door.alongX ? [door.width, hh, 0.25] : [0.25, hh, door.width]);
    if (top < cut) { lower.walls.box(...over(cut - top), place(door.x, (top + cut) / 2, door.z), b.wall); upper.walls.box(...over(h - cut), place(door.x, (cut + h) / 2, door.z), b.wall); } else upper.walls.box(...over(h - top), place(door.x, (top + h) / 2, door.z), b.wall);
    // the door frame
    const frame = door.alongX ? [0.1, top, 0.3] : [0.3, top, 0.1];
    for (const side of [-1, 1]) (church ? lower : upper).solid.box(...frame, place(door.x + (door.alongX ? side * door.width / 2 : 0), top / 2, door.z + (door.alongX ? 0 : side * door.width / 2)), DARK_WOOD);
  }
  for (const item of b.items) addItem(inner, item, inner.walls);

  if (church) { addChurchParts(lower, upper, b); return; }

  // windows on the back wall, one or two to a room; they belong to the upper part
  const f = b.frame;
  const at = (u, v) => [f.ox + f.ax * u + f.nx * v, f.oz + f.az * u + f.nz * v];
  const alongX = f.ax !== 0;
  for (const r of b.rooms) {
    const span = r.u1 - r.u0;
    const places = span > 8 ? [0.28, 0.72] : [0.5];
    for (const t of places) {
      const [bx, bz] = at(r.u0 + span * t, f.depth - 0.125);
      pane(upper, bx, cut + 0.75, bz, alongX);
      const [fx, fz] = at(r.u0 + span * (t < 0.5 ? 0.14 : 0.86), 0.125);
      if (span > 5 && Math.abs(r.u0 + span * (t < 0.5 ? 0.14 : 0.86) - r.mid) > 1.6) pane(upper, fx, cut + 0.75, fz, alongX, 1.0, 0.9);
    }
  }
  // a small board over each door, saying what the room is: all of a
  // building's boards are one mesh, painted from one canvas
  const rows = b.rooms.length;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 48 * rows;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const paint = () => {
    const ctx = canvas.getContext('2d');
    b.rooms.forEach((r, i) => {
      ctx.fillStyle = '#f3ecdc'; ctx.fillRect(0, i * 48, 256, 48);
      ctx.strokeStyle = '#1d2a44'; ctx.lineWidth = 3; ctx.strokeRect(2, i * 48 + 2, 252, 44);
      ctx.fillStyle = '#1d2a44'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      let px = 26;
      do { ctx.font = `800 ${px}px "Arial Narrow", sans-serif`; px -= 1; } while (ctx.measureText(r.name.toUpperCase()).width > 238 && px > 10);
      ctx.fillText(r.name.toUpperCase(), 128, i * 48 + 25);
    });
    texture.needsUpdate = true;
  };
  paint();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(paint).catch(() => {});
  const positions = [], uvs = [];
  const tx = -f.nz, tz = f.nx;                       // along the wall, as seen from outside
  b.rooms.forEach((r, i) => {
    const [px, pz] = at(r.mid, -0.03);
    const quad = [[-0.85, 2.36], [0.85, 2.36], [0.85, 2.66], [-0.85, 2.66]].map(([o, y]) => [px + tx * o * (f.ax !== 0 ? -f.nz : f.nx) * (f.ax !== 0 ? -f.nz : f.nx) , y, pz + tz * o]);
    const corners = [[-0.85, 2.36, 0, 1 - (i + 1) / rows], [0.85, 2.36, 1, 1 - (i + 1) / rows], [0.85, 2.66, 1, 1 - i / rows], [-0.85, 2.66, 0, 1 - i / rows]].map(([o, y, u, v]) => [px + tx * o, y, pz + tz * o, u, v]);
    void quad;
    for (const k of [0, 1, 2, 0, 2, 3]) { positions.push(corners[k][0], corners[k][1], corners[k][2]); uvs.push(corners[k][3], corners[k][4]); }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeBoundingSphere();
  const plates = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, side: THREE.DoubleSide }));
  plates.userData.detail = true;
  signs.push(plates);
  addPitchedRoof({ solid: upper.solid, walls: upper.walls, roofs: upper.roofs }, cx, cz, w, d, h, b.roof, b.wall, 0.6, 0.46);
  // veranda: a lean-to roof on posts along the front
  const v = b.veranda;
  const vw = v.x1 - v.x0, vd = v.z1 - v.z0;
  const tilt = 0.16;
  upper.roofs.box(vw + (alongX ? 0.6 : 0.5), 0.06, vd + (alongX ? 0.5 : 0.6), place((v.x0 + v.x1) / 2 - f.nx * 0.2, h * 0.84, (v.z0 + v.z1) / 2 - f.nz * 0.2, 0, 1, 1, 1, alongX ? -f.nz * tilt : 0, alongX ? 0 : f.nx * tilt), b.roof, 0.92, alongX ? 'plan' : 'planZ');
  const posts = Math.max(2, Math.round(f.length / 5) + 1);
  for (let i = 0; i < posts; i += 1) {
    const [px, pz] = at(0.2 + (i * (f.length - 0.4)) / (posts - 1), -2.05);
    upper.solid.round(new THREE.CylinderGeometry(0.08, 0.1, h * 0.78, 8), place(px, h * 0.39, pz), 0xeeeae0);
    lower.solid.box(0.3, 0.14, 0.3, place(px, 0.07, pz), 0xd9d4c6);
  }
  if (b.sign) {
    const length = Math.min(f.length - 2, Math.max(5, b.sign.length * 0.36));
    const board = sign(b.sign, length, length / 9, ['#f3ecdc', '#14351f']);
    const [sx, sz] = at(f.length / 2, -2.5);
    board.position.set(sx, h * 0.84 + 0.75, sz);
    board.rotation.y = Math.atan2(-f.nx, -f.nz);
    signs.push(board);
  }
}

// What makes a church a church: a tall nave under a steep roof, a tower with
// a spire and a cross, an apse behind the altar, coloured glass, and a rose
// window over an arched west door.
function addChurchParts(lower, upper, b) {
  const f = b.frame;
  const at = (u, v) => [f.ox + f.ax * u + f.nx * v, f.oz + f.az * u + f.nz * v];
  const L = f.length, W = f.depth, h = b.h;
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  const sideAlongX = f.ax !== 0;                // the side walls run along the nave
  const catholic = b.style === 'catholic';
  const roof = addPitchedRoof({ solid: upper.solid, walls: upper.walls, roofs: upper.roofs }, cx, cz, b.x1 - b.x0, b.z1 - b.z0, h, b.roof, b.wall, 0.5, catholic ? 1.0 : 0.85);
  const apex = h + roof.rise;
  // lancet windows down both sides, in coloured glass, with buttresses between
  for (let u = 4.2; u < L - 3; u += 3.6) {
    for (const v of [0.125, W - 0.125]) {
      if (Math.abs(u - (L * 0.66 + 1.1)) < 1.5 && v > 1) continue;      // the side door
      const [x, z] = at(u, v);
      const size = sideAlongX ? [0.7, 0, 0.36] : [0.36, 0, 0.7];
      [0, 1, 2].forEach((k) => lower.glow.box(size[0], 0.52, size[2], place(x, 1.7 + k * 0.54, z), STAINED[(Math.round(u) + k + (v > 1 ? 2 : 0)) % STAINED.length]));
      lower.glow.round(new THREE.CylinderGeometry(0.35, 0.35, 0.36, 4), place(x, 3.22, z, 0, 1, 1, 1, sideAlongX ? Math.PI / 2 : 0, sideAlongX ? 0 : Math.PI / 2), STAINED[(Math.round(u) + 3) % STAINED.length]);
      lower.solid.box(sideAlongX ? 0.86 : 0.3, 0.08, sideAlongX ? 0.3 : 0.86, place(x, 1.4, z), 0xcfc9b6);
      const [bx, bz] = at(u + 1.8, v < 1 ? -0.35 : W + 0.35);
      lower.walls.box(sideAlongX ? 0.55 : 0.75, 3.4, sideAlongX ? 0.75 : 0.55, place(bx, 1.7, bz), shadeOf(b.wall, 0.93));
      upper.walls.box(sideAlongX ? 0.5 : 0.55, h - 4.4, sideAlongX ? 0.55 : 0.5, place(bx, 3.4 + (h - 4.4) / 2, bz), shadeOf(b.wall, 0.93));
    }
  }
  // the west front: a rose window, an arch over the door, a cross on the gable
  const facing = Math.atan2(-f.ax, -f.az);
  const [rx, rz] = at(-0.02, W / 2);
  upper.glow.round(new THREE.CylinderGeometry(1.25, 1.25, 0.34, 20), place(rx, h * 0.8, rz, facing, 1, 1, 1, Math.PI / 2, 0), 0xf2e6b8);
  for (let k = 0; k < 8; k += 1) { const a = (k * Math.PI) / 4; const off = Math.cos(a) * 0.72; upper.glow.round(new THREE.CylinderGeometry(0.3, 0.3, 0.4, 10), place(rx + f.nx * off, h * 0.8 + Math.sin(a) * 0.72, rz + f.nz * off, facing, 1, 1, 1, Math.PI / 2, 0), STAINED[k % STAINED.length]); }
  upper.solid.round(new THREE.TorusGeometry(1.34, 0.12, 6, 24), place(rx - f.ax * 0.1, h * 0.8, rz - f.az * 0.1, facing), 0xcfc9b6);
  lower.solid.round(new THREE.TorusGeometry(1.42, 0.14, 6, 16, Math.PI), place(rx - f.ax * 0.12, 3.06, rz - f.az * 0.12, facing), 0xcfc9b6);
  [-0.66, 0, 0.66].forEach((off, k) => lower.glow.box(f.nx ? 0.6 : 0.3, 0.9 - Math.abs(off) * 0.5, f.nz ? 0.6 : 0.3, place(rx + f.nx * off, 3.62 - Math.abs(off) * 0.25, rz + f.nz * off), STAINED[k]));
  const [gx, gz] = at(-0.05, W / 2);
  upper.solid.box(0.16, 1.9, 0.16, place(gx, apex + 0.9, gz), 0xf7f5ee);
  upper.solid.box(f.nx ? 1.0 : 0.16, 0.16, f.nz ? 1.0 : 0.16, place(gx, apex + 1.25, gz), 0xf7f5ee);
  // the crucifix behind the altar, and the stations along the walls
  const [kx, kz] = at(L - 0.3, W / 2);
  lower.solid.box(0.12, 1.5, 0.12, place(kx, 2.5, kz), DARK_WOOD);
  lower.solid.box(f.nx ? 0.9 : 0.12, 0.12, f.nz ? 0.9 : 0.12, place(kx, 2.9, kz), DARK_WOOD);
  if (catholic) { lower.solid.round(new THREE.SphereGeometry(0.09, 8, 6), place(kx - f.ax * 0.1, 3.0, kz - f.az * 0.1), 0xd9c2a0); lower.solid.box(f.nx ? 0.6 : 0.1, 0.07, f.nz ? 0.6 : 0.1, place(kx - f.ax * 0.1, 2.86, kz - f.az * 0.1), 0xd9c2a0); lower.solid.box(0.1, 0.6, 0.1, place(kx - f.ax * 0.1, 2.55, kz - f.az * 0.1), 0xd9c2a0); }
  if (catholic) for (let k = 0; k < 7; k += 1) for (const v of [0.3, W - 0.3]) { const [sx, sz] = at(3 + k * ((L * 0.7 - 3) / 6), v); lower.solid.box(sideAlongX ? 0.4 : 0.05, 0.5, sideAlongX ? 0.05 : 0.4, place(sx, 2.3, sz), 0x7a5a3a); }
  // the apse: half a drum behind the altar, under half a cone
  const [ax, az] = at(L, W / 2);
  const turn = Math.atan2(f.ax, f.az) - Math.PI / 2;
  upper.walls.round(new THREE.CylinderGeometry(W * 0.3, W * 0.3, h * 0.82, 12, 1, true, 0, Math.PI), place(ax, h * 0.41, az, turn), b.wall);
  upper.roofs.round(new THREE.ConeGeometry(W * 0.3 + 0.4, h * 0.3, 12, 1, true, 0, Math.PI), place(ax, h * 0.82 + h * 0.15, az, turn), b.roof, 1, 'plan');
  // the tower
  const t = b.tower;
  const tx = (t.x0 + t.x1) / 2, tz = (t.z0 + t.z1) / 2, tw = t.x1 - t.x0;
  upper.walls.box(tw, t.h, tw, place(tx, t.h / 2, tz), b.wall);
  for (const y of [h, h + 3.5]) upper.solid.box(tw + 0.24, 0.18, tw + 0.24, place(tx, y, tz), 0xcfc9b6);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    // the belfry: louvred openings on all four faces
    upper.solid.box(dx ? 0.1 : 1.5, 2.0, dz ? 0.1 : 1.5, place(tx + dx * (tw / 2 + 0.01), t.h - 1.9, tz + dz * (tw / 2 + 0.01)), 0x2a2b2f);
    for (let k = 0; k < 5; k += 1) upper.solid.box(dx ? 0.14 : 1.5, 0.05, dz ? 0.14 : 1.5, place(tx + dx * (tw / 2 + 0.03), t.h - 2.7 + k * 0.4, tz + dz * (tw / 2 + 0.03)), 0x8d877b);
    upper.glow.box(dx ? 0.3 : 0.5, 1.4, dz ? 0.3 : 0.5, place(tx + dx * (tw / 2 - 0.02), h * 0.55, tz + dz * (tw / 2 - 0.02)), STAINED[(Math.abs(dx) + 2 * Math.abs(dz) + (dx + dz > 0 ? 1 : 0)) % STAINED.length]);
  }
  upper.solid.round(new THREE.SphereGeometry(0.42, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), place(tx, t.h - 2.2, tz, 0, 1, 1.3, 1), 0xa8841a);      // the bell
  upper.roofs.add(new THREE.ConeGeometry(tw * 0.76, 4.2, 4, 1), place(tx, t.h + 2.1, tz, Math.PI / 4), b.roof, 1, false, 'plan');
  upper.solid.box(0.18, 2.2, 0.18, place(tx, t.h + 5.2, tz), 0xf7f5ee);
  upper.solid.box(f.nx ? 1.1 : 0.18, 0.18, f.nz ? 1.1 : 0.18, place(tx, t.h + 5.6, tz), 0xf7f5ee);
}

// ------------------------------------------------------------- the yards --

function addYard(B, c, signs) {
  const { solid, walls, glow, roofs } = B;
  // the compound wall, its gate posts, and the name over the gate
  for (const wall of c.fence.walls) {
    const ww = wall.x1 - wall.x0, wd = wall.z1 - wall.z0;
    walls.box(ww, 1.7, wd, place((wall.x0 + wall.x1) / 2, 0.85, (wall.z0 + wall.z1) / 2), 0xc9c0ac);
    solid.box(ww + 0.1, 0.08, wd + 0.1, place((wall.x0 + wall.x1) / 2, 1.74, (wall.z0 + wall.z1) / 2), 0x8d877b);
  }
  for (const gate of c.fence.gates) {
    const tall = c.yard.some((y) => y.kind === 'arch') ? 4.6 : 3.0;
    for (const side of [-1, 1]) {
      const px = gate.x + (gate.alongX ? side * (gate.width / 2 + 0.2) : 0), pz = gate.z + (gate.alongX ? 0 : side * (gate.width / 2 + 0.2));
      walls.box(0.7, tall, 0.7, place(px, tall / 2, pz), 0xe4dccb);
      solid.box(0.86, 0.14, 0.86, place(px, tall + 0.07, pz), 0x8d877b);
      // an iron gate leaf, standing open
      solid.box(gate.alongX ? 0.06 : gate.width * 0.45, 1.9, gate.alongX ? gate.width * 0.45 : 0.06, place(px + (gate.alongX ? 0 : (gate.side === 'w' ? 1 : -1) * gate.width * 0.24), 1.0, pz + (gate.alongX ? (gate.side === 'n' ? 1 : -1) * gate.width * 0.24 : 0)), 0x2f4f3a);
    }
    solid.box(gate.alongX ? gate.width + 1.1 : 0.5, 0.8, gate.alongX ? 0.5 : gate.width + 1.1, place(gate.x, tall - 0.3, gate.z), 0xe4dccb);
    const board = sign(c.sign, gate.width + 0.6, 0.62, c.kind === 'hospital' ? ['#f3ecdc', '#0f5f63'] : ['#f3ecdc', '#14351f']);
    const out = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] }[gate.side];
    board.position.set(gate.x + out[0] * 0.27, tall - 0.3, gate.z + out[1] * 0.27);
    board.rotation.y = Math.atan2(out[0], out[1]);
    signs.push(board);
    const inner = sign(c.sign, gate.width + 0.6, 0.62, ['#f3ecdc', '#14351f']);
    inner.position.set(gate.x - out[0] * 0.27, tall - 0.3, gate.z - out[1] * 0.27);
    inner.rotation.y = Math.atan2(-out[0], -out[1]);
    signs.push(inner);
  }
  for (const y of c.yard) {
    if (y.kind === 'parking') {
      solid.box(y.x1 - y.x0, 0.03, y.z1 - y.z0, place((y.x0 + y.x1) / 2, 0.015, (y.z0 + y.z1) / 2), 0x77756e);
      for (let i = 0; i <= y.bays; i += 1) solid.box(0.12, 0.02, (y.z1 - y.z0) * 0.6, place(y.x0 + ((y.x1 - y.x0) * i) / y.bays, 0.04, (y.z0 + y.z1) / 2), 0xe8e2d0);
    } else if (y.kind === 'vehicle') {
      if (y.vehicle === 'ambulance') {
        // the ambulance is not scenery: the simulation drives it, and the client draws it where it is (see makeVan)
      } else addVehicle(solid, glow, { kind: 'pickup', x: y.x, z: y.z, heading: y.heading, body: y.colour });
    } else if (y.kind === 'flag') {
      solid.round(new THREE.CylinderGeometry(0.045, 0.06, 7, 8), place(y.x, 3.5, y.z), 0xd9dde0);
      solid.box(0.5, 0.3, 0.5, place(y.x, 0.15, y.z), 0xcfc9b6);
      for (const [i, colour] of [[0, 0x1f8a4c], [1, 0xf4f4f0], [2, 0x1f8a4c]]) solid.box(0.5, 0.75, 0.03, place(y.x + 0.3 + i * 0.5, 6.5, y.z), colour);
    } else if (y.kind === 'generator') {
      solid.box(2.2, 1.1, 1.3, place(y.x, 0.7, y.z), 0xd9a441);
      solid.box(2.4, 0.16, 1.5, place(y.x, 0.08, y.z), 0x55585c);
      solid.round(new THREE.CylinderGeometry(0.06, 0.06, 1.0, 6), place(y.x + 0.8, 1.7, y.z), 0x3a3d42);
      for (const [dx, dz] of [[-1.3, -0.9], [1.3, -0.9], [-1.3, 0.9], [1.3, 0.9]]) solid.box(0.07, 2.3, 0.07, place(y.x + dx, 1.15, y.z + dz), 0x55585c);
      roofs.box(3.0, 0.05, 2.2, place(y.x, 2.34, y.z, 0, 1, 1, 1, 0.1, 0), 0x8f989e, 1, 'plan');
    } else if (y.kind === 'tank') {
      for (const [dx, dz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) solid.box(0.08, 3.4, 0.08, place(y.x + dx, 1.7, y.z + dz), 0x55585c);
      solid.box(1.5, 0.08, 1.5, place(y.x, 3.42, y.z), 0x55585c);
      solid.round(new THREE.CylinderGeometry(0.72, 0.74, 1.5, 14), place(y.x, 4.2, y.z), 0x1c1d20);
    } else if (y.kind === 'board') {
      for (const side of [-1, 1]) solid.box(0.1, 2.4, 0.1, place(y.x + side * 1.6, 1.2, y.z), 0x5d4630);
      const board = sign(null, 3.4, 1.2, ['#f3ecdc', '#14351f'], [{ text: y.text[0], size: 34 }, { text: y.text[1], size: 22 }]);
      board.position.set(y.x, 1.75, y.z);
      const gate = c.fence.gates[0];
      board.rotation.y = gate.side === 's' ? 0 : gate.side === 'n' ? Math.PI : gate.side === 'e' ? Math.PI / 2 : -Math.PI / 2;
      signs.push(board);
    } else if (y.kind === 'assembly') solid.box(y.x1 - y.x0, 0.03, y.z1 - y.z0, place((y.x0 + y.x1) / 2, 0.015, (y.z0 + y.z1) / 2), 0xb9a98c);
    else if (y.kind === 'lawn') { solid.box(y.x1 - y.x0, 0.03, y.z1 - y.z0, place((y.x0 + y.x1) / 2, 0.015, (y.z0 + y.z1) / 2), 0x5f9a48); for (const [x, z, sx, sz] of [[(y.x0 + y.x1) / 2, y.z0, y.x1 - y.x0, 0.5], [(y.x0 + y.x1) / 2, y.z1, y.x1 - y.x0, 0.5]]) solid.box(sx, 0.5, sz, place(x, 0.25, z), 0x3f7a33); }
    else if (y.kind === 'pitch') {
      const pw = y.x1 - y.x0, pd = y.z1 - y.z0, px = (y.x0 + y.x1) / 2, pz = (y.z0 + y.z1) / 2;
      solid.box(pw, 0.025, pd, place(px, 0.012, pz), 0x7fae52);
      solid.box(pw * 0.5, 0.027, pd * 0.5, place(px, 0.013, pz), 0xb9945e);              // worn in the middle
      for (const [x, z, sx, sz] of [[px, y.z0, pw, 0.12], [px, y.z1, pw, 0.12], [y.x0, pz, 0.12, pd], [y.x1, pz, 0.12, pd], y.goals === 'z' ? [px, pz, pw, 0.12] : [px, pz, 0.12, pd]]) solid.box(sx, 0.03, sz, place(x, 0.03, z), 0xf4f4f0);
      for (const end of [-1, 1]) {
        const gx = y.goals === 'x' ? px + end * (pw / 2 - 0.2) : px, gz = y.goals === 'z' ? pz + end * (pd / 2 - 0.2) : pz;
        for (const side of [-1, 1]) solid.round(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), place(gx + (y.goals === 'z' ? side * 2.6 : 0), 1.1, gz + (y.goals === 'x' ? side * 2.6 : 0)), 0xf4f4f0);
        solid.box(y.goals === 'z' ? 5.3 : 0.1, 0.1, y.goals === 'x' ? 5.3 : 0.1, place(gx, 2.2, gz), 0xf4f4f0);
      }
      if (y.track) for (const off of [1.6, 3.0]) for (const [x, z, sx, sz] of [[px, y.z0 - off, pw + off * 2, 0.1], [px, y.z1 + off, pw + off * 2, 0.1], [y.x0 - off, pz, 0.1, pd + off * 2], [y.x1 + off, pz, 0.1, pd + off * 2]]) solid.box(sx, 0.02, sz, place(x, 0.02, z), 0xe8e2d0);
    } else if (y.kind === 'swing') {
      for (const side of [-1, 1]) { solid.round(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), place(y.x + side * 1.5, 1.25, y.z - 0.4, 0, 1, 1, 1, 0.3, 0), 0x2f6fab); solid.round(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), place(y.x + side * 1.5, 1.25, y.z + 0.4, 0, 1, 1, 1, -0.3, 0), 0x2f6fab); }
      solid.box(3.2, 0.1, 0.1, place(y.x, 2.45, y.z), 0x2f6fab);
      for (const dx of [-0.7, 0.7]) { for (const k of [-0.18, 0.18]) solid.box(0.02, 1.8, 0.02, place(y.x + dx + k, 1.5, y.z), 0x55585c); solid.box(0.46, 0.04, 0.2, place(y.x + dx, 0.6, y.z), 0xc0392b); }
    } else if (y.kind === 'slide') {
      for (const [dx, dz] of [[-0.4, -1.6], [0.4, -1.6]]) solid.box(0.06, 2.0, 0.06, place(y.x + dx, 1.0, y.z + dz), 0xc0392b);
      for (let k = 0; k < 5; k += 1) solid.box(0.8, 0.04, 0.06, place(y.x, 0.35 + k * 0.38, y.z - 1.6), 0xc0392b);
      solid.box(0.9, 0.06, 0.8, place(y.x, 2.0, y.z - 1.25), 0xf2c200);
      solid.box(0.8, 0.05, 3.4, place(y.x, 1.0, y.z + 0.4, 0, 1, 1, 1, 0.62, 0), 0xd9dde0);
    } else if (y.kind === 'seesaw') {
      solid.box(0.3, 0.5, 0.3, place(y.x, 0.25, y.z), 0x55585c);
      solid.box(3.0, 0.07, 0.3, place(y.x, 0.55, y.z, 0, 1, 1, 1, 0, 0.16), 0x2e9f6b);
    } else if (y.kind === 'grotto') {
      for (let k = 0; k < 9; k += 1) solid.add(new THREE.IcosahedronGeometry(0.8 + noise(k, 3) * 0.5, 0), place(y.x + (noise(k, 5) - 0.5) * 2.6, 0.6 + noise(k, 7) * 1.4, y.z - 0.6 + (noise(k, 9) - 0.5) * 0.9, k), k % 2 ? 0x8d8a82 : 0x77756e);
      solid.box(1.0, 1.7, 0.5, place(y.x, 1.2, y.z + 0.15), 0x2a2b2f);
      solid.round(new THREE.CylinderGeometry(0.14, 0.24, 1.0, 10), place(y.x, 1.2, y.z + 0.35), 0xf4f4f0);
      solid.round(new THREE.CylinderGeometry(0.2, 0.26, 0.7, 10, 1, true), place(y.x, 1.2, y.z + 0.35), 0x5f8fd0);
      solid.round(new THREE.SphereGeometry(0.12, 10, 8), place(y.x, 1.83, y.z + 0.35), 0xd9c2a0);
      solid.box(1.4, 0.4, 0.5, place(y.x, 0.2, y.z + 0.5), 0xcfc9b6);
      for (const dx of [-0.4, 0, 0.4]) glow.round(new THREE.SphereGeometry(0.04, 6, 5), place(y.x + dx, 0.52, y.z + 0.6), 0xffd27a);
    } else if (y.kind === 'bell') {
      solid.box(0.1, 2.3, 0.1, place(y.x, 1.15, y.z), 0x5d4630);
      solid.box(0.7, 0.08, 0.08, place(y.x + 0.3, 2.25, y.z), 0x5d4630);
      solid.round(new THREE.CylinderGeometry(0.08, 0.2, 0.3, 10), place(y.x + 0.55, 1.98, y.z), 0xa8841a);
    } else if (y.kind === 'arch') {
      const board = sign(y.text, 8.6, 1.0, ['#14351f', '#f5c518']);
      const out = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] }[y.side];
      board.position.set(y.x + out[0] * 0.3, 4.9, y.z + out[1] * 0.3);
      board.rotation.y = Math.atan2(out[0], out[1]);
      signs.push(board);
      solid.box(out[0] ? 0.5 : 9.2, 1.3, out[0] ? 9.2 : 0.5, place(y.x, 4.9, y.z), 0xe4dccb);
    }
  }
}

// --------------------------------------------------------------- houses --

function addHouse(B, hs) {
  const { solid, walls } = B;
  const base = 0.25;
  const top = base + hs.h;
  solid.box(hs.w + 0.4, base, hs.d + 0.4, place(hs.x, base / 2, hs.z), 0x8d877b);
  walls.box(hs.w, hs.h, hs.d, place(hs.x, base + hs.h / 2, hs.z), hs.wall);
  walls.box(hs.w + 0.05, 0.8, hs.d + 0.05, place(hs.x, base + 0.4, hs.z), shadeOf(hs.wall, 0.8));
  addPitchedRoof(B, hs.x, hs.z, hs.w, hs.d, top, hs.roof, hs.wall, 0.6, 0.5);
  const [ox, oz] = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[hs.door];
  const alongX = oz !== 0;
  const fx = hs.x + ox * hs.w / 2, fz = hs.z + oz * hs.d / 2;
  solid.box(alongX ? 1.0 : 0.1, 2.0, alongX ? 0.1 : 1.0, place(fx + ox * 0.03, base + 1.0, fz + oz * 0.03), DARK_WOOD);
  solid.box(alongX ? 2.6 : 1.4, 0.12, alongX ? 1.4 : 2.6, place(fx + ox * 0.7, 0.06, fz + oz * 0.7), 0x9c958a);
  for (const side of [-1, 1]) {
    pane(B, fx + (alongX ? side * hs.w * 0.3 : 0) + ox * 0.01, base + hs.h * 0.6, fz + (alongX ? 0 : side * hs.d * 0.3) + oz * 0.01, alongX, 1.0, 0.9, 0.16);
    pane(B, hs.x - ox * hs.w / 2 + (alongX ? side * hs.w * 0.28 : 0), base + hs.h * 0.6, hs.z - oz * hs.d / 2 + (alongX ? 0 : side * hs.d * 0.28), alongX, 1.0, 0.9, 0.16);
  }
  // a bench by the door, where people sit out in the evening
  solid.box(alongX ? 1.5 : 0.35, 0.06, alongX ? 0.35 : 1.5, place(fx + (alongX ? 1.9 : ox * 0.5), 0.42, fz + (alongX ? oz * 0.5 : 1.9)), WOOD);
  if ((hs.x * 7 + hs.z) % 3 < 1) solid.round(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 10), place(fx + (alongX ? -2.4 : ox * 0.6), 0.45, fz + (alongX ? oz * 0.6 : -2.4)), 0x2e6fab);
}

const TRADE_PROPS = {
  tailor(B, x, z, tx, tz) { for (const k of [-1, 1]) { B.solid.box(0.9, 0.05, 0.5, place(x + tx * k * 0.9, 0.74, z + tz * k * 0.9), WOOD); B.solid.box(0.3, 0.26, 0.16, place(x + tx * k * 0.9, 0.9, z + tz * k * 0.9), 0x1b1b1e); for (const s of [-0.38, 0.38]) B.solid.box(0.04, 0.72, 0.04, place(x + tx * (k * 0.9 + s), 0.36, z + tz * (k * 0.9 + s)), 0x2a2b2f); } for (let i = 0; i < 4; i += 1) B.solid.box(0.42, 0.9, 0.04, place(x + tx * (i - 1.5) * 0.5 - tz * 1.5, 1.5, z + tz * (i - 1.5) * 0.5 + tx * 1.5), [0x7b2d5b, 0xf2c200, 0x1f5c4d, 0x2e86ab][i]); },
  barber(B, x, z, tx, tz) { for (const k of [-1, 1]) { B.solid.box(0.5, 0.5, 0.5, place(x + tx * k * 0.9, 0.3, z + tz * k * 0.9), 0x8a1f1f); B.solid.box(0.5, 0.6, 0.08, place(x + tx * k * 0.9 - tz * 0.24, 0.8, z + tz * k * 0.9 + tx * 0.24), 0x8a1f1f); B.glow.box(tx ? 0.6 : 0.03, 0.8, tz ? 0.6 : 0.03, place(x + tx * k * 0.9 - tz * 1.6, 1.4, z + tz * k * 0.9 + tx * 1.6), 0xbcd6e2); } },
  baker(B, x, z, tx, tz) { B.solid.box(1.4, 1.2, 0.9, place(x - tz * 1.1, 0.6, z + tx * 1.1), 0x8d5a3a); for (let i = 0; i < 8; i += 1) B.solid.round(new THREE.SphereGeometry(0.13, 7, 5), place(x + tx * (-0.9 + (i % 4) * 0.36), 0.95 + Math.floor(i / 4) * 0.12, z + tz * (-0.9 + (i % 4) * 0.36) + 0.4, 0, 1.6, 0.7, 1), 0xc98a4a); B.solid.box(tx ? 1.7 : 0.6, 0.05, tz ? 1.7 : 0.6, place(x, 0.85, z + 0.4), WOOD); },
  mechanic(B, x, z) { for (let k = 0; k < 4; k += 1) B.solid.round(new THREE.TorusGeometry(0.26, 0.1, 6, 12), place(x - 2.6, 0.12 + k * 0.2, z + 0.8, 0, 1, 1, 1, Math.PI / 2, 0), 0x18181a); B.solid.box(0.7, 0.5, 0.5, place(x + 1.6, 0.25, z + 0.6), 0x55585c); B.solid.round(new THREE.CylinderGeometry(0.3, 0.3, 0.8, 10), place(x + 2.7, 0.4, z + 1.0), 0x2e6fab); B.solid.box(1.5, 0.05, 0.6, place(x - 0.6, 0.8, z + 1.5), 0x6a5038); },
  carpenter(B, x, z) { for (let k = 0; k < 6; k += 1) B.solid.box(2.6, 0.05, 0.22, place(x - 1.9, 0.1 + k * 0.06, z + 1.3, 0.05 * k), 0xc9a26a); B.solid.box(1.6, 0.08, 0.7, place(x + 1.2, 0.8, z + 0.6), 0x9a7a52); for (const [dx, dz] of [[0.5, 0.3], [1.9, 0.3], [0.5, 0.9], [1.9, 0.9]]) B.solid.box(0.07, 0.8, 0.07, place(x + dx, 0.4, z + dz), 0x6a5038); B.solid.box(0.5, 0.9, 0.5, place(x + 2.9, 0.45, z + 1.2), 0xc9a26a); },
  welder(B, x, z) { for (let k = 0; k < 3; k += 1) { B.solid.box(1.6, 2.0, 0.05, place(x - 1.8 + k * 0.2, 1.0, z + 1.6 - k * 0.15, 0, 1, 1, 1, -0.1, 0), 0x2a2b2f); } B.solid.round(new THREE.CylinderGeometry(0.14, 0.14, 1.2, 8), place(x + 2.2, 0.6, z + 0.8), 0x2e6fab); B.solid.box(0.9, 0.06, 0.6, place(x + 0.9, 0.7, z + 0.9), STEEL); },
  foodvendor(B, x, z, tx, tz, fx, fz, depth) { for (const k of [-1, 0, 1]) { B.solid.round(new THREE.CylinderGeometry(0.26, 0.22, 0.36, 10), place(x + tx * k * 0.9 - fx * 0.5, 0.75, z + tz * k * 0.9 - fz * 0.5), 0x2a2b2f); B.solid.box(0.5, 0.56, 0.5, place(x + tx * k * 0.9 - fx * 0.5, 0.28, z + tz * k * 0.9 - fz * 0.5), 0x6e3b24); } for (const row of [0, 1]) B.solid.box(tx ? 3.8 : 0.3, 0.06, tz ? 3.8 : 0.3, place(x + fx * (depth / 2 + 1.1 + row * 1.3), 0.42, z + fz * (depth / 2 + 1.1 + row * 1.3)), WOOD); },
};

function addShed(B, s, signs) {
  const { solid, walls, roofs } = B;
  const alongX = s.face === 'n' || s.face === 's';
  const sx = alongX ? s.w : s.d, sz = alongX ? s.d : s.w;
  const [fx, fz] = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[s.face];
  // (on the city block's pavement, a kiosk painted in its own colour under a flat metal canopy)
  const city = s.x > CITY_AREA.x0 && s.x < CITY_AREA.x1 && s.z > CITY_AREA.z0 && s.z < CITY_AREA.z1;
  const paint = [0x2e5d4b, 0x7a2f2a, 0x2b4a6e, 0x8a6a2a, 0x5a3a5e][Math.abs(Math.round(s.z / 9)) % 5];
  for (const wall of zoneShedWalls(s)) walls.box(wall.x1 - wall.x0, 2.3, wall.z1 - wall.z0, place((wall.x0 + wall.x1) / 2, 1.15, (wall.z0 + wall.z1) / 2), city ? paint : s.trade === 'foodvendor' ? 0xd9c0a0 : 0xb9b3a6);
  if (city) solid.box(sx + 0.7, 0.12, sz + 0.7, place(s.x + fx * 0.25, 2.46, s.z + fz * 0.25), 0x34383d);
  else roofs.box(sx + 0.9, 0.05, sz + 0.9, place(s.x + fx * 0.3, 2.42, s.z + fz * 0.3, 0, 1, 1, 1, alongX ? fz * 0.12 : 0, alongX ? 0 : -fx * 0.12), [0x8f989e, 0x7a2f22, 0x355e3b, 0x4f6272][Math.abs(Math.round(s.x + s.z)) % 4], 1, alongX ? 'plan' : 'planZ');
  for (const side of [-1, 1]) solid.box(0.08, 2.4, 0.08, place(s.x + fx * (alongX ? sz : sx) / 2 + (alongX ? side * (sx / 2 - 0.05) : 0), 1.2, s.z + fz * (alongX ? sz : sx) / 2 + (alongX ? 0 : side * (sz / 2 - 0.05))), 0x6a5038);
  solid.box(sx, 0.03, sz, place(s.x, 0.015, s.z), 0x9c958a);
  const board = sign(s.sign, Math.min(s.w + 0.6, Math.max(3, s.sign.length * 0.26)), 0.5, ['#f5c518', '#171a2e']);
  board.position.set(s.x + fx * ((alongX ? sz : sx) / 2 + 0.5), 2.85, s.z + fz * ((alongX ? sz : sx) / 2 + 0.5));
  board.rotation.y = Math.atan2(fx, fz);
  signs.push(board);
  // (what was sold and worked with inside it: not since 22 October 2026, when its trader was taken out of the game)
  const prop = ZONE_CAST.sellers ? TRADE_PROPS[s.trade] : null;
  if (prop) prop(B, s.x, s.z, -fz, fx, fx, fz, alongX ? sz : sx);
}

// ----------------------------------------------------------------- town --

export function buildTown(scene, glowMaterial) {
  const kit = buildingKit();
  const sight = createSight();
  const signs = [];
  const interiors = [];
  // builds a set of batches into meshes; `limit` is how far they can be seen from
  const add = (set, parent = null, shadows = true, limit = Infinity) => {
    const push = (batch, material, cast) => {
      if (batch.empty) return;
      const built = batch.build(material);
      for (const mesh of Array.isArray(built) ? built : [built]) { mesh.castShadow = cast && shadows; mesh.receiveShadow = true; (parent || scene).add(mesh); sight.add(mesh, limit); }
    };
    push(set.solid, kit.solid, true);
    push(set.walls, kit.walls, true);
    push(set.roofs, kit.roofs, true);
    push(set.glow, glowMaterial, false);
  };
  const post = (s, limit = 200) => { scene.add(s); sight.add(s, limit, { x: s.position.x, z: s.position.z, radius: 5 }); };

  for (const c of ZONE_COMPOUNDS) {
    const yard = batches();
    addYard(yard, c, signs);
    for (const s of signs.splice(0)) post(s, 260);
    const lower = batches();
    for (const b of c.buildings) {
      const upper = batches();
      const inner = batches();
      const own = [];
      addEnterable(lower, upper, inner, b, own);
      const group = new THREE.Group();
      add(upper, group);
      for (const s of own) { group.add(s); if (s.userData.detail) sight.add(s, 80); else sight.add(s, 200, { x: s.position.x, z: s.position.z, radius: 5 }); }
      scene.add(group);
      // what is inside is only worth drawing from close by
      add(inner, null, false, 95);
      interiors.push({ id: b.id, group, church: b.kind === 'church', x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1 });
    }
    add(yard);
    add(lower, null, false);
  }

  // houses, a quarter at a time so that what is out of sight is not drawn
  const quarters = new Map();
  // (a house that has given way to one of the owner's buildings is drawn by render-town-buildings.js)
  for (const hs of ZONE_HOUSES) { if (hs.model || hs.tower) continue; if (!quarters.has(hs.quarter)) quarters.set(hs.quarter, batches()); addHouse(quarters.get(hs.quarter), hs); }
  for (const set of quarters.values()) add(set);

  const sheds = { solid: new Chunked(), walls: new Chunked({ uv: 'wall', scale: 3.2 }), roofs: new Chunked({ uv: 'plan', scale: 2.0 }), glow: new Chunked() };
  for (const s of ZONE_SHEDS) addShed(sheds, s, signs);
  // the okada ranks: a post with a board (not since 22 October 2026: the okadas are gone)
  for (const r of ZONE_CAST.okadas ? ZONE_RANKS : []) { sheds.solid.box(0.1, 2.4, 0.1, place(r.x - r.dx * 1.2, 1.2, r.z - r.dz * 1.2 - (r.dx ? 0.9 : 0)), 0x5d4630); const board = sign('OKADA', 1.3, 0.4, ['#f5c518', '#171a2e']); board.position.set(r.x - r.dx * 1.2, 2.3, r.z - r.dz * 1.2 - (r.dx ? 0.9 : 0)); board.rotation.y = r.heading; signs.push(board); }
  // anything with a dome
  for (const b of ZONE_BUILDINGS) if (b.dome) { sheds.solid.round(new THREE.SphereGeometry(2.1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), place(b.x, 0.35 + b.h + 1.2, b.z), b.dome); sheds.solid.round(new THREE.CylinderGeometry(0.28, 0.36, b.h + 5, 10), place(b.x - b.w / 2 - 1.1, (b.h + 5) / 2, b.z + b.d / 2 - 0.6), 0xf1efe4); sheds.solid.round(new THREE.ConeGeometry(0.45, 1.1, 10), place(b.x - b.w / 2 - 1.1, b.h + 5.5, b.z + b.d / 2 - 0.6), b.dome); }
  // what the petty traders sell, set out on a mat at their feet, and the
  // tray a hawker sets down by the road
  const WARES = [0xc0392b, 0xe67e22, 0x7fb069, 0xd9d2bd, 0x6b4a2f, 0xf2c200];
  // (not since 22 October 2026: the traders and the hawkers are gone)
  for (const spot of ZONE_CAST.sellers ? ZONE_SPOTS : []) {
    if (spot.slot !== 'petty' && spot.slot !== 'hawk') continue;
    const fx = Math.sin(spot.facing), fz = Math.cos(spot.facing);
    const x = spot.x + fx * 0.85, z = spot.z + fz * 0.85;
    const kind = spot.id % 4;
    if (spot.slot === 'petty') sheds.solid.box(1.1, 0.02, 0.9, place(x, 0.02, z, spot.facing), [0x7b2d5b, 0x2e6f73, 0x8a6f4d, 0x44526a][spot.id % 4]);
    else sheds.solid.box(0.7, 0.5, 0.5, place(x, 0.25, z, spot.facing), 0x6a5038);
    const y = spot.slot === 'petty' ? 0.03 : 0.5;
    if (kind === 0) for (let i = 0; i < 3; i += 1) { sheds.solid.round(new THREE.CylinderGeometry(0.2, 0.15, 0.14, 8), place(x + (i - 1) * 0.34, y + 0.07, z), [0x2e86ab, 0xc0392b, 0x3fa796][i]); sheds.solid.round(new THREE.SphereGeometry(0.17, 7, 5, 0, Math.PI * 2, 0, Math.PI / 2), place(x + (i - 1) * 0.34, y + 0.12, z), WARES[(spot.id + i) % 3]); }
    else if (kind === 1) for (let i = 0; i < 6; i += 1) sheds.solid.round(new THREE.SphereGeometry(0.09, 6, 4), place(x - 0.3 + (i % 3) * 0.3, y + 0.08 + Math.floor(i / 3) * 0.1, z, i, 1, 1, 2.6), WARES[4]);
    else if (kind === 2) for (let i = 0; i < 9; i += 1) sheds.solid.round(new THREE.SphereGeometry(0.07, 6, 4), place(x - 0.3 + (i % 3) * 0.3, y + 0.07, z - 0.22 + Math.floor(i / 3) * 0.22), WARES[(spot.id + i) % 3]);
    else sheds.solid.round(new THREE.SphereGeometry(0.3, 8, 6), place(x, y + 0.2, z, spot.id, 0.9, 0.7, 1.1), WARES[3]);
  }
  add(sheds);
  for (const s of signs) post(s, 150);

  // the farms: mounds of yam in rows, and cassava between them
  const f = ZONE_FARMLAND;
  const mound = new THREE.SphereGeometry(0.55, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2);
  const spots = [];
  for (let x = f.x0 + 3; x < f.x1 - 2; x += 2.4) for (let z = f.z0 + 3; z < f.z1 - 2; z += 2.4) { if (Math.abs(x + 201.5) < 2.4 || noise(x, z) < 0.12) continue; spots.push([x + (noise(x, z + 1) - 0.5) * 0.5, z + (noise(x + 1, z) - 0.5) * 0.5, noise(x * 3, z)]); }
  const mounds = new THREE.InstancedMesh(mound, new THREE.MeshLambertMaterial({ color: linear(0x8a4a2a) }), spots.length);
  const leaf = new THREE.ConeGeometry(0.42, 0.9, 5);
  leaf.translate(0, 0.7, 0);
  const plants = new THREE.InstancedMesh(leaf, new THREE.MeshLambertMaterial(), spots.length);
  const colour = new THREE.Color();
  spots.forEach(([x, z, n], i) => {
    mounds.setMatrixAt(i, place(x, 0, z, n * 6, 1, 0.6 + n * 0.4, 1));
    plants.setMatrixAt(i, place(x, 0.1, z, n * 9, 0.7 + n * 0.6, 0.6 + n * 0.9, 0.7 + n * 0.6));
    plants.setColorAt(i, colour.copy(linear(n > 0.6 ? 0x4c8a36 : 0x3f7a33)));
  });
  mounds.receiveShadow = true;
  scene.add(mounds, plants);

  mounds.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3((f.x0 + f.x1) / 2, 0, (f.z0 + f.z1) / 2), 90);
  plants.geometry.boundingSphere = mounds.geometry.boundingSphere;
  // (out of view, not drawn: three.js since r151 tests a set of copies against the view, which r128 never did; by the
  // farm's sphere, round all of it: left to three.js, it would be the farm's moved to each mound)
  mounds.boundingSphere = mounds.geometry.boundingSphere.clone(); plants.boundingSphere = mounds.boundingSphere.clone();
  sight.add(mounds, 320);
  sight.add(plants, 200);
  let quality = 0;

  let open = null;
  // Shows the inside of the building at this point, if there is one.
  function setInside(x, z) {
    let found = null;
    for (const it of interiors) if (x > it.x0 && x < it.x1 && z > it.z0 && z < it.z1) { found = it; break; }
    if (found === open) return open;
    if (open) open.group.visible = true;
    if (found) found.group.visible = false;
    open = found;
    return open;
  }
  return { setInside, interiors, see(x, z, reach) { sight.look(x, z, reach); if (quality >= 2) plants.visible = false; }, setQuality(level) { quality = level; mounds.count = level >= 1 ? Math.floor(spots.length / 2) : spots.length; } };
}
