"""Pictures of real surfaces for what dress.py builds anew from the owner's models: a plank's wood (its grain running
along it, its knots, its worn edges) and a rope's twist. Drawn here, nothing fetched; grey-brown, to be coloured by the
model's own colours (dress.py takes them from the model's picture), with their relief (normal maps) beside them.

    python3 tools/habitation/surfaces.py <out-folder> [size]
"""
import math, sys, os
import numpy as np
from PIL import Image, ImageFilter

def _noise(shape, scale, rng):
    """Smooth noise: random values at a coarse grid, enlarged smoothly."""
    h, w = shape
    gh, gw = max(2, int(h / scale)), max(2, int(w / scale))
    g = rng.random((gh + 1, gw + 1)).astype(np.float32)
    im = Image.fromarray(np.uint8(g * 255)).resize((w, h), Image.BICUBIC)
    return np.asarray(im, dtype=np.float32) / 255.0

def _streaks(shape, along, across, rng):
    """Noise drawn out along the picture's width: long streaks, as wood's fibres are."""
    h, w = shape
    g = rng.random((max(2, int(h / across)) + 1, max(2, int(w / along)) + 1)).astype(np.float32)
    return np.asarray(Image.fromarray(np.uint8(g * 255)).resize((w, h), Image.BICUBIC), np.float32) / 255.0

def wood(size=512, seed=5):
    """Planks' wood: its grain straight along the picture's width (u), weathered grey-brown, with a few knots, cracks
    along the grain; and its relief."""
    rng = np.random.default_rng(seed)
    h = w = size
    y = np.arange(h)[:, None] / h
    x = np.arange(w)[None, :] / w
    warp = (_streaks((h, w), 160, 40, rng) - 0.5) * 0.02
    rings = 0.5 + 0.5 * np.sin((y + warp) * 2 * math.pi * 23 + _streaks((h, w), 300, 60, rng) * 3)
    fibres = _streaks((h, w), 40, 1.2, rng)
    long_ = _streaks((h, w), 220, 8, rng)
    tone = 0.58 + 0.12 * rings + 0.14 * (fibres - 0.5) + 0.14 * (long_ - 0.5)
    for _ in range(2):
        cx, cy = rng.uniform(0.15, 0.85), rng.uniform(0.2, 0.8)
        rx, ry = rng.uniform(0.02, 0.035), rng.uniform(0.03, 0.05)
        d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
        tone -= 0.22 * np.exp(-d * 1.4)
    cracks = (np.abs(np.sin((y + warp) * 2 * math.pi * 7 + 1.0)) < 0.025) & (_streaks((h, w), 90, 30, rng) > 0.6)
    tone[cracks] *= 0.5
    tone = np.clip(tone, 0, 1)
    rgb = np.stack([tone * 1.0, tone * 0.94, tone * 0.85], -1)
    height = 0.4 * rings + 0.45 * fibres + 0.15 * long_ - 0.7 * cracks
    return Image.fromarray(np.uint8(np.clip(rgb, 0, 1) * 255)), normal_from(height, 2.5)

def rope(size=256, seed=9):
    """A rope: three strands twisted along the picture's width (u), fibres in them; and its relief."""
    rng = np.random.default_rng(seed)
    h = w = size
    y = np.arange(h)[:, None] / h
    x = np.arange(w)[None, :] / w
    phase = (x * 6 + y) % 1.0                     # three strands round the rope, twisting along it
    strand = 0.5 + 0.5 * np.cos(phase * 2 * math.pi * 3)
    fibre = _noise((h, w), 2, rng)
    tone = 0.55 + 0.3 * strand + 0.12 * (fibre - 0.5)
    rgb = np.stack([tone, tone * 0.9, tone * 0.72], -1)
    return Image.fromarray(np.uint8(np.clip(rgb, 0, 1) * 255)), normal_from(strand * 0.8 + fibre * 0.2, 4.0)

def normal_from(height, strength):
    gx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * 0.5 * strength
    gy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * 0.5 * strength
    n = np.stack([-gx, gy, np.ones_like(gx)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return Image.fromarray(np.uint8(np.clip((n * 0.5 + 0.5) * 255, 0, 255)))

if __name__ == '__main__':
    out = sys.argv[1]
    size = int(sys.argv[2]) if len(sys.argv) > 2 else 512
    os.makedirs(out, exist_ok=True)
    c, n = wood(size); c.save(os.path.join(out, 'wood.png')); n.save(os.path.join(out, 'wood-n.png'))
    c, n = rope(size // 2); c.save(os.path.join(out, 'rope.png')); n.save(os.path.join(out, 'rope-n.png'))
    print('wrote', out)
