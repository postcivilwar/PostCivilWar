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
   arrives a letter at a time on one line at every screen size. For five
   seconds, counted from when it first appears, a row of thirty-two marks
   lights in turn while the game gets ready. The mark and the name are white;
   the sun's disc is the one touch of yellow. **The splash has no button**:
   when the five seconds are over the cover takes its place by itself.
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
Then the name, Hero or Villain, and Enter. The choice is checked by the simulation, saved, and sent to
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
  camera button is offered only in a vehicle. The stick lets go whenever its finger leaves the glass, even
  if the phone's web view loses the release (it used to stick, and the player walked on alone).
- **The camera on foot** never goes inside the player's head: with a wall, a bus or a stall behind, it
  rises over it and looks down, and the player is always drawn (they used to vanish at the motor park).
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
  has changed. The two figures are 10 MB and 13 MB as text; only one a player
  has used is kept. The owner's GLB files are not touched by any of this: the
  text beside the page is those bytes, and a test compares them.
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

### Logging out, and erasing a saved game

Both ask first (`confirm.js`: a dialog with a title, what will happen, and two
buttons; Escape and Cancel change nothing; the keyboard stays inside it; it
is announced to a screen reader).

- **Log out**: "Log out of your account?" with Cancel and Log Out. Logging
  out sends the character to the account, ends the session on the server and
  clears this device.
- **Erase** (Settings, "Saved game"): "Erase your saved game?" with Cancel
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

## Tests

```
node --test test/*.test.mjs                        # 225 headless tests, in seventeen files
../server/with-postgres.sh node --test ../server/test/*.test.mjs    # the server: 51 tests against a real PostgreSQL (accounts, the market, the bank, play, and the step from the old tables to the new)
../server/with-postgres.sh node ../server/test/site.mjs out/         # the whole site in real browsers: the account before play, the market, a deal, a transfer in the Wallet, a second device, logging out, erasing
../server/with-postgres.sh node ../server/dev.mjs                    # the whole site on this machine: http://localhost:8787/
node build.mjs                                     # writes dist/index.html, dist/local.html, the character lab, the vehicle yard and dist/site/
node build.mjs --site                              # the same, then makes site/ (what the host serves) the same as dist/site/
node test/webapp.mjs out/                          # the website as an app: serves dist/site/, checks it can be installed, takes the network away and plays
node test/play.mjs out/                            # plays the built page in headless Chromium (needs Playwright)
node test/play.mjs out/ town                       # one session: opening, desktop, town, phone, action, sideways or upright
node test/touch.mjs                                # real touch input: Run, the stick, Block, every change of buttons
node test/hold.mjs                                 # the handset in the hand, measured on both figures
node test/sound.mjs                                # how loud each group of sounds is
node test/look.mjs out/                            # close-up shots of people, vehicles and buildings
```

`gait.test.mjs` covers walking and running without drawing anything: that a
planted foot stays put, that the leg found really reaches it, that a knee
only bends one way, that nothing jumps between frames, that a walk has both
feet down and a run has neither, and that a wrapper shortens the step.
`intro.test.mjs` covers the opening's timing, that the splash has no button
and the slides are gone, where the cover's pieces go on twenty screen sizes
(the whole name, both figures and PLAY in view, PLAY big enough to press),
the font, and that the answer is kept by the simulation and changes nothing
it decides. The `opening` session of `play.mjs` walks the opening itself in a
browser: the five seconds, the cover, its PLAY, the sound button and that it
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
again and an unchanged one is not, that an error page is never kept); and
that `site/` is one build, with the figures in it the owner's files byte for
byte. `webapp.mjs` does it in a browser on a phone-sized screen: a first
visit, what the browser says stands in the way of installing (nothing), the
Settings section, then no connection at all: the opening, the town and the
player's character all come back, and nothing large is ever sent twice.

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
