// The graphics levels (23 October 2026, the owner's brief, its second stage): Low, Medium, High and Ultra, chosen in
// Settings or left to the game (Auto). Built on what was there: the device's kind (a phone or tablet draws the lighter
// way, render-kit.js `surface`, and fetches the lighter copies of every picture and model, budget.js) and the detail
// governor (monitor.js), whose four steps they now are. A level changes how the town is drawn, never what kind of copy
// the device fetches, so that no level can make a phone hold a computer's pictures; and it changes without reloading.
//
//   level 0 Ultra · 1 High · 2 Medium · 3 Low   (the governor's own order: 0 the most)
//
// The owner's words for each, and what the game does for them (LEVEL_SETTINGS below):
//   LOW (older phones): small textures (pictures at most 512 across), no real-time shadows (the soft patch under people
//     and vehicles), simple water (no ripples, no sky in it), a shorter view with fog.
//   MEDIUM (most phones): textures up to 1024, sun shadows nearby, simple reflections (the sky in glass and water), the
//     current realism (a phone as it was drawn before the levels).
//   HIGH (good phones, laptops): textures up to 2048, softer and further shadows, reflections on glass, water and wet roads.
//   ULTRA (gaming computers): everything at its best.

export const GRAPHICS_LEVELS = Object.freeze([
  Object.freeze({ id: 'ultra', name: 'Ultra', line: 'Everything at its best: the sharpest picture, the largest pictures, the most detail. For gaming computers.' }),
  Object.freeze({ id: 'high', name: 'High', line: 'Pictures up to 2048, softer shadows further out, reflections in glass, water and wet roads. For good phones, laptops.' }),
  Object.freeze({ id: 'medium', name: 'Medium', line: 'Pictures up to 1024, sun shadows nearby, simple reflections: the game as phones drew it. For most phones.' }),
  Object.freeze({ id: 'low', name: 'Low', line: 'Small pictures, no sun shadows, simple water, a shorter view: the smoothest and lightest. For older phones.' }),
]);
export const GRAPHICS_AUTO_LINE = 'Chooses the level for this device, and lowers it by itself if the game slows down.';
export const GRAPHICS_NOTE = 'Higher levels use more battery, and can make a phone warm.';
export const GRAPHICS_LOWERED = 'Graphics lowered to keep the game smooth';
// (one name to each export: the build gives the first name of an export only)
export const ULTRA = 0;
export const HIGH = 1;
export const MEDIUM = 2;
export const LOW = 3;

// What each level draws (by level, 0 Ultra to 3 Low). The rest (how far the town is drawn, how many figures move
// their limbs and how near, the grass and the garden plants, the showrooms' models) follows the device's own steps of
// detail (main.js, DETAIL_OF): a phone's are smaller at every level, and at their fullest from Medium up.
export const LEVEL_SETTINGS = Object.freeze({
  pixelRatio: [2, 1.5, 1.25, 1],                 // the most pixels drawn for each of the screen's (never more than it has)
  // the sun's shadow map, across (0: no sun shadows; the dark patch under each figure and vehicle stays), by the
  // device's kind: a phone's graphics card holds a 1024 map below Ultra (a 2048 one is 32 MB of its 150)
  shadowMap: Object.freeze({ full: [2048, 2048, 1024, 0], lite: [2048, 1024, 1024, 0] }),
  shadowReach: [62, 62, 40, 0],                  // metres from the player to the edge of the sun's shadows (they fade out there)
  // how soft their edge, in the map's texels (render-sky.js): softer from Medium up since stage 3 (r128's were 1.73 on a
  // computer and 1.2 on a phone)
  shadowSoft: [2.4, 2.0, 1.6, 1.2],
  // the light from the whole sky by the hour (sky-light.js: warm round a low sun, cool round the moon) in place of the
  // hemisphere light's two colours (stage 3)
  skyLight: [true, true, true, false],
  // the air (world-shading.js, stage 3 and the owner's extras): the clouds' shadows drifting over the land, the low
  // haze in the distance and the mirage on hot tarmac at midday (Medium and up); how far a far surface's gloss is spread
  // so that far metal and glass do not glitter (every level); puddles giving back the sky after rain (where wet roads
  // give back the sky: High and up)
  clouds: [1, 1, 1, 0],
  haze: [1, 1, 1, 0],
  mirage: [1, 1, 1, 0],
  glint: [0.32, 0.32, 0.32, 0.32],
  puddles: [1, 1, 0, 0],
  // a glow round what is brightest in the picture: the sun, its glints on glass and water, lamps and lit windows at night
  // (Medium and up; at High and Ultra wider), and the sun's flare at Ultra (screen-glow.js)
  glow: [1, 1, 0.85, 0],
  glowWide: [true, true, false, false],
  flare: [1, 0, 0, 0],
  // dust lifted behind vehicles on dirt and motes in the sun (dust.js), fireflies in the habitation at night
  // (fireflies.js), wet footprints and tyre marks after rain (wet-tracks.js): Medium and up
  dust: [1, 1, 1, 0],
  fireflies: [1, 1, 1, 0],
  wetTracks: [1, 1, 1, 0],
  // soft darkening where things meet: corners, the foot of a wall, under a car (ambient-occlusion.js: High and up)
  ao: [0.7, 0.6, 0, 0],
  // the river's waves and foam at its bank, and the town it gives back (High and up, river-water.js): the town drawn
  // upside down for it at half the screen's size at Ultra, a third at High (in the moving water a softer picture is not
  // missed, and it costs a ninth of the screen's pixels)
  waves: [1, 1, 0, 0],
  foam: [1, 1, 0, 0],
  mirror: [1, 1, 0, 0],
  mirrorSize: [0.5, 0.33, 0, 0],
  pictureMost: [0, 2048, 1024, 512],             // the most pixels across any picture (0: as the device fetches them)
  reflections: ['full', 'full', 'simple', 'none'], // the sky in glass, water, metal and wet roads; in glass and water; in none
  water: ['full', 'full', 'full', 'simple'],     // with its ripples; without (render-finish.js)
  view: [1, 1, 1, 0.75],                         // how far the air lets one see (the fog's distances), times this
});
// a level's setting for this device's kind
export const levelSetting = (key, level, lite = false) => { const s = LEVEL_SETTINGS[key]; return (Array.isArray(s) ? s : s[lite ? 'lite' : 'full'])[level]; };

