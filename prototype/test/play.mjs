// Plays the built page in a headless browser and saves screenshots.
//   node test/play.mjs <output-directory>
// Needs Playwright with Chromium. Not part of the unit tests.
import { pastQuestion, enterTown, openingOver, overTown } from './start.mjs';
import { ZONE_RESIDENTS, ZONE_POPULATION } from '../src/sim/zones/atani.js';
// the town's own people: since 22 October 2026 its police (sixteen policewomen walking their beats) and the named
// people at the counters, until the owner's own figures come
const TOWNSPEOPLE = ZONE_POPULATION.jobs.reduce((n, [, count]) => n + count, 0) + ZONE_RESIDENTS.length;
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (error) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(process.argv[2] || resolve(here, '../dist/shots'));
const page_file = 'file://' + resolve(here, '../dist/local.html');
// Every session but the first starts past the opening: the address ending in #nointro leaves it out.
const page_url = page_file + '#nointro-gameclock';      // (the old forty-eight-minute day: the play-throughs skip hours)

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const only = process.argv[3] || null;      // run one session: desktop, town, phone, action or sideways
const problems = [];
async function session(name, viewport, script) {
  if (only && only !== name) return;
  const { touch, ...size } = viewport;
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1, hasTouch: size.width < 600 || !!touch, isMobile: !!touch });
  const page = await context.newPage();
  page.setDefaultTimeout(90000);      // software rendering can take a second a frame
  // The page asks the network for nothing but its own file: every request must succeed.
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`${name}: console: ${m.text()}`); });
  page.on('requestfailed', (r) => problems.push(`${name}: request failed: ${r.url()}`));
  page.on('pageerror', (e) => problems.push(`${name}: ${e.message}`));
  if (name !== 'opening') {
    await page.goto(page_url, { timeout: 300000 });
    // the one question (never answered on this device), then Enter, which is offered once the town is ready to draw
    await pastQuestion(page);
    await page.waitForTimeout(500);
  }
  const shot = async (label) => { await page.waitForTimeout(400); await page.screenshot({ path: resolve(out, `${name}-${label}.png`) }); };
  await script(page, shot);
  await context.close();
}

const nlw = (page, fn, arg) => page.evaluate(fn, arg);

// The opening, as a new player meets it: the brand drawing itself, with a thin line of the loading's real progress,
// for a little over a second (five seconds until 20 October 2026), then the cover and PLAY, the question, and the
// answer going with the character into the town.
// Then the same page again, as that player coming back. The same opening is then looked at on small, tall,
// sideways and tablet screens for the things a wide desk never shows: the name on one line, the two answers
// side by side, and nothing off the edge.
await session('opening', { width: 1280, height: 760 }, async (page, shot) => {
  const bad = (text) => problems.push(`opening: ${text}`);
  // the page is not waited for: the splash is on screen while the game's own script is still being read
  page.goto(page_file, { timeout: 300000 }).catch(() => {});
  await page.waitForSelector('#intro[data-stage="splash"] .wordmark', { timeout: 120000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(out, 'opening-01-splash-early.png') }).catch(() => {});
  const early = await page.evaluate(() => ({
    since: performance.now() - window.__introAt, title: document.title, brand: document.querySelector('.wordmark').getAttribute('aria-label'),
    domain: !!document.querySelector('.splash .domain') || /postcivilwar\.com/i.test(document.querySelector('.splash').textContent), rays: document.querySelectorAll('.splash .mark .ray').length, disc: getComputedStyle(document.querySelector('.splash .mark .disc')).fill,
    ray: getComputedStyle(document.querySelector('.splash .mark .ray')).fill, ground: getComputedStyle(document.querySelector('.splash .wordmark')).color, back: getComputedStyle(document.querySelector('#intro')).backgroundColor,
    face: getComputedStyle(document.querySelector('.wordmark')).fontFamily, scheme: getComputedStyle(document.documentElement).colorScheme }));
  if (early.title !== 'PostCivilWar') bad(`the page is titled "${early.title}"`);
  if (early.brand !== 'Post Civil War') bad(`the splash reads "${early.brand}"`);
  // the address under the name was taken off at the owner's word (10 October 2026)
  if (early.domain) bad('the splash still shows the address');
  if (early.rays !== 8) bad(`the sun has ${early.rays} rays`);
  if (early.ray !== 'rgb(255, 255, 255)' || early.ground !== 'rgb(255, 255, 255)') bad(`the mark and the name are not white: ${early.ray}, ${early.ground}`);
  if (early.disc !== 'rgb(233, 196, 106)') bad(`the sun is ${early.disc}`);
  if (early.back !== 'rgb(0, 0, 0)') bad(`the splash is on ${early.back}`);
  if (!/PCW Arcade/.test(early.face)) bad(`the name is set in ${early.face}`);
  await page.waitForFunction(() => window.__nlw && window.__nlw.intro, null, { timeout: 300000 });
  if (!(await page.evaluate(() => document.fonts.check('20px "PCW Arcade"')))) bad('the arcade font did not load');
  // a little over a second from the first sight of it (INTRO_TIMES.splash), and not before
  const held = await page.evaluate(() => ({ since: performance.now() - window.__introAt, stage: window.__nlw.intro.stage() }));
  if (held.since < 1100 && held.stage !== 'splash') bad(`the splash gave way after ${Math.round(held.since)} ms`);
  await page.waitForFunction(() => performance.now() - window.__introAt > 1700, null, { timeout: 120000 });
  // The splash has one thin loading line (no row of ticks) and nothing to press. It gives way by itself to the
  // cover, the supplied picture, and there the game waits: PLAY, on the cover, is the one way on.
  const onSplash = await page.evaluate(() => ({ buttons: [...document.querySelectorAll('#intro .splash button')].length, line: !!document.querySelector('#intro .splash .load .load-line'), ticks: document.querySelectorAll('.load .ticks i').length, play: !!document.querySelector('#intro-play') }));
  if (onSplash.buttons || onSplash.play) bad('the splash still has a button on it');
  if (!onSplash.line || onSplash.ticks) bad(`the splash has ${onSplash.line ? '' : 'no loading line'}${onSplash.ticks ? ' a row of ticks' : ''}`);
  await page.waitForFunction(() => window.__nlw.intro.ready(), null, { timeout: 120000 });
  await page.waitForTimeout(2200);
  const waiting = await page.evaluate(() => {
    const vis = (sel) => { const e = document.querySelector(sel); if (!e) return false; const c = getComputedStyle(e); return c.display !== 'none' && c.visibility !== 'hidden' && +c.opacity > 0.5 && e.getBoundingClientRect().width > 0; };
    const box = (sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom].map(Math.round); };
    const play = document.querySelector('#cover-play'); const mute = document.querySelector('#intro-mute').getBoundingClientRect();
    const plate = document.querySelector('#cover-plate');
    return { stage: window.__nlw.intro.stage(), since: performance.now() - window.__introAt, play: vis('#cover-play'), name: play.getAttribute('aria-label'), disabled: play.disabled, text: document.querySelector('#intro').textContent,
      splash: vis('#intro .splash'), slides: !!document.querySelector('#slide-img, #intro-skip, .slides'), plate: [plate.naturalWidth, plate.naturalHeight], alt: plate.alt, logoAlt: document.querySelector('#cover-logo').alt,
      boxes: { plate: box('#cover-plate'), logo: box('#cover-logo'), play: box('#cover-play') }, words: vis('#cover-words'), w: innerWidth, h: innerHeight,
      sound: window.__nlw.audio.running, soundOn: document.querySelector('#intro-mute').getAttribute('aria-pressed'), mute: [mute.left, mute.top], played: window.__nlw.intro.log.played, layout: window.__nlw.intro.log.layout.mode };
  });
  if (waiting.since < 1100) bad(`the cover came after ${Math.round(waiting.since)} ms`);
  if (waiting.stage !== 'cover' || !waiting.play || waiting.disabled || waiting.played) bad(`after the splash, untouched: ${JSON.stringify({ stage: waiting.stage, play: waiting.play, disabled: waiting.disabled, played: waiting.played })}`);
  if (waiting.splash) bad('the splash is still showing under the cover');
  if (waiting.slides) bad('the story in pictures is still in the page');
  if (waiting.name !== 'Play') bad(`PLAY is called "${waiting.name}"`);
  if (waiting.plate[0] < 1600 || Math.abs(waiting.plate[0] / waiting.plate[1] - 16 / 9) > 0.02) bad(`the cover picture is ${waiting.plate.join(' by ')}`);
  if (waiting.alt.length < 40 || waiting.logoAlt !== 'Post Civil War') bad('the cover is not described for someone who cannot see it');
  // on a 16:9 window the picture is as it was supplied: it fills the screen, and its pieces are where they were
  { const [l, t, r, b] = waiting.boxes.plate; if (l > 0 || t > 0 || r < waiting.w || b < waiting.h) bad(`the cover leaves a gap: ${waiting.boxes.plate} on ${waiting.w} by ${waiting.h}`); }
  { const [l, t, r, b] = waiting.boxes.play; if (l < 0 || t < 0 || r > waiting.w || b > waiting.h || b - t < 44) bad(`PLAY is at ${waiting.boxes.play}`); if (Math.abs(l / waiting.w - 0.0924) > 0.02 || Math.abs(t / waiting.h - 0.77) > 0.03) bad(`PLAY is not where the picture has it: ${waiting.boxes.play}`); }
  { const [l, t, r, b] = waiting.boxes.logo; if (l < 0 || t < 0 || r > waiting.w || b > waiting.h) bad(`the name is cut off: ${waiting.boxes.logo}`); }
  if (waiting.layout !== 'wide' || !waiting.words) bad(`on a wide screen the cover is laid out "${waiting.layout}", words shown: ${waiting.words}`);
  if (/tap to begin|tap for sound/i.test(waiting.text)) bad('the opening still says to tap');
  if (waiting.sound) bad('sound was playing before the page was touched');
  if (waiting.soundOn !== 'true') bad('sound is not on for a first visit');
  if (waiting.mute[0] > 40 || waiting.mute[1] > 40) bad(`the sound button is at ${waiting.mute.map(Math.round)}, not the top left`);
  await shot('02-cover');
  // it goes no further alone
  await page.waitForTimeout(1500);
  if ((await page.evaluate(() => window.__nlw.intro.stage())) !== 'cover') bad('the cover went on without PLAY being pressed');
  // the sound button: off, and remembered; on again
  await page.click('#intro-mute');
  const off = await page.evaluate(() => ({ pressed: document.querySelector('#intro-mute').getAttribute('aria-pressed'), kept: JSON.parse(localStorage.getItem('nlw-prefs-v1') || '{}').sound, stage: window.__nlw.intro.stage() }));
  if (off.pressed !== 'false' || off.kept !== false) bad(`the sound button turned sound ${JSON.stringify(off)}`);
  if (off.stage !== 'cover') bad('the sound button moved the opening on');
  await page.click('#intro-mute');
  const on = await page.evaluate(() => ({ pressed: document.querySelector('#intro-mute').getAttribute('aria-pressed'), kept: JSON.parse(localStorage.getItem('nlw-prefs-v1') || '{}').sound }));
  if (on.pressed !== 'true' || on.kept !== true) bad(`the sound button turned sound back ${JSON.stringify(on)}`);
  // PLAY is a real button: it takes the pointer, it is pressed once, and the game goes on
  const top = await page.evaluate(() => { const r = document.querySelector('#cover-play').getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return e && (e.id === 'cover-play' || !!e.closest('#cover-play')); });
  if (!top) bad('something lies over PLAY');
  await page.click('#cover-play');
  await page.click('#cover-play', { force: true, timeout: 2000 }).catch(() => {});      // a second press does nothing
  await page.waitForFunction(() => window.__nlw.intro.stage() === 'choice', null, { timeout: 60000 });
  const story = await page.evaluate(() => ({ log: window.__nlw.intro.log, sound: window.__nlw.audio.running }));
  if (!story.log.played || story.log.playedAt < story.log.coverAt) bad(`PLAY was not what moved the opening on: ${JSON.stringify(story.log)}`);
  if (!story.sound) bad('pressing PLAY did not start the sound');
  await shot('04-question');
  const asked = await page.evaluate(() => ({ text: document.querySelector('#choice-title').textContent, picks: [...document.querySelectorAll('.pick')].map((b) => b.dataset.path), face: getComputedStyle(document.querySelector('#choice-title')).fontFamily, start: document.querySelector('#intro').hidden,
    marked: [...document.querySelectorAll('.pick')].filter((b) => b.classList.contains('chosen') || b.getAttribute('aria-pressed') === 'true' || b === document.activeElement).length, fills: [...document.querySelectorAll('.pick')].map((b) => getComputedStyle(b).backgroundColor) }));
  if (asked.marked || asked.fills[0] !== asked.fills[1]) bad(`an answer looks chosen before one is picked: ${JSON.stringify(asked.fills)}`);
  if (!/hero/i.test(asked.text) || !/villain/i.test(asked.text)) bad(`the question reads "${asked.text}"`);
  if (asked.picks.join() !== 'hero,villain' || asked.start) bad(`the answers offered: ${asked.picks}`);
  if (!/PCW Arcade/.test(asked.face)) bad(`the question is set in ${asked.face}`);
  // it must be answered: nothing else on the page can be reached while it is up
  // (tried at points on the screen: where Enter is, if it is on the screen, and across the middle)
  const through = await page.evaluate(() => { const r = document.querySelector('#enter').getBoundingClientRect(); const pts = [[innerWidth / 2, innerHeight / 2], [innerWidth * 0.25, innerHeight * 0.75], [innerWidth * 0.75, innerHeight * 0.25]]; if (r.top >= 0 && r.top < innerHeight - 5) pts.push([r.left + 5, r.top + 5]); return pts.every(([x, y]) => { const top = document.elementFromPoint(x, y); return top && !!top.closest('#intro'); }); });
  if (!through) { const what = await page.evaluate(() => { const r = document.querySelector('#enter').getBoundingClientRect(); const top = document.elementFromPoint(r.left + 5, r.top + 5); return { at: [r.left, r.top], top: top && [...(function* (e) { while (e) { yield e.id || e.className || e.tagName; e = e.parentElement; } })(top)].join('<') }; }); bad(`the start screen can be reached past the question (${JSON.stringify(what)})`); }
  const before = await page.evaluate(() => window.__nlw.audio.status().voices.short);
  // (each sound of the choice the opening asks for is written down as it is asked for, and whether it started: the
  // town is being built behind the question, and on a machine without a graphics card that can hold the page for
  // longer than the sound lasts, so that by the time the test looks it has started and ended)
  await page.evaluate(() => { const a = window.__nlw.audio, was = a.choose; window.__chose = []; a.choose = (path) => { const r = was(path); window.__chose.push([path, r]); return r; }; });
  await page.click('.pick[data-path="villain"]');
  await page.waitForTimeout(250);
  // (the page may be busy building the town just then: the sound is given a moment longer to start)
  await page.waitForFunction((b) => { const s = window.__nlw.audio.status(); return s.voices.short > b || s.level > 0.0005 || window.__chose.some(([p, r]) => p === 'villain' && r); }, before, { timeout: 5000 }).catch(() => {});
  const chosen = await page.evaluate(() => ({ chosen: [...document.querySelectorAll('.pick.chosen')].map((b) => b.dataset.path), path: window.__nlw.intro.log.path, sound: window.__nlw.audio.status() }));
  if (chosen.chosen.join() !== 'villain' || chosen.path !== 'villain') bad(`chose villain, got ${JSON.stringify(chosen.chosen)} ${chosen.path}`);
  const rang = await page.evaluate(() => window.__chose);
  if (!(chosen.sound.voices.short > before || chosen.sound.level > 0.0005 || rang.some(([p, r]) => p === 'villain' && r))) bad(`choosing made no sound (${JSON.stringify({ before, state: chosen.sound.state, muted: chosen.sound.muted, voices: chosen.sound.voices, level: chosen.sound.level, asked: rang })})`);
  await shot('05-chosen');
  await page.waitForFunction(openingOver, null, { timeout: 60000 });
  await page.waitForFunction(() => { const b = document.querySelector('#enter'); return b && !b.disabled; }, null, { timeout: 300000 });
  const start = await page.evaluate(() => ({ again: !!document.querySelector('#paths') || /your path/i.test(document.querySelector('#start').innerText) || [...document.querySelectorAll('#start button')].some((b) => /^(hero|villain)$/i.test(b.textContent.trim())), screen: document.querySelector('#start').dataset.screen, heading: document.querySelector('#start-title').textContent, prefs: JSON.parse(localStorage.getItem('nlw-prefs-v1') || '{}').path, mark: document.querySelectorAll('#start .brand .mark .ray').length, text: document.querySelector('#start').textContent }));
  // the answer is kept, and the screen where the character is made does not ask for it a second time
  if (start.again) bad('the start screen asks hero or villain again');
  if (start.prefs !== 'villain') bad(`the answer was villain; remembered ${start.prefs}`);
  if (start.screen !== 'create' || !/Create your character/.test(start.heading)) bad(`after the question the start screen is "${start.screen}", headed "${start.heading}"`);
  if (start.mark !== 8) bad('the start screen has no mark');
  // the three paragraphs at the foot of the start screen were taken off at the owner's word (10 October 2026)
  if (/There are no accounts yet|Walk with W A S D|This is a browser prototype/i.test(start.text)) bad('the start screen still has the section that was removed');
  // a copy opened from a disk has no server to ask, so it offers no account: no button pretends
  if (/log ?in|create account/i.test(await page.evaluate(() => [...document.querySelectorAll('#start button')].filter((b) => b.offsetParent !== null).map((b) => b.textContent).join(' ')))) bad('a page with no server offers an account');
  await shot('06-start');
  await page.fill('#name', 'Nonso Obi');
  // Enter does not go straight in: the character is for good, so the player is asked to be sure, and may go back
  const unsure = await enterTown(page, { answer: 'no' });
  if (!/^Choose (Adaeze|Emeka)\?$/.test(unsure.title) || unsure.yes !== 'Choose This Character' || unsure.no !== 'Go Back' || !/character upgrade/.test(unsure.body)) bad(`asked to be sure of the character: ${JSON.stringify(unsure)}`);
  if (await page.evaluate(() => !document.querySelector('#hud').hidden || !!window.__nlw.playerId)) bad('Go Back went into the town');
  await enterTown(page);
  await page.waitForFunction(() => window.__nlw.view && window.__nlw.mode === 'walking', null, { timeout: 120000 });
  const kept = await page.evaluate(() => { const n = window.__nlw; return { view: n.view.self.path, state: n.host.game.state.players[n.playerId].path }; });
  if (kept.view !== 'villain' || kept.state !== 'villain') bad(`the simulation holds the path as ${JSON.stringify(kept)}`);
  await page.keyboard.press('Tab'); await page.waitForTimeout(500);
  await page.click('.app:has-text("People")'); await page.waitForTimeout(500);
  const told = await page.textContent('#sheet-body');
  if (!/Villain/.test(told) || !/changes none of the town/.test(told)) bad('the phone does not show the path, or does not say that it changes no rules');
  await shot('07-path-on-phone');
  // coming back: there is a character on this device and the question has been answered, so it is not asked again
  await page.evaluate(() => window.__nlw.saveNow());
  page.goto(page_file, { timeout: 300000 }).catch(() => {});
  await page.waitForSelector('#intro[data-stage="splash"]', { timeout: 120000 });
  await page.waitForFunction(() => window.__nlw && window.__nlw.intro, null, { timeout: 300000 });
  await page.waitForFunction(() => window.__nlw.intro.ready(), null, { timeout: 120000 });
  // the keyboard works it too: Enter on the cover is PLAY
  await page.keyboard.press('Enter');
  await page.waitForFunction(openingOver, null, { timeout: 60000 });
  // ...and there is nothing to choose: PLAY takes them into the town as they were, with no screen in between that
  // offers a character, a path or a name
  await page.waitForFunction(() => window.__nlw.mode === 'walking' && !document.querySelector('#hud').hidden, null, { timeout: 300000 }).catch(() => bad('a returning player was not taken into the town'));
  const back = await page.evaluate(() => ({ asked: window.__nlw.intro.log.path, start: !document.querySelector('#start').hidden, name: window.__nlw.view && window.__nlw.view.self.name, path: window.__nlw.view && window.__nlw.view.self.path }));
  if (back.asked !== null) bad('a returning player was asked the question again');
  if (back.start || back.name !== 'Nonso Obi' || back.path !== 'villain') bad(`a returning player is ${JSON.stringify(back)}`);
  { const over = await page.evaluate(overTown); if (over) bad(`a returning player is in town, but ${over}`); }
  await shot('08-returning');
});

