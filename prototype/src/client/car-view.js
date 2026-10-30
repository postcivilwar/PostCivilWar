// Cars in the town: the one this player drives, the ones they left standing, other players' (driven, or left
// standing near them), and the town's own traffic (traffic.js, 30 October 2026: the nearest few of its cars, each with
// a set of its pictures smaller than the one the player drives, and fetched after it). Each is the owner's model (car-model.js), fetched only when it is needed (driven, or standing
// within sight) and shared by every car of its kind.
//
// A car being driven rolls on its wheels as it goes, its front wheels turn with the steering, and its body moves on
// its springs: the nose dips under the brake and lifts a little under the throttle, and the body leans out of a
// turn. Its lamps are lit at night; the brake lamps when it brakes, the reversing lamps when it backs up.
//
// The driver sits in the car (18 October 2026, the owner's brief): on the model's own seat, both hands on its own
// steering wheel at ten to two, turning it as the car is steered, feet on the pedals; one hand comes off the wheel
// to the phone when it is used (phone-hold.js: the right, the left keeps the wheel). Most of the owner's cars are a
// closed shell with their windows painted on and nothing inside, and there no one is drawn: the driver is drawn in
// the ten whose cabin can be seen into (the five open ones, and the five whose windows or doors are open), where
// tools/vehicles/driver_seats.py measured the seat and the wheel from the model.
//
//   const cars = createCarView(scene, { lite });
//   cars.update(dt, { driven, drives, parked, groundY, from, night });       each frame
//   cars.seat(figure, driven, key)        after the driver's figure is posed for the frame (seated): false if not drawn
import { loadCar } from './car-model.js';
import { reach } from './animated.js';
import { bonesOf } from './own-bike-view.js';
import { POWER_CARS } from '../sim/power-cars.js';

const SIGHT = 120;                  // metres within which a parked car is drawn
const PEER_SIGHT = 220, PEER_MOST = 4;     // another player's car being driven: drawn within this, the nearest few
// the town's traffic drawn as its models: the nearest few within this (further off, its pictures, vehicle-standins.js);
// with the set of pictures for each (a phone: 512, a computer: 1024; the car the player drives has its own set)
// (a copy of the page opened from the disk cannot fetch a model, as render-carshow.js and vehicle-standins.js know: the
// town's cars, which come by anywhere, are not asked for there, so that nothing is asked for in vain)
const ON_DISK = (() => { try { return location.protocol === 'file:'; } catch (error) { return false; } })();
export const TRAFFIC_DRAWN = Object.freeze({ lite: Object.freeze({ most: 2, sight: 45, tier: '512' }), full: Object.freeze({ most: 5, sight: 90, tier: '1k' }) });
export const SPRINGS = Object.freeze({ pitch: 0.012, most: 0.05, roll: 0.0045 });
// How a driver sits (radians, metres): leaning back in the seat, less if the wheel is further than the arms reach,
// more if the roof asks it (never past `mostRecline`), sunk into the cushion if that is still not enough, and further
// forward on the seat (no more than `slide`) if the wheel is still out of reach; the steering wheel turned by
// `wheelTurn` times the front wheels' angle, no further than `wheelMost` either way (the hands stay on the rim at ten
// to two as it turns, within the arms' reach)
export const DRIVE = Object.freeze({ recline: 0.38, mostRecline: 0.62, sink: 0.08, slide: 0.14, headRoom: 0.04, wheelTurn: 1.4, wheelMost: 0.6, look: 0.35 });
const w = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3(), hip: new THREE.Vector3(), q: new THREE.Quaternion(), r: new THREE.Quaternion(), axis: new THREE.Vector3(), up: new THREE.Vector3(), x: new THREE.Vector3(), u: new THREE.Vector3(), n: new THREE.Vector3(), centre: new THREE.Vector3(), grip: new THREE.Vector3() };

