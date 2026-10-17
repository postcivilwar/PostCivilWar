// HOLARIS Watch: a three-storey house of glass, where the wristwatch is sold.
//
// The rest of the town is walls and pitched roofs of corrugated sheet. This is not: a dark steel frame, floor
// to ceiling glass on every side, three floors of lit showroom that can be seen into from the street, a flat
// roof with the name standing on it, and a canopy over a pair of glass doors. It is built here from plain
// shapes, in five meshes (frame, floors and fittings; glass; what glows; the two signs), so it costs the frame
// almost nothing. Where it stands, how wide and how tall, comes from the town's own list of buildings.
// THREE is the global from three.min.js.

import { Batch, place, surface, linear } from './render-kit.js';
import { reflects } from './render-finish.js';

const STEEL = 0x161b20;
const STONE = 0xd9d5cb;
const WARM = 0xfff0cf;

// What the sky does to a sheet of glass: paler towards the top, with two soft streaks across it.
function skyInGlass() {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const fall = ctx.createLinearGradient(0, 0, 0, 256);
  fall.addColorStop(0, '#d9f1fb'); fall.addColorStop(0.45, '#8fc9e2'); fall.addColorStop(1, '#4f93b4');
  ctx.fillStyle = fall; ctx.fillRect(0, 0, 64, 256);
  ctx.globalAlpha = 0.28; ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.moveTo(0, 60); ctx.lineTo(64, 20); ctx.lineTo(64, 44); ctx.lineTo(0, 84); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, 150); ctx.lineTo(64, 110); ctx.lineTo(64, 120); ctx.lineTo(0, 160); ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;
  return texture;
}

