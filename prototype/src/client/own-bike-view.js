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
const PEER_SIGHT = 160, PEER_MOST = 4;  // another player's ridden bike: drawn within this, the nearest few
// flames from the silencers: only the big engines, only near the red line with the throttle wide open (or a burst
// when it is shut at high revs)
export const FLAMES = Object.freeze({ cc: 1850, rev: 0.82 });
export const SUSPENSION = Object.freeze({ dive: 0.035, road: 0.004, rough: 0.018 });
const PARKED_LEAN = -0.07;           // radians: a parked bike leans a little to its left, on its stand
// how a rider sits: forward from the waist (radians), more when going fast; into a turn with the body (a share of the
// bike's own lean, added to it), the head turned into the turn and kept nearly level
export const RIDE = Object.freeze({ forward: 0.22, tuck: 0.2, roll: 0.45, rollSign: 1, look: 0.55, level: 0.6 });
const FALLEN_LEAN = -1.25;          // radians: one that came down in a crash lies on its left side until it is ridden again
const v = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3(), e: new THREE.Euler(0, 0, 0, 'XYZ'), q: new THREE.Quaternion(), axis: new THREE.Vector3() };

// A figure's bones by the names the supplied figures use (pelvis, hand_l, ...): theirs as they are, or the game's own
// figure's (character.js: Hips, Hand_L, ...) under those names, so that anyone can sit on a bike.
const KIT_NAMES = { pelvis: 'Hips', spine_01: 'Spine', spine_02: 'Chest', neck_01: 'Neck', head: 'Head' };
for (const [s, S] of [['l', 'L'], ['r', 'R']]) Object.assign(KIT_NAMES, { [`upperarm_${s}`]: `UpperArm_${S}`, [`lowerarm_${s}`]: `Forearm_${S}`, [`hand_${s}`]: `Hand_${S}`, [`thigh_${s}`]: `Thigh_${S}`, [`calf_${s}`]: `Shin_${S}`, [`foot_${s}`]: `Foot_${S}` });
function bonesOf(figure) {
  if (typeof figure.bones.get === 'function') return figure.bones;
  if (!figure.kitBones) { const byName = new Map(figure.bones.map((b) => [b.name, b])); figure.kitBones = { get: (name) => byName.get(KIT_NAMES[name]) || null }; }
  return figure.kitBones;
}

