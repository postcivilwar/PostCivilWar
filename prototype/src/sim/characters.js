// Who wears what. The character system's catalogue and its rules.
//
// A person is described by a short config: gender, age, body type, skin tone,
// hair, an outfit, headwear, shoes, accessories and colours. This module
// turns a config into the list of kit parts that draw them, and chooses a
// config for someone from their age, work and people.
//
// Nothing here draws anything, so the simulation and its tests can use it.
// The parts are named as tools/characters/bake.py names them.

import { FIGURES } from './figures.js';
// ------------------------------------------------------------- catalogue --

export const SKIN_TONES = [0x3b2415, 0x4a2c17, 0x4f3019, 0x5a3620, 0x5e3b24, 0x6b4226, 0x70482c, 0x76533a, 0x7a4a2b, 0x8a5a36];
export const HAIR_COLOURS = { black: 0x17120f, brown: 0x2e2723, grey: 0x8d8d88, white: 0xcfcfc8 };

export const BODY_TYPES = {
  slim: { wide: 0.93, deep: 0.92, belly: 0 },
  average: { wide: 1.0, deep: 1.0, belly: 0 },
  sturdy: { wide: 1.07, deep: 1.08, belly: 0.012 },
  heavy: { wide: 1.13, deep: 1.16, belly: 0.04 },
};

// An outfit: the parts that make it, and which of the wearer's colours goes on each part's cloth.
// `skin` lists the bare limbs it leaves showing. `feet` is what goes on the feet unless the wearer chooses.
const P = (id, colours = {}, prints = null) => ({ id, colours, prints });
// Whose dress a people wears, where it is not its own name: the Anioma (Enuani), Ika and Ukwuani peoples of Delta
// State wear Igbo dress; the Urhobo, Isoko, Itsekiri and Ijaw women wear the wrapper and blouse of the Delta.
export const DRESS_OF = Object.freeze({ enuani: 'igbo', ika: 'igbo', ukwuani: 'igbo', urhobo: 'delta', isoko: 'delta', itsekiri: 'delta', ijaw: 'delta' });

export const OUTFITS = {
  // --- the base character's own clothes ---
  streetwear: { name: 'Hoodie and joggers', kind: 'urban', pose: 'base', parts: [P('base.yoke'), P('base.hoodie', { a: 'top', b: 'accent', c: 'accent2' }), P('base.joggers', { a: 'bottom', b: 'trim' })], feet: 'sneakers' },
  // --- everyday and western ---
  tee: { name: 'T-shirt and trousers', kind: 'urban', parts: [P('top.tee', { a: 'top', b: 'trim' }), P('bottom.trousers', { a: 'bottom', b: 'bottom' })], skin: ['body.arms.lower'], feet: 'trainers' },
  'tee-shorts': { name: 'T-shirt and shorts', kind: 'urban', parts: [P('top.tee', { a: 'top', b: 'trim' }), P('bottom.shorts', { a: 'bottom', b: 'bottom' })], skin: ['body.arms.lower', 'body.legs'], feet: 'sandals' },
  polo: { name: 'Polo shirt and trousers', kind: 'urban', parts: [P('top.polo', { a: 'top', b: 'trim', c: 'button' }), P('bottom.trousers', { a: 'bottom', b: 'bottom' })], skin: ['body.arms.lower'], feet: 'shoes' },
  shirt: { name: 'Shirt and trousers', kind: 'office', parts: [P('top.shirt', { a: 'top', c: 'button' }), P('bottom.trousers', { a: 'bottom', b: 'belt' })], feet: 'shoes' },
  'shirt-short': { name: 'Short-sleeved shirt and trousers', kind: 'office', parts: [P('top.shirt.short', { a: 'top', c: 'button' }), P('bottom.trousers', { a: 'bottom', b: 'belt' })], skin: ['body.arms.lower'], feet: 'shoes' },
  'shirt-shorts': { name: 'Shirt and shorts', kind: 'school', parts: [P('top.shirt.short', { a: 'top', c: 'button' }), P('bottom.shorts', { a: 'bottom', b: 'bottom' })], skin: ['body.arms.lower', 'body.legs'], feet: 'sandals' },
  'shirt-skirt': { name: 'Shirt and skirt', kind: 'office', gender: 'f', parts: [P('top.shirt.short', { a: 'top', c: 'button' }), P('bottom.skirt', { a: 'bottom', b: 'bottom' })], skin: ['body.arms.lower', 'body.legs.lower'], feet: 'shoes', stride: 0.8 },
  uniform: { name: 'Uniform', kind: 'work', parts: [P('top.uniform', { a: 'top', b: 'belt', c: 'button' }), P('bottom.trousers', { a: 'bottom', b: 'belt' })], skin: ['body.arms.lower'], feet: 'boots' },
  singlet: { name: 'Singlet and shorts', kind: 'work', gender: 'm', parts: [P('top.singlet', { a: 'top' }), P('bottom.shorts', { a: 'bottom', b: 'bottom' })], skin: ['body.arms', 'body.legs'], feet: 'slippers' },
  'singlet-trousers': { name: 'Singlet and trousers', kind: 'work', gender: 'm', parts: [P('top.singlet', { a: 'top' }), P('bottom.trousers', { a: 'bottom', b: 'bottom' })], skin: ['body.arms'], feet: 'boots' },
  hivis: { name: 'Work clothes and a reflective vest', kind: 'work', parts: [P('top.tee', { a: 'top', b: 'top' }), P('acc.hivis', { a: 'accent', b: 'trim' }), P('bottom.trousers', { a: 'bottom', b: 'bottom' })], skin: ['body.arms.lower'], feet: 'boots' },
  gown: { name: 'Dress', kind: 'urban', gender: 'f', parts: [P('dress.gown', { a: 'top', b: 'trim' }, { a: 'print' })], skin: ['body.arms.lower', 'body.legs.lower'], feet: 'sandals', stride: 0.75 },
  'skirt-blouse': { name: 'Blouse and skirt', kind: 'urban', gender: 'f', parts: [P('top.blouse', { a: 'top', b: 'trim' }), P('bottom.skirt', { a: 'bottom', b: 'bottom' })], skin: ['body.arms.lower', 'body.legs.lower'], feet: 'sandals', stride: 0.8 },
  // --- native wear ---
  senator: { name: 'Senator', kind: 'native', gender: 'm', parts: [P('top.senator', { a: 'top', b: 'trim', c: 'button' }), P('bottom.trousers', { a: 'top', b: 'top' })], feet: 'shoes' },
  isiagu: { name: 'Isi agu and trousers', kind: 'native', culture: 'igbo', gender: 'm', parts: [P('top.isiagu', { a: 'top', b: 'accent' }, { a: 'print' }), P('bottom.trousers', { a: 'bottom', b: 'bottom' })], skin: ['body.arms.fore'], feet: 'shoes' },
  kaftan: { name: 'Kaftan', kind: 'native', gender: 'm', parts: [P('top.kaftan', { a: 'top', b: 'trim' }, { b: 'braid' }), P('bottom.trousers', { a: 'top', b: 'top' })], feet: 'sandals', stride: 0.85 },
  agbada: { name: 'Agbada', kind: 'native', culture: 'yoruba', gender: 'm', parts: [P('top.agbada', { a: 'top', b: 'trim' }, { a: 'print', b: 'braid' }), P('bottom.trousers', { a: 'top', b: 'top' }, { a: 'print' })], skin: ['body.arms.fore'], feet: 'shoes', stride: 0.85 },
  babanriga: { name: 'Babban riga', kind: 'native', culture: 'hausa', gender: 'm', parts: [P('top.agbada', { a: 'top', b: 'trim' }, { b: 'braid' }), P('bottom.trousers', { a: 'top', b: 'top' })], skin: ['body.arms.fore'], feet: 'sandals', stride: 0.85 },
  'buba-sokoto': { name: 'Buba and sokoto', kind: 'native', culture: 'yoruba', gender: 'm', parts: [P('top.buba', { a: 'top' }, { a: 'print' }), P('bottom.trousers', { a: 'top', b: 'top' }, { a: 'print' })], skin: ['body.arms.fore'], feet: 'sandals' },
  'blouse-wrapper': { name: 'Blouse and wrapper', kind: 'native', gender: 'f', parts: [P('top.blouse', { a: 'top', b: 'trim' }), P('bottom.wrapper', { a: 'bottom' }, { a: 'print' })], skin: ['body.arms.lower'], feet: 'sandals', stride: 0.55 },
  'double-wrapper': { name: 'Blouse and two wrappers', kind: 'native', gender: 'f', parts: [P('top.blouse', { a: 'top', b: 'trim' }), P('bottom.wrapper', { a: 'bottom' }, { a: 'print' }), P('bottom.wrapper.over', { a: 'bottom' }, { a: 'print' })], skin: ['body.arms.lower'], feet: 'sandals', stride: 0.55 },
  'iro-buba': { name: 'Iro and buba', kind: 'native', culture: 'yoruba', gender: 'f', parts: [P('top.buba', { a: 'top' }, { a: 'print' }), P('bottom.wrapper', { a: 'bottom' }, { a: 'print' })], skin: ['body.arms.fore'], feet: 'sandals', stride: 0.55 },
  'long-dress': { name: 'Long dress', kind: 'native', gender: 'f', parts: [P('dress.long', { a: 'top', b: 'trim' }, { a: 'print' })], feet: 'sandals', stride: 0.6 },
  boubou: { name: 'Boubou', kind: 'native', gender: 'f', parts: [P('dress.boubou', { a: 'top', b: 'trim' }, { a: 'print' })], skin: ['body.arms.fore'], feet: 'sandals', stride: 0.6 },
  // --- by calling ---
  doctor: { name: 'White coat', kind: 'work', parts: [P('top.coat', { a: 'coat', b: 'top', c: 'accent', d: 'button' }), P('bottom.trousers', { a: 'bottom', b: 'belt' })], feet: 'shoes' },
  'nurse-dress': { name: "Nurse's dress", kind: 'work', gender: 'f', parts: [P('dress.nurse', { a: 'top', b: 'trim', c: 'button' })], skin: ['body.arms.lower', 'body.legs.lower'], feet: 'shoes', stride: 0.8 },
  'nurse-tunic': { name: "Nurse's tunic", kind: 'work', parts: [P('top.tunic', { a: 'top', b: 'trim' }), P('bottom.trousers', { a: 'bottom', b: 'bottom' })], skin: ['body.arms.lower'], feet: 'shoes' },
  cassock: { name: 'Cassock', kind: 'work', gender: 'm', parts: [P('top.cassock', { a: 'top', b: 'collar', c: 'button' })], feet: 'shoes', stride: 0.6 },
  vestments: { name: 'Mass vestments', kind: 'work', gender: 'm', parts: [P('top.chasuble', { a: 'accent', b: 'accent2' }), P('top.cassock', { a: 'top', b: 'collar', c: 'button' })], feet: 'shoes', stride: 0.55 },
};

