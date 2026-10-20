"""Reading and writing the habitation's GLB files (the owner's, as Tripo made them: one mesh, one picture).

Read: positions, normals, picture coordinates, triangles and the picture itself, as numpy arrays and a PIL image.
Write: a GLB of several primitives (each its own material), each with positions, normals, picture coordinates and,
where given, colours and a sway weight (`_SWAY`, how much it moves in the wind), its pictures as WebP files inside it
(EXT_texture_webp) or JPEG/PNG. Nothing here changes the owner's files: it reads them and writes new ones.
"""
import io, json, struct
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

def read(path):
    b = open(path, 'rb').read()
    assert b[:4] == b'glTF', path
    n = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + n])
    o = 20 + n
    bl = struct.unpack('<I', b[o:o + 4])[0]
    bin_ = b[o + 8:o + 8 + bl]
    def acc(i):
        a = j['accessors'][i]; v = j['bufferViews'][a['bufferView']]
        dt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}[a['componentType']]
        w = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
        off = v.get('byteOffset', 0) + a.get('byteOffset', 0)
        arr = np.frombuffer(bin_, dt, a['count'] * w, off)
        return arr.reshape(-1, w).copy() if w > 1 else arr.copy()
    prim = j['meshes'][0]['primitives'][0]
    P = acc(prim['attributes']['POSITION']).astype(np.float64)
    N = acc(prim['attributes']['NORMAL']).astype(np.float64) if 'NORMAL' in prim['attributes'] else None
    UV = acc(prim['attributes']['TEXCOORD_0']).astype(np.float64)
    F = acc(prim['indices']).reshape(-1, 3).astype(np.int64)
    img = j['images'][0]; v = j['bufferViews'][img['bufferView']]
    data = bin_[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
    return dict(P=P, N=N, UV=UV, F=F, image=data, mime=img.get('mimeType'), json=j)

def picture(model, most=None):
    im = Image.open(io.BytesIO(model['image']))
    im.draft('RGB', (most, most) if most else None)      # (a JPEG decoded straight at a smaller size: fast)
    im = im.convert('RGB')
    if most and max(im.size) > most:
        im = im.resize((most, most), Image.LANCZOS)
    return im

def sample(im, UV):
    """The picture's colour (0..1, sRGB) at each picture coordinate (glTF: v down from the top)."""
    a = np.asarray(im, dtype=np.float32) / 255.0
    h, w = a.shape[:2]
    x = np.clip((UV[:, 0] % 1.0) * w - 0.5, 0, w - 1)
    y = np.clip((UV[:, 1] % 1.0) * h - 0.5, 0, h - 1)
    x0 = np.floor(x).astype(int); y0 = np.floor(y).astype(int); x1 = np.minimum(x0 + 1, w - 1); y1 = np.minimum(y0 + 1, h - 1)
    fx = (x - x0)[:, None]; fy = (y - y0)[:, None]
    return (a[y0, x0] * (1 - fx) * (1 - fy) + a[y0, x1] * fx * (1 - fy) + a[y1, x0] * (1 - fx) * fy + a[y1, x1] * fx * fy)

def components(F, n):
    """Which connected piece each vertex belongs to (vertices joined by triangles)."""
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import connected_components
    e = np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]])
    m = coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(n, n))
    k, lab = connected_components(m, directed=False)
    return k, lab

def encode(im, fmt, quality=86):
    buf = io.BytesIO()
    if fmt == 'webp':
        im.save(buf, 'WEBP', quality=quality, method=6)
        return buf.getvalue(), 'image/webp'
    if fmt == 'png':
        im.save(buf, 'PNG', optimize=True)
        return buf.getvalue(), 'image/png'
    im.convert('RGB').save(buf, 'JPEG', quality=quality, optimize=True, progressive=False)
    return buf.getvalue(), 'image/jpeg'

