// A real inside for the cars whose models are closed shells (5 November 2026, the owner's brief, part 3: "front seats
// shaped like real ones (cushion, backrest with side bolsters, headrest), and a back seat with headrests in four-door
// cars; a dashboard across the whole width under the windscreen, with dials behind the wheel (lit at night), a centre
// screen, air vents and the glovebox; the steering wheel on its column where the driver's hands go ... turning as the car
// steers; a centre console with the gear lever and the handbrake; pedals; carpet and mats; the inside of every door
// (armrest, handle, speaker, window switches); the roof lining, the pillars' trim, the parcel shelf, the mirror inside,
// the sun visors ... Each car gets its own trim to suit it ... Fitted so nothing pokes through the body or the glass ...
// the cabin is closed at the front and the back ... Inside is darker than outside ... No real brand logos anywhere
// inside: the middle of the steering wheel carries our rising sun or nothing").
//
// Made here, in the game, of the game's own shapes: nothing of the owner's files is touched. Every cabin is made to its
// car's measures (tools/vehicles/driver_seats.py: where the driver's hips, hands and feet go and the roof over them;
// tools/vehicles/cabin_fit.py: how wide the body is inside at each height along it) in metres, and drawn in the car's
// own frame. Its parts are one shape (one draw), the steering wheel another (it turns), and the dials, the screen and
// the lamp over the door that glow at night a third (only those three ever change).
//
//   const cabin = makeCabin(id, spec, { scale, lite })     scale: metres to a unit of the car's model
//   carCabinGroup.add(cabin.group)
//   cabin.steer(angle)          radians the front wheels are turned (left positive)
//   cabin.light({ night, on, door })   the dials and screen lit (the engine running at night), the roof lamp (a door open)
//   cabin.dispose()

import { Batch } from './render-kit.js';
import { TWO_DOORS } from '../sim/car-doors.js';

// Each car's trim (the brief's examples, and the same care for the rest): its upholstery, its stitching, the dashboard,
// the carpet, the roof lining, and any wood or metal.
export const TRIMS = Object.freeze({
  'state-limousine': { seat: 0xd9ccb0, stitch: 0x8a6a40, dash: 0x2c2420, wood: 0x6b3a1f, carpet: 0x3a3028, roof: 0xe2d8c4, metal: 0xb8b2a6, leather: true },
  'black-luxury-suv': { seat: 0x161515, bolster: 0x8a5a32, stitch: 0x8a5a32, dash: 0x141414, wood: 0x3a2a1e, carpet: 0x1c1b1a, roof: 0x2a2826, metal: 0x9a9a9a, leather: true },
  'camo-expedition': { seat: 0x4b5232, stitch: 0x2a2e1e, dash: 0x23251e, carpet: 0x1e1f1b, roof: 0x55574a, metal: 0x6a6c64, fabric: true, mats: 0x111111 },
  'mint-sports-coupe': { seat: 0x111214, stitch: 0x8fd3c5, dash: 0x121314, carpet: 0x151617, roof: 0x1c1d1f, metal: 0xa9b0b4, leather: true },
  'black-pickup': { seat: 0x4a4c4e, stitch: 0x2e2f30, dash: 0x2a2b2c, carpet: 0x232425, roof: 0x6a6b6c, metal: 0x7a7c7e, fabric: true, mats: 0x141414 },
  'blue-off-roader': { seat: 0x45484b, stitch: 0x2a2c2e, dash: 0x26282a, carpet: 0x222324, roof: 0x5f6164, metal: 0x7a7c80, fabric: true, mats: 0x151515 },
  'black-square-suv': { seat: 0x3d3e40, stitch: 0x262728, dash: 0x1f2021, carpet: 0x1d1e1f, roof: 0x55575a, metal: 0x8a8c8e, fabric: true },
  'grey-grand-tourer': { seat: 0x6b2a24, stitch: 0x2a1512, dash: 0x1a1a1b, wood: 0x2e2a28, carpet: 0x1c1c1d, roof: 0x3a3a3b, metal: 0xb0b0b4, leather: true },
  'grey-saloon': { seat: 0x3a3c40, stitch: 0x24262a, dash: 0x1d1e20, carpet: 0x1e1f21, roof: 0x8c8c88, metal: 0x9a9ca0, fabric: true },
  'midnight-saloon': { seat: 0x1c1f2a, stitch: 0x5a6a8a, dash: 0x16171b, carpet: 0x18191d, roof: 0x34353a, metal: 0xa0a4ac, leather: true },
});
const PLAIN = Object.freeze({ seat: 0x3a3b3e, stitch: 0x26272a, dash: 0x1e1f21, carpet: 0x1e1f21, roof: 0x7a7a78, metal: 0x909296, fabric: true });

