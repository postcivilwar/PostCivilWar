// The Post Civil War Car Showroom (asaba-carshow.js says where everything is; this draws it).
//
// The compound: interlocking paving blocks over all of it, the drive to the showroom's doors in a darker block and the
// visitors' bays marked out in white; white iron railings all round it, a post every few metres and a bar every
// thirteen centimetres with a spear at its top, so that it is seen through; the gate, two leaves of clear glass in
// brushed steel that slide apart on their track as someone comes, between two pillars; a CCTV camera on a pole at
// each corner, turning to follow whoever is nearest and blinking red now and then; flag poles, palms in planters and
// lamps on the forecourt.
//
// The buildings: the owner's five models exactly as supplied (their meshes, pictures and finishes), drawn at the
// compound's scale. What was written on any of them (another company's name and marks) is painted over in the page,
// in the picture the graphics card is given, with the building's own surface from beside it; the files are not
// changed. Until a model has arrived a plain shape of its outline stands in its place. On top of the showroom's
// podium, over its doors, and at the top of its tower, its name: POST CIVIL WAR CAR SHOWROOM.
//
// The hall (built the first time someone comes near): a polished floor, white walls, a glass front with the doors,
// lines of light in the ceiling; the twenty cars on round white stands with a light round each, a plate on a post
// giving the name, top speed and price; the gold hypercar turning in the middle; the salesmen's desks at the ends,
// a lounge by the glass, plants, and the name on the back wall. Each nearby car is the owner's model itself
// (car-model.js), the nearest at the device's full detail; each further off is a picture of that model taken from the
// side it is seen from (tools/vehicles/car_impostors.mjs: twenty-four sides), at its own size and where it stands.
//
// While the player is outside, the hall is not drawn; while inside, the showroom round it is not.

import { CARSHOW, onBuilding, carshowGateBoxes } from '../sim/zone.js';
import { POWER_CARS } from '../sim/power-cars.js';
import { trText } from '../sim/ledger.js';
import { parseGLB, fetchKept } from './glb.js';
import { Batch, place, surface } from './render-kit.js';
import { loadCar, carLoaded } from './car-model.js';
import { CAR_IMPOSTOR } from './car-impostors.js';
import { COVER } from './brand-data.js';
import { vehicleEnvironment } from './vehicle-models.js';

const P = CARSHOW, C = CARSHOW.compound, G = CARSHOW.gate, H = CARSHOW.hall, S = CARSHOW.showroom;
const ON_DISK = (() => { try { return location.protocol === 'file:'; } catch (error) { return false; } })();
const GOLD = '#e9c46a', CREAM = '#f6f0e2';
const MILK = 0xf1efe7, STEEL = 0x9aa1a8, DARK = 0x24282e;
const HEAVY = (px) => `900 ${px}px "Arial Black", "Helvetica Neue", Helvetica, Arial, sans-serif`;

// The owner's canonical logo (the rising sun over level ground, and POST CIVIL WAR; COVER.logo).
let logoImage = null;
const logo = () => { if (!logoImage) logoImage = new Promise((resolve) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = COVER.logo.src; }); return logoImage; };
const SUN_SHARE = 0.315;            // of the logo's height: the sun, its rays and its three ground lines

