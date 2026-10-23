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
export const ULTRA = 0, HIGH = 1, MEDIUM = 2, LOW = 3;

// What each level draws (by level, 0 Ultra to 3 Low). The rest (how far the town is drawn, how many figures move
// their limbs and how near, the grass and the garden plants, the showrooms' models) follows the device's own steps of
// detail (main.js, DETAIL_OF): a phone's are smaller at every level, and at their fullest from Medium up.
export const LEVEL_SETTINGS = Object.freeze({
  pixelRatio: [2, 1.5, 1.25, 1],                 // the most pixels drawn for each of the screen's (never more than it has)
  // the sun's shadow map, across (0: no sun shadows; the dark patch under each figure and vehicle stays), by the
  // device's kind: a phone's graphics card holds a 1024 map below Ultra (a 2048 one is 32 MB of its 150)
  shadowMap: Object.freeze({ full: [2048, 2048, 1024, 0], lite: [2048, 1024, 1024, 0] }),
  shadowReach: [62, 62, 40, 0],                  // metres from the player to the edge of the sun's shadows (they fade out there)
  shadowSoft: [1.73, 1.73, 1.2, 1.2],            // how soft their edge, in the map's texels (render-sky.js)
  pictureMost: [0, 2048, 1024, 512],             // the most pixels across any picture (0: as the device fetches them)
  reflections: ['full', 'full', 'simple', 'none'], // the sky in glass, water, metal and wet roads; in glass and water; in none
  water: ['full', 'full', 'full', 'simple'],     // with its ripples; without (render-finish.js)
  view: [1, 1, 1, 0.75],                         // how far the air lets one see (the fog's distances), times this
});
// a level's setting for this device's kind
export const levelSetting = (key, level, lite = false) => { const s = LEVEL_SETTINGS[key]; return (Array.isArray(s) ? s : s[lite ? 'lite' : 'full'])[level]; };

// The level Auto starts at on a device not yet measured: a phone or tablet at Medium (as it was drawn before the levels),
// a computer at Ultra (likewise); Low where the graphics card is the browser's own software (no graphics card at all) or
// the phone says it has little memory; a computer's integrated graphics at High. `remembered` (below) comes first.
export function autoStart({ lite, gpu = '', memory = null }) {
  const card = String(gpu).toLowerCase();
  if (/swiftshader|llvmpipe|software|softpipe|microsoft basic render/.test(card)) return LOW;
  if (lite) return memory !== null && memory <= 2 ? LOW : MEDIUM;
  if (/intel|uhd graphics|iris/.test(card) && !/arc/.test(card)) return HIGH;
  return ULTRA;
}
// The highest level Auto climbs to by itself: on a phone, High (Ultra only by the player's choice: a phone's screen has
// so many pixels that drawing every one of them is rarely worth its battery).
export const autoCeiling = ({ lite }) => (lite ? HIGH : ULTRA);

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
