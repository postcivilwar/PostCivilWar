#!/usr/bin/env python3
"""The light copies of the owner's figures: what a phone or a computer downloads (20 October 2026, the owner's brief:
the character screen was slow and phones lost the picture, because each figure was sent as supplied, 5 to 36 MB, with
pictures up to 8192 pixels square).

    python3 tools/characters/light.py              makes the copy of every figure whose copy is missing or out of date
    python3 tools/characters/light.py --all        makes every copy again
    python3 tools/characters/light.py W14 M1 ...   makes these (by id or by file name)
    python3 tools/characters/light.py --check      says which copies are missing or out of date, and makes nothing

The owner's files in assets/characters/figures/animated/ are never changed: each copy is made FROM its file and written
to assets/characters/figures/light/, with what it was made from (the file's MD5) in made.json. build.mjs serves only
these copies.

A copy is the same figure, as glTF 2.0:
  - the same skeleton, the same skinning, every triangle and every vertex of the file, in the same order;
  - positions as 16-bit numbers, normals as 8-bit, texture positions as 16-bit, skin weights as 8-bit
    (KHR_mesh_quantization): the largest error in a position is a few thousandths of a millimetre on a person-sized
    figure. How a position's 16-bit number is turned back into the file's units is folded into the skin's inverse
    bind matrices, as glTF lays down for a skinned mesh, so a viewer needs nothing else to draw it;
  - every animation, with every bone's every channel, each turn as four 16-bit numbers (glTF allows it), and the keys
    that the ones either side of them already give (within ROT_TOL, POS_TOL) left out; checked against the file by
    moving the whole skeleton through every animation (`moved` below: the largest distance any joint of the copy is
    from where the file puts it);
  - the pictures as files of their own beside it, as WebP (EXT_texture_webp): the colour picture at 1024 pixels for a
    phone and 2048 for a computer, the normal and metal/roughness pictures at 1024 for both;
  - the model itself gzip'd: <name>.glb.gz is a whole GLB once unzipped (the page unzips it with the browser's own
    DecompressionStream, or glb.js's inflate where a browser has none).
"""
import gzip, hashlib, io, json, os, struct, sys, time
import numpy as np
from PIL import Image

TOOL = 'light.py 1'
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
ORIGINALS = os.path.join(ROOT, 'assets', 'characters', 'figures', 'animated')
OUT = os.path.join(ROOT, 'assets', 'characters', 'figures', 'light')
MADE = os.path.join(OUT, 'made.json')

# the pictures: which sizes are made of each, and how well each is kept (WebP quality)
PICTURES = {
    'c': {'slot': 'colour', 'sizes': (1024, 2048), 'quality': 86},
    'n': {'slot': 'normal', 'sizes': (1024,), 'quality': 90},
    'm': {'slot': 'metal/roughness', 'sizes': (1024,), 'quality': 88},
}
ROT_TOL = 0.0008       # radians: how far a turn given by the keys either side may be from the file's own key
POS_TOL = 0.0004       # in the file's units (its figure is about one unit tall): the same for a movement
SCALE_TOL = 0.0005

COMP = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
WIDTH = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


# ------------------------------------------------------------------------------------------------ reading --
def read_glb(data):
    if struct.unpack_from('<I', data, 0)[0] != 0x46546C67: raise ValueError('not a GLB file')
    at, js, bin_ = 12, None, None
    while at < len(data):
        n, t = struct.unpack_from('<II', data, at)
        body = data[at + 8: at + 8 + n]
        if t == 0x4E4F534A: js = json.loads(body)
        elif t == 0x004E4942: bin_ = bytes(body)
        at += 8 + n
    return js, bin_


def accessor(js, bin_, i, as_float=False):
    a = js['accessors'][i]
    if 'sparse' in a: raise ValueError('a sparse accessor is not read here')
    bv = js['bufferViews'][a['bufferView']]
    dt = np.dtype(COMP[a['componentType']]).newbyteorder('<'); n = WIDTH[a['type']]
    stride = bv.get('byteStride', dt.itemsize * n)
    start = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    count = a['count']
    raw = np.frombuffer(bin_, dtype=np.uint8, count=stride * (count - 1) + dt.itemsize * n, offset=start)
    out = np.lib.stride_tricks.as_strided(raw, shape=(count, dt.itemsize * n), strides=(stride, 1)).copy().view(dt).reshape(count, n)
    if as_float:
        out = out.astype(np.float64)
        if a.get('normalized'): out = np.maximum(out / np.iinfo(dt).max, -1.0)
    return out


