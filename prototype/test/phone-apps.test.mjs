// The parts of the phone's apps and of the account page that decide things, without a page:
// the music library and its one player, and the rules a username and a password are held to.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readLibrary, clockOf, createMusic, HOUSE_TRACKS } from '../src/client/music.js';
import { usernameProblem, passwordProblem } from '../src/client/account-ui.js';

// A stand-in for the page's audio: it does what it is told and says what state it is in.
function fakePlayer() {
  const p = { calls: [], state: 'idle', id: null, time: 0, ended: null, playing: 0 };
  return Object.assign(p, {
    load(track, { autoplay }) { p.calls.push(['load', track.id]); p.id = track.id; p.time = 0; p.state = autoplay ? 'playing' : 'paused'; p.playing = autoplay ? 1 : 0; return true; },
    play() { p.calls.push(['play']); p.state = 'playing'; p.playing = 1; },
    pause() { p.calls.push(['pause']); p.state = 'paused'; p.playing = 0; },
    seek(t) { p.calls.push(['seek', t]); p.time = t; },
    stop() { p.state = 'idle'; p.playing = 0; },
    onEnded(fn) { p.ended = fn; },
    status: () => ({ state: p.state, error: '', id: p.id, time: p.time, duration: 120 }),
  });
}

test('music: the game\'s own four pieces are always there', () => {
  assert.equal(HOUSE_TRACKS.length, 4);
  const music = createMusic({ player: fakePlayer() });
  assert.deepEqual(music.tracks().map((t) => t.title), ['Onitsha Road', 'Motor Park', 'Palm Wine Evening', 'Sunday Morning']);
  assert.equal(music.library(), 'house');
  assert.equal(music.status().state, 'idle');
});

test('music: a library file is read as a stranger\'s: only plain audio files inside the folder, each once', () => {
  const read = readLibrary({ tracks: [
    { title: 'A Song', artist: 'Someone', file: 'a-song.mp3', cover: 'a-song.jpg' },
    { file: 'No Title (live).m4a' },
    { title: 'Up and out', file: '../secrets.mp3' },
    { title: 'Elsewhere', file: 'https://example.com/x.mp3' },
    { title: 'In a folder', file: 'folder/x.mp3' },
    { title: 'Not audio', file: 'page.html' },
    { title: 'Twice', file: 'A-SONG.mp3' },
    { title: 'Bad cover', file: 'b.ogg', cover: '../../x.png' },
    { title: '<b>Bold</b>\u0007', artist: 'x'.repeat(200), file: 'c.wav' },
    null, 'a string', 7,
  ] });
  assert.deepEqual(read.map((t) => t.url), ['music/a-song.mp3', 'music/No%20Title%20(live).m4a', 'music/b.ogg', 'music/c.wav']);
  assert.equal(read[0].cover, 'music/a-song.jpg');
  assert.equal(read[1].title, 'No Title (live)');
  assert.equal(read[1].artist, 'Unknown artist');
  assert.equal(read[2].cover, null);
  assert.equal(read[3].title, '<b>Bold</b>');          // kept as text; the page shows it as text
  assert.equal(read[3].artist.length, 80);
  for (const junk of [null, undefined, {}, { tracks: 'none' }, { tracks: [] }, 'x']) assert.deepEqual(readLibrary(junk), []);
});

