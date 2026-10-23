#!/usr/bin/env python3
"""The before-and-after sheets for the owner: for each place, day and night, the r128 picture beside the r186 one, with
the frame time, draw calls, triangles and graphics memory under each; a page per place, as a PDF.

  python3 tools/measure/sheets.py <before dir> <after dir> phone|computer <out.pdf> [title] [before's name] [after's name]
(the folders written by tools/measure/places.mjs; the names over each picture, by default "before (r128)" and "after (r186)")
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

before_dir, after_dir, device, out = sys.argv[1:5]
title = sys.argv[5] if len(sys.argv) > 5 else f'three.js r128 → r186, {device}'
BEFORE = sys.argv[6] if len(sys.argv) > 6 else 'before (r128)'
AFTER = sys.argv[7] if len(sys.argv) > 7 else 'after (r186)'
B = json.load(open(os.path.join(before_dir, f'perf-{device}.json')))
A = json.load(open(os.path.join(after_dir, f'perf-{device}.json')))

def font(size, bold=False):
    for path in ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()

F, FB, FT = font(15), font(17, True), font(24, True)
by = lambda r: {p['place']: p for p in r['places']}
bp, ap = by(B), by(A)
pages = []
W = 1280
for place, b in bp.items():
    a = ap.get(place)
    if not a:
        continue
    whens = [w for w in ('day', 'night') if w in b and w in a and b[w].get('shot') and a[w].get('shot')]
    if not whens:
        continue
    imgs = []
    for w in whens:
        ib, ia = Image.open(b[w]['shot']).convert('RGB'), Image.open(a[w]['shot']).convert('RGB')
        iw, ih = ib.size
        k = (W - 30) / 2 / iw
        ib, ia = ib.resize((int(iw * k), int(ih * k))), ia.resize((int(iw * k), int(ih * k)))
        imgs.append((w, ib, ia, b[w], a[w]))
    h = 70 + sum(im[1].size[1] + 90 for im in imgs)
    page = Image.new('RGB', (W, h), (24, 24, 26))
    d = ImageDraw.Draw(page)
    d.text((10, 10), f'{place}', font=FT, fill=(255, 255, 255))
    d.text((10, 42), title, font=F, fill=(200, 200, 200))
    y = 70
    for w, ib, ia, x, z in imgs:
        d.text((10, y), f'{w}: {BEFORE}', font=FB, fill=(255, 210, 150))
        d.text((20 + ib.size[0], y), f'{w}: {AFTER}', font=FB, fill=(150, 210, 255))
        y += 24
        page.paste(ib, (10, y)); page.paste(ia, (20 + ib.size[0], y))
        y += ib.size[1] + 6
        def line(m):
            f = m.get('frame') or {}
            calls = m.get('mainCalls', m.get('calls')); tris = m.get('mainTris', m.get('triangles')) or 0
            sc, st = m.get('shadowCalls'), m.get('shadowTris')
            shadows = f"the sun's shadows: {sc} draws, {st / 1e6:.2f} M triangles · " if sc is not None and st is not None else ''
            return f"a frame here (in software) {f.get('median')} ms · the picture: {calls} draws, {tris / 1e6:.2f} M triangles\n{shadows}{m.get('gpuMB')} MB on the graphics card"
        d.text((10, y), line(x), font=F, fill=(230, 230, 230))
        d.text((20 + ib.size[0], y), line(z), font=F, fill=(230, 230, 230))
        y += 60
    pages.append(page)
pages[0].save(out, save_all=True, append_images=pages[1:], resolution=110)
print(out, len(pages), 'pages')
