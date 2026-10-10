// The owner's supplied figures, as the simulation knows them: which exist, whose they are (a man's or a
// woman's), the name each starts with, and which parts of each can be given a colour. The shapes themselves
// are baked by tools/characters/figures.py into the client's figure-data.js; a test holds the two together.
//
// A player's look names one of these and six colours. The simulation checks both: a figure that is not
// here, or a colour that is not a colour, is not accepted from a client.

export const FIGURE_PARTS = Object.freeze(['skin', 'hair', 'top', 'bottom', 'shoes', 'hat']);

// The default names are only where the name field starts; the player types their own.
export const FIGURES = Object.freeze({
  // Both figures come with their own skeleton, texture and animations, and are drawn exactly as supplied: no
  // part of them takes a colour (src/client/animated.js). The six earlier women and three earlier men were
  // replaced by these at the owner's request (8 October 2026); a save that names one of them falls back to
  // an ordinary kit figure.
  W1: Object.freeze({ id: 'W1', gender: 'f', name: 'Adaeze', file: 'woman.glb', animated: true, parts: Object.freeze([]) }),
  M1: Object.freeze({ id: 'M1', gender: 'm', name: 'Emeka', file: 'muscular_male.glb', animated: true, parts: Object.freeze([]) }),
});

export const FIGURE_ORDER = Object.freeze({ f: Object.freeze(['W1']), m: Object.freeze(['M1']) });

// The colours offered on the selection screen. Any colour is accepted from a client that sends a valid number;
// these are what the screen shows.
export const FIGURE_SWATCHES = Object.freeze({
  skin: Object.freeze([0x3b2415, 0x4a2c17, 0x5a3620, 0x6b4226, 0x7a4a2b, 0x8a5a36, 0xa0704a, 0xc08a62]),
  hair: Object.freeze([0x141110, 0x2e2723, 0x4a3122, 0x7a4b2a, 0x8d8d88, 0xcfcfc8, 0x6b1f2a, 0x1f3550]),
  top: Object.freeze([0xf2f0ea, 0x1a1a1c, 0x8c8f94, 0x7b2d2d, 0x1f5c4d, 0x24364f, 0xd9a441, 0xb5532f, 0x6d4a8c, 0xe8c6c0]),
  bottom: Object.freeze([0x1a1a1c, 0x2c3440, 0x5a4a3a, 0x8c8f94, 0xc9b99a, 0xf2f0ea, 0x7b2d2d, 0x1f5c4d]),
  shoes: Object.freeze([0x141210, 0x5a3624, 0xf2f0ea, 0x8c8f94, 0x7b2d2d, 0xc9a23a]),
  hat: Object.freeze([0x141210, 0x5a3624, 0xc9b99a, 0xf2f0ea, 0x7b2d2d, 0x24364f]),
});

export const FIGURE_DEFAULTS = Object.freeze({ skin: 0x5a3620, hair: 0x141110, top: 0x1f5c4d, bottom: 0x2c3440, shoes: 0x141210, hat: 0x5a3624 });

const isColour = (v) => Number.isInteger(v) && v >= 0 && v <= 0xffffff;

// A figure look from whatever a client sent, or null if it names no figure. Every colour is checked; one that
// is not a colour takes the default.
export function cleanFigureLook(look) {
  if (!look || typeof look !== 'object' || typeof look.figure !== 'string' || !Object.hasOwn(FIGURES, look.figure)) return null;
  const fig = FIGURES[look.figure];
  const src = look.colours && typeof look.colours === 'object' ? look.colours : {};
  const colours = {};
  for (const part of FIGURE_PARTS) colours[part] = isColour(src[part]) ? src[part] : FIGURE_DEFAULTS[part];
  return { figure: fig.id, body: fig.gender, colours, skin: colours.skin, top: colours.top, bottom: colours.bottom, build: 1, outfit: 'figure' };
}
