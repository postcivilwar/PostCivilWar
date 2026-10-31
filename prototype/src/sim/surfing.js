// Surfing on the River Niger by the town (31 October 2026, stage 4 of the owner's brief of 30 October: "incorporate a
// realistic surf feature for certain characters in bikinis, and ensure heavy clothing users can't surf"; his answer at
// 22:01: "NOBODY SHould surf at the lagoon beach, only surf at the river by town").
//
// Whoever owns a surfboard (the sports mall's) and is dressed for the water (Adanna in her bikini, Ujunwa in her
// swimsuit: surf.js `maySurf`; anyone else is told what they wear will not do) takes it out from the water's edge where
// the waves come in, east of the jetty (surf.js `SURF`), or from the water there: lying on it, paddling. A wave coming up
// behind them as it stands up to break (surf.js `catchable`) they stand up on (`surf.stand`), and ride it in across its
// face, steered by leaning, as fast as such a wave carries a board; as it breaks into foam near the bank they go down
// onto the board again (`surf.fall`, or the town finds the wave gone from under them). Off the board (`moto.leave`):
// into the water, or onto the bank if it is close; the board goes with them. While on it, `astride` is 'sf:surfboard'
// (as for everything ridden: fights, doors and the police answer as for a motorcycle), and its steps go through the
// motorcycle's own intents (moto.drive).
//
// The waves are the town's (surf.js `wavesAt`): every copy of the town has the same at the same moment, by the town's
// clock in real seconds (`waveClock`), so two players see the same wave and may ride it together.
import { SURF, maySurf, inSurf, catchable, crestOf } from './surf.js';
import { zoneSwimmable, zoneWalkable, zoneShoreZ, zoneToWater, zoneGroundY } from './zone.js';
import { GameError } from './registry.js';

export const isSurfing = (astride) => astride === 'sf:surfboard';
export const SURFING = Object.freeze({
  reach: 6,            // metres from the water's edge a player may take a board out from the bank
  lie: 1.5,            // m/s at most lying on it, paddling (SURF.paddle)
  late: 0.6,           // seconds: a wave the page saw catchable this long ago may still be stood up on (the word takes time)
  ashore: 2.6,         // metres from the water's edge a surfer steps ashore rather than into the water
  facing: 1.2,         // radians: the board's way off straight in to the bank, at most, to stand up on a wave
});
// as fast as a board goes riding a wave: carried in with it, and across its face
const RIDE_TOP = Math.hypot(SURF.speed, SURF.ride);

