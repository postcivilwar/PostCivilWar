// A gentle glow round what is brightest in the picture (the owner's brief of 23 October, its third stage: "Gentle glow
// on the sun, lamps, headlights and bright reflections (MEDIUM+)").
//
// Made from the picture itself, once the town is drawn: whatever is near white in it (the sun and its glints on glass
// and water, a lamp at night, a vehicle's lit lamps, a sunlit white wall at its very brightest) spreads a little light
// round itself, as it does in the eye and in a camera's lens. The picture is copied off the screen (a copy the size of
// the screen: for a phone at Medium about 2 MB), its brightest parts gathered into a picture a quarter as wide (a
// sixteenth of the pixels), blurred there (and at High and Ultra once more in one an eighth as wide, for a wider glow),
// and laid back over the picture, lightening it (a "screen": nothing already white is pushed past white).
//
//   const glow = createScreenGlow(renderer)
//   glow.apply({ amount, night, wide })   after the town is drawn: amount 0 (none) to 1; night 0 to 1 (lamps and windows
//                                          glow more at night, and less of a sunlit wall by day); wide: the wider glow
//   glow.state()                           (the tests) what it holds and did
//   glow.dispose()                         its pictures let go (when its level goes)

const VERT = 'varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4( position.xy, 0.0, 1.0 ); }';
// (the brightest of the picture: each of four taps over a 4 x 4 block of the screen's pixels kept as far as it is over
// the threshold, the four averaged)
const BRIGHT = `uniform sampler2D tSource; uniform vec2 texel; uniform float threshold; uniform float knee;
varying vec2 vUv;
vec3 bright( vec3 c ) { float l = max( c.r, max( c.g, c.b ) ); return c * smoothstep( threshold - knee, threshold + knee, l ); }
void main() {
	vec3 s = bright( texture2D( tSource, vUv + texel * vec2( - 1.0, - 1.0 ) ).rgb ) + bright( texture2D( tSource, vUv + texel * vec2( 1.0, - 1.0 ) ).rgb )
		+ bright( texture2D( tSource, vUv + texel * vec2( - 1.0, 1.0 ) ).rgb ) + bright( texture2D( tSource, vUv + texel * vec2( 1.0, 1.0 ) ).rgb );
	gl_FragColor = vec4( s * 0.25, 1.0 );
}`;
// (a blur nine pixels wide, in five taps, one way at a time)
const BLUR = `uniform sampler2D tSource; uniform vec2 step;
varying vec2 vUv;
void main() {
	vec3 c = texture2D( tSource, vUv ).rgb * 0.2270270270;
	c += ( texture2D( tSource, vUv + step * 1.3846153846 ).rgb + texture2D( tSource, vUv - step * 1.3846153846 ).rgb ) * 0.3162162162;
	c += ( texture2D( tSource, vUv + step * 3.2307692308 ).rgb + texture2D( tSource, vUv - step * 3.2307692308 ).rgb ) * 0.0702702703;
	gl_FragColor = vec4( c, 1.0 );
}`;
const COPY = 'uniform sampler2D tSource; varying vec2 vUv; void main() { gl_FragColor = vec4( texture2D( tSource, vUv ).rgb, 1.0 ); }';
// The sun's flare (Ultra; one of the owner's extras of 24 October): rings of light along the line from the sun through
// the middle of the picture, as a camera's lens makes them looking towards the sun, and a faint streak across it; seen
// as far as the sun itself is seen in the picture as drawn (its disc bright there: behind a wall or a tower, none).
const FLARE_VERT = `uniform sampler2D tShot; uniform vec2 sun; uniform vec2 texel; varying vec2 vUv; varying float vSeen;
void main() {
	vUv = position.xy * 0.5 + 0.5;
	float b = 0.0;
	for ( int i = - 1; i <= 1; i ++ ) for ( int j = - 1; j <= 1; j ++ ) { vec3 c = texture2D( tShot, sun + texel * vec2( float( i ), float( j ) ) * 5.0 ).rgb; b += max( c.r, max( c.g, c.b ) ); }
	vSeen = smoothstep( 0.9, 0.985, b / 9.0 ) * smoothstep( 0.0, 0.08, min( min( sun.x, 1.0 - sun.x ), min( sun.y, 1.0 - sun.y ) ) );
	gl_Position = vec4( position.xy, 0.0, 1.0 );
}`;
const FLARE = `uniform vec2 sun; uniform float aspect; uniform float amount; varying vec2 vUv; varying float vSeen;
vec3 ghost( vec2 at, float r, vec3 c ) { float d = length( ( vUv - at ) * vec2( aspect, 1.0 ) ); return c * smoothstep( r, r * 0.55, d ) * ( 0.6 + 0.4 * smoothstep( r * 0.3, r, d ) ); }
void main() {
	if ( vSeen < 0.002 ) discard;
	vec2 toMid = vec2( 0.5 ) - sun;
	vec3 c = ghost( sun + toMid * 0.5, 0.04, vec3( 1.0, 0.62, 0.28 ) * 0.2 )
		+ ghost( sun + toMid * 0.9, 0.07, vec3( 0.55, 0.9, 0.62 ) * 0.13 )
		+ ghost( sun + toMid * 1.35, 0.028, vec3( 0.6, 0.72, 1.0 ) * 0.26 )
		+ ghost( sun + toMid * 1.75, 0.11, vec3( 1.0, 0.82, 0.45 ) * 0.1 )
		+ ghost( sun + toMid * 2.2, 0.05, vec3( 0.88, 0.55, 0.9 ) * 0.14 );
	/* a faint ring round the sun, and a soft streak across it */
	float pcwR = length( ( vUv - sun ) * vec2( aspect, 1.0 ) );
	c += vec3( 1.0, 0.8, 0.55 ) * 0.07 * smoothstep( 0.2, 0.235, pcwR ) * ( 1.0 - smoothstep( 0.245, 0.29, pcwR ) );
	c += vec3( 1.0, 0.86, 0.66 ) * exp( - abs( vUv.y - sun.y ) * 170.0 ) * exp( - abs( ( vUv.x - sun.x ) * aspect ) * 3.2 ) * 0.16;
	gl_FragColor = vec4( c * vSeen * amount, 1.0 );
}`;
const LAY = `uniform sampler2D tNear; uniform sampler2D tFar; uniform float amount; uniform float wide;
varying vec2 vUv;
void main() { gl_FragColor = vec4( ( texture2D( tNear, vUv ).rgb + texture2D( tFar, vUv ).rgb * wide ) * amount, 1.0 ); }`;

