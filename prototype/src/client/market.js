// The market, from the player's side: what the Property app asks for.
//
// The market itself is the server's (api/_lib/market.js): it decides what is for sale, who owns what and
// whether a sale happened, and it moves the money, which is the bank's (api/_lib/wallet.js), in the same breath.
// This file asks it, and after anything that moved money it has this world's wallet brought into line with the
// bank's figure (client/wallet.js).
//
//   to offer    the character is saved to the account first, so that the bank knows of everything spent in town
//               up to this moment; then the offer is sent. The bank sets the amount aside, or refuses the offer
//               if it is not there. An offer whose answer never arrived is asked about again under the same
//               number, so it is never made twice.
//   sync        every little while: what is waiting to be read or answered, what the wallet holds now, and what
//               has arrived in it since this page last looked.
//
// (Sales made before the bank kept the money were settled by each player's own game. Any that were still owed
// when the bank opened are finished here in the old way, once: see settleOld.)
//
// It draws nothing and touches no page: the interface is ui-market.js.

export const MARKET_CLIENT = Object.freeze({ syncEvery: 45, listFor: 30 });

export function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map((v) => v.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// online: the server (net/online.js). bridge(): the simulation's side of sales made before the bank kept the
// money, or null with no character. playerId(): this player. zone: the town's id. notify(event): things the
// player should be told. saveSoon(): the character should be sent to the server soon.
// wallet(): this player's wallet as the page knows it (client/wallet.js), told of every answer that carries a balance.
// saveNow(): send the character to the account at once, and say how that went.
export function createMarket({ online, bridge, playerId, zone, notify = () => {}, saveSoon = () => {}, saveNow = async () => null, wallet = () => null, id = newId }) {
  const state = { listings: [], all: [], listingsAt: -1e9, query: '', mine: null, unread: 0, toDecide: 0, error: '' };
  let unanswered = null;               // an offer that was sent and never answered: { thread, offerId, amount, what }
  const told = new Set();              // sales this page has already told its player about
  let syncing = false;
  let since = MARKET_CLIENT.syncEvery;

  const can = () => online.available && online.signedIn && !!bridge() && !!playerId();
  const fail = (code, message) => ({ ok: false, code, message });

  async function list(query = '') {
    const answer = await online.ask('market.list', { q: query });
    if (answer.ok) { state.listings = answer.listings; state.listingsAt = Date.now(); state.query = query; state.error = ''; if (!query) state.all = answer.listings; } else state.error = answer.message;
    return answer;
  }

  // Everything for sale, whatever is being searched for: where the markers stand in town.
  async function all() {
    const answer = await online.ask('market.list', { q: '' });
    if (answer.ok) state.all = answer.listings;
    return answer;
  }

  async function mine() {
    if (!online.signedIn) return fail('SIGNED_OUT', 'You are not signed in.');
    const answer = await online.ask('market.mine');
    if (answer.ok) { state.mine = answer; settleOld(answer); }
    return answer;
  }

  // Sales made before the bank kept the money: what this world still owed for them is paid here, once, in this
  // world's own ledger (from what it had set aside), and money set aside for offers that came to nothing comes back.
  function settleOld(dues) {
    const b = bridge(), me = playerId();
    if (!b || !me) return false;
    let moved = false;
    for (const d of dues.debits || []) {
      const done = b.settle(me, { saleId: d.sale, offerId: d.offer, amount: d.amount, what: d.what });
      if (done.ok && !done.replayed) { moved = true; notify({ type: 'bought', what: d.what, amount: d.amount }); }
      if (!done.ok && done.code === 'INSUFFICIENT') notify({ type: 'owing', what: d.what, amount: d.amount });
      if (done.ok) moved = true;
    }
    for (const c of dues.credits || []) {
      const done = b.credit(me, { saleId: c.sale, amount: c.amount, what: c.what });
      if (done.ok && !done.replayed) notify({ type: 'sold', what: c.what, amount: c.amount });
      if (done.ok) moved = true;
    }
    return moved;
  }

  const heard = (answer) => { const w = wallet(); if (w && answer && answer.ok) w.heard(answer); };

  // The round: what is waiting for me, what my wallet holds now, and what has come into it.
  async function sync() {
    if (!can() || syncing) return null;
    syncing = true;
    try {
      const b = bridge(), me = playerId();
      const old = b.view(me).holds;                       // set aside in this world, before the bank kept the money
      const w = wallet();
      const answer = await online.ask('market.sync', { offers: old.map((h) => h.offerId), since: w ? w.seen() : null });
      if (!answer.ok || bridge() !== b) return answer;
      let moved = settleOld(answer);
      for (const h of old) {
        let status = answer.offers[h.offerId];
        if (status === 'unknown') { const gone = await online.ask('market.withdraw', { offer: h.offerId }); status = gone.ok ? gone.offer.status : 'pending'; }
        if (status === 'declined' || status === 'withdrawn' || status === 'void') { if (b.release(me, h.offerId).released) moved = true; }
      }
      heard(answer);
      // an offer of mine that the seller has said yes to: told once
      let won = 0;
      for (const a of answer.accepted || []) if (!told.has(a.id)) { told.add(a.id); won += 1; notify({ type: 'bought', what: a.what, amount: a.amount }); }
      if (answer.unread - won > state.unread) notify({ type: 'message', count: answer.unread });
      if (answer.toDecide > state.toDecide) notify({ type: 'offer', count: answer.toDecide });
      state.unread = answer.unread; state.toDecide = answer.toDecide;
      if (moved) saveSoon();
      return answer;
    } finally { syncing = false; }
  }

  // A buyer offers `amount` (ledger units) in a conversation. At a shop this is the purchase.
  async function offer(thread, amount, what, after) {
    if (!can()) return fail('SIGNED_OUT', 'Sign in to buy.');
    // an offer already sent and never answered is finished first, under its own number
    const again = unanswered && unanswered.thread === thread && unanswered.amount === amount ? unanswered : null;
    if (!again) {
      // the bank must know of everything spent in town before it is asked whether there is enough
      const saved = await saveNow();
      if (saved && !saved.ok && (saved.code === 'OFFLINE' || saved.code === 'SERVER')) return fail(saved.code, saved.message);
    }
    const offerId = again ? again.offerId : id();
    const answer = await online.ask('market.offer', { thread, offer: offerId, amount, after }, { timeout: 20000 });
    if (!answer.ok && (answer.code === 'OFFLINE' || answer.code === 'SERVER')) unanswered = { thread, offerId, amount, what };
    else unanswered = null;
    heard(answer);
    if (answer.ok && answer.sale) notify({ type: 'bought', what: answer.sale.what || what, amount: answer.sale.amount });
    return answer;
  }

  async function withdraw(offerId) {
    const answer = await online.ask('market.withdraw', { offer: offerId });
    heard(answer);
    return answer;
  }

  // The seller's answer. Yes is the sale: the bank has paid the seller by the time this answers.
  async function decide(offerId, accept, amount, after) {
    const answer = await online.ask('market.decide', { offer: offerId, accept: !!accept, amount, after }, { timeout: 20000 });
    heard(answer);
    if (answer.ok && answer.sale) notify({ type: 'sold', what: answer.sale.what, amount: answer.sale.amount });
    return answer;
  }

  return {
    state, can, list, all, mine, sync, offer, withdraw, decide,
    open: (listing, at) => online.ask('market.open', { listing, at }),
    read: (thread, after) => online.ask('market.read', { thread, after }),
    say: (thread, text, after) => online.ask('market.say', { thread, text, after }),
    sell: (holding, price, place) => online.ask('market.sell', { holding, price, place, zone }),
    unlist: (listing) => online.ask('market.unlist', { listing }),
    adminAssets: () => online.ask('admin.assets'),
    adminList: (what) => online.ask('admin.list', { ...what, zone }),
    // what this world has paid and received for sales made before the bank kept the money, for the market to mark with the next save
    applied() { const b = bridge(), me = playerId(); if (!b || !me) return { debits: [], credits: [] }; const v = b.view(me); return { debits: v.paid.slice(-200), credits: v.credited.slice(-200) }; },
    // what is set aside for offers still waiting: the bank's figure
    held() { const w = wallet(); return { held: w ? w.state.held : 0 }; },
    tick(dt) { since += dt; if (since >= MARKET_CLIENT.syncEvery) { since = 0; sync(); } },
    soon() { since = MARKET_CLIENT.syncEvery - 1.5; },
    reset() { state.mine = null; state.unread = 0; state.toDecide = 0; unanswered = null; since = MARKET_CLIENT.syncEvery - 2; },
  };
}

// ---- the character and its account ----

// Keeps the character on this device and the copy with the account in step, and with each save tells the bank
// what the character has earned and spent in town since the last one.
//   online           the server
//   read()           the saved game as it is now ({ host, playerId }), or null with no character
//   adopt(saved)     make this the game being played (and keep it on this device)
//   forget()         there is no character on this device any more
//   summary()        { name, figure } for the account's own record
//   applied()        sales made before the bank kept the money that this world has now paid and received
//   wallet()         this player's wallet (client/wallet.js): report() before a save, took() after it
//   mark             { get(), set(value) }: kept on this device: which account its character belongs to, at which revision
//   pack / unpack    packSave and unpackSave
export function createAccountSync({ online, read, adopt, forget, summary, applied, wallet = () => null, mark, pack, unpack, notify = () => {}, every = 60 }) {
  let since = 0, busy = null, soonAt = 0;
  const who = () => (online.account ? online.account.username.toLowerCase() : null);
  const marked = () => { const m = mark.get(); return m && m.user === who() ? m : null; };
  // where a save from this device starts counting from: its own last save, or, for a character that has
  // never been kept with this account, the place an erased one left off (nothing, if there was none)
  const base = () => { const m = marked(); if (m) return m.rev; const kept = online.status().save; return kept && kept.erased ? kept.rev : 0; };

  async function fetchAndAdopt(why) {
    const answer = await online.ask('save.get', {}, { timeout: 30000 });
    if (!answer.ok) return answer;
    if (answer.erased) {
      // the character was erased (on this device or another): the copy here is not brought back
      mark.set({ user: who(), rev: answer.rev });
      online.noteSave(answer.rev, true);
      if (read()) forget('erased');
      return { ok: true, adopted: false, erased: true };
    }
    if (!answer.save) return { ok: true, adopted: false };
    const saved = await unpack(answer.save);
    if (!saved || !saved.host) return { ok: false, code: 'UNREADABLE', message: 'The character kept with your account could not be read on this device.' };
    // a character written by a newer version of the game than this page is: left alone, and never overwritten
    if (adopt(saved, why) === false) return { ok: false, code: 'UNREADABLE', message: 'The character kept with your account was made by a newer version of the game. Reload the page to play it.' };
    mark.set({ user: who(), rev: answer.save.rev });
    const w = wallet();
    if (w && answer.wallet) w.took(answer.wallet, 'The wallet kept with your account');
    return { ok: true, adopted: true };
  }

  // One save at a time: a second asking while one is on its way is given the first one's answer.
  function upload(options = {}) {
    if (busy) return busy;
    if (!online.signedIn) return Promise.resolve(null);
    const saved = read();
    if (!saved) return Promise.resolve(null);
    // (taken in the same breath as the save itself: what the bank is told is exactly what this copy holds)
    const w = wallet();
    const report = w ? w.report() : null;
    busy = (async () => {
      try {
        const packed = await pack(saved);
        const answer = await online.ask('save.put', { baseRev: base(), ...packed, summary: summary(), applied: applied(), ...(report ? { wallet: report } : {}) }, { keepalive: !!options.keepalive && packed.data.length < 60000, timeout: 30000 });
        if (answer.ok) {
          mark.set({ user: who(), rev: answer.rev }); online.noteSave(answer.rev);
          if (w && answer.wallet) w.took(answer.wallet);
        } else if (answer.code === 'NEWER' || answer.code === 'OUT_OF_STEP') {
          const got = await fetchAndAdopt('newer');
          if (got.ok && got.adopted) notify({ type: 'newer' });
          if (got.ok && got.erased) notify({ type: 'erased' });
        }
        return answer;
      } finally { busy = null; since = 0; }
    })();
    return busy;
  }

  // Signed in (just now, or found to be on opening the page): which copy of the character is the one to play?
  async function settle() {
    if (!online.signedIn) return { ok: true };
    const server = online.status().save;
    const m = marked();
    if (server && server.erased) {
      // a character that was kept with this account and has since been erased is not played on from here
      if (m && m.rev < server.rev) { mark.set({ user: who(), rev: server.rev }); if (read()) forget('erased'); return { ok: true, adopted: false, erased: true }; }
      if (!m && read()) return (await upload()) || { ok: true };
      const w = wallet(); if (w) await w.refresh();
      return { ok: true, adopted: false };
    }
    if (server && (!m || server.rev > m.rev)) return fetchAndAdopt(m ? 'newer' : 'account');
    if (!server && read()) return (await upload()) || { ok: true };
    // the same copy as the account's: only the wallet may have moved since (TR sent by someone, a sale)
    const w = wallet(); if (w && read()) await w.refresh();
    return { ok: true, adopted: false };
  }

  return {
    upload, settle,
    get rev() { const m = marked(); return m ? m.rev : 0; },
    // a new account takes the character already on this device with it
    async signUp(username, password) {
      const saved = read();
      const w = wallet();
      const report = saved && w ? w.report() : null;
      const packed = saved ? { ...(await pack(saved)), summary: summary(), ...(report ? { wallet: report } : {}) } : null;
      const answer = await online.signUp(username, password, packed);
      if (answer.ok) {
        mark.set(answer.save ? { user: who(), rev: answer.save.rev } : null);
        if (w && answer.wallet) w.took({ ...answer.wallet, mark: answer.save && report ? report.upto : undefined });
      }
      return answer;
    },
    async logIn(username, password) {
      const answer = await online.logIn(username, password);
      if (!answer.ok) return answer;
      const settled = await settle();
      return settled.ok ? { ...answer, adopted: !!settled.adopted } : { ...answer, warning: settled.message };
    },
    // the character goes to the account first; only then is this device signed out and cleared
    async logOut() {
      if (read()) { const sent = await upload(); if (sent && !sent.ok && sent.code !== 'NEWER' && sent.code !== 'OUT_OF_STEP') return { ok: false, code: sent.code, message: `Your character could not be saved to your account just now, so you are still signed in. ${sent.message}` }; }
      const answer = await online.logOut();
      if (answer.ok) { mark.set(null); forget('out'); }
      return answer;
    },
    // The character is erased, at the player's word: with the account first, and only then on this device. If
    // the account cannot be reached, nothing is erased anywhere: an old copy kept there would only come back.
    async erase() {
      if (busy) await busy.catch(() => null);
      const answer = await online.ask('save.erase', {}, { timeout: 20000 });
      if (!answer.ok) return answer;
      mark.set({ user: who(), rev: answer.rev });
      online.noteSave(answer.rev, true);
      forget('erased');
      const w = wallet();
      if (w && answer.wallet) w.heard(answer);
      return answer;
    },
    soon() { soonAt = 4; },
    tick(dt) {
      if (!online.signedIn) return;
      since += dt;
      if (soonAt > 0) { soonAt -= dt; if (soonAt <= 0) { upload(); return; } }
      if (since >= every) upload();
    },
  };
}
