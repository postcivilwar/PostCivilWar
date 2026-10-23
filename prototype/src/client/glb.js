// Reads a supplied GLB file as it is: its mesh, its texture, its skeleton and every one of its animations.
//
// Written here rather than taken from a library: the page loads nothing but its own script, and the files
// this game is given (Tripo exports) use a small part of glTF: one skinned mesh, one textured material,
// nodes with translation, rotation and scale, and animations sampled LINEAR or STEP. Anything outside that
// is refused by name rather than drawn wrong.
//
// Nothing read is changed. A model's instances share its geometry and texture; each has its own bones.
//
// The website sends a figure as its light copy (tools/characters/light.py): the same figure, its numbers stored in
// fewer bits and its pictures as files of their own, read and decoded on the figures' worker (figure-worker.js) and
// handed over here (`parsedParts`, `pictures`).

import { readGLB, readAccessor, readAnimations, textureSource } from './glb-read.js';

// A file beside the page (a model, its pictures). With a connection: fetched as any file is (the web app's service
// worker hands over its kept copy if it has one). With none (navigator.onLine false): the copy the web app kept, if
// it kept one, and otherwise the network is not asked at all, since the request could only fail; the error says so
// (`offline`), and whoever asked tries again later.
export async function fetchKept(url, init = undefined) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    let kept = null;
    try { kept = typeof caches !== 'undefined' ? await caches.match(new URL(url, location.href).href, { ignoreSearch: true, ignoreVary: true }) : null; } catch (error) { kept = null; }
    if (kept) return kept;
    const error = new Error(`${url}: there is no connection, and no copy kept`);
    error.offline = true;
    throw error;
  }
  return init ? fetch(url, init) : fetch(url);
}

// A picture read for the graphics card (an ImageBitmap) is held twice: by the page and by the card. Once the card has
// it, the page's copy is let go (a 4096-pixel picture is 64 MB, and a building has up to three). Only for a model
// drawn by the town's own renderer alone. A picture drawn on a canvas (a name painted over) is kept: the tests look at it.
// `restore`, where given, makes the picture again (from its file, which the browser has kept): the graphics card's
// copy goes with the drawing surface if the browser ever takes that away, and `restorePictures` then makes again
// every picture that was let go and is still in use (20 October 2026: the game carries on where it was instead of
// asking to be reloaded).
const restorable = new Map();         // texture -> how to make its picture again: restore(size), size 0 for as large as it is
export function letGoOnceDrawn(texture, restore = null) {
  texture.onUpdate = () => {
    texture.onUpdate = null;
    const image = texture.image;
    // (its size on the graphics card, kept as the page's copy is let go: the graphics level's largest picture is
    // compared with it, setPictureMost)
    if (image && image.width) texture.userData.drawn = Math.max(image.width, image.height);
    if (image && typeof image.close === 'function') image.close();
    // (one that came larger than the level's largest is made smaller in its turn)
    if (most && texture.userData.drawn > most && restorable.has(texture) && !waiting.includes(texture)) waiting.push(texture);
  };
  if (restore && !restorable.has(texture)) {
    restorable.set(texture, restore);
    texture.addEventListener('dispose', () => { if (!remaking.has(texture)) restorable.delete(texture); });
  }
  return texture;
}

