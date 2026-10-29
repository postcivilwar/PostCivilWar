// Voice chat on the screen (29 October 2026, the owner's brief for voice chat, stage 1): the microphone button (held to
// talk), the players near you (mute, block, report), the speaker over whoever is talking, the first time it is turned
// on (what it does, the age, the microphone), its place in Settings, a calm word when it cannot connect, and the reports
// in the Admin app. What it does is in src/net/voice-chat.js.

const REASONS = [['abuse', 'Abuse or insults'], ['harassment', 'Harassment'], ['threats', 'Threats'], ['hate', 'Hate speech'], ['other', 'Other']];
const ACTION_WORDS = { dismiss: 'Dismiss', warn: 'Warn', voice7: 'No voice 7 days', voice30: 'No voice 30 days', voiceForever: 'No voice for good', gameBan: 'Ban from the game' };
const STATUS_WORDS = { open: 'Open', dismissed: 'Dismissed', warned: 'Warned', 'voice-7': 'No voice for 7 days', 'voice-30': 'No voice for 30 days', 'voice-forever': 'No voice for good', 'game-ban': 'Banned from the game' };

export const PRIVACY = Object.freeze([
  'Your account keeps your username, your character and how far you have got, so that you can play on any device. Your password is never kept: only a scrambled form of it that cannot be turned back into it.',
  'Voice chat is off until you turn it on. Your voice goes straight from your device to the players near you (through Cloudflare\'s relay only when a network will not let two devices reach each other). What anyone says is never recorded or kept, by the game, its server or anyone else. Your microphone is used only while voice chat is on and the game is on your screen.',
  'For voice chat the server keeps only what it needs: your answer to "Are you 18 or older?", the players you have blocked, and any report you make or that is made about you, with the date, the two accounts and the place in town. The game\'s administrators read reports and decide what to do about them.',
  'The weather in town is the real weather near you, found from the approximate place your connection comes from. Nobody is asked where you are, and the place is not kept.',
]);

const MIC_SVG = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"></path></svg>';
const PEOPLE_SVG = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2"></circle><path d="M3.5 19c.6-3.4 2.8-5.2 5.5-5.2s4.9 1.8 5.5 5.2"></path><circle cx="16.5" cy="9" r="2.4"></circle><path d="M15.2 13.9c2.7-.4 4.7 1.2 5.3 4.6"></path></svg>';
const SPEAKER_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"></path><path class="w1" d="M15.5 9a4 4 0 0 1 0 6"></path><path class="w2" d="M18 6.5a7.5 7.5 0 0 1 0 11"></path></svg>';

