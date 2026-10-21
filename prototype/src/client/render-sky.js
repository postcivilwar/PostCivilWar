// Sky, sun, night, cloud and rain. Driven by the simulation's clock and weather.

import { linear } from './render-kit.js';
import { ZONE } from '../sim/zone.js';
import { trueToGrid } from '../sim/geo.js';

const KEYS = [
  // hour, sky top, horizon, sun colour, sun strength, ambient strength
  [0, 0x070b1f, 0x101a3a, 0x8fa8ff, 0.1, 0.16],
  [4.8, 0x0b1230, 0x1b2550, 0x8fa8ff, 0.1, 0.17],
  [5.9, 0x2a3f7a, 0xf0a070, 0xffb27a, 0.38, 0.3],
  [7.2, 0x4f8fd0, 0xf6d9b0, 0xffe6c4, 1.1, 0.6],
  [10, 0x3f8fe0, 0xcfe6f5, 0xfff4e0, 1.3, 0.68],
  [15, 0x4690dc, 0xd6e8f2, 0xfff0d6, 1.25, 0.66],
  [17.6, 0x5a86c8, 0xf7c890, 0xffc98a, 0.85, 0.48],
  [18.7, 0x3a3f7c, 0xf08a5a, 0xff9a62, 0.32, 0.3],
  [19.6, 0x0f1638, 0x2a2d5c, 0x8fa8ff, 0.12, 0.19],
  [24, 0x070b1f, 0x101a3a, 0x8fa8ff, 0.1, 0.16],
];

// The light in PostCivilWar PowerBike's hall: white, all round and from straight above, exactly as its motorcycles'
// pictures were taken (tools/vehicles/bike_impostors.mjs), so that a picture and the model drawn in its place agree.
const OVERHEAD = new THREE.Vector3(0.001, 1, 0.001).normalize();
const WHITE = new THREE.Color(1, 1, 1);
const HALL_FLOOR = new THREE.Color(0x8a8478);
const HALL_LIGHT = Object.freeze({ all: 1.0, key: 0.75 });

function sample(hour) {
  let a = KEYS[0];
  let b = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i += 1) if (hour >= KEYS[i][0] && hour <= KEYS[i + 1][0]) { a = KEYS[i]; b = KEYS[i + 1]; break; }
  const k = b[0] === a[0] ? 0 : (hour - a[0]) / (b[0] - a[0]);
  const mix = (x, y) => linear(x).lerp(linear(y), k);
  return { top: mix(a[1], b[1]), horizon: mix(a[2], b[2]), sun: mix(a[3], b[3]), strength: a[4] + (b[4] - a[4]) * k, ambient: a[5] + (b[5] - a[5]) * k };
}

