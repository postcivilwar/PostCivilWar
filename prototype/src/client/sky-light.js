// Light from the whole sky, as it is at the hour (the owner's brief of 23 October, its third stage: "Lighting from the
// whole sky that changes with the time of day, softer shadows, warm sunrise and sunset, cool moonlight (MEDIUM+)").
//
// Until now the sky's light came from three.js's hemisphere light: one colour from above and one from below, the same
// all round. Here it is the sky itself, as the dome draws it (its zenith and its horizon), with the brighter, warmer
// sky round the sun (its aureole: wide and golden when the sun is low, as at sunrise and sunset) and round the moon at
// night (cool), and the light thrown back up by the ground (laterite red-brown): worked out as nine numbers a colour
// (spherical harmonics, three.js's LightProbe), which every lit surface reads by the way it faces. A wall facing the
// low sun is lit warm and bright by the sky round it, the wall turned from it by the plain blue of the rest; at night
// the side towards the moon is the brighter, and cool.
//
// So that the town is as bright, and of the colour, it was tuned, the sky's part and the ground's are each scaled, colour
// by colour, until a surface facing straight up, and one facing straight down, get just what the hemisphere light gave
// them: the ground and the roofs lit as before, the walls by the way each faces (warmer towards a low sun, the plain sky
// on the far side). Worked out on the processor (a few hundred directions, a fraction of a millisecond) when the hour or
// the weather has moved on; nothing more is drawn for it.
//
//   skyHarmonics(sky)   the nine colours (three.js's SphericalHarmonics3 order, of the light arriving from each way)
//   irradianceAt(sh, n) what a surface facing n receives from them (as three.js's shader works it out)

// directions spread evenly over the sphere (a Fibonacci spiral)
const N = 384;
const DIRS = (() => {
  const out = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i += 1) {
    const y = 1 - (2 * (i + 0.5)) / N, r = Math.sqrt(1 - y * y), a = golden * i;
    out.push([Math.cos(a) * r, y, Math.sin(a) * r]);
  }
  return out;
})();
// three.js's basis, in its order (SphericalHarmonics3.getBasisAt)
function basis([x, y, z], out) {
  out[0] = 0.282095;
  out[1] = 0.488603 * y; out[2] = 0.488603 * z; out[3] = 0.488603 * x;
  out[4] = 1.092548 * x * y; out[5] = 1.092548 * y * z; out[6] = 0.315392 * (3 * z * z - 1);
  out[7] = 1.092548 * x * z; out[8] = 0.546274 * (x * x - y * y);
  return out;
}
// what a surface facing `n` receives, from coefficients `c` (nine [r, g, b]), as three.js's shGetIrradianceAt has it
export function irradianceAt(c, [x, y, z]) {
  const w = [0.886227, 2 * 0.511664 * y, 2 * 0.511664 * z, 2 * 0.511664 * x, 2 * 0.429043 * x * y, 2 * 0.429043 * y * z, 0.743125 * z * z - 0.247708, 2 * 0.429043 * x * z, 0.429043 * (x * x - y * y)];
  const out = [0, 0, 0];
  for (let j = 0; j < 9; j += 1) for (let k = 0; k < 3; k += 1) out[k] += c[j][k] * w[j];
  return out;
}
const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// The sky's light and the ground's, apart, before they are scaled (each nine [r, g, b]).
//   top, horizon     the dome's colours (linear), as render-sky.js draws it
//   sun              the way to the sun (or the moon at night), [x, y, z], unit
//   glow             its colour (linear), and `aureole` how bright and how wide the sky round it is (0 to 1: wide at low sun)
//   ground           the ground's colour as lit (linear)
function parts({ top, horizon, sun, glow, aureole = 0.5, ground }) {
  const sky = Array.from({ length: 9 }, () => [0, 0, 0]), floor = Array.from({ length: 9 }, () => [0, 0, 0]);
  const b = new Array(9), wgt = (4 * Math.PI) / N;
  const sharp = 4 + 18 * (1 - aureole);               // the aureole's width: wide (4) at low sun, tighter (22) high
  for (const d of DIRS) {
    basis(d, b);
    if (d[1] >= 0) {
      const h = Math.min(1, Math.max(0, d[1] * 1.6 + 0.08));
      let c = mix(horizon, top, Math.pow(h, 0.62));
      const near = Math.max(0, d[0] * sun[0] + d[1] * sun[1] + d[2] * sun[2]);
      const lobe = (0.35 + 1.4 * aureole) * Math.pow(near, sharp);
      c = [c[0] + glow[0] * lobe, c[1] + glow[1] * lobe, c[2] + glow[2] * lobe];
      for (let j = 0; j < 9; j += 1) for (let k = 0; k < 3; k += 1) sky[j][k] += c[k] * b[j] * wgt;
    } else {
      // (the ground: a little brighter towards the sun's side, where it is lit)
      const lit = 0.75 + 0.25 * Math.max(0, d[0] * sun[0] + d[2] * sun[2]);
      for (let j = 0; j < 9; j += 1) for (let k = 0; k < 3; k += 1) floor[j][k] += ground[k] * lit * b[j] * wgt;
    }
  }
  return { sky, floor };
}

// The nine colours of the light from the whole sky, scaled, colour by colour, so that a surface facing straight up
// receives `up` (what the hemisphere light gave it, [r, g, b]: its sky colour times its strength) and one facing
// straight down receives `down` (its ground colour times its strength).
export function skyHarmonics(sky, { up, down }) {
  const { sky: s, floor: f } = parts(sky);
  const su = irradianceAt(s, [0, 1, 0]), sd = irradianceAt(s, [0, -1, 0]);
  const fu = irradianceAt(f, [0, 1, 0]), fd = irradianceAt(f, [0, -1, 0]);
  const a = [0, 0, 0], b = [0, 0, 0];
  for (let k = 0; k < 3; k += 1) {
    // a * su + b * fu = up, a * sd + b * fd = down (for this colour)
    const det = su[k] * fd[k] - fu[k] * sd[k];
    a[k] = det ? (up[k] * fd[k] - fu[k] * down[k]) / det : up[k] / Math.max(su[k], 1e-6);
    b[k] = det ? (su[k] * down[k] - sd[k] * up[k]) / det : 0;
    // (never less than nothing from either: then the sky alone, as bright as it should be from above)
    if (!(a[k] > 0) || !(b[k] >= 0)) { a[k] = up[k] / Math.max(su[k], 1e-6); b[k] = 0; }
  }
  return s.map((c, j) => [c[0] * a[0] + f[j][0] * b[0], c[1] * a[1] + f[j][1] * b[1], c[2] * a[2] + f[j][2] * b[2]]);
}
