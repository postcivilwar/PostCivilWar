// Advertising billboards: the kinds there are, what each is made of, its sizes, its category and what a day on it
// costs. National content: which town has which billboards, and where, is the town's (zones/*-billboards.js).
//
// The kinds are modelled on the owner's photographs (assets/billboards/reference/, 13 October 2026): the first
// seven static designs (a01 to a07), six more static designs and five digital television billboards (b01 to b11;
// b06 is the same photograph as b04). Each is built in 3D by src/client/render-billboards.js from the parts named
// here: its poles or legs, side truss, platform and railing, ladder and lamps, and the face itself.
//
// A billboard's face is in a billboard's own frame: it faces +z, its width along x, its lower edge `bottom` metres
// above the ground; its supports stand behind it. Every size below is the face's, in metres. A placement may use a
// type at a smaller `scale` (all of it, supports and all, made smaller together), which is how small and medium
// boards are made from the same designs.

// What a day costs, in whole TR: the advertising fee and the in-game advertising tax (the owner's schedule,
// 13 October 2026: 1 TR is taken as $0.015 for working it out; the tax doubles from one category to the next).
export const AD_CATEGORIES = Object.freeze({
  small: Object.freeze({ id: 'small', name: 'Small', fee: 66, tax: 4 }),
  medium: Object.freeze({ id: 'medium', name: 'Medium', fee: 132, tax: 8 }),
  large: Object.freeze({ id: 'large', name: 'Large', fee: 200, tax: 16 }),
  xl: Object.freeze({ id: 'xl', name: 'Extra-large', fee: 267, tax: 32 }),
  tv: Object.freeze({ id: 'tv', name: 'Digital TV billboard', fee: 667, tax: 64 }),
});
export const dailyCharge = (category) => AD_CATEGORIES[category].fee + AD_CATEGORIES[category].tax;

// A static face's category, from its area (m²); a digital screen is always 'tv'.
export function categoryOf(width, height, tv = false) {
  if (tv) return 'tv';
  const area = width * height;
  return area < 12 ? 'small' : area < 36 ? 'medium' : area < 80 ? 'large' : 'xl';
}

// The lengths a campaign can be bought for. A week is 7 days and a month is 30, always: the billable days are
// these numbers and nothing else, on the phone, on the server and on the record.
export const AD_DURATIONS = Object.freeze([
  Object.freeze({ id: '1w', label: '1 week', days: 7 }),
  Object.freeze({ id: '2w', label: '2 weeks', days: 14 }),
  Object.freeze({ id: '1m', label: '1 month (30 days)', days: 30 }),
  Object.freeze({ id: '2m', label: '2 months (60 days)', days: 60 }),
  Object.freeze({ id: '3m', label: '3 months (90 days)', days: 90 }),
  Object.freeze({ id: '6m', label: '6 months (180 days)', days: 180 }),
]);

// Colours of the steel: dark painted steel, galvanised steel, white-painted, and the yellow of scaffold legs.
const DARK = Object.freeze({ steel: 0x3b3f45, deep: 0x26292e, pole: 0x34383d, rail: 0x50555b, lamp: 0x2a2d31 });
const GALV = Object.freeze({ steel: 0x9aa0a6, deep: 0x7d838a, pole: 0xa8adb2, rail: 0xb3b8bd, lamp: 0x5d6268 });
const WHITE = Object.freeze({ steel: 0x9aa0a6, deep: 0x6f757c, pole: 0xd9dcdc, rail: 0xb3b8bd, lamp: 0xd0d3d4 });

const kind = (id, name, ref, spec) => Object.freeze({ id, name, ref, ...spec });

