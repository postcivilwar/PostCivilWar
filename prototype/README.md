# PostCivilWar: the Atani slice, a playable prototype

A browser-playable prototype of the first vertical slice: Atani, a town on the
east bank of the River Niger in Anambra State. A thousand people live in it.
A new arrival is one more of them: they can find work, buy a surveyed plot,
get a permit, have materials delivered and put up a building in stages, and
all the while the town goes about its day around them.

**What this is.** The game's rules running for real: an authoritative
simulation, a land registry, a double-entry ledger, 1,000 residents with jobs, homes, families and daily
routines, okada riders who carry passengers for a fare, speech in five
languages, opening hours, weather and a day and night cycle. Since October
2026 also: health and fighting, offences and witnesses, police who come on
foot and arrest, fines and the return of stolen money, a hospital and a
clinic, an ambulance, a phone with contacts, calls, messages and a map, and
vehicles that can be taken (see "Fighting, the law, treatment and the phone").

Since the second week of October 2026 the game is called **PostCivilWar**
(postcivilwar.com). It opens with a splash, a story in five pictures and one
question; its interface is black and white; its phone is a handset; and
people walk and run from the feet up (see "The opening", "The interface" and
"Walking and running").

Since 10 October 2026: the money is **TR** (2,000 TR are the £20 a newcomer
arrives with); the phone is taken out of a pocket and held, with its apps in
their own colours, a camera that shows the town and music that plays; every
button is cut from one black, outlined system; and on the website there are
**accounts** (a username and a password), a **market** that every player
shares, and **HOLARIS Watch**, a glass showroom that sells the owner's
wristwatch. See "TR", "The phone in the hand", "Accounts", "Property and the
market" and "The server".

**What this is not.** It is not the Unreal Engine client the architecture
calls for. People are built on one supplied character model (see
"Characters"); everything else is drawn in code from shapes and painted
textures, so it is stylised, not realistic. The sound is
synthesised in the page, with no recordings. Each open page runs its own copy
of the world, so two players who meet see each other and can talk, but they
do not yet share one clock, one economy or one crowd (see "What is an
interface, and what replaces it"). The simulation runs in the same page as
the renderer, so nothing here is protected from a player who opens the
browser console.

## Play

Open `dist/local.html` in a browser (it uses the copy of three.js in
`vendor/`), or publish `dist/index.html` (it loads three.js from cdnjs).

The website, postcivilwar.com, is `dist/site/`: the same game as a page that
stands on its own and can be installed (see "The website as an app").

The address can end in `#nointro` to leave out the opening, `#lite` or `#full`
to choose how the town is drawn whatever the device (see "Phones"), and
`#nodraw` to draw nothing. They can be joined: `#nointro-lite`.

| | |
| --- | --- |
| Walk | `W A S D` or arrow keys: a light jog on the keyboard, a walk with the stick pushed part of the way; hold `Shift` to run |
| Look | Drag on the world; mouse wheel or pinch to zoom; `C` changes the view |
| Act | `E` (hold to work): talk, enter a counter, board an okada, get down |
| Fight | `F` facing someone close. Then `F` punch, `G` heavy punch, `R` kick, hold `Q` to block, `Space` to dodge, `Z` shove, `X` grab, `V` to step away |
| Take a vehicle | `G` beside the rider of a waiting motorcycle, or at the driver's side of an unlocked keke |
| Pick a pocket | `B` close behind someone |
| Give yourself up | `U` when wanted |
| Chat | `T`, or the Chat button, which is only there while another player is within 10 m |
| Drive | `W` and `S` to go and brake, `A` and `D` to steer, `E` to step out, `H` for the horn |
| Phone | `Tab` or `P`; map on `M`; sound on and off with `N` |
| Touch | Stick on the left. On the right, one large button and up to seven smaller ones: pictures, not words, and only the ones that can be used just now. At the wheel there are an accelerator and a brake; the stick steers |

Keys other than walking, looking and the phone are shown at the foot of the
screen while they do something, and not otherwise.

Things to do, in no order:

- Stand in the market at nine and listen. Go to the Catholic church on Sunday
  at eight. Walk into the hospital, a classroom or a lecture theatre: the
  roof lifts off the building you are in.
- Talk to anybody (`E`). They answer in your language if they speak it. Set
  your language on the phone, under People.
- Take an okada from a rank: `E` beside a waiting rider, pick a stop, pay.
- Read a survey board in the Niger View Layout, mould blocks at the yard for
  a first wage, buy a plot at the Lands Registry, get a permit at the
  Secretariat, order materials, build.
- Hire a keke at the motor park and take delivery runs. Buy one in any of
  seven colours, with any of three fronts.
- Open the phone: fifteen apps. Find the way to anywhere in town on the map
  and mark it; a white beacon stands there until you arrive.
- Drive a keke at walking pace through the market and sound the horn (`H`):
  people step aside. Drive fast at someone and they are knocked down, you
  stall, and whoever saw it tells the police.
- Pick a fight, and see who runs, who pleads and who hits back. See who saw
  it, and how long the police take. Pay the fine, ask a friend, or sit it out.
- Get hurt and go to the General Hospital, or call the ambulance from the
  phone. Bargain at the private clinic.

## The opening

`src/client/intro.js`, with its markup and animation in `template.html` so
that it is on screen before the game's own script has been read.

1. **Splash**, black: the mark (a rising sun) draws itself and POST CIVIL WAR
   arrives a letter at a time on one line at every screen size, while one thin
   amber line under it fills as the game's files really arrive (the page's own
   markup, style and lettering are the first 36 KB of the page, so the splash is
   painted within half a second). The mark and the name are white; the sun's
   disc is the one touch of yellow. **The splash has no button**: once it has
   been seen for a little over a second (it was five seconds until 20 October
   2026) and the game is ready, the cover takes its place by itself.
2. **The cover**: the owner's supplied picture (11 October 2026), which took
   the place of the five story slides. Its own painted **PLAY** button is the
   button: a click, a tap, Enter or Space. The picture is carried in four
   pieces (the plate, the name, the words, PLAY) and put together for the
   screen it is on, so that the whole name, both figures and PLAY are in view
   on a wide monitor, a tablet and an upright phone alike, with nothing under
   a notch (`coverLayout` in `intro.js`; `assets/brand/README.md`).
3. **The question**: *Be a hero or be a villain?* The two answers are the
   same size, side by side on one line on every screen, and neither looks
   chosen until one is. It covers everything and must be answered: a click, a
   tap, or the `H` or `V` key. The chosen one fills with white and the other
   dims. Each answer has its own sound.
4. **The start screen**. On the website it is shut until the player has an
   account: see "An account before play". Then: make a character, or continue
   with the account's own.

## Making a character

The screen opens with the name of the game and the story (15 January 1970, Atani motor park, £20; town data,
`ZONE_TEXT.story`), then "Create your character", then the choice. There are two figures, both supplied by
the owner with their own skeleton, texture and animations, and both used byte for byte:

- **Woman** (W1, `woman.glb`, default name Adaeze): 40 animations.
- **Man** (M1, `muscular_male.glb`, default name Emeka): 24 animations.

The switch sits above the figure, square-cornered. **Drag** turns the figure in 3D; swiping never changes it
(only the arrows and dots do, and with one figure each they are off). Every animation in the chosen file is
offered under a one-word name (Walk, Run, Dance, Box, Kick, Sit, Laugh…); pressing one plays exactly that
animation in place, faded in from the last over about a third of a second. Neither figure takes colours.
Then the name, and Enter. (Hero or Villain is not on this screen: it is asked once, before it, and kept; see
"Starter TR, one character, the upgrade" below. The character is chosen here once, and Enter asks the player
to be sure.) The choice is checked by the simulation, saved, and sent to
others; a save naming a figure that no longer exists (the earlier six women and three men) falls back to a
kit figure. Files are read by `src/client/glb.js` and played by `src/client/animated.js`. Details and limits
are in `assets/characters/figures/README.md`.

## The screen in town

- **The top band**: flush with the top of the screen. The map at the extreme top left; life (in danger only),
  money, time, day and place at the extreme top right. In the Claude app the game is already below the app's
  bar, so nothing is added for the notch there; opened full screen, the notch is kept clear.
- **Nothing overlaps** (`src/client/fit.js`): a few times a second the band's real height is measured and the
  stick, the buttons on the right and the Skills button and its page are fitted below it, made smaller only
  if the screen is too short (a phone held sideways), on every size and either way up. Speech bubbles keep
  clear of the band, the notices, the buttons and the prompt.
- **Notices**: one at a time at the top in the middle, each for its time, then the next; an urgent one first,
  and the one it interrupted again after. A government public notice is shown only if it is new (not again
  within a day) and never more than one in fifteen minutes; all are kept in the phone's Notices app.
- **The map** turns with the camera, the player in the middle, north marked. A destination (a job taken in
  the phone's Jobs app, or a place picked on the phone's map) is a marker with a line to it.
- **The life bar**: slim and heavy-edged; green, orange from 60%, red from 20%.
- **Touch buttons**: each has its own ring, black by day and white by night, never touching another. The
  camera (View) button is offered on foot and in a vehicle (on foot since 19 October 2026). The stick lets go whenever its finger leaves the glass, even
  if the phone's web view loses the release (it used to stick, and the player walked on alone).
- **The camera on foot** never goes inside the player's head: with a wall, a bus or a stall behind, it
  comes in close behind and then rises over it and looks down, and the player is always drawn (they used to vanish
  at the motor park).
- **Nobody walks through anybody**: a player cannot step into another player, a townsperson or a resident
  (the simulation refuses it and the client steps round them); townspeople are eased apart on screen.
- **Talk**: one speech bubble at a time; names over heads are small.
- **Controls**: one solid icon family (`src/client/icons.js`), white on dark see-through discs, with the day
  (black) or night (white) ring.
- **Skills**: a round button at the middle of the right edge (K on a keyboard). Tapped, it opens the first page
  of the character's own animations, five in an arc beside it, each with its name; each tap after shows the next
  page, and a tap on the last page closes it (the next opening starts at page 1). While open, the other right-
  hand buttons are put away and the stick stays. A skill plays that clip on the player's own figure, once,
  faded in and back out to standing or walking; walking off ends it; the page stays open for the next. Skills
  are only on foot: a fight, a vehicle, the river or an arrest closes them. They only move the body: a Kick
  skill hurts nobody. Others see them. The list is built from the figure's real clips without walk, run, swim
  and flee (`src/client/skill-catalog.js`): the woman 35 (7 pages), the man 21 (5 pages), a figure on the
  game's own skeleton the 28 carried-over clips (6 pages).
- **At the wheel** (anything with three wheels or more; the keke today): on a touch screen the stick becomes a
  steering wheel that turns as it is dragged, and the right side shows only the accelerator, brake, horn and
  the door to step out by. The dashboard moves under the top band. A motorcycle keeps the stick.
- **Driving**: the driver sits in the seat with both hands on the bars or wheel.
- **Arrest**: a large pair of handcuffs closes on screen with ARRESTED for four seconds, a fade, the Police Post.
- **Struck by a vehicle**: anyone goes over the way the player does, and bleeds: a pool spreads under them
  while they lie there, larger the harder and more often they were hit, with drops while the wound is fresh,
  and stays a while after. Townspeople struck often or hard enough die, lie there two and a half minutes,
  and are taken to the mortuary for good; the driver is charged with causing death. A player is never
  killed for good: they come round at the hospital.
- **Townspeople's bodies answer** (`src/sim/reactions.js`, drawn from `src/client/reaction-data.js`): 29 of
  the supplied figures' own animations, carried onto the townspeople's skeleton by
  `tools/characters/retarget.mjs`. Struck, they flee with arms going; kicked, they are hurt; fighting back,
  they box, jab and kick; beaten, they sit and cry or slump; a vehicle bearing down, they leap clear; up
  again, they hold their head; greeted, they wave, say hello or bow; witnesses are afraid; and about the
  players, now and then, someone laughs, claps, agrees, takes a call. Never on another human player.
- **Swimming**: at the river's edge a Swim button appears and fighting, taking vehicles and stealing go. In
  the water the stick becomes the left hand (it steers) and the large button the right hand (held, a harder
  stroke); "Climb out" appears near the bank. The player's own figure plays its own swim.
- **Loading**: the page's first script starts fetching and decoding the character on a worker, so it is
  ready as the page finishes starting; only the character chosen last time (or the woman) is fetched, the other
  when it is needed; its texture is decoded off the main thread; the town is not drawn behind the start screen.
- **Phones**: the picture is never made blurry to keep up; the first thing a struggling phone gives up is
  the sun's shadows, then grass and townspeople's limbs, then draw distance, and it climbs back slowly. The
  supplied figures' 4096-pixel textures are drawn at 2048 on a phone (the files are unchanged).

## TR: money at the start, and fines

The game's money is **TR**. Every character is given 2,000 TR (£20 of 1970 money: £1 is 100 TR) once, as an
issuance on the ledger keyed to the character, so it can never be paid twice. The town's police charge
**10 TR** for an offence and **100 TR** where someone was killed; a player constable may set from 5 TR to
10 TR, or up to 100 TR where someone died.

Until 10 October 2026 the money was called the cowrie. It was renamed, not converted: the ledger holds whole
numbers of units and not one of them was touched. A unit was a hundredth of a cowrie and is now half a TR
(`TR = 2` in `sim/ledger.js`), so the 4,000 units a newcomer was given are 2,000 TR and are still £20.
Because no stored number changes, the rename cannot be applied twice and cannot make or lose a unit; an
account written before it says `CWR` and is read as `TR`. A test loads a character saved under the old name
and finds exactly what it had. What did change is what the police charge.

The answer goes to the simulation with the character (`join({ path })`), is
saved with them, and is shown on the phone under People. **It changes no
rule.** The police, the court and the hospital treat a hero and a villain the
same, by what they do; a test holds that. What the answer should come to mean
is a design decision that has not been made.

Things a reader should know:

- **A browser plays no sound until the page has been touched.** PLAY is that
  touch, which is why the story's shutters can be heard on a first visit.
- **Sound** is on unless the player turns it off. The button at the top left
  of the opening turns it off and on; so do Settings on the phone and the `N`
  key. All three are one switch, kept on the device.
- **Accounts are on the website, and there they are required.** The start
  screen offers Create Account and Log In and nothing else until one of them
  has been done. Anywhere else (the page opened from a disk, or published as
  an artifact) there is no server to ask, no account and no bank: a character
  lives in the browser's storage on one device. See "An account before play".
- **A returning player** who has answered before sees the splash and the
  cover and is not asked the question again.
- **The story slides are gone**, and with them the retouched copies and the
  tool that made them. The notes about the missing fourth slide and the
  rights in the photographs behind them no longer apply to anything in the
  game.
- With the device's reduce-motion setting on, the mark, the letters and the
  cover appear without their animation.
- The opening is set in January 1970. The town behind it is present-day
  Atani, with motorcycles and phones. Joining the two is for the owner to
  decide; nothing in the town has been changed to 1970.

## The interface

Black, white and the greys between. Red is kept for danger (critical health,
an emergency, a refusal); the sun's yellow is in the mark and nowhere else.
What the player owns or has chosen is white: a pressed button, their land on
the map, the beacon at a marked place, the ring round their keke. Text is set
in the device's own interface face. The brand's pixel face, PCW Arcade, was
made here (`tools/brand/make_font.py`) and is used for the opening and the
name only. No font or image is fetched from anywhere.

Less interface, more game. What is on screen while playing:

- **Two small corners.** Place, weather and clock on the left; TR and a
  thin health bar on the right. In a fight, or after a collision, a second
  thin bar under it is the other person.
- **Notices** are small dark cards with white writing, at the top, between
  the corners on a wide screen and under them on a narrow one. They never
  cover the middle of the screen.
- **Buttons are pictures.** One set of 38 line drawings on a 24 by 24 grid,
  made here (`src/client/icons.js`): talk, enter, drive, get out, run, fight,
  punch, kick, block, dodge, shove, grab, leave, horn, accelerator, brake and
  the rest. A button has no background until it is pressed; each has a name
  for a screen reader. The large button shows what it will do to whatever is
  in front of the player.
- **Names** are white writing above a head, with no card behind: the nearest
  townsperson within 4.5 m, and other players within 12 m. They fade in and
  out.
- On a tablet the buttons are a fifth larger; in landscape they sit low on
  the right, clear of the middle.

The phone is drawn as a handset: a status bar with the town's clock, signal
and a battery that is the player's own energy; a large clock and a grid of
apps over a dark wallpaper; four apps in a dock; a bar at the foot that goes
home from an app and puts the phone away from the home screen. An app opens
with a large title and a Back that names where it goes. Settings uses
switches, sliders and a segmented control. It is an original design in the
manner of a current flagship phone. No maker's logo, icon, typeface or
wallpaper is copied, and the icons were drawn here.

The town map and the map of Nigeria are greyscale: your own land, vehicle and
route in white, plots for sale outlined, everything else in grey. The
ambulance keeps its red cross.

## Walking and running

`src/client/gait.js`. The figure used to swing each leg from the hip like a
pendulum, so the feet slid and nothing above the waist answered them. It is
now worked out from the ground up:

- **The foot is planted.** While a foot is down it stays where it was put and
  the body passes over it: heel first with the toes up, flat, then over the
  toes with the heel rising. The hip and knee that put the ankle there are
  solved from the lengths of the model's own thigh and shin.
- **The hips answer the legs.** They ride lowest with the legs spread and
  highest over the standing leg, as far as both legs allow and no further;
  they turn with the leading leg, tip toward the leg in the air, and shift
  over the standing foot.
- **The chest answers the hips.** The shoulders turn against them, each arm
  swings with the leg across from it and bends as it comes forward, and the
  head stays on where the body is going.
- **Speed chooses the step.** Slow is short steps; a walk has both feet down
  at each change; from about two metres a second it becomes a run, with both
  feet off the ground, a forward lean, a high heel and bent elbows. Step
  length and rate follow the speed, so the ground goes by at the body's speed.
- **Clothes shorten the step.** Someone in a wrapper takes shorter, quicker
  steps to cover the same ground.
- **Standing is not still.** The weight drifts from one foot to the other,
  the arms hang with a little give, the head now and then looks about.

The player's own figure also has weight (`movePlayer` in `main.js`): it
gathers speed and loses it over a few steps, turns to where it is sent at a
limited rate and slows to turn about, moves the way it faces, and leans into
a turn and into a start. Footsteps are heard as each foot lands. The
simulation is still told every position and still refuses any that is too
far: its speed limits are unchanged.

The supplied character's hidden shoulder skin had eight points bound to the
hand bones, which a bent elbow dragged out into spikes. They are rebound to
the collar bone as the model is read; the supplied file is not changed.

This is procedural animation on one skeleton. It is a long way from the
pendulum it replaces, and it is not motion capture: there is no turning on
the spot, no stairs or slopes, no carrying, and the feet do not find uneven
ground because there is none.

## Phones

The recording that prompted this showed the frame rate falling from about 43
to about 17 a second on an Android phone, in an evening crowd. Measured here,
the simulation and the page's own script stayed flat through the same scene:
the cost was drawing. So a phone or tablet (any device whose first pointer is
a finger) now draws the town a lighter way, decided once at the start:

| | Desktop | Phone or tablet |
| --- | --- | --- |
| Surfaces | Lit for every pixel, with roughness and sheen | Lit at each corner and spread across the face (`surface()` in `render-kit.js`). Same colours, same shadows |
| Street lamps as lights | The two nearest (there were five, costing every pixel of everything, day and night) | None; every lamp has a pool of light on the ground under it instead, on both |
| Pixels | Up to 2 per CSS pixel | Up to 1.5 |
| Sun's shadow | 2048, soft edge | 1024, hard edge; off from detail level Low |
| Full figures in the crowd | 26 | 14, made no more than one every 0.3 s and never in a frame that is already late |
| Detail governor | Steps down below 26 frames a second for 4 s | Steps down below 31 for 2.5 s |

Behind the opening the town is not drawn at all once it has been warmed up.

**What has and has not been measured.** In this repository's headless
browser, which draws in software, the lighter way takes about 14% less time a
frame for the same picture at the same detail level, and its crowd is smaller.
Software drawing says little about a phone's graphics chip, where the
per-pixel savings should count for much more; **no real phone has been
measured since the change.** Settings on the in-game phone shows the frame
rate, the slowest part of a frame, the detail level and which way the town is
being drawn, so it can be read off a real device.

## Characters

The player is the base character in `assets/characters/base`, exactly as it
was supplied. Everyone else is the same model's head, hands and skeleton in
other clothes. `assets/characters/README.md` says what the model is and what
was done with it.

A person is a short config, not a hand-built figure:

| | |
| --- | --- |
| Character | the one base model |
| Age | height, head size, greying, a slight stoop |
| Body type | slim, average, sturdy, heavy; a woman's shape |
| Skin tone | ten |
| Hair | twelve styles, with beards |
| Clothing | 32 outfits, from T-shirt and jeans to agbada |
| Occupation | doctors, nurses, priests, police, pupils, builders and the rest dress for their work |
| Cultural clothing | Igbo, Yoruba and Hausa dress, worn by those peoples, more by elders and traders than by clerks, never by everyone |
| Accessories | head ties, caps, beads, aprons, bags, a stethoscope |
| Animation set | which of the shared movements a role uses |

`src/sim/characters.js` holds the catalogue and the rules. `dist/lab.html` is
the character lab: the first eleven characters and the variation sets, to
look at standing, walking, sitting and working at each level of detail.

Not done: finger and face animation; cloth that moves by itself; any
movement beyond walk, run, sit, work, ride and lie; the far crowd, which is
still simple instanced figures.

## Vehicles

Every keke and every coach is one of the two supplied designs in
`assets/vehicles`: the keke (three fronts on one body) and the coach.
`assets/vehicles/README.md` says what the models are, how the lighter levels
are made from them, and what is not done.

| | |
| --- | --- |
| Shape | the supplied models, never redrawn; the masters are read-only and checksummed by a test |
| Variation | paint, cloth, seats, floor, slogan, fleet number, plate, operator, route, advert, wear, dust, one small accessory |
| Sharing | one set of geometry per design; a vehicle's colours are a table handed to one shared shader |
| Detail | near, middle and far, stepping with distance (`VEHICLE_RANGES`); the shadow is cast by the far shape |
| Moving parts | wheels turn by distance travelled; the keke's fork and the coach's front wheels steer; lamps come on when a keke is driven after dark |
| Who owns a look | the simulation: a keke's look is saved with it and sent to every player |
| In the town | 2 kekes for hire, any the players buy, 11 parked on the verges, 3 coaches at the motor park |

`src/sim/vehicle-looks.js` holds the catalogue. `dist/yard.html` is the
vehicle yard: the supplied designs, the seven colours of each, the three
levels of detail side by side, and a keke and a coach with people for scale.

Not done: there is no traffic. Nothing but a player's keke moves, the coach
cannot be driven or entered, and its door does not open. The okadas and the
ambulance are still drawn from simple shapes. The coach carries no maker's
name, badge or logo: the supplied model's were left out when it was baked.

## Fighting, the law, treatment and the phone

The simulation decides all of it. The client asks, and draws the answer.

