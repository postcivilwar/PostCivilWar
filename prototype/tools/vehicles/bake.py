"""Bakes the supplied keke and bus models into the kit the game loads.

    python3 tools/vehicles/bake.py

Reads   assets/vehicles/keke/canonical_keke*.glb, assets/vehicles/bus/canonical_ivm_bus.glb
Writes  src/client/vehicle-kit-data.js          the parts, at three levels of detail
        assets/vehicles/*/textures/*.png        the textures pulled out of the models
        assets/vehicles/*/materials/materials.json
        assets/vehicles/manifest.json           sizes, counts and the masters' checksums

The supplied files are only read. Shapes are never redrawn: lower levels of
detail are made piece by piece from the master (see lod.py).
"""
import os, sys, io, json, time, hashlib, base64
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.append(os.path.join(HERE, '..', 'characters'))
import numpy as np
from PIL import Image
from scipy.spatial import cKDTree
import meshkit as mk
import source, lod, glbwrite
from vkit import Kit, SLOT, SLOTS

ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
ASSETS = os.path.join(ROOT, 'assets', 'vehicles')
OUT = os.path.join(ROOT, 'src', 'client', 'vehicle-kit-data.js')

KEKE_FILES = {'modern': 'keke/canonical_keke.glb', 'classic': 'keke/canonical_keke_classic.glb', 'tvs': 'keke/canonical_keke_tvs.glb'}
BUS_FILE = 'bus/canonical_ivm_bus.glb'

KEKE_SLOTS = {'Weathered transport yellow': 'paint', 'Black woven canopy': 'canopy', 'Black vinyl upholstery': 'vinyl', 'Brushed wheel alloy': 'alloy', 'Dark trim': 'trim', 'Headlamp lens': 'lens',
              'Smoked windshield': 'glass', 'Steel chassis': 'steel', 'Tail lamps': 'tail', 'Tyres and seals': 'rubber', 'Worn floor': 'floor', 'Amber indicator': 'amber'}
BUS_SLOTS = {'IVM CNG green enamel': 'paint', 'Ivory white bodywork': 'paint2', 'Black window surround': 'trim', 'Blue cabin lighting': 'cabinlight', 'Blue passenger upholstery': 'seat',
             'Blue pleated curtains': 'curtain', 'Brushed aluminium': 'alloy', 'Cabin charcoal flooring': 'floor', 'Chassis and dashboard': 'chassis', 'Headlight clear reflector': 'lens',
             'Indicator amber': 'amber', 'Rear red lens': 'tail', 'Tinted teal glass': 'glass', 'Tyre rubber': 'rubber', 'Original IVM seat branding': 'seatmark', 'Original photographed IVM badge': 'badge'}
LAMPS = ('lens', 'tail', 'amber')
CABIN = ('seat', 'curtain', 'floor', 'cabinlight')

sha = lambda path: hashlib.sha256(open(path, 'rb').read()).hexdigest()
lin = lambda c: ((c / 255.0 + 0.055) / 1.055) ** 2.4 if c > 10.3 else c / 255.0 / 12.92
r5 = lambda v: [round(float(x), 5) for x in v]


def load(rel, table):
    """Every piece of a supplied model, tagged with its slot and the pivot it hangs from."""
    src = source.read(os.path.join(ASSETS, rel))
    parts = []
    for e in src['meshes']:
        m = mk.copy(e['mesh']); slot = table[e['material']]
        m['slot'][:] = SLOT[slot]
        parts += lod.tagged(m, slot=slot, pivot=e['pivot'], node=e['node'])
    return src, parts


def moved(parts, offset):
    out = []
    for p in parts:
        q = dict(p); q['mesh'] = mk.copy(p['mesh']); q['mesh']['pos'] = q['mesh']['pos'] + offset
        q['lo'] = p['lo'] + offset; q['hi'] = p['hi'] + offset
        out.append(q)
    return out


def turned(m, yaw=0.0, offset=(0, 0, 0)):
    c, s = np.cos(yaw), np.sin(yaw)
    M = np.eye(4); M[:3, :3] = [[c, 0, s], [0, 1, 0], [-s, 0, c]]; M[:3, 3] = offset
    return mk.transform(m, M)


def same_shape(a, b, tol=1.5e-3):
    """True when two point sets cover each other."""
    if abs(len(a) - len(b)) > 0.02 * len(a): return False
    return cKDTree(a).query(b)[0].max() < tol and cKDTree(b).query(a)[0].max() < tol


def signature(p):
    return (p['slot'], p['tris'], tuple(np.round(p['lo'], 3)), tuple(np.round(p['hi'], 3)))


def finish(m):
    """Joins vertices that agree in every attribute the game uses."""
    return mk.weld(m, by=('pos', 'nrm', 'uv', 'slot'))


