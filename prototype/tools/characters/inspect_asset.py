"""Checks a GLB against the base character before it is let into the kit.

    python3 -I tools/characters/inspect_asset.py path/to/asset.glb

Answers, in order, the questions a new asset has to pass: is it the right size and the right way up, how heavy
is it, what is it made of, does it carry a skeleton and is that skeleton the base character's, and can it be
worn on the base character as it is. It reads the file and changes nothing.

Run it with -I and from outside the folder the asset is in: a downloaded file is data, not code.
"""
import os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glb import Glb, skeleton, node_local

BASE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'assets/characters/base/streetwear_character_rigged.glb')
NEAR_BUDGET = 3000        # triangles a single garment may cost on a person seen close


def report(path):
    g = Glb(path); j = g.json
    out = []; problems = []
    say = out.append
    say(f"{os.path.basename(path)}: glTF {j['asset'].get('version')} from {j['asset'].get('generator', 'an unnamed tool')}")
    if j.get('extensionsRequired'): problems.append(f"needs extensions the game does not read: {j['extensionsRequired']}")
    acc = j['accessors']
    lo = np.full(3, np.inf); hi = np.full(3, -np.inf); tris = 0; unweighted = 0; uv_missing = 0; over4 = 0
    meshes = j.get('meshes', [])
    for m in meshes:
        for p in m['primitives']:
            a = p['attributes']; pos = g.accessor(a['POSITION'])
            lo = np.minimum(lo, pos.min(0)); hi = np.maximum(hi, pos.max(0))
            tris += (acc[p['indices']]['count'] if 'indices' in p else len(pos)) // 3
            if 'JOINTS_0' not in a: unweighted += 1
            mat = j['materials'][p['material']] if 'material' in p else {}
            if 'TEXCOORD_0' not in a and 'baseColorTexture' in mat.get('pbrMetallicRoughness', {}): uv_missing += 1
            if 'JOINTS_1' in a: over4 += 1
    size = hi - lo
    say(f"  size        {size[0]:.2f} wide, {size[1]:.2f} high, {size[2]:.2f} deep; lowest point {lo[1]:.3f}")
    if size[1] > 3 or (size[1] < 0.02): problems.append(f"it is {size[1]:.2f} units high: not in metres, or not a wearable thing")
    if size[2] > size[1] * 1.5 and size[1] > 0.5: problems.append('it is lying down: the game is y up, facing +z')
    say(f"  weight      {tris:,} triangles in {len(meshes)} meshes" + (f"; over the {NEAR_BUDGET:,} a garment may cost near the camera, so it will be thinned" if tris > NEAR_BUDGET else ''))
    mats = j.get('materials', [])
    textured = sum(1 for m in mats if 'baseColorTexture' in m.get('pbrMetallicRoughness', {}))
    images = j.get('images', [])
    say(f"  materials   {len(mats)}, {textured} with a picture; {len(images)} images" + (f", {sum(j['bufferViews'][im['bufferView']]['byteLength'] for im in images if 'bufferView' in im) / 1024:.0f} KB" if images else ''))
    if uv_missing: problems.append(f'{uv_missing} textured meshes have no texture coordinates')
    skins = j.get('skins', [])
    if not skins:
        say('  skeleton    none: a rigid thing. It can be fixed to one bone (a hat to Head, a bag to a Forearm).')
    else:
        names = [j['nodes'][i].get('name', '?') for i in skins[0]['joints']]
        base = [b['name'] for b in skeleton(Glb(BASE))]
        same = set(names) == set(base)
        say(f"  skeleton    {len(names)} bones" + (', the base character\'s own' if same else ''))
        if not same:
            missing = sorted(set(base) - set(names)); extra = sorted(set(names) - set(base))
            problems.append(f"its skeleton is not the base character's (missing {missing[:6]}{'...' if len(missing) > 6 else ''}; extra {extra[:6]}{'...' if len(extra) > 6 else ''}). Its weights would have to be carried over to the base skeleton before it could be worn")
        else:
            b0 = {b['name']: b['world'][:3, 3] for b in skeleton(Glb(BASE))}
            b1 = {b['name']: b['world'][:3, 3] for b in skeleton(g)}
            worst = max(np.linalg.norm(b0[n] - b1[n]) for n in base)
            if worst > 0.005: problems.append(f'its bones stand up to {worst * 100:.1f} cm from the base character\'s: it was bound to a different pose')
        if unweighted: problems.append(f'{unweighted} meshes carry no weights though the file has a skeleton')
        if over4: problems.append('some vertices follow more than four bones; the extra are dropped')
    anims = j.get('animations', [])
    say(f"  animations  {', '.join(a.get('name', 'unnamed') for a in anims) if anims else 'none'}")
    say('')
    if problems:
        say('  Not ready to wear:')
        for p in problems: say('   - ' + p)
    else:
        say('  Fits the base character as it is. Add it to the bake to give it lighter copies for distance.')
    return '\n'.join(out), problems


if __name__ == '__main__':
    if len(sys.argv) < 2: print(__doc__); sys.exit(2)
    text, problems = report(sys.argv[1])
    print(text)
    sys.exit(1 if problems else 0)
