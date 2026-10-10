// The Skills button and its pages, on screen.
//
// One round button at the middle of the right-hand edge. A tap opens the first page of the character's
// skills: five buttons in an arc beside it, each with its picture and its name. Each tap after that shows the
// next page; a tap on the last page closes them, and the next opening starts at page 1 (skill-catalog.js).
// While the pages are open the other buttons on the right are put away; the stick on the left stays. A skill
// button plays that animation on the player's own character (main.js, `onPlay`); it never changes the page.
//
// Which pages there are comes from the catalog it is given; the buttons are made once per catalog and only
// shown and hidden after that, so paging costs nothing.

import { icon } from './icons.js';
import { pagesOf, nextSkillsState } from './skill-catalog.js';

const FADE = 140;           // ms, out and in, when the page changes

export function createSkills({ root, touch, onPlay, onChange }) {
  const button = document.createElement('button');
  button.type = 'button'; button.id = 'skills-btn'; button.className = 'skills-btn';
  button.setAttribute('aria-label', 'Skills'); button.title = 'Skills (K)';
  button.append(icon('skills'));
  const counter = document.createElement('span'); counter.className = 'skills-count'; counter.setAttribute('aria-hidden', 'true');
  button.append(counter);
  const page = document.createElement('div'); page.id = 'skills-page'; page.className = 'skills-page'; page.hidden = true;
  page.setAttribute('role', 'group'); page.setAttribute('aria-label', 'Skills');
  root.append(page, button);

  let pages = [];
  let state = { open: false, page: 0 };
  let buttons = new Map();        // clip -> element, made once per catalog
  let lastTap = 0;
  let allowed = true;
  let playing = null;

  function make(entry) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'skill'; b.dataset.skill = entry.id;
    b.setAttribute('aria-label', entry.label); b.title = entry.label;
    const disc = document.createElement('span'); disc.className = 'disc'; disc.append(icon(entry.icon));
    const name = document.createElement('span'); name.className = 'name'; name.textContent = entry.label;
    b.append(disc, name);
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); b.classList.add('down'); onPlay(entry); });
    for (const t of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(t, () => b.classList.remove('down'));
    b.addEventListener('click', (e) => { if (e.detail === 0) onPlay(entry); });
    return b;
  }

  function draw(animate) {
    button.setAttribute('aria-expanded', String(state.open));
    button.classList.toggle('open', state.open);
    button.disabled = !allowed || !pages.length;
    button.hidden = !allowed;
    counter.textContent = state.open && pages.length > 1 ? `${state.page + 1}/${pages.length}` : '';
    if (touch) touch.classList.toggle('skills-open', state.open);
    if (!state.open) { page.hidden = true; page.classList.remove('in'); return; }
    const show = () => {
      const list = pages[state.page] || [];
      // a short last page sits in the middle of the arc
      const from = Math.floor((5 - list.length) / 2);
      page.replaceChildren(...list.map((e, k) => { const b = buttons.get(e.id); b.className = `skill at${k + from}${playing === e.id ? ' on' : ''}`; return b; }));
      page.dataset.count = String(list.length);
      page.hidden = false;
      requestAnimationFrame(() => page.classList.add('in'));
    };
    if (animate && !page.hidden) { page.classList.remove('in'); setTimeout(show, FADE * 0.6); } else show();
  }

  function tap() {
    const now = performance.now();
    if (now - lastTap < 160) return;      // a second tap on top of the first is not another page
    lastTap = now;
    state = nextSkillsState(state, pages.length);
    draw(true);
    if (onChange) onChange(state);
  }
  button.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); button.classList.add('down'); tap(); });
  for (const t of ['pointerup', 'pointercancel', 'pointerleave']) button.addEventListener(t, () => button.classList.remove('down'));
  button.addEventListener('click', (e) => { if (e.detail === 0) tap(); });

  return {
    // the character's catalog (a new character, or its animations just arrived)
    setCatalog(catalog) {
      pages = pagesOf(catalog);
      buttons = new Map(catalog.map((e) => [e.id, make(e)]));
      state = { open: false, page: 0 };
      draw(false);
    },
    // whether skills can be used just now (on foot, not fighting, not held): when not, the pages close and
    // the button is put away, and whatever the game shows for that state comes back
    allow(on) {
      if (on === allowed) return;
      allowed = on;
      if (!on && state.open) { state = { open: false, page: 0 }; if (onChange) onChange(state); }
      draw(false);
    },
    setPlaying(id) { playing = id; for (const [k, b] of buttons) b.classList.toggle('on', k === id); },
    tap,
    close() { if (state.open) { state = { open: false, page: 0 }; draw(false); if (onChange) onChange(state); } },
    get state() { return { ...state, pages: pages.length, shown: state.open ? (pages[state.page] || []).map((e) => e.id) : [] }; },
  };
}
