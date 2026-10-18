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
//
// And what it costs to keep (18 October 2026, the owner's brief: the game ran out of memory on phones and slowed on
// computers the longer it was played). A house model fetched for a lane the player has since left far behind is let
// go again (its shape, its pictures: `RELEASE` metres beyond where it is drawn from its model, after it has gone
// unneeded for `RELEASE_AFTER` seconds), and its houses are the plain blocks they are from afar; it is fetched again
// (from the copy the browser keeps) if the player comes back. The towers, seen from all over town, are kept.

import { ZONE_HOUSES, TOWN_TOWERS, TOWN_MODELS } from '../sim/zone.js';
import { loadSuppliedMesh } from './supplied-model.js';
import { surface, facadeTexture } from './render-kit.js';

const HOUSE_BLOCK = 0xdcd8cf;      // a house seen from afar: the owner's houses are white and pale grey
// (a tower drawn as its plain shape: its glass curtain wall, render-kit.js; it was 0x2f3946, nearly black, and from
// afar a tower whose model had not come looked like its own shadow)
const TOWER_BLOCK = 0x8fa3b8;
const TOWER_SIGHT = 220;           // metres beyond the town's own reach at which a tower is still drawn
// (a copy of the page opened from the disk cannot fetch a model: there each building is its plain block)
const ON_DISK = (() => { try { return location.protocol === 'file:'; } catch (error) { return false; } })();

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
  const RELEASE = lite ? 140 : 260, RELEASE_AFTER = 20;
  const at = (b) => ({ ...b, radius: Math.hypot(b.w, b.d) / 2, drawn: false, mesh: null });
  const houses = ZONE_HOUSES.filter((h) => h.model).map((h) => at({ id: h.id, model: h.model, x: h.x, z: h.z, heading: h.heading, k: h.k, w: h.w, d: h.d, h: h.h, kind: 'house' }));
  const towers = TOWN_TOWERS.map((t) => at({ id: t.id, model: t.model, x: t.x, z: t.z, heading: t.heading, k: t.k, w: t.w, d: t.d, h: t.h, kind: 'tower' }));
  const entries = [...houses, ...towers];
  for (const e of entries) { e.matrix = modelMatrix(e, TOWN_MODELS[e.model]); e.block = blockMatrix(e); }

  // the plain blocks: one box, drawn wherever a building is not drawn from its model
  const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
  const blocks = (colour, capacity, roughness, metalness, map = null) => {
    const mesh = new THREE.InstancedMesh(box, surface({ color: colour, roughness, metalness, ...(map ? { map } : {}), ...(env && map ? { envMap: env, envMapIntensity: 0.7 } : {}) }), capacity);
    mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.name = 'town-blocks';
    scene.add(mesh);
    return mesh;
  };
  const houseBlocks = blocks(HOUSE_BLOCK, houses.length, 0.85, 0);
  const towerBlocks = blocks(TOWER_BLOCK, towers.length, 0.3, 0.35, facadeTexture(8, 30));

  // the models, each with its houses (drawn together) and its towers (each on its own, so that what is out of view is
  // not drawn)
  const models = new Map(Object.keys(TOWN_MODELS).map((id) => [id, { id, m: TOWN_MODELS[id], state: 'idle', mesh: null, triangles: 0, failed: null, houses: houses.filter((e) => e.model === id), towers: towers.filter((e) => e.model === id), instanced: null, neededAt: 0, released: 0 }]));
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
        record.mesh = mesh; record.triangles = triangles; record.state = 'ready'; record.neededAt = performance.now() / 1000;
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
      .catch((error) => { record.state = 'failed'; record.failed = String(error.message || error); record.failedAt = performance.now(); })
      .finally(pump);
  }

  // Which building is drawn how, from where the eye is: written into the instanced meshes.
  let last = { x: 0, z: 0, reach: 0, tall: TOWER_SIGHT };
  function refresh() {
    const { x, z, reach, tall } = last;
    // (a tower stands above the town and is seen from further off than it, but never through the haze: beyond the fog's
    // far edge whatever is drawn is drawn unseen)
    const haze = scene.fog ? scene.fog.far : Infinity;
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
        const seen = Math.hypot(e.x - x, e.z - z) - e.radius < Math.min(haze, reach + tall);
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
  // (`tall`: how much further off than the town a tower is seen; from inside a hall, 0)
  function see(x, z, reach, fetch = true, tall = TOWER_SIGHT) {
    last = { x, z, reach, tall };
    // a house model no longer needed near here is let go (its houses become their blocks: see `refresh`); only in play
    // (`fetch`), where what is let go can be fetched again
    const now = performance.now() / 1000;
    for (const r of models.values()) {
      if (!fetch || keepAll || r.state !== 'ready' || r.towers.length || !r.houses.length) continue;
      const gap = Math.min(...r.houses.map((e) => Math.hypot(e.x - x, e.z - z) - e.radius));
      if (gap < HOUSE_SIGHT + RELEASE) { r.neededAt = now; continue; }
      if (now - r.neededAt > RELEASE_AFTER) release(r);
    }
    refresh();
    if (!fetch || ON_DISK) return;
    const wanted = [];
    for (const r of models.values()) {
      // (one that could not be fetched is asked for again half a minute later)
      if (r.state === 'failed' && performance.now() - (r.failedAt || 0) > 30000) r.state = 'idle';
      if (r.state !== 'idle') continue;
      let gap = Infinity;
      for (const e of r.houses) gap = Math.min(gap, Math.hypot(e.x - x, e.z - z) - e.radius - HOUSE_SIGHT - 40);
      for (const e of r.towers) gap = Math.min(gap, Math.hypot(e.x - x, e.z - z) - e.radius - Math.min(scene.fog ? scene.fog.far : Infinity, reach + tall));
      if (gap < 0) wanted.push({ r, gap });
    }
    wanted.sort((a, b) => a.gap - b.gap);
    queue = [...new Set([...wanted.map((w) => w.r), ...queue])];
    pump();
  }
  // A house model let go: its instanced houses taken from the scene, its shape and its pictures freed.
  function release(r) {
    if (r.instanced) { scene.remove(r.instanced); r.instanced.dispose && r.instanced.dispose(); r.instanced = null; }
    const material = r.mesh.material;
    for (const t of new Set(['map', 'normalMap', 'roughnessMap', 'metalnessMap'].map((key) => material[key]).filter(Boolean))) t.dispose();
    material.dispose(); r.mesh.geometry.dispose();
    r.mesh = null; r.triangles = 0; r.state = 'idle'; r.released += 1;
  }
  // (for whoever needs every one of them: the tests; still one or two at a time; and all of them kept until `keepAll`
  // is let go again)
  let keepAll = false;
  function loadAll() { if (ON_DISK) return; keepAll = true; queue = [...new Set([...queue, ...[...models.values()].filter((r) => r.state === 'idle')])]; pump(); }
  const state = () => ({
    models: [...models.values()].map((r) => ({ id: r.id, state: r.state, triangles: r.triangles, failed: r.failed, released: r.released })),
    drawn: entries.filter((e) => e.drawn).length,
    blocks: houseBlocks.count + towerBlocks.count,
    entries: entries.length,
    houseSight: HOUSE_SIGHT,
  });
  // (the tests: the geometry of the model a building is drawn from; `e.matrix` is where)
  const geometryOf = (id) => { const r = models.get(id); return r && r.mesh ? r.mesh.geometry : null; };
  return { see, loadAll, letGoAgain: () => { keepAll = false; }, state, entries, geometryOf, refresh: () => refresh() };
}
