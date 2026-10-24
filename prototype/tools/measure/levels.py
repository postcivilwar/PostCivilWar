#!/usr/bin/env python3
"""The graphics levels side by side, for the owner: for each place, its picture at Ultra, High, Medium and Low, with the
numbers under each (draws and triangles, the pictures on the graphics card and all it holds, the page's own time for a
frame); a page per place, as a PDF; and the same numbers as a table (Markdown) for the README.

  python3 tools/measure/levels.py <folder with ultra|0, high|1, medium|2, low|3 measurings> phone|computer <out.pdf> [title]
(the folder holds <device>-0 .. <device>-3, each written by tools/measure/places.mjs with PERF_LEVEL=0..3)
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

folder, device, out = sys.argv[1:4]
title = sys.argv[4] if len(sys.argv) > 4 else f'the graphics levels, on a {device}\'s settings'
NAMES = ['Ultra', 'High', 'Medium', 'Low']


def font(size, bold=False):
    path = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    return ImageFont.truetype(path, size) if os.path.exists(path) else ImageFont.load_default()


F, FB, FT = font(14), font(16, True), font(24, True)
runs = []
for level in range(4):
    p = os.path.join(folder, f'{device}-{level}', f'perf-{device}.json')
    runs.append(json.load(open(p)) if os.path.exists(p) else None)
places = []
for r in runs:
    for p in (r or {}).get('places', []):
        if p['place'] not in places and p['place'] != 'character screen':
            places.append(p['place'])


def at(level, place):
    r = runs[level]
    if not r:
        return None
    for p in r['places']:
        if p['place'] == place:
            return p.get('day')
    return None


def numbers(m):
    f = m.get('frame') or {}
    calls = m.get('mainCalls', m.get('calls')); tris = (m.get('mainTris', m.get('triangles')) or 0) / 1e6
    sc, st = m.get('shadowCalls') or 0, (m.get('shadowTris') or 0) / 1e6
    return {
        'draws': f'{calls} + {sc}', 'triangles': f'{tris:.2f} + {st:.2f} M', 'pictures': m.get('picturesMB'),
        'card': round((m.get('gpuMB') or 0) + (m.get('screenMB') or 0), 1), 'busy': f.get('busyMs'), 'frame': f.get('median'),
        'ratio': m.get('pixelRatio'), 'shadows': m.get('sunShadows'),
    }


W = 1480
pages = []
rows = []
for place in places:
    cells = [(lv, at(lv, place)) for lv in range(4)]
    cells = [(lv, m) for lv, m in cells if m and m.get('shot') and os.path.exists(m['shot'])]
    if not cells:
        continue
    k = None
    imgs = []
    for lv, m in cells:
        im = Image.open(m['shot']).convert('RGB')
        iw, ih = im.size
        k = (W - 10 * 3) / 2 / iw
        imgs.append((lv, im.resize((int(iw * k), int(ih * k))), m))
    cw, ch = imgs[0][1].size
    h = 70 + ((len(imgs) + 1) // 2) * (ch + 130)
    page = Image.new('RGB', (W, h), (24, 24, 26))
    d = ImageDraw.Draw(page)
    d.text((10, 10), place, font=FT, fill=(255, 255, 255))
    d.text((10, 42), title, font=F, fill=(200, 200, 200))
    for i, (lv, im, m) in enumerate(imgs):
        x = 10 + (i % 2) * (cw + 10)
        y = 70 + (i // 2) * (ch + 130)
        n = numbers(m)
        d.text((x, y), f'{NAMES[lv]}', font=FB, fill=(255, 210, 150))
        page.paste(im, (x, y + 24))
        y2 = y + 24 + ch + 6
        d.text((x, y2), f"the picture and the sun's shadows: {n['draws']} draws, {n['triangles']} triangles", font=F, fill=(230, 230, 230))
        d.text((x, y2 + 20), f"on the graphics card: pictures {n['pictures']} MB, {n['card']} MB with its drawing buffers; pixels {n['ratio']} to each", font=F, fill=(230, 230, 230))
        d.text((x, y2 + 40), f"a frame on this machine (no graphics card: drawn in software): {n['frame']} ms", font=F, fill=(180, 180, 180))
        d.text((x, y2 + 60), f"of which the page's own work (its processor slowed as set): {n['busy']} ms", font=F, fill=(180, 180, 180))
        rows.append((place, NAMES[lv], n))
    pages.append(page)
if pages:
    pages[0].save(out, save_all=True, append_images=pages[1:], resolution=110)
    print(out, len(pages), 'pages')
# the table
md = os.path.splitext(out)[0] + '.md'
with open(md, 'w') as f:
    f.write('| place | level | draws (picture + shadows) | triangles | pictures, MB | graphics card, MB | page\'s work a frame, ms |\n|---|---|---|---|---|---|---|\n')
    for place, name, n in rows:
        f.write(f"| {place} | {name} | {n['draws']} | {n['triangles']} | {n['pictures']} | {n['card']} | {n['busy']} |\n")
print(md)
