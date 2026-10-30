// The first city block (src/sim/zones/atani-city.js), drawn: Market Road as a boulevard between the Registry Road
// and Waterside Road junctions, its pavements and kerbs, its markings, crossings and signals, its street furniture,
// the raised lawn behind its retaining wall, and the buildings that frame it.
//
// Everything here is real geometry, not pictures of it: the road has a crown and stands below kerbs; the pavements
// stand on the road and slope down to it at the crossings; the buildings are hollow shells whose walls are built of
// piers and bands round real openings, with the glass set back in them, sills and lintels standing out, shopfronts,
// awnings and arches at street level, parapets and cornices at the top. Textures only give a surface its grain (the
// pavers' joints, the bricks, the stone, the grit of the tar), at their real sizes.
//
//   const city = buildCity(scene, { glowMaterial, lite });   then city.tick(dt, { night }) each frame
import { BOULEVARD, PAVEMENTS, LANDINGS, CROSSINGS, STOP_LINES, LAWN, LAWN_TREES, LAWN_SHRUBS, CITY_FURNITURE, CITY_BUILDINGS, KERB, cityGroundY, signalState } from '../sim/zone.js';
import { Batch, place, linear, noise, grassTexture, textTexture, surface } from './render-kit.js';
import { Foliage, bush, foliageMaterials } from './render-foliage.js';
import { reflects, weathers } from './render-finish.js';
import { isRoad } from './world-shading.js';
import { letPaintedGo } from './painted.js';

const ROAD_TOP = 0.08;                // the top of the town's roads (render-world.js)
const CROWN = 0.05;                   // how much higher the middle of the boulevard is than its edges
const crownY = (x) => ROAD_TOP + CROWN * Math.max(0, 1 - (x / BOULEVARD.x1) ** 2);
const groundTop = (x, z) => ROAD_TOP + cityGroundY(x, z);      // the top of the pavement (or the road) here

// ---- textures, painted at their real sizes ----
function canvas(size, paint) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  paint(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  // (painted from the same numbers every time: on a phone its pixels let go once the graphics card has them, and painted
  // again when wanted, painted.js)
  return letPaintedGo(t, () => paint(c.getContext('2d'), size));
}
const hash = (a, b) => noise(a * 12.9898 + b * 3.11, b * 78.233 + a * 0.71);
// Stone pavers, 60 by 40 cm in a stretcher bond, warm and light, each a little its own shade, with fine joints.
// The texture is 2.4 m square (render with uv 'plan', scale 2.4).
function paverTexture() {
  return canvas(512, (ctx, s) => {
    const px = s / 2.4;
    ctx.fillStyle = '#8c7a62'; ctx.fillRect(0, 0, s, s);
    const tw = 0.6 * px, th = 0.4 * px, joint = Math.max(1.5, 0.006 * px);
    for (let row = 0; row < 6; row += 1) for (let col = -1; col < 5; col += 1) {
      const x = col * tw + (row % 2 ? tw / 2 : 0), y = row * th;
      const k = hash(col + 7 * row, row);
      // (warm sandstone, as the street the owner showed: tan, cream and a few darker and lighter ones)
      const base = k < 0.14 ? [190, 158, 118] : k > 0.88 ? [238, 222, 194] : [222 + (k - 0.5) * 34, 196 + (k - 0.5) * 30, 156 + (k - 0.5) * 26];
      ctx.fillStyle = `rgb(${base.map((v) => Math.round(v)).join(',')})`;
      ctx.fillRect(x + joint / 2, y + joint / 2, tw - joint, th - joint);
      // a little grain and wear on each
      for (let i = 0; i < 40; i += 1) {
        const gx = x + hash(i, col + row * 9) * tw, gy = y + hash(row + i, col) * th;
        ctx.fillStyle = `rgba(${hash(i, 3) > 0.5 ? '255,250,240' : '120,105,85'},${0.06 + hash(i, row) * 0.08})`;
        ctx.fillRect(gx, gy, 2 + hash(i, 1) * 4, 2 + hash(i, 2) * 3);
      }
    }
  });
}
// Asphalt: fine aggregate, a little patching and wear. 4 m square (uv 'plan', scale 4).
function asphaltTexture() {
  return canvas(512, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    for (let y = 0; y < s; y += 1) for (let x = 0; x < s; x += 1) {
      const i = (y * s + x) * 4;
      const fine = hash(x, y), mid = noise(x / 9, y / 9), big = noise(x / 70 + 3, y / 70);
      const v = 70 + fine * 26 + mid * 14 + big * 10 + (fine > 0.985 ? 40 : 0);
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v + 3; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    ctx.fillStyle = 'rgba(30,30,32,0.18)';                      // a patch repair
    ctx.fillRect(s * 0.62, s * 0.18, s * 0.21, s * 0.13);
  });
}
// Brick: 21.5 by 6.5 cm bricks in a stretcher bond with 1 cm joints, brown with some variation. 1.8 m square.
function brickTexture() {
  return canvas(512, (ctx, s) => {
    const px = s / 1.8;
    ctx.fillStyle = '#b9ab95'; ctx.fillRect(0, 0, s, s);
    const bw = 0.225 * px, bh = 0.075 * px, j = 0.01 * px;
    for (let row = 0; row * bh < s; row += 1) for (let col = -1; col * bw < s; col += 1) {
      const x = col * bw + (row % 2 ? bw / 2 : 0), y = row * bh;
      const k = hash(col * 3 + row, row * 7 + col);
      ctx.fillStyle = `rgb(${Math.round(132 + k * 36)},${Math.round(76 + k * 20)},${Math.round(52 + k * 14)})`;
      ctx.fillRect(x + j / 2, y + j / 2, bw - j, bh - j);
    }
  });
}
// Dressed stone in courses 45 cm high, blocks of different lengths, warm grey. 3.6 m square.
function stoneTexture() {
  return canvas(512, (ctx, s) => {
    const px = s / 3.6;
    ctx.fillStyle = '#9d968a'; ctx.fillRect(0, 0, s, s);
    const ch = 0.45 * px, j = 0.012 * px;
    for (let row = 0; row * ch < s; row += 1) {
      let x = -hash(row, 1) * px;
      while (x < s) {
        const len = (0.7 + hash(x, row) * 0.6) * px;
        const k = hash(row * 5 + x, 2);
        ctx.fillStyle = `rgb(${Math.round(196 + k * 26)},${Math.round(188 + k * 24)},${Math.round(170 + k * 22)})`;
        ctx.fillRect(x + j / 2, row * ch + j / 2, len - j, ch - j);
        x += len;
      }
    }
  });
}
// Smooth render, painted: almost plain, a faint mottle. 4 m square.
function renderTexture() {
  return canvas(256, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    for (let y = 0; y < s; y += 1) for (let x = 0; x < s; x += 1) {
      const i = (y * s + x) * 4, v = 236 + noise(x / 20, y / 20) * 12 + hash(x, y) * 6;
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v - 4; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  });
}

