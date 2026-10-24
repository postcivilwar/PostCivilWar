// The River Niger's water at High and Ultra (the owner's brief of 23 October, its third stage: "Better water with
// reflections, waves and foam (HIGH+)"):
//   - waves: a second set of ripples running across the first, and the river's swell, broad low waves going downstream,
//     moving the sky's light on it;
//   - foam: a broken white line where the river laps at the town's bank, coming and going;
//   - at Ultra, the town given back by the river: what stands on the bank, the boats at the jetty, the far shore, drawn
//     upside down as the water sees them (a second drawing of what is near, at half the screen's size, before the
//     picture itself), broken by the ripples; elsewhere, and at High, the sky it gives back as before.
// Each is a few lines added to the river's own surface (render-world.js), its strength a number set by the level (0: as
// it was drawn before).
//
//   riverShader(shader)                              from the river material's onBeforeCompile
//   setRiver({ waves, foam, t })                     the level's, and the clock, each frame
//   const mirror = createRiverMirror(renderer, scene, camera, water)
//   mirror.render(amount)                            before the picture is drawn (Ultra): 0 none
//   mirror.dispose()

import { worldShadingInstalled } from './world-shading.js';

const uniforms = {
  pcwRiverTime: { value: 0 },
  pcwRiverWaves: { value: 0 },
  pcwRiverFoam: { value: 0 },
  pcwMirror: { value: null },
  pcwMirrorOn: { value: 0 },
  pcwMirrorMatrix: { value: new THREE.Matrix4() },
};

export function setRiver({ waves = 0, foam = 0, t = 0 } = {}) {
  uniforms.pcwRiverWaves.value = waves;
  uniforms.pcwRiverFoam.value = foam;
  uniforms.pcwRiverTime.value = t % 100000;
}
export const riverState = () => ({ waves: uniforms.pcwRiverWaves.value, foam: uniforms.pcwRiverFoam.value, mirror: uniforms.pcwMirrorOn.value });

// `edge`: the grid x past which the river runs through the habitation (its banks are the habitation's own there)
export function riverShader(shader, { edge = 1e9 } = {}) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nuniform mat4 pcwMirrorMatrix;\nvarying vec4 vPcwMirrorUv;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPcwMirrorUv = pcwMirrorMatrix * vec4( position, 1.0 );');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float pcwRiverTime;\nuniform float pcwRiverWaves;\nuniform float pcwRiverFoam;\nuniform sampler2D pcwMirror;\nuniform float pcwMirrorOn;\nvarying vec4 vPcwMirrorUv;')
    // foam where the river laps at the town's bank (the bank's line as atani.js has it, zoneShoreZ; its broken edge from
    // the noise world-shading.js gives every lit surface)
    .replace('#include <alphamap_fragment>', !worldShadingInstalled ? '#include <alphamap_fragment>' : `#include <alphamap_fragment>
      if ( pcwRiverFoam > 0.0 && vRiverAt.x < ${edge.toFixed(1)} ) {
        float pcwShore = 150.0 + 5.0 * sin( vRiverAt.x / 37.0 ) + 3.0 * sin( vRiverAt.x / 11.0 + 1.0 );
        float pcwOff = vRiverAt.z - pcwShore;
        float pcwLap = 0.5 + 0.5 * sin( pcwRiverTime * 0.9 + vRiverAt.x * 0.21 );
        float pcwBand = smoothstep( - 0.3, 0.2, pcwOff ) * ( 1.0 - smoothstep( 0.5 + 0.7 * pcwLap, 2.4, pcwOff ) );
        float pcwN = pcwNoise( vRiverAt.xz * 1.3 + vec2( pcwRiverTime * 0.15, 0.0 ) ) * pcwNoise( vRiverAt.xz * 3.7 - vec2( 0.0, pcwRiverTime * 0.2 ) );
        float pcwFoam = pcwBand * smoothstep( 0.16, 0.42, pcwN ) * pcwRiverFoam;
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.9, 0.92, 0.9 ), pcwFoam * 0.85 );
        diffuseColor.a = max( diffuseColor.a, pcwFoam * 0.95 );
      }`)
    // waves: a second set of ripples across the first, and the swell
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      if ( pcwRiverWaves > 0.0 ) {
        vec2 pcwAt = vRiverAt.xz;
        #ifdef USE_NORMALMAP
          vec3 pcwN2 = texture2D( normalMap, pcwAt / 5.3 + vec2( pcwRiverTime * 0.021, - pcwRiverTime * 0.013 ) ).xyz * 2.0 - 1.0;
        #else
          vec3 pcwN2 = vec3( 0.0 );
        #endif
        float pcwS1 = cos( pcwAt.x * 0.44 + pcwAt.y * 0.33 - pcwRiverTime * 1.1 );
        float pcwS2 = cos( pcwAt.x * 0.27 - pcwAt.y * 0.85 - pcwRiverTime * 1.6 );
        vec2 pcwSlope = ( vec2( 0.8, 0.6 ) * pcwS1 * 0.05 + vec2( 0.3, - 0.95 ) * pcwS2 * 0.032 + pcwN2.xy * 0.09 ) * pcwRiverWaves;
        normal = normalize( normal + ( viewMatrix * vec4( - pcwSlope.x, 0.0, - pcwSlope.y, 0.0 ) ).xyz );
      }`)
    // at Ultra the town it gives back, in place of the sky alone
    .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
      #if defined( RE_IndirectSpecular )
      if ( pcwMirrorOn > 0.0 ) {
        vec2 pcwUv = vPcwMirrorUv.xy / vPcwMirrorUv.w + normal.xy * 0.035;
        radiance = mix( radiance, texture2D( pcwMirror, pcwUv ).rgb * 0.62, pcwMirrorOn );
      }
      #endif`);
}

