// What tools/three/make.mjs changes in three.js r186 as it bundles it, so that the game is drawn as r128 drew it (each
// explained in make.mjs). Each is looked for in three.js's own files and must be found there exactly once: a later
// three.js that no longer has one stops the script (and test/engine.test.mjs says which).

// three lines of the shader chunk lights_physical_pars_fragment (a surface's light given back as r128 gave it); changed
// in THREE.ShaderChunk as the script loads
export const LIGHTS_AS_R128 = [
  ['BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F )', 'BRDF_Lambert( material.diffuseContribution )'],
  ['irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - singleScattering - multiScattering )', 'irradiance * BRDF_Lambert( material.diffuseContribution )'],
  ['irradiance * specularBRDF * material.multiScatteringCompensation', 'irradiance * specularBRDF'],
];

// the renderer's own code in three.module.js; changed in the copy that is bundled
export const RENDERER_AS_R128 = [
  // the order of what is drawn: by where each thing stands, as r128 (and as r186 still orders sprites)
  [/if \( sortObjects \) \{\s*if \( object\.boundingSphere !== undefined \) \{\s*if \( object\.boundingSphere === null \) object\.computeBoundingSphere\(\);\s*_vector4\.copy\( object\.boundingSphere\.center \);\s*\} else \{\s*if \( geometry\.boundingSphere === null \) geometry\.computeBoundingSphere\(\);\s*_vector4\.copy\( geometry\.boundingSphere\.center \);\s*\}\s*_vector4\s*\.applyMatrix4\( object\.matrixWorld \)\s*\.applyMatrix4\( _projScreenMatrix \);\s*\}/g,
    'if ( sortObjects ) { _vector4.setFromMatrixPosition( object.matrixWorld ).applyMatrix4( _projScreenMatrix ); }'],
  // a solid surface's alpha: what its picture has, as r128 (no OPAQUE define)
  [/opaque: material\.transparent === false && material\.blending === NormalBlending && material\.alphaToCoverage === false,/g, 'opaque: false,'],
];

// how many times `was` (a string or a /g pattern) is in `text`
export const timesIn = (text, was) => (typeof was === 'string' ? text.split(was).length - 1 : (text.match(was) || []).length);
