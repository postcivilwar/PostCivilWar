// The wallet, from the player's side: what the Wallet app asks the bank, and the keeping of this world's money
// in line with the bank's figure.
//
// A player's TR is the bank's to say (api/_lib/wallet.js). This file never decides a balance: it asks, and
// shows what it is told. After every answer that carries a balance, the wallet in this world's own ledger is
// made to agree with it (sim/bank.js), so that the money on screen in town is the money the bank holds.
//
//   to send   the character is saved to the account first (so the bank knows of everything spent in town up to
//             this moment); the bank is asked to check the request; the player confirms what the bank read
//             back; and only then is it sent, under a key made once for that confirmation. If no answer comes,
//             the same key is used again: the bank does it once however often it is asked.
//
// What the wallet is made of is the bank's to say too: how much of it is starter TR (the arrival money, which
// pays the town's charges and costs and nothing else) and how much is eligible (earned TR: what can be sent,
// offered, or spent on a thing to own). This world's own count of that is set to the bank's with each answer.
//
// It draws nothing and touches no page: the interface is ui-wallet.js.

import { newId } from './market.js';
import { trText } from '../sim/ledger.js';

// online: the server (net/online.js). bank(): the simulation's side of the bank, or null with no character.
// playerId(): this player. saveNow(): send the character to the account at once, and say how that went.
// notify(event): things the player should be told. seen: { get(), set(n) }: the last entry this device has shown.
export function createWallet({ online, bank, playerId, saveNow = async () => null, saveSoon = () => {}, notify = () => {}, seen = { get: () => null, set: () => {} }, id = newId }) {
  const state = { balance: null, starter: null, illicit: 0, eligible: null, held: 0, adHeld: 0, username: '', last: 0, at: 0, loading: false, error: '' };
  const can = () => online.available && online.signedIn;
  const fail = (code, message) => ({ ok: false, code, message });

  // This world's wallet is made to say what the bank says (plus what has happened in town since the bank was told).
  function align(balance, why, parts = null) {
    const b = bank(), me = playerId();
    if (!b || !me || !Number.isSafeInteger(balance)) return 0;
    const done = b.align(me, balance, why, parts);
    if (done.ok && done.moved) saveSoon();
    return done.ok ? done.moved : 0;
  }

  // Any answer of the server's that says what the wallet holds now: { balance } or { wallet: { balance, held, last } }, and { news }.
  function heard(answer, why) {
    if (!answer) return;
    const w = answer.wallet && typeof answer.wallet === 'object' ? answer.wallet : answer;
    if (Number.isSafeInteger(w.balance)) {
      state.balance = w.balance; state.at = Date.now(); state.error = '';
      // what it is made of: said by the bank with every balance it gives
      const parts = Number.isSafeInteger(w.starter) ? { starter: w.starter, illicit: Number.isSafeInteger(w.illicit) ? w.illicit : 0 } : null;
      if (parts) { state.starter = parts.starter; state.illicit = parts.illicit; state.eligible = Number.isSafeInteger(w.eligible) ? w.eligible : w.balance - parts.starter; }
      align(w.balance, why, parts);
    }
    if (Number.isSafeInteger(w.held)) state.held = w.held;
    if (Number.isSafeInteger(w.adHeld)) state.adHeld = w.adHeld;
    if (typeof w.username === 'string') state.username = w.username;
    if (Number.isSafeInteger(w.last)) {
      state.last = w.last;
      const before = seen.get();
      // (a device that has never looked is not told of everything that ever happened)
      if (before !== null) for (const entry of [...(Array.isArray(answer.news) ? answer.news : [])].reverse()) if (entry.id > before) notify({ type: entry.type, other: entry.other, amount: entry.amount, what: entry.what, note: entry.note, ref: entry.ref });
      if (before === null || w.last > before) seen.set(w.last);
    }
  }

  // The bank's answer to a save: it has taken what the character earned and spent up to `mark`.
  function took(w, why) {
    const b = bank(), me = playerId();
    if (b && me && Number.isSafeInteger(w.mark)) b.told(me, w.mark);
    heard(w, why);
    if (w.refused > 0) notify({ type: 'refused', amount: w.refused });
    // the game here let something be bought that the bank will not take out of starter TR: the player is told
    if (w.shortAsset > 0) notify({ type: 'unpaid', amount: w.shortAsset });
  }

  function report() { const b = bank(), me = playerId(); return b && me ? b.report(me) : null; }

  async function refresh() {
    if (!can()) return fail('SIGNED_OUT', 'You are not signed in.');
    state.loading = true;
    const answer = await online.ask('wallet.get', { since: seen.get() });
    state.loading = false;
    if (answer.ok) heard(answer); else state.error = answer.message;
    return answer;
  }

  // Asks the bank whether this can be sent, and gives back what the bank read: the recipient as they are
  // registered, the amount in ledger units, the charge (there is none) and the total.
  async function check({ username, amount, note }) {
    if (!can()) return fail('SIGNED_OUT', 'You are not signed in.');
    const saved = await saveNow();
    if (saved && !saved.ok && (saved.code === 'OFFLINE' || saved.code === 'SERVER')) return fail(saved.code, saved.message);
    const answer = await online.ask('wallet.check', { username, amount, note });
    // the key under which this one confirmation will be sent, however many times it has to be asked
    return answer.ok ? { ...answer, key: id() } : answer;
  }

  async function send({ key, username, amount, note }) {
    if (!can()) return fail('SIGNED_OUT', 'You are not signed in.');
    const answer = await online.ask('wallet.send', { key, username, amount, note }, { timeout: 20000 });
    if (answer.ok) heard(answer, `Sent to ${answer.transfer.to}: ${trText(answer.transfer.amount)}`);
    return answer;
  }

  return {
    state, can, align, heard, took, report, refresh, check, send,
    seen: () => seen.get(),
    history: (before, all) => online.ask('wallet.history', { before: before || undefined, all: !!all }),
    people: () => online.ask('wallet.people'),
    addPerson: (username) => online.ask('wallet.person.add', { username }),
    removePerson: (username) => online.ask('wallet.person.remove', { username }),
    reset() { state.balance = null; state.starter = null; state.illicit = 0; state.eligible = null; state.held = 0; state.adHeld = 0; state.username = ''; state.last = 0; state.error = ''; },
  };
}