for (const [label, size] of Object.entries({ small: { width: 320, height: 568, touch: true }, tall: { width: 390, height: 844, touch: true }, sideways: { width: 740, height: 360, touch: true }, tablet: { width: 820, height: 1180, touch: true }, 'tablet-sideways': { width: 1180, height: 820, touch: true } })) {
  await session('opening', size, async (page, shot) => {
    const bad = (text) => problems.push(`opening on a ${label} screen: ${text}`);
    page.goto(page_file, { timeout: 300000 }).catch(() => {});
    await page.waitForSelector('#intro[data-stage="splash"] .wordmark', { timeout: 120000 });
    await page.waitForFunction(() => window.__nlw && window.__nlw.intro && window.__nlw.intro.ready(), null, { timeout: 300000 });
    await page.waitForTimeout(2300);      // (the cover has come up, and its pieces have settled)
    const inside = (sels) => page.evaluate((sels) => sels.map((sel) => { const e = document.querySelector(sel); const r = e.getBoundingClientRect(); return { sel, l: r.left, t: r.top, r: r.right, b: r.bottom, w: innerWidth, h: innerHeight }; }).filter((r) => r.l < 0 || r.t < 0 || r.r > r.w + 0.5 || r.b > r.h + 0.5).map((r) => r.sel), sels);
    const splash = await page.evaluate(() => { const span = document.querySelector('.wordmark span').getBoundingClientRect(); const size = parseFloat(getComputedStyle(document.querySelector('.wordmark')).fontSize); const tops = [...document.querySelectorAll('.wordmark i')].map((i) => Math.round(i.getBoundingClientRect().top)); return { lines: Math.round(span.height / size), rows: new Set(tops).size, l: span.left, r: span.right, w: innerWidth, scroll: document.documentElement.scrollWidth > innerWidth + 1 || document.documentElement.scrollHeight > innerHeight + 1 }; });
    if (splash.lines !== 1 || splash.rows !== 1) bad(`the name is on ${Math.max(splash.lines, splash.rows)} lines`);
    if (splash.l < 8 || splash.r > splash.w - 8) bad(`the name runs from ${Math.round(splash.l)} to ${Math.round(splash.r)} of ${splash.w}`);
    if (splash.scroll) bad('the splash scrolls');
    await shot(`10-${label}-cover`);
    // the cover on this screen: the whole name and the whole of PLAY in view, the two figures between the sides,
    // PLAY big enough for a finger, nothing over it, and no gap at the sides or the foot
    const cover = await page.evaluate(() => {
      const L = window.__nlw.intro.log.layout;
      const r = (sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
      const play = r('#cover-play');
      const over = document.elementFromPoint(play.l + play.w / 2, play.t + play.h / 2);
      return { mode: L.mode, plate: r('#cover-plate'), logo: r('#cover-logo'), play, top: !!over && (over.id === 'cover-play' || !!over.closest('#cover-play')), w: innerWidth, h: innerHeight, scroll: document.documentElement.scrollWidth > innerWidth + 1 || document.documentElement.scrollHeight > innerHeight + 1,
        sky: getComputedStyle(document.querySelector('.gamecover')).backgroundColor, stage: window.__nlw.intro.stage() };
    });
    if (cover.stage !== 'cover') bad(`the opening is at "${cover.stage}", not the cover`);
    const within = (b) => b.l >= -0.5 && b.t >= -0.5 && b.r <= cover.w + 0.5 && b.b <= cover.h + 0.5;
    if (!within(cover.logo)) bad(`the name is cut off: ${JSON.stringify(cover.logo)}`);
    if (!within(cover.play)) bad(`PLAY is cut off: ${JSON.stringify(cover.play)}`);
    if (cover.play.h < 47.5 || cover.play.w < 120) bad(`PLAY is ${Math.round(cover.play.w)} by ${Math.round(cover.play.h)}`);
    if (!cover.top) bad('something lies over PLAY');
    if (cover.plate.l > 0.5 || cover.plate.r < cover.w - 0.5 || cover.plate.b < cover.h - 0.5) bad(`the cover leaves a gap: ${JSON.stringify(cover.plate)}`);
    if (cover.logo.b > cover.play.t && cover.logo.r > cover.play.l && cover.logo.l < cover.play.r) bad('the name and PLAY overlap');
    if (cover.scroll) bad('the cover scrolls');
    if ((size.width > size.height * 1.2) !== (cover.mode === 'wide')) bad(`laid out "${cover.mode}" on a ${size.width} by ${size.height} screen`);
    const off1 = await inside(['#cover-logo', '#cover-play', '#intro-mute']);
    if (off1.length) bad(`off the screen on the cover: ${off1.join(', ')}`);
    await page.evaluate(() => window.__nlw.intro.begin());
    await page.waitForFunction(() => window.__nlw.intro.stage() === 'choice', null, { timeout: 180000 });
    await page.waitForTimeout(900);
    const picks = await page.evaluate(() => [...document.querySelectorAll('.pick')].map((b) => { const r = b.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }));
    if (Math.abs(picks[0].t - picks[1].t) > 1 || Math.abs(picks[0].h - picks[1].h) > 1) bad(`the two answers are not on one line: tops ${Math.round(picks[0].t)} and ${Math.round(picks[1].t)}`);
    if (picks[0].r > picks[1].l) bad('the two answers overlap');
    if (Math.abs(picks[0].w - picks[1].w) > 1) bad(`the two answers are ${Math.round(picks[0].w)} and ${Math.round(picks[1].w)} px wide`);
    if (picks[0].h > size.height * 0.2) bad(`an answer is ${Math.round(picks[0].h)} px tall on a ${size.height} px screen`);
    const off3 = await inside(['.pick[data-path="hero"]', '.pick[data-path="villain"]', '#choice-title', '.choice .small']);
    if (off3.length) bad(`off the screen at the question: ${off3.join(', ')}`);
    await shot(`11-${label}-question`);
  });
}

// Making a character from the owner's figures: man and woman, every figure, a swipe, colours that change
// only their own part, the name, Enter, and the same figure in the town and after a reload.
for (const [label, size] of Object.entries({ desk: { width: 1280, height: 760 }, phone: { width: 390, height: 844, touch: true } })) {
  await session('creator', size, async (page, shot) => {
    const bad = (text) => problems.push(`creator (${label}): ${text}`);
    const c = (fn, arg) => page.evaluate(fn, arg);
    await page.waitForFunction(() => window.__creator && window.__creator.shown, null, { timeout: 120000 });
    // the man's figures
    await page.click('[data-gender="m"]'); await page.waitForTimeout(600);
    let s = await c(() => ({ id: window.__creator.shown.id, dots: document.querySelectorAll('#fig-dots button').length, name: document.querySelector('#name').value, label: document.querySelector('#fig-name').textContent }));
    // the arrows and dots go through every character: the woman and the man
    if (s.id !== 'M1' || s.dots !== 2) bad(`Man shows ${s.id} with ${s.dots} to choose from`);
    if (s.name !== s.label) bad(`the name field reads "${s.name}" for ${s.label}`);
    // the man is the supplied animated file: every animation it has is offered by a one-word name, and plays
    await page.waitForFunction(() => document.querySelectorAll('#anim-list [data-anim]').length > 0, null, { timeout: 120000 });
    const anims = await c(() => ({ labels: [...document.querySelectorAll('#anim-list [data-anim]')].map((b) => b.textContent), colours: !document.querySelector('#colour-block').hidden }));
    if (anims.labels.length !== 24 || new Set(anims.labels).size !== 24 || anims.labels.some((l) => !/^[A-Z][a-z]+$/.test(l))) bad(`the man's animations are offered as ${anims.labels.join(', ')}`);
    if (anims.colours) bad('the man, who comes coloured, is offered colours');
    for (const name of ['walk.001', 'jump.001', 'front_kick_02.001']) {
      await c((n) => document.querySelector(`#anim-list [data-anim="${n}"]`).click(), name);
      await page.waitForTimeout(500);
      const now = await c(() => ({ playing: window.__creator.playing(), pressed: [...document.querySelectorAll('#anim-list [aria-pressed="true"]')].map((b) => b.dataset.anim) }));
      if (now.playing !== name || now.pressed.join() !== name) bad(`chose ${name}: playing ${now.playing}, marked ${now.pressed}`);
    }
    await shot(`01-${label}-man`);
    // the woman: the owner's supplied animated file, the only one; her animations by one word each, and they play
    await page.click('[data-gender="f"]'); await page.waitForTimeout(600);
    s = await c(() => ({ id: window.__creator.shown.id, dots: document.querySelectorAll('#fig-dots button').length, prev: document.querySelector('#fig-prev').disabled }));
    if (s.id !== 'W1' || s.dots !== 2 || s.prev) bad(`Woman shows ${s.id} with ${s.dots} to choose from (arrows ${s.prev ? 'off' : 'on'})`);
    // the arrows go through every character and round again, and the Woman and Man buttons follow
    await page.click('#fig-next'); await page.waitForTimeout(500);
    let turn = await c(() => ({ id: window.__creator.shown.id, man: document.querySelector('[data-gender="m"]').getAttribute('aria-pressed'), count: document.querySelector('#fig-count').textContent }));
    if (turn.id !== 'M1' || turn.man !== 'true' || turn.count !== '2 of 2') bad(`the next arrow went to ${JSON.stringify(turn)}`);
    await page.click('#fig-prev'); await page.waitForTimeout(500);
    turn = await c(() => ({ id: window.__creator.shown.id, woman: document.querySelector('[data-gender="f"]').getAttribute('aria-pressed'), count: document.querySelector('#fig-count').textContent }));
    if (turn.id !== 'W1' || turn.woman !== 'true' || turn.count !== '1 of 2') bad(`the previous arrow went to ${JSON.stringify(turn)}`);
    await page.waitForFunction(() => document.querySelectorAll('#anim-list [data-anim]').length > 0 && window.__creator.rig && window.__creator.rig.labels.length, null, { timeout: 180000 });
    const her = await c(() => ({ labels: [...document.querySelectorAll('#anim-list [data-anim]')].map((b) => b.textContent), clips: window.__creator.rig.labels.length, colours: !document.querySelector('#colour-block').hidden }));
    if (her.labels.length !== her.clips || new Set(her.labels).size !== her.labels.length || her.labels.some((l) => !/^[A-Z][a-z]+$/.test(l))) bad(`the woman's ${her.clips} animations are offered as ${her.labels.join(', ')}`);
    if (her.colours) bad('the woman, who comes coloured, is offered colours');
    for (const word of ['Dance', 'Box', 'Walk']) {
      const name = await c((w) => { const b = [...document.querySelectorAll('#anim-list [data-anim]')].find((x) => x.textContent === w); if (!b) return null; b.click(); return b.dataset.anim; }, word);
      if (!name) { bad(`no ${word} among the woman's animations`); continue; }
      await page.waitForTimeout(500);
      const now = await c(() => ({ playing: window.__creator.playing(), pressed: [...document.querySelectorAll('#anim-list [aria-pressed="true"]')].map((b) => b.dataset.anim) }));
      if (now.playing !== name || now.pressed.join() !== name) bad(`chose ${word}: playing ${now.playing}, marked ${now.pressed}`);
    }
    await shot(`02-${label}-woman`);
    // a flick across the figure does not change it (only the arrows and dots do); a drag turns it
    const box = await c(() => { const r = document.querySelector('#stage-view').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.45 }; });
    const before = await c(() => window.__creator.shown);
    // (the flick is sent from inside the page: at a frame a second the driver's own events arrive a second apart)
    await c((b) => { const v = document.querySelector('#stage-view'); const ev = (type, x) => v.dispatchEvent(new PointerEvent(type, { pointerId: 7, clientX: x, clientY: b.y, bubbles: true, pointerType: 'touch' })); ev('pointerdown', b.x + 60); ev('pointermove', b.x); ev('pointermove', b.x - 60); ev('pointerup', b.x - 60); }, box);
    await page.waitForTimeout(500);
    const flicked = await c(() => window.__creator.shown);
    if (flicked.id !== before.id) bad(`a flick changed ${before.id} to ${flicked.id}`);
    await page.mouse.move(box.x - 40, box.y); await page.mouse.down();
    for (let k = 0; k <= 10; k += 1) { await page.mouse.move(box.x - 40 + k * 8, box.y); await page.waitForTimeout(60); }
    await page.mouse.up(); await page.waitForTimeout(400);
    const turned = await c(() => window.__creator.shown);
    if (turned.id !== flicked.id || Math.abs(turned.yaw - flicked.yaw) < 0.3) bad(`a drag did not just turn the figure (${flicked.id} ${flicked.yaw} -> ${turned.id} ${turned.yaw})`);
    // the heading comes after the story, just above the switch
    const order = await c(() => { const t = document.querySelector('#start-title'), i = document.querySelector('#start-intro'); return !!(i.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING); });
    if (!order) bad('"Create your character" is not below the story');
    await shot(`03-${label}-start`);
    // the text the start screen has always carried is still there
    // the story is still there; the three paragraphs that stood at the foot (10 October 2026: taken out at the owner's word) are not
    const words = await c(() => ({ intro: document.querySelector('#start-intro').textContent, all: document.querySelector('#start').textContent }));
    if (!/15 January 1970/.test(words.intro) || /Prototype build/i.test(words.all)) bad('the start screen lost its story');
    if (/no accounts yet|Walk with W A S D|browser prototype|no real money/i.test(words.all)) bad('the three paragraphs at the foot of the start screen are still there');
    // a name of the player's own; Enter; the figure in the town is the one chosen, in those colours
    const want = await c(() => window.__creator.look());
    await page.fill('#name', 'Ngozi Okafor');
    await c(() => window.__creator.step(0));
    if ((await page.inputValue('#name')) !== 'Ngozi Okafor') bad('a typed name was replaced');
    const sure = await enterTown(page);
    if (sure.title !== `Choose ${want.figure === 'M1' ? 'Emeka' : 'Adaeze'}?`) bad(`chose ${want.figure}; asked "${sure.title}"`);
    await page.waitForFunction(() => window.__nlw.mode === 'walking', null, { timeout: 120000 });
    const inTown = await c(() => ({ look: window.__nlw.view.self.look, name: window.__nlw.view.self.name, figure: window.__nlw.me.figure }));
    if (inTown.look.figure !== want.figure || inTown.figure !== want.figure || JSON.stringify(inTown.look.colours) !== JSON.stringify(want.colours)) bad(`chose ${JSON.stringify(want)}, the town has ${JSON.stringify(inTown)}`);
    if (inTown.name !== 'Ngozi Okafor') bad(`the character is called ${inTown.name}`);
    await c(() => { const n = window.__nlw; n.cam.dist = 4.2; n.cam.pitch = 0.12; });
    await page.waitForTimeout(1500);
    await shot(`04-${label}-in-town`);
    // and after a reload the player is in the town as the same figure: nothing is chosen a second time
    await c(() => window.__nlw.saveNow());
    await page.reload({ timeout: 300000 });
    let offered = false;
    const watch = setInterval(() => page.evaluate(() => { const s = document.querySelector('#start'); return !!s && !s.hidden && s.dataset.screen === 'create'; }).then((seen) => { offered = offered || seen; }).catch(() => {}), 400);
    await page.waitForFunction(() => window.__nlw && window.__nlw.mode === 'walking' && !document.querySelector('#hud').hidden, null, { timeout: 300000 });
    clearInterval(watch);
    if (offered) bad('a player with a character was shown the screen where one is made');
    { const over = await page.evaluate(overTown); if (over) bad(`after a reload the player is in town, but ${over}`); }
    const back = await c(() => ({ figure: window.__nlw.me.figure, look: window.__nlw.view.self.look }));
    if (back.figure !== want.figure || JSON.stringify(back.look.colours) !== JSON.stringify(want.colours)) bad(`after a reload the character is ${JSON.stringify(back)}`);
  });
}

