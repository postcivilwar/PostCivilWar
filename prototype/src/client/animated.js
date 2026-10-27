// A character that comes with its own skeleton and its own animations: the owner's supplied GLB, drawn as it
// is (src/client/glb.js). It does not use the game's skeleton or its walk; it plays what the file has.
//
// The figure made here has the same handles as one from character.js (a group to place, a body to lay down,
// a name label, a shadow), so the town can carry it like anyone else. The arm and leg handles are there so
// that nothing that writes to them breaks; this figure does not read them.
//
// The file is large, so it is fetched once, beside the page, and shared by every figure made from it. Until it
// has arrived a figure is an empty place in the world (the character screen shows its picture meanwhile: creator.js).
// On the website what is fetched is the figure's light copy (tools/characters/light.py: the same figure, a tenth of the
// size, its pictures at the size a phone or a computer draws them), read on the page's worker (figure-worker.js).

import { parseGLB, parsedParts, modelFromGLB, figureLabels, boneName } from './glb.js';
import { splitGLB } from './glb-read.js';
import { gunzip } from './inflate.js';
import { nameTexture, surface } from './render-kit.js';
import { softShadowPicture, FIGURE_PATCH } from './soft-patch.js';
import { SEAT_POSE } from './seat-pose.js';
import { borrowedFor, seatFor, loadMoves } from './figure-moves.js';
import { pictureSize } from './budget.js';
import { carryFalls, createFallDriver, FALL_BONES } from './falls.js';
import { dressPolice, undressPolice } from './police-dress.js';
import { NPC_FIGURES } from '../sim/npc-figures.js';