export function createScreenGlow(renderer) {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const shader = (fragmentShader, uniforms, extra = {}) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader, uniforms, depthTest: false, depthWrite: false, toneMapped: false, fog: false, blending: THREE.NoBlending, ...extra });
  const bright = shader(BRIGHT, { tSource: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 0.9 }, knee: { value: 0.05 } });
  const blur = shader(BLUR, { tSource: { value: null }, step: { value: new THREE.Vector2() } });
  const copy = shader(COPY, { tSource: { value: null } });
  // (laid over the picture as a screen: the glow times what is not yet white, added; the picture's own alpha kept)
  const lay = shader(LAY, { tNear: { value: null }, tFar: { value: null }, amount: { value: 0 }, wide: { value: 0 } }, {
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneMinusDstColorFactor, blendDst: THREE.OneFactor,
    blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, transparent: true,
  });
  const flare = new THREE.ShaderMaterial({
    vertexShader: FLARE_VERT, fragmentShader: FLARE, uniforms: { tShot: { value: null }, sun: { value: new THREE.Vector2() }, texel: { value: new THREE.Vector2() }, aspect: { value: 1 }, amount: { value: 0 } },
    depthTest: false, depthWrite: false, toneMapped: false, fog: false, transparent: true,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneMinusDstColorFactor, blendDst: THREE.OneFactor,
    blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
  });
  let flared = 0;
  const quad = new THREE.Mesh(geometry, copy);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);

  let shot = null;                       // the picture as drawn, copied off the screen
  const near = [], far = [];             // a quarter as wide (two, blurred one into the other), and an eighth
  const size = new THREE.Vector2();
  let w = 0, h = 0, applied = 0, wideMade = false;
  const target = (x, y) => {
    const t = new THREE.WebGLRenderTarget(x, y, { depthBuffer: false, stencilBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    t.texture.name = 'screen-glow';
    return t;
  };
  function letGo() {
    if (shot) { shot.dispose(); shot = null; }
    for (const t of [...near, ...far]) t.dispose();
    near.length = 0; far.length = 0; w = h = 0; wideMade = false;
  }
  function make(width, height, wide) {
    if (width !== w || height !== h) {
      letGo();
      w = width; h = height;
      shot = new THREE.FramebufferTexture(w, h);
      shot.minFilter = THREE.LinearFilter; shot.magFilter = THREE.LinearFilter; shot.name = 'screen-glow-copy';
      const qx = Math.max(1, Math.ceil(w / 4)), qy = Math.max(1, Math.ceil(h / 4));
      near.push(target(qx, qy), target(qx, qy));
    }
    if (wide && !wideMade) {
      const ex = Math.max(1, Math.ceil(near[0].width / 2)), ey = Math.max(1, Math.ceil(near[0].height / 2));
      far.push(target(ex, ey), target(ex, ey));
      wideMade = true;
    } else if (!wide && wideMade) {
      for (const t of far) t.dispose();
      far.length = 0; wideMade = false;
    }
  }
  const pass = (material, to) => { quad.material = material; renderer.setRenderTarget(to); renderer.render(scene, camera); };
  function blurInto(pair) {
    const [a, b] = pair;
    blur.uniforms.tSource.value = a.texture; blur.uniforms.step.value.set(1 / a.width, 0); pass(blur, b);
    blur.uniforms.tSource.value = b.texture; blur.uniforms.step.value.set(0, 1 / a.height); pass(blur, a);
  }

  // flare: { x, y, amount }: the sun's place on the picture (0 to 1 across and up) and how much of its flare (0: none)
  function apply({ amount = 0, night = 0, wide = false, flare: sunFlare = null } = {}) {
    if (!(amount > 0)) return false;
    renderer.getDrawingBufferSize(size);
    if (size.x < 8 || size.y < 8) return false;
    make(size.x, size.y, wide);
    const before = { target: renderer.getRenderTarget(), autoClear: renderer.autoClear, reset: renderer.info.autoReset };
    // (counted with the town's drawing, as part of the frame)
    renderer.info.autoReset = false;
    renderer.autoClear = false;
    try {
      renderer.setRenderTarget(null);
      renderer.copyFramebufferToTexture(shot);
      // the brightest: by day only what is nearly white, at night the lamps and windows too
      bright.uniforms.tSource.value = shot;
      bright.uniforms.texel.value.set(1 / w, 1 / h);
      bright.uniforms.threshold.value = 0.93 - 0.13 * night;
      bright.uniforms.knee.value = 0.045 + 0.04 * night;
      pass(bright, near[0]);
      blurInto(near);
      if (wide) {
        copy.uniforms.tSource.value = near[0].texture;
        pass(copy, far[0]);
        blurInto(far);
      }
      lay.uniforms.tNear.value = near[0].texture;
      lay.uniforms.tFar.value = wide ? far[0].texture : near[0].texture;
      lay.uniforms.wide.value = wide ? 0.8 : 0;
      lay.uniforms.amount.value = amount;
      pass(lay, null);
      // (the sun's flare, where the sun is in the picture and seen)
      if (sunFlare && sunFlare.amount > 0 && sunFlare.x > -0.05 && sunFlare.x < 1.05 && sunFlare.y > -0.05 && sunFlare.y < 1.05) {
        flare.uniforms.tShot.value = shot;
        flare.uniforms.sun.value.set(sunFlare.x, sunFlare.y);
        flare.uniforms.texel.value.set(1 / w, 1 / h);
        flare.uniforms.aspect.value = w / h;
        flare.uniforms.amount.value = sunFlare.amount;
        pass(flare, null);
        flared += 1;
      }
      applied += 1;
    } finally {
      renderer.setRenderTarget(before.target);
      renderer.autoClear = before.autoClear;
      renderer.info.autoReset = before.reset;
    }
    return true;
  }
  return {
    apply,
    dispose: letGo,
    state: () => ({ flared, width: w, height: h, near: near.length ? [near[0].width, near[0].height] : null, far: far.length ? [far[0].width, far[0].height] : null, applied, bytes: shot ? w * h * 4 + near.reduce((s, t) => s + t.width * t.height * 4, 0) + far.reduce((s, t) => s + t.width * t.height * 4, 0) : 0 }),
  };
}
