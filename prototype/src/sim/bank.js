// The bridge between this world's money and the bank.
//
// A player's TR is kept by the bank (the server: api/_lib/wallet.js). It is the bank's figure that is theirs:
// what they can send to another player or pay in the market is what the bank says they have. The town itself
// still runs here, in this world, with its own ledger: a wage is paid here, a fare is spent here. So the two
// are kept in step, by three things, each of which is safe to ask for again:
//
//   report    what this character has earned and spent in town since the bank was last told, by what each
//             thing was: lawful earnings, what was taken from someone, charges and the cost of living, what
//             was handed back, and what was paid for things to own (funds.js says which is which, from the
//             ledger's own record). It goes to the bank with the character's next save, and the bank takes
//             it: earnings only as far as a person could have earned them, and things to own only out of TR
//             that was earned, never out of the arrival money.
//   told      the bank has taken a report: the next one starts where that one ended.
//   align     the wallet here is made to say what the bank says, plus whatever has happened in town since the
//             last report. TR that arrived from another player appears here; TR sent to one leaves. With
//             it comes what the bank says the wallet is made of (starter TR, and TR that was taken), and
//             this world's own count of that is set to the bank's.
//   figure    the bank has taken the fee for a character upgrade: the character here becomes the new one.
//
// The arrival money is not reported: the bank gave the account the same £20 itself, once. Nor is anything
// `align` moved, for the same reason: the bank already has it.
//
// This is not an intent. A player's own page calls it today because the simulation runs in the page; where the
// simulation runs on a server, the bank is that server's own and no client can call this.

import { LedgerError } from './ledger.js';
import { classOf } from './funds.js';

export function createBankBridge({ state, auditor, ledger, monetary, issuanceAccount, players, funds = null, setFigure = null }) {
  if (!state.bank) state.bank = { players: {} };
  const book = (id) => state.bank.players[id] || (state.bank.players[id] = { mark: 0, aligned: 0 });
  const text = (value) => (typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, 90) : '');

  function who(playerId) {
    const p = players[playerId];
    if (!p) throw new LedgerError('NL006', 'unknown player');
    return p;
  }

  // Everything that has moved in or out of this character's wallet in town since the bank was last told.
  //   in   { lawful, illicit }                 out   { cost, restitution, asset }
  // (`earned` and `spent` are the two sums, for anything that only wants to know how far the wallet has moved.)
  function report(playerId) {
    const p = who(playerId), b = book(playerId);
    const all = auditor.transactions();
    const into = { lawful: 0, illicit: 0 }, out = { cost: 0, restitution: 0, asset: 0 };
    for (let i = Math.min(b.mark, all.length); i < all.length; i += 1) {
      const txn = all[i];
      if (txn.key.startsWith('bank:') || txn.key === `arrival:${p.id}`) continue;
      for (const entry of txn.entries) {
        if (entry.account !== p.wallet) continue;
        const cls = classOf(txn, entry.amount);
        if (entry.amount > 0) { if (cls === 'illicit') into.illicit += entry.amount; else into.lawful += entry.amount; }
        else if (cls === 'restitution') out.restitution -= entry.amount;
        else if (cls === 'asset' || cls === 'upgrade') out.asset -= entry.amount;
        else out.cost -= entry.amount;
      }
    }
    return { v: 2, from: b.mark, upto: all.length, in: into, out, earned: into.lawful + into.illicit, spent: out.cost + out.restitution + out.asset };
  }

  // The bank has taken everything up to `upto`. (Or, for a character fetched from the account: this is how far
  // the bank has been told about it.)
  function told(playerId, upto) {
    who(playerId);
    if (Number.isSafeInteger(upto) && upto >= 0) book(playerId).mark = Math.min(upto, auditor.transactions().length);
    return book(playerId).mark;
  }

  // The wallet here is made to agree with the bank. Gives how much it moved by (nothing, when they agreed).
  // `parts` is what the bank says the wallet is made of: { starter, illicit } (the rest of it is earned).
  function align(playerId, bankBalance, why, parts = null) {
    const p = who(playerId), b = book(playerId);
    if (!Number.isSafeInteger(bankBalance) || bankBalance < 0) return { ok: false, code: 'BAD_REQUEST', message: 'That is not a balance.' };
    const since = report(playerId);
    const should = Math.max(0, bankBalance + since.earned - since.spent);
    const have = ledger.balance(p.wallet);
    const diff = should - have;
    const made = () => { if (funds && parts && typeof parts === 'object') funds.rebase(playerId, { balance: bankBalance, starter: parts.starter, illicit: parts.illicit }, b.mark); };
    if (diff === 0) { made(); return { ok: true, moved: 0, balance: have }; }
    b.aligned += 1;
    const reason = text(why) || (diff > 0 ? 'Brought in from the bank' : 'Taken to the bank');
    const legs = diff > 0 ? [{ account: issuanceAccount, amount: -diff }, { account: p.wallet, amount: diff }] : [{ account: p.wallet, amount: diff }, { account: issuanceAccount, amount: -diff }];
    monetary.post({ key: `bank:align:${p.id}:${b.aligned}:${auditor.transactions().length}`, kind: diff > 0 ? 'issuance' : 'retirement', initiator: 'ops:bank', reason, legs, meta: { bank: String(bankBalance) } });
    made();
    return { ok: true, moved: diff, balance: should };
  }

  // The bank has taken the fee for a character upgrade (or says which character the account's is): the
  // character here is that one. The fee itself reaches this wallet by `align`, as any movement at the bank does.
  function figure(playerId, to, paid = {}) {
    const p = who(playerId);
    if (!setFigure) return { ok: false, code: 'BAD_REQUEST', message: 'This world cannot change a character.' };
    if (p.look && p.look.figure === to) return { ok: true, changed: false, figure: to };
    try { setFigure(playerId, to, paid); } catch (error) { return { ok: false, code: error.code || 'BAD_REQUEST', message: error.message }; }
    return { ok: true, changed: true, figure: to };
  }

  const view = (playerId) => { const p = who(playerId); return { mark: book(playerId).mark, balance: ledger.balance(p.wallet) }; };

  return { report, told, align, figure, view };
}
