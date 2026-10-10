# Test plan: fighting, crime, police, the phone, taking vehicles, health and the hospital

This is the plan for testing the gameplay added in October 2026, and a record of
which parts of it are already run by a machine and which still need a person with a
real device.

Three things are tested, in this order of importance:

1. **Money and authority.** Nothing a client sends can change a balance, a health
   figure, an arrest, a fine or a badge. Nothing is charged twice.
2. **The rules of play.** Fighting, the law, treatment and the phone behave as designed.
3. **The page.** The right buttons are on screen, nothing overlaps, frames are steady,
   the sound is not a wall of noise.

## How to run what is automated

```
cd prototype
node build.mjs

# 170 tests of the simulation and of the client's plain logic. No browser. About 30 s.
node --test test/*.test.mjs

# In a headless browser (Playwright with Chromium), against dist/local.html:
node test/touch.mjs                 # real touch input: Run, the stick, Block, the pedals, the buttons as pictures, the notice card
node test/sound.mjs                 # how loud each group of sounds is, measured
node test/play.mjs dist/shots       # seven played sessions with screenshots; about an hour in software rendering
node test/play.mjs dist/shots action   # one session: opening, desktop, town, phone, action, sideways, upright

cd ../services/ledger
./scripts/run-tests.sh              # 85 contract tests against a real PostgreSQL
```

`test/world.mjs` has the helpers the gameplay tests share: a funded town at ten in the
morning, someone standing in the open, a place away from the police.

The tests of the simulation send the same requests a client sends and read the same
answers. Where a test needs a player hurt or standing somewhere, the simulation is asked
to do it; no test writes a balance, an arrest or a role by hand.

## 1. Money and authority

| # | What must hold | Checked by | State |
| --- | --- | --- | --- |
| M1 | A fine, a hospital bill, an ambulance fee, stolen money and its return are each one ledger transaction: balanced, with payer, payee, amount, time, reason, initiator and the crime, arrest, quote or call it belongs to | `justice.test` "stolen money: taken by a ledger transaction…", `care.test` "payment: the quoted fee and no more…", ledger contract "every one of these payments carries who, what, when and why" | automated |
| M2 | A request sent twice is answered twice and done once: same request id, same idempotency key | `justice.test` "a request with an id is answered once, whatever it is for"; `care.test` "payment: … once and only once"; `play.mjs` action session sends the hospital payment twice | automated |
| M3 | The same thing cannot be paid for twice under a different key: one fine for an arrest, one bill for a quote, one fee for an ambulance call, one theft for a crime | `justice.test` "the ledger itself: one fine for an arrest…"; contract tests `PaidOnce` (including twenty payers at the same instant) | automated |
| M4 | A payment that fails changes nothing: no treatment, no release, no entry | `care.test` "payment refused: nothing is charged and nothing is treated"; contract "a fine that could not be paid can still be paid later" | automated |
| M5 | The fee charged is the fee quoted. A quote belongs to one patient, as they were, for three minutes | `care.test` "a quote is for one patient, as they were, for a little while" | automated |
| M6 | A fine after an arrest by a police officer goes to government in full. No player is paid | `justice.test` "a fine paid to an officer of the regular police goes to the government, once", "a friend pays the fine…; an arrest by the regular police pays no constable"; contract `Fines` | automated |
| M7 | A fine after an arrest by a player constable: one part in a hundred to government (rounded up, never nothing), the rest to that constable, in one transaction; any other split is refused by the ledger | `justice.test` "special constables…", "the ledger itself: a fine goes to government in full, or is split…"; contract `Fines` | automated |
| M8 | Stolen money is returned from what the culprit has, never more; the rest is owed; nothing is created | `justice.test` "stolen money that has been spent…"; contract "stolen money goes back to the victim and never exceeds what the culprit has" | automated |
| M9 | The client cannot set health, balance, arrest state, fine, role or the result of a blow | `justice.test` "health: … only the simulation says how hurt a player is", "a blow: reach, readiness and energy are the simulation's to judge", "special constables: the badge is given by the simulation…" | automated |
| M10 | A constable has the power of arrest and nothing else: no access to accounts, records, land or settings | `justice.test` "special constables…"; contract `Oversight` "the game service cannot change the rules…" | automated |
| M11 | The gameplay database role cannot edit the rules, the policy or the record of what was paid; nobody edits them in place | contract `Oversight` | automated |
| M12 | Closing the page and coming back: a prisoner is still held and owes the same fine once; someone wanted is still wanted; a fine, a constable's share and a treatment already paid are not paid, paid out or given again | `justice.test` "closing the page in the cell and coming back…", "coming back does not pay a constable twice, heal a patient twice or lift what someone is wanted for", "the ledger itself: what was paid once is still paid once after a save and a reload" | automated |
| M13 | After everything, the ledger reconciles and bitcoin reserves match | every gameplay test ends with `reconcile()`; `play.mjs` checks it at the end of each session | automated |

