// Soft darkening where things meet (the owner's brief of 23 October, its third stage: "Soft darkening where objects meet
// ground and walls (HIGH+)"): in the corners of rooms and doorways, where a wall stands on the ground, under the eaves,
// round a parked car's wheels, between a figure's feet and the road: light from the sky all round reaches those places
// less, and they are a little darker, as they are to the eye.
//
// three.js r186's own GTAOPass (ground-truth ambient occlusion, vendor/three-r186/addons/, unchanged) works it out from a
// picture of how far away and which way facing each point of the scene is, drawn at half the screen's size (a second
// drawing of what is near: the solid surfaces within 120 m; glass, water, leaves and the sky are not in it), and the
// darkening found is laid over the picture. Its script (three-post.min.js) is fetched only when a level that draws it is
// first chosen (High and Ultra), so that a phone at Medium never downloads it.
//
//   const ao = createAmbientOcclusion(renderer, scene, camera)
//   ao.apply(amount, now)   after the town is drawn: amount 0 (none) to 1; now, ms
//   ao.dispose()            its pictures let go (when its level goes)
//   ao.state()              (the tests)

const LAYER = 3;                 // the AO's own: what is drawn into its picture (every solid, opaque surface)
const REACH = 120;               // metres: nothing further than this is darkened (it would not be seen)
let fetching = null;
// The add-ons' script, fetched once (gives false if it could not be)
function fetchAddons() {
  if (THREE.GTAOPass) return Promise.resolve(true);
  if (fetching) return fetching;
  fetching = new Promise((resolve) => {
    if (typeof document === 'undefined') { resolve(false); return; }
    const script = document.createElement('script');
    script.src = (typeof window !== 'undefined' && window.__PCW_FILES && window.__PCW_FILES.post) || 'three-post.min.js';
    script.async = true;
    script.onload = () => resolve(!!THREE.GTAOPass);
    script.onerror = () => { script.remove(); fetching = null; resolve(false); };
    document.head.appendChild(script);
  });
  return fetching;
}

const VERT = 'varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4( position.xy, 0.0, 1.0 ); }';
// (laid over the picture: what is there times the darkening, at `amount` of it)
const LAY = 'uniform sampler2D tAO; uniform float amount; varying vec2 vUv; void main() { float ao = texture2D( tAO, vUv ).r; gl_FragColor = vec4( vec3( mix( 1.0, ao, amount ) ), 1.0 ); }';

export function createAmbientOcclusion(renderer, scene, camera) {
  let gtao = null, failed = false, triedAt = -Infinity, w = 0, h = 0, applied = 0, sortedAt = -Infinity, casters = 0;
  const eye = new THREE.PerspectiveCamera();
  const size = new THREE.Vector2();
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const lay = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: LAY, uniforms: { tAO: { value: null }, amount: { value: 0 } },
    depthTest: false, depthWrite: false, toneMapped: false, fog: false, transparent: true,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor,
    blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
  });
  const quad = new THREE.Mesh(geometry, lay);
  quad.frustumCulled = false;
  const quadScene = new THREE.Scene();
  quadScene.add(quad);

  // every solid, opaque surface given the AO's layer, so that only they are drawn into its picture (looked at again every
  // two seconds: the town fetches and lets go of things as one moves)
  const solid = (m) => m && m.visible !== false && !m.transparent && !(m.alphaTest > 0) && !m.alphaMap && m.depthWrite !== false && m.colorWrite !== false;
  function sort() {
    casters = 0;
    scene.traverse((o) => {
      if (!o.isMesh || o.isSprite) return;
      const ok = Array.isArray(o.material) ? o.material.every(solid) : solid(o.material);
      if (ok) { o.layers.enable(LAYER); casters += 1; } else o.layers.disable(LAYER);
    });
  }
  function make() {
    gtao = new THREE.GTAOPass(scene, eye, 64, 64);
    gtao.output = THREE.GTAOPass.OUTPUT.Off;
    // (it hides points and lines by going through the whole scene each frame; only solid surfaces are on its layer, so
    // there is nothing for it to hide)
    gtao._overrideVisibility = () => {};
    gtao._restoreVisibility = () => {};
    // (a metre round each point: a doorway's, a wall's foot, a car's wheels)
    gtao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.4, thickness: 1.6, scale: 1.15, samples: 12, distanceFallOff: 1 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    w = h = 0;
  }

  // (its pictures are drawn in half floats: a graphics card that cannot draw into them goes without it, rather than
  // being darkened wrongly)
  const halfFloats = () => { try { return renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'); } catch (error) { return false; } };
  function apply(amount = 0, now = 0) {
    if (!(amount > 0) || failed) return false;
    if (!gtao && !halfFloats()) { failed = true; return false; }
    if (!gtao) {
      if (THREE.GTAOPass) make();
      else {
        // (asked for once; if it could not be fetched, again in a minute)
        if (now - triedAt > 60000) { triedAt = now; fetchAddons().then((ok) => { if (!ok && typeof document === 'undefined') failed = true; }); }
        return false;
      }
    }
    renderer.getDrawingBufferSize(size);
    const hw = Math.max(1, Math.ceil(size.x / 2)), hh = Math.max(1, Math.ceil(size.y / 2));
    eye.copy(camera, false);
    eye.far = Math.min(camera.far, REACH);
    eye.layers.set(LAYER);
    eye.updateProjectionMatrix();
    if (hw !== w || hh !== h) { w = hw; h = hh; gtao.setSize(w, h); }
    if (now - sortedAt > 2000) { sortedAt = now; sort(); }
    const before = { shadows: renderer.shadowMap.autoUpdate, target: renderer.getRenderTarget(), reset: renderer.info.autoReset, autoClear: renderer.autoClear };
    // (the sun's shadows are not drawn again for it; and its drawing is counted with the frame's)
    renderer.shadowMap.autoUpdate = false;
    renderer.info.autoReset = false;
    try {
      gtao.render(renderer, null, null);
      renderer.setRenderTarget(null);
      renderer.autoClear = false;
      lay.uniforms.tAO.value = gtao.gtaoMap;
      lay.uniforms.amount.value = Math.min(1, amount);
      renderer.render(quadScene, quadCamera);
      applied += 1;
    } finally {
      renderer.shadowMap.autoUpdate = before.shadows;
      renderer.info.autoReset = before.reset;
      renderer.autoClear = before.autoClear;
      renderer.setRenderTarget(before.target);
    }
    return true;
  }
  function dispose() { if (gtao) { gtao.dispose(); gtao = null; } w = h = 0; }
  return { apply, dispose, state: () => ({ loaded: !!THREE.GTAOPass, made: !!gtao, failed, width: w, height: h, applied, casters }) };
}
