# The owner's supplied figures

`supplied/` holds the GLB files the owner made with Tripo and supplied on 8 October 2026, renamed from their
upload names and otherwise unchanged. `tools/characters/figures.py` reads them and never writes them; the
baked data records each file's MD5 and a test checks it.

| Id | File | Default name | Notes |
| --- | --- | --- | --- |
| F1 | fashionable_woman.glb | Adaeze | Hooded jacket and trousers. Held a handbag: removed. |
| F2 | fashion_model.glb | Chioma | Long coat and boots, walking, head turned. Made facing about 63° to her left; turned to face forward. |
| F3 | fashion_model2.glb | Ngozi | Shirt and trousers, hand at her collar. |
| F4 | gray_dress.glb | Amaka | Dress with wide sleeves. Held a rose: removed. Made facing about 135° away; turned. Her head is left turned as made. |
| F5 | fashion_model3.glb | Ifeoma | Made **seated**, legs crossed, a bag on her lap. The bag is cut out and the hole closed; she is stood up by her skeleton. The roughest of the six: see below. |
| F6 | female_character.glb | Nneka | Long dress, hands held together. Her arms keep their pose. |
| W1 | ../animated/woman.glb | Adaeze | **The woman, supplied 8 October 2026 with her own skeleton, texture and 40 animations.** Used byte for byte (MD5 86cbd1e74c05c1adc5abd7c9f7d4d0a6); replaces F1–F6. |
| M1 | ../animated/muscular_male.glb | Emeka | **The man, supplied 8 October 2026 with his own skeleton, texture and 24 animations.** Used byte for byte (MD5 36cc552a8a95352f60266797de804403); see below. |
| — | black_t-shirt_man.glb, tattooed_man.glb, realistic_human.glb | — | **No longer used** (were M2, M3, M5): replaced by M1 at the owner's request. Kept unchanged. |
| — | gray_jacket.glb | — | **Not used.** The figure ends at the thighs: there are no legs or feet to walk on. |
| — | tattooed_man1.glb | — | **Not used.** The figure ends at the thighs, and holds a machete and a bag. |
| — | fashion_model1.glb | — | **Not used.** The same file as fashion_model.glb, byte for byte. |

The default names are only where the name field starts; the player types their own. None were supplied.

## What the files are, and what that means

The supplied files are shapes only: one grey material, no textures, no texture coordinates, no skeleton.
So there is no supplied skin, hair or clothing colour to keep: every figure starts uncoloured and the
player chooses its colours, as the owner asked. Because nothing in the files says where skin ends and cloth
begins, `figure_fits.py` paints each figure into six parts by rules a person checked by eye (the hands and
face are skin, the head above the hairline is hair, below the knee on the foot bones is shoes, and so on).
The edges between parts follow the triangles, so they are jagged close up.

## How a figure becomes playable

`python3 tools/characters/figures.py [--only F1] [--preview DIR]` for each figure:

1. turns it to face forward if it was made facing another way;
2. takes out what it held (by boxes in `figure_fits.py`) and closes any hole a cut leaves;
3. fits the game's 22-bone skeleton to joints read off the figure by measurement;
4. weights the surface to the bones by distance over the surface; loose cloth (a coat, a dress) hangs from
   the hips; small loose pieces (a chain, an earring) hang whole from the body;
5. moves it bone by bone into the skeleton's ordinary standing pose, keeping its own proportions above the
   hips; the legs take the skeleton's length so the walk's planted feet stay planted. An arm whose hand rests
   on the body keeps its pose and stays still while walking;
6. writes it, with a light copy for distance, to `src/client/figure-data.js` (about 3 MB in the page).

`--preview` draws, for each figure, the supplied pose with the fitted skeleton, the figure standing painted
by part, the head close up, and which bone moves each part. Those sheets are how the fits were checked.

## The supplied animated figures (W1, M1)

The woman is handled exactly as the man below: 61 joints, 40 animations, drawn 1.70 m tall by one uniform
scale, `dist/woman.glb` and `dist/woman.b64.txt` beside the page. F1–F6 above are no longer offered; their files
and bake are kept unchanged.

### The man (M1)

`animated/muscular_male.glb` is not baked. The page reads it as it is (`src/client/glb.js`): one skinned mesh
(10,669 triangles), 61 joints, one texture, 24 animations, all in place. `dist/man.glb` is a byte copy
fetched beside the page, and `dist/man.b64.txt` the same bytes as base64 text for hosts that serve no
`.glb` (the published page uses this one); `dist/local.html` carries it inline. Nothing in the mesh, skeleton or animations is
changed. Two things are added around it, not to it:

- **Size.** The file is one unit tall; the town is in metres. The whole figure is drawn 1.80 m tall by one
  uniform scale on the group that holds it. Proportions, rig and animations are untouched.
- **Which clip plays in town.** Walking plays `walk.001`, running `run.001`, both sped to match the ground
  covered. The file has no idle clip, so standing plays `agree.001`. Fighting, sitting in a vehicle and
  lying down have no matching clip in the file; he keeps playing his current one.

The selection screen lists every animation by one word: Jump, Call, Wave, Turn, Lift, Walk, Pushups, Phone,
Run, Greet, Save, Shoot, Scared, Hello, Afraid, Surf, Kick, Stomp, Agree, Scratch, Hug, Bye, Swim, Hurt.
Where the file has two of a kind they get different words (make_a_call_01/02 → Phone/Call, wave_goodbye →
Bye/Wave, greet → Hello/Greet, front_kick → Stomp/Kick).