function canvasTexture(width, height, draw, { repeat = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding; texture.anisotropy = 8;
  if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  const g = canvas.getContext('2d');
  logo().then((img) => { g.clearRect(0, 0, width, height); draw(g, img); texture.needsUpdate = true; });
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

// ------------------------------------------------------------------------------------------ the paving --

// Interlocking paving blocks, the I-shaped kind laid on Nigerian forecourts: each block narrower in its middle
// than at its ends, each row half a block along from the last, the ends of one row's blocks set into the waists of
// the next. A picture of 2.4 metres square (ten blocks along, twenty-four rows), and its relief (the joints sunk,
// the edges rounded) for the light to catch. `tone`: the blocks' colour; `accent`: every so many a darker one.
const BLOCK = Object.freeze({ metres: 2.4, along: 10, rows: 24 });
function pavingTextures(size, { tone = [158, 154, 147], spread = 14, seed = 1 } = {}) {
  const colour = document.createElement('canvas'), height = document.createElement('canvas');
  colour.width = colour.height = height.width = height.height = size;
  const g = colour.getContext('2d'), h = height.getContext('2d');
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const L = size / BLOCK.along, p = size / BLOCK.rows, d = p * 0.15, Hh = p + d, ch = L / 14;
  // the joints and the gaps between: dark sand
  g.fillStyle = 'rgb(92,88,82)'; g.fillRect(0, 0, size, size);
  h.fillStyle = '#000'; h.fillRect(0, 0, size, size);
  const shape = (x0, y0) => [[0, 0], [L / 4 - ch / 2, 0], [L / 4 + ch / 2, d], [3 * L / 4 - ch / 2, d], [3 * L / 4 + ch / 2, 0], [L, 0], [L, Hh], [3 * L / 4 + ch / 2, Hh], [3 * L / 4 - ch / 2, Hh - d], [L / 4 + ch / 2, Hh - d], [L / 4 - ch / 2, Hh], [0, Hh]].map(([u, v]) => [x0 + u, y0 + v]);
  const path = (c, pts, inset) => {
    // (pulled in toward its own middle by `inset` pixels: the joint)
    const mx = pts.reduce((a, q) => a + q[0], 0) / pts.length, my = pts.reduce((a, q) => a + q[1], 0) / pts.length;
    c.beginPath();
    pts.forEach(([x, y], i) => { const dx = mx - x, dy = my - y, k = inset / Math.max(1, Math.hypot(dx, dy)); const px = x + dx * k * 1.4, py = y + dy * k; if (i) c.lineTo(px, py); else c.moveTo(px, py); });
    c.closePath();
  };
  for (let r = -1; r <= BLOCK.rows; r += 1) {
    const y0 = r * p, off = (((r % 2) + 2) % 2) * (L / 2);
    for (let k = -1; k <= BLOCK.along; k += 1) {
      const x0 = k * L + off;
      const pts = shape(x0, y0);
      const shade = (rnd() - 0.5) * spread, warm = (rnd() - 0.5) * 6;
      const [cr, cg, cb] = tone;
      const fill = `rgb(${Math.round(cr + shade + warm)},${Math.round(cg + shade)},${Math.round(cb + shade - warm)})`;
      // drawn where it is, and again a whole picture over where it crosses an edge (so that the picture repeats)
      for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
        const q = pts.map(([x, y]) => [x + ox, y + oy]);
        g.fillStyle = fill; path(g, q, 1.6); g.fill();
        h.fillStyle = '#fff'; path(h, q, 2.2); h.fill();
      }
    }
  }
  // wear: fine speckle and a few darker marks, from tyres and rain
  const img = g.getImageData(0, 0, size, size), px = img.data;
  for (let i = 0; i < px.length; i += 4) { const n = (rnd() - 0.5) * 16; px[i] = Math.max(0, Math.min(255, px[i] + n)); px[i + 1] = Math.max(0, Math.min(255, px[i + 1] + n)); px[i + 2] = Math.max(0, Math.min(255, px[i + 2] + n)); }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 18; i += 1) { const x = rnd() * size, y = rnd() * size, r = size * (0.02 + rnd() * 0.05); const grad = g.createRadialGradient(x, y, 0, x, y, r); grad.addColorStop(0, 'rgba(40,36,30,0.10)'); grad.addColorStop(1, 'rgba(40,36,30,0)'); g.fillStyle = grad; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
  // the relief: the heights, softened, turned into which way each point faces
  h.filter = 'blur(1.4px)'; h.drawImage(height, 0, 0); h.filter = 'none';
  const hd = h.getImageData(0, 0, size, size).data;
  const normal = document.createElement('canvas'); normal.width = normal.height = size;
  const nctx = normal.getContext('2d'), out = nctx.createImageData(size, size), o = out.data;
  const at = (x, y) => hd[((((y + size) % size) * size + ((x + size) % size)) * 4)] / 255;
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * 2.2, dy = (at(x, y + 1) - at(x, y - 1)) * 2.2;
    const len = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
    o[i] = Math.round((0.5 - dx / len / 2) * 255); o[i + 1] = Math.round((0.5 + dy / len / 2) * 255); o[i + 2] = Math.round((0.5 + 0.5 / len) * 255); o[i + 3] = 255;
  }
  nctx.putImageData(out, 0, 0);
  const map = new THREE.CanvasTexture(colour); map.encoding = THREE.sRGBEncoding;
  const normalMap = new THREE.CanvasTexture(normal);
  for (const t of [map, normalMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
  return { map, normalMap };
}

// ------------------------------------------------------------------------------------------ the railings --

// The railings: posts, two rails and the bars between with a spear at the top of each, white, along every side but
// the gate. The bars and spears are the same shape over and over: one shape each, drawn many times (instanced).
function buildFence(group, { lite }) {
  const F = P.fence, t = 0.12;
  const runs = [];
  const gx0 = G.x - G.width / 2 - 0.6, gx1 = G.x + G.width / 2 + 0.6;
  runs.push([C.x0, C.z0, C.x1, C.z0], [C.x0, C.z0, C.x0, C.z1], [C.x1, C.z0, C.x1, C.z1], [C.x0, C.z1, gx0, C.z1], [gx1, C.z1, C.x1, C.z1]);
  const bars = [], posts = [];
  const solid = new Batch();
  for (const [ax, az, bx, bz] of runs) {
    const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len, ry = Math.atan2(ux, uz);
    const nPosts = Math.max(1, Math.round(len / F.post));
    for (let i = 0; i <= nPosts; i += 1) posts.push([ax + ux * (len * i) / nPosts, az + uz * (len * i) / nPosts]);
    for (let s = F.bar / 2; s < len; s += F.bar) bars.push([ax + ux * s, az + uz * s, ry]);
    // the two rails, and a low kerb of concrete the railings stand on
    for (const y of [0.24, 2.0]) solid.box(0.045, 0.05, len, place((ax + bx) / 2, y, (az + bz) / 2, ry), MILK);
    solid.box(0.32, 0.16, len + 0.3, place((ax + bx) / 2, 0.08, (az + bz) / 2, ry), 0xc9c3b6, 1);
  }
  for (const [x, z] of posts) { solid.box(0.075, F.height + 0.06, 0.075, place(x, (F.height + 0.06) / 2, z), MILK); solid.round(new THREE.SphereGeometry(0.06, 10, 6), place(x, F.height + 0.1, z), MILK); }
  const paint = surface({ vertexColors: true, roughness: 0.45, metalness: 0.25 });
  const rails = solid.build(paint); rails.castShadow = true; rails.receiveShadow = true; rails.name = 'carshow-railings';
  group.add(rails);
  // the bars and their spears
  const barGeo = new THREE.BoxGeometry(0.02, 1.9, 0.02); barGeo.translate(0, 0.12 + 0.95, 0);
  const tipGeo = new THREE.ConeGeometry(0.026, 0.1, 4); tipGeo.translate(0, 2.07, 0);
  const material = surface({ color: MILK, roughness: 0.45, metalness: 0.25 });
  const m = new THREE.Matrix4();
  for (const geo of [barGeo, tipGeo]) {
    const inst = new THREE.InstancedMesh(geo, material, bars.length);
    bars.forEach(([x, z, ry], i) => inst.setMatrixAt(i, m.makeRotationY(ry + Math.PI / 4).setPosition(x, 0, z)));
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = !lite; inst.receiveShadow = false; inst.name = 'carshow-bars';
    inst.frustumCulled = false;
    group.add(inst);
  }
  return { bars: bars.length, posts: posts.length };
}

// ------------------------------------------------------------------------------------------- the gate --

// Two leaves of glass in brushed steel on a steel track, sliding apart from the middle along the inside of the
// fence; the pillars either side with a lamp on each and the sensor that sees who comes.
function buildGate(group) {
  const half = G.width / 2, z = G.z - 0.35;
  const fixed = new Batch();
  fixed.box(G.width * 2 + 1.2, 0.04, 0.12, place(G.x, 0.02, z), STEEL);                       // the track
  for (const s of [-1, 1]) {
    const x = G.x + s * (half + 0.3);
    fixed.box(0.62, 2.95, 0.62, place(x, 1.475, G.z), 0xe9e4d8);                              // the pillar, rendered white
    fixed.box(0.7, 0.12, 0.7, place(x, 3.0, G.z), 0xb9b2a4);
    fixed.box(0.16, 0.1, 0.06, place(x - s * 0.33, 1.25, G.z + 0.06), 0x111315);                // the sensor
  }
  const fixedMesh = fixed.build(surface({ vertexColors: true, roughness: 0.6, metalness: 0.1 }));
  fixedMesh.castShadow = true; fixedMesh.receiveShadow = true;
  group.add(fixedMesh);
  // the lamps on the pillars
  const lamps = [];
  for (const s of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 10), new THREE.MeshBasicMaterial({ color: 0xfff1d6, toneMapped: false }));
    lamp.position.set(G.x + s * (half + 0.3), 3.24, G.z); group.add(lamp); lamps.push(lamp);
  }
  // the leaves: a frame of brushed steel round a pane of clear glass
  const leaves = [];
  const steel = surface({ color: 0xc4c9ce, roughness: 0.32, metalness: 0.85 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xd8ecf2, transparent: true, opacity: 0.22, roughness: 0.04, metalness: 0.15, side: THREE.DoubleSide, depthWrite: false });
  for (const s of [-1, 1]) {
    const leaf = new THREE.Group(); leaf.name = 'carshow-gate-leaf';
    const w = half, h = G.height;
    const frame = new Batch();
    frame.box(w, 0.09, 0.07, place(0, h - 0.045, 0), 0xffffff); frame.box(w, 0.14, 0.07, place(0, 0.12, 0), 0xffffff);
    frame.box(0.07, h - 0.05, 0.07, place(-w / 2 + 0.035, h / 2, 0), 0xffffff); frame.box(0.07, h - 0.05, 0.07, place(w / 2 - 0.035, h / 2, 0), 0xffffff);
    frame.box(w, 0.05, 0.05, place(0, h * 0.42, 0), 0xffffff);
    const fm = frame.build(steel); fm.castShadow = true; leaf.add(fm);
    const pane = new THREE.Mesh(new THREE.BoxGeometry(w - 0.14, h - 0.28, 0.014), glass); pane.position.set(0, h / 2 + 0.05, 0); pane.renderOrder = 3; leaf.add(pane);
    // the wheels it runs on
    for (const k of [-0.32, 0.32]) { const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 14), steel); wheel.rotation.z = Math.PI / 2; wheel.position.set(k * w, 0.06, 0); leaf.add(wheel); }
    leaf.position.set(G.x + s * (half / 2), 0, z);
    group.add(leaf);
    leaves.push({ leaf, side: s });
  }
  return {
    leaves, lamps, pane: glass,
    set(open) { for (const { leaf, side } of leaves) leaf.position.x = G.x + side * (half / 2 + half * Math.max(0, Math.min(1, open))); },
  };
}

// ------------------------------------------------------------------------------------------- the cameras --

