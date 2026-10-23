// The game's lamps (the street lamps, a headlamp, the phone's torch, the glow of a phone's screen on its holder) in
// three.js's units since r155, from what they were in r128's: the brightness, the reach and the fall-off that light
// a surface as nearly as possible as they did, over the distances where each is seen. Prints them; main.js and
// phone-hold.js carry them (render-kit.js LIGHT for the sun and the sky's light, which only change by π).
//
//   node tools/three/fit-lights.mjs
//
// r128 ("legacy" lights): what a lamp of brightness I gives a surface d away, falling to nothing at its reach D:
//     I · (1 − d/D)^k                                         (the π of the light and the 1/π of the surface cancel)
// r186 (physical lights): with brightness I2, fall-off k2 and reach D2:
//     I2/π · 1/max(d^k2, 0.01) · (1 − (d/D2)^4)^2
// For each lamp the k2 and D2 are searched, and I2 worked out for each pair (least squares); kept: the pair with the
// smallest difference over the distances given (as a share of the lamp's brightest).
const old = (d, { I, D, k }) => (d < D ? I * Math.pow(1 - d / D, k) : 0);
const physical = (d, I2, k2, D2) => (I2 / Math.PI) * (1 / Math.max(Math.pow(d, k2), 0.01)) * Math.pow(Math.max(0, 1 - Math.pow(d / D2, 4)), 2);

export function fit(o, [near, far], step = 0.05) {
  const ds = [];
  for (let d = near; d <= far + 1e-9; d += step) ds.push(d);
  let best = null;
  for (let i = 0; i <= 200; i += 1) {
    const k2 = i / 100;
    for (let j = 0; j <= 480; j += 1) {
      const D2 = o.D * (0.6 + j / 400);
      let num = 0, den = 0;
      for (const d of ds) { const p = physical(d, 1, k2, D2); num += p * old(d, o); den += p * p; }
      if (!den) continue;
      const I2 = num / den;
      let err = 0, peak = 0, worst = 0;
      for (const d of ds) { const t = old(d, o), e = physical(d, I2, k2, D2) - t; err += e * e; peak = Math.max(peak, t); worst = Math.max(worst, Math.abs(e)); }
      const rms = Math.sqrt(err / ds.length) / peak;
      if (!best || rms < best.rms) best = { I2, k2, D2, rms, worst: worst / peak };
    }
  }
  return best;
}

export const LAMPS = {
  'street lamp (4.8 m up: the ground and the walls round it)': { I: 1.25, D: 30, k: 1.6, range: [3, 30] },
  'headlamp (a car 2.8, a motorcycle 2.2: the road ahead)': { I: 1, D: 38, k: 1.6, range: [1.5, 38] },
  'phone torch (the ground ahead, from the hand)': { I: 3.4, D: 30, k: 1.7, range: [0.8, 30] },
  'phone screen (its glow on the face and the hand)': { I: 1, D: 1.5, k: 2, range: [0.08, 1.5], step: 0.005 },
};

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const [name, o] of Object.entries(LAMPS)) {
    const b = fit(o, o.range, o.step);
    const at = [o.range[0], (o.range[0] + o.range[1]) / 4, (o.range[0] + o.range[1]) / 2, (o.range[0] + o.range[1]) * 0.75, o.range[1]];
    console.log(`${name}\n  r128: brightness ${o.I}, reach ${o.D} m, fall-off ${o.k}\n  r186: brightness ${b.I2.toFixed(3)} (×${(b.I2 / o.I).toFixed(3)}), reach ${b.D2.toFixed(2)} m, fall-off ${b.k2.toFixed(2)}; differs by ${(b.rms * 100).toFixed(1)}% on average, ${(b.worst * 100).toFixed(1)}% at most`);
    console.log(`  ${at.map((d) => `${d.toFixed(1)} m: ${old(d, o).toFixed(3)} → ${physical(d, b.I2, b.k2, b.D2).toFixed(3)}`).join('; ')}`);
  }
}
