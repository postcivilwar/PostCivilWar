'use strict';
// PostCivilWar on a device: this keeps the game's files there, so that it opens from its icon whether or not
// there is a connection, and never fetches a file twice that has not changed.
//
// It is written out by build.mjs, which fills in the table below from the files it has just made. Nothing
// here knows anything about the game: it is a list of files and two rules.
//
//   The page itself: the network first, so a player with a connection always has the newest game; the copy
//   kept here when there is no connection, or when none answers within a few seconds.
//
//   Every other file (the 3D library, the two figures, the icons): the copy kept here, if there is one. Each
//   is kept under the fingerprint of its contents, so a file that changes is fetched again and a file that
//   does not is never fetched again, however often the game is brought up to date.
//
// The figures are 5 to 38 MB each. Only the one a player actually uses is kept (the page says which).

const FILES = /*@@FILES@@*/{};        // path beside the page -> fingerprint of the file's contents
const FIRST = /*@@FIRST@@*/[];        // kept as soon as this is installed: the page and the small files
const ASKED = new Set(/*@@ASKED@@*/[]);  // kept only when the page asks: the figures (each 5 to 38 MB), the player's own
const PAGE = '';                      // the page's own path: the folder this file is in
const CACHE = 'pcw-files-v1';
const WAIT = 4000;                    // how long the network has to answer for the page before the kept copy is shown (ms)

const scope = new URL(self.registration.scope);
const urlOf = (path) => new URL(path || './', scope).href;
const keyOf = (path) => (path === PAGE ? new URL('./?pcw=page', scope).href : new URL(`${path}?pcw=${FILES[path]}`, scope).href);
// Which of the game's files an address is: '' for the page, null for anything that is not ours.
function pathOf(address) {
  const url = new URL(address);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return null;
  const path = url.pathname.slice(scope.pathname.length);
  if (path === '' || path === 'index.html') return PAGE;
  return Object.prototype.hasOwnProperty.call(FILES, path) ? path : null;
}
// Only a whole, ordinary answer from this site is worth keeping: not an error page, not a redirect elsewhere.
const good = (response) => !!response && response.ok && response.status === 200 && response.type !== 'opaque' && response.type !== 'opaqueredirect' && !response.redirected;
const fresh = (path) => fetch(new Request(urlOf(path), { cache: 'no-cache', credentials: 'same-origin' }));
const drop = (response) => { try { if (response && response.body) response.body.cancel().catch(() => {}); } catch (error) { /* already read */ } };

// A file kept under its fingerprint: from here if it is here, otherwise fetched, kept and handed on. A page may
// ask for a file by the fingerprint it was built with (`?v=`): if that is not the one this worker knows (a page
// newer than this worker, or older), the file is fetched as it is now and not kept, so that a page and the
// files it was built with are never mixed with those of another build.
// A figure is not kept just for being fetched (a player looking through the characters fetches many): only when
// the page asks for it to be (`keep`), which it does for the player's own.
async function file(path, event, keep = !ASKED.has(path)) {
  const asked = event.request ? new URL(event.request.url).searchParams.get('v') : null;      // (a page's message has no request)
  if (asked && asked !== FILES[path]) return fetch(new Request(event.request.url, { cache: 'no-cache', credentials: 'same-origin' }));
  const cache = await caches.open(CACHE);
  const kept = await cache.match(keyOf(path), { ignoreVary: true });
  if (kept) return kept;
  const response = await fresh(path);
  if (keep && good(response)) event.waitUntil(cache.put(keyOf(path), response.clone()).catch(() => {}));
  return response;
}

// The page: whatever the network gives, if it gives it in time; otherwise the copy kept from last time.
async function page(event) {
  const cache = await caches.open(CACHE);
  const kept = await cache.match(keyOf(PAGE), { ignoreVary: true });
  let copy = null;
  const answer = fetch(event.request).then((response) => { if (good(response)) copy = response.clone(); return response; });
  // whichever way this goes, a good answer is kept for next time
  event.waitUntil(answer.then(() => (copy ? cache.put(keyOf(PAGE), copy) : null)).catch(() => {}));
  if (!kept) return answer;
  let timer = 0;
  const late = new Promise((resolve) => { timer = setTimeout(() => resolve(null), WAIT); });
  try {
    const first = await Promise.race([answer, late]);
    // a redirect (to sign in, say) is the browser's to follow
    if (first && (first.ok || first.type === 'opaqueredirect')) return first;
    if (first) drop(first); else answer.then(drop, () => {});
    return kept;
  } catch (error) {
    return kept;
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(FIRST.map(async (path) => {
      if (path !== PAGE && await cache.match(keyOf(path), { ignoreVary: true })) return;
      const response = await fresh(path);
      if (!good(response)) throw new Error(`${path || 'the page'}: ${response.status}`);
      await cache.put(keyOf(path), response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // whatever an earlier version kept that this one has no use for
    for (const name of await caches.keys()) if (name.startsWith('pcw-') && name !== CACHE) await caches.delete(name);
    const wanted = new Set(Object.keys(FILES).concat(PAGE).map(keyOf));
    const cache = await caches.open(CACHE);
    for (const request of await cache.keys()) if (!wanted.has(request.url)) await cache.delete(request);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const path = pathOf(event.request.url);
  if (path === null) return;
  event.respondWith(path === PAGE ? page(event) : file(path, event));
});

// The page says which large files it has used ('keep'), and asks what is here ('kept').
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'keep') {
    const paths = (Array.isArray(data.paths) ? data.paths : []).filter((path) => path !== PAGE && Object.prototype.hasOwnProperty.call(FILES, path));
    event.waitUntil(Promise.all(paths.map((path) => file(path, event, true).then(drop))).catch(() => {}));
  }
  if (data.type === 'kept') {
    const reply = (event.ports && event.ports[0]) || event.source;
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE);
      const have = [];
      for (const path of Object.keys(FILES).concat(PAGE)) if (await cache.match(keyOf(path), { ignoreVary: true })) have.push(path);
      if (reply) reply.postMessage({ type: 'kept', paths: have });
    })().catch(() => {}));
  }
});
