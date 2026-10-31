// A car's wheels going over someone lying in its way, and its body answering on its springs (31 October 2026, the
// owner's word: "Jam them and climb over them, while the tyres of the car is climbing them, it should show on the car
// reaction, I mean the car should behaves like it climbed a blockage").
//
// Whoever lies on the road (knocked down, or dead) is taken as their body lies as it is drawn: the trunk from the hips
// to the top of the head and each leg from the hips to the toes, each a round bar lying on the ground (`BUMP`: how
// thick). A wheel is lifted by whatever is highest under its tread: across its width, and along the arc of it that is
// nearest the ground, so that it climbs onto a body, rolls over the top and comes down off it as a real wheel does (a
// wheel of radius R over a bar of radius r is lifted by up to 2r, and touches it from sqrt((R + r)^2 - (R - r)^2)
// before it).
// The wheels follow the ground as it is (nothing between a wheel and the road but its tyre); the body follows the
// wheels on its springs, a share of their lift (`share`: the springs take the rest), and settles after with a bounce
// or two (`freq`, `damping`): the nose up as the front wheels climb, down as they come off, then the tail; leaning to
// one side when only one side goes over.
//
//   const lift = wheelLifts(bodies, car.wheels, x, z, h, steer, out);       metres each wheel is lifted
//   const b = bodyOn(state, lift, car.wheels, dt);                           { rise, pitch, roll }
export const BUMP = Object.freeze({
  trunk: 0.12,              // metres: half of how high the trunk lies off the road
  leg: 0.07,                // and a leg
  head: 0.2,                // metres past the head's bone to the top of the head
  toes: 0.12,               // and past a foot's bone to the toes
  tread: 0.1,               // half of a tyre's width
  share: 0.6,               // the share of the wheels' lift the body is lifted by (the springs take the rest)
  freq: 1.7,                // how quickly the body settles on its springs (a car's own: about one and a half a second)
  damping: 0.42,            // and how soon its bounce dies away
  most: 0.3,                // metres: no wheel is lifted further than this
});

// Of a body lying at (x, z): the trunk and the legs, as bars on the ground: [{ ax, az, bx, bz, r }].
// From the figure's own bones where it has them (`bones`: hips, head, feet as world points: the trunk to the top of the
// head, each leg to its toes), or else as one bar of a person's length along the way they lie (h), centred where they
// are.
export function bodyBars(at, bones = null) {
  if (bones && bones.hips && bones.head) {
    const past = (to, by) => { const dx = to.x - bones.hips.x, dz = to.z - bones.hips.z, d = Math.hypot(dx, dz); return d > 1e-6 ? { x: to.x + (dx / d) * by, z: to.z + (dz / d) * by } : to; };
    const top = past(bones.head, BUMP.head);
    const out = [{ ax: bones.hips.x, az: bones.hips.z, bx: top.x, bz: top.z, r: BUMP.trunk }];
    for (const f of [bones.footL, bones.footR]) if (f) { const toe = past(f, BUMP.toes); out.push({ ax: bones.hips.x, az: bones.hips.z, bx: toe.x, bz: toe.z, r: BUMP.leg }); }
    return out;
  }
  const ux = Math.sin(at.h || 0) * 0.85, uz = Math.cos(at.h || 0) * 0.85;
  return [{ ax: at.x - ux, az: at.z - uz, bx: at.x + ux, bz: at.z + uz, r: BUMP.trunk }];
}

// How far (on the ground) a point is from a bar's middle line.
function apart(px, pz, b) {
  const dx = b.bx - b.ax, dz = b.bz - b.az;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 1e-9 ? ((px - b.ax) * dx + (pz - b.az) * dz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (b.ax + dx * t), pz - (b.az + dz * t));
}
// How high the bars stand at a point on the ground: the top of the highest under it.
function heightAt(bars, px, pz) {
  let top = 0;
  for (const b of bars) {
    const d = apart(px, pz, b);
    if (d < b.r) { const y = b.r + Math.sqrt(b.r * b.r - d * d); if (y > top) top = y; }
  }
  return top;
}

