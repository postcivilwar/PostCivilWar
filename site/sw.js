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

const FILES = {"apple-touch-icon.png":"c151758111b1cb33","assets/bike-black-bobber-impostor.webp":"5b872e72da3c0207","assets/bike-black-bobber-poster.webp":"fee60799084aff6c","assets/bike-black-bobber-turn.webp":"66d1060650d38f0c","assets/bike-black-cruiser-impostor.webp":"432998285e0e4d66","assets/bike-black-cruiser-poster.webp":"8bc8160d0e274253","assets/bike-black-cruiser-turn.webp":"1dc0afc837182117","assets/bike-black-gold-superbike-impostor.webp":"378aa6eec2028f90","assets/bike-black-gold-superbike-poster.webp":"ca11f07f404a6679","assets/bike-black-gold-superbike-turn.webp":"4b7fdcda8512ca32","assets/bike-cafe-racer-impostor.webp":"fd1c7c3c7ae3340f","assets/bike-cafe-racer-poster.webp":"76e9c0824188308f","assets/bike-cafe-racer-turn.webp":"3d7a7be045200041","assets/bike-chopper-impostor.webp":"43584ad19dd84154","assets/bike-chopper-poster.webp":"4547eda583557e72","assets/bike-chopper-turn.webp":"279068fb7b70d5d8","assets/bike-chrome-concept-impostor.webp":"b884700513ad338d","assets/bike-chrome-concept-poster.webp":"1620afd683e22e28","assets/bike-chrome-concept-turn.webp":"3bd403e42cd0249f","assets/bike-civil-war-tourer-impostor.webp":"8e3846c71f3f7fe4","assets/bike-civil-war-tourer-poster.webp":"9c353bd62b07b9b2","assets/bike-civil-war-tourer-turn.webp":"3e5670f246932db0","assets/bike-gold-roadster-impostor.webp":"fb7e78ba97565e6d","assets/bike-gold-roadster-poster.webp":"42b65ddd322148dc","assets/bike-gold-roadster-turn.webp":"4c15809d801d4f92","assets/bike-gold-tourer-impostor.webp":"afabd90ddae20f85","assets/bike-gold-tourer-poster.webp":"f4589ace629000f2","assets/bike-gold-tourer-turn.webp":"1cbf147003f64675","assets/bike-midnight-cruiser-impostor.webp":"47548240de5797e4","assets/bike-midnight-cruiser-poster.webp":"a78071b5299c4270","assets/bike-midnight-cruiser-turn.webp":"25322ae2982a1625","assets/bike-olive-cruiser-impostor.webp":"e66bc5ce652fce9e","assets/bike-olive-cruiser-poster.webp":"96bff9b36dad73c5","assets/bike-olive-cruiser-turn.webp":"a8cabff15b5f0cd8","assets/bike-power-cruiser-impostor.webp":"bc3e463962b33da0","assets/bike-power-cruiser-poster.webp":"ce8235257b5e11dd","assets/bike-power-cruiser-turn.webp":"bae1b0a2d9e48809","assets/bike-purple-sport-impostor.webp":"c150e42453c9879b","assets/bike-purple-sport-poster.webp":"2250d6e535720b72","assets/bike-purple-sport-turn.webp":"7472e48644abc845","assets/bike-red-superbike-impostor.webp":"8d90550996f5557e","assets/bike-red-superbike-poster.webp":"794db59c526c0ece","assets/bike-red-superbike-turn.webp":"0900549e1b369b6c","assets/bike-streetfighter-impostor.webp":"7536db8cb4f3d0c7","assets/bike-streetfighter-poster.webp":"9c23352123e153a7","assets/bike-streetfighter-turn.webp":"23c7032c79f05125","assets/bike-white-sport-impostor.webp":"4844251eb33ee480","assets/bike-white-sport-poster.webp":"98f1bc1c8bddd243","assets/bike-white-sport-turn.webp":"b0d85052751418c4","assets/bike-yellow-adventure-impostor.webp":"8a10976790d827f2","assets/bike-yellow-adventure-poster.webp":"cafecf90efedaacf","assets/bike-yellow-adventure-turn.webp":"58ddf91f10817009","assets/watch-poster.webp":"7aa600977f930dc5","assets/watch-turn.webp":"50b9100b2811b5a5","athlete.b64.txt":"4b801761ed5b936a","athletic_outfit.glb":"a954ec3bb6ad94f7","bikes/black-bobber-color-2k.jpg":"467fd89011c9c8f7","bikes/black-bobber-color-4k.jpg":"a906c06919a60e7b","bikes/black-bobber-normal-2k.webp":"7159a20877266167","bikes/black-bobber-normal-4k.png":"58eaae7056945cac","bikes/black-bobber-rm-2k.webp":"c803a4a5d2255c93","bikes/black-bobber-rm-4k.webp":"7d9d06f0b9e1be5b","bikes/black-bobber.bin":"617dc86c12ee8e47","bikes/black-cruiser-color-2k.jpg":"8641d00c5c219bbf","bikes/black-cruiser-color-4k.jpg":"6d2b23b21a7e774b","bikes/black-cruiser-normal-2k.webp":"b98138f3f2d9a0ec","bikes/black-cruiser-normal-4k.png":"37ede5bd229b8041","bikes/black-cruiser-rm-2k.webp":"006e5c62fb3fba05","bikes/black-cruiser-rm-4k.webp":"a1cf334e14c5839c","bikes/black-cruiser.bin":"06d829b4045a3b77","bikes/black-gold-superbike-color-2k.jpg":"924fc7fa18895c7b","bikes/black-gold-superbike-color-4k.jpg":"227de82b03a9c619","bikes/black-gold-superbike-normal-2k.webp":"9a76b55175586689","bikes/black-gold-superbike-normal-4k.png":"08a723f4aed67627","bikes/black-gold-superbike-rm-2k.webp":"87fde7d333042634","bikes/black-gold-superbike-rm-4k.webp":"482598a51edb5698","bikes/black-gold-superbike.bin":"18c60d52abad405e","bikes/cafe-racer-color-2k.jpg":"4b0245b1403c7b5b","bikes/cafe-racer-color-4k.jpg":"3d4ad4e6a4898996","bikes/cafe-racer-normal-2k.webp":"78f9eda49e493e89","bikes/cafe-racer-normal-4k.png":"f523affa85cc0814","bikes/cafe-racer-rm-2k.webp":"4df1b9487ffa1c59","bikes/cafe-racer-rm-4k.webp":"96a466ff440ec382","bikes/cafe-racer.bin":"bfa79a9540a523a8","bikes/chopper-color-2k.jpg":"018f59d3a4d5889e","bikes/chopper-color-4k.jpg":"1fa3d61d4d541cd0","bikes/chopper-normal-2k.webp":"44b8b2fc6bf9b048","bikes/chopper-normal-4k.png":"07b5e18afa5b185f","bikes/chopper-rm-2k.webp":"42e9d6f88e9606e5","bikes/chopper-rm-4k.webp":"0f1e95aa6b44e7c1","bikes/chopper.bin":"1bd8749712f66490","bikes/chrome-concept-color-2k.jpg":"d1105476b258a5ec","bikes/chrome-concept-color-4k.jpg":"c1c10a9ce4568421","bikes/chrome-concept-normal-2k.webp":"c5e7e8c4c1c764a7","bikes/chrome-concept-normal-4k.png":"de7c0fda422823eb","bikes/chrome-concept-rm-2k.webp":"c6067f04e2a68c5e","bikes/chrome-concept-rm-4k.webp":"08de004651f4b9d0","bikes/chrome-concept.bin":"8ff1ceabe18afc3d","bikes/civil-war-tourer-color-2k.jpg":"53e9d3cdf8e06b1d","bikes/civil-war-tourer-color-4k.jpg":"f12fb58916461407","bikes/civil-war-tourer.bin":"56369202987563f1","bikes/gold-roadster-color-2k.jpg":"c5b0fc1964815a3f","bikes/gold-roadster-color-4k.jpg":"ea2885ba1c09685b","bikes/gold-roadster-normal-2k.webp":"23ef353ac2983fef","bikes/gold-roadster-normal-4k.png":"b791b2d05ff78933","bikes/gold-roadster-rm-2k.webp":"0a7c45eb922f8065","bikes/gold-roadster-rm-4k.webp":"dd87f16fa40a2b20","bikes/gold-roadster.bin":"f84215daa8d46ad2","bikes/gold-tourer-color-2k.jpg":"37321040ab62cbde","bikes/gold-tourer-color-4k.jpg":"dd3588359d7b248f","bikes/gold-tourer-normal-2k.webp":"d022fe6e828f6522","bikes/gold-tourer-normal-4k.png":"a8ef0222d1d3d08d","bikes/gold-tourer-rm-2k.webp":"f6113e96338f0709","bikes/gold-tourer-rm-4k.webp":"3d67b26344ae5567","bikes/gold-tourer.bin":"bc5e5c92ed93aa80","bikes/midnight-cruiser-color-2k.jpg":"467fd89011c9c8f7","bikes/midnight-cruiser-color-4k.jpg":"a906c06919a60e7b","bikes/midnight-cruiser-normal-2k.webp":"7159a20877266167","bikes/midnight-cruiser-normal-4k.png":"58eaae7056945cac","bikes/midnight-cruiser-rm-2k.webp":"e2a5f2f28af3ba46","bikes/midnight-cruiser-rm-4k.webp":"d82e9ab94de58f30","bikes/midnight-cruiser.bin":"26cb140388d67a10","bikes/olive-cruiser-color-2k.jpg":"8cc2255f777627fe","bikes/olive-cruiser-color-4k.jpg":"b56c138abd18386e","bikes/olive-cruiser-normal-2k.webp":"ee37cda49ed022f1","bikes/olive-cruiser-normal-4k.png":"113a1cbf4ce7deeb","bikes/olive-cruiser-rm-2k.webp":"277cc6cfa846027b","bikes/olive-cruiser-rm-4k.webp":"d2f80bd196bb8065","bikes/olive-cruiser.bin":"6fb1799f41c3b462","bikes/power-cruiser-color-2k.jpg":"0b381c33db890aa3","bikes/power-cruiser-color-4k.jpg":"6b8ad2920ecdaccc","bikes/power-cruiser-normal-2k.webp":"e203822d5c535ba4","bikes/power-cruiser-normal-4k.png":"67728556318da804","bikes/power-cruiser-rm-2k.webp":"d74f65bcc48bd09a","bikes/power-cruiser-rm-4k.webp":"59ddcd135e9b56d2","bikes/power-cruiser.bin":"ad0b3fc469502d41","bikes/purple-sport-color-2k.jpg":"17c4ff1674fc8c4e","bikes/purple-sport-color-4k.jpg":"cff91428c3d14e1e","bikes/purple-sport-normal-2k.webp":"f4bb15fe4661b679","bikes/purple-sport-normal-4k.png":"ec14d3302edd5f42","bikes/purple-sport-rm-2k.webp":"01ab2ff4c8cda0a3","bikes/purple-sport-rm-4k.webp":"5252e8a18a1d102b","bikes/purple-sport.bin":"5128c8b14b7f19f6","bikes/red-superbike-color-2k.jpg":"334d027aca631cf5","bikes/red-superbike-color-4k.jpg":"15c70858c22826c8","bikes/red-superbike-normal-2k.webp":"a93a7680ea1760d2","bikes/red-superbike-normal-4k.png":"a0c7e6eaecb47e6f","bikes/red-superbike-rm-2k.webp":"929e06f884455099","bikes/red-superbike-rm-4k.webp":"b9942edade254b93","bikes/red-superbike.bin":"5cb51398dcd50cce","bikes/sound-sport-high.wav":"88e2864e5abac603","bikes/sound-sport-idle.wav":"09619d4cdae022ca","bikes/sound-sport-mid.wav":"7b3d17610219df47","bikes/sound-start.wav":"140c909bf6b403c0","bikes/sound-stop.wav":"2b073e68b7b4b16d","bikes/sound-twin-high.wav":"65b5201257136533","bikes/sound-twin-idle.wav":"5e7abb07650c84d1","bikes/sound-twin-mid.wav":"cbc597d30ac535b5","bikes/streetfighter-color-2k.jpg":"396b9bfe11245153","bikes/streetfighter-color-4k.jpg":"e53127184d300c36","bikes/streetfighter-normal-2k.webp":"8c0ded9a95409a80","bikes/streetfighter-normal-4k.png":"63793332bd6bcb1d","bikes/streetfighter-rm-2k.webp":"5db2085c8ba9d74d","bikes/streetfighter-rm-4k.webp":"3415f6ba3dda460d","bikes/streetfighter.bin":"9908fa3f2afb7c88","bikes/white-sport-color-2k.jpg":"ba81339e038632a0","bikes/white-sport-color-4k.jpg":"e87187d0699ed661","bikes/white-sport-normal-2k.webp":"223deea63ddd1654","bikes/white-sport-normal-4k.png":"0190ccff82c5148f","bikes/white-sport-rm-2k.webp":"62720adad9004f70","bikes/white-sport-rm-4k.webp":"9ab45ca10ef199ca","bikes/white-sport.bin":"7fb4c6f7a456a42b","bikes/yellow-adventure-color-2k.jpg":"9678d3f40cd57a39","bikes/yellow-adventure-color-4k.jpg":"2ea04c2c31e66380","bikes/yellow-adventure-normal-2k.webp":"17f1aefbdc58a39e","bikes/yellow-adventure-normal-4k.png":"78f64e47f29328d6","bikes/yellow-adventure-rm-2k.webp":"a422dcc16515378b","bikes/yellow-adventure-rm-4k.webp":"7e549c5db31b697f","bikes/yellow-adventure.bin":"8035087e166ec4aa","camouflage_bikini.glb":"9a0abfae9ff1f381","fashion_model_1.glb":"8bf1e97ae6a6398f","fashion_model_2.glb":"8551f2ed7d0dd98f","fashion_model_3.glb":"406bf186a27a6daa","fashion_model_5.glb":"1639c6bc80b65694","fashion_model_6.glb":"148557dca062b77e","fashion_model_7.glb":"2dbf6196d6f91971","favicon-48.png":"6cab812182670522","favicon.svg":"d3ea2b16fb56f1b9","female_character_2.glb":"e43b368746c6cfcc","female_figure.glb":"beca72878732195a","hobo_character.glb":"c2997d9acb036754","horror_character.glb":"124172c14f6b3e2c","horror_nurse.glb":"679c6c01db94b9e7","human_character.glb":"5927a178b82a1a53","icon-192.png":"b1d03eb66147d391","icon-512.png":"9498ec46b5ea48a1","icon-maskable-192.png":"7ce6c304a461239e","icon-maskable-512.png":"bfc4a75988ec1d97","kit.b64.txt":"a9a4ed8f93fe4d42","male_figure.glb":"d0cc47fdfa9ffbf9","man.b64.txt":"b0a3002292b4ff8d","manifest.webmanifest":"7aefe0ca14857cb9","moves.b64.txt":"801ef686f6b5777d","nigerian_traditional.glb":"f9a05b6f0167a877","ninja_armor.glb":"e90591f0f1cd1390","ninja_warrior.glb":"1c3d524df85deef4","patchwork_shirt.glb":"6fb0cd8ff7e5a0e6","police.b64.txt":"14daa7eb3a0405f2","powerbike.glb":"f3d0a27112e0c619","priest.b64.txt":"4a160b1596c928eb","swimwear_model.glb":"467f431cfbc99e55","three.min.js":"9274bbcec8d96168","urban_streetwear.glb":"e78e227841005c39","vehicles.b64.txt":"8d1cee47670122c0","warrior.b64.txt":"1414ab38cfb7ec50","woman.b64.txt":"740fbe53ae5855bc","zombie.glb":"cb7d2254e25a23a0","zombie_character.glb":"b09ab132d93117d5","zombie_survivor.glb":"4a8fb6fae8a752e1"};        // path beside the page -> fingerprint of the file's contents
const FIRST = ["","three.min.js","kit.b64.txt","vehicles.b64.txt","moves.b64.txt","manifest.webmanifest","favicon.svg","icon-192.png"];        // kept as soon as this is installed: the page and the small files
const ASKED = new Set(["man.b64.txt","woman.b64.txt","athlete.b64.txt","police.b64.txt","priest.b64.txt","warrior.b64.txt","female_figure.glb","athletic_outfit.glb","fashion_model_3.glb","zombie_survivor.glb","female_character_2.glb","horror_nurse.glb","camouflage_bikini.glb","swimwear_model.glb","fashion_model_2.glb","fashion_model_1.glb","male_figure.glb","zombie.glb","horror_character.glb","hobo_character.glb","zombie_character.glb","human_character.glb","ninja_armor.glb","ninja_warrior.glb","fashion_model_7.glb","fashion_model_5.glb","fashion_model_6.glb","patchwork_shirt.glb","nigerian_traditional.glb","urban_streetwear.glb"]);  // kept only when the page asks: the figures (each 5 to 38 MB), the player's own
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
