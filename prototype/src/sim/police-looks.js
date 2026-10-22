// The sixteen policewomen of the town's police (22 October 2026, the owner's brief): every one drawn from the owner's
// supplied police officer (W3, "Amaka", police.glb, no longer offered to new players), with her own face, her own skin
// and her own uniform. In his words: "use the police woman as inspo to recreate 15 other police, keep their face
// different, some dark african skin, while some melanin skin, some ebony skin, while few is fair", dressed in the
// Nigerian Police's uniforms of his picture: black with a beret; a sky-blue shirt with black trousers and a peaked cap;
// and blue camouflage with a beret.
//
// Pure data. The simulation reads the colours (what she looks like from far off, where she is a plain figure); the
// client (src/client/police-dress.js) puts the face, the skin, the uniform and the headwear on the supplied figure as
// it draws it. The file itself is never changed.

// Her clothes. `shirt`: the shirt's sleeves and collar (the body armour the figure wears over it stays as it is,
// black, POLICE across it); `trousers`; `hat` and its colour; `camo`: the shirt and trousers in the blue camouflage
// of the picture, these four colours in blotches.
export const UNIFORMS = Object.freeze({
  black: Object.freeze({ name: 'black, with a black beret', shirt: 0x18191c, trousers: 0x141518, hat: 'beret', hatColour: 0x101113, badge: 0xc9a23a, camo: null }),
  blue: Object.freeze({ name: 'a sky-blue shirt, black trousers and a peaked cap', shirt: 0x9fc4e6, trousers: 0x15171b, hat: 'cap', hatColour: 0x15171b, badge: 0xd6b04a, camo: null }),
  camo: Object.freeze({ name: 'blue camouflage, with a navy beret', shirt: 0x34507a, trousers: 0x34507a, hat: 'beret', hatColour: 0x1a2742, badge: 0xc9a23a, camo: Object.freeze([0x1c2b47, 0x3a5a8c, 0x7090bb, 0x121419]) }),
});

// Her skin, by the owner's words: ebony, dark, melanin (brown) and, for a few, fair.
export const SKIN_KINDS = Object.freeze(['ebony', 'dark', 'brown', 'fair']);