await session('desktop', { width: 1280, height: 760 }, async (page, shot) => {
  await shot('01-start');
  await page.fill('#name', 'Nonso Obi');
  await enterTown(page);
  await page.waitForTimeout(1200);
  await shot('02-arrive');
  // walk up Market Road, away from the river, with the keyboard
  await page.keyboard.down('Shift'); await page.keyboard.down('w');
  // (held for five seconds of the game's own time: a page drawn without a graphics card, as here, can run the game
  // slower than the clock, and five seconds by the clock were not five seconds of running)
  const ranFrom = await nlw(page, () => window.__nlw.host.game.state.real);
  await page.waitForFunction((t) => window.__nlw.host.game.state.real >= t, ranFrom + 5, { timeout: 120000 }).catch(() => {});
  await page.keyboard.up('w'); await page.keyboard.up('Shift');
  await shot('03-walked');
  const walked = await nlw(page, () => ({ z: window.__nlw.view.self.z, x: window.__nlw.view.self.x }));
  if (!(walked.z < 95)) problems.push(`desktop: keyboard walking did not move the player (z=${walked.z})`);
  // market
  await nlw(page, () => { window.__nlw.place(8, 58); window.__nlw.cam.yaw = 1.2; window.__nlw.cam.dist = 14; });
  await shot('04-market');
  // registry: talk and open the register
  await nlw(page, () => { window.__nlw.place(48, -59.2); window.__nlw.cam.yaw = Math.PI; window.__nlw.cam.dist = 10; window.__nlw.cam.pitch = 0.3; });
  await page.waitForTimeout(1500);
  await shot('05-registry');
  await page.keyboard.press('e');
  await page.waitForTimeout(500);
  await shot('06-register');
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  // the phone
  await page.keyboard.press('Tab');
  await page.waitForTimeout(400);
  await shot('06b-phone-home');
  const apps = await page.evaluate(() => [...document.querySelectorAll('.app')].map((a) => a.textContent.trim()));
  for (const want of ['Contacts', 'Map', 'Messages', 'Calls', 'Wallet', 'Health', 'Police', 'Transport', 'Jobs', 'Settings', 'Notices']) if (!apps.includes(want)) problems.push(`desktop: the phone has no ${want} app (${apps.join(', ')})`);
  await page.click('.app:has-text("Wallet")');
  await page.waitForSelector('.page[data-app="wallet"] #wallet-balance');
  const walletPage = await page.evaluate(() => { const root = document.querySelector('.page[data-app="wallet"]'); return { text: root.textContent, buttons: [...root.querySelectorAll('button')].filter((b) => b.offsetParent !== null && b.id !== 'page-back').map((b) => (b.textContent || b.getAttribute('aria-label') || '').trim()), balance: document.querySelector('#wallet-balance').textContent }; });
  // the sandbox that made TR is gone: no button, no screen, no word of it
  if (/Add funds|sandbox|faucet|tBTC|bitcoin|settlement/i.test(walletPage.text) || walletPage.buttons.some((b) => /fund|faucet|deposit/i.test(b))) problems.push(`desktop: the wallet still offers sandbox funds: ${JSON.stringify(walletPage.buttons)}`);
  if (!/^2,000\s*TR$/.test(walletPage.balance.trim())) problems.push(`desktop: a new arrival's wallet reads "${walletPage.balance}"`);
  // a copy of the game opened from a disk has no server and so no bank: it shows this world's own money, says where sending is, and offers no button that would do nothing
  if (walletPage.buttons.some((b) => /send|receive/i.test(b))) problems.push(`desktop: a page with no server offers to send TR: ${JSON.stringify(walletPage.buttons)}`);
  if (!/postcivilwar\.com/.test(walletPage.text)) problems.push('desktop: the wallet does not say where TR can be sent and received');
  await shot('07-wallet');
  // TR for the rest of this play-through, put into the wallet as the bank would put it. (Nothing on the page can do this.)
  await nlw(page, () => { const n = window.__nlw; const have = n.host.game.view(n.playerId).self.balance; n.host.bank.align(n.playerId, have + 50000, 'Test funds'); });
  await page.waitForTimeout(1200);
  const funded = await page.evaluate(() => document.querySelector('#wallet-balance').textContent.trim());
  if (!/^27,000\s*TR$/.test(funded)) problems.push(`desktop: after the bank put 25,000 TR in, the wallet reads "${funded}"`);
  await shot('09-wallet-funded');
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  // buy plot R-05. (The Lands Registry keeps office hours, 08:00 to 16:00, and a newcomer arrives a little before
  // it opens: the morning is let pass. The sandbox's wait used to do that by accident.)
  await nlw(page, () => { const n = window.__nlw; const c = n.view.clock.hourFloat; if (c < 8.25 || c > 15) n.skip(((24 + 9 - c) % 24)); });
  await page.waitForFunction(() => window.__nlw.phoneHold.out === 0 && window.__nlw.mode === 'walking' && !/Closed/.test(document.querySelector('#prompt').textContent), null, { timeout: 30000 }).catch(() => problems.push(`desktop: at the Lands Registry the prompt reads "${'?'}"`));
  await page.keyboard.press('e');
  await page.waitForTimeout(400);
  await page.click('.rowbtn:has-text("R-05")');
  await page.click('text=Buy this plot');
  await page.click('text=Confirm: pay');
  await page.waitForTimeout(500);
  await shot('10-title');
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  // permit
  await nlw(page, () => window.__nlw.place(-48, -59.5));
  await page.waitForTimeout(600);
  await page.keyboard.press('e');
  await page.waitForTimeout(400);
  await page.click('button:has-text("Apply"):not([disabled])');
  await page.waitForTimeout(400);
  await shot('11-permit');
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  // materials
  await nlw(page, () => { const g = window.__nlw.host.game; const id = window.__nlw.playerId; const plot = window.__nlw.view.self.owned[0];
    window.__nlw.place(-95, -179.4); g.intent(id, { type: 'shop.buy', businessId: 'yard', item: 'block', qty: 120, parcelId: plot });
    window.__nlw.place(30, 12.8); for (const [item, qty] of [['cement', 12], ['roofing', 1], ['doorset', 1], ['paint', 1]]) g.intent(id, { type: 'shop.buy', businessId: 'store', item, qty, parcelId: plot }); });
  await page.waitForTimeout(600);
  await page.keyboard.press('e');
  await page.waitForTimeout(400);
  await shot('12-store');
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  // yard: mould a few blocks by holding E
  await nlw(page, () => { window.__nlw.place(-72, -163.4); window.__nlw.cam.yaw = Math.PI; window.__nlw.cam.dist = 8; });
  await page.waitForTimeout(600);
  await page.keyboard.down('e');
  await page.waitForTimeout(4200);
  await shot('13-moulding');
  await page.keyboard.up('e');
  // the plot, with deliveries arrived
  await nlw(page, () => { window.__nlw.skip(1); const p = window.__nlw.view.self.owned[0]; });
  await nlw(page, () => { window.__nlw.place(124.5, -158); window.__nlw.cam.yaw = -2.4; window.__nlw.cam.dist = 16; window.__nlw.cam.pitch = 0.42; });
  await page.waitForTimeout(800);
  await shot('14-plot-materials');
  const stages = ['15-foundation', '16-walls', '17-roof', '18-fittings', '19-finished'];
  for (let i = 0; i < stages.length; i += 1) {
    await nlw(page, () => { const n = window.__nlw; const g = n.host.game; const id = n.playerId; const plot = n.view.self.owned[0]; const before = g.view(id).sites.find((s) => s.parcelId === plot).stage;
      for (let k = 0; k < 400; k += 1) { n.host.tick(1.3); const p = g.state.players[id]; p.energy = 100; const r = g.intent(id, { type: 'site.work', parcelId: plot }); if (!r.ok && r.code === 'RAIN') n.host.game.advance(1800); const now = g.view(id).sites.find((s) => s.parcelId === plot); if (now.stage > before || now.complete) break; }
      n.place(124.5, -158); });
    await page.waitForTimeout(700);
    await shot(stages[i]);
  }
  // board panel for the finished plot, then night and rain
  await nlw(page, () => { window.__nlw.place(114, -148.6); });
  await page.waitForTimeout(600);
  await page.keyboard.press('e');
  await page.waitForTimeout(400);
  await shot('20-board');
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  await nlw(page, () => { const n = window.__nlw; const c = n.view.clock.hourFloat; n.skip(((24 + 20.5 - c) % 24)); n.place(2, 40); n.cam.yaw = Math.PI; n.cam.dist = 13; n.cam.pitch = 0.25; });
  await page.waitForTimeout(1500);
  await shot('21-night');
  await nlw(page, () => { const n = window.__nlw; n.host.game.state.weather = { kind: 'rain', until: n.host.game.state.t + 7200 }; const c = n.view.clock.hourFloat; n.skip(((24 + 10 - c) % 24)); n.host.game.state.weather = { kind: 'rain', until: n.host.game.state.t + 7200 }; n.place(2, 80); n.cam.yaw = Math.PI; n.cam.dist = 12; });
  await page.waitForTimeout(5000);
  await shot('22-rain');
  await page.keyboard.press('m');
  await page.waitForTimeout(400);
  await shot('23-map');
  await page.click('button:has-text("Nigeria")');
  await page.waitForTimeout(300);
  await shot('24-nation');
  await page.click('#page-back');
  await page.click('.app:has-text("Wallet")');
  await page.waitForTimeout(300);
  await shot('25-wallet');
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  // the motor park: hire a keke, take a run, drive it, deliver, step out
  await nlw(page, () => { const n = window.__nlw; const g = n.host.game; g.state.weather = { kind: 'clear', until: g.state.t + 4 * 3600 }; n.place(-33.5, 98.2); n.cam.yaw = Math.PI; n.cam.dist = 9; n.cam.pitch = 0.3; });
  await page.waitForTimeout(700);
  await page.keyboard.press('e');
  await page.waitForTimeout(500);
  await shot('27-motor-park');
  const choices = await page.evaluate(() => ({ colours: [...document.querySelectorAll('.panel .swatch, .swatch')].filter((b) => b.offsetParent).map((b) => b.getAttribute('aria-label')), fronts: [...document.querySelectorAll('button')].filter((b) => b.offsetParent && /lamps/.test(b.textContent)).length }));
  if (choices.colours.length !== 7 || choices.fronts !== 3) problems.push(`desktop: the dealer should offer seven colours and three fronts (${JSON.stringify(choices)})`);
  await page.click('button:has-text("Hire a keke")');
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.keyboard.press('Tab');
  await page.click('.app:has-text("Jobs")');
  await page.waitForTimeout(400);
  await shot('28-runs');
  await page.click('button:has-text("Take it")');
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  const hired = await nlw(page, () => { const n = window.__nlw; const v = n.view.vehicles.find((c) => c.yours); if (v) { n.place(v.x - 2.2, v.z + 2.2); n.cam.yaw = 2.4; n.cam.dist = 9; } return v || null; });
  if (!hired) problems.push('desktop: no keke on hire after pressing Hire');
  await page.waitForTimeout(600);
  await shot('29-keke');
  await page.keyboard.press('e');
  await page.waitForTimeout(600);
  const seated = await nlw(page, () => !!window.__nlw.view.self.driving);
  if (!seated) problems.push('desktop: pressing E beside the hired keke did not put the player in it');
  await page.keyboard.down('w');
  await page.waitForTimeout(3500);
  await shot('30-driving');
  await page.keyboard.down('d');
  await page.waitForTimeout(1200);
  // the keke on screen is the supplied model at its nearest level, its wheels turning and its front wheel steered
  const wheels = await nlw(page, () => { const n = window.__nlw; const d = n.view.self.driving; return n.fleet.find((v) => v.model === 'keke' && Math.hypot(v.x - d.x, v.z - d.z) < 1.5) || null; });
  if (!wheels || wheels.level !== 0 || !(wheels.spin > 6) || !(wheels.steering < -0.1)) problems.push(`desktop: the driven keke should be at near detail with turning, steered wheels (${JSON.stringify(wheels)})`);
  await page.keyboard.up('d'); await page.keyboard.up('w');
  await page.waitForTimeout(1200);
  const drove = await nlw(page, () => { const n = window.__nlw; const d = n.view.self.driving; return { x: d.x, z: d.z, fuel: d.fuel, run: n.view.self.run }; });
  if (!hired || Math.hypot(drove.x - hired.x, drove.z - hired.z) < 6) problems.push(`desktop: keyboard driving did not move the keke (${JSON.stringify(drove)})`);
  if (!drove.run) problems.push('desktop: no run was taken');
  else {
    const before = await nlw(page, () => window.__nlw.view.self.balance);
    await nlw(page, (spot) => { const n = window.__nlw; n.park(spot.x, spot.z, 0); n.cam.yaw = 0.6; n.cam.dist = 13; n.cam.pitch = 0.3; }, drove.run.from);
    await page.waitForTimeout(600);
    await shot('31-run-pickup');
    await page.keyboard.press('e');
    await page.waitForTimeout(500);
    await nlw(page, (spot) => { const n = window.__nlw; n.park(spot.x, spot.z, 0); n.cam.yaw = 0.6; }, drove.run.to);
    await page.waitForTimeout(600);
    await page.keyboard.press('e');
    await page.waitForTimeout(600);
    await shot('32-run-delivered');
    const after = await nlw(page, () => ({ balance: window.__nlw.view.self.balance, run: window.__nlw.view.self.run }));
    if (after.run || after.balance - before !== drove.run.fee) problems.push(`desktop: the run was not paid (${before} to ${after.balance}, fee ${drove.run.fee})`);
  }
  // a parked coach is solid: driving at its side stops the keke short of it
  // (the coach by the shelter stands east to west; the keke comes at its side from the north)
  const bump = await nlw(page, () => { const n = window.__nlw; const coach = n.fleet.filter((v) => v.model === 'bus').sort((a, b) => b.x - a.x)[0]; n.park(coach.x, coach.z + 7, Math.PI); n.cam.yaw = Math.PI - 0.7; n.cam.dist = 12; n.cam.pitch = 0.3; n.cam.lastDrag = 1e9; return { x: coach.x, z: coach.z }; });
  await page.keyboard.down('w');
  await page.waitForTimeout(4500);
  // (held on while it has not come up to the coach, up to fifteen seconds more: on this machine, drawing in software, a
  // frame can take longer than the game's longest step, half a second (main.js, `frameDt`), and the keke's time then
  // runs slower than the clock's: on 30 October four and a half seconds held took it 0.8 m. Then a second more against
  // the coach's side)
  if (await nlw(page, (bz) => window.__nlw.view.self.driving.z - bz >= 4.5, bump.z)) {
    await page.waitForFunction((bz) => window.__nlw.view.self.driving.z - bz < 4.5, bump.z, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1000);
  }
  await page.keyboard.up('w');
  await page.waitForTimeout(600);
  await shot('33-keke-meets-coach');
  const stopped = await nlw(page, () => { const n = window.__nlw; n.cam.lastDrag = -10; const d = n.view.self.driving; const g = n.host.game; const imp = g.state.impact || {}; const near = (n.view.people || []).filter(([, x, z]) => Math.hypot(x - d.x, z - d.z) < 6).map(([i, x, z, h, pose]) => ({ i, job: g.internals.population.people[i].job, x: +x.toFixed(1), z: +z.toFixed(1), pose })); return { x: d.x, z: d.z, struck: (imp.events || []).slice(-2).map((e) => ({ kind: e.kind, on: e.on, x: e.x, z: e.z })), near, others: n.view.vehicles.filter((o) => o.id !== d.id && Math.hypot(o.x - d.x, o.z - d.z) < 8).map((o) => ({ id: o.id, kind: o.kind, x: +o.x.toFixed(1), z: +o.z.toFixed(1) })) }; });
  if (!(stopped.z - bump.z > 1.45 + 0.9) || !(stopped.z - bump.z < 4.5)) problems.push(`desktop: the keke should drive up to the coach and stop against it (${JSON.stringify({ stopped, bump })})`);
  // the fleet in the scene: every keke and coach is one of the supplied designs, and the coaches differ
  const fleet = await nlw(page, () => window.__nlw.fleet);
  if (fleet.filter((v) => v.model === 'bus').length !== 3 || new Set(fleet.filter((v) => v.model === 'bus').map((v) => v.look)).size !== 3) problems.push(`desktop: three coaches in three liveries expected (${JSON.stringify(fleet.filter((v) => v.model === 'bus'))})`);
  if (fleet.filter((v) => v.model === 'keke').length < 12 || new Set(fleet.filter((v) => v.model === 'keke').map((v) => v.trim)).size !== 3) problems.push('desktop: kekes with all three fronts expected');
  if (fleet.some((v) => v.shown && v.level === 0 && Math.hypot(v.x - stopped.x, v.z - stopped.z) > 40)) problems.push('desktop: a far-off vehicle is being drawn at near detail');
  // after dark the driven keke shows its lamps
  await nlw(page, () => { const n = window.__nlw; const c = n.view.clock.hourFloat; n.skip(((24 + 20.5 - c) % 24)); n.cam.yaw = 0.6; n.cam.dist = 8; });
  await page.waitForTimeout(2500);
  await shot('34-keke-at-night');
  const lit = await nlw(page, () => { const n = window.__nlw; const d = n.view.self.driving; const mine = n.fleet.find((v) => v.model === 'keke' && Math.hypot(v.x - d.x, v.z - d.z) < 1.5); return mine ? mine.lit : null; });
  if (lit !== true) problems.push(`desktop: the driven keke should have its lamps on at night (${lit})`);
  await page.keyboard.press('e');
  await page.waitForTimeout(500);
  if (await nlw(page, () => !!window.__nlw.view.self.driving)) problems.push('desktop: pressing E did not step out of the keke');
  // the river at the end of the day: the sun goes down over the far bank
  await nlw(page, () => { const n = window.__nlw; const g = n.host.game; const c = n.view.clock.hourFloat; n.skip(((24 + 17.7 - c) % 24)); g.state.weather = { kind: 'clear', until: g.state.t + 7200 }; n.place(40, 131); n.cam.yaw = 0.25; n.cam.dist = 11; n.cam.pitch = 0.16; });
  await page.waitForTimeout(3500);
  await shot('26-river-evening');
  const audit = await nlw(page, () => ({ ledger: window.__nlw.host.auditor.reconcile(), goods: window.__nlw.host.game.audit().goods, vehicles: window.__nlw.host.game.audit().vehicles, reserves: window.__nlw.host.portal === undefined && window.__nlw.host.settlementOps === undefined, journal: window.__nlw.view.journal.every((j) => j.done) }));
  if (audit.ledger.length || audit.goods.length || !audit.reserves || !audit.journal || audit.vehicles.count !== audit.vehicles.expected) problems.push(`desktop: audit failed ${JSON.stringify(audit)}`);
});

