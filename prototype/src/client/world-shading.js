// What the town's surfaces do with the air, the weather and the hour, written once into three.js's own shader pieces as
// the game loads (the owner's brief of 23 October, its third stage, and his extras of 24 October):
//   - shadows of clouds drifting over the land: the sun's light on every lit surface dimmed where a cloud's shadow lies,
//     soft-edged patches tens of metres across, moving with the wind (his extra);
//   - less glitter on far metal and glass: a far surface's gloss spread a little, as the eye sees it at that distance,
//     so that roofs and windows across the town do not sparkle as one moves (his extra);
//   - haze in the distance: the air near the ground thickening with distance from the first tens of metres, so that
//     the far town sits in a low haze (never less than the fog: what is beyond the fog's far edge is not drawn);
//   - on tarmac, a mirage at midday: far along a road, looked along it, the sky's colour wavering on it (heat shimmer);
//   - on tarmac after rain, puddles: patches where the water lies, darker and smooth as a mirror, giving back the sky
//     (his extra; at the levels whose wet roads give back the sky).
// Each is a few lines of the shader, its strength a number set each frame (`setWorldShading`): none of them is drawn
// where its number is 0, which is how the levels turn them on and off without making any surface's program again.
//
// The numbers reach every surface as uniforms of the game's own (`pcwTime`, `pcwAir`, `pcwClouds`), added to each
// material's as three.js prepares it: through `onBeforeCompile`, which three.js calls for every material, made here to
// add them before whatever a material's own does (the program three.js keys by it is keyed as before).

// (four numbers as three.js reads a vec4 uniform, x y z w: so that this module, read by pages and tests without the 3D
// library, needs none of it until it is installed)
class Four {
  constructor(x = 0, y = 0, z = 0, w = 0) { this.x = x; this.y = y; this.z = z; this.w = w; }
  set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
  copy(v) { return this.set(v.x, v.y, v.z, v.w); }
  clone() { return new Four(this.x, this.y, this.z, this.w); }
  toArray() { return [this.x, this.y, this.z, this.w]; }
}
const shared = {
  pcwTime: { value: 0 },
  // x: the clouds' shadows' strength (0 none), y: the noise's threshold over which a point is in a cloud's shadow (from
  // the share of the land they lie on: cloudThreshold), z, w: the wind (metres a second, along the grid's x and z)
  pcwClouds: { value: new Four(0, 0.7, -3, -1.2) },
  // x: the low haze (0 none, 1 full), y: far gloss spread (the most a far surface's roughness is raised to), z: the
  // mirage's strength on far tarmac (0 none, 1 at the height of a hot day), w: puddles on tarmac (0 none, 1 just after rain)
  pcwAir: { value: new Four(0, 0, 0, 0) },
};

// ---- the uniforms added to every material as three.js prepares it ----
const own = new WeakMap();             // a material -> its own onBeforeCompile
const combined = new WeakMap();        // its own function -> it with the game's uniforms added first
function withUniforms(fn) {
  if (combined.has(fn)) return combined.get(fn);
  const c = function onBeforeCompile(shader, renderer) {
    if (shader && shader.uniforms) Object.assign(shader.uniforms, shared);
    return fn.call(this, shader, renderer);
  };
  // (three.js keys a material's program by this function's text: kept as it was)
  c.toString = () => fn.toString();
  combined.set(fn, c);
  return c;
}
let installed = false;
function hookMaterials() {
  const proto = THREE.Material.prototype;
  const original = proto.onBeforeCompile;
  const plain = withUniforms(original);
  Object.defineProperty(proto, 'onBeforeCompile', {
    configurable: true,
    get() { const fn = own.get(this); return fn ? withUniforms(fn) : plain; },
    set(fn) { if (typeof fn === 'function') own.set(this, fn); else own.delete(this); },
  });
}