function nameTexture(text, { width = 1024, height = 256, size = 170, colour = '#ffffff', spacing = 0.16, weight = 300 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = colour;
  ctx.textBaseline = 'middle';
  let px = size;
  const font = () => { ctx.font = `${weight} ${px}px "Helvetica Neue", "Segoe UI", Inter, Arial, sans-serif`; };
  const widthOf = () => [...text].reduce((sum, ch) => sum + ctx.measureText(ch).width + px * spacing, -px * spacing);
  font();
  while (widthOf() > width - 40 && px > 20) { px -= 4; font(); }
  let x = (width - widthOf()) / 2;
  for (const ch of text) { ctx.fillText(ch, x, height / 2 + px * 0.04); x += ctx.measureText(ch).width + px * spacing; }
  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;
  texture.anisotropy = 4;
  return texture;
}

// `b` is the building from the town's list (x, z, w, d, h, door); `storeys` how many floors.
export function buildShowroom(b, { storeys = 3 } = {}) {
  const group = new THREE.Group();
  const dir = b.door === 's' ? 1 : -1;
  const front = b.z + (dir * b.d) / 2;
  const base = 0.5;                               // a plinth of pale stone, two steps up from the ground
  const floorH = (b.h - 0.6) / storeys;
  const top = base + floorH * storeys;
  const hw = b.w / 2, hd = b.d / 2;

  const frame = new Batch();
  const lit = new Batch();

  // the plinth and its steps
  frame.box(b.w + 1.4, base, b.d + 1.4, place(b.x, base / 2, b.z), STONE);
  frame.box(5.2, base * 0.66, 1.0, place(b.x, base * 0.33, front + dir * 1.15), STONE, 0.95);
  frame.box(5.8, base * 0.33, 1.0, place(b.x, base * 0.165, front + dir * 1.75), STONE, 0.9);
  // a paved forecourt down to where a buyer stands
  frame.box(7, 0.06, 6.2, place(b.x, 0.03, front + dir * 4.4), 0xbfb9ac, 1, 'plan');

  // floors: a slab at every level, pale underneath so the light inside has something to fall on
  for (let i = 0; i <= storeys; i += 1) {
    const y = base + floorH * i;
    frame.box(b.w - 0.1, 0.22, b.d - 0.1, place(b.x, y - (i === 0 ? -0.02 : 0.11), b.z), i === storeys ? STEEL : 0xf4f1ea);
    // the ceiling under each slab is one lit panel: it is what makes the glass read as a lit room from the street
    if (i > 0) lit.box(b.w - 0.9, 0.03, b.d - 0.9, place(b.x, y - 0.24, b.z), 0xfff6e2, 0.82);
    // the steel edge of each slab, seen from outside as a dark band round the building
    for (const s of [-1, 1]) {
      frame.box(b.w + 0.16, 0.34, 0.14, place(b.x, y, b.z + s * hd), STEEL);
      frame.box(0.14, 0.34, b.d + 0.16, place(b.x + s * hw, y, b.z), STEEL);
    }
  }
  // the roof: a deck, a low parapet of glass behind a steel rail, and plant under a screen
  frame.box(b.w + 0.5, 0.18, b.d + 0.5, place(b.x, top + 0.2, b.z), STEEL);
  for (const s of [-1, 1]) {
    frame.box(b.w + 0.5, 0.06, 0.08, place(b.x, top + 1.25, b.z + s * (hd + 0.2)), 0x8c9399);
    frame.box(0.08, 0.06, b.d + 0.5, place(b.x + s * (hw + 0.2), top + 1.25, b.z), 0x8c9399);
  }
  frame.box(4.2, 1.1, 2.6, place(b.x - hw + 3.4, top + 0.84, b.z - dir * (hd - 2.2)), 0x2a3138);

  // columns: steel at the corners and at every bay, the full height
  const baysX = Math.max(2, Math.round(b.w / 4)), baysZ = Math.max(2, Math.round(b.d / 4));
  const column = (x, z) => frame.box(0.22, top - base, 0.22, place(x, base + (top - base) / 2, z), STEEL);
  for (let i = 0; i <= baysX; i += 1) for (const s of [-1, 1]) column(b.x - hw + (i * b.w) / baysX, b.z + s * hd);
  for (let i = 1; i < baysZ; i += 1) for (const s of [-1, 1]) column(b.x + s * hw, b.z - hd + (i * b.d) / baysZ);
  // thin mullions between them, and one transom to each floor
  for (let f = 0; f < storeys; f += 1) {
    const y0 = base + floorH * f;
    for (const s of [-1, 1]) {
      for (let i = 0; i < baysX * 2; i += 1) if (i % 2) frame.box(0.06, floorH, 0.08, place(b.x - hw + (i * b.w) / (baysX * 2), y0 + floorH / 2, b.z + s * hd), 0x2b3238);
      for (let i = 0; i < baysZ * 2; i += 1) if (i % 2) frame.box(0.08, floorH, 0.06, place(b.x + s * hw, y0 + floorH / 2, b.z - hd + (i * b.d) / (baysZ * 2)), 0x2b3238);
      frame.box(b.w, 0.05, 0.07, place(b.x, y0 + floorH * 0.72, b.z + s * hd), 0x2b3238);
      frame.box(0.07, 0.05, b.d, place(b.x + s * hw, y0 + floorH * 0.72, b.z), 0x2b3238);
    }
  }

  // the doors: a steel portal with a canopy, two leaves of glass with long handles
  const doorW = 2.6, doorH = 2.7;
  for (const s of [-1, 1]) frame.box(0.16, doorH + 0.1, 0.3, place(b.x + s * (doorW / 2 + 0.08), base + (doorH + 0.1) / 2, front), STEEL);
  frame.box(doorW + 0.32, 0.18, 0.3, place(b.x, base + doorH + 0.14, front), STEEL);
  frame.box(doorW + 3.4, 0.14, 2.2, place(b.x, base + doorH + 0.5, front + dir * 1.1), STEEL);
  for (const s of [-1, 1]) {
    frame.box(0.05, 1.3, 0.05, place(b.x + s * 0.16, base + 1.25, front + dir * 0.12), 0xc9a227);
    frame.box(0.06, (floorH - doorH - 0.5), 0.06, place(b.x + s * (doorW / 2 + 1.5), base + doorH + 0.57 + (floorH - doorH - 0.5) / 2, front + dir * 2.0), 0x8c9399);
  }

  // inside. Ground floor: a long counter and four cases. Above: cases round a well, and seats.
  const fit = (f, cases) => {
    const y = base + floorH * f + 0.11;
    for (const [cx, cz] of cases) {
      frame.box(0.7, 0.95, 0.7, place(b.x + cx, y + 0.475, b.z + cz), 0xf2efe8);
      frame.box(0.74, 0.04, 0.74, place(b.x + cx, y + 0.97, b.z + cz), 0xc9a227);
      lit.box(0.6, 0.02, 0.6, place(b.x + cx, y + 1.0, b.z + cz), WARM);
      frame.box(0.16, 0.05, 0.3, place(b.x + cx, y + 1.06, b.z + cz, 0.5), 0x101418);
      frame.round(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 16), place(b.x + cx, y + 1.1, b.z + cz, 0, 1, 1, 1, 0.4), 0xd9dde0);
    }
  };
  fit(0, [[-5.2, -dir * 0.5], [-2.6, -dir * 2.4], [2.6, -dir * 2.4], [5.2, -dir * 0.5]]);
  fit(1, [[-5, -3], [-5, 3], [5, -3], [5, 3], [0, -3.6]]);
  fit(2, [[-4.6, 0], [4.6, 0], [0, -3.4], [0, 3.4]]);
  // the counter, across the back of the ground floor, with the name behind it
  frame.box(6.4, 1.05, 0.8, place(b.x, base + 0.11 + 0.525, b.z - dir * (hd - 2.0)), 0x5a3d26);
  frame.box(6.6, 0.06, 0.95, place(b.x, base + 0.11 + 1.08, b.z - dir * (hd - 2.0)), 0xe9e6df);
  for (let f = 0; f < storeys; f += 1) frame.box(f === 0 ? 8 : 5, floorH - 0.5, 0.2, place(b.x, base + floorH * f + floorH / 2, b.z - dir * (hd - 0.5)), f === 0 ? 0x6b4a2e : 0x7a5a3a);
  // a stair up the east side, as a run of treads behind the glass
  for (let f = 0; f < storeys - 1; f += 1) {
    for (let i = 0; i < 12; i += 1) frame.box(1.3, 0.07, 0.34, place(b.x + hw - 1.2, base + floorH * f + 0.2 + (i * floorH) / 12, b.z - hd + 1.6 + i * 0.5), 0xcfd3d6);
  }

  const frameMesh = frame.build(reflects(surface({ vertexColors: true, roughness: 0.42, metalness: 0.55 }), 0.7));
  frameMesh.castShadow = true; frameMesh.receiveShadow = true;
  group.add(frameMesh);

  // what glows: the ceiling lights and the tops of the cases, always a little, strongly after dark
  const glowMaterial = surface({ vertexColors: true, roughness: 0.4, emissive: linear(WARM), emissiveIntensity: 0.55 });
  group.add(lit.build(glowMaterial));

  // the glass: one sheet to each side of each floor, faintly blue, seen through from both sides
  const glassMaterial = surface({ color: 0xffffff, map: skyInGlass(), emissive: new THREE.Color(0), roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.46, side: THREE.DoubleSide, depthWrite: false });
  const glass = new Batch();
  for (let f = 0; f < storeys; f += 1) {
    const y = base + floorH * f + floorH / 2;
    const h = floorH - 0.34;
    for (const s of [-1, 1]) {
      const isFront = s === dir && f === 0;
      if (isFront) {
        // the front of the ground floor is glass either side of the doors, and the two leaves themselves
        const side = (b.w - doorW - 0.32) / 2;
        for (const t of [-1, 1]) glass.box(side, h, 0.04, place(b.x + t * (doorW / 2 + 0.16 + side / 2), y, b.z + s * hd), 0xffffff);
        for (const t of [-1, 1]) glass.box(doorW / 2 - 0.03, doorH - 0.06, 0.04, place(b.x + t * (doorW / 4), base + doorH / 2, b.z + s * hd), 0xffffff);
        glass.box(doorW, floorH - doorH - 0.6, 0.04, place(b.x, base + doorH + 0.24 + (floorH - doorH - 0.6) / 2, b.z + s * hd), 0xffffff);
      } else glass.box(b.w, h, 0.04, place(b.x, y, b.z + s * hd), 0xffffff);
      glass.box(0.04, h, b.d, place(b.x + s * hw, y, b.z), 0xffffff);
    }
  }
  for (const s of [-1, 1]) { glass.box(b.w + 0.4, 1.0, 0.03, place(b.x, top + 0.75, b.z + s * (hd + 0.2)), 0xffffff); glass.box(0.03, 1.0, b.d + 0.4, place(b.x + s * (hw + 0.2), top + 0.75, b.z), 0xffffff); }
  const glassMesh = glass.build(glassMaterial);
  glassMesh.renderOrder = 3;
  group.add(glassMesh);

  // the name: tall thin letters standing on the roof, facing the street, and again over the door and behind the counter
  const big = new THREE.Mesh(new THREE.PlaneGeometry(b.w * 0.86, b.w * 0.86 * 0.2), new THREE.MeshBasicMaterial({ map: nameTexture('HOLARIS', { width: 1280, height: 256, size: 200, spacing: 0.3 }), transparent: true, toneMapped: false, side: THREE.DoubleSide, depthWrite: false }));
  big.position.set(b.x, top + 0.95 + b.w * 0.086, front - dir * 0.6);
  big.rotation.y = dir === 1 ? 0 : Math.PI;
  const small = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 1.5), new THREE.MeshBasicMaterial({ map: nameTexture('HOLARIS', { width: 1280, height: 200, size: 150, spacing: 0.34, weight: 300, colour: '#ffffff' }), transparent: true, toneMapped: false, side: THREE.DoubleSide, depthWrite: false }));
  small.position.set(b.x, base + floorH * 2.5, front + dir * 0.09);
  small.rotation.y = big.rotation.y;
  const over = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.62), new THREE.MeshBasicMaterial({ map: nameTexture('HOLARIS  watch', { width: 1024, height: 140, size: 96, spacing: 0.12, weight: 400 }), transparent: true, toneMapped: false, depthWrite: false }));
  over.position.set(b.x, base + doorH + 0.5, front + dir * 2.215);
  over.rotation.y = big.rotation.y;
  const inside = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 0.9), new THREE.MeshBasicMaterial({ map: nameTexture('HOLARIS', { width: 1024, height: 180, size: 130, spacing: 0.3, colour: '#f4d58a' }), transparent: true, toneMapped: false, depthWrite: false }));
  inside.position.set(b.x, base + floorH * 0.62, b.z - dir * (hd - 0.62));
  inside.rotation.y = big.rotation.y;
  // the roof letters stand on thin posts
  for (const t of [-0.36, -0.12, 0.12, 0.36]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.3, 0.07), new THREE.MeshBasicMaterial({ color: 0x2a3138 })); post.position.set(b.x + t * b.w, top + 0.85, front - dir * 0.66); group.add(post); }
  group.add(big, small, over, inside);

  return {
    group,
    signs: [big, small, over, inside],
    // after dark the showroom is the brightest thing in town
    setNight(night) { glowMaterial.emissiveIntensity = 0.55 + night * 1.6; glassMaterial.opacity = 0.46 - night * 0.2; glassMaterial.emissive.setRGB(0.25 * night, 0.2 * night, 0.12 * night); },
    x: b.x, z: b.z, top,
  };
}