// The graphics level's largest picture (graphics.js, `pictureMost`; 23 October 2026): every picture that can be made
// again from its file is made again no larger than `size` pixels across (0: as large as its maker makes it, the device's
// own copy), one at a time (stepPictures, each frame), so that lowering the level frees the graphics card's memory and
// raising it gives the pictures back. A picture made under a cap remembers it (`userData.cap`), and is made again when
// the cap is raised.
let most = 0;
const waiting = [];
const remaking = new Set();
export const pictureMost = () => most;
export function setPictureMost(size) {
  most = Math.max(0, size || 0);
  waiting.length = 0;
  for (const texture of restorable.keys()) {
    const drawn = texture.userData.drawn || 0, cap = texture.userData.cap || 0;
    if (!drawn) continue;                                   // (not drawn yet: made at the cap it was asked for, below)
    if (most && drawn > most) waiting.push(texture);        // smaller
    else if (cap && drawn >= cap && (!most || most > cap)) waiting.push(texture);   // larger again
  }
  return waiting.length;
}
// Each frame: the next picture waiting made again, one at a time. Gives how many are still waiting.
export function stepPictures() {
  if (remaking.size || !waiting.length) return waiting.length;
  const texture = waiting.shift();
  const restore = restorable.get(texture);
  if (!restore) return waiting.length;
  const size = most;
  remaking.add(texture);
  Promise.resolve().then(() => restore(size)).then((image) => {
    if (!image || !restorable.has(texture)) { if (image && typeof image.close === 'function') image.close(); return; }
    // (the card's copy let go: r186 gives a picture its room on the card once, so another size needs new room)
    texture.dispose();
    texture.image = image; texture.needsUpdate = true;
    texture.userData.cap = size; texture.userData.drawn = 0;
    letGoOnceDrawn(texture);
  }).catch(() => { /* kept as it is */ }).finally(() => { remaking.delete(texture); });
  return waiting.length;
}
export const picturesWaiting = () => waiting.length + remaking.size;
// A picture decoded from its file (a Blob) no larger than `size` pixels across (0: as it is), keeping its shape.
export async function decodeAtMost(blob, size = 0, options = undefined) {
  const full = await (options ? createImageBitmap(blob, options) : createImageBitmap(blob));
  if (!size || Math.max(full.width, full.height) <= size) return full;
  const k = size / Math.max(full.width, full.height);
  const small = await createImageBitmap(full, { ...(options || {}), resizeWidth: Math.max(1, Math.round(full.width * k)), resizeHeight: Math.max(1, Math.round(full.height * k)), resizeQuality: 'high' });
  full.close();
  return small;
}
// (a picture let go: an ImageBitmap closed, which leaves it 0 by 0)
const gone = (image) => !image || (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap && (image.width === 0 || image.height === 0));
// Every picture that was let go and is still in use, made again and handed to the graphics card afresh (and let go
// again once it has it). Gives how many there were, and how many could not be made.
export async function restorePictures() {
  let made = 0, failed = 0;
  await Promise.all([...restorable].map(async ([texture, restore]) => {
    if (!gone(texture.image)) { texture.needsUpdate = true; return; }
    try {
      const image = await restore(most);
      if (!image) { failed += 1; return; }
      texture.image = image; texture.needsUpdate = true;
      texture.userData.cap = most;
      letGoOnceDrawn(texture);
      made += 1;
    } catch (error) { failed += 1; }
  }));
  return { made, failed, held: restorable.size };
}
export const picturesHeld = () => restorable.size;
// A picture inside a GLB file beside the page, made again: the file fetched (from the device's or the browser's kept
// copy), read, and that one picture decoded, made no larger than `size` across if given. For restoring a picture that
// was let go (letGoOnceDrawn): a file asked for by several pictures at once is fetched and read once.
const reread = new Map();            // file -> promise of it read (kept for a few seconds)
export function rereadFile(file) {
  if (!reread.has(file)) {
    const job = fetchKept(file).then((r) => { if (!r.ok) throw new Error(`${file}: ${r.status}`); return r.arrayBuffer(); }).then((b) => parseGLB(b));
    job.catch(() => reread.delete(file));
    reread.set(file, job);
    setTimeout(() => { if (reread.get(file) === job) reread.delete(file); }, 15000);
  }
  return reread.get(file);
}
export function pictureFromFile(file, image, size = 0) {
  return rereadFile(file).then((parsed) => {
    const img = parsed.json.images[image];
    const blob = new Blob([parsed.bytes(img.bufferView)], { type: img.mimeType || 'image/jpeg' });
    return size ? createImageBitmap(blob, { resizeWidth: size, resizeHeight: size, resizeQuality: 'high' }) : createImageBitmap(blob);
  });
}

// The file's two parts: its description and its binary data, and a reader for each accessor. Pure: runs without a
// page. (glb-read.js reads them; the figures' worker reads a file the same way.)
export function parseGLB(buffer) {
  const { json, bin } = readGLB(buffer);
  const accessor = (i, float = false) => readAccessor(json, bin, i, float);
  const bytes = (bufferView) => { const bv = json.bufferViews[bufferView]; return bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength); };
  // the animations, as plain data: a name, a length, and per node the keyed values
  const animations = readAnimations(json, accessor);
  return { json, accessor, bytes, animations };
}

// A file the figures' worker has already read (figure-worker.js: `splitGLB`): the same handles as parseGLB, over the
// arrays it handed over. Its pictures are files of their own, decoded there too (`pictures`, by image).
export function parsedParts({ json, arrays }) {
  const accessor = (i, float = false) => {
    const a = json.accessors[i];
    const array = arrays[i];
    if (!array) throw new Error(`accessor ${i} was not handed over`);
    const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type];
    // (the worker made every animation's numbers floats already)
    return { array, width, count: a.count, normalized: !float && !!a.normalized && !(array instanceof Float32Array) };
  };
  const bytes = () => { throw new Error('a file read by the worker keeps no bytes of its own'); };
  return { json, accessor, bytes, animations: readAnimations(json, accessor) };
}