// ---- the shader pieces ----
// (declared once in a shader, wherever it is first wanted: a lit surface's fog and its lights each want them)
const DECL = `
#ifndef PCW_UNIFORMS
#define PCW_UNIFORMS
uniform float pcwTime;
uniform vec4 pcwClouds;
uniform vec4 pcwAir;
#endif
`;
const PARS = `${DECL}
/* a number from a point of a grid, without sin (the same on every graphics card) */
float pcwHash( vec2 p ) {
	vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
	p3 += dot( p3, p3.yzx + 33.33 );
	return fract( ( p3.x + p3.y ) * p3.z );
}
float pcwNoise( vec2 p ) {
	vec2 i = floor( p ), f = fract( p );
	f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( pcwHash( i ), pcwHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( pcwHash( i + vec2( 0.0, 1.0 ) ), pcwHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
/* where in the town a point seen at viewPos (the eye's own space) is */
vec3 pcwWorld( vec3 viewPos ) { return cameraPosition + ( vec4( viewPos, 0.0 ) * viewMatrix ).xyz; }
/* how much of the sun's light reaches a point under the clouds' shadows (1 all of it) */
float pcwCloudShade( vec3 viewPos ) {
	if ( pcwClouds.x <= 0.0 ) return 1.0;
	vec2 p = ( pcwWorld( viewPos ).xz - pcwClouds.zw * pcwTime ) / 160.0;
	float n = pcwNoise( p ) * 0.62 + pcwNoise( p * 2.17 + vec2( 5.2, 1.3 ) ) * 0.28 + pcwNoise( p * 4.9 + vec2( 2.1, 7.7 ) ) * 0.10;
	return 1.0 - pcwClouds.x * smoothstep( pcwClouds.y - 0.05, pcwClouds.y + 0.05, n );
}
/* how far a point of tarmac lies under a puddle (0 dry or merely wet, 1 under water) */
float pcwPuddle( vec3 at ) {
	if ( pcwAir.w <= 0.0 ) return 0.0;
	vec2 p = at.xz / 2.4;
	float n = pcwNoise( p ) * 0.6 + pcwNoise( p * 2.7 + vec2( 3.1, 8.4 ) ) * 0.28 + pcwNoise( p * 7.3 + vec2( 1.7, 4.2 ) ) * 0.12;
	float gather = pcwNoise( at.xz / 13.0 + vec2( 7.3, 1.9 ) );
	float edge = 0.78 - 0.14 * pcwAir.w - 0.2 * gather;
	return smoothstep( edge, edge + 0.035, n ) * smoothstep( 0.0, 0.35, pcwAir.w );
}
`;
// (a puddle, worked out before the surface's own lighting: darker where it lies)
const PUDDLE = `#ifdef PCW_ROAD
	float pcwWetSpot = pcwPuddle( pcwWorld( - vViewPosition ) );
	diffuseColor.rgb *= 1.0 - 0.5 * pcwWetSpot;
#endif
`;

