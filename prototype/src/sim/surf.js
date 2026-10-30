// Surfing on the River Niger by the town (31 October 2026, stage 4 of the owner's brief of 30 October: "incorporate a
// realistic surf feature for certain characters in bikinis, and ensure heavy clothing users can't surf"; his answer at
// 22:01: "NOBODY SHould surf at the lagoon beach, only surf at the river by town").
//
// The waves: east of the jetty, where the river comes in against the town's bank, waves come in across the river in sets
// (three, then a lull), each first seen out on the water, building as it comes into the shallows, standing up and
// breaking a few metres off the bank, then running up it as foam. Every copy of the town has the same waves at the same
// moment (they follow the town's clock), so two players see the same wave and may ride it together.
//
// Who may surf: someone who owns a surfboard (bought at the sports mall) and is dressed for the water: the two who wear
// swimwear (Adanna in her bikini, Ujunwa in her swimsuit). Anyone else is told that they cannot surf in what they wear.
//
// How: out from the bank on the board, lying on it and paddling (`paddle`); turned to the bank and paddling as a wave
// comes up behind, up onto the feet as it lifts the board (`stand`, only then: too soon and it goes by, too late and it
// breaks on top of them); riding it in across its face, steered along it by leaning, as fast as the wave carries a board;
// off at the end in the foam, or off when it breaks over them (`wipe`), back to lying on the board.
export const SURF = Object.freeze({
  x0: 46, x1: 236,          // the stretch of the town's bank the waves come in on (east of the jetty)
  from: 183,                // where each is first seen, out on the river (grid z: the bank is about 150)
  speed: 3.2,               // m/s each comes in at, toward the bank
  every: 9,                 // seconds between the waves of a set
  set: 3,                   // waves in a set
  lull: 16,                 // seconds of quiet after a set
  high: 1.15,               // metres from trough to crest at its highest, as it stands up to break
  breaks: 7,                // metres off the bank it breaks
  run: 4,                   // metres up the bank its foam runs
  wide: 14,                 // metres from the back of a wave to its crest (its face is steeper, a third of that)
  paddle: 1.5,              // m/s lying on a board, paddling
  ride: 6.4,                // m/s at most across a wave's face (along it), riding
  catch: Object.freeze([0.9, 4.2]),   // metres behind the crest the board must be, with the wave lifting it, to stand up
  figures: Object.freeze(['W10', 'W11']),   // dressed for the water: the two in swimwear
});
const CYCLE = SURF.set * SURF.every + SURF.lull;
const TRAVEL = (SURF.from - 150 + SURF.run) / SURF.speed;    // seconds from first seen to its end on the bank
const shoreZ = (x) => 150 + 5 * Math.sin(x / 37) + 3 * Math.sin(x / 11 + 1);   // as zoneShoreZ (atani.js)

// May this player surf now? (the board theirs, the clothes for it)
export function maySurf(look, owns) {
  if (!owns) return { ok: false, code: 'NO_BOARD', message: 'You have no surfboard. The sports mall sells them.' };
  const figure = look && look.figure;
  if (!SURF.figures.includes(figure)) return { ok: false, code: 'CLOTHES', message: 'You cannot surf dressed like that: it takes swimwear. Adanna and Ujunwa can surf.' };
  return { ok: true };
}
export const inSurf = (x, z) => x > SURF.x0 && x < SURF.x1 && z > shoreZ(x) - SURF.run && z < SURF.from + 1;

// The waves on the water at time `t` (the town's clock, seconds): each one's crest (grid z: it runs along the bank, a
// little bent with it), how high it stands, and whether it has broken.
export function wavesAt(t) {
  const out = [];
  const cycle = Math.floor(t / CYCLE);
  for (let c = cycle - 2; c <= cycle; c += 1) {
    for (let k = 0; k < SURF.set; k += 1) {
      const born = c * CYCLE + k * SURF.every;
      const age = t - born;
      if (age < 0 || age > TRAVEL) continue;
      out.push({ id: c * SURF.set + k, age, z: SURF.from - SURF.speed * age, size: 0.8 + 0.2 * Math.sin(c * 2.3 + k * 1.7) ** 2 });
    }
  }
  return out;
}
// One wave where it is at a point along the bank: how far its crest is from the bank there, how high it stands, its
// state ('swell' out on the river, building; 'face' standing up to break; 'foam' broken, running in).
export function waveAt(w, x) {
  const toBank = w.z - shoreZ(x);
  const build = Math.max(0, Math.min(1, (SURF.from - w.z) / (SURF.from - 150 - SURF.breaks)));
  const state = toBank > SURF.breaks + 3 ? 'swell' : toBank > SURF.breaks ? 'face' : 'foam';
  const height = state === 'foam' ? SURF.high * w.size * Math.max(0, (toBank + SURF.run) / (SURF.breaks + SURF.run)) * 0.45 : SURF.high * w.size * (0.25 + 0.75 * build * build);
  return { toBank, height, state };
}
// How high the water stands at (x, z) at time t, over its level (metres): the waves' shapes (a gentle back, a steeper
// face toward the bank), only where they come in.
export function surfHeight(x, z, t) {
  if (!inSurf(x, z)) return 0;
  // (fading out at the ends of the stretch)
  const ends = Math.min(1, (x - SURF.x0) / 18, (SURF.x1 - x) / 18);
  let y = 0;
  for (const w of wavesAt(t)) {
    const at = waveAt(w, x);
    const d = z - (shoreZ(x) + at.toBank);      // + behind the crest (out on the river), - in front of it (toward the bank)
    if (d > SURF.wide || d < -SURF.wide / 3) continue;
    const shape = d >= 0 ? Math.cos((d / SURF.wide) * Math.PI / 2) ** 2 : Math.cos((-d / (SURF.wide / 3)) * Math.PI / 2) ** 2;
    y += at.height * shape;
  }
  return y * Math.max(0, ends);
}
// The wave a board at (x, z) could stand up on now, if any: one coming up behind it (toward the bank), its crest just
// behind the board, standing up or about to.
export function catchable(x, z, t) {
  if (!inSurf(x, z)) return null;
  for (const w of wavesAt(t)) {
    const at = waveAt(w, x);
    if (at.state === 'foam') continue;
    const behind = (shoreZ(x) + at.toBank) - z;      // the crest's distance behind the board (it is further out)
    if (behind >= SURF.catch[0] && behind <= SURF.catch[1] && at.height > 0.45) return { wave: w.id, behind, height: at.height };
  }
  return null;
}
// Where the crest of wave `id` is at x at time t (grid z), or null once it has gone.
export function crestOf(id, x, t) {
  for (const w of wavesAt(t)) if (w.id === id) return shoreZ(x) + waveAt(w, x).toBank;
  return null;
}
