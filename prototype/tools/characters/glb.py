"""Minimal GLB reader for inspection and baking. Numpy only."""
import json, struct
import numpy as np

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}

class Glb:
    def __init__(self, path):
        data = open(path, 'rb').read()
        off = 12; self.bin = None
        while off < len(data):
            clen, ctype = struct.unpack('<I4s', data[off:off + 8])
            body = data[off + 8: off + 8 + clen]
            if ctype == b'JSON': self.json = json.loads(body)
            else: self.bin = body
            off += 8 + clen
    def accessor(self, i):
        a = self.json['accessors'][i]; bv = self.json['bufferViews'][a['bufferView']]
        dt = np.dtype(CT[a['componentType']]); n = NC[a['type']]
        start = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        stride = bv.get('byteStride', 0)
        if stride and stride != dt.itemsize * n:
            raw = np.frombuffer(self.bin, dtype=np.uint8, count=stride * a['count'], offset=start).reshape(a['count'], stride)[:, :dt.itemsize * n]
            arr = np.frombuffer(raw.tobytes(), dtype=dt)
        else:
            arr = np.frombuffer(self.bin, dtype=dt, count=a['count'] * n, offset=start)
        arr = arr.reshape(a['count'], n) if n > 1 else arr
        if a.get('normalized'):
            arr = arr.astype(np.float32) / np.iinfo(dt).max
        return arr
    def image(self, i):
        im = self.json['images'][i]; bv = self.json['bufferViews'][im['bufferView']]
        return self.bin[bv.get('byteOffset', 0): bv.get('byteOffset', 0) + bv['byteLength']]
    def mesh(self, i):
        m = self.json['meshes'][i]; p = m['primitives'][0]; a = p['attributes']
        out = {'name': m.get('name'), 'material': p.get('material'), 'pos': self.accessor(a['POSITION']).astype(np.float64), 'nrm': self.accessor(a['NORMAL']).astype(np.float64), 'joints': self.accessor(a['JOINTS_0']).astype(np.int64), 'weights': self.accessor(a['WEIGHTS_0']).astype(np.float64), 'idx': self.accessor(p['indices']).astype(np.int64).reshape(-1, 3)}
        out['uv'] = self.accessor(a['TEXCOORD_0']).astype(np.float64) if 'TEXCOORD_0' in a else None
        return out

def quat_to_mat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])

def node_local(n):
    M = np.eye(4)
    R = quat_to_mat(n.get('rotation', [0, 0, 0, 1])); Sc = np.diag(n.get('scale', [1, 1, 1]))
    M[:3, :3] = R @ Sc; M[:3, 3] = n.get('translation', [0, 0, 0])
    return M

def skeleton(g):
    j = g.json; skin = j['skins'][0]; joints = skin['joints']
    parent = {}
    for i, n in enumerate(j['nodes']):
        for c in n.get('children', []): parent[c] = i
    world = {}
    def W(i):
        if i not in world: world[i] = (W(parent[i]) if i in parent else np.eye(4)) @ node_local(j['nodes'][i])
        return world[i]
    ibm = g.accessor(skin['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1).astype(np.float64)
    bones = []
    for k, ni in enumerate(joints):
        n = j['nodes'][ni]
        bones.append({'name': n['name'], 'node': ni, 'parent': joints.index(parent[ni]) if parent.get(ni) in joints else -1, 'local': node_local(n), 'world': W(ni), 'ibm': ibm[k], 't': n.get('translation', [0, 0, 0]), 'r': n.get('rotation', [0, 0, 0, 1]), 's': n.get('scale', [1, 1, 1])})
    return bones
