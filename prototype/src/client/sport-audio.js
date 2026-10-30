// The sounds of riding the sports mall's things (31 October 2026), made as they are heard, with nothing recorded:
//   - the wheels on the road: a hiss and rumble that rises and grows with the speed; a skateboard's wheels lower and
//     rougher (with the knock of the road's joints), the skates' and the scooter's small hard wheels higher
//   - a bicycle's freewheel: ticking while it rolls and is not pedalled, quicker the faster it goes (a buzz at speed);
//     its chain, a soft whirr, while it is pedalled
//   - a skateboarder's foot: a scuff each time it goes down on the road to push, and a skater's each stride
//   - an electric motor (the e-scooter, the hoverboard, the electric unicycle): a whine that rises with the speed,
//     louder while it is driven
//
//   const sound = createSportSound(ctx, out, noise);   out: where it is played into; noise: a buffer of white noise
//   sound.set({ item, speed, throttle, phase, pushing }, now)   each frame; null for silence
//   sound.dispose()
import { SPORT_HANDLING } from '../sim/sport-ride.js';

// for each: the centre of the wheels' hiss (Hz), how loud at its top speed, a motor's lowest note and how far it climbs
export const SPORT_SOUNDS = Object.freeze({
  bicycle: Object.freeze({ roll: 520, level: 0.1, rough: 0.4 }),
  skateboard: Object.freeze({ roll: 300, level: 0.2, rough: 1, joints: 1.6 }),
  'inline-skates': Object.freeze({ roll: 1150, level: 0.12, rough: 0.5 }),
  'e-scooter': Object.freeze({ roll: 1300, level: 0.08, rough: 0.6, motor: 360, climb: 900 }),
  hoverboard: Object.freeze({ roll: 900, level: 0.07, rough: 0.5, motor: 520, climb: 700 }),
  'e-unicycle': Object.freeze({ roll: 640, level: 0.08, rough: 0.4, motor: 300, climb: 1000 }),
});

