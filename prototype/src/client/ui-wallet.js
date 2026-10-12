// The Wallet on the phone: the player's TR, their username to be paid by, sending, receiving, the people they
// send to often, and the history.
//
// Every figure on it is the bank's (the server: api/_lib/wallet.js), asked for when the page is opened and after
// everything that moves TR. Nothing here works a balance out for itself, and nothing here says "sent" until the
// bank has answered that it is. What it cannot show (no connection, a copy of the game with no server) it says
// plainly, and it offers only the buttons that will do something.
//
//   home       the balance, the username and its copy button, SEND and RECEIVE, the people, the latest entries
//   send       who and how much -> what the bank read back, to be confirmed -> the bank's receipt
//   receive    the username to give to whoever is paying
//   history    every entry, newest first, a page at a time
//
// kit: the pieces the phone is made of (ui-phone.js). go(state) moves about inside the app.

const SVG = 'http://www.w3.org/2000/svg';
const ICONS = Object.freeze({
  copy: ['M9 9h9.5A1.5 1.5 0 0 1 20 10.5V20a1.5 1.5 0 0 1-1.5 1.5H9A1.5 1.5 0 0 1 7.500 20v-9.500A1.500 1.500 0 0 1 9 9z', 'M4 15V4.500A1.500 1.500 0 0 1 5.500 3H15'],
  history: ['M4 12a8 8 0 1 0 2.600-5.900', 'M3.500 4.500v4h4', 'M12 8v4.500l3 2'],
  send: ['M12 19V5', 'M6 11l6-6 6 6'],
  receive: ['M12 5v14', 'M6 13l6 6 6-6'],
  tick: ['M5 12.500l4.500 4.500L19 7.500'],
  person: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 20c0-4 3.600-6 8-6s8 2 8 6'],
  remove: ['M6 6l12 12', 'M18 6L6 18'],
});
const icon = (id) => {
  const el = document.createElementNS(SVG, 'svg');
  el.setAttribute('viewBox', '0 0 24 24'); el.setAttribute('aria-hidden', 'true'); el.classList.add('wl-ic');
  for (const d of ICONS[id]) { const path = document.createElementNS(SVG, 'path'); path.setAttribute('d', d); el.append(path); }
  return el;
};

const WORDS = Object.freeze({
  sent: 'Sent', received: 'Received', opening: 'Arrival money', game: 'In town', held: 'Offer', returned: 'Offer returned', bought: 'Bought', sold: 'Sold', upgrade: 'Character upgrade',
});
const STATUS = Object.freeze({ completed: 'Completed', held: 'Set aside', paid: 'Paid', returned: 'Returned' });

