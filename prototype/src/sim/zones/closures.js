// Where the town stops, and the roads that are not open yet (19 October 2026, the owner's brief: "We are still
// building the game world. Players must be able to see that these routes are not available instead of travelling
// into an incomplete area, hitting invisible boundaries, falling, or discovering missing map geometry").
//
// Every part of the land is in one of four states (AREA_STATE): open and complete; closed for a while; under
// construction; or restricted for some other reason. What is not open is shown as it would be in Asaba: a road that
// runs on into land not built yet, or out to the edge of what is built, is closed a little before its end, across its
// whole width and both verges, by a roadblock (striped barricades on trestles with amber lamps, painted oil drums at
// its ends, cones before it, and a ROAD CLOSED board saying why); and the edge of the built land itself is fenced
// along its length (timber posts and striped rails, with a board now and then), so that nobody rides on into the
// end of the world and meets nothing there. Each is solid where it is drawn (`barrier`: it gives a little, more than
// a wall, contact.js), and no wider.
//
// To open a road when the land beyond it is built, set its state to 'open' (or remove it): its roadblock and its
// colliders go with it, and the fence stops where the land goes on. To close one, add it here.
//
// This file is content, read by the simulation (what is in the way, atani.js) and by the drawing
// (render-closures.js), the radar and the town map. It imports nothing from the town (atani.js imports it), so the
// edge of the land is worked out there, with the town's own idea of where its ground is (`edgeFences`).

export const AREA_STATE = Object.freeze({ OPEN: 'open', CLOSED: 'closed', BUILDING: 'under construction', RESTRICTED: 'restricted' });

// A roadblock: a straight line across a road (from `a` to `b`), its front facing `facing` (radians from +z toward +x:
// the way the traffic that meets it comes from), what is beyond it, and why.
const closure = (id, name, state, a, b, facing, sign, why) => Object.freeze({ id, name, state, a: Object.freeze(a), b: Object.freeze(b), facing, sign: Object.freeze(sign), why });
// (grid metres: +x is true north, +z true east; the road boxes are atani.js ZONE_ROADS)
export const ROAD_CLOSURES = Object.freeze([
  // Waterside Road runs out of the town to the south and to the north: neither is built on yet
  closure('waterside-south', 'Waterside Road, south end', AREA_STATE.BUILDING, { x: -243, z: 105.6 }, { x: -243, z: 120.4 }, Math.PI / 2,
    ['ROAD CLOSED', 'Road works ahead'], 'Asaba is still being built beyond this point.'),
  // (open since 20 October 2026: it goes on up the river to the habitation, habitation.js)
  closure('waterside-north', 'Waterside Road, north end', AREA_STATE.OPEN, { x: 243, z: 105.6 }, { x: 243, z: 120.4 }, -Math.PI / 2,
    ['ROAD CLOSED', 'Road works ahead'], 'Asaba is still being built beyond this point.'),
  // Registry Road ends in open ground to the north: the way on is not laid yet
  closure('registry-north', 'Registry Road, north end', AREA_STATE.BUILDING, { x: 241.5, z: -47.4 }, { x: 241.5, z: -32.6 }, -Math.PI / 2,
    ['ROAD CLOSED', 'Road not yet built'], 'The road is not built on from here.'),
  // Campus Road, the same
  closure('campus-north', 'Campus Road, north end', AREA_STATE.BUILDING, { x: 241.5, z: -347.2 }, { x: 241.5, z: -334.8 }, -Math.PI / 2,
    ['ROAD CLOSED', 'Road not yet built'], 'The road is not built on from here.'),
  // College Road runs west to the edge of the town's land
  closure('college-west', 'College Road, west end', AREA_STATE.BUILDING, { x: -7.4, z: -472 }, { x: 7.4, z: -472 }, 0,
    ['ROAD CLOSED', 'Road works ahead'], 'Asaba is still being built beyond this point.'),
]);
export const openClosures = () => ROAD_CLOSURES.filter((c) => c.state !== AREA_STATE.OPEN);

// The pieces of a roadblock, along its line: a barricade every 2.5 m (its width 2.4 m), an oil drum at each end,
// cones in a line before it. What is solid is the line of barricades and the drums (the cones are knocked aside).
export const CLOSURE_KIT = Object.freeze({ barricade: 2.4, gap: 0.1, depth: 0.7, height: 1.25, drum: 0.6, cones: 6, coneAhead: 3.2 });
export function closureColliders(list = openClosures()) {
  const out = [];
  for (const c of list) {
    const x0 = Math.min(c.a.x, c.b.x), x1 = Math.max(c.a.x, c.b.x), z0 = Math.min(c.a.z, c.b.z), z1 = Math.max(c.a.z, c.b.z);
    const half = CLOSURE_KIT.depth / 2;
    // (the line runs along x or along z: its box is the line, as deep as the barricades' feet)
    out.push(Object.freeze(x1 - x0 > z1 - z0 ? { x0, z0: z0 - half, x1, z1: z1 + half, barrier: true, closure: c.id } : { x0: x0 - half, z0, x1: x1 + half, z1, barrier: true, closure: c.id }));
  }
  return out;
}

