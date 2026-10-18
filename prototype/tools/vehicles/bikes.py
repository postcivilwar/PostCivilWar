"""The owner's motorcycles, made ready for the game. Nothing here writes to a supplied file.

    python3 tools/vehicles/bikes.py            writes assets/vehicles/bikes/game/ and bikes.json

Each supplied bike (assets/vehicles/bikes/<id>.glb) is one mesh with one material: body, wheels, fork and bars
are a single piece. To make the wheels turn and the front steer, the bike's own triangles are sorted (by where
they are) into four parts that the game moves separately:

    body     everything that does not move by itself
    steer    what turns with the bars below the headstock: the front fender, the lower fork, the brake parts
    front    the front wheel (tyre, rim, spokes, disc)            turns about its axle, and with `steer`
    rear     the rear wheel                                       turns about its axle

Nothing is added, removed, smoothed or moved within the shape: every triangle of the supplied mesh is kept,
with its own position, normal and texture place. The whole bike is only turned and shifted as one (so that it
faces +Z, stands on y = 0 and is centred between its wheels), which changes none of its proportions.

Its three pictures (colour, normal, metal and roughness) are kept as they are for the 4k set where they already
are 4096 or less; the 8192 colour picture is drawn at 4096 for the 4k set, and every picture at 2048 for the 2k
set (phones). The masters stay in assets/vehicles/bikes/ untouched, and their checksums are in bikes.json.
"""
import hashlib, io, json, os, struct, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wheelfit

# `--mesh`: only the meshes (the pictures already written are kept as they are)
MESH_ONLY = '--mesh' in sys.argv
KNOWN = {}

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
SRC = os.path.join(ROOT, 'assets', 'vehicles', 'bikes')
OUT = os.path.join(SRC, 'game')
Image.MAX_IMAGE_PIXELS = None

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


