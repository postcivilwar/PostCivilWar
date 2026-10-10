"""Describe a vehicle GLB: hierarchy, sizes, wheels, materials, textures, clips.

    python3 -I tools/vehicles/inspect_vehicle.py file.glb [--json out.json] [--textures dir]
"""
import sys, os, json, io
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'characters'))
import numpy as np
from glb import Glb, node_local

def load(path):
    g = Glb(path); j = g.json
    parent = {}
    for i, n in enumerate(j['nodes']):
        for c in n.get('children', []): parent[c] = i
    world = {}
    def W(i):
        if i not in world: world[i] = (W(parent[i]) if i in parent else np.eye(4)) @ node_local(j['nodes'][i])
        return world[i]
    for i in range(len(j['nodes'])): W(i)
    return g, parent, world

def prims(g, mesh_index):
    out = []
    for p in g.json['meshes'][mesh_index]['primitives']:
        a = p['attributes']
        pos = g.accessor(a['POSITION']).astype(np.float64)
        idx = g.accessor(p['indices']).astype(np.int64).reshape(-1, 3) if 'indices' in p else np.arange(len(pos)).reshape(-1, 3)
        out.append({'pos': pos, 'nrm': g.accessor(a['NORMAL']).astype(np.float64) if 'NORMAL' in a else None, 'uv': g.accessor(a['TEXCOORD_0']).astype(np.float64) if 'TEXCOORD_0' in a else None, 'col': g.accessor(a['COLOR_0']).astype(np.float64) if 'COLOR_0' in a else None, 'idx': idx, 'material': p.get('material'), 'attrs': sorted(a.keys())})
    return out

def describe(path, tex_dir=None):
    g, parent, world = load(path); j = g.json
    rep = {'file': os.path.basename(path), 'bytes': os.path.getsize(path), 'generator': j['asset'].get('generator'), 'nodes': [], 'materials': [], 'images': [], 'animations': [], 'skins': len(j.get('skins', []))}
    lo = np.full(3, 1e9); hi = np.full(3, -1e9); tris = 0; verts = 0
    for i, n in enumerate(j['nodes']):
        rec = {'i': i, 'name': n.get('name'), 'parent': j['nodes'][parent[i]].get('name') if i in parent else None, 'at': [round(float(x), 4) for x in world[i][:3, 3]]}
        if 'mesh' in n:
            ps = prims(g, n['mesh']); a = np.full(3, 1e9); b = np.full(3, -1e9); t = 0; v = 0; mats = []
            for p in ps:
                w = p['pos'] @ world[i][:3, :3].T + world[i][:3, 3]
                a = np.minimum(a, w.min(0)); b = np.maximum(b, w.max(0)); t += len(p['idx']); v += len(p['pos'])
                mats.append(j['materials'][p['material']]['name'] if p['material'] is not None else None)
            rec.update({'tris': t, 'verts': v, 'min': [round(float(x), 3) for x in a], 'max': [round(float(x), 3) for x in b], 'materials': mats, 'attrs': ps[0]['attrs']})
            lo = np.minimum(lo, a); hi = np.maximum(hi, b); tris += t; verts += v
        rep['nodes'].append(rec)
    rep['bounds'] = {'min': [round(float(x), 3) for x in lo], 'max': [round(float(x), 3) for x in hi], 'size': [round(float(x), 3) for x in hi - lo]}
    rep['triangles'] = tris; rep['vertices'] = verts
    for m in j.get('materials', []):
        pbr = m.get('pbrMetallicRoughness', {})
        rep['materials'].append({'name': m.get('name'), 'base': [round(x, 3) for x in pbr.get('baseColorFactor', [1, 1, 1, 1])], 'metal': pbr.get('metallicFactor', 1), 'rough': pbr.get('roughnessFactor', 1), 'tex': pbr.get('baseColorTexture', {}).get('index'), 'mr': pbr.get('metallicRoughnessTexture', {}).get('index'), 'normal': m.get('normalTexture', {}).get('index'), 'emissive': m.get('emissiveFactor'), 'alpha': m.get('alphaMode', 'OPAQUE'), 'double': m.get('doubleSided', False), 'ext': list(m.get('extensions', {}).keys())})
    from PIL import Image
    for k, im in enumerate(j.get('images', [])):
        data = g.image(k); pic = Image.open(io.BytesIO(data))
        rep['images'].append({'i': k, 'name': im.get('name'), 'mime': im.get('mimeType'), 'bytes': len(data), 'size': list(pic.size), 'mode': pic.mode})
        if tex_dir:
            os.makedirs(tex_dir, exist_ok=True); pic.save(os.path.join(tex_dir, f"{k:02d}_{(im.get('name') or 'image').replace('/', '_')}.png"))
    rep['textures'] = [{'i': k, 'image': t.get('source')} for k, t in enumerate(j.get('textures', []))]
    for an in j.get('animations', []):
        chans = []
        for c in an['channels']:
            s = an['samplers'][c['sampler']]; times = g.accessor(s['input']); vals = g.accessor(s['output'])
            chans.append({'node': j['nodes'][c['target']['node']].get('name'), 'path': c['target']['path'], 'keys': int(len(times)), 'from': float(times[0]), 'to': float(times[-1]), 'first': [round(float(x), 4) for x in np.atleast_2d(vals)[0]], 'mid': [round(float(x), 4) for x in np.atleast_2d(vals)[len(times) // 4]]})
        rep['animations'].append({'name': an.get('name'), 'channels': chans})
    return rep

if __name__ == '__main__':
    args = sys.argv[1:]; path = args[0]
    tex = args[args.index('--textures') + 1] if '--textures' in args else None
    rep = describe(path, tex)
    if '--json' in args: json.dump(rep, open(args[args.index('--json') + 1], 'w'), indent=1)
    print(f"{rep['file']}: {rep['bytes']:,} bytes, {rep['generator']}")
    print(f"  {rep['triangles']:,} triangles, {rep['vertices']:,} vertices, {sum(1 for n in rep['nodes'] if 'tris' in n)} mesh nodes, skins {rep['skins']}")
    b = rep['bounds']; print(f"  bounds x {b['min'][0]}..{b['max'][0]}  y {b['min'][1]}..{b['max'][1]}  z {b['min'][2]}..{b['max'][2]}  size {b['size']}")
    print('  nodes:')
    for n in rep['nodes']:
        extra = f"  {n['tris']:>6} tris  {n['min']} .. {n['max']}  {n['materials']} {n['attrs']}" if 'tris' in n else ''
        print(f"    {n['name']:<28} < {str(n['parent']):<22} at {n['at']}{extra}")
    print('  materials:')
    for m in rep['materials']: print('   ', m)
    print('  images:')
    for im in rep['images']: print('   ', im)
    print('  textures:', rep['textures'])
    for an in rep['animations']:
        print('  clip', an['name'])
        for c in an['channels']: print('     ', c)
