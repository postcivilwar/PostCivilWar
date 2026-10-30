// Sports equipment: the owner's sports models (30 October 2026), sold new at the Post Civil War Sports Mall
// (zones/asaba-sports.js) for TR, one of each to a player.
//
// The prices are the owner's (30 October 2026, 22:01 Lagos time: "sell speedboat at 600 TR, THEN sell bicycle at 300 TR,
// SELL ELECTRIC SCOOTER FOR 200 TR, THE CHEAPEST should be skateboard, sold at 50 TR"), in place of the 10 to 100 TR of
// his first brief of that day. The four he did not name are set between, in the order they had in the plan he was sent
// (each dearer than the one below it): the electric unicycle 150 TR, the hoverboard 120, the surfboard 100, the pair of
// inline skates 75. He may change any of them.
//
// The naval ships are not for sale: three of them are on the river, crewed by townspeople (the same brief: "the navel
// ship should be only 3 in number and not for sale, it should be on the river, driven by NPCs").
//
// The models are the owner's (assets/sports/, drawn as supplied: src/client/sports-model.js and tools/sports/
// sports.py). Nothing here names a maker. The server sells each at the price here (api/_lib/schema.js, migration 17;
// a test checks the two agree).
//
// An entry:
//   id          how the game knows it (and its model in the game's copies, assets/sports/game/<id>.bin)
//   name        what a player sees
//   price       TR, new from the mall
//   kmh         its top speed, as such a thing goes (pedalled, pushed, or by its motor)
//   on          'land' (the roads and the paved and beaten ground) or 'water' (the river, the lagoon)
//   drive       what moves it: 'pedals', 'push', 'motor', 'battery', 'waves'
//   blurb       a line for the market, and for the plate at its stand

const item = (id, name, price, kmh, on, drive, blurb) => Object.freeze({ id, name, price, kmh, on, drive, blurb });

// The things on sale (in the order of the plan the owner was sent).
export const SPORTS = Object.freeze(Object.fromEntries([
  item('bicycle', 'Fat-Tyre Bicycle', 300, 30, 'land', 'pedals', 'A fat-tyre bicycle: tyres four inches wide for sand, dirt roads and potholes, a light frame and a wide bar. No motor: it goes as fast as you pedal.'),
  item('speedboat', 'Speedboat', 600, 60, 'water', 'motor', 'A two-seat runabout with an outboard motor and a steering wheel at the front of its cockpit, made for the river.'),
  item('e-scooter', 'Electric Scooter', 200, 25, 'land', 'battery', 'An electric scooter in white and black: stand on its deck, thumb the throttle, and go.'),
  item('e-unicycle', 'Electric Unicycle', 150, 30, 'land', 'battery', 'One big wheel with a motor in it and a pedal each side: lean forward to go, back to slow. For those who can balance.'),
  item('hoverboard', 'Hoverboard', 120, 12, 'land', 'battery', 'Two wheels and a deck between them, black with blue trim: lean forward to roll, press one foot to turn.'),
  item('surfboard', 'Surfboard', 100, 25, 'water', 'waves', 'A six-foot shortboard in grey, with grip pads where the feet go: made for the waves.'),
  item('inline-skates', 'Inline Skates', 75, 22, 'land', 'push', 'A pair of inline skates, four wheels in a line on each, red and black, with a buckle and a strap at the ankle.'),
  item('skateboard', 'Skateboard', 50, 18, 'land', 'push', 'A long skateboard with big soft wheels: push off, ride, and carve down the road.'),
].map((s) => [s.id, s])));

// Not sold: the three naval ships on the river (stage 4 of the brief).
export const NOT_FOR_SALE = Object.freeze(['naval-ship']);

export const SPORT_IDS = Object.freeze(Object.keys(SPORTS));
export const sportOf = (id) => SPORTS[id] || null;
// the market's name for an item's model ('sport:<id>'), and the item a model names
export const sportModel = (id) => `sport:${id}`;
export const sportOfModel = (model) => (typeof model === 'string' && model.startsWith('sport:') ? SPORTS[model.slice(6)] || null : null);
