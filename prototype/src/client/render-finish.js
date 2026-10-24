// How surfaces answer the sky (the realism pass, 17 October 2026):
//   - glass, the river and polished metal give back the sky by day: less under cloud, hardly at all at night;
//   - a corrugated zinc roof has the dull sheen of zinc;
//   - in the rain, and for a while after it, the ground is wet: tarmac, paving, roofs and walls darker, and tarmac and
//     roofs glossy, the tarmac giving back the sky as a wet road does; dried out slowly once the rain has stopped.
// Each of these is a material's settings changed now and then (`updateFinishes`), not anything more drawn.
//
// How much of it is drawn is the graphics level's (graphics.js, 23 October 2026): `setReflections('full')` the sky in
// glass, water, metal and wet roads (High and Ultra); 'simple' in glass and water only (Medium); 'none' (Low); and
// `setWater('simple')` the waters without their ripples (Low). On a phone, whose buildings and roads are lit without gloss
// (render-kit.js, `surface`), glass and water are given the sky as on a computer, and a wet road gives it back mixed into
// its own colour, from a small picture of the same sky (a cube, which such a surface can read). Until the level is set, as
// before the levels: a computer everything, a phone nothing.

import { isLite } from './render-kit.js';
import { vehicleEnvironment, skyCubeEnvironment } from './vehicle-models.js';

const reflecting = new Map();     // material -> { strength (how strongly it gives back the sky, by full day), kind }
const wetting = new Map();        // material -> { colour, roughness, darken, gloss, sheen, standard, lambert }
const ripples = new Map();        // a water's ripples (its normal map), kept while simple water goes without them
const KINDS = Object.freeze({ full: new Set(['glass', 'water', 'metal']), simple: new Set(['glass', 'water']), none: new Set() });
let reflectMode = isLite() ? 'none' : 'full';
let waterMode = 'full';
let envSet = false;
let wet = 0;

// `material` gives back the sky, `strength` times as much as a mirror would by full day. `kind`: 'glass', 'water' (its
// ripples taken off for simple water) or 'metal' (only at the levels with full reflections).
export function reflects(material, strength = 1, kind = 'glass') {
  if (!material || !material.isMeshStandardMaterial) return material;
  if (!reflecting.has(material)) material.addEventListener('dispose', () => { reflecting.delete(material); ripples.delete(material); });
  reflecting.set(material, { strength, kind });
  if (kind === 'water' && material.normalMap && !ripples.has(material)) ripples.set(material, material.normalMap);
  settle(material);
  return material;
}
// `material` is a surface out in the weather: wet, it is `darken` darker, `gloss` less rough, and (tarmac) gives back
// `sheen` of the sky.
export function weathers(material, { darken = 0.25, gloss = 0, sheen = 0 } = {}) {
  if (!material || wetting.has(material)) return material;
  wetting.set(material, { colour: material.color.clone(), roughness: material.roughness, darken, gloss, sheen, standard: !!material.isMeshStandardMaterial, lambert: !!material.isMeshLambertMaterial });
  material.addEventListener('dispose', () => wetting.delete(material));
  settle(material);
  return material;
}

// What `material` gives back now, by the level and whether the sky has been made yet: the sky set on it or taken off it,
// and a water's ripples. (A change of either makes the renderer prepare the material afresh, once.)
function settle(material) {
  const r = reflecting.get(material), w = wetting.get(material);
  if (r && ripples.has(material)) {
    const want = waterMode === 'full' ? ripples.get(material) : null;
    if (material.normalMap !== want) { material.normalMap = want; material.needsUpdate = true; }
  }
  // (until the sky has been made, a material keeps whatever it was made with)
  if (!envSet) return;
  let env = null;
  if (r && KINDS[reflectMode].has(r.kind)) env = vehicleEnvironment();
  else if (w && w.sheen && reflectMode === 'full') env = w.standard ? vehicleEnvironment() : w.lambert ? skyCubeEnvironment() : null;
  if (material.envMap !== env) {
    material.envMap = env;
    // (a surface lit without gloss: the sky mixed into its own colour, none of it until it is wet)
    if (env && w && w.lambert) { material.combine = THREE.MixOperation; material.reflectivity = 0; }
    material.needsUpdate = true;
  }
}
const everything = () => new Set([...reflecting.keys(), ...wetting.keys()]);

// The graphics level's: 'full', 'simple' or 'none'; and the waters 'full' or 'simple'.
export function setReflections(mode) {
  if (!KINDS[mode] || mode === reflectMode) return;
  reflectMode = mode;
  for (const material of everything()) settle(material);
}
export function setWater(mode) {
  if ((mode !== 'full' && mode !== 'simple') || mode === waterMode) return;
  waterMode = mode;
  for (const material of reflecting.keys()) settle(material);
}

// Each frame (or every few): `daylight` 0 at night to 1 by day, `wetness` how hard it is raining (0 to 1: the town's
// rain is 0.6, a storm 1), `dull` how overcast the sky is (0 to 1).
export function updateFinishes(dt, { daylight = 1, wetness = 0, dull = 0 } = {}) {
  if (!envSet && vehicleEnvironment()) {
    // (given the sky once it has been made: render-world is built just after it, but a lab page may have none)
    envSet = true;
    for (const material of everything()) settle(material);
  }
  // the ground is soon wet through in any rain (the harder it rains, the sooner), and dries slowly after it
  const raining = wetness > 0.05;
  wet += ((raining ? 1 : 0) - wet) * Math.min(1, dt * (raining ? 0.1 + wetness : 0.012));
  const sky = Math.max(0.04, Math.min(1, daylight)) * (1 - 0.45 * dull);
  for (const [material, r] of reflecting) material.envMapIntensity = r.strength * sky;
  for (const [material, w] of wetting) {
    material.color.copy(w.colour).multiplyScalar(1 - w.darken * wet);
    if (typeof w.roughness === 'number') material.roughness = Math.max(0.05, w.roughness - w.gloss * wet);
    if (w.sheen && material.envMap) {
      if (w.standard) material.envMapIntensity = ((reflecting.get(material) || {}).strength || 0) * sky + w.sheen * wet * sky;
      else material.reflectivity = Math.min(0.45, w.sheen * wet * sky * 0.35);
    }
  }
  return wet;
}
// (the tests: how wet the ground is now, what is registered, and what the level lets it give back)
export const finishState = () => ({ wet, reflecting: reflecting.size, weathering: wetting.size, envSet, reflections: reflectMode, water: waterMode, withSky: [...everything()].filter((m) => m.envMap).length, rippling: [...ripples.keys()].filter((m) => m.normalMap).length, waters: ripples.size });
