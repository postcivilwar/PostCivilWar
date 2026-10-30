// The town's people drawn as themselves, many at once (30 October 2026, the owner's brief: "the npc are looking so
// cartoonish. They don't even look exactly like the 3D GLb file I imported ... Maybe 1 NPC character should be
// multiplied into 10 places").
//
// Until now only the nearest few townspeople (five on a phone at Low) were drawn from his figures, each as a figure of
// its own; everyone further off was a figure of plain shapes in their clothes' colours. Here each of his figures in use
// near the player is drawn once for everyone who wears it: one draw for all the townspeople drawn from that figure, each
// where they are, turned the way they face, at their own size and at their own moment of their walk or their standing.
//
// What is drawn is the figure's own light copy (its shape and its picture, shared with the full figure of it drawn close
// by: nothing is fetched or handed to the graphics card twice), moved by its own walk and standing: played through once
// as the figure comes (animated.js, bakeFigureMoves) and written down frame by frame as where each of its bones has the
// figure, in a picture of numbers the graphics card reads them from (as three.js does for a single figure). Each person
// is told which frame they are at; the card moves the figure's points by it.
//
// How many of his figures are held at once (`kinds`) and how many people of each are drawn (`each`) are the graphics
// level's, and on a phone fewer: a person whose figure is not held is drawn as before, plainly, until it is.
// THREE is the global from three.min.js.
import { ANIMATED, holdFigure, letGoFigure, bakeFigureMoves } from './animated.js';

const FPS = 24;                 // frames a second of a walk or a standing, as written down
const LINGER = 20;              // seconds a figure nobody near wears is kept before it is let go

