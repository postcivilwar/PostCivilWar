// Voice chat between players (29 October 2026, the owner's brief for voice chat, stage 1): players near each other in
// town hear each other talk, as they talk, wherever they are in the world.
//
// The voices go from one device to another (WebRTC), never through the website's server; through Cloudflare's relay
// only where a network will not let two devices reach each other. Before two devices can talk they exchange a
// description of themselves (an offer, then an answer); those go with the game's words about where the player is
// (online.js, `presence`), and the server passes each on to the other's game at its next word (api/_lib/voice.js) — only
// between two players near each other who both have voice on, are allowed it, and have not blocked each other.
//
//   who               each player is put in touch with the nearest few (VOICE_CHAT.most) who are in reach (within
//                     VOICE_CHAT.connect metres), and let go of beyond VOICE_CHAT.drop, or when nearer ones come
//   heard             within VOICE_CHAT.reach metres, louder close by, fading with distance, from where they stand (the
//                     game's own sound, audio.js `playerVoice`), muffled when a building stands between (`walls`)
//   sent              push-to-talk (held), or open mic (sent only while the player is speaking); Opus, one channel, at
//                     VOICE_CHAT.bitrate, with the browser's echo cancelling, noise suppression and level keeping
//   kept              nothing: no voice is recorded or kept, here or anywhere
//
// Which of the two makes the offer: the one whose id comes first, so that two games never offer to each other at once.

