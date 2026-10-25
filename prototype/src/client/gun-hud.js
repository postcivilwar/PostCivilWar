// The shooting screen's own parts (22 October 2026, the owner's picture of the shooting screen; 25 October 2026, his brief:
// "A clear central aiming reticle. Weapon name, ammunition count, and reserve ammunition at the top-right ... Target
// reticle states: white for neutral, red for hostile enemies, green for friendly players, and yellow for interactable
// objects ... Health display and a minimap ... Hit markers ... Empty-magazine feedback ... A compact weapon-selection
// panel"). The buttons are the game's own action buttons (controls.js), in ash grey (his choice); the minimap is the
// radar, top left, as it always is.
//
//   the aim         in the middle of the picture, where the rounds go: a ring broken in four, ticks outside it and a
//                   dot; its ring opens as the aim gets less steady (on the move, firing) and closes as it settles.
//                   White over nothing in particular, red over someone who can be shot, green over someone who cannot
//                   (anyone badly hurt: the 20-life rule), yellow over something that can be used. Over someone, their
//                   name and life above it. Looking through the gun's own sight, it gives way to the sight's red dot.
//   blocked         when something close in front of the muzzle would stop the rounds short of the aim (a corner, a
//                   wall the gun is beside), a small cross where they would stop
//   hits            a brief cross round the aim when one of the player's rounds is known to have hit someone (the
//                   website's server's word, for another player): white; red when it brought them down to 20
//   the gun         top right: a picture of it (his model, from the side), its name, the rounds in it and those
//                   spare ("30 / 120"); reloading, a bar filling; empty, "Reload"; nothing left, "No rounds". Pressed,
//                   or with Switch, the guns panel: each gun the player owns (its picture, its rounds), the one in
//                   their hands marked; guns they do not own greyed, with their price where one is sold; and where
//                   more guns will be sold
//   life            bottom middle: a heart, the number and a bar

const $ = (id) => document.getElementById(id);
const h = (tag, attrs = {}, ...children) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (v === null || v === undefined) continue; if (k === 'class') el.className = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v); }
  for (const c of children.flat()) if (c !== null && c !== undefined) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
};
const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}) => { const el = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); return el; };
const tr = (n) => Math.round(Number(n) || 0).toLocaleString('en-GB');