## Limits

- The figures are posed, not made for animation. Standing them up bends cloth that was made in another
  shape; shoulders and hips are the roughest places.
- **F5 was seated.** Standing her up straightens the legs and pulls the coat that lay on the seat; the
  sheets that pulled out too far are let go. She is recognisably the supplied figure but the least clean.
- Hands are not separately jointed: fingers stay as the figure was made.
- The women's heights are normalised to 1.66 m to the top of the head; the man is 1.80 m.

## The eighteen of 16 October 2026 (W4–W13, M6–M13)

Supplied on 16 October 2026 with their own Mixamo skeletons (65 joints), textures and animations, and used byte for
byte, as W1 and M1 are: each is read by the page as it is (`src/client/glb.js`), drawn at a person's height by one
uniform scale, and served beside the page as its own `.glb`. Nothing in any file is changed. Each was looked at and
put with the women or the men by its body and dress; one more file was a copy of another and is not used.

| Id | File | Default name | Height | Triangles | Animations | MD5 |
| --- | --- | --- | --- | --- | --- | --- |
| W4 | female_figure.glb | Chioma | 1.68 m | 99,221 | 11 | 704224bcbfca52bec3313d7f68b6845c |
| W5 | athletic_outfit.glb | Ifeoma | 1.70 m | 87,832 | 14 | 39a99defd263d62da1c9a39ce85bb9e9 |
| W6 | fashion_model_3.glb | Nneka | 1.72 m | 92,832 | 20 | a625ebbdff017179f4800a881e6f800f |
| W7 | zombie_survivor.glb | Chiamaka | 1.68 m | 95,105 | 16 | 224c67af76e9f7f77491ea1fedab6a86 |
| W8 | female_character_2.glb | Obiageli | 1.70 m | 91,992 | 13 | 18f21504e75078151633b60aecabdf01 |
| W9 | horror_nurse.glb | Ebele | 1.70 m | 87,382 | 12 | 9ec2b92e0944108a8396163e8b58d7b5 |
| W10 | camouflage_bikini.glb | Adanna | 1.70 m | 90,816 | 9 | ae932d015787db7a79eb26b5b0db6d55 |
| W11 | swimwear_model.glb | Ujunwa | 1.72 m | 9,777 | 11 | abe7b532432707b1c28ed437237fb512 |
| W12 | fashion_model_2.glb | Chinwe | 1.74 m | 9,549 | 12 | 1774dfb2ee13c401bb5cd3e2e0025f97 |
| W13 | fashion_model_1.glb | Ifeyinwa | 1.68 m | 20,878 | 28 | 4b7bfb20bafa2d4e36811cb08c8c3c82 |
| M6 | male_figure.glb | Chinedu | 1.82 m | 8,820 | 16 | 3a7aa49293940b7c11a5fc8f61711add |
| M7 | zombie.glb | Obinna | 1.80 m | 91,910 | 15 | a5a3a1561d549d934b0aa60dc296a4e7 |
| M8 | horror_character.glb | Nnamdi | 1.85 m | 91,143 | 13 | 8d0f497ef08709b97970744cdd50e650 |
| M9 | hobo_character.glb | Kelechi | 1.78 m | 91,215 | 18 | b9f0f14679183e9e0c202b748a92adc5 |
| M10 | zombie_character.glb | Okechukwu | 1.80 m | 91,632 | 21 | 73312db769b15a5f9851aa3d69e96445 |
| M11 | human_character.glb | Tobenna | 1.80 m | 10,190 | 10 | c510cb7e8f781e336c6bb432fc9a36d1 |
| M12 | ninja_armor.glb | Chukwudi | 1.83 m | 10,662 | 15 | 7bfb69491e40c80877b094ae1155d65a |
| M13 | ninja_warrior.glb | Ifeanyi | 1.85 m | 10,948 | 27 | c7a13d9945a3c46ebbc6f502955329bf |
| — | 3D zombie character (the second upload) | — | — | — | — | **Not used:** the same mesh and textures as zombie_character.glb, with three fewer animations. |

- **Women and men.** The ten women are offered after W1–W3 on the women's side of the choice, the eight men after
  M1, M4 and M5 on the men's (`src/sim/figures.js`, `FIGURE_ORDER`); the server knows all twenty-four
  (`api/_lib/schema.js`, migration 9).
- **What each does in town.** Its own walk, run, swim and idle where its file has them; what it lacks is borrowed and
  retargeted to its own bones (`tools/characters/borrow.mjs`; `src/client/figure-borrowed.js`, served as
  `moves.b64.txt`): the walk, run and swim of W1 for the women, M1's walk and swim and the warrior's run for the men,
  and the police officer's idle for any with no idle of its own. Each file's other animations are its skills, named
  by one word each (`figureLabels` in `src/client/glb.js`).
- **Size on the wire.** The eighteen files are 335 MB together. A device fetches only the figure its player is (and
  those of other players it meets); the service worker keeps only the player's own.
- **Look-alikes.** `horror_character.glb` resembles a well-known film slasher and `horror_nurse.glb` a well-known game's
  nurse; `athletic_outfit.glb` wears a sports crest. They are the owner's supplied files, used as supplied.
