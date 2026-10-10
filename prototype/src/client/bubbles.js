// Speech bubbles: what people say, drawn small over their heads.
//
// A line of speech arrives from the simulation with its speaker, language
// and text. Here it becomes a small bubble with a tail, placed over the
// speaker each frame. Only a few are shown at once: what is said to or by
// the player comes first, then players' chat, then the nearest townspeople.
//
// One at a time (8 October 2026, at the owner's request): never two bubbles on the screen together. Lines
// wait their turn and each is shown long enough to read; a townsperson's line that has waited too long is
// let go rather than shown late. What the player says, or what is said to them, goes to the front.
//
// A translation is an extra line under the original. The original is always
// shown as it was said.

import { LANGUAGES } from '../sim/culture.js';

const READ = (text) => Math.max(2.4, Math.min(5.5, 1.2 + text.length * 0.055));   // seconds a line stays up
const STALE = 9;                                                                     // seconds a waiting townsperson's line is kept

export function createBubbles(layer, { translator, settings }) {
  const live = new Map();          // line id -> { el, line, x, y, shown }
  const asked = new Map();         // line id -> translation asked for by hand
  const queue = [];                // line ids waiting their turn, in the order they were said
  const heardAt = new Map();       // line id -> when it was first seen
  let current = null, shownSince = 0;

  function build(line, mine) {
    const el = document.createElement('div');
    el.className = `bubble ${line.kind}${mine ? ' me' : ''}`;
    const who = document.createElement('div');
    who.className = 'who';
    who.textContent = mine ? 'You' : line.name;
    if (line.role) { const role = document.createElement('span'); role.className = 'role'; role.textContent = line.role.split(',')[0]; who.append(role); }
    const say = document.createElement('div');
    say.className = 'say';
    say.textContent = line.text;
    el.append(who, say);
    return { el, line, say, extra: null, mine, x: 0, y: 0, shown: false, rank: 0 };
  }

  // the line under the words: which language it is, and what it means
  function gloss(entry) {
    const line = entry.line;
    const viewer = settings.language();
    let text = null;
    let label = '';
    let button = false;
    if (line.lang !== viewer && !entry.mine && settings.translate()) {
      const found = translator.lookup(line.text, viewer);
      if (found && found.text !== line.text) text = found.text;
      else if (line.gloss && viewer === 'en') text = line.gloss;
      else if (line.gloss) { text = line.gloss; label = 'English'; }
      else if (asked.has(line.id)) { const a = asked.get(line.id); text = a.text; label = a.note; }
      else if (line.kind === 'chat' && translator.hasService) button = true;
    }
    const tag = line.lang !== viewer && LANGUAGES[line.lang] ? LANGUAGES[line.lang].short : '';
    const key = `${tag}|${text}|${label}|${button}`;
    if (entry.glossKey === key) return;
    entry.glossKey = key;
    if (entry.extra) { entry.extra.remove(); entry.extra = null; }
    if (!tag && !text && !button) return;
    const extra = document.createElement('div');
    extra.className = 'gloss';
    if (tag) { const chip = document.createElement('span'); chip.className = 'lang'; chip.textContent = tag; extra.append(chip); }
    if (text) extra.append(document.createTextNode(label ? `${text} (${label})` : text));
    if (button) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tr';
      b.textContent = 'Translate';
      b.addEventListener('click', async () => {
        asked.set(line.id, { text: 'Translating…', note: '' });
        entry.glossKey = '';
        try { const out = await translator.request(line.text, line.lang, viewer); asked.set(line.id, out ? { text: out.text, note: out.source === 'machine' ? 'machine translation' : '' } : { text: 'No translation available', note: '' }); } catch (error) { asked.set(line.id, { text: 'No translation available', note: '' }); }
        entry.glossKey = '';
      });
      extra.append(b);
    }
    entry.el.append(extra);
    entry.extra = extra;
  }

  // `lines` is view.speech; `where(key)` gives a speaker's head in the world;
  // `project(x, y, z)` gives its place on screen; `selfKey` is the player.
  function update(lines, where, project, eye, selfKey, width, height) {
    const now = performance.now() / 1000;
    const byId = new Map(lines.map((l) => [l.id, l]));
    for (const line of lines) {
      if (!live.has(line.id)) {
        const entry = build(line, line.who === selfKey);
        live.set(line.id, entry); layer.append(entry.el); entry.el.hidden = true;
        heardAt.set(line.id, now);
        // the player's own words, and what is said to the player, go first
        const urgent = entry.mine || line.to === selfKey || line.kind === 'chat';
        if (urgent) { const at = queue.findIndex((id) => { const e = live.get(id); return !(e && (e.mine || e.line.to === selfKey || e.line.kind === 'chat')); }); queue.splice(at < 0 ? queue.length : at, 0, line.id); } else queue.push(line.id);
      }
    }
    // the one on screen stays its time (even after the simulation has let the line go), then the next
    const done = current && (now - shownSince >= READ(live.get(current).line.text));
    const jump = current && !live.get(current).mine && queue.length && (() => { const e = live.get(queue[0]); return e && (e.mine || e.line.to === selfKey); })();
    if (!current || done || jump) {
      if (current) { const e = live.get(current); e.el.remove(); live.delete(current); asked.delete(current); heardAt.delete(current); current = null; }
      while (queue.length) {
        const id = queue.shift();
        const e = live.get(id);
        if (!e) continue;
        const stale = !e.mine && e.line.kind === 'npc' && (now - heardAt.get(id) > STALE || !byId.has(id));
        if (stale) { e.el.remove(); live.delete(id); heardAt.delete(id); continue; }
        current = id; shownSince = now; break;
      }
    }
    // nothing else is drawn; lines that have left the simulation and are not waiting are dropped
    for (const [id, entry] of live) if (id !== current && !queue.includes(id) && !byId.has(id)) { entry.el.remove(); live.delete(id); heardAt.delete(id); }
    if (!current) return 0;
    const entry = live.get(current);
    gloss(entry);
    const at = where(entry.line.who);
    const screen = at ? project(at.x, at.y + 0.28, at.z) : null;
    if (!screen || screen.behind) { entry.shown = false; entry.el.hidden = true; return 0; }
    entry.el.hidden = false; entry.shown = true;
    const far = Math.hypot(at.x - eye.x, at.z - eye.z);
    const w = entry.el.offsetWidth || 160;
    const h = entry.el.offsetHeight || 40;
    const x = Math.max(8 + w / 2, Math.min(width - 8 - w / 2, screen.x));
    // keep clear of the radar, the purse and the notices at the top, and the buttons along the bottom
    const hud = layer.ownerDocument.getElementById('hud');
    const under = hud ? parseFloat(getComputedStyle(hud).getPropertyValue('--under')) || 150 : 150;
    const notices = layer.ownerDocument.getElementById('notices');
    const noticeFoot = notices && notices.childElementCount ? notices.getBoundingClientRect().bottom - layer.getBoundingClientRect().top : 0;
    const top = Math.max(under, noticeFoot + 8) + h;
    // and above what the large button would do (the prompt) and the next step, at the foot
    let floor = height - 84;
    for (const id of ['actbar', 'hud-next']) { const el = layer.ownerDocument.getElementById(id); if (!el) continue; for (const c of id === 'actbar' ? el.children : [el]) { if (c.hidden || !c.offsetHeight || getComputedStyle(c).opacity === '0') continue; const r = c.getBoundingClientRect(); const lt = layer.getBoundingClientRect().top; floor = Math.min(floor, r.top - lt - 8); } }
    floor = Math.max(top + 4, floor);
    let y = Math.max(top, Math.min(floor, screen.y));
    // never over a button: lifted above any it would cover (the stick, the buttons on the right, Skills)
    const lt = layer.getBoundingClientRect();
    const doc = layer.ownerDocument;
    const obstacles = [...doc.querySelectorAll('#stick, #pad .pad, #skills-btn, #skills-page:not([hidden]) .skill, .dock .btn')]
      .filter((el) => el.offsetParent !== null && getComputedStyle(el).opacity !== '0').map((el) => { const r = el.getBoundingClientRect(); return { l: r.left - lt.left, t: r.top - lt.top, r: r.right - lt.left, b: r.bottom - lt.top }; });
    for (let pass = 0; pass < 6; pass += 1) {
      const box = { l: x - w / 2, r: x + w / 2, t: y - h, b: y };
      const hit = obstacles.find((o) => box.l < o.r && o.l < box.r && box.t < o.b && o.t < box.b);
      if (!hit) break;
      y = Math.max(top, hit.t - 6);
      if (y === top) break;
    }
    entry.el.style.transform = `translate(${Math.round(x - w / 2)}px, ${Math.round(y - h)}px)`;
    entry.el.style.setProperty('--tail', `${Math.round(Math.max(12, Math.min(w - 12, screen.x - (x - w / 2))))}px`);
    entry.el.classList.toggle('far', far > 12);
    return 1;
  }

  return { update, count: () => live.size, shown: () => [...live.values()].filter((e) => e.shown).length, clear() { for (const entry of live.values()) entry.el.remove(); live.clear(); queue.length = 0; heardAt.clear(); current = null; } };
}
