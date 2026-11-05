// Rings on the water round whoever wades in it (5 November 2026, the owner's brief on feet and tyres: "in water the legs
// are seen faintly through it, with ripples round them; the same for a car in shallow water"). The habitation's shallows
// are never more than half solid where they can be waded (render-habitation.js), so legs and wheels are seen through
// them already; this adds the rings that spread out from each one where it comes through the surface: one every few
// tenths of a second while it moves (more, the faster it goes), now and then while it stands, each widening and fading
// over a second and a half. One draw, drawn after the water (and only while there are any), Medium and up.
//
//   const rings = createWaterRings(scene, { lite })
//   rings.update(dt, { amount, movers, water(x, z), eye })
//     amount   the level's (0: none)
//     movers   [{ key, x, z, heading, kind: 'foot' | 'car' | 'keke' | 'bike' }] (main.js groundMovers)
//     water    the water at a point: { level, depth } or null (zones/habitation.js habitationWaterAt)
//   rings.state()  (the tests)

const LIFE = 1.5;                                    // seconds a ring lasts
const SIZE = { foot: [0.16, 0.85], car: [0.9, 2.6], keke: [0.6, 1.9], bike: [0.3, 1.2] };     // radius as it starts, as it ends
const EVERY = { moving: 0.32, still: 1.1 };          // seconds between rings, going and standing
const DEPTH = { foot: [0.05, 1.25], car: [0.05, 0.6], keke: [0.05, 0.45], bike: [0.05, 0.4] };  // the depths it is waded or driven in

function ringPicture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 18, 32, 32, 31);
  r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.55, 'rgba(255,255,255,0.85)'); r.addColorStop(0.75, 'rgba(255,255,255,0.35)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function createWaterRings(scene, { lite = false } = {}) {
  const MOST = lite ? 40 : 90;
  const geometry = new THREE.PlaneGeometry(2, 2); geometry.rotateX(-Math.PI / 2);
  const fade = new Float32Array(MOST);
  geometry.setAttribute('aFade', new THREE.InstancedBufferAttribute(fade, 1).setUsage(THREE.DynamicDrawUsage));
  const material = new THREE.MeshBasicMaterial({ map: ringPicture(), color: 0xe8f2f4, transparent: true, depthWrite: false, opacity: 0.55, toneMapped: false });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float aFade;\nvarying float vFade;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vFade;').replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a *= vFade;');
  };
  material.customProgramCacheKey = () => 'pcw-water-rings';
  const mesh = new THREE.InstancedMesh(geometry, material, MOST);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.name = 'water-rings'; mesh.frustumCulled = false; mesh.count = 0; mesh.visible = false;
  // (on the water, which is drawn see-through: after it)
  mesh.renderOrder = 3;
  scene.add(mesh);
  const list = [];                   // { x, y, z, r0, r1, age }
  const last = new Map();            // a mover's key -> { x, z, wait }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  let made = 0;

  function update(dt, { amount = 0, movers = [], water = () => null, eye = null } = {}) {
    const seen = new Set();
    if (amount > 0) for (const w of movers) {
      const size = SIZE[w.kind], depths = DEPTH[w.kind];
      if (!size) continue;
      if (eye && Math.hypot(w.x - eye.x, w.z - eye.z) > 60) continue;
      seen.add(w.key);
      let e = last.get(w.key);
      if (!e) { e = { x: w.x, z: w.z, wait: 0 }; last.set(w.key, e); }
      const went = Math.hypot(w.x - e.x, w.z - e.z);
      e.x = w.x; e.z = w.z;
      e.wait -= dt;
      if (e.wait > 0) continue;
      const at = water(w.x, w.z);
      if (!at || !(at.depth > depths[0]) || !(at.depth < depths[1])) { e.wait = 0.25; continue; }
      const speed = dt > 0 ? went / dt : 0;
      e.wait = speed > 0.3 ? EVERY.moving / Math.min(3, Math.max(1, speed / 1.4)) : EVERY.still;
      list.push({ x: w.x, y: at.level + 0.012, z: w.z, r0: size[0], r1: size[1] * (speed > 0.3 ? 1 : 0.7), age: 0 });
      made += 1;
      if (list.length > MOST) list.shift();
    }
    for (const key of last.keys()) if (!seen.has(key)) last.delete(key);
    let n = 0;
    for (let i = list.length - 1; i >= 0; i -= 1) { list[i].age += dt; if (list[i].age >= LIFE) list.splice(i, 1); }
    for (const r of list) {
      const t = r.age / LIFE, e = 1 - (1 - t) * (1 - t);
      const radius = r.r0 + (r.r1 - r.r0) * e;
      m.compose(p.set(r.x, r.y, r.z), q, s.set(radius, 1, radius));
      mesh.setMatrixAt(n, m);
      fade[n] = Math.min(1, t * 8) * (1 - t);
      n += 1;
    }
    mesh.count = n;
    mesh.visible = n > 0 && amount > 0;
    if (n) { mesh.instanceMatrix.needsUpdate = true; geometry.attributes.aFade.needsUpdate = true; }
  }
  return { update, state: () => ({ rings: mesh.visible ? mesh.count : 0, made }) };
}
