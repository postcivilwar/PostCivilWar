// What each keke and coach looks like.
//
// The shapes come from the two supplied designs and never change. A vehicle's
// look is only what an owner could change on a real one: which front the keke
// has, the paint, the cloth and seats, the markings and plate, what it carries
// and how worn and dusty it is. A look is plain data, so the simulation can
// own it, save it and hand the same one to every player.

// Sizes of the two designs in metres, as measured from the supplied models
// (test/vehicles.test.mjs checks them against the baked kit). `halfWidth` and
// `halfLength` are the footprint someone on foot walks round.
export const VEHICLE_MODELS = Object.freeze({
  keke: Object.freeze({ id: 'keke', name: 'Keke', width: 1.625, bodyWidth: 1.224, length: 2.581, height: 1.92, front: 1.317, back: -1.264, wheelRadius: 0.251, halfWidth: 0.72, halfLength: 1.32, trims: Object.freeze(['modern', 'classic', 'tvs']) }),
  bus: Object.freeze({ id: 'bus', name: 'Coach', width: 3.41, bodyWidth: 2.624, length: 11.569, height: 3.817, front: 5.896, back: -5.673, wheelRadius: 0.492, halfWidth: 1.45, halfLength: 5.9, trims: Object.freeze(['standard']) }),
});

export const KEKE_TRIMS = Object.freeze({
  modern: 'Square lamps',
  classic: 'Round lamps',
  tvs: 'Square lamps, slim',
});

// Body colours, in the order the brief numbers them. Yellow is the colour the model was supplied in.
export const KEKE_PAINTS = Object.freeze([
  Object.freeze({ id: 'blue', name: 'Blue', paint: 0x1d4f9e }),
  Object.freeze({ id: 'green', name: 'Green', paint: 0x1f7a3d }),
  Object.freeze({ id: 'red', name: 'Red', paint: 0xb3261e }),
  Object.freeze({ id: 'yellow', name: 'Yellow', paint: 0xe7b40e }),
  Object.freeze({ id: 'white', name: 'White', paint: 0xecebe4 }),
  Object.freeze({ id: 'black', name: 'Black', paint: 0x1d1e22 }),
  Object.freeze({ id: 'orange', name: 'Orange', paint: 0xe2731a }),
]);
export const KEKE_CANOPIES = Object.freeze({ black: 0x212223, navy: 0x1a2440, maroon: 0x4a1c1f, grey: 0x55585c, green: 0x1d3a2a });
export const KEKE_SEATS = Object.freeze({ black: 0x212223, brown: 0x4d3423, red: 0x6d1f1c, grey: 0x4a4c50 });
export const KEKE_FLOORS = Object.freeze({ dark: 0x4f5250, green: 0x44776a, red: 0x6a3a30 });

// Coach liveries: the lower body, the band and roof, and the lettering and stripes.
// Green over white is the livery the model was supplied in.
export const BUS_LIVERIES = Object.freeze([
  Object.freeze({ id: 'blue', name: 'Blue', paint: 0x1d4f9e, paint2: 0xf1f3f2, accent: 0x1d4f9e }),
  Object.freeze({ id: 'green', name: 'Green', paint: 0x16a542, paint2: 0xf1f3f2, accent: 0x16a542 }),
  Object.freeze({ id: 'red', name: 'Red', paint: 0xb3261e, paint2: 0xf1f3f2, accent: 0xb3261e }),
  Object.freeze({ id: 'white', name: 'White', paint: 0xeeeee8, paint2: 0xf4f4f0, accent: 0x1f2f6b }),
  Object.freeze({ id: 'yellow', name: 'Yellow', paint: 0xe7b40e, paint2: 0xf1f3f2, accent: 0x1c1d21 }),
  Object.freeze({ id: 'silver', name: 'Silver', paint: 0xaeb4ba, paint2: 0xdfe3e6, accent: 0x7a1f1c }),
  Object.freeze({ id: 'dark', name: 'Dark', paint: 0x20242c, paint2: 0xd9dcdf, accent: 0xc9a227 }),
]);
export const BUS_CABINS = Object.freeze({
  blue: Object.freeze({ seat: 0x26397f, curtain: 0x427bbd }),
  maroon: Object.freeze({ seat: 0x5c1f26, curtain: 0x9a5a52 }),
  grey: Object.freeze({ seat: 0x4a4f58, curtain: 0x8d949c }),
  green: Object.freeze({ seat: 0x1f4d36, curtain: 0x6c9a78 }),
});