// The edge of the built land, fenced. Each candidate line runs a little inside the edge of some land (the town's own,
// the road to Kwale, the airport's, the far bank of the Niger) with the way out of it (`out`); the fence stands along
// it wherever the land really does end just beyond it, and nowhere it goes on (where the town meets the road to Kwale,
// say). `ground(x, z)` is the town's own test of where its ground is (atani.js).
const INSET = 1.4;
const line = (id, a, b, out, style = 'tape') => Object.freeze({ id, a: Object.freeze(a), b: Object.freeze(b), out: Object.freeze(out), style });
export const EDGE_LINES = Object.freeze([
  // the town's own land: its west (true south), east (true north) and inland (true west) edges; its fourth is the river
  line('town-south', { x: -250 + INSET, z: -480 + INSET }, { x: -250 + INSET, z: 185 }, { x: -1, z: 0 }),
  line('town-north', { x: 250 - INSET, z: -480 + INSET }, { x: 250 - INSET, z: 185 }, { x: 1, z: 0 }),
  line('town-west', { x: -250 + INSET, z: -480 + INSET }, { x: 250 - INSET, z: -480 + INSET }, { x: 0, z: -1 }),
  // the road to Kwale: its verges' outer edges, and its end beyond the road works
  line('kwale-riverside', { x: -1192 + INSET, z: -20 - INSET }, { x: -249, z: -20 - INSET }, { x: 0, z: 1 }),
  line('kwale-inland', { x: -1192 + INSET, z: -60 + INSET }, { x: -249, z: -60 + INSET }, { x: 0, z: -1 }),
  line('kwale-end', { x: -1192 + INSET, z: -60 + INSET }, { x: -1192 + INSET, z: -20 - INSET }, { x: -1, z: 0 }),
  // the airport's land, outside its own fence
  line('airport-south', { x: -1160 + INSET, z: -510 + INSET }, { x: -1160 + INSET, z: -20 - INSET }, { x: -1, z: 0 }),
  line('airport-west', { x: -1160 + INSET, z: -510 + INSET }, { x: -560 - INSET, z: -510 + INSET }, { x: 0, z: -1 }),
  line('airport-north', { x: -560 - INSET, z: -510 + INSET }, { x: -560 - INSET, z: -60 }, { x: 1, z: 0 }),
  // the far bank of the Niger, either side of where the bridge comes down (its far end has its barrier)
  line('farbank-south', { x: -236 + INSET, z: 322 }, { x: -236 + INSET, z: 383.4 }, { x: -1, z: 0 }),
  line('farbank-north', { x: -174 - INSET, z: 322 }, { x: -174 - INSET, z: 383.4 }, { x: 1, z: 0 }),
  // the road up the river to the habitation: its verges' outer edges, and round its car park (open where the gate's
  // footbridge goes over the stream into the habitation); a plain wooden rail fence, as along a country road and at a
  // park's entrance (the riverside beyond it is countryside, and beyond the car park is the habitation)
  line('upriver-river', { x: 250, z: 122 - INSET }, { x: 1846, z: 122 - INSET }, { x: 0, z: 1 }, 'wood'),
  line('upriver-inland', { x: 250, z: 104 + INSET }, { x: 1832, z: 104 + INSET }, { x: 0, z: -1 }, 'wood'),
  line('park-south', { x: 1832 + INSET, z: 64 + INSET }, { x: 1832 + INSET, z: 104 }, { x: -1, z: 0 }, 'wood'),
  line('park-inland', { x: 1832, z: 64 + INSET }, { x: 1882, z: 64 + INSET }, { x: 0, z: -1 }, 'wood'),
  line('park-river', { x: 1846, z: 122 - INSET }, { x: 1882, z: 122 - INSET }, { x: 0, z: 1 }, 'wood'),
  line('park-gate', { x: 1882 - INSET, z: 64 }, { x: 1882 - INSET, z: 122 }, { x: 1, z: 0 }, 'wood'),
]);
export const EDGE_FENCE = Object.freeze({ post: 3, height: 1.15, depth: 0.3, step: 0.5, beyond: 2.6, least: 3 });
// The runs of fence: along each line, wherever the line is on the land and the land ends just beyond it.
export function edgeFences(ground) {
  const runs = [];
  for (const l of EDGE_LINES) {
    const len = Math.hypot(l.b.x - l.a.x, l.b.z - l.a.z);
    const n = Math.floor(len / EDGE_FENCE.step);
    let start = null, last = null;
    const close = () => { if (start !== null && last - start >= EDGE_FENCE.least) runs.push(Object.freeze({ line: l.id, a: Object.freeze(at(start)), b: Object.freeze(at(last)), out: l.out, style: l.style })); start = null; };
    const at = (d) => ({ x: +(l.a.x + ((l.b.x - l.a.x) * d) / len).toFixed(2), z: +(l.a.z + ((l.b.z - l.a.z) * d) / len).toFixed(2) });
    for (let i = 0; i <= n; i += 1) {
      const d = i * EDGE_FENCE.step;
      const p = at(d);
      // (where the land goes on beyond it the fence stops; a wooden fence, at the habitation's footbridge, a metre short
      // of the way on either side, so that whoever comes to the bridge a little to one side of its middle walks on to it)
      const by = l.style === 'wood' ? 1 : 0, ux = (l.b.x - l.a.x) / len, uz = (l.b.z - l.a.z) / len;
      const beyond = (k) => ground(p.x + ux * k + l.out.x * EDGE_FENCE.beyond, p.z + uz * k + l.out.z * EDGE_FENCE.beyond);
      const edge = ground(p.x, p.z) && !beyond(0) && !(by && (beyond(by) || beyond(-by)));
      if (edge) { if (start === null) start = d; last = d; } else close();
    }
    close();
  }
  return runs;
}
export function fenceColliders(runs) {
  const h = EDGE_FENCE.depth / 2;
  return runs.map((r) => Object.freeze({ x0: Math.min(r.a.x, r.b.x) - h, z0: Math.min(r.a.z, r.b.z) - h, x1: Math.max(r.a.x, r.b.x) + h, z1: Math.max(r.a.z, r.b.z) + h, barrier: true, fence: r.line }));
}
