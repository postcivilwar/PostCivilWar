// The surface sweep (5 November 2026, the owner's brief, part 1: "a whole-map sweep test ... comparing the height people
// and vehicles stand at with the surface drawn there, and anything drawn over it; every difference over 2 cm listed and
// fixed"). In each area of the map (the town and its city block, the land beyond it and the bridge, the showrooms and
// the sports mall, the road up the river and the habitation, Oganiru City's flyovers, slip roads, junctions and
// streets): on a grid of points where a person can stand (the game's own test of it, at each level: the ground and every
// deck over it), the height they stand at (the game's own rule, zone.js) against the highest solid surface drawn there
// (every solid, upward-facing triangle the page draws, found straight down from above; what lies on the ground, a mark,
// left out). Every difference over 2 cm is listed, with what was drawn there; any at all fails the test.
//   ../server/with-postgres.sh node test/surface-sweep.mjs [out folder] [phone] [areas json]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const Z = await import(resolve(ROOT, 'prototype/src/sim/zone.js'));
const { createDevServer } = await import(resolve(ROOT, 'server/dev.mjs'));
const { pastQuestion, enterTown } = await import(resolve(ROOT, 'prototype/test/start.mjs'));
const out = resolve(process.argv[2] || '/tmp/surface-sweep'); mkdirSync(out, { recursive: true });
const PHONE = process.argv[3] === 'phone';
// (the areas: each a box, the step between its points, and where the player stands while it is looked at)
const AREAS = [
  { name: 'town-centre', x0: -70, z0: 80, x1: 60, z1: 140, step: 2, at: [-34, 101] },
  { name: 'town-south', x0: -45, z0: -120, x1: 45, z1: -45, step: 2, at: [0, -80] },
  { name: 'city-block', x0: -31, z0: -49, x1: 30, z1: 118, step: 2, at: [0, 30] },
  { name: 'town-west', x0: -250, z0: -120, x1: -120, z1: 100, step: 4, at: [-185, 0] },
  { name: 'town-east', x0: 120, z0: -120, x1: 250, z1: 118, step: 4, at: [185, 0] },
  { name: 'bridge', x0: -215, z0: 110, x1: -195, z1: 330, step: 1.5, at: [-205, 200, 7] },
  { name: 'outskirts-road', x0: -420, z0: -60, x1: -260, z1: -20, step: 2, at: [-340, -40] },
  { name: 'powerbike', x0: -82, z0: 18, x1: -42, z1: 58, step: 1, at: [-62, 40] },
  { name: 'carshow-hall', x0: -446, z0: -197, x1: -358, z1: -155, step: 1.5, at: [-400, -176] },
  { name: 'carshow-yard', x0: -560, z0: -212, x1: -275, z1: -70, step: 4, at: [-420, -120] },
  { name: 'sports-mall', x0: -702, z0: -182, x1: -588, z1: -72, step: 2, at: [-645, -150] },
  { name: 'upriver', x0: 240, z0: 60, x1: 330, z1: 125, step: 2, at: [290, 100] },
  { name: 'habitation-gate', x0: 320, z0: 40, x1: 420, z1: 130, step: 2, at: [340, 90] },
  { name: 'habitation-forest', x0: 450, z0: 40, x1: 540, z1: 130, step: 2, at: [493, 86] },
  { name: 'habitation-swamp', x0: 460, z0: -120, x1: 540, z1: -40, step: 2, at: [498, -82] },
  { name: 'independence-flyover', x0: -40, z0: -820, x1: 40, z1: -740, step: 2, at: [0, -780] },
  { name: 'unity-interchange', x0: -60, z0: -1180, x1: 60, z1: -1080, step: 3, at: [0, -1130] },
  { name: 'peace-ramps', x0: 560, z0: -1190, x1: 720, z1: -1070, step: 3, at: [640, -1130] },
  { name: 'peace-flyover', x0: 700, z0: -960, x1: 740, z1: -600, step: 2, at: [720, -950] },
  { name: 'oganiru-street', x0: 100, z0: -720, x1: 220, z1: -600, step: 3, at: [160, -660] },
  { name: 'harmony', x0: -1330, z0: -1160, x1: -1240, z1: -1080, step: 3, at: [-1290, -1120] },
  { name: 'oganiru-north', x0: -200, z0: -300, x1: -60, z1: -160, step: 4, at: [-130, -230] },
];
// (and the whole map beyond them, in squares, more coarsely: the town, its river bank, the roads and the airport beyond
// it, Oganiru City and the habitation; each square looked at from its middle)
const squares = (prefix, x0, z0, x1, z1, size, step) => {
  const out = [];
  for (let x = x0; x < x1 - 1e-6; x += size) for (let z = z0; z < z1 - 1e-6; z += size) out.push({ name: `${prefix}:${Math.round(x)},${Math.round(z)}`, x0: x, z0: z, x1: Math.min(x1, x + size), z1: Math.min(z1, z + size), step, at: [Math.min(x1, x + size / 2), Math.min(z1, z + size / 2)] });
  return out;
};
const MAP = [
  ...squares('town', -250, -480, 250, 185, 125, 4),
  { name: 'river-bank', x0: -250, z0: 132, x1: 245, z1: 160, step: 2, at: [0, 140] },
  { name: 'kwale-road-1', x0: -670, z0: -62, x1: -420, z1: -18, step: 3, at: [-545, -40] },
  { name: 'kwale-road-2', x0: -930, z0: -62, x1: -670, z1: -18, step: 3, at: [-800, -40] },
  { name: 'kwale-road-3', x0: -1192, z0: -62, x1: -930, z1: -18, step: 3, at: [-1060, -40] },
  { name: 'airport-front', x0: -945, z0: -262, x1: -735, z1: -60, step: 4, at: [-850, -180] },
  { name: 'airport-apron', x0: -950, z0: -340, x1: -700, z1: -248, step: 4, at: [-850, -290] },
  { name: 'airport-field-1', x0: -1160, z0: -510, x1: -860, z1: -340, step: 6, at: [-1010, -430] },
  { name: 'airport-field-2', x0: -860, z0: -510, x1: -560, z1: -340, step: 6, at: [-710, -430] },
  { name: 'far-bank', x0: -236, z0: 320, x1: -174, z1: 384, step: 2, at: [-205, 350, 1] },
  ...squares('oganiru', -1420, -1660, 950, -509, 240, 8),
  ...squares('oganiru-edge', -250, -511, 250, -478.6, 250, 4),
  ...squares('oganiru-east', 248.6, -511, 950, -290, 240, 8),
  ...squares('oganiru-west', -1420, -511, -1160, -21.4, 245, 8),
  ...squares('habitation', 320, -232, 1030, 522, 190, 6),
];
// (argv[4]: a list of areas, or of their names or the start of their names; 'map' for the whole map as well)
const pick = process.argv[4] ? (process.argv[4].startsWith('[') ? JSON.parse(process.argv[4]) : process.argv[4].split(',')) : null;
const areas = !pick ? AREAS : pick.flatMap((a) => (typeof a !== 'string' ? [a] : a === 'map' ? [...AREAS, ...MAP] : [...AREAS, ...MAP].filter((b) => b.name === a || b.name.startsWith(`${a}:`))));
const LIMIT = 0.02;

