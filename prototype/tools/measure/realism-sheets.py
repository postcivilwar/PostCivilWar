#!/usr/bin/env python3
"""Stage 3's pictures for the owner, each scene before and after: what tools/measure/realism.mjs took from the website as it
was (before) and as it is now (after), side by side, a line under each pair saying what to look at; a page a scene, as a PDF.

  python3 tools/measure/realism-sheets.py <before dir> <after dir> <out.pdf> [title] [before's name] [after's name]
(a before folder of '-' gives the after pictures alone, two to a page)
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

before_dir, after_dir, out = sys.argv[1:4]
title = sys.argv[4] if len(sys.argv) > 4 else 'More realism'
BEFORE = sys.argv[5] if len(sys.argv) > 5 else 'before'
AFTER = sys.argv[6] if len(sys.argv) > 6 else 'after'

SCENES = [
    ('hour-noon', 'Noon at the motor park', 'The colour grade for warm daylight; light from the whole sky; softer sun shadows; the soft darkening under the feet and vehicles; haze in the distance.'),
    ('hour-golden', 'The golden hour (17:48)', 'The colour of the hour: warm and golden as the sun goes down; the sky round the low sun lighting the walls that face it.'),
    ('hour-dusk', 'Dusk (18:54)', 'Blue dusk; the lamps and windows coming on, with a gentle glow round them.'),
    ('hour-moon', 'Under the moon (23:00)', 'Cool moonlight; glow round the lit windows and lamps.'),
    ('clouds-and-haze', 'From above, a day of broken cloud', 'The shadows of clouds drifting over the land; the far town in a low warm haze.'),
    ('mirage-waterside-road', 'Waterside Road at 13:00', 'Heat shimmer: far along the hot tarmac the sky wavers on it.'),
    ('dust-behind-keke', 'A keke on the red earth, a dry noon', 'Dust lifted behind its wheels, carried along after it and drifting off on the air (the keke driven from a standstill to about 30 km/h).'),
    ('wet-tyre-marks', 'After rain: the keke\'s tracks', 'Wet tyre marks left on the wet ground, fading as it dries.'),
    ('wet-footprints', 'After rain: footprints', 'Wet footprints, left and right, behind the player.'),
    ('puddles-waterside-road', 'After rain: Waterside Road', 'Puddles on the tarmac giving back the sky (High and Ultra).'),
    ('river-bank', 'The River Niger at the town\'s bank', 'Waves and foam where the river laps at the bank, and the far bank given back by the water (High and Ultra).'),
    ('sun-flare', 'Early morning on the river bank, into the low sun', 'The sun\'s flare (Ultra), the glow round the sun, and its glints on the water.'),
    ('fireflies-lagoon-night', 'The lagoon in the habitation at night', 'Fireflies flashing over the water and the bank.'),
]

def font(size, bold=False):
    path = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    return ImageFont.truetype(path, size) if os.path.exists(path) else ImageFont.load_default()

F, FB, FT = font(16), font(18, True), font(26, True)
W = 1400
pages = []
alone = before_dir == '-'

def wrap(draw, text, f, width):
    words, lines, line = text.split(), [], ''
    for w in words:
        t = (line + ' ' + w).strip()
        if draw.textlength(t, font=f) > width and line:
            lines.append(line); line = w
        else:
            line = t
    if line:
        lines.append(line)
    return lines

def report(d):
    try:
        return json.load(open(os.path.join(d, 'realism.json')))
    except Exception:
        return {}

ra = report(after_dir)
for key, name, note in SCENES:
    fa = os.path.join(after_dir, f'{key}.png')
    if not os.path.exists(fa):
        continue
    fb = None if alone else os.path.join(before_dir, f'{key}.png')
    ia = Image.open(fa).convert('RGB')
    ib = Image.open(fb).convert('RGB') if fb and os.path.exists(fb) else None
    iw, ih = ia.size
    # (one above the other, each the page's width: the difference is in the detail)
    k = (W - 20) / iw
    tw, th = int(iw * k), int(ih * k)
    rows = 2 if ib is not None else 1
    page = Image.new('RGB', (W, 64 + rows * (th + 34) + 90), 'white')
    d = ImageDraw.Draw(page)
    d.text((10, 10), f'{title}: {name}', font=FT, fill='black')
    y = 54
    for label, im in ([(BEFORE, ib), (AFTER, ia)] if ib is not None else [(AFTER, ia)]):
        d.text((10, y), label, font=FB, fill='#444')
        page.paste(im.resize((tw, th)), (10, y + 26))
        y += th + 34
    yy = y + 6
    for line in wrap(d, note, F, W - 20):
        d.text((10, yy), line, font=F, fill='black'); yy += 22
    pages.append(page)

if not pages:
    sys.exit('no pictures found')
pages[0].save(out, save_all=True, append_images=pages[1:], resolution=110)
print(f'{out}: {len(pages)} pages')
