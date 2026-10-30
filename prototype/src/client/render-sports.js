// The Post Civil War Sports Mall (asaba-sports.js says where everything is; this draws it).
//
// The compound: interlocking paving blocks over all of it, the walk to the doors in a darker block and the visitors'
// bays marked out in white either side of it; low white railings all round, open to the road through a gateway between
// two white pillars under an arch with the mall's name on it; palms in planters along the front and lamps along the walk.
//
// The mall (the owner sent no model for it: it is the game's own, made of plain shapes): two storeys in white render
// on a dark plinth, the ground floor's front all glass between steel mullions with the doors in its middle under a
// canopy, a band of dark windows above, and the name across the front and standing on the roof: POST CIVIL WAR SPORTS
// MALL. Either side of the doors a tall banner with one of the game's own pictograms (icons.js): riding, surfing.
//
// The hall (built the first time someone comes near): a floor of pale polished boards, white walls with a green band,
// lines of light in the ceiling; the owner's eight models on round white stands, each raised to where it is best seen,
// a light round each and a plate on a post giving its name, what moves it and how fast it goes, and its price; the
// speedboat on its platform in the middle facing the doors, the surfboard standing on its tail in a rack; the sales
// desk against the east wall, plants, the name on the back wall; the mat by the doors that takes the player out. Each
// thing is the owner's model itself (sports-model.js), with the picture its distance from the player asks for
// (hall-models.js): on a computer the nearest with its 2048 picture, those across the hall with the 1024; on a phone
// the one the player stands at with its 1024, the rest with the 512 (a phone's screen shows no more of them there).
//
// While the player is outside, the hall is not drawn; while inside, the mall round it is not.

import { SPORTS_MALL } from '../sim/zone.js';
import { SPORTS } from '../sim/sports.js';
import { trText } from '../sim/ledger.js';
import { Batch, place, surface, isLite } from './render-kit.js';
import { letPaintedGo } from './painted.js';
import { loadSport, sportLoaded } from './sports-model.js';
import { hallModels, castShadows } from './hall-models.js';
import { COVER } from './brand-data.js';
import { vehicleEnvironment } from './vehicle-models.js';
import { addTree } from './render-world.js';
import { Foliage, foliageMaterials } from './render-foliage.js';
import { pavingTextures, BLOCK } from './render-carshow.js';
import { ICONS } from './icons.js';

const P = SPORTS_MALL, C = SPORTS_MALL.compound, B = SPORTS_MALL.building, H = SPORTS_MALL.hall, GW = SPORTS_MALL.gateway;
const ON_DISK = (() => { try { return location.protocol === 'file:'; } catch (error) { return false; } })();
const GOLD = '#e9c46a', CREAM = '#f6f0e2', GREEN = '#0d6b3d';
const WHITE = 0xf2f0ea, RENDER = 0xebe7de, PLINTH = 0x3a3d42, DARK = 0x24282e, STEEL = 0x9aa1a8, GREENX = 0x0d6b3d;
const HEAVY = (px) => `900 ${px}px "Arial Black", "Helvetica Neue", Helvetica, Arial, sans-serif`;

// The owner's canonical logo (the rising sun over level ground, and POST CIVIL WAR; COVER.logo).
let logoImage = null;
const logo = () => { if (!logoImage) logoImage = new Promise((resolve) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = COVER.logo.src; }); return logoImage; };
const SUN_SHARE = 0.315;            // of the logo's height: the sun, its rays and its three ground lines

// A picture painted on a canvas (on a phone at a part of its size, set out the same: on its screen it looks the same;
// and there its pixels let go once the graphics card has them, painted again when wanted: painted.js).
function canvasTexture(width, height, draw, { lite = 0.5 } = {}) {
  const canvas = document.createElement('canvas');
  const k = isLite() ? lite : 1;
  canvas.width = Math.round(width * k); canvas.height = Math.round(height * k);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
  const g = canvas.getContext('2d');
  g.scale(k, k);
  logo().then((img) => {
    g.clearRect(0, 0, width, height); draw(g, img); texture.needsUpdate = true;
    letPaintedGo(texture, (c) => { const p = c.getContext('2d'); p.setTransform(k, 0, 0, k, 0, 0); draw(p, img); });
  });
  return texture;
}
// Writes `text` centred at (x, baseline y), no wider than `most`, in the brand's heavy letter.
function heavy(g, text, x, y, px, most, fill, spacing = 0.04) {
  let size = px;
  const width = () => { g.font = HEAVY(size); return [...text].reduce((w, ch) => w + g.measureText(ch).width + size * spacing, -size * spacing); };
  while (width() > most && size > 12) size -= 3;
  const w = width();
  let at = x - w / 2;
  g.font = HEAVY(size); g.fillStyle = fill;
  for (const ch of text) { g.fillText(ch, at, y); at += g.measureText(ch).width + size * spacing; }
  return w;
}
// One of the game's own pictograms (icons.js), drawn on a canvas: `size` pixels square, its top left at (x, y).
function drawIcon(g, id, x, y, size, colour) {
  const parts = ICONS[id];
  if (!parts) return;
  g.save(); g.translate(x, y); g.scale(size / 24, size / 24);
  g.fillStyle = colour; g.strokeStyle = colour; g.lineCap = 'round'; g.lineJoin = 'round';
  for (const part of parts) {
    if (typeof part === 'string') g.fill(new Path2D(part), 'evenodd');
    else if (Array.isArray(part)) { g.beginPath(); g.arc(part[0], part[1], part[2], 0, Math.PI * 2); g.fill(); }
    else if (part.ring) { g.lineWidth = part.w || 2.8; g.beginPath(); g.arc(part.ring[0], part.ring[1], part.ring[2], 0, Math.PI * 2); g.stroke(); }
    else { g.lineWidth = part.w || 2.8; g.stroke(new Path2D(part.s)); }
  }
  g.restore();
}

// ------------------------------------------------------------------------------------------- the pictures --

