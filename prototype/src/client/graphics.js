// The graphics levels (23 October 2026, the owner's brief, its second stage): Low, Medium, High and Ultra, chosen in
// Settings or left to the game (Auto). Built on what was there: the device's kind (a phone or tablet draws the lighter
// way, render-kit.js `surface`, and fetches the lighter copies of every picture and model, budget.js) and the detail
// governor (monitor.js), whose four steps they now are. A level changes how the town is drawn, never what the device
// fetches, so that no level can make a phone hold a computer's pictures; and it changes without reloading.
//
//   level 0 Ultra · 1 High · 2 Medium · 3 Low   (the governor's own order: 0 the most)

export const GRAPHICS_LEVELS = Object.freeze([
  Object.freeze({ id: 'ultra', name: 'Ultra', line: 'The sharpest picture, the finest sun shadows, the longest view and the most detail.' }),
  Object.freeze({ id: 'high', name: 'High', line: 'A sharp picture with fine sun shadows and a long view.' }),
  Object.freeze({ id: 'medium', name: 'Medium', line: 'Sun shadows and a good view: as most phones have drawn the game until now.' }),
  Object.freeze({ id: 'low', name: 'Low', line: 'The smoothest and lightest: no sun shadows, less grass, a shorter view. Uses the least battery.' }),
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
  shadowMap: [2048, 2048, 1024, 0],              // the sun's shadow map, across; 0: no sun shadows (the dark patch under each figure stays)
  shadowSoft: [1.73, 1.73, 1.2, 1.2],            // how soft its edge, in its texels (render-sky.js)
});

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
