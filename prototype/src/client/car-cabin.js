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
//   const cabin = makeCabin(id, spec, { scale, lite, fit, doors })   scale: metres to a unit of the car's model; fit: its
//                               room inside (car-windows.js); doors: its doors as the body cuts them (car-model.js)
//   carCabinGroup.add(cabin.group)              (in the car's own units; made in metres)
//   cabin.doors.get('fl')       the inside of a door (armrest, handle, speaker, switches), in metres from the car's
//                               middle as the rest: put on the door's hinge, drawn while a door is open
//   cabin.open(any)             a door open (each door's inside drawn on its own) or every door shut (one draw)
//   cabin.steer(angle)          radians the front wheels are turned (left positive)
//   cabin.light({ night, on, door })   the dials and screen lit (the engine running at night), the roof lamp (a door open)
//   cabin.dispose()
//
//   const dials = makeDials(id, CAR_DIALS[id])   a car with a cabin of its own: lit dials on its own dashboard (its
//                               units), with the same light(), detail() and dispose()

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
export const PLAIN = Object.freeze({ seat: 0x3a3b3e, stitch: 0x26272a, dash: 0x1e1f21, carpet: 0x1e1f21, roof: 0x7a7a78, metal: 0x909296, fabric: true });

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


// The room inside a car's shell, from its fit (tools/vehicles/windows.py `fit_of`: its half width at a grid of places
// along it and heights, how high its top is over its middle line, and the lowest its top is across the middle two
// fifths of its width), in metres: `room(z, y)` how far out its side is there (null where nothing was found),
// `topAt(z)` how high its roof, glass or bonnet is over the middle line, `lowAt(z)` the lowest of it across the middle.
function shellRoom(fit, scale) {
  if (!fit) return { room: () => null, topAt: () => null, lowAt: () => null, lowLeast: () => null, roofAt: () => null };
  const zs = fit.z, ys = fit.y;
  const find = (list, v) => { if (v <= list[0]) return [0, 0, 0]; const n = list.length - 1; if (v >= list[n]) return [n, n, 0]; let i = 0; while (list[i + 1] < v) i += 1; return [i, i + 1, (v - list[i]) / (list[i + 1] - list[i])]; };
  const room = (z, y) => {
    const [z0, z1, fz] = find(zs, z / scale), [y0, y1, fy] = find(ys, y / scale);
    const at = (a, b) => fit.half[a][b];
    const vals = [[at(z0, y0), (1 - fz) * (1 - fy)], [at(z1, y0), fz * (1 - fy)], [at(z0, y1), (1 - fz) * fy], [at(z1, y1), fz * fy]].filter(([v]) => v !== null);
    if (!vals.length) return null;
    // (the nearest of the four where the shell is narrower: never out past it)
    const w = vals.reduce((s, [, k]) => s + k, 0);
    const mean = w > 0 ? vals.reduce((s, [v, k]) => s + v * k, 0) / w : vals[0][0];
    return Math.min(mean, ...vals.filter(([, k]) => k > 0.25).map(([v]) => v)) * scale;
  };
  // (`careful`: the lower of the two measured places either side, not the line between them: where the top drops
  // quickly between them, an upright windscreen's foot, the line runs over the glass; 6 November 2026, the Black
  // Square SUV's dashboard's rolled edge a centimetre through its windscreen)
  const along = (list, careful = false) => (z) => {
    const [z0, z1, fz] = find(zs, z / scale);
    const a = list[z0], b = list[z1];
    if (a === null && b === null) return null;
    if (careful) return (a === null ? b : b === null ? a : Math.min(a, b)) * scale;
    return (a === null ? b : b === null ? a : Math.min(a + (b - a) * fz, Math.max(a, b))) * scale;
  };
  const topAt = along(fit.top);
  // (how high the roof is at a place along the car and out from its middle line: the lowest of the measured places
  // round it, where the roof curves down to its edges)
  const roofAt = (z, x) => {
    if (!fit.roof || !fit.roofX) return topAt(z);
    const [z0, z1] = find(zs, z / scale), [x0, x1] = find(fit.roofX, Math.abs(x) / scale);
    const v = [fit.roof[z0][x0], fit.roof[z0][x1], fit.roof[z1][x0], fit.roof[z1][x1]].filter((q) => q !== null);
    return v.length ? Math.min(...v) * scale : topAt(z);
  };
  return { room, topAt, lowAt: fit.low ? along(fit.low) : topAt, lowLeast: along(fit.low || fit.top, true), roofAt };
}

