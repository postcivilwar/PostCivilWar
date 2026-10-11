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

## The icons

`icons/` holds what a device shows for the game: the icon on a home screen
(square, for a phone that cuts its own shape, and with cut corners for
everything else), the small one in a browser's tab, and `share.png`, the
picture that goes with postcivilwar.com when the address is sent to someone.
All are the mark on black, drawn by `tools/brand/make_icons.mjs` from
`src/client/mark.svg.txt`; `share.png` adds the name in PCW Arcade.

    node tools/brand/make_icons.mjs       # writes assets/brand/icons/ (needs Playwright)

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

## The cover

`cover/cover-master.jpg` is the game's cover as the owner supplied it (11 October 2026;
2576 by 1449): the name at the left, two figures standing before the river, four lines
of words at the right and a painted PLAY button under the name. It is a master: nothing
in the build changes it. It took the place of the five story slides, which are no
longer in the repository or the page.

The picture is one painting at one shape, and screens are many shapes, so it is carried
in four pieces that are put back together on each screen:

    python3 tools/brand/cover.py          # writes plate.jpg, logo.png, words.png, play.png, cover.json
    python3 tools/brand/bake.py           # writes src/client/brand-data.js

- `plate.jpg`: the picture with the name, the words and the button taken off it (sky is
  continued where the name and the words were; the water is continued where the button
  was), so that it can be moved and scaled behind them;
- `logo.png`, `words.png`, `play.png`: the name, the four lines and the button, each cut
  out with nothing behind it;
- `cover.json`: where each stood in the supplied picture, and where the two figures are.

On a 16:9 screen every piece goes back exactly where the painter put it. On any other
screen each is placed where there is room (`coverLayout` in `src/client/intro.js`):
wide screens keep the name and PLAY at the left and the figures in view; a tall phone
has sky and the name above, the figures below and PLAY at the foot. On every screen the
whole name, both figures and PLAY are in view, PLAY is never smaller than a finger, and
nothing is put under a notch or a home bar. `test/intro.test.mjs` checks that over
twenty screen sizes.

**PLAY is the picture's own button, and it works.** It is what a player presses to go
on; Enter and Space do the same. The splash before it has no button of its own any
more.

Things to know about the cover:

- Where the name, the words and the button were lifted off, the sky and the water
  behind them are filled in by program. It was checked by eye at the sizes the game
  shows; enlarged, the filled water is plainer than the painted water beside it.
- The cover is a painting of two people. Whoever publishes the game needs the right to
  use it; the owner supplied it as theirs.

## The opening, in order

1. **Splash**, black: the mark draws itself and POST CIVIL WAR arrives letter by letter
   on one line. A row of marks lights in turn for five seconds while the game gets
   ready. Nothing is pressed.
2. **The cover** takes its place by itself, with **PLAY** on it.
3. **The question**: *Be a hero or be a villain?* Two answers side by side. It must be
   answered to go on. Each answer has its own sound. (A player who already has a
   character on the device is not asked again.)
4. **The start screen**. On the website it is shut until the player has made an account
   or logged in: Create Account and Log In, and nothing else. After that: make a
   character, or continue with the account's own.

A browser will not play any sound until the page has been touched. PLAY is that touch.
Sound is on by default; the button at the top left of the opening turns it off and on,
and the choice is kept on the device (it is the same switch as Settings and the N key).

With the device's reduce-motion setting on, the cover arrives without its slow push-in.