// ---- a few shapes ----
// a strip of ground from (x0, z0) to (x1, z1), its height at each point from `y(x, z)`, in cells of about `cell` metres
function groundStrip(x0, z0, x1, z1, y, cell = 0.5) {
  const nx = Math.max(1, Math.round((x1 - x0) / cell)), nz = Math.max(1, Math.round((z1 - z0) / cell));
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i += 1) {
    const x = p.getX(i) + (x0 + x1) / 2, z = p.getZ(i) + (z0 + z1) / 2;
    p.setXYZ(i, x, y(x, z), z);
  }
  g.computeVertexNormals();
  return g;
}
const ident = new THREE.Matrix4();
// an arch bay of a wall: `w` wide, `h` high, an opening `ow` wide springing at `spring`, `depth` thick (local x across,
// y up, the wall's face at z = 0, its back at -depth)
function archBay(w, h, ow, spring, depth) {
  const r = ow / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0); shape.lineTo(-r, 0); shape.lineTo(-r, spring);
  shape.absarc(0, spring, r, Math.PI, 0, true);
  shape.lineTo(r, 0); shape.lineTo(w / 2, 0); shape.lineTo(w / 2, h); shape.lineTo(-w / 2, h); shape.lineTo(-w / 2, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 14 });
  g.translate(0, 0, -depth);
  return g;
}