// The column a buyer steps into: pink, upright, see-through, slowly turning, as tall as a person and a half.
export function makeDealMarker() {
  const group = new THREE.Group();
  const pink = 0xff3fa4;
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 2.6, 40, 1, true), new THREE.MeshBasicMaterial({ color: pink, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
  wall.position.y = 1.3;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.045, 8, 48), new THREE.MeshBasicMaterial({ color: 0xff8cc8, transparent: true, opacity: 0.95, toneMapped: false }));
  rim.rotation.x = Math.PI / 2; rim.position.y = 2.6;
  const foot = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.25, 48), new THREE.MeshBasicMaterial({ color: pink, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
  foot.rotation.x = -Math.PI / 2; foot.position.y = 0.12;
  const fill = new THREE.Mesh(new THREE.CircleGeometry(0.95, 40), new THREE.MeshBasicMaterial({ color: pink, transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false }));
  fill.rotation.x = -Math.PI / 2; fill.position.y = 0.11;
  group.add(fill, foot, wall, rim);
  group.renderOrder = 4;
  let t = 0;
  return {
    group,
    radius: 1.25,
    tick(dt) { t += dt; wall.material.opacity = 0.26 + 0.08 * Math.sin(t * 2.4); rim.position.y = 2.6 + 0.06 * Math.sin(t * 2.4); wall.scale.y = 1 + 0.025 * Math.sin(t * 2.4); },
    dispose() { for (const m of [wall, rim, foot, fill]) { m.geometry.dispose(); m.material.dispose(); } },
  };
}
