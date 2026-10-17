// The owner's buildings of 17 October 2026 in town: the ten of 03:09 and the new ones of 03:14 (the 03:14 copies of
// the four towers already at the car showroom are the same files, and stand there only).
//
//   - The commonest houses, the plain ones of the quarters (atani-town.js), are each replaced by one of the owner's
//     houses, villas and small blocks: the same plot, the same door to the same lane, the same people living there.
//   - The towers stand on the city side: at the inner ends of Umuezei and Umuonaje, the two quarters either side of
//     the city block, in place of the houses there (whose people now live in them, their doors at the tower's), and
//     on open ground beside the city: north of Registry Road along Market Road, and by the police post.
//
// Each is the supplied model exactly as it is, drawn at one uniform scale (render-town-buildings.js); nothing in its
// file is changed. `front` is the way the side it shows the street faces in its own file (radians from +z toward
// +x; most were modelled square, some turned); `across`, `deep` and `high` are its size turned that way, in the
// file's own units, and `mid` the middle of its foot (tools/buildings/measure.py measured them). The hotel's file
// carries another company's name on its facade: it is painted over in the page (`brand`), as the car showroom's are.
//
// This file is content, read by the simulation (where each stands and what is in the way) and by the drawing.

const deg = (d) => (d * Math.PI) / 180;
const box = (x0, z0, x1, z1) => Object.freeze({ x0, z0, x1, z1 });

const model = (id, name, source, frontDeg, across, deep, high, mid, triangles, kind, more = {}) => Object.freeze({ id, name, file: `town-${id}.glb`, source, front: deg(frontDeg), across, deep, high, mid: Object.freeze(mid), triangles, kind, ...more });
export const TOWN_MODELS = Object.freeze({
  // the houses (03:09)
  'curved-house': model('curved-house', 'Curved house', 'curvedmodernhouse3dmodel.glb', 0, 0.9116, 0.9995, 0.3843, [0, 0], 9575, 'house'),
  'glass-house': model('glass-house', 'Curved glass house', 'curvedglassbuilding3dmodel.glb', 90, 0.9995, 0.6509, 0.397, [0, 0], 9750, 'house'),
  'white-house': model('white-house', 'White house', 'modernhouse3dmodel.glb', 90, 0.9995, 0.9897, 0.8228, [0, 0], 8647, 'house'),
  'villa': model('villa', 'Villa', 'modernvilla3dmodel.glb', -30.5, 0.8086, 0.7217, 0.3442, [-0.0217, 0.0087], 8676, 'house'),
  'grey-villa': model('grey-villa', 'Grey villa', 'modernvilla3dmodel_1.glb', 0, 0.9995, 0.9893, 0.3901, [0, 0], 8947, 'house'),
  'spiral-house': model('spiral-house', 'Spiral house', 'futuristicarchitecture3dmodel.glb', 180, 0.9995, 0.9097, 0.3179, [0, 0], 7691, 'house'),
  'pod-house': model('pod-house', 'Pod house', 'futuristicbuilding3dmodel.glb', 0, 0.9761, 0.9507, 0.9995, [0, 0], 10158, 'house'),
  'white-block': model('white-block', 'White block', 'futuristicbuilding3dmodel_1.glb', 11.5, 1.0175, 0.8237, 0.4946, [-0.0619, -0.0376], 9786, 'house'),
  // the towers (two of 03:09, the rest of 03:14)
  'purple-tower': model('purple-tower', 'Purple tower', 'futuristictower3dmodel.glb', 0, 0.3853, 0.6284, 0.9995, [0, 0], 9810, 'tower'),
  'purple-twin': model('purple-twin', 'Purple tower', 'futuristic_tower_3d_model.glb', 0, 0.6284, 0.3853, 0.9995, [0, 0], 9810, 'tower'),
  'black-tower': model('black-tower', 'Black tower', 'futuristicspeaker3dmodel.glb', 0, 0.6577, 0.7495, 0.98, [0, 0], 9512, 'tower'),
  'glass-offices': model('glass-offices', 'Glass offices', 'modern_glass_building_3d_model.glb', 0, 0.8931, 0.9995, 0.9985, [0, 0], 8754, 'tower'),
  'tower-group': model('tower-group', 'Five towers', 'modern_skyscraper_3d_model.glb', 0, 0.7856, 0.771, 0.9995, [0, 0], 7985, 'tower'),
  'copper-tower': model('copper-tower', 'Copper tower', 'modern_skyscraper_3d_model_2.glb', 21.5, 0.4687, 0.706, 0.9995, [-0.0061, 0.0091], 9115, 'tower'),
  'office-tower': model('office-tower', 'Office tower', 'modern_skyscraper_3d_model_3.glb', 0, 0.397, 0.4878, 0.9995, [0, 0], 8783, 'tower'),
  'pink-tower': model('pink-tower', 'Pink tower', 'pink_angular_building_3d_model.glb', -27.5, 0.4247, 0.4886, 0.9995, [-0.0142, 0.0402], 9539, 'tower'),
  'stacked-tower': model('stacked-tower', 'Stacked tower', 'modern_stacked_building_3d_model.glb', 0, 0.313, 0.3521, 0.9995, [0, 0], 8137, 'tower'),
  // (its facade carried another company's name in three places in its picture: painted over with the facade beside it)
  'hotel': model('hotel', 'Hotel', 'luxury_hotel_3d_model.glb', 90, 0.9995, 0.6011, 0.9087, [0, 0], 9153, 'tower', {
    brand: Object.freeze([
      Object.freeze({ at: [0.3864, 0.3485, 0.4291, 0.4187], from: [0.3436, 0.3485] }),
      Object.freeze({ at: [0.5725, 0.7104, 0.6311, 0.7477], from: [0.5725, 0.7507] }),
      Object.freeze({ at: [0.6812, 0.9436, 0.7532, 0.9814], from: [0.6812, 0.9033] }),
    ]),
  }),
  'curved-tower': model('curved-tower', 'Curved tower', 'futuristic_curved_skyscraper_3d_model.glb', -35.5, 0.4226, 0.2919, 0.9995, [-0.0203, 0.0127], 9406, 'tower'),
});

