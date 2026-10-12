// What the player's character can do on demand: the Skills catalog, and the way the Skills button pages through it.
//
// The catalog is made from the animations the character really has: the clips in a supplied figure's own file
// (src/client/animated.js), or, for a figure on the game's own skeleton, the clips carried onto it
// (src/client/reaction-data.js). Walking, running and swimming are left out: the game plays those itself.
// Nothing is listed that the character cannot play. Pure: runs without a page, so it is tested in Node.

export const PER_PAGE = 5;

// the game plays these by itself, as the player moves; they are not skills
const LOCOMOTION = new Set(['walk', 'run', 'swim', 'flee']);

// what each kind of animation is shown as, by the clip's own name without its numbers
const KIND = {
  front_kick: ['fight', 'kick'], kick: ['fight', 'kick'], stomp: ['fight', 'kick'],
  box: ['fight', 'punch'], punch: ['fight', 'punch'], jab: ['fight', 'punch'],
  dance: ['dance', 'dance'], sway: ['dance', 'dance'], sing: ['dance', 'sing'],
  laugh: ['feeling', 'laugh'], giggle: ['feeling', 'laugh'], cheer: ['feeling', 'cheer'], clap: ['feeling', 'clap'],
  heart_pose: ['feeling', 'heart'], hug: ['feeling', 'heart'], agree: ['feeling', 'agree'],
  cry: ['feeling', 'sad'], sad: ['feeling', 'sad'], depressed: ['feeling', 'sad'], defeat: ['feeling', 'sad'], slump: ['feeling', 'sad'],
  afraid: ['feeling', 'scared'], scared: ['feeling', 'scared'],
  wave_goodbye: ['greeting', 'greet'], wave: ['greeting', 'greet'], greet: ['greeting', 'greet'], hello: ['greeting', 'greet'], bow: ['greeting', 'bow'],
  jump: ['sport', 'jump'], jump_down: ['sport', 'jump'], hop: ['sport', 'jump'], dive: ['sport', 'jump'], run_upstairs: ['sport', 'climb'],
  football_save: ['sport', 'ball'], shoot: ['sport', 'ball'], lift_heavy: ['sport', 'lift'], 'press-up': ['sport', 'lift'], surf: ['sport', 'surf'],
  make_a_call: ['everyday', 'phonecall'], call: ['everyday', 'phonecall'], scratch: ['everyday', 'think'], turn: ['everyday', 'turn'], sit: ['everyday', 'sit'],
  fall: ['everyday', 'fall'], hit_to_head: ['everyday', 'fall'], hurt: ['everyday', 'fall'],
  // the athlete's, the officer's, the priest's and the warrior's
  'punching and kicking, dodging and melee attacks': ['fight', 'punch'], slash: ['fight', 'punch'],
  frightened: ['feeling', 'scared'], angry: ['feeling', 'agree'], complain: ['feeling', 'agree'], frustrated: ['feeling', 'sad'],
  fold_arms: ['everyday', 'think'], look_around: ['everyday', 'turn'], idle: ['everyday', 'think'], cast_a_spell: ['everyday', 'skills'],
  'knell down to pray': ['everyday', 'sit'], 'rev father blessing someone': ['greeting', 'greet'],
  football_catch: ['sport', 'ball'], football_pass: ['sport', 'ball'], dribble: ['sport', 'ball'], basketball_shot: ['sport', 'ball'], volleyball: ['sport', 'ball'], pitch_baseball: ['sport', 'ball'],
  jump_rope: ['sport', 'jump'], flip: ['sport', 'jump'], warm_up: ['sport', 'lift'], climb: ['sport', 'climb'],
};
const ORDER = ['fight', 'dance', 'feeling', 'greeting', 'sport', 'everyday'];

const baseOf = (clip) => String(clip).replace(/\.\d+$/, '');
const kindOf = (clip) => { const base = baseOf(clip); return KIND[base] || KIND[base.replace(/_\d+$/, '')] || ['everyday', 'skills']; };
export const isLocomotion = (clip) => LOCOMOTION.has(baseOf(clip).replace(/_\d+$/, ''));

// `clips` is [{ name, label, duration }]: what the character has. Returns the catalog, in the order the pages show it.
export function buildCatalog(clips, { source = 'file' } = {}) {
  const out = [];
  const seen = new Set();
  for (const c of clips || []) {
    if (!c || typeof c.name !== 'string' || seen.has(c.name) || isLocomotion(c.name)) continue;
    if (!(c.duration > 0)) continue;                        // a clip with nothing in it is not offered
    seen.add(c.name);
    const [category, icon] = kindOf(c.name);
    out.push({
      id: c.name, label: c.label || baseOf(c.name), clip: c.name, category, icon, duration: c.duration,
      loop: false, interruptible: true, stationary: true, compatible: true, available: true, source,
    });
  }
  const at = (e) => ORDER.indexOf(e.category);
  return out.map((e, i) => [e, i]).sort((a, b) => at(a[0]) - at(b[0]) || a[1] - b[1]).map(([e]) => e);
}

// The catalog cut into pages of five (the last may be shorter).
export function pagesOf(catalog, per = PER_PAGE) {
  const pages = [];
  for (let i = 0; i < catalog.length; i += per) pages.push(catalog.slice(i, i + per));
  return pages;
}

// What one tap on the Skills button does: closed, it opens on page 1; open, it goes to the next page; on the last
// page, it closes, and the next opening starts on page 1 again. With nothing to show it stays closed.
export function nextSkillsState(state, pageCount) {
  if (!pageCount) return { open: false, page: 0 };
  if (!state.open) return { open: true, page: 0 };
  if (state.page + 1 < pageCount) return { open: true, page: state.page + 1 };
  return { open: false, page: 0 };
}
