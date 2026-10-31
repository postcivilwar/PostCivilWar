"""The owner's sports models (30 October 2026), made ready for the game. Nothing here writes to a supplied file.

    python3 tools/sports/sports.py            writes assets/sports/game/ (each model's shape and its pictures),
                                              assets/sports/sports.json and src/client/sports-parts.js

The owner's brief of 30 October 2026: a mall where his bicycle, skateboard, inline skates, e-scooter, hoverboard,
electric unicycle, speedboat and surfboard are sold for TR; townspeople riding the bicycles, skateboards and skates
in the streets, "pedals, balances, and maneuvers their equipment, with smooth wheel rotation"; three naval ships on
the river. His files stay in assets/sports/ exactly as supplied (their checksums are in sports.json and
test/sports.test.mjs fails if one changes).

Each supplied file is one material with one colour picture, built of separately named parts (`tripo_part_N`), the
wheels among them. The game's copy of each:

  - is every triangle of the supplied file with its own points, normals and texture places: nothing is added, left
    out, smoothed or moved within the shape;
  - is turned as one (about the upright) so that it faces +Z, stood on y = 0, centred between its wheels or ends, and
    made its size in metres by one factor for the whole (the files are each about one unit long): its proportions are
    the file's own;
  - has its triangles in the order of the parts the game moves separately (each wheel turns about its own axle, a
    bicycle's front wheel, fork and bars turn with the bars, its cranks go round with the pedals, a skateboard's
    trucks follow the deck as it leans, the boat's motor turns to steer it), body first;
  - is described in sports.json: where each moving part turns about and which way, where a rider's hands, seat and
    feet go, how big it is.

Its colour picture is kept as supplied for the 2k set where it is 2048 (the larger ones are drawn at 2048), and drawn
at 1024 and 512 for phones and for far away. No picture larger than 2048 is sent to any device.
"""
import hashlib, io, json, os, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
SRC = os.path.join(ROOT, 'assets', 'sports')
OUT = os.path.join(SRC, 'game')
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, 'tools', 'vehicles'))
from read import read, number          # noqa: E402
import wheelfit                         # noqa: E402

TOOL = 'sports.py 1'

# Each model: its file; which way it faces in the file (x, z: the direction that becomes +Z); its size in metres
# (`length` along the way it faces, or `height`, or `width` across); the parts that move, by their numbers in the
# file (the rest is the body). Read from plots of each file's parts, coloured and numbered, from the side, above and
# the front (30 October 2026).
ITEMS = {
    # a fat-tyre bicycle about 1.75 m long: wheels of 0.76 m (26 x 4 inch tyres), the saddle 0.95 m up, the bars 1.15 m
    'bicycle': {'file': 'fat-tyre-bicycle.glb', 'faces': (0, -1), 'length': 1.75, 'kind': 'bicycle',
                'wheels': {'front': [0, 8, 18], 'rear': [1, 9, 17]}, 'steer': [3, 6, 13], 'crank': [5, 16, 11, 12],
                'saddle': [4], 'bars': [3], 'pedals': [11, 12]},
    # a longboard of 0.98 m (38.5 inches), wheels of 85 mm; the same either way round
    'skateboard': {'file': 'skateboard.glb', 'faces': (1, 0), 'length': 0.98, 'kind': 'board',
                   'wheels': {'fl': [1], 'fr': [5], 'rl': [7], 'rr': [6]}, 'trucks': {'front': [3], 'rear': [2, 4]}},
    # one inline skate, 0.31 m long, wheels of 80 mm; worn on the right foot, and as its mirror on the left
    'inline-skates': {'file': 'inline-skate.glb', 'faces': (-0.3127, 0.9499), 'length': 0.31, 'kind': 'skate',
                      'wheels': {'w1': [1], 'w2': [5], 'w3': [7]}, 'split': {'w1': 2}},
    # an e-scooter 1.15 m to the top of its bars, wheels of 8.5 inches
    'e-scooter': {'file': 'electric-scooter.glb', 'faces': (0.7682, 0.6402), 'height': 1.15, 'kind': 'scooter',
                  'wheels': {'front': [4], 'rear': [1]}, 'steer': [2], 'bars': [2]},
    # a hoverboard 0.58 m across, wheels of 6.5 inches
    'hoverboard': {'file': 'hoverboard.glb', 'faces': (-0.2133, 0.977), 'width': 0.58, 'kind': 'hoverboard',
                   'wheels': {'right': [3, 7], 'left': [4, 5, 6]}},
    # an electric unicycle 0.56 m tall; its tyre in the file is only the part below the shell (the rest is not there),
    # so it does not turn; the rider stands on the two pedals
    'e-unicycle': {'file': 'electric-unicycle.glb', 'faces': (0.8012, 0.5984), 'height': 0.56, 'kind': 'unicycle',
                   'pedals': [2, 5]},
    # a speedboat 5.2 m long; its outboard motor turns to steer it, the steering wheel with it
    'speedboat': {'file': 'speedboat.glb', 'faces': (-1, 0), 'length': 5.2, 'kind': 'boat',
                  'motor': [4], 'helm': [10], 'seats': [5, 7], 'stand': [8]},
    # a shortboard of 1.83 m (6 feet)
    'surfboard': {'file': 'surfboard.glb', 'faces': (-1, 0), 'length': 1.83, 'kind': 'surfboard'},
    # a naval ship of 120 m: not sold; three of them on the river, crewed by townspeople
    'naval-ship': {'file': 'naval-ship.glb', 'faces': (0.9860, 0.1668), 'length': 120.0, 'kind': 'ship'},
}