const PATCHES = [
  // the uniforms and their functions, for every lit surface (lights_pars_begin is in each of them)
  ['lights_pars_begin', 'uniform bool receiveShadow;', `uniform bool receiveShadow;${PARS}`],
  // the clouds' shadows on the sun's light
  ['lights_fragment_begin', 'getDirectionalLightInfo( directionalLight, directLight );', 'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= pcwCloudShade( geometryPosition );'],
  // puddles on tarmac: darker, and (below) smooth as a mirror; on a surface lit without gloss, the sky mixed in
  ['lights_physical_fragment', 'PhysicalMaterial material;', `${PUDDLE}PhysicalMaterial material;`],
  ['lights_lambert_fragment', 'LambertMaterial material;', `${PUDDLE}LambertMaterial material;`],
  ['envmap_fragment', 'outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );', `#ifdef PCW_ROAD
			outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * mix( reflectivity, 0.18 + 0.6 * pow( 1.0 - saturate( dot( normalize( vViewPosition ), normal ) ), 3.0 ), pcwWetSpot ) );
		#else
			outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
		#endif`],
  // far gloss spread a little (metal and glass do not sparkle far off); a puddle's surface smooth
  ['lights_physical_fragment', 'material.roughness = min( material.roughness, 1.0 );', `material.roughness = max( material.roughness, pcwAir.y * smoothstep( 30.0, 170.0, length( vViewPosition ) ) );
#ifdef PCW_ROAD
	material.roughness = mix( material.roughness, 0.07, pcwWetSpot );
#endif
material.roughness = min( material.roughness, 1.0 );`],
  // the fog's own: where each point is, for the low haze
  ['fog_pars_vertex', 'varying float vFogDepth;', 'varying float vFogDepth;\n\tvarying vec3 vPcwFogView;'],
  ['fog_vertex', 'vFogDepth = - mvPosition.z;', 'vFogDepth = - mvPosition.z;\n\tvPcwFogView = mvPosition.xyz;'],
  ['fog_pars_fragment', 'varying float vFogDepth;', `varying float vFogDepth;\n\tvarying vec3 vPcwFogView;${DECL}`],
  ['fog_fragment', 'float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );', `float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
		{
			/* the low haze: thickening with distance from a few tens of metres, the more the nearer the ground (the fog
			   beyond it as it was) */
			float pcwY = cameraPosition.y + ( vec4( vPcwFogView, 0.0 ) * viewMatrix ).y;
			float pcwLow = 1.0 - smoothstep( 4.0, 70.0, pcwY );
			float pcwHaze = pcwAir.x * pcwLow * ( 1.0 - exp( - max( vFogDepth - 25.0, 0.0 ) / 520.0 ) );
			/* its colour: the sky's at the horizon, warmed by the dust in the air (the fog itself after it, as before) */
			gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor * vec3( 1.07, 1.0, 0.86 ), pcwHaze );
		}
		#ifdef PCW_ROAD
		{
			/* the mirage: far along hot tarmac, looked along, the sky's colour wavering on it */
			vec3 pcwDir = normalize( ( vec4( vPcwFogView, 0.0 ) * viewMatrix ).xyz );
			vec3 pcwAt = cameraPosition + ( vec4( vPcwFogView, 0.0 ) * viewMatrix ).xyz;
			float pcwFar = smoothstep( 30.0, 110.0, vFogDepth ) * ( 1.0 - smoothstep( fogFar * 0.7, fogFar, vFogDepth ) );
			float pcwAlong = 1.0 - smoothstep( 0.02, 0.09, abs( pcwDir.y ) );
			/* (wavering: bands across the way that come and go, and the air's shimmer along them) */
			float pcwWave = 0.6 + 0.4 * sin( pcwTime * 2.3 + pcwAt.x * 0.31 + pcwAt.z * 0.27 ) * sin( pcwTime * 1.7 - pcwAt.x * 0.13 + pcwAt.z * 0.41 );
			pcwWave *= 0.8 + 0.2 * sin( pcwTime * 9.0 + ( pcwAt.x + pcwAt.z ) * 2.1 );
			gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor * 1.04, pcwAir.z * pcwFar * pcwAlong * pcwWave * 0.9 );
		}
		#endif`],
];

// Written once: true if every piece was found as expected (a three.js not as expected: none of it, as before).
export const worldShadingInstalled = (() => {
  try {
    if (typeof THREE === 'undefined') return false;
    const C = THREE.ShaderChunk;
    const after = {};
    for (const [name, was, now] of PATCHES) {
      const text = after[name] !== undefined ? after[name] : C[name];
      if (typeof text !== 'string' || text.split(was).length !== 2) return false;
      after[name] = text.replace(was, () => now);
    }
    Object.assign(C, after);
    hookMaterials();
    installed = true;
    return true;
  } catch (error) { return false; }
})();

// A material that is tarmac: given the mirage and the puddles (its program made with them once, as it is first drawn).
export function isRoad(material) {
  if (!material || !installed) return material;
  material.defines = { ...(material.defines || {}), PCW_ROAD: '' };
  material.needsUpdate = true;
  return material;
}