| | |
| --- | --- |
| Health | 0 to 100, kept by the simulation. At 20 a player is critical: fighting stops and cannot be started, and so does running. Bruises mend at 2 points an hour, not while critical |
| Fighting | Starts only when the player chooses to square up to someone grown and within reach. Eight moves, each with a reach, a cost in energy and a time before the next. Nobody is beaten below a fifth of their health; no blood |
| Townspeople | Prefer peace. Struck once, most plead or run; struck again, those with the nerve defend themselves and stop when the attacker is badly hurt. Children and the sixteen named residents cannot be fought |
| Player against player | Activating a fight does not put the other player in one. Blows land, but not below critical, and the one who started it is the offender and pays compensation on arrest |
| Bodies | A player takes up room: nobody walks through another player, however large the step. Two who end up on one spot can always step apart. Someone in a vehicle is not a body on the road |
| Vehicles and people | The simulation sweeps the nose of a moving keke or motorcycle. Someone struck loses health by the speed (nothing under 1.6 m/s; about half their health at a keke's full speed), is thrown, lies for about three seconds and gets up. The vehicle stalls. One pass is one blow |
| Death | A vehicle is the only thing that takes health to 0. The player lies where they fell and comes round at the General Hospital eight seconds later, critical, with their purse untouched. Nothing is dropped |
| Townspeople and vehicles | They step aside for a vehicle they see coming, always for a horn. One who is struck is hurt, lies, and goes back to their day; none is killed, and a child is never struck |
| Who sees health | A player's own, always. Another player's only while the two are in a fight or a collision, and for ten seconds after. It is not sent otherwise |
| Offences | Assault, assault causing harm, stealing, taking a vehicle, resisting arrest, dangerous driving causing harm, causing death by dangerous driving. Each is recorded with culprit, victim, amount, place, time and who saw it |
| Witnesses | Whether someone sees depends on distance, line of sight, how serious it was and who they are. A witness tells the police within seconds; an unseen offence may be found out later, or never |
| Police | Six officers on beats. The nearest free ones run to where it happened, challenge, arrest and walk the culprit to the Police Post. Nobody is moved by magic. Running is its own offence |
| Custody | The fine is on a fixed scale, or the time is served. Stolen money the culprit still has goes back to its owner in the same step; the rest is owed |
| Special constables | Up to four players with clean records, sworn in at the Police Post. A constable may arrest a wanted player within reach, set the fine once within half and one and a half times the scale, walk the prisoner in, and allow or refuse a phone call. Nothing else |
| Where a fine goes | Arrest by an officer: all of it to government. Arrest by a constable: one part in a hundred to government, rounded up, the rest to the constable, in one ledger transaction |
| Hospital | Atani General Hospital, government: fixed prices, no bargaining, paid to the State. Treatment to 40, 60, 80 or 100%, quoted before anything is done, and the bill shows the six figures that matter |
| Clinic | Private: the owner's prices, and bargaining in up to three offers down to a floor |
| Ambulance | Called from the phone. It drives the roads to the caller, takes them aboard and brings them to the hospital door. Free at critical health |
| Phone | Contacts (emergency, family, friends, people met, businesses), Messages, Calls, Map, Wallet, Health, Police, Transport, Jobs, Property, People, Notices, Settings |
| In custody | Contacts and the map only, until the officer allows the phone; then calls, and three messages, to people the prisoner knows. A friend who is asked sees where to come, how far and how long, and pays at the Police Post. A townsperson who knows the player may pay; it is then a debt |
| Taking a vehicle | Offered only beside the rider or driver, never at the passenger's place, never for a locked one. It takes about two seconds in steps and can be stopped. A motorcycle that is left goes back to its rider |
| Controls | Decided by what the player is doing: walking, fighting, driving, on a motorcycle, a passenger, under arrest, being carried. Each change ends a run |
| Camera | Five views on foot and five in a vehicle, on `C`. It glides between them, comes in when there is a wall behind, stays under the roof of a shed or stall the player is standing in, and sees with the player's eyes when pressed against a wall |

Not built: driving a coach, a car or a bicycle (the town has no cars or
bicycles, and the coach is scenery); traffic, so there is never a driver to
pull out of a keke; a clinic owned by a player; money dropped by the dead;
accounts; friend requests; calls that ring; and anything between two players
on two devices beyond seeing, hearing and not walking through each other,
which needs the shared world. Everything else between two players is tested
with two players in one simulation. `docs/multiplayer-audit.md` at the top of
the repository says what exists, what is missing and what has to be decided.

`docs/test-plan-gameplay.md` at the top of the repository lists what is
tested, how, and what still needs a person with a real device.

## What is in the town

| | |
| --- | --- |
| People | 984 townspeople and 16 named residents. Each has a name, age, gender, people, faith, household and relations, home, job and place of work, income band, languages, traits, a way of getting about, clothes for their work, and a plan for today |
| Peoples and names | Igbo (most), Igala, Yoruba, Hausa, Edo, Ijaw, Efik, Urhobo, each with their own given names and surnames |
| Work | 45 kinds: pupils, students, undergraduates, teachers, lecturers, doctors, nurses, a pharmacist, records clerks, cleaners, priests, a catechist, a sexton, traders, hawkers, tailors, barbers, mechanics, carpenters, welders, food sellers, farmers, fishers, okada riders, drivers, police, clerks, labourers, apprentices, homemakers, retirees, the unemployed, small children |
| Places to walk into | General hospital (reception and waiting, consulting rooms, pharmacy, emergency, wards, toilets), primary and secondary schools (classrooms, staff rooms, offices, a lab), a university, a polytechnic and a college of education (lecture theatres, labs, library, workshops, buttery), St. Michael's Catholic Church and All Saints Anglican Church (nave, pews, altar, tower) |
| Also | 111 homes, 13 trade sheds, the market, the motor park, farmland, the river bank, a mosque, 6 okada ranks, 15 named stops |
| Speech | English, Nigerian Pidgin, Igbo, Yoruba, Hausa. A phrase book of 67 phrases in all five; 37 short exchanges that fit a place, an hour and the weather |

## How it is put together

```
src/sim/        The simulation. No DOM, no renderer. Runs in Node and in the browser.
  geo.js            National coordinate frame at 1:10; streaming cells
  nigeria.js        The 36 states and the FCT
  zone.js           One line: which town this build runs
  zones/atani.js    The town: roads, parcels, named residents, and the walking graph built from it
  zones/atani-town.js  Housing, institutions, sheds, ranks, stops, sound sources, public notices
  layout.js         Rooms, doors, furniture and the places people stand, from a building's outline
  graph.js          The walking and riding graph: shortest routes, cached
  culture.js        Peoples and names, languages, the phrase book, exchanges, the translator
  population.js     Who lives here, and where each of them is at any moment of any day
  okada.js          Motorcycle taxis: ranks, dispatch, fares, the riders' takings; a motorcycle a player has taken
  actors.js         Townspeople taken out of their day's plan for a while: walking somewhere, following, fleeing
  conflict.js       Health, fights, how townspeople react to being struck
  impact.js         Bodies in the way, and what a moving vehicle does to one: harm, knockdown, death, coming round
  justice.js        Offences, witnesses, officers, arrest, custody, fines, restitution, special constables
  care.js           Treatment, quotes and bargaining; the ambulance
  phone.js          Contacts, calls, messages, the way to a place, bail and surety
  hijack.js         Taking a motorcycle or a keke: where to stand, the steps, what follows
  talk.js           Who says what to whom: townspeople, players, and players' chat
  ledger.js         In-memory ledger with the same contract as services/ledger
  bank.js           What the character has earned and spent in town since the bank last heard, and bringing the town's purse into step with the bank
  registry.js       Parcels, titles, permits
  economy.js        Goods, businesses, wages, construction
  vehicles.js       Vehicles: hire, purchase and registration, petrol, driving checks, cargo, runs
  vehicle-looks.js  What each keke and coach looks like: fronts, paints, liveries, markings, wear
  residents.js      The 16 named residents: schedules and walking
  sim.js            The zone's game server: intents in, views out
  host.js           Wires the game, its ledger's auditor, the bank bridge and the market bridge together
src/net/        What joins one player's world to another's
  transport.js      The transport interface, an in-memory hub for tests, and the live room transport
  link.js           What is sent about a player, and how what arrives is checked
  characters.js     The character catalogue: outfits, hair, headwear, and who wears what
  figures.js        The owner's supplied figures: which exist, their default names, the parts that take a colour, and the check on a look
src/client/     Rendering (three.js r128), crowd, speech bubbles, sound, input, HUD and panels
  controls.js       The stick and the buttons: which are shown, and what is held
  camera.js         The camera's views, and keeping it out of walls
  combat-view.js    How a blow, a block and a flinch look
  intro.js          The opening: the splash, the cover with its PLAY, the question; where the cover's pieces go on any screen
  account-ui.js     Create Account and Log In; the start screen shut until someone is signed in
  confirm.js        The question asked before logging out or erasing a saved game
  wallet.js         This device's side of the bank: the balance, sending, history, beneficiaries
  ui-wallet.js      The Wallet app
  town-map.js       The Map app's map: drawn from the town's own data, moved and zoomed by hand
  phone-hold.js     The handset in the character's hand
  creator.js        Making a character: the supplied figures on a turntable, their colours or animations, the name
  glb.js            Reads a supplied GLB as it is: mesh, texture, skeleton, animations
  radar.js          The round map at the top left, and the route to where the player is going
  seat-pose.js      The seated pose for the supplied figures (generated from the woman's sit animation)
  reaction-data.js  The supplied figures' animations carried onto the townspeople's skeleton (generated)
  blood.js          Pools and drops of blood under someone struck by a vehicle
  skills.js         The Skills button and its pages on screen
  skill-catalog.js  What the character can do on demand, and how the pages turn (pure)
  fit.js            Fits the controls below the top band so nothing overlaps
  animated.js       A figure that plays its own file's animations (the supplied man)
  choice.js         The choice itself, without the page
  icons.js          The pictures on the buttons
  brand-data.js     The cover's four pieces, written into the page (generated)
  mark.svg.txt      The rising-sun mark's shapes
  gait.js           Walking and running, worked out from the planted foot up
  ui-phone.js       The handset and its apps
  ui-panels.js      The hospital and clinic, the Police Post, and being under arrest
  monitor.js        What each frame cost; when to lower detail and when to raise it again
  warmup.js         Shaders compiled and meshes uploaded before Enter is offered
  character.js      A figure: the base skeleton, parts from the kit joined into one skinned mesh
  character-kit-data.js  The baked kit (generated)
  lab.js            The character lab page
  vehicle-models.js A keke or a coach: shared geometry, its colours, wheels, lamps, levels of detail
  vehicle-kit-data.js  The baked vehicle kit (generated)
  yard.js           The vehicle yard page
assets/brand/       The font, the supplied cover and the notes that go with them
tools/brand/        Makes the font; separates the cover into its pieces and writes them into the page
assets/characters/  The base character and every part generated for it, as GLB
tools/characters/   The bake: takes the base apart, makes the clothes, hair and lighter copies
assets/vehicles/    The supplied keke and coach (read-only), their lighter levels, textures and catalogue
tools/vehicles/     Inspects a vehicle file; bakes the supplied models into the kit, piece by piece
test/           Headless tests of the simulation; a browser play-through
build.mjs       Bundles everything into one HTML file. No dependencies.
```

Boundaries that are deliberate and checked by tests:

- **The client decides nothing.** It predicts its own walking with the shared
  map, sends each step as an intent, and is corrected if the simulation
  refuses. Every purchase, wage, fare, title change and chat message is a
  request. Whether the Chat button shows is the simulation's answer, not the
  client's guess.
- **Health, fights, arrests, fines and badges are the simulation's.** A blow
  is a request; the simulation says whether it landed and what it did. A
  payment carries a request id and an idempotency key and is made once.
- **The ledger has rules of its own for this money.** One fine for an arrest,
  one bill for a quote, a fine split exactly or refused, whoever asks.
  `ledger.js` and migration 0003 of `services/ledger` hold the same rules.
- **There is no way to make TR in the page.** The "Add funds (sandbox)" page
  and the sandbox bitcoin behind it (`settlement.js`) were removed on 11
  October 2026. `sim.js` is handed a gameplay ledger handle that can only
  move game currency between accounts; nothing in the game mints it but the
  2,000 TR a new character arrives with, and on the website that is issued
  by the bank, once per account.
- **Another player's computer is not trusted.** What arrives over the
  transport is checked for shape, size and position, shown as a visitor, and
  gives that visitor no way to touch money, land or anything else here.
- **What you typed is what is shown.** A translation is a second line under
  the original, never a replacement.

## A thousand people, cheaply

Nobody is stepped forward every tick. Each person's day is compiled once into
a plan: a list of legs, each a route and a time to be somewhere. Where anyone
is at any moment is read off the plan. That makes the three levels of detail
a matter of how often you ask:

| | Who | What is worked out | What is drawn |
| --- | --- | --- | --- |
| Near | within 30 m | position every frame, speech, a name to talk to | the character model, skinned and animated (up to 26 at once): near detail within 7.5 m, middle detail to 24 m |
| Middle | within 150 m | position every view | an instanced figure: ten posed parts within 60 m, three plain shapes beyond (about a ninth of the triangles) |
| Far | everyone else | position once a second, and only to see who has come near | nothing |

Measured in Node on this machine, not estimated: 1,000 people cost about
0.11 ms per simulation tick with a view every other tick; the once-a-second
sweep of the whole town takes about 0.25 ms. At 9,840 people the sweep is
about 6 ms and a view about 1.2 ms. The crowd is 14 instanced draw calls
whatever its size, with up to 520 figures drawn at once. If frames run slow the
client steps down by itself, but only when frames have been slow for several
seconds on end, and it steps back up when there is room: lower resolution,
then smaller shadows, then no shadows, with shorter sight and fewer limbs at
each step. Settings on the phone shows the live figures, each hitch and what
it was spent on, and lets the player fix the level.

Okada riders are the exception: all 26 are stepped, because they answer calls. Riders and their passengers within about 19 m are drawn as the same full character, seated on the motorcycle (up to ten at once).

## What is an interface, and what replaces it

| Here | What it stands in for |
| --- | --- |
| `net/transport.js`: `publish`, `subscribe`, `close`. A hub in memory for tests; live presence in a published page | The zone server's network session. In production one server owns the clock, the crowd and the money, and every client is a view of it. Here each page owns a whole world and only players' positions and words cross |
| `net/link.js`: other players arrive as "visitors" | Replication of player entities by the zone server |
| `culture.createTranslator({ service })`: a phrase book first, then an optional service asked only when the player taps Translate | A translation service behind the chat service, with caching and moderation |
| `client/audio.js`: every sound is synthesised from oscillators and noise, and each has a position | Recorded and licensed audio in the engine's spatial mixer. All music here is generated in the page from original patterns in four styles; no recording of any existing song is used |
| Speech bubbles and text | Voice. A line already carries its speaker, language and text, which is what a voice system needs |
| Clothes generated in code on the supplied character; ten instanced parts for the far crowd | Clothing modelled and simulated by artists on the same skeleton, and crowd rendering in Unreal Engine. The parts are exported as GLB on the shared skeleton so they can be carried over |
| Plans read by the clock | The same plans, driving navigation-mesh agents near players and staying abstract far away |
| One pooled account for the townspeople's money | Per-household accounts in the economy service |

## Designed to grow

- **The town is data.** Everything that makes this Atani is in
  `zones/atani.js` and `zones/atani-town.js`. The rules and the client read
  it through `zone.js`, and a test fails if any of them names a town, a state
  or a resident. The slice was first built as Epe in Lagos State and was
  moved to Anambra by replacing the zone.
- A building is an outline and a list of rooms; `layout.js` makes the walls,
  doors, furniture and standing places. A school in another town is another
  outline.
- The population is generated from a seed, a mix of peoples and a list of
  jobs, all in the zone. A different mix gives a Yoruba or a Hausa town.
- A language is a column in the phrase book. Adding one adds a column.
- Positions are zone-local, and each zone has an origin in one national frame
  (`geo.js`). A second town is more content and another zone, not a new
  coordinate system.
- A vehicle is an entity the simulation owns. Each driving step is an intent
  that is checked for speed, ground, obstacles and fuel. What it looks like is
  data the simulation owns too, so traffic, when there is any, draws from the
  same catalogue.
- Property ids carry country, state and local government
  (`NG-AN-OGB-000101`). All 37 first-level divisions are in `nigeria.js`.

## Prototype shortcuts

- A day lasts 48 real minutes. People walk at a real pace, so a 400 m walk
  takes about two game hours. Homes are therefore placed near work, long
  trips go by okada, and some people are late.
- Demand for okadas is higher than 26 riders can meet at busy hours. Someone
  who waits too long walks instead; on a weekday that is about four trips in
  ten.
- Townspeople do not have their own money. Their okada fares come from one
  pooled account and are settled hourly in one ledger transaction; riders'
  takings above a float go back to it each night. The total is conserved and
  audited. A player's fare is paid player to rider, at once.
- Townspeople do not buy goods, fall ill by need, or change jobs. Illness is
  a daily chance. Their needs are part of who they are, not yet a system.
- Resting, sleeping and attending class move the clock forward. A shared world
  cannot do that.
- Petrol is used about ten times faster than a real keke would at this scale.
- Saves go to the browser's local storage, one per zone, and on the website to
  the player's account. Chat is not saved.
- The layout is schematic and the people and businesses are invented. It is
  not a survey of the real Atani. The Igbo, Yoruba, Hausa and Pidgin in the
  phrase book were written for this prototype and have not been checked by
  native speakers.
- Sitting out time in the cell moves the clock forward, like sleeping.
- An officer always allows a prisoner's phone call after a short wait.
- Townspeople's stolen money comes from, and goes back to, the pooled account.
- `window.__nlw` is a debug handle used by the automated play-through. The
  name, like the keys the save is stored under, is from before the game was
  renamed; changing the keys would orphan characters already made.

## The website as an app

`node build.mjs` also writes `dist/site/`, and `node build.mjs --site` then
makes the repository's `site/` folder the same as it. `site/` is what the
host serves, as it is, with no build of its own (`vercel.json`). The game in
it is the game in `dist/index.html`; what differs is what surrounds it.

- **A whole document** (`src/site/head.html`). The page published as an
  artifact is wrapped in a document by its host; a website has to bring its
  own. Without one a phone lays the page out 980 pixels wide and shrinks it,
  the browser reads it by its old rules, and the page has a margin. With it:
  the phone's own width, the notch and home bar reported, the standard rules,
  black before anything is drawn, and no pulling the page down to reload it.
- **Nothing from anywhere else.** The 3D library is served from beside the
  page (the file in `vendor/`), not from cdnjs.
- **A manifest and icons** (`src/site/manifest.webmanifest`,
  `assets/brand/icons/`). A phone or a computer can install the game: it gets
  its own icon and name and opens on the whole screen, upright or sideways,
  with no browser round it. The icons are drawn from the mark by
  `tools/brand/make_icons.mjs` and kept in the repository; `share.png` is the
  picture that goes with the address when it is sent to someone.
- **A worker that keeps the files on the device** (`src/site/sw.js`, with its
  table of files filled in by the build). Two rules. The page: the network
  first, so anyone with a connection has the newest game the moment it is put
  live; the copy kept from last time when there is no connection, or when
  none answers in four seconds. Every other file: the kept copy, held under
  the fingerprint of its contents, so a file is fetched again only when it
  has changed. The figures are light copies made from the owner's files (1 to
  2.4 MB each to a phone: "Characters in a flash", below); only the one a
  player uses is kept. The owner's GLB files are not touched by any of this,
  and a test compares each with the MD5 it had when it was supplied.
- **In Settings, "This device"** (`src/client/webapp.js`): whether the game
  plays without a connection (asked of the worker, not assumed), and an
  Install button only when the browser has offered to install. On an iPhone
  or iPad, where there is no such offer, it says where Add to Home Screen is.
  Away from the website (the artifact, a copy on disk) the section is absent
  and no worker is started.

What to know about it:

- An installed game on an iPhone or iPad keeps its own storage: a character
  made in Safari is not in the installed game. On Android and on a computer
  the two share it.
- A browser decides for itself when to offer installing. The game cannot make
  it; it can only use the offer when it comes.
- Installing changes where the game opens from, not where a character lives.
  The character is kept by the server with the account, so logging in to the
  installed game brings it there: that is the answer to "I installed it and
  my character is gone".
- With no connection the installed game still opens, and a player who has
  signed in on that device before can carry on with their character; what
  they earn goes to the bank when the connection is back. Someone who has
  never signed in there is told the server cannot be reached and cannot
  play. The Wallet, the market and other players need the server.

## TR, the phone, accounts and the market (10 October 2026)

### One button system

Every button is cut from the same black with a thin bright line, after the
owner's reference. `.hx` is the bar with pointed ends (PLAY, Enter the town,
Woman and Man, Hero and Villain, Create account and Log in, Buy asset); it is
one SVG stretched as a border image, so any width keeps its points. `.btn` is
every other button, with its corners cut; `.part` the small plates for
animations and colours; `.blockarrow` the two solid, bevelled arrows that
change the character. They share their states: brighter under the pointer, a
shade smaller when pressed, white when chosen, dim when they cannot be used,
and a white outline for a keyboard.

### The phone in the hand

Pressing the phone button no longer opens a panel. The character puts the
right hand to the pocket, brings out a handset and holds it up
(`phone-hold.js`: the arm is solved to the hand each frame; the head turns to
the screen). The screen lights the hand and the face, more at night. The
handset on screen is the same one: small, at the lower right, the town still
in view (`#sheet.device.mini`).

- **In the hand**: the home screen, Camera, Music and a deal. With the phone
  out only the walking keys and the stick work; the buttons on the right are
  not there; putting it away brings everything back. It is not offered at the
  wheel, on a motorcycle, in a fight or in the river.
- **A page**: every other app opens over the whole screen with the way back
  at the top left, because it has lists to read and things to type.
- **Camera** draws the game's own scene a second time from where the handset
  is: the way the character faces, or back at the character's own face,
  mirrored as a phone shows it. Nothing is invented and no real camera is
  asked for. The shutter keeps a picture, which can be saved.
- **Music** plays four pieces the game makes itself and any song listed in
  `assets/music/library.json` (see `assets/music/README.md`; the build copies
  them to the site). Play, pause, next, previous, a bar to move through the
  song, volume, and what is playing; it goes on playing with the phone away,
  and never twice at once. **No recorded song is in the repository**: the
  list is empty until the owner adds songs they have the right to publish.

### Accounts

On the website only. A username (3 to 16 letters, figures and underscores)
and a password (8 characters or more): nothing else is asked.

- The password is never kept. The server keeps what scrypt makes of it with
  its own salt. A session is a random number in a cookie the page's code
  cannot read (`HttpOnly`, `SameSite=Lax`, `Secure`); the database holds only
  its fingerprint.
- Guessing is slowed: eight wrong passwords for a name, or forty from one
  address, and the next try waits fifteen minutes. A wrong password and a
  username nobody has get the same answer.
- **The character goes with the account.** Making an account while a
  character is on the device keeps that character. Logging in on another
  device brings it there. Each save says which copy it began from, so a
  device that has fallen behind is told and takes the newer copy rather than
  overwriting it. Logging out sends the character to the account first and
  only then clears the device.
- **Other players.** Signed-in players in the same town see each other, each
  under their **username**, shown over the head as a townsperson's name is.
  The server puts the name there; a game cannot appear under another's.
- On the website an account is now required before play: see "An account
  before play" below.

### Property and the market

**Property** on the phone is a page: what the player owns from the market,
their conversations, their land, and what they have bought and sold. **Buy
asset** opens the market: every open listing, searched by name (watch, car,
yacht, bike, motorcycle, gun, clothes are offered as words to press; a word
that matches nothing says so, and nothing is made up to fill the page).

- A listing can be **turned by hand**. What is turned is twenty-four
  photographs of the real model, taken from all round it by
  `tools/assets/make_turntable.mjs` with the game's own viewer. **See the
  model itself in 3D** fetches the model and draws it live.
- **The wristwatch is the owner's model, as supplied**: 64,658,368 bytes, 1.9
  million triangles, three textures, the same bytes on the site as in
  `assets/market/watch.glb`. It is far too large to send to everyone who
  opens the market, which is why the photographs exist; the model is fetched
  only when a player asks and has been told its size.
- **Show the way** marks the seller's place; the line on the radar leads
  there. A **pink column** stands at every open listing in town
  (`makeDealMarker`). Stepping into it, the screen goes to black and comes
  back on a conversation with the seller, on the handset, as in any messaging
  app: words, an offer, an answer.
- **A shop's price is the price.** HOLARIS Watch's attendant is automatic and
  says so: it knows the price and what is left, and does not bargain. Buy,
  confirm, and the watch is the buyer's.
- **Between players it is a real conversation.** Each sees the other's words
  about a second after they are sent. The buyer's Buy makes an offer; the
  seller sees **Sell property** with the amount, confirms, and the thing
  leaves one Property for the other while the TR goes the other way.
- An owner sells on from the thing's own page: a price, and the marker stands
  where they are. Only an administrator puts something new on the market
  (the owner names administrators in the host's settings, `PCW_ADMINS`).

### HOLARIS Watch

Three storeys of glass on open ground north of the motor park, west of Market
Road (`render-holaris.js`; the building is in the town's own list, so it is
solid, on the map and on the radar). Steel frame, lit showroom floors, the
name on the roof and over the door; after dark it is the brightest thing in
town. Ten wristwatches at 100 TR, each numbered. When the tenth is sold the
listing closes, its marker goes, and it is no longer in the market.

### The server

`api/game.js` at the top of the repository: one function on PostgreSQL
(`api/_lib/`), deployed by the host exactly as the repository has it. There is
no install step: the database client, postgres.js, is kept in
`api/_lib/postgres/`. The tables make themselves the first time the function
runs (`schema.js`), in their own schema, `pcw`, with row-level security on
and nothing allowed, so the database host's public keys can read and write
none of it.

What the server is the authority for, and what it is not:

| | |
| --- | --- |
| Accounts, sessions | The server, entirely |
| What is for sale, the stock, who owns what, whether a sale happened | The server, entirely. A sale is one database transaction: the listing is locked, the thing changes owner, the stock goes down, the offer is marked and the sale written, together or not at all. Fifteen buyers at once for ten watches get ten |
| The talk between buyer and seller | The server |
| **TR** | **The server (since 11 October 2026).** Every account has a wallet at the bank; see "The bank" below for what that does and does not mean while the town itself still runs in the page |
| Where players are | Each game says where it stands about once a second; the server says who else is there. Good for seeing and meeting; not for fighting, the law or anything else between two players, which still needs one world |

The town is still simulated in the page, so what a character earns and
spends there is reported to the bank, not decided by it. "The bank" below
says exactly what follows from that.

## An account before play, the bank, the map (11 October 2026)

### An account before play

On the website nobody enters the town without an account.

- The start screen is shut (`#start[data-gate]`: `wait` while the server is
  asked who is here, `shut`, `open`). Shut, it shows a welcome, **Create
  Account** and **Log In**, and nothing else: no name box, no figures, no
  Enter, no Continue. While the server is being asked it shows "One moment"
  and no part of the game, so nothing flashes past.
- It is not only hidden. `mayEnter()` in `main.js` is asked again when Enter
  or Continue is pressed, and a player who is signed out while playing (the
  session ended, or they logged out on another device) is taken back to the
  shut start screen. Everything the server keeps (the saved game, the
  wallet, what is owned, the market, who is in town) is refused without a
  session: the server answers 401.
- What is in the page itself cannot be locked from the page: the town is
  drawn by code the browser has been sent. Someone who rewrites that code can
  walk about a town on their own device. They have no account, so no wallet,
  nothing saved, nothing owned, nobody else in sight, and nothing they do
  reaches anyone.
- With no connection: someone who has signed in on this device before may
  carry on with their own character; anyone else is told the server cannot
  be reached.
- A new account's wallet and its 2,000 TR are made in the same database
  transaction as the account, once. A new character on an account that
  already has TR arrives with what the bank holds, not another 2,000.
- A copy of the game with no server (opened from a disk, or the published
  artifact) has no accounts and no gate.

### Exiting the game, logging out, and erasing a saved game (restarting)

Each asks first (`confirm.js`: a dialog with a title, what will happen, and two
buttons; Escape and Cancel change nothing; the keyboard stays inside it; it
is announced to a screen reader).

The game is saved on the device (every twenty seconds while playing, whenever
the page is hidden or the graphics are lost, and at a journey's start, a
purchase and the like) and, on the website, with the account (every minute
while playing, four seconds after anything to do with TR or the market,
whenever the page is hidden, and before logging out). Each save to the account
is numbered and the server keeps the newest: a copy played on since on another
device is the one loaded. TR and what is owned are the bank's, not the save's.
Opening the game again (and pressing PLAY) carries on where the player was.

The phone's Settings app opens on its **Game** section (19 October 2026, the
owner): **Exit game** and **Restart game**, side by side.

- **Exit game**: "Exit the game?" with Cancel and Save and Exit. The game is
  saved on the device and with the account (its answer is waited for, up to
  fifteen seconds: a save still on its way after that, or one that cannot be
  sent, is kept on the device and goes to the account when there is a
  connection, and the player is told so). The player leaves the town for the
  start screen ("Your game is saved", with **Play**, which carries on from
  where they were); other players stop seeing them; the town's sounds stop;
  they stay signed in. A page cannot close its own tab: from there the player
  closes the app or the tab, or plays on (`exitGame` in `main.js`).
- **Restart game** is the erasing below, moved up from the foot of Settings
  (it was "Erase this save and start again"), with the same question.

- **Log out**: "Log out of your account?" with Cancel and Log Out. Logging
  out sends the character to the account, ends the session on the server and
  clears this device.
- **Erase** (Settings, "Restart game"): "Erase your saved game?" with Cancel
  and Erase Save and Restart. It deletes the character and its town on the
  server and on the device and goes back to the start. **It does not touch
  the wallet**: the TR, the history, the beneficiaries and what was bought in
  the market belong to the account. The server keeps a marker where the save
  was, numbered one past the last save, so a copy still open on another
  device is refused when it next tries to save and cannot bring the erased
  game back.

### The bank: TR kept by the server

`api/_lib/wallet.js` and migration 2 in `api/_lib/schema.js`.

- **Every account has one wallet.** Amounts are whole numbers of half a TR.
  A movement is a row in `wallet_tx` and two or more rows in
  `wallet_entries` that add up to nothing: what leaves one wallet arrives in
  another. The database itself enforces it: a balance changes only when an
  entry is written (triggers), history cannot be changed or deleted, every
  movement must sum to zero when its transaction ends, and a player's
  balance cannot go below nothing. Three wallets are the system's: issuance
  (where arrival money comes from), the world (shops, and what is earned and
  spent in town) and escrow (TR set aside for an offer).
- **Sending** (`wallet.send`): by username, to a registered user, never to
  oneself. Both wallets are locked in a fixed order, the sender's balance is
  read only then, and the two entries are written together or not at all.
  Every send carries a key made when the confirmation screen is shown: the
  same key sent twice (a double press, a retry after a lost answer) is one
  transfer and gets the first one's receipt. The server takes no balance
  from the browser. **There is no fee**: the confirmation shows "Fee: None".
  Thirty sends a minute per account at most.