export function createCarView(scene, { lite = false, base = 'cars/', onError = () => {} } = {}) {
  const shown = new Map();          // key -> { id, car, loading, travelled, failed, fx }
  const frozen = new Set();         // figures whose bones seat() set by hand this frame

  function entry(key, id, tier = null) {
    let e = shown.get(key);
    if (e && e.id !== id) { if (e.car) e.car.dispose(); shown.delete(key); e = null; }
    if (!e) {
      e = { id, car: null, loading: true, travelled: 0, failed: false, fx: null };
      shown.set(key, e);
      const spec = POWER_CARS[id];
      // (another player's car, or one of the town's, is asked for after the small picture that stands in for it
      // meanwhile, vehicle-standins.js)
      const later = String(key).startsWith('peer:') || String(key).startsWith('traffic:');
      loadCar(id, { base, lite, length: spec ? spec.length : 4.6, priority: later ? 'low' : undefined, tier }).then((car) => {
        if (shown.get(key) !== e) { car.dispose(); return; }
        e.car = car; e.loading = false; scene.add(car.group);
      }, (error) => { e.loading = false; e.failed = true; onError(error); });
    }
    return e;
  }

  // How the body sits on its springs, from what the car is doing: the nose down under the brake, up a little under
  // the throttle, the body leaning out of a turn (the faster and the tighter, the more), eased so that it settles.
  function springs(e, d, dt) {
    const fx = e.fx || (e.fx = { pitch: 0, roll: 0, lastH: d.h, lastSpeed: d.speed || 0 });
    const speed = d.speed || 0;
    const accel = dt > 0 ? (speed - fx.lastSpeed) / dt : 0;
    let turn = dt > 0 ? -(((d.h - fx.lastH + Math.PI * 3) % (Math.PI * 2)) - Math.PI) / dt : 0;          // radians a second, to the right positive
    if (!Number.isFinite(turn) || Math.abs(turn) > 4) turn = 0;
    fx.lastH = d.h; fx.lastSpeed = speed;
    const wantPitch = Math.max(-SPRINGS.most, Math.min(SPRINGS.most, (d.brake && speed > 0.3 ? 0.035 : 0) - Math.max(-6, Math.min(6, accel)) * SPRINGS.pitch * 0.35));
    const wantRoll = Math.max(-SPRINGS.most, Math.min(SPRINGS.most, -turn * Math.abs(speed) * SPRINGS.roll));
    fx.pitch += (wantPitch - fx.pitch) * Math.min(1, dt * 6);
    fx.roll += (wantRoll - fx.roll) * Math.min(1, dt * 5);
    return fx;
  }
  const place = (e, d, groundY, dt, night) => {
    const fx = springs(e, d, dt);
    const g = e.car.group;
    g.position.set(d.x, groundY(d.x, d.z), d.z);
    g.rotation.set(0, d.h, 0);
    g.visible = true;
    e.car.pose({ travelled: e.travelled, steerAngle: -(d.steer || 0), pitch: fx.pitch, roll: fx.roll });
    // (the brake lamps when braking, and on a car of the town's waiting at a red light, its foot on the brake)
    e.state = { head: night > 0.25 || d.lamps ? 1 : 0, tail: night > 0.25 || d.lamps ? 1 : 0, brake: (d.brake && (d.speed || 0) > 0.2) || d.held ? 1 : 0, reverse: (d.speed || 0) < -0.2 ? 1 : 0 };
    e.car.lamps(e.state);
  };

  // driven: { id, x, z, h, speed, steer, throttle, brake, lamps } or null (this player's); drives: [{ key, ...the
  // same }] (other players' cars being driven, near enough to see); parked: [{ key?, car, x, z, h }];
  // groundY(x, z); from: { x, z }; night (0..1)
  // traffic: [{ key, id, x, z, h, speed, steer, brake, held }] (the town's cars near enough to see)
  function update(dt, { driven = null, drives = [], parked = [], parkedMost = 4, traffic = [], groundY = () => 0, from = { x: 0, z: 0 }, night = 0 }) {
    for (const f of frozen) f.freeze = false;
    frozen.clear();
    const wanted = new Set();
    if (driven && POWER_CARS[driven.id]) {
      wanted.add('drive');
      const e = entry('drive', driven.id);
      e.travelled += (driven.speed || 0) * dt;
      if (e.car) place(e, driven, groundY, dt, night);
    }
    const dist = (q) => Math.hypot(q.x - from.x, q.z - from.z);
    for (const r of drives.filter((q) => POWER_CARS[q.id] && dist(q) <= PEER_SIGHT).sort((a, b) => dist(a) - dist(b)).slice(0, PEER_MOST)) {
      const key = `peer:${r.key}`;
      wanted.add(key);
      const e = entry(key, r.id);
      e.travelled += (r.speed || 0) * dt;
      if (e.car) place(e, r, groundY, dt, night);
    }
    const T = TRAFFIC_DRAWN[lite ? 'lite' : 'full'];
    if (!ON_DISK) for (const r of traffic.filter((q) => POWER_CARS[q.id] && dist(q) <= T.sight).sort((a, b) => dist(a) - dist(b)).slice(0, T.most)) {
      const key = `traffic:${r.key}`;
      wanted.add(key);
      const e = entry(key, r.id, T.tier);
      e.travelled += (r.speed || 0) * dt;
      if (e.car) place(e, r, groundY, dt, night);
    }
    const near = parked.filter((p) => POWER_CARS[p.car] && dist(p) <= SIGHT).sort((a, b) => dist(a) - dist(b)).slice(0, parkedMost);
    for (const p of near) {
      const key = p.key || `park:${p.car}`;
      wanted.add(key);
      const e = entry(key, p.car);
      if (e.car) {
        e.car.group.position.set(p.x, groundY(p.x, p.z), p.z);
        e.car.group.rotation.set(0, p.h, 0);
        e.car.group.visible = true;
        e.car.pose({ travelled: e.travelled, steerAngle: 0, pitch: 0, roll: 0 });
        e.car.lamps({});
      }
    }
    for (const [key, e] of shown) if (!wanted.has(key)) { if (e.car) e.car.dispose(); shown.delete(key); }
  }

  // The driver in their seat. Called after the figure has been posed for the frame (seated): the figure is turned
  // with the car's body and put with its hips where the seat is, leant back against the seat back (further, and lower,
  // if its head would otherwise touch the roof), its hands put on the wheel's rim at ten to two as the wheel is turned,
  // its feet on the pedals, its head turned a little into the turn. d: { steer } (as update has it). Gives false, and
  // does nothing, while the car is still being fetched or where no one in it can be seen (a closed shell).
  function seat(me, d, key = 'drive') {
    const e = shown.get(key);
    if (!e || !e.car || !me || !me.bones || !d) return false;
    const car = e.car, spec = car.driver;
    if (!spec || !spec.seen) return false;
    const bones = bonesOf(me);
    const pelvis = bones.get('pelvis'), spine = bones.get('spine_02') || bones.get('spine_01'), head = bones.get('head');
    if (!pelvis || !spine) return false;
    // (the game's own figure poses its bones each time it is placed: held as this sets them until the next frame)
    if (!me.animated) { me.freeze = true; frozen.add(me); }
    car.group.updateMatrixWorld(true);
    const cabin = car.cabin;
    const at = (p, out) => cabin.localToWorld(out.set(p[0], p[1], p[2]));
    // the figure's frame is the car body's (both face +z, their left +x), carried with it as it pitches and rolls
    cabin.getWorldQuaternion(w.q);
    me.group.quaternion.copy(w.q);
    me.group.position.set(0, 0, 0);
    me.group.updateMatrixWorld(true);
    const hips = me.group.worldToLocal(pelvis.getWorldPosition(w.a)).clone();
    at(spec.hip, w.hip);
    let sunk = 0, forward = 0;
    const place = () => {
      me.group.position.copy(w.hip).sub(w.b.copy(hips).applyQuaternion(w.q));
      if (sunk) me.group.position.addScaledVector(w.up.set(0, 1, 0).applyQuaternion(w.q), -sunk);
      if (forward) me.group.position.addScaledVector(w.up.set(0, 0, 1).applyQuaternion(w.q), forward);
      me.group.updateMatrixWorld(true);
    };
    place();
    const dir = (x, y, z) => w.c.set(x, y, z).applyQuaternion(w.q).normalize().clone();
    const H = (me.spec && me.spec.height) || 1.75 * (me.scale || 1);
    // leaning back from the waist by `angle` (a turn about the figure's own left-to-right line, put into the bone's own
    // frame; a turn about its left, +x, by a positive angle leans it forward)
    const lean = (angle) => {
      const parentQ = spine.parent.getWorldQuaternion(w.r);
      const localAxis = w.axis.copy(dir(1, 0, 0)).applyQuaternion(parentQ.invert());
      spine.quaternion.premultiply(w.r.setFromAxisAngle(localAxis, -angle));
      spine.updateMatrixWorld(true);
    };
    // how far back the body leans now: the line from the hips up the back, against upright in the car
    const leant = () => { const p = pelvis.getWorldPosition(w.a), n = (head || spine).getWorldPosition(w.b); const v = n.sub(p); const up = dir(0, 1, 0), back = dir(0, 0, -1); return Math.atan2(v.dot(back), v.dot(up)); };
    lean(DRIVE.recline - leant());
    // where each hand holds the rim, at ten to two as the wheel is turned (the car turning left, its top goes to the
    // left), the wrist just short of the rim, towards the driver
    const wheel = spec.wheel, r = spec.radius, scale = car.scale;
    const turn = Math.max(-DRIVE.wheelMost, Math.min(DRIVE.wheelMost, -(d.steer || 0) * DRIVE.wheelTurn));
    const gripAt = (s, a0, out) => {
      at(wheel, w.centre);
      w.x.copy(dir(1, 0, 0)); w.u.copy(dir(0, Math.cos(spec.tilt), -Math.sin(spec.tilt)));
      const a = (s === 'l' ? 1 : -1) * (Math.PI / 3) + a0;
      return out.copy(w.centre).addScaledVector(w.u, Math.cos(a) * r * scale).addScaledVector(w.x, Math.sin(a) * r * scale).addScaledVector(dir(0, Math.sin(spec.tilt), Math.cos(spec.tilt)), -0.035);
    };
    const arms = {};
    for (const s of ['l', 'r']) {
      const u = bones.get(`upperarm_${s}`), l = bones.get(`lowerarm_${s}`), h = bones.get(`hand_${s}`);
      if (u && l && h) arms[s] = { u, l, h, length: u.getWorldPosition(w.a).distanceTo(l.getWorldPosition(w.b)) + l.getWorldPosition(w.a).distanceTo(h.getWorldPosition(w.b)) };
    }
    // how far the further hand falls short of the wheel at rest (nothing when both reach it)
    const short = () => Math.max(0, ...Object.entries(arms).map(([s, a]) => a.u.getWorldPosition(w.a).distanceTo(gripAt(s, 0, w.grip)) - a.length * 0.97));
    // a wheel further off than the arms reach: the body leant less far back, down to nearly upright
    for (let i = 0; i < 6 && short() > 0 && leant() > 0.12; i += 1) lean(-Math.min(0.05, leant() - 0.12));
    // the roof over the head (if there is one): leant further back, then sunk lower, until the top of the head is clear
    if (spec.roof !== null && spec.roof !== undefined && head) {
      const roofY = at([spec.hip[0], spec.roof, spec.hip[2]], w.d).clone();
      const clear = () => { const top = head.getWorldPosition(w.a).addScaledVector(dir(0, 1, 0), 0.11 * H); return roofY.clone().sub(top).dot(dir(0, 1, 0)) - DRIVE.headRoom; };
      let gap = clear();
      for (let i = 0; i < 8 && gap < 0 && leant() < DRIVE.mostRecline; i += 1) { lean(Math.min(0.06, DRIVE.mostRecline - leant())); gap = clear(); }
      if (gap < 0) { sunk = Math.min(DRIVE.sink, -gap); place(); }
    }
    // still out of reach: sitting further forward on the seat (no more than `DRIVE.slide`)
    const still = short();
    if (still > 0) { forward = Math.min(DRIVE.slide, still * 1.1); place(); }
    for (const [s, a] of Object.entries(arms)) reach(a.u, a.l, a.h, gripAt(s, turn, w.grip), dir((s === 'l' ? 1 : -1) * 0.9, -0.7, -0.3));
    // the feet on the pedals, the knees up and a little out
    for (const s of ['l', 'r']) {
      const thigh = bones.get(`thigh_${s}`), calf = bones.get(`calf_${s}`), foot = bones.get(`foot_${s}`);
      if (!thigh || !calf || !foot || !spec.feet) continue;
      const side = s === 'l' ? 1 : -1;
      reach(thigh, calf, foot, at(spec.feet[s === 'l' ? 0 : 1], w.d).clone(), dir(side * 0.3, 0.6, 1));
    }
    // the head: looking down the road, turned a little into the turn
    const neck = bones.get('neck_01');
    if (neck && head) {
      const put = (bone, axis, angle) => { const pq = bone.parent.getWorldQuaternion(w.r).invert(); bone.quaternion.premultiply(w.q.setFromAxisAngle(axis.clone().applyQuaternion(pq), angle)); bone.updateMatrixWorld(true); cabin.getWorldQuaternion(w.q); };
      // (upright against the body's lean back, so that the eyes stay on the road)
      put(neck, dir(1, 0, 0), -leant() * 0.55);
      put(neck, dir(0, 1, 0), turn * DRIVE.look / DRIVE.wheelTurn);
    }
    return true;
  }

  return {
    update, seat,
    // (how a driver sits and turns the wheel, for the tests)
    rules: DRIVE,
    // is the car being driven drawn yet (it is fetched the first time it is driven)
    ready: () => { const e = shown.get('drive'); return !!(e && e.car); },
    driven: (key = 'drive') => { const e = shown.get(key); return e && e.car ? e.car : null; },
    stateOf: (key = 'drive') => { const e = shown.get(key); return e ? e.state || null : null; },
    failed: () => { const e = shown.get('drive'); return !!(e && e.failed); },
    count: () => shown.size,
    keys: () => [...shown.keys()],
    dispose() { for (const e of shown.values()) if (e.car) e.car.dispose(); shown.clear(); },
  };
}