def write(path, primitives, generator='PostCivilWar habitation tools', extras=None):
    """primitives: list of dict(P, N, UV, F, colour (optional n x 3 or 4, 0..1), sway (optional n), material=dict(
    name, picture=(bytes, mime) or None, normal=(bytes, mime) or None, rough=(bytes, mime) or None, alpha=None|'MASK',
    cutoff, double, roughness, metallic, extras))."""
    bin_ = bytearray()
    views, accs, images, textures, materials, prims = [], [], [], [], [], []
    def view(data, target=None):
        while len(bin_) % 4: bin_.append(0)
        views.append(dict(buffer=0, byteOffset=len(bin_), byteLength=len(data), **({'target': target} if target else {})))
        bin_.extend(data)
        return len(views) - 1
    def accessor(arr, kind, comp, target, minmax=False, normalized=False):
        arr = np.ascontiguousarray(arr)
        vi = view(arr.tobytes(), target)
        a = dict(bufferView=vi, componentType=comp, count=int(arr.shape[0]), type=kind)
        if normalized: a['normalized'] = True
        if minmax: a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
        accs.append(a)
        return len(accs) - 1
    exts = set()
    seen = {}
    def image(pic):
        data, mime = pic
        if id(data) in seen:
            return seen[id(data)]
        if mime == 'uri':
            # a picture shared by many models (the leaves' sheet): named, not carried inside each file
            images.append(dict(uri=data, mimeType='image/webp'))
            ii = len(images) - 1
            exts.add('EXT_texture_webp')
            textures.append(dict(sampler=0, extensions={'EXT_texture_webp': {'source': ii}}))
            seen[id(data)] = len(textures) - 1
            return len(textures) - 1
        vi = view(data)
        images.append(dict(bufferView=vi, mimeType=mime))
        ii = len(images) - 1
        if mime == 'image/webp':
            exts.add('EXT_texture_webp')
            textures.append(dict(sampler=0, extensions={'EXT_texture_webp': {'source': ii}}))
        else:
            textures.append(dict(sampler=0, source=ii))
        seen[id(data)] = len(textures) - 1
        return len(textures) - 1
    shared = {}
    primitives = [p for p in primitives if p.get('F') is not None and len(p['F']) and len(p['P'])]
    for p in primitives:
        m = p['material']
        key = m.get('share')
        if key is not None and key in shared:
            mi = shared[key]
        else:
            pbr = dict(metallicFactor=m.get('metallic', 0.0), roughnessFactor=m.get('roughness', 0.9))
            if m.get('picture'): pbr['baseColorTexture'] = dict(index=image(m['picture']))
            if m.get('rough'): pbr['metallicRoughnessTexture'] = dict(index=image(m['rough']))
            md = dict(name=m.get('name', 'surface'), pbrMetallicRoughness=pbr, doubleSided=bool(m.get('double', True)))
            if m.get('normal'): md['normalTexture'] = dict(index=image(m['normal']), scale=m.get('normalScale', 1.0))
            if m.get('alpha'): md['alphaMode'] = m['alpha']; md['alphaCutoff'] = m.get('cutoff', 0.5)
            if m.get('extras'): md['extras'] = m['extras']
            materials.append(md); mi = len(materials) - 1
            if key is not None: shared[key] = mi
        attrs = dict(POSITION=accessor(p['P'].astype(np.float32), 'VEC3', 5126, 34962, minmax=True))
        if p.get('N') is not None: attrs['NORMAL'] = accessor(p['N'].astype(np.float32), 'VEC3', 5126, 34962)
        if p.get('UV') is not None: attrs['TEXCOORD_0'] = accessor(p['UV'].astype(np.float32), 'VEC2', 5126, 34962)
        if p.get('colour') is not None:
            c = np.clip(np.round(p['colour'] * 255), 0, 255).astype(np.uint8)
            if c.shape[1] == 3: c = np.concatenate([c, np.full((len(c), 1), 255, np.uint8)], 1)
            attrs['COLOR_0'] = accessor(c, 'VEC4', 5121, 34962, normalized=True)
        if p.get('sway') is not None:
            attrs['_SWAY'] = accessor(np.clip(np.round(p['sway'] * 255), 0, 255).astype(np.uint8).reshape(-1, 1).repeat(1, 1).ravel(), 'SCALAR', 5121, 34962, normalized=True)
        F = p['F'].astype(np.uint32 if p['P'].shape[0] > 65535 else np.uint16).ravel()
        prims.append(dict(attributes=attrs, indices=accessor(F, 'SCALAR', 5125 if F.dtype == np.uint32 else 5123, 34963), material=mi, **({'extras': p['extras']} if p.get('extras') else {})))
    while len(bin_) % 4: bin_.append(0)
    j = dict(asset=dict(version='2.0', generator=generator), scene=0, scenes=[dict(nodes=[0])], nodes=[dict(mesh=0, name='model')],
             meshes=[dict(primitives=prims)], accessors=accs, bufferViews=views, buffers=[dict(byteLength=len(bin_))],
             materials=materials, samplers=[dict(magFilter=9729, minFilter=9987, wrapS=10497, wrapT=10497)])
    if images: j['images'] = images; j['textures'] = textures
    if exts: j['extensionsUsed'] = sorted(exts)
    if extras: j['extras'] = extras
    js = json.dumps(j, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bin_), 0x004E4942) + bytes(bin_)
    open(path, 'wb').write(out)
    return len(out)
