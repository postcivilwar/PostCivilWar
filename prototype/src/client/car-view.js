// Cars in the town: the one this player drives, the ones they left standing, and other players' (driven, or left
// standing near them). Each is the owner's model (car-model.js), fetched only when it is needed (driven, or standing
// within sight) and shared by every car of its kind.
//
// A car being driven rolls on its wheels as it goes, its front wheels turn with the steering, and its body moves on
// its springs: the nose dips under the brake and lifts a little under the throttle, and the body leans out of a
// turn. Its lamps are lit at night; the brake lamps when it brakes, the reversing lamps when it backs up.
//
//   const cars = createCarView(scene, { lite });
//   cars.update(dt, { driven, drives, parked, groundY, from, night });       each frame
import { loadCar } from './car-model.js';
import { POWER_CARS } from '../sim/power-cars.js';

const SIGHT = 120;                  // metres within which a parked car is drawn
const PEER_SIGHT = 220, PEER_MOST = 4;     // another player's car being driven: drawn within this, the nearest few
export const SPRINGS = Object.freeze({ pitch: 0.012, most: 0.05, roll: 0.0045 });

export function createCarView(scene, { lite = false, base = 'cars/', onError = () => {} } = {}) {
  const shown = new Map();          // key -> { id, car, loading, travelled, failed, fx }

  function entry(key, id) {
    let e = shown.get(key);
    if (e && e.id !== id) { if (e.car) e.car.dispose(); shown.delete(key); e = null; }
    if (!e) {
      e = { id, car: null, loading: true, travelled: 0, failed: false, fx: null };
      shown.set(key, e);
      const spec = POWER_CARS[id];
      loadCar(id, { base, lite, length: spec ? spec.length : 4.6 }).then((car) => {
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
    e.state = { head: night > 0.25 || d.lamps ? 1 : 0, tail: night > 0.25 || d.lamps ? 1 : 0, brake: d.brake && (d.speed || 0) > 0.2 ? 1 : 0, reverse: (d.speed || 0) < -0.2 ? 1 : 0 };
    e.car.lamps(e.state);
  };

  // driven: { id, x, z, h, speed, steer, throttle, brake, lamps } or null (this player's); drives: [{ key, ...the
  // same }] (other players' cars being driven, near enough to see); parked: [{ key?, car, x, z, h }];
  // groundY(x, z); from: { x, z }; night (0..1)
  function update(dt, { driven = null, drives = [], parked = [], parkedMost = 4, groundY = () => 0, from = { x: 0, z: 0 }, night = 0 }) {
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

  return {
    update,
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