// Which supplied animated figures there are, where each file is, and how tall a person it is. The files are
// made one unit tall; they are drawn at a person's height, the same all over, nothing else changed.
// `still` is what plays when the figure stands in town; `walk`, `run` and `swim` what plays as it goes. A name
// beginning with ~ is a movement the file itself does not have, borrowed from another supplied figure and played
// on this one's own bones (figure-moves.js; tools/characters/borrow.mjs says how).
// `rig` is how the file names its bones: 'ue' (pelvis, hand_r) or 'mixamo' (mixamorig:Hips, mixamorig:RightHand).
// `react` names, for each thing that can happen to the figure, which of its own clips shows it, best first:
//   hit    a blow lands on it                      fall   knocked off its feet (the first that goes all the way down)
//   punch  it throws a punch      heavy  a heavy one      kick  it kicks      call  it talks on the phone
// A figure with no clip for one of these is moved by hand instead (a flinch, an arm thrown out, laid down flat).
// How each of the town's people walks (npc-figures.js, WALKS: his words), and how fast each walk and run of each family
// goes over the ground played as it was made (metres a second, for a figure 1.7 m tall: measured from how fast the
// planted foot goes back under the body, tools/npcs/strides.mjs, 27 October 2026), so that the feet do not slide: a
// figure going faster or slower plays it faster or slower
const TOWN_WALK = { elegant: '~stroll', catwalk: '~catwalk', bold: '~bold' };
const STRIDES = Object.freeze({
  P1: { '~stroll': 1.12, '~catwalk': 1.23, '~bold': 1.16, '~walk': 1.12, '~run': 3.35 },
  P2: { '~stroll': 1.09, '~catwalk': 1.09, '~bold': 1.12, 'walk.001': 1.09, '~run': 3.31 },
  N8: { '~stroll': 1.11, '~catwalk': 1.21, '~bold': 1.14, '~walk': 1.11, '~run': 3.33 },
  N12: { '~stroll': 1.1, '~catwalk': 1.19, '~bold': 1.13, '~walk': 1.1, '~run': 3.26 },
  N20: { '~stroll': 1.17, '~catwalk': 1.3, '~bold': 1.22, '~walk': 1.17, '~run': 3.53 },
});
const TOWN_REACT = Object.freeze({ hit: ['~hit'], fall: ['~tumble', '~down'], punch: ['~punch', '~punch2'], heavy: ['~heavy'], kick: ['~kick'], call: ['~phone'] });
// the moods the town's people show now and then (the brief: "dancing, looking tired, stretching, talking with their
// hands, looking at the phone"), and frightened
export const TOWN_MOODS = Object.freeze(['~dance', '~tired', '~stretch', '~talk', '~phone', '~look', '~laugh', '~wave']);
export const ANIMATED = Object.freeze({
  W1: Object.freeze({ id: 'W1', file: 'woman.glb', text: 'woman.b64.txt', inline: '__PCW_WOMAN_B64', height: 1.70, rig: 'ue', walk: 'walk.001', run: 'run.001', still: 'agree.001', swim: 'swim.001', jump: 'jump_down.001', stairs: 'run_upstairs.001', walkSpeed: 1.3, runSpeed: 4.4,
    react: Object.freeze({ hit: [], fall: ['fall.001', 'defeat_03.001'], punch: ['box_01.001', 'box_02.001'], heavy: ['box_03.001'], kick: ['front_kick_02.001', 'front_kick_01.001'], call: ['make_a_call_02.001'] }) }),
  M1: Object.freeze({ id: 'M1', file: 'man.glb', moves: 'muscular_male.glb', text: 'man.b64.txt', inline: '__PCW_MAN_B64', height: 1.80, rig: 'ue', walk: 'walk.001', run: 'run.001', still: 'agree.001', swim: 'swim.001', jump: '~leap', stairs: '~stairs', walkSpeed: 1.35, runSpeed: 4.6,
    react: Object.freeze({ hit: ['hit_to_head.001'], fall: [], punch: [], heavy: [], kick: ['front_kick_02.001', 'front_kick_01.001'], call: ['make_a_call_01.001', 'make_a_call_02.001'] }) }),
  W2: Object.freeze({ id: 'W2', file: 'athlete.glb', text: 'athlete.b64.txt', inline: '__PCW_ATHLETE_B64', height: 1.72, rig: 'ue', walk: 'walk.001', run: 'run.001', still: '~idle', swim: 'swim.001', jump: '~leap', stairs: '~stairs', walkSpeed: 1.3, runSpeed: 4.6,
    react: Object.freeze({ hit: [], fall: ['fall.001'], punch: [], heavy: [], kick: [], call: ['make_a_call_02.001'] }) }),
  W3: Object.freeze({ id: 'W3', file: 'police.glb', text: 'police.b64.txt', inline: '__PCW_POLICE_B64', height: 1.80, rig: 'ue', walk: '~walk', run: '~run', still: 'idle.001', swim: '~swim', jump: '~leap', stairs: '~stairs', walkSpeed: 1.35, runSpeed: 4.6,
    react: Object.freeze({ hit: [], fall: ['fall.001', 'defeat_03.001'], punch: [], heavy: [], kick: [], call: ['make_a_call_02.001'] }) }),
  M4: Object.freeze({ id: 'M4', file: 'priest.glb', text: 'priest.b64.txt', inline: '__PCW_PRIEST_B64', height: 1.78, rig: 'mixamo', walk: 'walk', run: '~run', still: '~idle', swim: '~swim', jump: '~leap', stairs: '~stairs', walkSpeed: 1.25, runSpeed: 4.2,
    react: Object.freeze({ hit: [], fall: ['fall', 'defeat_03'], punch: [], heavy: [], kick: [], call: ['make_a_call_02'] }) }),
  M5: Object.freeze({ id: 'M5', file: 'warrior.glb', text: 'warrior.b64.txt', inline: '__PCW_WARRIOR_B64', height: 1.82, rig: 'mixamo', walk: 'walk.001', run: 'run.001', still: '~idle', swim: '~swim', jump: '~leap', stairs: '~stairs', walkSpeed: 1.35, runSpeed: 4.8,
    react: Object.freeze({ hit: ['hit_to_head.001'], fall: [], punch: ['box_01.001', 'box_02.001'], heavy: ['box_03.001'], kick: ['front_kick_02.001', 'front_kick_01.001'], call: ['make_a_call_02.001'] }) }),
  // The eighteen of 16 October 2026 (src/sim/figures.js). The website serves each file as it is (no copy as text:
  // `text` is null), and the copy of the game on disk carries none of them (`inline` is null).
  ...newFigures([
    ['W4', 'female_figure.glb', 1.68, { swim: 'swim.001' }, { hit: ['hit_to_stomach.001'], fall: ['fall.001'], punch: ['box_01.001', 'box_02.001'] }],
    ['W5', 'athletic_outfit.glb', 1.70, { swim: 'swim.001' }, { hit: ['hit_to_stomach.001'], punch: ['box_01.001', 'box_02.001'], kick: ['front_kick_02.001', 'front_kick_01.001'], call: ['make_a_call_02.001'] }],
    ['W6', 'fashion_model_3.glb', 1.72, { swim: 'swim.001' }, { punch: ['box_01.001', 'box_02.001'], heavy: ['box_03.001'], kick: ['front_kick_01.001'] }],
    ['W7', 'zombie_survivor.glb', 1.68, { run: 'run.001', swim: 'swim.001', stairs: 'run_upstairs.001' }, { fall: ['fall.001'], punch: ['box_01.001', 'box_02.001'], heavy: ['box_03.001'], kick: ['front_kick_02.001'], call: ['make_a_call_02.001'] }],
    ['W8', 'female_character_2.glb', 1.70, { run: 'run.001', swim: 'swim.001', stairs: 'run_upstairs.001' }, { punch: ['box_01.001'], kick: ['front_kick_02.001'] }],
    ['W9', 'horror_nurse.glb', 1.70, {}, { fall: ['defeat_03.001'], punch: ['box_01.001', 'box_02.001'], heavy: ['box_03.001'] }],
    ['W10', 'camouflage_bikini.glb', 1.70, { swim: 'swim.001' }, { fall: ['fall.001'], punch: ['box_01.001'] }],
    ['W11', 'swimwear_model.glb', 1.72, { swim: 'swim.001' }, { fall: ['fall.001'], punch: ['box_01.001'] }],
    ['W12', 'fashion_model_2.glb', 1.74, { swim: 'swim.001' }, { punch: ['box_01.001'] }],
    ['W13', 'fashion_model_1.glb', 1.68, { swim: 'swim.001', stairs: 'run_upstairs.001' }, { hit: ['hit_to_head.001', 'hit_to_body_01.001'], fall: ['fall.001'], punch: ['box_01.001', 'box_02.001'], kick: ['front_kick_01.001'], call: ['make_a_call_02.001'] }],
    ['M6', 'male_figure.glb', 1.82, { swim: 'swim.001' }, { fall: ['fall.001'], punch: ['box_01.001', 'box_02.001'], heavy: ['box_03.001'] }],
    ['M7', 'zombie.glb', 1.80, { walk: 'walk.001', swim: 'swim.001' }, { fall: ['fall.001'], punch: ['box_02.001'], heavy: ['box_03.001'], kick: ['front_kick_02.001', 'front_kick_01.001'], call: ['make_a_call_02.001'] }],
    ['M8', 'horror_character.glb', 1.85, { run: 'run.001', swim: 'swim.001' }, { fall: ['fall.001'], punch: ['box_01.001', 'box_02.001'], heavy: ['box_03.001'], kick: ['front_kick_02.001'] }],
    ['M9', 'hobo_character.glb', 1.78, { walk: 'walk.001', swim: 'swim.001' }, { hit: ['hit_to_head.001'], fall: ['defeat_03.001'], punch: ['box_01.001', 'box_02.001'], heavy: ['box_03.001'], kick: ['front_kick_02.001'], call: ['make_a_call_02.001'] }],
    ['M10', 'zombie_character.glb', 1.80, { walk: 'walk.001', run: 'run.001', swim: 'swim.001' }, { punch: ['box_01.001', 'box_02.001'], heavy: ['box_03.001'], kick: ['front_kick_02.001'] }],
    ['M11', 'human_character.glb', 1.80, {}, { punch: ['box_01.001', 'box_02.001'], heavy: ['box_03.001'] }],
    ['M12', 'ninja_armor.glb', 1.83, {}, { fall: ['defeat_03.001'], punch: ['box_01.001', 'box_02.001'], heavy: ['box_03.001'] }],
    ['M13', 'ninja_warrior.glb', 1.85, { walk: 'walk.001', run: 'run.001', swim: 'swim.001', jump: 'jump_down.001', stairs: 'run_upstairs.001' }, { hit: ['hit_to_head.001', 'hit_to_body_01.001'], fall: ['fall.001'], punch: ['box_01.001', 'box_02.001'], heavy: ['box_03.001'], kick: ['front_kick_02.001', 'front_kick_01.001'], call: ['make_a_call_02.001'] }],          // (its defeat_02, "Slump", ends on its knees, not on the ground: not a fall)
    // the six of 17 October 2026
    ['W14', 'fashion_model_7.glb', 1.72, { swim: 'swim.001' }, { fall: ['fall.001'], punch: ['box_01.001', 'box_02.001'], heavy: ['box_03.001'], kick: ['front_kick_02.001', 'front_kick_01.001'] }],
    ['W15', 'fashion_model_5.glb', 1.66, {}, { hit: ['hit_to_stomach.001', 'hit_to_head.001'], punch: ['box_01.001', 'box_02.001'], heavy: ['box_03.001'], kick: ['front_kick_02.001'] }],
    ['M14', 'fashion_model_6.glb', 1.80, { swim: 'swim.001' }, { punch: ['box_01.001', 'box_02.001'], heavy: ['box_03.001'], kick: ['front_kick_02.001', 'front_kick_01.001'], call: ['make_a_call_02.001'] }],
    ['M15', 'patchwork_shirt.glb', 1.82, { swim: 'swim.001', stairs: 'run_upstairs.001' }, { punch: ['box_01.001'], heavy: ['box_03.001'], kick: ['front_kick_02.001', 'front_kick_01.001'], call: ['make_a_call_02.001'] }],
    ['M16', 'nigerian_traditional.glb', 1.80, { swim: 'swim.001' }, { punch: ['box_01.001', 'box_02.001'], heavy: ['box_03.001'], kick: ['front_kick_02.001', 'front_kick_01.001'], call: ['make_a_call_02.001'] }],
    ['M17', 'urban_streetwear.glb', 1.78, { swim: 'swim.001', stairs: 'run_upstairs.001' }, { punch: ['box_01.001', 'box_02.001'], heavy: ['box_03.001'], kick: ['front_kick_01.001'], call: ['make_a_call_02.001'] }],
  ]),
  // The town's own (src/sim/npc-figures.js): his police officer and his security guard, the town's police since 27
  // October 2026. Each moves with its family's borrowed moves (`moves`: the family's file).
  ...townFigures({
    P1: [{}, { fall: ['fall.001', 'defeat_03.001'], punch: ['box_01.001', 'box_02.001'], heavy: ['box_03.001'], kick: ['front_kick_02.001', 'front_kick_01.001'] }],
    P2: [{ walk: 'walk.001', swim: 'swim.001' }, { fall: ['~fall'], punch: ['box_01.001'] }],
    // his townspeople (27 October 2026): every one with its family's walk of its own kind (npc-figures.js, `walk`),
    // and the town's own ways for the rest (borrow.mjs, TOWN_MOVES)
    ...Object.fromEntries(Object.values(NPC_FIGURES).filter((f) => !f.police).map((f) => [f.id, [{ walk: TOWN_WALK[f.walk] }, TOWN_REACT]])),
  }),
});
// [own walk/run/swim clips, what shows what happens to it], by the town's figure's id
function townFigures(list) {
  return Object.fromEntries(Object.entries(list).map(([id, [own, react]]) => {
    const f = NPC_FIGURES[id];
    const woman = f.gender === 'f';
    const walk = own.walk || '~walk', run = own.run || '~run', strides = STRIDES[f.family] || {}, tall = f.height / 1.7;
    return [id, Object.freeze({
      id, file: f.file, moves: NPC_FIGURES[f.family].file, text: null, inline: null, height: f.height, rig: 'mixamo', npc: true,
      walk, run, still: '~idle', swim: own.swim || '~swim', jump: own.jump || '~leap', stairs: own.stairs || '~stairs',
      walkSpeed: strides[walk] ? strides[walk] * tall : woman ? 1.3 : 1.35, runSpeed: strides[run] ? strides[run] * tall : woman ? 4.5 : 4.7,
      react: Object.freeze({ hit: [], fall: [], punch: [], heavy: [], kick: [], call: [], ...react }),
      ...(f.police ? {} : { moods: TOWN_MOODS, scared: '~scared' }),
    })];
  }));
}
// [id, file, height, its own walk/run/swim clips (what it lacks is borrowed: ~walk, ~run, ~swim), what shows what
// happens to it]. Every one of them stands with the borrowed idle; women walk and run at a woman's pace.
function newFigures(list) {
  return Object.fromEntries(list.map(([id, file, height, own, react]) => {
    const woman = id.startsWith('W');
    return [id, Object.freeze({
      id, file, text: null, inline: null, height, rig: 'mixamo',
      walk: own.walk || '~walk', run: own.run || '~run', still: '~idle', swim: own.swim || '~swim', jump: own.jump || '~leap', stairs: own.stairs || '~stairs',
      walkSpeed: woman ? 1.3 : 1.35, runSpeed: woman ? 4.5 : 4.7,
      react: Object.freeze({ hit: [], fall: [], punch: [], heavy: [], kick: [], call: [], ...react }),
    })];
  }));
}

