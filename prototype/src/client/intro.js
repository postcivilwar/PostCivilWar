// The opening: the brand while the game gets ready (five seconds), then the game's cover with PLAY on it, then
// the one question every player answers, once.
//
// The question is asked here, straight after PLAY, when it is already known that it has never been answered
// (a copy of the game with no accounts, and no answer kept on the device). On the website the answer belongs to
// the account, and who is playing is not known until they have signed in: there the opening ends at PLAY, and
// the question is put later, by `question()`, to an account that has never answered it. It is never put twice.
//
// The markup and its animations are in template.html, so the splash is on screen before this script
// has been read. This file keeps time (which stage is showing, what was answered) and lays the cover out.
//
// The cover is one supplied picture, carried in four pieces (tools/brand/cover.py): the plate, the name, the
// four lines of words, and the painted PLAY button. On a 16:9 screen they go back exactly where they were. On
// any other screen each is put where there is room, so that the whole name, the two figures and PLAY are
// always in view: that is what coverLayout works out, and it is kept apart from the page so it can be tested.
//
// Two things a browser decides, not the game:
//   - no sound may play before the player has touched the page. PLAY is that touch: it is why everything
//     after it can be heard;
//   - a player who asked their device for less motion gets the cover without its push-in.

import { COVER } from './brand-data.js';

export const INTRO_TIMES = { splash: 5000, chosen: 950, leave: 450, play: 220 };
export const PATHS = ['hero', 'villain'];

// Which key answers the question, if any: the first letter of either word.
export function pathForKey(key) {
  const k = String(key || '').toLowerCase();
  return k === 'h' ? 'hero' : k === 'v' ? 'villain' : null;
}

// Where the cover's pieces go on a screen W by H (pixels). Every box is { x, y, w, h } in pixels from the
// screen's top left; `words` is null where there is no room for them. `inset` is what the device keeps for
// itself at each edge (a notch, a home bar).
export function coverLayout(W, H, cover = COVER, inset = {}) {
  const A = cover.aspect;
  const a = W / H;
  const safe = { top: inset.top || 0, right: inset.right || 0, bottom: inset.bottom || 0, left: inset.left || 0 };
  const figures = { x: cover.figures[0], w: cover.figures[2] };
  const out = { mode: a >= 1.2 ? 'wide' : 'tall', plate: null, logo: null, words: null, play: null, hit: null };

  if (out.mode === 'wide') {
    // the plate covers the screen
    const ph = Math.max(H, W / A), pw = ph * A;
    let px = 0, py = 0;
    const wordsFit = a >= A * 0.9;
    if (pw > W) px = wordsFit ? W - pw : Math.max(W - pw, Math.min(0, W - (figures.x + figures.w + 0.02) * pw));
    if (ph > H) py = -(ph - H) * 0.12;
    out.plate = { x: px, y: py, w: pw, h: ph };
    // the name and PLAY keep the places they have in the picture, as one group at the left, at the size of
    // the largest whole picture this screen could show
    const vh = Math.min(H, W / A), vw = vh * A;
    const top = (H - vh) * 0.4;
    const left = safe.left;
    const box = (piece) => ({ x: left + piece.x * vw, y: top + piece.y * vh, w: piece.w * vw, h: piece.h * vh });
    out.logo = box(cover.logo);
    out.play = box(cover.play);
    if (wordsFit) {
      const w = cover.words.w * vw;
      out.words = { x: W - safe.right - (1 - cover.words.x - cover.words.w) * vw - w, y: top + cover.words.y * vh, w, h: cover.words.h * vh };
    }
  } else {
    // a tall screen: sky and the name above, the two figures below them, PLAY at the foot
    const top = Math.max(H * 0.035, safe.top + 10);
    const lw = Math.min(W * 0.62, H * 0.33 * cover.logo.ratio);
    const lh = lw / cover.logo.ratio;
    out.logo = { x: (W - lw) / 2, y: top, w: lw, h: lh };
    const band = top + lh + H * 0.012;
    const ph = Math.max(H - band, W / A), pw = ph * A;
    const px = Math.max(W - pw, Math.min(0, W / 2 - (figures.x + figures.w / 2) * pw));
    out.plate = { x: px, y: band, w: pw, h: ph };
    const w = Math.max(Math.min(W - 40, 190), Math.min(W * 0.6, 340));
    const h = w / cover.play.ratio;
    out.play = { x: (W - w) / 2, y: H - Math.max(H * 0.05, safe.bottom + 18) - h, w, h };
  }
  // PLAY is never smaller than a finger: where the picture's own button would be, the touch area is grown
  const grow = Math.max(0, 48 - out.play.h) / 2;
  out.hit = { x: out.play.x, y: out.play.y - grow, w: out.play.w, h: out.play.h + grow * 2 };
  return out;
}