- **The Wallet app** (`ui-wallet.js`): the balance, the username with a copy
  button ("Username copied"), Send, Receive, saved beneficiaries (kept by
  the other account's id, so a beneficiary is a person, not a spelling) and
  the history. Send asks the bank to check first, then shows a confirmation
  (recipient, amount, fee, total, Confirm Transfer, Cancel), then a receipt
  with a reference. A username nobody has is answered "Username not found.
  You can only send TR to registered users."
- **The market** pays through the bank: a shop purchase moves TR from the
  buyer to the world in the same transaction as the sale; an offer to
  another player moves it to escrow, and it goes to the seller on yes or back
  to the buyer on no, withdrawal or the thing being sold to someone else.
- **"Add funds (sandbox)" is gone**, page and route, and the sandbox bitcoin
  module with it. Nothing in the page or the server can create TR on
  request.

**What the bank does not yet decide.** The town (wages, shops in town, fares,
fines, fees) is simulated in the player's browser, because there is no
shared world server. So with each save the game reports what the character
earned and spent in town since the last one, and the bank applies it in the
same transaction as the save. The bank cannot check a wage against a job it
did not see. What it does is cap it: an account may be credited at most
3,000 TR of town earnings an hour, with room for 10,000 TR saved up
(`PCW_EARN_HOUR`, `PCW_EARN_BURST`, in ledger units); anything over is
refused and the player is told. Spending is never capped, and a report that
does not follow on from the last one is refused. The consequences, plainly:

- Someone who rewrites their own page can claim town earnings they did not
  make, up to that allowance. They cannot touch anyone else's wallet, send
  what they do not have, go below nothing, or change a transfer or a sale.
- Every new account arrives with 2,000 TR. Six accounts may be made from one
  network address an hour; nothing else stops someone making accounts to
  send their arrival money to one of them. Whether new accounts should wait
  before they can send is for the owner to decide.
- Closing both needs the town to run on a server: the zone server the
  architecture calls for.

### Settings

Switches are a track with a thumb: muted green when on, neutral grey when
off, a light thumb, the word On or Off beside it, a visible ring for the
keyboard, and they say their state to a screen reader. Sliders have a
filled part in the same green. About is the owner's three paragraphs.

### The Map app

`town-map.js` draws the town from its own data (roads by rank, the river,
buildings with their names, the player, the destination, things for sale),
in the manner of a navigation map: drag to move, pinch or the wheel or the
two buttons to zoom, a button to come back to the player. No map service is
used and nothing is fetched. The way to a place is drawn **along the roads**
(`phone.js`, `byRoad`): from where the player stands to the nearest road,
through the road network, and off it to the door; the distance shown is the
distance by road, and it is worked out again as the player moves.

### The phone in the hand, again

The handset now sits in the palm, not out past the wrist. `phone-hold.js`
reads the hand's own frame from the figure's bones (where the knuckles are,
which way the fingers run, which way the palm faces), places the handset in
that frame, turns the wrist so the glass faces the figure's eyes, bends the
four fingers round the far edge and lays the thumb on the near one. Because
it is measured from the bones it holds for either figure. `test/hold.mjs`
measures it in a browser, standing and walking.

## Starter TR, one character, the upgrade (11 October 2026)

From the owner's second build prompt of 11 October and two screenshots. Live at postcivilwar.com since
12 October 2026, with everything in the two sections before this one.

### Starter TR and earned TR

Every account arrives with 2,000 TR. That is **starter TR**, and it stays starter TR for as long as any of it
is left. A wallet is three amounts, and every TR in it is one of them:

| | where it comes from | what it may do |
|---|---|---|
| **Starter TR** | the 2,000 TR an account is given, once | pays what the town charges and what living costs: fines, the ambulance, hospital bills, levies and permits, fares, food, fuel, hire. **Never sent to another player. Never spent on a thing to own** (land, a vehicle, what a building is made of, a mason's wage for a stage of it, anything in the market, a character upgrade) |
| **Earned TR** | wages and payment for work in town; TR another player sent; what a sale brought | anything |
| **Illicit TR** | what was taken from someone (the game has theft, and police) | spent as earned TR is; handed back first when the law catches up. It is never counted as starter TR, nor starter TR as it |

"Eligible" TR is earned + illicit: what can be sent, or spent on a thing to own.

What is drawn from when something is paid, always the same way: a charge or a cost of living takes starter TR
first, then earned, then illicit; a thing to own, a transfer, an offer and an upgrade take earned then
illicit and **never** starter (with too little of those they are refused whole: there is no part payment out
of starter TR); restitution takes illicit first. The worked example in the brief is a test
(`server/test/wallet.test.mjs`): 2,000 starter and 700 earned; a 300 TR fine leaves 1,700 starter; sending
800 TR is refused; a 500 TR vehicle comes out of the 700.

**Where it is kept and who decides.** On the website the three amounts are the server's
(`api/_lib/wallet.js`): `wallets.starter` and `wallets.illicit` beside `balance`, and every line of the ledger
says which of them it moved (`wallet_entries.bucket`). The page never says what kind of TR something is: a
transfer or purchase carries an amount and nothing else, and anything else a browser sends about it
(`balance`, `eligible`, `bucket`) is ignored. The database itself holds the rule, below the server's code: a
trigger refuses any entry that takes starter TR out of a wallet except in a town report (charges and costs),
and any that puts starter TR into one except the first grant and what a sale returns (below); another refuses
any change to `balance`, `starter` or `illicit` that is not an entry; a check keeps the parts within the
whole. `wallet.audit` verifies all of it against the ledger.

**What is written down.** The ledger says what moved: every movement has its two sides, its kind, which part
of each wallet it touched, who asked and when, and it cannot be edited. Beside it, `wallet_refusals` says what
was asked to move and did **not**, because of what the TR was or how much there was (a transfer or offer of
starter TR, more than was earned, more than there is, an upgrade at a fee the server did not quote): who
asked, which request, how much, the reason given, and the figures the server went by. It too is only ever
added to. What a town reported and the bank would not believe or would not take from starter TR is in the
`game` movement's own record.

**No way round.**
- *Sending* moves earned as earned and illicit as illicit; starter TR cannot be a side of a transfer.
- *An offer* in the market is set aside from eligible TR only, and comes back as what it was.
- *Buying and selling back.* What was bought before this rule, when starter TR was let buy, carries how much
  starter TR went into it (`holdings.starter_basis`); when it is sold, that much of the price reaches the
  seller as starter TR again. Nothing bought since can have any in it.
- *In town.* The town is simulated in the browser, and keeps the same rule itself (`src/sim/funds.js`): the
  Lands Registry, the vehicle seller and the builder's yard refuse starter TR at the counter, with the actual
  reason. What each payment *is* is read from the game's own ledger (its key and kind), and reported to the
  bank with each save in categories (`in: lawful, illicit`; `out: cost, restitution, asset`); the bank applies
  its own rule to them. An asset reported beyond the eligible TR there is, is simply not paid out of starter
  TR (the player is told). TR that passes between players inside a town (a thief's takings, a constable's
  share of a fine) arrives as what it was when it left: starter stays starter.
- *Many accounts.* The arrival money of a second account is as untransferable as the first's.

**What a player sees.** The Wallet shows the balance, and under it one line, "700 TR can be sent or spent on
assets", which opens to Total, Starter TR, Earned TR (eligible) and what is set aside for offers. The Send
form says "You can send 700 TR" before anything is typed. Refusals say the actual reason, in the words asked
for, and never that the balance is too small when it is not:

- "Starter TR cannot be transferred. Earn TR through gameplay to send money to other players."
- "Starter TR cannot be used to buy assets. Earn TR through gameplay to make purchases."
- "You do not have enough eligible TR for this transaction." (followed by the figures)

**Accounts that existed before** (migration 3, `api/_lib/schema.js`). Nothing is deleted and no balance is
changed. Offers waiting for an answer are declined first and their TR returned (they were made under the old
rule). Then each wallet is divided conservatively: its **earned** TR is the smaller of (what it holds above
2,000 TR) and (what its town reported earning to the bank, all told); **everything else is starter TR**. So
TR whose source cannot be shown is restricted, not freed; a balance at or under 2,000 TR is all starter. The
figures used are written to `wallet_reconciled`, one row per wallet, so any of them can be reviewed and
corrected by a later, deliberate step. Tested on a populated copy of the first set of tables and of the
second (`server/test/migrate.test.mjs`, `migrate2.test.mjs`).

**What this does not close.** The town still runs in the browser. Someone who rewrites their own page can
report town earnings they did not earn, up to the allowance (3,000 TR an hour; a new account begins with room
for 500 TR, not the full 10,000, so a fresh account cannot claim much at once). That TR would be earned TR.
It closes when the town runs on a server; until then it is capped, logged with every save (`wallet_tx` kind
`game`, with what was claimed and what was refused), and visible to an audit. Plots cost more than the arrival
money already, so in ordinary play nothing a newcomer could buy on day one is lost by this rule.

### One character, chosen once

A player has one character. It is chosen when the account first plays, with the name, and Enter asks
"Choose Adaeze?" (Choose This Character / Go Back) before anything is kept. It is kept **on the account**
(`accounts.figure`, with `accounts.path` for hero or villain), not in the saved game, so it is the same on
every device, and still the account's after a saved game is erased and a new journey begun. The server takes
a first choice once (`character.choose`): a second, different one is refused (`CHOSEN`).

After that nobody is asked again. Someone who has a character and opens the game, logs in, reloads, or comes
back on another device is taken **into the town**: no screen that offers a character, a path or a name, and
no Continue button to press. (`route()` in `src/client/main.js` is the one place that decides this.) If the
character cannot be fetched they are told so, with Retry, and nothing else is offered: no other character is
put in its place. With no connection, someone who signed in on the device before goes in with the copy kept
there.

An account from before this was kept takes the character and path its own saved game already has, once
(migration 3 does it for saved games on the server; the page does it for an account whose only copy is on a
device). An account that never answered hero or villain is asked, once, when it next begins a journey.

**Hero or villain is asked once**, in the opening where there are no accounts, and straight after an account
is made where there are. (It stays "being asked" until its answer has been handed over: when it stopped
being so while still leaving the screen, anything that looked in that half second put it a second time,
unseen, and a V or an H typed in the name then changed the answer.) The row "Your path: Hero / Villain" that stood on the character screen (the owner's
second screenshot) is gone, with both Continue buttons.

**Looking is free.** Settings, Character, "View characters" opens the same turntable from inside the game.
Every character can be turned and its animations played. The one the player is, is marked "Your character";
another is marked "Looking only" and has one button, "Upgrade to Emeka". Looking changes nothing: not who the
player is, at the bank, in the town or on the device, and not where they stand.

### The upgrade

Changing character is a paid upgrade, and the only way to change.

- Offered only when the **whole balance is more than 2,000 TR** (exactly 2,000 is not enough).
- The fee is **a quarter of the whole balance at that moment** (2,400 TR: 600; 4,000: 1,000; 8,000: 2,000;
  12,000: 3,000), to the half TR, rounded down (TR is kept in halves: 2,790.5 TR gives 697.5).
- **All of it must be earned TR.** Starter TR pays none of it; there is no part payment.
- The player is shown, before anything happens: Current character, New character, Current balance, Upgrade
  fee, Balance after upgrade, and "Upgrading changes your permanent character. You will need to pay another
  upgrade fee to change it again." Cancel / Confirm Upgrade. If it cannot be had, the same figures are shown
  with the actual reason and only Close.
- The server works the fee out itself from its own books, with the account and its wallet locked
  (`api/_lib/character.js`). The fee the page was shown is sent back only to be **checked**: if the balance
  has moved since, nothing is charged and the player is shown the new figure (`QUOTE_CHANGED`). A fee of the
  browser's own choosing therefore changes nothing.
- The fee and the new character are written in one transaction, or neither is. Asked twice under one key, it
  is done once; two at once are done one after the other, the second against the new balance.
- Every change is recorded (`character_changes`: from, to, the balance it was worked out on, the fee, the
  bank's reference, the time) and appears in the Wallet's history as "Character upgrade".
- Changing back is another upgrade at another fee.

Where there is no server (a copy on disk), the same rule is kept by the town's own ledger (`sim.js`,
`character.quote` / `character.upgrade`).

### Fitting the screen

Three things from the owner's prompt, each fixed where it went wrong and not by clipping. (Two screenshots
came with it: the name cut off, and the character screen. The third, of the balance, did not arrive, so that
one was found in the code and by measuring, and should be checked against the owner's own phone.)

- **The game's name cut off at the top of a phone held sideways.** The start screen centred its one column
  in the screen; when the column was taller than the screen, centring pushed its top above the top, where it
  could not be scrolled to. Now the column takes an auto margin (centred when it fits, starting at the top and
  scrolling when it does not), on a phone held sideways it is two columns (story left, what to do right) so
  that it fits without scrolling on most phones, the name's size follows the width and may wrap, and the
  padding includes the notch.
- **The balance clipped at the top in town.** The purse sat 3 px below the safe area with a line-height of 1, and
  its figures have a black edge drawn outside their own box, so on a phone held sideways the top of the edge
  was at the very top of the screen and was cut. It now starts 8 px below the safe area with room for its
  edge (the test asks for 5 px clear at every size), and its figures are sized from the room there is and how many of them
  there are, so a balance of ten figures fits a 320 px phone.
- **The character screen's buttons running over** went with the row that was removed.

And, found by the audit below and fixed the same way (sizes that give way, wrapping, a column that may be
narrower than its contents): the arrows beside the character's name on a 320 px phone and in the stage's half
of a phone held sideways; Create Account and Send/Receive on narrow phones; a dialog's answers, which now
stay at the foot of the dialog while what is above them scrolls (the upgrade's table on a small phone).

`test/fit.mjs` goes through every screen a player meets (cover, shut start screen, account form, the
question, choosing a character, being asked to be sure, the town, the town with a very large balance, the
Wallet and its breakdown, Send, Settings, the characters, the upgrade, erase and log out) at thirteen sizes
(320x568, 360x640, 390x844, 412x915, 568x320, 640x360, 800x360, 844x390, 915x412, 768x1024, 1024x768,
1280x720, 1600x900), resizing without reloading as a phone is turned, and fails if anything named is off the
side, cut off where it cannot be scrolled to, or has words that do not fit their button, if the page scrolls
sideways, or if turning the phone moved the player or lost anything. It is a desktop browser pretending:
**it does not replace a real phone** (notches, the address bar, the on-screen keyboard and real fonts are
only approximated).

## Faster to start (12 October 2026)

The owner's message of 12 October: the game was slow, with a photograph of the "Welcome back / Preparing the
town" card and the Skills button showing through it.

**The card that never went away.** That photograph was a fault, not slowness: a returning player was taken
into the town and the card stayed drawn over it for good (one style rule kept the start screen shown after it
was put away). Fixed and put live the same night; the tests now check that nothing of the start screen is
left over the town, after every way into it.

**Measured, then changed.** Where the time went was measured before anything was changed: a profile of the
page from opening to the town being ready, a profile of walking in town, and the browser's own timeline. In
town the game's own work was about 10 ms a frame on the test machine, which a phone can afford; the time was
in starting. Three things were changed:

- *Building the town.* Every mesh in the town is gathered by `Batch` (`src/client/render-kit.js`). It used to
  unfold, move and copy every shape three times over and keep the numbers in ordinary lists; it now does it in
  one pass into 32-bit arrays, and makes no geometry at all for a box. The town is the same to the last bit:
  `test/render-kit.test.mjs` compares the two ways on every kind of shape, and every mesh the page makes was
  fingerprinted before and after. The town's paths (`src/sim/zones/atani.js`) are worked out over plain lists
  instead of making a new list of every node for each search; the town's data is the same, checked by a
  fingerprint of all of it.
- *The page.* On the website the character kit and the vehicle kit (6.4 MB of the 9.4 MB page) are files of
  their own: fetched the moment the page starts to arrive, unpacked on a worker, and kept by the service
  worker under their fingerprints, so that bringing the game up to date no longer sends them again. The page
  is now 3.1 MB (1.4 MB as sent, from 3.7 MB). The page asks for each by the fingerprint it was built with,
  and the service worker never mixes a page with the files of another build.
- *Someone who already has a character.* The character screen's own 3D view (a second drawing surface, with
  the figure's textures sent to the graphics card a second time) is not made until that screen is shown, and
  the town no longer waits for it.

Measured on the same machine, the same way, before and after (a phone-sized window; the machine draws with
software, which makes drawing far slower than on any phone, so the drawing-heavy totals say little about a
real device and the script times say more):

| | before | after |
|---|---|---|
| the page, as sent | 3.7 MB | 1.4 MB |
| script run from opening the page to the town being ready | 4.4 s | 3.5 s |
| of which: building the game (`start`) | 2.4 s | 1.8 s |
| of which: building the town's meshes (`buildWorld`) | 1.4 s | 1.0 s |
| of which: working out the town's paths | 0.27 s | 0.10 s |
| a returning player, from opening the page to being in town | 14.0 to 15.0 s | 11.8 to 12.8 s |

**What is still slow, and why** (as it was on 12 October; see "Characters in a flash" for 20 October). The opening
showed its splash for five seconds by design; a returning player waited for that before PLAY. A first visit downloads the woman's figure (7.8 MB as sent) and the page and kits
(3.7 MB): the owner's figure files are used exactly as supplied, so they are not made smaller. Each shader the
town uses (68 of them) is compiled once at start; on a phone that is a second or two the first time.

**On the owner's phone.** Settings, "Measured on this device" shows frames a second and the slowest part of a frame,
measured on the device itself: those are the numbers to look at if the town itself feels slow.

## The real day and the real weather (12 October 2026)

The game's clock is the player's own clock. If it is 9:20 on a Monday morning where the player is, it is 9:20 on
that Monday morning in Atani; at noon the sun is high, at night it is dark, and a player who joins today arrives on
today's date. A player in another country plays in their own time of day. Time cannot be skipped: sleeping or
waiting no longer moves the clock on, and anything that used to take game hours (a sentence in custody, a
record that lapses, recovering after a knock-down) takes that long in real minutes, scaled from the old 48-minute
day so that nothing takes thirty times longer than it did.

The weather is the real weather where the player is: the server asks MET Norway's forecast for the player's
place (from where the host says the request came from; Atani's if it cannot tell), turns it into clear,
cloudy, rain or storm, and keeps it for each place for a while (`pcw.weather_cache`). The forecast is used under
CC BY 4.0 and Settings says so. Without a connection the weather is the game's own.

`#gameclock` in the address brings back the old 48-minute day, for the play-through tests.

## Six characters, and bodies that react (12 October 2026)

**The figures.** The owner supplied four more GLB characters: an athlete and a police officer (women), a priest
in his vestments and a hooded warrior (men). With Adaeze and Emeka there are three women (W1 Adaeze, W2 Ngozi,
W3 Amaka) and three men (M1 Emeka, M4 Ikenna, M5 Uche). M2 and M3 are not used: they named figures taken out on
8 October, and an old save that names one stays as it was. Each file is used byte for byte (`test/figures.test.mjs`
checks their checksums), drawn at a person's height, with its own textures (the priest's file also has a normal
map and a roughness map, which are now read). A new player chooses any of them on the selection screen, in their
own list; a player who already has a character reaches them only through the paid character upgrade, as before
(the server's check on an account's character was widened by migration 5).

The files are rigged two ways: the athlete and the officer like Adaeze and Emeka (Unreal's bone names), the priest
and the warrior with Mixamo's (`mixamorig:Hips`). The game reaches for bones by the Unreal names; a Mixamo figure
answers to both. Bone names are read the way three.js binds animations (`boneName` in `glb.js`): before, a Mixamo
file would have stood in its bind pose.

**What a file lacks, borrowed.** The officer's file has no walk or run, the priest's no run, three have no
standing-still clip and three no swim. Rather than slide a figure along in a pose, those are carried over from
another supplied figure onto this figure's own bones (`tools/characters/borrow.mjs`, written to
`src/client/figure-borrowed.js`): between files rigged the same way each bone turns from its bind as the
source's does; between the two riggings each limb is pointed the way the source's points. Only rotations are
carried, so every figure keeps its own proportions. Each new figure also has its own sitting pose, carried over
from Adaeze's sit, for a keke's seat or a motorcycle.

| | stands | walks | runs | swims | hit | falls | punches | kicks | phone call |
|---|---|---|---|---|---|---|---|---|---|
| Adaeze (W1) | agree | own | own | own | by hand | fall, defeat_03 | box_01, box_02, box_03 | front_kick_02, _01 | make_a_call_02 |
| Emeka (M1) | agree | own | own | own | hit_to_head | laid flat by hand | by hand | front_kick_02, _01 | make_a_call_01 |
| Ngozi (W2) | officer's idle | own | own | own | by hand | fall | by hand | by hand | make_a_call_02 |
| Amaka (W3) | own idle | Emeka's | Emeka's | Emeka's | by hand | fall, defeat_03 | by hand | by hand | make_a_call_02 |
| Ikenna (M4) | officer's idle | own | warrior's | Emeka's | by hand | fall, defeat_03 | by hand | by hand | make_a_call_02 |
| Uche (M5) | officer's idle | own | own | Emeka's | hit_to_head | laid flat by hand | box_01, box_02, box_03 | front_kick_02, _01 | make_a_call_02 |

**Reacting by itself.** A blow that lands in a fight, a blow the player throws, being knocked down by a vehicle
and being killed are shown on the figure without anyone opening the Skills menu (`react` and `lay` in
`src/client/animated.js`, called from the fight feed and the knock-down the simulation already reports). Each is
shown with the figure's own clip where its file has one, and by moving its bones by hand where it has none (the
head snapping back, an arm thrown out, a leg swung up). A fall uses the figure's own falls: the first when run
down or killed, the second (where there is one) for a lighter knock. Several files' falls turn the body without
lowering it, so a lying figure is let down until it rests on the ground, and raised again as it gets up. What
matters more interrupts what matters less: falling over everything, then being hit, then a blow or a shot, then a
phone call, then a skill; walking off ends a blow or a call at once rather than sliding the feet. The Skills
button is as it was, and plays each figure's own clips; the new clips have one-word names (Pray, Bless, Spar...).

**A phone call.** When a call goes through, the hand takes the handset from in front of the chest up to the ear,
the glass against the cheek, for as long as it takes to say what is said, and back down; while the figure stands,
its own call animation plays on the rest of the body. The handset stays in the palm (the hand's frame is read
from each figure's own knuckles, so it fits every rig), and anything that takes the phone out of the hand (a
fight, a vehicle, the water) ends the call.

**Not done, and why.** There is no gun or shooting in the game to connect a pose to; the officer's, the priest's
and Emeka's files have kneeling `shoot` clips, which play as skills. No file has a get-up animation (a figure
blends back to standing) or a hit from a particular direction.

## Power bikes and surfboards: ready for their models (12 October 2026)

No power bike and no surfboard is in the game, because neither model has been supplied; nothing offers one. What
does not need the model is built and tested:

- **Handling** (`src/sim/power-bikes.js`): a big motorcycle leans into a turn and turns by leaning, wider the
  faster it goes, stands up when let go, accelerates less as it nears its top speed, brakes hard without going
  backwards and slows off the tar. Each bike may change any of it.
- **Controls**: a layout of its own while riding one, nothing of the walking stick or the car's pedals: a left and a
  right steering arrow at the lower left, the throttle and the brake at the right, the horn at the top right;
  each lights blue and white while a finger is on it. It comes when the player gets on a power bike and goes when
  they get off. With a keyboard: W, S or Space, A and D, H.
- **Engines and horns** (`src/client/bike-audio.js`): made in the browser, like every other sound in the game, from
  what an engine is: a 500 cc single, a 650 cc parallel twin, a 1000 cc inline four and a 1200 cc V-twin, each
  beating at its own firing rate, with its own pipe, rasp and airbox, climbing with the revs through the gears,
  starting, settling, crackling on the overrun and running down. A bike may bring its own recordings instead. It
  plays through the vehicle volume, so the settings and mute govern it; the town's sounds are not touched.
- **Surfboards** (`src/sim/surfboards.js`): who may surf (an owner, in the water), how a board goes on the river and
  stops at the bank, and getting off. Three of the figures already have a surf pose.

Adding a bike or a board is adding its entry, with its model.

## Beyond the town: the road to Onitsha, Atani Airport, the bridge (12 October 2026)

`src/sim/zones/atani-outskirts.js` and `src/client/render-outskirts.js`. The town itself is unchanged.

- **The road to Onitsha.** Registry Road goes on out of town as the Atani–Onitsha Road, two lanes with lines and
  verges, lamps, and roadside shops that come closer together the further it goes, towards the city. The real road
  is twenty-odd kilometres through Ogbaru's riverside communities to Okpoko and Onitsha; this is its first stretch,
  shortened and schematic, and it ends at road works where the world ends. Odekpe, Ohita, Okpoko and Onitsha are
  named on the sign at the edge of town, where the road goes; none of them is placed at a made-up spot on it.
- **Atani Airport** (an invention of the game): a 540 m runway with its markings and edge lights, a parallel
  taxiway, an apron with five stands marked for the aircraft that will come later, a glass terminal with doors for
  departures, check-in and arrivals and a hall with check-in desks inside, a control tower, an administration
  building, a fire station, a car park, the airport road and the fence round the airside with its gate. No
  aircraft, and no flights: there is nothing to fly yet.
- **The bridge.** A crossing of the game's own over the Niger, after the owner's photographs of the river's steel
  through-truss bridges: riveted trusses with an X in each bay, cross girders overhead, footways and rails, and
  piers of two tapering concrete legs on round caissons in the water. It rises from Waterside Road over an
  embankment, carries its deck 7 m over the water, and comes down on the far bank to a barrier: Asaba and Delta
  State are for later. It is not the First Niger Bridge, which is at Onitsha, and does not say it is.

Walking and driving go everywhere there is ground or deck, and nowhere else: the rails, the fence, the terminal's
glass and the road works are walls. The deck carries whoever is on it at its height (`zoneGroundY`), so a
player, a keke or a motorcycle goes up the approach and across, and the camera with them; one cannot swim from
the deck. The map and the radar show all of it.

## Asaba, Delta State; twelve motorcycles; five hundred billboards and the ADS app (13 to 16 October 2026)

From the owner's Delta State prompt, twelve motorcycle models and eighteen billboard photographs. (The two sections
above describe the town as it was first built, as Atani in Anambra State; what changed is here.)

### Asaba, Delta State

- The town is **Asaba**, Oshimili South, Delta State, on the west bank of the Niger (`src/sim/zones/atani.js`: the
  name, the state, the local government, the map's origin at 6.198 N 6.733 E, plates `ASB nnn DT`). Its quarters
  and lanes, the hospital, the polytechnic and the college of education carry Asaba names. The road out south is
  the Asaba–Kwale Road (Kwale, Ughelli, Warri on its sign); the airport is **Asaba Airport**.
- Kept on purpose as identifiers only, never shown: the file names `atani*.js`, the zone id `NG-AN-OGB-Z1`, the
  government account codes and the road id `onitsha`. Saved games and the server's records refer to them.
- **The people**: about seven in ten speak a Delta language at home (Enuani Igbo 32 %, Urhobo 12, Isoko 7, Ika 7,
  Ijaw (Izon) 6, Itsekiri 4, Ukwuani 4), the rest Igbo, Edo, Yoruba, Hausa, Igala and Efik (`ZONE_POPULATION`, one
  table, easily changed). The game's phrase book has Igbo, Yoruba, Hausa and Pidgin only: a townsperson whose
  language it has no phrases for speaks Pidgin or English to the player and says which language they speak at
  home. Lessons are in English. Nothing is made up in a language the game does not have.
- **The bridge** now lands at a gantry over its far end: WELCOME TO ANAMBRA STATE — LIGHT OF THE NATION, and the
  barrier beyond it: Onitsha and Anambra State are not built.
- The About page is the owner's text.

### Twelve motorcycles

The owner's twelve models, each the supplied file byte for byte, are sold at the **Motorcycle Showroom** by
Waterside Road from 1,000 TR to 10,000 TR (`src/sim/power-bikes.js`; the server's own list in
`api/_lib/schema.js`, a test checks they agree). Arrival money may buy one (the owner's exception: the database
allows starter TR out for a showroom motorcycle and nothing new), one of each to an account, kept on the server.
From Property, Ride puts the bike under the player: the rider on its seat, hands on its grips and feet on its pegs
(`src/client/own-bike-view.js`), wheels turning, leaning into turns, getting off leaves it standing. Each bike has
an engine of its own, made in the page, that runs as long as the throttle is held; Play sound and Stop sound on
its page, quiet when the page is left. The owner's own recordings go in where those engines are, one for each bike,
when they are sent.

### Five hundred billboards

Eighteen photographs (one a repeat), seventeen kinds, built in three dimensions from their parts
(`src/sim/billboards.js` for the kinds, `src/client/render-billboards.js` for the steel): poles with flanges and
base plates, raked legs, yellow scaffold legs with their bracing, side trusses, the box behind the face,
platforms of grating with handrails, ladders with cages or pegs, floodlights, and the five digital kinds (a screen
on a unipole, a four-sided tower, a curved screen on a mast, a chrome frame on a plinth, a building wrapped in
screens). `tools/billboards/place.mjs` places them: 500 (150 small, 150 medium, 120 large, 60 extra-large, 20
digital screens), 52 at the airport, 142 on the Kwale road, 306 in town, in 28 sizes, each with its identity
(`BB-001` ...), every pole and leg on level open ground (not on a road, a plot, a path, in a building or the
river: `test/billboards.test.mjs`), its supports walls to walk into. Each face says PLACE YOUR ADS and its own size.

Drawn as instances: one shape of each kind, its instances near the camera in full, further ones as an outline,
none beyond sight; one set of faces for each size; the screens drawn again only when near.

### ADS and Admin

`src/client/ui-ads.js` on the phone; `api/_lib/ads.js` on the server.

- **ADS**: the prices, the billboards (by category, place and whether free), one billboard (its size, the shape a
  picture must be, how long), the brand and link, the flier or three to ten slides, the whole price with the fee
  and tax and the first free days, the Advertising Terms and Conditions (`src/sim/ad-terms.js`) and the checkbox,
  submit; then the campaigns with their status, days and the reviewer's words, and Cancel while one waits.
- **Money**: `(fee + tax) × days` in whole TR, from the server's own table; a week is 7 days, a month 30. Only
  earned TR pays (not arrival money, not TR taken from someone). Submitted, the total moves from the player's earned
  TR to the bank's `adhold`; approved, the fee goes to `adverts` and the tax to `adtax` (the Delta State agency's);
  rejected or cancelled, it comes back. Each happens once, under its own key, with the campaign's row locked; a
  billboard's row is locked while its days are found, so no two campaigns share a day.
- **Pictures**: PNG, JPEG or WebP stills, checked from their own bytes on the server (kind, pixels, 2.4 MB at most,
  the billboard's shape within 4 %); given to anyone only while their campaign is approved and running.
- **Admin** (only on an administrator's phone; the server checks every request): campaigns waiting with their
  pictures, approve, or not with a reason; every campaign; the advertising tax and fees, what is held, players'
  TR, recent payments, market sales, upgrades, the advertising history and whether the books agree.
- **No email** is sent: the owner chose to keep submissions in the database only. Nothing says one was sent.

## Fifteen motorcycles, engine sizes and the speedometer, riding posture, coming off, and the action buttons (16 October 2026)

- **Fifteen motorcycles.** The owner sent fifteen files: twelve are byte for byte the twelve already in the game,
  and three are new, used exactly as supplied (one was made in centimetres: `tools/vehicles/bikes.py` reads it at
  the same scale as the others, which changes nothing of its shape): the **Gold Muscle Roadster** (4,000 TR), the
  **Black Bobber** (1,500 TR) and the **Dark Power Cruiser** (2,500 TR), in a third row at the showroom (database
  step 8).
- **Engine sizes.** Each bike has an engine size from the owner's list (`BIKE_CCS` in `src/sim/power-bikes.js`):
  500 to 3,000 cc. Its top speed follows it evenly, 100 km/h at 500 cc to 240 km/h at 3,000 cc, and so does how
  hard it pulls. The throttle takes the speed up smoothly and less hard near the top; letting go slows it by the
  engine, the road and the air (more the faster it goes); the brake takes it down fast.
- **The speedometer** (`src/client/speedometer.js`): see-through, at the front of the screen while one of the
  player's motorcycles is ridden; a dial to just above that bike's top speed, a needle and the km/h that follow the
  speed without jumping, the engine size under it, and red while braking. What is written at the foot of the
  screen moves up above it.
- **Riding posture** (`src/client/own-bike-view.js`, `RIDE`): forward over the tank, more at speed; hands on the
  grips and feet on the pegs; into a turn the body goes over with the bike and a little further, the head turns
  into the turn and is kept nearly level. (The bike itself now leans into the turn: it leaned the wrong way before.)
- **Coming off** (`crash` in `src/sim/own-bikes.js`): ridden into something solid faster than 20 km/h, the rider
  is thrown off by themselves, lands ahead and lies there with the figure's own fall, and gets up after a few
  seconds; the bike lies on its side where it hit until it is ridden again. The life lost is in proportion to the
  speed: 5 in 100 at 240 km/h (the top speed of the biggest engine), less below.
- **The action buttons** (`src/client/action-button.js`; "The action buttons" in `template.html`): every touch
  control is see-through with a thin luminous blue outline and a blue drawing, turns green the instant it is
  pressed and blue the instant it is let go (also when the touch is cancelled, the finger is dragged off it, or no
  finger is left on the glass), for walking, swimming, cars and motorcycles. The car's and motorcycle's pedals are
  drawn as the owner's screenshots draw them, the motorcycle's steering as two chevrons. Keys and a game controller
  light the same buttons. A new control is a spec (`id, icon, kind, shape, size, place`) and gets all of this.
- The airport's runway, taxiway and apron count as paved: a bike reaches its top speed on them.

## The motorcycles' engines, lamps and flames, and other riders (16 October 2026)

- **The owner's recordings.** Eleven WAV files came, one of them a second copy of another, none of them labelled.
  `tools/audio/bike_sounds.py` measures each (its firing rate, its loudness over time, where it starts and stops)
  and says what it found: a big V-twin started, idled and switched off; the same twin steady; a sports four idling,
  blipped, cruising, revved and flat out through the gears; a race bike changing gear. **No horn is among them**,
  so the horns are still the game's own. The supplied files are kept unchanged in
  `assets/vehicles/bikes/sound/original/`; the game plays cuts of them (`sound/game/`, served as
  `bikes/sound-*.wav`): for each of the two engines an idle, a middle and a high loop, and the start and the
  switching-off. The V-twin cruisers (Black Cruiser, Chopper, Olive Muscle Cruiser, Gold Grand Tourer, Black Bobber,
  Dark Power Cruiser) play the twin, the rest the sports four, each pitched a little its own way.
- **The engine as it is ridden** (`createRecordedEngine` in `src/client/bike-audio.js`): getting on turns the key
  (the start, then the idle comes in as it catches); the three loops play together, crossfaded by the revs and
  sped up or slowed to the pitch the revs ask for, so nothing is heard to restart and no copy is left playing; the
  throttle adds bite; getting off plays the switching-off. The revs (`bikeRevs`) follow the speed through six
  gears and the throttle: idle standing still, falling at each change, the red line only flat out at the top speed.
  The recordings are fetched the first time a bike that plays them is heard. Only if they cannot be fetched at all
  does a bike fall back to the engine the game makes (and its status says so).
- **On a bike's page in the market**: Start engine (the start, then idle; pressed again, Switch off), Rev (held:
  the revs climb smoothly to the red line; let go: back to idle) and Horn (held for as long as it sounds). Rev and
  Horn are action buttons: green while held, and let go however the finger leaves them. One engine at a time;
  another bike's page, getting on a bike or leaving the page stops it. It is only a sound: no bike is put in the
  town and no other player is told of it.
- **Lamps, flames and suspension** (`effects` in `src/client/own-bike-view.js`, `lampsOf` in `bike-model.js`, at
  the headlamp, tail lamp and silencers `bikes.py` found in each model): head and tail lamps at night, with a light
  that follows the ridden bike's headlamp on the road; the brake lamp bright red while braking; flames from the
  silencers only on the big engines (1,850 cc and up) with the throttle wide open near the red line, and a burst
  when it is shut at high revs; the nose dipping under hard braking and the bike riding the road (more off the
  tar); the view shaking a little near the top speed.
- **Other riders.** A player on their own motorcycle sends which bike and what it is doing (lean, speed, throttle,
  brake, revs, horn) with where they are (`src/net/link.js`; the game checks every field, `talk.js`). Everyone near
  sees the same model under them, seated with hands on the grips and feet on the pegs (the game's own figures too),
  leaning, with its lamps, brake lamp and flames, and hears its engine and horn from where it is (the nearest three
  engines within 120 m; each is let go when the rider gets off or rides away). Other players out beyond the town's
  square (the airport, the road out, over the bridge) are now seen there too: they were dropped before.

## The first city block (16 October 2026)

From the owner's city brief and street recordings: one representative block built and checked first, before the
rest of the map. Market Road, from the Registry Road junction to the Waterside Road junction, is now a city
boulevard (`src/sim/zones/atani-city.js` says what is where; `src/client/render-city.js` draws it).

- **The road.** Four lanes of about 3 m between kerbs, a slight crown, paired yellow lines down the middle, dashed
  white lines between the lanes, a yellow line along each kerb; zebra crossings at both junctions and at the market
  gate, stop lines, straight-on arrows, drains at the kerb and manholes in the lanes.
- **The pavements.** Four metres of warm sandstone pavers (60 by 40 cm, in a stretcher bond) each side, 15 cm above
  the road on real kerbs, turning the corners into Registry Road and Waterside Road and paved up to the buildings'
  fronts; they slope down to the road at every crossing (no step anywhere on a crossing's line). The ground is the
  pavement's height where it stands, for the player, other players, the town's people and vehicles.
- **Along them.** Streetlights both sides with their arms over the road (and their pools of light at night),
  traffic signals at the junction for all four ways in and at the market gate crossing, black bollards along a
  raised lawn behind a low panelled retaining wall (with trees and shrubs), bins in pairs, hydrants.
- **The buildings.** Six, all real geometry: a brick shopfront terrace (shopfronts, fascias with names, awnings,
  lintels and sills, a cornice), two rendered towers with windows set back in a grid and balconies, a stone building
  with an arcade of arches at street level, and two glass office towers with curtain walls (mullions, opaque floor
  bands, a granite podium, an entrance canopy), reflecting the sky. Some windows are lit at night. They are not
  entered. Everything the town had here stays where it was: the police post, the clinic, the store, the kitchen,
  the trade sheds (now painted kiosks on the pavement), the market, the HOLARIS showroom and the motor park; the way
  into the market and the store is left open.
- **People and traffic.** The town's people walk the pavements, not the middle of the road (the walking graph has a
  pavement path and walking along the carriageway costs four times as much), cross at the crossings and stop at
  the kerb before stepping out. The okadas keep to the inner lane on their side and stop at a red light; the
  signals change by the town's own clock (`signalState`), so what is seen and what the traffic does agree.
- **Asset provenance.** Nothing was downloaded or copied: the road, paving, kerbs, furniture, lawn and buildings
  are made in code (`render-city.js`), and their textures (pavers, asphalt, brick, stone, render) are painted in
  code at their real sizes. The kekes and coaches are the owner's supplied models; the people are the town's own.
- **Not yet.** There are no cars, vans or buses in traffic: no models of them were supplied (only the keke and the
  coach), and none are invented. Only the okadas and the ambulance move on the roads; players drive kekes and their
  own motorcycles. People wait at the kerb for a few seconds rather than for the walkers' signal. The rest of the
  map is as it was until this block is approved.

## PostCivilWar PowerBike, and eighteen more characters (16 October 2026)

### PostCivilWar PowerBike

The motorcycle showroom is the owner's supplied skyscraper (`assets/buildings/powerbike/skyscraper.glb`, 7,985
triangles and one 8192-pixel picture, used exactly as supplied and served beside the page as `powerbike.glb`), stood
46 m tall on the open ground just west of HOLARIS Watch, about 10 m from it, the two fronts facing the same way
(`src/sim/zones/atani-powerbike.js` says where everything is; `src/client/render-powerbike.js` draws it).

- **Its name.** What the model said of another company (a name across the podium, a badge high on the central tower)
  is covered by the showroom's own: a band across the podium (the canonical rising sun, POSTCIVILWAR, and POWERBIKE
  in gold, leaning forward with speed lines), a panel with the logo where the badge was, and the name standing on
  top of the central tower on posts, facing the town both ways, as HOLARIS's stands on its roof. The file is not
  changed.