def raycast(m, origin, direction):
    """The nearest point where a ray meets a mesh, and the surface normal there (or None)."""
    o = np.asarray(origin, float); d = np.asarray(direction, float); d = d / np.linalg.norm(d)
    a = m['pos'][m['idx'][:, 0]]; e1 = m['pos'][m['idx'][:, 1]] - a; e2 = m['pos'][m['idx'][:, 2]] - a
    h = np.cross(d, e2); det = (e1 * h).sum(1)
    ok = np.abs(det) > 1e-12
    inv = np.where(ok, 1.0 / np.where(ok, det, 1), 0)
    s = o - a; u = (s * h).sum(1) * inv
    q = np.cross(s, e1); v = (q @ d) * inv; t = (e2 * q).sum(1) * inv
    hit = ok & (u >= -1e-9) & (v >= -1e-9) & (u + v <= 1 + 1e-9) & (t > 1e-6)
    if not hit.any(): return None
    k = np.flatnonzero(hit)[np.argmin(t[hit])]
    n = np.cross(e1[k], e2[k]); n /= np.linalg.norm(n)
    if n @ d > 0: n = -n
    return o + d * t[k], n


def panel(m, at, size, toward, lift=0.004, follow=False):
    """A flat panel on the vehicle's surface near `at`, found by looking at the vehicle from outside along `toward`.

    It stands square to the line of sight, at the depth of the surface in its
    middle; with `follow` it lies in the plane of the surface under its four
    corners instead (for sloping glass). Its corners come back in the order
    bottom left, bottom right, top right, top left as someone reading it sees them.
    """
    toward = np.asarray(toward, float); toward = toward / np.linalg.norm(toward)
    up = np.array([0.0, 1.0, 0.0]); across = np.cross(toward, up)
    at = np.asarray(at, float)
    origin = at - toward * (at @ toward) - toward * 9.0
    offsets = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
    square = np.array([origin + across * sx * size[0] / 2 + up * sy * size[1] / 2 for sx, sy in offsets])
    mid = raycast(m, origin, toward)
    if follow:
        hits = [raycast(m, c, toward) for c in square]
        if any(h is None for h in hits): return None
        corners = np.array([h[0] for h in hits])
        n = np.cross(corners[1] - corners[0], corners[3] - corners[0]); n /= np.linalg.norm(n)
        if n @ toward > 0: n = -n
        front = max([float(c @ n) for c in corners] + ([float(mid[0] @ n)] if mid is not None else []))
        flat = corners + np.outer(front - corners @ n + lift, n)
    else:
        if mid is None: return None
        n = -toward
        depth = float((mid[0] - origin) @ toward)
        flat = square + toward * (depth - lift)
    return {'corners': [r5(c) for c in flat], 'normal': r5(n)}


def texture_ratio(image_bytes, size):
    """A texture as wear only: each pixel's brightness against the texture's average, 200 = unchanged."""
    im = Image.open(io.BytesIO(image_bytes)).convert('RGB').resize((size, size), Image.LANCZOS)
    a = np.asarray(im).astype(float)
    luma = a @ [0.2126, 0.7152, 0.0722]
    out = np.clip(luma / luma.mean() * 200, 0, 255).astype(np.uint8)
    mean = np.asarray(Image.open(io.BytesIO(image_bytes)).convert('RGB')).reshape(-1, 3).mean(0)
    return Image.fromarray(out, 'L'), [lin(c) for c in mean]


def data_uri(image, fmt, **kw):
    b = io.BytesIO(); image.save(b, fmt, **kw)
    return f"data:image/{'jpeg' if fmt == 'JPEG' else 'png'};base64," + base64.b64encode(b.getvalue()).decode(), len(b.getvalue())


def surfaces(src, table, extra=None):
    """Colour and finish of each slot, as the supplied materials give them."""
    colours = {}; finish_ = {}
    for name, slot in table.items():
        mat = src['materials'][name]; pbr = mat.get('pbrMetallicRoughness', {})
        c = pbr.get('baseColorFactor', [1, 1, 1, 1])
        colours[slot] = [round(x, 4) for x in c[:3]]
        finish_[slot] = [round(pbr.get('roughnessFactor', 1), 3), round(pbr.get('metallicFactor', 1), 3)]
        if slot == 'glass': finish_['glassOpacity'] = round(c[3], 3)
    colours.update(extra or {})
    return colours, finish_


def count(m): return 0 if m is None else len(m['idx'])


