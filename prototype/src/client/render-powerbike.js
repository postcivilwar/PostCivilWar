// PostCivilWar PowerBike: the owner's skyscraper beside HOLARIS, made the motorcycle showroom (atani-powerbike.js
// says where everything is; this draws it).
//
// Outside: the supplied model exactly as it is (its mesh, its picture, its material's own colour and finish), drawn
// at the town's scale, with the showroom's own signs over what the building said of another company: a band across
// the podium where its name was, a panel where its badge was high on the central tower, and the name standing on top
// of the central tower, as HOLARIS's stands on its roof. Before the porch, the pink column a buyer steps into. Until
// the model has arrived (it is 13 MB) a plain dark shape of the same size stands in its place.
//
// Inside (built the first time someone comes near): the hall under the podium. A polished floor, white walls, a glass
// front with the doors, light panels in the ceiling; the motorcycles on round white stands with a light round
// each foot and a plate giving the name, engine, top speed and price (seventeen, in four rows since 17 October 2026);
// the middle one turning; the salesman's desk, a lounge, plants, pictures of the bikes on the walls, the name on the
// back wall; and the mat by the doors that takes the player out.
//
// The motorcycles: each nearby one is the owner's model itself (bike-model.js), the nearest at the device's full
// detail; each further off is a picture of that model taken from the side it is seen from (tools/vehicles/
// bike_impostors.mjs: twenty-four sides), at its own size and where it stands, so that the hall is full of bikes
// without a phone having to hold seventeen of them at once.
//
// While the player is outside, the hall is not drawn; while inside, the building round it is not (nothing of it can
// be seen from the hall, and it stands where the hall's own walls are).

import { POWERBIKE } from '../sim/zone.js';
import { POWER_BIKES } from '../sim/power-bikes.js';
import { trText } from '../sim/ledger.js';
import { parseGLB, fetchKept, letGoOnceDrawn, pictureFromFile } from './glb.js';
import { modelFile } from './budget.js';
import { Batch, place, surface, linear, isLite } from './render-kit.js';
import { reflects } from './render-finish.js';
import { makeDealMarker } from './render-holaris.js';
import { loadBike, bikeLoaded } from './bike-model.js';
import { hallModels, castShadows } from './hall-models.js';
import { BIKE_IMPOSTOR } from './bike-impostors.js';
import { COVER } from './brand-data.js';

const P = POWERBIKE, M = POWERBIKE.model, H = POWERBIKE.hall;
// a copy of the page opened from the disk has none of the files the website serves beside it (the model, the
// motorcycles, their pictures): there the hall is drawn without them
const ON_DISK = (() => { try { return location.protocol === 'file:'; } catch (error) { return false; } })();
const GOLD = '#e9c46a', CREAM = '#f4ecd8';
// a point on the supplied model (its own units, its front toward +z) in the town
const onModel = (x, y, z) => ({ x: M.x + x * M.scale, y: y * M.scale, z: M.z + z * M.scale });

// ------------------------------------------------------------------------------------------------ the brand --

// The owner's canonical logo (the rising sun over level ground, and POST CIVIL WAR): the transparent picture the
// cover is built from (assets/brand/cover/logo.png, carried in the page as COVER.logo). Its top part is the sun alone.
let logoImage = null;
function logo() {
  if (!logoImage) logoImage = new Promise((resolve) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = COVER.logo.src; });
  return logoImage;
}
const SUN_SHARE = 0.315;            // of the logo's height: the sun, its rays and its three ground lines

const HEAVY = (px, italic = false) => `${italic ? 'italic ' : ''}900 ${px}px "Arial Black", "Helvetica Neue", Helvetica, Arial, sans-serif`;
// Writes `text` at (x, baseline y) no wider than `most`, in the brand's heavy letter; returns its width.
function heavyText(g, text, x, y, px, most, { italic = false, fill = CREAM, stroke = null, line = 0, spacing = 0 } = {}) {
  let size = px;
  const width = () => { g.font = HEAVY(size, italic); return [...text].reduce((w, ch) => w + g.measureText(ch).width + size * spacing, -size * spacing); };
  while (width() > most && size > 12) size -= 4;
  g.font = HEAVY(size, italic);
  let at = x;
  for (const ch of text) {
    if (stroke) { g.lineJoin = 'round'; g.lineWidth = line; g.strokeStyle = stroke; g.strokeText(ch, at, y); }
    g.fillStyle = fill; g.fillText(ch, at, y);
    at += g.measureText(ch).width + size * spacing;
  }
  return at - x - size * spacing;
}
// POWERBIKE in gold, leaning forward, with three lines streaming back from it
function powerWord(g, text, x, y, px, most, { stroke = '#16171a', line = 0 } = {}) {
  const w = heavyText(g, text, x, y, px, most, { italic: true, fill: GOLD, stroke: line ? stroke : null, line });
  g.fillStyle = GOLD;
  for (let k = 0; k < 3; k += 1) {
    const ly = y - px * (0.62 - k * 0.2), len = px * (1.1 - k * 0.25), th = px * 0.055;
    g.beginPath(); g.moveTo(x - px * 0.12, ly); g.lineTo(x - px * 0.12 - len, ly + th * 0.5); g.lineTo(x - px * 0.12, ly + th); g.closePath(); g.fill();
  }
  return w;
}

// (on a phone at half the size, set out the same: on its screen it looks the same, and takes a quarter of the graphics
// memory — the name on the tower was 10.7 MB there)
function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  const k = isLite() ? 0.5 : 1;
  canvas.width = Math.round(width * k); canvas.height = Math.round(height * k);
  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding; texture.anisotropy = 4;
  const g = canvas.getContext('2d');
  g.scale(k, k);
  logo().then((img) => { g.clearRect(0, 0, width, height); draw(g, img); texture.needsUpdate = true; });
  return texture;
}

