// Surfboards: ready for the board the owner will supply, and nothing more yet.
//
// No surfboard is in the game. There is nothing to own, nothing in the water and no button for it: SURFBOARDS is
// empty until the board's model is supplied, and nothing offers surfing while it is. What is here is what does
// not need the model, so that the board can be added without touching walking, swimming or the vehicles:
//
//   - who may surf: someone who owns a board, in the water, not in a fight or held (`maySurf`)
//   - how a board goes on the river: paddled up to speed, steered by leaning, slowed by the water, carried a
//     little by the current, and riding the surface (`stepSurfboard`), in the same units as everything else
//   - getting off: back to swimming where they are, or onto the bank if it is close (`leaveBoard`)
//
// The supplied figures already have a surfing pose of their own (surf.001 in the woman's, the man's and the
// athlete's files), which is what a rider will stand in. A board entry, when there is one:
//   id, name, model (the owner's file), length (metres), and anything in HANDLING it changes.

export const SURFBOARDS = Object.freeze({});

export const HANDLING = Object.freeze({
  paddle: 1.6,        // m/s² paddling, from lying on it
  top: 4.2,           // m/s: as fast as the river lets a board go here
  drag: 0.55,         // m/s² lost to the water with nothing driving it
  turn: 1.4,          // radians a second, leaning fully, at speed
  current: 0.35,      // m/s: the river carries a board downstream (+x on the site grid)
});

// May this player take a board out now? Gives the reason when not.
export function maySurf(player, { owns = false } = {}) {
  if (!owns) return { ok: false, code: 'NO_BOARD', message: 'You have no surfboard.' };
  if (!player || !player.swimming) return { ok: false, code: 'NOT_IN_WATER', message: 'Get into the river first.' };
  if (player.fight || player.down || player.dead || player.carried) return { ok: false, code: 'BUSY', message: 'Not now.' };
  return { ok: true };
}

// One step of a board on the water. state: { x, z, heading, speed, lean }; input: { paddle 0..1, steer -1..1,
// brake 0..1 }; `inWater(x, z)` says whether a point is water (zoneSwimmable).
export function stepSurfboard(state, input, dt, { handling = HANDLING, inWater = () => true } = {}) {
  const h = handling;
  const paddle = Math.max(0, Math.min(1, input.paddle || 0)), steer = Math.max(-1, Math.min(1, input.steer || 0)), brake = Math.max(0, Math.min(1, input.brake || 0));
  let v = state.speed + (paddle * h.paddle * (1 - state.speed / h.top) - h.drag * (0.3 + brake) * Math.sign(state.speed)) * dt;
  if (Math.abs(v) < 0.02 && !paddle) v = 0;
  v = Math.max(0, Math.min(h.top, v));
  state.lean += (steer * 0.35 - state.lean) * Math.min(1, dt * 3);
  state.heading -= (state.lean / 0.35) * h.turn * Math.min(1, v / 1.5) * dt;
  const nx = state.x + Math.sin(state.heading) * v * dt + h.current * dt, nz = state.z + Math.cos(state.heading) * v * dt;
  // a board goes only where there is water: at the bank it stops
  if (inWater(nx, nz)) { state.x = nx; state.z = nz; state.speed = v; } else state.speed = 0;
  return state;
}

// Off the board: swimming where they are, or standing on the bank if it is within a stroke or two.
export function leaveBoard(state, { toBank = () => Infinity } = {}) {
  return toBank(state.x, state.z) < 2.5 ? { mode: 'walking' } : { mode: 'swimming' };
}