Not yet built, so not yet tested: a network service in front of the ledger. The contract
tests exercise the database directly, as the service roles.

## 2. Fighting and health

| # | What must hold | Checked by | State |
| --- | --- | --- | --- |
| F1 | A fight starts only by the player's choice, against someone grown and within reach; never a child, never a named resident | `justice.test` "fighting: who may be faced, from how far, and never a child" | automated |
| F2 | Punch, heavy punch, kick, shove, grab, block, dodge and stepping away each have a reach, a cost in energy and a time before the next | `justice.test` "a blow: reach, readiness and energy…", "blocking and stepping aside are judged by the simulation too" | automated |
| F3 | Townspeople prefer peace: struck once, most plead or run; struck again, someone with the nerve defends themselves, and stops when the attacker is badly hurt | `justice.test` "townspeople would rather not fight…", "struck again, someone with the nerve for it…" | automated |
| F4 | Someone who has had enough sits down and cannot be struck again | `justice.test` "someone who has had enough sits down…" | automated |
| F5 | At 20% health fighting stops at once and cannot be started; running stops too | `justice.test` "struck again, someone with the nerve for it…" (the player is beaten to critical and a new fight is refused); `play.mjs` action session | automated |
| F6 | Player against player: nobody is made to fight; a player cannot be taken below critical by another; the one who started it is the offender and pays compensation | `justice.test` "player against player…" | automated, in one simulation only |
| F7 | Health comes back slowly, not while badly hurt; a night at home helps | `care.test` "bruises mend slowly on their own…" | automated |
| F8 | The health bar appears when it matters; the other fighter's bar in a fight; CRITICAL HEALTH banner at 20% | `play.mjs` action, sideways and upright sessions | automated |
| F9 | Blows look and sound like blows; there is no gore | by eye and ear | **needs a person** |

## 3. Crime, witnesses, police, arrest

| # | What must hold | Checked by | State |
| --- | --- | --- | --- |
| P1 | An offence is recorded with culprit, victim, amount, place, time, witnesses and whether it is known | `justice.test` "an offence is recorded where and when it happened, with who saw it" | automated |
| P2 | Who sees an offence depends on distance, line of sight, how serious it was and who they are | same test; witness counts over many trials | automated |
| P3 | The police are told within seconds, come on foot from where they are, challenge, arrest and walk the culprit in. Nobody is moved by magic | `justice.test` "the police: told within seconds, they come on foot…" | automated |
| P4 | Running is its own offence; out of sight long enough, the chase is broken off | `justice.test` "running from the police is an offence of its own…" | automated |
| P5 | Held by the police: no walking off, fighting, shopping or taking vehicles; time served ends it | `justice.test` "held by the police…"; `play.mjs` action session | automated |
| P6 | The states are shown: watched, wanted, police in pursuit, under arrest, in custody, released | `play.mjs` action session screenshots | automated, checked by eye |
| P7 | A constable who is arrested loses the badge; one with a record is not taken on; four at most | `justice.test` "a constable who is arrested loses the badge…" | automated |
| P8 | A constable sets the fine within the limits of the scale, once; it cannot be changed after | `justice.test` "special constables…" | automated |
| P9 | Two real players, one a constable, on two devices | cannot be done yet: each page is its own town | **not possible until the shared world exists** |

## 4. Hospital, clinic, ambulance

