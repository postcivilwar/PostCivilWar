"""Packs vehicle parts for the browser.

A part is a mesh in its own frame (the vehicle's, or a wheel's or fork's
pivot). Per vertex: position as three uint16 across the part's box, normal as
three int8, the slot (which colour paints it) as one uint8, and, for parts
that carry a texture, UV as two int16. Triangles are sorted into groups (solid,
then glass) so one mesh draws with two materials.
"""
import base64, json
import numpy as np

# 'seatmark' and 'badge' are the supplied coach's logos. They keep their places in this list so the bake can
# recognise and leave out those pieces; nothing that is written carries them.
SLOTS = ['paint', 'paint2', 'trim', 'steel', 'alloy', 'rubber', 'lens', 'amber', 'tail', 'glass', 'canopy', 'vinyl', 'floor', 'seat', 'curtain', 'cabinlight', 'seatmark', 'badge', 'chassis', 'accent']
SLOT = {name: i for i, name in enumerate(SLOTS)}
GROUP_OF = {SLOT['glass']: 'glass'}
GROUP_ORDER = ['solid', 'glass']
UV_SCALE = 4096


class Kit:
    def __init__(self):
        self.chunks = []; self.size = 0; self.parts = {}; self.seen = {}

    def _put(self, array, align):
        raw = np.ascontiguousarray(array).tobytes()
        key = (hash(raw), len(raw), align)
        if key in self.seen: return self.seen[key]          # the same bytes are stored once
        pad = (-self.size) % align
        if pad: self.chunks.append(b'\0' * pad); self.size += pad
        at = self.size
        self.chunks.append(raw); self.size += len(raw)
        self.seen[key] = at
        return at

    def add(self, part_id, mesh, lod, uv=False):
        m = mesh
        group = np.array([GROUP_ORDER.index(GROUP_OF.get(int(s), 'solid')) for s in m['slot']])
        tri_group = group[m['idx'][:, 0]]
        order = np.argsort(tri_group, kind='stable')
        idx = m['idx'][order]; tri_group = tri_group[order]
        groups = []
        for g, name in enumerate(GROUP_ORDER):
            n = int((tri_group == g).sum())
            if n: groups.append({'kind': name, 'start': int(np.argmax(tri_group == g)) * 3, 'count': n * 3})
        lo = m['pos'].min(0); hi = m['pos'].max(0); span = np.maximum(hi - lo, 1e-6)
        q = np.round((m['pos'] - lo) / span * 65535).astype(np.uint16)
        n = np.clip(np.round(m['nrm'] * 127), -127, 127).astype(np.int8)
        wide = len(m['pos']) > 65535
        rec = {'v': len(m['pos']), 't': len(idx), 'lo': [round(float(x), 5) for x in lo], 'span': [round(float(x), 6) for x in span], 'groups': groups, 'wide': wide,
               'pos': self._put(q, 2), 'nrm': self._put(n, 1), 'slot': self._put(m['slot'].astype(np.uint8), 1)}
        if uv: rec['uv'] = self._put(np.clip(np.round(m['uv'] * UV_SCALE), -32767, 32767).astype(np.int16), 2)
        rec['idx'] = self._put(idx.astype(np.uint32 if wide else np.uint16), 4 if wide else 2)
        self.parts.setdefault(part_id, {'lods': {}})['lods'][lod] = rec

    def manifest(self):
        return {pid: {'lods': [p['lods'][k] for k in sorted(p['lods'])]} for pid, p in self.parts.items()}

    def write(self, path, meta):
        meta = dict(meta); meta['slots'] = ['unused' if s in ('seatmark', 'badge') else s for s in SLOTS]; meta['uvScale'] = UV_SCALE; meta['parts'] = self.manifest()
        blob = b''.join(self.chunks)
        with open(path, 'w') as f:
            f.write('// Baked by tools/vehicles/bake.py from the supplied vehicle models. Do not edit.\n')
            f.write('export const VEHICLE_META = ' + json.dumps(meta, separators=(',', ':')) + ';\n')
            f.write("export const VEHICLE_B64 = '" + base64.b64encode(blob).decode() + "';\n")
        return len(blob)
