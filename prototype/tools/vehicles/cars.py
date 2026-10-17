"""The owner's cars, made ready for the game (17 October 2026). Nothing here writes to a supplied file.

    python3 tools/vehicles/cars.py              writes assets/vehicles/cars/game/, cars.json and src/client/car-parts.js
    python3 tools/vehicles/cars.py --js         only car-parts.js, from cars.json

Each supplied car (assets/vehicles/cars/<id>.glb, the owner's file byte for byte; where it came from is in SOURCES)
is one mesh with one material: body, glass, lamps and wheels are a single piece. To make the wheels turn as the car
rolls and the front ones turn with the steering, the car's own triangles are sorted (by where they are) into five
parts that the game moves separately:

    body          everything that does not move by itself
    front left, front right, rear left, rear right
                  each wheel (tyre and rim): turns about its axle; the front two also turn with the steering

Nothing is added, removed, smoothed or moved within the shape: every triangle of the supplied mesh is kept, with its
own position, normal and texture place. The whole car is only turned and shifted as one (so that it faces +Z, stands
on y = 0 and is centred on its own middle), which changes none of its proportions. (A car is "left" and "right" as
its driver sees it: facing +Z, its left is +X.)

Its pictures (colour; and where the file has them, normal, and metal and roughness) are kept as they are for the 4k
set where they already are 4096 or less; an 8192 picture is drawn at 4096 for the 4k set, and every picture at 2048
for the 2k set (phones). The masters stay in assets/vehicles/cars/ untouched, and their checksums are in cars.json.

Where each car's front is (which way it faced in its file) was read by eye from drawings of every car from each side:
FRONT below. Where the owner sent the same car twice (the same shape and pictures, saved again turned a quarter and
in centimetres), the file kept is named in SOURCES; the other is the same car and is not used.
"""
import hashlib, io, json, os, shutil, struct, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
SRC = os.path.join(ROOT, 'assets', 'vehicles', 'cars')
OUT = os.path.join(SRC, 'game')
UPLOADS = '/root/.claude/uploads/3f191fa3-ee8e-527b-a0b8-298ee034caad'
Image.MAX_IMAGE_PIXELS = None

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}

# The owner's uploads each car's master was copied from (17 October 2026: 01:17, 02:56, 03:09 and 03:14), and which
# way its front faced in that file.
SOURCES = {
    'grey-saloon': ('7d2e43d4-modern_sedan_3d_model.glb', '+z'),
    'classic-two-tone': ('9e868a0c-vintage_car_3d_model.glb', '+z'),
    'black-pickup': ('a618d91c-fordf-150pickup3dmodel.glb', '+x'),
    'yellow-classic-roadster': ('6d162b2d-vintagecar3dmodel.glb', '+x'),
    'blue-off-roader': ('27eedf53-off-roadvehicle3dmodel.glb', '+x'),
    'black-square-suv': ('55f6a96e-mercedes_g-class_3d_model_1.glb', '+z'),
    'camo-expedition': ('10761444-militarysuv3dmodel.glb', '+x'),
    'mint-sports-coupe': ('1e82f450-modern_sports_car_3d_model.glb', '+z'),
    'white-roadster': ('5003ec41-convertible_sports_car_3d_model.glb', '-z'),
    'peach-suv': ('189bdbc6-peachsuv3dmodel.glb', '+x'),
    'black-luxury-suv': ('b07c56cb-luxurysuv3dmodel_1.glb', '+x'),
    'white-square-suv': ('448e186a-mercedesg-class3dmodel.glb', '+x'),
    'grey-grand-tourer': ('a7608979-luxury_car_3d_model_1.glb', '+z'),
    'black-grand-convertible': ('4adbe7a0-luxuryconvertiblecar3dmodel.glb', '-z'),
    'pearl-convertible': ('a91b91c7-luxurycar3dmodel.glb', '+x'),
    'midnight-saloon': ('0f714eb4-luxurycar3dmodel_2.glb', '+x'),
    'state-limousine': ('c18f836d-presidentiallimousine3dmodel.glb', '+x'),
    'bronze-spyder': ('7056424f-sportscar3dmodel.glb', '+z'),
    'red-winged-supercar': ('9a2f9934-ferrarif403dmodel.glb', '+x'),
    'gold-hypercar': ('86b0e021-goldensportscar3dmodel.glb', '+x'),
}
# Where the fit below took in some of the arch round a front tyre as well as the tyre (its radius a fifth more than the
# back's), the tyre's radius as measured by eye from a side drawing of the supplied mesh (the tyre's outer edge), in
# the model's units on a car one unit long.
RADIUS = {'black-luxury-suv': {1: 0.091}, 'white-square-suv': {1: 0.092}}
# quarter turns (rot_y) that bring each front to +Z
QUARTERS = {'+z': 0, '-x': 1, '-z': 2, '+x': 3}


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
        if i is None: return None
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
    """Turns points about the vertical by a quarter turn times `quarter` (no mirroring): (x, z) -> (z, -x) each time."""
    x, y, z = P[:, 0].copy(), P[:, 1].copy(), P[:, 2].copy()
    for _ in range(quarter % 4): x, z = z, -x
    return np.stack([x, y, z], axis=1)


