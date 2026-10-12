// The game as an app on a device: installed from the website, opened from its own icon, kept there so it opens
// with no connection.
//
// This is the page's side of it, and it does something only on the website. The website's page has a manifest
// (src/site/manifest.webmanifest) and a worker that keeps its files (src/site/sw.js); the page published as an
// artifact and the copy opened from a disk have neither, and there this stands idle and offers nothing.
//
// What it does: starts the worker; tells it which of the two large figures this player has used, so that one
// is kept; asks the browser to keep the player's character safe once the game is installed; and answers three
// questions for Settings: can it be installed here and how, is it installed, does it play without a connection.

// How this browser lets the game be installed.
//   'installed'  this is the installed game
//   'prompt'     the browser has offered: one press and its own question
//   'share'      an iPhone or iPad: Share, then Add to Home Screen. There is no other way there.
//   null         not here, or not yet
export function installWay({ site, standalone, offered, userAgent = '', platform = '', touchPoints = 0 }) {
  if (!site) return null;
  if (standalone) return 'installed';
  if (offered) return 'prompt';
  // an iPad says it is a Mac; a Mac has no touch screen
  const apple = /iPhone|iPad|iPod/.test(userAgent) || (platform === 'MacIntel' && touchPoints > 1);
  return apple ? 'share' : null;
}

// Does it play with no connection: only when the page, the 3D library and the player's own figure are all kept.
//   'yes' | 'not yet' (a worker is there but something is still to be kept) | 'no' (no worker)
export function playsOffline({ worker, kept = [], needs = [] }) {
  if (!worker) return 'no';
  return needs.every((path) => kept.includes(path)) ? 'yes' : 'not yet';
}

const idle = Object.freeze({ site: false, state: () => ({ site: false, way: null, offline: 'no' }), refresh: () => Promise.resolve(), install: () => Promise.resolve(false) });

// figures: which file each supplied figure is fetched from, by id ({ W1: 'woman.b64.txt', ... })
// figure:  the id of the figure this player is using just now
export function createWebApp({ win = typeof window === 'undefined' ? null : window, figures = {}, figure = () => null, library = 'three.min.js' } = {}) {
  if (!win || !win.document) return idle;
  const doc = win.document, nav = win.navigator || {};
  if (!doc.querySelector('link[rel="manifest"]')) return idle;
  let framed = true;
  try { framed = win.self !== win.top; } catch (error) { framed = true; }
  const mode = (name) => { try { return !!win.matchMedia && win.matchMedia(`(display-mode: ${name})`).matches; } catch (error) { return false; } };
  // as it was when the page opened: a browser window made full screen afterwards is still a browser window
  const standalone = nav.standalone === true || mode('standalone') || mode('fullscreen') || mode('minimal-ui') || mode('window-controls-overlay');
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(win.location.hostname);
  const can = !framed && 'serviceWorker' in nav && (win.location.protocol === 'https:' || local);

  let registration = null;
  let kept = [];
  const worker = () => (registration && (registration.active || registration.waiting || registration.installing)) || null;
  const tell = (message, transfer) => { const w = registration && registration.active; if (w) w.postMessage(message, transfer || []); };

  // what the worker has: asked, never assumed
  function refresh() {
    const w = registration && registration.active;
    if (!w || typeof win.MessageChannel !== 'function') return Promise.resolve();
    return new Promise((resolve) => {
      const channel = new win.MessageChannel();
      const timer = win.setTimeout(resolve, 3000);
      channel.port1.onmessage = (event) => { win.clearTimeout(timer); if (event.data && Array.isArray(event.data.paths)) kept = event.data.paths; resolve(); };
      w.postMessage({ type: 'kept' }, [channel.port2]);
    });
  }

  // Each figure the page has fetched is 10 MB or more and was fetched before the worker could see it (the page's
  // first script begins it). Once it has arrived the worker is told to keep it; the browser still has it, so
  // nothing is fetched twice. A figure never used is never kept.
  const told = new Set();
  function keepFigure(id) {
    const path = figures[id];
    const arriving = win.__PCW_FIGURE_BYTES && win.__PCW_FIGURE_BYTES[id];
    if (!path || !arriving || told.has(id)) return;
    told.add(id);
    Promise.resolve(arriving).then(() => { tell({ type: 'keep', paths: [path] }); }).catch(() => { told.delete(id); });
  }
  function watchFigures() {
    for (const id of Object.keys(win.__PCW_FIGURE_BYTES || {})) keepFigure(id);
    const load = win.__PCW_LOAD_FIGURE;
    if (typeof load !== 'function' || load.__kept) return;
    const wrapped = function (id) { const result = load(id); keepFigure(id); return result; };
    wrapped.__kept = true;
    win.__PCW_LOAD_FIGURE = wrapped;
  }

  // An installed game is where a player's character lives. Ask the browser not to clear it away when the
  // device runs short of room. Asked only of an installed game: some browsers put a question to the player.
  function keepSaves() {
    try { if (nav.storage && typeof nav.storage.persist === 'function') nav.storage.persist().catch(() => {}); } catch (error) { /* not offered here */ }
  }

  if (can) {
    const begin = () => {
      nav.serviceWorker.register('sw.js').then((made) => { registration = made; return nav.serviceWorker.ready; }).then((ready) => {
        registration = ready;
        watchFigures();
        return refresh();
      }).catch(() => { /* no worker: the game plays as it always has, from the network */ });
    };
    if (doc.readyState === 'complete') begin(); else win.addEventListener('load', begin, { once: true });
  }
  if (standalone) keepSaves();
  win.addEventListener('appinstalled', keepSaves);

  return {
    site: true,
    state() {
      const way = installWay({ site: true, standalone: standalone || win.__PCW_INSTALLED === true, offered: !!win.__PCW_INSTALL, userAgent: nav.userAgent, platform: nav.platform, touchPoints: nav.maxTouchPoints });
      // (on the website the two kits are files of their own, and are needed as much as the page)
      const packs = Object.values((win && win.__PCW_PACK_FILES) || {}).map((address) => String(address).split('?')[0]);
      const needs = ['', library].concat(packs, figures[figure()] ? [figures[figure()]] : []);
      return { site: true, way, offline: playsOffline({ worker: !!worker(), kept, needs }) };
    },
    refresh,
    // The browser's own question. True if the player said yes.
    async install() {
      const offer = win.__PCW_INSTALL;
      if (!offer || typeof offer.prompt !== 'function') return false;
      win.__PCW_INSTALL = null;        // an offer can be used once
      try { offer.prompt(); const choice = await offer.userChoice; return !!choice && choice.outcome === 'accepted'; } catch (error) { return false; }
    },
  };
}
