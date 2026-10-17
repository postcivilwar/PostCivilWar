// PostCivilWar PowerBike (16 October 2026): the motorcycle showroom, in the owner's supplied skyscraper model,
// beside HOLARIS Watch, on the open ground west of it between the motor park and Riverside Plaza.
//
//   - the building is the owner's model exactly as supplied (assets/buildings/powerbike/skyscraper.glb, drawn by
//     src/client/render-powerbike.js): a podium with a glass porch, a round central tower and four towers about it,
//     one unit tall in its file and drawn `scale` metres to the unit. What it said on itself (another company's
//     name on the podium and its badge high on the central tower) is covered by the showroom's own signs; the file
//     is not changed;
//   - in front of the porch, one pink column, the kind a buyer steps into (render-holaris.js makes it): stepping in
//     takes the player inside, the screen going dark and coming back (main.js, the simulation's `showroom.in`);
//   - inside, under the podium, the showroom hall: the motorcycles (seventeen) on stands with room all round each, a
//     turntable in the middle, the salesman's desk, a lounge, and the doors, where a mat by them takes the player
//     back out (`showroom.out`);
//   - the salesman, who keeps the floor and comes to whoever is looking (src/sim/salesman.js).
//
// The fifteen motorcycles are sold where they stand: each one's listing in the market has its place at its stand
// (api/_lib/schema.js, migration 10). Everything here is in site-grid metres (atani.js). The hall's walls are the
// building's walls: from outside nobody walks into it, and from inside nobody walks out of it but by the doors.

const box = (x0, z0, x1, z1) => Object.freeze({ x0, z0, x1, z1 });
const S = 46;                         // metres to one unit of the supplied model
const AT = Object.freeze({ x: -62, z: 38.25 });
// the model's own measure (its file: x ±0.39282, z ±0.38550 about its centre, 0 to 1 up, its front toward +z)
const HALF = Object.freeze({ x: 0.3928223, z: 0.3854981 });

export const POWERBIKE = Object.freeze({
  id: 'powerbike',
  name: 'PostCivilWar PowerBike',
  shop: 'motors',                     // the market's name for the showroom (its listings keep it)
  salesman: 'Obi',
  model: Object.freeze({
    file: 'powerbike.glb', scale: S, x: AT.x, z: AT.z, heading: 0, height: S,
    // where, on the supplied model, the old owner's name is (on the podium's face) and its badge (high on the central
    // tower), in the model's own units: the showroom's signs are put over them
    podiumFace: 0.3425, podiumTop: 0.152, porch: Object.freeze({ x0: -0.123, x1: 0.052, top: 0.1, front: 0.3855 }),
    lettering: Object.freeze({ x0: -0.205, x1: 0.140, y0: 0.118, y1: 0.143 }),
    badge: Object.freeze({ x0: -0.066, x1: -0.027, y0: 0.948, y1: 0.993, z: 0.0335 }),
    // the central tower: its middle, its radius and its top
    tower: Object.freeze({ x: -0.054, z: -0.0525, r: 0.0885, top: 1.0 }),
  }),
  footprint: box(AT.x - HALF.x * S, AT.z - HALF.z * S, AT.x + HALF.x * S, AT.z + HALF.z * S),
  // the hall under the podium: its floor is the ground; its ceiling is below the podium's roof. (Its back wall was at
  // 33.0 until 17 October 2026, when the hall was taken 5.4 m further in under the podium for a fourth row.)
  hall: Object.freeze({ x0: -78.6, z0: 27.6, x1: -45.4, z1: 53.9, ceiling: 6.6 }),
  doors: Object.freeze({ x: -63.6, z: 53.9, width: 2.8, height: 3.2 }),
  // the pink column before the porch, and where someone stepping out of the doors is set down (clear of it)
  portal: Object.freeze({ x: -63.6, z: 59.6, radius: 1.25 }),
  arrive: Object.freeze({ x: -63.6, z: 51.6, heading: Math.PI }),          // just inside the doors, facing in
  leave: Object.freeze({ x: -60.0, z: 58.4, heading: 0 }),                 // outside, beside the column, facing out
  exit: box(-65.4, 52.9, -61.8, 53.9),                                     // the mat inside the doors
  // the motorcycles: three rows of five across the hall, the middle of the middle row on a turntable. Each faces
  // the way it is shown (h, radians: 0 faces the doors, toward +z), on a round stand of radius `r`.
  displays: Object.freeze([
    // the front row, nearest the doors: the lighter machines, and a superbike to meet whoever comes in
    ['streetfighter', -74.8, 48.4, 0.55], ['cafe-racer', -69.2, 48.4, 0.35], ['red-superbike', -63.6, 48.4, 0.3, 'hero'], ['white-sport', -58.0, 48.4, -0.35], ['purple-sport', -52.4, 48.4, -0.55],
    // the middle row: the cruisers, and the show machine turning in the middle
    ['black-cruiser', -74.8, 43.2, 1.1], ['chopper', -69.2, 43.2, 0.9], ['chrome-concept', -63.6, 43.2, 0, 'turntable'], ['black-bobber', -58.0, 43.2, -0.9], ['olive-cruiser', -52.4, 43.2, -1.1],
    // the back row: the big tourers, the roadster and the superbike
    ['yellow-adventure', -74.8, 38.0, 0.45], ['power-cruiser', -69.2, 38.0, 0.3], ['gold-tourer', -63.6, 38.0, 0], ['gold-roadster', -58.0, 38.0, -0.3], ['black-gold-superbike', -52.4, 38.0, -0.45],
    // the fourth row, at the back (17 October 2026): the owner's two newest, either side of the hall's middle line
    ['midnight-cruiser', -66.4, 32.8, 0.35], ['civil-war-tourer', -60.8, 32.8, -0.35],
  ].map(([bike, x, z, h, stand = 'plinth']) => Object.freeze({ bike, x, z, h, stand, r: stand === 'turntable' ? 2.0 : 1.45 }))),
  // the salesman's desk (against the east wall, facing the floor), the lounge by the windows, the brand wall
  desk: box(-48.0, 38.8, -47.1, 42.6),
  lounge: Object.freeze({ sofa: box(-46.4, 45.9, -45.5, 49.9), table: box(-48.6, 46.9, -47.4, 48.9), chairs: Object.freeze([Object.freeze({ x: -49.9, z: 46.4 }), Object.freeze({ x: -49.9, z: 50.4 })]) }),
  plants: Object.freeze([[-77.9, 28.3], [-77.9, 53.2], [-46.1, 28.3], [-46.1, 53.2], [-69.6, 53.3], [-57.6, 53.3]].map(([x, z]) => Object.freeze({ x, z }))),
  // where the salesman waits when nobody is in, and the walk he takes round the floor when he is not with anyone
  home: Object.freeze({ x: -49.4, z: 40.7, heading: -Math.PI / 2 }),
  round: Object.freeze([[-49.4, 40.7], [-55.2, 45.8], [-61.0, 51.2], [-66.4, 45.8], [-72.0, 51.0], [-77.0, 45.8], [-72.0, 40.6], [-71.6, 33.0], [-63.6, 29.9], [-55.6, 33.0], [-60.8, 40.6], [-55.2, 35.4]].map(([x, z]) => Object.freeze({ x, z }))),
});

