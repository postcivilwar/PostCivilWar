// The speedboat on the River Niger (31 October 2026, stage 4 of the owner's brief of 30 October): the player's own, at
// its wheel; theirs left moored; other players' as they drive them. The owner's model (sports-model.js), afloat (the
// stand it is shown on at the mall left off), sitting in the water as such a boat does: a little down by the stern at
// rest, its bow up as it climbs onto the plane and level on it, banked into its turns, rocking on the ripples and lifted
// by any wave; its outboard turned as it is steered and its wheel with it; a wake of white water spreading behind it as
// it goes. The driver sits in the right-hand seat, hands on the wheel, as the wheel turns.
//
//   const boats = createBoatView(scene, { lite });
//   boats.update(dt, { driven, rides, moored, from, now, waveAt });   each frame
//   boats.seat(me, driven)                                             after the driver's figure is posed (seated)
import { loadSport } from './sports-model.js';
import { reach } from './animated.js';
import { bonesOf } from './own-bike-view.js';
import { SPORTS_PARTS } from './sports-parts.js';
import { WATER } from '../sim/zone.js';

const SIGHT = 160, PEER_MOST = 3, MOORED_MOST = 2;
export const AFLOAT = Object.freeze({ draft: 0.24, bob: 0.035, rock: 0.02, wake: 4, every: 0.08 });
const v = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), q: new THREE.Quaternion(), up: new THREE.Vector3(0, 1, 0) };