def lod_materials(table, colours, fin, extra=None):
    """Materials for an exported level of detail, named as the supplied model names them."""
    out = {}
    for name, slot in table.items():
        out[SLOT[slot]] = {'name': name, 'colour': colours[slot], 'roughness': fin[slot][0], 'metalness': fin[slot][1], **({'opacity': fin['glassOpacity']} if slot == 'glass' else {})}
    for slot, name in (extra or {}).items():
        out[SLOT[slot]] = {'name': name, 'colour': colours[slot], 'roughness': fin[slot][0], 'metalness': fin[slot][1]}
    return out


def true_up(wheel, radius):
    """A reduced wheel, let out again so its tread still reaches the ground: the reduction cuts corners off the circle."""
    r = np.hypot(wheel['pos'][:, 1], wheel['pos'][:, 2]).max()
    out = mk.copy(wheel)
    out['pos'] = wheel['pos'] * [1, radius / r, radius / r]
    return out


# ------------------------------------------------------------------- keke --

def bake_keke(kit, report):
    loaded = {trim: load(rel, KEKE_SLOTS) for trim, rel in KEKE_FILES.items()}
    src = loaded['modern'][0]
    piv = src['pivots']
    steer = piv['Steering_Pivot']['at']
    wheel_at = {name: piv[name]['at'] for name in ('Wheel_Front', 'Wheel_Rear_Left', 'Wheel_Rear_Right')}

    body = {t: [p for p in parts if p['pivot'] is None] for t, (_, parts) in loaded.items()}
    fork = {t: moved([p for p in parts if p['pivot'] == 'Steering_Pivot'], -steer) for t, (_, parts) in loaded.items()}
    wheel = moved([p for p in loaded['modern'][1] if p['pivot'] == 'Wheel_Front'], -wheel_at['Wheel_Front'])
    # the three wheels of all three models are one wheel
    ref = mk.merge([p['mesh'] for p in wheel])['pos']
    for t, (s, parts) in loaded.items():
        for name in wheel_at:
            other = mk.merge([p['mesh'] for p in parts if p['pivot'] == name])['pos'] - s['pivots'][name]['at']
            assert same_shape(ref, other), f'keke {t} {name} is not the same wheel'
        assert np.allclose(s['pivots']['Steering_Pivot']['at'], steer) and all(np.allclose(s['pivots'][n]['at'], wheel_at[n]) for n in wheel_at)
    # what the three bodies share, and what belongs to each front
    sigs = {t: {signature(p) for p in ps} for t, ps in body.items()}
    common = sigs['modern'] & sigs['classic'] & sigs['tvs']
    shared = [p for p in body['modern'] if signature(p) in common]
    front = {t: [p for p in ps if signature(p) not in common] for t, ps in body.items()}

    is_knob = lambda p: p['slot'] == 'rubber' and p['diag'] < 0.12
    is_bolt = lambda p: p['slot'] in ('trim', 'steel') and p['diag'] < 0.12
    def near_wheel(p):
        if is_knob(p): return 'plain'              # a tread block is 7 cm long: its bevel is under a millimetre on screen
        if is_bolt(p): return ('qem', 0.25, 40)
        return 'keep'
    def mid_wheel(p):
        if is_knob(p) or is_bolt(p): return 'drop'
        return ('qem', 0.25 if p['slot'] == 'rubber' else 0.3, 40)
    def far_wheel(p):
        if is_knob(p) or is_bolt(p): return 'drop'
        if p['slot'] == 'rubber': return ('qem', 0.08, 56)
        return ('qem', 0.1, 24) if p['diag'] > 0.3 else 'drop'
    near_body = lambda p: 'keep'
    def mid_body(p):
        if p['slot'] == 'glass': return 'keep'
        if p['diag'] < 0.05: return 'drop'
        return ('plain', ('qem', 0.3, 20))
    def far_body(p):
        if p['slot'] == 'glass': return ('plain', ('qem', 0.4, 12))
        if p['diag'] < (0.1 if p['slot'] in LAMPS else 0.3): return 'drop'
        return ('plain', ('qem', 0.2 if p['slot'] in ('paint', 'canopy') else 0.1, 12))

    stats = {}; made = {}; empty = {}
    def put(pid, parts, rules, uv=True, fix=None):
        stats[pid] = []
        for level, rule in enumerate(rules):
            m, note = lod.reduce(parts, rule)
            if fix: m = fix(m, level)
            before = count(m)
            m = finish(m); made[(pid, level)] = m
            if level == 0: empty[pid] = before - count(m)       # triangles of no area in the supplied mesh, which joining its vertices removes
            kit.add(pid, m, level, uv=uv); stats[pid].append(count(m))
        return stats[pid]

    put('keke.body', shared, (near_body, mid_body))
    for t in KEKE_FILES:
        put(f'keke.front.{t}', front[t], (near_body, mid_body))
        put(f'keke.fork.{t}', fork[t], (near_body, mid_body))
    radius = float(ref[:, 1].max())
    put('keke.wheel', wheel, (near_wheel, mid_wheel), fix=lambda m, level: true_up(m, radius) if level else m)
    # far off, the whole keke is one still piece: body, fork and the three wheels as they stand
    for t in KEKE_FILES:
        b, _ = lod.reduce(shared + front[t] + moved(fork[t], steer), far_body)
        w, _ = lod.reduce(wheel, far_wheel)
        w = true_up(w, radius)
        far = mk.merge([b] + [turned(w, 0, at) for at in wheel_at.values()])
        far = finish(far); made[(f'keke.far.{t}', 0)] = far
        kit.add(f'keke.far.{t}', far, 0, uv=True); stats[f'keke.far.{t}'] = [count(far)]

    full = mk.merge([p['mesh'] for p in body['modern']])
    lo = full['pos'].min(0); hi = full['pos'].max(0)
    everything = mk.merge([p['mesh'] for p in loaded['modern'][1]])
    alo = everything['pos'].min(0); ahi = everything['pos'].max(0)
    paint_only = mk.merge([p['mesh'] for p in body['modern'] if p['slot'] in ('paint', 'canopy', 'lens', 'rubber', 'trim')])
    # textures: the model's own, kept as wear over whatever colour the keke is painted
    g = src['glb']; names = [im.get('name') for im in g.json['images']]
    wear, paint_mean = texture_ratio(g.image(names.index('yellow')), 512)
    weave, cloth_mean = texture_ratio(g.image(names.index('fabric')), 256)
    os.makedirs(os.path.join(ASSETS, 'keke', 'textures'), exist_ok=True)
    wear.save(os.path.join(ASSETS, 'keke', 'textures', 'paint_wear.png')); weave.save(os.path.join(ASSETS, 'keke', 'textures', 'canopy_weave.png'))
    for k, name in enumerate(names): Image.open(io.BytesIO(g.image(k))).save(os.path.join(ASSETS, 'keke', 'textures', f'source_{name}.png'))
    wear_uri, wear_bytes = data_uri(wear, 'JPEG', quality=82); weave_uri, weave_bytes = data_uri(weave, 'JPEG', quality=80)
    colours, fin = surfaces(src, KEKE_SLOTS, {'paint': [round(c, 4) for c in paint_mean], 'canopy': [round(c, 4) for c in cloth_mean], 'vinyl': [round(c, 4) for c in cloth_mean]})
    floors = {t: surfaces(s, KEKE_SLOTS)[0]['floor'] for t, (s, _) in loaded.items()}

    rear = panel(paint_only, (0, 0.87, 0), (0.3, 0.1), (0, 0, 1))
    flap = panel(paint_only, (0, 1.15, 0), (0.96, 0.17), (0, 0, 1))
    tub = panel(paint_only, (0, 0.655, 0), (0.5, 0.2), (0, 0, 1))
    side_l = panel(paint_only, (0, 0.66, -0.86), (0.42, 0.2), (-1, 0, 0))
    side_r = panel(paint_only, (0, 0.66, -0.86), (0.42, 0.2), (1, 0, 0))
    tub_half = float(max(abs(q['lo'][0]) if q['lo'][0] < 0 else 0 for q in body['modern'] if q['slot'] == 'paint'))
    meta = {
        'name': 'Keke', 'trims': list(KEKE_FILES), 'lods': 3,
        'size': {'width': round(float(ahi[0] - alo[0]), 3), 'body': round(2 * tub_half, 3), 'height': round(float(ahi[1]), 3), 'length': round(float(ahi[2] - alo[2]), 3), 'front': round(float(ahi[2]), 3), 'back': round(float(alo[2]), 3)},
        'wheelRadius': round(float(ref[:, 1].max()), 3),
        'steer': [{'at': r5(steer), 'part': 'keke.fork.{trim}'}],
        'wheels': [{'at': r5(wheel_at['Wheel_Front']), 'yaw': 0, 'steer': 0}, {'at': r5(wheel_at['Wheel_Rear_Left']), 'yaw': 0}, {'at': r5(wheel_at['Wheel_Rear_Right']), 'yaw': 0}],
        'parts': {'body': ['keke.body', 'keke.front.{trim}'], 'wheel': 'keke.wheel', 'far': 'keke.far.{trim}'},
        'seats': {'driver': [0, 0.882, 0.27], 'passengers': [[-0.31, 0.915, -0.78], [0.31, 0.915, -0.78], [0, 0.915, -0.78]], 'floor': 0.459},
        'panels': {'plateRear': rear, 'flap': flap, 'tub': tub, 'sideLeft': side_l, 'sideRight': side_r},
        'colours': colours, 'finish': fin, 'floors': floors,
        'textures': {'wear': wear_uri, 'weave': weave_uri}, 'detail': {'paint': 'wear', 'canopy': 'weave', 'vinyl': 'weave'},
    }
    report['keke'] = {'masters': {t: {'file': rel, 'sha256': sha(os.path.join(ASSETS, rel)), 'triangles': sum(p['tris'] for p in loaded[t][1])} for t, rel in KEKE_FILES.items()},
                      'triangles': stats, 'empty_triangles_dropped': empty, 'shared_body_pieces': len(shared), 'front_pieces': {t: len(front[t]) for t in front}, 'texture_bytes': {'wear': wear_bytes, 'weave': weave_bytes},
                      'drawn': {'near': stats['keke.body'][0] + stats['keke.front.modern'][0] + stats['keke.fork.modern'][0] + 3 * stats['keke.wheel'][0],
                                'middle': stats['keke.body'][1] + stats['keke.front.modern'][1] + stats['keke.fork.modern'][1] + 3 * stats['keke.wheel'][1], 'far': stats['keke.far.modern'][0]}}
    json.dump({'slots': {slot: {'from': name, 'colour': colours[slot], 'roughness': fin[slot][0], 'metalness': fin[slot][1]} for name, slot in KEKE_SLOTS.items()}}, open(os.path.join(ASSETS, 'keke', 'materials', 'materials.json'), 'w'), indent=1)
    # each level of each front as a file other tools can open, with the supplied model's node names
    files = {}
    os.makedirs(os.path.join(ASSETS, 'keke', 'lod'), exist_ok=True)
    for t in KEKE_FILES:
        mats = lod_materials(KEKE_SLOTS, {**colours, 'floor': floors[t]}, fin)
        stem = 'keke' if t == 'modern' else f'keke_{t}'
        for level in (0, 1):
            w = made[('keke.wheel', level)]
            nodes = [{'name': 'Keke_Root', 'children': ['Body', 'Steering_Pivot', 'Wheel_Rear_Left', 'Wheel_Rear_Right']},
                     {'name': 'Body', 'mesh': mk.merge([made[('keke.body', level)], made[(f'keke.front.{t}', level)]])},
                     {'name': 'Steering_Pivot', 'translation': steer, 'children': ['Fork', 'Wheel_Front']}, {'name': 'Fork', 'mesh': made[(f'keke.fork.{t}', level)]},
                     {'name': 'Wheel_Front', 'translation': wheel_at['Wheel_Front'] - steer, 'mesh': w},
                     {'name': 'Wheel_Rear_Left', 'translation': wheel_at['Wheel_Rear_Left'], 'mesh': w}, {'name': 'Wheel_Rear_Right', 'translation': wheel_at['Wheel_Rear_Right'], 'mesh': w}]
            files[f'{stem}_lod{level}.glb'] = glbwrite.write(os.path.join(ASSETS, 'keke', 'lod', f'{stem}_lod{level}.glb'), nodes, mats)
        files[f'{stem}_lod2.glb'] = glbwrite.write(os.path.join(ASSETS, 'keke', 'lod', f'{stem}_lod2.glb'), [{'name': 'Keke_Root', 'children': ['Body']}, {'name': 'Body', 'mesh': made[(f'keke.far.{t}', 0)]}], mats)
    report['keke']['lod_files'] = files
    return meta