export const FOOTWEAR = {
  shoes: [P('shoe.shoes', { a: 'shoe', b: 'sole' })],
  trainers: [P('shoe.shoes', { a: 'shoe', b: 'sole' })],
  boots: [P('shoe.boots', { a: 'shoe', b: 'sole' })],
  sandals: [P('body.feet'), P('shoe.sandals', { a: 'sole', b: 'shoe' })],
  slippers: [P('body.feet'), P('shoe.slippers', { a: 'sole', b: 'shoe' })],
  sneakers: [P('base.sneakers', { a: 'shoe', b: 'sole' })],          // the base character's own; they fit its wide stance only
};

export const HAIR = {
  none: [], low: ['hair.low'], fade: ['hair.fade'], afro: ['hair.afro'], hightop: ['hair.hightop'], receded: ['hair.receded'], crown: ['hair.crown'],
  cornrows: ['hair.cornrows'], braids: ['hair.braids'], bun: ['hair.bun'], puff: ['hair.puff'],
};
const THIN_HAIR = new Set(['none', 'low', 'fade', 'receded', 'crown']);

// Headwear: its part, and whether it hides the hair.
export const HEADWEAR = {
  cap: { parts: [P('base.cap', { a: 'hat', b: 'hat2' })], covers: false },
  headtie: { parts: [P('hat.headtie', { a: 'hat' }, { a: 'hatprint' })], covers: true },
  gele: { parts: [P('hat.gele', { a: 'hat' }, { a: 'hatprint' })], covers: true },
  scarf: { parts: [P('hat.scarf', { a: 'hat' }, { a: 'hatprint' })], covers: true },
  hijab: { parts: [P('hat.hijab', { a: 'hat' })], covers: true },
  fila: { parts: [P('hat.fila', { a: 'hat' }, { a: 'hatprint' })], covers: false },
  hula: { parts: [P('hat.hula', { a: 'hat', b: 'hat2' }, { a: 'hatprint' })], covers: false },
  knit: { parts: [P('hat.knit', { a: 'hat', b: 'hat2' }, { a: 'hatprint' })], covers: false },
  straw: { parts: [P('hat.straw', { a: 'hat' })], covers: false },
  helmet: { parts: [P('hat.helmet', { a: 'hat' })], covers: false },
  beret: { parts: [P('hat.beret', { a: 'hat' })], covers: false },
};

export const EXTRAS = {
  beard: [P('hair.beard')],
  goatee: [P('hair.goatee')],
  basebeard: [P('base.beard')],
  glasses: [P('base.glasses', { a: 'frame', b: 'lens' })],
  headphones: [P('base.headphones', { a: 'extra', b: 'frame' })],
  beads: [P('acc.beads', { a: 'beads' })],
  stethoscope: [P('acc.stethoscope', { a: 'frame', b: 'metal' })],
  apron: [P('acc.apron', { a: 'apron', b: 'apron' })],
  bangles: [P('acc.bangles', { a: 'metal' })],
  watch: [P('acc.watch', { a: 'frame' })],
  belt: [P('acc.belt', { a: 'belt', b: 'metal' })],
  sash: [P('acc.sash', { a: 'sash' })],
  shouldercloth: [P('acc.shouldercloth', { a: 'hat' }, { a: 'hatprint' })],
  handbag: [P('acc.handbag', { a: 'extra', b: 'extra' })],
  tie: [P('acc.tie', { a: 'accent' })],
};

// What each animation set is for. The figure's movements are shared; this names which a role uses.
export const ANIMATION_SETS = {
  everyday: ['stand', 'walk', 'run', 'talk', 'sit'],
  trader: ['stand', 'walk', 'talk', 'sit', 'sell'],
  worker: ['stand', 'walk', 'talk', 'sit', 'work', 'carry'],
  driver: ['stand', 'walk', 'talk', 'sit', 'drive', 'ride'],
  clergy: ['stand', 'walk', 'talk', 'sit', 'pray'],
  health: ['stand', 'walk', 'talk', 'sit', 'work'],
};

// Prints: a kind of cloth and its colours. The client paints each once and keeps it.
export const PRINTS = {
  ankara: (colours, motif = 'rings') => ({ kind: 'ankara', motif, colours }),
  isiagu: (ground = 0x8a1616) => ({ kind: 'isiagu', colours: [ground, 0xd9a441, 0x1b1b1e] }),
  asooke: (colours) => ({ kind: 'asooke', colours }),
  adire: (colours = [0x1d2a5c, 0xdfe6f2]) => ({ kind: 'adire', colours }),
  george: (colours) => ({ kind: 'george', colours }),
  lace: (colours) => ({ kind: 'lace', colours }),
  knit: (colours = [0xa01c1c, 0x1b1b1e, 0xf3ecdc]) => ({ kind: 'knit', colours }),
  hula: (colours = [0xf3ecdc, 0x2f4f7f, 0xb8860b]) => ({ kind: 'hula', colours }),
  check: (colours) => ({ kind: 'check', colours }),
  braid: (colours) => ({ kind: 'braid', colours }),
};
export const printKey = (p) => (p ? `${p.kind}|${p.motif || ''}|${p.colours.map((c) => c.toString(16)).join(',')}` : null);

// ------------------------------------------------------------- resolving --