| # | What must hold | Checked by | State |
| --- | --- | --- | --- |
| H1 | Treatment to 40, 60, 80 or 100%, each dearer; only levels above present health are offered | `care.test` "the General Hospital: a quote for each level…" | automated |
| H2 | The bill shows current health, treatment level, amount restored, fee, current balance and balance after payment, and the balance after is right | `play.mjs` action session | automated |
| H3 | Government hospital: fixed prices, no bargaining, paid to the State. Private clinic: the owner's prices, bargaining within limits, paid to the clinic | `care.test` "the private clinic…" | automated |
| H4 | The ambulance comes by road, carries the patient in, and is charged for once; free at critical health | `care.test` both ambulance tests | automated |
| H5 | The ambulance is seen arriving, the patient is seen getting in, and steps out at the hospital door | browser run, screenshots | checked by eye in this build |
| H6 | A player the police arrest while waiting for the ambulance: the ambulance turns back | browser run | observed; no automated test |

## 5. Taking a vehicle

| # | What must hold | Checked by | State |
| --- | --- | --- | --- |
| V1 | Take is offered only beside the rider or driver, never at the passenger's place, never for a locked or moving vehicle | `phone.test` "where to stand…"; `play.mjs` action session (behind and beside a motorcycle) | automated |
| V2 | It takes time and happens in steps: reach, pull the rider off, get on. It can be stopped | `phone.test` "a motorcycle: taken only from beside a rider who has stopped, in steps that take time…" | automated |
| V3 | It is an offence, and the rider is a witness | same | automated |
| V4 | A motorcycle left standing goes back to its rider; a keke goes back to its owner when the taker is arrested | `phone.test` "a motorcycle left standing is not lost…", "a keke: locked at night…" | automated |
| V5 | A motorcycle the player rides has its own controls and speed; a keke has its own | `play.mjs` action session; `test/touch.mjs` | automated |
| V6 | The sequence looks right from several angles | screenshots at slowed time | checked by eye in this build |

## 6. The phone

| # | What must hold | Checked by | State |
| --- | --- | --- | --- |
| T1 | Contacts: emergency numbers and businesses from the start; people as they are met; players by standing next to them | `phone.test` "contacts…" | automated |
| T2 | A call to the police files a report or gives the caller up; to the hospital, sends the ambulance | `phone.test` "calls…" | automated |
| T3 | Messages between players are cleaned, limited in length and kept | `phone.test` "messages go between players…" | automated, in one simulation only |
| T4 | The way to a place: along the paths, with distance and time; shown on the map; a marker in the town | `phone.test` "the way to a place…"; `play.mjs` sideways and upright sessions | automated |
| T5 | In custody the phone is the officer's to allow; then calls and three messages to people the prisoner knows | `phone.test` "from custody the phone is the officer's to allow…", "a constable decides…" | automated |
| T6 | A friend asked for help sees who, how much, where, how far and how long, and can pay only at the Police Post | `justice.test` "a friend pays the fine at the Police Post…"; `phone.test` | automated |
| T7 | A townsperson who knows the player may stand the fine; it is then a debt, and a second is refused while it is owed | `phone.test` "someone in town who knows the player…", "someone still owed money…" | automated |
| T8 | Every app opens and fits on a phone; tiles are at least 44 px | `play.mjs` desktop and phone sessions | automated |

## 7. Controls and the camera

| # | What must hold | Checked by | State |
| --- | --- | --- | --- |
| C1 | Only the buttons for what the player is doing are shown: walking, fighting, driving, on a motorcycle, a passenger, under arrest, being carried | `play.mjs` action, sideways, upright; `test/touch.mjs` | automated |
| C2 | Run: walk to run, run to walk, run to stop, run into a fight, a vehicle or a panel. It never stays stuck, with one finger or two | `test/touch.mjs` (19 checks with real touch events) | automated |
| C3 | Block is held, not switched | `test/touch.mjs` | automated |
| C4 | No button over another, none off the screen, none under 44 px, on a phone upright (390 by 800) and sideways (760 by 360) | `play.mjs` sideways and upright sessions | automated |
| C5 | The camera goes through five views on foot and five in a vehicle, glides between them, never stands inside a wall, stays below a low roof that someone is standing under, and sees with the player's eyes when pressed against a wall | `client.test` five camera tests; `play.mjs` action session | automated |
| C6 | Notches and rounded corners: the page uses the safe-area insets | by reading the styles | **needs real phones** |

## 8. Performance and sound

