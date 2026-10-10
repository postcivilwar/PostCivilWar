// Controls: the keys that are down, the touch stick, and the touch buttons.
//
// Every touch button answers the finger that lands on it, whichever finger
// that is. A browser sends `click` only for the first finger on the screen, so
// a button that waits for `click` does nothing while a thumb is on the stick:
// that was why Run could not be switched while moving.
//
// Which buttons are on screen is decided by the game's state (on foot, in a
// fight, driving, held by the police) and handed to `layout`. This file knows
// nothing about what a button means.

import { icon } from './icons.js';

const SLOTS = 7;                 // buttons round the main one

export function createControls({ stick, pad }) {
  const knob = stick.firstElementChild;
  const state = { keys: new Set(), stickX: 0, stickY: 0, run: false };
  const held = new Set();
  const listeners = [];
  const buttons = new Map();     // id -> { el, spec, pointer, at }
  let stickPointer = null;
  let signature = '';

  const emit = (id, phase) => { for (const fn of listeners) fn(id, phase); };

  // ------------------------------------------------------------ the stick --

  const moveStick = (event) => {
    const rect = stick.getBoundingClientRect();
    let x = (event.clientX - rect.left - rect.width / 2) / (rect.width / 2);
    let y = (event.clientY - rect.top - rect.height / 2) / (rect.height / 2);
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    state.stickX = x; state.stickY = y;
    if (steerOnly) { const art = stick.querySelector('.wheelart'); if (art) art.style.transform = `rotate(${x * 120}deg)`; knob.style.transform = ''; }
    else knob.style.transform = `translate(${x * 33}px, ${y * 33}px)`;
  };
  const dropStick = () => { stickPointer = null; state.stickX = 0; state.stickY = 0; knob.style.transform = ''; const art = stick.querySelector('.wheelart'); if (art) art.style.transform = ''; };
  // At the wheel: the stick is a steering wheel. Only how far it is turned counts; the pedals go and stop.
  let steerOnly = false;
  stick.addEventListener('pointerdown', (event) => {
    if (stickPointer !== null) return;
    event.preventDefault();
    stickPointer = event.pointerId;
    try { stick.setPointerCapture(event.pointerId); } catch (error) { /* the pointer has already gone */ }
    moveStick(event);
  });
  stick.addEventListener('pointermove', (event) => { if (event.pointerId === stickPointer) moveStick(event); });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) stick.addEventListener(type, (event) => { if (event.pointerId === stickPointer) dropStick(); });
  // Backstops. A phone's web view does not always tell the stick that its finger came up: with a second
  // finger on a button, or when the system takes the touch for a gesture, the pointerup can go to the page
  // or nowhere at all, and the stick stayed pushed and the player walked on alone. So the stick also lets go
  // when its pointer comes up anywhere, and whenever the list of fingers still on the glass no longer has
  // its finger in it.
  let stickTouch = null;           // the touch identifier of the finger on the stick, where touch events exist
  stick.addEventListener('touchstart', (event) => { if (stickTouch === null && event.changedTouches.length) stickTouch = event.changedTouches[0].identifier; }, { passive: true });
  for (const type of ['pointerup', 'pointercancel']) window.addEventListener(type, (event) => { if (event.pointerId === stickPointer) dropStick(); }, true);
  const checkTouches = (event) => {
    const still = new Set([...event.touches].map((t) => t.identifier));
    if (stickTouch !== null && !still.has(stickTouch)) { stickTouch = null; dropStick(); }
    if (event.touches.length === 0) {
      stickTouch = null;
      if (stickPointer !== null || state.stickX || state.stickY) dropStick();
      for (const entry of buttons.values()) if (entry.pointer !== null && entry.pointer !== -1) lift(entry);
    }
  };
  for (const type of ['touchend', 'touchcancel']) window.addEventListener(type, checkTouches, { capture: true, passive: true });
  // a touch that starts while the stick thinks it is held, with no other finger down, means the old one is gone
  window.addEventListener('touchstart', (event) => { if (stickTouch !== null && ![...event.touches].some((t) => t.identifier === stickTouch)) { stickTouch = null; dropStick(); } }, { capture: true, passive: true });

  // ---------------------------------------------------------- the buttons --

  function press(entry, pointerId) {
    const { spec } = entry;
    if (spec.kind === 'hold') {
      if (held.has(spec.id)) return;
      held.add(spec.id); entry.pointer = pointerId;
      entry.el.classList.add('down');
      emit(spec.id, 'down');
      return;
    }
    emit(spec.id, 'down');
  }
  function lift(entry) {
    if (!held.delete(entry.spec.id)) return;
    entry.pointer = null;
    entry.el.classList.remove('down');
    emit(entry.spec.id, 'up');
  }

  function make(id) {
    const el = document.createElement('button');
    el.type = 'button';
    el.dataset.id = id;
    const entry = { el, spec: null, pointer: null };
    el.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      if (entry.spec.kind === 'hold') { try { el.setPointerCapture(event.pointerId); } catch (error) { /* gone already */ } }
      press(entry, event.pointerId);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(type, (event) => { if (entry.pointer === event.pointerId) lift(entry); });
    // A keyboard or a screen reader presses a button with `click` and no
    // pointer at all: such a click counts no presses (`detail` is 0). A click
    // that follows a finger or a mouse was answered already, on the way down.
    // (Telling the two apart by the clock fails on a slow device, where the
    // click can be handled a second after the touch that caused it.)
    el.addEventListener('click', (event) => {
      if (event.detail !== 0) return;
      press(entry, -1);
      if (entry.spec.kind === 'hold') lift(entry);
    });
    el.addEventListener('contextmenu', (event) => event.preventDefault());
    pad.append(el);
    return entry;
  }

  // Sets which buttons are shown. `list` is in order of importance: the first
  // marked `primary` is the large one, the rest take the places round it.
  //   { id, label, kind: 'tap' | 'hold' | 'toggle', primary, pressed, tone, hint }
  function layout(list) {
    const next = list.map((b) => `${b.id}|${b.label}|${b.icon || ''}|${b.kind || 'tap'}|${b.primary ? 1 : 0}|${b.pressed ? 1 : 0}|${b.tone || ''}|${b.off ? 1 : 0}`).join('~');
    if (next === signature) return;
    signature = next;
    const seen = new Set();
    let slot = 0;
    for (const spec of list) {
      if (!spec.primary && slot >= SLOTS) continue;
      seen.add(spec.id);
      let entry = buttons.get(spec.id);
      if (!entry) { entry = make(spec.id); buttons.set(spec.id, entry); }
      entry.spec = { kind: 'tap', ...spec };
      const el = entry.el;
      el.className = `pad ${spec.primary ? 'primary' : `slot${slot += 1}`}${spec.tone ? ` ${spec.tone}` : ''}${held.has(spec.id) ? ' down' : ''}`;
      // what the button does is drawn, not written; the word is still there for a screen reader and for a long press
      const drawn = spec.icon || spec.id;
      if (el.dataset.icon !== drawn) { el.dataset.icon = drawn; el.replaceChildren(icon(drawn)); }
      el.setAttribute('aria-label', spec.label);
      if (spec.kind === 'toggle') el.setAttribute('aria-pressed', String(!!spec.pressed)); else el.removeAttribute('aria-pressed');
      el.disabled = !!spec.off;
      el.title = spec.hint || spec.label;
    }
    for (const [id, entry] of buttons) if (!seen.has(id)) { lift(entry); entry.el.remove(); buttons.delete(id); }
  }

  // Lets go of everything: when the page loses the keyboard or is hidden, a
  // key or a finger can be lifted without the page ever being told.
  function release() {
    state.keys.clear();
    dropStick();
    for (const entry of buttons.values()) lift(entry);
  }

  return {
    state,
    layout,
    release,
    on(fn) { listeners.push(fn); },
    held: (id) => held.has(id),
    // Which way the player is pushing: forward and to the right, each -1 to 1.
    axes() {
      const k = state.keys;
      let forward = 0, strafe = 0;
      if (k.has('w') || k.has('ArrowUp')) forward += 1;
      if (k.has('s') || k.has('ArrowDown')) forward -= 1;
      if (k.has('d') || k.has('ArrowRight')) strafe += 1;
      if (k.has('a') || k.has('ArrowLeft')) strafe -= 1;
      // at the wheel on a touch screen there are two pedals as well as the stick
      if (held.has('gas')) forward += 1;
      if (held.has('brake')) forward -= 1;
      return { forward: Math.max(-1, Math.min(1, forward - (steerOnly ? 0 : state.stickY))), strafe: Math.max(-1, Math.min(1, strafe + state.stickX)) };
    },
    // Running is chosen, never guessed: Shift held down, or Run switched on.
    get running() { return state.run || state.keys.has('Shift'); },
    setRun(on) { state.run = !!on; },
    // the stick as a steering wheel (true) or as a stick (false)
    setSteering(on) { if (steerOnly === !!on) return; steerOnly = !!on; dropStick(); },
    get steering() { return steerOnly; },
    // for tests: what is on screen
    get shown() { return [...buttons.values()].map((e) => ({ id: e.spec.id, label: e.spec.label, kind: e.spec.kind, pressed: !!e.spec.pressed, primary: !!e.spec.primary })); },
  };
}