export function createGunHud({ hud, hudr, picture = () => Promise.resolve(null), onSwitch = () => {}, onEquip = () => {}, onBuy = () => {} } = {}) {
  // ---- the aim ----
  const reticle = h('div', { id: 'gun-reticle', 'aria-hidden': 'true', hidden: '' });
  const mark = svg('svg', { viewBox: '-60 -60 120 120', class: 'aim' });
  const ring = svg('g', { class: 'ring' });
  for (let k = 0; k < 4; k += 1) {
    const a0 = (k * 90 + 18) * Math.PI / 180, a1 = (k * 90 + 72) * Math.PI / 180, r = 14;
    const d = `M ${(Math.cos(a0) * r).toFixed(2)} ${(Math.sin(a0) * r).toFixed(2)} A ${r} ${r} 0 0 1 ${(Math.cos(a1) * r).toFixed(2)} ${(Math.sin(a1) * r).toFixed(2)}`;
    ring.append(svg('path', { d, class: 'under' }), svg('path', { d, class: 'line' }));
  }
  const ticks = svg('g', { class: 'ticks' });
  for (const [x1, y1, x2, y2] of [[0, -20, 0, -30], [0, 20, 0, 30], [-20, 0, -30, 0], [20, 0, 30, 0]]) { ticks.append(svg('line', { x1, y1, x2, y2, class: 'under' }), svg('line', { x1, y1, x2, y2, class: 'line' })); }
  const dot = svg('circle', { cx: 0, cy: 0, r: 2.2, class: 'dot' });
  mark.append(ring, ticks, dot);
  const target = h('div', { class: 'target', hidden: '' }, h('span', { class: 'name' }), h('div', { class: 'bar' }, h('i')));
  reticle.append(mark, target);
  const blocked = h('div', { id: 'gun-blocked', 'aria-hidden': 'true', hidden: '' });
  blocked.innerHTML = '<svg viewBox="-10 -10 20 20"><path d="M-6 -6 L6 6 M6 -6 L-6 6" /></svg>';
  const sightDot = h('div', { id: 'gun-dot', 'aria-hidden': 'true', hidden: '' });
  const hits = h('div', { id: 'gun-hits', 'aria-hidden': 'true', hidden: '' });
  hits.innerHTML = '<svg viewBox="-30 -30 60 60"><path d="M-17 -17 L-8 -8 M17 -17 L8 -8 M-17 17 L-8 8 M17 17 L8 8" /></svg>';

  // ---- the gun, top right ----
  const shot = h('img', { class: 'pic', alt: '', hidden: '' });
  const nameEl = h('span', { class: 'name' });
  const mag = h('b', { class: 'mag' }), spare = h('span', { class: 'spare' });
  const fill = h('i');
  const note = h('span', { class: 'note' });
  const panel = h('button', { id: 'gun-panel', type: 'button', hidden: '', 'aria-label': 'Your gun and its rounds. Press to switch guns', onclick: () => onSwitch() },
    shot, h('span', { class: 'words' }, nameEl, h('span', { class: 'count' }, mag, h('span', { class: 'slash' }, ' / '), spare), h('span', { class: 'load' }, fill), note));
  if (hudr) hudr.prepend(panel); else hud.append(panel);

  // ---- life, bottom middle ----
  const lifeNum = h('b');
  const lifeFill = h('i');
  const life = h('div', { id: 'gun-life', hidden: '', role: 'meter', 'aria-label': 'Your health', 'aria-valuemin': '0', 'aria-valuemax': '100' },
    h('span', { class: 'heart', 'aria-hidden': 'true' }), lifeNum, h('div', { class: 'bar' }, lifeFill));

  // ---- the guns panel ----
  const list = h('div', { class: 'list' });
  const switcher = h('div', { id: 'gun-switch', hidden: '', role: 'dialog', 'aria-label': 'Your guns' },
    h('header', null, h('b', null, 'Guns'), h('button', { class: 'btn quiet', type: 'button', onclick: () => closeSwitch() }, 'Close')), list,
    h('p', { class: 'small shop' }, 'More guns will be sold here. Everyone has the rifle, free.'));

  hud.append(reticle, blocked, sightDot, hits, life, switcher);

  const st = { on: false, x: -1, y: -1, kind: '', scale: 0, sight: -1, target: '', gun: '', life: -1, blocked: '', hitUntil: 0, pictureFor: null };
  function show(on) {
    st.on = !!on;
    hud.classList.toggle('armed', st.on);
    reticle.hidden = !st.on; panel.hidden = !st.on; life.hidden = !st.on;
    if (!st.on) { sightDot.hidden = true; hud.classList.remove('sighting'); blocked.hidden = true; hits.hidden = true; closeSwitch(); }
  }
  // Each frame, while the gun is out:
  //   at: { x, y } where the aim is on the screen (px), or null off it; kind: 'neutral' | 'hostile' | 'friendly' | 'use';
  //   spread: the ring's radius (px); sight: 0..1 looking through the sight; who: { name, health, able } or null;
  //   gun: { id, name, mag, spare, magazine, reloading (0..1 or null) }; health; block: { x, y } or null
  function update({ at, kind = 'neutral', spread = 14, sight = 0, who = null, gun = null, health = 100, block = null, now = performance.now() } = {}) {
    if (!st.on) return;
    // the aim: moved only when it has moved (the sight's dot and the hit marker go with it)
    const shown = !!at && sight < 0.7;
    if (reticle.hidden === shown) reticle.hidden = !shown;
    if (at && (Math.abs(at.x - st.x) > 0.4 || Math.abs(at.y - st.y) > 0.4)) {
      st.x = at.x; st.y = at.y;
      const place = `translate(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px)`;
      reticle.style.transform = place; sightDot.style.transform = place; hits.style.transform = place;
    }
    if (kind !== st.kind) { st.kind = kind; reticle.dataset.kind = kind; }
    const scale = Math.max(0.55, Math.min(4.2, spread / 14));
    if (Math.abs(scale - st.scale) > 0.02) { st.scale = scale; ring.setAttribute('transform', `scale(${scale.toFixed(3)})`); ticks.setAttribute('transform', `scale(${(0.7 + 0.3 * scale).toFixed(3)})`); }
    const dotOn = !!at && sight >= 0.7;
    if (sightDot.hidden === dotOn) { sightDot.hidden = !dotOn; hud.classList.toggle('sighting', dotOn); }
    const whoKey = who ? `${who.name}|${who.health}|${who.able}` : '';
    if (whoKey !== st.target) {
      st.target = whoKey;
      target.hidden = !who;
      if (who) {
        target.querySelector('.name').textContent = who.name || '';
        const bar = target.querySelector('.bar i');
        bar.style.width = `${Math.max(0, Math.min(100, Number(who.health) || 0))}%`;
        target.classList.toggle('down', !who.able);
      }
    }
    // the cross where the rounds would stop short
    const bKey = block ? `${Math.round(block.x)},${Math.round(block.y)}` : '';
    if (bKey !== st.blocked) { st.blocked = bKey; blocked.hidden = !block; if (block) blocked.style.transform = `translate(${block.x.toFixed(0)}px, ${block.y.toFixed(0)}px)`; }
    // the gun and its rounds
    if (gun) {
      const key = `${gun.id}|${gun.mag}|${gun.spare}|${gun.reloading === null || gun.reloading === undefined ? '' : gun.reloading.toFixed(2)}`;
      if (key !== st.gun) {
        st.gun = key;
        nameEl.textContent = gun.name || gun.id;
        mag.textContent = String(gun.mag); spare.textContent = String(gun.spare);
        const reloading = gun.reloading !== null && gun.reloading !== undefined;
        fill.parentElement.hidden = !reloading;
        if (reloading) fill.style.width = `${Math.round(gun.reloading * 100)}%`;
        const empty = !reloading && gun.mag <= 0;
        panel.classList.toggle('empty', empty);
        panel.classList.toggle('low', !reloading && gun.mag > 0 && gun.mag <= Math.ceil((gun.magazine || 30) * 0.2));
        note.textContent = reloading ? 'Reloading' : empty ? (gun.spare > 0 ? 'Reload' : 'No rounds') : '';
        if (st.pictureFor !== gun.id) { st.pictureFor = gun.id; picture(gun.id).then((url) => { if (url && st.pictureFor === gun.id) { shot.src = url; shot.hidden = false; } }).catch(() => {}); }
      }
    }
    const hp = Math.round(health);
    if (hp !== st.life) {
      st.life = hp;
      lifeNum.textContent = String(hp);
      lifeFill.style.width = `${Math.max(0, Math.min(100, hp))}%`;
      life.setAttribute('aria-valuenow', String(hp));
      life.dataset.level = hp <= 20 ? 'critical' : hp <= 60 ? 'hurt' : 'well';
    }
    if (!hits.hidden && now > st.hitUntil) hits.hidden = true;
  }
  // a hit the player is told of: 'hit', or 'down' (brought down to 20)
  function hit(kind = 'hit', now = performance.now()) {
    if (!st.on) return;
    hits.dataset.kind = kind;
    hits.hidden = false;
    hits.classList.remove('pop'); void hits.offsetWidth; hits.classList.add('pop');
    st.hitUntil = now + (kind === 'down' ? 420 : 200);
  }
  // the empty magazine: the count shakes
  function empty() { panel.classList.remove('shake'); void panel.offsetWidth; panel.classList.add('shake'); }

  // The guns panel: `guns`, every gun there is ({ id, name, owned, mag, spare, magazine, starter, price, forSale }),
  // `equipped`, and whether it can be bought here and now (`shop`)
  function openSwitch({ guns = [], equipped = null } = {}) {
    list.replaceChildren(...guns.map((g) => {
      const pic = h('img', { class: 'pic', alt: '', hidden: '' });
      picture(g.id).then((url) => { if (url) { pic.src = url; pic.hidden = false; } }).catch(() => {});
      const here = g.id === equipped;
      const act = g.owned
        ? h('button', { class: `btn${here ? ' quiet' : ' primary'}`, type: 'button', disabled: here ? '' : null, onclick: () => { onEquip(g.id); closeSwitch(); } }, here ? 'In your hands' : 'Use')
        : g.forSale && g.price > 0 ? h('button', { class: 'btn primary', type: 'button', onclick: () => onBuy(g) }, `Buy, ${tr(g.price)} TR`) : h('span', { class: 'small' }, 'Not sold');
      return h('div', { class: `gun${g.owned ? '' : ' locked'}${here ? ' here' : ''}`, 'data-gun': g.id }, pic,
        h('span', { class: 'words' }, h('b', null, g.name), h('span', { class: 'small' }, g.owned ? `${g.mag} / ${g.spare} rounds${g.starter ? ' · everyone\'s, free' : ''}` : 'Not yours')), act);
    }));
    switcher.hidden = false;
  }
  function closeSwitch() { switcher.hidden = true; }

  return {
    show, update, hit, empty, openSwitch, closeSwitch,
    get shown() { return st.on; },
    get switching() { return !switcher.hidden; },
    // (for the tests: what the screen shows)
    state: () => ({ on: st.on, reticle: !reticle.hidden, kind: st.kind, x: st.x, y: st.y, scale: st.scale, dot: !sightDot.hidden, target: target.hidden ? null : { name: target.querySelector('.name').textContent, width: target.querySelector('.bar i').style.width, down: target.classList.contains('down') }, gun: { name: nameEl.textContent, mag: mag.textContent, spare: spare.textContent, note: note.textContent, picture: !shot.hidden }, life: lifeNum.textContent, blocked: !blocked.hidden, hit: hits.hidden ? null : hits.dataset.kind, switching: !switcher.hidden }),
  };
}