// Coaches carry no maker's name or badge. The lettering and logos on the
// supplied model are left out when it is baked (tools/vehicles/bake.py); what
// a coach shows instead is its operator's name, which is invented below.

// Invented operators, routes and slogans. None is a real company.
export const BUS_OPERATORS = Object.freeze(['OSHIMILI LINE', 'WESTBANK COACHES', 'ASABA TRAVELLERS', 'RIVER ROAD MOTORS']);
export const BUS_ROUTES = Object.freeze(['ASABA · BENIN', 'ASABA · AGBOR', 'ASABA · WARRI', 'ASABA · UGHELLI']);
export const KEKE_SLOGANS = Object.freeze(["GOD'S TIME", 'NO FOOD FOR LAZY MAN', 'ONE DAY E GO BETTER', 'CHUKWU EBUKA', 'NO CONDITION IS PERMANENT', 'THANK GOD', 'SLOW AND STEADY', 'TRUST NO BODY']);
export const KEKE_EXTRAS = Object.freeze(['curtains']);
export const BUS_EXTRAS = Object.freeze(['flaps']);

const byId = (list, id, fallback) => list.find((e) => e.id === id) || list.find((e) => e.id === fallback);
const mix = (n, salt) => { let h = Math.imul(n + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca77); h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const pick = (list, n, salt) => list[Math.floor(mix(n, salt) * list.length)];

// The look of the nth keke. The same number always gives the same keke;
// neighbouring numbers differ in colour and front, so a rank is never a row of twins.
export function kekeLook(n) {
  const paint = KEKE_PAINTS[(n * 3) % KEKE_PAINTS.length].id;      // three steps along the list each time: every colour in turn, neighbours never alike
  const trim = VEHICLE_MODELS.keke.trims[(n + Math.floor(n / 3)) % 3];
  const wear = Math.round((0.08 + mix(n, 2) * 0.72) * 100) / 100;
  return {
    model: 'keke', trim, paint,
    canopy: mix(n, 3) < 0.62 ? 'black' : pick(Object.keys(KEKE_CANOPIES), n, 4),
    seat: mix(n, 5) < 0.6 ? 'black' : pick(Object.keys(KEKE_SEATS), n, 6),
    floor: trim === 'classic' ? 'green' : mix(n, 7) < 0.75 ? 'dark' : pick(Object.keys(KEKE_FLOORS), n, 8),
    wear, dirt: Math.round(Math.min(1, wear * 0.7 + mix(n, 9) * 0.5) * 100) / 100,
    slogan: mix(n, 10) < 0.7 ? pick(KEKE_SLOGANS, n, 11) : null,
    number: mix(n, 12) < 0.85 ? String(100 + Math.floor(mix(n, 13) * 800)) : null,
    extras: mix(n, 14) < 0.45 ? ['curtains'] : [],
  };
}

// The look of the nth coach.
export function busLook(n) {
  const livery = BUS_LIVERIES[n % BUS_LIVERIES.length].id;
  const wear = Math.round((0.05 + mix(n, 21) * 0.6) * 100) / 100;
  return {
    model: 'bus', trim: 'standard', livery,
    cabin: mix(n, 22) < 0.5 ? 'blue' : pick(Object.keys(BUS_CABINS), n, 23),
    wear, dirt: Math.round(Math.min(1, wear * 0.6 + mix(n, 24) * 0.5) * 100) / 100,
    operator: BUS_OPERATORS[n % BUS_OPERATORS.length],
    route: BUS_ROUTES[(n + Math.floor(n / BUS_ROUTES.length)) % BUS_ROUTES.length],
    number: String(11 + Math.floor(mix(n, 25) * 88)).padStart(2, '0'),
    // a paid advert along the side: { head, line, ground, ink }. Whose advert it is belongs to the town, not to this file.
    advert: null,
    extras: mix(n, 27) < 0.6 ? ['flaps'] : [],
  };
}

// A look with every choice checked and filled in, as colours and words the
// renderer can use. Anything unknown falls back to the supplied design.
export function resolveLook(look) {
  const model = look && VEHICLE_MODELS[look.model] ? look.model : 'keke';
  const wear = Math.max(0, Math.min(1, Number(look && look.wear) || 0));
  const dirt = Math.max(0, Math.min(1, Number(look && look.dirt) || 0));
  if (model === 'bus') {
    const livery = byId(BUS_LIVERIES, look.livery, 'green');
    const cabin = BUS_CABINS[look.cabin] || BUS_CABINS.blue;
    return {
      model, trim: 'standard', id: livery.id, name: `${livery.name} coach`, wear, dirt,
      colours: { paint: livery.paint, paint2: livery.paint2, accent: livery.accent, seat: cabin.seat, curtain: cabin.curtain },
      texts: { operator: look.operator || null, route: look.route || null, number: look.number || null, advert: look.advert && look.advert.head ? { head: String(look.advert.head), line: String(look.advert.line || ''), ground: look.advert.ground || 0xf3ecdc, ink: look.advert.ink || 0x7a1f1c } : null },
      extras: (look.extras || []).filter((e) => BUS_EXTRAS.includes(e)),
    };
  }
  const paint = byId(KEKE_PAINTS, look && look.paint, 'yellow');
  const trim = VEHICLE_MODELS.keke.trims.includes(look && look.trim) ? look.trim : 'modern';
  return {
    model, trim, id: paint.id, name: `${paint.name} keke`, wear, dirt,
    colours: { paint: paint.paint, canopy: KEKE_CANOPIES[look && look.canopy] || KEKE_CANOPIES.black, vinyl: KEKE_SEATS[look && look.seat] || KEKE_SEATS.black, floor: KEKE_FLOORS[look && look.floor] || KEKE_FLOORS.dark },
    texts: { slogan: (look && look.slogan) || null, number: (look && look.number) || null },
    extras: ((look && look.extras) || []).filter((e) => KEKE_EXTRAS.includes(e)),
  };
}

// The seven named colours of each design, as the brief lists them, for the vehicle yard.
export function variantSheet(model) {
  if (model === 'bus') return BUS_LIVERIES.map((l, i) => ({ name: `Coach ${String(i + 1).padStart(2, '0')}: ${l.name.toLowerCase()}`, look: { ...busLook(i), livery: l.id, advert: i % 3 === 2 ? { head: 'EASTBANK CEMENT', line: 'Strong walls start here', ground: 0x143a5c, ink: 0xf5c518 } : null } }));
  return KEKE_PAINTS.map((p, i) => ({ name: `Keke ${String(i + 1).padStart(2, '0')}: ${p.name.toLowerCase()}`, look: { ...kekeLook(i), paint: p.id } }));
}

// The box a parked vehicle presents to someone on foot: its footprint turned
// to its heading, as the smallest upright box that holds it.
export function footprintBox(model, x, z, heading) {
  const m = VEHICLE_MODELS[model] || VEHICLE_MODELS.keke;
  const c = Math.abs(Math.cos(heading)), s = Math.abs(Math.sin(heading));
  const hx = m.halfWidth * c + m.halfLength * s, hz = m.halfWidth * s + m.halfLength * c;
  return { x0: x - hx, x1: x + hx, z0: z - hz, z1: z + hz };
}
