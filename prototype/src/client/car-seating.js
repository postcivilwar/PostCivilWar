// Whoever is in a car, drawn sitting in it (5 November 2026, the owner's brief, part 4: "Whoever is in a car is drawn
// sitting properly and is seen through the glass: hips on the cushion, back against the backrest, head under the roof
// (never through it), knees bent, feet on the floor and the pedals. Every figure ... fits every car: a big man in the
// coupé has his seat moved back and still fits. The driver: both hands on the wheel, turning it with the steering ...").
//
// A figure (animated.js) is posed by one of the owner's seated moves (car-moves.js: `drive` at the wheel, `sit` and
// `talk` beside or behind), carried onto its own bones, then set in its seat in the car's own frame as the car is drawn
// (its body's pitch and roll on its springs included): its hips where the seat's are; leant back further, then sunk, if
// its head would touch the roof; the driver's seat slid back for long legs and forward for short arms, both hands put
// on the wheel's rim at ten to two as the wheel turns, the feet on the pedals; a passenger's feet on the floor.
//
//   seatHip(car, seat)                     where a seat's hips are, in the car's own units (its cabin's frame)
//   seatFigure(figure, car, seat, { steer, move, t, look })   after the figure's own pose for the frame: true if seated
import { reach } from './animated.js';
import { bonesOf } from './own-bike-view.js';
import { poseCarMove } from './car-moves.js';

// (radians and metres: how far back a body may lean, how far it may sink into the cushion and slide along it; the room
// kept over the head; the steering wheel turned by `wheelTurn` times the front wheels' angle, no further than
// `wheelMost` either way; the head turned into a turn by `look`; a big driver's seat moved back at most `back`)
export const SEATING = Object.freeze({ mostRecline: 0.62, sink: 0.08, slide: 0.14, back: 0.16, headRoom: 0.04, wheelTurn: 1.4, wheelMost: 0.6, look: 0.35 });

// The seats' hips, in the car's own units: the driver's as tools/vehicles/driver_seats.py measured it; the front
// passenger's beside it; the back seat's three across, where the cabin's bench is (car-cabin.js `measures`, metres), or
// a share of the car's length behind the front seats.
export function seatHip(car, seat) {
  const d = car.driver;
  if (!d) return null;
  const [x, y, z] = d.hip;
  if (seat === 'driver') return [x, y, z];
  if (seat === 'front') return [-x, y, z];
  const m = car.cabinMeasures;
  const rz = m ? (m.rearZ - 0.01) / car.scale : z - 0.19 * car.spec.length;
  const ry = m ? (m.seatTop + 0.08) / car.scale : y + 0.004 * car.spec.length;
  if (seat === 'rl') return [x, ry, rz];
  if (seat === 'rr') return [-x, ry, rz];
  return [0, ry + 0.01 / car.scale, rz];
}

const V = () => new THREE.Vector3();
let W = null;
const scratch = () => W || (W = { a: V(), b: V(), c: V(), d: V(), hip: V(), up: V(), axis: V(), centre: V(), x: V(), u: V(), grip: V(), q: new THREE.Quaternion(), r: new THREE.Quaternion(), out: [0, 0, 0] });