// `id` the car, `spec` its measures (car-parts.js), `scale` metres to a unit of its model; `fit` its room inside;
// `doors` its doors as the body cuts them: { key, side, front, rear } (the model's units along it).
// (one cabin's shapes for each model, made the first time one is wanted and shared by every car of it: `makeCabin`)
const made = new Map();
export function makeCabin(id, spec, { scale, lite = false, fit = null, doors = [] } = {}) {
  if (!spec.driver) return null;
  const key = `${id}|${scale.toFixed(5)}|${doors.map((q) => q.key).join('')}|${lite ? 'lite' : 'full'}`;
  let shared = made.get(key);
  if (!shared) { shared = { ...buildCabin(id, spec, { scale, lite, fit, doors }), users: 0 }; made.set(key, shared); }
  shared.users += 1;
  // this car's own: its meshes of the shared shapes, its steering wheel's turn, its dials' and lamp's light
  const mesh = new THREE.Mesh(shared.whole, shared.material); mesh.name = 'car-cabin';
  const restMesh = new THREE.Mesh(shared.rest, shared.material); restMesh.name = 'car-cabin'; restMesh.visible = false;
  const doorMeshes = new Map();
  for (const [k, g] of shared.doors) { const dm = new THREE.Mesh(g, shared.material); dm.name = 'car-cabin-door'; doorMeshes.set(k, dm); }
  const steering = new THREE.Group();
  steering.position.fromArray(shared.wheelAt);
  steering.rotation.order = 'YXZ'; steering.rotation.x = -shared.tilt;
  const wheelMesh = new THREE.Mesh(shared.wheel, shared.wheelMaterial); wheelMesh.name = 'car-steering';
  steering.add(wheelMesh);
  const glowMaterial = new THREE.MeshBasicMaterial({ map: facesPicture(), color: 0x2a2a2a, toneMapped: false });
  const glow = new THREE.Mesh(shared.glow, glowMaterial); glow.name = 'car-dials';
  const lamp = new THREE.Mesh(shared.lampShape, new THREE.MeshBasicMaterial({ color: 0xfff1d0, toneMapped: false }));
  lamp.rotation.x = Math.PI / 2; lamp.position.fromArray(shared.lampAt); lamp.visible = false;
  for (const o of [mesh, restMesh, wheelMesh, glow, lamp, ...doorMeshes.values()]) { o.castShadow = false; o.receiveShadow = false; }
  const group = new THREE.Group();
  group.name = 'car-inside';
  group.add(mesh, restMesh, steering, glow, lamp);
  // (in the car's own units: everything here was made in metres)
  group.scale.setScalar(1 / scale);
  let detail = 2, open = false;
  const show = () => { mesh.visible = detail > 0 && !open; restMesh.visible = detail > 0 && open; for (const dm of doorMeshes.values()) dm.visible = detail > 0 && open; steering.visible = detail > 1; glow.visible = detail > 1; };
  let gone = false;
  return {
    group, doors: doorMeshes, measures: shared.measures,
    open(any) { open = any; show(); },
    // how much of it is drawn: 2 all of it (near), 1 the seats, the dashboard and the rest as one shape (further), 0
    // nothing (far off, where the glass mostly gives back the sky)
    detail(level) { if (level === detail) return; detail = level; show(); },
    steer(angle) { steering.rotation.z = Math.max(-1.6, Math.min(1.6, -angle * 1.4)); },
    light({ night = 0, on = false, door = false } = {}) {
      const k = on ? 0.25 + 0.75 * night : 0.08;
      glowMaterial.color.setScalar(k);
      lamp.visible = door && night > 0.3 && detail > 0;
    },
    dispose() {
      if (gone) return; gone = true;
      glowMaterial.dispose(); lamp.material.dispose();
      shared.users -= 1;
      if (shared.users <= 0 && made.get(key) === shared) { made.delete(key); for (const g of [shared.whole, shared.rest, ...shared.doors.values(), shared.wheel, shared.glow, shared.lampShape]) g.dispose(); shared.material.dispose(); shared.wheelMaterial.dispose(); }
    },
  };
}