// Her face, as a change of the figure's own head: `width` of the face and `jaw` (1 is the figure's own), `chin` how
// much longer or shorter (a share of the head's height), `nose` its size, `lips` how full, `cheeks` how high and full,
// `brow` how far the brow stands out, and `head` the head's size. `height` and `build` are her own too.
const officer = (skin, tone, uniform, face, height = 1, build = 1) => Object.freeze({ skin, tone, uniform, face: Object.freeze(face), height, build });
export const POLICE_LOOKS = Object.freeze([
  officer('dark', 0x45291a, 'black', { width: 1.0, jaw: 1.0, chin: 0, nose: 1.0, lips: 1.0, cheeks: 1.0, brow: 1.0, head: 1.0 }, 1.0, 1.0),
  officer('ebony', 0x382319, 'blue', { width: 1.06, jaw: 1.08, chin: -0.025, nose: 1.16, lips: 1.14, cheeks: 1.05, brow: 1.03, head: 1.02 }, 0.97, 1.05),
  officer('brown', 0x6a4229, 'camo', { width: 0.95, jaw: 0.9, chin: 0.03, nose: 0.88, lips: 0.92, cheeks: 1.06, brow: 0.97, head: 0.98 }, 1.03, 0.96),
  officer('fair', 0x9c6c4a, 'black', { width: 0.97, jaw: 0.94, chin: 0.015, nose: 0.9, lips: 0.95, cheeks: 0.97, brow: 1.0, head: 0.99 }, 0.99, 0.98),
  officer('dark', 0x4b2e1d, 'blue', { width: 1.04, jaw: 1.04, chin: -0.012, nose: 1.1, lips: 1.08, cheeks: 1.08, brow: 1.05, head: 1.01 }, 1.01, 1.03),
  officer('ebony', 0x3a251a, 'camo', { width: 0.98, jaw: 0.96, chin: 0.02, nose: 1.05, lips: 1.12, cheeks: 0.96, brow: 0.98, head: 1.0 }, 1.04, 1.0),
  officer('brown', 0x74492d, 'black', { width: 1.03, jaw: 1.1, chin: -0.02, nose: 0.95, lips: 1.04, cheeks: 1.02, brow: 1.06, head: 1.03 }, 0.96, 1.07),
  officer('dark', 0x4f3020, 'camo', { width: 0.94, jaw: 0.92, chin: 0.025, nose: 1.0, lips: 0.97, cheeks: 1.07, brow: 0.96, head: 0.97 }, 1.02, 0.95),
  officer('ebony', 0x36221a, 'black', { width: 1.05, jaw: 0.98, chin: 0.008, nose: 1.2, lips: 1.18, cheeks: 1.0, brow: 1.02, head: 1.0 }, 0.98, 1.02),
  officer('fair', 0xab7b5a, 'blue', { width: 0.96, jaw: 1.02, chin: -0.01, nose: 0.86, lips: 0.9, cheeks: 1.04, brow: 0.98, head: 0.98 }, 1.0, 0.97),
  officer('brown', 0x5f3b25, 'blue', { width: 1.01, jaw: 0.95, chin: 0.018, nose: 1.08, lips: 1.0, cheeks: 0.95, brow: 1.04, head: 1.02 }, 1.05, 1.01),
  officer('dark', 0x42271a, 'black', { width: 0.99, jaw: 1.06, chin: -0.028, nose: 0.92, lips: 1.1, cheeks: 1.03, brow: 0.95, head: 0.99 }, 0.97, 1.04),
  officer('ebony', 0x3d271c, 'camo', { width: 1.02, jaw: 1.03, chin: 0.012, nose: 0.97, lips: 1.06, cheeks: 1.09, brow: 1.07, head: 1.04 }, 1.0, 1.06),
  officer('dark', 0x48301f, 'blue', { width: 0.95, jaw: 0.97, chin: 0.03, nose: 1.12, lips: 0.94, cheeks: 0.98, brow: 1.01, head: 0.96 }, 1.03, 0.94),
  officer('brown', 0x7b5032, 'camo', { width: 1.07, jaw: 1.0, chin: -0.005, nose: 0.9, lips: 1.02, cheeks: 1.01, brow: 0.99, head: 1.01 }, 0.99, 1.0),
  officer('fair', 0xb48866, 'camo', { width: 0.98, jaw: 0.91, chin: 0.022, nose: 0.94, lips: 0.96, cheeks: 1.06, brow: 1.02, head: 0.97 }, 1.01, 0.96),
]);

// The look the town gives the k-th officer: the supplied figure, which of the sixteen she is, and her colours (for
// whoever draws her from far off as a plain figure); and `plain`, her as one of the game's own figures in her
// uniform's colours, for a copy of the game that cannot have the supplied figure (the copy on a disk carries none of
// the supplied figures but two: animated.js, figureHere). The game's own figures have a beret, not a peaked cap: every
// one of them wears that.
export function policeLook(k) {
  const L = POLICE_LOOKS[((k % POLICE_LOOKS.length) + POLICE_LOOKS.length) % POLICE_LOOKS.length];
  const U = UNIFORMS[L.uniform];
  const plain = Object.freeze({ body: 'f', skin: L.tone, top: U.shirt, bottom: U.trousers, outfit: 'uniform', sleeves: 'long', hair: 'bun', hat: Object.freeze(['beret', U.hatColour]), build: L.build, height: L.height });
  return { figure: 'W3', police: POLICE_LOOKS.indexOf(L), body: 'f', skin: L.tone, top: U.shirt, bottom: U.trousers, hatColour: U.hatColour, build: L.build, height: L.height, outfit: 'figure', plain };
}
// What she is from far off: a plain figure in her uniform's colours, her beret or cap on.
export function policeFig(k) {
  const L = POLICE_LOOKS[((k % POLICE_LOOKS.length) + POLICE_LOOKS.length) % POLICE_LOOKS.length];
  const U = UNIFORMS[L.uniform];
  return { skin: L.tone, arm: U.shirt, top: U.shirt, bottom: U.trousers, legs: U.trousers, hair: U.hatColour, hat: 1, skirt: 0, scale: 1.02 * L.height, wide: L.build };
}
