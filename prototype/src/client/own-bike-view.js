// A player's own motorcycles in the town: the one they ride, under them, and the others where they left them;
// and the rider on the one they ride, sitting on its seat with hands on its grips and feet on its pegs.
//
// The bikes are the owner's models (bike-model.js): body, fork and wheels from the triangles of the supplied file.
// The front wheel and the fork turn with the bars, both wheels turn as it rolls, and it leans about the line its
// tyres touch the road on; the rider leans with it. A bike is fetched only when it is needed (ridden, or parked
// within sight), once, and every one of a kind shares one set of triangles and pictures.
//
//   const bikes = createOwnBikeView(scene, { lite });
//   bikes.update(dt, { ridden, parked, groundY, from });       each frame
//   bikes.seat(me, ridden, groundY)                             after the rider's figure is posed for the frame
import { loadBike } from './bike-model.js';
import { reach } from './animated.js';
import { POWER_BIKES } from '../sim/power-bikes.js';

const SIGHT = 70;                    // metres within which a parked bike of the player's is drawn
const PARKED_LEAN = -0.07;           // radians: a parked bike leans a little to its left, on its stand
const v = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3(), e: new THREE.Euler(0, 0, 0, 'XYZ'), q: new THREE.Quaternion(), axis: new THREE.Vector3() };