const shadeHex = (hex, k) => { const r = Math.min(255, Math.round(((hex >> 16) & 255) * k)), g = Math.min(255, Math.round(((hex >> 8) & 255) * k)), b = Math.min(255, Math.round((hex & 255) * k)); return (r << 16) | (g << 8) | b; };
const mixHex = (a, b, t) => { const m = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t); return (m(16) << 16) | (m(8) << 8) | m(0); };

const DEFAULT_COLOURS = { top: 0xe8e2d0, bottom: 0x2a2a2a, trim: null, accent: 0xd9a441, accent2: null, button: 0xe9e4d6, belt: 0x1a1614, shoe: 0x1f1b18, sole: 0x2b211a, hat: 0x7b2d5b, hat2: null, frame: 0x101014, lens: 0x1c2128, metal: 0xc9a23a, beads: 0xc8402a, apron: 0xe7e1d2, sash: 0x1c1c1f, coat: 0xf4f4f0, collar: 0xf4f4f0, extra: 0x5a3324 };

function colourOf(role, colours) {
  if (typeof role === 'number') return role;
  let c = colours[role];
  if (c === null || c === undefined) c = DEFAULT_COLOURS[role];
  if (c === null || c === undefined) {
    if (role === 'trim') return shadeHex(colourOf('top', colours), 0.82);
    if (role === 'accent2') return shadeHex(colourOf('accent', colours), 0.75);
    if (role === 'hat2') return shadeHex(colourOf('hat', colours), 0.78);
    return 0x808080;
  }
  return c;
}

// The parts, colours and measurements that draw a config. `lod` is the level of detail: 0, 1 or 2.
export function characterSpec(config, lod = 0) {
  if (config.figure) {
    const c = config.colours || {};
    return { lod, figure: config.figure, pose: 'natural', parts: [{ id: `fig.${config.figure}`, colours: { a: c.top, b: c.bottom, c: c.shoes, d: c.hat }, prints: {} }], skin: c.skin, hair: c.hair, brow: c.hair, lips: c.skin, iris: 0x2e1c12, body: {}, face: null, scale: 1, headScale: 1, stride: 1, stoop: 0 };
  }
  const outfit = OUTFITS[config.outfit] || OUTFITS.tee;
  const colours = config.colours || {};
  const prints = config.prints || {};
  const base = outfit.pose === 'base';
  const parts = [];
  const add = (list) => {
    for (const p of list) {
      const own = {};
      for (const [slot, role] of Object.entries(p.colours || {})) own[slot] = colourOf(role, colours);
      const pr = {};
      for (const [slot, which] of Object.entries(p.prints || {})) { let print = prints[which]; if (!print && which === 'braid') print = PRINTS.braid([own[slot], shadeHex(own[slot], 0.72)]); if (print) pr[slot] = printKey(print); }
      parts.push({ id: p.id, colours: own, prints: pr });
    }
  };
  add([P('base.head'), P('base.hands')]);
  add(outfit.parts);
  if (outfit.skin) add(outfit.skin.map((id) => P(id)));
  const feet = base ? 'sneakers' : (config.shoes && config.shoes !== 'sneakers' ? config.shoes : outfit.feet || 'shoes');
  add(FOOTWEAR[feet]);
  // a long skirt or a kaftan still shows the ankle above a sandal
  if (!base && (feet === 'sandals' || feet === 'slippers') && !(outfit.skin || []).some((s) => s.startsWith('body.legs'))) add([P('body.legs.ankle')]);
  const hat = config.hat && HEADWEAR[config.hat] ? HEADWEAR[config.hat] : null;
  let hair = config.hair || 'low';
  if (hat && hat.covers) hair = 'none';
  else if (hat && !THIN_HAIR.has(hair)) hair = 'low';
  add((HAIR[hair] || []).map((id) => P(id)));
  if (hat) add(hat.parts);
  for (const extra of config.extras || []) if (EXTRAS[extra]) add(EXTRAS[extra]);
  const type = BODY_TYPES[config.body] || BODY_TYPES.average;
  const female = config.gender === 'f';
  const age = config.age === undefined ? 30 : config.age;
  // children are smaller all over, with a larger head for their size
  const grown = age >= 18 ? 1 : age >= 13 ? 0.9 + (age - 13) * 0.02 : 0.56 + Math.max(0, age - 3) * 0.034;
  const height = (config.height || 1) * (female ? 0.945 : 1) * grown;
  const skin = config.skin || SKIN_TONES[4];
  const hairColour = config.hairColour || (age >= 68 ? HAIR_COLOURS.white : age >= 56 ? HAIR_COLOURS.grey : HAIR_COLOURS.black);
  return {
    lod, pose: base ? 'base' : 'natural', parts,
    skin, hair: hairColour, brow: age >= 62 ? HAIR_COLOURS.grey : HAIR_COLOURS.black, lips: mixHex(shadeHex(skin, 0.74), 0x7a2f33, female ? 0.34 : 0.2), iris: 0x2e1c12,
    body: base ? { wide: 1 + ((config.build || 1) - 1) * 0.5, deep: 1, female: 0, belly: 0 } : { wide: type.wide * (config.build || 1), deep: type.deep * (config.build || 1), belly: type.belly + (age > 50 ? 0.01 : 0), female: female ? 1 : 0, child: 1 - Math.min(1, grown) },
    face: faceOf(config.face === undefined ? 0 : config.face, female, age),
    scale: height, headScale: (female ? 0.975 : 1) * (age < 13 ? 1.22 - (age - 3) * 0.016 : age < 18 ? 1.05 : 1),
    stride: outfit.stride || 1, stoop: age >= 70 ? 0.09 : age >= 60 ? 0.04 : 0,
  };
}

// A face: small differences in the jaw, chin, nose, lips and cheeks, from a number. The same number gives the same face.
function faceOf(seed, female, age) {
  const r = (k) => { const x = Math.sin((seed + 1) * (k * 12.9898 + 78.233)) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; };
  return {
    jaw: (female ? -0.05 : 0.01) + r(1) * 0.05, chin: (female ? -0.002 : 0.001) + r(2) * 0.004, nose: r(3) * 0.09 + (female ? -0.04 : 0.03), lips: r(4) * 0.0022 + (female ? 0.0012 : 0),
    cheek: r(5) * 0.004 + (age < 13 ? 0.004 : 0), brow: female ? -0.0012 : 0.0006 + r(6) * 0.0008, long: r(7) * 0.022,
  };
}

// ------------------------------------------------------- from a look --

const HAIR_MAP = { low: 'low', afro: 'afro', bun: 'bun', braids: 'braids', grey: 'low', fade: 'fade', hightop: 'hightop', receded: 'receded', crown: 'crown', cornrows: 'cornrows', puff: 'puff', none: 'none' };
const HAT_MAP = { beret: 'beret', cap: 'hula', redcap: 'hula', facecap: 'cap', headtie: 'headtie', helmet: 'helmet', strawhat: 'straw', gele: 'gele', scarf: 'scarf', hijab: 'hijab', fila: 'fila', hula: 'hula', knit: 'knit', straw: 'straw' };
const isLight = (hex) => ((hex >> 16) & 255) * 0.3 + ((hex >> 8) & 255) * 0.59 + (hex & 255) * 0.11 > 150;
const PLAYER_COLOURS = { top: 0xc6ceb7, bottom: 0x080c15, trim: 0xecefe8, shoe: 0xb20308, sole: 0xb31d27, hat: 0x040507, hat2: 0xabafa6, frame: 0x040507, lens: 0x1c2128, extra: 0xecefe8 };

