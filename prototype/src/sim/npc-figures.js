// The owner's townspeople and police (26 and 27 October 2026, his brief: "bring in my NPC models", and "replace the
// current police ... with this male and female police ... multiply it into 10 police. 5 males, 5 females"): which
// figures there are, whose they are, how tall each is drawn, how each walks. Never offered to a player
// (src/sim/figures.js is the players' list); a look naming one of these is not accepted from a client.
//
// Each is drawn from the light copy of his file (tools/npcs/light_npcs.py, made from his file as it is, or from the
// copy of it given a skeleton: tools/npcs/rig.py). `file` is that copy's name as the website serves it (figures/);
// `source` where his file (or its rigged copy) is in assets/characters/; `family` whose skeleton it has, as bound:
// every figure of one family takes the same borrowed moves (tools/characters/borrow.mjs), so they are made once.
//
// How each walks (his words: "some of the women walk elegantly and majestically ... some like a model on a catwalk
// ... the men walk boldly and confidently"), chosen by looking at each (27 October 2026):
//   elegant   the woman's own walk, upright, unhurried (woman.glb's walk)
//   catwalk   one foot before the other, the hips swinging (his "female cat walk", fashion_model_7.glb)
//   bold      the man's swagger (his security guard's own)
export const WALKS = Object.freeze(['elegant', 'catwalk', 'bold']);

const fig = (id, gender, file, source, family, height, walk, more = {}) => Object.freeze({ id, gender, file, source, family, height, walk, npc: true, ...more });
const colours = (skin, top, bottom, hair, skirt) => Object.freeze({ skin, top, bottom, hair, skirt });

