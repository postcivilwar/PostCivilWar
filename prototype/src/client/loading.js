// The loading card (20 October 2026, the owner's brief: "premium and calm"). One card for every wait the player is shown
// and for every trouble: the game's own look (black, the sun mark, the amber of the sun for the one line that moves,
// the angular buttons), a few plain words, and at most one thing to press.
//
//   show(title, note)          the card, with what is being done ("Entering Asaba", "Building the town")
//   progress(share, note)      how far it has got: share from 0 to 1 (real: bytes come of bytes there are, or the
//                              pieces of the town built of the pieces there are), and what is being done now
//   trouble(title, body, label, onPress)
//                              something went wrong: what happened in plain words, and the one thing to do
//                              ("Try again", "Continue"). Never a wall of text, and never words like "memory" or
//                              "graphics context": the player is told what to do, not how the browser works.
//   hide()
//
// The markup is in template.html (#loading); it respects a player who has asked their device for less motion.

export function createLoadingCard(root = document.getElementById('loading')) {
  const $ = (id) => document.getElementById(id);
  const title = $('loading-title'), note = $('loading-note'), fill = $('loading-fill'), line = $('loading-line'), action = $('loading-action');
  let onPress = null;
  let shown = 0;                        // the share shown, which only ever goes forward while a wait lasts
  if (action) action.addEventListener('click', () => { const run = onPress; if (run) run(); });
  const card = {
    get open() { return !!root && !root.hidden; },
    get kind() { return root ? root.dataset.kind || '' : ''; },
    show(heading, words = '') {
      if (!root) return card;
      root.hidden = false; root.dataset.kind = 'wait';
      title.textContent = heading; note.textContent = words;
      line.hidden = false; action.hidden = true; onPress = null;
      shown = 0; fill.style.width = '0%';
      return card;
    },
    progress(share, words) {
      if (!root || root.hidden) return card;
      shown = Math.max(shown, Math.max(0, Math.min(1, Number(share) || 0)));
      fill.style.width = `${(shown * 100).toFixed(1)}%`;
      if (words !== undefined) note.textContent = words;
      return card;
    },
    trouble(heading, body, label, press) {
      if (!root) return card;
      root.hidden = false; root.dataset.kind = 'trouble';
      title.textContent = heading; note.textContent = body;
      line.hidden = true;
      action.textContent = label; action.hidden = false; onPress = press;
      try { action.focus({ preventScroll: true }); } catch (error) { /* not focusable just now */ }
      return card;
    },
    hide() { if (root) { root.hidden = true; root.dataset.kind = ''; } onPress = null; return card; },
  };
  return card;
}
