// The movements borrowed for the supplied figures that lack them, and each figure's sitting pose
// (tools/characters/borrow.mjs writes both into figure-borrowed.js as one piece of base64 data: MOVES_B64).
//
// Read once, the first time a figure asks. In a page that carries everything inside it, the data is in the page.
// On the website it is not: build.mjs takes it out into a file of its own beside the page (moves.b64.txt), which
// the page's first script fetches with the character and vehicle kits before the game starts (template.html,
// main.js), exactly as those two are.

import { MOVES_B64 } from './figure-borrowed.js';

let read = null;
export function figureMoves() {
  if (read) return read;
  if (MOVES_B64) read = JSON.parse(atob(MOVES_B64));
  else {
    const bytes = typeof window !== 'undefined' && window.__PCW_PACK_BYTES && window.__PCW_PACK_BYTES.moves;
    // (the game starts only once the packs have arrived; a figure asked for before then stands as it was bound)
    if (!bytes) return { borrowed: {}, seats: {} };
    read = JSON.parse(new TextDecoder().decode(bytes));
  }
  return read;
}

// what figure `file` borrows, by the name it plays each as (walk, run, idle, swim)
export const borrowedFor = (file) => figureMoves().borrowed[file] || {};
// how figure `file` sits, bone by bone, or null for the first two figures (seat-pose.js)
export const seatFor = (file) => figureMoves().seats[file] || null;