// Mixamo's name for each bone this game reaches for by its Unreal name (the hands and fingers for the phone,
// the arms and legs for a seat). A Mixamo figure answers to both.
const MIXAMO = {
  root: 'Hips', pelvis: 'Hips', spine_01: 'Spine', spine_02: 'Spine1', spine_03: 'Spine2', neck_01: 'Neck', head: 'Head',
  clavicle_l: 'LeftShoulder', upperarm_l: 'LeftArm', lowerarm_l: 'LeftForeArm', hand_l: 'LeftHand',
  clavicle_r: 'RightShoulder', upperarm_r: 'RightArm', lowerarm_r: 'RightForeArm', hand_r: 'RightHand',
  thigh_l: 'LeftUpLeg', calf_l: 'LeftLeg', foot_l: 'LeftFoot', ball_l: 'LeftToeBase',
  thigh_r: 'RightUpLeg', calf_r: 'RightLeg', foot_r: 'RightFoot', ball_r: 'RightToeBase',
};
for (const [ue, side] of [['l', 'Left'], ['r', 'Right']]) {
  for (const [f, m] of [['thumb', 'Thumb'], ['index', 'Index'], ['middle', 'Middle'], ['ring', 'Ring'], ['pinky', 'Pinky']]) for (let i = 1; i <= 3; i += 1) MIXAMO[`${f}_0${i}_${ue}`] = `${side}Hand${m}${i}`;
}

// How much each kind of thing that can happen matters: a figure doing one thing is interrupted only by something
// that matters as much or more. Walking, standing and swimming are underneath all of them.
export const PRIORITY = Object.freeze({ skill: 1, call: 2, shoot: 3, punch: 3, heavy: 3, kick: 3, shove: 3, hit: 4, fall: 5 });
// how fast a clip shown for a blow is played: the files' fighting clips are slower than a blow in the game
const PACE = Object.freeze({ punch: 1.9, heavy: 1.5, kick: 1.35, hit: 1.4, fall: 1.15, call: 1 });
// A jump (22 October 2026, the owner: "add jumping animation; if the character has none, add it"): the figure's own
// "jump down" where its file has one (the woman's, the ninja warrior's), otherwise one of theirs carried onto its own
// bones (`~leap`), every figure the same way. Played from its crouch (`from`, in the clip's own seconds) to where it
// stands again (`to`), `pace` times as fast as the file has it, its hips' own travel left out; the feet kept on the
// ground before it leaves it (`off`) and after it lands (`on`), and between them the body lifted in an arc, `high`
// metres at its top for a figure 1.75 m tall (afterClips). About 1.4 seconds from the press to standing again.
export const JUMP = Object.freeze({ from: 0.85, off: 1.36, on: 2.12, to: 3.05, pace: 1.55, high: 0.45 });
// how quickly the stairs clip goes with the walker's pace (metres a second along the stairs for once through it)
const STAIRS_PACE = 1.4;
// the bones the lowest of which is where a figure's feet are
const FEET = ['foot_l', 'foot_r', 'ball_l', 'ball_r'];

// How high above its own feet a seated figure's seat is, for a figure of height 1: the same number the town
// uses to put anyone in a seat, so the supplied figures sit where everyone else does.
const SEATED_HEIGHT = 0.845;
// where the hands hold the handlebars or the wheel, from the hips: across, up, forward (metres)
const GRIP = { x: 0.25, y: 0.3, z: 0.38 };

const loading = new Map();
// Each figure's model (its shape and pictures, shared by every figure drawn from it) is kept while a figure on the
// screen is drawn from it, and, on a computer, one more besides; beyond that, the one let go longest ago is freed. A
// player looking through thirty characters on the choosing screen otherwise kept every one they had looked at, until
// the page fell over (17 October 2026). On a phone none is kept that is not drawn (20 October 2026: the light copies
// are quick to fetch again, and a phone's graphics memory is not to be spent on a figure nobody sees); and one still
// on its way when it stops being wanted is stopped where it is, not fetched to the end.
const users = new Map();          // id -> how many figures on the screen are drawn from it
const unused = [];                // ids drawn by none, the longest unused first
const KEEP_UNUSED = () => (pictureSize('figure') <= 1024 ? 0 : 1);
const jobs = new Map();           // id -> the worker's job fetching it (to stop it)
const progress = new Map();       // id -> { got, of }: bytes come of a figure being fetched, and how many there are
function useModel(id) {
  users.set(id, (users.get(id) || 0) + 1);
  const i = unused.indexOf(id); if (i >= 0) unused.splice(i, 1);
}
function freeModel(id) {
  const held = loading.get(id);
  loading.delete(id);
  const job = jobs.get(id);
  if (job) { jobs.delete(id); if (typeof window !== 'undefined' && window.__PCW_WORKER) window.__PCW_WORKER.cancel(job); }
  if (held) held.then(({ model }) => {
    undressPolice(model);
    model.geometry.dispose();
    const m = model.material;
    for (const t of new Set([m.map, m.normalMap, m.roughnessMap, m.metalnessMap].filter(Boolean))) { t.dispose(); if (t.image && typeof t.image.close === 'function') t.image.close(); }
    m.dispose();
  }, () => {});
}
function releaseModel(id) {
  const n = (users.get(id) || 1) - 1;
  if (n > 0) { users.set(id, n); return; }
  users.delete(id);
  // still on its way: stopped, not kept
  if (jobs.has(id)) { freeModel(id); return; }
  unused.push(id);
  while (unused.length > KEEP_UNUSED()) freeModel(unused.shift());
}
// (over the page's budget for the graphics card, main.js: every figure kept ready but not drawn is let go; gives how many)
export function dropUnusedFigures() { const n = unused.length; while (unused.length) freeModel(unused.shift()); return n; }
// (for the tests: which models are held, and which are being fetched)
export const heldModels = () => ({ loaded: [...loading.keys()], users: Object.fromEntries(users), unused: [...unused], fetching: [...jobs.keys()] });
// How much of a figure being fetched has come: { got, of } in bytes, or null when it is not being fetched.
export const figureProgress = (id) => (jobs.has(id) ? progress.get(id) || { got: 0, of: 0 } : null);
// a figure's pictures are drawn at 2048 on a computer and 1024 on a phone (budget.js)
const liteTexture = () => pictureSize('figure');
function bytesOf(spec) {
  if (!figureHere(spec.id)) return Promise.reject(new Error(`${spec.file} is not in this copy of the game`));
  return bytesHere(spec);
}
// Can this copy of the game draw that figure? On the website, any; opened from a file on disk, which can fetch
// nothing beside it, only one whose bytes are written into the page.
export function figureHere(id) {
  const spec = ANIMATED[id];
  if (!spec) return false;
  try { if (typeof location !== 'undefined' && location.protocol === 'file:') return typeof window !== 'undefined' && !!window[spec.inline]; } catch (error) { /* no location: not a page */ }
  return true;
}
function bytesHere(spec) {
  const inline = typeof window !== 'undefined' && window[spec.inline];
  if (!inline && !figureHere(spec.id)) return Promise.reject(new Error(`${spec.file} is not in this copy of the game`));
  if (inline) {
    const text = atob(inline); const out = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i += 1) out[i] = text.charCodeAt(i);
    return Promise.resolve(out.buffer);
  }
  const decode = (text) => { const raw = atob(text.trim()); const out = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i); return out.buffer; };
  // the file itself where the host serves it; otherwise the same bytes written as text beside it (a figure with no
  // text copy has only the file)
  return fetch(spec.file)
    .then((r) => { if (!r.ok) throw new Error(`${spec.file}: ${r.status}`); return r.arrayBuffer(); })
    .then((b) => { if (new DataView(b).getUint32(0, true) !== 0x46546c67) throw new Error('not the file'); return b; })
    .catch((error) => { if (!spec.text) throw error; return fetch(spec.text).then((r) => { if (!r.ok) throw new Error(`${spec.text}: ${r.status}`); return r.text(); }).then(decode); });
}

