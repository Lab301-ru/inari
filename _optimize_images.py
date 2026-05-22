"""
One-shot image optimizer for the Inari atelier site.
- Resize gallery images to max 800px on long side (preserve aspect)
- Re-encode as optimized WebP + AVIF
- Backup originals to ./_originals/
Run once, then delete this script.
"""
import os, shutil
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
BACKUP = os.path.join(ROOT, '_originals')
os.makedirs(BACKUP, exist_ok=True)

MAX_SIDE = 800  # max long-side for gallery images
WEBP_QUALITY = 78
AVIF_QUALITY = 55  # AVIF q55 ≈ WebP q80 visually
HERO_MAX = 1366   # hero image — keep larger because LCP
HERO_MOBILE = 720 # mobile hero variant


def process_gallery(filename):
    src = os.path.join(ROOT, filename)
    if not os.path.exists(src):
        return None
    # Backup once
    bak = os.path.join(BACKUP, filename)
    if not os.path.exists(bak):
        shutil.copy2(src, bak)

    img = Image.open(src).convert('RGB')
    w, h = img.size
    scale = MAX_SIDE / max(w, h)
    if scale < 1:
        new = (round(w * scale), round(h * scale))
        img = img.resize(new, Image.LANCZOS)
    else:
        new = (w, h)

    base = os.path.splitext(filename)[0]
    out_webp = os.path.join(ROOT, base + '.webp')
    out_avif = os.path.join(ROOT, base + '.avif')

    img.save(out_webp, 'WEBP', quality=WEBP_QUALITY, method=6)
    img.save(out_avif, 'AVIF', quality=AVIF_QUALITY, speed=4)

    return {
        'file': filename, 'orig': (w, h), 'new': new,
        'webp_size': os.path.getsize(out_webp),
        'avif_size': os.path.getsize(out_avif),
        'orig_size': os.path.getsize(bak),
    }


def process_hero():
    src = os.path.join(ROOT, 'hero.avif')
    bak = os.path.join(BACKUP, 'hero.avif')
    if not os.path.exists(bak):
        shutil.copy2(src, bak)
    img = Image.open(src).convert('RGB')
    w, h = img.size
    # Desktop variant (max 1600px)
    scale = HERO_MAX / max(w, h)
    if scale < 1:
        desk = img.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    else:
        desk = img
    desk.save(os.path.join(ROOT, 'hero.avif'), 'AVIF', quality=58, speed=4)
    # Mobile variant
    scale = HERO_MOBILE / max(w, h)
    if scale < 1:
        mob = img.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    else:
        mob = img
    mob.save(os.path.join(ROOT, 'hero-mobile.avif'), 'AVIF', quality=55, speed=4)
    return desk.size, mob.size


def process_og():
    src = os.path.join(ROOT, 'og-image.png')
    bak = os.path.join(BACKUP, 'og-image.png')
    if not os.path.exists(bak):
        shutil.copy2(src, bak)
    img = Image.open(src).convert('RGB')
    # Keep PNG path but compress aggressively; also add JPG fallback
    # Resize if larger than 1366x768 (standard OG max)
    w, h = img.size
    if w > 1366 or h > 768:
        img.thumbnail((1366, 768), Image.LANCZOS)
    img.save(os.path.join(ROOT, 'og-image.png'), 'PNG', optimize=True, compress_level=9)
    img.save(os.path.join(ROOT, 'og-image.jpg'), 'JPEG', quality=82, optimize=True, progressive=True)
    return img.size


if __name__ == '__main__':
    gallery_files = [
        'XXXL.webp',
        *[f'XXXL ({i}).webp' for i in [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,19,20]],
    ]
    total_orig = 0
    total_webp = 0
    total_avif = 0
    print('=== GALLERY ===')
    for f in gallery_files:
        r = process_gallery(f)
        if r is None:
            print(f'  SKIP {f} (missing)')
            continue
        total_orig += r['orig_size']
        total_webp += r['webp_size']
        total_avif += r['avif_size']
        print(f"  {f}: {r['orig'][0]}x{r['orig'][1]} -> {r['new'][0]}x{r['new'][1]}  "
              f"orig={r['orig_size']//1024}KB webp={r['webp_size']//1024}KB avif={r['avif_size']//1024}KB")

    print(f'\nTOTAL: orig={total_orig//1024}KB webp={total_webp//1024}KB avif={total_avif//1024}KB')
    print(f'Saving (webp): {(total_orig-total_webp)//1024}KB ({100*(1-total_webp/total_orig):.0f}%)')
    print(f'Saving (avif): {(total_orig-total_avif)//1024}KB ({100*(1-total_avif/total_orig):.0f}%)')

    print('\n=== HERO ===')
    desk, mob = process_hero()
    print(f'  hero.avif: {desk[0]}x{desk[1]}, {os.path.getsize("hero.avif")//1024}KB')
    print(f'  hero-mobile.avif: {mob[0]}x{mob[1]}, {os.path.getsize("hero-mobile.avif")//1024}KB')

    print('\n=== OG IMAGE ===')
    s = process_og()
    print(f'  og-image.png: {s[0]}x{s[1]}, {os.path.getsize("og-image.png")//1024}KB')
    print(f'  og-image.jpg: {os.path.getsize("og-image.jpg")//1024}KB')
