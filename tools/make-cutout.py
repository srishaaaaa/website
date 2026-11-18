"""Turns a model photograph into the soft-edged transparent cut-out used by the homepage hero.

Usage (one-off setup):  python -m venv .cutvenv && .cutvenv/Scripts/pip install "rembg[cpu]" pillow scipy
Then:                   .cutvenv/Scripts/python tools/make-cutout.py path/to/photo.jpg

Writes client/public/images/hero-cutout.png and .webp. The first run downloads an open-source
segmentation model (~170 MB) once. Inspect the result on a cream background before shipping it.
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter
from rembg import new_session, remove
from scipy import ndimage as ndi

src = Path(sys.argv[1])
out_dir = Path(__file__).resolve().parent.parent / 'client' / 'public' / 'images'
img = Image.open(src).convert('RGB')
cut = remove(img, session=new_session('isnet-general-use'), alpha_matting=True,
             alpha_matting_foreground_threshold=240, alpha_matting_background_threshold=15, alpha_matting_erode_size=8)
r, g, b, a = cut.split()
a = a.filter(ImageFilter.MinFilter(3))                              # drop wall-coloured fringe pixels
arr = np.array(a)
lab, n = ndi.label(arr > 128)
keep = lab == (1 + int(np.argmax(ndi.sum(arr > 128, lab, range(1, n + 1)))))   # largest piece = the subject
keep = np.array(Image.fromarray((ndi.binary_dilation(keep, iterations=5) * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(2))) / 255.0
a = Image.fromarray((arr * keep).astype('uint8')).filter(ImageFilter.GaussianBlur(1.2))   # soften edges
a = a.point(lambda v: 0 if v < 8 else min(255, int(v * 1.05)))
res = Image.merge('RGBA', (r, g, b, a))
bb = a.point(lambda v: 255 if v > 40 else 0).getbbox(); pad = 8
res = res.crop((max(0, bb[0] - pad), max(0, bb[1] - pad), min(res.width, bb[2] + pad), min(res.height, bb[3] + pad)))
res.save(out_dir / 'hero-cutout.png', optimize=True)
res.save(out_dir / 'hero-cutout.webp', quality=92, method=6)
print('saved', res.size, 'to', out_dir)
