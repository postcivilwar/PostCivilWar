// Making a character: a woman or a man, one of the owner's supplied figures, its colours and a name.
//
// The same view is used three ways (`setMode`):
//   choose    a new player, choosing. What is shown is what will be chosen, and it is remembered on the device.
//   locked    the character is already the account's (a new journey after a saved game was erased): only that
//             one is shown, and there is nothing to change it with.
//   gallery   someone with a character, looking at the others. Every character can be turned and watched; none
//             of it chooses anything, remembers anything or touches the name. Changing is the upgrade's business.
//
// The figure is drawn here as the game will draw it, from the same baked data and the same skeleton, in its
// own small view: turned by dragging, changed by a flick or the arrows. Nothing here decides anything; the
// choice goes to the simulation when the player enters the town, and it checks what it is given
// (src/sim/figures.js).

import { FIGURES, FIGURE_ORDER, FIGURE_SWATCHES } from '../sim/figures.js';
import { createChoice } from './choice.js';
import { makeCharacter, animateCharacter } from './character.js';
import { figureHere, figureTurn, figureProgress, warmFigures } from './animated.js';
import { sharedRenderer, drawIn } from './shared-view.js';
import { LIGHT } from './light.js';

const PART_NAMES = { skin: 'Skin', hair: 'Hair', top: 'Top', bottom: 'Bottom', shoes: 'Shoes', hat: 'Hat' };
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

