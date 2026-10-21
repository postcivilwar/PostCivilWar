// How a browser test gets from the page to the town, the way a player does: the one question answered if it is
// asked, a character chosen, and the choice confirmed. Shared by the browser tests; not a test itself.

// Past the opening, to the screen where a character is made. A player who has never said hero or villain is
// asked once, before anything else: this answers.
export async function pastQuestion(page, path = 'hero') {
  await page.waitForFunction(() => {
    const n = window.__nlw; if (!n || !n.intro) return false;
    const start = document.querySelector('#start');
    return n.intro.asking() || (start && !start.hidden && start.dataset.screen === 'create');
  }, null, { timeout: 300000 });
  if (await page.evaluate(() => window.__nlw.intro.asking())) {
    await page.waitForTimeout(400);
    await page.evaluate((p) => document.querySelector(`.pick[data-path="${p}"]`).click(), path);
    // (the town may be being built at this moment, with the page too busy to count the half second the answer takes)
    await page.waitForFunction(() => !window.__nlw.intro.asking(), null, { timeout: 300000 });
  }
  // Enter is offered once the town has been made ready to draw
  await page.waitForFunction(() => { const b = document.querySelector('#enter'); const s = document.querySelector('#start'); return b && !b.disabled && !s.hidden && s.dataset.screen === 'create'; }, null, { timeout: 300000 });
}

// Enter, and the question that follows it: "Choose this character?". Gives what the question said.
// (`wait`: how long the town may take to be built and shown: longer for a second player brought in while another page
// on this machine is drawing a heavy scene)
export async function enterTown(page, { tap = false, answer = 'yes', wait = 180000 } = {}) {
  const press = (sel) => (tap ? page.tap(sel) : page.click(sel));
  await press('#enter');
  await page.waitForSelector('#confirm:not([hidden])', { timeout: 60000 });
  const asked = await page.evaluate(() => ({ title: document.querySelector('#confirm-title').textContent, body: document.querySelector('#confirm-body').textContent, yes: document.querySelector('#confirm-yes').textContent.trim(), no: document.querySelector('#confirm-no').textContent.trim(), hud: !document.querySelector('#hud').hidden }));
  if (answer === 'no') { await press('#confirm-no'); await page.waitForSelector('#confirm', { state: 'hidden' }); return asked; }
  await press('#confirm-yes');
  await page.waitForFunction(() => !document.querySelector('#hud').hidden && window.__nlw.view && window.__nlw.playerId, null, { timeout: wait });
  const over = await page.evaluate(overTown);
  if (over) throw new Error(`entered the town, but ${over}`);
  return asked;
}

// In town, with nothing of the start screen left over it: what is wrong, in words, or '' if nothing is. (The
// start screen being marked hidden is not enough: it once stayed on the screen all the same.)
export const overTown = () => {
  const start = document.querySelector('#start'), hud = document.querySelector('#hud');
  const box = start.getBoundingClientRect();
  if (hud.hidden || !hud.getBoundingClientRect().width) return 'the town\'s own screen is not showing';
  if (box.width > 0 || box.height > 0 || getComputedStyle(start).display !== 'none') return `the start screen is still on the screen (${Math.round(box.width)} by ${Math.round(box.height)}, "${start.dataset.screen}")`;
  for (const [x, y] of [[0.5, 0.5], [0.25, 0.3], [0.75, 0.7], [0.5, 0.85]]) { const top = document.elementFromPoint(innerWidth * x, innerHeight * y); if (top && top.closest('#start, #intro')) return `${top.closest('#start') ? 'the start screen' : 'the opening'} lies over the town at ${x}, ${y}`; }
  return '';
};

// The opening is over and put away (it is hidden, not removed: the question may be asked later).
export const openingOver = () => { const i = document.querySelector('#intro'); return !i || i.hidden; };

// Every picture handed to the graphics card, watched for one the page had already let go of (glb.js lets a picture's
// own copy go once the card has it: handed over again after that, it is empty, and what it covers is drawn black).
// Call on a browser context before its pages open; `lostPictures(page)` then gives how many there have been.
export async function watchPictures(context) {
  await context.addInitScript(() => {
    window.__lostPictures = 0;
    for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!C) continue;
      for (const name of ['texImage2D', 'texSubImage2D']) {
        const orig = C.prototype[name];
        C.prototype[name] = function (...args) {
          for (const a of args) if (typeof ImageBitmap !== 'undefined' && a instanceof ImageBitmap && (a.width === 0 || a.height === 0)) window.__lostPictures += 1;
          return orig.apply(this, args);
        };
      }
    }
  });
}
export const lostPictures = (page) => page.evaluate(() => window.__lostPictures || 0);