def turned(P, fx, fz):
    """Points turned about the upright so that the direction (fx, 0, fz) becomes +Z (no mirroring)."""
    f = np.array([fx, fz], float); f /= np.linalg.norm(f)
    # the turn takes f to (0, 1): x' = x cos a - z sin a, z' = x sin a + z cos a, with a such that it does
    c, s = f[1], f[0]
    x, z = P[:, 0], P[:, 2]
    return np.stack([x * c - z * s, P[:, 1], x * s + z * c], axis=1)


def gather(m, cfg):
    """All the model's parts turned to face +Z: positions, normals, texture places, triangles, and each triangle's part
    number in the file."""
    Ps, Ns, uvs, Is, nums = [], [], [], [], []
    base = 0
    for p in m['parts']:
        Ps.append(turned(p['P'], *cfg['faces'])); Ns.append(turned(p['N'], *cfg['faces'])); uvs.append(p['uv'])
        Is.append(p['I'] + base); nums.append(np.full(len(p['I']), number(p['name'])))
        base += len(p['P'])
    return np.vstack(Ps), np.vstack(Ns), np.vstack(uvs), np.vstack(Is), np.concatenate(nums)


def sized(P, cfg):
    """One factor for the whole model, from the size it is given in metres."""
    ext = P.max(0) - P.min(0)
    if 'length' in cfg: return cfg['length'] / ext[2]
    if 'height' in cfg: return cfg['height'] / ext[1]
    return cfg['width'] / ext[0]


def wheel_of(P, N, idx, tri_part, nums, axle=(1.0, 0.0, 0.0)):
    """A wheel from its parts' own points: centre, axle, radius, half width (wheelfit.fit, as the cars' and motorcycles'
    are found), from the middle and size of those points as the first guess."""
    sel = np.isin(tri_part, nums)
    vi = np.unique(idx[sel].ravel())
    Q, M = P[vi], N[vi]
    lo, hi = Q.min(0), Q.max(0)
    c0 = (lo + hi) / 2
    a = np.array(axle, float)
    across = np.abs(np.eye(3) - np.outer(a, a)) @ (hi - lo)
    r0 = float(max(hi - lo) / 2)
    w = wheelfit.fit(Q, M, c0, r0, h0=float(abs((hi - lo) @ a)) / 2, axle=a)
    return {'c': [round(float(v), 5) for v in w['c']], 'axle': [round(float(v), 5) for v in w['a']], 'r': round(float(w['ro']), 5),
            'half': round(float(w['h']), 5), 'parts': nums}


