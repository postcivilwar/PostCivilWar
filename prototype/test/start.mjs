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
// Call on a browser context before its pages open; `lostPictures(page)` then gives how many there have been, and
// `lostWhat(page)` what the first few were: where in the game each was handed over from, where its picture was made
// (`made`) and where it was let go (`letGo`). (3 November 2026: the graphics test found one, twice, handed over as
// three.js drew the scene; a stack ten deep, the browser's own, ended inside three.js, so these go deeper.)
export async function watchPictures(context) {
  await context.addInitScript(() => {
    window.__lostPictures = 0;
    window.__lostWhat = [];
    // (where the game is just now: past three.js's own steps, each run of which is shown by its first only)
    const where = (skip) => {
      const limit = Error.stackTraceLimit; Error.stackTraceLimit = 60;
      const stack = String(new Error().stack || ''); Error.stackTraceLimit = limit;
      const lines = stack.split('\n').slice(skip).map((l) => l.trim().replace(/^at /, '').replace(/https?:\/\/[^/]+\//, '').replace(/\?v=[0-9a-f]+/, ''));
      return lines.filter((l, i) => !/three\.min\.js/.test(l) || !/three\.min\.js/.test(lines[i - 1] || '')).slice(0, 18).join(' < ');
    };
    const made = new WeakMap(), shut = new WeakMap();
    if (typeof window.createImageBitmap === 'function') {
      const make = window.createImageBitmap;
      window.createImageBitmap = function (...args) {
        const from = where(3);
        return make.apply(this || window, args).then((b) => { try { made.set(b, from); } catch (error) { /* kept as it is */ } return b; });
      };
    }
    if (typeof ImageBitmap !== 'undefined' && typeof ImageBitmap.prototype.close === 'function') {
      const close = ImageBitmap.prototype.close;
      ImageBitmap.prototype.close = function () {
        if (this.width && !shut.has(this)) shut.set(this, { at: Math.round(performance.now() / 1000), from: where(3) });
        return close.call(this);
      };
    }
    // (and where a picture read from its file was last let go from the graphics card (`dispose`), or marked to be handed
    // over again (`needsUpdate`), as three.js is put on the page: three.min.js sets `THREE` once)
    const cardGone = new WeakMap(), marked = new WeakMap();
    const isBitmap = (image) => typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap;
    // (and one let go from the graphics card, its own copy let go too, while something drawn in the town still uses it:
    // drawn again so, it would be drawn black. Looked at a moment after, as glb.js gives one it makes again its new
    // picture just after letting it go)
    window.__inUseLetGo = [];
    const usedBy = (texture) => {
      const n = window.__nlw, scene = n && n.scene;
      if (!scene) return null;
      let found = null;
      const walk = (o, shown) => {
        if (found) return;
        const v = shown && o.visible !== false;
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        if (v && mats.some((m) => m && m.visible !== false && Object.values(m).includes(texture))) { found = `${o.name || o.type}${o.parent ? ` in ${o.parent.name || o.parent.type}` : ''}`; return; }
        for (const c of o.children) walk(c, v);
      };
      walk(scene, true);
      return found;
    };
    const watchThree = (T) => {
      const proto = T && T.Texture && T.Texture.prototype;
      if (!proto) return;
      const dispose = proto.dispose;
      proto.dispose = function () {
        if (isBitmap(this.image)) {
          const image = this.image, texture = this, from = where(3), at = Math.round(performance.now() / 1000);
          cardGone.set(image, { at, letGoAlready: image.width === 0, from });
          setTimeout(() => {
            if (texture.image !== image || image.width !== 0 || window.__inUseLetGo.length >= 6) return;
            const user = usedBy(texture);
            if (user) window.__inUseLetGo.push({ at, by: user, size: texture.userData && texture.userData.drawn, from });
          }, 0);
        }
        return dispose.call(this);
      };
      const d = Object.getOwnPropertyDescriptor(proto, 'needsUpdate');
      if (d && d.set) {
        Object.defineProperty(proto, 'needsUpdate', { configurable: true, enumerable: d.enumerable, get: d.get, set(value) {
          if (value === true && isBitmap(this.image) && this.image.width === 0) marked.set(this.image, { at: Math.round(performance.now() / 1000), from: where(3) });
          d.set.call(this, value);
        } });
      }
    };
    try {
      Object.defineProperty(window, 'THREE', { configurable: true, enumerable: true, get() { return undefined; }, set(value) {
        Object.defineProperty(window, 'THREE', { value, writable: true, configurable: true, enumerable: true });
        try { watchThree(value); } catch (error) { /* watched without it */ }
      } });
    } catch (error) { /* watched without it */ }
    const lost = (kind, image = null) => {
      window.__lostPictures += 1;
      if (window.__lostWhat.length >= 4) return;
      const what = { kind, at: Math.round(performance.now() / 1000), from: where(4) };
      if (isBitmap(image)) {
        what.made = made.get(image) || '(not seen made: on a worker)'; what.letGo = shut.get(image) || null;
        what.cardLetGo = cardGone.get(image) || null; what.marked = marked.get(image) || null;
      }
      window.__lostWhat.push(what);
    };
    for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!C) continue;
      for (const name of ['texImage2D', 'texSubImage2D']) {
        const orig = C.prototype[name];
        C.prototype[name] = function (...args) {
          for (const a of args) if (typeof ImageBitmap !== 'undefined' && a instanceof ImageBitmap && (a.width === 0 || a.height === 0)) lost('a picture read from its file, its copy let go', a);
          // (a picture painted on a canvas whose pixels were let go once the card had it, painted.js, handed over again
          // without being painted again first)
          for (const a of args) if (typeof HTMLCanvasElement !== 'undefined' && a instanceof HTMLCanvasElement && a.__letGo) lost('a painted picture, its pixels let go');
          return orig.apply(this, args);
        };
      }
    }
  });
}
export const lostPictures = (page) => page.evaluate(() => window.__lostPictures || 0);
export const lostWhat = (page) => page.evaluate(() => window.__lostWhat || []);
export const inUseLetGo = (page) => page.evaluate(() => window.__inUseLetGo || []);

// A police officer of the town's brought to stand `metres` from (x, z), out in the open in sight of it, and kept
// standing there (31 October 2026, the owner's word: only what an officer on the scene sees is a crime, justice.js;
// the same as world.mjs officerOnScene for the headless tests). Gives her number, or null.
export const officerOnScene = (page, x, z, metres = 18) => page.evaluate(([x, z, metres]) => {
  const n = window.__nlw, g = n.host.game, A = g.internals.actors, J = g.internals.justice, pop = g.internals.population;
  const officers = pop.people.filter((q) => q.job === 'police' && !A.has(q.index)).map((q) => q.index);
  for (const d of [metres, metres * 0.6, 25, 28]) {
    for (let a = 0; a < 32; a += 1) {
      const ang = (a / 32) * Math.PI * 2, ox = x + Math.sin(ang) * d, oz = z + Math.cos(ang) * d;
      if (!n.walkable(ox, oz) || !J.inSight(x, z, ox, oz)) continue;
      const i = officers[0];
      if (i === undefined) return null;
      A.take(i, g.state.t, { x: ox, z: oz }); A.hold(i, 'On the beat', 0, 0); A.get(i).h = Math.atan2(x - ox, z - oz);
      return i;
    }
  }
  return null;
}, [x, z, metres]);
