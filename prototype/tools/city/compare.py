"""Oganiru City's pictures beside the owner's reference pictures (31 October 2026): each pair on a page, his on the left
(a frame of one of the three videos he sent with the brief), the game's on the right, both the same height, a line
under each saying what it is. Writes one PDF and a picture of each page.

  python3 tools/city/compare.py <out.pdf> <ref.jpg> <game.png> "<what>" [<ref.jpg> <game.png> "<what>" ...]
"""
import sys
from PIL import Image, ImageDraw, ImageFont

def font(size):
    for name in ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/dejavu/DejaVuSans.ttf'):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()

def page(ref, game, what, height=720):
    a = Image.open(ref).convert('RGB'); b = Image.open(game).convert('RGB')
    a = a.resize((round(a.width * height / a.height), height)); b = b.resize((round(b.width * height / b.height), height))
    gap, foot = 24, 70
    out = Image.new('RGB', (a.width + b.width + gap * 3, height + gap * 2 + foot), (245, 243, 238))
    out.paste(a, (gap, gap)); out.paste(b, (gap * 2 + a.width, gap))
    d = ImageDraw.Draw(out)
    d.text((gap, gap + height + 10), 'His reference (a frame of his video)', fill=(90, 85, 80), font=font(20))
    d.text((gap * 2 + a.width, gap + height + 10), f'The game: {what}', fill=(20, 20, 20), font=font(22))
    return out

def main():
    out, rest = sys.argv[1], sys.argv[2:]
    pages = [page(rest[i], rest[i + 1], rest[i + 2]) for i in range(0, len(rest) - 2, 3)]
    pages[0].save(out, save_all=True, append_images=pages[1:], resolution=96)
    for k, p in enumerate(pages):
        p.save(out.replace('.pdf', f'-{k + 1}.jpg'), quality=85)
    print(len(pages), 'pages')

if __name__ == '__main__':
    main()