def build(item, cfg):
    path = os.path.join(SRC, cfg['file'])
    m = read(path)
    P, N, uv, idx, tri_part = gather(m, cfg)
    k = sized(P, cfg)
    P = P * k
    # stood on the ground, centred across and between its ends (its wheels, where it has two at either end)
    shift = np.array([-(P[:, 0].max() + P[:, 0].min()) / 2, -P[:, 1].min(), -(P[:, 2].max() + P[:, 2].min()) / 2])
    P = P + shift
    desc = {'kind': cfg['kind'], 'scale': round(float(k), 5)}
    moving = []                                    # (name, part numbers), in the order the triangles are written

    def add(name, nums):
        moving.append((name, list(nums)))

    if 'wheels' in cfg:
        desc['wheels'] = {}
        for name, nums in cfg['wheels'].items(): add('wheel:' + name, nums)
    if 'steer' in cfg: add('steer', cfg['steer'])
    if 'crank' in cfg: add('crank', cfg['crank'])
    if 'trucks' in cfg:
        for name, nums in cfg['trucks'].items(): add('truck:' + name, nums)
    if 'motor' in cfg: add('motor', cfg['motor'])
    if 'helm' in cfg: add('helm', cfg['helm'])
    # (the stand the speedboat is shown on at the mall: its own part, left off when it is afloat)
    if 'stand' in cfg: add('stand', cfg['stand'])
    # each triangle's part in the game's order: 0 the body, then the moving parts as listed
    part = np.zeros(len(idx), np.int16)
    for g, (name, nums) in enumerate(moving, start=1):
        part[np.isin(tri_part, nums)] = g
    names = ['body'] + [n for n, _ in moving]
    # a part that holds two wheels in the file (the inline skate's back pair) is cut in two between them, along the
    # way it rolls: the triangles' middles sorted into two groups by where they are along it (two means), each
    # triangle going with the wheel its middle is nearer
    for name, count in cfg.get('split', {}).items():
        g = names.index('wheel:' + name)
        sel = np.where(part == g)[0]
        mid = P[idx[sel]].mean(axis=1)[:, 2]
        a, b = np.percentile(mid, 25), np.percentile(mid, 75)
        for _ in range(50):
            near_a = np.abs(mid - a) < np.abs(mid - b)
            a2, b2 = mid[near_a].mean(), mid[~near_a].mean()
            if abs(a2 - a) + abs(b2 - b) < 1e-9: break
            a, b = a2, b2
        back = sel[(mid < (a + b) / 2)]
        names.append('wheel:' + name + 'b')
        part[back] = len(names) - 1
    desc['parts'] = names
    # the wheels, each fitted to its own triangles
    if 'wheels' in cfg:
        for g, name in enumerate(names):
            if not name.startswith('wheel:'): continue
            axle = (1.0, 0.0, 0.0)
            sel = part == g
            vi = np.unique(idx[sel].ravel())
            Q, M = P[vi], N[vi]
            lo, hi = Q.min(0), Q.max(0)
            c0 = (lo + hi) / 2
            r0 = float(max(hi[1] - lo[1], hi[2] - lo[2]) / 2)
            w = wheelfit.fit(Q, M, c0, r0, h0=float(hi[0] - lo[0]) / 2, axle=np.array(axle))
            desc['wheels'][name[6:]] = {'c': [round(float(v), 5) for v in w['c']], 'r': round(float(w['ro']), 5), 'half': round(float(w['h']), 5)}
    desc.update(anchors(item, cfg, P, idx, tri_part, part, names, desc))
    return P, N, uv, idx, part, names, desc, m


def pca(Q):
    """The middle of the points and their directions of spread, the widest last."""
    c = Q.mean(0)
    w, v = np.linalg.eigh(np.cov((Q - c).T))
    return c, v, w


def r5(v):
    return [round(float(x), 5) for x in v] if hasattr(v, '__len__') else round(float(v), 5)


