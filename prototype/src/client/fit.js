// Fitting the screen: nothing drawn over the town ever lies on anything else, on any phone, either way up.
//
// The top band (the map at the top left; life, money, time and place at the top right) is measured as it is
// drawn: it grows when the life bar appears, and it is taller on some screens than others. Everything below it
// is then made to fit between it and the foot of the screen:
//   - the buttons on the right, as one group, made smaller about the bottom right corner if they would reach
//     up into the band (a phone held sideways is short);
//   - the stick on the left, the same about the bottom left corner;
//   - the Skills button at the middle of the right edge, moved up or down only as far as needed to stay clear
//     of the band and of the buttons below it, and its page of five made smaller if it cannot otherwise fit;
//   - notices, which start just below the band (--under).
// It reads a few rectangles and writes a few numbers, a few times a second; it never builds anything.
//
// A button placed from the top of the screen rather than from the corner (the horn on a motorcycle or in a car: it is
// marked `--fit: top` in the page's styles) is not one of the group: it is put just below the band (--top-room, the
// room from the band down to the corner) and kept out of the group's reach. Counted in, its place, which follows the
// group's scale, fed the scale back, and where the page is shorter than the screen's own height (an iPhone's browser,
// whose 100vh is the screen without its bars) the buttons grew smaller every few tenths of a second until they were
// gone (the owner's recording of 29 October 2026, in his car on an upright iPhone).

const GAP = 8;
// (the group is never made smaller than this: on the shortest screen a button may come near the band, never vanish)
const SMALLEST = 0.55;

const rectOf = (el) => (el && !el.hidden && el.offsetParent !== null ? el.getBoundingClientRect() : null);

export function createFitter({ game, hud, radar, hudr, stick, pad, skillsBtn, skillsPage, isOpen }) {
  let padScale = 1, stickScale = 1, arcScale = 1;
  let last = '';

  function set(name, value) { game.style.setProperty(name, value); }

  function fit() {
    const g = game.getBoundingClientRect();
    if (!g.height) return null;
    const top = g.top, H = g.height, W = g.width;
    // the band: the lowest edge of what is at the top
    let band = 0;
    for (const el of [radar, hudr]) { const r = rectOf(el); if (r && r.height) band = Math.max(band, r.bottom - top); }
    const floor = band + GAP;
    // (on the HUD itself, whose own rules otherwise set it)
    hud.style.setProperty('--under', `${Math.round(band + 6)}px`);

    // the buttons on the right: their natural reach up from the bottom of the screen, at full size
    const shown = [...pad.children].filter((el) => el.getBoundingClientRect().height > 0);
    const fromTop = (el) => getComputedStyle(el).getPropertyValue('--fit').trim() === 'top';
    const pads = shown.filter((el) => !fromTop(el));
    const corner = pad.getBoundingClientRect();           // #pad is a point at the bottom right
    let reach = 0, reachRight = 0;                        // highest point of the whole group; of those at the right edge
    for (const el of pads) {
      const r = el.getBoundingClientRect();
      const up = (corner.bottom - r.top) / padScale;
      reach = Math.max(reach, up);
      if ((corner.right - r.left) / padScale < 100) reachRight = Math.max(reachRight, up);
    }
    const room = H - floor - (H - (corner.bottom - top));
    let ps = reach > 0 ? Math.max(SMALLEST, Math.min(1, room / reach)) : 1;

    // the Skills button, at the middle of the right edge if it can be: below the band, above the buttons at the edge
    const btn = rectOf(skillsBtn);
    const half = btn ? btn.height / 2 / 1 : 29;
    const bottomRef = corner.bottom - top;
    let centre = H / 2;
    if (btn) {
      const open = isOpen();
      if (!open && reachRight > 0) {
        // keep it above the right-hand column; if that column is too tall for both, the buttons give way
        const lowest = bottomRef - reachRight * ps - GAP - half;
        const highest = floor + half;
        if (lowest < highest) { ps = Math.max(SMALLEST, ps * ((bottomRef - highest - half - GAP) / (reachRight * ps))); }
        centre = Math.max(highest, Math.min(centre, bottomRef - reachRight * ps - GAP - half));
      } else centre = Math.max(floor + half, Math.min(centre, H - half - GAP));
      // the page of five round it: 129 px above the middle to 143 below at full size (75 + 54 + a name)
      const above = 129, below = 143;
      let as = Math.min(1, (H - floor - GAP) / (above + below));
      let c = Math.max(floor + above * as, Math.min(centre, bottomRef - below * as - GAP));
      if (open) centre = Math.max(floor + half, c);
      arcScale = as;
    }
    padScale = ps;
    // the stick: its top below the band (it is low and to the left, so this only matters on a very short screen)
    const s = rectOf(stick);
    if (s) {
      const natural = (top + H - s.top) / stickScale;
      stickScale = Math.min(1, (H - floor) / natural);
    }
    // the room from the band down to the corner, for a button placed from the top (below the band)
    const topRoom = Math.max(0, Math.round(room));
    const key = `${padScale.toFixed(3)}|${stickScale.toFixed(3)}|${arcScale.toFixed(3)}|${Math.round(centre)}|${topRoom}`;
    if (key !== last) {
      last = key;
      set('--top-room', `${topRoom}px`);
      set('--pad-scale', padScale.toFixed(3));
      set('--stick-scale', stickScale.toFixed(3));
      set('--arc-scale', arcScale.toFixed(3));
      set('--skills-y', `${Math.round(centre)}px`);
    }
    return { band, padScale, stickScale, arcScale, centre, H, W, topRoom };
  }
  return { fit };
}
