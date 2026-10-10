// Sandbox settlement service.
//
// This is the only module that knows bitcoin exists. It owns deposit
// addresses, the (simulated) chain, confirmations, conversion quotes, the
// withdrawal pipeline and the redemption gate. The game simulation never
// imports it and is never handed its ledger handle.
//
// SANDBOX ONLY. The "chain" here is a counter that mints blocks every few
// seconds. Addresses are made-up strings with a sandbox prefix. Nothing in
// this file can reach the Bitcoin network, and there are no keys.

import { LedgerError, trText } from './ledger.js';

export const SETTLEMENT_POLICY = Object.freeze({
  environment: 'sandbox',
  asset: 'TBTC',
  confirmationsRequired: 3,
  blockIntervalSeconds: 6,          // sandbox chain only
  cowriesPerSat: 0.5,               // platform-set conversion rate: ledger units per satoshi (two units are one TR, so 4 satoshis buy 1 TR). The field keeps its first name because saved quotes carry it.
  quoteLifetimeSeconds: 60,
  faucetLimitSats: 1_000_000,       // 0.01 tBTC per account, lifetime
  minWithdrawalSats: 10_000,
  withdrawalFeeSats: 1_000,
  networkFeeSats: 300,
  dailyWithdrawalLimitSats: 500_000,
  manualReviewAboveSats: 300_000,
  redemptionEnabled: false,         // game funds -> bitcoin stays off until authorised
  addressPrefix: 'sbx1q',           // not a Bitcoin address format on purpose
});

export class SettlementError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SettlementError';
    this.code = code;
  }
}