export function createSky(scene, renderer) {
  const uniforms = { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() } };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(900, 24, 14),
    new THREE.ShaderMaterial({
      uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 horizon; varying vec3 vDir; void main(){ float h = clamp(vDir.y * 1.6 + 0.08, 0.0, 1.0); vec3 c = mix(horizon, top, pow(h, 0.62)); gl_FragColor = vec4(pow(c, vec3(1.0 / 2.2)), 1.0); }',
    }));
  dome.renderOrder = -10;
  scene.add(dome);

  const starGeometry = new THREE.BufferGeometry();
  const starPositions = [];
  for (let i = 0; i < 520; i += 1) {
    const u = Math.random() * Math.PI * 2;
    const v = Math.acos(Math.random() * 0.95 + 0.05);
    starPositions.push(Math.sin(v) * Math.cos(u) * 850, Math.cos(v) * 850, Math.sin(v) * Math.sin(u) * 850);
  }
  starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  scene.add(stars);

  // Far from the town's lights (the habitation, 20 October 2026: "night properly dark, with the moon and stars") the
  // fainter stars come out too.
  const faintGeometry = new THREE.BufferGeometry();
  const faintPositions = [];
  for (let i = 0; i < 1100; i += 1) {
    const u = Math.random() * Math.PI * 2;
    const v = Math.acos(Math.random() * 0.97 + 0.03);
    faintPositions.push(Math.sin(v) * Math.cos(u) * 840, Math.cos(v) * 840, Math.sin(v) * Math.sin(u) * 840);
  }
  faintGeometry.setAttribute('position', new THREE.Float32BufferAttribute(faintPositions, 3));
  const faint = new THREE.Points(faintGeometry, new THREE.PointsMaterial({ color: 0xdfe6ff, size: 1.3, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  faint.visible = false;
  scene.add(faint);

  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(26, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff2c8, fog: false, toneMapped: false }));
  scene.add(sunDisc);

  // The moon: where the night's light comes from, a pale disc with its darker seas, and a faint ring of light round it.
  const moonCanvas = document.createElement('canvas');
  moonCanvas.width = moonCanvas.height = 128;
  const mctx = moonCanvas.getContext('2d');
  mctx.fillStyle = '#000'; mctx.fillRect(0, 0, 128, 128);
  const face = mctx.createRadialGradient(56, 54, 8, 64, 64, 60);
  face.addColorStop(0, '#f6f4ea'); face.addColorStop(0.85, '#e4e0d0'); face.addColorStop(1, '#cfcab6');
  mctx.fillStyle = face; mctx.beginPath(); mctx.arc(64, 64, 60, 0, Math.PI * 2); mctx.fill();
  // (the seas: soft grey patches where the old maps put them)
  for (const [x, y, r, a] of [[48, 44, 17, 0.32], [70, 40, 12, 0.26], [80, 60, 15, 0.28], [58, 70, 11, 0.22], [44, 80, 9, 0.2], [86, 82, 7, 0.16], [66, 92, 6, 0.14]]) {
    const sea = mctx.createRadialGradient(x, y, 0, x, y, r);
    sea.addColorStop(0, `rgba(120,118,108,${a})`); sea.addColorStop(1, 'rgba(120,118,108,0)');
    mctx.fillStyle = sea; mctx.beginPath(); mctx.arc(x, y, r, 0, Math.PI * 2); mctx.fill();
  }
  const moonMap = new THREE.CanvasTexture(moonCanvas);
  moonMap.encoding = THREE.sRGBEncoding;
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonMap, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false, opacity: 0 }));
  moon.scale.set(30, 30, 1);
  moon.renderOrder = -8;
  scene.add(moon);
  const moonGlowCanvas = document.createElement('canvas');
  moonGlowCanvas.width = moonGlowCanvas.height = 128;
  const gctx = moonGlowCanvas.getContext('2d');
  const ring = gctx.createRadialGradient(64, 64, 6, 64, 64, 64);
  ring.addColorStop(0, 'rgba(210,222,255,0.55)'); ring.addColorStop(0.3, 'rgba(190,205,255,0.16)'); ring.addColorStop(1, 'rgba(180,200,255,0)');
  gctx.fillStyle = ring; gctx.fillRect(0, 0, 128, 128);
  const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(moonGlowCanvas), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false, opacity: 0 }));
  moonGlow.scale.set(150, 150, 1);
  moonGlow.renderOrder = -9;
  scene.add(moonGlow);

  // a soft halo round the sun
  const haloCanvas = document.createElement('canvas');
  haloCanvas.width = 128; haloCanvas.height = 128;
  const hctx = haloCanvas.getContext('2d');
  const fade = hctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  fade.addColorStop(0, 'rgba(255,244,214,0.95)'); fade.addColorStop(0.25, 'rgba(255,236,190,0.35)'); fade.addColorStop(1, 'rgba(255,230,180,0)');
  hctx.fillStyle = fade; hctx.fillRect(0, 0, 128, 128);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(haloCanvas), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  halo.scale.set(330, 330, 1);
  halo.renderOrder = -9;
  scene.add(halo);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x8a7a5a, 0.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 420;
  const span = 62;
  sun.shadow.camera.left = -span; sun.shadow.camera.right = span; sun.shadow.camera.top = span; sun.shadow.camera.bottom = -span;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);
  scene.fog = new THREE.Fog(0xffffff, 120, 620);

  // cloud deck
  const cloudMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, depthWrite: false, fog: false });
  const clouds = new THREE.Group();
  for (let i = 0; i < 26; i += 1) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(1, 9, 6), cloudMaterial);
    const a = (i / 26) * Math.PI * 2 + Math.sin(i * 7.1);
    const r = 120 + ((i * 97) % 380);
    puff.position.set(Math.cos(a) * r, 150 + ((i * 31) % 50), Math.sin(a) * r);
    puff.scale.set(60 + ((i * 53) % 70), 10 + ((i * 17) % 9), 40 + ((i * 29) % 50));
    clouds.add(puff);
  }
  scene.add(clouds);

  // rain
  const DROPS = 1500;
  const rainPositions = new Float32Array(DROPS * 6);
  const rainSeeds = new Float32Array(DROPS * 3);
  for (let i = 0; i < DROPS; i += 1) { rainSeeds[i * 3] = Math.random() * 70 - 35; rainSeeds[i * 3 + 1] = Math.random() * 34; rainSeeds[i * 3 + 2] = Math.random() * 70 - 35; }
  const rainGeometry = new THREE.BufferGeometry();
  rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
  const rain = new THREE.LineSegments(rainGeometry, new THREE.LineBasicMaterial({ color: 0xc4d6ee, transparent: true, opacity: 0, depthWrite: false }));
  rain.frustumCulled = false;
  scene.add(rain);

  const grey = linear(0x7f8894);
  const storm = linear(0x4a5160);
  let wetness = 0;
  let cover = 0;
  let flash = 0;
  const tmp = new THREE.Vector3();
  const moonWay = new THREE.Vector3();

  // `indoor` (0 to 1): how far the light is a hall's own (PostCivilWar PowerBike): its ceiling's panels, white, from
  // above and all round, the same by day and by night; and no rain falling.
  // `wild` (0 to 1): how far from the town's lights the eye is (the habitation): its nights are darker, lit by the
  // moon and the stars only.
  function update(dt, hour, weather, focus, camera, indoor = 0, wild = 0) {
    const s = sample(hour);
    const targetCover = { clear: 0.12, cloudy: 0.75, rain: 0.92, storm: 1 }[weather.kind];
    cover += (targetCover - cover) * Math.min(1, dt * 0.9);
    wetness += ((weather.wet ? weather.intensity : 0) - wetness) * Math.min(1, dt * 0.9);
    const overcast = weather.kind === 'storm' ? storm : grey;
    const dull = Math.max(0, cover - 0.12) / 0.88;
    s.top.lerp(overcast, dull * 0.9);
    s.horizon.lerp(overcast, dull * 0.8);
    const night = Math.max(0, Math.min(1, hour < 12 ? (6.4 - hour) / 1.4 : (hour - 18.4) / 1.3));

    if (weather.kind === 'storm' && Math.random() < dt * 0.25) flash = 1;
    flash = Math.max(0, flash - dt * 4);

    // (far from the town, the night sky has no glow of lamps at its edge, and the air is darker)
    const dark = night * Math.max(0, Math.min(1, wild)) * (1 - indoor);
    if (dark > 0) { s.top.multiplyScalar(1 - 0.45 * dark); s.horizon.multiplyScalar(1 - 0.6 * dark); }
    uniforms.top.value.copy(s.top);
    uniforms.horizon.value.copy(s.horizon).lerp(new THREE.Color(1, 1, 1), flash * 0.5);
    scene.fog.color.copy(uniforms.horizon.value);
    // the air over the river is hazy: beyond a few hundred metres the town fades out. Out in the wild (the habitation,
    // 21 October 2026) it is clearer, so that the far side of the lagoon is seen as the owner's pictures see it.
    const clearer = Math.max(0, Math.min(1, wild)) * (1 - indoor);
    scene.fog.near = 110 + 50 * clearer - wetness * 80;
    scene.fog.far = 480 + 160 * clearer - wetness * 270 - dull * 90;

    // The sun rises in the true east, is high and slightly south at noon, and
    // sets in the true west. The scene is in the zone's site grid, so the
    // direction is turned into grid axes.
    const dayAngle = ((hour - 6.2) / 12.4) * Math.PI;
    const up = Math.sin(dayAngle);
    const isDay = up > 0.02;
    const lit = isDay ? trueToGrid(Math.cos(dayAngle), 0.34, ZONE.gridBearing) : trueToGrid(-0.45, 0.4, ZONE.gridBearing);
    const dir = tmp.set(lit.x, isDay ? Math.max(0.12, up) : 0.8, lit.z);
    dir.normalize();
    // (indoors, from straight above: a hair off it, so that the shadow's camera has a way to face)
    if (indoor > 0) dir.lerp(OVERHEAD, indoor).normalize();
    sun.position.copy(focus).addScaledVector(dir, 200);
    sun.target.position.copy(focus);
    sun.color.copy(s.sun);
    sun.intensity = s.strength * (1 - dull * 0.62) + flash * 1.5;
    hemi.intensity = s.ambient * (1 - dull * 0.25) + flash * 0.6;
    hemi.color.copy(s.top).lerp(new THREE.Color(1, 1, 1), 0.55);
    hemi.groundColor.copy(linear(0x8a7a5a)).multiplyScalar(0.7 + s.ambient * 0.5);
    // (the moon's light alone: a little less of it reaching the ground under the trees, and much less from all round)
    if (dark > 0) { sun.intensity *= 1 - 0.3 * dark; hemi.intensity *= 1 - 0.6 * dark; }
    if (indoor > 0) {
      sun.color.lerp(WHITE, indoor); sun.intensity += (HALL_LIGHT.key - sun.intensity) * indoor;
      hemi.color.lerp(WHITE, indoor); hemi.groundColor.lerp(HALL_FLOOR, indoor); hemi.intensity += (HALL_LIGHT.all - hemi.intensity) * indoor;
    }

    dome.position.copy(camera.position);
    stars.position.copy(camera.position);
    stars.material.opacity = night * (1 - dull);
    faint.position.copy(camera.position);
    faint.material.opacity = dark * (1 - dull) * 0.85;
    faint.visible = faint.material.opacity > 0.01;
    // the moon, where the night's light comes from (behind the cloud on a dull night)
    const moonDir = trueToGrid(-0.45, 0.4, ZONE.gridBearing);
    const moonAt = moonWay.set(moonDir.x, 0.8, moonDir.z).normalize();
    moon.position.copy(camera.position).addScaledVector(moonAt, 780);
    moonGlow.position.copy(moon.position);
    moon.material.opacity = Math.max(0, night - 0.15) / 0.85 * (1 - dull * 0.85) * (1 - indoor);
    moonGlow.material.opacity = moon.material.opacity * (0.55 + 0.45 * dark);
    moon.visible = moonGlow.visible = moon.material.opacity > 0.01;
    sunDisc.visible = isDay && dull < 0.7;
    sunDisc.position.copy(camera.position).addScaledVector(dir, 800);
    sunDisc.material.color.copy(s.sun).lerp(new THREE.Color(1, 1, 1), 0.5);
    halo.visible = sunDisc.visible;
    halo.position.copy(sunDisc.position);
    halo.material.color.copy(s.sun);
    halo.material.opacity = 0.75 * (1 - dull);

    cloudMaterial.opacity = Math.min(0.95, cover * 0.95);
    cloudMaterial.color.copy(new THREE.Color(1, 1, 1)).lerp(overcast, dull * 0.75).multiplyScalar(0.35 + s.ambient * 1.05);
    clouds.position.set(camera.position.x, 0, camera.position.z);
    clouds.rotation.y += dt * 0.004;

    rain.material.opacity = wetness * 0.55;
    rain.visible = wetness > 0.02 && indoor < 0.5;
    if (rain.visible) {
      const fall = 26;
      for (let i = 0; i < DROPS; i += 1) {
        let y = rainSeeds[i * 3 + 1] - fall * dt;
        if (y < 0) y += 34;
        rainSeeds[i * 3 + 1] = y;
        const x = camera.position.x + rainSeeds[i * 3];
        const z = camera.position.z + rainSeeds[i * 3 + 2];
        rainPositions[i * 6] = x; rainPositions[i * 6 + 1] = y; rainPositions[i * 6 + 2] = z;
        rainPositions[i * 6 + 3] = x + 0.12; rainPositions[i * 6 + 4] = y + 0.75; rainPositions[i * 6 + 5] = z;
      }
      rainGeometry.attributes.position.needsUpdate = true;
    }
    return { night, wetness, dull };
  }

  return {
    update, sun,
    // (for the tests: the moon and the stars as they are drawn now)
    state: () => ({ moon: moon.visible, moonOpacity: +moon.material.opacity.toFixed(2), stars: +stars.material.opacity.toFixed(2), faint: faint.visible ? +faint.material.opacity.toFixed(2) : 0, sun: +sun.intensity.toFixed(3), all: +hemi.intensity.toFixed(3) }),
  };
}
