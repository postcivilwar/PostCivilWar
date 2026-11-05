// Getting into a car and out of it like a person (5 November 2026, the owner's brief, part 5: "walk to the door and stop
// facing it; hand on the handle; pull the door open (the door follows the hand); turn and sit down onto the seat,
// ducking the head under the roof; swing the legs in one after the other; reach out and pull the door shut by its inside
// handle; hands to the wheel ... Getting out: open the door, swing the legs out, stand up holding the door frame, step
// clear and push the door shut"), and a driver pulled out of the seat onto the road.
//
// By the owner's Mixamo moves (car-moves.js), carried onto each figure's own bones: `enter`, `exit`, `pulled`, as he
// recorded them for a door on the figure's right (getting in), its left (getting out) and its right (pulled out), and
// mirrored for the other side. Each is laid on the car as it is drawn: its last moment (in) or its first (out, pulled)
// at the seat (car-seating.js `seatHip`), the rest of its path about that, turned with the car; its steps as long as
// the figure's legs (the moves were made on a figure 1.8 m tall); its height between standing on the ground and
// sitting in the seat as far as the move has sat down (the moves were made at a seat 0.88 m up, an SUV's; the coupé's is
// 0.3 m), the knees bent the more for a low seat and the feet kept on the ground; and, getting in, its first steps eased
// from wherever the figure stands at the door. The door follows the hand: opened and shut at the moves' own moments.
//
//   BOARDING[kind]                          each move's times (seconds of the move): where it begins, the door opened,
//                                           the door shut, where it ends; and how much faster than recorded it is played
//   boardTimes(kind)                        { length, open, shut } in seconds of the game, from the move's start
//   poseBoarding(figure, car, { kind, door, t, from, groundY })   the figure posed and placed at t seconds into it
import { reach } from './animated.js';
import { bonesOf } from './own-bike-view.js';
import { carMove, poseCarMove, MOVES_HIPS } from './car-moves.js';
import { seatHip } from './car-seating.js';

// (seconds of the owner's moves: `from` where the game begins it (the figure already at the door: his `enter` walks up to
// it first), the door's handle pulled (`open`) and the door pulled or pushed shut (`shut`), `to` where it is done; `pace`
// how much faster it is played (the brief: "about 2 to 3 seconds"); `seat` how high his seat was (the hips seated) and
// `stand` standing)
export const BOARDING = Object.freeze({
  in: Object.freeze({ move: 'enter', from: 0.95, open: 1.15, shut: 4.45, to: 5.2, pace: 1.55, seat: 0.88, stand: 1.03 }),
  out: Object.freeze({ move: 'exit', from: 0.0, open: 0.35, shut: 3.9, to: 4.55, pace: 1.5, seat: 0.88, stand: 1.03 }),
  pulled: Object.freeze({ move: 'pulled', from: 1.6, open: 1.6, shut: 1.6, to: 3.4, pace: 1.0, seat: 0.61, stand: 0.61 }),
});
// in seconds of the game from the start: how long it takes, when the door is opened and shut
export function boardTimes(kind) {
  const b = BOARDING[kind];
  return { length: (b.to - b.from) / b.pace, open: Math.max(0, (b.open - b.from) / b.pace), shut: (b.shut - b.from) / b.pace };
}

const V = () => new THREE.Vector3();
let W = null;
const scratch = () => W || (W = { a: V(), b: V(), c: V(), seat: V(), hips: V(), end: V(), q: new THREE.Quaternion(), up: new THREE.Vector3(0, 1, 0), h0: [0, 0, 0], h1: [0, 0, 0], ht: [0, 0, 0] });