// `across`: part of the way from this front seat to the other (0 to 1: someone shuffling across from the passenger's seat
// to the wheel, or the other way to get out by the passenger's door)
export function seatFigure(me, car, seat = 'driver', { steer = 0, move = null, t = 0, look = 0, across = 0 } = {}) {
  const w = scratch();
  const spec = car && car.driver;
  if (!spec || !me || !me.bones) return false;
  const bones = bonesOf(me);
  const pelvis = bones.get('pelvis'), spine = bones.get('spine_02') || bones.get('spine_01'), head = bones.get('head');
  if (!pelvis || !spine) return false;
  const driving = seat === 'driver' && across < 0.05;
  // (the owner's seated move, carried onto this figure: its body as he recorded it, before it is fitted to the seat)
  if (move) poseCarMove(me, move, t, { loop: true, out: w.out });
  car.group.updateMatrixWorld(true);
  const cabin = car.cabin;
  const at = (p, out) => cabin.localToWorld(out.set(p[0], p[1], p[2]));
  // the figure's frame is the car body's (both face +z, their left +x), carried with it as it pitches and rolls
  cabin.getWorldQuaternion(w.q);
  const carQ = w.q.clone();
  me.group.quaternion.copy(carQ);
  me.group.position.set(0, 0, 0);
  me.group.updateMatrixWorld(true);
  const hips = me.group.worldToLocal(pelvis.getWorldPosition(w.a)).clone();
  let hipAt = seatHip(car, seat);
  if (across > 0 && (seat === 'driver' || seat === 'front')) { const other = seatHip(car, seat === 'driver' ? 'front' : 'driver'); hipAt = hipAt.map((v, k) => v + (other[k] - v) * Math.min(1, across)); }
  at(hipAt, w.hip);
  const hipWorld = w.hip.clone();
  let sunk = 0, forward = 0;
  const place = () => {
    me.group.position.copy(hipWorld).sub(w.b.copy(hips).applyQuaternion(carQ));
    if (sunk) me.group.position.addScaledVector(w.up.set(0, 1, 0).applyQuaternion(carQ), -sunk);
    if (forward) me.group.position.addScaledVector(w.up.set(0, 0, 1).applyQuaternion(carQ), forward);
    me.group.updateMatrixWorld(true);
  };
  place();
  const dir = (x, y, z) => w.c.set(x, y, z).applyQuaternion(carQ).normalize().clone();
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
  const leant = () => { const p = pelvis.getWorldPosition(w.a), n = (head || spine).getWorldPosition(w.b); const v = n.sub(p); return Math.atan2(v.dot(dir(0, 0, -1)), v.dot(dir(0, 1, 0))); };
  // (a figure posed by no move of the owner's: leant back as one sits)
  if (!move) lean(0.3 - leant());
  const scale = car.scale;
  // the driver's seat: moved back for legs too long for the pedals (a big man in a small car), within its travel
  if (driving && spec.feet) {
    const thigh = bones.get('thigh_l'), calf = bones.get('calf_l'), foot = bones.get('foot_l');
    if (thigh && calf && foot) {
      const legs = thigh.getWorldPosition(w.a).distanceTo(calf.getWorldPosition(w.b)) + calf.getWorldPosition(w.a).distanceTo(foot.getWorldPosition(w.b));
      const pedal = at(spec.feet[0], w.d).clone();
      const gap = thigh.getWorldPosition(w.a).distanceTo(pedal);
      if (legs * 0.96 > gap) { forward = -Math.min(SEATING.back, legs * 0.96 - gap); place(); }
    }
  }
  // the wheel: where each hand holds its rim, at ten to two as it is turned (the car turning left, its top goes to the
  // left), the wrist just short of the rim, towards the driver
  const turn = Math.max(-SEATING.wheelMost, Math.min(SEATING.wheelMost, -steer * SEATING.wheelTurn));
  const gripAt = (s, a0, out) => {
    at(spec.wheel, w.centre);
    w.x.copy(dir(1, 0, 0)); w.u.copy(dir(0, Math.cos(spec.tilt), -Math.sin(spec.tilt)));
    const a = (s === 'l' ? 1 : -1) * (Math.PI / 3) + a0;
    return out.copy(w.centre).addScaledVector(w.u, Math.cos(a) * spec.radius * scale).addScaledVector(w.x, Math.sin(a) * spec.radius * scale).addScaledVector(dir(0, Math.sin(spec.tilt), Math.cos(spec.tilt)), -0.035);
  };
  const arms = {};
  for (const s of ['l', 'r']) {
    const u = bones.get(`upperarm_${s}`), l = bones.get(`lowerarm_${s}`), h = bones.get(`hand_${s}`);
    if (u && l && h) arms[s] = { u, l, h, length: u.getWorldPosition(w.a).distanceTo(l.getWorldPosition(w.b)) + l.getWorldPosition(w.a).distanceTo(h.getWorldPosition(w.b)) };
  }
  // how far the further hand falls short of the wheel at rest (nothing when both reach it)
  const short = () => (driving ? Math.max(0, ...Object.entries(arms).map(([s, a]) => a.u.getWorldPosition(w.a).distanceTo(gripAt(s, 0, w.grip)) - a.length * 0.97)) : 0);
  // a wheel further off than the arms reach: the body leant less far back, down to nearly upright
  for (let i = 0; i < 6 && short() > 0 && leant() > 0.12; i += 1) lean(-Math.min(0.05, leant() - 0.12));
  // the roof over the head: leant further back, then sunk lower, until the top of the head is clear
  const roofY = spec.roof !== null && spec.roof !== undefined ? spec.roof : null;
  if (roofY !== null && head) {
    const roofAt = at([hipAt[0], roofY - (car.cabinMeasures ? 0.03 / scale : 0), hipAt[2]], w.d).clone();
    const clear = () => { const top = head.getWorldPosition(w.a).addScaledVector(dir(0, 1, 0), 0.11 * H); return roofAt.clone().sub(top).dot(dir(0, 1, 0)) - SEATING.headRoom; };
    let gap = clear();
    for (let i = 0; i < 8 && gap < 0 && leant() < SEATING.mostRecline; i += 1) { lean(Math.min(0.06, SEATING.mostRecline - leant())); gap = clear(); }
    if (gap < 0) { sunk = Math.min(SEATING.sink, -gap); place(); }
  }
  // still out of reach: sitting further forward on the seat (no more than `slide`)
  const still = short();
  if (still > 0) { forward = Math.max(forward, 0) + Math.min(SEATING.slide, still * 1.1); place(); }
  if (driving) for (const [s, a] of Object.entries(arms)) reach(a.u, a.l, a.h, gripAt(s, turn, w.grip), dir((s === 'l' ? 1 : -1) * 0.9, -0.7, -0.3));
  // the feet: the driver's on the pedals; anyone else's on the floor ahead of the seat, the knees up and a little out
  const floorY = car.cabinMeasures ? car.cabinMeasures.floor / scale : (spec.feet ? spec.feet[0][1] : hipAt[1] - 0.25 / scale);
  for (const s of ['l', 'r']) {
    const thigh = bones.get(`thigh_${s}`), calf = bones.get(`calf_${s}`), foot = bones.get(`foot_${s}`);
    if (!thigh || !calf || !foot) continue;
    const side = s === 'l' ? 1 : -1;
    let target;
    if (driving && spec.feet) target = at(spec.feet[s === 'l' ? 0 : 1], w.d).clone();
    else {
      // (a foot's ankle about a tenth of the figure's height over the floor, a step ahead of the hips, a hand apart)
      const ahead = seat === 'front' ? 0.5 : 0.42;
      target = at([hipAt[0] + side * 0.09 / scale, floorY + 0.08 / scale, hipAt[2] + ahead / scale], w.d).clone();
    }
    reach(thigh, calf, foot, target, dir(side * 0.3, 0.6, 1));
  }
  // the head: the driver looking down the road, turned a little into the turn (or toward whoever shouts: `look`); a
  // passenger as the move has it
  const neck = bones.get('neck_01');
  if (neck && head && driving) {
    const put = (bone, axis, angle) => { const pq = bone.parent.getWorldQuaternion(w.r).invert(); bone.quaternion.premultiply(w.r.setFromAxisAngle(axis.clone().applyQuaternion(pq), angle)); bone.updateMatrixWorld(true); };
    put(neck, dir(1, 0, 0), -Math.max(0, leant()) * 0.4);
    put(neck, dir(0, 1, 0), turn * SEATING.look / SEATING.wheelTurn + look);
  }
  return true;
}
