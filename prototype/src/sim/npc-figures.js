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

export const NPC_FIGURES = Object.freeze({
  // his two police officers, five of each in the town
  P1: fig('P1', 'f', 'police__policeofficerfigure3dmodel.glb', 'police/policeofficerfigure3dmodel.glb', 'P1', 1.70, 'elegant', { police: true }),
  P2: fig('P2', 'm', 'police__securityguard3dmodel.glb', 'police/securityguard3dmodel.glb', 'P2', 1.80, 'bold', { police: true }),
});

// A figure of the town's own, by id (null for any other: a player's figure, or none)
export const npcFigure = (id) => (typeof id === 'string' && Object.hasOwn(NPC_FIGURES, id) ? NPC_FIGURES[id] : null);
