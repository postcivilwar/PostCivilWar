"""Reads one of the owner's sports models (assets/sports/*.glb) as it is: every part with the file's own placing
applied, its points, normals, texture places and triangles. Nothing is written."""
import json, struct
import numpy as np

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def chunks(path):
    data = open(path, 'rb').read()
    off, j, b = 12, None, None
    while off < len(data):
        clen, ctype = struct.unpack('<I4s', data[off:off + 8])
        body = data[off + 8:off + 8 + clen]
        if ctype == b'JSON': j = json.loads(body)
        else: b = body
        off += 8 + clen
    return data, j, b


def accessor(j, b, i):
    a = j['accessors'][i]; v = j['bufferViews'][a['bufferView']]
    n = NC[a['type']]; dt = np.dtype(CT[a['componentType']])
    start = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = v.get('byteStride')
    if stride and stride != dt.itemsize * n:
        raw = np.frombuffer(b, np.uint8, stride * a['count'], start).reshape(a['count'], stride)
        arr = raw[:, :dt.itemsize * n].copy().view(dt).reshape(a['count'], n)
    else:
        arr = np.frombuffer(b, dt, a['count'] * n, start).reshape(a['count'], n)
    if a.get('normalized') and dt != np.float32:
        arr = arr.astype(np.float64) / float(np.iinfo(dt).max)
    return arr if n > 1 else arr[:, 0]


def node_matrix(node):
    if 'matrix' in node: return np.array(node['matrix'], float).reshape(4, 4).T
    t = np.array(node.get('translation', [0, 0, 0]), float)
    x, y, z, w = node.get('rotation', [0, 0, 0, 1])
    s = np.array(node.get('scale', [1, 1, 1]), float)
    R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    M = np.eye(4); M[:3, :3] = R * s; M[:3, 3] = t
    return M


def read(path):
    """{'parts': [{'name', 'P', 'N', 'uv', 'I'}], 'image': (bytes, mime), 'material': {...}, 'raw': bytes}"""
    raw, j, b = chunks(path)
    parts = []

    def walk(i, M):
        node = j['nodes'][i]; W = M @ node_matrix(node)
        if 'mesh' in node:
            A = W[:3, :3]; Ninv = np.linalg.inv(A).T
            for p in j['meshes'][node['mesh']]['primitives']:
                P = accessor(j, b, p['attributes']['POSITION']).astype(np.float64)
                N = accessor(j, b, p['attributes']['NORMAL']).astype(np.float64)
                uv = accessor(j, b, p['attributes']['TEXCOORD_0']).astype(np.float64)
                I = accessor(j, b, p['indices']).astype(np.int64).reshape(-1, 3)
                P = P @ A.T + W[:3, 3]
                N = N @ Ninv.T; N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)
                parts.append({'name': node.get('name', ''), 'P': P, 'N': N, 'uv': uv, 'I': I})
        for c in node.get('children', []): walk(c, W)

    for r in j['scenes'][j.get('scene', 0)]['nodes']: walk(r, np.eye(4))
    img = j['images'][0]; v = j['bufferViews'][img['bufferView']]
    image = (b[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']], img.get('mimeType'))
    mats = j.get('materials', [])
    return {'parts': parts, 'image': image, 'material': mats[0] if mats else {}, 'raw': raw}


def number(name):
    """tripo_part_12 → 12; a file of one unnamed piece → 0."""
    tail = name.rsplit('_', 1)[-1]
    return int(tail) if tail.isdigit() else 0
