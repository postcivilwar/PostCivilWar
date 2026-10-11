// The page on which an account is made or logged in to, and the start screen's way to it.
//
// On the website nobody plays without an account. Until someone is signed in, the start screen is shut: it
// offers Create Account and Log In and says why, and the character and the way into town are not on it. That
// is this file's doing (the start screen's `data-gate`), and main.js asks `mayPlay()` again before it lets
// anyone into the town, whatever is on screen. What an account protects (the character kept with it, the
// wallet, the market, the other players) is refused by the server to anyone who is not signed in; the page
// cannot grant any of it.
//
// A username and a password: nothing else is asked. What is typed goes to the game's server and nowhere else;
// the password is never kept by the page, never written anywhere on the device by this code, and is cleared
// from the box as soon as it has been sent. The same rules the server holds are checked here first, so that a
// mistake is told at once; the server checks them again whatever this page says.
//
//   online    the server (net/online.js)
//   sync      the character and its account (createAccountSync in market.js)
//   local()   the character on this device, if any: { name, mine, owner } (mine: it already belongs to the
//             signed-in account; owner: the username of the account it was last kept with, if any)
//   confirm   the question asked before logging out (confirm.js)
//   onChange  called when someone has signed in or out

const $ = (id) => document.getElementById(id);

const TEXT = {
  signup: {
    title: 'Create account', submit: 'Create account', busy: 'Creating your account...', swap: 'I have an account: log in',
    lede: 'A username and a password: nothing else is asked. Your character is kept with your account, so it is yours on any device you log in on.',
    username: '3 to 16 letters, figures and underscores, beginning with a letter. Other players see it over your head when they are near you.',
    password: 'At least 8 characters. It is kept only as a one-way hash: nobody, here or on the server, can read it back.',
  },
  login: {
    title: 'Log in', submit: 'Log in', busy: 'Logging in...', swap: 'I have no account: create one',
    lede: 'Log in to play your character on this device.',
    username: '', password: '',
  },
};

// The same checks as the server's, with the same words.
export function usernameProblem(name) {
  if (!name) return 'Choose a username.';
  if (name.length < 3 || name.length > 16) return 'A username is 3 to 16 characters long.';
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) return 'A username begins with a letter and has only letters, figures and underscores: no spaces.';
  return '';
}
export function passwordProblem(password, username) {
  if (!password) return 'Choose a password.';
  if (password.length < 8) return 'A password is at least 8 characters long.';
  if (password.length > 128) return 'A password is at most 128 characters long.';
  if (username && password.toLowerCase() === username.toLowerCase()) return 'The password must not be the username.';
  return '';
}