// The look of leather or cloth: a small picture of its grain and its seams, tiled over every soft part (shared by all).
let grain = null;
function grainPicture() {
  if (grain) return grain;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const img = g.createImageData(128, 128);
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 128 * 128; i += 1) {
    const v = 200 + Math.floor(rnd() * 40);
    img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // (soft creases across, and a seam each way: the panels of a seat)
  g.strokeStyle = 'rgba(120,120,120,0.55)'; g.lineWidth = 1.2;
  for (const y of [32, 96]) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke(); }
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.setLineDash([3, 3]);
  for (const y of [29, 35, 93, 99]) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke(); }
  grain = new THREE.CanvasTexture(c);
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.colorSpace = THREE.SRGBColorSpace;
  return grain;
}

// The dials and the screen: a picture of two round dials and a screen, shared by all, lit from within at night.
let faces = null;
function facesPicture() {
  if (faces) return faces;
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#050607'; g.fillRect(0, 0, 256, 128);
  for (const cx of [44, 128]) {
    g.strokeStyle = '#d8f4ff'; g.lineWidth = 3; g.beginPath(); g.arc(cx, 56, 36, Math.PI * 0.75, Math.PI * 2.25); g.stroke();
    for (let k = 0; k <= 10; k += 1) { const a = Math.PI * 0.75 + (k / 10) * Math.PI * 1.5; g.beginPath(); g.moveTo(cx + Math.cos(a) * 30, 56 + Math.sin(a) * 30); g.lineTo(cx + Math.cos(a) * 36, 56 + Math.sin(a) * 36); g.stroke(); }
    g.strokeStyle = '#ff6a3a'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx, 56); g.lineTo(cx + Math.cos(Math.PI * 1.1) * 30, 56 + Math.sin(Math.PI * 1.1) * 30); g.stroke();
  }
  // the screen: a map of roads in the game's own greys, and the time
  g.fillStyle = '#0f1a20'; g.fillRect(184, 14, 66, 100);
  g.strokeStyle = '#4f7d8c'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(190, 100); g.lineTo(230, 40); g.lineTo(246, 30); g.stroke();
  g.beginPath(); g.moveTo(196, 60); g.lineTo(246, 76); g.stroke();
  g.fillStyle = '#ffd36a'; g.beginPath(); g.arc(214, 70, 4, 0, Math.PI * 2); g.fill();
  faces = new THREE.CanvasTexture(c);
  faces.colorSpace = THREE.SRGBColorSpace;
  return faces;
}