export function buildCity(scene, { glowMaterial, lite = false, addTree } = {}) {
  const tex = { pavers: paverTexture(), asphalt: asphaltTexture(), brick: brickTexture(), stone: stoneTexture(), render: renderTexture() };
  // the batches, by what they are made of
  const B = {
    road: new Batch({ uv: 'plan', scale: 4 }),
    paint: new Batch(),
    paving: new Batch({ uv: 'plan', scale: 2.4 }),
    concrete: new Batch(),
    metal: new Batch(),
    brick: new Batch({ uv: 'wall', scale: 1.8 }),
    stone: new Batch({ uv: 'wall', scale: 3.6 }),
    render: new Batch({ uv: 'wall', scale: 4 }),
    trim: new Batch(),
    glass: new Batch(),
    lit: new Batch(),
    grass: new Batch({ uv: 'plan', scale: 3 }),
    leaves: new Batch(),
    solid: new Batch(),
  };
  const lamps = { red: [], amber: [], green: [] };          // signal lamps, by colour and phase: [phase][...]

  // ---------------------------------------------------------------- the road
  const z0 = -35, z1 = 108;                                 // between the junctions (the junctions are the cross roads' own)
  B.road.add(groundStrip(BOULEVARD.x0, z0, BOULEVARD.x1, z1, (x) => crownY(x), 0.5), ident, 0xffffff);
  const mark = (x0, zA, x1, zB, hex) => {
    const x = (x0 + x1) / 2, z = (zA + zB) / 2, inBlock = z > z0 && z < z1 && Math.abs(x) <= BOULEVARD.x1;
    const y = inBlock ? crownY(x) : ROAD_TOP;
    B.paint.box(x1 - x0, 0.006, zB - zA, place(x, y + 0.004, z), hex);
  };
  const WHITE = 0xe8e6de, YELLOW = 0xd9a823;
  // paired yellow lines down the middle, a yellow line along each kerb, dashed white between the lanes
  for (const side of [-1, 1]) {
    const cx = side * (BOULEVARD.centre + 0.06);
    mark(cx - 0.06, z0 + 0.3, cx + 0.06, z1 - 0.3, YELLOW);
    const ex = side * (BOULEVARD.x1 - 0.25);
    mark(ex - 0.06, z0 + 0.3, ex + 0.06, z1 - 0.3, YELLOW);
    const lx = side * (BOULEVARD.centre + 0.12 + BOULEVARD.lane);
    for (let z = z0 + 2; z < z1 - 3; z += 9) {
      const nearCrossing = CROSSINGS.some((c) => c.along === 'x' && Math.abs(c.at - (z + 1.5)) < 4);
      if (!nearCrossing) mark(lx - 0.06, z, lx + 0.06, z + 3, WHITE);
    }
  }
  // zebra crossings: white bars along the traffic, half a metre wide, half a metre apart
  for (const c of CROSSINGS) {
    const span = c.to - c.from;
    const bars = Math.floor(span / 1.0);
    const start = c.from + (span - (bars - 0.5)) / 2;
    for (let i = 0; i < bars; i += 1) {
      const u = start + i;
      if (c.along === 'x') mark(u, c.at - c.width / 2, u + 0.5, c.at + c.width / 2, WHITE);
      else mark(c.at - c.width / 2, u, c.at + c.width / 2, u + 0.5, WHITE);
    }
  }
  for (const s of STOP_LINES) mark(s.x0, s.z0, s.x1, s.z1, WHITE);
  // arrows in each lane before the junction (straight on)
  for (const lx of [-1.8, -4.85]) {
    mark(lx - 0.08, 92, lx + 0.08, 95.5, WHITE);
    const head = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-0.45, 0), new THREE.Vector2(0, -1.2), new THREE.Vector2(0.45, 0)]));
    head.rotateX(-Math.PI / 2);
    B.paint.add(head, place(lx, crownY(lx) + 0.005, 95.5), WHITE);
  }

  // ---------------------------------------------------------- the pavements
  for (const p of PAVEMENTS) {
    B.paving.add(groundStrip(p.x0, p.z0, p.x1, p.z1, (x, z) => groundTop(x, z) + 0.002, 0.5), ident, 0xffffff);
  }
  for (const p of LANDINGS) B.paving.add(groundStrip(p.x0, p.z0, p.x1, p.z1, () => ROAD_TOP + 0.002, 1), ident, 0xe8e2d6);
  // kerb stones round every pavement (where it meets the road, its kerb; where it meets the land, its edging),
  // standing a little proud of the pavers, their faces down to the road
  for (const p of PAVEMENTS) {
    for (const e of [{ axis: 'z', at: p.x0 + 0.1, from: p.z0, to: p.z1 }, { axis: 'z', at: p.x1 - 0.1, from: p.z0, to: p.z1 }, { axis: 'x', at: p.z0 + 0.1, from: p.x0, to: p.x1 }, { axis: 'x', at: p.z1 - 0.1, from: p.x0, to: p.x1 }]) {
      const n = Math.max(1, Math.round((e.to - e.from) / 0.5));
      for (let i = 0; i < n; i += 1) {
        const a = e.from + ((e.to - e.from) * i) / n, b = e.from + ((e.to - e.from) * (i + 1)) / n, m = (a + b) / 2;
        const [x, z] = e.axis === 'z' ? [e.at, m] : [m, e.at];
        // (not between two pavements that meet: only where the paving ends)
        const ox = e.axis === 'z' ? x + Math.sign(e.at - (p.x0 + p.x1) / 2) * 0.35 : x, oz = e.axis === 'x' ? z + Math.sign(e.at - (p.z0 + p.z1) / 2) * 0.35 : z;
        if (PAVEMENTS.some((q) => q !== p && ox > q.x0 && ox < q.x1 && oz > q.z0 && oz < q.z1)) continue;
        const h = groundTop(x, z) + 0.008;
        const shade = 0.92 + hash(i, e.at) * 0.1;
        if (e.axis === 'z') B.concrete.box(0.2, h, b - a, place(x, h / 2, m), 0xc9c5bc, shade);
        else B.concrete.box(b - a, h, 0.2, place(m, h / 2, z), 0xc9c5bc, shade);
      }
    }
  }

  // ------------------------------------------------------ street furniture
  const g = (x, z) => groundTop(x, z);
  for (const f of CITY_FURNITURE) {
    const y = g(f.x, f.z);
    if (f.kind === 'light') {
      // a tall pole, an arm out over the road, the lamp under its end
      B.metal.round(new THREE.CylinderGeometry(0.08, 0.13, 8.4, 10), place(f.x, y + 4.2, f.z), 0x3b3f44);
      B.metal.round(new THREE.CylinderGeometry(0.2, 0.24, 0.5, 10), place(f.x, y + 0.25, f.z), 0x33363a);
      B.metal.round(new THREE.CylinderGeometry(0.045, 0.055, 2.0, 8), place(f.x + f.face * 0.95, y + 8.3, f.z, 0, 1, 1, 1, 0, -f.face * (Math.PI / 2 - 0.12)), 0x3b3f44);
      B.metal.box(0.75, 0.16, 0.32, place(f.x + f.face * 1.85, y + 8.42, f.z), 0x2c2f33);
      B.lit.box(0.62, 0.03, 0.24, place(f.x + f.face * 1.85, y + 8.33, f.z), 0xfff1d0);
    } else if (f.kind === 'signal') {
      B.metal.round(new THREE.CylinderGeometry(0.07, 0.09, 3.4, 10), place(f.x, y + 1.7, f.z), 0x2a2c30);
      const fx = Math.sin(f.face), fz = Math.cos(f.face);
      const head = (hx, hy, hz) => {
        B.metal.box(0.34, 0.98, 0.26, place(hx, hy, hz, f.face), 0x1c1d20);
        B.metal.box(0.5, 1.12, 0.03, place(hx - fx * 0.14, hy, hz - fz * 0.14, f.face), 0x111214);      // backboard
        [['red', 0.3], ['amber', 0], ['green', -0.3]].forEach(([colour, dy]) => {
          const lamp = { x: hx + fx * 0.135, y: hy + dy, z: hz + fz * 0.135, face: f.face };
          (lamps[colour][f.phase] = lamps[colour][f.phase] || []).push(lamp);
          B.metal.box(0.26, 0.03, 0.16, place(hx + fx * 0.2, hy + dy + 0.13, hz + fz * 0.2, f.face), 0x1c1d20);   // visor
        });
      };
      head(f.x + fx * 0.12, y + 2.9, f.z + fz * 0.12);
      // over the road, for the drivers further off: an arm across to the middle of the lanes
      if (f.phase !== 2) {
        const across = Math.abs(fz) > 0.5 ? [-Math.sign(f.x) || -1, 0] : [0, -Math.sign(f.z + 40) || -1];
        const len = 3.2;
        B.metal.round(new THREE.CylinderGeometry(0.05, 0.06, len, 8), place(f.x + across[0] * len / 2, y + 5.1, f.z + across[1] * len / 2, 0, 1, 1, 1, across[1] ? Math.PI / 2 : 0, across[0] ? Math.PI / 2 : 0), 0x2a2c30);
        B.metal.round(new THREE.CylinderGeometry(0.07, 0.07, 1.8, 10), place(f.x, y + 4.3, f.z), 0x2a2c30);
        head(f.x + across[0] * len, y + 4.65, f.z + across[1] * len);
      }
    } else if (f.kind === 'bollard') {
      B.metal.round(new THREE.CylinderGeometry(0.09, 0.1, 0.92, 12), place(f.x, y + 0.46, f.z), 0x18191b);
      B.metal.round(new THREE.SphereGeometry(0.09, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), place(f.x, y + 0.92, f.z), 0x18191b);
      B.trim.round(new THREE.CylinderGeometry(0.101, 0.101, 0.05, 12), place(f.x, y + 0.78, f.z), 0xd8d4c8);
    } else if (f.kind === 'bin') {
      B.solid.round(new THREE.CylinderGeometry(0.27, 0.24, 0.86, 16), place(f.x, y + 0.43, f.z), f.colour);
      B.solid.round(new THREE.CylinderGeometry(0.29, 0.29, 0.08, 16), place(f.x, y + 0.9, f.z), 0x2b2b2d);
    } else if (f.kind === 'hydrant') {
      B.solid.round(new THREE.CylinderGeometry(0.11, 0.13, 0.55, 12), place(f.x, y + 0.28, f.z), 0xb52a20);
      B.solid.round(new THREE.SphereGeometry(0.12, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), place(f.x, y + 0.55, f.z), 0xb52a20);
      B.solid.round(new THREE.CylinderGeometry(0.045, 0.045, 0.34, 10), place(f.x, y + 0.38, f.z, 0, 1, 1, 1, 0, Math.PI / 2), 0xc9b04a);
      B.solid.round(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 12), place(f.x, y + 0.03, f.z), 0x7a2019);
    } else if (f.kind === 'drain') {
      const ry = crownY(f.x) - 0.004;
      B.metal.box(0.42, 0.02, 0.9, place(f.x, ry, f.z), 0x232425);
      for (let k = -3; k <= 3; k += 1) B.metal.box(0.36, 0.024, 0.04, place(f.x, ry + 0.002, f.z + k * 0.11), 0x4a4c4f);
    } else if (f.kind === 'manhole') {
      const ry = crownY(f.x);
      B.metal.round(new THREE.CylinderGeometry(0.34, 0.34, 0.012, 24), place(f.x, ry + 0.002, f.z), 0x3a3b3d);
      B.metal.round(new THREE.TorusGeometry(0.3, 0.012, 4, 24), place(f.x, ry + 0.009, f.z, 0, 1, 1, 1, Math.PI / 2), 0x55575a);
    }
  }

  // --------------------------------- the raised lawn behind its retaining wall
  const L = LAWN, wallTop = ROAD_TOP + KERB + L.height + 0.1, lawnTop = wallTop - 0.1;
  const wallRun = (x0, za, x1, zb) => {
    // panels of precast concrete, a hand's breadth apart in their grooves, under a coping
    const along = Math.abs(x1 - x0) > Math.abs(zb - za);
    const len = along ? x1 - x0 : zb - za;
    const n = Math.max(1, Math.round(len / 1.5));
    for (let i = 0; i < n; i += 1) {
      const t0 = i / n, t1 = (i + 1) / n;
      const cx = x0 + (x1 - x0) * (t0 + t1) / 2, cz = za + (zb - za) * (t0 + t1) / 2, pl = len / n - 0.03;
      const base = ROAD_TOP + cityGroundY(cx, cz) - 0.02;
      const h = wallTop - base - 0.08;
      B.concrete.box(along ? pl : L.wall, h, along ? L.wall : pl, place(cx, base + h / 2, cz), 0xbdb6a8, 0.95 + hash(i, cx) * 0.08);
      B.concrete.box(along ? pl * 0.8 : 0.02, h * 0.6, along ? 0.02 : pl * 0.8, place(cx + (along ? 0 : L.wall / 2 + 0.005), base + h / 2, cz + (along ? -L.wall / 2 - 0.005 : 0)), 0xaea796);
    }
    B.concrete.box(along ? len + 0.1 : L.wall + 0.1, 0.08, along ? L.wall + 0.1 : len + 0.1, place((x0 + x1) / 2, wallTop - 0.04, (za + zb) / 2), 0xd3cdc0);
  };
  wallRun(L.x1, L.z0, L.x1, L.z1);                     // along the pavement
  wallRun(L.x0, L.z0, L.x1, L.z0);                     // and round its ends
  wallRun(L.x0, L.z1, L.x1, L.z1);
  wallRun(L.x0, L.z0, L.x0, L.z1);
  B.grass.box(L.x1 - L.x0 - L.wall, 0.06, L.z1 - L.z0 - L.wall, place((L.x0 + L.x1) / 2, lawnTop - 0.03, (L.z0 + L.z1) / 2), 0x6d9a45);
  B.solid.box(L.x1 - L.x0 - L.wall, lawnTop - 0.05, L.z1 - L.z0 - L.wall, place((L.x0 + L.x1) / 2, (lawnTop - 0.05) / 2, (L.z0 + L.z1) / 2), 0x5a4632);
  const treeSolid = new Batch(), foliage = new Foliage();
  for (const [i, t] of LAWN_TREES.entries()) addTree(treeSolid, foliage, { x: t.x, z: t.z, kind: 'mango', size: 0.9 + hash(i, 4) * 0.25, turn: hash(i, 9) * 6 });
  // the shrubs: low round bushes of the same leaves
  for (const [i, s] of LAWN_SHRUBS.entries()) bush(foliage, s.x, lawnTop, s.z, 0.62 + hash(i, 2) * 0.2, (k) => hash(i * 17 + k, 23));

  // ------------------------------------------------------------- buildings
  const signs = [];
  for (const b of CITY_BUILDINGS) buildBuilding(B, b, { lite, signs });

  // ------------------------------------------------------------- materials
  const materials = {
    road: surface({ vertexColors: true, map: tex.asphalt, roughness: 0.93, metalness: 0 }),
    paint: surface({ vertexColors: true, roughness: 0.72, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    paving: surface({ vertexColors: true, map: tex.pavers, roughness: 0.82, metalness: 0 }),
    concrete: surface({ vertexColors: true, roughness: 0.9, metalness: 0 }),
    metal: surface({ vertexColors: true, roughness: 0.45, metalness: 0.55 }),
    brick: surface({ vertexColors: true, map: tex.brick, roughness: 0.9, metalness: 0 }),
    stone: surface({ vertexColors: true, map: tex.stone, roughness: 0.85, metalness: 0 }),
    render: surface({ vertexColors: true, map: tex.render, roughness: 0.88, metalness: 0 }),
    trim: surface({ vertexColors: true, roughness: 0.7, metalness: 0.05 }),
    glass: surface({ vertexColors: true, roughness: 0.08, metalness: 0.85, envMapIntensity: 1.1 }),
    grass: surface({ vertexColors: true, map: grassTexture(), roughness: 0.95, metalness: 0 }),
    leaves: surface({ vertexColors: true, roughness: 0.9, metalness: 0 }),
    solid: surface({ vertexColors: true, roughness: 0.8, metalness: 0.05 }),
  };
  // (the glass and the steel give back the sky; out in the rain the street is darker, and its tarmac and paving glossy:
  // render-finish.js)
  reflects(materials.glass, 1.1); reflects(materials.metal, 0.6, 'metal');
  isRoad(weathers(materials.road, { darken: 0.42, gloss: 0.66, sheen: 1 })); weathers(materials.paving, { darken: 0.25, gloss: 0.32, sheen: 0.25 });
  for (const name of ['concrete', 'brick', 'stone', 'render']) weathers(materials[name], { darken: 0.18 });
  const meshes = [];
  for (const [name, batch] of Object.entries(B)) {
    if (batch.empty) continue;
    const mesh = batch.build(name === 'lit' ? glowMaterial : materials[name]);
    mesh.castShadow = !['road', 'paint', 'paving', 'grass', 'lit'].includes(name);
    mesh.receiveShadow = true;
    mesh.name = `city-${name}`;
    scene.add(mesh); meshes.push(mesh);
  }
  for (const mesh of foliage.build(foliageMaterials())) { scene.add(mesh); meshes.push(mesh); }
  for (const batch of [treeSolid]) if (!batch.empty) {
    const mesh = batch.build(materials.solid);
    mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); meshes.push(mesh);
  }
  for (const s of signs) scene.add(s);

  // the signal lamps: one mesh for each colour of each phase, lit by turns
  const disc = new THREE.CircleGeometry(0.105, 16);
  const COLOURS = { red: 0xff2a1a, amber: 0xffa31a, green: 0x2dff6a };
  const lampMeshes = [];
  for (const [colour, byPhase] of Object.entries(lamps)) byPhase.forEach((list, phase) => {
    if (!list || !list.length) return;
    const material = new THREE.MeshStandardMaterial({ color: linear(0x1a1a1a), emissive: linear(COLOURS[colour]), emissiveIntensity: 0, roughness: 0.3 });
    const mesh = new THREE.InstancedMesh(disc, material, list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ');
    list.forEach((l, i) => { e.set(0, l.face, 0); q.setFromEuler(e); m.compose(new THREE.Vector3(l.x, l.y, l.z), q, new THREE.Vector3(1, 1, 1)); mesh.setMatrixAt(i, m); });
    scene.add(mesh);
    lampMeshes.push({ colour, phase, material, mesh });
  });
  // the lights follow the town's own clock (atani-city.js signalState), the same one its traffic stops by
  let clock = 0;
  function tick(dt, now = null) {
    clock = now === null ? clock + dt : now;
    for (const l of lampMeshes) l.material.emissiveIntensity = signalState(l.phase, clock) === l.colour ? 2.4 : 0;
  }
  tick(0);
  return { tick, meshes, signal: (phase) => signalState(phase, clock), textures: tex };
}

// ---- one building: its walls built round real openings ----
const STYLE = {
  brick: { walls: 'brick', wall: 0xffffff, trim: 0xe9dfc8, frame: 0x26332b, bay: 2.3, pier: 0.75, win: 1.75, sill: 0.85, glass: 0x3d4a52 },
  pale: { walls: 'render', wall: 0xf1ede4, trim: 0xd9d4c8, frame: 0x55595e, bay: 2.1, pier: 0.7, win: 1.6, sill: 0.9, glass: 0x52677a },
  stone: { walls: 'stone', wall: 0xffffff, trim: 0xe6dccb, frame: 0x2f2a26, bay: 2.6, pier: 1.0, win: 2.1, sill: 0.75, glass: 0x404a50 },
  glass: { walls: 'stone', wall: 0x55575a, trim: 0x2d3034, frame: 0x2a2d31, bay: 1.5, pier: 0.08, win: 2.3, sill: 0.6, glass: 0x5f88a8 },
};
const SHOP_COLOURS = [0x9b2d24, 0x1f5d3a, 0xc59b2a, 0x234a7a, 0x6e2f5c];
const SHOP_NAMES = ['OKONKWO PHARMACY', 'DELTA BANK', 'NIGER BOOKSHOP', 'ASABA OPTICIANS', 'CABLE POINT TAILORS', 'UMUNEDE STORES', 'RIVERSIDE CAFE'];

function buildBuilding(B, b, { lite, signs }) {
  const S = STYLE[b.style];
  const wallBatch = B[S.walls];
  const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
  const H = b.h;
  const r = (k) => hash(b.seed * 13 + k, k * 0.37 + b.seed);
  // the four sides: where each starts, which way it runs, which way it faces
  const sides = [
    { n: [1, 0], c: [x1, b.z], len: b.d, front: b.face === 'e' },
    { n: [-1, 0], c: [x0, b.z], len: b.d, front: b.face === 'w' },
    { n: [0, 1], c: [b.x, z1], len: b.w, front: false },
    { n: [0, -1], c: [b.x, z0], len: b.w, front: false },
  ];
  // a box on a side: u along it (from its middle), y up, t outward from its face; sized along (w), up (h), out (d)
  const box = (batch, side, u, y, t, w, h, d, hex, shade = 1) => {
    const ry = Math.atan2(side.n[0], side.n[1]);
    const ax = Math.cos(ry), az = -Math.sin(ry);
    batch.box(w, h, d, place(side.c[0] + ax * u + side.n[0] * t, y, side.c[1] + az * u + side.n[1] * t, ry), hex, shade);
  };
  const T = 0.3;                                         // the walls' thickness
  // a window set back in its opening: glass, a frame round it, a sill standing out under it
  const lights = (k) => r(k) < 0.28;
  const windowAt = (side, u, y, w, h, k, { sill = true, lintel = false } = {}) => {
    box(lights(k) ? B.lit : B.glass, side, u, y + h / 2, -0.2, w, h, 0.04, S.glass, 0.85 + r(k + 1) * 0.3);
    if (!lite) {
      for (const [du, dy, ww, hh] of [[0, h / 2 - 0.03, w, 0.06], [0, -h / 2 + 0.03, w, 0.06], [-w / 2 + 0.03, 0, 0.06, h], [w / 2 - 0.03, 0, 0.06, h], [0, h * 0.18, w, 0.04]]) box(B.trim, side, u + du, y + h / 2 + dy, -0.16, ww, hh, 0.08, S.frame);
      if (w > 1.3) box(B.trim, side, u, y + h / 2, -0.16, 0.05, h, 0.07, S.frame);
    }
    if (sill) box(B.trim, side, u, y - 0.04, 0.03, w + 0.16, 0.08, 0.2, S.trim);
    if (lintel) box(B.trim, side, u, y + h + 0.11, 0.015, w + 0.22, 0.22, 0.06, S.trim);
  };

  for (const side of sides) {
    const L = side.len;
    const G = b.ground;
    // ---- the ground floor ----
    if (side.front && b.style !== 'stone') {
      // shopfronts (or, under a glass tower, its lobby): piers, glass from the pavement nearly to the fascia, doors,
      // a fascia with the shop's name, an awning
      const bays = Math.max(1, Math.round(L / (b.style === 'glass' ? 5 : 4.6)));
      const bw = L / bays, pier = b.style === 'glass' ? 0.6 : 0.7;
      for (let i = 0; i <= bays; i += 1) box(b.style === 'glass' ? B.stone : wallBatch, side, -L / 2 + i * bw, G / 2, -T / 2, pier, G, T + 0.08, b.style === 'glass' ? 0x3a3c40 : S.wall);
      const glassH = G - 1.25;
      for (let i = 0; i < bays; i += 1) {
        const u = -L / 2 + (i + 0.5) * bw, w = bw - pier;
        box(B.glass, side, u, glassH / 2 + 0.15, -0.35, w, glassH - 0.3, 0.04, b.style === 'glass' ? 0x7aa0bb : 0x2f3a40, 1.1);
        box(B.solid, side, u, 0.08, -0.3, w, 0.16, 0.2, 0x55585c);                                  // stall riser
        box(B.trim, side, u, glassH, -0.3, w, 0.08, 0.12, S.frame);                                 // transom
        for (const du of [-w / 2 + 0.04, w / 2 - 0.04]) box(B.trim, side, u + du, glassH / 2, -0.3, 0.08, glassH, 0.12, S.frame);
        if (i % 2 === 1 || bays === 1) { box(B.solid, side, u, 1.15, -0.33, 1.1, 2.3, 0.06, 0x232629); box(B.trim, side, u + 0.42, 1.1, -0.28, 0.04, 0.3, 0.06, 0xb9a46a); }
        if (b.style !== 'glass') {
          const colour = SHOP_COLOURS[(b.seed + i) % SHOP_COLOURS.length];
          box(B.solid, side, u, G - 0.62, 0.06, w, 0.72, 0.1, colour);                              // fascia
          // the awning: a sloped canvas sheet on two arms
          const ry = Math.atan2(side.n[0], side.n[1]);
          const ax = Math.cos(ry), az = -Math.sin(ry);
          const cx = side.c[0] + ax * u + side.n[0] * 0.75, cz = side.c[1] + az * u + side.n[1] * 0.75;
          B.solid.box(w - 0.1, 0.04, 1.5, place(cx, G - 1.42, cz, ry, 1, 1, 1, 0.38), colour, 0.95);
          B.solid.box(w - 0.1, 0.25, 0.03, place(cx + side.n[0] * 0.7, G - 1.82, cz + side.n[1] * 0.7, ry), colour, 0.85);
          if (signs.length < 7 && !lite) signs.push(fasciaSign(SHOP_NAMES[(b.seed * 3 + i) % SHOP_NAMES.length], side, u, G - 0.62, w, colour));
        }
      }
      if (b.style === 'glass') {
        // the entrance canopy, and the tower's name over it
        box(B.metal, side, 0, G - 0.4, 1.4, Math.min(8, L * 0.4), 0.18, 2.8, 0x2a2d31);
        if (!lite) signs.push(fasciaSign(b.name.toUpperCase(), side, 0, G + 0.05, Math.min(8, L * 0.4), 0x1d2024, 0.45));
      }
      box(b.style === 'glass' ? B.stone : wallBatch, side, 0, G - 0.6, -T / 2, L, 1.2, T, b.style === 'glass' ? 0x3a3c40 : S.wall);        // the band over the shopfronts
    } else if (side.front && b.style === 'stone') {
      // an arcade of arches along the street, shops set back behind it
      const bays = Math.max(1, Math.round(L / 4.4));
      const bw = L / bays;
      for (let i = 0; i < bays; i += 1) {
        const u = -L / 2 + (i + 0.5) * bw;
        const ry = Math.atan2(side.n[0], side.n[1]);
        const ax = Math.cos(ry), az = -Math.sin(ry);
        B.stone.add(archBay(bw, G, bw - 1.1, G - 1.2 - (bw - 1.1) / 2, 0.6), place(side.c[0] + ax * u, 0, side.c[1] + az * u, ry), 0xffffff);
        box(B.trim, side, u, G - 1.05, 0.02, 0.42, 0.42, 0.06, S.trim);    // keystone
        box(B.glass, side, u, 1.75, -2.4, bw - 1.6, 3.2, 0.04, 0x2f3a40, 1.1);
        box(B.trim, side, u, 3.42, -2.36, bw - 1.6, 0.12, 0.1, S.frame);
        if (i % 2 === 0) box(B.solid, side, u, 1.15, -2.36, 1.1, 2.3, 0.06, 0x2b241f);
      }
      box(B.stone, side, 0, G - 0.05, -1.5, L - 0.2, 0.1, 3.0, 0xe9e1d2);                         // the arcade's ceiling
      box(B.stone, side, 0, 0.04, -1.5, L - 0.2, 0.08, 3.0, 0xd8cfbe);                             // its floor
      box(B.trim, side, 0, G + 0.1, 0.08, L + 0.1, 0.22, 0.16, S.trim);                           // a string course
    } else {
      // the other sides at street level: plain wall with a window or two
      box(wallBatch, side, 0, G / 2, -T / 2, L, G, T, S.wall);
    }
    // ---- the floors above ----
    if (b.style === 'glass') {
      // a curtain wall: glass in mullions on every floor, an opaque band at each floor, fins at the corners
      const top = H - 1.6;
      const bays = Math.max(2, Math.round(L / S.bay));
      const bw = L / bays;
      for (let k = 1; k < b.storeys; k += 1) {
        const y0 = G + (k - 1) * b.floor;
        box(B.glass, side, 0, y0 + 0.45, -0.06, L, 0.9, 0.05, 0x3f5560, 0.9);                      // the floor's band
        for (let i = 0; i < bays; i += 1) {
          const u = -L / 2 + (i + 0.5) * bw;
          box(lights(k * 31 + i + side.n[0] * 7 + side.n[1] * 3) ? B.lit : B.glass, side, u, y0 + 0.9 + (b.floor - 0.9) / 2, -0.06, bw - 0.02, b.floor - 0.9, 0.05, S.glass, 0.88 + r(k * 5 + i) * 0.22);
        }
        box(B.metal, side, 0, y0, 0.02, L + 0.04, 0.1, 0.16, 0x30343a);                           // transom at the slab
      }
      for (let i = 0; i <= bays; i += 1) box(B.metal, side, -L / 2 + i * bw, (G + top) / 2, 0.04, 0.09, top - G, 0.2, 0x30343a);   // mullions
      box(B.solid, side, 0, G + (top - G) / 2, -0.4, L - 0.2, top - G, 0.1, 0x1e2226);           // (behind the glass: dark)
      box(B.metal, side, 0, (top + H) / 2, -0.05, L + 0.1, H - top, 0.3, 0x2d3136);                // the crown
      continue;
    }
    const bays = Math.max(1, Math.round(L / S.bay));
    const bw = L / bays;
    const ww = bw - S.pier;
    for (let k = 1; k < b.storeys; k += 1) {
      const y0 = G + (k - 1) * b.floor;
      const head = b.floor - S.sill - S.win;
      box(wallBatch, side, 0, y0 + S.sill / 2, -T / 2, L, S.sill, T, S.wall);
      box(wallBatch, side, 0, y0 + S.sill + S.win + head / 2, -T / 2, L, head, T, S.wall);
      for (let i = 0; i <= bays; i += 1) {
        const pw = i === 0 || i === bays ? S.pier / 2 + 0.05 : S.pier;
        box(wallBatch, side, -L / 2 + i * bw + (i === 0 ? pw / 2 : i === bays ? -pw / 2 : 0), y0 + S.sill + S.win / 2, -T / 2, pw, S.win, T, S.wall);
      }
      for (let i = 0; i < bays; i += 1) {
        const u = -L / 2 + (i + 0.5) * bw;
        windowAt(side, u, y0 + S.sill, ww, S.win, k * 17 + i * 3 + side.n[0] * 5 + side.n[1] * 11, { lintel: b.style === 'brick' });
        // balconies on the front of the rendered towers, every other bay, every floor above the first
        if (b.style === 'pale' && side.front && i % 2 === 1 && k > 1 && !lite) {
          box(B.render, side, u, y0 + 0.06, 0.6, ww + 0.5, 0.14, 1.2, 0xe9e5dc);
          box(B.metal, side, u, y0 + 0.62, 1.18, ww + 0.5, 0.04, 0.04, 0x3a3e43);
          for (let j = -2; j <= 2; j += 1) box(B.metal, side, u + j * (ww + 0.4) / 4, y0 + 0.4, 1.18, 0.025, 0.5, 0.025, 0x3a3e43);
        }
      }
      // the rendered towers' floors show as a band across the front
      if (b.style === 'pale') box(B.trim, side, 0, y0, 0.03, L + 0.06, 0.16, 0.08, S.trim);
    }
    // the parapet and its cornice
    const pTop = H + (b.style === 'pale' ? 0.9 : 1.1);
    box(wallBatch, side, 0, (H + pTop) / 2, -T / 2, L, pTop - H, T, S.wall);
    box(B.trim, side, 0, pTop + 0.06, 0.12, L + 0.3, 0.14, 0.42, S.trim);
    if (b.style !== 'pale') box(B.trim, side, 0, H - 0.1, 0.1, L + 0.24, 0.3, 0.3, S.trim);
  }
  // the roof: a slab, and what stands on it
  B.concrete.box(b.w - 0.1, 0.3, b.d - 0.1, place(b.x, H - 0.15, b.z), 0x8d8a84);
  if (b.storeys > 5) {
    B.concrete.box(Math.min(6, b.w * 0.4), 2.6, Math.min(5, b.d * 0.35), place(b.x - b.w * 0.12, H + 1.3, b.z + b.d * 0.1), 0x9a968e);
    B.metal.round(new THREE.CylinderGeometry(0.9, 0.9, 1.8, 14), place(b.x + b.w * 0.22, H + 0.9, b.z - b.d * 0.2), 0x6f747a);
  }
}

// A shop's name on its fascia, in its own paint.
function fasciaSign(text, side, u, y, w, colour, height = 0.5) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w - 0.3, text.length * 0.32), height), new THREE.MeshStandardMaterial({ map: textTexture(text, { width: 1024, height: 128, background: `#${new THREE.Color(colour).getHexString()}`, colour: '#f5efe0', size: 76 }), roughness: 0.6 }));
  const ry = Math.atan2(side.n[0], side.n[1]);
  const ax = Math.cos(ry), az = -Math.sin(ry);
  mesh.position.set(side.c[0] + ax * u + side.n[0] * 0.12, y, side.c[1] + az * u + side.n[1] * 0.12);
  mesh.rotation.y = ry;
  return mesh;
}
