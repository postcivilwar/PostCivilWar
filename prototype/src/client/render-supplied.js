// The owner's vehicles of 17 October 2026 where they stand or go (supplied-vehicles.js says which and where): each the
// supplied model exactly as it is (its one mesh, its pictures, its material's own finish), turned to face the way it
// should and drawn at its own size.
//
// The jet and the two trucks stand where they are put. Each is fetched as someone comes within `reach` of it, and
// let go again (its pictures handed back) when they are far beyond it; until it has come a plain box of its size
// stands in its place, since it is solid there all along. The ambulance is the hospital's van that the simulation
// drives (care.js): its model is fetched once the town is ready, and until then the van the town always had stands
// in for it. Its lamps flash on the light bar on its roof while it is on a call.

import { SUPPLIED_VEHICLES } from '../sim/zone.js';
import { loadSuppliedMesh } from './supplied-model.js';
import { surface } from './render-kit.js';

// The model turned so that its front is toward +z, its middle over the origin and its wheels on the ground, at the
// scale that makes it `length` long. Returns the group to place, and its size.
export function fitVehicle(mesh, v) {
  const pos = mesh.geometry.attributes.position, c = Math.cos(v.front), s = Math.sin(v.front);
  let u0 = Infinity, u1 = -Infinity, w0 = Infinity, w1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const u = x * c - z * s, w = x * s + z * c;          // across it (its left +), and along it (its front +)
    if (u < u0) u0 = u; if (u > u1) u1 = u;
    if (w < w0) w0 = w; if (w > w1) w1 = w;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const k = v.length / (w1 - w0);
  mesh.rotation.y = -v.front;
  const fit = new THREE.Group();
  fit.scale.setScalar(k);
  fit.position.set((-(u0 + u1) / 2) * k, -y0 * k, (-(w0 + w1) / 2) * k);
  fit.add(mesh);
  return { fit, scale: k, size: { length: v.length, width: (u1 - u0) * k, height: (y1 - y0) * k }, frame: { c, s, u0, u1, w0, w1, y0, y1, k } };
}

// The front edge of its roof, in its own frame (front +z): where an ambulance's light bar is.
function roofFront(mesh, frame) {
  const pos = mesh.geometry.attributes.position, { c, s, u0, u1, w0, w1, y0, y1, k } = frame;
  const high = y1 - (y1 - y0) * 0.06;
  let front = -Infinity;
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i); if (y < high) continue;
    const w = pos.getX(i) * s + pos.getZ(i) * c;
    if (w > front) front = w;
  }
  return { z: (front - (w0 + w1) / 2) * k, y: (y1 - y0) * k, half: ((u1 - u0) / 2) * k };
}

const STAND_IN = 0x3a3f46;
// (a copy of the page opened from the disk cannot fetch a model: there the plain shapes stand in for them)
const ON_DISK = (() => { try { return location.protocol === 'file:'; } catch (error) { return false; } })();
const FROM_DISK = 'This copy of the page is opened from the disk, where the model cannot be fetched.';