# --------------------------------------------------------------------------------------------- the maths --
def quat_mat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def trs(t, r, s):
    M = np.eye(4); M[:3, :3] = quat_mat(r) @ np.diag(s); M[:3, 3] = t
    return M


def node_trs(n):
    if 'matrix' in n: raise ValueError('a node given by a matrix is not read here')
    return (np.array(n.get('translation', [0, 0, 0]), float), np.array(n.get('rotation', [0, 0, 0, 1]), float), np.array(n.get('scale', [1, 1, 1]), float))


def slerp(a, b, u):
    """Each row of a to the same row of b, by u (as three.js's slerpFlat: the shorter way round)."""
    dot = np.sum(a * b, axis=1)
    b = np.where(dot[:, None] < 0, -b, b); dot = np.abs(dot)
    out = np.empty_like(a)
    near = dot > 0.9995
    if np.any(near):
        v = a[near] + (b[near] - a[near]) * u[near, None]
        out[near] = v / np.linalg.norm(v, axis=1, keepdims=True)
    far = ~near
    if np.any(far):
        th = np.arccos(np.clip(dot[far], -1, 1)); s = np.sin(th)
        out[far] = (np.sin((1 - u[far]) * th) / s)[:, None] * a[far] + (np.sin(u[far] * th) / s)[:, None] * b[far]
    return out


def angle(a, b):
    return 2 * np.arccos(np.clip(np.abs(np.sum(a * b, axis=1)) / (np.linalg.norm(a, axis=1) * np.linalg.norm(b, axis=1)), 0, 1))


def sample(times, values, t, path, step):
    """A track's value at each of the times t, as three.js plays it (held before the first key and after the last)."""
    if len(times) == 1: return np.repeat(values[:1], len(t), axis=0)
    i = np.clip(np.searchsorted(times, t, side='right') - 1, 0, len(times) - 1)
    if step: return values[i]
    j = np.minimum(i + 1, len(times) - 1)
    span = times[j] - times[i]
    u = np.clip(np.where(span > 0, (t - times[i]) / np.where(span > 0, span, 1), 0), 0, 1)
    if path == 'rotation': return slerp(values[i], values[j], u)
    return values[i] + (values[j] - values[i]) * u[:, None]


# ------------------------------------------------------------------------------------ the animations' keys --
def reduce_keys(times, orig, stored, path, step):
    """Which keys to keep: every key the keys either side of it do not already give. `orig` is the file's own values,
    `stored` what the copy will hold for each key (after rounding to 16 bits)."""
    n = len(times)
    if n <= 2: return np.arange(n)
    if step:
        changed = np.any(np.abs(np.diff(stored, axis=0)) > 0, axis=1)
        keep = np.concatenate([[0], np.nonzero(changed)[0] + 1])
        return np.unique(np.concatenate([keep, [n - 1]]))
    tol = ROT_TOL if path == 'rotation' else POS_TOL if path == 'translation' else SCALE_TOL
    err = (lambda x, y: angle(x, y)) if path == 'rotation' else (lambda x, y: np.linalg.norm(x - y, axis=1))
    keep = [0]
    i = 0
    while i < n - 1:
        best = i + 1
        j = i + 2
        while j < n and j - i <= 96:
            ks = np.arange(i + 1, j)
            u = (times[ks] - times[i]) / (times[j] - times[i])
            if path == 'rotation': approx = slerp(np.repeat(stored[i:i + 1], len(ks), 0), np.repeat(stored[j:j + 1], len(ks), 0), u)
            else: approx = stored[i] + (stored[j] - stored[i]) * u[:, None]
            if err(approx, orig[ks]).max() > tol: break
            best = j
            j += 1
        keep.append(best)
        i = best
    return np.array(keep)