// The lit dials of a car whose model has a cabin of its own (6 November 2026, the brief's part 3: "keep their own seats and
// steering wheels exactly as made; add ... only what's missing (the doors' insides, lit dials), in the same style"): the
// same picture of two dials as our cabins', put where tools/vehicles/dials.py found the dashboard beyond the wheel, facing
// the driver's eyes. Its light is added over the model's own paint (the dark between the rings adds nothing), so with
// the engine off the model's dashboard is seen as it was made; lit as our cabins' are (the engine running, brighter at
// night) and drawn near only. One shape a model, shared by every car of it.
const dialShapes = new Map();
export function makeDials(id, { at, facing, size }) {
  let shared = dialShapes.get(id);
  if (!shared) {
    const g = new THREE.PlaneGeometry(size, size * 0.48);
    // (the picture's two dials only: its left 0.68, and its rows from 14 to 98 of 128)
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * 0.68, 0.234 + uv.getY(i) * 0.656);
    shared = { geometry: g, users: 0 };
    dialShapes.set(id, shared);
  }
  shared.users += 1;
  const material = new THREE.MeshBasicMaterial({ map: facesPicture(), color: 0x000000, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const mesh = new THREE.Mesh(shared.geometry, material); mesh.name = 'car-dials';
  mesh.castShadow = false; mesh.receiveShadow = false;
  // (facing the eyes, level across the car: its picture's right to the driver's right)
  const z = new THREE.Vector3().fromArray(facing).normalize();
  const x = new THREE.Vector3(0, 1, 0).cross(z).normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  mesh.position.fromArray(at);
  mesh.visible = false;
  let detail = 2, k = 0, gone = false;
  const show = () => { mesh.visible = detail > 1 && k > 0; };
  return {
    mesh,
    light({ night = 0, on = false } = {}) { k = on ? 0.25 + 0.75 * night : 0; material.color.setScalar(k); show(); },
    detail(level) { if (level === detail) return; detail = level; show(); },
    dispose() {
      if (gone) return; gone = true;
      material.dispose();
      shared.users -= 1;
      if (shared.users <= 0 && dialShapes.get(id) === shared) { dialShapes.delete(id); shared.geometry.dispose(); }
    },
  };
}

function buildCabin(id, spec, { scale, lite = false, fit = null, doors = [] } = {}) {
  const d = spec.driver;
  const T = { ...PLAIN, ...(TRIMS[id] || {}) };
  const m = (v) => v * scale;                         // the model's units to metres
  const hip = d.hip.map(m), wheel = d.wheel.map(m), feet = d.feet.map((f) => f.map(m));
  const roof = d.roof ? m(d.roof) : m(spec.height) * 0.94;
  const half = m(spec.body) / 2;
  const four = !TWO_DOORS.has(id);
  const shell = shellRoom(fit, scale);
  // inside the body: in from its sides by its skin and the doors' thickness (`edge`), where the shell was measured;
  // elsewhere a share of its width
  const EDGE = 0.045;
  const inside = (z, y) => { const r = shell.room(z, y); return r === null ? half * 0.84 : Math.max(0.2, r - EDGE); };
  // the narrowest the inside is over a stretch along the car and of heights
  // (looked at every 8 cm or so: the floor's two metres along the car read at five places missed where the Blue
  // Off-Roader's lower body tucks in behind its doors, 6 November 2026)
  const insideOver = (z0, z1, y0, y1) => { let w = Infinity; const nz = Math.max(4, Math.ceil(Math.abs(z1 - z0) / 0.08)), ny = Math.max(2, Math.ceil(Math.abs(y1 - y0) / 0.08)); for (let i = 0; i <= nz; i += 1) for (let j = 0; j <= ny; j += 1) w = Math.min(w, inside(z0 + (z1 - z0) * i / nz, y0 + (y1 - y0) * j / ny)); return w; };
  // under the roof (or the glass) over a stretch along the car, less `gap`
  // (`across`: under it across the middle of its width, where a curved bonnet or windscreen is lower at its sides: for
  // what spans the width under them, the dashboard and the firewall)
  const under = (z0, z1, gap = 0.02, across = false) => { let t = Infinity; for (let i = 0; i <= 6; i += 1) { const v = (across === 'careful' ? shell.lowLeast : across ? shell.lowAt : shell.topAt)(z0 + (z1 - z0) * i / 6); if (v !== null) t = Math.min(t, v); } return Number.isFinite(t) ? t - gap : roof; };
  const floor = Math.min(feet[0][1], feet[1][1]) - 0.05;
  const belt = hip[1] + (roof - hip[1]) * 0.4;
  // where things are along the car (z, metres): the front seats' backs, the dashboard's face, the rear bench
  const backZ = hip[2] - 0.17;
  const dashZ = wheel[2] + 0.12;
  const rearZ = hip[2] - (four ? 0.86 : 0.62);
  const B = new Batch({ uv: 'keep' });
  const at = (x, y, z, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(1, 1, 1));
  const box = (w, h, dd, x, y, z, hex, rx = 0, ry = 0, rz = 0) => B.box(w, h, dd, at(x, y, z, rx, ry, rz), hex);
  // (a phone's cabin, 6 November 2026: its soft parts plain boxes, a tenth of the triangles, where a rounded slab's
  // edges are too small on its screen to be seen; Stage 3 put a cabin in every car of the showroom's twenty)
  const soft = lite ? (w, h, dd, r, x, y, z, hex, rx = 0, ry = 0, rz = 0) => box(w, h, dd, x, y, z, hex, rx, ry, rz)
    : (w, h, dd, r, x, y, z, hex, rx = 0, ry = 0, rz = 0) => B.round(slab(w, h, dd, r), at(x, y, z, rx, ry, rz), hex);

  // ---- a seat: cushion, backrest with bolsters, headrest, its frame down to the floor; no wider than the room beside it
  const seatTop = hip[1] - 0.06;                              // the cushion's top, a little under the hips
  const seat = (x, z, wideAsked = 0.5, high = true) => {
    const top = seatTop;
    const back = 0.32;                                        // radians the backrest leans back
    const room = insideOver(z - 0.35, z + 0.35, top - 0.1, top + 0.5);
    const wide = Math.max(0.36, Math.min(wideAsked, 2 * (room - Math.abs(x)) - 0.02, 2 * Math.abs(x) - 0.06));
    soft(wide, 0.13, 0.5, 0.05, x, top - 0.065, z + 0.1, T.seat, -0.08);
    // (the cushion's side bolsters)
    for (const s of [-1, 1]) soft(0.08, 0.1, 0.46, 0.035, x + s * (wide / 2 - 0.03), top - 0.02, z + 0.1, T.bolster || T.seat, -0.08);
    const bh = Math.max(0.3, Math.min(0.62, under(z - 0.35, z) - top - 0.18));
    const by = top + bh / 2 * Math.cos(back), bz = z - 0.18 - bh / 2 * Math.sin(back);
    soft(wide, bh, 0.12, 0.05, x, by, bz, T.seat, -back);
    for (const s of [-1, 1]) soft(0.08, bh * 0.85, 0.16, 0.035, x + s * (wide / 2 - 0.03), by - bh * 0.04, bz + 0.03, T.bolster || T.seat, -back);
    // (the stitching down the middle of the cushion and the back)
    box(0.006, 0.004, 0.42, x, top + 0.001, z + 0.1, T.stitch, -0.08);
    if (high) {
      const hy = Math.min(top + bh * Math.cos(back) + 0.13, under(z - 0.45, z - 0.2) - 0.11), hz = z - 0.18 - bh * Math.sin(back) - 0.03;
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
    const top = hip[1] - 0.04;
    const w = 2 * insideOver(rearZ - 0.3, rearZ + 0.35, top - 0.1, top + 0.45) - 0.04;
    const bh = Math.max(0.3, Math.min(0.58, under(rearZ - 0.4, rearZ) - top - 0.2));
    soft(w, 0.13, 0.48, 0.05, 0, top - 0.065, rearZ + 0.1, T.seat, -0.06);
    soft(w, bh, 0.14, 0.05, 0, top + bh / 2 - 0.02, rearZ - 0.2, T.seat, -0.3);
    const hy = Math.min(top + bh + 0.04, under(rearZ - 0.45, rearZ - 0.2) - 0.11);
    for (const s of [-1, 1]) soft(0.26, 0.18, 0.1, 0.05, s * Math.min(hip[0], w / 2 - 0.16), hy, rearZ - 0.31, T.seat, -0.2);
    box(w - 0.1, 0.004, 0.004, 0, top + 0.001, rearZ + 0.1, T.stitch);
    box(w, Math.max(0.02, top - 0.13 - floor), 0.44, 0, (top - 0.13 + floor) / 2, rearZ + 0.08, 0x111112);
  } else if (rearZ - 0.3 > -m(spec.length) / 2 + 0.6) {
    const w = 2 * insideOver(rearZ - 0.2, rearZ + 0.25, hip[1] - 0.15, hip[1] + 0.3) - 0.04;
    for (const s of [-1, 1]) soft(Math.min(0.42, w / 2 - 0.02), 0.1, 0.36, 0.04, s * Math.min(hip[0], w / 4), hip[1] - 0.09, rearZ + 0.08, T.seat, -0.06);
    soft(w - 0.06, Math.max(0.2, Math.min(0.42, under(rearZ - 0.3, rearZ) - hip[1] - 0.12)), 0.1, 0.04, 0, hip[1] + 0.12, rearZ - 0.12, T.seat, -0.35);
  }

  // ---- the dashboard: across the whole width, its top under the windscreen's foot, its face to the cabin; no deeper
  // than the windscreen leaves room for over it
  const dashLow = wheel[1] - 0.26;
  let dashDeep = 0.42;
  let dashTop = Math.min(belt + 0.04, wheel[1] + 0.16);
  for (let k = 0; k < 8 && dashDeep > 0.16 && under(dashZ, dashZ + dashDeep, 0.03, 'careful') < dashTop; k += 1) dashDeep -= 0.04;
  dashTop = Math.min(dashTop, under(dashZ, dashZ + dashDeep, 0.03, 'careful'));
  const dashWide = 2 * insideOver(dashZ, dashZ + dashDeep, dashLow, dashTop);
  soft(dashWide, dashTop - dashLow, dashDeep, 0.06, 0, (dashTop + dashLow) / 2, dashZ + dashDeep / 2, T.dash);
  // (its upper edge rolled toward the windscreen, and a strip of wood or metal across its face)
  soft(dashWide - 0.04, 0.05, Math.max(0.12, dashDeep * 0.9), 0.025, 0, dashTop - 0.02, dashZ + dashDeep * 0.5, T.dash, 0.12);
  box(dashWide - 0.12, 0.035, 0.01, 0, dashLow + (dashTop - dashLow) * 0.45, dashZ - 0.012, T.wood || T.metal);
  // (the hood over the dials behind the wheel, and the dials' bezel)
  soft(0.36, 0.09, 0.2, 0.04, hip[0], Math.min(dashTop + 0.02, under(dashZ, dashZ + 0.2, 0.06, true)), dashZ + 0.06, T.dash, 0.25);
  // (the centre stack: the screen's frame, the vents, the glovebox's line on the passenger's side)
  box(0.3, 0.2, 0.03, 0, dashLow + (dashTop - dashLow) * 0.7, dashZ - 0.01, 0x0b0b0c, -0.12);
  for (const x of [-0.11, 0.11, -dashWide / 2 + 0.12, dashWide / 2 - 0.12]) {
    box(0.13, 0.05, 0.02, x, dashLow + (dashTop - dashLow) * 0.42, dashZ - 0.012, 0x101011);
    for (let k = 0; k < 3; k += 1) box(0.12, 0.004, 0.01, x, dashLow + (dashTop - dashLow) * 0.42 - 0.016 + k * 0.016, dashZ - 0.02, T.metal);
  }
  box(0.42, 0.004, 0.006, -hip[0], dashLow + (dashTop - dashLow) * 0.32, dashZ - 0.012, 0x0c0c0d);
  box(0.005, 0.16, 0.006, -hip[0] - 0.21, dashLow + (dashTop - dashLow) * 0.24, dashZ - 0.012, 0x0c0c0d);
  box(0.06, 0.012, 0.012, -hip[0] + 0.12, dashLow + (dashTop - dashLow) * 0.3, dashZ - 0.02, T.metal);
  // (the firewall in front of the footwell, from the floor up to the dashboard's top; and the dashboard's top carried on
  // forward to the windscreen's foot, low under the glass: the cabin closed at the front, the engine never seen, and
  // through the windscreen the dashboard's top, not a wall behind the glass. A wall up to the glass was first tried: on
  // the SUV, whose windscreen's foot is a third of a metre ahead of the dashboard, it stood behind half the windscreen)
  const fireZ = dashZ + dashDeep;
  const fireTop = Math.min(dashTop, under(fireZ - 0.02, fireZ + 0.04, 0.005, true));
  const fireWide = 2 * insideOver(fireZ - 0.05, fireZ + 0.05, floor, fireTop);
  box(fireWide, Math.max(0.05, fireTop - floor), 0.04, 0, (fireTop + floor) / 2, fireZ, 0x141415);
  // (where the glass comes down to the dashboard's height, ahead of it: no further than eight tenths of a metre)
  let deckEnd = fireZ;
  for (let z = fireZ; z < fireZ + 0.8; z += 0.025) { const low = shell.lowAt(z); if (low === null || low < dashTop + 0.02) break; deckEnd = z; }
  if (deckEnd > fireZ + 0.02) {
    const deckWide = 2 * insideOver(fireZ, deckEnd, dashTop - 0.04, dashTop);
    box(deckWide, 0.03, deckEnd - fireZ + 0.02, 0, dashTop - 0.015, (fireZ + deckEnd) / 2, T.dash);
  }

  // ---- the centre console between the seats: the gear lever, the handbrake, the armrest
  const cy = hip[1] - 0.06;
  soft(0.2, Math.max(0.05, cy - floor), dashZ - backZ, 0.03, 0, (cy + floor) / 2, (dashZ + backZ) / 2, T.dash);
  soft(0.19, 0.06, 0.32, 0.025, 0, cy + 0.04, backZ + 0.2, T.seat);
  B.round(new THREE.CylinderGeometry(0.008, 0.012, 0.13, 8), at(0, cy + 0.06, hip[2] + 0.32, -0.2), T.metal);
  B.round(new THREE.SphereGeometry(0.025, 10, 8), at(0, cy + 0.13, hip[2] + 0.31), 0x0d0d0e);
  box(0.035, 0.03, 0.2, 0.05, cy + 0.02, hip[2] + 0.05, 0x101011, 0.18);

  // ---- the pedals under the driver's feet, the carpet and mats, the closing panel behind the seats
  for (const f of feet) box(0.07, 0.11, 0.015, f[0], f[1] + 0.03, f[2] + 0.04, T.metal, -0.5);
  box(0.06, 0.1, 0.015, hip[0] + 0.12, feet[0][1] + 0.05, feet[0][2], 0x111112, -0.6);
  const floorBack = rearZ - 0.35;
  // (read down to its own underside, and kept 3 cm in from the sides: where the shell curves in under the doors its
  // skin is not always found sideways, 6 November 2026)
  const floorWide = 2 * insideOver(floorBack, fireZ, floor - 0.02, floor + 0.1) - 0.06;
  box(floorWide, 0.02, fireZ - floorBack, 0, floor - 0.01, (fireZ + floorBack) / 2, T.carpet);
  // (each mat inside the floor's room where it lies: the Blue Off-Roader's lower body tucks in behind its doors, and a
  // mat at the hips' width stood out through it, 6 November 2026)
  if (T.mats) for (const z of [hip[2] + 0.38, ...(four ? [rearZ + 0.42] : [])]) for (const s of [-1, 1]) { const room = insideOver(z - 0.25, z + 0.25, floor - 0.01, floor + 0.02); const half = Math.min(0.21, Math.max(0.06, (room - 0.04) / 2)); box(2 * half, 0.006, 0.5, s * Math.min(hip[0], room - half - 0.01), floor + 0.004, z, T.mats); }
  // (behind the back seat: a panel up to the back glass's foot and the parcel shelf over the boot, so that the boot is
  // never seen)
  const shelfZ = rearZ - 0.38;
  const shelfY = Math.min(belt + 0.08, under(shelfZ - 0.36, shelfZ, 0.03));
  const panelWide = 2 * insideOver(shelfZ - 0.02, shelfZ + 0.02, floor, shelfY);
  box(panelWide, Math.max(0.1, shelfY - floor), 0.03, 0, (shelfY + floor) / 2, shelfZ, T.carpet);
  box(2 * insideOver(shelfZ - 0.36, shelfZ, shelfY - 0.02, shelfY + 0.02), 0.015, 0.36, 0, shelfY, shelfZ - 0.18, T.dash);

  // ---- the roof lining, the visors, the mirror: under the roof everywhere along it
  const liningZ0 = rearZ - 0.4, liningZ1 = dashZ - 0.05;
  const liningY = under(liningZ0 + 0.1, liningZ1 - 0.1, 0.012) ;
  const roofIn = Math.min(roof, liningY);
  const liningHalf = insideOver(liningZ0, liningZ1, roofIn - 0.08, roofIn);
  // (in strips out from the middle line, each leaning from under the roof at its inner edge to under it at its outer,
  // where the roof is lowest at each along the lining: it follows the roof's curve down to its edges, and a chord under
  // a roof curved up is under the roof all across)
  const roofOver = (x, z0, z1, gap) => { let t = roofIn; for (let i = 0; i <= 8; i += 1) { const r = shell.roofAt(z0 + (z1 - z0) * i / 8, x); if (r !== null) t = Math.min(t, r - gap); } return t; };
  // (and in lengths along the car, each under the roof where it is lowest along that length: over the front seats as
  // high as the roof is there, lower toward the back where a sloping roof comes down)
  const STRIPS = lite ? 4 : 8, LENGTHS = lite ? 3 : 5, pieces = [];
  for (let j = 0; j < LENGTHS; j += 1) {
    const z0 = liningZ0 + (liningZ1 - liningZ0) * j / LENGTHS, z1 = liningZ0 + (liningZ1 - liningZ0) * (j + 1) / LENGTHS;
    const edges = [];
    for (let k = 0; k <= STRIPS; k += 1) { const x = liningHalf * k / STRIPS; edges.push({ x, t: roofOver(x, z0, z1, 0.012) }); }
    pieces.push({ z0, z1, edges });
    for (let k = 0; k < STRIPS; k += 1) {
      const a = edges[k], b = edges[k + 1], dx = b.x - a.x, dt = b.t - a.t, wide = Math.hypot(dx, dt) + 0.004, tilt = Math.atan2(dt, dx);
      // (its top face from a's height to b's: the plate's middle a half thickness under the line between them)
      const mx = (a.x + b.x) / 2 + 0.01 * Math.sin(tilt), my = (a.t + b.t) / 2 - 0.01 * Math.cos(tilt);
      for (const s of [-1, 1]) box(wide, 0.02, z1 - z0 + 0.004, s * mx, my, (z0 + z1) / 2, T.roof, 0, 0, s * tilt);
    }
  }
  // (the lining's top, at a place along the car and across)
  const liningAt = (x, z) => {
    const p = pieces.find((q) => z >= q.z0 && z <= q.z1) || (z < liningZ0 ? pieces[0] : pieces[LENGTHS - 1]);
    const e = p.edges, ax = Math.abs(x);
    for (let k = 0; k < STRIPS; k += 1) if (ax <= e[k + 1].x) { const f = (ax - e[k].x) / Math.max(1e-6, e[k + 1].x - e[k].x); return e[k].t + (e[k + 1].t - e[k].t) * f; }
    return e[STRIPS].t;
  };
  // (the visors over the front seats, in from the glass where the roof narrows at the windscreen's top, within the
  // lining, and under the roof where it curves down over their outer ends)
  const visorOut = Math.min(hip[0] + 0.16, liningHalf - 0.03, insideOver(dashZ - 0.2, dashZ - 0.04, roofIn - 0.06, roofIn - 0.02) + 0.02);
  const visorWide = Math.max(0.16, Math.min(0.32, visorOut - 0.06));
  const visorY = Math.min(roofIn - 0.035, roofOver(visorOut, dashZ - 0.2, dashZ - 0.04, 0.035));
  for (const s of [-1, 1]) box(visorWide, 0.012, 0.15, s * (visorOut - visorWide / 2), visorY, dashZ - 0.12, T.roof, 0.15);
  // (the mirror on its stalk under the roof's front edge where it hangs: an upright windscreen's top is lower than the
  // roof behind it, and the stalk stood through the Camo Expedition's, 6 November 2026)
  const mirrorTop = Math.min(roofIn, under(dashZ - 0.08, dashZ - 0.03, 0.005, 'careful'));
  box(0.024, 0.05, 0.02, 0, mirrorTop - 0.025, dashZ - 0.05, 0x101010);
  box(0.24, 0.06, 0.015, 0, mirrorTop - 0.075, dashZ - 0.06, 0x18181a);
  // (the pillars, as seen from a seat, are the body's own, drawn from inside as the dark trim (car-glass.js): pieces of
  // trim set against them, first tried, stood in the windscreen's and the side windows' view as a staircase of blocks
  // where the glass leans in, the SUV's most)
  // ---- seat belts across whoever sits in front: from the pillar over the shoulder to the buckle
  for (const s of [-1, 1]) {
    const x0 = s * (inside(hip[2] - 0.1, belt + 0.25) - 0.03), y0 = Math.min(roofIn - 0.12, belt + 0.3), z0 = hip[2] - 0.18;
    box(0.045, 0.004, 0.25, x0 - s * 0.02, y0 - 0.12, z0, 0x161617, 0.9);
  }

  // ---- the doors' insides (last, each door's together: it swings with its door): an armrest, a handle, a speaker,
  // the window switches, the panel from the floor to the window's foot, as the door the body cuts runs along the car
  const ranges = new Map();
  const startOf = () => B.positions.length / 3;
  const restCount = startOf();
  const doorList = doors.length ? doors.map((q) => ({ key: q.key, side: q.side, z0: m(q.rear), z1: m(q.front), bottom: q.bottom ? m(q.bottom) : null }))
    : [{ key: 'fl', side: 1, z0: hip[2] - 0.35, z1: dashZ - 0.05 }, { key: 'fr', side: -1, z0: hip[2] - 0.35, z1: dashZ - 0.05 }, ...(four ? [{ key: 'rl', side: 1, z0: rearZ - 0.3, z1: hip[2] - 0.38 }, { key: 'rr', side: -1, z0: rearZ - 0.3, z1: hip[2] - 0.38 }] : [])];
  for (const q of doorList) {
    const from = startOf();
    const s = q.side, z0 = q.z0 + 0.03, z1 = q.z1 - 0.03, zc = (z0 + z1) / 2, len = Math.max(0.2, z1 - z0);
    // (in from the side all the way down to the floor: the Blue Off-Roader's lower body tucks in under its doors, 6
    // November 2026)
    // (down to the door's own bottom, where the body cuts it: over a step along the side, 6 November 2026)
    const low = q.bottom !== null && q.bottom !== undefined ? Math.max(floor, q.bottom + 0.01) : floor;
    const x = s * (insideOver(z0, z1, low, belt) + 0.005);
    box(0.03, Math.max(0.1, belt - low), len, x, (belt + low) / 2, zc, T.dash);
    soft(0.07, 0.04, len * 0.45, 0.015, x - s * 0.04, hip[1] + 0.12, zc - len * 0.05, T.seat);
    box(0.015, 0.02, 0.1, x - s * 0.025, hip[1] + 0.22, zc + len * 0.25, T.metal);
    B.round(new THREE.CylinderGeometry(0.07, 0.07, 0.01, 18), at(x - s * 0.02, Math.max(floor + 0.16, low + 0.09), zc + len * 0.18, 0, 0, Math.PI / 2), 0x0d0d0e);
    box(0.04, 0.01, 0.07, x - s * 0.05, hip[1] + 0.145, zc + len * 0.15, 0x0b0b0c);
    ranges.set(q.key, { from, count: startOf() - from });
  }

  const material = new THREE.MeshStandardMaterial({ vertexColors: true, map: grainPicture(), roughness: T.leather ? 0.62 : 0.92, metalness: 0 });
  // (inside is darker than outside: the roof shades it)
  material.color.setScalar(0.62);
  const whole = B.build(material).geometry;
  // (the cabin without its doors' insides, and each door's: the same points, each drawing its own stretch of them;
  // bounded as the whole, made before the page lets the points go)
  const part = (from, count) => { const q = new THREE.BufferGeometry(); for (const [name, a] of Object.entries(whole.attributes)) q.setAttribute(name, a); q.setDrawRange(from, count); q.boundingSphere = whole.boundingSphere.clone(); return q; };
  const rest = part(0, restCount);
  const doorShapes = new Map();
  for (const [key, r] of ranges) doorShapes.set(key, part(r.from, r.count));

  // ---- the steering wheel on its column, turning with the steering
  const W = new Batch({ uv: 'keep' });
  const R = m(d.radius || 0.038);
  W.round(new THREE.TorusGeometry(R, 0.017, lite ? 6 : 10, lite ? 20 : 36), new THREE.Matrix4(), 0x121213);
  for (const a of [Math.PI / 2, Math.PI * 7 / 6, -Math.PI / 6]) W.box(R * 0.9, 0.022, 0.012, new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * R * 0.45, Math.sin(a) * R * 0.45, 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a), new THREE.Vector3(1, 1, 1)), 0x1a1a1b);
  W.round(new THREE.CylinderGeometry(R * 0.32, R * 0.36, 0.04, 20), new THREE.Matrix4().makeRotationX(Math.PI / 2), 0x151516);
  // (our rising sun in the middle: a half disc of gold rays)
  for (let k = 0; k < 7; k += 1) { const a = Math.PI * (0.1 + 0.8 * k / 6); W.box(0.004, R * 0.18, 0.004, new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * R * 0.12, Math.sin(a) * R * 0.12 - R * 0.05, -0.022), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a - Math.PI / 2), new THREE.Vector3(1, 1, 1)), 0xc9a227); }
  W.round(new THREE.CylinderGeometry(0.03, 0.035, 0.32, 10), new THREE.Matrix4().compose(new THREE.Vector3(0, 0, 0.17), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2), new THREE.Vector3(1, 1, 1)), 0x101011);
  const wheelMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.1 });
  const wheelShape = W.build(wheelMaterial).geometry;

  // ---- what glows at night: the dials and the screen (each car's own light on them: makeCabin)
  const G = new Batch({ uv: 'keep' });
  const faceAt = (w, h, x, y, z, u0, u1) => {
    const pg = new THREE.PlaneGeometry(w, h); pg.rotateY(Math.PI);
    const uv = pg.attributes.uv;
    for (let i = 0; i < uv.count; i += 1) uv.setX(i, u0 + (u1 - u0) * (1 - uv.getX(i)));
    G.add(pg, at(x, y, z), 0xffffff);
  };
  faceAt(0.26, 0.11, hip[0], Math.min(dashTop - 0.04, under(dashZ, dashZ + 0.1, 0.1, true)), dashZ + 0.04, 0, 0.68);
  faceAt(0.25, 0.17, 0, dashLow + (dashTop - dashLow) * 0.7, dashZ - 0.028, 0.7, 1);
  const glowShape = G.build(new THREE.MeshBasicMaterial()).geometry;

  // where things are, for the tests and for seating people (metres, the car's frame from its middle, its ground)
  // (`overHead`: the lining's underside over a front seat's head (the lower of it over the head's two sides), where it
  // follows the roof's curve down: the highest a head may come there)
  const headZ = hip[2] - 0.12;
  const overHead = Math.min(liningAt(hip[0] - 0.08, headZ), liningAt(hip[0] + 0.08, headZ), liningAt(hip[0], headZ - 0.12), liningAt(hip[0], headZ + 0.1)) - 0.02;
  const measures = { seatTop, floor, roof: roofIn, overHead, belt, dashZ, dashTop, dashDeep, fireZ, shelfZ, shelfY, rearZ, hip, wheel };
  return {
    whole, rest, doors: doorShapes, material, wheel: wheelShape, wheelMaterial, wheelAt: [wheel[0], wheel[1], wheel[2]], tilt: d.tilt || 0.38,
    glow: glowShape, lampShape: new THREE.PlaneGeometry(0.16, 0.08), lampAt: [0, roofIn - 0.025, (hip[2] + rearZ) / 2], measures,
  };
}
