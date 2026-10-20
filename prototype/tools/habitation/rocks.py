"""The habitation's rocks (none of the owner's models is a rock on its own): boulders made here, as the owner's
pictures show them, each kind with its own stone: grey stone with moss on its top (the forest paths, the gorge, the
gazebo garden), pale limestone (the lagoon's rocks and pillars), granite (the river gorge under the long bridge), and
red-brown layered stone (the big waterfall's cliffs).

Each boulder: a rounded, fractured lump (a sphere pushed out and in by noise at several sizes, cut flat here and there
as rock breaks), its picture painted onto it from the side it faces (stone, lichen, cracks), moss where it faces the
sky (on the mossy kinds), with the relief of its stone (a normal map) and how rough it is.

    python3 tools/habitation/rocks.py <out-folder> [most=1024]       writes rock-<kind>-<n>.glb
"""
import math, os, sys
import numpy as np
from PIL import Image, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import glbio

KINDS = {
    # stone colours (sRGB, light and dark), moss (how much, its green), how flat, how fractured
    'mossy': dict(light=(0.56, 0.55, 0.50), dark=(0.30, 0.30, 0.28), moss=0.75, moss_col=(0.30, 0.42, 0.14), flat=0.72, cuts=4, speck=0.25),
    'limestone': dict(light=(0.86, 0.83, 0.76), dark=(0.58, 0.55, 0.48), moss=0.12, moss_col=(0.42, 0.48, 0.25), flat=0.8, cuts=6, speck=0.15),
    'granite': dict(light=(0.72, 0.68, 0.63), dark=(0.38, 0.35, 0.33), moss=0.05, moss_col=(0.4, 0.45, 0.3), flat=0.65, cuts=5, speck=0.8),
    'redstone': dict(light=(0.66, 0.42, 0.30), dark=(0.36, 0.22, 0.16), moss=0.2, moss_col=(0.33, 0.4, 0.18), flat=0.6, cuts=6, speck=0.2),
}

def icosphere(level=4):
    t = (1 + 5 ** 0.5) / 2
    V = [(-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0), (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t), (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1)]
    F = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8), (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1)]
    V = [np.array(v, float) / np.linalg.norm(v) for v in V]
    for _ in range(level):
        mid = {}
        def m(a, b):
            key = (min(a, b), max(a, b))
            if key not in mid:
                p = V[a] + V[b]; V.append(p / np.linalg.norm(p)); mid[key] = len(V) - 1
            return mid[key]
        F2 = []
        for a, b, c in F:
            ab, bc, ca = m(a, b), m(b, c), m(c, a)
            F2 += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
        F = F2
    return np.array(V), np.array(F)

def noise3(p, rng_seed, octaves=5, base=1.6):
    """Smooth noise in space: sums of waves in random directions (cheap, seamless on a closed shape)."""
    rng = np.random.default_rng(rng_seed)
    out = np.zeros(len(p))
    amp, freq = 1.0, base
    for o in range(octaves):
        for _ in range(6):
            d = rng.normal(size=3); d /= np.linalg.norm(d)
            ph = rng.uniform(0, 2 * np.pi)
            out += amp * np.sin(p @ d * freq * 2 * np.pi + ph) / 6
        amp *= 0.5; freq *= 2.1
    return out