export function createSupplied(scene, { lite = false, maxTexture = 4096, env = null } = {}) {
  const most = Math.min(lite ? 2048 : 4096, maxTexture || 4096);
  const parked = ['jet', 'boxTruck', 'heavyTruck'].map((id) => {
    const v = SUPPLIED_VEHICLES[id];
    const holder = new THREE.Group();
    holder.position.set(v.x, 0, v.z); holder.rotation.y = v.heading;
    holder.name = `supplied-${id}`;
    // (the jet's stand-in is its fuselage only: a box as wide as its wings would be a wall)
    const standIn = new THREE.Mesh(new THREE.BoxGeometry(id === 'jet' ? 2.8 : v.width, id === 'jet' ? 2.8 : v.height * 0.92, v.length), surface({ color: STAND_IN, roughness: 0.6, metalness: 0.2 }));
    standIn.position.y = (id === 'jet' ? 2.8 : v.height * 0.92) / 2; standIn.castShadow = true;
    holder.add(standIn);
    scene.add(holder);
    return { id, v, holder, standIn, model: null, loading: null, failed: null, triangles: 0 };
  });

  function load(p) {
    if (p.model || p.loading) return p.loading;
    if (ON_DISK) { p.failed = FROM_DISK; return null; }
    p.failed = null;
    p.loading = loadSuppliedMesh(p.v.file, { maxTexture: most, env, name: `supplied-${p.id}` })
      .then(({ mesh, triangles }) => {
        const { fit } = fitVehicle(mesh, p.v);
        p.model = fit; p.triangles = triangles;
        p.holder.add(fit); p.standIn.visible = false;
      })
      .catch((error) => { p.failed = String(error.message || error); p.failedAt = performance.now(); })
      .finally(() => { p.loading = null; });
    return p.loading;
  }
  function release(p) {
    if (!p.model) return;
    p.holder.remove(p.model);
    p.model.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); for (const key of ['map', 'normalMap', 'roughnessMap']) if (o.material[key]) o.material[key].dispose(); o.material.dispose(); } });
    p.model = null; p.standIn.visible = true;
  }

  // ---- the ambulance ----
  let ambulance = null;          // { mesh, fit, lamps } once its model has come
  let ambulanceLoading = null;
  let ambulanceFailedAt = 0;
  function loadAmbulance() {
    // (one that could not be fetched is asked for again half a minute later; from the disk, never)
    if (ambulance && ambulance.failed && !ON_DISK && performance.now() - ambulanceFailedAt > 30000) ambulance = null;
    if (ambulance || ambulanceLoading) return ambulanceLoading;
    if (ON_DISK) { ambulance = { failed: FROM_DISK }; return null; }
    const v = SUPPLIED_VEHICLES.ambulance;
    ambulanceLoading = loadSuppliedMesh(v.file, { maxTexture: most, env, name: 'supplied-ambulance' })
      .then(({ mesh, triangles }) => {
        const { fit, frame } = fitVehicle(mesh, v);
        const roof = roofFront(mesh, frame);
        ambulance = { fit, roof, triangles };
      })
      .catch((error) => { ambulance = { failed: String(error.message || error) }; ambulanceFailedAt = performance.now(); })
      .finally(() => { ambulanceLoading = null; });
    return ambulanceLoading;
  }
  // Puts the model into the van's group, in place of the van, with two lamps at the front of its roof. Returns the
  // lamps (to be lit by whoever drives it), or null while the model has not come.
  function dressAmbulance(van) {
    if (!ambulance || ambulance.failed || van.dressed) return van.dressed || null;
    van.group.add(ambulance.fit);
    for (const child of van.group.children) if (child !== ambulance.fit) child.visible = false;
    const lamps = [];
    for (const side of [-1, 1]) {
      const material = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, emissive: side < 0 ? 0xff2020 : 0x2f6fff, emissiveIntensity: 0, roughness: 0.3 });
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.24), material);
      lamp.position.set(side * Math.min(0.62, ambulance.roof.half * 0.55), ambulance.roof.y + 0.02, ambulance.roof.z - 0.2);
      van.group.add(lamp);
      lamps.push({ side, lamp, material });
    }
    van.dressed = { lamps };
    return van.dressed;
  }

  function tick(eye) {
    for (const p of parked) {
      const d = Math.hypot(eye.x - p.v.x, eye.z - p.v.z);
      // (one that could not be fetched is asked for again half a minute later; from the disk, never)
      if (d < p.v.reach && (!p.failed || (!ON_DISK && performance.now() - (p.failedAt || 0) > 30000))) load(p);
      else if (d > p.v.reach * 1.6) release(p);
    }
  }
  const state = () => ({
    parked: parked.map((p) => ({ id: p.id, loaded: !!p.model, loading: !!p.loading, failed: p.failed, triangles: p.triangles, standIn: p.standIn.visible, at: [p.holder.position.x, p.holder.position.z], heading: p.holder.rotation.y })),
    ambulance: ambulance ? { loaded: !ambulance.failed, failed: ambulance.failed || null, triangles: ambulance.triangles || 0 } : { loaded: false, loading: !!ambulanceLoading },
  });
  return { tick, load: (id) => load(parked.find((p) => p.id === id)), loadAmbulance, dressAmbulance, state, parked };
}
