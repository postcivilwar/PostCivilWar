// The phone: a handset the character takes out and holds, with a home screen of apps.
//
// It is on screen as a phone is in a hand: small, at the lower right, with the town still in view and the stick
// still under the left thumb. The home screen, the Camera and Music are used there. Every other app opens as a
// page over the whole screen, with a way back at the top left, because it has lists to read and things to type.
//
// Everything on it comes from the simulation: who can be reached, what was said, what is owed, where a place is
// and how long the walk will take. The phone decides nothing; a button here sends a request and shows the answer.
//
// In custody only part of it works, and calls and messages only once the officer has allowed them.

import { ZONE, ZONE_SERVICES, ZONE_MOULD_STATIONS, zoneService } from '../sim/zone.js';
import { BUSINESSES } from '../sim/economy.js';
import { HEALTH } from '../sim/conflict.js';
import { CAMERA_VIEW } from './camera.js';
import { clockOf } from './music.js';
import { createMarketUI } from './ui-market.js';
import { createWalletUI } from './ui-wallet.js';

// Pictograms, drawn here on a 24 by 24 grid: [paths]. Each app has a tile of its own colour, as on any phone, so
// an app is known at a glance; the game's own interface stays black and white round it.
const ICONS = Object.freeze({
  contacts: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 20c0-4 3.6-6 8-6s8 2 8 6'],
  messages: ['M12 4c-4.7 0-8.5 3.1-8.5 7 0 2.2 1.2 4.1 3.1 5.4L6 20l4-2.2c.6.1 1.3.2 2 .2 4.7 0 8.5-3.1 8.5-7S16.7 4 12 4z'],
  calls: ['M6.6 3.5h2.7l1.6 4.4-2.1 1.3a11 11 0 0 0 6 6l1.3-2.1 4.4 1.6v2.7a2 2 0 0 1-2 2C10.6 19.4 4.6 13.4 4.6 5.5a2 2 0 0 1 2-2z'],
  map: ['M12 21s-6-6-6-11a6 6 0 0 1 12 0c0 5-6 11-6 11z', 'M12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'],
  wallet: ['M3 7h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M3 7l12-3v3', 'M16 13h2'],
  health: ['M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.6 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z', 'M7 12h2.6l1.4-2.6 2 4.6 1.3-2H17'],
  police: ['M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z', 'M9 12l2 2 4-4'],
  transport: ['M5 16V9l2-4h8l3 4v7', 'M3 16h18', 'M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'M17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'],
  jobs: ['M3 8h18v11H3z', 'M9 8V5h6v3', 'M3 13h18'],
  property: ['M4 11l8-7 8 7v9H4z', 'M10 20v-5h4v5'],
  people: ['M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M3 19c0-3 2.7-5 6-5s6 2 6 5', 'M16 11a3 3 0 1 0-1-5.8', 'M17 14c2.6.3 4 2.2 4 5'],
  settings: ['M4 7h10', 'M18 7h2', 'M16 5v4', 'M4 12h2', 'M10 12h10', 'M8 10v4', 'M4 17h12', 'M20 17h0', 'M18 15v4'],
  notices: ['M6 17v-6a6 6 0 0 1 12 0v6l2 2H4z', 'M10 21h4'],
  camera: ['M4 8h3.2l1.6-2.4h6.4L16.8 8H20a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 20 19H4a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 4 8z', 'M12 16.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8z'],
  music: ['M9 17.5V6l10-2v11.5', 'M9 17.5a2.5 2.5 0 1 1-2.5-2.5', 'M19 15.5a2.5 2.5 0 1 1-2.5-2.5'],
});
// each tile: the two ends of its colour, and the colour of its drawing
const TILES = Object.freeze({
  calls: ['#5ee06a', '#12a833', '#fff'], messages: ['#6fe37c', '#1fb141', '#fff'], camera: ['#e9e9ec', '#a9a9b0', '#1c1c1f'], music: ['#ff6b81', '#e0143c', '#fff'],
  map: ['#7ed6a4', '#2a8fd6', '#fff'], wallet: ['#3a3a3e', '#0b0b0c', '#ffd166'], property: ['#34d6b7', '#0a8f7a', '#fff'], contacts: ['#c9c9ce', '#8a8a92', '#fff'],
  health: ['#ffffff', '#f0e9ea', '#ff3b55'], police: ['#4a7bf0', '#1a3a9c', '#fff'], transport: ['#ffd23f', '#f59e0b', '#1c1c1f'], jobs: ['#c08a5a', '#7a4a22', '#fff'],
  people: ['#b07cf7', '#6a2fd0', '#fff'], notices: ['#ff7a59', '#e0341a', '#fff'], settings: ['#9a9aa2', '#55555c', '#fff'],
});
// `held`: works in custody too. `dock`: kept in the row at the foot of the home screen.
const APPS = Object.freeze([
  { id: 'calls', name: 'Calls', held: true, dock: true },
  { id: 'messages', name: 'Messages', held: true, dock: true },
  { id: 'camera', name: 'Camera', dock: true },
  { id: 'music', name: 'Music', dock: true },
  { id: 'map', name: 'Map', held: true },
  { id: 'wallet', name: 'Wallet' },
  { id: 'property', name: 'Property' },
  { id: 'contacts', name: 'Contacts', held: true },
  { id: 'health', name: 'Health', held: true },
  { id: 'police', name: 'Police', held: true },
  { id: 'transport', name: 'Transport' },
  { id: 'jobs', name: 'Jobs' },
  { id: 'people', name: 'People' },
  { id: 'notices', name: 'Notices' },
  { id: 'settings', name: 'Settings', held: true },
]);
// used in the hand, with the town in view; everything else is a page over the whole screen
const IN_HAND = new Set(['home', 'camera', 'music', 'deal']);
const LAW_WORDS = Object.freeze({ normal: 'Nothing against you', suspicious: 'The police are asking questions', wanted: 'Wanted', pursuit: 'Police in pursuit', arrested: 'Under arrest', custody: 'In custody', released: 'Released' });

const draw = (paths, box = '0 0 24 24') => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', box); el.setAttribute('aria-hidden', 'true');
  for (const d of paths) { const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', d); el.append(path); }
  return el;
};
const svg = (id) => draw(ICONS[id]);
// the player's controls: filled shapes
const GLYPHS = Object.freeze({
  play: ['M8 5.2v13.6a.7.7 0 0 0 1.1.6l10.2-6.8a.7.7 0 0 0 0-1.2L9.1 4.6A.7.7 0 0 0 8 5.2z'], pause: ['M7 5h3.4v14H7z', 'M13.6 5H17v14h-3.4z'],
  next: ['M6 5.4v13.2a.6.6 0 0 0 1 .5l8.5-6.6a.6.6 0 0 0 0-1L7 4.9a.6.6 0 0 0-1 .5z', 'M16.5 5h2.2v14h-2.2z'], prev: ['M18 5.4v13.2a.6.6 0 0 1-1 .5l-8.5-6.6a.6.6 0 0 1 0-1L17 4.9a.6.6 0 0 1 1 .5z', 'M5.3 5h2.2v14H5.3z'],
  flip: ['M4 9a8 8 0 0 1 14.5-3.5', 'M18.8 2.6v3.2h-3.2', 'M20 15a8 8 0 0 1-14.5 3.5', 'M5.2 21.4v-3.2h3.2'],
  back: ['M14.5 5l-7 7 7 7'],
  send: ['M3.4 20.4l17.5-7.6a.9.9 0 0 0 0-1.6L3.4 3.6a.6.6 0 0 0-.8.7L4.7 11l8.3 1-8.3 1-2.1 6.7a.6.6 0 0 0 .8.7z'],
});
const glyph = (id, filled = true) => { const el = draw(GLYPHS[id]); el.classList.add(filled ? 'filled' : 'lined'); return el; };
// "4 min 30 s" or "50 s": how long something takes, in the player's own time
export const howLong = (seconds) => (seconds < 60 ? `${Math.max(5, Math.round(seconds / 5) * 5)} s` : `${Math.floor(seconds / 60)} min${seconds % 60 >= 20 && seconds < 600 ? ` ${Math.round((seconds % 60) / 10) * 10} s` : ''}`);

// kit: the pieces the rest of the interface is made of, and the screens that already existed
export function createPhone(kit) {
  const { app, h, open, redraw, line, section, money, amt, tr, trPlain, trIn, when, refused, legacy, lawBlock, log, live } = kit;
  let screen = 'home';
  let sub = {};                  // where in an app the player is: the contact, the thread, the place chosen
  let said = null;               // the last thing someone said on a call
  let draft = '';

  // Property and the conversation in which a thing is bought or sold (ui-market.js)
  const marketUI = createMarketUI({ ...kit, glyph });
  // the Wallet: the bank's figure, sending and receiving (ui-wallet.js)
  const walletUI = createWalletUI(kit);
  const go = (id, state = {}) => { if (screen === 'property' && id !== 'property') marketUI.leave(); if (screen === 'wallet' && id !== 'wallet') walletUI.leave(); if (screen === 'deal' && id !== 'deal') marketUI.closeDeal(); screen = id; sub = state; said = null; draft = ''; redraw(); };
  const send = (intent) => app.send(intent);
  const flashMessage = (result, good) => redraw(result.ok ? (good ? { good: true, text: typeof good === 'function' ? good(result) : good } : null) : { text: result.message });

  let drawn = null;              // the screen last drawn, so that an app opens with a movement and a redraw of it does not
  let rising = false;            // the phone has just been taken out: it comes up into view once
  const shots = [];              // photographs taken since the page was opened: { url, at }
  let looking = null;            // the photograph being looked at
  let ticking = null;            // what on the screen moves by itself (the song's clock)

  function show(appId = null, state = {}) {
    if (screen === 'deal' && appId !== 'deal') marketUI.closeDeal();
    screen = appId === 'deal' || (appId && APPS.some((a) => a.id === appId)) ? appId : 'home';
    sub = state; said = null; drawn = null; rising = true; looking = null;
    open(app.view().self.name, 'Phone', render, null, { device: true });
  }

  // The battery on the handset is the player's own energy: it is what runs down.
  function charge(cell, energy) {
    const level = Math.max(0, Math.min(100, Math.round(energy)));
    cell.classList.toggle('low', level < 20);
    cell.setAttribute('aria-label', `Energy ${level} percent`);
    cell.firstChild.style.width = `${Math.max(8, level)}%`;
  }

  const tile = (a, counts, held) => {
    const [from, to, ink] = TILES[a.id];
    return h('button', { class: 'app', type: 'button', disabled: held && !a.held, 'data-app': a.id, 'aria-label': counts[a.id] ? `${a.name}, ${counts[a.id]} new` : a.name, onclick: () => go(a.id) },
      h('span', { class: 'icon', style: `background:linear-gradient(160deg,${from},${to});color:${ink}` }, svg(a.id)), h('span', null, a.name), counts[a.id] ? h('span', { class: 'count' }, String(counts[a.id])) : null);
  };

  function render(root) {
    const view = app.view();
    const held = !!view.self.law.arrest;
    ticking = null;
    // drawn again when something it shows has changed: an app may name more of its own
    live(() => { const v = app.view(); const me = v.self; const a = me.law.arrest; return `${me.health}|${me.balance}|${me.law.state}|${me.law.seen.length}|${a ? `${a.status}${a.fine.confirmed}${a.call.status}` : ''}|${me.phone.unread}|${me.phone.requests.map((r) => `${r.arrest}${r.ready}${r.near}`).join()}|${me.phone.surety}|${me.critical}|${app.market ? `${app.market.state.unread}.${app.market.state.toDecide}` : ''}|${app.online ? app.online.status().state : ''}`; });
    const meta = APPS.find((a) => a.id === screen);
    if (screen !== 'home' && held && !(meta && meta.held)) screen = 'home';
    const atHome = screen === 'home';
    const inHand = IN_HAND.has(screen);
    kit.mode(inHand ? 'mini' : 'page', { big: screen === 'deal' });
    const inner = h('div', { class: `screen${drawn !== screen ? ' opening' : ''}` });
    drawn = screen;
    const deepIn = () => !!(sub.contact || sub.thread || sub.place || sub.asset || sub.market || sub.own || sub.admin || (screen === 'wallet' && walletUI.deep(sub)));
    const back = () => { if (deepIn()) { sub = screen === 'wallet' ? walletUI.back(sub) : sub.market && sub.asset ? { market: true } : {}; said = null; redraw(); } else go('home'); };
    if (!inHand) {
      // a page over the whole screen: the way back at the top left, the app's name beside it
      const bar = h('div', { class: 'pagebar' },
        h('button', { class: 'pageback', type: 'button', id: 'page-back', 'aria-label': deepIn() ? `Back to ${meta.name}` : 'Back to the phone', onclick: back }, glyph('back', false)),
        h('h3', null, meta.name),
        h('span', { class: 'pagetime' }, view.clock.label));
      ({ contacts, messages, calls, map: mapApp, wallet: () => walletUI.page(inner, view, sub, (state) => go('wallet', state)), health, police, transport, jobs, property: () => marketUI.page(inner, view, sub, (state) => go('property', state)), people: () => { profile(inner, view); legacy.people(inner); }, notices, settings })[screen](inner, view, held);
      root.append(h('div', { class: 'page', 'data-app': screen }, bar, inner));
      return;
    }
    const cell = h('span', { class: 'cell', role: 'img' }, h('i'));
    charge(cell, view.self.energy);
    const bar = h('div', { class: 'statusbar' }, h('span', { class: 'time' }, view.clock.label),
      h('span', { class: 'right' }, h('span', { class: 'cells', role: 'img', 'aria-label': 'Signal' }, h('i'), h('i'), h('i'), h('i')), h('span', null, ZONE.name), cell));
    // the bar at the foot: from an app it goes home; from home it puts the phone away
    const homebar = h('button', { class: 'homebar', type: 'button', 'aria-label': atHome ? 'Put the phone away' : 'Home', onclick: () => { if (atHome) kit.close(); else go('home'); } }, h('i'));
    const glass = h('div', { class: 'glass' }, h('div', { class: 'wall' }), h('div', { class: 'island' }), bar, inner);
    if (atHome) {
      const counts = home(inner, view, held);
      glass.append(h('div', { class: 'dockbar' }, APPS.filter((a) => a.dock).map((a) => tile(a, counts, held))));
    } else if (screen === 'camera') cameraApp(inner);
    else if (screen === 'deal') marketUI.deal(inner);
    else musicApp(inner);
    glass.append(homebar);
    root.append(h('div', { class: `handset${atHome ? '' : ' inapp'}${rising ? ' rising' : ''}`, 'data-app': screen }, glass, h('i', { class: 'sheen' })));
    rising = false;
  }

  // --- home ----------------------------------------------------------------------

  function home(root, view, held) {
    const self = view.self;
    root.append(h('div', { class: 'greeting' }, h('div', { class: 'eyebrow' }, `${view.calendar.weekday}, day ${view.clock.day}`), h('div', { class: 'big' }, view.clock.label)));
    if (held) root.append(h('div', { class: 'banner' }, self.law.arrest.call.status === 'allowed' ? 'You are held by the police. You may call or message people you know.' : 'You are held by the police. Ask the officer before you call anyone.'));
    else if (self.critical) root.append(h('div', { class: 'banner red' }, 'Your health is critical. Open Health to find a hospital or call the ambulance.'));
    const counts = { messages: self.phone.unread, contacts: self.phone.requests.length, police: self.law.seen.length + (self.law.role ? self.law.role.prisoners.filter((a) => a.call.status === 'asked').length : 0), notices: 0, property: app.market ? app.market.state.unread + app.market.state.toDecide : 0 };
    root.append(h('div', { class: 'apps' }, APPS.filter((a) => !a.dock).map((a) => tile(a, counts, held))));
    for (const r of self.phone.requests) root.append(requestCard(r));
    return counts;
  }

  // --- camera ----------------------------------------------------------------------
  // What the handset's own camera sees: the town in front of the character, or, turned round, the character's
  // own face with the town behind. The picture is the game's own scene drawn a second time from where the
  // phone is (main.js draws it into the canvas here); nothing is made up for it.

  function cameraApp(root) {
    const cam = app.phoneCam;
    if (looking) {
      root.append(h('div', { class: 'viewfinder still' }, h('img', { src: looking.url, alt: 'The photograph you took' })),
        h('div', { class: 'cambar' },
          h('button', { class: 'camtext', type: 'button', onclick: () => { looking = null; redraw(); } }, 'Back'),
          h('a', { class: 'camtext', href: looking.url, download: `postcivilwar-${looking.at}.jpg` }, 'Save'),
          h('button', { class: 'camtext', type: 'button', onclick: () => { shots.splice(shots.indexOf(looking), 1); looking = null; redraw(); } }, 'Delete')));
      return;
    }
    const canvas = h('canvas', { id: 'phone-cam', width: String(cam.width), height: String(cam.height), 'aria-label': cam.facing() === 'front' ? 'The front camera: your character' : 'The back camera: what is in front of your character' });
    const flash = h('i', { class: 'camflash' });
    const last = shots[shots.length - 1];
    root.append(h('div', { class: 'viewfinder' }, canvas, flash, h('span', { class: 'camside' }, cam.facing() === 'front' ? 'FRONT' : 'BACK')),
      h('div', { class: 'cambar' },
        last ? h('button', { class: 'camthumb', type: 'button', 'aria-label': 'Look at the last photograph', style: `background-image:url(${last.url})`, onclick: () => { looking = last; redraw(); } }) : h('span', { class: 'camthumb empty' }),
        h('button', { class: 'shutter', type: 'button', id: 'cam-shutter', 'aria-label': 'Take a photograph', onclick: () => {
          // exactly what is in the viewfinder at this moment
          let url = '';
          try { url = canvas.toDataURL('image/jpeg', 0.9); } catch (error) { url = ''; }
          if (!url || url.length < 200) return;
          shots.push({ url, at: `${app.view().clock.day}-${String(shots.length + 1).padStart(2, '0')}` });
          if (shots.length > 12) shots.shift();
          app.shutter();
          flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
          setTimeout(() => { if (screen === 'camera') redraw(); }, 260);
        } }, h('i')),
        h('button', { class: 'camflip', type: 'button', id: 'cam-flip', 'aria-label': cam.facing() === 'front' ? 'Switch to the back camera' : 'Switch to the front camera', onclick: () => { cam.flip(); redraw(); } }, glyph('flip', false))));
  }

  // --- music ------------------------------------------------------------------------
  // The library and the player are in music.js and audio.js. This is the face of them: what is playing, where
  // in it, and the controls. It keeps playing when the phone is put away.

  let musicWatch = null;
  function musicApp(root) {
    const music = app.music;
    const track = music.current();
    const s = music.status();
    const playing = s.state === 'playing' || s.state === 'loading';
    const cover = h('div', { class: 'cover', style: track.cover ? `background-image:url("${track.cover}")` : `background:linear-gradient(150deg,${track.art[0]},${track.art[1]})` }, track.cover ? null : h('span', null, track.title));
    const length = s.duration || track.duration || 0;
    const bar = h('input', { class: 'seek', id: 'mu-seek', type: 'range', min: '0', max: String(Math.max(1, Math.round(length))), step: '1', value: String(Math.round(s.time)), disabled: !length, 'aria-label': 'Where in the song' });
    const fill = () => bar.style.setProperty('--fill', `${length ? (Number(bar.value) / Math.max(1, Number(bar.max))) * 100 : 0}%`);
    fill();
    let dragging = false;
    const now = h('span', { id: 'mu-now' }, clockOf(s.time)), total = h('span', { id: 'mu-total' }, length ? clockOf(length) : '--:--');
    bar.addEventListener('input', () => { dragging = true; fill(); now.textContent = clockOf(Number(bar.value)); });
    bar.addEventListener('change', () => { dragging = false; music.seek(Number(bar.value)); });
    const word = { loading: 'Loading…', error: s.error || 'This song could not be played.' }[s.state] || '';
    const levels = app.volumes();
    const volume = h('input', { class: 'seek vol', type: 'range', min: '0', max: '100', step: '5', value: String(Math.round(levels.music * 100)), 'aria-label': 'Music volume' });
    const vfill = () => volume.style.setProperty('--fill', `${volume.value}%`);
    vfill();
    volume.addEventListener('input', () => { vfill(); app.setVolume('music', Number(volume.value) / 100); });
    root.append(...[
      cover,
      h('div', { class: 'nowplaying' }, h('b', { id: 'mu-title' }, track.title), h('span', null, track.artist)),
      h('div', { class: 'progress' }, bar, h('div', { class: 'times' }, now, total)),
      word ? h('div', { class: `mustate${s.state === 'error' ? ' bad' : ''}`, role: 'status' }, word) : null,
      h('div', { class: 'transport' },
        h('button', { type: 'button', id: 'mu-prev', 'aria-label': 'Previous song', onclick: () => music.prev() }, glyph('prev')),
        h('button', { class: 'big', type: 'button', id: 'mu-play', 'aria-label': playing ? 'Pause' : 'Play', 'aria-pressed': String(playing), onclick: () => music.toggle() }, glyph(playing ? 'pause' : 'play')),
        h('button', { type: 'button', id: 'mu-next', 'aria-label': 'Next song', onclick: () => music.next() }, glyph('next'))),
      h('label', { class: 'volrow' }, h('span', null, 'Volume'), volume),
      h('div', { class: 'tracklist', role: 'list' }, music.tracks().map((t) => h('button', { class: `track${t.id === track.id ? ' on' : ''}`, type: 'button', role: 'listitem', 'data-track': t.id, onclick: () => music.play(t.id) },
        h('i', { style: t.cover ? `background-image:url("${t.cover}")` : `background:linear-gradient(150deg,${t.art[0]},${t.art[1]})` }), h('span', null, h('b', null, t.title), h('small', null, t.artist)), t.id === track.id && playing ? h('em', { class: 'bars' }, h('u'), h('u'), h('u')) : null))),
      music.library() === 'songs' ? null : h('p', { class: 'small' }, music.library() === 'loading' ? 'Looking for songs…' : 'These four are the game\'s own. Songs added to the game will be listed here.')].filter(Boolean));
    // the song moves on by itself: the bar and the clock follow it, and a change of song or state draws the screen again
    if (musicWatch) musicWatch();
    const seen = `${track.id}|${s.state}|${music.library()}`;
    musicWatch = music.onChange(() => { if (screen === 'music' && root.isConnected && !dragging) redraw(); });
    ticking = () => {
      if (!root.isConnected) return;
      const st = music.status();
      if (`${music.current().id}|${st.state}|${music.library()}` !== seen) { if (!dragging) redraw(); return; }
      if (!dragging) { bar.value = String(Math.round(st.time)); fill(); now.textContent = clockOf(st.time); }
      if (st.duration && total.textContent === '--:--') { total.textContent = clockOf(st.duration); bar.max = String(Math.round(st.duration)); bar.disabled = false; }
    };
  }

  // Who the player is: the name, and the answer they gave when the game first asked.
  function profile(root, view) {
    const self = view.self;
    root.append(h('div', { class: 'rows' },
      line('Name', self.name),
      line('Path', self.path === 'hero' ? 'Hero' : self.path === 'villain' ? 'Villain' : 'Not chosen')));
    root.append(h('p', { class: 'small' }, self.path ? 'The path is what you answered when the game began. It is kept with your character and shown here. It changes none of the town\'s rules: the police, the court and the hospital treat a hero and a villain the same, by what they do.' : 'This character was made before the game asked the question.'));
  }

  // Someone has asked the player to come and pay a fine: where, how far, how long.
  function requestCard(r) {
    return h('div', { class: 'banner' },
      h('strong', null, `${r.from} asks you to pay a fine`), h('div', null, `${tr(r.amount)} at the ${r.station.name} (${r.no}).`),
      h('div', { class: 'eyebrow' }, r.near ? 'You are there' : `${money(r.metres)} m · about ${howLong(r.walkSeconds)} on foot`),
      h('div', { class: 'actions', style: 'margin-top:8px' },
        h('button', { class: 'btn', type: 'button', onclick: () => { app.setWaypoint({ ...r.station, label: r.station.name }); go('map', { place: { ...r.station, label: r.station.name } }); } }, 'Show the way'),
        h('button', { class: 'btn primary', type: 'button', disabled: !r.near || !r.ready || !r.canPay, onclick: () => flashMessage(send({ type: 'bail.pay', arrestId: r.arrest, requestId: app.requestId('bail') }), `Paid. ${r.from} is free to go.`) }, r.near ? (r.ready ? (r.canPay ? `Pay ${tr(r.amount)}` : 'Not enough cowries') : 'Not brought in yet') : 'Pay at the Police Post')));
  }

  // --- contacts ---------------------------------------------------------------------

  const initials = (name) => name.replace(/[^\p{L} ]/gu, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const face = (c) => h('span', { class: `face${c.kind === 'emergency' ? ' sos' : ''}` }, c.kind === 'emergency' ? 'SOS' : initials(c.name));

  function contacts(root, view, held) {
    const r = send({ type: 'phone.contacts' });
    if (!r.ok) { root.append(refused(r)); return; }
    if (sub.contact) { const c = r.contacts.find((x) => x.key === sub.contact); if (c) { contactCard(root, c, view, r, held); return; } sub = {}; }
    for (const req of r.requests) root.append(requestCard(req));
    const groups = [['emergency', 'Emergency'], ['family', 'Family'], ['friend', 'Friends'], ['person', 'People in town'], ['business', 'Businesses and offices']];
    for (const [kind, title] of groups) {
      const list = r.contacts.filter((c) => c.kind === kind);
      if (!list.length && (kind === 'emergency' || kind === 'business')) continue;
      root.append(section(title));
      if (!list.length) { root.append(h('p', { class: 'small' }, kind === 'person' ? 'Anyone in town you speak to is added here.' : kind === 'family' ? 'Nobody yet. A friend can be marked as family.' : 'Nobody yet. Stand next to another player to take their number.')); continue; }
      root.append(h('div', { class: 'rows' }, list.map((c) => h('button', { class: 'contact', type: 'button', onclick: () => { sub = { contact: c.key }; said = null; redraw(); } }, face(c), h('span', null, c.name, h('small', null, c.owed ? `You owe ${tr(c.owed)}` : c.note)), h('span', { class: 'chev', 'aria-hidden': 'true' })))));
    }
    // another player standing close enough to swap numbers with
    const close = view.players.filter((q) => !q.visitor && Math.hypot(q.x - view.self.x, q.z - view.self.z) <= 6 && !r.contacts.some((c) => c.player === q.id));
    if (close.length) {
      root.append(section('Standing next to you'));
      for (const q of close) root.append(h('div', { class: 'actions' }, h('span', null, q.name), h('button', { class: 'btn', type: 'button', onclick: () => flashMessage(send({ type: 'contacts.add', playerId: q.id }), `${q.name} is in your contacts.`) }, 'Take their number')));
    }
  }

  function contactCard(root, c, view, book, held) {
    const allowed = !held || book.custody.mayCall;
    root.append(h('div', { class: 'contact', style: 'cursor:default' }, face(c), h('span', null, h('strong', null, c.name), h('small', null, c.note)), h('span')));
    if (said) root.append(h('div', { class: 'said' }, said));
    const call = (about, good) => { const out = send({ type: 'phone.call', key: c.key, about }); app.chime(out.ok ? 'tap' : 'error'); said = out.ok ? out.said : null; flashMessage(out, good); return out; };
    const buttons = [];
    if (c.key === 'svc:police') {
      const law = view.self.law;
      buttons.push(h('button', { class: 'btn primary', type: 'button', disabled: !law.seen.length, onclick: () => call('report') }, law.seen.length ? 'Report what I saw' : 'Nothing to report'));
      if (law.state === 'wanted' || law.state === 'pursuit') buttons.push(h('button', { class: 'btn', type: 'button', disabled: law.surrendered, onclick: () => call('surrender') }, law.surrendered ? 'An officer is coming' : 'Give myself up'));
      buttons.push(h('button', { class: 'btn quiet', type: 'button', onclick: () => call(null) }, 'Ask the desk'));
    } else if (c.key === 'svc:hospital') {
      const info = send({ type: 'care.ambulance.info' });
      if (info.ok) {
        root.append(line('Your health', `${view.self.health}%`), line('Ambulance call-out', info.free ? 'Free: your health is critical' : tr(info.fee)), line('Your balance', tr(info.balance)));
        if (!info.free && info.needed) root.append(line('Balance after', tr(info.balance - info.fee), info.balance < info.fee ? 'neg' : ''));
        const riding = view.self.ambulance;
        buttons.push(h('button', { class: 'btn primary', type: 'button', disabled: !!riding || !info.needed || !info.available || (!info.free && info.balance < info.fee), onclick: () => call('ambulance') },
          riding ? 'The ambulance is coming' : !info.needed ? 'You are well enough to walk' : !info.available ? 'The ambulance is out' : info.free ? 'Call the ambulance' : `Call the ambulance: ${tr(info.fee)}`));
      }
      buttons.push(h('button', { class: 'btn quiet', type: 'button', onclick: () => { const s = zoneService('hospital'); go('map', { place: { x: s.x, z: s.z, label: s.name } }); } }, 'Show the way'));
    } else if (c.kind === 'business') {
      buttons.push(h('button', { class: 'btn primary', type: 'button', disabled: !allowed, onclick: () => call(null) }, 'Call'));
      buttons.push(h('button', { class: 'btn quiet', type: 'button', onclick: () => { const s = zoneService(c.service); go('map', { place: { x: s.x, z: s.z, label: s.name } }); } }, 'Show the way'));
    } else if (c.kind === 'person') {
      buttons.push(h('button', { class: 'btn primary', type: 'button', disabled: !allowed, onclick: () => call(null) }, 'Call'));
      if (held) buttons.push(h('button', { class: 'btn', type: 'button', disabled: !allowed || !!view.self.phone.surety, onclick: () => { const out = send({ type: 'phone.askSurety', key: c.key }); said = out.ok ? out.said : null; flashMessage(out, out.ok && out.agreed ? 'They are on their way to the Police Post.' : null); } }, view.self.phone.surety ? 'Help is on the way' : 'Ask them to pay my fine'));
      for (const d of book.debts.filter((x) => x.resident === c.resident)) buttons.push(h('button', { class: 'btn', type: 'button', disabled: view.self.balance < 1, onclick: () => flashMessage(send({ type: 'phone.repay', debtId: d.id, requestId: app.requestId('repay') }), (x) => (x.left ? `Paid ${tr(x.paid)}. You still owe ${tr(x.left)}.` : 'Paid in full. Thank you, they say.')) }, `Repay ${tr(Math.min(d.left, view.self.balance))}`));
    } else {
      buttons.push(h('button', { class: 'btn primary', type: 'button', disabled: !allowed, onclick: () => call(null) }, 'Call'));
      buttons.push(h('button', { class: 'btn', type: 'button', disabled: !allowed, onclick: () => go('messages', { thread: c.key }) }, 'Message'));
      if (held) buttons.push(h('button', { class: 'btn', type: 'button', disabled: !allowed, onclick: () => flashMessage(send({ type: 'phone.askBail', key: c.key }), (x) => `Asked ${x.asked} to come and pay ${tr(x.amount)}.`) }, 'Ask them to pay my fine'));
      buttons.push(h('button', { class: 'btn quiet', type: 'button', onclick: () => flashMessage(send({ type: 'contacts.tag', key: c.key, tag: c.kind === 'family' ? 'friend' : 'family' })) }, c.kind === 'family' ? 'Mark as a friend' : 'Mark as family'));
      buttons.push(h('button', { class: 'btn quiet', type: 'button', onclick: () => { const out = send({ type: 'contacts.remove', key: c.key }); sub = {}; flashMessage(out); } }, 'Remove'));
    }
    root.append(h('div', { class: 'actions' }, buttons));
    if (held && !allowed) root.append(h('p', { class: 'small' }, 'You are in custody. Ask the officer for a phone call first: open Police.'));
    else if (held && !c.player && !c.resident) root.append(h('p', { class: 'small' }, 'From custody you may call only people you know.'));
  }

  // --- messages ---------------------------------------------------------------------

  function messages(root, view, held) {
    const r = send({ type: 'phone.contacts' });
    if (!r.ok) { root.append(refused(r)); return; }
    const friends = r.contacts.filter((c) => c.player);
    if (sub.thread) {
      const c = friends.find((x) => x.key === sub.thread);
      const t = c ? send({ type: 'phone.thread', key: c.key }) : null;
      if (!c || !t.ok) { sub = {}; redraw(); return; }
      root.append(section(t.with));
      root.append(h('div', { class: 'thread' }, t.messages.length ? t.messages.map((m) => h('div', { class: `msg${m.mine ? ' mine' : ''}` }, m.text, h('small', null, when(m.at)))) : h('p', { class: 'small' }, 'Nothing said yet.')));
      const input = h('input', { class: 'field', maxlength: '160', placeholder: 'Message', value: draft, 'aria-label': `Message to ${t.with}`, enterkeyhint: 'send', oninput: (e) => { draft = e.target.value; } });
      const post = () => { const out = send({ type: 'phone.message', key: c.key, text: draft }); if (out.ok) draft = ''; flashMessage(out); };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); post(); } });
      root.append(h('div', { class: 'compose' }, input, h('button', { class: 'btn primary', type: 'button', onclick: post }, 'Send')));
      if (held) root.append(h('p', { class: 'small' }, `From custody: ${view.self.law.arrest.call.messagesLeft} message${view.self.law.arrest.call.messagesLeft === 1 ? '' : 's'} left${r.custody.mayCall ? '' : ', once the officer allows the phone'}.`));
      return;
    }
    if (!friends.length) { root.append(h('p', null, 'Messages go between players. Stand next to another player and take their number from Contacts.')); root.append(h('p', { class: 'small' }, 'Each copy of this page is its own town for now, so a message reaches only players in the same one.')); return; }
    root.append(h('div', { class: 'rows' }, friends.map((c) => h('button', { class: 'contact', type: 'button', onclick: () => { sub = { thread: c.key }; redraw(); } }, face(c), h('span', null, c.name, h('small', null, c.here ? 'Nearby' : c.note)), h('span', { class: 'chev', 'aria-hidden': 'true' })))));
  }

  // --- calls --------------------------------------------------------------------------

  function calls(root) {
    const r = send({ type: 'phone.contacts' });
    if (!r.ok) { root.append(refused(r)); return; }
    root.append(h('div', { class: 'actions' },
      h('button', { class: 'btn', type: 'button', onclick: () => go('contacts', { contact: 'svc:police' }) }, 'Police'),
      h('button', { class: 'btn danger', type: 'button', onclick: () => go('contacts', { contact: 'svc:hospital' }) }, 'Ambulance')));
    root.append(section('Recent'));
    if (!r.calls.length) { root.append(h('p', { class: 'small' }, 'No calls yet.')); return; }
    root.append(h('div', { class: 'rows' }, r.calls.map((c) => h('button', { class: 'contact', type: 'button', onclick: () => go('contacts', { contact: c.to }) }, h('span', { class: 'face' }, initials(c.name)), h('span', null, c.name, h('small', null, `${c.what} · ${when(c.at)}`)), h('span', { class: 'chev', 'aria-hidden': 'true' })))));
  }

  // --- map ---------------------------------------------------------------------------------

  function mapApp(root, view) {
    const places = [...ZONE_SERVICES.map((s) => ({ x: s.x, z: s.z, label: s.name })), ...view.self.phone.requests.map((r) => ({ ...r.station, label: `${r.station.name}: ${r.from}` }))];
    let way = null;
    if (sub.place) { const r = send({ type: 'map.route', x: sub.place.x, z: sub.place.z, label: sub.place.label }); if (r.ok) way = r; }
    legacy.map(root, way);
    if (way) {
      root.append(line(way.to.label || 'There', `${money(way.metres)} m`), line('On foot', `about ${howLong(way.walkSeconds)}`), way.driveSeconds ? line('By keke or okada', `about ${howLong(way.driveSeconds)}`) : null);
      const marked = app.waypoint() && Math.hypot(app.waypoint().x - way.to.x, app.waypoint().z - way.to.z) < 1;
      root.append(h('div', { class: 'actions' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => { app.setWaypoint(marked ? null : { x: way.to.x, z: way.to.z, label: way.to.label }); redraw(); } }, marked ? 'Take the marker away' : 'Mark it in the town'),
        h('button', { class: 'btn quiet', type: 'button', onclick: () => { sub = {}; redraw(); } }, 'Clear')));
    }
    root.append(section('Find the way to'));
    root.append(h('div', { class: 'rows' }, places.map((p) => h('button', { class: 'rowbtn', type: 'button', style: 'grid-template-columns:1fr auto', 'aria-current': String(!!sub.place && sub.place.label === p.label), onclick: () => { sub = { place: p }; redraw(); } }, h('span', null, p.label), h('span', { class: 'eyebrow' }, `${money(Math.hypot(p.x - view.self.x, p.z - view.self.z))} m`)))));
  }

  // --- health ------------------------------------------------------------------------------

  function health(root, view, held) {
    const self = view.self;
    root.append(h('div', { class: `vital${self.critical ? ' critical' : self.health < 50 ? ' low' : ''}`, style: 'background:none;padding:0' }, h('span', { class: 'eyebrow' }, 'Health'), h('div', { class: 'bar' }, h('i', { style: `width:${self.health}%` })), h('span', { class: 'mono' }, `${self.health}%`)));
    root.append(line('Energy', `${Math.round(self.energy)} of 100`));
    if (self.critical) root.append(h('div', { class: 'banner red' }, h('strong', null, 'Critical health. '), 'You cannot fight, and you cannot run. Walk or ride to a hospital, or call the ambulance.'));
    else if (self.health < HEALTH.max) root.append(h('p', null, 'Bruises mend slowly on their own. A hospital is quicker.'));
    else root.append(h('p', null, 'You are in full health.'));
    if (held) { root.append(h('p', { class: 'small' }, 'You are in custody. You will be treated when you are released.')); return; }
    if (self.carried) { root.append(h('div', { class: 'banner' }, 'You are being taken to the General Hospital.')); return; }
    root.append(section('Where to go'));
    for (const id of ['hospital', 'clinic']) {
      const t = send({ type: 'care.tariff', place: id });
      const s = zoneService(id);
      const way = send({ type: 'map.route', x: s.x, z: s.z, label: s.name });
      const open = view.services[id].open;
      root.append(h('div', { class: 'contact', style: 'cursor:default;grid-template-columns:1fr auto' },
        h('span', null, h('strong', null, s.name), h('small', null, `${t.kind === 'government' ? 'Government: fixed prices' : 'Private: the owner\'s prices, open to bargaining'} · ${open ? 'open now' : 'closed now'}`),
          h('small', null, way.ok ? `${money(way.metres)} m · about ${howLong(way.walkSeconds)} on foot` : ''),
          h('small', null, `From ${HEALTH.critical}%: ${t.example.map((e) => `to ${e.to}% ${amt(e.fee)}`).join(' · ')}`)),
        h('button', { class: 'btn', type: 'button', onclick: () => { app.setWaypoint({ x: s.x, z: s.z, label: s.name }); go('map', { place: { x: s.x, z: s.z, label: s.name } }); } }, 'Way')));
    }
    root.append(section('Other ways to get there'));
    root.append(h('p', { class: 'small' }, 'An okada will take you to the General Hospital stop for a fare. Your own keke will get you there too.'));
    root.append(h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => go('contacts', { contact: 'svc:hospital' }) }, 'Ambulance')));
  }

  // --- police ------------------------------------------------------------------------------

  function police(root, view) {
    const r = send({ type: 'police.status' });
    if (!r.ok) { root.append(refused(r)); return; }
    const law = r.law;
    root.append(line('How you stand', LAW_WORDS[law.state]));
    if (law.arrest) root.append(...lawBlock(law, view));
    else if (law.wanted.length) {
      root.append(h('div', { class: 'banner red' }, `Wanted for: ${law.wanted.map((w) => w.name.toLowerCase()).join(', ')}.`));
      root.append(h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', disabled: law.surrendered, onclick: () => flashMessage(send({ type: 'police.surrender' }), 'Stand still. An officer is coming to you.') }, law.surrendered ? 'An officer is coming' : 'Give myself up')));
    }
    if (law.owed > 0) {
      root.append(section('Owed to people you wronged'));
      root.append(line('Still to pay back', tr(law.owed), 'neg'));
      root.append(h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', disabled: view.self.balance < 1 || !!law.arrest, onclick: () => flashMessage(send({ type: 'police.settle', requestId: app.requestId('settle') }), (x) => `Paid back ${tr(x.paid)}.`) }, 'Pay it back now')));
    }
    if (law.seen.length) {
      root.append(section('What you saw'));
      for (const s of law.seen) root.append(h('div', { class: 'actions' }, h('span', null, `${s.name} (${s.no})`), h('button', { class: 'btn primary', type: 'button', onclick: () => flashMessage(send({ type: 'police.reportSeen', crimeId: s.id }), (x) => (x.identified ? 'Reported. Officers are being sent.' : 'Reported. An officer will look into it.')) }, 'Report it')));
    }
    if (law.role) constable(root, view, law.role);
    else root.append(section('Special constables'), h('p', { class: 'small' }, 'Someone with a clean record can be sworn in at the Police Post. A constable may arrest a wanted player and set the fine within the limits; the fine is the constable\'s, less one in a hundred to the government.'));
    if (r.record.arrests.length) {
      root.append(section('Your record'));
      root.append(h('div', { class: 'rows' }, r.record.arrests.map((a) => line(`${a.no}: ${a.offences.map((o) => o.name.toLowerCase()).join(', ')}`, a.payment.status === 'paid' ? `${amt(a.fine.amount)} paid` : a.payment.status === 'served' ? 'time served' : a.status))));
    }
    root.append(section('The scale of fines'));
    root.append(h('div', { class: 'rows' }, Object.values(r.scale).map((o) => line(o.name, `${amt(o.fine)} or ${o.hours} h`))));
    root.append(section('Where fines have gone'));
    root.append(line('Fines paid, in all', tr(r.treasury.fines)), line('To the government', tr(r.treasury.toGovernment)), line('To constables', tr(r.treasury.toConstables)), line('Returned to victims', tr(r.treasury.restitution)));
  }

  function constable(root, view, role) {
    root.append(section(`Special constable · ${role.badge}`));
    const w = send({ type: 'police.wanted' });
    if (w.ok) {
      if (!w.wanted.length) root.append(h('p', { class: 'small' }, 'Nobody is wanted just now. There are no other players in this town to arrest: each copy of this page is its own town for the present.'));
      for (const q of w.wanted) {
        root.append(h('div', { class: 'contact', style: 'cursor:default;grid-template-columns:1fr auto' },
          h('span', null, h('strong', null, q.name), h('small', null, `${q.offences.join(', ')} · scale fine ${amt(q.fine)}`), h('small', null, `${money(q.metres)} m from you`)),
          h('button', { class: 'btn primary', type: 'button', disabled: q.metres > 2.2, onclick: () => flashMessage(send({ type: 'police.arrest', playerId: q.id }), `${q.name} is under arrest. Set the fine, then walk them to the Police Post.`) }, q.metres > 2.2 ? 'Get within reach' : 'Arrest')));
      }
    }
    for (const a of role.prisoners) {
      root.append(section(`Your prisoner: ${a.culprit}`));
      root.append(line('Arrest', a.no), line('For', a.offences.map((o) => o.name.toLowerCase()).join(', ')), line('Fine', a.fine.confirmed ? tr(a.fine.amount) : `not set: ${amt(a.fine.least)} to ${amt(a.fine.most)}`));
      if (!a.fine.confirmed) {
        if (sub.fine === undefined || sub.fineFor !== a.id) { sub.fine = a.fine.scale; sub.fineFor = a.id; }
        // typed in TR (5 to 10, or to 100 where someone died); sent in ledger units
        const input = h('input', { class: 'field mono', type: 'number', inputmode: 'decimal', min: trPlain(a.fine.least), max: trPlain(a.fine.most), step: '0.5', value: trPlain(sub.fine), 'aria-label': 'Fine in TR', oninput: (e) => { const v = trIn(e.target.value); if (v !== null) sub.fine = v; } });
        root.append(h('div', { class: 'qty' }, h('span', { class: 'small' }, 'Once set it cannot be changed, by you or anyone.'), input, h('button', { class: 'btn primary', type: 'button', onclick: () => flashMessage(send({ type: 'police.fine', arrestId: a.id, amount: sub.fine }), (x) => `Fine set at ${tr(x.arrest.fine.amount)}.`) }, 'Set')));
      }
      const post = a.station;
      const atPost = Math.hypot(view.self.x - post.x, view.self.z - post.z) <= 7;
      const buttons = [];
      if (a.status === 'escort') buttons.push(h('button', { class: 'btn', type: 'button', disabled: !atPost, onclick: () => flashMessage(send({ type: 'police.book', arrestId: a.id }), 'Brought in. They are held until the fine is paid or the time is served.') }, atPost ? 'Hand them in' : 'Walk them to the Police Post'));
      if (a.call.status === 'asked') buttons.push(h('button', { class: 'btn', type: 'button', onclick: () => flashMessage(send({ type: 'police.decideCall', arrestId: a.id, allow: true }), 'They may use the phone.') }, 'Allow a call'), h('button', { class: 'btn quiet', type: 'button', onclick: () => flashMessage(send({ type: 'police.decideCall', arrestId: a.id, allow: false }), 'Refused.') }, 'Refuse'));
      if (buttons.length) root.append(h('div', { class: 'actions' }, buttons));
    }
    root.append(h('div', { class: 'actions' }, h('button', { class: 'btn quiet', type: 'button', onclick: () => flashMessage(send({ type: 'police.resign' }), 'Badge handed in.') }, 'Hand in the badge')));
  }

  // --- transport, jobs, notices, settings -------------------------------------------------------

  function transport(root, view) {
    const mine = send({ type: 'vehicle.mine' });
    root.append(section('Your kekes'));
    if (mine.ok && mine.vehicles.length) for (const v of mine.vehicles) { root.append(...legacy.vehicleLines(v)); root.append(h('div', { class: 'actions' }, h('button', { class: 'btn quiet', type: 'button', onclick: () => { app.setWaypoint({ x: v.x, z: v.z, label: `Keke ${v.plate}` }); go('map', { place: { x: v.x, z: v.z, label: `Keke ${v.plate}` } }); } }, 'Where is it?'))); }
    else root.append(h('p', null, 'None. Kekes are hired by the day and sold at the motor park.'));
    root.append(section('Okada'));
    root.append(h('p', null, `${view.okadas.filter((o) => o.free).length} riders are free near you. Walk up to one that is waiting and ask where he will take you; the fare is paid before you set off.`));
    root.append(section('What you can drive'));
    root.append(h('div', { class: 'rows' }, [['Keke', 'Hire or buy at the motor park'], ['Motorcycle', 'Not sold or hired yet'], ['Coach', 'Cannot be driven yet'], ['Car, bicycle', 'There are none in town yet']].map(([a, b]) => line(a, b))));
    root.append(h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: () => { const s = zoneService('park'); go('map', { place: { x: s.x, z: s.z, label: s.name } }); } }, 'The way to the motor park')));
  }

  // Work that is open now. Taking one marks where it is done: the radar and the map show the way, and the
  // work itself starts there (nothing is signed on the phone; the yard takes whoever turns up).
  function jobs(root, view) {
    const yard = zoneService('yard'), park = zoneService('park'), school = zoneService('school');
    const mould = ZONE_MOULD_STATIONS.find((m) => !m.reservedFor) || ZONE_MOULD_STATIONS[0];
    const hasKeke = view.vehicles.some((v) => v.yours);
    const open = (svc) => view.clock.hour >= svc.opens && view.clock.hour < svc.closes;
    const list = [
      { id: 'mould', title: 'Block moulder', where: yard.name, pay: `${tr(BUSINESSES.yard.wagePerBlock)} a block`, hours: `${yard.opens}:00 to ${yard.closes}:00`, open: open(yard),
        how: 'Stand at a free mould in the yard and hold E for each block. Paid as each one is made.', at: { x: mould.standX, z: mould.standZ, label: `Job: block moulder, ${yard.name}` } },
      { id: 'runs', title: 'Keke delivery runs', where: park.name, pay: 'Paid on delivery', hours: 'From 6:30 through the day', open: true,
        how: hasKeke ? 'Take a run below; the radar then shows where to collect and where to deliver.' : 'You need a keke: hire one by the day at the motor park first.', at: hasKeke ? null : { x: park.x, z: park.z, label: `Job: hire a keke, ${park.name}` } },
      { id: 'school', title: 'Learn blocklaying (course)', where: school.name, pay: `Costs ${tr(BUSINESSES.school.fee)}`, hours: `${school.opens}:00 to ${school.closes}:00`, open: open(school),
        how: 'A certificate lets you lay blocks on your own plot.', at: { x: school.x, z: school.z, label: `Course: blocklaying, ${school.name}` } },
    ];
    root.append(section('Jobs open now'));
    const marked = app.waypoint();
    for (const j of list) {
      const taken = marked && j.at && marked.label === j.at.label;
      root.append(h('div', { class: 'qty' },
        h('div', null, h('strong', null, j.title), h('div', { class: 'eyebrow' }, `${j.where} · ${j.hours}${j.open ? '' : ' · closed now'}`), h('div', { class: 'small' }, j.how)),
        h('span', { class: 'mono' }, j.pay),
        j.at ? h('button', { class: `btn ${taken ? 'quiet' : 'primary'}`, type: 'button', onclick: () => { if (taken) { app.setWaypoint(null); redraw({ text: 'Job let go. The radar no longer points there.' }); } else { app.setWaypoint(j.at); redraw({ text: `Taken: ${j.title.toLowerCase()}. Follow the yellow line on the radar.` }); } } }, taken ? 'Let it go' : 'Take the job') : null));
    }
    root.append(section('Delivery runs'));
    legacy.runs(root);
    root.append(section('What newcomers do'));
    legacy.journal(root);
  }

  function notices(root) {
    const rows = log();
    if (!rows.length) { root.append(h('p', null, 'Nothing yet. Receipts, notices from government and the police, and calls are kept here.')); return; }
    root.append(h('div', { class: 'rows' }, rows.slice().reverse().map((e) => h('div', { class: 'line' }, h('span', null, h('strong', null, e.title || { receipt: 'Receipt', gov: 'Government', police: 'Police', note: 'Note' }[e.type] || 'Note'), h('div', { class: 'small' }, e.text), h('div', { class: 'eyebrow mono' }, `${when(e.at)}${e.txn ? ` · ${e.txn}` : ''}`)), h('span', { class: e.amount > 0 ? 'pos' : e.amount < 0 ? 'neg' : '' }, e.amount ? `${e.amount > 0 ? '+' : '−'}${amt(Math.abs(e.amount))}` : '')))));
  }

  function settings(root) { legacy.settings(root, Object.values(CAMERA_VIEW).map((v) => v.name)); }

  // The conversation in which something is bought or sold: the handset comes out with it open.
  function openDeal(args) {
    const pending = marketUI.openDeal(args);
    if (kit.isOpen() && kit.isDevice()) go('deal'); else show('deal');
    return pending;
  }
  function leaveDeal() { marketUI.closeDeal(); kit.close(); }

  return { charge, show, go, openDeal, leaveDeal, market: marketUI, wallet: walletUI, get screen() { return screen; }, tick() { if (ticking) ticking(); } };
}