def stone_picture(kind, size, seed):
    """The stone's picture, a square to be painted onto the boulder from each side: its grain, speckles, cracks and
    lichen; and its height (for the relief)."""
    k = KINDS[kind]
    rng = np.random.default_rng(seed)
    def blur_noise(scale):
        # (seamless: the random grid repeated three by three, enlarged, its middle kept, so the picture tiles)
        n = max(2, size // scale)
        g = rng.random((n, n)).astype(np.float32)
        big3 = np.asarray(Image.fromarray(np.uint8(np.tile(g, (3, 3)) * 255)).resize((size * 3, size * 3), Image.BICUBIC), np.float32) / 255
        return big3[size:2 * size, size:2 * size]
    big = 0.5 * blur_noise(64) + 0.3 * blur_noise(24) + 0.2 * blur_noise(8)
    fine = blur_noise(2)
    t = np.clip(0.55 * big + 0.25 * fine + 0.2, 0, 1)
    if kind == 'redstone':
        y = np.arange(size)[:, None] / size
        layers = 0.5 + 0.5 * np.sin(y * 2 * np.pi * 14 + blur_noise(48) * 4)
        t = 0.6 * t + 0.4 * layers
    light, dark = np.array(k['light']), np.array(k['dark'])
    rgb = dark + (light - dark) * t[..., None]
    # speckles (granite's crystals; flecks in the others)
    sp = (rng.random((size, size)) < 0.02 * k['speck'] + 0.004)
    spk = np.asarray(Image.fromarray(np.uint8(np.tile(sp, (3, 3)) * 255)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.5)), np.float32)[size:2 * size, size:2 * size, None] / 255
    rgb = rgb * (1 - 0.35 * spk) + spk * 0.12 * rng.random((size, size, 1))
    # cracks
    cr = np.zeros((size, size), np.float32)
    from PIL import ImageDraw
    cim = Image.new('L', (size * 3, size * 3), 0); g = ImageDraw.Draw(cim)
    for _ in range(int(5 + rng.random() * 5)):
        x, y = rng.uniform(size, 2 * size, 2); a = rng.uniform(0, 2 * np.pi)
        pts = [(x, y)]
        for _ in range(14):
            a += rng.normal(0, 0.45); x += np.cos(a) * size / 26; y += np.sin(a) * size / 26; pts.append((x, y))
        for dx in (-size, 0, size):
            for dy in (-size, 0, size):
                g.line([(px + dx, py + dy) for px, py in pts], fill=255, width=max(1, size // 300))
    cr = np.asarray(cim.filter(ImageFilter.GaussianBlur(0.7)), np.float32)[size:2 * size, size:2 * size] / 255
    rgb *= (1 - 0.55 * cr[..., None])
    # lichen: pale and orange-grey patches
    li = blur_noise(16) * blur_noise(6)
    lich = np.clip((li - 0.42) * 6, 0, 1)[..., None]
    rgb = rgb * (1 - 0.35 * lich) + np.array([0.72, 0.70, 0.6]) * 0.35 * lich
    height = 0.6 * big + 0.3 * fine - 0.8 * cr
    return np.clip(rgb, 0, 1), height

def boulder(kind, seed, most=1024, level=4):
    k = KINDS[kind]
    rng = np.random.default_rng(seed)
    V, F = icosphere(level)
    # the shape: a lump, flatter than it is wide, pushed out and in at several sizes
    scale = np.array([1.0, k['flat'] * rng.uniform(0.85, 1.1), rng.uniform(0.75, 1.0)])
    r = 1.0 + 0.32 * noise3(V, seed, 3, 0.55) + 0.07 * noise3(V, seed + 1, 4, 2.2) + 0.018 * noise3(V, seed + 2, 3, 7)
    P = V * r[:, None] * scale
    # broken flat here and there, as rock fractures
    for _ in range(k['cuts']):
        n = rng.normal(size=3); n /= np.linalg.norm(n)
        if n[1] < -0.5: n[1] = -n[1]
        d = np.percentile(P @ n, rng.uniform(78, 92))
        over = P @ n - d
        P -= np.outer(np.clip(over, 0, None) * 0.92, n)
    # sitting on the ground: its bottom a little under it (the ground covers it)
    P[:, 1] -= P[:, 1].min() + 0.12 * np.ptp(P[:, 1])
    P /= np.ptp(P[:, 0])                                   # one unit across: placed at its size in the habitation
    # normals from the shape
    N = np.zeros_like(P)
    fn = np.cross(P[F[:, 1]] - P[F[:, 0]], P[F[:, 2]] - P[F[:, 0]])
    for i in range(3): np.add.at(N, F[:, i], fn)
    N /= np.linalg.norm(N, axis=1, keepdims=True)
    # the picture: one seamless square of stone, painted on by the graphics card from the three ways each part can face
    # (habitation-plants.js), so there is no seam and no stretch anywhere on the rock
    rgb, height = stone_picture(kind, most, seed)
    P2, N2, F2 = P, N, F
    UV2 = np.stack([P[:, 0], P[:, 2]], 1)
    # moss where it faces the sky (and a little down its sides), as vertex colour over the stone
    up = np.clip((N2[:, 1] - 0.25) / 0.6, 0, 1) ** 1.3
    mossy = np.clip(up * k['moss'] * (0.7 + 0.6 * (noise3(P2, seed + 9, 3, 2.0) + 0.5)), 0, 1)
    moss_lin = np.where(np.array(k['moss_col']) <= 0.04045, np.array(k['moss_col']) / 12.92, ((np.array(k['moss_col']) + 0.055) / 1.055) ** 2.4)
    # (the vertex colour multiplies the stone's picture: white where bare, the moss's green over it where mossy;
    # a little darker toward the ground, where the light reaches less)
    low = np.clip(P2[:, 1] / max(1e-6, np.ptp(P2[:, 1])) * 2.5, 0.55, 1.0)
    colour = (1 - mossy)[:, None] * np.ones(3) + mossy[:, None] * (moss_lin / 0.25)
    colour = np.clip(colour * low[:, None], 0, 1)
    im = Image.fromarray(np.uint8(rgb * 255))
    nrm = normal_map(height, 3.5)
    rough = Image.fromarray(np.uint8(np.stack([np.full(height.shape, 255), np.clip(200 + 40 * (0.5 - height), 120, 255), np.zeros(height.shape)], -1)))
    mat = dict(name='stone', picture=glbio.encode(im, 'jpeg', 88), normal=glbio.encode(nrm, 'jpeg', 92), rough=glbio.encode(rough, 'jpeg', 85), roughness=1.0, metallic=0.0, double=False, extras=dict(part='stone', triplanar=1.6))
    return [dict(P=P2, N=N2, UV=UV2, F=F2, colour=colour, material=mat)]

def normal_map(height, strength):
    gx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * 0.5 * strength
    gy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * 0.5 * strength
    n = np.stack([-gx, gy, np.ones_like(gx)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return Image.fromarray(np.uint8(np.clip((n * 0.5 + 0.5) * 255, 0, 255)))

if __name__ == '__main__':
    out = sys.argv[1]
    kw = dict(a.split('=', 1) for a in sys.argv[2:] if '=' in a)
    most = int(kw.get('most', 1024))
    os.makedirs(out, exist_ok=True)
    for kind in (kw.get('kinds') or ','.join(KINDS)).split(','):
        for n in range(int(kw.get('each', 3))):
            prims = boulder(kind, 100 + n * 17 + list(KINDS).index(kind) * 5, most)
            path = os.path.join(out, f'rock-{kind}-{n}.glb')
            size = glbio.write(path, prims, extras=dict(dressed=dict(kind='rock', stone=kind, made='tools/habitation/rocks.py')))
            print(path, size)