// The wake: a band of foam each side of the line the stern has followed, wider and fainter the older it is.
function makeWake(scene) {
  const n = Math.ceil(AFLOAT.wake / AFLOAT.every) + 2;
  const pos = new Float32Array(n * 4 * 3), col = new Float32Array(n * 4 * 4);
  const index = [];
  for (let i = 0; i < n - 1; i += 1) for (const s of [0, 2]) { const a = i * 4 + s, b = a + 1, c = a + 4, d = a + 5; index.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  g.setIndex(index);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  m.frustumCulled = false; m.renderOrder = 2; m.name = 'boat-wake';
  scene.add(m);
  const trail = [];       // { x, z, h, at, speed }
  return {
    mesh: m,
    add(x, z, h, now, speed) { if (!trail.length || now - trail[0].at >= AFLOAT.every) trail.unshift({ x, z, h, at: now, speed }); while (trail.length > n) trail.pop(); },
    draw(now) {
      for (let i = 0; i < n; i += 1) {
        const p = trail[Math.min(i, trail.length - 1)];
        const age = p ? now - p.at : 0, k = p ? Math.max(0, 1 - age / AFLOAT.wake) : 0;
        const strength = p ? Math.min(1, p.speed / 4) * k : 0;
        const spread = 0.5 + age * 1.3, band = 0.35 + age * 0.35;
        const lx = p ? Math.cos(p.h) : 1, lz = p ? -Math.sin(p.h) : 0;
        const y = WATER + 0.02;
        for (const [s, side] of [[0, 1], [2, -1]]) {
          const inner = spread - band / 2, outer = spread + band / 2;
          const j = i * 4 + s;
          pos.set([(p ? p.x : 0) + lx * side * inner, y, (p ? p.z : 0) + lz * side * inner], j * 3);
          pos.set([(p ? p.x : 0) + lx * side * outer, y, (p ? p.z : 0) + lz * side * outer], (j + 1) * 3);
          col.set([0.94, 0.97, 1, strength * 0.75], j * 4);
          col.set([0.94, 0.97, 1, strength * 0.35], (j + 1) * 4);
        }
      }
      g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
      m.visible = trail.length > 1;
    },
    dispose() { scene.remove(m); g.dispose(); m.material.dispose(); },
  };
}

export function createBoatView(scene, { lite = false, base = 'sports/', onError = () => {}, priority } = {}) {
  const shown = new Map();          // key -> { model, loading, failed, wake, phase, at: {x, z, h} }
  const frozen = new Set();
  const tier = lite ? '1k' : '2k';
  const spec = SPORTS_PARTS.speedboat;

  function entry(key) {
    let e = shown.get(key);
    if (!e) {
      e = { model: null, loading: true, failed: false, wake: makeWake(scene), phase: Math.random() * 10 };
      shown.set(key, e);
      loadSport('speedboat', { base, tier: key === 'drive' ? tier : '512', priority, afloat: true }).then((m) => {
        if (shown.get(key) !== e) { m.dispose(); return; }
        e.model = m; e.loading = false; scene.add(m.group);
      }, (error) => { e.loading = false; e.failed = true; onError(error); });
    }
    return e;
  }
  const drop = (e) => { if (e.model) e.model.dispose(); e.wake.dispose(); };

  // A boat at (x, z) facing h: in the water, rocking, lifted by a wave (`waveAt(x, z)`, metres), its bow and its bank as
  // it is going, its motor and wheel turned by `steer`.
  function place(e, b, dt, now, waveAt, moving) {
    e.phase += dt;
    const lift = waveAt ? waveAt(b.x, b.z) : 0;
    // (a wave's slope pitches it: the water's height a little ahead and behind)
    const ahead = waveAt ? waveAt(b.x + Math.sin(b.h) * 2, b.z + Math.cos(b.h) * 2) - waveAt(b.x - Math.sin(b.h) * 2, b.z - Math.cos(b.h) * 2) : 0;
    const calm = moving ? 1 - Math.min(1, Math.abs(b.speed || 0) / 8) * 0.6 : 1;
    const bob = AFLOAT.bob * calm * Math.sin(e.phase * 1.7) + AFLOAT.bob * 0.5 * calm * Math.sin(e.phase * 2.9 + 1);
    const pitch = (b.pitch || 0) + Math.atan2(ahead, 4) + AFLOAT.rock * calm * Math.sin(e.phase * 1.3 + 0.4) + (moving ? 0 : 0.015);
    const roll = (b.bank || 0) + AFLOAT.rock * calm * Math.sin(e.phase * 1.1 + 2);
    if (!e.model) return;
    const g = e.model.group;
    g.position.set(b.x, WATER - spec.keel - AFLOAT.draft + bob + lift, b.z);
    g.rotation.set(-pitch, b.h, 0, 'YXZ');
    e.model.pose({ steer: b.steer || 0, tilt: roll });
    g.updateMatrixWorld(true);
    // the wake, from its stern
    const sx = b.x - Math.sin(b.h) * 2.4, sz = b.z - Math.cos(b.h) * 2.4;
    e.wake.add(sx, sz, b.h, now, Math.abs(b.speed || 0));
    e.wake.draw(now);
  }

  // driven: { x, z, h, speed, steer, bank, pitch } or null (the player's); rides: [{ key, ... }] (others'); moored: [{ x, z, h }]
  function update(dt, { driven = null, rides = [], moored = [], from = { x: 0, z: 0 }, now = 0, waveAt = null }) {
    for (const f of frozen) f.freeze = false;
    frozen.clear();
    const wanted = new Set();
    const dist = (q) => Math.hypot(q.x - from.x, q.z - from.z);
    if (driven) { wanted.add('drive'); place(entry('drive'), driven, dt, now, waveAt, true); }
    for (const r of rides.filter((q) => dist(q) < SIGHT).sort((a, b) => dist(a) - dist(b)).slice(0, PEER_MOST)) { const key = `peer:${r.key}`; wanted.add(key); place(entry(key), r, dt, now, waveAt, true); }
    for (const m of moored.filter((q) => dist(q) < SIGHT).slice(0, MOORED_MOST)) { const key = m.key || `moored:${m.boat || 'speedboat'}`; wanted.add(key); place(entry(key), { ...m, speed: 0 }, dt, now, waveAt, false); }
    for (const [key, e] of shown) if (!wanted.has(key)) { drop(e); shown.delete(key); }
  }

  // The driver at the wheel: hips on the right-hand seat, hands on the wheel's rim (carried round as it turns), feet
  // forward on the floor; the body upright, a little forward at speed. Gives false while the boat is still being fetched.
  function seat(me, d, key = 'drive') {
    const e = shown.get(key);
    if (!e || !e.model || !me || !me.bones || !d) return false;
    const m = e.model;
    const bones = bonesOf(me);
    const pelvis = bones.get('pelvis');
    if (!pelvis) return false;
    if (!me.animated) { me.freeze = true; frozen.add(me); }
    m.group.updateMatrixWorld(true);
    m.lean.getWorldQuaternion(v.q);
    me.group.quaternion.copy(v.q);
    me.group.position.set(0, 0, 0);
    me.group.updateMatrixWorld(true);
    const hips = me.group.worldToLocal(pelvis.getWorldPosition(new THREE.Vector3()));
    const s = spec.seats[0];
    const want = m.frame.localToWorld(new THREE.Vector3(s[0], s[1] + 0.1, s[2]));
    me.group.position.copy(want).sub(hips.clone().applyQuaternion(v.q));
    me.group.updateMatrixWorld(true);
    const dir = (x, y, z) => new THREE.Vector3(x, y, z).applyQuaternion(v.q).normalize();
    const spine = bones.get('spine_02') || bones.get('spine_01');
    if (spine) { const parentQ = spine.parent.getWorldQuaternion(new THREE.Quaternion()).invert(); spine.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(dir(1, 0, 0).applyQuaternion(parentQ), 0.12 + 0.1 * Math.min(1, Math.abs(d.speed || 0) / 14))); spine.updateMatrixWorld(true); }
    // the wheel: its middle, its face (`axis`, toward the driver), its rim; the hands at ten and two, turned with it
    const helm = spec.helm, turn = (d.steer || 0) * 2.5;
    const c = new THREE.Vector3(helm.p[0], helm.p[1], helm.p[2]);
    const axis = new THREE.Vector3(helm.axis[0], helm.axis[1], helm.axis[2]).normalize();
    const upOnWheel = new THREE.Vector3(0, 1, 0).sub(axis.clone().multiplyScalar(axis.y)).normalize();
    const across = new THREE.Vector3().crossVectors(upOnWheel, axis).normalize();
    for (const [side, a] of [['l', 0.9], ['r', -0.9]]) {
      const u = bones.get(`upperarm_${side}`), l = bones.get(`lowerarm_${side}`), h = bones.get(`hand_${side}`);
      if (!u || !l || !h) continue;
      const ang = a + turn;
      const rim = c.clone().add(upOnWheel.clone().multiplyScalar(Math.cos(ang) * helm.r)).add(across.clone().multiplyScalar(-Math.sin(ang) * helm.r));
      const target = (m.steerer ? m.steerer : m.frame).localToWorld(rim.add(axis.clone().multiplyScalar(-0.04)));
      reach(u, l, h, target, dir(side === 'l' ? 0.8 : -0.8, -0.6, -0.2));
    }
    // the feet forward on the floor of the cockpit
    for (const side of ['l', 'r']) {
      const t = bones.get(`thigh_${side}`), k = bones.get(`calf_${side}`), f = bones.get(`foot_${side}`);
      if (!t || !k || !f) continue;
      const target = m.frame.localToWorld(new THREE.Vector3(s[0] + (side === 'l' ? 0.12 : -0.12), s[1] - 0.36, s[2] + 0.46));
      reach(t, k, f, target, dir(side === 'l' ? 0.2 : -0.2, 0.3, 1));
    }
    return true;
  }

  return {
    update, seat,
    ready: (key = 'drive') => { const e = shown.get(key); return !!(e && e.model); },
    model: (key = 'drive') => { const e = shown.get(key); return e ? e.model : null; },
    keys: () => [...shown.keys()],
    dispose() { for (const e of shown.values()) drop(e); shown.clear(); },
  };
}