export function createIntro({ audio, sound, ask, onDone, cover = COVER, times = INTRO_TIMES }) {
  const root = document.getElementById('intro');
  // (the opening is put away, not thrown away: the question may still have to be asked)
  const done = (path) => { if (root) { root.hidden = true; root.classList.remove('leaving', 'ready'); root.dataset.stage = 'done'; } onDone(path); };
  let asking = null;             // the question put after the opening is over: { resolve }
  let later = null;              // (filled in below: how the question is put again)
  const closed = { stage: () => 'done', active: () => false, ready: () => false, question: () => (later ? later() : Promise.resolve(null)), asking: () => !!asking };
  if (!root) { onDone(null); return closed; }
  const skipped = location.hash.includes('nointro');

  const $ = (id) => document.getElementById(id);
  const stageBox = root.querySelector('.gamecover');
  const plate = $('cover-plate'), logo = $('cover-logo'), words = $('cover-words'), play = $('cover-play'), playArt = $('cover-play-art');
  const mute = $('intro-mute');
  const startedAt = typeof window.__introAt === 'number' ? window.__introAt : performance.now();
  let stage = skipped ? 'done' : 'splash';
  let answered = false;
  let ready = false;             // the cover is up and PLAY can be pressed
  const log = { played: false, playedAt: 0, coverAt: 0, path: null, layout: null };

  // The cover's pieces are inside the page already; decoding them ahead keeps the cover from arriving in parts.
  stageBox.style.setProperty('--cover-sky', cover.sky);
  plate.alt = cover.alt;
  const pieces = [[plate, cover.plate], [logo, cover.logo.src], [words, cover.words.src], [playArt, cover.play.src]];
  const decoded = Promise.all(pieces.map(([img, src]) => {
    img.src = src;
    img.draggable = false;
    return (img.decode ? img.decode() : Promise.resolve()).catch(() => {});
  }));

  // What the device keeps for itself at the edges, read from the page's own style (env() cannot be read directly).
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  root.appendChild(probe);
  const insets = () => { const c = getComputedStyle(probe); const n = (v) => parseFloat(v) || 0; return { top: n(c.paddingTop), right: n(c.paddingRight), bottom: n(c.paddingBottom), left: n(c.paddingLeft) }; };

  const put = (el, box) => {
    if (!box) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.style.left = `${box.x.toFixed(2)}px`; el.style.top = `${box.y.toFixed(2)}px`;
    el.style.width = `${box.w.toFixed(2)}px`; el.style.height = `${box.h.toFixed(2)}px`;
  };
  function layout() {
    if (stage === 'done' || skipped) return;
    const W = root.clientWidth, H = root.clientHeight;
    if (!W || !H) return;
    const at = coverLayout(W, H, cover, insets());
    put(plate, at.plate); put(logo, at.logo); put(words, at.words);
    // the button is its touch area; the painted button is drawn inside it at its own size
    put(play, at.hit);
    playArt.style.cssText = `position:absolute;left:0;top:${(at.play.y - at.hit.y).toFixed(2)}px;width:${at.play.w.toFixed(2)}px;height:${at.play.h.toFixed(2)}px`;
    stageBox.dataset.mode = at.mode;
    log.layout = at;
  }
  layout();
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', layout);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', layout);
  const watch = typeof ResizeObserver === 'function' ? new ResizeObserver(layout) : null;
  if (watch) watch.observe(root);

  // Sound: on unless the player has turned it off, here or in Settings, and remembered either way.
  const showSound = () => { mute.setAttribute('aria-pressed', String(sound.on())); mute.setAttribute('aria-label', sound.on() ? 'Sound is on. Turn it off' : 'Sound is off. Turn it on'); };
  showSound();
  mute.addEventListener('click', (event) => { event.stopPropagation(); sound.toggle(); showSound(); if (sound.on()) { audio.start(); setTimeout(() => audio.choose('move'), 80); } });

  const onKey = (event) => {
    if (stage === 'done' && !asking) return;
    if (stage === 'cover' && (event.key === 'Enter' || event.key === ' ') && event.target !== mute) { event.preventDefault(); begin(); return; }
    if (stage === 'choice' || asking) { const path = pathForKey(event.key); if (path) choose(path); }
  };
  window.addEventListener('keydown', onKey);

  function setStage(next) {
    stage = next;
    root.dataset.stage = next;
  }

  // The splash is over: the cover, with PLAY the one thing to press.
  function showCover() {
    if (stage !== 'splash') return;
    layout();
    setStage('cover');
    ready = true;
    root.classList.add('ready');
    play.tabIndex = 0;
    log.coverAt = Math.round(performance.now() - startedAt);
  }

  // PLAY was pressed. It is the page's first touch, so the sound is started here; the game goes on a moment
  // later, once the browser has let the sound through and the press has been seen.
  function begin() {
    if (stage !== 'cover' || log.played) return;
    log.played = true;
    log.playedAt = Math.round(performance.now() - startedAt);
    if (sound.on()) { audio.start(); const ring = () => audio.choose('move'); if (!ring()) setTimeout(ring, 90); }
    play.disabled = true;
    setTimeout(question, times.play);
  }

  function question() {
    if (stage === 'choice' || stage === 'done') return;
    if (!ask()) { leave(null); return; }
    setStage('choice');
  }

  function choose(path) {
    if (answered || (stage !== 'choice' && !asking) || !PATHS.includes(path)) return;
    answered = true;
    log.path = path;
    if (sound.on()) audio.start();
    // the very first touch of the page may be this one, and the town may be being built behind it: the sound is
    // tried again for a moment, until the browser lets it through
    let tries = 0;
    const ring = () => { if (audio.choose(path) || (tries += 1) > 10) return; setTimeout(ring, 90); };
    ring();
    for (const button of root.querySelectorAll('.pick')) {
      button.classList.toggle('chosen', button.dataset.path === path);
      button.classList.toggle('passed', button.dataset.path !== path);
      button.setAttribute('aria-pressed', String(button.dataset.path === path));
      button.disabled = true;
    }
    setTimeout(() => leave(path), times.chosen);
  }

  function leave(path) {
    stage = 'done';
    if (asking) {
      // The question was put after the opening: it goes away as it came, and whoever asked has the answer.
      // It is still "being asked" until the answer has been handed over: if it stopped being so while it was
      // going away, anything that looked in that half second (the town becoming ready, a sign-in) would find
      // the question neither on the screen nor answered, and put it a second time.
      const pending = asking;
      root.classList.add('leaving');
      setTimeout(() => { root.hidden = true; root.classList.remove('leaving'); root.dataset.stage = 'done'; if (asking === pending) asking = null; pending.resolve(path); }, times.leave);
      return;
    }
    window.removeEventListener('resize', layout);
    window.removeEventListener('orientationchange', layout);
    if (window.visualViewport) window.visualViewport.removeEventListener('resize', layout);
    if (watch) watch.disconnect();
    root.classList.add('leaving');
    setTimeout(() => done(path), times.leave);
  }

  for (const button of root.querySelectorAll('.pick')) {
    button.addEventListener('click', () => choose(button.dataset.path));
    // a pointer passing over an answer ticks; a finger has no "over", so on touch only the choice sounds
    button.addEventListener('pointerenter', (event) => { if (event.pointerType === 'mouse' && !answered && (stage === 'choice' || asking)) audio.choose('move'); });
  }
  play.addEventListener('click', begin);

  // The question, put after the opening is over: to an account that has never answered it. Gives the answer.
  // Asked while it is already being asked, it is the same asking.
  later = function question() {
    if (asking) return asking.promise;
    let resolve; const promise = new Promise((ok) => { resolve = ok; });
    asking = { resolve, promise };
    answered = false;
    for (const button of root.querySelectorAll('.pick')) { button.classList.remove('chosen', 'passed'); button.setAttribute('aria-pressed', 'false'); button.disabled = false; }
    root.hidden = false; root.classList.remove('leaving');
    stage = 'choice'; root.dataset.stage = 'choice';
    return promise;
  };
  if (skipped) { done(null); return { ...closed, question: later, asking: () => !!asking, choose, stage: () => (asking ? 'choice' : 'done'), active: () => !!asking }; }

  // The splash has its five seconds, counted from when it first appeared, not from when this script woke.
  // Then the cover takes its place: nothing is pressed to get from one to the other.
  const wait = Math.max(0, times.splash - (performance.now() - startedAt));
  setTimeout(() => { decoded.then(showCover); }, wait);

  return {
    stage: () => stage,
    active: () => stage !== 'done' || !!asking,
    question: later, asking: () => !!asking,
    ready: () => ready,
    log,
    layout,
    // for the checks: without a pointer
    begin, choose,
    skip: question,
  };
}
