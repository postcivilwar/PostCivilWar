// The Post Civil War Sports Mall (30 October 2026, the owner's brief: "create a dedicated shopping mall environment,
// similar to the car showroom you previously created. In this mall, these items must be listed for sale. Users will
// buy them using TR currency"): a mall of its own beside the Kwale road just out of Asaba, on the inland side, between
// the airport's road and the car showroom.
//
//   - the compound: low white railings all round, open to the road through a wide gateway under the mall's name; the
//     forecourt paved, with parking bays either side of the walk to the doors, palms in planters and lamps;
//   - the mall: a two-storey building of the game's own (drawn by src/client/render-sports.js; the owner sent no model
//     for it), white render and dark glass, a canopy over the doors and the name across its front and on its roof;
//   - its hall, the whole ground floor: the owner's eight sports models on show (src/sim/sports.js has what each is
//     and its price), each on its own stand with a plate, the speedboat on its platform in the middle facing the
//     doors; the sales desk against the east wall; glass doors in the middle of the front that slide open for
//     whoever comes to them, and stepping through them takes the player inside (`sports.in`), the mat inside them back
//     out (`sports.out`), as at the car showroom.
//
// Each item is sold where it stands: its listing in the market has its place at its stand (api/_lib/schema.js,
// migration 17). Everything here is in site-grid metres (atani.js: grid +z is true east, toward the river; -x is true
// south, down the Kwale road). The building's walls are solid: nobody walks into them, and from the hall nobody walks
// out but by the doors.

const box = (x0, z0, x1, z1) => Object.freeze({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) });
const pt = (x, z) => Object.freeze({ x, z });

// --------------------------------------------------------------------------------------------- the compound --
const C = box(-702, -182, -588, -72);
// the gateway: open, in the middle of the front, on the road side, under an arch carrying the name
const GATEWAY = Object.freeze({ x: -645, z: C.z1, width: 14, height: 5.6 });

// ------------------------------------------------------------------------------------------- the building --
// 50 m along the road, 28 m deep, 9.6 m to its parapet; its front (+z) faces the road
const BUILDING = Object.freeze({ ...box(-670, -165, -620, -137), height: 9.6, storey: 5.2, parapet: 0.9 });
const FRONT = BUILDING.z1;
// the hall: the whole ground floor inside its walls, to just inside the glass front
const HALL = box(BUILDING.x0 + 0.5, BUILDING.z0 + 0.5, BUILDING.x1 - 0.5, FRONT - 1.0);
const DOOR_X = (BUILDING.x0 + BUILDING.x1) / 2;
const DOORS = Object.freeze({ x: DOOR_X, z: FRONT, width: 3.6, height: 3.4 });

// --------------------------------------------------------------------------------------------- the displays --
// Two rows of stands either side of the middle, the speedboat on its platform between them. Each item faces the way
// it is shown (h, radians: 0 faces the doors, toward +z), on a round stand of radius `r`, raised `lift` metres (the
// small things are shown at a height they can be seen at). `upright`: the surfboard stands on its tail in a rack.
const WEST = [DOOR_X - 17, DOOR_X - 9], EAST = [DOOR_X + 9, DOOR_X + 17];
const ROW = [FRONT - 9, FRONT - 21];
const DISPLAYS = Object.freeze([
  { item: 'bicycle', x: WEST[0], z: ROW[0], h: 0.75, r: 1.6, lift: 0.18 },
  { item: 'e-unicycle', x: WEST[1], z: ROW[0], h: 0.5, r: 1.0, lift: 0.5 },
  { item: 'e-scooter', x: WEST[0], z: ROW[1], h: 0.6, r: 1.35, lift: 0.18 },
  { item: 'hoverboard', x: WEST[1], z: ROW[1], h: 0.4, r: 1.0, lift: 0.6 },
  { item: 'speedboat', x: DOOR_X, z: (ROW[0] + ROW[1]) / 2 - 1.5, h: 0.55, r: 3.6, lift: 0.3, stand: 'platform' },
  { item: 'skateboard', x: EAST[0], z: ROW[0], h: -0.6, r: 1.2, lift: 0.6 },
  { item: 'inline-skates', x: EAST[1], z: ROW[0], h: -0.5, r: 0.9, lift: 0.85 },
  { item: 'surfboard', x: EAST[0], z: ROW[1], h: -0.4, r: 1.3, lift: 0.18, upright: true },
].map((d) => Object.freeze({ stand: 'plinth', upright: false, ...d })));

