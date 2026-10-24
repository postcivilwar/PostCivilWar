// The colour grade (the owner's brief of 23 October, its third stage: "Filmic colour grading suited to Nigeria's warm
// daylight (all levels)"). Every surface the town draws ends in three.js's tone mapping, and three.js keeps a place for
// a game's own there (CustomToneMapping), which is written here once, as the game loads, before any surface is made:
//   - the colours as they were chosen and judged on the screen, below a knee (KNEE of white, in light's own units: all
//     but the brightest of the town's colours are under it), and above it a soft shoulder rolling off towards white
//     (white itself a few hundredths under it), so that a sunlit white wall or the glare off a windscreen is not cut flat;
//   - a white balance by the hour: warm in the day's light, warmer at sunrise and sunset (the golden hour), cool under
//     the moon (WARM, by the warmth w from -1 to +1);
//   - by day a touch more colour (SATURATION.day), at night a little less (SATURATION.night), as the eye sees it.
// The warmth comes to every surface in three.js's own uniform for it, `toneMappingExposure`, as 1 + w (the game uses
// no other tone mapping, and its exposure is 1: so nothing else needs to reach every material). Signs, lamps' glow and
// whatever else is drawn with `toneMapped: false` keep their colours exactly. Only what is drawn to the screen is
// graded (three.js tone-maps there, and at High and Ultra in the last pass of the picture's own: OutputPass).
//
//   gradeColour(rgb, w)   the same grade in JavaScript, for the tests and the measuring (its numbers are the shader's)
//   warmthAt(hour, ...)   the warmth at an hour of the day, by the weather and where one is

export const KNEE = 0.85;
export const WARM = Object.freeze([0.045, 0.008, -0.06]);          // red, green, blue: each times (1 + WARM * w)
export const SATURATION = Object.freeze({ day: 0.06, night: -0.05 });

const num = (x) => (Number.isInteger(x) ? x.toFixed(1) : String(x));
export const GRADE_GLSL = `vec3 CustomToneMapping( vec3 color ) {
	float pcwWarmth = clamp( toneMappingExposure - 1.0, - 1.0, 1.0 );
	color *= vec3( 1.0 + ${num(WARM[0])} * pcwWarmth, 1.0 + ${num(WARM[1])} * pcwWarmth, 1.0 + ${num(WARM[2])} * pcwWarmth );
	float pcwLight = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
	color = max( vec3( 0.0 ), mix( vec3( pcwLight ), color, 1.0 + ${num(SATURATION.day)} * max( pcwWarmth, 0.0 ) + ${num(-SATURATION.night)} * min( pcwWarmth, 0.0 ) ) );
	vec3 pcwOver = max( color - ${num(KNEE)}, 0.0 );
	return min( color, vec3( ${num(KNEE)} ) ) + ${num(+(1 - KNEE).toFixed(4))} * ( 1.0 - exp( - pcwOver / ${num(+(1 - KNEE).toFixed(4))} ) );
}`;

// three.js's own placeholder for it, as r186 has it
const PLACEHOLDER = 'vec3 CustomToneMapping( vec3 color ) { return color; }';
export const gradeInstalled = (() => {
  try {
    const chunk = THREE.ShaderChunk.tonemapping_pars_fragment;
    if (chunk.includes('pcwWarmth')) return true;
    if (chunk.split(PLACEHOLDER).length !== 2) return false;     // (a three.js not as expected: no grade, as before)
    THREE.ShaderChunk.tonemapping_pars_fragment = chunk.replace(PLACEHOLDER, GRADE_GLSL);
    return true;
  } catch (error) { return false; }
})();

// The same grade, for one colour in linear light ([r, g, b]), w the warmth.
export function gradeColour([r, g, b], w = 0) {
  const k = Math.max(-1, Math.min(1, w));
  let c = [r * (1 + WARM[0] * k), g * (1 + WARM[1] * k), b * (1 + WARM[2] * k)];
  const light = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const s = 1 + SATURATION.day * Math.max(k, 0) - SATURATION.night * Math.min(k, 0);
  c = c.map((x) => Math.max(0, light + (x - light) * s));
  return c.map((x) => Math.min(x, KNEE) + (1 - KNEE) * (1 - Math.exp(-Math.max(x - KNEE, 0) / (1 - KNEE))));
}

// The warmth at `hour` (0 to 24), the colour of the hour (one of the owner's extras of 24 October: "a colour mood for
// each time of day"): golden as the sun rises (+1), fresher through the morning (+0.35), warming through the afternoon
// (+0.55 by four o'clock), golden again as it sets (+1, from about 17 degrees up), blue at dusk and cool under the moon
// (-0.8); less of either under cloud (`dull` 0 to 1), none in a hall lit by its own panels (`indoor` 0 to 1).
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function warmthAt(hour, { dull = 0, indoor = 0 } = {}) {
  const h = ((hour % 24) + 24) % 24;
  // the sun's height, as render-sky.js has it: up from 6.2 h to 18.6 h
  const up = Math.sin(((h - 6.2) / 12.4) * Math.PI);
  let w;
  if (up > 0.02) {
    // day: fresher in the morning, warmer in the afternoon, warmest while the sun is low
    const base = 0.35 + 0.2 * smooth(10, 16, h);
    w = base + (1 - base) * smooth(0.30, 0.03, up);
  } else {
    // twilight into night: from the golden hour's warmth to the moon's cool within the sun's last few degrees below
    const below = Math.min(1, (0.02 - up) / 0.18);
    w = 1 - 1.8 * below;
  }
  w *= 1 - 0.6 * Math.max(0, Math.min(1, dull));
  w *= 1 - Math.max(0, Math.min(1, indoor));
  return Math.max(-1, Math.min(1, w));
}