// The level Auto starts at on a device not yet measured: a phone or tablet at Medium (as it was drawn before the levels),
// a computer at Ultra (likewise); Low where the graphics card is the browser's own software (no graphics card at all) or
// the phone is one Auto keeps at Low (below); a computer's integrated graphics at High. `remembered` (below) comes first.
export function autoStart({ lite, gpu = '', memory = null }) {
  const card = String(gpu).toLowerCase();
  if (/swiftshader|llvmpipe|software|softpipe|microsoft basic render/.test(card)) return LOW;
  if (lite) return lowPhone({ gpu, memory }) ? LOW : MEDIUM;
  if (/intel|uhd graphics|iris/.test(card) && !/arc/.test(card)) return HIGH;
  return ULTRA;
}
// A phone Auto keeps at Low, from the start and all the way (29 October 2026, the owner's brief: on his iPhone the game
// hung and then closed by itself): an iPhone or iPad (its graphics card is the "Apple GPU"; its browser closes a page that
// holds more memory than it allows, however fast the page draws, and each level is more pictures and bigger ones), and a
// phone that says it has less than 6 GB of memory (Chrome says so, in round numbers: 4 for a 6 GB phone). Medium is the
// player's to choose there in Settings.
export const lowPhone = ({ gpu = '', memory = null }) => /apple/i.test(String(gpu)) || (memory !== null && memory < 6);
// The highest level Auto climbs to by itself: on a phone, Medium (26 October 2026, the owner's brief: the game hung on
// his phones; "make it lighter on phones ... a lighter level chosen by Auto"). High draws the town a second time for the
// river's mirror, once more for the soft darkening, half as many pixels again and a wider glow: a phone fast enough at
// Medium climbed to it, ran hot at it, and fell back, over and over, each change seconds of work. High and Ultra are the
// player's to choose in Settings. On a phone Auto keeps at Low (above), Low. On a computer, Ultra.
export const autoCeiling = ({ lite, gpu = '', memory = null }) => (lite ? (lowPhone({ gpu, memory }) ? LOW : MEDIUM) : ULTRA);

// The level Auto settled at on this device last time, kept for the next start, by the graphics card's name (so a
// browser moved to another card, or a profile copied to another computer, starts afresh).
const KEY = 'pcw-graphics-auto';
export function remembered(storage, gpu) {
  try { const r = JSON.parse(storage.getItem(KEY) || 'null'); return r && r.gpu === String(gpu) && Number.isInteger(r.level) && r.level >= 0 && r.level <= 3 ? r.level : null; } catch (error) { return null; }
}
export function remember(storage, gpu, level) {
  try { storage.setItem(KEY, JSON.stringify({ gpu: String(gpu), level, at: Date.now() })); } catch (error) { /* not kept: measured again next time */ }
}

// The player's choice, as kept in the game's preferences: 'auto' or a level's id.
export function levelOf(choice) {
  const i = GRAPHICS_LEVELS.findIndex((l) => l.id === choice);
  return i >= 0 ? i : null;
}

// When the graphics card is nearly full, a level is given up whatever was chosen, so that the browser never takes the
// picture away: on a phone at nine tenths of its budget (budget.js: 150 MB); on a computer, whose card holds far more
// than its budget (700 MB, past which only what is kept ready is let go), at one and a half times it.
export const memoryLimitMB = (budgetMB, lite) => (lite ? budgetMB * 0.9 : budgetMB * 1.5);