// ---- the town as the river gives it back (Ultra) ----
export function createRiverMirror(renderer, scene, camera, water) {
  const eye = new THREE.PerspectiveCamera();
  let target = null, drawn = 0;
  const size = new THREE.Vector2();
  const plane = new THREE.Plane(), clip = new THREE.Vector4(), q = new THREE.Vector4();
  const at = new THREE.Vector3(), eyeAt = new THREE.Vector3(), normal = new THREE.Vector3(), view = new THREE.Vector3(), look = new THREE.Vector3(), aim = new THREE.Vector3();
  const turn = new THREE.Matrix4(), frustum = new THREE.Frustum(), viewProjection = new THREE.Matrix4();
  // (the river is two kilometres long: what is in sight is the stretch of it within reach of the eye)
  const whole = new THREE.Box3(), near = new THREE.Box3();
  let measured = false;
  // (as three.js's Reflector does: the eye mirrored in the water's plane, and its picture cut at the plane)
  // (`scale`: the mirrored picture's size, a share of the screen's width and height)
  function render(amount = 0, scale = 0.5) {
    uniforms.pcwMirrorOn.value = 0;
    if (!(amount > 0) || !water || !water.visible) return false;
    water.updateMatrixWorld();
    at.setFromMatrixPosition(water.matrixWorld);
    eyeAt.setFromMatrixPosition(camera.matrixWorld);
    turn.extractRotation(water.matrixWorld);
    normal.set(0, 0, 1).applyMatrix4(turn);
    view.subVectors(at, eyeAt);
    if (view.dot(normal) > 0) return false;                       // (the eye below the water)
    if (eyeAt.y - at.y > 140) return false;                        // (too high above it to matter)
    if (!measured) { whole.setFromObject(water); measured = true; }
    near.copy(whole);
    near.min.x = Math.max(whole.min.x, eyeAt.x - 450); near.max.x = Math.min(whole.max.x, eyeAt.x + 450);
    near.min.z = Math.max(whole.min.z, eyeAt.z - 450); near.max.z = Math.min(whole.max.z, eyeAt.z + 450);
    near.min.y -= 0.5; near.max.y += 0.5;
    if (near.min.x > near.max.x || near.min.z > near.max.z) return false;      // (far from it)
    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(viewProjection);
    if (!frustum.intersectsBox(near)) return false;                // (not in sight)
    view.reflect(normal).negate().add(at);
    turn.extractRotation(camera.matrixWorld);
    look.set(0, 0, -1).applyMatrix4(turn).add(eyeAt);
    aim.subVectors(at, look).reflect(normal).negate().add(at);
    eye.position.copy(view);
    eye.up.set(0, 1, 0).applyMatrix4(turn).reflect(normal);
    eye.lookAt(aim);
    eye.far = Math.min(camera.far, 600);
    eye.near = camera.near;
    eye.updateMatrixWorld();
    eye.projectionMatrix.copy(camera.projectionMatrix);
    eye.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    // what the water reads: where each of its points is in the mirrored picture
    uniforms.pcwMirrorMatrix.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(eye.projectionMatrix).multiply(eye.matrixWorldInverse).multiply(water.matrixWorld);
    // nothing under the water drawn: the near plane of the mirrored eye laid along the water
    plane.setFromNormalAndCoplanarPoint(normal, at).applyMatrix4(eye.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const p = eye.projectionMatrix.elements;
    q.x = (Math.sign(clip.x) + p[8]) / p[0];
    q.y = (Math.sign(clip.y) + p[9]) / p[5];
    q.z = -1.0;
    q.w = (1.0 + p[10]) / p[14];
    clip.multiplyScalar(2.0 / clip.dot(q));
    p[2] = clip.x; p[6] = clip.y; p[10] = clip.z + 1.0 - 0.003; p[14] = clip.w;
    eye.projectionMatrixInverse.copy(eye.projectionMatrix).invert();
    // its picture: half the screen's size at Ultra, a third at High
    renderer.getDrawingBufferSize(size);
    const share = Math.min(1, Math.max(0.1, scale || 0.5));
    const w = Math.max(64, Math.round(size.x * share)), h = Math.max(64, Math.round(size.y * share));
    if (!target) {
      // (in half floats where the graphics card can draw into them, so that the sun's glints keep their brightness)
      let half = false;
      try { half = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'); } catch (error) { half = false; }
      target = new THREE.WebGLRenderTarget(w, h, { type: half ? THREE.HalfFloatType : THREE.UnsignedByteType, samples: 0 });
      target.texture.name = 'river-mirror';
    }
    else if (target.width !== w || target.height !== h) target.setSize(w, h);
    const before = { target: renderer.getRenderTarget(), shadows: renderer.shadowMap.autoUpdate, reset: renderer.info.autoReset };
    renderer.shadowMap.autoUpdate = false;
    renderer.info.autoReset = false;
    water.visible = false;
    try {
      renderer.setRenderTarget(target);
      renderer.render(scene, eye);
    } finally {
      water.visible = true;
      renderer.setRenderTarget(before.target);
      renderer.shadowMap.autoUpdate = before.shadows;
      renderer.info.autoReset = before.reset;
    }
    uniforms.pcwMirror.value = target.texture;
    uniforms.pcwMirrorOn.value = Math.min(1, amount);
    drawn += 1;
    return true;
  }
  function dispose() { if (target) { target.dispose(); target = null; } uniforms.pcwMirror.value = null; uniforms.pcwMirrorOn.value = 0; }
  return { render, dispose, state: () => ({ drawn, size: target ? [target.width, target.height] : null }) };
}
