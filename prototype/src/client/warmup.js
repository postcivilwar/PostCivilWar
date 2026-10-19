// Warming up: doing ahead of time, a little a frame, the things that are slow
// the first time the graphics card meets them and quick ever after.
//
//   Shader programs. Compiling one can stall a phone for a tenth of a second
//   or more. The town needs about thirty, and as many again without shadows.
//   Both sets are compiled while the start screen is up and then held on to,
//   so that neither meeting something new in town nor a change of detail
//   level ever compiles one in the middle of play.
//
//   Meshes and pictures. The first time a mesh is drawn its vertices are sent
//   to the graphics card, and a street corner coming into view used to send
//   dozens at once. Here they are sent a few each frame, out of sight, until
//   the whole town is there.

const BYTES_A_FRAME = 420000;      // of vertex data sent ahead in one frame
const SLOW_MS = 5;                 // a batch that took longer than this halves the next one

export function createWarmUp(renderer, scene) {
  const pinned = new Set();
  // Holds on to every program compiled so far. The renderer throws a program
  // away when the last material using it lets go; one more claim keeps it.
  function pin() {
    let fresh = 0;
    for (const program of renderer.info.programs) if (!pinned.has(program.id)) { pinned.add(program.id); program.usedTimes += 1; fresh += 1; }
    return fresh;
  }

  // Compiles what every material in the scene needs as the lights now stand, shown or hidden.
  function compile(camera) {
    const before = renderer.info.programs.length;
    renderer.compile(scene, camera);
    pin();
    return renderer.info.programs.length - before;
  }

  // The same again as it would be with the sun casting no shadow, which is how the lowest detail level draws.
  function compileWithout(sun, camera) {
    const cast = sun.castShadow;
    sun.castShadow = !cast;
    let made = 0;
    try { made = compile(camera); } finally { sun.castShadow = cast; }
    return made;
  }

  // ----------------------------------------------------- meshes, out of sight --
  const target = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: false });
  const stage = new THREE.Scene();
  const plain = new THREE.MeshBasicMaterial();
  stage.overrideMaterial = plain;
  const eye = new THREE.Camera();
  const sent = new WeakSet();
  let queue = null;
  let allowance = BYTES_A_FRAME;
  const stats = { meshes: 0, bytes: 0, textures: 0, left: 0, slowestMs: 0 };

  const sizeOf = (geometry) => { let b = geometry.index ? geometry.index.array.byteLength : 0; for (const a of Object.values(geometry.attributes)) if (a.array) b += a.array.byteLength; return b; };
  function collect() {
    queue = [];
    scene.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.geometry || sent.has(o.geometry) || !o.geometry.attributes.position) return;
      sent.add(o.geometry);
      queue.push(o);
    });
    stats.left = queue.length;
  }

  // A geometry that is not in the scene yet (a level of detail no vehicle is showing, say).
  function add(geometry) { if (!queue) collect(); if (geometry && !sent.has(geometry)) { sent.add(geometry); queue.push({ geometry, material: null }); stats.left = queue.length; } }

  // Sends a few more. Returns false once there is nothing left to send.
  function step() {
    if (!queue) collect();
    if (!queue.length) return false;
    const t = performance.now();
    const twins = [];
    let bytes = 0;
    while (queue.length && (twins.length === 0 || bytes < allowance)) {
      const o = queue.pop();
      const size = sizeOf(o.geometry);
      if (size === 0) continue;                    // already there: its numbers were let go after an earlier draw
      const twin = new THREE.Mesh(o.geometry, plain);
      twin.frustumCulled = false;
      twins.push(twin);
      bytes += size;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m && m.map && m.map.image && !sent.has(m.map)) { sent.add(m.map); renderer.initTexture(m.map); stats.textures += 1; }
    }
    if (twins.length) {
      for (const twin of twins) stage.add(twin);
      const before = renderer.getRenderTarget();
      // (put back whatever happens: left on the small picture, every frame of the town after it would be drawn there
      // and the screen left black, the game played on behind it; 19 October 2026)
      renderer.setRenderTarget(target);
      try { renderer.render(stage, eye); } finally {
        renderer.setRenderTarget(before);
        for (const twin of twins) stage.remove(twin);
      }
    }
    const took = performance.now() - t;
    if (took > stats.slowestMs) stats.slowestMs = took;
    allowance = took > SLOW_MS ? Math.max(60000, allowance / 2) : Math.min(BYTES_A_FRAME, allowance * 1.25);
    stats.meshes += twins.length; stats.bytes += bytes; stats.left = queue.length;
    return queue.length > 0;
  }

  return { pin, compile, compileWithout, step, add, stats, get programs() { return pinned.size; }, restart() { queue = null; } };
}
