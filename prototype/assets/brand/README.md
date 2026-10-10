# Brand: PostCivilWar

The game is **PostCivilWar**; in display it is set as three words, **POST CIVIL WAR**.
Its home is **postcivilwar.com**. Its mark is a rising sun.

Everything here is either made in this repository or was supplied by the owner. Nothing
is fetched from a font service or an image host: the page carries its own font, mark and
pictures.

## The palette

Black, white and the greys between. Two colours are allowed, each in one place only:

| Colour | Value | Used for |
| --- | --- | --- |
| White | `#ffffff` / `#f4f4f2` | the mark, the name, text, anything the player owns or has chosen |
| Black | `#000000` / `#060607` | every ground the interface sits on |
| Sun | `#e9c46a` | the disc of the sun in the mark, and nowhere else |
| Danger | `#cf4436` | critical health, an emergency, a refusal. Never decoration |

The town itself keeps the colours a town has. This palette is for the interface.

## The mark

A sun coming up over level ground: a disc cut off at the horizon, eight rays, three
ground lines that shorten as they fall away. The shapes are in
`src/client/mark.svg.txt` and are written into each place the brand appears when the
page is built (`build.mjs`). The rays and the ground are white; the disc is the sun
colour. On the splash the ground draws in, the sun rises from behind it, and the rays
fan out one after another.

## The font: PCW Arcade

`pcw-arcade.ttf` is an original pixel face made for this game by
`tools/brand/make_font.py`, in the manner of the arcade lettering the owner pointed to
as a reference. It is drawn from seven-row bitmaps written out in that file: capitals,
figures and a little punctuation, 47 glyphs, under 7 KB. Lower-case letters are mapped
to the capitals. It is not a copy of any existing typeface, and no font file from
anywhere else is in the build.

    python3 tools/brand/make_font.py      # writes assets/brand/pcw-arcade.ttf

It is used for brand moments only: the splash, the question, the name on the start
screen, the small labels of the opening. Everything a player reads at length is set in
the device's own interface face.

## The story slides

`slides/` holds the five illustrated slides as supplied (1920 by 1080 JPEG, captions
drawn into the pictures) and the note that came with them (`slides/HANDOFF.md`). They
are masters: nothing in the build changes them.

    python3 tools/brand/bake.py           # writes src/client/brand-data.js

scales each to 1280 by 720 and writes them into the page's data, in the story order the
note gives:

1. The war ended. 15 January 1970.
2. Home had changed.
3. What remained.
4. *(not delivered: see below)*
5. Voices from the ruins.
6. Learning to live.

What the note asks for, and what the game does:

- **No captions are added.** The words are part of each picture.
- **The whole frame is kept.** A picture is fitted inside the screen, never cropped to
  fill it; on a narrow screen the space around it is a blurred copy of the same picture.
- **Reduced motion is respected.** With the device's reduce-motion setting on, the
  pictures change without the flash or the slow push-in.
- **Each picture is described** for someone who cannot see it (its caption, as `alt`).

Two things differ from the note, both by the owner's instruction: each slide is shown
for **one second**, not about eight, and each arrives with a **camera shutter** and a
flash rather than a cross-fade. The Skip button is the note's "skip"; there is no
pause, previous or next at one second a slide.

### Limits that go with these pictures

- **The fourth slide was never delivered.** The service that drew the others refused
  the source photograph. The story runs with five slides, and nothing has been drawn to
  stand in for the missing one. Its intended caption was "A generation carried it.
  Wounds they could not always explain."
- **They are illustrations, not evidence.** The note says so itself: colours, clothing,
  faces and backgrounds are partly inferred, and the speech and protest scenes are not
  evidence that those events happened on 15 January 1970 or after the surrender. The
  game presents them as an illustrated opening and makes no historical claim from their
  details.
- **Rights in the source photographs still apply.** The slides were drawn from archive
  photographs. Whoever publishes the game needs the right to use those photographs as
  sources, or slides drawn from material that is clear. That is a question for the
  owner before a public launch; it is not something the build can settle.
- The delivered JPEGs were enlarged from a 1376 by 768 render, so they are soft at full
  size. At the 1280 by 720 the page uses, that does not show.

## The opening, in order

1. **Splash**, black: the mark draws itself, POST CIVIL WAR arrives letter by letter on
   one line, postcivilwar.com small under it. A row of marks lights in turn for five
   seconds while the game gets ready; then **PLAY** replaces it.
2. **Story**, five slides at one second each, a shutter sound and a flash on every one.
   Skip is at the top right.
3. **The question**: *Be a hero or be a villain?* Two answers side by side. It must be
   answered to go on. Each answer has its own sound.
4. **The start screen**: make a character, or continue with the one on this device.

A browser will not play any sound until the page has been touched. PLAY is that touch.
Sound is on by default; the button at the top left of the opening turns it off and on,
and the choice is kept on the device (it is the same switch as Settings and the N key).

## The flag

The first and second supplied slides showed the Biafran flag: standing on the desk in
the first, and as a patch on a sleeve in the second. The owner asked for it to be
removed wherever it appears, with the pictures themselves and their number kept. So:

- the supplied files are untouched, in `slides/`;
- `tools/brand/retouch.py` paints the flag out of copies and writes them to
  `slides/retouched/` (the desk is continued where the flag stood; the sleeve is plain);
- `tools/brand/bake.py` uses a retouched copy where there is one.

The retouching was done by program and checked by eye at the size the game shows. Close
up, the desk top where the flag stood is plainer than the rest of the drawing.

There are no accounts yet. The start screen says so, and has no sign-up or log-in
button, because one that did nothing would be a lie. Accounts arrive with the game's
servers.