export function createSportSound(ctx, out, noise) {
  const roll = ctx.createBufferSource(); roll.buffer = noise; roll.loop = true;
  const band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 600; band.Q.value = 0.7;
  const rumble = ctx.createBiquadFilter(); rumble.type = 'lowpass'; rumble.frequency.value = 160;
  const rollGain = ctx.createGain(); rollGain.gain.value = 0;
  const rumbleGain = ctx.createGain(); rumbleGain.gain.value = 0;
  roll.connect(band); band.connect(rollGain); rollGain.connect(out);
  roll.connect(rumble); rumble.connect(rumbleGain); rumbleGain.connect(out);
  roll.start();
  // the motor: two tones a fifth apart, through a narrow band so that it sings rather than buzzes
  const whine = ctx.createOscillator(), whine2 = ctx.createOscillator();
  whine.type = 'sawtooth'; whine2.type = 'triangle';
  whine.frequency.value = 300; whine2.frequency.value = 450;
  const sing = ctx.createBiquadFilter(); sing.type = 'bandpass'; sing.Q.value = 2.5; sing.frequency.value = 600;
  const whineGain = ctx.createGain(); whineGain.gain.value = 0;
  whine.connect(sing); whine2.connect(sing); sing.connect(whineGain); whineGain.connect(out);
  whine.start(); whine2.start();
  // the chain: a soft whirr while pedalled
  const chain = ctx.createBiquadFilter(); chain.type = 'bandpass'; chain.frequency.value = 2400; chain.Q.value = 4;
  const chainGain = ctx.createGain(); chainGain.gain.value = 0;
  roll.connect(chain); chain.connect(chainGain); chainGain.connect(out);
  let tickAt = 0, lastPhase = 0, jointAt = 0;
  const stats = { ticks: 0, scuffs: 0, joints: 0 };

  // one short burst of noise: a click of the freewheel, a knock of a joint in the road, the scuff of a foot
  function burst(t, { freq, q = 1, level, length, type = 'bandpass' }) {
    const src = ctx.createBufferSource(); src.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(level, t + Math.min(0.01, length / 4)); g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t, Math.random() * Math.max(0, noise.duration - length - 0.05)); src.stop(t + length + 0.02);
  }

  function set(s, now) {
    const kind = s ? SPORT_SOUNDS[s.item] : null;
    const h = s ? SPORT_HANDLING[s.item] : null;
    if (!kind || !h) {
      for (const g of [rollGain, rumbleGain, whineGain, chainGain]) g.gain.setTargetAtTime(0, now, 0.15);
      return;
    }
    const speed = Math.abs(s.speed || 0), share = Math.min(1, speed / h.top);
    // the wheels on the road
    band.frequency.setTargetAtTime(kind.roll * (0.7 + share * 0.8), now, 0.1);
    rollGain.gain.setTargetAtTime(speed > 0.15 ? kind.level * (0.25 + 0.75 * share) : 0, now, 0.12);
    rumbleGain.gain.setTargetAtTime(speed > 0.15 ? kind.level * kind.rough * 1.6 * Math.min(1, share * 1.5) : 0, now, 0.12);
    // the motor
    if (kind.motor) {
      const f = kind.motor + kind.climb * share;
      whine.frequency.setTargetAtTime(f, now, 0.08); whine2.frequency.setTargetAtTime(f * 1.5, now, 0.08);
      sing.frequency.setTargetAtTime(f * 1.8, now, 0.1);
      whineGain.gain.setTargetAtTime(speed > 0.1 || (s.throttle || 0) > 0 ? 0.012 + 0.03 * share + 0.02 * (s.throttle || 0) : 0, now, 0.1);
    } else whineGain.gain.setTargetAtTime(0, now, 0.1);
    // the bicycle's chain while pedalled; its freewheel ticking while it rolls and is not
    const pedalled = s.item === 'bicycle' && (s.throttle || 0) > 0 && speed > 0.3;
    chainGain.gain.setTargetAtTime(pedalled ? 0.01 + 0.025 * share : 0, now, 0.1);
    if (s.item === 'bicycle' && !pedalled && speed > 0.6) {
      const rate = Math.min(45, speed * 9);
      if (now >= tickAt) { burst(now + 0.005, { freq: 5200, q: 6, level: 0.05, length: 0.012 }); tickAt = now + 1 / rate; stats.ticks += 1; }
    }
    // a skateboard over the joints of the road, now and then
    if (kind.joints && speed > 1 && now >= jointAt) { burst(now + 0.005, { freq: 140, q: 1.5, level: 0.12 * Math.min(1, share * 1.4), length: 0.07, type: 'lowpass' }); jointAt = now + kind.joints * (0.8 + Math.random() * 0.6) * Math.max(0.4, 3 / Math.max(1, speed)); stats.joints += 1; }
    // a foot down on the road to push, or a skate's stride: a scuff as each begins
    if (h.drive === 'push' || h.drive === 'stride') {
      const p = s.phase || 0;
      const began = Math.floor(p) !== Math.floor(lastPhase) || (lastPhase % 1 < 1e-6 && p % 1 > 1e-6);
      if (began && p % 1 > 1e-6) { burst(now + 0.01, { freq: h.drive === 'push' ? 900 : 1600, q: 0.8, level: h.drive === 'push' ? 0.09 : 0.05, length: h.drive === 'push' ? 0.3 : 0.18 }); stats.scuffs += 1; }
      lastPhase = p;
    }
  }

  function dispose() {
    for (const n of [roll, whine, whine2]) { try { n.stop(); } catch (error) { /* already stopped */ } }
    for (const n of [roll, band, rumble, rollGain, rumbleGain, whine, whine2, sing, whineGain, chain, chainGain]) { try { n.disconnect(); } catch (error) { /* already gone */ } }
  }

  return { set, dispose, stats };
}