- **One way in.** The pink columns that stood for each motorcycle are gone; one stands before the showroom's doors.
  Stepping into it darkens the screen, the simulation sets the player down just inside the doors
  (`showroom.in`), and the screen comes back on the hall. The mat by the doors takes them out the same way
  (`showroom.out`), beside the column. HOLARIS's own column, attendant and sale are as they were.
- **The hall,** under the podium: a polished tiled floor, white walls, a glass front with the doors, lit panels in
  the ceiling, the name on the back wall, framed pictures of the bikes, the salesman's desk, a lounge and plants.
  The fifteen motorcycles stand in three rows on round white stands with a light round each foot and a plate with
  the name, engine, top speed and price, with at least 1.6 m between stands; the Chrome V-Concept turns on a
  turntable in the middle. Inside, the building round the hall is not drawn, the camera stays inside the walls and
  under the ceiling, and the light is the hall's own (white, all round and from overhead, by day and by night).
- **The motorcycles,** drawn cheaply enough for a phone: the nearest two (phone) or three (computer) within 6.5 m
  are the owner's models themselves, the nearest at full detail on a computer; every other one is a picture of the
  same model taken from the side it is seen from (24 sides, `tools/vehicles/bike_impostors.mjs`, lit as the hall is
  lit), at its own size, where it stands.
- **The salesman, Obi,** one of the game's own figures in a white shirt and a dark red tie (`src/sim/salesman.js`).
  Nobody in: he waits at his desk. One or two customers: he keeps with one of them, a step to their side, and comes
  round to them when they stop at a motorcycle. Three or more: he walks the floor, stopping with whoever is near.
  Whoever asks about a motorcycle first has him until they finish. Every device works him out from what all of them
  share (who is in the hall and where, who is asking about which bike and since when, the clock), so every player in
  the showroom sees him do the same, to within the moment it takes word of a player to arrive. Nobody walks through
  him.
- **Asking about a motorcycle.** At a stand the player is offered **Ask**. The phone's conversation opens on that
  motorcycle: its card (picture, engine, top speed, price), Obi's greeting, questions to tap (engine, top speed,
  arrival money, test ride, delivery, discount) and a place to type; **Buy** pays the showroom's price. He answers
  by rule from what the showroom knows of the bike (`api/_lib/market.js`, `salesmanReply`), says the first time that
  he is one of the game's people and his answers are automatic, and never bargains. Meanwhile, in the hall, the
  player turns to him and the two talk face to face (`src/client/talk-gestures.js`): whoever has just said something
  speaks with the hands (beats of the right hand, the left following, open palms turning), the head and the chest
  turned to the other; the other listens, hands together, nodding now and then. Turns follow the conversation as it
  is written. Other players asking him are seen doing the same, by turns.
- **The conversation on the phone,** for every deal: a glassy header with who it is with, the thing on a card,
  bubbles that rise into place as they arrive (not each time the screen is drawn), a shop's answer shown being
  written while it comes, a pill to type in at 16 px, and every button a finger's size. It stays at its newest
  words when the phone draws its whole screen again (as it does after a sale, when the balance changes), and Buy
  reads dark on white: the phone's small-print style had been reaching the deal's small buttons (on HOLARIS too).
- **With no connection** (the installed web app), the tower and the hall's motorcycles come from the copies the web
  app kept; if it kept none, they are not asked for until there is a connection (`fetchKept` in `src/client/glb.js`),
  and the plain shape stands in the tower's place meanwhile.
- **The market.** The fifteen listings are the same ones at the same prices; migration 10 renames the shop
  PostCivilWar PowerBike and puts each listing at its stand. The map shows one pin for the showroom, at its column.

### Eighteen more characters

Ten women (W4–W13) and eight men (M6–M13), the owner's supplied rigged and animated GLBs, used byte for byte and
added to the women's and the men's lists of the choice; one upload was a copy of another and is not used. See
`assets/characters/figures/README.md`. The dots under the character on the choosing screen now wrap onto a second
line: twenty-four in one line were wider than a phone, and on a tablet pushed the panel beside them narrow.

## Six more characters, and two more motorcycles (17 October 2026)

### Six characters

Two women (W14, W15) and four men (M14–M17), the owner's rigged and animated GLBs, byte for byte, in the women's and
the men's lists; the server knows them (migration 11). A seventh supplied figure, of a well-known film and comic
character, is left out at the owner's word. See `assets/characters/figures/README.md`.

### Two more motorcycles at PostCivilWar PowerBike

- **The Midnight Cruiser** (the owner's `blackmotorcycle3dmodel_1.glb`, 132,054 triangles) and **the PostCivilWar
  Tourer** (`civilwarmotorcycle3dmodel.glb`, 10,766 triangles, white in the PostCivilWar colours), each as supplied,
  split into body, fork and wheels by `tools/vehicles/bikes.py` like the fifteen. Two other motorcycles in the same
  batch were byte for byte the Black Bobber and the Dark Power Cruiser already on sale, and are not added twice.
- They take the two sizes of the owner's list that were left: 750 cc (114 km/h) and 700 cc (111 km/h), 1,500 TR each.
  The Midnight Cruiser is drawn 2.3 m long, as the Black Bobber is: the two are the same bike's model, near enough
  (the same pictures), and at 2.35 m a rider's hands fell a centimetre short of its grips.
- **The hall** goes 5.4 m further in under the podium (its back wall at z 27.6, was 33.0) for a fourth row with the
  two of them either side of the middle line, the same room round every stand; seven framed pictures now hang along
  the west wall. Obi walks round them too. Migration 12 puts them on sale at their stands.
- **The tourer has one picture**, its colour: `bikes.py` and `bike-model.js` now take a bike with no normal or
  metal/roughness picture; its coarse tyres are found as rings (`ring_fit`).
- **Found on the way:** a bike's exhaust flames were made a whole bike long before first lit, and though unseen they
  counted in the bike's size: the market's 3D viewer framed every motorcycle small and to one side. They are made at
  their unlit size, and the viewer measures only what is drawn.

## The Post Civil War Car Showroom, and cars to drive (17 October 2026)

### The compound

The owner's four buildings and the villa, each exactly as supplied (`assets/buildings/carshow/`, served beside the
page as `carshow-*.glb`), stand in a large open compound, 285 by 142 m, beside the Kwale road just out of Asaba,
between the edge of town and the airport (`src/sim/zones/asaba-carshow.js` says where everything is;
`src/client/render-carshow.js` draws it).

- **The buildings.** The tall glass tower on its podium, the largest of them, is the showroom; the stacked tower and
  the twisting tower stand behind it, the tower on its raised deck and the villa in its gardens before them, each well
  clear of the others. What was written on them (another company's name and badge on the glass tower's podium, and
  another's name twice on the stacked tower) is painted over in the page with the building's own surface from beside
  it; the files are not changed. Until a model has arrived a plain shape of its outline stands in its place. Their
  walls are solid. The villa (76 MB) is fetched only by someone within 320 m of it, and drawn from its model only
  within 200 m (120 m on a phone), its shadow within 90 m: it is two million triangles, and drawn whole from the
  airport it cost ten times what the rest of that view does. Further off its plain shape stands in for it. Their pictures are drawn at up to
  4096 pixels on a computer and 2048 on a phone, and never larger than they are in the file: at their full 8192 the
  five together filled a browser's memory.
- **Its name,** POST CIVIL WAR CAR SHOWROOM beside the canonical rising sun, stands on the podium over the doors and
  at the top of the tower, facing both ways.
- **The railings.** White iron railings all round: a post every few metres and a bar every 13 cm with a spear at its
  top, so that everything inside is seen through them. Nobody walks through them; the gate is the one way in.
- **The gate,** in the middle of the front, on the road: two leaves of clear glass in brushed steel that slide apart
  slowly (3.2 s) along the inside of the railings for whoever comes to it (within 13 m on foot, 30 m driving), wait
  2.5 s after the last of them has gone, and close (3.8 s), as a bank's doors do. The simulation keeps it
  (`stepCarshowGate`), so every player sees it the same, and its leaves are in the way while it is shut.
- **CCTV:** a camera on a pole at each corner, turning at a motor's pace to watch whoever is nearest within 60 m and
  sweeping slowly when nobody is, its red lamp blinking every 2.6 s or so.
- **The ground:** interlocking paving blocks (I-shaped, each row half a block along from the last, the joints sunk),
  the drive to the doors in a darker block, the visitors' bays marked out in white, kerbs; palms in round planters
  along the front, three flag poles beside the drive (Nigeria's the tallest), lamps along it.

### The showroom

- **In by its glass doors:** walked up to on foot they slide open, and stepping through darkens the screen while the
  simulation sets the player down inside (`carshow.in`); the mat inside them takes them out the same way
  (`carshow.out`). The hall's walls and its glass front are solid: nobody walks in or out but by the doors.
- **The hall,** in the tower's podium, 83 by 37 m: a polished floor, white walls, the glass front, lines of light in
  the ceiling, the name on the back wall, the two desks against the end walls, a lounge by the glass, plants. The
  twenty cars stand in three rows of seven on round white stands with a light round each, at least 2.4 m clear
  between any two, each with a plate on a post giving its name, top speed and price; the Gold Hypercar turns on a
  turntable in the middle. Inside, the buildings round the hall are not drawn (the compound is, through the glass),
  and the camera stays inside the walls and under the ceiling.
- **The cars on show** are drawn cheaply enough for a phone: the nearest two (phone) or three (computer) within 12 m
  are the owner's models themselves, the nearest at full detail on a computer; every other one is a picture of the
  same model from the side it is seen from (24 sides, `tools/vehicles/car_impostors.mjs`), at its own size.
- **Tochi and Oluchi,** two of the game's own figures (a white shirt and a navy tie; a white blouse and a navy skirt),
  each look after one side of the floor: Tochi the cars on the left as you come in, Oluchi those on the right. Each
  is worked out as Obi at PowerBike is (`src/sim/salesman.js`, the `carshow` floor), with the customers on their own
  side and anyone asking about one of their cars: at the desk when nobody is on their side, beside one or two, walking
  their side when it is busy. Nobody walks through them.
- **Asking about a car:** at a stand the player is offered **Ask**, and the market's conversation opens on the phone
  with whoever sells it: the car's card (picture, top speed, price), the greeting, questions to tap (what it is like,
  top speed, arrival money, test drive, delivery, discount) and **Buy**. The answers are by rule from what the
  showroom knows (`api/_lib/market.js`, `carSalesmanReply`); nothing is said of any car's engine; the price is
  fixed. In the hall the two of them talk face to face, as at PowerBike.

### Twenty cars

- **The owner's twenty models,** each as supplied (`assets/vehicles/cars/`), split by `tools/vehicles/cars.py` into
  the body and its four wheels, every triangle kept, the wheels found where the tyres meet the ground. Each is drawn
  at its real length (4.4 to 5.8 m) by one uniform scale, with its own pictures (4096 on a computer, 2048 on a
  phone) under a clear coat that takes the sky's reflection, fading after dark: paint and glass as they are.
- **Prices** from 2,000 TR (the Grey Saloon) to 18,000 TR (the Gold Hypercar, the fastest car in town at 350 km/h).
  A car is paid for with TR that was earned: arrival money does not buy one (it does buy a motorcycle). One of each
  car to an account. Migration 13 puts the twenty on sale at their stands.

### Driving

- **From Property, Drive it:** the car is brought to where the player stands, outdoors, wherever there is room for
  the whole of it (the way they face, or the nearest way round that fits); beside where they left it, they get in
  there. **Get out** puts them out on the driver's side, the left (Nigeria drives on the right), and the car stands
  where it was left, in everybody's way, until they come back to it (**Drive your …**).
- **The controls** are a motorcycle's: accelerate, brake (held when stopped, it backs up), steer left and right, the
  horn, and the door. The car turns about its back wheels as a car does, no harder than its tyres grip (fast, the
  same turn of the wheel turns it less), each class with its own acceleration, brakes and grip
  (`src/sim/power-cars.js`). The whole of it is checked against what is solid at every step, on the page and again by
  the simulation (`carFits`: a row of circles as wide as the car, so close that its sides are short by no more than
  5 cm, and a smaller circle in each corner). Into something at speed it stops dead and the driver is hurt in
  proportion to the speed, at most 8 in 100, and stays in it. A car in motion strikes whoever is in its way, as any
  vehicle does.
- **What is seen and heard:** the front wheels turn with the steering and all four roll; the body dips on its
  springs under the brake, lifts a little under the throttle and leans out of a turn; headlamps and tail lamps at
  night, with the road ahead lit; brake lamps; white reversing lamps. No recording of a car's engine was supplied:
  each car's is made in the page (`src/client/car-audio.js`), the beat of its kind of engine through six gears, and
  its horn by its kind of car. Its speedometer reads to its own top speed, with no engine size on it.
- **Other players' cars** are seen where they are being driven (their own model, lamps and all) and heard, their
  horns too, and their cars standing near them are seen.

### Found on the way

- The market's list of what is for sale held 60 listings, the shops' first: with the showrooms' 38 it now holds 120.
- At the gateway the line of the railings itself was neither the compound's ground nor the road's: a pickup could
  not cross it there. The drive's ground is laid a little into the compound.
- One of the twenty, the black convertible, was modelled facing the other way from the rest: it is turned when it
  is split into its parts (`cars.py`), and its pictures were checked from the front of every car.
- Held on at a standstill, the brake took a car straight into reverse, so that braking to a stop rolled it back at
  once: it now stands for a third of a second first, and its brake lamps are lit only while it is slowing, not while
  it backs up.
- In the rain every vehicle's top speed is lower (the weather is the game's own, by its clock): the motorcycles'
  browser test now rides them on a dry day, so that each is seen reaching its red line.
- The compound was drawn wherever anyone was: from PostCivilWar PowerBike's doors, 250 m from its railings, it was a
  third of what was drawn (235,000 triangles), and from inside the hall, where nothing beyond 60 m is drawn, its
  towers were fetched and drawn behind the hall's walls. Now the compound is drawn within the town's reach of its
  railings, its towers from further off but never beyond the haze, and nothing of it from inside PowerBike's hall;
  each run of its railings has its own bars, drawn only by someone within 90 m of it (a bar is 2 cm across, and
  there are 6,474 of them), and not drawn where that run is out of view.

## The owner's vehicles and buildings, each to its place (17 October 2026)

The owner's assets of 17 October, each the supplied file exactly as it is (`assets/vehicles/town/`,
`assets/buildings/town/`, served beside the page), each drawn at one uniform scale and turned to face its way. None of
them was modelled facing the way the game faces things, and several were modelled turned a little off square:
`tools/buildings/measure.py` measured each one as it stands, and the game turns and scales it by those measures; the
files are not changed. Their pictures are 8192 pixels square: the graphics card is handed them at 2048 on a computer
and 1024 on a phone, never larger than they are, and they are read one at a time: each can take a quarter of a
gigabyte while it is read. Once the graphics card has a picture, the page lets its own copy go, and the file's
bytes too (the car showroom's buildings and the PowerBike tower as well; a car's or a motorcycle's pictures are
kept, since the market's viewer may draw them too).

### Vehicles (`src/sim/zones/supplied-vehicles.js`, `src/client/render-supplied.js`)

- **The ambulance** of the Asaba General Hospital, in white with the red check and PostCivilWar on its sides, 5.7 m
  long: it is the van the simulation has always driven out to whoever calls it (`care.js`), now drawn as the owner's
  model once it has been fetched (the old van until then). On a call the two lamps at the front of its roof flash red
  and blue in turn. Its footprint in the simulation is its size.
- **The private jet,** in the PostCivilWar livery, 20 m long, on the middle stand at Asaba Airport, nose to the
  terminal, its nose wheel at the stop bar: seen through the terminal's glass. Its fuselage, its wings and its engines
  are solid; one can walk under its tailplane.
- **The red box truck,** the store's delivery truck, parked beside Nwosu Building Materials, its cab toward the
  store and its lettered side toward the market (the lettering on its other side is mirrored in the model).
- **The heavy truck,** the block yard's lorry, inside Udeh Block Industry's gate beside the way in, facing the road.
- The parked ones are fetched as someone comes within sight of them (the jet from 700 m, the trucks from 320 m) and let
  go again when they are far beyond; until then a plain block of their size stands where they are, since they are
  solid there all along.

### Buildings (`src/sim/zones/town-buildings.js`, `src/client/render-town-buildings.js`)

- **Their houses** (the ten of 03:09 less the two that are towers: a curved house, a curved glass house, a white house,
  two villas, a spiral house, a pod house and a white block) take the place of every one of the town's plain houses,
  a hundred and two of them less those the towers stand on: each on the plot of the house it replaced, up to 12 m by
  12 m, facing the lane the old one faced, its front where the old one's front was (so the lanes, the doors and what
  stands along the lanes are as they were) and reaching back into its yard. Along each row no two neighbours are
  alike. The same people live in them as before.
- **Their towers** stand on the city side. At the inner ends of Umuezei and Umuonaje, the two quarters either side of
  the city block, eight stand on the plots of the houses nearest the city (whose people now live in them, their doors
  at the towers'): the purple tower and its twin, 54 m, one either side of the city; the black tower, the stacked
  tower, the pink tower, the curved tower, the office tower and the copper tower, 34 to 48 m. On open ground beside
  the city: the group of five towers (65 m) north of Registry Road east of Market Road, the hotel (45 m) west of it,
  and the glass offices by the police post. Each is as tall as its site lets it stand whole: the town's own towers are
  40 to 52 m.
- **The hotel's facade** carried another company's name, in three places in its picture: it is painted over in the
  page with the facade's own bronze from beside it, as the car showroom's buildings were; the file is not changed.
- **What it costs to draw:** each model is about ten thousand triangles, the plain houses a few dozen. The houses of
  one model are drawn together in one go, and only those within 170 m (110 m on a phone) from their models; further
  off, each is a plain block of its size and colour, all of them in one go. The towers are always drawn from their
  models, and from further off than the rest of the town, but never beyond the haze (the fog's far edge, where
  whatever is drawn is drawn unseen), and from inside a hall no further off than the rest.
  Measured from the same places before and after, with every one of the owner's models in (in a browser without a
  graphics card, so the counts and not the times): in the lane with the most of their houses in sight (Umuaji, by
  house 67) a frame is 609,000 triangles in 196 goes, against 301,000 in 187 with the plain houses; elsewhere in town
  6 to 28 per cent more triangles than before (beside a mango in the middle of town 744,000 in 328 goes, against
  675,000 in 271; in the street before the registry 516,000 in 246, against 485,000 in 234).
- **The trees** were scattered once by chance over the ground the houses' plots and paths left clear: scattered again
  with the new plots, every tree in town would have moved. They are kept where they stood (`atani-trees.js`), less the
  few where a new building now stands.

### Found on the way

- three.js's box round a turned mesh is the box round its turned box, larger than the mesh: the tests measure a
  building from every point of its model where it is drawn.
- The airport's test said there was no aircraft anywhere: the one aircraft now is the owner's jet on its stand.

## Real leaves, glass that gives back the sky, and rain on the roads (17 October 2026)

The owner asked for the town to look real: glass that reflects, finishes as they are, natural trees, real materials.

### The trees (`src/client/render-foliage.js`)

- **Leaves cut out of pictures of leaves.** Every tree in town, on the city block's lawn, along the road to Onitsha
  and in the car showroom's planters keeps its trunk and branches, and its leaves are now drawn from pictures of
  leaves, painted in the page (nothing is fetched), with the air between them: a mango's crown is a hundred and
  twenty-six sprays of its long dark leaves round a dome, over a trunk that forks into three limbs, each forking
  again; an almond's broad leaves lie in flat tiers on its level branches; a palm's fronds are each a ribbon of
  leaflets either side of its rib, a coconut palm's arching and a lighter green, an oil palm's stiffer and deeper.
  The city block's shrubs are small bushes of the same leaves.
- **Lit as crowns.** Each spray is lit as if it were part of the round crown it belongs to, not as the flat card it
  is, from whichever side it is seen: a crown is light on top and toward the sun, darker underneath and inside. A
  frond is lit on whichever side is seen, its top toward the sky. Leaves are matte.
- **Their shadows** are the shapes of their leaves, with the light coming through between them.
- **The wind** moves them a little, the tips of a frond more than its base and the top of a crown more than the rest,
  now and then in a gust, each tree a moment apart from the next; their shadows move with them.
- What it costs: the town's trees are 81,000 triangles of leaves, against 117,000 for the solid crowns; with the four
  pictures on two sheets, a square of ground draws its leaves in two goes (sprays, fronds) where it drew them in one.

### Glass, the river, metal, plaster (`src/client/render-finish.js`)

- **Window glass** in the town's buildings, the city block's glass and steel, the glass on the road to Onitsha,
  HOLARIS's steel, the PowerBike tower and the owner's buildings and vehicles give back the sky by day: more at a
  glancing angle than face on, less under cloud, hardly at all at night (when the windows are lit from within, as
  before). The owner's buildings and vehicles gave back a noon sky all night.
- **The river** gives back the sky, broken up by its ripples.
- **The zinc roofs** have the dull sheen of zinc.
- **The walls** are painted plaster, with the plaster's slight unevenness under the paint.

### Rain on the roads

- In any rain the ground is soon wet through (the harder it rains, the sooner): roads, paving, walls and roofs
  darker, and the roads and the roofs glossy, the roads giving back the sky as a wet road does. Once the rain stops
  they dry slowly.
- On a phone surfaces are lit without gloss, as before: there the wet ground is darker, and nothing gives back the
  sky.

## Vehicles that turn and steer, the phone at the bars and the wheel, everyone's vehicles, and staying up (18 October 2026)

The owner's brief of 18 October 2026 (multiplayer vehicles, performance and realistic driving), worked in its order.

### Prices, and what pays for them

- **Cars 600 to 6,000 TR**, by how much car each is: Grey Saloon 600; Classic Two-Tone 750; Black Pickup 950; Yellow
  Classic Roadster 1,100; Blue Off-Roader 1,300; Black Square SUV 1,450; Camo Expedition SUV and Mint Sports Coupé 1,600;
  White Roadster 1,800; Peach Luxury SUV 1,950; Black Luxury SUV 2,100; White Square SUV 2,300; Grey Grand Tourer 2,450;
  Black Grand Convertible 2,650; Pearl Convertible 2,800; Midnight Saloon 3,300; State Limousine and Bronze Spyder
  4,000; Red Winged Supercar 4,650; Gold Hypercar 6,000 (`src/sim/power-cars.js`).
- **Motorcycles 300 to 3,000 TR**, five tiers of 300, 450, 750, 1,200 and 1,800, and the Chrome V-Concept at 3,000
  (`src/sim/power-bikes.js`).
- **The arrival money buys either**, as any TR does: a new player can drive away a car or ride off on a motorcycle with
  the 2,000 TR they arrive with (from the showroom only; bought from another player, earned TR pays). The server keeps
  the prices (migration 14 sets every listing's price; at a showroom an offer for less is declined and a sale is always
  at the listing's own price, whatever the page sends), checks the balance, takes the starter TR first, records the sale once (the offer's own number), and keeps one of each car and
  each motorcycle to an account (`api/_lib/market.js`, `api/_lib/wallet.js`, `api/_lib/schema.js`). Nothing else about
  starter TR changed: it still pays the town's charges and costs, and for nothing else.

### Wheels that turn and steer (`tools/vehicles/wheelfit.py`)

The models are each one piece, wheels and body fused: a wheel can only be told apart by where it is. The first sort
took every wheel to be a drum square to the vehicle, of one width. Measured, that was wrong: six cars' front wheels
are turned in their files (9 to 18 degrees, as a car is photographed), and turned about the car's axis instead of
their own they wobbled, part of the tyre standing still; wide tyres were wider than the drum; on the motorcycles bars
of the fork, a pannier's foot and pieces of mudguard lay in a wheel's drum and went round with it. Now each wheel's
axle is read from its own tyre and rim, its round fitted to its tread, its width from its sidewalls, and only what
lies wholly inside goes round with it; a wheel turned in the file is first put straight, then turned as the vehicle
rolls (by the distance it has really travelled, signed, so backing up turns it backwards; nothing turns it when it
stands) and steered by the game. A motorcycle's front end (fork, mudguard, bars, its headlamp where the lamp is on the
fork) turns about the fork's own lean, measured from each model by eye where the fit was unreliable.

### The showrooms: every vehicle clear wherever it is seen from (`src/client/hall-models.js`, `budget.js` HALL)

Every car and motorcycle on the floor is its model, never a blurred placeholder while it is looked at: the one the
player stands at with its 4096 pictures (on a phone 1024), the next few nearest 2048, those across the hall 1024, the
far end 512; on a phone the far end is the picture of it from all round. The sets nearest the doors are made ready as
the player comes up to them, one model handed to the graphics card a frame; a downgrade waits until the player has
moved on, so nothing flickers; all of it is let go once the player is well away. Each vehicle's pictures and the
market's view of it are framed by the exact bounds of what is drawn (`src/client/bounds.js`). Only the vehicles near
the player (within 7 m of a motorcycle's stand, 12 m of a car's) cast the sun's shadow; the rest have the soft shadow
under them that their pictures always had. The sun's shadow is drawn from the whole hall at once, every vehicle in it
whole wherever the player looks, so every model casting it was most of what a frame in a hall cost.

**Vehicles drawn black.** Walking about a hall, many of its motorcycles were drawn solid black. A vehicle's set of
pictures was counted as wanted only once it had come; while it was still on its way, another vehicle being put away
let go of every set nobody was counted as drawing, this one included, and it then came with its pictures already
given up (the page lets its own copy of a picture go once the graphics card has it, so one handed over again is
empty). Now a set is counted as wanted from the moment it is asked for (`bike-model.js`, `car-model.js`). The browser
tests now watch every picture handed to the graphics card for one the page had already let go (`test/start.mjs`,
`watchPictures`), so a vehicle or building drawn black fails them.

### The driver at the wheel (`tools/vehicles/driver_seats.py`, `src/client/car-view.js`)

Most of the owner's cars are a closed shell, their windows painted on and nothing inside: no one in them can be seen,
and no one is drawn there. Ten can be looked into (the five with their tops down, the classic saloon with empty window
openings, the hypercar with its doors up, the winged supercar, and the two big four-by-fours with open windows): found
by looking out from where the driver's head is, through no surface of the model. In those the seat and the steering
wheel are the model's own, read from cross-sections of each cabin. The driver sits on the seat, leaning back as far
as the roof allows and no further than the arms reach the wheel (sitting further forward if they still cannot), with
both hands on the rim at ten to two, turning with the wheel as the car is steered, the feet on the pedals, the head
turned a little into the turn; they pitch and roll with the car's body on its springs.

### The phone on a motorcycle and at the wheel (`src/client/phone-hold.js`, `main.js`)

Taking the phone out on a motorcycle (or a keke's handlebars), the left hand comes off its grip and holds the handset
up to be read; the right keeps the throttle. At the wheel of a car the right hand takes it; the left keeps the wheel.
The head bends to the screen and the chest turns a little toward it. Put away, the hand goes back to its grip or the
rim. The vehicle is still driven with the phone in the hand: until now any phone on the screen let go of the
throttle, the brake and the steering (only a page over the whole screen does that now, as on foot). Getting on or
off, a fall, a crash or a fight puts the phone away at once.

### Other players' vehicles (`src/net/link.js`, `src/sim/talk.js`, `src/net/online.js`, `vehicle-standins.js`)

- Another player's motorcycle is seen with its bars turned as theirs are (the steering travels with the ride, checked
  when heard, held to the lock), and their phone in their hand as they hold it: on foot, at the bars (left), at the
  wheel (right), on a call. A player in their car is seen at its wheel where the car can be looked into.
- **Their cars were not carried on between words.** The website hands each player the others' positions a few times a
  second; a keke or a motorcycle was carried on between those words the way it was going (and round a bend), but a
  car, added later, was not: it was moved in steps from where it had last been heard to where it was. Over a simulated
  mobile connection (delay, jitter, lost answers) a car is now shown within a metre or so of where it is on a good
  connection and a few metres on a poor one, never jumping, and facing the way it goes round a bend
  (`test/vehicle-sync.test.mjs`).