| # | What must hold | Checked by | State |
| --- | --- | --- | --- |
| R1 | Detail is lowered only when frames are slow for several seconds on end, a step at a time, and raised again when there is room. One hitch never changes it | `client.test` five governor tests | automated |
| R2 | Each frame is measured: what it was spent on, hitches over 50 ms, freezes over 250 ms. Shown in Settings | `client.test` "monitor…"; by eye | automated |
| R3 | No shader is compiled and no large mesh uploaded after Enter | scripted measurement in the browser (program counts before and after changing detail) | measured in this build; not in the play-through |
| R4 | The new systems cost little: fights, officers, the ambulance and the phone are ticked only while something is happening | simulation timing in Node, sixty ticks a second, 1,000 people | measured: 0.06 ms a tick with the town quiet, 0.14 ms during a fight with witnesses and officers running, 0.07 ms during an arrest; a view for one player 0.3 ms |
| R5 | Sound: six groups each with its own volume; music and background step back when something needs hearing; never more than a few one-shots at once | `test/sound.mjs` (measures levels per group) | automated |
| R6 | Frame rate on real phones and laptops | cannot be measured here: the test browser renders in software at one or two frames a second | **needs real devices** |
| R8 | A phone or tablet draws the lighter way (surfaces lit at their corners, no lamp lights, 1.5 pixels, a 1024 hard shadow, 14 full figures) and a desktop does not; `#lite` and `#full` force either | by measurement in the browser: same picture, about 14% less time a frame in software drawing, no errors, no extra shader programs | measured in this build; **the gain on a real phone is not known** |
| R9 | Nothing of the town is drawn behind the opening once it is warmed up | by reading `frame()` in `main.js`; the `opening` session passes with it | automated in part |
| R7 | How it sounds | by ear | **needs a person** |

## 9. The opening, the interface and movement (added with the rename to PostCivilWar)

| # | What must hold | Checked by | State |
| --- | --- | --- | --- |
| B1 | The page is titled PostCivilWar; the splash is black with a white mark and name, a yellow sun, the arcade font, postcivilwar.com | `play.mjs` session `opening` (reads the computed colours and the font) | automated |
| B2 | The splash holds for five seconds from first sight, showing loading marks and no button; then PLAY, and it goes no further alone | `intro.test`; `opening` (PLAY is not offered before 4.8 s; the stage is still the splash until it is pressed) | automated |
| B3 | Five slides, in the story's order, one after another, none skipped even on a slow device; one shutter sound each | `intro.test` "every picture gets its turn…"; `opening` (order, five shutters) | automated |
| B4 | A slide is fitted whole, never cropped; each has a description | `opening` (object-fit, alt) | automated |
| B5 | The question must be answered: nothing behind it can be reached | `opening` (what is under the pointer at Enter) | automated |
| B6 | Choosing makes a sound; a click, a tap, `H` or `V` answers | `opening` (a voice starts on the click); `intro.test` keys | automated; **how it sounds needs a person** |
| B7 | The answer is the simulation's: joined with the character, saved, shown on the phone | `intro.test` three tests; `opening` | automated |
| B8 | The answer changes nothing the town decides | `intro.test` "the answer changes nothing…" | automated |
| B9 | No sign-up or log-in button exists, and the start screen says there are no accounts | `opening` | automated |
| B10 | A returning player with a character is not asked again; Skip cuts the story short | `opening` (second load) | automated |
| B10a | Skip is writing with nothing behind it; there are no slide marks; nothing says "tap for sound" or "tap to begin" | `opening` (computed background and border; the text of the opening) | automated |
| B11 | No font or image is fetched: every request the page makes succeeds, offline | every `play.mjs` session fails on any failed request | automated |
| B12 | A planted foot stays put; the solved leg reaches it; knees bend one way; nothing jumps; walk and run are told apart by the feet | `gait.test` eleven tests | automated |
| B13 | How the walk and the run look | Character Lab (Walk, Jog, Run), by eye; strips of twelve frames were reviewed for the base character, a man in shorts and a woman in a wrapper | reviewed by eye here; **needs a person, in motion** |
| B14 | The interface is black and white; red only for danger; yellow only in the mark | by eye, from the play-through's screenshots at three sizes | reviewed by eye |
| B15 | The phone's own scroll position survives a redraw, and Settings' figures update without redrawing the screen | by eye in the browser | reviewed by eye |

## 10. The interface redesign and the multiplayer core (added 7 October 2026)