export function createOwnBikeView(scene, { lite = false, base = 'bikes/', onError = () => {} } = {}) {
  const shown = new Map();          // key -> { id, bike, loading, travelled }
  const frozen = new Set();         // figures whose bones seat() set by hand this frame

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

  // The lamps, the flames and the suspension of a bike being ridden, from what it is doing (the same for one's own
  // bike and for another player's, from what their game says of it):
  //   headlamp and tail lamp on at night; the brake lamp bright while braking; flames from the silencers of the big
  //   engines (FLAMES.cc and up) with the throttle wide open near the red line, and a burst when it is shut at high
  //   revs; the nose dipping under the brake and the bike riding the road, a little over the tar, more off it.
  function effects(e, ride, dt, night, now) {
    const bike = POWER_BIKES[ride.id];
    const speed = Math.abs(ride.speed || 0), top = bike ? bike.handling.top : 30;
    const rev = Math.max(0, Math.min(1, ride.rev || 0)), throttle = ride.throttle || 0, braking = !!ride.brake && speed > 0.3;
    e.fx = e.fx || { pop: 0, lastThrottle: 0, dive: 0, phase: Math.random() * 10 };
    const fx = e.fx;
    const big = !!bike && bike.cc >= FLAMES.cc;
    if (big && fx.lastThrottle > 0.6 && throttle < 0.05 && rev > 0.55) fx.pop = 0.3;          // shut at high revs: a burst
    fx.pop = Math.max(0, fx.pop - dt);
    fx.lastThrottle = throttle;
    const open = big && throttle > 0.9 && rev > FLAMES.rev ? (rev - FLAMES.rev) / (1 - FLAMES.rev) : 0;
    const flame = Math.max(open, fx.pop > 0 ? 0.55 * (fx.pop / 0.3) : 0);
    fx.dive += ((braking ? SUSPENSION.dive * Math.min(1, speed / 10) : 0) - fx.dive) * Math.min(1, dt * 8);
    fx.phase += dt * (0.6 + speed * 0.35);
    const rough = ride.rough ? SUSPENSION.rough : SUSPENSION.road;
    const bob = rough * Math.min(1, speed / 8) * (Math.sin(fx.phase * 2.3) * 0.6 + Math.sin(fx.phase * 5.1 + 1.3) * 0.4);
    e.state = { head: night > 0.25 ? 1 : 0, tail: night > 0.25 ? 1 : 0, brake: braking ? 1 : 0, flame, t: now, dive: fx.dive, bob };
    return e.state;
  }
  const place = (e, ride, groundY, dt, night, now) => {
    const st = effects(e, ride, dt, night, now);
    const g = e.bike.group;
    g.position.set(ride.x, groundY(ride.x, ride.z), ride.z);
    g.rotation.set(0, ride.h, 0);
    g.visible = true;
    e.bike.pose({ travelled: e.travelled, steerAngle: ride.steer || 0, tilt: ride.lean || 0, dive: st.dive, bob: st.bob });
    e.bike.lamps(st);
  };

  // ridden: { id, x, z, h, lean, speed, steer, throttle, brake, rev, rough } or null (this player's);
  // rides: [{ key, ...the same }] (other players' bikes, near enough to see); parked: [{ bike, x, z, h }];
  // groundY(x, z); from: { x, z }; night (0..1); now (seconds)
  function update(dt, { ridden = null, rides = [], parked = [], parkedMost = 3, groundY = () => 0, from = { x: 0, z: 0 }, night = 0, now = 0 }) {
    for (const f of frozen) f.freeze = false;
    frozen.clear();
    const wanted = new Set();
    if (ridden && POWER_BIKES[ridden.id]) {
      wanted.add('ride');
      const e = entry('ride', ridden.id);
      e.travelled += (ridden.speed || 0) * dt;
      if (e.bike) place(e, ridden, groundY, dt, night, now);
    }
    // other players' bikes: the nearest few within sight
    for (const r of rides.filter((q) => POWER_BIKES[q.id] && Math.hypot(q.x - from.x, q.z - from.z) <= PEER_SIGHT).sort((a, b) => Math.hypot(a.x - from.x, a.z - from.z) - Math.hypot(b.x - from.x, b.z - from.z)).slice(0, PEER_MOST)) {
      const key = `peer:${r.key}`;
      wanted.add(key);
      const e = entry(key, r.id);
      e.travelled += (r.speed || 0) * dt;
      if (e.bike) place(e, r, groundY, dt, night, now);
    }
    // (the nearest few: a player who owns many and leaves them together sees those beside them)
    const near = parked.filter((p) => POWER_BIKES[p.bike] && Math.hypot(p.x - from.x, p.z - from.z) <= SIGHT).sort((a, b) => Math.hypot(a.x - from.x, a.z - from.z) - Math.hypot(b.x - from.x, b.z - from.z)).slice(0, parkedMost);
    for (const p of near) {
      const key = p.key || `park:${p.bike}`;
      wanted.add(key);
      const e = entry(key, p.bike);
      if (e.bike) {
        e.bike.group.position.set(p.x, groundY(p.x, p.z), p.z);
        e.bike.group.rotation.set(0, p.h, 0);
        e.bike.pose({ travelled: e.travelled, steerAngle: 0.25, tilt: p.fallen ? FALLEN_LEAN : PARKED_LEAN });
      }
    }
    for (const [key, e] of shown) if (!wanted.has(key)) { if (e.bike) e.bike.dispose(); shown.delete(key); }
  }

  // The rider on the bike they ride. Called after the figure has been posed for the frame (seated): the figure is
  // put so that its hips are on the seat, then its hands are put on the grips and its feet on the pegs, leaning
  // forward from the waist as far as the bars ask. Gives false while the bike is still being fetched.
  function seat(me, ridden, groundY, key = 'ride') {
    const e = shown.get(key);
    if (!e || !e.bike || !ridden || !me.bones) return false;
    const bike = e.bike;
    const bones = bonesOf(me);
    const pelvis = bones.get('pelvis');
    if (!pelvis) return false;
    const gy = groundY(ridden.x, ridden.z);
    // upright first, to measure where the posed figure's hips are in its own frame
    me.group.rotation.set(0, ridden.h, 0);
    me.group.position.set(ridden.x, gy, ridden.z);
    me.group.updateMatrixWorld(true);
    // (the game's own figure poses its bones each time it is placed: posed now, then held as this sets them, until
    // the next frame's update lets it go)
    if (!me.animated) { me.freeze = true; frozen.add(me); }
    const hips = me.group.worldToLocal(pelvis.getWorldPosition(v.a));
    // the hips a hand's breadth above the seat's surface; the figure's frame is the bike's (both face +z, left +x)
    const offset = v.b.set(bike.seat.x - hips.x, bike.seat.y + 0.09 - hips.y, bike.seat.z - hips.z);
    // then over with the bike, about the line its tyres stand on
    v.e.set(0, ridden.h, ridden.lean || 0, 'XYZ');
    me.group.rotation.copy(v.e);
    me.group.position.set(ridden.x, gy, ridden.z).add(offset.applyEuler(v.e));
    me.group.updateMatrixWorld(true);
    bike.group.updateMatrixWorld(true);
    const world = (local) => bike.lean.localToWorld(v.c.copy(local));
    // a direction in the rider's frame (unit length), and a distance in it (metres)
    const off = (x, y, z) => me.group.localToWorld(v.d.set(x, y, z)).sub(me.group.localToWorld(v.a.set(0, 0, 0))).clone();
    const dir = (x, y, z) => me.group.localToWorld(v.d.set(x, y, z)).sub(me.group.localToWorld(v.a.set(0, 0, 0))).normalize().clone();
    // leaning forward from the waist until the grips are within reach
    const spine = bones.get('spine_02') || bones.get('spine_01');
    const arm = (s) => { const u = bones.get(`upperarm_${s}`), l = bones.get(`lowerarm_${s}`), h = bones.get(`hand_${s}`); return u && l && h ? { u, l, h, length: u.getWorldPosition(new THREE.Vector3()).distanceTo(l.getWorldPosition(new THREE.Vector3())) + l.getWorldPosition(new THREE.Vector3()).distanceTo(h.getWorldPosition(new THREE.Vector3())) } : null; };
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
      // the riding position (16 October 2026, the owner's brief): leaning forward over the tank, the more so the
      // faster it goes, and into a turn with the body, a little further over than the bike itself
      const pace = Math.min(1, Math.abs(ridden.speed || 0) / 30);
      turn(RIDE.forward + RIDE.tuck * pace);
      const lean = ridden.lean || 0;
      if (Math.abs(lean) > 1e-3) {
        const fwd = dir(0, 0, 1);
        const parentQ = spine.parent.getWorldQuaternion(new THREE.Quaternion());
        spine.quaternion.premultiply(v.q.setFromAxisAngle(fwd.applyQuaternion(parentQ.invert()), RIDE.roll * lean * RIDE.rollSign));
        spine.updateMatrixWorld(true);
      }
      // still out of reach: the rider sits further forward on the seat (up to a third of a metre), and bends again
      const gap = bend();
      if (gap > 0) {
        me.group.position.add(off(0, 0, Math.min(0.33, gap * 1.3)));
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
    // the neck and head: looking where the bike is going, turned into the turn and kept nearly level as the body
    // leans (a rider's eyes stay with the horizon)
    const neck = bones.get('neck_01'), head = bones.get('head');
    if (neck && head) {
      const lean = ridden.lean || 0;
      const up = dir(0, 1, 0), fwd = dir(0, 0, 1);
      const put = (bone, axis, angle) => { const q = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert(); bone.quaternion.premultiply(v.q.setFromAxisAngle(axis.clone().applyQuaternion(q), angle)); bone.updateMatrixWorld(true); };
      // the head comes up against the forward lean, to look ahead down the road
      put(neck, dir(1, 0, 0), -(RIDE.forward + RIDE.tuck * Math.min(1, Math.abs(ridden.speed || 0) / 30)) * 0.7);
      put(neck, up, -RIDE.look * lean);
      put(head, fwd, -RIDE.level * lean * RIDE.rollSign);
    }
    // feet on the pegs (the ankle just above and behind each peg), knees forward and out
    for (const s of ['l', 'r']) {
      const thigh = bones.get(`thigh_${s}`), calf = bones.get(`calf_${s}`), foot = bones.get(`foot_${s}`);
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
    ridden: (key = 'ride') => { const e = shown.get(key); return e && e.bike ? e.bike : null; },
    stateOf: (key = 'ride') => { const e = shown.get(key); return e ? e.state || null : null; },
    failed: () => { const e = shown.get('ride'); return !!(e && e.failed); },
    count: () => shown.size,
    keys: () => [...shown.keys()],
    dispose() { for (const e of shown.values()) if (e.bike) e.bike.dispose(); shown.clear(); },
  };
}