export function createSettlement({ ledger, rng, saved, policy = SETTLEMENT_POLICY }) {
  // `ledger` is the full ledger object; this service uses its settlement handle
  // and the system account ids. It never touches the gameplay handle.
  const books = ledger.settlement;
  const sys = ledger.system;
  const state = saved || {
    height: 100, sinceBlock: 0, seconds: 0, counter: 0,
    accounts: {}, chain: [], deposits: [], quotes: {}, withdrawals: [], redemptions: [], audit: [],
  };

  const nextId = (prefix) => { state.counter += 1; return `${prefix}-${String(state.counter).padStart(5, '0')}`; };
  const hex = (n) => { let s = ''; for (let i = 0; i < n; i += 1) s += '0123456789abcdef'[rng.int(16)]; return s; };
  const log = (actor, action, detail) => state.audit.push({ at: state.seconds, actor, action, detail });

  function account(ownerId) {
    let record = state.accounts[ownerId];
    if (!record) {
      record = state.accounts[ownerId] = {
        ownerId,
        address: policy.addressPrefix + hex(38),
        btcAccount: books.openAccount('player', ownerId, 'settlement', policy.asset),
        gameAccount: books.openAccount('player', ownerId, 'wallet', 'TR'),
        faucetUsed: 0, frozen: false, verification: 'sandbox',
      };
      log('system', 'account_opened', { ownerId });
    }
    return record;
  }

  function requireOpen(record) {
    if (record.frozen) throw new SettlementError('ACCOUNT_FROZEN', 'This settlement account is frozen pending review.');
  }

  // --- deposits -----------------------------------------------------------

  function faucet(ownerId, sats) {
    if (policy.environment !== 'sandbox') throw new SettlementError('NOT_SANDBOX', 'The faucet exists only in the sandbox.');
    const record = account(ownerId);
    if (!Number.isSafeInteger(sats) || sats <= 0) throw new SettlementError('INVALID_AMOUNT', 'Enter a whole number of satoshis.');
    if (record.faucetUsed + sats > policy.faucetLimitSats) {
      throw new SettlementError('FAUCET_LIMIT', 'The sandbox faucet limit for this account has been reached.');
    }
    record.faucetUsed += sats;
    const txid = hex(64);
    state.chain.push({ txid, vout: 0, address: record.address, sats, height: null, direction: 'in' });
    const deposit = { id: nextId('dep'), ownerId, txid, vout: 0, sats, confirmations: 0, status: 'seen', creditedTxn: null, seenAt: state.seconds };
    state.deposits.push(deposit);
    log('chain', 'deposit_seen', { deposit: deposit.id, txid });
    return { ...deposit };
  }

  function creditDeposit(deposit) {
    const record = account(deposit.ownerId);
    const result = books.post({
      key: `deposit:${policy.asset}:${deposit.txid}:${deposit.vout}`,
      kind: 'deposit', initiator: 'svc:settlement', reason: 'Confirmed test bitcoin deposit',
      legs: [{ account: sys.chainCustody, amount: -deposit.sats }, { account: record.btcAccount, amount: deposit.sats }],
      meta: { txid: deposit.txid, vout: deposit.vout, confirmations: deposit.confirmations },
    });
    deposit.status = 'credited';
    deposit.creditedTxn = result.id;
    log('svc:settlement', 'deposit_credited', { deposit: deposit.id, txn: result.id });
  }

  // --- conversion (bitcoin -> game funds) ---------------------------------

  function quote(ownerId, sats) {
    const record = account(ownerId);
    requireOpen(record);
    if (!Number.isSafeInteger(sats) || sats <= 0) throw new SettlementError('INVALID_AMOUNT', 'Enter a whole number of satoshis.');
    const cowries = Math.floor(sats * policy.cowriesPerSat);
    if (cowries < 1) throw new SettlementError('TOO_SMALL', 'That amount converts to less than half a TR.');
    const id = nextId('quote');
    state.quotes[id] = { id, ownerId, sats, cowries, rate: policy.cowriesPerSat, expiresAt: state.seconds + policy.quoteLifetimeSeconds, used: false };
    return { ...state.quotes[id] };
  }

  function convert(ownerId, quoteId) {
    const record = account(ownerId);
    requireOpen(record);
    const q = state.quotes[quoteId];
    if (!q || q.ownerId !== ownerId) throw new SettlementError('NO_QUOTE', 'That quote does not exist.');
    if (q.used) throw new SettlementError('QUOTE_USED', 'That quote has already been used.');
    if (state.seconds > q.expiresAt) throw new SettlementError('QUOTE_EXPIRED', 'That quote has expired. Ask for a new one.');
    let result;
    try {
      result = books.post({
        key: `conversion:${q.id}`, kind: 'conversion', initiator: 'svc:settlement', reason: 'Test bitcoin converted to TR',
        legs: [
          { account: record.btcAccount, amount: -q.sats }, { account: sys.conversionReserve, amount: q.sats },
          { account: sys.issuance, amount: -q.cowries }, { account: record.gameAccount, amount: q.cowries },
        ],
        meta: { quote: q.id, rate: q.rate },
      });
    } catch (error) {
      if (error instanceof LedgerError && error.code === 'NL001') {
        throw new SettlementError('INSUFFICIENT_BTC', 'There is not enough confirmed test bitcoin in this account.');
      }
      throw error;
    }
    q.used = true;
    log('svc:settlement', 'converted', { quote: q.id, txn: result.id });
    return { txn: result.id, sats: q.sats, cowries: q.cowries };
  }

  // --- withdrawals (bitcoin out) ------------------------------------------

  function withdrawnLastDay(ownerId) {
    const since = state.seconds - 86_400;
    return state.withdrawals
      .filter((w) => w.ownerId === ownerId && w.requestedAt >= since && !['rejected', 'failed'].includes(w.status))
      .reduce((sum, w) => sum + w.sats, 0);
  }

  function requestWithdrawal(ownerId, address, sats) {
    const record = account(ownerId);
    requireOpen(record);
    if (!Number.isSafeInteger(sats) || sats < policy.minWithdrawalSats) {
      throw new SettlementError('BELOW_MINIMUM', `The minimum withdrawal is ${policy.minWithdrawalSats} satoshis.`);
    }
    if (typeof address !== 'string' || !address.startsWith(policy.addressPrefix) || address.length < 20) {
      throw new SettlementError('BAD_ADDRESS', `Only sandbox addresses (starting ${policy.addressPrefix}) are accepted in this build.`);
    }
    if (address === record.address) throw new SettlementError('BAD_ADDRESS', 'That is this account\'s own deposit address.');
    if (withdrawnLastDay(ownerId) + sats > policy.dailyWithdrawalLimitSats) {
      throw new SettlementError('DAILY_LIMIT', 'That would exceed the daily withdrawal limit.');
    }
    const id = nextId('wd');
    const total = sats + policy.withdrawalFeeSats;
    try {
      books.post({
        key: `withdrawal_hold:${id}`, kind: 'withdrawal_hold', initiator: 'svc:settlement', reason: 'Withdrawal requested: funds held',
        legs: [{ account: record.btcAccount, amount: -total }, { account: sys.withdrawalPending, amount: total }],
        meta: { withdrawal: id },
      });
    } catch (error) {
      if (error instanceof LedgerError && error.code === 'NL001') {
        throw new SettlementError('INSUFFICIENT_BTC', 'There is not enough confirmed test bitcoin to cover the amount and the fee.');
      }
      throw error;
    }
    const withdrawal = {
      id, ownerId, address, sats, fee: policy.withdrawalFeeSats, requestedAt: state.seconds,
      status: sats > policy.manualReviewAboveSats ? 'manual_review' : 'approved',
      checks: [
        { name: 'address_format', passed: true }, { name: 'account_standing', passed: true },
        { name: 'daily_limit', passed: true }, { name: 'size_threshold', passed: sats <= policy.manualReviewAboveSats },
      ],
      txid: null, confirmations: 0, settledTxn: null,
    };
    state.withdrawals.push(withdrawal);
    log('svc:settlement', 'withdrawal_requested', { withdrawal: id, status: withdrawal.status });
    return { ...withdrawal };
  }

  function findWithdrawal(id) {
    const w = state.withdrawals.find((row) => row.id === id);
    if (!w) throw new SettlementError('NOT_FOUND', 'No such withdrawal.');
    return w;
  }

  function release(withdrawal, status, actor) {
    const record = account(withdrawal.ownerId);
    const total = withdrawal.sats + withdrawal.fee;
    books.post({
      key: `withdrawal_release:${withdrawal.id}`, kind: 'withdrawal_release', initiator: actor, reason: 'Withdrawal not sent: funds returned',
      legs: [{ account: sys.withdrawalPending, amount: -total }, { account: record.btcAccount, amount: total }],
      meta: { withdrawal: withdrawal.id },
    });
    withdrawal.status = status;
    log(actor, `withdrawal_${status}`, { withdrawal: withdrawal.id });
  }

  // A reviewer decides a withdrawal that the automatic checks held back.
  function reviewWithdrawal(id, decision, reviewer) {
    const w = findWithdrawal(id);
    if (w.status !== 'manual_review') throw new SettlementError('NOT_IN_REVIEW', 'That withdrawal is not waiting for review.');
    if (!reviewer) throw new SettlementError('NO_REVIEWER', 'A named reviewer is required.');
    if (decision === 'approve') { w.status = 'approved'; log(reviewer, 'withdrawal_approved', { withdrawal: id }); } else release(w, 'rejected', reviewer);
    return { ...w };
  }

  function broadcast(withdrawal) {
    // In production this step hands an unsigned transaction to a separate signer.
    withdrawal.txid = hex(64);
    withdrawal.status = 'broadcast';
    state.chain.push({ txid: withdrawal.txid, vout: 0, address: withdrawal.address, sats: withdrawal.sats, height: null, direction: 'out' });
    log('signer:sandbox', 'withdrawal_broadcast', { withdrawal: withdrawal.id, txid: withdrawal.txid });
  }

  function settle(withdrawal) {
    const total = withdrawal.sats + withdrawal.fee;
    const result = books.post({
      key: `withdrawal_settle:${withdrawal.id}`, kind: 'withdrawal_settle', initiator: 'svc:settlement', reason: 'Withdrawal confirmed on chain',
      legs: [
        { account: sys.withdrawalPending, amount: -total },
        { account: sys.chainCustody, amount: withdrawal.sats + policy.networkFeeSats },
        { account: sys.revenue, amount: withdrawal.fee - policy.networkFeeSats },
      ],
      meta: { withdrawal: withdrawal.id, txid: withdrawal.txid },
    });
    withdrawal.status = 'settled';
    withdrawal.settledTxn = result.id;
    log('svc:settlement', 'withdrawal_settled', { withdrawal: withdrawal.id, txn: result.id });
  }

  // --- redemption (game funds -> bitcoin): gated ---------------------------

  function requestRedemption(ownerId, cowries) {
    const record = account(ownerId);
    requireOpen(record);
    if (!policy.redemptionEnabled) {
      throw new SettlementError('REDEMPTION_DISABLED', 'TR cannot be redeemed for bitcoin in this build. The settlement layer has not authorised redemption.');
    }
    if (!Number.isSafeInteger(cowries) || cowries <= 0) throw new SettlementError('INVALID_AMOUNT', 'Enter an amount of TR.');
    // Only cowries that came in from bitcoin can go back out as bitcoin: never the arrival money or anything
    // else the game issued, which no reserve stands behind.
    const convertedIn = Object.values(state.quotes).filter((q) => q.ownerId === ownerId && q.used).reduce((sum, q) => sum + q.cowries, 0);
    const out = state.redemptions.filter((r) => r.ownerId === ownerId && r.status !== 'declined').reduce((sum, r) => sum + r.cowries, 0);
    if (cowries > convertedIn - out) throw new SettlementError('NOT_REDEEMABLE', `Only TR bought with test bitcoin can be redeemed; ${trText(Math.max(0, convertedIn - out))} is.`);
    const sats = Math.floor(cowries / policy.cowriesPerSat);
    if (sats < 1) throw new SettlementError('TOO_SMALL', 'That amount is worth less than one satoshi.');
    const id = nextId('red');
    try {
      books.post({
        key: `redemption_hold:${id}`, kind: 'redemption_hold', initiator: 'svc:settlement', reason: 'Redemption requested: TR held',
        legs: [{ account: record.gameAccount, amount: -cowries }, { account: sys.redemptionEscrow, amount: cowries }],
        meta: { redemption: id },
      });
    } catch (error) {
      if (error instanceof LedgerError && error.code === 'NL001') throw new SettlementError('INSUFFICIENT_FUNDS', 'There is not enough TR in the wallet.');
      throw error;
    }
    const redemption = { id, ownerId, cowries, sats, status: 'pending_authorisation', requestedAt: state.seconds, decidedBy: null, txn: null };
    state.redemptions.push(redemption);
    log('svc:settlement', 'redemption_requested', { redemption: id });
    return { ...redemption };
  }

  function decideRedemption(id, decision, officer) {
    const r = state.redemptions.find((row) => row.id === id);
    if (!r) throw new SettlementError('NOT_FOUND', 'No such redemption.');
    if (r.status !== 'pending_authorisation') throw new SettlementError('ALREADY_DECIDED', 'That redemption has already been decided.');
    if (!officer) throw new SettlementError('NO_REVIEWER', 'A named officer is required.');
    const record = account(r.ownerId);
    if (decision === 'authorise') {
      if (books.balance(sys.conversionReserve) < r.sats) {
        throw new SettlementError('RESERVE_SHORT', 'The conversion reserve does not cover this redemption.');
      }
      const result = books.post({
        key: `redemption:${r.id}`, kind: 'redemption', initiator: officer, reason: 'Redemption authorised by settlement',
        legs: [
          { account: sys.redemptionEscrow, amount: -r.cowries }, { account: sys.issuance, amount: r.cowries },
          { account: sys.conversionReserve, amount: -r.sats }, { account: record.btcAccount, amount: r.sats },
        ],
        meta: { redemption: r.id },
      });
      r.status = 'authorised'; r.txn = result.id;
    } else {
      books.post({
        key: `redemption_release:${r.id}`, kind: 'redemption_release', initiator: officer, reason: 'Redemption declined: TR returned',
        legs: [{ account: sys.redemptionEscrow, amount: -r.cowries }, { account: record.gameAccount, amount: r.cowries }],
        meta: { redemption: r.id },
      });
      r.status = 'declined';
    }
    r.decidedBy = officer;
    log(officer, `redemption_${r.status}`, { redemption: r.id });
    return { ...r };
  }

  // --- the sandbox chain --------------------------------------------------

  function mineBlock() {
    state.height += 1;
    for (const tx of state.chain) if (tx.height === null) tx.height = state.height;
    for (const deposit of state.deposits) {
      if (deposit.status === 'credited') continue;
      const tx = state.chain.find((row) => row.txid === deposit.txid);
      deposit.confirmations = tx.height === null ? 0 : state.height - tx.height + 1;
      deposit.status = deposit.confirmations > 0 ? 'confirming' : 'seen';
      if (deposit.confirmations >= policy.confirmationsRequired) creditDeposit(deposit);
    }
    for (const w of state.withdrawals) {
      if (w.status === 'approved') broadcast(w);
      else if (w.status === 'broadcast') {
        const tx = state.chain.find((row) => row.txid === w.txid);
        w.confirmations = tx.height === null ? 0 : state.height - tx.height + 1;
        if (w.confirmations >= policy.confirmationsRequired) settle(w);
      }
    }
  }

  function tick(seconds) {
    state.seconds += seconds;
    state.sinceBlock += seconds;
    while (state.sinceBlock >= policy.blockIntervalSeconds) {
      state.sinceBlock -= policy.blockIntervalSeconds;
      mineBlock();
    }
  }

  // What the chain says the operator's wallet holds, compared with the books.
  function proofOfReserves() {
    let onChain = 0;
    for (const tx of state.chain) {
      if (tx.height === null) continue;
      onChain += tx.direction === 'in' ? tx.sats : -(tx.sats + policy.networkFeeSats);
    }
    // Deposits seen but not yet credited are on chain and not yet on the books.
    const uncredited = state.deposits.filter((d) => d.status !== 'credited' && d.confirmations > 0).reduce((s, d) => s + d.sats, 0);
    // Withdrawals broadcast and mined but not yet settled have left the chain and not yet the books.
    const unsettled = state.withdrawals
      .filter((w) => w.status === 'broadcast' && state.chain.find((t) => t.txid === w.txid).height !== null)
      .reduce((s, w) => s + w.sats + policy.networkFeeSats, 0);
    const books_ = -ledger.auditor.balance(sys.chainCustody);
    return { onChain, books: books_, uncredited, unsettled, matches: onChain - uncredited + unsettled === books_ };
  }

  function summary(ownerId) {
    const record = account(ownerId);
    return {
      environment: policy.environment,
      asset: policy.asset,
      address: record.address,
      btcSats: books.balance(record.btcAccount),
      faucetRemaining: policy.faucetLimitSats - record.faucetUsed,
      height: state.height,
      confirmationsRequired: policy.confirmationsRequired,
      rate: policy.cowriesPerSat,
      redemptionEnabled: policy.redemptionEnabled,
      minWithdrawalSats: policy.minWithdrawalSats,
      withdrawalFeeSats: policy.withdrawalFeeSats,
      deposits: state.deposits.filter((d) => d.ownerId === ownerId).slice(-6).reverse().map((d) => ({ ...d })),
      withdrawals: state.withdrawals.filter((w) => w.ownerId === ownerId).slice(-6).reverse().map((w) => ({ ...w })),
      history: books.history(record.btcAccount, 8),
    };
  }

  return {
    policy, account, faucet, quote, convert, requestWithdrawal, reviewWithdrawal,
    requestRedemption, decideRedemption, tick, mineBlock, proofOfReserves, summary,
    auditLog: () => state.audit,
    serialize: () => JSON.parse(JSON.stringify(state)),
  };
}