// The website's light copy of a figure (build.mjs writes the table into the page: window.__PCW_FIGURES), or null.
export function lightCopy(id) {
  const table = typeof window !== 'undefined' && window.__PCW_FIGURES;
  const entry = table && table.figures && table.figures[id];
  return entry && entry.model ? entry : null;
}
// A figure's turntable: its light copy drawn from all round (tools/characters/previews.mjs), shown the instant it is
// asked for until the figure itself has come. { url, frames, cols, rows, frame: [w, h], band: [low, high] } or null.
export function figureTurn(id) {
  const table = typeof window !== 'undefined' && window.__PCW_FIGURES;
  const entry = lightCopy(id);
  if (!entry || !entry.turn || !table.turn) return null;
  const t = table.turn;
  return { url: entry.turn[0], bytes: entry.turn[1], frames: t.frames, cols: t.cols, rows: Math.ceil(t.frames / t.cols), frame: t.frame, band: t.band };
}
// What fetching a light copy fetches here: the model, and each picture at the size this device draws it. In bytes too.
export function lightFiles(id, size = liteTexture()) {
  const entry = lightCopy(id);
  if (!entry) return null;
  const pictures = entry.pictures.map((p) => {
    const sizes = Object.keys(p.sizes).map(Number).sort((a, b) => a - b);
    const pick = sizes.filter((n) => n <= size).pop() || sizes[0];
    const [url, bytes] = p.sizes[pick];
    return { index: p.index, url, bytes, size: pick };
  });
  return { model: entry.model, modelBytes: entry.bytes, pictures, moves: entry.moves || null, turn: entry.turn || null, bytes: entry.bytes + pictures.reduce((n, p) => n + p.bytes, 0) };
}
const here = (url) => new URL(url, location.href).href;
// Fetched and read on the page's worker; where there is no worker, here (the slow way: it holds the page meanwhile).
function partsOf(id) {
  const files = lightFiles(id);
  const worker = typeof window !== 'undefined' && window.__PCW_WORKER;
  progress.set(id, { got: 0, of: files.bytes });
  if (worker) {
    const job = worker.ask({ type: 'figure', model: here(files.model), bytes: files.bytes, pictures: files.pictures.map((p) => ({ index: p.index, url: here(p.url), type: 'image/webp' })) }, (got, of) => progress.set(id, { got, of: of || files.bytes }));
    jobs.set(id, job.id);
    return job;
  }
  const get = (url) => fetch(here(url)).then((r) => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.arrayBuffer(); });
  jobs.set(id, null);
  return Promise.all([get(files.model), ...files.pictures.map((p) => get(p.url).then((b) => ({ index: p.index, blob: new Blob([b], { type: 'image/webp' }), bitmap: null })))]).then(async ([gz, ...pictures]) => {
    const glb = typeof DecompressionStream === 'function'
      ? new Uint8Array(await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer())
      : gunzip(new Uint8Array(gz));
    const { json, arrays } = splitGLB(glb.buffer);
    return { json, arrays, pictures };
  });
}
// The figures fetched on this page, the latest last, for the readout (main.js, #stats): how many bytes, how long they
// took to arrive and to be ready to draw (ms), the size their pictures were fetched at; or that one was stopped.
const fetched = [];
export const figureLog = () => fetched.slice();
const logged = (row) => { fetched.push(row); if (fetched.length > 40) fetched.shift(); };
export function loadAnimated(id) {
  if (!loading.has(id)) {
    const spec = ANIMATED[id];
    let job;
    if (lightCopy(id)) {
      const began = performance.now(), files = lightFiles(id);
      job = Promise.all([partsOf(id), loadMoves(spec.moves || spec.file)]).then(([parts]) => {
        jobs.delete(id);
        const arrived = performance.now();
        const pictures = [];
        for (const p of parts.pictures) pictures[p.index] = p;
        const model = modelFromGLB(parsedParts(parts), { surface, pictures });
        return model.ready.then(() => {
          logged({ id, bytes: files.bytes, size: files.pictures.length ? files.pictures[0].size : 0, arrivedMs: Math.round(arrived - began), readyMs: Math.round(performance.now() - began) });
          const words = figureLabels(model.clips.map((c) => c.name));
          return { spec, model, labels: model.clips.map((c, i) => ({ name: c.name, label: words[i] })), light: true };
        });
      }, (error) => { jobs.delete(id); if (loading.get(id) === job) loading.delete(id); logged({ id, bytes: files.bytes, stopped: !!(error && error.stopped), failed: !(error && error.stopped), afterMs: Math.round(performance.now() - began) }); throw error; });
    } else {
      job = Promise.all([bytesOf(spec), loadMoves(spec.moves || spec.file)]).then(([buffer]) => {
        const model = modelFromGLB(parseGLB(buffer), { surface, maxTexture: liteTexture() });
        return model.ready.then(() => { const words = figureLabels(model.clips.map((c) => c.name)); return { spec, model, labels: model.clips.map((c, i) => ({ name: c.name, label: words[i] })) }; });
      });
    }
    loading.set(id, job);
  }
  return loading.get(id);
}
// The figures either side of the one looked at, fetched into the browser's cache ahead (on the worker, quietly: it
// stops the moment a figure is asked for). Nothing is decoded or kept on the page.
export function warmFigures(ids) {
  const worker = typeof window !== 'undefined' && window.__PCW_WORKER;
  // (with no connection there is nothing to fetch ahead: only what the device has kept can be had)
  if (!worker || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
  // (their turntable pictures are fetched by the character screen itself, at once: creator.js)
  const urls = [];
  for (const id of ids) {
    const files = lightFiles(id);
    if (!files || loading.has(id)) continue;
    urls.push(here(files.model), ...files.pictures.map((p) => here(p.url)));
    // (its movements on the page itself, where loadAnimated asks for them: one fetch, waited for again if need be)
    if (files.moves) loadMoves(ANIMATED[id].moves || ANIMATED[id].file, { ahead: true }).catch(() => {});
  }
  if (urls.length) worker.warm(urls);
}

const control = () => ({ rotation: { x: 0, y: 0, z: 0 } });

// Points a bone so that a point on its child lies along `to` (world space), by the shortest turn.
function aim(bone, child, to) {
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion(), _w = new THREE.Quaternion(), _p = new THREE.Quaternion();
  bone.getWorldPosition(_a); child.getWorldPosition(_b);
  const cur = _b.sub(_a).normalize(), want = _c.copy(to).sub(_a).normalize();
  _q.setFromUnitVectors(cur, want);
  bone.getWorldQuaternion(_w); bone.parent.getWorldQuaternion(_p);
  bone.quaternion.copy(_p.invert().multiply(_q.multiply(_w)));
  bone.updateMatrixWorld(true);
}
// An arm reaching for a point: the elbow bends toward `pole`, the hand ends on the point if it can reach it.
export function reach(upper, lower, hand, target, pole) {
  if (!upper || !lower || !hand) return;
  const S = upper.getWorldPosition(new THREE.Vector3()), E = lower.getWorldPosition(new THREE.Vector3()), H = hand.getWorldPosition(new THREE.Vector3());
  const l1 = S.distanceTo(E), l2 = E.distanceTo(H);
  const toT = target.clone().sub(S); const d = Math.min(Math.max(toT.length(), Math.abs(l1 - l2) + 1e-3), (l1 + l2) * 0.999);
  const dir = toT.normalize();
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const side = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
  const elbow = S.clone().add(dir.clone().multiplyScalar(a)).add(side.multiplyScalar(h));
  aim(upper, lower, elbow);
  aim(lower, hand, S.clone().add(dir.multiplyScalar(d)));
}

// A clip's first pose for the body's bones, in the order falls.js keeps them (four numbers a bone; none for a bone
// the clip does not turn): what a figure stands in when it has got up.
function poseOfClip(clip, bones) {
  const out = new Float32Array(FALL_BONES.length * 4);
  if (!clip) { FALL_BONES.forEach((n, k) => { const b = bones.get(n); if (b) b.quaternion.toArray(out, k * 4); }); return out; }
  FALL_BONES.forEach((n, k) => {
    const b = bones.get(n);
    if (!b) return;
    const track = clip.tracks.find((t) => t.name === `${b.name}.quaternion`);
    if (track) { const v = track.createInterpolant(new Float32Array(4)).evaluate(0); out.set(v, k * 4); new THREE.Quaternion().fromArray(out, k * 4).normalize().toArray(out, k * 4); } else b.quaternion.toArray(out, k * 4);
  });
  return out;
}

// A movement borrowed from another figure's file (figure-moves.js), as a clip for this figure's bones.
function borrowedClip(name, b) {
  const raw = atob(b.data); const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  const all = new Int16Array(bytes.buffer);
  const times = new Float32Array(b.frames);
  for (let i = 0; i < b.frames; i += 1) times[i] = (b.duration * i) / (b.frames - 1);
  const tracks = b.bones.map((bone, k) => {
    const values = new Float32Array(b.frames * 4);
    for (let i = 0; i < b.frames; i += 1) for (let c = 0; c < 4; c += 1) values[i * 4 + c] = all[(i * b.bones.length + k) * 4 + c] / 32767;
    return new THREE.QuaternionKeyframeTrack(`${boneName(bone)}.quaternion`, times, values);
  });
  return new THREE.AnimationClip(name, b.duration, tracks);
}

// A walk or a run is played where the figure is: a file that carries its figure forward (or holds it a step ahead
// of its feet) along the ground has that taken out, so that the game alone says where the figure is. Up and down
// are kept: the body still rises and falls with the stride.
function inPlace(clip, hips, rest, upright = false) {
  const tracks = clip.tracks.map((t) => {
    if (t.name !== `${hips}.position`) return t;
    const values = t.values.slice();
    for (let i = 0; i < values.length; i += 3) { values[i] = rest.x; values[i + 2] = rest.z; if (upright) values[i + 1] = rest.y; }
    return new THREE.VectorKeyframeTrack(t.name, t.times, values);
  });
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

// the bones whose lowest says how far a lying figure has to be let down to rest on the ground
const GROUNDED = ['head', 'neck_01', 'spine_03', 'spine_01', 'pelvis', 'hand_l', 'hand_r', 'lowerarm_l', 'lowerarm_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r'];
const smooth01 = (t) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };

// `police`: which of the town's sixteen policewomen the figure is (police-dress.js), when it is one of them; drawn from
// the supplied police officer's model with her own face, skin, uniform and hat.
// `size`: this one's height as a share of the figure's own (the town's officers: each a little taller or shorter)
export function makeAnimatedRig(id, labelText, shadow = false, police = null, size = 1) {
  const spec = ANIMATED[id];
  useModel(id);
  let released = false;
  const group = new THREE.Group();
  const holder = new THREE.Group();
  const lift = new THREE.Group();          // raised or lowered to put the figure on a seat
  group.add(holder); holder.add(lift);
  let label = null;
  if (labelText) {
    label = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTexture(labelText), transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    label.scale.set(0.95, 0.18, 1); label.position.set(0, 2.14, 0); label.visible = false;
    group.add(label);
  }
  // (soft, darkest under the feet: the contact shadow, at every level; soft-patch.js)
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.4, 18), new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: softShadowPicture(), transparent: true, opacity: FIGURE_PATCH, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.09; group.add(blob);
  const tmp = { a: new THREE.Vector3(), b: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Quaternion(), p: new THREE.Quaternion(), axis: new THREE.Vector3() };

  const rig = {
    animated: id, figure: id, group, body: holder, lift, label, blob, mesh: null, triangles: 0, spec, speed: 0, idleTime: 0, phase: 0, scale: 1, stride: 1,
    torso: control(), head: { group: control() }, pelvis: { yaw: 0, roll: 0, drop: 0, sway: 0 }, gait: { hipY: 0 }, lean: 0, bank: 0,
    legL: { hip: control(), knee: control(), foot: control() }, legR: { hip: control(), knee: control(), foot: control() },
    armL: { shoulder: control(), elbow: control() }, armR: { shoulder: control(), elbow: control() },
    mixer: null, actions: new Map(), current: null, chosen: null, labels: [],
    loaded: null, bones: null, seated: false,
    // what the figure is doing over and above standing, walking or swimming: { kind, priority, name } while a clip
    // plays for it, or a movement by hand ({ kind, at, length }) for one the file has no clip for
    doing: null, byHand: null,
    // lying on the ground: { name, amount } while knocked down, with the clip that took it there (or none)
    lying: null, drop: 0,
    // in the air, or getting ready to be: { name, at: how high its feet were as it stood } (JUMP), and how far
    // its body is lifted for it (`jumpLift`); going up stairs (`climbing`, set by whoever draws it)
    jumping: null, jumpLift: 0, climbing: false,
    // plays one of the file's animations by its name, fading from whatever was playing
    play(name, fade = 0.3, once = false) {
      rig.chosen = name;
      if (!rig.mixer) return;
      const next = rig.actions.get(name);
      if (!next || (next === rig.current && !once)) return;
      if (next === rig.current) { next.reset(); return; }
      // a skill plays once and holds its last pose until it is faded out; everything else goes round
      next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); next.clampWhenFinished = once;
      next.reset(); next.setEffectiveTimeScale(1); next.setEffectiveWeight(1); next.enabled = true; next.play();
      // (the town's people do not all walk in step: each begins its walk, run or standing at its own point of it,
      // `offset`, a share of the clip, set by whoever draws it; 27 October 2026, the owner's brief)
      if (rig.offset && !once && (name === spec.walk || name === spec.run || name === spec.still)) next.time = (rig.offset % 1) * next.getClip().duration;
      if (rig.current) rig.current.crossFadeTo(next, fade, false);
      rig.current = next;
    },
    // A jump, from its start (`ago`: seconds since it began, for one seen on another player's screen). Not lying,
    // seated or in the water, nor in the middle of a blow; a skill being played is ended by it.
    jump(ago = 0) {
      const name = spec.jump;
      if (!rig.mixer || !name || !rig.actions.has(name) || rig.lying || rig.seated || rig.swimming || (rig.doing && !rig.doneDoing())) return false;
      const t = JUMP.from + Math.max(0, ago) * JUMP.pace;
      if (t >= JUMP.to) return false;
      if (rig.emoting) rig.endEmote();
      rig.doing = null; rig.byHand = null;
      // (where its feet are as it stands or walks now, before the jump's crouch: the ground, for all of it)
      const at = feetLow();
      rig.play(name, 0.1, true);
      const a = rig.actions.get(name);
      a.time = t; a.setEffectiveTimeScale(JUMP.pace);
      rig.jumping = { name, at };
      return true;
    },
    endJump(fade = 0.2) {
      const a = rig.jumping && rig.actions.get(rig.jumping.name);
      rig.jumping = null;
      if (a) { a.setLoop(THREE.LoopRepeat, Infinity); a.clampWhenFinished = false; a.paused = false; a.setEffectiveTimeScale(1); }
      rig.fadeNext = fade;
    },
    // which of the figure's own clips shows `kind` (PRIORITY), if it has one
    clipFor(kind) { const list = (spec.react && spec.react[kind]) || []; return list.find((n) => rig.actions.has(n)) || null; },
    // Something happens to the figure, or it does something: a blow lands (hit), it throws one (punch, heavy, kick,
    // shove), it talks on the phone (call). It is shown at once if nothing that matters more is being shown,
    // by the figure's own clip for it where its file has one, otherwise by moving its bones by hand.
    // Returns how it was shown: 'clip', 'hand', or null when something more important is under way.
    react(kind, { length = 0.4 } = {}) {
      const priority = PRIORITY[kind] || 1;
      if (rig.lying) return null;
      if (rig.doing && rig.doing.priority > priority && !rig.doneDoing()) return null;
      const name = rig.clipFor(kind);
      if (rig.emoting) rig.endEmote();
      if (name && rig.mixer && !rig.seated && !rig.swimming) {
        rig.doing = { kind, priority, name };
        rig.play(name, 0.12, true);
        if (rig.current) rig.current.setEffectiveTimeScale(PACE[kind] || 1);
        rig.byHand = null;
        return 'clip';
      }
      rig.byHand = { kind, at: rig.idleTime, length };
      return 'hand';
    },
    // is the clip being shown for something finished
    doneDoing() {
      if (!rig.doing) return true;
      const a = rig.actions.get(rig.doing.name);
      return !a || a !== rig.current || a.time >= a.getClip().duration - 0.05;
    },
    endDoing(fade = 0.25) {
      if (!rig.doing) return;
      const a = rig.actions.get(rig.doing.name);
      rig.doing = null;
      if (a) { a.setLoop(THREE.LoopRepeat, Infinity); a.clampWhenFinished = false; a.paused = false; }
      rig.fadeNext = fade;
    },
    endEmote() {
      const a = rig.emoting && rig.actions.get(rig.emoting.name);
      rig.emoting = null;
      if (a) { a.setLoop(THREE.LoopRepeat, Infinity); a.clampWhenFinished = false; a.paused = false; }
      if (rig.onEmoteEnd) rig.onEmoteEnd();
    },
    // Knocked off its feet (amount rising towards 1), lying there (1), and getting up (falling back to 0). `how`
    // picks among the figure's own falls: 'hard' (run down, or killed) takes the first, anything else the second
    // where there is one. Returns false for a figure with no fall of its own: it is then laid flat by hand.
    lay(amount, how = 'hard') {
      const falls = ((spec.react && spec.react.fall) || []).filter((n) => rig.actions.has(n));
      if (!rig.mixer || !falls.length) return false;
      if (amount > 0.02 && !rig.lying) {
        const name = how === 'hard' || falls.length < 2 ? falls[0] : falls[1];
        if (rig.emoting) rig.endEmote();
        rig.doing = null; rig.byHand = null; rig.jumping = null; rig.jumpLift = 0;
        rig.lying = { name, amount };
        rig.play(name, 0.15, true);
        // down on the ground in a little over two seconds, however long the file's fall is: a knock-down lasts
        // only a few seconds, and a slow fall would still be on its way down when it was time to get up
        if (rig.current) rig.current.setEffectiveTimeScale(Math.max(PACE.fall, rig.current.getClip().duration / 2.2));
      }
      if (rig.lying) {
        rig.lying.amount = amount;
        // up again: back to standing, and the body raised as it comes
        if (amount < 0.02) { const a = rig.actions.get(rig.lying.name); rig.lying = null; if (a) { a.setLoop(THREE.LoopRepeat, Infinity); a.clampWhenFinished = false; } rig.fadeNext = 0.5; }
      }
      return true;
    },
    // in a seat: the sitting pose from the supplied woman's own sit animation, the hips on the seat and both
    // hands forward on the handlebars or the wheel. Nothing is changed in the file: the bones are posed.
    seat(on = true) {
      rig.seated = on;
      if (!on) { lift.position.set(0, 0, 0); return; }
      if (!rig.bones) return;
      const pose = seatFor(spec.file) || SEAT_POSE;
      for (const [name, q] of Object.entries(pose)) { const b = rig.bones.get(boneName(name)); if (b) b.quaternion.fromArray(q); }
      lift.position.set(0, 0, 0); holder.updateMatrixWorld(true);
      const thigh = rig.bones.get('thigh_l'), pelvis = rig.bones.get('pelvis');
      const t = holder.worldToLocal(thigh.getWorldPosition(new THREE.Vector3()));
      const hips = holder.worldToLocal(pelvis.getWorldPosition(new THREE.Vector3()));
      // the hips over the figure's own origin, where the town puts a seated person's hips
      lift.position.set(0, SEATED_HEIGHT - (t.y - 0.07), -hips.z);
      holder.updateMatrixWorld(true);
      for (const side of [1, -1]) {
        const s = side === 1 ? 'l' : 'r';
        // the figure's left is +x in its own frame (it faces +z)
        const target = holder.localToWorld(new THREE.Vector3(side * GRIP.x, hips.y + lift.position.y + GRIP.y, GRIP.z));
        const pole = holder.localToWorld(new THREE.Vector3(side * 0.8, -1, -0.2)).sub(holder.localToWorld(new THREE.Vector3()));
        reach(rig.bones.get(`upperarm_${s}`), rig.bones.get(`lowerarm_${s}`), rig.bones.get(`hand_${s}`), target, pole);
      }
    },
    // A skill: one of the file's own animations, played once where the figure stands, faded in from what it was
    // doing. When it ends, or the figure moves off, driveAnimated fades it back into standing, walking or running.
    emote(name) {
      if (!rig.actions.has(name) || rig.lying) return false;
      if (rig.doing && rig.doing.priority > PRIORITY.skill && !rig.doneDoing()) return false;
      rig.doing = null;
      rig.emoting = { name, at: rig.idleTime };
      rig.play(name, 0.3, true);
      return true;
    },
    // what this figure can do: every clip in its file, by its one-word name and how long it lasts
    clips() { return rig.labels.map(({ name, label }) => ({ name, label, duration: rig.actions.has(name) ? rig.actions.get(name).getClip().duration : 0 })); },
    // After the clips have been played this frame: a movement by hand for something the file has no clip for,
    // and a lying figure let down onto the ground.
    afterClips(dt) {
      const h = rig.byHand;
      if (h && rig.bones) {
        const t = (rig.idleTime - h.at) / h.length;
        if (t >= 1 || t < 0) rig.byHand = null;
        else byHand(h.kind, Math.sin(Math.PI * t));
      }
      // a figure whose file's falls turn the body over without lowering it is let down until its lowest part rests
      // on the ground; one whose falls come down by themselves needs nothing, and is given nothing
      let want = 0;
      if (rig.lying && rig.bones) {
        holder.updateMatrixWorld(true);
        let low = Infinity;
        for (const n of GROUNDED) { const b = rig.bones.get(n); if (b) { holder.worldToLocal(b.getWorldPosition(tmp.a)); low = Math.min(low, tmp.a.y - lift.position.y); } }
        if (low < Infinity) want = Math.min(0, 0.09 - low);
      }
      rig.drop += (want - rig.drop) * Math.min(1, dt * (want < rig.drop ? 14 : 3));
      if (Math.abs(rig.drop) < 1e-4) rig.drop = 0;
      // a jump: the feet where they stood, until it leaves the ground; through the air, the body lifted in an arc;
      // landing, the feet on the ground again as the knees take it (the clip is played where the figure is: its own
      // hips do not rise or fall)
      let jumped = 0;
      const j = rig.jumping;
      if (j && rig.bones && !rig.seated && !rig.lying) {
        const a = rig.actions.get(j.name), t = a ? a.time : JUMP.to;
        const low = feetLow();
        if (low < Infinity) {
          if (j.at === null) j.at = low;
          const up = low - j.at;                        // how far its feet are drawn up from where they stood
          // (in the air: from the feet on the ground as it leaves it, to the body `high` up at the top, and down to the
          // feet on the ground again as it lands; whatever the frames, the same arc)
          const u = Math.max(0, Math.min(1, (t - JUMP.off) / (JUMP.on - JUMP.off))), w = 4 * u * (1 - u);
          jumped = -up * (1 - w) + JUMP.high * (spec.height / 1.75) * w;
        }
      }
      // (eased back to the ground over a moment once it is over)
      rig.jumpLift = j ? jumped : rig.jumpLift * Math.max(0, 1 - dt * 10);
      if (Math.abs(rig.jumpLift) < 1e-4) rig.jumpLift = 0;
      if (!rig.seated) lift.position.y = rig.drop + rig.jumpLift;
    },
    dispose() { if (rig.mixer) rig.mixer.stopAllAction(); blob.geometry.dispose(); blob.material.dispose(); if (label) { label.material.map.dispose(); label.material.dispose(); } if (!released) { released = true; releaseModel(id); } },
  };

  // How high the lowest of its feet is in its own frame, as it is posed now, before it is lifted or let down at all.
  function feetLow() {
    if (!rig.bones) return Infinity;
    const was = lift.position.y;
    lift.position.y = 0; holder.updateMatrixWorld(true);
    let low = Infinity;
    for (const n of FEET) { const b = rig.bones.get(n); if (b) { holder.worldToLocal(b.getWorldPosition(tmp.a)); low = Math.min(low, tmp.a.y); } }
    lift.position.y = was;
    return low;
  }
  // Turns a bone about an axis given in the figure's own frame (x its left, y up, z ahead), on top of its pose.
  function bend(name, axis, angle) {
    const b = rig.bones.get(name);
    if (!b || !angle) return;
    holder.updateMatrixWorld(true);
    tmp.axis.copy(axis).transformDirection(holder.matrixWorld);
    tmp.q.setFromAxisAngle(tmp.axis, angle);
    b.getWorldQuaternion(tmp.w);
    tmp.w.premultiply(tmp.q);
    b.parent.getWorldQuaternion(tmp.p);
    b.quaternion.copy(tmp.p.invert().multiply(tmp.w));
    b.updateMatrixWorld(true);
  }
  const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
  // A movement made by hand, `k` from 0 to 1 and back: for a figure whose file has no clip for it.
  function byHand(kind, k) {
    if (kind === 'hit' || kind === 'flinch') {
      // struck: the head snaps back, the chest goes with it, a little to one side
      bend('spine_02', X, -0.16 * k); bend('spine_03', X, -0.2 * k); bend('neck_01', X, -0.16 * k); bend('head', X, -0.3 * k); bend('spine_03', Z, 0.08 * k);
    } else if (kind === 'punch' || kind === 'heavy' || kind === 'shove' || kind === 'grab') {
      // the right arm thrown out at the chest of someone in front, the shoulders turning into it
      const H = spec.height;
      bend('spine_03', Y, (kind === 'heavy' ? 0.42 : 0.28) * k);
      const target = holder.localToWorld(tmp.b.set(-0.06 * H, 0.78 * H, (0.25 + 0.3 * k) * H));
      const pole = holder.localToWorld(tmp.a.set(-1, -0.4, -0.3)).sub(holder.localToWorld(new THREE.Vector3()));
      const before = new Map(['upperarm_r', 'lowerarm_r', 'hand_r'].map((n) => [n, rig.bones.get(n) && rig.bones.get(n).quaternion.clone()]));
      reach(rig.bones.get('upperarm_r'), rig.bones.get('lowerarm_r'), rig.bones.get('hand_r'), target, pole);
      // eased in and out from where the clip had the arm
      for (const [n, q] of before) { const b = rig.bones.get(n); if (b && q) { const done = b.quaternion.clone(); b.quaternion.copy(q).slerp(done, Math.min(1, k * 1.6)); b.updateMatrixWorld(true); } }
      if (kind === 'shove') { bend('spine_02', X, 0.15 * k); }
    } else if (kind === 'kick') {
      // the right leg swung up in front
      bend('thigh_r', X, -1.1 * k); bend('calf_r', X, 0.5 * k * (1 - k)); bend('spine_02', X, -0.12 * k);
    } else if (kind === 'dodge' || kind === 'block') {
      bend('spine_02', X, -0.12 * k); bend('spine_03', Z, -0.18 * k);
    }
  }

  // (a figure stopped on its way because nobody wants it any more has not failed: it is `stopped`)
  rig.loaded = loadAnimated(id).catch((error) => { if (error && error.stopped) rig.stopped = true; else rig.failed = String(error && error.message || error); throw error; }).then(({ model, labels }) => {
    const { root, mesh } = model.figure();
    mesh.castShadow = shadow;
    const k = (spec.height / model.height) * (size > 0.5 && size < 1.5 ? size : 1);
    root.scale.setScalar(k);
    lift.add(root);
    rig.bones = new Map(); root.traverse((o) => { if (o.isBone) rig.bones.set(o.name, o); });
    // one of the town's policewomen: her face, her skin, her uniform and her hat (or, should that fail, the figure as
    // it was supplied, and why: rig.policeFailed)
    if (typeof police === 'number') {
      try { rig.police = dressPolice({ model, root, mesh, bones: rig.bones, k: police, shadow }); } catch (error) { rig.policeFailed = String(error && error.message || error); }
    }
    // a Mixamo file's bones answer to the Unreal names the rest of the game reaches for
    if (spec.rig === 'mixamo') for (const [ue, mx] of Object.entries(MIXAMO)) { const b = rig.bones.get(boneName(`mixamorig:${mx}`)); if (b && !rig.bones.has(ue)) rig.bones.set(ue, b); }
    rig.mesh = mesh; rig.triangles = model.triangles; rig.labels = labels;
    rig.mixer = new THREE.AnimationMixer(root);
    const hips = spec.rig === 'mixamo' ? boneName('mixamorig:Hips') : 'pelvis';
    const hipBone = rig.bones.get(hips);
    const rest = hipBone ? hipBone.position.clone() : new THREE.Vector3();
    for (let clip of model.clips) {
      if (spec.rig === 'mixamo' && (clip.name === spec.walk || clip.name === spec.run)) clip = inPlace(clip, hips, rest);
      // (a jump and going up stairs where the figure is: its hips' own travel up, down and along in the file left out;
      // the body is lifted for a jump by `afterClips`, and the stairs' own height is the ground's)
      if (spec.rig === 'mixamo' && (clip.name === spec.jump || clip.name === spec.stairs)) clip = inPlace(clip, hips, rest, true);
      const a = rig.mixer.clipAction(clip); a.setLoop(THREE.LoopRepeat, Infinity); rig.actions.set(clip.name, a);
    }
    // what the file lacks, borrowed (not offered as a skill: it is not the figure's own)
    for (const [as, b] of Object.entries(borrowedFor(spec.moves || spec.file))) { const a = rig.mixer.clipAction(borrowedClip(`~${as}`, b)); a.setLoop(THREE.LoopRepeat, Infinity); rig.actions.set(`~${as}`, a); }
    // Falling, lying and getting up (falls.js, 19 October 2026): the stored motion carried onto this figure's own
    // bones, once, from how it was bound (before anything has moved it), and its standing pose to come up into
    try {
      const skeleton = mesh.skeleton;
      const bind = new Map();
      for (const n of FALL_BONES) {
        const b = rig.bones.get(n);
        const i = b ? skeleton.bones.indexOf(b) : -1;
        if (i < 0) continue;
        const q = new THREE.Quaternion();
        skeleton.boneInverses[i].clone().invert().decompose(new THREE.Vector3(), q, new THREE.Vector3());
        bind.set(n, q);
      }
      const carried = carryFalls({ root, bones: rig.bones, bind });
      const stillClip = rig.actions.has(spec.still) ? rig.actions.get(spec.still).getClip() : null;
      const standPose = poseOfClip(stillClip, rig.bones);
      rig.fallDriver = createFallDriver({ rig, holder, lift, carried, standPose, height: spec.height });
    } catch (error) { rig.fallDriver = null; rig.fallFailed = String(error && error.message || error); }
    // (a clip chosen for another figure that this one does not have: it stands instead)
    const first = rig.chosen && rig.actions.has(rig.chosen) ? rig.chosen : spec.still;
    rig.chosen = null; rig.play(first, 0);
    return rig;
  });
  rig.loaded.catch(() => { /* (the figure stays an empty place; rig.failed says why) */ });
  return rig;
}