export const NPC_FIGURES = Object.freeze({
  // his two police officers, five of each in the town
  P1: fig('P1', 'f', 'police__policeofficerfigure3dmodel.glb', 'police/policeofficerfigure3dmodel.glb', 'P1', 1.70, 'elegant', { police: true }),
  P2: fig('P2', 'm', 'police__securityguard3dmodel.glb', 'police/securityguard3dmodel.glb', 'P2', 1.80, 'bold', { police: true }),
  // His townspeople (26 October 2026), each drawn as he made it: from his file where it came with a skeleton (its own
  // family), from its copy given his police officer's skeleton (a woman) or his security guard's (a man) where it did
  // not (tools/npcs/rig.py). Two of his files are not here: humanfigure3dmodel2 (the same figure as humanfigure3dmodel
  // but for 81 bytes) and streetwear_model_3d_model (551,552 triangles: until a lighter copy of it has been shown to
  // him). `far`: what each is from far off, a plain figure (skin, top, bottom, hair, a skirt), from his own pictures.
  N1: fig('N1', 'f', 'npc__animegirl3dmodel.glb', 'npcs/rigged/animegirl3dmodel.glb', 'P1', 1.66, 'elegant', { far: colours(0xd9a88a, 0xe8e8e8, 0x3a5a8c, 0xd8c8a0, 0) }),
  N2: fig('N2', 'f', 'npc__athleticfemalecharacter3dmodel.glb', 'npcs/rigged/athleticfemalecharacter3dmodel.glb', 'P1', 1.68, 'elegant', { far: colours(0x7a4a2b, 0xc8202a, 0x6f8fb8, 0x1a1210, 0) }),
  N3: fig('N3', 'f', 'npc__bikinimodel3d.glb', 'npcs/rigged/bikinimodel3d.glb', 'P1', 1.72, 'catwalk', { far: colours(0xc08a62, 0xc8a080, 0xc08a62, 0x3a2418, 0) }),
  N4: fig('N4', 'm', 'npc__character3dmodel.glb', 'npcs/rigged/character3dmodel.glb', 'P2', 1.80, 'bold', { far: colours(0x3b2415, 0x18181a, 0xc8d0c8, 0xe08ab0, 0) }),
  N5: fig('N5', 'f', 'npc__fashiondoll3dmodel.glb', 'npcs/rigged/fashiondoll3dmodel.glb', 'P1', 1.66, 'catwalk', { far: colours(0x8a5a36, 0x9aa0d0, 0xf0f0f0, 0x2a1a10, 1) }),
  N6: fig('N6', 'f', 'npc__fashionmodel3d.glb', 'npcs/rigged/fashionmodel3d.glb', 'P1', 1.68, 'elegant', { far: colours(0x5a3620, 0xe0b020, 0x8090a8, 0x141010, 0) }),
  N7: fig('N7', 'f', 'npc__fashionmodel3dmodel1.glb', 'npcs/rigged/fashionmodel3dmodel1.glb', 'P1', 1.67, 'elegant', { far: colours(0xc89a7a, 0x4a4a32, 0x3a3a2a, 0x3a3428, 0) }),
  N8: fig('N8', 'f', 'npc__fashionmodel3dmodel2.glb', 'npcs/fashionmodel3dmodel2.glb', 'N8', 1.70, 'elegant', { far: colours(0x4a2c17, 0xf0f0f0, 0xb0b8c8, 0xf0f0f0, 0) }),
  N9: fig('N9', 'f', 'npc__fashionmodel3dmodel3.glb', 'npcs/rigged/fashionmodel3dmodel3.glb', 'P1', 1.69, 'elegant', { far: colours(0x5a3620, 0x4a6a9a, 0x4a6a9a, 0xe06020, 0) }),
  N10: fig('N10', 'f', 'npc__fashionmodel3dmodel4.glb', 'npcs/rigged/fashionmodel3dmodel4.glb', 'P1', 1.70, 'elegant', { far: colours(0x6b4226, 0x4a6a9a, 0x4a6a9a, 0x141010, 0) }),
  N11: fig('N11', 'f', 'npc__fashionmodel3dmodel5.glb', 'npcs/rigged/fashionmodel3dmodel5.glb', 'P1', 1.68, 'catwalk', { far: colours(0x7a4a2b, 0xc8202a, 0x202020, 0xd8d0b0, 0) }),
  N12: fig('N12', 'f', 'npc__femalecharacter3dmodel1.glb', 'npcs/femalecharacter3dmodel1.glb', 'N12', 1.70, 'catwalk', { far: colours(0x3b2415, 0xe070a0, 0x202020, 0x141010, 0) }),
  N13: fig('N13', 'f', 'npc__femalecharacter3dmodel2.glb', 'npcs/rigged/femalecharacter3dmodel2.glb', 'P1', 1.67, 'elegant', { far: colours(0x4a2c17, 0x1f5c3d, 0x506a90, 0x141010, 0) }),
  N14: fig('N14', 'f', 'npc__femalecharacter3dmodel3.glb', 'npcs/rigged/femalecharacter3dmodel3.glb', 'P1', 1.65, 'elegant', { far: colours(0xd0a080, 0x4a3428, 0x6a6a50, 0x3a2418, 0) }),
  N15: fig('N15', 'f', 'npc__femaledancer3dmodel.glb', 'npcs/rigged/femaledancer3dmodel.glb', 'P1', 1.64, 'catwalk', { far: colours(0xc89a7a, 0x3a6a9a, 0xe8e8f0, 0x141010, 0) }),
  N16: fig('N16', 'f', 'npc__femalefigure3dmodel1.glb', 'npcs/rigged/femalefigure3dmodel1.glb', 'P1', 1.69, 'catwalk', { far: colours(0x8a5a36, 0xf0f0f0, 0xc03030, 0xd8d0b0, 0) }),
  N17: fig('N17', 'f', 'npc__femalefigure3dmodel2.glb', 'npcs/rigged/femalefigure3dmodel2.glb', 'P1', 1.71, 'catwalk', { far: colours(0x7a4a2b, 0xf0f0f0, 0xf0f0f0, 0xf0f0f0, 1) }),
  N18: fig('N18', 'f', 'npc__femalehuman3dmodel.glb', 'npcs/rigged/femalehuman3dmodel.glb', 'P1', 1.72, 'catwalk', { far: colours(0x5a3620, 0xe0a0b0, 0x5a3620, 0x141010, 0) }),
  N19: fig('N19', 'f', 'npc__humancharacter3dmodel1.glb', 'npcs/rigged/humancharacter3dmodel1.glb', 'P1', 1.70, 'elegant', { far: colours(0x5a3620, 0xf0f0f0, 0xb8c8d8, 0x141010, 0) }),
  N20: fig('N20', 'f', 'npc__humanfigure3dmodel.glb', 'npcs/humanfigure3dmodel.glb', 'N20', 1.64, 'elegant', { far: colours(0xd0a080, 0x5a3a28, 0x3a5a8c, 0xa04020, 0) }),
  N21: fig('N21', 'm', 'npc__humanfigure3dmodel1.glb', 'npcs/rigged/humanfigure3dmodel1.glb', 'P2', 1.82, 'bold', { far: colours(0x3b2415, 0xf0f0f0, 0x9ab0c8, 0x141010, 0) }),
  N22: fig('N22', 'f', 'npc__military-stylefemale3dmodel.glb', 'npcs/rigged/military-stylefemale3dmodel.glb', 'P1', 1.67, 'elegant', { far: colours(0xd0a080, 0xb02040, 0x6a5a3a, 0x5a5a40, 0) }),
  N23: fig('N23', 'f', 'npc__youngwoman3dmodel.glb', 'npcs/rigged/youngwoman3dmodel.glb', 'P1', 1.63, 'elegant', { far: colours(0xd0a080, 0x5a3a28, 0x7a5a3a, 0xb08050, 0) }),
});

// A figure of the town's own, by id (null for any other: a player's figure, or none)
export const npcFigure = (id) => (typeof id === 'string' && Object.hasOwn(NPC_FIGURES, id) ? NPC_FIGURES[id] : null);

// The townspeople's figures (not the police's), women's and men's, in order
export const TOWN_FIGURES = Object.freeze({
  f: Object.freeze(Object.values(NPC_FIGURES).filter((f) => !f.police && f.gender === 'f').map((f) => f.id)),
  m: Object.freeze(Object.values(NPC_FIGURES).filter((f) => !f.police && f.gender === 'm').map((f) => f.id)),
});