export function createAccountUI({ online, sync, local, confirm, onChange = () => {} }) {
  const page = $('account'), form = $('account-form'), row = $('account-row');
  if (!page || !form || !row) return { open() {}, close() {}, draw() {}, mayPlay: () => true, why() {}, logOut: async () => false, get isOpen() { return false; } };
  const username = $('account-username'), password = $('account-password'), error = $('account-error'), submit = $('account-submit');
  let mode = 'signup', busy = false, opener = null, reason = '';
  let said = null;               // why the start screen is shut, when there is something to say beyond the usual: { title, text }

  function fail(message) { error.hidden = !message; error.textContent = message || ''; }

  function draw() {
    const t = TEXT[mode];
    $('account-title').textContent = t.title;
    const mine = local();
    let lede = reason ? `${reason} ${t.lede}` : t.lede;
    if (mine && !mine.mine) lede += mode === 'signup' ? ` The character on this device, ${mine.name}, goes with the new account.` : ` If your account already has a character, it takes the place of ${mine.name} on this device; if it has none, ${mine.name} is kept with your account.`;
    $('account-lede').textContent = lede;
    $('account-username-note').textContent = t.username; $('account-username-note').hidden = !t.username;
    $('account-password-note').textContent = t.password; $('account-password-note').hidden = !t.password;
    password.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
    submit.textContent = busy ? t.busy : t.submit;
    submit.disabled = busy;
    $('account-switch').textContent = t.swap;
  }

  // A character of an account's that is already on this device can be played on with no connection: it goes
  // to the account when there is one again. Without that, no connection means nobody can be let in.
  const offlineOwner = () => { const mine = local(); return mine && mine.owner ? mine.owner : null; };
  // May the town be entered? Where there is a server: only signed in (or, with no connection, as above).
  function mayPlay() {
    if (!online.available) return true;
    const st = online.status();
    return st.state === 'in' || (st.state === 'down' && !!offlineOwner());
  }

  // The start screen: shut until someone is signed in. Where there is no server there are no accounts, and none of this is shown.
  function drawRow() {
    const st = online.status();
    const start = $('start'), gate = $('gate'), note = $('account-note');
    if (!online.available || st.state === 'off') { row.hidden = true; gate.hidden = true; if (start) start.removeAttribute('data-gate'); return; }
    const open = mayPlay();
    if (start) start.dataset.gate = open ? 'open' : st.state === 'checking' ? 'wait' : 'shut';
    row.hidden = false;
    gate.hidden = open;
    $('gate-wait').hidden = st.state !== 'checking';
    $('open-signup').hidden = $('open-login').hidden = st.state !== 'out';
    $('account-who').hidden = st.state !== 'in';
    $('account-retry').hidden = st.state !== 'down';
    if (st.state === 'in') { $('account-name').textContent = st.account.username; said = null; }
    note.hidden = st.state !== 'down';
    if (st.state === 'down') note.textContent = open
      ? `There is no connection to the game's server. ${st.message || ''} You can carry on as ${offlineOwner()} on this device: your character goes to your account when the connection is back. Nothing can be sent, received, bought or sold until then.`
      : `${st.message || 'The server could not be reached.'}`;
    if (!open) {
      const words = st.state === 'checking' ? { title: 'One moment', text: 'Your account is being looked for.' }
        : st.state === 'down' ? { title: 'The game\'s server cannot be reached', text: 'An account is needed to play, and accounts are kept by the game\'s server. Check your connection and try again.' }
          : said || { title: 'Create an account to play', text: 'Your character, your TR and everything you own are kept with your account, so they are yours on any device. It takes a username and a password: nothing else is asked.' };
      $('gate-title').textContent = words.title;
      $('gate-text').textContent = words.text;
      $('gate-text').hidden = st.state === 'checking';
    }
  }

  function open(next = 'signup', why = '') {
    if (!online.available) return;
    mode = next === 'login' ? 'login' : 'signup';
    reason = why;
    opener = document.activeElement;
    fail('');
    password.value = '';
    password.type = 'password'; $('account-show').setAttribute('aria-pressed', 'false'); $('account-show').textContent = 'Show';
    page.hidden = false;
    draw();
    setTimeout(() => (username.value ? password : username).focus({ preventScroll: true }), 30);
  }
  function close() {
    if (page.hidden) return;
    page.hidden = true;
    password.value = '';
    if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
    opener = null;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const name = username.value.trim();
    const typed = password.value;
    const problem = mode === 'signup' ? usernameProblem(name) || passwordProblem(typed, name) : (!name || !typed ? 'Type your username and your password.' : '');
    if (problem) { fail(problem); (usernameProblem(name) && mode === 'signup' ? username : password).focus({ preventScroll: true }); return; }
    busy = true; fail(''); draw();
    const answer = mode === 'signup' ? await sync.signUp(name, typed) : await sync.logIn(name, typed);
    busy = false;
    password.value = '';
    if (!answer.ok) { fail(answer.message || 'That did not work. Try again.'); draw(); (answer.code === 'USERNAME' || answer.code === 'TAKEN' ? username : password).focus({ preventScroll: true }); return; }
    draw();
    close();
    drawRow();
    onChange({ type: mode === 'signup' ? 'created' : 'in', account: answer.account, adopted: !!answer.adopted, warning: answer.warning || '' });
  });
  $('account-switch').addEventListener('click', () => { mode = mode === 'signup' ? 'login' : 'signup'; fail(''); draw(); username.focus({ preventScroll: true }); });
  $('account-back').addEventListener('click', close);
  $('account-show').addEventListener('click', () => { const shown = password.type === 'text'; password.type = shown ? 'password' : 'text'; $('account-show').setAttribute('aria-pressed', String(!shown)); $('account-show').textContent = shown ? 'Show' : 'Hide'; password.focus({ preventScroll: true }); });
  page.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
  $('open-signup').addEventListener('click', () => open('signup'));
  $('open-login').addEventListener('click', () => open('login'));

  // Logging out is asked about first. Yes saves the character to the account, signs this device out and clears
  // it; if the character cannot be saved, nobody is signed out and the question says why.
  function logOut() {
    return confirm.ask({
      title: 'Log out of your account?',
      body: 'You will be signed out of the game. Your saved progress will remain available when you log in again.',
      confirm: 'Log Out', cancel: 'Cancel', busy: 'Logging out...',
      run: async () => {
        const answer = await sync.logOut();
        if (answer.ok) { drawRow(); onChange({ type: 'out' }); }
        return answer;
      },
    });
  }
  $('account-logout').addEventListener('click', logOut);
  $('account-retry').addEventListener('click', async () => { const b = $('account-retry'); b.disabled = true; await online.check(); b.disabled = false; drawRow(); onChange({ type: 'checked' }); });
  online.onChange(drawRow);
  drawRow();

  return {
    open, close, draw: drawRow, logOut, mayPlay,
    // why the start screen is shut, when it is not simply that nobody has signed in yet (signed out elsewhere, say)
    why(title, text) { said = title ? { title, text } : null; drawRow(); },
    get isOpen() { return !page.hidden; },
  };
}
