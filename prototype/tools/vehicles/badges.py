"""The makers' badges on the showroom's cars, covered (31 October 2026, the owner's word: "you need paint over those
cars with brands on them. Or use our logo to redesign and cover it").

The owner's car files are never changed: only the game's own copies of each car's pictures (assets/vehicles/cars/game,
made from them by cars.py and smaller.py) are painted on, here, after those are made. What is covered, and how, is
written in badges.json, one entry for each mark found on a car (badges.mjs draws each car close from every side, and
`where` finds a mark seen in one of those pictures on the car's colour picture):

    { "<car>": [ { "what": "the maker's emblem on the grille", "rect": [u0, v0, u1, v1], "how": "logo" | "paint",
                   "turn": 0, "flip": false }, ... ] }

`rect` is where the mark is on the colour picture, as shares of its width and height (from its top left corner).
"paint": painted over with the colour about it (the middle of the colours in a band round it), the edge eased in.
"logo": painted over so, and the game's own mark (the rising sun, assets/brand/cover/logo.png, its top part) put on it,
as large as fits, turned by `turn` degrees (and mirrored if `flip`: a picture laid on the car backwards). Where a mark
has relief in the car's other pictures (its bumps and its shine), that is smoothed too.

    python3 tools/vehicles/badges.py where <folder> <car> <view> <x0> <y0> <x1> <y1>
        where on the colour picture the part of a view's picture between (x0, y0) and (x1, y1) is: each piece of the
        colour picture it comes from, as a rect (badges.mjs wrote the folder)
    python3 tools/vehicles/badges.py cover [cars...] [--into <folder>] [--list <file>]
        covers every mark in badges.json on each car's pictures, at every size, and brings car-parts.js's sizes up to
        date; run once on pictures fresh from cars.py and smaller.py (it is the same each time it is run on those).
        `--into`: the covered pictures written to a folder of their own instead, the game's left as they are
    python3 tools/vehicles/badges.py sizes
        brings car-parts.js's sizes up to date (after covered pictures made with `--into` are put in the game's place)
"""
import io, json, os, sys
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
GAME = os.path.join(ROOT, 'assets', 'vehicles', 'cars', 'game')
LIST = os.path.join(os.path.dirname(__file__), 'badges.json')
LOGO = os.path.join(ROOT, 'assets', 'brand', 'cover', 'logo.png')
SIZES = {'4k': 4096, '2k': 2048, '1k': 1024, '512': 512}


def uv_of(folder, car, view):
    """The colour picture's place of each point of a view's picture: u, v (shares) and whether the car is there."""
    def read(which):
        a = np.asarray(Image.open(os.path.join(folder, f'{car}-{view}-{which}.png')).convert('RGB')).astype(np.float64)
        return (a[..., 0] + a[..., 1] / 255.0) / 255.0, a[..., 2] > 127
    u, there = read('u')
    v, there2 = read('v')
    return u, v, there & there2


def where(folder, car, view, x0, y0, x1, y1):
    u, v, there = uv_of(folder, car, view)
    x0, x1 = sorted((int(x0), int(x1))); y0, y1 = sorted((int(y0), int(y1)))
    uu, vv = u[y0:y1 + 1, x0:x1 + 1][there[y0:y1 + 1, x0:x1 + 1]], v[y0:y1 + 1, x0:x1 + 1][there[y0:y1 + 1, x0:x1 + 1]]
    if not len(uu): return []
    # the points fall into pieces of the colour picture (a mark may cross from one piece to another): gathered by a
    # grid of 1/64 of the picture, neighbours together
    cells = {}
    for a, b in zip(uu, vv): cells.setdefault((int(a * 64), int(b * 64)), []).append((a, b))
    seen, pieces = set(), []
    for c in cells:
        if c in seen: continue
        stack, group = [c], []
        seen.add(c)
        while stack:
            k = stack.pop(); group.extend(cells[k])
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    n = (k[0] + dx, k[1] + dy)
                    if n in cells and n not in seen: seen.add(n); stack.append(n)
        g = np.array(group)
        pieces.append({'rect': [round(float(np.percentile(g[:, 0], 1)), 5), round(float(np.percentile(g[:, 1], 1)), 5), round(float(np.percentile(g[:, 0], 99)), 5), round(float(np.percentile(g[:, 1], 99)), 5)], 'points': len(g)})
    return sorted(pieces, key=lambda p: -p['points'])


