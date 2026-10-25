// One on-screen action button: the game's one way of making a button a player presses with a finger, a mouse, a
// key or a controller. Every touch control is made here (controls.js), and so is any control added later (an
// aircraft's, a boat's): it gets the same look and the same handling without being designed again.
//
// The look (the owner's screenshots of 16 October 2026; template.html, "The action buttons"): a see-through
// button with a thin luminous blue outline and a blue drawing, the town showing through it; while it is pressed,
// the outline, the drawing and a faint fill turn green, and the moment it is let go it is blue again.
//
// The handling:
//   - pressed: the instant a finger, a mouse button or a pen comes down on it (pointerdown), never on `click`;
//   - let go: when that pointer comes up, is cancelled (the system took the touch, a call came in), when the
//     page loses it, or when the finger is dragged well off the button. It cannot stay lit: a backstop also lets
//     go when that pointer comes up anywhere on the page, or when no finger is left on the glass;
//   - a keyboard or screen reader's `click` (no pointer) presses and lets go at once;
//   - kind 'tap' does its thing once as it goes down; 'hold' does it for as long as it is held ('down' and 'up'
//     are both told); 'toggle' is a tap that the game shows as on or off (aria-pressed).
//
//   const b = createActionButton({ id: 'throttle', kind: 'hold', onDown, onUp });
//   b.configure({ icon, label, shape: 'pedal-tall', size: [78, 128], place: { right: 18, bottom: 26 } });
//   b.setLit(true) / b.setLit(false)        lit by something other than a pointer (a key, a controller)
//   b.release()                              let go now (the page is hidden, the controls change)

const DRAG_OFF = 28;            // px beyond its edge that a held finger may wander before the button lets go

// `onMove(dx, dy)`: for a button that is also dragged (configure({ drag: true }): the gun's Shoot, dragged to aim as it
// fires), how far the finger has moved since last told, in pixels; such a button is not let go when dragged off it.
export function createActionButton({ id, kind = 'tap', onDown = () => {}, onUp = () => {}, onMove = null }) {
  const el = document.createElement('button');
  el.type = 'button';
  el.dataset.id = id;
  const st = { kind, pointer: null, held: false, lit: false, drag: false, x: 0, y: 0 };

  const show = () => el.classList.toggle('down', st.held || st.lit);
  function down(pointerId) {
    if (st.held) return;
    st.held = true; st.pointer = pointerId;
    show();
    onDown(id);
  }
  function up() {
    if (!st.held) return;
    st.held = false; st.pointer = null;
    show();
    // (a tap has already done its thing on the way down: only a hold is told it has ended)
    if (st.kind === 'hold') onUp(id);
  }

  el.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    try { el.setPointerCapture(event.pointerId); } catch (error) { /* the pointer has already gone */ }
    st.x = event.clientX; st.y = event.clientY;
    down(event.pointerId);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(type, (event) => { if (st.pointer === event.pointerId) up(); });
  // dragged off: a finger that slides well away from the button lets it go (the button is captured, so it is
  // told where the finger goes)
  el.addEventListener('pointermove', (event) => {
    if (st.pointer !== event.pointerId) return;
    // (one dragged as well as pressed: its movement told, and it stays held wherever the finger goes)
    if (st.drag) { const dx = event.clientX - st.x, dy = event.clientY - st.y; st.x = event.clientX; st.y = event.clientY; if ((dx || dy) && onMove) onMove(dx, dy); return; }
    const r = el.getBoundingClientRect();
    const out = Math.max(r.left - event.clientX, event.clientX - r.right, r.top - event.clientY, event.clientY - r.bottom);
    if (out > DRAG_OFF) up();
  });
  el.addEventListener('click', (event) => {
    if (event.detail !== 0) return;          // a pointer's click: answered already, on the way down
    down(-1); up();
  });
  el.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    el,
    id,
    get held() { return st.held; },
    get pointer() { return st.pointer; },
    // Sets what it shows and how it behaves. `place` is { right, bottom } (or left/top) in px; `size` is [w, h];
    // `shape` is 'round' (the default), 'pedal-tall', 'pedal-wide' or 'rounded'.
    configure({ kind: k, shape, size, place, drag } = {}) {
      if (k) st.kind = k;
      st.drag = !!drag;
      el.dataset.shape = shape || 'round';
      if (size) { el.style.width = `${size[0]}px`; el.style.height = `${size[1]}px`; }
      if (place) for (const side of ['left', 'right', 'top', 'bottom']) if (place[side] !== undefined) el.style[side] = typeof place[side] === 'number' ? `${place[side]}px` : place[side];
    },
    // lit while a key or a controller button is held (the screen shows what the player is doing, however)
    setLit(on) { if (st.lit === !!on) return; st.lit = !!on; show(); },
    release() { up(); st.lit = false; show(); },
    // from the page: this pointer has come up somewhere else, or no finger is left on the glass
    pointerGone(pointerId) { if (st.held && (pointerId === undefined || st.pointer === pointerId) && st.pointer !== -1) up(); },
  };
}
