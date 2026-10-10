// The page on which an account is made or logged in to, and the row on the start screen that leads to it.
//
// A username and a password: nothing else is asked. What is typed goes to the game's server and nowhere else;
// the password is never kept by the page, never written anywhere on the device by this code, and is cleared
// from the box as soon as it has been sent. The same rules the server holds are checked here first, so that a
// mistake is told at once; the server checks them again whatever this page says.
//
//   online    the server (net/online.js)
//   sync      the character and its account (createAccountSync in market.js)
//   local()   the character on this device, if any: { name, mine } (mine: it already belongs to the signed-in account)
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

export function createAccountUI({ online, sync, local, onChange = () => {} }) {
  const page = $('account'), form = $('account-form'), row = $('account-row');
  if (!page || !form || !row) return { open() {}, close() {}, draw() {}, logOut: async () => ({ ok: false }), get isOpen() { return false; } };
  const username = $('account-username'), password = $('account-password'), error = $('account-error'), submit = $('account-submit');
  let mode = 'signup', busy = false, opener = null, reason = '';

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

  // The row on the start screen: two buttons, or who is signed in; nothing at all where there is no server.
  function drawRow() {
    const st = online.status();
    const note = $('account-note');
    row.hidden = !online.available || st.state === 'checking' || st.state === 'off';
    $('open-signup').hidden = $('open-login').hidden = st.state !== 'out';
    $('account-who').hidden = st.state !== 'in';
    if (st.state === 'in') $('account-name').textContent = st.account.username;
    note.hidden = st.state !== 'down';
    if (st.state === 'down') note.textContent = `Accounts cannot be reached just now. ${st.message || ''} You can play as usual on this device.`;
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

  async function logOut() {
    const button = $('account-logout');
    button.disabled = true;
    const answer = await sync.logOut();
    button.disabled = false;
    drawRow();
    onChange(answer.ok ? { type: 'out' } : { type: 'stayed', message: answer.message });
    return answer;
  }
  $('account-logout').addEventListener('click', logOut);
  online.onChange(drawRow);
  drawRow();

  return { open, close, draw: drawRow, logOut, get isOpen() { return !page.hidden; } };
}