export function createWalletUI(kit) {
  const { app, h, redraw, section, line, tr, trPlain } = kit;
  const w = {
    opened: false,                  // the bank has been asked since the page was opened
    asking: false,
    people: null, peopleError: '',
    recent: null,
    history: { entries: [], more: false, next: null, loading: false, error: '', all: false, loaded: false },
    form: { username: '', amount: '', note: '' },
    problem: '',                    // what is wrong with the form, said under it
    checking: false,
    confirm: null,                  // what the bank read back: { person, amount, fee, total, balance, note, key }
    sending: false,
    sendProblem: '', sendRetry: false,
    receipt: null,                  // the bank's answer to a transfer
    note: null,                     // { good, text }: what the last small action answered
  };
  const wallet = () => app.wallet;
  const online = () => app.online;
  const here = () => !!(wallet() && online() && online().available);
  const signedIn = () => here() && online().signedIn;
  const say = (good, text) => { w.note = { good, text }; };
  const noteBox = () => { if (!w.note) return null; const n = w.note; w.note = null; return h('div', { class: `notice${n.good ? ' good' : ''}`, role: 'status' }, n.text); };
  const date = (at) => new Date(at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  async function load(force) {
    if (!signedIn() || w.asking) return;
    if (w.opened && !force) return;
    w.asking = true; w.opened = true;
    // the character is saved first, so that the bank's figure includes everything earned and spent in town so far
    if (app.saveNow) await app.saveNow();
    const [, people, recent] = await Promise.all([wallet().refresh(), wallet().people(), wallet().history(null, false)]);
    if (people.ok) { w.people = people.people; w.peopleError = ''; } else w.peopleError = people.message;
    if (recent.ok) w.recent = recent.entries.slice(0, 4);
    w.asking = false;
    redraw();
  }

  // What a wallet is made of, said small under the balance and opened for anyone who wants the whole of it.
  //   parts: { total, starter, eligible, held } in ledger units (eligible is TR that was earned: what can be
  //   sent to another player or spent on a thing to own)
  function partsBox(parts) {
    if (!parts || !Number.isSafeInteger(parts.starter)) return null;
    const row = (label, value, id) => h('div', { class: 'wl-part' }, h('span', null, label), h('b', id ? { id } : null, tr(value)));
    return h('details', { class: 'wl-parts', id: 'wallet-parts' },
      h('summary', null, h('span', { id: 'wallet-eligible-line' }, `${tr(parts.eligible)} can be sent or spent on assets`), h('span', { class: 'wl-more' }, 'Details')),
      h('div', { class: 'wl-partrows' },
        row('Total', parts.total, 'wallet-total'),
        row('Starter TR', parts.starter, 'wallet-starter'),
        row('Earned TR (eligible)', parts.eligible, 'wallet-eligible'),
        parts.held > 0 ? row('Set aside for your offers', parts.held, 'wallet-held') : null),
      h('p', { class: 'small' }, 'Starter TR is the 2,000 TR you arrived with. It pays fines, the ambulance, hospital bills, levies, permits, fares, food and fuel. It cannot be sent to another player and does not buy assets (land, vehicles, building materials, things in the market) or a character upgrade.'),
      h('p', { class: 'small' }, 'Earned TR is what you are paid for work in town, what other players send you, and what you sell things for. It can be sent and spent on anything.'));
  }

  // ---- the page ----

  function page(root, view, sub, go) {
    const box = noteBox();
    if (box) root.append(box);
    if (!here()) { local(root, view); return; }
    if (!signedIn()) { away(root); return; }
    if (sub.send) { if (sub.send === 'done' && w.receipt) receipt(root, go); else if (sub.send === 'confirm' && w.confirm) confirm(root, go); else form(root, go); return; }
    if (sub.receive) { receive(root, go); return; }
    if (sub.history) { history(root); return; }
    home(root, view, go);
  }

  // A copy of the game with no server: this world's own money, and nothing that needs the bank.
  function local(root, view) {
    const f = view.self.funds || null;
    root.append(h('div', { class: 'wl-card' }, h('div', { class: 'eyebrow' }, 'TR balance'), h('div', { class: 'wl-balance', id: 'wallet-balance' }, h('b', null, trPlainGrouped(view.self.balance)), h('span', null, 'TR')),
      f ? partsBox({ total: f.total, starter: f.starter, eligible: f.eligible, held: 0 }) : null));
    root.append(h('p', { class: 'small' }, 'TR is the money of this world. Sending TR to other players, and receiving it, is on postcivilwar.com, where every player has an account and a wallet kept by the game\'s server. This copy of the game has no connection to it.'));
    root.append(section('Recent entries'));
    kit.legacy.wallet(root);
  }

  function away(root) {
    const state = online().status().state;
    root.append(h('div', { class: 'callout' },
      h('p', null, state === 'checking' ? 'Asking the server...' : state === 'out' ? 'Your wallet is kept with your account. Log in to see it.' : `Your wallet is kept by the game's server, which cannot be reached just now. ${online().status().message || ''} Nothing can be sent or received until it can.`),
      state === 'out' ? h('div', { class: 'hxrow' }, h('button', { class: 'hx', type: 'button', onclick: () => app.account.open('login') }, 'Log in')) : null));
  }

  const trPlainGrouped = (units) => (Math.round(Number(units) || 0) / 2).toLocaleString('en-GB', { maximumFractionDigits: 1 });
  const figure = (units) => h('div', { class: 'wl-balance', id: 'wallet-balance', 'aria-label': `${trPlainGrouped(units)} TR` }, h('b', null, trPlainGrouped(units)), h('span', null, 'TR'));

  // The username is put on the device's clipboard, and the page says so where the button is: the button shows
  // a tick for a moment, the words "Username copied" appear beside it (and are read out), and a notice is put
  // up in the game as well, for when the phone has been put away.
  let copiedTimer = 0;
  async function copyName(name, button) {
    let done = false;
    try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(name); done = true; } } catch (error) { done = false; }
    if (!done) {
      // an older browser, or one that keeps the clipboard to itself: the long way round
      const box = h('textarea', { style: 'position:fixed;left:-99px;top:0;width:1px;height:1px;opacity:0', readonly: '' }, name);
      document.body.append(box); box.select();
      try { done = document.execCommand('copy'); } catch (error) { done = false; }
      box.remove();
    }
    if (app.chime) app.chime(done ? 'ok' : 'tap');
    const text = done ? 'Username copied' : `It could not be copied from here. Your username is ${name}.`;
    kit.toast({ type: 'note', text });
    const said = document.getElementById('wallet-copied');
    if (said) { said.textContent = text; said.hidden = false; }
    if (button && button.isConnected && done) {
      const mark = button.querySelector('svg');
      if (mark) mark.replaceWith(icon('tick'));
      button.classList.add('done');
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => { if (button.isConnected) { button.classList.remove('done'); const now = button.querySelector('svg'); if (now) now.replaceWith(icon('copy')); } if (said && said.isConnected) said.hidden = true; }, 2200);
    }
  }
  const copyButton = (name, id) => h('button', { class: 'wl-icon', type: 'button', id, 'aria-label': 'Copy your username', title: 'Copy your username', onclick: (event) => copyName(name, event.currentTarget) }, icon('copy'));

  function home(root, view, go) {
    if (!w.opened) load();
    const st = wallet().state;
    const name = online().account.username;
    const card = h('div', { class: 'wl-card' },
      h('div', { class: 'wl-top' }, h('div', { class: 'eyebrow' }, 'TR balance'),
        h('button', { class: 'wl-icon', type: 'button', id: 'wallet-history', 'aria-label': 'Transaction history', title: 'Transaction history', onclick: () => { w.history.loaded = false; go({ history: true }); } }, icon('history'))),
      st.balance === null ? h('div', { class: 'wl-balance wl-wait', id: 'wallet-balance', 'aria-busy': 'true' }, h('b', null, st.error ? '—' : '···'), h('span', null, 'TR')) : figure(st.balance),
      st.balance !== null && st.starter !== null ? partsBox({ total: st.balance, starter: st.starter, eligible: st.eligible, held: st.held }) : null,
      st.held > 0 ? h('div', { class: 'wl-held' }, `${tr(st.held)} more is set aside for your offers in the market`) : null,
      h('div', { class: 'wl-user' }, h('span', { class: 'eyebrow' }, 'Username'), h('b', { id: 'wallet-username' }, name), h('span', { class: 'wl-copied', id: 'wallet-copied', role: 'status', hidden: true }), copyButton(name, 'wallet-copy')));
    root.append(card);
    if (st.error && st.balance === null) root.append(h('div', { class: 'notice', role: 'alert' }, `The bank could not be asked. ${st.error}`), h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: () => load(true) }, 'Try again')));
    root.append(h('div', { class: 'wl-actions' },
      h('button', { class: 'hx primary', type: 'button', id: 'wallet-send', disabled: st.balance === null, onclick: () => { w.form = { username: '', amount: '', note: '' }; w.problem = ''; w.confirm = null; w.receipt = null; go({ send: 'form' }); } }, icon('send'), 'Send'),
      h('button', { class: 'hx', type: 'button', id: 'wallet-receive', onclick: () => go({ receive: true }) }, icon('receive'), 'Receive')));

    root.append(section('Beneficiaries'));
    if (w.peopleError) root.append(h('div', { class: 'notice' }, w.peopleError));
    else if (!w.people) root.append(h('p', { class: 'small' }, 'Asking the bank...'));
    else if (!w.people.length) root.append(h('p', { class: 'small', id: 'no-people' }, 'Nobody yet. After you send TR to someone you can keep them here, to send again with one press.'));
    else root.append(h('div', { class: 'rows', id: 'wallet-people' }, w.people.map((p) => h('div', { class: 'wl-person', 'data-person': p.username },
      h('button', { class: 'wl-pick', type: 'button', 'aria-label': `Send TR to ${p.username}`, onclick: () => { w.form = { username: p.username, amount: '', note: '' }; w.problem = ''; go({ send: 'form' }); } },
        h('span', { class: 'avatar' }, p.username.slice(0, 1).toUpperCase()), h('b', null, p.username), h('span', { class: 'eyebrow' }, 'Send')),
      h('button', { class: 'wl-icon quiet', type: 'button', 'aria-label': `Remove ${p.username} from your beneficiaries`, title: 'Remove', onclick: async (event) => {
        event.currentTarget.disabled = true;
        const answer = await wallet().removePerson(p.username);
        if (answer.ok) { w.people = answer.people; say(true, `${p.username} is no longer in your beneficiaries.`); } else say(false, answer.message);
        redraw();
      } }, icon('remove'))))));

    root.append(section('Latest'));
    if (!w.recent) root.append(h('p', { class: 'small' }, 'Asking the bank...'));
    else if (!w.recent.length) root.append(h('p', { class: 'small' }, 'Nothing yet.'));
    else root.append(h('div', { class: 'rows' }, w.recent.map(entryRow)), h('div', { class: 'actions' }, h('button', { class: 'btn quiet', type: 'button', onclick: () => { w.history.loaded = false; go({ history: true }); } }, 'All transactions')));
    root.append(h('p', { class: 'small' }, 'TR is the money of this world. It is game money: not legal tender, and not a cryptocurrency.'));
  }

  // One entry of the history, as a row.
  function entryRow(e) {
    const who = e.type === 'sent' ? `to ${e.other}` : e.type === 'received' ? `from ${e.other}` : e.type === 'sold' && e.other ? `to ${e.other}` : (e.type === 'bought' || e.type === 'held') && e.other ? `from ${e.other}` : '';
    const title = `${WORDS[e.type] || e.type}${who ? ` ${who}` : ''}`;
    const detail = e.type === 'game' ? `Earned ${tr(e.earned)}, spent ${tr(e.spent)}` : e.type === 'upgrade' ? String(e.note || '').replace(/^Character upgrade:\s*/, '') : e.what || '';
    return h('div', { class: 'wl-entry', 'data-type': e.type, 'data-ref': e.ref },
      h('span', { class: `wl-dir ${e.direction}` }, icon(e.direction === 'in' ? 'receive' : 'send')),
      h('span', { class: 'wl-what' }, h('b', null, title), detail ? h('span', null, detail) : null, e.note && e.note !== 'In town' && e.type !== 'opening' && e.type !== 'held' && e.type !== 'returned' && e.type !== 'bought' && e.type !== 'sold' && e.type !== 'upgrade' ? h('span', { class: 'wl-note' }, `"${e.note}"`) : null,
        h('span', { class: 'eyebrow plain' }, `${date(e.at)} · ${STATUS[e.status] || e.status} · ${e.ref}`)),
      h('span', { class: `wl-amount ${e.direction === 'in' ? 'pos' : 'neg'}` }, `${e.direction === 'in' ? '+' : '−'}${tr(e.amount)}`));
  }

  // ---- send ----

  const field = (id, label, value, attrs, oninput) => h('label', { class: 'wl-field' }, h('span', { class: 'eyebrow' }, label), h('input', { class: 'field', id, value, ...attrs, oninput: (event) => { oninput(event.target.value); if (w.problem) { w.problem = ''; const box = document.getElementById('send-problem'); if (box) box.hidden = true; } } }));

  function form(root, go) {
    const st = wallet().state;
    // what can be sent is what was earned: said here, before anything is typed
    const can = st.eligible !== null ? st.eligible : st.balance;
    root.append(h('div', { class: 'wl-head' }, h('div', { class: 'big' }, 'Send TR'), can !== null ? h('div', { class: 'eyebrow', id: 'send-can' }, `You can send ${tr(can)}`) : null));
    if (st.eligible !== null && st.eligible < st.balance) root.append(h('p', { class: 'small', id: 'send-starter-note' }, st.eligible > 0
      ? `Your balance is ${tr(st.balance)}. ${tr(st.starter)} of it is starter TR, which cannot be transferred.`
      : 'Starter TR cannot be transferred. Earn TR through gameplay to send money to other players.'));
    const submit = async (event) => {
      if (event) event.preventDefault();
      if (w.checking) return;
      const f = w.form;
      // the first look is here, so that an empty box is told at once; the bank looks again, and its word is the one that counts
      if (!f.username.trim()) { w.problem = 'Enter the username of the person you are sending to.'; redraw(); return; }
      if (!String(f.amount).trim()) { w.problem = 'Enter an amount.'; redraw(); return; }
      w.checking = true; w.problem = ''; redraw();
      const answer = await wallet().check({ username: f.username.trim(), amount: String(f.amount).trim(), note: f.note });
      w.checking = false;
      if (!answer.ok) { w.problem = answer.message; redraw(); return; }
      w.confirm = answer; w.sendProblem = ''; w.sendRetry = false;
      go({ send: 'confirm' });
    };
    const people = (w.people || []).slice(0, 8);
    root.append(h('form', { class: 'wl-form', id: 'send-form', novalidate: '', onsubmit: submit },
      field('send-username', 'Recipient\'s username', w.form.username, { name: 'recipient', autocomplete: 'off', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', maxlength: '32', enterkeyhint: 'next', placeholder: 'username' }, (v) => { w.form.username = v; }),
      people.length ? h('div', { class: 'wl-chips', role: 'group', 'aria-label': 'Your beneficiaries' }, people.map((p) => h('button', { class: 'wl-chip', type: 'button', 'aria-pressed': String(p.username.toLowerCase() === w.form.username.trim().toLowerCase()), onclick: () => { w.form.username = p.username; w.problem = ''; redraw(); } }, p.username))) : null,
      field('send-amount', 'Amount in TR', w.form.amount, { name: 'amount', inputmode: 'decimal', autocomplete: 'off', maxlength: '16', enterkeyhint: 'next', placeholder: '0' }, (v) => { w.form.amount = v; }),
      field('send-note', 'Note (if you wish)', w.form.note, { name: 'note', autocomplete: 'off', maxlength: '140', enterkeyhint: 'done', placeholder: 'What it is for' }, (v) => { w.form.note = v; }),
      h('div', { class: 'notice', id: 'send-problem', role: 'alert', hidden: !w.problem }, w.problem),
      h('button', { class: 'hx primary wide', type: 'submit', id: 'send-continue', disabled: w.checking }, w.checking ? 'Asking the bank...' : 'Continue'),
      h('p', { class: 'small' }, 'TR can only be sent to a registered user, by their username. You will be shown exactly what is to be sent before anything moves.')));
  }

  function confirm(root, go) {
    const c = w.confirm;
    root.append(h('div', { class: 'wl-head' }, h('div', { class: 'big' }, 'Confirm transfer'), h('div', { class: 'eyebrow' }, 'Nothing has been sent yet')));
    root.append(h('div', { class: 'rows wl-sheet', id: 'send-summary' },
      line('Recipient', c.person.username), line('Amount', tr(c.amount)), line('Fee', c.fee > 0 ? tr(c.fee) : 'None'), line('Total to leave your wallet', tr(c.total)),
      c.note ? line('Note', c.note) : null, line('Your balance afterwards', tr(c.balance - c.total)),
      Number.isSafeInteger(c.eligible) ? line('Of which TR you can still send', tr(c.eligible - c.total)) : null));
    if (w.sendProblem) root.append(h('div', { class: 'notice', id: 'confirm-problem', role: 'alert' }, w.sendProblem));
    const doSend = async () => {
      if (w.sending) return;
      w.sending = true; w.sendProblem = ''; redraw();
      // the same key every time this one confirmation is sent: asked twice, it is done once
      const answer = await wallet().send({ key: c.key, username: c.person.username, amount: trPlain(c.amount), note: c.note });
      w.sending = false;
      if (answer.ok) {
        w.receipt = answer; w.confirm = null; w.recent = null; w.opened = false;
        if (app.chime) app.chime('paid');
        go({ send: 'done' });
        return;
      }
      const lost = answer.code === 'OFFLINE' || answer.code === 'SERVER';
      w.sendRetry = lost;
      w.sendProblem = lost ? `No answer came back from the bank, so it is not known whether this was sent. Press Try again: the same transfer is finished, and never sent twice. (${answer.message})` : answer.message;
      redraw();
    };
    root.append(h('div', { class: 'wl-actions column' },
      h('button', { class: 'hx primary wide', type: 'button', id: 'send-confirm', disabled: w.sending, onclick: doSend }, w.sending ? 'Sending...' : w.sendRetry ? 'Try again' : 'Confirm Transfer'),
      h('button', { class: 'hx wide', type: 'button', id: 'send-cancel', disabled: w.sending, onclick: () => { w.confirm = null; w.sendProblem = ''; go({ send: 'form' }); } }, 'Cancel')));
  }

  function receipt(root, go) {
    const r = w.receipt, t = r.transfer;
    root.append(h('div', { class: 'wl-done', id: 'send-done', role: 'status' }, h('span', { class: 'wl-tick' }, icon('tick')), h('div', { class: 'big' }, `${tr(t.amount)} sent`), h('div', { class: 'eyebrow' }, `to ${t.to}`)));
    root.append(h('div', { class: 'rows wl-sheet' },
      line('Reference', t.ref, 'mono'), line('Recipient', t.to), line('Amount', tr(t.amount)), line('Fee', t.fee > 0 ? tr(t.fee) : 'None'),
      t.note ? line('Note', t.note) : null, line('When', date(t.at)), line('Your balance now', tr(r.balance))));
    const actions = h('div', { class: 'wl-actions column' });
    if (!t.saved) actions.append(h('button', { class: 'hx wide', type: 'button', id: 'send-keep', onclick: async (event) => {
      event.currentTarget.disabled = true;
      const answer = await wallet().addPerson(t.to);
      if (answer.ok) { w.people = answer.people; t.saved = true; say(true, `${t.to} is in your beneficiaries.`); } else say(false, answer.message);
      redraw();
    } }, 'Add to beneficiaries'));
    actions.append(h('button', { class: 'hx primary wide', type: 'button', id: 'send-finish', onclick: () => { w.receipt = null; go({}); } }, 'Done'));
    root.append(actions);
  }

  // ---- receive ----

  function receive(root) {
    const name = online().account.username;
    root.append(h('div', { class: 'wl-head' }, h('div', { class: 'big' }, 'Receive TR'), h('div', { class: 'eyebrow' }, 'Give the sender your username')));
    root.append(h('div', { class: 'wl-card wl-name' }, h('div', { class: 'eyebrow' }, 'Your username'), h('div', { class: 'wl-bigname', id: 'receive-username' }, name),
      h('button', { class: 'hx primary', type: 'button', id: 'receive-copy', onclick: (event) => copyName(name, event.currentTarget) }, icon('copy'), 'Copy username'),
      h('span', { class: 'wl-copied', id: 'wallet-copied', role: 'status', hidden: true })));
    root.append(h('p', { class: 'small' }, 'To be sent TR, give this username to the person who is paying. They enter it in Send on their own phone, and what they send is in your wallet as soon as the bank has moved it. There is no address or code to share: your username is all that is needed.'));
  }

  // ---- history ----

  async function more(reset) {
    const H = w.history;
    if (H.loading) return;
    H.loading = true; H.error = '';
    if (reset) { H.entries = []; H.next = null; H.more = false; }
    redraw();
    const answer = await wallet().history(reset ? null : H.next, H.all);
    H.loading = false; H.loaded = true;
    if (answer.ok) { H.entries = reset ? answer.entries : [...H.entries, ...answer.entries]; H.more = answer.more; H.next = answer.next; } else H.error = answer.message;
    redraw();
  }

  function history(root) {
    const H = w.history;
    if (!H.loaded && !H.loading) more(true);
    root.append(h('div', { class: 'wl-head' }, h('div', { class: 'big' }, 'Transactions'),
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Which entries' },
        h('button', { type: 'button', 'aria-pressed': String(!H.all), onclick: () => { if (H.all) { H.all = false; more(true); } } }, 'Transfers'),
        h('button', { type: 'button', 'aria-pressed': String(H.all), onclick: () => { if (!H.all) { H.all = true; more(true); } } }, 'Everything'))));
    if (H.error) root.append(h('div', { class: 'notice', role: 'alert' }, `The history could not be fetched. ${H.error}`), h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: () => more(!H.entries.length) }, 'Try again')));
    if (H.entries.length) root.append(h('div', { class: 'rows', id: 'wallet-entries' }, H.entries.map(entryRow)));
    else if (H.loading) root.append(h('p', { class: 'small', 'aria-busy': 'true' }, 'Asking the bank...'));
    else if (!H.error) root.append(h('p', { class: 'small', id: 'no-entries' }, 'Nothing has moved in or out of your wallet yet.'));
    if (H.entries.length && H.loading) root.append(h('p', { class: 'small', 'aria-busy': 'true' }, 'Fetching more...'));
    if (H.more && !H.loading) root.append(h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', id: 'history-more', onclick: () => more(false) }, 'Earlier transactions')));
  }

  return {
    page,
    // is the player somewhere inside the app that Back should leave before it leaves the app?
    deep: (sub) => !!(sub.send || sub.receive || sub.history),
    back: (sub) => (sub.send === 'confirm' ? { send: 'form' } : {}),
    // the page was left: what it showed is asked for afresh next time
    leave() { w.opened = false; w.confirm = null; w.receipt = null; w.problem = ''; w.sendProblem = ''; w.history.loaded = false; },
    signedOut() { w.opened = false; w.people = null; w.recent = null; w.confirm = null; w.receipt = null; w.history = { entries: [], more: false, next: null, loading: false, error: '', all: false, loaded: false }; },
    stale() { w.opened = false; },
  };
}