export const VOICE_CHAT = Object.freeze({
  most: 5,            // players talked with at once: the nearest
  keepRank: 7,        // one already in touch is kept while among the nearest this many (so that a crowd does not churn)
  connect: 40,        // metres: put in touch from here (ready before they are heard)
  drop: 50,           // metres: let go beyond
  reach: 25,          // metres: heard within
  bitrate: 24000,     // bits a second, Opus, one channel
  gather: 2500,       // ms to wait for a device's ways to be reached before its offer or answer goes
  wait: 12000,        // ms an offer waits for its answer before it is let go
  retry: 10000,       // ms before trying again with someone it did not work with
  vad: 0.018,         // the level of the microphone (RMS, 0..1) taken for speaking, with open mic
  hang: 600,          // ms open mic keeps sending after the player stops speaking
  talking: 0.012,     // the level of a voice heard taken for that player talking (the speaker over their head)
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Opus as the brief asks: one channel, low and steady, silence sent as almost nothing, and what is lost on the way
// covered for (a description's own settings for its audio, rewritten before it is set)
export function tuneOpus(sdp, bitrate = VOICE_CHAT.bitrate) {
  const m = /a=rtpmap:(\d+) opus\/48000/i.exec(sdp);
  if (!m) return sdp;
  const pt = m[1];
  const want = { minptime: '10', useinbandfec: '1', usedtx: '1', stereo: '0', 'sprop-stereo': '0', maxaveragebitrate: String(bitrate), maxplaybackrate: '24000' };
  const line = new RegExp(`a=fmtp:${pt} ([^\\r\\n]*)`);
  const found = line.exec(sdp);
  if (found) {
    const params = new Map(found[1].split(';').map((kv) => kv.trim()).filter(Boolean).map((kv) => { const i = kv.indexOf('='); return i < 0 ? [kv, ''] : [kv.slice(0, i), kv.slice(i + 1)]; }));
    for (const [k, v] of Object.entries(want)) params.set(k, v);
    return sdp.replace(line, `a=fmtp:${pt} ${[...params].map(([k, v]) => (v === '' ? k : `${k}=${v}`)).join(';')}`);
  }
  return sdp.replace(new RegExp(`(a=rtpmap:${pt} opus/48000[^\\r\\n]*)`, 'i'), `$1\r\na=fmtp:${pt} ${Object.entries(want).map(([k, v]) => `${k}=${v}`).join(';')}`);
}

// `online`: the website's server (online.js). `audio`: the game's sound (audio.js). `peers()`: the other players as the
// game shows them, [{ id (the server's, 'u…'), x, z, name }]. `me()`: { x, z } of this player. `walls(x1, z1, x2, z2)`:
// whether a building stands between. `store`: { get(), set(value) } for this player's own choices on this device.
export function createVoiceChat({ online, audio, peers = () => [], me = () => null, walls = () => false, store = null, zone = '', now = () => performance.now(), RTC = (typeof window !== 'undefined' ? window.RTCPeerConnection : null), media = (typeof navigator !== 'undefined' ? navigator.mediaDevices : null), makeAudio = () => (typeof document !== 'undefined' ? document.createElement('audio') : null) } = {}) {
  const prefs = { on: false, mode: 'ptt', mic: 1, voices: 1, muted: [], ...((store && store.get()) || {}) };
  const save = () => { if (store) store.set({ ...prefs }); };
  const listeners = new Set();
  const changed = () => { for (const fn of [...listeners]) { try { fn(); } catch (error) { /* a listener's own */ } } };

  let status = null;               // the server's word: { adult, allowed, bannedUntil, warning, blocked }
  let ice = null;                  // { iceServers, relay, at, ttl }
  let mic = null;                  // { stream, track (sent), raw, meter, gain, ctxSource }
  let myId = null;
  let allowedIds = new Set();      // the players near this one the server says may be talked with
  const links = new Map();         // peer id -> link
  const outbox = [];
  const cooling = new Map();       // peer id -> until when not tried again
  let pressed = false, speakingUntil = 0, sending = false;
  let muteAll = false;
  let paused = false;
  let note = '';                   // a calm word for the player (voice cannot connect here, and the like)
  let failures = 0, successes = 0;
  let lastLook = 0;
  const stats = { offers: 0, answers: 0, connected: 0, failed: 0, relayed: 0, bytesSent: 0, bytesReceived: 0 };

  const say = (text) => { if (note !== text) { note = text; changed(); } };
  const blockedIds = () => new Set((status && status.blocked ? status.blocked : []).map((b) => b.id));

  // ---- the server ----

  async function refreshStatus() {
    const answer = await online.ask('voice.status');
    if (answer.ok) { status = answer.voice; changed(); }
    return answer;
  }
  async function getIce() {
    if (ice && now() - ice.at < (ice.ttl - 600) * 1000) return ice;
    const answer = await online.ask('voice.ice');
    if (!answer.ok) return null;
    ice = { iceServers: answer.iceServers, relay: !!answer.relay, ttl: answer.ttl || 3600, at: now() };
    return ice;
  }

  // ---- the microphone ----

  async function openMic() {
    if (mic) return mic;
    if (!media || !media.getUserMedia) throw Object.assign(new Error('no microphone here'), { code: 'NO_MIC' });
    const raw = await media.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }, video: false });
    const rawTrack = raw.getAudioTracks()[0];
    let track = rawTrack, meter = null, gain = null;
    // (through the game's sound, so that the microphone's volume can be set and its level read; where that cannot be,
    // the microphone as it is)
    const piped = audio && audio.micPipe ? audio.micPipe(raw) : null;
    if (piped) { track = piped.track; meter = piped.meter; gain = piped.gain; }
    if (gain) gain.gain.value = prefs.mic;
    track.enabled = false;
    mic = { raw, rawTrack, track, meter, gain, piped };
    // (the microphone taken away by the device: voice stops, calmly)
    rawTrack.addEventListener('ended', () => { closeMic(); say('The microphone stopped. Turn voice chat off and on to start it again.'); });
    return mic;
  }
  function closeMic() {
    if (!mic) return;
    try { mic.raw.getTracks().forEach((t) => t.stop()); } catch (error) { /* gone */ }
    if (mic.piped && mic.piped.close) mic.piped.close();
    mic = null;
  }
  const level = () => (mic && mic.meter ? mic.meter() : 0);

  // ---- one other player ----

  function makeLink(id, role) {
    const pc = new RTC({ iceServers: ice ? ice.iceServers : [], bundlePolicy: 'max-bundle' });
    const link = { id, pc, role, state: 'new', at: now(), voice: null, el: null, talking: false, level: 0, muffled: false, relayed: null, bytes: { sent: 0, received: 0 } };
    if (mic) { const sender = pc.addTrack(mic.track, new MediaStream([mic.track])); link.sender = sender; }
    else pc.addTransceiver('audio', { direction: 'recvonly' });
    pc.ontrack = (event) => {
      const stream = event.streams && event.streams[0] ? event.streams[0] : new MediaStream([event.track]);
      // (some browsers play a voice through the game's sound only once it is also given to an element, which is kept silent)
      const el = makeAudio();
      if (el) { el.muted = true; el.autoplay = true; el.setAttribute('playsinline', ''); el.srcObject = stream; const p = el.play(); if (p && p.catch) p.catch(() => {}); }
      link.el = el;
      link.voice = audio && audio.playerVoice ? audio.playerVoice(stream, { reach: VOICE_CHAT.reach }) : null;
      // (no game sound to put it through: the element itself plays it, louder as they come near)
      if (!link.voice && el) { el.muted = false; link.plain = true; }
      changed();
    };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'connected' && link.state !== 'connected') { link.state = 'connected'; stats.connected += 1; successes += 1; if (note) say(''); limitBitrate(link); whichWay(link); changed(); }
      if (s === 'failed') { stats.failed += 1; failures += 1; drop(id, false); cooling.set(id, now() + VOICE_CHAT.retry); if (failures >= 2 && !successes) say('Voice chat can\'t connect on this network.'); }
      if (s === 'disconnected') setTimeout(() => { if (links.get(id) === link && pc.connectionState === 'disconnected') { drop(id, false); cooling.set(id, now() + 2000); } }, 5000);
    };
    links.set(id, link);
    return link;
  }
  async function limitBitrate(link) {
    try {
      const s = link.sender || link.pc.getSenders().find((x) => x.track && x.track.kind === 'audio');
      if (!s || !s.getParameters) return;
      const p = s.getParameters();
      if (!p.encodings || !p.encodings.length) p.encodings = [{}];
      p.encodings[0].maxBitrate = VOICE_CHAT.bitrate;
      await s.setParameters(p);
    } catch (error) { /* the description already asks for it */ }
  }
  // whether the voice goes through the relay (for the tests and the readout)
  async function whichWay(link) {
    try {
      const report = await link.pc.getStats();
      let pair = null;
      report.forEach((s) => { if (s.type === 'transport' && s.selectedCandidatePairId) pair = report.get(s.selectedCandidatePairId); });
      if (!pair) report.forEach((s) => { if (s.type === 'candidate-pair' && (s.selected || s.nominated) && s.state === 'succeeded') pair = s; });
      const local = pair ? report.get(pair.localCandidateId) : null;
      link.relayed = local ? local.candidateType === 'relay' : null;
      if (link.relayed) stats.relayed += 1;
      changed();
    } catch (error) { /* not known */ }
  }
  // a description of this device, with every way it can be reached (or what was found in the time given)
  async function described(pc) {
    if (pc.iceGatheringState !== 'complete') {
      await Promise.race([new Promise((done) => { const on = () => { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', on); done(); } }; pc.addEventListener('icegatheringstatechange', on); }), sleep(VOICE_CHAT.gather)]);
    }
    return pc.localDescription ? pc.localDescription.sdp : '';
  }
  async function offerTo(id) {
    const link = makeLink(id, 'offer');
    link.state = 'offering';
    try {
      const offer = await link.pc.createOffer();
      await link.pc.setLocalDescription({ type: 'offer', sdp: tuneOpus(offer.sdp) });
      const sdp = await described(link.pc);
      if (links.get(id) !== link) return;
      outbox.push({ to: id, k: 'offer', d: sdp });
      stats.offers += 1;
      link.state = 'offered'; link.at = now();
    } catch (error) { drop(id, false); cooling.set(id, now() + VOICE_CHAT.retry); }
  }
  async function answerTo(id, sdp) {
    // an offer from someone already being offered to: the one whose turn it is wins (ids in order)
    const had = links.get(id);
    if (had) { if (had.role === 'offer' && myId && myId < id) return; drop(id, false); }
    if (!wanted(id)) { outbox.push({ to: id, k: 'bye' }); return; }
    const link = makeLink(id, 'answer');
    link.state = 'answering';
    try {
      await link.pc.setRemoteDescription({ type: 'offer', sdp });
      const answer = await link.pc.createAnswer();
      await link.pc.setLocalDescription({ type: 'answer', sdp: tuneOpus(answer.sdp) });
      const mine = await described(link.pc);
      if (links.get(id) !== link) return;
      outbox.push({ to: id, k: 'answer', d: mine });
      stats.answers += 1;
      link.state = 'answered'; link.at = now();
    } catch (error) { drop(id, false); cooling.set(id, now() + VOICE_CHAT.retry); }
  }
  async function answered(id, sdp) {
    const link = links.get(id);
    if (!link || link.role !== 'offer' || link.pc.signalingState !== 'have-local-offer') return;
    try { await link.pc.setRemoteDescription({ type: 'answer', sdp }); link.state = 'connecting'; link.at = now(); } catch (error) { drop(id, false); cooling.set(id, now() + VOICE_CHAT.retry); }
  }
  function drop(id, tell = true) {
    const link = links.get(id);
    if (!link) return;
    links.delete(id);
    try { link.pc.close(); } catch (error) { /* closed */ }
    if (link.voice) link.voice.stop();
    if (link.el) { try { link.el.srcObject = null; link.el.remove(); } catch (error) { /* gone */ } }
    if (tell) outbox.push({ to: id, k: 'bye' });
    changed();
  }

  // ---- who to be in touch with ----

  // the players near this one who may be talked with, nearest first: [{ id, d, x, z, name }]
  function nearby() {
    const self = me();
    if (!self) return [];
    const blocked = blockedIds();
    return peers().filter((q) => allowedIds.has(q.id) && !blocked.has(q.id)).map((q) => ({ ...q, d: Math.hypot(q.x - self.x, q.z - self.z) })).sort((a, b) => a.d - b.d);
  }
  function wanted(id) {
    const near = nearby();
    const k = near.findIndex((q) => q.id === id);
    return k >= 0 && k < VOICE_CHAT.keepRank && near[k].d <= VOICE_CHAT.drop;
  }
  function choose() {
    if (!active()) return;
    const near = nearby();
    const t = now();
    // let go: too far, no longer allowed or near enough, or an offer not answered in time
    for (const [id, link] of links) {
      const k = near.findIndex((q) => q.id === id);
      const waitedTooLong = (link.state === 'offered' || link.state === 'connecting' || link.state === 'answered') && t - link.at > VOICE_CHAT.wait;
      if (k < 0 || k >= VOICE_CHAT.keepRank || near[k].d > VOICE_CHAT.drop || waitedTooLong) { drop(id, true); if (waitedTooLong) { cooling.set(id, t + VOICE_CHAT.retry); failures += 1; if (failures >= 3 && !successes) say('Voice chat can\'t connect on this network.'); } }
    }
    // put in touch: the nearest few within reach, the one whose id comes first making the offer
    for (const q of near.slice(0, VOICE_CHAT.most)) {
      if (q.d > VOICE_CHAT.connect || links.has(q.id) || links.size >= VOICE_CHAT.keepRank) continue;
      if ((cooling.get(q.id) || 0) > t) continue;
      if (myId && myId < q.id) offerTo(q.id);
    }
  }

  // ---- with each word to the server ----

  const active = () => prefs.on && !!mic && !paused && !!(status && status.allowed);
  function body() {
    if (!prefs.on || !status || !status.allowed) return outbox.length ? { on: false, out: outbox.splice(0) } : null;
    return { on: active(), out: outbox.splice(0) };
  }
  function answer(word) {
    if (!word) return;
    if (word.me) myId = word.me;
    allowedIds = new Set(Array.isArray(word.ok) ? word.ok : []);
    if (word.no && prefs.on) { status = { ...(status || {}), allowed: false }; stop(); say(word.no === 'BANNED' ? 'Voice chat is closed to your account.' : 'Voice chat is for players aged 18 and over.'); }
    for (const s of Array.isArray(word.in) ? word.in : []) {
      if (!s || typeof s.from !== 'string') continue;
      if (s.k === 'bye') { drop(s.from, false); continue; }
      if (!active()) continue;
      if (s.k === 'offer' && typeof s.d === 'string') answerTo(s.from, s.d);
      if (s.k === 'answer' && typeof s.d === 'string') answered(s.from, s.d);
    }
    choose();
  }
  const urgent = () => outbox.length > 0 || [...links.values()].some((l) => l.state === 'offered' || l.state === 'answered');

  // ---- sending ----

  function setSending(on) {
    if (sending === on) return;
    sending = on;
    if (mic) mic.track.enabled = on;
    changed();
  }
  // Each frame: where each voice comes from, whether a building is between, how loud; who is talking; open mic.
  function update() {
    const t = now();
    if (prefs.mode === 'open' && mic) { if (level() > VOICE_CHAT.vad) speakingUntil = t + VOICE_CHAT.hang; setSending(active() && t < speakingUntil); } else setSending(active() && pressed);
    const self = me();
    const shown = new Map(peers().map((q) => [q.id, q]));
    const muted = new Set(prefs.muted);
    const look = t - lastLook > 400;
    if (look) lastLook = t;
    let any = false;
    for (const link of links.values()) {
      const q = shown.get(link.id);
      if (!q || !self) continue;
      const d = Math.hypot(q.x - self.x, q.z - self.z);
      if (look) link.muffled = d <= VOICE_CHAT.reach && walls(self.x, self.z, q.x, q.z);
      const silent = muteAll || muted.has(q.name);
      if (link.voice) { link.voice.move(q.x, q.z); link.voice.set({ volume: silent ? 0 : prefs.voices, muffled: link.muffled }); link.level = link.voice.level(); }
      else if (link.el && link.plain) { link.el.volume = silent ? 0 : Math.max(0, Math.min(1, prefs.voices * (1 - d / VOICE_CHAT.reach))); }
      const was = link.talking;
      link.talking = !silent && d <= VOICE_CHAT.reach && link.level > VOICE_CHAT.talking;
      if (was !== link.talking) any = true;
    }
    if (any) changed();
    if (t - (update.chose || 0) > 500) { update.chose = t; choose(); }
  }

  // ---- what the page does ----

  async function start() {
    if (!online || !online.signedIn) return { ok: false, code: 'SIGNED_OUT', message: 'Sign in to use voice chat.' };
    if (!RTC) return { ok: false, code: 'NO_RTC', message: 'Voice chat does not work in this browser.' };
    const st = await refreshStatus();
    if (!st.ok) return { ok: false, code: st.code, message: 'Voice chat can\'t connect just now. Try again in a moment.' };
    if (status.adult === null) return { ok: false, code: 'AGE', message: '' };
    if (!status.allowed) return { ok: false, code: status.adult === false ? 'UNDER_18' : 'BANNED', message: status.adult === false ? 'Voice chat is for players aged 18 and over.' : 'Voice chat is closed to your account.' };
    try { await openMic(); } catch (error) {
      return { ok: false, code: 'MIC', message: error && (error.name === 'NotAllowedError' || error.name === 'SecurityError') ? 'Voice chat needs the microphone. You can allow it in your browser\'s settings, then turn voice chat on again.' : 'No microphone could be found on this device.' };
    }
    await getIce();
    if (audio && audio.start) audio.start();
    prefs.on = true; save(); paused = false; failures = 0; successes = 0; say('');
    changed();
    return { ok: true };
  }
  function stop() {
    for (const id of [...links.keys()]) drop(id, true);
    closeMic();
    setSending(false);
    pressed = false;
    changed();
  }
  function turnOff() { prefs.on = false; save(); stop(); say(''); }

  return {
    VOICE_CHAT,
    get on() { return prefs.on; },
    get active() { return active(); },
    get sending() { return sending; },
    get note() { return note; },
    get status() { return status; },
    get prefs() { return { ...prefs, muted: [...prefs.muted] }; },
    get muteAll() { return muteAll; },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    refreshStatus, start, stop, turnOff,
    async setAge(adult) { const a = await online.ask('voice.age', { adult }); if (a.ok) { status = a.voice; changed(); } return a; },
    async seen() { await online.ask('voice.seen'); if (status) status.warning = null; },
    press() { pressed = true; update(); },
    release() { pressed = false; update(); },
    setMode(mode) { prefs.mode = mode === 'open' ? 'open' : 'ptt'; save(); changed(); },
    setMicVolume(v) { prefs.mic = Math.max(0, Math.min(2, Number(v) || 0)); save(); if (mic && mic.gain) mic.gain.gain.value = prefs.mic; },
    setVoicesVolume(v) { prefs.voices = Math.max(0, Math.min(1.5, Number(v) || 0)); save(); },
    mute(name, on = true) { const m = new Set(prefs.muted); if (on) m.add(name); else m.delete(name); prefs.muted = [...m].slice(-200); save(); changed(); },
    isMuted: (name) => muteAll || prefs.muted.includes(name),
    setMuteAll(on) { muteAll = !!on; changed(); },
    async block(id) { const a = await online.ask('voice.block', { peer: id }); if (a.ok) { status = a.voice; drop(id, true); changed(); } return a; },
    async unblock(id) { const a = await online.ask('voice.unblock', { peer: id }); if (a.ok) { status = a.voice; changed(); } return a; },
    async report(id, reason, noteText, place) { return online.ask('voice.report', { peer: id, reason, note: noteText || '', zone, x: place ? place.x : null, z: place ? place.z : null }); },
    // the game's word with the server (online.js): what goes with it, and what came back
    body, answer, urgent,
    // (a word lost on the way: its handshakes go with the next)
    unsent(list) { outbox.unshift(...list.filter((x) => x && x.k)); },
    // the player hearing their own microphone, for the test in Settings
    hearSelf(on) { if (mic && mic.piped && mic.piped.hear) mic.piped.hear(!!on); },
    update,
    // the page out of sight: the microphone stops and everyone is let go; back, it starts again (or at the next press)
    async pause() { if (paused) return; paused = true; stop(); },
    async resume() { if (!paused) return; paused = false; if (prefs.on && status && status.allowed) { try { await openMic(); } catch (error) { say('Tap the microphone button to start voice chat again.'); } } changed(); },
    // the microphone's own level now (0..1), for the test in Settings
    micLevel: level,
    async openMic() { return openMic(); },
    // who is near and talking, for the page: [{ id, name, d, connected, talking, muted, relayed }]
    nearby() {
      const muted = new Set(prefs.muted);
      return nearby().filter((q) => q.d <= VOICE_CHAT.drop).map((q) => { const l = links.get(q.id); return { id: q.id, name: q.name, d: q.d, connected: !!l && l.state === 'connected', talking: !!l && l.talking, muted: muteAll || muted.has(q.name), relayed: l ? l.relayed : null }; });
    },
    talkingIds: () => [...links.values()].filter((l) => l.talking).map((l) => l.id),
    async measure() {
      let sent = 0, received = 0;
      for (const link of links.values()) {
        try { const r = await link.pc.getStats(); r.forEach((s) => { if (s.type === 'outbound-rtp' && s.kind === 'audio') sent += s.bytesSent || 0; if (s.type === 'inbound-rtp' && s.kind === 'audio') received += s.bytesReceived || 0; }); } catch (error) { /* gone */ }
      }
      return { sent, received, links: links.size };
    },
    stats: () => ({ ...stats, links: links.size, connected: [...links.values()].filter((l) => l.state === 'connected').length, relayedNow: [...links.values()].filter((l) => l.relayed).length, myId, allowed: allowedIds.size, sending, mic: !!mic, on: prefs.on, active: active(), relay: ice ? ice.relay : null }),
    links: () => [...links.values()].map((l) => ({ id: l.id, state: l.state, role: l.role, talking: l.talking, level: l.level, heard: l.voice && l.voice.heard ? l.voice.heard() : null, muffled: l.muffled, relayed: l.relayed })),
  };
}