// Is a point in the hall (on its floor, inside its walls)?
export const inPowerbikeHall = (x, z, margin = 0) => { const h = POWERBIKE.hall; return x > h.x0 + margin && x < h.x1 - margin && z > h.z0 + margin && z < h.z1 - margin; };
// Is a point on the mat inside the doors?
export const onPowerbikeExit = (x, z) => { const e = POWERBIKE.exit; return x >= e.x0 && x <= e.x1 && z >= e.z0 && z <= e.z1; };
// The motorcycle on show nearest a point, and how far it is from the edge of its stand (null in the hall, none near)
export function powerbikeDisplayNear(x, z, reach = 1.4) {
  let best = null;
  for (const d of POWERBIKE.displays) {
    const gap = Math.hypot(x - d.x, z - d.z) - d.r;
    if (gap <= reach && (!best || gap < best.gap)) best = { display: d, gap };
  }
  return best;
}

// What nobody walks through: the building, all round the hall (its walls: thick, as the podium is round it), and in
// the hall the stands, the desk and the lounge. A round stand is a square inside its circle, so the corners do not
// stand out past it.
function colliders() {
  const f = POWERBIKE.footprint, h = POWERBIKE.hall, out = [];
  out.push(box(f.x0, f.z0, f.x1, h.z0), box(f.x0, h.z1, f.x1, f.z1), box(f.x0, h.z0, h.x0, h.z1), box(h.x1, h.z0, f.x1, h.z1));
  for (const d of POWERBIKE.displays) { const k = d.r * 0.72; out.push(box(d.x - k, d.z - k, d.x + k, d.z + k)); }
  out.push(POWERBIKE.desk, POWERBIKE.lounge.sofa, POWERBIKE.lounge.table);
  for (const c of POWERBIKE.lounge.chairs) out.push(box(c.x - 0.4, c.z - 0.4, c.x + 0.4, c.z + 0.4));
  for (const p of POWERBIKE.plants) out.push(box(p.x - 0.3, p.z - 0.3, p.x + 0.3, p.z + 0.3));
  return Object.freeze(out);
}
export const POWERBIKE_COLLIDERS = colliders();
