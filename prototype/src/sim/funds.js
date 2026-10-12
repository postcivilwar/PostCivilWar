// Where a player's TR came from, and what each kind of it may be spent on.
//
// Every character arrives with 2,000 TR: the £20 of the story. That is starter TR. It is there to begin with:
// it pays fines, the ambulance, the hospital, levies and permits, fares, food, fuel and the like. It is never
// another player's to have, and it never buys a thing to own: not land, not a vehicle, not what a building is
// made of. Those are bought with TR that was earned.
//
// So a wallet is three amounts, and every TR in it is one of them:
//
//   starter   the arrival money that is left
//   earned    wages and payments for work done; what was received from another player; what a sale brought
//   illicit   what was taken from someone (the game has theft, and it has police). It is spent as earned TR
//             is, and it is what is handed back first when the law catches up; it is never counted as starter
//             TR, and starter TR is never counted as it.
//
// "Eligible" TR is earned + illicit: what may be sent to another player or spent on something to own.
//
// What is drawn from when something is paid for, always the same way:
//
//   a charge or a cost of living   starter first, then earned, then illicit
//   something to own (an asset)    earned, then illicit; never starter: with too little of those it is refused
//   restitution                    illicit first (it is what was taken), then starter, then earned
//
// TR that passes from one player to another inside a town (a thief's takings, a constable's share of a fine, what
// is handed back to someone robbed) arrives as what it was when it left: starter TR that reaches another wallet
// is starter TR there too. Nothing that starts as arrival money becomes earned by changing hands.
//
// What a payment *is* is read from the ledger's own record of it (its key, kind and what it says it bought),
// never from anything a client says about it. The same rules are kept by the bank on the server
// (api/_lib/wallet.js), which is where they bind on the website: this file is the town's own keeping of them,
// so that the Lands Registry refuses a plot at the counter and not a save later.

import { GameError } from './registry.js';
import { trText } from './ledger.js';

export const FUND_CLASSES = Object.freeze(['starter', 'lawful', 'illicit', 'refund', 'fee', 'living', 'restitution', 'asset', 'upgrade', 'bank']);

// The words a player is given when starter TR is in the way. (The bank says the same things: api/_lib/wallet.js.)
export const FUND_WORDS = Object.freeze({
  asset: 'Starter TR cannot be used to buy assets. Earn TR through gameplay to make purchases.',
  transfer: 'Starter TR cannot be transferred. Earn TR through gameplay to send money to other players.',
  short: 'You do not have enough eligible TR for this transaction.',
});

const starts = (key, ...prefixes) => prefixes.some((prefix) => key.startsWith(prefix));

// What one movement in or out of a player's wallet is. `amount` is that wallet's side of it: more than nothing
// for TR coming in, less for TR going out.
export function classOf(txn, amount) {
  const key = String((txn && txn.key) || ''), kind = txn && txn.kind, meta = (txn && txn.meta) || {};
  if (starts(key, 'bank:')) return 'bank';               // the bank bringing this world's wallet into step with its own
  if (starts(key, 'arrival:')) return 'starter';
  if (amount > 0) {
    if (kind === 'theft' || starts(key, 'theft:')) return 'illicit';
    if (starts(key, 'market-release:')) return 'refund';
    return 'lawful';                                     // wages, delivery runs, a constable's share of a fine, a sale
  }
  if (starts(key, 'upgrade:')) return 'upgrade';        // a character upgrade: earned TR only, as for a thing to own
  if (kind === 'restitution' || starts(key, 'restitution:')) return 'restitution';
  if (kind === 'theft' || starts(key, 'theft:')) return 'taken';      // what a thief took from this wallet
  if (kind === 'fine' || kind === 'medical_fee' || kind === 'government_fee' || starts(key, 'fine:', 'ambulance:', 'permit:', 'repay:')) return 'fee';
  if (kind === 'land_purchase' || starts(key, 'land:', 'vehicle:', 'market-hold:', 'market-pay:')) return 'asset';
  if (starts(key, 'hire:', 'fuel:', 'okada:')) return 'living';
  if (kind === 'wage') return 'asset';                   // a mason paid to raise a stage of the player's own building
  if (kind === 'goods_purchase') {
    if (meta.service === 'treatment') return 'fee';
    if (meta.service || meta.item === 'meal') return 'living';
    return 'asset';                                      // blocks, cement, roofing, doors, paint: what a building is made of
  }
  return 'living';
}

