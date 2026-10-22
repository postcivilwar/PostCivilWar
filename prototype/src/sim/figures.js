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
  // Four more of the owner's supplied figures (12 October 2026), each drawn as supplied: an athlete and a police
  // officer (women), a priest in his vestments and a hooded warrior (men). Their ids are new: M2 and M3 were
  // figures taken out on 8 October, and an old save that names one is left as it was.
  W2: Object.freeze({ id: 'W2', gender: 'f', name: 'Ngozi', file: 'athlete.glb', animated: true, parts: Object.freeze([]) }),
  W3: Object.freeze({ id: 'W3', gender: 'f', name: 'Amaka', file: 'police.glb', animated: true, parts: Object.freeze([]) }),
  M4: Object.freeze({ id: 'M4', gender: 'm', name: 'Ikenna', file: 'priest.glb', animated: true, parts: Object.freeze([]) }),
  M5: Object.freeze({ id: 'M5', gender: 'm', name: 'Uche', file: 'warrior.glb', animated: true, parts: Object.freeze([]) }),
  // Eighteen more of the owner's supplied figures (16 October 2026), each drawn as supplied. Which are women and
  // which are men was read from the figures themselves (their bodies, faces and clothes), not from the files'
  // names. Two of the files supplied were one figure (the same mesh and textures, one with three more
  // animations): it is here once, from the fuller file. None is a figure the game already had.
  W4: Object.freeze({ id: 'W4', gender: 'f', name: 'Chioma', file: 'female_figure.glb', animated: true, parts: Object.freeze([]) }),
  W5: Object.freeze({ id: 'W5', gender: 'f', name: 'Ifeoma', file: 'athletic_outfit.glb', animated: true, parts: Object.freeze([]) }),
  W6: Object.freeze({ id: 'W6', gender: 'f', name: 'Nneka', file: 'fashion_model_3.glb', animated: true, parts: Object.freeze([]) }),
  W7: Object.freeze({ id: 'W7', gender: 'f', name: 'Chiamaka', file: 'zombie_survivor.glb', animated: true, parts: Object.freeze([]) }),
  W8: Object.freeze({ id: 'W8', gender: 'f', name: 'Obiageli', file: 'female_character_2.glb', animated: true, parts: Object.freeze([]) }),
  W9: Object.freeze({ id: 'W9', gender: 'f', name: 'Ebele', file: 'horror_nurse.glb', animated: true, parts: Object.freeze([]) }),
  W10: Object.freeze({ id: 'W10', gender: 'f', name: 'Adanna', file: 'camouflage_bikini.glb', animated: true, parts: Object.freeze([]) }),
  W11: Object.freeze({ id: 'W11', gender: 'f', name: 'Ujunwa', file: 'swimwear_model.glb', animated: true, parts: Object.freeze([]) }),
  W12: Object.freeze({ id: 'W12', gender: 'f', name: 'Chinwe', file: 'fashion_model_2.glb', animated: true, parts: Object.freeze([]) }),
  W13: Object.freeze({ id: 'W13', gender: 'f', name: 'Ifeyinwa', file: 'fashion_model_1.glb', animated: true, parts: Object.freeze([]) }),
  M6: Object.freeze({ id: 'M6', gender: 'm', name: 'Chinedu', file: 'male_figure.glb', animated: true, parts: Object.freeze([]) }),
  M7: Object.freeze({ id: 'M7', gender: 'm', name: 'Obinna', file: 'zombie.glb', animated: true, parts: Object.freeze([]) }),
  M8: Object.freeze({ id: 'M8', gender: 'm', name: 'Nnamdi', file: 'horror_character.glb', animated: true, parts: Object.freeze([]) }),
  M9: Object.freeze({ id: 'M9', gender: 'm', name: 'Kelechi', file: 'hobo_character.glb', animated: true, parts: Object.freeze([]) }),
  M10: Object.freeze({ id: 'M10', gender: 'm', name: 'Okechukwu', file: 'zombie_character.glb', animated: true, parts: Object.freeze([]) }),
  M11: Object.freeze({ id: 'M11', gender: 'm', name: 'Tobenna', file: 'human_character.glb', animated: true, parts: Object.freeze([]) }),
  M12: Object.freeze({ id: 'M12', gender: 'm', name: 'Chukwudi', file: 'ninja_armor.glb', animated: true, parts: Object.freeze([]) }),
  M13: Object.freeze({ id: 'M13', gender: 'm', name: 'Ifeanyi', file: 'ninja_warrior.glb', animated: true, parts: Object.freeze([]) }),
  // Six more (17 October 2026), read the same way, by looking at each: two women and four men. A seventh file the
  // owner supplied, a figure of a well-known film and comic character, is left out at the owner's word.
  W14: Object.freeze({ id: 'W14', gender: 'f', name: 'Nkiru', file: 'fashion_model_7.glb', animated: true, parts: Object.freeze([]) }),
  W15: Object.freeze({ id: 'W15', gender: 'f', name: 'Uloma', file: 'fashion_model_5.glb', animated: true, parts: Object.freeze([]) }),
  M14: Object.freeze({ id: 'M14', gender: 'm', name: 'Chidi', file: 'fashion_model_6.glb', animated: true, parts: Object.freeze([]) }),
  M15: Object.freeze({ id: 'M15', gender: 'm', name: 'Ebuka', file: 'patchwork_shirt.glb', animated: true, parts: Object.freeze([]) }),
  M16: Object.freeze({ id: 'M16', gender: 'm', name: 'Obiora', file: 'nigerian_traditional.glb', animated: true, parts: Object.freeze([]) }),
  M17: Object.freeze({ id: 'M17', gender: 'm', name: 'Somto', file: 'urban_streetwear.glb', animated: true, parts: Object.freeze([]) }),
});

// The figures a player chooses from, women and men. The police officer, W3 ("Amaka"), is not among them since 22
// October 2026: at the owner's word she is the town's own police now (police-looks.js: sixteen women drawn from her).
// A player who already has her keeps her; she is in FIGURES still, and a save that names her is drawn as she was.
export const FIGURE_ORDER = Object.freeze({
  f: Object.freeze(['W1', 'W2', 'W4', 'W5', 'W6', 'W7', 'W8', 'W9', 'W10', 'W11', 'W12', 'W13', 'W14', 'W15']),
  m: Object.freeze(['M1', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11', 'M12', 'M13', 'M14', 'M15', 'M16', 'M17']),
});

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