// A CCTV camera on a pole at each corner: a white housing with a sun shield and a dark lens, on an arm. It turns to
// follow whoever is nearest within its sight, and sweeps slowly to and fro when nobody is; a small red lamp under its
// lens blinks now and then.
function buildCameras(group) {
  const cams = [];
  for (const [k, c] of P.cctv.entries()) {
    const root = new THREE.Group(); root.position.set(c.x + Math.sin(c.look) * 0.5, 0, c.z + Math.cos(c.look) * 0.5); root.name = 'carshow-cctv';
    const pole = new Batch();
    pole.round(new THREE.CylinderGeometry(0.06, 0.08, c.height, 12), place(0, c.height / 2, 0), 0x8c9198);
    pole.box(0.3, 0.4, 0.12, place(0, 2.2, 0, c.look), 0xd9dcdf);                 // the box with its recorder
    const pm = pole.build(surface({ vertexColors: true, roughness: 0.45, metalness: 0.6 })); pm.castShadow = true; root.add(pm);
    const pan = new THREE.Group(); pan.position.set(0, c.height, 0); root.add(pan);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.5), surface({ color: 0x8c9198, roughness: 0.4, metalness: 0.6 })); arm.position.set(0, 0, 0.25); pan.add(arm);
    const tilt = new THREE.Group(); tilt.position.set(0, -0.08, 0.5); pan.add(tilt);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.15, 0.4), surface({ color: 0xf3f4f5, roughness: 0.35, metalness: 0.1 })); housing.position.set(0, 0, 0.14); housing.castShadow = true; tilt.add(housing);
    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.48), surface({ color: 0xe6e8ea, roughness: 0.4, metalness: 0.1 })); shield.position.set(0, 0.09, 0.16); tilt.add(shield);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.03, 20), new THREE.MeshStandardMaterial({ color: 0x07090c, roughness: 0.05, metalness: 0.6 })); lens.rotation.x = Math.PI / 2; lens.position.set(0, 0, 0.345); tilt.add(lens);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), new THREE.MeshBasicMaterial({ color: 0x3a0505, toneMapped: false })); led.position.set(0.045, -0.06, 0.345); tilt.add(led);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), new THREE.MeshBasicMaterial({ color: 0xff2010, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, map: glowTexture() })); glow.position.set(0.045, -0.06, 0.36); tilt.add(glow);
    group.add(root);
    cams.push({ k, c, root, pan, tilt, led, glow, yaw: c.look, pitch: 0.18, phase: k * 1.37 });
  }
  return cams;
}
let glowMap = null;
function glowTexture() {
  if (glowMap) return glowMap;
  const g = document.createElement('canvas'); g.width = g.height = 64;
  const c = g.getContext('2d'); const r = c.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,0.45)'); r.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = r; c.fillRect(0, 0, 64, 64);
  glowMap = new THREE.CanvasTexture(g);
  return glowMap;
}
const wrap = (a) => { let d = a % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
// how each camera turns this frame: toward the nearest person within its sight, or sweeping; and its lamp
function turnCameras(cams, dt, now, people) {
  for (const cam of cams) {
    const at = cam.root.position;
    let best = null;
    for (const q of people) { const d = Math.hypot(q.x - at.x, q.z - at.z); if (d < 60 && (!best || d < best.d)) best = { q, d }; }
    let wantYaw, wantPitch;
    if (best) { wantYaw = Math.atan2(best.q.x - at.x, best.q.z - at.z); wantPitch = Math.atan2(cam.c.height - 1.2, Math.max(2, best.d)); }
    else { wantYaw = cam.c.look + Math.sin(now * 0.42 + cam.phase) * 0.75; wantPitch = 0.22; }
    // (it turns at the speed a camera's motor turns it, never faster)
    const most = 0.9 * dt;
    cam.yaw += Math.max(-most, Math.min(most, wrap(wantYaw - cam.yaw)));
    cam.pitch += Math.max(-most * 0.5, Math.min(most * 0.5, wantPitch - cam.pitch));
    cam.pan.rotation.y = cam.yaw;
    cam.tilt.rotation.x = cam.pitch;
    // the red lamp: a short blink every two and a half seconds or so
    const t = (now + cam.phase * 0.9) % 2.6;
    const on = t < 0.16 || (best && t > 1.3 && t < 1.42);
    cam.led.material.color.setHex(on ? 0xff2a12 : 0x3a0505);
    cam.glow.material.opacity = on ? 0.95 : 0;
  }
}

// ------------------------------------------------------------------------------------------- the buildings --

// One of the owner's buildings, read as it is: its one mesh, its pictures (colour, and where the file has them,
// normal and metal and roughness), its material's own finish. What was written on it is painted over in the colour
// picture the graphics card is given (`brand`: rectangles of the picture, and where beside each to take the
// building's own surface from), feathered at its edges; the file is not changed.
async function loadBuilding(b, { maxTexture, env }) {
  const response = await fetchKept(b.file);
  if (!response.ok) throw new Error(`${b.file}: ${response.status}`);
  const { json, accessor, bytes } = parseGLB(await response.arrayBuffer());
  const prim = json.meshes[0].primitives[0], at = prim.attributes;
  const geometry = new THREE.BufferGeometry();
  const put = (name, key) => { if (at[key] === undefined) return; const a = accessor(at[key]); geometry.setAttribute(name, new THREE.BufferAttribute(a.array, a.width, a.normalized)); };
  put('position', 'POSITION'); put('normal', 'NORMAL'); put('uv', 'TEXCOORD_0');
  if (prim.indices !== undefined) geometry.setIndex(new THREE.BufferAttribute(accessor(prim.indices).array, 1));
  if (!at.NORMAL) geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const mat = json.materials[prim.material || 0], pbr = mat.pbrMetallicRoughness || {};
  const pictureOf = async (info, colour, paint = null) => {
    if (!info) return null;
    const image = json.images[json.textures[info.index].source];
    const raw = bytes(image.bufferView);
    const blob = new Blob([raw], { type: image.mimeType || 'image/jpeg' });
    // (drawn no larger than `maxTexture`, and never larger than it is)
    const own = pictureSize(raw);
    const most = Math.min(maxTexture || 4096, own ? Math.max(own.width, own.height) : Infinity);
    const wide = own ? Math.round((most * own.width) / Math.max(own.width, own.height)) : most, high = own ? Math.round((most * own.height) / Math.max(own.width, own.height)) : most;
    let picture = await (typeof createImageBitmap === 'function' ? createImageBitmap(blob, { resizeWidth: wide, resizeHeight: high, resizeQuality: 'high' }).catch(() => null) : null);
    if (!picture) picture = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = URL.createObjectURL(blob); });
    if (paint && paint.length) {
      const c = document.createElement('canvas'); c.width = picture.width; c.height = picture.height;
      const g = c.getContext('2d'); g.drawImage(picture, 0, 0);
      for (const { at: [u0, v0, u1, v1], from: [fu, fv] } of paint) {
        const W = c.width, Hh = c.height, w = (u1 - u0) * W, h = (v1 - v0) * Hh, pad = Math.max(2, Math.min(w, h) * 0.12);
        // the surface from beside it, laid over it, its edges blended into what is round it
        const patch = document.createElement('canvas'); patch.width = Math.ceil(w + 2 * pad); patch.height = Math.ceil(h + 2 * pad);
        const pg = patch.getContext('2d');
        pg.drawImage(c, fu * W - pad, fv * Hh - pad, patch.width, patch.height, 0, 0, patch.width, patch.height);
        const mask = pg.createLinearGradient(0, 0, patch.width, 0);
        pg.globalCompositeOperation = 'destination-in';
        const fade = (a, b) => { const m = pg.createLinearGradient(...a); m.addColorStop(0, 'rgba(0,0,0,0)'); m.addColorStop(Math.min(0.45, pad / b), 'rgba(0,0,0,1)'); m.addColorStop(1 - Math.min(0.45, pad / b), 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)'); pg.fillStyle = m; pg.fillRect(0, 0, patch.width, patch.height); };
        void mask;
        fade([0, 0, patch.width, 0], patch.width); fade([0, 0, 0, patch.height], patch.height);
        g.drawImage(patch, u0 * W - pad, v0 * Hh - pad);
      }
      picture = c;
    }
    const t = new THREE.Texture(picture);
    t.flipY = false; t.anisotropy = 8; if (colour) t.encoding = THREE.sRGBEncoding; t.needsUpdate = true;
    return t;
  };
  const [map, normalMap, rm] = await Promise.all([pictureOf(pbr.baseColorTexture, true, b.brand), pictureOf(mat.normalTexture, false), pictureOf(pbr.metallicRoughnessTexture, false)]);
  const colour = pbr.baseColorFactor ? new THREE.Color(...pbr.baseColorFactor.slice(0, 3)) : new THREE.Color(1, 1, 1);
  // the glass and the cladding of a tower reflect the sky (render-city.js's glass does the same)
  const material = surface({ map, normalMap, roughnessMap: rm, metalnessMap: rm, color: colour, roughness: rm ? 1 : (pbr.roughnessFactor ?? 1), metalness: rm ? 1 : (pbr.metallicFactor ?? 1), envMap: env || null, envMapIntensity: 0.9, side: mat.doubleSided ? THREE.DoubleSide : THREE.FrontSide });
  if (normalMap && material.normalScale) material.normalScale.set(1, -1);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.name = `carshow-${b.id}`;
  return { mesh, triangles: geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3 };
}