def fit_axle(P, sz, L, half, most=None, fixed=None):
    """The wheels at one end (sz +1 the front): where their tyres touch the ground and the circle each makes (centre
    and radius), read from both sides of the car together (a car's wheels on one axle are the same size)."""
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    ax = np.abs(x)
    quad = (ax > 0.35 * half) & (z * sz > 0.12 * L)
    y0 = float(y[quad].min())
    # where they touch the ground: each run of the lowest points along the car is a candidate (a bumper or a step
    # can come as low as a tyre), and the one with the best circle over it is the wheel
    foot = np.sort(z[quad & (y < y0 + 0.008 * L)])
    runs, cur = [], [foot[0]]
    for v in foot[1:]:
        if v - cur[-1] > 0.02 * L: runs.append(cur); cur = [v]
        else: cur.append(v)
    runs.append(cur)
    # The tyre is what reaches furthest from its axle below it: for a circle standing on the ground at the foot, how
    # far the shape reaches from its middle in each direction through the lower part of it (from 30 to 150 degrees
    # below the level) should be the circle's own radius all round. Too small a circle has the tyre reaching past it;
    # too large has nothing out at its edge. (Counting the points that lie on a circle instead finds the rim as
    # often as the tyre: a tyre's side is points at every radius.)
    best = None
    for run in runs:
        z0 = float(np.median(run))
        side = quad & (ax > 0.55 * half) & (np.abs(z - z0) < 0.2 * L) & (y < y0 + 0.26 * L)
        zz, yy = z[side], y[side] - y0
        for zc in np.arange(z0 - 0.03 * L, z0 + 0.03 * L, 0.002 * L):
            dz = zz - zc
            for R in ([fixed * L] if fixed else np.arange(0.045 * L, (most or 0.125 * L), 0.0015 * L)):
                dy = yy - R
                d = np.hypot(dz, dy)
                ang = np.degrees(np.arctan2(dy, dz))
                near = (d < 1.3 * R) & (ang > -150) & (ang < -30)
                if near.sum() < 12: continue
                bins = ((ang[near] + 150) // 10).astype(int)
                reach = np.zeros(12); np.maximum.at(reach, bins, d[near])
                filled = reach > 0
                if filled.sum() < 9: continue
                err = float(np.mean(np.abs(reach[filled] - R)) / R) + (12 - filled.sum()) * 0.02
                if best is None or err < best[0]: best = (err, float(zc), float(R))
    _, zc, R = best
    return {'z': zc, 'y': y0 + R, 'r': R}


def fit_wheel(P, sx, axle, L, half):
    """One wheel of an axle (sx +1 the car's left): how far across the car it reaches (its outer face and its inner)."""
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    zc, yc, R = axle['z'], axle['y'], axle['r']
    d = np.hypot(z - zc, y - yc)
    disk = (x * sx > 0.35 * half) & (d < 0.97 * R)
    ax = np.abs(x[disk])
    outer = float(np.percentile(ax, 99.5)) if disk.sum() > 20 else half
    inner = max(outer - 0.058 * L, 0.45 * half)
    return {'x': round(sx * (outer + inner) / 2, 5), 'outer': outer, 'inner': inner, 'y': yc, 'z': zc, 'r': R}


def parts_of(P, idx, wheels, L):
    """Which part each triangle belongs to: 0 body, then each wheel in the order given (all three of its corners
    within the wheel's circle and between its faces)."""
    part = np.zeros(len(idx), np.int8)
    T = P[idx]                      # (n, 3 corners, 3)
    for k, w in enumerate(wheels):
        sx = 1 if w['x'] > 0 else -1
        ax = T[:, :, 0] * sx
        d = np.hypot(T[:, :, 2] - w['z'], T[:, :, 1] - w['y'])
        inside = (d < w['r'] * 1.015).all(1) & (ax > w['inner'] - 0.004 * L).all(1) & (ax < w['outer'] + 0.006 * L).all(1)
        part[inside & (part == 0)] = k + 1
    return part


def lamps(P, L, half, H):
    """Where the headlamps and the tail lamps are: on the front and the back of the car, a little in from each side,
    at the height of the lamps (the furthest point forward, or back, at that height and across)."""
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    out = {}
    for name, sz, (ya, yb) in (('head', 1, (0.3, 0.55)), ('tail', -1, (0.38, 0.65))):
        band = (y > ya * H) & (y < yb * H) & (np.abs(x) > 0.45 * half) & (np.abs(x) < 0.85 * half) & (z * sz > 0.3 * L)
        if band.sum() < 6: band = (y > 0.25 * H) & (y < 0.7 * H) & (z * sz > 0.3 * L)
        end = z[band] * sz
        lim = np.percentile(end, 97)
        pick = band & (z * sz >= lim - 0.01 * L)
        out[name] = [round(float(np.median(np.abs(x[pick]))), 4), round(float(np.median(y[pick])), 4), round(float(sz * np.percentile(end, 99)), 4)]
    return out


def resized(raw, size, fmt, quality):
    im = Image.open(io.BytesIO(raw))
    if im.mode not in ('RGB', 'RGBA'): im = im.convert('RGB')
    if im.mode == 'RGBA': im = im.convert('RGB')
    if im.width != size: im = im.resize((size, size), Image.LANCZOS)
    buf = io.BytesIO()
    if fmt == 'jpg': im.save(buf, 'JPEG', quality=quality, optimize=True, progressive=True)
    else: im.save(buf, 'WEBP', quality=quality, method=6)
    return buf.getvalue()


def build(car_id):
    name, front = SOURCES[car_id]
    path = os.path.join(SRC, f'{car_id}.glb')
    if not os.path.exists(path):
        os.makedirs(SRC, exist_ok=True)
        shutil.copyfile(os.path.join(UPLOADS, name), path)
    raw = open(path, 'rb').read()
    m = read(path)
    P, N, uv, idx = m['pos'], m['nrm'], m['uv'], m['idx']
    ext = P.max(0) - P.min(0)
    unit = 100.0 if ext.max() > 5 else 1.0          # (a file saved in centimetres: every point divided by the same 100)
    P = P / unit
    q = QUARTERS[front]
    P = rot_y(P, q); N = rot_y(N, q)
    # centred across and along, standing on the ground
    P = P - np.array([(P[:, 0].max() + P[:, 0].min()) / 2, P[:, 1].min(), (P[:, 2].max() + P[:, 2].min()) / 2])
    L = float(P[:, 2].max() - P[:, 2].min()); H = float(P[:, 1].max())
    # how wide the body is at the height of the wheels (below the mirrors, and below a door that stands open)
    low = (P[:, 1] > 0.04 * L) & (P[:, 1] < 0.12 * L)
    half = float(np.percentile(np.abs(P[low, 0]), 99.8))
    given = RADIUS.get(car_id, {})
    axles = {sz: fit_axle(P, sz, L, half, fixed=given.get(sz)) for sz in (1, -1)}
    # (a car's wheels front and back are near enough the same size: one found a fifth bigger than the other has taken
    # in the arch round it, and is found again no bigger than the other allows)
    small, big = sorted((1, -1), key=lambda sz: axles[sz]['r'])
    if axles[big]['r'] > 1.15 * axles[small]['r'] and big not in given: axles[big] = fit_axle(P, big, L, half, most=1.1 * axles[small]['r'])
    wheels = [fit_wheel(P, sx, axles[sz], L, half) for sz, sx in ((1, 1), (1, -1), (-1, 1), (-1, -1))]
    part = parts_of(P, idx, wheels, L)
    order = np.argsort(part, kind='stable')
    idx = idx[order]; part = part[order]
    counts = [int((part == k).sum()) for k in range(5)]
    os.makedirs(OUT, exist_ok=True)
    # geometry: positions (float32), normals (int16, of 32767), texture places (float32), triangles (uint32)
    n16 = np.round(np.clip(N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9), -1, 1) * 32767).astype(np.int16)
    blob = P.astype(np.float32).tobytes() + n16.tobytes() + (b'\0\0' * (len(P) % 2)) + uv.astype(np.float32).tobytes() + idx.astype(np.uint32).tobytes()
    open(os.path.join(OUT, f'{car_id}.bin'), 'wb').write(blob)
    files = {'mesh': f'{car_id}.bin'}
    for kind, picture in m['images'].items():
        if picture is None: continue
        data, mime = picture
        im = Image.open(io.BytesIO(data)); size = im.width
        fmt = 'jpg' if kind == 'color' else 'webp'
        if size <= 4096 and kind != 'rm':
            ext4 = 'jpg' if mime == 'image/jpeg' else 'png'
            four = data
        else:
            ext4 = fmt; four = resized(data, 4096, fmt, 92)
        open(os.path.join(OUT, f'{car_id}-{kind}-4k.{ext4}'), 'wb').write(four)
        open(os.path.join(OUT, f'{car_id}-{kind}-2k.{fmt}'), 'wb').write(resized(data, 2048, fmt, 90))
        files[f'{kind}4k'] = f'{car_id}-{kind}-4k.{ext4}'; files[f'{kind}2k'] = f'{car_id}-{kind}-2k.{fmt}'
        files[f'{kind}Size'] = size
    r4 = lambda v: round(float(v), 4)
    return {
        'master': f'{car_id}.glb', 'source': name, 'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw),
        'unit': unit, 'front': front, 'vertices': int(len(P)), 'triangles': int(len(idx)), 'parts': counts,
        'length': r4(L), 'height': r4(H), 'width': r4(P[:, 0].max() - P[:, 0].min()), 'body': r4(2 * half),
        'wheels': [{k: r4(v) for k, v in w.items()} for w in wheels], 'lamps': lamps(P, L, half, H),
        'metallic': m['metallic'], 'roughness': m['roughness'], 'normalScale': m['normalScale'], 'files': files,
    }


