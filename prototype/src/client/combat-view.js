// Fighting and taking a vehicle, as they are seen.
//
// The simulation says what happened: who swung, with what, whether it landed
// or was blocked. This turns that into movement of the figures, layered over
// their ordinary walking and standing. There is no blood and nobody is shown
// injured: a blow lands, the one struck flinches, and that is all.

// seconds each movement takes
export const STRIKES = Object.freeze({ punch: 0.3, heavy: 0.55, kick: 0.5, shove: 0.4, grab: 0.65, dodge: 0.42, flinch: 0.32, miss: 0.3, block: 0.25 });

const out = (t) => Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
const mix = (a, b, k) => a + (b - a) * k;

// Begins a movement on a figure. `clock` is the page's own clock in seconds.
export function startStrike(rig, kind, clock) {
  if (!rig || !STRIKES[kind]) return;
  // a flinch does not cut short a blow already on its way out
  if (kind === 'flinch' && rig.strike && clock - rig.strike.at < rig.strike.dur * 0.6 && rig.strike.kind !== 'flinch') return;
  rig.strike = { kind, at: clock, dur: STRIKES[kind] };
  // a supplied figure shows it with its own clip for it where its file has one (animated.js), by hand otherwise
  if (rig.animated && rig.react) rig.react(kind === 'flinch' ? 'hit' : kind === 'miss' ? 'punch' : kind, { length: STRIKES[kind] });
}

// Poses a figure that is in a fight. Call it after the ordinary animation each frame.
//   guard  hands up, ready
//   block  forearms across the face
export function poseFighter(rig, clock, { guard = false, block = false } = {}) {
  if (!rig) return;
  const L = rig.armL, R = rig.armR, T = rig.torso.rotation, H = rig.head.group.rotation;
  if (guard || block) {
    const up = block ? -1.38 : -0.95, bend = block ? -2.15 : -1.75;
    L.shoulder.rotation.x = up; R.shoulder.rotation.x = up + 0.08;
    L.elbow.rotation.x = bend; R.elbow.rotation.x = bend;
    T.x = (T.x || 0) + (block ? 0.12 : 0.06);
  }
  const s = rig.strike;
  if (!s) return;
  const t = (clock - s.at) / s.dur;
  if (t >= 1 || t < 0) { rig.strike = null; return; }
  const k = out(t);
  if (s.kind === 'punch' || s.kind === 'miss') {
    R.shoulder.rotation.x = mix(R.shoulder.rotation.x, -1.6, k);
    R.elbow.rotation.x = mix(R.elbow.rotation.x, -0.05, k);
    T.y = -0.3 * k;
    if (s.kind === 'miss') T.x += 0.12 * k;
  } else if (s.kind === 'heavy') {
    // drawn back, then thrown, then recovered
    if (t < 0.35) { const w = t / 0.35; R.shoulder.rotation.x = mix(R.shoulder.rotation.x, -0.15, w); R.elbow.rotation.x = -1.9; T.y = 0.45 * w; } else {
      const thrown = Math.sin(Math.PI * 0.5 * Math.min(1, (t - 0.35) / 0.3));
      const back = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      R.shoulder.rotation.x = mix(-0.15, -1.65, thrown * back); R.elbow.rotation.x = mix(-1.9, 0, thrown * back);
      T.y = mix(0.45, -0.55, thrown) * back; T.x += 0.1 * thrown * back;
    }
  } else if (s.kind === 'kick') {
    rig.legR.hip.rotation.x = -1.3 * k;
    rig.legR.knee.rotation.x = 0.9 * Math.sin(Math.PI * Math.min(1, t * 2)) * (1 - k * 0.7);
    rig.legR.foot.rotation.x = 0.3 * k;
    T.x -= 0.18 * k;
  } else if (s.kind === 'shove') {
    L.shoulder.rotation.x = mix(L.shoulder.rotation.x, -1.5, k); R.shoulder.rotation.x = mix(R.shoulder.rotation.x, -1.5, k);
    L.elbow.rotation.x = mix(L.elbow.rotation.x, -0.15, k); R.elbow.rotation.x = mix(R.elbow.rotation.x, -0.15, k);
    T.x += 0.22 * k;
  } else if (s.kind === 'grab') {
    const hold = t < 0.25 ? t / 0.25 : t > 0.8 ? (1 - t) / 0.2 : 1;
    L.shoulder.rotation.x = mix(L.shoulder.rotation.x, -1.25, hold); R.shoulder.rotation.x = mix(R.shoulder.rotation.x, -1.25, hold);
    L.elbow.rotation.x = mix(L.elbow.rotation.x, -0.7, hold); R.elbow.rotation.x = mix(R.elbow.rotation.x, -0.7, hold);
    T.x += 0.15 * hold;
  } else if (s.kind === 'dodge') {
    T.x += 0.4 * k;
    for (const leg of [rig.legL, rig.legR]) { leg.hip.rotation.x = -0.55 * k; leg.knee.rotation.x = 1.0 * k; }
    rig.group.position.y -= 0.16 * k * (rig.scale || 1);
  } else if (s.kind === 'flinch') {
    T.x -= 0.28 * k; H.x = -0.25 * k; T.y = 0.12 * k;
  } else if (s.kind === 'block') {
    T.x -= 0.08 * k;
  }
}

// A figure taking a vehicle: a hand to the door or the rider, the pull, the climb in.
export function poseTaking(rig, step, progress) {
  if (!rig) return;
  const L = rig.armL, R = rig.armR, T = rig.torso.rotation;
  if (step === 'reach' || step === 'door') { R.shoulder.rotation.x = -1.35; R.elbow.rotation.x = -0.25; T.x = 0.12; } else if (step === 'pull') {
    const tug = 0.5 + 0.5 * Math.sin(progress * 40);
    L.shoulder.rotation.x = -1.2; R.shoulder.rotation.x = -1.2; L.elbow.rotation.x = -0.9 - tug * 0.4; R.elbow.rotation.x = -0.9 - tug * 0.4; T.x = 0.05 - tug * 0.12; T.y = 0.25 * tug;
  } else { rig.legR.hip.rotation.x = -1.1; rig.legR.knee.rotation.x = 1.0; L.shoulder.rotation.x = -1.0; R.shoulder.rotation.x = -1.0; L.elbow.rotation.x = -0.6; R.elbow.rotation.x = -0.6; T.x = 0.2; }
}

// What a blow reported by the simulation sounds like.
export const soundOf = (event) => (!event.hit ? (event.kind === 'dodge' ? null : 'miss') : event.blocked ? 'block' : event.kind === 'shove' ? 'shove' : event.kind === 'heavy' ? 'heavy' : event.kind === 'kick' ? 'kick' : event.kind === 'grab' ? null : 'punch');