The redesign brief's own checklist, and Phase 2 of the multiplayer brief. Phase 1 is `docs/multiplayer-audit.md`.

| # | What must be true | How it is checked | State |
|---|---|---|---|
| U1 | POST CIVIL WAR is on one line, inside the screen, upright and sideways | `opening`: one line at 1280×760; and at 320×568, 390×844, 740×360, 820×1180 and 1180×820, one row of letters, 8 px clear of each edge, no scrolling | automated |
| U2 | The button says PLAY, is flat and has no outline | `opening` (label, border width) | automated; **how it looks: by eye** |
| U3 | postcivilwar.com is subordinate: under a third of the name's size | `opening` | automated |
| U4 | The loading indicator is the row of marks, not a bar | `opening` (thirty-two marks present); by eye | automated in part |
| U5 | A notice is small, dark, see-through, white writing, in the top third | `touch.mjs` (size, place, colours of an "Under arrest" card on a 390×800 screen) | automated |
| U6 | Every touch button is a picture with a spoken name and no written label, with no background until pressed, at least 44 px, on the screen | `touch.mjs`, walking and driving; `sideways` and `upright` sessions check that nothing overlaps or hangs off, in every mode | automated |
| U7 | Buttons are contextual: walking, fighting, driving, motorcycle, passenger, custody each have their own | `touch.mjs` (walking, a panel, driving, fighting); `sideways` and `upright` (every mode) | automated |
| U8 | At the wheel on a touch screen: an accelerator and a brake; holding the accelerator drives, letting go stops | `touch.mjs` | automated |
| U9 | Names: white writing, no card, only near, fading | by eye from screenshots (a townsperson at 1 m; a player at 6 m); the texture is transparent by construction (`nameTexture`) | reviewed by eye |
| U10 | The two answers are on one line, the same size, not tall, and neither looks chosen before one is | `opening`: at the five touch sizes, tops, heights and widths equal and under a fifth of the screen's height; at 1280×760, same fill and none focused or pressed | automated |
| U11 | The sound button is at the top left, shows on or off, is on for a first visit, and is remembered | `opening` (position; `aria-pressed`; the stored preference after each press; pressing it does not start the story) | automated |
| U12 | The flag is gone from every slide that had it; five slides still | `intro.test` (five slides); the two retouched pictures were compared with the supplied ones by eye at full size | reviewed by eye |
| U13 | Health bars are small and out of the way | by eye from the fight screenshots, upright and sideways | reviewed by eye |
| M1 | A player cannot walk into, or through, another player; nobody can be pinned | `impact.test`, three tests | automated, one simulation |
| M2 | A vehicle's occupant, a patient in the ambulance and the dead take up no room | `impact.test` | automated |
| M3 | A struck player loses health by the vehicle's speed, falls, lies, gets up and has control back | `impact.test`, two tests; staged in a browser with two players in one world (struck at 9 m/s: 100 → 49, "Knocked down", then walking) | automated; drawing reviewed by eye |
| M4 | No request can hit, hurt, kill or revive | `impact.test` "no client can say it happened" | automated |
| M5 | One pass is one blow; two vehicles at once are one blow; a blow on the ground counts less | `impact.test`, two tests | automated |
| M6 | Repeated blows kill at 0; the dead come round at the hospital, critical; the purse and the ledger are unchanged | `impact.test`, two tests; staged in a browser | automated |
| M7 | Down and dead survive a save and a reload | `impact.test` | automated |
| M8 | Another player's health is sent only to someone involved with them, and stops ten seconds after | `impact.test` | automated |
| M9 | Townspeople step aside for a horn; one who is struck is hurt and recovers; none is killed; a child is never struck | `impact.test`, three tests | automated |
| M10 | The police learn of a collision only from someone who saw it; a seen killing ends in arrest and the scale fine | `impact.test`, three tests | automated |
| M11 | Any of M1–M10 between two devices | **cannot be tested: there is no shared world.** A visitor from another page blocks the way and nothing more | not built |

## 11. Making a character from the supplied figures (added 8 October 2026)