# -------------------------------------------------------------------- bus --

def bake_bus(kit, report):
    src, parts = load(BUS_FILE, BUS_SLOTS)
    piv = src['pivots']
    names = ('Wheel_Front_Left', 'Wheel_Front_Right', 'Wheel_Rear_Left', 'Wheel_Rear_Right')
    at = {n: piv[n]['at'] for n in names}
    wheel = moved([p for p in parts if p['pivot'] == 'Wheel_Front_Left'], -at['Wheel_Front_Left'])
    ref = mk.merge([p['mesh'] for p in wheel])
    # the other front wheel is this one turned round; each rear pivot carries two of them side by side
    gap = 0.24
    def stands(name, placements):
        got = mk.merge([p['mesh'] for p in parts if p['pivot'] == name])['pos'] - at[name]
        want = np.concatenate([turned(ref, yaw, off)['pos'] for yaw, off in placements])
        return same_shape(want, got, tol=3e-3)
    assert stands('Wheel_Front_Right', [(np.pi, (0, 0, 0))]), 'front right wheel differs'
    assert stands('Wheel_Rear_Left', [(0, (0, 0, 0)), (0, (gap, 0, 0))]), 'rear left wheels differ'
    assert stands('Wheel_Rear_Right', [(np.pi, (0, 0, 0)), (np.pi, (-gap, 0, 0))]), 'rear right wheels differ'
    wheels = [{'at': r5(at['Wheel_Front_Left']), 'yaw': 0, 'steer': 0}, {'at': r5(at['Wheel_Front_Right']), 'yaw': round(np.pi, 5), 'steer': 1},
              {'at': r5(at['Wheel_Rear_Left']), 'yaw': 0}, {'at': r5(at['Wheel_Rear_Left'] + [gap, 0, 0]), 'yaw': 0},
              {'at': r5(at['Wheel_Rear_Right']), 'yaw': round(np.pi, 5)}, {'at': r5(at['Wheel_Rear_Right'] - [gap, 0, 0]), 'yaw': round(np.pi, 5)}]

    body = [p for p in parts if p['pivot'] is None]
    # The supplied coach carries its maker's name front and rear and two photographed logos (on the
    # nose, the steering wheel and the seat backs). None of that goes into the game: these pieces are
    # found here and left out of everything the bake writes.
    def is_mark(p):
        if p['slot'] in ('seatmark', 'badge'): return True
        if p['slot'] == 'alloy' and p['lo'][2] > 5.84 and p['lo'][1] > 1.2 and p['hi'][1] < 1.36 and abs(p['lo'][0]) < 0.3 and abs(p['hi'][0]) < 0.3: return True
        if p['slot'] == 'chassis' and p['hi'][2] < -5.6 and p['lo'][1] > 1.85 and p['hi'][1] < 2.05 and p['diag'] < 0.3: return True
        return False
    is_letter = lambda p: p['slot'] == 'paint' and p['diag'] < 0.32 and p['lo'][1] > 1.78 and p['hi'][1] < 2.06 and abs(abs(p['lo'][0]) - 1.275) < 0.02
    marks = [p for p in body if is_mark(p)]
    letters = [p for p in marks if p['slot'] in ('alloy', 'chassis')]
    assert len(letters) == 14, f'expected the 14 letters of the name twice over, found {len(letters)}'
    assert len(marks) == 14 + 36 + 2, f'expected 14 letters, 36 seat logos and 2 badges, found {len(marks)}'
    # the lettering and the three stripes on each side can be painted apart from the body
    is_stripe = lambda p: p['slot'] == 'paint' and p['tris'] == 2 and p['lo'][1] > 1.55 and p['hi'][1] < 2.2
    accents = 0
    for p in body:
        if is_letter(p) or is_stripe(p):
            p['slot'] = 'accent'; p['mesh']['slot'][:] = SLOT['accent']; accents += 1
    assert accents == 18, f'expected 12 letters and 6 stripes, found {accents}'
    is_letter = lambda p: p['slot'] == 'accent' and p['tris'] > 2
    cabin = [p for p in body if p['slot'] in CABIN and not is_mark(p)]
    shell = [p for p in body if p['slot'] not in CABIN and not is_mark(p)]

    is_knob = lambda p: p['slot'] == 'rubber' and p['diag'] < 0.3
    def near_wheel(p): return 'plain' if is_knob(p) else 'keep'
    def mid_wheel(p):
        if is_knob(p) or p['diag'] < 0.12: return 'drop'
        return ('qem', 0.2 if p['slot'] == 'rubber' else 0.4, 40)
    def far_wheel(p):
        if is_knob(p) or p['diag'] < 0.5: return 'drop'
        return ('qem', 0.09, 80) if p['slot'] == 'rubber' else ('qem', 0.2, 24)
    def near_shell(p):
        if is_letter(p): return 'keep'
        if p['slot'] in ('trim', 'chassis'): return 'chamfer'
        if p['slot'] == 'glass': return 'plain'
        return 'keep'
    def mid_shell(p):
        if is_letter(p): return 'keep'
        if p['slot'] == 'glass': return ('plain', ('qem', 0.5, 16))
        if p['diag'] < (0.08 if p['slot'] in LAMPS else 0.14): return 'drop'
        return ('plain', ('qem', 0.3, 24))
    def far_shell(p):
        if p['slot'] == 'glass': return ('plain', ('qem', 0.3, 12))
        if p['diag'] < (0.18 if p['slot'] in LAMPS else 0.55): return 'drop'
        return ('plain', ('qem', 0.1, 12))
    def near_cabin(p): return 'plain' if p['slot'] == 'curtain' else 'chamfer' if p['slot'] == 'seat' else 'keep'
    def mid_cabin(p): return 'drop' if p['diag'] < 0.3 else ('plain', ('qem', 0.3, 12))

    stats = {}
    radius = float(ref['pos'][:, 1].max()); made = {}
    def put(pid, pieces_, rules, uv=False, fix=None):
        stats[pid] = []
        for level, rule in enumerate(rules):
            m, note = lod.reduce(pieces_, rule)
            if fix: m = fix(m, level)
            m = finish(m); made[(pid, level)] = m
            kit.add(pid, m, level, uv=uv); stats[pid].append(count(m))
    put('bus.shell', shell, (near_shell, mid_shell))
    put('bus.cabin', cabin, (near_cabin, mid_cabin))
    put('bus.wheel', wheel, (near_wheel, mid_wheel), fix=lambda m, level: true_up(m, radius) if level else m)
    b, _ = lod.reduce(shell, far_shell); w, _ = lod.reduce(wheel, far_wheel)
    w = true_up(w, radius)
    far = mk.merge([b] + [turned(w, wh['yaw'], wh['at']) for wh in wheels])
    far = finish(far); made[('bus.far', 0)] = far
    kit.add('bus.far', far, 0); stats['bus.far'] = [count(far)]

    everything = mk.merge([p['mesh'] for p in parts]); alo = everything['pos'].min(0); ahi = everything['pos'].max(0)
    hull = mk.merge([p['mesh'] for p in shell if p['slot'] in ('paint', 'paint2', 'trim', 'chassis')])
    skin = mk.merge([p['mesh'] for p in shell if p['slot'] in ('paint', 'paint2')])
    glass = mk.merge([p['mesh'] for p in shell if p['slot'] == 'glass'])
    # the model's only textures are the two logos, which are not used: the coach is drawn in flat colours
    colours, fin = surfaces(src, {k: v for k, v in BUS_SLOTS.items() if v not in ('seatmark', 'badge')})
    colours['accent'] = colours['paint']; fin['accent'] = fin['paint']
    sides = mk.merge([p['mesh'] for p in shell if p['slot'] == 'paint'])
    half = round(float(max(abs(sides['pos'][:, 0].min()), abs(sides['pos'][:, 0].max()))), 3)
    meta = {
        'name': 'Coach', 'trims': ['standard'], 'lods': 3,
        'size': {'width': round(float(ahi[0] - alo[0]), 3), 'body': round(2 * half, 3), 'height': round(float(ahi[1]), 3), 'length': round(float(ahi[2] - alo[2]), 3), 'front': round(float(ahi[2]), 3), 'back': round(float(alo[2]), 3)},
        'wheelRadius': round(float(ref['pos'][:, 1].max()), 3),
        'steer': [{'at': r5(at['Wheel_Front_Left'])}, {'at': r5(at['Wheel_Front_Right'])}],
        'wheels': wheels,
        'parts': {'body': ['bus.shell', 'bus.cabin'], 'wheel': 'bus.wheel', 'far': 'bus.far'},
        'seats': {'driver': [-0.645, 1.64, 4.53], 'floor': 1.225, 'passengers': 36, 'door': {'side': 1, 'z': [4.23, 5.08], 'step': 0.75}},
        'panels': {
            'plateRear': panel(skin, (0, 0.74, 0), (0.43, 0.1), (0, 0, 1)),
            'plateFront': panel(hull, (0, 0.93, 0), (0.46, 0.115), (0, 0, -1)),
            'nameLeft': panel(skin, (0, 1.88, -3.55), (2.5, 0.3), (-1, 0, 0)),
            'nameRight': panel(skin, (0, 1.88, -3.55), (2.5, 0.3), (1, 0, 0)),
            'numberLeft': panel(skin, (0, 1.88, 3.55), (0.5, 0.24), (-1, 0, 0)),
            'numberRight': panel(skin, (0, 1.88, 3.55), (0.5, 0.24), (1, 0, 0)),
            # where the maker's name stood, front and rear: the operator's name goes there instead
            'nose': panel(hull, (0, 1.285, 0), (0.56, 0.075), (0, 0, -1)),
            'nameRear': panel(skin, (0, 1.945, 0), (0.86, 0.15), (0, 0, 1)),
            'routeRear': panel(skin, (0.82, 1.92, 0), (0.62, 0.15), (0, 0, 1)),
            'numberRear': panel(skin, (-0.82, 1.92, 0), (0.42, 0.15), (0, 0, 1)),
            'visor': panel(glass, (0, 3.12, 0), (2.0, 0.2), (0, 0, -1), lift=0.012, follow=True),
            'adLeft': panel(skin, (0, 0.86, -0.2), (1.9, 0.5), (-1, 0, 0)),
            'adRight': panel(skin, (0, 0.86, -0.2), (1.9, 0.5), (1, 0, 0)),
        },
        'colours': colours, 'finish': fin, 'textures': {}, 'detail': {},
    }
    report['bus'] = {'master': {'file': BUS_FILE, 'sha256': sha(os.path.join(ASSETS, BUS_FILE)), 'triangles': sum(p['tris'] for p in parts)}, 'triangles': stats, 'pieces': {'shell': len(shell), 'cabin': len(cabin)}, 'branding_pieces_left_out': len(marks), 'branding_left_out': {'letters': len(letters), 'seat_logos': sum(1 for p in marks if p['slot'] == 'seatmark'), 'badges': sum(1 for p in marks if p['slot'] == 'badge'), 'triangles': sum(p['tris'] for p in marks), 'letter_boxes': [[[round(float(v), 4) for v in p['lo']], [round(float(v), 4) for v in p['hi']]] for p in letters]},
                     'drawn': {'near': stats['bus.shell'][0] + stats['bus.cabin'][0] + 6 * stats['bus.wheel'][0], 'middle': stats['bus.shell'][1] + stats['bus.cabin'][1] + 6 * stats['bus.wheel'][1], 'far': stats['bus.far'][0]}}
    NAMES = {'paint': 'Body paint, lower', 'paint2': 'Body paint, upper', 'accent': 'Lettering and stripes', 'trim': 'Window surround', 'cabinlight': 'Cabin lighting', 'seat': 'Seat upholstery', 'curtain': 'Curtains',
             'alloy': 'Brushed aluminium', 'floor': 'Cabin flooring', 'chassis': 'Chassis and dashboard', 'lens': 'Headlight reflector', 'amber': 'Indicator amber', 'tail': 'Rear red lens', 'glass': 'Tinted glass', 'rubber': 'Tyre rubber'}
    json.dump({'slots': {slot: {'name': name, 'colour': colours[slot], 'roughness': fin[slot][0], 'metalness': fin[slot][1]} for slot, name in NAMES.items()}}, open(os.path.join(ASSETS, 'bus', 'materials', 'materials.json'), 'w'), indent=1)
    # each level as a file other tools can open, with the pivots where the supplied model has them
    files = {}
    os.makedirs(os.path.join(ASSETS, 'bus', 'lod'), exist_ok=True)
    mats = {SLOT[slot]: {'name': name, 'colour': colours[slot], 'roughness': fin[slot][0], 'metalness': fin[slot][1], **({'opacity': fin['glassOpacity']} if slot == 'glass' else {})} for slot, name in NAMES.items()}
    for level in (0, 1):
        w = made[('bus.wheel', level)]
        pair = lambda yaw, sign: mk.merge([turned(w, yaw), turned(w, yaw, (sign * gap, 0, 0))])
        nodes = [{'name': 'Coach_Root', 'children': ['Body', 'Steering_Pivot', 'Steering_Pivot_Right', 'Wheel_Rear_Left', 'Wheel_Rear_Right']},
                 {'name': 'Body', 'mesh': mk.merge([made[('bus.shell', level)], made[('bus.cabin', level)]])},
                 {'name': 'Steering_Pivot', 'translation': at['Wheel_Front_Left'], 'children': ['Wheel_Front_Left']}, {'name': 'Wheel_Front_Left', 'mesh': w},
                 {'name': 'Steering_Pivot_Right', 'translation': at['Wheel_Front_Right'], 'children': ['Wheel_Front_Right']}, {'name': 'Wheel_Front_Right', 'mesh': turned(w, np.pi)},
                 {'name': 'Wheel_Rear_Left', 'translation': at['Wheel_Rear_Left'], 'mesh': pair(0, 1)}, {'name': 'Wheel_Rear_Right', 'translation': at['Wheel_Rear_Right'], 'mesh': pair(np.pi, -1)}]
        files[f'coach_lod{level}.glb'] = glbwrite.write(os.path.join(ASSETS, 'bus', 'lod', f'coach_lod{level}.glb'), nodes, mats)
    files['coach_lod2.glb'] = glbwrite.write(os.path.join(ASSETS, 'bus', 'lod', 'coach_lod2.glb'), [{'name': 'Coach_Root', 'children': ['Body']}, {'name': 'Body', 'mesh': made[('bus.far', 0)]}], mats)
    report['bus']['lod_files'] = files
    return meta


def main():
    t0 = time.time()
    kit = Kit(); report = {}
    models = {'keke': bake_keke(kit, report)}
    print(f'keke baked in {time.time() - t0:.0f}s', flush=True)
    models['bus'] = bake_bus(kit, report)
    size = kit.write(OUT, {'models': models})
    report['kit'] = {'bytes': size, 'file': os.path.relpath(OUT, ROOT)}
    json.dump(report, open(os.path.join(ASSETS, 'manifest.json'), 'w'), indent=1)
    print(json.dumps({k: v.get('drawn') for k, v in report.items() if 'drawn' in v}))
    for k in ('keke', 'bus'): print(k, json.dumps(report[k]['triangles']))
    print(f'kit {size:,} bytes packed, {os.path.getsize(OUT):,} bytes of script, {time.time() - t0:.0f}s')


if __name__ == '__main__':
    main()
