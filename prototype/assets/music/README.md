# Music for the phone

The Music app on the in-game phone plays two kinds of track:

- four pieces the game makes itself (they are always there), and
- songs listed here.

To add a song:

1. Put the audio file in this folder (`mp3`, `m4a`, `aac`, `ogg`, `opus`, `wav` or `flac`). Use a plain file
   name: letters, figures, spaces, `-`, `_`, `.`, `(`, `)` and `'`.
2. Optionally put a square cover picture beside it (`jpg`, `png` or `webp`).
3. Add one entry to `library.json`:

```json
{
  "tracks": [
    { "title": "Song title", "artist": "Artist name", "file": "song-file.mp3", "cover": "song-cover.jpg" }
  ]
}
```

4. Run `node build.mjs --site` in `prototype/`. The files are copied to the website's `music/` folder.

Songs appear in the app in the order they are listed, before the game's own pieces. Only add music you have
the right to publish: everything in this folder is served to every player.