- **No one rides nothing.** The nearest few other players' vehicles are drawn as their models; a vehicle beyond them,
  or one whose model is still on its way, was not drawn at all, and its rider sat in the air. Now its picture from all
  round stands in for it (the showrooms' pictures, the side it is seen from, at its size), with its rider on it.

### Staying up: what made the game crash, lag and freeze, and what was done

Measured (one lap of the same thirteen stops: the motor park, the market, a lane of the owner's houses, the city
block, the river, both showrooms' halls and the compound, the airport, two far views, a ride and a drive; every
texture, buffer and render buffer the page handed the graphics card counted, in a browser without a graphics card;
the live version against this one):

| | the motor park | the PowerBike hall | the car showroom hall | the airport, after both | at the end | the most at once |
|---|---|---|---|---|---|---|
| a phone, before | 214 MB | 295 MB | 321 MB | 321 MB | 489 MB | 629 MB |
| a phone, now | 145 MB | 213 MB | 190 MB | 169 MB | 244 MB | 367 MB |
| a computer, before | 816 MB | 986 MB | 1,465 MB | 1,422 MB | 1,680 MB | 1,832 MB |
| a computer, now | 414 MB | 737 MB | 694 MB | 363 MB | 728 MB | 930 MB |

(pictures only; the computer's "before" is the first measurement of the day, of the same version, without the two far
views). Before, nothing ever came back down; now what a hall or the compound took is let go after leaving it. The
halls draw more triangles than before, every vehicle in them being its model where it used to be a picture (on a
computer, the PowerBike hall 866,000 against 560,000; the car hall 900,000 against 279,000; on a phone the far end of
each hall stays pictures). How fast a frame is drawn cannot be measured here (a browser without a graphics card takes
a second or more a frame): that needs real phones and computers.

- **One error stopped the game.** The next frame was asked for at the end of each frame, so any error thrown while
  drawing one, however rare, stopped the game where it stood with its last picture on the screen: a freeze. Now the
  next frame is asked for first, and an error in one frame is written to the console and counted, and the game goes
  on (the browser tests fail on any such error, so none is hidden from them).
- **The graphics taken away.** A phone short of memory may take a page's drawing away (its WebGL context is lost);
  the game simply stopped there. Now it is saved at once, the town's sounds stop, nothing more is drawn, and the
  player is told what happened and offered to reload the page to carry on (put off with "Not now", the question comes
  back when they tap the picture or return to the page). The game never reloads itself.
- **Pictures far larger than anything showed.** One picture, PowerBike's tower, was 8192 pixels square (341 MB once
  mipmapped); the car showroom's buildings, every figure and every car were 4096 (85 MB each). Every picture handed
  to the graphics card is now sized for how close the thing is ever seen (`budget.js`): 2048 on a computer and 1024 on
  a phone for buildings, towers, figures and the owner's vehicles; vehicles on the road 2048 and 1024; the largest only
  for a vehicle the player stands at in a showroom. The supplied files stay whole.
- **Nothing let go.** A house model fetched for a lane the player had left far behind, the car showroom's buildings
  after leaving the compound, and the showrooms' vehicles after leaving the hall were all kept for good; now each is
  let go well beyond where it is drawn, and fetched again from the browser's copy if the player comes back.
- **A building not yet drawn looked like a shadow.** Until a building's model has come (and from afar, for the
  towers) its plain shape stands in; those shapes were near black (a tower block 0x2f3946, the car showroom's glass
  0x2b3442, PowerBike's 0x1f2632), so from across town a tower looked like its own shadow. They are now glass with
  panes and the sky in it, the colour of the buildings they stand for.

## Falls, roadblocks, getting up, and the camera on the street (19 October 2026)

The owner's two briefs of 19 October 2026, with his videos. In the first a rider on the White Sport Tourer, at 28 km/h
on the grass between Waterside Road and the purple tower, is thrown off with nothing in front of him, and gets up "like
a robot". The second asks for the close follow camera of GTA Vice City on a phone.

### Why the rider came off

Three things, all found and measured before anything was changed:

- **An invisible wall.** Each of the owner's buildings was made solid as one box round its whole model. The purple
  tower's roof reaches far out over the ground, so its box stood out on the grass, 2 to 17 metres in front of the
  wall that is seen: the rider in the video ran into it.
- **Any stop threw the rider.** Any step the bike could not take at more than about 20 km/h threw the rider off,
  whatever stopped it and however it was met: a wall met head on, a wall brushed along its length, the invisible end
  of the map and the river's bank all alike.
- **The town took the page's word for the speed.**

### What it is now

- **Solid where it stands.** Every one of the owner's buildings is solid where it really stands on the ground, measured
  from its own model between 15 cm and 2.3 m up, on a half-metre grid (`tools/buildings/footprints.mjs` writes
  `src/sim/zones/town-footprints.js`: 95 buildings, 1,215 boxes). The purple tower's foot is about half of its old box;
  its overhanging roof is open ground under it, as it looks.
- **What comes of meeting something** depends on what it is and how hard the vehicle goes into it: the part of its
  speed that goes INTO it (head on, all of it; along a wall, almost none) (`src/sim/contact.js`). A glancing touch
  scrapes along it, a little slower; harder, it stops dead against it with a jolt and a small step back, the rider
  still on (up to 23 km/h into a wall or a vehicle, 30 km/h into a roadblock, which gives a little); harder still, a
  crash. The edge of the land (the end of the map, the river's bank, the bush beyond the roads) is never something a
  rider is thrown by: the bike slides along it or stops at it.
- **The town judges a crash for itself** (`own-bikes.js`, `own-cars.js`): something must be in the bike's way within a
  step or two of where the town last saw it, the speed is no more than the town saw it going, and only a hard enough
  blow into it throws the rider. A page that says it crashed where nothing is in the way is not believed. A crash
  throws once: the rider is off the bike, and a second word of it finds nobody riding.
- **Where a thrown rider comes down** (`throwLanding`, `contact.js`): on along the way the bike was going, as far as
  the blow carries (0.8 m, and 0.3 m more for every m/s the bike went into what it hit, up to 6 m), with room on the
  ground for the whole body lying there; over a low roadblock or fence when there is ground with room beyond it, as a
  rider over the bars is; never through a wall or anything solid, never off the land. Where the way on is shut (a wall
  head on, the fence at the end of the land), the body comes down beside the bike, alongside it, on its right (the
  bike goes down on its left).
- **The motorcycle** stops where it hit and goes down on its left side, quicker as it goes, coming back a little off
  what it hit, and settles with a small bounce (`own-bike-view.js`). It stays there until it is ridden again. Getting
  back on is the player's to do: walk to it and Ride.

### Roadblocks and the edge of the land

`src/sim/zones/closures.js` says what is not open, and why; the town (what is in the way), the drawing, the radar and
the town map all read it.

- Every part of the land is in one of four states (`AREA_STATE`): open, closed for a while, under construction, or
  restricted. **To open a road when the land beyond it is built, set its state to `open`** (its roadblock and what
  makes it solid go with it); to close one, add it.
- **Five roadblocks**: Waterside Road's south and north ends, Registry Road's and Campus Road's north ends, College
  Road's west end. Each stands across the whole road and both verges, a little before the road ends: striped
  barricades on trestles with amber lamps that blink at night, a painted oil drum at each end, cones before it, and a
  ROAD CLOSED board saying why ("Road works ahead", "Road not yet built"). The stripes glow at night as reflective
  stripes do.
- **A fence along the edge of the built land** (timber posts, striped rails, a board now and then), wherever the land
  really ends just beyond it: round the town, along the road to Kwale and its end, round the airport's land, the far
  bank either side of the bridge. Nobody rides on into the end of the world and meets nothing there.
- Each is solid where it is drawn and no wider (a `barrier`: it gives a little more than a wall). None of the town's
  paths (people and vehicles) crosses any of them.
- Shown on the radar and the town map: the fence as a dashed red line, the roadblocks as red and white bars.

### Falling and getting up (`src/client/falls.js`)

Until now a figure knocked off its feet played its file's own fall if it had one (fewer than half have), lay there,
and was then crossfaded from lying to standing in half a second: it rose off the ground like a plank swinging up. None
of the supplied figures has a getting up. Now every animated figure falls and gets up the same way, with motion taken
from the supplied figures' own files (`tools/characters/falls.mjs` writes `src/client/fall-moves.js`, 20 KB: the
woman's fall back, the man in the paper mask's stumble forward and onto his front, the zombie survivor's dive, and five
poses: lying on the front, on the back, the arms straight under the shoulders, one knee down and the other foot
forward, squatting), carried onto each figure's own bones as it is loaded, whatever its bones are called:

1. **The blow.** The figure is caught as it was (walking, standing, on a motorcycle) and taken into the fall within a
   fifth of a second; struck from the side, it is turned with the blow.
2. **The fall,** the way it was pushed: forward (a stumble, down onto a knee, onto the front), back (a stagger with the
   arms out, onto the back). A rider thrown over the handlebars goes through the air under gravity, the body level
   and the arms out ahead, over the roadblock if the town put them beyond it (lifted high enough to pass over its
   boards), and down onto the front.
3. **On the ground:** let down until its lowest part rests on the ground (never through it), and still. It does not
   start to get up until it is lying there.
4. **Getting up,** by how it lies: on its front it brings its hands under its shoulders and pushes up, brings a knee
   forward under itself, rises onto that foot and stands; on its back it bends its knees, sits up on its hands, turns
   onto a knee and stands. Whatever is on the ground stays where it is put while it bears weight (the body moves over
   it; it does not slide), and the figure comes back over its own place as it stands, then settles into standing.

Every stage follows from how long ago the fall began, what kind of fall it was and how the town says the player lies,
so the player's own screen and everyone else's show the same fall (below). Control comes back when the town says the
player is up (`impact.js`, `own-bikes.js`), which is when the getting up ends. While down, the bar at the foot of the
screen says "Thrown off" or "Knocked down", then "Getting up", filling as they get up.

The camera follows the figure through the air and as it lies and gets up, steady at its usual height, with a short
knock as the bike stops (more the harder it hit).

### The camera on the street (`src/client/camera.js`)

The game opens on the street view: close behind the player, the eye a little above the head, looking slightly down,
the figure in the lower middle of the picture and the street ahead above it, the lens a little wider (60°). Measured
against the owner's Vice City recording, walking (the same shape of picture): the top of his head at 0.43 of the
picture's height, his feet at 0.80, the horizon at 0.42; ours 0.46, 0.80 and 0.41 (3.9 m behind, the eye 1.8 m up).

- It swings round behind as the player walks or runs, a little slower than they turn (a quicker follow at a run); as it
  comes round, the eye swings out a little to the outside of the turn (at most a fifth of a metre, no roll) and settles
  back. It does not swing round when the player walks toward it, nor for a second after the player has turned it by
  hand.
- At a run it comes in a fifth closer and a little lower.
- Every easing is by the time that has passed (an exponential), so it is the same at 20 frames a second as at 60;
  angles are eased the short way round.
- Dragging (a finger or the mouse) still turns it; a pinch or the wheel brings it in or takes it back.
- **The View button (C) on foot as well as in vehicles**: on the street, further back, over the shoulder, from above,
  and round again. In a vehicle the views are as they were.
- In the way of a wall it comes in close behind the player first, at the height of the head (as near as a little over a
  metre from it), and only when the wall is closer still tips down over them, as little as it must (by the purple
  tower, with 2 m and 1.3 m of open ground behind the player it comes in to 2.0 m and 1.3 m, level; with 0.9 m it
  looks down about 30°; with 0.5 m, about 65°). Where the line from the player first meets the wall is found to a few centimetres. It looks
  over a roadblock and the fence. It never goes through a wall or under the ground.
- Each player's camera is their own and follows their own figure.

### Another player's fall

What another player's game says of a fall travels with them (`link.js`): when it began, how long they lie and get up,
which way the blow sent them, where it began, what they were thrown over, where they lie, and the fall's own number;
and their motorcycle down on its side, and how long ago. A fall begun (or ended), or getting on or off a vehicle, is
told at once rather than at the next usual time (`online.js`). Everything of another player is seen a moment late
(the word takes its time to come), and so is a fall: one first heard of within 2.5 seconds of its beginning is shown
from its beginning, so that none of it is missed; every word of it, however late it comes, is known by its number for
the same fall, never begun again; and if their own screen has them up while the getting up is still being shown here,
it is let finish where they lay, and then they walk on to where they are (`talk.js`, `render-crowd.js`). One first
seen long after (coming into view) is shown as it is by then.

### A save whose answer was lost (found while testing two players)

With the network made slow, a save took longer to be answered than the page waited for it (30 seconds). The server
had kept it; the page did not know, and its next save was refused as "played on another device since": the page then
put the game back to that save, minutes old, and said so. Now each save carries its own mark; one sent without an
answer is remembered, and a copy the server has that is one of those is known for this game's own: the game here is
kept, saved again from where it is, and the bank told what that save had already reported (`market.js`,
`createAccountSync`). The page now waits a minute and a half for a save's answer. A copy really played on another
device is still taken, as before.

### Tests

`test/falls.mjs` (the website with its server; a new account buys the White Sport Tourer with its arrival money, as a
player does), 21 checks, each of the owner's tests in turn:

- **G, the camera:** the game starts on the street view (3.9 m back, the eye 1.8 m up, the 60° lens); the View key is
  offered on foot; on foot it goes round further back, over the shoulder, from above and back to the street; at a
  run it comes in to 3.25 m.
- **A, riding a finished road:** along the Asaba–Kwale Road at 10 km/h and at 50 km/h, and down the airport's runway
  flat out (100 km/h): nobody falls.
- **B, road to grass, where the owner's rider came off:** across the verge onto the grass by the purple tower and
  along it, inside where the old box stood, at 28 km/h the whole way: nobody falls.
- **C, the unfinished road:** the roadblocks and the fence are drawn; the bike does not go through the roadblock at
  the south end of Waterside Road.
- **D, slowly into a roadblock:** at 10 km/h it stops there, the rider still on.
- **E, hard into it:** at 50 km/h the rider is thrown, through the air, down, and up again, each once; over the bars
  and over the boards, the lowest of the body above them as it passes (they are 1.25 m high), down on the road
  beyond; on the ground and getting up, never through it (the lowest of the body at most 3.5 cm in); the hips rise
  smoothly without a jump and nothing slides (at most 1.34 m/s up, 0.52 m/s along); the motorcycle on its side
  where it stopped, short of the boards; a little health lost; up and on foot at the end. Watched in slow motion
  (a fifth of the speed), every frame.
- **F, knocked down three ways** (the brief's G): from behind, forward onto the front and up through the hands and a
  knee; from in front, back onto the back and up by sitting up and onto a knee; from the side, turned with the blow
  and down, and up again; never in the ground.

`test/falls-sync.mjs` (the owner's test H: two players on the website, the network made slow), 8 checks: the watcher
sees the rider on the White Sport Tourer; the rider runs into the roadblock at 50 km/h and is thrown over it; the
watcher sees the fall, the lying and the getting up once (no fall begun again by a later word of the same one); the
body on the ground and never in it, where the rider really is; the motorcycle down on its side where it stopped
from the moment it came down; only the rider fell, once.

Headless: `test/closures.test.mjs` (new: every part of the land in one of four states; each roadblock across the
whole of its road and both verges, on the land, solid there and no wider; the fence where the land ends, crossing
none of the town's paths; the road to Kwale left open; the camera looks over a roadblock and not through a
building), and in `own-bikes`, `cars`, `client`, `vehicle-sync` and `server/test/play.test.mjs`: what comes of
meeting each kind of thing at each speed, where a thrown rider lands, the town judging a crash for itself, a fall's
number and where they lie carried by the link, a vehicle held short of a wall between words, a save whose answer was
lost.

**What a frame costs**, against the version live before this one, at the same four places (the motor park; Waterside
Road by the roadblock; the grass by the purple tower; the car showroom's compound), each version from the view it
starts with, on this machine (no graphics card, 640 × 400): the same or less at each (the time between frames
1,777–2,052 ms live, 1,881–1,967 ms now at the motor park; 550–568 against 422 by the roadblock; 387–399 against 369
by the tower; 520–524 against 482 in the compound). Where the roadblocks or the fence are in view they add 10 to 36
draw calls. Real phones' frame rates cannot be measured here.

`test/camera.mjs` (new; the page as a player has it, the shape of the owner's recording), 17 checks, the camera
brief's list: framed as in the recording (head 0.46, feet 0.80, horizon 0.41 against his 0.43, 0.80, 0.42);
walking the same; turning, the sway to the outside of the turn, at most 0.22 m; walking toward it, it does not swing
round; running, closer and lower; running while turning; stopping, settled with no sway; the View button round its
views; dragging, and walking on brings it round behind; a wall behind at four distances (never past its face; with
2 m and 1.3 m of ground it comes in level, 0.9 m about 30° down, 0.5 m about 65°); another player in front; a
phone upright and on its side; no error.

`test/exit.mjs` (new; the website with its server, a phone held upright), 14 checks: Settings opens on the Game
section, Exit game and Restart game in view without scrolling; Exit asks first, and Cancel changes nothing; Save and
Exit saves with the account (its copy one newer), closes the link, stops the town's sounds, and shows "Your game is
saved" with Play, still signed in; on another device (everything this one kept wiped) the player is in the town where
they left it; Play takes them back where they were, the link open again; Restart asks the owner's question, Cancel
changes nothing, and yes begins a new journey with the account's TR kept.

**Run on the released build** (every browser test against this very build of the site, one at a time): 367 headless
and 92 server tests; falls 21/21, two-player falls 8/8, camera 17/17, Exit and Restart 14/14; the play-through's
sessions (opening, desktop, town, phone, action, sideways, upright), touch 39/39, fit (13 sizes, upright and sideways),
motorcycles 108/108, the owner's buildings 10/10, the owner's vehicles 11/11, outskirts 12/12, city 5/5, realism 7/7,
adverts 17/17, bike 34/34, the figures W1 and M1 37/37, hold 36/36, sound, webapp (installs, keeps itself, plays with no connection), picture 8/8, the site (every step: the account, the market, a deal, the Wallet, a second device, the upgrade, logging out and erasing), seats 17/17; and the roadblocks and the fence looked at by night. The motorcycle showroom 35/36: the one check that did not pass watches the player's
hand rise while a question is said (four and a half seconds), and in the showroom's hall, every motorcycle drawn as
its model, this machine draws a frame every five seconds or so: the two frames it drew fell either side of the line
(the same check fell short the same way on the build before this work, 18 October). On the build just before Exit
and Restart were added (the same falls and camera, the same vehicles): vehicle sync 13/13, car showroom 42/42.

Tests changed to match what was asked for: the View button is offered on foot now (the touch test and the phone
play-throughs expect it); a building holds where its measured walls are, not at the box round its whole model (town
buildings); the opening's choice is heard as it is asked for, written down as it starts (with the town being built
behind the question, this machine could hold the page longer than the sound lasts, so that it had started and ended
by the time the test looked); the start screen after Exit, like the rest of the start screen, scrolls on the smallest
phone on its side (fit); knocked down, every figure falls and gets up by the new falls, watched at a quarter of the
speed (figures).

## Characters in a flash, the picture that comes back, a light opening (20 October 2026)

The owner, 20 October, from his iPhone: pressing the arrow on the character screen took a very long time before the
next character appeared, and its animations longer; then the game stopped with "The picture was lost – this device ran
short of memory for the game's graphics" and had to be reloaded; and the opening hung, its name and its PLAY slow to
come. Measured on the live build first (a phone's screen, the browser's "Slow 4G" link of 1.6 Mbit/s with 150 ms
before each answer, the processor slowed four times): the splash painted after 1.2 s and PLAY after 54.7 s (5.1 MB
before it); the character screen 87.6 s after opening; one arrow press 19.1 MB and 125 s before anything of the next
character was seen; two drawing surfaces (WebGL contexts), 115 MB on the graphics card and 142 MB of script memory
after two presses. What each thing was, and what it is now:

### Light copies of the figures (`tools/characters/light.py`, `src/client/glb-read.js`, `figure-worker.js`)

Each supplied figure is 7 to 27 MB (its pictures up to 8192 pixels, three at 4096 or 8192 for most), and every press of
the arrow fetched the whole file, then read it and decoded every picture at full size on the page's own thread before
anything was shown. **The owner's files stay in `assets/` exactly as supplied** (`test/originals.test.mjs` compares
each with the MD5 it had then). What a device fetches is a copy the build makes from each (`node build.mjs` runs
`light.py` for any copy that is missing or made from a file that has since changed; the copies are kept in
`assets/characters/figures/light/`):

- its shape, skeleton and **every** animation in one small file: positions, normals, texture places, joints and
  weights stored as small whole numbers (glTF's KHR_mesh_quantization; the scale folded into the skeleton's own
  matrices, so the figure is drawn exactly where it was), each animation's keys kept where they change the pose by more
  than a hair (0.0008 radian), then gzipped: 0.7 to 1.9 MB;
- its pictures beside it, as WebP: colour at 1024 for a phone and 2048 for a computer, its relief and finish at 1024;
- its borrowed movements and how it sits (`figures/<name>.moves.json`), and a turntable picture (`<name>.turn.webp`:
  16 views from all round, `tools/characters/previews.mjs`).

**To a phone each figure is now 0.8 to 2.4 MB** (all thirty: 50 MB, against 544 MB before), to a computer 1.0 to 3.0
MB. No figure picture larger than 1024 is fetched or decoded on a phone, or 2048 on a computer. Nothing is decimated:
every triangle is kept. Each copy was compared with its original drawn the same way at the same size on the screen
(`previews.mjs compare`): the same figure (W14, W1, M16 and W6 looked at side by side; the pictures within 1 to 2
levels of 255 on average).

### The character screen never waits (`creator.js`, `animated.js`, `figure-worker.js`)

- The arrow is answered in the same frame: the next character's turntable picture is shown at once (or its outline,
  until that picture has come), with a soft shine across it while the figure itself arrives, and the movements' names
  as grey pills until they are known. The arrows always work.
- A press while a figure is still arriving moves on at once and **stops** that download where it is; downloads never
  queue. The figures either side of the one looked at are fetched ahead, quietly, behind everything else, and taken
  over (not fetched again) if the player goes to one of them.
- The file is fetched, unzipped and read, and its pictures decoded, on a worker, off the page's own thread.
- A figure that leaves the screen is let go entirely (shape, pictures, the decoded pictures closed). A phone keeps
  none it is not showing (`KEEP_UNUSED`).

### One drawing surface, and no town built behind the character screen (`shared-view.js`, `main.js`)

- The page has one WebGL context. The turntable is drawn by the town's own renderer, on the town's own canvas, which
  is put inside the turntable's box while the town is not being shown (and back the moment it is). Copying the picture
  onto a canvas of the turntable's own instead made the page wait every frame for the graphics card (53 ms a frame in
  the test browser), so it is not done. The market's viewer still copies (it is looked at still, for a moment).
- The town is built **after** the character is chosen, behind the loading card, in steps (the ground and the roads,
  the buildings, the people, ... the townspeople), each named on the card as it is done, and its shaders compiled
  there. Nothing of the town is built, unpacked or compiled while the character screen is up.

### A light opening (`build.mjs`, `template.html`, `intro.js`, `sw.js`)

- The page is 245 KB (it was 4.15 MB). Its first 36 KB are the splash: its markup, its style, the mark and the
  lettering, so it is painted within half a second. The 3D library and the game's own script (2.3 MB, 0.57 MB as sent)
  come after it, read once the page has been. The game's script no longer carries its data: the character kit and the
  vehicle kit are files of their own as numbers (not base64 text), gzipped (1.1 MB and 0.6 MB), fetched once a
  character is on the screen; the townspeople's reactions with the town; the cover's four pictures as files, the plate
  as WebP (149 KB, it was 267 KB as JPEG).
- The splash is seen for a little over a second (it was five), its one amber line filling as the files really arrive;
  the 1.9 s wait before building the town is gone (the town is built later anyway). The first figure is not fetched
  until the cover is up.
- The service worker asks for each file as the page asks for it (by its fingerprint), so on a first visit the browser's
  cache answers it: nothing is fetched twice (the kits were fetched twice before).
- The shortest ways through the town are worked out without making an object for every step (`src/sim/graph.js`; the
  same ways, every one checked), which was part of what held the page before PLAY.

### The owner's buildings and vehicles: no 8192-pixel picture sent anywhere (`tools/models/lighter.py`)

Each of his twenty-nine houses, towers, showroom buildings and town vehicles is almost all one colour picture of 8192
pixels (10 to 17 MB of a 10 to 18 MB file), which the game never draws larger than 2048 on a computer or 1024 on a
phone: every device fetched it and decoded it whole (a quarter of a gigabyte each) to make it smaller. The build now
sends copies made from his files with each picture made the size it is drawn at and nothing else changed (the same
shapes, byte for byte, checked as each copy is made): under the file's own name for a computer (0.9 to 1.6 MB), and a
`.lite.glb` beside it for a phone (0.5 to 0.8 MB), which a phone fetches instead (`modelFile`, `budget.js`). The watch
keeps its 4096 pictures for a computer (it is looked at close to) and has a 2048 copy for a phone. The car showroom's
villa (58 MB) and the watch (55 MB) are still large: most of each is its shape, not its pictures.

### The picture that comes back (`main.js`, `render-kit.js`, `glb.js`, `vehicle-models.js`, `loading.js`)

A phone's browser short of graphics memory may take a page's drawing surface away. The game no longer asks the player
anything when it does. It saves at once, shows the calm card "One moment / Bringing the picture back", and when the
browser gives the surface back it hands the graphics card everything again (the town's shapes it had let go of, every
picture made again from its file, the sky's reflections, the turntable's and the market viewer's) and carries on where
it was, nothing reloaded. Only if the browser has not given it back within five seconds: "The picture stopped / Your
game is saved where you are. Continue to carry on from there." with one button, Continue, which opens the game afresh
straight into the town where the player was, past the opening. The old dialog ("The picture was lost / Not now /
Reload the page") is gone; so is the technical notice of the picture watch, which now says what it found on the same
calm card, the detail kept for the readout.

To make it less likely to happen at all: figures' pictures at 1024 on a phone, the buildings' pictures fetched at the
size they are drawn, one drawing surface, and **a budget for the graphics card**: everything handed to it is counted
as it goes (`graphics-count.js`), and above 150 MB on a phone (700 MB on a computer) the game lets go of everything it
keeps ready but is not drawing (figures, motorcycles and cars no longer in sight).

### The loading card (`loading.js`, `template.html`)

One card for every wait and every trouble: a dark glass card with the sun mark, the game's lettering, one thin amber
line that fills by real progress (bytes come of bytes there are, or the pieces of the town built), a few plain words
("Entering Asaba", "Fetching the town", "Building the town: the buildings"), and at most one button ("Try again",
"Continue"); never the words for how the browser works. It keeps clear of a phone's notch and home bar, upright and on
its side, and moves nothing for a player who has asked their device for less motion.

### The readout for the owner's phones (`stats.js`)

The address ending in **#stats** (postcivilwar.com/#stats) shows, in a corner of every screen, written afresh each
second: the device's graphics, its screen and the size the game draws at; what is on the graphics card (pictures and
drawing buffers, the most so far, the budget); the script's memory (Chrome and Android only: Safari does not say); the
frame times; how often the picture was taken away and given back; and each figure fetched, its size and how long it
took to arrive and to be ready. Settings, "Measured on this device", shows the same lines in town.

### Ash-grey controls (`template.html`)

The owner, with the same brief: the control buttons' main colour is ash grey (#b2beb5) where it was blue (92, 176,
255): the stick, the pads, Run and the action buttons, their outlines, glow and icons, the swimming stick. Held, a
button still turns green, and goes back to ash grey when let go (`test/touch.mjs`, `test/motorcycles.mjs`).

### Measured after (the same test: `test/opening.mjs`, Slow 4G, the processor slowed four times, a phone's screen)

| | live before | now |
|---|---|---|
| splash painted | 1.2 s | 0.4 s |
| PLAY, first visit | 54.7 s (5.1 MB before it) | 7.3 to 7.4 s (0.98 MB) |
| PLAY, coming back | 16.8 s | 2.4 to 2.7 s |
| the character screen | 87.6 s | 9.1 s |
| one arrow press: fetched | 6.9 to 19.1 MB | 0.3 to 0.7 MB |
| one arrow press: the next character on the screen, from the touch | 40 to 125 s | 0.26 to 0.52 s (its picture from all round) |
| one arrow press: the whole figure | 40 to 125 s | 4.9 to 16.7 s (2.2 to 4.8 s on ordinary 4G) |
| drawing surfaces | 2 | 1 |
| on the graphics card, two presses in | 115 MB | 5.3 MB |
| script memory | 130 to 142 MB | 30 to 34 MB |
| longest freeze before PLAY | 7.9 s | 1.9 to 2.0 s |
| everything a first visit fetched (opening, character screen, four presses) | | 16.7 MB, nothing twice |

The test browser has no graphics card: the processor draws every pixel, and a touch waits for the frame being drawn
(0.25 to 0.5 s here, slowed four times); the page then shows the next character's picture in the very next frame it
paints (25 to 37 ms later). A press made while another figure was still arriving was on the screen 63 to 94 ms after
the touch, and that download was stopped. On Slow 4G a whole figure takes 5 to 17 s to arrive (2 MB at 200 KB/s), its
picture there meanwhile; on ordinary 4G (9 Mbit/s, 85 ms) PLAY came after 3.3 to 3.9 s on a first visit (2.4 to 2.5
s coming back) and each whole figure 2.2 to 4.8 s after the press.


## The habitation at the far end of the River Niger (20 October 2026)

The owner's brief of 20 October, with his 49 models (`assets/habitation/`) and nineteen pictures of how it should look
(`assets/habitation/reference/`): a habitation at the far end of the River Niger, reached by road, walked on foot,
built like the pictures from his models, with water, waterfalls, fish, birds, their sounds, a dark night with the moon
and the stars, and a torch on the phone.

(On 21 October it was brought down to the end of the town's road, made free to walk, and given a boiling river round
its far end: the next section says what changed. Where this section says otherwise — the road 1.6 km long, walking
only on paths and beaches, when it is built, what it costs — the next one is how it is now.)

### Getting there

- **The river.** The River Niger now runs on north past where it used to stop (at x 750) to the habitation's lagoon
  (x 2086): longer, not wider (the same water, the same width, `riverShore`); the River Niger bridge is exactly as it
  was (`test/habitation.test.mjs` compares it with what it was).
- **The road.** Waterside Road goes on north out of the town along the river, 1.6 km, to the habitation's car park.
  A sign at the town's end ("THE HABITATION, north, along the river"), one on the way, one at the car park. Its verges
  and the car park are fenced with wooden rails (the land beside it is not built); the car park's side toward the
  habitation has a wooden fence too, open at the gate.
- **The gate.** From the car park it is on foot, over a plank footbridge across the stream. Every bridge, boardwalk,
  jetty and stair in the habitation is walked, never driven: a motorcycle or car whose front comes to one stops there,
  and the player is told **"Get off your vehicle to cross the bridge"** with a **Get off** button (and E). The vehicle
  stays where it stopped. The message stays until the player gets off or moves away (`own-cars.js`, `vehicles.js`:
  the town refuses the step, `FOOT_ONLY`; `main.js` shows the message).
- **When it is built.** Nothing of it is fetched or drawn in the town: its drawing is a script of its own beside the
  page (`habitation-code.js`, 36 KB as sent; `src/client/habitation-code.js`), asked for once the town is up and
  warmed, or at once for someone on the road north, so that the opening does not wait for it; the road and the river
  beyond the town are put in as the player goes up Waterside Road (past x 200) and let go back in the town (below
  x 120); the habitation itself is built as the player comes near it and let go as they leave, its models fetched
  nearest the gate first.

### The places, after the pictures

Twelve places, joined by paths, each made after the owner's pictures of it (the picture numbers in brackets): the
entrance hill with its great tree and bench (10); the forest path among buttress roots (4, 15); the swamp boardwalk
with its water lilies (12); the mangrove boardwalk (5); the lagoon, its beaches, its rock pillars and the palm island
with its boardwalk (6, 2, 8, 16, 18); the rocky stream gorge with its stepping stones and wooden bridge (1, 7); the big
waterfall into its red-rock pool, its stairs and its bridge (11); the suspension bridge over the outflow's gorge (9,
13); the waterfall pool (3); the overlook, a paved terrace on the cliff with stone steps down to the beach (17); the
sunset beach and its jetty (14, 18); the gazebo garden on its shelf below the east cliffs, with its pond (19). The
layout is `src/sim/zones/habitation.js` (the land, the waters, the paths, the decks, what is walked) and
`habitation-scene.js` (where each model stands, written by `tools/habitation/place.mjs`).

