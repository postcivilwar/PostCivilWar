// A question that must be answered before something that cannot be taken back is done: log out, erase a save.
//
// It is a dialog in the full sense: it sits over everything, the page behind it cannot be reached with a
// pointer or the Tab key while it is up, Escape and a press outside it mean "no", the first thing in it that
// has the focus is the safe answer, and when it closes the focus goes back to where it was.
//
// The dangerous answer is not done by the dialog: it calls `run`, which does it and says how it went. While
// that is under way neither button can be pressed again, so one press is one request. If it fails the dialog
// stays, says why in plain words, and nothing has been changed.
//
//   ask({ title, body, rows, note, confirm, cancel, busy, danger, run })  ->  a promise of true (done) or false (not done)
//   run: async () => ({ ok: true }) or ({ ok: false, message })
//   rows: [[label, value], ...] set out as a small table under the words (what is to be paid, and so on)
//   note: one more line under the table.   confirm: null for something that can only be read and closed.

const $ = (id) => document.getElementById(id);

export function createConfirm() {
  const box = $('confirm');
  if (!box) return { ask: async ({ run }) => { const r = await run(); return !!(r && r.ok); }, get isOpen() { return false; } };
  const title = $('confirm-title'), body = $('confirm-body'), error = $('confirm-error'), yes = $('confirm-yes'), no = $('confirm-no');
  const table = $('confirm-rows'), foot = $('confirm-note');
  let open = null;              // { resolve, run, opener, busy, words }

  function close(result) {
    if (!open) return;
    const { resolve, opener } = open;
    open = null;
    box.hidden = true;
    error.hidden = true; error.textContent = '';
    if (opener && opener.isConnected && typeof opener.focus === 'function') { try { opener.focus({ preventScroll: true }); } catch (e) { /* gone */ } }
    resolve(result);
  }

  async function agree() {
    if (!open || open.busy) return;
    const mine = open;
    mine.busy = true;
    yes.disabled = true; no.disabled = true;
    yes.textContent = mine.words.busy;
    error.hidden = true;
    let result = null;
    try { result = await mine.run(); } catch (e) { result = { ok: false, message: 'Something went wrong. Nothing was changed.' }; }
    if (open !== mine) return;
    mine.busy = false;
    if (result && result.ok) { close(true); return; }
    yes.disabled = false; no.disabled = false;
    yes.textContent = mine.words.confirm;
    error.textContent = (result && result.message) || 'That could not be done. Nothing was changed.';
    error.hidden = false;
    no.focus({ preventScroll: true });
  }

  yes.addEventListener('click', agree);
  no.addEventListener('click', () => { if (open && !open.busy) close(false); });
  // a press on the dark outside the box is "no"
  box.addEventListener('pointerdown', (event) => { if (event.target === box && open && !open.busy) close(false); });
  box.addEventListener('keydown', (event) => {
    if (!open) return;
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); if (!open.busy) close(false); return; }
    if (event.key === 'Tab') {
      // the focus stays inside: there are two things to press and it goes from one to the other
      event.preventDefault();
      const order = [no, yes].filter((b) => !b.disabled && !b.hidden);
      if (!order.length) return;
      const at = order.indexOf(document.activeElement);
      order[(at + (event.shiftKey ? order.length - 1 : 1)) % order.length].focus({ preventScroll: true });
    }
  });
  // keys typed while it is up are its own: the game behind it does not hear them
  for (const type of ['keyup', 'keypress']) box.addEventListener(type, (event) => event.stopPropagation());

  function ask({ title: heading, body: text = '', rows = null, note = '', confirm = 'Yes', cancel = 'Cancel', busy = 'Working...', danger = false, run = async () => ({ ok: true }) }) {
    if (open) return Promise.resolve(false);
    return new Promise((resolve) => {
      open = { resolve, run, opener: document.activeElement, busy: false, words: { confirm, busy } };
      title.textContent = heading;
      body.textContent = text; body.hidden = !text;
      if (table) {
        table.replaceChildren(...(rows || []).flatMap(([label, value, strong]) => { const dt = document.createElement('dt'); dt.textContent = label; const dd = document.createElement('dd'); dd.textContent = value; if (strong) dd.className = 'strong'; return [dt, dd]; }));
        table.hidden = !(rows && rows.length);
      }
      if (foot) { foot.textContent = note; foot.hidden = !note; }
      yes.hidden = confirm === null;
      yes.textContent = confirm || ''; no.textContent = cancel;
      yes.disabled = false; no.disabled = false;
      yes.classList.toggle('danger', !!danger);
      error.hidden = true; error.textContent = '';
      box.hidden = false;
      no.focus({ preventScroll: true });
    });
  }

  return { ask, get isOpen() { return !!open; }, close: () => { if (open && !open.busy) close(false); } };
}