// The town: its people (its police on their beats and, since 27 October 2026, the owner's townspeople; no okadas), another player,
// the inside of the hospital, a school and the church, and the sound.
await session('town', { width: 1280, height: 760 }, async (page, shot) => {
  const bad = (text) => problems.push(`town: ${text}`);
  await page.fill('#name', 'Ifeoma Eze');
  await enterTown(page);
  await page.waitForTimeout(1500);
  // TR to play with, put in as the bank would put it (and the twenty-four seconds the town used to be given while it arrived)
  await nlw(page, () => { const n = window.__nlw; const h = n.host; for (let t = 0; t < 24; t += 0.1) h.tick(0.1); h.bank.align(n.playerId, h.game.view(n.playerId).self.balance + 50000, 'Test funds'); });
  const at = (hour) => nlw(page, (hour) => { const n = window.__nlw; const g = n.host.game; n.skip(((24 + hour - n.view.clock.hourFloat) % 24)); g.state.weather = { kind: 'clear', until: g.state.t + 6 * 3600 }; }, hour);
  const look = (x, z, yaw, dist, pitch) => nlw(page, ([x, z, yaw, dist, pitch]) => { const n = window.__nlw; n.place(x, z); n.cam.yaw = yaw; n.cam.dist = dist; n.cam.pitch = pitch; }, [x, z, yaw, dist, pitch]);
  const live = (seconds) => nlw(page, (seconds) => { const n = window.__nlw; for (let t = 0; t < seconds; t += 0.1) { n.host.tick(0.1); if (n.second) n.second.host.tick(0.1); } }, seconds);
  const bubbles = () => nlw(page, () => [...document.querySelectorAll('#bubbles .bubble')].filter((b) => !b.hidden).map((b) => { const r = b.getBoundingClientRect(); return { w: r.width, h: r.height, text: b.querySelector('.say').textContent, who: b.querySelector('.who').textContent, gloss: b.querySelector('.gloss') ? b.querySelector('.gloss').textContent : '', kind: b.className }; }));

  // 1. the market in the morning: the police on their beat and his townspeople, nobody else of the town's
  await at(9.4);
  await look(43, 59, 1.2, 13, 0.34);
  await page.waitForTimeout(2500);
  const town = await nlw(page, () => ({ people: window.__nlw.view.people.length, total: window.__nlw.view.population, crowd: window.__nlw.crowd.stats, okadas: window.__nlw.view.okadas.length, riders: window.__nlw.host.game.internals.okada.riders.length, jobs: [...new Set(window.__nlw.view.people.map((r) => window.__nlw.host.game.internals.population.people[r[0]].job))] }));
  if (town.total !== TOWNSPEOPLE) bad(`the town has ${town.total} people, not ${TOWNSPEOPLE}`);
  if (town.people < 1) bad('nobody of the town\'s is in view at the market in the morning');
  // (since 27 October 2026 the police and the owner's own townspeople: hawkers and people out and about)
  if (town.jobs.some((j) => !['police', 'hawker', 'unemployed'].includes(j))) bad(`someone other than the police and his townspeople is about: ${town.jobs.join(', ')}`);
  if (town.okadas || town.riders) bad(`there are okadas (${town.okadas} in view, ${town.riders} riders)`);
  await shot('01-market-police');
  const size = await bubbles();
  if (size.length > 1) bad(`${size.length} bubbles are shown at once: one at a time`);
  for (const b of size) if (b.w > 250 || b.h > 130) bad(`a bubble is ${Math.round(b.w)} by ${Math.round(b.h)} px`);
  if (await nlw(page, () => window.__nlw.ui.isOpen())) bad('a panel opened by itself');

  // 2. talking to one of the town's people (a police officer on her beat): a bubble, not a panel
  // (an officer standing at one of her beat's stops, and still standing there a few seconds on: the player is put in
  // front of her)
  const person = await nlw(page, () => {
    const n = window.__nlw, g = n.host.game, pop = g.internals.population, o = {};
    let best = null;
    for (let i = 0; i < pop.count; i += 1) {
      pop.locate(i, g.state.t, o);
      if (o.pose !== 0 || o.moving) continue;
      const later = {}; pop.planned(i, g.state.t + 150, later);
      if (later.pose !== 0 || later.moving || Math.hypot(later.x - o.x, later.z - o.z) > 0.3) continue;
      const d = Math.hypot(o.x - n.view.self.x, o.z - n.view.self.z);
      if (!best || d < best.d) best = { i, x: o.x, z: o.z, h: o.h, d };
    }
    if (!best) return null;
    n.place(best.x + Math.sin(best.h) * 1.3, best.z + Math.cos(best.h) * 1.3);
    n.face(best.h + Math.PI);
    return { i: best.i, name: pop.people[best.i].short };
  });
  if (!person) bad('nobody is standing near enough to talk to');
  else {
    // (the prompt comes with the next frames after the player is put there: on this machine a frame can take a second
    // or more, so it is waited for, up to fifteen seconds, not looked at after a second and a half)
    await page.waitForFunction(() => /Talk to/.test((document.getElementById('prompt-text') || {}).textContent || ''), null, { timeout: 15000 }).catch(() => {});
    const prompt = await page.textContent('#prompt-text');
    if (!/Talk to/.test(prompt || '')) bad(`the prompt beside a townsperson reads "${prompt}"`);
    await page.keyboard.press('e');
    let said = [];
    for (let i = 0; i < 14 && !(said.some((b) => b.who.startsWith('You')) && said.some((b) => !b.who.startsWith('You'))); i += 1) { await page.waitForTimeout(350); said.push(...(await bubbles()).filter((b) => /player|reply/.test(b.kind))); if (i === 2) await shot('02-talk-townsperson'); }
    if (!said.some((b) => b.who.startsWith('You'))) bad('the player\'s own words are not shown');
    if (!said.some((b) => !b.who.startsWith('You'))) bad('the townsperson did not answer');
    if (await nlw(page, () => window.__nlw.ui.isOpen())) bad('talking opened a panel');
  }

  // 3. a second player, in a second copy of the world, joined by the transport
  if (await page.isVisible('#chat-btn')) bad('the chat button shows with no other player near');
  await nlw(page, () => { const n = window.__nlw; const me = n.view.self; n.twin('Chidinma Okafor', me.x + 2.4, me.z + 1.2); n.second.language('ig'); });
  await page.waitForTimeout(3500);
  if (!(await page.isVisible('#chat-btn'))) bad('the chat button did not appear beside another player');
  await shot('03-chat-button');
  await page.click('#chat-btn');
  await page.waitForTimeout(500);
  if (!(await page.isVisible('#chat-bar'))) bad('the chat box did not open');
  await page.fill('#chat-input', 'Good morning. Is the market busy today?');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3000);
  const heardThere = await nlw(page, () => window.__nlw.second.view().speech.filter((l) => l.kind === 'chat').map((l) => l.text));
  if (!heardThere.includes('Good morning. Is the market busy today?')) bad(`the other player did not get the message (${JSON.stringify(heardThere)})`);
  await nlw(page, () => window.__nlw.second.say('Ụtụtụ ọma'));
  let reply = [];
  for (let i = 0; i < 8 && !reply.length; i += 1) { await page.waitForTimeout(900); reply = (await bubbles()).filter((b) => b.text === 'Ụtụtụ ọma'); }
  await shot('04-chat-both-ways');
  if (!reply.length) bad('the other player\'s message did not appear as a bubble');
  else if (!/Good morning/.test(reply[0].gloss)) bad(`the Igbo message has no phrase-book gloss ("${reply[0].gloss}")`);
  else if (reply[0].text !== 'Ụtụtụ ọma') bad('the original words were changed');
  const linked = await nlw(page, () => window.__nlw.link);
  if (!linked || linked.peers !== 1) bad(`the link reports ${JSON.stringify(linked)}`);
  await page.keyboard.press('Escape');
  await nlw(page, () => { const n = window.__nlw; n.second.place(n.view.self.x + 60, n.view.self.z); });
  await page.waitForTimeout(3500);
  if (await page.isVisible('#chat-btn')) bad('the chat button stayed after the other player walked away');

  // 4. a government notice has its own look, apart from anybody's speech
  await at(7.93);
  await look(8, 58, 1.2, 14, 0.36);
  await live(14);
  await page.waitForTimeout(1200);
  const gov = await nlw(page, () => [...document.querySelectorAll('#notices .gov')].map((el) => el.textContent));
  await shot('05-government-notice');
  if (!gov.some((text) => /GOVERNMENT/i.test(text) && /levy/i.test(text))) bad(`no government notice at eight (${JSON.stringify(gov)})`);
  const box = await nlw(page, () => { const r = document.getElementById('notices').getBoundingClientRect(); return (r.width * r.height) / (innerWidth * innerHeight); });
  if (box > 0.12) bad(`notices cover ${Math.round(box * 100)}% of the screen`);

  // 5. an okada (while the town has them: since 22 October 2026 it has none, and none waits at a rank)
  await at(10);
  const okada = await nlw(page, () => { const n = window.__nlw; const g = n.host.game; let found = null; for (const rank of ['rank-market', 'rank-park', 'rank-hospital']) { const s = n.spot(rank, 'rank'); if (!s) continue; n.place(s.x + 1.5, s.z + 1.5); const o = n.view.okadas.filter((k) => k.free && !k.moving).sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z))[0]; if (o) { n.place(o.x + 1.4, o.z + 0.8); n.cam.yaw = 2.2; n.cam.dist = 8; n.cam.pitch = 0.3; found = { n: o.n, balance: n.view.self.balance }; break; } } return found; });
  const okadasKept = ZONE_POPULATION.jobs.some(([job]) => job === 'okada');
  if (!okada && okadasKept) bad('no okada is waiting at a rank at ten');
  else if (okada && !okadasKept) bad('an okada is waiting at a rank, in a town that has none');
  else if (okada) {
    await page.waitForTimeout(1500);
    await shot('06-okada-rank');
    await page.keyboard.press('e');
    await page.waitForTimeout(800);
    await shot('07-okada-where-to');
    const fare = await nlw(page, () => { const all = [...document.querySelectorAll('#sheet .rowbtn:not([disabled])')]; const b = all[Math.min(2, all.length - 1)]; if (!b) return null; const text = b.textContent; b.click(); return text; });
    if (!fare) bad('the rider offered nowhere to go');
    await page.waitForTimeout(2500);
    const riding = await nlw(page, () => window.__nlw.view.self.riding);
    if (!riding) bad('paying the fare did not put the player on the okada');
    await live(2.2);
    await nlw(page, () => { window.__nlw.cam.yaw += 0.5; });
    await page.waitForTimeout(1500);
    await shot('08-okada-riding');
    let down = null;
    for (let i = 0; i < 40 && !down; i += 1) { await live(3); await page.waitForTimeout(150); down = await nlw(page, () => (window.__nlw.view.self.riding ? null : { x: window.__nlw.view.self.x, z: window.__nlw.view.self.z, balance: window.__nlw.view.self.balance })); }
    if (!down) bad('the okada never arrived');
    else if (!(down.balance < okada.balance)) bad(`the fare was not paid (${okada.balance} to ${down.balance})`);
    await shot('09-okada-arrived');
    const book = await nlw(page, () => window.__nlw.host.game.audit().okada);
    if (!book.balanced || book.playerRides < 1) bad(`okada books: ${JSON.stringify(book)}`);
  }

  // 6. inside the hospital, a classroom and the church
  await at(9.8);
  const rooms = await nlw(page, () => { const n = window.__nlw; return { reception: n.spot('hospital', 'reception.wait', 2), ward: n.spot('hospital', 'ward.bedside'), klass: n.spot('primary', 'classroom.seat', 10), lecture: n.spot('university', 'lecture.seat', 30), pew: n.spot('catholic', 'nave.pew', 40) }; });
  // (nobody of the town's own works or sits in them now: the rooms stand ready for the owner's figures)
  const working = await nlw(page, () => { const n = window.__nlw; const pop = n.host.game.internals.population; const t = n.host.game.state.t; const count = (test) => pop.people.filter((p) => test(pop.describe(p.index, t), p)).length; return { seeing: count((d) => d.activity === 'Seeing patients'), teaching: count((d) => d.activity === 'Teaching'), inClass: count((d) => d.activity === 'In class') }; });
  for (const [name, spot, yaw, dist, pitch, hour] of [['12-classroom', rooms.klass, 0.4, 9, 1.05, 0], ['13-lecture', rooms.lecture, 0.4, 10, 1.05, 0], ['10-hospital-reception', rooms.reception, 0.6, 9, 1.05, 11.1], ['11-hospital-ward', rooms.ward, 0.6, 9, 1.05, 0]]) {
    if (hour) await at(hour);
    if (!spot) { bad(`no place for ${name}`); continue; }
    await look(spot.x + 0.7, spot.z + 0.7, yaw, dist, pitch);
    await page.waitForTimeout(3000);
    await shot(name);
    const state = await nlw(page, () => ({ inside: window.__nlw.inside, room: document.getElementById('hud-room').hidden ? '' : document.getElementById('hud-room').textContent, people: window.__nlw.view.people.length }));
    if (!state.inside) bad(`${name}: the player is not counted as indoors`);
    if (!state.room) bad(`${name}: the room is not named on screen`);
  }
  // Sunday, the second Mass
  await nlw(page, () => { const n = window.__nlw; const day = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(n.view.calendar.weekday); n.skip(((13 - day) % 7) * 24); });      // to Saturday, and on into Sunday morning
  await at(8.45);
  await look(rooms.pew.x, rooms.pew.z, 0, 14, 0.9);
  await page.waitForTimeout(3500);
  await shot('14-sunday-mass');
  const mass = await nlw(page, () => ({ day: window.__nlw.view.calendar.weekday, inside: window.__nlw.inside, people: window.__nlw.view.people.length, sounds: window.__nlw.audio.status() }));
  if (mass.day !== 'Sunday') bad(`it is ${mass.day}, not Sunday`);
  // (the pews are empty: nobody of the town's own goes to Mass until the owner's figures come)
  const front = await nlw(page, () => { const n = window.__nlw; return n.spot('catholic', 'nave.door') || n.spot('catholic', 'nave.stand'); });
  await look(front.x, front.z + 26, Math.PI, 20, 0.2);
  await page.waitForTimeout(3000);
  await shot('15-church-front');

  // 7. sound: the context runs, something is playing, and each music style renders
  if (mass.sounds.supported) {
    if (mass.sounds.state !== 'running') bad(`the sound is ${mass.sounds.state}`);
    if (!(mass.sounds.level > 0)) bad('the sound output is silent');
    const music = await nlw(page, () => window.__nlw.musicCheck());
    for (const m of music) if (!(m.rms > 0.005) || m.peak > 1) bad(`music style ${m.style}: rms ${m.rms}, peak ${m.peak}`);
  }
  // 8. the books still balance after all of it
  const audit = await nlw(page, () => ({ ledger: window.__nlw.host.auditor.reconcile(), okada: window.__nlw.host.game.audit().okada.balanced, reserves: window.__nlw.host.portal === undefined && window.__nlw.host.settlementOps === undefined, perf: window.__nlw.perf, sim: window.__nlw.host.game.stats() }));
  if (audit.ledger.length || !audit.okada || !audit.reserves) bad(`audit failed ${JSON.stringify(audit)}`);
  console.log('town session: ' + JSON.stringify({ town, working, okada: await nlw(page, () => window.__nlw.host.game.audit().okada), sim: audit.sim }));
});