// POST CIVIL WAR over SPORTS MALL, with the rising sun before them: across the front, and standing on the roof.
const nameTexture = () => canvasTexture(4096, 1024, (g, img) => {
  g.textBaseline = 'alphabetic';
  if (img) g.drawImage(img, 0, 0, img.width, img.height * SUN_SHARE, 40, 70, (img.width / (img.height * SUN_SHARE)) * 520, 520);
  const left = img ? 80 + (img.width / (img.height * SUN_SHARE)) * 520 : 60;
  const room = 4096 - left - 60, mid = left + room / 2;
  heavy(g, 'POST CIVIL WAR', mid, 560, 470, room, CREAM, 0.05);
  heavy(g, 'SPORTS MALL', mid, 960, 330, room * 0.82, GOLD, 0.16);
}, { lite: 0.25 });
// The arch over the gateway: the name in one line, on green.
const archTexture = () => canvasTexture(2048, 256, (g, img) => {
  g.fillStyle = GREEN; g.fillRect(0, 0, 2048, 256);
  g.fillStyle = GOLD; g.fillRect(0, 12, 2048, 8); g.fillRect(0, 236, 2048, 8);
  g.textBaseline = 'alphabetic';
  if (img) { const h = 200, w = (img.width / (img.height * SUN_SHARE)) * h * SUN_SHARE * 3.1; g.drawImage(img, 0, 0, img.width, img.height * SUN_SHARE, 40, 28, w, 200); }
  heavy(g, 'POST CIVIL WAR  ·  SPORTS MALL', 1120, 172, 120, 1700, CREAM, 0.05);
}, { lite: 0.5 });
// A tall banner beside the doors: one of the game's pictograms on green, and what it stands for.
const bannerTexture = (id, words) => canvasTexture(512, 1536, (g) => {
  const bg = g.createLinearGradient(0, 0, 0, 1536); bg.addColorStop(0, '#0f7a46'); bg.addColorStop(1, '#0a5230');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 1536);
  g.fillStyle = GOLD; g.fillRect(0, 0, 512, 14); g.fillRect(0, 1522, 512, 14);
  drawIcon(g, id, 56, 260, 400, '#ffffff');
  g.textBaseline = 'alphabetic';
  heavy(g, words, 256, 1120, 92, 440, CREAM, 0.06);
  heavy(g, 'SPORTS MALL', 256, 1260, 60, 420, GOLD, 0.12);
});
// The wall behind the floor, inside: the logo, the name, and the town.
const wallTexture = () => canvasTexture(3072, 768, (g, img) => {
  const bg = g.createLinearGradient(0, 0, 3072, 0); bg.addColorStop(0, '#0b3d24'); bg.addColorStop(0.5, '#10603a'); bg.addColorStop(1, '#0b3d24');
  g.fillStyle = bg; g.fillRect(0, 0, 3072, 768);
  g.fillStyle = GOLD; g.fillRect(0, 22, 3072, 8); g.fillRect(0, 738, 3072, 8);
  g.textBaseline = 'alphabetic';
  if (img) { const h = 640, w = (img.width / img.height) * h; g.drawImage(img, 90, 64, w, h); }
  heavy(g, 'POST CIVIL WAR', 1850, 400, 300, 2100, CREAM, 0.04);
  heavy(g, 'SPORTS MALL  ·  ASABA', 1850, 600, 120, 1900, GOLD, 0.2);
});
// The mat by the doors: EXIT, and an arrow to the doors.
const matTexture = () => canvasTexture(512, 160, (g) => {
  g.fillStyle = '#121315'; g.fillRect(0, 0, 512, 160);
  g.strokeStyle = 'rgba(233,196,106,0.85)'; g.lineWidth = 6; g.strokeRect(10, 10, 492, 140);
  g.fillStyle = '#f2f2f0'; g.font = '800 74px "Helvetica Neue", Helvetica, Arial, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
  g.fillText('EXIT', 220, 84);
  g.beginPath(); g.moveTo(380, 50); g.lineTo(380, 118); g.lineTo(350, 118); g.lineTo(405, 140); g.lineTo(460, 118); g.lineTo(430, 118); g.lineTo(430, 50); g.closePath(); g.fill();
}, { lite: 1 });
// What moves a thing, in a few words for its plate
const MOVES = { pedals: 'Pedalled', push: 'Pushed', battery: 'Electric', motor: 'Outboard motor', waves: 'Ridden on the waves' };
// Each thing's plate: its name, what moves it and its top speed, its price.
function plateTexture(item) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = '#0f1013'; g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#12a35a'; g.fillRect(0, 0, 512, 8);
  g.textBaseline = 'alphabetic'; g.fillStyle = '#ffffff';
  let px = 50; g.font = `800 ${px}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  while (g.measureText(item.name.toUpperCase()).width > 470 && px > 22) { px -= 2; g.font = `800 ${px}px "Helvetica Neue", Helvetica, Arial, sans-serif`; }
  g.fillText(item.name.toUpperCase(), 22, 86);
  g.fillStyle = '#b9bcc3'; g.font = '500 34px "Helvetica Neue", Helvetica, Arial, sans-serif';
  g.fillText(`${MOVES[item.drive] || ''} · up to ${item.kmh} km/h`, 22, 150);
  g.fillStyle = GOLD; g.font = '800 52px "Helvetica Neue", Helvetica, Arial, sans-serif';
  g.fillText(trText(item.price * 2).replace(/\.0$/, ''), 22, 222);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  // (the plates never change: on a phone their pixels let go once the graphics card has them)
  letPaintedGo(texture, (c) => { const t = plateTexture(item); const src = t.image; c.getContext('2d').drawImage(src, 0, 0); t.dispose(); });
  return texture;
}
// The hall's floor: boards of a warm honey-coloured wood a quarter of a metre wide, polished, laid the way a sports
// hall's floor is: a picture of two metres square, eight rows of boards of different lengths, their joints staggered.
function floorTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const g = canvas.getContext('2d');
  let s = 7;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const rows = 8, h = 512 / rows;
  for (let r = 0; r < rows; r += 1) {
    let x = -Math.round(rnd() * 200);
    while (x < 512) {
      const len = 230 + rnd() * 180, k = 176 + Math.round(rnd() * 26);
      const fill = `rgb(${k},${Math.round(k * 0.74)},${Math.round(k * 0.47)})`;
      // (a board running off the right edge comes back in on the left: the picture repeats)
      for (const ox of [0, -512]) {
        g.fillStyle = fill; g.fillRect(x + ox, r * h, len, h);
        for (let n = 0; n < 7; n += 1) { const y = r * h + 3 + ((n * 37 + r * 11) % (h - 6)); g.strokeStyle = `rgba(110,66,28,${0.07 + ((n * 13) % 7) * 0.012})`; g.lineWidth = 1; g.beginPath(); g.moveTo(x + ox, y); g.bezierCurveTo(x + ox + len * 0.3, y + 2, x + ox + len * 0.6, y - 2, x + ox + len, y + 1); g.stroke(); }
        g.fillStyle = 'rgba(60,38,18,0.6)'; g.fillRect(x + ox, r * h, 2, h);
      }
      x += len;
    }
    g.fillStyle = 'rgba(60,38,18,0.55)'; g.fillRect(0, r * h, 512, 2);
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}
// A poster on the hall's walls: the thing's photograph (tools/sports/turntables.mjs) on the mall's green, its name and
// its price under it. (Fetched with the page's other files; a copy opened from the disk has none.)
function posterTexture(item) {
  const W = 512, Hh = 640;
  return canvasTexture(W, Hh, (g) => {
    const bg = g.createLinearGradient(0, 0, 0, Hh); bg.addColorStop(0, '#f4f2ec'); bg.addColorStop(1, '#dfe9e2');
    g.fillStyle = bg; g.fillRect(0, 0, W, Hh);
    g.fillStyle = '#0d6b3d'; g.fillRect(0, Hh - 150, W, 150);
    g.fillStyle = GOLD; g.fillRect(0, Hh - 150, W, 6);
    g.textBaseline = 'alphabetic';
    heavy(g, item.name.toUpperCase(), W / 2, Hh - 88, 42, W - 40, '#ffffff', 0.03);
    heavy(g, trText(item.price * 2).replace(/\.0$/, ''), W / 2, Hh - 30, 44, W - 80, GOLD, 0.06);
    const pic = posterImages.get(item.id);
    if (pic) g.drawImage(pic, 26, 10, W - 52, W - 52);
  });
}
const posterImages = new Map();
function loadPoster(id) {
  return new Promise((resolve) => { const img = new Image(); img.onload = () => { posterImages.set(id, img); resolve(img); }; img.onerror = () => resolve(null); img.src = `assets/sport-${id}-poster.webp`; });
}

// ------------------------------------------------------------------------------------------ the forecourt --

function buildForecourt(group, { lite }) {
  const size = lite ? 512 : 1024;
  const grey = pavingTextures(size, { tone: [166, 160, 150], seed: 11 });
  const charcoal = pavingTextures(size, { tone: [88, 86, 84], spread: 10, seed: 13 });
  const plane = (x0, z0, x1, z1, tex, y, name) => {
    const w = x1 - x0, d = z1 - z0;
    const geo = new THREE.PlaneGeometry(w, d); geo.rotateX(-Math.PI / 2);
    const uv = geo.attributes.uv, pos = geo.attributes.position;
    for (let i = 0; i < uv.count; i += 1) uv.setXY(i, (pos.getX(i) + (x0 + x1) / 2) / BLOCK.metres, (pos.getZ(i) + (z0 + z1) / 2) / BLOCK.metres);
    const m = new THREE.Mesh(geo, surface({ map: tex.map, normalMap: tex.normalMap, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.82, metalness: 0 }));
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.receiveShadow = true; m.name = name;
    group.add(m);
    return m;
  };
  // (all round the mall, not under it)
  plane(C.x0, B.z1, C.x1, C.z1, grey, 0.03, 'sports-paving');
  plane(C.x0, C.z0, C.x1, B.z0, grey, 0.03, 'sports-paving');
  plane(C.x0, B.z0, B.x0, B.z1, grey, 0.03, 'sports-paving');
  plane(B.x1, B.z0, C.x1, B.z1, grey, 0.03, 'sports-paving');
  const W = P.walk;
  plane(W.x0, W.z0, W.x1, W.z1, charcoal, 0.034, 'sports-walk');
  plane(P.drive.fromRoad.x0, P.drive.fromRoad.z0, P.drive.fromRoad.x1, P.drive.fromRoad.z1, charcoal, 0.032, 'sports-apron');
  // the bays either side of the walk, marked in white, in two rows facing each other; a kerb along the walk
  const paint = new Batch(), kerb = new Batch();
  for (const bay of P.bays) {
    const n = Math.floor((bay.x1 - bay.x0) / bay.width);
    for (const [z, sgn] of [[bay.z0 + bay.depth / 2, 1], [bay.z1 - bay.depth / 2, -1]]) {
      for (let k = 0; k <= n; k += 1) paint.box(0.12, 0.012, bay.depth, place(bay.x0 + k * bay.width, 0.046, z), 0xf4f4ef);
      paint.box(n * bay.width, 0.012, 0.12, place(bay.x0 + (n * bay.width) / 2, 0.046, z - sgn * bay.depth / 2), 0xf4f4ef);
    }
  }
  for (const side of [-1, 1]) kerb.box(0.2, 0.14, W.z1 - W.z0 - 1, place(P.doors.x + side * ((W.x1 - W.x0) / 2 + 0.1), 0.07, (W.z0 + W.z1) / 2), 0xd8d3c7);
  const pm = paint.build(surface({ vertexColors: true, roughness: 0.6, metalness: 0 })); pm.receiveShadow = true; group.add(pm);
  const km = kerb.build(surface({ vertexColors: true, roughness: 0.85, metalness: 0 })); km.receiveShadow = true; km.castShadow = true; group.add(km);
  // palms in round planters along the front, and lamps along the walk
  const palms = new Batch(), fronds = new Foliage(), lamps = new Batch(), heads = [];
  for (const [k, q] of P.forecourt.palms.entries()) {
    palms.round(new THREE.CylinderGeometry(q.r * 0.88, q.r, 0.6, 24), place(q.x, 0.3, q.z), 0xd6d0c4);
    addTree(palms, fronds, { x: q.x, z: q.z, kind: 'palm', size: (q.h + 0.3) / 7.2, turn: k * 2.3 });
  }
  for (const q of P.forecourt.lamps) {
    lamps.round(new THREE.CylinderGeometry(0.06, 0.09, 5, 10), place(q.x, 2.5, q.z), 0x34383d);
    lamps.box(0.56, 0.08, 0.24, place(q.x - q.side * 0.28, 5.0, q.z), 0x34383d);
    heads.push({ x: q.x - q.side * 0.28, z: q.z });
  }
  const palmMesh = palms.build(surface({ vertexColors: true, roughness: 0.8, metalness: 0 })); palmMesh.castShadow = true; group.add(palmMesh);
  for (const mesh of fronds.build(foliageMaterials())) group.add(mesh);
  const lampMesh = lamps.build(surface({ vertexColors: true, roughness: 0.5, metalness: 0.5 })); lampMesh.castShadow = true; group.add(lampMesh);
  const lampGlow = new Batch();
  for (const h of heads) lampGlow.box(0.46, 0.03, 0.18, place(h.x, 4.95, h.z), 0xfff1c9);
  group.add(lampGlow.build(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })));
  return { lampHeads: heads, textures: [grey, charcoal] };
}

// The railings: posts and two rails, white, on a low kerb, all round but the gateway; the gateway's two pillars and the
// arch over it with the name.
function buildRailings(group) {
  const R = P.railing, gx0 = GW.x - GW.width / 2 - 0.5, gx1 = GW.x + GW.width / 2 + 0.5;
  const runs = [[C.x0, C.z0, C.x1, C.z0], [C.x0, C.z0, C.x0, C.z1], [C.x1, C.z0, C.x1, C.z1], [C.x0, C.z1, gx0, C.z1], [gx1, C.z1, C.x1, C.z1]];
  const solid = new Batch();
  let posts = 0;
  for (const [ax, az, bx, bz] of runs) {
    const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len, ry = Math.atan2(ux, uz);
    const n = Math.max(1, Math.round(len / R.post));
    for (let i = 0; i <= n; i += 1) { const x = ax + (ux * len * i) / n, z = az + (uz * len * i) / n; solid.box(0.07, R.height, 0.07, place(x, R.height / 2, z), 0xf3f2ee); posts += 1; }
    for (const y of [0.45, R.height - 0.04]) solid.box(0.05, 0.06, len, place((ax + bx) / 2, y, (az + bz) / 2, ry), 0xf3f2ee);
    solid.box(0.3, 0.14, len + 0.3, place((ax + bx) / 2, 0.07, (az + bz) / 2, ry), 0xc9c3b6, 1);
  }
  // the pillars and the arch
  const top = GW.height;
  for (const s of [-1, 1]) {
    const x = GW.x + s * (GW.width / 2 + 0.5);
    solid.box(0.9, top, 0.9, place(x, top / 2, GW.z), 0xece8df);
    solid.box(1.0, 0.14, 1.0, place(x, top + 0.07, GW.z), 0xb9b2a4);
  }
  solid.box(GW.width + 2, 1.1, 0.5, place(GW.x, top - 0.55, GW.z), DARK);
  const mesh = solid.build(surface({ vertexColors: true, roughness: 0.55, metalness: 0.1 }));
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'sports-railings';
  group.add(mesh);
  const tex = archTexture();
  for (const [dz, ry] of [[0.26, 0], [-0.26, Math.PI]]) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(GW.width + 1.8, 0.95), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    sign.position.set(GW.x, top - 0.55, GW.z + dz); sign.rotation.y = ry; sign.name = 'sports-arch';
    group.add(sign);
  }
  return { posts, runs: runs.length };
}

// ------------------------------------------------------------------------------------------- the building --

// The mall seen from outside: white render on a dark plinth, the ground floor's front of glass between mullions with
// the doors in the middle, a canopy over them, a band of dark windows on the upper storey, the parapet; the name across
// the front and on the roof; the banners beside the doors.
function buildExterior(group) {
  const solid = new Batch(), metal = new Batch(), glassB = new Batch(), glow = new Batch();
  const W = B.x1 - B.x0, D = B.z1 - B.z0, cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2, top = B.height, st = B.storey;
  // the walls: back and sides whole; the front above the ground floor's glass
  solid.box(W, top, 0.4, place(cx, top / 2, B.z0 + 0.2), RENDER);
  solid.box(0.4, top, D, place(B.x0 + 0.2, top / 2, cz), RENDER);
  solid.box(0.4, top, D, place(B.x1 - 0.2, top / 2, cz), RENDER);
  solid.box(W, top - st, 0.4, place(cx, (top + st) / 2, B.z1 - 0.2), RENDER);
  solid.box(W + 0.3, B.parapet, 0.5, place(cx, top + B.parapet / 2, B.z1 - 0.25), RENDER);
  solid.box(W + 0.3, B.parapet, 0.5, place(cx, top + B.parapet / 2, B.z0 + 0.25), RENDER);
  for (const x of [B.x0 + 0.25, B.x1 - 0.25]) solid.box(0.5, B.parapet, D, place(x, top + B.parapet / 2, cz), RENDER);
  // the roof, a little below the parapet's top
  solid.box(W - 0.4, 0.2, D - 0.4, place(cx, top - 0.1, cz), 0x8b8f94);
  // the plinth all round
  for (const [x, z, w, d] of [[cx, B.z0 + 0.2, W + 0.1, 0.5], [B.x0 + 0.2, cz, 0.5, D + 0.1], [B.x1 - 0.2, cz, 0.5, D + 0.1]]) solid.box(w, 0.5, d, place(x, 0.25, z), PLINTH);
  // the ground floor's front: glass between steel mullions, the doors in the middle (their own leaves, below)
  const fz = B.z1 - 0.05, door = P.doors;
  for (let x = B.x0 + 0.4; x <= B.x1 - 0.4 + 1e-6; x += (W - 0.8) / 20) metal.box(0.14, st, 0.18, place(x, st / 2, fz), DARK);
  metal.box(W, 0.3, 0.24, place(cx, st - 0.15, fz), DARK); metal.box(W, 0.12, 0.2, place(cx, 0.06, fz), DARK);
  const left = door.x - door.width / 2 - 0.8, right = door.x + door.width / 2 + 0.8;
  glassB.box(left - B.x0 - 0.4, st - 0.4, 0.04, place((B.x0 + 0.4 + left) / 2, st / 2 - 0.05, fz), 0xffffff);
  glassB.box(B.x1 - 0.4 - right, st - 0.4, 0.04, place((right + B.x1 - 0.4) / 2, st / 2 - 0.05, fz), 0xffffff);
  glassB.box(right - left, st - door.height - 0.6, 0.04, place(door.x, (st + door.height + 0.3) / 2, fz), 0xffffff);
  // the upper storey's band of windows, framed
  glassB.box(W - 3, 1.9, 0.04, place(cx, st + 2.2, B.z1 + 0.01), 0xffffff);
  metal.box(W - 2.8, 0.12, 0.12, place(cx, st + 1.2, B.z1 + 0.03), 0xd9d6cf); metal.box(W - 2.8, 0.12, 0.12, place(cx, st + 3.2, B.z1 + 0.03), 0xd9d6cf);
  for (let k = 0; k <= 12; k += 1) metal.box(0.08, 2.0, 0.08, place(B.x0 + 1.5 + ((W - 3) * k) / 12, st + 2.2, B.z1 + 0.03), 0xd9d6cf);
  // the side walls' windows on the upper storey
  for (const x of [B.x0 - 0.01, B.x1 + 0.01]) for (let k = 0; k < 6; k += 1) glassB.box(0.04, 1.8, 2.6, place(x, st + 2.2, B.z0 + 3 + k * 4.2), 0xffffff);
  // the canopy over the doors, its two posts and its lights
  metal.box(7.4, 0.24, 3.4, place(door.x, door.height + 1.0, B.z1 + 1.55), 0xe8e8e6);
  for (const s of [-1, 1]) metal.round(new THREE.CylinderGeometry(0.08, 0.08, door.height + 1.0, 12), place(door.x + s * 3.4, (door.height + 1.0) / 2, B.z1 + 3.0), 0xb9bec4);
  for (const k of [-2.6, -0.9, 0.9, 2.6]) glow.round(new THREE.CylinderGeometry(0.11, 0.11, 0.02, 16), place(door.x + k, door.height + 0.875, B.z1 + 1.6), 0xfff4dd);
  const add = (batch, material, shadow) => { const m = batch.build(material); m.receiveShadow = true; m.castShadow = !!shadow; group.add(m); return m; };
  add(solid, surface({ vertexColors: true, roughness: 0.9, metalness: 0 }), true).name = 'sports-mall';
  add(metal, surface({ vertexColors: true, roughness: 0.4, metalness: 0.6 }), false);
  add(glow, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), false);
  // (the glass: dark, giving back the sky; from outside nothing of the hall behind it is drawn)
  const glass = new THREE.MeshStandardMaterial({ color: 0x1e2a33, roughness: 0.08, metalness: 0.6, envMap: vehicleEnvironment() || null, envMapIntensity: 0.9 });
  add(glassB, glass, false).name = 'sports-glass';
  // the name across the front, between the canopy and the windows, and standing on the roof
  const tex = nameTexture();
  const front = new THREE.Mesh(new THREE.PlaneGeometry(18, 4.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false }));
  front.position.set(door.x, st + 2.2, B.z1 + 0.12); front.name = 'sports-name'; front.renderOrder = 2;
  group.add(front);
  const crown = new THREE.Mesh(new THREE.PlaneGeometry(26, 6.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false }));
  crown.position.set(cx, top + B.parapet + 0.6 + 3.25, B.z1 - 2.5); crown.name = 'sports-crown'; crown.renderOrder = 2;
  group.add(crown);
  const frame = new Batch();
  for (const k of [-0.4, 0, 0.4]) frame.box(0.16, 1.6, 0.16, place(cx + k * 26, top + B.parapet + 0.8, B.z1 - 2.6), DARK);
  frame.box(26 * 0.9, 0.16, 0.16, place(cx, top + B.parapet + 0.7, B.z1 - 2.6), DARK);
  group.add(frame.build(surface({ vertexColors: true, roughness: 0.4, metalness: 0.6 })));
  // the banners either side of the doors: riding, surfing (the game's own pictograms)
  const banners = [['ride', 'RIDE'], ['surf', 'SURF']].map(([id, words], k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 4.8), new THREE.MeshBasicMaterial({ map: bannerTexture(id, words), toneMapped: false }));
    m.position.set(door.x + (k ? 1 : -1) * 6.2, st / 2, B.z1 + 0.08); m.name = `sports-banner:${id}`;
    group.add(m);
    return m;
  });
  return { signs: [front, crown], banners };
}

// The doors in the middle of the front: two glass leaves that slide apart as someone comes, and a mat before them.
function buildDoors(group) {
  const D = P.doors, z = B.z1 + 0.02;
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fb8c4, transparent: true, opacity: 0.45, roughness: 0.03, metalness: 0.3, envMap: vehicleEnvironment() || null, side: THREE.DoubleSide, depthWrite: false });
  const steel = surface({ color: 0xc4c9ce, roughness: 0.3, metalness: 0.85 });
  const fixed = new Batch();
  fixed.box(D.width + 1.6, D.height + 0.6, 0.1, place(D.x, (D.height + 0.6) / 2, z - 0.06), 0x1a1d22);
  const fm = fixed.build(surface({ vertexColors: true, roughness: 0.4, metalness: 0.5 })); fm.receiveShadow = true; group.add(fm);
  const leaves = [-1, 1].map((s) => {
    const leaf = new THREE.Group();
    const pane = new THREE.Mesh(new THREE.BoxGeometry(D.width / 2 - 0.04, D.height - 0.05, 0.02), glass); pane.position.y = D.height / 2; pane.renderOrder = 3; leaf.add(pane);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.1, 0.05), steel); handle.position.set(-s * (D.width / 4 - 0.12), 1.15, 0.05); leaf.add(handle);
    leaf.position.set(D.x + s * (D.width / 4), 0, z + 0.03);
    group.add(leaf);
    return { leaf, s };
  });
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(D.width + 0.4, 1.4), surface({ color: 0x1b1d20, roughness: 0.95, metalness: 0 }));
  mat.rotation.x = -Math.PI / 2; mat.position.set(D.x, 0.045, z + 0.8); mat.receiveShadow = true; group.add(mat);
  return { set(open) { for (const { leaf, s } of leaves) leaf.position.x = D.x + s * (D.width / 4 + (D.width / 2 - 0.1) * open); } };
}

// ------------------------------------------------------------------------------------------------ the hall --

function buildHall() {
  const group = new THREE.Group();
  group.name = 'sports-hall';
  group.userData.keepPictures = true;
  const solid = new Batch(), gloss = new Batch(), metal = new Batch(), glow = new Batch(), glassB = new Batch(), overhead = new Batch();
  const W = H.x1 - H.x0, D = H.z1 - H.z0, cx = (H.x0 + H.x1) / 2, cz = (H.z0 + H.z1) / 2, top = H.ceiling;
  const GREY = 0x2b2f35;
  // the floor: pale polished boards
  const boards = floorTexture(); boards.repeat.set(W / 2, D / 2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), surface({ map: boards, color: 0xffffff, roughness: 0.3, metalness: 0.02, envMap: vehicleEnvironment() || null, envMapIntensity: 0.35 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0.012, cz); floor.receiveShadow = true; floor.name = 'sports-floor';
  group.add(floor);
  // the ceiling, and lines of light across it
  overhead.box(W, 0.12, D, place(cx, top + 0.06, cz), WHITE);
  for (let i = 0; i < 7; i += 1) glow.box(0.16, 0.03, D - 3, place(H.x0 + (W * (i + 0.5)) / 7, top - 0.02, cz), 0xfffaf0);
  // the walls: white, a green band a metre up, a dark skirting
  const wall = (x, z, w, d) => { solid.box(w, top, d, place(x, top / 2, z), WHITE, 0.98); solid.box(w + 0.01, 0.3, d + 0.01, place(x, 1.0, z), GREENX); metal.box(w + 0.01, 0.14, d + 0.01, place(x, 0.07, z), GREY); };
  wall(cx, H.z0 + 0.1, W, 0.2);
  wall(H.x0 + 0.1, cz, 0.2, D);
  wall(H.x1 - 0.1, cz, 0.2, D);
  // the front: glass from the floor to the ceiling between steel mullions, with the doors
  const dz = H.z1 - 0.06, door = P.doors;
  for (let x = H.x0 + 0.2; x <= H.x1 - 0.2 + 1e-6; x += (W - 0.4) / 18) metal.box(0.1, top, 0.14, place(x, top / 2, dz), GREY);
  metal.box(W, 0.18, 0.16, place(cx, top - 0.09, dz), GREY); metal.box(W, 0.1, 0.16, place(cx, 0.05, dz), GREY);
  const left = door.x - door.width / 2, right = door.x + door.width / 2;
  glassB.box(left - H.x0 - 0.2, top - 0.2, 0.03, place((H.x0 + 0.2 + left) / 2, top / 2, dz), 0xffffff);
  glassB.box(H.x1 - 0.2 - right, top - 0.2, 0.03, place((right + H.x1 - 0.2) / 2, top / 2, dz), 0xffffff);
  glassB.box(door.width, top - door.height - 0.2, 0.03, place(door.x, (door.height + top) / 2, dz), 0xffffff);
  for (const s of [-1, 1]) {
    glassB.box(door.width / 2 - 0.06, door.height - 0.08, 0.04, place(door.x + s * (door.width / 4), door.height / 2, dz - 0.02), 0xffffff);
    metal.box(0.06, door.height, 0.08, place(door.x + s * (door.width / 2), door.height / 2, dz - 0.02), GREY);
  }
  // EXIT over the doors, lit
  const exitCanvas = document.createElement('canvas'); exitCanvas.width = 256; exitCanvas.height = 80;
  { const g = exitCanvas.getContext('2d'); g.fillStyle = '#0e5a35'; g.fillRect(0, 0, 256, 80); g.fillStyle = '#eafff2'; g.font = '800 46px "Helvetica Neue", Helvetica, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('EXIT', 128, 42); }
  const exitTex = new THREE.CanvasTexture(exitCanvas); exitTex.colorSpace = THREE.SRGBColorSpace;
  const exitSign = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.36), new THREE.MeshBasicMaterial({ map: exitTex, toneMapped: false }));
  exitSign.position.set(door.x, door.height + 0.5, dz - 0.09); exitSign.rotation.y = Math.PI;
  group.add(exitSign);
  const e = P.exit;
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(e.x1 - e.x0, e.z1 - e.z0), surface({ map: matTexture(), roughness: 0.9, metalness: 0 }));
  mat.rotation.x = -Math.PI / 2; mat.rotation.z = Math.PI; mat.position.set((e.x0 + e.x1) / 2, 0.02, (e.z0 + e.z1) / 2); mat.name = 'sports-exit';
  group.add(mat);
  // the name on the back wall, lit from within
  const brand = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), new THREE.MeshBasicMaterial({ map: wallTexture(), toneMapped: false }));
  brand.position.set(cx, 2.85, H.z0 + 0.22); brand.name = 'sports-wall';
  group.add(brand);
  metal.box(14.4, 3.9, 0.1, place(cx, 2.85, H.z0 + 0.15), GREY);
  // the sales desk against the east wall: white, a green front, a brass edge, a screen, a stool
  const k = P.desk, mx = (k.x0 + k.x1) / 2, mz = (k.z0 + k.z1) / 2;
  gloss.box(k.x1 - k.x0, 1.04, k.z1 - k.z0, place(mx, 0.52, mz), WHITE);
  solid.box(0.02, 0.7, k.z1 - k.z0 - 0.3, place(k.x0 - 0.01, 0.55, mz), GREENX);
  metal.box(k.x1 - k.x0 + 0.08, 0.04, k.z1 - k.z0 + 0.08, place(mx, 1.06, mz), 0xc9a24a);
  solid.box(0.06, 0.38, 0.62, place(mx + 0.1, 1.3, mz - 0.8, 0, 1, 1, 1, 0, -0.12), 0x15171a);
  solid.box(0.5, 0.06, 0.5, place(mx + 1.0 - 1.0, 0.75, mz + 1.4), 0x24262a);
  // plants in tall pots
  for (const p of P.plants) {
    gloss.round(new THREE.CylinderGeometry(0.28, 0.22, 0.6, 16), place(p.x, 0.3, p.z), 0x1d1f22);
    for (let n = 0; n < 7; n += 1) solid.round(new THREE.SphereGeometry(0.26 + (n % 3) * 0.05, 8, 6), place(p.x + Math.sin(n * 2.4) * 0.16, 0.85 + n * 0.17, p.z + Math.cos(n * 2.4) * 0.16), n % 2 ? 0x2f6b34 : 0x3d8040);
  }
  // the stands: round and white (the boat's a wide platform with water-blue in its top), raised to `lift`, a light round
  // each foot, the plate on a post before each; the surfboard's rack
  const stands = [];
  for (const s of P.displays) {
    const h0 = s.lift;
    gloss.round(new THREE.CylinderGeometry(s.r, s.r * 1.015, h0, 64), place(s.x, h0 / 2, s.z), WHITE);
    if (s.stand === 'platform') gloss.round(new THREE.CylinderGeometry(s.r * 0.86, s.r * 0.86, 0.012, 64), place(s.x, h0 + 0.006, s.z), 0x1f5f86);
    glow.round(new THREE.TorusGeometry(s.r * 1.02, 0.025, 6, 96), place(s.x, 0.03, s.z, 0, 1, 1, 1, Math.PI / 2), 0x7dffb5);
    if (s.upright) for (const k2 of [-0.32, 0.32]) metal.box(0.05, 1.35, 0.05, place(s.x + Math.cos(s.h) * k2 - Math.sin(s.h) * 0.42, h0 + 0.675, s.z - Math.sin(s.h) * k2 - Math.cos(s.h) * 0.42), GREY);
    const item = SPORTS[s.item];
    const a = s.h, px = s.x + Math.sin(a) * (s.r + 0.35), pz = s.z + Math.cos(a) * (s.r + 0.35);
    metal.box(0.05, 0.55, 0.05, place(px, 0.275, pz), GREY);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.35), new THREE.MeshBasicMaterial({ map: plateTexture(item), toneMapped: false }));
    plate.position.set(px, 0.62, pz); plate.rotation.set(-0.6, a, 0, 'YXZ'); plate.name = `sports-plate:${s.item}`;
    group.add(plate);
    stands.push({ display: s, top: h0 });
  }
  // posters on the side walls: on the west those shown on the west side of the floor, on the east those on the east
  // (each by the stand of the thing it shows; on the east wall either side of the desk)
  const posters = [];
  if (!ON_DISK) {
    for (const s of P.displays) {
      if (s.stand === 'platform' || s.item === 'hoverboard' || s.item === 'e-unicycle') continue;
      const west = s.x < cx, x = west ? H.x0 + 0.24 : H.x1 - 0.24;
      const z = s.item === 'inline-skates' ? s.z + 4.2 : s.item === 'surfboard' ? s.z - 4.2 : s.z;
      metal.box(0.06, 3.0, 2.5, place(x + (west ? -0.04 : 0.04), 2.75, z), 0x1d2024);
      posters.push({ item: s.item, x, z, ry: west ? Math.PI / 2 : -Math.PI / 2 });
    }
    Promise.all(posters.map((q) => loadPoster(q.item))).then(() => {
      for (const q of posters) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.875), new THREE.MeshBasicMaterial({ map: posterTexture(SPORTS[q.item]), toneMapped: false }));
        m.position.set(q.x, 2.75, q.z); m.rotation.y = q.ry; m.name = `sports-poster:${q.item}`;
        group.add(m);
      }
    });
  }
  const add = (batch, material, shadow) => { if (batch.empty) return null; const m = batch.build(material); m.receiveShadow = true; m.castShadow = !!shadow; group.add(m); return m; };
  add(solid, surface({ vertexColors: true, roughness: 0.75, metalness: 0.02 }), true);
  add(overhead, surface({ vertexColors: true, roughness: 0.9, metalness: 0 }), false);
  add(gloss, surface({ vertexColors: true, roughness: 0.14, metalness: 0.1 }), true);
  add(metal, surface({ vertexColors: true, roughness: 0.32, metalness: 0.75 }), false);
  add(glow, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), false);
  const glassMesh = add(glassB, new THREE.MeshStandardMaterial({ color: 0xbfd6e2, transparent: true, opacity: 0.16, roughness: 0.04, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false }), false);
  if (glassMesh) glassMesh.renderOrder = 3;
  return { group, stands };
}

// ------------------------------------------------------------------------------------------------ the things --

let shadowTexture = null;
function softShadow() {
  if (shadowTexture) return shadowTexture;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  r.addColorStop(0, 'rgba(0,0,0,0.55)'); r.addColorStop(0.6, 'rgba(0,0,0,0.28)'); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  shadowTexture = new THREE.CanvasTexture(c);
  return shadowTexture;
}
// How a thing stands on its stand: as it is (on its wheels, its deck, its cradle), the skates as a pair side by side,
// the surfboard on its tail leaning back into its rack.
const UPRIGHT = 1.36;            // radians the surfboard is stood up from lying (78 degrees)
function holderOf(display, standTop, group) {
  const holder = new THREE.Group();
  holder.position.set(display.x, standTop, display.z); holder.rotation.y = display.h;
  group.add(holder);
  const item = SPORTS[display.item];
  void item;
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: softShadow(), transparent: true, depthWrite: false, toneMapped: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.006; shadow.renderOrder = 1;
  holder.add(shadow);
  return { display, holder, shadow, standTop, model: null, tier: null };
}
// One thing's model as it stands: a group with the model (or the pair) in it, posed, its foot on y = 0
async function standingModel(id, tier) {
  const pair = id === 'inline-skates';
  const made = await Promise.all((pair ? [false, true] : [false]).map((mirror) => loadSport(id, { tier, mirror })));
  const group = new THREE.Group(); group.name = `sports-display:${id}`;
  made.forEach((m, k) => { m.pose({}); if (pair) m.group.position.x = (k ? 1 : -1) * 0.085; group.add(m.group); });
  if (id === 'surfboard') {
    // on its tail, its deck to the front, leaning back: its foot set on the stand
    const s = made[0];
    s.group.rotation.x = -UPRIGHT;
    s.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(s.group);
    s.group.position.y = -box.min.y; s.group.position.z = -(box.min.z + box.max.z) / 2 - 0.12;
  }
  return { group, dispose: () => { for (const m of made) m.dispose(); }, parts: made };
}

// ------------------------------------------------------------------------------------------------ together --

// The sets each thing is drawn with, by how far it is from the player (hall-models.js): no 4096 set, no pictures of
// themselves (a phone draws every one of them as its model, with the 512 picture but for the one the player stands at).
const PLAN = Object.freeze({
  full: Object.freeze({ inspect: '2k', near: '2k', mid: '1k', far: '512', nearRanks: 3 }),
  lite: Object.freeze({ inspect: '1k', near: '512', mid: '512', far: '512', nearRanks: 1 }),
});

// `lite`: a phone; `renderer`: the town's (the things' pictures are handed to it one at a time as they come).
export function buildSports(scene, { lite = false, renderer = null } = {}) {
  const exterior = new THREE.Group(); exterior.name = 'sports';
  scene.add(exterior);
  const outside = new THREE.Group(); outside.name = 'sports-compound';            // what stays drawn from inside, through the glass
  scene.add(outside);
  // the compound and the building are made the first time they are asked for (`load`), not while the game starts
  let court = null, railings = null, doors = null, front = null;
  function ensureOutside() {
    if (court) return;
    court = buildForecourt(outside, { lite });
    railings = buildRailings(outside);
    front = buildExterior(exterior);
    doors = buildDoors(exterior);
  }
  // What can be seen from (x, z), `reach` being how far the town is drawn just now: the compound within that reach of its
  // railings, the mall from further (it stands above the bush), never through the haze.
  const TALL = 260;
  function see(x, z, reach, tall = TALL) {
    const haze = scene.fog ? scene.fog.far : Infinity;
    const dx = Math.max(C.x0 - x, 0, x - C.x1), dz = Math.max(C.z0 - z, 0, z - C.z1);
    outside.visible = Math.hypot(dx, dz) < Math.min(haze, reach + 40);
    const bx = Math.max(B.x0 - x, 0, x - B.x1), bz = Math.max(B.z0 - z, 0, z - B.z1);
    exterior.visible = !inside && Math.hypot(bx, bz) < Math.min(haze, reach + tall);
  }
  // (the mall is made of plain shapes: nothing to fetch; `load` makes it the first time, by someone within reach)
  function load(x, z) {
    if (x !== undefined && Math.hypot(P.doors.x - x, P.doors.z - z) > (lite ? 560 : 900)) return;
    ensureOutside();
  }

  // ---- inside ----
  let hall = null, displays = [], inside = false, models = null;
  function ensureHall() {
    if (hall) return hall;
    hall = buildHall();
    hall.group.visible = inside;
    scene.add(hall.group);
    displays = hall.stands.map((s) => holderOf(s.display, s.top, hall.group));
    models = hallModels({
      items: displays.map((d) => ({ id: d.display.item })), lite, renderer, plan: PLAN[lite ? 'lite' : 'full'],
      ranges: { inspect: 3.5, near: 9, mid: 18 },
      load: (k, tier) => (ON_DISK ? Promise.reject(new Error('opened from the disk')) : standingModel(displays[k].display.item, tier)),
      put: (k, model) => {
        const d = displays[k];
        d.holder.add(model.group);
        // (the soft shadow under it, its size)
        const box = new THREE.Box3().setFromObject(model.group);
        const size = box.getSize(new THREE.Vector3());
        d.shadow.scale.set(Math.max(0.4, size.x * 1.15), Math.max(0.4, size.z * 1.1), 1);
      },
    });
    return hall;
  }
  const SHADOW_NEAR = 8, SHADOW_KEEP = 10;
  function updateDisplays(dt, { player, level = 0, sun = true }) {
    const clock = performance.now() / 1000;
    const gaps = displays.map((d) => Math.max(0, Math.hypot(d.display.x - player.x, d.display.z - player.z) - d.display.r));
    models.update({ gaps, now: clock, mode: 'inside', level });
    displays.forEach((d, k) => {
      d.model = models.modelOf(k); d.tier = models.tierOf(k);
      d.casts = sun && !!d.model && gaps[k] < (d.casts ? SHADOW_KEEP : SHADOW_NEAR);
      castShadows(d.model, d.casts);
    });
  }
  // Outside: as the player comes up to the doors the things nearest them are made ready; once the player has gone well
  // away (`RELEASE` metres from the doors), all of them are let go.
  const READY = 50, RELEASE = 130;
  function prepare(player) {
    if (!models) return;
    const clock = performance.now() / 1000;
    const away = Math.hypot(player.x - P.doors.x, player.z - P.doors.z);
    if (away > RELEASE) { models.update({ gaps: [], now: clock, mode: 'far' }); for (const d of displays) { d.model = null; d.tier = null; } return; }
    if (away < READY) models.update({ gaps: displays.map((d) => Math.hypot(d.display.x - P.doors.x, d.display.z - P.doors.z)), now: clock, mode: 'near', ahead: lite ? 16 : Infinity });
  }

  let doorsOpen = 0;
  return {
    exterior, outside,
    get hall() { return hall; },
    get inside() { return inside; },
    get front() { return front; },
    get railings() { return railings; },
    get court() { return court; },
    load, see,
    // `on`: the player is in the hall. Outside, the hall is not drawn; inside, the mall round it is not (the compound
    // stays: it is what the glass front shows)
    setInside(on) {
      if (on === inside) return;
      inside = on;
      if (on) { ensureOutside(); ensureHall(); }
      if (hall) hall.group.visible = on;
      exterior.visible = !on;
    },
    // the first time someone comes near the doors, the hall is made (so that stepping in does not wait for it)
    near(x, z) { if (!hall && Math.hypot(x - P.doors.x, z - P.doors.z) < 60) { ensureOutside(); ensureHall(); } },
    // each frame: the doors (open while someone is at them); inside, the things on show
    tick(dt, { player, people = [], level = 0, sun = true }) {
      if (court && Math.hypot(player.x - P.doors.x, player.z - P.doors.z) < 200) {
        const atDoors = people.some((q) => Math.hypot(q.x - P.doors.x, q.z - (P.doors.z + 1.2)) < 3.2);
        doorsOpen = Math.max(0, Math.min(1, doorsOpen + (atDoors ? dt / 1.1 : -dt / 1.6)));
        doors.set(doorsOpen);
      }
      if (inside && hall) updateDisplays(dt, { player, level, sun });
      else prepare(player);
    },
    // for the checks: what is drawn, and with which picture
    shown() { return displays.map((d) => ({ item: d.display.item, model: !!d.model, tier: d.tier, loaded: !!d.tier && sportLoaded(d.display.item, d.tier), casts: !!d.casts })); },
    models: () => (models ? models.state() : null),
    state: () => ({ built: !!court, hall: !!hall, inside, doors: doorsOpen }),
  };
}