// `kind`: 'in', 'out' or 'pulled'; `door`: 'fl' or 'fr' (which side of the car); `t`: seconds of the game since it
// began; `from`: where the figure stood when it began ({ x, z }: getting in, its first steps eased from there);
// `groundY(x, z)`: the surface outside the car. Gives false (and does nothing) until the figure and the moves are ready.
export function poseBoarding(me, car, { kind = 'in', door = 'fl', t = 0, from = null, groundY = () => 0 } = {}) {
  const b = BOARDING[kind];
  if (!b || !car || !car.driver || !me || !me.bones) return false;
  const w = scratch();
  // (his moves as recorded: getting in by a door on the figure's right, getting out by one on its left, pulled out to
  // its right; the car's left side, the driver's, is the one he recorded for getting in and out, mirrored for pulled)
  const left = door[1] === 'l';
  const mirrored = kind === 'pulled' ? left : !left;
  const move = carMove(me, b.move, mirrored);
  if (!move) return false;
  const bones = bonesOf(me);
  const pelvis = bones.get('pelvis');
  if (!pelvis) return false;
  const tm = Math.min(b.to, b.from + Math.max(0, t) * b.pace);
  // the move's hips at its anchor (seated) and now
  const anchorT = kind === 'in' ? b.to : b.from;
  poseCarMove(me, move, anchorT, { out: w.h0 });
  poseCarMove(me, move, tm, { out: w.ht });
  // the figure's frame: getting in, it faces into the car (its +z the move's ahead); getting out and pulled out, it
  // faces the car's front as it sits
  car.group.updateMatrixWorld(true);
  car.cabin.getWorldQuaternion(w.q);
  const carYaw = Math.atan2(2 * (w.q.x * w.q.z + w.q.w * w.q.y), 1 - 2 * (w.q.x * w.q.x + w.q.y * w.q.y));
  const yaw = kind === 'in' ? carYaw + (left ? -Math.PI / 2 : Math.PI / 2) : carYaw;
  const seat = seatHip(car, door === 'fr' ? 'front' : 'driver');
  car.cabin.localToWorld(w.seat.set(seat[0], seat[1], seat[2]));
  // how far the figure's steps go: its own height against the moves' figure
  const tall = (me.spec && me.spec.height) || 1.75;
  const S = tall / 1.8;
  const standHips = MOVES_HIPS * S;
  // how far sat down the move is now (1 seated, 0 standing; pulled out: 1 seated, 0 on the ground), from its own hips'
  // height
  const sat = kind === 'pulled' ? Math.max(0, Math.min(1, (w.ht[1] - 0.07) / (b.seat - 0.07))) : Math.max(0, Math.min(1, (b.stand - w.ht[1]) / Math.max(0.05, b.stand - b.seat)));
  const sin = Math.sin(yaw), cos = Math.cos(yaw);
  // (the move's offset from its anchor, along the ground, turned into the town: x the figure's left, z ahead)
  const dx = (w.ht[0] - w.h0[0]) * S, dz = (w.ht[2] - w.h0[2]) * S;
  let px = w.seat.x + cos * dx + sin * dz, pz = w.seat.z - sin * dx + cos * dz;
  // getting in: its first steps eased from where it stood (the town's door stand) into the move's path
  if (kind === 'in' && from) {
    poseCarMove(me, move, b.from, { out: w.h1 });
    const sx = w.seat.x + cos * (w.h1[0] - w.h0[0]) * S + sin * (w.h1[2] - w.h0[2]) * S, sz = w.seat.z - sin * (w.h1[0] - w.h0[0]) * S + cos * (w.h1[2] - w.h0[2]) * S;
    const k = Math.max(0, 1 - (tm - b.from) / Math.max(0.1, (b.to - b.from) * 0.55));
    const e = k * k * (3 - 2 * k);
    px += (from.x - sx) * e; pz += (from.z - sz) * e;
  }
  // its height: between the move's own over the ground there and its own about the seat, as far as it has sat down
  const ground = groundY(px, pz);
  const yGround = ground + w.ht[1] * S, ySeat = w.seat.y + (w.ht[1] - b.seat) * S;
  const py = yGround + (ySeat - yGround) * sat;
  void standHips;
  // (the move's pose for now, then the figure put so that its hips are there)
  poseCarMove(me, move, tm, { out: w.ht });
  me.group.position.set(0, 0, 0);
  me.group.rotation.set(0, yaw, 0);
  me.group.updateMatrixWorld(true);
  const rel = pelvis.getWorldPosition(w.a);
  // (the move's own hips' height already in the pose: the hips put where they should be)
  me.group.position.set(px - rel.x, py - rel.y, pz - rel.z);
  me.group.updateMatrixWorld(true);
  // the feet kept on the ground (or the cabin's floor) under them where the move had them standing: a low seat bends
  // the knees the more
  const floorY = car.cabinMeasures ? car.cabinMeasures.floor / car.scale : car.driver.feet ? car.driver.feet[0][1] : 0;
  const floorWorld = car.cabin.localToWorld(w.b.set(seat[0], floorY, seat[2])).y;
  for (const s of ['l', 'r']) {
    const thigh = bones.get(`thigh_${s}`), calf = bones.get(`calf_${s}`), foot = bones.get(`foot_${s}`);
    if (!thigh || !calf || !foot) continue;
    const f = foot.getWorldPosition(w.c);
    // (inside the car's outline: its floor; outside: the ground)
    const local = car.cabin.worldToLocal(w.end.copy(f));
    const inside = Math.abs(local.x * car.scale) < car.size.width / 2 - 0.1 && Math.abs(local.z * car.scale) < car.size.length / 2 - 0.4;
    const under = (inside ? floorWorld : groundY(f.x, f.z)) + 0.08 * S;
    if (f.y < under) {
      const target = w.end.set(f.x, under, f.z).clone();
      reach(thigh, calf, foot, target, w.a.set(Math.sin(yaw), 0.6, Math.cos(yaw)).normalize().clone());
    }
  }
  return true;
}