def write_js(manifest):
    """The same numbers for the game's own code: each car's parts, its size, where its wheels and lamps are."""
    keep = ('vertices', 'triangles', 'parts', 'length', 'height', 'width', 'body', 'wheels', 'lamps', 'metallic', 'roughness', 'normalScale', 'files', 'sha256')
    body = {k: {f: v[f] for f in keep} for k, v in sorted(manifest.items())}
    game = os.path.join(SRC, 'game')
    for k, v in body.items():
        size = lambda name: os.path.getsize(os.path.join(game, v['files'][name])) if name in v['files'] else 0
        v['bytes'] = {'lite': size('mesh') + size('color2k') + size('normal2k') + size('rm2k'), 'full': size('mesh') + size('color4k') + size('normal4k') + size('rm4k')}
    open(os.path.join(ROOT, 'src', 'client', 'car-parts.js'), 'w').write(
        "// Written by tools/vehicles/cars.py from the owner's car files: do not edit by hand.\n"
        "// Each car's mesh is split by place into its body and its four wheels (front left, front right, rear left,\n"
        "// rear right; see that tool). Sizes are in the model's own units, the car facing +Z with its left at +X.\n"
        f'export const CAR_PARTS = Object.freeze({json.dumps(body, indent=1)});\n')


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    manifest_path = os.path.join(SRC, 'cars.json')
    manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {}
    if '--js' not in sys.argv:
        for car_id in (args or sorted(SOURCES)):
            manifest[car_id] = build(car_id)
            c = manifest[car_id]
            print(car_id, c['triangles'], 'tris; parts', c['parts'], 'L', c['length'], 'W', c['width'], 'body', c['body'], 'H', c['height'], 'wheels', [(w['z'], w['r']) for w in c['wheels']], flush=True)
        json.dump(dict(sorted(manifest.items())), open(manifest_path, 'w'), indent=1)
    write_js(manifest)