// the sales desk against the east wall, halfway back; the plants in the corners and by the doors
const DESK = box(HALL.x1 - 1.6, (ROW[0] + ROW[1]) / 2 - 2.4, HALL.x1 - 0.6, (ROW[0] + ROW[1]) / 2 + 2.4);
const PLANTS = Object.freeze([[HALL.x0 + 0.9, HALL.z0 + 0.9], [HALL.x1 - 0.9, HALL.z0 + 0.9], [HALL.x1 - 0.9, HALL.z1 - 0.9], [HALL.x0 + 0.9, HALL.z1 - 0.9], [DOOR_X - 3.4, HALL.z1 - 0.8], [DOOR_X + 3.4, HALL.z1 - 0.8]].map(([x, z]) => pt(x, z)));

// ---------------------------------------------------------------------------------------------- the forecourt --
// the walk from the gateway to the doors; parking bays either side of it (bays only: nobody's cars stand in them in
// this build); palms in round planters along the front railings; lamps along the walk
const WALK = box(DOOR_X - 4, FRONT + 0.2, DOOR_X + 4, C.z1);
const BAYS = Object.freeze([-1, 1].map((s) => Object.freeze({ side: s, x0: s < 0 ? C.x0 + 6 : DOOR_X + 8, x1: s < 0 ? DOOR_X - 8 : C.x1 - 6, z0: FRONT + 12, z1: C.z1 - 14, depth: 5.5, width: 2.7 })));

export const SPORTS_MALL = Object.freeze({
  id: 'sports',
  name: 'Post Civil War Sports Mall',
  shop: 'sports',                        // the market's name for the mall (its listings keep it)
  label: 'Post Civil War Sports Mall, Kwale Road, Asaba',
  where: 'on the Kwale road out of Asaba, by the airport road',
  compound: C,
  gateway: GATEWAY,
  railing: Object.freeze({ height: 1.1, post: 1.3 }),
  drive: Object.freeze({ fromRoad: box(GATEWAY.x - GATEWAY.width / 2 - 2, C.z1, GATEWAY.x + GATEWAY.width / 2 + 2, -59) }),
  walk: WALK,
  bays: BAYS,
  forecourt: Object.freeze({
    palms: Object.freeze([-1, 1].flatMap((s) => [0, 1, 2, 3].map((k) => Object.freeze({ x: GATEWAY.x + s * (14 + k * 11), z: C.z1 - 4.5, h: 5.2 + (k % 3) * 0.7, r: 0.85 })))),
    lamps: Object.freeze([-1, 1].flatMap((s) => Array.from({ length: 4 }, (_, k) => Object.freeze({ x: DOOR_X + s * 5.6, z: C.z1 - 10 - k * 14, side: s })))),
  }),
  building: BUILDING,
  hall: Object.freeze({ ...HALL, ceiling: 4.8 }),
  doors: DOORS,
  // stepping through the doors from outside; where someone coming in is set down, and someone going out
  entry: Object.freeze({ x: DOOR_X, z: FRONT + 0.9, radius: 1.5 }),
  arrive: Object.freeze({ x: DOOR_X, z: HALL.z1 - 2.4, heading: Math.PI }),
  leave: Object.freeze({ x: DOOR_X, z: FRONT + 4.6, heading: 0 }),
  exit: box(DOOR_X - 1.8, HALL.z1 - 1.0, DOOR_X + 1.8, HALL.z1),
  displays: DISPLAYS,
  desk: DESK,
  plants: PLANTS,
  // the saleswoman: at the desk (the phone's conversation is where she answers; she is not drawn while the town's
  // shop staff are not: atani.js, ZONE_CAST)
  seller: Object.freeze({ id: 'nkem', name: 'Nkem', home: Object.freeze({ x: HALL.x1 - 2.4, z: (ROW[0] + ROW[1]) / 2, heading: -Math.PI / 2 }) }),
});