### The owner's models

- **All 49 are in it, and nothing else stands in for them** — 2,046 placed (659 trees, 619 palms, 127 banana plants,
  88 bushes, 369 broad-leaved plants, 178 ferns, the suspension bridge, the boardwalk, the gazebo, the pool deck, the
  two landscape pieces), each repeated, turned and sized as such things grow, at its real size. Forty-three of them
  have leaves or fronds that sway in the wind.
- **His files stay exactly as he sent them** (`test/originals.test.mjs` checks each against its MD5). What a device
  fetches is a copy made from each by `tools/habitation/dress-all.py` (`dress.py`, `leaves.py`): the same shape, its
  pictures made smaller (a computer at most 1024 pixels, a phone at most 512; the one sheet of leaves they all share
  2048 and 1024), its leaves cut out of their cards with their own picture, bark, wood and stone given their grain. The copies are in `assets/habitation-dressed/`
  (`made.json` says from which file each was made; the build refuses a copy made from another file).
- **Rocks:** none of his 49 files is a rock, so rocks were made for the habitation (`tools/habitation/rocks.py`: four
  stones, three shapes each), 121 of them placed: mossy boulders in the forest, on the hill and by the gorge's stream,
  granite down the gorges, flat slabs of the big waterfall's red stone where its outflow leaves the pool, pale
  limestone on the waterfall pool's sand. Only the shapes placed are sent (the build leaves the other two out).
- **The boardwalks and bridges.** His boardwalk is one curved piece with a round platform at its end: it stands at the
  swamp. The paths' other boardwalks, bridges, the jetty and the stairs are laid plank by plank along them, in his
  boardwalk's own wood (cut from its picture by `tools/habitation/deck-wood.py`), with posts and rails (rope on the
  swamp's, the island's and the jetty's). The suspension bridge is his.
- **Far off**, trees and palms are drawn as pictures of themselves made in the page from his models (`createImpostors`),
  each kind of thing drawn as a model only within its distance (palms and trees 150 m, ferns 60 m on a computer; less
  on a phone).

### Walking

Only paths, boardwalks, bridges, sand, open grass and shallow water are walked (`habitationFooting`); trees, palms,
banana plants, bushes, rocks, the gazebo's posts, its back wall and the post in its middle, and the cliffs stop a
walker at their real size (1,601 solid places). Paths are 2.4 to 9 m wide; nothing solid stands on one. Every place
can be walked to from the gate (`test/habitation.test.mjs` walks the whole of it).

### Water, sand, life, sound, night

