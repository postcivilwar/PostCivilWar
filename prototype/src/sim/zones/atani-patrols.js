// The police's beats (22 October 2026, the owner's brief: sixteen policewomen, "the patrol officers, walking about
// the whole of the delta state", that is all the land the game has: the town, the Kwale road with the car showroom
// and the airport, the bridge over the Niger, and the road up the river into the habitation). Content only, like
// atani.js: where each beat's stops are, and how many officers walk it by day and by night. population.js plans
// their days from it; justice.js sends whoever is nearest when something happens.
//
// An officer walks from stop to stop, in the order `round` gives (it starts again from its beginning), and stands a
// minute or so at each. In the town she keeps to its paths: a stop there is [x, z, facing], where she stands, off
// the carriageway and clear of every door and gate (atani.js finds the path beside it). Beyond the town she keeps to
// a line laid along the road's verge or along the habitation's own paths, from the town's path node where it
// begins (`out`), and stands at the points of it that are named. Every point is walkable and every line between
// them clear (test/police.test.mjs).

// Stops at some of the points of a line out of the town: `at` names them by their place in `line`.
function out(from, line, at) {
  return at.map((k) => {
    const [x, z] = line[k];
    const [px, pz] = k > 0 ? line[k - 1] : line[1];
    const facing = k > 0 ? Math.atan2(x - px, z - pz) : Math.atan2(px - x, pz - z);
    return Object.freeze({ x, z, facing: Math.round(facing * 1000) / 1000, from, via: Object.freeze(line.slice(0, k).map((p) => Object.freeze(p.slice()))) });
  });
}
const stop = (x, z, facing) => Object.freeze({ x, z, facing });
// the round: a list of stops' places, walked in that order and begun again
const there = (n) => Array.from({ length: n }, (_, k) => k);
const andBack = (n) => [...there(n), ...there(n).slice(1, -1).reverse()];

// The Kwale road along its southern verge (the side of the car showroom's drive), out of the town's west end.
const KWALE = [[-244, -50], [-300, -50], [-360, -50], [-404, -50], [-470, -50], [-540, -50]];
// The same verge on to the airport road, up it to Terminal Drive, and along the front of the terminal.
const AIRPORT_WAY = [[-244, -50], [-400, -50], [-560, -50], [-680, -50], [-737, -50], [-737, -120], [-737, -186], [-737, -210], [-800, -210], [-860, -210], [-900, -210]];
// Onto the bridge from the west end of Waterside Road, along its eastern footway to the barrier on the far bank.
const BRIDGE_WAY = [[-203, 116], [-200, 121], [-200, 170], [-200, 240], [-200, 310], [-200, 376]];
// Up the river: Waterside Road's last stretch, the habitation's car park, over the gate's footbridge, up the
// entrance hill, along its top and down the forest path, to the west beach of the lagoon (HABITATION_PATHS).
const HABITATION_WAY = [[250, 113], [276, 113], [300, 104], [318, 91], [324, 91], [334, 91], [346, 91], [349, 90], [354, 82], [362, 66], [369, 52], [375, 38], [380, 25], [384, 17],
  [392, 12], [398, 20], [404, 33], [414, 44], [426, 53], [442, 62], [462, 70], [482, 80], [502, 90], [522, 99], [542, 107], [560, 115], [574, 121], [608, 116], [648, 113], [688, 116], [720, 125]];

const beat = (id, where, day, night, stops, round = there(stops.length)) => Object.freeze({ id, where, day, night, stops: Object.freeze(stops), round: Object.freeze(round) });

// (since 27 October 2026 the town has ten officers, not sixteen: seven walk by day, three by night; the south of the
// town and the airport have no beat of their own until there are more)
export const TOWN_PATROLS = Object.freeze([
  beat('market', 'the market and the motor park', 1, 1, [stop(-24, 103, 1), stop(6, 110, -1.571), stop(24, 80, 0), stop(10, 62, 1.571), stop(43, 64, 3.142), stop(60, 44, -1.571), stop(40, 21, 3.142)]),
  beat('registry', 'Registry Road and the Police Post', 1, 0, [stop(-34, -31, 0), stop(6, -34, -1.571), stop(26, -31, 0), stop(58, -50, 3.142), stop(-58, -50, 3.142)]),
  // along the waterfront both ways, and out over the bridge to the barrier and back
  beat('waterside', 'the waterfront and the bridge', 1, 1, [stop(24, 121, 0), stop(70, 121, 0), stop(130, 121, 0), stop(190, 121, 0), stop(232, 121, 0), stop(-60, 121, 0), stop(-120, 121, 0), stop(-180, 121, 0), ...out('mar_w5', BRIDGE_WAY, [2, 3, 4, 5])],
    [0, 1, 2, 3, 4, 3, 2, 1, 0, 5, 6, 7, 8, 9, 10, 11, 10, 9, 8, 7, 6, 5]),
  beat('west', 'the west of the town: the hospital, the churches and the technical school', 1, 0, [stop(-118, -31, 0), stop(-168, -33, 0), stop(-226, -31, 0), stop(-199, -49, 3.142), stop(-140, -49, 3.142), stop(-98, -49, 3.142), stop(-120, 72, 0), stop(-160, 72, 0)]),
  beat('east', 'the east of the town and its schools', 1, 0, [stop(100, -31, 0), stop(143, -33, 0), stop(210, -31, 0), stop(167, -49, 3.142), stop(120, -49, 3.142), stop(110, 72, 0), stop(162, 72, 0)]),
  beat('south', 'Yard Lane, the layout, the campuses and the farms', 0, 0, [stop(9, -100, -1.571), stop(12, -150, 0), stop(84, -131, 0), stop(150, -133, 0), stop(100, -220, 3.142), stop(11, -272, -1.571), stop(-11, -292, 1.571), stop(97, -334, 0), stop(9, -400, -1.571), stop(-201, -336, 0), stop(-60, -133, 0)]),
  beat('kwale', 'the Kwale road and the car showroom', 1, 0, out('t3', KWALE, [1, 3, 5]), andBack(3)),
  beat('airport', 'the airport', 0, 0, out('t3', AIRPORT_WAY, [3, 6, 9]), andBack(3)),
  beat('habitation', 'the road up the river and the habitation', 1, 1, out('t2', HABITATION_WAY, [2, 14, 22, 26, 28, 30]), andBack(6)),
]);
