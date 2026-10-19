// Running into something on a motorcycle or in a car (19 October 2026, the owner's brief and video: a rider was
// thrown off at 28 km/h on open grass, beside a building, with nothing in front of him).
//
// Until now any step a vehicle could not take at more than about 20 km/h threw a motorcyclist off and hurt a driver,
// whatever stopped it and however it met it: a wall met head on, a wall brushed along its length, the invisible edge of
// the map, the river's bank. Now what happens depends on what was run into and on how hard the vehicle went into it:
// the part of its speed that goes INTO the thing (straight at a wall, all of it; along a wall, almost none of it), not
// the speed it was going along.
//   - the edge of what is built (the end of the map, the river's bank, the bush beyond the roads) is not a thing that
//     is hit: the vehicle slides along it, or is stopped at it; nobody is hurt or thrown
//   - a glancing touch (less than `scrape` into it): it slides along, scraping, a little slower
//   - harder (up to `knock`, or `barrier` for a roadblock, which gives a little): it stops dead against it with a jolt
//     and a step back; the rider stays on, the driver unhurt
//   - harder still: a crash. The rider is thrown off (own-bikes.js `crash`), the driver hurt (own-cars.js).
// Both the page (which moves the vehicle) and the town (which is asked to throw the rider) work it out the same way,
// with these functions; the town does it again from where it knows the vehicle to be and how fast it saw it go, and
// throws nobody the page says crashed where nothing is in the way.
export const CONTACT = Object.freeze({
  scrape: 2.6,          // m/s into it: less, and it slides along
  knock: 6.4,           // m/s into a wall, a vehicle, a post: less, and it stops dead; more, a crash (about 23 km/h head on)
  barrier: 8.3,         // m/s into a roadblock's boards and drums: they give a little (about 30 km/h head on)
  edgeStop: 1.6,        // m/s into the edge of what is built: less, it slides along it; more, it is stopped there
  slideLoss: 0.94,      // what is kept of the speed along it, each step it scrapes
});

// The way back out of what was run into, as the vehicle meets it: from which of the two half-steps (along x alone,
// along z alone) would have been free. `free(x, z)` says whether the vehicle could stand there. A unit vector; straight
// back the way it came where neither half-step is free (a corner, or head on).
export function contactNormal(free, x, z, nx, nz) {
  const dx = nx - x, dz = nz - z;
  const len = Math.hypot(dx, dz) || 1;
  const alongX = Math.abs(dx) > 1e-6 && free(nx, z), alongZ = Math.abs(dz) > 1e-6 && free(x, nz);
  if (alongX && !alongZ) return { x: 0, z: -Math.sign(dz) };
  if (alongZ && !alongX) return { x: -Math.sign(dx), z: 0 };
  return { x: -dx / len, z: -dz / len };
}

// What comes of it. `speed` (m/s, negative backing up) along `heading`; `normal` from contactNormal; `kind` 'solid',
// 'barrier' or 'edge'. Returns how hard it went in (`into`, m/s), what is left along it (`along`, and as a velocity
// `alongX`, `alongZ`), and the `outcome`: 'slide', 'stop' or 'crash'.
export function contactOutcome({ speed, heading, normal, kind = 'solid' }) {
  const vx = Math.sin(heading) * speed, vz = Math.cos(heading) * speed;
  const into = Math.max(0, -(vx * normal.x + vz * normal.z));
  const alongX = vx + into * normal.x, alongZ = vz + into * normal.z;
  const along = Math.hypot(alongX, alongZ);
  let outcome;
  if (kind === 'edge') outcome = into < CONTACT.edgeStop ? 'slide' : 'stop';
  else if (into < CONTACT.scrape) outcome = 'slide';
  else if (into < (kind === 'barrier' ? CONTACT.barrier : CONTACT.knock)) outcome = 'stop';
  else outcome = 'crash';
  return { into, along, alongX, alongZ, outcome };
}

// How hard a crash is, from how hard the vehicle went in: 0 just past the crash, 1 at `full` m/s into it.
export function crashShare(into, kind = 'solid', full = 30) {
  const least = kind === 'barrier' ? CONTACT.barrier : CONTACT.knock;
  return Math.max(0, Math.min(1, (into - least) / Math.max(1, full - least)));
}

// Where a rider thrown over the handlebars comes down (19 October 2026). On along the way the bike was going (`ux`,
// `uz`, a unit vector, from `x`, `z`), as far as the throw carries (`far`), with room on the ground for the whole body
// lying along that way: the hands ahead of the hips, the feet behind them (LYING, as falls.js lays a figure on its
// front). Pitched over something low in the way (a roadblock's boards, a fence: what `kind` calls 'barrier', none of
// it higher than THROW.over) when there is ground with room beyond it, as a rider over the bars is; never through a
// wall or anything else solid, and never off the land. Where the way on is shut, the body comes down beside the bike,
// against what it hit, lying alongside it: on its right, as the bike goes down on its left (own-bike-view.js), unless
// there is no room there. `kind(x, z, r)` says what is at a point: 'edge', 'barrier', 'solid' or null.
// Gives { x, z, d (how far on), over } where `over` is null or { a, b }: the metres along the way, from the bike, over
// which the low thing it went over lies (the page lifts the body over it, falls.js).
export const LYING = Object.freeze({ ahead: 0.85, behind: 0.95, radius: 0.28 });
export const THROW = Object.freeze({ over: 1.3, nearest: 1.5, step: 0.2, beside: Object.freeze([1.0, 1.4, -1.75, -2.1]) });
export function throwLanding({ x, z, ux, uz, far, kind }) {
  const rx = -uz, rz = ux;                       // to the right of the way
  const lies = (px, pz) => { for (let k = -LYING.behind; k <= LYING.ahead + 1e-6; k += 0.3) if (kind(px + ux * k, pz + uz * k, LYING.radius)) return false; return true; };
  // the way there, a body's breadth wide: open, or low (and gone over); nothing solid on it, and all of it on the land
  const way = (px, pz) => {
    const len = Math.hypot(px - x, pz - z);
    let over = null;
    for (let s = 0.3; s <= len + 1e-6; s += 0.15) {
      const k = kind(x + ((px - x) * s) / len, z + ((pz - z) * s) / len, 0.15);
      if (k === 'solid' || k === 'edge') return null;
      if (k === 'barrier') over = over ? { a: over.a, b: s } : { a: s, b: s };
    }
    return { over: over ? { a: Math.round(over.a * 100) / 100, b: Math.round(over.b * 100) / 100 } : null };
  };
  for (let d = far; d >= THROW.nearest - 1e-6; d -= THROW.step) {
    const px = x + ux * d, pz = z + uz * d;
    if (!lies(px, pz)) continue;
    const w = way(px, pz);
    if (w) return { x: px, z: pz, d, over: w.over };
  }
  // shut ahead: beside the bike, as far on as there is room for the body (its hands short of what was hit)
  for (const side of THROW.beside) {
    for (let d = 0.6; d >= -1.0 - 1e-6; d -= THROW.step) {
      const px = x + ux * d + rx * side, pz = z + uz * d + rz * side;
      if (!lies(px, pz)) continue;
      const w = way(px, pz);
      if (w && !w.over) return { x: px, z: pz, d, over: null };
    }
  }
  return { x, z, d: 0, over: null };
}