export function createVoiceUI({ voice, online, h, hud = null, project = () => null, headOfPeer = () => null, place = () => null, isAdmin = () => false, toast = () => {}, screen = () => ({ w: innerWidth, h: innerHeight }) }) {
  const el = (tag, attrs, ...kids) => h(tag, attrs, ...kids);
  // ---- on the screen: the buttons, the word, the speakers ----
  const talk = el('button', { id: 'voice-talk', type: 'button', 'aria-label': 'Hold to talk', hidden: '' });
  talk.innerHTML = MIC_SVG;
  const people = el('button', { id: 'voice-people', type: 'button', 'aria-label': 'Players nearby: mute, block or report', hidden: '' });
  people.innerHTML = PEOPLE_SVG;
  const word = el('div', { id: 'voice-note', role: 'status', hidden: '' });
  const icons = el('div', { id: 'voice-icons', 'aria-hidden': 'true' });
  if (hud) hud.append(talk, people, word, icons);

  // held to talk (a pointer, a finger); with open mic the button turns voice off and on instead of being held
  let holding = null;
  const down = async (event) => {
    event.preventDefault();
    if (!voice.active) { if (voice.on) await wake(); return; }
    if (voice.prefs.mode === 'open') return;
    holding = event.pointerId;
    try { talk.setPointerCapture(event.pointerId); } catch (error) { /* not captured */ }
    voice.press();
  };
  const up = (event) => { if (holding === null || (event && event.pointerId !== holding)) return; holding = null; voice.release(); };
  talk.addEventListener('pointerdown', down);
  talk.addEventListener('pointerup', up);
  talk.addEventListener('pointercancel', up);
  talk.addEventListener('lostpointercapture', up);
  talk.addEventListener('contextmenu', (e) => e.preventDefault());
  people.addEventListener('click', () => openNearby());

  const shownIcons = new Map();        // peer id -> element
  function frame() {
    const on = voice.on;
    keepNearby();
    if (!on && talk.hidden && !shownIcons.size && word.hidden) return;
    talk.hidden = !on; people.hidden = !on;
    talk.classList.toggle('sending', voice.sending);
    talk.classList.toggle('open', voice.prefs.mode === 'open');
    talk.classList.toggle('idle', on && !voice.active);
    talk.setAttribute('aria-pressed', String(voice.sending));
    talk.setAttribute('aria-label', voice.prefs.mode === 'open' ? 'Open mic: you are heard when you speak' : 'Hold to talk');
    const n = voice.note || (on && !voice.active && !waking ? 'Tap the microphone to start voice chat.' : '');
    if (word.textContent !== n) word.textContent = n;
    word.hidden = !n;
    // a speaker over each player talking, where their head is on the screen
    const want = new Set(on ? voice.talkingIds() : []);
    for (const [id, icon] of shownIcons) if (!want.has(id)) { icon.remove(); shownIcons.delete(id); }
    for (const id of want) {
      const head = headOfPeer(id);
      const at = head ? project(head.x, head.y + 0.45, head.z) : null;
      let icon = shownIcons.get(id);
      if (!at || at.behind) { if (icon) icon.style.display = 'none'; continue; }
      if (!icon) { icon = el('div', { class: 'voice-speaker', 'data-peer': id }); icon.innerHTML = SPEAKER_SVG; icons.append(icon); shownIcons.set(id, icon); }
      icon.style.display = '';
      icon.style.transform = `translate(${Math.round(at.x - 13)}px, ${Math.round(at.y - 26)}px)`;
    }
  }

  // ---- a small dialog of its own ----
  let dialog = null;
  function openDialog(build) {
    closeDialog();
    const box = el('div', { class: 'voice-dialog', role: 'dialog', 'aria-modal': 'true' });
    const card = el('div', { class: 'voice-card' });
    box.append(card);
    box.addEventListener('pointerdown', (e) => { if (e.target === box) closeDialog(); });
    box.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') closeDialog(); });
    document.body.append(box);
    dialog = { box, card, rebuild: () => { card.textContent = ''; build(card); } };
    dialog.rebuild();
    const first = card.querySelector('button');
    if (first) first.focus({ preventScroll: true });
    return dialog;
  }
  function closeDialog() { if (dialog) { dialog.box.remove(); dialog = null; } }
  const ask = (title, text, buttons) => new Promise((resolve) => {
    openDialog((card) => {
      card.append(el('h3', null, title), ...(Array.isArray(text) ? text : [text]).map((t) => el('p', null, t)),
        el('div', { class: 'actions' }, buttons.map(([label, value, kind, id]) => el('button', { class: `btn ${kind || ''}`, type: 'button', ...(id ? { id } : {}), onclick: () => { closeDialog(); resolve(value); } }, label))));
    });
    // (closed without an answer)
    const box = dialog.box;
    const watch = new MutationObserver(() => { if (!box.isConnected) { watch.disconnect(); resolve(null); } });
    watch.observe(document.body, { childList: true });
  });

  // ---- turning it on, the first time and every time ----
  async function turnOn() {
    if (!online || !online.available || !online.signedIn) { toast({ type: 'note', text: 'Sign in to use voice chat.' }); return false; }
    const st = await voice.refreshStatus();
    if (!st.ok) { toast({ type: 'note', text: 'Voice chat can\'t connect just now. Try again in a moment.' }); return false; }
    const status = voice.status;
    if (status.adult === null) {
      const go = await ask('Voice chat', ['Talk out loud with players near you: they hear you, you hear them, as in real life. It uses mobile data while people are talking (up to about 11 MB an hour for each person talking near you).', 'What you say is never recorded or kept.'], [['Continue', true, 'primary', 'voice-intro-yes'], ['Not now', false, 'quiet', 'voice-intro-no']]);
      if (!go) return false;
      const adult = await ask('Are you 18 or older?', 'Voice chat is for players aged 18 and over. You are asked this once.', [['Yes, I am 18 or older', true, 'primary', 'voice-age-yes'], ['No', false, 'quiet', 'voice-age-no']]);
      if (adult === null) return false;
      const said = await voice.setAge(adult);
      if (!said.ok) { toast({ type: 'note', text: said.message || 'That could not be saved. Try again.' }); return false; }
      if (!adult) { await ask('Voice chat', 'Voice chat is for players aged 18 and over, so it stays off. Everything else in the game is the same.', [['OK', true, 'primary', 'voice-age-ok']]); return false; }
    }
    const started = await voice.start();
    if (!started.ok) {
      if (started.code === 'AGE') return turnOn();
      await ask('Voice chat', started.message || 'Voice chat could not start.', [['OK', true, 'primary', 'voice-start-ok']]);
      return false;
    }
    toast({ type: 'note', text: voice.prefs.mode === 'open' ? 'Voice chat on: open mic. Players near you hear you when you speak.' : 'Voice chat on. Hold the microphone button (or B) to talk.' });
    return true;
  }
  // voice chat left on last time: started again at a tap (a phone lets the microphone start only then), or by itself
  // where the browser already allows the microphone
  let waking = false;
  async function wake({ quiet = false } = {}) {
    if (waking || voice.active || !voice.on) return;
    waking = true;
    try {
      const started = await voice.start();
      if (!started.ok && !quiet) {
        if (started.code === 'AGE') await turnOn();
        else await ask('Voice chat', started.message || 'Voice chat could not start.', [['OK', true, 'primary', 'voice-start-ok']]);
      }
      if (!started.ok && (started.code === 'UNDER_18' || started.code === 'BANNED')) voice.turnOff();
    } finally { waking = false; }
  }
  async function wakeIfAllowed() {
    if (!voice.on || voice.active || !online || !online.signedIn) return;
    let granted = false;
    try { const p = await navigator.permissions.query({ name: 'microphone' }); granted = p.state === 'granted'; } catch (error) { /* not asked here */ }
    if (granted) await wake({ quiet: true });
  }
  // a warning from an administrator, shown once
  async function showWarning() {
    if (!online || !online.signedIn) return;
    const st = await voice.refreshStatus();
    if (st.ok && voice.status && voice.status.warning) {
      await ask('A message from PostCivilWar', voice.status.warning, [['I understand', true, 'primary', 'voice-warning-ok']]);
      await voice.seen();
    }
  }

  // ---- the players near you ----
  let reporting = null;     // { id, name, reason, note, sent }
  let nearbySeen = '', nearbyAt = 0;
  const nearbyWord = () => voice.nearby().map((q) => `${q.id}:${Math.round(q.d / 3)}:${q.connected ? 1 : 0}:${q.talking ? 1 : 0}`).join('|');
  function openNearby() {
    nearbySeen = nearbyWord();
    const d = openDialog((card) => {
      if (reporting) { reportForm(card); return; }
      const list = voice.nearby();
      card.append(el('h3', null, 'Players nearby'),
        el('div', { class: 'setrow' }, el('span', null, 'Mute everyone'), el('button', { class: 'switch', type: 'button', role: 'switch', id: 'voice-mute-all', 'aria-checked': String(voice.muteAll), 'aria-label': 'Mute everyone', onclick: () => { voice.setMuteAll(!voice.muteAll); dialog.rebuild(); } })));
      if (!list.length) card.append(el('p', { class: 'small', id: 'voice-nobody' }, 'Nobody with voice chat on is near you just now.'));
      card.append(el('div', { class: 'rows', id: 'voice-list' }, list.map((q) => el('div', { class: 'voice-person', 'data-name': q.name },
        el('div', { class: 'who' }, el('b', null, q.name), el('span', { class: 'small' }, ` ${Math.round(q.d)} m${q.talking ? ' · talking' : ''}${q.connected ? '' : q.d <= 40 ? ' · connecting' : ''}`)),
        el('div', { class: 'acts' },
          el('button', { class: 'btn', type: 'button', 'data-act': 'mute', onclick: () => { voice.mute(q.name, !voice.isMuted(q.name)); dialog.rebuild(); } }, voice.prefs.muted.includes(q.name) ? 'Unmute' : 'Mute'),
          el('button', { class: 'btn', type: 'button', 'data-act': 'block', onclick: async () => {
            const sure = await ask(`Block ${q.name}?`, 'You will never hear each other again, and you will not be put in touch. You can unblock them in Settings.', [['Block', true, 'primary danger', 'voice-block-yes'], ['Cancel', false, 'quiet']]);
            if (sure) { const r = await voice.block(q.id); toast({ type: r.ok ? 'note' : 'warn', text: r.ok ? `${q.name} is blocked.` : r.message }); }
            openNearby();
          } }, 'Block'),
          el('button', { class: 'btn', type: 'button', 'data-act': 'report', onclick: () => { reporting = { id: q.id, name: q.name, reason: '', note: '' }; dialog.rebuild(); } }, 'Report'))))),
      el('div', { class: 'actions' }, el('button', { class: 'btn quiet', type: 'button', id: 'voice-list-close', onclick: () => closeDialog() }, 'Close')));
    });
    d.kind = 'nearby';
  }
  // (the list kept up to date while it is open: who comes and goes, how far, talking; not while a report is written)
  function keepNearby() {
    if (!dialog || dialog.kind !== 'nearby' || reporting) return;
    const t = performance.now();
    if (t - nearbyAt < 1000) return;
    nearbyAt = t;
    const word = nearbyWord();
    if (word !== nearbySeen) { nearbySeen = word; dialog.rebuild(); }
  }
  function reportForm(card) {
    const r = reporting;
    const note = el('textarea', { class: 'field', rows: '2', maxlength: '400', id: 'voice-report-note', placeholder: 'What happened (optional)' }, r.note);
    note.addEventListener('input', () => { r.note = note.value; });
    const msg = el('p', { class: 'small', id: 'voice-report-said', hidden: '' });
    const send = el('button', { class: 'btn primary', type: 'button', id: 'voice-report-send', disabled: r.reason ? null : '', onclick: async () => {
      send.disabled = true;
      const answer = await voice.report(r.id, r.reason, r.note, place());
      if (answer.ok) { reporting = null; closeDialog(); toast({ type: 'note', text: `Thank you. Your report about ${r.name} has been sent.` }); } else { msg.hidden = false; msg.textContent = answer.message || 'The report could not be sent. Try again.'; send.disabled = false; }
    } }, 'Send report');
    card.append(el('h3', null, `Report ${r.name}`), el('p', { class: 'small' }, 'Why are you reporting them?'),
      el('div', { class: 'chips', role: 'radiogroup', id: 'voice-reasons' }, REASONS.map(([id, label]) => el('button', { class: 'chip', type: 'button', role: 'radio', 'aria-checked': String(r.reason === id), 'data-reason': id, onclick: () => { r.reason = id; dialog.rebuild(); } }, label))),
      note, msg, el('p', { class: 'small' }, 'The report goes to the game\'s administrators with the date and where you are in town. You can also block them.'),
      el('div', { class: 'actions' }, send, el('button', { class: 'btn quiet', type: 'button', onclick: () => { reporting = null; dialog.rebuild(); } }, 'Back')));
  }

  // ---- Settings ----
  let testing = null;     // { until, timer, hear }
  function settingsSection(root, { section, toggle, redraw }) {
    root.append(section('Voice chat'));
    const st = voice.status;
    const p = voice.prefs;
    const rows = el('div', { class: 'rows', id: 'voice-settings' },
      el('div', { class: 'setrow' }, el('span', null, 'Voice chat with players near you'), toggle('voice-on', voice.on, 'Voice chat', async (on) => { if (on) await turnOn(); else voice.turnOff(); redraw(); })),
      el('div', { class: 'setrow' }, el('span', null, 'How you talk'), el('div', { class: 'segment', role: 'group', 'aria-label': 'How you talk' },
        el('button', { class: 'chip', type: 'button', id: 'voice-mode-ptt', 'aria-pressed': String(p.mode !== 'open'), onclick: () => { voice.setMode('ptt'); redraw(); } }, 'Push to talk'),
        el('button', { class: 'chip', type: 'button', id: 'voice-mode-open', 'aria-pressed': String(p.mode === 'open'), onclick: () => { voice.setMode('open'); redraw(); } }, 'Open mic'))));
    const fader = (id, label, value, max, set) => {
      const shown = el('span', { class: 'mono' }, `${Math.round(value * 100)}`);
      const slider = el('input', { type: 'range', min: '0', max: String(max), step: '5', value: String(Math.round(value * 100)), id, 'aria-label': label });
      const fill = () => slider.style.setProperty('--fill', `${(slider.value / max) * 100}%`);
      fill();
      slider.addEventListener('input', () => { shown.textContent = slider.value; fill(); set(Number(slider.value) / 100); });
      return el('label', { class: 'fader' }, el('span', null, label), slider, shown);
    };
    const meter = el('div', { class: 'voice-meter', id: 'voice-meter', role: 'meter', 'aria-label': 'Microphone level', 'aria-valuemin': '0', 'aria-valuemax': '100' }, el('i'));
    const testBtn = el('button', { class: 'btn', type: 'button', id: 'voice-test', onclick: async () => {
      if (testing) { stopTest(); redraw(); return; }
      try { await voice.openMic(); } catch (error) { toast({ type: 'warn', text: 'The microphone could not be opened. You can allow it in your browser\'s settings.' }); return; }
      testing = { until: performance.now() + 15000, hear: false };
      const tick = () => {
        if (!testing) return;
        const v = Math.min(1, voice.micLevel() * 8);
        meter.firstChild.style.width = `${Math.round(v * 100)}%`; meter.setAttribute('aria-valuenow', String(Math.round(v * 100)));
        if (performance.now() > testing.until) { stopTest(); redraw(); return; }
        testing.timer = requestAnimationFrame(tick);
      };
      tick(); redraw();
    } }, testing ? 'Stop the test' : 'Test your microphone');
    const hear = el('button', { class: 'btn quiet', type: 'button', id: 'voice-hear', hidden: testing ? null : '', 'aria-pressed': String(!!(testing && testing.hear)), onclick: () => { if (!testing) return; testing.hear = !testing.hear; voice.hearSelf(testing.hear); redraw(); } }, testing && testing.hear ? 'Stop hearing yourself' : 'Hear yourself');
    root.append(rows,
      el('div', { class: 'rows faders' }, fader('voice-mic-volume', 'Microphone', p.mic, 200, (v) => voice.setMicVolume(v)), fader('voice-volume', 'Voices', p.voices, 150, (v) => voice.setVoicesVolume(v))),
      el('div', { class: 'actions' }, testBtn, hear), testing ? meter : el('span'));
    // the players blocked
    const blocked = st && st.blocked ? st.blocked : [];
    root.append(el('div', { class: 'rows', id: 'voice-blocked' }, blocked.length ? blocked.map((b) => el('div', { class: 'setrow' }, el('span', null, b.username), el('button', { class: 'btn', type: 'button', 'data-unblock': b.username, onclick: async () => { await voice.unblock(b.id); redraw(); } }, 'Unblock'))) : [el('div', { class: 'setrow' }, el('span', { class: 'small' }, 'You have not blocked anyone.'))]));
    root.append(el('p', { class: 'small' }, `${p.mode === 'open' ? 'Open mic sends your voice only while you are speaking.' : 'Hold the microphone button (or B on a keyboard) to talk.'} Voice chat uses mobile data while people are talking, up to about 11 MB an hour for each person talking near you. It is for players aged 18 and over. Nothing anyone says is recorded or kept.`));
    if (online && online.signedIn && !st) voice.refreshStatus().then((a) => { if (a.ok) redraw(); });
  }
  function stopTest() { if (!testing) return; cancelAnimationFrame(testing.timer); voice.hearSelf(false); testing = null; if (!voice.active) { /* the microphone stays open only while voice chat is */ } }

  // ---- the Admin app: voice reports ----
  const admin = { list: null, at: 0, status: 'open', busy: false, error: '', messages: {}, account: '' };
  async function loadReports(force = false) {
    // (asked again when the page is opened after a while: new reports come in)
    if (admin.busy || (admin.list && !force && Date.now() - admin.at < 15000)) return;
    admin.busy = true;
    const a = await online.ask('admin.voice.reports', { status: admin.status });
    admin.busy = false;
    if (a.ok) { admin.list = a.reports; admin.at = Date.now(); admin.error = ''; } else admin.error = a.message;
    if (admin.redraw) admin.redraw();
  }
  function adminPage(root, redraw) {
    admin.redraw = redraw;
    if (!isAdmin()) { root.append(el('p', { class: 'small' }, 'Only an administrator can open this.')); return; }
    root.append(el('div', { class: 'adchips' },
      el('button', { class: 'chip', type: 'button', 'aria-pressed': String(admin.status === 'open'), id: 'voice-reports-open', onclick: () => { admin.status = 'open'; admin.list = null; loadReports(true); redraw(); } }, 'Open reports'),
      el('button', { class: 'chip', type: 'button', 'aria-pressed': String(admin.status === 'all'), id: 'voice-reports-all', onclick: () => { admin.status = 'all'; admin.list = null; loadReports(true); redraw(); } }, 'All reports')));
    loadReports();
    if (admin.error) root.append(el('div', { class: 'notice' }, admin.error));
    else if (!admin.list) root.append(el('p', { class: 'small' }, 'Asking the server...'));
    else if (!admin.list.length) root.append(el('p', { class: 'small', id: 'voice-reports-none' }, admin.status === 'open' ? 'No voice chat reports are waiting.' : 'Nobody has been reported yet.'));
    else root.append(el('div', { class: 'rows', id: 'voice-reports' }, admin.list.map((r) => reportCard(r))));
    // an account's ban undone, or its age set
    const name = el('input', { class: 'field', id: 'voice-admin-user', placeholder: 'Username', maxlength: '32', value: admin.account });
    name.addEventListener('input', () => { admin.account = name.value; });
    const act = (body, done) => async () => { const a = await online.ask('admin.voice.account', { username: admin.account, ...body }); toast({ type: a.ok ? 'note' : 'warn', text: a.ok ? done : a.message }); };
    root.append(el('h4', null, 'An account'), name, el('div', { class: 'actions wrap' },
      el('button', { class: 'btn', type: 'button', onclick: act({ unbanVoice: true }, 'Voice chat opened to them again.') }, 'Undo voice ban'),
      el('button', { class: 'btn', type: 'button', onclick: act({ unbanGame: true }, 'They can play again.') }, 'Undo game ban'),
      el('button', { class: 'btn', type: 'button', onclick: act({ adult: true }, 'Set as 18 or over.') }, 'Set as 18 or over'),
      el('button', { class: 'btn', type: 'button', onclick: act({ adult: false }, 'Set as under 18: voice chat kept off.') }, 'Set as under 18')));
  }
  function reportCard(r) {
    const msg = el('textarea', { class: 'field', rows: '2', maxlength: '400', placeholder: 'A message to them (optional: a standard one is sent otherwise)' }, admin.messages[r.id] || '');
    msg.addEventListener('input', () => { admin.messages[r.id] = msg.value; });
    const decide = (action) => async () => {
      const a = await online.ask('admin.voice.decide', { report: r.id, action, message: admin.messages[r.id] || '' });
      toast({ type: a.ok ? 'note' : 'warn', text: a.ok ? `${ACTION_WORDS[action]}: ${r.reported}.` : a.message });
      admin.list = null; loadReports(true);
    };
    const when = r.at ? new Date(r.at).toLocaleString() : '';
    return el('div', { class: 'adcard', 'data-voice-report': String(r.id) },
      el('div', { class: 'adcardhead' }, el('b', null, r.reported), el('span', { class: 'tag' }, STATUS_WORDS[r.status] || r.status)),
      el('div', { class: 'eyebrow plain' }, `${REASONS.find(([id]) => id === r.reason)[1]} · reported by ${r.reporter} · ${when}`),
      r.note ? el('p', null, r.note) : el('span'),
      el('p', { class: 'small' }, `${r.place ? `In town at ${Math.round(r.place.x)}, ${Math.round(r.place.z)}. ` : ''}Reports about ${r.reported}: ${r.reportsOnThem}.${r.voiceBannedUntil ? ` No voice until ${new Date(r.voiceBannedUntil).toLocaleDateString()}.` : ''}${r.gameBanned ? ' Banned from the game.' : ''}${r.decidedBy ? ` Decided by ${r.decidedBy}.` : ''}`),
      r.status === 'open' ? [msg, el('div', { class: 'actions wrap' }, Object.keys(ACTION_WORDS).map((action) => el('button', { class: `btn ${action === 'gameBan' ? 'danger' : ''}`, type: 'button', 'data-action': action, onclick: decide(action) }, ACTION_WORDS[action])))] : el('span'));
  }

  return { frame, turnOn, wake, wakeIfAllowed, showWarning, openNearby, settingsSection, adminPage, close: closeDialog, get dialogOpen() { return !!dialog; } };
}
