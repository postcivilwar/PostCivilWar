// The owner's buildings in town (town-buildings.js says which and where): their houses on the plots of the plain
// houses they replaced, and their towers on the city side. Each is the supplied model exactly as it is (its one mesh,
// its picture, its material's own finish: supplied-model.js), turned so that its front faces the lane or the road,
// and drawn at one uniform scale; nothing in its file is changed.
//
// A model is fetched when the first building drawn from it comes within sight, the nearest first, one or two at a
// time (each file carries an 8192-pixel picture, and decoding one takes a moment and a good deal of memory); every
// building of that model then shares its one mesh and picture. Its picture is handed to the graphics card at 2048
// pixels on a computer and 1024 on a phone (the file keeps its 8192): nineteen buildings at their full size would
// need several gigabytes of graphics memory.
//
// What it costs to draw. Each model is about ten thousand triangles; the plain houses were a few dozen. So:
//   - the houses of one model are drawn together, in one go (an instanced mesh), and only those near enough to be
//     seen as more than a block (`HOUSE_SIGHT`); further off, out to where the town is drawn at all, each house is a
//     plain block of its size and colour, all of them in one go, as is a house whose model has not come yet;
//   - a tower is always drawn from its model, from further off than the rest of the town (it stands above it).

import { ZONE_HOUSES, TOWN_TOWERS, TOWN_MODELS } from '../sim/zone.js';
import { loadSuppliedMesh } from './supplied-model.js';
import { surface } from './render-kit.js';

const HOUSE_BLOCK = 0xdcd8cf;      // a house seen from afar: the owner's houses are white and pale grey
const TOWER_BLOCK = 0x2f3946;
const TOWER_SIGHT = 220;           // metres beyond the town's own reach at which a tower is still drawn

// Where a building's model is drawn: its own frame turned so that its front faces +z, the middle of its foot at the
// origin, scaled, then turned to its heading and set on its plot.
function modelMatrix(e, m) {
  const turn = new THREE.Matrix4().makeRotationY(-m.front);
  const scale = new THREE.Matrix4().makeScale(e.k, e.k, e.k);
  const centre = new THREE.Matrix4().makeTranslation(-m.mid[0] * e.k, 0, -m.mid[1] * e.k);
  const place = new THREE.Matrix4().makeRotationY(e.heading).setPosition(e.x, 0, e.z);
  return place.multiply(centre).multiply(scale).multiply(turn);
}
// Its plain block: the footprint's box (world axes), a little lower than the building
function blockMatrix(e) {
  return new THREE.Matrix4().compose(new THREE.Vector3(e.x, 0, e.z), new THREE.Quaternion(), new THREE.Vector3(e.w, e.h * (e.kind === 'house' ? 0.8 : 0.9), e.d));
}