// The name on top of the tower: the logo, and POWER BIKE beside it in two lines. Standing letters: nothing behind.
export const crownTexture = () => canvasTexture(2048, 1024, (g, img) => {
  g.textBaseline = 'alphabetic';
  if (img) { const h = 980, w = (img.width / img.height) * h; g.drawImage(img, 30, 22, w, h); }
  powerWord(g, 'POWER', 1010, 470, 380, 990, { line: 26 });
  powerWord(g, 'BIKE', 1010, 900, 380, 990, { line: 26 });
});
// The band across the podium, where the old name was: on dark glass, the sun, POSTCIVILWAR and POWERBIKE. The whole
// line is measured first and made smaller if it would not fit (the letters are the device's own heavy face, whose
// width differs from one device to another), then set out in the middle.
export const bandTexture = () => canvasTexture(4096, 384, (g, img) => {
  const bg = g.createLinearGradient(0, 0, 0, 384); bg.addColorStop(0, '#191c21'); bg.addColorStop(0.5, '#0d0f12'); bg.addColorStop(1, '#16191d');
  g.fillStyle = bg; g.fillRect(0, 0, 4096, 384);
  g.fillStyle = GOLD; g.fillRect(0, 14, 4096, 6); g.fillRect(0, 364, 4096, 6);
  g.textBaseline = 'alphabetic';
  // at size px: the sun, a gap, POSTCIVILWAR, the gold stroke in a gap, POWERBIKE
  const layout = (px) => {
    g.font = HEAVY(px); const a = g.measureText('POSTCIVILWAR').width;
    g.font = HEAVY(px, true); const b = g.measureText('POWERBIKE').width;
    const sunH = px * 1.26, sunW = img ? (img.width / (img.height * SUN_SHARE)) * sunH : 0;
    return { a, b, sunH, sunW, total: sunW + px * 0.39 + a + px * 0.65 + b };
  };
  let px = 230, L = layout(px);
  while (L.total > 4096 - 160 && px > 60) { px -= 6; L = layout(px); }
  const x0 = (4096 - L.total) / 2, base = 192 + px * 0.37;
  if (img) g.drawImage(img, 0, 0, img.width, img.height * SUN_SHARE, x0, 192 - L.sunH / 2 - 6, L.sunW, L.sunH);
  const ax = x0 + L.sunW + px * 0.39;
  heavyText(g, 'POSTCIVILWAR', ax, base, px, L.a + 10, { fill: CREAM });
  const sx = ax + L.a + px * 0.15;
  g.fillStyle = GOLD; g.beginPath(); g.moveTo(sx + px * 0.16, 192 - px * 0.57); g.lineTo(sx + px * 0.25, 192 - px * 0.57); g.lineTo(sx + px * 0.09, 192 + px * 0.57); g.lineTo(sx, 192 + px * 0.57); g.closePath(); g.fill();
  powerWord(g, 'POWERBIKE', ax + L.a + px * 0.65, base, px, L.b + 10);
});
// Where the old badge was, high on the central tower: the logo on a dark panel.
export const badgeTexture = () => canvasTexture(1024, 1200, (g, img) => {
  g.fillStyle = '#0f1114'; g.fillRect(0, 0, 1024, 1200);
  g.strokeStyle = GOLD; g.lineWidth = 18; g.strokeRect(9, 9, 1006, 1182);
  if (img) { const h = 1060, w = (img.width / img.height) * h; g.drawImage(img, (1024 - w) / 2, 70, w, h); }
});
// The wall behind the floor, inside: the logo, POWERBIKE, and what is sold here.
const wallTexture = () => canvasTexture(2048, 640, (g, img) => {
  const bg = g.createLinearGradient(0, 0, 2048, 0); bg.addColorStop(0, '#0c0d10'); bg.addColorStop(0.5, '#1b1f25'); bg.addColorStop(1, '#0c0d10');
  g.fillStyle = bg; g.fillRect(0, 0, 2048, 640);
  g.textBaseline = 'alphabetic';
  if (img) { const h = 560, w = (img.width / img.height) * h; g.drawImage(img, 120, 40, w, h); }
  powerWord(g, 'POWERBIKE', 820, 360, 250, 1150);
  g.fillStyle = '#c9cbd0'; g.font = '600 64px "Helvetica Neue", Helvetica, Arial, sans-serif';
  const words = 'MOTORCYCLES  ·  ASABA'; let x = 830;
  for (const ch of words) { g.fillText(ch, x, 500); x += g.measureText(ch).width + 14; }
});
// The mat by the doors: EXIT, and an arrow to the doors.
const matTexture = () => canvasTexture(512, 160, (g) => {
  g.fillStyle = '#121315'; g.fillRect(0, 0, 512, 160);
  g.strokeStyle = 'rgba(233,196,106,0.85)'; g.lineWidth = 6; g.strokeRect(10, 10, 492, 140);
  g.fillStyle = '#f2f2f0'; g.font = '800 74px "Helvetica Neue", Helvetica, Arial, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
  g.fillText('EXIT', 220, 84);
  g.beginPath(); g.moveTo(380, 50); g.lineTo(380, 118); g.lineTo(350, 118); g.lineTo(405, 140); g.lineTo(460, 118); g.lineTo(430, 118); g.lineTo(430, 50); g.closePath(); g.fill();
});
// Each motorcycle's plate: its name, its engine and top speed, its price.
function plateTexture(bike) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = '#0f1013'; g.fillRect(0, 0, 512, 256);
  g.fillStyle = GOLD; g.fillRect(0, 0, 512, 8);
  g.textBaseline = 'alphabetic'; g.fillStyle = '#ffffff';
  let px = 54; g.font = `800 ${px}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  while (g.measureText(bike.name.toUpperCase()).width > 470 && px > 24) { px -= 2; g.font = `800 ${px}px "Helvetica Neue", Helvetica, Arial, sans-serif`; }
  g.fillText(bike.name.toUpperCase(), 22, 86);
  g.fillStyle = '#b9bcc3'; g.font = '500 38px "Helvetica Neue", Helvetica, Arial, sans-serif';
  g.fillText(`${bike.cc.toLocaleString('en-GB')} cc  ·  ${bike.topKmh} km/h`, 22, 150);
  g.fillStyle = GOLD; g.font = '800 52px "Helvetica Neue", Helvetica, Arial, sans-serif';
  g.fillText(trText(bike.price * 2).replace(/\.0$/, ''), 22, 222);
  const texture = new THREE.CanvasTexture(canvas); texture.encoding = THREE.sRGBEncoding; texture.anisotropy = 4;
  return texture;
}
// The floor: large polished tiles, dark, with fine joints.
function floorTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const g = canvas.getContext('2d');
  for (let j = 0; j < 4; j += 1) for (let i = 0; i < 4; i += 1) {
    const k = 34 + ((i * 7 + j * 13) % 5) * 2;
    g.fillStyle = `rgb(${k},${k + 2},${k + 5})`; g.fillRect(i * 128, j * 128, 128, 128);
    const sheen = g.createLinearGradient(i * 128, j * 128, i * 128 + 128, j * 128 + 128); sheen.addColorStop(0, 'rgba(255,255,255,0.035)'); sheen.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sheen; g.fillRect(i * 128, j * 128, 128, 128);
  }
  g.strokeStyle = 'rgba(190,195,205,0.35)'; g.lineWidth = 2;
  for (let k = 0; k <= 4; k += 1) { g.beginPath(); g.moveTo(k * 128, 0); g.lineTo(k * 128, 512); g.stroke(); g.beginPath(); g.moveTo(0, k * 128); g.lineTo(512, k * 128); g.stroke(); }
  const texture = new THREE.CanvasTexture(canvas); texture.encoding = THREE.sRGBEncoding; texture.anisotropy = 8;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

// --------------------------------------------------------------------------------------------- the building --

// The supplied model, read as it is: one mesh, its texture coordinates, its one picture (the website serves the
// file beside the page). `maxTexture`: the largest picture this device's graphics take, and on a phone a copy at
// 2048 is what is handed to them (the file is unchanged).
async function loadTower({ maxTexture }) {
  // (on a phone, the website's copy with its picture the size a phone draws it: budget.js)
  const file = modelFile(M.file);
  const response = await fetchKept(file);
  if (!response.ok) throw new Error(`${file}: ${response.status}`);
  const parsed = parseGLB(await response.arrayBuffer());
  const { json, accessor, bytes } = parsed;
  const prim = json.meshes[0].primitives[0], at = prim.attributes;
  const geometry = new THREE.BufferGeometry();
  const put = (name, key) => { if (at[key] === undefined) return; const a = accessor(at[key]); geometry.setAttribute(name, new THREE.BufferAttribute(a.array, a.width, a.normalized)); };
  put('position', 'POSITION'); put('normal', 'NORMAL'); put('uv', 'TEXCOORD_0');
  if (prim.indices !== undefined) geometry.setIndex(new THREE.BufferAttribute(accessor(prim.indices).array, 1));
  if (!at.NORMAL) geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const mat = json.materials[prim.material || 0], pbr = mat.pbrMetallicRoughness || {};
  let map = null;
  if (pbr.baseColorTexture) {
    const image = json.images[json.textures[pbr.baseColorTexture.index].source];
    const blob = new Blob([bytes(image.bufferView)], { type: image.mimeType || 'image/jpeg' });
    const picture = await (typeof createImageBitmap === 'function'
      ? (maxTexture ? createImageBitmap(blob, { resizeWidth: maxTexture, resizeHeight: maxTexture, resizeQuality: 'high' }) : createImageBitmap(blob))
      : new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = URL.createObjectURL(blob); }));
    map = new THREE.Texture(picture);
    map.flipY = false; map.encoding = THREE.sRGBEncoding; map.anisotropy = 8; map.needsUpdate = true;
    letGoOnceDrawn(map, () => pictureFromFile(file, json.textures[pbr.baseColorTexture.index].source, maxTexture));
  }
  const colour = pbr.baseColorFactor ? new THREE.Color(...pbr.baseColorFactor.slice(0, 3)) : new THREE.Color(1, 1, 1);
  // (its glass and cladding give back a little of the sky: render-finish.js)
  const material = reflects(surface({ map, color: colour, roughness: pbr.roughnessFactor ?? 1, metalness: pbr.metallicFactor ?? 1, side: mat.doubleSided ? THREE.DoubleSide : THREE.FrontSide }), 0.8);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.name = 'powerbike-tower';
  return { mesh, triangles: geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3 };
}

// What stands there until the model has come: the podium and the five towers as plain dark shapes, their sizes read
// off the model (atani-powerbike.js; the towers are where the model has them).
function standIn() {
  const B = new Batch();
  // (glass the colour of the tower's own, not near black: from across the town it looked like a shadow)
  const glass = 0x5b6f86, stone = 0x8a8c90;
  const f = P.footprint;
  B.box(f.x1 - f.x0, M.podiumTop * M.scale, (M.podiumFace + 0.30) * M.scale, place((f.x0 + f.x1) / 2, (M.podiumTop * M.scale) / 2, M.z + ((M.podiumFace - 0.30) / 2) * M.scale), stone);
  const t = onModel(M.tower.x, 0, M.tower.z);
  B.round(new THREE.CylinderGeometry(M.tower.r * M.scale, M.tower.r * M.scale, M.scale, 24), place(t.x, M.scale / 2, t.z), glass);
  for (const [x, z, h] of [[-0.24, 0.12, 0.74], [0.24, 0.1, 0.74], [-0.25, -0.24, 0.66], [0.25, -0.22, 0.66]]) { const q = onModel(x, 0, z); B.box(0.2 * M.scale, h * M.scale, 0.18 * M.scale, place(q.x, (h * M.scale) / 2, q.z, 0.4 * Math.sign(x)), glass); }
  const mesh = B.build(surface({ vertexColors: true, roughness: 0.4, metalness: 0.3 }));
  mesh.castShadow = true;
  return mesh;
}

// ------------------------------------------------------------------------------------------------- the hall --

function buildHall() {
  const group = new THREE.Group();
  group.name = 'powerbike-hall';
  const solid = new Batch(), gloss = new Batch(), metal = new Batch(), glow = new Batch(), glassB = new Batch(), overhead = new Batch();
  const W = H.x1 - H.x0, D = H.z1 - H.z0, cx = (H.x0 + H.x1) / 2, cz = (H.z0 + H.z1) / 2, top = H.ceiling;
  const WHITE = 0xf1f1ee, STEEL = 0x2b2f35, BRASS = 0xc9a24a;

  // the floor: polished dark tiles, a lighter band round the walls
  const tiles = floorTexture(); tiles.repeat.set(W / 4.8, D / 4.8);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), surface({ map: tiles, color: 0xffffff, roughness: 0.22, metalness: 0.12 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0.012, cz); floor.receiveShadow = true; floor.name = 'powerbike-floor';
  group.add(floor);
  // the ceiling, white, and its light panels in rows (the ceiling casts no shadow: the hall's light is under it)
  overhead.box(W, 0.12, D, place(cx, top + 0.06, cz), WHITE);
  for (let i = 0; i < 6; i += 1) for (let j = 0; j < 4; j += 1) glow.box(2.6, 0.03, 1.1, place(H.x0 + (W * (i + 0.5)) / 6, top - 0.02, H.z0 + (D * (j + 0.5)) / 4), 0xfff8ec);
  // the walls: the back (the name on it), the west (pictures of the bikes), the east (the desk); white with a dark skirting
  const wall = (x, z, w, d) => { solid.box(w, top, d, place(x, top / 2, z), WHITE, 0.98); metal.box(w + 0.01, 0.14, d + 0.01, place(x, 0.07, z), STEEL); };
  wall(cx, H.z0 + 0.1, W, 0.2);
  wall(H.x0 + 0.1, cz, 0.2, D);
  wall(H.x1 - 0.1, cz, 0.2, D);
  // the front: glass from the floor to the ceiling between steel mullions, the doors in the middle of the porch
  const dz = H.z1 - 0.06, door = P.doors;
  for (let x = H.x0 + 0.2; x <= H.x1 - 0.2 + 1e-6; x += (W - 0.4) / 14) metal.box(0.09, top, 0.12, place(x, top / 2, dz), STEEL);
  metal.box(W, 0.16, 0.14, place(cx, top - 0.08, dz), STEEL); metal.box(W, 0.1, 0.14, place(cx, 0.05, dz), STEEL);
  metal.box(W, 0.07, 0.1, place(cx, door.height + 0.05, dz), STEEL);
  const left = door.x - door.width / 2, right = door.x + door.width / 2;
  glassB.box(left - H.x0 - 0.2, top - 0.2, 0.03, place((H.x0 + 0.2 + left) / 2, top / 2, dz), 0xffffff);
  glassB.box(H.x1 - 0.2 - right, top - 0.2, 0.03, place((right + H.x1 - 0.2) / 2, top / 2, dz), 0xffffff);
  glassB.box(door.width, top - door.height - 0.2, 0.03, place(door.x, (door.height + top) / 2, dz), 0xffffff);
  // the two doors: glass leaves in steel, long brass handles
  for (const s of [-1, 1]) {
    glassB.box(door.width / 2 - 0.06, door.height - 0.08, 0.04, place(door.x + s * (door.width / 4), door.height / 2, dz - 0.02), 0xffffff);
    metal.box(0.06, door.height, 0.08, place(door.x + s * (door.width / 2), door.height / 2, dz - 0.02), STEEL);
    metal.box(0.04, 1.3, 0.04, place(door.x + s * 0.16, 1.15, dz - 0.12), BRASS);
  }
  metal.box(0.05, door.height, 0.08, place(door.x, door.height / 2, dz - 0.02), STEEL);
  // EXIT over the doors, lit
  const exitSign = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.34), new THREE.MeshBasicMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 80; const g = c.getContext('2d'); g.fillStyle = '#0e5a35'; g.fillRect(0, 0, 256, 80); g.fillStyle = '#eafff2'; g.font = '800 46px "Helvetica Neue", Helvetica, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('EXIT', 128, 42); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t; })(), toneMapped: false }));
  exitSign.position.set(door.x, door.height + 0.45, dz - 0.09); exitSign.rotation.y = Math.PI;
  group.add(exitSign);
  // the mat inside the doors
  const e = P.exit;
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(e.x1 - e.x0, e.z1 - e.z0), surface({ map: matTexture(), roughness: 0.9, metalness: 0 }));
  mat.rotation.x = -Math.PI / 2; mat.rotation.z = Math.PI; mat.position.set((e.x0 + e.x1) / 2, 0.02, (e.z0 + e.z1) / 2); mat.name = 'powerbike-exit';
  group.add(mat);

  // the name on the back wall, behind the floor, lit from within
  const brand = new THREE.Mesh(new THREE.PlaneGeometry(10.4, 3.25), new THREE.MeshBasicMaterial({ map: wallTexture(), toneMapped: false }));
  brand.position.set(P.doors.x, 3.7, H.z0 + 0.22); brand.name = 'powerbike-wall';
  group.add(brand);
  metal.box(10.7, 3.55, 0.1, place(P.doors.x, 3.7, H.z0 + 0.15), STEEL);
  glow.box(10.4, 0.05, 0.05, place(P.doors.x, 2.04, H.z0 + 0.24), 0xffe4a8);

  // the pictures of the bikes, framed, on the west wall and either side of the name
  const posters = [];
  const frame = (bike, x, z, ry) => {
    metal.box(ry ? 0.06 : 1.86, 1.86, ry ? 1.86 : 0.06, place(x, 2.6, z), STEEL);
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    pic.position.set(x + (ry ? 0.04 : 0), 2.6, z + (ry ? 0 : 0.04)); pic.rotation.y = ry;
    group.add(pic); posters.push({ bike, pic });
  };
  // (seven along the west wall since the hall went deeper, 17 October 2026, the two newest among them)
  ['midnight-cruiser', 'red-superbike', 'gold-tourer', 'chopper', 'chrome-concept', 'olive-cruiser', 'civil-war-tourer'].forEach((bike, i) => frame(bike, H.x0 + 0.24, H.z0 + 3.4 + i * 3.6, Math.PI / 2));
  frame('black-gold-superbike', P.doors.x - 7.4, H.z0 + 0.24, 0); frame('yellow-adventure', P.doors.x + 7.4, H.z0 + 0.24, 0);

  // the salesman's desk, against the east wall, facing the floor: white, with a brass edge and the sun on its front
  const d = P.desk, dxm = (d.x0 + d.x1) / 2, dzm = (d.z0 + d.z1) / 2;
  gloss.box(d.x1 - d.x0, 1.04, d.z1 - d.z0, place(dxm, 0.52, dzm), WHITE);
  metal.box(d.x1 - d.x0 + 0.08, 0.04, d.z1 - d.z0 + 0.08, place(dxm, 1.06, dzm), BRASS);
  solid.box(0.06, 0.38, 0.62, place(dxm + 0.08, 1.3, dzm - 0.6, 0, 1, 1, 1, 0, -0.12), 0x15171a);
  solid.box(0.6, 0.06, 0.6, place(dxm + 0.95, 0.5, dzm), 0x24262a); solid.box(0.08, 0.5, 0.6, place(dxm + 1.22, 0.78, dzm), 0x24262a);
  const deskSun = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9 * (794 / 650)), new THREE.MeshBasicMaterial({ map: canvasTexture(650, 794, (g, img) => { if (img) g.drawImage(img, 0, 0, 650, 794); }), transparent: true, toneMapped: false }));
  deskSun.position.set(d.x0 - 0.012, 0.56, dzm); deskSun.rotation.y = -Math.PI / 2; deskSun.scale.setScalar(0.62);
  group.add(deskSun);
  // the lounge: a dark leather sofa, a glass table, two chairs, a rug
  const L = P.lounge, sofa = L.sofa;
  solid.box(sofa.x1 - sofa.x0, 0.42, sofa.z1 - sofa.z0, place((sofa.x0 + sofa.x1) / 2, 0.21, (sofa.z0 + sofa.z1) / 2), 0x2a1f1a);
  solid.box(0.22, 0.86, sofa.z1 - sofa.z0, place(sofa.x1 - 0.11, 0.43, (sofa.z0 + sofa.z1) / 2), 0x2a1f1a);
  for (const s of [sofa.z0 + 0.1, sofa.z1 - 0.1]) solid.box(sofa.x1 - sofa.x0, 0.62, 0.2, place((sofa.x0 + sofa.x1) / 2, 0.31, s), 0x2a1f1a);
  solid.box(3.2, 0.012, 5.2, place((sofa.x0 + L.table.x0) / 2 - 0.2, 0.016, (sofa.z0 + sofa.z1) / 2), 0x6b6258);
  const t = L.table;
  glassB.box(t.x1 - t.x0, 0.03, t.z1 - t.z0, place((t.x0 + t.x1) / 2, 0.44, (t.z0 + t.z1) / 2), 0xffffff);
  for (const [a, b] of [[t.x0 + 0.06, t.z0 + 0.06], [t.x1 - 0.06, t.z0 + 0.06], [t.x0 + 0.06, t.z1 - 0.06], [t.x1 - 0.06, t.z1 - 0.06]]) metal.box(0.04, 0.43, 0.04, place(a, 0.215, b), BRASS);
  for (const c of L.chairs) { solid.box(0.72, 0.42, 0.72, place(c.x, 0.21, c.z), 0x3a2d26); solid.box(0.72, 0.42, 0.14, place(c.x, 0.63, c.z + (c.z < (sofa.z0 + sofa.z1) / 2 ? -0.29 : 0.29)), 0x3a2d26); }
  // plants in tall pots
  for (const p of P.plants) {
    gloss.round(new THREE.CylinderGeometry(0.28, 0.22, 0.6, 16), place(p.x, 0.3, p.z), 0x1d1f22);
    for (let k = 0; k < 7; k += 1) solid.round(new THREE.SphereGeometry(0.26 + (k % 3) * 0.05, 8, 6), place(p.x + Math.sin(k * 2.4) * 0.16, 0.85 + k * 0.17, p.z + Math.cos(k * 2.4) * 0.16), k % 2 ? 0x2f6b34 : 0x3d8040);
  }

  // the stands: round, white, a light round the foot, the plate in front; the turntable turns (its own mesh)
  const stands = [];
  for (const s of P.displays) {
    const h0 = s.stand === 'turntable' ? 0.2 : s.stand === 'hero' ? 0.22 : 0.14;
    if (s.stand !== 'turntable') {
      if (s.stand === 'hero') gloss.round(new THREE.CylinderGeometry(s.r + 0.2, s.r + 0.24, 0.08, 48), place(s.x, 0.04, s.z), WHITE);
      gloss.round(new THREE.CylinderGeometry(s.r, s.r * 1.02, h0, 48), place(s.x, h0 / 2, s.z), WHITE);
      glow.round(new THREE.TorusGeometry(s.r * 1.03, 0.022, 6, 64), place(s.x, 0.03, s.z, 0, 1, 1, 1, Math.PI / 2), 0xffd27a);
    } else glow.round(new THREE.TorusGeometry(s.r + 0.08, 0.03, 6, 72), place(s.x, 0.03, s.z, 0, 1, 1, 1, Math.PI / 2), 0xffd27a);
    // the plate, on a short post at the front of the stand, leaning back to be read
    const bike = POWER_BIKES[s.bike];
    const a = s.h, px = s.x + Math.sin(a) * (s.r + 0.32), pz = s.z + Math.cos(a) * (s.r + 0.32);
    metal.box(0.05, 0.5, 0.05, place(px, 0.25, pz), STEEL);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.31), new THREE.MeshBasicMaterial({ map: plateTexture(bike), toneMapped: false }));
    plate.position.set(px, 0.56, pz); plate.rotation.set(-0.6, a, 0, 'YXZ');
    group.add(plate);
    stands.push({ display: s, top: h0 });
  }
  const turntable = P.displays.find((s) => s.stand === 'turntable');
  const spin = new THREE.Group(); spin.position.set(turntable.x, 0, turntable.z);
  const spinB = new Batch();
  spinB.round(new THREE.CylinderGeometry(turntable.r, turntable.r * 1.02, 0.2, 64), place(0, 0.1, 0), WHITE);
  spinB.round(new THREE.CylinderGeometry(turntable.r * 0.72, turntable.r * 0.72, 0.012, 64), place(0, 0.206, 0), 0xd8d9db);
  for (let k = 0; k < 8; k += 1) spinB.box(0.05, 0.012, turntable.r * 0.5, place(Math.sin((k * Math.PI) / 4) * turntable.r * 0.86, 0.207, Math.cos((k * Math.PI) / 4) * turntable.r * 0.86, (k * Math.PI) / 4), 0xc9a24a);
  const spinMesh = spinB.build(surface({ vertexColors: true, roughness: 0.15, metalness: 0.15 }));
  spinMesh.receiveShadow = true;
  spin.add(spinMesh);
  group.add(spin);

  const add = (batch, material, shadow) => { if (batch.empty) return null; const m = batch.build(material); m.receiveShadow = true; m.castShadow = !!shadow; group.add(m); return m; };
  add(solid, surface({ vertexColors: true, roughness: 0.75, metalness: 0.02 }), true);
  add(overhead, surface({ vertexColors: true, roughness: 0.9, metalness: 0 }), false);
  add(gloss, surface({ vertexColors: true, roughness: 0.16, metalness: 0.1 }), true);
  add(metal, surface({ vertexColors: true, roughness: 0.32, metalness: 0.75 }), false);
  add(glow, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), false);
  const glassMesh = add(glassB, new THREE.MeshStandardMaterial({ color: 0xbfd6e2, transparent: true, opacity: 0.16, roughness: 0.04, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false }), false);
  if (glassMesh) glassMesh.renderOrder = 3;
  return { group, stands, spin, posters };
}

// -------------------------------------------------------------------------------------------- the bikes --

// One motorcycle on show: a picture of it from the side it is seen from, or, near, the model itself.
// a soft shadow, darkest in the middle, for under a motorcycle shown by its picture (the model casts its own)
let shadowTexture = null;
function softShadow() {
  if (shadowTexture) return shadowTexture;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  r.addColorStop(0, 'rgba(0,0,0,0.55)'); r.addColorStop(0.55, 'rgba(0,0,0,0.3)'); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  shadowTexture = new THREE.CanvasTexture(c);
  return shadowTexture;
}
function makeDisplay(display, group, standTop, sheet) {
  const bike = POWER_BIKES[display.bike];
  const imp = BIKE_IMPOSTOR.bikes[display.bike];
  const geometry = new THREE.PlaneGeometry(imp.size, imp.size);
  const picture = new THREE.Mesh(geometry, sheet.material);
  picture.name = `powerbike-picture:${display.bike}`;
  group.add(picture);
  const holder = new THREE.Group();          // where the model stands, turned as it is shown
  holder.position.set(display.x, standTop, display.z);
  group.add(holder);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.78, bike.length * 1.05), new THREE.MeshBasicMaterial({ map: softShadow(), transparent: true, depthWrite: false, toneMapped: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.006; shadow.renderOrder = 1;
  holder.add(shadow);
  return { display, bike, imp, picture, holder, shadow, standTop, sheet, frame: -1, model: null, tier: null, heading: display.h };
}
// which of the twenty-four pictures, for an eye at (ex, ez)
function pickFrame(d, ex, ez) {
  const n = BIKE_IMPOSTOR.frames;
  const a = Math.atan2(ex - d.display.x, ez - d.display.z) - d.heading;
  return ((Math.round(a / ((Math.PI * 2) / n)) % n) + n) % n;
}
function showFrame(d, k) {
  if (d.frame === k) return;
  d.frame = k;
  const { cols, rows } = BIKE_IMPOSTOR;
  const c = k % cols, r = Math.floor(k / cols);
  const u0 = c / cols, u1 = (c + 1) / cols, v1 = 1 - r / rows, v0 = 1 - (r + 1) / rows;
  const uv = d.picture.geometry.attributes.uv;
  uv.setXY(0, u0, v1); uv.setXY(1, u1, v1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0);
  uv.needsUpdate = true;
}

// ------------------------------------------------------------------------------------------------ together --

// `maxTexture`: the size its tower's picture is drawn at (budget.js); `lite`: a phone; `renderer`: the town's (the
// bikes' pictures are handed to it one bike at a time as they come, hall-models.js).
export function buildPowerbike(scene, { lite = false, maxTexture = 0, renderer = null } = {}) {
  const exterior = new THREE.Group(); exterior.name = 'powerbike';
  scene.add(exterior);
  // the plain shape until the model is here
  const stand = standIn(); exterior.add(stand);
  // the forecourt before the porch, paved to the column
  const court = new Batch();
  court.box(16, 0.05, 6.4, place(P.doors.x, 0.025, P.footprint.z1 + 3.2), 0xb9b4aa, 1, 'plan');
  for (const s of [-1, 1]) court.round(new THREE.CylinderGeometry(0.11, 0.13, 0.9, 12), place(P.doors.x + s * 7.4, 0.45, P.footprint.z1 + 5.6), 0x30343a);
  const courtMesh = court.build(surface({ vertexColors: true, roughness: 0.8, metalness: 0.05 }));
  courtMesh.receiveShadow = true; exterior.add(courtMesh);

  // the signs: over the old name on the podium, over the old badge on the tower, and the name on top of the tower
  const signs = [];
  {
    const L = M.lettering;
    const a = onModel((L.x0 + L.x1) / 2, 0, M.podiumFace);
    const w = (L.x1 - L.x0) * M.scale + 2.4, h = 1.75;
    const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, h + 0.2, 0.16), new THREE.MeshStandardMaterial({ color: 0x0e1013, roughness: 0.25, metalness: 0.6 }));
    back.position.set(a.x, ((L.y0 + L.y1) / 2) * M.scale, a.z + 0.1); exterior.add(back);
    const band = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: bandTexture(), toneMapped: false }));
    band.position.set(a.x, back.position.y, a.z + 0.185); band.name = 'powerbike-band';
    exterior.add(band); signs.push(band);
  }
  {
    const B = M.badge;
    const a = onModel((B.x0 + B.x1) / 2, (B.y0 + B.y1) / 2, B.z);
    const badge = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.7), new THREE.MeshBasicMaterial({ map: badgeTexture(), toneMapped: false }));
    badge.position.set(a.x, a.y, a.z + 0.32); badge.name = 'powerbike-badge';
    exterior.add(badge); signs.push(badge);
  }
  {
    // standing letters on the top of the central tower, on thin posts, facing the town both ways
    const T = M.tower, a = onModel(T.x, T.top, T.z);
    const w = 13.5, h = w / 2;
    const tex = crownTexture();
    for (const [dir, ry] of [[1, 0], [-1, Math.PI]]) {
      const crown = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false }));
      crown.position.set(a.x, a.y + 0.9 + h / 2, a.z + dir * 0.25); crown.rotation.y = ry; crown.name = 'powerbike-crown';
      crown.renderOrder = 2;
      exterior.add(crown); signs.push(crown);
    }
    const posts = new Batch();
    for (const t of [-0.42, -0.14, 0.14, 0.42]) posts.box(0.12, 1.4 + h * 0.2, 0.12, place(a.x + t * w, a.y + (1.4 + h * 0.2) / 2, a.z), 0x24282e);
    posts.box(w * 0.9, 0.14, 0.14, place(a.x, a.y + 0.95, a.z), 0x24282e);
    exterior.add(posts.build(surface({ vertexColors: true, roughness: 0.4, metalness: 0.6 })));
  }

  // the pink column before the porch: the one way in
  const portal = makeDealMarker();
  portal.group.position.set(P.portal.x, 0, P.portal.z);
  portal.group.name = 'powerbike-portal';
  scene.add(portal.group);

  // the model itself, when it has come
  let tower = null, failed = null, requested = false, retryAt = 0;
  function load() {
    if (requested || tower) return;
    // (a copy of the page opened from the disk cannot fetch files beside it: the plain shape stands there instead)
    if (ON_DISK) { requested = true; failed = 'This copy of the page is opened from the disk, where the model cannot be fetched.'; return; }
    // (with no connection, and nothing kept, the plain shape stands there until there is one: asked again a little later)
    if (performance.now() < retryAt) return;
    requested = true;
    loadTower({ maxTexture: maxTexture || (lite ? 1024 : 2048) })
      .then(({ mesh, triangles }) => {
        mesh.position.set(M.x, 0, M.z); mesh.rotation.y = M.heading; mesh.scale.setScalar(M.scale);
        exterior.add(mesh); exterior.remove(stand); stand.geometry.dispose(); stand.material.dispose();
        tower = { mesh, triangles }; failed = null;
      })
      .catch((error) => { failed = String(error && error.message || error); requested = false; retryAt = performance.now() + (error && error.offline ? 5000 : 30000); });
  }

  // ---- inside ----
  let hall = null, displays = [], sheets = new Map(), inside = false;
  // a bike's pictures from all round (its impostor): fetched the first time it is to be drawn (while its model is on
  // its way, or on a phone across the hall), let go when it has not been drawn for a while (`idle`)
  const sheetOf = (id) => {
    if (sheets.has(id)) return sheets.get(id);
    const texture = new THREE.Texture(); texture.encoding = THREE.sRGBEncoding; texture.anisotropy = 4;
    const material = new THREE.MeshBasicMaterial({ map: texture, alphaTest: 0.5, toneMapped: false, side: THREE.DoubleSide });
    material.visible = false;
    let asked = false, generation = 0, wantedAt = 0;
    const sheet = {
      texture, material,
      want(now) {
        wantedAt = now;
        if (asked || ON_DISK) return;
        asked = true;
        const mine = ++generation;
        const img = new Image();
        img.onload = () => {
          if (!asked || generation !== mine) return;
          // (a phone keeps each sheet at half its size: a quarter of the memory, for bikes seen across the hall)
          let picture = img;
          if (lite) { const c = document.createElement('canvas'); c.width = img.width / 2; c.height = img.height / 2; const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, c.width, c.height); picture = c; }
          texture.image = picture; texture.needsUpdate = true; material.visible = true;
        };
        img.src = `assets/bike-${id}-impostor.webp`;
      },
      idle(now, after = 20) {
        if (!asked || now - wantedAt < after) return;
        asked = false; generation += 1; material.visible = false; texture.dispose(); texture.image = undefined;
      },
    };
    sheets.set(id, sheet);
    return sheet;
  };
  let models = null;
  function ensureHall() {
    if (hall) return hall;
    hall = buildHall();
    hall.group.visible = inside;
    scene.add(hall.group);
    displays = hall.stands.map((s) => makeDisplay(s.display, hall.group, s.top, sheetOf(s.display.bike)));
    // each bike its model, with the pictures its distance from the player asks for (hall-models.js): the one the player
    // stands at (within 2.5 m of its stand), the next nearest (7 m), those across the hall (14 m), the far end
    models = hallModels({
      items: displays.map((d) => ({ id: d.display.bike })), lite, renderer,
      ranges: { inspect: 2.5, near: 7, mid: 14 },
      load: (k, tier) => (ON_DISK ? Promise.reject(new Error('opened from the disk')) : loadBike(displays[k].display.bike, { base: 'bikes/', tier, length: displays[k].bike.length })),
      put: (k, model) => { const d = displays[k]; model.pose({}); d.holder.add(model.group); },
    });
    // the pictures on the walls: the market's own photographs of each bike
    if (!ON_DISK) for (const p of hall.posters) { const img = new Image(); img.onload = () => { const t = new THREE.Texture(img); t.encoding = THREE.sRGBEncoding; t.needsUpdate = true; p.pic.material.map = t; p.pic.material.needsUpdate = true; }; img.src = `assets/bike-${p.bike}-poster.webp`; }
    return hall;
  }

  // Each bike as its model (hall-models.js says with which pictures), or its picture while its model is not here (and,
  // on a phone, across the hall). `level`: how much the device is struggling (0 not at all): the largest pictures are
  // given up first. The bikes within SHADOW_NEAR metres of the player cast the sun's shadow (hall-models.js says why).
  const SHADOW_NEAR = 7, SHADOW_KEEP = 8.5;
  function updateDisplays(dt, { eye, player, now, level = 0, sun = true }) {
    const gaps = displays.map((d) => Math.max(0, Math.hypot(d.display.x - player.x, d.display.z - player.z) - d.display.r));
    const clock = performance.now() / 1000;          // (seconds, for how long things have waited: not the town's clock)
    models.update({ gaps, now: clock, mode: 'inside', level });
    displays.forEach((d, k) => {
      // the turntable turns, slowly
      d.heading = d.display.stand === 'turntable' ? d.display.h + now * 0.22 : d.display.h;
      d.model = models.modelOf(k); d.tier = models.tierOf(k);
      d.holder.rotation.y = d.heading;
      const shown = !!d.model;
      // (the sun's shadow is cast only by the bikes near the player, kept a little further than it is begun so that it
      // does not come and go at the edge; the others have the soft shadow under them that their pictures have)
      d.casts = sun && shown && gaps[k] < (d.casts ? SHADOW_KEEP : SHADOW_NEAR);
      castShadows(d.model, d.casts);
      const casts = d.casts;
      d.picture.visible = !shown;
      d.shadow.visible = !casts;
      if (!shown) {
        d.sheet.want(clock);
        // the picture: where the model's middle would be, turned to the eye about the upright
        const c = d.imp.centre, ch = Math.cos(d.heading), sh = Math.sin(d.heading);
        const wx = d.display.x + c[0] * ch + c[2] * sh, wz = d.display.z - c[0] * sh + c[2] * ch;
        d.picture.position.set(wx, d.standTop + c[1], wz);
        d.picture.rotation.y = Math.atan2(eye.x - wx, eye.z - wz);
        showFrame(d, pickFrame(d, eye.x, eye.z));
      }
    });
    // (a bike's picture, not drawn for a while, is let go: its model is here)
    for (const [id, sheet] of sheets) if (!displays.some((d) => d.display.bike === id && d.picture.visible)) sheet.idle(clock);
    if (hall) hall.spin.rotation.y = displays.find((d) => d.display.stand === 'turntable').heading;
  }
  // Outside: as the player comes up to the doors the bikes nearest them are made ready; once the player has gone well
  // away (`RELEASE` metres from the doors), all of them are let go.
  const READY = 45, RELEASE = 110;
  function prepare(player) {
    if (!models) return;
    const clock = performance.now() / 1000;
    const away = Math.hypot(player.x - P.doors.x, player.z - P.doors.z);
    if (away > RELEASE) { models.update({ gaps: [], now: clock, mode: 'far' }); for (const d of displays) { d.model = null; d.tier = null; } for (const sheet of sheets.values()) sheet.idle(clock, 0); return; }
    if (away < READY) models.update({ gaps: displays.map((d) => Math.hypot(d.display.x - P.doors.x, d.display.z - P.doors.z)), now: clock, mode: 'near', ahead: lite ? 14 : Infinity });
  }

  return {
    exterior, portal,
    get tower() { return tower; },
    get failed() { return failed; },
    get hall() { return hall; },
    get inside() { return inside; },
    signs,
    load,
    // `on`: the player is in the hall. Outside, the hall is not drawn; inside, the building is not.
    setInside(on) {
      if (on === inside) return;
      inside = on;
      if (on) ensureHall();
      if (hall) hall.group.visible = on;
      exterior.visible = !on;
      portal.group.visible = !on;
    },
    // the first time someone comes near, the hall is made (so that stepping in does not wait for it)
    near(x, z) { if (!hall && Math.hypot(x - P.portal.x, z - P.portal.z) < 45) ensureHall(); },
    tick(dt, { eye, player, now, level = 0, sun = true }) {
      if (!inside && Math.hypot(player.x - P.portal.x, player.z - P.portal.z) < 110) portal.tick(dt);
      if (inside && hall) updateDisplays(dt, { eye, player, now, level, sun });
      else prepare(player);
    },
    // for the checks: what is drawn as a model (with which pictures) and what as a picture
    shown() { return displays.map((d) => ({ bike: d.display.bike, model: !!d.model, tier: d.tier, picture: d.picture.visible, frame: d.frame, loaded: !!d.tier && bikeLoaded(d.display.bike, d.tier), casts: !!d.casts, soft: d.shadow.visible })); },
    models: () => (models ? models.state() : null),
  };
}
