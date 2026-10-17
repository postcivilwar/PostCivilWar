// How surfaces answer the sky (the realism pass, 17 October 2026):
//   - glass, the river and polished metal give back the sky by day: less under cloud, hardly at all at night;
//   - a corrugated zinc roof has the dull sheen of zinc;
//   - in the rain, and for a while after it, the ground is wet: tarmac, paving, roofs and walls darker, and tarmac and
//     roofs glossy, the tarmac giving back the sky as a wet road does; dried out slowly once the rain has stopped.
// Each of these is a material's settings changed now and then (`updateFinishes`), not anything more drawn. On a phone
// (`isLite`) surfaces are lit without gloss (render-kit.js, `surface`): there the wet is only darker.

import { isLite } from './render-kit.js';
import { vehicleEnvironment } from './vehicle-models.js';

const reflecting = new Map();     // material -> how strongly it gives back the sky, by full day
const wetting = new Map();        // material -> { colour, roughness, darken, gloss, sheen }
let envSet = false;
let wet = 0;

// `material` gives back the sky, `strength` times as much as a mirror would by full day.
export function reflects(material, strength = 1) {
  if (!material || isLite() || !material.isMeshStandardMaterial) return material;
  if (!reflecting.has(material)) material.addEventListener('dispose', () => reflecting.delete(material));
  reflecting.set(material, strength);
  given(material);
  return material;
}
// `material` is a surface out in the weather: wet, it is `darken` darker, `gloss` less rough, and (tarmac) gives back
// `sheen` of the sky.
export function weathers(material, { darken = 0.25, gloss = 0, sheen = 0 } = {}) {
  if (!material || wetting.has(material)) return material;
  wetting.set(material, { colour: material.color.clone(), roughness: material.roughness, darken, gloss, sheen: material.isMeshStandardMaterial && !isLite() ? sheen : 0 });
  material.addEventListener('dispose', () => wetting.delete(material));
  if (wetting.get(material).sheen) given(material);
  return material;
}
// (a material made after the sky was handed out, the outskirts' or a model's that came later: given it now)
function given(material) {
  const env = envSet ? vehicleEnvironment() : null;
  if (env && material.envMap !== env) { material.envMap = env; material.needsUpdate = true; }
}

// Each frame (or every few): `daylight` 0 at night to 1 by day, `wetness` how hard it is raining (0 to 1), `dull`
// how overcast the sky is (0 to 1).
export function updateFinishes(dt, { daylight = 1, wetness = 0, dull = 0 } = {}) {
  const env = vehicleEnvironment();
  if (!envSet && env) {
    // (given the sky once it has been made: render-world is built just after it, but a lab page may have none)
    for (const material of reflecting.keys()) { material.envMap = env; material.needsUpdate = true; }
    for (const [material, w] of wetting) if (w.sheen && !reflecting.has(material)) { material.envMap = env; material.needsUpdate = true; }
    envSet = true;
  }
  // the ground takes the rain at once and dries slowly after it
  wet += (wetness - wet) * Math.min(1, dt * (wetness > wet ? 0.6 : 0.012));
  const sky = Math.max(0.04, Math.min(1, daylight)) * (1 - 0.45 * dull);
  for (const [material, strength] of reflecting) material.envMapIntensity = strength * sky;
  for (const [material, w] of wetting) {
    material.color.copy(w.colour).multiplyScalar(1 - w.darken * wet);
    if (typeof w.roughness === 'number') material.roughness = Math.max(0.05, w.roughness - w.gloss * wet);
    if (w.sheen) material.envMapIntensity = (reflecting.get(material) || 0) * sky + w.sheen * wet * sky;
  }
  return wet;
}
// (the tests: how wet the ground is now, and what is registered)
export const finishState = () => ({ wet, reflecting: reflecting.size, weathering: wetting.size, envSet });