export function createCrowdFigures(scene, { kinds = 10, each = 40 } = {}) {
  const held = new Map();       // figure id -> kind
  let clock = 0;
  let most = { kinds, each };
  const stats = { kinds: 0, drawn: 0, loading: 0, failed: 0, refused: 0 };

  // One of his figures, ready to draw many of: an instanced mesh of its shape, its material taught to move each copy by
  // its frame of the figure's moves.
  function build(kind, model) {
    const baked = bakeFigureMoves(kind.id, model, FPS);
    const moves = new THREE.DataTexture(baked.data, baked.width, baked.height, THREE.RGBAFormat, THREE.FloatType);
    moves.magFilter = THREE.NearestFilter; moves.minFilter = THREE.NearestFilter; moves.generateMipmaps = false;
    moves.needsUpdate = true;
    // the figure's own shape, its numbers shared (one copy on the card), and each copy's frame beside it
    const source = model.geometry;
    const geometry = new THREE.BufferGeometry();
    for (const [name, a] of Object.entries(source.attributes)) geometry.setAttribute(name, a);
    geometry.setIndex(source.index);
    geometry.boundingBox = source.boundingBox; geometry.boundingSphere = source.boundingSphere;
    const frame = new THREE.InstancedBufferAttribute(new Float32Array(most.each), 1);
    frame.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('crowdFrame', frame);
    const material = model.material.clone();
    material.onBeforeCompile = (shader) => {
      shader.uniforms.crowdMoves = { value: moves };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
uniform highp sampler2D crowdMoves;
attribute vec4 skinIndex;
attribute vec4 skinWeight;
attribute float crowdFrame;
mat4 crowdBone(int row, float bone) {
  int x = int(bone + 0.5) * 4;
  return mat4(texelFetch(crowdMoves, ivec2(x, row), 0), texelFetch(crowdMoves, ivec2(x + 1, row), 0), texelFetch(crowdMoves, ivec2(x + 2, row), 0), texelFetch(crowdMoves, ivec2(x + 3, row), 0));
}`)
        .replace('#include <skinbase_vertex>', `int crowdRow = int(crowdFrame + 0.5);
mat4 crowdSkin = crowdBone(crowdRow, skinIndex.x) * skinWeight.x + crowdBone(crowdRow, skinIndex.y) * skinWeight.y + crowdBone(crowdRow, skinIndex.z) * skinWeight.z + crowdBone(crowdRow, skinIndex.w) * skinWeight.w;`)
        .replace('#include <skinnormal_vertex>', `objectNormal = (crowdSkin * vec4(objectNormal, 0.0)).xyz;
#ifdef USE_TANGENT
objectTangent = (crowdSkin * vec4(objectTangent, 0.0)).xyz;
#endif`)
        .replace('#include <skinning_vertex>', 'transformed = (crowdSkin * vec4(transformed, 1.0)).xyz;');
    };
    material.customProgramCacheKey = () => 'crowd-figure';
    const mesh = new THREE.InstancedMesh(geometry, material, most.each);
    mesh.name = `crowd:${kind.id}`;
    mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);
    // (drawn as tall as the figure is meant to be, as a full figure of it is: animated.js, makeAnimatedRig)
    Object.assign(kind, { state: 'ready', mesh, frame, moves, material, geometry, baked, scale: model.height > 0 && ANIMATED[kind.id] ? ANIMATED[kind.id].height / model.height : 1, n: 0 });
  }

  function release(kind) {
    held.delete(kind.id);
    if (kind.mesh) {
      scene.remove(kind.mesh);
      kind.material.dispose(); kind.moves.dispose();
      // (only the copies' frames are this kind's own: the shape's numbers are the model's, let go with it. three.js lets
      // go of every number a shape holds when the shape is let go, so the model's are taken out of this one first)
      for (const name of Object.keys(kind.geometry.attributes)) if (name !== 'crowdFrame') kind.geometry.deleteAttribute(name);
      kind.geometry.setIndex(null);
      kind.geometry.dispose();
    }
    if (kind.state !== 'failed') letGoFigure(kind.id);
    kind.state = 'gone';
  }

  // the kind for a figure, ready to draw (or null while it comes, or when no more are held)
  function kindOf(id) {
    let kind = held.get(id);
    if (kind) { kind.wanted = clock; return kind.state === 'ready' ? kind : null; }
    if (held.size >= most.kinds) {
      // the one nobody near has worn longest, if it is long enough ago; otherwise this one waits
      let oldest = null;
      for (const k of held.values()) if (k.state !== 'loading' && clock - k.wanted > 2 && (!oldest || k.wanted < oldest.wanted)) oldest = k;
      if (!oldest) { stats.refused += 1; return null; }
      release(oldest);
    }
    kind = { id, state: 'loading', wanted: clock };
    held.set(id, kind);
    holdFigure(id).then(({ model }) => {
      if (kind.state === 'gone') { letGoFigure(id); return; }
      try { build(kind, model); } catch (error) { kind.state = 'failed'; kind.error = String(error && error.message || error); }
    }, (error) => { kind.state = 'failed'; kind.error = String(error && error.message || error); });
    return null;
  }

  const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  // A frame begins: nobody drawn yet.
  function begin(dt) {
    clock += Math.min(0.25, dt);
    for (const kind of held.values()) kind.n = 0;
  }
  // One person, drawn from figure `id` (`share`: their height as a share of the figure's own), standing at (x, y, z) and facing `h`,
  // walking at `speed` metres a second (0 standing), `dt` seconds since the last frame. `person` keeps where they are in
  // their walk and their standing (`walkAt`, `standAt`, from `seed`). Returns false when that figure cannot be drawn
  // yet: the caller draws them as before.
  function put(id, share, x, y, z, h, speed, person, dt) {
    const kind = kindOf(id);
    if (!kind || kind.n >= most.each) return false;
    const b = kind.baked;
    // the walk at the pace they go (its own pace for the figure's height: as a full figure plays it), standing otherwise
    let row;
    if (speed > 0.25) {
      const pace = speed / Math.max(0.3, b.walkSpeed);
      person.walkAt = ((person.walkAt || person.seed || 0) + (pace * dt) / Math.max(0.2, b.walk[2])) % 1;
      row = b.walk[0] + Math.min(b.walk[1] - 1, Math.floor(person.walkAt * b.walk[1]));
    } else {
      person.standAt = ((person.standAt || person.seed || 0) + dt / Math.max(0.2, b.still[2])) % 1;
      row = b.still[0] + Math.min(b.still[1] - 1, Math.floor(person.standAt * b.still[1]));
    }
    const k = kind.scale * (share > 0.5 && share < 1.5 ? share : 1);
    P.set(x, y, z); Q.setFromAxisAngle(Y, h); S.set(k, k, k);
    M.compose(P, Q, S);
    kind.mesh.setMatrixAt(kind.n, M);
    kind.frame.array[kind.n] = row;
    kind.n += 1;
    return true;
  }
  // The frame's people all put: what is drawn of each figure, and figures nobody near has worn for a while let go.
  function end() {
    let drawn = 0, loading = 0, failed = 0;
    for (const kind of [...held.values()]) {
      if (kind.state === 'loading') { loading += 1; continue; }
      if (kind.state === 'failed') { failed += 1; if (clock - kind.wanted > LINGER) { held.delete(kind.id); } continue; }
      kind.mesh.count = kind.n;
      kind.mesh.visible = kind.n > 0;
      if (kind.n) { kind.mesh.instanceMatrix.needsUpdate = true; kind.frame.needsUpdate = true; kind.mesh.instanceMatrix.clearUpdateRanges(); kind.frame.clearUpdateRanges(); kind.mesh.instanceMatrix.addUpdateRange(0, kind.n * 16); kind.frame.addUpdateRange(0, kind.n); }
      drawn += kind.n;
      if (!kind.n && clock - kind.wanted > LINGER) release(kind);
    }
    stats.kinds = held.size; stats.drawn = drawn; stats.loading = loading; stats.failed = failed;
  }
  // The graphics level's numbers: how many figures held, how many of each drawn. Fewer kinds than are held: the ones
  // nobody near wears go at once.
  function setMost(next) {
    most = { kinds: Math.max(1, next.kinds | 0), each: Math.max(1, next.each | 0) };
    for (const kind of [...held.values()]) if (kind.mesh && kind.mesh.instanceMatrix.count < most.each) release(kind);
    while (held.size > most.kinds) { const oldest = [...held.values()].filter((k) => k.state !== 'loading').sort((a, b) => a.wanted - b.wanted)[0]; if (!oldest) break; release(oldest); }
  }
  function dispose() { for (const kind of [...held.values()]) release(kind); }

  return { begin, put, end, setMost, dispose, stats, held: () => [...held.values()].map((k) => ({ id: k.id, state: k.state, drawn: k.n, error: k.error || null })) };
}
