// Reads a supplied GLB file as it is: its mesh, its texture, its skeleton and every one of its animations.
//
// Written here rather than taken from a library: the page loads nothing but its own script, and the files
// this game is given (Tripo exports) use a small part of glTF: one skinned mesh, one textured material,
// nodes with translation, rotation and scale, and animations sampled LINEAR or STEP. Anything outside that
// is refused by name rather than drawn wrong.
//
// Nothing read is changed. A model's instances share its geometry and texture; each has its own bones.

const TYPES = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

// The file's two parts: its description and its binary data. Pure: runs without a page.
export function parseGLB(buffer) {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB file');
  if (view.getUint32(4, true) !== 2) throw new Error('not glTF 2.0');
  let at = 12, json = null, bin = null;
  while (at < view.byteLength) {
    const length = view.getUint32(at, true), type = view.getUint32(at + 4, true);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, at + 8, length)));
    else if (type === 0x004e4942) bin = new Uint8Array(buffer, at + 8, length);
    at += 8 + length;
  }
  if (!json || !bin) throw new Error('GLB without its description or its data');
  for (const ext of json.extensionsRequired || []) throw new Error(`the file needs ${ext}, which this reader does not have`);
  const accessor = (i) => {
    const a = json.accessors[i], bv = json.bufferViews[a.bufferView];
    const T = TYPES[a.componentType], n = WIDTH[a.type];
    if (bv.byteStride && bv.byteStride !== T.BYTES_PER_ELEMENT * n) throw new Error('interleaved data is not read here');
    const start = bin.byteOffset + (bv.byteOffset || 0) + (a.byteOffset || 0);
    // copied, so that the arrays do not hold on to the whole file and are aligned however the file was packed
    const out = new T(a.count * n);
    out.set(new T(bin.buffer.slice(start, start + a.count * n * T.BYTES_PER_ELEMENT)));
    return { array: out, width: n, count: a.count, normalized: !!a.normalized };
  };
  const bytes = (bufferView) => { const bv = json.bufferViews[bufferView]; return bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength); };
  // the animations, as plain data: a name, a length, and per node the keyed values
  const animations = (json.animations || []).map((a) => {
    let length = 0;
    const tracks = a.channels.map((c) => {
      const s = a.samplers[c.sampler];
      const times = accessor(s.input).array, values = accessor(s.output).array;
      length = Math.max(length, times[times.length - 1]);
      return { node: json.nodes[c.target.node].name, path: c.target.path, times, values, step: s.interpolation === 'STEP' };
    });
    return { name: a.name, length, tracks };
  });
  return { json, accessor, bytes, animations };
}

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
};
export function animationLabel(name) {
  const base = String(name).replace(/\.\d+$/, '');
  if (LABEL[base]) return LABEL[base];
  const word = base.replace(/_\d+$/, '').split(/[_\s-]+/).pop() || base;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

// ---------------------------------------------------------------------------------------- drawing --

// The three.js side: one model, from which any number of figures are made. `surface` makes the material,
// so that a phone draws it the lighter way like everything else.
export function modelFromGLB(parsed, { surface, maxTexture = 0 }) {
  const { json, accessor, bytes } = parsed;
  if ((json.meshes || []).length !== 1 || json.meshes[0].primitives.length !== 1) throw new Error('one mesh with one part is read here');
  const prim = json.meshes[0].primitives[0];
  const at = prim.attributes;
  const geometry = new THREE.BufferGeometry();
  const put = (name, key) => { if (at[key] === undefined) return; const a = accessor(at[key]); geometry.setAttribute(name, new THREE.BufferAttribute(a.array, a.width, a.normalized)); };
  put('position', 'POSITION'); put('normal', 'NORMAL'); put('uv', 'TEXCOORD_0'); put('skinIndex', 'JOINTS_0'); put('skinWeight', 'WEIGHTS_0');
  geometry.setIndex(new THREE.BufferAttribute(accessor(prim.indices).array, 1));
  if (!at.NORMAL) geometry.computeVertexNormals();
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();

  // the material: its texture as it was packed, the way glTF lays textures (no flip)
  const mat = json.materials ? json.materials[prim.material || 0] : {};
  const pbr = mat.pbrMetallicRoughness || {};
  let map = null;
  const ready = [];
  if (pbr.baseColorTexture) {
    const image = json.images[json.textures[pbr.baseColorTexture.index].source];
    const blob = new Blob([bytes(image.bufferView)], { type: image.mimeType || 'image/jpeg' });
    map = new THREE.Texture();
    map.flipY = false; map.encoding = THREE.sRGBEncoding; map.anisotropy = 4;
    const img = new Image();
    // On a phone a 4096-pixel texture is about 85 MB of the graphics memory once mipmapped, for a figure that is
    // a few hundred pixels tall on the screen: there it is drawn from a copy at `maxTexture` pixels. The file and
    // its picture are unchanged; only what is handed to the graphics card is smaller.
    const fit = (picture) => {
      if (!maxTexture || picture.width <= maxTexture) return picture;
      const c = document.createElement('canvas'); c.width = maxTexture; c.height = Math.round(picture.height * (maxTexture / picture.width));
      c.getContext('2d').drawImage(picture, 0, 0, c.width, c.height);
      return c;
    };
    // decoded (and made smaller, on a phone) away from the page's own thread where the browser can; the
    // picture is the file's, unchanged
    const viaImage = () => new Promise((resolve) => { img.onload = () => { map.image = fit(img); map.needsUpdate = true; resolve(); }; img.onerror = () => resolve(); img.src = URL.createObjectURL(blob); });
    const bitmap = typeof createImageBitmap === 'function'
      ? (maxTexture ? createImageBitmap(blob, { resizeWidth: maxTexture, resizeHeight: maxTexture, resizeQuality: 'high' }) : createImageBitmap(blob))
      : Promise.reject(new Error('no createImageBitmap'));
    ready.push(bitmap.then((bmp) => { map.image = bmp; map.needsUpdate = true; }).catch(viaImage));
  }
  const colour = pbr.baseColorFactor ? new THREE.Color(...pbr.baseColorFactor.slice(0, 3)) : new THREE.Color(1, 1, 1);
  const material = surface({ map, color: colour, skinning: true, roughness: pbr.roughnessFactor ?? 1, metalness: pbr.metallicFactor ?? 1, side: mat.doubleSided ? THREE.DoubleSide : THREE.FrontSide });

  // the node tree, read once; each figure builds its own copy of it
  const skin = json.skins[0];
  const inverse = accessor(skin.inverseBindMatrices).array;
  const meshNode = json.nodes.findIndex((n) => n.mesh === 0);
  const sceneRoots = json.scenes[json.scene || 0].nodes;

  const clips = parsed.animations.map((a) => new THREE.AnimationClip(a.name, a.length, a.tracks.map((t) => {
    const name = `${t.node}.${t.path === 'translation' ? 'position' : t.path === 'rotation' ? 'quaternion' : 'scale'}`;
    const T = t.path === 'rotation' ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
    return new T(name, t.times, t.values, t.step ? THREE.InterpolateDiscrete : undefined);
  })));

  function figure() {
    const objects = json.nodes.map((n, i) => {
      const isBone = skin.joints.includes(i);
      const o = isBone ? new THREE.Bone() : new THREE.Group();
      o.name = n.name || `node${i}`;
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
    mesh.name = json.nodes[meshNode].name;
    mesh.frustumCulled = false;
    objects[meshNode].add(mesh);
    const root = new THREE.Group();
    for (const r of sceneRoots) root.add(objects[r]);
    root.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones, inverses), mesh.matrixWorld);
    return { root, mesh, bones };
  }
  const box = geometry.boundingBox;
  return { figure, clips, ready: Promise.all(ready), height: box.max.y - box.min.y, triangles: geometry.index.count / 3, geometry, material };
}