def anchors(item, cfg, P, idx, tri_part, part, names, desc):
    """Where the moving parts turn about, and where a rider goes: read from the shape (metres, facing +Z)."""
    def pts(nums):
        return P[np.unique(idx[np.isin(tri_part, nums)].ravel())]

    def group(name):
        return P[np.unique(idx[part == names.index(name)].ravel())]

    out = {}
    kind = cfg['kind']
    if kind == 'bicycle':
        # the saddle: the middle of its top
        S = pts(cfg['saddle']); top = S[S[:, 1] > S[:, 1].max() - 0.02]
        out['seat'] = r5([0.0, S[:, 1].max(), top[:, 2].mean()])
        # the grips: the ends of the bars, either side
        B = pts(cfg['bars']); far = np.abs(B[:, 0]) > 0.86 * np.abs(B[:, 0]).max()
        G = B[far]
        out['grip'] = r5([np.abs(G[:, 0]).mean(), G[:, 1].mean(), G[:, 2].mean()])
        # the cranks: the two pedals (one each side) go round the middle of the line between them
        right, left = pts([cfg['pedals'][0]]), pts([cfg['pedals'][1]])
        left = left[np.abs(left[:, 0]) > 0.75 * np.abs(left[:, 0]).max()]
        R, L = right.mean(0), left.mean(0)
        bb = (R + L) / 2
        crank = float(np.hypot(R[1] - L[1], R[2] - L[2]) / 2)
        out['crank'] = {'c': r5([0.0, bb[1], bb[2]]), 'r': r5(crank), 'pedalX': r5(abs(R[0]) if abs(R[0]) > abs(L[0]) else abs(L[0])),
                        'angle': r5(np.arctan2(R[1] - bb[1], R[2] - bb[2])), 'rightX': r5(R[0])}
        # what turns with the bars: about the line of the fork (its long direction), through its middle
        F = pts([6]); c, v, w = pca(F); a = v[:, 2] * np.sign(v[1, 2])
        # (in the bike's middle plane: the fork is the same either side of it, but for a brake on one leg)
        a[0] = 0.0; a /= np.linalg.norm(a); c[0] = 0.0
        out['steer'] = {'p': r5(c), 'axis': r5(a)}
    elif kind == 'board':
        body = group('body')
        mid = body[np.abs(body[:, 2]) < 0.15]
        out['deck'] = r5(mid[:, 1].max())
        tr = {}
        for end, (l, r) in {'front': ('fl', 'fr'), 'rear': ('rl', 'rr')}.items():
            a, b = desc['wheels'][l]['c'], desc['wheels'][r]['c']
            tr[end] = {'c': r5([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2])}
        out['trucks'] = tr
        out['feet'] = {'front': r5(0.62 * tr['front']['c'][2]), 'rear': r5(0.82 * tr['rear']['c'][2])}
    elif kind == 'skate':
        body = group('body')
        wheels = desc['wheels'].values()
        top = max(w['c'][1] + w['r'] for w in wheels)
        zs = [w['c'][2] for w in wheels]
        boot = body[(body[:, 1] > top + 0.01) & (body[:, 1] < top + 0.05)]
        out['boot'] = {'sole': r5(top + 0.012), 'heel': r5(boot[:, 2].min()), 'toe': r5(boot[:, 2].max()), 'mid': r5(sum(zs) / len(zs)), 'top': r5(body[:, 1].max())}
    elif kind == 'scooter':
        body = group('body')
        deck = body[(np.abs(body[:, 2]) < 0.2) & (body[:, 1] < 0.3)]
        out['deck'] = r5(deck[:, 1].max())
        B = group('steer'); far = np.abs(B[:, 0]) > 0.86 * np.abs(B[:, 0]).max(); G = B[far]
        out['grip'] = r5([np.abs(G[:, 0]).mean(), G[:, 1].mean(), G[:, 2].mean()])
        stem = body[(body[:, 1] > 0.45) & (body[:, 1] < 0.95) & (body[:, 2] > 0.0)]
        c, v, w = pca(stem); a = v[:, 2] * np.sign(v[1, 2])
        a[0] = 0.0; a /= np.linalg.norm(a); c[0] = 0.0
        out['steer'] = {'p': r5(c), 'axis': r5(a)}
    elif kind == 'hoverboard':
        body = group('body')
        out['deck'] = r5(np.percentile(body[np.abs(body[:, 0]) < 0.2][:, 1], 99))
        out['feet'] = r5(0.55 * desc['wheels']['right']['c'][0])
    elif kind == 'unicycle':
        feet = []
        for n in cfg['pedals']:
            Q = pts([n]); feet.append([Q[:, 0].mean(), Q[:, 1].max(), Q[:, 2].mean()])
        out['pedals'] = [r5(f) for f in sorted(feet, key=lambda f: f[0])]
        out['wheelR'] = r5((P[:, 1].max() - P[:, 1].min()) / 2 * 0.86)
    elif kind == 'boat':
        seats = []
        for n in cfg['seats']:
            Q = pts([n]); top = Q[Q[:, 1] > np.percentile(Q[:, 1], 70)]
            seats.append([Q[:, 0].mean(), np.percentile(Q[:, 1], 40), top[:, 2].mean()])
        seats.sort(key=lambda s: s[0])                     # the driver's (on the right, -x) first
        out['seats'] = [r5(s) for s in seats]
        M = group('motor'); out['motor'] = {'p': r5([M[:, 0].mean(), M[:, 1].max(), M[:, 2].max()]), 'axis': [0.0, 1.0, 0.0]}
        H = group('helm'); c, v, w = pca(H); a = v[:, 0] * np.sign(v[2, 0] if abs(v[2, 0]) > 1e-6 else 1.0)
        out['helm'] = {'p': r5(c), 'axis': r5(a), 'r': r5(np.sqrt(w[2]) * 1.41)}
        hull = P[np.unique(idx[~np.isin(tri_part, cfg.get('stand', [8]))].ravel())]
        out['keel'] = r5(hull[:, 1].min())
    elif kind == 'surfboard':
        top = P[(np.abs(P[:, 0]) < 0.05) & (np.abs(P[:, 2]) < 0.1)]
        out['deck'] = r5(top[:, 1].max())
        out['bottom'] = r5(np.percentile(top[:, 1], 2))
    elif kind == 'ship':
        up = P[:, 1]
        hist, edges = np.histogram(up, bins=200)
        out['deck'] = r5(edges[np.argmax(hist)] + (edges[1] - edges[0]) / 2)
    return out


