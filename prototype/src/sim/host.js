// Composition root: builds the ledger, the game simulation and the settlement
// service, and keeps them apart.
//
// The host exposes two separate front doors, as the deployed system does:
//   host.game        the zone's game server (intents in, views out)
//   host.settlement  the settlement portal, a different service entirely
// The only thing the two share is the ledger, and each holds a different
// handle to it with different rights.

import { createLedger } from './ledger.js';
import { createSettlement, SettlementError } from './settlement.js';
import { createGameSim } from './sim.js';
import { makeRng } from './rng.js';

export const SAVE_VERSION = 4;

export function createHost({ seed = 20261006, saved = null } = {}) {
  const usable = saved && saved.version === SAVE_VERSION ? saved : null;
  const rng = makeRng(seed);
  if (usable) rng.setState(usable.rng);
  const ledger = createLedger(usable ? usable.ledger : null);
  const game = createGameSim({ ledger: ledger.gameplay, monetary: ledger.monetary, issuanceAccount: ledger.system.issuance, rng, saved: usable ? usable.game : null });
  ledger.setClock(() => Math.round(game.state.t));
  const settlementRng = makeRng(seed ^ 0x5bd1e995);
  if (usable) settlementRng.setState(usable.settlementRng);
  const settlement = createSettlement({ ledger, rng: settlementRng, saved: usable ? usable.settlement : null });

  // The portal authenticates a player and forwards to the settlement service.
  function portal(playerId, method, args = {}) {
    if (!game.hasPlayer(playerId)) return { ok: false, code: 'NO_ACCOUNT', message: 'Unknown account.' };
    const calls = {
      summary: () => settlement.summary(playerId),
      faucet: () => settlement.faucet(playerId, args.sats),
      quote: () => settlement.quote(playerId, args.sats),
      convert: () => settlement.convert(playerId, args.quoteId),
      withdraw: () => settlement.requestWithdrawal(playerId, args.address, args.sats),
      redeem: () => settlement.requestRedemption(playerId, args.cowries),
    };
    if (!Object.prototype.hasOwnProperty.call(calls, method)) return { ok: false, code: 'UNKNOWN', message: 'Unknown request.' };
    try {
      return { ok: true, data: calls[method]() };
    } catch (error) {
      if (error instanceof SettlementError) return { ok: false, code: error.code, message: error.message };
      throw error;
    }
  }

  return {
    game,
    portal,
    auditor: ledger.auditor,
    settlementOps: settlement,   // operator-side functions; never exposed to a client
    market: game.market,         // the shared market's side of a sale; where the world runs on a server, never exposed to a client
    tick(dtReal) { game.step(dtReal); settlement.tick(dtReal); },
    save() {
      return { version: SAVE_VERSION, savedAt: Date.now(), rng: rng.getState(), settlementRng: settlementRng.getState(), game: JSON.parse(JSON.stringify(game.state)), ledger: ledger.serialize(), settlement: settlement.serialize() };
    },
  };
}
