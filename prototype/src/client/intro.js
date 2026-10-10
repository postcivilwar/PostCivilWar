// The opening: the brand while the game gets ready (five seconds), PLAY, the story in five pictures at a
// second each with a camera's shutter on every one, then the one question every player answers.
//
// The markup and its animations are in template.html, so the splash is on screen before this script
// has been read. This file only keeps time: which stage is showing, which picture, and what was answered.
//
// Two things a browser decides, not the game:
//   - no sound may play before the player has touched the page. PLAY is that touch: it is why the story's
//     shutters and everything after them can be heard;
//   - a player who asked their device for less motion gets the pictures without the flash and the push-in.

import { STORY_SLIDES } from './brand-data.js';

export const INTRO_TIMES = { splash: 5000, slide: 1000, chosen: 950, leave: 450 };
export const PATHS = ['hero', 'villain'];

// How long the picture just shown stays up. The story keeps to its clock: picture n goes up n seconds in.
// If the device was busy and a picture went up late, it gives up some of its turn, but never to less than
// a third of one, so that every picture is seen. Kept apart from the page so it can be tested without one.
export function slideDelay(shownCount, elapsedMs, each = INTRO_TIMES.slide) {
  return Math.max(each / 3, shownCount * each - elapsedMs);
}

// Which key answers the question, if any: the first letter of either word.
export function pathForKey(key) {
  const k = String(key || '').toLowerCase();
  return k === 'h' ? 'hero' : k === 'v' ? 'villain' : null;
}

export function createIntro({ audio, sound, ask, onDone, slides = STORY_SLIDES, times = INTRO_TIMES }) {
  const root = document.getElementById('intro');
  const done = (path) => { if (root) root.remove(); onDone(path); };
  if (!root) { onDone(null); return { stage: () => 'done', active: () => false }; }
  if (location.hash.includes('nointro')) { done(null); return { stage: () => 'done', active: () => false }; }

  const $ = (id) => document.getElementById(id);
  const image = $('slide-img');
  const backdrop = $('slide-bg');
  const flash = $('slide-flash');
  const play = $('intro-play');
  const mute = $('intro-mute');
  const startedAt = typeof window.__introAt === 'number' ? window.__introAt : performance.now();
  let stage = 'splash';
  let ready = false;             // the five seconds are up and PLAY is showing
  let shown = -1;
  let storyAt = 0;
  let answered = false;
  let timer = 0;
  const log = { shutters: 0, slides: [], path: null, played: false };

  // The pictures are inside the page already; decoding them ahead keeps the first second from being a blank one.
  // They are held on to until the opening is over, so the browser does not throw the decoded pictures away again.
  const held = [];
  const decoded = Promise.all(slides.map((slide) => {
    const img = new Image();
    img.src = slide.src;
    held.push(img);
    return (img.decode ? img.decode() : Promise.resolve()).catch(() => {});
  }));

  // Sound: on unless the player has turned it off, here or in Settings, and remembered either way.
  const showSound = () => { mute.setAttribute('aria-pressed', String(sound.on())); mute.setAttribute('aria-label', sound.on() ? 'Sound is on. Turn it off' : 'Sound is off. Turn it on'); };
  showSound();
  mute.addEventListener('click', (event) => { event.stopPropagation(); sound.toggle(); showSound(); if (sound.on()) { audio.start(); setTimeout(() => audio.choose('move'), 80); } });
  const heard = () => sound.on() && audio.running;

  const onKey = (event) => {
    if (stage === 'done') return;
    if (stage === 'splash' && ready && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); begin(); return; }
    if (stage === 'slides' && (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); question(); return; }
    if (stage === 'choice') { const path = pathForKey(event.key); if (path) choose(path); }
  };
  window.addEventListener('keydown', onKey);

  function setStage(next) {
    stage = next;
    root.dataset.stage = next;
  }

  function show(index) {
    shown = index;
    const slide = slides[index];
    image.alt = slide.alt;
    image.src = slide.src;
    backdrop.style.backgroundImage = `url(${slide.src})`;
    // restart the push-in and the flash: taking the class off and on again in one go would do nothing
    image.classList.remove('in'); flash.classList.remove('go');
    void image.offsetWidth;
    image.classList.add('in'); flash.classList.add('go');
    if (heard() && audio.shutter()) log.shutters += 1;
    log.slides.push({ id: slide.id, at: Math.round(performance.now() - storyAt) });
  }

  // PLAY was pressed. It is the page's first touch, so the sound is started here; the story follows a
  // moment later, once the browser has let the sound through.
  function begin() {
    if (stage !== 'splash' || !ready || log.played) return;
    log.played = true;
    if (sound.on()) audio.start();
    play.disabled = true;
    setTimeout(story, 160);
  }

  function story() {
    if (stage !== 'splash') return;
    if (!slides.length) { question(); return; }
    setStage('slides');
    storyAt = performance.now();
    show(0);
    // Every picture is shown, in order, whatever the device is busy with: a late timer shortens the next
    // picture's turn (never below a third of a second) rather than skipping one.
    const step = () => {
      if (stage !== 'slides') return;
      if (shown + 1 >= slides.length) { question(); return; }
      show(shown + 1);
      timer = setTimeout(step, slideDelay(shown + 1, performance.now() - storyAt, times.slide));
    };
    timer = setTimeout(step, times.slide);
  }

  function question() {
    clearTimeout(timer);
    if (stage === 'choice' || stage === 'done') return;
    if (!ask()) { leave(null); return; }
    setStage('choice');
  }

  function choose(path) {
    if (answered || stage !== 'choice' || !PATHS.includes(path)) return;
    answered = true;
    log.path = path;
    if (sound.on()) audio.start();
    // the very first touch of the page may be this one: give the sound a moment to be let through
    const ring = () => audio.choose(path);
    if (!ring()) setTimeout(ring, 90);
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
    held.length = 0;
    window.removeEventListener('keydown', onKey);
    root.classList.add('leaving');
    setTimeout(() => done(path), times.leave);
  }

  for (const button of root.querySelectorAll('.pick')) {
    button.addEventListener('click', () => choose(button.dataset.path));
    // a pointer passing over an answer ticks; a finger has no "over", so on touch only the choice sounds
    button.addEventListener('pointerenter', (event) => { if (event.pointerType === 'mouse' && !answered && stage === 'choice') audio.choose('move'); });
  }
  play.addEventListener('click', begin);
  $('intro-skip').addEventListener('click', (event) => { event.stopPropagation(); question(); });

  // The splash has its five seconds, counted from when it first appeared, not from when this script woke.
  // Then PLAY takes the place of the loading marks.
  const wait = Math.max(0, times.splash - (performance.now() - startedAt));
  setTimeout(() => {
    decoded.then(() => {
      if (stage !== 'splash') return;
      ready = true;
      root.classList.add('ready');
      play.tabIndex = 0;
    });
  }, wait);

  return {
    stage: () => stage,
    active: () => stage !== 'done',
    ready: () => ready,
    log,
    // for the checks: without a pointer
    begin, choose,
    skip: question,
  };
}
