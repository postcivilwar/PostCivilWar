// One drawing surface for the whole page (20 October 2026, the owner's brief: on an iPhone the character screen had a
// drawing surface of its own beside the town's, every figure's pictures were sent to the graphics card twice, and
// together they went past what the phone allows a page, which then took the picture away).
//
// The town's renderer (main.js) draws the character screen's turntable (creator.js) and the market's viewer
// (asset-view.js) too: each is drawn into a corner of the town's own canvas, out of sight (the town is not being shown
// while either is up), and copied from there onto the small canvas on the page, which is an ordinary 2D canvas. One
// graphics context, and one copy of each picture on the graphics card.
//
// A page that has no town's renderer (the tools that photograph the vehicles, the character lab) does not register
// one, and each view makes its own as before.
//
// The character screen is drawn on the town's canvas itself (`drawIn`): while the town is not being shown, the canvas
// is put inside the turntable's box, under the turntable's own (now clear) canvas, which still takes the touches, and
// main.js puts it back where it lives (`canvasHome`) the moment the town is shown. Copying the picture onto a 2D canvas
// every frame (`drawInto`) made the page wait each time for the graphics card to finish drawing it (53 ms a frame in
// the test browser, against half a millisecond to draw), so it is kept for the market's viewer, which is looked at
// still, for a moment.

let shared = null;
let free = () => false;              // is the town's canvas free to be sized for a view (the town not being shown)?
let away = () => false;              // is the drawing surface away just now (taken by the browser, being given back)?
let home = null;                     // where the town's canvas lives: { parent, next }
export function shareRenderer(renderer, { idle = () => false, paused = () => false } = {}) {
  shared = renderer; free = idle; away = paused;
  const c = renderer.domElement;
  home = c.parentNode ? { parent: c.parentNode, next: c.nextSibling } : null;
}
export const sharedRenderer = () => shared;
// Is the town's canvas away from where it lives (in a view's box)?
export const canvasAway = () => !!(shared && home && shared.domElement.parentNode !== home.parent);
// The town's canvas put back where it lives. Gives true if it was away (the caller sizes it for the town again).
export function canvasHome() {
  if (!canvasAway()) return false;
  const c = shared.domElement;
  home.parent.insertBefore(c, home.next && home.next.parentNode === home.parent ? home.next : null);
  c.classList.remove('in-view'); c.removeAttribute('aria-hidden');
  return true;
}

// A view that holds a picture the graphics card made by drawing (a reflection: no file holds it) makes it again when the
// browser gives the drawing surface back (main.js calls `renewViews` then). Gives a function that stops it.
const renewals = new Set();
export function onRestored(renew) { renewals.add(renew); return () => renewals.delete(renew); }
export function renewViews() {
  let n = 0;
  for (const renew of [...renewals]) { try { renew(); n += 1; } catch (error) { /* that view is left as it was */ } }
  return n;
}