test('music: play, pause, carry on, next, previous and moving through a song; never two at once', () => {
  const player = fakePlayer();
  const told = [];
  const music = createMusic({ player, remember: (id) => told.push(id) });
  let changes = 0;
  music.onChange(() => { changes += 1; });
  music.play();
  assert.deepEqual(player.calls, [['load', 'house:highlife']]);
  assert.equal(music.status().state, 'playing');
  // pressed again and again: the same song, loaded once
  music.play(); music.play();
  assert.equal(player.calls.filter((c) => c[0] === 'load').length, 1);
  music.toggle();
  assert.equal(music.status().state, 'paused');
  music.toggle();
  assert.equal(music.status().state, 'playing');
  assert.equal(player.calls.filter((c) => c[0] === 'load').length, 1, 'carrying on does not start the song again');
  music.next();
  assert.equal(music.current().id, 'house:afrobeat');
  music.seek(70);
  assert.equal(music.status().time, 70);
  music.prev();
  assert.equal(music.current().id, 'house:afrobeat', 'well into a song, previous goes to its start');
  assert.equal(music.status().time, 0);
  music.prev();
  assert.equal(music.current().id, 'house:highlife', 'at its start, previous goes to the song before');
  music.prev();
  assert.equal(music.current().id, 'house:hymn', 'and round from the first to the last');
  music.play('house:palmwine');
  assert.equal(music.current().id, 'house:palmwine');
  assert.equal(music.play('no such song'), false);
  assert.equal(music.current().id, 'house:palmwine');
  // the end of a song is the start of the next
  player.ended();
  assert.equal(music.current().id, 'house:hymn');
  assert.equal(music.status().state, 'playing');
  assert.equal(player.playing, 1);
  assert.equal(told[told.length - 1], 'house:hymn');
  assert.ok(changes >= 8);
});

test('music: songs the owner has added come first, and the song that was showing stays showing', async () => {
  const player = fakePlayer();
  let give;
  const music = createMusic({ player, fetchJson: () => new Promise((resolve) => { give = resolve; }) });
  assert.equal(music.library(), 'loading');
  music.play('house:afrobeat');
  give({ tracks: [{ title: 'New Song', artist: 'Owner', file: 'new-song.mp3' }] });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(music.library(), 'songs');
  assert.deepEqual(music.tracks().map((t) => t.title), ['New Song', 'Onitsha Road', 'Motor Park', 'Palm Wine Evening', 'Sunday Morning']);
  assert.equal(music.current().id, 'house:afrobeat');
  assert.equal(player.calls.filter((c) => c[0] === 'load').length, 1, 'the list arriving does not restart what is playing');
  music.play('file:new-song.mp3');
  assert.equal(music.current().url, 'music/new-song.mp3');
  // a list that cannot be fetched leaves the game's own pieces
  const alone = createMusic({ player: fakePlayer(), fetchJson: () => Promise.reject(new Error('offline')) });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(alone.library(), 'house');
  assert.equal(alone.tracks().length, 4);
});

test('music: a song\'s clock', () => {
  assert.deepEqual([0, 5, 65, 600, 3599.9, -3, 'x'].map(clockOf), ['0:00', '0:05', '1:05', '10:00', '59:59', '0:00', '0:00']);
});

test('accounts: the page holds a username and a password to the same rules as the server, in the same words', () => {
  const require = createRequire(import.meta.url);
  const { cleanUsername, cleanPassword } = require('../../api/_lib/auth.js');
  const server = (fn, ...args) => { try { fn(...args); return ''; } catch (error) { return error.message; } };
  for (const name of ['', 'ab', 'abc', 'A', 'Adaeze', 'Chidi_77', 'x'.repeat(16), 'x'.repeat(17), 'two words', '1abc', '_abc', 'abc-def', 'abc.def', '<script>', 'émile', 'abc!']) {
    assert.equal(usernameProblem(name), server(cleanUsername, name), `username "${name}"`);
  }
  for (const [password, name] of [['', 'Ada'], ['short', 'Ada'], ['12345678', 'Ada'], ['x'.repeat(128), 'Ada'], ['x'.repeat(129), 'Ada'], ['adaezeokeke', 'AdaezeOkeke'], ['a long password', 'Ada']]) {
    assert.equal(passwordProblem(password, name), server(cleanPassword, password, name), `password "${password.slice(0, 20)}"`);
  }
  // names the server keeps for itself are told by the server; the page does not carry the list
  assert.equal(usernameProblem('Admin'), '');
  assert.match(server(cleanUsername, 'Admin'), /not available/);
});