def read(path):
    data = open(path, 'rb').read()
    off, j, binary = 12, None, None
    while off < len(data):
        clen, ctype = struct.unpack('<I4s', data[off:off + 8])
        body = data[off + 8:off + 8 + clen]
        if ctype == b'JSON': j = json.loads(body)
        else: binary = body
        off += 8 + clen

    def acc(i):
        a = j['accessors'][i]; v = j['bufferViews'][a['bufferView']]
        n = NC[a['type']]; dt = np.dtype(CT[a['componentType']])
        arr = np.frombuffer(binary, dt, a['count'] * n, v.get('byteOffset', 0) + a.get('byteOffset', 0))
        return arr.reshape(a['count'], n) if n > 1 else arr

    def image(i):
        if i is None: return None          # (a file may carry only its colour picture: then there is no other to keep)
        v = j['bufferViews'][j['images'][i]['bufferView']]
        return binary[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']], j['images'][i].get('mimeType')

    assert len(j['meshes']) == 1 and len(j['meshes'][0]['primitives']) == 1, 'one mesh, one primitive'
    p = j['meshes'][0]['primitives'][0]
    mat = j['materials'][p.get('material', 0)]
    pbr = mat.get('pbrMetallicRoughness', {})
    tex = lambda info: j['textures'][info['index']]['source'] if info else None
    return {
        'pos': acc(p['attributes']['POSITION']).astype(np.float64),
        'nrm': acc(p['attributes']['NORMAL']).astype(np.float64),
        'uv': acc(p['attributes']['TEXCOORD_0']).astype(np.float64),
        'idx': acc(p['indices']).astype(np.int64).reshape(-1, 3),
        'images': {'color': image(tex(pbr.get('baseColorTexture'))), 'rm': image(tex(pbr.get('metallicRoughnessTexture'))), 'normal': image(tex(mat.get('normalTexture')))},
        'metallic': pbr.get('metallicFactor', 1.0), 'roughness': pbr.get('roughnessFactor', 1.0),
        'normalScale': (mat.get('normalTexture') or {}).get('scale', 1.0),
    }


def rot_y(P, quarter):
    """Turns points about the vertical by a quarter turn times `quarter` (no mirroring)."""
    x, y, z = P[:, 0].copy(), P[:, 1].copy(), P[:, 2].copy()
    for _ in range(quarter % 4): x, z = z, -x
    return np.stack([x, y, z], axis=1)


# Where the fit above read a wheel's rim, or a tyre that is not quite round, instead of the tyre itself, its radius
# as measured by eye from a side plot of the supplied mesh (tools: the tyre's outer ring, centre plane).
RADIUS = {
    'cafe-racer': {'front': 0.152}, 'chrome-concept': {'front': 0.12, 'rear': 0.133}, 'olive-cruiser': {'front': 0.125},
    'gold-tourer': {'front': 0.122}, 'purple-sport': {'front': 0.145}, 'white-sport': {'front': 0.13}, 'black-cruiser': {'front': 0.12},
}


# bikes whose back tyre is wider than the 13 cm a tyre is otherwise taken to be at most
FAT_REAR = {'power-cruiser'}

# bikes whose bars, mirrors and screen are not their highest points at the front: the long, low power cruiser's
# mirrors stand about its middle, a little behind it, and the rule below read it the wrong way round (18 October
# 2026: its fat back tyre was steered and its rider faced the tail; seen from the side, its fork and bars are at the
# end without the seat)
TURN_ROUND = {'power-cruiser'}

# bikes whose headlamp is not above the front wheel: the concept bike's lamps are the strip between its two front
# tyres (its front-most point, low down)
LAMP_LOW = {'chrome-concept'}

# bikes made with few triangles (about 11,000), whose tyres are coarse rings of points: their wheels are found as the
# ring most of the points round each end lie on (`ring_fit`), the tyre's foot on the ground, rather than by the
# ground-contact cluster `fit_wheel` starts from, which on a coarse tyre is not under the axle
RING_FIT = {'civil-war-tourer'}


def ring_fit(P, sign):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    near = (np.abs(x) < 0.07) & (z * sign > 0.15)
    y0 = float(y[near].min())
    z0 = float(np.median(z[near & (y < y0 + 0.02)]))
    sel = near & (np.abs(z - z0) < 0.25) & (y < y0 + 0.4)
    zz, yy = z[sel], y[sel] - y0
    best = None
    for zc in np.arange(z0 - 0.06, z0 + 0.06, 0.002):
        for R in np.arange(0.08, 0.26, 0.002):
            d = np.hypot(zz - zc, yy - R)
            on = np.abs(d - R) < 0.005
            bins = len(set((np.degrees(np.arctan2(yy[on] - R, zz[on] - zc)) // 15).astype(int)))
            score = bins * 100 + int(on.sum())
            if best is None or score > best[0]: best = (score, float(zc), float(R))
    _, zc, R = best
    yc = y0 + R
    d = np.hypot(z - zc, y - yc)
    band = (d > 0.8 * R) & (d < 1.03 * R) & (y < yc - 0.03) & (np.abs(x) < 0.1)
    half = min(float(np.percentile(np.abs(x[band]), 99)) if band.sum() > 20 else 0.05, 0.065)
    return {'z': zc, 'y': yc, 'r': R, 'half': half}


def fit_wheel(P, sign, radius=None, wide=False):
    """A wheel at one end (sign +1 the front, -1 the back): where its tyre touches the ground, its radius from
    the lower half of the tyre (or as given), and how wide it is."""
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    m = (np.abs(x) < 0.08) & (z * sign > 0.15)
    y0 = y[m].min()
    g = np.sort(z[m & (y < y0 + 0.008)])
    groups, cur = [], [g[0]]
    for v in g[1:]:
        if v - cur[-1] > 0.02: groups.append(cur); cur = [v]
        else: cur.append(v)
    groups.append(cur)
    zc = float(np.mean(max(groups, key=len)))
    m = (np.abs(x) < 0.07) & (np.abs(z - zc) < 0.3) & (y < 0.3 + y0)
    zz, yy = z[m], y[m] - y0
    best = None
    for R in np.arange(0.07, 0.27, 0.001):
        low = yy < R
        d = np.hypot(zz[low] - zc, yy[low] - R)
        on = np.abs(d - R) < 0.004
        bins = len(set((np.degrees(np.arctan2(yy[low][on] - R, zz[low][on] - zc)) // 10).astype(int)))
        score = bins * 1000 + on.sum()
        if best is None or score > best[0]: best = (score, float(R))
    R = radius or best[1]; yc = float(y0) + R
    # how wide: the tyre's lower half, below the axle (above it are the fork and the swingarm)
    d = np.hypot(z - zc, y - yc)
    band = (d > 0.8 * R) & (d < 1.03 * R) & (y < yc - 0.03) & (np.abs(x) < 0.1)
    half = float(np.percentile(np.abs(x[band]), 99)) if band.sum() > 20 else 0.05
    half = min(half, 0.065) if not wide else half          # (what is wider below the axle is the swingarm or a pipe)
    return {'z': zc, 'y': yc, 'r': R, 'half': half}


def anchors(P, front, rear, N=None, bike_id=None):
    """Where a rider sits, holds the bars and puts their feet, read from the shape (in the bike's own units); N, the
    normals (which way each point's surface faces), for finding the headlamp's glass."""
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    H = y.max()
    # the bars: the widest points of the upper front of the bike, mirrors and their stalks left out (they stand
    # higher than the grips and further out)
    up = (z > 0) & (y > 0.55 * H) & (y < 0.97 * H)
    cand = up & (np.abs(x) > 0.55 * np.abs(x[up]).max())
    ys = y[cand]
    level = np.percentile(ys, 30)              # the grips are the lower part of what is widest up there
    grip = cand & (np.abs(y - level) < 0.035)
    gx = float(np.percentile(np.abs(x[grip]), 85)) * 0.92
    gz = float(np.median(z[grip])); gy = float(np.median(y[grip]))
    # the seat: where the top of the bike dips lowest between the tank and the tail (the top read across the
    # middle of the bike, not only its centre line, which on some bikes runs through a gap)
    middle = np.abs(x) < 0.06
    bins = np.linspace(rear['z'] + 0.05, gz - 0.1, 40)
    tops = []
    for a, b in zip(bins[:-1], bins[1:]):
        s = middle & (z >= a) & (z < b)
        if s.sum() > 3: tops.append(((a + b) / 2, float(y[s].max())))
    tops = np.array(tops)
    tops = tops[tops[:, 1] > 0.42 * H]
    mid = tops[(tops[:, 0] > rear['z'] + 0.12) & (tops[:, 0] < gz - 0.18)]
    seat = mid[np.argmin(mid[:, 1])] if len(mid) else tops[np.argmin(tops[:, 1])]
    sz, sy = float(seat[0]), float(seat[1])
    # the feet: below and a little ahead of the seat, at the side of the engine
    pz = sz + 0.12; py = max(0.07, front['y'] * 0.75)
    side = (np.abs(z - pz) < 0.05) & (np.abs(y - py) < 0.05)
    px = float(np.percentile(np.abs(x[side]), 90)) + 0.01 if side.sum() > 10 else 0.12
    # the lamps and the exhaust (16 October 2026: lights and flames are put where the model has them):
    #   head   the headlamp's glass: the front-most surface facing forward, near the middle, clear of the front
    #          mudguard (further from the front axle, seen from the side, than one and a half times the wheel's
    #          radius) and below the grips (18 October 2026: the front-most point of the upper front, as it was, is
    #          the mudguard's nose on most of the owner's bikes, and the lamp's glass was drawn there); on a LAMP_LOW
    #          bike, and wherever nothing is found so, that front-most point
    #   tail   the rear-most point near the middle, above the rear wheel's axle (the tail lamp)
    #   pipe   the rear-most points low down at each side, behind the rear axle (the silencers' ends)
    R = front['r']
    face = (np.abs(x) < 0.07) & (np.hypot(y - front['y'], z - front['z']) > 1.5 * R) & (y > front['y'] + 0.8 * R) & (y < gy - 0.01)
    if N is not None: face &= N[:, 2] > 0.6
    if N is not None and face.sum() >= 20 and bike_id not in LAMP_LOW:
        hz = float(np.percentile(z[face], 99.5))
        hsel = face & (z > hz - 0.015)
        head = [0.0, float(np.median(y[hsel])), hz]
    else:
        upper = (np.abs(x) < 0.06) & (y > 0.45 * H) & (y < 0.85 * H) & (z > gz - 0.05)
        hz = float(np.percentile(z[upper], 99.5)) if upper.sum() > 20 else float(z.max())
        hsel = upper & (z > hz - 0.02)
        head = [0.0, float(np.median(y[hsel])) if hsel.sum() else 0.6 * H, hz]
    back = (np.abs(x) < 0.07) & (y > rear['y'] + 0.02) & (y < 0.8 * H)
    tz = float(np.percentile(z[back], 0.5)) if back.sum() > 20 else float(z.min())
    tsel = back & (z < tz + 0.02)
    tail = [0.0, float(np.median(y[tsel])) if tsel.sum() else 0.45 * H, tz]
    pipes = []
    for side in (1, -1):
        low = (x * side > 0.04) & (y > 0.04) & (y < rear['y'] + rear['r'] * 1.2) & (z < rear['z'] + rear['r'] * 0.6)
        if low.sum() < 20: continue
        pz0 = float(np.percentile(z[low], 1))
        end = low & (z < pz0 + 0.025)
        if end.sum() < 3: continue
        pipes.append([float(np.median(x[end])), float(np.median(y[end])), pz0])
    return {'grip': [gx, gy, gz], 'seat': [0.0, sy, sz], 'peg': [px, py, pz], 'height': float(H), 'head': head, 'tail': tail, 'pipes': pipes}


def parts_of(P, idx, front, rear, rake):
    """Which part each triangle belongs to: 0 body, 1 steer, 2 front wheel, 3 rear wheel."""
    c = P[idx].mean(axis=1)
    x, y, z = c[:, 0], c[:, 1], c[:, 2]
    part = np.zeros(len(idx), np.int8)
    def wheel(w):
        return (np.hypot(z - w['z'], y - w['y']) < w['r'] * 1.02) & (np.abs(x) < w['half'] + 0.008)
    # what turns with the bars: near the front axle, inside the fork's reach, below the top of the wheel
    d = np.hypot(z - front['z'], y - front['y'])
    steer = (d < front['r'] * 1.3) & (np.abs(x) < 0.11) & (y < front['y'] + front['r'] * 1.25)
    part[steer] = 1
    part[wheel(front)] = 2
    part[wheel(rear)] = 3
    return part


def resized(raw, size, fmt, quality):
    im = Image.open(io.BytesIO(raw))
    if im.mode not in ('RGB', 'RGBA'): im = im.convert('RGB')
    if im.mode == 'RGBA': im = im.convert('RGB')
    if im.width != size: im = im.resize((size, size), Image.LANCZOS)
    buf = io.BytesIO()
    if fmt == 'jpg': im.save(buf, 'JPEG', quality=quality, optimize=True, progressive=True)
    else: im.save(buf, 'WEBP', quality=quality, method=6)
    return buf.getvalue()


def build(bike_id):
    path = os.path.join(SRC, f'{bike_id}.glb')
    raw = open(path, 'rb').read()
    m = read(path)
    P, N, uv, idx = m['pos'], m['nrm'], m['uv'], m['idx']
    ext = P.max(0) - P.min(0)
    # a file made in centimetres (one of the owner's is: about 98 long) is read in metres-of-the-model like the
    # others: every point divided by the same 100, which changes nothing of its shape
    unit = 100.0 if ext.max() > 5 else 1.0
    P = P / unit; ext = ext / unit
    quarter = 1 if ext[0] > ext[2] else 0          # lying across: a quarter turn brings it lengthways
    P = rot_y(P, quarter); N = rot_y(N, quarter)
    # faces +Z: the bars and the screen (the highest points) are at the front (TURN_ROUND: a bike whose highest points
    # are about its middle, read the other way round by that, is turned round)
    top = P[:, 1] > 0.92 * P[:, 1].max()
    if (P[top, 2].mean() < 0) != (bike_id in TURN_ROUND): P = rot_y(P, 2); N = rot_y(N, 2); quarter += 2
    given = RADIUS.get(bike_id, {})
    twin = bike_id == 'chrome-concept'          # two tyres side by side at each end
    if bike_id in RING_FIT: rear = ring_fit(P, -1); front = ring_fit(P, 1)
    else: rear = fit_wheel(P, -1, given.get('rear'), twin or bike_id in FAT_REAR); front = fit_wheel(P, 1, given.get('front'), twin)
    # stood on the ground between its wheels, centred across
    shift = np.array([-(P[:, 0].max() + P[:, 0].min()) / 2, -min(front['y'] - front['r'], rear['y'] - rear['r']), -(front['z'] + rear['z']) / 2])
    P = P + shift
    for w in (front, rear): w['z'] += shift[2]; w['y'] += shift[1]
    rake = 0.44                                      # radians the fork leans back from upright (about 25 degrees): a first guess
    an = anchors(P, front, rear, N, bike_id)
    # (18 October 2026) each wheel found again as it really is and cut out of the bike exactly where it ends, and what
    # turns with the bars (the mudguard, the fork, the bars, the lamp on a bike without a fairing) cut out round them,
    # about the fork's own line (wheelfit.py)
    P, N, uv, idx, counts, front, rear, rake, steered, an, lamp_turns = wheelfit.bike_parts(
        P, N, uv, idx, front, rear, an, rake, bike_id, anchors_of=lambda Ps, Ns, fw: anchors(Ps, {**front, **fw}, rear, Ns, bike_id))
    os.makedirs(OUT, exist_ok=True)
    # geometry: positions (float32), normals (int16, of 32767), texture places (float32), triangles (uint32)
    n16 = np.round(np.clip(N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9), -1, 1) * 32767).astype(np.int16)
    blob = P.astype(np.float32).tobytes() + n16.tobytes() + (b'\0\0' * (len(P) % 2)) + uv.astype(np.float32).tobytes() + idx.astype(np.uint32).tobytes()
    open(os.path.join(OUT, f'{bike_id}.bin'), 'wb').write(blob)
    files = {'mesh': f'{bike_id}.bin'}
    if MESH_ONLY and bike_id in KNOWN:
        files = KNOWN[bike_id]['files']
    for name, picture in ([] if MESH_ONLY and bike_id in KNOWN else m['images'].items()):
        if picture is None: continue
        data, mime = picture
        im = Image.open(io.BytesIO(data)); size = im.width
        fmt = 'jpg' if name == 'color' else 'webp'
        # 4k: the supplied picture itself where it is 4096 or less; otherwise drawn at 4096
        if size <= 4096 and name != 'rm':
            ext4 = 'jpg' if mime == 'image/jpeg' else 'png'
            four = data
        else:
            ext4 = fmt; four = resized(data, 4096, fmt, 92)
        open(os.path.join(OUT, f'{bike_id}-{name}-4k.{ext4}'), 'wb').write(four)
        open(os.path.join(OUT, f'{bike_id}-{name}-2k.{fmt}'), 'wb').write(resized(data, 2048, fmt, 90))
        files[f'{name}4k'] = f'{bike_id}-{name}-4k.{ext4}'; files[f'{name}2k'] = f'{bike_id}-{name}-2k.{fmt}'
        files[f'{name}Size'] = size
    r4 = lambda v: round(float(v), 4)
    return {
        'master': f'{bike_id}.glb', 'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw),
        'unit': unit, 'vertices': int(len(P)), 'triangles': int(len(idx)), 'parts': counts, 'quarterTurns': quarter % 4,
        'length': r4(P[:, 2].max() - P[:, 2].min()), 'height': r4(P[:, 1].max()), 'width': r4(P[:, 0].max() - P[:, 0].min()),
        'front': {k: r4(v) for k, v in front.items()}, 'rear': {k: r4(v) for k, v in rear.items()}, 'rake': rake, 'steered': steered,
        'grip': [r4(v) for v in an['grip']], 'seat': [r4(v) for v in an['seat']], 'peg': [r4(v) for v in an['peg']],
        'head': [r4(v) for v in an['head']], 'lampTurns': lamp_turns, 'tail': [r4(v) for v in an['tail']], 'pipes': [[r4(v) for v in p] for p in an['pipes']],
        'metallic': m['metallic'], 'roughness': m['roughness'], 'normalScale': m['normalScale'], 'files': files,
    }


def write_js(manifest):
    """The same numbers for the game's own code (what each bike's parts are and where its wheels and rider go)."""
    keep = ('vertices', 'triangles', 'parts', 'length', 'height', 'width', 'front', 'rear', 'rake', 'steered', 'grip', 'seat', 'peg', 'head', 'lampTurns', 'tail', 'pipes', 'metallic', 'roughness', 'normalScale', 'files', 'sha256')
    body = {k: {f: v.get(f, 0) for f in keep} for k, v in sorted(manifest.items())}
    # what a player's device fetches to draw each one: on a phone (the 2048 pictures) and elsewhere (the 4096)
    game = os.path.join(SRC, 'game')
    for k, v in body.items():
        size = lambda name: os.path.getsize(os.path.join(game, v['files'][name])) if name in v['files'] else 0
        v['bytes'] = {'lite': size('mesh') + size('color2k') + size('normal2k') + size('rm2k'), 'full': size('mesh') + size('color4k') + size('normal4k') + size('rm4k')}
    open(os.path.join(ROOT, 'src', 'client', 'bike-parts.js'), 'w').write(
        "// Written by tools/vehicles/bikes.py from the owner's motorcycle files: do not edit by hand.\n"
        "// Each bike's mesh is split by place into body, steer, front wheel and rear wheel (see that tool).\n"
        f'export const BIKE_PARTS = Object.freeze({json.dumps(body, indent=1)});\n')


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    manifest_path = os.path.join(SRC, 'bikes.json')
    manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {}
    KNOWN.update(manifest)
    if '--js' not in sys.argv:
        ids = args or sorted(f[:-4] for f in os.listdir(SRC) if f.endswith('.glb'))
        for bike_id in ids:
            manifest[bike_id] = build(bike_id)
            b = manifest[bike_id]
            print(bike_id, b['triangles'], 'tris; parts', b['parts'], 'front', b['front'], 'rear', b['rear'], 'seat', b['seat'], 'grip', b['grip'], flush=True)
        json.dump(dict(sorted(manifest.items())), open(manifest_path, 'w'), indent=1)
    write_js(manifest)