const keep = { colour: null, size: null, own: null };
// Draws `scene` from `camera` on the town's canvas itself, put inside `box` (an element on the page, positioned) under
// whatever else the box holds, the size of the box at `pixelRatio`, with the background left clear. Only while the
// town is not being shown (otherwise nothing is drawn, and false is given).
export function drawIn(box, scene, camera, { pixelRatio = 2, toneMapping = null, exposure = null } = {}) {
  const r = shared;
  if (!r || away() || !free() || !box) return false;
  const w = box.clientWidth, h = box.clientHeight;
  if (!w || !h) return false;
  const c = r.domElement;
  if (c.parentNode !== box) { box.insertBefore(c, box.firstChild); c.classList.add('in-view'); c.setAttribute('aria-hidden', 'true'); }
  if (!keep.colour) { keep.colour = new THREE.Color(); keep.size = new THREE.Vector2(); }
  if (!keep.own) keep.own = new THREE.Vector2();
  const pr = Math.max(0.5, pixelRatio);
  if (r.getPixelRatio() !== pr) r.setPixelRatio(pr);
  const size = r.getSize(keep.own);
  if (size.x !== w || size.y !== h) r.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  const before = { target: r.getRenderTarget(), autoClear: r.autoClear, alpha: r.getClearAlpha(), tone: r.toneMapping, exposure: r.toneMappingExposure };
  r.getClearColor(keep.colour);
  try {
    r.setRenderTarget(null);
    r.setScissorTest(false);
    r.setViewport(0, 0, w, h);
    r.setClearColor(0x000000, 0);
    r.autoClear = false;
    r.clear(true, true, true);
    if (toneMapping !== null) r.toneMapping = toneMapping;
    if (exposure !== null) r.toneMappingExposure = exposure;
    r.render(scene, camera);
  } finally {
    r.setClearColor(keep.colour, before.alpha);
    r.autoClear = before.autoClear;
    r.toneMapping = before.tone; r.toneMappingExposure = before.exposure;
    r.setRenderTarget(before.target);
  }
  return true;
}
// Draws `scene` from `camera` onto the 2D canvas `target`, at its size on the page times `pixelRatio` (no more than the
// shared canvas holds), with the background left clear. `toneMapping` and `exposure`, where given, are this view's
// own, and the renderer is put back as it was afterwards. Gives false if there is nothing to draw with.
export function drawInto(target, scene, camera, { pixelRatio = 2, toneMapping = null, exposure = null } = {}) {
  const r = shared;
  if (!r || away()) return false;
  const w = target.clientWidth, h = target.clientHeight;
  if (!w || !h) return false;
  if (!keep.colour) { keep.colour = new THREE.Color(); keep.size = new THREE.Vector2(); }
  let buffer = r.getDrawingBufferSize(keep.size);
  // While the town is not being shown, its canvas is made the size of this view and no larger (a phone's graphics
  // memory is not spent on a whole screen of it at twice the screen's pixels); main.js sizes it for the town again
  // the moment the town is shown. Otherwise the view is as sharp as asked within what the canvas holds.
  if (free()) {
    const want = [Math.max(1, Math.floor(w * pixelRatio)), Math.max(1, Math.floor(h * pixelRatio))];
    if (buffer.x !== want[0] || buffer.y !== want[1]) { r.setPixelRatio(1); r.setSize(want[0], want[1], false); buffer = r.getDrawingBufferSize(keep.size); }
  }
  const rpr = r.getPixelRatio();
  const pr = Math.max(0.5, Math.min(pixelRatio, buffer.x / w, buffer.y / h));
  const pw = Math.max(1, Math.floor(w * pr)), ph = Math.max(1, Math.floor(h * pr));
  if (target.width !== pw || target.height !== ph) { target.width = pw; target.height = ph; }
  const g = target.getContext('2d');
  if (!g) return false;
  camera.aspect = w / h; camera.updateProjectionMatrix();
  const before = { target: r.getRenderTarget(), autoClear: r.autoClear, alpha: r.getClearAlpha(), tone: r.toneMapping, exposure: r.toneMappingExposure };
  r.getClearColor(keep.colour);
  try {
    r.setRenderTarget(null);
    r.setViewport(0, 0, pw / rpr, ph / rpr);
    r.setScissor(0, 0, pw / rpr, ph / rpr);
    r.setScissorTest(true);
    r.setClearColor(0x000000, 0);
    r.autoClear = false;
    r.clear(true, true, true);
    if (toneMapping !== null) r.toneMapping = toneMapping;
    if (exposure !== null) r.toneMappingExposure = exposure;
    r.render(scene, camera);
    g.clearRect(0, 0, pw, ph);
    g.drawImage(r.domElement, 0, buffer.y - ph, pw, ph, 0, 0, pw, ph);
  } finally {
    r.setScissorTest(false);
    r.setViewport(0, 0, buffer.x / rpr, buffer.y / rpr);
    r.setClearColor(keep.colour, before.alpha);
    r.autoClear = before.autoClear;
    r.toneMapping = before.tone; r.toneMappingExposure = before.exposure;
    r.setRenderTarget(before.target);
  }
  return true;
}