const ORDER = Object.freeze({
  fee: ['starter', 'earned', 'illicit'], living: ['starter', 'earned', 'illicit'],
  restitution: ['illicit', 'starter', 'earned'],
  asset: ['earned', 'illicit', 'starter'],               // (starter last: only for what was bought before this rule, when it was let)
  upgrade: ['earned', 'illicit', 'starter'],
  taken: ['earned', 'illicit', 'starter'],
  bank: ['earned', 'illicit', 'starter'],
});

// One movement applied to { bal, starter, illicit }. Gives what was drawn from each: { starter, earned, illicit }.
export function applyFunds(f, cls, amount) {
  const drawn = { starter: 0, earned: 0, illicit: 0 };
  if (amount >= 0) {
    if (cls === 'starter') { f.starter += amount; drawn.starter = amount; } else if (cls === 'illicit') { f.illicit += amount; drawn.illicit = amount; } else drawn.earned = amount;
    f.bal += amount;
    return drawn;
  }
  let left = -amount;
  const have = { starter: f.starter, illicit: f.illicit, earned: Math.max(0, f.bal - f.starter - f.illicit) };
  for (const bucket of ORDER[cls] || ORDER.living) {
    const take = Math.min(left, have[bucket]);
    if (take) drawn[bucket] = -take;
    left -= take;
    if (bucket === 'starter') f.starter -= take; else if (bucket === 'illicit') f.illicit -= take;
  }
  f.bal += amount;
  // (a wallet that went below what it held is the ledger's to refuse, not this file's; nothing is left over here)
  if (f.starter + f.illicit > Math.max(0, f.bal)) { const over = f.starter + f.illicit - Math.max(0, f.bal); const s = Math.min(over, f.starter); f.starter -= s; f.illicit -= over - s; }
  return drawn;
}

