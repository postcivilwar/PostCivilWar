"""The pictures of leaves the habitation's plants are dressed with (dress.py): drawn here, nothing fetched.

One sheet (SIZE square, with see-through gaps): palm fronds down its left half, four across, each a rib with its
leaflets either side; sprays of leaves on its right half, two by two. The pictures are grey to white, to be coloured by
each plant's own colours (taken from the owner's model, dress.py), except a frond's rib, a pale straw, so that the
plant's green makes it the yellow-green of a living rib.

    python3 tools/habitation/leaves.py out.webp [size]
"""
import math, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

# where each picture is on the sheet, as parts of it (u0, v0, u1, v1), v down from the top as glTF has it
FRONDS = ['coconut', 'oil', 'date', 'fern']
SPRAYS = ['broad', 'long', 'small', 'round']
def place(name):
    if name in FRONDS:
        k = FRONDS.index(name)
        return (k * 0.125, 0.0, (k + 1) * 0.125, 1.0)
    k = SPRAYS.index(name)
    return (0.5 + (k % 2) * 0.25, (k // 2) * 0.25, 0.5 + (k % 2 + 1) * 0.25, (k // 2 + 1) * 0.25)

def rng(seed):
    return np.random.default_rng(seed)

# A frond as it is on the plant, in metres: its length, how far its leaflets reach either side of the rib at most,
# the leaflets' width at their base, how far apart they grow along the rib, how far forward they point (degrees from
# the rib), how much they bend back toward the tip, and how often one is missing.
FROND_SHAPE = {
    'coconut': dict(length=5.0, reach=0.85, blade=0.042, spacing=0.055, forward=38, bend=0.25, gap=0.04, power=0.55),
    'oil': dict(length=4.5, reach=0.75, blade=0.035, spacing=0.045, forward=45, bend=0.12, gap=0.03, power=0.75),
    'date': dict(length=3.5, reach=0.55, blade=0.025, spacing=0.04, forward=50, bend=0.05, gap=0.02, power=0.8),
    'fern': dict(length=1.2, reach=0.16, blade=0.0, spacing=0.03, forward=70, bend=0.1, gap=0.0, power=0.7),
}

def _frond(W, H, kind, seed):
    """One frond, W across and H long, its base at the bottom (v = 1) and its tip at the top (v = 0). Drawn in metres
    and stretched to the picture, so that on the frond (FROND_SHAPE's size) its leaflets are as they are on the plant."""
    S = 2                      # drawn larger, then made smaller: smooth edges
    w, h = W * S, H * S
    f = FROND_SHAPE[kind]
    sx, sy = w / (2 * f['reach'] * 1.04), h / f['length']
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    g = ImageDraw.Draw(im)
    r = rng(seed)
    rib = w / 2
    px = lambda x, y: (rib + x * sx, h - y * sy)          # metres (x across, y up the frond from its base) to pixels
    def blade(x0, y0, side, L, fwd, width, shade, bend):
        pts = []
        n = 10
        for j in range(n + 1):
            t = j / n
            a = math.radians(fwd) - bend * t * t       # pointing a little less forward toward its end (the tip hangs)
            # a leaflet curves: its direction turns as it goes
            pts.append([x0, y0, a])
        xs, ys = x0, y0
        out = [(xs, ys)]
        for j in range(1, n + 1):
            t = j / n
            a = math.radians(fwd) + bend * t
            xs += side * math.sin(a) * L / n
            ys += math.cos(a) * L / n
            out.append((xs, ys))
        left, right = [], []
        for j, (x, y) in enumerate(out):
            t = j / n
            wd = width * ((1 - t) ** 0.6 if t > 0.15 else 0.75 + t / 0.15 * 0.25) + 0.002
            if j < n:
                dx, dy = out[j + 1][0] - x, out[j + 1][1] - y
            else:
                dx, dy = x - out[j - 1][0], y - out[j - 1][1]
            l = math.hypot(dx, dy) or 1
            nx, ny = -dy / l, dx / l
            left.append(px(x + nx * wd / 2, y + ny * wd / 2)); right.append(px(x - nx * wd / 2, y - ny * wd / 2))
        g.polygon(left + right[::-1], fill=(shade, shade, shade, 255))
        g.line([px(*q) for q in out[:-1]], fill=(int(shade * 0.8),) * 3 + (255,), width=max(1, int(0.006 * sx)))
    if kind == 'fern':
        # a fern's frond: pinnae either side, each a row of small rounded lobes (feathery), shortest at both ends
        y = 0.02
        while y < f['length'] * 0.985:
            t = y / f['length']
            reach = f['reach'] * (math.sin(math.pi * min(1.0, 0.05 + t * 0.98)) ** f['power'])
            for side in (-1, 1):
                fwd = math.radians(f['forward'] + r.uniform(-5, 5))
                L = reach / math.sin(fwd)
                n = max(3, int(L / 0.011))
                ax, ay = 0.0, y
                for j in range(n):
                    s_ = (j + 0.5) / n
                    cx = side * s_ * L * math.sin(fwd)
                    cy = y + s_ * L * math.cos(fwd) + s_ * s_ * 0.01
                    lobe = (1 - s_) * 0.011 + 0.004
                    shade = int(170 + r.uniform(0, 85))
                    for s2 in (-1, 1):
                        # a lobe either side of the pinna's own rib, leaning toward its tip
                        a2 = fwd + side * s2 * 1.1
                        lx, ly = cx + side * math.sin(fwd) * lobe * 0.3 + s2 * side * math.cos(fwd) * lobe * 0.9, cy + math.cos(fwd) * lobe * 0.3 - s2 * math.sin(fwd) * lobe * 0.9
                        bb = [px(lx - lobe * 0.55, ly + lobe * 0.55), px(lx + lobe * 0.55, ly - lobe * 0.55)]
                        g.ellipse([min(bb[0][0], bb[1][0]), min(bb[0][1], bb[1][1]), max(bb[0][0], bb[1][0]), max(bb[0][1], bb[1][1])], fill=(shade, shade, shade, 255))
                g.line([px(0, y), px(side * L * math.sin(fwd), y + L * math.cos(fwd))], fill=(165, 160, 120, 255), width=max(1, int(0.003 * sx)))
            y += f['spacing'] * r.uniform(0.9, 1.1)
        g.line([px(0, 0), px(0, f['length'])], fill=(200, 185, 130, 255), width=max(2, int(0.006 * sx)))
    else:
        y = 0.04
        side = 1
        while y < f['length'] * 0.99:
            t = y / f['length']
            # longest a little below the middle, short at the base and at the tip
            reach = f['reach'] * (math.sin(math.pi * min(1.0, 0.07 + t * 0.97)) ** f['power'])
            for side in (-1, 1):
                if r.random() < f['gap']:              # now and then one torn away
                    continue
                fwd = f['forward'] + r.uniform(-6, 6)
                L = reach / max(0.35, math.sin(math.radians(fwd))) * r.uniform(0.92, 1.03)
                width = f['blade'] * r.uniform(0.85, 1.15) * (0.6 + 0.4 * math.sin(math.pi * min(1.0, 0.1 + t)))
                blade(0.0, y + r.uniform(-0.006, 0.006), side, L, fwd, width, int(165 + r.uniform(0, 90)), f['bend'] * r.uniform(0.6, 1.4))
            y += f['spacing'] * r.uniform(0.88, 1.12)
        # the rib: straw, wide at the base, thin at the tip
        for j in range(60):
            t0, t1 = j / 60, (j + 1) / 60
            wd = (0.028 * (1 - t0) ** 1.4 + 0.007)
            a, b = px(-wd / 2, f['length'] * t0), px(wd / 2, f['length'] * t1)
            g.rectangle([a[0], b[1], b[0], a[1]], fill=(206, 196, 136, 255))
    im = im.resize((W, H), Image.LANCZOS)
    return im

def _spray(W, kind, seed):
    """A spray of leaves on twigs from the middle of the square outward, each leaf with its midrib."""
    S = 3
    w = W * S
    im = Image.new('RGBA', (w, w), (0, 0, 0, 0))
    g = ImageDraw.Draw(im)
    r = rng(seed)
    long_, wide, round_, twigs, per = {
        'broad': (0.20, 0.085, 0.6, 7, 6),     # broad leaves rounded at the tip (almond, monstera-like trees)
        'long': (0.22, 0.05, 0.0, 7, 8),       # long narrow leaves (mango, shrubs)
        'small': (0.10, 0.04, 0.3, 9, 9),      # small leaves (mangrove, buttress trees' fine crowns)
        'round': (0.13, 0.075, 1.0, 8, 7),     # small round leaves (shrubs, ficus)
    }[kind]
    def leaf(x, y, a, L, Wd, shade):
        at = L * (0.35 + 0.3 * round_)
        pts = []
        for j in range(17):
            s = j / 16
            # half-width along the leaf: a smooth lens, widest at `at`
            u = s * L
            hw = Wd * (math.sin(math.pi * min(1, u / (2 * at))) if u < at else max(0.0, math.cos(0.5 * math.pi * min(1.0, (u - at) / (L - at)))) ** (0.8 - 0.5 * round_))
            pts.append((u, hw))
        ca, sa = math.cos(a), math.sin(a)
        P = [(x + u * ca - hw * sa, y + u * sa + hw * ca) for u, hw in pts] + [(x + u * ca + hw * sa, y + u * sa - hw * ca) for u, hw in pts[::-1]]
        g.polygon(P, fill=(shade, shade, shade, 255))
        g.line([(x, y), (x + L * 0.92 * ca, y + L * 0.92 * sa)], fill=(int(shade * 0.72),) * 3 + (255,), width=max(1, int(Wd * 0.12)))
    for t in range(twigs):
        a = t / twigs * 2 * math.pi + r.uniform(-0.35, 0.35)
        reach = (0.30 + r.uniform(0, 0.12)) * w
        ex, ey = w / 2 + math.cos(a) * reach, w / 2 + math.sin(a) * reach
        g.line([(w / 2, w / 2), (ex, ey)], fill=(120, 110, 90, 255), width=int(1.2 * S))
        for k in range(per):
            along = k / per
            end = k >= per - 3
            x = w / 2 + (ex - w / 2) * (1 if end else 0.22 + along * 0.72)
            y = w / 2 + (ey - w / 2) * (1 if end else 0.22 + along * 0.72)
            side = 1 if k % 2 else -1
            turn = a + (k - per + 2) * 0.7 + r.uniform(-0.2, 0.2) if end else a + side * (0.75 + r.uniform(0, 0.5))
            L = long_ * r.uniform(0.75, 1.25) * w
            Wd = wide * r.uniform(0.8, 1.2) * w
            leaf(x, y, turn, L, Wd, int(150 + r.uniform(0, 105)))
    im = im.resize((W, W), Image.LANCZOS)
    return im

def sheet(size=2048):
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    fw = size // 8
    for k, kind in enumerate(FRONDS):
        out.alpha_composite(_frond(fw, size, kind, 11 + k), (k * fw, 0))
    sw = size // 4
    for k, kind in enumerate(SPRAYS):
        out.alpha_composite(_spray(sw, kind, 31 + k), (size // 2 + (k % 2) * sw, (k // 2) * sw))
    # the gaps keep the colour of what is next to them (no dark fringe where the picture is made smaller)
    a = np.asarray(out).astype(np.float32)
    rgb, al = a[..., :3], a[..., 3:] / 255.0
    blur = np.asarray(Image.fromarray(np.uint8(np.clip(rgb * al, 0, 255))).filter(ImageFilter.GaussianBlur(4))).astype(np.float32)
    wgt = np.asarray(Image.fromarray(np.uint8(al[..., 0] * 255)).filter(ImageFilter.GaussianBlur(4))).astype(np.float32)[..., None] / 255.0
    fill = np.where(wgt > 1e-3, blur / np.maximum(wgt, 1e-3), 200)
    rgb = np.where(al > 0.02, a[..., :3], fill)
    res = np.concatenate([np.clip(rgb, 0, 255), a[..., 3:]], -1).astype(np.uint8)
    return Image.fromarray(res, 'RGBA')

if __name__ == '__main__':
    out = sys.argv[1]
    size = int(sys.argv[2]) if len(sys.argv) > 2 else 2048
    im = sheet(size)
    im.save(out, 'WEBP', quality=90, method=6) if out.endswith('.webp') else im.save(out)
    print('wrote', out, im.size)