// How large a picture is, read from its first bytes (a PNG's header, or a JPEG's frame marker): null if neither.
function pictureSize(b) {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50) return { width: (b[16] << 24 | b[17] << 16 | b[18] << 8 | b[19]) >>> 0, height: (b[20] << 24 | b[21] << 16 | b[22] << 8 | b[23]) >>> 0 };
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  for (let i = 2; i + 9 < b.length;) {
    if (b[i] !== 0xff) { i += 1; continue; }
    const marker = b[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { height: b[i + 5] << 8 | b[i + 6], width: b[i + 7] << 8 | b[i + 8] };
    i += 2 + (b[i + 2] << 8 | b[i + 3]);
  }
  return null;
}

// What stands where a building is until its model has come: its outline, raised to about its height, plain.
function standIn(b) {
  const pts = b.outline.map(([u, v]) => onBuilding(b, u, v));
  const shape = new THREE.Shape(pts.map((q) => new THREE.Vector2(q.x, -q.z)));
  const tall = b.id === 'villa' ? 9 : b.id === 'showroom' ? b.scale * (b.podium || 0.2) : b.scale * 0.9;
  const geo = new THREE.ExtrudeGeometry(shape, { depth: tall, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, surface({ color: b.id === 'villa' ? 0xd9d6cf : 0x2b3442, roughness: 0.35, metalness: 0.4 }));
  mesh.castShadow = true;
  const group = new THREE.Group(); group.add(mesh);
  if (b.tower) {
    const t = onBuilding(b, b.tower.x, b.tower.z);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(b.tower.r * b.scale, b.tower.r * b.scale, b.tower.top * b.scale, 32), surface({ color: 0x9aa6b4, roughness: 0.25, metalness: 0.6 }));
    tower.position.set(t.x, (b.tower.top * b.scale) / 2, t.z); tower.castShadow = true;
    group.add(tower);
  }
  return group;
}

// ------------------------------------------------------------------------------------------- the signs --