// A node's name as three.js can bind an animation to it: some files name their bones with characters it keeps for
// itself (Mixamo's "mixamorig:Hips"), which are taken out exactly as three.js's own loader takes them out. The
// file is not changed; only the name the figure's bone is known by here.
export const boneName = (raw) => String(raw || '').replace(/\s/g, '_').replace(/[\[\]\.:\/]/g, '');

// The short name a person would give an animation: "walk.001" is walk, "make_a_call_02.001" is call. Two that
// would share a name get the second its own word from ALSO, so that every label is one word and different.
const LABEL = {
  jump: 'Jump', make_a_call_02: 'Call', make_a_call_01: 'Phone', wave_goodbye_02: 'Wave', wave_goodbye_01: 'Bye', turn: 'Turn', lift_heavy: 'Lift',
  walk: 'Walk', 'press-up': 'Pushups', run: 'Run', greet_03: 'Greet', greet_01: 'Hello', football_save: 'Save', shoot: 'Shoot', scared_02: 'Scared',
  afraid: 'Afraid', surf: 'Surf', front_kick_02: 'Kick', front_kick_01: 'Stomp', agree: 'Agree', scratch: 'Scratch', hug: 'Hug', swim: 'Swim', hit_to_head: 'Hurt',
  // the woman's (where she shares one with the man, the same word)
  sit: 'Sit', sing_04: 'Sing', box_03: 'Box', box_02: 'Jab', box_01: 'Punch', dance_06: 'Dance', dance_03: 'Groove', dance_05: 'Bounce', dance_02: 'Sway',
  dance_04: 'Shimmy', dance_01: 'Boogie', clap: 'Clap', run_upstairs: 'Climb', defeat_03: 'Defeat', defeat_02: 'Slump', dive: 'Dive', fall: 'Fall',
  flee_01: 'Flee', flee_02: 'Escape', jump_down: 'Leap', depressed: 'Sad', bow: 'Bow', cry: 'Cry', laugh_02: 'Laugh', laugh_01: 'Giggle',
  heart_pose: 'Heart', cheer: 'Cheer',
  // the athlete's, the officer's, the priest's and the warrior's (12 October 2026)
  football_catch: 'Catch', dribble: 'Dribble', basketball_shot: 'Basket', volleyball: 'Volley', pitch_baseball: 'Pitch', football_pass: 'Pass',
  jump_rope_01: 'Skip', flip: 'Flip', slash: 'Slash', complain_01: 'Complain', complain_02: 'Grumble', frustrated_01: 'Frustrated', warm_up: 'Warmup',
  fold_arms: 'Arms', idle: 'Idle', climb: 'Climb', angry_01: 'Angry', angry_02: 'Fume', angry_03: 'Rage', look_around: 'Look',
  'knell down to pray': 'Pray', 'rev father blessing someone': 'Bless', sing_01: 'Hymn',
  'punching and kicking, dodging and melee attacks': 'Spar', frightened: 'Fright', cast_a_spell: 'Spell',
  // the eighteen figures of 16 October 2026
  hit_to_stomach: 'Winded', hit_to_body_01: 'Struck', 'blow kiss': 'Kiss', 'Dead zombie walk': 'Shamble', zombie: 'Zombie', magic: 'Magic',
  chop: 'Chop', swagger: 'Swagger', freaky: 'Freaky', sing_02: 'Croon', sing_03: 'Chant', frustrated_02: 'Exasperated', summersault: 'Somersault',
  wait: 'Wait', fire: 'Fire',
  // the six of 17 October 2026
  'female twerking': 'Twerk', 'female cat walk': 'Catwalk', crossover_dribble: 'Crossover',
};
// The second of two animations in one file that would be called the same: its own word instead.
const ALSO = { box_01: 'Strike', magic: 'Sorcery', run_upstairs: 'Stairs', climb: 'Scale', sing_04: 'Serenade', dance_05: 'Hop', walk: 'Stroll', run: 'Sprint' };
export function animationLabel(name) {
  const base = String(name).replace(/\.\d+$/, '');
  if (LABEL[base]) return LABEL[base];
  const word = base.replace(/_\d+$/, '').split(/[_\s-]+/).pop() || base;
  return word.charAt(0).toUpperCase() + word.slice(1);
}
// Every animation of one figure, each with its own one-word name: where two would share a name, the later one
// takes its other word (ALSO). The figures supplied before 16 October have no two alike, so theirs are unchanged.
export function figureLabels(names) {
  const taken = new Set();
  return names.map((name) => {
    let label = animationLabel(name);
    if (taken.has(label)) {
      const base = String(name).replace(/\.\d+$/, '');
      const other = ALSO[base] || ALSO[base.replace(/_\d+$/, '')];
      label = other && !taken.has(other) ? other : `${label}${'abcdefghijklmnopqrstuvwxyz'[taken.size % 26]}`;
    }
    taken.add(label);
    return label;
  });
}