# ---------------------------------------------------------------------------------------------- pictures --
def picture_of(js, bin_, ref):
    tex = js['textures'][ref['index']]
    src = tex.get('source')
    if src is None:
        for ext in (tex.get('extensions') or {}).values():
            if isinstance(ext, dict) and 'source' in ext: src = ext['source']
    img = js['images'][src]
    bv = js['bufferViews'][img['bufferView']]
    return bin_[bv.get('byteOffset', 0): bv.get('byteOffset', 0) + bv['byteLength']]


def smaller(data, size):
    """The picture at `size` pixels across (never larger than it is), as RGB."""
    im = Image.open(io.BytesIO(data))
    if im.format == 'JPEG': im.draft('RGB', (size * 2, size * 2))      # (decoded at a quarter or a half where it can be: the 8192 ones)
    im = im.convert('RGB')
    if im.width > size or im.height > size:
        im = im.resize((size, round(im.height * size / im.width)) if im.width >= im.height else (round(im.width * size / im.height), size), Image.LANCZOS)
    return im


def webp(im, quality):
    buf = io.BytesIO(); im.save(buf, format='WEBP', quality=quality, method=6)
    return buf.getvalue()


# ------------------------------------------------------------------------------------------------ writing --
class Writer:
    def __init__(self):
        self.bin = bytearray(); self.views = []; self.accessors = []

    def view(self, data, target=None, stride=None):
        while len(self.bin) % 4: self.bin.append(0)
        v = {'buffer': 0, 'byteOffset': len(self.bin), 'byteLength': len(data)}
        if target: v['target'] = target
        if stride: v['byteStride'] = stride
        self.bin += data
        self.views.append(v)
        return len(self.views) - 1

    def accessor(self, arr, ctype, kind, normalized=False, target=None, stride=None, minmax=False):
        """`arr` is (count, width) in its stored type. With a stride, each element is padded out to it."""
        arr = np.ascontiguousarray(arr)
        count, width = arr.shape
        item = arr.dtype.itemsize * width
        if stride and stride != item:
            padded = np.zeros((count, stride), np.uint8)
            padded[:, :item] = arr.view(np.uint8).reshape(count, item)
            data = padded.tobytes()
        else:
            data, stride = arr.tobytes(), None
        a = {'bufferView': self.view(data, target, stride), 'componentType': ctype, 'count': int(count), 'type': kind}
        if normalized: a['normalized'] = True
        if minmax:
            a['min'] = [float(x) if arr.dtype.kind == 'f' else int(x) for x in arr.min(axis=0)]
            a['max'] = [float(x) if arr.dtype.kind == 'f' else int(x) for x in arr.max(axis=0)]
        self.accessors.append(a)
        return len(self.accessors) - 1

    def glb(self, js):
        js['buffers'] = [{'byteLength': len(self.bin)}]
        js['bufferViews'] = self.views; js['accessors'] = self.accessors
        text = json.dumps(js, separators=(',', ':')).encode('utf8')
        text += b' ' * ((4 - len(text) % 4) % 4)
        body = bytes(self.bin) + b'\0' * ((4 - len(self.bin) % 4) % 4)
        total = 12 + 8 + len(text) + 8 + len(body)
        return struct.pack('<III', 0x46546C67, 2, total) + struct.pack('<II', len(text), 0x4E4F534A) + text + struct.pack('<II', len(body), 0x004E4942) + body


