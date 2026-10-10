"""Writes every part of the kit as its own GLB, skinned to the base character's skeleton.

    python3 tools/characters/export_glb.py

The files go to assets/characters/{clothing,hair,headwear,accessories,body,footwear}. Each holds one skinned
mesh and the 22-bone skeleton exactly as the base character has it, so a part can be opened in Blender or
brought into Unreal and worn on the same armature. Each colour of cloth is its own material, named for its
slot (cloth_a, cloth_b, skin, hair and so on); the game gives those their colours when someone puts the part on.
"""
import json, os, struct, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glb import Glb, skeleton
from rig import Rig
import meshkit as mk
import face, headwear as hw, wardrobe as wd
from base import base_parts
from tailor import Tailor
from kit import SLOTS

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SOURCE = os.path.join(ROOT, 'assets/characters/base/streetwear_character_rigged.glb')
FOLDER = {'top': 'clothing', 'dress': 'clothing', 'bottom': 'clothing', 'hair': 'hair', 'hat': 'headwear', 'acc': 'accessories', 'body': 'body', 'shoe': 'footwear'}
SLOT_NAME = {v: ('cloth_' + k if k in 'abcd' else k) for k, v in SLOTS.items()}
SLOT_COLOUR = {'skin': (0.18, 0.085, 0.042), 'hair': (0.01, 0.008, 0.007), 'lips': (0.11, 0.04, 0.03), 'eyewhite': (0.8, 0.78, 0.7), 'dark': (0.006, 0.005, 0.004), 'brow': (0.01, 0.008, 0.007), 'iris': (0.03, 0.012, 0.006), 'cloth_a': (0.55, 0.6, 0.45), 'cloth_b': (0.07, 0.38, 0.01), 'cloth_c': (0.6, 0.4, 0.05), 'cloth_d': (0.3, 0.02, 0.03)}


def write_glb(path, mesh, bones, name):
    blob = bytearray(); views = []; accessors = []

    def push(array, target=None):
        while len(blob) % 4: blob.append(0)
        views.append({'buffer': 0, 'byteOffset': len(blob), 'byteLength': array.nbytes, **({'target': target} if target else {})})
        blob.extend(array.tobytes())
        return len(views) - 1

    def accessor(array, kind, ctype, target=None, minmax=False, normalized=False):
        a = {'bufferView': push(array, target), 'componentType': ctype, 'count': len(array), 'type': kind}
        if minmax: a['min'] = [float(x) for x in array.min(0)]; a['max'] = [float(x) for x in array.max(0)]
        if normalized: a['normalized'] = True
        accessors.append(a); return len(accessors) - 1

    pos = accessor(mesh['pos'].astype('<f4'), 'VEC3', 5126, 34962, minmax=True)
    nrm = accessor(mesh['nrm'].astype('<f4'), 'VEC3', 5126, 34962)
    uv = accessor(mesh['uv'].astype('<f4'), 'VEC2', 5126, 34962)
    joints = accessor(mesh['J'].astype(np.uint8), 'VEC4', 5121, 34962)
    weights = accessor(mesh['W'].astype('<f4'), 'VEC4', 5126, 34962)
    materials = []; primitives = []
    tri_slot = mesh['slot'][mesh['idx'][:, 0]]
    for slot in sorted(set(int(s) for s in tri_slot)):
        idx = mesh['idx'][tri_slot == slot].astype('<u2' if len(mesh['pos']) < 65536 else '<u4').ravel()
        ia = accessor(idx, 'SCALAR', 5123 if idx.dtype.itemsize == 2 else 5125, 34963)
        nm = SLOT_NAME.get(slot, f'slot_{slot}')
        materials.append({'name': nm, 'doubleSided': True, 'pbrMetallicRoughness': {'baseColorFactor': [*SLOT_COLOUR.get(nm, (0.5, 0.5, 0.5)), 1.0], 'metallicFactor': 0, 'roughnessFactor': 0.8}})
        primitives.append({'attributes': {'POSITION': pos, 'NORMAL': nrm, 'TEXCOORD_0': uv, 'JOINTS_0': joints, 'WEIGHTS_0': weights}, 'indices': ia, 'material': len(materials) - 1})
    ibm = accessor(np.array([b['ibm'].T for b in bones], dtype='<f4').reshape(-1, 16), 'MAT4', 5126)
    nodes = []
    for i, b in enumerate(bones):
        n = {'name': b['name'], 'translation': [float(x) for x in b['t']], 'rotation': [float(x) for x in b['r']]}
        kids = [k for k, c in enumerate(bones) if c['parent'] == i]
        if kids: n['children'] = kids
        nodes.append(n)
    nodes.append({'name': name, 'mesh': 0, 'skin': 0})
    roots = [i for i, b in enumerate(bones) if b['parent'] < 0]
    nodes.append({'name': 'Streetwear_Rig', 'children': [len(bones)] + roots})
    doc = {'asset': {'version': '2.0', 'generator': 'PostCivilWar character bake'}, 'scene': 0, 'scenes': [{'nodes': [len(nodes) - 1]}], 'nodes': nodes,
           'meshes': [{'name': name, 'primitives': primitives}], 'materials': materials, 'skins': [{'name': 'Streetwear_Rig', 'joints': list(range(len(bones))), 'inverseBindMatrices': ibm}],
           'accessors': accessors, 'bufferViews': views, 'buffers': [{'byteLength': len(blob)}]}
    text = json.dumps(doc, separators=(',', ':')).encode()
    text += b' ' * ((4 - len(text) % 4) % 4)
    while len(blob) % 4: blob.append(0)
    with open(path, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(text) + 8 + len(blob)))
        f.write(struct.pack('<I4s', len(text), b'JSON')); f.write(text)
        f.write(struct.pack('<I4s', len(blob), b'BIN\0')); f.write(bytes(blob))


def main():
    g = Glb(SOURCE); bones = skeleton(g); rig = Rig(bones)
    raw = base_parts(g)
    head_raw, _ = face.split_neck(raw['head'])
    _, bare = face.finish_head(head_raw, rig.n, rig.index['Head'], 2000)
    parts = {name: rig.to_bind(mesh) for name, mesh in wd.catalogue(Tailor(rig)).items()}
    parts.update(hw.catalogue(rig, bare))
    total = 0
    for name, mesh in sorted(parts.items()):
        group, rest = name.split('.', 1)
        folder = os.path.join(ROOT, 'assets/characters', FOLDER[group])
        os.makedirs(folder, exist_ok=True)
        path = os.path.join(folder, rest.replace('.', '_') + '.glb')
        write_glb(path, mesh, bones, name)
        total += os.path.getsize(path)
    print(f'wrote {len(parts)} parts, {total / 1024:.0f} KB, under assets/characters')


if __name__ == '__main__':
    main()
