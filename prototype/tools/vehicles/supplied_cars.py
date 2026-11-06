"""The owner's ambulance and two trucks as the car tools read a car (6 November 2026, the brief's Stage 3: "the ambulance
and the two trucks" given real glass and a cab inside, as the cars were). Nothing of his files is changed, and nothing
written here is a part of the website: it is what tools/vehicles/windows.py and dials.py read, so that his vehicles'
painted windows are found as the cars' were.

Each is read from its website copy with its pictures at 2048 (assets/models-light/vehicle-<id>.2048.glb: the same
points and triangles, in the same order, as his file and the phone's copy), turned to face +z as the game draws it
(src/sim/zones/supplied-vehicles.js `front`), its middle over the origin and its wheels on the ground, in its own units,
and written as tools/vehicles/cars.py writes a car's shape:

    python3 tools/vehicles/supplied_cars.py <folder>

    <folder>/<id>.bin             its points, the way each faces, their places on its colour picture, its triangles
    <folder>/<id>-color-2k.jpg    its colour picture
    <folder>/cars.json            its measures (length, height, width in its own units; the cab's, from
                                  tools/vehicles/supplied_cabs.json, where the driver sits and the wheel is)
"""
import io, json, os, struct, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
LIGHT = os.path.join(ROOT, 'assets', 'models-light')
CABS = os.path.join(HERE, 'supplied_cabs.json')
# (the website's names, and the way each faces in its own file: radians from +z toward +x, supplied-vehicles.js)
VEHICLES = {
    'ambulance': ('vehicle-ambulance', 90.24),
    'boxTruck': ('vehicle-box-truck', -42.7),
    'heavyTruck': ('vehicle-heavy-truck', 67.1),
}
LENGTHS = {'ambulance': 5.7, 'boxTruck': 7.2, 'heavyTruck': 7.0}
TYPES = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
WIDTH = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


def read_glb(path):
    data = open(path, 'rb').read()
    clen = struct.unpack('<I', data[12:16])[0]
    j = json.loads(data[20:20 + clen])
    binary = data[20 + clen + 8:]

    def accessor(k):
        a = j['accessors'][k]; bv = j['bufferViews'][a['bufferView']]
        off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        t, w = TYPES[a['componentType']], WIDTH[a['type']]
        n = a['count'] * w
        arr = np.frombuffer(binary, t, n, off).reshape(a['count'], w) if bv.get('byteStride') in (None, 0, np.dtype(t).itemsize * w) else None
        if arr is None:
            stride = bv['byteStride']; arr = np.stack([np.frombuffer(binary, t, w, off + i * stride) for i in range(a['count'])])
        if a.get('normalized'):
            arr = arr.astype(np.float64) / np.iinfo(t).max
        return arr

    prim = j['meshes'][0]['primitives'][0]
    pos = accessor(prim['attributes']['POSITION']).astype(np.float64)
    nor = accessor(prim['attributes']['NORMAL']).astype(np.float64) if 'NORMAL' in prim['attributes'] else None
    uv = accessor(prim['attributes']['TEXCOORD_0']).astype(np.float64)
    idx = accessor(prim['indices']).reshape(-1, 3).astype(np.uint32)
    mat = j['materials'][prim.get('material', 0)]
    ti = mat['pbrMetallicRoughness']['baseColorTexture']['index']
    img = j['images'][j['textures'][ti]['source']]
    bv = j['bufferViews'][img['bufferView']]
    raw = binary[bv.get('byteOffset', 0): bv.get('byteOffset', 0) + bv['byteLength']]
    return pos, nor, uv, idx, Image.open(io.BytesIO(raw)).convert('RGB')


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'dist', 'supplied-cars')
    os.makedirs(out, exist_ok=True)
    cabs = json.load(open(CABS)) if os.path.exists(CABS) else {}
    specs = {}
    for vid, (name, front) in VEHICLES.items():
        pos, nor, uv, idx, colour = read_glb(os.path.join(LIGHT, f'{name}.2048.glb'))
        a = np.radians(front); c, s = np.cos(a), np.sin(a)
        # (turned as render-supplied.js `fitVehicle` turns it: across (its left +) and along (its front +))
        u = pos[:, 0] * c - pos[:, 2] * s
        w = pos[:, 0] * s + pos[:, 2] * c
        P = np.stack([u - (u.min() + u.max()) / 2, pos[:, 1] - pos[:, 1].min(), w - (w.min() + w.max()) / 2], 1)
        if nor is None:
            nor = np.zeros_like(P)
        nu = nor[:, 0] * c - nor[:, 2] * s; nw = nor[:, 0] * s + nor[:, 2] * c
        N = np.stack([nu, nor[:, 1], nw], 1)
        N /= np.maximum(1e-9, np.linalg.norm(N, axis=1))[:, None]
        n = len(P)
        buf = bytearray()
        buf += P.astype(np.float32).tobytes()
        buf += np.round(N * 32767).astype(np.int16).tobytes()
        if n % 2: buf += b'\0\0'
        buf += uv.astype(np.float32).tobytes()
        buf += idx.astype(np.uint32).tobytes()
        open(os.path.join(out, f'{vid}.bin'), 'wb').write(bytes(buf))
        colour.save(os.path.join(out, f'{vid}-color-2k.jpg'), quality=92)
        L, H, B = float(P[:, 2].max() - P[:, 2].min()), float(P[:, 1].max()), float(P[:, 0].max() - P[:, 0].min())
        spec = {'length': L, 'height': H, 'body': B, 'width': B, 'vertices': n, 'triangles': len(idx), 'parts': [len(idx)],
                'files': {'mesh': f'{vid}.bin'}, 'real': LENGTHS[vid]}
        if vid in cabs: spec['driver'] = cabs[vid]
        specs[vid] = spec
        print(vid, n, 'points', len(idx), 'triangles', 'length', round(L, 4), 'height', round(H, 4), 'width', round(B, 4), 'units a metre', round(L / LENGTHS[vid], 4))
    json.dump(specs, open(os.path.join(out, 'cars.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
