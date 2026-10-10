// Making a character: a woman or a man, one of the owner's supplied figures, its colours and a name.
//
// The figure is drawn here as the game will draw it, from the same baked data and the same skeleton, in its
// own small view: turned by dragging, changed by a flick or the arrows. Nothing here decides anything; the
// choice goes to the simulation when the player enters the town, and it checks what it is given
// (src/sim/figures.js).

import { FIGURES, FIGURE_ORDER, FIGURE_SWATCHES } from '../sim/figures.js';
import { createChoice } from './choice.js';
import { makeCharacter, animateCharacter } from './character.js';

const PART_NAMES = { skin: 'Skin', hair: 'Hair', top: 'Top', bottom: 'Bottom', shoes: 'Shoes', hat: 'Hat' };
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

export function createCreator({ canvas, root, nameField, onPick, saved }) {
  const choice = createChoice(saved);
  const $ = (id) => document.getElementById(id);
  let named = false;       // the player has typed a name of their own; until then the field holds the figure's own
  nameField.addEventListener('input', () => { named = nameField.value.trim().length > 0; });

  // ------------------------------------------------------------------ the view --
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  scene.add(new THREE.HemisphereLight(0xe8eef6, 0x2a2622, 0.75));
  const key = new THREE.DirectionalLight(0xfff4e6, 1.15); key.position.set(2.2, 3.4, 3.0); scene.add(key);
  const rim = new THREE.DirectionalLight(0xbfd2ff, 0.55); rim.position.set(-2.6, 2.4, -2.8); scene.add(rim);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(0.42, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.06, depthWrite: false }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.41, 0.418, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.002; scene.add(ring);

  const turntable = new THREE.Group(); scene.add(turntable);
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
      rig.loaded.then(() => { if (shown && shown.rig === rig) drawAnims(); });
    }
    return { rig, id: look.figure, key: lookKey() };
  }
  function dispose(entry) { if (!entry) return; turntable.remove(entry.rig.group); entry.rig.dispose(); }

  // a new figure slides in from the side it was asked for; a new colour is the same figure redrawn
  function show(dir = 0) {
    const next = build();
    if (shown && dir === 0) { dispose(shown); shown = next; turntable.add(next.rig.group); return; }
    dispose(leaving);
    leaving = shown; shown = next; turntable.add(next.rig.group);
    slide = 1; slideDir = dir || 1;
  }

  function frame(now) {
    const raw = Math.max(0, (now - last) / 1000), dt = Math.min(0.05, raw); last = now;
    if (!root.isConnected) return;
    if (root.offsetParent === null || root.hidden) { requestAnimationFrame(frame); return; }
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w > 0 && h > 0 && (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio()))) {
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
    renderer.render(scene, camera);
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
    $('fig-count').textContent = `${choice.index + 1} of ${choice.count}`;
    $('fig-dots').replaceChildren(...FIGURE_ORDER[choice.gender].map((id, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.setAttribute('aria-label', `${FIGURES[id].name}, ${i + 1} of ${choice.count}`);
      b.setAttribute('aria-current', String(i === choice.index));
      b.addEventListener('click', () => { if (i !== choice.index) { const dir = i > choice.index ? 1 : -1; choice.go(i); changed(dir); } });
      return b;
    }));
    $('fig-prev').disabled = choice.count < 2; $('fig-next').disabled = choice.count < 2;
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
      b.addEventListener('click', () => { choice.colour(part, c); drawControls(); show(0); onPick && onPick(choice.look()); });
      return b;
    }));
    if (!named) nameField.value = f.name;
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
    }) : [Object.assign(document.createElement('span'), { className: 'small', textContent: 'Loading the animations…' })]));
  }
  function changed(dir) { drawControls(); show(dir); onPick && onPick(choice.look()); }
  function step(by) { choice.step(by); changed(by); }
  for (const b of $('genders').children) b.addEventListener('click', () => { if (b.dataset.gender !== choice.gender) { choice.setGender(b.dataset.gender); changed(1); } });
  $('fig-prev').addEventListener('click', () => step(-1));
  $('fig-next').addEventListener('click', () => step(1));
  root.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowLeft') { step(-1); e.preventDefault(); } else if (e.key === 'ArrowRight') { step(1); e.preventDefault(); }
  });

  drawControls();
  show(0);
  requestAnimationFrame(frame);
  return {
    look: () => choice.look(),
    choice,
    // for the checks: what is on the turntable
    get shown() { return shown ? { id: shown.id, key: shown.key, triangles: shown.rig.triangles, yaw, animation: shown.rig.animated && shown.rig.current ? shown.rig.current.getClip().name : null } : null; },
    playing: () => (shown && shown.rig.animated && shown.rig.current ? shown.rig.current.getClip().name : null),
    step, go: (i) => { choice.go(i); changed(1); }, setGender: (g) => { choice.setGender(g); changed(1); }, colour: (p, c) => { choice.colour(p, c); drawControls(); show(0); },
    get rig() { return shown ? shown.rig : null; },
  };
}
