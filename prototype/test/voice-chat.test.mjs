// Voice chat's own workings, without a browser (src/net/voice-chat.js): the voice's settings in a description, what goes
// with each word to the server and what is done with the answer, who makes the offer, who is put in touch.
//   node --test test/voice-chat.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceChat, tuneOpus, VOICE_CHAT } from '../src/net/voice-chat.js';

const SDP = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111 0\r\na=rtpmap:111 opus/48000/2\r\na=fmtp:111 minptime=10;useinbandfec=1\r\na=rtpmap:0 PCMU/8000\r\n';

test('Opus as the brief asks: one channel, 24 kbit/s, silence sent as almost nothing, losses covered', () => {
  const tuned = tuneOpus(SDP);
  const line = /a=fmtp:111 ([^\r\n]*)/.exec(tuned)[1];
  for (const want of ['maxaveragebitrate=24000', 'usedtx=1', 'useinbandfec=1', 'stereo=0', 'minptime=10']) assert.ok(line.split(';').includes(want), want);
  assert.equal((tuned.match(/a=fmtp:111/g) || []).length, 1);
  // a description without the line has one added after the codec's
  const bare = tuneOpus(SDP.replace('a=fmtp:111 minptime=10;useinbandfec=1\r\n', ''));
  assert.match(bare, /a=rtpmap:111 opus\/48000\/2\r\na=fmtp:111 [^\r\n]*maxaveragebitrate=24000/);
  assert.equal(tuneOpus('v=0\r\n'), 'v=0\r\n');
});

class FakeRTC {
  static made = [];
  constructor() { this.iceGatheringState = 'complete'; this.signalingState = 'stable'; this.connectionState = 'new'; this.localDescription = null; FakeRTC.made.push(this); }
  addTrack() { return { getParameters: () => ({}), setParameters: async () => {} }; }
  addTransceiver() {}
  getSenders() { return []; }
  addEventListener() {}
  async createOffer() { return { type: 'offer', sdp: SDP }; }
  async createAnswer() { return { type: 'answer', sdp: SDP }; }
  async setLocalDescription(d) { this.localDescription = d; if (d.type === 'offer') this.signalingState = 'have-local-offer'; }
  async setRemoteDescription(d) { this.remote = d; this.signalingState = d.type === 'offer' ? 'have-remote-offer' : 'stable'; }
  async getStats() { return new Map(); }
  close() { this.closed = true; }
}
function engine({ me = { x: 0, z: 0 }, peers = [], status = { adult: true, allowed: true, blocked: [] } } = {}) {
  const asked = [];
  const online = { signedIn: true, async ask(op, body) { asked.push([op, body]); if (op === 'voice.status') return { ok: true, voice: status }; if (op === 'voice.ice') return { ok: true, iceServers: [], relay: false, ttl: 3600 }; return { ok: true, voice: status }; } };
  const track = { enabled: true, stop() {}, addEventListener() {} };
  const media = { async getUserMedia() { return { getAudioTracks: () => [track], getTracks: () => [track] }; } };
  let t = 0;
  globalThis.MediaStream = class { constructor(t) { this.t = t; } };
  const v = createVoiceChat({ online, audio: null, peers: () => peers, me: () => me, RTC: FakeRTC, media, now: () => t, makeAudio: () => null });
  return { v, asked, track, tick: (ms) => { t += ms; } };
}

test('off: nothing goes with the words to the server, and the microphone is never opened', () => {
  const { v } = engine();
  assert.equal(v.on, false);
  assert.equal(v.body(), null);
  assert.equal(v.stats().mic, false);
});

test('on: the nearest few put in touch, the one whose id comes first making the offer; one too far, not', async () => {
  const peers = [{ id: 'u5', x: 3, z: 0, name: 'b' }, { id: 'u1', x: 5, z: 0, name: 'a' }, { id: 'u7', x: 45, z: 0, name: 'c' }];
  const { v } = engine({ peers });
  assert.deepEqual(await v.start(), { ok: true });
  assert.equal(v.body().on, true);
  v.answer({ me: 'u3', ok: ['u5', 'u1', 'u7'], in: [] });
  await new Promise((r) => setTimeout(r, 10));
  const out = v.body().out;
  // u3 < u5: an offer to u5; u1 < u3: u1 offers, so none to it; u7 beyond 40 m
  assert.deepEqual(out.map((s) => [s.to, s.k]), [['u5', 'offer']]);
  assert.ok(v.urgent());
  // the offer from u1 is answered
  v.answer({ me: 'u3', ok: ['u5', 'u1', 'u7'], in: [{ from: 'u1', k: 'offer', d: SDP }] });
  await new Promise((r) => setTimeout(r, 10));
  const answered = v.body().out;
  assert.deepEqual(answered.map((s) => [s.to, s.k]), [['u1', 'answer']]);
  assert.match(answered[0].d, /maxaveragebitrate=24000/);
});

test('push to talk: the microphone sends only while the button is held', async () => {
  const { v, track } = engine();
  await v.start();
  v.update();
  assert.equal(track.enabled, false);
  v.press();
  assert.equal(v.sending, true);
  v.release();
  assert.equal(v.sending, false);
});

test('one not allowed by the server (blocked, too young, banned) is never offered; a ban from the server stops voice', async () => {
  const peers = [{ id: 'u9', x: 3, z: 0, name: 'z' }];
  const { v } = engine({ peers, status: { adult: true, allowed: true, blocked: [{ id: 'u9', username: 'z' }] } });
  await v.start();
  v.answer({ me: 'u1', ok: ['u9'], in: [] });
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(v.body().out, []);
  assert.deepEqual(v.nearby(), []);
  v.answer({ me: 'u1', ok: [], in: [], no: 'BANNED' });
  assert.equal(v.active, false);
  assert.match(v.note, /closed to your account/);
});

test('the reach: heard within 25 m, put in touch within 40, let go beyond 50; five at once', () => {
  assert.equal(VOICE_CHAT.reach, 25);
  assert.equal(VOICE_CHAT.connect, 40);
  assert.equal(VOICE_CHAT.drop, 50);
  assert.equal(VOICE_CHAT.most, 5);
});
