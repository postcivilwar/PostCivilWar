// The Music app's library and its one player.
//
// A library is a list of tracks. Four are the game's own pieces, made in the page (src/client/audio.js): they
// are here from the start so the app is never empty. The rest are songs the owner adds: files in the website's
// music/ folder, listed in music/library.json. Adding a song is adding its file and one line to that list;
// nothing in the phone has to change. (assets/music/README.md says how.)
//
// The list from the website is read as something a stranger might have written: every field is checked, a
// file must be a plain name inside music/, and anything else is left out.

export const HOUSE_TRACKS = Object.freeze([
  Object.freeze({ id: 'house:highlife', kind: 'made', style: 'highlife', title: 'Onitsha Road', artist: 'PostCivilWar', duration: 132, art: ['#f7b733', '#fc4a1a'] }),
  Object.freeze({ id: 'house:afrobeat', kind: 'made', style: 'afrobeat', title: 'Motor Park', artist: 'PostCivilWar', duration: 148, art: ['#00b09b', '#1c3b6f'] }),
  Object.freeze({ id: 'house:palmwine', kind: 'made', style: 'palmwine', title: 'Palm Wine Evening', artist: 'PostCivilWar', duration: 125, art: ['#ee9ca7', '#7b4397'] }),
  Object.freeze({ id: 'house:hymn', kind: 'made', style: 'hymn', title: 'Sunday Morning', artist: 'PostCivilWar', duration: 116, art: ['#bdc3c7', '#2c3e50'] }),
]);

const AUDIO_FILE = /^[A-Za-z0-9][A-Za-z0-9 _.()'-]{0,118}\.(mp3|m4a|aac|ogg|opus|wav|flac)$/i;
const IMAGE_FILE = /^[A-Za-z0-9][A-Za-z0-9 _.()'-]{0,118}\.(jpg|jpeg|png|webp)$/i;
const PALETTE = [['#ff5f6d', '#ffc371'], ['#36d1dc', '#5b86e5'], ['#f953c6', '#b91d73'], ['#11998e', '#38ef7d'], ['#fc5c7d', '#6a82fb'], ['#f2994a', '#f2c94c'], ['#8e2de2', '#4a00e0'], ['#56ab2f', '#a8e063']];
const text = (value, most) => (typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, most) : '');

// What music/library.json may say, made safe: [{ id, kind: 'file', title, artist, url, cover, art }]. `base` is
// where the files are (a folder address ending in /).
export function readLibrary(json, base = 'music/') {
  const list = json && Array.isArray(json.tracks) ? json.tracks : [];
  const out = [];
  const seen = new Set();
  for (const row of list.slice(0, 500)) {
    if (!row || typeof row !== 'object') continue;
    const file = text(row.file, 124);
    if (!AUDIO_FILE.test(file) || file.includes('..') || seen.has(file.toLowerCase())) continue;
    seen.add(file.toLowerCase());
    const title = text(row.title, 80) || file.replace(/\.[^.]+$/, '');
    const cover = text(row.cover, 124);
    out.push({
      id: `file:${file}`, kind: 'file', title, artist: text(row.artist, 80) || 'Unknown artist',
      url: base + encodeURIComponent(file), cover: IMAGE_FILE.test(cover) && !cover.includes('..') ? base + encodeURIComponent(cover) : null,
      art: PALETTE[out.length % PALETTE.length],
    });
  }
  return out;
}

export const clockOf = (seconds) => { const s = Math.max(0, Math.floor(Number(seconds) || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// player: audio.player (load, play, pause, seek, stop, status, onEnded). fetchJson: gets the website's list.
export function createMusic({ player, fetchJson = null, remember = null, recalled = null }) {
  let tracks = [...HOUSE_TRACKS];
  let at = Math.max(0, tracks.findIndex((t) => t.id === recalled));
  let loaded = false;          // has the current track been handed to the player
  let libraryState = fetchJson ? 'loading' : 'house';
  const listeners = new Set();
  // told from a copy of the list: a screen that draws itself again in answer stops listening and starts again
  const changed = () => { for (const fn of [...listeners]) fn(); };
  const current = () => tracks[at] || null;

  function start(index, autoplay = true) {
    if (!tracks.length) return false;
    at = ((index % tracks.length) + tracks.length) % tracks.length;
    loaded = player.load(current(), { autoplay });
    if (remember) remember(current().id);
    changed();
    return loaded;
  }
  // the end of one song is the start of the next
  player.onEnded(() => start(at + 1, true));

  if (fetchJson) {
    fetchJson().then((json) => {
      const keep = current() ? current().id : null;
      const added = readLibrary(json);
      tracks = [...added, ...HOUSE_TRACKS];
      // the song that was showing is still the one showing; a remembered uploaded song is found now
      const again = tracks.findIndex((t) => t.id === (loaded ? keep : recalled || keep));
      at = again >= 0 ? again : loaded ? at + added.length : 0;
      libraryState = added.length ? 'songs' : 'house';
      changed();
    }).catch(() => { libraryState = 'house'; changed(); });
  }

  return {
    tracks: () => tracks,
    current,
    index: () => at,
    library: () => libraryState,
    status: () => { const s = player.status(); return loaded && current() && s.id === current().id ? s : { state: 'idle', error: '', id: null, time: 0, duration: current() && current().duration ? current().duration : 0 }; },
    // play this one (or carry on with the one showing); never a second copy of anything
    play(id = null) {
      if (id !== null) { const i = tracks.findIndex((t) => t.id === id); if (i < 0) return false; if (i !== at || !loaded) return start(i, true); }
      if (!loaded) return start(at, true);
      const s = player.status();
      if (s.state === 'ended' || s.state === 'error') return start(at, true);
      player.play(); changed(); return true;
    },
    pause() { if (loaded) { player.pause(); changed(); } },
    toggle() { const s = this.status(); if (s.state === 'playing' || s.state === 'loading') this.pause(); else this.play(); },
    next() { start(at + 1, true); },
    // back to the start of this song, or to the song before if it has only just begun
    prev() { const s = this.status(); if (loaded && s.time > 3) { player.seek(0); changed(); } else start(at - 1, true); },
    seek(seconds) { if (loaded) { player.seek(seconds); changed(); } },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