await session('phone', { width: 400, height: 780 }, async (page, shot) => {
  await shot('01-start');
  await enterTown(page, { tap: true });
  await page.waitForTimeout(1200);
  await shot('02-arrive');
  const overflow = await nlw(page, () => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (overflow) problems.push('phone: page scrolls sideways');
  await page.tap('#btn-phone');
  await page.waitForTimeout(400);
  await shot('03-phone');
  const tiles = await nlw(page, () => [...document.querySelectorAll('.app')].map((a) => { const r = a.getBoundingClientRect(); return [a.textContent.trim(), Math.round(r.left), Math.round(r.right), Math.round(r.width), Math.round(r.height)]; }));
  for (const [label, left, right, w, h] of tiles) if (left < 0 || right > 400 || w < 44 || h < 44) problems.push(`phone: the ${label} app is at ${left}..${right}, ${w} by ${h}`);
  await page.tap('.app:has-text("Wallet")');
  await page.waitForSelector('.page[data-app="wallet"] #wallet-balance');
  await page.waitForTimeout(400);
  await shot('04-wallet');
  { const w = await page.evaluate(() => { const root = document.querySelector('.page[data-app="wallet"]'); const b = document.querySelector('#wallet-balance').getBoundingClientRect(); return { text: root.textContent, l: b.left, r: b.right, wide: root.scrollWidth > root.clientWidth + 1 }; });
    if (/Add funds|sandbox|faucet/i.test(w.text)) problems.push('phone: the wallet still offers sandbox funds');
    if (w.l < 0 || w.r > 400 || w.wide) problems.push(`phone: the balance runs from ${Math.round(w.l)} to ${Math.round(w.r)}`); }
  // the Map: a map to find the way by. It is zoomed by its buttons, moved by a finger, brought back by the round button, and shows the way along the roads
  await page.tap('#page-back'); await page.waitForTimeout(300);      // from the wallet to the handset
  await page.tap('.app:has-text("Map")');
  await page.waitForSelector('.navmap');
  await page.waitForTimeout(500);
  const mapNow = () => page.evaluate(() => { const m = document.querySelector('.navmap'); const c = m.querySelector('canvas'); const g = c.getContext('2d'); const px = (x, y) => [...g.getImageData(Math.round(x * c.width / c.clientWidth), Math.round(y * c.height / c.clientHeight), 1, 1).data].slice(0, 3); const r = m.getBoundingClientRect(); return { zoom: +m.dataset.zoom, follow: m.dataset.follow, l: r.left, r: r.right, w: c.clientWidth, h: c.clientHeight, centre: px(c.clientWidth / 2, c.clientHeight / 2), me: (m.dataset.me || '').split(',').map(Number), dot: m.dataset.me ? px(...m.dataset.me.split(',').map(Number)) : null, buttons: [...m.querySelectorAll('button')].map((b) => { const q = b.getBoundingClientRect(); return [b.id, Math.round(q.width), Math.round(q.height)]; }) }; });
  const m0 = await mapNow();
  if (m0.l < 0 || m0.r > 391 || m0.h < 240) problems.push(`phone: the map is ${m0.w} by ${m0.h}, from ${Math.round(m0.l)} to ${Math.round(m0.r)}`);
  if (m0.follow !== 'true') problems.push('phone: the map does not open on where the player is');
  for (const [id, bw, bh] of m0.buttons) if (bw < 44 || bh < 44) problems.push(`phone: the map's ${id} button is ${bw} by ${bh}`);
  // the player is the blue dot, and it is in view: in the middle, or (where the town ends) as near the middle as the town's edge lets it be
  const blue = (c) => !!c && c[2] > 180 && c[0] < 90;
  const inView = (m) => m.me.length === 2 && m.me[0] > 12 && m.me[0] < m.w - 12 && m.me[1] > 12 && m.me[1] < m.h - 12;
  if (!inView(m0) || !blue(m0.dot)) problems.push(`phone: the player's dot should be at ${m0.me} on a map ${m0.w} by ${m0.h}; what is there is ${m0.dot}`);
  await page.tap('#map-zoom-in'); await page.waitForTimeout(250);
  const m1 = await mapNow();
  if (!(m1.zoom > m0.zoom * 1.3)) problems.push(`phone: zoom in took the map from ${m0.zoom} to ${m1.zoom}`);
  await page.tap('#map-zoom-out'); await page.tap('#map-zoom-out'); await page.waitForTimeout(250);
  const m2 = await mapNow();
  if (!(m2.zoom < m1.zoom / 2)) problems.push(`phone: zoom out took the map from ${m1.zoom} to ${m2.zoom}`);
  { const box = await page.locator('.navmap-canvas').boundingBox(); const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] });
    for (let i = 1; i <= 5; i += 1) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - i * 16, y: cy - i * 10, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(250); }
  const m3 = await mapNow();
  if (m3.follow !== 'false') problems.push('phone: dragging the map did not let go of the player');
  if (Math.hypot(m3.me[0] - m2.me[0], m3.me[1] - m2.me[1]) < 30) problems.push(`phone: the map did not move under the finger (the dot went from ${m2.me} to ${m3.me})`);
  await page.tap('#map-recentre'); await page.waitForTimeout(250);
  const m4 = await mapNow();
  if (m4.follow !== 'true' || !inView(m4) || !blue(m4.dot)) problems.push(`phone: the round button did not bring the map back to the player (${m4.follow}, the dot at ${m4.me}: ${m4.dot})`);
  await shot('04b-map');
  await page.evaluate(() => { [...document.querySelectorAll('.page[data-app="map"] .rowbtn')].find((r) => /Lands Registry/.test(r.textContent)).click(); });
  await page.waitForSelector('#map-way');
  await page.waitForTimeout(400);
  const way = await page.evaluate(() => { const n = window.__nlw; const r = n.host.game.intent(n.playerId, { type: 'map.route', x: 48, z: -60 }); return { text: document.querySelector('#map-way').textContent, road: r.road.length, straight: r.metres, byRoad: r.roadMetres }; });
  if (!/by road/.test(way.text) || !(way.byRoad > way.straight) || way.road < 4) problems.push(`phone: the way to the Lands Registry: ${JSON.stringify(way)}`);
  await page.evaluate(() => { document.querySelector('.page .screen').scrollTop = 0; });
  await shot('04c-map-way');
  // driving on a phone: the layout of the readout, the stick and the prompt
  await page.tap('#page-back'); await page.waitForTimeout(300);      // from the way back to the map
  await page.tap('#page-back'); await page.waitForTimeout(300);      // from the map to the handset
  await page.tap('.homebar');                                         // and the handset is put away
  await page.waitForTimeout(300);
  await nlw(page, () => {
    const n = window.__nlw; const g = n.host.game; const v = g.state.vehicles.list['V-0001'];
    v.hire = { playerId: n.playerId, until: g.state.t + 86400, txn: null };      // layout check only: skips the payment
    n.place(v.x - 2.2, v.z + 2.2);
    g.intent(n.playerId, { type: 'vehicle.enter', vehicleId: v.id });
    n.park(-12, 113, Math.PI / 2);
  });
  await page.waitForTimeout(900);
  await shot('05-driving');
  const wide = await nlw(page, () => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (wide) problems.push('phone: page scrolls sideways while driving');
  // chat on a phone: the button appears beside another player, the box fits, and bubbles stay small
  await nlw(page, () => { const n = window.__nlw; n.host.game.intent(n.playerId, { type: 'vehicle.exit' }); n.place(40, 60); const me = n.view.self; n.twin('Chidinma Okafor', 42, 61.5); n.cam.yaw = 1.2; n.cam.dist = 9; });
  await page.waitForTimeout(4000);
  if (!(await page.isVisible('#chat-btn'))) problems.push('phone: no chat button beside another player');
  else {
    await page.tap('#chat-btn');
    await page.waitForTimeout(600);
    await page.fill('#chat-input', 'How far?');
    await shot('06-chat');
    await page.keyboard.press('Enter');
    await nlw(page, () => window.__nlw.second.say('I dey. You?'));
    for (let i = 0; i < 10; i += 1) { await page.waitForTimeout(400); if (await nlw(page, () => [...document.querySelectorAll('#bubbles .bubble.chat')].filter((el) => !el.hidden).length >= 1)) break; }
    await page.screenshot({ path: resolve(out, 'phone-07-chat-bubbles.png') });
    const fit = await nlw(page, () => ({ wide: document.documentElement.scrollWidth > document.documentElement.clientWidth, bubbles: [...document.querySelectorAll('#bubbles .bubble.chat')].filter((b) => !b.hidden).map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), Math.round(r.width), Math.round(r.height)]; }) }));
    if (fit.wide) problems.push('phone: page scrolls sideways with the chat open');
    if (!fit.bubbles.length) problems.push('phone: no chat bubbles are shown');
    for (const [left, right, w, h] of fit.bubbles) if (left < 0 || right > 400 || w > 250 || h > 140) problems.push(`phone: a bubble is at ${left}..${right}, ${w} by ${h}`);
  }
});