def sun_mark():
    """The game's mark, the rising sun, from the canonical logo: its top part (rays, disc and ground), on clear."""
    im = Image.open(LOGO).convert('RGBA')
    a = np.asarray(im)
    # the mark is above the words: the rows down to the last of the three ground lines, before the widest gap in the
    # top half (the ground lines themselves are a few rows apart)
    alpha = a[..., 3] > 20
    rows = alpha.any(axis=1)
    top = int(np.argmax(rows))
    best, y = (0, a.shape[0] // 2), top
    while y < a.shape[0] // 2:
        if not rows[y]:
            s = y
            while y < a.shape[0] and not rows[y]: y += 1
            if y - s > best[0]: best = (y - s, s)
        y += 1
    mark = im.crop((0, top, im.width, best[1]))
    box = mark.getbbox()
    return mark.crop(box)


def ring_colour(arr, x0, y0, x1, y1, band):
    """The middle of the colours in a band round a rect (each channel's median)."""
    H, W = arr.shape[:2]
    X0, Y0, X1, Y1 = max(0, x0 - band), max(0, y0 - band), min(W, x1 + band), min(H, y1 + band)
    block = arr[Y0:Y1, X0:X1].reshape(-1, arr.shape[2]) if arr.ndim == 3 else arr[Y0:Y1, X0:X1].reshape(-1, 1)
    inner = np.zeros((Y1 - Y0, X1 - X0), bool); inner[y0 - Y0:y1 - Y0, x0 - X0:x1 - X0] = True
    ring = block[~inner.reshape(-1)]
    return np.median(ring, axis=0) if len(ring) else np.median(block, axis=0)


def fill(im, rect, colour=None, feather=0.08):
    """Paints a rect of a picture over with the colour about it, the edge eased into what is round it."""
    arr = np.asarray(im).astype(np.float32)
    H, W = arr.shape[:2]
    x0, y0, x1, y1 = int(rect[0] * W), int(rect[1] * H), int(np.ceil(rect[2] * W)), int(np.ceil(rect[3] * H))
    x0, y0, x1, y1 = max(0, x0), max(0, y0), min(W, max(x1, x0 + 1)), min(H, max(y1, y0 + 1))
    band = max(2, int(0.25 * max(x1 - x0, y1 - y0)))
    c = np.array(colour, np.float32) if colour is not None else ring_colour(arr, x0, y0, x1, y1, band)
    # eased edge: a margin of `feather` of the rect's size (at least a pixel) outside it, blending to what was there
    m = max(1, int(feather * max(x1 - x0, y1 - y0)))
    X0, Y0, X1, Y1 = max(0, x0 - m), max(0, y0 - m), min(W, x1 + m), min(H, y1 + m)
    yy, xx = np.mgrid[Y0:Y1, X0:X1]
    dx = np.maximum(np.maximum(x0 - xx, xx - (x1 - 1)), 0); dy = np.maximum(np.maximum(y0 - yy, yy - (y1 - 1)), 0)
    t = np.clip(1 - np.maximum(dx, dy) / (m + 1), 0, 1)[..., None] if arr.ndim == 3 else np.clip(1 - np.maximum(dx, dy) / (m + 1), 0, 1)
    arr[Y0:Y1, X0:X1] = arr[Y0:Y1, X0:X1] * (1 - t) + c * t
    return Image.fromarray(np.clip(arr + 0.5, 0, 255).astype(np.uint8), im.mode), (x0, y0, x1, y1)


def put_logo(im, box, turn=0, flip=False, mark=None):
    """The rising sun put on a picture, as large as fits a box (pixels), turned and mirrored as asked."""
    x0, y0, x1, y1 = box
    m = (mark or sun_mark())
    if flip: m = m.transpose(Image.FLIP_LEFT_RIGHT)
    if turn: m = m.rotate(turn, expand=True, resample=Image.BICUBIC)
    bw, bh = max(1, int((x1 - x0) * 0.9)), max(1, int((y1 - y0) * 0.9))
    k = min(bw / m.width, bh / m.height)
    m = m.resize((max(1, int(m.width * k)), max(1, int(m.height * k))), Image.LANCZOS)
    out = im.convert('RGBA')
    out.alpha_composite(m, (x0 + (x1 - x0 - m.width) // 2, y0 + (y1 - y0 - m.height) // 2))
    return out.convert(im.mode)


def save_like(path, im):
    ext = os.path.splitext(path)[1].lower()
    buf = io.BytesIO()
    if ext == '.jpg': im.convert('RGB').save(buf, 'JPEG', quality=92 if '-4k.' in path else 90, optimize=True, progressive=True)
    elif ext == '.webp': im.save(buf, 'WEBP', quality=90, method=6)
    else: im.save(buf, 'PNG', optimize=True)
    open(path, 'wb').write(buf.getvalue())


def cover(cars=None, into=None, listing=None):
    marks = json.load(open(listing or LIST))
    sun = sun_mark()
    if into: os.makedirs(into, exist_ok=True)
    for car, items in sorted(marks.items()):
        if cars and car not in cars: continue
        for name in sorted(os.listdir(GAME)):
            if not name.startswith(car + '-') or name.endswith('.bin'): continue
            kind = name[len(car) + 1:].split('-')[0]
            if kind not in ('color', 'normal', 'rm'): continue
            im = Image.open(os.path.join(GAME, name))
            path = os.path.join(into or GAME, name)
            im = im.convert('RGB') if im.mode not in ('RGB', 'L') else im
            for it in items:
                if kind == 'normal': im, box = fill(im, it['rect'], colour=(128, 128, 255))
                else: im, box = fill(im, it['rect'])
                if kind == 'color' and it.get('how') == 'logo': im = put_logo(im, box, it.get('turn', 0), it.get('flip', False), sun)
            save_like(path, im)
            print(f'{name}: {len(items)} covered')
    if into: return
    sizes()


def sizes():
    """Brings the sizes the game is told of each car's files (car-parts.js `bytes`) up to date, as cars.py works them
    out."""
    parts = os.path.join(ROOT, 'src', 'client', 'car-parts.js')
    text = open(parts).read()
    head, body = text.split('export const CAR_PARTS = Object.freeze(', 1)
    data = json.loads(body.rsplit(');', 1)[0])
    for k, v in data.items():
        size = lambda n: os.path.getsize(os.path.join(GAME, v['files'][n])) if n in v['files'] else 0
        v['bytes'] = {'lite': size('mesh') + size('color2k') + size('normal2k') + size('rm2k'), 'full': size('mesh') + size('color4k') + size('normal4k') + size('rm4k')}
    open(parts, 'w').write(head + 'export const CAR_PARTS = Object.freeze(' + json.dumps(data, indent=1) + ');\n')


if __name__ == '__main__':
    a = sys.argv[1:]
    if a and a[0] == 'where':
        print(json.dumps(where(a[1], a[2], a[3], *map(float, a[4:8])), indent=1))
    elif a and a[0] == 'sizes':
        sizes()
    elif a and a[0] == 'cover':
        # (`--into <folder>`: the covered pictures written there instead, the game's own left as they are, to look at
        # first; `--list <file>`: the marks from another list than badges.json)
        into = a[a.index('--into') + 1] if '--into' in a else None
        listing = a[a.index('--list') + 1] if '--list' in a else None
        rest = [x for i, x in enumerate(a[1:], 1) if not x.startswith('--') and a[i - 1] not in ('--into', '--list')]
        cover(set(rest) or None, into, listing)
    else:
        print(__doc__)