// In the town: standing, walking or running by how fast the figure is going, the walk and run played at the pace
// they are walked. On the selection screen the player's own choice plays instead (`rig.held`).
export function driveAnimated(rig, dt, speed) {
  rig.speed += (speed - rig.speed) * Math.min(1, dt * 6.5);
  if (!rig.mixer) return;
  rig.idleTime += dt;
  // knocked down, thrown or killed, and getting up: falls.js has the figure (`downState`, set by whoever draws it)
  if (rig.fallDriver) {
    const was = rig.fallDriver.phase;
    if (rig.fallDriver.drive(dt, rig.downState || null)) { rig.lying = null; rig.doing = null; rig.byHand = null; rig.jumping = null; rig.jumpLift = 0; if (rig.emoting) rig.endEmote(); return; }
    // up again: standing, from the start of its standing, as the getting up left it
    if (was) { const still = rig.actions.get(rig.spec.still); if (still) { still.reset(); if (rig.current && rig.current !== still) rig.current.stop(); still.play(); still.setEffectiveWeight(1); rig.current = still; rig.chosen = rig.spec.still; } }
  }
  // on the ground: the fall plays to its end and stays there until the figure is got up
  if (rig.lying) { rig.mixer.update(dt); rig.afterClips(dt); return; }
  // a jump: it plays to its end, walking or running on under it; a seat, the water or a fall ends it
  if (rig.jumping) {
    const a = rig.actions.get(rig.jumping.name);
    if (!a || a !== rig.current || rig.held || rig.swimming || rig.seated || a.time >= JUMP.to) rig.endJump();
    else { rig.mixer.update(dt); rig.afterClips(dt); return; }
  }
  // something shown for a blow or a call: it runs to its end; walking off, or getting into a seat or the water, ends it
  if (rig.doing) {
    if (rig.held || rig.swimming || rig.seated || (speed > 1.0 && rig.doing.priority < PRIORITY.fall) || rig.doneDoing()) rig.endDoing();
    else { rig.mixer.update(dt); rig.afterClips(dt); return; }
  }
  // a skill being played: it runs to its end where the figure stands; moving off ends it at once
  if (rig.emoting) {
    const a = rig.actions.get(rig.emoting.name);
    const done = !a || a !== rig.current || a.time >= a.getClip().duration - 0.04;
    if (rig.held || rig.swimming || rig.seated || speed > 0.35 || done) {
      // back to going round, so that a clip that is also the standing one (Agree) does not stay on its last frame
      if (a && done && a === rig.current) a.reset();
      rig.endEmote();
    }
    else { rig.mixer.update(dt); rig.afterClips(dt); return; }
  }
  const fade = rig.fadeNext || 0.25; rig.fadeNext = 0;
  if (!rig.held && rig.swimming) {
    // in the river: the file's own swim (or one borrowed), slower when drifting and quicker with the stroke held
    rig.play(rig.spec.swim || 'swim.001', 0.4);
    if (rig.current) rig.current.setEffectiveTimeScale(Math.max(0.45, Math.min(1.4, 0.45 + rig.speed / 1.6)));
  } else if (!rig.held) {
    const v = rig.speed, s = rig.spec;
    // (going up stairs: the figure's own climb up them, or one borrowed, at the pace it goes)
    const want = rig.climbing && v > 0.25 && s.stairs && rig.actions.has(s.stairs) ? s.stairs : v > 3.0 ? s.run : v > 0.25 ? s.walk : s.still;
    rig.play(want, fade);
    // (stepping backwards with a gun up, facing where it is aimed: the walk played backwards, gun-pose.js; badly hurt,
    // a limp: off the hurt leg quickly, slowly onto the good one, limpStep)
    let pace = want === s.stairs ? Math.max(0.6, Math.min(1.8, v / STAIRS_PACE)) : want === s.run ? Math.max(0.6, v / s.runSpeed) : want === s.walk ? Math.max(0.5, v / s.walkSpeed) : 1;
    if (want === s.walk && rig.limp) pace *= limpStep(rig);
    if (want === s.walk && rig.walkBack) pace = -pace;
    if (rig.current) rig.current.setEffectiveTimeScale(pace);
  }
  rig.mixer.update(dt);
  rig.afterClips(dt);
  if (rig.limp && !rig.held && !rig.seated && !rig.swimming && !rig.lying) limpLean(rig, dt);
}

