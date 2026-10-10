"""Writes a vehicle at one level of detail as a GLB with the supplied model's own node names.

The pivots sit where the supplied model has them, so the same game code (or
the supplied model's own Wheel_Roll and Steering_Sweep logic) drives any level.
Colours are flat: the files carry no textures.
"""
import json, struct
import numpy as np


def write(path, nodes, materials, generator='PostCivilWar vehicle bake'):
    """nodes: list of {name, translation?, children? (names), mesh? (a mesh dict)}; the first is the root.
    materials: {slot index: {name, colour (linear rgb), roughness, metalness, opacity?}}"""
    blob = bytearray(); views = []; accessors = []; meshes = []; mats = []; mat_index = {}

    def push(array, target=None):
        while len(blob) % 4: blob.append(0)
        views.append({'buffer': 0, 'byteOffset': len(blob), 'byteLength': array.nbytes, **({'target': target} if target else {})})
        blob.extend(array.tobytes())
        return len(views) - 1

    def accessor(array, kind, ctype, target=None, minmax=False):
        a = {'bufferView': push(array, target), 'componentType': ctype, 'count': len(array), 'type': kind}
        if minmax: a['min'] = [float(x) for x in array.min(0)]; a['max'] = [float(x) for x in array.max(0)]
        accessors.append(a); return len(accessors) - 1

    def material(slot):
        if slot not in mat_index:
            m = materials[slot]
            rec = {'name': m['name'], 'doubleSided': True, 'pbrMetallicRoughness': {'baseColorFactor': [*[float(c) for c in m['colour']], float(m.get('opacity', 1.0))], 'metallicFactor': float(m['metalness']), 'roughnessFactor': float(m['roughness'])}}
            if m.get('opacity', 1.0) < 1: rec['alphaMode'] = 'BLEND'
            mat_index[slot] = len(mats); mats.append(rec)
        return mat_index[slot]

    def mesh_of(name, m):
        pos = accessor(m['pos'].astype('<f4'), 'VEC3', 5126, 34962, minmax=True)
        nrm = accessor(m['nrm'].astype('<f4'), 'VEC3', 5126, 34962)
        prims = []
        tri_slot = m['slot'][m['idx'][:, 0]]
        wide = len(m['pos']) > 65535
        for slot in sorted(set(int(s) for s in tri_slot)):
            if slot not in materials: continue
            idx = m['idx'][tri_slot == slot].astype('<u4' if wide else '<u2').ravel()
            prims.append({'attributes': {'POSITION': pos, 'NORMAL': nrm}, 'indices': accessor(idx, 'SCALAR', 5125 if wide else 5123, 34963), 'material': material(slot)})
        meshes.append({'name': name, 'primitives': prims})
        return len(meshes) - 1

    index = {n['name']: i for i, n in enumerate(nodes)}
    out = []; triangles = 0
    for n in nodes:
        rec = {'name': n['name']}
        if 'translation' in n: rec['translation'] = [float(x) for x in n['translation']]
        if n.get('children'): rec['children'] = [index[c] for c in n['children']]
        if n.get('mesh') is not None: rec['mesh'] = mesh_of(n['name'], n['mesh']); triangles += len(n['mesh']['idx'])
        out.append(rec)
    doc = {'asset': {'version': '2.0', 'generator': generator}, 'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': out, 'meshes': meshes, 'materials': mats,
           'accessors': accessors, 'bufferViews': views, 'buffers': [{'byteLength': len(blob)}]}
    text = json.dumps(doc, separators=(',', ':')).encode()
    text += b' ' * ((4 - len(text) % 4) % 4)
    while len(blob) % 4: blob.append(0)
    with open(path, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(text) + 8 + len(blob)))
        f.write(struct.pack('<I4s', len(text), b'JSON')); f.write(text)
        f.write(struct.pack('<I4s', len(blob), b'BIN\0')); f.write(bytes(blob))
    return triangles