export function createFunds({ state, ledger, auditor, players }) {
  if (!state.funds) state.funds = { players: {}, at: 0 };
  const F = state.funds;
  if (!Number.isSafeInteger(F.at)) { F.at = 0; F.players = {}; }      // (kept another way once: read again from the start)
  const book = F.players;
  let owner = new Map(), counted = -1;                   // wallet account -> player id
  const ownerOf = (account) => {
    const n = Object.keys(players).length;
    if (n !== counted) { owner = new Map(Object.keys(players).map((id) => [players[id].wallet, id])); counted = n; }
    return owner.get(account) || null;
  };
  const entry = (id) => book[id] || (book[id] = { bal: 0, starter: 0, illicit: 0 });

  // One movement in the ledger, taken into the count. What leaves a player's wallet is drawn in the order its
  // kind says; what reaches a player's wallet from another player's is what it was when it left.
  function settle(txn, into = entry, only = null) {
    const paid = { starter: 0, earned: 0, illicit: 0 };
    let fromPlayers = 0;
    for (const e of txn.entries) {
      if (!(e.amount < 0)) continue;
      const id = ownerOf(e.account);
      if (!id) continue;
      if (only && id !== only) { fromPlayers += -e.amount; paid.earned += -e.amount; continue; }
      const drawn = applyFunds(into(id), classOf(txn, e.amount), e.amount);
      paid.starter -= drawn.starter; paid.earned -= drawn.earned; paid.illicit -= drawn.illicit; fromPlayers += -e.amount;
    }
    for (const e of txn.entries) {
      if (!(e.amount > 0)) continue;
      const id = ownerOf(e.account);
      if (!id || (only && id !== only)) continue;
      const cls = classOf(txn, e.amount), f = into(id);
      if (fromPlayers > 0 && cls !== 'bank' && cls !== 'starter') {
        // a player paid this: the starter part of what they paid stays starter (rounded towards starter)
        const starter = Math.min(e.amount, Math.ceil((e.amount * paid.starter) / fromPlayers));
        const rest = e.amount - starter;
        const illicit = cls === 'illicit' ? rest : Math.min(rest, Math.floor((e.amount * paid.illicit) / fromPlayers));
        f.starter += starter; f.illicit += illicit; f.bal += e.amount;
      } else applyFunds(f, cls, e.amount);
    }
  }

  // Everything the ledger has written is in the count. A world from before this was kept has its whole
  // history read: arrival money is starter TR, and each thing since is what it was.
  function sync() {
    const all = auditor.transactions();
    for (; F.at < all.length; F.at += 1) settle(all[F.at]);
  }

  // A player's three amounts, as of the last thing the ledger wrote.
  function of(playerId) {
    const p = players[playerId];
    if (!p) return null;
    sync();
    const f = entry(playerId);
    const bal = ledger.balance(p.wallet);
    if (f.bal !== bal) { f.bal = bal; if (f.starter + f.illicit > bal) { const over = f.starter + f.illicit - bal; const s = Math.min(over, f.starter); f.starter -= s; f.illicit -= over - s; } }
    return f;
  }

  // What a player's wallet is made of: { total, starter, earned, illicit, eligible }, in ledger units.
  function split(playerId) {
    const f = of(playerId);
    if (!f) return { total: 0, starter: 0, earned: 0, illicit: 0, eligible: 0 };
    return { total: f.bal, starter: f.starter, earned: f.bal - f.starter - f.illicit, illicit: f.illicit, eligible: f.bal - f.starter };
  }

  // May this be paid for? Nothing to say if it may; a GameError that tells the player the actual reason if not.
  // (A wallet with too little in it altogether is left to the ledger, which says so in its own words.)
  function mayPay(playerId, amount, cls) {
    if (cls !== 'asset' && cls !== 'upgrade') return;
    const now = split(playerId);
    if (now.total < amount || now.eligible >= amount) return;
    if (now.eligible <= 0) throw new GameError('STARTER_FUNDS', FUND_WORDS.asset);
    throw new GameError('ELIGIBLE_FUNDS', `${FUND_WORDS.short} It is ${trText(amount)}, and ${trText(now.eligible)} of what you have is TR you have earned. ${FUND_WORDS.asset}`);
  }

  // A ledger handle that asks first. Every part of the town that takes TR from a player pays through one of these.
  function guard(handle) {
    return Object.freeze({
      ...handle,
      post(request) {
        const legs = request && Array.isArray(request.legs) ? request.legs : [];
        for (const leg of legs) {
          if (!leg || !(leg.amount < 0)) continue;
          const id = ownerOf(leg.account);
          if (id) mayPay(id, -leg.amount, classOf(request, leg.amount));
        }
        return handle.post(request);
      },
    });
  }

  // The bank has said what the wallet is made of (as far as it has been told: everything before `mark` in this
  // world's ledger). What has happened in town since is put on top of that, in the order it happened.
  function rebase(playerId, bank, mark) {
    const p = players[playerId];
    if (!p || !bank || !Number.isSafeInteger(bank.balance) || bank.balance < 0) return null;
    sync();
    const starter = Number.isSafeInteger(bank.starter) && bank.starter >= 0 ? Math.min(bank.starter, bank.balance) : 0;
    const illicit = Number.isSafeInteger(bank.illicit) && bank.illicit >= 0 ? Math.min(bank.illicit, bank.balance - starter) : 0;
    const all = auditor.transactions();
    const f = { bal: bank.balance, starter, illicit };
    for (let i = Math.max(0, Math.min(Number.isSafeInteger(mark) ? mark : all.length, all.length)); i < all.length; i += 1) {
      const txn = all[i];
      // (the bringing-into-step itself, and the arrival money, which the bank gave the account itself: its figures already hold both)
      if (classOf(txn, 1) === 'bank' || classOf(txn, 1) === 'starter') continue;
      settle(txn, () => f, playerId);
    }
    book[playerId] = f;
    return of(playerId);
  }

  return { of, split, mayPay, guard, rebase, classOf };
}