export function createTownBuildings(scene, { lite = false, maxTexture = 2048, env = null } = {}) {
  const most = Math.min(lite ? 1024 : 2048, maxTexture || 2048);
  const HOUSE_SIGHT = lite ? 110 : 170;
  const at = (b) => ({ ...b, radius: Math.hypot(b.w, b.d) / 2, drawn: false, mesh: null });
  const houses = ZONE_HOUSES.filter((h) => h.model).map((h) => at({ id: h.id, model: h.model, x: h.x, z: h.z, heading: h.heading, k: h.k, w: h.w, d: h.d, h: h.h, kind: 'house' }));
  const towers = TOWN_TOWERS.map((t) => at({ id: t.id, model: t.model, x: t.x, z: t.z, heading: t.heading, k: t.k, w: t.w, d: t.d, h: t.h, kind: 'tower' }));
  const entries = [...houses, ...towers];
  for (const e of entries) { e.matrix = modelMatrix(e, TOWN_MODELS[e.model]); e.block = blockMatrix(e); }

  // the plain blocks: one box, drawn wherever a building is not drawn from its model
  const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
  const blocks = (colour, capacity, roughness, metalness) => {
    const mesh = new THREE.InstancedMesh(box, surface({ color: colour, roughness, metalness }), capacity);
    mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.name = 'town-blocks';
    scene.add(mesh);
    return mesh;
  };
  const houseBlocks = blocks(HOUSE_BLOCK, houses.length, 0.85, 0);
  const towerBlocks = blocks(TOWER_BLOCK, towers.length, 0.35, 0.4);

  // the models, each with its houses (drawn together) and its towers (each on its own, so that what is out of view is
  // not drawn)
  const models = new Map(Object.keys(TOWN_MODELS).map((id) => [id, { id, m: TOWN_MODELS[id], state: 'idle', mesh: null, triangles: 0, failed: null, houses: houses.filter((e) => e.model === id), towers: towers.filter((e) => e.model === id), instanced: null }]));
  const busy = () => [...models.values()].filter((r) => r.state === 'loading').length;
  const atOnce = lite ? 1 : 2;
  let queue = [];
  function pump() {
    queue = queue.filter((r) => r.state === 'idle');
    while (queue.length && busy() < atOnce) load(queue.shift());
  }
  function load(record) {
    record.state = 'loading';
    const m = record.m;
    loadSuppliedMesh(m.file, { maxTexture: most, env, brand: m.brand || null, name: `town-${m.id}` })
      .then(({ mesh, triangles }) => {
        record.mesh = mesh; record.triangles = triangles; record.state = 'ready';
        if (record.houses.length) {
          const inst = new THREE.InstancedMesh(mesh.geometry, mesh.material, record.houses.length);
          inst.count = 0; inst.frustumCulled = false; inst.castShadow = true; inst.receiveShadow = true;
          inst.name = `town-${m.id}`;
          scene.add(inst);
          record.instanced = inst;
        }
        for (const e of record.towers) {
          const t = new THREE.Mesh(mesh.geometry, mesh.material);
          t.matrixAutoUpdate = false; t.matrix.copy(e.matrix); t.updateMatrixWorld(true);
          t.castShadow = true; t.receiveShadow = true; t.visible = false;
          t.name = `town-${m.id}`;
          scene.add(t);
          e.mesh = t;
        }
        refresh();
      })
      .catch((error) => { record.state = 'failed'; record.failed = String(error.message || error); })
      .finally(pump);
  }

  // Which building is drawn how, from where the eye is: written into the instanced meshes.
  let last = { x: 0, z: 0, reach: 0 };
  function refresh() {
    const { x, z, reach } = last;
    let nb = 0, nt = 0;
    for (const r of models.values()) {
      let n = 0;
      for (const e of r.houses) {
        const gap = Math.hypot(e.x - x, e.z - z) - e.radius;
        e.drawn = false;
        if (gap > reach) continue;
        if (r.instanced && gap < HOUSE_SIGHT) { r.instanced.setMatrixAt(n, e.matrix); n += 1; e.drawn = true; }
        else { houseBlocks.setMatrixAt(nb, e.block); nb += 1; }
      }
      if (r.instanced) { r.instanced.count = n; r.instanced.instanceMatrix.needsUpdate = true; }
      for (const e of r.towers) {
        const seen = Math.hypot(e.x - x, e.z - z) - e.radius < reach + TOWER_SIGHT;
        e.drawn = seen && !!e.mesh;
        if (e.mesh) e.mesh.visible = seen;
        else if (seen) { towerBlocks.setMatrixAt(nt, e.block); nt += 1; }
      }
    }
    houseBlocks.count = nb; houseBlocks.instanceMatrix.needsUpdate = true;
    towerBlocks.count = nt; towerBlocks.instanceMatrix.needsUpdate = true;
  }

  // What is in sight from (x, z): drawn; and, when `fetch` (once the town is ready), the models wanted there fetched,
  // the nearest first: a house's once it is nearly near enough to be drawn from it, a tower's once it is in sight.
  function see(x, z, reach, fetch = true) {
    last = { x, z, reach };
    refresh();
    if (!fetch) return;
    const wanted = [];
    for (const r of models.values()) {
      if (r.state !== 'idle') continue;
      let gap = Infinity;
      for (const e of r.houses) gap = Math.min(gap, Math.hypot(e.x - x, e.z - z) - e.radius - HOUSE_SIGHT - 40);
      for (const e of r.towers) gap = Math.min(gap, Math.hypot(e.x - x, e.z - z) - e.radius - reach - TOWER_SIGHT);
      if (gap < 0) wanted.push({ r, gap });
    }
    wanted.sort((a, b) => a.gap - b.gap);
    queue = [...new Set([...wanted.map((w) => w.r), ...queue])];
    pump();
  }
  // (for whoever needs every one of them: the tests; still one or two at a time)
  function loadAll() { queue = [...new Set([...queue, ...[...models.values()].filter((r) => r.state === 'idle')])]; pump(); }
  const state = () => ({
    models: [...models.values()].map((r) => ({ id: r.id, state: r.state, triangles: r.triangles, failed: r.failed })),
    drawn: entries.filter((e) => e.drawn).length,
    blocks: houseBlocks.count + towerBlocks.count,
    entries: entries.length,
    houseSight: HOUSE_SIGHT,
  });
  // (the tests: the geometry of the model a building is drawn from; `e.matrix` is where)
  const geometryOf = (id) => { const r = models.get(id); return r && r.mesh ? r.mesh.geometry : null; };
  return { see, loadAll, state, entries, geometryOf, refresh: () => refresh() };
}