// ---------------------------------------------------------------------------------------- drawing --

// The three.js side: one model, from which any number of figures are made. `surface` makes the material,
// so that a phone draws it the lighter way like everything else.
// `pictures`, for a file whose pictures are files of their own (a light copy): by image, what the worker made of each,
// { bitmap, blob } (a browser whose worker cannot decode pictures sends the blob alone, decoded here). Each picture's
// own copy is let go once the graphics card has it, and made again from its blob should the card's copy be lost.
export function modelFromGLB(parsed, { surface, maxTexture = 0, pictures = null }) {
  const { json, accessor, bytes } = parsed;
  if ((json.meshes || []).length !== 1 || json.meshes[0].primitives.length !== 1) throw new Error('one mesh with one part is read here');
  const prim = json.meshes[0].primitives[0];
  const at = prim.attributes;
  const geometry = new THREE.BufferGeometry();
  const put = (name, key) => { if (at[key] === undefined) return; const a = accessor(at[key]); geometry.setAttribute(name, new THREE.BufferAttribute(a.array, a.width, a.normalized)); };
  put('position', 'POSITION'); put('normal', 'NORMAL'); put('uv', 'TEXCOORD_0'); put('skinIndex', 'JOINTS_0'); put('skinWeight', 'WEIGHTS_0');
  geometry.setIndex(new THREE.BufferAttribute(accessor(prim.indices).array, 1));
  if (!at.NORMAL) geometry.computeVertexNormals();
  // A light copy's positions are 16-bit numbers that its skin turns back into the file's units (light.py): their
  // box is the one the copy records from the file (three.js would measure the 16-bit numbers themselves).
  const box = json.meshes[0].extras && json.meshes[0].extras.box;
  if (geometry.attributes.position.normalized && Array.isArray(box) && box.length === 6) {
    geometry.boundingBox = new THREE.Box3(new THREE.Vector3(box[0], box[1], box[2]), new THREE.Vector3(box[3], box[4], box[5]));
    geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
  } else if (geometry.attributes.position.normalized) throw new Error('a light copy without the box of its figure');
  else { geometry.computeBoundingBox(); geometry.computeBoundingSphere(); }

  // the material: its textures as they were packed, the way glTF lays textures (no flip). A file may carry, beside
  // its colour picture, a picture of how the surface is bent (normal) and one of how rough and how metal each part
  // of it is; each is read as it is when there.
  const mat = json.materials ? json.materials[prim.material || 0] : {};
  const pbr = mat.pbrMetallicRoughness || {};
  const ready = [];
  // On a phone a 4096-pixel texture is about 85 MB of the graphics memory once mipmapped, for a figure that is
  // a few hundred pixels tall on the screen: there it is drawn from a copy at `maxTexture` pixels. The file and
  // its picture are unchanged; only what is handed to the graphics card is smaller.
  const fit = (picture) => {
    if (!maxTexture || picture.width <= maxTexture) return picture;
    const c = document.createElement('canvas'); c.width = maxTexture; c.height = Math.round(picture.height * (maxTexture / picture.width));
    c.getContext('2d').drawImage(picture, 0, 0, c.width, c.height);
    return c;
  };
  const decode = (blob) => (typeof createImageBitmap === 'function' ? createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }) : Promise.reject(new Error('no createImageBitmap')));
  function textureOf(ref, colour) {
    if (!ref) return null;
    const index = textureSource(json, ref.index);
    const image = json.images[index];
    const map = new THREE.Texture();
    map.flipY = false; map.anisotropy = 4;
    if (colour) map.colorSpace = THREE.SRGBColorSpace;
    if (image.uri !== undefined) {
      // a picture of its own beside the model (a light copy), already fetched and decoded by the worker
      const got = pictures && pictures[index];
      if (!got) throw new Error(`the picture ${image.uri} was not handed over`);
      const viaImage = () => new Promise((resolve) => { const img = new Image(); img.onload = () => { map.image = img; map.needsUpdate = true; resolve(); }; img.onerror = () => resolve(); img.src = URL.createObjectURL(got.blob); });
      const given = got.bitmap ? Promise.resolve(got.bitmap) : decode(got.blob);
      ready.push(given.then((bmp) => { map.image = bmp; map.needsUpdate = true; }).catch(viaImage));
      // (drawn by the one renderer there is: the page's copy is let go once the card has it, and made again from the
      // picture's file should the card's copy be lost)
      if (got.blob) letGoOnceDrawn(map, (size) => decodeAtMost(got.blob, size, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }));
      return map;
    }
    const blob = new Blob([bytes(image.bufferView)], { type: image.mimeType || 'image/jpeg' });
    const img = new Image();
    // decoded (and made smaller, on a phone) away from the page's own thread where the browser can; the
    // picture is the file's, unchanged
    const viaImage = () => new Promise((resolve) => { img.onload = () => { map.image = fit(img); map.needsUpdate = true; resolve(); }; img.onerror = () => resolve(); img.src = URL.createObjectURL(blob); });
    const bitmap = typeof createImageBitmap === 'function'
      ? (maxTexture ? createImageBitmap(blob, { resizeWidth: maxTexture, resizeHeight: maxTexture, resizeQuality: 'high' }) : createImageBitmap(blob))
      : Promise.reject(new Error('no createImageBitmap'));
    ready.push(bitmap.then((bmp) => { map.image = bmp; map.needsUpdate = true; }).catch(viaImage));
    return map;
  }
  const map = textureOf(pbr.baseColorTexture, true);
  const normalMap = textureOf(mat.normalTexture, false);
  // glTF keeps roughness in the green of this picture and metalness in its blue, which is how three.js reads both
  const rough = textureOf(pbr.metallicRoughnessTexture, false);
  const colour = pbr.baseColorFactor ? new THREE.Color(...pbr.baseColorFactor.slice(0, 3)) : new THREE.Color(1, 1, 1);
  const options = { map, color: colour, roughness: pbr.roughnessFactor ?? 1, metalness: pbr.metallicFactor ?? 1, side: mat.doubleSided ? THREE.DoubleSide : THREE.FrontSide };
  if (normalMap) { options.normalMap = normalMap; if (mat.normalTexture.scale !== undefined) options.normalScale = new THREE.Vector2(mat.normalTexture.scale, mat.normalTexture.scale); }
  if (rough) { options.roughnessMap = rough; options.metalnessMap = rough; }
  const material = surface(options);

  // the node tree, read once; each figure builds its own copy of it
  const skin = json.skins[0];
  const inverse = accessor(skin.inverseBindMatrices).array;
  const meshNode = json.nodes.findIndex((n) => n.mesh === 0);
  const sceneRoots = json.scenes[json.scene || 0].nodes;

  const clips = parsed.animations.map((a) => new THREE.AnimationClip(a.name, a.length, a.tracks.map((t) => {
    const name = `${boneName(t.node)}.${t.path === 'translation' ? 'position' : t.path === 'rotation' ? 'quaternion' : 'scale'}`;
    const T = t.path === 'rotation' ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
    return new T(name, t.times, t.values, t.step ? THREE.InterpolateDiscrete : undefined);
  })));

  function figure() {
    const objects = json.nodes.map((n, i) => {
      const isBone = skin.joints.includes(i);
      const o = isBone ? new THREE.Bone() : new THREE.Group();
      o.name = boneName(n.name || `node${i}`);
      if (n.matrix) new THREE.Matrix4().fromArray(n.matrix).decompose(o.position, o.quaternion, o.scale);
      if (n.translation) o.position.fromArray(n.translation);
      if (n.rotation) o.quaternion.fromArray(n.rotation);
      if (n.scale) o.scale.fromArray(n.scale);
      return o;
    });
    json.nodes.forEach((n, i) => { for (const c of n.children || []) objects[i].add(objects[c]); });
    const bones = skin.joints.map((j) => objects[j]);
    const inverses = skin.joints.map((_, k) => new THREE.Matrix4().fromArray(inverse, k * 16));
    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.name = boneName(json.nodes[meshNode].name);
    mesh.frustumCulled = false;
    // (three.js since r151 gives a skinned mesh a sphere of its own, worked out the first time it is drawn by moving
    // every point of it with its bones, which on a phone is a stutter for each figure: the model's own sphere, as before)
    mesh.boundingBox = geometry.boundingBox.clone(); mesh.boundingSphere = geometry.boundingSphere.clone();
    objects[meshNode].add(mesh);
    const root = new THREE.Group();
    for (const r of sceneRoots) root.add(objects[r]);
    root.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones, inverses), mesh.matrixWorld);
    return { root, mesh, bones };
  }
  const bounds = geometry.boundingBox;
  return { figure, clips, ready: Promise.all(ready), height: bounds.max.y - bounds.min.y, triangles: geometry.index.count / 3, geometry, material };
}
