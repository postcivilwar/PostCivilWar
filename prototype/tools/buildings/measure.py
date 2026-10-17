# Measures each of the owner's single-mesh models as the game stands it: turned so that the side it shows the street
# (its `front`, degrees from +z toward +x in its own file) faces +z, how wide it is across that front, how deep, how
# high, and where its middle and its foot are, in the file's own units. The game scales each by one number from
# these (src/sim/zones/town-buildings.js); nothing in the file is changed. Reads only; prints JSON.
#   python3 tools/buildings/measure.py front_degrees=file.glb ...
import json, struct, sys, math

def measure(path, front_deg):
    data = open(path, 'rb').read()
    clen = struct.unpack('<I', data[12:16])[0]
    g = json.loads(data[20:20 + clen])
    off = 20 + clen + 8
    prim = g['meshes'][0]['primitives'][0]
    a = g['accessors'][prim['attributes']['POSITION']]
    bv = g['bufferViews'][a['bufferView']]
    start = off + bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = bv.get('byteStride', 12)
    f = math.radians(front_deg)
    c, s = math.cos(f), math.sin(f)
    u0 = w0 = y0 = math.inf
    u1 = w1 = y1 = -math.inf
    for i in range(a['count']):
        x, y, z = struct.unpack_from('<3f', data, start + i * stride)
        u = x * c - z * s          # across it: its left (as one faces it from the street) toward -u
        w = x * s + z * c          # along it: its front toward +w
        u0 = min(u0, u); u1 = max(u1, u); w0 = min(w0, w); w1 = max(w1, w); y0 = min(y0, y); y1 = max(y1, y)
    r = lambda v: round(v, 4)
    return {'front': front_deg, 'across': r(u1 - u0), 'deep': r(w1 - w0), 'high': r(y1 - y0), 'mid': [r((u0 + u1) / 2), r((w0 + w1) / 2)], 'foot': r(y0), 'triangles': g['accessors'][prim['indices']]['count'] // 3}

out = {}
for arg in sys.argv[1:]:
    deg, path = arg.split('=', 1)
    out[path.split('/')[-1]] = measure(path, float(deg))
print(json.dumps(out, indent=1))