// Fighting, critical health, the hospital bill, arrest and the fine, taking a
// motorcycle, the camera's views and the ambulance: each played with the keys
// a player would press, and each checked against the simulation's own ledger.
const fundNow = (page) => nlw(page, () => {
  const n = window.__nlw; const h = n.host;
  for (let t = 0; t < 24; t += 0.1) h.tick(0.1);
  h.bank.align(n.playerId, h.game.view(n.playerId).self.balance + 50000, 'Test funds');
  h.game.state.weather = { kind: 'clear', until: 1e15 };
  n.place(n.view.self.x, n.view.self.z);
});
const now = (page) => nlw(page, () => { const n = window.__nlw; const s = n.view.self; return { mode: n.mode, health: s.health, critical: s.critical, law: s.law.state, foe: s.fight ? s.fight.target.health : null, blocking: !!(s.fight && s.fight.blocking), balance: s.balance, keys: [...document.querySelectorAll('#keys .key')].map((k) => k.textContent.trim()), pad: n.controls.shown.map((b) => b.label), astride: s.astride !== null && s.astride !== undefined, x: s.x, z: s.z }; });
// Someone grown, standing in the open with clear ground in front of them, nearest first.
const someone = (page, x, z) => nlw(page, ([x, z]) => {
  const n = window.__nlw; const g = n.host.game; const pop = g.internals.population; const o = {}; let best = null;
  // (anyone but the police; in a town whose only people are its police, since 22 October 2026, one of them: a fight
  // with an officer is answered by the officer herself, as the police answer any)
  const civilians = pop.people.some((w) => w.age >= 18 && w.job !== 'police');
  for (let i = 0; i < pop.count; i += 1) {
    const w = pop.people[i]; if (w.age < 18 || (civilians && w.job === 'police')) continue;
    pop.locate(i, g.state.t, o); if (o.pose !== 0 || o.moving) continue;
    // (left to their own day, and still standing there a while later: not someone being taken somewhere by something
    // that has happened, such as the one who came to help, nor someone stopped at a kerb only to look before crossing)
    const own = {}, later = {}; pop.planned(i, g.state.t, own); pop.planned(i, g.state.t + 150, later);
    if (Math.hypot(own.x - o.x, own.z - o.z) > 0.3 || later.pose !== 0 || later.moving || Math.hypot(later.x - o.x, later.z - o.z) > 0.3) continue;
    let open = true; for (let k = 1; k <= 6; k += 1) if (!n.walkable(o.x + Math.sin(o.h) * k, o.z + Math.cos(o.h) * k)) open = false;
    if (!open) continue;
    const d = Math.hypot(o.x - x, o.z - z); if (!best || d < best.d) best = { i, x: o.x, z: o.z, h: o.h, d, name: w.short };
  }
  return best;
}, [x, z]);
const faceUp = (page, who) => nlw(page, (w) => { const n = window.__nlw; const x = w.x + Math.sin(w.h) * 1.1, z = w.z + Math.cos(w.h) * 1.1; n.place(x, z); n.face(Math.atan2(w.x - x, w.z - z)); n.cam.yaw = Math.atan2(w.x - x, w.z - z) + 0.5; n.cam.dist = 7; n.cam.pitch = 0.3; }, who);
// Everything on the screen that must not sit on top of anything else, or hang off the edge.
const clashes = (page) => nlw(page, () => {
  const seen = [...document.querySelectorAll('.pad, #stick, #btn-phone, #prompt, #vitals, .plate, .purse, #hud-dash, #taking, #waypoint, #hud-next, #chat-btn, #notices > *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && !e.closest('[hidden]') && getComputedStyle(e).display !== 'none'; });
  const rs = seen.map((e) => { const r = e.getBoundingClientRect(); return { e, id: e.dataset.id || e.id || e.className, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width }; });
  const out = [];
  for (const a of rs) if (a.l < -1 || a.t < -1 || a.r > innerWidth + 1 || a.b > innerHeight + 1) out.push(`${a.id} hangs off the screen`);
  // (the health bars are part of the purse card: one inside the other is not one on top of the other)
  for (let i = 0; i < rs.length; i += 1) for (let j = i + 1; j < rs.length; j += 1) { const a = rs[i], b = rs[j]; if (a.e.contains(b.e) || b.e.contains(a.e)) continue; if (Math.min(a.r, b.r) - Math.max(a.l, b.l) > 2 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 2) out.push(`${a.id} is over ${b.id}`); }
  for (const e of document.querySelectorAll('.pad')) { const r = e.getBoundingClientRect(); if (r.width > 0 && r.width < 44) out.push(`${e.dataset.id} is only ${Math.round(r.width)} px wide`); }
  return out;
});

await session('action', { width: 1280, height: 760 }, async (page, shot) => {
  const bad = (text) => problems.push(`action: ${text}`);
  await page.fill('#name', 'Emeka Nwosu');
  await enterTown(page);
  await page.waitForFunction(() => window.__nlw && window.__nlw.mode === 'walking');
  await fundNow(page);
  // the buttons on offer change with what is within reach
  await nlw(page, () => { window.__nlw.place(-120, 150); });
  await page.waitForTimeout(1200);
  let s = await now(page);
  if (s.keys.some((k) => /Fight|Take|Steal/.test(k))) bad(`with nobody near, the keys offered are ${s.keys.join(', ')}`);
  // --- critical health: no fighting, no running, and the way to help ---
  await nlw(page, () => { const g = window.__nlw.host.game; g.internals.conflict.hurt(g.state.players[window.__nlw.playerId], 85); });
  await page.waitForTimeout(1200);
  s = await now(page);
  await shot('01-critical');
  if (!s.critical || s.health > 20) bad(`the player should be critical (${JSON.stringify(s)})`);
  if (!(await page.isVisible('#critical'))) bad('no CRITICAL HEALTH banner');
  if (s.keys.some((k) => /Run|Fight/.test(k)) || !s.keys.some((k) => /Help/.test(k))) bad(`at critical health the keys offered are ${s.keys.join(', ')}`);
  const who0 = await someone(page, s.x, s.z);
  const refused = await nlw(page, (i) => window.__nlw.host.game.intent(window.__nlw.playerId, { type: 'combat.engage', target: { kind: 'npc', id: i } }), who0.i);
  if (refused.ok) bad('the simulation let a critical player start a fight');
  // --- the hospital: the bill, and one charge for two presses ---
  await nlw(page, () => { const n = window.__nlw; n.place(-144, 7.1); n.cam.yaw = Math.PI; n.cam.dist = 9; });
  await page.waitForTimeout(1500);
  await page.keyboard.press('e'); await page.waitForTimeout(700);
  if ((await page.textContent('#sheet-title')) !== 'Asaba General Hospital') bad('E at the hospital door did not open the hospital');
  const levels = await page.evaluate(() => [...document.querySelectorAll('.level b')].map((b) => b.textContent));
  if (levels.join() !== '40%,60%,80%,100%') bad(`treatment levels offered: ${levels.join()}`);
  await shot('02-hospital-levels');
  await page.click('.level:has-text("80%")'); await page.waitForTimeout(400);
  const bill = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.bill .row')].map((r) => [r.children[0].textContent, r.children[1].textContent])));
  for (const label of ['Current health', 'Treatment level', 'Amount restored', 'Hospital fee', 'Current balance', 'Balance after payment']) if (!(label in bill)) bad(`the bill has no line for ${label}`);
  await shot('03-hospital-bill');
  const fee = Number((bill['Hospital fee'] || '').replace(/[^0-9]/g, ''));
  const before = (await now(page)).balance;
  // the bill is written in TR; the ledger counts units, two to a TR
  if (Number((bill['Balance after payment'] || '').replace(/[^0-9]/g, '')) !== before / 2 - fee) bad(`the bill says ${bill['Balance after payment']} after paying ${fee} TR from ${before / 2} TR`);
  // the same press sent twice, as a double tap or a retry would: one request id, one charge
  const twice = await page.evaluate(() => { const b = [...document.querySelectorAll('#sheet-body button')].find((x) => x.textContent.startsWith('Pay ')); const sent = []; const n = window.__nlw; const real = n.host.game.intent; n.host.game.intent = (id, m) => { const r = real(id, m); if (m.type === 'care.pay') sent.push({ m, r }); return r; }; b.click(); const again = sent.length ? real(n.playerId, sent[0].m) : null; n.host.game.intent = real; return { first: sent[0] ? sent[0].r : null, again }; });
  await page.waitForTimeout(600);
  s = await now(page);
  if (!twice.first || !twice.first.ok) bad(`paying the hospital failed: ${JSON.stringify(twice.first)}`);
  if (!twice.again || !twice.again.replayed) bad(`the second copy of the payment was not recognised: ${JSON.stringify(twice.again)}`);
  if (s.balance !== before - fee * 2) bad(`paid ${fee} TR once, but the balance went from ${before / 2} TR to ${s.balance / 2} TR`);
  if (s.health !== 80) bad(`treated to 80%, health is ${s.health}`);
  await shot('04-hospital-paid');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await nlw(page, () => { const g = window.__nlw.host.game; g.internals.conflict.heal(g.state.players[window.__nlw.playerId], 100); });
  // --- on foot C goes round the views on foot: on the street close behind, further back, over the shoulder, from
  // above (the owner's brief of 19 October 2026: the camera button kept, and the street view first) ---
  await nlw(page, () => { const n = window.__nlw; n.place(0, 60); n.cam.yaw = Math.PI; });
  const views = [];
  for (let i = 0; i < 5; i += 1) { await page.waitForTimeout(1500); views.push(await nlw(page, () => window.__nlw.rig.view)); await shot(`05-view-${views[i]}`); await page.keyboard.press('c'); }
  const FOOT_VIEWS = ['street', 'behind', 'shoulder', 'high'];
  if (new Set(views).size !== 4 || !views.every((v, i) => FOOT_VIEWS.includes(v) && (i === 0 || FOOT_VIEWS.indexOf(v) === (FOOT_VIEWS.indexOf(views[i - 1]) + 1) % 4))) bad(`on foot C should go round ${FOOT_VIEWS.join(', ')}; it went through ${views.join(', ')}`);
  await nlw(page, () => { window.__nlw.rig.view = 'street'; });
  // --- a fight: squaring up, blows, blocking; then the police ---
  const who = await someone(page, 0, 60);
  await faceUp(page, who);
  // (a second and a half of the game's own time: who is within reach is worked out as the game runs)
  const facedAt = await nlw(page, () => window.__nlw.host.game.state.real);
  await page.waitForFunction((t) => window.__nlw.host.game.state.real >= t, facedAt + 1.5, { timeout: 60000 }).catch(() => {});
  s = await now(page);
  if (!s.keys.some((k) => /Fight/.test(k))) bad(`facing ${who.name}, the keys offered are ${s.keys.join(', ')}`);
  await page.keyboard.press('f'); await page.waitForTimeout(1000);
  s = await now(page);
  if (s.mode !== 'combat') bad(`F did not start a fight (${s.mode})`);
  for (const want of ['Punch', 'Heavy', 'Kick', 'Block', 'Dodge', 'Shove', 'Grab', 'Leave']) if (!s.keys.some((k) => k.includes(want))) bad(`no ${want} key in a fight`);
  if (s.keys.some((k) => /Run|Take|Steal/.test(k))) bad(`a fight still offers ${s.keys.join(', ')}`);
  if (!(await page.isVisible('#vital-foe'))) bad('no health bar for the other fighter');
  await shot('06-squared-up');
  await page.keyboard.press('f'); await page.waitForTimeout(900);
  await page.keyboard.down('q'); await page.waitForTimeout(700);
  if (!(await now(page)).blocking && (await now(page)).mode === 'combat') bad('holding Q does not block');
  await page.keyboard.up('q');
  await page.keyboard.press('g'); await page.waitForTimeout(1300);
  await shot('07-fight');
  const crime = await nlw(page, () => window.__nlw.host.game.audit().justice);
  s = await now(page);
  if (s.law === 'normal' && !(await nlw(page, () => window.__nlw.view.self.law.wanted.length))) console.log('action: nobody saw the blows this time');
  // walk away; the police come on foot, arrest, and walk the player in
  await page.keyboard.press('v');
  let held = false;
  for (let t = 0; t < 200; t += 1) { s = await now(page); if (s.law === 'custody') { held = true; break; } if (s.law === 'arrested' && t % 20 === 0) await shot('08-walked-in'); if (s.law === 'normal' && t > 60) break; await page.waitForTimeout(1500); }
  if (!held) console.log(`action: no arrest followed the fight (law ${s.law}): no witness came forward`);
  else {
    // one button, for the officer; the phone keeps its own button in the corner, so it is not offered twice
    if (s.mode !== 'custody' || s.pad.join() !== 'Police') bad(`in custody the buttons are ${s.pad.join(', ')} (${s.mode})`);
    if (!(await page.isVisible('#btn-phone'))) bad('in custody there is no way to the phone');
    const tried = await nlw(page, () => window.__nlw.host.game.intent(window.__nlw.playerId, { type: 'move', x: 0, z: 0, heading: 0 }));
    if (tried.ok) bad('a prisoner could walk away');
    await shot('09-custody');
    await page.keyboard.press('e'); await page.waitForTimeout(700);
    await shot('10-custody-panel');
    const fine = await nlw(page, () => window.__nlw.view.self.law.arrest.fine.amount);
    const b0 = (await now(page)).balance;
    await page.click('#sheet-body button:has-text("Pay ")'); await page.waitForTimeout(700);
    s = await now(page);
    if (s.balance !== b0 - fine) bad(`the fine was ${fine}; the balance went from ${b0} to ${s.balance}`);
    if (s.law !== 'released' && s.law !== 'normal') bad(`after paying the fine the player is ${s.law}`);
    const after = await nlw(page, () => window.__nlw.host.game.audit().justice);
    if (after.fines - crime.fines !== fine || after.toGovernment - crime.toGovernment !== fine) bad(`a police officer's fine of ${fine} should all go to government: ${JSON.stringify(after)}`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  }
  // --- taking a motorcycle: only from beside the rider, and it is a crime ---
  await nlw(page, () => { window.__nlw.place(160, -48); });
  await page.waitForTimeout(1200);
  const bike = await nlw(page, () => window.__nlw.view.okadas.find((o) => o.stopped) || null);
  if (!bike) console.log('action: no rider was waiting at the east stage');
  else {
    // behind it, at the passenger's place: nothing to take
    await nlw(page, (o) => { const n = window.__nlw; const x = o.x - Math.sin(o.h) * 1.3, z = o.z - Math.cos(o.h) * 1.3; n.place(x, z); n.face(o.h); }, bike);
    await page.waitForTimeout(1200);
    if ((await now(page)).keys.some((k) => /Take/.test(k))) bad('Take is offered from behind the motorcycle');
    await nlw(page, (o) => { const n = window.__nlw; const x = o.x + Math.cos(o.h) * 0.95, z = o.z - Math.sin(o.h) * 0.95; n.place(x, z); n.face(Math.atan2(o.x - x, o.z - z)); n.cam.yaw = o.h + 2.4; n.cam.dist = 6; }, bike);
    await page.waitForTimeout(1200);
    if (!(await now(page)).keys.some((k) => /Take/.test(k))) bad('Take is not offered beside the rider');
    await page.keyboard.press('g'); await page.waitForTimeout(500);
    s = await now(page);
    if (s.mode !== 'taking' && s.mode !== 'moto') bad(`G beside the rider: ${s.mode}`);
    await shot('11-taking');
    await page.waitForFunction(() => window.__nlw.mode === 'moto', null, { timeout: 20000 }).catch(() => bad('never got onto the motorcycle'));
    s = await now(page);
    if (!s.pad.includes('Horn') || s.pad.includes('Run')) bad(`on the motorcycle the buttons are ${s.pad.join(', ')}`);
    // the views from a vehicle, straight away: the police may not be long
    const bikeViews = [];
    for (let i = 0; i < 5; i += 1) { bikeViews.push(await nlw(page, () => window.__nlw.rig.view)); await page.keyboard.press('c'); await page.waitForTimeout(250); }
    if (new Set(bikeViews).size !== 4 && (await now(page)).mode === 'moto') bad(`C went through these views on the motorcycle: ${bikeViews.join(', ')}`);
    const from = s;
    await page.keyboard.down('w'); await page.waitForTimeout(3500); await page.keyboard.up('w');
    s = await now(page);
    await shot('12-riding');
    if (s.mode === 'moto' && Math.hypot(s.x - from.x, s.z - from.z) < 3) bad('the motorcycle did not move');
    if ((await nlw(page, () => window.__nlw.view.self.law.state)) === 'normal') bad('taking a motorcycle left the player with nothing against them');
    await page.keyboard.press('e'); await page.waitForTimeout(900);
  }
  const audit = await nlw(page, () => ({ ledger: window.__nlw.host.auditor.reconcile(), justice: window.__nlw.host.game.audit().justice, care: window.__nlw.host.game.audit().care, reserves: window.__nlw.host.portal === undefined && window.__nlw.host.settlementOps === undefined }));
  if (audit.ledger.length || !audit.reserves) bad(`audit failed ${JSON.stringify(audit)}`);
  console.log('action session: ' + JSON.stringify({ justice: audit.justice, care: audit.care }));
});

// A phone held sideways, and upright: the buttons for each thing the player
// can be doing, none on top of another and none off the screen.
for (const [name, size] of [['sideways', { width: 760, height: 360, touch: true }], ['upright', { width: 390, height: 800, touch: true }]]) {
  await session(name, size, async (page, shot) => {
    const bad = (text) => problems.push(`${name}: ${text}`);
    await enterTown(page, { tap: true });
    await page.waitForFunction(() => window.__nlw && window.__nlw.mode === 'walking');
    await fundNow(page);
    const check = async (label, want) => {
      await page.waitForTimeout(1300);
      await shot(label);
      const s = await now(page);
      for (const b of want) if (!s.pad.includes(b)) bad(`${label}: no ${b} button (${s.pad.join(', ')})`);
      if (!want.includes('View') && s.pad.includes('View')) bad(`${label}: a View button where there should be none`);
      for (const c of await clashes(page)) bad(`${label}: ${c}`);
      if (await nlw(page, () => document.documentElement.scrollWidth > document.documentElement.clientWidth)) bad(`${label}: the page scrolls sideways`);
      return s;
    };
    await nlw(page, () => { const n = window.__nlw; n.place(0, 60); n.cam.yaw = Math.PI; });
    // (no View button on a touch screen since 30 October 2026, the owner's brief: "remove that camera icon on the
    // screen"; a finger dragged on the picture turns the view: `check` finds any View button wrong)
    await check('01-walking', ['Run']);
    const who = await someone(page, 0, 60);
    await faceUp(page, who);
    await check('02-someone-near', ['Run', 'Fight']);
    await nlw(page, () => window.__nlw.act('fight'));
    const fight = await check('03-fight', ['Punch', 'Heavy', 'Kick', 'Block', 'Dodge', 'Shove', 'Grab', 'Leave']);
    if (fight.pad.includes('Run')) bad('Run is still shown in a fight');
    await nlw(page, () => { const n = window.__nlw; const g = n.host.game; n.act('leave'); g.internals.conflict.hurt(g.state.players[n.playerId], 85); n.place(-120, 150); });
    const hurt = await check('04-critical', ['Help']);
    if (hurt.pad.includes('Run') || hurt.pad.includes('Fight')) bad(`critical: ${hurt.pad.join(', ')}`);
    await nlw(page, () => { const n = window.__nlw; const g = n.host.game; g.internals.conflict.heal(g.state.players[n.playerId], 100); const v = g.state.vehicles.list['V-0001']; v.hire = { playerId: n.playerId, until: g.state.t + 86400, txn: null }; n.place(v.x - 2.2, v.z + 2.2); g.intent(n.playerId, { type: 'vehicle.enter', vehicleId: v.id }); n.park(-12, 113, Math.PI / 2); });
    const drive = await check('05-driving', ['Accelerate', 'Brake', 'Horn']);
    if (drive.pad.includes('View') || !(await nlw(page, () => document.querySelector('#stick').classList.contains('wheel')))) bad(`at the wheel: ${drive.pad.join(', ')}, and the stick should be a steering wheel`);
    if (drive.pad.includes('Run') || drive.pad.includes('Fight')) bad(`driving: ${drive.pad.join(', ')}`);
    await nlw(page, () => { const n = window.__nlw; n.host.game.intent(n.playerId, { type: 'vehicle.exit' }); n.place(-10, 110); });
    await page.waitForTimeout(600);
    await page.tap('#btn-phone'); await page.waitForTimeout(500);
    await shot('06-phone');
    await page.tap('.app:has-text("Map")'); await page.waitForTimeout(400);
    await page.tap('.rowbtn:has-text("General Hospital")'); await page.waitForTimeout(600);
    await shot('07-map-way');
    const way = await page.textContent('#sheet-body');
    if (!/On foot/.test(way) || !/\d+ m/.test(way)) bad('the map gives no distance or time to the hospital');
    await page.tap('button:has-text("Mark it in the town")'); await page.waitForTimeout(300);
    await nlw(page, () => window.__nlw.ui.close());
    await check('08-waypoint', ['Run']);
    if (!(await page.isVisible('#waypoint'))) bad('no waypoint line after marking a place');
  });
}

await browser.close();
if (problems.length) { console.log('PROBLEMS'); for (const p of problems) console.log(' - ' + p); process.exit(1); }
console.log('play-through ok, screenshots in ' + out);