// `lazy`: someone who already has a character may never look at this screen: its view (the turntable, its lights, the
// figure on it) is not made until the screen is actually on show; until then this costs nothing but the buttons.
// `held`: while it says so (the opening is on the screen in front of this one), nothing here is made or fetched: the
// first figure is not fetched before the player has pressed PLAY (20 October 2026, the owner's brief).
export function createCreator({ canvas, root, nameField, onPick, onView = () => {}, saved, lazy = false, held = () => false }) {
  const choice = createChoice(saved);
  let mode = 'choose';
  const $ = (id) => document.getElementById(id);
  let named = false;       // the player has typed a name of their own; until then the field holds the figure's own
  nameField.addEventListener('input', () => { named = nameField.value.trim().length > 0; });

  // ------------------------------------------------------------------ the view --
  // Drawn by the town's renderer, the page's one drawing surface (shared-view.js, 20 October 2026), on the town's own
  // canvas, put in this view's box under this view's canvas (which stays clear, and takes the touches). Only a page
  // without the town's renderer gives this view's canvas a renderer of its own.
  let renderer = null, scene = null, camera = null, turntable = null, shared = false;
  // made the first time it is needed: at once, or (lazy) when the screen is first on show
  function ensure() {
    if (renderer) return;
    if (sharedRenderer()) { renderer = sharedRenderer(); shared = true; }
    else {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
    scene.add(new THREE.HemisphereLight(0xe8eef6, 0x2a2622, 0.75 * LIGHT));
    const key = new THREE.DirectionalLight(0xfff4e6, 1.15 * LIGHT); key.position.set(2.2, 3.4, 3.0); scene.add(key);
    const rim = new THREE.DirectionalLight(0xbfd2ff, 0.55 * LIGHT); rim.position.set(-2.6, 2.4, -2.8); scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.42, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.06, depthWrite: false }));
    floor.rotation.x = -Math.PI / 2; scene.add(floor);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.41, 0.418, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.002; scene.add(ring);
    turntable = new THREE.Group(); scene.add(turntable);
    show(0);
  }

  // ---------------------------------------------------------------- on its way --
  // A character asked for is shown at once (20 October 2026, the owner's brief: on a phone the next character took a
  // minute or more to appear): its picture from all round (tools/characters/previews.mjs), turned with the turntable,
  // with a soft light passing over it and a thin line for how much of the figure has come, until the figure itself is
  // here; then the picture fades and the figure stands where it was. Where even the picture has not come yet, the
  // outline of a person stands in for it. Nothing here waits: the arrows go on to the next one whenever pressed.
  const box = canvas.parentElement;
  const preview = document.createElement('div'); preview.className = 'fig-preview'; preview.setAttribute('aria-hidden', 'true');
  const shine = document.createElement('i'); shine.className = 'shine'; preview.append(shine);
  const waitLine = document.createElement('div'); waitLine.className = 'fig-wait'; waitLine.setAttribute('aria-hidden', 'true');
  const waitFill = document.createElement('i'); waitLine.append(waitFill);
  const trouble = document.createElement('div'); trouble.className = 'fig-trouble'; trouble.hidden = true; trouble.setAttribute('role', 'status');
  const troubleText = document.createElement('p'); troubleText.textContent = 'This character could not be fetched just now.';
  const troubleRetry = document.createElement('button'); troubleRetry.type = 'button'; troubleRetry.className = 'hx small'; troubleRetry.textContent = 'Try again';
  troubleRetry.addEventListener('click', () => { trouble.hidden = true; if (shown) { dispose(shown); shown = build(); turntable.add(shown.rig.group); } });
  trouble.append(troubleText, troubleRetry);
  if (box) box.append(preview, waitLine, trouble);
  const pictures = new Map();           // turntable url -> 'loading' | 'here' | 'failed'
  function fetchPicture(url) {
    if (!url || pictures.has(url)) return;
    pictures.set(url, 'loading');
    const img = new Image();
    img.onload = () => { pictures.set(url, 'here'); };
    img.onerror = () => { pictures.set(url, 'failed'); };
    img.src = url;
  }
  // the characters either side of this one (their pictures at once, small; their figures once this one has come)
  function neighbours() { const n = EVERYONE.length, i = placeOf(); return n > 1 ? [EVERYONE[(i + 1) % n].id, EVERYONE[(i - 1 + n) % n].id] : []; }
  let previewShown = null;              // which figure the picture is showing, or null
  function drawPreview(entry, cam, w, h) {
    const rig = entry && entry.rig;
    const waiting = !!(rig && rig.animated && !rig.mixer && !rig.failed && !rig.stopped);
    const turn = waiting ? figureTurn(entry.id) : null;
    if (turn) fetchPicture(turn.url);
    const failed = !!(rig && rig.failed);
    if (trouble.hidden === failed) trouble.hidden = !failed;
    if (!waiting) {
      if (previewShown) { preview.classList.remove('on'); waitLine.classList.remove('on'); previewShown = null; }
      return;
    }
    // where the figure stands on the screen: its band from the ground up, as the camera sees it
    const x = rig.group.position.x;
    const low = new THREE.Vector3(x, turn ? turn.band[0] : -0.08, 0).project(cam), high = new THREE.Vector3(x, turn ? turn.band[1] : 2.0, 0).project(cam);
    const top = (1 - (high.y + 1) / 2) * h, bottom = (1 - (low.y + 1) / 2) * h;
    const tall = Math.max(1, bottom - top), wide = tall * (turn ? turn.frame[0] / turn.frame[1] : 2 / 3);
    const centre = ((low.x + 1) / 2) * w;
    preview.style.left = `${(centre - wide / 2).toFixed(1)}px`; preview.style.top = `${top.toFixed(1)}px`;
    preview.style.width = `${wide.toFixed(1)}px`; preview.style.height = `${tall.toFixed(1)}px`;
    const here = turn && pictures.get(turn.url) === 'here';
    if (here) {
      const k = ((Math.round(yaw / ((Math.PI * 2) / turn.frames)) % turn.frames) + turn.frames) % turn.frames;
      const col = k % turn.cols, row = Math.floor(k / turn.cols);
      const size = `${turn.cols * 100}% ${turn.rows * 100}%`, at = `${turn.cols > 1 ? (col / (turn.cols - 1)) * 100 : 0}% ${turn.rows > 1 ? (row / (turn.rows - 1)) * 100 : 0}%`;
      if (preview.dataset.url !== turn.url) { preview.dataset.url = turn.url; preview.style.backgroundImage = `url("${turn.url}")`; shine.style.webkitMaskImage = shine.style.maskImage = `url("${turn.url}")`; }
      preview.style.backgroundSize = size; preview.style.backgroundPosition = at;
      shine.style.webkitMaskSize = shine.style.maskSize = size; shine.style.webkitMaskPosition = shine.style.maskPosition = at;
      preview.classList.remove('outline');
    } else if (preview.dataset.url !== 'outline') {
      // (the picture itself not here yet: the outline of a person)
      preview.dataset.url = 'outline'; preview.style.backgroundImage = ''; shine.style.webkitMaskImage = shine.style.maskImage = '';
      preview.classList.add('outline');
    }
    if (previewShown !== entry.id) { previewShown = entry.id; preview.classList.add('on'); waitLine.classList.add('on'); }
    const p = figureProgress(entry.id);
    waitFill.style.width = `${p && p.of ? Math.min(100, (100 * p.got) / p.of).toFixed(1) : 4}%`;
  }

  let shown = null;          // { rig, id, key }
  let leaving = null;        // the one sliding out
  let slide = 0, slideDir = 0;
  let yaw = 0.35, spin = 0;  // radians; spin is what a flick of the finger leaves turning
  let last = performance.now();
  let anim = null;           // the animation chosen for a figure that has its own

  function lookKey() { return JSON.stringify(choice.look()); }
  function build() {
    const look = choice.look();
    const rig = makeCharacter(look, null, false, 0);
    rig.group.position.set(0, 0, 0);
    if (rig.animated) {
      // a figure with its own animations plays the one the player picks, where it stands
      rig.held = true;
      rig.play(anim || rig.spec.still, 0);
      rig.loaded.then(() => {
        if (!shown || shown.rig !== rig) return;
        drawAnims();
        // the figures either side, fetched ahead into the browser's cache, quietly
        warmFigures(neighbours());
      }, () => { if (shown && shown.rig === rig) drawAnims(); });
      if (typeof navigator === 'undefined' || navigator.onLine !== false) for (const id of neighbours()) { const t = figureTurn(id); if (t) fetchPicture(t.url); }
    }
    return { rig, id: look.figure, key: lookKey() };
  }
  function dispose(entry) { if (!entry) return; turntable.remove(entry.rig.group); entry.rig.dispose(); }

  // a new figure slides in from the side it was asked for; a new colour is the same figure redrawn
  function show(dir = 0) {
    if (!renderer) return;              // (not made yet: the figure is put on it when it is)
    const next = build();
    if (shown && dir === 0) { dispose(shown); shown = next; turntable.add(next.rig.group); return; }
    dispose(leaving);
    leaving = shown; shown = next; turntable.add(next.rig.group);
    slide = 1; slideDir = dir || 1;
  }

  function frame(now) {
    const raw = Math.max(0, (now - last) / 1000), dt = Math.min(0.05, raw); last = now;
    if (!root.isConnected) return;
    if (root.offsetParent === null || root.hidden || held()) { requestAnimationFrame(frame); return; }
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!renderer) { if (w > 0 && h > 0) ensure(); else { requestAnimationFrame(frame); return; } }
    if (shared) { if (w > 0 && h > 0) { camera.aspect = w / h; camera.updateProjectionMatrix(); } }
    else if (w > 0 && h > 0 && (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio()))) {
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    // the whole figure fits between the switch at the top and the name at the foot, whichever way the screen is turned
    const top = 8, foot = 6;
    const band = Math.max(80, h - top - foot) / Math.max(1, h);
    const tall = 1.76, half = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const dist = Math.max(tall / band / 2 / half, (0.95 / Math.max(0.3, camera.aspect)) / half) + 0.4;
    const shift = ((top + (h - foot)) / 2 - h / 2) / Math.max(1, h);        // the band's middle, below the screen's middle
    const visible = 2 * dist * half;
    camera.position.set(0, 0.95 + shift * visible, dist); camera.lookAt(0, 0.92 + shift * visible, 0);
    if (!dragging) { yaw += spin * dt; spin *= Math.pow(0.04, dt); if (Math.abs(spin) < 0.02) spin = 0; }
    if (slide > 0) slide = Math.max(0, slide - Math.min(0.2, raw) * 3.2);
    const ease = slide * slide * (3 - 2 * slide);
    if (shown) {
      shown.rig.group.position.x = slideDir * ease * 1.6;
      shown.rig.group.rotation.y = yaw;
      animateCharacter(shown.rig, dt, 0, false);
    }
    if (leaving) {
      leaving.rig.group.position.x = -slideDir * (1 - ease) * 1.6;
      leaving.rig.group.rotation.y = yaw;
      animateCharacter(leaving.rig, dt, 0, false);
      if (slide === 0) { dispose(leaving); leaving = null; }
    }
    drawPreview(shown, camera, w, h);
    if (shared) drawIn(canvas.parentElement, scene, camera, { pixelRatio: Math.min(window.devicePixelRatio || 1, 2) });
    else renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------------- turning --
  // One finger on the figure turns it, and a quick turn keeps it spinning a little. Only the arrows and the dots
  // change the figure. The page itself still scrolls up and down from inside the view.
  let dragging = false, startX = 0, lastX = 0, startT = 0, lastT = 0, velocity = 0;
  canvas.style.touchAction = 'pan-y';
  canvas.addEventListener('pointerdown', (e) => { dragging = true; startX = lastX = e.clientX; startT = lastT = e.timeStamp; velocity = 0; spin = 0; try { canvas.setPointerCapture(e.pointerId); } catch (error) { /* a pointer the page cannot hold on to */ } });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const t = e.timeStamp; const dx = e.clientX - lastX;
    yaw += dx * 0.012;
    velocity = (dx * 0.012) / Math.max(0.008, (t - lastT) / 1000);
    lastX = e.clientX; lastT = t;
  });
  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    // when the finger went down and came up, by the events' own clocks: a busy page handles them late
    spin = Math.max(-6, Math.min(6, velocity));
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', () => { dragging = false; });

  // ------------------------------------------------------------------ the controls --
  let part = 'skin';
  function drawControls() {
    const f = choice.figure;
    for (const b of $('genders').children) b.setAttribute('aria-pressed', String(b.dataset.gender === choice.gender));
    $('fig-name').textContent = f.name;
    // the arrows and the dots go through every character there is, the women and then the men: with one of
    // each they would otherwise have nothing to do
    const here = placeOf();
    $('fig-count').textContent = `${here + 1} of ${EVERYONE.length}`;
    $('fig-dots').replaceChildren(...EVERYONE.map((entry, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.setAttribute('aria-label', `${FIGURES[entry.id].name}, ${i + 1} of ${EVERYONE.length}`);
      b.setAttribute('aria-current', String(i === here));
      b.addEventListener('click', () => { if (i !== here) goTo(i, i > here ? 1 : -1); });
      return b;
    }));
    const fixed = mode === 'locked';
    $('fig-prev').disabled = fixed || EVERYONE.length < 2; $('fig-next').disabled = fixed || EVERYONE.length < 2;
    $('genders').hidden = fixed; $('fig-prev').hidden = fixed; $('fig-next').hidden = fixed; $('fig-dots').hidden = fixed; $('fig-count').hidden = fixed;
    $('colour-block').hidden = !f.parts.length;
    $('anim-block').hidden = !f.animated;
    if (f.animated) drawAnims();
    if (!f.parts.includes(part)) part = 'skin';
    $('part-tabs').replaceChildren(...f.parts.map((p) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'part'; b.textContent = PART_NAMES[p];
      b.setAttribute('aria-pressed', String(p === part));
      const chip = document.createElement('i'); chip.style.background = hex(choice.colours[p]); b.prepend(chip);
      b.addEventListener('click', () => { part = p; drawControls(); });
      return b;
    }));
    const now = choice.colours[part];
    $('part-swatches').replaceChildren(...FIGURE_SWATCHES[part].map((c, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'swatch'; b.style.background = hex(c);
      b.setAttribute('aria-label', `${PART_NAMES[part]} colour ${i + 1}`); b.setAttribute('aria-pressed', String(c === now));
      b.addEventListener('click', () => { if (mode !== 'choose') return; choice.colour(part, c); drawControls(); show(0); onPick && onPick(choice.look()); });
      return b;
    }));
    if (!named && mode !== 'gallery') nameField.value = f.name;
  }
  // the animations a figure came with, by their one-word names; the one playing is marked
  function drawAnims() {
    const rig = shown && shown.rig;
    const labels = rig && rig.animated ? rig.labels : [];
    const playing = rig && rig.animated ? (rig.chosen || (rig.current && rig.current.getClip().name)) : null;
    $('anim-list').replaceChildren(...(labels.length ? labels.map(({ name, label }) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'part'; b.textContent = label; b.dataset.anim = name;
      b.setAttribute('aria-pressed', String(name === playing));
      b.addEventListener('click', () => { anim = name; shown.rig.play(name, 0.35); drawAnims(); });
      return b;
    }) : skeletonPills()));
  }
  // while a figure's animations are on their way: their places, as pills with a soft light passing over them
  function skeletonPills() {
    const failed = rig_failed();
    if (failed) return [Object.assign(document.createElement('span'), { className: 'small', textContent: 'The animations will be here when the character is.' })];
    return [52, 64, 44, 70, 56, 48].map((w) => { const b = document.createElement('span'); b.className = 'part skeleton'; b.style.width = `${w}px`; b.setAttribute('aria-hidden', 'true'); return b; });
  }
  const rig_failed = () => !!(shown && shown.rig && shown.rig.failed);
  // (only a new player's choosing is remembered; looking is not choosing)
  // (the animations are drawn again once the new figure is on the turntable: until it has come, their places)
  function changed(dir) { drawControls(); show(dir); if (choice.figure.animated) drawAnims(); if (mode === 'choose' && onPick) onPick(choice.look()); onView(choice.figure.id); }
  // (a copy of the game opened from a file on disk carries only the first two figures inside it, and can fetch
  // nothing: there only those are offered; on the website every one is)
  const EVERYONE = Object.keys(FIGURE_ORDER).flatMap((gender) => FIGURE_ORDER[gender].map((id, index) => ({ gender, index, id }))).filter((e) => figureHere(e.id));
  function placeOf() { return Math.max(0, EVERYONE.findIndex((e) => e.gender === choice.gender && e.index === choice.index)); }
  function goTo(i, dir) { if (mode === 'locked') return; const to = EVERYONE[i]; if (to.gender !== choice.gender) choice.setGender(to.gender); choice.go(to.index); changed(dir); }
  function step(by) { const n = EVERYONE.length; if (n > 1) goTo((placeOf() + by + n) % n, by); }
  for (const b of $('genders').children) b.addEventListener('click', () => { if (mode !== 'locked' && b.dataset.gender !== choice.gender) { choice.setGender(b.dataset.gender); changed(1); } });
  // Shows one character, by its id, without that being a choice.
  function showFigure(id) {
    const at = EVERYONE.findIndex((e) => e.id === id);
    if (at < 0) return false;
    const to = EVERYONE[at];
    if (to.gender !== choice.gender) choice.setGender(to.gender);
    choice.go(to.index);
    drawControls(); show(0); if (choice.figure.animated) drawAnims(); onView(choice.figure.id);
    return true;
  }
  function setMode(next, figure = null) {
    const to = next === 'locked' || next === 'gallery' ? next : 'choose';
    // (asked for what is already so: nothing is built again)
    if (to === mode && (!figure || figure === choice.figure.id)) { onView(choice.figure.id); return; }
    mode = to;
    if (figure && figure !== choice.figure.id) showFigure(figure); else { drawControls(); onView(choice.figure.id); }
  }
  $('fig-prev').addEventListener('click', () => step(-1));
  $('fig-next').addEventListener('click', () => step(1));
  root.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowLeft') { step(-1); e.preventDefault(); } else if (e.key === 'ArrowRight') { step(1); e.preventDefault(); }
  });

  drawControls();
  if (!lazy && !held()) ensure();
  requestAnimationFrame(frame);
  return {
    look: () => choice.look(),
    choice, setMode, showFigure,
    get mode() { return mode; },
    figure: () => choice.figure.id,
    // for the checks: what is on the turntable
    get shown() { return shown ? { id: shown.id, key: shown.key, triangles: shown.rig.triangles, yaw, animation: shown.rig.animated && shown.rig.current ? shown.rig.current.getClip().name : null, preview: previewShown === shown.id ? (preview.classList.contains('outline') ? 'outline' : 'picture') : null, failed: shown.rig.failed || null } : null; },
    playing: () => (shown && shown.rig.animated && shown.rig.current ? shown.rig.current.getClip().name : null),
    step, go: (i) => { choice.go(i); changed(1); }, setGender: (g) => { choice.setGender(g); changed(1); }, colour: (p, c) => { choice.colour(p, c); drawControls(); show(0); },
    get rig() { return shown ? shown.rig : null; },
  };
}