// A limp (22 October 2026, the owner's 20-life rule: "they walk slowly and weakly, with a limp"). None of the figures'
// files has one, so it is made from each figure's own walk: its right leg is the hurt one. While that foot is down
// (lower than the other) the walk hurries on, and the body dips onto it and leans over it; while the good foot is down
// it goes slower. Read from where the feet were left last frame.
// (made when first wanted: the module is read where there is no 3D library too, by the tests)
let limpAt = null;
function limpStep(rig) {
  const r = rig.bones && rig.bones.get('foot_r'), l = rig.bones && rig.bones.get('foot_l');
  if (!r || !l) return 0.8;
  if (!limpAt) limpAt = { r: new THREE.Vector3(), l: new THREE.Vector3() };
  r.getWorldPosition(limpAt.r); l.getWorldPosition(limpAt.l);
  rig.limpOn = limpAt.r.y < limpAt.l.y - 0.01 ? 1 : 0;
  return rig.limpOn ? 1.45 : 0.72;
}
function limpLean(rig, dt) {
  rig.limpDip = (rig.limpDip || 0) + (((rig.speed || 0) > 0.25 && rig.limpOn ? 1 : 0) - (rig.limpDip || 0)) * Math.min(1, dt * 10);
  const k = rig.limpDip * (rig.spec.height / 1.75);
  if (rig.lift && k > 0.001) rig.lift.position.y -= 0.035 * k;
  const spine = rig.bones && (rig.bones.get('spine_02') || rig.bones.get('spine_01'));
  if (!spine || k < 0.001 || !limpAt) return;
  // (over the hurt leg: the figure's right is -x in its own frame, so the lean is about its forward axis)
  rig.body.updateMatrixWorld(true);
  const axis = limpAt.l.set(0, 0, 1).transformDirection(rig.body.matrixWorld);
  const q = new THREE.Quaternion().setFromAxisAngle(axis, 0.12 * k);
  const w = spine.getWorldQuaternion(new THREE.Quaternion()).premultiply(q);
  const p = spine.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
  spine.quaternion.copy(p.multiply(w));
  spine.updateMatrixWorld(true);
}