// POST CIVIL WAR over CAR SHOWROOM, standing letters with the rising sun before them: what stands on the podium
// over the doors and at the top of the tower. Nothing behind the letters.
const nameTexture = () => canvasTexture(4096, 1024, (g, img) => {
  g.textBaseline = 'alphabetic';
  const sunH = 900, sunW = img ? (img.width / (img.height * SUN_SHARE)) * sunH * SUN_SHARE * 1.0 : 0;
  if (img) g.drawImage(img, 0, 0, img.width, img.height * SUN_SHARE, 40, 70, (img.width / (img.height * SUN_SHARE)) * 520, 520);
  const left = img ? 80 + (img.width / (img.height * SUN_SHARE)) * 520 : 60;
  void sunW;
  const room = 4096 - left - 60, mid = left + room / 2;
  heavy(g, 'POST CIVIL WAR', mid, 560, 470, room, CREAM, 0.05);
  heavy(g, 'CAR SHOWROOM', mid, 960, 330, room * 0.82, GOLD, 0.16);
});
// The wall behind the floor, inside: the logo, the name, and what is sold here.
const wallTexture = () => canvasTexture(3072, 768, (g, img) => {
  const bg = g.createLinearGradient(0, 0, 3072, 0); bg.addColorStop(0, '#0d0f12'); bg.addColorStop(0.5, '#1c2026'); bg.addColorStop(1, '#0d0f12');
  g.fillStyle = bg; g.fillRect(0, 0, 3072, 768);
  g.fillStyle = GOLD; g.fillRect(0, 22, 3072, 8); g.fillRect(0, 738, 3072, 8);
  g.textBaseline = 'alphabetic';
  if (img) { const h = 640, w = (img.width / img.height) * h; g.drawImage(img, 90, 64, w, h); }
  heavy(g, 'POST CIVIL WAR', 1850, 400, 300, 2100, CREAM, 0.04);
  heavy(g, 'CAR SHOWROOM  ·  ASABA', 1850, 600, 120, 1900, GOLD, 0.2);
});
// The mat by the doors: EXIT, and an arrow to the doors.
const matTexture = () => canvasTexture(512, 160, (g) => {
  g.fillStyle = '#121315'; g.fillRect(0, 0, 512, 160);
  g.strokeStyle = 'rgba(233,196,106,0.85)'; g.lineWidth = 6; g.strokeRect(10, 10, 492, 140);
  g.fillStyle = '#f2f2f0'; g.font = '800 74px "Helvetica Neue", Helvetica, Arial, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
  g.fillText('EXIT', 220, 84);
  g.beginPath(); g.moveTo(380, 50); g.lineTo(380, 118); g.lineTo(350, 118); g.lineTo(405, 140); g.lineTo(460, 118); g.lineTo(430, 118); g.lineTo(430, 50); g.closePath(); g.fill();
});
// Each car's plate: its name, its top speed, its price.
function plateTexture(car) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = '#0f1013'; g.fillRect(0, 0, 512, 256);
  g.fillStyle = GOLD; g.fillRect(0, 0, 512, 8);
  g.textBaseline = 'alphabetic'; g.fillStyle = '#ffffff';
  let px = 50; g.font = `800 ${px}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  while (g.measureText(car.name.toUpperCase()).width > 470 && px > 22) { px -= 2; g.font = `800 ${px}px "Helvetica Neue", Helvetica, Arial, sans-serif`; }
  g.fillText(car.name.toUpperCase(), 22, 86);
  g.fillStyle = '#b9bcc3'; g.font = '500 38px "Helvetica Neue", Helvetica, Arial, sans-serif';
  g.fillText(`Top speed ${car.kmh} km/h`, 22, 150);
  g.fillStyle = GOLD; g.font = '800 52px "Helvetica Neue", Helvetica, Arial, sans-serif';
  g.fillText(trText(car.price * 2).replace(/\.0$/, ''), 22, 222);
  const texture = new THREE.CanvasTexture(canvas); texture.encoding = THREE.sRGBEncoding; texture.anisotropy = 4;
  return texture;
}
// The hall's floor: large polished pale stone, with fine joints.
function floorTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const g = canvas.getContext('2d');
  for (let j = 0; j < 2; j += 1) for (let i = 0; i < 2; i += 1) {
    const k = 214 + ((i * 7 + j * 13) % 5) * 3;
    g.fillStyle = `rgb(${k},${k},${k - 4})`; g.fillRect(i * 256, j * 256, 256, 256);
    for (let n = 0; n < 40; n += 1) { const x = i * 256 + ((n * 97 + j * 31) % 256), y = j * 256 + ((n * 57 + i * 17) % 256); g.strokeStyle = `rgba(150,150,145,${0.05 + (n % 4) * 0.02})`; g.lineWidth = 1 + (n % 3); g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + 40, y + 10, x + 60, y - 20, x + 110, y + 15); g.stroke(); }
  }
  g.strokeStyle = 'rgba(120,122,128,0.5)'; g.lineWidth = 2;
  for (let k = 0; k <= 2; k += 1) { g.beginPath(); g.moveTo(k * 256, 0); g.lineTo(k * 256, 512); g.stroke(); g.beginPath(); g.moveTo(0, k * 256); g.lineTo(512, k * 256); g.stroke(); }
  const texture = new THREE.CanvasTexture(canvas); texture.encoding = THREE.sRGBEncoding; texture.anisotropy = 8;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

// ------------------------------------------------------------------------------------------- the forecourt --

function buildForecourt(group, { lite }) {
  // the paving over the whole compound, and the drive in a darker block from the gate to the doors
  const size = lite ? 512 : 1024;
  const grey = pavingTextures(size, { tone: [160, 156, 149], seed: 3 });
  const charcoal = pavingTextures(size, { tone: [86, 84, 82], spread: 10, seed: 7 });
  const plane = (x0, z0, x1, z1, tex, y, name) => {
    const w = x1 - x0, d = z1 - z0;
    const geo = new THREE.PlaneGeometry(w, d); geo.rotateX(-Math.PI / 2);
    // (the picture laid down in metres from the world's origin, so that the two kinds line up where they meet)
    const uv = geo.attributes.uv, pos = geo.attributes.position;
    for (let i = 0; i < uv.count; i += 1) uv.setXY(i, (pos.getX(i) + (x0 + x1) / 2) / BLOCK.metres, (pos.getZ(i) + (z0 + z1) / 2) / BLOCK.metres);
    const m = new THREE.Mesh(geo, surface({ map: tex.map, normalMap: tex.normalMap, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.82, metalness: 0 }));
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.receiveShadow = true; m.name = name;
    group.add(m);
    return m;
  };
  // (all round the hall, not over it: the hall's own floor is lower than the paving, and is seen through the glass)
  plane(C.x0, H.z1, C.x1, C.z1, grey, 0.03, 'carshow-paving');
  plane(C.x0, C.z0, C.x1, H.z0, grey, 0.03, 'carshow-paving');
  plane(C.x0, H.z0, H.x0, H.z1, grey, 0.03, 'carshow-paving');
  plane(H.x1, H.z0, C.x1, H.z1, grey, 0.03, 'carshow-paving');
  const dw = P.drive.width / 2;
  plane(G.x - dw, P.doors.z + 1, G.x + dw, C.z1, charcoal, 0.034, 'carshow-drive');
  plane(P.drive.fromRoad.x0, P.drive.fromRoad.z0, P.drive.fromRoad.x1, P.drive.fromRoad.z1, charcoal, 0.032, 'carshow-apron');
  // the bays either side of the drive, marked in white, and a kerb along the drive
  const paint = new Batch(), kerb = new Batch();
  for (const side of [-1, 1]) {
    for (let k = 0; k < 9; k += 1) {
      const x = G.x + side * (dw + 2.0 + k * 2.7);
      for (const z of [-92, -112]) paint.box(0.12, 0.012, 5.0, place(x, 0.046, z), 0xf4f4ef);
    }
    for (const z of [-89.5, -94.5, -109.5, -114.5]) paint.box(9 * 2.7, 0.012, 0.12, place(G.x + side * (dw + 2.0 + 4 * 2.7), 0.046, z), 0xf4f4ef);
    kerb.box(0.2, 0.14, C.z1 - P.doors.z - 3, place(G.x + side * (dw + 0.1), 0.07, (C.z1 + P.doors.z + 1) / 2), 0xd8d3c7);
  }
  const pm = paint.build(surface({ vertexColors: true, roughness: 0.6, metalness: 0 })); pm.receiveShadow = true; group.add(pm);
  const km = kerb.build(surface({ vertexColors: true, roughness: 0.85, metalness: 0 })); km.receiveShadow = true; km.castShadow = true; group.add(km);
  // the flag poles inside the gate, beside the drive: Nigeria's in the middle, the showroom's either side
  const poles = new Batch(), flags = P.forecourt.flags;
  for (const f of flags) poles.round(new THREE.CylinderGeometry(0.06, 0.1, f.h, 12), place(f.x, f.h / 2, f.z), 0xe7e9eb);
  const polesMesh = poles.build(surface({ vertexColors: true, roughness: 0.3, metalness: 0.7 })); polesMesh.castShadow = true; group.add(polesMesh);
  const flagMeshes = flags.map((f) => {
    const geo = new THREE.PlaneGeometry(2.4, 1.4, 12, 4); geo.translate(1.2, 0, 0);
    const tex = f.k === 1 ? canvasTexture(512, 300, (g) => { g.fillStyle = '#008751'; g.fillRect(0, 0, 171, 300); g.fillStyle = '#ffffff'; g.fillRect(171, 0, 170, 300); g.fillStyle = '#008751'; g.fillRect(341, 0, 171, 300); })
      : canvasTexture(512, 300, (g, img) => { g.fillStyle = '#101317'; g.fillRect(0, 0, 512, 300); if (img) { const h = 270, w = (img.width / img.height) * h; g.drawImage(img, (512 - w) / 2, 15, w, h); } });
    const m = new THREE.Mesh(geo, surface({ map: tex, side: THREE.DoubleSide, roughness: 0.9, metalness: 0 }));
    m.position.set(f.x, f.h - 0.85, f.z); m.castShadow = true;
    group.add(m);
    return { m, geo, base: geo.attributes.position.array.slice(), seed: f.k * 1.7 };
  });
  // palms in round planters along the front of the forecourt, and lamps along the drive
  const palms = new Batch(), fronds = new Batch(), lamps = new Batch(), heads = [];
  for (const q of P.forecourt.palms) {
    palms.round(new THREE.CylinderGeometry(q.r * 0.88, q.r, 0.6, 24), place(q.x, 0.3, q.z), 0xd6d0c4);
    palms.round(new THREE.CylinderGeometry(0.15, 0.22, q.h, 10), place(q.x, q.h / 2 + 0.3, q.z), 0x7b6a55);
    for (let k = 0; k < 9; k += 1) { const a = (k / 9) * Math.PI * 2; fronds.box(0.5, 0.04, 2.6, place(q.x + Math.sin(a) * 1.1, q.h + 0.1, q.z + Math.cos(a) * 1.1, a, 1, 1, 1, 0.35), k % 2 ? 0x3c7a35 : 0x4f8f3e); }
  }
  for (const q of P.forecourt.lamps) {
    lamps.round(new THREE.CylinderGeometry(0.06, 0.09, 6, 10), place(q.x, 3, q.z), 0x34383d);
    lamps.box(0.6, 0.08, 0.26, place(q.x - q.side * 0.3, 6.0, q.z), 0x34383d);
    heads.push({ x: q.x - q.side * 0.3, z: q.z });
  }
  const palmMesh = palms.build(surface({ vertexColors: true, roughness: 0.8, metalness: 0 })); palmMesh.castShadow = true; group.add(palmMesh);
  const frondMesh = fronds.build(surface({ vertexColors: true, roughness: 0.7, metalness: 0, side: THREE.DoubleSide })); frondMesh.castShadow = true; group.add(frondMesh);
  const lampMesh = lamps.build(surface({ vertexColors: true, roughness: 0.5, metalness: 0.5 })); lampMesh.castShadow = true; group.add(lampMesh);
  const lampGlow = new Batch();
  for (const h of heads) lampGlow.box(0.5, 0.03, 0.2, place(h.x, 5.95, h.z), 0xfff1c9);
  const glowMesh = lampGlow.build(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
  group.add(glowMesh);
  return { flags: flagMeshes, lampHeads: heads, textures: [grey, charcoal] };
}
// the flags move in the wind: a travelling wave along each, growing toward the free end
function waveFlags(flags, now) {
  for (const f of flags) {
    const pos = f.geo.attributes.position, b = f.base;
    for (let i = 0; i < pos.count; i += 1) { const x = b[i * 3]; pos.setZ(i, Math.sin(x * 2.3 - now * 4.2 + f.seed) * 0.12 * (x / 2.4) + Math.sin(x * 4.1 - now * 6.3) * 0.03 * (x / 2.4)); }
    pos.needsUpdate = true;
    f.geo.computeVertexNormals();
  }
}

// ------------------------------------------------------------------------------------------- the doors --

// The showroom's doors in the front of the podium: a dark frame, two glass leaves that slide apart as someone comes,
// a canopy over them with lights in it, and a mat before them.
function buildDoors(group) {
  const D = P.doors, z = D.z + 0.06;
  const fixed = new Batch();
  fixed.box(D.width + 1.6, D.height + 0.9, 0.12, place(D.x, (D.height + 0.9) / 2, z - 0.04), 0x1a1d22);        // the surround
  fixed.box(7.5, 0.22, 3.2, place(D.x, D.height + 1.0, z + 1.5), 0xe8e8e6);                                   // the canopy
  for (const s of [-1, 1]) fixed.round(new THREE.CylinderGeometry(0.07, 0.07, D.height + 0.9, 12), place(D.x + s * 3.5, (D.height + 0.9) / 2, z + 2.95), 0xb9bec4);
  const fm = fixed.build(surface({ vertexColors: true, roughness: 0.4, metalness: 0.5 })); fm.castShadow = true; fm.receiveShadow = true; group.add(fm);
  const lights = new Batch();
  for (const k of [-2.6, -0.9, 0.9, 2.6]) lights.round(new THREE.CylinderGeometry(0.11, 0.11, 0.02, 16), place(D.x + k, D.height + 0.885, z + 1.6), 0xfff4dd);
  group.add(lights.build(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })));
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fb8c4, transparent: true, opacity: 0.45, roughness: 0.03, metalness: 0.3, envMap: vehicleEnvironment() || null, side: THREE.DoubleSide, depthWrite: false });
  const steel = surface({ color: 0xc4c9ce, roughness: 0.3, metalness: 0.85 });
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
  group.name = 'carshow-hall';
  const solid = new Batch(), gloss = new Batch(), metal = new Batch(), glow = new Batch(), glassB = new Batch(), overhead = new Batch();
  const W = H.x1 - H.x0, D = H.z1 - H.z0, cx = (H.x0 + H.x1) / 2, cz = (H.z0 + H.z1) / 2, top = H.ceiling;
  const WHITE = 0xf3f3f0, GREY = 0x2b2f35, BRASS = 0xc9a24a;
  // the floor: large polished pale stone
  const tiles = floorTexture(); tiles.repeat.set(W / 3.2, D / 3.2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), surface({ map: tiles, color: 0xffffff, roughness: 0.14, metalness: 0.05, envMap: vehicleEnvironment() || null, envMapIntensity: 0.6 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0.012, cz); floor.receiveShadow = true; floor.name = 'carshow-floor';
  group.add(floor);
  // the ceiling, and lines of light across it
  overhead.box(W, 0.12, D, place(cx, top + 0.06, cz), WHITE);
  for (let i = 0; i < 9; i += 1) glow.box(0.16, 0.03, D - 3, place(H.x0 + (W * (i + 0.5)) / 9, top - 0.02, cz), 0xfffaf0);
  // the walls: white, a dark skirting; the back has the name on it
  const wall = (x, z, w, d) => { solid.box(w, top, d, place(x, top / 2, z), WHITE, 0.98); metal.box(w + 0.01, 0.14, d + 0.01, place(x, 0.07, z), GREY); };
  wall(cx, H.z0 + 0.1, W, 0.2);
  wall(H.x0 + 0.1, cz, 0.2, D);
  wall(H.x1 - 0.1, cz, 0.2, D);
  // the front: glass from the floor to the ceiling between steel mullions, with the doors
  const dz = H.z1 - 0.06, door = { x: P.doors.x, width: P.doors.width, height: P.doors.height };
  for (let x = H.x0 + 0.2; x <= H.x1 - 0.2 + 1e-6; x += (W - 0.4) / 30) metal.box(0.1, top, 0.14, place(x, top / 2, dz), GREY);
  metal.box(W, 0.18, 0.16, place(cx, top - 0.09, dz), GREY); metal.box(W, 0.1, 0.16, place(cx, 0.05, dz), GREY);
  const left = door.x - door.width / 2, right = door.x + door.width / 2;
  glassB.box(left - H.x0 - 0.2, top - 0.2, 0.03, place((H.x0 + 0.2 + left) / 2, top / 2, dz), 0xffffff);
  glassB.box(H.x1 - 0.2 - right, top - 0.2, 0.03, place((right + H.x1 - 0.2) / 2, top / 2, dz), 0xffffff);
  glassB.box(door.width, top - door.height - 0.2, 0.03, place(door.x, (door.height + top) / 2, dz), 0xffffff);
  for (const s of [-1, 1]) {
    glassB.box(door.width / 2 - 0.06, door.height - 0.08, 0.04, place(door.x + s * (door.width / 4), door.height / 2, dz - 0.02), 0xffffff);
    metal.box(0.06, door.height, 0.08, place(door.x + s * (door.width / 2), door.height / 2, dz - 0.02), GREY);
    metal.box(0.04, 1.3, 0.04, place(door.x + s * 0.18, 1.15, dz - 0.12), BRASS);
  }
  // EXIT over the doors, lit
  const exitSign = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.36), new THREE.MeshBasicMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 80; const g = c.getContext('2d'); g.fillStyle = '#0e5a35'; g.fillRect(0, 0, 256, 80); g.fillStyle = '#eafff2'; g.font = '800 46px "Helvetica Neue", Helvetica, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('EXIT', 128, 42); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t; })(), toneMapped: false }));
  exitSign.position.set(door.x, door.height + 0.5, dz - 0.09); exitSign.rotation.y = Math.PI;
  group.add(exitSign);
  const e = P.exit;
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(e.x1 - e.x0, e.z1 - e.z0), surface({ map: matTexture(), roughness: 0.9, metalness: 0 }));
  mat.rotation.x = -Math.PI / 2; mat.rotation.z = Math.PI; mat.position.set((e.x0 + e.x1) / 2, 0.02, (e.z0 + e.z1) / 2); mat.name = 'carshow-exit';
  group.add(mat);
  // the name on the back wall, lit from within
  const brand = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), new THREE.MeshBasicMaterial({ map: wallTexture(), toneMapped: false }));
  brand.position.set(cx, 4.2, H.z0 + 0.22); brand.name = 'carshow-wall';
  group.add(brand);
  metal.box(16.4, 4.4, 0.1, place(cx, 4.2, H.z0 + 0.15), GREY);
  glow.box(16, 0.05, 0.05, place(cx, 2.15, H.z0 + 0.24), 0xffe4a8);
  // the salesmen's desks against the end walls: white, a brass edge, a screen, a chair each side
  for (const d of P.desks) {
    const mx = (d.x0 + d.x1) / 2, mz = (d.z0 + d.z1) / 2, east = mx > cx ? 1 : -1;
    gloss.box(d.x1 - d.x0, 1.04, d.z1 - d.z0, place(mx, 0.52, mz), WHITE);
    metal.box(d.x1 - d.x0 + 0.08, 0.04, d.z1 - d.z0 + 0.08, place(mx, 1.06, mz), BRASS);
    solid.box(0.06, 0.38, 0.62, place(mx - east * 0.1, 1.3, mz - 0.8, 0, 1, 1, 1, 0, 0.12 * east), 0x15171a);
    for (const k of [-1, 1]) { solid.box(0.6, 0.06, 0.6, place(mx - east * 1.0, 0.5, mz + k * 1.1), 0x24262a); solid.box(0.08, 0.5, 0.6, place(mx - east * 1.27, 0.78, mz + k * 1.1), 0x24262a); }
  }
  // the lounge by the glass: a leather sofa, a glass table, two chairs, a rug
  const L = P.lounge, sofa = L.sofa;
  solid.box(sofa.x1 - sofa.x0, 0.42, sofa.z1 - sofa.z0, place((sofa.x0 + sofa.x1) / 2, 0.21, (sofa.z0 + sofa.z1) / 2), 0x2a1f1a);
  solid.box(0.22, 0.86, sofa.z1 - sofa.z0, place(sofa.x0 + 0.11, 0.43, (sofa.z0 + sofa.z1) / 2), 0x2a1f1a);
  solid.box(5.2, 0.012, 5.4, place((sofa.x0 + L.table.x1) / 2 + 0.6, 0.016, (sofa.z0 + sofa.z1) / 2), 0x6b6258);
  const t = L.table;
  glassB.box(t.x1 - t.x0, 0.03, t.z1 - t.z0, place((t.x0 + t.x1) / 2, 0.44, (t.z0 + t.z1) / 2), 0xffffff);
  for (const [a, b] of [[t.x0 + 0.06, t.z0 + 0.06], [t.x1 - 0.06, t.z0 + 0.06], [t.x0 + 0.06, t.z1 - 0.06], [t.x1 - 0.06, t.z1 - 0.06]]) metal.box(0.04, 0.43, 0.04, place(a, 0.215, b), BRASS);
  for (const c of L.chairs) { solid.box(0.72, 0.42, 0.72, place(c.x, 0.21, c.z), 0x3a2d26); solid.box(0.14, 0.42, 0.72, place(c.x + 0.29, 0.63, c.z), 0x3a2d26); }
  // plants in tall pots
  for (const p of P.plants) {
    gloss.round(new THREE.CylinderGeometry(0.28, 0.22, 0.6, 16), place(p.x, 0.3, p.z), 0x1d1f22);
    for (let k = 0; k < 7; k += 1) solid.round(new THREE.SphereGeometry(0.26 + (k % 3) * 0.05, 8, 6), place(p.x + Math.sin(k * 2.4) * 0.16, 0.85 + k * 0.17, p.z + Math.cos(k * 2.4) * 0.16), k % 2 ? 0x2f6b34 : 0x3d8040);
  }
  // the stands: round, white, a light round the foot, the plate in front; the turntable turns (its own mesh)
  const stands = [];
  for (const s of P.displays) {
    const h0 = s.stand === 'turntable' ? 0.22 : s.stand === 'hero' ? 0.2 : 0.14;
    if (s.stand !== 'turntable') {
      if (s.stand === 'hero') gloss.round(new THREE.CylinderGeometry(s.r + 0.25, s.r + 0.3, 0.08, 64), place(s.x, 0.04, s.z), WHITE);
      gloss.round(new THREE.CylinderGeometry(s.r, s.r * 1.015, h0, 64), place(s.x, h0 / 2, s.z), WHITE);
      glow.round(new THREE.TorusGeometry(s.r * 1.02, 0.025, 6, 96), place(s.x, 0.03, s.z, 0, 1, 1, 1, Math.PI / 2), 0xffd27a);
    } else glow.round(new THREE.TorusGeometry(s.r + 0.1, 0.035, 6, 96), place(s.x, 0.03, s.z, 0, 1, 1, 1, Math.PI / 2), 0xffd27a);
    const car = POWER_CARS[s.car];
    const a = s.h, px = s.x + Math.sin(a) * (s.r + 0.4), pz = s.z + Math.cos(a) * (s.r + 0.4);
    metal.box(0.05, 0.55, 0.05, place(px, 0.275, pz), GREY);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.35), new THREE.MeshBasicMaterial({ map: plateTexture(car), toneMapped: false }));
    plate.position.set(px, 0.62, pz); plate.rotation.set(-0.6, a, 0, 'YXZ');
    group.add(plate);
    stands.push({ display: s, top: h0 });
  }
  const turntable = P.displays.find((s) => s.stand === 'turntable');
  const spin = new THREE.Group(); spin.position.set(turntable.x, 0, turntable.z);
  const spinB = new Batch();
  spinB.round(new THREE.CylinderGeometry(turntable.r, turntable.r * 1.02, 0.22, 72), place(0, 0.11, 0), WHITE);
  spinB.round(new THREE.CylinderGeometry(turntable.r * 0.74, turntable.r * 0.74, 0.012, 72), place(0, 0.226, 0), 0xd8d9db);
  for (let k = 0; k < 8; k += 1) spinB.box(0.05, 0.012, turntable.r * 0.5, place(Math.sin((k * Math.PI) / 4) * turntable.r * 0.86, 0.227, Math.cos((k * Math.PI) / 4) * turntable.r * 0.86, (k * Math.PI) / 4), 0xc9a24a);
  const spinMesh = spinB.build(surface({ vertexColors: true, roughness: 0.15, metalness: 0.15 }));
  spinMesh.receiveShadow = true;
  spin.add(spinMesh);
  group.add(spin);
  const add = (batch, material, shadow) => { if (batch.empty) return null; const m = batch.build(material); m.receiveShadow = true; m.castShadow = !!shadow; group.add(m); return m; };
  add(solid, surface({ vertexColors: true, roughness: 0.75, metalness: 0.02 }), true);
  add(overhead, surface({ vertexColors: true, roughness: 0.9, metalness: 0 }), false);
  add(gloss, surface({ vertexColors: true, roughness: 0.14, metalness: 0.1 }), true);
  add(metal, surface({ vertexColors: true, roughness: 0.32, metalness: 0.75 }), false);
  add(glow, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), false);
  const glassMesh = add(glassB, new THREE.MeshStandardMaterial({ color: 0xbfd6e2, transparent: true, opacity: 0.16, roughness: 0.04, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false }), false);
  if (glassMesh) glassMesh.renderOrder = 3;
  return { group, stands, spin };
}

// ------------------------------------------------------------------------------------------------ the cars --

let shadowTexture = null;
function softShadow() {
  if (shadowTexture) return shadowTexture;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  r.addColorStop(0, 'rgba(0,0,0,0.6)'); r.addColorStop(0.6, 'rgba(0,0,0,0.3)'); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  shadowTexture = new THREE.CanvasTexture(c);
  return shadowTexture;
}
function makeDisplay(display, group, standTop, sheet) {
  const car = POWER_CARS[display.car];
  const imp = CAR_IMPOSTOR.cars[display.car];
  const picture = new THREE.Mesh(new THREE.PlaneGeometry(imp.size, imp.size), sheet.material);
  picture.name = `carshow-picture:${display.car}`;
  group.add(picture);
  const holder = new THREE.Group();
  holder.position.set(display.x, standTop, display.z);
  group.add(holder);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(car.width * 1.1, car.length * 1.05), new THREE.MeshBasicMaterial({ map: softShadow(), transparent: true, depthWrite: false, toneMapped: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.006; shadow.renderOrder = 1;
  holder.add(shadow);
  return { display, car, imp, picture, holder, shadow, standTop, frame: -1, model: null, loading: null, tier: null, heading: display.h };
}
function pickFrame(d, ex, ez) {
  const n = CAR_IMPOSTOR.frames;
  const a = Math.atan2(ex - d.display.x, ez - d.display.z) - d.heading;
  return ((Math.round(a / ((Math.PI * 2) / n)) % n) + n) % n;
}
function showFrame(d, k) {
  if (d.frame === k) return;
  d.frame = k;
  const { cols, rows } = CAR_IMPOSTOR;
  const c = k % cols, r = Math.floor(k / cols);
  const u0 = c / cols, u1 = (c + 1) / cols, v1 = 1 - r / rows, v0 = 1 - (r + 1) / rows;
  const uv = d.picture.geometry.attributes.uv;
  uv.setXY(0, u0, v1); uv.setXY(1, u1, v1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0);
  uv.needsUpdate = true;
}

// ------------------------------------------------------------------------------------------------ together --

// `maxTexture`: the largest picture the graphics take (or a phone's 2048); `lite`: a phone.
export function buildCarshow(scene, { lite = false, maxTexture = 0 } = {}) {
  const exterior = new THREE.Group(); exterior.name = 'carshow';
  scene.add(exterior);
  const outside = new THREE.Group(); outside.name = 'carshow-compound';            // what stays drawn from inside, through the glass
  scene.add(outside);
  // the compound itself (its paving, railings, gate, cameras, the showroom's doors and its name) is made the first
  // time it is asked for (`load`: once the town is ready, or at once for someone near), not while the game starts
  let court = null, fence = null, gate = null, cams = [], doors = null;
  function ensureOutside() {
    if (court) return;
    court = buildForecourt(outside, { lite });
    fence = buildFence(outside, { lite });
    gate = buildGate(outside);
    cams = buildCameras(outside);
    doors = buildDoors(exterior);
    makeSigns();
  }

  // the buildings: a plain shape each until its model is here
  const env = lite ? null : vehicleEnvironment();
  const buildings = P.buildings.map((b) => { const stand = standIn(b); exterior.add(stand); return { b, stand, mesh: null, failed: null, requested: false, retryAt: 0, triangles: 0 }; });
  function load(x, z) {
    ensureOutside();
    for (const e of buildings) {
      if (e.mesh || e.requested || ON_DISK) continue;
      if (performance.now() < e.retryAt) continue;
      // the villa is the largest file (76 MB): fetched only by someone near the compound
      const reach = e.b.id === 'villa' ? 320 : 900;
      if (x !== undefined && Math.hypot(e.b.x - x, e.b.z - z) > reach) continue;
      e.requested = true;
      // (five buildings stand here together, each with an 8192 picture: drawn at 4096 on a computer and 2048 on a phone,
      // as the motorcycles' and the cars' largest pictures are, they fit in a device's memory all at once; the
      // files are as supplied)
      loadBuilding(e.b, { maxTexture: Math.min(lite ? 2048 : 4096, maxTexture || 4096), env })
        .then(({ mesh, triangles }) => {
          mesh.position.set(e.b.x, 0, e.b.z); mesh.rotation.y = e.b.heading; mesh.scale.setScalar(e.b.scale);
          exterior.add(mesh); exterior.remove(e.stand);
          e.stand.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
          e.mesh = mesh; e.triangles = triangles; e.failed = null;
        })
        .catch((error) => { e.failed = String((error && error.message) || error); e.requested = false; e.retryAt = performance.now() + (error && error.offline ? 5000 : 30000); });
    }
  }

  // the name: standing on the podium over the doors, and at the top of the tower, facing the forecourt and the road
  const signs = [];
  function makeSigns() {
    const tex = nameTexture();
    const podiumTop = (S.podium || 0.2) * S.scale;
    const w = 30, h = w / 4;
    const at = { x: P.doors.x - 1.5, z: P.doors.z - 1.2 };
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false }));
    sign.position.set(at.x, podiumTop + 0.6 + h / 2, at.z); sign.name = 'carshow-name'; sign.renderOrder = 2;
    exterior.add(sign); signs.push(sign);
    const frame = new Batch();
    for (const k of [-0.45, -0.15, 0.15, 0.45]) frame.box(0.14, 0.9 + h * 0.3, 0.14, place(at.x + k * w, podiumTop + (0.9 + h * 0.3) / 2, at.z - 0.3), DARK);
    frame.box(w * 0.94, 0.16, 0.16, place(at.x, podiumTop + 0.7, at.z - 0.3), DARK);
    const T = S.tower, top = onBuilding(S, T.x, T.z), y = T.top * S.scale;
    for (const [dir, ry] of [[1, 0], [-1, Math.PI]]) {
      const crown = new THREE.Mesh(new THREE.PlaneGeometry(26, 6.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false }));
      crown.position.set(top.x, y + 0.8 + 3.25, top.z + dir * 0.3); crown.rotation.y = ry; crown.name = 'carshow-crown'; crown.renderOrder = 2;
      exterior.add(crown); signs.push(crown);
    }
    for (const k of [-0.4, 0, 0.4]) frame.box(0.16, 1.4, 0.16, place(top.x + k * 26, y + 0.7, top.z), DARK);
    exterior.add(frame.build(surface({ vertexColors: true, roughness: 0.4, metalness: 0.6 })));
  }

  // ---- inside ----
  let hall = null, displays = [], inside = false;
  const sheets = new Map();
  const sheetOf = (id) => {
    if (sheets.has(id)) return sheets.get(id);
    const texture = new THREE.Texture(); texture.encoding = THREE.sRGBEncoding; texture.anisotropy = 4;
    const img = new Image();
    const material = new THREE.MeshBasicMaterial({ map: texture, alphaTest: 0.5, toneMapped: false, side: THREE.DoubleSide });
    material.visible = false;
    img.onload = () => {
      let picture = img;
      if (lite) { const c = document.createElement('canvas'); c.width = img.width / 2; c.height = img.height / 2; const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, c.width, c.height); picture = c; }
      texture.image = picture; texture.needsUpdate = true; material.visible = true;
    };
    if (!ON_DISK) img.src = `assets/car-${id}-impostor.webp`;
    const sheet = { texture, material };
    sheets.set(id, sheet);
    return sheet;
  };
  function ensureHall() {
    if (hall) return hall;
    hall = buildHall();
    hall.group.visible = inside;
    scene.add(hall.group);
    displays = hall.stands.map((s) => makeDisplay(s.display, hall.group, s.top, sheetOf(s.display.car)));
    return hall;
  }
  // The models near the player: the nearest within `NEAR` at the device's own detail, the next at a phone's, the
  // rest pictures. One that is left far behind is let go.
  const NEAR = 12, FAR = 15;
  function updateDisplays(dt, { eye, player, now, models = lite ? 2 : 3 }) {
    const ranked = displays.map((d) => ({ d, gap: Math.hypot(d.display.x - player.x, d.display.z - player.z) - d.display.r })).sort((a, b) => a.gap - b.gap);
    ranked.forEach(({ d, gap }, rank) => {
      d.heading = d.display.stand === 'turntable' ? d.display.h + now * 0.18 : d.display.h;
      const want = !ON_DISK && rank < models && gap < NEAR ? (rank === 0 && !lite ? 'full' : 'lite') : null;
      const keep = d.model && rank < models + 1 && gap < FAR;
      if (want && (!d.model || (d.tier !== want && !d.loading)) && !d.loading && !(d.failedAt && performance.now() - d.failedAt < 15000)) {
        const tier = want;
        d.loading = loadCar(d.display.car, { base: 'cars/', lite: tier === 'lite', length: d.car.length })
          .then((model) => {
            d.loading = null;
            if (!inside || !hall) { model.dispose(); return; }
            if (d.model) d.model.dispose();
            d.model = model; d.tier = tier;
            model.pose({});
            d.holder.add(model.group);
          })
          .catch(() => { d.loading = null; d.failed = true; d.failedAt = performance.now(); });
      } else if (d.model && !want && !keep) { d.model.dispose(); d.model = null; d.tier = null; }
      d.holder.rotation.y = d.heading;
      const shown = !!d.model;
      d.picture.visible = !shown;
      if (!shown) {
        const c = d.imp.centre, ch = Math.cos(d.heading), sh = Math.sin(d.heading);
        const wx = d.display.x + c[0] * ch + c[2] * sh, wz = d.display.z - c[0] * sh + c[2] * ch;
        d.picture.position.set(wx, d.standTop + c[1], wz);
        d.picture.rotation.y = Math.atan2(eye.x - wx, eye.z - wz);
        showFrame(d, pickFrame(d, eye.x, eye.z));
      }
    });
    if (hall) hall.spin.rotation.y = displays.find((d) => d.display.stand === 'turntable').heading;
  }
  function dropModels() { for (const d of displays) { if (d.model) { d.model.dispose(); d.model = null; d.tier = null; } } }

  let gateShown = 0, doorsOpen = 0;
  return {
    exterior, outside,
    get buildings() { return buildings.map((e) => ({ id: e.b.id, loaded: !!e.mesh, failed: e.failed, triangles: e.triangles })); },
    get hall() { return hall; },
    get inside() { return inside; },
    signs,
    get gate() { return gate; }, get fence() { return fence; }, get cams() { return cams; }, get court() { return court; },
    load,
    // `on`: the player is in the hall. Outside, the hall is not drawn; inside, the showroom round it is not (the
    // compound stays: it is what the glass front shows)
    setInside(on) {
      if (on === inside) return;
      inside = on;
      if (on) ensureHall();
      if (hall) hall.group.visible = on;
      exterior.visible = !on;
      if (!on) dropModels();
    },
    // the first time someone comes near the doors, the hall is made (so that stepping in does not wait for it)
    near(x, z) { if (!hall && Math.hypot(x - P.doors.x, z - P.doors.z) < 60) { ensureOutside(); ensureHall(); } },
    // each frame: the gate (how far open the simulation has it, eased), the doors (open while someone is at them),
    // the cameras, the flags; inside, the cars
    tick(dt, { eye, player, now, people = [], gateOpen = 0, models }) {
      const nearCompound = !!court && Math.hypot(player.x - G.x, player.z - (C.z0 + C.z1) / 2) < 420;
      gateShown += (gateOpen - gateShown) * Math.min(1, dt * 8);
      if (nearCompound) {
        gate.set(gateShown);
        const atDoors = people.some((q) => Math.hypot(q.x - P.doors.x, q.z - (P.doors.z + 1.2)) < 3.2);
        doorsOpen = Math.max(0, Math.min(1, doorsOpen + (atDoors ? dt / 1.1 : -dt / 1.6)));
        doors.set(doorsOpen);
        turnCameras(cams, dt, now, people);
        if (!lite || Math.round(now * 30) % 2 === 0) waveFlags(court.flags, now);
      }
      if (inside && hall) updateDisplays(dt, { eye, player, now, models });
    },
    gateBoxes: () => carshowGateBoxes(gateShown),
    // for the checks: what is drawn as a model and what as a picture
    shown() { return displays.map((d) => ({ car: d.display.car, model: !!d.model, tier: d.tier, picture: d.picture.visible, frame: d.frame, loaded: carLoaded(d.display.car, d.tier === 'lite') })); },
    state: () => ({ built: !!court, gate: gateShown, doors: doorsOpen, cams: cams.map((c) => ({ yaw: +c.yaw.toFixed(3), lit: c.glow.material.opacity > 0 })) }),
  };
}
