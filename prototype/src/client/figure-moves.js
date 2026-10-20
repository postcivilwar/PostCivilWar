// The movements borrowed for the supplied figures that lack them, and each figure's sitting pose
// (tools/characters/borrow.mjs writes both into figure-borrowed.js as one piece of base64 data: MOVES_B64).
//
// In a page that carries everything inside it (the copy on disk), they are read from there, all at once, the first
// time a figure asks. On the website they are not in the page: build.mjs writes each figure's own beside its light
// copy (figures/<name>.moves.json), and they are fetched with the figure (`loadMoves`, animated.js), so that a player
// looking at one character fetches that character's movements and no others (20 October 2026).

import { MOVES_B64 } from './figure-borrowed.js';

let read = null;                     // every figure's, where the page carries them
const fetched = new Map();           // file -> { borrowed, seat }, fetched on the website
const asked = new Map();             // file -> the promise of them

function inside() {
  if (!read && MOVES_B64) read = JSON.parse(atob(MOVES_B64));
  return read;
}
// where the website keeps a figure's movements (build.mjs), by the figure's file
function addressOf(file) {
  const table = typeof window !== 'undefined' && window.__PCW_FIGURES;
  if (!table || !table.figures) return null;
  for (const entry of Object.values(table.figures)) if (entry && entry.file === file && entry.moves) return entry.moves[0];
  return null;
}

// A figure's movements, ready: at once where the page carries them, fetched (once) on the website. `ahead`: fetched
// for a figure the player may look at next (warmFigures, animated.js), behind everything else; asked for again when the
// figure itself is, the same fetch is waited for, never a second one.
export function loadMoves(file, { ahead = false } = {}) {
  if (inside() || fetched.has(file)) return Promise.resolve();
  const address = addressOf(file);
  if (!address) return Promise.resolve();
  if (!asked.has(file)) {
    const job = fetch(new URL(address, location.href).href, { credentials: 'same-origin', ...(ahead ? { priority: 'low' } : {}) })
      .then((r) => { if (!r.ok) throw new Error(`${address}: ${r.status}`); return r.json(); })
      .then((moves) => { fetched.set(file, { borrowed: moves.borrowed || {}, seat: moves.seat || null }); });
    job.catch(() => asked.delete(file));
    asked.set(file, job);
  }
  return asked.get(file);
}

// what figure `file` borrows, by the name it plays each as (walk, run, idle, swim)
export const borrowedFor = (file) => { const all = inside(); if (all) return all.borrowed[file] || {}; const own = fetched.get(file); return own ? own.borrowed : {}; };
// how figure `file` sits, bone by bone, or null for the first two figures (seat-pose.js)
export const seatFor = (file) => { const all = inside(); if (all) return all.seats[file] || null; const own = fetched.get(file); return own ? own.seat : null; };
// every figure's, for the build: { borrowed: { file: {...} }, seats: { file: {...} } } (only where the page carries them)
export const figureMoves = () => inside() || { borrowed: {}, seats: {} };