def resized(raw, size, quality=90):
    im = Image.open(io.BytesIO(raw))
    if im.mode != 'RGB': im = im.convert('RGB')
    if im.width != size: im = im.resize((size, size), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, 'JPEG', quality=quality, optimize=True, progressive=True)
    return buf.getvalue()


def write(item, P, N, uv, idx, part, names, desc, m):
    """The game's copy: its shape (points, normals, texture places, triangles in the order of the parts) and its
    pictures; the description for sports.json."""
    os.makedirs(OUT, exist_ok=True)
    order = np.argsort(part, kind='stable')
    tris = idx[order]
    counts = [int((part == g).sum()) for g in range(len(names))]
    n = len(P)
    wide = n > 65535
    n16 = np.round(np.clip(N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9), -1, 1) * 32767).astype(np.int16)
    blob = (P.astype(np.float32).tobytes() + n16.tobytes() + (b'\0\0' * (n % 2)) + uv.astype(np.float32).tobytes()
            + tris.astype(np.uint32 if wide else np.uint16).tobytes())
    open(os.path.join(OUT, f'{item}.bin'), 'wb').write(blob)
    files = {'mesh': f'{item}.bin'}
    data, mime = m['image']
    im = Image.open(io.BytesIO(data))
    for tag, size in (('2k', 2048), ('1k', 1024), ('512', 512)):
        name = f'{item}-color-{tag}.jpg'
        # the supplied picture itself where it is already that size and a JPEG
        out = data if (im.width == size and mime == 'image/jpeg') else resized(data, size)
        open(os.path.join(OUT, name), 'wb').write(out)
        files[f'color{tag}'] = name
    files['colorSize'] = im.width
    raw = m['raw']
    ext = P.max(0) - P.min(0)
    mat = m['material'].get('pbrMetallicRoughness', {})
    return {
        'master': ITEMS[item]['file'], 'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw), 'tool': TOOL,
        'vertices': n, 'triangles': int(len(idx)), 'index': 32 if wide else 16, 'parts': names, 'counts': counts,
        'size': r5(ext), 'metallic': mat.get('metallicFactor', 1.0), 'roughness': mat.get('roughnessFactor', 1.0),
        'doubleSided': bool(m['material'].get('doubleSided', False)), **desc, 'files': files,
    }


def write_js(manifest):
    """The same numbers for the game's own code."""
    game = os.path.join(SRC, 'game')
    body = {}
    for k, v in sorted(manifest.items()):
        e = {f: v[f] for f in v if f not in ('master', 'sha256', 'bytes', 'tool')}
        size = lambda name: os.path.getsize(os.path.join(game, v['files'][name]))
        e['download'] = {'phone': size('mesh') + size('color1k'), 'computer': size('mesh') + size('color2k')}
        body[k] = e
    open(os.path.join(ROOT, 'src', 'client', 'sports-parts.js'), 'w').write(
        "// Written by tools/sports/sports.py from the owner's sports models: do not edit by hand.\n"
        "// Each model's triangles are in the order of its parts (body first), each part's count in `counts`.\n"
        f'export const SPORTS_PARTS = Object.freeze({json.dumps(body, indent=1)});\n')


if __name__ == '__main__':
    only = [a for a in sys.argv[1:] if not a.startswith('--')]
    path = os.path.join(SRC, 'sports.json')
    manifest = json.load(open(path)) if os.path.exists(path) else {}
    # (the first manifest named only the files as copied in: kept for those not yet made)
    manifest = {k: v for k, v in manifest.items() if k in ITEMS}
    for item, cfg in ITEMS.items():
        if only and item not in only: continue
        P, N, uv, idx, part, names, desc, m = build(item, cfg)
        manifest[item] = write(item, P, N, uv, idx, part, names, desc, m)
        e = manifest[item]
        print(item, 'size (m)', e['size'], 'parts', dict(zip(names, e['counts'])), flush=True)
    json.dump(dict(sorted(manifest.items())), open(path, 'w'), indent=1)
    write_js(manifest)
