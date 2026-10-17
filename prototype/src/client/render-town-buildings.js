// The owner's buildings in town (town-buildings.js says which and where): their houses on the plots of the plain
// houses they replaced, and their towers on the city side. Each is the supplied model exactly as it is (its one mesh,
// its picture, its material's own finish: supplied-model.js), turned so that its front faces the lane or the road,
// and drawn at one uniform scale; nothing in its file is changed.
//
// A model is fetched when the first building drawn from it comes within sight, the nearest first, one or two at a
// time (each file carries an 8192-pixel picture, and decoding one takes a moment and a good deal of memory); every
// building of that model then shares its one mesh and picture. Until a building's model has come, a plain block of
// its size stands in its place. Its picture is handed to the graphics card at 2048 pixels on a computer and 1024 on a
// phone (the file keeps its 8192): nineteen buildings at their full size would need several gigabytes of graphics
// memory. A building out of sight is not drawn; a tower is seen from further off than a house.

import { ZONE_HOUSES, TOWN_TOWERS, TOWN_MODELS } from '../sim/zone.js';
import { loadSuppliedMesh } from './supplied-model.js';
import { surface } from './render-kit.js';

const STAND_IN = { house: 0xd8d4cb, tower: 0x2f3946 };
const TOWER_SIGHT = 220;            // metres beyond the town's own reach at which a tower is still drawn

// One building: where it stands and what it is drawn from. Its model's own frame is turned so that its front faces
// +z and set so that the middle of its foot is at the origin, then scaled and turned to its heading.
function placeModel(mesh, m, k) {
  mesh.rotation.y = -m.front;
  const fit = new THREE.Group();
  fit.scale.setScalar(k);
  fit.position.set(-m.mid[0] * k, 0, -m.mid[1] * k);
  fit.add(mesh);
  return fit;
}

export function createTownBuildings(scene, { lite = false, maxTexture = 2048, env = null } = {}) {
  const most = Math.min(lite ? 1024 : 2048, maxTexture || 2048);
  const at = (b) => ({ ...b, radius: Math.hypot(b.w, b.d) / 2 });
  const entries = [
    ...ZONE_HOUSES.filter((h) => h.model).map((h) => at({ id: h.id, model: h.model, x: h.x, z: h.z, heading: h.heading, k: h.k, w: h.w, d: h.d, h: h.h, kind: 'house' })),
    ...TOWN_TOWERS.map((t) => at({ id: t.id, model: t.model, x: t.x, z: t.z, heading: t.heading, k: t.k, w: t.w, d: t.d, h: t.h, kind: 'tower' })),
  ];
  const standInGeometry = new THREE.BoxGeometry(1, 1, 1);
  standInGeometry.translate(0, 0.5, 0);
  const standInMaterials = { house: surface({ color: STAND_IN.house, roughness: 0.8, metalness: 0 }), tower: surface({ color: STAND_IN.tower, roughness: 0.35, metalness: 0.4 }) };
  for (const e of entries) {
    e.holder = new THREE.Group();
    e.holder.position.set(e.x, 0, e.z);
    e.holder.rotation.y = e.heading;
    e.holder.name = `town-${e.id}`;
    // (the stand-in is the footprint's box, in the world's axes: the holder is turned, so it is turned back)
    e.standIn = new THREE.Mesh(standInGeometry, standInMaterials[e.kind]);
    const side = Math.abs(Math.sin(e.heading)) > 0.5;
    e.standIn.scale.set(side ? e.d : e.w, e.h * (e.kind === 'house' ? 0.8 : 0.9), side ? e.w : e.d);
    e.standIn.castShadow = true; e.standIn.receiveShadow = true;
    e.holder.add(e.standIn);
    e.holder.visible = false;
    e.drawn = null;
    scene.add(e.holder);
  }

  const models = new Map(Object.keys(TOWN_MODELS).map((id) => [id, { id, m: TOWN_MODELS[id], state: 'idle', mesh: null, triangles: 0, failed: null }]));
  const busy = () => [...models.values()].filter((r) => r.state === 'loading').length;
  const most_at_once = lite ? 1 : 2;
  // models waiting their turn, the nearest first; one is begun whenever one has finished
  let queue = [];
  function pump() {
    queue = queue.filter((r) => r.state === 'idle');
    while (queue.length && busy() < most_at_once) load(queue.shift());
  }
  function load(record) {
    record.state = 'loading';
    const m = record.m;
    loadSuppliedMesh(m.file, { maxTexture: most, env, brand: m.brand || null, name: `town-${m.id}` })
      .then(({ mesh, triangles }) => {
        record.mesh = mesh; record.triangles = triangles; record.state = 'ready';
        for (const e of entries) if (e.model === m.id) dress(e);
      })
      .catch((error) => { record.state = 'failed'; record.failed = String(error.message || error); })
      .finally(pump);
  }
  // a building whose model has come: drawn from it, the stand-in put away
  function dress(e) {
    const record = models.get(e.model);
    if (e.drawn || record.state !== 'ready') return;
    const mesh = new THREE.Mesh(record.mesh.geometry, record.mesh.material);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.name = `town-${e.model}`;
    e.drawn = placeModel(mesh, record.m, e.k);
    e.holder.add(e.drawn);
    e.standIn.visible = false;
  }

  // What is in sight from (x, z): drawn; and, when `fetch` (once the town is ready), the models wanted there fetched,
  // the nearest first.
  function see(x, z, reach, fetch = true) {
    const wanted = [];
    for (const e of entries) {
      const gap = Math.hypot(e.x - x, e.z - z) - e.radius;
      const visible = gap < reach + (e.kind === 'tower' ? TOWER_SIGHT : 0);
      e.holder.visible = visible;
      if (visible && models.get(e.model).state === 'idle') wanted.push({ record: models.get(e.model), gap });
    }
    if (!fetch) return;
    wanted.sort((a, b) => a.gap - b.gap);
    queue = [...new Set([...wanted.map((w) => w.record), ...queue])];
    pump();
  }
  // (for whoever needs every one of them: the tests; still one or two at a time)
  function loadAll() { queue = [...new Set([...queue, ...[...models.values()].filter((r) => r.state === 'idle')])]; pump(); }
  const state = () => ({
    models: [...models.values()].map((r) => ({ id: r.id, state: r.state, triangles: r.triangles, failed: r.failed })),
    shown: entries.filter((e) => e.holder.visible).length,
    drawn: entries.filter((e) => e.drawn).length,
    entries: entries.length,
  });
  return { see, loadAll, state, entries };
}
