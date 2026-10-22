// The choice on the start screen, without the page: which list (women or men), where in it, and the colours.
// Kept apart from creator.js so that it can be tested without a browser.

import { FIGURES, FIGURE_ORDER, FIGURE_PARTS, FIGURE_DEFAULTS } from '../sim/figures.js';

export function createChoice(saved = {}) {
  const gender = saved.gender === 'm' ? 'm' : 'f';
  const at = { f: 0, m: 0 };
  // (a figure no longer offered, the police officer: the list starts at its first)
  if (saved.figure && Object.hasOwn(FIGURES, saved.figure)) at[FIGURES[saved.figure].gender] = Math.max(0, FIGURE_ORDER[FIGURES[saved.figure].gender].indexOf(saved.figure));
  const colours = { ...FIGURE_DEFAULTS };
  for (const part of FIGURE_PARTS) if (saved.colours && Number.isInteger(saved.colours[part])) colours[part] = saved.colours[part];
  const state = { gender: saved.figure && Object.hasOwn(FIGURES, saved.figure) ? FIGURES[saved.figure].gender : gender, at, colours };
  const api = {
    get gender() { return state.gender; },
    get figure() { return FIGURES[FIGURE_ORDER[state.gender][state.at[state.gender]]]; },
    get index() { return state.at[state.gender]; },
    get count() { return FIGURE_ORDER[state.gender].length; },
    get colours() { return { ...state.colours }; },
    setGender(g) { if (g === 'f' || g === 'm') state.gender = g; return api.figure; },
    step(by) { const n = api.count; state.at[state.gender] = (state.at[state.gender] + by + n) % n; return api.figure; },
    go(i) { if (i >= 0 && i < api.count) state.at[state.gender] = i; return api.figure; },
    colour(part, value) { if (FIGURE_PARTS.includes(part) && Number.isInteger(value)) state.colours[part] = value; },
    // the look the simulation is sent: the figure and only the colours it has places for
    look() { const f = api.figure; const c = {}; for (const p of FIGURE_PARTS) c[p] = state.colours[p]; return { figure: f.id, body: f.gender, colours: c }; },
  };
  return api;
}

