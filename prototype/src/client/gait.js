// How a person walks and runs.
//
// The old figure swung each leg like a pendulum from the hip, so the feet slid over the ground and
// nothing above the waist answered them: it read as a machine. This works the other way round. It
// starts from the foot, which is planted on the ground and stays where it was put while the body
// passes over it, and finds the hip and knee that put it there. The rest follows from the feet: the
// hips drop as the legs spread and rise as one passes under, turn with the leading leg, tip toward
// the leg in the air; the shoulders turn against the hips; the arms swing against the legs.
//
// Nothing here knows about the drawing library: it is arithmetic on a side view of the skeleton,
// in the model's own metres (a figure of scale 1), and is checked by test/gait.test.mjs.
//
//   z  forward, measured from under the hip        phase  0..1 over one full stride (two steps);
//   y  up, from the ground                                the left foot lands at 0, the right at 0.5

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;

// The base skeleton, from the side. Lengths are of the bones as drawn; the angles are how far each
// leans forward when the figure stands at rest.
export const LEG = Object.freeze({
  hipY: 0.965, thigh: 0.4672, shin: 0.3732, thighRest: 0.030, shinRest: -0.029,
  ankleY: 0.125,          // the ankle joint above the sole
  heel: -0.07, ball: 0.17, // where the heel and the toes' joint are, ahead of the ankle
  hipX: 0.082,
});

// What kind of step a speed calls for. People change from walking to running at about two metres a
// second; between 1.9 and 2.6 this passes from one to the other.
export function gaitFor(speed, stride = 1) {
  const v = Math.max(0, speed);
  const run = smooth(1.9, 2.6, v);
  // how far one step carries: longer the faster, and shorter in a wrapper or a long skirt
  const natural = mix(0.40 + 0.18 * Math.min(v, 2.2), 0.86 + 0.23 * Math.max(0, v - 2.4), run);
  const fit = mix(stride, Math.min(1, stride + 0.25), run);
  // nobody's legs go round faster than this, however short the step: beyond it the feet give a little
  const fastest = mix(2.35, 3.5, run);
  const step = Math.max(natural * fit, v / fastest, 0.05);
  const duty = mix(0.60, clamp(0.40 - 0.02 * (v - 2.4), 0.3, 0.4), run);
  return {
    speed: v, run, step,
    rate: v / (2 * step),                     // strides a second
    duty,                                     // the share of a stride a foot spends on the ground
    // the body moves over the planted foot by this much; never more than the leg can cover
    travel: Math.min(2 * Math.min(step, natural * fit) * duty, mix(0.76, 0.98, run)),
    strike: mix(0.30, 0.07, run),             // toes up as the heel lands
    push: mix(1.0, 1.1, run),               // toes down as the foot leaves
    flat: mix(0.14, 0.08, run), heelOff: mix(0.66, 0.45, run),
    lift: mix(0.05 + 0.02 * Math.min(v, 2), 0.20 + 0.055 * Math.max(0, v - 2.4), run),
    ahead: mix(-0.07, -0.12, run),             // where the middle of the planted foot's path is, ahead of the hip
    sink: mix(0.006, 0.045, run),             // how far the hips ride below standing
    spring: mix(0, 0.032 + 0.004 * Math.max(0, v - 2.4), run),        // the bounce of a run
    weight: smooth(0.04, 0.5, v),             // how much of all this shows: nothing when standing
  };
}

