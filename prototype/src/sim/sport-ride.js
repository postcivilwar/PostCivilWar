// How each of the sports mall's things goes when it is ridden (30 October 2026, the owner's brief: "Ensure each NPC
// realistically pedals, balances, and maneuvers their equipment, with smooth wheel rotation and realistic motions...
// Once hijacked, the player must pedal and control the bike"). In metres, seconds and radians, as everything else.
//
// What moves each one, and so how it is ridden:
//   bicycle     pedalled: it pulls as hard as a rider pushes the pedals, less the faster it goes; let go of the pedals
//               it coasts (the cranks stand still, the wheels go on); it leans into a turn as a motorcycle does
//   skateboard  pushed: a foot goes down to the road and sweeps back, once a stride, each push adding a little speed;
//               carved by leaning on the deck (the trucks turn under it)
//   skates      skated: a stride out and back with one leg, then the other; leaned into a turn
//   e-scooter   its motor, under the thumb; steered by its bars, upright
//   hoverboard  its two motors, by leaning forward; turned on the spot by pressing one foot
//   e-unicycle  its motor, by leaning forward; balanced side to side, leaned into a turn
//
// `phase` is where the rider is in what they do over and over (radians round the cranks; strides and pushes counted
// in turns): the page draws the pedals, the push or the stride from it, and another player's from their speed.

const G = 9.81;
const H = (o) => Object.freeze(o);

// top: m/s on tar; rough: off it; accel: m/s² at a standstill, less towards the top; brake: m/s²; coast: m/s² lost
// with nothing driving it; leanMax, leanRate: as a motorcycle's; steerSlow: radians a second turned at walking pace by
// the bars (or the feet); spin: can it turn round on the spot; room: metres it takes up
export const SPORT_HANDLING = Object.freeze({
  bicycle: H({ drive: 'pedals', top: 8.3, rough: 5.5, accel: 1.5, brake: 5.5, coast: 0.22, drag: 0.004, leanMax: 0.5, leanRate: 2.4, steerSlow: 1.4, room: 0.45, gear: 5.7 }),
  skateboard: H({ drive: 'push', top: 5.0, rough: 1.2, accel: 1.25, brake: 2.8, coast: 0.3, drag: 0.004, leanMax: 0.3, leanRate: 2.2, steerSlow: 1.1, room: 0.35, stride: 1.05 }),
  'inline-skates': H({ drive: 'stride', top: 6.1, rough: 1.0, accel: 1.4, brake: 3.2, coast: 0.25, drag: 0.004, leanMax: 0.38, leanRate: 2.6, steerSlow: 1.8, room: 0.3, stride: 0.95 }),
  'e-scooter': H({ drive: 'motor', top: 6.9, rough: 3.0, accel: 1.9, brake: 4.5, coast: 0.35, drag: 0.004, leanMax: 0.18, leanRate: 2.8, steerSlow: 1.6, room: 0.35 }),
  hoverboard: H({ drive: 'motor', top: 3.3, rough: 1.2, accel: 1.2, brake: 3.0, coast: 0.6, drag: 0.004, leanMax: 0.08, leanRate: 3.0, steerSlow: 2.4, spin: true, room: 0.35 }),
  'e-unicycle': H({ drive: 'motor', top: 8.3, rough: 3.5, accel: 1.7, brake: 3.8, coast: 0.4, drag: 0.004, leanMax: 0.42, leanRate: 2.4, steerSlow: 1.3, room: 0.3 }),
});
export const sportHandling = (id) => SPORT_HANDLING[id] || null;
export const LAND_SPORTS = Object.freeze(Object.keys(SPORT_HANDLING));
export const SPORT_FASTEST = Math.max(...Object.values(SPORT_HANDLING).map((h) => h.top));

// What each presents to someone in front of it, as a vehicle does (impact.js FRONTS): half its width (the rider's
// shoulders, or the bicycle's bar), and how far ahead of its middle and behind it it reaches. In metres.
export const SPORT_FRONTS = Object.freeze({
  bicycle: H({ half: 0.42, nose: 0.9, tail: 0.88 }),
  skateboard: H({ half: 0.3, nose: 0.5, tail: 0.5 }),
  'inline-skates': H({ half: 0.3, nose: 0.3, tail: 0.3 }),
  'e-scooter': H({ half: 0.3, nose: 0.55, tail: 0.5 }),
  hoverboard: H({ half: 0.32, nose: 0.25, tail: 0.25 }),
  'e-unicycle': H({ half: 0.3, nose: 0.3, tail: 0.3 }),
});
// How it is said that someone was on it ("ran into you on a bicycle"), and which have a bell to ring.
export const SPORT_ON = Object.freeze({ bicycle: 'a bicycle', skateboard: 'a skateboard', 'inline-skates': 'skates', 'e-scooter': 'an electric scooter', hoverboard: 'a hoverboard', 'e-unicycle': 'an electric unicycle' });
export const SPORT_BELL = Object.freeze(['bicycle', 'e-scooter']);
// Whether the rider sits (the bicycle) or stands (the rest).
export const sportSeated = (id) => id === 'bicycle';