// supports:    'pole' (one round pole), 'twin' (two), 'four' (four raked legs), 'trestle' (pairs of yellow scaffold
//              legs all along), 'tower', 'building', 'mast', 'plinth' (the digital kinds' own)
// truss:       which side of the face a vertical lattice stands on ('left', 'right' or none)
// deck:        a platform under the face: 'grating', 'railing' (with a handrail in front), 'double' (two decks)
// lamps:       how many floodlights, and where: 'top' (on arms over the face) or 'deck' (on the platform, aimed up)
// ladder:      'cage' (with hoops), 'rungs' (pegs up the pole), or none
// scales:      the sizes a placement may use this kind at, as fractions of the full size
export const BILLBOARD_TYPES = Object.freeze({
  // the first seven photographs
  'dark-unipole-truss': kind('dark-unipole-truss', 'Unipole with side truss', 'a02', { width: 12, height: 4, bottom: 9, supports: 'pole', poleRadius: 0.55, truss: 'left', deck: 'grating', lamps: 6, lampsAt: 'top', ladder: null, colours: DARK, scales: [1, 0.75, 0.6, 0.5, 0.4] }),
  'dark-unipole-catwalk': kind('dark-unipole-catwalk', 'Unipole with catwalk and cage ladder', 'a03', { width: 12, height: 4, bottom: 9, supports: 'pole', poleRadius: 0.55, truss: 'right', deck: 'railing', lamps: 6, lampsAt: 'deck', ladder: 'cage', colours: DARK, scales: [1, 0.75, 0.6, 0.5, 0.4] }),
  'dark-unipole-deep': kind('dark-unipole-deep', 'Unipole with deep platform', 'a04', { width: 12, height: 4.5, bottom: 9, supports: 'pole', poleRadius: 0.6, truss: 'left', deck: 'grating', deepDeck: true, lamps: 5, lampsAt: 'top', ladder: null, colours: DARK, scales: [1, 0.75, 0.6, 0.5] }),
  'galvanised-four-leg': kind('galvanised-four-leg', 'Four-legged galvanised frame', 'a05', { width: 12, height: 4.5, bottom: 7, supports: 'four', poleRadius: 0.32, truss: 'left', deck: 'grating', lamps: 0, lampsAt: null, ladder: null, colours: GALV, scales: [1, 0.75] }),
  'galvanised-unipole-railing': kind('galvanised-unipole-railing', 'Galvanised unipole with railed catwalk', 'a06', { width: 12, height: 4, bottom: 9, supports: 'pole', poleRadius: 0.55, truss: 'left', deck: 'railing', lamps: 6, lampsAt: 'top', ladder: 'cage', colours: GALV, scales: [1, 0.75, 0.6, 0.5, 0.4] }),
  'galvanised-unipole-deck-lamps': kind('galvanised-unipole-deck-lamps', 'Galvanised unipole, lamps on the catwalk', 'a07', { width: 12, height: 4.5, bottom: 9, supports: 'pole', poleRadius: 0.6, truss: 'left', deck: 'railing', lamps: 6, lampsAt: 'deck', ladder: 'cage', colours: GALV, scales: [1, 0.75, 0.6, 0.5] }),
  'yellow-trestle': kind('yellow-trestle', 'Long board on yellow scaffold legs', 'a01', { width: 30, height: 6, bottom: 7, supports: 'trestle', poleRadius: 0.12, truss: 'left', deck: 'grating', lamps: 13, lampsAt: 'top', ladder: null, colours: DARK, scales: [1, 0.8] }),
  // the second set
  'front-unipole-ladder': kind('front-unipole-ladder', 'Unipole with railed catwalk and ladder', 'b03', { width: 14, height: 5, bottom: 10, supports: 'pole', poleRadius: 0.65, truss: null, deck: 'railing', lamps: 5, lampsAt: 'top', ladder: 'rungs', colours: DARK, scales: [1, 0.75, 0.6, 0.5, 0.4] }),
  'offset-white-unipole': kind('offset-white-unipole', 'Offset white unipole with double deck', 'b04', { width: 14, height: 4, bottom: 9, supports: 'pole', poleRadius: 0.55, poleOffset: 0.3, truss: 'right', deck: 'double', lamps: 2, lampsAt: 'deck', lightBar: true, ladder: 'rungs', colours: WHITE, scales: [1, 0.75, 0.6, 0.5] }),
  'dark-unipole-deck-lamps': kind('dark-unipole-deck-lamps', 'Unipole with lamps along its deck', 'b05', { width: 14, height: 5, bottom: 9, supports: 'pole', poleRadius: 0.55, truss: 'right', deck: 'grating', lamps: 7, lampsAt: 'deck', ladder: 'rungs', colours: DARK, scales: [1, 0.75, 0.6, 0.5, 0.4] }),
  'twin-pole-railing': kind('twin-pole-railing', 'Twin-pole board with railed catwalk', 'b07', { width: 16, height: 5.5, bottom: 9, supports: 'twin', poleRadius: 0.55, truss: 'left', deck: 'railing', lamps: 6, lampsAt: 'top', ladder: null, colours: DARK, scales: [1, 0.85] }),
  'twin-pole-long': kind('twin-pole-long', 'Long twin-pole board', 'b09', { width: 22, height: 5.5, bottom: 9, supports: 'twin', poleRadius: 0.6, truss: 'left', deck: 'grating', underTruss: true, lamps: 9, lampsAt: 'top', ladder: null, colours: DARK, scales: [1, 0.85] }),
  // the digital television billboards
  'tv-unipole': kind('tv-unipole', 'Digital screen on a unipole', 'b01', { width: 8, height: 10, bottom: 10, supports: 'pole', poleRadius: 0.7, truss: 'left', deck: 'railing', lamps: 5, lampsAt: 'top', ladder: null, colours: DARK, tv: true, scales: [1] }),
  'tv-building': kind('tv-building', 'Building wrapped in digital screens', 'b02', { width: 24, height: 9, bottom: 8, supports: 'building', poleRadius: 0, truss: null, deck: null, lamps: 0, lampsAt: null, ladder: null, colours: DARK, tv: true, footprint: Object.freeze({ w: 34, d: 22 }), scales: [1] }),
  'tv-tower': kind('tv-tower', 'Four-sided digital screen tower', 'b08', { width: 6, height: 8, bottom: 4.5, supports: 'tower', poleRadius: 0, truss: null, deck: null, lamps: 12, lampsAt: 'top', ladder: null, colours: DARK, tv: true, sides: 4, footprint: Object.freeze({ w: 8, d: 8 }), scales: [1] }),
  'tv-curved': kind('tv-curved', 'Curved digital screen on a mast', 'b10', { width: 9, height: 10, bottom: 6, supports: 'mast', poleRadius: 0.3, truss: null, deck: 'grating', lamps: 6, lampsAt: 'deck', ladder: null, colours: DARK, tv: true, curve: 0.5, scales: [1] }),
  'tv-chrome': kind('tv-chrome', 'Chrome-framed digital screen', 'b11', { width: 12, height: 4, bottom: 5, supports: 'plinth', poleRadius: 0, truss: null, deck: null, lamps: 0, lampsAt: null, ladder: null, colours: WHITE, tv: true, footprint: Object.freeze({ w: 11, d: 2.6 }), scales: [1] }),
});

