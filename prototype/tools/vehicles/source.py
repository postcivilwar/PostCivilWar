"""Reads a supplied vehicle GLB into meshes the bake can work on.

Nothing here writes to the supplied file. Every mesh comes back in the
vehicle's own frame (metres, Y up, facing +Z), one per node, tagged with the
name of its material and the pivot it hangs from.
"""
import os, sys
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'characters'))
import numpy as np
from glb import Glb, node_local
import meshkit as mk


def read(path):
    g = Glb(path); j = g.json
    parent = {}
    for i, n in enumerate(j['nodes']):
        for c in n.get('children', []): parent[c] = i
    world = {}
    def W(i):
        if i not in world: world[i] = (W(parent[i]) if i in parent else np.eye(4)) @ node_local(j['nodes'][i])
        return world[i]
    names = [n.get('name') for n in j['nodes']]
    def pivot_of(i):
        # the nearest ancestor that is a wheel or a steering pivot
        k = parent.get(i)
        while k is not None:
            if names[k].startswith('Wheel_') or names[k].startswith('Steering_Pivot'): return names[k]
            k = parent.get(k)
        return None
    meshes = []
    for i, n in enumerate(j['nodes']):
        if 'mesh' not in n: continue
        M = W(i)
        for p in j['meshes'][n['mesh']]['primitives']:
            a = p['attributes']
            pos = g.accessor(a['POSITION']).astype(np.float64)
            nrm = g.accessor(a['NORMAL']).astype(np.float64)
            uv = g.accessor(a['TEXCOORD_0']).astype(np.float64) if 'TEXCOORD_0' in a else None
            idx = g.accessor(p['indices']).astype(np.int64).reshape(-1, 3)
            m = mk.make(pos, idx, uv=uv, nrm=nrm)
            m = mk.transform(m, M)
            meshes.append({'node': names[i], 'pivot': pivot_of(i), 'material': j['materials'][p['material']]['name'], 'mesh': m})
    pivots = {names[i]: {'at': W(i)[:3, 3].copy(), 'parent': names[parent[i]] if i in parent else None} for i in range(len(names)) if 'mesh' not in j['nodes'][i]}
    materials = {m['name']: m for m in j['materials']}
    return {'glb': g, 'meshes': meshes, 'pivots': pivots, 'materials': materials}
