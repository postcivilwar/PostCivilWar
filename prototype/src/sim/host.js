// Composition root: builds the ledger and the game simulation.
//
//   host.game     the zone's game server (intents in, views out)
//   host.bank     this world's side of the bank that keeps every player's TR (bank.js)
//   host.market   this world's side of sales made before the bank kept the money (market.js)
//
// There is no way here to make TR: no sandbox, no test funds, no door other than the game's own rules. (There
// was once a sandbox that turned test bitcoin into TR. It is gone, with its screen.)

import { createLedger } from './ledger.js';
import { createBankBridge } from './bank.js';
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
  const bank = createBankBridge({ state: game.state, auditor: ledger.auditor, ledger: ledger.gameplay, monetary: ledger.monetary, issuanceAccount: ledger.system.issuance, players: game.state.players });

  return {
    game,
    auditor: ledger.auditor,
    bank,                        // the bank's side of this world's money; where the world runs on a server, never exposed to a client
    market: game.market,         // sales made before the bank kept the money; the same
    tick(dtReal) { game.step(dtReal); },
    save() {
      return { version: SAVE_VERSION, savedAt: Date.now(), rng: rng.getState(), game: JSON.parse(JSON.stringify(game.state)), ledger: ledger.serialize() };
    },
  };
}
