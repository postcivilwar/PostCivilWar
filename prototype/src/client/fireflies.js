// Fireflies at night in the habitation (one of the owner's extras of 24 October, for the third stage of his brief): in the
// forest, the swamp and along the water, round the player, little lights drifting a metre or two above the ground,
// each flashing yellow-green now and then and dark between. One set of points, drawn only at night in the habitation, at
// Medium and up.
//
//   const flies = createFireflies(scene, { lite })
//   flies.update(dt, { amount, eye, camera, height, ground(x, z) })   amount: 0 none (day, the town, Low) to 1
//   flies.state()  (the tests)

const VERT = `attribute vec3 aSeed; uniform float time; uniform float pxPerMetre; uniform float amount; varying float vGlow;
void main() {
	/* each wanders slowly round where it lives */
	vec3 p = position + vec3( sin( time * ( 0.21 + aSeed.x * 0.2 ) + aSeed.y * 6.28 ) * 0.9, sin( time * ( 0.33 + aSeed.z * 0.2 ) + aSeed.x * 6.28 ) * 0.35, cos( time * ( 0.17 + aSeed.y * 0.2 ) + aSeed.z * 6.28 ) * 0.9 );
	vec4 mv = modelViewMatrix * vec4( p, 1.0 );
	float d = max( 0.3, - mv.z );
	/* a flash of about a second every few seconds, each its own, and a faint glow between */
	float period = 2.4 + aSeed.x * 3.0;
	float t = fract( time / period + aSeed.z );
	float flash = smoothstep( 0.0, 0.06, t ) * ( 1.0 - smoothstep( 0.16, 0.34, t ) );
	vGlow = amount * ( 0.12 + 0.88 * flash ) * ( 1.0 - smoothstep( 18.0, 26.0, d ) );
	gl_PointSize = clamp( 0.42 * pxPerMetre / d, 2.5, 26.0 );
	gl_Position = projectionMatrix * mv;
}`;
const FRAG = `varying float vGlow;
void main() {
	float r = length( gl_PointCoord - 0.5 ) * 2.0;
	/* a bright point with a soft halo */
	float a = vGlow * ( smoothstep( 0.35, 0.0, r ) + 0.35 * smoothstep( 1.0, 0.0, r ) );
	if ( a < 0.003 ) discard;
	gl_FragColor = vec4( vec3( 0.78, 1.0, 0.32 ) * a, 1.0 );
}`;
const COUNT = { full: 170, lite: 110 };
const BOX = 36;                         // metres across, round the player

export function createFireflies(scene, { lite = false } = {}) {
  const N = lite ? COUNT.lite : COUNT.full;
  const pos = new Float32Array(N * 3), seed = new Float32Array(N * 3);
  for (let i = 0; i < N * 3; i += 1) seed[i] = Math.random();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
  const uniforms = { time: { value: 0 }, pxPerMetre: { value: 600 }, amount: { value: 0 } };
  // (added to the picture, as light is: never darkening what is behind)
  const material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 3;
  points.visible = false;
  scene.add(points);
  let level = 0, clock = 0, placed = false;
  const at = Array.from({ length: N }, () => ({ x: 0, z: 0 }));

  // where each lives: anywhere in the box round the player, at its own height over the ground there
  function place(i, eye, ground) {
    const x = eye.x + (Math.random() - 0.5) * BOX, z = eye.z + (Math.random() - 0.5) * BOX;
    at[i].x = x; at[i].z = z;
    pos[i * 3] = x; pos[i * 3 + 1] = ground(x, z) + 0.5 + Math.random() * 2.2; pos[i * 3 + 2] = z;
  }
  function update(dt, { amount = 0, eye = null, camera = null, height = 1000, ground = () => 0 } = {}) {
    clock += dt;
    level += ((eye ? amount : 0) - level) * Math.min(1, dt * 0.6);
    points.visible = level > 0.02 && !!eye;
    if (!points.visible) { if (level <= 0.02) placed = false; return; }
    if (!placed) { for (let i = 0; i < N; i += 1) place(i, eye, ground); placed = true; geometry.attributes.position.needsUpdate = true; }
    // (one that the player has left far behind lives again ahead: a few looked at each frame)
    let moved = false;
    for (let k = 0; k < 8; k += 1) {
      const i = Math.floor(Math.random() * N);
      if (Math.abs(at[i].x - eye.x) > BOX / 2 || Math.abs(at[i].z - eye.z) > BOX / 2) { place(i, eye, ground); moved = true; }
    }
    if (moved) geometry.attributes.position.needsUpdate = true;
    uniforms.time.value = clock;
    uniforms.amount.value = level;
    if (camera) uniforms.pxPerMetre.value = (height / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  }
  return { update, state: () => ({ shown: points.visible, level: +level.toFixed(2), count: N }) };
}