// A config from a `look`, the short description of a person the simulation has always kept:
// skin, top and bottom colours, an outfit word, hair, a hat, a pattern.
export function configFromLook(look) {
  // one of the owner's supplied figures, in the colours the player chose
  if (look.figure && Object.hasOwn(FIGURES, look.figure)) return { figure: look.figure, gender: look.body === 'f' ? 'f' : 'm', colours: { ...(look.colours || {}) } };
  const female = look.body === 'f';
  const age = look.age !== undefined ? look.age : look.face === 'elder' || look.hair === 'grey' ? 66 : look.scale && look.scale < 0.98 ? Math.max(3, Math.round(3 + (look.scale - 0.56) / 0.034)) : 32;
  const base = { gender: female ? 'f' : 'm', age, skin: look.skin, build: look.build ? 1 + (look.build - 1) * 0.5 : 1, height: look.height || 1, face: Math.abs(Math.round((look.skin % 97) + (look.top % 89) * 3 + (look.build || 1) * 400)) };
  if (look.wear) return { ...base, ...look.wear };
  const colours = { top: look.top, bottom: look.bottom };
  const prints = {};
  const extras = [];
  let outfit;
  let shoes = look.shoes === 'sandal' ? 'sandals' : undefined;
  if (look.shoeColour) colours.shoe = look.shoeColour;
  switch (look.outfit) {
    case 'streetwear':
      // a player: the base character itself, with their own skin tone and their colour on the hoodie
      return { ...base, outfit: 'streetwear', hair: female ? 'braids' : 'none', hat: female ? null : 'cap', extras: female ? [] : ['basebeard', 'glasses', 'headphones'], colours: { ...PLAYER_COLOURS, accent: look.top, accent2: look.top }, hairColour: 0x2e2723 };
    case 'wrapper': outfit = 'blouse-wrapper'; if (look.pattern) prints.print = PRINTS.ankara(look.pattern.colours, look.pattern.motif); shoes = shoes || 'sandals'; break;
    case 'gown': outfit = 'gown'; break;
    case 'kaftan': outfit = look.sleeves === 'long' && isLight(look.top) && look.bottom !== look.top ? 'doctor' : 'kaftan'; if (outfit === 'doctor') { colours.coat = look.top; colours.top = 0xbcd3ea; colours.accent = 0x24364f; } break;
    case 'cassock': outfit = 'cassock'; colours.collar = isLight(look.top) ? 0x151517 : 0xf4f4f0; colours.button = isLight(look.top) ? 0xd8d4c8 : 0x25252a; break;
    case 'uniform': outfit = 'uniform'; colours.button = 0xc9a23a; break;
    case 'singlet': outfit = look.legs === 'shorts' ? 'singlet' : 'singlet-trousers'; break;
    case 'hivis': outfit = 'hivis'; colours.accent = look.top; colours.top = 0x44526a; colours.trim = 0xd9dde0; break;
    default: outfit = look.sleeves === 'long' ? 'shirt' : look.legs === 'shorts' ? 'shirt-shorts' : 'shirt-short';
  }
  if (look.topPattern && outfit !== 'blouse-wrapper') prints.print = PRINTS.ankara(look.topPattern.colours, look.topPattern.motif);
  let hat = null;
  if (look.hat && HAT_MAP[look.hat[0]]) {
    hat = HAT_MAP[look.hat[0]];
    colours.hat = look.hat[1];
    if (look.hat[0] === 'redcap') colours.hat2 = look.hat[1];
    if (hat === 'headtie' && prints.print && look.hat[1] === look.bottom) prints.hatprint = prints.print;
  }
  if (look.beard) extras.push('beard');
  return { ...base, outfit, hair: HAIR_MAP[look.hair] || (female ? 'braids' : 'low'), hairColour: look.hair === 'grey' ? HAIR_COLOURS.grey : undefined, hat, shoes, extras, prints, colours };
}

// How tall a config stands, as a share of a grown man.
export function heightOf(config) {
  const age = config.age === undefined ? 30 : config.age;
  const grown = age >= 18 ? 1 : age >= 13 ? 0.9 + (age - 13) * 0.02 : 0.56 + Math.max(0, age - 3) * 0.034;
  return (config.height || 1) * (config.gender === 'f' ? 0.945 : 1) * grown;
}

// ---------------------------------------------------- dressing a person --

const NATIVE_COLOURS = [0xe8e2d0, 0x8a8f96, 0xb5651d, 0x2f4f7f, 0xf3ecdc, 0x6e6a4e, 0x1f5c4d, 0x7b2d5b, 0x24364f, 0xc9b98a];
const PALE = [0xeef0ea, 0xf3ecdc, 0xbcd3ea, 0xe8e2d0, 0x9fb8a0, 0xd9d2bc];
const WRAP_PLAIN = [0xf3ecdc, 0xd9a441, 0xf2c200, 0xe9a6c0, 0x2e6f73, 0xffffff];
const OFFICE_JOBS = new Set(['teacher', 'headteacher', 'principal', 'lecturer', 'officer', 'librarian', 'records', 'clerk', 'labtech', 'schoolstaff']);
const UNIFORMED = new Set(['police', 'guard', 'nurse', 'doctor', 'pharmacist', 'labscientist', 'priest', 'vicar', 'pupil', 'student', 'cleaner']);