// A rounded slab: `w` wide (x), `h` high (y), `d` deep (z), its corners rounded by `r`, lying with its depth along z.
const slabs = new Map();
function slab(w, h, d, r) {
  const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${r.toFixed(3)}`;
  if (slabs.has(key)) return slabs.get(key);
  const rr = Math.min(r, w / 2 - 0.001, h / 2 - 0.001);
  const s = new THREE.Shape();
  const x0 = -w / 2 + rr, x1 = w / 2 - rr, y0 = -h / 2 + rr, y1 = h / 2 - rr;
  s.moveTo(x0, -h / 2); s.lineTo(x1, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, y0); s.lineTo(w / 2, y1);
  s.quadraticCurveTo(w / 2, h / 2, x1, h / 2); s.lineTo(x0, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, y1);
  s.lineTo(-w / 2, y0); s.quadraticCurveTo(-w / 2, -h / 2, x0, -h / 2);
  const bevel = Math.min(rr * 0.8, d / 3);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, d - 2 * bevel), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -(d - 2 * bevel) / 2);
  slabs.set(key, g);
  return g;
}

// `id` the car, `spec` its measures (car-parts.js), `scale` metres to a unit of its model.
export function makeCabin(id, spec, { scale, lite = false } = {}) {
  const d = spec.driver;
  if (!d) return null;
  const T = { ...PLAIN, ...(TRIMS[id] || {}) };
  const m = (v) => v * scale;                         // the model's units to metres
  const hip = d.hip.map(m), wheel = d.wheel.map(m), feet = d.feet.map((f) => f.map(m));
  const roof = d.roof ? m(d.roof) : m(spec.height) * 0.94;
  const half = m(spec.body) / 2;
  const four = !TWO_DOORS.has(id);
  // inside the body: a little in from its sides (its skin and the doors' thickness), and the floor under the feet
  const inner = half * 0.84;
  const floor = Math.min(feet[0][1], feet[1][1]) - 0.05;
  const belt = hip[1] + (roof - hip[1]) * 0.4;
  // where things are along the car (z, metres): the front seats' backs, the dashboard's face, the rear bench
  const backZ = hip[2] - 0.17;
  const dashZ = wheel[2] + 0.12;
  const rearZ = hip[2] - (four ? 0.86 : 0.62);
  const B = new Batch({ uv: 'keep' });
  const at = (x, y, z, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(1, 1, 1));
  const box = (w, h, dd, x, y, z, hex, rx = 0, ry = 0, rz = 0) => B.box(w, h, dd, at(x, y, z, rx, ry, rz), hex);
  const soft = (w, h, dd, r, x, y, z, hex, rx = 0, ry = 0, rz = 0) => B.round(slab(w, h, dd, r), at(x, y, z, rx, ry, rz), hex);

  // ---- a seat: cushion, backrest with bolsters, headrest, its frame down to the floor
  const seat = (x, z, wide = 0.5, high = true) => {
    const top = hip[1] - 0.06;                                // the cushion's top, a little under the hips
    const back = 0.32;                                        // radians the backrest leans back
    soft(wide, 0.13, 0.5, 0.05, x, top - 0.065, z + 0.1, T.seat, -0.08);
    // (the cushion's side bolsters)
    for (const s of [-1, 1]) soft(0.08, 0.1, 0.46, 0.035, x + s * (wide / 2 - 0.03), top - 0.02, z + 0.1, T.bolster || T.seat, -0.08);
    const bh = Math.min(0.62, roof - top - 0.18);
    const by = top + bh / 2 * Math.cos(back), bz = z - 0.18 - bh / 2 * Math.sin(back);
    soft(wide, bh, 0.12, 0.05, x, by, bz, T.seat, -back);
    for (const s of [-1, 1]) soft(0.08, bh * 0.85, 0.16, 0.035, x + s * (wide / 2 - 0.03), by - bh * 0.04, bz + 0.03, T.bolster || T.seat, -back);
    // (the stitching down the middle of the cushion and the back)
    box(0.006, 0.004, 0.42, x, top + 0.001, z + 0.1, T.stitch, -0.08);
    if (high) {
      const hy = top + bh * Math.cos(back) + 0.13, hz = z - 0.18 - bh * Math.sin(back) - 0.03;
      soft(0.26, 0.19, 0.1, 0.05, x, hy, hz, T.seat, -back * 0.6);
      for (const s of [-1, 1]) box(0.012, 0.09, 0.012, x + s * 0.08, hy - 0.12, hz + 0.01, T.metal, -back);
    }
    // (its frame and rails, dark, to the floor)
    box(wide * 0.8, Math.max(0.02, top - 0.13 - floor), 0.42, x, (top - 0.13 + floor) / 2, z + 0.08, 0x111112);
  };
  seat(hip[0], hip[2]);
  seat(-hip[0], hip[2]);
  // ---- the back seat: a bench across, two headrests; small seats in a two-door car where there is room
  if (four) {
    const w = inner * 2 - 0.08;
    const top = hip[1] - 0.04;
    soft(w, 0.13, 0.48, 0.05, 0, top - 0.065, rearZ + 0.1, T.seat, -0.06);
    soft(w, Math.min(0.58, roof - top - 0.2), 0.14, 0.05, 0, top + 0.27, rearZ - 0.2, T.seat, -0.3);
    for (const s of [-1, 1]) soft(0.26, 0.18, 0.1, 0.05, s * hip[0], top + 0.62, rearZ - 0.31, T.seat, -0.2);
    box(w - 0.1, 0.004, 0.004, 0, top + 0.001, rearZ + 0.1, T.stitch);
    box(w, Math.max(0.02, top - 0.13 - floor), 0.44, 0, (top - 0.13 + floor) / 2, rearZ + 0.08, 0x111112);
  } else if (rearZ - 0.3 > -m(spec.length) / 2 + 0.6) {
    for (const s of [-1, 1]) soft(0.42, 0.1, 0.36, 0.04, s * hip[0], hip[1] - 0.09, rearZ + 0.08, T.seat, -0.06);
    soft(inner * 2 - 0.1, 0.42, 0.1, 0.04, 0, hip[1] + 0.12, rearZ - 0.12, T.seat, -0.35);
  }

  // ---- the dashboard: across the whole width, its top under the windscreen's foot, its face to the cabin
  const dashTop = Math.min(belt + 0.04, wheel[1] + 0.16);
  const dashLow = wheel[1] - 0.26;
  soft(inner * 2, dashTop - dashLow, 0.42, 0.06, 0, (dashTop + dashLow) / 2, dashZ + 0.2, T.dash);
  // (its upper edge rolled toward the windscreen, and a strip of wood or metal across its face)
  soft(inner * 2 - 0.04, 0.05, 0.5, 0.025, 0, dashTop, dashZ + 0.24, T.dash, 0.12);
  box(inner * 2 - 0.12, 0.035, 0.01, 0, dashLow + (dashTop - dashLow) * 0.45, dashZ - 0.012, T.wood || T.metal);
  // (the hood over the dials behind the wheel, and the dials' bezel)
  soft(0.36, 0.09, 0.2, 0.04, hip[0], dashTop + 0.02, dashZ + 0.06, T.dash, 0.25);
  // (the centre stack: the screen's frame, the vents, the glovebox's line on the passenger's side)
  box(0.3, 0.2, 0.03, 0, dashLow + (dashTop - dashLow) * 0.7, dashZ - 0.01, 0x0b0b0c, -0.12);
  for (const x of [-0.11, 0.11, -inner + 0.12, inner - 0.12]) {
    box(0.13, 0.05, 0.02, x, dashLow + (dashTop - dashLow) * 0.42, dashZ - 0.012, 0x101011);
    for (let k = 0; k < 3; k += 1) box(0.12, 0.004, 0.01, x, dashLow + (dashTop - dashLow) * 0.42 - 0.016 + k * 0.016, dashZ - 0.02, T.metal);
  }
  box(0.42, 0.004, 0.006, -hip[0], dashLow + (dashTop - dashLow) * 0.32, dashZ - 0.012, 0x0c0c0d);
  box(0.005, 0.16, 0.006, -hip[0] - 0.21, dashLow + (dashTop - dashLow) * 0.24, dashZ - 0.012, 0x0c0c0d);
  box(0.06, 0.012, 0.012, -hip[0] + 0.12, dashLow + (dashTop - dashLow) * 0.3, dashZ - 0.02, T.metal);
  // (the firewall under it, down to the floor, closing the cabin at the front)
  box(inner * 2, Math.max(0.05, dashLow - floor), 0.04, 0, (dashLow + floor) / 2, dashZ + 0.3, 0x141415);

  // ---- the centre console between the seats: the gear lever, the handbrake, the armrest
  const cy = hip[1] - 0.06;
  soft(0.2, Math.max(0.05, cy - floor), dashZ - backZ, 0.03, 0, (cy + floor) / 2, (dashZ + backZ) / 2, T.dash);
  soft(0.19, 0.06, 0.32, 0.025, 0, cy + 0.04, backZ + 0.2, T.seat);
  B.round(new THREE.CylinderGeometry(0.008, 0.012, 0.13, 8), at(0, cy + 0.06, hip[2] + 0.32, -0.2), T.metal);
  B.round(new THREE.SphereGeometry(0.025, 10, 8), at(0, cy + 0.13, hip[2] + 0.31), 0x0d0d0e);
  box(0.035, 0.03, 0.2, 0.05, cy + 0.02, hip[2] + 0.05, 0x101011, 0.18);

  // ---- the pedals under the driver's feet, the carpet and mats, the closing panel behind the seats
  for (const [k, f] of feet.entries()) box(0.07, 0.11, 0.015, f[0], f[1] + 0.03, f[2] + 0.04, T.metal, -0.5);
  box(0.06, 0.1, 0.015, hip[0] + 0.12, feet[0][1] + 0.05, feet[0][2], 0x111112, -0.6);
  const floorLen = dashZ + 0.3 - (rearZ - 0.35);
  box(inner * 2, 0.02, floorLen, 0, floor - 0.01, (dashZ + 0.3 + rearZ - 0.35) / 2, T.carpet);
  if (T.mats) for (const z of [hip[2] + 0.38, ...(four ? [rearZ + 0.42] : [])]) for (const s of [-1, 1]) box(0.42, 0.006, 0.5, s * hip[0], floor + 0.004, z, T.mats);
  box(inner * 2, Math.max(0.1, belt + 0.1 - floor), 0.03, 0, (belt + 0.1 + floor) / 2, rearZ - 0.38, T.carpet);
  // (the parcel shelf behind the back seat, in a saloon)
  box(inner * 2, 0.015, 0.36, 0, belt + 0.08, rearZ - 0.55, T.dash);

  // ---- the roof lining, the visors, the mirror
  const liningZ0 = rearZ - 0.4, liningZ1 = dashZ - 0.05;
  box(inner * 2, 0.02, liningZ1 - liningZ0, 0, roof - 0.015, (liningZ0 + liningZ1) / 2, T.roof);
  for (const s of [-1, 1]) box(0.32, 0.012, 0.15, s * hip[0], roof - 0.04, dashZ - 0.12, T.roof, 0.15);
  box(0.024, 0.05, 0.02, 0, roof - 0.05, dashZ - 0.05, 0x101010);
  box(0.24, 0.06, 0.015, 0, roof - 0.1, dashZ - 0.06, 0x18181a);
  // (the pillars' trim either side of the windscreen and behind the front doors, inside the body's)
  for (const s of [-1, 1]) {
    box(0.04, roof - belt, 0.05, s * (inner - 0.02), (roof + belt) / 2, dashZ - 0.02, T.roof, -0.45);
    if (four) box(0.05, roof - belt, 0.08, s * (inner - 0.02), (roof + belt) / 2, (hip[2] + rearZ) / 2 - 0.06, T.roof);
  }

  // ---- the doors' insides: an armrest, a handle, a speaker, the window switches; the panel down to the floor
  const door = (s, z0, z1) => {
    const x = s * (inner + 0.02), zc = (z0 + z1) / 2, len = z1 - z0;
    box(0.03, Math.max(0.1, belt - floor), len, x, (belt + floor) / 2, zc, T.dash);
    soft(0.07, 0.04, len * 0.45, 0.015, x - s * 0.04, hip[1] + 0.12, zc - len * 0.05, T.seat);
    box(0.015, 0.02, 0.1, x - s * 0.025, hip[1] + 0.22, zc + len * 0.25, T.metal);
    B.round(new THREE.CylinderGeometry(0.07, 0.07, 0.01, 18), at(x - s * 0.02, floor + 0.16, zc + len * 0.18, 0, 0, Math.PI / 2), 0x0d0d0e);
    box(0.04, 0.01, 0.07, x - s * 0.05, hip[1] + 0.145, zc + len * 0.15, 0x0b0b0c);
  };
  door(1, hip[2] - 0.35, dashZ - 0.05); door(-1, hip[2] - 0.35, dashZ - 0.05);
  if (four) { door(1, rearZ - 0.3, hip[2] - 0.38); door(-1, rearZ - 0.3, hip[2] - 0.38); }

  const material = new THREE.MeshStandardMaterial({ vertexColors: true, map: grainPicture(), roughness: T.leather ? 0.62 : 0.92, metalness: 0 });
  // (inside is darker than outside: the roof shades it)
  material.color.setScalar(0.82);
  const mesh = B.build(material);
  mesh.name = 'car-cabin';
  mesh.castShadow = false; mesh.receiveShadow = false;

  // ---- the steering wheel on its column, turning with the steering
  const steering = new THREE.Group();
  steering.position.set(wheel[0], wheel[1], wheel[2]);
  steering.rotation.order = 'YXZ'; steering.rotation.x = -(d.tilt || 0.38);
  const W = new Batch({ uv: 'keep' });
  const R = m(d.radius || 0.038);
  W.round(new THREE.TorusGeometry(R, 0.017, 10, 36), new THREE.Matrix4(), 0x121213);
  for (const a of [Math.PI / 2, Math.PI * 7 / 6, -Math.PI / 6]) W.box(R * 0.9, 0.022, 0.012, new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * R * 0.45, Math.sin(a) * R * 0.45, 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a), new THREE.Vector3(1, 1, 1)), 0x1a1a1b);
  W.round(new THREE.CylinderGeometry(R * 0.32, R * 0.36, 0.04, 20), new THREE.Matrix4().makeRotationX(Math.PI / 2), 0x151516);
  // (our rising sun in the middle: a half disc of gold rays)
  for (let k = 0; k < 7; k += 1) { const a = Math.PI * (0.1 + 0.8 * k / 6); W.box(0.004, R * 0.18, 0.004, new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * R * 0.12, Math.sin(a) * R * 0.12 - R * 0.05, -0.022), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a - Math.PI / 2), new THREE.Vector3(1, 1, 1)), 0xc9a227); }
  W.round(new THREE.CylinderGeometry(0.03, 0.035, 0.32, 10), new THREE.Matrix4().compose(new THREE.Vector3(0, 0, 0.17), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2), new THREE.Vector3(1, 1, 1)), 0x101011);
  const wheelMesh = W.build(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.1 }));
  wheelMesh.name = 'car-steering';
  steering.add(wheelMesh);

  // ---- what glows at night: the dials, the screen, and the lamp over the cabin while a door is open
  const glowMaterial = new THREE.MeshBasicMaterial({ map: facesPicture(), color: 0x2a2a2a, toneMapped: false });
  const G = new Batch({ uv: 'keep' });
  const faceAt = (w, h, x, y, z, u0, u1) => {
    const g = new THREE.PlaneGeometry(w, h); g.rotateY(Math.PI);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i += 1) uv.setX(i, u0 + (u1 - u0) * (1 - uv.getX(i)));
    G.add(g, at(x, y, z), 0xffffff);
  };
  faceAt(0.26, 0.11, hip[0], dashTop - 0.04, dashZ + 0.04, 0, 0.68);
  faceAt(0.25, 0.17, 0, dashLow + (dashTop - dashLow) * 0.7, dashZ - 0.028, 0.7, 1);
  const glow = G.build(glowMaterial);
  glow.name = 'car-dials';
  const lamp = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.08), new THREE.MeshBasicMaterial({ color: 0xfff1d0, toneMapped: false }));
  lamp.rotation.x = Math.PI / 2; lamp.position.set(0, roof - 0.03, (hip[2] + rearZ) / 2); lamp.visible = false;

  const group = new THREE.Group();
  group.name = 'car-inside';
  group.add(mesh, steering, glow, lamp);
  // (in the car's own units: everything here was made in metres)
  group.scale.setScalar(1 / scale);
  return {
    group,
    steer(angle) { steering.rotation.z = Math.max(-1.6, Math.min(1.6, -angle * 1.4)); },
    light({ night = 0, on = false, door = false } = {}) {
      const k = on ? 0.25 + 0.75 * night : 0.08;
      glowMaterial.color.setScalar(k);
      lamp.visible = door && night > 0.3;
    },
    dispose() { mesh.geometry.dispose(); material.dispose(); wheelMesh.geometry.dispose(); wheelMesh.material.dispose(); glow.geometry.dispose(); glowMaterial.dispose(); lamp.geometry.dispose(); lamp.material.dispose(); },
  };
}