// How a model stands at a heading (0: its front to +z): its size along x and along z for one unit of scale.
export function footOf(m, heading) {
  const side = Math.abs(Math.sin(heading)) > 0.5;
  return side ? { x: m.deep, z: m.across } : { x: m.across, z: m.deep };
}
// The scale at which it fills as much of a plot as it can, whole, its proportions kept, and its footprint there.
export function fitIn(m, heading, w, d, most = Infinity) {
  const f = footOf(m, heading);
  const k = Math.min(w / f.x, d / f.z, most / m.high);
  return { k, w: f.x * k, d: f.z * k, h: m.high * k };
}
// The side of a footprint its front is on (the door side, as layout.js names it), from its heading.
export const doorSide = (heading) => {
  const s = Math.round(Math.sin(heading)), c = Math.round(Math.cos(heading));
  return c === 1 ? 's' : c === -1 ? 'n' : s === 1 ? 'e' : 'w';
};

// ---------------------------------------------------------------------------------------------- the towers --
// Each on its site (a box of ground clear of every road, wall and building), as tall as the site lets it stand
// whole: across the front of the site and back from it. The plain houses it takes the place of are listed, by the
// place they stood (atani-town.js keeps their ids: their people live in the tower).
const site = (id, modelId, x0, z0, x1, z1, heading, houses = []) => {
  const m = TOWN_MODELS[modelId];
  const fit = fitIn(m, heading, x1 - x0, z1 - z0);
  return Object.freeze({ id, model: modelId, name: m.name, x: (x0 + x1) / 2, z: (z0 + z1) / 2, heading, k: fit.k, w: fit.w, d: fit.d, h: fit.h, door: doorSide(heading), site: box(x0, z0, x1, z1), houses: Object.freeze(houses.map(([x, z]) => Object.freeze({ x, z }))) });
};
export const TOWN_TOWERS = Object.freeze([
  // Umuezei, the west quarter: at its inner end, by the lane down to Waterside Road
  site('umuezei-purple', 'purple-tower', -114, 70, -89, 104, 0, [[-95, 76], [-110, 76], [-105, 96]]),
  site('umuezei-black', 'black-tower', -116, 28, -89, 64, 0, [[-95, 58], [-110, 58]]),
  site('umuezei-stacked', 'stacked-tower', -146, 50, -119, 64, 0, [[-125, 58], [-140, 58]]),
  site('umuezei-pink', 'pink-tower', -146, 70, -119, 86, Math.PI / 2, [[-125, 76], [-140, 76]]),
  // Umuonaje, the east quarter: the purple tower's twin across the city
  site('umuonaje-purple', 'purple-twin', 89, 70, 114, 104, -Math.PI / 2, [[95, 76], [110, 76], [105, 96]]),
  site('umuonaje-curved', 'curved-tower', 89, 50, 116, 64, 0, [[95, 58], [110, 58]]),
  site('umuonaje-office', 'office-tower', 119, 50, 146, 64, -Math.PI / 2, [[125, 58], [140, 58]]),
  site('umuonaje-copper', 'copper-tower', 119, 70, 146, 86, -Math.PI / 2, [[125, 76], [140, 76]]),
  // beside the city: north of Registry Road either side of Market Road, and by the police post
  site('registry-towers', 'tower-group', 32, -136, 83, -84, 0),
  site('market-hotel', 'hotel', -62, -136, -32, -82, Math.PI / 2),
  site('police-offices', 'glass-offices', -82, -30, -63, -2, Math.PI),
]);
export const TOWER_COLLIDERS = Object.freeze(TOWN_TOWERS.map((t) => box(t.x - t.w / 2, t.z - t.d / 2, t.x + t.w / 2, t.z + t.d / 2)));

// ---------------------------------------------------------------------------------------------- the houses --
// The owner's houses, in turn along each row so that no two neighbours are alike, each on the plot of the plain
// house it replaces: 12 m across and 12 m back at most (the plots are 15 m apart along their lanes), facing the
// lane the old one faced.
export const HOUSE_MODELS = Object.freeze(['curved-house', 'white-house', 'villa', 'glass-house', 'grey-villa', 'white-block', 'spiral-house', 'pod-house']);
export const HOUSE_PLOT = 12;
export function houseModelFor(n) { return HOUSE_MODELS[(n * 5) % HOUSE_MODELS.length]; }