// What a person wears: the look their work gave them, then their age, their people and their own taste.
// `p` is the person (gender, age, job, people, index); `look` is the look already chosen for their work.
// Everything is drawn from the person's own number, so the same person always dresses the same.
export function wearFor(p, look) {
  const h = (k) => { const x = Math.sin((p.index + 1) * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
  const pick = (list, k) => list[Math.floor(h(k) * list.length) % list.length];
  const f = p.gender === 'f';
  const c = configFromLook({ ...look, wear: undefined, age: p.age });
  c.face = p.index * 7 + 3;
  c.build = 1;
  const b = look.build || 1;
  c.body = p.age < 16 ? 'slim' : b < 0.98 ? 'slim' : b < 1.07 ? 'average' : b < 1.13 ? 'sturdy' : 'heavy';
  if (p.age >= 35 && c.body === 'average' && h(1) < 0.3) c.body = 'sturdy';
  const job = p.job;
  const uniformed = UNIFORMED.has(job);
  const adult = p.age >= 18;
  c.extras = (c.extras || []).filter((e) => e !== 'beard');
  c.prints = { ...(c.prints || {}) };

  // --- hair ---
  if (f) c.hair = p.age < 13 ? pick(['cornrows', 'low', 'cornrows', 'puff'], 2) : p.age >= 60 ? pick(['low', 'cornrows', 'bun'], 2) : pick(['braids', 'cornrows', 'bun', 'puff', 'afro', 'low', 'braids', 'cornrows'], 2);
  else c.hair = p.age < 16 ? 'low' : p.age >= 58 ? pick(['low', 'receded', 'crown', 'crown', 'receded'], 2) : p.age >= 40 ? pick(['low', 'low', 'fade', 'receded'], 2) : pick(['low', 'fade', 'fade', 'low', 'hightop', 'afro'], 2);
  if (!f && p.age > 24 && !['priest', 'pupil', 'student'].includes(job)) { const r = h(3); if (r < 0.2) c.extras.push('beard'); else if (r < 0.3) c.extras.push('goatee'); }

  // --- by calling ---
  if (job === 'doctor' || job === 'pharmacist' || job === 'labscientist') { c.outfit = 'doctor'; c.colours = { coat: 0xf6f6f2, top: pick([0xbcd3ea, 0xe9eef4, 0xe9c8d6, 0xd6e6d2], 4), accent: pick([0x24364f, 0x7b2d2d, 0x1f5c4d], 5), bottom: pick([0x2a2f3a, 0x3a3f4b, 0x24364f], 6), metal: 0xb9bec4 }; if (job === 'doctor') c.extras.push('stethoscope'); c.shoes = 'shoes'; c.hat = null; }
  else if (job === 'nurse') { c.outfit = f ? 'nurse-dress' : 'nurse-tunic'; c.colours = { top: 0xf6f6f2, trim: 0x2f5fa8, button: 0x2f5fa8, bottom: 0x2f5fa8, shoe: 0xf2f2ee, sole: 0xcfd2d6, frame: 0x2f5fa8 }; c.extras.push('watch'); c.hat = null; if (f) c.hair = pick(['bun', 'cornrows', 'low'], 2); c.shoes = 'shoes'; }
  else if (job === 'priest' || job === 'vicar') { c.outfit = 'cassock'; c.hat = null; c.shoes = 'shoes'; if (job === 'vicar') c.extras.push('sash'); }
  else if (job === 'pupil') { c.outfit = f ? 'gown' : 'shirt-shorts'; c.colours = f ? { top: 0x2f6f4f, trim: 0xf4f4f0 } : { top: 0xf4f4f0, bottom: 0x2f6f4f }; c.shoes = 'sandals'; c.prints = {}; }
  else if (job === 'student') { c.outfit = f ? 'shirt-skirt' : 'shirt-short'; c.colours = { top: 0xf4f4f0, bottom: 0x24364f }; c.shoes = 'shoes'; c.prints = {}; }
  else if (job === 'infant') { c.outfit = f ? 'gown' : 'tee-shorts'; c.shoes = 'sandals'; c.prints = f && h(7) < 0.5 ? { print: pick(ANKARA, 8) } : {}; }

  // --- people and age: native wear where it would be worn ---
  // (the Anioma, Ika and Ukwuani peoples wear what Igbo people wear: DRESS_OF)
  const people = DRESS_OF[p.people] || p.people;
  if (!uniformed && adult) {
    const elder = p.age >= 55;
    const trade = ['trader', 'foodvendor', 'hawker', 'homemaker', 'retiree', 'farmer'].includes(job);
    const office = OFFICE_JOBS.has(job);
    if (f) {
      const native = trade ? 0.9 : office ? 0.3 : elder ? 0.9 : 0.35;
      if (people === 'hausa') { c.outfit = 'long-dress'; c.hat = 'hijab'; c.colours = { top: pick([0x5b3a8a, 0x2f4f7f, 0x1f5c4d, 0x8a2f2f, 0x2e6f73, 0x44352a], 9), trim: 0xd9a441, hat: pick([0xe9a6c0, 0x2a2440, 0xf3ecdc, 0x1f5c4d, 0x8a8f96], 10) }; c.prints = h(11) < 0.4 ? { print: pick(ANKARA, 12) } : {}; }
      else if (h(13) < native) {
        const cloth = look.pattern ? PRINTS.ankara(look.pattern.colours, look.pattern.motif) : pick(ANKARA, 12);
        const ground = cloth.colours[0];
        c.prints = { print: cloth };
        if (people === 'yoruba') { c.outfit = h(14) < 0.7 ? 'iro-buba' : 'boubou'; c.hat = h(15) < (elder ? 0.6 : 0.3) ? 'gele' : h(15) < 0.85 ? 'headtie' : null; if (c.hat === 'gele') { c.prints.hatprint = PRINTS.asooke([pick([0x7b2d5b, 0xb5651d, 0x1d3f73, 0x2e6f73], 16), 0xd9a441, 0xf3ecdc]); if (h(17) < 0.5) c.extras.push('shouldercloth'); } else if (c.hat) c.prints.hatprint = cloth; c.colours = { top: ground, bottom: ground, hat: ground }; }
        else if (people === 'igbo' || people === 'igala' || people === 'edo' || people === 'delta') { c.outfit = h(14) < (elder ? 0.6 : 0.35) ? 'double-wrapper' : h(14) < 0.9 ? 'blouse-wrapper' : 'boubou'; if (c.outfit === 'double-wrapper' && h(18) < 0.4) c.prints.print = PRINTS.george([ground, 0xd9a441, cloth.colours[2] || 0xf2c200]); c.hat = h(15) < 0.72 ? (h(19) < 0.75 ? 'headtie' : 'scarf') : null; if (c.hat) c.prints.hatprint = h(20) < 0.6 ? c.prints.print : null; c.colours = { top: pick([...WRAP_PLAIN, cloth.colours[1]], 21), trim: cloth.colours[1], bottom: ground, hat: pick([ground, cloth.colours[1], 0x7b2d5b, 0x1f5c4d], 22) }; if (!c.prints.hatprint) delete c.prints.hatprint; }
        else { c.outfit = pick(['blouse-wrapper', 'blouse-wrapper', 'boubou', 'gown'], 14); c.hat = h(15) < 0.6 ? pick(['headtie', 'scarf'], 19) : null; c.colours = { top: pick([...WRAP_PLAIN, cloth.colours[1]], 21), trim: cloth.colours[1], bottom: ground, hat: ground }; if (c.hat) c.prints.hatprint = cloth; }
        if (c.outfit !== 'gown' && h(23) < 0.3) c.extras.push('beads');
      } else if (office) { c.outfit = pick(['shirt-skirt', 'gown', 'skirt-blouse', 'shirt-skirt'], 14); c.prints = {}; c.colours = { top: pick([0xf3ecdc, 0xe9eef4, 0xe9c8d6, 0xbcd3ea, look.top], 21), bottom: pick([0x24364f, 0x2a2a2a, 0x44352a, 0x5a1f47], 22), trim: look.bottom }; c.shoes = 'shoes'; c.hat = null; }
      else { c.outfit = pick(['gown', 'tee', 'skirt-blouse', 'gown', 'tee'], 14); c.hat = null; if (c.outfit === 'gown' && h(24) < 0.45) c.prints = { print: pick(ANKARA, 12) }; else c.prints = {}; c.colours = { top: look.top, bottom: c.outfit === 'tee' ? pick([0x2c3a5a, 0x1d2233, 0x2a2a2a, 0x3a3f4b], 22) : look.bottom, trim: look.bottom }; }
      // in the fields a plain wrapper, whatever is kept for best
      if (job === 'farmer' && ['boubou', 'double-wrapper', 'iro-buba'].includes(c.outfit)) { c.outfit = 'blouse-wrapper'; if (c.hat === 'gele') c.hat = 'scarf'; c.extras = c.extras.filter((e) => e !== 'shouldercloth' && e !== 'beads'); if (!c.prints.print) c.prints.print = pick(ANKARA, 12); }
      if (job === 'foodvendor' ? h(25) < 0.7 : job === 'trader' || job === 'hawker' ? h(25) < 0.22 : false) { c.extras.push('apron'); c.colours.apron = pick([0xe7e1d2, 0x2e6f73, 0x8a2f2f, 0x2f4f7f, 0xd9a441], 26); }
      if (h(27) < 0.28) c.extras.push('bangles');
      if ((office || job === 'undergrad') && h(28) < 0.3) { c.extras.push('handbag'); c.colours.extra = pick([0x5a3324, 0x1b1b1e, 0x6b2d3a, 0x2e6f73], 29); }
    } else {
      const manual = ['farmer', 'fisher', 'mechanic', 'welder', 'carpenter', 'labourer', 'okada', 'driver', 'baker'].includes(job);
      const native = manual ? 0 : office ? 0.25 : elder ? 0.85 : job === 'trader' || job === 'retiree' ? 0.5 : 0.18;
      // nobody does a day's manual work in a kaftan
      const worked = manual && (look.outfit === undefined || look.outfit === 'kaftan');
      if (manual && c.hat === 'hula') c.hat = null;
      if (people === 'hausa' && !manual) { c.outfit = h(14) < (elder ? 0.5 : 0.2) ? 'babanriga' : 'kaftan'; c.hat = 'hula'; const col = pick(PALE, 9); c.colours = { top: col, trim: pick([0xc9b98a, 0x8a8f96, 0x2f4f7f], 10), hat: pick([0xf3ecdc, 0x1b1b1e, 0x7a2f22, 0x2f4f7f], 16), hat2: pick([0x2f4f7f, 0xb8860b, 0x7a2f22], 17) }; c.prints = { hatprint: PRINTS.hula([c.colours.hat, c.colours.hat2, 0xb8860b]) }; c.shoes = 'sandals'; }
      else if (h(13) < native) {
        c.prints = {};
        if (people === 'yoruba') { const col = pick([0x1d3f73, 0x7b2d5b, 0x1f5c4d, 0xb5651d, 0x44352a], 9); const cloth = PRINTS.asooke([col, pick([0x2f5fa8, 0xd9a441, 0xf3ecdc], 10), 0xd9c36a]); c.outfit = elder && h(14) < 0.45 ? 'agbada' : h(14) < 0.75 ? 'buba-sokoto' : 'senator'; c.hat = h(15) < 0.75 ? 'fila' : null; c.colours = { top: col, trim: 0xd9c36a, hat: col }; if (c.outfit !== 'senator') c.prints.print = h(18) < 0.6 ? cloth : null; if (!c.prints.print) delete c.prints.print; if (c.hat) c.prints.hatprint = cloth; }
        else if (people === 'igbo') { const r = h(14); c.outfit = r < (elder ? 0.35 : 0.15) ? 'isiagu' : r < 0.85 ? 'senator' : 'kaftan'; if (c.outfit === 'isiagu') { const ground = pick([0x8a1616, 0x141416, 0x1d2a5c], 9); c.prints.print = PRINTS.isiagu(ground); c.colours = { top: ground, accent: 0xd9a441, bottom: 0x141416 }; c.hat = h(15) < 0.6 ? (h(16) < 0.5 ? 'knit' : 'hula') : null; if (c.hat === 'knit') { c.prints.hatprint = PRINTS.knit(); c.colours.hat = 0xa01c1c; c.colours.hat2 = 0xf3ecdc; } else if (c.hat) { c.colours.hat = 0xa01c1c; c.colours.hat2 = 0xa01c1c; } if (h(23) < 0.5) c.extras.push('beads'); } else { c.colours = { top: pick(NATIVE_COLOURS, 9), trim: 0xc9b98a }; c.hat = elder && h(15) < 0.3 ? 'hula' : null; if (c.hat) { c.colours.hat = pick([0xa01c1c, 0x1b1b1e, 0x2f4f7f], 16); c.colours.hat2 = c.colours.hat; } } }
        else { c.outfit = h(14) < 0.7 ? 'senator' : 'kaftan'; c.colours = { top: pick(NATIVE_COLOURS, 9), trim: 0xc9b98a }; c.hat = null; }
        c.shoes = c.outfit === 'kaftan' ? 'sandals' : 'shoes';
      } else if (office) { c.outfit = h(14) < 0.55 ? 'shirt' : 'shirt-short'; c.colours = { top: pick([0xe9eef4, 0xf3ecdc, 0xbcd3ea, 0xd6e6d2, look.top], 21), bottom: pick([0x24364f, 0x2a2a2a, 0x3a3f4b, 0x44352a], 22) }; c.shoes = 'shoes'; c.hat = null; if (c.outfit === 'shirt' && h(30) < 0.35) { c.extras.push('tie'); c.colours.accent = pick([0x7b2d2d, 0x24364f, 0x1f5c4d, 0x44352a], 31); } }
      else if (!manual && look.outfit === undefined) { c.outfit = pick(['tee', 'polo', 'shirt-short', 'tee', 'tee-shorts'], 14); c.colours = { top: look.top, trim: pick([0xe8e2d0, look.top], 21), bottom: pick([0x2c3a5a, 0x1d2233, 0x2a2a2a, 0x3a3f4b, 0x4a4a3a], 22) }; if (c.outfit === 'tee') { c.colours.shoe = pick([0xf3f3f0, 0x1f1b18, 0x8a2f2f, 0x2f4f7f], 32); c.colours.sole = 0xd9d9d4; } }
      else if (worked) { c.outfit = pick(look.legs === 'shorts' ? ['tee-shorts', 'singlet'] : ['tee', 'tee', 'polo', 'singlet-trousers'], 14); c.prints = {}; c.colours = { top: look.outfit === 'kaftan' ? pick([0x3a3f4b, 0x8a2f2f, 0x2f4f7f, 0x5a5346], 21) : look.top, bottom: look.outfit === 'kaftan' ? 0x2a2a2a : look.bottom, shoe: look.shoeColour, hat: c.colours.hat }; if (job === 'farmer' || job === 'fisher') c.shoes = 'slippers'; }
      if (h(33) < 0.22 && !manual) { c.extras.push('watch'); }
    }
  } else if (!uniformed && p.age >= 6 && p.age < 18) {
    // the young: play clothes
    c.hat = c.hat === 'hijab' ? 'hijab' : null;
    if (people === 'hausa' && f) { c.outfit = 'long-dress'; c.hat = 'hijab'; c.colours = { top: look.top, trim: 0xd9a441, hat: pick([0xe9a6c0, 0xf3ecdc, 0x9fb8d6], 10) }; c.prints = {}; }
    else if (f) { c.outfit = pick(['gown', 'gown', 'tee', 'skirt-blouse'], 14); c.prints = c.outfit === 'gown' && h(24) < 0.5 ? { print: pick(ANKARA, 12) } : {}; c.colours = { top: look.top, bottom: pick([0x2c3a5a, 0x7b2d5b, 0x2a2a2a], 22), trim: look.bottom }; }
    else { c.outfit = pick(['tee-shorts', 'tee', 'tee-shorts', 'polo'], 14); c.prints = {}; c.colours = { top: look.top, bottom: pick([0x2c3a5a, 0x1d2233, 0x4a4a3a, 0x5a5346], 22) }; }
    c.shoes = h(34) < 0.6 ? 'sandals' : 'slippers';
  }
  if (!c.shoes && h(35) < 0.25 && !f && OUTFITS[c.outfit].feet === 'shoes') c.shoes = 'sandals';
  c.animations = job === 'trader' || job === 'hawker' || job === 'foodvendor' ? 'trader' : ['priest', 'vicar', 'catechist'].includes(job) ? 'clergy' : ['doctor', 'nurse', 'pharmacist'].includes(job) ? 'health' : ['okada', 'driver'].includes(job) ? 'driver' : ['farmer', 'fisher', 'mechanic', 'welder', 'carpenter', 'labourer', 'cleaner'].includes(job) ? 'worker' : 'everyday';
  c.occupation = job;
  c.culture = people;
  // the look already carries these
  delete c.gender; delete c.age; delete c.skin; delete c.height;
  return c;
}

// The few colours and shapes that stand for a config when it is too far away to draw properly.
export function figFor(config) {
  const outfit = OUTFITS[config.outfit] || OUTFITS.tee;
  const colours = config.colours || {};
  const print = (config.prints || {}).print;
  const role = (r) => colourOf(r, colours);
  const first = outfit.parts[0];
  const second = outfit.parts[1];
  const long = ['kaftan', 'agbada', 'babanriga', 'cassock', 'vestments', 'long-dress', 'boubou', 'gown', 'nurse-dress', 'doctor'].includes(config.outfit);
  const wrapped = ['blouse-wrapper', 'double-wrapper', 'iro-buba', 'shirt-skirt', 'skirt-blouse'].includes(config.outfit);
  const printed = (part) => (part && part.prints && part.prints.a === 'print' && print ? print.colours[0] : null);
  const top = printed(first) || role((first.colours && first.colours.a) || 'top');
  const lower = long ? top : printed(second) || role((second && second.colours && second.colours.a) || 'bottom');
  const skinArms = (outfit.skin || []).some((s) => s === 'body.arms' || s === 'body.arms.lower');
  const skinLegs = (outfit.skin || []).some((s) => s === 'body.legs' || s === 'body.legs.lower');
  const hatCode = config.hat ? ({ headtie: 2, gele: 2, scarf: 2, hijab: 2, helmet: 3, straw: 4 }[config.hat] || 1) : 0;
  const age = config.age === undefined ? 30 : config.age;
  const type = BODY_TYPES[config.body] || BODY_TYPES.average;
  return {
    skin: config.skin, arm: skinArms ? config.skin : top, top, bottom: lower, legs: skinLegs ? config.skin : long || wrapped ? lower : lower,
    hair: config.hat ? role('hat') : age >= 56 ? HAIR_COLOURS.grey : 0x15110f, hat: hatCode, skirt: long ? (['gown', 'nurse-dress', 'doctor'].includes(config.outfit) ? 1 : 2) : wrapped ? 2 : 0,
    scale: heightOf(config) * 1.02, wide: type.wide,
  };
}

// ------------------------------------------------------------ prototypes --

const ANKARA = [
  PRINTS.ankara([0x14402f, 0xd9a441, 0xf3ecdc], 'leaves'), PRINTS.ankara([0x6b2d3a, 0xd9a441, 0xf3ecdc], 'rings'), PRINTS.ankara([0x5a1f47, 0x2e9fa3, 0xf2c200], 'diamonds'),
  PRINTS.ankara([0x1f3f7a, 0xf2c200, 0xf3ecdc], 'fans'), PRINTS.ankara([0x8a1f1f, 0xf3ecdc, 0x1b1b1e], 'leaves'), PRINTS.ankara([0x2e6f73, 0xf5c518, 0x7b2d5b], 'rings'),
  PRINTS.ankara([0xc7571d, 0x1d2a5c, 0xf3ecdc], 'fans'), PRINTS.ankara([0x5b3a8a, 0xe9a6c0, 0xf3ecdc], 'diamonds'),
];
export const ANKARA_PRINTS = ANKARA;

// The first characters built on the base model: one of each kind asked for.
export const PROTOTYPES = [
  { id: 'player', name: 'Base character', note: 'as supplied: the player', config: { gender: 'm', age: 27, outfit: 'streetwear', skin: 0x76533a, hair: 'none', hat: 'cap', extras: ['basebeard', 'glasses', 'headphones'], colours: { top: 0xc6ceb7, accent: 0x4aa814, accent2: 0x46952b, bottom: 0x080c15, trim: 0xecefe8, shoe: 0xb20308, sole: 0xb31d27, hat: 0x040507, hat2: 0xabafa6, frame: 0x040507, lens: 0x1c2128, extra: 0xecefe8 }, hairColour: 0x2e2723 } },
  { id: 'man', name: 'Man', note: 'polo and trousers', config: { gender: 'm', age: 31, outfit: 'polo', skin: 0x5a3620, hair: 'fade', body: 'average', face: 3, extras: ['watch'], colours: { top: 0x2d5f73, trim: 0xe8e2d0, bottom: 0x3a3f4b, shoe: 0x3b2a1e } } },
  { id: 'woman', name: 'Woman', note: 'dress', config: { gender: 'f', age: 26, outfit: 'gown', skin: 0x6b4226, hair: 'braids', body: 'slim', face: 8, extras: ['handbag', 'bangles'], colours: { top: 0xd9a441, trim: 0x6b2d3a, shoe: 0x6b2d3a, sole: 0x2b211a, extra: 0x6b2d3a } } },
  { id: 'market-woman', name: 'Market woman', note: 'blouse, two wrappers, head tie', config: { gender: 'f', age: 46, outfit: 'double-wrapper', skin: 0x4f3019, hair: 'low', hat: 'headtie', body: 'sturdy', face: 12, extras: ['apron', 'beads'], prints: { print: ANKARA[1], hatprint: ANKARA[1] }, colours: { top: 0xf3ecdc, trim: 0xd9a441, hat: 0x6b2d3a, beads: 0xd9a441, apron: 0xd8d2c0, shoe: 0x3b2a1e, sole: 0x2b211a } } },
  { id: 'doctor', name: 'Doctor', note: 'white coat, shirt and tie', config: { gender: 'm', age: 44, outfit: 'doctor', skin: 0x5e3b24, hair: 'low', body: 'average', face: 17, extras: ['stethoscope', 'goatee', 'watch'], colours: { coat: 0xf6f6f2, top: 0xbcd3ea, accent: 0x24364f, bottom: 0x2a2f3a, shoe: 0x17130f, button: 0xdad6c8, frame: 0x15151a, lens: 0x4d5a66, metal: 0xb9bec4 } } },
  { id: 'nurse', name: 'Nurse', note: 'white and blue uniform', config: { gender: 'f', age: 33, outfit: 'nurse-dress', skin: 0x70482c, hair: 'bun', body: 'average', face: 21, extras: ['watch'], colours: { top: 0xf6f6f2, trim: 0x2f5fa8, button: 0x2f5fa8, shoe: 0xf2f2ee, sole: 0xcfd2d6, frame: 0x2f5fa8 } } },
  { id: 'priest', name: 'Rev. Father', note: 'cassock and clerical collar', config: { gender: 'm', age: 52, outfit: 'cassock', skin: 0x4a2c17, hair: 'receded', body: 'average', face: 26, extras: ['sash'], colours: { top: 0x151517, collar: 0xf6f6f2, button: 0x25252a, sash: 0x151517, shoe: 0x0f0d0c, frame: 0x2a2014, lens: 0x4d5a66 } } },
  { id: 'igbo', name: 'Igbo man', note: 'isi agu, cap and beads', config: { gender: 'm', age: 58, outfit: 'isiagu', skin: 0x5a3620, hair: 'low', hat: 'knit', body: 'sturdy', face: 31, extras: ['beads'], prints: { print: PRINTS.isiagu(0x8a1616), hatprint: PRINTS.knit() }, colours: { top: 0x8a1616, accent: 0xd9a441, bottom: 0x141416, hat: 0xa01c1c, hat2: 0xf3ecdc, beads: 0xc8402a, shoe: 0x17130f } } },
  { id: 'yoruba', name: 'Yoruba man', note: 'agbada and fila', config: { gender: 'm', age: 49, outfit: 'agbada', skin: 0x4f3019, hair: 'low', hat: 'fila', body: 'sturdy', face: 36, prints: { print: PRINTS.asooke([0x1d3f73, 0x2f5fa8, 0xd9c36a]), hatprint: PRINTS.asooke([0x1d3f73, 0x2f5fa8, 0xd9c36a]) }, colours: { top: 0x1d3f73, trim: 0xd9c36a, hat: 0x1d3f73, shoe: 0x17130f } } },
  { id: 'hausa', name: 'Hausa man', note: 'babban riga and cap', config: { gender: 'm', age: 41, outfit: 'babanriga', skin: 0x6b4226, hair: 'low', hat: 'hula', body: 'slim', face: 41, extras: ['beard'], prints: { hatprint: PRINTS.hula() }, colours: { top: 0xeef0ea, trim: 0xc9b98a, hat: 0xf3ecdc, hat2: 0x2f4f7f, shoe: 0x4a3524, sole: 0x2b211a } } },
  { id: 'urban', name: 'Young woman', note: 'T-shirt, jeans and trainers', config: { gender: 'f', age: 22, outfit: 'tee', skin: 0x7a4a2b, hair: 'puff', body: 'slim', face: 46, extras: ['headphones', 'bangles'], colours: { top: 0xe9a6c0, trim: 0xf3ecdc, bottom: 0x2c3a5a, shoe: 0xf3f3f0, sole: 0xd9d9d4, extra: 0x1b1b1e, frame: 0x1b1b1e } } },
];

// More of each, to show that no two need look alike.
export const VARIATIONS = {
  'market women': [
    { name: 'Market woman A', config: { gender: 'f', age: 46, outfit: 'double-wrapper', skin: 0x4f3019, hat: 'headtie', body: 'sturdy', face: 12, extras: ['apron', 'beads'], prints: { print: ANKARA[1], hatprint: ANKARA[1] }, colours: { top: 0xf3ecdc, trim: 0xd9a441, beads: 0xd9a441 } } },
    { name: 'Market woman B', config: { gender: 'f', age: 34, outfit: 'blouse-wrapper', skin: 0x6b4226, hat: 'scarf', body: 'average', face: 52, extras: ['bangles'], prints: { print: ANKARA[3] }, colours: { top: 0xf2c200, trim: 0x1f3f7a, hat: 0x1f3f7a } } },
    { name: 'Market woman C', config: { gender: 'f', age: 61, outfit: 'boubou', skin: 0x3b2415, hat: 'headtie', body: 'heavy', face: 57, extras: ['beads'], prints: { print: PRINTS.adire(), hatprint: PRINTS.adire() }, colours: { top: 0x1d2a5c, trim: 0xdfe6f2, beads: 0xc8402a } } },
    { name: 'Market woman D', config: { gender: 'f', age: 27, outfit: 'gown', skin: 0x7a4a2b, hair: 'cornrows', body: 'slim', face: 63, extras: ['apron'], prints: { print: ANKARA[6] }, colours: { top: 0xc7571d, trim: 0x1d2a5c, apron: 0x2e6f73 } } },
    { name: 'Market woman E', config: { gender: 'f', age: 52, outfit: 'iro-buba', skin: 0x5a3620, hat: 'gele', body: 'sturdy', face: 68, extras: ['shouldercloth'], prints: { print: ANKARA[5], hatprint: PRINTS.asooke([0x7b2d5b, 0xd9a441, 0xf3ecdc]) }, colours: { top: 0x2e6f73, hat: 0x7b2d5b } } },
    { name: 'Market woman F', config: { gender: 'f', age: 39, outfit: 'long-dress', skin: 0x6b4226, hat: 'hijab', body: 'average', face: 71, colours: { top: 0x5b3a8a, trim: 0xd9a441, hat: 0x2a2440 } } },
  ],
  men: [
    { name: 'Driver', config: { gender: 'm', age: 32, outfit: 'tee', skin: 0x4a2c17, hair: 'fade', hat: 'cap', body: 'average', face: 74, colours: { top: 0x8a2f2f, bottom: 0x2c3a5a, hat: 0x1b1b1e, hat2: 0x8a8f96, shoe: 0xe8e8e2, sole: 0xbfbfb8 } } },
    { name: 'Office worker', config: { gender: 'm', age: 38, outfit: 'shirt', skin: 0x6b4226, hair: 'low', body: 'slim', face: 77, extras: ['tie', 'belt', 'glasses', 'watch'], colours: { top: 0xe9eef4, accent: 0x7b2d2d, bottom: 0x24364f, lens: 0x4d5a66 } } },
    { name: 'Farmer', config: { gender: 'm', age: 47, outfit: 'singlet', skin: 0x3b2415, hair: 'low', hat: 'straw', body: 'slim', face: 80, colours: { top: 0xe8e2d0, bottom: 0x5a5346, hat: 0xc9b183 } } },
    { name: 'Elder', config: { gender: 'm', age: 72, outfit: 'senator', skin: 0x4f3019, hair: 'crown', hat: 'hula', body: 'average', face: 83, colours: { top: 0x6e6a4e, trim: 0xc9b98a, hat: 0xa01c1c, hat2: 0xa01c1c } } },
    { name: 'Mechanic', config: { gender: 'm', age: 29, outfit: 'singlet-trousers', skin: 0x5a3620, hair: 'hightop', body: 'sturdy', face: 86, colours: { top: 0x3a3f4b, bottom: 0x2a2a2a, shoe: 0x4a3524 } } },
    { name: 'Builder', config: { gender: 'm', age: 35, outfit: 'hivis', skin: 0x4a2c17, hair: 'low', hat: 'helmet', body: 'sturdy', face: 89, colours: { top: 0x44526a, accent: 0xf2c200, trim: 0xd9dde0, bottom: 0x3a3324, hat: 0xf2c200, shoe: 0x4a3524 } } },
    { name: 'Policeman', config: { gender: 'm', age: 40, outfit: 'uniform', skin: 0x5e3b24, hair: 'low', hat: 'beret', body: 'average', face: 92, colours: { top: 0x1d2233, bottom: 0x1d2233, hat: 0x10182a, belt: 0x0e0e10, button: 0xc9a23a } } },
    { name: 'Schoolboy', config: { gender: 'm', age: 9, outfit: 'shirt-shorts', skin: 0x6b4226, hair: 'low', body: 'slim', face: 95, colours: { top: 0xf4f4f0, bottom: 0x2f6f4f } } },
  ],
  women: [
    { name: 'Igbo woman', config: { gender: 'f', age: 50, outfit: 'double-wrapper', skin: 0x5a3620, hat: 'headtie', body: 'sturdy', face: 101, extras: ['beads', 'bangles'], prints: { print: PRINTS.george([0x5a1f47, 0xd9a441, 0xf2c200]), hatprint: PRINTS.george([0x5a1f47, 0xd9a441, 0xf2c200]) }, colours: { top: 0xf3ecdc, trim: 0xd9a441, beads: 0xc8402a } } },
    { name: 'Yoruba woman', config: { gender: 'f', age: 44, outfit: 'iro-buba', skin: 0x6b4226, hat: 'gele', body: 'average', face: 104, extras: ['shouldercloth', 'beads'], prints: { print: PRINTS.lace([0x2e6f73, 0xe8f1ee]), hatprint: PRINTS.asooke([0xb5651d, 0xd9a441, 0xf3ecdc]) }, colours: { top: 0x2e6f73, hat: 0xb5651d, beads: 0xd9a441 } } },
    { name: 'Hausa woman', config: { gender: 'f', age: 30, outfit: 'long-dress', skin: 0x7a4a2b, hat: 'hijab', body: 'slim', face: 107, prints: { print: ANKARA[7] }, colours: { top: 0x5b3a8a, trim: 0xe9a6c0, hat: 0xe9a6c0 } } },
    { name: 'Teacher', config: { gender: 'f', age: 36, outfit: 'shirt-skirt', skin: 0x5e3b24, hair: 'bun', body: 'average', face: 110, extras: ['glasses', 'watch'], colours: { top: 0xf3ecdc, bottom: 0x24364f, lens: 0x4d5a66 } } },
    { name: 'Doctor', config: { gender: 'f', age: 39, outfit: 'doctor', skin: 0x70482c, hair: 'cornrows', body: 'slim', face: 113, extras: ['stethoscope'], colours: { coat: 0xf6f6f2, top: 0xe9c8d6, accent: 0xe9c8d6, bottom: 0x2a2f3a, metal: 0xb9bec4 } } },
    { name: 'Nurse (male)', config: { gender: 'm', age: 29, outfit: 'nurse-tunic', skin: 0x4f3019, hair: 'fade', body: 'average', face: 116, extras: ['watch'], colours: { top: 0xf6f6f2, trim: 0x2f5fa8, bottom: 0x2f5fa8, shoe: 0xf2f2ee, sole: 0xcfd2d6 } } },
    { name: 'Student', config: { gender: 'f', age: 19, outfit: 'tee', skin: 0x8a5a36, hair: 'afro', body: 'slim', face: 119, colours: { top: 0x1f5c4d, bottom: 0x2c3a5a, shoe: 0xf3f3f0, sole: 0xd9d9d4 } } },
    { name: 'Schoolgirl', config: { gender: 'f', age: 8, outfit: 'gown', skin: 0x5a3620, hair: 'cornrows', body: 'slim', face: 122, colours: { top: 0x2f6f4f, trim: 0xf4f4f0 } } },
  ],
  clergy: [
    { name: 'Rev. Father', config: PROTOTYPE_PRIEST() },
    { name: 'At Mass', config: { ...PROTOTYPE_PRIEST(), outfit: 'vestments', extras: [], colours: { ...PROTOTYPE_PRIEST().colours, top: 0xf2efe6, accent: 0x2f6f3a, accent2: 0xd9a441 } } },
    { name: 'Young curate', config: { gender: 'm', age: 31, outfit: 'cassock', skin: 0x6b4226, hair: 'low', body: 'slim', face: 131, colours: { top: 0xf2efe6, collar: 0x151517, button: 0xdcd8cc, shoe: 0x0f0d0c } } },
    { name: 'Monsignor', config: { gender: 'm', age: 71, outfit: 'cassock', skin: 0x3b2415, hair: 'crown', body: 'heavy', face: 134, extras: ['sash', 'glasses'], colours: { top: 0x151517, collar: 0xf6f6f2, button: 0x7a1f4a, sash: 0x7a1f4a, lens: 0x4d5a66, frame: 0xc9a23a } } },
  ],
};
function PROTOTYPE_PRIEST() { return { gender: 'm', age: 52, outfit: 'cassock', skin: 0x4a2c17, hair: 'receded', body: 'average', face: 26, extras: ['sash'], colours: { top: 0x151517, collar: 0xf6f6f2, button: 0x25252a, sash: 0x151517, shoe: 0x0f0d0c, frame: 0x2a2014, lens: 0x4d5a66 } }; }

// Every kit part a config could ask for, so a test can check the kit has them all.
export function partsUsed() {
  const out = new Set(['base.head', 'base.hands']);
  for (const o of Object.values(OUTFITS)) { for (const p of o.parts) out.add(p.id); for (const s of o.skin || []) out.add(s); }
  for (const list of Object.values(FOOTWEAR)) for (const p of list) out.add(p.id);
  for (const list of Object.values(HAIR)) for (const id of list) out.add(id);
  for (const h of Object.values(HEADWEAR)) for (const p of h.parts) out.add(p.id);
  for (const list of Object.values(EXTRAS)) for (const p of list) out.add(p.id);
  out.add('body.legs.ankle');
  return [...out];
}