export function createOwnBikeView(scene, { lite = false, base = 'bikes/', onError = () => {} } = {}) {
  const shown = new Map();          // key -> { id, bike, loading, travelled }

  function entry(key, id) {
    let e = shown.get(key);
    if (e && e.id !== id) { if (e.bike) e.bike.dispose(); shown.delete(key); e = null; }
    if (!e) {
      e = { id, bike: null, loading: true, travelled: 0, failed: false };
      shown.set(key, e);
      const spec = POWER_BIKES[id];
      loadBike(id, { base, lite, length: spec ? spec.length : 2.1 }).then((bike) => {
        if (shown.get(key) !== e) { bike.dispose(); return; }
        e.bike = bike; e.loading = false; scene.add(bike.group);
      }, (error) => { e.loading = false; e.failed = true; onError(error); });
    }
    return e;
  }

  // ridden: { id, x, z, h, lean, speed, steer } or null; parked: [{ bike, x, z, h }]; groundY(x, z); from: { x, z }
  function update(dt, { ridden = null, parked = [], groundY = () => 0, from = { x: 0, z: 0 } }) {
    const wanted = new Set();
    if (ridden && POWER_BIKES[ridden.id]) {
      wanted.add('ride');
      const e = entry('ride', ridden.id);
      e.travelled += (ridden.speed || 0) * dt;
      if (e.bike) {
        const g = e.bike.group;
        g.position.set(ridden.x, groundY(ridden.x, ridden.z), ridden.z);
        g.rotation.set(0, ridden.h, 0);
        g.visible = true;
        e.bike.pose({ travelled: e.travelled, steerAngle: ridden.steer || 0, tilt: ridden.lean || 0 });
      }
    }
    for (const p of parked) {
      if (!POWER_BIKES[p.bike] || Math.hypot(p.x - from.x, p.z - from.z) > SIGHT) continue;
      const key = `park:${p.bike}`;
      wanted.add(key);
      const e = entry(key, p.bike);
      if (e.bike) {
        e.bike.group.position.set(p.x, groundY(p.x, p.z), p.z);
        e.bike.group.rotation.set(0, p.h, 0);
        e.bike.pose({ travelled: e.travelled, steerAngle: 0.25, tilt: PARKED_LEAN });
      }
    }
    for (const [key, e] of shown) if (!wanted.has(key)) { if (e.bike) e.bike.dispose(); shown.delete(key); }
  }

  // The rider on the bike they ride. Called after the figure has been posed for the frame (seated): the figure is
  // put so that its hips are on the seat, then its hands are put on the grips and its feet on the pegs, leaning
  // forward from the waist as far as the bars ask. Gives false while the bike is still being fetched.
  function seat(me, ridden, groundY) {
    const e = shown.get('ride');
    if (!e || !e.bike || !ridden || !me.bones) return false;
    const bike = e.bike;
    const pelvis = me.bones.get('pelvis');
    if (!pelvis) return false;
    const gy = groundY(ridden.x, ridden.z);
    // upright first, to measure where the posed figure's hips are in its own frame
    me.group.rotation.set(0, ridden.h, 0);
    me.group.position.set(ridden.x, gy, ridden.z);
    me.group.updateMatrixWorld(true);
    const hips = me.group.worldToLocal(pelvis.getWorldPosition(v.a));
    // the hips a hand's breadth above the seat's surface; the figure's frame is the bike's (both face +z, left +x)
    const offset = v.b.set(bike.seat.x - hips.x, bike.seat.y + 0.09 - hips.y, bike.seat.z - hips.z);
    // then over with the bike, about the line its tyres stand on
    v.e.set(0, ridden.h, -(ridden.lean || 0), 'XYZ');
    me.group.rotation.copy(v.e);
    me.group.position.set(ridden.x, gy, ridden.z).add(offset.applyEuler(v.e));
    me.group.updateMatrixWorld(true);
    bike.group.updateMatrixWorld(true);
    const world = (local) => bike.lean.localToWorld(v.c.copy(local));
    // a direction in the rider's frame (unit length), and a distance in it (metres)
    const off = (x, y, z) => me.group.localToWorld(v.d.set(x, y, z)).sub(me.group.localToWorld(v.a.set(0, 0, 0))).clone();
    const dir = (x, y, z) => me.group.localToWorld(v.d.set(x, y, z)).sub(me.group.localToWorld(v.a.set(0, 0, 0))).normalize().clone();
    // leaning forward from the waist until the grips are within reach
    const spine = me.bones.get('spine_02') || me.bones.get('spine_01');
    const arm = (s) => { const u = me.bones.get(`upperarm_${s}`), l = me.bones.get(`lowerarm_${s}`), h = me.bones.get(`hand_${s}`); return u && l && h ? { u, l, h, length: u.getWorldPosition(new THREE.Vector3()).distanceTo(l.getWorldPosition(new THREE.Vector3())) + l.getWorldPosition(new THREE.Vector3()).distanceTo(h.getWorldPosition(new THREE.Vector3())) } : null; };
    const arms = { l: arm('l'), r: arm('r') };
    const grips = { l: bike.grips[0], r: bike.grips[1] };
    if (spine && arms.l && arms.r) {
      v.axis.copy(dir(1, 0, 0));
      // how much further the farther grip is than the arm reaches (nothing when both are within reach)
      const short = () => Math.max(...['l', 'r'].map((s) => arms[s].u.getWorldPosition(new THREE.Vector3()).distanceTo(world(grips[s]).clone().add(off(0, 0.01, -0.05))) - arms[s].length * 0.96));
      const turn = (angle) => {
        // (a turn about the rider's own left-to-right line, put into the bone's own frame)
        const parentQ = spine.parent.getWorldQuaternion(new THREE.Quaternion());
        const localAxis = v.axis.clone().applyQuaternion(parentQ.invert());
        spine.quaternion.premultiply(v.q.setFromAxisAngle(localAxis, angle));
        spine.updateMatrixWorld(true);
      };
      // forward (or back, for bars that are high and near) a little at a time, while that brings the grips nearer
      const bend = () => {
        let step = 0.07, turned = 0, gap = short();
        for (let i = 0; i < 24 && gap > 0; i += 1) {
          turn(step);
          const now = short();
          if (now >= gap - 1e-4) { turn(-step); if (step > 0 && turned === 0) { step = -step; continue; } break; }
          turned += step; gap = now;
          if (Math.abs(turned) > 1.05) break;
        }
        return gap;
      };
      // still out of reach: the rider sits further forward on the seat (up to a quarter of a metre), and bends again
      const gap = bend();
      if (gap > 0) {
        me.group.position.add(off(0, 0, Math.min(0.25, gap * 1.3)));
        me.group.updateMatrixWorld(true);
        bend();
      }
    }
    // hands on the grips (the wrist just behind and above each grip), elbows out and down
    for (const s of ['l', 'r']) {
      const a = arms[s];
      if (!a) continue;
      const side = s === 'l' ? 1 : -1;
      const target = world(grips[s]).clone().add(off(0, 0.01, -0.05));
      reach(a.u, a.l, a.h, target, dir(side * 0.9, -0.6, -0.2));
    }
    // feet on the pegs (the ankle just above and behind each peg), knees forward and out
    for (const s of ['l', 'r']) {
      const thigh = me.bones.get(`thigh_${s}`), calf = me.bones.get(`calf_${s}`), foot = me.bones.get(`foot_${s}`);
      if (!thigh || !calf || !foot) continue;
      const side = s === 'l' ? 1 : -1;
      const target = world(bike.pegs[s === 'l' ? 0 : 1]).clone().add(off(side * 0.02, 0.07, -0.05));
      reach(thigh, calf, foot, target, dir(side * 0.35, 0.3, 1));
    }
    return true;
  }

  return {
    update, seat,
    // is the bike being ridden drawn yet (it is fetched the first time it is ridden)
    ready: () => { const e = shown.get('ride'); return !!(e && e.bike); },
    // the bike being ridden (bike-model.js), for the tests
    ridden: () => { const e = shown.get('ride'); return e && e.bike ? e.bike : null; },
    failed: () => { const e = shown.get('ride'); return !!(e && e.failed); },
    count: () => shown.size,
    dispose() { for (const e of shown.values()) if (e.bike) e.bike.dispose(); shown.clear(); },
  };
}