// Where the ankle is, and how the foot is tipped, at a point in one leg's own cycle (0 as its heel lands).
// `out` is { z, y, pitch, down } and is filled in and returned.
export function footAt(cycle, g, out = {}, leg = LEG) {
  const t = cycle - Math.floor(cycle);
  const front = g.ahead + g.travel / 2;
  if (t < g.duty) {
    const u = t / g.duty;
    const ref = front - u * g.travel;                 // the ankle, were the foot flat all the way
    let pitch = 0, z = ref, y = leg.ankleY;
    if (u < g.flat) {
      // on the heel, the toes coming down
      const k = 1 - u / g.flat;
      pitch = -g.strike * k * k;
      const s = Math.sin(pitch), c = Math.cos(pitch);
      z = ref + leg.heel + (-leg.heel * c + leg.ankleY * s);
      y = leg.heel * s + leg.ankleY * c;
    } else if (u > g.heelOff) {
      // over the ball of the foot, the heel rising
      const k = (u - g.heelOff) / (1 - g.heelOff);
      pitch = g.push * k * k;
      const s = Math.sin(pitch), c = Math.cos(pitch);
      z = ref + leg.ball + (-leg.ball * c + leg.ankleY * s);
      y = leg.ball * s + leg.ankleY * c;
    }
    out.z = z; out.y = y; out.pitch = pitch; out.down = true;
    return out;
  }
  // in the air: from where it left the ground to where it will land, without a jerk at either end
  const s = (t - g.duty) / (1 - g.duty);
  const sp = Math.sin(g.push), cp = Math.cos(g.push), ss = Math.sin(-g.strike), cs = Math.cos(-g.strike);
  const z0 = front - g.travel + leg.ball + (-leg.ball * cp + leg.ankleY * sp), y0 = leg.ball * sp + leg.ankleY * cp;
  const z1 = front + leg.heel + (-leg.heel * cs + leg.ankleY * ss), y1 = leg.heel * ss + leg.ankleY * cs;
  const m = -g.travel * ((1 - g.duty) / g.duty) * 0.8;      // the ground's own speed under the body, at both ends
  const s2 = s * s, s3 = s2 * s;
  out.z = (2 * s3 - 3 * s2 + 1) * z0 + (s3 - 2 * s2 + s) * m + (-2 * s3 + 3 * s2) * z1 + (s3 - s2) * m;
  // the heel comes up first and highest, then the foot reaches forward low
  const arc = Math.sin(Math.PI * Math.pow(s, 0.72));
  out.y = mix(y0, y1, s * s * (3 - 2 * s)) + g.lift * arc;
  out.pitch = mix(g.push, -g.strike, smooth(0.05, 0.75, s));
  out.down = false;
  return out;
}

// The hip and knee that put the ankle at (dz ahead, dy below) the hip. Angles are how far the thigh and
// the shin lean forward. `reach` is how much of the leg's length that takes; past 1 the foot cannot get there.
export function solveLeg(dz, dy, out = {}, leg = LEG) {
  const full = leg.thigh + leg.shin;
  const want = Math.hypot(dz, dy);
  const d = clamp(want, 0.25, full * 0.9985);
  const along = Math.atan2(dz, dy);
  const open = Math.acos(clamp((leg.thigh * leg.thigh + d * d - leg.shin * leg.shin) / (2 * leg.thigh * d), -1, 1));
  const thigh = along + open;
  const kz = Math.sin(thigh) * leg.thigh, ky = Math.cos(thigh) * leg.thigh;
  const k = d / want;
  out.thigh = thigh;
  out.shin = Math.atan2(dz * k - kz, dy * k - ky);
  out.reach = want / full;
  return out;
}

// How high the hips may ride with the ankle that far ahead (or behind) and that far off the ground.
export function hipRoom(foot, leg = LEG) {
  const full = (leg.thigh + leg.shin) * 0.994;
  return foot.y + Math.sqrt(Math.max(0.04, full * full - foot.z * foot.z));
}

const FOOT_L = {}, FOOT_R = {}, SOLVE = {};