// The support points of a billboard at a scale, in its own frame: where its poles, legs or walls meet the ground,
// each { x, z, r } (a round foot of radius r) or { x, z, w, d } (a footprint). What the town keeps clear and what
// stops someone walking through it.
export function feetOf(type, scale = 1) {
  const t = BILLBOARD_TYPES[type], W = t.width * scale, s = scale, back = -0.9 * s;
  switch (t.supports) {
    case 'pole': return [{ x: (t.poleOffset || 0) * W, z: back - 0.3 * s, r: t.poleRadius * s }];
    case 'twin': return [-0.32, 0.32].map((k) => ({ x: k * W, z: back - 0.3 * s, r: t.poleRadius * s }));
    case 'four': return [-0.36, -0.12, 0.12, 0.36].map((k, i) => ({ x: k * W, z: back - (i % 2 ? 1.6 : 0.4) * s, r: 0.35 * s }));
    case 'trestle': { const out = []; for (let x = -W / 2 + 1; x <= W / 2 - 0.9; x += 3 * s) for (const z of [back, back - 1.8 * s]) out.push({ x, z, r: 0.2 * s }); return out; }
    case 'mast': return [{ x: W / 2 + 0.8 * s, z: back, r: 0.6 * s }];
    case 'tower': case 'building': case 'plinth': return [{ x: 0, z: -t.footprint.d / 2 + 0.6, w: t.footprint.w, d: t.footprint.d }];
    default: return [];
  }
}

// The face's size at a scale, to a tenth of a metre, and its lower edge.
export function faceOf(type, scale = 1) {
  const t = BILLBOARD_TYPES[type];
  const r = (v) => Math.round(v * 10) / 10;
  return { width: r(t.width * scale), height: r(t.height * scale), bottom: r(t.bottom * scale) };
}

// The width to height of a face, as a player is asked for it ("3:1", "4:5"), from its size.
export function aspectOf(width, height) {
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const a = Math.round(width * 10), b = Math.round(height * 10), g = gcd(a, b);
  const x = a / g, y = b / g;
  if (x <= 20 && y <= 20) return `${x}:${y}`;
  return `${(width / height).toFixed(2)}:1`;
}

// What an empty face says.
export const EMPTY_FACE = 'PLACE YOUR ADS';