- **Water:** clear in the shallows (the sand and stones under it seen through it), darker as it deepens, moving, giving
  back the sky; each water its own colour (the lagoon's turquoise, the pools', the swamp's dark green, the garden
  pond's); four waterfalls with their veil, foam where they land, spray and mist; streams that run, with rapids; the
  shallows walked.
- **Sand:** footprints where the player walks on it, fading in a minute and a half.
- **Plants** sway in the wind (their leaves and fronds bend, each from its heart out); grass and flowers on the open
  ground.
- **Fish** (tilapia, minnows, golden fish) in the lagoon, the pools, the garden pond and the gorge's stream, none in
  the Niger, darting away when someone wades near.
- **Birds:** fourteen kinds — African grey and Senegal parrots, rose-ringed parakeets, great blue and violet turacos,
  pied hornbills, pied crows, bulbuls, sunbirds, weavers, malachite kingfishers, little egrets, hadada ibises and the
  African fish eagle — high and low, perching, flocking, wading, soaring, landing and taking off, flushed by a walker,
  at rest at night; only in the habitation.
- **Sound** (made in the page, no recordings): each kind of bird its own song from where it is; the waterfalls,
  louder the nearer; the streams; the lagoon's water at its edge; the wind in the leaves; at night crickets all round
  and frogs by the water. Fireflies at night.
- **The pillars and the hills.** Limestone towers rise out of the lagoon (up to 40 m), fluted, stepping in and out,
  green on their ledges and palms and bushes on their tops, a darker line where the water laps at them and the water
  darker round their feet; one stands off the sunset beach. Far off all round, 1.15 and 1.5 km out, two rings of steep
  karst hills (open where the river's valley runs back to the town), in the colour of the air between, dark at night.
  Out here the air is clearer than over the town (the haze begins at 160 m and is whole at 640 m; over the town 110
  and 480 m), so the far side of the lagoon is seen.
- **Night** in the habitation is dark (no town lights), with the moon and the stars. The phone has a **Torch** app: on,
  the player holds the phone out and a light comes from the back of the handset beside its camera, a soft cone ahead
  and down that moves with them; other players see its beam (a soft cone and its pool of light on the ground).

### What it costs

Measured on this machine, which has no graphics card (the processor draws every pixel, so its frame rates say nothing
about a phone's): what one frame draws (draw calls, triangles) and what the page holds on the graphics card (pictures
and drawing buffers, counted as they are handed over: `graphics-count.js`).

| | a computer | a phone (`#lite`) |
|---|---|---|
| draw calls, the most at any place measured | 283 (the forest path, picture 15) | 204 (the forest path) |
| triangles, the most | 1.41 million (picture 15) | 506,000 (the garden) |
| on the graphics card, up at the habitation | 431–522 MB (its budget 700) | 132–137 MB (its budget 150) |
| fetched for it: its models, and the leaves and wood they share | 18.0 MB + 0.96 MB | 12.7 MB + 0.4 MB |
| its ground, water and waterfalls built | 3.2 to 4.5 s | 3.0 to 3.5 s |

Its models arrive one after another, nearest the gate first, from the moment it is built (600 m before the car park):
on this machine all of them took nine to eleven minutes, because each model's pictures are answered between two frames
and here a frame of the habitation takes a second or two; a phone's graphics chip draws one in a few hundredths.

**The town, before and after** (the same view, by the market at noon, once the town has warmed up and its towers have
come): on a phone 187.6 MB on the graphics card before (over its 150 MB budget), 121.9 MB now (209 draw calls and
468,000 triangles before, 201 and 465,000 now); on a computer 459 MB before, 435 MB now. What a phone saves: every
sign made at half its size (the town's street and shop signs, the showrooms' names, the billboards' faces, the
roadblocks' boards: they look the same on a phone's screen, and a computer's are as they were), and the town's towers
let go while the player is over 1.2 km from them and fetched again on the way back. Up at the habitation a phone holds
131.9 MB (the town's towers and the car showroom's buildings let go, the habitation's own 46 MB of pictures held). The
habitation's own pictures on a phone: its rocks' stone at half size and the trees' far pictures in smaller slots.

The opening is as it was: the habitation's drawing and models are not fetched before the town is up, and what the
game's script carries of it (the land, where each model stands: what walking needs) adds 0.05 MB before PLAY
(`test/opening.mjs`, a phone on Slow 4G, the processor slowed four times, run in turn with the live build on the same
machine: PLAY on a first visit 8.0 and 7.9 s, the live build 7.4 and 8.1 s; coming back 2.4 and 2.8 s, the live build
2.5 and 2.3 s; 1.03 MB sent before PLAY, the live build 0.98 MB).

### Files

Sim: `zones/habitation.js` (new), `zones/habitation-scene.js` (new, generated), `zone.js`, `own-cars.js`,
`vehicles.js`, `talk.js`, `zones/closures.js`. Client: `render-habitation.js`, `render-habitation-life.js`,
`habitation-plants.js`, `bird-songs.js`, `torch-beams.js` (new), `audio.js`, `render-sky.js`, `main.js`, `camera.js`,
`ui-phone.js`, `radar.js`, `town-map.js`, `render-closures.js`, `template.html`; for a phone's graphics memory
`render-kit.js` (signs), `render-billboards.js`, `render-carshow.js`, `render-powerbike.js` (their signs and faces)
and `render-town-buildings.js` (far-off towers let go). Net: `link.js`. Tools: `tools/habitation/` (new:
`dress-all.py`, `dress.py`, `leaves.py`, `rocks.py`, `deck-wood.py`, `glbio.py`, `place.mjs`, `lab.mjs`,
`models.json`). Build: `build.mjs`. Tests: `test/habitation.test.mjs`, `test/habitation.mjs` (new); `originals`,
`site-budget`, `closures`, `map`, `town-buildings` tests updated; `start.mjs` (more time for a second player). On the
website the habitation's drawing is a script of its own, `habitation-code.js` (made by `build.mjs` from
`src/client/habitation-code.js`); the web app keeps it for playing without a connection (`webapp.js`, `keepFiles`).

### Limitations

- It is drawn with the game's own means (three.js, a phone's budget): it is not the photographs. The comparison
  sheets put each picture beside the game's view of the same place.
- The birds and fish are simple shapes made in the page (no models of them were supplied); the sounds are made in the
  page, not recordings.
- Frame rates on real phones (an iPhone and a mid-range Android) cannot be measured on this machine, which has no
  graphics card; what each place costs to draw is measured instead (above).

## The habitation at the end of the town's road, free to walk, and its boiling river (21 October 2026)

The owner's brief of 21 October, from his recording of the game: the habitation was too far from its sign; it should
be close to the first sign, the one just past the end of the town's road, so that whoever rides there has to get off to
go in; one should walk freely in it, stopped only by what is really in the way; at its far end a boiling river,
steaming, plainly boiling, with signs telling people to keep away, and no Swim offered by it; every place in his
pictures there, joined to the rest and visited (its bridges crossed, its waterfalls seen); and the birds seen flying
and heard.

- **Where it is.** The whole habitation, as it was laid out, is moved 1,552 m back down the river
  (`HABITATION_SHIFT`, `zones/habitation.js`): its land, its waters, its paths and bridges, its places, every model
  where it stood (`habitation-scene.js`), its waterfalls, its sounds and its life, the same to the metre among
  themselves. Its edge is now 58 m past the first sign ("THE HABITATION / Park here: on foot from the gate", at x 262,
  where the town's road ends) and its gate 74 m from it. Waterside Road goes on 51 m from the town's end to the car
  park at the gate; the sign that stood half-way along the old 1.6 km is gone. The River Niger runs on into the
  habitation's lagoon as it did.
- **On foot only.** No vehicle goes anywhere into the habitation, not only onto its bridges: a motorcycle, a car, a
  keke or an okada is stopped at its edge wherever it comes to it (off the car park's far side, round the moat), with
  **"Get off your vehicle: the habitation is entered on foot"** and the **Get off** button; at the gate's footbridge
  still **"Get off your vehicle to cross the bridge"** (`habitationFootOnly`, `footOnlySaid`; `own-bikes.js`,
  `own-cars.js`, `vehicles.js`, `okada.js`). The vehicle stays where it stopped, at the car park.
- **Free to walk.** Everywhere in the habitation is walked — the forest's floor, the land between the places, the
  banks — except where something stands in the way: a tree's trunk, a palm, a plant, a rock, the gazebo's posts and
  wall (each solid at its real size), a cliff's face (ground steeper than 1 in 1), deep or fast water, and the boiling
  river. A step is never a drop or a climb of more than 0.9 m, and one gets on and off a bridge or a boardwalk at its
  ends (`habitationFooting`, `habitationStep`; the town's `move` and the page's own walking both ask it, step by step).
  From the gate the whole of it is walked to: `test/habitation.test.mjs` walks it a metre at a time, every place
  reached, and over 70 % of all the ground one can stand on.
- **A tree is in the way where its wood is.** The big trees' buttresses and the roots arching up from them reach out 5
  to 15 m from their trunks (the giant buttress-rooted tree's, 15 m), and a mangrove's prop roots 3 m: a box at the
  trunk's middle let a walker through them. Now wherever one of the owner's trees, palms or bananas has wood between
  0.9 m (lower, a root is stepped over, as a step of the ground is) and 1.8 m above its foot, a walker is stopped
  (`tools/habitation/roots.py` reads his files as supplied, leaves out the leaves by their colour, and writes each
  model's half-metre squares of wood, `zones/habitation-roots.js`; `habitationRootAt` places them for every copy,
  turned and sized as it is drawn). A path or a deck is never closed by them: within 0.8 m of one's edge a root is
  walked over (twelve trees have wood over a path, 75 m² in all). They take 16,700 m² of the habitation (about
  3 % of it). The camera keeps out of them too, and looks over them from above 2.2 m.
- **Its edges.** The moat on the town's side (the gate's bridge crosses it) and the boiling river round the rest of it
  close the habitation round; beyond them is the bush, seen and never reached (the moat now runs on to where the
  boiling river rises, so that the two waters meet).
- **The boiling river.** Round the habitation's three far sides, 2.1 km of it, 15 m wide, in a channel below its
  banks: pale, milky water that heaves and churns with bubbles rising and bursting all over it (worked out on the
  graphics card), froth at its edges, its banks pale with what the water leaves; steam rolling up off it — puffs
  rising and swelling near whoever is there, and a curtain of vapour drifting up off it all along, seen from wherever
  it is in sight — white by day, grey at dusk, faint at night. It is heard: a deep seethe, a hiss of steam, and
  bubbles bursting, louder the nearer. Twelve yellow-and-black signs along its bank, facing whoever comes toward it
  (each where nothing of the forest stands at it or in front of it):
  **"DANGER: BOILING RIVER — The water is boiling hot. Keep away."** Nobody goes into it, nor the last four metres of
  its bank (the water as drawn laps a little way up it); there is no Swim by it (nor anywhere up there: the Swim
  button is the town's river's only). The forest goes on down to its bank (480 more trees and plants, all of the
  owner's models, in a band round it).
- **Birds, seen and heard.** As well as the birds about the habitation's places, flocks of parakeets, weavers and
  parrots fly over in front of whoever is there every 16 to 34 seconds by day, calling as they go; perched birds sit
  lower (bushes beside the paths) and nearer; they flush with an alarm call when someone comes close; each bird sings
  every 4 to 16 seconds and is heard up to 150 m off, four times as loud as before (they were too quiet to hear over
  the town's sounds).
- **Someone kept up there.** Whoever was kept in the habitation before it was moved is put in the same place in it
  as it now is; whoever was kept on the road that went on up to it (now the bush beyond it) at the nearest place to
  stand within 60 m, or else where everyone arrives; on their own motorcycle or in their own car up there, at the
  habitation's car park, still on it (`sim.js`, when a world is loaded).
- **When it is drawn.** By distance from its ground (`habitationAway`): on a computer built as a player comes within
  260 m of it, let go beyond 400 m; on a phone within 180 m (from the town's east end on), let go beyond 240 m; the
  road's end, its car park and its signs within 380 m, let go beyond 480 m. A page opened from the disk (the play-through
  test's) fetches none of its files: there it is drawn without the owner's models, as the town is without its towers.
- **A phone's memory, with the habitation beside the town.** Measured on a phone's settings walking from the town's
  market to its east end, the first sign, the gate and round the habitation (`phonemem`, the graphics card's pictures
  and drawing buffers): before this the town and the habitation together came to 208 MB by the sign (the budget is
  150 MB), and the town alone was already over it at its east end and by the car showroom. Now, on a phone:
  - a habitation model none of whose copies has been drawn as the model for ten seconds (they are pictures from afar,
    or out of sight) has its pictures taken off the graphics card, kept in the page and handed over again the moment
    one of its copies is drawn; and a model none of whose copies is drawn is not drawn at all (three.js would otherwise
    hand its pictures over every frame for nothing, which kept them all on the card);
  - every tower more than 100 m off, and every house model none of whose houses is nearer than 50 m, is drawn from
    its model with its pictures at 512 instead of 1024: from there a phone's screen has fewer pixels for it than that
    picture has (100 m off, a phone's screen gives a tower about 5 pixels to each metre of it; the towers' pictures at
    512 have 6 to 7 to the metre; 50 m off, a house about 9, and the houses' pictures at 512 have 12 to 22). Nearer
    than 70 m (a house, 35 m) at 1024 again; one model at a time, the copy in use kept until the other has come, and
    none changed again within twenty seconds. Towers more than 650 m off are let go (the haze in the habitation is
    whole at 640 m);
  - while the habitation is drawn, a house model is let go as soon as none of its houses is drawn from it;
  - the car showroom's buildings are fetched within 520 m and let go past 550 m (the town's haze hides everything past
    480 m; a computer: 900 m and 1,150 m, as before);
  - the car showroom's name, the largest picture a phone held anywhere in the town (2048 by 512, 5.3 MB), is 1024 by
    256 on a phone (its letters still over a hundred pixels high).
  And on a phone and a computer alike, beyond the haze's far edge the town's vehicles and townspeople are not drawn at
  all (they were drawn there unseen: from the habitation's garden on a phone the town's parked fleet and its people,
  600 m and more off, were nearly ninety of the 269 draw calls), and the boiling river's twelve signs are drawn as
  two things rather than forty-eight.
  The same walk with these, on the released build (a phone's settings, all the habitation's models in): the town 119
  MB; its east end 150.2 MB, at the budget's line (four house models have houses within 35 m of it and a fifth within
  40 m: drawn from their 1024 pictures, as near houses are); the first sign 131 MB; the gate 110 MB; the entrance hill
  113; the lagoon's beach 120; the big waterfall 109; the garden 113; the boiling river 111–117; back at the market
  96 MB, and the west of the town, toward the car showroom, 118 MB (183–198 MB there earlier on 21 October, before the
  towers' and houses' smaller pictures).
- **Fixed on the way:** the boiling river's water stood above its banks (now in a channel below them); the cache of
  the signs' pictures used a texture `userData` that three.js r128 does not have (the habitation would not build); the
  town's ground rose over the road's last 51 m to the car park (now kept under it); a walker could stand at the very
  edge of the boiling water, and then in its froth as drawn (now four metres of its bank are not stood on); the vapour
  seen from far off made a pale band along the horizon (now it fades out with distance); in the forest the camera came
  down inside a big tree's buttresses (now it keeps out of them).

Files: `zones/habitation.js`, `zones/habitation-scene.js` (written again by `tools/habitation/place.mjs`),
`zones/habitation-roots.js` (written by `tools/habitation/roots.py`),
`zones/atani.js` (`zoneStep`; the roots in `zoneWalkable` and `zoneSolid`), `zones/closures.js`, `sim.js`, `own-bikes.js`, `own-cars.js`, `vehicles.js`,
`okada.js`; `render-habitation.js` (the boiling river, its steam and signs, the bush beyond, the build distances),
`render-habitation-life.js` (the flocks, the lower perches), `audio.js` (the boiling, the louder songs),
`render-world.js` (the town's ground and river stop at the habitation, and lie under the road to it),
`render-town-buildings.js` and `render-carshow.js` (a phone's pictures and what it holds), `main.js` (the haze),
`radar.js`, `town-map.js`; tools `place.mjs`, `lab.mjs`, `roots.py`; tests `habitation.test.mjs` (15), `habitation.mjs`,
`town-buildings.mjs`.

## The habitation's ground, decks and water as they are walked; a jump, and stairs climbed (22 October 2026)

The owner's brief of 22 October, from four screen recordings made on his phone: a walker drawn sunk into a sandy bank
to the knees and once to the head, the camera under the ground; walked out through the side of a bridge by its end;
standing half inside a wooden bridge's posts and rails; the big waterfall's wooden stairs going into the ground at the
cliff's top, the walker going through the ground and coming out under it; the river waded into and then not gone on
in, with nothing said why. And: a jump, and the figures' own animations for jumping and for going up stairs, added
where a figure has none.

- **The ground a walker stands on is the ground drawn.** The habitation's ground is now one set of triangles, 2.5 m
  across (`HABITATION_GROUND`, `habitationGroundAt`, `zones/habitation.js`): the simulation puts every walker on it
  (`habitationGroundY`), and the page draws exactly it, on a phone too (`groundData`, `groundPieces`,
  `render-habitation.js`). Before this a phone drew the ground from points 5 m apart while the walker stood on the
  simulation's finer ground; at the foot of a steep bank the two were up to a walker's height apart. A phone draws every
  other point (5 m) only while the habitation is more than 60 m off (from the town's east end, say), and every point
  from 60 m in (`NEAR_GROUND`). Each point is 20 bytes on the graphics card (where it is; which way it faces; its colour
  in sRGB with how rocky and whether paved in a fourth byte) in pieces of under 65,536 points: the whole ground at 2.5 m
  is 3.1 MB (it was 6.5 MB on a computer; a phone's 5 m ground was 1.35 MB, its coarser one now 0.8 MB). What stands
  on the ground stands on this ground: the owner's models, the signs, the decks' posts, the grass, footprints, the
  birds on the ground; the camera's eye is kept above it.
- **In the water.** Wherever the water can be waded (up to 0.55 m) it is never more than half solid, so a walker's legs
  are seen in it, faintly; deeper, as before.
- **Bridges and boardwalks are walked between their rails, and entered only at their ends.** On a deck with rails one
  keeps half a metre in from its edges, and beside it half a metre out (`HABITATION_RAILS`, `habitationRailsAt`). Its
  posts (461 of them, every 2.4 m along both edges, where they are drawn: `HABITATION_DECK_POSTS`) stand within that
  reach, so nobody walks into one, and those at its ends, which one passes going on or off, are solid as well. A step
  onto or off a deck with rails is taken only past its end, where its way goes on (`habitationStep`). A step into its
  rails is turned along the deck instead, so a bending boardwalk is walked without stopping at every bend; and a walker
  coming at its end from beside it is turned round in front of its end's posts to its way in, not stopped at them
  (`habitationAlongDeck`). Where the swamp's boardwalk crosses itself, on its round platform, and on the inside of the
  stairs' sharp turns, no posts or rails stand on the way. Three ways were met at a deck's end by a post: the gorge path
  now ends in front of the gorge bridge's end, the path up the hill leaves the gate's bridge straight before it turns,
  and the sunset beach's jetty begins at the beach's edge, clear of the path along it.
- **Out past a deck's end one stands on the ground in front of it.** The boards had gone on, unseen, half the deck's
  width past each end (`habitationDeckAt`), and a walker there stood on nothing: up to a metre above the sand in front
  of the island's boardwalk, 2.3 m above the ground at the suspension bridge's south end. Now the boards end where they
  are drawn. The boardwalks and the jetty laid well above what is under them (the swamp's, the mangroves', the
  island's, the sunset jetty) come down, over their last 4 m, to 6 cm above the ground or the water at an end one walks
  on from (`OVER_RAMP`), their boards level across as they are drawn, above the highest ground under them; along the
  rest they stand as high as before. In front of every end the ground drawn is within a step of its boards: at the
  suspension bridge's south end a triangle of the ground there had a corner deep in the gorge beside it, and dipped
  2.3 m; the low corners of such triangles are raised to just below the boards over them, a shelf of rock the end rests
  on (`endFill`).
- **Where the ground is too steep to stand on is judged on the ground as drawn** (`habitationSteep`): a bank in the
  finer ground the land is worked out on, under a gentle slope of the ground drawn, had stopped walkers unseen (beside
  the outflow bridge's north end), and slopes drawn steep had been walked up.
- **The big waterfall's stairs go down in a cutting.** For their first 17.5 m they ran inside the cliff's top, up to
  8.8 m under it. The land is now cut down under every deck with heights of its own (`shaped`, `CUT_*`): a floor below
  its boards from its middle to 2.6 m past its edges (the ground drawn is then under its boards everywhere on it), rock
  walls from there up to the land, and in front of each end the land no higher than its boards. The stairs go down
  from the cliff's top in a cutting open to the sky and on down its face to the pool; beside them, their cutting's
  floor is not walked. Every deck's boards are now at least 4 cm above the ground drawn under them, all along and
  right across (the gate's bridge had ended a quarter of a metre under the land: its east end is raised to it).
- **Signs: swimming in the swamps is not advisable.** Eleven big boards (5 by 2.4 m, white on red: "SWIMMING IN THE
  SWAMPS / IS NOT ADVISABLE / The water is deep beyond the shallows") where one wades in and the water soon gets too
  deep: the lagoon's west beach (two), its island, the sunset beach (two), its east shore, the waterfall pool's south
  shore where the path comes to it, the swamp (two) and both banks of the Niger (`HABITATION_SWIM_SIGNS`); each on
  dry ground 2 to 6 m up from the shallows, facing whoever comes down to the water, nothing standing in front of it,
  its posts in a walker's way. And a
  walker stopped by deep water is told: "The water is too deep to wade on here. Swimming in the swamps is not
  advisable." (at most every 30 seconds).
- **A jump.** Space on a keyboard, and a Jump button on a phone, on foot. The figure's own "jump down" where its file has
  one (the woman's, the ninja warrior's), otherwise one of theirs carried onto its own bones (`~leap`: a woman from the
  woman, a man from the ninja warrior; 28 figures, `tools/characters/borrow.mjs`), played from its crouch to standing
  again (`JUMP`, `animated.js`), its hips' own travel in the file left out; the feet kept on the ground through the
  crouch and the landing, and between them the body lifted in an arc, 0.45 m at its top for a figure 1.75 m tall, about
  1.4 s from the press to standing. Only a movement of the body: nothing is jumped onto or over. The simulation keeps it
  (`jump`, `sim.js`: not from a vehicle or in the water, not again within 1.4 s) and the other players near see it: it
  travels to their own games with how far into it the jumper is (`link.js`), and each keeps it from the first word of
  it, shown from its beginning (`talk.js`).
- **Going up stairs.** On the habitation's stairs, going up, the figure climbs with its own "run upstairs" where its file
  has one (seven do), otherwise one carried onto its own bones (`~stairs`, 23 figures), at the pace it goes
  (`habitationClimbing`).
- **A phone's memory at the town's east end.** With the swimming signs' picture (0.7 MB) a phone there came to 150.9 MB,
  over its budget of 150 (it had been 150.2, four house models near it drawn from their 1024 pictures). Now, while the
  habitation is drawn, a house model on a phone is drawn from its 512 pictures unless one of its houses is within 15 m
  (22 m to go back to 512): from 20 m a phone's screen gives a house at most about 22 pixels to each metre, as many as
  the houses' best pictures at 512 have (`HOUSE_HAB_NEAR`, `render-town-buildings.js`).

Measured on the build that went live (in a browser without a graphics card, so times are this machine's, not a
phone's): on the lagoon's sandy bank the walker stands exactly on the ground drawn and its lowest foot is 1.8 to 2.4 cm
above it, on a phone's settings and a computer's, and the camera never under it; the ground drawn and the
simulation's agree at every point looked at. The big waterfall's stairs walked down from the cliff's top (21.2 m) to
the pool's beach on their boards, the camera never under the ground, and back up with the figure's own "run upstairs"
(12 of 13 looks during the climb); the gorge bridge gone onto from 2 m to the side of its end; on a bridge walked at
its side, the walker stopped 0.7 m from its middle (its half-width 1.2 m), its nearest post 0.56 m off; walked at it
from beside, stopped 1.71 m from its middle. Wading out from the lagoon's beach, stopped where it is 0.55 m deep and
told so. A jump: the crouch, then off the ground (0.32 to 0.4 m up when looked at), the landing crouch, standing again
about 1.4 s after the press; the other player, on a phone, saw it (7 of 14 looks during it, 0.44 m up). Every deck's
boards at least 4.2 cm above the ground drawn; in front of every end the ground within half a metre of its boards.
What it costs to draw (`habitation.mjs`): a computer at most 341 draw calls, 1.56 million triangles and 626 MB, a
phone at most 231, 730,000 and 126 MB. A phone's graphics card (`phonemem`): the town 119 MB, its east end 134.9 (it
came to 150.9 with the new signs; 150.2 before them), by the sign 123, the gate 114, the habitation 109 to 118, the
market 96, the west of the town 117.

Files: `zones/habitation.js` (the ground drawn, the cuttings, the rails and posts, the signs, the climb), `zones/atani.js`,
`sim.js` (`jump`), `talk.js` and `net/link.js` (another player's jump), `render-habitation.js` (the ground's pieces, the water, the posts and rails, the signs),
`render-habitation-life.js`, `animated.js` (the jump, the stairs), `figure-borrowed.js` (from `borrow.mjs`),
`render-crowd.js`, `render-town-buildings.js` (a phone's house pictures by the habitation), `main.js` (the Jump button, the slide along a deck, the word about deep water, the camera),
`icons.js`; tests `habitation.test.mjs` (25, ten of them new), `figures.test.mjs`, `habitation.mjs` (L).

## The town's NPCs taken out; sixteen policewomen walk the whole land (22 October 2026)

The owner's brief of 22 October 12:12, and his answers at 12:32: every NPC out of the game (the townspeople walking,
standing and sitting, everyone on a motorcycle with their motorcycle, every street and market seller with what they
sell), everywhere, the habitation too; every vehicle, building, road, sign and showroom kept, and the players' own
characters, motorcycles and cars. The named people at the counters kept, and the mason. The police officer (W3, Amaka)
taken out of the women a player can choose and made the town's police: sixteen policewomen drawn from her, each with
her own face ("some dark african skin, while some melanin skin, some ebony skin, while few is fair"), in the Nigerian
Police's uniforms of his picture, patrolling "the whole of the delta state", arresting and fighting culprits as before.
Witnesses: the police only. No okadas. Bail only from another player. The showroom staff not drawn until his own
models come. The system that walks, places and animates the town's people kept ready for his own NPC models.

**What is gone, and what is kept**

- **The townspeople**: the town had a thousand people by job (schools, the hospital's staff, the churches, the market's
  traders, farmers, fishers, the okada riders and the drivers). Now its people are its sixteen policewomen
  (`ZONE_POPULATION`, `zones/atani.js`, `edition: 2`) and the eleven named people at the counters (`ZONE_RESIDENTS`:
  the lands officer, the secretariat clerk, the police post's sergeant and corporal, the clinic's nurse, the trade
  instructor, the block yard's owner, the building materials trader, Mama Nkechi, the mason, and the keke dealer). The
  five other named people (the moulder, the fisherman, the cloth trader, the produce seller, the surveyor) are kept as
  `ZONE_FORMER_RESIDENTS`, out of the game. The block yard still makes its blocks.
- **The sellers' things**: the market's stalls with their tables and umbrellas (`ZONE_STALLS` is empty), the goods
  and benches in the trade sheds (the sheds stand), the petty traders' mats and the hawkers' trays.
- **The okadas**, their riders and the OKADA boards at the ranks; the phone's okada section; "By keke or okada" is
  "By keke".
- **The showroom staff and the watch shop's attendant** (Obi; Tochi and Oluchi; HOLARIS's attendant): not drawn
  (`ZONE_CAST`). Where they stood, who sells which car and the conversation that sells it are kept: walk up to a
  motorcycle or a car and the conversation opens on the phone, and the handset is held up in the town as for any
  other use of the phone (it was not, while the salesman stood there to talk to).
- **Kept**: every keke, bus and vehicle, the buildings, roads, signs and showrooms; the players' own characters,
  motorcycles and cars. (No keke or bus was driven by the town's people: the drivers waited at the motor park, and
  the coaches stand there as before; the kekes stand in the hire bays and wherever players leave them. The only
  vehicles the town's people rode were the okadas.)

**The police**

- **Sixteen policewomen** (`src/sim/police-looks.js`), each drawn from the owner's police officer, her file
  unchanged (`src/client/police-dress.js`): her own skin (dark 5, ebony 4, brown 4, fair 3), her own face (wider or
  narrower, the jaw, the chin, the nose, the lips, the cheekbones, the brow, the head's size), her own height (about
  1.64 to 1.76 m) and build, in one of three uniforms after his picture: black with a black beret (5), a sky-blue shirt
  with black trousers and a peaked cap (5), blue camouflage with a navy beret (6), the figure's own body armour with
  POLICE across it over each. How: a copy of the figure's positions with her head reshaped (everything else of the
  figure is shared: its normals, texture coordinates, skin weights and triangles); her skin and her uniform from the
  figure's own picture, its light and shade kept, told apart by colour (a skin's warm brown; the shirt's cool grey;
  the trousers' olive; the yellow letters kept) and by which bones move each part (an arm's or the neck's points are
  the shirt's only where they are nearer an arm or the neck than the body or a leg, so that a sleeve's colour is put on
  the sleeves and the collar and not on the trousers by her hands, the armour's back or the hair at her nape); the
  camouflage in blotches laid on the body's own shape; the hat made in code and set on her head bone. One shader for
  all sixteen. What a phone holds for her beyond the figure itself: her positions (78 KB each).
- **Taken out of the women a player can choose** (`FIGURE_ORDER`): a player who already has her keeps her.
- **Their beats** (`src/sim/zones/atani-patrols.js`): the market and the motor park (two by day, one by night),
  Registry Road and the Police Post (one and one), the waterfront and the bridge to its far end (one and one), the
  west of the town (one by day), the east (one by day), Yard Lane, the layout, the campuses and the farms (one and
  one), the Kwale road and the car showroom (one and one), the airport (one by day), and the road up the river into
  the habitation to the lagoon's west beach (one and one): ten by day, 06:00 to 18:40, and six by night, 18:00 to
  06:10. Each walks her beat's stops in order and stands a minute or so at each (`patrolDay`, `population.js`),
  reporting for duty and signing off at the Police Post, by the website's real clock. Asked what she is doing: "On
  patrol". Anyone in a game saved with the old town keeps what they did and own; what the save held about townspeople
  is let go (`src/sim/renew.js`).
- **The law**: only the police are witnesses (an officer within 15 m with a clear view always sees it; further, up
  to 30 m, by how grave it was). The person wronged knows, and can report it by phone. The police come from their
  beats, chase, fight and arrest as before; nobody appears from nowhere. Since 25 October each carries the rifle and
  shoots back at whoever shoots at her (the section "Guns, stage 1: the rifle").
- **The phone**: the town's people are not called (they have no numbers); a fine is paid by the player or by another
  player, never by a townsperson.
- **Where this copy of the game cannot have the supplied figure** (the copy on a disk carries none but two), each
  officer is one of the game's own figures in her uniform's colours and a beret (`plain`).

**Ready for the owner's own NPC models.** The system that gives the town's people their days, their places, their
walking and their animation is all kept, and tested with the town as it was (`FORMER_TOWN`, `test/helpers.mjs`): the
headless tests of the townspeople's days, dress, talk, fights, the okadas and what happens when a vehicle strikes one
of them run against it. Switching a group back on is one line (`ZONE_CAST`; `ZONE_POPULATION.jobs`).

Files: `src/sim/zones/atani.js`, `atani-patrols.js`, `police-looks.js`, `population.js`, `renew.js`, `justice.js`,
`phone.js`, `economy.js`, `figures.js`, `sim.js`, `host.js`; `src/client/police-dress.js`, `animated.js`,
`character.js`, `main.js`, `render-town.js`, `ui.js`, `ui-phone.js`, `choice.js`, `lab.js` (the police lineup:
`lab.html#set=police`); tests `police.test.mjs` (9), `police-dress.test.mjs` (7), and the townspeople's tests against
`FORMER_TOWN`.

## three.js r186: the game's 3D engine brought up to date, looking the same (23 October 2026)

The owner's brief of 23 October 03:57, its first stage: the game was drawn by three.js r128 (2021), fetched from a CDN
by some pages; it is now drawn by r186, the latest stable release (September 2026; no later one by 23 October),
carried in the build, so that it starts fast and plays offline, and it looks as it did. Quality levels (the second
stage) and more realism (the third) are built on it next.

**The library** (`vendor/three.min.js`, made by `node tools/three/make.mjs` from three.js's own files, kept unchanged
in `vendor/three-r186/` with their licence): one script that gives `THREE` to the page as before, holding only what
the game uses of the library (96 names: 629 KB, 159 KB as sent compressed; r128 whole was 603 KB, 149 KB). The website
serves it beside the page as before (`three.min.js`, kept on the device by the app's worker); the pages that loaded
r128 from a CDN (`dist/index.html`, the character lab and the vehicle yard) load it from beside them. The build
refuses a game that uses a name the script does not hold (`vendor/three.symbols.json`). WebGL 2 only (r186 has no
WebGL 1): a browser without it is told so in plain words on the start screen.

**What changed in three.js, and how the game answers each**

- **Colours.** Since r152 three.js reads a colour written in a script as sRGB and turns it into linear light; every
  colour of the game was chosen on the screen the old way, so the conversion is off (`ColorManagement.enabled =
  false`, in the script): a colour means what it meant. Pictures marked sRGB are still read as sRGB (now by the
  graphics card itself, `colorSpace`), and what is drawn is written out as sRGB (`outputColorSpace`).
- **Light in physical units** (`src/client/light.js`). The sun, the sky's light and the studios' lights: their old
  strength × π. The lamps (street lamps, headlamps, the torch, a phone's glow on its holder) fall away as real light
  does in r186 (r128 faded them in a straight line to nothing at their reach); their strength, reach and fall-off are
  worked out to light a surface as they did, over the distances where each is seen (`tools/three/fit-lights.mjs`: on
  average within 3 to 5 per cent of each lamp's brightest).
- **How a surface gives back its light.** r186 takes the share of the light that a surface's gloss reflects out of the
  light it scatters (its colour), and adds a little to a rough metal's gloss: every surface of the town would be a few
  per cent darker than it was chosen to be (1.5% in the picture, measured). The script lights them as r128 did (three
  lines of three.js's shader, changed by `tools/three/make.mjs`, which stops if a later three.js no longer has them).
- **Soft shadows.** r186 has one kind (`PCFShadowMap`, five samples round each point): made as soft as r128's softer
  kind on a computer and its plain kind on a phone (`shadow.radius` 1.73 and 1.2).
- **Lambert materials** (a phone's buildings, the leaves, the clouds) are lit at every point instead of at their
  corners: the same light on a flat face; smoother on a curved one; a lamp's or the torch's pool of light shows on a
  phone's ground as it does on a computer's.
- **The game's own changes to three.js's shaders** (the habitation's ground, waters and boiling river, its tree
  pictures, the footprints, the leaves' glow): r128's names gone in r186 replaced (`vUv` → `vMapUv`, the normal map's
  frame `tbn`, `mapTexelToLinear` no longer needed); the leaves' glow added where r186 lights them, and kept out of
  their shade as before.
- **Sets of copies (instanced meshes) and skinned figures.** r128 drew every set of copies whether it was in view or
  not; r186 leaves out a set wholly out of view, by a sphere round its copies, worked out the first time it is tested
  and kept. Where the game had given a set's piece a sphere of its own (the grass's cells, the farm, the car
  showroom's railings: each its whole set's, for the game's own list of what is near enough to draw), that sphere is
  the set's; the block yard's stacks have theirs worked out round all their places, as only some are drawn at a time.
  A skinned figure keeps its own sphere, as before (r186 would work one out from its first pose, moving every point of
  it with its bones: a stutter on a phone for each figure).
- **What is counted.** r186 counts the sun's shadow map's draws in its numbers (`renderer.info`), r128 did not: the
  game's own readouts (Settings, Measured on this device) count both now. Compared object by object at the market, the
  motor park and the PowerBike showroom, the two draw the same things, r186 a few grass cells fewer (out of view).
- **See-through things seen from both sides** (glass, the waterfalls' sheets, the chain-link fence, the torch's beam):
  r186 would draw each twice (its far side, then its near side); drawn once, as before, so that none costs twice what
  it did.
- **The order see-through things are drawn in.** r186 orders them by the middle of each one's shape, r128 by where
  each stands; the town's glass, fences and water are drawn in large pieces that all stand at the town's own origin,
  and so were drawn in the order they were made. Seen in the pictures at the airport: ordered r186's way, the
  terminal's glass was drawn over the chain-link fence outside it, which was then barely seen. Put back as r128 had it
  (the renderer's code, changed as the library is made: `tools/three/as-r128.mjs`).
- **A solid surface's alpha.** r186 writes it as 1 for every surface that is not see-through, and so makes each kind
  of surface twice, solid and see-through (a dozen or more programs more to compile in the town: a slower start). Put
  back as r128 had it (the same file): what the surface's picture has, and as many programs as before (measured: 98 to
  105 in the town where r128 had 96 to 101, and r186 unchanged 112 to 119).
- **The habitation's far trees.** Beyond about 150 m each tree and palm is drawn as a picture of itself, taken by the
  game as the model arrives. The pictures are the same in both (read back from the graphics card and compared: the
  same to within a level or two of brightness, the same transparency at every smaller copy), and as many are drawn;
  but r128 drew each narrower than the picture, squeezed thin, and r186 draws it at its true width, as wide as the
  tree it is a picture of. Left as r186 draws it: the far trees in the garden, the lagoon and the forest are fuller
  (the garden, before and after, in the PDF).
- **The graphics card's count** (`#stats`, the budget): r186 makes a picture with all its smaller copies at once
  (`texStorage2D`); counted once.
- `#stats` says which engine draws the game.
- **The tools that make pictures of the game's models** (the figures' turntables, the motorcycles' and cars' pictures
  for the showrooms, the habitation's views) use the same library and light, so that a picture made again matches.

**Checked, one by one** (the brief's list): the game's own GLB reader (`glb.js`: its pictures' colour, the sphere each
figure is culled by), the character kit and the figures (the character screen, every figure's light copy in the town),
the vehicle kits (the PowerBike and car showrooms' models and pictures, the vehicles in town, their lamps by night),
the foliage (the town's trees and the habitation's plants, their glow, their shadows), the sky (sun, clouds, stars,
the moon, the sky's light by the hour), the habitation (its ground, waters, waterfalls, boiling river, footprints, the
trees' pictures for far off, the torch) and everything that makes a renderer: the game, the character lab, the vehicle
yard, the model viewer, the character creator, and the five tools that make the models' pictures.

**Before and after** (`tools/measure/places.mjs`: fifteen places, the character screen and the habitation, by day and
by night, every place at the game's full detail, its level held; pictures side by side in the PDFs sent to the owner).
This machine has no graphics card: it draws in software, a frame in one to five seconds, so its frame times compare
the two builds and nothing more: on a computer's settings the new one's took about a sixth longer here (from a tenth
less to a third more), on a phone's about the same (all thirty, taken together, within a hundredth); what a graphics
card is given to draw, the draws and triangles, is the same or a little less. The graphics card holds about 4 MB more
at each place (the sky that glass and vehicles give back is kept more finely, and the sun's shadow map has a depth
picture where it had a depth buffer); differences of 10 MB or more are what had arrived by the moment of measuring; the script's memory goes up and down
with when the browser last cleared away what was no longer used.
Loading times vary by a few tenths of a second from one run to the next on this machine.

**A computer**: PLAY on the screen 1.4 s → 1.5 s; the character screen 3.0 s → 3.1 s; into the town 24.3 s → 26.6 s;
page errors 0 → 0.

| place (noon) | frame, ms | draws: picture + shadows | triangles (k): picture + shadows | graphics card, MB | script, MB |
|---|---|---|---|---|---|
| character screen | 50 → 67 | 4 + — → 4 + — | 10 + — → 10 + — | 21.3 → 21.3 | 33.2 → 32.2 |
| motor park | 2883 → 3383 | 485 + 50 → 481 + 49 | 868 + 268 → 862 + 267 | 430.7 → 435.1 | 140.1 → 140.6 |
| market | 1400 → 1717 | 212 + 56 → 196 + 55 | 535 + 372 → 520 + 371 | 736.6 → 762.4 | 156.8 → 159.7 |
| city boulevard | 1683 → 1917 | 220 + 62 → 205 + 61 | 520 + 350 → 497 + 348 | 757.9 → 762.4 | 158 → 160.7 |
| PowerBike showroom | 2950 → 3433 | 397 + 73 → 389 + 72 | 946 + 442 → 939 + 440 | 774 → 778.4 | 183.8 → 182.2 |
| car showroom gate | 1233 → 1550 | 205 + 52 → 193 + 51 | 306 + 139 → 294 + 129 | 831 → 835.4 | 274.1 → 277.7 |
| airport | 1083 → 1433 | 113 + 17 → 103 + 16 | 137 + 33 → 135 + 31 | 596.4 → 600.8 | 271.8 → 275 |
| town west | 767 → 750 | 104 + 40 → 91 + 39 | 293 + 222 → 285 + 220 | 768.2 → 772.7 | 258.5 → 260.9 |
| town east end | 2000 → 2317 | 266 + 63 → 252 + 62 | 608 + 336 → 597 + 334 | 845.1 → 848.4 | 170.1 → 175.6 |
| by the sign | 1950 → 2100 | 268 + 77 → 252 + 76 | 713 + 307 → 700 + 305 | 838.8 → 842 | 179.3 → 183.1 |
| habitation gate | 3683 → 4267 | 271 + 92 → 257 + 91 | 1025 + 461 → 1018 + 460 | 898.8 → 902 | 194.2 → 199.6 |
| entrance hill | 4400 → 4983 | 280 + 87 → 265 + 86 | 1114 + 476 → 1102 + 474 | 911.4 → 914.7 | 200.5 → 204.6 |
| lagoon beach | 1633 → 1983 | 173 + 34 → 163 + 33 | 412 + 122 → 410 + 120 | 794.8 → 798 | 202 → 206.5 |
| big waterfall | 2317 → 2533 | 161 + 70 → 149 + 69 | 707 + 331 → 697 + 329 | 637.4 → 640.7 | 193 → 198.2 |
| garden | 2550 → 3017 | 221 + 56 → 212 + 55 | 605 + 225 → 602 + 223 | 638.8 → 642 | 194.7 → 200.8 |
| boiling river | 833 → 750 | 114 + 30 → 102 + 29 | 322 + 91 → 314 + 89 | 580.8 → 584 | 183.3 → 188 |

**A phone (its settings, the processor slowed four times)**: PLAY on the screen 2.2 s → 2.2 s; the character screen
3.3 s → 4.0 s; into the town 38.7 s → 40.9 s; page errors 0 → 0.

| place (noon) | frame, ms | draws: picture + shadows | triangles (k): picture + shadows | graphics card, MB | script, MB |
|---|---|---|---|---|---|
| character screen | 33 → 50 | 4 + — → 4 + — | 10 + — → 10 + — | 5.3 → 5.3 | 30.1 → 35.5 |
| motor park | 2483 → 2500 | 447 + 46 → 444 + 45 | 745 + 201 → 740 + 200 | 126.7 → 136.5 | 124 → 128.6 |
| market | 1100 → 1017 | 215 + 46 → 199 + 45 | 391 + 204 → 376 + 203 | 142.2 → 146.6 | 140.8 → 143.1 |
| city boulevard | 1517 → 1617 | 234 + 51 → 220 + 50 | 410 + 208 → 391 + 206 | 138.2 → 142.6 | 139.7 → 142.8 |
| PowerBike showroom | 2467 → 2483 | 365 + 65 → 357 + 64 | 762 + 282 → 755 + 281 | 154.2 → 164 | 157.4 → 160.8 |
| car showroom gate | 2633 → 1017 | 167 + 27 → 155 + 26 | 2251 + 75 → 2239 + 73 | 145.5 → 155.3 | 255.5 → 257.1 |
| airport | 500 → 583 | 102 + 13 → 90 + 12 | 124 + 26 → 122 + 24 | 125.6 → 139.3 | 253 → 255.2 |
| town west | 500 → 583 | 91 + 17 → 78 + 16 | 143 + 66 → 135 + 64 | 125.8 → 130.3 | 235.3 → 238.1 |
| town east end | 1250 → 1267 | 243 + 39 → 228 + 38 | 386 + 268 → 375 + 266 | 126.5 → 140.9 | 269.9 → 317.5 |
| by the sign | 1500 → 1783 | 233 + 36 → 217 + 35 | 526 + 234 → 512 + 230 | 125.4 → 130.1 | 284.5 → 286.9 |
| habitation gate | 2200 → 2483 | 217 + 37 → 203 + 36 | 528 + 153 → 521 + 152 | 122.9 → 128.9 | 289.3 → 293.4 |
| entrance hill | 2800 → 3050 | 232 + 39 → 216 + 38 | 656 + 162 → 644 + 160 | 122.6 → 128.6 | 291.1 → 295.2 |
| lagoon beach | 1217 → 1333 | 165 + 32 → 155 + 31 | 344 + 103 → 343 + 102 | 123.9 → 129.9 | 293.5 → 297 |
| big waterfall | 1533 → 1500 | 148 + 38 → 136 + 37 | 527 + 149 → 522 + 147 | 124.4 → 127.7 | 275 → 278.1 |
| garden | 2033 → 2183 | 237 + 31 → 228 + 30 | 561 + 123 → 561 + 121 | 127.9 → 131.2 | 275.8 → 278.4 |
| boiling river | 800 → 833 | 109 + 34 → 97 + 33 | 315 + 89 → 311 + 88 | 117.9 → 121.2 | 275 → 277.6 |

**WebGPU**: not yet. r186 can also draw with WebGPU (its `WebGPURenderer`, which falls back to WebGL 2 where a browser
has no WebGPU), and WebGPU is now in every major browser: Chrome and Edge on computers since 2023, Chrome on Android
12 and later (Qualcomm and ARM graphics) since January 2024, Safari 26 on iPhone, iPad and Mac since September 2025,
Firefox 141 on Windows since July 2025 (web.dev, 25 November 2025). It would help later: many more copies of a thing
drawn at once for less work by a phone's processor (a forest, a crowd, the owner's NPCs in numbers), and effects
worked out on the graphics card itself (particles, water, the town's lamps). What it would cost now: every one of the
game's own changes to three.js's shaders (about twenty: the habitation's ground, waters and boiling river, the leaves,
the police's uniforms, the footprints, the torch's beams, the sky, the car showroom's dome and more) written again in
three.js's new shading language; a library about twice the size to fetch; and many phones in use still without it
(Android before 12, iPhones before iOS 26), which would draw through its WebGL 2 fallback, not this one. The levels
and the realism of the next two stages do not need it; worth doing once the town holds many more people and things
that move.

Files: `vendor/three.min.js`, `vendor/three.symbols.json`, `vendor/three-r186/`, `tools/three/make.mjs`,
`tools/three/as-r128.mjs`, `tools/three/fit-lights.mjs`, `tools/measure/places.mjs` and `sheets.py`, `build.mjs`;
`src/client/light.js`, `main.js`, `render-sky.js`, `phone-hold.js`, `render-habitation.js`,
`render-habitation-life.js`, `habitation-plants.js`, `graphics-count.js`, `stats.js`, `glb.js`, `character.js`,
`render-actors.js`, `render-carshow.js`, `render-town.js`, `render-world.js`, and the pictures' colour in twenty
files; test `engine.test.mjs`.

## Graphics levels: Low, Medium, High and Ultra (24 October 2026)

The owner's brief of 23 October, its second stage: four levels, chosen by the game for each device (Auto, with a short
silent test while the town loads) or by the player in Settings, changed without reloading; lowered by the game when the
frames fall under about thirty a second or the graphics card is nearly full, with "Graphics lowered to keep the game
smooth". Built on the phone mode and the detail governor that were there (one system, not two).

**What each level draws** (`src/client/graphics.js`, `LEVEL_SETTINGS`), in the owner's words and the game's:

| | Low (older phones) | Medium (most phones) | High (good phones, laptops) | Ultra (gaming computers) |
|---|---|---|---|---|
| pictures (textures) | small: at most 512 across | at most 1024 | at most 2048 | as the device fetches them (a computer's up to 4096) |
| the sun's shadows | none: a soft patch under every person and vehicle | nearby: to 40 m from the player, a 1024 map | softer and further: to 62 m, 2048 on a computer (1024 on a phone) | as High |
| reflections | none | simple: the sky in glass and water | the sky in glass, water, metal and wet roads | as High |
| water | simple: no ripples, no sky | ripples | ripples and the sky | as High |
| how far one sees | a shorter view: the fog three quarters as far | as before | as before | as before |
| pixels drawn, at most, for each of the screen's | 1 | 1.25 | 1.5 | 2 |
| a computer's detail (reach, figures with limbs, grass, garden plants, showroom models) | its lowest step | its third | its second | its fullest |
| a phone's detail | its lowest step | its fullest (as phones were drawn before the levels) | its fullest | its fullest |

The device's kind does not change with the level: a phone or tablet still fetches the lighter copy of every picture and
model, so no level makes a phone hold a computer's pictures. A picture is made smaller, or larger again, from its own
file as the level changes (`glb.js`, `setPictureMost`: one at a time, its old copy let go from the graphics card first),
so lowering the level frees the card's memory at once. (The habitation's plants keep their pictures at every level: they
are let go from the card whenever their plants are out of sight.) The sun's shadows now fade out at the edge of their
reach instead of stopping at a line on the ground.

**Auto.** Starts a phone at Medium, a computer at Ultra (as each was drawn before the levels), Low where there is no
graphics card at all (the browser drawing in software) or a phone with little memory, High on a computer's integrated
graphics; or where it settled on this device last time (kept by the graphics card's name). While the town loads, a dozen
frames of it are drawn behind the loading card and timed (the silent test): slower than a thirtieth of a second, a level
lower, at most three times. Playing, the first half minute is judged quickly; a typical frame slower than a thirtieth of
a second for a few seconds steps down one level; ample room for a long while climbs back one (no higher than High on a
phone by itself). The graphics card nearly full (a phone at nine tenths of its 150 MB): first what is kept ready and not
drawn is let go (figures looked at on the character screen, motorcycles and cars out of sight); still nearly full, one
level down whatever was chosen, at most every ten seconds, and the level given up not tried again for three minutes,
then six, and so on (`monitor.js`, `lower`); the browser taking the picture away in the town steps Auto down one: the
picture is never lost to a level chosen automatically. The player is told the first time the game lowers the level by
itself, and only then: "Graphics lowered to keep the game smooth".

**Settings → Graphics**: Auto, Low, Medium, High, Ultra, a line for each, and "Higher levels use more battery, and can
make a phone warm." The #stats readout says the level, whether chosen or Auto ("Graphics: Medium, Auto"), the frames a
second, the pictures on the graphics card and the card's name.

**A phone at Medium, well under its 150 MB.** Measured before this work at the busiest places on a phone's settings, the
PowerBike showroom's pictures came to 143 MB at Medium (161 MB as phones were drawn until now, on 23 October), over the
memory guard's 135. Now at most 100 MB of pictures there at Medium, and 117 MB on the card in all with its drawing
buffers (the levels' measurings below). What was done (each looked at in the before-and-after pictures, the same):
- the PowerBike showroom's nine posters of its bikes, seen through its glass from outside too, at half their size on a
  phone (320 across: 19 MB of a phone's 150 at full size);
- the car showroom's buildings drawn from 512 pictures by someone more than 150 m from them, as the town's towers already
  were (from PowerBike's showroom, 380 m off, its two tallest held 11 MB at 1024);
- the owner's two trucks and the ambulance drawn from 512 pictures by someone more than 60 m from them, at their own size
  again within 40 m (the jet's distances as much longer as it is): at 1024 the three were 16 MB wherever they were, and
  they are rarely nearer than a hundred metres (`render-supplied.js`; a picture's own largest, apart from the level's,
  made in its turn: `glb.js`, `wantPicture`);
- the signs and boards painted in the page (the shops' names, the rooms' boards over the doors, the plots' boards, the
  road signs, the vehicles' words: 181 pictures, 36 MB, of which 12 to 27 MB were for signs far out of sight, sent to
  the card ahead by the warm-up or drawn once and kept) let go from the card when nothing drawn has used them for half a
  minute, and handed to it again the next time one is drawn, in a fraction of a millisecond (`picture-keeper.js`; never
  a picture the game makes again from its file, nor the two halls' while one is outside, so that stepping in finds
  them there; the walk through the scene every five seconds takes under 2 ms on this machine);
- the town's coaches' and kekes' words, adverts and plates, and the watch shop's names, painted at half their size on a
  phone, as the town's other signs already were (17 MB and 4.6 MB at the motor park and the PowerBike showroom);
- the reflected sky made at 128 on a phone (256 on a computer).

**Measured, each level** (`tools/measure/places.mjs` with `PERF_LEVEL` 0 to 3 and `TEXTURE_LIST`: seven busy places by
day, each level held, the memory guard held off so that what a level holds is what is measured; a phone's settings at
3 pixels to each of the page's, a computer's at 1; `tools/measure/levels.py`: the levels side by side, a page a place,
the PDFs sent to the owner). Pictures on the graphics card, and all it holds with its drawing buffers, in MB; the
draws for the picture and for the sun's shadows:

On a phone's settings (3 pixels to each of the page's):

| place | Ultra | High | Medium | Low |
|---|---|---|---|---|
| motor park | 102 / 143 MB · 444 + 45 | 78 / 102 MB · 444 + 45 | 78 / 95 MB · 445 + 36 | 44 / 54 MB · 347 + 0 |
| market | 112 / 153 MB · 199 + 45 | 88 / 112 MB · 199 + 45 | 84 / 101 MB · 199 + 31 | 52 / 62 MB · 190 + 0 |
| PowerBike showroom | 134 / 175 MB · 357 + 63 | 104 / 128 MB · 357 + 63 | 100 / 117 MB · 357 + 41 | 66 / 77 MB · 293 + 0 |
| car showroom gate | 116 / 157 MB · 156 + 26 | 92 / 115 MB · 156 + 26 | 93 / 110 MB · 156 + 22 | 63 / 74 MB · 142 + 0 |
| town east end | 104 / 146 MB · 227 + 38 | 86 / 110 MB · 227 + 38 | 85 / 103 MB · 227 + 25 | 55 / 67 MB · 222 + 0 |
| habitation gate | 101 / 143 MB · 199 + 33 | 77 / 102 MB · 198 + 33 | 77 / 95 MB · 199 + 31 | 57 / 69 MB · 201 + 0 |
| lagoon beach | 90 / 132 MB · 151 + 26 | 66 / 90 MB · 150 + 25 | 68 / 85 MB · 152 + 27 | 54 / 66 MB · 155 + 0 |

On a computer's settings (1 pixel to each of the page's):

| place | Ultra | High | Medium | Low |
|---|---|---|---|---|
| motor park | 454 / 485 MB · 481 + 49 | 454 / 485 MB · 448 + 49 | 222 / 253 MB · 404 + 40 | 145 / 176 MB · 355 + 0 |
| market | 738 / 769 MB · 196 + 55 | 738 / 769 MB · 196 + 55 | 298 / 329 MB · 197 + 41 | 168 / 199 MB · 188 + 0 |
| PowerBike showroom | 784 / 815 MB · 390 + 71 | 784 / 815 MB · 369 + 71 | 328 / 359 MB · 334 + 49 | 199 / 230 MB · 305 + 0 |
| car showroom gate | 833 / 864 MB · 193 + 50 | 833 / 864 MB · 174 + 51 | 345 / 376 MB · 156 + 40 | 219 / 250 MB · 147 + 0 |
| town east end | 894 / 941 MB · 252 + 62 | 896 / 943 MB · 252 + 62 | 406 / 453 MB · 252 + 42 | 283 / 330 MB · 249 + 0 |
| habitation gate | 861 / 908 MB · 227 + 66 | 861 / 908 MB · 228 + 67 | 421 / 468 MB · 228 + 59 | 313 / 360 MB · 229 + 0 |
| lagoon beach | 745 / 792 MB · 145 + 14 | 743 / 790 MB · 147 + 16 | 367 / 414 MB · 147 + 15 | 281 / 328 MB · 159 + 0 |

What the numbers say:
- **A phone at Medium** (where Auto starts a phone) holds at most 100 MB of pictures and 117 MB in all, at the PowerBike
  showroom: under the 150 MB a phone keeps to, and under the memory guard's 135, with room for what comes and goes
  (other players, their vehicles, the habitation's models). As phones were drawn until now (23 October), the same place
  held 161 MB of pictures. **At High**, a phone's ceiling for Auto, at most 104 and 128 MB. **At Ultra** a phone would
  hold up to 134 MB of pictures and 175 MB in all (its 2048 shadow map is 32 MB, and 2 pixels to each of the screen's
  are 40 MB of drawing buffers on a phone's screen): more than a phone should, which is why Auto never chooses it on a
  phone, and why the memory guard steps a phone down from it if the player does. **At Low**, at most 66 and 77 MB.
- **A computer**: Ultra as computers were drawn until now (the before-and-after pictures the same; the PowerBike
  showroom 787 MB on the card, 778 before). High holds as much as Ultra at these places: the town's pictures come to a
  computer at 2048 at most, High's own largest; it draws a little less (the computer's second step of detail) and, on
  a screen with more pixels than the page has, 1.5 to each instead of 2. Medium about half of Ultra's memory (1024
  pictures), Low about a third.
- The draws: the picture's are the same at every level but Low and a computer's lower steps of detail (fewer models
  and grass far off); the sun's shadows' fewer at Medium (40 m) and none at Low. The frames on this machine (no graphics
  card: everything drawn in software, a frame every one to three seconds) are only good for comparing the levels with
  each other: at the PowerBike showroom a frame at Low took 40% less time than at Ultra on a computer's settings, 60%
  less on a phone's. The frames a second on a real phone or computer are what #stats shows there, and Auto lowers the
  level by itself where they fall under thirty.
- Loading: PLAY at 1.8 to 2.2 s on a phone's settings at every level and 1.4 to 1.5 s on a computer's (2.2 and 1.5 s on
  23 October); into the town 23 to 27 s and 18 to 20 s on this machine.

**Found and fixed while testing**: the build (`build.mjs`) turns each module into a function that gives back what it
exports, and gave only the first name of `export const ULTRA = 0, HIGH = 1, MEDIUM = 2, LOW = 3`: in the built game,
and only there, Low, Medium and High were undefined, so the silent test, the memory guard and the step down after a
lost picture never fired (the headless tests, which read the modules as they are, could not see it). One name to each
export now; and the build refuses an import its module does not give.

Files: `src/client/graphics.js`, `monitor.js` (the governor's ceiling, its quick first judgement, `lower`), `glb.js`
(pictures by level and by their own largest, `pictureState`), `picture-keeper.js`, `render-finish.js` (reflections and
water by level), `render-sky.js` (the shadows' reach and fade, the view), `soft-patch.js`, `vehicle-models.js` (the sky
as a cube, for a phone's roads; the vehicles' words at half size on a phone), `supplied-model.js`, `bike-model.js`,
`car-model.js`, `render-supplied.js`, `render-carshow.js`, `render-powerbike.js`, `render-holaris.js`,
`graphics-count.js` (`list`), `main.js`, `ui.js`, `stats.js`, `build.mjs`; `tools/measure/places.mjs` (PERF_LEVEL,
PERF_DPR, the page's own time a frame, what the card holds picture by picture and where each was made),
`tools/measure/levels.py` and `sheets.py`; tests `graphics.test.mjs`, `picture-sizes.test.mjs`,
`picture-keeper.test.mjs` and `graphics.mjs` (in a browser, a phone's settings and a computer's: 24 checks).

## More realism, by level (24 October 2026)

The owner's brief of 23 October, its third stage, and the seven cheap extras he asked for on 24 October ("add all you
listed"). Each is drawn at the levels the brief gives it, and costs nothing where it is not drawn:

| | Low | Medium | High | Ultra |
|---|---|---|---|---|
| colour grade for warm daylight, and a colour for each hour | yes | yes | yes | yes |
| soft darkening under people and vehicles (contact shadows) | yes | yes | yes | yes |
| less glitter on far metal and glass | yes | yes | yes | yes |
| light from the whole sky by the hour (warm round a low sun, cool round the moon) | | yes | yes | yes |
| softer sun shadows | 1.2 | 1.6 | 2.0 | 2.4 (texels) |
| glow round the brightest (the sun, lamps and windows, lit lamps of vehicles, glints) | | yes | yes, wider | yes, wider |
| haze in the distance, the clouds' shadows drifting, the mirage on hot tarmac | | yes | yes | yes |
| dust on dirt behind vehicles, motes in the sun | | yes | yes | yes |
| wet footprints and tyre marks after rain | | yes | yes | yes |
| fireflies at night in the habitation | | yes | yes | yes |
| soft darkening where things meet (corners, a wall's foot, under a car) | | | yes | yes |
| the river's waves and its foam at the bank | | | yes | yes |
| puddles after rain giving back the sky | | | yes | yes |
| the town given back by the river | | | yes (a third of the screen's size) | yes (half) |
| the sun's flare | | | | yes |

What each is, in short (the files say more):
- **The colour grade** (`grade.js`): three.js's own place for a game's tone mapping filled with the game's: the colours as
  chosen below a knee, a soft shoulder above it (a sunlit white wall or a windscreen's glare rolls off instead of going
  flat white), a white balance by the hour (warm by day, warmer and golden at sunrise and sunset, blue at dusk, cool
  under the moon), a touch more colour by day. Signs, lamps and what is drawn unlit keep their colours.
- **The light from the whole sky** (`sky-light.js`): the sky as the dome draws it, with the brighter, warmer sky round the
  sun (wide and golden when it is low) and round the moon, and the red earth's light from below, made into nine numbers
  every lit surface reads by the way it faces; scaled colour by colour so that the ground and the roofs are lit as they
  were tuned, the walls by the way each faces. Made again only when the hour or the weather moves on.
- **The air** (`world-shading.js`): a few lines written once into three.js's own shader pieces: the clouds' shadows (soft
  patches tens of metres across moving with the wind, where the sun shines through broken cloud), far gloss spread a
  little, the low haze (warm, thickening with distance near the ground, thinner out at the habitation), on tarmac the
  mirage between about half past ten and four on a hot dry day, and puddles where the water lies after rain. Each a
  number set each frame; none drawn where its number is 0.
- **The glow and the sun's flare** (`screen-glow.js`): the picture copied off the screen once drawn, its brightest parts
  gathered at a quarter of its width, blurred, and laid back over it; at night lamps and windows glow more. The flare:
  rings along the line from the sun through the middle of the picture, seen only as far as the sun itself is seen in the
  picture (behind a tower, none).
- **Dust, fireflies, wet marks** (`dust.js`, `fireflies.js`, `wet-tracks.js`): one set of points or marks each, drawn only
  while there is something of it to see. The dust comes from the back wheels of a vehicle going over the red earth on a
  dry day (not on tarmac, not while the ground is wet), more the faster it goes: carried a little way after it by the
  air it drags along, thrown out to the sides and up, then left drifting on the wind, each puff thinning away to
  nothing at the ground (drawn flat, facing the eye, the ground in front would otherwise cut it along a hard line).
- **The soft darkening where things meet** (`ambient-occlusion.js`): three.js r186's own GTAOPass, unchanged, in a script
  of its own (`three-post.min.js`, 32 KB) fetched only when High or Ultra is first chosen: from a half-size picture of
  the solid surfaces within 120 m (glass, water, leaves and the sky are not in it).
- **The river** (`river-water.js`): a second set of ripples across the first and a broad swell, foam where it laps at
  the town's bank; and the town given back by the water, drawn upside down before the picture (at half the screen's
  size at Ultra, a third at High), only when the river is in sight.
- **Contact shadows**: the soft patch under each vehicle at every level (as dark as before without sun shadows, lighter
  with them), and the figures' own a little darker.

**Measured** (24 October 2026, on this machine, which draws in software; each measuring alone on it):
- **A phone at Medium** (the screen 2532 × 1170, three of its pixels to each of the page's), at the seven places by day
  and by night (`tools/measure/places.mjs`): the fullest, the PowerBike showroom, holds 124.4 MB on the graphics card
  with the screen's own (108.7 MB of pictures and buffers), of its 150 MB; before stage 3, measured the same way,
  124.8 MB. The glow's own pictures are 2.3 MB there; everything else of stage 3 at Medium is numbers in the shaders and
  a few points. At High (the soft darkening, the wider glow, puddles, the river's waves, foam and mirror added), the
  PowerBike showroom by day from a fresh start: 115.4 MB with the screen's own. All of stage 3's pictures are counted
  with the rest, so the memory guard (a phone at 135 MB) sees them.
- **A computer at Ultra** (1280 × 720): the glow's pictures 4.3 MB, the soft darkening's 6.5 MB (half the screen's
  size, in half floats), the river's mirror 2.8 MB while the river is in sight.
- **Download**: the page and the scripts a first visit fetches, 977 KB → 998 KB as sent (+21 KB, 2%); the soft
  darkening's own script, 8.4 KB as sent, only at High and Ultra. The owner's models, pictures and sounds: not one byte changed.
- **Loading** (a phone's settings, the processor slowed four times as `places.mjs` does, two runs of each in turn, alone):
  PLAY 2.2 → 2.3 s; the character screen 3.8 → 4.0 s; into the town 28.2 → 35.3 s (26.2 and 30.1 → 35.3 and 35.2).
  What grew is the shader programs prepared behind the loading card: 82 → 99 (the dust's, the fireflies', the wet
  marks', the glow's), and those of every lit surface a little longer. Drawing in software, as here, makes preparing
  them far slower than a phone's graphics chip does; on his phone it is to be seen.
- **Frame rates**: not measured here (no graphics card). Drawn in software, a frame took a median 18% longer than
  before at the seven places (5% to 37%): software makes every pixel's sums dear, where a phone's graphics chip does
  them side by side, so this says only that the work grew, not what a phone makes of it. On his phones: #stats at the
  PowerBike showroom at Medium; Auto takes the level down by itself where the frames fall under thirty a second.

Its pictures, each where it shows (the hours at the motor park, the clouds from above, the mirage on Waterside Road, a
keke driven for real on Yard Lane, after rain, the river bank, sunrise over the river, the lagoon at night):
`PERF_LEVEL=2 PERF_DPR=3 ../server/with-postgres.sh node tools/measure/realism.mjs <out> phone [scenes] [site folder]`
(a computer's: `computer`, `PERF_LEVEL=0 PERF_DPR=1`), and two sets side by side, a page a scene, with
`python3 tools/measure/realism-sheets.py <before> <after> <out.pdf> [title] [before's name] [after's name]`.

## Guns, stage 1: the rifle (25 October 2026)

The owner's briefs of 22 October (stage 1 of the plan for guns, health, ambulances and the stars) and 25 October (the
shooting screen, with his recording of the view he wants), and his answers of 25 October: the view over the shoulder
in a fight, through the gun's own sight to aim, the camera button the whole figure for five seconds; the buttons ash
grey as they are; the rifle free for everyone, the shop ready for more; the rounds topped up free each game day.

**The rifle.** His model (`assets/weapons/rifle/futuristicrifle3dmodel.glb`, byte for byte as he sent it) and his four
recordings (`assets/weapons/rifle/sound/`). Everyone has it from the start, free, never sold and never paid for; 30 in
it and 120 spare, topped up free once a game day; kept by the account on the website's server (another device has the
same rounds). A computer is sent his file as it is (its pictures are 2048 already); a phone a copy with its pictures at
1024 (3.4 MB, not 8.3: `tools/models/lighter.py`), nothing else changed. Taken out with X, or Gun on a phone's screen;
put away with X again, or Put away.

**The shooting screen** (`gun-hud.js`): the aim in the middle of the picture, where the rounds go (a ring broken in four
that opens as the aim is less steady, on the move or firing): white over nothing in particular, red over someone who
can be shot (their name and life over it), green over someone who cannot (anyone at 20), yellow over something that can
be used; through the sight, the sight's red dot. A small cross where the rounds would stop short (a corner beside the
muzzle). The gun at the top right in the purse's place: its picture (his model from the side), its name, the rounds in
it and spare ("30 / 120"), a bar while reloading, "Reload" or "No rounds" when empty; pressed, the guns panel. Life at
the foot, in the middle: a heart, the number, a bar green to orange to red. The radar stays at the top left. Nothing
else is left to press: on a phone, Shoot (the large button, held; dragged, it aims as it fires), Aim, Reload, Crouch,
Jump, Guns (or what can be used where the player stands), the view, Put away, and the stick; ash grey, green while
pressed, greyed when they cannot be used (Reload with the gun full). On a computer: F or the mouse's left button
shoots, Q or the right button aims through the sight, R reloads, C crouches, Space jumps, G the guns, V the view, X puts
it away; the mouse turns the aim once the picture is clicked (the pointer kept in the picture until Escape). The phone,
chat and the quiet hints go while the gun is out; the keys written at the foot go while aiming through the sight.

**The camera** (`camera.js`): over the right shoulder, close, the figure at the left of the picture and the aim in the
middle; the figure turned to face the aim and walking, strafing and stepping back without turning from it. Aim: the eye
moves onto the gun's own sight line, through its ring (its glass made clear in the page, the file untouched), the view
narrowing to 32 degrees, the player's own head out of the way. The view button (V): the whole figure and round it for
five seconds by the game's clock, then back; pressed again, back at once (with something behind nearer than it would
stand, it rises and looks down over it rather than coming in close). It never moves the player, the aim or where the
rounds come from.

**The body** (`gun-pose.js`): the butt at the shoulder, the right hand on the grip with a finger by the trigger, the
left on the handguard; the arms reach for the gun (each figure's own bones), the head and the spine follow the aim, the
cheek on the stock through the sight; the gun kicks back and climbs with each round and settles; crouched, the knees
bend to the ground. A reload as a reload is done: the magazine pulled and dropped (it falls and lies a while), the hand
to the pouch, the new one in, the handle pulled. None of the figures' files has such moves, so they are made from each
figure's bones.

**A round** (`gun-play.js`, `src/sim/guns.js`): 850 a minute held on the trigger (as his recordings fire), from the
gun's own muzzle to the first thing in its way along the aim (a wall, the ground, a vehicle, someone), spread by how
steady the aim is (least through the sight and crouched, most on the move). Seen: the flash at the muzzle (with its
light on what is round it, on a computer), a streak, smoke, a case thrown out of the gun's side, and where it strikes:
dust and grit, sparks off metal, blood off someone. Heard (`gun-audio.js`): his recordings, each cut into its single
rounds (8 to 13 in each, found by the page), one round for each round fired, never the same take twice running, the
burst's end ringing out; others' from where they are, duller and later with distance (sound's own speed), with a short
echo in the street, heard to 400 m. The empty click, the reload's sounds and the strikes are made in the page (no
recordings of them were sent).

**Reloading**: R, or by itself when the trigger is pulled on an empty gun with rounds spare. 2.4 seconds; nothing fired
during it; the rounds moved into the gun only when it is done; putting the gun away stops it and moves nothing. The
server is told of a reload once it is done, with the rounds and in its place among them (after the last round fired
before it), so that it counts the rounds and the reload in the order they were done however late a word comes; the
rounds after it are held to its time.

**Two players** (`gun-net.js`, `api/_lib/guns.js`): each round a player's game fires is told to the website's server with
its next word about where the player is (a moment later, or at once while rounds are waiting; on a slow connection the
same rounds again until they are answered, for up to two minutes, the server counting each once), and the server counts it:
only a gun the account owns and has in its hands, never more rounds than are in it, never faster than the gun fires
(by the game's own clock and over the last seconds), never while reloading or from a vehicle, the water or the hands of
the police. A round this game saw strike another player is claimed, and the server decides: someone who may be shot
(their own game says above 20, on their feet, on no vehicle, not in the water or held), near where their game last said
they were, at the height of a body above their ground, along the round's way within the gun's range, and with no wall of
the town between. Agreed, it is kept for them until their game says it has taken it (each once: never twice, never
lost); one life point a hit. Refused, the shooter's game is told why (and nothing happens to anyone). The shooter sees
each agreed hit as a mark round the aim; the one hit sees where it came from at the edge of the aim, blood on their
screen, the stain on their clothes, as everyone sees it; everyone near sees and hears the rounds.

**The 20-life rule** (`src/sim/conflict.js`, `care.js`): shot down to 20 and no lower. At 20 the gun is put away and cannot
be taken out, they cannot fight, nobody's rounds strike them (they go past), the aim over them is green; they limp; "You
are badly hurt. An ambulance is on its way." The police stop.

**Blood** (`blood-screen.js`, `wound-paint.js`, `gun-fx.js`): on the screen of the one hit only: a splash and a red edge
for a hit, more with each as the health falls, at its most at 20; it fades as they heal and is gone at 100. It never
changes the aim, the health or anything else. On the clothes: painted on the figure where it was hit (moving with the
body, seen by everyone), gone as they heal. In the town: a spray where a round strikes someone, drops on the ground that
fade. Settings → Effects → Reduce intense effects: no splashes on the screen, its edge fainter, less blood in the town;
where a round came from still shown.

**The police** shoot back at whoever shoots at them or near them (short bursts while they can see them; more likely to
hit close by, less at a run or crouched): their rifles up, aimed, their rounds seen and heard. Shooting another player
is an offence: the one shot reports it (and an officer near enough sees it), and the police come. The rest of the police's
rules come with the stars.

**What the server cannot check**: a player's own word on where they stand, their health and their ground (as for
everything else of theirs it hears); the police are each player's own town's. Another player's rounds are seen and
heard from what their game tells the website, each for three seconds after it is fired: where the words take longer
than that to come round (a very slow connection, or this test machine with two pages drawn in software beside the
website's server), the others may not see or hear them; the server still counts every round and decides every hit.

**Measured**: a phone at Medium (Auto's choice on a phone), the gun out: at the PowerBike showroom (the busiest place)
@@MEM1@@ MB on the graphics card, at the motor park with the gun fired @@MEM2@@ MB (under 150 MB). The rifle on a computer:
one model, 8.3 MB fetched once; on a phone 3.4 MB; the recordings 0.8 MB.

Files: `src/client/gun-play.js` (the gun in the player's hands and others'), `gun-model.js`, `gun-pose.js`,
`gun-fx.js`, `gun-audio.js`, `gun-hud.js`, `blood-screen.js`, `wound-paint.js`, `gun-sound-files.js`, `camera.js`
(the views), `main.js` (the controls, the keys, the mouse), `controls.js` and `action-button.js` (Shoot dragged),
`icons.js`, `template.html`; `src/net/gun-net.js`, `link.js` (what the others are told: `gn`, `sh`, `wd`, `hp`, `gy`),
`online.js`; `src/sim/guns.js`, `conflict.js`, `care.js`, `impact.js`, `justice.js`, `talk.js`, `sim.js`; `api/_lib/guns.js`,
`guns-data.json`, `walls.json` (made by `node tools/guns/server-data.mjs` from the game's own), `world.js`,
`schema.js` (migration 15), `api/game.js`. Tests: `test/guns.test.mjs` (12), `test/gun-client.test.mjs` (7),
`server/test/guns.test.mjs` (11), and in a browser `test/guns.mjs` (two players, the owner's tests A to G).

## Tests

```
node --test test/*.test.mjs                        # 483 headless tests
../server/with-postgres.sh node --test --test-concurrency=1 ../server/test/*.test.mjs    # the server: 103 tests against a real PostgreSQL (accounts, the market and its cars, the bank with starter and earned TR, the character and its upgrade, play, the guns, and two steps from older tables to the newest)
../server/with-postgres.sh node ../server/test/site.mjs out/         # the whole site in real browsers: the account before play, the one question and the one character, starter TR refused for assets and transfers, the market, a deal, a transfer in the Wallet, a second device, the character upgrade, logging out, erasing
../server/with-postgres.sh node test/fit.mjs out/                    # every screen at thirteen sizes, upright and sideways, turned without reloading: nothing cut off, nothing out of reach
../server/with-postgres.sh node test/guns.mjs out/                   # the guns, two players (a computer and a phone) through the website: the rifle free and kept by the account, the shooting screen and its buttons and keys, the rounds to the aim from the muzzle and through the sight, the owner's recordings, empty and reloading, the view from further back, one shooting the other (each hit agreed by the server and taken once), a wall, a game changed to cheat refused, the 20-life rule, the blood on the screen and healing, the phone's memory with the gun out
../server/with-postgres.sh node ../server/dev.mjs                    # the whole site on this machine: http://localhost:8787/
node build.mjs                                     # writes dist/index.html, dist/local.html, the character lab, the vehicle yard and dist/site/
node build.mjs --site                              # the same, then makes site/ (what the host serves) the same as dist/site/
../server/with-postgres.sh node test/webapp.mjs out/   # the website as an app: serves dist/site/, checks it can be installed, takes the network away and plays
node test/play.mjs out/                            # plays the built page in headless Chromium (needs Playwright)
node test/play.mjs out/ town                       # one session: opening, desktop, town, phone, action, sideways or upright
node test/touch.mjs                                # real touch input: Run, the stick, Block, every change of buttons
node test/hold.mjs                                 # the handset in the hand, measured on both figures
node test/sound.mjs                                # how loud each group of sounds is
../server/with-postgres.sh node test/habitation.mjs out/   # the habitation, two players: the first sign and the gate past it, the bridge stop, walking freely (off the paths, across the bridges, stopped at a big tree's roots), the models, fish, birds seen flying over and heard, sounds, the boiling river (its steam, its sound, its signs, stopped at its edge, no Swim), night, the torch, each picture's view, what it costs on a computer and on a phone; feet on a phone's sandy bank, legs seen in the shallows, deep water stopped at and told, a bridge's rail, the waterfall's stairs walked down and climbed, a jump seen by the other player
node test/figures.mjs out/                         # every supplied figure: chosen in its list, standing, walking, running, struck, knocked down, the phone
../server/with-postgres.sh node test/showroom.mjs out/   # PostCivilWar PowerBike: the tower and its signs, the one column, in and out, the bikes, the salesman, asking and buying, a phone's screen, a second player
../server/with-postgres.sh node test/seats.mjs out/      # at the wheel and on the bars: bought with arrival money, the driver seen with both hands on the rim, turning it; the phone in the right hand at the wheel and the left on a motorcycle, the vehicle still driven; the graphics lost and nothing reloaded
../server/with-postgres.sh node test/vehicle-sync.mjs out/   # two players: a keke (the okadas, while the town has them), another's motorcycle with its bars turned and the phone in the left hand, another at the wheel of an open car with the phone in the right, a closed car not seen through, more motorcycles than are drawn as models standing in as their pictures, each with its rider
../server/with-postgres.sh node test/falls.mjs out/          # riding (a road, the runway, the grass by the purple tower where the owner's rider came off), a roadblock met slowly and at 50 km/h, thrown over it and getting up (watched in slow motion), knocked down three ways, the street camera and its views
../server/with-postgres.sh node test/falls-sync.mjs out/     # two players: one thrown at a roadblock, the other watching: the fall, the lying and the getting up, once, where it happened; the motorcycle going down
../server/with-postgres.sh node test/exit.mjs out/          # Exit game and Restart game from the phone's Settings: asked first, saved with the account, the start screen and Play, back where they were on another device, a new journey with the TR kept
node test/camera.mjs out/                          # the street camera through the owner's list: standing, walking, toward it, turning, running, the View button, dragging, a wall behind at four distances, another player, a phone upright and sideways; framed as in his recording
../server/with-postgres.sh node test/motorcycles.mjs out/    # the seventeen motorcycles: the showroom, the engines, bought with arrival money, ridden (seat, grips, pegs, lean, the wheels), every one in turn, another player on theirs
node test/city.mjs out/                            # the first city block, walked and seen from the road, the junction, above and at night
../server/with-postgres.sh node test/adverts.mjs out/        # the billboards and the ADS app: booked, approved, shown
../server/with-postgres.sh node test/carshow.mjs out/    # the Post Civil War Car Showroom: the compound, the gate, the cameras, in and out by the doors, the cars, Tochi and Oluchi, asking and buying with earned TR, driving (the engine, the speedometer, steering, the brake, the gate, getting out), the lamps at night, another player's car
node test/bike.mjs out/                            # the power bike's controls and engines (with nothing to ride yet)
node test/outskirts.mjs out/                       # the road to Onitsha, the airport and the bridge, walked
../server/with-postgres.sh node test/supplied.mjs out/   # the owner's vehicles: each at its place, fetched near it, solid; the ambulance on a call, its lamps
../server/with-postgres.sh node test/town-buildings.mjs out/   # the owner's houses and towers: every model whole, each on its plot at its size, drawn near, solid; the hotel's facade
../server/with-postgres.sh node test/realism.mjs out/   # the leaves, the wind, their shadows; glass and the river giving back the sky, not at night; rain on the roads, and drying
node test/look.mjs out/                            # close-up shots of people, vehicles and buildings
../server/with-postgres.sh node tools/measure/places.mjs out/ computer|phone [all|place,place] [site]   # the fifteen usual places, the character screen and the habitation, by day and night: frame time, draws, triangles, the graphics card's memory, the script's, loading times, pictures (a phone: its settings, the processor slowed four times); site: another build's dist/site to measure instead; PERF_LEVEL=n holds a graphics level, PERF_DAY_ONLY=1 by day only, TEXTURE_LIST=1 lists the pictures held by size, TEXTURE_TRACE=1 with where in the game's code each was made; PERF_DPR sets the screen's pixels to each of the page's (a phone's 3)
python3 tools/measure/sheets.py before/ after/ computer|phone out.pdf [title] [before's name] [after's name]   # two measurings' pictures side by side, a page a place, the numbers under each
../server/with-postgres.sh node test/graphics.mjs out/   # the graphics levels, on a phone's settings and a computer's: Auto's first choice and the level kept for the device, Settings → Graphics, every level made at once without reloading, stage 3 at each level with the town drawn (the light from the whole sky, the air, the glow, the soft darkening fetched and drawn at High and Ultra, the river; each let go at a level without it), memory freed when lowering and given back when raising, Auto lowering by itself for slow frames and for a full graphics card and saying so once, #stats; on a phone, the owner's box truck at 512 far off and at its own size near, and signs out of sight let go from the card and handed back as painted
python3 tools/measure/levels.py <folder> phone|computer out.pdf [title]   # the graphics levels side by side (PERF_LEVEL=0..3 measurings, the folder holding <device>-0 .. <device>-3), a page a place, with their numbers, and the same as a table (out.md)
```

`engine.test.mjs` covers the 3D engine: that the library is r186 and holds every name the game, its tests and its
tools use; a colour meaning what it is written as; a surface's light, the order of see-through things, a solid
surface's alpha and see-through things drawn once, as r128 had them (each change found once in the library as made);
every piece of three.js's shaders that the game changes still there, and none of r128's removed names left; the sun,
the sky and the lamps in physical units, the lamps lighting the ground as they did; a picture counted once on the
graphics card; and every page loading the library from beside it, never from elsewhere.

`graphics.test.mjs` covers the graphics levels without a graphics card: four levels with a line each and the owner's
words; each level drawing less than the one above it; the graphics card nearly full lowering the level (a phone at
nine tenths of its 150 MB); Auto's first level by the device and its graphics card, and the level kept for the same
card and not for another; stepping down under thirty frames a second and climbing back no higher than its ceiling (a
phone no higher than High); a level given up for a full card not climbed back to for a while, longer each time; the
first seconds in the town judged quickly; and the sun's shadows fading out at the edge of their reach. `picture-sizes.test.mjs` covers the pictures made again at another size: lowering the level makes every larger
one again at its largest, one at a time, its old copy let go first; raising it makes them larger again; a picture's own
largest (a far-off truck's) and the level's together, the smaller of the two; a change undone before its turn not
made at all. `picture-keeper.test.mjs` covers a phone letting go of pictures painted in the page that nothing drawn
has used for half a minute: which are let go (out of sight, in a hidden group), which are kept (in sight, shared with
something in sight, made again from a file, in a hall kept ready, no longer held by the page), and when.

`gait.test.mjs` covers walking and running without drawing anything: that a
planted foot stays put, that the leg found really reaches it, that a knee
only bends one way, that nothing jumps between frames, that a walk has both
feet down and a run has neither, and that a wrapper shortens the step.
`intro.test.mjs` covers the opening's timing, that the splash has no button
and the slides are gone, where the cover's pieces go on twenty screen sizes
(the whole name, both figures and PLAY in view, PLAY big enough to press),
the font, and that the answer is kept by the simulation and changes nothing
it decides. The `opening` session of `play.mjs` walks the opening itself in a
browser: the splash's second or so, the cover, its PLAY, the sound button and that it
is remembered, the question with neither answer marked, the sound, the
answer on the phone, and a returning player who is not asked again. It then
opens the page at five more sizes (a small phone, a tall one, a phone on its
side, a tablet upright and on its side) and checks the cover and the
question at each.

`words.test.mjs` holds the owner's own words letter for letter: the three
paragraphs of About, the two questions asked before logging out and erasing,
the answer for a username nobody has; and that nothing names the game
anything else or offers to add funds.

`map.test.mjs` covers the way by road: that it follows the road network,
begins where the player is and ends at the door.

`server/test/wallet.test.mjs` covers the bank: one wallet and one arrival
grant per account; sending and every refusal (nobody, oneself, nothing,
less than nothing, a quarter, more than there is); the same key twice;
twenty sends at once from a wallet that can afford thirteen; players
sending to each other in a ring at the same moment; that history cannot be edited; that a
movement that does not balance is refused by the database; beneficiaries;
the allowance on town earnings; and an audit of every wallet against its
entries. `migrate.test.mjs` takes a database as it is live today, with
players and a sale in it, through the step to the bank.

`impact.test.mjs` covers bodies and vehicles: that players block each other
and cannot be passed through or pinned; harm by speed; knockdown and getting
up; that no request can hit, kill or revive; one blow per pass; death and
coming round at the hospital with the purse unchanged; saving while down;
who is shown whose health; townspeople stepping aside, being hurt and never
killed; and that the police hear of it only from someone who saw.

`justice.test.mjs`, `care.test.mjs` and `phone.test.mjs` cover fighting, the
law, treatment, the phone and taking vehicles, by sending the requests a
client sends. `client.test.mjs` covers the frame monitor, the detail governor
and the camera.

`webapp.test.mjs` covers the website as an app: the manifest and that every
icon it lists is there at the size it says; the document's head; that
installing is offered only where it is true; the worker, run against a
pretend network and a pretend store (what it keeps, what it gives back with
no connection, that the page is the newest when there is a connection, that
a slow network does not hold the game up, that a changed file is fetched
again and an unchanged one is not, that an error page is never kept, and
that it asks for a file the way the page does, so that a first visit fetches
nothing twice); and that `site/` is one build, its figures and the owner's
other models copies made from his files as they are. `webapp.mjs` does it in a
browser on a phone-sized screen: a first visit, what the browser says stands
in the way of installing (nothing), the Settings section, then no connection
at all: the opening, the town and the player's character all come back, and
nothing large is ever sent twice.

`originals.test.mjs` compares every one of the owner's 97 model files in
`assets/` with the MD5 it had when it was supplied, and checks that the copies
the website sends were made from them as they are. `site-budget.test.mjs`
holds `site/` to the owner's budget: each figure at most 3 MB to a phone and
6 MB to a computer, no figure's picture larger than the device draws it, no
picture of 8192 anywhere, the page small with the opening at its start.
`context.mjs` takes the page's drawing surface away in a browser (on the
character screen and in town) and gives it back, then leaves it away; and
`opening.mjs` measures the opening and the character screen on a slowed link
and processor (see "Characters in a flash").

`town.test.mjs` covers: the map and every door; the 1,000 people and their
roles; weekday, Saturday and Sunday routines; school, hospital, church and
business workers; conversations and their languages; translation; chat range
and visibility; two worlds joined by a transport, and what a hostile one can
send; okada riders, fares and a player's ride; saving and loading; levels of
detail and their cost; government notices.

`vehicles.test.mjs` covers: the supplied models' checksums; that the baked
vehicles have the masters' size, wheels and pivots at every level; what each
level costs; the catalogue of looks; that no parked vehicle stands in a
building, on a road, on a path or where people stand; that a keke's look
survives a save and is chosen at purchase; and that nothing in the client
still draws a keke or a bus by hand.

Not tested here, because it cannot be from a headless machine: frame rate on
a real phone or laptop, how the sound actually sounds, and two real devices
joined through a published page.

`vendor/three.min.js` is three.js r128, MIT licence (`vendor/THREE-LICENSE.txt`).