// Is a point in the hall (on its floor, inside its walls)?
export const inSportsHall = (x, z, margin = 0) => { const h = SPORTS_MALL.hall; return x > h.x0 + margin && x < h.x1 - margin && z > h.z0 + margin && z < h.z1 - margin; };
// Is a point on the mat inside the doors?
export const onSportsExit = (x, z) => { const e = SPORTS_MALL.exit; return x >= e.x0 && x <= e.x1 && z >= e.z0 && z <= e.z1; };
// Is someone at the doors, outside (where stepping on takes them in)?
export const sportsAtDoors = (x, z) => Math.hypot(x - SPORTS_MALL.entry.x, z - SPORTS_MALL.entry.z) <= SPORTS_MALL.entry.radius + 0.6;
// Is a point inside the compound's railings?
export const inSportsCompound = (x, z, margin = 0) => x > C.x0 + margin && x < C.x1 - margin && z > C.z0 + margin && z < C.z1 - margin;
// The item on show nearest a point, and how far it is from the edge of its stand (null when none is near)
export function sportsDisplayNear(x, z, reach = 1.4) {
  let best = null;
  for (const d of DISPLAYS) {
    const gap = Math.hypot(x - d.x, z - d.z) - d.r;
    if (gap <= reach && (!best || gap < best.gap)) best = { display: d, gap };
  }
  return best;
}
// How tall the mall is at a point (for the camera, which keeps out of it): 0 where it does not stand
export const sportsBuildingAt = (x, z) => (x > BUILDING.x0 && x < BUILDING.x1 && z > BUILDING.z0 && z < BUILDING.z1 ? BUILDING.height + BUILDING.parapet : 0);

// ------------------------------------------------------------------------------------------- what is solid --
function colliders() {
  const out = [];
  const t = 0.1, gx0 = GATEWAY.x - GATEWAY.width / 2, gx1 = GATEWAY.x + GATEWAY.width / 2;
  // the railings all round, open at the gateway, whose two pillars stand either side of it
  out.push(box(C.x0, C.z0 - t, C.x1, C.z0 + t), box(C.x0 - t, C.z0, C.x0 + t, C.z1), box(C.x1 - t, C.z0, C.x1 + t, C.z1));
  out.push(box(C.x0, C.z1 - t, gx0 - 0.5, C.z1 + t), box(gx1 + 0.5, C.z1 - t, C.x1, C.z1 + t));
  for (const x of [gx0 - 0.5, gx1 + 0.5]) out.push(box(x - 0.5, C.z1 - 0.5, x + 0.5, C.z1 + 0.5));
  // the building's walls round the hall, and its glass front from end to end (nobody walks into the hall but by its
  // doors, which take them in)
  const B = BUILDING, w = 0.5;
  out.push(box(B.x0, B.z0, B.x1, B.z0 + w), box(B.x0, B.z0, B.x0 + w, FRONT), box(B.x1 - w, B.z0, B.x1, FRONT));
  out.push(box(B.x0, HALL.z1, B.x1, FRONT));
  // the canopy's two posts before the doors
  for (const s of [-1, 1]) out.push(box(DOOR_X + s * 3.4 - 0.18, FRONT + 3.0 - 0.18, DOOR_X + s * 3.4 + 0.18, FRONT + 3.0 + 0.18));
  // in the hall: the stands (a square inside each round one), the desk, the plants
  for (const d of DISPLAYS) { const k = d.r * 0.72; out.push(box(d.x - k, d.z - k, d.x + k, d.z + k)); }
  out.push(DESK);
  for (const p of PLANTS) out.push(box(p.x - 0.3, p.z - 0.3, p.x + 0.3, p.z + 0.3));
  // on the forecourt: the planters and the lamp posts
  const F = SPORTS_MALL.forecourt;
  for (const q of F.palms) out.push(box(q.x - q.r * 0.8, q.z - q.r * 0.8, q.x + q.r * 0.8, q.z + q.r * 0.8));
  for (const q of F.lamps) out.push(box(q.x - 0.12, q.z - 0.12, q.x + 0.12, q.z + 0.12));
  return Object.freeze(out.map(Object.freeze));
}
export const SPORTS_COLLIDERS = colliders();
// the ground that can be walked and driven on: inside the railings, and the drive out to the road
const R = SPORTS_MALL.drive.fromRoad;
export const SPORTS_AREAS = Object.freeze([C, box(R.x0, C.z1 - 0.5, R.x1, R.z1)]);
