// How a boat goes on the water (31 October 2026, stage 4 of the owner's brief of 30 October: the speedboat from the sports
// mall, "Once a user buys a boat or any item, it is theirs"; and the three naval ships on the river, "driven by NPCs, but
// can still be hijacked"). In metres, seconds and radians, as everything else.
//
// A boat is pushed by its motor (its screws) and held back by the water, harder the faster it goes, so that it gathers
// speed steadily, slows quickly with the throttle shut, and has no brake but its motor run astern. It is steered by
// turning the motor (the ship's rudder): the faster it goes the quicker it turns, and at a standstill it hardly turns at
// all; in a turn its stern slides out a little before the hull bites. The speedboat lifts its bow as it gathers speed
// until it is up on the plane, then levels off, and banks into its turns; the ship does neither, and answers its helm
// slowly.
//
//   state  { speed, side, heading, yaw, steer, bank, pitch }   (changed in place; returned)
//          speed: m/s ahead (negative astern); side: m/s across to its left (the slide); yaw: radians a second it is
//          turning (left positive); steer: radians the motor or rudder is over (left positive, as the page draws it)
//   input  { steer: -1..1 (right positive, as the arrows give it), throttle: 0..1, brake: 0..1 (astern) }
const H = (o) => Object.freeze(o);

export const BOAT_HANDLING = Object.freeze({
  // the speedboat: 60 km/h flat out; about 9 s to 50 km/h; 3 s to stop from its top speed with the motor astern
  speedboat: H({ top: 16.7, accel: 3.4, astern: 2.6, back: 4.2, still: 0.5, turn: 0.85, lock: 0.5, slew: 2.6, slide: 2.2, plane: 7.5, bank: 0.16, bow: 0.13, room: 1.1, length: 5.2 }),
  // a naval ship (at the size it is on the river: 60 m): 12 knots flat out, a long while to gather way and to lose it
  'naval-ship': H({ top: 6.2, accel: 0.16, astern: 1.6, back: 0.22, still: 0.02, turn: 0.11, lock: 0.6, slew: 0.35, slide: 0.5, plane: Infinity, bank: 0.025, bow: 0, room: 9.5, length: 60 }),
});
export const boatHandling = (id) => BOAT_HANDLING[id] || null;
// (the water's hold on it, by the square of its speed: as much as its motor's push just past its top speed, so that the
// two come level there; what holds it back at the top is what slows it when the throttle is shut)
const dragOf = (h) => (h.accel - h.still) / (1.04 * h.top) ** 2;

export function stepBoat(s, input, dt, { handling: h }) {
  const throttle = Math.max(0, Math.min(1, input.throttle || 0));
  const brake = Math.max(0, Math.min(1, input.brake || 0));
  const steer = Math.max(-1, Math.min(1, input.steer || 0));
  let v = s.speed;
  // the motor: ahead with the throttle, its pull falling away towards the top speed; astern with the brake (a slowing,
  // then going back), never as hard
  let push = 0;
  if (throttle > 0 && brake === 0) push = h.accel * throttle;
  else if (brake > 0) push = v > 0.3 ? -h.back * brake : -h.accel * 0.5 * brake * Math.max(0, 1 - (Math.min(0, v) / -h.astern) ** 2);
  // the water: a little at any speed, more the faster it goes (the square of it)
  const water = (h.still + dragOf(h) * v * v) * Math.sign(v);
  v += (push - water) * dt;
  if (Math.abs(v) < 0.01 && throttle === 0 && brake === 0) v = 0;
  v = Math.max(-h.astern, Math.min(h.top, v));
  // the motor or rudder over, towards where it is steered, at its own pace
  const want = -steer * h.lock;
  s.steer += Math.max(-h.slew * dt, Math.min(h.slew * dt, want - s.steer));
  // how fast it turns: by the motor's angle and the speed (going astern, the other way); not at a standstill
  const grip = Math.min(1, Math.abs(v) / 3) * (1 - 0.35 * Math.min(1, Math.abs(v) / h.top));
  const yawWant = (s.steer / h.lock) * h.turn * grip * Math.sign(v || 1);
  s.yaw += (yawWant - s.yaw) * Math.min(1, dt * (h.slew + 0.6));
  s.heading += s.yaw * dt;
  // the stern sliding out in a turn (the hull's way across, to its left, dying away as the hull bites)
  const slideWant = -s.yaw * Math.abs(v) * 0.12;
  s.side += (slideWant - s.side) * Math.min(1, dt * h.slide);
  // banked into the turn (right positive, as everything leans), the bow up while it climbs onto the plane
  const bankWant = Math.max(-h.bank, Math.min(h.bank, -s.yaw * Math.abs(v) * 0.05));
  s.bank += (bankWant - s.bank) * Math.min(1, dt * 2.5);
  const climbing = Number.isFinite(h.plane) ? Math.max(0, Math.min(1, v / h.plane)) : 0;
  const bowWant = h.bow * (throttle * Math.sin(Math.PI * Math.min(1, climbing)) + 0.3 * Math.min(1, Math.max(0, v - h.plane) / 6));
  s.pitch += (bowWant - s.pitch) * Math.min(1, dt * 1.8);
  s.speed = v;
  return s;
}

// Where it goes this step, from where it is: ahead along its heading and across with its slide.
export function boatStep(s, dt) {
  const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
  // (its left: (cos h, -sin h))
  return { dx: (fx * s.speed + Math.cos(s.heading) * s.side) * dt, dz: (fz * s.speed - Math.sin(s.heading) * s.side) * dt };
}
