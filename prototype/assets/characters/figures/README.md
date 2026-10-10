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