# ----------------------------------------------------------------------------------------------- the copy --
def make(path, stem):
    data = open(path, 'rb').read()
    md5 = hashlib.md5(data).hexdigest()
    js, bin_ = read_glb(data)
    if len(js.get('meshes', [])) != 1 or len(js['meshes'][0]['primitives']) != 1: raise ValueError('one mesh with one part is made here')
    if len(js.get('skins', [])) != 1: raise ValueError('one skin is made here')
    for ext in js.get('extensionsRequired', []): raise ValueError(f'the file needs {ext}')
    prim = js['meshes'][0]['primitives'][0]
    at = prim['attributes']
    W = Writer()
    report = {}

    # ---- the shape ----
    pos = accessor(js, bin_, at['POSITION'], True)
    nrm = accessor(js, bin_, at['NORMAL'], True)
    uv = accessor(js, bin_, at['TEXCOORD_0'], True)
    joints = accessor(js, bin_, at['JOINTS_0'])
    weights = accessor(js, bin_, at['WEIGHTS_0'], True)
    index = accessor(js, bin_, prim['indices']).reshape(-1).astype(np.int64)
    count = len(pos)
    lo, hi = pos.min(axis=0), pos.max(axis=0)
    centre = (lo + hi) / 2
    half = float(np.max(hi - lo) / 2)
    qpos = np.round((pos - centre) / half * 32767).astype(np.int16)
    back = qpos.astype(np.float64) / 32767 * half + centre
    report['position error'] = float(np.abs(back - pos).max())
    nlen = np.linalg.norm(nrm, axis=1, keepdims=True); nlen[nlen == 0] = 1
    qn = np.round(nrm / nlen * 127).astype(np.int8)
    if uv.min() < 0 or uv.max() > 1: raise ValueError('texture positions outside 0..1 are not made here')
    quv = np.round(uv * 65535).astype(np.uint16)
    if joints.max() > 255: raise ValueError('more than 256 joints')
    qj = joints.astype(np.uint8)
    wsum = weights.sum(axis=1, keepdims=True); wsum[wsum == 0] = 1
    w8 = np.round(weights / wsum * 255).astype(np.int64)
    short = 255 - w8.sum(axis=1)
    big = np.argmax(w8, axis=1)
    w8[np.arange(count), big] += short                      # every vertex's weights add up to exactly one
    report['weight error'] = float(np.abs(w8 / 255 - weights / wsum).max())
    qw = w8.astype(np.uint8)
    # (a 16-bit index of 65535 is the "start again" mark in WebGL 2: such a mesh has 32-bit indices)
    qi = index.astype(np.uint16 if count <= 65535 else np.uint32)

    # the skin: how a 16-bit position is turned back into the file's units, folded into its inverse bind matrices
    # (B, where the mesh node is, is the same as at the file's root for every one of these figures; it is checked)
    parent = {}
    for i, n in enumerate(js['nodes']):
        for c in n.get('children', []): parent[c] = i
    mesh_node = next(i for i, n in enumerate(js['nodes']) if n.get('mesh') == 0)
    k = mesh_node
    while k is not None:
        t, r, s = node_trs(js['nodes'][k])
        if np.abs(t).max() > 1e-9 or np.abs(r - [0, 0, 0, 1]).max() > 1e-9 or np.abs(s - 1).max() > 1e-9: raise ValueError('the mesh is moved from the root: not made here')
        k = parent.get(k)
    skin = js['skins'][0]
    ibm = accessor(js, bin_, skin['inverseBindMatrices'], True).reshape(-1, 4, 4).transpose(0, 2, 1)      # column-major in the file
    D = np.eye(4); D[:3, :3] *= half; D[:3, 3] = centre
    ibm2 = ibm @ D

    attributes = {
        'POSITION': W.accessor(qpos, 5122, 'VEC3', True, 34962, 8, minmax=True),
        'NORMAL': W.accessor(qn, 5120, 'VEC3', True, 34962, 4),
        'TEXCOORD_0': W.accessor(quv, 5123, 'VEC2', True, 34962),
        'JOINTS_0': W.accessor(qj, 5121, 'VEC4', False, 34962),
        'WEIGHTS_0': W.accessor(qw, 5121, 'VEC4', True, 34962),
    }
    indices = W.accessor(qi.reshape(-1, 1), 5123 if qi.dtype == np.uint16 else 5125, 'SCALAR', target=34963)
    ibm_acc = W.accessor(ibm2.transpose(0, 2, 1).reshape(-1, 16).astype(np.float32), 5126, 'MAT4')
    report['vertices'] = int(count); report['triangles'] = int(len(index) // 3)

    # ---- the animations ----
    new_anims = []
    kept_keys = total_keys = 0
    for a in js.get('animations', []):
        samplers, channels = [], []
        seen_times = {}
        for c in a['channels']:
            s = a['samplers'][c['sampler']]
            interp = s.get('interpolation', 'LINEAR')
            if interp not in ('LINEAR', 'STEP'): raise ValueError(f'{interp} keys are not made here')
            times = accessor(js, bin_, s['input'], True).reshape(-1)
            vals = accessor(js, bin_, s['output'], True)
            path = c['target']['path']
            if path not in ('rotation', 'translation', 'scale'): raise ValueError(f'an animation of {path} is not made here')
            step = interp == 'STEP'
            if path == 'rotation':
                vals = vals / np.linalg.norm(vals, axis=1, keepdims=True)
                for i in range(1, len(vals)):                     # each key the nearer way round from the one before
                    if np.dot(vals[i], vals[i - 1]) < 0: vals[i] = -vals[i]
                q16 = np.round(vals * 32767).astype(np.int16)
                stored = q16.astype(np.float64) / 32767
            else:
                stored = vals.astype(np.float32).astype(np.float64)
            keep = reduce_keys(times, vals, stored, path, step)
            total_keys += len(times); kept_keys += len(keep)
            t_keep = times[keep].astype(np.float32)
            key = t_keep.tobytes()
            if key not in seen_times: seen_times[key] = W.accessor(t_keep.reshape(-1, 1), 5126, 'SCALAR', minmax=True)
            if path == 'rotation': out = W.accessor(q16[keep], 5122, 'VEC4', True)
            else: out = W.accessor(stored[keep].astype(np.float32), 5126, 'VEC3')
            samplers.append({'input': seen_times[key], 'output': out, 'interpolation': interp})
            channels.append({'sampler': len(samplers) - 1, 'target': c['target']})
        new_anims.append({'name': a.get('name'), 'channels': channels, 'samplers': samplers})
    report['keys'] = [kept_keys, total_keys]

    # ---- the pictures ----
    mat = dict(js['materials'][prim.get('material', 0)])
    pbr = dict(mat.get('pbrMetallicRoughness', {}))
    refs = {'c': pbr.get('baseColorTexture'), 'm': pbr.get('metallicRoughnessTexture'), 'n': mat.get('normalTexture')}
    if mat.get('occlusionTexture') or mat.get('emissiveTexture'): raise ValueError('an occlusion or emissive picture is not made here')
    images, textures, files = [], [], {}
    samplers = js.get('samplers', [])
    for key in ('c', 'n', 'm'):
        ref = refs[key]
        if not ref: continue
        if ref.get('texCoord', 0) != 0: raise ValueError('a second set of texture positions is not made here')
        source = picture_of(js, bin_, ref)
        made = {}
        for size in PICTURES[key]['sizes']:
            im = smaller(source, size)
            name = f'{stem}.{key}{size}.webp'
            made[size] = (name, webp(im, PICTURES[key]['quality']), im.size)
        sizes = sorted(made)
        first = made[sizes[0]]
        img = {'uri': first[0], 'mimeType': 'image/webp', 'name': PICTURES[key]['slot']}
        if len(sizes) > 1: img['extras'] = {'larger': {str(s): made[s][0] for s in sizes[1:]}}
        images.append(img)
        tex = {'extensions': {'EXT_texture_webp': {'source': len(images) - 1}}}
        orig_tex = js['textures'][ref['index']]
        if 'sampler' in orig_tex: tex['sampler'] = orig_tex['sampler']
        textures.append(tex)
        new_ref = {k: v for k, v in ref.items() if k != 'index'}; new_ref['index'] = len(textures) - 1
        if key == 'c': pbr['baseColorTexture'] = new_ref
        elif key == 'm': pbr['metallicRoughnessTexture'] = new_ref
        else: mat['normalTexture'] = new_ref
        for size, (name, body, px) in made.items(): files[name] = body
        report[f'picture {key}'] = {s: [made[s][2][0], len(made[s][1])] for s in sizes}
    mat['pbrMetallicRoughness'] = pbr

    # ---- the description ----
    mesh = {'name': js['meshes'][0].get('name'), 'primitives': [{'attributes': attributes, 'indices': indices, 'material': 0, 'mode': prim.get('mode', 4)}],
            'extras': {'box': [float(x) for x in lo] + [float(x) for x in hi]}}
    out = {
        'asset': {'version': '2.0', 'generator': f'PostCivilWar tools/characters/light.py ({TOOL})', 'extras': {'madeFrom': os.path.basename(path), 'md5': md5}},
        'extensionsUsed': ['KHR_mesh_quantization', 'EXT_texture_webp'], 'extensionsRequired': ['KHR_mesh_quantization', 'EXT_texture_webp'],
        'scene': js.get('scene', 0), 'scenes': js['scenes'], 'nodes': js['nodes'],
        'skins': [{**{k: v for k, v in skin.items() if k != 'inverseBindMatrices'}, 'inverseBindMatrices': ibm_acc}],
        'meshes': [mesh], 'materials': [mat], 'textures': textures, 'images': images, 'animations': new_anims,
    }
    if samplers: out['samplers'] = samplers
    glb = W.glb(out)
    files[f'{stem}.glb.gz'] = gzip.compress(glb, 9, mtime=0)
    report['glb'] = len(glb)
    return md5, len(data), files, report, glb


# ------------------------------------------------------------------------------------------------- checks --
def skeleton_moves(js, bin_, anim_index, times=None):
    """Where every joint is, at each of `times` (all of the animation's keys, at most 240 of them), by the file's (or
    the copy's) own animation: an array (time, joint, 3)."""
    nodes = js['nodes']
    parent = {}
    for i, n in enumerate(nodes):
        for c in n.get('children', []): parent[c] = i
    a = js['animations'][anim_index]
    tracks = {}
    every = []
    for c in a['channels']:
        s = a['samplers'][c['sampler']]
        t = accessor(js, bin_, s['input'], True).reshape(-1)
        v = accessor(js, bin_, s['output'], True)
        tracks[(c['target']['node'], c['target']['path'])] = (t, v, s.get('interpolation', 'LINEAR') == 'STEP')
        every.append(t)
    if times is None:
        times = np.unique(np.concatenate(every))
        if len(times) > 240: times = times[np.linspace(0, len(times) - 1, 240).astype(int)]
    T = len(times)
    local = {}
    for i, n in enumerate(nodes):
        t0, r0, s0 = node_trs(n)
        parts = {}
        for path, default in (('translation', t0), ('rotation', r0), ('scale', s0)):
            tr = tracks.get((i, path))
            parts[path] = sample(tr[0], tr[1], times, path, tr[2]) if tr else np.repeat(default[None], T, 0)
        M = np.zeros((T, 4, 4)); M[:, 3, 3] = 1
        q = parts['rotation'] / np.linalg.norm(parts['rotation'], axis=1, keepdims=True)
        x, y, z, w = q[:, 0], q[:, 1], q[:, 2], q[:, 3]
        R = np.stack([np.stack([1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], -1), np.stack([2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], -1), np.stack([2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)], -1)], 1)
        M[:, :3, :3] = R * parts['scale'][:, None, :]
        M[:, :3, 3] = parts['translation']
        local[i] = M
    world = {}
    def W(i):
        if i not in world: world[i] = (W(parent[i]) @ local[i]) if i in parent else local[i]
        return world[i]
    joints = js['skins'][0]['joints']
    return times, np.stack([W(j)[:, :3, 3] for j in joints], 1)


