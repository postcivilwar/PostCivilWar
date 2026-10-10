// The bridge between this world's money and the shared market.
//
// Things are bought and sold in a market that every player shares (the server: see api/_lib/market.js). The
// market decides who owns what. Money is still each world's own, so a sale there is settled here, by the four
// movements below, each of which the ledger does once however often it is asked:
//
//   hold      before an offer is made, the amount is set aside from the wallet. An offer can only be made with
//             money that is really there, and money held cannot be spent on anything else meanwhile.
//   release   the offer came to nothing (refused, withdrawn, sold to someone else): the money goes back.
//   settle    the offer was accepted: the money leaves this world for the seller's. (If nothing was held, as
//             when a sale is found on a device that did not make the offer, it is paid from the wallet.)
//   credit    this player sold something: the buyer's money arrives.
//
// Money that leaves is retired here and money that arrives is issued here, so each world's ledger still sums
// to nothing; it is the market's record of the sale that ties the two together.
//
// This is not an intent. A player's own page calls it today because the simulation runs in the page; where the
// simulation runs on a server, the market service calls it and no client can.

import { LedgerError } from './ledger.js';

export const MARKET = Object.freeze({ holdsEach: 16, most: 2_000_000_000 });

const ID = /^[0-9a-f-]{8,64}$/;

export function createMarketBridge({ state, ledger, monetary, issuanceAccount, players }) {
  if (!state.market) state.market = { players: {} };
  const book = (id) => state.market.players[id] || (state.market.players[id] = { holds: {}, paid: {}, credited: {} });
  const escrow = (p) => ledger.openAccount('player', p.id, 'market_escrow');
  const fail = (code, message) => ({ ok: false, code, message });
  const good = (data) => ({ ok: true, ...data });
  const text = (value) => (typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, 80) : '') || 'something';
  const amountOk = (n) => Number.isSafeInteger(n) && n > 0 && n <= MARKET.most;

  function who(playerId) {
    const p = players[playerId];
    if (!p) throw new LedgerError('NL006', 'unknown player');
    return p;
  }

  function hold(playerId, { offerId, amount, what }) {
    const p = who(playerId), b = book(playerId);
    if (!ID.test(String(offerId)) || !amountOk(amount)) return fail('BAD_REQUEST', 'That is not an offer.');
    if (b.holds[offerId]) return b.holds[offerId].amount === amount ? good({ held: amount, replayed: true }) : fail('CONFLICT', 'That offer was made for a different amount.');
    if (Object.keys(b.holds).length >= MARKET.holdsEach) return fail('TOO_MANY', 'You have too many offers waiting. Withdraw one first.');
    if (ledger.balance(p.wallet) < amount) return fail('INSUFFICIENT', 'You do not have that much.');
    ledger.post({ key: `market-hold:${offerId}`, kind: 'transfer', initiator: `player:${p.id}`, reason: `Set aside for an offer: ${text(what)}`, legs: [{ account: p.wallet, amount: -amount }, { account: escrow(p), amount }], meta: { offer: String(offerId) } });
    b.holds[offerId] = { amount, what: text(what) };
    return good({ held: amount });
  }

  function release(playerId, offerId) {
    const p = who(playerId), b = book(playerId);
    const h = b.holds[offerId];
    if (!h) return good({ released: 0 });
    ledger.post({ key: `market-release:${offerId}`, kind: 'transfer', initiator: `player:${p.id}`, reason: `Offer came to nothing: ${h.what}`, legs: [{ account: escrow(p), amount: -h.amount }, { account: p.wallet, amount: h.amount }], meta: { offer: String(offerId) } });
    delete b.holds[offerId];
    return good({ released: h.amount });
  }

  // Pays for a sale the market has recorded. From what was held for that offer if anything was (and whatever
  // was held beyond the price comes back); otherwise from the wallet, and if the wallet is short, not at all:
  // the debt stands until there is enough.
  function settle(playerId, { saleId, offerId, amount, what }) {
    const p = who(playerId), b = book(playerId);
    if (!ID.test(String(saleId)) || !amountOk(amount)) return fail('BAD_REQUEST', 'That is not a sale.');
    if (b.paid[saleId]) return good({ paid: b.paid[saleId], replayed: true });
    const h = offerId ? b.holds[offerId] : null;
    const reason = `Bought: ${text(what)}`;
    if (h && h.amount >= amount) {
      const back = h.amount - amount;
      const legs = [{ account: escrow(p), amount: -h.amount }, { account: issuanceAccount, amount }];
      if (back > 0) legs.push({ account: p.wallet, amount: back });
      monetary.post({ key: `market-pay:${saleId}`, kind: 'retirement', initiator: 'ops:market', reason, legs, meta: { sale: String(saleId) } });
      delete b.holds[offerId];
    } else {
      if (h) release(playerId, offerId);
      if (ledger.balance(p.wallet) < amount) return fail('INSUFFICIENT', 'You do not have enough to pay for it yet.');
      monetary.post({ key: `market-pay:${saleId}`, kind: 'retirement', initiator: 'ops:market', reason, legs: [{ account: p.wallet, amount: -amount }, { account: issuanceAccount, amount }], meta: { sale: String(saleId) } });
    }
    b.paid[saleId] = amount;
    return good({ paid: amount });
  }

  function credit(playerId, { saleId, amount, what }) {
    const p = who(playerId), b = book(playerId);
    if (!ID.test(String(saleId)) || !amountOk(amount)) return fail('BAD_REQUEST', 'That is not a sale.');
    if (b.credited[saleId]) return good({ credited: b.credited[saleId], replayed: true });
    monetary.post({ key: `market-sale:${saleId}`, kind: 'issuance', initiator: 'ops:market', reason: `Sold: ${text(what)}`, legs: [{ account: issuanceAccount, amount: -amount }, { account: p.wallet, amount }], meta: { sale: String(saleId) } });
    b.credited[saleId] = amount;
    return good({ credited: amount });
  }

  // What the market is to be told with the next save, and what the Property page shows as set aside.
  function view(playerId) {
    const b = book(playerId);
    const holds = Object.entries(b.holds).map(([offerId, h]) => ({ offerId, amount: h.amount, what: h.what }));
    return { holds, held: holds.reduce((sum, h) => sum + h.amount, 0), paid: Object.keys(b.paid), credited: Object.keys(b.credited) };
  }

  return { hold, release, settle, credit, view };
}