// the points: where a person can stand, at each level there
function pointsOf(a) {
  const pts = [];
  // (a little off the round numbers the town's boxes are laid out by: a point exactly on a box's edge is neither in it nor
  // out of it, as it is drawn)
  for (let x = a.x0 + 0.0137; x <= a.x1 + 1e-6; x += a.step) for (let z = a.z0 + 0.0241; z <= a.z1 + 1e-6; z += a.step) {
    const px = +x.toFixed(4), pz = +z.toFixed(4);
    if (Z.zoneWalkable(px, pz, [], 0.25)) pts.push([px, pz, Z.zoneGroundY(px, pz), 'ground']);
    if (a.decks !== false) for (const dy of Z.zoneDeckHeights(px, pz)) {
      const lv = Z.zoneLevel(px, pz, dy);
      if (!lv.deck) continue;
      if (!Z.zoneWalkable(px, pz, [], 0.25, lv.y)) continue;
      pts.push([px, pz, lv.y, 'deck']);
    }
  }
  return pts;
}

const server = createDevServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
// (small: nothing is looked at, only measured, and the page draws faster meanwhile)
const context = await browser.newContext(PHONE ? { viewport: { width: 640, height: 296 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, serviceWorkers: 'block' } : { viewport: { width: 640, height: 360 }, serviceWorkers: 'block' });
const page = await context.newPage();
page.setDefaultTimeout(900000);
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
await page.goto(`${origin}/#gameclock${PHONE ? '-lite' : ''}`, { timeout: 900000 });
await page.waitForSelector('#cover-play', { state: 'visible', timeout: 900000 });
await page.evaluate(() => document.getElementById('cover-play').click());
await page.waitForSelector('#open-signup', { state: 'visible', timeout: 900000 });
await page.click('#open-signup');
await page.fill('#account-username', `Sweep_${Math.random().toString(36).slice(2, 7)}`);
await page.fill('#account-password', 'a password for the surface sweep');
await page.click('#account-submit');
await page.waitForFunction(() => window.__nlw.online.status().state === 'in', null, { timeout: 180000 });
await pastQuestion(page);
await page.fill('#name', 'Sweep');
await enterTown(page, { tap: PHONE, wait: 900000 });
await page.waitForFunction(() => window.__nlw.me && window.__nlw.me.mixer, null, { timeout: 300000 });
// (by day: nothing of the night changes what is drawn where, and the lamps' pools are marks, left out anyway)
await page.evaluate(() => {
  // the drawn surfaces in a box: every solid, upward-facing triangle (or, drawn from both sides, either way up), in a
  // grid of 2 m cells
  window.__sweep = {
    async collect(box, ylo, yhi) {
      const n = window.__nlw, CELL = 2;
      const grid = new Map(), names = [], index = new Map();
      const m4 = new THREE.Matrix4(), im = new THREE.Matrix4(), bb = new THREE.Box3(), sp = new THREE.Sphere();
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
      const label = (o) => { const out = []; for (let q = o; q && out.length < 3; q = q.parent) if (q.name) out.push(q.name); return out.join('<') || o.type; };
      let tris = 0, meshes = 0, unread = 0;
      n.scene.updateMatrixWorld(true);
      const found = [];
      n.scene.traverseVisible((o) => {
        if (!o.isMesh || o.isSkinnedMesh || (o.userData && o.userData.mark) || o.renderOrder >= 2) return;
        const mat = Array.isArray(o.material) ? o.material[0] : o.material;
        if (!mat || mat.transparent || mat.visible === false || mat.side === THREE.BackSide || mat.colorWrite === false) return;
        const g = o.geometry; if (!g || !g.attributes || !g.attributes.position) return;
        found.push(o);
      });
      const near = (m) => {
        // (whether a copy of it, as placed by `m`, can reach the box at all: by its bounding sphere, where it has one)
        const g = m.geometry || null;
        return true;
      };
      // (which of them reach the box, and where each copy of them is; then the numbers of all of those read at once, so
      // that the page draws a frame or two meanwhile, not one for each)
      const todo = [];
      for (const o of found) {
        const g = o.geometry;
        const count = o.isInstancedMesh ? o.count : 1;
        const places = [];
        for (let i = 0; i < count; i += 1) {
          const p = new THREE.Matrix4().copy(o.matrixWorld); if (o.isInstancedMesh) { o.getMatrixAt(i, im); p.multiply(im); }
          if (g.boundingSphere) {
            sp.copy(g.boundingSphere).applyMatrix4(p);
            if (sp.center.x + sp.radius < box.x0 || sp.center.x - sp.radius > box.x1 || sp.center.z + sp.radius < box.z0 || sp.center.z - sp.radius > box.z1 || sp.center.y + sp.radius < ylo || sp.center.y - sp.radius > yhi) continue;
          }
          places.push(p);
        }
        if (places.length) todo.push({ o, places });
      }
      const read = (attr) => (!attr ? Promise.resolve(null) : attr.isInterleavedBufferAttribute ? n.numbersOf(attr.data) : n.numbersOf(attr));
      const arrays = await Promise.all(todo.map(({ o }) => Promise.all([read(o.geometry.attributes.position), o.geometry.index ? n.numbersOf(o.geometry.index) : null, read(o.geometry.attributes.color)])));
      for (let q = 0; q < todo.length; q += 1) {
        const { o, places } = todo[q];
        const g = o.geometry, mat = Array.isArray(o.material) ? o.material[0] : o.material;
        const attr = g.attributes.position;
        const [arr, idx, colours] = arrays[q];
        const stride = attr.isInterleavedBufferAttribute ? attr.data.stride : attr.itemSize, offset = attr.isInterleavedBufferAttribute ? attr.offset : 0;
        if (!arr || (g.index && !idx)) { unread += 1; continue; }
        const k = !attr.normalized ? 1 : arr instanceof Int16Array ? 1 / 32767 : arr instanceof Uint16Array ? 1 / 65535 : arr instanceof Int8Array ? 1 / 127 : arr instanceof Uint8Array ? 1 / 255 : 1;
        const both = mat.side === THREE.DoubleSide;
        // (named by the mesh and the groups it is in; a merged mesh with no name of its own by the colour it gives the
        // triangle, so that what it is can be found)
        const cattr = g.attributes.color, cstride = cattr ? (cattr.isInterleavedBufferAttribute ? cattr.data.stride : cattr.itemSize) : 0, coff = cattr && cattr.isInterleavedBufferAttribute ? cattr.offset : 0;
        const ck = cattr && cattr.normalized ? (colours instanceof Uint8Array ? 1 / 255 : colours instanceof Uint16Array ? 1 / 65535 : 1) : 1;
        const base = label(o) + (mat.color && !colours ? `#${mat.color.getHexString()}` : '');
        const idOf = (vi) => {
          let name = base;
          if (colours) { const j = vi * cstride + coff; const hex = (v) => Math.round(Math.min(1, Math.max(0, Math.pow(v * ck, 1 / 2.2))) * 255).toString(16).padStart(2, '0'); name += `#${hex(colours[j])}${hex(colours[j + 1])}${hex(colours[j + 2])}`; }
          let id = index.get(name); if (id === undefined) { id = names.length; names.push(name); index.set(name, id); }
          return id;
        };
        const total = idx ? idx.length : Math.floor((arr.length - offset) / stride);
        const start = g.drawRange ? g.drawRange.start : 0;
        const end = Math.min(total, g.drawRange && Number.isFinite(g.drawRange.count) ? start + g.drawRange.count : Infinity);
        const get = (v, i) => { const j = i * stride + offset; return v.set(arr[j] * k, arr[j + 1] * k, arr[j + 2] * k); };
        let used = false;
        for (const p of places) {
          for (let t = start; t + 2 < end; t += 3) {
            const i0 = idx ? idx[t] : t, i1 = idx ? idx[t + 1] : t + 1, i2 = idx ? idx[t + 2] : t + 2;
            get(a, i0).applyMatrix4(p); get(b, i1).applyMatrix4(p); get(c, i2).applyMatrix4(p);
            const minX = Math.min(a.x, b.x, c.x), maxX = Math.max(a.x, b.x, c.x), minZ = Math.min(a.z, b.z, c.z), maxZ = Math.max(a.z, b.z, c.z);
            if (maxX < box.x0 || minX > box.x1 || maxZ < box.z0 || minZ > box.z1) continue;
            const minY = Math.min(a.y, b.y, c.y), maxY = Math.max(a.y, b.y, c.y);
            if (maxY < ylo || minY > yhi) continue;
            const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, wx = c.x - a.x, wy = c.y - a.y, wz = c.z - a.z;
            const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
            const len = Math.hypot(nx, ny, nz); if (len < 1e-10) continue;
            const up = ny / len;
            if (!(up > 0.35 || (both && up < -0.35))) continue;
            const rec = [a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, idOf(i0)];
            for (let gx = Math.floor(Math.max(minX, box.x0) / CELL); gx <= Math.floor(Math.min(maxX, box.x1) / CELL); gx += 1) for (let gz = Math.floor(Math.max(minZ, box.z0) / CELL); gz <= Math.floor(Math.min(maxZ, box.z1) / CELL); gz += 1) {
              const key = gx * 100003 + gz; let list = grid.get(key); if (!list) { list = []; grid.set(key, list); } list.push(rec);
            }
            tris += 1; used = true;
          }
        }
        if (used) meshes += 1;
      }
      window.__sweep.grid = grid; window.__sweep.names = names; window.__sweep.CELL = CELL;
      return { tris, meshes, unread, found: found.length };
    },
    // each point [x, z, stand]: every drawn surface straight down within (-1.2, +0.8) m of where a person stands
    query(points) {
      const { grid, names, CELL } = window.__sweep;
      const n = window.__nlw;
      return points.map(([x, z, stand, level]) => {
        // (the page's own test of where a person can stand: its street lamps and players' things too)
        if (typeof n.walkable === 'function' && !n.walkable(x, z, stand, 0.25)) return null;
        const list = grid.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL)) || [];
        const hits = [];
        for (const r of list) {
          const [ax, ay, az, bx, by, bz, cx, cy, cz, id] = r;
          const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
          if (Math.abs(d) < 1e-12) continue;
          const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, l3 = 1 - l1 - l2;
          if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
          const y = l1 * ay + l2 * by + l3 * cy;
          if (y < stand - 1.2 || y > stand + 0.8) continue;
          hits.push([+y.toFixed(4), names[id]]);
        }
        hits.sort((p, q) => q[0] - p[0]);
        return hits.slice(0, 5);
      });
    },
  };
});
const report = [];
for (const a of areas) {
  const pts = pointsOf(a);
  if (!pts.length) { console.log(a.name, 'no points'); continue; }
  const at = a.at || [(a.x0 + a.x1) / 2, (a.z0 + a.z1) / 2];
  await page.evaluate((at) => { const n = window.__nlw; n.place(at[0], at[1], at[2]); }, at);
  await page.waitForTimeout(a.wait || 12000);
  const ys = pts.map((p) => p[2]);
  const got = await page.evaluate(async ({ box, ylo, yhi }) => window.__sweep.collect(box, ylo, yhi), { box: { x0: a.x0 - 1, z0: a.z0 - 1, x1: a.x1 + 1, z1: a.z1 + 1 }, ylo: Math.min(...ys) - 1.5, yhi: Math.max(...ys) + 1 });
  const res = [];
  for (let i = 0; i < pts.length; i += 2000) res.push(...await page.evaluate((chunk) => window.__sweep.query(chunk), pts.slice(i, i + 2000).map((p) => [p[0], p[1], p[2], p[3]])));
  await page.evaluate(() => { window.__sweep.grid = null; });
  const rows = pts.map((p, i) => {
    const hits = res[i];
    if (hits === null) return null;
    // what the feet stand on: the highest surface drawn within 0.8 m over the stand height, down to 1.2 m under it
    const top = hits.length ? hits[0] : null;
    const diff = top ? top[0] - p[2] : null;
    return { x: p[0], z: p[1], stand: +p[2].toFixed(3), level: p[3], top: top ? top[0] : null, what: top ? top[1] : null, diff: diff === null ? null : +diff.toFixed(3), under: hits.slice(1, 3) };
  });
  const kept = rows.filter(Boolean);
  rows.length = 0; rows.push(...kept);
  const bad = rows.filter((r) => r.diff === null || Math.abs(r.diff) > LIMIT);
  // grouped by what was drawn and how far off
  const groups = new Map();
  for (const r of bad) {
    const key = `${r.level} ${r.what || '(nothing drawn)'} ${r.diff === null ? 'none' : (Math.round(r.diff * 100) / 100).toFixed(2)}`;
    const g = groups.get(key) || { key, n: 0, eg: [], box: [Infinity, Infinity, -Infinity, -Infinity] }; g.n += 1; if (g.eg.length < 4) g.eg.push([r.x, r.z, r.stand, r.top]);
    g.box = [Math.min(g.box[0], r.x), Math.min(g.box[1], r.z), Math.max(g.box[2], r.x), Math.max(g.box[3], r.z)]; groups.set(key, g);
  }
  const summary = { area: a.name, points: rows.length, tris: got.tris, meshes: got.meshes, bad: bad.length, worst: bad.reduce((m, r) => Math.max(m, r.diff === null ? 0 : Math.abs(r.diff)), 0), groups: [...groups.values()].sort((p, q) => q.n - p.n).slice(0, 25) };
  console.log(`${a.name}: ${rows.length} points (${got.tris} triangles in ${got.meshes} meshes of ${got.found}, ${got.unread} unread), ${bad.length} over 2 cm, worst ${summary.worst.toFixed(3)} m`);
  for (const g of summary.groups.slice(0, 12)) console.log(`   ${g.n} x ${g.key}  e.g. ${JSON.stringify(g.eg[0])}  in [${g.box.map((v) => Math.round(v)).join(',')}]`);
  report.push({ ...summary, rows: bad.slice(0, 400) });
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1));
}
const total = report.reduce((n, a) => n + a.bad, 0);
console.log(total ? `FAIL ${total} points over 2 cm in ${report.filter((a) => a.bad).length} of ${report.length} areas` : `ok  every point of ${report.length} areas within 2 cm (${report.reduce((n, a) => n + a.points, 0)} points)`);
await browser.close(); server.close();
process.exit(total ? 1 : 0);