// The whole figure at one moment of a stride.
//   phase   0..1                  speed   metres a second, in the model's own size
//   state   { hipY }              kept between calls, so the hips move like a weight and not like a sum
// Fills `pose` with angles in the figure's own terms (see applyGait in character.js) and returns it.
export function gaitPose(phase, speed, stride, dt, state, pose = {}, leg = LEG) {
  const g = gaitFor(speed, stride);
  const w = g.weight;
  const L = footAt(phase, g, FOOT_L, leg), R = footAt(phase + 0.5, g, FOOT_R, leg);
  // The hips: as high as both legs allow, a little under standing; in a run they also spring.
  const turn = TAU * 2 * (phase - g.duty / 2);
  const ride = leg.hipY - g.sink - g.spring * (1 + Math.cos(turn)) * 0.5 * g.run + g.spring * 0.4 * g.run;
  const room = Math.min(hipRoom(L, leg), hipRoom(R, leg));
  const aim = Math.max(leg.hipY - 0.07, Math.min(ride, room));
  if (!(state.hipY > 0)) state.hipY = aim;
  // a weight on a spring, not a point on a curve: it cannot change height in no time
  state.hipY += (aim - state.hipY) * Math.min(1, dt * mix(26, 34, g.run));
  const hipY = mix(leg.hipY, state.hipY, w);
  pose.hipDrop = hipY - leg.hipY;
  for (const [foot, side] of [[L, 'L'], [R, 'R']]) {
    const s = solveLeg(foot.z * w, hipY - mix(leg.ankleY, foot.y, w), SOLVE, leg);
    pose[`thigh${side}`] = s.thigh - leg.thighRest;
    pose[`shin${side}`] = s.shin - leg.shinRest;
    pose[`foot${side}`] = foot.pitch * w;
    pose[`down${side}`] = foot.down;
  }
  // Which leg leads: +1 as the left foot lands in front, -1 as the right does.
  const lead = Math.cos(TAU * phase);
  const side = Math.sin(TAU * phase);
  // the hips turn toward the leading leg, and tip down on the side of the leg in the air
  pose.hipYaw = -lead * mix(0.075, 0.13, g.run) * w * Math.min(1, stride + 0.2);
  pose.hipRoll = -side * mix(0.045, 0.03, g.run) * w;
  pose.sway = side * mix(0.018, 0.008, g.run) * w;                 // the weight goes over the standing foot
  // the chest turns the other way, by more than the hips turn, so the shoulders swing against them
  pose.chestYaw = lead * mix(0.11, 0.2, g.run) * w;
  pose.chestRoll = side * mix(0.03, 0.02, g.run) * w;
  pose.lean = (mix(0.025, 0.11, g.run) + Math.min(0.1, g.speed * 0.012)) * w;
  // the arms: each goes with the leg across from it, the elbow closing as the hand comes forward
  const reach = mix(0.2 + 0.14 * Math.min(g.speed, 2), 0.62 + 0.05 * Math.max(0, g.speed - 2.4), g.run) * w;
  const bend = mix(0.04, 1.25, g.run) * w;
  const late = 0.04 * TAU;             // the hand trails the foot a little
  const swingL = -Math.cos(TAU * phase - late), swingR = -swingL;      // left arm forward as the right foot lands
  pose.armL = -swingL * reach + mix(0, 0.12, g.run) * w;
  pose.armR = -swingR * reach + mix(0, 0.12, g.run) * w;
  pose.elbowL = -(bend + Math.max(0, swingL) * mix(0.24, 0.3, g.run) * w + Math.max(0, -swingL) * mix(0.02, -0.25, g.run) * w);
  pose.elbowR = -(bend + Math.max(0, swingR) * mix(0.24, 0.3, g.run) * w + Math.max(0, -swingR) * mix(0.02, -0.25, g.run) * w);
  pose.armOut = mix(0.03, 0.1, g.run) * w;
  pose.weight = w;
  // the head keeps looking where the body is going
  pose.headYaw = -(pose.hipYaw + pose.chestYaw) * 0.85;
  pose.headPitch = -pose.lean * 0.55;
  pose.rate = g.rate;
  return pose;
}

// The foot's slip over the ground while it is down, in metres a second: how far the animation is from the
// truth. Zero would be a foot nailed in place. For the checks.
export function slipOf(speed, stride = 1, leg = LEG) {
  const g = gaitFor(speed, stride);
  if (g.rate <= 0) return 0;
  const period = 1 / g.rate;
  // the planted foot's reference point goes back at travel / (duty * period); the ground goes back at speed
  return Math.abs(g.travel / (g.duty * period) - speed);
}