// Each frame: the hour's and the weather's numbers, as the level lets them be drawn.
//   t          seconds (the game's clock)
//   clouds     how strong the clouds' shadows are (0 to 1) and `threshold` the noise's, for the share of the land they lie
//              on (cloudThreshold)
//   haze, glint, mirage, puddles   0 to 1
export function setWorldShading({ t = 0, clouds = 0, threshold = 0.7, haze = 0, glint = 0, mirage = 0, puddles = 0 } = {}) {
  shared.pcwTime.value = t % 100000;
  shared.pcwClouds.value.x = clouds;
  shared.pcwClouds.value.y = threshold;
  shared.pcwAir.value.set(haze, glint, mirage, puddles);
}
// A picture that is not of the town (the character screen's figure on its turntable): drawn with none of it.
export function withoutWorldShading(draw) {
  const clouds = shared.pcwClouds.value.x, air = shared.pcwAir.value.clone();
  shared.pcwClouds.value.x = 0; shared.pcwAir.value.set(0, 0, 0, 0);
  try { return draw(); } finally { shared.pcwClouds.value.x = clouds; shared.pcwAir.value.copy(air); }
}
// How much of the sun's light reaches the ground at (x, z) under the clouds' shadows now (1 all of it): the shader's own
// sum, worked out here the same (for the tests and the pictures: a picture at noon taken in the sun, one of the clouds'
// shadows where they are)
const fract = (x) => x - Math.floor(x);
function hash2(px, py) { let x = fract(px * 0.1031), y = fract(py * 0.1031), z = fract(px * 0.1031); const d = x * (y + 33.33) + y * (z + 33.33) + z * (x + 33.33); x += d; y += d; z += d; return fract((x + y) * z); }
function noise2(px, py) {
  const ix = Math.floor(px), iy = Math.floor(py); let fx = px - ix, fy = py - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
}
export function cloudShadeAt(x, z) {
  const c = shared.pcwClouds.value, t = shared.pcwTime.value;
  if (!(c.x > 0)) return 1;
  const px = (x - c.z * t) / 160, py = (z - c.w * t) / 160;
  const n = noise2(px, py) * 0.62 + noise2(px * 2.17 + 5.2, py * 2.17 + 1.3) * 0.28 + noise2(px * 4.9 + 2.1, py * 4.9 + 7.7) * 0.10;
  const k = Math.max(0, Math.min(1, (n - (c.y - 0.05)) / 0.1));
  return 1 - c.x * k * k * (3 - 2 * k);
}
export const worldShadingState = () => ({ installed, time: +shared.pcwTime.value.toFixed(2), clouds: shared.pcwClouds.value.toArray().map((x) => +x.toFixed(3)), air: shared.pcwAir.value.toArray().map((x) => +x.toFixed(3)) });

// The numbers for the hour and the weather (main.js gives them each frame, times the level's own):
//   sunUp    the sun's height (sin of its angle: 0 at the horizon, 1 overhead; below 0 at night)
//   cover    how much of the sky is cloud (render-sky.js: 0.12 clear, 0.75 cloudy, 0.92 rain, 1 storm)
//   wet      how wet the ground is (render-finish.js: 1 in the rain, drying slowly after it)
//   indoor   how far the light is a hall's own (0 to 1)
//   hour     the hour of the day (0 to 24)
//   clear    how far from the town one is (the habitation: 0 to 1), where the air is clearer
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// The noise's threshold for a share of the land in the clouds' shadows (measured on the shader's own noise, its hash
// and octaves sampled at 200,000 points over 20 km, twice, the same within a thousandth: a share of 0.05 lies above
// 0.742, of 0.5 above 0.498)
const SHARE = [[0.05, 0.742], [0.1, 0.695], [0.15, 0.661], [0.2, 0.632], [0.3, 0.583], [0.4, 0.540], [0.5, 0.498], [0.6, 0.457]];
export function cloudThreshold(share) {
  const c = Math.max(SHARE[0][0], Math.min(SHARE[SHARE.length - 1][0], share));
  for (let i = 1; i < SHARE.length; i += 1) if (c <= SHARE[i][0]) { const [a, ta] = SHARE[i - 1], [b, tb] = SHARE[i]; return ta + (tb - ta) * ((c - a) / (b - a)); }
  return SHARE[SHARE.length - 1][1];
}
export function airAt({ sunUp = 1, cover = 0.12, wet = 0, indoor = 0, hour = 12, clear = 0 } = {}) {
  const out = 1 - Math.max(0, Math.min(1, indoor));
  const sun = smooth(0.02, 0.25, sunUp);
  // the clouds' shadows: where the sun shines through broken cloud (none under a whole grey sky): a few on a clear day
  // (a seventh of the land), nearly half of it on a cloudy one, a cloud's shadow taking most of the sun's light
  const broken = 1 - smooth(0.8, 0.9, cover);
  const clouds = (0.5 + 0.15 * smooth(0.12, 0.75, cover)) * sun * broken * out;
  const share = 0.15 + 0.3 * smooth(0.12, 0.75, cover);
  // the haze: the day's (less at night, when it is hardly seen; and the fog itself is nearer in the rain)
  const haze = (0.55 + 0.35 * sun) * out * (1 - 0.65 * Math.max(0, Math.min(1, clear)));
  // the mirage: the heat of a sunny day on tarmac, from late morning to mid-afternoon, never on wet ground
  const heat = smooth(10.5, 12.5, hour) * (1 - smooth(14.5, 16.5, hour)) * sun * (1 - smooth(0.3, 0.75, cover)) * (1 - smooth(0.02, 0.15, wet));
  return { clouds, share, threshold: cloudThreshold(share), haze, mirage: heat * out, puddles: Math.max(0, Math.min(1, wet)) * out };
}