// One step of a ridden thing.
//   state  { speed, lean, heading, phase, pushing }   (changed in place; returned)
//   input  { steer: -1..1 (left negative), throttle: 0..1 (pedal, push, skate or the motor), brake: 0..1 }
// It turns by leaning as a motorcycle does (a lean of θ at speed v turns it at g·tanθ/v), and at walking pace by its
// bars or the rider's feet; the hoverboard turns round on the spot.
export function stepSport(state, input, dt, { handling, onTar = true, wet = false } = {}) {
  const h = handling;
  const steer = Math.max(-1, Math.min(1, input.steer || 0));
  const throttle = Math.max(0, Math.min(1, input.throttle || 0));
  const brake = Math.max(0, Math.min(1, input.brake || 0));
  const top = (onTar ? h.top : h.rough) * (wet ? 0.9 : 1);
  let v = state.speed;
  // what drives it: the pedals and the motors steadily; a push or a stride in its own time (a stride's worth of
  // speed comes while the foot is down and sweeping back, none while it comes forward again)
  let drive = 0;
  if (throttle > 0 && brake === 0) {
    if (h.drive === 'push' || h.drive === 'stride') {
      const t = (state.phase || 0) % 1;
      drive = t < 0.55 ? h.accel * 2.9 * Math.sin((t / 0.55) * Math.PI) : 0;
    } else drive = h.accel;
    // (less as it nears its top speed: a motor's pull falls away steadily; a rider's push or stride keeps its strength
    // until near the most a rider can go, and then can add no more)
    const near = Math.max(0, v) / top;
    drive *= throttle * Math.max(0.03, 1 - (h.drive === 'push' || h.drive === 'stride' ? near ** 6 : near ** 2));
  }
  if (brake > 0 && v > 0.05) v = Math.max(0, v - h.brake * (wet ? 0.75 : 1) * brake * dt);
  else if (brake > 0) v = 0;
  else if (drive > 0) v += drive * dt;
  // (with nothing driving it, and between strides, it rolls on, slowing a little)
  if (drive <= 0 || h.drive === 'push' || h.drive === 'stride') v -= Math.sign(v) * Math.min(Math.abs(v), (h.coast + h.drag * v * v) * dt);
  if (v > top) v = Math.max(top, v - h.brake * 0.5 * dt);
  // the rhythm of it: the cranks go round with the wheels while the rider pedals; a push or a stride is begun only
  // while the rider is driving it, and once begun is finished
  if (h.drive === 'pedals') {
    if (throttle > 0 && brake === 0) state.phase = ((state.phase || 0) + (Math.max(0, v) / h.gear) * Math.PI * 2 * dt) % (Math.PI * 2);
  } else if (h.drive === 'push' || h.drive === 'stride') {
    const before = state.phase || 0;
    const going = throttle > 0 && brake === 0 && v < top * 0.98;
    // (a stroke is quicker rolling than from a standstill: the foot sweeps back past the board as it goes)
    if (going || before % 1 > 1e-6) {
      let next = before + dt / (h.stride * (1 - 0.35 * Math.min(1, Math.max(0, v) / top)));
      // let go mid-stroke, the stroke is finished and the foot comes back to rest at its end
      if (!going && Math.floor(next) !== Math.floor(before)) next = Math.floor(next);
      state.phase = next % 2;
    }
  }
  state.pushing = (h.drive === 'push' || h.drive === 'stride') && ((state.phase || 0) % 1) > 0.001;
  // the lean, and the turn it makes
  const speedShare = Math.min(1, Math.abs(v) / 4);
  const leanWant = steer * h.leanMax * speedShare;
  state.lean += (leanWant - state.lean) * Math.min(1, dt * h.leanRate);
  const fromLean = Math.abs(v) > 0.5 ? ((G * Math.tan(Math.abs(state.lean))) / Math.max(1.5, Math.abs(v))) * Math.sign(state.lean) : 0;
  const fromBars = steer * h.steerSlow * (h.spin ? 1 : (1 - speedShare) * Math.min(1, Math.abs(v) / 0.4));
  state.heading -= (fromLean + fromBars) * Math.sign(v || 1) * dt;
  state.speed = Math.abs(v) < 0.02 && !throttle ? 0 : v;
  return state;
}