def check(orig_js, orig_bin, glb):
    js, bin_ = read_glb(glb)
    worst = 0.0
    for k in range(len(orig_js.get('animations', []))):
        times, a = skeleton_moves(orig_js, orig_bin, k)
        _, b = skeleton_moves(js, bin_, k, times)
        worst = max(worst, float(np.linalg.norm(a - b, axis=2).max()))
    # the shape: every vertex where the file has it, through the copy's own numbers and its inverse bind matrices
    prim = js['meshes'][0]['primitives'][0]
    q = accessor(js, bin_, prim['attributes']['POSITION'], True)
    ibm2 = accessor(js, bin_, js['skins'][0]['inverseBindMatrices'], True).reshape(-1, 4, 4).transpose(0, 2, 1)
    ibm = accessor(orig_js, orig_bin, orig_js['skins'][0]['inverseBindMatrices'], True).reshape(-1, 4, 4).transpose(0, 2, 1)
    orig = accessor(orig_js, orig_bin, orig_js['meshes'][0]['primitives'][0]['attributes']['POSITION'], True)
    # joint 0's bind: what the copy's position becomes in the space the file's position is in
    h = np.c_[q, np.ones(len(q))] @ (np.linalg.inv(ibm[0]) @ ibm2[0]).T
    shape = float(np.abs(h[:, :3] - orig).max())
    return worst, shape


