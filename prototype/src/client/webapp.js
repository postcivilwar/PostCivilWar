// The game as an app on a device: installed from the website, opened from its own icon, kept there so it opens
// with no connection.
//
// This is the page's side of it, and it does something only on the website. The website's page has a manifest
// (src/site/manifest.webmanifest) and a worker that keeps its files (src/site/sw.js); the page published as an
// artifact and the copy opened from a disk have neither, and there this stands idle and offers nothing.
//
// What it does: starts the worker; tells it which figure this player is, so that that figure's files are kept (and
// no other: a player looking through the characters fetches many); asks the browser to keep the player's character safe once the game is installed; and answers three
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

const idle = Object.freeze({ site: false, state: () => ({ site: false, way: null, offline: 'no' }), refresh: () => Promise.resolve(), keepFigure: () => {}, keepFiles: () => {}, install: () => Promise.resolve(false) });

// figures: the files a figure is fetched from, by its id (on the website its light copy: animated.js, lightFiles), as
//          paths beside the page; [] for a figure there are none of
// figure:  the id of the figure this player is using just now
export function createWebApp({ win = typeof window === 'undefined' ? null : window, figures = () => [], figure = () => null, library = 'three.min.js' } = {}) {
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
  let pendingKeep = null;
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

  // The player's own figure, once it is drawn (main.js says so): the worker is told to keep its files. The browser
  // has them already, so nothing is fetched twice. A figure only looked at is never kept.
  const told = new Set();
  function keepFigure(id) {
    const paths = figures(id);
    if (!paths.length || told.has(id) || id !== figure()) return;
    told.add(id);
    tell({ type: 'keep', paths });
  }
  function watchFigures() { if (figure()) keepFigure(figure()); }
  // Files the game will want later and keeps for playing without a connection (the habitation's script, asked for by
  // the page only once the town is up): the worker is told to keep them, and fetches any it has not got itself, in
  // its own time; the page fetching it later is then answered from what is kept, not sent twice.
  const filesToKeep = new Set();
  function keepFiles(addresses) {
    for (const address of addresses) if (address) filesToKeep.add(String(address).split('?')[0]);
    if (filesToKeep.size) tell({ type: 'keep', paths: [...filesToKeep] });
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
        if (filesToKeep.size) keepFiles([]);
        if (pendingKeep) { keepFigure(pendingKeep); pendingKeep = null; }
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
      // (on the website the game's script, the two kits, the townspeople's reactions and the cover's pictures are files
      // of their own, and are needed as much as the page)
      const bare = (address) => String(address).split('?')[0];
      const packs = Object.values((win && win.__PCW_PACK_FILES) || {}).map((entry) => bare((entry && entry.url) || entry));
      const others = Object.values((win && win.__PCW_FILES) || {}).map(bare);
      const cover = typeof doc.querySelectorAll === 'function' ? Array.from(doc.querySelectorAll('link[rel="preload"][as="image"]')).map((link) => bare(link.getAttribute('href') || '')).filter(Boolean) : [];
      const script = typeof doc.querySelector === 'function' && doc.querySelector('script[src^="game.js"]') ? ['game.js'] : [];
      const needs = ['', library].concat(script, packs, others, cover, figure() ? figures(figure()) : []);
      return { site: true, way, offline: playsOffline({ worker: !!worker(), kept, needs }) };
    },
    refresh,
    // the player's own figure is drawn: its files are to be kept
    keepFigure: (id) => { if (registration && registration.active) keepFigure(id); else pendingKeep = id; },
    keepFiles,
    // The browser's own question. True if the player said yes.
    async install() {
      const offer = win.__PCW_INSTALL;
      if (!offer || typeof offer.prompt !== 'function') return false;
      win.__PCW_INSTALL = null;        // an offer can be used once
      try { offer.prompt(); const choice = await offer.userChoice; return !!choice && choice.outcome === 'accepted'; } catch (error) { return false; }
    },
  };
}