const ALONG = 17;           // points along the bottom of a wheel's arc, and three across its tread
// Metres each wheel of a car standing at (x, z) facing h is lifted by the bars (`bars`: every bar near), the front
// wheels turned by `steer` (radians, left positive). `wheels`: [{ x, z, r, front }] from the car's middle (x to its
// left, z forward), as car-model.js gives them. Into `out` (an array as long as `wheels`), which it returns.
export function wheelLifts(bars, wheels, x, z, h, steer = 0, out = []) {
  const s = Math.sin(h), c = Math.cos(h);
  for (let k = 0; k < wheels.length; k += 1) {
    const w = wheels[k];
    out[k] = 0;
    if (!bars.length) continue;
    // where the wheel is on the ground, and which way it rolls
    const wx = x + w.x * c + w.z * s, wz = z - w.x * s + w.z * c;
    const a = h + (w.front ? steer : 0);
    const fx = Math.sin(a), fz = Math.cos(a), lx = Math.cos(a), lz = -Math.sin(a);
    const R = w.r;
    // (nothing near enough to reach)
    let near = false;
    for (const b of bars) if (apart(wx, wz, b) < R + b.r + BUMP.tread + 0.05) { near = true; break; }
    if (!near) continue;
    let centre = R;
    for (const t of [-BUMP.tread, 0, BUMP.tread]) {
      for (let i = 0; i < ALONG; i += 1) {
        const u = -R + (2 * R * i) / (ALONG - 1);
        const top = heightAt(bars, wx + fx * u + lx * t, wz + fz * u + lz * t);
        if (top <= 0) continue;
        const y = top + Math.sqrt(Math.max(0, R * R - u * u));
        if (y > centre) centre = y;
      }
    }
    out[k] = Math.min(BUMP.most, centre - R);
  }
  return out;
}

// The body on its springs, following the wheels' lift (each step: `lifts` as wheelLifts gave them). `st` is kept
// between frames ({ rise, pitch, roll } and how fast each is changing); `kick` adds a sudden nose-down push (someone
// struck by the front of the car). Gives st, with rise (metres), pitch (radians, nose down positive) and roll (radians,
// leaning to its right positive), as car-model.js `pose` takes them.
export function bodyOn(st, lifts, wheels, dt) {
  if (!st.v) Object.assign(st, { rise: 0, pitch: 0, roll: 0, v: { rise: 0, pitch: 0, roll: 0 } });
  let front = 0, back = 0, left = 0, right = 0, nf = 0, nb = 0, nl = 0, nr = 0, zf = 0, zb = 0, xl = 0, xr = 0;
  for (let k = 0; k < wheels.length; k += 1) {
    const w = wheels[k], y = lifts[k] || 0;
    if (w.front) { front += y; nf += 1; zf += w.z; } else { back += y; nb += 1; zb += w.z; }
    if (w.x >= 0) { left += y; nl += 1; xl += w.x; } else { right += y; nr += 1; xr += w.x; }
  }
  front = nf ? front / nf : 0; back = nb ? back / nb : 0; left = nl ? left / nl : 0; right = nr ? right / nr : 0;
  const base = nf && nb ? Math.max(1, zf / nf - zb / nb) : 2.6, track = nl && nr ? Math.max(0.8, xl / nl - xr / nr) : 1.6;
  const want = {
    rise: BUMP.share * (front + back) / 2,
    pitch: -Math.atan2(BUMP.share * (front - back), base),
    roll: Math.atan2(BUMP.share * (left - right), track),
  };
  const w0 = 2 * Math.PI * BUMP.freq, z0 = BUMP.damping;
  // (in short steps, however long the frame)
  let left2 = Math.min(0.25, Math.max(0, dt));
  while (left2 > 1e-6) {
    const step = Math.min(1 / 120, left2);
    for (const key of ['rise', 'pitch', 'roll']) {
      const a = w0 * w0 * (want[key] - st[key]) - 2 * z0 * w0 * st.v[key];
      st.v[key] += a * step;
      st[key] += st.v[key] * step;
    }
    left2 -= step;
  }
  return st;
}
// A sudden push to the body: `pitch` radians a second of nose-down swing (positive), `roll` of lean.
export function kickBody(st, pitch = 0, roll = 0) {
  if (!st.v) Object.assign(st, { rise: 0, pitch: 0, roll: 0, v: { rise: 0, pitch: 0, roll: 0 } });
  st.v.pitch += pitch; st.v.roll += roll;
}