export function createSurfing({ state, hub = {}, waveClock }) {
  const owns = (p) => Array.isArray(p.sports) && p.sports.includes('surfboard');
  const able = (p) => !p.dead && !p.down && !p.carried && !p.custody && !p.driving && (p.riding === null || p.riding === undefined) && !p.incar;

  // Out on it: from the bank within reach of the water where the waves come in, or from the water there.
  function out(p) {
    const may = maySurf(p.look, owns(p));
    if (!may.ok) throw new GameError(may.code, may.message);
    if (p.fight) throw new GameError('FIGHTING', 'Not in the middle of a fight.');
    if (!able(p) || (p.astride !== null && p.astride !== undefined)) throw new GameError('NOT_ON_FOOT', 'You cannot take your surfboard out now.');
    let at = null;
    if (p.swimming) {
      if (!inSurf(p.x, p.z)) throw new GameError('NO_WAVES', 'The waves come in along the town\'s bank east of the jetty. Swim there to surf.');
      at = { x: p.x, z: p.z };
    } else {
      const toWater = zoneToWater(p.x, p.z);
      if (toWater > SURFING.reach || zoneGroundY(p.x, p.z) > 0.5) throw new GameError('TOO_FAR', 'Walk down to the water where the waves come in, east of the jetty, to surf.');
      // straight out from the bank, into water where the waves come in
      for (let d = Math.max(0, toWater) + 1.2; d < toWater + 7; d += 0.4) { const z = p.z + d; if (zoneSwimmable(p.x, z) && inSurf(p.x, z)) { at = { x: p.x, z }; break; } }
      if (!at) throw new GameError('NO_WAVES', 'The waves come in along the town\'s bank east of the jetty: surf there.');
    }
    p.swimming = null;
    p.astride = 'sf:surfboard';
    p.psurf = { x: at.x, z: at.z, h: 0, mode: 'lie', wave: null, since: state.real, movedAt: state.real, ride: null };
    p.x = at.x; p.z = at.z; p.heading = 0; p.lastMoveAt = state.real;
    p.stats.surfs = (p.stats.surfs || 0) + 1;
    return { x: at.x, z: at.z, h: 0 };
  }

  // Up on it, on a wave coming up behind them as it stands up to break (or one the page saw so a moment ago).
  function stand(p) {
    const b = p.psurf;
    if (!isSurfing(p.astride) || !b) throw new GameError('NOT_SURFING', 'You are not on your surfboard.');
    if (b.mode === 'ride') return { wave: b.wave };
    // (a wave is caught going in with it: the board turned toward the bank, more or less)
    let off = (b.h - Math.PI) % (Math.PI * 2); if (off > Math.PI) off -= Math.PI * 2; if (off < -Math.PI) off += Math.PI * 2;
    if (Math.abs(off) > SURFING.facing) throw new GameError('NOT_FACING', 'Turn the board to face the bank first: a wave is caught going in with it.');
    const t = waveClock();
    const w = catchable(b.x, b.z, t) || catchable(b.x, b.z, t - SURFING.late);
    if (!w) throw new GameError('NO_WAVE', 'No wave to stand up on yet: wait for one coming up behind you, the board turned to the bank.');
    b.mode = 'ride'; b.wave = w.wave; b.since = state.real;
    p.stats.waves = (p.stats.waves || 0) + 1;
    return { wave: w.wave };
  }
  // Down onto the board again: the wave gone from under them, or broken over them.
  function fall(p) {
    const b = p.psurf;
    if (!isSurfing(p.astride) || !b) throw new GameError('NOT_SURFING', 'You are not on your surfboard.');
    b.mode = 'lie'; b.wave = null; b.since = state.real;
    return {};
  }

  // A step on it, as the player's page moved it: no further than it goes lying on it, or riding a wave; only on the water
  // where the waves come in. Riding, the wave must still be under them: once it has gone on, or into foam, they are down
  // on the board again.
  const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : 0; };
  function drive(p, { x, z, heading, ...step }) {
    if (![x, z, heading].every(Number.isFinite)) throw new GameError('BAD_MOVE', 'Invalid position.');
    const b = p.psurf;
    if (!isSurfing(p.astride) || !b) throw new GameError('NOT_SURFING', 'You are not on your surfboard.');
    const gap = Math.hypot(x - b.x, z - b.z);
    const elapsed = Math.min(1, state.real - p.lastMoveAt);
    const top = b.mode === 'ride' ? RIDE_TOP + 0.6 : SURFING.lie * 1.5;
    if (gap > top * (elapsed + 0.12) * 1.25 + 0.05) throw new GameError('TOO_FAST', 'Movement rejected.');
    if (!zoneSwimmable(x, z) || !inSurf(x, z)) throw new GameError('BLOCKED', 'Movement rejected.');
    if (b.mode === 'ride') {
      const crest = crestOf(b.wave, x, waveClock());
      // (the crest behind the board, out on the river, by no more than the wave is wide; or the wave gone)
      if (crest === null || crest - z < -1.5 || crest - z > SURF.wide) { b.mode = 'lie'; b.wave = null; b.since = state.real; }
    }
    b.x = x; b.z = z; b.h = heading; b.movedAt = state.real;
    b.ride = { speed: Math.round(num(step.speed, 0, RIDE_TOP + 1) * 10) / 10, lean: Math.round(num(step.lean, -0.6, 0.6) * 100) / 100, phase: Math.round(num(step.phase, 0, 7) * 100) / 100 };
    p.x = x; p.z = z; p.heading = heading; p.lastMoveAt = state.real;
    p.stats.surfed = (p.stats.surfed || 0) + gap;
    return { mode: b.mode };
  }

  // Off the board: onto the bank if it is close, otherwise into the water; the board goes with them.
  function leave(p) {
    const b = p.psurf;
    if (!isSurfing(p.astride) || !b) throw new GameError('NOT_SURFING', 'You are not on your surfboard.');
    let to = null;
    if (-zoneToWater(b.x, b.z) <= SURFING.ashore) {
      for (const dx of [0, 1, -1, 2, -2]) { for (let d = 0.9; d < 3.5; d += 0.3) { const x = b.x + dx, z = zoneShoreZ(x) - d; if (zoneWalkable(x, z)) { to = { x, z, into: 'land' }; break; } } if (to) break; }
    }
    if (!to) to = { x: b.x, z: b.z, into: 'water' };
    p.astride = null; p.psurf = null;
    p.x = to.x; p.z = to.z; p.lastMoveAt = state.real;
    if (to.into === 'water') p.swimming = { since: state.real }; else p.heading = Math.PI;
    return { x: to.x, z: to.z, into: to.into };
  }
  // Taken off it (by the police, or carried off hurt): into the water where they are, or ashore.
  function unseat(p) { if (isSurfing(p.astride) && p.psurf) leave(p); }

  // What the page is told of its surfer: lying or riding, and which wave
  const selfView = (p) => (isSurfing(p.astride) && p.psurf ? { mode: p.psurf.mode, wave: p.psurf.wave } : null);

  const api = { out, stand, fall, drive, leave, unseat, selfView };
  hub.surfing = api;
  return api;
}