| # | What must be true | How it is checked | State |
|---|---|---|---|
| C1 | (Superseded by H1.) Six women, each baked from its own supplied file, and one man used straight from his file; every file is unchanged | `figures.test` (ids, files, MD5 of each master; the man's 24 animations) | automated |
| C2 | Every figure is the supplied shape: nothing added; only what it held was taken out | `figures.test` (triangle counts against the supplied file and what was removed); the preview sheets of `tools/characters/figures.py --preview`, by eye | automated; fit reviewed by eye |
| C3 | Man shows the one man (arrows off); Woman shows six; the arrows go through all six in order; the switch sits above the figure | `play.mjs` session `creator`, at 1280×760 and 390×844 | automated |
| C4 | A flick or swipe does not change the figure; a drag turns it in 3D | `creator` (pointer gestures on the view) | automated; **how a finger feels needs a person** |
| C4a | The man lists every animation in his file by a one-word name; pressing one plays that animation in place, faded from the last | `figures.test` (labels one word, all different, no animation moves him across the ground); `creator` (Walk, Jump, Kick pressed and played) | automated; **smoothness needs a person** |
| C5 | Skin, top, bottom, hair and shoes each change only their own part | `creator` (every vertex's colour before and after, against the part it belongs to) | automated |
| C6 | The name starts as the figure's and is kept once typed | `creator` | automated |
| C7 | The story is the owner's (15 January 1970…); the prototype eyebrow is gone; the notes are still there | `creator` | automated |
| C8 | Enter: the town has the figure and colours chosen; after a reload, Continue brings them back | `creator`; `figures.test` (join, save, reload) | automated |
| C9 | Another player sees the figure; a bad figure or colour from another page is refused or replaced | `figures.test` | automated, two worlds in one process |
| C10 | The figures walk and run cleanly | by eye in a browser; the seated figure (F5) is the roughest | reviewed by eye; **needs a person** |

## 12. The town screen, money and the law, from the owner's notes (added 8 October 2026)

| # | What must be true | How it is checked | State |
|---|---|---|---|
| H1 | One woman (W1) and one man (M1), each from its supplied file, unchanged, every animation offered by one word and played in place | `figures.test`; `creator` (Dance, Box, Walk; Walk, Jump, Kick) | automated; **smoothness needs a person** |
| H2 | "Create your character" comes after the story, above the switch | `creator` | automated |
| H3 | Every character has 40 cowries (£20) once, on the ledger | `sim.test` | automated |
| H4 | Fines: about 0.5 cowries from the town's police; up to 1 from a player constable, up to 10 where someone died | `justice.test` | automated |
| H5 | The radar at the top left; a job taken on the phone becomes a route on it | `upright` (08-waypoint) | automated; by eye |
| H6 | Money, then time, day and weather at the top right; the life bar above it in a fight, green, orange, red from 20% | `upright` (03-fight); by eye | automated in part |
| H7 | Ringed buttons, black by day, white by night, none touching; no camera button on foot | `touch`; `upright` (clashes, no View on foot) | automated |
| H8 | The driver sits holding the bars or wheel | by eye in a browser | **needs a person** |
| H9 | Arrested by the police: handcuffs and ARRESTED for four seconds, a fade, then at the Police Post | `action`; by eye | automated in part |
| H10 | Never two speech bubbles on screen together; small names | `play.mjs` (bubbles shown at once) | automated |

## 13. From the owner's two recordings (added 8 October 2026)

| # | What must be true | How it is checked | State |
|---|---|---|---|
| R1 | The stick lets go when its finger comes up; the player never walks on alone | `touch` (the stick lets go on release and when the page loses it); window-wide backstops in controls.js | automated in part; **a phone with two thumbs needs a person** |
| R2 | The player is always drawn on foot; with something behind, the camera rises over it | `client.test` (camera tests) | automated |
| R3 | Map, life, money, time and place in one small band at the top, never under the stick or buttons, upright or sideways | `upright`, `sideways` (clashes) | automated; by eye |
| R4 | No step into a player, townsperson or resident; a step away is always allowed | `impact.test` | automated |
| R5 | A vehicle blow: the fall, blood that grows with each blow, a townsperson dying, lying, taken away; the driver charged | `impact.test` | automated; the look by eye |
| R6 | Townspeople react with the supplied animations; never a player | `justice.test` (kicked); photographs of the carried-over clips | automated; **how natural, needs a person** |
| R7 | Swimming: in at the bank, swim, nothing else in the water, out at the bank; two-hand controls | `sim.test` (swimming); browser run (swim.mjs) | automated |
| R8 | A phone does not go blurry to keep up | by eye on a real phone | **needs a person** |

## 14. Skills, the solid icons and the wheel (added 10 October 2026)

| # | What must be true | How it is checked | State |
|---|---|---|---|
| S1 | Skills at the middle of the right edge; the others and the stick there; no skills shown | skills.mjs at 390×844, 844×390, 820×1180, both figures | automated (browser) |
| S2 | Tap: page 1 of up to five, right buttons put away, stick stays, nothing overlapping | skills.mjs | automated |
| S3 | Each tap the next page; after the last, closed and the buttons back; reopening at page 1; 13 clips make 5, 5, 3 | `client.test`; skills.mjs | automated |
| S4 | A skill plays that clip on the player; when it ends the page stays open and the figure stands again | skills.mjs | automated |
| S5 | The stick moves the player with Skills open; walking off ends a skill | skills.mjs | automated |
| S6 | Rapid taps never leave two pages or hidden buttons | skills.mjs | automated |
| S7 | Run works before and after Skills | skills.mjs; `touch` | automated |
| S8 | A skill is seen by other players, hurts nobody, is no offence; not in a fight | `sim.test` | automated |
| S9 | At the wheel: steering wheel left; accelerator, brake, horn and the door right; no Skills | skills.mjs; `upright` | automated |
| S10 | Every button a solid icon on a dark disc | `touch`; the icon sheet by eye | automated in part |

## What a person should play through on a real device

Twenty minutes, on a phone and on a laptop:

0. Open the page fresh. Watch the splash and its loading marks, press PLAY, watch the
   five slides and listen for the shutter on each. Turn the phone on its side at each
   stage. Try the sound button at the top left, then reload: it should be as you left it. Answer the question both ways (erase
   the save in Settings to be asked again). Note whether five seconds and one second a
   slide feel right.

1. Walk, switch Run on and off, with one thumb and with two. Walk into a wall with the
   camera behind you.
2. Face someone at the market and fight. Watch what they do. Block, dodge, step away.
3. Keep fighting until the police come, or run from them. Be arrested, walked in, held.
   Ask for a call. Pay the fine, or sit it out.
4. Get hurt to critical (pick a fight with someone who fights back). Call the ambulance
   from the phone. Be treated to 60%, then to 100%. At the clinic, bargain.
5. Take a waiting motorcycle from beside its rider. Ride it. Change the view. Leave it.
6. Take an unlocked keke at the motor park by day.
7. Open every app on the phone. Mark the hospital on the map and walk to the marker.
8. In Settings, read the frame figures after ten minutes, and which way the town is
   being drawn. Move each sound fader.
9. Walk, jog and run in the open and through the evening market. Watch the feet, and
   whether the picture keeps up. Stop, start and turn about sharply.
10. Hire a keke. Drive with the pedals and the stick. Sound the horn in the market.
    Drive at someone. Note whether the buttons can be told apart without their names.

Write down: any moment the picture stops, any button that is hard to hit or covers
another, anything that is charged that should not be, anything too loud.

## Known gaps

- **Not built:** driving a coach, a car or a bicycle (there are no cars or bicycles in
  the town, and the coach is scenery); kekes and coaches moving in traffic, so there is
  never a driver to pull out of a keke; a clinic owned by a player; a shared world, so
  colliding, fighting, arresting, messaging and paying bail between two real devices;
  accounts; friend requests; calls that ring; money dropped by the dead (waiting on a
  rule from the owner: see `docs/multiplayer-audit.md`).
- **Deliberate, for now:** dying costs nothing; a vehicle cannot kill a townsperson.
- **Built and tested only inside one simulation:** everything between two players.
- **Not verified:** frame rate and touch feel on real hardware, including whether the
  lighter drawing cures the slow-down recorded on an Android phone; how the sound
  sounds; safe areas on real notched phones.
- **The opening has five slides of a story written for six**, and the rights in the
  photographs the slides were drawn from are for the owner to confirm.
- **The hero-or-villain answer does nothing yet** but stay with the character.
- **Known flaw:** a porch roof, such as the one over the hospital's emergency door, can
  still hide the player when the camera is side-on and above it. Sheds and market stalls
  are handled; porches are not.
- **The production ledger has no service in front of it.** The rules in migration 0003
  are tested against the database; the prototype's own ledger carries the same rules and
  is tested in JavaScript.