# --------------------------------------------------------------------------------------------------- main --
def figures():
    """Every supplied figure the game offers (src/sim/figures.js names their files)."""
    import re
    text = open(os.path.join(ROOT, 'src', 'sim', 'figures.js'), encoding='utf8').read()
    files = sorted(set(re.findall(r"file:\s*'([^']+\.glb)'", text)))
    if not files: raise SystemExit('figures.js names no figure files')
    return files


def main(argv):
    os.makedirs(OUT, exist_ok=True)
    made = json.load(open(MADE)) if os.path.exists(MADE) else {'tool': TOOL, 'figures': {}}
    every = figures()
    ids = {}
    try:
        import subprocess
        listed = subprocess.run(['node', '-e', "import('" + os.path.join(ROOT, 'src', 'sim', 'figures.js').replace('\\', '/') + "').then((m) => console.log(JSON.stringify(Object.fromEntries(Object.values(m.FIGURES).map((f) => [f.id, f.file])))))"], capture_output=True, text=True, check=True)
        ids = json.loads(listed.stdout)
    except Exception:
        pass
    wanted = [a for a in argv if not a.startswith('--')]
    if wanted: todo = [ids.get(w, w) for w in wanted]
    else:
        todo = []
        for f in every:
            entry = made['figures'].get(f)
            stale = '--all' in argv or not entry or entry.get('tool') != TOOL or not all(os.path.exists(os.path.join(OUT, n)) for n in entry['files'])
            if not stale:
                h = hashlib.md5(open(os.path.join(ORIGINALS, f), 'rb').read()).hexdigest()
                stale = h != entry['md5']
            if stale: todo.append(f)
    if '--check' in argv:
        print('\n'.join(f'out of date: {f}' for f in todo) or 'every light copy is up to date')
        return 1 if todo else 0
    for f in todo:
        if f not in every: raise SystemExit(f'{f} is not one of the figures')
        t0 = time.time()
        stem = f[:-4]
        src = os.path.join(ORIGINALS, f)
        md5, size, files, report, glb = make(src, stem)
        orig_js, orig_bin = read_glb(open(src, 'rb').read())
        moved, shape = check(orig_js, orig_bin, glb)
        report['moved'] = moved; report['shape'] = shape
        old = made['figures'].get(f)
        if old:
            for n in old['files']:
                if n not in files and os.path.exists(os.path.join(OUT, n)): os.remove(os.path.join(OUT, n))
        for name, body in files.items():
            open(os.path.join(OUT, name), 'wb').write(body)
        made['figures'][f] = {'tool': TOOL, 'md5': md5, 'bytes': size, 'files': {n: {'bytes': len(b), 'sha256': hashlib.sha256(b).hexdigest()} for n, b in sorted(files.items())}, 'report': report}
        made['tool'] = TOOL
        json.dump(made, open(MADE, 'w'), indent=1, sort_keys=True)
        phone = sum(len(b) for n, b in files.items() if n.endswith('.glb.gz') or '1024' in n)
        print(f"{f:28s} {size / 1048576:6.1f} MB -> phone {phone / 1048576:.2f} MB; model {len(files[stem + '.glb.gz']) / 1048576:.2f} MB gz ({report['glb'] / 1048576:.2f} MB); "
              f"keys {report['keys'][0]}/{report['keys'][1]}; joints moved at most {moved * 1000:.3f} (thousandths of the figure's height); shape {shape * 1000:.4f}; {time.time() - t0:.0f} s", flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
